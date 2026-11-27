"use client";
// Board: one column per group (sections by default). Cards drag between and within columns.
import { memo, useState, useRef, useMemo } from "react";
import { Icon, Popover, usePop, MenuItem, MenuSep, Check, Avatar, Chip, Empty } from "./ui";
import { AssigneeCell, DueCell, ApprovalChip, KindIcon } from "./cells";
import { PRIORITY, taskKind, isDone, plural } from "./model";
import { tone } from "./theme";
import { moveToGroup, createInGroup } from "./ops";
import { RowMenu } from "./ListView";

export const BOARD_CSS = `
.hw-board{flex:1;min-height:0;display:flex;gap:12px;overflow-x:auto;overflow-y:hidden;padding:14px 18px 10px;align-items:stretch;background:var(--paper)}
.hw-col{width:292px;flex:none;display:flex;flex-direction:column;min-height:0;border-radius:12px;background:var(--sunken);transition:box-shadow .12s}
.hw-col.over{box-shadow:inset 0 0 0 2px var(--accent)}
.hw-col-h{display:flex;align-items:center;gap:7px;padding:10px 8px 8px 12px;cursor:grab}
.hw-col-h b{font-weight:650;font-size:13.5px}
.hw-col-h .ct{font-size:12px;color:var(--ink3);font-variant-numeric:tabular-nums}
.hw-col-b{flex:1;min-height:40px;overflow-y:auto;padding:2px 8px 8px;display:flex;flex-direction:column;gap:7px}
.hw-card{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:10px 10px 8px 10px;cursor:pointer;box-shadow:var(--sh1);transition:box-shadow .12s,border-color .12s,transform .12s;position:relative}
.hw-card:hover{border-color:var(--line2);box-shadow:var(--sh2)}
.hw-card.open{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.hw-card.drag{opacity:.3}
.hw-card.sel{border-color:var(--accent);background:var(--accent-soft)}
.hw-card .ttl{display:flex;gap:8px;align-items:flex-start;line-height:1.35;font-weight:500}
.hw-card .ttl.done{color:var(--ink3)}
.hw-card .ft{display:flex;align-items:center;gap:6px;margin-top:8px;min-height:24px;color:var(--ink3);font-size:12px}
.hw-card .ft .hw-cell{width:auto;padding:0 4px;height:24px;font-size:12px}
.hw-card-gap{height:3px;border-radius:3px;background:var(--accent);margin:-2px 2px}
.hw-col-add{display:flex;align-items:center;gap:7px;margin:0 8px 8px;padding:7px 9px;border-radius:9px;color:var(--ink3);cursor:pointer;border:none;background:transparent;text-align:left}
.hw-col-add:hover{background:var(--hover);color:var(--ink)}
.hw-card-new{background:var(--surface);border:1px solid var(--accent);border-radius:10px;padding:9px 10px;box-shadow:0 0 0 3px var(--accent-soft)}
.hw-card-new textarea{resize:none;line-height:1.35;font-weight:500}
`;

