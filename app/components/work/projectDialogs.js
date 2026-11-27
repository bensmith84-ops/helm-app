"use client";
// Project-level dialogs: create / edit (with templates, team, goal and PLM links),
// the template manager and editor, save as template, duplicate, and members + guests.
import { useState, useMemo } from "react";
import { Icon, Popover, usePop, Avatar, AvatarStack, Chip, Modal, Field, PersonPicker, ColorPicker, DatePicker, Seg, Empty } from "./ui";
import { personName, fmtDate, plural } from "./model";
import { SWATCHES } from "./theme";
import { Pick, Switch, personOptions } from "./extras";

export const DIALOG_CSS = `
.hw-tgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px}
.hw-tcard{display:flex;flex-direction:column;gap:6px;text-align:left;border:1.5px solid var(--line);background:var(--surface);border-radius:12px;padding:12px;cursor:pointer;min-width:0;transition:border-color .12s,box-shadow .12s}
.hw-tcard:hover{border-color:var(--line2);box-shadow:var(--sh1)}
.hw-tcard.on{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.hw-tcard .ic{width:32px;height:32px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:17px;flex:none;background:color-mix(in srgb,var(--tc,var(--accent)) 16%,transparent)}
.hw-tcard p{margin:0;font-size:12px;color:var(--ink3);line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.hw-more{display:flex;align-items:center;gap:6px;border:none;background:transparent;color:var(--ink2);font-weight:550;font-size:12.5px;cursor:pointer;padding:4px 0;margin:2px 0 8px}
.hw-more:hover{color:var(--ink)}
.hw-g2{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:0 14px}
.hw-ck{display:flex;align-items:flex-start;gap:9px;padding:7px 0;cursor:pointer;font-size:13px;line-height:1.35}
.hw-ck input{margin:2px 0 0;flex:none;accent-color:var(--accent);width:15px;height:15px}
.hw-ck small{display:block;color:var(--ink3);font-size:12px}
.hw-tsec{border:1px solid var(--line);border-radius:12px;padding:10px 12px;margin-bottom:10px;background:var(--raise)}
.hw-trow{display:flex;align-items:center;gap:6px;min-height:32px}
.hw-trow input.hw-bare{flex:1;height:28px;border-radius:6px;padding:0 6px}
.hw-trow input.hw-bare:hover{background:var(--hover)}.hw-trow input.hw-bare:focus{background:var(--surface);box-shadow:0 0 0 2px var(--accent-soft)}
.hw-trow .x{opacity:0}.hw-trow:hover .x{opacity:1}
.hw-mrow{display:flex;align-items:center;gap:10px;padding:8px 4px;border-bottom:1px solid var(--line)}
.hw-mrow:last-child{border-bottom:none}
.hw-scope{display:flex;align-items:center;gap:12px;margin:6px 0 0 38px;padding:6px 10px;background:var(--sunken);border-radius:8px;font-size:12px;color:var(--ink2);flex-wrap:wrap}
.hw-scope label{display:inline-flex;align-items:center;gap:5px;cursor:pointer}
`;
const PRESETS = [["Simple", ["To do", "In progress", "Done"]], ["Launch", ["Planning", "Build", "Review", "Launch", "Done"]], ["Requests", ["New requests", "In progress", "Waiting on someone", "Done"]], ["Blank", []]];
const CkRow = ({ on, set, children, hint, disabled }) => <label className="hw-ck" style={disabled ? { opacity: 0.5 } : undefined}><input type="checkbox" checked={!!on} disabled={disabled} onChange={(e) => set(e.target.checked)} /><span>{children}{hint && <small>{hint}</small>}</span></label>;
const taskCount = (t) => (t.sections || []).reduce((n, s) => n + (s.tasks || []).length, 0);

