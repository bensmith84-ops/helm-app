"use client";
// Demand Planning > Daily Units: daily unit orders from the warehouse copy
// (Shopify from Jul 2024, Amazon from Dec 2023), trends, last-year comparison
// and a forecast with an 80% band and backtested accuracy.
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useTheme } from "../lib/theme";
import { T } from "../tokens";
import { forecast, densify, addDays, dayIndex, movingAverage, trendPerMonth, MODEL_LABELS } from "../lib/forecast";

const HISTORY_START = "2023-12-01";
// Categorical slots, fixed order (validated palette: light / dark steps).
const PALETTE = {
  light: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"],
  dark:  ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"],
};
const OTHER_COLOR = { light: "#9a9993", dark: "#77766f" };

const GROUPS = [["total", "Total"], ["family", "Product family"], ["sku", "Top SKUs"], ["channel", "Channel"], ["country", "Country"]];
const MEASURES = [["units", "Units"], ["packs", "Packs"], ["orders", "Orders"], ["revenue", "Revenue"]];
const RANGES = [["90", "90 days"], ["182", "6 months"], ["365", "1 year"], ["all", "All"]];
const VIEWS = [["daily", "Daily"], ["ma7", "7-day avg"], ["weekly", "Weekly"]];
const HORIZONS = [["0", "Off"], ["30", "30 days"], ["60", "60 days"], ["90", "90 days"], ["180", "180 days"]];
const MODELS = [["auto", "Seasonal blend"], ["yoy", "Last-year shape"], ["trend", "Recent trend"]];

const fmtN = (n, measure) => {
  if (n == null || !isFinite(n)) return "-";
  const v = Number(n);
  if (measure === "revenue") return v >= 1e6 ? `$${(v / 1e6).toFixed(2)}M` : v >= 1e4 ? `$${(v / 1e3).toFixed(1)}k` : `$${Math.round(v).toLocaleString()}`;
  return v >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : v >= 1e4 ? `${(v / 1e3).toFixed(1)}k` : Math.round(v).toLocaleString();
};
const fmtPct = (p) => (p == null || !isFinite(p) ? "-" : `${p >= 0 ? "+" : ""}${(p * 100).toFixed(1)}%`);
const sum = (a) => a.reduce((s, x) => s + (x || 0), 0);
const fmtDate = (iso) => new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" });
const fmtDateY = (iso) => new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function Seg({ options, value, onChange }) {
  return (
    <div style={{ display: "inline-flex", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 7, overflow: "hidden" }}>
      {options.map(([k, l]) => (
        <button key={k} onClick={() => onChange(k)}
          style={{ padding: "5px 10px", fontSize: 11.5, fontWeight: 600, border: "none", cursor: "pointer", background: value === k ? T.accent : "transparent", color: value === k ? "#fff" : T.text2 }}>{l}</button>
      ))}
    </div>
  );
}

function Field({ label, children }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: 4 }}><span style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>{children}</div>;
}

function Chip({ on, onClick, children }) {
  return <button onClick={onClick} style={{ padding: "3px 9px", fontSize: 11, borderRadius: 20, cursor: "pointer", border: `1px solid ${on ? T.accent : T.border}`, background: on ? T.accentDim : "transparent", color: on ? T.accent : T.text2, fontWeight: on ? 600 : 500 }}>{children}</button>;
}

function Tile({ label, value, sub, delta }) {
  const good = delta != null && delta >= 0;
  return (
    <div style={{ flex: "1 1 180px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 14px", minWidth: 0 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: T.text, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 11.5, color: T.text2, marginTop: 2 }}>
        {delta != null && <span style={{ color: good ? T.green : T.red, fontWeight: 700 }}>{good ? "▲" : "▼"} {fmtPct(delta).replace("+", "")} </span>}
        {sub}
      </div>
    </div>
  );
}

