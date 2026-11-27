"use client";
// Field editors shared by the list, the board and the task pane. Each is a quiet
// button that opens the right picker; `bare` drops the hover frame for dense rows.
import { memo, useState } from "react";
import { Icon, Popover, usePop, OptionList, PersonPicker, DatePicker, Avatar, Chip, MenuItem, MenuSep, ColorPicker } from "./ui";
import { STATUS, STATUS_ORDER, PRIORITY, PRIORITY_ORDER, APPROVAL, RECURRENCE, personName, fmtRange, fmtDate, dueTone, cfOptions, approvalState, isDone } from "./model";
import { tone } from "./theme";

export const CELL_CSS = `
.hw-cell{display:flex;align-items:center;gap:7px;height:100%;width:100%;padding:0 8px;border:none;background:transparent;cursor:pointer;text-align:left;border-radius:6px;min-width:0;color:var(--ink2);font-size:13px}
.hw-cell:hover{background:var(--hover)}
.hw-cell.ph{color:var(--ink4)}
.hw-cell.boxed{height:30px;border:1px solid transparent;padding:0 8px;margin-left:-8px;width:auto;max-width:100%}
.hw-cell.boxed:hover{border-color:var(--line2);background:transparent}
.hw-cell .ph-ic{opacity:0;transition:opacity .1s}
.hw-row:hover .hw-cell .ph-ic,.hw-cell.boxed .ph-ic,.hw-card:hover .ph-ic{opacity:1}
.hw-due-coral{color:var(--coral)}.hw-due-green{color:var(--green)}.hw-due-ink3{color:var(--ink3)}.hw-due-ink2{color:var(--ink2)}
`;

export const AssigneeCell = memo(function AssigneeCell({ task, people, options, onChange, boxed, iconOnly }) {
  const pop = usePop(); const p = task.assignee_id ? people[task.assignee_id] : null;
  return (<>
    <button className={"hw-cell" + (boxed ? " boxed" : "") + (!p ? " ph" : "")} style={iconOnly ? { padding: 0, width: "auto" } : undefined} onClick={pop.toggle} title={p ? personName(p) : "Assign"}>
      {p || task.assignee_id ? <Avatar person={p} id={task.assignee_id} size={22} /> : <span className={boxed || iconOnly ? "" : "ph-ic"} style={{ display: "inline-flex" }}><Avatar size={22} /></span>}
      {!iconOnly && <span className="hw-trunc">{p ? personName(p) : boxed ? "No assignee" : ""}</span>}
    </button>
    {pop.open && <Popover anchor={pop.anchor} onClose={pop.close} width={260}><PersonPicker people={options} value={task.assignee_id || null} onPick={(v) => { onChange({ assignee_id: v }); pop.close(); }} /></Popover>}
  </>);
});

export const DueCell = memo(function DueCell({ task, onChange, boxed, showRecur }) {
  const pop = usePop(); const has = task.due_date || task.start_date; const s = task.start_date && String(task.start_date).slice(0, 10), d = task.due_date && String(task.due_date).slice(0, 10);
  return (<>
    <button className={"hw-cell hw-num" + (boxed ? " boxed" : "") + (!has ? " ph" : " hw-due-" + dueTone(task))} onClick={pop.toggle} title="Set dates">
      {has ? <><span className="hw-trunc">{fmtRange(s, d)}</span>{task.recurrence && task.recurrence !== "none" && <Icon name="repeat" size={12} />}</> : <><span className={boxed ? "" : "ph-ic"} style={{ display: "inline-flex" }}><Icon name="cal" size={15} /></span>{boxed && "No due date"}</>}
    </button>
    {pop.open && <Popover anchor={pop.anchor} onClose={pop.close}>
      <DatePicker start={s || null} due={d || null} onChange={onChange} onClose={pop.close} extra={showRecur && <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 8, marginTop: 8, borderTop: "1px solid var(--line)", fontSize: 12.5, color: "var(--ink2)" }}>
        <Icon name="repeat" size={14} /><select className="hw-input" style={{ height: 26, flex: 1 }} value={task.recurrence || "none"} onChange={(e) => onChange({ recurrence: e.target.value === "none" ? null : e.target.value })}>{Object.entries(RECURRENCE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>} />
    </Popover>}
  </>);
});

