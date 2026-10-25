// POST /warehouse-sync - copies curated warehouse tables into Helm.
//   body.tasks: any of scorecard, inventory, orders, sku_sales, ad_spend, erp (default all; erp runs after inventory); body.since: 'YYYY-MM-DD' (scorecard)
// Runs daily from /cron (jobs 'warehouse-sync', 'warehouse-sync-midday'); admins can also call it.
// POST /scoreboard-refresh - members: scorecard + scoreboard only (the Scoreboard Sync button).
const { mbSql, mbSqlAll, day } = require('../lib/warehouse');
const { MAP: SB_MAP, valueFor: sbValue } = require('../lib/scoreboard-map');

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
  const through = rows.reduce((m, r) => (day(r.date) > m ? day(r.date) : m), '') || null;
  return { from, saved, through, ...(await sourceBuild(fetchImpl)) };
}

// When the data team last rebuilt scorecard_v2_main, and whether that rebuild
// came after yesterday ended (midnight Pacific, the table's day boundary).
// A rebuild before that point means yesterday's row was still partial.
async function sourceBuild(fetchImpl) {
  try {
    const { rows: [r] } = await mbSql(
      `SELECT TIMESTAMP_MILLIS(last_modified_time) AS built_at,
              TIMESTAMP_MILLIS(last_modified_time) >= TIMESTAMP(CURRENT_DATE('America/Los_Angeles'), 'America/Los_Angeles') AS complete
         FROM \`${BQ}.data_team_earth_breeze.__TABLES__\` WHERE table_id = 'scorecard_v2_main'`, { fetchImpl });
    return r ? { source_built_at: r.built_at, complete: r.complete === true } : {};
  } catch (e) {
    return { source_built_error: e.message.slice(0, 200) };
  }
}

async function syncInventory(pool, { fetchImpl }) {
  const stord = await mbSqlAll(
    `SELECT snapshot_date, warehouse_location AS location, sku, quantity_on_hand AS on_hand,
            quantity_reserved AS reserved, quantity_incoming AS incoming
       FROM \`${BQ}.data_team_earth_breeze.inventory_report_helm\`
      WHERE snapshot_date = (SELECT MAX(snapshot_date) FROM \`${BQ}.data_team_earth_breeze.inventory_report_helm\`)
      ORDER BY location, sku`, { fetchImpl });
  const cin7 = await mbSqlAll(
    `SELECT (SELECT DATE(MAX(_airbyte_extracted_at), 'America/Los_Angeles') FROM \`${BQ}.cin7.product_availability\`) AS snapshot_date, Location AS location, SKU AS sku, ANY_VALUE(Name) AS name,
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


// Windowed tasks: refresh the last `lookback` days, or backfill from `start`
// at most `maxDays` per run so a run stays well inside Cloud Run's limit.
async function windowFor(pool, table, { since, start, lookback = 14, maxDays = 120 }) {
  let from = since;
  if (!from) {
    const { rows } = await pool.query(`SELECT max(date) AS d FROM ${table}`);
    from = rows[0].d ? new Date(new Date(rows[0].d).getTime() - lookback * 864e5).toISOString().slice(0, 10) : start;
  }
  if (!DATE_RE.test(from)) throw new Error('since must be YYYY-MM-DD');
  const yesterday = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  let to = new Date(new Date(from).getTime() + maxDays * 864e5).toISOString().slice(0, 10);
  if (to > yesterday) to = yesterday;
  return { from, to, caught_up: to === yesterday };
}

async function upsertJson(pool, sql, rows, size = 500) {
  let saved = 0;
  for (let i = 0; i < rows.length; i += size) {
    const batch = rows.slice(i, i + size);
    await pool.query(sql, [JSON.stringify(batch)]);
    saved += batch.length;
  }
  return saved;
}

async function syncOrders(pool, { since, fetchImpl }) {
  const w = await windowFor(pool, 'wh_orders_daily', { since, start: '2025-01-01' });
  const rows = await mbSqlAll(
    `SELECT date, IFNULL(customer_country, 'UNKNOWN') AS country,
            CASE LOWER(IFNULL(source_name, '')) WHEN 'web' THEN 'web' WHEN 'subscription_contract_checkout_one' THEN 'web'
                 WHEN 'amazon' THEN 'amazon_mcf' WHEN 'tiktok' THEN 'tiktok' WHEN 'shopify_draft_order' THEN 'draft'
                 ELSE IF(recharge_type = 'RECURRING', 'web', 'other') END AS channel,
            CASE WHEN recharge_type = 'CHECKOUT' THEN 'new_subscription' WHEN recharge_type = 'RECURRING' THEN 'recurring' ELSE 'one_time' END AS order_type,
            COUNT(*) AS orders, COUNT(DISTINCT shopify_customer_id) AS customers,
            ROUND(SUM(gross_sale), 2) AS gross_sales, ROUND(SUM(total_discount), 2) AS discounts, ROUND(SUM(returns), 2) AS refunds,
            ROUND(SUM(total_tax), 2) AS tax, ROUND(SUM(net_revenue), 2) AS net_revenue
       FROM \`${BQ}.data_team_earth_breeze.orders_360_v2\`
      WHERE is_valid_order AND date BETWEEN DATE '${w.from}' AND DATE '${w.to}'
      GROUP BY 1, 2, 3, 4 ORDER BY 1, 2, 3, 4`, { fetchImpl });
  const saved = await upsertJson(pool,
    `INSERT INTO wh_orders_daily (date, country, channel, order_type, orders, customers, gross_sales, discounts, refunds, tax, net_revenue, synced_at)
     SELECT (x->>'date')::date, x->>'country', x->>'channel', x->>'order_type', (x->>'orders')::int, (x->>'customers')::int,
            (x->>'gross_sales')::numeric, (x->>'discounts')::numeric, (x->>'refunds')::numeric, (x->>'tax')::numeric, (x->>'net_revenue')::numeric, now()
       FROM jsonb_array_elements($1::jsonb) x
     ON CONFLICT (org_id, date, country, channel, order_type) DO UPDATE SET orders = EXCLUDED.orders, customers = EXCLUDED.customers,
       gross_sales = EXCLUDED.gross_sales, discounts = EXCLUDED.discounts, refunds = EXCLUDED.refunds, tax = EXCLUDED.tax,
       net_revenue = EXCLUDED.net_revenue, synced_at = now()`,
    rows.map((r) => ({ ...r, date: day(r.date) })));
  return { ...w, saved };
}

