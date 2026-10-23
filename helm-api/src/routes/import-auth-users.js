// POST /admin/import-auth-users  {dryRun?: true, limit?: n}
//
// Moves Supabase sign-ins into Firebase so nobody has to reset a password.
// Reads the private copy the helm-resync job keeps in _migration
// (supabase_auth_users) plus auth.identities, and calls Firebase importUsers:
//   - uid = Supabase user id (= Helm profile id), so /auth/bind is trivial
//   - bcrypt password hashes imported as-is (Firebase supports BCRYPT)
//   - Google identities attached as google.com provider data
//   - emails that already exist in Firebase are skipped, never overwritten
// Dry run by default: reports what would happen and writes nothing.
// Admin only (auth gate ADMIN list).

const BATCH = 1000;

function toImportRecord(u, googleSubs) {
  const rec = {
    uid: u.id,
    email: u.email,
    emailVerified: !!u.email_confirmed_at,
    displayName: (u.raw_user_meta_data && (u.raw_user_meta_data.full_name || u.raw_user_meta_data.name)) || undefined,
    metadata: {
      creationTime: u.created_at ? new Date(u.created_at).toUTCString() : undefined,
      lastSignInTime: u.last_sign_in_at ? new Date(u.last_sign_in_at).toUTCString() : undefined,
    },
    providerData: [],
  };
  if (u.encrypted_password && /^\$2[aby]\$/.test(u.encrypted_password)) {
    rec.passwordHash = Buffer.from(u.encrypted_password);
  }
  for (const sub of googleSubs || []) {
    rec.providerData.push({ providerId: 'google.com', uid: String(sub), email: u.email, displayName: rec.displayName });
  }
  if (!rec.displayName) delete rec.displayName;
  return rec;
}

module.exports = function (app, { pool, adminAuth }) {
  const auth = adminAuth || (() => require('firebase-admin').auth());
  app.post('/admin/import-auth-users', async (req, res) => {
    const dryRun = req.body?.dryRun !== false;
    const limit = Math.min(parseInt(req.body?.limit, 10) || 100000, 100000);
    try {
      const { rows: users } = await pool.query(
        `SELECT id::text, lower(email) AS email, encrypted_password, email_confirmed_at, last_sign_in_at, created_at, raw_user_meta_data
           FROM _migration.supabase_auth_users WHERE email IS NOT NULL ORDER BY created_at LIMIT $1`, [limit]);
      const { rows: ids } = await pool.query(
        `SELECT user_id::text, provider_id FROM auth.identities WHERE provider = 'google'`).catch(() => ({ rows: [] }));
      const google = new Map();
      for (const r of ids) { if (!google.has(r.user_id)) google.set(r.user_id, []); google.get(r.user_id).push(r.provider_id); }

      const summary = { dryRun, supabase_users: users.length, with_password: 0, with_google: 0, unverified: 0, skipped_existing_email: 0, skipped_existing_uid: 0, to_import: 0, imported: 0, failed: 0, errors: [] };
      const records = [];
      for (let i = 0; i < users.length; i += 50) {
        const chunk = users.slice(i, i + 50); // getUsers takes at most 100 identifiers
        const found = await auth().getUsers([...chunk.map((u) => ({ email: u.email })), ...chunk.map((u) => ({ uid: u.id }))]);
        const emails = new Set(found.users.map((x) => (x.email || '').toLowerCase()));
        const uids = new Set(found.users.map((x) => x.uid));
        for (const u of chunk) {
          if (uids.has(u.id)) { summary.skipped_existing_uid++; continue; }
          if (emails.has(u.email)) { summary.skipped_existing_email++; continue; }
          const rec = toImportRecord(u, google.get(u.id));
          if (rec.passwordHash) summary.with_password++;
          if (rec.providerData.length) summary.with_google++;
          if (!rec.emailVerified) summary.unverified++;
          records.push(rec);
        }
      }
      summary.to_import = records.length;
      if (!dryRun) {
        for (let i = 0; i < records.length; i += BATCH) {
          const r = await auth().importUsers(records.slice(i, i + BATCH), { hash: { algorithm: 'BCRYPT' } });
          summary.imported += r.successCount; summary.failed += r.failureCount;
          for (const e of r.errors.slice(0, 20)) summary.errors.push({ email: records[i + e.index]?.email, error: e.error?.message });
        }
      }
      console.log(JSON.stringify({ event: 'import_auth_users', ...summary, errors: summary.errors.length }));
      res.json(summary);
    } catch (e) {
      console.error('[import-auth-users]', e.message);
      res.status(500).json({ error: e.message });
    }
  });
};
module.exports._internal = { toImportRecord };
