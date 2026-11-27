"use client";
// Project tabs that used to live only in the classic module: Rules, Docs, and
// Forms & task templates.
import { useState, useEffect, useMemo } from "react";
import { Icon, Popover, usePop, MenuItem, MenuSep, Avatar, AvatarStack, Chip, Modal, Field, OptionList, PersonPicker, Seg, Empty } from "./ui";
import { STATUS, STATUS_ORDER, PRIORITY, PRIORITY_ORDER, personName, timeAgo, plural } from "./model";
import { tone } from "./theme";

export const EXTRAS_CSS = `
.hw-pick{justify-content:flex-start;max-width:100%;min-width:0;font-weight:450}
.hw-pick.ph{color:var(--ink3)}
.hw-pick.quiet{border-color:transparent;background:transparent;margin-left:-8px;padding:0 8px}
.hw-pick.quiet:hover{border-color:var(--line2);background:transparent}
.hw-pick.quiet>svg:last-child{opacity:0}.hw-pick.quiet:hover>svg:last-child{opacity:1}
.hw-sw{width:34px;height:20px;border-radius:10px;border:none;background:var(--line2);position:relative;cursor:pointer;flex:none;padding:0;transition:background .15s}
.hw-sw i{position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:left .15s}
.hw-sw.on{background:var(--accent)}.hw-sw.on i{left:16px}
.hw-xhead{display:flex;align-items:center;gap:10px;margin-bottom:16px;flex-wrap:wrap}
.hw-xhead h2{margin:0;font-size:17px;font-weight:700}
.hw-xhead p{margin:2px 0 0;color:var(--ink3);font-size:12.5px}
.hw-rule{display:flex;align-items:center;gap:14px;background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 16px;margin-bottom:8px;transition:border-color .12s,box-shadow .12s}
.hw-rule:hover{border-color:var(--line2);box-shadow:var(--sh1)}
.hw-rule.off{opacity:.62}
.hw-rule h4{margin:0 0 6px;font-size:13.5px;font-weight:650}
.hw-flow{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12.5px;color:var(--ink2)}
.hw-step{display:inline-flex;align-items:center;gap:6px;min-height:24px;padding:2px 9px;border-radius:7px;background:var(--c-soft,var(--sunken));color:var(--c,var(--ink2));font-weight:500;max-width:100%}
.hw-block{border:1px solid var(--line);border-radius:12px;padding:12px 14px;margin-bottom:10px;background:var(--raise)}
.hw-block>h5{margin:0 0 10px;font-size:11px;font-weight:650;letter-spacing:.07em;text-transform:uppercase;color:var(--ink3);display:flex;align-items:center;gap:6px}
.hw-arow{display:flex;gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap}
.hw-arow>.hw-input{flex:1;min-width:140px;width:auto}
.hw-recipe{display:flex;flex-direction:column;gap:8px;text-align:left;border:1px dashed var(--line2);background:var(--surface);border-radius:12px;padding:14px;cursor:pointer;transition:border-color .12s,background .12s}
.hw-recipe:hover{border-color:var(--accent);background:var(--accent-soft)}
.hw-xcard{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:14px 16px;display:flex;flex-direction:column;gap:8px;min-width:0;transition:border-color .12s,box-shadow .12s}
.hw-xcard:hover{border-color:var(--line2);box-shadow:var(--sh1)}
.hw-xcard h4{margin:0;font-size:14px;font-weight:650;display:flex;align-items:center;gap:8px;min-width:0}
.hw-xcard p{margin:0;color:var(--ink3);font-size:12.5px;line-height:1.45}
.hw-xgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:12px}
.hw-doc{display:flex;align-items:center;gap:12px;padding:10px 12px;border-bottom:1px solid var(--line);cursor:pointer;border-radius:8px}
.hw-doc:hover{background:var(--raise)}
.hw-doc:last-child{border-bottom:none}
.hw-doc .em{width:34px;height:34px;border-radius:9px;background:var(--sunken);display:flex;align-items:center;justify-content:center;font-size:18px;flex:none}
.hw-two{display:grid;grid-template-columns:230px minmax(0,1fr);gap:16px;min-height:340px}
.hw-items{border-right:1px solid var(--line);padding-right:12px;display:flex;flex-direction:column;gap:2px}
.hw-it{display:flex;align-items:center;gap:8px;height:32px;padding:0 9px;border-radius:8px;cursor:pointer;border:none;background:transparent;text-align:left;width:100%;color:var(--ink2)}
.hw-it:hover{background:var(--hover)}.hw-it.on{background:var(--accent-soft);color:var(--accent-ink);font-weight:550}
.hw-ffield{border:1px solid var(--line);border-radius:10px;padding:10px;margin-bottom:8px;background:var(--surface)}
.hw-opt{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border-radius:14px;border:1px solid var(--line2);background:var(--surface);cursor:pointer;font-size:12.5px}
.hw-opt.on{background:var(--accent-soft);border-color:transparent;color:var(--accent-ink);font-weight:550}
@media (max-width:900px){.hw-two{grid-template-columns:1fr}.hw-items{border-right:none;border-bottom:1px solid var(--line);padding:0 0 10px}.hw-rule>.hw-num{display:none}.hw-rule{gap:10px;padding:12px}}
`;

// Button that opens a searchable option list. multi → value is an array and onPick gets the next array.
export function Pick({ value, options, onPick, placeholder = "Choose…", width = 250, multi, block, searchable, style, sm, quiet }) {
  const pop = usePop();
  const chosen = multi ? options.filter((o) => (value || []).includes(o.value)) : options.find((o) => o.value === (value ?? null) || (value == null && o.value === ""));
  const label = multi ? (chosen.length ? chosen.map((o) => o.label).join(", ") : "") : chosen?.label;
  return (<>
    <button type="button" className={"hw-btn hw-pick" + (sm ? " sm" : "") + (quiet ? " quiet" : "") + (label ? "" : " ph")} style={{ ...(block ? { width: "100%" } : null), ...style }} onClick={pop.toggle}>
      {!multi && chosen?.dot && <span className="hw-dot" style={{ background: chosen.dot }} />}{!multi && chosen?.icon}
      <span className="hw-trunc" style={{ flex: 1, textAlign: "left" }}>{label || placeholder}</span><Icon name="chevD" size={14} style={{ color: "var(--ink3)", flex: "none" }} />
    </button>
    {pop.open && <Popover anchor={pop.anchor} onClose={pop.close} width={width}><OptionList options={options} value={multi ? value || [] : value ?? null} multi={multi} searchable={searchable} onPick={(v) => { if (multi) { const cur = value || []; onPick(cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]); } else { onPick(v); pop.close(); } }} /></Popover>}
  </>);
}
export const Switch = ({ on, onChange, title }) => <button type="button" className={"hw-sw" + (on ? " on" : "")} title={title} role="switch" aria-checked={!!on} onClick={(e) => { e.stopPropagation(); onChange(!on); }}><i /></button>;
export const personOptions = (people, none) => [...(none ? [{ value: null, label: none, icon: <Avatar size={20} /> }] : []), ...people.map((p) => ({ value: p.id, label: personName(p), icon: <Avatar person={p} size={20} /> }))];
const statusOptions = STATUS_ORDER.map((k) => ({ value: k, label: STATUS[k].label, icon: <span className="hw-dot" style={tone(STATUS[k].tone)} /> }));
const priorityOptions = PRIORITY_ORDER.map((k) => ({ value: k, label: PRIORITY[k].label, icon: <span className="hw-dot" style={tone(PRIORITY[k].tone)} /> }));
const PageShell = ({ children, narrow }) => <div className="hw-page hw-scroll"><div className="hw-page-in" style={narrow ? { maxWidth: 920 } : undefined}>{children}</div></div>;

