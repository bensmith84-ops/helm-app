
// /gmail-scan — port of supabase/functions/gmail-scan
// GET and POST. Actions: auth_url, callback (HTML response), list_connections, scan.
// Uses supabase-storage wrapper for attachments. Self-calls /invoice-ai for extraction.
const { uploadToStorage } = require('../lib/supabase-storage');

const ORG_ID = 'a0000000-0000-0000-0000-000000000001';
const BEN_ID = '32cad5dd-9e94-4095-a16d-b4521391b050';
// NOTE: redirect_uri still goes through Supabase fn during transition
const REDIRECT_URI = process.env.OAUTH_REDIRECT_GMAIL
  || (process.env.OAUTH_REDIRECT_BASE ? `${process.env.OAUTH_REDIRECT_BASE}/gmail-scan?action=callback` : null)
  || 'https://upbjdmnykheubxkuknuj.supabase.co/functions/v1/gmail-scan?action=callback';

async function refreshAccessToken(pool, conn) {
  if (!conn.refresh_token) throw new Error('No refresh token');
  const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
  const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID, client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: conn.refresh_token, grant_type: 'refresh_token',
    }),
  });
  if (!r.ok) throw new Error(`Token refresh failed: ${r.status}`);
  const t = await r.json();
  await pool.query(
    `UPDATE gmail_connections SET access_token = $1, token_expires_at = $2 WHERE id = $3`,
    [t.access_token, new Date(Date.now() + (t.expires_in || 3600) * 1000).toISOString(), conn.id]
  );
  return t.access_token;
}

