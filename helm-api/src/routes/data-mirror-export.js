// POST /data-mirror-export — copies a FIXED set of Cloud SQL reports into a
// Google Sheet so they can be read (by Ben, or an analyst agent via Drive)
// without database access. No caller-supplied SQL: every query is defined here.
//
// Trigger: Cloud Scheduler calls this route DIRECTLY (not via /cron, whose
// fire-and-forget dispatch lets Cloud Run throttle CPU once it has replied).
// Suggested: two runs nightly, e.g. 07:05 and 07:25 UTC — the second picks up
// anything the first could not fit in its time budget.
//
// Auth — either of:
//   * Authorization: Bearer <Google-signed OIDC ID token>, as attached by Cloud
//     Scheduler's "Add OIDC token" option. The token's audience must equal this
//     route's URL and its email must be in HELM_MIRROR_INVOKERS (default: the
//     helm-api runtime service account). No shared secret involved.
//   * X-Cron-Secret header equal to env CRON_SHARED_SECRET.
//
// Sheets access is KEYLESS by default: an access token for the Cloud Run runtime
// service account comes from the metadata server, so no service-account key has
// to be created or stored. Share the target sheet with that account's email as
// Editor. If GOOGLE_SERVICE_ACCOUNT (key JSON) is set it is used instead.
//
// Config (env on the helm-api Cloud Run service):
//   HELM_MIRROR_SHEET_ID   target spreadsheet ID (required)
//   HELM_MIRROR_ORG_ID     optional, defaults to the Earth Breeze org
//   HELM_MIRROR_INVOKERS   optional, comma-separated service-account emails
//   HELM_MIRROR_AUDIENCE   optional, defaults to the public route URL
//
// helm-api runs with --timeout=60s, so the job stops starting new datasets
// after TIME_BUDGET_MS and records what it skipped in the `_meta` tab; the
// next run does the stalest datasets first.

const crypto = require('crypto');
const { getGoogleAccessToken, loadServiceAccount } = require('../lib/google-jwt');

const DEFAULT_ORG = 'a0000000-0000-0000-0000-000000000001';
const DEFAULT_INVOKER = 'helm-app-runtime@helm-496923.iam.gserviceaccount.com';
const DEFAULT_AUDIENCE = 'https://helm-api-qp7o2dcl5a-uc.a.run.app/data-mirror-export';
const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
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
  // Integration health: status and timestamps ONLY. Tokens are never selected,
  // and anything token-shaped in error text is redacted.
  {
    tab: 'sync_health',
    fresh: 'last_synced_at',
    sql: `SELECT 'quickbooks'::text AS integration, realm_id::text AS account, sync_status::text AS status,
                 last_synced_at::text AS last_synced_at, token_expires_at::text AS token_expires_at,
                 connected_at::text AS connected_at,
                 left(regexp_replace(coalesce(last_error, ''), '[A-Za-z0-9._~+/=-]{32,}', '[redacted]', 'g'), 300) AS last_error
            FROM qbo_connections WHERE org_id = $1
          UNION ALL
          SELECT 'shopify', coalesce(store_domain, ''), coalesce(status, ''), updated_at::text, NULL, NULL, ''
            FROM integrations WHERE provider = 'shopify'`,
  },
  {
    tab: 'cron_run_log',
    fresh: 'started_at',
    sql: `SELECT job, path, status_code,
                 left(regexp_replace(coalesce(response_snippet, ''), '[A-Za-z0-9._~+/=-]{32,}', '[redacted]', 'g'), 300) AS response,
                 started_at::text AS started_at, finished_at::text AS finished_at
            FROM cron_run_log
           WHERE started_at > now() - interval '14 days' AND $1::text IS NOT NULL
           ORDER BY started_at DESC LIMIT 2000`,
  },
  // Cutover readiness: schema metadata only (no row data). Shows whether the
  // RLS roles exist, which migrations applied, and per-table RLS/grant status.
  {
    tab: 'db_readiness',
    fresh: 'checked_at',
    sql: `SELECT 'role' AS kind, r.rolname AS name,
                 pg_has_role(current_user, r.oid, 'MEMBER')::text AS a,
                 r.rolbypassrls::text AS b, ''::text AS c, now()::text AS checked_at
            FROM pg_roles r WHERE r.rolname IN ('authenticated', 'anon', 'service_role', current_user) AND $1::text IS NOT NULL
          UNION ALL
          SELECT 'migration', filename, applied_at::text, left(sha256, 12), '', now()::text FROM _helm_migrations
          UNION ALL
          SELECT 'auth_fn', p.proname, left(regexp_replace(pg_get_functiondef(p.oid), '[[:space:]]+', ' ', 'g'), 400), '', '', now()::text
            FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'auth' AND p.proname IN ('uid', 'jwt', 'role', 'email')
          UNION ALL
          SELECT 'table', c.relname,
                 c.relrowsecurity::text,
                 (SELECT count(*) FROM pg_policy pol WHERE pol.polrelid = c.oid)::text,
                 CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
                      THEN has_table_privilege('authenticated', c.oid, 'SELECT')::text ELSE 'no role' END
                   || ' / ' || greatest(c.reltuples, 0)::bigint::text,
                 now()::text
            FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
           ORDER BY 1, 2`,
  },
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