// ── Chart ────────────────────────────────────────────────────────────────────
function LineChart({ dates, series, measure, height = 340, mode }) {
  const wrap = useRef(null);
  const [w, setW] = useState(900);
  const [hover, setHover] = useState(null);
  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(320, Math.floor(e.contentRect.width))));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);
  const pad = { l: 56, r: 16, t: 12, b: 28 };
  const iw = w - pad.l - pad.r, ih = height - pad.t - pad.b;
  const n = dates.length;
  const all = series.flatMap((s) => [...s.values, ...(s.hi || [])]).filter((v) => v != null && isFinite(v));
  const yMax = Math.max(1, ...all) * 1.08;
  const x = (i) => pad.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v) => pad.t + ih - (v / yMax) * ih;
  const ticks = 5, yTicks = Array.from({ length: ticks + 1 }, (_, i) => (yMax / ticks) * i);
  const xTickEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 90))));
  const path = (vals) => {
    let d = "", pen = false;
    vals.forEach((v, i) => { if (v == null || !isFinite(v)) { pen = false; return; } d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; });
    return d;
  };
  const band = (lo, hi) => {
    const idx = lo.map((v, i) => (v != null && hi[i] != null ? i : -1)).filter((i) => i >= 0);
    if (idx.length < 2) return "";
    return `M${idx.map((i) => `${x(i).toFixed(1)},${y(hi[i]).toFixed(1)}`).join("L")}L${[...idx].reverse().map((i) => `${x(i).toFixed(1)},${y(lo[i]).toFixed(1)}`).join("L")}Z`;
  };
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = e.clientX - r.left;
    const i = Math.round(((px - pad.l) / iw) * (n - 1));
    setHover(i >= 0 && i < n ? i : null);
  };
  const firstForecast = dates.findIndex((_, i) => series.some((s) => s.kind === "forecast" && s.values[i] != null));
  return (
    <div ref={wrap} style={{ position: "relative", width: "100%" }}>
      <svg width={w} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)} style={{ display: "block" }}>
        {yTicks.map((t, i) => (
          <g key={i}>
            <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke={T.border} strokeWidth={1} opacity={0.6} />
            <text x={pad.l - 8} y={y(t) + 3.5} textAnchor="end" fontSize={10.5} fill={T.text3}>{fmtN(t, measure)}</text>
          </g>
        ))}
        {dates.map((d, i) => (i % xTickEvery === 0 ? <text key={d} x={x(i)} y={height - 8} textAnchor="middle" fontSize={10.5} fill={T.text3}>{fmtDate(d)}</text> : null))}
        {firstForecast > 0 && (
          <g>
            <rect x={x(firstForecast)} y={pad.t} width={Math.max(0, w - pad.r - x(firstForecast))} height={ih} fill={T.surface2} opacity={0.5} />
            <text x={x(firstForecast) + 6} y={pad.t + 12} fontSize={10.5} fill={T.text3}>Forecast</text>
          </g>
        )}
        {series.filter((s) => s.lo && s.hi).map((s) => <path key={s.key + "-band"} d={band(s.lo, s.hi)} fill={s.color} opacity={0.14} />)}
        {series.map((s) => (
          <path key={s.key + s.kind} d={path(s.values)} fill="none" stroke={s.color} strokeWidth={s.kind === "lastyear" ? 1.5 : 2}
            strokeDasharray={s.kind === "forecast" ? "5 4" : s.kind === "lastyear" ? "2 3" : undefined} opacity={s.kind === "lastyear" ? 0.75 : 1}
            strokeLinejoin="round" strokeLinecap="round" />
        ))}
        {hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke={T.text3} strokeWidth={1} />
            {series.map((s) => s.values[hover] != null && isFinite(s.values[hover]) ? <circle key={s.key + s.kind + "dot"} cx={x(hover)} cy={y(s.values[hover])} r={4} fill={s.color} stroke={T.surface} strokeWidth={2} /> : null)}
          </g>
        )}
      </svg>
      {hover != null && (() => {
        const rows = series.filter((s) => s.values[hover] != null && isFinite(s.values[hover]));
        if (!rows.length) return null;
        const left = x(hover) > w * 0.6 ? x(hover) - 250 : x(hover) + 14;
        return (
          <div style={{ position: "absolute", top: 10, left, width: 236, pointerEvents: "none", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 10px", boxShadow: "0 6px 18px rgba(0,0,0,0.12)", fontSize: 11.5, zIndex: 2 }}>
            <div style={{ fontWeight: 700, color: T.text, marginBottom: 4 }}>{fmtDateY(dates[hover])}</div>
            {rows.slice(0, 12).map((s) => (
              <div key={s.key + s.kind + "tt"} style={{ display: "flex", alignItems: "center", gap: 6, color: T.text2, lineHeight: 1.6 }}>
                <span style={{ width: 10, height: 2, background: s.color, display: "inline-block", borderTop: s.kind !== "actual" ? `2px dashed ${s.color}` : undefined }} />
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.label}{s.kind === "forecast" ? " (forecast)" : s.kind === "lastyear" ? " (last year)" : ""}</span>
                <span style={{ color: T.text, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmtN(s.values[hover], measure)}</span>
              </div>
            ))}
            {rows.find((s) => s.lo && s.lo[hover] != null) && (() => { const s = rows.find((r) => r.lo && r.lo[hover] != null); return <div style={{ color: T.text3, marginTop: 3 }}>80% range {fmtN(s.lo[hover], measure)} - {fmtN(s.hi[hover], measure)}</div>; })()}
          </div>
        );
      })()}
    </div>
  );
}

