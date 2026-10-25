// Daily demand forecasting for Demand Planning > Daily Units.
//
// Models (all work on the weekday-adjusted series, then re-apply day-of-week factors):
//  - "trend": damped Holt (level + trend). Works with short history.
//  - "yoy":   last year's seasonal shape (28-day smoothed, weekday-aligned 364
//             days back) anchored to the last 14 days' level, damped (^0.7) so
//             last year's swings and growth aren't copied 1:1.
//  - "blend": geometric mean of "yoy" and a gently damped trend. Default.
// Picking: "auto" uses "blend" when there is a year of history, else "trend".
// Tested on Earth Breeze total daily units (13 monthly origins, Aug 2025 -
// Aug 2026, 60 days ahead): blend averaged 16.2% WAPE, auto-selection by
// backtest 16.9%, trend 18.3%, repeat-last-week 20.2%.
// Accuracy shown: rolling-origin backtest (28 days ahead from each of the last
// three 4-week origins) as WAPE = sum|actual - forecast| / sum actual.
// Bands: 10th/90th percentile of backtest log errors, widened with horizon.

const DAY = 864e5;
export const addDays = (iso, n) => new Date(Date.parse(iso + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);
export const dayIndex = (iso) => Math.round(Date.parse(iso + "T00:00:00Z") / DAY);

// Dense daily series from sparse {date: value} between from..to (missing = 0).
export function densify(map, from, to) {
  const dates = [], values = [];
  for (let d = from; d <= to; d = addDays(d, 1)) { dates.push(d); values.push(Number(map[d] || 0)); }
  return { dates, values };
}

export function movingAverage(values, window, centered = false) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= window) sum -= values[i - window];
    if (i >= window - 1) {
      const idx = centered ? i - Math.floor(window / 2) : i;
      out[idx] = sum / window;
    }
  }
  return out;
}

const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const quantile = (a, q) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); const p = (s.length - 1) * q; const lo = Math.floor(p), hi = Math.ceil(p); return s[lo] + (s[hi] - s[lo]) * (p - lo); };

// Day-of-week factors (index by UTC weekday of each date), mean 1.
export function weekdayFactors(dates, values, lookback = 84) {
  const n = values.length, start = Math.max(0, n - lookback);
  const ma = movingAverage(values, 7, true);
  const buckets = [[], [], [], [], [], [], []];
  for (let i = start; i < n; i++) {
    if (ma[i] && ma[i] > 0) buckets[new Date(dates[i] + "T00:00:00Z").getUTCDay()].push(values[i] / ma[i]);
  }
  let f = buckets.map((b) => (b.length >= 3 ? median(b) : 1));
  const mean = f.reduce((s, x) => s + x, 0) / 7;
  f = f.map((x) => (mean > 0 ? x / mean : 1));
  // Sparse series (lots of zero days) give noisy factors: shrink toward 1.
  const zeros = values.slice(start).filter((v) => v === 0).length / Math.max(1, n - start);
  if (zeros > 0.3) f = f.map((x) => 1 + (x - 1) * (1 - zeros));
  return f;
}

const dow = (iso) => new Date(iso + "T00:00:00Z").getUTCDay();

function deseason(dates, values, f) { return values.map((v, i) => v / (f[dow(dates[i])] || 1)); }

// Damped Holt; alpha/beta picked by a small grid on one-step error.
function holt(series, phi = 0.9) {
  const tail = series.slice(-240);
  let best = null;
  for (const a of [0.05, 0.1, 0.2, 0.3, 0.5]) {
    for (const b of [0.01, 0.05, 0.1, 0.2]) {
      let l = tail.slice(0, 7).reduce((s, x) => s + x, 0) / 7, t = 0, sse = 0;
      for (let i = 7; i < tail.length; i++) {
        const f = l + phi * t, e = tail[i] - f; sse += e * e;
        const nl = a * tail[i] + (1 - a) * (l + phi * t);
        t = b * (nl - l) + (1 - b) * phi * t; l = nl;
      }
      if (!best || sse < best.sse) best = { a, b, l, t, sse };
    }
  }
  return (h) => { let s = 0, p = 1; for (let k = 1; k <= h; k++) { p *= phi; s += p; } return Math.max(0, best.l + s * best.t); };
}

const sumRange = (arr, a, b) => { let s = 0; for (let i = Math.max(0, a); i < Math.min(arr.length, b); i++) s += arr[i] || 0; return s; };

