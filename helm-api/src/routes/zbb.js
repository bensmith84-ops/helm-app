// POST /zbb - zero-based Opex budget (Finance > Zero-Based Budget).
//
// Restricted to named people (ZBB_ALLOWED_EMAILS, default Ben Smith): the plan holds salaries. The tables are not exposed
// through /rest/v1 (see migrations/032_zbb.sql), so everything goes through here.
//
// Body: { action, ... }
//   load            { year }                 -> plan (created and seeded on first load), people, lines, baseline
//   refresh_actuals { plan_id, start, end }  -> pulls QuickBooks Profit and Loss Detail for the baseline
//                                               window (Opex 6xxxx accounts), stores it by vendor x account x
//                                               month, and adds a "review" line for every vendor not yet listed
//   save_settings   { plan_id, settings }
//   import_people   { plan_id, rows }        -> replaces the org chart with an HRIS export
//                                               (name, title, department, manager, currency, salary)
//   bulk_people     { plan_id, ids, op, ... } -> op raise {pct} | reset | status {status}
//   save_person     { plan_id, person }      -> insert (no id) or update
//   delete_person   { id }                   -> only people added in the plan; existing staff are marked removed
//   save_line       { plan_id, line }
//   delete_line     { id }
//   search          { plan_id, q }           -> vendors with baseline spend + QuickBooks vendors, for "add software"
//   price_lookup    { name }                 -> public list pricing for a tool via web search (Claude)
const Anthropic = require('@anthropic-ai/sdk');
const { qboFetch, getQboBase, getActiveConnection, ensureToken } = require('../lib/qbo');

const ORG = 'a0000000-0000-0000-0000-000000000001';
const ALLOWED = (process.env.ZBB_ALLOWED_EMAILS || 'ben.smith@earthbreeze.com')
  .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
