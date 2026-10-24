// POST /metabase-sync - port of supabase/functions/metabase-sync (v18)
//
// Pulls Metabase saved questions ("cards") and loads them into the dp_*
// demand-planning tables. The daily orchestrator (/metabase-daily-sync) calls
// action 'sync_question_to_table' once per card; the MetabaseSync /
// MetabaseBrowser UI uses the other actions.
//
// Actions (body.action):
//   test, list_questions{collection_id?}, list_dashboards,
//   get_dashboard_cards{dashboard_id}, inspect_card{question_id},
//   run_question{question_id, format?, start_date?, end_date?, chunk_days?},
//   run_question_csv{question_id, start_date?, end_date?, chunk_days?},
//   debug_csv{question_id, start_date?, end_date?}, list_collections,
//   sync_question_to_table{question_id, table_name, org_id, start_date?,
//                          end_date?, chunk_days?, stream?}
//
// "stream" here means the Metabase CSV export is parsed incrementally from the
// response body and flushed to Postgres every 100 rows (low memory); the HTTP
// response to the caller is still a single JSON object, as in the Deno version.
//
// Inserts go through json_populate_recordset so values are coerced to column
// types the same way PostgREST did for supabase-js .insert().
//
// Env: METABASE_URL (default https://metabase.earthbreezedev.com), METABASE_API_KEY.

const METABASE_URL = (process.env.METABASE_URL || 'https://metabase.earthbreezedev.com').replace(/\/+$/, '');
const METABASE_API_KEY = () => process.env.METABASE_API_KEY || '';

// table_name → date column. Used to scope per-chunk deletes so that successive
// calls with different ranges are additive instead of wiping each other.
const TABLE_DATE_COLUMN = {
  dp_daily_sales: 'sale_date',
  dp_daily_sales_by_warehouse: 'sale_date',
  dp_orders: 'order_date',
  dp_weekly_sales: 'week_start',
  dp_inventory: 'snapshot_date',
};

