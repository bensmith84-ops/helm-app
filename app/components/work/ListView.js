"use client";
// The list: grouped, sortable, virtualised rows with inline editing, drag to
// reorder / regroup, multi-select and keyboard navigation.
import { memo, useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from "react";
import { Icon, Popover, usePop, MenuItem, MenuSep, MenuLabel, Check, Avatar, ColorPicker, Empty, PersonPicker, DatePicker } from "./ui";
import { AssigneeCell, DueCell, PriorityCell, StatusCell, SectionCell, LabelsCell, FieldCell, ApprovalChip, KindIcon } from "./cells";
import { BUILTIN_FIELDS, taskKind, isDone, fmtDate, personName, plural } from "./model";
import { tone } from "./theme";
import { moveToGroup, createInGroup } from "./ops";

export const LIST_CSS = `
.hw-list{position:relative;flex:1;min-height:0;overflow:auto;outline:none;background:var(--surface)}
.hw-lhead{position:sticky;top:0;z-index:5;display:grid;height:34px;background:var(--surface);border-bottom:1px solid var(--line);font-size:11.5px;font-weight:600;color:var(--ink3);letter-spacing:.02em}
.hw-lh{display:flex;align-items:center;gap:5px;padding:0 10px;position:relative;border-right:1px solid var(--line);cursor:pointer;user-select:none;min-width:0}
.hw-lh:hover{color:var(--ink);background:var(--raise)}
.hw-lh.first{padding-left:58px}
.hw-lh .rz{position:absolute;right:-4px;top:0;bottom:0;width:8px;cursor:col-resize;z-index:2}
.hw-lh .rz:hover::after,.hw-lh .rz.on::after{content:'';position:absolute;left:3px;top:6px;bottom:6px;width:2px;border-radius:2px;background:var(--accent)}
.hw-row{position:absolute;left:0;right:0;display:grid;align-items:center;height:36px;user-select:none;border-bottom:1px solid var(--line);background:var(--surface);cursor:pointer}
.hw-row:hover{background:var(--raise)}
.hw-row.sel{background:var(--accent-soft)}
.hw-row.cur{box-shadow:inset 2px 0 0 var(--accent)}
.hw-row.open{background:var(--accent-soft)}
.hw-row.drag{opacity:.35}
.hw-row>.c{height:100%;border-right:1px solid var(--line);min-width:0;display:flex;align-items:center;padding:2px}
.hw-row>.t{display:flex;align-items:center;gap:7px;height:100%;min-width:0;padding-right:6px;border-right:1px solid var(--line)}
.hw-grip{width:18px;height:24px;display:flex;align-items:center;justify-content:center;color:var(--ink4);cursor:grab;opacity:0;flex:none;margin-left:4px}
.hw-row:hover .hw-grip{opacity:1}
.hw-tw{width:18px;height:22px;display:flex;align-items:center;justify-content:center;border:none;background:transparent;color:var(--ink3);cursor:pointer;border-radius:5px;flex:none;padding:0;transition:transform .12s}
.hw-tw:hover{background:var(--hover);color:var(--ink)}
.hw-tw.open{transform:rotate(90deg)}
.hw-title{flex:0 1 auto;min-width:40px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:3px 5px;margin-left:-3px;border-radius:5px;border:1px solid transparent;cursor:text}
.hw-title:hover{border-color:var(--line2)}
.hw-title.done{color:var(--ink3)}
.hw-title-in{flex:1;min-width:60px;padding:3px 5px;margin-left:-3px;border-radius:5px;border:1px solid var(--accent);background:var(--surface);outline:none;box-shadow:0 0 0 3px var(--accent-soft)}
.hw-meta{display:inline-flex;align-items:center;gap:3px;font-size:11.5px;color:var(--ink3);flex:none;font-variant-numeric:tabular-nums}
.hw-open{margin-left:auto;display:inline-flex;align-items:center;gap:2px;font-size:11.5px;color:var(--ink3);opacity:0;flex:none;padding:2px 4px;border-radius:5px}
.hw-row:hover .hw-open{opacity:1}
.hw-open:hover{background:var(--hover);color:var(--ink)}
.hw-grow{position:absolute;left:0;right:0;height:44px;display:flex;align-items:flex-end;padding:0 10px 6px 8px;gap:6px;background:var(--surface);border-bottom:1px solid var(--line)}
.hw-grow .nm{font-weight:650;font-size:14px;letter-spacing:-.005em;padding:2px 5px;border-radius:5px;border:1px solid transparent;max-width:420px}
.hw-grow .nm.ed:hover{border-color:var(--line2);cursor:text}
.hw-grow .ct{font-size:12px;color:var(--ink3);font-variant-numeric:tabular-nums;padding-bottom:3px}
.hw-grow .act{opacity:0;display:flex;gap:2px;transition:opacity .1s}
.hw-grow:hover .act{opacity:1}
.hw-grow.over,.hw-add.over{background:var(--accent-soft)}
.hw-add{position:absolute;left:0;right:0;height:36px;display:flex;align-items:center;gap:8px;padding-left:58px;color:var(--ink3);border-bottom:1px solid var(--line);background:var(--surface);cursor:text}
.hw-add:hover{color:var(--ink2)}
.hw-add input{flex:1;max-width:560px}
.hw-dropline{position:absolute;left:30px;right:8px;height:2px;background:var(--accent);border-radius:2px;z-index:4;pointer-events:none}
.hw-dropline::before{content:'';position:absolute;left:-5px;top:-3px;width:8px;height:8px;border-radius:50%;border:2px solid var(--accent);background:var(--surface)}
.hw-bulk{position:absolute;left:50%;bottom:18px;transform:translateX(-50%);z-index:20;background:var(--ink);color:var(--paper);border-radius:12px;box-shadow:var(--sh3);display:flex;align-items:center;gap:2px;padding:5px 6px 5px 14px;font-size:13px;font-weight:500;animation:hw-rise .16s cubic-bezier(.2,.8,.2,1);white-space:nowrap}
.hw-bulk button{background:transparent;border:none;color:inherit;height:28px;padding:0 9px;border-radius:7px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;font-weight:500}
.hw-bulk button:hover{background:rgba(255,255,255,.14)}
.hw[data-mode=dark] .hw-bulk button:hover{background:rgba(0,0,0,.12)}
.hw-bulk .sep{width:1px;height:18px;background:currentColor;opacity:.2;margin:0 5px}
`;

const H = { group: 44, task: 36, add: 36 };
const keyOf = (t) => t._k || t.id;

const Row = memo(function Row({ t, depth, top, grid, cols, sel, cur, open, expanded, kids, dragging, people, assignOptions, sections, labels, labelIds, fields, cf, blockers, project, api, canDrag }) {
  const [editing, setEditing] = useState(false); const [draft, setDraft] = useState("");
  const kind = taskKind(t), done = isDone(t);
  const commit = () => { const v = draft.trim(); if (v && v !== t.title) api.update(t.id, { title: v }); setEditing(false); };
  const cell = (c) => {
    const ch = (patch) => api.update(t.id, patch);
    switch (c.key) {
      case "assignee": return <AssigneeCell task={t} people={people} options={assignOptions} onChange={ch} />;
      case "due": return <DueCell task={t} onChange={ch} showRecur />;
      case "priority": return <PriorityCell task={t} onChange={ch} />;
      case "status": return <StatusCell task={t} onChange={ch} />;
      case "section": return <SectionCell task={t} sections={sections} onChange={ch} />;
      case "labels": return <LabelsCell task={t} labels={labels} ids={labelIds} onToggle={api.toggleLabel} onCreate={api.createLabel} />;
      case "start": return <span className="hw-cell hw-num" style={{ cursor: "default" }}>{t.start_date ? fmtDate(String(t.start_date).slice(0, 10), { relative: false }) : ""}</span>;
      case "created": return <span className="hw-cell hw-num" style={{ cursor: "default" }}>{t.created_at ? fmtDate(String(t.created_at).slice(0, 10), { relative: false }) : ""}</span>;
      case "completed": return <span className="hw-cell hw-num" style={{ cursor: "default" }}>{t.completed_at ? fmtDate(String(t.completed_at).slice(0, 10), { relative: false }) : ""}</span>;
      case "hours": return <FieldCell field={{ field_type: "number" }} value={t.estimated_hours ?? ""} onChange={(v) => ch({ estimated_hours: v === "" ? null : Number(v) || 0 })} />;
      case "deps": return <span className="hw-cell" style={{ cursor: "default" }}>{blockers?.length ? <span className="hw-chip" style={tone(blockers.some((b) => !b.done) ? "amber" : "slate")}><Icon name="dep" size={12} /><span className="hw-trunc">{blockers.length === 1 ? blockers[0].title : plural(blockers.length, "task")}</span></span> : ""}</span>;
      case "project": return <span className="hw-cell" style={{ cursor: "default" }}>{project && <><span className="hw-dot" style={{ background: project.color }} /><span className="hw-trunc">{project.name}</span></>}</span>;
      default: { const f = c.key.startsWith("cf:") && fields.find((x) => x.id === c.key.slice(3)); return f ? <FieldCell field={f} value={cf?.[f.id]} onChange={(v) => api.setFieldValue(t.id, f.id, v)} /> : null; }
    }
  };
  return (
    <div className={"hw-row" + (sel ? " sel" : "") + (cur ? " cur" : "") + (open ? " open" : "") + (dragging ? " drag" : "")} style={{ top, gridTemplateColumns: grid }} data-row={keyOf(t)}
      onClick={(e) => api.click(t, e)} onContextMenu={(e) => api.menu(t, e)} onDragOver={(e) => api.dragOver(e, "task", t)} onDrop={(e) => api.drop(e)}>
      <div className="t" style={{ paddingLeft: depth * 26 }}>
        <span className="hw-grip" draggable={canDrag && depth === 0} onDragStart={(e) => api.dragStart(e, t)} onDragEnd={api.dragEnd} onClick={(e) => e.stopPropagation()} style={canDrag && depth === 0 ? undefined : { visibility: "hidden" }}><Icon name="grip" size={14} /></span>
        {kids > 0 || expanded ? <button className={"hw-tw" + (expanded ? " open" : "")} onClick={(e) => { e.stopPropagation(); api.expand(t); }} title={expanded ? "Hide subtasks" : "Show subtasks"}><Icon name="chevR" size={14} /></button> : <span style={{ width: 18, flex: "none" }} />}
        <Check done={done} kind={kind} onClick={() => api.complete(t)} />
        {editing ? <input className="hw-title-in" autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }} />
          : <span className={"hw-title" + (done ? " done" : "")} style={kind === "milestone" ? { fontWeight: 600 } : undefined} onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey) return; e.stopPropagation(); setDraft(t.title || ""); setEditing(true); api.open(t); }}>{t.title || <span style={{ color: "var(--ink4)" }}>Untitled task</span>}</span>}
        {kind !== "task" && !editing && (kind === "approval" ? <ApprovalChip task={t} /> : <KindIcon kind={kind} done={done} />)}
        {kids > 0 && !editing && <span className="hw-meta" title={plural(kids, "subtask")}>{kids}<Icon name="sub" size={12} /></span>}
        {t._link && <span className="hw-meta" title="Lives in another project"><Icon name="link" size={12} /></span>}
        {!editing && <span className="hw-open" onClick={(e) => { e.stopPropagation(); api.open(t); }}>Details<Icon name="chevR" size={12} /></span>}
      </div>
      {cols.map((c) => <div key={c.key} className="c" onClick={(e) => e.stopPropagation()}>{cell(c)}</div>)}
      <div />
    </div>
  );
});

