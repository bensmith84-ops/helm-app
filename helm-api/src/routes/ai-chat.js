
// POST /ai-chat — Anthropic streaming proxy
// Frontend sends { model, max_tokens, system, messages, stream } and gets SSE back.

module.exports = function(app, { requireAuth }) {
  app.post('/ai-chat', requireAuth, async (req, res) => {
    const body = req.body || {};
    const apiKey = body.api_key || process.env.ANTHROPIC_API_KEY || '';
    if (!apiKey) {
      return res.status(400).json({ error: 'No Anthropic API key configured.' });
    }

    try {
      const upstream = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: body.model || 'claude-sonnet-4-20250514',
          max_tokens: body.max_tokens || 20000,
          stream: body.stream !== false,
          system: body.system || '',
          messages: body.messages || [],
        }),
      });

      if (!upstream.ok) {
        const text = await upstream.text();
        return res.status(upstream.status).type('application/json').send(text);
      }

      if (body.stream !== false) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        // pipe upstream SSE → client
        const reader = upstream.body.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            res.write(Buffer.from(value));
          }
        } catch (e) {
          console.error('stream pipe error', e);
        } finally {
          res.end();
        }
      } else {
        const data = await upstream.json();
        res.json(data);
      }
    } catch (err) {
      res.status(500).json({ error: 'Proxy error: ' + (err?.message || String(err)) });
    }
  });
};
