-- Key results judged over a chosen target period (a calendar year or custom dates),
-- used when measure_period is 'year' or 'custom'. Growth values compare that period
-- with a comparison period (stored per value in measures[].compare).
ALTER TABLE key_results ADD COLUMN IF NOT EXISTS period_from date;
ALTER TABLE key_results ADD COLUMN IF NOT EXISTS period_to date;