// Team, goal and PLM product pickers, shared by create and edit.
function LinkFields({ store, f, set }) {
  const [team, setTeam] = useState(null); const krs = store.keyResults.filter((k) => k.objective_id === f.objective_id);
  const makeTeam = async () => { if (!team?.trim()) return; const t = await store.createTeam(team.trim(), f.color); if (t) { set({ team_id: t.id }); setTeam(null); } };
  return <div className="hw-g2">
    <Field label="Team">{team !== null
      ? <div style={{ display: "flex", gap: 6 }}><input className="hw-input" autoFocus placeholder="Team name" value={team} onChange={(e) => setTeam(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); makeTeam(); } if (e.key === "Escape") { e.stopPropagation(); setTeam(null); } }} /><button className="hw-btn" disabled={!team.trim()} onClick={makeTeam}>Create</button></div>
      : <div style={{ display: "flex", gap: 6 }}><Pick block value={f.team_id || null} searchable={store.teams.length > 7} options={[{ value: null, label: "No team" }, ...store.teams.map((t) => ({ value: t.id, label: t.name, icon: <Icon name="users" size={15} /> }))]} onPick={(v) => set({ team_id: v })} /><button className="hw-btn" title="New team" onClick={() => setTeam("")}><Icon name="plus" size={14} /></button></div>}</Field>
    <Field label="PLM product"><Pick block value={f.plm_program_id || null} searchable options={[{ value: null, label: "No product linked" }, ...store.plmPrograms.map((p) => ({ value: p.id, label: p.name + (p.category ? ` (${p.category})` : ""), icon: <Icon name="diamond" size={14} /> }))]} onPick={(v) => set({ plm_program_id: v })} /></Field>
    <Field label="Goal it supports"><Pick block value={f.objective_id || null} searchable options={[{ value: null, label: "No goal linked" }, ...store.objectives.map((o) => ({ value: o.id, label: o.title, icon: <Icon name="target" size={15} /> }))]} onPick={(v) => set({ objective_id: v, key_result_id: null })} width={340} /></Field>
    {f.objective_id && krs.length > 0 && <Field label="Key result"><Pick block value={f.key_result_id || null} searchable={krs.length > 7} options={[{ value: null, label: "The goal as a whole" }, ...krs.map((k) => ({ value: k.id, label: k.title }))]} onPick={(v) => set({ key_result_id: v })} width={340} /></Field>}
  </div>;
}