// Core: forecast `horizon` days after the last date, with the given model.
const YEAR = 364;
function fit(dates, values, horizon, model) {
  const n = values.length;
  const f = weekdayFactors(dates, values);
  const d = deseason(dates, values, f);
  const lastDate = dates[n - 1];
  const out = [];
  if (model === "yoy" || model === "blend") {
    if (n < YEAR + 60) return null;
    // Last year's shape only means something if the series really sold then:
    // a product that launched or ramped a year ago (e.g. 10x growth) would
    // copy its launch curve forward. Require last year's 91 days to be at
    // least a quarter of the recent 91 days.
    const recent91 = sumRange(values, n - 91, n), ly91 = sumRange(values, n - 91 - YEAR, n - YEAR);
    if (!(ly91 > 0) || ly91 < 0.25 * recent91) return null;
    const S = movingAverage(d, 28, true);
    const level = sumRange(d, n - 14, n) / 14;
    const ref = S[n - 1 - YEAR - 7] ?? S[n - 1 - YEAR];
    if (!ref || ref <= 0 || !isFinite(level)) return null;
    const tr = model === "blend" ? holt(d, 0.95) : null;
    for (let h = 1; h <= horizon; h++) {
      const ly = n - 1 + h - YEAR;
      const shape = S[ly] ?? d[ly] ?? ref;
      let v = level * Math.pow(Math.max(shape, 1e-9) / ref, 0.7);
      if (tr) v = Math.sqrt(Math.max(v, 0) * tr(h));
      const date = addDays(lastDate, h);
      out.push({ date, value: Math.max(0, v * f[dow(date)]) });
    }
    return { model, factors: f, points: out };
  }
  const lv = holt(d, 0.9);
  for (let h = 1; h <= horizon; h++) {
    const date = addDays(lastDate, h);
    out.push({ date, value: Math.max(0, lv(h) * f[dow(date)]) });
  }
  return { model: "trend", factors: f, points: out };
}

// Rolling-origin backtest: WAPE and log errors for each model.
function backtest(dates, values, model, { origins = 3, horizon = 28 } = {}) {
  let absErr = 0, actual = 0; const logErr = [];
  for (let o = 1; o <= origins; o++) {
    const cut = values.length - o * horizon;
    if (cut < 120) break;
    const r = fit(dates.slice(0, cut), values.slice(0, cut), horizon, model);
    if (!r) return null;
    r.points.forEach((p, i) => {
      const a = values[cut + i]; absErr += Math.abs(a - p.value); actual += a;
      logErr.push({ h: i + 1, e: Math.log((a + 1) / (p.value + 1)) });
    });
  }
  if (!actual) return null;
  return { wape: absErr / actual, logErr };
}

// Naive benchmark: same weekday last week, repeated.
function naiveWape(values, horizon = 28, origins = 3) {
  let absErr = 0, actual = 0;
  for (let o = 1; o <= origins; o++) {
    const cut = values.length - o * horizon; if (cut < 7) break;
    for (let i = 0; i < horizon; i++) { const a = values[cut + i]; const p = values[cut - 7 + (i % 7)]; absErr += Math.abs(a - p); actual += a; }
  }
  return actual ? absErr / actual : null;
}

// Public entry point.
//   series: { dates: [...ISO], values: [...] } up to the last complete day
//   opts:   { horizon = 90, model = "auto" | "blend" | "yoy" | "trend" }
// Returns { model, points: [{date, value, lo, hi}], wape, naiveWape, factors, reason }
export const MODEL_LABELS = { blend: "Seasonal blend", yoy: "Last-year shape", trend: "Recent trend" };
export function forecast(series, { horizon = 90, model = "auto" } = {}) {
  const { dates, values } = series;
  if (!dates.length || values.reduce((s, x) => s + x, 0) === 0) return null;
  let m = model === "auto" ? "blend" : model;
  let r = fit(dates, values, horizon, m);
  if (!r) { m = "trend"; r = fit(dates, values, horizon, "trend"); }
  const bt = backtest(dates, values, m) || { wape: null, logErr: [] };
  const errs = bt.logErr || [];
  const lo10 = errs.length ? quantile(errs.map((x) => x.e), 0.1) : -0.25;
  const hi90 = errs.length ? quantile(errs.map((x) => x.e), 0.9) : 0.25;
  const points = r.points.map((p, i) => {
    const widen = Math.sqrt(1 + (i + 1) / 28);
    return { ...p, lo: Math.max(0, (p.value + 1) * Math.exp(Math.min(lo10, 0) * widen) - 1), hi: (p.value + 1) * Math.exp(Math.max(hi90, 0) * widen) - 1 };
  });
  const reason = {
    blend: "Last year's seasonal shape blended with the recent trend, adjusted for day of week",
    yoy: "Last year's seasonal shape, anchored to the last 2 weeks",
    trend: "Recent trend (damped), adjusted for day of week",
  }[r.model];
  return { model: r.model, points, wape: bt.wape, naiveWape: naiveWape(values), factors: r.factors, reason };
}

// Least-squares slope of log(7-day average) over the series: % change per 30 days.
export function trendPerMonth(values) {
  const ma = movingAverage(values, 7).map((v, i) => [i, v]).filter(([, v]) => v && v > 0);
  if (ma.length < 14) return null;
  const xs = ma.map(([i]) => i), ys = ma.map(([, v]) => Math.log(v));
  const mx = xs.reduce((s, x) => s + x, 0) / xs.length, my = ys.reduce((s, y) => s + y, 0) / ys.length;
  let num = 0, den = 0; xs.forEach((x, i) => { num += (x - mx) * (ys[i] - my); den += (x - mx) ** 2; });
  return den ? Math.exp((num / den) * 30) - 1 : null;
}
