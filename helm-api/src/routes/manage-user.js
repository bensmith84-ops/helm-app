
// POST /manage-user?action=change-role|deactivate|reactivate
// Port of supabase/functions/manage-user. Pure DB hierarchy enforcement.
const roleLevel = { owner: 5, admin: 4, manager: 3, member: 2, guest: 1 };

module.exports = function(app, { pool, requireAuth }) {
  app.post('/manage-user', requireAuth, async (req, res) => {
    try {
      const userId = req.user?.helm_user?.uid;
      if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

      const action = req.query.action;
      const body = req.body || {};
      const { org_id, target_user_id } = body;
      if (!org_id || !target_user_id) {
        return res.status(400).json({ success: false, error: 'org_id and target_user_id are required' });
      }

      const { rows: callerRows } = await pool.query(
        `SELECT role FROM org_memberships WHERE user_id = $1 AND org_id = $2 AND is_active = true LIMIT 1`,
        [userId, org_id]
      );
      const callerMem = callerRows[0];
      if (!callerMem) return res.status(400).json({ success: false, error: 'You are not a member of this org' });

      const { rows: targetRows } = await pool.query(
        `SELECT id, role, is_active FROM org_memberships WHERE user_id = $1 AND org_id = $2 LIMIT 1`,
        [target_user_id, org_id]
      );
      const targetMem = targetRows[0];
      if (!targetMem) return res.status(400).json({ success: false, error: 'Target user not found in this org' });

      if (callerMem.role !== 'owner' && (roleLevel[targetMem.role] || 0) >= (roleLevel[callerMem.role] || 0)) {
        return res.status(400).json({ success: false, error: 'Cannot modify a user with equal or higher role than your own' });
      }
      if (userId === target_user_id && action !== 'reactivate') {
        return res.status(400).json({ success: false, error: 'Cannot modify your own account. Ask another admin.' });
      }

      let result = {};

      if (action === 'change-role') {
        const { new_role } = body;
        if (!new_role || !roleLevel[new_role]) return res.status(400).json({ success: false, error: 'Invalid role' });
        if (new_role === 'owner' && callerMem.role !== 'owner') return res.status(400).json({ success: false, error: 'Only owners can promote to owner' });
        if ((roleLevel[new_role] || 0) > (roleLevel[callerMem.role] || 0)) {
          return res.status(400).json({ success: false, error: 'Cannot assign a role higher than your own' });
        }
        await pool.query(
          `UPDATE org_memberships SET role = $1 WHERE user_id = $2 AND org_id = $3`,
          [new_role, target_user_id, org_id]
        );
        await pool.query(
          `INSERT INTO iam_audit_log (org_id, actor_id, action, target_user_id, details)
           VALUES ($1, $2, 'user.role_changed', $3, $4)`,
          [org_id, userId, target_user_id, JSON.stringify({ previous_role: targetMem.role, new_role })]
        );
        result = { message: `Role changed from ${targetMem.role} to ${new_role}`, previous_role: targetMem.role, new_role };
      } else if (action === 'deactivate') {
        if ((roleLevel[callerMem.role] || 0) < 4) return res.status(400).json({ success: false, error: 'Only admins and owners can deactivate users' });
        if (targetMem.role === 'owner' && callerMem.role !== 'owner') return res.status(400).json({ success: false, error: 'Cannot deactivate an owner' });

        await pool.query(
          `UPDATE org_memberships SET is_active = false, deactivated_at = NOW() WHERE user_id = $1 AND org_id = $2`,
          [target_user_id, org_id]
        );
        await pool.query(
          `DELETE FROM team_memberships WHERE user_id = $1
           AND team_id IN (SELECT id FROM teams WHERE org_id = $2)`,
          [target_user_id, org_id]
        );
        await pool.query(
          `DELETE FROM channel_memberships WHERE user_id = $1
           AND channel_id IN (SELECT id FROM channels WHERE org_id = $2)`,
          [target_user_id, org_id]
        );
        await pool.query(
          `UPDATE tasks SET assignee_id = NULL
           WHERE assignee_id = $1 AND org_id = $2 AND deleted_at IS NULL`,
          [target_user_id, org_id]
        );
        await pool.query(
          `INSERT INTO iam_audit_log (org_id, actor_id, action, target_user_id, details)
           VALUES ($1, $2, 'user.deactivated', $3, $4)`,
          [org_id, userId, target_user_id, JSON.stringify({ previous_role: targetMem.role })]
        );
        result = { message: 'User deactivated, removed from all teams/channels, tasks unassigned' };
      } else if (action === 'reactivate') {
        if ((roleLevel[callerMem.role] || 0) < 4) return res.status(400).json({ success: false, error: 'Only admins and owners can reactivate users' });
        if (targetMem.is_active) return res.status(400).json({ success: false, error: 'User is already active' });

        await pool.query(
          `UPDATE org_memberships SET is_active = true, deactivated_at = NULL, role = 'member' WHERE user_id = $1 AND org_id = $2`,
          [target_user_id, org_id]
        );
        const { rows: chRows } = await pool.query(
          `SELECT id FROM channels WHERE org_id = $1 AND channel_type = 'public' AND is_archived = false`,
          [org_id]
        );
        for (const ch of chRows) {
          await pool.query(
            `INSERT INTO channel_memberships (channel_id, user_id) VALUES ($1, $2)
             ON CONFLICT (channel_id, user_id) DO NOTHING`,
            [ch.id, target_user_id]
          );
        }
        await pool.query(
          `INSERT INTO iam_audit_log (org_id, actor_id, action, target_user_id, details)
           VALUES ($1, $2, 'user.reactivated', $3, '{}'::jsonb)`,
          [org_id, userId, target_user_id]
        );
        result = { message: 'User reactivated as member, re-joined public channels' };
      } else {
        return res.status(400).json({ success: false, error: 'Invalid action. Use ?action=change-role|deactivate|reactivate' });
      }

      res.json({ success: true, ...result });
    } catch (err) {
      res.status(400).json({ success: false, error: err?.message || String(err) });
    }
  });
};
