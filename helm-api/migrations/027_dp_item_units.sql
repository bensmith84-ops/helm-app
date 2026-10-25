-- Daily Units: "Product units" measure and "Product line" split.
--
-- The warehouse has no table that breaks bundles and multi-packs into the
-- products they contain: Metabase's SKU master (card 527) only reads a pack
-- count from a -NNP suffix on Shopify variants. Inventory Cover's resolution
-- (dp_sku_resolved: manual map, Cin7 kits, -AZ/-UPC suffixes, -03P = 3x) does,
-- so Daily Units can now count in product units: a 3-pack sold = 3 units of
-- L-06-LS-FS30S, a 1-year bundle = its components. SKUs that don't resolve
-- count as themselves x their pack size.
--
-- Product line = SKU prefix up to the product type: L-06-LS (laundry sheets,
-- generation 06), L-09-LS, L-01-DS (dryer sheets), H-01-DDC ... so L-06 and
-- L-09 can be seen separately or summed.
CREATE OR REPLACE FUNCTION dp_line(p_sku text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(substring(upper(p_sku) from '^([A-Z]+-[0-9]{2}-[A-Z]+)'), 'Other')
$$;

DROP FUNCTION IF EXISTS dp_units_daily(date, date, text, text[], text[], text[], boolean, text, int, boolean, text[]);
CREATE FUNCTION dp_units_daily(
  p_from date, p_to date, p_group text DEFAULT 'total',
  p_families text[] DEFAULT NULL, p_channels text[] DEFAULT NULL, p_countries text[] DEFAULT NULL,
  p_include_free boolean DEFAULT false, p_measure text DEFAULT 'units', p_top int DEFAULT 12,
  p_include_nonproduct boolean DEFAULT false, p_skus text[] DEFAULT NULL, p_lines text[] DEFAULT NULL)
RETURNS TABLE (d date, k text, label text, v numeric)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  WITH base AS (
    SELECT s.date, s.sku, s.channel, s.country, s.family, s.product_name, s.units, s.orders,
           coalesce(s.gross_revenue, 0) - coalesce(s.discounts, 0) AS net, coalesce(nullif(m.units_per_sku, 0), 1) AS pack
      FROM wh_sku_sales_daily s
      LEFT JOIN dp_sku_master m ON m.sku = s.sku AND m.org_id = s.org_id
     WHERE s.date BETWEEN p_from AND p_to
       AND (p_include_free OR coalesce(s.gross_revenue, 0) > 0)
       AND (p_channels  IS NULL OR s.channel = ANY (p_channels))
       AND (p_countries IS NULL OR s.country = ANY (p_countries))
       AND (p_include_nonproduct OR s.family IS DISTINCT FROM 'Non-product')
  ), f0 AS (
    -- Product units: one row per product the sales SKU contains.
    SELECT b.date, r.item_sku AS sku, b.channel, b.country,
           coalesce(it.family, b.family) AS family, coalesce(it.name, b.product_name) AS product_name, b.units * r.qty AS val
      FROM base b JOIN dp_sku_resolved r ON r.sales_sku = b.sku AND r.qty > 0
      LEFT JOIN dp_items it ON it.sku = r.item_sku
     WHERE p_measure = 'items'
    UNION ALL
    SELECT b.date, b.sku, b.channel, b.country, b.family, b.product_name, b.units * b.pack
      FROM base b
     WHERE p_measure = 'items' AND NOT EXISTS (SELECT 1 FROM dp_sku_resolved r WHERE r.sales_sku = b.sku)
    UNION ALL
    SELECT b.date, b.sku, b.channel, b.country, b.family, b.product_name,
           CASE p_measure WHEN 'packs' THEN b.units * b.pack WHEN 'orders' THEN b.orders::numeric WHEN 'revenue' THEN b.net ELSE b.units END
      FROM base b
     WHERE p_measure <> 'items'
  ), f AS (
    SELECT f0.*, dp_line(f0.sku) AS line FROM f0
     WHERE (p_families IS NULL OR f0.family = ANY (p_families))
       AND (p_skus IS NULL OR f0.sku = ANY (p_skus))
       AND (p_lines IS NULL OR dp_line(f0.sku) = ANY (p_lines))
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
             WHEN 'line'    THEN f.line
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

-- SKU picker list; with p_items, the products after breaking bundles down.
DROP FUNCTION IF EXISTS dp_units_skus(date, date);
CREATE FUNCTION dp_units_skus(p_from date, p_to date, p_items boolean DEFAULT false)
RETURNS TABLE (sku text, name text, family text, line text, channels text, units numeric)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  WITH s AS (
    SELECT s.date, s.sku, s.product_name, s.family, s.channel, s.units
      FROM wh_sku_sales_daily s
     WHERE s.date BETWEEN p_from AND p_to AND s.family IS DISTINCT FROM 'Non-product'
  ), x AS (
    SELECT s.date, s.sku, s.product_name, s.family, s.channel, s.units FROM s WHERE NOT p_items
    UNION ALL
    SELECT s.date, r.item_sku, coalesce(it.name, s.product_name), coalesce(it.family, s.family), s.channel, s.units * r.qty
      FROM s JOIN dp_sku_resolved r ON r.sales_sku = s.sku AND r.qty > 0 LEFT JOIN dp_items it ON it.sku = r.item_sku
     WHERE p_items
    UNION ALL
    SELECT s.date, s.sku, s.product_name, s.family, s.channel, s.units FROM s
     WHERE p_items AND NOT EXISTS (SELECT 1 FROM dp_sku_resolved r WHERE r.sales_sku = s.sku)
  )
  SELECT x.sku, (array_agg(x.product_name ORDER BY x.date DESC) FILTER (WHERE x.product_name IS NOT NULL))[1],
         (array_agg(x.family ORDER BY x.date DESC))[1], dp_line(x.sku), string_agg(DISTINCT x.channel, ', '), sum(x.units)
    FROM x GROUP BY x.sku
   ORDER BY 6 DESC NULLS LAST
$$;

-- Product lines with their main family, for the line filter.
CREATE OR REPLACE FUNCTION dp_units_lines(p_from date, p_to date)
RETURNS TABLE (line text, family text, units numeric)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT x.line, (array_agg(x.family ORDER BY x.units DESC))[1], sum(x.units)
    FROM (SELECT dp_line(sku) AS line, family, sum(units) AS units FROM dp_units_skus(p_from, p_to, true) GROUP BY 1, 2) x
   GROUP BY x.line
   ORDER BY 3 DESC
$$;

GRANT EXECUTE ON FUNCTION dp_line(text) TO authenticated;
GRANT EXECUTE ON FUNCTION dp_units_daily(date, date, text, text[], text[], text[], boolean, text, int, boolean, text[], text[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION dp_units_daily(date, date, text, text[], text[], text[], boolean, text, int, boolean, text[], text[]) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION dp_units_skus(date, date, boolean) TO authenticated;
REVOKE EXECUTE ON FUNCTION dp_units_skus(date, date, boolean) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION dp_units_lines(date, date) TO authenticated;
REVOKE EXECUTE ON FUNCTION dp_units_lines(date, date) FROM anon, PUBLIC;
