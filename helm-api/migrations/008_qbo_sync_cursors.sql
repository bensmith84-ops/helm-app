-- Resume point for QuickBooks entities that are too big to pull in one request
-- (customers, invoices). qbo-sync walks them oldest-change-first and records
-- the last Metadata.LastUpdatedTime it saved, so every run picks up where the
-- previous one stopped and later runs only fetch what changed.
CREATE TABLE IF NOT EXISTS qbo_sync_cursors (
  realm_id     text NOT NULL,
  entity       text NOT NULL,
  last_updated timestamptz,
  complete     boolean NOT NULL DEFAULT false,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (realm_id, entity)
);
REVOKE ALL ON qbo_sync_cursors FROM PUBLIC, anon;
GRANT SELECT ON qbo_sync_cursors TO authenticated;
