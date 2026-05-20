-- Mirror of Metabase card 587 "Daily Sales x Warehouse".
-- Uses fulfillments as the spine, unnests fulfillment_line_items, looks up
-- pricing from the parent order's line_items.

CREATE OR REPLACE VIEW `helm-490123.helm_prod.dp_daily_sales_by_warehouse_v1` AS

WITH
  fulfillment_lines AS (
    SELECT
      f.order_id,
      f.created_at,
      DATE(f.created_at, "America/Los_Angeles")                       AS sale_date,
      TRIM(CONCAT(
        IFNULL(JSON_EXTRACT_SCALAR(f.origin_address, "$.address1"), "Unknown"),
        " · ",
        IFNULL(JSON_EXTRACT_SCALAR(f.origin_address, "$.city"), "")
      ))                                                              AS warehouse_location,
      JSON_EXTRACT_SCALAR(fli, "$.sku")                               AS sku,
      JSON_EXTRACT_SCALAR(fli, "$.title")                             AS product_title,
      JSON_EXTRACT_SCALAR(fli, "$.variant_title")                     AS variant_title,
      CAST(JSON_EXTRACT_SCALAR(fli, "$.quantity") AS INT64)           AS units_sold
    FROM `eb-testing-01.shopify_hydrogen.fulfillments` f,
         UNNEST(JSON_EXTRACT_ARRAY(f.fulfillment_line_items)) fli
  ),
  order_pricing AS (
    SELECT
      o.id                                                            AS order_id,
      o.currency,
      JSON_EXTRACT_SCALAR(o.shipping_address, "$.country_code")       AS country,
      (LOWER(o.tags) LIKE "%subscription recurring order%")           AS is_subscription,
      ARRAY(
        SELECT AS STRUCT
          JSON_EXTRACT_SCALAR(li, "$.sku") AS sku,
          SAFE_CAST(JSON_EXTRACT_SCALAR(li, "$.price") AS FLOAT64) AS price
        FROM UNNEST(JSON_EXTRACT_ARRAY(o.line_items)) li
      )                                                               AS line_pricing
    FROM `eb-testing-01.shopify_hydrogen.orders` o
    WHERE NOT (o.financial_status = "voided")
  ),
  joined AS (
    SELECT
      fl.sale_date,
      fl.sku,
      fl.warehouse_location,
      fl.product_title,
      fl.variant_title,
      fl.units_sold,
      op.country,
      op.is_subscription,
      op.currency,
      (SELECT price FROM UNNEST(op.line_pricing) WHERE sku = fl.sku LIMIT 1) AS unit_price
    FROM fulfillment_lines fl
    LEFT JOIN order_pricing op USING (order_id)
    WHERE fl.sku IS NOT NULL
  )

SELECT
  j.sale_date,
  j.sku,
  j.warehouse_location,
  ANY_VALUE(j.product_title)                                          AS product_title,
  ANY_VALUE(j.variant_title)                                          AS variant_title,
  CAST(NULL AS STRING)                                                AS base_product,
  SUM(j.units_sold)                                                   AS units_sold,
  ROUND(SUM(IFNULL(j.units_sold, 0) * IFNULL(j.unit_price, 0)
             * IFNULL(c.rate_to_usd, 1.0)), 2)                        AS gross_revenue,
  ROUND(SUM(IFNULL(j.units_sold, 0) * IFNULL(j.unit_price, 0)
             * IFNULL(c.rate_to_usd, 1.0)), 2)                        AS net_revenue,
  COUNT(*)                                                            AS orders_count,
  "Hydrogen"                                                          AS channel,
  ANY_VALUE(j.country)                                                AS country,
  ANY_VALUE(j.is_subscription)                                        AS is_subscription,
  CAST(NULL AS INT64)                                                 AS units_per_sku
FROM joined j
LEFT JOIN `eb-testing-01.currency.currency_conversion` c
  ON c.currency = j.currency AND c.date = j.sale_date
GROUP BY j.sale_date, j.sku, j.warehouse_location
;
