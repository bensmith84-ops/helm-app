-- Demand Planning > Inventory Cover: connect the demand forecast to stock.
--
-- Copied from the warehouse by the 'supply' warehouse-sync task:
--   wh_bom            Cin7 bills of materials (all kits/bundles: a parent SKU
--                     sells as N of each component; no raw materials).
--   wh_open_po_lines  open Cin7 purchase-order lines, quantity still to receive.
-- Built here:
--   dp_sku_map        manual sales-SKU -> stock-item mappings (editable in the
--                     app; qty 0 = "not a stocked product, ignore").
--   dp_items          every stock item (SKU seen in a recent stock snapshot or
--                     on an open PO), with a name.
--   dp_sku_resolved   each sales SKU -> the stock item(s) and quantity it
--                     consumes. Rebuilt by dp_refresh_sku_resolution() after
--                     each supply sync and whenever dp_sku_map changes.
-- Read by the app:
--   dp_item_demand()  daily units per stock item and region (arrays).
--   dp_unmapped_skus() sales SKUs that don't resolve to a stock item.
--   v_dp_stock, v_dp_open_po  latest stock and open POs with a region.

CREATE TABLE IF NOT EXISTS wh_bom (
  org_id        uuid NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001',
  parent_sku    text NOT NULL,
  component_sku text NOT NULL,
  qty           numeric NOT NULL,
  parent_name   text,
  synced_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, parent_sku, component_sku)
);

CREATE TABLE IF NOT EXISTS wh_open_po_lines (
  org_id           uuid NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001',
  po_id            text NOT NULL,
  sku              text NOT NULL,
  order_number     text,
  supplier         text,
  location         text,
  status           text,
  receiving_status text,
  name             text,
  qty_ordered      numeric,
  qty_received     numeric,
  required_by      date,
  order_date       date,
  synced_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, po_id, sku)
);

CREATE TABLE IF NOT EXISTS dp_sku_map (
  org_id     uuid NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001',
  sales_sku  text NOT NULL,
  item_sku   text NOT NULL DEFAULT '',
  qty        numeric NOT NULL DEFAULT 1 CHECK (qty >= 0),
  note       text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, sales_sku, item_sku)
);

CREATE TABLE IF NOT EXISTS dp_items (
  org_id    uuid NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001',
  sku       text NOT NULL,
  name      text,
  family    text,
  stocked   boolean NOT NULL DEFAULT false,   -- on hand > 0 at a default location
  PRIMARY KEY (org_id, sku)
);

CREATE TABLE IF NOT EXISTS dp_sku_resolved (
  org_id    uuid NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001',
  sales_sku text NOT NULL,
  item_sku  text NOT NULL,      -- '' when ignored
  qty       numeric NOT NULL,   -- stock units used per unit sold (0 = ignored)
  how       text NOT NULL       -- manual | exact | bom | suffix | ignored
);
CREATE INDEX IF NOT EXISTS dp_sku_resolved_sales_idx ON dp_sku_resolved (sales_sku);