const Card = memo(function Card({ t, open, sel, dragging, people, assignOptions, labels, kids, api }) {
  const kind = taskKind(t), done = isDone(t); const pr = PRIORITY[t.priority || "none"];
  return (
    <div className={"hw-card" + (open ? " open" : "") + (sel ? " sel" : "") + (dragging ? " drag" : "")} draggable onDragStart={(e) => api.dragStart(e, t)} onDragEnd={api.dragEnd} onDragOver={(e) => api.overCard(e, t)}
      onClick={(e) => api.click(t, e)} onContextMenu={(e) => api.menu(t, e)}>
      {labels.length > 0 && <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 7 }}>{labels.slice(0, 4).map((l) => <span key={l.id} className="hw-chip" style={{ height: 18, fontSize: 10.5, "--c": l.color, "--c-soft": `color-mix(in srgb, ${l.color} 16%, transparent)` }}>{l.name}</span>)}</div>}
      <div className={"ttl" + (done ? " done" : "")}><span style={{ paddingTop: 1 }}><Check done={done} kind={kind} size={17} onClick={() => api.complete(t)} /></span><span style={{ flex: 1, minWidth: 0, overflowWrap: "anywhere" }}>{t.title || "Untitled task"}</span></div>
      <div className="ft" onClick={(e) => e.stopPropagation()}>
        {kind === "approval" ? <ApprovalChip task={t} /> : kind === "milestone" ? <KindIcon kind={kind} done={done} /> : null}
        {t.priority && t.priority !== "none" && t.priority !== "medium" && <Chip t={pr.tone}>{pr.label}</Chip>}
        <DueCell task={t} onChange={(p) => api.update(t.id, p)} />
        {kids > 0 && <span className="hw-meta" style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>{kids}<Icon name="sub" size={12} /></span>}
        <span style={{ marginLeft: "auto" }}><AssigneeCell task={t} people={people} options={assignOptions} onChange={(p) => api.update(t.id, p)} iconOnly /></span>
      </div>
    </div>
  );
});

function NewCard({ onSubmit, onClose }) {
  const [v, setV] = useState("");
  const go = (keep) => { const t = v.trim(); if (t) onSubmit(t); setV(""); if (!keep || !t) onClose(); };
  return <div className="hw-card-new"><textarea className="hw-bare" rows={2} autoFocus placeholder="Write a task name" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => go(false)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); go(true); } if (e.key === "Escape") { setV(""); onClose(); } }} /></div>;
}

function Column({ g, children, count, over, canEdit, api, adding, setAdding, hasMore, onMore }) {
  const menu = usePop(); const [editing, setEditing] = useState(false); const [draft, setDraft] = useState("");
  const isSec = g.field === "section_id" && g.section && canEdit; const color = g.color || (g.tone ? tone(g.tone)["--c"] : "var(--ink3)");
  return (
    <div className={"hw-col" + (over ? " over" : "")} onDragOver={(e) => api.overCol(e, g)} onDrop={(e) => api.drop(e)}>
      <div className="hw-col-h" draggable={!!isSec} onDragStart={(e) => api.colDragStart(e, g)} onDragEnd={api.dragEnd}>
        {g.person !== undefined ? <Avatar id={g.person} person={api.people()[g.person]} size={20} /> : <span className="hw-dot" style={{ background: color }} />}
        {editing ? <input className="hw-title-in" autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => { if (draft.trim() && draft.trim() !== g.label) api.updateSection(g.section.id, { name: draft.trim() }); setEditing(false); }} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setEditing(false); }} />
          : <b className="hw-trunc" onDoubleClick={() => { if (isSec) { setDraft(g.label); setEditing(true); } }}>{g.label || "Tasks"}</b>}
        <span className="ct">{count}</span>
        {g.section?.wip_limit ? <span className="hw-chip" style={tone(count > g.section.wip_limit ? "coral" : "slate")}>max {g.section.wip_limit}</span> : null}
        <span style={{ flex: 1 }} />
        {canEdit && g.field && <button className="hw-icb sm" title="Add task" onClick={() => setAdding("top")}><Icon name="plus" size={15} /></button>}
        {isSec && <button className="hw-icb sm" onClick={menu.toggle}><Icon name="more" size={15} /></button>}
      </div>
      <div className="hw-col-b hw-scroll">
        {adding === "top" && <NewCard onSubmit={(title) => api.create(g, title, true)} onClose={() => setAdding(null)} />}
        {children}
        {hasMore > 0 && <button className="hw-btn ghost sm" onClick={onMore}>Show {hasMore} more</button>}
        {adding === "bottom" && <NewCard onSubmit={(title) => api.create(g, title, false)} onClose={() => setAdding(null)} />}
      </div>
      {canEdit && g.field && adding !== "bottom" && <button className="hw-col-add" onClick={() => setAdding("bottom")}><Icon name="plus" size={14} />Add task</button>}
      {menu.open && <Popover anchor={menu.anchor} onClose={menu.close} width={230}>
        <MenuItem icon="note" onClick={() => { menu.close(); setDraft(g.label); setEditing(true); }}>Rename</MenuItem>
        <MenuItem icon="check" sel={!!g.section.is_complete_column} onClick={() => { menu.close(); api.updateSection(g.section.id, { is_complete_column: !g.section.is_complete_column }); }}>Completes tasks moved here</MenuItem>
        <MenuItem icon="alert" onClick={() => { menu.close(); const v = window.prompt("Most tasks allowed in this column (blank for no limit)", g.section.wip_limit || ""); if (v !== null) api.updateSection(g.section.id, { wip_limit: v.trim() ? Math.max(1, parseInt(v, 10) || 0) || null : null }); }}>Set a limit</MenuItem>
        <MenuSep /><MenuItem icon="trash" danger onClick={() => { menu.close(); if (!count || window.confirm(`Delete "${g.label}"? Its ${plural(count, "task")} will move to "No section".`)) api.deleteSection(g.section.id); }}>Delete section</MenuItem>
      </Popover>}
    </div>
  );
}

