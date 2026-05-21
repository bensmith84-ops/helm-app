
// POST /cx-kb-gap-report — port of supabase/functions/cx-kb-gap-report
// Scans last N days of CX tickets + social mentions, AI-clusters into topics,
// matches against existing KB, persists gap report.
const Anthropic = require('@anthropic-ai/sdk');
const MODEL = 'claude-sonnet-4-20250514';

module.exports = function(app, { pool }) {
  app.post('/cx-kb-gap-report', async (req, res) => {
    try {
      const { org_id, days = 7 } = req.body || {};
      if (!org_id) return res.status(400).json({ error: 'org_id required' });

      const periodEnd = new Date();
      const periodStart = new Date(Date.now() - days * 86400_000);

      const { rows: tickets } = await pool.query(
        `SELECT id, subject, ai_intent, ai_tags, channel, created_at
         FROM cx_tickets
         WHERE org_id = $1 AND created_at >= $2 AND created_at <= $3
         LIMIT 500`,
        [org_id, periodStart.toISOString(), periodEnd.toISOString()]
      );

      const ticketIds = tickets.map(t => t.id);

      // First inbound message per ticket, sample to 1000 rows max
      const { rows: firstMsgs } = ticketIds.length === 0
        ? { rows: [] }
        : await pool.query(
          `SELECT ticket_id, body_text FROM cx_messages
           WHERE ticket_id = ANY($1::uuid[]) AND direction = 'inbound'
           ORDER BY created_at ASC LIMIT 1000`,
          [ticketIds.slice(0, 500)]
        );

      const firstByTicket = {};
      for (const m of firstMsgs) {
        if (!firstByTicket[m.ticket_id]) firstByTicket[m.ticket_id] = (m.body_text || '').slice(0, 200);
      }

      const { rows: mentions } = await pool.query(
        `SELECT content, intent, platform, created_at FROM cx_social_mentions
         WHERE org_id = $1 AND created_at >= $2 AND is_question = true LIMIT 500`,
        [org_id, periodStart.toISOString()]
      );

      const lines = [];
      for (const t of tickets) {
        const body = firstByTicket[t.id] || '';
        const line = `[ticket ${t.channel}] ${t.subject || ''} \u2014 ${body.replace(/\s+/g, ' ')}`.slice(0, 240);
        if (line.length > 10) lines.push(line);
      }
      for (const m of mentions) {
        const line = `[social ${m.platform}] ${(m.content || '').replace(/\s+/g, ' ')}`.slice(0, 240);
        if (line.length > 10) lines.push(line);
      }

      if (lines.length === 0) {
        return res.json({ success: true, topics: [], reason: 'No customer messages in window' });
      }

      const sample = lines.length > 250
        ? lines.sort(() => Math.random() - 0.5).slice(0, 250)
        : lines;

      const { rows: kbArticles } = await pool.query(
        `SELECT id, title, category FROM cx_kb_articles
         WHERE org_id = $1 AND status = 'published'`,
        [org_id]
      );
      const kbIndex = kbArticles.map(a => `${a.id}|${a.title}`).join('\n');

      const systemPrompt = `You analyze customer support messages to identify the most common topics customers are asking about, then match each topic to existing knowledge base articles. The goal is to surface KB gaps so the team can write new articles to deflect repeat questions.

Return ONLY a JSON object with this shape — no markdown fences, no preamble:
{
  "topics": [
    {
      "topic": "short topic label (3-7 words, customer-facing)",
      "occurrence_count": <integer count of messages that fit this topic>,
      "example_quotes": ["3-5 representative customer phrasings, lightly cleaned but not invented"],
      "matched_kb_article_id": "<UUID from the KB index if a strong match exists, else null>",
      "suggested_article_title": "<title if no KB match, else null>",
      "suggested_article_body": "<concise draft answer 100-200 words if no KB match, else null>"
    }
  ]
}

Focus on topics with 3+ occurrences. Cap at 12 topics. Order by occurrence_count desc.`;

      const userPrompt = `EXISTING KB ARTICLES (id|title):
${kbIndex || '(none)'}

CUSTOMER MESSAGES (last ${days} days, ${sample.length} sampled of ${lines.length} total):
${sample.join('\n')}

Return the JSON object now.`;

      const apiKey = (process.env.ANTHROPIC_API_KEY || '').trim();
      if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });

      const client = new Anthropic({ apiKey });
      const apiData = await client.messages.create({
        model: MODEL, max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const rawText = apiData.content?.[0]?.text || '{}';
      const cleanText = rawText.replace(/^```(?:json)?\s*/m, '').replace(/```\s*$/m, '').trim();

      let parsed = {};
      try { parsed = JSON.parse(cleanText); } catch {
        return res.status(500).json({ error: 'AI returned non-JSON', raw: cleanText.slice(0, 500) });
      }

      const topics = Array.isArray(parsed.topics) ? parsed.topics : [];
      const periodStartDate = periodStart.toISOString().slice(0, 10);
      const periodEndDate = periodEnd.toISOString().slice(0, 10);

      // Mark existing open reports for this window as dismissed
      await pool.query(
        `UPDATE cx_kb_gap_reports SET status = 'dismissed'
         WHERE org_id = $1 AND period_start = $2 AND period_end = $3 AND status = 'open'`,
        [org_id, periodStartDate, periodEndDate]
      );

      if (topics.length > 0) {
        const values = [];
        const params = [];
        let pi = 1;
        for (const t of topics) {
          values.push(`($${pi++}, $${pi++}, $${pi++}, $${pi++}, $${pi++}, $${pi++}, $${pi++}, $${pi++}, $${pi++}, $${pi++}, 'open')`);
          params.push(
            org_id, periodStartDate, periodEndDate,
            String(t.topic || 'unknown').slice(0, 200),
            Number(t.occurrence_count) || 0,
            JSON.stringify(t.example_quotes || []),
            !!t.matched_kb_article_id,
            t.matched_kb_article_id || null,
            t.suggested_article_title || null,
            t.suggested_article_body || null
          );
        }
        await pool.query(
          `INSERT INTO cx_kb_gap_reports
            (org_id, period_start, period_end, topic, occurrence_count, example_quotes,
             has_kb_coverage, matched_kb_article_id, suggested_article_title,
             suggested_article_body, status)
           VALUES ${values.join(', ')}`,
          params
        );
      }

      const covered = topics.filter(t => !!t.matched_kb_article_id).length;
      res.json({
        success: true,
        period_start: periodStartDate, period_end: periodEndDate,
        topics_found: topics.length,
        gaps: topics.length - covered, covered,
        messages_analyzed: sample.length,
        tokens_used: (apiData.usage?.input_tokens || 0) + (apiData.usage?.output_tokens || 0),
      });
    } catch (e) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });
};
