// PostgREST shim - mounted as /rest/v1/:table and /rest/v1/rpc/:fn.
//
// Handlers:
//   GET    /rest/v1/:table       - SELECT (with embeds)
//   HEAD   /rest/v1/:table       - SELECT but return only headers (for count probes)
//   POST   /rest/v1/:table       - INSERT (or UPSERT if Prefer: resolution=merge-duplicates)
//   PATCH  /rest/v1/:table       - UPDATE (requires filter)
//   DELETE /rest/v1/:table       - DELETE (requires filter)
//   POST   /rest/v1/rpc/:fn      - call stored procedure with body as named args

const {
  buildSelectQueryAsync,
  buildInsertQuery,
  buildUpdateQuery,
  buildDeleteQuery,
  buildRpcQuery,
} = require('../lib/pgrest');

// Server-side allowlists. The browser interceptor only routes these tables
// here, but the server must not trust that: queries run as the table owner,
// so row-level security does not apply. Widen only after RLS is enforced.
const ALLOWED_TABLES = new Set((process.env.REST_ALLOWED_TABLES || 'plm_ai_conversations,plm_ai_messages').split(',').map(s => s.trim()).filter(Boolean));
const ALLOWED_RPCS = new Set((process.env.REST_ALLOWED_RPCS || '').split(',').map(s => s.trim()).filter(Boolean));

// With REST_ENFORCE_RLS on, every query runs as "authenticated" with the
// caller's profile id as auth.uid(), so Supabase's RLS policies apply. Tables
// that hold credentials are never served, whatever the allowlist says.
const ENFORCE_RLS = process.env.REST_ENFORCE_RLS !== 'false';
const NEVER_TABLES = new Set((process.env.REST_NEVER_TABLES || '_helm_migrations,cron_run_log,_resync_report,qbo_connections,integrations,shopify_store_tokens,oauth_tokens,api_keys').split(',').map(s => s.trim()).filter(Boolean));

function tableAllowed(req, res, next) {
  const t = req.params.table;
  if (!NEVER_TABLES.has(t) && (ALLOWED_TABLES.has(t) || (ENFORCE_RLS && ALLOWED_TABLES.has('*')))) return next();
  return res.status(403).json({ code: 'PGRST301', message: `table "${req.params.table}" is not available via helm-api`, details: null, hint: null });
}
function rpcAllowed(req, res, next) {
  if (ALLOWED_RPCS.has(req.params.fn) || (ENFORCE_RLS && ALLOWED_RPCS.has('*'))) return next();
  return res.status(403).json({ code: 'PGRST301', message: `function "${req.params.fn}" is not available via helm-api` });
}

function claimsFor(req) {
  const uid = req.helmMember?.profile_id || req.user?.helm_user?.uid || null;
  if (!uid) return null;
  return { sub: uid, role: 'authenticated', aud: 'authenticated', email: req.firebase?.email || req.user?.helm_user?.email || null };
}

// Check out a client, and when RLS is enforced, open a transaction as
// "authenticated" with the caller's claims. SET LOCAL and is_local
// set_config both end with the transaction, so nothing leaks to the pool.
async function rlsClient(pool, req) {
  const client = await pool.connect();
  if (!ENFORCE_RLS) return { client, done: async () => client.release(), fail: async () => client.release() };
  const claims = claimsFor(req);
  if (!claims) { client.release(); const e = new Error('no Helm profile bound to this sign-in'); e.status = 403; throw e; }
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL ROLE authenticated');
    await client.query(
      "SELECT set_config('request.jwt.claims', $1, true), set_config('request.jwt.claim.sub', $2, true), set_config('request.jwt.claim.role', 'authenticated', true), set_config('request.jwt.claim.email', $3, true)",
      [JSON.stringify(claims), claims.sub, claims.email || '']
    );
  } catch (e) { try { await client.query('ROLLBACK'); } catch {} client.release(); throw e; }
  return {
    client,
    done: async () => { try { await client.query('COMMIT'); } finally { client.release(); } },
    fail: async () => { try { await client.query('ROLLBACK'); } catch {} client.release(); },
  };
}

