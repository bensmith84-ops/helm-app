"use client";
// Project Overview and Dashboard, plus the cross-project Portfolios and Workload pages.
import { useState, useEffect, useMemo } from "react";
import { Icon, Popover, usePop, MenuItem, MenuSep, Avatar, AvatarStack, Chip, Check, Progress, Seg, Empty, Modal, Field, OptionList, ColorPicker } from "./ui";
import { HEALTH, isDone, taskKind, today, addDays, diffDays, startOfWeek, fmtDate, fmtRange, personName, timeAgo, plural, parseYmd, monthName } from "./model";
import { tone, SWATCHES } from "./theme";

export const PAGES_CSS = `
.hw-page{flex:1;min-height:0;overflow-y:auto;background:var(--paper)}
.hw-page-in{max-width:1180px;margin:0 auto;padding:22px 24px 48px}
.hw-card2{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:16px 18px}
.hw-card2>h4{margin:0 0 12px;font-size:13px;font-weight:650;display:flex;align-items:center;gap:8px}
.hw-kpi{background:var(--surface);border:1px solid var(--line);border-radius:14px;padding:14px 16px}
.hw-kpi .v{font-family:var(--serif);font-size:38px;line-height:1;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.hw-kpi .l{font-size:12px;color:var(--ink3);font-weight:550;margin-bottom:8px}
.hw-kpi .s{font-size:12px;color:var(--ink3);margin-top:6px}
.hw-hbar{display:grid;grid-template-columns:minmax(90px,170px) 1fr 44px;align-items:center;gap:10px;height:28px;font-size:12.5px}
.hw-hbar .tr{height:14px;border-radius:4px;background:var(--sunken);display:flex;overflow:hidden;gap:2px}
.hw-hbar .tr i{display:block;height:100%;border-radius:4px;min-width:2px;transition:width .3s}
.hw-hbar:hover{color:var(--ink)}
.hw-upd{border-left:3px solid var(--c);padding:2px 0 2px 14px;margin-bottom:16px}
.hw-ptable{width:100%;border-collapse:collapse;font-size:13px}
.hw-ptable th{text-align:left;font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--ink3);padding:9px 12px;border-bottom:1px solid var(--line);white-space:nowrap;cursor:pointer;user-select:none}
.hw-ptable td{padding:10px 12px;border-bottom:1px solid var(--line);vertical-align:middle}
.hw-ptable tbody tr{cursor:pointer}
.hw-ptable tbody tr:hover{background:var(--raise)}
.hw-ptable tr:last-child td{border-bottom:none}
.hw-wl{display:grid;font-size:12.5px;min-width:900px}
.hw-wl>div{border-bottom:1px solid var(--line);min-height:44px;display:flex;align-items:center;padding:0 10px}
.hw-wl .hd{font-size:11px;font-weight:600;color:var(--ink3);letter-spacing:.04em;text-transform:uppercase;min-height:36px;position:sticky;top:0;background:var(--surface);z-index:2}
.hw-wl>.cell{justify-content:center;padding:5px;cursor:pointer}
.hw-wl .cell>span{width:100%;height:32px;border-radius:7px;display:flex;align-items:center;justify-content:center;font-weight:600;font-variant-numeric:tabular-nums;transition:transform .1s}
.hw-wl .cell:hover>span{transform:scale(1.04);box-shadow:var(--sh1)}
.hw-tip{position:fixed;z-index:1100;background:var(--ink);color:var(--paper);font-size:12px;padding:5px 9px;border-radius:7px;pointer-events:none;white-space:nowrap;box-shadow:var(--sh2)}
.hw-pf{border:1px solid var(--line);background:var(--surface);border-radius:12px;padding:12px 14px;cursor:pointer;text-align:left;min-width:190px;transition:border-color .12s,box-shadow .12s}
.hw-pf:hover{border-color:var(--line2);box-shadow:var(--sh1)}
.hw-pf.on{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
`;
const Tip = ({ tip }) => (tip ? <div className="hw-tip" style={{ left: tip.x + 12, top: tip.y + 14 }}>{tip.text}</div> : null);
const useTip = () => { const [tip, setTip] = useState(null); return { tip, on: (text) => ({ onMouseMove: (e) => setTip({ x: e.clientX, y: e.clientY, text }), onMouseLeave: () => setTip(null) }) }; };

