
// GET /sheets-preview — port of supabase/functions/sheets-preview
// Returns header row inspection from the financial scoreboard sheet.
const { getGoogleAccessToken, loadServiceAccount } = require('../lib/google-jwt');

const SHEET_ID = '1qILvVIq_jLmoPUq7YTErQtaSc0ZQEZj65os1GKQh87A';
const TAB_NAME = 'Earth Breeze Hydrogen';

function colLetter(i) {
  let s = '';
  let n = i + 1;
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

module.exports = function(app) {
  // Original was GET-style (no body needed); accept both
  const handler = async (req, res) => {
    try {
      const sa = loadServiceAccount();
      const token = await getGoogleAccessToken(sa);
      const range = encodeURIComponent(`'${TAB_NAME}'!A1:FJ1`);
      const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: data });
      const headers = (data.values?.[0] || [])
        .map((h, i) => ({ col: colLetter(i), index: i, header: h }))
        .filter(h => (h.header || '').trim() !== '');
      res.json({ totalCols: headers.length, headers });
    } catch (e) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  };
  app.get('/sheets-preview', handler);
  app.post('/sheets-preview', handler);
};
