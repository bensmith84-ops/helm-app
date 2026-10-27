
// POST /scorecard-auto-calc - recomputes weekly scorecard entries from daily data.
// System-fired (cron via Cloud Scheduler), no user auth required.
// Uses pool directly with admin privileges since this writes across the org.
// Sources: Scoreboard keys (scoreboard_daily), any Metabase question / model /
// table (auto_source = 'metabase', details in source_config), and key results
// with auto_config (current value over the KR window). body.kr_id / body.metric_id
// limit a run to one item (the Save button in the UI).
const src = require('../lib/metric-source');

const DEFAULT_ORG_ID = 'a0000000-0000-0000-0000-000000000001';

function getWeekStart(d) {
  const dt = new Date(d);
  const day = dt.getUTCDay();
  const diff = day === 0 ? -6 : 1 - day;
  dt.setUTCDate(dt.getUTCDate() + diff);
  const y = dt.getUTCFullYear();
  const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

async function upsertEntries(pool, rows) {
  if (!rows.length) return;
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const r of rows) {
      await client.query(
        `INSERT INTO scorecard_entries (metric_id, week_start, value, org_id, note)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (metric_id, week_start) DO UPDATE
         SET value = EXCLUDED.value, note = EXCLUDED.note, org_id = EXCLUDED.org_id`,
        [r.metric_id, r.week_start, r.value, r.org_id, r.note]);
    }
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}

// Scorecard metrics fed from a Metabase question / model / table.
async function calcMetabaseMetrics(pool, metrics, weeks, defaultOrg) {
  const out = { processed: metrics.length, entries: 0, errors: [] };
  if (!metrics.length) return out;
  const from = weeks[weeks.length - 1], to = src.ymd(new Date());
  for (const m of metrics) {
    try {
      const daily = await src.metabaseDaily(m.source_config, from, to);
      const byWeek = src.rollWeeks(daily, m.auto_agg || 'sum');
      const rows = [];
      for (const w of weeks) {
        const x = byWeek.get(w);
        if (!x || x.value == null) continue;
        rows.push({ metric_id: m.id, week_start: w, value: Math.round(x.value * 100) / 100, org_id: m.org_id || defaultOrg,
          note: `Auto: ${m.auto_agg || 'sum'} of ${x.days} days from Metabase "${(m.source_config && m.source_config.name) || ''}"`.slice(0, 300) });
      }
      await upsertEntries(pool, rows);
      out.entries += rows.length;
      await pool.query(`UPDATE scorecard_metrics SET auto_synced_at = now(), auto_error = NULL WHERE id = $1`, [m.id]);
    } catch (e) {
      out.errors.push(`${m.name}: ${e.message}`);
      await pool.query(`UPDATE scorecard_metrics SET auto_error = $2 WHERE id = $1`, [m.id, String(e.message).slice(0, 500)]);
    }
  }
  return out;
}

// Key results with auto_config, or with auto-calculated conditions: each value
// over the KR window (KR dates, else the objective's, else the OKR cycle's),
// capped at today. Progress = the lowest of the main measure and its conditions.
async function calcKeyResults(pool, onlyKr) {
  const { rows } = await pool.query(
    `SELECT kr.id, kr.title, kr.objective_id, kr.auto_config, kr.conditions, kr.current_value, kr.target_value, kr.target_direction,
            coalesce(kr.start_date, o.start_date, c.start_date)::text AS w_from,
            coalesce(kr.end_date, o.end_date, c.end_date)::text AS w_to
       FROM key_results kr
       LEFT JOIN objectives o ON o.id = kr.objective_id
       LEFT JOIN okr_cycles c ON c.id = o.cycle_id
      WHERE kr.deleted_at IS NULL AND ($1::uuid IS NULL OR kr.id = $1)
        AND (kr.auto_config IS NOT NULL OR EXISTS (
              SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(kr.conditions) = 'array' THEN kr.conditions ELSE '[]'::jsonb END) x
               WHERE jsonb_typeof(x->'auto_config') = 'object'))`, [onlyKr]);
  const out = { processed: rows.length, updated: 0, errors: [] };
  const today = src.ymd(new Date());
  const touched = new Set();
  const round = (v) => Math.round(v * 100) / 100;
  for (const kr of rows) {
    let mainErr = null;
    let value = Number(kr.current_value || 0);
    const conds = Array.isArray(kr.conditions) ? kr.conditions.map((c) => ({ ...c })) : [];
    try {
      if (!kr.w_from) throw new Error('set a start date on the key result, its objective or its cycle');
      const from = kr.w_from.slice(0, 10), to = kr.w_to && kr.w_to.slice(0, 10) < today ? kr.w_to.slice(0, 10) : today;
      if (from > today) throw new Error(`the key result starts on ${from}`);
      if (kr.auto_config) {
        try {
          const r = await src.krValue(pool, kr.auto_config, from, to);
          if (r.value == null) throw new Error(`no data between ${from} and ${to}`);
          value = round(r.value);
        } catch (e) { mainErr = e.message; }
      }
      for (const c of conds) {
        if (!c.auto_config || typeof c.auto_config !== 'object') continue;
        try {
          const r = await src.krValue(pool, c.auto_config, from, to);
          if (r.value == null) throw new Error(`no data between ${from} and ${to}`);
          c.current_value = round(r.value); c.auto_error = null;
        } catch (e) { c.auto_error = String(e.message).slice(0, 300); out.errors.push(`${kr.title} / ${c.label || 'condition'}: ${e.message}`); }
      }
    } catch (e) { mainErr = e.message; }
    if (mainErr) out.errors.push(`${kr.title}: ${mainErr}`);
    const parts = [src.calcProgress(value, Number(kr.target_value), kr.target_direction),
      ...conds.filter((c) => c.target_value !== null && c.target_value !== '' && c.target_value !== undefined)
        .map((c) => src.calcProgress(Number(c.current_value || 0), Number(c.target_value), c.target_direction))];
    const progress = Math.min(...parts);
    await pool.query(
      `UPDATE key_results SET current_value = $2, progress = $3, conditions = $4::jsonb, auto_error = $5,
              auto_synced_at = CASE WHEN $5::text IS NULL THEN now() ELSE auto_synced_at END, updated_at = now() WHERE id = $1`,
      [kr.id, value, progress, conds.length ? JSON.stringify(conds) : null, kr.auto_config ? mainErr : null]);
    out.updated++;
    if (kr.objective_id) touched.add(kr.objective_id);
  }
  for (const objId of touched) {
    await pool.query(
      `UPDATE objectives SET progress = sub.p FROM (SELECT round(avg(progress))::int AS p FROM key_results WHERE objective_id = $1 AND deleted_at IS NULL) sub WHERE id = $1`,
      [objId]);
  }
  return out;
}