// table_name comes from the request and is used as an identifier, so it is
// limited to the demand-planning tables (all the UI and the daily sync use).
const TABLE_RE = /^dp_[a-z0-9_]+$/;
const qi = (s) => '"' + String(s).replace(/"/g, '""') + '"';

function mbHeaders(json) {
  const h = { 'x-api-key': METABASE_API_KEY() };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}
async function mbGet(path) {
  const res = await fetch(`${METABASE_URL}/api${path}`, { headers: mbHeaders(false) });
  if (!res.ok) throw new Error(`Metabase ${res.status}: ${(await res.text()).substring(0, 200)}`);
  return res.json();
}
async function mbPost(path, body) {
  const res = await fetch(`${METABASE_URL}/api${path}`, { method: 'POST', headers: mbHeaders(true), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Metabase ${res.status}: ${(await res.text()).substring(0, 200)}`);
  return res.json();
}
async function mbPostCsv(path, body) {
  const res = await fetch(`${METABASE_URL}/api${path}`, { method: 'POST', headers: mbHeaders(true), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Metabase CSV ${res.status}: ${(await res.text()).substring(0, 200)}`);
  return res.text();
}
async function mbPostCsvStream(path, body) {
  const res = await fetch(`${METABASE_URL}/api${path}`, { method: 'POST', headers: mbHeaders(true), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`Metabase CSV ${res.status}: ${(await res.text()).substring(0, 200)}`);
  return res;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === ',') { row.push(field); field = ''; i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
    field += c; i++;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  if (rows.length === 0) return { columns: [], rows: [] };
  const columns = rows[0];
  return { columns, rows: rows.slice(1).filter((r) => r.length === columns.length || (r.length === 1 && r[0] === '')) };
}

function csvCellToValue(cell) {
  if (cell === '' || cell === null || cell === undefined) return null;
  if (cell === 'true') return true;
  if (cell === 'false') return false;
  if (/^-?\d+$/.test(cell)) {
    const n = parseInt(cell, 10);
    if (!isNaN(n) && Math.abs(n) < Number.MAX_SAFE_INTEGER) return n;
  }
  if (/^-?\d*\.\d+$/.test(cell)) {
    const n = parseFloat(cell);
    if (!isNaN(n)) return n;
  }
  return cell;
}

// Incremental CSV parser over a fetch Response body. A '"' that ends a network
// chunk inside a quoted field is held back until the next chunk, so an escaped
// quote ("") split across chunks is not misread (the Deno version could).
async function* streamCsvRows(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let carry = '';
  let row = [];
  let field = '';
  let inQuotes = false;
  const emit = () => { row.push(field); const out = row; row = []; field = ''; return out; };
  const parse = function* (buffer, final) {
    let i = 0;
    while (i < buffer.length) {
      const c = buffer[i];
      if (inQuotes) {
        if (c === '"') {
          if (i + 1 >= buffer.length && !final) { carry = '"'; return; }
          if (buffer[i + 1] === '"') { field += '"'; i += 2; continue; }
          inQuotes = false; i++; continue;
        }
        field += c; i++; continue;
      }
      if (c === '"') { inQuotes = true; i++; continue; }
      if (c === ',') { row.push(field); field = ''; i++; continue; }
      if (c === '\r') { i++; continue; }
      if (c === '\n') { yield emit(); i++; continue; }
      field += c; i++;
    }
  };
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    const buffer = carry + decoder.decode(value, { stream: true });
    carry = '';
    yield* parse(buffer, false);
  }
  const tail = carry + decoder.decode();
  carry = '';
  if (tail) yield* parse(tail, true);
  if (field.length > 0 || row.length > 0) yield emit();
}

function rowsToObjects(result, limit = 100000) {
  const cols = (result.data?.cols || []).map((c) => c.name);
  const rows = (result.data?.rows || []).slice(0, limit);
  return {
    columns: cols,
    row_count: result.data?.rows?.length || 0,
    data: rows.map((row) => { const obj = {}; cols.forEach((c, i) => { obj[c] = row[i]; }); return obj; }),
    truncated: (result.data?.rows?.length || 0) > limit,
  };
}

const COL_RENAMES = { churn: 'churned' };
function cleanCol(col) { const l = String(col).toLowerCase().replace(/[^a-z0-9_]/g, '_'); return COL_RENAMES[l] || l; }

// Caches live for the process (Cloud Run instance), so give them a TTL.
const CACHE_TTL_MS = 10 * 60 * 1000;
const jsonbColsCache = new Map(); // table → { at, set }
async function getJsonbCols(pool, tableName) {
  const hit = jsonbColsCache.get(tableName);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.set;
  let set = new Set();
  try {
    const { rows } = await pool.query(
      `SELECT column_name::text AS column_name, data_type::text AS data_type
         FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position`, [tableName]);
    set = new Set(rows.filter((c) => c.data_type === 'jsonb').map((c) => c.column_name));
  } catch { /* ignore, same as Deno */ }
  jsonbColsCache.set(tableName, { at: Date.now(), set });
  return set;
}

function coerceJsonb(val) {
  if (val === null || val === undefined || val === '') return null;
  if (typeof val === 'object') return val;
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return null;
    try { return JSON.parse(trimmed); } catch { return null; }
  }
  return val;
}

const tagNameCache = new Map(); // questionId → { at, value }

function extractTemplateTags(card) {
  const dq = card?.dataset_query;
  if (!dq) return {};
  const v1 = dq.native?.['template-tags'];
  if (v1 && typeof v1 === 'object' && Object.keys(v1).length) return v1;
  const stages = dq.stages || [];
  for (const st of stages) {
    if (st?.['template-tags'] && typeof st['template-tags'] === 'object' && Object.keys(st['template-tags']).length) {
      return st['template-tags'];
    }
  }
  return {};
}

async function resolveDateTagNames(questionId) {
  const hit = tagNameCache.get(questionId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;
  const put = (v) => { tagNameCache.set(questionId, { at: Date.now(), value: v }); return v; };
  let card;
  try { card = await mbGet(`/card/${questionId}`); } catch { return put(null); }
  const tags = extractTemplateTags(card);
  const names = Object.keys(tags);
  if (names.length === 0) return put(null);
  const startCandidates = ['start_date', 'start', 'from', 'from_date', 'date_start', 'begin', 'begin_date'];
  const endCandidates = ['end_date', 'end', 'to', 'to_date', 'date_end', 'finish', 'finish_date'];
  const lc = (s) => (s || '').toLowerCase();
  const findFirst = (cands) => names.find((n) => cands.includes(lc(n))) || names.find((n) => cands.some((c) => lc(n).includes(c)));
  const start = findFirst(startCandidates) || names[0];
  let end = findFirst(endCandidates) || (names.length > 1 ? names[1] : names[0]);
  if (start === end && names.length > 1) end = names.find((n) => n !== start) || end;
  return put({ start, end });
}

async function dateRangeParams(questionId, startDate, endDate) {
  const tags = await resolveDateTagNames(questionId);
  if (!tags) return [];
  return [
    { type: 'category', value: startDate, target: ['variable', ['template-tag', tags.start]] },
    { type: 'category', value: endDate, target: ['variable', ['template-tag', tags.end]] },
  ];
}

async function runQuestionCsv(questionId, parameters = []) {
  const csv = await mbPostCsv(`/card/${questionId}/query/csv`, { parameters });
  const parsed = parseCsv(csv);
  const data = parsed.rows.map((row) => {
    const obj = {};
    parsed.columns.forEach((c, i) => { obj[c] = csvCellToValue(row[i]); });
    return obj;
  });
  return { columns: parsed.columns, row_count: data.length, data, truncated: false, source: 'csv' };
}

const ymd = (d) => d.toISOString().split('T')[0];

async function runQuestionChunked(questionId, startDate, endDate, chunkDays = 7) {
  const tags = await resolveDateTagNames(questionId);
  if (!tags) {
    const r = await runQuestionCsv(questionId, []);
    return { ...r, source: 'csv-no-params', chunks: [{ start: startDate, end: endDate, rows: r.data.length, note: 'card has no template tags' }] };
  }
  const start = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T00:00:00Z');
  const allRows = [];
  let columns = [];
  const chunkLog = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    const chunkStart = ymd(cursor);
    const chunkEnd = new Date(cursor);
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + chunkDays - 1);
    if (chunkEnd > end) chunkEnd.setTime(end.getTime());
    const chunkEndStr = ymd(chunkEnd);
    const params = await dateRangeParams(questionId, chunkStart, chunkEndStr);
    const r = await runQuestionCsv(questionId, params);
    if (columns.length === 0) columns = r.columns;
    for (const x of r.data) allRows.push(x);
    chunkLog.push({ start: chunkStart, end: chunkEndStr, rows: r.data.length });
    cursor.setUTCDate(cursor.getUTCDate() + chunkDays);
  }
  return { columns, row_count: allRows.length, data: allRows, truncated: false, source: 'csv-chunked', chunks: chunkLog };
}

