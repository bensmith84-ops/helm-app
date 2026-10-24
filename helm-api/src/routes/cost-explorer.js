// POST /cost-explorer - port of supabase/functions/cost-explorer
// Natural-language question about 3PL shipping costs -> Claude writes one
// SELECT over v_3pl_order_costs / v_3pl_au_order_costs + a chart spec ->
// executed via public.exec_cost_explorer_query(q) -> Claude writes a one-line answer.
//
// exec_cost_explorer_query() guards itself with is_internal_user() (auth.uid()
// must be an active org member), so it runs inside withAuthedClient with the
// CALLER's claims rather than on the bare owner pool.
// Like the Deno function, almost every failure returns HTTP 200 with { error }.
const Anthropic = require('@anthropic-ai/sdk');

const MODEL = 'claude-sonnet-5';

const SCHEMA = `Primary view: v_3pl_order_costs — one row per parcel/shipment across ALL markets.
Columns:
- market (text): 'US' (Stord, USD), 'UK' (Next3PL UK, GBP — also ships internationally: Ireland, France, Israel, and LEGACY Canada parcels), 'CA' (Next3pl US LLC serving Canada, USD — the current direct Canadian operation, live from 2026), 'AU' (Next Logistics, AUD)
- currency (text): USD / GBP / AUD — NEVER average or sum costs across different currencies; always group by or filter to one market/currency
- ship_date (date)
- dest_country (text) — e.g. 'US', 'United Kingdom', 'Canada' (UK-market rows may be lowercase 'canada' — match with ilike)
- state (text) — US states / CA provinces (ON, QC, BC...) / AU states; city (text)
- weight_kg (numeric) — parcel weight in kg
- service_level (text), carrier (text) — CA carriers: canadapost, intelcom, uniuni
- postage (numeric) — all-in parcel cost in the row's currency (CA: includes GST/HST/PST). Filter \"postage > 0\" for cost averages (some billing rows carry 0).
- freight_cost (numeric) — base cost before taxes/surcharges (CA: pre-tax subtotal)
- fuel_surcharge (numeric)
- order_ref (text)
- is_gwp (boolean) — order contained a Gift-With-Purchase item. Available for US, CA, AU (NULL for UK).
- main_units (numeric) — purchased units excluding GWP/free items; a '4 pack' = main_units = 4. US, CA, AU.
- is_first_order (boolean) — AU only (NULL elsewhere).
- skus (text) — comma-separated SKUs. US, CA, AU.
Secondary view: v_3pl_au_order_costs — AU-only detail (adds match_lag_days, so_number). Prefer v_3pl_order_costs unless AU-specific.
Rules: never mix currencies in one aggregate; state the currency in column aliases (e.g. avg_postage_usd). For 'postage cost' use postage with postage > 0 (use freight_cost for pre-tax CA questions). For trends group by date_trunc('week', ship_date) or date_trunc('month', ship_date). Round money to 2 dp. Always include a count(*) for sample size. Canada questions: default to market='CA' (USD, current operation); the UK market also holds legacy Canada parcels in GBP (dest_country ilike 'canada') — mention or group by market if comparing.`;

async function claude(system, user, maxTokens = 1024) {
  const client = new Anthropic({ apiKey: (process.env.ANTHROPIC_API_KEY || '').trim() });
  let d;
  try {
    d = await client.messages.create({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] });
  } catch (e) {
    throw new Error('AI error: ' + JSON.stringify(e?.error || { status: e?.status, message: e?.message }).slice(0, 300));
  }
  return (d.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
}

module.exports = function(app, { requireAuth, withAuthedClient }) {
  app.post('/cost-explorer', requireAuth, async (req, res) => {
    try {
      const { question } = req.body || {};
      if (!question || typeof question !== 'string') return res.status(400).json({ error: 'question is required' });

      const sys = `You translate a business question about 3PL shipping/postage/fulfillment costs (US, UK+international, Canada, Australia) into ONE PostgreSQL SELECT query plus a chart spec.\n\n${SCHEMA}\n\nRespond with ONLY a JSON object, no prose, no markdown fences:\n{\"sql\": \"<a single SELECT/WITH query referencing ONLY v_3pl_order_costs and/or v_3pl_au_order_costs, no semicolon>\", \"chart\": {\"type\": \"bar|line|none\", \"x\": \"<result column for x-axis>\", \"y\": \"<numeric result column for y-axis>\", \"title\": \"<short title>\"}}\nUse type 'line' for time trends, 'bar' for category comparisons, 'none' for a single scalar. The x and y must be exact column aliases from your SELECT.`;
      const raw = await claude(sys, question);
      let spec;
      try { spec = JSON.parse(raw.replace(/```json|```/g, '').trim()); } catch { return res.status(200).json({ error: 'Could not parse AI response', raw }); }
      if (!spec?.sql) return res.status(200).json({ error: 'AI did not return a query', raw });

      let rows;
      try {
        rows = await withAuthedClient(req.jwtClaims, async (client) => {
          const r = await client.query('SELECT public.exec_cost_explorer_query($1) AS result', [spec.sql]);
          return r.rows[0]?.result ?? [];
        });
      } catch (e) {
        return res.status(200).json({ error: 'Query failed: ' + (e?.message || String(e)), sql: spec.sql });
      }

      let answer = '';
      try {
        answer = await claude(
          'You are a concise analyst. Given a question and the query result rows (JSON), write ONE clear sentence answering it. Include the key number(s) with the correct currency (USD/GBP/AUD per the market — note Canada bills in USD) and the sample size (count) if present. No preamble.',
          `Question: ${question}\n\nResults: ${JSON.stringify(rows).slice(0, 4000)}`,
          300,
        );
      } catch { answer = ''; }

      return res.json({ answer, chart: spec.chart ?? { type: 'none' }, sql: spec.sql, rows });
    } catch (e) {
      return res.status(200).json({ error: String(e) });
    }
  });
};