-- Regions ------------------------------------------------------------------
-- Stock locations: Stord facilities are all US. Cin7 sites by name.
CREATE OR REPLACE FUNCTION dp_location_region(p_source text, p_location text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_source = 'stord' THEN 'US'
    WHEN p_location ~* '(^UK|york|united kingdom)' THEN 'UK'
    WHEN p_location ~* 'canad'  THEN 'CA'
    WHEN p_location ~* 'austral' THEN 'AU'
    ELSE 'US'
  END
$$;

-- Which stock locations count by default. Stord is read directly, so Cin7's
-- "US-Stord" mirror is off; "DNU", test, lab, tooling and old sites are off.
CREATE OR REPLACE FUNCTION dp_location_default(p_source text, p_location text) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT p_source = 'stord' OR p_location IN (
    'Harrodsburg Manufacturing Facility', 'White City / Medford',
    'UK Fulfillment Center (York; 3PL)', 'Canadian Fulfillment Center (3PL)',
    'Australian Fulfillment Center (Sydney; 3PL)')
$$;

-- Where a sale ships from, by ship-to country.
CREATE OR REPLACE FUNCTION dp_country_region(p_country text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN upper(p_country) = 'CA' THEN 'CA'
    WHEN upper(p_country) IN ('AU', 'NZ') THEN 'AU'
    WHEN upper(p_country) IN ('GB', 'UK', 'IE', 'JE', 'GG', 'IM', 'FR', 'DE', 'IT', 'ES', 'PT', 'NL', 'BE', 'LU', 'AT',
      'DK', 'SE', 'FI', 'NO', 'IS', 'CH', 'PL', 'CZ', 'SK', 'HU', 'HR', 'SI', 'RO', 'BG', 'GR', 'CY', 'MT', 'EE', 'LV', 'LT', 'GI') THEN 'UK'
    ELSE 'US'
  END
$$;

-- Resolution ---------------------------------------------------------------
-- One sales SKU -> stock items. Order: manual map; a SKU that is stocked;
-- a Cin7 kit (expand components, recursively); any other known item; strip
-- marketplace suffixes (-AZ, -UPC, -FBM, -FBA) and pack counts (-03P = 3x).
CREATE OR REPLACE FUNCTION dp_resolve_sku(p_sku text, p_depth int DEFAULT 0)
RETURNS TABLE (item_sku text, qty numeric, how text)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_base text; v_mult numeric := 1; v_m text[];
BEGIN
  IF p_depth > 5 OR p_sku IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM dp_sku_map m WHERE m.sales_sku = p_sku) THEN
    RETURN QUERY SELECT m.item_sku, m.qty, CASE WHEN m.qty = 0 THEN 'ignored' ELSE 'manual' END FROM dp_sku_map m WHERE m.sales_sku = p_sku;
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM dp_items i WHERE i.sku = p_sku AND i.stocked) THEN
    RETURN QUERY SELECT p_sku, 1::numeric, 'exact'; RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM wh_bom b WHERE b.parent_sku = p_sku) THEN
    RETURN QUERY
      SELECT r.item_sku, sum(r.qty * b.qty), 'bom'
        FROM wh_bom b, LATERAL dp_resolve_sku(b.component_sku, p_depth + 1) r
       WHERE b.parent_sku = p_sku AND r.qty > 0
       GROUP BY r.item_sku;
    RETURN;
  END IF;
  IF EXISTS (SELECT 1 FROM dp_items i WHERE i.sku = p_sku) THEN
    RETURN QUERY SELECT p_sku, 1::numeric, 'exact'; RETURN;
  END IF;
  v_base := p_sku;
  v_m := regexp_match(v_base, '^(.+)-0*([1-9][0-9]?)P$');
  IF v_m IS NOT NULL THEN v_base := v_m[1]; v_mult := v_m[2]::numeric; END IF;
  v_base := regexp_replace(v_base, '-(AZ|UPC|FBM|FBA)$', '', 'i');
  IF v_base <> p_sku THEN
    RETURN QUERY SELECT r.item_sku, r.qty * v_mult, CASE WHEN r.how IN ('exact', 'suffix') THEN 'suffix' ELSE r.how END
      FROM dp_resolve_sku(v_base, p_depth + 1) r;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION dp_refresh_sku_resolution() RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n integer;
BEGIN
  DELETE FROM dp_items;
  INSERT INTO dp_items (sku, name, family, stocked)
  SELECT sku, name, dp_family(sku, name), stocked FROM (
    SELECT i.sku,
           (array_agg(i.name ORDER BY (i.name IS NULL), i.snapshot_date DESC))[1] AS name,
           bool_or(coalesce(i.on_hand, 0) > 0 AND dp_location_default(i.source, i.location)) AS stocked
      FROM wh_inventory_snapshot i
     WHERE i.snapshot_date >= current_date - 45
     GROUP BY i.sku
    UNION ALL
    SELECT p.sku, max(p.name), false FROM wh_open_po_lines p
     WHERE NOT EXISTS (SELECT 1 FROM wh_inventory_snapshot i WHERE i.sku = p.sku AND i.snapshot_date >= current_date - 45)
     GROUP BY p.sku
  ) x;
  -- Fill missing names (Stord rows have none) from recent sales.
  UPDATE dp_items d SET name = s.product_name, family = dp_family(d.sku, s.product_name)
    FROM (SELECT DISTINCT ON (sku) sku, product_name FROM wh_sku_sales_daily
           WHERE date >= current_date - 120 AND product_name IS NOT NULL ORDER BY sku, date DESC) s
   WHERE d.name IS NULL AND s.sku = d.sku;

  DELETE FROM dp_sku_resolved;
  INSERT INTO dp_sku_resolved (sales_sku, item_sku, qty, how)
  SELECT s.sku, r.item_sku, r.qty, r.how
    FROM (SELECT DISTINCT sku FROM wh_sku_sales_daily
           WHERE date >= current_date - 730 AND family IS DISTINCT FROM 'Non-product') s,
         LATERAL dp_resolve_sku(s.sku) r;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;

CREATE OR REPLACE FUNCTION dp_sku_map_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN PERFORM dp_refresh_sku_resolution(); RETURN NULL; END $$;
DROP TRIGGER IF EXISTS trg_dp_sku_map_changed ON dp_sku_map;
CREATE TRIGGER trg_dp_sku_map_changed AFTER INSERT OR UPDATE OR DELETE ON dp_sku_map
  FOR EACH STATEMENT EXECUTE FUNCTION dp_sku_map_changed();