// USD per unit of each pay currency (Nov 2026 mid-market); editable per plan.
const DEFAULT_FX = { USD: 1, PHP: 0.01563, COP: 0.000319, CAD: 0.7163 };
const CUR_RE = /^[A-Z]{3}$/;
const LEVEL = { owner: 5, admin: 4, manager: 3, member: 2, guest: 1 };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f-]{36}$/i;
const num = (v) => {
  const n = parseFloat(String(v == null ? '' : v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const str = (v, max = 300) => (v == null || v === '' ? null : String(v).slice(0, max));
const int = (v, lo, hi, d) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};

// Words that start a journal-entry memo without naming a vendor.
const STOP = new Set(['move', 'bill', 'bills', 'to', 'the', 'prepaid', 'accrual', 'accruals', 'reclass', 'reverse', 'reversal', 'adjustment', 'adj', 'jan', 'feb', 'mar', 'apr', 'may', 'jun', 'june', 'jul', 'july', 'aug', 'august', 'sep', 'sept', 'september', 'oct', 'october', 'nov', 'november', 'dec', 'december', 'january', 'february', 'march', 'april', 'rent', 'to', 'record', 'true', 'up']);
const firstWord = (s) => (String(s || '').toLowerCase().match(/[a-z0-9]+/) || [''])[0];

// Profit and Loss Detail -> [{ acct, acctName, date, type, name, memo, amount }]
function parseDetail(report) {
  const meta = (report?.Columns?.Column || []).map((c) => ({
    key: (c.MetaData || []).find((x) => x.Name === 'ColKey')?.Value || '',
    title: String(c.ColTitle || ''),
  }));
  const idx = (keys, re) => {
    for (const k of keys) { const i = meta.findIndex((c) => c.key === k); if (i >= 0) return i; }
    return re ? meta.findIndex((c) => re.test(c.title)) : -1;
  };
  const iDate = idx(['tx_date'], /^date$/i);
  const iType = idx(['txn_type'], /transaction type/i);
  const iName = idx(['name'], /^name$/i);
  const iMemo = idx(['memo'], /memo|description/i);
  const iAmt = idx(['subt_nat_amount', 'subt_nat_home_amount', 'nat_amount', 'amount'], /^amount$/i);
  const out = [];
  const walk = (rows, acct) => {
    for (const r of rows || []) {
      let a = acct;
      const head = r.Header?.ColData?.[0]?.value;
      if (head) {
        const m = /^(\d{4,6})\s+(.+)$/.exec(String(head).trim());
        if (m) a = { num: m[1], name: m[2] };
      }
      if (r.type === 'Data' && Array.isArray(r.ColData) && a) {
        const cd = r.ColData;
        const date = cd[iDate]?.value;
        if (date && DATE_RE.test(date)) {
          out.push({
            acct: a.num, acctName: a.name, date,
            type: cd[iType]?.value || null,
            name: cd[iName]?.value || null,
            memo: cd[iMemo]?.value || null,
            amount: num(cd[iAmt]?.value),
          });
        }
      }
      if (r.Rows?.Row) walk(r.Rows.Row, a);
    }
  };
  walk(report?.Rows?.Row, null);
  return out;
}

// Give unnamed lines (mostly journal entries) the vendor their memo names.
function vendorNamer(rows, known = []) {
  // Names used on this period's transactions win over the wider QuickBooks vendor list.
  const named = [...new Set([...rows.map((r) => r.name).filter(Boolean), ...known.filter(Boolean)])];
  const byWord = new Map();
  for (const n of named) { const w = firstWord(n); if (w && !byWord.has(w)) byWord.set(w, n); }
  const label = {};
  return (r) => {
    if (r.name) return r.name;
    const memo = String(r.memo || '');
    const parts = memo.includes('|') ? [memo.split('|').slice(1).join('|'), memo] : [memo];
    for (const c of parts) {
      const w = firstWord(c);
      if (!w || STOP.has(w) || /^\d/.test(w)) continue;
      if (byWord.has(w)) return byWord.get(w);
      if (!label[w]) label[w] = c.trim().replace(/\s+/g, ' ').slice(0, 48);
      return label[w];
    }
    return r.type === 'Journal Entry' ? 'Journal entries (no vendor)' : (r.type || '(no name)');
  };
}

function monthsBetween(start, end) {
  const out = [];
  let [y, m] = start.slice(0, 7).split('-').map(Number);
  const [ey, em] = end.slice(0, 7).split('-').map(Number);
  while (y < ey || (y === ey && m <= em)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}
const monthEnd = (ym) => {
  const [y, m] = ym.split('-').map(Number);
  return `${ym}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`;
};

// Account number -> Opex category name, from the Finance GL codes.
async function categoryMap(pool) {
  const { rows } = await pool.query(
    `SELECT c.code, cat.name AS category
       FROM af_gl_codes c LEFT JOIN af_gl_categories cat ON cat.id = c.budget_category_id
      WHERE c.org_id = $1`, [ORG]);
  return new Map(rows.map((r) => [String(r.code), r.category]));
}
const catFor = (map, acct) => map.get(String(acct)) || (String(acct).startsWith('62') ? 'Depreciation & Amortization' : 'Non-Fixed and Other');

module.exports = function (app, { pool }) {
  app.post('/zbb', async (req, res) => {
    try {
      const role = req.helmMember?.role;
      const uid = req.helmMember?.profile_id || null;
      if (!role || !uid || req.helmMember?.is_external || (LEVEL[role] || 0) < LEVEL.admin) {
        return res.status(403).json({ error: 'You do not have access to the zero-based budget.' });
      }
      const { rows: [me] } = await pool.query(`SELECT lower(email) AS email FROM profiles WHERE id = $1`, [uid]);
      if (!me || !ALLOWED.includes(me.email)) {
        return res.status(403).json({ error: 'You do not have access to the zero-based budget.' });
      }
      const b = req.body || {};
      const action = b.action;

      const planById = async (id) => {
        if (!UUID_RE.test(String(id || ''))) return null;
        const { rows } = await pool.query(`SELECT * FROM zbb_plans WHERE id = $1 AND org_id = $2`, [id, ORG]);
        return rows[0] || null;
      };

      if (action === 'load') {
        const year = int(b.year, 2020, 2100, new Date().getFullYear() + 1);
        let { rows: [plan] } = await pool.query(`SELECT * FROM zbb_plans WHERE org_id = $1 AND year = $2`, [ORG, year]);
        if (!plan) {
          const def = { base_start: `${year - 2}-11-01`, base_end: `${year - 1}-10-31`, load_pct: 18, fx: DEFAULT_FX, cogs_departments: ['KY Plant'] };
          ({ rows: [plan] } = await pool.query(
            `INSERT INTO zbb_plans (org_id, year, name, settings, created_by) VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (org_id, year) DO UPDATE SET updated_at = now() RETURNING *`,
            [ORG, year, `FY ${year} Zero-Based Opex`, def, uid]));
          // Seed the org chart from active Helm members.
          const { rows: staff } = await pool.query(
            `SELECT DISTINCT ON (p.id) p.id, p.display_name, p.email, p.title, p.department, p.reports_to
               FROM profiles p JOIN org_memberships om ON om.user_id = p.id AND om.is_active = true AND om.org_id = $1
              WHERE coalesce(p.is_external, false) = false`, [ORG]);
          const ids = new Map();
          for (const s of staff) {
            const { rows: [r] } = await pool.query(
              `INSERT INTO zbb_people (plan_id, profile_id, name, title, department, status)
               VALUES ($1, $2, $3, $4, $5, 'keep') RETURNING id`,
              [plan.id, s.id, s.display_name || s.email || 'Unnamed', s.title, s.department]);
            ids.set(s.id, r.id);
          }
          for (const s of staff) {
            if (s.reports_to && ids.has(s.reports_to)) {
              await pool.query(`UPDATE zbb_people SET manager_id = $1 WHERE id = $2`, [ids.get(s.reports_to), ids.get(s.id)]);
            }
          }
        }
        if (!plan.settings.fx) plan.settings = { ...plan.settings, fx: DEFAULT_FX, cogs_departments: plan.settings.cogs_departments || ['KY Plant'] };
        const [people, lines, actuals, cats] = await Promise.all([
          pool.query(`SELECT * FROM zbb_people WHERE plan_id = $1 ORDER BY sort_order, name`, [plan.id]),
          pool.query(`SELECT * FROM zbb_lines WHERE plan_id = $1 ORDER BY category, baseline DESC, vendor`, [plan.id]),
          pool.query(`SELECT account_num, account_name, month, sum(amount)::float AS amount
                        FROM zbb_actuals WHERE plan_id = $1 GROUP BY 1, 2, 3 ORDER BY 1, 3`, [plan.id]),
          categoryMap(pool),
        ]);
        const accounts = {};
        for (const a of actuals.rows) {
          const e = accounts[a.account_num] || (accounts[a.account_num] = { account_num: a.account_num, account_name: a.account_name, category: catFor(cats, a.account_num), total: 0, months: {} });
          e.months[a.month] = a.amount; e.total += a.amount;
        }
        const { rows: catRows } = await pool.query(`SELECT name, color, sort_order FROM af_gl_categories WHERE org_id = $1 ORDER BY sort_order, name`, [ORG]);
        return res.json({ plan, people: people.rows, lines: lines.rows, baseline: Object.values(accounts), categories: catRows });
      }

      if (action === 'save_settings') {
        const plan = await planById(b.plan_id);
        if (!plan) return res.status(404).json({ error: 'plan not found' });
        const s = b.settings || {};
        const next = { ...plan.settings };
        if (s.load_pct != null) next.load_pct = Math.min(100, Math.max(0, num(s.load_pct)));
        if (DATE_RE.test(s.base_start || '')) next.base_start = s.base_start;
        if (DATE_RE.test(s.base_end || '')) next.base_end = s.base_end;
        if (s.fx && typeof s.fx === 'object') {
          next.fx = {};
          for (const [k, v] of Object.entries(s.fx)) if (CUR_RE.test(k) && num(v) > 0) next.fx[k] = num(v);
          next.fx.USD = 1;
        }
        if (Array.isArray(s.cogs_departments)) next.cogs_departments = s.cogs_departments.map((x) => String(x).slice(0, 80)).slice(0, 30);
        if (Array.isArray(s.hidden_categories)) next.hidden_categories = s.hidden_categories.map((x) => String(x).slice(0, 80)).slice(0, 30);
        const { rows: [p] } = await pool.query(`UPDATE zbb_plans SET settings = $1, updated_at = now() WHERE id = $2 RETURNING *`, [next, plan.id]);
        return res.json({ plan: p });
      }

      if (action === 'refresh_actuals') {
        const plan = await planById(b.plan_id);
        if (!plan) return res.status(404).json({ error: 'plan not found' });
        const start = DATE_RE.test(b.start || '') ? b.start : plan.settings.base_start;
        const end = DATE_RE.test(b.end || '') ? b.end : plan.settings.base_end;
        if (!start || !end || start > end) return res.status(400).json({ error: 'bad baseline window' });
        const months = monthsBetween(start, end);
        if (months.length > 24) return res.status(400).json({ error: 'baseline window is limited to 24 months' });

        const conn = await getActiveConnection(pool);
        if (!conn) return res.status(503).json({ error: 'QuickBooks is not connected' });
        const token = await ensureToken(pool, conn);
        const base = getQboBase();
        const rid = conn.realm_id;

        const all = [];
        for (const mo of months) {
          const url = `${base}/v3/company/${rid}/reports/ProfitAndLossDetail?start_date=${mo}-01&end_date=${monthEnd(mo)}` +
            `&accounting_method=Accrual&minorversion=65`;
          const rep = await qboFetch(url, token);
          for (const r of parseDetail(rep)) if (/^6/.test(r.acct)) all.push(r);
        }
        let known = [];
        try { ({ rows: known } = await pool.query(`SELECT DISTINCT display_name FROM qbo_vendors WHERE display_name IS NOT NULL`)); } catch { known = []; }
        const vendorOf = vendorNamer(all, known.map((k) => k.display_name));
        const agg = new Map();
        for (const r of all) {
          const v = vendorOf(r).slice(0, 200);
          const k = `${r.date.slice(0, 7)}\u0001${r.acct}\u0001${v}`;
          const e = agg.get(k) || { month: r.date.slice(0, 7), acct: r.acct, acctName: r.acctName, vendor: v, amount: 0, txns: 0 };
          e.amount += r.amount; e.txns++;
          agg.set(k, e);
        }
        const cats = await categoryMap(pool);
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query(`DELETE FROM zbb_actuals WHERE plan_id = $1`, [plan.id]);
          const rows = [...agg.values()];
          for (let i = 0; i < rows.length; i += 200) {
            const chunk = rows.slice(i, i + 200);
            const vals = []; const params = [];
            chunk.forEach((e, j) => {
              const o = j * 7;
              vals.push(`($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6},$${o + 7})`);
              params.push(plan.id, e.month, e.acct, e.acctName, e.vendor, Math.round(e.amount * 100) / 100, e.txns);
            });
            await client.query(`INSERT INTO zbb_actuals (plan_id, month, account_num, account_name, vendor, amount, txns) VALUES ${vals.join(',')}`, params);
          }
          // One line per vendor x account. Pay, benefits, payroll tax, 401k, bonus and severance
          // (60010-60059) are planned on the org chart instead.
          const { rows: tot } = await client.query(
            `SELECT vendor, account_num, max(account_name) AS account_name, sum(amount)::float AS total
               FROM zbb_actuals WHERE plan_id = $1 GROUP BY 1, 2 HAVING abs(sum(amount)) >= 1`, [plan.id]);
          let added = 0; let updated = 0;
          for (const t of tot) {
            const category = catFor(cats, t.account_num);
            if (/^600[1-5]\d$/.test(t.account_num)) continue; // salaries, benefits, taxes, 401k, bonus, severance
            const total = Math.round(t.total * 100) / 100;
            const r = await client.query(
              `INSERT INTO zbb_lines (plan_id, vendor, account_num, account_name, category, kind, baseline, amount, status, source)
               VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 'review', 'qbo')
               ON CONFLICT (plan_id, vendor, account_num) WHERE source = 'qbo'
               DO UPDATE SET baseline = EXCLUDED.baseline, account_name = EXCLUDED.account_name, category = EXCLUDED.category, updated_at = now()
               RETURNING (xmax = 0) AS inserted`,
              [plan.id, t.vendor, t.account_num, t.account_name, category,
                /^605(20|25)$/.test(t.account_num) || category === 'Software and Subscriptions' ? 'software' : 'vendor', total]);
            if (r.rows[0]?.inserted) added++; else updated++;
          }
          // Lines whose vendor no longer has baseline spend keep their row, with a zero baseline.
          await client.query(
            `UPDATE zbb_lines l SET baseline = 0 WHERE l.plan_id = $1 AND l.source = 'qbo'
               AND NOT EXISTS (SELECT 1 FROM zbb_actuals a WHERE a.plan_id = l.plan_id AND a.vendor = l.vendor AND a.account_num = l.account_num)`, [plan.id]);
          const settings = { ...plan.settings, base_start: start, base_end: end };
          await client.query(`UPDATE zbb_plans SET actuals_refreshed_at = now(), settings = $2, updated_at = now() WHERE id = $1`, [plan.id, settings]);
          await client.query('COMMIT');
          return res.json({ ok: true, months: months.length, txns: all.length, added, updated });
        } catch (e) {
          await client.query('ROLLBACK').catch(() => {});
          throw e;
        } finally {
          client.release();
        }
      }

      if (action === 'import_people') {
        const plan = await planById(b.plan_id);
        if (!plan) return res.status(404).json({ error: 'plan not found' });
        const rows = (Array.isArray(b.rows) ? b.rows : []).slice(0, 2000)
          .map((r) => ({
            name: str(r.name, 120), title: str(r.title, 120), department: str(r.department, 80), manager: str(r.manager, 120),
            currency: CUR_RE.test(String(r.currency || '').toUpperCase()) ? String(r.currency).toUpperCase() : 'USD',
            salary: Math.max(0, num(r.salary)),
          }))
          .filter((r) => r.name);
        if (!rows.length) return res.status(400).json({ error: 'No rows with an employee name were found.' });
        const { rows: profs } = await pool.query(
          `SELECT p.id, lower(p.display_name) AS n FROM profiles p JOIN org_memberships om ON om.user_id = p.id AND om.org_id = $1`, [ORG]);
        const profBy = new Map(profs.map((x) => [x.n, x.id]));
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query(`DELETE FROM zbb_people WHERE plan_id = $1`, [plan.id]);
          const ids = new Map();
          const insert = async (r, note) => {
            const { rows: [x] } = await client.query(
              `INSERT INTO zbb_people (plan_id, profile_id, name, title, department, status, currency, current_salary, salary, is_existing, source, note)
               VALUES ($1, $2, $3, $4, $5, 'keep', $6, $7, $7, true, 'hris', $8) RETURNING id`,
              [plan.id, profBy.get(r.name.toLowerCase()) || null, r.name, r.title, r.department, r.currency, r.salary, note || null]);
            ids.set(r.name.toLowerCase(), x.id);
          };
          for (const r of rows) if (!ids.has(r.name.toLowerCase())) await insert(r);
          // Managers who are not in the export (e.g. the CEO) become top-level placeholders.
          for (const m of new Set(rows.map((r) => r.manager).filter(Boolean))) {
            if (!ids.has(m.toLowerCase())) await insert({ name: m, currency: 'USD', salary: 0 }, 'Not in the HRIS export: add comp if it belongs in this budget');
          }
          for (const r of rows) {
            const me = ids.get(r.name.toLowerCase()); const mg = r.manager && ids.get(r.manager.toLowerCase());
            if (mg && mg !== me) await client.query(`UPDATE zbb_people SET manager_id = $1 WHERE id = $2`, [mg, me]);
          }
          const fx = { ...DEFAULT_FX, ...(plan.settings.fx || {}) };
          await client.query(`UPDATE zbb_plans SET settings = $2, updated_at = now() WHERE id = $1`,
            [plan.id, { ...plan.settings, fx, cogs_departments: plan.settings.cogs_departments || ['KY Plant'], people_imported_at: new Date().toISOString() }]);
          await client.query('COMMIT');
        } catch (e) {
          await client.query('ROLLBACK').catch(() => {});
          throw e;
        } finally {
          client.release();
        }
        const { rows: people } = await pool.query(`SELECT * FROM zbb_people WHERE plan_id = $1 ORDER BY name`, [plan.id]);
        const missingFx = [...new Set(rows.map((r) => r.currency))].filter((c) => !({ ...DEFAULT_FX, ...(plan.settings.fx || {}) })[c]);
        return res.json({ people, imported: rows.length, missing_fx: missingFx });
      }

      if (action === 'bulk_people') {
        const plan = await planById(b.plan_id);
        if (!plan) return res.status(404).json({ error: 'plan not found' });
        const ids = (Array.isArray(b.ids) ? b.ids : []).filter((x) => UUID_RE.test(String(x))).slice(0, 2000);
        if (!ids.length) return res.status(400).json({ error: 'no people selected' });
        let q;
        if (b.op === 'raise') {
          const pct = Math.min(200, Math.max(-100, num(b.pct)));
          q = pool.query(`UPDATE zbb_people SET salary = round(current_salary * (1 + $3::numeric / 100)), updated_at = now()
                           WHERE plan_id = $1 AND id = ANY($2::uuid[]) RETURNING *`, [plan.id, ids, pct]);
        } else if (b.op === 'reset') {
          q = pool.query(`UPDATE zbb_people SET salary = current_salary, updated_at = now()
                           WHERE plan_id = $1 AND id = ANY($2::uuid[]) AND current_salary > 0 RETURNING *`, [plan.id, ids]);
        } else if (b.op === 'status' && ['keep', 'remove'].includes(b.status)) {
          q = pool.query(`UPDATE zbb_people SET status = CASE WHEN $3 = 'keep' AND NOT is_existing THEN 'new' ELSE $3 END,
                                 end_month = CASE WHEN $3 = 'remove' THEN 0 ELSE 12 END, updated_at = now()
                           WHERE plan_id = $1 AND id = ANY($2::uuid[]) RETURNING *`, [plan.id, ids, b.status]);
        } else return res.status(400).json({ error: 'unknown bulk operation' });
        const { rows } = await q;
        return res.json({ people: rows });
      }

      if (action === 'save_person') {
        const plan = await planById(b.plan_id);
        if (!plan) return res.status(404).json({ error: 'plan not found' });
        const p = b.person || {};
        const status = ['keep', 'remove', 'new'].includes(p.status) ? p.status : 'keep';
        const manager = UUID_RE.test(String(p.manager_id || '')) ? p.manager_id : null;
        const cur = CUR_RE.test(String(p.currency || '')) ? p.currency : 'USD';
        const vals = [str(p.name, 120) || 'New role', str(p.title, 120), str(p.department, 80), manager, status,
          Math.max(0, num(p.salary)), Math.max(0, num(p.bonus)), int(p.start_month, 1, 12, 1), int(p.end_month, 0, 12, 12), str(p.note, 1000),
          cur, Math.max(0, num(p.current_salary))];
        if (UUID_RE.test(String(p.id || ''))) {
          if (manager === p.id) return res.status(400).json({ error: 'someone cannot report to themselves' });
          const { rows: [r] } = await pool.query(
            `UPDATE zbb_people SET name=$1, title=$2, department=$3, manager_id=$4, status=$5, salary=$6, bonus=$7,
                    start_month=$8, end_month=$9, note=$10, currency=$11, current_salary=$12, updated_at=now()
              WHERE id=$13 AND plan_id=$14 RETURNING *`, [...vals, p.id, plan.id]);
          if (!r) return res.status(404).json({ error: 'person not found' });
          return res.json({ person: r });
        }
        const { rows: [r] } = await pool.query(
          `INSERT INTO zbb_people (plan_id, name, title, department, manager_id, status, salary, bonus, start_month, end_month, note, currency, current_salary, source)
           VALUES ($13, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'manual') RETURNING *`, [...vals, plan.id]);
        return res.json({ person: r });
      }

      if (action === 'delete_person') {
        if (!UUID_RE.test(String(b.id || ''))) return res.status(400).json({ error: 'id required' });
        const { rows: [p] } = await pool.query(
          `SELECT z.* FROM zbb_people z JOIN zbb_plans pl ON pl.id = z.plan_id AND pl.org_id = $2 WHERE z.id = $1`, [b.id, ORG]);
        if (!p) return res.status(404).json({ error: 'not found' });
        if (p.is_existing || p.profile_id) return res.status(400).json({ error: 'Existing staff are marked as removed rather than deleted, so the saving shows.' });
        await pool.query(`UPDATE zbb_people SET manager_id = $2 WHERE manager_id = $1`, [p.id, p.manager_id]);
        await pool.query(`DELETE FROM zbb_people WHERE id = $1`, [p.id]);
        return res.json({ ok: true });
      }

      if (action === 'save_line') {
        const plan = await planById(b.plan_id);
        if (!plan) return res.status(404).json({ error: 'plan not found' });
        const l = b.line || {};
        const status = ['review', 'keep', 'change', 'remove', 'new'].includes(l.status) ? l.status : 'review';
        const seats = l.seats == null || l.seats === '' ? null : Math.max(0, num(l.seats));
        const unit = l.unit_cost == null || l.unit_cost === '' ? null : Math.max(0, num(l.unit_cost));
        const amount = status === 'remove' || status === 'review' ? 0 : Math.max(0, num(l.amount));
        const fields = [str(l.vendor, 200) || 'New line', str(l.account_num, 10), str(l.account_name, 200), str(l.category, 80),
          ['software', 'vendor', 'other'].includes(l.kind) ? l.kind : 'vendor', amount, status, seats, unit,
          str(l.billing, 40), str(l.owner, 120), str(l.note, 1000)];
        if (UUID_RE.test(String(l.id || ''))) {
          const { rows: [r] } = await pool.query(
            `UPDATE zbb_lines SET vendor=$1, account_num=$2, account_name=$3, category=$4, kind=$5, amount=$6, status=$7, seats=$8,
                    unit_cost=$9, billing=$10, owner=$11, note=$12, updated_at=now()
              WHERE id=$13 AND plan_id=$14 RETURNING *`, [...fields, l.id, plan.id]);
          if (!r) return res.status(404).json({ error: 'line not found' });
          return res.json({ line: r });
        }
        const { rows: [r] } = await pool.query(
          `INSERT INTO zbb_lines (vendor, account_num, account_name, category, kind, amount, status, seats, unit_cost, billing, owner, note, plan_id, baseline, source)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
          [...fields, plan.id, Math.max(0, num(l.baseline)), str(l.source, 20) || 'manual']);
        return res.json({ line: r });
      }

      if (action === 'delete_line') {
        if (!UUID_RE.test(String(b.id || ''))) return res.status(400).json({ error: 'id required' });
        const { rows: [l] } = await pool.query(
          `SELECT z.id, z.source FROM zbb_lines z JOIN zbb_plans pl ON pl.id = z.plan_id AND pl.org_id = $2 WHERE z.id = $1`, [b.id, ORG]);
        if (!l) return res.status(404).json({ error: 'not found' });
        if (l.source === 'qbo') return res.status(400).json({ error: 'Lines with QuickBooks spend are marked as removed rather than deleted, so the saving shows.' });
        await pool.query(`DELETE FROM zbb_lines WHERE id = $1`, [l.id]);
        return res.json({ ok: true });
      }

      if (action === 'search') {
        const plan = await planById(b.plan_id);
        if (!plan) return res.status(404).json({ error: 'plan not found' });
        const q = String(b.q || '').trim().slice(0, 80);
        if (q.length < 2) return res.json({ results: [] });
        const like = `%${q.replace(/[%_\\]/g, (c) => '\\' + c)}%`;
        const { rows: spend } = await pool.query(
          `SELECT vendor, account_num, max(account_name) AS account_name, sum(amount)::float AS total, sum(txns)::int AS txns,
                  count(DISTINCT month)::int AS months, max(month) AS last_month
             FROM zbb_actuals WHERE plan_id = $1 AND vendor ILIKE $2
            GROUP BY 1, 2 ORDER BY sum(amount) DESC LIMIT 40`, [plan.id, like]);
        let qbo = [];
        try {
          ({ rows: qbo } = await pool.query(
            `SELECT DISTINCT display_name AS vendor FROM qbo_vendors WHERE display_name ILIKE $1 ORDER BY 1 LIMIT 15`, [like]));
        } catch { qbo = []; }
        const cats = await categoryMap(pool);
        const seen = new Set(spend.map((s) => s.vendor.toLowerCase()));
        return res.json({
          results: [
            ...spend.map((s) => ({ ...s, category: catFor(cats, s.account_num), source: 'qbo' })),
            ...qbo.filter((v) => v.vendor && !seen.has(v.vendor.toLowerCase())).map((v) => ({ vendor: v.vendor, total: 0, source: 'qbo_vendor' })),
          ],
        });
      }

      if (action === 'price_lookup') {
        const name = String(b.name || '').trim().slice(0, 100);
        if (name.length < 2) return res.status(400).json({ error: 'name required' });
        const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
        if (!apiKey) return res.status(503).json({ error: 'AI pricing lookup is not configured' });
        const client = new Anthropic({ apiKey });
        const models = (process.env.ZBB_MODELS || 'claude-sonnet-5-5,claude-sonnet-4-6').split(',').map((s) => s.trim()).filter(Boolean);
        const prompt = `Find the current published list pricing for the business software or service "${name}"` +
          `${b.context ? ` (context: ${String(b.context).slice(0, 200)})` : ''}. Search the vendor's own pricing page first.\n` +
          `Reply with ONLY a JSON object, no prose and no markdown fences:\n` +
          `{"product":"official product name","vendor":"company","category":"one of: Software and Subscriptions, Consultants, Brand/Other/Marketing, Non-Fixed and Other",` +
          `"plans":[{"name":"plan name","price":number,"unit":"per user | per month | per year | flat | usage","billing":"monthly | annual","annual_estimate_per_unit":number}],` +
          `"notes":"one or two sentences: what drives cost, minimums, whether enterprise pricing is quote-only","confidence":"high | medium | low",` +
          `"sources":["https://..."]}\n` +
          `Use USD. If pricing is quote-only, give an empty plans array and say so in notes. Never invent prices.`;
        let r; let lastErr;
        for (const model of models) {
          try {
            r = await client.messages.create({
              model, max_tokens: 2000,
              tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 4 }],
              messages: [{ role: 'user', content: prompt }],
            });
            break;
          } catch (e) { lastErr = e; if (!(e?.status === 404 || /model/i.test(e?.message || ''))) throw e; }
        }
        if (!r) throw lastErr || new Error('no model available');
        const text = (r.content || []).filter((x) => x.type === 'text').map((x) => x.text).join('');
        const m = text.match(/\{[\s\S]*\}/);
        let out;
        try { out = JSON.parse(m ? m[0] : text); } catch { out = { product: name, plans: [], notes: text.slice(0, 600), confidence: 'low', sources: [] }; }
        out.plans = Array.isArray(out.plans) ? out.plans.slice(0, 8) : [];
        out.sources = Array.isArray(out.sources) ? out.sources.filter((u) => /^https?:\/\//.test(u)).slice(0, 5) : [];
        return res.json(out);
      }

      return res.status(400).json({ error: 'unknown action' });
    } catch (e) {
      console.error('[zbb]', e?.message || e);
      res.status(502).json({ error: String(e?.message || e).slice(0, 300) });
    }
  });
};
