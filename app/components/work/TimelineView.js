"use client";
// Timeline / Gantt: drag bars to reschedule, drag their edges to resize, pull the
// dot at a bar's end onto another bar to make it wait on this one.
import { useState, useEffect, useLayoutEffect, useRef, useMemo } from "react";
import { Icon, Check, Avatar, Empty } from "./ui";
import { taskKind, isDone, addDays, diffDays, parseYmd, ymd, today, startOfWeek, monthName, fmtRange, personName, STATUS } from "./model";
import { tone } from "./theme";

export const TIMELINE_CSS = `
.hw-tl{flex:1;min-height:0;overflow:auto;position:relative;background:var(--surface);outline:none}
.hw-tl-head{position:sticky;top:0;z-index:6;display:flex;height:48px;background:var(--surface);border-bottom:1px solid var(--line)}
.hw-tl-corner{position:sticky;left:0;z-index:7;background:var(--surface);border-right:1px solid var(--line);display:flex;align-items:flex-end;padding:0 12px 7px;font-size:11.5px;font-weight:600;color:var(--ink3);flex:none;gap:8px}
.hw-tl-scale{position:relative;flex:none}
.hw-tl-scale .top{margin-top:6px;font-size:12px;font-weight:650;color:var(--ink);white-space:nowrap;padding-left:8px}
.hw-tl-scale .tick{position:absolute;bottom:0;height:22px;border-left:1px solid var(--line);font-size:10.5px;color:var(--ink3);padding:4px 0 0 5px;white-space:nowrap;font-variant-numeric:tabular-nums}
.hw-tl-scale .tick.now{color:var(--accent-ink);font-weight:700}
.hw-tl-body{position:relative;display:flex}
.hw-tl-names{position:sticky;left:0;z-index:4;background:var(--surface);border-right:1px solid var(--line);flex:none}
.hw-tl-name{height:34px;display:flex;align-items:center;gap:8px;padding:0 10px 0 12px;border-bottom:1px solid var(--line);cursor:pointer;font-size:13px}
.hw-tl-name:hover,.hw-tl-name.hi{background:var(--raise)}
.hw-tl-name.open{background:var(--accent-soft)}
.hw-tl-name.grp{font-weight:650;cursor:default;background:var(--raise);gap:6px}
.hw-tl-grid{position:relative;flex:none}
.hw-tl-rowbg{position:absolute;left:0;right:0;height:34px;border-bottom:1px solid var(--line)}
.hw-tl-rowbg.grp{background:var(--raise)}
.hw-tl-rowbg.hi{background:var(--raise)}
.hw-tl-col{position:absolute;top:0;bottom:0;border-left:1px solid var(--line);opacity:.7}
.hw-tl-we{position:absolute;top:0;bottom:0;background:var(--sunken);opacity:.55}
.hw-tl-today{position:absolute;top:0;bottom:0;width:2px;background:var(--coral);z-index:2;pointer-events:none}
.hw-tl-today::before{content:'';position:absolute;top:0;left:-3px;width:8px;height:8px;border-radius:50%;background:var(--coral)}
.hw-bar-t{position:absolute;height:22px;border-radius:6px;background:var(--c-soft);border:1px solid color-mix(in srgb,var(--c) 45%,transparent);cursor:grab;display:flex;align-items:center;font-size:11.5px;font-weight:550;color:var(--c);z-index:3;user-select:none;transition:box-shadow .12s;min-width:10px}
.hw-bar-t:hover,.hw-bar-t.act{box-shadow:var(--sh2);z-index:5}
.hw-bar-t.done{opacity:.55}
.hw-bar-t.open{box-shadow:0 0 0 2px var(--accent)}
.hw-bar-t .fill{position:absolute;inset:0 auto 0 0;background:color-mix(in srgb,var(--c) 22%,transparent);border-radius:5px 0 0 5px;pointer-events:none}
.hw-bar-t .lbl{position:absolute;left:100%;margin-left:8px;white-space:nowrap;color:var(--ink2);font-weight:500;pointer-events:none;max-width:260px;overflow:hidden;text-overflow:ellipsis}
.hw-bar-t .in{padding:0 7px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;position:relative;pointer-events:none}
.hw-bar-t .ez{position:absolute;top:-1px;bottom:-1px;width:7px;cursor:ew-resize;z-index:2}
.hw-bar-t .ez.l{left:-2px}.hw-bar-t .ez.r{right:-2px}
.hw-bar-t .dot{position:absolute;right:-13px;top:6px;width:9px;height:9px;border-radius:50%;background:var(--surface);border:2px solid var(--c);cursor:crosshair;opacity:0;z-index:6}
.hw-bar-t:hover .dot{opacity:1}
.hw-ms{position:absolute;width:16px;height:16px;transform:rotate(45deg);border-radius:3px;background:var(--green);border:2px solid var(--surface);box-shadow:0 0 0 1px var(--green);cursor:grab;z-index:3}
.hw-ms.todo{background:var(--surface)}
.hw-tl-ghost{position:absolute;height:22px;border-radius:6px;border:1.5px dashed var(--accent);background:var(--accent-soft);opacity:.7;pointer-events:none;z-index:2}
.hw-tl-tip{position:fixed;z-index:1100;background:var(--ink);color:var(--paper);font-size:11.5px;font-weight:550;padding:4px 8px;border-radius:6px;pointer-events:none;white-space:nowrap;font-variant-numeric:tabular-nums}
`;
const ROW = 34, NAMES = 300; const PX = { day: 46, week: 22, month: 8, quarter: 3.4 };
const TONE_OF = ["teal", "blue", "violet", "pink", "coral", "amber", "green", "slate"];

