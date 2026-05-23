// PostgREST shim — mounted as /rest/v1/:table and /rest/v1/rpc/:fn.
// Phase 1: GET only. Phase 2+ will add insert/update/delete/embed/rpc.

const {
  buildSelectQuery,
  buildInsertQuery,
  buildUpdateQuery,
  buildDeleteQuery,
  buildRpcQuery,
} = require('../lib/pgrest');

module.exports = function(app, { requireAuth, pool }) {

  // GET /rest/v1/:table  → SELECT
  // HEAD /rest/v1/:table → same SELECT but body=null (for count probes)
  const handleSelect = async (req, res) => {
    const { table } = req.params;
    try {
      const orgId = req.firebase?.org_id || null;
      const { sql, params, countMode, offset, limit } = buildSelectQuery({
        table,
        query: req.query,
        headers: req.headers,
        orgId,
      });

      // Tag the request so we can find it in pg logs
      const startedAt = Date.now();
      const client = await pool.connect();
      try {
        // If countMode=exact, run a separate COUNT query against the same filters.
        // We rebuild the FROM/WHERE from sql (cheap heuristic).
        let totalCount = null;
        if (countMode === 'exact') {
          // Wrap as subquery and count
          const countSql = `SELECT COUNT(*)::int AS total FROM (${sql.replace(/\s+LIMIT\s+\d+/i,'').replace(/\s+OFFSET\s+\d+/i,'')}) sub`;
          const cr = await client.query(countSql, params);
          totalCount = cr.rows[0]?.total ?? null;
        }
        const result = await client.query(sql, params);
        const elapsed = Date.now() - startedAt;
        if (process.env.NODE_ENV !== 'production' || elapsed > 500) {
          console.log(`[rest] ${req.method} /rest/v1/${table} ${elapsed}ms rows=${result.rows.length}`);
        }

        // PostgREST-compatible Content-Range header
        if (totalCount !== null || countMode) {
          const from = offset || 0;
          const to = from + Math.max(result.rows.length - 1, 0);
          res.setHeader('Content-Range', `${from}-${to}/${totalCount ?? '*'}`);
        }
        // Mark this is our shim, useful for debugging
        res.setHeader('X-Helm-Rest', '1');

        if (req.method === 'HEAD') {
          return res.status(200).end();
        }
        return res.status(200).json(result.rows);
      } finally {
        client.release();
      }
    } catch (err) {
      const msg = err?.message || String(err);
      console.error(`[rest] error on ${req.method} /rest/v1/${table}:`, msg);
      // PostgREST returns 400 for query-shape errors, 500 for DB errors
      const status = /invalid|unsupported|bad/.test(msg) ? 400 : 500;
      return res.status(status).json({ error: msg, code: status });
    }
  };

  app.get('/rest/v1/:table', requireAuth, handleSelect);
  app.head('/rest/v1/:table', requireAuth, handleSelect);

  // ───────── WRITES ─────────
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
        if (!prefer || prefer.includes('return=minimal')) {
          // PostgREST default for writes — 201 Created (POST) or 204 (PATCH/DELETE) with empty body
          return res.status(req.method === 'POST' ? 201 : 204).end();
        }
        if (prefer.includes('return=headers-only')) {
          res.setHeader('X-Helm-Rest-Affected', String(result.rowCount));
          return res.status(req.method === 'POST' ? 201 : 200).end();
        }
        // return=representation
        return res.status(req.method === 'POST' ? 201 : 200).json(result.rows);
      } finally {
        client.release();
      }
    } catch (err) {
      const msg = err?.message || String(err);
      console.error(`[rest] error on ${req.method} /rest/v1/${table}:`, msg);
      const status = /invalid|unsupported|refusing|require|empty body|must/.test(msg) ? 400 : 500;
      // Match PostgREST-style error envelope
      return res.status(status).json({
        code: status === 400 ? 'PGRST100' : 'PGRST200',
        message: msg,
        details: null,
        hint: null,
      });
    }
  };

  app.post('/rest/v1/:table',   requireAuth, handleWrite(buildInsertQuery));
  app.patch('/rest/v1/:table',  requireAuth, handleWrite(buildUpdateQuery));
  app.delete('/rest/v1/:table', requireAuth, handleWrite(buildDeleteQuery));

  // ───────── RPC ─────────
  app.post('/rest/v1/rpc/:fn', requireAuth, async (req, res) => {
    const { fn } = req.params;
    try {
      const { sql, params } = buildRpcQuery({ fn, body: req.body });
      const client = await pool.connect();
      try {
        const result = await client.query(sql, params);
        res.setHeader('X-Helm-Rest', '1');
        // PostgREST returns the result as JSON: array of rows or unwrapped scalar
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
