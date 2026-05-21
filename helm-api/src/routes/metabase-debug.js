
// POST /metabase-debug — port of supabase/functions/metabase-debug
// Uncomments date-filter blocks in a Metabase card via the Metabase API.
module.exports = function(app) {
  app.post('/metabase-debug', async (req, res) => {
    try {
      const METABASE_URL = process.env.METABASE_URL || 'https://metabase.earthbreezedev.com';
      const METABASE_API_KEY = process.env.METABASE_API_KEY || '';
      if (!METABASE_API_KEY) return res.status(500).json({ error: 'METABASE_API_KEY not configured' });

      const body = req.body || {};
      const cardId = body.question_id || 526;

      const getRes = await fetch(`${METABASE_URL}/api/card/${cardId}`, {
        headers: { 'x-api-key': METABASE_API_KEY },
      });
      if (!getRes.ok) return res.status(500).json({ step: 'get', status: getRes.status, body: await getRes.text() });
      const card = await getRes.json();
      const stage = card.dataset_query?.stages?.[0];
      if (!stage?.native) return res.status(400).json({ error: 'card has no stage0.native' });
      const oldSql = stage.native;

      const newSql = oldSql.replace(/--(\s*AND\b[^\n]*\{\{[a-z_]+\}\}[^\n]*)/gi, '$1');

      if (newSql === oldSql) {
        return res.json({ ok: false, message: 'No commented date filters found to uncomment', sample: oldSql.substring(0, 600) });
      }

      const templateTags = {
        start_date: { id: 'start_date_tag', name: 'start_date', 'display-name': 'Start date', type: 'text', required: true, default: '2026-01-01' },
        end_date: { id: 'end_date_tag', name: 'end_date', 'display-name': 'End date', type: 'text', required: true, default: '2026-12-31' },
      };
      const newDatasetQuery = {
        ...card.dataset_query,
        stages: [{ ...stage, native: newSql, 'template-tags': templateTags }],
      };
      const newParameters = [
        { id: 'start_date_tag', type: 'category', target: ['variable', ['template-tag', 'start_date']], name: 'Start date', slug: 'start_date' },
        { id: 'end_date_tag', type: 'category', target: ['variable', ['template-tag', 'end_date']], name: 'End date', slug: 'end_date' },
      ];

      const putRes = await fetch(`${METABASE_URL}/api/card/${cardId}`, {
        method: 'PUT',
        headers: { 'x-api-key': METABASE_API_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...card, dataset_query: newDatasetQuery, parameters: newParameters }),
      });
      const putBody = await putRes.text();
      return res.json({
        ok: putRes.ok,
        status: putRes.status,
        diff_lines: newSql.split('\n').filter(l => l.includes('{{')).slice(0, 6),
        response_preview: putBody.substring(0, 500),
      });
    } catch (e) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });
};
