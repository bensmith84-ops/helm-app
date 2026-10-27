-- Multi-condition key results, e.g. "$X spend at $Y CPA": the KR's own
-- current/target is the main measure; conditions holds the others, each
-- {id, label, current_value, target_value, unit, target_direction, auto_config?, auto_error?}.
-- The KR is on track only when every measure is, so progress = the lowest.
ALTER TABLE key_results ADD COLUMN IF NOT EXISTS conditions jsonb;