// ── DB helpers (replace supabase-js delete/insert) ──────────────────────────

// Equivalent of sb.from(table).insert(rows): one statement, columns = union of
// keys, values coerced to column types by json_populate_recordset (as PostgREST
// does). Throws on error (supabase-js returned { error }).
async function insertRows(pool, table, rows) {
  if (!rows.length) return;
  const cols = [];
  const seen = new Set();
  for (const r of rows) for (const k of Object.keys(r)) if (!seen.has(k)) { seen.add(k); cols.push(k); }
  const colList = cols.map(qi).join(', ');
  await pool.query(
    `INSERT INTO public.${qi(table)} (${colList})
     SELECT ${colList} FROM json_populate_recordset(NULL::public.${qi(table)}, $1::json)`,
    [JSON.stringify(rows)]
  );
}

// Equivalent of the unchecked `await sb.from(table).delete()...` calls: errors
// are logged, not thrown, as in the Deno version.
async function deleteScoped(pool, table, orgId, dateCol, startDate, endDate) {
  try {
    if (dateCol) {
      await pool.query(
        `DELETE FROM public.${qi(table)} WHERE org_id = $1 AND ${qi(dateCol)} >= $2 AND ${qi(dateCol)} <= $3`,
        [orgId, startDate, endDate]);
    } else {
      await pool.query(`DELETE FROM public.${qi(table)} WHERE org_id = $1`, [orgId]);
    }
  } catch (e) {
    console.error(`[metabase-sync] delete on ${table} failed:`, e?.message);
  }
}

// Insert a batch; on failure record the error and retry row by row.
async function insertWithFallback(pool, table, batch, errors, label) {
  try {
    await insertRows(pool, table, batch);
    return batch.length;
  } catch (e) {
    errors.push(`${label}: ${String(e?.message || e).substring(0, 200)}`);
    let ok = 0;
    for (const row of batch) {
      try { await insertRows(pool, table, [row]); ok++; } catch { /* skip row */ }
    }
    return ok;
  }
}

