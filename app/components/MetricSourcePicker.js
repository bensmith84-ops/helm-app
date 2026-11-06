"use client";
// Where an auto-calculated number comes from: a Scoreboard metric, any Metabase
// question / model / warehouse table, or (key results) a Scorecard metric.
//
// value: null (manual) or
//   {kind:'scoreboard', key, agg, weight_key}
//   {kind:'metabase', model, id, db, name, where, date:{ref,name}, value:{ref,name}|null, day_agg, filters[], agg}
//   {kind:'scorecard', metric_id}                         (mode 'kr' only)
//   + window_agg in mode 'kr'
// mode: 'scorecard' (weekly roll-up) | 'kr' (value over the KR period)

import { useEffect, useRef, useState } from "react";
import { invokeFunction } from "../lib/invokeFunction";
import { T } from "../tokens";

export const SCOREBOARD_KEYS = ["revenue","amazon_revenue","ad_spend","cpa","dtc_cac","x_cac","gwp_cpa","nc_aov","net_dollars","total_orders","new_orders","amazon_total_orders","units_shipped","dtc_new_customers","amz_new_customers","traffic","blended_cvr","new_gwp_subs","new_shopify_subs","daily_cancels","net_daily_subs","amz_net_subs","sub_rate","upsell_take_rate","comp_yago","opex_pct_rev"];

const WEEK_AGGS = [
  { v: "sum", l: "Sum: total for the week" },
  { v: "average", l: "Average: of the daily values" },
  { v: "weighted_average", l: "Weighted average: by another metric", scoreboardOnly: true },
  { v: "last", l: "Last: the last day's value" },
];
const WINDOW_AGGS = [
  { v: "total", l: "Total over the KR period" },
  { v: "avg_week", l: "Average per week" },
  { v: "avg_day", l: "Average per day" },
  { v: "latest_week", l: "Latest full week" },
  { v: "latest", l: "Latest value" },
];
const DAY_AGGS = [
  { v: "sum", l: "Sum of" }, { v: "avg", l: "Average of" }, { v: "count", l: "Count of rows" },
  { v: "distinct", l: "Distinct count of" }, { v: "max", l: "Max of" }, { v: "min", l: "Min of" },
];
const OPS = [
  { v: "=", l: "is" }, { v: "!=", l: "is not" }, { v: "contains", l: "contains" }, { v: "does-not-contain", l: "doesn't contain" },
  { v: ">", l: ">" }, { v: ">=", l: "≥" }, { v: "<", l: "<" }, { v: "<=", l: "≤" },
];

// Scorecard row <-> picker value
export function sourceFromMetric(m) {
  if (!m || !m.auto_source) return null;
  if (m.auto_source === "metabase") return m.source_config ? { ...m.source_config, kind: "metabase", agg: m.auto_agg || "sum" } : null;
  return { kind: "scoreboard", key: m.auto_source, agg: m.auto_agg || "sum", weight_key: m.auto_weight_key || "" };
}
export function metricFieldsFromSource(s) {
  if (!s || (s.kind === "scoreboard" && !s.key) || (s.kind === "metabase" && !s.id)) return { auto_source: null, auto_agg: null, auto_weight_key: null, source_config: null };
  if (s.kind === "scoreboard") return { auto_source: s.key, auto_agg: s.agg || "sum", auto_weight_key: s.agg === "weighted_average" ? (s.weight_key || null) : null, source_config: null };
  const { agg, kind, ...cfg } = s;
  return { auto_source: "metabase", auto_agg: agg === "weighted_average" ? "sum" : (agg || "sum"), auto_weight_key: null, source_config: { kind: "metabase", ...cfg } };
}
export function describeSource(s) {
  if (!s) return "Manual";
  if (s.kind === "scoreboard") return `Scoreboard: ${String(s.key || "").replace(/_/g, " ")}`;
  if (s.kind === "scorecard") return "Scorecard metric";
  if (s.kind === "mb_report") return `Metabase report: ${s.agg === "ratio" ? `${s.value_col} ÷ ${s.denom_col}` : `${s.agg || "sum"} of ${s.value_col || "?"}`} in "${s.card_name || ""}"`;
  const what = s.day_agg === "count" ? "count of rows" : `${(DAY_AGGS.find(a => a.v === s.day_agg)?.l || "Sum of").toLowerCase()} ${s.value?.name || ""}`;
  return `Metabase: ${what} in "${s.name}"`;
}

