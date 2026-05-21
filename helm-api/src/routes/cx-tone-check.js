
// POST /cx-tone-check — port of supabase/functions/cx-tone-check
// Pre-send AI review of CX draft replies. Returns severity/flags/summary as JSON.
const Anthropic = require('@anthropic-ai/sdk');
const MODEL = 'claude-sonnet-4-20250514';

module.exports = function(app, { pool }) {
  app.post('/cx-tone-check', async (req, res) => {
    try {
      const { ticket_id, draft_text } = req.body || {};
      if (!ticket_id || !draft_text) return res.status(400).json({ error: 'ticket_id and draft_text required' });

      const { rows: ticketRows } = await pool.query(
        `SELECT org_id, brand_id, subject, customer_name, customer_email,
                customer_ltv, customer_subscription_status, ai_sentiment
         FROM cx_tickets WHERE id = $1`,
        [ticket_id]
      );
      const ticket = ticketRows[0];
      if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

      const { rows: msgs } = await pool.query(
        `SELECT direction, sender_type, body_text, created_at
         FROM cx_messages WHERE ticket_id = $1
         ORDER BY created_at DESC LIMIT 5`,
        [ticket_id]
      );

      const conversation = msgs.reverse().map(m => {
        const who = m.sender_type === 'agent' ? 'AGENT' : m.sender_type === 'ai' ? 'AI' : 'CUSTOMER';
        return `[${who}] ${(m.body_text || '').slice(0, 600)}`;
      }).join('\n');

      // Per-brand AI config (function defined in original schema)
      const { rows: cfgRows } = await pool.query(
        `SELECT * FROM cx_get_ai_config($1, $2)`,
        [ticket.org_id, ticket.brand_id || null]
      );
      const aiCfg = cfgRows[0] || {};

      const systemPrompt = `You review draft customer-support replies BEFORE they are sent and flag tone / content risks.

Brand voice: ${aiCfg.brand_voice || 'warm, friendly, professional'}
Tone: ${aiCfg.tone || 'empathetic'}
Writing style: ${aiCfg.writing_style || 'conversational, concise'}
Emoji usage: ${aiCfg.emoji_usage || 'minimal'}
Response length: ${aiCfg.response_length || 'medium'}

Return ONLY a JSON object with this exact shape — no markdown fences, no preamble:
{
  "severity": "ok" | "warning" | "block_suggested",
  "flags": [
    {
      "type": "too_terse" | "too_long" | "off_voice" | "defensive" | "missing_answer" | "missed_question" | "policy_risk" | "typo" | "factual_concern" | "other",
      "detail": "one-sentence description, agent-facing, plain language"
    }
  ],
  "summary": "one short sentence the agent will read before deciding whether to send"
}

Severity rules:
- "ok" — no notable issues; reply is solid as written
- "warning" — worth a quick look but not catastrophic
- "block_suggested" — something is clearly wrong (factual error, defensive tone, missed core question, policy violation). The UI will hard-warn but still let the agent send.

Do NOT rewrite the draft. Only flag issues. Be sparing: a clean reply should return "ok" with empty flags.`;

      const userPrompt = `RECENT CONVERSATION:
${conversation || '(no prior messages)'}

CUSTOMER CONTEXT:
Name: ${ticket.customer_name || ticket.customer_email}
LTV: $${Number(ticket.customer_ltv || 0)}
Subscription: ${ticket.customer_subscription_status || 'none'}
Detected sentiment: ${ticket.ai_sentiment || 'unknown'}

AGENT'S DRAFT (under review):
${draft_text}

Return the JSON object now.`;

      const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
      if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

      const client = new Anthropic({ apiKey });
      const apiData = await client.messages.create({
        model: MODEL, max_tokens: 600, system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const rawText = apiData.content?.[0]?.text || '{}';
      const cleanText = rawText.replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '').trim();

      let parsed = {};
      try { parsed = JSON.parse(cleanText); }
      catch (_) { return res.status(500).json({ error: 'AI returned non-JSON', raw: cleanText.slice(0, 500) }); }

      res.json({
        severity: parsed.severity || 'ok',
        flags: Array.isArray(parsed.flags) ? parsed.flags : [],
        summary: parsed.summary || '',
        brand_id_used: aiCfg.brand_id || null,
        tokens_used: (apiData.usage?.input_tokens || 0) + (apiData.usage?.output_tokens || 0),
      });
    } catch (e) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });
};