export default function BoardView({ store, groups, view, ctx, projectId, onOpen, openId, sel, setSel, canEdit = true }) {
  const { people, labels, labelsOfMap, childrenOf } = store;
  const [drag, setDrag] = useState(null); const [dropAt, setDropAt] = useState(null); const [adding, setAdding] = useState({}); const [menu, setMenu] = useState(null); const [limit, setLimit] = useState({}); const [newSec, setNewSec] = useState(null);
  const sorted = !!view.sort?.length; const assignOptions = useMemo(() => store.assignable(projectId), [store.assignable, projectId]);
  const S = useRef({}); S.current = { store, groups, drag, dropAt, sorted, sel, setSel, onOpen, projectId };
  const api = useMemo(() => ({
    people: () => S.current.store.people,
    update: (id, p) => S.current.store.updateTask(id, p), complete: (t) => S.current.store.completeTask(t),
    click: (t, e) => { const { sel: cur, setSel: set } = S.current; if (e.metaKey || e.ctrlKey || e.shiftKey) { const n = new Set(cur); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); set(n); return; } set(new Set()); S.current.onOpen(t); },
    menu: (t, e) => { e.preventDefault(); setMenu({ t, x: e.clientX, y: e.clientY }); },
    create: (g, title, top) => S.current.store.createTask({ project_id: S.current.projectId || null, title, ...(S.current.projectId ? {} : { assignee_id: S.current.store.uid }), ...createInGroup(g) }, { top }),
    updateSection: (id, p) => S.current.store.updateSection(id, p), deleteSection: (id) => S.current.store.deleteSection(id, null),
    dragStart: (e, t) => { e.stopPropagation(); const cur = S.current.sel; try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", t.id); } catch {} setDrag({ ids: cur.has(t.id) ? [...cur] : [t.id] }); },
    colDragStart: (e, g) => { try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", g.key); } catch {} setDrag({ col: g.key }); },
    dragEnd: () => { setDrag(null); setDropAt(null); },
    overCard: (e, t) => { const d = S.current.drag; if (!d || d.col) return; e.preventDefault(); e.stopPropagation(); const g = S.current.groups.find((x) => x.tasks.some((y) => y.id === t.id)); const r = e.currentTarget.getBoundingClientRect(); const next = { g, id: t.id, pos: e.clientY < r.top + r.height / 2 ? "before" : "after" }; const c = S.current.dropAt; if (!c || c.g?.key !== g?.key || c.id !== next.id || c.pos !== next.pos) setDropAt(next); },
    overCol: (e, g) => { const d = S.current.drag; if (!d) return; e.preventDefault(); const c = S.current.dropAt; if (!c || c.g?.key !== g.key || c.id) setDropAt({ g, id: null, pos: "end" }); },
    drop: (e) => {
      e.preventDefault(); const { drag: d, dropAt: at, store: st, groups: gs, sorted: so } = S.current; setDrag(null); setDropAt(null); if (!d || !at?.g) return;
      if (d.col) { const ids = gs.filter((g) => g.section).map((g) => g.section.id); const from = ids.indexOf(d.col), to = ids.indexOf(at.g.key); if (from < 0 || to < 0 || from === to) return; ids.splice(to, 0, ids.splice(from, 1)[0]); st.reorderSections(S.current.projectId, ids); return; }
      if (!at.g.field) return;
      const moved = d.ids.map((id) => gs.flatMap((g) => g.tasks).find((t) => t.id === id) || st.tasksById.get(id)).filter(Boolean);
      const rest = at.g.tasks.filter((t) => !d.ids.includes(t.id)).map((t) => t.id);
      let i = at.id ? rest.indexOf(at.id) + (at.pos === "after" ? 1 : 0) : rest.length; if (i < 0) i = rest.length;
      moveToGroup(st, at.g, moved, [...rest.slice(0, i), ...moved.map((t) => t.id), ...rest.slice(i)], so);
    },
  }), []);
  if (view.group === "none" || !groups.length) return <div className="hw-board"><Empty title="Pick how to group the board" icon="board">Use Group in the toolbar to lay tasks out by section, assignee, status or priority.</Empty></div>;
  return (
    <div className="hw-board hw-scroll">
      {groups.map((g) => {
        const max = limit[g.key] || 60; const shown = g.tasks.slice(0, max);
        return <Column key={g.key} g={g} count={g.tasks.length} over={drag && !drag.col && dropAt?.g?.key === g.key && (!dropAt.id || sorted) || (drag?.col && dropAt?.g?.key === g.key && drag.col !== g.key)} canEdit={canEdit} api={api} adding={adding[g.key]} setAdding={(v) => setAdding((p) => ({ ...p, [g.key]: v }))} hasMore={g.tasks.length - shown.length} onMore={() => setLimit((p) => ({ ...p, [g.key]: max + 100 }))}>
          {shown.map((t) => { const gap = !sorted && drag && !drag.col && dropAt?.id === t.id && dropAt.g?.key === g.key; return <div key={t._k || t.id} style={{ display: "contents" }}>
            {gap && dropAt.pos === "before" && <div className="hw-card-gap" />}
            <Card t={t} open={openId === t.id} sel={sel.has(t.id)} dragging={!!drag?.ids?.includes(t.id)} people={people} assignOptions={assignOptions} labels={(labelsOfMap.get(t.id) || NONE).map((id) => labels.find((l) => l.id === id)).filter(Boolean)} kids={Math.max(t.subtask_count || 0, childrenOf.get(t.id)?.length || 0)} api={api} />
            {gap && dropAt.pos === "after" && <div className="hw-card-gap" />}
          </div>; })}
        </Column>;
      })}
      {canEdit && view.group === "section" && projectId && (newSec !== null
        ? <div className="hw-col" style={{ padding: 10, height: "fit-content" }}><input className="hw-input" autoFocus placeholder="Section name" value={newSec} onChange={(e) => setNewSec(e.target.value)} onBlur={() => { if (newSec.trim()) store.createSection(projectId, newSec.trim()); setNewSec(null); }} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setNewSec(null); }} /></div>
        : <button className="hw-btn ghost" style={{ flex: "none", height: 38 }} onClick={() => setNewSec("")}><Icon name="plus" size={14} />Add section</button>)}
      {menu && <RowMenu store={store} t={menu.t} at={menu} onClose={() => setMenu(null)} onOpen={onOpen} />}
    </div>
  );
}
const NONE = [];
