"use client";
// Edit the values a key result is measured by: one or more values, each with its
// own comparison (<, ≤, =, ≥, >) and target, whether all or any must be met, and
// the period they're measured over (week / month / quarter / whole KR).

import { T } from "../tokens";
import MetricSourcePicker from "./MetricSourcePicker";
import { OPS, KINDS, PERIODS, EVALS, COMPARES, KIND_TO_WINDOW, evalKR, periodWindow, compareWindow, fmtValue, fmtPct } from "../lib/krMeasures";

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

// What Preview should query. A target period that hasn't started has no data, so
// show the same dates a year earlier (the comparison period) instead.
function previewWindow(win, m) {
  if (!win) return null;
  if (!win.notStarted) return { from: win.from, to: win.to };
  const back = (s) => `${Number(s.slice(0, 4)) - 1}${s.slice(4)}`;
  const today = new Date().toISOString().slice(0, 10);
  const from = back(win.from), fullTo = back(win.fullTo || win.to);
  const to = fullTo < today ? fullTo : today;
  if (from > today) return { from: win.from, to: win.fullTo || win.to };
  return { from, to, note: `The target period hasn't started, so Preview shows ${from} to ${to}${m?.target_type === "growth" ? " (the comparison period)" : " (the same dates a year earlier)"}.` };
}