// v16: per-chunk streaming sync (date-range scoped delete).
async function streamingChunkedSyncToTable(pool, questionId, tableName, orgId, startDate, endDate, chunkDays = 7) {
  const importedAt = new Date().toISOString();
  const jsonbCols = await getJsonbCols(pool, tableName);
  const tags = await resolveDateTagNames(questionId);
  if (!tags) throw new Error('Card has no date template tags; streaming chunked sync requires them');

  const dateCol = TABLE_DATE_COLUMN[tableName];
  await deleteScoped(pool, tableName, orgId, dateCol, startDate, endDate);

  const start = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T00:00:00Z');
  const cursor = new Date(start);
  let totalSynced = 0;
  let totalRead = 0;
  const errors = [];
  const chunkLog = [];
  let columns = [];
  let cleanedColumns = [];
  const FLUSH_AT = 100;

  while (cursor <= end) {
    const chunkStart = ymd(cursor);
    const chunkEndDate = new Date(cursor);
    chunkEndDate.setUTCDate(chunkEndDate.getUTCDate() + chunkDays - 1);
    if (chunkEndDate > end) chunkEndDate.setTime(end.getTime());
    const chunkEndStr = ymd(chunkEndDate);

    const params = await dateRangeParams(questionId, chunkStart, chunkEndStr);
    const response = await mbPostCsvStream(`/card/${questionId}/query/csv`, { parameters: params });

    let chunkRead = 0;
    let chunkSynced = 0;
    let buffer = [];
    let chunkColumns = [];
    let chunkCleanedCols = [];

    const flush = async () => {
      if (buffer.length === 0) return;
      const batch = buffer; buffer = [];
      chunkSynced += await insertWithFallback(pool, tableName, batch, errors, `chunk ${chunkStart} batch err`);
    };

    for await (const row of streamCsvRows(response)) {
      if (chunkColumns.length === 0) {
        chunkColumns = row;
        chunkCleanedCols = row.map(cleanCol);
        if (columns.length === 0) { columns = chunkColumns; cleanedColumns = chunkCleanedCols; }
        continue;
      }
      if (row.length === 1 && row[0] === '') continue;
      if (row.length !== chunkColumns.length) continue;
      chunkRead++;
      const obj = { org_id: orgId, imported_at: importedAt };
      for (let i = 0; i < chunkCleanedCols.length; i++) {
        const col = chunkCleanedCols[i];
        const raw = csvCellToValue(row[i]);
        obj[col] = jsonbCols.has(col) ? coerceJsonb(raw) : raw;
      }
      buffer.push(obj);
      if (buffer.length >= FLUSH_AT) await flush();
    }
    await flush();

    totalRead += chunkRead;
    totalSynced += chunkSynced;
    chunkLog.push({ start: chunkStart, end: chunkEndStr, rows: chunkRead, synced: chunkSynced });
    cursor.setUTCDate(cursor.getUTCDate() + chunkDays);
  }

  return {
    synced: totalSynced,
    total: totalRead,
    table: tableName,
    columns: cleanedColumns,
    errors: errors.slice(0, 5),
    chunks: chunkLog,
    source: 'csv-stream-chunked',
    jsonb_cols: [...jsonbCols],
    date_col_scope: dateCol || '(none — full org wiped)',
  };
}

// Full-replacement streaming path (card has no template tags).
async function streamingSyncToTable(pool, questionId, tableName, orgId) {
  const importedAt = new Date().toISOString();
  const jsonbCols = await getJsonbCols(pool, tableName);
  const response = await mbPostCsvStream(`/card/${questionId}/query/csv`, { parameters: [] });

  let columns = [];
  let cleanedColumns = [];
  let rowsRead = 0;
  let synced = 0;
  const errors = [];
  let buffer = [];
  const FLUSH_AT = 100;

  const flush = async () => {
    if (buffer.length === 0) return;
    const batch = buffer; buffer = [];
    synced += await insertWithFallback(pool, tableName, batch, errors, 'batch err');
  };

  await deleteScoped(pool, tableName, orgId, null);

  for await (const row of streamCsvRows(response)) {
    if (columns.length === 0) { columns = row; cleanedColumns = columns.map(cleanCol); continue; }
    if (row.length === 1 && row[0] === '') continue;
    if (row.length !== columns.length) continue;
    rowsRead++;
    const obj = { org_id: orgId, imported_at: importedAt };
    for (let i = 0; i < cleanedColumns.length; i++) {
      const col = cleanedColumns[i];
      const raw = csvCellToValue(row[i]);
      obj[col] = jsonbCols.has(col) ? coerceJsonb(raw) : raw;
    }
    buffer.push(obj);
    if (buffer.length >= FLUSH_AT) await flush();
  }
  await flush();
  return { synced, total: rowsRead, table: tableName, columns: cleanedColumns, errors: errors.slice(0, 5), source: 'csv-stream', jsonb_cols: [...jsonbCols] };
}

