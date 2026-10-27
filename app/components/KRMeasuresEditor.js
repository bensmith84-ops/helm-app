"use client";
// Edit the values a key result is measured by: one or more values, each with its
// own comparison (<, ≤, =, ≥, >) and target, whether all or any must be met, and
// the period they're measured over (week / month / quarter / whole KR).

import { T } from "../tokens";
import MetricSourcePicker from "./MetricSourcePicker";
import { OPS, KINDS, PERIODS, EVALS, KIND_TO_WINDOW, evalKR, periodWindow, fmtValue } from "../lib/krMeasures";

// Number input that shows thousands separators (1,000,000) and stores a number.
function NumInput({ value, onChange, disabled, style, placeholder }) {
  const show = (v) => {
    if (v === "" || v == null) return "";
    const s = String(v);
    if (/[^0-9.\-]/.test(s.replace(/,/g, ""))) return s;
    const [i, d] = s.replace(/,/g, "").split(".");
    const int = i === "-" ? "-" : i ? Number(i).toLocaleString("en-US") : "";
    return d !== undefined ? `${int}.${d}` : int;
  };
  return (
    <input inputMode="decimal" value={show(value)} disabled={disabled} placeholder={placeholder}
      onChange={e => { const raw = e.target.value.replace(/,/g, "").replace(/[^0-9.\-]/g, ""); onChange(raw === "" ? "" : /[.\-]$/.test(raw) ? raw : raw); }}
      style={{ ...style, textAlign: "right", fontVariantNumeric: "tabular-nums" }} />
  );
}

