// POST /qbo-account-txns - every transaction posted to one P&L account, from
// QuickBooks' General Ledger report, for the P&L Explorer drill-down.
//
// Body: { account: "50321 Direct Rent - OFS", start: "2026-01-01", end: "2026-11-30" }
// The account is the label the ProfitAndLoss report uses (account number, a
// space, then the name, or just the name). Returns the account's lines with the
// amount posted to this account (not the whole bill), covering every
// transaction type: bills, expenses, cheques, journal entries, payroll,
// deposits, invoices, sales receipts, credits.
//
// Response: { account: {id, name}, rows: [{date, type, txn_id, num, name, memo,
//   split, amount}], months: {"2026-01": total, ...}, total, truncated }
const { qboFetch, getQboBase, getActiveConnection, ensureToken } = require('../lib/qbo');

const MAX_ROWS = 5000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const q = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const num = (v) => {
  const n = parseFloat(String(v == null ? '' : v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

// Resolve a P&L label to a QBO account id. Labels look like "50321 Direct Rent - OFS"
// when account numbers are on, otherwise the bare name.
async function resolveAccount(base, rid, token, label) {
  const m = /^(\d[\w.-]*)\s+(.+)$/.exec(label.trim());
  const tries = [];
  if (m) tries.push(`SELECT Id, Name, AcctNum, FullyQualifiedName FROM Account WHERE AcctNum = '${q(m[1])}'`);
  tries.push(`SELECT Id, Name, AcctNum, FullyQualifiedName FROM Account WHERE Name = '${q(m ? m[2] : label.trim())}'`);
  if (m) tries.push(`SELECT Id, Name, AcctNum, FullyQualifiedName FROM Account WHERE Name = '${q(label.trim())}'`);
  for (const sql of tries) {
    const d = await qboFetch(`${base}/v3/company/${rid}/query?query=${encodeURIComponent(sql)}&minorversion=65`, token);
    const a = d?.QueryResponse?.Account || [];
    if (a.length) return { id: String(a[0].Id), name: a[0].FullyQualifiedName || a[0].Name, acct_num: a[0].AcctNum || null };
  }
  return null;
}

// Flatten the GeneralLedger report into rows keyed by column.
function parseLedger(report) {
  const cols = (report?.Columns?.Column || []).map((c) => {
    const key = (c.MetaData || []).find((x) => x.Name === 'ColKey')?.Value;
    return key || String(c.ColTitle || '').toLowerCase();
  });
  const out = [];
  const walk = (rows) => {
    for (const r of rows || []) {
      if (r.type === 'Data' && Array.isArray(r.ColData)) {
        const rec = {};
        r.ColData.forEach((cd, i) => { rec[cols[i]] = cd; });
        const date = rec.tx_date?.value;
        const type = rec.txn_type?.value;
        if (!date || !DATE_RE.test(date) || !type) continue; // skip beginning-balance rows
        out.push({
          date,
          type,
          txn_id: rec.txn_type?.id || null,
          num: rec.doc_num?.value || null,
          name: rec.name?.value || null,
          memo: rec.memo?.value || null,
          split: rec.split_acc?.value || null,
          amount: num(rec.subt_nat_amount?.value),
        });
      }
      if (r.Rows?.Row) walk(r.Rows.Row);
    }
  };
  walk(report?.Rows?.Row);
  return out;
}

module.exports = function (app, { pool }) {
  app.post('/qbo-account-txns', async (req, res) => {
    try {
      if (req.helmMember?.is_external) return res.status(403).json({ error: 'forbidden' });
      const { account, start, end } = req.body || {};
      if (!account || typeof account !== 'string' || account.length > 200) return res.status(400).json({ error: 'account is required' });
      if (!DATE_RE.test(start || '') || !DATE_RE.test(end || '') || start > end) return res.status(400).json({ error: 'start and end must be YYYY-MM-DD' });

      const conn = await getActiveConnection(pool);
      if (!conn) return res.status(503).json({ error: 'QBO not connected' });
      const rid = conn.realm_id;
      const token = await ensureToken(pool, conn);
      const base = getQboBase();

      const acct = await resolveAccount(base, rid, token, account);
      if (!acct) return res.status(404).json({ error: `No QuickBooks account matches "${account}"` });

      const cols = 'tx_date,txn_type,doc_num,name,memo,split_acc,subt_nat_amount';
      const url = `${base}/v3/company/${rid}/reports/GeneralLedger?start_date=${start}&end_date=${end}` +
        `&account=${encodeURIComponent(acct.id)}&accounting_method=Accrual&columns=${cols}&minorversion=65`;
      const report = await qboFetch(url, token);
      const all = parseLedger(report);

      const months = {};
      let total = 0;
      for (const r of all) {
        const m = r.date.slice(0, 7);
        months[m] = (months[m] || 0) + r.amount;
        total += r.amount;
      }
      all.sort((a, b) => a.date.localeCompare(b.date));
      res.json({
        account: acct,
        rows: all.slice(0, MAX_ROWS),
        months,
        total,
        count: all.length,
        truncated: all.length > MAX_ROWS,
      });
    } catch (e) {
      console.error('[qbo-account-txns]', e?.message || e);
      res.status(502).json({ error: String(e?.message || e).slice(0, 300) });
    }
  });
};
