// POST /scoreboard-remap - port of supabase/functions/scoreboard-remap
// When a metric stops syncing because its sheet column was renamed, read the live
// headers, score every candidate against the metric, and return ranked suggestions
// with recent sample values so a human can approve the right one.
//
// POST {}                                        -> suggestions for all stale metrics
// POST { metric_keys: ["nc_gross_profit"] }      -> suggestions for specific metrics
// POST { approve: { metric_key, sheet_header } } -> persist an approved mapping

const { googleToken } = require('../lib/google-jwt');

const SHEET_ID = '1qILvVIq_jLmoPUq7YTErQtaSc0ZQEZj65os1GKQh87A';
const TAB_NAME = 'Earth Breeze Hydrogen';

const norm = (s) => String(s ?? '').replace(/[    ⁠]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
const tokens = (s) => norm(s).replace(/[^a-z0-9 %]/g, ' ').split(/\s+/).filter(Boolean);

function pm(s) {
  if (s === undefined || s === null) return null;
  let c = String(s).trim(); if (!c) return null;
  let neg = false;
  if (/^\(.*\)$/.test(c)) { neg = true; c = c.slice(1, -1); }
  c = c.replace(/[‐-―−]/g, '-').replace(/[$,\s% ]/g, '').trim();
  if (c.endsWith('-')) { neg = true; c = c.slice(0, -1); }
  if (!c || c === '-') return null;
  const n = parseFloat(c);
  if (isNaN(n)) return null;
  return neg ? -Math.abs(n) : n;
}
function pdate(s) {
  if (!s) return null;
  const str = String(s).trim();
  const m = str.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (m) { const y = m[3] ? (m[3].length === 2 ? 2000 + parseInt(m[3]) : parseInt(m[3])) : new Date().getFullYear(); return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`; }
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  return null;
}
const colLetter = (i) => { let n = i + 1, s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

// similarity: token overlap (Jaccard) + substring bonus, 0..1
function score(metricLabel, metricKey, header) {
  const h = norm(header);
  if (!h) return 0;
  const a = new Set([...tokens(metricLabel), ...tokens(metricKey.replace(/_/g, ' '))]);
  const b = new Set(tokens(header));
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of b) if (a.has(t)) inter++;
  const jac = inter / new Set([...a, ...b]).size;
  const nl = norm(metricLabel);
  let bonus = 0;
  if (nl === h) bonus = 0.6;
  else if (nl.includes(h) || h.includes(nl)) bonus = 0.3;
  // strong signal words carry extra weight
  for (const t of b) if (a.has(t) && t.length > 4) bonus += 0.05;
  return Math.min(1, jac + bonus);
}

module.exports = function(app, { pool }) {
  const handler = async (req, res) => {
    try {
      const body = (req.body && typeof req.body === 'object') ? req.body : {};

      // ---- approve a mapping ----
      if (body.approve?.metric_key && body.approve?.sheet_header) {
        await pool.query(
          `INSERT INTO scoreboard_column_map (metric_key, sheet_header, note, approved_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (metric_key) DO UPDATE
             SET sheet_header = EXCLUDED.sheet_header, note = EXCLUDED.note, approved_at = EXCLUDED.approved_at`,
          [body.approve.metric_key, body.approve.sheet_header, body.approve.note ?? null, new Date().toISOString()]
        );
        return res.json({ ok: true, approved: body.approve });
      }

      // ---- which metrics need attention ----
      let { rows: stale } = await pool.query(
        `SELECT metric_key, metric_label, last_date::text AS last_date, days_behind, status, mapped_header
           FROM v_scoreboard_metric_health WHERE status <> 'ok'`
      );
      if (Array.isArray(body.metric_keys) && body.metric_keys.length) {
        stale = stale.filter((m) => body.metric_keys.includes(m.metric_key));
      }
      if (!stale.length) return res.json({ ok: true, stale: [], message: 'No stale metrics.' });

      // ---- read the live sheet ----
      const token = await googleToken('https://www.googleapis.com/auth/spreadsheets.readonly');
      const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(`'${TAB_NAME}'!A1:ZZ400`)}?valueRenderOption=FORMATTED_VALUE`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await r.json();
      if (!data.values) return res.status(500).json({ ok: false, error: 'Could not read sheet', detail: data });
      const rows = data.values;
      const header = rows[0] || [];

      const dateToRow = {};
      for (let i = 1; i < rows.length; i++) { const d = pdate(rows[i][0]); if (d) dateToRow[d] = i; }
      const recentDates = Object.keys(dateToRow).sort().reverse().slice(0, 7);

      // headers already claimed by a healthy metric shouldn't be suggested
      const { rows: healthy } = await pool.query(`SELECT metric_label FROM v_scoreboard_metric_health WHERE status = 'ok'`);
      const healthyLabels = new Set(healthy.map((h) => norm(h.metric_label)));

      const out = stale.map((m) => {
        const cands = header.map((h, i) => ({ i, h })).filter((c) => c.i > 0 && norm(c.h));
        const ranked = cands.map((c) => {
          const vals = recentDates.map((d) => ({ date: d, raw: rows[dateToRow[d]]?.[c.i] ?? null, parsed: pm(rows[dateToRow[d]]?.[c.i]) }));
          const withData = vals.filter((v) => v.parsed !== null).length;
          return {
            header: c.h,
            column: `${colLetter(c.i)} (idx ${c.i})`,
            confidence: Math.round(score(m.metric_label || '', m.metric_key, c.h) * 100),
            has_recent_data: withData > 0,
            recent_days_with_data: withData,
            samples: vals.slice(0, 4),
            already_used_by_healthy_metric: healthyLabels.has(norm(c.h)),
          };
        })
        // a column with no recent data can't be the fix for a stale metric
        .filter((c) => c.confidence >= 15 && !c.already_used_by_healthy_metric)
        .sort((a, b) => (b.has_recent_data ? 1 : 0) - (a.has_recent_data ? 1 : 0) || b.confidence - a.confidence)
        .slice(0, 5);

        const best = ranked[0];
        return {
          metric_key: m.metric_key,
          metric_label: m.metric_label,
          last_date: m.last_date,
          days_behind: m.days_behind,
          status: m.status,
          current_mapping: m.mapped_header,
          diagnosis: m.status === 'source_empty'
            ? 'The column still exists and the sync reads it, but the cells are empty for recent dates. This is a data-entry or upstream-feed problem, not a mapping problem.'
            : 'The sync no longer finds this column - it was most likely renamed or removed. Review the suggestions below.',
          suggestions: ranked,
          recommended: best && best.confidence >= 40 && best.has_recent_data ? best.header : null,
        };
      });

      return res.json({ ok: true, sheet_latest_date: Object.keys(dateToRow).sort().reverse()[0], total_headers: header.length, stale: out });
    } catch (e) {
      return res.status(500).json({ ok: false, error: String(e?.message ?? e) });
    }
  };
  app.post('/scoreboard-remap', handler);
  app.get('/scoreboard-remap', handler);
};
