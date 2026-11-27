"use client";
// PLM home views: programs listed by stage, the launch runway, and the dashboard.
// Pure presentation over the programs PLM.js already loads.
import { useState, useMemo } from "react";
import { Icon, Chip } from "./work/ui";

const PRIORITY_TONE = { critical: "coral", high: "amber", medium: "blue", low: "slate" };
const pad = (n) => String(n).padStart(2, "0");
export const todayStr = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const at = (d) => new Date(String(d).slice(0, 10) + "T12:00:00");
export const fmtDay = (d) => { if (!d) return ""; const x = at(d); return isNaN(x) ? String(d) : x.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }); };
export const dayDiff = (a, b) => Math.round((at(a) - at(b)) / 864e5);
export const isLate = (p) => !!p.target_launch_date && p.current_stage !== "launched" && String(p.target_launch_date).slice(0, 10) < todayStr();
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : "");
const Priority = ({ p }) => (p ? <Chip t={PRIORITY_TONE[p] || "slate"}>{cap(p)}</Chip> : null);
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

// ── A: programs as a list, grouped by stage ──
export function ProgramList({ programs, stages, linkCounts, onOpen, onDelete }) {
  const [closed, setClosed] = useState({});
  const cols = "minmax(260px,2.3fr) 190px 100px 96px 130px 210px 96px 40px";
  const today = todayStr();
  return (
    <div className="plm-list hw-scroll"><div style={{ minWidth: 1130 }}>
      <div className="plm-lhead" style={{ gridTemplateColumns: cols }}><span>Program</span><span>Stage progress</span><span>Priority</span><span>GM target</span><span>Markets</span><span>Target launch</span><span>Linked</span><span /></div>
      {stages.map((st, si) => {
        const rows = programs.filter((p) => p.current_stage === st.key); if (!rows.length) return null;
        const late = rows.filter(isLate).length;
        return <div key={st.key}>
          <div className="plm-lgroup" onClick={() => setClosed((c) => ({ ...c, [st.key]: !c[st.key] }))} title={st.desc}>
            <span style={{ display: "inline-flex", marginBottom: 2, color: "var(--ink3)", transform: closed[st.key] ? "rotate(-90deg)" : "none", transition: "transform .12s" }}><Icon name="chevD" size={15} /></span>
            <span className="hw-dot" style={{ background: st.color, marginBottom: 6 }} /><b>{st.label}</b><span className="ct">{rows.length}</span>
            {late > 0 && <span className="ct plm-late" style={{ marginLeft: 6 }}>{late} past target</span>}
          </div>
          {!closed[st.key] && rows.map((p) => { const l = isLate(p); return (
            <div key={p.id} className="plm-lrow" style={{ gridTemplateColumns: cols }} onClick={() => onOpen(p)}>
              <span className="nm"><i style={{ background: st.color }} /><span className="hw-trunc">{p.name}</span>{p.brand && <span className="hw-trunc" style={{ fontSize: 12, color: "var(--ink3)", fontWeight: 400, flex: "none", maxWidth: 110 }}>{p.brand}</span>}</span>
              <span><span className="plm-steps" title={`${st.label}: stage ${si + 1} of ${stages.length}`}>{stages.map((s, i) => <i key={s.key} style={{ background: i < si ? st.color + "66" : i === si ? st.color : "var(--sunken)" }} />)}</span></span>
              <span><Priority p={p.priority} /></span>
              <span className="hw-num" style={{ fontWeight: 600, color: p.target_gross_margin_pct ? "var(--green)" : "var(--ink4)" }}>{p.target_gross_margin_pct ? p.target_gross_margin_pct + "%" : "—"}</span>
              <span className="hw-trunc" style={{ color: "var(--ink2)" }}>{(p.target_markets_v2 || []).join(" · ") || "—"}</span>
              <span className={"hw-num hw-trunc" + (l ? " plm-late" : "")} style={l ? undefined : { color: p.target_launch_date ? "var(--ink2)" : "var(--ink4)" }}>{p.target_launch_date ? fmtDay(p.target_launch_date) + (l ? ` · ${dayDiff(today, p.target_launch_date)}d late` : "") : "No date"}</span>
              <span className="hw-num" style={{ color: "var(--ink2)" }}>{linkCounts[p.id] > 0 ? <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}><Icon name="link" size={13} />{linkCounts[p.id]}</span> : <span style={{ color: "var(--ink4)" }}>—</span>}</span>
              <span style={{ padding: 0 }}>{onDelete && <button className="hw-icb sm del" title="Delete program" onClick={(e) => { e.stopPropagation(); if (confirm("Delete this program?")) onDelete(p.id); }}><Icon name="trash" size={14} /></button>}</span>
            </div>); })}
        </div>;
      })}
    </div></div>
  );
}

