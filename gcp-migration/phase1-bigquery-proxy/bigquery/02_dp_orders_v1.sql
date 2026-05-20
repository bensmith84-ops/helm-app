-- Helm dp_orders view, v3 — reads from EDM warehouse.
-- Source: leafy-oxide-333007.prod_edm_mdl_main.{fact_orders, fact_order_lines, dim_orders}
-- Single-brand warehouse (only one brand_key hash present), so no brand filter needed.
-- Currency: native currency_code passed through; downstream can convert if needed.
-- Voided orders excluded via is_cancelled.

CREATE OR REPLACE VIEW `helm-490123.helm_prod.dp_orders_v1` AS

WITH
  first_orders AS (
    SELECT
      customer_key,
      MIN(order_key) AS first_order_key
    FROM `leafy-oxide-333007.prod_edm_mdl_main.fact_orders`
    WHERE NOT IFNULL(is_cancelled, FALSE)
      AND customer_key IS NOT NULL
    GROUP BY 1
  ),
  line_aggs AS (
    SELECT
      order_key,
      SUM(IFNULL(quantity, item_quantity)) AS total_units,
      COUNT(DISTINCT sku)                  AS distinct_skus,
      ANY_VALUE(ship_country)              AS ship_country,
      ANY_VALUE(ship_state)                AS ship_state
    FROM `leafy-oxide-333007.prod_edm_mdl_main.fact_order_lines`
    GROUP BY 1
  )

SELECT
  fo.order_key                                                       AS order_id,
  fo.order_id                                                        AS order_name,
  fo.date                                                            AS order_date,
  TIMESTAMP(fo.date)                                                 AS order_timestamp,
  CAST(NULL AS STRING)                                               AS customer_email,
  fo.customer_key                                                    AS customer_id,
  COALESCE(d.platform_name, 'Shopify')                               AS channel,
  la.ship_country                                                    AS country,
  la.ship_state                                                      AS shipping_state,
  CAST(NULL AS STRING)                                               AS shipping_city,
  CAST(NULL AS STRING)                                               AS warehouse_location,
  CASE WHEN fo.is_cancelled THEN 'cancelled' ELSE 'fulfilled' END    AS fulfillment_status,
  d.financial_status                                                 AS financial_status,
  (fop.first_order_key = fo.order_key)                               AS is_first_order,
  (LOWER(IFNULL(d.tags, '')) LIKE '%subscription%recurring%order%')  AS is_subscription_order,
  CAST(NULL AS INT64)                                                AS subscription_cycle,
  CAST(fo.subtotal_price AS NUMERIC)                                 AS subtotal,
  CAST(fo.order_discount + fo.shipping_discount AS NUMERIC)          AS total_discounts,
  CAST(fo.shipping_price AS NUMERIC)                                 AS total_shipping,
  CAST(fo.total_tax AS NUMERIC)                                      AS total_tax,
  CAST(fo.total_price AS NUMERIC)                                    AS total_price,
  la.total_units                                                     AS total_units,
  la.distinct_skus                                                   AS distinct_skus,
  CAST(NULL AS STRING)                                               AS discount_codes,
  d.tags                                                             AS tags,
  CAST(NULL AS STRING)                                               AS line_items
FROM `leafy-oxide-333007.prod_edm_mdl_main.fact_orders` fo
LEFT JOIN `leafy-oxide-333007.prod_edm_mdl_main.dim_orders` d
  ON d.order_key = fo.order_key
LEFT JOIN first_orders fop
  ON fop.customer_key = fo.customer_key
LEFT JOIN line_aggs la
  ON la.order_key = fo.order_key
WHERE NOT IFNULL(fo.is_cancelled, FALSE)
;