// ── Overview ──
export function Overview({ store, project, onOpen, onEdit }) {
  const pid = project.id; const [updates, setUpdates] = useState([]); const [form, setForm] = useState(null); const [desc, setDesc] = useState(project.description || "");
  const tasks = store.tasksOf.get(pid) || []; const stats = store.projectStats[pid] || { total: 0, done: 0, overdue: 0, open: 0 }; const members = store.membersOf(pid);
  useEffect(() => { setDesc(project.description || ""); }, [project.description]);
  useEffect(() => { let on = true; store.db.from("project_status_updates").select("*").eq("project_id", pid).order("created_at", { ascending: false }).limit(12).then(({ data }) => { if (on) setUpdates(data || []); }); return () => { on = false; }; }, [pid]);
  const milestones = tasks.filter((t) => taskKind(t) === "milestone").sort((a, b) => String(a.due_date || "9").localeCompare(String(b.due_date || "9")));
  const t0 = today(); const soon = tasks.filter((t) => !isDone(t) && t.due_date && String(t.due_date).slice(0, 10) <= addDays(t0, 7)).sort((a, b) => String(a.due_date).localeCompare(String(b.due_date))).slice(0, 8);
  const pct = stats.total ? Math.round((stats.done / stats.total) * 100) : 0; const h = HEALTH[project.health] || HEALTH.on_track;
  const post = async () => {
    if (!form.title.trim()) return;
    const { data } = await store.db.from("project_status_updates").insert({ org_id: store.orgFor(pid), project_id: pid, author_id: store.uid, status: form.status, title: form.title.trim(), body: form.body.trim() || null, metrics_snapshot: { done: stats.done, total: stats.total, overdue: stats.overdue } }).select().single();
    if (data) setUpdates((p) => [data, ...p]); if (["on_track", "at_risk", "off_track"].includes(form.status)) store.updateProject(pid, { health: form.status }); setForm(null);
  };
  return (
    <div className="hw-page hw-scroll"><div className="hw-page-in" style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 320px", gap: 20, alignItems: "start" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
        <div className="hw-card2"><h4>About this project</h4>
          <textarea className="hw-bare" style={{ resize: "none", lineHeight: 1.55, minHeight: 60 }} rows={Math.max(3, desc.split("\n").length)} placeholder="What is this project for, and what does done look like?" value={desc} onChange={(e) => setDesc(e.target.value)} onBlur={() => { if (desc !== (project.description || "")) store.updateProject(pid, { description: desc }); }} /></div>
        <div className="hw-card2"><h4>Status updates<span style={{ flex: 1 }} />{!form && <button className="hw-btn sm" onClick={() => setForm({ status: project.health || "on_track", title: "", body: "" })}><Icon name="plus" size={13} />Post an update</button>}</h4>
          {form && <div style={{ border: "1px solid var(--line2)", borderRadius: 10, padding: 12, marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>{["on_track", "at_risk", "off_track", "on_hold", "complete"].map((k) => <button key={k} className="hw-chip" style={{ ...tone(HEALTH[k].tone), border: "none", cursor: "pointer", height: 26, padding: "0 11px", opacity: form.status === k ? 1 : 0.45, boxShadow: form.status === k ? "0 0 0 2px var(--c)" : "none" }} onClick={() => setForm({ ...form, status: k })}><i />{HEALTH[k].label}</button>)}</div>
            <input className="hw-input" autoFocus placeholder="Headline, e.g. Artwork approved, tooling starts Monday" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} style={{ marginBottom: 8 }} />
            <textarea className="hw-input" rows={4} placeholder="What happened, what's next, what's in the way?" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 10 }}><button className="hw-btn ghost" onClick={() => setForm(null)}>Cancel</button><button className="hw-btn primary" disabled={!form.title.trim()} onClick={post}>Post update</button></div>
          </div>}
          {updates.map((u) => { const hh = HEALTH[u.status] || HEALTH.on_track; return <div key={u.id} className="hw-upd" style={tone(hh.tone)}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}><Chip t={hh.tone} dot>{hh.label}</Chip><b style={{ fontWeight: 650 }}>{u.title}</b></div>
            {u.body && <div style={{ whiteSpace: "pre-wrap", color: "var(--ink2)", lineHeight: 1.55 }}>{String(u.body).replace(/\*\*/g, "")}</div>}
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 12, color: "var(--ink3)" }}><Avatar person={store.people[u.author_id]} id={u.author_id} size={18} />{personName(store.people[u.author_id]) || "Someone"} · {timeAgo(u.created_at)}</div></div>; })}
          {!updates.length && !form && <div style={{ color: "var(--ink3)" }}>No updates yet. Post one to tell the team where this stands.</div>}
        </div>
        <div className="hw-card2"><h4><Icon name="diamond" size={15} style={{ color: "var(--green)" }} />Milestones</h4>
          {milestones.map((m) => <div key={m.id} className="hw-sub" onClick={() => onOpen(m)}><Check done={isDone(m)} kind="milestone" size={16} onClick={() => store.completeTask(m)} /><span className="hw-trunc" style={{ flex: 1, fontWeight: 550, color: isDone(m) ? "var(--ink3)" : undefined }}>{m.title}</span><span className="hw-num" style={{ fontSize: 12.5, color: !isDone(m) && m.due_date && String(m.due_date).slice(0, 10) < t0 ? "var(--coral)" : "var(--ink3)" }}>{m.due_date ? fmtDate(String(m.due_date).slice(0, 10)) : "No date"}</span></div>)}
          {!milestones.length && <div style={{ color: "var(--ink3)" }}>No milestones yet. Right-click any task and set its type to Milestone.</div>}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="hw-card2" style={tone(h.tone)}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}><Chip t={h.tone} dot>{h.label}</Chip><span style={{ flex: 1 }} /><button className="hw-btn ghost sm" onClick={onEdit}>Edit</button></div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}><span className="hw-serif hw-num" style={{ fontSize: 44, lineHeight: 1 }}>{pct}%</span><span style={{ color: "var(--ink3)", fontSize: 12.5 }}>{stats.done} of {plural(stats.total, "task")} done</span></div>
          <div style={{ margin: "12px 0 4px" }}><Progress value={pct} color="var(--green)" /></div>
          {stats.overdue > 0 && <div style={{ color: "var(--coral)", fontSize: 12.5, fontWeight: 600, marginTop: 8 }}>{plural(stats.overdue, "task")} overdue</div>}
        </div>
        <div className="hw-card2"><h4>Details</h4>
          <div className="hw-frow"><label>Owner</label><div>{project.owner_id ? <><Avatar person={store.people[project.owner_id]} id={project.owner_id} size={22} />{personName(store.people[project.owner_id])}</> : <span style={{ color: "var(--ink3)" }}>No owner</span>}</div></div>
          <div className="hw-frow"><label>Dates</label><div className="hw-num">{project.target_end_date ? fmtRange(project.start_date && String(project.start_date).slice(0, 10), String(project.target_end_date).slice(0, 10)) : <span style={{ color: "var(--ink3)" }}>Not set</span>}</div></div>
          <div className="hw-frow"><label>Privacy</label><div>{project.visibility === "private" ? "Members only" : "Everyone"}</div></div>
          <div className="hw-frow" style={{ alignItems: "start" }}><label style={{ paddingTop: 6 }}>Members</label><div style={{ paddingTop: 4 }}><AvatarStack people={members} max={9} size={24} /></div></div>
        </div>
        <div className="hw-card2"><h4>Overdue and due this week</h4>
          {soon.map((t) => <div key={t.id} className="hw-sub" style={{ height: 32 }} onClick={() => onOpen(t)}><Check done={false} kind={taskKind(t)} size={15} onClick={() => store.completeTask(t)} /><span className="hw-trunc" style={{ flex: 1 }}>{t.title}</span><span className="hw-num" style={{ fontSize: 12, color: String(t.due_date).slice(0, 10) < t0 ? "var(--coral)" : "var(--ink3)" }}>{fmtDate(String(t.due_date).slice(0, 10))}</span></div>)}
          {!soon.length && <div style={{ color: "var(--ink3)" }}>Nothing due this week.</div>}
        </div>
      </div>
    </div></div>
  );
}

