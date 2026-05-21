
// POST /call-ai?action=<process-transcript|generate-summary|distribute>
// Port of supabase/functions/call-ai. Requires Firebase auth.
module.exports = function(app, { requireAuth, pool }) {
  app.post('/call-ai', requireAuth, async (req, res) => {
    try {
      const fbSub = req.firebase?.sub;
      let userId = null;
      if (fbSub) {
        const { rows } = await pool.query(`SELECT id FROM profiles WHERE firebase_uid = $1 LIMIT 1`, [fbSub]);
        if (rows[0]) userId = rows[0].id;
      }
      if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

      const action = req.query.action;
      const body = req.body || {};
      let result = {};

      switch (action) {
        case 'process-transcript': {
          const { call_id, recording_id } = body;
          if (!call_id) throw new Error('call_id is required');

          const { rows: callRows } = await pool.query(
            `SELECT org_id FROM calls WHERE id = $1 LIMIT 1`, [call_id]);
          if (!callRows[0]) throw new Error('Call not found');

          const { rows: tRows } = await pool.query(
            `INSERT INTO call_transcripts (call_id, recording_id, org_id, status, language, model_used)
             VALUES ($1, $2, $3, 'processing', 'en', 'whisper-large-v3') RETURNING id`,
            [call_id, recording_id || null, callRows[0].org_id]);

          await pool.query(
            `UPDATE call_transcripts SET status = 'processing', content = '[]'::jsonb, content_text = '' WHERE id = $1`,
            [tRows[0].id]);

          result = {
            transcript_id: tRows[0].id,
            status: 'processing',
            message: 'Transcript processing initiated. It will be available shortly.',
          };
          break;
        }

        case 'generate-summary': {
          const { call_id, transcript_id } = body;
          if (!call_id) throw new Error('call_id is required');

          const { rows: callRows } = await pool.query(
            `SELECT org_id, title, duration_seconds FROM calls WHERE id = $1 LIMIT 1`, [call_id]);
          if (!callRows[0]) throw new Error('Call not found');

          const { rows: sRows } = await pool.query(
            `INSERT INTO call_summaries (call_id, transcript_id, org_id, status, model_used, prompt_version)
             VALUES ($1, $2, $3, 'processing', 'claude-sonnet-4-20250514', 'v1') RETURNING id`,
            [call_id, transcript_id || null, callRows[0].org_id]);

          result = {
            summary_id: sRows[0].id,
            status: 'processing',
            message: 'AI summary generation initiated.',
          };
          break;
        }

        case 'distribute': {
          const { call_id, summary_id, transcript_id: distTranscriptId, targets } = body;
          if (!call_id || !targets?.length) throw new Error('call_id and targets are required');

          const { rows: callRows } = await pool.query(
            `SELECT org_id, title FROM calls WHERE id = $1 LIMIT 1`, [call_id]);
          if (!callRows[0]) throw new Error('Call not found');
          const orgId = callRows[0].org_id;
          const callTitle = callRows[0].title;

          let summaryContent = null;
          if (summary_id) {
            const { rows: sRows } = await pool.query(
              `SELECT * FROM call_summaries WHERE id = $1 LIMIT 1`, [summary_id]);
            summaryContent = sRows[0] || null;
          }

          const distributions = [];

          for (const target of targets) {
            const dist = {
              org_id: orgId, call_id, summary_id: summary_id || null,
              transcript_id: distTranscriptId || null, target_type: target.type,
              content_type: target.content_type || 'summary',
              distributed_by: userId, status: 'pending',
              target_email: null, target_id: null, sent_at: null,
            };

            switch (target.type) {
              case 'email': {
                dist.target_email = target.email;
                dist.status = 'sent';
                dist.sent_at = new Date().toISOString();
                break;
              }
              case 'channel': {
                dist.target_id = target.id;
                if (summaryContent) {
                  const keyPoints = Array.isArray(summaryContent.key_points) ? summaryContent.key_points : [];
                  const actionItems = Array.isArray(summaryContent.action_items) ? summaryContent.action_items : [];
                  const messageContent = [
                    `\u{1F4DD} **Meeting Summary: ${callTitle || 'Call'}**`,
                    '',
                    summaryContent.summary || '',
                    '',
                    keyPoints.length ? '**Key Points:**' : '',
                    ...keyPoints.map(kp => `\u2022 ${kp.text}`),
                    '',
                    actionItems.length ? '**Action Items:**' : '',
                    ...actionItems.map(ai => `\u2610 ${ai.text}${ai.assignee_name ? ` (@${ai.assignee_name})` : ''}`),
                  ].filter(Boolean).join('\n');

                  await pool.query(
                    `INSERT INTO messages (channel_id, author_id, content, content_format, is_system, metadata)
                     VALUES ($1, $2, $3, 'markdown', false, $4)`,
                    [target.id, userId, messageContent, JSON.stringify({ type: 'call_summary', call_id, summary_id })]);
                }
                dist.status = 'sent';
                dist.sent_at = new Date().toISOString();
                break;
              }
              case 'project': {
                dist.target_id = target.id;
                if (summaryContent?.action_items && Array.isArray(summaryContent.action_items)) {
                  for (const item of summaryContent.action_items) {
                    await pool.query(
                      `INSERT INTO tasks (org_id, project_id, title, description, assignee_id, due_date, status, priority, created_by, metadata)
                       VALUES ($1, $2, $3, $4, $5, $6, 'todo', 'medium', $7, $8)`,
                      [orgId, target.id, item.text,
                       `Auto-generated from meeting: ${callTitle || 'Call'}`,
                       item.assignee_id || null, item.due_date || null, userId,
                       JSON.stringify({ source: 'call_summary', call_id, summary_id })]);
                  }
                }
                dist.status = 'sent';
                dist.sent_at = new Date().toISOString();
                break;
              }
              case 'document': {
                const docContent = {
                  type: 'meeting_notes', call_id,
                  summary: summaryContent?.summary, key_points: summaryContent?.key_points,
                  action_items: summaryContent?.action_items, decisions: summaryContent?.decisions,
                  follow_ups: summaryContent?.follow_ups, topics: summaryContent?.topics,
                };
                const { rows: dRows } = await pool.query(
                  `INSERT INTO documents (org_id, title, content, content_text, status, visibility, emoji, project_id, created_by, metadata)
                   VALUES ($1, $2, $3, $4, 'published', 'team', $5, $6, $7, $8) RETURNING id`,
                  [orgId, `Meeting Notes: ${callTitle || 'Call'} - ${new Date().toLocaleDateString()}`,
                   JSON.stringify(docContent), summaryContent?.summary || '',
                   '\u{1F4DD}', target.project_id || null, userId,
                   JSON.stringify({ source: 'call_summary', call_id, summary_id })]);
                dist.target_id = dRows[0]?.id;
                dist.status = 'sent';
                dist.sent_at = new Date().toISOString();
                break;
              }
              case 'task':
              case 'objective': {
                dist.target_id = target.id;
                if (summaryContent) {
                  await pool.query(
                    `INSERT INTO comments (org_id, entity_type, entity_id, author_id, content, metadata)
                     VALUES ($1, $2, $3, $4, $5, $6)`,
                    [orgId, target.type, target.id, userId,
                     `\u{1F4DD} **Meeting Summary (${callTitle || 'Call'}):**\n\n${summaryContent.summary || ''}`,
                     JSON.stringify({ source: 'call_summary', call_id, summary_id })]);
                }
                dist.status = 'sent';
                dist.sent_at = new Date().toISOString();
                break;
              }
            }
            distributions.push(dist);
          }

          // Insert all distribution records in one query
          if (distributions.length > 0) {
            const values = [];
            const params = [];
            let pi = 1;
            for (const d of distributions) {
              values.push(`($${pi++}, $${pi++}, $${pi++}, $${pi++}, $${pi++}, $${pi++}, $${pi++}, $${pi++}, $${pi++}, $${pi++}, $${pi++})`);
              params.push(d.org_id, d.call_id, d.summary_id, d.transcript_id,
                          d.target_type, d.content_type, d.target_email,
                          d.target_id, d.distributed_by, d.status, d.sent_at);
            }
            const { rows: dists } = await pool.query(
              `INSERT INTO call_distributions
                (org_id, call_id, summary_id, transcript_id, target_type, content_type, target_email, target_id, distributed_by, status, sent_at)
               VALUES ${values.join(', ')} RETURNING id, target_type, status`,
              params);
            result = {
              distributed_to: dists.length,
              distributions: dists.map(d => ({ id: d.id, target_type: d.target_type, status: d.status })),
            };
          }
          break;
        }
        default:
          throw new Error('Invalid action. Use ?action=process-transcript|generate-summary|distribute');
      }

      res.json({ success: true, ...result });
    } catch (err) {
      res.status(400).json({ success: false, error: err?.message || String(err) });
    }
  });
};