export default function KRMeasuresEditor({ d, editSet, scMetrics, krDates, isMobile, lbl, inp }) {
  const measures = Array.isArray(d.measures) && d.measures.length ? d.measures : [{ id: "m0", label: "", current_value: 0, target_value: "", unit: "", op: ">=", kind: "total" }];
  const setMeasures = (next) => editSet("measures", next);
  const setM = (i, patch) => setMeasures(measures.map((m, j) => (j === i ? { ...m, ...patch } : m)));
  const period = d.measure_period || "kr";
  const datedPeriod = period === "year" || period === "custom" || period === "kr";
  const ev = datedPeriod ? "to_date" : (d.period_eval || "last_complete");
  const setYear = (y) => { editSet("period_from", `${y}-01-01`); editSet("period_to", `${y}-12-31`); };
  const thisYear = new Date().getFullYear();
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
          <select value={period} onChange={e => {
            const v = e.target.value; editSet("measure_period", v);
            if (v === "kr" || v === "year" || v === "custom") editSet("period_eval", "to_date");
            if (v === "year" && !(d.period_from && d.period_from.slice(5) === "01-01")) setYear(thisYear + 1);
          }} style={sel}>
            {PERIODS.map(p => <option key={p.v} value={p.v}>{p.l}</option>)}
          </select></div>
        <div><label style={lbl}>Judge on</label>
          <select value={ev} disabled={datedPeriod} onChange={e => editSet("period_eval", e.target.value)} style={{ ...sel, opacity: datedPeriod ? .6 : 1 }}>
            {EVALS.map(p => <option key={p.v} value={p.v}>{p.l}</option>)}
          </select></div>
        <div><label style={lbl}>On track when</label>
          <select value={d.measure_logic || "all"} onChange={e => editSet("measure_logic", e.target.value)} style={sel}>
            <option value="all">All values are met</option>
            <option value="any">Any one value is met</option>
          </select></div>
      </div>
      {period === "year" && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
          <span style={{ ...lbl, margin: 0 }}>Target year</span>
          {[thisYear - 1, thisYear, thisYear + 1, thisYear + 2].map(y => {
            const on = d.period_from === `${y}-01-01` && d.period_to === `${y}-12-31`;
            return <button key={y} type="button" onClick={() => setYear(y)} style={{ padding: "4px 12px", fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: "pointer", border: `1px solid ${on ? T.accent : T.border}`, background: on ? T.accent : T.surface, color: on ? "#fff" : T.text2 }}>{y}</button>;
          })}
        </div>
      )}
      {period === "custom" && (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
          <div><label style={lbl}>Target period from</label><input type="date" value={d.period_from || ""} onChange={e => editSet("period_from", e.target.value)} style={ci} /></div>
          <div><label style={lbl}>To</label><input type="date" value={d.period_to || ""} onChange={e => editSet("period_to", e.target.value)} style={ci} /></div>
        </div>
      )}
      <div style={{ fontSize: 11, color: T.text3, marginBottom: 12 }}>
        {win ? <>Currently judged on <b style={{ color: T.text2 }}>{win.label}</b> ({win.from} to {win.to}).{win.toDate && win.fraction < 1 ? " Totals are projected to the full period at the current pace." : ""} Review it weekly on the Scorecard; the targets below are per {period === "kr" ? "KR period" : period}.</>
          : period === "year" || period === "custom" ? "Pick the target period above." : "Set a start date on this KR, its objective or its cycle."}
      </div>

      {measures.map((m, i) => {
        const r = result.parts[i] || {};
        const growth = m.target_type === "growth";
        const cw = growth ? compareWindow(m, win) : null;
        return (
          <div key={m.id || i} style={{ marginBottom: 10, paddingBottom: 10, borderBottom: `1px solid ${T.border}` }}>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1.6fr 1.1fr 1.15fr 1.1fr 52px 1fr auto auto", gap: 6, alignItems: "end" }}>
              <div><label style={lbl}>{i === 0 ? "Value" : "And value"}</label><input value={m.label || ""} onChange={e => setM(i, { label: e.target.value })} placeholder={i === 0 ? "e.g. Ad Spend" : "e.g. CPA"} style={ci} /></div>
              <div><label style={lbl}>{growth ? "Actual" : "Current"}</label><NumInput value={m.current_value ?? ""} placeholder="–" disabled={!!m.auto_config} onChange={v => setM(i, { current_value: v })} style={{ ...ci, opacity: m.auto_config ? .55 : 1 }} /></div>
              <div><label style={lbl}>Green when</label>
                <select value={m.op || ">="} onChange={e => setM(i, { op: e.target.value })} style={sel}>
                  {OPS.filter(o => !growth || o.v !== "=").map(o => <option key={o.v} value={o.v}>{growth ? o.l.replace(/at or |equal to /, "") + " target %" : o.l}</option>)}
                </select></div>
              <div><label style={lbl}>{growth ? "Committed %" : "Target"}</label><NumInput value={m.target_value ?? ""} placeholder={growth ? "e.g. 30" : ""} onChange={v => setM(i, { target_value: v })} style={ci} /></div>
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
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : growth ? `1.3fr 1.5fr ${m.compare?.mode === "custom" ? "1.1fr 1.1fr " : ""}1.2fr 1fr` : "1.3fr", gap: 6, alignItems: "end", marginTop: 6 }}>
              <div><label style={lbl}>Target as</label>
                <select value={growth ? "growth" : "number"} onChange={e => setM(i, e.target.value === "growth"
                  ? { target_type: "growth", compare: m.compare || { mode: "yoy" }, op: m.op === "<" || m.op === "<=" ? "<=" : ">=", target_value: "", kind: m.kind || "total" }
                  : { target_type: "number", target_value: "" })} style={sel}>
                  <option value="number">A number</option>
                  <option value="growth">% change vs a comparison period</option>
                </select></div>
              {growth && <div><label style={lbl}>Compare with</label>
                <select value={m.compare?.mode || "yoy"} onChange={e => setM(i, { compare: { ...(m.compare || {}), mode: e.target.value } })} style={sel}>
                  {COMPARES.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
                </select></div>}
              {growth && m.compare?.mode === "custom" && <div><label style={lbl}>Compare from</label><input type="date" value={m.compare?.from || ""} onChange={e => setM(i, { compare: { ...m.compare, from: e.target.value } })} style={ci} /></div>}
              {growth && m.compare?.mode === "custom" && <div><label style={lbl}>To</label><input type="date" value={m.compare?.to || ""} onChange={e => setM(i, { compare: { ...m.compare, to: e.target.value } })} style={ci} /></div>}
              {growth && <div><label style={lbl}>Baseline</label><NumInput value={m.baseline_value ?? ""} placeholder="–" disabled={!!m.auto_config} onChange={v => setM(i, { baseline_value: v })} style={{ ...ci, opacity: m.auto_config ? .55 : 1 }} /></div>}
              {growth && <div><label style={lbl}>Stretch %</label><NumInput value={m.stretch_value ?? ""} placeholder="optional" onChange={v => setM(i, { stretch_value: v })} style={ci} /></div>}
            </div>
            {growth && <div style={{ fontSize: 11, marginTop: 5, color: T.text3 }}>
              {win?.notStarted ? `The target period starts ${win.from}; the comparison will be the ${COMPARES.find(c => c.v === (m.compare?.mode || "yoy")).l.toLowerCase()}.`
                : cw ? <>Comparing {win.label.toLowerCase()} ({win.from} to {win.to}) with {cw.label} ({cw.from} to {cw.to}){cw.likeForLike ? ", day for day" : ""}.</> : "Set the comparison dates."}
            </div>}
            {r.noData && !(growth && win?.notStarted) && <div style={{ fontSize: 11, marginTop: 5, color: T.text3 }}>No current value yet: not counted until one is entered{m.auto_config ? " or calculated" : ""}.</div>}
            {r.pct != null && (
              <div style={{ fontSize: 11, marginTop: 5, color: r.color, display: "flex", gap: 8, flexWrap: "wrap" }}>
                {growth
                  ? <span style={{ fontWeight: 700 }}>{fmtPct(r.growth)} vs {fmtPct(Number(m.target_value))} committed{r.met ? " ✓" : ""}</span>
                  : <span style={{ fontWeight: 700 }}>{r.met ? "✓ Met" : `${Math.min(r.pct, 999)}% of target`}</span>}
                {growth && r.stretchPct != null && <span style={{ color: T.text3 }}>{Math.max(0, Math.min(r.stretchPct, 999))}% of the way to the {fmtPct(Number(m.stretch_value))} stretch</span>}
                {growth && <span style={{ color: T.text3 }}>{fmtValue(r.value, m.unit)} vs baseline {fmtValue(r.baseline, m.unit)}</span>}
                {!growth && r.projected != null && <span style={{ color: T.text3 }}>projected {fmtValue(r.projected, m.unit)} for the full {period === "kr" ? "KR period" : period}</span>}
                {m.auto_config && <span style={{ color: T.text3 }}>⚡ auto</span>}
                {m.auto_error && <span style={{ color: "#ef4444" }}>Last run failed: {m.auto_error}</span>}
              </div>
            )}
            {m._open && (
              <div style={{ marginTop: 8, padding: 10, borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface }}>
                <MetricSourcePicker mode="kr" value={m.auto_config || null} onChange={v => setM(i, { auto_config: v })} scorecardMetrics={scMetrics}
                  krWindow={previewWindow(win, m)} hideWindowAgg windowAgg={KIND_TO_WINDOW[m.kind || "total"]} />
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
            {(() => {
              const scored = result.parts.filter(x => x.pct != null);
              const any = d.measure_logic === "any";
              if (!scored.length) return any ? "Green when any one value is met; progress is the best of them." : "Green only when every value is met; progress is the lowest of them.";
              if (result.met) return any ? `On track: ${scored.filter(x => x.met).map(x => x.label || "a value").join(" and ")} met.` : "On track: every value is met.";
              const lim = any ? [...scored].sort((a, b) => b.pct - a.pct)[0] : [...scored].filter(x => !x.met).sort((a, b) => a.pct - b.pct)[0];
              const met = scored.filter(x => x.met).map(x => x.label || "a value");
              return <span><b style={{ color: "#ef4444" }}>Not on track:</b> {lim.label || "a value"} is at {lim.pct}% of its target{met.length ? `, so ${result.progress}% overall even though ${met.join(" and ")} ${met.length > 1 ? "are" : "is"} met` : ""}. {any ? "Progress is the best value." : "Progress is the lowest value."}</span>;
            })()}
          </span>
        )}
      </div>
    </div>
  );
}
