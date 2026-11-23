-- Zero-based budget people: current compensation from the HRIS export, in the
-- employee's pay currency. salary/bonus stay the plan-year figures (same currency);
-- plan settings hold FX rates to USD.
ALTER TABLE zbb_people ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'USD';
ALTER TABLE zbb_people ADD COLUMN IF NOT EXISTS current_salary numeric NOT NULL DEFAULT 0;
ALTER TABLE zbb_people ADD COLUMN IF NOT EXISTS is_existing boolean NOT NULL DEFAULT false;
ALTER TABLE zbb_people ADD COLUMN IF NOT EXISTS source text;
UPDATE zbb_people SET is_existing = true WHERE profile_id IS NOT NULL AND is_existing = false;