async function syncSkuSales(pool, { since, fetchImpl }) {
  const w = await windowFor(pool, 'wh_sku_sales_daily', { since, start: '2025-01-01', maxDays: 60 });
  const shopify = await mbSqlAll(
    `SELECT l.created_at AS date, 'shopify' AS channel, IFNULL(o.customer_country, 'UNKNOWN') AS country,
            IFNULL(NULLIF(l.sku, ''), 'NO_SKU') AS sku, ANY_VALUE(l.product_title) AS product_name,
            SUM(SAFE_CAST(l.quantity AS INT64)) AS units, COUNT(DISTINCT l.order_id) AS orders,
            ROUND(SUM(l.price * SAFE_CAST(l.quantity AS INT64)), 2) AS gross_revenue,
            ROUND(SUM(IFNULL(SAFE_CAST(l.discount_amount AS NUMERIC), 0)), 2) AS discounts
       FROM \`${BQ}.data_team_earth_breeze.shopify_orders_extracted\` l
       JOIN \`${BQ}.data_team_earth_breeze.orders_360_v2\` o ON o.shopify_order_id = l.order_id AND o.is_valid_order
      WHERE l.created_at BETWEEN DATE '${w.from}' AND DATE '${w.to}'
      GROUP BY 1, 2, 3, 4 ORDER BY 1, 3, 4`, { fetchImpl });
  const amazon = await mbSqlAll(
    `WITH lines AS (
       SELECT * FROM \`${BQ}.amazon_seller_partner.GET_FLAT_FILE_ALL_ORDERS_DATA_BY_ORDER_DATE_GENERAL\`
        WHERE DATE(TIMESTAMP(purchase_date)) BETWEEN DATE '${w.from}' AND DATE '${w.to}'
          AND IFNULL(order_status, '') != 'Cancelled'
       QUALIFY ROW_NUMBER() OVER (PARTITION BY amazon_order_id, IFNULL(order_item_id, sku) ORDER BY _airbyte_extracted_at DESC) = 1)
     SELECT DATE(TIMESTAMP(purchase_date)) AS date, 'amazon' AS channel, IFNULL(ship_country, 'US') AS country,
            IFNULL(sku, 'NO_SKU') AS sku, ANY_VALUE(product_name) AS product_name,
            SUM(SAFE_CAST(quantity AS INT64)) AS units, COUNT(DISTINCT amazon_order_id) AS orders,
            ROUND(SUM(SAFE_CAST(item_price AS NUMERIC)), 2) AS gross_revenue,
            ROUND(SUM(IFNULL(SAFE_CAST(item_promotion_discount AS NUMERIC), 0)), 2) AS discounts
       FROM lines GROUP BY 1, 2, 3, 4 ORDER BY 1, 3, 4`, { fetchImpl });
  const saved = await upsertJson(pool,
    `INSERT INTO wh_sku_sales_daily (date, channel, country, sku, product_name, units, orders, gross_revenue, discounts, synced_at)
     SELECT (x->>'date')::date, x->>'channel', x->>'country', x->>'sku', x->>'product_name', (x->>'units')::numeric, (x->>'orders')::int,
            (x->>'gross_revenue')::numeric, (x->>'discounts')::numeric, now()
       FROM jsonb_array_elements($1::jsonb) x
     ON CONFLICT (org_id, date, channel, country, sku) DO UPDATE SET product_name = EXCLUDED.product_name, units = EXCLUDED.units,
       orders = EXCLUDED.orders, gross_revenue = EXCLUDED.gross_revenue, discounts = EXCLUDED.discounts, synced_at = now()`,
    [...shopify, ...amazon].map((r) => ({ ...r, date: day(r.date) })));
  return { ...w, shopify_rows: shopify.length, amazon_rows: amazon.length, saved };
}