module.exports = function(app, { pool }) {
  // GET for OAuth callback (Google redirects with code in query string)
  app.get('/gmail-scan', async (req, res) => {
    if (req.query.action !== 'callback') {
      return res.json({ error: 'Use POST for non-callback actions' });
    }
    const code = req.query.code;
    if (!code) return res.status(400).json({ error: 'No code provided' });

    try {
      const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
      const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code: String(code),
          client_id: GOOGLE_CLIENT_ID,
          client_secret: GOOGLE_CLIENT_SECRET,
          redirect_uri: REDIRECT_URI,
          grant_type: 'authorization_code',
        }),
      });
      if (!tokenRes.ok) {
        const err = await tokenRes.text();
        return res.status(400).type('html').send(`<html><body><h2>OAuth Error</h2><pre>${err}</pre></body></html>`);
      }
      const tokens = await tokenRes.json();
      const profileRes = await fetch('https://www.googleapis.com/gmail/v1/users/me/profile', {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      const profile = profileRes.ok ? await profileRes.json() : { emailAddress: 'unknown' };

      await pool.query(
        `INSERT INTO gmail_connections
          (org_id, email, access_token, refresh_token, token_expires_at, scopes, created_by, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, true)
         ON CONFLICT (org_id, email) DO UPDATE
         SET access_token = EXCLUDED.access_token,
             refresh_token = EXCLUDED.refresh_token,
             token_expires_at = EXCLUDED.token_expires_at,
             scopes = EXCLUDED.scopes,
             is_active = true`,
        [ORG_ID, profile.emailAddress, tokens.access_token, tokens.refresh_token,
         new Date(Date.now() + (tokens.expires_in || 3600) * 1000).toISOString(),
         tokens.scope || 'gmail.readonly', BEN_ID]
      );

      res.type('html').send(`<html><head><script>window.close(); window.opener && window.opener.postMessage({type:'gmail_connected',email:'${profile.emailAddress}'},'*');</script></head><body><h2>Connected: ${profile.emailAddress}</h2><p>You can close this window and return to Helm.</p></body></html>`);
    } catch (e) {
      res.status(500).type('html').send(`<html><body><h2>Error</h2><pre>${e?.message}</pre></body></html>`);
    }
  });

  app.post('/gmail-scan', async (req, res) => {
    try {
      const body = req.body || {};
      const { action } = body;
      const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';

      if (action === 'auth_url') {
        const scopes = 'https://www.googleapis.com/auth/gmail.readonly';
        const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${GOOGLE_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=${encodeURIComponent(scopes)}&access_type=offline&prompt=consent`;
        return res.json({ auth_url: url, redirect_uri: REDIRECT_URI });
      }

      if (action === 'list_connections') {
        const { rows } = await pool.query(
          `SELECT id, email, label, last_scanned_at, is_active FROM gmail_connections WHERE org_id = $1`,
          [ORG_ID]
        );
        return res.json({ connections: rows });
      }

      if (action === 'scan') {
        const { connection_id, max_results } = body;

        let q = `SELECT * FROM gmail_connections WHERE org_id = $1 AND is_active = true`;
        const params = [ORG_ID];
        if (connection_id) {
          q += ` AND id = $2`;
          params.push(connection_id);
        }
        q += ` LIMIT 1`;

        const { rows: conns } = await pool.query(q, params);
        if (conns.length === 0) {
          return res.status(400).json({ error: 'No Gmail connection found. Connect ap@earthbreeze.com first.' });
        }
        const conn = conns[0];

        let token = conn.access_token;
        if (Date.now() > new Date(conn.token_expires_at).getTime() - 60000) {
          token = await refreshAccessToken(pool, conn);
        }

        const searchQuery = 'has:attachment (subject:invoice OR subject:bill OR subject:payment OR subject:statement OR subject:receipt OR filename:pdf) newer_than:30d';
        const searchRes = await fetch(
          `https://www.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(searchQuery)}&maxResults=${max_results || 20}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!searchRes.ok) {
          const err = await searchRes.text();
          return res.json({ error: `Gmail API error: ${err.slice(0, 200)}` });
        }
        const searchData = await searchRes.json();
        const messageIds = (searchData.messages || []).map(m => m.id);

        if (messageIds.length === 0) {
          await pool.query(
            `UPDATE gmail_connections SET last_scanned_at = NOW() WHERE id = $1`, [conn.id]
          );
          return res.json({ imported: 0, skipped: 0, message: 'No invoice emails found in the last 30 days' });
        }

        const { rows: existing } = await pool.query(
          `SELECT gmail_message_id FROM gmail_imported_messages
           WHERE gmail_connection_id = $1 AND gmail_message_id = ANY($2::text[])`,
          [conn.id, messageIds]
        );
        const existingIds = new Set(existing.map(e => e.gmail_message_id));

        let imported = 0, skipped = 0, errors = 0;

        for (const msgId of messageIds) {
          if (existingIds.has(msgId)) { skipped++; continue; }

          try {
            const msgRes = await fetch(
              `https://www.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=full`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (!msgRes.ok) { errors++; continue; }
            const msg = await msgRes.json();

            const headers = msg.payload?.headers || [];
            const from = headers.find(h => h.name === 'From')?.value || 'unknown';
            const subject = headers.find(h => h.name === 'Subject')?.value || 'No subject';
            const date = headers.find(h => h.name === 'Date')?.value || '';

            const attachments = [];
            function findAttachments(part) {
              if (part.filename && part.body?.attachmentId) {
                const mime = part.mimeType || '';
                if (mime.includes('pdf') || mime.includes('image')) {
                  attachments.push({ filename: part.filename, mimeType: mime, attachmentId: part.body.attachmentId, size: part.body.size });
                }
              }
              if (part.parts) part.parts.forEach(findAttachments);
            }
            findAttachments(msg.payload);

            if (attachments.length === 0) {
              await pool.query(
                `INSERT INTO gmail_imported_messages (gmail_connection_id, gmail_message_id)
                 VALUES ($1, $2) ON CONFLICT (gmail_connection_id, gmail_message_id) DO NOTHING`,
                [conn.id, msgId]
              );
              skipped++;
              continue;
            }

            const att = attachments[0];
            const attRes = await fetch(
              `https://www.googleapis.com/gmail/v1/users/me/messages/${msgId}/attachments/${att.attachmentId}`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            if (!attRes.ok) { errors++; continue; }
            const attData = await attRes.json();

            // base64url → standard base64 → buffer
            const b64 = (attData.data || '').replace(/-/g, '+').replace(/_/g, '/');
            const buffer = Buffer.from(b64, 'base64');

            const safeName = att.filename.replace(/[^a-zA-Z0-9._-]/g, '_');
            const storagePath = `inbound/gmail_${Date.now()}_${safeName}`;
            let fileUrl = null;
            try {
              const result = await uploadToStorage('bill-attachments', storagePath, buffer, att.mimeType);
              fileUrl = result.public_url;
            } catch (e) {
              console.error('[gmail-scan] storage upload:', e?.message);
            }

            const { rows: invRows } = await pool.query(
              `INSERT INTO invoice_inbox
                (org_id, file_name, file_url, file_content_type, file_size, source,
                 status, memo, error_message)
               VALUES ($1, $2, $3, $4, $5, 'email', $6, $7, $8)
               RETURNING id`,
              [ORG_ID, att.filename, fileUrl, att.mimeType, buffer.length,
               fileUrl ? 'pending' : 'error',
               `From: ${from}\nSubject: ${subject}\nDate: ${date}`,
               fileUrl ? null : 'Failed to upload attachment']
            );
            const inbox = invRows[0];

            if (inbox) {
              await pool.query(
                `INSERT INTO gmail_imported_messages (gmail_connection_id, gmail_message_id, inbox_item_id)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (gmail_connection_id, gmail_message_id) DO UPDATE
                 SET inbox_item_id = EXCLUDED.inbox_item_id`,
                [conn.id, msgId, inbox.id]
              );

              if (fileUrl) {
                const selfUrl = process.env.SELF_URL || 'http://localhost:8080';
                try {
                  await fetch(`${selfUrl}/invoice-ai`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'extract', inbox_id: inbox.id }),
                  });
                } catch {}
              }
              imported++;
            }
          } catch (e) {
            console.error(`[gmail-scan] msg ${msgId}:`, e?.message);
            errors++;
          }
        }

        await pool.query(`UPDATE gmail_connections SET last_scanned_at = NOW() WHERE id = $1`, [conn.id]);

        if (imported > 0) {
          await pool.query(
            `INSERT INTO notifications
              (org_id, user_id, type, title, body, entity_type, category, link)
             VALUES ($1, $2, 'gmail_scan_complete', $3, $4, 'invoice_inbox', 'finance', '/finance/ap-ar')`,
            [ORG_ID, BEN_ID,
             `Gmail scan: ${imported} invoices imported`,
             `Scanned ${conn.email} — ${imported} new invoices imported, ${skipped} already imported`]
          );
        }

        return res.json({
          imported, skipped, errors,
          total_found: messageIds.length, email: conn.email,
        });
      }

      return res.status(400).json({ error: 'Unknown action. Use: auth_url, scan, list_connections' });
    } catch (e) {
      console.error('[gmail-scan]', e?.message);
      res.status(500).json({ error: e?.message || String(e) });
    }
  });
};
