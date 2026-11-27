"use client";
// The toolbar above every task view: completion scope, filter, sort, group, search, and saving the view.
import { useState } from "react";
import { Icon, Popover, usePop, MenuItem, MenuSep, MenuLabel, OptionList, PersonPicker, Seg } from "./ui";
import { GROUP_OPTIONS, SORT_OPTIONS, STATUS, STATUS_ORDER, PRIORITY, PRIORITY_ORDER, filterCount, emptyFilters, personName } from "./model";
import { tone } from "./theme";

export const BAR_CSS = `
.hw-bar{display:flex;align-items:center;gap:6px;padding:8px 18px;border-bottom:1px solid var(--line);background:var(--surface);flex:none;min-height:47px;flex-wrap:wrap}
.hw-bar .sp{flex:1}
.hw-search{display:flex;align-items:center;gap:7px;height:30px;padding:0 9px;border-radius:7px;border:1px solid transparent;color:var(--ink3);width:150px;transition:width .15s,border-color .12s,background .12s}
.hw-search:hover{background:var(--hover)}
.hw-search:focus-within{width:220px;border-color:var(--accent);background:var(--surface);box-shadow:0 0 0 3px var(--accent-soft)}
.hw-fsec{padding:8px 10px 10px;border-bottom:1px solid var(--line)}
.hw-fsec:last-child{border-bottom:none}
.hw-fsec>b{display:block;font-size:11px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--ink3);margin-bottom:7px}
.hw-fopts{display:flex;flex-wrap:wrap;gap:5px}
.hw-fopt{height:26px;padding:0 10px;border-radius:13px;border:1px solid var(--line2);background:transparent;cursor:pointer;font-size:12.5px;color:var(--ink2);display:inline-flex;align-items:center;gap:6px}
.hw-fopt:hover{border-color:var(--ink4)}
.hw-fopt.on{background:var(--accent-soft);border-color:transparent;color:var(--accent-ink);font-weight:550}
`;

const toggle = (arr, v) => (arr || []).includes(v) ? arr.filter((x) => x !== v) : [...(arr || []), v];