// ── Main view ────────────────────────────────────────────────────────────────
export default function DailyUnitsView({ isMobile }) {
  const theme = useTheme();
  const mode = theme?.mode === "dark" ? "dark" : "light";
  const [group, setGroup] = useState("total");
  const [measure, setMeasure] = useState("units");
  const [range, setRange] = useState("182");
  const [view, setView] = useState("daily");
  const [horizon, setHorizon] = useState("90");
  const [model, setModel] = useState("auto");
  const [compareLY, setCompareLY] = useState(true);
  const [includeFree, setIncludeFree] = useState(false);
  const [families, setFamilies] = useState([]);
  const [channels, setChannels] = useState([]);
  const [countries, setCountries] = useState([]);
  const [dims, setDims] = useState({ family: [], channel: [], country: [] });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [hidden, setHidden] = useState(new Set());
  const lastReq = useRef(0);

  useEffect(() => {
    const to = new Date().toISOString().slice(0, 10);
    supabase.rpc("dp_units_dims", { p_from: addDays(to, -365), p_to: to }).then(({ data }) => {
      const d = { family: [], channel: [], country: [] };
      (data || []).forEach((r) => { if (d[r.dim] && r.k && r.k !== "Non-product") d[r.dim].push({ k: r.k, units: Number(r.units) }); });
      setDims(d);
    });
  }, []);

  const load = useCallback(async () => {
    const req = ++lastReq.current;
    setLoading(true); setError("");
    const { data, error: e } = await supabase.rpc("dp_units_daily", {
      p_from: HISTORY_START, p_to: new Date().toISOString().slice(0, 10), p_group: group,
      p_families: families.length ? families : null, p_channels: channels.length ? channels : null,
      p_countries: countries.length ? countries : null, p_include_free: includeFree, p_measure: measure, p_top: 8,
    });
    if (req !== lastReq.current) return;
    if (e) { setError(e.message); setRows([]); } else setRows(data || []);
    setLoading(false);
  }, [group, measure, families, channels, countries, includeFree]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setHidden(new Set()); }, [group]);

  // Series per key, dense daily, through the last day with data.
  const model_ = useMemo(() => {
    if (!rows.length) return null;
    const lastDate = rows.reduce((m, r) => (r.d > m ? r.d : m), "");
    const firstDate = rows.reduce((m, r) => (r.d < m ? r.d : m), lastDate);
    const byKey = new Map();
    rows.forEach((r) => {
      if (!byKey.has(r.k)) byKey.set(r.k, { key: r.k, label: r.label || r.k, map: {} });
      byKey.get(r.k).map[r.d] = (byKey.get(r.k).map[r.d] || 0) + Number(r.v);
    });
    let keys = [...byKey.values()].map((s) => ({ ...s, ...densify(s.map, firstDate, lastDate) }));
    keys.forEach((s) => { s.total = sum(s.values.slice(-91)); });
    keys.sort((a, b) => (a.key === "Other") - (b.key === "Other") || b.total - a.total);
    // Eight colour slots: keep the 7 biggest (last 91 days) and fold the rest,
    // including anything with no recent sales, into "Other".
    const named = keys.filter((s) => s.key !== "Other" && s.total > 0);
    if (keys.length > 8 || named.length < keys.filter((s) => s.key !== "Other").length) {
      const keep = named.slice(0, 7);
      const fold = keys.filter((s) => !keep.includes(s));
      if (fold.length) {
        const other = { key: "Other", label: "Other", dates: fold[0].dates, values: fold[0].values.map((_, i) => sum(fold.map((f) => f.values[i]))) };
        other.total = sum(other.values.slice(-91));
        keys = other.total > 0 ? [...keep, other] : keep;
      }
    }
    const slots = PALETTE[mode];
    keys = keys.map((s, i) => ({ ...s, color: s.key === "Other" ? OTHER_COLOR[mode] : slots[i % slots.length] }));
    return { lastDate, firstDate, keys };
  }, [rows, mode]);

  const visibleKeys = useMemo(() => (model_ ? model_.keys.filter((k) => !hidden.has(k.key)) : []), [model_, hidden]);

  // Forecast per visible series (cheap: a few hundred ms max for 9 series).
  const forecasts = useMemo(() => {
    const H = Number(horizon);
    if (!model_ || !H) return {};
    const out = {};
    visibleKeys.forEach((s) => { const f = forecast({ dates: s.dates, values: s.values }, { horizon: H, model }); if (f) out[s.key] = f; });
    return out;
  }, [model_, visibleKeys, horizon, model]);

  // Chart data in the selected range and view.
  const chart = useMemo(() => {
    if (!model_) return null;
    const H = Number(horizon) || 0;
    const end = model_.lastDate;
    const start = range === "all" ? model_.firstDate : addDays(end, -Number(range) + 1);
    const allDates = [];
    for (let d = start; d <= addDays(end, H); d = addDays(d, 1)) allDates.push(d);
    const base = dayIndex(model_.firstDate);
    const idxOf = (s, d) => { const i = dayIndex(d) - base; return i >= 0 && i < s.values.length ? i : -1; };
    const transform = (vals) => {
      if (view === "ma7") return movingAverage(vals.map((v) => v ?? 0), 7).map((v, i) => (vals[i] == null ? null : v));
      return vals;
    };
    const single = visibleKeys.length === 1;
    const series = [];
    visibleKeys.forEach((s) => {
      // Pull extra history so a 7-day average is defined at the left edge.
      const pre = 6;
      const ext = []; for (let d = addDays(start, -pre); d <= addDays(end, H); d = addDays(d, 1)) ext.push(d);
      const actual = ext.map((d) => { const i = idxOf(s, d); return i >= 0 ? s.values[i] : null; });
      series.push({ key: s.key, label: s.label, color: s.color, kind: "actual", values: transform(actual).slice(pre) });
      if (compareLY && single) {
        const ly = ext.map((d) => { const i = idxOf(s, addDays(d, -364)); return i >= 0 ? s.values[i] : null; });
        series.push({ key: s.key, label: s.label, color: T.text3, kind: "lastyear", values: transform(ly).slice(pre) });
      }
      const f = forecasts[s.key];
      if (f) {
        const fmap = Object.fromEntries(f.points.map((p) => [p.date, p]));
        const raw = ext.map((d) => (fmap[d] ? fmap[d].value : d === end ? s.values[s.values.length - 1] : null));
        const fvals = view === "ma7"
          ? movingAverage(ext.map((d) => { const i = idxOf(s, d); return fmap[d] ? fmap[d].value : i >= 0 ? s.values[i] : 0; }), 7).map((v, i) => (ext[i] >= end ? v : null))
          : raw;
        series.push({
          key: s.key, label: s.label, color: s.color, kind: "forecast", values: fvals.slice(pre),
          lo: single ? ext.map((d) => (fmap[d] ? fmap[d].lo : null)).slice(pre) : null,
          hi: single ? ext.map((d) => (fmap[d] ? fmap[d].hi : null)).slice(pre) : null,
        });
      }
    });
    if (view !== "weekly") return { dates: allDates, series };
    // Weekly totals (weeks starting Monday); partial edge weeks are dropped.
    const wkStart = (d) => { const dt = new Date(d + "T00:00:00Z"); const off = (dt.getUTCDay() + 6) % 7; return addDays(d, -off); };
    const weeks = [...new Set(allDates.map(wkStart))].filter((w) => w >= start && addDays(w, 6) <= addDays(end, H));
    const agg = (vals) => weeks.map((w) => { let t = 0, any = false; for (let k = 0; k < 7; k++) { const i = allDates.indexOf(addDays(w, k)); const v = i >= 0 ? vals[i] : null; if (v != null) { t += v; any = true; } } return any ? t : null; });
    return {
      dates: weeks,
      series: series.map((s) => {
        if (s.kind === "forecast") {
          // A week is "forecast" once any of its days is past the last actual day.
          const vals = weeks.map((w) => { if (addDays(w, 6) <= end) return null; let t = 0; for (let k = 0; k < 7; k++) { const d = addDays(w, k); const a = series.find((x) => x.key === s.key && x.kind === "actual"); const i = allDates.indexOf(d); t += d <= end ? (a.values[i] || 0) : (s.values[i] || 0); } return t; });
          const lo = s.lo ? weeks.map((w) => { if (addDays(w, 6) <= end) return null; let t = 0; for (let k = 0; k < 7; k++) { const i = allDates.indexOf(addDays(w, k)); t += s.lo[i] ?? (series.find((x) => x.key === s.key && x.kind === "actual").values[i] || 0); } return t; }) : null;
          const hi = s.hi ? weeks.map((w) => { if (addDays(w, 6) <= end) return null; let t = 0; for (let k = 0; k < 7; k++) { const i = allDates.indexOf(addDays(w, k)); t += s.hi[i] ?? (series.find((x) => x.key === s.key && x.kind === "actual").values[i] || 0); } return t; }) : null;
          return { ...s, values: vals, lo, hi };
        }
        if (s.kind === "actual") { const a = agg(s.values); return { ...s, values: weeks.map((w, wi) => (addDays(w, 6) <= end ? a[wi] : null)) }; }
        return { ...s, values: agg(s.values) };
      }),
    };
  }, [model_, visibleKeys, forecasts, range, view, horizon, compareLY]);

  // KPI tiles over the visible series combined.
  const kpi = useMemo(() => {
    if (!model_ || !visibleKeys.length) return null;
    const n = model_.keys[0].values.length;
    const comb = Array.from({ length: n }, (_, i) => sum(visibleKeys.map((s) => s.values[i])));
    const last = comb[n - 1], wkAgo = comb[n - 8];
    const l7 = sum(comb.slice(n - 7)), p7 = sum(comb.slice(n - 14, n - 7));
    const l28 = sum(comb.slice(n - 28)), ly28 = n > 392 ? sum(comb.slice(n - 28 - 364, n - 364)) : null;
    const fc30 = Object.keys(forecasts).length ? sum(visibleKeys.map((s) => forecasts[s.key] ? sum(forecasts[s.key].points.slice(0, 30).map((p) => p.value)) : 0)) : null;
    const fl = visibleKeys.length === 1 ? forecasts[visibleKeys[0].key] : null;
    const trend = trendPerMonth(comb.slice(-90));
    return { last, wkAgo, l7, p7, l28, ly28, fc30, fl, trend };
  }, [model_, visibleKeys, forecasts]);

  // Table rows per series.
  const table = useMemo(() => {
    if (!model_) return [];
    return model_.keys.map((s) => {
      const n = s.values.length;
      const l7 = sum(s.values.slice(n - 7)), l28 = sum(s.values.slice(n - 28));
      const ly28 = n > 392 ? sum(s.values.slice(n - 28 - 364, n - 364)) : null;
      const f = forecasts[s.key];
      return {
        key: s.key, label: s.label, color: s.color, l7, l28, yoy: ly28 ? l28 / ly28 - 1 : null, trend: trendPerMonth(s.values.slice(-90)),
        f30: f ? sum(f.points.slice(0, 30).map((p) => p.value)) : null,
        f90: f && f.points.length >= 90 ? sum(f.points.slice(0, 90).map((p) => p.value)) : null,
        model: f ? MODEL_LABELS[f.model] : null, wape: f ? f.wape : null,
      };
    });
  }, [model_, forecasts]);

  const exportCsv = () => {
    if (!model_) return;
    const H = Number(horizon) || 0;
    const head = ["date", ...visibleKeys.flatMap((s) => [s.label, ...(forecasts[s.key] ? [`${s.label} forecast`, `${s.label} low (80%)`, `${s.label} high (80%)`] : [])])];
    const lines = [head];
    const dates = []; for (let d = model_.firstDate; d <= addDays(model_.lastDate, H); d = addDays(d, 1)) dates.push(d);
    dates.forEach((d) => {
      const row = [d];
      visibleKeys.forEach((s) => {
        const i = s.dates.indexOf(d); row.push(i >= 0 ? s.values[i] : "");
        const f = forecasts[s.key]; if (f) { const p = f.points.find((x) => x.date === d); row.push(p ? Math.round(p.value) : "", p ? Math.round(p.lo) : "", p ? Math.round(p.hi) : ""); }
      });
      lines.push(row);
    });
    const csv = lines.map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `daily-${measure}-${group}-${model_.lastDate}.csv`;
    a.click();
  };

  const toggle = (arr, set, v) => set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  const mLabel = MEASURES.find(([k]) => k === measure)[1];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {/* Controls */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end" }}>
        <Field label="Show"><Seg options={MEASURES} value={measure} onChange={setMeasure} /></Field>
        <Field label="Split by"><Seg options={GROUPS} value={group} onChange={setGroup} /></Field>
        <Field label="Range"><Seg options={RANGES} value={range} onChange={setRange} /></Field>
        <Field label="View"><Seg options={VIEWS} value={view} onChange={setView} /></Field>
        <Field label="Forecast"><Seg options={HORIZONS} value={horizon} onChange={setHorizon} /></Field>
        {horizon !== "0" && <Field label="Model"><Seg options={MODELS} value={model} onChange={setModel} /></Field>}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
        <span style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginRight: 2 }}>Channel</span>
        {dims.channel.map((c) => <Chip key={c.k} on={channels.includes(c.k)} onClick={() => toggle(channels, setChannels, c.k)}>{c.k === "shopify" ? "Shopify" : c.k === "amazon" ? "Amazon" : c.k}</Chip>)}
        <span style={{ fontSize: 11, color: T.text3, fontWeight: 600, margin: "0 2px 0 10px" }}>Country</span>
        {dims.country.slice(0, 5).map((c) => <Chip key={c.k} on={countries.includes(c.k)} onClick={() => toggle(countries, setCountries, c.k)}>{c.k}</Chip>)}
        <span style={{ fontSize: 11, color: T.text3, fontWeight: 600, margin: "0 2px 0 10px" }}>Product</span>
        {dims.family.slice(0, 10).map((c) => <Chip key={c.k} on={families.includes(c.k)} onClick={() => toggle(families, setFamilies, c.k)}>{c.k}</Chip>)}
        <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: T.text2, marginLeft: 10, cursor: "pointer" }}>
          <input type="checkbox" checked={includeFree} onChange={(e) => setIncludeFree(e.target.checked)} /> Include free gifts
        </label>
        <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11.5, color: T.text2, cursor: "pointer" }}>
          <input type="checkbox" checked={compareLY} onChange={(e) => setCompareLY(e.target.checked)} /> Last year
        </label>
        {(channels.length || countries.length || families.length) ? <button onClick={() => { setChannels([]); setCountries([]); setFamilies([]); }} style={{ fontSize: 11, color: T.accent, background: "none", border: "none", cursor: "pointer" }}>Clear filters</button> : null}
      </div>

      {error && <div style={{ padding: 12, borderRadius: 8, background: T.redDim, color: T.red, fontSize: 12.5 }}>Couldn't load daily units: {error}</div>}

      {/* KPI tiles */}
      {kpi && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Tile label={`${mLabel} · ${fmtDate(model_.lastDate)}`} value={fmtN(kpi.last, measure)} delta={kpi.wkAgo ? kpi.last / kpi.wkAgo - 1 : null} sub="vs same day last week" />
          <Tile label="Last 7 days" value={fmtN(kpi.l7, measure)} delta={kpi.p7 ? kpi.l7 / kpi.p7 - 1 : null} sub={`vs prior 7 · ${fmtN(kpi.l7 / 7, measure)}/day`} />
          <Tile label="Last 28 days" value={fmtN(kpi.l28, measure)} delta={kpi.ly28 ? kpi.l28 / kpi.ly28 - 1 : null} sub={kpi.ly28 ? "vs same 28 days last year" : "no year-ago data"} />
          <Tile label="90-day trend" value={fmtPct(kpi.trend)} sub="per month (7-day average)" />
          {kpi.fc30 != null && <Tile label="Forecast next 30 days" value={fmtN(kpi.fc30, measure)}
            sub={kpi.fl ? `${MODEL_LABELS[kpi.fl.model]} · backtest error ${kpi.fl.wape != null ? (kpi.fl.wape * 100).toFixed(1) + "%" : "-"}` : `sum of ${visibleKeys.length} series forecasts`} />}
        </div>
      )}

      {/* Chart */}
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 12px 6px" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 6, flexWrap: "wrap" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{view === "weekly" ? "Weekly" : "Daily"} {mLabel.toLowerCase()} ordered{group !== "total" ? ` by ${GROUPS.find(([k]) => k === group)[1].toLowerCase()}` : ""}</div>
          {kpi?.fl && <div style={{ fontSize: 11.5, color: T.text3 }}>{kpi.fl.reason}. Shaded band: 80% range.</div>}
          <div style={{ flex: 1 }} />
          <button onClick={exportCsv} disabled={!model_} style={{ fontSize: 11.5, padding: "4px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text2, cursor: "pointer" }}>Download CSV</button>
        </div>
        {loading && !chart ? <div style={{ height: 340, display: "flex", alignItems: "center", justifyContent: "center", color: T.text3, fontSize: 12.5 }}>Loading daily units…</div>
          : chart && chart.series.length ? <div style={{ opacity: loading ? 0.5 : 1, transition: "opacity .15s" }}><LineChart dates={chart.dates} series={chart.series} measure={measure} mode={mode} /></div>
          : <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: T.text3, fontSize: 12.5 }}>No orders match these filters.</div>}
        {/* Legend (click to hide/show a series) */}
        {model_ && model_.keys.length > 1 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, padding: "6px 4px 4px" }}>
            {model_.keys.map((s) => (
              <button key={s.key} onClick={() => setHidden((h) => { const n = new Set(h); n.has(s.key) ? n.delete(s.key) : n.add(s.key); return n; })}
                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, color: hidden.has(s.key) ? T.text3 : T.text2, background: "none", border: "none", cursor: "pointer", textDecoration: hidden.has(s.key) ? "line-through" : "none", padding: 0 }}>
                <span style={{ width: 14, height: 3, borderRadius: 2, background: s.color, opacity: hidden.has(s.key) ? 0.3 : 1 }} />{s.label}
              </button>
            ))}
          </div>
        )}
        {model_ && compareLY && visibleKeys.length > 1 && <div style={{ fontSize: 11, color: T.text3, padding: "0 4px 4px" }}>Last-year line and forecast band show when one series is selected (click legend items to hide others).</div>}
      </div>

      {/* Table */}
      {table.length > 0 && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: "right", color: T.text3, fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                {["", "Last 7 days", "Last 28 days", "vs last year", "Trend / month", "Forecast 30d", "Forecast 90d", "Model", "Backtest error"].map((h, i) => <th key={i} style={{ padding: "9px 12px", textAlign: i === 0 || i === 7 ? "left" : "right", fontWeight: 700, borderBottom: `1px solid ${T.border}` }}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {table.map((r) => (
                <tr key={r.key} style={{ borderBottom: `1px solid ${T.border}`, opacity: hidden.has(r.key) ? 0.45 : 1 }}>
                  <td style={{ padding: "8px 12px", color: T.text, fontWeight: 600, maxWidth: 320 }}>
                    <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 2, background: r.color, marginRight: 8, verticalAlign: "-1px" }} />
                    {r.label}{group === "sku" && r.key !== r.label && r.key !== "Other" ? <span style={{ color: T.text3, fontWeight: 400 }}> · {r.key}</span> : null}
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: T.text }}>{fmtN(r.l7, measure)}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: T.text }}>{fmtN(r.l28, measure)}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: r.yoy == null ? T.text3 : r.yoy >= 0 ? T.green : T.red }}>{fmtPct(r.yoy)}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: T.text2 }}>{fmtPct(r.trend)}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: T.text }}>{fmtN(r.f30, measure)}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: T.text }}>{fmtN(r.f90, measure)}</td>
                  <td style={{ padding: "8px 12px", color: T.text2 }}>{r.model || "-"}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: T.text2 }}>{r.wape != null ? `${(r.wape * 100).toFixed(1)}%` : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div style={{ fontSize: 11, color: T.text3, lineHeight: 1.5 }}>
        Source: warehouse order lines (Shopify from Jul 2024, Amazon from Dec 2023), refreshed daily at 9:30am and 12:30pm ET; through {model_ ? fmtDateY(model_.lastDate) : "-"}.
        {" "}Units = items ordered; Packs = units x pack size from the SKU catalog. Free gifts and non-product lines (shipping, protection) are excluded unless turned on.
        {" "}Backtest error = average miss (WAPE) when forecasting 28 days ahead from each of the last three 4-week points.
      </div>
    </div>
  );
}
