-- Written by the helm-resync job; read by the nightly export (db_readiness tab).
CREATE TABLE IF NOT EXISTS _resync_report (
  run_id   text,
  kind     text,
  name     text,
  supabase bigint,
  target   bigint,
  detail   text,
  at       timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS _resync_report_run_idx ON _resync_report (run_id);
REVOKE ALL ON TABLE _resync_report FROM authenticated, anon;