async function syncAdSpend(pool, { since, fetchImpl }) {
  const w = await windowFor(pool, 'wh_ad_spend_daily', { since, start: '2024-04-01', maxDays: 400 });
  const rows = await mbSqlAll(
    `SELECT * FROM \`${BQ}.data_team_earth_breeze.ad_spend_360_by_country\`
      WHERE date BETWEEN DATE '${w.from}' AND DATE '${w.to}' ORDER BY date, country`, { fetchImpl });
  const saved = await upsertJson(pool,
    `INSERT INTO wh_ad_spend_daily (date, country, total_spend, spend, synced_at)
     SELECT (x->>'date')::date, x->>'country', (x->'spend'->>'total_ad_spend')::numeric, x->'spend', now()
       FROM jsonb_array_elements($1::jsonb) x
     ON CONFLICT (org_id, date, country) DO UPDATE SET total_spend = EXCLUDED.total_spend, spend = EXCLUDED.spend, synced_at = now()`,
    rows.map((r) => ({ date: day(r.date), country: r.country || 'UNKNOWN', spend: { ...r, date: day(r.date) } })));
  return { ...w, saved };
}

// ERP: real facilities, SKUs (with Cin7 costs) and stock, from the warehouse copies.
const ORG = 'a0000000-0000-0000-0000-000000000001';
const STORD_NAMES = { MEDe001: 'Stord Medford (MEDe001)', CVGs001: 'Stord CVG1 Cincinnati (CVGs001)', RNOs004: 'Stord Reno (RNOs004)', RJWe001: 'RJW via Stord (RJWe001)' };
// Cin7 locations that duplicate Stord's feed or aren't real stock locations.
const CIN7_SKIP = /^(US-Stord|US - Stord Reno|RJW D01|RJW Logistics Group|UK-TEST)$|^DNU\b|DO NOT USE/i;
function facilityFor(source, location) {
  if (source === 'stord') return { name: STORD_NAMES[location] || `Stord ${location}`, facility_type: '3pl', operator: 'Stord', country: 'US' };
  const l = location.toLowerCase();
  const country = /uk |york|\buk\b/.test(l) ? 'GB' : /canad/.test(l) ? 'CA' : /austral|sydney/.test(l) ? 'AU' : 'US';
  const facility_type = /manufactur|tooling/.test(l) ? 'factory' : /3pl|fulfillment center/.test(l) ? '3pl' : 'warehouse';
  return { name: location, facility_type, operator: /amazon/.test(l) ? 'Amazon' : 'Cin7', country };
}

