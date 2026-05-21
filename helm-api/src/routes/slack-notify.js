
// POST /slack-notify — stub placeholder, will be filled in next commit
module.exports = function(app, { requireAuth }) {
  app.post('/slack-notify', requireAuth, async (_req, res) => {
    res.status(501).json({ error: 'not_implemented', note: 'Port pending — see helm-api/PORTING_GUIDE.md' });
  });
};
