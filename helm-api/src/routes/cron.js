
// POST /cron - dispatcher for Cloud Scheduler jobs.
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
//
// Outcome reporting: the dispatcher WAITS for the target route and returns its
// real result, so Cloud Scheduler shows red when a sync fails. Previously it
// replied 200 immediately and ran the job fire-and-forget, which (a) hid every
// failure and (b) left the work running after the response, when Cloud Run
// throttles CPU. A target counts as failed if it returns non-2xx, or a JSON
// body with a top-level `error`, a non-empty `failed` map, or any
// `results.<x>.error`. 502 = target failed, 504 = exceeded CRON_WAIT_MS.
// Needs helm-api --timeout and the Scheduler job's attempt deadline to exceed
// the job's run time.

const { longFetch } = require('../lib/long-fetch');
const SELF_URL = process.env.SELF_URL || 'http://localhost:8080';
const CRON_WAIT_MS = parseInt(process.env.CRON_WAIT_MS || '840000', 10); // 14 min, under the 15 min Cloud Run timeout

// Collect failure reasons from a target's JSON response body.
function findErrors(body) {
  const errs = [];
  if (!body || typeof body !== 'object') return errs;
  if (body.error) errs.push(String(body.error));
  if (body.failed && typeof body.failed === 'object') {
    for (const [k, v] of Object.entries(body.failed)) errs.push(`${k}: ${v}`);
  }
  if (body.results && typeof body.results === 'object') {
    for (const [k, v] of Object.entries(body.results)) if (v && typeof v === 'object' && v.error) errs.push(`${k}: ${v.error}`);
  }
  return errs;
}

// Call a target and classify the outcome. fetchImpl is injectable for tests.
async function runTarget(url, body, { waitMs = CRON_WAIT_MS, fetchImpl = longFetch } = {}) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), waitMs);
  try {
    const r = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
      signal: ac.signal,
    });
    const text = await r.text();
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch {}
    const errors = findErrors(parsed);
    if (!r.ok && !errors.length) errors.push(`HTTP ${r.status}`);
    return { ok: r.ok && errors.length === 0, httpStatus: r.status, errors, snippet: text.slice(0, 500) };
  } catch (e) {
    if (e && e.name === 'AbortError') return { ok: false, timedOut: true, httpStatus: null, errors: [`no response within ${Math.round(waitMs / 1000)}s`], snippet: '' };
    return { ok: false, httpStatus: null, errors: [e?.message || String(e)], snippet: '' };
  } finally {
    clearTimeout(timer);
  }
}

