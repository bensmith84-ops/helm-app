
module.exports = function(app, { requireAuth }) {
  app.post('/ai-deploy', requireAuth, async (_req, res) => {
    res.status(501).json({ error: 'not_implemented', note: 'Port pending' });
  });
};