const fmtNum = (v) => v == null ? "–" : Math.abs(v) >= 1000 ? Math.round(v).toLocaleString() : (Math.round(v * 100) / 100).toLocaleString();
const shortDate = (d) => { const x = new Date(d + "T12:00:00"); return x.toLocaleDateString(undefined, { month: "short", day: "numeric" }); };

export default function MetricSourcePicker({ value, onChange, mode = "scorecard", scorecardMetrics = [], krWindow = null, hideWindowAgg = false, windowAgg = null }) {
  const kind = value?.kind || "manual";
  const set = (patch) => onChange({ ...(value || {}), ...patch });
  const setKind = (k) => {
    if (k === "manual") return onChange(null);
    const base = mode === "kr" ? { window_agg: value?.window_agg || "total" } : { agg: value?.agg && value.agg !== "weighted_average" ? value.agg : "sum" };
    if (k === "scoreboard") onChange({ kind: k, key: "", ...base, agg: value?.agg || "sum" });
    else if (k === "metabase") onChange({ kind: k, day_agg: "sum", filters: [], ...base });
    else if (k === "mb_report") onChange({ kind: k, agg: "sum", params: {}, row_filters: [], ...base, agg: "sum" });
    else onChange({ kind: k, metric_id: "", ...base });
  };

  const lbl = { fontSize: 10, color: T.text3, fontWeight: 600, display: "block", marginBottom: 3, textTransform: "uppercase", letterSpacing: ".03em" };
  const sel = { width: "100%", padding: "6px 8px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 12, outline: "none", boxSizing: "border-box" };
  const kinds = [["manual", "Manual"], ["scoreboard", "Scoreboard"], ["metabase", "Metabase"], ...(mode === "kr" ? [["mb_report", "Metabase report"], ["scorecard", "Scorecard metric"]] : [])];

  return (
    <div style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: `1px solid ${T.border}`, width: "fit-content", maxWidth: "100%", flexWrap: "wrap" }}>
        {kinds.map(([k, l]) => (
          <button key={k} type="button" onClick={() => setKind(k)}
            style={{ padding: "6px 12px", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", background: kind === k ? T.accent : T.surface3, color: kind === k ? "#fff" : T.text2 }}>{l}</button>
        ))}
      </div>

      {kind === "scoreboard" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10 }}>
          <div><label style={lbl}>Scoreboard metric</label>
            <select value={value.key || ""} onChange={e => set({ key: e.target.value })} style={sel}>
              <option value="">Select…</option>
              {SCOREBOARD_KEYS.map(k => <option key={k} value={k}>{k.replace(/_/g, " ")}</option>)}
            </select></div>
          {mode === "scorecard" && <div><label style={lbl}>Each week</label>
            <select value={value.agg || "sum"} onChange={e => set({ agg: e.target.value })} style={sel}>
              {WEEK_AGGS.map(a => <option key={a.v} value={a.v}>{a.l}</option>)}
            </select></div>}
          {mode === "scorecard" && value.agg === "weighted_average" && <div><label style={lbl}>Weight by</label>
            <select value={value.weight_key || ""} onChange={e => set({ weight_key: e.target.value })} style={sel}>
              <option value="">Select…</option>
              {SCOREBOARD_KEYS.filter(k => k !== value.key).map(k => <option key={k} value={k}>{k.replace(/_/g, " ")}</option>)}
            </select></div>}
        </div>
      )}

      {kind === "metabase" && <MetabaseSource value={value} set={set} lbl={lbl} sel={sel} mode={mode} />}
      {kind === "mb_report" && <MetabaseReportSource value={value} set={set} lbl={lbl} sel={sel} />}

      {kind === "scorecard" && (
        <div><label style={lbl}>Scorecard metric (weekly values)</label>
          <select value={value.metric_id || ""} onChange={e => set({ metric_id: e.target.value })} style={sel}>
            <option value="">Select…</option>
            {scorecardMetrics.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select></div>
      )}

      {kind !== "manual" && mode === "kr" && !hideWindowAgg && (
        <div><label style={lbl}>Key result value</label>
          <select value={value.window_agg || "total"} onChange={e => set({ window_agg: e.target.value })} style={sel}>
            {WINDOW_AGGS.map(a => <option key={a.v} value={a.v}>{a.l}</option>)}
          </select>
          <div style={{ fontSize: 10, color: T.text3, marginTop: 4 }}>
            {krWindow?.from ? `Period: ${krWindow.from} to ${krWindow.to || "today"} (the KR's dates, else its objective's or cycle's)` : "Set a start date on this KR, its objective or its cycle."}
          </div></div>
      )}

      {kind !== "manual" && <Preview value={windowAgg ? { ...value, window_agg: windowAgg } : value} mode={mode} krWindow={krWindow} />}
    </div>
  );
}