-- Reads ----------------------------------------------------------------------
-- Daily stock-unit demand per item and region, from p_from to p_to, as a dense
-- array (index 0 = p_from). Includes free units (gifts and replacements use
-- stock too).
CREATE OR REPLACE FUNCTION dp_item_demand(p_from date, p_to date, p_channels text[] DEFAULT NULL)
RETURNS TABLE (item_sku text, region text, total numeric, v numeric[])
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  WITH x AS (
    SELECT s.date, r.item_sku, dp_country_region(s.country) AS region, sum(s.units * r.qty) AS u
      FROM wh_sku_sales_daily s
      JOIN dp_sku_resolved r ON r.sales_sku = s.sku AND r.qty > 0
     WHERE s.date BETWEEN p_from AND p_to
       AND (p_channels IS NULL OR s.channel = ANY (p_channels))
     GROUP BY 1, 2, 3
  ), keys AS (
    SELECT x.item_sku, x.region, sum(x.u) AS total FROM x GROUP BY 1, 2
  )
  SELECT k.item_sku, k.region, k.total,
         array_agg(coalesce(x.u, 0) ORDER BY g.d)
    FROM keys k
    CROSS JOIN generate_series(p_from, p_to, interval '1 day') AS g(d)
    LEFT JOIN x ON x.item_sku = k.item_sku AND x.region = k.region AND x.date = g.d::date
   GROUP BY k.item_sku, k.region, k.total
$$;

CREATE OR REPLACE FUNCTION dp_unmapped_skus(p_from date, p_to date)
RETURNS TABLE (sku text, name text, channels text, family text, units numeric)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT s.sku, (array_agg(s.product_name ORDER BY s.date DESC))[1], string_agg(DISTINCT s.channel, ', '),
         (array_agg(s.family ORDER BY s.date DESC))[1], sum(s.units)
    FROM wh_sku_sales_daily s
   WHERE s.date BETWEEN p_from AND p_to
     AND s.family IS DISTINCT FROM 'Non-product'
     AND NOT EXISTS (SELECT 1 FROM dp_sku_resolved r WHERE r.sales_sku = s.sku)
   GROUP BY s.sku
   ORDER BY 5 DESC NULLS LAST
$$;

CREATE OR REPLACE VIEW v_dp_stock WITH (security_invoker = true) AS
  SELECT i.source, i.location, i.sku, i.snapshot_date, i.on_hand,
         coalesce(i.available, i.on_hand) AS available, i.incoming,
         dp_location_region(i.source, i.location) AS region,
         dp_location_default(i.source, i.location) AS default_on
    FROM wh_inventory_snapshot i
    JOIN (SELECT source, max(snapshot_date) AS d FROM wh_inventory_snapshot GROUP BY source) m
      ON m.source = i.source AND m.d = i.snapshot_date
    JOIN dp_items it ON it.sku = i.sku;

CREATE OR REPLACE VIEW v_dp_open_po WITH (security_invoker = true) AS
  SELECT p.po_id, p.order_number, p.supplier, p.location, p.status, p.sku, p.name,
         p.qty_ordered, p.qty_received, greatest(p.qty_ordered - coalesce(p.qty_received, 0), 0) AS qty_open,
         p.required_by, p.order_date, dp_location_region('cin7', p.location) AS region
    FROM wh_open_po_lines p
   WHERE p.qty_ordered - coalesce(p.qty_received, 0) > 0
     AND p.location !~* '(test|lab|tooling)';

-- Access -----------------------------------------------------------------------
DO $p$ DECLARE t text; BEGIN
  FOREACH t IN ARRAY ARRAY['wh_bom', 'wh_open_po_lines', 'dp_items', 'dp_sku_resolved', 'dp_sku_map'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = t AND policyname = 'org_iso_' || t) THEN
      EXECUTE format('CREATE POLICY %I ON %I FOR SELECT USING (org_id = (SELECT active_org()))', 'org_iso_' || t, t);
    END IF;
    EXECUTE format('REVOKE ALL ON %I FROM PUBLIC, anon', t);
    EXECUTE format('GRANT SELECT ON %I TO authenticated', t);
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dp_sku_map' AND policyname = 'org_write_dp_sku_map') THEN
    CREATE POLICY org_write_dp_sku_map ON dp_sku_map FOR ALL
      USING (org_id = (SELECT active_org())) WITH CHECK (org_id = (SELECT active_org()));
  END IF;
END $p$;
GRANT INSERT, UPDATE, DELETE ON dp_sku_map TO authenticated;
GRANT SELECT ON v_dp_stock, v_dp_open_po TO authenticated;
REVOKE ALL ON v_dp_stock, v_dp_open_po FROM anon;
GRANT EXECUTE ON FUNCTION dp_item_demand(date, date, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION dp_unmapped_skus(date, date) TO authenticated;
REVOKE EXECUTE ON FUNCTION dp_item_demand(date, date, text[]) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION dp_unmapped_skus(date, date) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION dp_refresh_sku_resolution() FROM anon, PUBLIC, authenticated;

SELECT dp_refresh_sku_resolution();
