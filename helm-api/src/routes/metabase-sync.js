// POST /metabase-sync — STUB ROUTE
//
// The EDM warehouse (Metabase) was decommissioned 2025-06-01. The Scoreboard
// component still tries to sync chunks via this endpoint when the user clicks
// the manual "sync" button, producing a 404 flood. This stub returns 410 Gone
// with a clear message so the frontend can stop hammering it.
//
// In Stage 4n cleanup, the Scoreboard sync button will be removed entirely
// and this stub deleted along with it.

module.exports = (app) => {
  const handler = (req, res) => {
    return res.status(410).json({
      error: 'metabase_decommissioned',
      message: 'Metabase EDM warehouse was decommissioned 2025-06. Use Cloud SQL data directly.',
      decommissioned: true,
      decommissioned_at: '2025-06-01'
    });
  };
  app.post('/metabase-sync', handler);
  app.get('/metabase-sync', handler);
};