// A sync target is a public dp_* base table with an imported_at column (the
// Metabase-fed tables). This keeps user-authored dp_* tables (dp_launches,
// dp_forecasts, ...) from being wiped through this endpoint.
async function tableExists(pool, tableName) {
  const { rows } = await pool.query(
    `SELECT 1 FROM information_schema.tables t
       JOIN information_schema.columns c
         ON c.table_schema = t.table_schema AND c.table_name = t.table_name AND c.column_name = 'imported_at'
      WHERE t.table_schema = 'public' AND t.table_type = 'BASE TABLE' AND t.table_name = $1`, [tableName]);
  return rows.length > 0;
}

module.exports = function (app, { pool }) {
  app.post('/metabase-sync', async (req, res) => {
    const json = (d, s = 200) => res.status(s).json(d);
    try {
      if (!METABASE_API_KEY()) return json({ error: 'METABASE_API_KEY not configured' }, 500);
      const body = req.body || {};
      const { action } = body;

      if (action === 'test') {
        const user = await mbGet('/user/current');
        const colls = await mbGet('/collection');
        const dbs = await mbGet('/database');
        const dbL = dbs.data || dbs || [];
        return json({ connected: true, user: { name: user.common_name, email: user.email }, collections: colls.length, databases: Array.isArray(dbL) ? dbL.length : 0 });
      }
      if (action === 'list_questions') {
        const { collection_id } = body;
        let cards;
        if (collection_id) { const it = await mbGet(`/collection/${encodeURIComponent(collection_id)}/items?models=card&limit=100`); cards = it.data || it || []; }
        else { cards = await mbGet('/card'); }
        return json({ questions: (Array.isArray(cards) ? cards : []).slice(0, 200).map((c) => ({ id: c.id, name: c.name, description: c.description, display: c.display, collection_id: c.collection_id, updated_at: c.updated_at })) });
      }
      if (action === 'list_dashboards') {
        const d = await mbGet('/dashboard');
        return json({ dashboards: (Array.isArray(d) ? d : []).slice(0, 50).map((x) => ({ id: x.id, name: x.name, description: x.description })) });
      }
      if (action === 'get_dashboard_cards') {
        const { dashboard_id } = body;
        const dash = await mbGet(`/dashboard/${encodeURIComponent(dashboard_id)}`);
        return json({
          id: dash.id, name: dash.name,
          tabs: (dash.tabs || []).map((t) => ({ id: t.id, name: t.name })),
          cards: (dash.dashcards || []).filter((dc) => dc.card?.id).map((dc) => ({ card_id: dc.card.id, name: dc.card.name, display: dc.card.display, tab_id: dc.dashboard_tab_id })),
        });
      }
      if (action === 'inspect_card') {
        const { question_id } = body;
        const card = await mbGet(`/card/${encodeURIComponent(question_id)}`);
        const tags = extractTemplateTags(card);
        const resolved = await resolveDateTagNames(question_id);
        const tagList = Object.values(tags).map((t) => ({ name: t.name, type: t.type, display_name: t['display-name'], required: t.required }));
        return json({ id: card.id, name: card.name, template_tags: tagList, resolved_date_tags: resolved });
      }
      if (action === 'run_question') {
        const { question_id, format, start_date, end_date, chunk_days } = body;
        if (start_date && end_date) return json(await runQuestionChunked(question_id, start_date, end_date, chunk_days || 7));
        if (format === 'json') {
          const result = await mbPost(`/card/${question_id}/query`, { parameters: [] });
          return json(rowsToObjects(result, 100000));
        }
        try {
          return json(await runQuestionCsv(question_id));
        } catch (csvErr) {
          console.warn(`CSV failed: ${csvErr?.message}`);
          const result = await mbPost(`/card/${question_id}/query`, { parameters: [] });
          return json(rowsToObjects(result, 100000));
        }
      }
      if (action === 'run_question_csv') {
        const { question_id, start_date, end_date, chunk_days } = body;
        if (start_date && end_date) return json(await runQuestionChunked(question_id, start_date, end_date, chunk_days || 7));
        return json(await runQuestionCsv(question_id));
      }
      if (action === 'debug_csv') {
        const { question_id, start_date, end_date } = body;
        const params = (start_date && end_date) ? await dateRangeParams(question_id, start_date, end_date) : [];
        try {
          const csv = await mbPostCsv(`/card/${question_id}/query/csv`, { parameters: params });
          return json({ ok: true, params_sent: params, csv_length: csv.length, csv_preview: csv.substring(0, 1500), line_count: csv.split('\n').length });
        } catch (e) {
          return json({ ok: false, error: e?.message, params_sent: params });
        }
      }
      if (action === 'list_collections') {
        return json({ collections: await mbGet('/collection/tree') });
      }

      if (action === 'sync_question_to_table') {
        const { question_id, table_name, org_id, start_date, end_date, chunk_days, stream } = body;
        if (!org_id || !table_name || !question_id) return json({ error: 'question_id, table_name, org_id required' }, 400);
        if (!TABLE_RE.test(String(table_name)) || !(await tableExists(pool, table_name))) {
          return json({ error: `table_name must be an existing dp_* sync table: ${table_name}` }, 400);
        }

        const wantsDateBounded = !!(start_date && end_date);
        const tags = await resolveDateTagNames(question_id);

        // No template tags → streaming full-result sync (wipes whole org)
        if (wantsDateBounded && !tags) {
          const result = await streamingSyncToTable(pool, question_id, table_name, org_id);
          return json({ ...result, mode: 'stream', note: 'Card has no template tags; streamed full result.' });
        }

        // Explicit streaming request, or tables with jsonb columns → chunked
        // streaming with date-range-scoped delete (additive across calls).
        const jsonbCols = await getJsonbCols(pool, table_name);
        const shouldStream = stream === true || jsonbCols.size > 0;

        if (wantsDateBounded && shouldStream) {
          const result = await streamingChunkedSyncToTable(pool, question_id, table_name, org_id, start_date, end_date, chunk_days || 7);
          return json({ ...result, mode: 'stream-chunked' });
        }

        // Legacy in-memory path for small tables without jsonb
        const csvResult = wantsDateBounded
          ? await runQuestionChunked(question_id, start_date, end_date, chunk_days || 7)
          : await runQuestionCsv(question_id);

        const data = csvResult.data.map((row) => {
          const obj = { org_id, imported_at: new Date().toISOString() };
          Object.keys(row).forEach((col) => {
            const cleaned = cleanCol(col);
            obj[cleaned] = jsonbCols.has(cleaned) ? coerceJsonb(row[col]) : row[col];
          });
          return obj;
        });

        if (data.length === 0) return json({ synced: 0, total: 0, table: table_name, columns: csvResult.columns.map(cleanCol), jsonb_cols: [...jsonbCols] });

        // Date-range scoped delete so the in-memory path is also additive
        const dateCol = TABLE_DATE_COLUMN[table_name];
        if (wantsDateBounded && dateCol) await deleteScoped(pool, table_name, org_id, dateCol, start_date, end_date);
        else await deleteScoped(pool, table_name, org_id, null);

        let synced = 0;
        const errors = [];
        for (let i = 0; i < data.length; i += 200) {
          const batch = data.slice(i, i + 200);
          synced += await insertWithFallback(pool, table_name, batch, errors, `Batch ${i}`);
        }
        return json({
          synced, total: data.length, table: table_name,
          columns: csvResult.columns.map(cleanCol),
          errors: errors.length > 0 ? errors.slice(0, 5) : undefined,
          chunks: csvResult.chunks,
          jsonb_cols: [...jsonbCols],
        });
      }

      return json({ error: 'Unknown action: ' + action }, 400);
    } catch (err) {
      return res.status(500).json({ error: err?.message || String(err) });
    }
  });
};

module.exports._internal = { parseCsv, streamCsvRows, csvCellToValue, cleanCol, coerceJsonb, TABLE_DATE_COLUMN };