module.exports = Object.assign(function(app, { requireAuth, pool }) {

  const handleSelect = async (req, res) => {
    const { table } = req.params;
    try {
      const startedAt = Date.now();
      const { sql, params, countMode, offset, limit } = await buildSelectQueryAsync(pool, {
        table,
        query: req.query,
        headers: req.headers,
      });
      const tx = await rlsClient(pool, req);
      const client = tx.client;
      try {
        let totalCount = null;
        if (countMode === 'exact') {
          const countSql = `SELECT COUNT(*)::int AS total FROM (${
            sql.replace(/\s+LIMIT\s+\d+/i,'').replace(/\s+OFFSET\s+\d+/i,'')
          }) sub`;
          const cr = await client.query(countSql, params);
          totalCount = cr.rows[0]?.total ?? null;
        }
        const result = await client.query(sql, params);
        const elapsed = Date.now() - startedAt;
        if (process.env.NODE_ENV !== 'production' || elapsed > 500) {
          console.log(`[rest] ${req.method} /rest/v1/${table} ${elapsed}ms rows=${result.rows.length}`);
        }
        if (totalCount !== null || countMode) {
          const from = offset || 0;
          const to = from + Math.max(result.rows.length - 1, 0);
          res.setHeader('Content-Range', `${from}-${to}/${totalCount ?? '*'}`);
        }
        res.setHeader('X-Helm-Rest', '1');
        await tx.done();
        if (req.method === 'HEAD') return res.status(200).end();
        return res.status(200).json(result.rows);
      } catch (e) {
        await tx.fail();
        throw e;
      }
    } catch (err) {
      const msg = err?.message || String(err);
      console.error(`[rest] error on ${req.method} /rest/v1/${table}:`, msg);
      const status = err?.status || (/permission denied|row-level security/.test(msg) ? 403 : /invalid|unsupported|bad|ambiguous|no FK/.test(msg) ? 400 : 500);
      return res.status(status).json({ code: 'PGRST100', message: msg, details: null, hint: null });
    }
  };

  const handleWrite = (build) => async (req, res) => {
    const { table } = req.params;
    try {
      const { sql, params, prefer } = build({
        table,
        body: req.body,
        query: req.query,
        headers: req.headers,
      });
      const tx = await rlsClient(pool, req);
      let result;
      try {
        result = await tx.client.query(sql, params);
        await tx.done();
      } catch (e) {
        await tx.fail();
        throw e;
      }
      {
        res.setHeader('X-Helm-Rest', '1');
        if (!prefer || prefer.includes('return=minimal') || (!prefer.includes('return='))) {
          // PostgREST default: 201 (POST) / 204 (PATCH, DELETE) with empty body
          return res.status(req.method === 'POST' ? 201 : 204).end();
        }
        if (prefer.includes('return=headers-only')) {
          res.setHeader('X-Helm-Rest-Affected', String(result.rowCount));
          return res.status(req.method === 'POST' ? 201 : 200).end();
        }
        return res.status(req.method === 'POST' ? 201 : 200).json(result.rows);
      }
    } catch (err) {
      const msg = err?.message || String(err);
      console.error(`[rest] error on ${req.method} /rest/v1/${table}:`, msg);
      const status = err?.status || (/permission denied|row-level security/.test(msg) ? 403 : /invalid|unsupported|refusing|require|empty body|must|ambiguous/.test(msg) ? 400 : 500);
      return res.status(status).json({
        code: status === 400 ? 'PGRST100' : 'PGRST200',
        message: msg, details: null, hint: null,
      });
    }
  };

  app.get('/rest/v1/:table',     requireAuth, tableAllowed, handleSelect);
  app.head('/rest/v1/:table',    requireAuth, tableAllowed, handleSelect);
  app.post('/rest/v1/:table',    requireAuth, tableAllowed, handleWrite(buildInsertQuery));
  app.patch('/rest/v1/:table',   requireAuth, tableAllowed, handleWrite(buildUpdateQuery));
  app.delete('/rest/v1/:table',  requireAuth, tableAllowed, handleWrite(buildDeleteQuery));

  app.post('/rest/v1/rpc/:fn', requireAuth, rpcAllowed, async (req, res) => {
    const { fn } = req.params;
    try {
      const { sql, params } = buildRpcQuery({ fn, body: req.body });
      const tx = await rlsClient(pool, req);
      let result;
      try {
        result = await tx.client.query(sql, params);
        await tx.done();
      } catch (e) {
        await tx.fail();
        throw e;
      }
      res.setHeader('X-Helm-Rest', '1');
      return res.status(200).json(result.rows);
    } catch (err) {
      const msg = err?.message || String(err);
      console.error(`[rest] rpc error on /rest/v1/rpc/${fn}:`, msg);
      const status = err?.status || (/permission denied|row-level security/.test(msg) ? 403 : /invalid|unsupported|bad/.test(msg) ? 400 : 500);
      return res.status(status).json({ code: 'PGRST300', message: msg });
    }
  });
}, { _internal: { rlsClient, claimsFor, tableAllowed, rpcAllowed } });