// ── B: launch runway ──
export function Runway({ programs, stages, onOpen }) {
  const SM = useMemo(() => Object.fromEntries(stages.map((s) => [s.key, s])), [stages]);
  const today = todayStr();
  const flight = programs.filter((p) => p.current_stage !== "launched");
  const { start, end, months } = useMemo(() => {
    const t = at(today); let lo = new Date(t.getFullYear(), t.getMonth() - 2, 1), hi = new Date(t.getFullYear(), t.getMonth() + 4, 0);
    const minLo = new Date(t.getFullYear(), t.getMonth() - 18, 1), maxHi = new Date(t.getFullYear(), t.getMonth() + 25, 0);
    for (const p of flight) { if (!p.target_launch_date) continue; const d = at(p.target_launch_date); if (isNaN(d)) continue; if (d < lo) lo = new Date(d.getFullYear(), d.getMonth(), 1); if (d > hi) hi = new Date(d.getFullYear(), d.getMonth() + 2, 0); }
    if (lo < minLo) lo = minLo; if (hi > maxHi) hi = maxHi;
    const ms = []; for (let d = new Date(lo); d <= hi; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) ms.push({ label: d.toLocaleDateString("en-US", { month: "short" }) + (d.getMonth() === 0 || !ms.length ? " ’" + String(d.getFullYear()).slice(2) : ""), yr: d.getMonth() === 0 || !ms.length, now: d.getMonth() === t.getMonth() && d.getFullYear() === t.getFullYear() });
    return { start: lo, end: new Date(hi.getFullYear(), hi.getMonth(), hi.getDate() + 1), months: ms };
  }, [programs, today]);
  const span = end - start; const pct = (d) => Math.max(0, Math.min(100, ((d - start) / span) * 100));
  const tNow = at(today); const rows = flight.slice().sort((a, b) => String(a.target_launch_date || "9999").localeCompare(String(b.target_launch_date || "9999")) || a.name.localeCompare(b.name));
  if (!rows.length) return <div className="hw-empty"><div>No programs in flight.</div></div>;
  return (<>
    <div className="plm-legend">
      <span><i style={{ width: 22, height: 8, borderRadius: 4, background: "color-mix(in srgb, var(--coral) 28%, var(--surface))" }} />Days past the target launch date</span>
      <span><i style={{ width: 22, height: 8, borderRadius: 4, background: "color-mix(in srgb, var(--accent) 28%, var(--surface))" }} />Time left to target</span>
      <span><i style={{ width: 11, height: 11, transform: "rotate(45deg)", borderRadius: 2, background: "var(--ink)" }} />Target launch</span>
      <span><i style={{ width: 2, height: 14, background: "var(--coral)" }} />Today</span>
    </div>
    <div className="plm-run hw-scroll"><div style={{ minWidth: 320 + months.length * 52 }}>
      <div className="plm-run-h"><div className="plm-run-name" style={{ padding: "9px 16px 8px", fontSize: 11.5, fontWeight: 600, color: "var(--ink3)" }}>Program, earliest target first</div>
        <div style={{ flex: 1, display: "flex" }}>{months.map((m, i) => <span key={i} className={"plm-run-m" + (m.now ? " now" : m.yr ? " yr" : "")}>{m.label}</span>)}</div></div>
      <div style={{ position: "relative" }}>
        {rows.map((p) => { const st = SM[p.current_stage] || { label: p.current_stage, color: "var(--ink3)" }; const d = p.target_launch_date ? at(p.target_launch_date) : null; const ok = d && !isNaN(d); const n = ok ? dayDiff(today, p.target_launch_date) : 0; const late = ok && n > 0;
          const a = late ? d : tNow, b = late ? tNow : d; const tone = late ? "var(--coral)" : "var(--accent)";
          return <div key={p.id} className="plm-run-row" onClick={() => onOpen(p)}>
            <div className="plm-run-name"><span className="hw-dot" style={{ background: st.color }} /><span style={{ flex: 1, minWidth: 0 }}><span className="hw-trunc" style={{ display: "block", fontWeight: 550 }}>{p.name}</span><span style={{ display: "block", fontSize: 12, color: "var(--ink3)" }}>{st.label}{p.priority ? " · " + cap(p.priority) : ""}</span></span></div>
            <div className="plm-run-track">
              {ok ? <>
                <span className="plm-run-bar" style={{ left: pct(a) + "%", width: Math.max(0, pct(b) - pct(a)) + "%", background: `color-mix(in srgb, ${tone} 28%, var(--surface))` }} />
                <span className="plm-run-mark" style={{ left: pct(d) + "%", background: late ? "var(--coral)" : "var(--ink)" }} title={"Target " + fmtDay(p.target_launch_date)} />
                <span className="plm-run-lbl" style={{ left: pct(b) + "%", color: late ? "var(--coral)" : "var(--accent-ink)" }}>{late ? `${n} days late` : n === 0 ? "Today" : `in ${-n} days`}</span>
              </> : <span className="plm-run-lbl" style={{ left: pct(tNow) + "%", top: 12, marginLeft: 12, padding: "2px 9px", color: "var(--ink3)", fontWeight: 500, border: "1px dashed var(--ink4)", borderRadius: 7 }}>No target date yet</span>}
            </div>
          </div>; })}
        <div aria-hidden="true" style={{ position: "absolute", top: 0, bottom: 0, left: 320, right: 0, pointerEvents: "none" }}><span style={{ position: "absolute", top: 0, bottom: 0, width: 2, background: "var(--coral)", left: pct(tNow) + "%" }} /></div>
      </div>
    </div></div>
  </>);
}