export const PriorityCell = memo(function PriorityCell({ task, onChange, boxed }) {
  const pop = usePop(); const k = task.priority || "none"; const p = PRIORITY[k];
  return (<>
    <button className={"hw-cell" + (boxed ? " boxed" : "") + (k === "none" ? " ph" : "")} onClick={pop.toggle}>{k === "none" ? (boxed ? "No priority" : <span className="ph-ic">—</span>) : <Chip t={p.tone}>{p.label}</Chip>}</button>
    {pop.open && <Popover anchor={pop.anchor} onClose={pop.close} width={190}><OptionList options={PRIORITY_ORDER.map((x) => ({ value: x, label: PRIORITY[x].label, icon: <span className="hw-dot" style={tone(PRIORITY[x].tone)} /> }))} value={k} onPick={(v) => { onChange({ priority: v }); pop.close(); }} /></Popover>}
  </>);
});

export const StatusCell = memo(function StatusCell({ task, onChange, boxed }) {
  const pop = usePop(); const s = STATUS[task.status] || STATUS.todo;
  return (<>
    <button className={"hw-cell" + (boxed ? " boxed" : "")} onClick={pop.toggle}><Chip t={s.tone} dot>{s.label}</Chip></button>
    {pop.open && <Popover anchor={pop.anchor} onClose={pop.close} width={190}><OptionList options={STATUS_ORDER.map((x) => ({ value: x, label: STATUS[x].label, icon: <span className="hw-dot" style={tone(STATUS[x].tone)} /> }))} value={task.status} onPick={(v) => { onChange({ status: v }); pop.close(); }} /></Popover>}
  </>);
});

export const SectionCell = memo(function SectionCell({ task, sections, onChange, boxed }) {
  const pop = usePop(); const s = sections.find((x) => x.id === task.section_id);
  return (<>
    <button className={"hw-cell" + (boxed ? " boxed" : "") + (!s ? " ph" : "")} onClick={pop.toggle}><span className="hw-trunc">{s ? s.name : boxed ? "No section" : "—"}</span></button>
    {pop.open && <Popover anchor={pop.anchor} onClose={pop.close} width={230}><OptionList options={[{ value: null, label: "No section" }, ...sections.map((x) => ({ value: x.id, label: x.name }))]} value={task.section_id || null} onPick={(v) => { onChange({ section_id: v }); pop.close(); }} /></Popover>}
  </>);
});

export function LabelsCell({ task, labels, ids, onToggle, onCreate, boxed }) {
  const pop = usePop(); const [name, setName] = useState(""); const [color, setColor] = useState("#0C7C74"); const [making, setMaking] = useState(false);
  const mine = labels.filter((l) => ids.includes(l.id));
  return (<>
    <button className={"hw-cell" + (boxed ? " boxed" : "") + (!mine.length ? " ph" : "")} onClick={pop.toggle} style={{ gap: 4 }}>
      {mine.length ? mine.slice(0, boxed ? 6 : 2).map((l) => <span key={l.id} className="hw-chip" style={{ "--c": l.color, "--c-soft": `color-mix(in srgb, ${l.color} 16%, transparent)` }}><span className="hw-trunc">{l.name}</span></span>) : boxed ? "Add labels" : <span className="ph-ic" style={{ display: "inline-flex" }}><Icon name="tag" size={15} /></span>}
      {!boxed && mine.length > 2 && <span style={{ fontSize: 11.5, color: "var(--ink3)" }}>+{mine.length - 2}</span>}
    </button>
    {pop.open && <Popover anchor={pop.anchor} onClose={() => { pop.close(); setMaking(false); }} width={250}>
      {making ? <div style={{ padding: 6 }}><input className="hw-input" autoFocus placeholder="Label name" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={async (e) => { if (e.key === "Enter" && name.trim()) { const l = await onCreate(name.trim(), color); if (l) onToggle(task.id, l.id); setName(""); setMaking(false); } }} /><ColorPicker value={color} onPick={setColor} /></div>
        : <OptionList multi searchable options={labels.map((l) => ({ value: l.id, label: l.name, dot: l.color }))} value={ids} onPick={(v) => onToggle(task.id, v)} placeholder="Search labels…" emptyText="No labels yet" footer={onCreate && <><MenuSep /><MenuItem icon="plus" onClick={() => setMaking(true)}>New label</MenuItem></>} />}
    </Popover>}
  </>);
}

