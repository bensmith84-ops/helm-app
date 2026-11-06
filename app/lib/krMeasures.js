// Multi-value key results. Keep in sync with helm-api/src/lib/kr-measures.js
// (same logic, CommonJS there).
//
// kr.measures: [{ id, label, current_value, target_value, unit, op, kind, auto_config?, auto_error?, projected? }]
//   op:   '<' | '<=' | '=' | '>=' | '>'
//   kind: 'total' (adds up over the period: spend, orders) | 'rate' (CPA, %, averages) | 'latest'
// kr.measure_logic:  'all' (every value must be met) | 'any' (one or more)
// kr.measure_period: 'week' | 'month' | 'quarter' | 'kr' (the whole KR period) | 'year' | 'custom' (kr.period_from..kr.period_to)
// Growth values (m.target_type 'growth'): target_value / stretch_value are % change against
// baseline_value, the same value over a comparison period: m.compare = {mode: 'yoy' | 'prior' | 'custom', from, to}.
// kr.period_eval:    'last_complete' (latest full period) | 'to_date' (current period so far, totals projected)
// KRs without measures fall back to current/target/direction (+ legacy conditions).

export const OPS = [
  { v: ">=", l: "≥ at or above" }, { v: ">", l: "> above" }, { v: "=", l: "= equal to" },
  { v: "<=", l: "≤ at or below" }, { v: "<", l: "< below" },
];
export const OP_SYMBOL = { ">=": "≥", ">": ">", "=": "=", "<=": "≤", "<": "<" };
export const KINDS = [
  { v: "total", l: "Total", hint: "Adds up over the period (spend, orders)" },
  { v: "rate", l: "Rate / average", hint: "Averaged over the period (CPA, %, AOV)" },
  { v: "latest", l: "Latest", hint: "The most recent value" },
];
export const PERIODS = [{ v: "week", l: "Weekly" }, { v: "month", l: "Monthly" }, { v: "quarter", l: "Quarterly" }, { v: "year", l: "Calendar year" }, { v: "custom", l: "Custom dates" }, { v: "kr", l: "Whole KR period" }];
export const COMPARES = [{ v: "yoy", l: "Same period last year" }, { v: "prior", l: "Previous period" }, { v: "custom", l: "Custom dates" }];
export const EVALS = [{ v: "last_complete", l: "Last full period" }, { v: "to_date", l: "Period to date (totals projected)" }];
export const KIND_TO_WINDOW = { total: "total", rate: "avg_day", latest: "latest" };

const isBelow = (op) => op === "<" || op === "<=";
const num = (v) => (v === "" || v == null || isNaN(Number(v)) ? null : Number(v));

export function getMeasures(kr) {
  if (Array.isArray(kr?.measures) && kr.measures.length) return kr.measures;
  const out = [{
    id: "m0", label: kr?.title || "", current_value: kr?.current_value ?? 0, target_value: kr?.target_value ?? 100, unit: kr?.unit || "",
    op: kr?.target_direction === "below" ? "<=" : ">=", kind: "latest", auto_config: kr?.auto_config || null, auto_error: kr?.auto_error || null,
  }];
  for (const c of Array.isArray(kr?.conditions) ? kr.conditions : []) {
    if (!c) continue;
    out.push({ id: c.id, label: c.label || "", current_value: c.current_value ?? 0, target_value: c.target_value, unit: c.unit || "",
      op: c.target_direction === "below" ? "<=" : ">=", kind: "rate", auto_config: c.auto_config || null, auto_error: c.auto_error || null });
  }
  return out;
}

