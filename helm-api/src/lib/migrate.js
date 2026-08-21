// Boot-time migration runner.
//
// On every helm-api boot, applies any SQL files in helm-api/migrations/ that
// haven't run yet, in filename order (name them NNN_description.sql). This is
// the "no terminal" channel for Cloud SQL DDL: commit a migration, push, and
// Cloud Build's deploy applies it with the credentials helm-api already holds.
//
// Safety properties:
//   - pg_advisory_lock prevents concurrent instances double-applying
//   - each file runs in its own transaction; failure rolls back that file
//   - applied files are recorded in _helm_migrations and never re-run
//   - a failed migration logs loudly but does NOT crash the server, so a bad
//     migration can't take the API down; fix-forward with a follow-up file
//   - files are content-hashed; editing an already-applied file logs a warning
//     (write a new file instead of editing history)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LOCK_KEY = 815403911; // arbitrary constant for pg_advisory_lock

async function runMigrations(pool, migrationsDir) {
  let files = [];
  try {
    files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  } catch {
    console.log('[migrate] no migrations directory, skipping');
    return;
  }
  if (files.length === 0) { console.log('[migrate] no migration files'); return; }

  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_KEY]);

    await client.query(`
      CREATE TABLE IF NOT EXISTS _helm_migrations (
        filename   text PRIMARY KEY,
        sha256     text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )`);

    const { rows } = await client.query('SELECT filename, sha256 FROM _helm_migrations');
    const applied = new Map(rows.map((r) => [r.filename, r.sha256]));

    for (const file of files) {
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      const hash = crypto.createHash('sha256').update(sql).digest('hex');

      if (applied.has(file)) {
        if (applied.get(file) !== hash) {
          console.warn(`[migrate] WARNING: ${file} was edited after being applied (hash mismatch). Write a new migration instead.`);
        }
        continue;
      }

      console.log(`[migrate] applying ${file} ...`);
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO _helm_migrations (filename, sha256) VALUES ($1, $2)', [file, hash]);
        await client.query('COMMIT');
        console.log(`[migrate] applied ${file}`);
      } catch (err) {
        try { await client.query('ROLLBACK'); } catch {}
        console.error(`[migrate] FAILED ${file}: ${err?.message}. Server continues; fix forward with a new migration.`);
        break; // don't run later files on top of a failed earlier one
      }
    }
  } catch (err) {
    console.error('[migrate] runner error:', err?.message);
  } finally {
    try { await client.query('SELECT pg_advisory_unlock($1)', [LOCK_KEY]); } catch {}
    client.release();
  }
}

module.exports = { runMigrations };
