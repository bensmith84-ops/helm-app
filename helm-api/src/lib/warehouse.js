// Read-only SQL against the data team's BigQuery warehouse, run through
// Metabase's own BigQuery connection with Helm's Metabase API key.
// Only fixed, server-side queries go through here; nothing from a browser.
const METABASE_URL = () => (process.env.METABASE_URL || 'https://metabase.earthbreezedev.com').replace(/\/+$/, '');
const WAREHOUSE_DB_ID = () => Number(process.env.WAREHOUSE_DB_ID || 2);
const PAGE = 1000; // Metabase caps an ad-hoc query result at 2,000 rows

async function mbSql(sql, { fetchImpl = fetch } = {}) {
  const key = process.env.METABASE_API_KEY;
  if (!key) throw new Error('METABASE_API_KEY not configured');
  const r = await fetchImpl(`${METABASE_URL()}/api/dataset`, {
    method: 'POST',
    headers: { 'x-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ database: WAREHOUSE_DB_ID(), type: 'native', native: { query: sql } }),
    signal: AbortSignal.timeout(120000),
  });
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { throw new Error(`Metabase ${r.status}: ${text.slice(0, 200)}`); }
  if (!r.ok || j.error) throw new Error(`Warehouse query failed: ${String(j.error || j.message || r.status).slice(0, 300)}`);
  const cols = (j.data?.cols || []).map((c) => c.name);
  return { cols, rows: (j.data?.rows || []).map((row) => Object.fromEntries(cols.map((c, i) => [c, row[i]]))) };
}

// Runs `sql` (which must end with ORDER BY ...) in pages until a short page.
async function mbSqlAll(sql, opts = {}) {
  const out = [];
  for (let offset = 0; ; offset += PAGE) {
    const { rows } = await mbSql(`${sql} LIMIT ${PAGE} OFFSET ${offset}`, opts);
    out.push(...rows);
    if (rows.length < PAGE) return out;
    if (offset > 200000) throw new Error('warehouse result too large for paging');
  }
}

const day = (v) => (v == null ? null : String(v).slice(0, 10));

module.exports = { mbSql, mbSqlAll, day, PAGE };