export default function TimelineView({ store, groups, view, ctx, projectId, onOpen, openId }) {
  const { people, deps } = store; const zoom = view.zoom || "week"; const px = PX[zoom];
  const scroller = useRef(null); const [collapsed, setCollapsed] = useState({}); const [hover, setHover] = useState(null);
  const [drag, setDrag] = useState(null); // { id, mode, shift } while moving / resizing
  const [link, setLink] = useState(null); // { from, x, y } while drawing a dependency
  const [ghost, setGhost] = useState(null); const [tip, setTip] = useState(null);
  const grouped = view.group && view.group !== "none";
  const rows = useMemo(() => { const out = []; groups.forEach((g, gi) => { if (grouped) out.push({ type: "group", g, key: "g" + g.key }); if (grouped && collapsed[g.key]) return; g.tasks.forEach((t) => out.push({ type: "task", t, g, key: t._k || t.id, tone: g.tone || TONE_OF[gi % TONE_OF.length], color: g.color })); }); return out; }, [groups, grouped, collapsed]);
  const t0 = today();
  const [start, end] = useMemo(() => {
    let lo = t0, hi = t0; for (const r of rows) { if (r.type !== "task") continue; const s = r.t.start_date && String(r.t.start_date).slice(0, 10), d = r.t.due_date && String(r.t.due_date).slice(0, 10); for (const v of [s, d]) if (v) { if (v < lo) lo = v; if (v > hi) hi = v; } }
    const pad = zoom === "day" ? 14 : zoom === "week" ? 28 : zoom === "month" ? 90 : 180; if (diffDays(t0, lo) > 540) lo = addDays(t0, -540); if (diffDays(hi, t0) > 720) hi = addDays(t0, 720);
    return [startOfWeek(addDays(lo, -pad)), addDays(hi, pad * 2)];
  }, [rows, zoom, t0]);
  const days = diffDays(end, start) + 1; const W = days * px; const x = (d) => diffDays(d, start) * px;
  const rowIndex = useMemo(() => { const m = new Map(); rows.forEach((r, i) => { if (r.type === "task") m.set(r.t.id, i); }); return m; }, [rows]);

  // scale ticks
  const scale = useMemo(() => {
    const tops = [], ticks = [], cols = [], weekends = []; const s = parseYmd(start);
    for (let i = 0; i < days; i++) {
      const d = new Date(s.getFullYear(), s.getMonth(), s.getDate() + i); const dow = d.getDay(), dom = d.getDate(), mo = d.getMonth();
      if (zoom === "day" || zoom === "week") { if (dom === 1 || i === 0) tops.push({ x: i * px, label: `${monthName(mo, true)} ${d.getFullYear()}` }); if (dow === 6) weekends.push({ x: i * px, w: px * 2 }); }
      else if ((mo === 0 && dom === 1) || i === 0) tops.push({ x: i * px, label: String(d.getFullYear()) });
      if (zoom === "day") { ticks.push({ x: i * px, label: `${"SMTWTFS"[dow]} ${dom}`, now: ymd(d) === t0 }); cols.push(i * px); }
      else if (zoom === "week") { if (dow === 1) { ticks.push({ x: i * px, label: `${dom}`, now: startOfWeek(t0) === ymd(d) }); cols.push(i * px); } }
      else if (zoom === "month") { if (dom === 1) { ticks.push({ x: i * px, label: monthName(mo), now: mo === new Date().getMonth() && d.getFullYear() === new Date().getFullYear() }); cols.push(i * px); } }
      else if (dom === 1 && mo % 3 === 0) { ticks.push({ x: i * px, label: "Q" + (mo / 3 + 1) }); cols.push(i * px); }
    }
    return { tops, ticks, cols, weekends };
  }, [start, days, px, zoom, t0]);

  const scrollToToday = () => { const el = scroller.current; if (el) el.scrollLeft = Math.max(0, x(t0) - (el.clientWidth - NAMES) / 3); };
  useLayoutEffect(scrollToToday, [zoom, start]);

  // dates for a task, including an in-flight drag
  const span = (t) => {
    let s = t.start_date && String(t.start_date).slice(0, 10), d = t.due_date && String(t.due_date).slice(0, 10); if (!s && !d) return null; if (!d) d = s; if (!s) s = d;
    if (drag && drag.id === t.id && drag.shift) { if (drag.mode === "move") { s = addDays(s, drag.shift); d = addDays(d, drag.shift); } else if (drag.mode === "l") { s = addDays(s, drag.shift); if (s > d) s = d; } else { d = addDays(d, drag.shift); if (d < s) d = s; } }
    return { s, d, single: !t.start_date || s === d };
  };
  const beginDrag = (e, t, mode) => {
    if (e.button !== 0) return; e.preventDefault(); e.stopPropagation(); const x0 = e.clientX; let shift = 0, moved = false;
    setDrag({ id: t.id, mode, shift: 0 });
    const mv = (ev) => { const n = Math.round((ev.clientX - x0) / px); if (Math.abs(ev.clientX - x0) > 3) moved = true; if (n !== shift) { shift = n; setDrag({ id: t.id, mode, shift }); } const sp = spanWith(t, mode, shift); setTip({ x: ev.clientX + 14, y: ev.clientY + 16, text: fmtRange(sp.s, sp.d) }); };
    const up = () => {
      window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); setTip(null);
      if (shift) { const sp = spanWith(t, mode, shift); store.updateTask(t.id, { start_date: t.start_date || mode === "l" ? sp.s : sp.s === sp.d ? null : sp.s, due_date: sp.d }, { label: "reschedule" }); setTimeout(() => setDrag(null), 60); }
      else { setDrag(null); if (!moved) onOpen(t); }
    };
    window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
  };
  const spanWith = (t, mode, shift) => { let s = t.start_date && String(t.start_date).slice(0, 10), d = t.due_date && String(t.due_date).slice(0, 10); if (!d) d = s; if (!s) s = d; if (mode === "move") return { s: addDays(s, shift), d: addDays(d, shift) }; if (mode === "l") { const ns = addDays(s, shift); return { s: ns > d ? d : ns, d }; } const nd = addDays(d, shift); return { s, d: nd < s ? s : nd }; };
  const beginLink = (e, t) => {
    e.preventDefault(); e.stopPropagation(); const el = scroller.current; const base = el.getBoundingClientRect();
    const at = (ev) => ({ x: ev.clientX - base.left + el.scrollLeft - NAMES, y: ev.clientY - base.top + el.scrollTop - 48 });
    setLink({ from: t.id, ...at(e) });
    const mv = (ev) => setLink({ from: t.id, ...at(ev) });
    const up = (ev) => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); setLink(null); const p = at(ev); const r = rows[Math.floor(p.y / ROW)]; if (r?.type === "task" && r.t.id !== t.id) store.addDep(t.id, r.t.id); };
    window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
  };
  // click-drag on an empty row to schedule a task that has no dates
  const gridDown = (e, r) => {
    if (e.button !== 0 || r.type !== "task" || span(r.t)) return; const rect = e.currentTarget.getBoundingClientRect(); const d0 = Math.floor((e.clientX - rect.left) / px); let d1 = d0; const i = rowIndex.get(r.t.id);
    setGhost({ i, a: d0, b: d0 });
    const mv = (ev) => { d1 = Math.floor((ev.clientX - rect.left) / px); setGhost({ i, a: Math.min(d0, d1), b: Math.max(d0, d1) }); };
    const up = () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); setGhost(null); const a = Math.min(d0, d1), b = Math.max(d0, d1); store.updateTask(r.t.id, { start_date: a === b ? null : addDays(start, a), due_date: addDays(start, b) }, { label: "schedule" }); };
    window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up);
  };

  const arrows = useMemo(() => {
    const out = [];
    for (const d of deps) {
      const a = rowIndex.get(d.predecessor_id), b = rowIndex.get(d.successor_id); if (a == null || b == null) continue;
      const sa = span(rows[a].t), sb = span(rows[b].t); if (!sa || !sb) continue;
      const x1 = x(sa.d) + px + (taskKind(rows[a].t) === "milestone" ? 2 : 0), y1 = a * ROW + ROW / 2, x2 = x(sb.s), y2 = b * ROW + ROW / 2; const late = sb.s <= sa.d && !isDone(rows[a].t);
      const mid = Math.max(x1 + 10, Math.min(x2 - 10, x1 + 10));
      const path = x2 - 10 >= x1 + 10 ? `M${x1} ${y1} H${mid} V${y2} H${x2 - 2}` : `M${x1} ${y1} H${x1 + 10} V${(y1 + y2) / 2 + (y2 > y1 ? -ROW / 2 + 17 : ROW / 2 - 17)} H${x2 - 12} V${y2} H${x2 - 2}`;
      out.push({ id: d.id, path, late, x2, y2 });
    }
    return out;
  }, [deps, rowIndex, rows, start, px, drag]);

  if (!rows.some((r) => r.type === "task")) return <div className="hw-tl"><Empty title="Nothing to plot yet" icon="timeline">Add tasks, then give them dates here by clicking and dragging on a row.</Empty></div>;
  const H = rows.length * ROW;
  return (
    <div className="hw-tl hw-scroll" ref={scroller}>
      <div className="hw-tl-head" style={{ width: NAMES + W }}>
        <div className="hw-tl-corner" style={{ width: NAMES }}><span style={{ flex: 1 }}>Task</span><button className="hw-btn sm" onClick={scrollToToday}>Today</button></div>
        <div className="hw-tl-scale" style={{ width: W }}>
          {scale.tops.map((t, i) => <div key={i} style={{ position: "absolute", top: 0, height: 24, left: t.x, width: (scale.tops[i + 1]?.x ?? W) - t.x }}><span className="top" style={{ position: "sticky", left: NAMES, display: "inline-block", top: 6 }}>{t.label}</span></div>)}
          {scale.ticks.map((t, i) => <span key={i} className={"tick" + (t.now ? " now" : "")} style={{ left: t.x }}>{t.label}</span>)}
        </div>
      </div>
      <div className="hw-tl-body" style={{ width: NAMES + W }}>
        <div className="hw-tl-names" style={{ width: NAMES }}>
          {rows.map((r) => r.type === "group"
            ? <div key={r.key} className="hw-tl-name grp"><button className={"hw-tw" + (collapsed[r.g.key] ? "" : " open")} onClick={() => setCollapsed((p) => ({ ...p, [r.g.key]: !p[r.g.key] }))}><Icon name="chevR" size={14} /></button>{r.g.person !== undefined ? <Avatar id={r.g.person} person={people[r.g.person]} size={18} /> : <span className="hw-dot" style={{ background: r.g.color || tone(r.g.tone)["--c"] }} />}<span className="hw-trunc" style={{ flex: 1 }}>{r.g.label || "Tasks"}</span><span className="hw-num" style={{ fontSize: 11.5, color: "var(--ink3)", fontWeight: 500 }}>{r.g.tasks.length}</span></div>
            : <div key={r.key} className={"hw-tl-name" + (openId === r.t.id ? " open" : hover === r.t.id ? " hi" : "")} onClick={() => onOpen(r.t)} onMouseEnter={() => setHover(r.t.id)} onMouseLeave={() => setHover(null)}>
                <Check done={isDone(r.t)} kind={taskKind(r.t)} size={16} onClick={() => store.completeTask(r.t)} /><span className="hw-trunc" style={{ flex: 1, color: isDone(r.t) ? "var(--ink3)" : undefined }}>{r.t.title}</span>
                {r.t.assignee_id && <Avatar person={people[r.t.assignee_id]} id={r.t.assignee_id} size={18} />}</div>)}
        </div>
        <div className="hw-tl-grid" style={{ width: W, height: H }}>
          {scale.weekends.map((w, i) => <div key={"w" + i} className="hw-tl-we" style={{ left: w.x, width: w.w }} />)}
          {scale.cols.map((c, i) => <div key={"c" + i} className="hw-tl-col" style={{ left: c }} />)}
          {rows.map((r, i) => <div key={r.key} className={"hw-tl-rowbg" + (r.type === "group" ? " grp" : hover === r.t?.id ? " hi" : "")} style={{ top: i * ROW, cursor: r.type === "task" && !span(r.t) ? "crosshair" : "default" }} onMouseDown={(e) => gridDown(e, r)} onMouseEnter={() => r.t && setHover(r.t.id)} title={r.type === "task" && !span(r.t) ? "Drag to schedule" : undefined} />)}
          <div className="hw-tl-today" style={{ left: x(t0) + px / 2 }} />
          <svg width={W} height={H} style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 2 }}>
            <defs><marker id="hw-arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L8 4L0 8z" fill="context-stroke" /></marker></defs>
            {arrows.map((a) => <path key={a.id} d={a.path} fill="none" stroke={a.late ? "var(--coral)" : "var(--ink4)"} strokeWidth="1.5" markerEnd="url(#hw-arr)" />)}
            {link && (() => { const i = rowIndex.get(link.from); const sp = span(rows[i].t); return <path d={`M${x(sp.d) + px} ${i * ROW + ROW / 2} L${link.x} ${link.y}`} stroke="var(--accent)" strokeWidth="2" strokeDasharray="4 3" fill="none" />; })()}
          </svg>
          {rows.map((r, i) => {
            if (r.type !== "task") return null; const t = r.t, sp = span(t); if (!sp) return null; const kind = taskKind(t), done = isDone(t);
            const st = view.colorBy === "status" ? tone(STATUS[t.status]?.tone) : r.color ? { "--c": r.color, "--c-soft": `color-mix(in srgb, ${r.color} 16%, var(--surface))` } : tone(r.tone);
            if (kind === "milestone") return <div key={r.key} className={"hw-ms" + (done ? "" : " todo")} style={{ left: x(sp.d) + px / 2 - 8, top: i * ROW + 9 }} title={`${t.title} · ${fmtRange(null, sp.d)}`} onMouseDown={(e) => beginDrag(e, t, "move")} onMouseEnter={() => setHover(t.id)} />;
            const w = Math.max(px, (diffDays(sp.d, sp.s) + 1) * px) - 2; const inside = w > 110;
            return <div key={r.key} className={"hw-bar-t" + (done ? " done" : "") + (openId === t.id ? " open" : "") + (drag?.id === t.id ? " act" : "")} style={{ ...st, left: x(sp.s) + 1, top: i * ROW + 6, width: w }} onMouseDown={(e) => beginDrag(e, t, "move")} onMouseEnter={() => setHover(t.id)} title={`${t.title}\n${fmtRange(sp.s, sp.d)}${t.assignee_id ? " · " + personName(people[t.assignee_id]) : ""}`}>
              {done && <span className="fill" style={{ width: "100%" }} />}
              <span className="ez l" onMouseDown={(e) => beginDrag(e, t, "l")} /><span className="ez r" onMouseDown={(e) => beginDrag(e, t, "r")} />
              {inside ? <span className="in">{t.title}</span> : <span className="lbl">{t.title}</span>}
              <span className="dot" title="Drag onto a task that has to wait for this one" onMouseDown={(e) => beginLink(e, t)} />
            </div>;
          })}
          {ghost && <div className="hw-tl-ghost" style={{ left: ghost.a * px, width: (ghost.b - ghost.a + 1) * px, top: ghost.i * ROW + 6 }} />}
        </div>
      </div>
      {tip && <div className="hw-tl-tip" style={{ left: tip.x, top: tip.y }}>{tip.text}</div>}
    </div>
  );
}
