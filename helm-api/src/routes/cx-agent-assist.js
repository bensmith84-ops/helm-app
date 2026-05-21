
// POST /cx-agent-assist — port of supabase/functions/cx-agent-assist
// Per-ticket AI assistant: thread summary + suggested reply + macro match + VIP score,
// cached in cx_agent_assist keyed on (ticket_id, message_count_at_generation).
const Anthropic = require('@anthropic-ai/sdk');
const MODEL = 'claude-sonnet-4-20250514';

module.exports = function(app, { pool }) {
  app.post('/cx-agent-assist', async (req, res) => {
    try {
      const { ticket_id, force_refresh } = req.body || {};
      if (!ticket_id) return res.status(400).json({ error: 'ticket_id required' });

      const { rows: tRows } = await pool.query(
        `SELECT * FROM cx_tickets WHERE id = $1 LIMIT 1`, [ticket_id]
      );
      const ticket = tRows[0];
      if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

      const { rows: messages } = await pool.query(
        `SELECT direction, sender_type, sender_name, body_text, created_at
         FROM cx_messages WHERE ticket_id = $1 ORDER BY created_at ASC`,
        [ticket_id]
      );
      const messageCount = messages.length;

      // Cache check
      if (!force_refresh) {
        const { rows: cached } = await pool.query(
          `SELECT * FROM cx_agent_assist
           WHERE ticket_id = $1 AND message_count_at_generation = $2
           ORDER BY generated_at DESC LIMIT 1`,
          [ticket_id, messageCount]
        );
        if (cached[0]) return res.json({ cached: true, ...cached[0] });
      }

      // VIP scoring
      let vipScore = 0;
      const vipReasons = [];
      const ltv = Number(ticket.customer_ltv || 0);
      if (ltv >= 500) { vipScore += 40; vipReasons.push('high_ltv'); }
      else if (ltv >= 200) { vipScore += 20; vipReasons.push('mid_ltv'); }
      if (ticket.customer_subscription_status === 'active') { vipScore += 20; vipReasons.push('subscription_active'); }
      if ((ticket.customer_tags || []).includes?.('vip')) { vipScore += 30; vipReasons.push('vip_tag'); }
      if (ticket.ai_sentiment === 'negative') { vipScore += 15; vipReasons.push('negative_sentiment'); }
      if (ticket.sla_breached) { vipScore += 20; vipReasons.push('sla_breached'); }
      vipScore = Math.min(vipScore, 100);

      // Shopify order match via RPC
      let topShopifyOrder = null;
      try {
        const { rows: shopifyRows } = await pool.query(
          `SELECT * FROM cx_find_shopify_orders_for_ticket($1, $2)`,
          [ticket_id, 3]
        );
        topShopifyOrder = shopifyRows[0] || null;
      } catch (_) { /* RPC may not exist, fall through */ }

      const recentMsgs = messages.slice(-20);
      const conversation = recentMsgs.map(m => {
        const who = m.sender_type === 'agent' ? 'AGENT' : m.sender_type === 'ai' ? 'AI' : 'CUSTOMER';
        const ts = m.created_at instanceof Date ? m.created_at.toISOString() : m.created_at;
        return `[${who} ${String(ts).slice(0, 16).replace('T', ' ')}] ${m.body_text || ''}`;
      }).join('\n');

      const { rows: aiCfgRows } = await pool.query(
        `SELECT * FROM cx_get_ai_config($1, $2)`,
        [ticket.org_id, ticket.brand_id || null]
      );
      const aiCfg = aiCfgRows[0] || {};

      const { rows: macros } = await pool.query(
        `SELECT id, name, category, content FROM cx_macros
         WHERE org_id = $1 AND is_active = true LIMIT 30`,
        [ticket.org_id]
      );
      const macroIndex = macros.map(m => `- "${m.name}" (${m.category || 'general'})`).join('\n');

      const shopifyBlock = topShopifyOrder ? `\nSHOPIFY ORDER (best match, confidence: ${topShopifyOrder.out_confidence}):
- Order: ${topShopifyOrder.out_order_number}
- Total: ${topShopifyOrder.out_total_price} ${topShopifyOrder.out_currency || 'USD'}
- Placed: ${topShopifyOrder.out_created_at ? new Date(topShopifyOrder.out_created_at).toISOString().slice(0, 10) : '?'}
- Fulfillment: ${topShopifyOrder.out_fulfillment_status || 'not fulfilled'}
- Financial status: ${topShopifyOrder.out_financial_status || 'unknown'}${topShopifyOrder.out_cancelled_at ? '\n- ALREADY CANCELLED on ' + topShopifyOrder.out_cancelled_at : ''}
Reference this order by its order number in your suggested_reply when relevant.` : '';

      const systemPrompt = `You are an agent-assist tool for a customer support team. You analyze a ticket conversation and produce structured help for the human agent who is about to reply.

Brand voice: ${aiCfg.brand_voice || 'warm, friendly, professional'}
Tone: ${aiCfg.tone || 'empathetic'}
Writing style: ${aiCfg.writing_style || 'conversational, concise'}
Emoji usage: ${aiCfg.emoji_usage || 'minimal'}
Response length: ${aiCfg.response_length || 'medium'}
Sign-off: ${aiCfg.sign_off || ''}

Return ONLY a JSON object with exactly these keys. No markdown fences, no preamble.
{
  "thread_summary": "2-3 sentence summary of what the customer needs and where the conversation stands",
  "suggested_reply": "a draft reply in the brand voice the agent could send (or edit). Stay in voice. If the conversation is resolved, say so and propose a closing message.",
  "suggested_macro_name": "the EXACT name of the macro from the list below that best fits, or null if no good match",
  "tone_flags": ["list of any tone risks like 'customer_frustrated', 'multiple_unanswered_questions', 'previous_response_too_terse'; empty array if none"],
  "customer_intent": "primary intent: refund | exchange | tracking_inquiry | product_question | complaint | praise | cancel_subscription | other"
}`;

      const userPrompt = `TICKET
Subject: ${ticket.subject || '(no subject)'}
Channel: ${ticket.channel}
Priority: ${ticket.priority}
Status: ${ticket.status}
Customer: ${ticket.customer_name || ticket.customer_email}
Customer LTV: $${ltv}
Subscription status: ${ticket.customer_subscription_status || 'none'}
${shopifyBlock}

CONVERSATION (last ${recentMsgs.length} of ${messageCount}):
${conversation}

AVAILABLE MACROS:
${macroIndex || '(none configured)'}

Return the JSON object now.`;

      const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
      if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

      const client = new Anthropic({ apiKey });
      const apiData = await client.messages.create({
        model: MODEL, max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const rawText = apiData.content?.[0]?.text || '{}';
      const cleanText = rawText.replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '').trim();

      let parsed = {};
      try { parsed = JSON.parse(cleanText); } catch {
        return res.status(500).json({ error: 'AI returned non-JSON', raw: cleanText.slice(0, 500) });
      }

      let suggestedMacroId = null;
      if (parsed.suggested_macro_name && macros.length) {
        const match = macros.find(m => m.name === parsed.suggested_macro_name);
        if (match) suggestedMacroId = match.id;
      }

      const toneFlags = Array.isArray(parsed.tone_flags) ? parsed.tone_flags : [];
      const tokensUsed = (apiData.usage?.input_tokens || 0) + (apiData.usage?.output_tokens || 0);

      const { rows: inserted } = await pool.query(
        `INSERT INTO cx_agent_assist
          (org_id, ticket_id, message_count_at_generation, thread_summary, suggested_reply,
           suggested_macro_id, tone_flags, vip_score, vip_reasons, generated_by_model,
           tokens_used, generated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
         ON CONFLICT (ticket_id, message_count_at_generation) DO UPDATE
         SET thread_summary = EXCLUDED.thread_summary,
             suggested_reply = EXCLUDED.suggested_reply,
             suggested_macro_id = EXCLUDED.suggested_macro_id,
             tone_flags = EXCLUDED.tone_flags,
             vip_score = EXCLUDED.vip_score,
             vip_reasons = EXCLUDED.vip_reasons,
             tokens_used = EXCLUDED.tokens_used,
             generated_at = NOW()
         RETURNING *`,
        [ticket.org_id, ticket_id, messageCount,
         parsed.thread_summary || null, parsed.suggested_reply || null,
         suggestedMacroId, toneFlags, vipScore, vipReasons,
         MODEL, tokensUsed]
      );

      res.json({
        cached: false,
        customer_intent: parsed.customer_intent,
        brand_id_used: aiCfg.brand_id || null,
        shopify_top_match: topShopifyOrder,
        ...(inserted[0] || {}),
      });
    } catch (e) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });
};