export function ProjectModal({ store, project, onClose, onDone, onManageTemplates, onImport }) {
  const edit = !!project;
  const [f, setF] = useState(() => edit
    ? { name: project.name, description: project.description || "", color: project.color || SWATCHES[0], visibility: project.visibility || "public", owner_id: project.owner_id, start_date: project.start_date, target_end_date: project.target_end_date, team_id: project.team_id || null, objective_id: project.objective_id || null, key_result_id: project.key_result_id || null, plm_program_id: project.plm_program_id || null }
    : { name: "", description: "", color: SWATCHES[Math.floor(Math.random() * 6)], visibility: "public", preset: 0, members: [], owner_id: store.uid, team_id: null, objective_id: null, key_result_id: null, plm_program_id: null });
  const [from, setFrom] = useState("blank"); const [tid, setTid] = useState(null); const [more, setMore] = useState(edit); const [busy, setBusy] = useState(false);
  const set = (p) => setF((x) => ({ ...x, ...p })); const dates = usePop(), owner = usePop(), mem = usePop();
  const tmpl = from === "template" ? store.templates.find((t) => t.id === tid) : null; const canSave = f.name.trim() && (from === "blank" || tmpl);
  const pickTmpl = (t) => { setTid(t.id); setF((x) => ({ ...x, name: x.name.trim() ? x.name : t.name, description: x.description.trim() ? x.description : t.description || "", color: t.color || x.color })); };
  const save = async () => {
    if (!canSave || busy) return; setBusy(true);
    if (edit) { await store.updateProject(project.id, { name: f.name.trim(), description: f.description, color: f.color, visibility: f.visibility, owner_id: f.owner_id || null, start_date: f.start_date || null, target_end_date: f.target_end_date || null, team_id: f.team_id || null, objective_id: f.objective_id || null, key_result_id: f.key_result_id || null, plm_program_id: f.plm_program_id || null }); onDone(project); return; }
    const p = tmpl ? await store.createFromTemplate(tmpl, f) : await store.createProject({ ...f, sections: PRESETS[f.preset][1] });
    setBusy(false); if (p) onDone(p);
  };
  const tools = !edit && <><button className="hw-btn ghost sm" onClick={onManageTemplates}><Icon name="gear" size={14} />Manage templates</button>{store.isAdmin && onImport && <button className="hw-btn ghost sm" onClick={onImport}><Icon name="download" size={14} />Import from Asana</button>}</>;
  return <Modal title={edit ? "Project details" : "New project"} onClose={onClose} width={from === "template" && !edit ? 720 : 560} footer={<>{tools}<span style={{ flex: 1 }} /><button className="hw-btn ghost" onClick={onClose}>Cancel</button><button className="hw-btn primary" disabled={!canSave || busy} onClick={save}>{edit ? "Save" : busy && tmpl ? "Creating…" : "Create project"}</button></>}>
    {!edit && <div style={{ marginBottom: 14 }}><Seg value={from} options={[["blank", "Start blank"], ["template", `From a template${store.templates.length ? " · " + store.templates.length : ""}`]]} onChange={setFrom} /></div>}
    {!edit && from === "template" && (store.templates.length
      ? <div className="hw-tgrid" style={{ marginBottom: 16 }}>{store.templates.map((t) => <button key={t.id} className={"hw-tcard" + (tid === t.id ? " on" : "")} style={{ "--tc": t.color }} onClick={() => pickTmpl(t)}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}><span className="ic">{t.icon || "📋"}</span><b className="hw-trunc" style={{ fontWeight: 650, flex: 1 }}>{t.name}</b>{tid === t.id && <Icon name="check" size={16} style={{ color: "var(--accent)" }} />}</div>
          {t.description && <p>{t.description}</p>}
          <span style={{ fontSize: 11.5, color: "var(--ink3)" }}>{plural((t.sections || []).length, "section")} · {plural(taskCount(t), "task")}{t.is_builtin ? " · built in" : ""}</span>
        </button>)}</div>
      : <Empty title="No templates yet" icon="copy">Save any project as a template from its menu, or build one under Manage templates.</Empty>)}
    {(from === "blank" || tmpl || edit) && <>
      <Field label="Name"><input className="hw-input" autoFocus value={f.name} placeholder="e.g. Dish Tabs launch" onChange={(e) => set({ name: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") save(); }} /></Field>
      <Field label="What is it for?"><textarea className="hw-input" rows={2} value={f.description} onChange={(e) => set({ description: e.target.value })} /></Field>
      <div className="hw-g2">
        <Field label="Colour"><ColorPicker value={f.color} onPick={(c) => set({ color: c })} /></Field>
        <Field label="Who can see it"><div><Seg value={f.visibility === "private" ? "private" : "public"} options={[["public", "Everyone"], ["private", "Members only"]]} onChange={(v) => set({ visibility: v })} /></div></Field>
      </div>
      {!edit && from === "blank" && <Field label="Start with sections"><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{PRESETS.map(([name, secs], i) => <button key={name} className={"hw-btn" + (f.preset === i ? " on" : "")} onClick={() => set({ preset: i })} title={secs.join(" → ") || "No sections"}>{name}</button>)}</div><span style={{ fontSize: 12, color: "var(--ink3)" }}>{PRESETS[f.preset][1].join("  →  ") || "Start empty and add your own."}</span></Field>}
      {!edit && <Field label="Members"><div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}><AvatarStack people={f.members.map((id) => store.people[id]).filter(Boolean)} max={8} size={26} /><button className="hw-btn sm" onClick={mem.toggle}><Icon name="plus" size={13} />Add people</button>{f.team_id && <span style={{ fontSize: 12, color: "var(--ink3)" }}>plus everyone on the team</span>}</div></Field>}
      {!edit && <button className="hw-more" onClick={() => setMore((v) => !v)}><Icon name={more ? "chevD" : "chevR"} size={14} />Owner, dates, team and links</button>}
      {more && <>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          <button className="hw-btn" onClick={owner.toggle}><Avatar person={store.people[f.owner_id]} id={f.owner_id} size={18} />{f.owner_id ? "Owner: " + personName(store.people[f.owner_id]) : "Set owner"}</button>
          <button className="hw-btn" onClick={dates.toggle}><Icon name="cal" size={15} />{f.target_end_date ? (f.start_date ? fmtDate(String(f.start_date).slice(0, 10), { relative: false }) + " – " : "Due ") + fmtDate(String(f.target_end_date).slice(0, 10), { relative: false }) : "Project dates"}</button>
        </div>
        <LinkFields store={store} f={f} set={set} />
      </>}
    </>}
    {owner.open && <Popover anchor={owner.anchor} onClose={owner.close} width={260}><PersonPicker people={store.peopleList.filter((p) => !p.is_external)} value={f.owner_id} allowNone={false} onPick={(v) => { set({ owner_id: v }); owner.close(); }} /></Popover>}
    {dates.open && <Popover anchor={dates.anchor} onClose={dates.close}><DatePicker start={f.start_date ? String(f.start_date).slice(0, 10) : null} due={f.target_end_date ? String(f.target_end_date).slice(0, 10) : null} onChange={(d) => set({ start_date: d.start_date, target_end_date: d.due_date })} onClose={dates.close} /></Popover>}
    {mem.open && <Popover anchor={mem.anchor} onClose={mem.close} width={260}><PersonPicker people={store.peopleList.filter((p) => !p.is_external && p.id !== store.uid)} multi allowNone={false} value={f.members} onPick={(v) => set({ members: f.members.includes(v) ? f.members.filter((x) => x !== v) : [...f.members, v] })} /></Popover>}
  </Modal>;
}

/* ───────── templates ───────── */
export function TemplateManager({ store, onClose, onEdit }) {
  const mine = store.templates.filter((t) => !t.is_builtin), built = store.templates.filter((t) => t.is_builtin);
  const row = (t) => <div key={t.id} className="hw-mrow">
    <span style={{ width: 32, height: 32, borderRadius: 9, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, background: `color-mix(in srgb, ${t.color || "var(--accent)"} 16%, transparent)`, flex: "none" }}>{t.icon || "📋"}</span>
    <div style={{ flex: 1, minWidth: 0 }}><div className="hw-trunc" style={{ fontWeight: 600 }}>{t.name}</div><div className="hw-trunc" style={{ fontSize: 12, color: "var(--ink3)" }}>{plural((t.sections || []).length, "section")} · {plural(taskCount(t), "task")}{t.description ? " · " + t.description : ""}</div></div>
    {t.is_builtin ? <Chip t="slate">Built in</Chip> : <><button className="hw-btn sm" onClick={() => onEdit(t)}>Edit</button><button className="hw-icb sm" title="Delete template" onClick={() => { if (window.confirm(`Delete the template "${t.name}"? Projects already made from it are not affected.`)) store.deleteTemplate(t); }}><Icon name="trash" size={14} /></button></>}
  </div>;
  return <Modal title="Project templates" onClose={onClose} width={620} footer={<><span style={{ flex: 1, fontSize: 12, color: "var(--ink3)" }}>Tip: turn any project into a template from its menu.</span><button className="hw-btn ghost" onClick={onClose}>Done</button><button className="hw-btn primary" onClick={() => onEdit(null)}><Icon name="plus" size={15} sw={2.2} />New template</button></>}>
    {mine.length > 0 && <><div className="hw-eyebrow" style={{ marginBottom: 4 }}>Yours · {mine.length}</div>{mine.map(row)}</>}
    {built.length > 0 && <><div className="hw-eyebrow" style={{ margin: mine.length ? "16px 0 4px" : "0 0 4px" }}>Built in · {built.length}</div>{built.map(row)}</>}
    {!store.templates.length && <Empty title="No templates yet" icon="copy">Build one here, or save a project you like as a template.</Empty>}
  </Modal>;
}

const rid = () => "tt_" + Math.random().toString(36).slice(2, 9);
const normTask = (t) => { if (typeof t === "string") return { id: rid(), title: t, assignee_id: "", subtasks: [], _rest: {} }; const { title, assignee_id, subtasks, ...rest } = t || {}; return { id: rid(), title: title || "", assignee_id: assignee_id || "", subtasks: (subtasks || []).map(normTask), _rest: rest }; };
const serTask = (t) => { const o = { ...(t._rest || {}), title: (t.title || "").trim() }; if (t.assignee_id) o.assignee_id = t.assignee_id; const subs = (t.subtasks || []).map(serTask).filter((x) => x.title); if (subs.length) o.subtasks = subs; return o; };
export function TemplateEditor({ store, tmpl, onClose }) {
  const [ed, setEd] = useState(() => tmpl
    ? { id: tmpl.id, name: tmpl.name, description: tmpl.description || "", icon: tmpl.icon || "📋", color: tmpl.color || SWATCHES[0], template_data: tmpl.template_data, sections: (tmpl.sections || []).map((s) => ({ id: rid(), name: s.name, is_complete_column: !!s.is_complete_column, wip_limit: s.wip_limit || null, tasks: (s.tasks || []).map(normTask) })) }
    : { id: null, name: "", description: "", icon: "📋", color: SWATCHES[0], sections: ["To do", "In progress", "Done"].map((n, i) => ({ id: rid(), name: n, is_complete_column: i === 2, wip_limit: null, tasks: [] })) });
  const [busy, setBusy] = useState(false); const [who, setWho] = useState(null); const people = store.peopleList.filter((p) => !p.is_external);
  const setSec = (sid, fn) => setEd((x) => ({ ...x, sections: x.sections.map((s) => (s.id === sid ? fn(s) : s)) }));
  // apply fn to one task anywhere in a section's tree; fn returning null removes it
  const mapTask = (list, id, fn) => list.flatMap((t) => { if (t.id === id) { const n = fn(t); return n ? [n] : []; } return [{ ...t, subtasks: mapTask(t.subtasks || [], id, fn) }]; });
  const setTask = (sid, id, fn) => setSec(sid, (s) => ({ ...s, tasks: mapTask(s.tasks, id, fn) }));
  const sections = ed.sections.map((s) => ({ name: s.name.trim(), is_complete_column: s.is_complete_column, wip_limit: s.wip_limit, tasks: s.tasks.map(serTask).filter((t) => t.title) })).filter((s) => s.name);
  const ok = ed.name.trim() && sections.length > 0;
  const save = async () => { if (!ok || busy) return; setBusy(true); const out = await store.saveTemplate({ ...ed, sections: sections.map((s, i) => ({ ...s, sort_order: i + 1 })) }); setBusy(false); if (out) { store.toast?.(`Template "${out.name}" saved`); onClose(); } };
  const taskRow = (sid, t, depth) => <div key={t.id}>
    <div className="hw-trow" style={{ paddingLeft: depth * 22 }}>
      <Icon name={depth ? "sub" : "check"} size={13} style={{ color: "var(--ink4)", flex: "none" }} />
      <input className="hw-bare" value={t.title} placeholder={depth ? "Subtask" : "Task"} autoFocus={!t.title} onChange={(e) => setTask(sid, t.id, (x) => ({ ...x, title: e.target.value }))} onKeyDown={(e) => { if (e.key === "Enter" && !depth) { e.preventDefault(); setSec(sid, (s) => { const i = s.tasks.findIndex((x) => x.id === t.id); const a = s.tasks.slice(); a.splice(i + 1, 0, normTask("")); return { ...s, tasks: a }; }); } }} />
      <button className="hw-icb sm" title={t.assignee_id ? personName(store.people[t.assignee_id]) : "Assign"} onClick={(e) => setWho({ sid, id: t.id, value: t.assignee_id, el: e.currentTarget })}><Avatar person={store.people[t.assignee_id]} id={t.assignee_id || null} size={20} /></button>
      {depth < 2 && <button className="hw-icb sm x" title="Add a subtask" onClick={() => setTask(sid, t.id, (x) => ({ ...x, subtasks: [...(x.subtasks || []), normTask("")] }))}><Icon name="sub" size={13} /></button>}
      <button className="hw-icb sm x" title="Remove" onClick={() => setTask(sid, t.id, () => null)}><Icon name="x" size={13} /></button>
    </div>
    {(t.subtasks || []).map((c) => taskRow(sid, c, depth + 1))}
  </div>;
  return <Modal title={ed.id ? "Edit template" : "New project template"} onClose={onClose} width={680} footer={<><span style={{ flex: 1, fontSize: 12, color: "var(--ink3)" }}>{ok ? `${plural(sections.length, "section")} · ${plural(sections.reduce((n, s) => n + s.tasks.length, 0), "task")}` : "Add a name and at least one section"}</span><button className="hw-btn ghost" onClick={onClose}>Cancel</button><button className="hw-btn primary" disabled={!ok || busy} onClick={save}>Save template</button></>}>
    <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
      <Field label="Icon"><input className="hw-input" style={{ width: 52, textAlign: "center", fontSize: 17 }} maxLength={4} value={ed.icon} onChange={(e) => setEd({ ...ed, icon: e.target.value })} /></Field>
      <div style={{ flex: 1 }}><Field label="Template name"><input className="hw-input" autoFocus value={ed.name} placeholder="e.g. New product launch" onChange={(e) => setEd({ ...ed, name: e.target.value })} /></Field></div>
    </div>
    <Field label="When to use it"><input className="hw-input" value={ed.description} placeholder="One line people will see when they pick a template" onChange={(e) => setEd({ ...ed, description: e.target.value })} /></Field>
    <Field label="Colour"><ColorPicker value={ed.color} onPick={(c) => setEd({ ...ed, color: c })} /></Field>
    <div className="hw-eyebrow" style={{ margin: "6px 0 8px" }}>Sections and tasks</div>
    {ed.sections.map((s, si) => <div key={s.id} className="hw-tsec">
      <div className="hw-trow">
        <input className="hw-bare" style={{ fontWeight: 650 }} value={s.name} placeholder="Section name" onChange={(e) => setSec(s.id, (x) => ({ ...x, name: e.target.value }))} />
        <label style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--ink3)", whiteSpace: "nowrap", cursor: "pointer" }} title="Tasks moved here are marked complete"><input type="checkbox" checked={s.is_complete_column} onChange={(e) => setSec(s.id, (x) => ({ ...x, is_complete_column: e.target.checked }))} />Done column</label>
        <button className="hw-icb sm" title="Move up" disabled={si === 0} onClick={() => setEd((x) => { const a = x.sections.slice(); [a[si - 1], a[si]] = [a[si], a[si - 1]]; return { ...x, sections: a }; })}><Icon name="up" size={13} /></button>
        <button className="hw-icb sm" title="Remove section" onClick={() => setEd((x) => ({ ...x, sections: x.sections.filter((y) => y.id !== s.id) }))}><Icon name="x" size={13} /></button>
      </div>
      {s.tasks.map((t) => taskRow(s.id, t, 0))}
      <button className="hw-btn ghost sm" style={{ marginTop: 2 }} onClick={() => setSec(s.id, (x) => ({ ...x, tasks: [...x.tasks, normTask("")] }))}><Icon name="plus" size={13} />Add task</button>
    </div>)}
    <button className="hw-btn sm" onClick={() => setEd((x) => ({ ...x, sections: [...x.sections, { id: rid(), name: "", is_complete_column: false, wip_limit: null, tasks: [] }] }))}><Icon name="plus" size={13} />Add section</button>
    {who && <Popover anchor={who.el} onClose={() => setWho(null)} width={260}><PersonPicker people={people} value={who.value || null} onPick={(v) => { setTask(who.sid, who.id, (x) => ({ ...x, assignee_id: v || "" })); setWho(null); }} /></Popover>}
  </Modal>;
}

