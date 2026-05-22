
// POST /qbo-sync — port of supabase/functions/qbo-sync
// 13 sub-syncs: accounts, vendors, items, customers, bills, purchases,
// payments, deposits, transfers, invoices, journal_entries, pl, pl_monthly,
// balance_sheet, attachments. Uses supabase-storage wrapper for bill PDFs.
const { uploadToStorage } = require('../lib/supabase-storage');
const {
  qboFetch, bulkUpsert, queryAll, extractGL, sectionFromLabel,
  getQboBase, getActiveConnection, ensureToken,
} = require('../lib/qbo');

async function downloadAndStore(downloadUrl, storagePath, contentType) {
  try {
    const r = await fetch(downloadUrl);
    if (!r.ok) return null;
    const buffer = Buffer.from(await r.arrayBuffer());
    const result = await uploadToStorage('bill-attachments', storagePath, buffer, contentType);
    return result.public_url;
  } catch (e) {
    console.error('[qbo-sync] download/store error:', e?.message);
    return null;
  }
}

module.exports = function(app, { pool }) {
  app.post('/qbo-sync', async (req, res) => {
    try {
      const body = req.body || {};
      const what = body.what || 'all';
      const year = body.year || new Date().getFullYear();

      const conn = await getActiveConnection(pool);
      if (!conn) return res.json({ error: 'QBO not connected' });

      const rid = conn.realm_id;
      const oid = conn.org_id || 'a0000000-0000-0000-0000-000000000001';
      const token = await ensureToken(pool, conn);
      const base = getQboBase();
      const now = () => new Date().toISOString();
      const R = {};
      const E = [];

      await pool.query(
        `UPDATE qbo_connections SET sync_status = 'syncing' WHERE realm_id = $1`,
        [rid]
      );

      if (what === 'all' || what === 'accounts') {
        try {
          const items = await queryAll(base, rid, token, 'Account');
          const rows = items.map(a => ({
            org_id: oid, realm_id: rid, qbo_id: String(a.Id),
            name: a.Name, fully_qualified_name: a.FullyQualifiedName,
            account_type: a.AccountType, account_sub_type: a.AccountSubType,
            classification: a.Classification, currency_ref: a.CurrencyRef?.value || 'USD',
            active: a.Active !== false, current_balance: Number(a.CurrentBalance) || 0,
            synced_at: now(),
          }));
          R.accounts = await bulkUpsert(pool, 'qbo_accounts', rows,
            ['org_id','realm_id','qbo_id','name','fully_qualified_name','account_type','account_sub_type','classification','currency_ref','active','current_balance','synced_at'],
            'realm_id, qbo_id');
        } catch (e) { E.push(`accounts: ${e?.message}`); }
      }

      if (what === 'all' || what === 'vendors') {
        try {
          const items = await queryAll(base, rid, token, 'Vendor');
          const rows = items.map(v => ({
            org_id: oid, realm_id: rid, qbo_id: String(v.Id),
            display_name: v.DisplayName, company_name: v.CompanyName,
            email: v.PrimaryEmailAddr?.Address, phone: v.PrimaryPhone?.FreeFormNumber,
            website: v.WebAddr?.URI, balance: Number(v.Balance) || 0,
            active: v.Active !== false, synced_at: now(),
          }));
          R.vendors = await bulkUpsert(pool, 'qbo_vendors', rows,
            ['org_id','realm_id','qbo_id','display_name','company_name','email','phone','website','balance','active','synced_at'],
            'realm_id, qbo_id');
        } catch (e) { E.push(`vendors: ${e?.message}`); }
      }

      if (what === 'all' || what === 'items' || what === 'inventory') {
        try {
          const items = await queryAll(base, rid, token, 'Item');
          const rows = items.map(it => ({
            org_id: oid, realm_id: rid, qbo_id: String(it.Id),
            name: it.Name, fully_qualified_name: it.FullyQualifiedName,
            sku: it.Sku || null, type: it.Type,
            active: it.Active !== false, taxable: it.Taxable === true,
            qty_on_hand: it.QtyOnHand != null ? Number(it.QtyOnHand) : null,
            unit_cost: it.PurchaseCost != null ? Number(it.PurchaseCost) : null,
            unit_price: it.UnitPrice != null ? Number(it.UnitPrice) : null,
            inv_asset_account: it.AssetAccountRef?.name || null,
            income_account: it.IncomeAccountRef?.name || null,
            expense_account: it.ExpenseAccountRef?.name || null,
            parent_id: it.ParentRef?.value || null,
            description: it.Description || null,
            synced_at: now(),
          }));
          R.items = await bulkUpsert(pool, 'qbo_items', rows,
            ['org_id','realm_id','qbo_id','name','fully_qualified_name','sku','type','active','taxable','qty_on_hand','unit_cost','unit_price','inv_asset_account','income_account','expense_account','parent_id','description','synced_at'],
            'realm_id, qbo_id');
          R.items_inventory = rows.filter(r => r.type === 'Inventory' && r.active).length;
        } catch (e) { E.push(`items: ${e?.message}`); }
      }

      if (what === 'all' || what === 'customers') {
        try {
          const items = await queryAll(base, rid, token, 'Customer');
          const rows = items.map(c => ({
            org_id: oid, realm_id: rid, qbo_id: String(c.Id),
            display_name: c.DisplayName, company_name: c.CompanyName,
            email: c.PrimaryEmailAddr?.Address, phone: c.PrimaryPhone?.FreeFormNumber,
            balance: Number(c.Balance) || 0, active: c.Active !== false,
            synced_at: now(),
          }));
          R.customers = await bulkUpsert(pool, 'qbo_customers', rows,
            ['org_id','realm_id','qbo_id','display_name','company_name','email','phone','balance','active','synced_at'],
            'realm_id, qbo_id');
        } catch (e) { E.push(`customers: ${e?.message}`); }
      }

      if (what === 'all' || what === 'bills') {
        try {
          const items = await queryAll(base, rid, token, 'Bill', `TxnDate >= '${year}-01-01'`);
          const rows = items.map(b => {
            const { glNames, lineItems } = extractGL(b.Line);
            return {
              org_id: oid, realm_id: rid, qbo_id: String(b.Id),
              vendor_ref: b.VendorRef?.value, vendor_name: b.VendorRef?.name,
              txn_date: b.TxnDate, due_date: b.DueDate,
              total_amount: Number(b.TotalAmt) || 0, balance: Number(b.Balance) || 0,
              currency: b.CurrencyRef?.value || 'USD', memo: b.PrivateNote,
              payment_status: Number(b.Balance) === 0 ? 'paid' : 'open',
              gl_accounts: [...new Set(glNames)].join(', ') || null,
              line_items: JSON.stringify(lineItems),
              synced_at: now(),
            };
          });
          R.bills = await bulkUpsert(pool, 'qbo_bills', rows,
            ['org_id','realm_id','qbo_id','vendor_ref','vendor_name','txn_date','due_date','total_amount','balance','currency','memo','payment_status','gl_accounts','line_items','synced_at'],
            'realm_id, qbo_id');
        } catch (e) { E.push(`bills: ${e?.message}`); }
      }

      if (what === 'all' || what === 'bills' || what === 'attachments') {
        try {
          const { rows: needAttach } = await pool.query(
            `SELECT id, qbo_id FROM qbo_bills WHERE attachment_url IS NULL LIMIT 200`
          );
          let stored = 0;
          for (const bill of needAttach) {
            try {
              const aQ = `SELECT * FROM Attachable WHERE AttachableRef.EntityRef.Type = 'Bill' AND AttachableRef.EntityRef.value = '${bill.qbo_id}'`;
              const aRes = await qboFetch(
                `${base}/v3/company/${rid}/query?query=${encodeURIComponent(aQ)}&minorversion=65`, token
              );
              const atts = aRes?.QueryResponse?.Attachable || [];
              if (atts.length > 0) {
                const att = atts[0];
                const fileName = att.FileName || `bill_${bill.qbo_id}.pdf`;
                const ct = att.ContentType || 'application/pdf';
                const path = `${rid}/${bill.qbo_id}/${fileName}`;
                const permUrl = await downloadAndStore(att.TempDownloadUri, path, ct);
                await pool.query(
                  `UPDATE qbo_bills SET attachment_url = $1, attachment_name = $2, attachment_content_type = $3 WHERE id = $4`,
                  [permUrl || att.TempDownloadUri, fileName, ct, bill.id]
                );
                stored++;
              } else {
                await pool.query(
                  `UPDATE qbo_bills SET attachment_url = 'none' WHERE id = $1`, [bill.id]
                );
              }
            } catch {}
          }
          R.attachments_stored = stored;
        } catch (e) { E.push(`attachments: ${e?.message}`); }
      }

      if (what === 'all' || what === 'purchases') {
        try {
          const items = await queryAll(base, rid, token, 'Purchase', `TxnDate >= '${year}-01-01'`);
          const rows = items.map(p => {
            const { glNames, lineItems } = extractGL(p.Line);
            return {
              org_id: oid, realm_id: rid, qbo_id: String(p.Id),
              payment_type: p.PaymentType, vendor_name: p.EntityRef?.name,
              vendor_ref: p.EntityRef?.value, txn_date: p.TxnDate,
              total_amount: Number(p.TotalAmt) || 0, currency: p.CurrencyRef?.value || 'USD',
              memo: p.PrivateNote, gl_accounts: [...new Set(glNames)].join(', ') || null,
              line_items: JSON.stringify(lineItems), account_name: p.AccountRef?.name,
              synced_at: now(),
            };
          });
          R.purchases = await bulkUpsert(pool, 'qbo_purchases', rows,
            ['org_id','realm_id','qbo_id','payment_type','vendor_name','vendor_ref','txn_date','total_amount','currency','memo','gl_accounts','line_items','account_name','synced_at'],
            'realm_id, qbo_id');
        } catch (e) { E.push(`purchases: ${e?.message}`); }
      }

      if (what === 'all' || what === 'journal_entries') {
        try {
          const items = await queryAll(base, rid, token, 'JournalEntry', `TxnDate >= '${year}-01-01'`);
          const rows = items.map(je => {
            const lines = (je.Line || []).map(l => ({
              amount: Number(l.Amount) || 0,
              posting_type: l.JournalEntryLineDetail?.PostingType,
              account: l.JournalEntryLineDetail?.AccountRef?.name,
              account_id: l.JournalEntryLineDetail?.AccountRef?.value,
              description: l.Description,
              entity: l.JournalEntryLineDetail?.Entity?.EntityRef?.name,
            }));
            return {
              org_id: oid, realm_id: rid, qbo_id: String(je.Id),
              txn_date: je.TxnDate, total_amount: Number(je.TotalAmt) || 0,
              memo: je.PrivateNote, doc_number: je.DocNumber,
              line_items: JSON.stringify(lines), synced_at: now(),
            };
          });
          R.journal_entries = await bulkUpsert(pool, 'qbo_journal_entries', rows,
            ['org_id','realm_id','qbo_id','txn_date','total_amount','memo','doc_number','line_items','synced_at'],
            'realm_id, qbo_id');
        } catch (e) { E.push(`journal_entries: ${e?.message}`); }
      }

      if (what === 'all' || what === 'payments') {
        try {
          const received = (await queryAll(base, rid, token, 'Payment', `TxnDate >= '${year}-01-01'`)).map(p => ({
            org_id: oid, realm_id: rid, qbo_id: String(p.Id), payment_type: 'received',
            customer_name: p.CustomerRef?.name, vendor_name: null,
            txn_date: p.TxnDate, total_amount: Number(p.TotalAmt) || 0,
            memo: p.PrivateNote, deposit_to: p.DepositToAccountRef?.name, synced_at: now(),
          }));
          const made = (await queryAll(base, rid, token, 'BillPayment', `TxnDate >= '${year}-01-01'`)).map(p => ({
            org_id: oid, realm_id: rid, qbo_id: String(p.Id), payment_type: 'made',
            customer_name: null, vendor_name: p.VendorRef?.name,
            txn_date: p.TxnDate, total_amount: Number(p.TotalAmt) || 0,
            memo: p.PrivateNote,
            deposit_to: p.CheckPayment?.BankAccountRef?.name || p.CreditCardPayment?.CCAccountRef?.name,
            synced_at: now(),
          }));
          const cols = ['org_id','realm_id','qbo_id','payment_type','customer_name','vendor_name','txn_date','total_amount','memo','deposit_to','synced_at'];
          R.payments_received = await bulkUpsert(pool, 'qbo_payments', received, cols, 'realm_id, qbo_id, payment_type');
          R.payments_made = await bulkUpsert(pool, 'qbo_payments', made, cols, 'realm_id, qbo_id, payment_type');
        } catch (e) { E.push(`payments: ${e?.message}`); }
      }

      if (what === 'all' || what === 'deposits') {
        try {
          const items = await queryAll(base, rid, token, 'Deposit', `TxnDate >= '${year}-01-01'`);
          const rows = items.map(d => {
            const lines = (d.Line || []).filter(l => l.DepositLineDetail).map(l => ({
              amount: Number(l.Amount) || 0,
              entity: l.DepositLineDetail?.Entity?.name,
              account: l.DepositLineDetail?.AccountRef?.name,
              memo: l.Description,
            }));
            return {
              org_id: oid, realm_id: rid, qbo_id: String(d.Id),
              txn_date: d.TxnDate, total_amount: Number(d.TotalAmt) || 0,
              deposit_to: d.DepositToAccountRef?.name, memo: d.PrivateNote,
              line_items: JSON.stringify(lines), synced_at: now(),
            };
          });
          R.deposits = await bulkUpsert(pool, 'qbo_deposits', rows,
            ['org_id','realm_id','qbo_id','txn_date','total_amount','deposit_to','memo','line_items','synced_at'],
            'realm_id, qbo_id');
        } catch (e) { E.push(`deposits: ${e?.message}`); }
      }

      if (what === 'all' || what === 'transfers') {
        try {
          const items = await queryAll(base, rid, token, 'Transfer', `TxnDate >= '${year}-01-01'`);
          const rows = items.map(t => ({
            org_id: oid, realm_id: rid, qbo_id: String(t.Id),
            txn_date: t.TxnDate, amount: Number(t.Amount) || 0,
            from_account: t.FromAccountRef?.name, to_account: t.ToAccountRef?.name,
            memo: t.PrivateNote, synced_at: now(),
          }));
          R.transfers = await bulkUpsert(pool, 'qbo_transfers', rows,
            ['org_id','realm_id','qbo_id','txn_date','amount','from_account','to_account','memo','synced_at'],
            'realm_id, qbo_id');
        } catch (e) { E.push(`transfers: ${e?.message}`); }
      }

      if (what === 'all' || what === 'invoices') {
        try {
          const items = await queryAll(base, rid, token, 'Invoice', `TxnDate >= '${year}-01-01'`);
          const rows = items.map(inv => ({
            org_id: oid, realm_id: rid, qbo_id: String(inv.Id),
            customer_ref: inv.CustomerRef?.value, customer_name: inv.CustomerRef?.name,
            txn_date: inv.TxnDate, due_date: inv.DueDate,
            total_amount: Number(inv.TotalAmt) || 0, balance: Number(inv.Balance) || 0,
            currency: inv.CurrencyRef?.value || 'USD', status: inv.EmailStatus,
            memo: inv.PrivateNote, synced_at: now(),
          }));
          R.invoices = await bulkUpsert(pool, 'qbo_invoices', rows,
            ['org_id','realm_id','qbo_id','customer_ref','customer_name','txn_date','due_date','total_amount','balance','currency','status','memo','synced_at'],
            'realm_id, qbo_id');
        } catch (e) { E.push(`invoices: ${e?.message}`); }
      }

      if (what === 'all' || what === 'pl') {
        try {
          await pool.query(
            `DELETE FROM qbo_pl WHERE realm_id = $1 AND period_start = $2`,
            [rid, `${year}-01-01`]
          );
          const d = await qboFetch(
            `${base}/v3/company/${rid}/reports/ProfitAndLoss?start_date=${year}-01-01&end_date=${year}-12-31&accounting_method=Accrual&minorversion=65`,
            token
          );
          const rows = [];
          const proc = (rs, type) => {
            for (const r of rs) {
              if (r.type === 'Data' && r.ColData?.[0]?.value && r.ColData?.[1]?.value) {
                rows.push({
                  org_id: oid, realm_id: rid,
                  period_start: `${year}-01-01`, period_end: `${year}-12-31`,
                  account_name: r.ColData[0].value, account_type: type,
                  classification: type.toLowerCase().includes('income') || type.toLowerCase().includes('revenue') ? 'Revenue' : 'Expense',
                  amount: parseFloat(String(r.ColData[1].value).replace(/,/g, '')) || 0,
                  synced_at: now(),
                });
              }
              if (r.Rows?.Row) proc(r.Rows.Row, type);
            }
          };
          for (const s of (d?.Rows?.Row || [])) {
            const lbl = s.Header?.ColData?.[0]?.value || 'Other';
            if (s.Rows?.Row) proc(s.Rows.Row, lbl);
          }
          if (rows.length) {
            R.pl_rows = await bulkUpsert(pool, 'qbo_pl', rows,
              ['org_id','realm_id','period_start','period_end','account_name','account_type','classification','amount','synced_at'],
              'realm_id, period_start, period_end, account_name');
            R.revenue = Math.round(rows.filter(r => r.classification === 'Revenue').reduce((s, r) => s + Number(r.amount), 0));
            R.expenses = Math.round(rows.filter(r => r.classification === 'Expense').reduce((s, r) => s + Number(r.amount), 0));
          }
        } catch (e) { E.push(`pl: ${e?.message}`); }
      }

      if (what === 'all' || what === 'pl_monthly') {
        try {
          await pool.query(`DELETE FROM qbo_pl_monthly WHERE realm_id = $1`, [rid]);
          const months = [];
          const nowDt = new Date();
          for (let m = 0; m < 12; m++) {
            const start = `${year}-${String(m + 1).padStart(2, '0')}-01`;
            const endD = new Date(year, m + 1, 0);
            const end = `${year}-${String(m + 1).padStart(2, '0')}-${String(endD.getDate()).padStart(2, '0')}`;
            if (new Date(start) > nowDt) break;
            months.push({ start, end, label: `${year}-${String(m + 1).padStart(2, '0')}` });
          }
          for (const mo of months) {
            try {
              const d = await qboFetch(
                `${base}/v3/company/${rid}/reports/ProfitAndLoss?start_date=${mo.start}&end_date=${mo.end}&accounting_method=Accrual&minorversion=65`,
                token
              );
              const rows = [];
              const proc = (rs, type) => {
                for (const r of rs) {
                  if (r.type === 'Data' && r.ColData?.[0]?.value && r.ColData?.[1]?.value) {
                    rows.push({
                      org_id: oid, realm_id: rid, period_month: mo.label,
                      account_name: r.ColData[0].value, account_type: type,
                      classification: type.toLowerCase().includes('income') || type.toLowerCase().includes('revenue') ? 'Revenue' : 'Expense',
                      amount: parseFloat(String(r.ColData[1].value).replace(/,/g, '')) || 0,
                      synced_at: now(),
                    });
                  }
                  if (r.Rows?.Row) proc(r.Rows.Row, type);
                }
              };
              for (const s of (d?.Rows?.Row || [])) {
                const lbl = s.Header?.ColData?.[0]?.value || 'Other';
                if (s.Rows?.Row) proc(s.Rows.Row, lbl);
              }
              if (rows.length) {
                await bulkUpsert(pool, 'qbo_pl_monthly', rows,
                  ['org_id','realm_id','period_month','account_name','account_type','classification','amount','synced_at'],
                  'realm_id, period_month, account_name');
              }
              R[`pl_${mo.label}`] = rows.length;
            } catch {}
          }
        } catch (e) { E.push(`pl_monthly: ${e?.message}`); }
      }

      if (what === 'all' || what === 'balance_sheet') {
        try {
          const today = new Date().toISOString().slice(0, 10);
          await pool.query(
            `DELETE FROM qbo_balance_sheet WHERE realm_id = $1 AND report_date = $2`,
            [rid, today]
          );
          const d = await qboFetch(
            `${base}/v3/company/${rid}/reports/BalanceSheet?date_macro=Today&accounting_method=Accrual&minorversion=65`,
            token
          );
          const rows = [];
          const proc = (rs, section, groupName) => {
            for (const r of rs) {
              if (r.type === 'Section') {
                const subLbl = r.Header?.ColData?.[0]?.value || '';
                const subSection = sectionFromLabel(subLbl, section);
                if (r.Rows?.Row) proc(r.Rows.Row, subSection, subLbl || groupName);
                if (r.Summary?.ColData?.[0]?.value && r.Summary?.ColData?.[1]?.value != null) {
                  rows.push({
                    org_id: oid, realm_id: rid, report_date: today, section: subSection,
                    account_name: r.Summary.ColData[0].value, account_type: subSection,
                    amount: parseFloat(String(r.Summary.ColData[1].value).replace(/,/g, '')) || 0,
                    is_summary: true, group_name: subLbl || groupName, synced_at: now(),
                  });
                }
              } else if (r.type === 'Data' && r.ColData?.[0]?.value && r.ColData?.[1]?.value != null) {
                rows.push({
                  org_id: oid, realm_id: rid, report_date: today, section,
                  account_name: r.ColData[0].value, account_type: section,
                  amount: parseFloat(String(r.ColData[1].value).replace(/,/g, '')) || 0,
                  is_summary: false, group_name: groupName, synced_at: now(),
                });
                if (r.Rows?.Row) proc(r.Rows.Row, section, groupName);
              }
            }
          };
          for (const s of (d?.Rows?.Row || [])) {
            const lbl = s.Header?.ColData?.[0]?.value || 'Other';
            const sect = sectionFromLabel(lbl, 'Equity');
            if (s.Rows?.Row) proc(s.Rows.Row, sect, lbl);
            if (s.Summary?.ColData?.[0]?.value && s.Summary?.ColData?.[1]?.value != null) {
              rows.push({
                org_id: oid, realm_id: rid, report_date: today, section: sect,
                account_name: s.Summary.ColData[0].value, account_type: sect,
                amount: parseFloat(String(s.Summary.ColData[1].value).replace(/,/g, '')) || 0,
                is_summary: true, group_name: lbl, synced_at: now(),
              });
            }
          }
          if (rows.length) {
            R.balance_sheet = await bulkUpsert(pool, 'qbo_balance_sheet', rows,
              ['org_id','realm_id','report_date','section','account_name','account_type','amount','is_summary','group_name','synced_at'],
              'realm_id, report_date, account_name');
            R.bs_summary_rows = rows.filter(r => r.is_summary).length;
            R.bs_data_rows = rows.filter(r => !r.is_summary).length;
          }
        } catch (e) { E.push(`balance_sheet: ${e?.message}`); }
      }

      const status = E.length > 0 ? (Object.keys(R).length > 0 ? 'partial' : 'error') : 'success';
      await pool.query(
        `UPDATE qbo_connections SET sync_status = 'idle', last_synced_at = NOW(), last_error = $1 WHERE realm_id = $2`,
        [E.length > 0 ? E.join('; ').slice(0, 2000) : null, rid]
      );

      res.json({ success: true, status, ...R, errors: E.length > 0 ? E.slice(0, 10) : undefined });
    } catch (e) {
      const msg = e?.message || String(e);
      try {
        await pool.query(
          `UPDATE qbo_connections SET sync_status = 'error', last_error = $1
           WHERE realm_id = (SELECT realm_id FROM qbo_connections ORDER BY connected_at DESC LIMIT 1)`,
          [msg]
        );
      } catch {}
      res.json({ error: msg });
    }
  });
};