// ── Dates (local, YYYY-MM-DD strings)
const pad = (n) => String(n).padStart(2, "0");
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => { const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const days = (a, b) => Math.round((parse(b) - parse(a)) / 86400000) + 1;
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// The window a KR is measured over right now.
export function periodWindow(kr, today = ymd(new Date()), krFrom = kr?.start_date, krTo = kr?.end_date) {
  const period = kr?.measure_period || "kr", ev = kr?.period_eval || (period === "kr" ? "to_date" : "last_complete");
  const t = parse(today);
  let start, end, label;
  if (period === "year" || period === "custom") {
    const from = kr?.period_from && String(kr.period_from).slice(0, 10), fullTo = kr?.period_to && String(kr.period_to).slice(0, 10);
    if (!from || !fullTo) return null;
    const name = period === "year" && from.slice(5) === "01-01" && fullTo.slice(5) === "12-31" && from.slice(0, 4) === fullTo.slice(0, 4)
      ? `Calendar ${from.slice(0, 4)}` : `${from} to ${fullTo}`;
    if (today < from) return { from, to: fullTo, fullTo, label: `${name} (starts ${from})`, fraction: 0, toDate: true, notStarted: true, period };
    const to = fullTo < today ? fullTo : today;
    const fraction = Math.min(1, days(from, to) / days(from, fullTo));
    return { from, to, fullTo, label: fraction < 1 ? `${name} to date` : name, fraction, toDate: fraction < 1, period };
  }
  if (period === "kr") {
    if (!krFrom) return null;
    const to = krTo && krTo < today ? krTo : today;
    const full = days(krFrom, krTo || today);
    return { from: String(krFrom).slice(0, 10), to, fullTo: String(krTo || today).slice(0, 10), label: `KR period to date`, fraction: Math.min(1, days(krFrom, to) / full), toDate: true, period };
  }
  if (period === "week") {
    const mon = addDays(t, -((t.getDay() + 6) % 7));
    start = ev === "to_date" ? mon : addDays(mon, -7); end = addDays(start, 6);
    label = `Week of ${MONTHS[start.getMonth()]} ${start.getDate()}`;
  } else if (period === "month") {
    start = ev === "to_date" ? new Date(t.getFullYear(), t.getMonth(), 1) : new Date(t.getFullYear(), t.getMonth() - 1, 1);
    end = new Date(start.getFullYear(), start.getMonth() + 1, 0);
    label = `${MONTHS[start.getMonth()]} ${start.getFullYear()}`;
  } else {
    const q = Math.floor(t.getMonth() / 3);
    start = ev === "to_date" ? new Date(t.getFullYear(), q * 3, 1) : new Date(t.getFullYear(), q * 3 - 3, 1);
    end = new Date(start.getFullYear(), start.getMonth() + 3, 0);
    label = `Q${Math.floor(start.getMonth() / 3) + 1} ${start.getFullYear()}`;
  }
  const from = ymd(start), fullTo = ymd(end);
  if (ev === "to_date") {
    return { from, to: today, fullTo, label: `${label} to date`, fraction: days(from, today) / days(from, fullTo), toDate: true, period };
  }
  return { from, to: fullTo, fullTo, label: `${label} (last full ${period === "week" ? "week" : period === "month" ? "month" : "quarter"})`, fraction: 1, toDate: false, period };
}

const GREEN = "#22c55e", YELLOW = "#eab308", RED = "#ef4444", BLUE = "#3b82f6";
const RANK = [RED, BLUE, YELLOW, GREEN];

// One value against its target. strict: green only when met (multi-value KRs).
export function evalMeasure(m, { strict = true, fraction = 1, toDate = false } = {}) {
  const target = num(m.target_value), curN = num(m.current_value);
  // No target, or no current number yet: not scored (shown grey), so an empty CPA doesn't read as "met".
  if (target == null || curN == null) return { pct: null, met: false, color: "#64748b", value: curN, noData: target != null };
  const cur = curN;
  const value = toDate && m.kind === "total" && fraction > 0 && fraction < 1 ? cur / fraction : cur;
  const op = m.op || ">=";
  let met, pct;
  if (isBelow(op)) {
    met = op === "<" ? value < target : value <= target;
    pct = met ? 100 : target ? Math.max(0, Math.round((1 - (value - target) / Math.abs(target)) * 100)) : 0;
  } else if (op === "=") {
    const diff = Math.abs(value - target), tol = Math.max(Math.abs(target) * 0.01, 1e-9);
    met = diff <= tol; pct = target ? Math.max(0, Math.round(100 - (diff / Math.abs(target)) * 100)) : (met ? 100 : 0);
  } else {
    met = op === ">" ? value > target : value >= target;
    pct = target ? Math.round((value / target) * 100) : 0;
  }
  let color;
  if (strict || op === "=") color = met ? GREEN : pct >= 90 ? YELLOW : RED;
  else if (isBelow(op)) color = met ? GREEN : pct >= 80 ? YELLOW : RED;
  else color = pct >= 70 ? GREEN : pct >= 40 ? YELLOW : BLUE;
  return { pct, met, color, value, projected: value !== cur ? value : null };
}

// The comparison window for a growth value, given the KR's current window.
// yoy / prior are like-for-like (the same elapsed days); custom is a fixed range,
// scaled to the target period's length for totals.
const shiftYear = (s, n) => { const d = parse(s); return ymd(new Date(d.getFullYear() + n, d.getMonth(), d.getDate())); };
export function compareWindow(m, win) {
  if (!win || win.notStarted) return null;
  const c = m?.compare || { mode: "yoy" };
  if (c.mode === "custom") {
    if (!c.from || !c.to) return null;
    return { from: c.from, to: c.to, likeForLike: false, ratio: days(win.from, win.fullTo || win.to) / days(c.from, c.to), label: `${c.from} to ${c.to}` };
  }
  if (c.mode === "prior") {
    const len = days(win.from, win.fullTo || win.to);
    return { from: ymd(addDays(parse(win.from), -len)), to: ymd(addDays(parse(win.to), -len)), likeForLike: true, label: "previous period" };
  }
  return { from: shiftYear(win.from, -1), to: shiftYear(win.to, -1), likeForLike: true, label: "same period last year" };
}

// A growth value: % change of the current value against its baseline.
export function evalGrowth(m, win) {
  const cw = compareWindow(m, win);
  const base = num(m.baseline_value), cur = num(m.current_value), target = num(m.target_value), stretch = num(m.stretch_value);
  if (!cw || base == null || cur == null || target == null || base === 0) return { pct: null, met: false, color: "#64748b", value: cur, noData: true, compare: cw };
  const totals = (m.kind || "total") === "total";
  const eff = !cw.likeForLike && totals && win.toDate && win.fraction > 0 && win.fraction < 1 ? cur / win.fraction : cur;
  const baseEff = !cw.likeForLike && totals ? base * cw.ratio : base;
  const growth = (eff / baseEff - 1) * 100;
  const op = m.op || ">=";
  let met, pct;
  if (isBelow(op)) { met = op === "<" ? growth < target : growth <= target; pct = met ? 100 : Math.max(0, Math.round(100 - (growth - target))); }
  else { met = op === ">" ? growth > target : growth >= target; pct = target > 0 ? Math.round((growth / target) * 100) : (met ? 100 : 0); }
  const stretchPct = !isBelow(op) && stretch != null && stretch > 0 ? Math.round((growth / stretch) * 100) : null;
  return { pct, met, color: met ? GREEN : pct >= 90 ? YELLOW : RED, value: eff, projected: eff !== cur ? eff : null, growth, stretchPct, baseline: baseEff, compare: cw };
}

// The whole KR. Multi-value (or explicit period) KRs are strict: green only when met.
export function evalKR(kr, today) {
  const ms = getMeasures(kr);
  // Strict (green only when met) for multi-value KRs or a set measurement period;
  // a single value over the whole KR keeps the original pace-style colours.
  const strict = ms.length > 1 || (!!kr?.measure_period && kr.measure_period !== "kr");
  const win = periodWindow(kr, today);
  const ctx = { strict, fraction: win?.fraction ?? 1, toDate: !!win?.toDate };
  const parts = ms.map((m) => ({ ...m, ...(m.target_type === "growth" ? evalGrowth(m, win) : evalMeasure(m, ctx)) }));
  const scored = parts.filter((p) => p.pct != null);
  if (!scored.length) return { progress: 0, color: "#64748b", met: false, parts, window: win };
  const any = kr?.measure_logic === "any";
  const capped = scored.map((p) => Math.min(100, p.pct));
  const progress = any ? Math.max(...capped) : Math.min(...scored.map((p) => p.pct));
  const colors = scored.map((p) => p.color).sort((a, b) => RANK.indexOf(a) - RANK.indexOf(b));
  return { progress, color: any ? colors[colors.length - 1] : colors[0], met: any ? scored.some((p) => p.met) : scored.every((p) => p.met), parts, window: win };
}

// Legacy columns other views read (Scorecard, People, Projects): mirror the first value.
// A growth value mirrors as its % change (e.g. 46 against a target of 30, unit %).
export function legacyMirror(measures, kr) {
  const m = measures[0] || {};
  if (m.target_type === "growth") {
    const g = kr ? evalKR({ ...kr, measures }).parts[0]?.growth : null;
    return { current_value: g == null ? 0 : Math.round(g * 10) / 10, target_value: num(m.target_value) ?? 0, unit: "%", target_direction: isBelow(m.op) ? "below" : "above" };
  }
  return { current_value: Number(m.current_value || 0), target_value: num(m.target_value) ?? 0, unit: m.unit || null, target_direction: isBelow(m.op) ? "below" : "above" };
}

export const fmtPct = (g) => (g == null ? "–" : `${g >= 0 ? "+" : ""}${Math.round(g * 10) / 10}%`);

export function fmtValue(v, unit) {
  if (v == null || v === "") return "–";
  const n = Number(v);
  const s = Math.abs(n) >= 100 ? Math.round(n).toLocaleString("en-US") : (Math.round(n * 100) / 100).toLocaleString("en-US");
  return unit === "$" ? `$${s}` : unit === "%" ? `${s}%` : unit ? `${s} ${unit}` : s;
}