async function syncErp(pool, { fetchImpl }) {
  // Latest snapshot per source.
  const { rows: inv } = await pool.query(
    `SELECT i.* FROM wh_inventory_snapshot i
       JOIN (SELECT source, max(snapshot_date) d FROM wh_inventory_snapshot GROUP BY source) m ON m.source = i.source AND m.d = i.snapshot_date
      WHERE i.org_id = $1`, [ORG]);
  const stock = inv.filter((r) => !(r.source === 'cin7' && CIN7_SKIP.test(r.location)));

  // Facilities
  const { rows: facs } = await pool.query(`SELECT id, metadata FROM erp_facilities WHERE org_id = $1`, [ORG]);
  const facBy = new Map(facs.filter((f) => f.metadata?.wh_location).map((f) => [`${f.metadata.wh_source}|${f.metadata.wh_location}`, f.id]));
  let facAdded = 0;
  for (const key of new Set(stock.map((r) => `${r.source}|${r.location}`))) {
    if (facBy.has(key)) continue;
    const [source, location] = key.split('|');
    const f = facilityFor(source, location);
    const { rows: [row] } = await pool.query(
      `INSERT INTO erp_facilities (org_id, name, facility_type, operator, country, is_active, metadata)
       VALUES ($1, $2, $3, $4, $5, true, $6) RETURNING id`,
      [ORG, f.name, f.facility_type, f.operator, f.country, { wh_source: source, wh_location: location, managed_by: 'warehouse-sync' }]);
    facBy.set(key, row.id); facAdded++;
  }

  // Products and variants: active Cin7 stock items, plus any SKU stocked at Stord that Cin7 lacks.
  const cin7 = await mbSqlAll(
    `SELECT ID AS id, SKU AS sku, Name AS name, Category AS category, Barcode AS barcode, UOM AS uom,
            AverageCost AS cost, PriceTier1 AS price
       FROM \`${BQ}.cin7.products\` WHERE Type = 'Stock' AND Status = 'Active' AND SKU IS NOT NULL ORDER BY SKU`, { fetchImpl });
  const items = new Map(cin7.map((c) => [c.sku, c]));
  for (const r of stock) if (!items.has(r.sku)) items.set(r.sku, { sku: r.sku, name: r.name || r.sku, category: null });
  const { rows: vars } = await pool.query(`SELECT id, sku, product_id FROM erp_product_variants WHERE org_id = $1`, [ORG]);
  const varBy = new Map(vars.map((v) => [v.sku, v]));
  let varAdded = 0, varUpdated = 0;
  for (const it of items.values()) {
    const cost = it.cost != null && Number(it.cost) > 0 ? Number(it.cost) : null;
    const price = it.price != null && Number(it.price) > 0 ? Number(it.price) : null;
    const existing = varBy.get(it.sku);
    if (existing) {
      await pool.query(
        `UPDATE erp_product_variants SET name = $2, barcode = COALESCE($3, barcode), cost = COALESCE($4, cost), msrp = COALESCE($5, msrp), updated_at = now()
          WHERE id = $1`, [existing.id, it.name, it.barcode || null, cost, price]);
      varUpdated++;
      continue;
    }
    const cat = String(it.category || '');
    const productType = /raw material/i.test(cat) ? 'raw_material' : /packaging/i.test(cat) ? 'packaging' : 'finished_good';
    const { rows: [p] } = await pool.query(
      `INSERT INTO erp_products (org_id, name, category, product_type, brand, status, default_uom, metadata)
       VALUES ($1, $2, $3, $4, 'Earth Breeze', 'active', $5, $6) RETURNING id`,
      [ORG, it.name, it.category || null, productType, it.uom || 'each', { cin7_id: it.id || null, managed_by: 'warehouse-sync' }]);
    const { rows: [v] } = await pool.query(
      `INSERT INTO erp_product_variants (org_id, product_id, sku, name, barcode, cost, msrp, status, is_primary, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'active', true, $8) RETURNING id, sku, product_id`,
      [ORG, p.id, it.sku, it.name, it.barcode || null, cost, price, { cin7_id: it.id || null, managed_by: 'warehouse-sync' }]);
    varBy.set(v.sku, v); varAdded++;
  }

  // Stock: replace the warehouse-owned rows with the latest snapshot.
  await pool.query(`DELETE FROM erp_inventory WHERE org_id = $1 AND source = 'warehouse'`, [ORG]);
  const rows = stock.filter((r) => Number(r.on_hand) || Number(r.reserved) || Number(r.incoming)).map((r) => {
    const v = varBy.get(r.sku);
    return { variant_id: v.id, product_id: v.product_id, facility_id: facBy.get(`${r.source}|${r.location}`), quantity: Number(r.on_hand) || 0, reserved: Number(r.reserved) || 0 };
  });
  const saved = await upsertJson(pool,
    `INSERT INTO erp_inventory (org_id, variant_id, product_id, facility_id, quantity, reserved_quantity, unit, source, updated_at)
     SELECT '${ORG}', (x->>'variant_id')::uuid, (x->>'product_id')::uuid, (x->>'facility_id')::uuid,
            (x->>'quantity')::numeric, (x->>'reserved')::numeric, 'each', 'warehouse', now()
       FROM jsonb_array_elements($1::jsonb) x`, rows);
  return { facilities_added: facAdded, variants_added: varAdded, variants_updated: varUpdated, stock_rows: saved,
           snapshot: Object.fromEntries([...new Set(inv.map((r) => r.source))].map((s) => [s, inv.find((r) => r.source === s).snapshot_date])) };
}