function GroupRow({ g, top, count, collapsed, over, api, grouped, canEdit }) {
  const [editing, setEditing] = useState(false); const [draft, setDraft] = useState(""); const menu = usePop(); const colors = usePop();
  const isSec = g.field === "section_id" && g.section && canEdit;
  const color = g.color || (g.tone ? tone(g.tone)["--c"] : "var(--ink3)");
  return (
    <div className={"hw-grow" + (over ? " over" : "")} style={{ top }} onDragOver={(e) => api.dragOver(e, "group", g)} onDrop={(e) => api.drop(e)}>
      <button className={"hw-tw" + (collapsed ? "" : " open")} style={{ marginBottom: 2 }} onClick={() => api.collapse(g.key)}><Icon name="chevR" size={15} /></button>
      {g.person !== undefined ? <span style={{ paddingBottom: 2, display: "inline-flex" }}><Avatar id={g.person} person={api.people()[g.person]} size={20} /></span> : <span className="hw-dot" style={{ background: color, marginBottom: 8 }} />}
      {editing ? <input className="hw-title-in" style={{ flex: "0 1 320px", fontWeight: 650, fontSize: 14 }} autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => { if (draft.trim() && draft.trim() !== g.label) api.renameSection(g.section.id, draft.trim()); setEditing(false); }} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEditing(false); }} />
        : <span className={"nm hw-trunc" + (isSec ? " ed" : "")} onClick={() => { if (isSec) { setDraft(g.label); setEditing(true); } }}>{g.label || "Tasks"}</span>}
      <span className="ct">{count}</span>
      {g.section?.is_complete_column && <span className="hw-chip" style={{ ...tone("green"), marginBottom: 2 }}>Done column</span>}
      <span className="act" style={{ marginBottom: 1 }}>
        {grouped && g.field && <button className="hw-icb sm" title="Add task" onClick={() => api.focusAdd(g.key)}><Icon name="plus" size={15} /></button>}
        {isSec && <button className="hw-icb sm" onClick={menu.toggle}><Icon name="more" size={15} /></button>}
      </span>
      {menu.open && <Popover anchor={menu.anchor} onClose={menu.close} width={220}>
        <MenuItem icon="note" onClick={() => { menu.close(); setDraft(g.label); setEditing(true); }}>Rename section</MenuItem>
        <MenuItem icon="plus" onClick={() => { menu.close(); api.addSection(g.section.id); }}>Add section below</MenuItem>
        <MenuItem icon="check" sel={!!g.section.is_complete_column} onClick={() => { menu.close(); api.updateSection(g.section.id, { is_complete_column: !g.section.is_complete_column }); }}>Completes tasks moved here</MenuItem>
        <MenuItem icon={<span className="hw-dot" style={{ background: color }} />} onClick={(e) => colors.show(e.currentTarget)}>Colour</MenuItem>
        <MenuSep /><MenuItem icon="trash" danger onClick={() => { menu.close(); api.deleteSection(g.section, count); }}>Delete section</MenuItem>
      </Popover>}
      {colors.open && <Popover anchor={colors.anchor} onClose={colors.close}><ColorPicker value={g.section.color} onPick={(c) => { api.updateSection(g.section.id, { color: c }); colors.close(); menu.close(); }} /></Popover>}
    </div>
  );
}