export default function ViewBar({ store, view, onView, ctx, projectId, q, setQ, dirty, onSave, onReset, onAdd, extra, groupOptions = GROUP_OPTIONS, canEdit = true, count }) {
  const fpop = usePop(), spop = usePop(), gpop = usePop(), ppl = usePop();
  const f = view.filters || emptyFilters(); const setF = (patch) => onView({ filters: { ...f, ...patch } });
  const n = filterCount(f); const sort = view.sort?.[0];
  const cfGroups = (ctx?.fields || []).filter((x) => ["select", "dropdown", "single_select"].includes(x.field_type)).map((x) => ["cf:" + x.id, x.name]);
  const people = store.assignable(projectId);
  const opt = (on, label, onClick, dot) => <button key={label} className={"hw-fopt" + (on ? " on" : "")} onClick={onClick}>{dot && <span className="hw-dot" style={dot} />}{label}</button>;
  return (
    <div className="hw-bar">
      {onAdd && canEdit && <button className="hw-btn primary" onClick={onAdd}><Icon name="plus" size={15} sw={2.2} />Add task</button>}
      <Seg value={f.show || "incomplete"} options={[["incomplete", "Incomplete"], ["done", "Completed"], ["all", "All"]]} onChange={(v) => setF({ show: v })} />
      <button className={"hw-btn ghost" + (n ? " on" : "")} onClick={fpop.toggle}><Icon name="filter" size={15} />Filter{n > 0 && <span className="cnt">{n}</span>}</button>
      <button className={"hw-btn ghost" + (sort ? " on" : "")} onClick={spop.toggle}><Icon name="sort" size={15} />{sort ? "Sort: " + (SORT_OPTIONS.find((o) => o[0] === sort.key)?.[1] || "Custom") : "Sort"}</button>
      {view.type !== "calendar" && <button className={"hw-btn ghost" + (view.group && view.group !== "section" && view.group !== "none" ? " on" : "")} onClick={gpop.toggle}><Icon name="group" size={15} />Group{view.group && view.group !== "none" ? ": " + ([...groupOptions, ...cfGroups].find((o) => o[0] === view.group)?.[1] || "") : ""}</button>}
      {extra}
      <span className="sp" />
      {count != null && <span className="hw-num" style={{ fontSize: 12, color: "var(--ink3)" }}>{count} {count === 1 ? "task" : "tasks"}</span>}
      <label className="hw-search"><Icon name="search" size={15} /><input className="hw-bare" data-hw-search placeholder="Search this view" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Escape") { setQ(""); e.currentTarget.blur(); } }} /></label>
      {dirty && onSave && <><button className="hw-btn ghost sm" onClick={onReset} title="Go back to the saved view">Reset</button><button className="hw-btn sm" onClick={onSave} title="Save this layout, filter and sort for everyone on the project">Save view</button></>}

      {fpop.open && <Popover anchor={fpop.anchor} onClose={fpop.close} width={380} style={{ padding: 0 }}>
        <div className="hw-fsec"><b>Quick filters</b><div className="hw-fopts">
          {opt(f.assignees?.length === 1 && f.assignees[0] === store.uid, "Just my tasks", () => setF({ assignees: f.assignees?.[0] === store.uid && f.assignees.length === 1 ? [] : [store.uid] }))}
          {opt(f.due === "overdue", "Overdue", () => setF({ due: f.due === "overdue" ? "" : "overdue" }))}
          {opt(f.due === "week", "Due this week", () => setF({ due: f.due === "week" ? "" : "week" }))}
          {opt(f.due === "today", "Due today", () => setF({ due: f.due === "today" ? "" : "today" }))}
          {opt(f.due === "none", "No due date", () => setF({ due: f.due === "none" ? "" : "none" }))}
        </div></div>
        <div className="hw-fsec"><b>Assignee</b><div className="hw-fopts">
          {(f.assignees || []).map((id) => opt(true, id === "none" ? "Unassigned" : personName(store.people[id]) || "Someone", () => setF({ assignees: toggle(f.assignees, id) })))}
          <button className="hw-fopt" onClick={ppl.toggle}><Icon name="plus" size={13} />Person</button>
        </div></div>
        <div className="hw-fsec"><b>Priority</b><div className="hw-fopts">{PRIORITY_ORDER.map((k) => opt((f.priorities || []).includes(k), PRIORITY[k].label, () => setF({ priorities: toggle(f.priorities, k) }), tone(PRIORITY[k].tone) && { background: tone(PRIORITY[k].tone)["--c"] }))}</div></div>
        <div className="hw-fsec"><b>Status</b><div className="hw-fopts">{STATUS_ORDER.map((k) => opt((f.statuses || []).includes(k), STATUS[k].label, () => setF({ statuses: toggle(f.statuses, k) }), { background: tone(STATUS[k].tone)["--c"] }))}</div></div>
        <div className="hw-fsec"><b>Type</b><div className="hw-fopts">{[["task", "Tasks"], ["milestone", "Milestones"], ["approval", "Approvals"]].map(([k, l]) => opt((f.kinds || []).includes(k), l, () => setF({ kinds: toggle(f.kinds, k) })))}</div></div>
        {store.labels.length > 0 && <div className="hw-fsec"><b>Labels</b><div className="hw-fopts">{store.labels.slice(0, 24).map((l) => opt((f.labels || []).includes(l.id), l.name, () => setF({ labels: toggle(f.labels, l.id) }), { background: l.color }))}</div></div>}
        {n > 0 && <div className="hw-fsec"><button className="hw-btn ghost sm" onClick={() => onView({ filters: { ...emptyFilters(), show: "incomplete" } })}>Clear all filters</button></div>}
      </Popover>}
      {ppl.open && <Popover anchor={ppl.anchor} onClose={ppl.close} width={260}><PersonPicker people={people} multi value={(f.assignees || []).map((x) => (x === "none" ? null : x))} noneLabel="Unassigned" onPick={(v) => setF({ assignees: toggle(f.assignees, v || "none") })} /></Popover>}
      {spop.open && <Popover anchor={spop.anchor} onClose={spop.close} width={230}>
        <MenuLabel>Sort by</MenuLabel>
        <MenuItem sel={!sort} onClick={() => { onView({ sort: [] }); spop.close(); }}>Manual order</MenuItem>
        {SORT_OPTIONS.map(([k, l]) => <MenuItem key={k} sel={sort?.key === k} onClick={() => onView({ sort: [{ key: k, dir: sort?.key === k && sort.dir === "asc" ? "desc" : "asc" }] })} right={sort?.key === k ? <span className="k">{sort.dir === "asc" ? "A → Z" : "Z → A"}</span> : null}>{l}</MenuItem>)}
      </Popover>}
      {gpop.open && <Popover anchor={gpop.anchor} onClose={gpop.close} width={220}>
        <MenuLabel>Group by</MenuLabel>
        {[...groupOptions, ...cfGroups].map(([k, l]) => <MenuItem key={k} sel={(view.group || "none") === k} onClick={() => { onView({ group: k }); gpop.close(); }}>{l}</MenuItem>)}
      </Popover>}
    </div>
  );
}
