// POST /metabase-daily-sync - port of supabase/functions/metabase-daily-sync (v4)
//
// Daily orchestrator: runs /metabase-sync 'sync_question_to_table' for every
// Demand Planning Metabase card, one after another, then logs a summary row to
// metabase_sync_log. Meant for the /cron dispatcher (job 'dp-daily-sync'), but
// safe to call on demand.
//
// Body (all optional): { org_id?, source? }   (GET also accepted, no body)
// Response: { ok, started_at, finished_at, total_synced, summary[] }
//           plus `failed: { <table>: <error> }` when any card failed, so the
//           /cron dispatcher reports the run as failed (it reads `failed`).
// 500 { ok:false, error, summary } on an unexpected error.

const { longFetch } = require('../lib/long-fetch');
const SELF = process.env.SELF_URL || 'http://localhost:8080';

// Earth Breeze org. Single-tenant deployment.
const EB_ORG_ID = 'a0000000-0000-0000-0000-000000000001';

// Card → table mapping. Mirrors DASHBOARD_SYNC_MAP in app/components/MetabaseSync.js.
// lookback_days: how many days back from today a chunked sync covers.
// chunk_days: per-chunk size. Non-chunked = full snapshot replace.
const SYNC_PLAN = [
  // Daily Unit Sales: 7-day rolling refresh. Date-scoped delete keeps older history.
  { card_id: 526, table: 'dp_daily_sales',              label: 'Daily Unit Sales',        chunked: true,  lookback_days: 7, chunk_days: 7 },
  // Full-table snapshots.
  { card_id: 527, table: 'dp_sku_master',               label: 'SKU Master',              chunked: false },
  { card_id: 528, table: 'dp_inventory',                label: 'Inventory',               chunked: false },
  { card_id: 529, table: 'dp_offer_performance',        label: 'Offer Performance',       chunked: false },
  { card_id: 530, table: 'dp_subscription_cohorts',     label: 'Subscription Cohorts',    chunked: false },
  // Heavy tables: 48h rolling window.
  { card_id: 587, table: 'dp_daily_sales_by_warehouse', label: 'Daily Sales × Warehouse', chunked: true, lookback_days: 2, chunk_days: 3 },
  { card_id: 588, table: 'dp_orders',                   label: 'Orders (line-item)',      chunked: true, lookback_days: 2, chunk_days: 1 },
];

// Safety net so a hung call can't block the run forever. Generous on purpose:
// aborting doesn't stop the in-process sync, and a retry would overlap it, so a
// timeout is NOT retried.
const CALL_TIMEOUT_MS = parseInt(process.env.METABASE_SYNC_CALL_TIMEOUT_MS || '600000', 10);

async function callMetabaseSync(payload, attempt = 1) {
  const MAX_ATTEMPTS = 3;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), CALL_TIMEOUT_MS);
  try {
    const res = await longFetch(`${SELF}/metabase-sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: ac.signal,
    });
    const transient = [500, 502, 503, 504, 546].includes(res.status);
    if (transient && attempt < MAX_ATTEMPTS) {
      clearTimeout(timer);
      await res.text().catch(() => {});
      await new Promise((r) => setTimeout(r, 2000 * attempt));
      return callMetabaseSync(payload, attempt + 1);
    }
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { error: text.substring(0, 500) }; }
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    clearTimeout(timer);
    if (err?.name === 'AbortError') {
      return { ok: false, status: 0, data: { error: `no response within ${Math.round(CALL_TIMEOUT_MS / 1000)}s` } };
    }
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 2000 * attempt));
      return callMetabaseSync(payload, attempt + 1);
    }
    return { ok: false, status: 0, data: { error: err?.message || String(err) } };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = function (app, { pool }) {
  const handler = async (req, res) => {
    const startedAt = new Date().toISOString();
    const summary = [];
    try {
      const body = (req.method === 'POST' && req.body && typeof req.body === 'object') ? req.body : {};
      const orgId = body.org_id || EB_ORG_ID;

      const today = new Date();
      const ed = today.toISOString().split('T')[0];

      for (const spec of SYNC_PLAN) {
        const t0 = Date.now();
        const payload = {
          action: 'sync_question_to_table',
          question_id: spec.card_id,
          table_name: spec.table,
          org_id: orgId,
        };
        if (spec.chunked) {
          const startDate = new Date(today);
          startDate.setUTCDate(startDate.getUTCDate() - (spec.lookback_days || 7));
          payload.start_date = startDate.toISOString().split('T')[0];
          payload.end_date = ed;
          payload.chunk_days = spec.chunk_days || 7;
          payload.stream = true; // force streaming for chunked syncs
        }
        const result = await callMetabaseSync(payload);
        const elapsed_ms = Date.now() - t0;
        summary.push({
          card_id: spec.card_id, table: spec.table, label: spec.label,
          ok: result.ok && !result.data?.error,
          synced: result.data?.synced ?? 0,
          total: result.data?.total ?? 0,
          window: spec.chunked ? `${payload.start_date} → ${payload.end_date}` : 'full',
          elapsed_ms,
          error: result.data?.error || (!result.ok ? `HTTP ${result.status}` : null),
        });
      }

      const finishedAt = new Date().toISOString();
      const allOk = summary.every((s) => s.ok);
      const totalSynced = summary.reduce((s, x) => s + (x.synced || 0), 0);

      // Best-effort log to metabase_sync_log.
      try {
        await pool.query(
          `INSERT INTO metabase_sync_log (org_id, started_at, finished_at, ok, summary, source)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6)`,
          [orgId, startedAt, finishedAt, allOk, JSON.stringify(summary), body.source || 'unknown']
        );
      } catch (e) { console.error('[metabase-daily-sync] log insert failed:', e?.message); }

      const out = { ok: allOk, started_at: startedAt, finished_at: finishedAt, total_synced: totalSynced, summary };
      if (!allOk) {
        out.failed = {};
        for (const s of summary) if (!s.ok) out.failed[s.table] = s.error || 'failed';
      }
      return res.json(out);
    } catch (err) {
      return res.status(500).json({ ok: false, error: err?.message || String(err), summary });
    }
  };
  app.post('/metabase-daily-sync', handler);
  app.get('/metabase-daily-sync', handler);
};

module.exports._internal = { SYNC_PLAN };
