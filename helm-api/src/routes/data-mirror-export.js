// POST /data-mirror-export — copies a FIXED set of Cloud SQL reports into a
// Google Sheet so they can be read (by Ben, or an analyst agent via Drive)
// without database access. No caller-supplied SQL: every query is defined here.
//
// Trigger: Cloud Scheduler calls this route DIRECTLY (not via /cron, whose
// fire-and-forget dispatch lets Cloud Run throttle CPU once it has replied).
// Suggested: two runs nightly, e.g. 07:05 and 07:25 UTC — the second picks up
// anything the first could not fit in its time budget.
//
// Auth: header X-Cron-Secret must equal env CRON_SHARED_SECRET (same secret
// Cloud Scheduler already uses). Fails closed if any setting is missing.
//
// Config (env on the helm-api Cloud Run service):
//   HELM_MIRROR_SHEET_ID   target spreadsheet ID (share it with the service
//                          account's client_email as Editor)
//   GOOGLE_SERVICE_ACCOUNT service-account JSON (Secret Manager)
//   HELM_MIRROR_ORG_ID     optional, defaults to the Earth Breeze org
//
// helm-api runs with --timeout=60s, so the job stops starting new datasets
// after TIME_BUDGET_MS and records what it skipped in the `_meta` tab; the
// next run does the stalest datasets first.

const crypto = require('crypto');
const { getGoogleAccessToken, loadServiceAccount } = require('../lib/google-jwt');

const DEFAULT_ORG = 'a0000000-0000-0000-0000-000000000001';
const TIME_BUDGET_MS = 45_000;
const MAX_ROWS = 200_000;          // per dataset
const MAX_TOTAL_CELLS = 9_000_000; // Sheets hard limit is 10M per spreadsheet
const CELLS_PER_WRITE = 150_000;   // keep each values:batchUpdate request modest
const MAX_CELL_CHARS = 49_000;     // Sheets limit is 50,000 characters per cell
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';

