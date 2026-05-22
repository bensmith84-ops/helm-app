
// POST /accept-invite — port of supabase/functions/accept-invite
// Validates invitation token, creates org_membership + team_memberships + channel_memberships.
// Requires authenticated user (req.user.helm_user.uid via Firebase middleware).

module.exports = function(app, { pool, requireAuth }) {
  app.post('/accept-invite', requireAuth, async (req, res) => {
    try {
      const userId = req.user?.helm_user?.uid;
      if (!userId) return res.status(401).json({ success: false, error: 'Unauthorized' });

      const { token } = req.body || {};
      if (!token) return res.status(400).json({ success: false, error: 'token is required' });

      const { rows: invRows } = await pool.query(
        `SELECT * FROM invitations WHERE token = $1 AND status = 'pending' LIMIT 1`,
        [token]
      );
      const invitation = invRows[0];
      if (!invitation) return res.status(400).json({ success: false, error: 'Invalid or expired invitation' });

      if (new Date(invitation.expires_at) < new Date()) {
        await pool.query(`UPDATE invitations SET status = 'expired' WHERE id = $1`, [invitation.id]);
        return res.status(400).json({ success: false, error: 'Invitation has expired' });
      }

      // Create / activate org membership
      await pool.query(
        `INSERT INTO org_memberships (org_id, user_id, role, is_active, deactivated_at)
         VALUES ($1, $2, $3, true, NULL)
         ON CONFLICT (org_id, user_id) DO UPDATE
         SET role = EXCLUDED.role, is_active = true, deactivated_at = NULL`,
        [invitation.org_id, userId, invitation.role]
      );

      // Team memberships
      if (Array.isArray(invitation.team_ids) && invitation.team_ids.length > 0) {
        for (const teamId of invitation.team_ids) {
          await pool.query(
            `INSERT INTO team_memberships (team_id, user_id) VALUES ($1, $2)
             ON CONFLICT (team_id, user_id) DO NOTHING`,
            [teamId, userId]
          );
        }
      }

      // Auto-join public channels
      const { rows: chRows } = await pool.query(
        `SELECT id FROM channels
         WHERE org_id = $1 AND channel_type = 'public' AND is_archived = false`,
        [invitation.org_id]
      );
      for (const ch of chRows) {
        await pool.query(
          `INSERT INTO channel_memberships (channel_id, user_id) VALUES ($1, $2)
           ON CONFLICT (channel_id, user_id) DO NOTHING`,
          [ch.id, userId]
        );
      }

      await pool.query(
        `UPDATE invitations SET status = 'accepted', accepted_at = NOW() WHERE id = $1`,
        [invitation.id]
      );

      await pool.query(
        `INSERT INTO iam_audit_log (org_id, actor_id, action, target_user_id, details)
         VALUES ($1, $2, 'user.accepted_invite', $2, $3)`,
        [invitation.org_id, userId, JSON.stringify({ invitation_id: invitation.id, role: invitation.role })]
      );

      res.json({
        success: true,
        org_id: invitation.org_id,
        role: invitation.role,
        message: 'Successfully joined the organization.',
      });
    } catch (err) {
      res.status(400).json({ success: false, error: err?.message || String(err) });
    }
  });
};
