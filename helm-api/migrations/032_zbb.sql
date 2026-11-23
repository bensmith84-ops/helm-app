-- Zero-based Opex budget (Finance > Zero-Based Budget). One plan per org and
-- year. People hold salaries, so these tables are only reachable through the
-- /zbb API route (owners and admins), never through /rest/v1.
CREATE TABLE IF NOT EXISTS zbb_plans (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL DEFAULT 'a0000000-0000-0000-0000-000000000001',
  year        int  NOT NULL,
  name        text NOT NULL,
  settings    jsonb NOT NULL DEFAULT '{}'::jsonb,
  actuals_refreshed_at timestamptz,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (org_id, year)
);

-- One row per person or role. status: keep | remove | new (open role to hire).
-- start_month / end_month are months of the plan year (1-12) someone is paid from and
-- through; end_month 0 means a removed person is gone before January.
CREATE TABLE IF NOT EXISTS zbb_people (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id     uuid NOT NULL REFERENCES zbb_plans(id) ON DELETE CASCADE,
  profile_id  uuid,
  name        text NOT NULL,
  title       text,
  department  text,
  manager_id  uuid,
  status      text NOT NULL DEFAULT 'keep' CHECK (status IN ('keep', 'remove', 'new')),
  salary      numeric NOT NULL DEFAULT 0,
  bonus       numeric NOT NULL DEFAULT 0,
  start_month int NOT NULL DEFAULT 1 CHECK (start_month BETWEEN 1 AND 12),
  end_month   int NOT NULL DEFAULT 12 CHECK (end_month BETWEEN 0 AND 12),
  note        text,
  sort_order  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS zbb_people_plan_idx ON zbb_people (plan_id);

-- Vendors, software and other Opex lines. status: review (not yet decided,
-- counts as zero) | keep | change | remove | new.
CREATE TABLE IF NOT EXISTS zbb_lines (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id     uuid NOT NULL REFERENCES zbb_plans(id) ON DELETE CASCADE,
  vendor      text NOT NULL,
  account_num text,
  account_name text,
  category    text,
  kind        text NOT NULL DEFAULT 'vendor',
  baseline    numeric NOT NULL DEFAULT 0,
  amount      numeric NOT NULL DEFAULT 0,
  status      text NOT NULL DEFAULT 'review' CHECK (status IN ('review', 'keep', 'change', 'remove', 'new')),
  seats       numeric,
  unit_cost   numeric,
  billing     text,
  owner       text,
  note        text,
  source      text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS zbb_lines_plan_idx ON zbb_lines (plan_id);
CREATE UNIQUE INDEX IF NOT EXISTS zbb_lines_baseline_uq ON zbb_lines (plan_id, vendor, account_num) WHERE source = 'qbo';

-- Baseline actuals from QuickBooks (Profit and Loss Detail), Opex accounts only.
CREATE TABLE IF NOT EXISTS zbb_actuals (
  plan_id     uuid NOT NULL REFERENCES zbb_plans(id) ON DELETE CASCADE,
  month       text NOT NULL,
  account_num text NOT NULL,
  account_name text,
  vendor      text NOT NULL,
  amount      numeric NOT NULL DEFAULT 0,
  txns        int NOT NULL DEFAULT 0,
  PRIMARY KEY (plan_id, month, account_num, vendor)
);

DO $p$ BEGIN
  ALTER TABLE zbb_plans ENABLE ROW LEVEL SECURITY;
  ALTER TABLE zbb_people ENABLE ROW LEVEL SECURITY;
  ALTER TABLE zbb_lines ENABLE ROW LEVEL SECURITY;
  ALTER TABLE zbb_actuals ENABLE ROW LEVEL SECURITY;
END $p$;
REVOKE ALL ON zbb_plans, zbb_people, zbb_lines, zbb_actuals FROM PUBLIC;
DO $p$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON zbb_plans, zbb_people, zbb_lines, zbb_actuals FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON zbb_plans, zbb_people, zbb_lines, zbb_actuals FROM authenticated;
  END IF;
END $p$;