// Scoreboard: daily metrics in scoreboard_daily from the warehouse scorecard (local copy).
async function syncScoreboard(pool, { since }) {
  // Nightly: the last 14 days (the scorecard copy refreshes those). Backfill: pass `since`.
  const from = since || new Date(Date.now() - 15 * 864e5).toISOString().slice(0, 10);
  if (!DATE_RE.test(from)) throw new Error('since must be YYYY-MM-DD');
  const { rows } = await pool.query(
    `SELECT date::text AS date, country_code, metrics FROM wh_scorecard_daily WHERE org_id = $1 AND date >= $2 ORDER BY date`, [ORG, from]);
  const byDate = new Map();
  for (const r of rows) { if (!byDate.has(r.date)) byDate.set(r.date, []); byDate.get(r.date).push(r); }
  const out = [];
  for (const [date, dayRows] of byDate) {
    for (const [key, def] of Object.entries(SB_MAP)) {
      const v = sbValue(def, dayRows);
      if (v == null || !Number.isFinite(v)) continue;
      out.push({ date, metric_key: key, value: Math.round(v * 100) / 100 });
    }
  }
  let saved = 0;
  for (let i = 0; i < out.length; i += 1000) {
    const batch = out.slice(i, i + 1000);
    await pool.query(
      `INSERT INTO scoreboard_daily (org_id, date, metric_key, metric_label, value, synced_at)
       SELECT '${ORG}', (x->>'date')::date, x->>'metric_key', x->>'metric_key', (x->>'value')::numeric, now()
         FROM jsonb_array_elements($1::jsonb) x
       ON CONFLICT (date, metric_key) DO UPDATE SET value = EXCLUDED.value, synced_at = now()`,
      [JSON.stringify(batch)]);
    saved += batch.length;
  }
  return { from, days: byDate.size, metrics: Object.keys(SB_MAP).length, saved };
}

const TASKS = { scorecard: syncScorecard, inventory: syncInventory, orders: syncOrders, sku_sales: syncSkuSales, ad_spend: syncAdSpend, erp: syncErp, scoreboard: syncScoreboard };

async function runTasks(pool, tasks, { since, fetchImpl }) {
  const results = {}; const errors = [];
  for (const t of tasks) {
    if (!TASKS[t]) { errors.push(`${t}: unknown task`); continue; }
    const { rows: [log] } = await pool.query('INSERT INTO wh_sync_log (task) VALUES ($1) RETURNING id', [t]);
    try {
      const r = results[t] = await TASKS[t](pool, { since, fetchImpl });
      await pool.query(
        `UPDATE wh_sync_log SET finished_at = now(), rows_saved = $2, through_date = $3, source_built_at = $4, complete = $5 WHERE id = $1`,
        [log.id, r.saved, r.through || null, r.source_built_at || null, r.complete ?? null]);
    } catch (e) {
      errors.push(`${t}: ${e.message}`);
      await pool.query('UPDATE wh_sync_log SET finished_at = now(), error = $2 WHERE id = $1', [log.id, e.message.slice(0, 1000)]);
    }
  }
  return { ok: !errors.length, results, errors: errors.length ? errors : undefined };
}

module.exports = function (app, { pool }, { fetchImpl = fetch } = {}) {
  // Admin / cron: any tasks, optional backfill.
  app.post('/warehouse-sync', async (req, res) => {
    const body = req.body || {};
    const tasks = Array.isArray(body.tasks) && body.tasks.length ? body.tasks : Object.keys(TASKS);
    const out = await runTasks(pool, tasks, { since: body.since, fetchImpl });
    res.status(out.ok ? 200 : 500).json(out);
  });
  // Any member (Scoreboard "Sync" button): refresh the scorecard copy and the
  // Scoreboard metrics built from it. Fixed tasks, no backfill.
  app.post('/scoreboard-refresh', async (req, res) => {
    const out = await runTasks(pool, ['scorecard', 'scoreboard'], { fetchImpl });
    res.status(out.ok ? 200 : 500).json(out);
  });
};
module.exports._internal = { syncScorecard, syncInventory, syncOrders, syncSkuSales, syncAdSpend, syncErp, syncScoreboard, windowFor, runTasks };
