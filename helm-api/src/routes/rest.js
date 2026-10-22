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

function tableAllowed(req, res, next) {
  if (ALLOWED_TABLES.has(req.params.table)) return next();
  return res.status(403).json({ code: 'PGRST301', message: `table "${req.params.table}" is not available via helm-api`, details: null, hint: null });
}
function rpcAllowed(req, res, next) {
  if (ALLOWED_RPCS.has(req.params.fn)) return next();
  return res.status(403).json({ code: 'PGRST301', message: `function "${req.params.fn}" is not available via helm-api` });
}

module.exports = function(app, { requireAuth, pool }) {

  const handleSelect = async (req, res) => {
    const { table } = req.params;
    try {
      const startedAt = Date.now();
      const { sql, params, countMode, offset, limit } = await buildSelectQueryAsync(pool, {
        table,
        query: req.query,
        headers: req.headers,
      });
      const client = await pool.connect();
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
        if (req.method === 'HEAD') return res.status(200).end();
        return res.status(200).json(result.rows);
      } finally {
        client.release();
      }
    } catch (err) {
      const msg = err?.message || String(err);
      console.error(`[rest] error on ${req.method} /rest/v1/${table}:`, msg);
      const status = /invalid|unsupported|bad|ambiguous|no FK/.test(msg) ? 400 : 500;
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
      const client = await pool.connect();
      try {
        const result = await client.query(sql, params);
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
      } finally {
        client.release();
      }
    } catch (err) {
      const msg = err?.message || String(err);
      console.error(`[rest] error on ${req.method} /rest/v1/${table}:`, msg);
      const status = /invalid|unsupported|refusing|require|empty body|must|ambiguous/.test(msg) ? 400 : 500;
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
      const client = await pool.connect();
      try {
        const result = await client.query(sql, params);
        res.setHeader('X-Helm-Rest', '1');
        return res.status(200).json(result.rows);
      } finally {
        client.release();
      }
    } catch (err) {
      const msg = err?.message || String(err);
      console.error(`[rest] rpc error on /rest/v1/rpc/${fn}:`, msg);
      const status = /invalid|unsupported|bad/.test(msg) ? 400 : 500;
      return res.status(status).json({ code: 'PGRST300', message: msg });
    }
  });
};
