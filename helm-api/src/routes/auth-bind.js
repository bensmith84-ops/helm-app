
// POST /auth/bind — bind a Firebase UID to an existing Helm profile by email.
// Called by the frontend immediately after a user's first Firebase sign-in.
//
// Flow:
//   1. Verify Firebase ID token (req.user populated by requireAuth)
//   2. If profiles.firebase_uid already set → return existing profile
//   3. If a profile with matching email exists but firebase_uid IS NULL → backfill
//   4. If no profile exists with that email → return 403 (user not in Helm)
//
// This makes new-user onboarding zero-friction: any earthbreeze.com employee with
// a profile in Helm can sign in via Google and be immediately recognized.

module.exports = function(app, { pool, requireAuth }) {
  app.post('/auth/bind', requireAuth, async (req, res) => {
    try {
      const { firebase_uid, email } = req.user;
      if (!firebase_uid || !email) {
        return res.status(400).json({ error: 'Token missing firebase_uid or email' });
      }

      // 1. Check if already bound
      const existing = await pool.query(
        `SELECT id, email, role, display_name, firebase_uid, org_id, active_org_id
           FROM profiles WHERE firebase_uid = $1 LIMIT 1`,
        [firebase_uid]
      );
      if (existing.rows.length) {
        return res.json({ bound: false, action: 'already_bound', profile: existing.rows[0] });
      }

      // 2. Look up by email (case-insensitive)
      const byEmail = await pool.query(
        `SELECT id, email, role, display_name, firebase_uid, org_id, active_org_id
           FROM profiles
          WHERE LOWER(email) = LOWER($1)
          LIMIT 1`,
        [email]
      );
      if (!byEmail.rows.length) {
        return res.status(403).json({
          error: 'No Helm profile exists for this email',
          email,
          hint: 'Ask an admin to provision your account first',
        });
      }

      const profile = byEmail.rows[0];

      // 3. If firebase_uid already set to a DIFFERENT uid → conflict
      if (profile.firebase_uid && profile.firebase_uid !== firebase_uid) {
        return res.status(409).json({
          error: 'Profile is already bound to a different Firebase UID',
          email,
          existing_uid_prefix: profile.firebase_uid.slice(0, 6) + '…',
        });
      }

      // 4. Backfill
      const upd = await pool.query(
        `UPDATE profiles SET firebase_uid = $1, updated_at = NOW()
          WHERE id = $2 AND firebase_uid IS NULL
        RETURNING id, email, role, display_name, firebase_uid, org_id, active_org_id`,
        [firebase_uid, profile.id]
      );

      if (!upd.rows.length) {
        // Race: someone else bound between our SELECT and UPDATE. Reread.
        const refetch = await pool.query(
          `SELECT id, email, role, display_name, firebase_uid, org_id, active_org_id
             FROM profiles WHERE id = $1`,
          [profile.id]
        );
        return res.json({ bound: false, action: 'race_lost', profile: refetch.rows[0] });
      }

      console.log(`[auth/bind] bound ${email} → ${firebase_uid.slice(0, 8)}…`);
      res.json({ bound: true, action: 'backfilled', profile: upd.rows[0] });
    } catch (e) {
      console.error('[auth/bind] error:', e?.message);
      res.status(500).json({ error: e?.message || String(e) });
    }
  });

  // GET /auth/migration-status — admin-friendly summary of pending migrations
  app.get('/auth/migration-status', requireAuth, async (req, res) => {
    try {
      // Only org admins should see this
      const meRow = await pool.query(
        `SELECT role FROM profiles WHERE firebase_uid = $1 LIMIT 1`,
        [req.user.firebase_uid]
      );
      if (!meRow.rows.length || !['admin','owner'].includes(meRow.rows[0].role)) {
        return res.status(403).json({ error: 'Admin only' });
      }

      const r = await pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE firebase_uid IS NOT NULL) AS migrated,
          COUNT(*) FILTER (WHERE firebase_uid IS NULL) AS pending,
          COUNT(*) AS total,
          COUNT(*) FILTER (WHERE firebase_uid IS NULL AND email LIKE '%@earthbreeze.com') AS pending_employees
        FROM profiles
        WHERE email IS NOT NULL AND COALESCE(is_external, false) = false
      `);
      res.json(r.rows[0]);
    } catch (e) {
      res.status(500).json({ error: e?.message });
    }
  });
};
