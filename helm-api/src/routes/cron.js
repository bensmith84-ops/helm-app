
// POST /cron — dispatcher for Cloud Scheduler jobs.
// Replaces 8 pg_cron jobs that called Supabase edge fns via net.http_post.
//
// Cloud Scheduler config:
//   gcloud scheduler jobs create http JOB_NAME \
//     --schedule="CRON_EXPR" \
//     --uri="https://helm-api-.../cron" \
//     --http-method=POST \
//     --headers="Content-Type=application/json,X-Cron-Secret=$CRON_SHARED_SECRET" \
//     --message-body='{"job":"qbo-auto-sync"}'
//
// Auth: every request must include X-Cron-Secret header matching env CRON_SHARED_SECRET.

const SELF_URL = process.env.SELF_URL || 'http://localhost:8080';

// Map of job name → { path, body }. Add new jobs here.
const JOBS = {
  'qbo-auto-sync':            { path: '/qbo-auto-sync',            body: { what: 'all' } },
  'shopify-auto-sync':        { path: '/shopify-auto-sync',        body: {} },
  'cx-export-tick':           { path: '/cx-export-runner',         body: {} },
  'cx-fulfillment-crawler':   { path: '/cx-fulfillment-crawler',   body: {} },
  'cx-kb-gap-weekly':         { path: '/cx-kb-gap-report',         body: { org_id: 'a0000000-0000-0000-0000-000000000001', days: 7 } },
  'cx-appreciation-weekly':   { path: '/cx-appreciation-drafter',  body: { org_id: 'a0000000-0000-0000-0000-000000000001' } },
  'sheets-daily-sync':        { path: '/sheets-daily-sync',        body: {} },
  'sheets-monthly-sync':      { path: '/sheets-sync',              body: {} },
  // dp-daily-sync was a Postgres fn (dp_daily_sync_fire_all) that internally
  // http_posted to multiple Supabase fns. After cutover, this becomes a
  // sequence of helm-api calls — adding here so Cloud Scheduler can fire it.
  // For now this is a no-op until we port dp_daily_sync_fire_all to a route.
};

module.exports = function(app, { pool }) {
  app.post('/cron', async (req, res) => {
    try {
      const provided = req.headers['x-cron-secret'] || '';
      const expected = process.env.CRON_SHARED_SECRET || '';
      if (!expected) {
        return res.status(500).json({ error: 'CRON_SHARED_SECRET not configured on server' });
      }
      if (provided !== expected) {
        console.warn('[cron] bad secret from', req.headers['x-forwarded-for'] || 'unknown');
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { job } = req.body || {};
      if (!job) return res.status(400).json({ error: 'job parameter required' });

      const def = JOBS[job];
      if (!def) {
        return res.status(404).json({ error: `Unknown job: ${job}`, valid_jobs: Object.keys(JOBS) });
      }

      const startedAt = new Date().toISOString();
      console.log(`[cron] dispatching ${job} → ${def.path}`);

      // Fire-and-forget so Cloud Scheduler gets a quick 200 even if the actual
      // sync takes minutes. Errors are logged but don't fail the scheduler call.
      // For long syncs (qbo-auto-sync, shopify-auto-sync) this is essential —
      // Cloud Scheduler times out at 30 mins but expects quick acks.
      fetch(`${SELF_URL}${def.path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(def.body || {}),
      })
        .then(r => r.text().then(t => ({ status: r.status, text: t })))
        .then(({ status, text }) => {
          console.log(`[cron] ${job} → ${def.path} returned ${status}: ${text.slice(0, 200)}`);

          // Audit log (optional — only insert if table exists, swallow errors)
          pool.query(
            `INSERT INTO cron_run_log (job, path, status_code, response_snippet, started_at, finished_at)
             VALUES ($1, $2, $3, $4, $5, NOW())
             ON CONFLICT DO NOTHING`,
            [job, def.path, status, text.slice(0, 500), startedAt]
          ).catch(() => {}); // table may not exist yet
        })
        .catch(e => console.error(`[cron] ${job} failed:`, e?.message));

      res.json({ ok: true, job, path: def.path, dispatched_at: startedAt });
    } catch (e) {
      console.error('[cron] dispatcher error:', e?.message);
      res.status(500).json({ error: e?.message || String(e) });
    }
  });

  // GET /cron — health check, lists registered jobs
  app.get('/cron', (req, res) => {
    res.json({
      ok: true,
      jobs: Object.keys(JOBS).map(j => ({ name: j, path: JOBS[j].path })),
    });
  });
};