export function SaveTemplateModal({ store, project, onClose }) {
  const [f, setF] = useState({ name: project.name, description: project.description || "", icon: "📋", color: project.color || SWATCHES[0], include: { subtasks: true, descriptions: true, assignees: false, tags: false, files: false } });
  const [busy, setBusy] = useState(false); const inc = (k) => (v) => setF((x) => ({ ...x, include: { ...x.include, [k]: v } }));
  const save = async () => { if (!f.name.trim() || busy) return; setBusy(true); const t = await store.saveAsTemplate(project, f); setBusy(false); if (t) { store.toast?.(`"${t.name}" saved as a template`); onClose(); } };
  return <Modal title="Save as a template" onClose={onClose} width={500} footer={<><button className="hw-btn ghost" onClick={onClose}>Cancel</button><button className="hw-btn primary" disabled={!f.name.trim() || busy} onClick={save}>{busy ? "Saving…" : "Save template"}</button></>}>
    <p style={{ margin: "0 0 12px", color: "var(--ink2)", lineHeight: 1.5 }}>Captures the sections and tasks of <b>{project.name}</b> as they are now. Dates, comments and progress are left out.</p>
    <div style={{ display: "flex", gap: 10 }}><Field label="Icon"><input className="hw-input" style={{ width: 52, textAlign: "center", fontSize: 17 }} maxLength={4} value={f.icon} onChange={(e) => setF({ ...f, icon: e.target.value })} /></Field><div style={{ flex: 1 }}><Field label="Template name"><input className="hw-input" autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field></div></div>
    <Field label="When to use it"><input className="hw-input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
    <div className="hw-eyebrow" style={{ margin: "6px 0 2px" }}>Also keep</div>
    <div className="hw-g2"><CkRow on={f.include.subtasks} set={inc("subtasks")}>Subtasks</CkRow><CkRow on={f.include.descriptions} set={inc("descriptions")}>Task descriptions</CkRow><CkRow on={f.include.assignees} set={inc("assignees")}>Assignees</CkRow><CkRow on={f.include.tags} set={inc("tags")}>Labels</CkRow><CkRow on={f.include.files} set={inc("files")}>Attached files</CkRow></div>
  </Modal>;
}

