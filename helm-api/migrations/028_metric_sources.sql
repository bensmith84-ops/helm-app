-- Scorecard metrics and key results can be calculated from any Metabase
-- saved question, model or warehouse table (not only the fixed Scoreboard keys).
--
-- scorecard_metrics.source_config: the Metabase source, set when auto_source is
-- 'metabase'. auto_agg keeps the weekly roll-up (sum / average / last).
-- key_results.auto_config: how the KR's current value is calculated over the KR
-- window: {kind: 'scorecard' | 'scoreboard' | 'metabase', ..., window_agg}.
ALTER TABLE scorecard_metrics ADD COLUMN IF NOT EXISTS source_config jsonb;
ALTER TABLE scorecard_metrics ADD COLUMN IF NOT EXISTS auto_error text;
ALTER TABLE scorecard_metrics ADD COLUMN IF NOT EXISTS auto_synced_at timestamptz;
ALTER TABLE key_results ADD COLUMN IF NOT EXISTS auto_config jsonb;
ALTER TABLE key_results ADD COLUMN IF NOT EXISTS auto_error text;
ALTER TABLE key_results ADD COLUMN IF NOT EXISTS auto_synced_at timestamptz;