// ── Dashboard ──
function LineChart({ series, labels, height = 190 }) {
  const [hi, setHi] = useState(null); const W = 560, pad = { l: 34, r: 12, t: 10, b: 24 };
  const max = Math.max(1, ...series.flatMap((s) => s.values)); const n = labels.length;
  const X = (i) => pad.l + (i / Math.max(1, n - 1)) * (W - pad.l - pad.r), Y = (v) => pad.t + (1 - v / max) * (height - pad.t - pad.b);
  const ticks = [0, 0.5, 1].map((f) => Math.round(max * f));
  return <div style={{ position: "relative" }}><svg viewBox={`0 0 ${W} ${height}`} style={{ width: "100%", height, display: "block" }} onMouseLeave={() => setHi(null)} onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const fx = ((e.clientX - r.left) / r.width) * W; setHi(Math.max(0, Math.min(n - 1, Math.round(((fx - pad.l) / (W - pad.l - pad.r)) * (n - 1))))); }}>
    {ticks.map((t) => <g key={t}><line x1={pad.l} x2={W - pad.r} y1={Y(t)} y2={Y(t)} stroke="var(--line)" /><text x={pad.l - 6} y={Y(t) + 3.5} textAnchor="end" fontSize="10" fill="var(--ink3)">{t}</text></g>)}
    {labels.map((l, i) => (i % Math.ceil(n / 6) === 0 || i === n - 1) && <text key={i} x={X(i)} y={height - 6} textAnchor={i === n - 1 ? "end" : "middle"} fontSize="10" fill="var(--ink3)">{l}</text>)}
    {series.map((s) => <path key={s.name} d={s.values.map((v, i) => `${i ? "L" : "M"}${X(i)} ${Y(v)}`).join(" ")} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" strokeDasharray={s.dash} />)}
    {hi != null && <><line x1={X(hi)} x2={X(hi)} y1={pad.t} y2={height - pad.b} stroke="var(--ink4)" strokeDasharray="3 3" />{series.map((s) => <circle key={s.name} cx={X(hi)} cy={Y(s.values[hi])} r="4" fill={s.color} stroke="var(--surface)" strokeWidth="2" />)}</>}
  </svg>
    {hi != null && <div className="hw-tip" style={{ position: "absolute", left: `min(calc(100% - 150px), ${(X(hi) / W) * 100}%)`, top: 0, marginLeft: 10 }}><b>{labels[hi]}</b>{series.map((s) => <div key={s.name}>{s.name}: {s.values[hi]}</div>)}</div>}
    <div style={{ display: "flex", gap: 14, marginTop: 4, fontSize: 12, color: "var(--ink2)" }}>{series.map((s) => <span key={s.name} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><i style={{ width: 14, height: 2, background: s.color, display: "inline-block", borderRadius: 2 }} />{s.name}</span>)}</div>
  </div>;
}
export function Dashboard({ store, project, tasks }) {
  const { tip, on } = useTip(); const t0 = today(); const pid = project.id;
  const d = useMemo(() => {
    const open = tasks.filter((t) => !isDone(t)), done = tasks.filter(isDone); const overdue = open.filter((t) => t.due_date && String(t.due_date).slice(0, 10) < t0);
    const wkAgo = addDays(t0, -7); const doneWk = done.filter((t) => t.completed_at && String(t.completed_at).slice(0, 10) >= wkAgo).length; const newWk = tasks.filter((t) => t.created_at && String(t.created_at).slice(0, 10) >= wkAgo).length;
    const secs = (store.sectionsOf.get(pid) || []).map((s) => ({ label: s.name, color: s.color, open: open.filter((t) => t.section_id === s.id).length, late: overdue.filter((t) => t.section_id === s.id).length })).filter((s) => s.open);
    const byP = new Map(); for (const t of open) { const k = t.assignee_id || "none"; const e = byP.get(k) || { id: k, open: 0, late: 0 }; e.open++; if (t.due_date && String(t.due_date).slice(0, 10) < t0) e.late++; byP.set(k, e); }
    const ppl = [...byP.values()].sort((a, b) => b.open - a.open).slice(0, 10);
    const weeks = 12; const w0 = startOfWeek(addDays(t0, -7 * (weeks - 1))); const labels = [], total = [], comp = [];
    for (let i = 0; i < weeks; i++) { const endW = addDays(w0, i * 7 + 6); const dd = parseYmd(addDays(w0, i * 7)); labels.push(`${monthName(dd.getMonth())} ${dd.getDate()}`); total.push(tasks.filter((t) => !t.created_at || String(t.created_at).slice(0, 10) <= endW).length); comp.push(done.filter((t) => t.completed_at && String(t.completed_at).slice(0, 10) <= endW).length); }
    const up = []; const ws = startOfWeek(t0); for (let i = 0; i < 6; i++) { const a = addDays(ws, i * 7), b = addDays(a, 6); const dd = parseYmd(a); up.push({ label: i === 0 ? "This week" : i === 1 ? "Next week" : `${monthName(dd.getMonth())} ${dd.getDate()}`, n: open.filter((t) => t.due_date && String(t.due_date).slice(0, 10) >= a && String(t.due_date).slice(0, 10) <= b).length }); }
    return { open, done, overdue, doneWk, newWk, secs, ppl, labels, total, comp, up, undated: open.filter((t) => !t.due_date).length };
  }, [tasks, t0, pid, store.sectionsOf]);
  const maxSec = Math.max(1, ...d.secs.map((s) => s.open)), maxP = Math.max(1, ...d.ppl.map((p) => p.open)), maxUp = Math.max(1, ...d.up.map((u) => u.n));
  const kpi = (label, v, sub, color) => <div className="hw-kpi"><div className="l">{label}</div><div className="v" style={{ color }}>{v}</div><div className="s">{sub}</div></div>;
  if (!tasks.length) return <div className="hw-page"><Empty title="No tasks to chart yet" icon="chart">Once this project has tasks, completion, workload and due dates show up here.</Empty></div>;
  return (
    <div className="hw-page hw-scroll"><div className="hw-page-in">
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))", gap: 14, marginBottom: 16 }}>
        {kpi("Completed", d.done.length, `${d.doneWk} in the last 7 days`, "var(--green)")}
        {kpi("Still open", d.open.length, `${d.newWk} added in the last 7 days`)}
        {kpi("Overdue", d.overdue.length, d.overdue.length ? "Oldest: " + fmtDate(d.overdue.map((t) => String(t.due_date).slice(0, 10)).sort()[0], { relative: false }) : "Nothing is late", d.overdue.length ? "var(--coral)" : undefined)}
        {kpi("No due date", d.undated, "Open tasks nobody has scheduled")}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(420px,1fr))", gap: 16 }}>
        <div className="hw-card2"><h4>Progress over the last 12 weeks</h4><LineChart labels={d.labels} series={[{ name: "All tasks", values: d.total, color: "var(--ink3)", dash: "5 4" }, { name: "Completed", values: d.comp, color: "var(--green)" }]} /></div>
        <div className="hw-card2"><h4>Open tasks due, by week</h4>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 190, paddingTop: 16 }}>{d.up.map((u, i) => <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6, height: "100%", justifyContent: "flex-end", minWidth: 0 }} {...on(`${u.label}: ${plural(u.n, "task")} due`)}>
            <span className="hw-num" style={{ fontSize: 12, fontWeight: 600, color: "var(--ink2)" }}>{u.n || ""}</span><div style={{ width: "100%", maxWidth: 56, height: `${(u.n / maxUp) * 78}%`, minHeight: u.n ? 4 : 1, background: i === 0 ? "var(--accent)" : "color-mix(in srgb,var(--accent) 45%,var(--surface))", borderRadius: "5px 5px 0 0" }} /><span className="hw-trunc" style={{ fontSize: 11, color: "var(--ink3)", maxWidth: "100%" }}>{u.label}</span></div>)}</div></div>
        <div className="hw-card2"><h4>Open tasks by section</h4>
          {d.secs.map((s, i) => <div key={i} className="hw-hbar" {...on(`${s.label}: ${s.open} open${s.late ? `, ${s.late} overdue` : ""}`)}><span className="hw-trunc">{s.label}</span><span className="tr"><i style={{ width: `${((s.open - s.late) / maxSec) * 100}%`, background: "var(--accent)" }} />{s.late > 0 && <i style={{ width: `${(s.late / maxSec) * 100}%`, background: "var(--coral)" }} />}</span><span className="hw-num" style={{ textAlign: "right", fontWeight: 600 }}>{s.open}</span></div>)}
          {!d.secs.length && <div style={{ color: "var(--ink3)" }}>Nothing open.</div>}
          <Legend items={[["On time", "var(--accent)"], ["Overdue", "var(--coral)"]]} /></div>
        <div className="hw-card2"><h4>Open tasks by person</h4>
          {d.ppl.map((p) => { const person = store.people[p.id]; const name = p.id === "none" ? "Unassigned" : personName(person); return <div key={p.id} className="hw-hbar" {...on(`${name}: ${p.open} open${p.late ? `, ${p.late} overdue` : ""}`)}><span style={{ display: "flex", alignItems: "center", gap: 7, minWidth: 0 }}><Avatar person={person} id={p.id === "none" ? null : p.id} size={20} /><span className="hw-trunc">{name}</span></span><span className="tr"><i style={{ width: `${((p.open - p.late) / maxP) * 100}%`, background: "var(--accent)" }} />{p.late > 0 && <i style={{ width: `${(p.late / maxP) * 100}%`, background: "var(--coral)" }} />}</span><span className="hw-num" style={{ textAlign: "right", fontWeight: 600 }}>{p.open}</span></div>; })}
          {!d.ppl.length && <div style={{ color: "var(--ink3)" }}>Nothing open.</div>}
          <Legend items={[["On time", "var(--accent)"], ["Overdue", "var(--coral)"]]} /></div>
      </div>
      <Tip tip={tip} />
    </div></div>
  );
}
const Legend = ({ items }) => <div style={{ display: "flex", gap: 14, marginTop: 10, fontSize: 12, color: "var(--ink2)" }}>{items.map(([l, c]) => <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><i style={{ width: 10, height: 10, background: c, display: "inline-block", borderRadius: 3 }} />{l}</span>)}</div>;