// Each dataset: tab name, SQL ($1 = org id), and the column used to report freshness.
const DATASETS = [
  {
    tab: 'pl_monthly',
    fresh: 'period_month',
    sql: `SELECT period_month, account_type, classification, account_name, amount,
                 synced_at::text AS synced_at
            FROM qbo_pl_monthly WHERE org_id = $1
           ORDER BY period_month, account_type, account_name`,
  },
  {
    tab: 'sales_daily_by_category',
    fresh: 'sale_date',
    sql: `SELECT s.sale_date::text AS sale_date,
                 COALESCE(m.product_category, '(unmapped)') AS product_category,
                 s.channel,
                 SUM(s.units_sold) AS units_sold,
                 SUM(s.units_sold * COALESCE(s.units_per_sku, 1)) AS single_pack_units,
                 SUM(s.gross_revenue) AS gross_revenue,
                 SUM(s.net_revenue) AS net_revenue,
                 SUM(s.orders_count) AS orders
            FROM dp_daily_sales s
            LEFT JOIN dp_sku_master m ON m.sku = s.sku AND m.org_id = s.org_id
           WHERE s.org_id = $1 AND s.sale_date >= CURRENT_DATE - 800
           GROUP BY 1, 2, 3 ORDER BY 1, 2, 3`,
  },
  {
    tab: 'sales_monthly_by_sku',
    fresh: 'month',
    sql: `SELECT to_char(date_trunc('month', s.sale_date), 'YYYY-MM') AS month,
                 s.sku, s.base_product,
                 COALESCE(m.product_category, '(unmapped)') AS product_category,
                 s.channel, s.country, s.is_subscription,
                 SUM(s.units_sold) AS units_sold,
                 SUM(s.units_sold * COALESCE(s.units_per_sku, 1)) AS single_pack_units,
                 SUM(s.gross_revenue) AS gross_revenue,
                 SUM(s.net_revenue) AS net_revenue,
                 SUM(s.orders_count) AS orders
            FROM dp_daily_sales s
            LEFT JOIN dp_sku_master m ON m.sku = s.sku AND m.org_id = s.org_id
           WHERE s.org_id = $1 AND s.sale_date >= date_trunc('month', CURRENT_DATE) - INTERVAL '26 months'
           GROUP BY 1, 2, 3, 4, 5, 6, 7 ORDER BY 1, 2, 5, 6`,
  },
  {
    tab: 'sku_master',
    fresh: 'updated_at',
    sql: `SELECT sku, product_title, variant_title, base_product, product_category,
                 units_per_sku, is_gwp, is_subscription, is_one_time, current_price,
                 cogs_per_unit, status, updated_at::text AS updated_at
            FROM dp_sku_master WHERE org_id = $1 ORDER BY sku`,
  },
  {
    tab: 'inventory_valuation',
    fresh: 'synced_at',
    sql: `SELECT sku, name, qty_on_hand, unit_cost, effective_unit_cost, total_cost_value,
                 units_90d, avg_net_unit_price_90d, unit_margin_pct, synced_at::text AS synced_at
            FROM qbo_inventory_valuation WHERE org_id = $1 ORDER BY sku`,
  },
  {
    tab: 'threepl_invoice_lines',
    fresh: 'period_end',
    sql: `SELECT p.code AS provider, i.invoice_number,
                 i.period_start::text AS period_start, i.period_end::text AS period_end,
                 l.canonical_category, l.description, l.uom, l.rate, l.quantity, l.amount
            FROM wms_3pl_invoice_lines l
            JOIN wms_3pl_invoices i ON i.id = l.invoice_id
            JOIN wms_3pl_providers p ON p.id = i.provider_id
           WHERE l.org_id = $1
           ORDER BY i.period_start, i.invoice_number, l.line_no`,
  },
  { tab: 'okr_objectives', fresh: 'updated_at',
    sql: `SELECT * FROM objectives WHERE org_id = $1 AND deleted_at IS NULL ORDER BY sort_order` },
  { tab: 'okr_key_results', fresh: 'updated_at',
    sql: `SELECT * FROM key_results WHERE org_id = $1 AND deleted_at IS NULL ORDER BY objective_id, sort_order` },
  { tab: 'okr_milestones', fresh: 'end_date',
    sql: `SELECT m.* FROM okr_milestones m
           WHERE m.objective_id IN (SELECT id FROM objectives WHERE org_id = $1)
           ORDER BY m.key_result_id, m.sort_order` },
  { tab: 'okr_milestone_updates', fresh: 'period_start',
    sql: `SELECT * FROM milestone_updates WHERE org_id = $1 ORDER BY milestone_id, period_start` },
  { tab: 'l10_metrics', fresh: 'updated_at',
    sql: `SELECT * FROM l10_metrics WHERE org_id = $1 ORDER BY sort_order` },
];

const NUMERIC_OIDS = new Set([20, 21, 23, 700, 701, 1700]);
const RAW_TEXT_OIDS = new Set([1082, 1083, 1114, 1184, 1266]); // date/time types: keep server text
const rawTypes = {
  getTypeParser(oid, format) {
    if (RAW_TEXT_OIDS.has(oid)) return (v) => v;
    return require('pg').types.getTypeParser(oid, format);
  },
};

function toCell(v, oid) {
  if (v === null || v === undefined) return '';
  if (NUMERIC_OIDS.has(oid)) { const n = Number(v); return Number.isFinite(n) ? n : String(v); }
  if (typeof v === 'boolean' || typeof v === 'number') return v;
  if (v instanceof Date) return v.toISOString();
  let s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (s.length > MAX_CELL_CHARS) s = s.slice(0, MAX_CELL_CHARS) + '…[truncated]';
  return s;
}

function secretOk(provided, expected) {
  const a = crypto.createHash('sha256').update(String(provided || '')).digest();
  const b = crypto.createHash('sha256').update(String(expected || '')).digest();
  return crypto.timingSafeEqual(a, b);
}

