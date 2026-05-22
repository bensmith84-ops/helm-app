
// POST /invite-external-collaborator — port of supabase/functions/invite-external-collaborator
// 3 actions: remove (delete project_members row), update (role/access_scope), invite (default).
// Uses Firebase Admin SDK for new user creation.

const APP_URL = process.env.APP_URL || 'https://helm-app-six.vercel.app';
const DEFAULT_ORG = 'a0000000-0000-0000-0000-000000000001';

module.exports = function(app, { pool, admin }) {
  app.post('/invite-external-collaborator', async (req, res) => {
    try {
      const body = req.body || {};
      const {
        email, display_name, project_id,
        role = 'viewer',
        access_scope = { tasks: true, documents: false, messages: false, module_data: false },
        invited_by,
        org_id = DEFAULT_ORG,
        action, member_id,
      } = body;

      // REMOVE
      if (action === 'remove' && member_id) {
        try {
          await pool.query(`DELETE FROM project_members WHERE id = $1`, [member_id]);
          return res.json({ success: true, message: 'Member removed' });
        } catch (e) { return res.status(400).json({ error: e?.message }); }
      }

      // UPDATE
      if (action === 'update' && member_id) {
        const updates = [];
        const params = [];
        let pi = 1;
        if (role) { updates.push(`role = $${pi++}`); params.push(role); }
        if (access_scope) { updates.push(`access_scope = $${pi++}`); params.push(JSON.stringify(access_scope)); }
        if (!updates.length) return res.json({ success: true });
        params.push(member_id);
        try {
          await pool.query(
            `UPDATE project_members SET ${updates.join(', ')} WHERE id = $${pi}`,
            params
          );
          return res.json({ success: true, message: 'Member updated' });
        } catch (e) { return res.status(400).json({ error: e?.message }); }
      }

      // INVITE (default)
      if (!email || !project_id) {
        return res.status(400).json({ error: 'email and project_id required' });
      }
      if (!admin) return res.status(500).json({ error: 'Firebase Admin SDK not initialized' });

      // Check if user exists
      let existingFb = null;
      try { existingFb = await admin.auth().getUserByEmail(email); } catch {}

      let userId = null;
      let isExisting = false;
      let alreadyInternal = false;

      if (existingFb) {
        isExisting = true;
        // Find Helm UUID from firebase_uid
        const { rows: pr } = await pool.query(
          `SELECT id FROM profiles WHERE firebase_uid = $1 LIMIT 1`, [existingFb.uid]
        );
        userId = pr[0]?.id || existingFb.uid;

        const { rows: omRows } = await pool.query(
          `SELECT user_id FROM org_memberships WHERE user_id = $1 LIMIT 1`, [userId]
        );
        if (omRows[0]) alreadyInternal = true;
      } else {
        // Create new Firebase user
        let newFb;
        try {
          newFb = await admin.auth().createUser({
            email,
            displayName: display_name || email.split('@')[0],
            emailVerified: false,
          });
        } catch (e) { return res.status(400).json({ error: e?.message }); }
        userId = newFb.uid;

        await pool.query(
          `INSERT INTO profiles (id, display_name, email, org_id, is_external, firebase_uid)
           VALUES ($1, $2, $3, NULL, true, $4)
           ON CONFLICT (id) DO UPDATE
           SET display_name = EXCLUDED.display_name, email = EXCLUDED.email,
               is_external = true, firebase_uid = EXCLUDED.firebase_uid`,
          [userId, display_name || email.split('@')[0], email, newFb.uid]
        );

        // Generate sign-in link the caller can email
        try {
          await admin.auth().generateEmailVerificationLink(email, { url: APP_URL });
        } catch {}
      }

      if (!userId) return res.status(500).json({ error: 'Could not resolve user id' });

      // Upsert project_members
      const { rows: existing } = await pool.query(
        `SELECT id FROM project_members WHERE project_id = $1 AND user_id = $2 LIMIT 1`,
        [project_id, userId]
      );

      if (existing[0]) {
        try {
          await pool.query(
            `UPDATE project_members SET role = $1, access_scope = $2 WHERE id = $3`,
            [role, JSON.stringify(access_scope), existing[0].id]
          );
          return res.json({
            success: true, message: 'Member updated',
            user_id: userId, member_id: existing[0].id, already_member: true,
          });
        } catch (e) { return res.status(400).json({ error: e?.message }); }
      }

      try {
        const { rows: newRows } = await pool.query(
          `INSERT INTO project_members
            (org_id, project_id, user_id, role, access_scope, invited_as_external, invited_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
          [org_id, project_id, userId, role, JSON.stringify(access_scope),
           !alreadyInternal, invited_by || null]
        );

        return res.json({
          success: true,
          user_id: userId, member_id: newRows[0].id,
          already_internal: alreadyInternal,
          existing_user: isExisting,
          message: alreadyInternal
            ? `${email} is an existing team member — added to project`
            : isExisting
              ? `${email} already has an account — added to project`
              : `Invite sent to ${email}`,
        });
      } catch (e) { return res.status(400).json({ error: e?.message }); }
    } catch (e) {
      console.error('[invite-external-collab] Exception:', e?.message);
      res.status(500).json({ error: e?.message || String(e) });
    }
  });
};
