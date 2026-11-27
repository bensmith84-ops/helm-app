-- Portfolios for the new Projects suite: a named set of projects tracked
-- together (status, progress, dates, owner). Membership is an array on the row;
-- portfolios are small and edited by one person at a time.
CREATE TABLE IF NOT EXISTS portfolios (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL,
  name        text NOT NULL,
  description text,
  color       text,
  owner_id    uuid,
  project_ids uuid[] NOT NULL DEFAULT '{}',
  settings    jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  deleted_at  timestamptz
);
CREATE INDEX IF NOT EXISTS portfolios_org_idx ON portfolios (org_id) WHERE deleted_at IS NULL;
ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;
DO $p$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'portfolios' AND policyname = 'org_iso_portfolios') THEN
    CREATE POLICY org_iso_portfolios ON portfolios FOR ALL
      USING (org_id = (SELECT active_org())) WITH CHECK (org_id = (SELECT active_org()));
  END IF;
END $p$;
REVOKE ALL ON portfolios FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON portfolios TO authenticated;
