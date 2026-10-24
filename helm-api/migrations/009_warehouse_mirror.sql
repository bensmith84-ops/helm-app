-- Copies of the data team's curated BigQuery tables, pulled nightly through
-- Metabase by /warehouse-sync. Org-isolated like the rest of Helm: external
-- collaborators (active_org() = NULL) can't read them.
CREATE TABLE IF NOT EXISTS wh_scorecard_daily (
  org_id       uuid NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001',
  date         date NOT NULL,
  country_code text NOT NULL,
  metrics      jsonb NOT NULL,          -- every scorecard_v2_main column, as-is
  synced_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, date, country_code)
);
CREATE TABLE IF NOT EXISTS wh_inventory_snapshot (
  org_id        uuid NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001',
  snapshot_date date NOT NULL,
  source        text NOT NULL,          -- 'stord' (inventory_report_helm) or 'cin7' (product_availability)
  location      text NOT NULL,
  sku           text NOT NULL,
  name          text,
  on_hand       numeric,
  available     numeric,
  reserved      numeric,
  incoming      numeric,
  synced_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, snapshot_date, source, location, sku)
);
CREATE TABLE IF NOT EXISTS wh_sync_log (
  id          bigserial PRIMARY KEY,
  task        text NOT NULL,
  started_at  timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  rows_saved  integer,
  error       text
);
ALTER TABLE wh_scorecard_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE wh_inventory_snapshot ENABLE ROW LEVEL SECURITY;
DO $p$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wh_scorecard_daily' AND policyname = 'org_iso_wh_scorecard_daily') THEN
    CREATE POLICY org_iso_wh_scorecard_daily ON wh_scorecard_daily FOR SELECT USING (org_id = active_org());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'wh_inventory_snapshot' AND policyname = 'org_iso_wh_inventory_snapshot') THEN
    CREATE POLICY org_iso_wh_inventory_snapshot ON wh_inventory_snapshot FOR SELECT USING (org_id = active_org());
  END IF;
END $p$;
REVOKE ALL ON wh_scorecard_daily, wh_inventory_snapshot, wh_sync_log FROM PUBLIC, anon;
GRANT SELECT ON wh_scorecard_daily, wh_inventory_snapshot TO authenticated;
