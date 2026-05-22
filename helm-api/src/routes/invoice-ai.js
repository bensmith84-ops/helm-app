
// POST /invoice-ai — port of supabase/functions/invoice-ai
// 7 actions: extract (Claude vision over PDF/image), approve_step, deny_step,
// approve, list, get_chain. Full AP workflow including vendor matching,
// duplicate detection, PO matching, and approval chain.
const Anthropic = require('@anthropic-ai/sdk');
const DEFAULT_ORG_ID = 'a0000000-0000-0000-0000-000000000001';

module.exports = function(app, { pool }) {
  app.post('/invoice-ai', async (req, res) => {
    try {
      const body = req.body || {};
      const { action } = body;
      const orgId = body.org_id || DEFAULT_ORG_ID;
      const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();

      // === EXTRACT ===
      if (action === 'extract') {
        const { inbox_id } = body;
        if (!inbox_id) return res.status(400).json({ error: 'inbox_id required' });

        const { rows: invRows } = await pool.query(
          `SELECT * FROM invoice_inbox WHERE id = $1 LIMIT 1`, [inbox_id]
        );
        const inv = invRows[0];
        if (!inv) return res.status(404).json({ error: 'Invoice not found' });

        await pool.query(`UPDATE invoice_inbox SET status = 'processing' WHERE id = $1`, [inbox_id]);

        const { rows: vendors } = await pool.query(
          `SELECT display_name, qbo_id FROM qbo_vendors LIMIT 200`
        );
        const vendorList = vendors.map(v => v.display_name).join(', ');

        const { rows: accounts } = await pool.query(
          `SELECT name, account_type FROM qbo_accounts WHERE active = true LIMIT 100`
        );
        const glList = accounts
          .filter(a => ['Expense', 'Cost of Goods Sold', 'Other Expense'].includes(a.account_type))
          .map(a => a.name).join(', ');

        const systemPrompt = `You are an expert AP invoice processor. Extract structured data from the invoice provided.
RETURN ONLY valid JSON:
{
  "vendor_name": "exact name",
  "invoice_number": "ref number",
  "invoice_date": "YYYY-MM-DD",
  "due_date": "YYYY-MM-DD",
  "total_amount": 0.00,
  "subtotal": 0.00,
  "tax_amount": 0.00,
  "currency": "USD",
  "payment_terms": "Net 30",
  "memo": "brief description",
  "line_items": [{ "description": "", "quantity": 1, "unit_price": 0.00, "amount": 0.00, "gl_account": "" }],
  "suggested_gl_account": "",
  "vendor_address": "",
  "vendor_email": "",
  "po_number": null,
  "confidence": 0.95
}
KNOWN VENDORS: ${vendorList}
GL ACCOUNTS: ${glList}
Rules: Only JSON, no backticks. YYYY-MM-DD dates. Numbers not strings. Match vendor to known list. null for missing fields.`;

        // Build content with file if available
        let content = [{ type: 'text', text: 'Extract all data from this invoice:' }];
        if (inv.file_url) {
          try {
            const fileRes = await fetch(inv.file_url);
            if (fileRes.ok) {
              const ab = await fileRes.arrayBuffer();
              const b64 = Buffer.from(ab).toString('base64');
              const mt = inv.file_content_type || 'application/pdf';
              if (mt.startsWith('image/')) {
                content = [
                  { type: 'image', source: { type: 'base64', media_type: mt, data: b64 } },
                  { type: 'text', text: 'Extract all data from this invoice image.' },
                ];
              } else if (mt === 'application/pdf') {
                content = [
                  { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
                  { type: 'text', text: 'Extract all data from this invoice PDF.' },
                ];
              }
            }
          } catch (e) {
            console.error('[invoice-ai] File fetch:', e?.message);
          }
        }

        const client = new Anthropic({ apiKey });
        let aiResult;
        try {
          aiResult = await client.messages.create({
            model: 'claude-sonnet-4-20250514', max_tokens: 2000,
            system: systemPrompt,
            messages: [{ role: 'user', content }],
          });
        } catch (err) {
          await pool.query(
            `UPDATE invoice_inbox SET status = 'error', error_message = $1 WHERE id = $2`,
            [`Claude error: ${err?.message || String(err)}`, inbox_id]
          );
          return res.json({ error: `Claude API: ${err?.message || String(err)}` });
        }

        const rawText = (aiResult.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
        let extracted = {};
        try {
          extracted = JSON.parse(rawText.replace(/```json\n?|```\n?/g, '').trim());
        } catch {
          await pool.query(
            `UPDATE invoice_inbox SET status = 'error', error_message = 'Parse failed',
                                       extracted_data = $1 WHERE id = $2`,
            [JSON.stringify({ raw: rawText }), inbox_id]
          );
          return res.json({ error: 'Parse failed', raw: rawText });
        }

        // Vendor matching
        let matchedVendorRef = null;
        if (extracted.vendor_name) {
          const match = vendors.find(v => v.display_name?.toLowerCase() === extracted.vendor_name?.toLowerCase());
          if (match) matchedVendorRef = match.qbo_id;
        }

        // Duplicate detection
        let duplicateOf = null;
        let duplicateDetails = null;
        if (extracted.vendor_name && extracted.total_amount) {
          const { rows: dups } = await pool.query(
            `SELECT id, invoice_number, total_amount, vendor_name FROM invoice_inbox
             WHERE vendor_name = $1 AND id != $2 LIMIT 5`,
            [extracted.vendor_name, inbox_id]
          );
          const dup = dups.find(d => {
            if (extracted.invoice_number && d.invoice_number === extracted.invoice_number) return true;
            if (Math.abs(Number(d.total_amount) - Number(extracted.total_amount)) < 0.01) return true;
            return false;
          });
          if (dup) {
            duplicateOf = dup.id;
            duplicateDetails = { type: 'inbox', ...dup };
          }

          if (!duplicateOf) {
            const { rows: qboDups } = await pool.query(
              `SELECT id, vendor_name, total_amount, memo FROM qbo_bills
               WHERE vendor_name = $1 LIMIT 10`,
              [extracted.vendor_name]
            );
            const qDup = qboDups.find(d => Math.abs(Number(d.total_amount) - Number(extracted.total_amount)) < 0.01);
            if (qDup) duplicateDetails = { type: 'qbo_bill', ...qDup };
          }
        }

        // PO matching
        if (extracted.po_number) {
          const { rows: pos } = await pool.query(
            `SELECT id, po_number, total, supplier_id FROM erp_purchase_orders
             WHERE po_number ILIKE $1 LIMIT 1`,
            [`%${extracted.po_number}%`]
          );
          if (pos[0]) {
            const variance = Number(extracted.total_amount) - Number(pos[0].total);
            extracted.po_match = {
              po_id: pos[0].id, po_number: pos[0].po_number, po_total: pos[0].total,
              variance,
              match: Math.abs(variance) < 1 ? 'exact'
                   : Math.abs(variance) / Number(pos[0].total) < 0.05 ? 'close'
                   : 'mismatch',
            };
          }
        }

        // Find matching approval rule
        const { rows: rules } = await pool.query(
          `SELECT * FROM ap_approval_rules
           WHERE org_id = $1 AND is_active = true ORDER BY priority DESC`,
          [orgId]
        );
        let matchedRule = null;
        for (const rule of rules) {
          let matches = true;
          if (rule.min_amount && Number(extracted.total_amount) < Number(rule.min_amount)) matches = false;
          if (rule.max_amount && Number(extracted.total_amount) > Number(rule.max_amount)) matches = false;
          if (rule.vendor_names?.length > 0 && !rule.vendor_names.some(v => v.toLowerCase() === extracted.vendor_name?.toLowerCase())) matches = false;
          if (rule.gl_accounts?.length > 0 && !rule.gl_accounts.some(g => g.toLowerCase() === extracted.suggested_gl_account?.toLowerCase())) matches = false;
          if (matches) { matchedRule = rule; break; }
        }

        // Create approval chain if rule matched
        if (matchedRule && matchedRule.approvers?.length > 0) {
          extracted.approval_rule = {
            id: matchedRule.id, name: matchedRule.name,
            approvers: matchedRule.approvers, require_all: matchedRule.require_all,
          };

          // Insert chain rows in one batch
          const chainValues = [];
          const chainParams = [];
          let pi = 1;
          for (let i = 0; i < matchedRule.approvers.length; i++) {
            chainValues.push(`($${pi++}, $${pi++}, $${pi++}, $${pi++}, $${pi++})`);
            chainParams.push(inbox_id, matchedRule.id, matchedRule.approvers[i], i, i === 0 ? 'pending' : 'waiting');
          }
          await pool.query(
            `INSERT INTO ap_approval_chain (bill_id, rule_id, approver_id, step_order, status)
             VALUES ${chainValues.join(', ')}`,
            chainParams
          );

          // Notify first approver
          await pool.query(
            `INSERT INTO notifications (org_id, user_id, type, title, body, entity_type, entity_id, category, link)
             VALUES ($1, $2, 'approval_request', $3, $4, 'invoice_inbox', $5, 'finance', '/finance/ap-ar')`,
            [orgId, matchedRule.approvers[0],
             `Invoice needs approval: ${extracted.vendor_name}`,
             `$${Number(extracted.total_amount).toLocaleString()} from ${extracted.vendor_name}. Rule: ${matchedRule.name}`,
             inbox_id]
          );
        }

        await pool.query(
          `UPDATE invoice_inbox SET
            status = $1, vendor_name = $2, invoice_number = $3,
            invoice_date = $4, due_date = $5, total_amount = $6, currency = $7,
            line_items = $8, gl_account = $9, memo = $10,
            extracted_data = $11, matched_vendor_ref = $12, duplicate_of = $13,
            updated_at = NOW()
           WHERE id = $14`,
          [duplicateOf ? 'duplicate' : 'extracted',
           extracted.vendor_name, extracted.invoice_number,
           extracted.invoice_date, extracted.due_date,
           extracted.total_amount, extracted.currency || 'USD',
           extracted.line_items ? JSON.stringify(extracted.line_items) : null,
           extracted.suggested_gl_account, extracted.memo,
           JSON.stringify(extracted), matchedVendorRef, duplicateOf, inbox_id]
        );

        return res.json({
          success: true, inbox_id, extracted,
          vendor_matched: !!matchedVendorRef,
          is_duplicate: !!duplicateOf, duplicate_of: duplicateOf,
          duplicate_details: duplicateDetails,
          po_match: extracted.po_match || null,
          approval_rule: extracted.approval_rule || null,
          confidence: extracted.confidence, usage: aiResult.usage,
        });
      }

      // === APPROVE_STEP ===
      if (action === 'approve_step') {
        const { chain_id, user_id, notes: approvalNotes } = body;
        if (!chain_id) return res.status(400).json({ error: 'chain_id required' });

        const { rows: sRows } = await pool.query(
          `SELECT * FROM ap_approval_chain WHERE id = $1 LIMIT 1`, [chain_id]
        );
        const step = sRows[0];
        if (!step) return res.status(404).json({ error: 'Chain step not found' });

        await pool.query(
          `UPDATE ap_approval_chain SET status = 'approved', approved_at = NOW(), notes = $1
           WHERE id = $2`,
          [approvalNotes, chain_id]
        );

        const { rows: nextRows } = await pool.query(
          `SELECT * FROM ap_approval_chain WHERE bill_id = $1 AND step_order = $2 LIMIT 1`,
          [step.bill_id, step.step_order + 1]
        );
        const nextStep = nextRows[0];

        if (nextStep) {
          await pool.query(
            `UPDATE ap_approval_chain SET status = 'pending' WHERE id = $1`,
            [nextStep.id]
          );
          await pool.query(
            `INSERT INTO notifications
              (org_id, user_id, type, title, body, entity_type, entity_id, category, link)
             VALUES ($1, $2, 'approval_request', 'Invoice ready for your approval',
                     'Previous approver approved. Your turn to review.',
                     'invoice_inbox', $3, 'finance', '/finance/ap-ar')`,
            [orgId, nextStep.approver_id, step.bill_id]
          );
        } else {
          await pool.query(
            `UPDATE invoice_inbox SET status = 'approved', processed_at = NOW() WHERE id = $1`,
            [step.bill_id]
          );
        }

        return res.json({
          success: true, chain_id,
          next_step: nextStep?.id || null, fully_approved: !nextStep,
        });
      }

      // === DENY_STEP ===
      if (action === 'deny_step') {
        const { chain_id, notes: denyNotes } = body;
        await pool.query(
          `UPDATE ap_approval_chain SET status = 'denied', notes = $1, approved_at = NOW()
           WHERE id = $2`,
          [denyNotes, chain_id]
        );
        const { rows } = await pool.query(
          `SELECT bill_id FROM ap_approval_chain WHERE id = $1 LIMIT 1`, [chain_id]
        );
        if (rows[0]) {
          await pool.query(`UPDATE invoice_inbox SET status = 'denied' WHERE id = $1`, [rows[0].bill_id]);
        }
        return res.json({ success: true });
      }

      // === APPROVE (simple) ===
      if (action === 'approve') {
        const { inbox_id, overrides, user_id } = body;
        if (!inbox_id) return res.status(400).json({ error: 'inbox_id required' });
        const { rows } = await pool.query(`SELECT * FROM invoice_inbox WHERE id = $1 LIMIT 1`, [inbox_id]);
        const inv = rows[0];
        if (!inv) return res.status(404).json({ error: 'Not found' });
        const final = { ...inv, ...(overrides || {}) };
        await pool.query(
          `UPDATE invoice_inbox SET
            status = 'approved', vendor_name = $1, total_amount = $2,
            due_date = $3, gl_account = $4, processed_by = $5, processed_at = NOW()
           WHERE id = $6`,
          [final.vendor_name, final.total_amount, final.due_date, final.gl_account, user_id, inbox_id]
        );
        return res.json({ success: true, inbox_id, status: 'approved' });
      }

      // === LIST ===
      if (action === 'list') {
        const { status: filterStatus, limit: lim } = body;
        let q = `SELECT * FROM invoice_inbox WHERE org_id = $1`;
        const params = [orgId];
        if (filterStatus) {
          q += ` AND status = $2`;
          params.push(filterStatus);
        }
        q += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
        params.push(lim || 50);
        const { rows } = await pool.query(q, params);
        return res.json({ items: rows });
      }

      // === GET_CHAIN ===
      if (action === 'get_chain') {
        const { inbox_id } = body;
        const { rows } = await pool.query(
          `SELECT ap.*, p.display_name AS approver_name, p.email AS approver_email
           FROM ap_approval_chain ap
           LEFT JOIN profiles p ON p.id = ap.approver_id
           WHERE ap.bill_id = $1 ORDER BY ap.step_order`,
          [inbox_id]
        );
        return res.json({ chain: rows });
      }

      return res.status(400).json({ error: 'Unknown action' });
    } catch (e) {
      console.error('[invoice-ai]', e?.message);
      res.status(500).json({ error: e?.message || String(e) });
    }
  });
};
