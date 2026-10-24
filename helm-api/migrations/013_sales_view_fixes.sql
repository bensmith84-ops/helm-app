-- Amazon order count: per-SKU order counts can't be added up (an order with two SKUs
-- counted twice), so the channel view takes Amazon orders from the scorecard instead.
-- SKU view: treat missing revenue as 0 so it sorts correctly.
CREATE OR REPLACE VIEW wh_sales_channel_30d WITH (security_invoker = true) AS
  WITH w AS (SELECT max(date) AS d FROM wh_orders_daily)
  SELECT o.org_id, CASE o.channel WHEN 'web' THEN 'Shopify (web)' WHEN 'tiktok' THEN 'TikTok Shop' WHEN 'amazon_mcf' THEN 'Shopify via Amazon MCF'
                     WHEN 'draft' THEN 'Shopify draft (CS)' ELSE 'Shopify (other)' END AS channel,
         sum(o.orders)::int AS orders, sum(o.net_revenue) AS revenue, min(o.date) AS from_date, max(o.date) AS to_date
    FROM wh_orders_daily o, w WHERE o.date > w.d - 30 GROUP BY 1, 2
  UNION ALL
  SELECT s.org_id, 'Amazon',
         (SELECT sum((c.metrics->>'amazon_orders')::numeric)::int FROM wh_scorecard_daily c, w WHERE c.date > w.d - 30 AND c.date <= w.d),
         sum(s.gross_revenue - s.discounts), min(s.date), max(s.date)
    FROM wh_sku_sales_daily s, w WHERE s.channel = 'amazon' AND s.date > w.d - 30 GROUP BY 1;

CREATE OR REPLACE VIEW wh_sku_30d WITH (security_invoker = true) AS
  WITH w AS (SELECT max(date) AS d FROM wh_sku_sales_daily)
  SELECT s.org_id, s.sku, max(s.product_name) AS product_name,
         sum(s.units) AS units, sum(s.units) FILTER (WHERE s.channel = 'shopify') AS shopify_units,
         sum(s.units) FILTER (WHERE s.channel = 'amazon') AS amazon_units,
         COALESCE(sum(s.gross_revenue - s.discounts), 0) AS revenue, sum(s.orders)::int AS orders, min(s.date) AS from_date, max(s.date) AS to_date
    FROM wh_sku_sales_daily s, w WHERE s.date > w.d - 30 GROUP BY s.org_id, s.sku;
