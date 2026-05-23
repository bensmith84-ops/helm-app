// PostgREST shim — mounted as /rest/v1/:table and /rest/v1/rpc/:fn.
//
// Handlers:
//   GET    /rest/v1/:table       — SELECT (with embeds)
//   HEAD   /rest/v1/:table       — SELECT but return only headers (for count probes)
//   POST   /rest/v1/:table       — INSERT (or UPSERT if Prefer: resolution=merge-duplicates)
//   PATCH  /rest/v1/:table       — UPDATE (requires filter)
//   DELETE /rest/v1/:table       — DELETE (requires filter)
//   POST   /rest/v1/rpc/:fn      — call stored procedure with body as named args

const {
  buildSelectQueryAsync,
  buildInsertQuery,
  buildUpdateQuery,
  buildDeleteQuery,
  buildRpcQuery,
} = require('../lib/pgrest');

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

  app.get('/rest/v1/:table',     requireAuth, handleSelect);
  app.head('/rest/v1/:table',    requireAuth, handleSelect);
  app.post('/rest/v1/:table',    requireAuth, handleWrite(buildInsertQuery));
  app.patch('/rest/v1/:table',   requireAuth, handleWrite(buildUpdateQuery));
  app.delete('/rest/v1/:table',  requireAuth, handleWrite(buildDeleteQuery));

  app.post('/rest/v1/rpc/:fn', requireAuth, async (req, res) => {
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
