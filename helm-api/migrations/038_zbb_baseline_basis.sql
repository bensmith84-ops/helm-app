-- Zero-based budget: vendor baseline basis. baseline_ttm = the line's spend over the
-- whole baseline window; baseline_month = its spend in the chosen month. baseline (used
-- everywhere) is one of them per the plan's settings.baseline_basis
-- ({ type: 'month', month: 'YYYY-MM' } = month x 12, or { type: 'ttm' }).
ALTER TABLE zbb_lines ADD COLUMN IF NOT EXISTS baseline_ttm numeric;
ALTER TABLE zbb_lines ADD COLUMN IF NOT EXISTS baseline_month numeric;
UPDATE zbb_lines SET baseline_ttm = baseline WHERE baseline_ttm IS NULL AND source = 'qbo';
