// GET /admin/db-inspect?what=<report>[&table=<name>]   (admin only)
//
// Fixed, read-only catalog reports for the cutover. No caller-supplied SQL:
// "table" is only used as a bind parameter against the system catalogs.
//   what=triggers  table=...  triggers on a public table + their function source
//   what=fks       table=...  foreign keys from/to a public table
//   what=cron                 Supabase pg_cron jobs captured by helm-resync
//   what=storage              Supabase buckets + file counts/sizes captured by helm-resync
//   what=function  name=...   source of a public function
//   what=migrations           helm-api boot-migration ledger

const REPORTS = {
  triggers: {
    needsTable: true,
    sql: `SELECT t.tgname AS trigger, CASE WHEN t.tgtype & 2 = 2 THEN 'BEFORE' WHEN t.tgtype & 64 = 64 THEN 'INSTEAD OF' ELSE 'AFTER' END AS timing,
                 concat_ws(',', CASE WHEN t.tgtype & 4 = 4 THEN 'INSERT' END, CASE WHEN t.tgtype & 8 = 8 THEN 'DELETE' END, CASE WHEN t.tgtype & 16 = 16 THEN 'UPDATE' END) AS events,
                 p.proname AS function, t.tgenabled AS enabled, pg_get_functiondef(p.oid) AS source
            FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_proc p ON p.oid = t.tgfoid
           WHERE NOT t.tgisinternal AND n.nspname = 'public' AND c.relname = $1 ORDER BY 1`,
  },
  fks: {
    needsTable: true,
    sql: `SELECT conname AS constraint, conrelid::regclass::text AS on_table, confrelid::regclass::text AS references_table,
                 pg_get_constraintdef(oid) AS definition, condeferrable AS deferrable, condeferred AS initially_deferred
            FROM pg_constraint WHERE contype = 'f' AND (conrelid = to_regclass('public.' || $1) OR confrelid = to_regclass('public.' || $1)) ORDER BY 1`,
  },
  cron: { sql: `SELECT jobid, jobname, schedule, active, last_status, last_run, command FROM _migration.supabase_cron_jobs ORDER BY jobid` },
  storage: {
    sql: `SELECT b.id AS bucket, b.public, count(o.name) AS files, coalesce(sum(o.size), 0) AS bytes, max(o.updated_at) AS last_change
            FROM _migration.supabase_buckets b LEFT JOIN _migration.supabase_objects o ON o.bucket_id = b.id GROUP BY b.id, b.public ORDER BY files DESC`,
  },
  function: {
    needsName: true,
    sql: `SELECT p.proname AS function, pg_get_function_identity_arguments(p.oid) AS args, pg_get_functiondef(p.oid) AS source
            FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = $1`,
  },
  migrations: { sql: `SELECT filename, applied_at FROM _helm_migrations ORDER BY filename` },
};

module.exports = function (app, { pool }) {
  app.get('/admin/db-inspect', async (req, res) => {
    const rep = REPORTS[req.query.what];
    if (!rep) return res.status(400).json({ error: 'what must be one of: ' + Object.keys(REPORTS).join(', ') });
    const table = String(req.query.table || '');
    if (rep.needsTable && !/^[a-z_][a-z0-9_]{0,62}$/.test(table)) return res.status(400).json({ error: 'table must be a plain table name' });
    const name = String(req.query.name || '');
    if (rep.needsName && !/^[a-z_][a-z0-9_]{0,62}$/.test(name)) return res.status(400).json({ error: 'name must be a plain function name' });
    try {
      const { rows } = await pool.query(rep.sql, rep.needsTable ? [table] : rep.needsName ? [name] : []);
      res.json({ what: req.query.what, table: table || undefined, rows });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
};
module.exports._internal = { REPORTS };
