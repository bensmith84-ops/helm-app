
// POST /sheets-daily-sync - port of supabase/functions/sheets-daily-sync (v31)
// Daily scoreboard pull. METRIC_MAP defines header → metric_key mapping;
// approved overrides in scoreboard_column_map (metric_key → sheet_header) are
// consulted first, so a renamed column can be re-pointed without a deploy.
// COMPOSITES roll up multi-column metrics (gwp_cpa, sub_rate, etc.).
// Calls upsert_scoreboard_daily(rows jsonb).
// Google auth: keyless googleToken() (Cloud Run service account).
const { googleToken } = require('../lib/google-jwt');

const SHEET_ID = '1qILvVIq_jLmoPUq7YTErQtaSc0ZQEZj65os1GKQh87A';
const TAB_NAME = 'Earth Breeze Hydrogen';
// Read a wide column range: the sheet is ~558 columns and key metrics (e.g. "Net $"
// at column GI/191) live past FZ. ZZ (702) gives headroom for future column shifts.
const READ_RANGE = 'A1:ZZ400';

function normalize(s) {
  return String(s)
    .replace(/[\u00a0\u2009\u200a\u202f\u2060]/g, ' ')
    .replace(/\s+/g, ' ').trim().toLowerCase();
}

const METRIC_MAP = [
  { norm: 'total revenue', key: 'revenue', label: 'Revenue' },
  { norm: 'comp yago', key: 'comp_yago', label: 'COMP YAGO' },
  { norm: 'total adspend', key: 'ad_spend', label: 'Ad Spend' },
  { norm: 'net $', key: 'net_dollars', label: 'Net $' },
  { norm: 'roas', key: 'roas', label: 'ROAS' },
  { norm: 'opex % rev', key: 'opex_pct_rev', label: 'OPEX % REV' },
  { norm: 'shopify revenue', key: 'shopify_revenue', label: 'Shopify Revenue' },
  { norm: 'hydrogen total sales', key: 'hydrogen_total_sales', label: 'Hydrogen Total Sales' },
  { norm: 'hydrogen gross sales', key: 'hydrogen_gross_sales', label: 'Hydrogen Gross Sales' },
  { norm: 'hydrogen discounts', key: 'hydrogen_discounts', label: 'Hydrogen Discounts' },
  { norm: 'hydrogen tax', key: 'hydrogen_tax', label: 'Hydrogen Tax' },
  { norm: 'hydrogen total returns', key: 'hydrogen_returns', label: 'Hydrogen Returns' },
  { norm: 'hydrogen voided returns', key: 'hydrogen_voided_returns', label: 'Hydrogen Voided Returns' },
  { norm: 'tryeb total sales', key: 'tryeb_total_sales', label: 'TryEB Total Sales' },
  { norm: 'amazon revenue', key: 'amazon_revenue', label: 'Amazon Revenue' },
  { norm: 'amazon direct', key: 'amazon_direct', label: 'Amazon Direct' },
  { norm: 'wmt daily digital sales', key: 'wmt_daily_sales', label: 'Walmart Digital Sales' },
  { norm: 'new order revenue', key: 'new_order_revenue', label: 'New Order Revenue' },
  { norm: 'new customer revenue', key: 'new_customer_revenue', label: 'New Customer Revenue' },
  { norm: 'new rev', key: 'new_rev', label: 'New Revenue' },
  { norm: 'sub rev', key: 'sub_rev', label: 'Subscription Revenue' },
  { norm: 'hydrogen recurring revenue', key: 'hydrogen_recurring_rev', label: 'Hydrogen Recurring Rev' },
  { norm: 'hydrogen recurring revenue new', key: 'hydrogen_recurring_rev_new', label: 'Hydrogen Recurring (New)' },
  { norm: 'tryeb recurring revenue', key: 'tryeb_recurring_rev', label: 'TryEB Recurring Rev' },
  { norm: 'legacy account recurring revenue', key: 'legacy_recurring_rev', label: 'Legacy Recurring Rev' },
  { norm: 'meta dtc', key: 'meta_dtc_spend', label: 'Meta DTC Spend' },
  { norm: 'google', key: 'google_spend', label: 'Google Spend' },
  { norm: 'youtube', key: 'youtube_spend', label: 'YouTube Spend' },
  { norm: 'tatari tv', key: 'tatari_tv_spend', label: 'Tatari TV Spend' },
  { norm: 'microsoft', key: 'microsoft_spend', label: 'Microsoft Spend' },
  { norm: 'tiktok', key: 'tiktok_spend', label: 'TikTok Spend' },
  { norm: 'applovin', key: 'applovin_spend', label: 'AppLovin Spend' },
  { norm: 'spotify', key: 'spotify_spend', label: 'Spotify Spend' },
  { norm: 'taboola', key: 'taboola_spend', label: 'Taboola Spend' },
  { norm: 'podcast', key: 'podcast_spend', label: 'Podcast Spend' },
  { norm: 'agentio', key: 'agentio_spend', label: 'Agentio Spend' },
  { norm: 'pinterest', key: 'pinterest_spend', label: 'Pinterest Spend' },
  { norm: 'tv', key: 'tv_spend', label: 'TV Spend' },
  { norm: 'meta retail', key: 'meta_retail_spend', label: 'Meta Retail Spend' },
  { norm: 'google retail', key: 'google_retail_spend', label: 'Google Retail Spend' },
  { norm: 'retail meta spend', key: 'retail_meta_spend', label: 'Retail Meta Spend' },
  { norm: 'meta', key: 'meta_spend', label: 'Meta Spend' },
  { norm: 'meta ad spend', key: 'meta_ad_spend', label: 'Meta Ad Spend' },
  { norm: 'amazon adspend', key: 'amazon_adspend', label: 'Amazon Adspend' },
  { norm: 'walmart ad spend', key: 'walmart_ad_spend', label: 'Walmart Ad Spend' },
  { norm: 'wmt ad spend', key: 'wmt_ad_spend', label: 'WMT Ad Spend' },
  { norm: 'laundry gwp ad spend', key: 'laundry_gwp_adspend', label: 'Laundry GWP Adspend' },
  { norm: 'dish gwp spend', key: 'dish_gwp_spend', label: 'Dish GWP Spend' },
  { norm: 'laundry gwp subs', key: 'laundry_gwp_subs', label: 'Laundry GWP Subs' },
  { norm: 'laundry gwp cpa', key: 'laundry_gwp_cpa', label: 'Laundry GWP CPA' },
  { norm: 'dish gwp subs', key: 'dish_gwp_subs', label: 'Dish GWP Subs' },
  { norm: 'dish gwp cpa', key: 'dish_gwp_cpa', label: 'Dish GWP CPA' },
  { norm: 'laundry sub rate %', key: 'laundry_sub_rate', label: 'Laundry Sub Rate %' },
  { norm: 'dish sub rate %', key: 'dish_sub_rate', label: 'Dish Sub Rate %' },
  { norm: 'laundry upsell take rate', key: 'laundry_upsell_take_rate', label: 'Laundry Upsell Take Rate' },
  { norm: 'dish upsell take rate', key: 'dish_upsell_take_rate', label: 'Dish Upsell Take Rate' },
  { norm: 'total orders', key: 'total_orders', label: 'Total Orders' },
  { norm: 'new orders', key: 'new_orders', label: 'New Orders' },
  { norm: 'amazon total orders', key: 'amazon_total_orders', label: 'Amazon Total Orders' },
  { norm: 'shopify - hydrogen total orders', key: 'shopify_hydrogen_orders', label: 'Shopify Hydrogen Orders' },
  { norm: 'shopify - tryearthbreeze total orders', key: 'shopify_tryeb_orders', label: 'Shopify TryEB Orders' },
  { norm: 'recurring orders', key: 'recurring_orders', label: 'Recurring Orders' },
  { norm: 'upsell voided orders', key: 'upsell_voided_orders', label: 'Upsell Voided Orders' },
  { norm: 'refund & voided orders', key: 'refund_voided_orders', label: 'Refund & Voided Orders' },
  { norm: 'draft orders /customer support', key: 'draft_orders_cs', label: 'Draft Orders (CS)' },
  { norm: 'qa wolf / test orders', key: 'qa_test_orders', label: 'QA / Test Orders' },
  { norm: 'dtc new unique customers', key: 'dtc_new_customers', label: 'DTC New Unique Customers' },
  { norm: 'amz new unique customers', key: 'amz_new_customers', label: 'AMZ New Unique Customers' },
  { norm: 'amz new unique customer (weekly)', key: 'amz_new_customers_weekly', label: 'AMZ New Customers (Weekly)' },
  { norm: 'new shopify subs', key: 'new_shopify_subs', label: 'New Shopify Subs' },
  { norm: 'net daily subs', key: 'net_daily_subs', label: 'Net Daily Subs' },
  { norm: 'amz net daily subs', key: 'amz_net_subs', label: 'Amz Net Daily Subs' },
  { norm: 'inactive subs', key: 'inactive_subs', label: 'Inactive Subs' },
  { norm: 'regular sub order rate', key: 'regular_sub_order_rate', label: 'Regular Sub Order Rate' },
  { norm: 'annual sub order rate', key: 'annual_sub_order_rate', label: 'Annual Sub Order Rate' },
  { norm: 'otp order rate', key: 'otp_order_rate', label: 'OTP Order Rate' },
  { norm: 'daily customer cancels', key: 'daily_cancels', label: 'Daily Customer Cancels' },
  { norm: 'tryeb customer cancels', key: 'tryeb_customer_cancels', label: 'TryEB Customer Cancels' },
  { norm: 'hydrogen customer cancels', key: 'hydrogen_customer_cancels', label: 'Hydrogen Customer Cancels' },
  { norm: 'monthly churn', key: 'monthly_churn', label: 'Monthly Churn' },
  { norm: 'monthly churn %', key: 'monthly_churn_pct', label: 'Monthly Churn %' },
  { norm: 'cpa', key: 'cpa', label: 'CPA' },
  { norm: 'dtc cac', key: 'dtc_cac', label: 'DTC CAC' },
  { norm: 'x-cac', key: 'x_cac', label: 'X-CAC' },
  { norm: 'nc aov', key: 'nc_aov', label: 'NC AOV' },
  { norm: 'cashflow net $ per new sub', key: 'cashflow_net_per_new_sub', label: 'Cashflow Net $ / New Sub' },
  { norm: 'payback period (months)', key: 'payback_period_months', label: 'Payback Period (mo)' },
  { norm: 'est day 1 gross profit', key: 'est_day1_gross_profit', label: 'Est Day-1 Gross Profit' },
  { norm: 'negative contribution margin day 1', key: 'negative_cm_d1', label: 'Neg Contribution Margin D1' },
  { norm: 'cash to recoup day 1', key: 'cash_to_recoup_d1', label: 'Cash to Recoup D1' },
  { norm: 'contribution margin % of revenue', key: 'contribution_margin_pct_rev', label: 'Contribution Margin % Rev' },
  { norm: 'nc gross profit', key: 'nc_gross_profit', label: 'NC Gross Profit' },
  { norm: 'nb new visit % meta', key: 'nb_new_visit_pct_meta', label: 'NB New Visit % (Meta)' },
  { norm: 'opex', key: 'opex', label: 'OPEX' },
  { norm: '$10m opex budget', key: 'opex_budget_10m', label: '$10M OPEX Budget' },
  { norm: 'interest expense', key: 'interest_expense', label: 'Interest Expense' },
  { norm: 'marketing other', key: 'marketing_other', label: 'Marketing Other' },
  { norm: 'marketing', key: 'marketing_total', label: 'Marketing (Total)' },
  { norm: 'sampling', key: 'sampling_spend', label: 'Sampling' },
  { norm: 'impact 1%', key: 'impact_1pct', label: 'Impact 1%' },
  { norm: 'dtc processing fees', key: 'dtc_processing_fees', label: 'DTC Processing Fees' },
  { norm: 'cogs', key: 'cogs', label: 'COGS' },
  { norm: 'sales tax', key: 'sales_tax', label: 'Sales Tax' },
  { norm: 'az cogs + fees + sales tax', key: 'az_cogs_fees_tax', label: 'Amazon COGS + Fees + Tax' },
  { norm: 'traffic(shopify store sessions)', key: 'traffic', label: 'Traffic (Sessions)' },
  { norm: 'traffic (shopify store sessions)', key: 'traffic', label: 'Traffic (Sessions)' },
  { norm: 'traffic', key: 'traffic', label: 'Traffic (Sessions)' },
  { norm: 'sessions', key: 'traffic', label: 'Traffic (Sessions)' },
  { norm: 'shopify store sessions', key: 'traffic', label: 'Traffic (Sessions)' },
  { norm: 'shopify sessions', key: 'traffic', label: 'Traffic (Sessions)' },
  { norm: 'total sessions', key: 'traffic', label: 'Traffic (Sessions)' },
  { norm: 'tryeb sessions', key: 'tryeb_sessions', label: 'TryEB Sessions' },
  { norm: 'pages sessions', key: 'pages_sessions', label: 'Pages Sessions' },
  { norm: 'hydrogen sessions', key: 'hydrogen_sessions', label: 'Hydrogen Sessions' },
  { norm: 'amazon glance views', key: 'amazon_glance_views', label: 'Amazon Glance Views' },
  { norm: 'amazon conversion rate', key: 'amazon_cvr', label: 'Amazon CVR' },
  { norm: 'blended conversion rate', key: 'blended_cvr', label: 'Blended CVR' },
  { norm: 'laundry upsell rev', key: 'laundry_upsell_rev', label: 'Laundry Upsell Rev' },
  { norm: 'laundry upsell product rev %', key: 'laundry_upsell_product_rev_pct', label: 'Laundry Upsell % Rev' },
  { norm: 'dish upsell product revenue', key: 'dish_upsell_product_rev', label: 'Dish Upsell Product Rev' },
  { norm: 'dish upsell product rev %', key: 'dish_upsell_product_rev_pct', label: 'Dish Upsell % Rev' },
  { norm: 'units shipped', key: 'units_shipped', label: 'Units Shipped' },
];

