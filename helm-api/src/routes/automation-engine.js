
// POST /automation-engine — port of supabase/functions/automation-engine
// Rule-based workflow engine. Evaluates conditions and executes actions
// (set_field, move_to_section, add_tag, remove_tag, add_comment, create_subtask,
// create_task, send_notification, post_message, set_due_date, mark_complete, call_webhook).
// Internal/system-fired — no user auth needed (rules already include org scoping).

module.exports = function(app, { pool }) {
  app.post('/automation-engine', async (req, res) => {
    try {
      const { org_id, trigger_type, entity_type, entity_id, entity_data, actor_id, project_id } = req.body || {};
      if (!org_id || !trigger_type) return res.status(400).json({ success: false, error: 'org_id and trigger_type are required' });

      let rulesQuery = `SELECT * FROM automation_rules
                        WHERE org_id = $1 AND trigger_type = $2 AND is_enabled = true`;
      const rulesParams = [org_id, trigger_type];
      if (project_id) {
        rulesQuery += ` AND (project_id = $3 OR project_id IS NULL)`;
        rulesParams.push(project_id);
      }
      const { rows: rules } = await pool.query(rulesQuery, rulesParams);

      if (rules.length === 0) {
        return res.json({ success: true, matched_rules: 0, message: 'No matching rules' });
      }

      const results = [];
      for (const rule of rules) {
        if (rule.run_limit && rule.run_count >= rule.run_limit) continue;

        if (rule.cooldown_minutes && entity_id) {
          const cutoff = new Date(Date.now() - rule.cooldown_minutes * 60000).toISOString();
          const { rows: recent } = await pool.query(
            `SELECT id FROM automation_runs
             WHERE rule_id = $1 AND trigger_entity_id = $2 AND started_at >= $3 LIMIT 1`,
            [rule.id, entity_id, cutoff]
          );
          if (recent.length > 0) continue;
        }

        // Conditions
        const conditions = rule.conditions || [];
        let conditionsMet = true;
        for (const cond of conditions) {
          const fieldValue = entity_data?.[cond.field];
          switch (cond.operator) {
            case 'equals': conditionsMet = fieldValue === cond.value; break;
            case 'not_equals': conditionsMet = fieldValue !== cond.value; break;
            case 'contains': conditionsMet = Array.isArray(fieldValue) ? fieldValue.includes(cond.value) : String(fieldValue).includes(cond.value); break;
            case 'is_set': conditionsMet = fieldValue != null && fieldValue !== ''; break;
            case 'is_not_set': conditionsMet = fieldValue == null || fieldValue === ''; break;
            case 'greater_than': conditionsMet = Number(fieldValue) > Number(cond.value); break;
            case 'less_than': conditionsMet = Number(fieldValue) < Number(cond.value); break;
            case 'in': conditionsMet = Array.isArray(cond.value) && cond.value.includes(fieldValue); break;
            case 'not_in': conditionsMet = Array.isArray(cond.value) && !cond.value.includes(fieldValue); break;
          }
          if (!conditionsMet) break;
        }
        if (!conditionsMet) continue;

        const { rows: runRows } = await pool.query(
          `INSERT INTO automation_runs (rule_id, org_id, trigger_entity_type, trigger_entity_id, trigger_data, status)
           VALUES ($1, $2, $3, $4, $5, 'running') RETURNING id, started_at`,
          [rule.id, org_id, entity_type, entity_id, JSON.stringify(entity_data || {})]
        );
        const run = runRows[0];

        const actionResults = [];
        let allSuccess = true;

        for (let i = 0; i < (rule.actions || []).length; i++) {
          const action = rule.actions[i];
          try {
            const resolve = (val) => {
              if (typeof val !== 'string') return val;
              return val
                .replace(/\{\{task\.([^}]+)\}\}/g, (_, key) => entity_data?.[key] ?? '')
                .replace(/\{\{actor\}\}/g, actor_id ?? '')
                .replace(/\{\{trigger_date\}\}/g, new Date().toISOString().split('T')[0]);
            };

            switch (action.type) {
              case 'set_field': {
                await pool.query(`UPDATE tasks SET ${action.field} = $1 WHERE id = $2`, [resolve(action.value), entity_id]);
                actionResults.push({ action_index: i, type: action.type, status: 'success' });
                break;
              }
              case 'move_to_section': {
                await pool.query(`UPDATE tasks SET section_id = $1 WHERE id = $2`, [resolve(action.section_id), entity_id]);
                actionResults.push({ action_index: i, type: action.type, status: 'success' });
                break;
              }
              case 'add_tag': {
                const { rows: tRows } = await pool.query(`SELECT tags FROM tasks WHERE id = $1`, [entity_id]);
                const tags = [...(tRows[0]?.tags || []), action.tag];
                await pool.query(`UPDATE tasks SET tags = $1 WHERE id = $2`, [Array.from(new Set(tags)), entity_id]);
                actionResults.push({ action_index: i, type: action.type, status: 'success' });
                break;
              }
              case 'remove_tag': {
                const { rows: tRows } = await pool.query(`SELECT tags FROM tasks WHERE id = $1`, [entity_id]);
                const tags = (tRows[0]?.tags || []).filter(t => t !== action.tag);
                await pool.query(`UPDATE tasks SET tags = $1 WHERE id = $2`, [tags, entity_id]);
                actionResults.push({ action_index: i, type: action.type, status: 'success' });
                break;
              }
              case 'add_comment': {
                await pool.query(
                  `INSERT INTO comments (org_id, entity_type, entity_id, author_id, content)
                   VALUES ($1, $2, $3, $4, $5)`,
                  [org_id, entity_type || 'task', entity_id, actor_id || rule.created_by, resolve(action.content)]
                );
                actionResults.push({ action_index: i, type: action.type, status: 'success' });
                break;
              }
              case 'create_subtask': {
                await pool.query(
                  `INSERT INTO tasks (org_id, project_id, parent_task_id, title, assignee_id, status, created_by)
                   VALUES ($1, $2, $3, $4, $5, 'todo', $6)`,
                  [org_id, entity_data?.project_id || project_id, entity_id, resolve(action.title),
                   action.assignee ? resolve(action.assignee) : null, rule.created_by]
                );
                actionResults.push({ action_index: i, type: action.type, status: 'success' });
                break;
              }
              case 'create_task': {
                await pool.query(
                  `INSERT INTO tasks (org_id, project_id, section_id, title, assignee_id, status, created_by)
                   VALUES ($1, $2, $3, $4, $5, 'todo', $6)`,
                  [org_id, action.project_id || entity_data?.project_id || project_id, action.section_id || null,
                   resolve(action.title), action.assignee ? resolve(action.assignee) : null, rule.created_by]
                );
                actionResults.push({ action_index: i, type: action.type, status: 'success' });
                break;
              }
              case 'send_notification': {
                const userIds = (action.user_ids || []).map(id => resolve(id)).filter(Boolean);
                for (const uid of userIds) {
                  await pool.query(
                    `INSERT INTO notifications (org_id, user_id, type, title, entity_type, entity_id, actor_id, category, metadata)
                     VALUES ($1, $2, 'automation_triggered', $3, $4, $5, $6, 'automation_triggered', $7)`,
                    [org_id, uid, resolve(action.message || 'Automation triggered'),
                     entity_type || 'task', entity_id, rule.created_by,
                     JSON.stringify({ rule_id: rule.id, rule_name: rule.name })]
                  );
                }
                actionResults.push({ action_index: i, type: action.type, status: 'success' });
                break;
              }
              case 'post_message': {
                if (action.channel_id) {
                  await pool.query(
                    `INSERT INTO messages (channel_id, author_id, content, content_format, is_system, metadata)
                     VALUES ($1, $2, $3, 'markdown', true, $4)`,
                    [resolve(action.channel_id), rule.created_by, resolve(action.content),
                     JSON.stringify({ automation_rule_id: rule.id })]
                  );
                }
                actionResults.push({ action_index: i, type: action.type, status: 'success' });
                break;
              }
              case 'set_due_date': {
                const baseDate = action.from === 'trigger_date' ? new Date() : new Date(entity_data?.due_date || Date.now());
                baseDate.setDate(baseDate.getDate() + (action.offset_days || 0));
                await pool.query(`UPDATE tasks SET due_date = $1 WHERE id = $2`,
                  [baseDate.toISOString().split('T')[0], entity_id]);
                actionResults.push({ action_index: i, type: action.type, status: 'success' });
                break;
              }
              case 'mark_complete': {
                await pool.query(
                  `UPDATE tasks SET status = 'done', completed_at = NOW() WHERE id = $1`,
                  [entity_id]
                );
                actionResults.push({ action_index: i, type: action.type, status: 'success' });
                break;
              }
              case 'call_webhook': {
                const resp = await fetch(action.url, {
                  method: action.method || 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ ...action.payload, entity_id, entity_data, rule_id: rule.id }),
                });
                actionResults.push({ action_index: i, type: action.type, status: resp.ok ? 'success' : 'failed', http_status: resp.status });
                if (!resp.ok) allSuccess = false;
                break;
              }
              default:
                actionResults.push({ action_index: i, type: action.type, status: 'skipped', error: 'Unknown action type' });
            }
          } catch (e) {
            allSuccess = false;
            actionResults.push({ action_index: i, type: action.type, status: 'failed', error: e?.message || String(e) });
          }
        }

        const completedAt = new Date();
        const durationMs = completedAt.getTime() - new Date(run.started_at).getTime();
        await pool.query(
          `UPDATE automation_runs SET status = $1, action_results = $2, completed_at = $3, duration_ms = $4 WHERE id = $5`,
          [allSuccess ? 'success' : 'partial', JSON.stringify(actionResults),
           completedAt.toISOString(), durationMs, run.id]
        );
        await pool.query(`UPDATE automation_rules SET run_count = run_count + 1 WHERE id = $1`, [rule.id]);

        results.push({ rule_id: rule.id, rule_name: rule.name, status: allSuccess ? 'success' : 'partial', actions: actionResults.length });
      }

      res.json({ success: true, matched_rules: results.length, results });
    } catch (err) {
      res.status(400).json({ success: false, error: err?.message || String(err) });
    }
  });
};
