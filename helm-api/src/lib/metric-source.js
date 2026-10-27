// Metric sources for the Scorecard and OKR key results.
//
// A source turns into a daily series (date -> value) over a date range:
//   scoreboard: a scoreboard_daily metric_key (the fixed Scoreboard numbers)
//   metabase:   any Metabase saved question, model or warehouse table, bucketed
//               by a date column and aggregated (sum / avg / count / distinct /
//               min / max of a column), with optional column filters
//   scorecard:  (key results only) the weekly entries of a Scorecard metric
//
// Metabase queries are built here as structured MBQL against the chosen source
// ("card__<id>" or a table id), so the aggregation runs in the warehouse and
// nothing the browser sends is executed as SQL.

const METABASE_URL = () => (process.env.METABASE_URL || 'https://metabase.earthbreezedev.com').replace(/\/+$/, '');

async function mb(path, { method = 'GET', body } = {}) {
  const key = process.env.METABASE_API_KEY;
  if (!key) throw new Error('METABASE_API_KEY not configured');
  const r = await fetch(`${METABASE_URL()}/api${path}`, {
    method,
    headers: { 'x-api-key': key, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(120000),
  });
  const text = await r.text();
  let j; try { j = JSON.parse(text); } catch { throw new Error(`Metabase ${r.status}: ${text.slice(0, 200)}`); }
  if (!r.ok || (j && j.error)) throw new Error(`Metabase: ${String((j && (j.error || j.message)) || r.status).slice(0, 300)}`);
  return j;
}

const MODELS = ['card', 'dataset', 'table'];
const MODEL_LABEL = { card: 'Question', dataset: 'Model', metric: 'Metric', table: 'Table' };

async function search(q) {
  const qs = new URLSearchParams({ q: String(q || '').slice(0, 100) });
  for (const m of MODELS) qs.append('models', m);
  const j = await mb(`/search?${qs}`);
  return (j.data || []).filter((x) => !x.archived).slice(0, 40).map((x) => ({
    model: x.model, kind: MODEL_LABEL[x.model] || x.model, id: x.id, name: x.name,
    description: x.description || null,
    where: x.model === 'table' ? [x.database_name, x.table_schema].filter(Boolean).join(' · ') : (x.collection && x.collection.name) || 'Our analytics',
    db: x.database_id || null, display: x.display || null,
  }));
}

const kindOf = (bt) => {
  const t = String(bt || '');
  if (/Date|Time/.test(t)) return 'date';
  if (/Integer|Float|Decimal|Number|BigInteger|Currency/.test(t)) return 'number';
  if (/Boolean/.test(t)) return 'boolean';
  return 'text';
};

// Columns of a source, with the MBQL field reference to use in queries.
async function fields(model, id) {
  id = Number(id);
  if (!Number.isInteger(id) || id <= 0) throw new Error('invalid source id');
  if (model === 'table') {
    const t = await mb(`/table/${id}/query_metadata`);
    return {
      model, id, db: t.db_id, name: t.display_name || t.name, warning: null,
      columns: (t.fields || []).filter((f) => f.visibility_type !== 'sensitive' && f.visibility_type !== 'retired').map((f) => ({
        name: f.name, label: f.display_name || f.name, base_type: f.effective_type || f.base_type,
        kind: kindOf(f.effective_type || f.base_type), ref: ['field', f.id, null],
      })),
    };
  }
  const c = await mb(`/card/${id}`);
  const stage = (c.dataset_query && (c.dataset_query.native || (c.dataset_query.stages && c.dataset_query.stages[0]))) || {};
  const tags = Object.values(stage['template-tags'] || {});
  const required = tags.filter((t) => t.required && t.default == null).map((t) => t['display-name'] || t.name);
  return {
    model: c.type === 'model' ? 'dataset' : c.type === 'metric' ? 'metric' : 'card', id, db: c.database_id, name: c.name,
    warning: required.length ? `This question needs a value for: ${required.join(', ')}. Helm can't fill those in, so pick a question without required filters.` : null,
    columns: (c.result_metadata || []).map((m) => ({
      name: m.name, label: m.display_name || m.name, base_type: m.effective_type || m.base_type,
      kind: kindOf(m.effective_type || m.base_type), ref: ['field', m.name, { 'base-type': m.base_type }],
    })),
  };
}

// ── Validation of a stored / posted Metabase config
const DAY_AGGS = ['sum', 'avg', 'count', 'distinct', 'min', 'max'];
const OPS = ['=', '!=', 'contains', 'does-not-contain', '>', '<', '>=', '<='];
function cleanRef(ref) {
  if (!Array.isArray(ref) || ref[0] !== 'field') throw new Error('invalid column');
  const id = ref[1];
  if (!(Number.isInteger(id) || (typeof id === 'string' && id.length < 200))) throw new Error('invalid column');
  const opts = ref[2] && typeof ref[2] === 'object' ? { 'base-type': String(ref[2]['base-type'] || '').slice(0, 60) || undefined } : null;
  return ['field', id, opts && opts['base-type'] ? opts : null];
}
function cleanConfig(c) {
  if (!c || c.kind !== 'metabase') throw new Error('not a Metabase source');
  const model = MODELS.includes(c.model) ? c.model : null;
  const id = Number(c.id), db = Number(c.db);
  if (!model || !Number.isInteger(id) || !Number.isInteger(db)) throw new Error('incomplete Metabase source');
  if (!c.date || !c.date.ref) throw new Error('pick a date column');
  const day_agg = DAY_AGGS.includes(c.day_agg) ? c.day_agg : 'sum';
  if (day_agg !== 'count' && !(c.value && c.value.ref)) throw new Error('pick a value column');
  const filters = (Array.isArray(c.filters) ? c.filters : []).slice(0, 5).filter((f) => f && f.ref && OPS.includes(f.op) && f.value !== '' && f.value != null).map((f) => ({
    ref: cleanRef(f.ref), name: String(f.name || '').slice(0, 120), op: f.op, kind: f.kind, value: f.kind === 'number' ? Number(f.value) : String(f.value).slice(0, 200),
  }));
  return {
    kind: 'metabase', model, id, db, name: String(c.name || '').slice(0, 300), where: String(c.where || '').slice(0, 200),
    date: { ref: cleanRef(c.date.ref), name: String(c.date.name || '').slice(0, 120) },
    value: c.value && c.value.ref ? { ref: cleanRef(c.value.ref), name: String(c.value.name || '').slice(0, 120) } : null,
    day_agg, filters,
  };
}

const withUnit = (ref, unit) => [ref[0], ref[1], { ...(ref[2] || {}), 'temporal-unit': unit }];
const ymd = (d) => d.toISOString().slice(0, 10);

// Daily series from Metabase: Map('YYYY-MM-DD' -> number).
async function metabaseDaily(raw, from, to) {
  const c = cleanConfig(raw);
  const days = (Date.parse(to) - Date.parse(from)) / 86400000;
  if (!(days >= 0) || days > 1900) throw new Error('date range too long');
  const day = withUnit(c.date.ref, 'day');
  const agg = c.day_agg === 'count' ? ['count'] : c.day_agg === 'distinct' ? ['distinct', c.value.ref] : [c.day_agg, c.value.ref];
  const where = [['between', c.date.ref, from, to]];
  for (const f of c.filters) {
    if (f.op === 'contains' || f.op === 'does-not-contain') where.push([f.op, f.ref, String(f.value), { 'case-sensitive': false }]);
    else where.push([f.op, f.ref, f.value]);
  }
  const j = await mb('/dataset', {
    method: 'POST',
    body: {
      database: c.db, type: 'query',
      query: {
        'source-table': c.model === 'table' ? c.id : `card__${c.id}`,
        aggregation: [agg], breakout: [day], filter: where.length > 1 ? ['and', ...where] : where[0], 'order-by': [['asc', day]],
      },
    },
  });
  const out = new Map();
  for (const row of (j.data && j.data.rows) || []) {
    if (row[0] == null) continue;
    const d = String(row[0]).slice(0, 10), v = Number(row[1]);
    if (Number.isFinite(v)) out.set(d, (out.get(d) || 0) + v);
  }
  return out;
}

async function scoreboardDaily(pool, key, from, to) {
  const { rows } = await pool.query(
    `SELECT date::text AS d, sum(value)::float8 AS v FROM scoreboard_daily WHERE metric_key = $1 AND date BETWEEN $2 AND $3 GROUP BY 1 ORDER BY 1`,
    [String(key), from, to]);
  return new Map(rows.map((r) => [r.d.slice(0, 10), Number(r.v)]));
}

// Monday-start weeks (the Scorecard's convention).
function weekStart(dstr) {
  const d = new Date(dstr + 'T12:00:00Z');
  const day = d.getUTCDay();
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return ymd(d);
}

function rollWeeks(daily, agg) {
  const by = new Map();
  for (const [d, v] of [...daily.entries()].sort()) {
    const w = weekStart(d);
    if (!by.has(w)) by.set(w, []);
    by.get(w).push(v);
  }
  const out = new Map();
  for (const [w, vals] of by) out.set(w, { value: reduce(vals, agg === 'average' ? 'avg' : agg === 'last' ? 'last' : agg === 'max' ? 'max' : agg === 'min' ? 'min' : 'sum'), days: vals.length });
  return out;
}

function reduce(vals, how) {
  if (!vals.length) return null;
  if (how === 'avg') return vals.reduce((s, v) => s + v, 0) / vals.length;
  if (how === 'last') return vals[vals.length - 1];
  if (how === 'max') return Math.max(...vals);
  if (how === 'min') return Math.min(...vals);
  return vals.reduce((s, v) => s + v, 0);
}

// Key result value over its window.
//   total:       sum of every day (or week) in the window
//   avg_day:     average daily value
//   avg_week:    average of the weekly totals
//   latest:      the most recent day's value
//   latest_week: the most recent complete week's total
const WINDOW_AGGS = ['total', 'avg_day', 'avg_week', 'latest', 'latest_week'];
function windowValue(daily, how, today = ymd(new Date())) {
  const days = [...daily.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
  if (!days.length) return null;
  const vals = days.map((x) => x[1]);
  if (how === 'avg_day') return reduce(vals, 'avg');
  if (how === 'latest') return vals[vals.length - 1];
  const weeks = rollWeeks(daily, 'sum');
  const thisWeek = weekStart(today);
  if (how === 'avg_week') return reduce([...weeks.values()].map((w) => w.value), 'avg');
  if (how === 'latest_week') {
    const done = [...weeks.entries()].filter(([w]) => w < thisWeek).sort();
    return done.length ? done[done.length - 1][1].value : null;
  }
  return reduce(vals, 'sum');
}

// Scorecard weekly entries as a "daily" series keyed by week start.
async function scorecardWeekly(pool, metricId, from, to) {
  const { rows } = await pool.query(
    `SELECT week_start::text AS w, value::float8 AS v FROM scorecard_entries WHERE metric_id = $1 AND week_start BETWEEN $2 AND $3 AND value IS NOT NULL ORDER BY 1`,
    [metricId, weekStart(from), to]);
  return new Map(rows.map((r) => [r.w.slice(0, 10), Number(r.v)]));
}

function scorecardWindowValue(weekly, how) {
  const vals = [...weekly.entries()].sort().map((x) => x[1]);
  if (!vals.length) return null;
  if (how === 'total') return reduce(vals, 'sum');
  if (how === 'avg_week' || how === 'avg_day') return reduce(vals, 'avg');
  return vals[vals.length - 1];
}

// One key result's current value from its auto_config over [from, to].
async function krValue(pool, cfg, from, to) {
  const how = WINDOW_AGGS.includes(cfg.window_agg) ? cfg.window_agg : 'total';
  if (cfg.kind === 'scorecard') {
    if (!cfg.metric_id) throw new Error('pick a Scorecard metric');
    const weekly = await scorecardWeekly(pool, cfg.metric_id, from, to);
    return { value: scorecardWindowValue(weekly, how), points: weekly.size, unit: 'weeks', series: weekly };
  }
  const daily = cfg.kind === 'scoreboard' ? await scoreboardDaily(pool, cfg.key, from, to) : await metabaseDaily(cfg, from, to);
  return { value: windowValue(daily, how), points: daily.size, unit: 'days', series: daily };
}

// Direction-aware progress, same as the OKRs view.
function calcProgress(current, target, direction) {
  if (!target) return 0;
  if (direction === 'below') {
    if (current <= target) return 100;
    return Math.max(0, Math.round((1 - (current - target) / target) * 100));
  }
  return Math.round((current / target) * 100);
}

module.exports = {
  search, fields, cleanConfig, metabaseDaily, scoreboardDaily, scorecardWeekly, scorecardWindowValue,
  weekStart, rollWeeks, windowValue, WINDOW_AGGS, calcProgress, ymd, krValue,
};
