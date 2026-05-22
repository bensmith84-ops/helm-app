
// POST /sheets-sync — port of supabase/functions/sheets-sync
// Monthly P&L roll-up. Detects year boundaries (months reset Dec → Jan).
// Upserts okr_financial_metrics + okr_financial_monthly.
const { getGoogleAccessToken, loadServiceAccount } = require('../lib/google-jwt');

const SHEET_ID = '1qILvVIq_jLmoPUq7YTErQtaSc0ZQEZj65os1GKQh87A';
const TAB_NAME = 'Earth Breeze Hydrogen';

const COL_DATE    = 0;
const COL_REVENUE = 1;
const COL_ADSPEND = 3;
const COL_NET     = 162;

const MONTH_NAMES = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
};

function parseMoney(s) {
  if (!s) return null;
  const cleaned = String(s).replace(/[$,\s]/g, '');
  if (!cleaned || cleaned === '-') return null;
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

module.exports = function(app, { pool }) {
  app.post('/sheets-sync', async (req, res) => {
    try {
      const sa = loadServiceAccount();
      const token = await getGoogleAccessToken(sa);

      const range = encodeURIComponent(`'${TAB_NAME}'!A1:FG200`);
      const r = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${range}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: data });

      const rows = data.values || [];
      const currentYear = new Date().getFullYear();

      const monthRows = [];
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const cellA = (row[COL_DATE] || '').trim().toLowerCase();
        const monthNum = MONTH_NAMES[cellA];
        if (!monthNum) continue;
        monthRows.push({
          monthNum, rowIdx: i,
          revenue: parseMoney(row[COL_REVENUE]),
          adspend: parseMoney(row[COL_ADSPEND]),
          net:     parseMoney(row[COL_NET]),
        });
      }

      // Walk backwards, decrement year on month-rollover (cur > next means year boundary)
      const monthlyData = [];
      let assignedYear = currentYear;
      for (let i = monthRows.length - 1; i >= 0; i--) {
        const cur = monthRows[i];
        const next = i < monthRows.length - 1 ? monthRows[i + 1] : null;
        if (next && cur.monthNum > next.monthNum) assignedYear--;
        monthlyData.unshift({
          month: cur.monthNum, year: assignedYear,
          revenue: cur.revenue, adspend: cur.adspend, net: cur.net,
        });
      }

      if (!monthlyData.length) return res.json({ message: 'No monthly summary rows found' });

      const metricDefs = [
        { metric_key: 'revenue',     metric_label: 'Revenue',  unit: '$', sort_order: 0 },
        { metric_key: 'net_dollars', metric_label: 'Net $',    unit: '$', sort_order: 1 },
        { metric_key: 'adspend',     metric_label: 'Ad Spend', unit: '$', sort_order: 2 },
      ];

      const years = [...new Set(monthlyData.map(d => d.year))];
      const metricIdMap = {};

      for (const year of years) {
        for (const def of metricDefs) {
          // Check if metric exists for this year
          const { rows: existing } = await pool.query(
            `SELECT id FROM okr_financial_metrics WHERE year = $1 AND metric_key = $2 LIMIT 1`,
            [year, def.metric_key]
          );
          let metricId;
          if (existing[0]) {
            metricId = existing[0].id;
          } else {
            const { rows: created } = await pool.query(
              `INSERT INTO okr_financial_metrics (metric_key, metric_label, unit, sort_order, year)
               VALUES ($1, $2, $3, $4, $5) RETURNING id`,
              [def.metric_key, def.metric_label, def.unit, def.sort_order, year]
            );
            metricId = created[0].id;
          }
          if (!metricIdMap[def.metric_key]) metricIdMap[def.metric_key] = {};
          metricIdMap[def.metric_key][year] = metricId;
        }
      }

      const upsertRows = [];
      for (const d of monthlyData) {
        const revId = metricIdMap['revenue']?.[d.year];
        const netId = metricIdMap['net_dollars']?.[d.year];
        const adsId = metricIdMap['adspend']?.[d.year];
        if (revId && d.revenue !== null) upsertRows.push([revId, d.year, d.month, d.revenue]);
        if (netId && d.net !== null) upsertRows.push([netId, d.year, d.month, d.net]);
        if (adsId && d.adspend !== null) upsertRows.push([adsId, d.year, d.month, d.adspend]);
      }

      for (let i = 0; i < upsertRows.length; i += 100) {
        const batch = upsertRows.slice(i, i + 100);
        const values = [];
        const params = [];
        let pi = 1;
        for (const r of batch) {
          values.push(`($${pi++}, $${pi++}, $${pi++}, $${pi++})`);
          params.push(...r);
        }
        await pool.query(
          `INSERT INTO okr_financial_monthly (metric_id, year, month, actual)
           VALUES ${values.join(', ')}
           ON CONFLICT (metric_id, year, month) DO UPDATE SET actual = EXCLUDED.actual`,
          params
        );
      }

      res.json({
        success: true,
        monthsProcessed: monthlyData.length,
        rowsUpserted: upsertRows.length,
        years, data: monthlyData,
      });
    } catch (e) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });
};