async function queryDataset(pool, ds, orgId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN TRANSACTION READ ONLY');
    await client.query("SET LOCAL statement_timeout = '20s'");
    const r = await client.query({ text: ds.sql, values: [orgId], types: rawTypes });
    await client.query('ROLLBACK');
    const fields = r.fields.map((f) => ({ name: f.name, oid: f.dataTypeID }));
    const truncated = r.rows.length > MAX_ROWS;
    const src = truncated ? r.rows.slice(0, MAX_ROWS) : r.rows;
    const values = [fields.map((f) => f.name)];
    let fresh = '';
    for (const row of src) {
      values.push(fields.map((f) => toCell(row[f.name], f.oid)));
      const fv = row[ds.fresh];
      if (fv !== null && fv !== undefined && String(fv) > fresh) fresh = String(fv);
    }
    return { values, rows: src.length, cols: fields.length, truncated, fresh };
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    throw e;
  } finally {
    client.release();
  }
}

async function gapi(token, method, url, body) {
  const r = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Sheets ${method} ${url.split('?')[0].slice(-60)} → ${r.status}: ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

const q = (tab) => `'${tab}'`;

async function readMeta(token, sheetId) {
  try {
    const r = await gapi(token, 'GET', `${SHEETS}/${sheetId}/values/${encodeURIComponent(q('_meta') + '!A2:H')}`);
    const meta = {};
    for (const row of r.values || []) if (row[0]) meta[row[0]] = row;
    return meta;
  } catch { return {}; }
}

async function runExport(pool, { sheetId, orgId, token, only, now = Date.now }) {
  const started = now();
  const prevMeta = await readMeta(token, sheetId);
  // Stalest first, so anything skipped last run goes first this run.
  let order = DATASETS.filter((d) => !only || only.includes(d.tab));
  order = order.slice().sort((a, b) => String((prevMeta[a.tab] || [])[5] || '').localeCompare(String((prevMeta[b.tab] || [])[5] || '')));

  const results = {};
  const ready = [];
  let totalCells = 0;
  for (const ds of order) {
    if (now() - started > TIME_BUDGET_MS * 0.6) { results[ds.tab] = { status: 'skipped_time_budget' }; continue; }
    const t0 = now();
    try {
      const out = await queryDataset(pool, ds, orgId);
      const cells = out.values.length * Math.max(out.cols, 1);
      if (totalCells + cells > MAX_TOTAL_CELLS) { results[ds.tab] = { status: 'skipped_cell_limit', rows: out.rows }; continue; }
      totalCells += cells;
      ready.push({ ds, out });
      results[ds.tab] = { status: 'queried', rows: out.rows, truncated: out.truncated, fresh: out.fresh, ms: now() - t0 };
    } catch (e) {
      results[ds.tab] = { status: 'error', error: String(e.message || e).slice(0, 300) };
    }
  }

  if (ready.length) {
    const book = await gapi(token, 'GET', `${SHEETS}/${sheetId}?fields=sheets.properties(sheetId,title)`);
    const ids = {};
    for (const s of book.sheets || []) ids[s.properties.title] = s.properties.sheetId;
    const wanted = [...ready.map((r) => r.ds.tab), '_meta'];
    const missing = wanted.filter((t) => ids[t] === undefined);
    if (missing.length) {
      const add = await gapi(token, 'POST', `${SHEETS}/${sheetId}:batchUpdate`, {
        requests: missing.map((title) => ({ addSheet: { properties: { title } } })),
      });
      for (const rep of add.replies || []) if (rep.addSheet) ids[rep.addSheet.properties.title] = rep.addSheet.properties.sheetId;
    }
    // Size each tab exactly to its data, then clear it.
    await gapi(token, 'POST', `${SHEETS}/${sheetId}:batchUpdate`, {
      requests: ready.map(({ ds, out }) => ({
        updateSheetProperties: {
          properties: { sheetId: ids[ds.tab], gridProperties: { rowCount: Math.max(out.values.length, 2), columnCount: Math.max(out.cols, 1), frozenRowCount: 1 } },
          fields: 'gridProperties(rowCount,columnCount,frozenRowCount)',
        },
      })),
    });
    await gapi(token, 'POST', `${SHEETS}/${sheetId}/values:batchClear`, { ranges: ready.map(({ ds }) => q(ds.tab)) });

    // Write in batches of ~CELLS_PER_WRITE cells.
    let batch = []; let batchCells = 0;
    const flush = async () => {
      if (!batch.length) return;
      await gapi(token, 'POST', `${SHEETS}/${sheetId}/values:batchUpdate`, { valueInputOption: 'RAW', data: batch });
      batch = []; batchCells = 0;
    };
    for (const { ds, out } of ready) {
      const width = Math.max(out.cols, 1);
      const step = Math.max(1, Math.floor(CELLS_PER_WRITE / width));
      for (let i = 0; i < out.values.length; i += step) {
        const slice = out.values.slice(i, i + step);
        batch.push({ range: `${q(ds.tab)}!A${i + 1}`, values: slice });
        batchCells += slice.length * width;
        if (batchCells >= CELLS_PER_WRITE) await flush();
      }
      results[ds.tab].status = 'written';
    }
    await flush();
  }

  // _meta: one row per dataset; keep previous rows for datasets not refreshed this run.
  const stamp = new Date(started).toISOString();
  const metaRows = DATASETS.map((d) => {
    const r = results[d.tab];
    if (r && r.status === 'written') return [d.tab, r.rows, r.truncated ? 'yes' : 'no', r.fresh || '', 'ok', stamp, r.ms, ''];
    const prev = prevMeta[d.tab] || [d.tab, '', '', '', '', '', '', ''];
    const note = r ? `${r.status}${r.error ? ': ' + r.error : ''}` : 'not requested';
    return [d.tab, prev[1] ?? '', prev[2] ?? '', prev[3] ?? '', prev[4] ?? '', prev[5] ?? '', prev[6] ?? '', `${stamp} ${note}`];
  });
  try {
    await gapi(token, 'POST', `${SHEETS}/${sheetId}/values:batchUpdate`, {
      valueInputOption: 'RAW',
      data: [{ range: `${q('_meta')}!A1`, values: [['dataset', 'rows', 'truncated', 'latest_value_in_data', 'last_status', 'last_exported_at', 'query_ms', 'last_run_note'], ...metaRows] }],
    });
  } catch (e) {
    console.error('[data-mirror] _meta write failed:', e.message);
  }
  return { ms: now() - started, results };
}

module.exports = function (app, { pool }) {
  app.post('/data-mirror-export', async (req, res) => {
    const expected = (process.env.CRON_SHARED_SECRET || '').trim();
    if (!expected) return res.status(503).json({ error: 'not configured' });
    if (!secretOk((req.headers['x-cron-secret'] || '').trim(), expected)) {
      console.warn('[data-mirror] bad secret from', req.headers['x-forwarded-for'] || 'unknown');
      return res.status(401).json({ error: 'unauthorized' });
    }
    const sheetId = (process.env.HELM_MIRROR_SHEET_ID || '').trim();
    if (!sheetId) return res.status(503).json({ error: 'HELM_MIRROR_SHEET_ID not set' });
    let sa;
    try { sa = loadServiceAccount(); } catch (e) { return res.status(503).json({ error: e.message }); }

    const only = Array.isArray(req.body && req.body.datasets) ? req.body.datasets.map(String) : null;
    try {
      const token = await getGoogleAccessToken(sa, 'https://www.googleapis.com/auth/spreadsheets');
      const out = await runExport(pool, { sheetId, orgId: (process.env.HELM_MIRROR_ORG_ID || DEFAULT_ORG).trim(), token, only });
      console.log(JSON.stringify({ event: 'data_mirror_export', ms: out.ms, results: out.results }));
      res.json({ ok: true, ...out });
    } catch (e) {
      console.error('[data-mirror] failed:', e.message);
      res.status(500).json({ error: 'export_failed', message: e.message });
    }
  });
};

module.exports._internal = { DATASETS, toCell, runExport, secretOk };
