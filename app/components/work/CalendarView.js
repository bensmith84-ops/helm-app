"use client";
// Month calendar. Tasks sit on their due date (multi-day tasks span); drag to another day to reschedule.
import { useState, useMemo } from "react";
import { Icon, Popover, Check } from "./ui";
import { taskKind, isDone, ymd, parseYmd, today, addDays, diffDays, monthName, fmtDate, fmtRange } from "./model";

export const CALENDAR_CSS = `
.hw-calv{flex:1;min-height:0;display:flex;flex-direction:column;background:var(--surface)}
.hw-calv-h{display:flex;align-items:center;gap:6px;padding:10px 18px;flex:none}
.hw-calv-h h3{margin:0;font-weight:700;font-size:17px;min-width:170px}
.hw-calv-dow{display:grid;grid-template-columns:repeat(7,1fr);border-top:1px solid var(--line);border-bottom:1px solid var(--line);flex:none}
.hw-calv-dow span{padding:6px 10px;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--ink3)}
.hw-calv-g{flex:1;min-height:0;display:flex;flex-direction:column;overflow-y:auto}
.hw-week{flex:1 0 auto;min-height:112px;display:grid;grid-template-columns:repeat(7,1fr);position:relative}
.hw-span{position:absolute;height:22px;border-radius:6px;background:color-mix(in srgb,var(--c,var(--accent)) 16%,var(--surface));border:1px solid color-mix(in srgb,var(--c,var(--accent)) 40%,transparent);color:var(--ink);font-size:12px;font-weight:500;display:flex;align-items:center;gap:6px;padding:0 7px;cursor:pointer;z-index:2;min-width:0}
.hw-span:hover{box-shadow:var(--sh1)}
.hw-span.done{opacity:.55}
.hw-span.open{box-shadow:0 0 0 2px var(--accent)}
.hw-span.cl{border-top-left-radius:0;border-bottom-left-radius:0;border-left-style:dashed}
.hw-span.cr{border-top-right-radius:0;border-bottom-right-radius:0;border-right-style:dashed}
.hw-day{border-right:1px solid var(--line);border-bottom:1px solid var(--line);padding:4px 5px 6px;display:flex;flex-direction:column;gap:3px;min-width:0;position:relative}
.hw-day:nth-child(7n){border-right:none}
.hw-day.out{background:var(--raise)}
.hw-day.out .dn{color:var(--ink4)}
.hw-day.we{background:color-mix(in srgb,var(--sunken) 45%,var(--surface))}
.hw-day.over{box-shadow:inset 0 0 0 2px var(--accent);background:var(--accent-soft)}
.hw-day .dn{font-size:12px;font-weight:550;color:var(--ink2);height:22px;display:flex;align-items:center;padding:0 5px;font-variant-numeric:tabular-nums}
.hw-day.today .dn span{background:var(--accent);color:var(--on-accent);border-radius:11px;padding:1px 7px;font-weight:700}
.hw-day .add{margin-left:auto;opacity:0}
.hw-day:hover .add{opacity:1}
.hw-ev{display:flex;align-items:center;gap:6px;height:24px;padding:0 6px;border-radius:6px;background:var(--surface);border:1px solid var(--line);font-size:12px;cursor:pointer;min-width:0;border-left:3px solid var(--c,var(--accent))}
.hw-ev:hover{border-color:var(--line2);box-shadow:var(--sh1)}
.hw-ev.done{opacity:.55}
.hw-ev.open{box-shadow:0 0 0 2px var(--accent)}
.hw-ev.late{border-left-color:var(--coral)}
.hw-ev.span{background:color-mix(in srgb,var(--c,var(--accent)) 12%,var(--surface))}
`;
const MAX = 4, LANES = 3;

