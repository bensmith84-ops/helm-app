-- Mirror of Metabase card 588 "Orders (line-item detail)".
-- This view returns the same columns and shape as the Supabase table `dp_orders`,
-- so the Cloud Run proxy can hand them to Helm without any frontend changes
-- beyond endpoint URL.
--
-- Source: eb-testing-01.shopify_hydrogen.orders + .currency.currency_conversion
-- Earth Breeze conventions:
--   - is_subscription_order = tags contains "subscription recurring order"
--   - channel = literal "Hydrogen" for shopify (UNION amazon in a future iteration)
--   - all money fields USD-normalized via currency_conversion
--   - voided orders excluded

CREATE OR REPLACE VIEW `helm-490123.helm_prod.dp_orders_v1` AS

WITH
  first_orders AS (
    SELECT
      JSON_EXTRACT_SCALAR(o.customer, "$.id") AS customer_id,
      MIN(o.id) AS first_order_id
    FROM `eb-testing-01.shopify_hydrogen.orders` o
    WHERE JSON_EXTRACT_SCALAR(o.customer, "$.id") IS NOT NULL
      AND NOT (o.financial_status = "voided")
    GROUP BY 1
  ),
  order_warehouses AS (
    SELECT
      f.order_id,
      ARRAY_AGG(
        TRIM(CONCAT(
          IFNULL(JSON_EXTRACT_SCALAR(f.origin_address, "$.address1"), "Unknown"),
          " · ",
          IFNULL(JSON_EXTRACT_SCALAR(f.origin_address, "$.city"), "")
        ))
        ORDER BY f.created_at ASC LIMIT 1
      )[OFFSET(0)] AS warehouse_location
    FROM `eb-testing-01.shopify_hydrogen.fulfillments` f
    GROUP BY 1
  )

SELECT
  CAST(o.id AS STRING)                                              AS order_id,
  o.name                                                            AS order_name,
  DATE(o.created_at, "America/Los_Angeles")                         AS order_date,
  o.created_at                                                      AS order_timestamp,
  JSON_EXTRACT_SCALAR(o.customer, "$.email")                        AS customer_email,
  JSON_EXTRACT_SCALAR(o.customer, "$.id")                           AS customer_id,
  "Hydrogen"                                                        AS channel,
  JSON_EXTRACT_SCALAR(o.shipping_address, "$.country_code")         AS country,
  JSON_EXTRACT_SCALAR(o.shipping_address, "$.province_code")        AS shipping_state,
  JSON_EXTRACT_SCALAR(o.shipping_address, "$.city")                 AS shipping_city,
  ow.warehouse_location                                             AS warehouse_location,
  o.fulfillment_status                                              AS fulfillment_status,
  o.financial_status                                                AS financial_status,
  (fo.first_order_id = o.id)                                        AS is_first_order,
  (LOWER(o.tags) LIKE "%subscription recurring order%")             AS is_subscription_order,
  CAST(NULL AS INT64)                                               AS subscription_cycle,
  ROUND(SAFE_CAST(o.subtotal_price AS FLOAT64) * IFNULL(c.rate_to_usd, 1.0), 2)  AS subtotal,
  ROUND(SAFE_CAST(o.total_discounts AS FLOAT64) * IFNULL(c.rate_to_usd, 1.0), 2) AS total_discounts,
  ROUND(SAFE_CAST(JSON_EXTRACT_SCALAR(o.total_shipping_price_set, "$.shop_money.amount") AS FLOAT64) * IFNULL(c.rate_to_usd, 1.0), 2) AS total_shipping,
  ROUND(SAFE_CAST(o.total_tax AS FLOAT64) * IFNULL(c.rate_to_usd, 1.0), 2)       AS total_tax,
  ROUND(SAFE_CAST(o.total_price AS FLOAT64) * IFNULL(c.rate_to_usd, 1.0), 2)     AS total_price,
  (SELECT SUM(CAST(JSON_EXTRACT_SCALAR(li, "$.quantity") AS INT64))
   FROM UNNEST(JSON_EXTRACT_ARRAY(o.line_items)) li)                AS total_units,
  (SELECT COUNT(DISTINCT JSON_EXTRACT_SCALAR(li, "$.sku"))
   FROM UNNEST(JSON_EXTRACT_ARRAY(o.line_items)) li)                AS distinct_skus,
  o.discount_codes                                                  AS discount_codes,
  o.tags                                                            AS tags,
  o.line_items                                                      AS line_items
FROM `eb-testing-01.shopify_hydrogen.orders` o
LEFT JOIN first_orders fo
  ON JSON_EXTRACT_SCALAR(o.customer, "$.id") = fo.customer_id
LEFT JOIN order_warehouses ow
  ON CAST(o.id AS STRING) = CAST(ow.order_id AS STRING)
LEFT JOIN `eb-testing-01.currency.currency_conversion` c
  ON c.currency = o.currency
  AND c.date = DATE(o.created_at, "America/Los_Angeles")
WHERE NOT (o.financial_status = "voided")
;
