-- Audit log written by /cron after every scheduled job (see routes/cron.js).
CREATE TABLE IF NOT EXISTS cron_run_log (
  id               bigserial PRIMARY KEY,
  job              text NOT NULL,
  path             text,
  status_code      integer,
  response_snippet text,
  started_at       timestamptz NOT NULL DEFAULT now(),
  finished_at      timestamptz
);
CREATE INDEX IF NOT EXISTS cron_run_log_started_idx ON cron_run_log (started_at DESC);
CREATE INDEX IF NOT EXISTS cron_run_log_job_idx ON cron_run_log (job, started_at DESC);
