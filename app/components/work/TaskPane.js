"use client";
// Task detail pane: every field, subtasks, dependencies, files, and the comment / activity feed.
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { STORAGE_BASE } from "../../lib/backend";
import RichTextEditor from "../RichTextEditor";
import { Icon, Popover, usePop, MenuItem, MenuSep, MenuLabel, Check, Avatar, Chip, OptionList, PersonPicker, Progress } from "./ui";
import { AssigneeCell, DueCell, PriorityCell, StatusCell, LabelsCell, FieldCell, ApprovalChip } from "./cells";
import { taskKind, isDone, approvalState, APPROVAL, STATUS, PRIORITY, personName, timeAgo, fmtDate, plural } from "./model";
import { tone } from "./theme";

export const PANE_CSS = `
.hw-pane{width:var(--pane-w,520px);flex:none;display:flex;flex-direction:column;min-height:0;background:var(--surface);border-left:1px solid var(--line);position:relative;animation:hw-slide .18s cubic-bezier(.2,.8,.2,1)}
@keyframes hw-slide{from{transform:translateX(18px);opacity:0}to{transform:none;opacity:1}}
.hw-pane.full{position:absolute;inset:0;width:auto;z-index:30;border-left:none}
.hw-pane.full .hw-pane-in{max-width:860px;margin:0 auto;width:100%}
.hw-pane-rz{position:absolute;left:-3px;top:0;bottom:0;width:6px;cursor:ew-resize;z-index:3}
.hw-pane-rz:hover{background:var(--accent-soft)}
.hw-pane-h{display:flex;align-items:center;gap:4px;padding:10px 12px 10px 18px;border-bottom:1px solid var(--line);flex:none}
.hw-pane-b{flex:1;min-height:0;overflow-y:auto}
.hw-pane-in{padding:16px 22px 28px}
.hw-pane-title{width:100%;border:1px solid transparent;border-radius:8px;background:transparent;outline:none;resize:none;font-weight:700;font-size:21px;line-height:1.25;padding:4px 8px;margin:0 -8px 8px;overflow:hidden;display:block}
.hw-pane-title:hover{border-color:var(--line2)}
.hw-pane-title:focus{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.hw-frow{display:grid;grid-template-columns:118px 1fr;align-items:center;min-height:34px;gap:8px}
.hw-frow>label{font-size:12.5px;color:var(--ink3);font-weight:500}
.hw-frow>div{min-width:0;display:flex;align-items:center;flex-wrap:wrap;gap:6px}
.hw-sec{margin-top:22px}
.hw-sec>h5{margin:0 0 8px;font-size:12.5px;font-weight:650;color:var(--ink2);display:flex;align-items:center;gap:8px}
.hw-sub{display:flex;align-items:center;gap:8px;height:36px;border-bottom:1px solid var(--line);cursor:pointer;padding:0 4px;border-radius:6px}
.hw-sub:hover{background:var(--raise)}
.hw-sub input{flex:1}
.hw-sub .hw-cell{width:auto;height:26px}
.hw-dep{display:inline-flex;align-items:center;gap:7px;height:26px;padding:0 4px 0 9px;border-radius:8px;background:var(--sunken);font-size:12.5px;max-width:100%;cursor:pointer}
.hw-dep button{opacity:.5}.hw-dep:hover button{opacity:1}
.hw-file{display:flex;align-items:center;gap:10px;padding:7px 9px;border:1px solid var(--line);border-radius:9px;text-decoration:none;color:inherit;min-width:0}
.hw-file:hover{border-color:var(--line2);background:var(--raise)}
.hw-feed{margin-top:8px}
.hw-cm{display:flex;gap:10px;padding:9px 0}
.hw-cm .bd{flex:1;min-width:0}
.hw-cm .hd{display:flex;align-items:baseline;gap:8px;font-size:12.5px}
.hw-cm .hd b{font-weight:650;font-size:13px}
.hw-cm .tx{white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.5;margin-top:1px}
.hw-cm .tx a{color:var(--accent-ink)}
.hw-cm .acts{opacity:0;display:flex;gap:2px;margin-left:auto}
.hw-cm:hover .acts{opacity:1}
.hw-act{display:flex;gap:10px;align-items:center;padding:4px 0;font-size:12.5px;color:var(--ink3)}
.hw-rx{display:inline-flex;align-items:center;gap:4px;height:22px;padding:0 7px;border-radius:11px;border:1px solid var(--line2);background:transparent;cursor:pointer;font-size:12px}
.hw-rx.me{background:var(--accent-soft);border-color:transparent;color:var(--accent-ink)}
.hw-composer{border-top:1px solid var(--line);padding:12px 18px 14px;background:var(--raise);flex:none;display:flex;gap:10px}
.hw-composer .box{flex:1;border:1px solid var(--line2);border-radius:10px;background:var(--surface);padding:8px 10px 6px;transition:border-color .12s,box-shadow .12s}
.hw-composer .box:focus-within{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.hw-composer textarea{resize:none;line-height:1.45;max-height:160px}
.hw-approve{display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:10px;background:var(--c-soft);margin-bottom:12px;flex-wrap:wrap}
`;
const RTE = { text: "var(--ink)", text2: "var(--ink2)", text3: "var(--ink3)", surface2: "var(--surface)", surface3: "var(--hover)", border: "var(--line2)", accent: "var(--accent)" };
const fileUrl = (p) => (p && /^https?:\/\//.test(p) ? p : `${STORAGE_BASE}/storage/v1/object/public/attachments/${p}`);
const fmtSize = (b) => { if (!b) return ""; const u = ["B", "KB", "MB", "GB"]; const i = Math.floor(Math.log(b) / Math.log(1024)); return (b / Math.pow(1024, i)).toFixed(i ? 1 : 0) + " " + u[i]; };
const linkify = (text) => String(text || "").split(/(https?:\/\/[^\s]+|@[A-Z][\w'-]+(?: [A-Z][\w'-]+)?)/g).map((part, i) => /^https?:\/\//.test(part) ? <a key={i} href={part} target="_blank" rel="noopener noreferrer">{part}</a> : /^@[A-Z]/.test(part) ? <span key={i} style={{ color: "var(--accent-ink)", fontWeight: 550 }}>{part}</span> : part);
const ACT_LABEL = { status: "status", assignee_id: "assignee", due_date: "due date", section_id: "section", priority: "priority", approval_status: "approval" };

function TaskSearch({ store, exclude, onPick, placeholder }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => { const s = q.trim().toLowerCase(); if (s.length < 2) return []; const out = []; for (const t of store.tasks) { if (exclude.has(t.id) || !String(t.title || "").toLowerCase().includes(s)) continue; out.push(t); if (out.length >= 30) break; } return out; }, [q, store.tasks, exclude]);
  return <div><div className="hw-msearch"><Icon name="search" size={14} /><input className="hw-bare" autoFocus placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} /></div>
    {list.map((t) => <div key={t.id} className="hw-mi" onClick={() => onPick(t)}><Check done={isDone(t)} size={15} /><span className="hw-trunc" style={{ flex: 1 }}>{t.title}</span><span className="k hw-trunc" style={{ maxWidth: 110 }}>{store.projectsById[t.project_id]?.name}</span></div>)}
    {!list.length && <div style={{ padding: "8px 10px 10px", color: "var(--ink3)", fontSize: 12.5 }}>{q.trim().length < 2 ? "Type to search tasks" : "No tasks found"}</div>}</div>;
}