function MetabaseSource({ value, set, lbl, sel, mode }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [meta, setMeta] = useState(null);
  const timer = useRef(null);

  // Columns of the chosen source
  useEffect(() => {
    if (!value.id) { setMeta(null); return; }
    let live = true;
    invokeFunction("metric-source", { body: { action: "fields", model: value.model, id: value.id } }).then(({ data, error }) => {
      if (!live) return;
      if (error) setErr(error.message); else setMeta(data);
    });
    return () => { live = false; };
  }, [value.model, value.id]);

  const runSearch = (text) => {
    setQ(text);
    clearTimeout(timer.current);
    if (text.trim().length < 2) { setResults(null); return; }
    timer.current = setTimeout(async () => {
      setBusy(true); setErr(null);
      const { data, error } = await invokeFunction("metric-source", { body: { action: "search", q: text.trim() } });
      setBusy(false);
      if (error) setErr(error.message); else setResults(data.results || []);
    }, 350);
  };

  const pick = (r) => {
    setResults(null); setQ("");
    set({ model: r.model, id: r.id, db: r.db, name: r.name, where: r.where, date: null, value: null, filters: [] });
  };

  // Pre-select sensible columns once they load
  useEffect(() => {
    if (!meta || !value.id || meta.id !== value.id) return;
    const patch = {};
    if (!value.date) { const d = meta.columns.find(c => c.kind === "date"); if (d) patch.date = { ref: d.ref, name: d.label }; }
    if (!value.value && value.day_agg !== "count") { const n = meta.columns.find(c => c.kind === "number" && !/(^|_)id$/i.test(c.name)); if (n) patch.value = { ref: n.ref, name: n.label }; }
    if (Object.keys(patch).length) set(patch);
  }, [meta]); // eslint-disable-line react-hooks/exhaustive-deps

  const cols = meta?.columns || [];
  const colKey = (ref) => (ref ? JSON.stringify(ref.slice(0, 2)) : "null");
  const byKey = Object.fromEntries(cols.map(c => [colKey(c.ref), c]));
  const pickCol = (k) => { const c = byKey[k]; return c ? { ref: c.ref, name: c.label } : null; };
  const filters = value.filters || [];
  const setFilter = (i, patch) => set({ filters: filters.map((f, j) => j === i ? { ...f, ...patch } : f) });

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {!value.id || results ? (
        <div style={{ position: "relative" }}>
          <label style={lbl}>Search Metabase questions, models and tables</label>
          <input autoFocus value={q} onChange={e => runSearch(e.target.value)} placeholder="e.g. subscriptions, revenue, orders, cancels"
            style={{ ...sel, padding: "8px 10px" }} />
          {busy && <div style={{ fontSize: 11, color: T.text3, marginTop: 4 }}>Searching…</div>}
          {results && results.length > 0 && (
            <div style={{ marginTop: 6, maxHeight: 260, overflow: "auto", border: `1px solid ${T.border}`, borderRadius: 8, background: T.surface }}>
              {results.map(r => (
                <button key={r.model + r.id} type="button" onClick={() => pick(r)}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", border: "none", borderBottom: `1px solid ${T.border}`, background: "transparent", cursor: "pointer", color: T.text }}>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 8, marginRight: 6, background: r.model === "table" ? "#3b82f620" : r.model === "dataset" ? "#a855f720" : `${T.accent}20`, color: r.model === "table" ? "#3b82f6" : r.model === "dataset" ? "#a855f7" : T.accent }}>{r.kind}</span>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{r.name}</span>
                  <span style={{ fontSize: 11, color: T.text3, marginLeft: 6 }}>{r.where}</span>
                  {r.description && <div style={{ fontSize: 11, color: T.text3, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.description}</div>}
                </button>
              ))}
            </div>
          )}
          {results && results.length === 0 && q.trim().length >= 2 && !busy && <div style={{ fontSize: 12, color: T.text3, marginTop: 6 }}>Nothing found for "{q}".</div>}
          {value.id && <button type="button" onClick={() => setResults(null)} style={{ marginTop: 6, fontSize: 11, background: "none", border: "none", color: T.text3, cursor: "pointer", padding: 0 }}>Keep "{value.name}"</button>}
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, background: T.surface2, border: `1px solid ${T.border}` }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value.name}</div>
            <div style={{ fontSize: 11, color: T.text3 }}>{value.model === "table" ? "Table" : value.model === "dataset" ? "Model" : "Question"} #{value.id} · {value.where}</div>
          </div>
          <button type="button" onClick={() => setResults([])} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.text2, cursor: "pointer" }}>Change</button>
        </div>
      )}
      {err && <div style={{ fontSize: 11, color: "#ef4444" }}>{err}</div>}
      {meta?.warning && <div style={{ fontSize: 11, color: "#f59e0b" }}>{meta.warning}</div>}

      {value.id && meta && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
            <div><label style={lbl}>Date column</label>
              <select value={colKey(value.date?.ref)} onChange={e => set({ date: pickCol(e.target.value) })} style={sel}>
                <option value="null">Select…</option>
                {cols.filter(c => c.kind === "date").map(c => <option key={colKey(c.ref)} value={colKey(c.ref)}>{c.label}</option>)}
              </select></div>
            <div><label style={lbl}>Each day</label>
              <select value={value.day_agg || "sum"} onChange={e => set({ day_agg: e.target.value })} style={sel}>
                {DAY_AGGS.map(a => <option key={a.v} value={a.v}>{a.l}</option>)}
              </select></div>
            {value.day_agg !== "count" && <div><label style={lbl}>Column</label>
              <select value={colKey(value.value?.ref)} onChange={e => set({ value: pickCol(e.target.value) })} style={sel}>
                <option value="null">Select…</option>
                {cols.filter(c => value.day_agg === "distinct" ? c.kind !== "date" : c.kind === "number").map(c => <option key={colKey(c.ref)} value={colKey(c.ref)}>{c.label}</option>)}
              </select></div>}
            {mode === "scorecard" && <div><label style={lbl}>Each week</label>
              <select value={value.agg || "sum"} onChange={e => set({ agg: e.target.value })} style={sel}>
                {WEEK_AGGS.filter(a => !a.scoreboardOnly).map(a => <option key={a.v} value={a.v}>{a.l}</option>)}
              </select></div>}
          </div>
          <div>
            <label style={lbl}>Only rows where (optional)</label>
            {filters.map((f, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 2fr auto", gap: 6, marginBottom: 6 }}>
                <select value={colKey(f.ref)} onChange={e => { const c = byKey[e.target.value]; setFilter(i, c ? { ref: c.ref, name: c.label, kind: c.kind } : { ref: null }); }} style={sel}>
                  <option value="null">Column…</option>
                  {cols.filter(c => c.kind !== "date").map(c => <option key={colKey(c.ref)} value={colKey(c.ref)}>{c.label}</option>)}
                </select>
                <select value={f.op || "="} onChange={e => setFilter(i, { op: e.target.value })} style={sel}>
                  {OPS.filter(o => f.kind === "number" ? !o.v.includes("contain") : true).map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
                <input value={f.value ?? ""} onChange={e => setFilter(i, { value: e.target.value })} placeholder="value" style={sel} />
                <button type="button" onClick={() => set({ filters: filters.filter((_, j) => j !== i) })} style={{ border: "none", background: "none", color: T.text3, cursor: "pointer", fontSize: 14 }}>×</button>
              </div>
            ))}
            {filters.length < 5 && <button type="button" onClick={() => set({ filters: [...filters, { ref: null, op: "=", value: "" }] })}
              style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: `1px dashed ${T.border}`, background: "transparent", color: T.text2, cursor: "pointer" }}>+ Filter</button>}
          </div>
        </>
      )}
    </div>
  );
}