export function DuplicateModal({ store, project, onClose, onDone }) {
  const [name, setName] = useState(project.name + " (copy)"); const [busy, setBusy] = useState(false);
  const [o, setO] = useState({ tasks: true, subtasks: true, assignees: false, dates: false, fields: true, rules: true, members: true }); const on = (k) => (v) => setO((x) => ({ ...x, [k]: v }));
  const n = store.projectStats[project.id]?.total || 0;
  const go = async () => { if (!name.trim() || busy) return; setBusy(true); const p = await store.copyProject(project, { ...o, name: name.trim() }); setBusy(false); if (p) onDone(p); };
  return <Modal title="Duplicate project" onClose={busy ? undefined : onClose} width={500} footer={<><span style={{ flex: 1, fontSize: 12, color: "var(--ink3)" }}>{busy ? "Copying. This can take a moment for big projects." : ""}</span><button className="hw-btn ghost" disabled={busy} onClick={onClose}>Cancel</button><button className="hw-btn primary" disabled={!name.trim() || busy} onClick={go}>{busy ? "Copying…" : "Duplicate"}</button></>}>
    <Field label="Name of the copy"><input className="hw-input" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") go(); }} /></Field>
    <div className="hw-eyebrow" style={{ margin: "6px 0 2px" }}>Bring across</div>
    <CkRow on set={() => {}} disabled hint="Always copied">Sections and saved views</CkRow>
    <CkRow on={o.tasks} set={on("tasks")} hint={`${plural(n, "task")}, all reset to not started`}>Tasks</CkRow>
    <div className="hw-g2" style={{ paddingLeft: 24 }}><CkRow on={o.tasks && o.subtasks} set={on("subtasks")} disabled={!o.tasks}>Subtasks</CkRow><CkRow on={o.tasks && o.assignees} set={on("assignees")} disabled={!o.tasks}>Assignees</CkRow><CkRow on={o.tasks && o.dates} set={on("dates")} disabled={!o.tasks}>Start and due dates</CkRow></div>
    <CkRow on={o.fields} set={on("fields")}>Custom fields</CkRow>
    <CkRow on={o.rules} set={on("rules")}>Rules</CkRow>
    <CkRow on={o.members} set={on("members")} hint="Guests are not copied">Members</CkRow>
  </Modal>;
}