function AddRow({ top, g, parent, over, focus, api, depth = 0 }) {
  const [v, setV] = useState(""); const ref = useRef(null);
  useEffect(() => { if (focus) ref.current?.focus(); }, [focus]);
  const submit = () => { const title = v.trim(); if (!title) return; setV(""); api.create(g, title, parent); };
  return <div className={"hw-add" + (over ? " over" : "")} style={{ top, paddingLeft: 58 + depth * 26 }} onClick={() => ref.current?.focus()} onDragOver={(e) => !parent && api.dragOver(e, "end", g)} onDrop={(e) => api.drop(e)}>
    <Icon name="plus" size={14} />
    <input ref={ref} className="hw-bare" placeholder={parent ? "Add subtask…" : "Add task…"} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") submit(); if (e.key === "Escape") { setV(""); e.currentTarget.blur(); } }} onBlur={submit} />
  </div>;
}

export default function ListView({ store, groups, view, onView, ctx, projectId, onOpen, openId, sel, setSel, canEdit = true, showProject, emptyHint }) {
  const { people, labels, labelsOfMap, fieldValues, childrenOf, blockedByMap, tasksById, projectsById } = store;
  const scroller = useRef(null); const [scrollTop, setScrollTop] = useState(0); const [vh, setVh] = useState(700);
  const [collapsed, setCollapsed] = useState(() => { try { return JSON.parse(localStorage.getItem("hw.collapsed." + view.id) || "{}"); } catch { return {}; } });
  const [expanded, setExpanded] = useState({}); const [cursor, setCursor] = useState(null); const [addFocus, setAddFocus] = useState(null);
  const [drag, setDrag] = useState(null); const [dropAt, setDropAt] = useState(null); const [menu, setMenu] = useState(null);
  const fieldsPop = usePop(); const [resizing, setResizing] = useState(null);
  const grouped = view.group && view.group !== "none"; const sorted = !!view.sort?.length;
  const cols = useMemo(() => (view.cols || []).filter((c) => BUILTIN_FIELDS[c.key] || (c.key.startsWith("cf:") && ctx.fields.some((f) => f.id === c.key.slice(3)))).filter((c) => !(c.key === "section" && view.group === "section")), [view.cols, ctx.fields, view.group]);
  const titleW = view.titleW || 440;
  const grid = `${titleW}px ${cols.map((c) => c.w + "px").join(" ")} minmax(44px,1fr)`;
  const minW = titleW + cols.reduce((s, c) => s + c.w, 0) + 44;
  const assignOptions = useMemo(() => store.assignable(projectId), [store.assignable, projectId]);

  useEffect(() => { try { localStorage.setItem("hw.collapsed." + view.id, JSON.stringify(collapsed)); } catch {} }, [collapsed, view.id]);
  useLayoutEffect(() => { const el = scroller.current; if (!el) return; const ro = new ResizeObserver(() => setVh(el.clientHeight)); ro.observe(el); setVh(el.clientHeight); return () => ro.disconnect(); }, []);

  // flat, positioned rows
  const { rows, total, taskRows } = useMemo(() => {
    const out = []; let y = 0; const tr = [];
    const push = (r, h) => { r.top = y; r.h = h; out.push(r); y += h; };
    for (const g of groups) {
      if (grouped) push({ type: "group", key: "g:" + g.key, g }, H.group);
      if (grouped && collapsed[g.key]) continue;
      for (const t of g.tasks) {
        const r = { type: "task", key: keyOf(t), t, g, depth: 0 }; push(r, H.task); tr.push(r);
        if (expanded[t.id]) { for (const c of childrenOf.get(t.id) || []) { const cr = { type: "task", key: keyOf(c), t: c, g, depth: 1 }; push(cr, H.task); tr.push(cr); } if (canEdit) push({ type: "subadd", key: "sa:" + t.id, parent: t, g }, H.add); }
      }
      if (canEdit && (g.field || !grouped) && projectId !== undefined) push({ type: "add", key: "a:" + g.key, g }, H.add);
    }
    return { rows: out, total: y, taskRows: tr };
  }, [groups, grouped, collapsed, expanded, childrenOf, canEdit, projectId]);

  const visible = useMemo(() => { const a = scrollTop - 400, b = scrollTop + vh + 400; return rows.filter((r) => r.top + r.h > a && r.top < b); }, [rows, scrollTop, vh]);
  const onScroll = useCallback((e) => { const v = e.currentTarget.scrollTop; requestAnimationFrame(() => setScrollTop(v)); }, []);
  const reveal = (r) => { const el = scroller.current; if (!el || !r) return; const top = r.top + 34; if (top < el.scrollTop + 34) el.scrollTop = r.top; else if (top + r.h > el.scrollTop + el.clientHeight) el.scrollTop = top + r.h - el.clientHeight + 8; };

  // stable callbacks for memoised rows
  const S = useRef({}); S.current = { store, groups, taskRows, sel, setSel, onOpen, cursor, drag, dropAt, sorted, view, onView, rows, projectId, expanded };
  const lastClick = useRef(null);
  const api = useMemo(() => ({
    people: () => S.current.store.people,
    update: (id, patch) => S.current.store.updateTask(id, patch),
    complete: (t) => S.current.store.completeTask(t),
    setFieldValue: (...a) => S.current.store.setFieldValue(...a), toggleLabel: (...a) => S.current.store.toggleLabel(...a), createLabel: (...a) => S.current.store.createLabel(...a),
    open: (t) => { S.current.setSel(new Set()); setCursor(keyOf(t)); S.current.onOpen(t); },
    click: (t, e) => {
      const { taskRows: tr, sel: cur, setSel: set } = S.current; const k = keyOf(t);
      if (e.metaKey || e.ctrlKey) { const n = new Set(cur); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); set(n); lastClick.current = k; setCursor(k); return; }
      if (e.shiftKey && lastClick.current) { const a = tr.findIndex((r) => r.key === lastClick.current), b = tr.findIndex((r) => r.key === k); if (a >= 0 && b >= 0) { const n = new Set(cur); tr.slice(Math.min(a, b), Math.max(a, b) + 1).forEach((r) => n.add(r.t.id)); set(n); setCursor(k); return; } }
      lastClick.current = k; api.open(t);
    },
    expand: (t) => { setExpanded((p) => ({ ...p, [t.id]: !p[t.id] })); S.current.store.loadSubtasks(t.id); },
    collapse: (k) => setCollapsed((p) => ({ ...p, [k]: !p[k] })),
    focusAdd: (k) => { setCollapsed((p) => ({ ...p, [k]: false })); setAddFocus({ k, n: Date.now() }); setTimeout(() => { const r = S.current.rows.find((x) => x.type === "add" && x.g.key === k); if (r) reveal(r); }, 30); },
    create: (g, title, parent) => { const { store: st, projectId: pid } = S.current; if (parent) return st.createTask({ project_id: parent.project_id, section_id: parent.section_id, parent_task_id: parent.id, title }); return st.createTask({ project_id: pid || null, title, ...(pid ? {} : { assignee_id: st.uid }), ...createInGroup(g) }); },
    menu: (t, e) => { e.preventDefault(); setMenu({ t, x: e.clientX, y: e.clientY }); },
    renameSection: (id, name) => S.current.store.updateSection(id, { name }), updateSection: (id, p) => S.current.store.updateSection(id, p),
    addSection: async (after) => { const s = await S.current.store.createSection(S.current.projectId, "Untitled section", after); if (s) api.focusAdd(s.id); },
    deleteSection: (sec, n) => { if (n && !window.confirm(`Delete "${sec.name}"? Its ${plural(n, "task")} will move to "No section".`)) return; S.current.store.deleteSection(sec.id, null); },
    dragStart: (e, t) => { const { sel: cur } = S.current; const ids = cur.has(t.id) ? [...cur] : [t.id]; try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", t.id); const row = e.currentTarget.closest(".hw-row"); if (row) e.dataTransfer.setDragImage(row, 24, 18); } catch {} setDrag({ ids }); },
    dragEnd: () => { setDrag(null); setDropAt(null); },
    dragOver: (e, kind, x) => {
      if (!S.current.drag) return; e.preventDefault();
      let next;
      if (kind === "task") { if (x.parent_task_id) return; const r = e.currentTarget.getBoundingClientRect(); next = { g: S.current.taskRows.find((q) => q.key === keyOf(x))?.g, id: x.id, pos: e.clientY < r.top + r.height / 2 ? "before" : "after" }; }
      else next = { g: x, id: null, pos: kind === "group" ? "start" : "end" };
      const d = S.current.dropAt; if (!d || d.g?.key !== next.g?.key || d.id !== next.id || d.pos !== next.pos) setDropAt(next);
    },
    drop: (e) => {
      e.preventDefault(); const { drag: dg, dropAt: at, store: st, sorted: so } = S.current; setDrag(null); setDropAt(null);
      if (!dg || !at?.g || (!at.g.field && S.current.view.group !== "none")) return;
      const moved = dg.ids.map((id) => at.g.tasks.find((t) => t.id === id) || S.current.taskRows.find((r) => r.t.id === id)?.t || st.tasksById.get(id)).filter(Boolean);
      const rest = at.g.tasks.filter((t) => !dg.ids.includes(t.id)).map((t) => t.id);
      let i = at.pos === "start" ? 0 : at.pos === "end" ? rest.length : rest.indexOf(at.id) + (at.pos === "after" ? 1 : 0); if (i < 0) i = rest.length;
      const ordered = [...rest.slice(0, i), ...moved.map((t) => t.id), ...rest.slice(i)];
      if (S.current.view.group === "none") st.placeTasks(moved.map((t) => t.id), {}, so ? [] : ordered); else moveToGroup(st, at.g, moved, ordered, so);
    },
  }), []);

  // keyboard
  const onKey = (e) => {
    if (e.target !== scroller.current) return;
    const tr = taskRows; const i = tr.findIndex((r) => r.key === cursor);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault(); const n = tr[Math.max(0, Math.min(tr.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))] || tr[0]; if (!n) return;
      setCursor(n.key); reveal(n);
      if (e.shiftKey) { const s = new Set(sel); if (tr[i]) s.add(tr[i].t.id); s.add(n.t.id); setSel(s); } else if (openId) onOpen(n.t);
    } else if (e.key === "Enter" && tr[i]) { e.preventDefault(); onOpen(tr[i].t); }
    else if (e.key === " " && tr[i]) { e.preventDefault(); store.completeTask(tr[i].t); }
    else if ((e.key === "Delete" || e.key === "Backspace") && (sel.size || tr[i])) { e.preventDefault(); store.deleteTasks(sel.size ? [...sel] : [tr[i].t.id]); setSel(new Set()); }
    else if (e.key === "a" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); setSel(new Set(tr.filter((r) => r.depth === 0).map((r) => r.t.id))); }
    else if (e.key === "Escape") setSel(new Set());
  };

  // column header interactions
  const sortBy = (key) => { const cur = view.sort?.[0]; onView({ sort: !cur || cur.key !== key ? [{ key, dir: "asc" }] : cur.dir === "asc" ? [{ key, dir: "desc" }] : [] }); };
  const startResize = (e, key) => {
    e.preventDefault(); e.stopPropagation(); const x0 = e.clientX; const w0 = key === "title" ? titleW : cols.find((c) => c.key === key).w; setResizing(key);
    const move = (ev) => { const w = Math.max(key === "title" ? 240 : 70, w0 + ev.clientX - x0); if (key === "title") onView({ titleW: w }); else onView({ cols: S.current.view.cols.map((c) => (c.key === key ? { ...c, w } : c)) }); };
    const up = () => { setResizing(null); window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };
  const toggleCol = (key, w) => onView({ cols: (view.cols || []).some((c) => c.key === key) ? view.cols.filter((c) => c.key !== key) : [...(view.cols || []), { key, w: w || 130 }] });
  const sortIcon = (key) => view.sort?.[0]?.key === key ? <Icon name="up" size={12} style={{ transform: view.sort[0].dir === "desc" ? "rotate(180deg)" : "none", color: "var(--accent)" }} /> : null;
  const label = (c) => BUILTIN_FIELDS[c.key]?.label || ctx.fields.find((f) => f.id === c.key.slice(3))?.name || c.key;

  const dropY = useMemo(() => {
    if (!dropAt || sorted) return null; const g = dropAt.g; if (!g) return null;
    if (dropAt.id) { const r = rows.find((x) => x.type === "task" && x.t.id === dropAt.id); return r ? r.top + (dropAt.pos === "after" ? r.h : 0) : null; }
    const first = rows.find((x) => x.g?.key === g.key && (dropAt.pos === "start" ? x.type === "task" : x.type === "add")); return first ? first.top : null;
  }, [dropAt, rows, sorted]);

  const empty = !taskRows.length && !groups.some((g) => g.section);
  return (
    <div className="hw-list hw-scroll" ref={scroller} tabIndex={0} onScroll={onScroll} onKeyDown={onKey}>
      <div className="hw-lhead" style={{ gridTemplateColumns: grid, minWidth: minW }}>
        <div className="hw-lh first" onClick={() => sortBy("title")}>Task name{sortIcon("title")}<span className={"rz" + (resizing === "title" ? " on" : "")} onMouseDown={(e) => startResize(e, "title")} onClick={(e) => e.stopPropagation()} /></div>
        {cols.map((c) => <div key={c.key} className="hw-lh" onClick={() => sortBy(c.key === "labels" || c.key === "deps" || c.key === "section" || c.key === "project" ? "title" : c.key)} onContextMenu={(e) => { e.preventDefault(); toggleCol(c.key); }} title="Click to sort · right-click to hide">
          <span className="hw-trunc">{label(c)}</span>{sortIcon(c.key)}<span className={"rz" + (resizing === c.key ? " on" : "")} onMouseDown={(e) => startResize(e, c.key)} onClick={(e) => e.stopPropagation()} /></div>)}
        <div className="hw-lh" style={{ borderRight: "none", justifyContent: "center", padding: 0 }} onClick={fieldsPop.toggle} title="Show or hide fields"><Icon name="plus" size={15} /></div>
      </div>
      <div style={{ position: "relative", height: total + 80, minWidth: minW }}>
        {visible.map((r) => r.type === "task"
          ? <Row key={r.key} t={r.t} depth={r.depth} top={r.top} grid={grid} cols={cols} sel={sel.has(r.t.id)} cur={cursor === r.key} open={openId === r.t.id} expanded={!!expanded[r.t.id]} kids={r.depth ? 0 : Math.max(r.t.subtask_count || 0, childrenOf.get(r.t.id)?.length || 0)} dragging={!!drag?.ids.includes(r.t.id)}
              people={people} assignOptions={assignOptions} sections={ctx.sections} labels={labels} labelIds={labelsOfMap.get(r.t.id) || NONE} fields={ctx.fields} cf={fieldValues[r.t.id]}
              blockers={cols.some((c) => c.key === "deps") ? (blockedByMap.get(r.t.id) || NONE).map((d) => { const b = tasksById.get(d.predecessor_id); return { title: b?.title || "another task", done: b ? isDone(b) : false }; }) : NONE}
              project={showProject ? projectsById[r.t.project_id] : null} api={api} canDrag={canEdit && (!grouped || !!r.g.field)} />
          : r.type === "group" ? <GroupRow key={r.key} g={r.g} top={r.top} count={r.g.tasks.length} collapsed={!!collapsed[r.g.key]} over={dropAt?.g?.key === r.g.key && (sorted || dropAt.pos === "start")} api={api} grouped={grouped} canEdit={canEdit} />
          : <AddRow key={r.key} top={r.top} g={r.g} parent={r.parent} depth={r.parent ? 1 : 0} over={!r.parent && dropAt?.g?.key === r.g.key && dropAt.pos === "end" && sorted} focus={!r.parent && addFocus?.k === r.g.key ? addFocus.n : 0} api={api} />)}
        {dropY != null && <div className="hw-dropline" style={{ top: dropY - 1 }} />}
        {canEdit && view.group === "section" && projectId && <button className="hw-btn ghost" style={{ position: "absolute", top: total + 12, left: 26 }} onClick={() => api.addSection(null)}><Icon name="plus" size={14} />Add section</button>}
        {empty && <div style={{ position: "absolute", top: total + 40, left: 0, right: 0 }}><Empty title="Nothing here yet" icon="list">{emptyHint || "Add a task above, or clear the filters to see everything."}</Empty></div>}
      </div>
      {fieldsPop.open && <Popover anchor={fieldsPop.anchor} onClose={fieldsPop.close} align="end" width={240}>
        <MenuLabel>Fields</MenuLabel>
        {Object.entries(BUILTIN_FIELDS).filter(([k]) => (k !== "project" || showProject) && !(k === "section" && !projectId)).map(([k, f]) => <MenuItem key={k} sel={(view.cols || []).some((c) => c.key === k)} onClick={() => toggleCol(k, f.w)}>{f.label}</MenuItem>)}
        {ctx.fields.length > 0 && <><MenuSep /><MenuLabel>Custom fields</MenuLabel>{ctx.fields.map((f) => <MenuItem key={f.id} sel={(view.cols || []).some((c) => c.key === "cf:" + f.id)} onClick={() => toggleCol("cf:" + f.id, 140)}>{f.name}</MenuItem>)}</>}
        {projectId && canEdit && <><MenuSep /><NewField onCreate={async (f) => { const made = await store.createField(projectId, f); if (made) toggleCol("cf:" + made.id, 140); }} /></>}
      </Popover>}
      {menu && <RowMenu store={store} t={menu.t} at={menu} onClose={() => setMenu(null)} onOpen={onOpen} />}
    </div>
  );
}
const NONE = [];