// Custom field value editor by type: text, number, currency, date, select, checkbox.
export function FieldCell({ field, value, onChange, boxed }) {
  const pop = usePop(); const [draft, setDraft] = useState(null);
  const type = field.field_type || "text"; const v = value ?? "";
  const commit = () => { if (draft !== null && draft !== String(v)) onChange(draft); setDraft(null); };
  if (type === "checkbox") return <button className={"hw-cell" + (boxed ? " boxed" : "")} onClick={() => onChange(v === "true" || v === true ? "" : "true")}><span className={"hw-check ap" + (v === "true" || v === true ? " done" : "")} style={{ width: 16, height: 16 }}><Icon name="check" size={11} sw={2.6} /></span></button>;
  if (type === "select" || type === "dropdown" || type === "single_select") {
    const opts = cfOptions(field);
    return (<>
      <button className={"hw-cell" + (boxed ? " boxed" : "") + (!v ? " ph" : "")} onClick={pop.toggle}>{v ? <Chip t="teal">{String(v)}</Chip> : boxed ? "—" : <span className="ph-ic">—</span>}</button>
      {pop.open && <Popover anchor={pop.anchor} onClose={pop.close} width={210}><OptionList options={[{ value: "", label: "No value" }, ...opts.map((o) => ({ value: o.label, label: o.label, dot: o.color }))]} value={String(v)} onPick={(x) => { onChange(x); pop.close(); }} /></Popover>}
    </>);
  }
  if (type === "date") return (<>
    <button className={"hw-cell hw-num" + (boxed ? " boxed" : "") + (!v ? " ph" : "")} onClick={pop.toggle}>{v ? fmtDate(String(v), { relative: false }) : boxed ? "—" : <span className="ph-ic">—</span>}</button>
    {pop.open && <Popover anchor={pop.anchor} onClose={pop.close}><DatePicker range={false} due={v ? String(v).slice(0, 10) : null} onChange={(d) => onChange(d.due_date || "")} onClose={pop.close} /></Popover>}
  </>);
  const num = type === "number" || type === "currency";
  return <div className={"hw-cell" + (boxed ? " boxed" : "")} style={{ cursor: "text" }}>
    {type === "currency" && v !== "" && draft === null && <span style={{ color: "var(--ink3)" }}>{field.options?.prefix || "$"}</span>}
    <input className={"hw-bare" + (num ? " hw-num" : "")} style={{ textAlign: num && !boxed ? "right" : "left" }} inputMode={num ? "decimal" : undefined} placeholder={boxed ? "—" : ""} value={draft ?? String(v)} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setDraft(null); e.currentTarget.blur(); } }} onClick={(e) => e.stopPropagation()} />
  </div>;
}

export const ApprovalChip = ({ task }) => { const s = approvalState(task); const a = APPROVAL[s]; return a ? <Chip t={a.tone} dot>{a.label}</Chip> : null; };
export const KindIcon = ({ kind, done }) => kind === "milestone" ? <Icon name="diamond" size={14} fill={done ? "var(--green)" : "none"} style={{ color: "var(--green)", flex: "none" }} /> : kind === "approval" ? <Icon name="thumb" size={14} style={{ color: "var(--amber)", flex: "none" }} /> : null;
export const taskDim = (t) => (isDone(t) ? { color: "var(--ink3)" } : undefined);