module.exports = function(app, { pool }) {
  app.post('/scorecard-auto-calc', async (req, res) => {
    try {
      const orgId = req.body?.org_id || DEFAULT_ORG_ID;

      const onlyMetric = req.body?.metric_id || null, onlyKr = req.body?.kr_id || null;
      const { rows: allMetrics } = onlyKr ? { rows: [] } : await pool.query(
        `SELECT * FROM scorecard_metrics WHERE auto_source IS NOT NULL AND active = true AND ($1::uuid IS NULL OR id = $1)`, [onlyMetric]
      );
      const metrics = allMetrics.filter((m) => m.auto_source !== 'metabase');
      const mbMetrics = allMetrics.filter((m) => m.auto_source === 'metabase');

      const today = new Date();
      const weeks = [];
      for (let i = 0; i < 13; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i * 7);
        weeks.push(getWeekStart(d));
      }
      const uniqueWeeks = [...new Set(weeks)];

      const krResult = onlyMetric ? null : await calcKeyResults(pool, onlyKr);
      const mbResult = await calcMetabaseMetrics(pool, mbMetrics, uniqueWeeks, orgId);

      const sourceKeys = new Set();
      for (const m of metrics) {
        if (m.auto_source) sourceKeys.add(m.auto_source);
        if (m.auto_weight_key) sourceKeys.add(m.auto_weight_key);
      }
      const earliest = uniqueWeeks[uniqueWeeks.length - 1];

      const { rows: dailyRows } = await pool.query(
        `SELECT date::text AS date, metric_key, value FROM scoreboard_daily
         WHERE metric_key = ANY($1) AND date >= $2
         ORDER BY date`,
        [Array.from(sourceKeys), earliest]
      );


      const grouped = {};
      for (const row of dailyRows) {
        const ws = getWeekStart(new Date(row.date + 'T12:00:00Z'));
        if (!grouped[row.metric_key]) grouped[row.metric_key] = {};
        if (!grouped[row.metric_key][ws]) grouped[row.metric_key][ws] = [];
        grouped[row.metric_key][ws].push(Number(row.value));
      }

      const upserted = [];
      const errors = [];

      for (const metric of metrics) {
        const key = metric.auto_source;
        const agg = metric.auto_agg || 'sum';
        const weightKey = metric.auto_weight_key;

        for (const weekStart of uniqueWeeks) {
          const values = grouped[key]?.[weekStart];
          if (!values?.length) continue;

          let result;
          if (agg === 'sum') {
            result = values.reduce((s, v) => s + v, 0);
          } else if (agg === 'average') {
            result = values.reduce((s, v) => s + v, 0) / values.length;
          } else if (agg === 'last') {
            result = values[values.length - 1];
          } else if (agg === 'weighted_average' && weightKey) {
            const weights = grouped[weightKey]?.[weekStart];
            if (!weights?.length || weights.length !== values.length) {
              result = values.reduce((s, v) => s + v, 0) / values.length;
              errors.push(`${metric.name} (${weekStart}): weight mismatch, fell back to simple avg`);
            } else {
              const totalWeight = weights.reduce((s, w) => s + w, 0);
              result = totalWeight === 0 ? 0 : values.reduce((s, v, i) => s + v * weights[i], 0) / totalWeight;
            }
          } else {
            result = values.reduce((s, v) => s + v, 0);
          }
          result = Math.round(result * 100) / 100;

          upserted.push({
            metric_id: metric.id, week_start: weekStart, value: result, org_id: orgId,
            note: `Auto: ${agg}${agg === 'weighted_average' ? ` by ${weightKey}` : ''} of ${values.length} days`,
          });
        }
      }

      if (upserted.length) {
        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          for (const r of upserted) {
            await client.query(
              `INSERT INTO scorecard_entries (metric_id, week_start, value, org_id, note)
               VALUES ($1, $2, $3, $4, $5)
               ON CONFLICT (metric_id, week_start) DO UPDATE
               SET value = EXCLUDED.value, note = EXCLUDED.note, org_id = EXCLUDED.org_id`,
              [r.metric_id, r.week_start, r.value, r.org_id, r.note]
            );
          }
          await client.query('COMMIT');
        } catch (e) {
          await client.query('ROLLBACK');
          throw e;
        } finally {
          client.release();
        }
      }

      return res.json({
        success: true,
        metrics_processed: metrics.length,
        entries_upserted: upserted.length,
        weeks_covered: uniqueWeeks,
        metabase_metrics: mbResult,
        key_results: krResult,
        daily_rows_fetched: dailyRows.length,
        org_id: orgId,
        errors: errors.length ? errors : undefined,
      });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });
};
