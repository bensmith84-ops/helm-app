// POST /warehouse-sync - copies curated warehouse tables into Helm.
//   body.tasks: ['scorecard','inventory'] (default both); body.since: 'YYYY-MM-DD' (scorecard)
// Runs nightly from /cron (job 'warehouse-sync'); admins can also call it.
const { mbSqlAll, day } = require('../lib/warehouse');

const BQ = 'eb-testing-01';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function syncScorecard(pool, { since, fetchImpl }) {
  let from = since;
  if (!from) {
    const { rows } = await pool.query('SELECT max(date) AS d FROM wh_scorecard_daily');
    from = rows[0].d ? new Date(new Date(rows[0].d).getTime() - 14 * 864e5).toISOString().slice(0, 10) : '2026-01-01';
  }
  if (!DATE_RE.test(from)) throw new Error('since must be YYYY-MM-DD');
  // Complete days only: the current day's row is partial.
  const rows = await mbSqlAll(
    `SELECT * FROM \`${BQ}.data_team_earth_breeze.scorecard_v2_main\`
      WHERE date >= DATE '${from}' AND date < CURRENT_DATE('America/Los_Angeles')
      ORDER BY date, country_code`, { fetchImpl });
  let saved = 0;
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200).map((r) => ({ date: day(r.date), country_code: r.country_code, metrics: { ...r, date: day(r.date) } }));
    await pool.query(
      `INSERT INTO wh_scorecard_daily (date, country_code, metrics, synced_at)
       SELECT (x->>'date')::date, x->>'country_code', x->'metrics', now() FROM jsonb_array_elements($1::jsonb) x
       ON CONFLICT (org_id, date, country_code) DO UPDATE SET metrics = EXCLUDED.metrics, synced_at = now()`,
      [JSON.stringify(batch)]);
    saved += batch.length;
  }
  return { from, saved };
}

async function syncInventory(pool, { fetchImpl }) {
  const stord = await mbSqlAll(
    `SELECT snapshot_date, warehouse_location AS location, sku, quantity_on_hand AS on_hand,
            quantity_reserved AS reserved, quantity_incoming AS incoming
       FROM \`${BQ}.data_team_earth_breeze.inventory_report_helm\`
      WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM \`${BQ}.data_team_earth_breeze.inventory_report_helm\`)
      ORDER BY location, sku`, { fetchImpl });
  const cin7 = await mbSqlAll(
    `SELECT CURRENT_DATE('America/Los_Angeles') AS snapshot_date, Location AS location, SKU AS sku, ANY_VALUE(Name) AS name,
            SUM(OnHand) AS on_hand, SUM(Available) AS available, SUM(Allocated) AS reserved, SUM(COALESCE(OnOrder,0) + COALESCE(InTransit,0)) AS incoming
       FROM \`${BQ}.cin7.product_availability\`
      WHERE SKU IS NOT NULL AND Location IS NOT NULL
      GROUP BY 1, 2, 3 ORDER BY location, sku`, { fetchImpl });
  const all = [
    ...stord.map((r) => ({ ...r, source: 'stord', available: r.on_hand != null && r.reserved != null ? Number(r.on_hand) - Number(r.reserved) : null })),
    ...cin7.map((r) => ({ ...r, source: 'cin7' })),
  ].map((r) => ({ ...r, snapshot_date: day(r.snapshot_date) }));
  let saved = 0;
  for (let i = 0; i < all.length; i += 500) {
    const batch = all.slice(i, i + 500);
    await pool.query(
      `INSERT INTO wh_inventory_snapshot (snapshot_date, source, location, sku, name, on_hand, available, reserved, incoming, synced_at)
       SELECT (x->>'snapshot_date')::date, x->>'source', x->>'location', x->>'sku', x->>'name',
              (x->>'on_hand')::numeric, (x->>'available')::numeric, (x->>'reserved')::numeric, (x->>'incoming')::numeric, now()
         FROM jsonb_array_elements($1::jsonb) x
       ON CONFLICT (org_id, snapshot_date, source, location, sku) DO UPDATE SET
         name = EXCLUDED.name, on_hand = EXCLUDED.on_hand, available = EXCLUDED.available,
         reserved = EXCLUDED.reserved, incoming = EXCLUDED.incoming, synced_at = now()`,
      [JSON.stringify(batch)]);
    saved += batch.length;
  }
  return { stord_rows: stord.length, cin7_rows: cin7.length, saved, snapshot_date: all[0]?.snapshot_date || null };
}

const TASKS = { scorecard: syncScorecard, inventory: syncInventory };

module.exports = function (app, { pool }, { fetchImpl = fetch } = {}) {
  app.post('/warehouse-sync', async (req, res) => {
    const body = req.body || {};
    const tasks = Array.isArray(body.tasks) && body.tasks.length ? body.tasks : Object.keys(TASKS);
    const results = {}; const errors = [];
    for (const t of tasks) {
      if (!TASKS[t]) { errors.push(`${t}: unknown task`); continue; }
      const { rows: [log] } = await pool.query('INSERT INTO wh_sync_log (task) VALUES ($1) RETURNING id', [t]);
      try {
        results[t] = await TASKS[t](pool, { since: body.since, fetchImpl });
        await pool.query('UPDATE wh_sync_log SET finished_at = now(), rows_saved = $2 WHERE id = $1', [log.id, results[t].saved]);
      } catch (e) {
        errors.push(`${t}: ${e.message}`);
        await pool.query('UPDATE wh_sync_log SET finished_at = now(), error = $2 WHERE id = $1', [log.id, e.message.slice(0, 1000)]);
      }
    }
    res.status(errors.length ? 500 : 200).json({ ok: !errors.length, results, errors: errors.length ? errors : undefined });
  });
};
module.exports._internal = { syncScorecard, syncInventory };
