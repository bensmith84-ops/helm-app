-- ERP switches from seeded sample data (Mar 2026) to real Earth Breeze data.
-- 1. Remove the sample records (Ben approved deleting all sample data, 24 Oct 2026).
--    Kept: legal entities, chart of accounts, currencies, exchange rates, carriers,
--    carrier services and fulfillment integrations (configuration, not sample activity).
--    Each delete is tolerant of foreign keys; three passes so dependants clear first.
DO $d$
DECLARE t text; pass int;
BEGIN
  FOR pass IN 1..3 LOOP
    FOREACH t IN ARRAY ARRAY[
      'erp_wms_tasks', 'erp_inventory_movements', 'erp_inventory', 'erp_inventory_lots', 'erp_bin_locations',
      'erp_order_items', 'erp_orders', 'erp_customers', 'erp_po_items', 'erp_purchase_orders',
      'erp_wo_issues', 'erp_work_orders', 'erp_journal_lines', 'erp_journal_entries',
      'erp_bom_items', 'erp_bom', 'erp_supplier_items', 'erp_suppliers',
      'erp_product_variants', 'erp_products', 'erp_shipping_rules', 'erp_facilities']
    LOOP
      IF to_regclass(format('public.%I', t)) IS NULL THEN CONTINUE; END IF;
      BEGIN
        EXECUTE format('DELETE FROM public.%I', t);
      EXCEPTION WHEN foreign_key_violation THEN
        IF pass = 3 THEN RAISE NOTICE 'erp sample cleanup: % still referenced, left in place', t; END IF;
      END;
    END LOOP;
  END LOOP;
END
$d$;

-- 2. Rows the nightly warehouse sync owns (replaced each run) vs rows people enter.
ALTER TABLE erp_inventory ADD COLUMN IF NOT EXISTS source text;
CREATE INDEX IF NOT EXISTS erp_inventory_source_idx ON erp_inventory (org_id, source);

-- 3. Summaries the ERP and Finance screens read (last 30 complete days in the copies).
CREATE OR REPLACE VIEW wh_orders_by_day WITH (security_invoker = true) AS
  SELECT org_id, date, sum(orders)::int AS orders, sum(net_revenue) AS net_revenue, sum(gross_sales) AS gross_sales,
         sum(orders) FILTER (WHERE order_type = 'new_subscription')::int AS new_subscription_orders,
         sum(orders) FILTER (WHERE order_type = 'recurring')::int AS recurring_orders,
         sum(orders) FILTER (WHERE order_type = 'one_time')::int AS one_time_orders
    FROM wh_orders_daily GROUP BY org_id, date;

CREATE OR REPLACE VIEW wh_sales_channel_30d WITH (security_invoker = true) AS
  WITH w AS (SELECT max(date) AS d FROM wh_orders_daily)
  SELECT o.org_id, CASE o.channel WHEN 'web' THEN 'Shopify (web)' WHEN 'tiktok' THEN 'TikTok Shop' WHEN 'amazon_mcf' THEN 'Shopify via Amazon MCF'
                     WHEN 'draft' THEN 'Shopify draft (CS)' ELSE 'Shopify (other)' END AS channel,
         sum(o.orders)::int AS orders, sum(o.net_revenue) AS revenue, min(o.date) AS from_date, max(o.date) AS to_date
    FROM wh_orders_daily o, w WHERE o.date > w.d - 30 GROUP BY 1, 2
  UNION ALL
  SELECT s.org_id, 'Amazon', sum(s.orders)::int, sum(s.gross_revenue - s.discounts), min(s.date), max(s.date)
    FROM wh_sku_sales_daily s, w WHERE s.channel = 'amazon' AND s.date > w.d - 30 GROUP BY 1;

CREATE OR REPLACE VIEW wh_sku_30d WITH (security_invoker = true) AS
  WITH w AS (SELECT max(date) AS d FROM wh_sku_sales_daily)
  SELECT s.org_id, s.sku, max(s.product_name) AS product_name,
         sum(s.units) AS units, sum(s.units) FILTER (WHERE s.channel = 'shopify') AS shopify_units,
         sum(s.units) FILTER (WHERE s.channel = 'amazon') AS amazon_units,
         sum(s.gross_revenue - s.discounts) AS revenue, sum(s.orders)::int AS orders, min(s.date) AS from_date, max(s.date) AS to_date
    FROM wh_sku_sales_daily s, w WHERE s.date > w.d - 30 GROUP BY s.org_id, s.sku;

REVOKE ALL ON wh_orders_by_day, wh_sales_channel_30d, wh_sku_30d FROM PUBLIC, anon;
GRANT SELECT ON wh_orders_by_day, wh_sales_channel_30d, wh_sku_30d TO authenticated;
