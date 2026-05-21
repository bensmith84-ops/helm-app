
// POST /scoreboard-chat — port of supabase/functions/scoreboard-chat
// Anthropic-powered scoreboard analyst. No DB access; pure AI call.
const Anthropic = require('@anthropic-ai/sdk');

module.exports = function(app, { requireAuth }) {
  app.post('/scoreboard-chat', requireAuth, async (req, res) => {
    const { messages = [], question = '', context = '', debug = false } = req.body || {};
    const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();

    if (debug) {
      return res.json({
        text: `Key diagnostics: length=${apiKey.length}, prefix=${apiKey.slice(0, 10)}, starts_with_sk=${apiKey.startsWith('sk-')}`,
      });
    }
    if (!apiKey) return res.json({ text: '⚠️ ANTHROPIC_API_KEY not set' });
    if (!apiKey.startsWith('sk-')) return res.json({ text: '⚠️ ANTHROPIC_API_KEY looks wrong' });

    const client = new Anthropic({ apiKey });
    const system = `You are an expert business analyst for Earth Breeze, a leading eco-friendly laundry detergent DTC brand.\n\n${context ? `DATA:\n${context}\n\n` : ''}Business context: GWP = Gift With Purchase subscription. Net Daily Subs = New Subs minus Cancels. ROAS = Revenue/Ad Spend (target 3x+). COMP YAGO = % vs same day last year. X-CAC = blended acquisition cost.\n\nFor charts include: <chart>{"type":"bar","title":"...","data":[{"label":"...","value":0}],"series":["..."],"colors":["#22c55e"]}</chart>\n\nBe direct and specific. Highlight trends and actionable insights.`;

    try {
      const msg = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1500,
        system,
        messages: [...(messages || []).slice(-8), { role: 'user', content: question }],
      });
      const text = msg.content?.[0]?.text;
      if (!text) return res.json({ text: `⚠️ No content. stop_reason=${msg.stop_reason}` });

      let chart = null;
      const m = text.match(/<chart>([\s\S]*?)<\/chart>/);
      if (m) { try { chart = JSON.parse(m[1].trim()); } catch (_) {} }

      return res.json({ success: true, text: text.replace(/<chart>[\s\S]*?<\/chart>/g, '').trim(), chart });
    } catch (e) {
      return res.json({ text: `⚠️ Anthropic error: ${String(e)}` });
    }
  });
};