// ── Portfolios ──
export function Portfolios({ store, go, navBtn }) {
  const [sel, setSel] = useState("all"); const [sort, setSort] = useState({ k: "name", d: 1 }); const [modal, setModal] = useState(null); const add = usePop(), menu = usePop();
  const active = store.projects.filter((p) => p.status !== "archived"); const pf = store.portfolios.find((x) => x.id === sel) || null;
  useEffect(() => { if (sel !== "all" && !pf) setSel("all"); }, [sel, pf]);
  const list = useMemo(() => {
    const base = pf ? (pf.project_ids || []).map((id) => store.projectsById[id]).filter(Boolean) : active;
    const val = (p) => { const s = store.projectStats[p.id] || {}; return sort.k === "name" ? p.name.toLowerCase() : sort.k === "health" ? ["off_track", "at_risk", "on_track"].indexOf(p.health || "on_track") : sort.k === "progress" ? (s.total ? s.done / s.total : -1) : sort.k === "overdue" ? s.overdue || 0 : sort.k === "due" ? p.target_end_date || "9999" : sort.k === "owner" ? personName(store.people[p.owner_id]).toLowerCase() : 0; };
    return base.slice().sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * sort.d; });
  }, [pf, active, sort, store.projectStats, store.projectsById, store.people]);
  const roll = useMemo(() => { const r = { on_track: 0, at_risk: 0, off_track: 0, overdue: 0, open: 0 }; for (const p of list) { r[p.health || "on_track"]++; const s = store.projectStats[p.id] || {}; r.overdue += s.overdue || 0; r.open += s.open || 0; } return r; }, [list, store.projectStats]);
  const th = (k, label, style) => <th style={style} onClick={() => setSort((s) => ({ k, d: s.k === k ? -s.d : 1 }))}>{label}{sort.k === k && <Icon name="up" size={11} style={{ marginLeft: 4, verticalAlign: -1, transform: sort.d < 0 ? "rotate(180deg)" : "none" }} />}</th>;
  const t0 = today();
  return (<>
    <div className="hw-top" style={{ paddingBottom: 12 }}><div className="hw-top-r">{navBtn}<span className="hw-psq" style={{ background: "var(--violet)", cursor: "default" }}><Icon name="case" size={16} sw={2} /></span><h1>Portfolios</h1><span style={{ flex: 1 }} />
      {store.portfoliosReady && <button className="hw-btn primary" onClick={() => setModal({ name: "", color: SWATCHES[2], project_ids: [] })}><Icon name="plus" size={15} sw={2.2} />New portfolio</button>}</div></div>
    <div className="hw-page hw-scroll"><div className="hw-page-in">
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 18 }}>
        <button className={"hw-pf" + (sel === "all" ? " on" : "")} onClick={() => setSel("all")}><div style={{ fontWeight: 650 }}>All projects</div><div style={{ fontSize: 12, color: "var(--ink3)", marginTop: 2 }}>{plural(active.length, "project")}</div></button>
        {store.portfolios.map((x) => <button key={x.id} className={"hw-pf" + (sel === x.id ? " on" : "")} onClick={() => setSel(x.id)}><div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 650 }}><span className="hw-dot" style={{ background: x.color || "var(--violet)", width: 10, height: 10, borderRadius: 3 }} /><span className="hw-trunc">{x.name}</span></div><div style={{ fontSize: 12, color: "var(--ink3)", marginTop: 2 }}>{plural((x.project_ids || []).filter((id) => store.projectsById[id]).length, "project")}</div></button>)}
      </div>
      {!store.portfoliosReady && <div className="hw-card2" style={{ marginBottom: 16, color: "var(--ink2)" }}>Custom portfolios switch on once this release's database update has run. Until then, All projects works as one portfolio.</div>}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
        <h3 className="hw-serif" style={{ margin: 0, fontSize: 22 }}>{pf ? pf.name : "All projects"}</h3>
        <Chip t="green" dot>{roll.on_track} on track</Chip>{roll.at_risk > 0 && <Chip t="amber" dot>{roll.at_risk} at risk</Chip>}{roll.off_track > 0 && <Chip t="coral" dot>{roll.off_track} off track</Chip>}
        <span style={{ fontSize: 12.5, color: "var(--ink3)" }}>{roll.open} open tasks{roll.overdue > 0 && <>, <b style={{ color: "var(--coral)" }}>{roll.overdue} overdue</b></>}</span>
        <span style={{ flex: 1 }} />
        {pf && <><button className="hw-btn sm" onClick={add.toggle}><Icon name="plus" size={13} />Add projects</button><button className="hw-icb" onClick={menu.toggle}><Icon name="more" /></button></>}
      </div>
      <div className="hw-card2" style={{ padding: 0, overflowX: "auto" }}>
        <table className="hw-ptable"><thead><tr>{th("name", "Project")}{th("health", "Status")}{th("progress", "Progress", { width: 220 })}{th("overdue", "Open / overdue")}{th("due", "Dates")}{th("owner", "Owner")}{pf && <th style={{ width: 36 }} />}</tr></thead>
          <tbody>{list.map((p) => { const s = store.projectStats[p.id] || { total: 0, done: 0, overdue: 0, open: 0 }; const pct = s.total ? Math.round((s.done / s.total) * 100) : 0; const h = HEALTH[p.health] || HEALTH.on_track; const late = p.target_end_date && String(p.target_end_date).slice(0, 10) < t0 && pct < 100;
            return <tr key={p.id} onClick={() => go({ kind: "project", id: p.id })}>
              <td><span style={{ display: "flex", alignItems: "center", gap: 9, fontWeight: 550 }}><span className="hw-dot" style={{ background: p.color, width: 10, height: 10, borderRadius: 3 }} /><span className="hw-trunc" style={{ maxWidth: 340 }}>{p.name}</span></span></td>
              <td><Chip t={h.tone} dot>{h.label}</Chip></td>
              <td><span style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={{ flex: 1 }}><Progress value={pct} color="var(--green)" /></span><span className="hw-num" style={{ width: 34, textAlign: "right", color: "var(--ink2)" }}>{pct}%</span></span></td>
              <td className="hw-num">{s.open}{s.overdue > 0 && <span style={{ color: "var(--coral)", fontWeight: 600 }}> · {s.overdue} late</span>}</td>
              <td className="hw-num" style={{ color: late ? "var(--coral)" : "var(--ink2)", whiteSpace: "nowrap" }}>{p.target_end_date ? fmtRange(p.start_date && String(p.start_date).slice(0, 10), String(p.target_end_date).slice(0, 10)) : <span style={{ color: "var(--ink4)" }}>—</span>}</td>
              <td>{p.owner_id ? <span style={{ display: "flex", alignItems: "center", gap: 7 }}><Avatar person={store.people[p.owner_id]} id={p.owner_id} size={22} /><span className="hw-trunc" style={{ maxWidth: 140 }}>{personName(store.people[p.owner_id])}</span></span> : <span style={{ color: "var(--ink4)" }}>—</span>}</td>
              {pf && <td><button className="hw-icb sm" title="Remove from this portfolio" onClick={(e) => { e.stopPropagation(); store.savePortfolio({ id: pf.id, project_ids: pf.project_ids.filter((id) => id !== p.id) }); }}><Icon name="x" size={13} /></button></td>}
            </tr>; })}</tbody></table>
        {!list.length && <Empty title="No projects here yet" icon="case">{pf ? "Add projects to track them together." : "Create a project to get started."}</Empty>}
      </div>
    </div></div>
    {add.open && pf && <Popover anchor={add.anchor} onClose={add.close} align="end" width={300}><OptionList multi searchable placeholder="Search projects…" options={active.map((p) => ({ value: p.id, label: p.name, dot: p.color }))} value={pf.project_ids || []} onPick={(id) => store.savePortfolio({ id: pf.id, project_ids: (pf.project_ids || []).includes(id) ? pf.project_ids.filter((x) => x !== id) : [...(pf.project_ids || []), id] })} /></Popover>}
    {menu.open && pf && <Popover anchor={menu.anchor} onClose={menu.close} align="end" width={200}><MenuItem icon="note" onClick={() => { setModal({ ...pf }); menu.close(); }}>Rename or recolour</MenuItem><MenuSep /><MenuItem icon="trash" danger onClick={() => { menu.close(); if (window.confirm(`Delete the portfolio "${pf.name}"? Its projects stay where they are.`)) store.deletePortfolio(pf.id); }}>Delete portfolio</MenuItem></Popover>}
    {modal && <Modal title={modal.id ? "Portfolio" : "New portfolio"} onClose={() => setModal(null)} width={460} footer={<><button className="hw-btn ghost" onClick={() => setModal(null)}>Cancel</button><button className="hw-btn primary" disabled={!modal.name.trim()} onClick={async () => { const made = await store.savePortfolio(modal.id ? { id: modal.id, name: modal.name.trim(), color: modal.color } : { ...modal, name: modal.name.trim() }); setModal(null); if (made?.id) setSel(made.id); }}>{modal.id ? "Save" : "Create"}</button></>}>
      <Field label="Name"><input className="hw-input" autoFocus placeholder="e.g. 2027 product launches" value={modal.name} onChange={(e) => setModal({ ...modal, name: e.target.value })} /></Field>
      <Field label="Colour"><ColorPicker value={modal.color} onPick={(c) => setModal({ ...modal, color: c })} /></Field>
    </Modal>}
  </>);
}