function Composer({ store, task, onSent }) {
  const [v, setV] = useState(""); const [mentions, setMentions] = useState([]); const [at, setAt] = useState(null); const ref = useRef(null); const fileRef = useRef(null);
  const people = store.assignable(task.project_id);
  const grow = () => { const el = ref.current; if (el) { el.style.height = "auto"; el.style.height = Math.min(160, el.scrollHeight) + "px"; } };
  const change = (e) => { const val = e.target.value; setV(val); const upto = val.slice(0, e.target.selectionStart); const m = /(?:^|\s)@([\w ]{0,24})$/.exec(upto); setAt(m ? { q: m[1].toLowerCase(), from: upto.length - m[1].length - 1 } : null); grow(); };
  const pick = (p) => { const name = personName(p); const next = v.slice(0, at.from) + "@" + name + " " + v.slice(ref.current.selectionStart); setV(next); setMentions((m) => [...m, { id: p.id, name }]); setAt(null); setTimeout(() => ref.current?.focus(), 0); };
  const send = async () => {
    const text = v.trim(); if (!text) return; setV(""); setAt(null); setTimeout(grow, 0);
    const ids = [...new Set(mentions.filter((m) => text.includes("@" + m.name)).map((m) => m.id))]; setMentions([]);
    const { data, error } = await store.db.from("comments").insert({ org_id: store.orgFor(task.project_id), entity_type: "task", entity_id: task.id, author_id: store.uid, content: text, mentions: ids.length ? ids : null }).select().single();
    if (error || !data) { setV(text); return; }
    onSent(data);
    const me = personName(store.people[store.uid]) || "Someone"; const body = text.length > 120 ? text.slice(0, 120) + "…" : text;
    ids.forEach((id) => store.notify(id, `${me} mentioned you in a comment`, body, task, "mention"));
  };
  const matches = at ? people.filter((p) => personName(p).toLowerCase().includes(at.q)).slice(0, 7) : [];
  return (
    <div className="hw-composer"><Avatar person={store.people[store.uid]} id={store.uid} size={28} />
      <div className="box">
        <textarea ref={ref} className="hw-bare" rows={1} placeholder="Add a comment… use @ to mention" value={v} onChange={change} onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send(); } if (e.key === "Enter" && at && matches[0]) { e.preventDefault(); pick(matches[0]); } }} />
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
          <button className="hw-icb sm" title="Attach a file" onClick={() => fileRef.current?.click()}><Icon name="clip" size={15} /></button>
          <input ref={fileRef} type="file" multiple hidden onChange={(e) => { [...e.target.files].forEach((f) => onSent(null, f)); e.target.value = ""; }} />
          <span style={{ flex: 1 }} /><span style={{ fontSize: 11, color: "var(--ink4)" }}>⌘ Enter to send</span>
          <button className="hw-btn primary sm" disabled={!v.trim()} onClick={send}>Comment</button>
        </div>
      </div>
      {at && matches.length > 0 && <Popover anchor={ref.current} onClose={() => setAt(null)} width={250}>{matches.map((p) => <div key={p.id} className="hw-mi" onMouseDown={(e) => { e.preventDefault(); pick(p); }}><Avatar person={p} size={20} /><span className="hw-trunc">{personName(p)}</span></div>)}</Popover>}
    </div>
  );
}

