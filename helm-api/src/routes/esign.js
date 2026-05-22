
// POST /esign — port of supabase/functions/esign
// 7 actions: send, access, sign, decline, void, audit, remind.
// RESEND_API_KEY from env (was hardcoded in original).
// Self-calls /esign-pdf via SELF_URL on completion.
const crypto = require('crypto');
const { uploadToStorage } = require('../lib/supabase-storage');

const RESEND_KEY = process.env.RESEND_API_KEY || '';
const SELF_URL = process.env.SELF_URL || 'http://localhost:8080';

async function sendEmail(to, subject, html) {
  if (!RESEND_KEY) return false;
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Helm E-Sign <onboarding@resend.dev>',
        to: [to], subject, html,
      }),
    });
    return r.ok;
  } catch { return false; }
}

function signingEmailHtml(signerName, docTitle, message, signingLink, senderName) {
  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:0 auto;padding:40px 20px"><div style="text-align:center;margin-bottom:32px"><div style="display:inline-block;width:40px;height:40px;border-radius:10px;background:linear-gradient(135deg,#6366f1,#a855f7);color:#fff;font-size:18px;font-weight:900;line-height:40px">H</div><div style="font-size:14px;font-weight:700;color:#1a1a2e;margin-top:8px">Helm E-Sign</div></div><div style="background:#fff;border:1px solid #e2e3e8;border-radius:14px;padding:32px;margin-bottom:24px"><p style="font-size:16px;color:#1a1a2e;margin:0 0 8px">Hi ${signerName},</p><p style="font-size:14px;color:#4a4a5e;line-height:1.6;margin:0 0 16px">${senderName} has sent you a document to sign:</p><div style="background:#f8f9fc;border-radius:10px;padding:16px;margin-bottom:20px"><div style="font-size:18px;font-weight:700;color:#1a1a2e">${docTitle}</div>${message ? `<p style="font-size:13px;color:#6b7280;margin:8px 0 0">${message}</p>` : ''}</div><a href="${signingLink}" style="display:inline-block;padding:14px 40px;background:#6366f1;color:#fff;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px">Review & Sign Document</a></div><p style="font-size:11px;color:#8a8a9e;text-align:center;line-height:1.6">Sent via Helm E-Sign. Legally binding under ESIGN Act and UETA.</p></div>`;
}
function completionEmailHtml(n, t, d) { return `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:40px 20px;text-align:center"><div style="font-size:48px;margin-bottom:12px">\u2705</div><h2 style="font-size:20px;font-weight:800;color:#1a1a2e">Document Completed</h2><p style="font-size:14px;color:#4a4a5e">All parties have signed <strong>${t}</strong>.</p><p style="font-size:12px;color:#8a8a9e">Completed on ${d}</p></div>`; }
function reminderEmailHtml(n, t, l) { return `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:40px 20px"><p style="font-size:16px;color:#1a1a2e">Hi ${n},</p><p style="font-size:14px;color:#4a4a5e;line-height:1.6">Friendly reminder: <strong>${t}</strong> is waiting for your signature.</p><a href="${l}" style="display:inline-block;margin-top:16px;padding:14px 40px;background:#6366f1;color:#fff;font-size:15px;font-weight:700;text-decoration:none;border-radius:10px">Review & Sign</a></div>`; }

module.exports = function(app, { pool }) {
  app.post('/esign', async (req, res) => {
    try {
      const body = req.body || {};
      const { action } = body;
      const ip = req.headers['x-forwarded-for'] || req.headers['cf-connecting-ip'] || 'unknown';
      const ua = req.headers['user-agent'] || 'unknown';

      if (action === 'send') {
        const { envelope_id } = body;
        const { rows: envRows } = await pool.query(`SELECT * FROM esign_envelopes WHERE id = $1 LIMIT 1`, [envelope_id]);
        const envelope = envRows[0];
        if (!envelope) return res.status(404).json({ error: 'Envelope not found' });

        const { rows: signers } = await pool.query(
          `SELECT * FROM esign_signers WHERE envelope_id = $1 ORDER BY signing_order`, [envelope_id]
        );
        if (!signers.length) return res.status(400).json({ error: 'No signers' });

        if (envelope.document_url) {
          try {
            const docResp = await fetch(envelope.document_url);
            const docBuffer = await docResp.arrayBuffer();
            const hashHex = crypto.createHash('sha256').update(Buffer.from(docBuffer)).digest('hex');
            await pool.query(
              `UPDATE esign_envelopes SET document_hash = $1 WHERE id = $2`,
              [hashHex, envelope_id]
            );
            await pool.query(
              `INSERT INTO esign_audit_log (envelope_id, org_id, action, details, ip_address, user_agent)
               VALUES ($1, $2, 'document_hashed', $3, $4, $5)`,
              [envelope_id, envelope.org_id, `SHA-256: ${hashHex}`, ip, ua]
            );
          } catch (e) { console.error('[esign] hash error:', e?.message); }
        }

        const { rows: creatorRows } = await pool.query(
          `SELECT display_name, email FROM profiles WHERE id = $1 LIMIT 1`, [envelope.created_by]
        );
        const senderName = creatorRows[0]?.display_name || creatorRows[0]?.email || 'Someone';
        const SIGNING_BASE = body.signing_base_url || 'https://helm-app-six.vercel.app/sign';
        const toNotify = envelope.signing_order === 'sequential' ? [signers[0]] : signers.filter(s => s.role !== 'cc');
        let emailsSent = 0;

        for (const signer of toNotify) {
          const signingLink = `${SIGNING_BASE}?token=${signer.access_token}`;
          await pool.query(
            `UPDATE esign_signers SET status = 'sent', access_token_expires_at = $1 WHERE id = $2`,
            [envelope.expiration_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
             signer.id]
          );
          const sent = await sendEmail(signer.email, `Please sign: ${envelope.title}`,
            signingEmailHtml(signer.name, envelope.title, envelope.message || '', signingLink, senderName));
          if (sent) emailsSent++;
          await pool.query(
            `INSERT INTO esign_audit_log
              (envelope_id, org_id, signer_id, action, actor_name, actor_email, details, ip_address, user_agent)
             VALUES ($1, $2, $3, 'sent', $4, $5, $6, $7, $8)`,
            [envelope_id, envelope.org_id, signer.id, signer.name, signer.email,
             `Sent to ${signer.name} (${signer.email}) ${sent ? '[EMAIL DELIVERED]' : '[EMAIL FAILED]'}`,
             ip, ua]
          );
        }

        await pool.query(`UPDATE esign_envelopes SET status = 'sent' WHERE id = $1`, [envelope_id]);
        await pool.query(
          `INSERT INTO esign_audit_log (envelope_id, org_id, action, details, ip_address, user_agent)
           VALUES ($1, $2, 'sent', $3, $4, $5)`,
          [envelope_id, envelope.org_id,
           `Envelope sent to ${toNotify.length} signer(s), ${emailsSent} emails`, ip, ua]
        );
        return res.json({ success: true, signers_notified: toNotify.length, emails_sent: emailsSent });
      }

      if (action === 'access') {
        const { token } = body;
        const { rows: sRows } = await pool.query(
          `SELECT s.*, row_to_json(e.*) AS envelope_json
           FROM esign_signers s
           LEFT JOIN esign_envelopes e ON e.id = s.envelope_id
           WHERE s.access_token = $1 LIMIT 1`,
          [token]
        );
        const signer = sRows[0];
        if (!signer) return res.status(404).json({ error: 'Invalid or expired link' });
        if (signer.access_token_expires_at && new Date(signer.access_token_expires_at) < new Date())
          return res.status(410).json({ error: 'This signing link has expired' });
        if (signer.status === 'signed')
          return res.json({ error: 'You have already signed this document', already_signed: true });
        const envelope = signer.envelope_json;
        if (envelope.status === 'voided') return res.status(410).json({ error: 'This document has been voided' });
        if (envelope.status === 'completed') return res.json({ error: 'This document has already been completed', completed: true });

        const { rows: fields } = await pool.query(
          `SELECT * FROM esign_fields WHERE signer_id = $1 ORDER BY page_number, y_pct`, [signer.id]
        );
        const { rows: allSigners } = await pool.query(
          `SELECT id, name, email, role, signing_order, status, signed_at
           FROM esign_signers WHERE envelope_id = $1 ORDER BY signing_order`, [envelope.id]
        );

        if (signer.status === 'sent' || signer.status === 'pending') {
          await pool.query(`UPDATE esign_signers SET status = 'opened' WHERE id = $1`, [signer.id]);
          await pool.query(`UPDATE esign_envelopes SET status = 'in_progress' WHERE id = $1`, [envelope.id]);
          await pool.query(
            `INSERT INTO esign_audit_log
              (envelope_id, org_id, signer_id, action, actor_name, actor_email, details, ip_address, user_agent)
             VALUES ($1, $2, $3, 'opened', $4, $5, $6, $7, $8)`,
            [envelope.id, envelope.org_id, signer.id, signer.name, signer.email,
             `Opened by ${signer.name}`, ip, ua]
          );
        }

        return res.json({
          signer: { id: signer.id, name: signer.name, email: signer.email, role: signer.role, status: signer.status },
          envelope: { id: envelope.id, title: envelope.title, message: envelope.message,
                      document_url: envelope.document_url, status: envelope.status },
          fields, signers: allSigners,
        });
      }

      if (action === 'sign') {
        const { token, signature_data, initials_data, field_values, signer_details, consent } = body;
        if (!consent) return res.status(400).json({ error: 'You must consent to sign electronically' });

        const { rows: sRows } = await pool.query(
          `SELECT s.*, row_to_json(e.*) AS envelope_json
           FROM esign_signers s
           LEFT JOIN esign_envelopes e ON e.id = s.envelope_id
           WHERE s.access_token = $1 LIMIT 1`, [token]
        );
        const signer = sRows[0];
        if (!signer) return res.status(404).json({ error: 'Invalid signing link' });
        if (signer.status === 'signed') return res.status(400).json({ error: 'Already signed' });
        const envelope = signer.envelope_json;

        await pool.query(
          `UPDATE esign_signers SET status = 'signed', signature_data = $1, initials_data = $2,
            signer_details = $3, signed_at = NOW(), consent_given = true, consent_timestamp = NOW(),
            ip_address = $4, user_agent = $5
           WHERE id = $6`,
          [JSON.stringify(signature_data || null), initials_data || null,
           JSON.stringify(signer_details || {}), ip, ua, signer.id]
        );

        if (field_values && typeof field_values === 'object') {
          for (const [fieldId, value] of Object.entries(field_values)) {
            if (!fieldId.startsWith('_')) {
              await pool.query(
                `UPDATE esign_fields SET value = $1, filled_at = NOW() WHERE id = $2`,
                [String(value), fieldId]
              );
            }
          }
        }

        const detailsSummary = signer_details
          ? ` | Company: ${signer_details.company || 'N/A'} | Title: ${signer_details.title || 'N/A'}` : '';

        await pool.query(
          `INSERT INTO esign_audit_log
            (envelope_id, org_id, signer_id, action, actor_name, actor_email, details, ip_address, user_agent)
           VALUES ($1, $2, $3, 'signed', $4, $5, $6, $7, $8)`,
          [envelope.id, envelope.org_id, signer.id,
           signer_details?.name || signer.name,
           signer_details?.email || signer.email,
           `Signed by ${signer_details?.name || signer.name}${detailsSummary}`, ip, ua]
        );

        if (signer_details?.send_copy_to) {
          await sendEmail(signer_details.send_copy_to, `Copy: ${envelope.title}`,
            `<p>${signer_details.name || signer.name} requested a copy of <strong>${envelope.title}</strong>.</p>`);
        }

        const { rows: allSigners } = await pool.query(
          `SELECT * FROM esign_signers WHERE envelope_id = $1 AND role != 'cc'`, [envelope.id]
        );
        const allSigned = allSigners.every(s => s.status === 'signed' || s.id === signer.id);

        if (allSigned) {
          await pool.query(
            `UPDATE esign_envelopes SET status = 'completed', completed_at = NOW() WHERE id = $1`,
            [envelope.id]
          );
          await pool.query(
            `INSERT INTO esign_audit_log (envelope_id, org_id, action, details, ip_address, user_agent)
             VALUES ($1, $2, 'completed', 'All signers have signed.', $3, $4)`,
            [envelope.id, envelope.org_id, ip, ua]
          );
          // Fire-and-forget PDF generation
          fetch(`${SELF_URL}/esign-pdf`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ envelope_id: envelope.id }),
          }).catch(e => console.error('[esign] PDF gen fire-and-forget:', e?.message));
          await pool.query(
            `INSERT INTO esign_audit_log (envelope_id, org_id, action, details, ip_address, user_agent)
             VALUES ($1, $2, 'pdf_generating', 'Completed PDF generation triggered', $3, $4)`,
            [envelope.id, envelope.org_id, ip, ua]
          );

          const completedAt = new Date().toLocaleDateString('en-US',
            { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
          for (const s of allSigners) {
            await sendEmail(s.email, `Completed: ${envelope.title}`,
              completionEmailHtml(s.name, envelope.title, completedAt));
          }
          const { rows: creatorRows } = await pool.query(
            `SELECT email, display_name FROM profiles WHERE id = $1 LIMIT 1`, [envelope.created_by]
          );
          if (creatorRows[0]?.email) {
            await sendEmail(creatorRows[0].email, `Completed: ${envelope.title}`,
              completionEmailHtml(creatorRows[0].display_name || 'there', envelope.title, completedAt));
          }
          return res.json({ success: true, envelope_completed: true });
        }

        if (envelope.signing_order === 'sequential') {
          const nextSigner = allSigners
            .filter(s => s.status !== 'signed' && s.id !== signer.id)
            .sort((a, b) => a.signing_order - b.signing_order)[0];
          if (nextSigner) {
            const SIGNING_BASE = body.signing_base_url || 'https://helm-app-six.vercel.app/sign';
            await pool.query(`UPDATE esign_signers SET status = 'sent' WHERE id = $1`, [nextSigner.id]);
            await sendEmail(nextSigner.email, `Please sign: ${envelope.title}`,
              signingEmailHtml(nextSigner.name, envelope.title, envelope.message || '',
                `${SIGNING_BASE}?token=${nextSigner.access_token}`, signer.name));
          }
        }
        return res.json({ success: true, envelope_completed: false });
      }

      if (action === 'decline') {
        const { token, reason } = body;
        const { rows: sRows } = await pool.query(
          `SELECT s.*, row_to_json(e.*) AS envelope_json
           FROM esign_signers s
           LEFT JOIN esign_envelopes e ON e.id = s.envelope_id
           WHERE s.access_token = $1 LIMIT 1`, [token]
        );
        const signer = sRows[0];
        if (!signer) return res.status(404).json({ error: 'Invalid link' });
        const envelope = signer.envelope_json;

        await pool.query(
          `UPDATE esign_signers
           SET status = 'declined', declined_at = NOW(), declined_reason = $1,
               ip_address = $2, user_agent = $3
           WHERE id = $4`,
          [reason || null, ip, ua, signer.id]
        );
        await pool.query(`UPDATE esign_envelopes SET status = 'declined' WHERE id = $1`, [envelope.id]);
        await pool.query(
          `INSERT INTO esign_audit_log
            (envelope_id, org_id, signer_id, action, actor_name, actor_email, details, ip_address, user_agent)
           VALUES ($1, $2, $3, 'declined', $4, $5, $6, $7, $8)`,
          [envelope.id, envelope.org_id, signer.id, signer.name, signer.email,
           `Declined by ${signer.name}. Reason: ${reason || 'None'}`, ip, ua]
        );
        return res.json({ success: true });
      }

      if (action === 'void') {
        const { envelope_id, reason, user_id } = body;
        await pool.query(
          `UPDATE esign_envelopes
           SET status = 'voided', voided_at = NOW(), voided_by = $1, voided_reason = $2
           WHERE id = $3`,
          [user_id, reason, envelope_id]
        );
        await pool.query(
          `INSERT INTO esign_audit_log (envelope_id, org_id, action, details, ip_address, user_agent)
           VALUES ($1, $2, 'voided', $3, $4, $5)`,
          [envelope_id, body.org_id, `Voided. Reason: ${reason || 'None'}`, ip, ua]
        );
        return res.json({ success: true });
      }

      if (action === 'audit') {
        const { envelope_id } = body;
        const { rows } = await pool.query(
          `SELECT * FROM esign_audit_log WHERE envelope_id = $1 ORDER BY timestamp`,
          [envelope_id]
        );
        return res.json({ audit_trail: rows });
      }

      if (action === 'remind') {
        const { envelope_id } = body;
        const { rows: envRows } = await pool.query(
          `SELECT title FROM esign_envelopes WHERE id = $1 LIMIT 1`, [envelope_id]
        );
        const { rows: signers } = await pool.query(
          `SELECT * FROM esign_signers WHERE envelope_id = $1 AND status IN ('sent','opened')`,
          [envelope_id]
        );
        const SIGNING_BASE = body.signing_base_url || 'https://helm-app-six.vercel.app/sign';
        let sent = 0;
        for (const signer of signers) {
          const emailSent = await sendEmail(signer.email,
            `Reminder: Please sign ${envRows[0]?.title}`,
            reminderEmailHtml(signer.name, envRows[0]?.title || 'Document',
              `${SIGNING_BASE}?token=${signer.access_token}`)
          );
          if (emailSent) sent++;
          await pool.query(
            `INSERT INTO esign_audit_log
              (envelope_id, org_id, signer_id, action, actor_name, actor_email, details, ip_address, user_agent)
             VALUES ($1, $2, $3, 'reminder_sent', $4, $5, $6, $7, $8)`,
            [envelope_id, body.org_id, signer.id, signer.name, signer.email,
             `Reminder to ${signer.name}${emailSent ? ' [delivered]' : ''}`, ip, ua]
          );
        }
        await pool.query(
          `UPDATE esign_envelopes SET last_reminder_at = NOW() WHERE id = $1`, [envelope_id]
        );
        return res.json({ success: true, reminders_sent: signers.length, emails_delivered: sent });
      }

      return res.status(400).json({ error: 'Unknown action' });
    } catch (e) {
      console.error('[esign] error:', e?.message);
      res.status(500).json({ error: e?.message || String(e) });
    }
  });
};
