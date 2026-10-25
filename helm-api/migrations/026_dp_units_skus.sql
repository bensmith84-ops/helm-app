-- Daily Units: filter to chosen SKUs (searchable SKU / description picker),
-- and list SKUs with their latest description for that picker.
DROP FUNCTION IF EXISTS dp_units_daily(date, date, text, text[], text[], text[], boolean, text, int, boolean);
CREATE FUNCTION dp_units_daily(
  p_from date, p_to date, p_group text DEFAULT 'total',
  p_families text[] DEFAULT NULL, p_channels text[] DEFAULT NULL, p_countries text[] DEFAULT NULL,
  p_include_free boolean DEFAULT false, p_measure text DEFAULT 'units', p_top int DEFAULT 12,
  p_include_nonproduct boolean DEFAULT false, p_skus text[] DEFAULT NULL)
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
       AND (p_skus IS NULL OR s.sku = ANY (p_skus))
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


CREATE OR REPLACE FUNCTION dp_units_skus(p_from date, p_to date)
RETURNS TABLE (sku text, name text, family text, channels text, units numeric)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT s.sku, (array_agg(s.product_name ORDER BY s.date DESC) FILTER (WHERE s.product_name IS NOT NULL))[1],
         (array_agg(s.family ORDER BY s.date DESC))[1], string_agg(DISTINCT s.channel, ', '), sum(s.units)
    FROM wh_sku_sales_daily s
   WHERE s.date BETWEEN p_from AND p_to AND s.family IS DISTINCT FROM 'Non-product'
   GROUP BY s.sku
   ORDER BY 5 DESC NULLS LAST
$$;

GRANT EXECUTE ON FUNCTION dp_units_daily(date, date, text, text[], text[], text[], boolean, text, int, boolean, text[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION dp_units_daily(date, date, text, text[], text[], text[], boolean, text, int, boolean, text[]) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION dp_units_skus(date, date) TO authenticated;
REVOKE EXECUTE ON FUNCTION dp_units_skus(date, date) FROM anon, PUBLIC;
