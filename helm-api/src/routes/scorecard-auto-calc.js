
// POST /scorecard-auto-calc — recomputes weekly scorecard entries from daily data.
// System-fired (cron via Cloud Scheduler), no user auth required.
// Uses pool directly with admin privileges since this writes across the org.

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

module.exports = function(app, { pool }) {
  app.post('/scorecard-auto-calc', async (req, res) => {
    try {
      const orgId = req.body?.org_id || DEFAULT_ORG_ID;

      const { rows: metrics } = await pool.query(
        `SELECT * FROM scorecard_metrics WHERE auto_source IS NOT NULL AND active = true`
      );
      if (!metrics.length) {
        return res.json({ success: true, message: 'No auto-source metrics configured', updated: 0 });
      }

      const today = new Date();
      const weeks = [];
      for (let i = 0; i < 13; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i * 7);
        weeks.push(getWeekStart(d));
      }
      const uniqueWeeks = [...new Set(weeks)];

      const sourceKeys = new Set();
      for (const m of metrics) {
        if (m.auto_source) sourceKeys.add(m.auto_source);
        if (m.auto_weight_key) sourceKeys.add(m.auto_weight_key);
      }
      const earliest = uniqueWeeks[uniqueWeeks.length - 1];

      const { rows: dailyRows } = await pool.query(
        `SELECT date, metric_key, value FROM scoreboard_daily
         WHERE metric_key = ANY($1) AND date >= $2
         ORDER BY date`,
        [Array.from(sourceKeys), earliest]
      );

      if (!dailyRows.length) {
        return res.json({ success: true, message: 'No daily data found', updated: 0 });
      }

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
        daily_rows_fetched: dailyRows.length,
        org_id: orgId,
        errors: errors.length ? errors : undefined,
      });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });
};
