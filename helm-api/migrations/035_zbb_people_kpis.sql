-- Zero-based budget: core responsibilities (list of strings) and KPIs
-- ([{ name, target }]) for each person or role.
ALTER TABLE zbb_people ADD COLUMN IF NOT EXISTS responsibilities jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE zbb_people ADD COLUMN IF NOT EXISTS kpis jsonb NOT NULL DEFAULT '[]'::jsonb;
