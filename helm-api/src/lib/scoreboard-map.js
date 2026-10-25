// Scoreboard metrics computed from the data team's scorecard (scorecard_v2_main,
// copied nightly into wh_scorecard_daily, one row per date x country).
// Ben chose (25 Oct 2026) to switch the Scoreboard to Metabase's definitions.
//   sum  - added up across all countries (company total)
//   us   - the US row's value (Metabase's headline ratios are per country; US is the scorecard default)
//   pct  - like `us` but a 0-1 fraction shown as a percentage
//   fn   - computed from the day's rows
// Sheet metrics with no warehouse equivalent (opex, interest, impact 1%, units shipped,
// cashflow per new sub, ...) keep coming from the Google Sheet.
const S = (col) => ({ kind: 'sum', col });
const US = (col) => ({ kind: 'us', col });
const PCT = (col) => ({ kind: 'pct', col });
const sum = (rows, col) => rows.reduce((s, r) => s + (Number(r.metrics?.[col]) || 0), 0);

const MAP = {
  // Revenue
  revenue:               { kind: 'fn', fn: (rows) => sum(rows, 'cash_total_sales') + sum(rows, 'amazon_revenue') },
  shopify_revenue:       S('cash_total_sales'),
  hydrogen_total_sales:  S('cash_total_sales'),
  hydrogen_gross_sales:  S('gross_sale'),
  hydrogen_discounts:    S('total_discount'),
  hydrogen_tax:          S('total_tax'),
  sales_tax:             S('total_tax'),
  hydrogen_returns:      S('refunds'),
  hydrogen_voided_returns: S('voided_refunds'),
  new_rev:               S('new_rev'),
  new_customer_revenue:  S('new_revenue'),
  sub_rev:               S('recurring_revenue'),
  amazon_revenue:        S('amazon_revenue'),
  wmt_daily_sales:       S('walmart_daily_digital_sales'),
  comp_yago:             { kind: 'fn', fn: (rows) => { const y = sum(rows, 'comp_yago_revenue'); return y > 0 ? (sum(rows, 'total_revenue') / y - 1) * 100 : null; } },
  // Profit
  cogs:                  S('total_cogs'),
  net_dollars:           S('net_profit_day_1'),
  contribution_margin_pct_rev: { kind: 'fn', fn: (rows) => { const r = sum(rows, 'net_revenue'); return r > 0 ? sum(rows, 'contribution_margin') / r * 100 : null; } },
  // Ad spend
  ad_spend:              S('total_ad_spend_estimated'),
  meta_dtc_spend:        S('meta_dtc_spend'),
  laundry_gwp_adspend:   S('meta_dtc_spend_laundry'),
  dish_gwp_spend:        S('dish_marketing_spend'),
  retail_meta_spend:     S('retail_meta_spend'),
  meta_retail_spend:     S('meta_retail_spend'),
  google_spend:          S('google_spend'),
  youtube_spend:         S('youtube_spend'),
  tiktok_spend:          S('tiktok_spend'),
  applovin_spend:        S('applovin_spend'),
  microsoft_spend:       S('microsoft_spend'),
  tatari_tv_spend:       S('tatari_spend'),
  tv_spend:              S('tv_spend'),
  taboola_spend:         S('taboola_spend'),
  pinterest_spend:       S('pinterest_spend'),
  podcast_spend:         S('podcast_spend'),
  agentio_spend:         S('agentio_spend'),
  amazon_adspend:        S('amazon_ad_spend'),
  amazon_direct:         S('amazon_ad_direct'),
  walmart_ad_spend:      S('walmart_ad_spend'),
  wmt_ad_spend:          S('walmart_ad_spend'),
  // Orders and customers
  total_orders:          S('total_orders'),
  new_orders:            S('new_orders'),
  recurring_orders:      S('recurring_order_incl_otp'),
  amazon_total_orders:   S('amazon_orders'),
  amz_new_customers:     S('amz_new_customers'),
  dtc_new_customers:     S('new_customer_shopify'),
  // Subscriptions
  new_gwp_subs:          S('new_gwp_subs'),
  laundry_gwp_subs:      { kind: 'fn', fn: (rows) => sum(rows, 'new_gwp_subs') - sum(rows, 'new_dish_gwp_subs') - sum(rows, 'new_stain_spray_gwp_subs') },
  dish_gwp_subs:         S('new_dish_gwp_subs'),
  new_shopify_subs:      S('new_subscribers'),
  net_daily_subs:        S('net_daily_subs'),
  inactive_subs:         S('inactive_subscribers'),
  daily_cancels:         S('churned_customers'),
  hydrogen_customer_cancels: S('churned_customers'),
  // Traffic
  traffic:               S('visitors'),
  hydrogen_sessions:     S('sessions'),
  // Unit economics (US, as on Metabase's Scorecard v2)
  cpa:                   US('cpa'),
  nc_aov:                US('nc_aov'),
  dtc_cac:               US('dtc_cac'),
  x_cac:                 US('x_cac'),
  gwp_cpa:               US('gwp_cpa'),
  laundry_gwp_cpa:       US('gwp_cpa'),
  dish_gwp_cpa:          US('dish_gwp_cpa'),
  blended_cvr:           PCT('cvr'),
  sub_rate:              PCT('sub_rate_pct'),
  laundry_sub_rate:      PCT('regular_sub_rate_pct'),
  regular_sub_order_rate: PCT('regular_sub_rate_pct'),
  annual_sub_order_rate: PCT('annual_sub_rate_pct'),
  otp_order_rate:        PCT('otp_rate_pct'),
  // Upsells
  laundry_upsell_take_rate: PCT('dryer_upsell_take_rate'),
  upsell_take_rate:      PCT('dryer_upsell_take_rate'),
  laundry_upsell_rev:    S('dryer_upsell_revenue'),
  laundry_upsell_product_rev_pct: PCT('dryer_upsell_revenue_percent'),
  dish_upsell_take_rate: PCT('dish_upsell_take_rate'),
  dish_upsell_product_rev: S('dish_funnel_upsell_revenue'),
  dish_upsell_product_rev_pct: PCT('dish_funnel_upsell_revenue_percent'),
};

function valueFor(def, rows) {
  if (def.kind === 'sum') return sum(rows, def.col);
  const us = rows.find((r) => r.country_code === 'US');
  if (def.kind === 'us') { const v = us?.metrics?.[def.col]; return v == null ? null : Number(v); }
  if (def.kind === 'pct') { const v = us?.metrics?.[def.col]; return v == null ? null : Number(v) * 100; }
  return def.fn(rows);
}

const WAREHOUSE_SCOREBOARD_KEYS = new Set(Object.keys(MAP));
module.exports = { MAP, valueFor, WAREHOUSE_SCOREBOARD_KEYS };
