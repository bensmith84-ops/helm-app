
// POST /cx-moderate — port of supabase/functions/cx-moderate
// 2 actions: moderate (keyword rules + AI risk classification + mention update),
// generate_reply (AI reply to social mention).
const Anthropic = require('@anthropic-ai/sdk');

module.exports = function(app, { pool }) {
  app.post('/cx-moderate', async (req, res) => {
    try {
      const body = req.body || {};
      const { action, org_id, mention_id, content, platform, author_handle } = body;
      if (!org_id) return res.json({ error: 'no org_id' });

      // Load AI config
      let aiConf = null;
      try {
        const { rows } = await pool.query(
          `SELECT * FROM cx_ai_config WHERE org_id = $1 LIMIT 1`,
          [org_id]
        );
        aiConf = rows[0] || null;
      } catch (e) { return res.json({ error: 'aiConf load: ' + e.message }); }

      const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();

      if (action === 'moderate') {
        const t0 = Date.now();

        // 1. Keyword rules
        let keywordAction = null;
        let matchedRule = null;
        try {
          const { rows: rules } = await pool.query(
            `SELECT * FROM cx_moderation_rules
             WHERE org_id = $1 AND is_active = true ORDER BY priority DESC`,
            [org_id]
          );
          const lc = (content || '').toLowerCase();
          for (const rule of rules) {
            const hit = (rule.keywords || []).some(kw => lc.includes(kw.toLowerCase()));
            if (hit) { keywordAction = rule.action; matchedRule = rule; break; }
          }
        } catch (e) { return res.json({ error: 'keyword rules: ' + e.message }); }

        // 2. AI classify
        let ai = {
          overall_risk: 'safe', sentiment: 'neutral', intent: 'general',
          risk_categories: [], is_spam: false, is_offensive: false, is_harmful: false,
          is_question: false, is_purchase_intent: false, confidence: 0.5,
          suggested_action: 'none', suggested_reply: null,
        };

        if (apiKey && content) {
          try {
            const prompt = `Classify this ${platform || 'social'} comment. Return ONLY JSON.\nComment: "${(content || '').replace(/"/g, "'").substring(0, 400)}"\nJSON: {"overall_risk":"safe|low|medium|high|critical","sentiment":"positive|neutral|negative|mixed","intent":"question|complaint|praise|spam|general|purchase_intent","risk_categories":[],"is_spam":false,"is_offensive":false,"is_harmful":false,"is_question":false,"is_purchase_intent":false,"confidence":0.9,"suggested_action":"none|flag|hide|reply|escalate","suggested_reply":"brief reply or null"}`;
            const client = new Anthropic({ apiKey });
            const data = await client.messages.create({
              model: 'claude-sonnet-4-20250514', max_tokens: 350,
              messages: [{ role: 'user', content: prompt }],
            });
            const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
            let parsed = null;
            try { parsed = JSON.parse(text); } catch {
              const c = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
              try { parsed = JSON.parse(c); } catch {
                const m = text.match(/\{[\s\S]*\}/);
                if (m) try { parsed = JSON.parse(m[0]); } catch {}
              }
            }
            if (parsed?.overall_risk) ai = { ...ai, ...parsed };
          } catch (e) { return res.json({ error: 'AI classify: ' + e.message }); }
        }

        const finalAction = keywordAction || ai.suggested_action || 'none';

        // 3. Log
        try {
          await pool.query(
            `INSERT INTO cx_moderation_log (org_id, mention_id, content, platform, author_handle,
              risk_categories, overall_risk, sentiment, intent,
              is_spam, is_offensive, is_harmful, is_question, is_purchase_intent,
              action_taken, rule_id, confidence, processing_time_ms, model)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
            [org_id, mention_id || null, (content || '').substring(0, 500),
             platform || null, author_handle || null,
             ai.risk_categories || [], ai.overall_risk || 'safe',
             ai.sentiment || null, ai.intent || null,
             !!ai.is_spam, !!ai.is_offensive, !!ai.is_harmful,
             !!ai.is_question, !!ai.is_purchase_intent,
             finalAction, matchedRule?.id || null,
             Number(ai.confidence) || 0, Date.now() - t0, 'claude-sonnet-4-20250514']
          );
        } catch (_) { /* ignore log errors */ }

        // 4. Update mention
        if (mention_id) {
          try {
            const sets = ['moderation_status = $2', 'moderation_risk = $3', 'moderation_categories = $4', 'sentiment = $5', 'intent = $6'];
            const params = [mention_id, 'reviewed', ai.overall_risk, ai.risk_categories, ai.sentiment, ai.intent];
            let pi = 7;
            if (finalAction === 'hide' || ai.is_spam) {
              sets.push(`is_hidden = $${pi++}`); params.push(true);
              sets.push(`status = $${pi++}`); params.push('ignored');
            } else if (finalAction === 'escalate') {
              sets.push(`status = $${pi++}`); params.push('escalated');
            } else if (finalAction === 'flag') {
              sets[0] = 'moderation_status = $2'; params[1] = 'flagged';
            }
            if (ai.suggested_reply) {
              sets.push(`ai_reply_draft = $${pi++}`);
              params.push(String(ai.suggested_reply));
            }
            await pool.query(
              `UPDATE cx_social_mentions SET ${sets.join(', ')} WHERE id = $1`,
              params
            );
          } catch (_) { /* ignore */ }
        }

        return res.json({
          action: finalAction, risk: ai.overall_risk, sentiment: ai.sentiment,
          intent: ai.intent, categories: ai.risk_categories,
          suggested_reply: ai.suggested_reply,
          matched_rule: matchedRule?.name || null, confidence: ai.confidence,
          processing_time_ms: Date.now() - t0,
        });
      }

      if (action === 'generate_reply') {
        if (!aiConf) return res.json({ reply: 'No AI config' });
        try {
          const { rows: kb } = await pool.query(
            `SELECT title, content FROM cx_kb_articles
             WHERE org_id = $1 AND status = 'published' LIMIT 5`,
            [org_id]
          );
          const kbCtx = (kb || []).map(a => a.title + ': ' + (a.content || '').substring(0, 100)).join('\n');
          const prompt = `You are ${aiConf.agent_name || 'Breeze'} for Earth Breeze. ${(aiConf.brand_voice || '').substring(0, 300)}\nTone: ${aiConf.tone || 'friendly'}. Emoji: ${aiConf.emoji_usage || 'occasional'}.\nKB: ${kbCtx}\nReply to this ${platform || 'social'} comment (1-3 sentences):\n"${(content || '').replace(/"/g, "'").substring(0, 250)}"\nWrite ONLY the reply.`;

          const client = new Anthropic({ apiKey });
          const data = await client.messages.create({
            model: 'claude-sonnet-4-20250514', max_tokens: 200,
            messages: [{ role: 'user', content: prompt }],
          });
          const reply = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
          if (mention_id) {
            try { await pool.query(`UPDATE cx_social_mentions SET ai_reply_draft = $1 WHERE id = $2`, [reply, mention_id]); } catch {}
          }
          return res.json({ reply });
        } catch (e) { return res.json({ error: 'generate_reply: ' + e.message }); }
      }

      return res.json({ error: 'unknown action: ' + action });
    } catch (e) {
      res.json({ error: e?.message || String(e) });
    }
  });
};
