-- Helm dp_daily_sales_by_warehouse view, v3 — single-brand warehouse, no brand filter.
-- warehouse_location is not in EDM; left NULL so Helm renders without crashing.

CREATE OR REPLACE VIEW `helm-490123.helm_prod.dp_daily_sales_by_warehouse_v1` AS

SELECT
  fol.date                                                            AS sale_date,
  fol.sku                                                              AS sku,
  CAST(NULL AS STRING)                                                AS warehouse_location,
  ANY_VALUE(fol.product_title)                                        AS product_title,
  ANY_VALUE(fol.variant_title)                                        AS variant_title,
  CAST(NULL AS STRING)                                                AS base_product,
  SUM(IFNULL(fol.quantity, fol.item_quantity))                        AS units_sold,
  ROUND(SUM(CAST(fol.item_total_price AS FLOAT64)), 2)                AS gross_revenue,
  ROUND(SUM(CAST(fol.item_subtotal_price AS FLOAT64)), 2)             AS net_revenue,
  COUNT(DISTINCT fol.order_key)                                       AS orders_count,
  COALESCE(ANY_VALUE(d.platform_name), 'Shopify')                     AS channel,
  ANY_VALUE(fol.ship_country)                                         AS country,
  ANY_VALUE(LOWER(IFNULL(d.tags,'')) LIKE '%subscription%recurring%') AS is_subscription,
  CAST(NULL AS INT64)                                                 AS units_per_sku
FROM `leafy-oxide-333007.prod_edm_mdl_main.fact_order_lines` fol
LEFT JOIN `leafy-oxide-333007.prod_edm_mdl_main.dim_orders` d
  ON d.order_key = fol.order_key
WHERE fol.sku IS NOT NULL
GROUP BY 1, 2
;
