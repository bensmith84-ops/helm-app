
// /sheets-explore — port of supabase/functions/sheets-explore
// Debug: returns row 1 (headers) + first 6 rows of first 26 columns.
const { getGoogleAccessToken, loadServiceAccount } = require('../lib/google-jwt');

const SHEET_ID = '1qILvVIq_jLmoPUq7YTErQtaSc0ZQEZj65os1GKQh87A';
const TAB_NAME = 'Earth Breeze Hydrogen';

module.exports = function(app) {
  const handler = async (req, res) => {
    try {
      const sa = loadServiceAccount();
      const token = await getGoogleAccessToken(sa);

      const r1 = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(`'${TAB_NAME}'!1:1`)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const d1 = await r1.json();
      const headers = d1.values?.[0] || [];

      const r2 = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(`'${TAB_NAME}'!A1:Z6`)}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const d2 = await r2.json();

      res.json({
        total_columns: headers.length,
        all_column_headers: headers
          .map((h, i) => ({ col: i + 1, header: h }))
          .filter(h => h.header),
        first6rows_first26cols: d2.values,
      });
    } catch (e) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  };
  app.get('/sheets-explore', handler);
  app.post('/sheets-explore', handler);
};
