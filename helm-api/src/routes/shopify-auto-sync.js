
// POST /shopify-auto-sync — port of supabase/functions/shopify-auto-sync
// Orchestrator: triggers today + yesterday day_sync. Uses SELF_URL for self-calls.
module.exports = function(app) {
  app.post('/shopify-auto-sync', async (req, res) => {
    try {
      const selfUrl = process.env.SELF_URL || 'http://localhost:8080';
      const syncUrl = `${selfUrl}/shopify-sync`;
      const headers = { 'Content-Type': 'application/json' };

      const results = {};
      const today = new Date().toISOString().slice(0, 10);
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

      const todayRes = await fetch(syncUrl, {
        method: 'POST', headers,
        body: JSON.stringify({ action: 'day_sync', date: today }),
      });
      results.today = await todayRes.json().catch(() => ({ error: 'parse failed' }));

      const yestRes = await fetch(syncUrl, {
        method: 'POST', headers,
        body: JSON.stringify({ action: 'day_sync', date: yesterday }),
      });
      results.yesterday = await yestRes.json().catch(() => ({ error: 'parse failed' }));

      res.json({ triggered_at: new Date().toISOString(), results });
    } catch (e) {
      res.json({ error: e?.message || String(e) });
    }
  });
};
