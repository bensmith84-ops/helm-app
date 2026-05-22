
// POST /import-expenses — port of supabase/functions/import-expenses
// 2 import types: txn_detail (QBO Transaction Detail by Account) and pivot (vendor-aggregated).
const ORG_ID = 'a0000000-0000-0000-0000-000000000001';

module.exports = function(app, { pool }) {
  app.post('/import-expenses', async (req, res) => {
    try {
      const body = req.body || {};
      const importType = body.import_type || 'pivot';

      // ── TXN DETAIL ──
      if (importType === 'txn_detail') {
        const { accounts, transactions } = body;
        if (!accounts || !transactions) return res.status(400).json({ error: 'accounts and transactions required' });

        let acctCount = 0, txnCount = 0;
        const acctMap = {};

        // 1. Upsert GL accounts
        for (const a of accounts) {
          const match = a.match(/^(\d+)\s+(.+)$/);
          const code = match ? match[1] : a.substring(0, 10);
          const name = match ? match[2] : a;
          try {
            const { rows } = await pool.query(
              `INSERT INTO fin_accounts (org_id, code, name, type, description)
               VALUES ($1, $2, $3, 'expense', $4)
               ON CONFLICT (org_id, code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description
               RETURNING id, description`,
              [ORG_ID, code, name, `QBO: ${a}`]
            );
            if (rows[0]) {
              acctMap[a] = rows[0].id;
              acctCount++;
            }
          } catch (e) {
            console.error('Account insert:', e?.message);
          }
        }

        // Pull all existing accounts for fallback matching
        const { rows: existing } = await pool.query(
          `SELECT id, description FROM fin_accounts WHERE org_id = $1`,
          [ORG_ID]
        );
        for (const a of existing) {
          if (a.description?.startsWith('QBO: ')) {
            acctMap[a.description.replace('QBO: ', '')] = a.id;
          }
        }

        // 2. Group by account
        const byAccount = {};
        for (const t of transactions) {
          if (!byAccount[t.account]) byAccount[t.account] = [];
          byAccount[t.account].push(t);
        }

        // 3. Insert expense reports
        const reportMap = {};
        const acctNames = Object.keys(byAccount).filter(a => byAccount[a].length > 0);

        for (let i = 0; i < acctNames.length; i += 100) {
          const batch = acctNames.slice(i, i + 100);
          const values = [];
          const params = [];
          let pi = 1;
          for (let j = 0; j < batch.length; j++) {
            const a = batch[j];
            const items = byAccount[a];
            const total = items.reduce((s, t) => s + (t.amount || 0), 0);
            values.push(`($${pi++}, $${pi++}, $${pi++}, $${pi++}, 'approved', $${pi++})`);
            params.push(
              ORG_ID,
              `TXN-2026-${String(i + j + 1).padStart(4, '0')}`,
              a, Math.round(total * 100) / 100,
              `QBO Transaction Detail: ${items.length} txns`
            );
          }
          const { rows } = await pool.query(
            `INSERT INTO fin_expense_reports (org_id, report_number, title, total_amount, status, description)
             VALUES ${values.join(', ')} RETURNING id, title`,
            params
          );
          for (const r of rows) reportMap[r.title] = r.id;
        }

        // 4. Insert items
        const allItems = [];
        for (const [acct, items] of Object.entries(byAccount)) {
          const reportId = reportMap[acct];
          const accountId = acctMap[acct] || null;
          if (!reportId) continue;
          for (const t of items) {
            const parts = (t.date || '').split('/');
            const isoDate = parts.length === 3
              ? `${parts[2]}-${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}`
              : t.date;
            allItems.push({
              report_id: reportId, date: isoDate, category: 'other',
              description: [t.name, t.memo].filter(Boolean).join(' \u2014 ').substring(0, 500) || `${acct} \u2014 ${t.date}`,
              amount: t.amount || 0,
              vendor_name: t.name || '',
              account_id: accountId,
              notes: JSON.stringify({ txn_type: t.type, num: t.num, split: t.split, class: t.cls }),
            });
          }
        }

        for (let i = 0; i < allItems.length; i += 500) {
          const batch = allItems.slice(i, i + 500);
          const values = [];
          const params = [];
          let pi = 1;
          for (const it of batch) {
            values.push(`($${pi++}, $${pi++}, $${pi++}, $${pi++}, $${pi++}, $${pi++}, $${pi++}, $${pi++}, 0)`);
            params.push(it.report_id, it.date, it.category, it.description, it.amount, it.vendor_name, it.account_id, it.notes);
          }
          if (batch.length === 0) continue;
          await pool.query(
            `INSERT INTO fin_expense_items
              (report_id, date, category, description, amount, vendor_name, account_id, notes, sort_order)
             VALUES ${values.join(', ')}`,
            params
          );
          txnCount += batch.length;
        }

        return res.json({ success: true, accounts: acctCount, reports: Object.keys(reportMap).length, items: txnCount });
      }

      // ── PIVOT (vendor-aggregated) ──
      const { expenses } = body;
      if (!expenses) return res.status(400).json({ error: 'expenses required' });

      const byVendor = {};
      for (const e of expenses) {
        if (!byVendor[e.vendor_name]) byVendor[e.vendor_name] = [];
        byVendor[e.vendor_name].push(e);
      }

      const vendors = Object.keys(byVendor);
      let reportCount = 0, itemCount = 0;
      const reportMap = {};

      for (let i = 0; i < vendors.length; i += 100) {
        const batch = vendors.slice(i, i + 100);
        const values = [];
        const params = [];
        let pi = 1;
        for (let j = 0; j < batch.length; j++) {
          const v = batch[j];
          const items = byVendor[v];
          const total = items.reduce((s, e) => s + e.amount, 0);
          values.push(`($${pi++}, $${pi++}, $${pi++}, $${pi++}, 'approved', $${pi++})`);
          params.push(
            ORG_ID,
            `EXP-2026-${String(i + j + 1).padStart(4, '0')}`,
            v, Math.round(total * 100) / 100,
            `QBO Import: ${items.length} txns`
          );
        }
        const { rows } = await pool.query(
          `INSERT INTO fin_expense_reports (org_id, report_number, title, total_amount, status, description)
           VALUES ${values.join(', ')} RETURNING id, title`,
          params
        );
        for (const r of rows) reportMap[r.title] = r.id;
        reportCount += rows.length;
      }

      const allItems = [];
      for (const [vendor, items] of Object.entries(byVendor)) {
        const reportId = reportMap[vendor];
        if (!reportId) continue;
        for (const e of items) {
          allItems.push([reportId, e.date, 'other',
            `${e.vendor_name} \u2014 ${e.date}`, e.amount, e.vendor_name]);
        }
      }

      for (let i = 0; i < allItems.length; i += 500) {
        const batch = allItems.slice(i, i + 500);
        const values = [];
        const params = [];
        let pi = 1;
        for (const it of batch) {
          values.push(`($${pi++}, $${pi++}, $${pi++}, $${pi++}, $${pi++}, $${pi++}, 0)`);
          params.push(...it);
        }
        if (batch.length === 0) continue;
        await pool.query(
          `INSERT INTO fin_expense_items
            (report_id, date, category, description, amount, vendor_name, sort_order)
           VALUES ${values.join(', ')}`,
          params
        );
        itemCount += batch.length;
      }

      res.json({ success: true, reports: reportCount, items: itemCount });
    } catch (e) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });
};
