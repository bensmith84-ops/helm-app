-- Planned supply entered in Helm: Harrodsburg production runs (and anything
-- else not on a Cin7 PO). Cin7 assembly/production orders aren't in the
-- warehouse yet; until they are, runs are entered on the Inventory Cover tab
-- and count as arrivals on their date. Past-dated runs are ignored (they are
-- assumed to be in stock already) until moved or removed.
CREATE TABLE IF NOT EXISTS dp_planned_supply (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001',
  item_sku    text NOT NULL,
  region      text NOT NULL DEFAULT 'US' CHECK (region IN ('US', 'UK', 'CA', 'AU')),
  qty         numeric NOT NULL CHECK (qty > 0),
  arrive_date date NOT NULL,
  kind        text NOT NULL DEFAULT 'production',
  location    text DEFAULT 'Harrodsburg Manufacturing Facility',
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dp_planned_supply_item_idx ON dp_planned_supply (item_sku, arrive_date);
ALTER TABLE dp_planned_supply ENABLE ROW LEVEL SECURITY;
DO $p$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'dp_planned_supply' AND policyname = 'org_all_dp_planned_supply') THEN
    CREATE POLICY org_all_dp_planned_supply ON dp_planned_supply FOR ALL
      USING (org_id = (SELECT active_org())) WITH CHECK (org_id = (SELECT active_org()));
  END IF;
END $p$;
REVOKE ALL ON dp_planned_supply FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON dp_planned_supply TO authenticated;