// ── C: dashboard ──
export function LaunchDashboard({ programs, stages, linkCounts, onOpen, onRunway }) {
  const SM = useMemo(() => Object.fromEntries(stages.map((s) => [s.key, s])), [stages]);
  const today = todayStr();
  const flight = programs.filter((p) => p.current_stage !== "launched");
  const late = flight.filter(isLate).sort((a, b) => String(a.target_launch_date).localeCompare(String(b.target_launch_date)));
  const next = flight.filter((p) => p.target_launch_date && !isLate(p)).sort((a, b) => String(a.target_launch_date).localeCompare(String(b.target_launch_date)));
  const undated = flight.filter((p) => !p.target_launch_date);
  const top = flight.filter((p) => p.priority === "critical" || p.priority === "high").sort((a, b) => (a.priority === "critical" ? 0 : 1) - (b.priority === "critical" ? 0 : 1) || a.name.localeCompare(b.name));
  const counts = stages.map((s) => programs.filter((p) => p.current_stage === s.key).length); const max = Math.max(1, ...counts);
  const empty = stages.filter((s, i) => !counts[i] && s.key !== "launched").map((s) => s.label);
  const crit = flight.filter((p) => p.priority === "critical");
  const item = (p, right) => { const st = SM[p.current_stage] || {}; return <div key={p.id} className="plm-li" onClick={() => onOpen(p)}><span className="hw-dot" style={{ background: st.color }} /><span className="t"><b>{p.name}</b><small>{st.label}{p.target_launch_date ? " · target " + fmtDay(p.target_launch_date) : ""}</small></span>{right}</div>; };
  const tile = (l, v, s, color) => <div className="plm-tile"><div className="l">{l}</div><div className="v" style={{ color }}>{v}</div><div className="s">{s}</div></div>;
  return (
    <div style={{ maxWidth: 1240, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 14 }}>
        {tile("In flight", flight.length, "Not yet launched")}
        {tile("Past target launch", late.length, `of ${flight.length} in flight`, late.length ? "var(--coral)" : undefined)}
        {tile("Critical priority", crit.length, crit.slice(0, 2).map((p) => p.name).join(", ") || "None")}
        {tile("Launched", programs.length - flight.length, `of ${plural(programs.length, "program")}`, "var(--green)")}
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "stretch" }}>
        <div className="plm-panel" style={{ flex: "1.2 1 440px" }}>
          <div className="plm-h4" style={{ marginBottom: 12 }}>Where the {plural(programs.length, "program")} sit</div>
          {stages.map((s, i) => <div key={s.key} className="plm-stg" title={s.desc} style={{ color: counts[i] ? "var(--ink)" : "var(--ink3)" }}><span>{s.label}</span><span className="tr"><i style={{ width: (counts[i] / max) * 100 + "%", background: s.color }} /></span><span className="hw-num" style={{ textAlign: "right", fontWeight: 600 }}>{counts[i]}</span></div>)}
          {empty.length > 0 && <div style={{ marginTop: 12, fontSize: 12.5, color: "var(--ink3)" }}>Nothing is in {empty.join(", ").replace(/, ([^,]*)$/, " or $1")} right now.</div>}
        </div>
        <div className="plm-panel" style={{ flex: "1 1 400px" }}>
          <div className="plm-h4"><span style={{ flex: 1 }}>Past the target launch date</span>{late.length > 7 && <button className="hw-btn ghost sm" onClick={onRunway}>See all {late.length} on the runway</button>}</div>
          {late.slice(0, 7).map((p) => item(p, <span className="plm-late hw-num" style={{ whiteSpace: "nowrap", fontWeight: 650 }}>{dayDiff(today, p.target_launch_date)} days</span>))}
          {!late.length && <div style={{ color: "var(--ink3)" }}>Nothing is past its target date.</div>}
        </div>
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "stretch" }}>
        <div className="plm-panel" style={{ flex: "1 1 400px" }}>
          <div className="plm-h4">Coming up</div>
          {next.slice(0, 6).map((p) => { const n = dayDiff(p.target_launch_date, today); return item(p, <span className="hw-num" style={{ whiteSpace: "nowrap", fontWeight: 650, color: "var(--accent-ink)" }}>{n === 0 ? "Today" : `in ${plural(n, "day")}`}</span>); })}
          {undated.slice(0, 4).map((p) => item(p, <span style={{ fontSize: 12.5, color: "var(--ink3)", border: "1px dashed var(--ink4)", borderRadius: 7, padding: "2px 9px", whiteSpace: "nowrap" }}>No target date</span>))}
          {!next.length && !undated.length && <div style={{ color: "var(--ink3)" }}>No upcoming target dates.</div>}
        </div>
        <div className="plm-panel" style={{ flex: "1 1 400px" }}>
          <div className="plm-h4">Critical and high priority</div>
          {top.map((p) => { const st = SM[p.current_stage] || {}; return <div key={p.id} className="plm-li" onClick={() => onOpen(p)}><span style={{ width: 62, flex: "none" }}><Priority p={p.priority} /></span><span className="t"><b>{p.name}</b></span><span style={{ fontSize: 12.5, color: "var(--ink2)", whiteSpace: "nowrap" }}>{st.label}</span>{linkCounts[p.id] > 0 && <span className="hw-num" style={{ fontSize: 12.5, color: "var(--ink3)", display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="link" size={12} />{linkCounts[p.id]}</span>}</div>; })}
          {!top.length && <div style={{ color: "var(--ink3)" }}>No critical or high priority programs.</div>}
        </div>
      </div>
    </div>
  );
}