function NewField({ onCreate }) {
  const [open, setOpen] = useState(false); const [name, setName] = useState(""); const [type, setType] = useState("text"); const [opts, setOpts] = useState("");
  if (!open) return <MenuItem icon="plus" onClick={() => setOpen(true)}>New custom field</MenuItem>;
  return <div style={{ padding: 6, display: "flex", flexDirection: "column", gap: 6 }}>
    <input className="hw-input" autoFocus placeholder="Field name" value={name} onChange={(e) => setName(e.target.value)} />
    <select className="hw-input" value={type} onChange={(e) => setType(e.target.value)}>{[["text", "Text"], ["number", "Number"], ["currency", "Currency"], ["date", "Date"], ["select", "Dropdown"], ["checkbox", "Checkbox"]].map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
    {type === "select" && <input className="hw-input" placeholder="Options, comma separated" value={opts} onChange={(e) => setOpts(e.target.value)} />}
    <button className="hw-btn primary sm" disabled={!name.trim()} onClick={() => { onCreate({ name: name.trim(), field_type: type, options: type === "select" ? opts.split(",").map((s) => s.trim()).filter(Boolean) : [] }); setOpen(false); setName(""); }}>Add field</button>
  </div>;
}

export function RowMenu({ store, t, at, onClose, onOpen }) {
  const kind = taskKind(t); const meta = t.metadata || {};
  const setKind = (k) => { store.updateTask(t.id, { approval_status: k === "approval" ? "pending" : "none", metadata: { ...meta, is_milestone: k === "milestone", approval: undefined } }); onClose(); };
  return <Popover anchor={at} onClose={onClose} width={230}>
    <MenuItem icon="side" onClick={() => { onOpen(t); onClose(); }}>Open details</MenuItem>
    <MenuItem icon="check" onClick={() => { store.completeTask(t); onClose(); }}>{isDone(t) ? "Mark incomplete" : "Mark complete"}</MenuItem>
    <MenuItem icon="user" onClick={() => { store.updateTask(t.id, { assignee_id: store.uid }); onClose(); }}>Assign to me</MenuItem>
    <MenuItem icon="copy" onClick={() => { store.duplicateTask(t); onClose(); }}>Duplicate</MenuItem>
    <MenuItem icon="link" onClick={() => { navigator.clipboard?.writeText(window.location.origin + "/projects/t/" + t.id); onClose(); }}>Copy link</MenuItem>
    <MenuSep /><MenuLabel>Type</MenuLabel>
    <MenuItem icon="check" sel={kind === "task"} onClick={() => setKind("task")}>Task</MenuItem>
    <MenuItem icon="diamond" sel={kind === "milestone"} onClick={() => setKind("milestone")}>Milestone</MenuItem>
    <MenuItem icon="thumb" sel={kind === "approval"} onClick={() => setKind("approval")}>Approval</MenuItem>
    <MenuSep /><MenuItem icon="trash" danger onClick={() => { store.deleteTasks([t.id]); onClose(); }}>Delete</MenuItem>
  </Popover>;
}

// Floating bar shown while several tasks are selected.
export function BulkBar({ store, sel, setSel, projectId }) {
  const who = usePop(), when = usePop(), prio = usePop(), sec = usePop(); const ids = [...sel];
  if (!ids.length) return null;
  const done = () => setSel(new Set()); const sections = projectId ? store.sectionsOf.get(projectId) || [] : [];
  return <div className="hw-bulk">
    <span className="hw-num">{ids.length} selected</span><span className="sep" />
    <button onClick={() => { ids.forEach((id) => { const t = store.tasksById.get(id); if (t && !isDone(t)) store.completeTask(t, true); }); done(); }}><Icon name="check" size={15} />Complete</button>
    <button onClick={who.toggle}><Icon name="user" size={15} />Assign</button>
    <button onClick={when.toggle}><Icon name="cal" size={15} />Due date</button>
    <button onClick={prio.toggle}><Icon name="flag" size={15} />Priority</button>
    {sections.length > 0 && <button onClick={sec.toggle}><Icon name="arrowR" size={15} />Move</button>}
    <button onClick={() => { store.deleteTasks(ids); done(); }}><Icon name="trash" size={15} />Delete</button>
    <span className="sep" /><button onClick={done} title="Clear selection"><Icon name="x" size={15} /></button>
    {who.open && <Popover anchor={who.anchor} onClose={who.close} width={260}><PersonList store={store} projectId={projectId} onPick={(v) => { store.updateTasks(ids, { assignee_id: v }); who.close(); }} /></Popover>}
    {when.open && <Popover anchor={when.anchor} onClose={when.close}><DatePickerLite onPick={(d) => { store.updateTasks(ids, d); when.close(); }} /></Popover>}
    {prio.open && <Popover anchor={prio.anchor} onClose={prio.close} width={180}>{["urgent", "high", "medium", "low", "none"].map((p) => <MenuItem key={p} onClick={() => { store.updateTasks(ids, { priority: p }); prio.close(); }}>{p === "none" ? "No priority" : p[0].toUpperCase() + p.slice(1)}</MenuItem>)}</Popover>}
    {sec.open && <Popover anchor={sec.anchor} onClose={sec.close} width={230}>{sections.map((s) => <MenuItem key={s.id} onClick={() => { store.updateTasks(ids, { section_id: s.id }); sec.close(); }}>{s.name}</MenuItem>)}</Popover>}
  </div>;
}
const PersonList = ({ store, projectId, onPick }) => <PersonPicker people={store.assignable(projectId)} value={undefined} onPick={onPick} />;
const DatePickerLite = ({ onPick }) => <DatePicker range={false} due={null} onChange={(d) => onPick({ due_date: d.due_date })} />;