// A question on a Metabase dashboard, run with chosen filter values (e.g. the
// "Product Type CPA" monthly summary for Dish / Shopify / all cohorts). Rows carry a
// period column (date, "2026-09" or "Sep 2026"); the KR value is the sum, average or
// latest of a column over the KR window, or a ratio of two summed columns (CPA).
function MetabaseReportSource({ value, set, lbl, sel }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [dash, setDash] = useState(null);
  const [cols, setCols] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    if (!value.dashboard_id) { setDash(null); return; }
    let live = true;
    invokeFunction("metric-source", { body: { action: "dashboard", id: value.dashboard_id } }).then(({ data, error }) => { if (live) { if (error) setErr(error.message); else setDash(data); } });
    return () => { live = false; };
  }, [value.dashboard_id]);

  const search = (text) => {
    setQ(text); clearTimeout(timer.current);
    if (text.trim().length < 2) { setResults(null); return; }
    timer.current = setTimeout(async () => {
      const { data, error } = await invokeFunction("metric-source", { body: { action: "dashboards", q: text.trim() } });
      if (error) setErr(error.message); else setResults(data.results || []);
    }, 350);
  };
  const card = dash?.cards?.find(c => c.dashcard_id === value.dashcard_id);
  const loadCols = async (cfg = value) => {
    setBusy(true); setErr(null);
    const { data, error } = await invokeFunction("metric-source", { body: { action: "report_columns", config: cfg } });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setCols(data);
    const patch = {};
    if (!cfg.period_col && data.period_columns?.length) patch.period_col = data.period_columns[0];
    if (Object.keys(patch).length) set(patch);
  };
  useEffect(() => { if (value.card_id && value.period_col && !cols) loadCols(); }, [value.card_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const numCols = (cols?.columns || []).filter(c => c.kind === "number");
  const textCols = (cols?.columns || []).filter(c => c.kind !== "number");
  const rf = (value.row_filters || [])[0] || { col: "", value: "" };

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {!value.dashboard_id || results ? (
        <div>
          <label style={lbl}>Search Metabase dashboards</label>
          <input autoFocus value={q} onChange={e => search(e.target.value)} placeholder="e.g. CAC, CPA, LTR" style={{ ...sel, padding: "8px 10px" }} />
          {results && results.length > 0 && (
            <div style={{ marginTop: 6, maxHeight: 220, overflow: "auto", border: `1px solid ${T.border}`, borderRadius: 8, background: T.surface }}>
              {results.map(r => (
                <button key={r.id} type="button" onClick={() => { setResults(null); setQ(""); setCols(null); set({ dashboard_id: r.id, dashboard_name: r.name, dashcard_id: null, card_id: null, card_name: null, params: {}, period_col: null, value_col: null, denom_col: null, row_filters: [] }); }}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", border: "none", borderBottom: `1px solid ${T.border}`, background: "transparent", cursor: "pointer", color: T.text }}>
                  <span style={{ fontSize: 12, fontWeight: 600 }}>{r.name}</span><span style={{ fontSize: 11, color: T.text3, marginLeft: 6 }}>{r.where}</span>
                </button>
              ))}
            </div>
          )}
          {results && results.length === 0 && q.trim().length >= 2 && <div style={{ fontSize: 12, color: T.text3, marginTop: 6 }}>No dashboards match "{q}".</div>}
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, background: T.surface2, border: `1px solid ${T.border}` }}>
          <div style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Dashboard: {value.dashboard_name}</div>
          <button type="button" onClick={() => setResults([])} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.text2, cursor: "pointer" }}>Change</button>
        </div>
      )}
      {dash && (
        <div><label style={lbl}>Question</label>
          <select value={value.dashcard_id || ""} onChange={e => { const c = dash.cards.find(x => String(x.dashcard_id) === e.target.value); setCols(null); set({ dashcard_id: c?.dashcard_id || null, card_id: c?.card_id || null, card_name: c?.name || null, params: Object.fromEntries((c?.params || []).map(p => [p.slug, p.default])), period_col: null, value_col: null, denom_col: null, row_filters: [] }); }} style={sel}>
            <option value="">Select…</option>
            {dash.cards.map(c => <option key={c.dashcard_id} value={c.dashcard_id}>{c.tab ? `${c.tab} · ` : ""}{c.name}</option>)}
          </select></div>
      )}
      {card && card.params.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
          {card.params.map(p => {
            const cur = value.params?.[p.slug]; const curV = Array.isArray(cur) ? cur[0] : cur;
            return (
              <div key={p.slug}><label style={lbl}>{p.name}</label>
                {p.values.length ? (
                  <select value={curV ?? ""} onChange={e => { setCols(null); set({ params: { ...(value.params || {}), [p.slug]: e.target.value === "" ? null : [e.target.value] } }); }} style={sel}>
                    <option value="">{p.default != null ? `Default (${[].concat(p.default).join(", ")})` : "Any"}</option>
                    {p.values.map(v => <option key={String(v.value)} value={v.value}>{String(v.label).replace(/[├└│─]/g, "").trim()}</option>)}
                  </select>
                ) : (
                  <input value={curV ?? ""} onChange={e => { setCols(null); set({ params: { ...(value.params || {}), [p.slug]: e.target.value === "" ? null : [e.target.value] } }); }} placeholder={p.default != null ? String([].concat(p.default).join(", ")) : "Any"} style={sel} />
                )}
              </div>
            );
          })}
        </div>
      )}
      {card && (
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button type="button" onClick={() => loadCols()} disabled={busy}
            style={{ fontSize: 11, fontWeight: 600, padding: "5px 12px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.text2, cursor: busy ? "default" : "pointer" }}>
            {busy ? "Running…" : cols ? "Re-run with these filters" : "Load columns"}
          </button>
          {cols && <span style={{ fontSize: 11, color: T.text3 }}>{cols.columns.length} columns</span>}
        </div>
      )}
      {err && <div style={{ fontSize: 11, color: "#ef4444" }}>{err}</div>}
      {cols && (
        <>
          {cols.period_columns.length === 0 && <div style={{ fontSize: 11, color: "#f59e0b" }}>No column in this question reads as a date or month, so it can't be lined up with the KR period.</div>}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
            <div><label style={lbl}>Period column</label>
              <select value={value.period_col || ""} onChange={e => set({ period_col: e.target.value || null })} style={sel}>
                <option value="">Select…</option>
                {cols.period_columns.map(c => <option key={c} value={c}>{cols.columns.find(x => x.name === c)?.label || c}</option>)}
              </select></div>
            <div><label style={lbl}>Combine</label>
              <select value={value.agg || "sum"} onChange={e => set({ agg: e.target.value })} style={sel}>
                <option value="sum">Sum of</option><option value="avg">Average of</option><option value="latest">Latest</option><option value="ratio">Ratio: sum of A ÷ sum of B</option>
              </select></div>
            <div><label style={lbl}>{value.agg === "ratio" ? "A (numerator)" : "Column"}</label>
              <select value={value.value_col || ""} onChange={e => set({ value_col: e.target.value || null })} style={sel}>
                <option value="">Select…</option>
                {numCols.map(c => <option key={c.name} value={c.name}>{c.label}</option>)}
              </select></div>
            {value.agg === "ratio" && <div><label style={lbl}>B (divide by)</label>
              <select value={value.denom_col || ""} onChange={e => set({ denom_col: e.target.value || null })} style={sel}>
                <option value="">Select…</option>
                {numCols.map(c => <option key={c.name} value={c.name}>{c.label}</option>)}
              </select></div>}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div><label style={lbl}>Only rows where (optional)</label>
              <select value={rf.col} onChange={e => set({ row_filters: e.target.value ? [{ col: e.target.value, value: rf.value }] : [] })} style={sel}>
                <option value="">No filter</option>
                {textCols.filter(c => c.name !== value.period_col).map(c => <option key={c.name} value={c.name}>{c.label}</option>)}
              </select></div>
            {rf.col && <div><label style={lbl}>equals</label>
              <input value={rf.value || ""} onChange={e => set({ row_filters: [{ col: rf.col, value: e.target.value }] })} placeholder={String(cols.sample?.[0]?.[rf.col] ?? "")} style={sel} /></div>}
          </div>
          {value.agg === "ratio" && <div style={{ fontSize: 10, color: T.text3 }}>For CPA use Spend ÷ Customers: the ratio stays exact over any number of months, where averaging monthly CPAs would not.</div>}
        </>
      )}
    </div>
  );
}

function Preview({ value, mode, krWindow }) {
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const ready = value.kind === "scoreboard" ? !!value.key : value.kind === "scorecard" ? !!value.metric_id
    : value.kind === "mb_report" ? !!(value.card_id && value.period_col && value.value_col && (value.agg !== "ratio" || value.denom_col))
    : !!(value.id && value.date && (value.day_agg === "count" || value.value));
  useEffect(() => { setRes(null); }, [JSON.stringify(value)]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!ready) return null;
  const run = async () => {
    setBusy(true);
    const body = mode === "kr"
      ? { action: "preview", config: value, from: krWindow?.from, to: krWindow?.to }
      : { action: "preview", config: value, weeks: 8, agg: value.agg };
    const { data, error } = await invokeFunction("metric-source", { body });
    setBusy(false);
    setRes(error ? { error: error.message } : data);
  };
  const noWindow = mode === "kr" && !krWindow?.from;
  return (
    <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 8 }}>
      <button type="button" onClick={run} disabled={busy || noWindow}
        style={{ fontSize: 11, fontWeight: 600, padding: "5px 12px", borderRadius: 6, border: `1px solid ${T.accent}60`, background: `${T.accent}10`, color: T.accent, cursor: busy || noWindow ? "default" : "pointer", opacity: noWindow ? .5 : 1 }}>
        {busy ? "Loading…" : res ? "Refresh preview" : "Preview numbers"}
      </button>
      {res?.error && <div style={{ fontSize: 11, color: "#ef4444", marginTop: 6 }}>{res.error}</div>}
      {krWindow?.note && <div style={{ fontSize: 11, color: T.text3, marginTop: 6 }}>{krWindow.note}</div>}
      {res?.note && <div style={{ fontSize: 11, color: T.text3, marginTop: 6 }}>{res.note}</div>}
      {res && !res.error && !res.note && (
        <div style={{ marginTop: 8 }}>
          {mode === "kr" && <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 6 }}>Current value: {fmtNum(res.value)} <span style={{ fontSize: 11, fontWeight: 500, color: T.text3 }}>from {res.points} {res.unit} of data</span></div>}
          {(res.weeks || []).length === 0 ? <div style={{ fontSize: 11, color: T.text3 }}>No rows in this period. Check the date column and filters.</div> : (
            <div style={{ display: "flex", gap: 4, overflowX: "auto", paddingBottom: 2 }}>
              {res.weeks.slice(-10).map(w => (
                <div key={w.week} style={{ minWidth: 62, padding: "4px 6px", borderRadius: 6, background: T.surface2, textAlign: "right" }}>
                  <div style={{ fontSize: 9, color: T.text3 }}>wk {shortDate(w.week)}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: T.text, fontVariantNumeric: "tabular-nums" }}>{fmtNum(w.value)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
