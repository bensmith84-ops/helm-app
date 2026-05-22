
// POST /qbo-auto-sync — port of supabase/functions/qbo-auto-sync
// Orchestrator: dispatches one HTTP self-call per resource to /qbo-sync.
// Each child runs in its own request budget. 1s stagger to avoid QBO rate limit.

const RESOURCES = [
  'accounts', 'vendors', 'items', 'customers', 'bills', 'purchases',
  'payments', 'deposits', 'transfers', 'invoices', 'journal_entries',
  'pl', 'pl_monthly', 'balance_sheet', 'attachments',
];

module.exports = function(app) {
  app.post('/qbo-auto-sync', async (req, res) => {
    const selfUrl = process.env.SELF_URL || 'http://localhost:8080';
    const syncUrl = `${selfUrl}/qbo-sync`;

    const body = req.body || {};
    const only = Array.isArray(body.only) && body.only.length ? body.only : null;
    const sequential = body.sequential === true;

    const targets = only ? RESOURCES.filter(r => only.includes(r)) : RESOURCES;
    const startedAt = new Date().toISOString();
    const dispatched = [];
    const failed = {};

    for (const resource of targets) {
      if (dispatched.length > 0) {
        await new Promise(r => setTimeout(r, 1000));
      }

      if (sequential) {
        try {
          const r = await fetch(syncUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ what: resource }),
          });
          if (r.ok) dispatched.push(resource);
          else failed[resource] = String(r.status);
        } catch (e) {
          failed[resource] = e?.message || String(e);
        }
      } else {
        // Fire-and-forget: don't await, log errors
        fetch(syncUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ what: resource }),
        }).catch(e => console.error(`[qbo-auto-sync] ${resource} dispatch failed:`, e?.message));
        dispatched.push(resource);
      }
    }

    res.json({
      started_at: startedAt,
      returned_at: new Date().toISOString(),
      mode: sequential ? 'sequential' : 'fire_and_forget',
      dispatched,
      failed: Object.keys(failed).length ? failed : undefined,
      note: sequential
        ? 'All children completed in this response.'
        : 'Children run independently; check qbo_connections.last_synced_at for completion.',
    });
  });
};
