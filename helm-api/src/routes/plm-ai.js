
module.exports = function(app, { requireAuth }) {
  app.post('/plm-ai', requireAuth, async (_req, res) => {
    res.status(501).json({ error: 'not_implemented', note: 'Port pending' });
  });
};
