-- Zero-based budget versions: several named plans per org and year (scenarios),
-- each with its own people, lines, actuals and settings. parent_id records the
-- version a copy was made from.
ALTER TABLE zbb_plans DROP CONSTRAINT IF EXISTS zbb_plans_org_id_year_key;
ALTER TABLE zbb_plans ADD COLUMN IF NOT EXISTS parent_id uuid;
CREATE INDEX IF NOT EXISTS zbb_plans_org_year_idx ON zbb_plans (org_id, year);