// Verify a Google-signed OIDC ID token via Google's tokeninfo endpoint.
async function verifyOidc(idToken, { audience, invokers, fetchImpl = fetch, nowSec = () => Math.floor(Date.now() / 1000) }) {
  if (!idToken) return { ok: false, reason: 'no token' };
  const r = await fetchImpl(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
  if (!r.ok) return { ok: false, reason: `tokeninfo ${r.status}` };
  const t = await r.json();
  const norm = (u) => String(u || '').replace(/\/+$/, '');
  if (!['accounts.google.com', 'https://accounts.google.com'].includes(t.iss)) return { ok: false, reason: 'bad issuer' };
  if (norm(t.aud) !== norm(audience)) return { ok: false, reason: 'bad audience' };
  if (!(t.email_verified === true || t.email_verified === 'true')) return { ok: false, reason: 'email not verified' };
  if (!invokers.includes(String(t.email || '').toLowerCase())) return { ok: false, reason: 'invoker not allowed' };
  if (!(Number(t.exp) > nowSec())) return { ok: false, reason: 'expired' };
  return { ok: true, email: t.email };
}

// Access token for Sheets: key JSON if configured, otherwise the runtime SA via metadata server.
async function getSheetsToken({ fetchImpl = fetch } = {}) {
  if ((process.env.GOOGLE_SERVICE_ACCOUNT || '').trim()) {
    return getGoogleAccessToken(loadServiceAccount(), SHEETS_SCOPE);
  }
  const r = await fetchImpl(
    `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token?scopes=${encodeURIComponent(SHEETS_SCOPE)}`,
    { headers: { 'Metadata-Flavor': 'Google' } },
  );
  if (!r.ok) throw new Error(`metadata token ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const d = await r.json();
  if (!d.access_token) throw new Error('metadata server returned no access_token');
  return d.access_token;
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
    // --- authorise: Scheduler OIDC token, or the shared cron secret ---
    let caller = null;
    const bearer = (req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
    if (bearer) {
      try {
        const v = await verifyOidc(bearer[1].trim(), {
          audience: (process.env.HELM_MIRROR_AUDIENCE || DEFAULT_AUDIENCE).trim(),
          invokers: (process.env.HELM_MIRROR_INVOKERS || DEFAULT_INVOKER).split(',').map((x) => x.trim().toLowerCase()).filter(Boolean),
        });
        if (v.ok) caller = `oidc:${v.email}`;
        else console.warn('[data-mirror] OIDC rejected:', v.reason);
      } catch (e) { console.warn('[data-mirror] OIDC check failed:', e.message); }
    }
    if (!caller) {
      const expected = (process.env.CRON_SHARED_SECRET || '').trim();
      if (expected && secretOk((req.headers['x-cron-secret'] || '').trim(), expected)) caller = 'cron-secret';
    }
    if (!caller) {
      console.warn('[data-mirror] unauthorized from', req.headers['x-forwarded-for'] || 'unknown');
      return res.status(401).json({ error: 'unauthorized' });
    }
    const sheetId = (process.env.HELM_MIRROR_SHEET_ID || '').trim();
    if (!sheetId) return res.status(503).json({ error: 'HELM_MIRROR_SHEET_ID not set' });

    const only = Array.isArray(req.body && req.body.datasets) ? req.body.datasets.map(String) : null;
    try {
      const token = await getSheetsToken();
      const out = await runExport(pool, { sheetId, orgId: (process.env.HELM_MIRROR_ORG_ID || DEFAULT_ORG).trim(), token, only });
      console.log(JSON.stringify({ event: 'data_mirror_export', caller, ms: out.ms, results: out.results }));
      res.json({ ok: true, ...out });
    } catch (e) {
      console.error('[data-mirror] failed:', e.message);
      res.status(500).json({ error: 'export_failed', message: e.message });
    }
  });
};

module.exports._internal = { DATASETS, toCell, runExport, secretOk, verifyOidc, getSheetsToken };