export default function TaskPane({ store, task, onClose, onOpen, width, setWidth }) {
  const { people, labels, labelsOfMap, fields, fieldValues, childrenOf, deps, tasksById, projectsById, sectionsOf, links } = store;
  const [full, setFull] = useState(false); const [title, setTitle] = useState(task.title || ""); const titleRef = useRef(null);
  const [comments, setComments] = useState([]); const [reactions, setReactions] = useState({}); const [files, setFiles] = useState([]); const [activity, setActivity] = useState([]); const [collabs, setCollabs] = useState([]);
  const [feed, setFeed] = useState("comments"); const [newSub, setNewSub] = useState(""); const [uploading, setUploading] = useState(0); const [editing, setEditing] = useState(null);
  const more = usePop(), depPop = usePop(), projPop = usePop(), collabPop = usePop(), rxPop = usePop(); const [depMode, setDepMode] = useState("blocked_by"); const [rxFor, setRxFor] = useState(null);
  const kind = taskKind(task), done = isDone(task); const project = projectsById[task.project_id]; const parent = task.parent_task_id ? tasksById.get(task.parent_task_id) : null;
  const subs = childrenOf.get(task.id) || NONE; const projFields = useMemo(() => fields.filter((f) => f.project_id === task.project_id), [fields, task.project_id]);
  const sections = sectionsOf.get(task.project_id) || NONE; const assignOptions = useMemo(() => store.assignable(task.project_id), [store.assignable, task.project_id]);
  const upd = useCallback((patch) => store.updateTask(task.id, patch), [store.updateTask, task.id]);

  useEffect(() => { setTitle(task.title || ""); }, [task.id, task.title]);
  useEffect(() => { const el = titleRef.current; if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } }, [title, width, full, task.id]);
  useEffect(() => {
    let alive = true; setComments([]); setFiles([]); setActivity([]); setReactions({}); setCollabs([]); setFeed("comments"); store.loadSubtasks(task.id);
    if (String(task.id).startsWith("tmp-")) return;
    const db = store.db;
    Promise.all([
      db.from("comments").select("*").eq("entity_type", "task").eq("entity_id", task.id).is("deleted_at", null).order("created_at", { ascending: true }),
      db.from("attachments").select("*").eq("entity_type", "task").eq("entity_id", task.id),
      db.from("task_activity").select("*").eq("task_id", task.id).order("created_at", { ascending: false }).limit(60),
      db.from("task_assignees").select("user_id,role").eq("task_id", task.id).eq("role", "collaborator"),
    ]).then(async ([c, a, act, col]) => {
      if (!alive) return; setComments(c.data || []); setFiles(a.data || []); setActivity(act.data || []); setCollabs((col.data || []).map((x) => x.user_id));
      const ids = (c.data || []).map((x) => x.id); if (!ids.length) return;
      const { data: rx } = await db.from("comment_reactions").select("id,comment_id,user_id,emoji").in("comment_id", ids);
      if (alive) { const m = {}; (rx || []).forEach((r) => { (m[r.comment_id] = m[r.comment_id] || []).push(r); }); setReactions(m); }
    });
    return () => { alive = false; };
  }, [task.id]);

  const upload = async (file) => {
    setUploading((n) => n + 1); const org = store.orgFor(task.project_id); const path = `${org}/${task.id}/${Date.now()}_${file.name}`;
    const { error } = await store.db.storage.from("attachments").upload(path, file);
    if (!error) { const { data } = await store.db.from("attachments").insert({ org_id: org, entity_type: "task", entity_id: task.id, filename: file.name, file_path: path, file_size: file.size, mime_type: file.type, uploaded_by: store.uid }).select().single(); if (data) setFiles((p) => [...p, data]); }
    setUploading((n) => n - 1);
  };
  const removeFile = async (f) => { setFiles((p) => p.filter((x) => x.id !== f.id)); await store.db.storage.from("attachments").remove([f.file_path]); await store.db.from("attachments").delete().eq("id", f.id); };
  const react = async (cid, emoji) => {
    const mine = (reactions[cid] || []).find((r) => r.emoji === emoji && r.user_id === store.uid);
    if (mine) { setReactions((m) => ({ ...m, [cid]: (m[cid] || []).filter((r) => r.id !== mine.id) })); await store.db.from("comment_reactions").delete().eq("id", mine.id); }
    else { const tmp = { id: "tmp" + Date.now(), comment_id: cid, user_id: store.uid, emoji }; setReactions((m) => ({ ...m, [cid]: [...(m[cid] || []), tmp] })); const { data } = await store.db.from("comment_reactions").insert({ org_id: store.orgFor(task.project_id), comment_id: cid, user_id: store.uid, emoji }).select().single(); if (data) setReactions((m) => ({ ...m, [cid]: (m[cid] || []).map((r) => (r.id === tmp.id ? data : r)) })); }
  };
  const saveComment = async (c, text) => { setEditing(null); if (!text.trim() || text === c.content) return; setComments((p) => p.map((x) => (x.id === c.id ? { ...x, content: text.trim(), is_edited: true } : x))); await store.db.from("comments").update({ content: text.trim(), is_edited: true, edited_at: new Date().toISOString() }).eq("id", c.id); };
  const deleteComment = async (c) => { setComments((p) => p.filter((x) => x.id !== c.id)); await store.db.from("comments").update({ deleted_at: new Date().toISOString() }).eq("id", c.id); };
  const toggleCollab = async (uid) => {
    if (collabs.includes(uid)) { setCollabs((p) => p.filter((x) => x !== uid)); await store.db.from("task_assignees").delete().eq("task_id", task.id).eq("user_id", uid).eq("role", "collaborator"); }
    else { setCollabs((p) => [...p, uid]); await store.db.from("task_assignees").insert({ task_id: task.id, user_id: uid, role: "collaborator", org_id: store.orgFor(task.project_id) }); store.notify(uid, `${personName(people[store.uid])} added you as a collaborator`, task.title, task); }
  };
  const setKind = (k) => upd({ approval_status: k === "approval" ? "pending" : "none", metadata: { ...(task.metadata || {}), is_milestone: k === "milestone", approval: undefined } });
  const decide = (s) => {
    if (s === "changes") upd({ approval_status: "pending", metadata: { ...(task.metadata || {}), approval: "changes" } });
    else upd({ approval_status: s, status: s === "approved" || s === "rejected" ? "done" : "todo", metadata: { ...(task.metadata || {}), approval: undefined } });
    if (task.created_by) store.notify(task.created_by, `${personName(people[store.uid])} ${s === "approved" ? "approved" : s === "rejected" ? "rejected" : "requested changes on"} "${task.title}"`, APPROVAL[s]?.label || "", task, "assignment");
  };
  const startResize = (e) => { e.preventDefault(); const x0 = e.clientX, w0 = width; const mv = (ev) => setWidth(Math.max(400, Math.min(900, w0 + x0 - ev.clientX))); const up = () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); }; window.addEventListener("mousemove", mv); window.addEventListener("mouseup", up); };

  const blockedBy = deps.filter((d) => d.successor_id === task.id), blocking = deps.filter((d) => d.predecessor_id === task.id);
  const exclude = useMemo(() => new Set([task.id, ...blockedBy.map((d) => d.predecessor_id), ...blocking.map((d) => d.successor_id)]), [task.id, deps]);
  const myLinks = links.filter((l) => l.task_id === task.id); const ap = approvalState(task); const subDone = subs.filter(isDone).length;
  const openBlockers = blockedBy.filter((d) => { const t = tasksById.get(d.predecessor_id); return t && !isDone(t); }).length;
  const depChip = (d, otherId) => { const t = tasksById.get(otherId); return <span key={d.id} className="hw-dep" onClick={() => t && onOpen(t)}><Check done={t ? isDone(t) : false} size={14} /><span className="hw-trunc" style={{ maxWidth: 240, textDecoration: t && isDone(t) ? "line-through" : "none" }}>{t?.title || "A task you can't see"}</span><button className="hw-icb sm" onClick={(e) => { e.stopPropagation(); store.removeDep(d.id); }}><Icon name="x" size={13} /></button></span>; };
  const actText = (a) => { const f = ACT_LABEL[a.field] || a.field; const val = (v) => a.field === "assignee_id" ? (v ? personName(people[v]) || "someone" : "no one") : a.field === "section_id" ? (sections.find((s) => s.id === v)?.name || "no section") : a.field === "status" ? (STATUS[v]?.label || v) : a.field === "priority" ? (PRIORITY[v]?.label || v) : a.field === "due_date" ? (v ? fmtDate(String(v).slice(0, 10), { relative: false }) : "none") : v; return a.field ? <>changed {f} to <b style={{ color: "var(--ink2)", fontWeight: 550 }}>{val(a.new_value)}</b></> : a.action; };

  return (
    <div className={"hw-pane" + (full ? " full" : "")} style={{ "--pane-w": width + "px" }}>
      {!full && <div className="hw-pane-rz" onMouseDown={startResize} />}
      <div className="hw-pane-h">
        <button className={"hw-btn sm" + (done ? " on" : "")} style={done ? tone("green") && { background: "var(--green-soft)", color: "var(--green)", borderColor: "transparent" } : undefined} onClick={() => store.completeTask(task)}><Icon name="check" size={14} sw={2.2} />{done ? "Completed" : kind === "milestone" ? "Mark milestone reached" : "Mark complete"}</button>
        <span style={{ flex: 1 }} />
        <button className="hw-icb" title="Copy link" onClick={() => navigator.clipboard?.writeText(window.location.origin + "/projects/t/" + task.id)}><Icon name="link" /></button>
        <button className="hw-icb" title={full ? "Dock to the side" : "Open full size"} onClick={() => setFull((f) => !f)}><Icon name={full ? "side" : "expand"} /></button>
        <button className="hw-icb" onClick={more.toggle}><Icon name="more" /></button>
        <button className="hw-icb" title="Close (Esc)" onClick={onClose}><Icon name="x" /></button>
      </div>
      <div className="hw-pane-b hw-scroll"><div className="hw-pane-in">
        {parent && <button className="hw-btn ghost sm" style={{ marginLeft: -8, marginBottom: 4, color: "var(--ink3)" }} onClick={() => onOpen(parent)}><Icon name="sub" size={13} style={{ transform: "scaleX(-1) rotate(90deg)" }} /><span className="hw-trunc" style={{ maxWidth: 360 }}>{parent.title}</span></button>}
        {kind === "approval" && <div className="hw-approve" style={tone(APPROVAL[ap]?.tone || "amber")}>
          <ApprovalChip task={task} /><span style={{ flex: 1 }} />
          <button className="hw-btn sm" onClick={() => decide("approved")}><Icon name="thumb" size={14} />Approve</button>
          <button className="hw-btn sm" onClick={() => decide("changes")}>Request changes</button>
          <button className="hw-btn sm danger" onClick={() => decide("rejected")}>Reject</button>
        </div>}
        <textarea ref={titleRef} className="hw-pane-title" rows={1} value={title} placeholder="Write a task name" onChange={(e) => setTitle(e.target.value.replace(/\n/g, ""))} onBlur={() => { if (title.trim() && title.trim() !== task.title) upd({ title: title.trim() }); else setTitle(task.title || ""); }} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); e.currentTarget.blur(); } }} />
        {openBlockers > 0 && !done && <div style={{ marginBottom: 8 }}><Chip t="amber"><Icon name="dep" size={12} /> Blocked by {plural(openBlockers, "open task")}</Chip></div>}

        <div className="hw-frow"><label>Assignee</label><div><AssigneeCell task={task} people={people} options={assignOptions} onChange={upd} boxed /></div></div>
        <div className="hw-frow"><label>Due date</label><div><DueCell task={task} onChange={upd} boxed showRecur /></div></div>
        {!task.parent_task_id && <div className="hw-frow" style={{ alignItems: "start" }}><label style={{ paddingTop: 8 }}>Projects</label><div style={{ paddingTop: 3 }}>
          {project && <span className="hw-dep" style={{ cursor: "default", paddingRight: 9 }}><span className="hw-dot" style={{ background: project.color }} /><span className="hw-trunc" style={{ maxWidth: 170 }}>{project.name}</span><select className="hw-bare" style={{ width: "auto", maxWidth: 150, color: "var(--ink2)", cursor: "pointer" }} value={task.section_id || ""} onChange={(e) => upd({ section_id: e.target.value || null })}><option value="">No section</option>{sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></span>}
          {myLinks.map((l) => { const p = projectsById[l.project_id]; return p ? <span key={l.id} className="hw-dep" style={{ cursor: "default" }}><span className="hw-dot" style={{ background: p.color }} /><span className="hw-trunc" style={{ maxWidth: 170 }}>{p.name}</span><button className="hw-icb sm" onClick={() => store.removeLink(l.id)}><Icon name="x" size={13} /></button></span> : null; })}
          {!store.external && <button className="hw-btn ghost sm" onClick={projPop.toggle}><Icon name="plus" size={13} />{project ? "Add to another" : "Add to project"}</button>}
        </div></div>}
        <div className="hw-frow" style={{ alignItems: "start" }}><label style={{ paddingTop: 8 }}>Dependencies</label><div style={{ paddingTop: 3 }}>
          {blockedBy.length > 0 && <span style={{ fontSize: 12, color: "var(--ink3)", width: "100%" }}>Blocked by</span>}{blockedBy.map((d) => depChip(d, d.predecessor_id))}
          {blocking.length > 0 && <span style={{ fontSize: 12, color: "var(--ink3)", width: "100%" }}>Blocking</span>}{blocking.map((d) => depChip(d, d.successor_id))}
          <button className="hw-btn ghost sm" onClick={(e) => { setDepMode("blocked_by"); depPop.toggle(e); }}><Icon name="plus" size={13} />Add dependency</button>
        </div></div>
        <div className="hw-frow"><label>Priority</label><div><PriorityCell task={task} onChange={upd} boxed /></div></div>
        <div className="hw-frow"><label>Status</label><div><StatusCell task={task} onChange={upd} boxed /></div></div>
        {!store.external && <div className="hw-frow"><label>Labels</label><div><LabelsCell task={task} labels={labels} ids={labelsOfMap.get(task.id) || NONE} onToggle={store.toggleLabel} onCreate={store.createLabel} boxed /></div></div>}
        <div className="hw-frow"><label>Est. hours</label><div style={{ maxWidth: 120 }}><FieldCell boxed field={{ field_type: "number" }} value={task.estimated_hours ?? ""} onChange={(v) => upd({ estimated_hours: v === "" ? null : Number(v) || 0 })} /></div></div>
        {projFields.map((f) => <div key={f.id} className="hw-frow"><label className="hw-trunc" title={f.name}>{f.name}</label><div><FieldCell boxed field={f} value={fieldValues[task.id]?.[f.id]} onChange={(v) => store.setFieldValue(task.id, f.id, v)} /></div></div>)}
        <div className="hw-frow"><label>Collaborators</label><div>
          <span className="hw-avs" style={{ paddingLeft: 2 }}>{collabs.map((id) => <Avatar key={id} person={people[id]} id={id} size={24} />)}</span>
          <button className="hw-btn ghost sm" onClick={collabPop.toggle}><Icon name="plus" size={13} />{collabs.length ? "" : "Add"}</button>
        </div></div>

        <div className="hw-sec"><h5>Description</h5><RichTextEditor key={task.id} value={task.description || ""} placeholder="What is this task about?" T={RTE} onChange={(html) => { if (html !== (task.description || "")) upd({ description: html }); }} /></div>

        <div className="hw-sec"><h5>Subtasks{subs.length > 0 && <><span className="hw-num" style={{ color: "var(--ink3)", fontWeight: 500 }}>{subDone}/{subs.length}</span><span style={{ flex: 1, maxWidth: 140 }}><Progress value={(subDone / subs.length) * 100} color="var(--green)" /></span></>}</h5>
          {subs.map((s) => <div key={s._k || s.id} className="hw-sub" onClick={() => onOpen(s)}>
            <Check done={isDone(s)} kind={taskKind(s)} size={17} onClick={() => store.completeTask(s)} />
            <span className="hw-trunc" style={{ flex: 1, color: isDone(s) ? "var(--ink3)" : undefined }}>{s.title}</span>
            <span onClick={(e) => e.stopPropagation()} style={{ display: "flex", alignItems: "center" }}><DueCell task={s} onChange={(p) => store.updateTask(s.id, p)} /><AssigneeCell task={s} people={people} options={assignOptions} onChange={(p) => store.updateTask(s.id, p)} iconOnly /></span>
            <Icon name="chevR" size={14} style={{ color: "var(--ink4)" }} />
          </div>)}
          <div className="hw-sub" style={{ cursor: "text", borderBottom: "none", color: "var(--ink3)" }}><Icon name="plus" size={15} /><input className="hw-bare" placeholder="Add subtask" value={newSub} onChange={(e) => setNewSub(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && newSub.trim()) { store.createTask({ project_id: task.project_id, section_id: task.section_id, parent_task_id: task.id, title: newSub.trim() }); setNewSub(""); } }} /></div>
        </div>

        {(files.length > 0 || uploading > 0) && <div className="hw-sec"><h5>Files</h5><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))", gap: 8 }}>
          {files.map((f) => <a key={f.id} className="hw-file" href={fileUrl(f.file_path)} target="_blank" rel="noopener noreferrer">
            {/^image\//.test(f.mime_type || "") ? <img src={fileUrl(f.file_path)} alt="" style={{ width: 34, height: 34, borderRadius: 6, objectFit: "cover", flex: "none" }} /> : <span style={{ width: 34, height: 34, borderRadius: 6, background: "var(--sunken)", display: "flex", alignItems: "center", justifyContent: "center", flex: "none", color: "var(--ink3)" }}><Icon name="note" /></span>}
            <span style={{ flex: 1, minWidth: 0 }}><span className="hw-trunc" style={{ display: "block", fontWeight: 500 }}>{f.filename}</span><span style={{ fontSize: 11.5, color: "var(--ink3)" }}>{fmtSize(f.file_size)}</span></span>
            <button className="hw-icb sm" onClick={(e) => { e.preventDefault(); removeFile(f); }}><Icon name="x" size={13} /></button></a>)}
          {uploading > 0 && <div className="hw-file" style={{ color: "var(--ink3)" }}>Uploading…</div>}
        </div></div>}

        <div className="hw-sec"><h5><div className="hw-seg"><button className={feed === "comments" ? "on" : ""} onClick={() => setFeed("comments")}>Comments{comments.length ? " · " + comments.length : ""}</button><button className={feed === "activity" ? "on" : ""} onClick={() => setFeed("activity")}>All activity</button></div></h5>
          <div className="hw-feed">
            <div className="hw-act"><Avatar person={people[task.created_by]} id={task.created_by} size={20} /><span><b style={{ color: "var(--ink2)", fontWeight: 550 }}>{personName(people[task.created_by]) || "Someone"}</b> created this task · {task.created_at ? timeAgo(task.created_at) : ""}</span></div>
            {feed === "activity" && activity.slice().reverse().map((a) => <div key={a.id} className="hw-act"><Avatar person={people[a.actor_id]} id={a.actor_id} size={20} /><span><b style={{ color: "var(--ink2)", fontWeight: 550 }}>{personName(people[a.actor_id]) || "Someone"}</b> {actText(a)} · {timeAgo(a.created_at)}</span></div>)}
            {comments.map((c) => { const rx = reactions[c.id] || []; const by = {}; rx.forEach((r) => { (by[r.emoji] = by[r.emoji] || []).push(r.user_id); }); return (
              <div key={c.id} className="hw-cm"><Avatar person={people[c.author_id]} id={c.author_id} size={28} />
                <div className="bd"><div className="hd"><b>{personName(people[c.author_id]) || "Someone"}</b><span style={{ color: "var(--ink3)" }}>{timeAgo(c.created_at)}{c.is_edited ? " · edited" : ""}</span>
                  <span className="acts"><button className="hw-icb sm" title="React" onClick={(e) => { setRxFor(c.id); rxPop.toggle(e); }}><Icon name="smile" size={14} /></button>{c.author_id === store.uid && <><button className="hw-icb sm" title="Edit" onClick={() => setEditing({ id: c.id, text: c.content })}><Icon name="note" size={14} /></button><button className="hw-icb sm" title="Delete" onClick={() => deleteComment(c)}><Icon name="trash" size={14} /></button></>}</span></div>
                  {editing?.id === c.id ? <textarea className="hw-input" autoFocus rows={3} value={editing.text} onChange={(e) => setEditing({ id: c.id, text: e.target.value })} onBlur={() => saveComment(c, editing.text)} onKeyDown={(e) => { if (e.key === "Escape") setEditing(null); if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) e.currentTarget.blur(); }} /> : <div className="tx">{linkify(c.content)}</div>}
                  {Object.keys(by).length > 0 && <div style={{ display: "flex", gap: 5, marginTop: 5, flexWrap: "wrap" }}>{Object.entries(by).map(([em, us]) => <button key={em} className={"hw-rx" + (us.includes(store.uid) ? " me" : "")} title={us.map((u) => personName(people[u])).join(", ")} onClick={() => react(c.id, em)}>{em}<span className="hw-num">{us.length}</span></button>)}</div>}
                </div></div>); })}
          </div>
        </div>
      </div></div>
      <Composer store={store} task={task} onSent={(c, file) => { if (file) upload(file); else if (c) setComments((p) => [...p, c]); }} />

      {more.open && <Popover anchor={more.anchor} onClose={more.close} align="end" width={230}>
        <MenuLabel>Type</MenuLabel>
        <MenuItem icon="check" sel={kind === "task"} onClick={() => { setKind("task"); more.close(); }}>Task</MenuItem>
        <MenuItem icon="diamond" sel={kind === "milestone"} onClick={() => { setKind("milestone"); more.close(); }}>Milestone</MenuItem>
        <MenuItem icon="thumb" sel={kind === "approval"} onClick={() => { setKind("approval"); more.close(); }}>Approval</MenuItem>
        <MenuSep /><MenuItem icon="copy" onClick={() => { store.duplicateTask(task); more.close(); }}>Duplicate</MenuItem>
        <MenuItem icon="trash" danger onClick={() => { store.deleteTasks([task.id]); more.close(); onClose(); }}>Delete task</MenuItem>
      </Popover>}
      {depPop.open && <Popover anchor={depPop.anchor} onClose={depPop.close} width={340}>
        <div style={{ padding: "4px 4px 6px" }}><div className="hw-seg"><button className={depMode === "blocked_by" ? "on" : ""} onClick={() => setDepMode("blocked_by")}>Blocked by</button><button className={depMode === "blocking" ? "on" : ""} onClick={() => setDepMode("blocking")}>Blocking</button></div></div>
        <TaskSearch store={store} exclude={exclude} placeholder={depMode === "blocked_by" ? "Which task must finish first?" : "Which task is waiting on this?"} onPick={(t) => { if (depMode === "blocked_by") store.addDep(t.id, task.id); else store.addDep(task.id, t.id); depPop.close(); }} />
      </Popover>}
      {projPop.open && <Popover anchor={projPop.anchor} onClose={projPop.close} width={280}><OptionList searchable placeholder="Search projects…" options={store.projects.filter((p) => p.status !== "archived" && p.id !== task.project_id && !myLinks.some((l) => l.project_id === p.id)).map((p) => ({ value: p.id, label: p.name, dot: p.color }))} onPick={(pid) => { if (!task.project_id) upd({ project_id: pid, section_id: (sectionsOf.get(pid) || [])[0]?.id || null }); else store.addLink(task.id, pid, (sectionsOf.get(pid) || [])[0]?.id || null); projPop.close(); }} /></Popover>}
      {collabPop.open && <Popover anchor={collabPop.anchor} onClose={collabPop.close} width={260}><PersonPicker people={assignOptions} multi allowNone={false} value={collabs} onPick={toggleCollab} /></Popover>}
      {rxPop.open && <Popover anchor={rxPop.anchor} onClose={rxPop.close}><div style={{ display: "flex", gap: 2, padding: 2 }}>{["👍", "❤️", "🎉", "👀", "🙏", "✅", "😂"].map((em) => <button key={em} className="hw-icb" style={{ fontSize: 16 }} onClick={() => { react(rxFor, em); rxPop.close(); }}>{em}</button>)}</div></Popover>}
    </div>
  );
}
const NONE = [];