/* ───────────────────────── Rules ───────────────────────── */
const TRIGGERS = [
  { key: "task_created", label: "A task is added to this project", icon: "plus" },
  { key: "task_moved_to_section", label: "A task moves to a section", icon: "arrowR" },
  { key: "status_changed", label: "A task's status changes", icon: "repeat" },
  { key: "task_completed", label: "A task is completed", icon: "check" },
  { key: "task_assigned", label: "A task is assigned", icon: "user" },
  { key: "priority_changed", label: "A task's priority changes", icon: "flag" },
  { key: "due_date_approaching", label: "A due date is coming up", icon: "cal" },
  { key: "custom_field_changed", label: "A custom field changes", icon: "tag" },
];
const ACTIONS = [
  { key: "move_to_section", label: "Move it to a section", icon: "arrowR" },
  { key: "set_status", label: "Set its status", icon: "repeat" },
  { key: "mark_complete", label: "Mark it complete", icon: "check" },
  { key: "set_assignee", label: "Assign it to someone", icon: "user" },
  { key: "set_priority", label: "Set its priority", icon: "flag" },
  { key: "set_due_date_offset", label: "Set the due date", icon: "cal" },
  { key: "add_comment", label: "Add a comment", icon: "msg" },
  { key: "set_custom_field", label: "Set a custom field", icon: "tag" },
];
const sectionIdsOf = (tc) => (Array.isArray(tc?.section_ids) && tc.section_ids.length ? tc.section_ids : tc?.section_id ? [tc.section_id] : []);
function triggerText(rule, ctx) {
  const tc = rule.trigger_config || {}; const q = (s) => `“${s}”`;
  switch (rule.trigger_type) {
    case "task_created": return "a task is added";
    case "task_moved_to_section": { const names = sectionIdsOf(tc).map((id) => ctx.sections.find((s) => s.id === id)?.name).filter(Boolean); return names.length ? "a task moves to " + names.map(q).join(" or ") : "a task moves to any section"; }
    case "status_changed": return tc.status ? "status becomes " + q(STATUS[tc.status]?.label || tc.status) : "status changes";
    case "task_completed": return "a task is completed";
    case "task_assigned": return tc.assignee_id ? "a task is assigned to " + (personName(ctx.people[tc.assignee_id]) || "someone") : "a task is assigned to anyone";
    case "priority_changed": return tc.priority ? "priority becomes " + q(PRIORITY[tc.priority]?.label || tc.priority) : "priority changes";
    case "due_date_approaching": return `a task is due within ${plural(Number(tc.days_before) || 0, "day")}`;
    case "custom_field_changed": { const f = ctx.fields.find((x) => x.id === tc.field_id); return f ? q(f.name) + " changes" : "any custom field changes"; }
    default: return rule.trigger_type;
  }
}
function actionText(a, ctx) {
  const c = a.config || {}; const q = (s) => `“${s}”`;
  switch (a.type) {
    case "move_to_section": return "move to " + q(ctx.sections.find((s) => s.id === c.section_id)?.name || "a deleted section");
    case "set_status": return "set status to " + q(STATUS[c.status]?.label || c.status || "?");
    case "mark_complete": return "mark complete";
    case "set_assignee": return c.assignee_id ? "assign to " + (personName(ctx.people[c.assignee_id]) || "someone") : "clear the assignee";
    case "set_priority": return "set priority to " + q(PRIORITY[c.priority]?.label || c.priority || "?");
    case "set_due_date_offset": { const n = Number(c.days_offset) || 0; return n === 0 ? "set due date to that day" : `set due date ${plural(n, "day")} out`; }
    case "add_comment": return "comment " + q(String(c.comment || "").slice(0, 50) + (String(c.comment || "").length > 50 ? "…" : ""));
    case "set_custom_field": { const f = ctx.fields.find((x) => x.id === c.field_id); return `set ${f ? q(f.name) : "a field"} to ${q(c.value || "empty")}`; }
    default: return a.type;
  }
}
const actionReady = (a) => { const c = a.config || {}; return a.type === "mark_complete" || a.type === "set_assignee" || (a.type === "move_to_section" && c.section_id) || (a.type === "set_status" && c.status) || (a.type === "set_priority" && c.priority) || (a.type === "set_due_date_offset" && c.days_offset !== "" && c.days_offset != null) || (a.type === "add_comment" && (c.comment || "").trim()) || (a.type === "set_custom_field" && c.field_id); };
const autoName = (rule, ctx) => { const t = triggerText(rule, ctx); const a = (rule.actions || []).filter(actionReady).map((x) => actionText(x, ctx)).join(", "); return ("When " + t + (a ? ", " + a : "")).slice(0, 120); };

