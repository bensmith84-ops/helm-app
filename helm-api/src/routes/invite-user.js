
// POST /invite-user — port of supabase/functions/invite-user
// Uses Firebase Admin SDK to create users and generate sign-in links.
// Replaces supabase.auth.admin.{listUsers, inviteUserByEmail, deleteUser, updateUserById, resetPasswordForEmail}.
// Note: requires Firebase Admin SDK init (admin) and profiles.firebase_uid mapping.

const APP_URL = 'https://helm-app-six.vercel.app';
const ORG_DEFAULT = 'a0000000-0000-0000-0000-000000000001';
const DEFAULT_DENY_PERMS = { _default_deny: true };

async function ensureMembership(pool, orgId, userId, role, initialPerms) {
  const { rows: existing } = await pool.query(
    `SELECT id, module_permissions FROM org_memberships
     WHERE org_id = $1 AND user_id = $2 LIMIT 1`,
    [orgId, userId]
  );
  if (existing[0]) {
    const isEmpty = !existing[0].module_permissions || Object.keys(existing[0].module_permissions).length === 0;
    if (isEmpty) {
      await pool.query(
        `UPDATE org_memberships SET role = $1, is_active = true, module_permissions = $2 WHERE id = $3`,
        [role || 'member', JSON.stringify(initialPerms), existing[0].id]
      );
    } else {
      await pool.query(
        `UPDATE org_memberships SET role = $1, is_active = true WHERE id = $2`,
        [role || 'member', existing[0].id]
      );
    }
  } else {
    await pool.query(
      `INSERT INTO org_memberships (org_id, user_id, role, is_active, module_permissions)
       VALUES ($1, $2, $3, true, $4)`,
      [orgId, userId, role || 'member', JSON.stringify(initialPerms)]
    );
  }
}

module.exports = function(app, { pool, admin }) {
  app.post('/invite-user', async (req, res) => {
    try {
      const { email, display_name, role, org_id, resend, action, user_id, module_permissions } = req.body || {};
      const orgId = org_id || ORG_DEFAULT;
      const initialPerms = module_permissions && Object.keys(module_permissions).length > 0
        ? module_permissions : DEFAULT_DENY_PERMS;

      // UPDATE EMAIL
      if (action === 'update_email' && user_id && email) {
        // user_id here is Helm UUID; need firebase_uid to update Firebase auth
        const { rows } = await pool.query(`SELECT firebase_uid FROM profiles WHERE id = $1 LIMIT 1`, [user_id]);
        if (admin && rows[0]?.firebase_uid) {
          try { await admin.auth().updateUser(rows[0].firebase_uid, { email }); }
          catch (e) { return res.status(400).json({ error: e?.message }); }
        }
        await pool.query(`UPDATE profiles SET email = $1 WHERE id = $2`, [email, user_id]);
        return res.json({ success: true, message: 'Email updated' });
      }

      // DELETE
      if (action === 'delete' && user_id) {
        await pool.query(`DELETE FROM org_memberships WHERE user_id = $1`, [user_id]);
        const { rows } = await pool.query(`SELECT firebase_uid FROM profiles WHERE id = $1 LIMIT 1`, [user_id]);
        await pool.query(`DELETE FROM profiles WHERE id = $1`, [user_id]);
        if (admin && rows[0]?.firebase_uid) {
          try { await admin.auth().deleteUser(rows[0].firebase_uid); }
          catch (e) { console.error('[invite-user] Firebase delete:', e?.message); }
        }
        return res.json({ success: true, message: 'User deleted' });
      }

      if (!email) return res.status(400).json({ error: 'Email required' });
      if (!admin) return res.status(500).json({ error: 'Firebase Admin SDK not initialized' });

      // Look up existing Firebase user
      let existingFbUser = null;
      try {
        existingFbUser = await admin.auth().getUserByEmail(email);
      } catch {} // user-not-found is fine

      // Look up existing profile
      const { rows: profRows } = await pool.query(
        `SELECT id, firebase_uid FROM profiles WHERE email = $1 AND org_id = $2 LIMIT 1`,
        [email, orgId]
      );
      const existingProfile = profRows[0];

      // CASE 1: Firebase user exists + not resending — ensure profile + membership
      if (existingFbUser && !resend) {
        const helmId = existingProfile?.id || existingFbUser.uid;
        await pool.query(
          `INSERT INTO profiles (id, display_name, email, org_id, firebase_uid)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (id) DO UPDATE
           SET display_name = EXCLUDED.display_name, email = EXCLUDED.email,
               org_id = EXCLUDED.org_id, firebase_uid = EXCLUDED.firebase_uid`,
          [helmId, display_name || email.split('@')[0], email, orgId, existingFbUser.uid]
        );
        await ensureMembership(pool, orgId, helmId, role, initialPerms);
        return res.json({ success: true, message: 'User already exists', user_id: helmId, existing: true });
      }

      // CASE 2: Firebase user exists + resend
      if (existingFbUser && resend) {
        if (!existingFbUser.emailVerified) {
          // Re-send verification link
          try {
            const link = await admin.auth().generateEmailVerificationLink(email, { url: APP_URL });
            // (Caller should mail this; we don't have an email sender wired up to Firebase here)
            return res.json({
              success: true, user_id: existingProfile?.id || existingFbUser.uid,
              message: `Verification link generated for ${email}`,
              resent: true, verification_link: link,
            });
          } catch (e) { return res.status(400).json({ error: e?.message }); }
        }
        try {
          const link = await admin.auth().generatePasswordResetLink(email, { url: APP_URL });
          return res.json({
            success: true, user_id: existingProfile?.id || existingFbUser.uid,
            message: `Password reset link generated for ${email}`,
            resent: true, reset_link: link,
          });
        } catch (e) { return res.status(400).json({ error: e?.message }); }
      }

      // CASE 3: No Firebase user — create + generate sign-in link
      let newFbUser;
      try {
        newFbUser = await admin.auth().createUser({
          email,
          displayName: display_name || email.split('@')[0],
          emailVerified: false,
        });
      } catch (e) {
        return res.status(400).json({ error: e?.message });
      }

      // Generate sign-in (or verification) link the caller can email out
      let signInLink = null;
      try {
        signInLink = await admin.auth().generateEmailVerificationLink(email, { url: APP_URL });
      } catch {}

      const helmId = existingProfile?.id || newFbUser.uid;
      await pool.query(
        `INSERT INTO profiles (id, display_name, email, org_id, firebase_uid)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE
         SET display_name = EXCLUDED.display_name, email = EXCLUDED.email,
             org_id = EXCLUDED.org_id, firebase_uid = EXCLUDED.firebase_uid`,
        [helmId, display_name || email.split('@')[0], email, orgId, newFbUser.uid]
      );
      await ensureMembership(pool, orgId, helmId, role, initialPerms);

      res.json({
        success: true, user_id: helmId,
        message: `Invite created for ${email}`,
        verification_link: signInLink,
      });
    } catch (e) {
      console.error('[invite-user] Exception:', e?.message);
      res.status(500).json({ error: e?.message || String(e) });
    }
  });
};
