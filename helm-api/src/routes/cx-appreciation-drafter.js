
// POST /cx-appreciation-drafter — port of supabase/functions/cx-appreciation-drafter
// Picks high-LTV customers, deterministically scores them, drafts thank-you emails via AI.
const Anthropic = require('@anthropic-ai/sdk');
const MODEL = 'claude-sonnet-4-20250514';

module.exports = function(app, { pool }) {
  app.post('/cx-appreciation-drafter', async (req, res) => {
    try {
      const { org_id, brand_id = null, force = false } = req.body || {};
      if (!org_id) return res.status(400).json({ error: 'org_id required' });

      const { rows: cfgRows } = await pool.query(
        `SELECT * FROM cx_appreciation_config WHERE org_id = $1 LIMIT 1`, [org_id]);
      const cfg = cfgRows[0];
      if (!cfg) return res.status(400).json({ error: 'No config for this org' });
      if (!cfg.is_enabled && !force) {
        return res.json({ success: true, skipped: true, reason: 'disabled', picked: 0, drafted: 0 });
      }

      const { rows: aiCfgRows } = await pool.query(
        `SELECT * FROM cx_get_ai_config($1, $2)`, [org_id, brand_id]);
      const aiCfg = aiCfgRows[0] || {};

      const now = Date.now();
      const outreachCutoff = new Date(now - cfg.min_days_since_outreach * 86400000).toISOString();
      const ticketCutoff = new Date(now - cfg.min_days_since_ticket * 86400000).toISOString();

      const { rows: candidates } = await pool.query(
        `SELECT id, email, name, lifetime_value, avg_csat, subscription_status,
                order_count, first_contact_at, last_contact_at, last_outreach_at, created_at
         FROM cx_contacts
         WHERE org_id = $1 AND lifetime_value >= $2
           AND (last_outreach_at IS NULL OR last_outreach_at < $3)
           AND (last_contact_at IS NULL OR last_contact_at < $4)
         ORDER BY lifetime_value DESC LIMIT 50`,
        [org_id, cfg.min_ltv, outreachCutoff, ticketCutoff]);

      const eligible = candidates.filter(c => c.avg_csat == null || Number(c.avg_csat) >= Number(cfg.min_csat));
      if (eligible.length === 0) return res.json({ success: true, picked: 0, drafted: 0, reason: 'no eligible candidates' });

      const scored = eligible.map(c => {
        let score = 0, reasonCode = 'generic_thanks', reasonDetail = '';
        const ltv = Number(c.lifetime_value || 0);
        const tenureDays = c.first_contact_at ? Math.floor((now - new Date(c.first_contact_at).getTime()) / 86400000) : 0;
        const csat = Number(c.avg_csat || 0);
        const orders = Number(c.order_count || 0);
        score += Math.min(ltv / 100, 50);
        score += Math.min(tenureDays / 30, 24);
        score += orders >= 5 ? 15 : orders * 2;
        score += csat >= 4.5 ? 10 : 0;
        if (c.subscription_status === 'active' && tenureDays >= 330 && tenureDays <= 395) {
          reasonCode = 'subscription_anniversary';
          reasonDetail = `Subscription anniversary (${Math.round(tenureDays / 30)} months as a subscriber).`;
          score += 20;
        } else if (csat >= 4.5 && c.last_contact_at) {
          reasonCode = 'recent_5_star_csat';
          reasonDetail = `Recent CSAT ${csat.toFixed(1)} of 5.`;
        } else if (orders >= 5) {
          reasonCode = 'loyal_repeat_buyer';
          reasonDetail = `${orders} orders to date, LTV $${ltv.toFixed(0)}.`;
        } else if (ltv >= 500 && tenureDays >= 365) {
          reasonCode = 'high_ltv_long_tenure';
          reasonDetail = `LTV $${ltv.toFixed(0)} over ${Math.round(tenureDays / 30)} months.`;
        } else {
          reasonDetail = `LTV $${ltv.toFixed(0)}, ${orders} orders.`;
        }
        return { ...c, _score: score, _reasonCode: reasonCode, _reasonDetail: reasonDetail };
      });

      scored.sort((a, b) => b._score - a._score);
      const picks = scored.slice(0, cfg.drafts_per_run);
      const pickIds = picks.map(p => p.id);

      const { rows: existing } = await pool.query(
        `SELECT contact_id FROM cx_appreciation_drafts
         WHERE org_id = $1 AND contact_id = ANY($2::uuid[]) AND status IN ('queued', 'approved')`,
        [org_id, pickIds]);
      const existingSet = new Set(existing.map(d => d.contact_id));
      const freshPicks = picks.filter(p => !existingSet.has(p.id));
      if (freshPicks.length === 0) return res.json({ success: true, picked: picks.length, drafted: 0, reason: 'all picks already have pending drafts' });

      const customerBlocks = freshPicks.map((p, i) => `Customer ${i + 1}:
  Name: ${p.name || p.email.split('@')[0]}
  Email: ${p.email}
  Reason to reach out: ${p._reasonCode} — ${p._reasonDetail}
  Order count: ${p.order_count || 0}
  Subscription: ${p.subscription_status || 'none'}`).join('\n\n');

      const systemPrompt = `You draft short, sincere appreciation emails from a customer support team to high-value customers. The goal is brand goodwill — no upsell, no asks. Just a thank-you with one specific personal touch tied to the "reason to reach out".

Brand voice: ${aiCfg.brand_voice || 'warm, friendly, professional'}
Tone: ${aiCfg.tone || 'empathetic'}
Writing style: ${aiCfg.writing_style || 'conversational, concise'}
Emoji usage: ${aiCfg.emoji_usage || 'minimal'}
Sign-off: ${aiCfg.sign_off || '— The team'}

${cfg.custom_prompt ? `Team override: ${cfg.custom_prompt}\n` : ''}
Return ONLY a JSON object with this exact shape — no markdown fences:
{
  "drafts": [
    { "customer_index": <integer matching the Customer N above>, "subject": "<short, warm, NOT clickbait>", "body": "<3-5 sentence email body, addressed by first name when known. End with the sign-off.>" }
  ]
}

Rules:
- Never promise discounts, gifts, or anything specific the agent hasn't reviewed.
- Never reference anything you don't know (specific order details, product names, locations).
- Keep body under 80 words.
- Use the reason_code to anchor one sentence of personalization. Don't quote the code itself.`;

      const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
      if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

      const client = new Anthropic({ apiKey });
      const apiData = await client.messages.create({
        model: MODEL, max_tokens: 2500, system: systemPrompt,
        messages: [{ role: 'user', content: `${customerBlocks}\n\nDraft an appreciation email for each customer above. Return the JSON object now.` }],
      });

      const rawText = apiData.content?.[0]?.text || '{}';
      const cleanText = rawText.replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '').trim();
      let parsed = {};
      try { parsed = JSON.parse(cleanText); }
      catch (_) { return res.status(500).json({ error: 'AI returned non-JSON', raw: cleanText.slice(0, 500) }); }

      const drafts = Array.isArray(parsed.drafts) ? parsed.drafts : [];
      let drafted = 0;
      for (const d of drafts) {
        const idx = Number(d.customer_index) - 1;
        const c = freshPicks[idx];
        if (!c) continue;
        try {
          await pool.query(
            `INSERT INTO cx_appreciation_drafts (org_id, contact_id, customer_email, customer_name, reason_code, reason_detail, subject, body_text, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'queued')`,
            [org_id, c.id, c.email, c.name || null, c._reasonCode, c._reasonDetail,
             String(d.subject || 'Thanks for being a customer').slice(0, 200),
             String(d.body || '').slice(0, 4000)]);
          drafted++;
        } catch (_) {}
      }

      res.json({
        success: true, picked: picks.length, drafted,
        brand_id_used: aiCfg.brand_id || null,
        tokens_used: (apiData.usage?.input_tokens || 0) + (apiData.usage?.output_tokens || 0),
      });
    } catch (e) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });
};
