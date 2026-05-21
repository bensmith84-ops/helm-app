
// POST /cx-ai-draft — port of supabase/functions/cx-ai-draft
// AI drafts a CX reply: per-brand AI config + KB articles + sample responses → Claude.
const Anthropic = require('@anthropic-ai/sdk');
const DEFAULT_ORG_ID = 'a0000000-0000-0000-0000-000000000001';

module.exports = function(app, { pool }) {
  app.post('/cx-ai-draft', async (req, res) => {
    try {
      const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
      if (!apiKey) return res.json({ error: 'ANTHROPIC_API_KEY not set' });

      const body = req.body || {};
      const orgId = body.org_id || DEFAULT_ORG_ID;
      let brandId = body.brand_id || null;

      let ticketSubject = '';
      let ticketChannel = 'email';
      let ticketCategory = 'general';
      let customerName = 'Customer';
      let conversationText = '';

      if (body.ticket_id) {
        const { rows: tRows } = await pool.query(
          `SELECT subject, channel, category, customer_name, brand_id FROM cx_tickets WHERE id = $1 LIMIT 1`,
          [body.ticket_id]
        );
        if (tRows[0]) {
          ticketSubject = tRows[0].subject || '';
          ticketChannel = tRows[0].channel || 'email';
          ticketCategory = tRows[0].category || 'general';
          customerName = tRows[0].customer_name || 'Customer';
          if (!brandId) brandId = tRows[0].brand_id || null;
        }
        const { rows: msgs } = await pool.query(
          `SELECT direction, sender_name, body_text FROM cx_messages WHERE ticket_id = $1 ORDER BY created_at`,
          [body.ticket_id]
        );
        if (msgs?.length) {
          conversationText = msgs.map(m => {
            const sender = m.direction === 'inbound' ? (m.sender_name || customerName) : 'Agent';
            return `[${sender}]: ${m.body_text}`;
          }).join('\n\n');
        }
      }

      // Direct overrides
      if (body.subject) ticketSubject = body.subject;
      if (body.category) ticketCategory = body.category;
      if (body.customer_name) customerName = body.customer_name;
      if (body.message && !conversationText) conversationText = `[${customerName}]: ${body.message}`;
      if (body.ticket?.subject) ticketSubject = body.ticket.subject;
      if (body.ticket?.channel) ticketChannel = body.ticket.channel;
      if (body.ticket?.category) ticketCategory = body.ticket.category;
      if (body.ticket?.customer_name) customerName = body.ticket.customer_name;
      if (body.messages && typeof body.messages === 'string') conversationText = body.messages;

      // Resolve AI config
      const { rows: cfgRows } = await pool.query(`SELECT * FROM cx_get_ai_config($1, $2)`, [orgId, brandId]);
      const ai = cfgRows[0] || {};

      // KB articles
      const { rows: kbAll } = await pool.query(
        `SELECT title, content, category FROM cx_kb_articles
         WHERE org_id = $1 AND status = 'published' LIMIT 20`,
        [orgId]
      );
      const kbArticles = (kbAll || []).sort((a, b) => {
        const aM = a.category === ticketCategory ? 0 : 1;
        const bM = b.category === ticketCategory ? 0 : 1;
        return aM - bM;
      }).slice(0, 10);

      let kbContext = '';
      if (kbArticles.length) {
        kbContext = '\n\nKNOWLEDGE BASE (use this to inform your response — cite specific details):\n' +
          kbArticles.map(a => `--- ${a.title} [${a.category}] ---\n${a.content}`).join('\n\n');
      }

      const samples = ai.sample_responses || [];
      let samplesContext = '';
      if (samples.length > 0) {
        samplesContext = '\n\nSAMPLE RESPONSES (match this voice and style):\n' +
          samples.map(s => `[${s.scenario}]: ${s.response}`).join('\n\n');
      }

      const agentName = ai.agent_name || 'Breeze';
      const brandVoice = ai.brand_voice || 'Friendly, eco-conscious DTC brand.';
      const tone = ai.tone || 'friendly';
      const writingStyle = ai.writing_style || 'conversational';
      const responseLength = ai.response_length || 'medium';
      const emojiUsage = ai.emoji_usage || 'occasional';
      const signOff = ai.sign_off || '';
      const greeting = ai.greeting_template || '';
      const traits = (ai.personality_traits || []).join(', ');
      const restricted = (ai.restricted_topics || []).join(', ');

      const lengthGuide = { short: '1-2 short paragraphs', medium: '2-3 paragraphs', detailed: '3-4 paragraphs with specifics' };
      const emojiGuide = { never: 'Do NOT use any emojis.', occasional: 'Use 1-2 emojis max, naturally placed.', frequent: 'Use emojis liberally to match a fun, energetic tone.' };

      const systemPrompt = `You are ${agentName}, a customer support agent for Earth Breeze.

YOUR PERSONALITY: ${traits}
BRAND VOICE: ${brandVoice}
TONE: ${tone}
WRITING STYLE: ${writingStyle}
RESPONSE LENGTH: ${lengthGuide[responseLength] || '2-3 paragraphs'}
EMOJI: ${emojiGuide[emojiUsage] || emojiGuide.occasional}
${signOff ? `SIGN OFF: End messages with: ${signOff}` : ''}
${greeting ? `GREETING STYLE: ${greeting}` : ''}

CRITICAL RULES:
1. READ THE CUSTOMER'S MESSAGE CAREFULLY and respond SPECIFICALLY to what they said.
2. Do NOT give a generic greeting — directly address their issue in the first sentence.
3. Be warm, empathetic, and solution-oriented.
4. If the customer is upset or frustrated, acknowledge their feelings FIRST before offering solutions.
5. Use the knowledge base below to give SPECIFIC answers — mention exact policies, steps, or product details.
6. Use the customer's first name: "${customerName.split(' ')[0]}".
7. Include specific next steps or actions the customer can take.
8. If you're unsure about something, say so rather than making it up.
9. NEVER mention: ${restricted || 'nothing restricted'}
10. You are drafting for a human agent to review and edit before sending.
11. Do NOT start with "Hi there! Thanks for reaching out." — that's too generic. Reference their actual issue.
${samplesContext}${kbContext}`;

      const userContent = `TICKET SUBJECT: ${ticketSubject}
CHANNEL: ${ticketChannel}
CATEGORY: ${ticketCategory}
CUSTOMER NAME: ${customerName}

CUSTOMER'S MESSAGE:
${conversationText}

Draft a helpful, specific reply as ${agentName} that directly addresses everything the customer said.`;

      const client = new Anthropic({ apiKey });
      const result = await client.messages.create({
        model: 'claude-sonnet-4-20250514', max_tokens: 1024,
        system: systemPrompt,
        messages: [{ role: 'user', content: userContent }],
      });

      const draft = (result.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');

      return res.json({
        draft, agent_name: agentName, brand_id_used: ai.brand_id || null,
        usage: result.usage, kb_articles_used: kbArticles.length,
      });
    } catch (e) {
      res.json({ error: e?.message || String(e) });
    }
  });
};