export function RulesTab({ store, project }) {
  const pid = project.id; const [editing, setEditing] = useState(null);
  const rules = useMemo(() => store.rules.filter((r) => r.project_id === pid).sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || ""))), [store.rules, pid]);
  const sections = store.sectionsOf.get(pid) || []; const fields = useMemo(() => store.fields.filter((f) => f.project_id === pid), [store.fields, pid]);
  const ctx = { sections, fields, people: store.people };
  const blank = (over = {}) => ({ name: "", trigger_type: "task_created", trigger_config: {}, actions: [{ type: "move_to_section", config: {} }], ...over });
  const doneSec = sections.find((s) => s.is_complete_column) || sections[sections.length - 1];
  const recipes = [
    doneSec && { title: `Finish tasks that land in “${doneSec.name}”`, rule: blank({ trigger_type: "task_moved_to_section", trigger_config: { section_ids: [doneSec.id], section_id: doneSec.id }, actions: [{ type: "mark_complete", config: {} }] }) },
    { title: "Give every new task a due date", rule: blank({ trigger_type: "task_created", actions: [{ type: "set_due_date_offset", config: { days_offset: 7 } }] }) },
    { title: "Send urgent work to the owner", rule: blank({ trigger_type: "priority_changed", trigger_config: { priority: "urgent" }, actions: [{ type: "set_assignee", config: { assignee_id: project.owner_id || store.uid } }] }) },
    doneSec && { title: `Move completed tasks to “${doneSec.name}”`, rule: blank({ trigger_type: "task_completed", actions: [{ type: "move_to_section", config: { section_id: doneSec.id } }] }) },
  ].filter(Boolean);
  return (
    <PageShell narrow>
      <div className="hw-xhead"><div style={{ flex: 1, minWidth: 200 }}><h2>Rules</h2><p>Automate the routine: when something happens to a task here, Helm does the follow-up.</p></div>
        <button className="hw-btn primary" onClick={() => setEditing(blank())}><Icon name="plus" size={15} sw={2.2} />Add rule</button></div>
      {rules.map((r) => <RuleRow key={r.id} rule={r} ctx={ctx} store={store} onEdit={() => setEditing({ ...r, trigger_config: { ...(r.trigger_config || {}) }, actions: (r.actions || []).map((a) => ({ type: a.type, config: { ...(a.config || {}) } })) })} />)}
      {!rules.length && <Empty title="No rules yet" icon="zap">Start from one of these, or build your own.</Empty>}
      <div className="hw-eyebrow" style={{ margin: rules.length ? "22px 0 10px" : "0 0 10px" }}>{rules.length ? "Ideas" : "Start with"}</div>
      <div className="hw-xgrid">{recipes.map((rc) => <button key={rc.title} className="hw-recipe" onClick={() => setEditing({ ...rc.rule, name: rc.title })}>
        <b style={{ fontWeight: 650, fontSize: 13.5 }}>{rc.title}</b>
        <span className="hw-flow"><span className="hw-step" style={tone("blue")}>When {triggerText(rc.rule, ctx)}</span><Icon name="arrowR" size={14} />{rc.rule.actions.map((a, i) => <span key={i} className="hw-step" style={tone("green")}>{actionText(a, ctx)}</span>)}</span>
      </button>)}</div>
      {editing && <RuleBuilder store={store} pid={pid} ctx={ctx} rule={editing} onClose={() => setEditing(null)} />}
    </PageShell>
  );
}
function RuleRow({ rule, ctx, store, onEdit }) {
  const menu = usePop(); const stale = rule.trigger_type === "task_moved_to_section" && sectionIdsOf(rule.trigger_config).some((id) => !ctx.sections.some((s) => s.id === id));
  return (
    <div className={"hw-rule" + (rule.is_active ? "" : " off")}>
      <Switch on={rule.is_active} onChange={() => store.toggleRule(rule)} title={rule.is_active ? "Turn this rule off" : "Turn this rule on"} />
      <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={onEdit}>
        <h4 className="hw-trunc">{rule.name || "Untitled rule"}</h4>
        <div className="hw-flow"><span className="hw-step" style={tone("blue")}><Icon name={TRIGGERS.find((t) => t.key === rule.trigger_type)?.icon || "zap"} size={13} />When {triggerText(rule, ctx)}</span>
          <Icon name="arrowR" size={14} />{(rule.actions || []).map((a, i) => <span key={i} className="hw-step" style={tone("green")}><Icon name={ACTIONS.find((x) => x.key === a.type)?.icon || "zap"} size={13} /><span className="hw-trunc">{actionText(a, ctx)}</span></span>)}
          {stale && <Chip t="amber">Points at a deleted section</Chip>}</div>
      </div>
      <span className="hw-num" style={{ fontSize: 12, color: "var(--ink3)", whiteSpace: "nowrap", textAlign: "right" }}>{rule.run_count ? <>Ran {plural(rule.run_count, "time")}{rule.last_run_at && <><br />last {timeAgo(rule.last_run_at)}</>}</> : "Hasn't run yet"}</span>
      <button className="hw-icb" onClick={menu.toggle}><Icon name="more" /></button>
      {menu.open && <Popover anchor={menu.anchor} onClose={menu.close} align="end" width={180}>
        <MenuItem icon="note" onClick={() => { menu.close(); onEdit(); }}>Edit rule</MenuItem>
        <MenuItem icon="copy" onClick={() => { menu.close(); store.saveRule(rule.project_id, { ...rule, id: undefined, name: (rule.name || "Rule") + " (copy)" }); }}>Duplicate</MenuItem>
        <MenuSep /><MenuItem icon="trash" danger onClick={() => { menu.close(); if (window.confirm(`Delete the rule "${rule.name}"?`)) store.deleteRule(rule); }}>Delete rule</MenuItem>
      </Popover>}
    </div>
  );
}
function RuleBuilder({ store, pid, ctx, rule, onClose }) {
  const [r, setR] = useState(rule); const [busy, setBusy] = useState(false); const add = usePop();
  const tc = r.trigger_config || {}; const setTc = (patch) => setR((x) => ({ ...x, trigger_config: { ...x.trigger_config, ...patch } }));
  const setAct = (i, patch) => setR((x) => ({ ...x, actions: x.actions.map((a, k) => (k === i ? { ...a, ...patch } : a)) }));
  const setCfg = (i, patch) => setR((x) => ({ ...x, actions: x.actions.map((a, k) => (k === i ? { ...a, config: { ...a.config, ...patch } } : a)) }));
  const secOpts = ctx.sections.map((s) => ({ value: s.id, label: s.name })); const fieldOpts = ctx.fields.map((f) => ({ value: f.id, label: f.name }));
  const people = store.assignable(pid); const ready = r.actions.length > 0 && r.actions.every(actionReady) && (r.trigger_type !== "due_date_approaching" || Number(tc.days_before) >= 0);
  const save = async () => { if (!ready || busy) return; setBusy(true); const out = await store.saveRule(pid, { ...r, name: r.name.trim() || autoName(r, ctx) }); setBusy(false); if (out) onClose(); };
  const fieldValueInput = (fid, value, onChange) => { const f = ctx.fields.find((x) => x.id === fid); const opts = Array.isArray(f?.options) ? f.options : Array.isArray(f?.options?.choices) ? f.options.choices : []; return opts.length ? <Pick value={value || ""} options={[{ value: "", label: "Empty" }, ...opts.map((o) => ({ value: typeof o === "string" ? o : o.label, label: typeof o === "string" ? o : o.label }))]} onPick={onChange} placeholder="Value" /> : <input className="hw-input" placeholder="Value" value={value || ""} onChange={(e) => onChange(e.target.value)} />; };
  return (
    <Modal title={r.id ? "Edit rule" : "New rule"} onClose={onClose} width={620} footer={<><span style={{ flex: 1, fontSize: 12, color: "var(--ink3)" }}>{ready ? "" : "Finish each step to save"}</span><button className="hw-btn ghost" onClick={onClose}>Cancel</button><button className="hw-btn primary" disabled={!ready || busy} onClick={save}>{r.id ? "Save rule" : "Create rule"}</button></>}>
      <Field label="Name"><input className="hw-input" value={r.name} placeholder={autoName(r, ctx)} onChange={(e) => setR({ ...r, name: e.target.value })} /></Field>
      <div className="hw-block"><h5><Icon name="zap" size={13} />When</h5>
        <div className="hw-arow"><Pick value={r.trigger_type} options={TRIGGERS.map((t) => ({ value: t.key, label: t.label, icon: <Icon name={t.icon} size={15} /> }))} onPick={(v) => setR({ ...r, trigger_type: v, trigger_config: v === "due_date_approaching" ? { days_before: 2 } : {} })} width={300} />
          {r.trigger_type === "task_moved_to_section" && <Pick multi value={sectionIdsOf(tc)} options={secOpts} placeholder="Any section" onPick={(ids) => setTc({ section_ids: ids, section_id: ids[0] || null })} />}
          {r.trigger_type === "status_changed" && <Pick value={tc.status || null} options={[{ value: null, label: "Any status" }, ...statusOptions]} onPick={(v) => setTc({ status: v })} />}
          {r.trigger_type === "task_assigned" && <Pick value={tc.assignee_id || null} searchable options={personOptions(people, "Anyone")} onPick={(v) => setTc({ assignee_id: v })} />}
          {r.trigger_type === "priority_changed" && <Pick value={tc.priority || null} options={[{ value: null, label: "Any priority" }, ...priorityOptions]} onPick={(v) => setTc({ priority: v })} />}
          {r.trigger_type === "due_date_approaching" && <><input className="hw-input hw-num" type="number" min={0} style={{ width: 70, flex: "none" }} value={tc.days_before ?? ""} onChange={(e) => setTc({ days_before: e.target.value === "" ? "" : Number(e.target.value) })} /><span style={{ color: "var(--ink2)" }}>days before it's due</span></>}
          {r.trigger_type === "custom_field_changed" && <Pick value={tc.field_id || null} options={[{ value: null, label: "Any field" }, ...fieldOpts]} onPick={(v) => setTc({ field_id: v })} />}
        </div>
        {r.trigger_type === "due_date_approaching" && <div style={{ fontSize: 12, color: "var(--ink3)" }}>Checked whenever someone has Projects open, once per task and due date.</div>}
      </div>
      <div className="hw-block"><h5><Icon name="check" size={13} />Then</h5>
        {r.actions.map((a, i) => { const c = a.config || {}; return (
          <div key={i} className="hw-arow">
            <Pick value={a.type} options={ACTIONS.map((x) => ({ value: x.key, label: x.label, icon: <Icon name={x.icon} size={15} /> }))} onPick={(v) => setAct(i, { type: v, config: v === "set_due_date_offset" ? { days_offset: 7 } : {} })} width={240} />
            {a.type === "move_to_section" && <Pick value={c.section_id || null} options={secOpts} placeholder="Pick a section" onPick={(v) => setCfg(i, { section_id: v })} />}
            {a.type === "set_status" && <Pick value={c.status || null} options={statusOptions} placeholder="Pick a status" onPick={(v) => setCfg(i, { status: v })} />}
            {a.type === "set_assignee" && <Pick value={c.assignee_id || null} searchable options={personOptions(people, "No one (clear it)")} onPick={(v) => setCfg(i, { assignee_id: v })} />}
            {a.type === "set_priority" && <Pick value={c.priority || null} options={priorityOptions} placeholder="Pick a priority" onPick={(v) => setCfg(i, { priority: v })} />}
            {a.type === "set_due_date_offset" && <><input className="hw-input hw-num" type="number" min={0} style={{ width: 70, flex: "none" }} value={c.days_offset ?? ""} onChange={(e) => setCfg(i, { days_offset: e.target.value === "" ? "" : Number(e.target.value) })} /><span style={{ color: "var(--ink2)" }}>days from that day</span></>}
            {a.type === "add_comment" && <input className="hw-input" placeholder="What should the comment say?" value={c.comment || ""} onChange={(e) => setCfg(i, { comment: e.target.value })} />}
            {a.type === "set_custom_field" && <><Pick value={c.field_id || null} options={fieldOpts} placeholder={fieldOpts.length ? "Pick a field" : "No custom fields yet"} onPick={(v) => setCfg(i, { field_id: v, value: "" })} />{c.field_id && fieldValueInput(c.field_id, c.value, (v) => setCfg(i, { value: v }))}</>}
            {r.actions.length > 1 && <button className="hw-icb sm" style={{ marginLeft: "auto" }} title="Remove this step" onClick={() => setR({ ...r, actions: r.actions.filter((_, k) => k !== i) })}><Icon name="x" size={14} /></button>}
          </div>); })}
        <button className="hw-btn ghost sm" onClick={add.toggle}><Icon name="plus" size={13} />Add another step</button>
        {add.open && <Popover anchor={add.anchor} onClose={add.close} width={240}>{ACTIONS.map((x) => <MenuItem key={x.key} icon={x.icon} onClick={() => { setR({ ...r, actions: [...r.actions, { type: x.key, config: x.key === "set_due_date_offset" ? { days_offset: 7 } : {} }] }); add.close(); }}>{x.label}</MenuItem>)}</Popover>}
      </div>
    </Modal>
  );
}

/* ───────────────────────── Docs ───────────────────────── */
export function DocsTab({ store, project, onOpenDoc }) {
  const pid = project.id; const link = usePop(); const [title, setTitle] = useState(null); const [busy, setBusy] = useState(false); const [menu, setMenu] = useState(null);
  const linked = useMemo(() => store.docs.filter((d) => d.project_id === pid || d.id === project.linked_doc_id).sort((a, b) => (a.id === project.linked_doc_id ? -1 : b.id === project.linked_doc_id ? 1 : String(b.updated_at || "").localeCompare(String(a.updated_at || "")))), [store.docs, pid, project.linked_doc_id]);
  const others = useMemo(() => store.docs.filter((d) => d.project_id !== pid && d.id !== project.linked_doc_id), [store.docs, pid, project.linked_doc_id]);
  const create = async () => { if (!title?.trim() || busy) return; setBusy(true); const d = await store.createDoc(pid, title); setBusy(false); if (d) { setTitle(null); store.toast?.("Doc created", onOpenDoc && { label: "Open", run: () => onOpenDoc(d.id) }); } };
  return (
    <PageShell narrow>
      <div className="hw-xhead"><div style={{ flex: 1, minWidth: 200 }}><h2>Docs</h2><p>Briefs, specs and notes that belong with this project. They open in Docs.</p></div>
        <button className="hw-btn" onClick={link.toggle}><Icon name="link" size={15} />Link a doc</button>
        <button className="hw-btn primary" onClick={() => setTitle("")}><Icon name="plus" size={15} sw={2.2} />New doc</button></div>
      {title !== null && <div className="hw-card2" style={{ marginBottom: 12, display: "flex", gap: 8, alignItems: "center" }}><span style={{ fontSize: 18 }}>📄</span><input className="hw-input" autoFocus placeholder="Name the doc, e.g. Launch brief" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") create(); if (e.key === "Escape") setTitle(null); }} /><button className="hw-btn ghost" onClick={() => setTitle(null)}>Cancel</button><button className="hw-btn primary" disabled={!title.trim() || busy} onClick={create}>Create</button></div>}
      {linked.length > 0 ? <div className="hw-card2" style={{ padding: 6 }}>{linked.map((d) => (
        <div key={d.id} className="hw-doc" onClick={() => onOpenDoc?.(d.id)}>
          <span className="em">{d.emoji || "📄"}</span>
          <div style={{ flex: 1, minWidth: 0 }}><div className="hw-trunc" style={{ fontWeight: 600 }}>{d.title || "Untitled"}</div><div style={{ fontSize: 12, color: "var(--ink3)" }}>{d.updated_at ? "Edited " + timeAgo(d.updated_at) : "Not edited yet"}</div></div>
          {d.id === project.linked_doc_id && <Chip t="teal">Main doc</Chip>}{d.status === "draft" && <Chip t="slate">Draft</Chip>}
          <button className="hw-icb" onClick={(e) => { e.stopPropagation(); setMenu({ d, el: e.currentTarget }); }}><Icon name="more" /></button>
        </div>))}</div>
        : title === null && <Empty title="No docs linked yet" icon="note">Start a new doc for this project, or link one you already have.</Empty>}
      {menu && <Popover anchor={menu.el} onClose={() => setMenu(null)} align="end" width={200}>
        <MenuItem icon="expand" onClick={() => { onOpenDoc?.(menu.d.id); setMenu(null); }}>Open in Docs</MenuItem>
        {menu.d.id !== project.linked_doc_id && <MenuItem icon="star" onClick={() => { store.updateProject(pid, { linked_doc_id: menu.d.id }); setMenu(null); }}>Make this the main doc</MenuItem>}
        <MenuSep /><MenuItem icon="x" onClick={() => { store.unlinkDoc(pid, menu.d.id); setMenu(null); }}>Unlink from project</MenuItem>
      </Popover>}
      {link.open && <Popover anchor={link.anchor} onClose={link.close} align="end" width={320}><OptionList searchable placeholder="Search your docs…" emptyText="No other docs to link" options={others.map((d) => ({ value: d.id, label: (d.emoji || "📄") + "  " + (d.title || "Untitled"), hint: d.project_id ? store.projectsById[d.project_id]?.name?.slice(0, 14) : undefined }))} onPick={(id) => { store.linkDoc(pid, id); link.close(); store.toast?.("Doc linked"); }} /></Popover>}
    </PageShell>
  );
}

/* ───────────────────────── Forms & task templates ───────────────────────── */
const FORM_TYPES = [["description", "Description"], ["assignee", "Assignee"], ["due_date", "Due date"], ["priority", "Priority"], ["section", "Section"], ["note_short", "Short answer"], ["note_long", "Paragraph"], ["single_select", "Single select"], ["multi_select", "Multi select"], ["attachments", "Attachments"]];
const FORM_LABEL = Object.fromEntries([["title", "Task name"], ...FORM_TYPES]);
const rid = (p) => p + Math.random().toString(36).slice(2, 9);
const normItem = (o) => { const b = typeof o === "string" ? { title: o } : o || {}; return { id: b.id || rid("st_"), title: b.title || "", description: b.description || "", priority: b.priority || "none", assignee_id: b.assignee_id || "", collaborator_ids: Array.isArray(b.collaborator_ids) ? b.collaborator_ids : [], start_in_days: b.start_in_days ?? "", due_in_days: b.due_in_days ?? "", depends_on: Array.isArray(b.depends_on) ? b.depends_on : [] }; };

export function FormsTab({ store, project, onOpen }) {
  const pid = project.id; const [tab, setTab] = useState("forms"); const [forms, setForms] = useState(null); const [tmpls, setTmpls] = useState(null);
  const [formEd, setFormEd] = useState(null); const [tmplEd, setTmplEd] = useState(null); const [filling, setFilling] = useState(null); const [menu, setMenu] = useState(null);
  const sections = store.sectionsOf.get(pid) || []; const db = store.db; const org = store.orgFor(pid);
  useEffect(() => { let on = true; Promise.all([db.from("project_forms").select("*").eq("project_id", pid).order("created_at"), db.from("task_templates").select("*").eq("project_id", pid).order("created_at")]).then(([f, t]) => { if (!on) return; setForms(f.data || []); setTmpls(t.data || []); }); return () => { on = false; }; }, [pid]);
  const say = (m, a) => store.toast?.(m, a);

  const saveForm = async (ed) => {
    const payload = { name: ed.name.trim(), description: ed.description || "", fields: ed.fields, target_section_id: ed.target_section_id || null, default_assignee_id: ed.default_assignee_id || null, default_priority: ed.default_priority || "none", is_active: ed.is_active !== false, project_id: pid };
    const res = ed.id ? await db.from("project_forms").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", ed.id).select().single() : await db.from("project_forms").insert({ ...payload, org_id: org, created_by: store.uid }).select().single();
    if (res.error || !res.data) { say("Couldn't save the form" + (res.error?.message ? ": " + res.error.message : "")); return false; }
    setForms((p) => (ed.id ? p.map((f) => (f.id === ed.id ? res.data : f)) : [...p, res.data])); say("Form saved"); return true;
  };
  const toggleForm = async (f) => { setForms((p) => p.map((x) => (x.id === f.id ? { ...x, is_active: !f.is_active } : x))); await db.from("project_forms").update({ is_active: !f.is_active }).eq("id", f.id); };
  const deleteForm = async (f) => { if (!window.confirm(`Delete the form "${f.name}"? Its link will stop working.`)) return; setForms((p) => p.filter((x) => x.id !== f.id)); await db.from("project_forms").delete().eq("id", f.id); };
  const copyLink = (f) => { const url = `${window.location.origin}/form/${f.public_token}`; (navigator.clipboard?.writeText(url) || Promise.reject()).then(() => say("Form link copied"), () => say(url)); };
  const saveTmpl = async (ed) => {
    const items = (ed.template_data.subtasks || []).filter((s) => (s.title || "").trim()).map((s) => ({ ...s, title: s.title.trim() })); const valid = new Set(["__main", ...items.map((s) => s.id)]); const clean = (a) => (a || []).filter((id) => valid.has(id));
    const payload = { name: ed.name.trim(), project_id: pid, template_data: { ...ed.template_data, depends_on: clean(ed.template_data.depends_on), subtasks: items.map((s) => ({ ...s, depends_on: clean(s.depends_on) })) } };
    const res = ed.id ? await db.from("task_templates").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", ed.id).select().single() : await db.from("task_templates").insert({ ...payload, org_id: org, created_by: store.uid }).select().single();
    if (res.error || !res.data) { say("Couldn't save the template" + (res.error?.message ? ": " + res.error.message : "")); return false; }
    setTmpls((p) => (ed.id ? p.map((t) => (t.id === ed.id ? res.data : t)) : [...p, res.data])); say("Template saved"); return true;
  };
  const deleteTmpl = async (t) => { if (!window.confirm(`Delete the template "${t.name}"?`)) return; setTmpls((p) => p.filter((x) => x.id !== t.id)); await db.from("task_templates").delete().eq("id", t.id); };
  const applyTmpl = async (t) => { const made = await store.applyTaskTemplate(pid, t); if (made) say(`Task created from "${t.name}"`, { label: "Open", run: () => onOpen(made) }); };
  const newForm = () => setFormEd({ id: null, name: "", description: "", fields: [{ id: "f_title", label: "Task name", maps_to: "title", required: true }], target_section_id: "", default_assignee_id: "", default_priority: "none", is_active: true });
  const editForm = (f) => setFormEd({ ...f, description: f.description || "", fields: f.fields?.length ? f.fields : [{ id: "f_title", label: "Task name", maps_to: "title", required: true }], target_section_id: f.target_section_id || "", default_assignee_id: f.default_assignee_id || "", default_priority: f.default_priority || "none", is_active: f.is_active !== false });
  const newTmpl = () => setTmplEd({ id: null, name: "", template_data: { title: "", description: "", priority: "none", assignee_id: "", section_id: "", start_in_days: "", due_in_days: "", collaborator_ids: [], depends_on: [], subtasks: [] } });
  const editTmpl = (t) => { const td = t.template_data || {}; setTmplEd({ id: t.id, name: t.name, template_data: { ...normItem({ ...td, id: "__main" }), section_id: td.section_id || "", subtasks: (td.subtasks || []).map(normItem) } }); };
  const loading = forms === null;
  return (
    <PageShell>
      <div className="hw-xhead"><div style={{ flex: 1, minWidth: 200 }}><h2>Forms and templates</h2><p>{tab === "forms" ? "Collect requests with a form. Each answer becomes a task here." : "Reusable tasks with their subtasks, owners and timing already filled in."}</p></div>
        <Seg value={tab} options={[["forms", "Forms"], ["templates", "Task templates"]]} onChange={setTab} />
        <button className="hw-btn primary" onClick={tab === "forms" ? newForm : newTmpl}><Icon name="plus" size={15} sw={2.2} />{tab === "forms" ? "New form" : "New template"}</button></div>
      {loading ? <div className="hw-xgrid">{[0, 1].map((i) => <div key={i} className="hw-xcard"><div className="hw-skel" style={{ width: "60%" }} /><div className="hw-skel" style={{ width: "85%" }} /></div>)}</div>
        : tab === "forms" ? (forms.length ? <div className="hw-xgrid">{forms.map((f) => (
          <div key={f.id} className="hw-xcard" style={f.is_active ? undefined : { opacity: 0.7 }}>
            <h4><Icon name="inbox" size={16} style={{ color: "var(--accent-ink)", flex: "none" }} /><span className="hw-trunc" style={{ flex: 1 }}>{f.name}</span><Switch on={f.is_active} onChange={() => toggleForm(f)} title={f.is_active ? "Accepting answers. Click to pause." : "Paused. Click to accept answers."} /><button className="hw-icb sm" onClick={(e) => setMenu({ kind: "form", row: f, el: e.currentTarget })}><Icon name="more" /></button></h4>
            {f.description && <p>{f.description}</p>}
            <p>{plural((f.fields || []).length, "question")} · {plural(f.submit_count || 0, "answer")}{f.is_active ? "" : " · paused"}</p>
            <div style={{ display: "flex", gap: 6, marginTop: 2 }}><button className="hw-btn sm" onClick={() => setFilling(f)}><Icon name="note" size={13} />Fill out</button><button className="hw-btn sm" onClick={() => copyLink(f)} disabled={!f.public_token}><Icon name="link" size={13} />Copy link</button></div>
          </div>))}</div> : <Empty title="No forms yet" icon="inbox">A form gives people outside the project a simple way to ask for work. Anyone with the link can answer it.</Empty>)
        : (tmpls.length ? <div className="hw-xgrid">{tmpls.map((t) => { const td = t.template_data || {}; const subs = (td.subtasks || []).length; const sec = sections.find((s) => s.id === td.section_id); return (
          <div key={t.id} className="hw-xcard">
            <h4><Icon name="copy" size={16} style={{ color: "var(--violet)", flex: "none" }} /><span className="hw-trunc" style={{ flex: 1 }}>{t.name}</span><button className="hw-icb sm" onClick={(e) => setMenu({ kind: "tmpl", row: t, el: e.currentTarget })}><Icon name="more" /></button></h4>
            <p className="hw-trunc">Creates “{td.title || t.name}”{subs ? " with " + plural(subs, "subtask") : ""}</p>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>{sec && <Chip t="slate">{sec.name}</Chip>}{td.due_in_days !== "" && td.due_in_days != null && <Chip t="blue">Due in {plural(Number(td.due_in_days), "day")}</Chip>}{td.priority && td.priority !== "none" && <Chip t={PRIORITY[td.priority]?.tone}>{PRIORITY[td.priority]?.label}</Chip>}{td.assignee_id && <Avatar person={store.people[td.assignee_id]} id={td.assignee_id} size={20} />}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 2 }}><button className="hw-btn sm primary" onClick={() => applyTmpl(t)}><Icon name="plus" size={13} sw={2.2} />Use template</button><button className="hw-btn sm" onClick={() => editTmpl(t)}>Edit</button></div>
          </div>); })}</div> : <Empty title="No task templates yet" icon="copy">Save the tasks you create over and over, such as a new SKU checklist or a supplier onboarding, and add them in one click.</Empty>)}
      {menu && <Popover anchor={menu.el} onClose={() => setMenu(null)} align="end" width={180}>
        <MenuItem icon="note" onClick={() => { menu.kind === "form" ? editForm(menu.row) : editTmpl(menu.row); setMenu(null); }}>Edit</MenuItem>
        {menu.kind === "form" && <MenuItem icon="link" onClick={() => { copyLink(menu.row); setMenu(null); }}>Copy link</MenuItem>}
        <MenuSep /><MenuItem icon="trash" danger onClick={() => { const row = menu.row, k = menu.kind; setMenu(null); k === "form" ? deleteForm(row) : deleteTmpl(row); }}>Delete</MenuItem>
      </Popover>}
      {formEd && <FormEditor store={store} pid={pid} sections={sections} form={formEd} onClose={() => setFormEd(null)} onSave={async (ed) => { if (await saveForm(ed)) setFormEd(null); }} />}
      {tmplEd && <TaskTemplateEditor store={store} pid={pid} sections={sections} tmpl={tmplEd} onClose={() => setTmplEd(null)} onSave={async (ed) => { if (await saveTmpl(ed)) setTmplEd(null); }} />}
      {filling && <FormFill store={store} pid={pid} sections={sections} form={filling} onClose={() => setFilling(null)} onDone={(t) => { setForms((p) => p.map((f) => (f.id === filling.id ? { ...f, submit_count: (f.submit_count || 0) + 1 } : f))); setFilling(null); say("Task created from the form", { label: "Open", run: () => onOpen(t) }); }} />}
    </PageShell>
  );
}