const COMPOSITES = [
  { key: 'new_gwp_subs', label: 'New GWP Subs', agg: { kind: 'sum', sources: ['laundry gwp subs', 'dish gwp subs'] } },
  { key: 'gwp_cpa', label: 'GWP CPA', agg: { kind: 'weighted_avg', pairs: [
    { rate: 'laundry gwp cpa', weight: 'laundry gwp subs' },
    { rate: 'dish gwp cpa', weight: 'dish gwp subs' },
  ] } },
  { key: 'sub_rate', label: 'Sub Rate %', agg: { kind: 'weighted_avg', pairs: [
    { rate: 'laundry sub rate %', weight: 'new orders' },
    { rate: 'dish sub rate %', weight: 'new orders' },
  ] } },
  { key: 'upsell_take_rate', label: 'Upsell Take Rate', agg: { kind: 'weighted_avg', pairs: [
    { rate: 'laundry upsell take rate', weight: 'new orders' },
    { rate: 'dish upsell take rate', weight: 'new orders' },
  ] } },
];

const LABEL_BY_KEY = (() => { const m = {}; for (const e of METRIC_MAP) if (!m[e.key]) m[e.key] = e.label; return m; })();

// Approved overrides from the Sync health panel: normalized header → metric.
// Consulted before METRIC_MAP.
function matchHeader(header, overrideByHeader) {
  const n = normalize(header);
  if (!n) return null;
  if (overrideByHeader && overrideByHeader[n]) return overrideByHeader[n];
  for (const m of METRIC_MAP) if (n === m.norm) return { key: m.key, label: m.label };
  return null;
}