/* ───────── members and guests ───────── */
const ROLES = [["editor", "Editor"], ["commenter", "Commenter"], ["viewer", "Viewer"], ["member", "Member"]];
const SCOPES = [["tasks", "Tasks"], ["documents", "Docs"], ["messages", "Messages"]];
export function MembersModal({ store, project, onClose }) {
  const pid = project.id; const add = usePop(); const [inv, setInv] = useState(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const rows = useMemo(() => { const seen = new Set(); const out = []; if (project.owner_id) { seen.add(project.owner_id); out.push({ user_id: project.owner_id, role: "owner", _owner: true }); } store.members.filter((m) => m.project_id === pid).forEach((m) => { if (!seen.has(m.user_id)) { seen.add(m.user_id); out.push(m); } }); return out; }, [store.members, project.owner_id, pid]);
  const send = async () => { if (!inv.email.trim() || busy) return; setBusy(true); setErr(""); const r = await store.inviteGuest(pid, inv); setBusy(false); if (r.error) setErr(r.error); else { store.toast?.("Invite sent to " + inv.email.trim()); setInv(null); } };
  return <Modal title="Members" onClose={onClose} width={540} footer={<><span style={{ flex: 1, fontSize: 12, color: "var(--ink3)" }}>{project.visibility === "private" ? "Private: only these people can open it." : "Everyone at Earth Breeze can open it. Members get notified."}</span><button className="hw-btn primary" onClick={onClose}>Done</button></>}>
    <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
      <button className="hw-btn" onClick={add.toggle}><Icon name="plus" size={14} />Add people</button>
      <button className="hw-btn" onClick={() => { setErr(""); setInv(inv ? null : { email: "", name: "", role: "editor", scope: { tasks: true, documents: true, messages: false, module_data: false } }); }}><Icon name="send" size={14} />Invite a guest by email</button>
    </div>
    {inv && <div className="hw-tsec">
      <div className="hw-g2"><Field label="Email"><input className="hw-input" autoFocus type="email" placeholder="name@company.com" value={inv.email} onChange={(e) => setInv({ ...inv, email: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") send(); }} /></Field><Field label="Name (optional)"><input className="hw-input" value={inv.name} onChange={(e) => setInv({ ...inv, name: e.target.value })} /></Field></div>
      <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <Pick value={inv.role} options={ROLES.slice(0, 3).map(([v, l]) => ({ value: v, label: l }))} onPick={(v) => setInv({ ...inv, role: v })} width={170} />
        <span style={{ fontSize: 12.5, color: "var(--ink3)" }}>Can see</span>{SCOPES.map(([k, l]) => <label key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, cursor: "pointer" }}><input type="checkbox" checked={!!inv.scope[k]} onChange={(e) => setInv({ ...inv, scope: { ...inv.scope, [k]: e.target.checked } })} />{l}</label>)}
        <span style={{ flex: 1 }} /><button className="hw-btn primary" disabled={!/.+@.+\..+/.test(inv.email.trim()) || busy} onClick={send}>{busy ? "Sending…" : "Send invite"}</button>
      </div>
      <div style={{ fontSize: 12, color: err ? "var(--coral)" : "var(--ink3)", marginTop: 8 }}>{err || "Guests only see this project. They get an email with a link to sign in."}</div>
    </div>}
    <div>{rows.map((m) => { const p = store.people[m.user_id]; const guest = !!p?.is_external || !!m.invited_as_external; const scope = m.access_scope || { tasks: true }; return (
      <div key={m.user_id} style={{ borderBottom: "1px solid var(--line)" }}>
        <div className="hw-mrow" style={{ borderBottom: "none" }}>
          <Avatar person={p} id={m.user_id} size={28} />
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ display: "flex", alignItems: "center", gap: 6 }}><span className="hw-trunc" style={{ fontWeight: 600 }}>{personName(p) || "Unknown"}</span>{guest && <Chip t="amber">Guest</Chip>}</div><div className="hw-trunc" style={{ fontSize: 12, color: "var(--ink3)" }}>{p?.email}</div></div>
          {m._owner ? <Chip t="teal">Owner</Chip> : <>
            <Pick sm value={ROLES.some(([v]) => v === m.role) ? m.role : "member"} options={ROLES.map(([v, l]) => ({ value: v, label: l }))} onPick={(v) => store.updateMember(pid, m.user_id, { role: v })} width={170} />
            <button className="hw-icb sm" title="Remove from project" onClick={() => store.removeMember(pid, m.user_id)}><Icon name="x" size={14} /></button></>}
        </div>
        {guest && !m._owner && <div className="hw-scope" style={{ marginBottom: 8 }}><span className="hw-eyebrow">Can see</span>{SCOPES.map(([k, l]) => <label key={k}><input type="checkbox" checked={scope[k] === true} onChange={(e) => store.updateMember(pid, m.user_id, { access_scope: { ...scope, [k]: e.target.checked } })} />{l}</label>)}</div>}
      </div>); })}</div>
    {add.open && <Popover anchor={add.anchor} onClose={add.close} width={280}><PersonPicker people={store.peopleList.filter((p) => !p.is_external && !rows.some((m) => m.user_id === p.id))} allowNone={false} onPick={(id) => store.addMember(pid, id)} /></Popover>}
  </Modal>;
}