function FormEditor({ store, pid, sections, form, onClose, onSave }) {
  const [f, setF] = useState(form); const add = usePop(); const [busy, setBusy] = useState(false);
  const setField = (i, patch) => setF((x) => ({ ...x, fields: x.fields.map((fl, k) => (k === i ? { ...fl, ...patch } : fl)) }));
  const move = (i, d) => setF((x) => { const a = x.fields.slice(); const j = i + d; if (j < 1 || j >= a.length) return x; [a[i], a[j]] = [a[j], a[i]]; return { ...x, fields: a }; });
  const people = store.assignable(pid);
  return (
    <Modal title={f.id ? "Edit form" : "New form"} onClose={onClose} width={640} footer={<><label style={{ flex: 1, display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--ink2)" }}><Switch on={f.is_active} onChange={(v) => setF({ ...f, is_active: v })} />Accepting answers</label><button className="hw-btn ghost" onClick={onClose}>Cancel</button><button className="hw-btn primary" disabled={!f.name.trim() || busy} onClick={async () => { setBusy(true); await onSave(f); setBusy(false); }}>Save form</button></>}>
      <Field label="Form name"><input className="hw-input" autoFocus value={f.name} placeholder="e.g. Creative request" onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Intro shown at the top"><textarea className="hw-input" rows={2} value={f.description} placeholder="Tell people what this form is for." onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      <div className="hw-eyebrow" style={{ margin: "4px 0 8px" }}>Questions</div>
      {f.fields.map((fl, i) => { const sel = fl.maps_to === "single_select" || fl.maps_to === "multi_select"; return (
        <div key={fl.id} className="hw-ffield">
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <input className="hw-input" style={{ flex: 1 }} value={fl.label} placeholder="Question" onChange={(e) => setField(i, { label: e.target.value })} />
            <Chip t={fl.maps_to === "title" ? "teal" : "slate"}>{FORM_LABEL[fl.maps_to] || fl.maps_to}</Chip>
            <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, color: "var(--ink2)", whiteSpace: "nowrap" }}><input type="checkbox" checked={!!fl.required} disabled={fl.maps_to === "title"} onChange={(e) => setField(i, { required: e.target.checked })} />Required</label>
            {i > 0 && <><button className="hw-icb sm" title="Move up" disabled={i === 1} onClick={() => move(i, -1)}><Icon name="up" size={13} /></button><button className="hw-icb sm" title="Move down" disabled={i === f.fields.length - 1} onClick={() => move(i, 1)}><Icon name="up" size={13} style={{ transform: "rotate(180deg)" }} /></button><button className="hw-icb sm" title="Remove" onClick={() => setF({ ...f, fields: f.fields.filter((_, k) => k !== i) })}><Icon name="x" size={13} /></button></>}
          </div>
          {sel && <input className="hw-input" style={{ marginTop: 6 }} placeholder="Choices, separated by commas" defaultValue={(fl.options || []).join(", ")} onBlur={(e) => setField(i, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />}
        </div>); })}
      <button className="hw-btn sm" onClick={add.toggle}><Icon name="plus" size={13} />Add a question</button>
      {add.open && <Popover anchor={add.anchor} onClose={add.close} width={220}>{FORM_TYPES.map(([k, l]) => <MenuItem key={k} onClick={() => { setF({ ...f, fields: [...f.fields, { id: rid("f_"), label: l, maps_to: k, required: false, ...(k.endsWith("_select") ? { options: [] } : null) }] }); add.close(); }}>{l}</MenuItem>)}</Popover>}
      <div className="hw-eyebrow" style={{ margin: "18px 0 8px" }}>Each answer becomes a task</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Pick value={f.target_section_id || null} options={[{ value: null, label: "First section" }, ...sections.map((s) => ({ value: s.id, label: s.name }))]} onPick={(v) => setF({ ...f, target_section_id: v || "" })} />
        <Pick value={f.default_assignee_id || null} searchable options={personOptions(people, "No default assignee")} onPick={(v) => setF({ ...f, default_assignee_id: v || "" })} />
        <Pick value={f.default_priority || "none"} options={PRIORITY_ORDER.map((k) => ({ value: k, label: k === "none" ? "No default priority" : PRIORITY[k].label + " priority", icon: <span className="hw-dot" style={tone(PRIORITY[k].tone)} /> }))} onPick={(v) => setF({ ...f, default_priority: v })} />
      </div>
    </Modal>
  );
}

function FormFill({ store, pid, sections, form, onClose, onDone }) {
  const [v, setV] = useState(() => Object.fromEntries((form.fields || []).map((f) => [f.id, f.maps_to === "multi_select" || f.maps_to === "attachments" ? [] : ""]))); const [busy, setBusy] = useState(false);
  const set = (id, val) => setV((x) => ({ ...x, [id]: val })); const people = store.assignable(pid);
  const missing = (form.fields || []).find((f) => f.required && (Array.isArray(v[f.id]) ? !v[f.id].length : !String(v[f.id] ?? "").trim()));
  const submit = async () => { if (missing || busy) return; setBusy(true); const t = await store.submitForm({ ...form, project_id: form.project_id || pid }, v); setBusy(false); if (t) onDone(t); };
  return (
    <Modal title={form.name} onClose={onClose} width={540} footer={<><span style={{ flex: 1, fontSize: 12, color: "var(--ink3)" }}>{missing ? `“${missing.label}” is required` : ""}</span><button className="hw-btn ghost" onClick={onClose}>Cancel</button><button className="hw-btn primary" disabled={!!missing || busy} onClick={submit}>Submit</button></>}>
      {form.description && <p style={{ margin: "0 0 14px", color: "var(--ink2)", lineHeight: 1.5 }}>{form.description}</p>}
      {(form.fields || []).map((f, i) => (
        <Field key={f.id} label={<>{f.label}{f.required && <span style={{ color: "var(--coral)" }}> *</span>}</>}>
          {f.maps_to === "description" || f.maps_to === "note_long" ? <textarea className="hw-input" rows={3} value={v[f.id]} onChange={(e) => set(f.id, e.target.value)} />
            : f.maps_to === "due_date" ? <input className="hw-input" type="date" style={{ width: 180 }} value={v[f.id]} onChange={(e) => set(f.id, e.target.value)} />
            : f.maps_to === "assignee" ? <Pick value={v[f.id] || null} searchable options={personOptions(people, "No one")} onPick={(x) => set(f.id, x || "")} />
            : f.maps_to === "priority" ? <Pick value={v[f.id] || null} options={priorityOptions} placeholder="Pick a priority" onPick={(x) => set(f.id, x)} />
            : f.maps_to === "section" ? <Pick value={v[f.id] || null} options={sections.map((s) => ({ value: s.id, label: s.name }))} placeholder="Pick a section" onPick={(x) => set(f.id, x)} />
            : f.maps_to === "single_select" ? <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{(f.options || []).map((o) => <button key={o} type="button" className={"hw-opt" + (v[f.id] === o ? " on" : "")} onClick={() => set(f.id, v[f.id] === o ? "" : o)}>{o}</button>)}</div>
            : f.maps_to === "multi_select" ? <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{(f.options || []).map((o) => { const on = v[f.id].includes(o); return <button key={o} type="button" className={"hw-opt" + (on ? " on" : "")} onClick={() => set(f.id, on ? v[f.id].filter((x) => x !== o) : [...v[f.id], o])}>{on && <Icon name="check" size={13} />}{o}</button>; })}</div>
            : f.maps_to === "attachments" ? <><input type="file" multiple onChange={(e) => set(f.id, Array.from(e.target.files || []))} />{v[f.id].length > 0 && <span style={{ fontSize: 12, color: "var(--ink3)" }}>{plural(v[f.id].length, "file")} attached</span>}</>
            : <input className="hw-input" autoFocus={i === 0} value={v[f.id]} onChange={(e) => set(f.id, e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />}
        </Field>))}
    </Modal>
  );
}

function TaskTemplateEditor({ store, pid, sections, tmpl, onClose, onSave }) {
  const [ed, setEd] = useState(tmpl); const [sel, setSel] = useState("__main"); const [busy, setBusy] = useState(false);
  const td = ed.template_data; const people = store.assignable(pid); const isMain = sel === "__main"; const item = isMain ? td : td.subtasks.find((s) => s.id === sel) || td;
  const patch = (p) => setEd((x) => ({ ...x, template_data: isMain ? { ...x.template_data, ...p } : { ...x.template_data, subtasks: x.template_data.subtasks.map((s) => (s.id === sel ? { ...s, ...p } : s)) } }));
  const addSub = () => { const s = normItem({ title: "" }); setEd((x) => ({ ...x, template_data: { ...x.template_data, subtasks: [...x.template_data.subtasks, s] } })); setSel(s.id); };
  const removeSub = (id) => { setEd((x) => ({ ...x, template_data: { ...x.template_data, subtasks: x.template_data.subtasks.filter((s) => s.id !== id) } })); setSel("__main"); };
  const others = [{ value: "__main", label: td.title || "Main task" }, ...td.subtasks.map((s) => ({ value: s.id, label: s.title || "Untitled subtask" }))].filter((o) => o.value !== sel);
  const num = (k) => <input className="hw-input hw-num" type="number" min={0} style={{ width: 90 }} placeholder="–" value={item[k] ?? ""} onChange={(e) => patch({ [k]: e.target.value === "" ? "" : Number(e.target.value) })} />;
  return (
    <Modal title={ed.id ? "Edit task template" : "New task template"} onClose={onClose} width={780} footer={<><button className="hw-btn ghost" onClick={onClose}>Cancel</button><button className="hw-btn primary" disabled={!ed.name.trim() || busy} onClick={async () => { setBusy(true); await onSave(ed); setBusy(false); }}>Save template</button></>}>
      <Field label="Template name"><input className="hw-input" autoFocus value={ed.name} placeholder="e.g. New SKU checklist" onChange={(e) => setEd({ ...ed, name: e.target.value })} /></Field>
      <div className="hw-two">
        <div className="hw-items">
          <button className={"hw-it" + (isMain ? " on" : "")} onClick={() => setSel("__main")}><Icon name="check" size={14} /><span className="hw-trunc" style={{ flex: 1 }}>{td.title || "Main task"}</span></button>
          {td.subtasks.map((s) => <button key={s.id} className={"hw-it" + (sel === s.id ? " on" : "")} style={{ paddingLeft: 22 }} onClick={() => setSel(s.id)}><Icon name="sub" size={13} /><span className="hw-trunc" style={{ flex: 1 }}>{s.title || "Untitled subtask"}</span><span onClick={(e) => { e.stopPropagation(); removeSub(s.id); }} style={{ display: "inline-flex", opacity: 0.6 }} title="Remove"><Icon name="x" size={13} /></span></button>)}
          <button className="hw-btn ghost sm" style={{ marginTop: 6, alignSelf: "flex-start" }} onClick={addSub}><Icon name="plus" size={13} />Add subtask</button>
        </div>
        <div key={sel} style={{ minWidth: 0 }}>
          <Field label={isMain ? "Task name" : "Subtask name"}><input className="hw-input" autoFocus={!isMain} value={item.title} placeholder={isMain ? "Leave blank to use the template name" : "What needs doing?"} onChange={(e) => patch({ title: e.target.value })} /></Field>
          <Field label="Description"><textarea className="hw-input" rows={3} value={item.description} onChange={(e) => patch({ description: e.target.value })} /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))", gap: "0 12px" }}>
            <Field label="Assignee"><Pick block value={item.assignee_id || null} searchable options={personOptions(people, "No one")} onPick={(v) => patch({ assignee_id: v || "" })} /></Field>
            <Field label="Priority"><Pick block value={item.priority || "none"} options={priorityOptions} onPick={(v) => patch({ priority: v })} /></Field>
            {isMain && <Field label="Section"><Pick block value={td.section_id || null} options={[{ value: null, label: "First section" }, ...sections.map((s) => ({ value: s.id, label: s.name }))]} onPick={(v) => patch({ section_id: v || "" })} /></Field>}
            <Field label="Starts, days after it's created">{num("start_in_days")}</Field>
            <Field label="Due, days after it's created">{num("due_in_days")}</Field>
          </div>
          <Field label="Collaborators"><div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}><AvatarStack people={(item.collaborator_ids || []).map((id) => store.people[id]).filter(Boolean)} max={8} size={24} /><Pick sm multi value={item.collaborator_ids || []} searchable options={personOptions(people)} placeholder="Add people" onPick={(ids) => patch({ collaborator_ids: ids })} /></div></Field>
          {others.length > 0 && <Field label="Waits on"><Pick block multi value={item.depends_on || []} options={others} placeholder="Nothing. It can start right away." onPick={(ids) => patch({ depends_on: ids })} /></Field>}
        </div>
      </div>
    </Modal>
  );
}