// Run a fixed SQL job with a time limit; same result shape as runTarget.
async function runSql(pool, sql, { timeoutMs = CRON_WAIT_MS } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL statement_timeout = ${Math.max(1000, Math.min(timeoutMs, 840000))}`);
    const r = await client.query(sql);
    await client.query('COMMIT');
    const snippet = JSON.stringify({ rowCount: r.rowCount, rows: (r.rows || []).slice(0, 3) }).slice(0, 500);
    return { ok: true, httpStatus: 200, errors: [], snippet };
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch {}
    const timedOut = /statement timeout/i.test(e.message || '');
    return { ok: false, timedOut, httpStatus: timedOut ? null : 500, errors: [e.message || String(e)], snippet: '' };
  } finally {
    client.release();
  }
}

// Map of job name → { path, body } (HTTP route) or { sql } (database job).
// Add new jobs here.
const JOBS = {
  'qbo-auto-sync':            { path: '/qbo-auto-sync',            body: { what: 'all', sequential: true } },
  'shopify-auto-sync':        { path: '/shopify-auto-sync',        body: {} },
  'cx-export-tick':           { path: '/cx-export-runner',         body: {} },
  'cx-fulfillment-crawler':   { path: '/cx-fulfillment-crawler',   body: {} },
  'cx-kb-gap-weekly':         { path: '/cx-kb-gap-report',         body: { org_id: 'a0000000-0000-0000-0000-000000000001', days: 7 } },
  'cx-appreciation-weekly':   { path: '/cx-appreciation-drafter',  body: { org_id: 'a0000000-0000-0000-0000-000000000001' } },
  // Asana -> Helm project mirror (was Supabase pg_cron asana-sync-mirror).
  // Each run syncs projects whose min interval (120 min) has passed and resumes
  // partial ones from their cursor, inside a 50 s budget.
  'asana-sync-mirror':        { path: '/asana-sync',              body: { action: 'sync_due', max_projects: 10, max_seconds: 50 } },
  'sheets-daily-sync':        { path: '/sheets-daily-sync',        body: {} },
  'sheets-monthly-sync':      { path: '/sheets-sync',              body: {} },
  // Supabase pg_cron jobs that are pure SQL (inventoried by helm-resync into
  // _migration.supabase_cron_jobs). Same statements, now fired by Cloud
  // Scheduler. Fixed text only; nothing from the request reaches the SQL.
  'fin-spend-match-daily':    { sql: `SELECT fin_run_match_pass('a0000000-0000-0000-0000-000000000001')` },
  'cx-wake-snoozed':          { sql: 'SELECT cx_wake_snoozed_tickets()' },
  'cx-detect-spikes':         { sql: 'SELECT cx_detect_spikes()' },
  'cx-competitor-classify':   { sql: 'SELECT cx_classify_competitor_mentions(NULL, 5000)' },
  'fin-vendor-spend-refresh': { sql: 'SELECT fin_refresh_vendor_spend(NULL)' },
  'notifications-prune-daily':{ sql: `DELETE FROM notifications WHERE is_read = true AND created_at < now() - interval '30 days'` },
  // Ported Supabase functions on a schedule.
  'notification-dispatch':    { path: '/notification-dispatch',   body: {} },
  'shopify-backfill-tick':    { path: '/shopify-backfill',        body: {} },
  // Demand-planning tables from Metabase (was pg_cron dp_daily_sync_fire_all,
  // seven parallel calls). Now sequential; verify runs ~45 min later.
  'dp-daily-sync':            { path: '/metabase-daily-sync',     body: { source: 'cron' } },
  'warehouse-sync':           { path: '/warehouse-sync',          body: {} },
  // After the data team's ~11:45 ET rebuild: refresh the Scoreboard numbers only.
  'warehouse-sync-midday':    { path: '/warehouse-sync',          body: { tasks: ['scorecard', 'scoreboard'] } },
  'dp-daily-sync-verify':     { sql: 'SELECT public.dp_daily_sync_verify_and_log()' },
  // dp-daily-sync was a Postgres fn (dp_daily_sync_fire_all) that internally
  // http_posted to multiple Supabase fns. After cutover, this becomes a
  // sequence of helm-api calls - adding here so Cloud Scheduler can fire it.
  // For now this is a no-op until we port dp_daily_sync_fire_all to a route.
};

function mount(app, { pool }) {
  app.post('/cron', async (req, res) => {
    try {
      // Auth: X-Cron-Secret (older Scheduler jobs) OR a Google-signed OIDC token
      // from Cloud Scheduler as the Helm runtime account (newer jobs; no secret
      // to store in the job).
      const provided = (req.headers['x-cron-secret'] || '').trim();
      const expected = (process.env.CRON_SHARED_SECRET || '').trim();
      let authed = !!expected && provided === expected;
      if (!authed) {
        const auth = req.headers.authorization || '';
        if (auth.startsWith('Bearer ')) {
          const { verifyOidc } = require('./data-mirror-export')._internal;
          const audience = process.env.CRON_OIDC_AUDIENCE || 'https://helm-api-qp7o2dcl5a-uc.a.run.app/cron';
          const invokers = (process.env.CRON_OIDC_INVOKERS || 'helm-app-runtime@helm-496923.iam.gserviceaccount.com').toLowerCase().split(',').map((x) => x.trim());
          const v = await verifyOidc(auth.slice(7), { audience, invokers });
          authed = v.ok;
        }
      }
      if (!authed) {
        console.warn('[cron] unauthorized from', req.headers['x-forwarded-for'] || 'unknown');
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { job } = req.body || {};
      if (!job) return res.status(400).json({ error: 'job parameter required' });

      const def = JOBS[job];
      if (!def) {
        return res.status(404).json({ error: `Unknown job: ${job}`, valid_jobs: Object.keys(JOBS) });
      }

      const startedAt = new Date().toISOString();
      console.log(`[cron] running ${job} → ${def.path || 'sql'}`);
      const out = def.sql ? await runSql(pool, def.sql) : await runTarget(`${SELF_URL}${def.path}`, def.body);
      const target = def.path || `sql:${job}`;
      const finishedAt = new Date().toISOString();
      const summary = out.ok ? 'ok' : out.errors.slice(0, 5).join(' | ').slice(0, 480);
      console.log(JSON.stringify({ event: 'cron_run', job, path: target, ok: out.ok, http_status: out.httpStatus, timed_out: !!out.timedOut, errors: out.errors.slice(0, 10) }));

      // Audit log (optional - only insert if table exists, swallow errors)
      pool.query(
        `INSERT INTO cron_run_log (job, path, status_code, response_snippet, started_at, finished_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT DO NOTHING`,
        [job, target, out.httpStatus || (out.timedOut ? 504 : 0), (out.ok ? '' : `FAILED: ${summary} || `) + (out.snippet || ''), startedAt]
      ).catch(() => {}); // table may not exist yet

      const code = out.ok ? 200 : (out.timedOut ? 504 : 502);
      res.status(code).json({ ok: out.ok, job, path: target, started_at: startedAt, finished_at: finishedAt, target_status: out.httpStatus, errors: out.ok ? undefined : out.errors.slice(0, 20) });
    } catch (e) {
      console.error('[cron] dispatcher error:', e?.message);
      res.status(500).json({ error: e?.message || String(e) });
    }
  });

  // GET /cron - health check, lists registered jobs
  app.get('/cron', (req, res) => {
    res.json({
      ok: true,
      jobs: Object.keys(JOBS).map(j => ({ name: j, path: JOBS[j].path || null, kind: JOBS[j].sql ? 'sql' : 'http' })),
    });
  });
}

module.exports = mount;
module.exports._internal = { findErrors, runTarget, runSql, JOBS };
