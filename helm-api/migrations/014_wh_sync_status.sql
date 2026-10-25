-- Record which warehouse build each sync copied, and expose the latest
-- Scoreboard sync to signed-in members (wh_sync_log itself stays private).
ALTER TABLE wh_sync_log
  ADD COLUMN IF NOT EXISTS through_date    date,
  ADD COLUMN IF NOT EXISTS source_built_at timestamptz,
  ADD COLUMN IF NOT EXISTS complete        boolean;

CREATE OR REPLACE VIEW wh_sync_status AS
SELECT DISTINCT ON (task)
       task, started_at, finished_at, rows_saved, through_date, source_built_at, complete,
       (error IS NOT NULL) AS failed
  FROM wh_sync_log
 WHERE task IN ('scorecard', 'scoreboard') AND finished_at IS NOT NULL
   AND active_org() IS NOT NULL
 ORDER BY task, started_at DESC;

REVOKE ALL ON wh_sync_status FROM PUBLIC, anon;
GRANT SELECT ON wh_sync_status TO authenticated;
