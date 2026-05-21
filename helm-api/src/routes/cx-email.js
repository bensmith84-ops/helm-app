
// POST /cx-email — port of supabase/functions/cx-email
// 3 actions: inbound (new ticket or append + AI draft reply), send_reply, get_thread.
const Anthropic = require('@anthropic-ai/sdk');
const DEFAULT_ORG_ID = 'a0000000-0000-0000-0000-000000000001';

module.exports = function(app, { pool }) {
  app.post('/cx-email', async (req, res) => {
    try {
      const body = req.body || {};
      const { action } = body;
      const orgId = body.org_id || DEFAULT_ORG_ID;
      const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();

      // ── INBOUND ──
      if (action === 'inbound') {
        const { from_email, from_name, subject, body_text, thread_id } = body;
        if (!from_email || !body_text) return res.status(400).json({ error: 'from_email and body_text required' });

        let ticket = null;
        let ticketId = thread_id;

        if (ticketId) {
          const { rows } = await pool.query(`SELECT * FROM cx_tickets WHERE id = $1 LIMIT 1`, [ticketId]);
          if (rows[0]) {
            ticket = rows[0];
            if (ticket.status === 'resolved' || ticket.status === 'closed') {
              await pool.query(`UPDATE cx_tickets SET status = 'open', updated_at = NOW() WHERE id = $1`, [ticketId]);
              ticket.status = 'open';
            }
          }
        }

        if (!ticket) {
          const { rows } = await pool.query(
            `INSERT INTO cx_tickets
              (org_id, subject, customer_email, customer_name, channel, priority, category, status)
             VALUES ($1, $2, $3, $4, 'email', 'medium', 'general', 'open')
             RETURNING *`,
            [orgId, subject || 'No subject', from_email,
             from_name || from_email.split('@')[0]]
          );
          ticket = rows[0];
          ticketId = ticket?.id;
        }

        if (!ticketId) return res.status(500).json({ error: 'Failed to create ticket' });

        // Save inbound
        await pool.query(
          `INSERT INTO cx_messages
            (ticket_id, direction, sender_type, sender_name, sender_email, body_text, channel)
           VALUES ($1, 'inbound', 'customer', $2, $3, $4, 'email')`,
          [ticketId, from_name || from_email.split('@')[0], from_email, body_text]
        );

        // Conversation context
        const { rows: allMsgs } = await pool.query(
          `SELECT direction, sender_name, body_text FROM cx_messages
           WHERE ticket_id = $1 ORDER BY created_at`,
          [ticketId]
        );
        const conversationText = allMsgs.map(m => {
          const sender = m.direction === 'inbound' ? (m.sender_name || 'Customer') : 'Breeze (Agent)';
          return `[${sender}]: ${m.body_text}`;
        }).join('\n\n');

        // AI config
        const { rows: aiRows } = await pool.query(
          `SELECT * FROM cx_ai_config WHERE org_id = $1 LIMIT 1`, [orgId]
        );
        const ai = aiRows[0] || {};
        const agentName = ai.agent_name || 'Breeze';
        const brandVoice = ai.brand_voice || 'Friendly, eco-conscious DTC brand.';
        const tone = ai.tone || 'friendly';
        const traits = (ai.personality_traits || []).join(', ');
        const signOff = ai.sign_off || '';
        const restricted = (ai.restricted_topics || []).join(', ');
        const samples = (ai.sample_responses || []).map(s => `[${s.scenario}]: ${s.response}`).join('\n');

        // KB
        const { rows: kbAll } = await pool.query(
          `SELECT title, content, category FROM cx_kb_articles
           WHERE org_id = $1 AND status = 'published' LIMIT 12`,
          [orgId]
        );
        const kbContext = kbAll.map(a => `--- ${a.title} ---\n${a.content}`).join('\n\n');

        const customerFirstName = (from_name || from_email.split('@')[0]).split(' ')[0];

        const systemPrompt = `You are ${agentName}, a customer support agent for Earth Breeze.

PERSONALITY: ${traits}
BRAND VOICE: ${brandVoice}
TONE: ${tone}
${signOff ? `SIGN OFF: End messages with: ${signOff}` : ''}

CRITICAL RULES:
1. READ THE CUSTOMER'S MESSAGE CAREFULLY and respond SPECIFICALLY to what they said.
2. Do NOT give a generic greeting. Directly address their issue in the first sentence.
3. Be warm, empathetic, and solution-oriented.
4. If the customer is upset, acknowledge their feelings FIRST.
5. Use the knowledge base to give SPECIFIC answers.
6. Use the customer's first name: "${customerFirstName}".
7. Include specific next steps.
8. NEVER mention: ${restricted || 'nothing restricted'}
9. You are replying as the support agent directly via email.
10. Keep it concise — 2-3 short paragraphs max.
11. Do NOT include a subject line — just the body text.
${samples ? `\nSAMPLE RESPONSES:\n${samples}` : ''}

KNOWLEDGE BASE:\n${kbContext}`;

        const userContent = `TICKET: ${ticket.subject}\nCUSTOMER: ${from_name || from_email}\n\nFULL CONVERSATION:\n${conversationText}\n\nDraft a reply as ${agentName}.`;

        let aiReply = '';
        if (apiKey) {
          try {
            const client = new Anthropic({ apiKey });
            const result = await client.messages.create({
              model: 'claude-sonnet-4-20250514', max_tokens: 800,
              system: systemPrompt,
              messages: [{ role: 'user', content: userContent }],
            });
            aiReply = (result.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
          } catch (_) {
            aiReply = `Hi ${customerFirstName}, thanks for reaching out! We've received your message and a team member will get back to you shortly.`;
          }
        } else {
          aiReply = `Hi ${customerFirstName}, thanks for reaching out! We've received your message and a team member will get back to you shortly.`;
        }

        // Save outbound
        await pool.query(
          `INSERT INTO cx_messages
            (ticket_id, direction, sender_type, sender_name, sender_email, body_text, channel, is_ai_generated)
           VALUES ($1, 'outbound', 'ai_agent', $2, 'support@earthbreeze.com', $3, 'email', true)`,
          [ticketId, agentName, aiReply]
        );

        // Update ticket
        await pool.query(
          `UPDATE cx_tickets SET
            status = 'pending',
            first_response_at = COALESCE(first_response_at, NOW()),
            ai_sentiment = 'neutral',
            updated_at = NOW()
           WHERE id = $1`,
          [ticketId]
        );

        return res.json({
          success: true, ticket_id: ticketId,
          ticket_number: ticket.ticket_number,
          ai_reply: aiReply, agent_name: agentName,
        });
      }

      // ── SEND REPLY ──
      if (action === 'send_reply') {
        const { ticket_id, reply_text, agent_name, agent_email } = body;
        if (!ticket_id || !reply_text) return res.status(400).json({ error: 'ticket_id and reply_text required' });

        await pool.query(
          `INSERT INTO cx_messages
            (ticket_id, direction, sender_type, sender_name, sender_email, body_text, channel)
           VALUES ($1, 'outbound', 'agent', $2, $3, $4, 'email')`,
          [ticket_id, agent_name || 'Support Agent',
           agent_email || 'support@earthbreeze.com', reply_text]
        );

        const { rows } = await pool.query(
          `SELECT customer_email, customer_name, subject FROM cx_tickets WHERE id = $1 LIMIT 1`,
          [ticket_id]
        );

        return res.json({
          success: true,
          message: `Reply saved. In production, this would send an email to ${rows[0]?.customer_email}`,
          ticket_id,
        });
      }

      // ── GET THREAD ──
      if (action === 'get_thread') {
        const { ticket_id } = body;
        if (!ticket_id) return res.status(400).json({ error: 'ticket_id required' });
        const { rows: tRows } = await pool.query(`SELECT * FROM cx_tickets WHERE id = $1 LIMIT 1`, [ticket_id]);
        const { rows: msgs } = await pool.query(
          `SELECT * FROM cx_messages WHERE ticket_id = $1 ORDER BY created_at`,
          [ticket_id]
        );
        return res.json({ ticket: tRows[0] || null, messages: msgs });
      }

      return res.status(400).json({ error: 'Unknown action. Use: inbound, send_reply, get_thread' });
    } catch (err) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });
};
