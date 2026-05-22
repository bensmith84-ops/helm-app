
// POST /remove-user — port of supabase/functions/remove-user
// Calls remove_user_cascade Postgres fn + Firebase Admin auth.deleteUser.
// Requires Firebase Admin SDK initialized in src/index.js.

module.exports = function(app, { pool, admin }) {
  app.post('/remove-user', async (req, res) => {
    try {
      const { user_id } = req.body || {};
      if (!user_id) return res.status(400).json({ error: 'user_id required' });

      // Cascade DB cleanup
      try {
        await pool.query(`SELECT remove_user_cascade($1)`, [user_id]);
      } catch (rpcErr) {
        return res.status(500).json({ error: rpcErr?.message });
      }

      // Find firebase_uid for this user_id
      const { rows: profRows } = await pool.query(
        `SELECT firebase_uid FROM profiles WHERE id = $1 LIMIT 1`,
        [user_id]
      );
      const firebaseUid = profRows[0]?.firebase_uid;

      // Delete the Firebase auth user too (if mapped)
      if (firebaseUid && admin) {
        try {
          await admin.auth().deleteUser(firebaseUid);
        } catch (authErr) {
          console.error('[remove-user] Firebase auth delete error:', authErr?.message);
        }
      }

      res.json({ success: true, user_id });
    } catch (e) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });
};