// Handles accounting negatives "(1,234)", unicode minus/dashes and trailing "-".
function parseMoney(s) {
  if (s === undefined || s === null) return null;
  let c = String(s).trim();
  if (!c) return null;
  let neg = false;
  if (/^\(.*\)$/.test(c)) { neg = true; c = c.slice(1, -1); }
  c = c.replace(/[\u2010\u2011\u2012\u2013\u2014\u2015\u2212]/g, '-');
  c = c.replace(/[$,\s%\u00a0]/g, '').trim();
  if (c.endsWith('-')) { neg = true; c = c.slice(0, -1); }
  if (!c || c === '-') return null;
  const n = parseFloat(c);
  if (isNaN(n)) return null;
  return neg ? -Math.abs(n) : n;
}

function parseRowDate(s) {
  if (!s) return null;
  s = String(s).trim();
  const lower = s.toLowerCase();
  const monthWords = ['date','january','february','march','april','may','june','july','august','september','october','november','december','jan','feb','mar','apr','jun','jul','aug','sep','oct','nov','dec'];
  if (monthWords.includes(lower)) return null;
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = parseFloat(s);
    if (n > 40000 && n < 60000) {
      const d = new Date(new Date(1899, 11, 30).getTime() + Math.floor(n) * 86400000);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    return null;
  }
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/);
  if (mdy) {
    const y = mdy[3] ? (mdy[3].length === 2 ? 2000 + parseInt(mdy[3]) : parseInt(mdy[3])) : new Date().getFullYear();
    return `${y}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  return null;
}

module.exports = function(app, { pool }) {
  app.post('/sheets-daily-sync', async (req, res) => {
    try {
      // Load approved column overrides. Never fatal: if this fails the sync
      // proceeds on the built-in mapping.
      const overrideByHeader = {};
      const overridesApplied = [];
      let overrideError = null;
      try {
        const { rows: ovr } = await pool.query(`SELECT metric_key, sheet_header FROM scoreboard_column_map`);
        for (const o of (ovr || [])) {
          const n = normalize(String(o.sheet_header || ''));
          if (!n || !o.metric_key) continue;
          overrideByHeader[n] = { key: o.metric_key, label: LABEL_BY_KEY[o.metric_key] || o.metric_key };
          overridesApplied.push({ metric_key: o.metric_key, sheet_header: o.sheet_header });
        }
      } catch (e) { overrideError = String(e?.message ?? e); }

      const token = await googleToken();

      const r = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(`'${TAB_NAME}'!${READ_RANGE}`)}?valueRenderOption=FORMATTED_VALUE`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await r.json();
      if (!r.ok) return res.status(r.status).json({ error: data });

      const rows = data.values || [];
      if (!rows.length) return res.json({ error: 'No data' });

      const headerRow = rows[0];
      const colMetrics = headerRow.map((h, i) => i === 0 ? null : matchHeader(h, overrideByHeader));
      const matchedKeys = [...new Set(colMetrics.filter(Boolean).map(m => m.key))];

      // Flag overrides that point at a header which does not exist, and overrides
      // that hijacked a column another metric was already reading.
      const headerSet = new Set(headerRow.map(h => normalize(String(h || ''))).filter(Boolean));
      const overrideWarnings = [];
      for (const o of overridesApplied) {
        const n = normalize(String(o.sheet_header));
        if (!headerSet.has(n)) { overrideWarnings.push(`"${o.sheet_header}" (mapped to ${o.metric_key}) is not a column in the sheet`); continue; }
        const natural = METRIC_MAP.find(m => m.norm === n);
        if (natural && natural.key !== o.metric_key) overrideWarnings.push(`"${o.sheet_header}" now feeds ${o.metric_key} instead of ${natural.key}`);
      }

      const headerToCol = {};
      headerRow.forEach((h, i) => {
        const n = normalize(h);
        if (n) headerToCol[n] = i;
      });

      const activeComposites = COMPOSITES.filter(c => {
        if (c.agg.kind === 'sum') return c.agg.sources.some(s => headerToCol[s] !== undefined);
        return c.agg.pairs.some(p => headerToCol[p.rate] !== undefined && headerToCol[p.weight] !== undefined);
      });

      const unmatchedHeaders = headerRow
        .map((h, i) => i > 0 && h.trim() && !colMetrics[i] ? `"${h}" [${normalize(h)}]` : null)
        .filter(Boolean);
      const matchedCols = colMetrics
        .map((m, i) => m ? `col${i}:${headerRow[i]}->${m.key}` : null)
        .filter(Boolean);

      const upsertRows = [];
      let datesParsed = 0;

      for (let rIdx = 1; rIdx < rows.length; rIdx++) {
        const row = rows[rIdx];
        const dateStr = parseRowDate(row[0] || '');
        if (!dateStr) continue;
        datesParsed++;

        for (let c = 1; c < row.length; c++) {
          const metric = colMetrics[c];
          if (!metric) continue;
          const val = parseMoney(row[c]);
          if (val === null) continue;
          upsertRows.push({ date: dateStr, metric_key: metric.key, metric_label: metric.label, value: val });
        }

        for (const comp of activeComposites) {
          if (comp.agg.kind === 'sum') {
            let sum = 0;
            let any = false;
            for (const src of comp.agg.sources) {
              const ci = headerToCol[src];
              if (ci === undefined) continue;
              const v = parseMoney(row[ci]);
              if (v === null) continue;
              sum += v; any = true;
            }
            if (any) upsertRows.push({ date: dateStr, metric_key: comp.key, metric_label: comp.label, value: sum });
          } else {
            let weightedNum = 0, weightSum = 0, any = false;
            for (const pair of comp.agg.pairs) {
              const rci = headerToCol[pair.rate], wci = headerToCol[pair.weight];
              if (rci === undefined || wci === undefined) continue;
              const rate = parseMoney(row[rci]), weight = parseMoney(row[wci]);
              if (rate === null || weight === null || weight <= 0) continue;
              weightedNum += rate * weight; weightSum += weight; any = true;
            }
            if (any && weightSum > 0) {
              const avg = Math.round((weightedNum / weightSum) * 100) / 100;
              upsertRows.push({ date: dateStr, metric_key: comp.key, metric_label: comp.label, value: avg });
            }
          }
        }
      }

      let upserted = 0;
      let rpcError = null;
      for (let i = 0; i < upsertRows.length; i += 500) {
        const chunk = upsertRows.slice(i, i + 500);
        try {
          const { rows: rpcResult } = await pool.query(
            `SELECT upsert_scoreboard_daily($1::jsonb) AS count`,
            [JSON.stringify(chunk)]
          );
          upserted += Number(rpcResult[0]?.count) || chunk.length;
        } catch (err) {
          rpcError = err?.message;
          break;
        }
      }

      const netDollarRows = upsertRows.filter(r => r.metric_key === 'net_dollars');
      const netDollarLatest = netDollarRows.length > 0
        ? netDollarRows.slice().sort((a, b) => b.date.localeCompare(a.date))[0]
        : null;
      const netCol = colMetrics.findIndex(m => m && m.key === 'net_dollars');

      res.json({
        success: !rpcError,
        matched: matchedKeys, matched_count: matchedKeys.length,
        matched_cols: matchedCols,
        unmatched_headers: unmatchedHeaders, unmatched_count: unmatchedHeaders.length,
        composite_keys_emitted: activeComposites.map(c => c.key),
        overrides_applied: overridesApplied,
        override_warnings: overrideWarnings,
        override_load_error: overrideError,
        rows_upserted: upserted, rows_built: upsertRows.length,
        dates_parsed: datesParsed,
        net_dollars_col: netCol,
        net_dollars_debug: { rows_found: netDollarRows.length, latest: netDollarLatest },
        rpc_error: rpcError,
      });
    } catch (e) {
      res.status(500).json({ error: String(e) });
    }
  });
};