export default function KRMeasuresEditor({ d, editSet, scMetrics, krDates, isMobile, lbl, inp }) {
  const measures = Array.isArray(d.measures) && d.measures.length ? d.measures : [{ id: "m0", label: "", current_value: 0, target_value: "", unit: "", op: ">=", kind: "total" }];
  const setMeasures = (next) => editSet("measures", next);
  const setM = (i, patch) => setMeasures(measures.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const period = d.measure_period || "kr", ev = d.period_eval || (period === "kr" ? "to_date" : "last_complete");
  const krLike = { ...d, measures, measure_period: period, period_eval: ev, start_date: krDates.from, end_date: krDates.to };
  const win = periodWindow(krLike);
  const result = evalKR(krLike);
  const ci = { ...inp, padding: "6px 8px", fontSize: 12 };
  const sel = { ...ci, cursor: "pointer" };

  return (
    <div style={{ marginBottom: 12, padding: "12px 14px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface2 }}>
      <label style={{ ...lbl, marginBottom: 10 }}>Values</label>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
        <div><label style={lbl}>Measured</label>
          <select value={period} onChange={e => { editSet("measure_period", e.target.value); if (e.target.value === "kr") editSet("period_eval", "to_date"); }} style={sel}>
            {PERIODS.map(p => <option key={p.v} value={p.v}>{p.l}</option>)}
          </select></div>
        <div><label style={lbl}>Judge on</label>
          <select value={ev} disabled={period === "kr"} onChange={e => editSet("period_eval", e.target.value)} style={{ ...sel, opacity: period === "kr" ? .6 : 1 }}>
            {EVALS.map(p => <option key={p.v} value={p.v}>{p.l}</option>)}
          </select></div>
        <div><label style={lbl}>On track when</label>
          <select value={d.measure_logic || "all"} onChange={e => editSet("measure_logic", e.target.value)} style={sel}>
            <option value="all">All values are met</option>
            <option value="any">Any one value is met</option>
          </select></div>
      </div>
      <div style={{ fontSize: 11, color: T.text3, marginBottom: 12 }}>
        {win ? <>Currently judged on <b style={{ color: T.text2 }}>{win.label}</b> ({win.from} to {win.to}).{win.toDate && win.fraction < 1 ? " Totals are projected to the full period at the current pace." : ""} Review it weekly on the Scorecard; the targets below are per {period === "kr" ? "KR period" : period}.</>
          : "Set a start date on this KR, its objective or its cycle."}
      </div>

      {measures.map((m, i) => {
        const r = result.parts[i] || {};
        return (
          <div key={m.id || i} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: `1px solid ${T.border}` }}>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1.6fr 1.1fr 1.15fr 1.1fr 52px 1fr auto auto", gap: 6, alignItems: "end" }}>
              <div><label style={lbl}>{i === 0 ? "Value" : "And value"}</label><input value={m.label || ""} onChange={e => setM(i, { label: e.target.value })} placeholder={i === 0 ? "e.g. Ad Spend" : "e.g. CPA"} style={ci} /></div>
              <div><label style={lbl}>Current</label><NumInput value={m.current_value ?? ""} placeholder="–" disabled={!!m.auto_config} onChange={v => setM(i, { current_value: v })} style={{ ...ci, opacity: m.auto_config ? .55 : 1 }} /></div>
              <div><label style={lbl}>Green when</label>
                <select value={m.op || ">="} onChange={e => setM(i, { op: e.target.value })} style={sel}>
                  {OPS.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select></div>
              <div><label style={lbl}>Target</label><NumInput value={m.target_value ?? ""} onChange={v => setM(i, { target_value: v })} style={ci} /></div>
              <div><label style={lbl}>Unit</label><input value={m.unit || ""} onChange={e => setM(i, { unit: e.target.value })} placeholder="$" style={ci} /></div>
              <div><label style={lbl}>Type</label>
                <select value={m.kind || "total"} onChange={e => setM(i, { kind: e.target.value })} title={KINDS.find(k => k.v === (m.kind || "total"))?.hint} style={sel}>
                  {KINDS.map(k => <option key={k.v} value={k.v}>{k.l}</option>)}
                </select></div>
              <button type="button" title="Calculate this value automatically" onClick={() => setM(i, { _open: !m._open })}
                style={{ height: 30, padding: "0 10px", borderRadius: 6, border: `1px solid ${m.auto_config ? T.accent + "60" : T.border}`, background: m.auto_config ? `${T.accent}15` : T.surface, color: m.auto_config ? T.accent : T.text3, cursor: "pointer", fontSize: 12 }}>⚡</button>
              <button type="button" title="Remove" disabled={measures.length === 1} onClick={() => setMeasures(measures.filter((_, j) => j !== i))}
                style={{ height: 30, padding: "0 8px", borderRadius: 6, border: "none", background: "none", color: T.text3, cursor: measures.length === 1 ? "default" : "pointer", fontSize: 16, opacity: measures.length === 1 ? .3 : 1 }}>×</button>
            </div>
            {r.noData && <div style={{ fontSize: 11, marginTop: 5, color: T.text3 }}>No current value yet: not counted until one is entered{m.auto_config ? " or calculated" : ""}.</div>}
            {r.pct != null && (
              <div style={{ fontSize: 11, marginTop: 5, color: r.color, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700 }}>{r.met ? "✓ Met" : `${Math.min(r.pct, 999)}% of target`}</span>
                {r.projected != null && <span style={{ color: T.text3 }}>projected {fmtValue(r.projected, m.unit)} for the full {period === "kr" ? "KR period" : period}</span>}
                {m.auto_config && <span style={{ color: T.text3 }}>⚡ auto</span>}
                {m.auto_error && <span style={{ color: "#ef4444" }}>Last run failed: {m.auto_error}</span>}
              </div>
            )}
            {m._open && (
              <div style={{ marginTop: 8, padding: 10, borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface }}>
                <MetricSourcePicker mode="kr" value={m.auto_config || null} onChange={v => setM(i, { auto_config: v })} scorecardMetrics={scMetrics}
                  krWindow={win ? { from: win.from, to: win.to } : null} hideWindowAgg windowAgg={KIND_TO_WINDOW[m.kind || "total"]} />
                <div style={{ fontSize: 10, color: T.text3, marginTop: 6 }}>Calculated for {win ? win.label : "the period"} as a {(KINDS.find(k => k.v === (m.kind || "total"))?.l || "total").toLowerCase()}.</div>
              </div>
            )}
          </div>
        );
      })}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <button type="button" onClick={() => setMeasures([...measures, { id: `m${Date.now().toString(36)}`, label: "", current_value: "", target_value: "", unit: "", op: "<=", kind: "rate" }])}
          style={{ fontSize: 12, fontWeight: 600, padding: "6px 12px", borderRadius: 6, border: `1px dashed ${T.border}`, background: "transparent", color: T.text2, cursor: "pointer" }}>+ Add value</button>
        {measures.length > 1 && (
          <span style={{ fontSize: 11, color: T.text3 }}>
            {d.measure_logic === "any" ? "Green when any one value is met; progress is the best of them." : "Green only when every value is met; progress is the lowest of them."}
          </span>
        )}
      </div>
    </div>
  );
}
