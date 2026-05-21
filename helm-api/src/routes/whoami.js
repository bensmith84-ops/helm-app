
// GET /whoami — returns the authenticated user's profile (via RLS)
module.exports = function(app, { requireAuth, withAuthedClient }) {
  app.get('/whoami', requireAuth, async (req, res) => {
    try {
      const rows = await withAuthedClient(req.jwtClaims, async (client) => {
        const r = await client.query('SELECT auth.uid() AS uid, auth.email() AS email, auth.role() AS role');
        return r.rows;
      });
      res.json({ firebase_uid: req.firebase.sub, email: req.firebase.email, helm_user: rows[0] });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });
};
