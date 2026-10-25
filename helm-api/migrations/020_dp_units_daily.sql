-- Demand Planning: daily unit orders from the warehouse copy (wh_sku_sales_daily,
-- Shopify from Jul 2024 + Amazon from Dec 2023), grouped by product family,
-- SKU, channel or country. Read by the Daily Units tab.

-- Product family from SKU + product name. Catalog categories (dp_sku_master)
-- are missing for a third of units, so this keys off the names customers buy.
CREATE OR REPLACE FUNCTION dp_family(p_sku text, p_name text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN upper(coalesce(p_sku, '')) IN ('FREESHIPPING', 'NO_SKU', 'SHIPPING_CHARGE', 'UNKNOWN', 'UNKNOW')
      OR p_sku ILIKE 'SI\_LEVEL%'
      OR p_name ~* '(free shipping|shipping charge|skip the line|shipping protection|gift card|route package|tip$)' THEN 'Non-product'
    WHEN p_name ~* 'stain'                                         THEN 'Stain Remover'
    WHEN p_name ~* 'dryer ball'                                    THEN 'Dryer Balls'
    WHEN p_name ~* 'dryer'                                         THEN 'Dryer Sheets'
    WHEN p_name ~* '(dishwasher|power pebble|dish )'               THEN 'Dishwasher'
    WHEN p_name ~* '(washing machine|washer clean|fresh tabs)'     THEN 'Washer Cleaner'
    WHEN p_name ~* '(hope cloth|paper towel)'                      THEN 'Hope Cloth'
    WHEN p_name ~* 'container'                                     THEN 'Sheet Container'
    WHEN p_name ~* 'tote'                                          THEN 'Tote Bag'
    WHEN p_name ~* '(sponge|scrubber)'                             THEN 'Sponges'
    WHEN p_name ~* 'scent booster'                                 THEN 'Scent Booster'
    WHEN p_name ~* 'hand soap'                                     THEN 'Hand Soap'
    WHEN p_name ~* '(room spray|air freshener)'                    THEN 'Room Spray'
    WHEN p_name ~* '(laundry|eco sheet|detergent sheet|detergent)' OR p_sku ILIKE 'L-0%-LS-%' THEN 'Laundry Sheets'
    ELSE 'Other'
  END
$$;

-- One row per (date, key): the requested measure summed over the filters.
--   p_group:   total | family | sku | channel | country
--   p_measure: units | packs (units x catalog units_per_sku) | orders | revenue (gross - discounts)
--   Free lines (zero revenue, e.g. gifts with purchase) are excluded unless p_include_free.
--   For sku, keys beyond the top p_top SKUs (by the measure over the range) fold into 'Other'.
CREATE OR REPLACE FUNCTION dp_units_daily(
  p_from date, p_to date, p_group text DEFAULT 'total',
  p_families text[] DEFAULT NULL, p_channels text[] DEFAULT NULL, p_countries text[] DEFAULT NULL,
  p_include_free boolean DEFAULT false, p_measure text DEFAULT 'units', p_top int DEFAULT 12,
  p_include_nonproduct boolean DEFAULT false)
RETURNS TABLE (d date, k text, label text, v numeric)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  WITH base AS (
    SELECT s.date, s.sku, s.channel, s.country,
           coalesce(s.product_name, s.sku) AS product_name,
           dp_family(s.sku, s.product_name) AS family,
           CASE p_measure
             WHEN 'packs'   THEN s.units * coalesce(nullif(m.units_per_sku, 0), 1)
             WHEN 'orders'  THEN s.orders::numeric
             WHEN 'revenue' THEN coalesce(s.gross_revenue, 0) - coalesce(s.discounts, 0)
             ELSE s.units
           END AS val
      FROM wh_sku_sales_daily s
      LEFT JOIN dp_sku_master m ON m.sku = s.sku AND m.org_id = s.org_id
     WHERE s.date BETWEEN p_from AND p_to
       AND (p_include_free OR coalesce(s.gross_revenue, 0) > 0)
       AND (p_channels  IS NULL OR s.channel = ANY (p_channels))
       AND (p_countries IS NULL OR s.country = ANY (p_countries))
  ), f AS (
    SELECT * FROM base
     WHERE (p_include_nonproduct OR family <> 'Non-product')
       AND (p_families IS NULL OR family = ANY (p_families))
  ), top_sku AS (
    SELECT sku FROM f GROUP BY sku ORDER BY sum(val) DESC NULLS LAST LIMIT greatest(p_top, 1)
  ), names AS (
    SELECT DISTINCT ON (sku) sku, product_name FROM f ORDER BY sku, date DESC
  ), keyed AS (
    SELECT f.date,
           CASE p_group
             WHEN 'family'  THEN f.family
             WHEN 'channel' THEN f.channel
             WHEN 'country' THEN f.country
             WHEN 'sku'     THEN CASE WHEN f.sku IN (SELECT sku FROM top_sku) THEN f.sku ELSE 'Other' END
             ELSE 'Total'
           END AS k,
           f.val
      FROM f
  )
  SELECT keyed.date AS d, keyed.k,
         CASE WHEN p_group = 'sku' AND keyed.k <> 'Other' THEN (SELECT n.product_name FROM names n WHERE n.sku = keyed.k) ELSE keyed.k END AS label,
         round(sum(keyed.val), 2) AS v
    FROM keyed
   GROUP BY keyed.date, keyed.k
   ORDER BY 1, 2
$$;

-- Filter choices for the tab: families, channels and countries with volume.
CREATE OR REPLACE FUNCTION dp_units_dims(p_from date, p_to date)
RETURNS TABLE (dim text, k text, units numeric)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT 'family', dp_family(sku, product_name), sum(units) FROM wh_sku_sales_daily WHERE date BETWEEN p_from AND p_to GROUP BY 2
  UNION ALL
  SELECT 'channel', channel, sum(units) FROM wh_sku_sales_daily WHERE date BETWEEN p_from AND p_to GROUP BY 2
  UNION ALL
  SELECT 'country', country, sum(units) FROM wh_sku_sales_daily WHERE date BETWEEN p_from AND p_to GROUP BY 2
  ORDER BY 1, 3 DESC
$$;

GRANT EXECUTE ON FUNCTION dp_family(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION dp_units_daily(date, date, text, text[], text[], text[], boolean, text, int, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION dp_units_dims(date, date) TO authenticated;
REVOKE EXECUTE ON FUNCTION dp_units_daily(date, date, text, text[], text[], text[], boolean, text, int, boolean) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION dp_units_dims(date, date) FROM anon, PUBLIC;
CREATE INDEX IF NOT EXISTS wh_sku_sales_daily_date_idx ON wh_sku_sales_daily (date);
