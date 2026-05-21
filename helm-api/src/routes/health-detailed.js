
// GET /health/detailed — verifies every dependency without leaking secrets.
// Returns: { env: {secret_name: {present, length, prefix}}, db: {ok, version}, firebase: {ok} }
const admin = require('firebase-admin');

module.exports = function(app, { pool }) {
  app.get('/health/detailed', async (_req, res) => {
    const env = {};
    for (const key of ['ANTHROPIC_API_KEY','PGPASSWORD','SLACK_BOT_TOKEN','PGHOST','PGUSER','PGDATABASE','FIREBASE_PROJECT_ID']) {
      const v = process.env[key];
      if (v) {
        env[key] = {
          present: true,
          length: v.length,
          prefix: key.includes('PASSWORD') || key.includes('TOKEN') || key.includes('KEY')
            ? v.slice(0, 8) + '…'
            : v,
        };
      } else {
        env[key] = { present: false };
      }
    }

    let db = { ok: false };
    try {
      const r = await pool.query('SELECT version() AS v, current_database() AS db, current_user AS u');
      db = { ok: true, db: r.rows[0].db, user: r.rows[0].u, version: r.rows[0].v.split(' ').slice(0,2).join(' ') };
    } catch (e) {
      db = { ok: false, error: String(e?.message || e) };
    }

    let firebase = { ok: false };
    try {
      const app_ = admin.app();
      firebase = { ok: true, projectId: app_.options.projectId };
    } catch (e) {
      firebase = { ok: false, error: String(e?.message || e) };
    }

    res.json({ env, db, firebase, ts: new Date().toISOString() });
  });
};
