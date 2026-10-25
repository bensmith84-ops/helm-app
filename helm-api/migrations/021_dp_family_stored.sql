-- Daily Units fixes:
-- 1. Family rules: Amazon's long laundry-sheet titles mention stains, so
--    "stain" matched 2.3M laundry units as Stain Remover. Specific products
--    (container, tote, laundry sheets by name or L-xx-LS- SKU) now go first,
--    and Stain Remover needs "stain remover/spray" or an -SR- SKU.
-- 2. Speed: store the family on each row (kept by a trigger) instead of
--    running the rules over every row on every query (5.6s -> sub-second).
CREATE OR REPLACE FUNCTION dp_family(p_sku text, p_name text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN upper(coalesce(p_sku, '')) IN ('FREESHIPPING', 'NO_SKU', 'SHIPPING_CHARGE', 'UNKNOWN', 'UNKNOW')
      OR p_sku ILIKE 'SI\_LEVEL%'
      OR p_name ~* '(free shipping|shipping charge|skip the line|shipping protection|gift card|route package)' THEN 'Non-product'
    WHEN p_name ~* 'container' OR p_sku ~* '-BL0'                    THEN 'Sheet Container'
    WHEN p_name ~* 'tote'                                            THEN 'Tote Bag'
    WHEN p_name ~* '(stain remover|stain spray)' OR p_sku ~* '-SR-'  THEN 'Stain Remover'
    WHEN p_name ~* '(laundry detergent sheet|detergent eco sheet|eco sheets|laundry sheet)' OR p_sku ~ '^L-[0-9]{2}-LS-' THEN 'Laundry Sheets'
    WHEN p_name ~* 'dryer ball'                                      THEN 'Dryer Balls'
    WHEN p_name ~* 'dryer sheet' OR p_sku ~* '-DS-'                  THEN 'Dryer Sheets'
    WHEN p_name ~* '(dishwasher|power pebble|dish sheet)'            THEN 'Dishwasher'
    WHEN p_name ~* '(washing machine|washer clean|fresh tabs)'       THEN 'Washer Cleaner'
    WHEN p_name ~* '(hope cloth|paper towel)'                        THEN 'Hope Cloth'
    WHEN p_name ~* '(sponge|scrubber)'                               THEN 'Sponges'
    WHEN p_name ~* 'scent booster'                                   THEN 'Scent Booster'
    WHEN p_name ~* 'hand soap'                                       THEN 'Hand Soap'
    WHEN p_name ~* '(room spray|air freshener)'                      THEN 'Room Spray'
    WHEN p_name ~* '(laundry|detergent)'                             THEN 'Laundry Sheets'
    ELSE 'Other'
  END
$$;

ALTER TABLE wh_sku_sales_daily ADD COLUMN IF NOT EXISTS family text;
CREATE OR REPLACE FUNCTION wh_sku_sales_daily_family() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.family := dp_family(NEW.sku, NEW.product_name); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_wh_sku_sales_daily_family ON wh_sku_sales_daily;
CREATE TRIGGER trg_wh_sku_sales_daily_family BEFORE INSERT OR UPDATE OF sku, product_name ON wh_sku_sales_daily
  FOR EACH ROW EXECUTE FUNCTION wh_sku_sales_daily_family();
UPDATE wh_sku_sales_daily SET family = dp_family(sku, product_name);
CREATE INDEX IF NOT EXISTS wh_sku_sales_daily_date_family_idx ON wh_sku_sales_daily (date, family);

CREATE OR REPLACE FUNCTION dp_units_daily(
  p_from date, p_to date, p_group text DEFAULT 'total',
  p_families text[] DEFAULT NULL, p_channels text[] DEFAULT NULL, p_countries text[] DEFAULT NULL,
  p_include_free boolean DEFAULT false, p_measure text DEFAULT 'units', p_top int DEFAULT 12,
  p_include_nonproduct boolean DEFAULT false)
RETURNS TABLE (d date, k text, label text, v numeric)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  WITH f AS (
    SELECT s.date, s.sku, s.channel, s.country, s.family, s.product_name,
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
       AND (p_include_nonproduct OR s.family IS DISTINCT FROM 'Non-product')
       AND (p_families IS NULL OR s.family = ANY (p_families))
  ), top_sku AS (
    SELECT sku FROM f WHERE p_group = 'sku' GROUP BY sku ORDER BY sum(val) DESC NULLS LAST LIMIT greatest(p_top, 1)
  ), names AS (
    SELECT DISTINCT ON (f.sku) f.sku, coalesce(f.product_name, f.sku) AS product_name
      FROM f JOIN top_sku t USING (sku) ORDER BY f.sku, f.date DESC
  ), keyed AS (
    SELECT f.date,
           CASE p_group
             WHEN 'family'  THEN f.family
             WHEN 'channel' THEN f.channel
             WHEN 'country' THEN f.country
             WHEN 'sku'     THEN coalesce(t.sku, 'Other')
             ELSE 'Total'
           END AS k,
           f.val
      FROM f LEFT JOIN top_sku t ON t.sku = f.sku
  )
  SELECT keyed.date AS d, keyed.k, coalesce(n.product_name, keyed.k) AS label, round(sum(keyed.val), 2) AS v
    FROM keyed LEFT JOIN names n ON p_group = 'sku' AND n.sku = keyed.k
   GROUP BY keyed.date, keyed.k, n.product_name
   ORDER BY 1, 2
$$;

CREATE OR REPLACE FUNCTION dp_units_dims(p_from date, p_to date)
RETURNS TABLE (dim text, k text, units numeric)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT 'family', family, sum(units) FROM wh_sku_sales_daily WHERE date BETWEEN p_from AND p_to GROUP BY 2
  UNION ALL
  SELECT 'channel', channel, sum(units) FROM wh_sku_sales_daily WHERE date BETWEEN p_from AND p_to GROUP BY 2
  UNION ALL
  SELECT 'country', country, sum(units) FROM wh_sku_sales_daily WHERE date BETWEEN p_from AND p_to GROUP BY 2
  ORDER BY 1, 3 DESC
$$;
