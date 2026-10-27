-- Multi-value key results with a measurement period.
-- measures: [{id, label, current_value, target_value, unit, op ('<','<=','=','>=','>'),
--             kind ('total','rate','latest'), auto_config?, auto_error?}]
-- measure_logic: 'all' | 'any'; measure_period: 'week' | 'month' | 'quarter' | 'kr';
-- period_eval: 'last_complete' | 'to_date'. current_value / target_value / unit /
-- target_direction keep mirroring the first value for the views that read them.
ALTER TABLE key_results ADD COLUMN IF NOT EXISTS measures jsonb;
ALTER TABLE key_results ADD COLUMN IF NOT EXISTS measure_logic text NOT NULL DEFAULT 'all';
ALTER TABLE key_results ADD COLUMN IF NOT EXISTS measure_period text NOT NULL DEFAULT 'kr';
ALTER TABLE key_results ADD COLUMN IF NOT EXISTS period_eval text NOT NULL DEFAULT 'to_date';

-- KRs that already use conditions (migration 029) move to measures.
UPDATE key_results kr
   SET measures = jsonb_build_array(jsonb_build_object(
         'id', 'm0', 'label', kr.title, 'current_value', kr.current_value, 'target_value', kr.target_value,
         'unit', coalesce(kr.unit, ''), 'op', CASE WHEN kr.target_direction = 'below' THEN '<=' ELSE '>=' END,
         'kind', 'total', 'auto_config', kr.auto_config))
       || coalesce((SELECT jsonb_agg(jsonb_build_object(
             'id', c->>'id', 'label', c->>'label', 'current_value', c->'current_value', 'target_value', c->'target_value',
             'unit', coalesce(c->>'unit', ''), 'op', CASE WHEN c->>'target_direction' = 'below' THEN '<=' ELSE '>=' END,
             'kind', 'rate', 'auto_config', c->'auto_config'))
           FROM jsonb_array_elements(kr.conditions) c), '[]'::jsonb),
       auto_config = NULL
 WHERE kr.measures IS NULL AND jsonb_typeof(kr.conditions) = 'array' AND jsonb_array_length(kr.conditions) > 0;
