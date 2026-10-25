-- Inventory Cover fixes after the first run on real data.
--
-- 1. Pack SKUs: Amazon and post-purchase pack SKUs (-AZ-02P, -FBM,
--    H-01-DDC-FF60T-3) exist as Cin7 products with no stock of their own; they
--    ship as N of the base item. Resolve them to the base item before falling
--    back to an out-of-stock item, and only treat a SKU as an out-of-stock item
--    when it has stock somewhere or an open PO; otherwise it is listed as
--    unmapped (e.g. H-01-DDC-FF60T-6, a post-purchase pack) for a manual mapping.
-- 2. Stock that counts as another item (dp_item_alias): e.g. an older
--    generation SKU still on hand that ships as the current one. Its stock,
--    open POs and sales are planned under the target item. Empty by default;
--    edited in the app.
-- 3. dp_item_demand returns sparse arrays (day index + units) instead of a
--    dense array built with a cross join: 5.4s -> well under a second.

CREATE TABLE IF NOT EXISTS dp_item_alias (
  org_id     uuid NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001',
  alias_sku  text NOT NULL,
  item_sku   text NOT NULL,
  qty        numeric NOT NULL DEFAULT 1 CHECK (qty > 0),
  note       text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, alias_sku),
  CHECK (alias_sku <> item_sku)
);
ALTER TABLE dp_item_alias ENABLE ROW LEVEL SECURITY;
DO $p$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dp_item_alias' AND policyname = 'org_iso_dp_item_alias') THEN
    CREATE POLICY org_iso_dp_item_alias ON dp_item_alias FOR SELECT USING (org_id = (SELECT active_org()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dp_item_alias' AND policyname = 'org_write_dp_item_alias') THEN
    CREATE POLICY org_write_dp_item_alias ON dp_item_alias FOR ALL
      USING (org_id = (SELECT active_org())) WITH CHECK (org_id = (SELECT active_org()));
  END IF;
END $p$;
REVOKE ALL ON dp_item_alias FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON dp_item_alias TO authenticated;
DROP TRIGGER IF EXISTS trg_dp_item_alias_changed ON dp_item_alias;
CREATE TRIGGER trg_dp_item_alias_changed AFTER INSERT OR UPDATE OR DELETE ON dp_item_alias
  FOR EACH STATEMENT EXECUTE FUNCTION dp_sku_map_changed();

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
  IF EXISTS (SELECT 1 FROM dp_item_alias a WHERE a.alias_sku = p_sku) THEN
    RETURN QUERY SELECT r.item_sku, r.qty * a.qty, 'alias'
      FROM dp_item_alias a, LATERAL dp_resolve_sku(a.item_sku, p_depth + 1) r WHERE a.alias_sku = p_sku;
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
  -- Marketplace suffix and pack count: L-06-LS-FS30S-AZ-03P = 3 x L-06-LS-FS30S.
  v_base := p_sku;
  v_m := regexp_match(v_base, '^(.+)-0*([1-9][0-9]?)P$');
  IF v_m IS NOT NULL THEN v_base := v_m[1]; v_mult := v_m[2]::numeric; END IF;
  v_base := regexp_replace(v_base, '-(AZ|UPC|FBM|FBA)$', '', 'i');
  IF v_base <> p_sku THEN
    RETURN QUERY SELECT r.item_sku, r.qty * v_mult, CASE WHEN r.how IN ('exact', 'suffix') THEN 'suffix' ELSE r.how END
      FROM dp_resolve_sku(v_base, p_depth + 1) r;
    IF FOUND THEN RETURN; END IF;
  END IF;
  -- A real item that is out of stock: it has stock somewhere (a location not
  -- counted by default) or an open PO. A Cin7 product that never held stock
  -- is left unmapped so it shows up for a manual mapping instead.
  IF EXISTS (SELECT 1 FROM wh_open_po_lines p WHERE p.sku = p_sku)
     OR EXISTS (SELECT 1 FROM wh_inventory_snapshot i WHERE i.sku = p_sku AND i.snapshot_date >= current_date - 45 AND i.on_hand > 0) THEN
    RETURN QUERY SELECT p_sku, 1::numeric, 'exact'; RETURN;
  END IF;
END $$;

-- Stock and POs carry the item they are planned under.
CREATE OR REPLACE VIEW v_dp_stock WITH (security_invoker = true) AS
  SELECT i.source, i.location, i.sku, i.snapshot_date, i.on_hand,
         coalesce(i.available, i.on_hand) AS available, i.incoming,
         dp_location_region(i.source, i.location) AS region,
         dp_location_default(i.source, i.location) AS default_on,
         coalesce(a.item_sku, i.sku) AS plan_sku, coalesce(a.qty, 1) AS plan_qty
    FROM wh_inventory_snapshot i
    JOIN (SELECT source, max(snapshot_date) AS d FROM wh_inventory_snapshot GROUP BY source) m
      ON m.source = i.source AND m.d = i.snapshot_date
    JOIN dp_items it ON it.sku = i.sku
    LEFT JOIN dp_item_alias a ON a.alias_sku = i.sku;

CREATE OR REPLACE VIEW v_dp_open_po WITH (security_invoker = true) AS
  SELECT p.po_id, p.order_number, p.supplier, p.location, p.status, p.sku, p.name,
         p.qty_ordered, p.qty_received, greatest(p.qty_ordered - coalesce(p.qty_received, 0), 0) AS qty_open,
         p.required_by, p.order_date, dp_location_region('cin7', p.location) AS region,
         coalesce(a.item_sku, p.sku) AS plan_sku, coalesce(a.qty, 1) AS plan_qty
    FROM wh_open_po_lines p
    LEFT JOIN dp_item_alias a ON a.alias_sku = p.sku
   WHERE p.qty_ordered - coalesce(p.qty_received, 0) > 0
     AND p.location !~* '(test|lab|tooling)';

-- Sparse daily demand: idx = days since p_from, u = units that day.
DROP FUNCTION IF EXISTS dp_item_demand(date, date, text[]);
CREATE FUNCTION dp_item_demand(p_from date, p_to date, p_channels text[] DEFAULT NULL)
RETURNS TABLE (item_sku text, region text, total numeric, idx int[], u numeric[])
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  WITH s AS (
    SELECT s.date, s.sku, dp_country_region(s.country) AS region, sum(s.units) AS units
      FROM wh_sku_sales_daily s
     WHERE s.date BETWEEN p_from AND p_to
       AND (p_channels IS NULL OR s.channel = ANY (p_channels))
       AND s.family IS DISTINCT FROM 'Non-product'
     GROUP BY 1, 2, 3
  ), x AS (
    SELECT s.date, r.item_sku, s.region, sum(s.units * r.qty) AS u
      FROM s JOIN dp_sku_resolved r ON r.sales_sku = s.sku AND r.qty > 0
     GROUP BY 1, 2, 3
  )
  SELECT x.item_sku, x.region, sum(x.u), array_agg((x.date - p_from) ORDER BY x.date), array_agg(x.u ORDER BY x.date)
    FROM x GROUP BY 1, 2
$$;
GRANT EXECUTE ON FUNCTION dp_item_demand(date, date, text[]) TO authenticated;
REVOKE EXECUTE ON FUNCTION dp_item_demand(date, date, text[]) FROM anon, PUBLIC;
GRANT SELECT ON v_dp_stock, v_dp_open_po TO authenticated;

SELECT dp_refresh_sku_resolution();