// ── Workload ──
export function Workload({ store, onOpen, navBtn }) {
  const [unit, setUnit] = useState("tasks"); const [cap, setCap] = useState(() => { try { return JSON.parse(localStorage.getItem("hw.cap") || "null") || { tasks: 8, hours: 35 }; } catch { return { tasks: 8, hours: 35 }; } }); const [scope, setScope] = useState("all"); const [pop, setPop] = useState(null); const scopePop = usePop();
  useEffect(() => { try { localStorage.setItem("hw.cap", JSON.stringify(cap)); } catch {} }, [cap]);
  const t0 = today(); const w0 = startOfWeek(t0); const WEEKS = 8;
  const weeks = Array.from({ length: WEEKS }, (_, i) => { const a = addDays(w0, i * 7); const d = parseYmd(a); return { a, b: addDays(a, 6), label: i === 0 ? "This week" : `${monthName(d.getMonth())} ${d.getDate()}` }; });
  const scopeIds = useMemo(() => { if (scope === "all") return null; const pf = store.portfolios.find((p) => p.id === scope); return new Set(pf?.project_ids || []); }, [scope, store.portfolios]);
  const rows = useMemo(() => {
    const m = new Map(); const w = (t) => (unit === "hours" ? Number(t.estimated_hours) || 0 : 1);
    for (const t of store.tasks) {
      if (isDone(t) || !t.assignee_id) continue; if (scopeIds && !scopeIds.has(t.project_id)) continue; const p = store.people[t.assignee_id]; if (!p || p.is_external) continue;
      let r = m.get(t.assignee_id); if (!r) { r = { id: t.assignee_id, person: p, late: [], none: [], wk: weeks.map(() => []), later: [], total: 0 }; m.set(t.assignee_id, r); }
      r.total += w(t); const d = t.due_date && String(t.due_date).slice(0, 10);
      if (!d) r.none.push(t); else if (d < w0) r.late.push(t); else { const i = Math.floor(diffDays(d, w0) / 7); if (i < WEEKS) r.wk[i].push(t); else r.later.push(t); }
    }
    return [...m.values()].sort((a, b) => b.total - a.total);
  }, [store.tasks, store.people, unit, scopeIds, w0]);
  const sum = (list) => (unit === "hours" ? Math.round(list.reduce((s, t) => s + (Number(t.estimated_hours) || 0), 0) * 10) / 10 : list.length);
  const limit = cap[unit];
  const cell = (r, list, label, kind, key) => { const v = sum(list); const over = kind === "wk" && v > limit; const ratio = Math.min(1, v / Math.max(1, limit));
    const bg = !v ? "transparent" : kind === "late" ? "var(--coral-soft)" : over ? "var(--coral-soft)" : kind === "wk" ? `color-mix(in srgb, var(--accent) ${Math.round(10 + ratio * 34)}%, var(--surface))` : "var(--sunken)";
    return <div key={key} className="cell" onClick={(e) => v && setPop({ el: e.currentTarget, list, title: `${personName(r.person)} · ${label}` })} style={v ? undefined : { cursor: "default" }}><span style={{ background: bg, color: !v ? "var(--ink4)" : kind === "late" || over ? "var(--coral)" : "var(--ink)" }}>{v || "·"}</span></div>; };
  const cols = `minmax(190px,1.4fr) 84px repeat(${WEEKS}, minmax(74px,1fr)) 80px 84px`;
  return (<>
    <div className="hw-top" style={{ paddingBottom: 12 }}><div className="hw-top-r">{navBtn}<span className="hw-psq" style={{ background: "var(--blue)", cursor: "default" }}><Icon name="users" size={16} sw={2} /></span><h1>Workload</h1><span style={{ flex: 1 }} />
      <button className="hw-btn" onClick={scopePop.toggle}><Icon name="case" size={15} />{scope === "all" ? "All projects" : store.portfolios.find((p) => p.id === scope)?.name}</button>
      <Seg value={unit} options={[["tasks", "Task count"], ["hours", "Est. hours"]]} onChange={setUnit} />
      <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12.5, color: "var(--ink2)" }}>Weekly capacity<input className="hw-input hw-num" style={{ width: 62 }} type="number" min="1" value={limit} onChange={(e) => setCap({ ...cap, [unit]: Math.max(1, Number(e.target.value) || 1) })} /></label></div></div>
    <div className="hw-page hw-scroll"><div className="hw-page-in" style={{ maxWidth: 1400 }}>
      <div style={{ fontSize: 12.5, color: "var(--ink3)", marginBottom: 10 }}>Open work by the week it's due. Cells turn red when someone has more than {limit} {unit === "hours" ? "estimated hours" : "tasks"} due in a week. Click a number to see the tasks.</div>
      <div className="hw-card2" style={{ padding: 0, overflowX: "auto" }}>
        <div className="hw-wl" style={{ gridTemplateColumns: cols }}>
          <div className="hd">Person</div><div className="hd" style={{ justifyContent: "center", color: "var(--coral)" }}>Overdue</div>{weeks.map((w, i) => <div key={i} className="hd" style={{ justifyContent: "center", color: i === 0 ? "var(--accent-ink)" : undefined }}>{w.label}</div>)}<div className="hd" style={{ justifyContent: "center" }}>Later</div><div className="hd" style={{ justifyContent: "center" }}>No date</div>
          {rows.map((r) => [
            <div key={r.id} style={{ gap: 9 }}><Avatar person={r.person} size={26} /><span style={{ minWidth: 0 }}><span className="hw-trunc" style={{ display: "block", fontWeight: 550 }}>{personName(r.person)}</span><span style={{ fontSize: 11.5, color: "var(--ink3)" }}>{unit === "hours" ? `${Math.round(r.total)}h open` : plural(r.total, "open task")}</span></span></div>,
            cell(r, r.late, "Overdue", "late", r.id + "l"),
            ...r.wk.map((list, i) => cell(r, list, weeks[i].label, "wk", r.id + i)),
            cell(r, r.later, "Later", "other", r.id + "x"),
            cell(r, r.none, "No due date", "other", r.id + "n"),
          ])}
        </div>
        {!rows.length && <Empty title="No assigned work" icon="users">Assign tasks to people and their load shows up here.</Empty>}
      </div>
    </div></div>
    {scopePop.open && <Popover anchor={scopePop.anchor} onClose={scopePop.close} align="end" width={240}><MenuItem sel={scope === "all"} onClick={() => { setScope("all"); scopePop.close(); }}>All projects</MenuItem>{store.portfolios.length > 0 && <MenuSep />}{store.portfolios.map((p) => <MenuItem key={p.id} sel={scope === p.id} onClick={() => { setScope(p.id); scopePop.close(); }}>{p.name}</MenuItem>)}</Popover>}
    {pop && <Popover anchor={pop.el} onClose={() => setPop(null)} width={360}><div style={{ padding: "4px 8px 6px", fontWeight: 650 }}>{pop.title}</div>
      {pop.list.slice().sort((a, b) => String(a.due_date || "9").localeCompare(String(b.due_date || "9"))).map((t) => <div key={t.id} className="hw-mi" onClick={() => { onOpen(t); setPop(null); }}><span className="hw-dot" style={{ background: store.projectsById[t.project_id]?.color || "var(--ink4)" }} /><span className="hw-trunc" style={{ flex: 1 }}>{t.title}</span><span className="k">{unit === "hours" && t.estimated_hours ? t.estimated_hours + "h · " : ""}{t.due_date ? fmtDate(String(t.due_date).slice(0, 10)) : ""}</span></div>)}</Popover>}
  </>);
}
