
// POST /qbo-push — port of supabase/functions/qbo-push
// 2 actions: create_bill (from approved invoice_inbox row), update_bill_memo.
const { getQboBase, getActiveConnection, ensureToken } = require('../lib/qbo');

module.exports = function(app, { pool }) {
  app.post('/qbo-push', async (req, res) => {
    try {
      const body = req.body || {};
      const { action } = body;

      const conn = await getActiveConnection(pool);
      if (!conn) return res.status(400).json({ error: 'QBO not connected' });

      const rid = conn.realm_id;
      const token = await ensureToken(pool, conn);
      const base = getQboBase();

      if (action === 'create_bill') {
        const { inbox_id } = body;
        if (!inbox_id) return res.status(400).json({ error: 'inbox_id required' });

        const { rows: invRows } = await pool.query(
          `SELECT * FROM invoice_inbox WHERE id = $1 LIMIT 1`, [inbox_id]
        );
        const inv = invRows[0];
        if (!inv) return res.status(404).json({ error: 'Invoice not found' });
        if (inv.status !== 'approved') return res.status(400).json({ error: 'Invoice must be approved first' });

        // Vendor lookup
        let vendorRef = inv.matched_vendor_ref;
        if (!vendorRef && inv.vendor_name) {
          const { rows: vRows } = await pool.query(
            `SELECT qbo_id FROM qbo_vendors WHERE display_name ILIKE $1 LIMIT 1`,
            [`%${inv.vendor_name}%`]
          );
          if (vRows[0]) vendorRef = vRows[0].qbo_id;
        }
        if (!vendorRef) {
          return res.status(400).json({ error: `Vendor '${inv.vendor_name}' not found in QBO. Please match manually.` });
        }

        // GL account lookup
        let accountRef = null;
        if (inv.gl_account) {
          const { rows: aRows } = await pool.query(
            `SELECT qbo_id, name FROM qbo_accounts WHERE name ILIKE $1 LIMIT 1`,
            [`%${inv.gl_account}%`]
          );
          if (aRows[0]) accountRef = { value: aRows[0].qbo_id, name: aRows[0].name };
        }

        // Build QBO Line array
        const lineItems = inv.line_items
          ? (typeof inv.line_items === 'string' ? JSON.parse(inv.line_items) : inv.line_items)
          : [];
        const qboLines = lineItems.length > 0
          ? lineItems.map(li => {
              const line = {
                DetailType: 'AccountBasedExpenseLineDetail',
                Amount: Number(li.amount) || 0,
                Description: li.description || '',
                AccountBasedExpenseLineDetail: {},
              };
              if (accountRef) line.AccountBasedExpenseLineDetail.AccountRef = accountRef;
              return line;
            })
          : [{
              DetailType: 'AccountBasedExpenseLineDetail',
              Amount: Number(inv.total_amount) || 0,
              Description: inv.memo || '',
              AccountBasedExpenseLineDetail: accountRef ? { AccountRef: accountRef } : {},
            }];

        const billPayload = {
          VendorRef: { value: vendorRef },
          TxnDate: inv.invoice_date || new Date().toISOString().slice(0, 10),
          DueDate: inv.due_date,
          PrivateNote: inv.memo || 'Imported from Helm Invoice Inbox',
          Line: qboLines,
        };

        const r = await fetch(`${base}/v3/company/${rid}/bill?minorversion=65`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(billPayload),
        });

        if (!r.ok) {
          const errText = await r.text();
          console.error('[qbo-push] QBO error:', errText.slice(0, 500));
          return res.json({ error: `QBO API ${r.status}: ${errText.slice(0, 200)}` });
        }

        const result = await r.json();
        const qboBill = result.Bill;

        if (qboBill) {
          await pool.query(
            `INSERT INTO qbo_bills
              (realm_id, qbo_id, vendor_ref, vendor_name, txn_date, due_date,
               total_amount, balance, currency, memo, payment_status, gl_accounts, synced_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'USD', $9, $10, $11, NOW())
             ON CONFLICT (realm_id, qbo_id) DO UPDATE
             SET vendor_ref = EXCLUDED.vendor_ref, vendor_name = EXCLUDED.vendor_name,
                 txn_date = EXCLUDED.txn_date, due_date = EXCLUDED.due_date,
                 total_amount = EXCLUDED.total_amount, balance = EXCLUDED.balance,
                 memo = EXCLUDED.memo, payment_status = EXCLUDED.payment_status,
                 gl_accounts = EXCLUDED.gl_accounts, synced_at = NOW()`,
            [rid, String(qboBill.Id), vendorRef, inv.vendor_name,
             qboBill.TxnDate, qboBill.DueDate,
             Number(qboBill.TotalAmt) || 0, Number(qboBill.Balance) || 0,
             qboBill.PrivateNote,
             Number(qboBill.Balance) === 0 ? 'paid' : 'open',
             inv.gl_account]
          );

          await pool.query(
            `UPDATE invoice_inbox SET status = 'synced_to_qbo', matched_bill_id = $1, updated_at = NOW() WHERE id = $2`,
            [qboBill.Id, inbox_id]
          );
        }

        return res.json({ success: true, qbo_bill_id: qboBill?.Id, inbox_id });
      }

      if (action === 'update_bill_memo') {
        const { qbo_id, memo } = body;
        if (!qbo_id) return res.status(400).json({ error: 'qbo_id required' });

        const getRes = await fetch(`${base}/v3/company/${rid}/bill/${qbo_id}?minorversion=65`, {
          headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
        });
        if (!getRes.ok) return res.json({ error: `Failed to fetch bill ${qbo_id}` });
        const current = await getRes.json();
        const bill = current.Bill;
        bill.PrivateNote = memo || bill.PrivateNote;

        const updateRes = await fetch(`${base}/v3/company/${rid}/bill?minorversion=65`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(bill),
        });
        if (!updateRes.ok) return res.json({ error: 'QBO update failed' });

        return res.json({ success: true, qbo_id });
      }

      return res.status(400).json({ error: 'Unknown action. Use: create_bill, update_bill_memo' });
    } catch (e) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });
};