export default function CalendarView({ store, tasks, projectId, onOpen, openId }) {
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [over, setOver] = useState(null); const [adding, setAdding] = useState(null); const [draft, setDraft] = useState(""); const [more, setMore] = useState(null);
  const t0 = today();
  const cells = useMemo(() => { const off = (cursor.getDay() + 6) % 7; const n = Math.ceil((off + new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate()) / 7) * 7; return Array.from({ length: n }, (_, i) => { const d = new Date(cursor.getFullYear(), cursor.getMonth(), 1 - off + i); return { s: ymd(d), n: d.getDate(), out: d.getMonth() !== cursor.getMonth(), we: d.getDay() === 0 || d.getDay() === 6 }; }); }, [cursor]);
  // Single-day tasks sit in their day; multi-day tasks become bars laid out in lanes per week row.
  const { byDay, weeks } = useMemo(() => {
    const m = new Map(); const first = cells[0].s, last = cells[cells.length - 1].s; const spans = [];
    for (const t of tasks) { const d = t.due_date && String(t.due_date).slice(0, 10); const s0 = t.start_date && String(t.start_date).slice(0, 10); if (!d && !s0) continue; const a = s0 || d, b = d || s0; if (b < first || a > last) continue; if (a === b) { const arr = m.get(b); if (arr) arr.push({ t }); else m.set(b, [{ t }]); } else spans.push({ t, a, b }); }
    for (const a of m.values()) a.sort((x, y) => isDone(x.t) - isDone(y.t) || String(x.t.title).localeCompare(String(y.t.title)));
    spans.sort((x, y) => x.a.localeCompare(y.a) || y.b.localeCompare(x.b));
    const wk = [];
    for (let w = 0; w < cells.length / 7; w++) {
      const ws = cells[w * 7].s, we = cells[w * 7 + 6].s; const lanes = []; const segs = []; const used = [0, 0, 0, 0, 0, 0, 0]; const hidden = [0, 0, 0, 0, 0, 0, 0];
      for (const sp of spans) { if (sp.b < ws || sp.a > we) continue; const c0 = sp.a < ws ? 0 : diffDays(sp.a, ws), c1 = sp.b > we ? 6 : diffDays(sp.b, ws); let lane = lanes.findIndex((end) => end < c0); if (lane < 0) { lane = lanes.length; lanes.push(c1); } else lanes[lane] = c1;
        if (lane >= LANES) { for (let c = c0; c <= c1; c++) hidden[c]++; continue; } segs.push({ t: sp.t, c0, c1, lane, cl: sp.a < ws, cr: sp.b > we }); for (let c = c0; c <= c1; c++) used[c] = Math.max(used[c], lane + 1); }
      wk.push({ segs, used, hidden });
    }
    return { byDay: m, weeks: wk };
  }, [tasks, cells]);
  const unscheduled = useMemo(() => tasks.filter((t) => !t.due_date && !t.start_date && !isDone(t)).length, [tasks]);
  const drop = (e, day) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData("text/plain"); const t = store.tasksById.get(id); if (!t) return; const d = t.due_date && String(t.due_date).slice(0, 10); if (d === day) return; const shift = d ? diffDays(day, d) : 0; store.updateTask(id, { due_date: day, start_date: t.start_date && d ? addDays(String(t.start_date).slice(0, 10), shift) : t.start_date || null }, { label: "reschedule" }); };
  const create = (day) => { const title = draft.trim(); setDraft(""); setAdding(null); if (!title) return; const secs = projectId ? store.sectionsOf.get(projectId) || [] : []; store.createTask({ title, due_date: day, project_id: projectId || null, section_id: secs[0]?.id || null, ...(projectId ? {} : { assignee_id: store.uid }) }); };
  const ev = (e, day) => { const t = e.t; const p = store.projectsById[t.project_id]; const sec = projectId ? null : p; const late = !isDone(t) && t.due_date && String(t.due_date).slice(0, 10) < t0;
    return <div key={t.id} className={"hw-ev" + (isDone(t) ? " done" : "") + (openId === t.id ? " open" : "") + (late ? " late" : "")} style={{ "--c": sec?.color || (projectId ? p?.color : undefined) }} draggable onDragStart={(x) => { try { x.dataTransfer.setData("text/plain", t.id); x.dataTransfer.effectAllowed = "move"; } catch {} }} onClick={(x) => { x.stopPropagation(); onOpen(t); }} title={t.title}>
      <Check done={isDone(t)} kind={taskKind(t)} size={14} onClick={() => store.completeTask(t)} /><span className="hw-trunc" style={{ flex: 1, textDecoration: isDone(t) ? "line-through" : "none" }}>{t.title}</span></div>; };
  return (
    <div className="hw-calv">
      <div className="hw-calv-h"><h3>{monthName(cursor.getMonth(), true)} {cursor.getFullYear()}</h3>
        <button className="hw-icb" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}><Icon name="chevL" /></button>
        <button className="hw-btn sm" onClick={() => { const d = new Date(); setCursor(new Date(d.getFullYear(), d.getMonth(), 1)); }}>Today</button>
        <button className="hw-icb" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}><Icon name="chevR" /></button>
        <span style={{ flex: 1 }} />{unscheduled > 0 && <span style={{ fontSize: 12, color: "var(--ink3)" }}>{unscheduled} open {unscheduled === 1 ? "task has" : "tasks have"} no date</span>}</div>
      <div className="hw-calv-dow">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <span key={d}>{d}</span>)}</div>
      <div className="hw-calv-g hw-scroll">
        {weeks.map((wk, w) => <div key={w} className="hw-week">
          {cells.slice(w * 7, w * 7 + 7).map((c, ci) => { const list = byDay.get(c.s) || NONE; const room = Math.max(1, MAX - wk.used[ci]); const extra = Math.max(0, list.length - room) + wk.hidden[ci]; return (
            <div key={c.s} className={"hw-day" + (c.out ? " out" : "") + (c.we ? " we" : "") + (c.s === t0 ? " today" : "") + (over === c.s ? " over" : "")} onDragOver={(e) => { e.preventDefault(); if (over !== c.s) setOver(c.s); }} onDragLeave={() => setOver((o) => (o === c.s ? null : o))} onDrop={(e) => drop(e, c.s)} onDoubleClick={() => { setAdding(c.s); setDraft(""); }}>
              <div className="dn"><span>{c.n === 1 ? monthName(parseYmd(c.s).getMonth()) + " 1" : c.n}</span><button className="hw-icb sm add" title="Add a task on this day" onClick={() => { setAdding(c.s); setDraft(""); }}><Icon name="plus" size={13} /></button></div>
              {wk.used[ci] > 0 && <div style={{ height: wk.used[ci] * 25 - 3, flex: "none" }} />}
              {list.slice(0, room).map((e) => ev(e, c.s))}
              {extra > 0 && <button className="hw-btn ghost sm" style={{ height: 20, justifyContent: "flex-start", padding: "0 6px", fontSize: 11.5 }} onClick={(e) => setMore({ day: c.s, el: e.currentTarget })}>{extra} more</button>}
              {adding === c.s && <input className="hw-input" style={{ height: 24, fontSize: 12, padding: "0 6px" }} autoFocus placeholder="Task name" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => create(c.s)} onKeyDown={(e) => { if (e.key === "Enter") create(c.s); if (e.key === "Escape") { setDraft(""); setAdding(null); } }} />}
            </div>); })}
          {wk.segs.map((sg) => { const t = sg.t; const p = store.projectsById[t.project_id]; return <div key={t.id} className={"hw-span" + (isDone(t) ? " done" : "") + (openId === t.id ? " open" : "") + (sg.cl ? " cl" : "") + (sg.cr ? " cr" : "")} style={{ "--c": projectId ? undefined : p?.color, left: `calc(${(sg.c0 / 7) * 100}% + 5px)`, width: `calc(${((sg.c1 - sg.c0 + 1) / 7) * 100}% - 10px)`, top: 30 + sg.lane * 25 }} draggable onDragStart={(x) => { try { x.dataTransfer.setData("text/plain", t.id); x.dataTransfer.effectAllowed = "move"; } catch {} }} onClick={() => onOpen(t)} title={`${t.title} · ${fmtRange(String(t.start_date).slice(0, 10), String(t.due_date).slice(0, 10))}`}>
            {!sg.cl && <Check done={isDone(t)} kind={taskKind(t)} size={14} onClick={() => store.completeTask(t)} />}<span className="hw-trunc" style={{ textDecoration: isDone(t) ? "line-through" : "none" }}>{t.title}</span></div>; })}
        </div>)}
      </div>
      {more && <Popover anchor={more.el} onClose={() => setMore(null)} width={280}><div style={{ padding: "4px 6px 6px", fontWeight: 600 }}>{fmtDate(more.day, { relative: false })}</div><div style={{ display: "flex", flexDirection: "column", gap: 3, padding: 2 }}>{[...(byDay.get(more.day) || NONE), ...tasks.filter((t) => t.start_date && t.due_date && String(t.start_date).slice(0, 10) !== String(t.due_date).slice(0, 10) && String(t.start_date).slice(0, 10) <= more.day && String(t.due_date).slice(0, 10) >= more.day).map((t) => ({ t }))].map((e) => ev(e, more.day))}</div></Popover>}
    </div>
  );
}
const NONE = [];
