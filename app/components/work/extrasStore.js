"use client";
// Second half of the Projects data layer: rules, project docs, task templates and
// forms, project templates, duplicating a project, guests, and the goal / PLM /
// team links. Wraps the core store and returns one merged object.
import { useState, useEffect, useCallback, useRef } from "react";
import { invokeFunction } from "../../lib/invokeFunction";
import { personName, today, addDays, isDone } from "./model";

const nowIso = () => new Date().toISOString();
const GAP = 1024;
const relDate = (v) => { if (v === "" || v == null || isNaN(Number(v))) return null; const d = new Date(); d.setDate(d.getDate() + Number(v)); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
// Run `fn` over `items`, a few at a time, keeping results in order.
async function pool(items, size, fn) { const out = new Array(items.length); let i = 0; const worker = async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k], k); } }; await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker)); return out; }
const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "team";

export function useWorkExtras(core) {
  const { db, uid, orgId, external, loading } = core; const S = core._set;
  const [objectives, setObjectives] = useState([]); const [keyResults, setKeyResults] = useState([]); const [plmPrograms, setPlmPrograms] = useState([]);
  const [templates, setTemplates] = useState([]); const [docs, setDocs] = useState([]);
  const C = useRef(core); C.current = core;
  const say = (m, a) => C.current.toast?.(m, a);

  useEffect(() => {
    if (loading || external || !orgId) return; let on = true;
    const soft = (p) => p.then((r) => r.data || [], () => []);
    Promise.all([
      soft(db.from("objectives").select("id,title").eq("org_id", orgId).is("deleted_at", null).order("title")),
      soft(db.from("key_results").select("id,title,objective_id").eq("org_id", orgId).is("deleted_at", null).order("title")),
      soft(db.from("plm_programs").select("id,name,category,current_stage").eq("org_id", orgId).is("deleted_at", null).order("name")),
      soft(db.from("project_templates").select("*").order("is_builtin", { ascending: false }).order("name")),
      soft(db.from("documents").select("id,title,emoji,updated_at,project_id,status").eq("org_id", orgId).is("deleted_at", null).order("updated_at", { ascending: false })),
    ]).then(([ob, kr, plm, tp, dc]) => { if (!on) return; setObjectives(ob); setKeyResults(kr); setPlmPrograms(plm); setTemplates(tp); setDocs(dc); });
    return () => { on = false; };
  }, [db, orgId, external, loading]);

  // "Due date is coming up" rules have no server job behind them, so sweep while Projects is open:
  // once per rule, task and due date (rule_executions is the memory), at most every 30 minutes.
  const swept = useRef(0); const ruleCount = core.rules.length;
  useEffect(() => {
    if (loading || external || !orgId) return;
    const sweep = async () => {
      if (Date.now() - swept.current < 30 * 60 * 1000 || (typeof document !== "undefined" && document.hidden)) return;
      const cur = C.current; const due = cur.rules.filter((r) => r.is_active && r.trigger_type === "due_date_approaching" && r.trigger_config?.days_before !== "" && Number(r.trigger_config?.days_before) >= 0);
      if (!due.length) return; swept.current = Date.now(); const t0 = today();
      for (const rule of due) {
        const lim = addDays(t0, Number(rule.trigger_config.days_before)); const d = (t) => String(t.due_date).slice(0, 10);
        const hits = (cur.tasksOf.get(rule.project_id) || []).filter((t) => !t._link && !isDone(t) && t.due_date && d(t) >= t0 && d(t) <= lim && !String(t.id).startsWith("tmp-"));
        if (!hits.length) continue;
        const { data, error } = await db.from("rule_executions").select("task_id,trigger_data").eq("rule_id", rule.id).in("task_id", hits.map((t) => t.id));
        if (error) continue; // can't tell what already ran, so don't run anything
        const seen = new Set((data || []).map((x) => x.task_id + "|" + (x.trigger_data?.value || "")));
        for (const t of hits) if (!seen.has(t.id + "|" + d(t))) await cur.runRules(t, "__due", d(t), rule.id);
      }
    };
    const first = setTimeout(sweep, 4000); const iv = setInterval(sweep, 5 * 60 * 1000);
    return () => { clearTimeout(first); clearInterval(iv); };
  }, [db, orgId, external, loading, ruleCount]);

  // ── rules ──
  const saveRule = useCallback(async (pid, rule) => {
    const payload = { project_id: pid, name: rule.name.trim(), description: rule.description || "", trigger_type: rule.trigger_type, trigger_config: rule.trigger_config || {}, actions: rule.actions || [] };
    if (rule.id) { const { data, error } = await db.from("project_rules").update({ ...payload, updated_at: nowIso() }).eq("id", rule.id).select().single(); if (error || !data) { say("Couldn't save the rule" + (error?.message ? ": " + error.message : "")); return null; } S.setRules((p) => p.map((r) => (r.id === data.id ? data : r))); return data; }
    const { data, error } = await db.from("project_rules").insert({ ...payload, is_active: true, created_by: uid }).select().single();
    if (error || !data) { say("Couldn't create the rule" + (error?.message ? ": " + error.message : "")); return null; }
    S.setRules((p) => p.concat(data)); return data;
  }, [db, uid]);
  const toggleRule = useCallback(async (rule) => { const next = !rule.is_active; S.setRules((p) => p.map((r) => (r.id === rule.id ? { ...r, is_active: next } : r))); const { error } = await db.from("project_rules").update({ is_active: next }).eq("id", rule.id); if (error) { S.setRules((p) => p.map((r) => (r.id === rule.id ? { ...r, is_active: !next } : r))); say("Couldn't change the rule"); } }, [db]);
  const deleteRule = useCallback(async (rule) => { S.setRules((p) => p.filter((r) => r.id !== rule.id)); const { error } = await db.from("project_rules").delete().eq("id", rule.id); if (error) { S.setRules((p) => p.concat(rule)); say("Couldn't delete the rule"); } }, [db]);

  // ── docs linked to a project ──
  const createDoc = useCallback(async (pid, title, emoji = "📄") => {
    const { data, error } = await db.from("documents").insert({ org_id: C.current.orgFor(pid), created_by: uid, title: title.trim(), emoji, project_id: pid, status: "draft", visibility: "team", content: [{ id: crypto.randomUUID(), type: "text", content: "" }], sort_order: 0 }).select().single();
    if (error || !data) { say("Couldn't create the doc" + (error?.message ? ": " + error.message : "")); return null; }
    setDocs((p) => [data, ...p]); if (!C.current.projectsById[pid]?.linked_doc_id) C.current.updateProject(pid, { linked_doc_id: data.id }); return data;
  }, [db, uid]);
  const linkDoc = useCallback(async (pid, docId) => { setDocs((p) => p.map((d) => (d.id === docId ? { ...d, project_id: pid } : d))); await db.from("documents").update({ project_id: pid }).eq("id", docId); if (!C.current.projectsById[pid]?.linked_doc_id) C.current.updateProject(pid, { linked_doc_id: docId }); }, [db]);
  const unlinkDoc = useCallback(async (pid, docId) => { setDocs((p) => p.map((d) => (d.id === docId ? { ...d, project_id: null } : d))); await db.from("documents").update({ project_id: null }).eq("id", docId); if (C.current.projectsById[pid]?.linked_doc_id === docId) C.current.updateProject(pid, { linked_doc_id: null }); }, [db]);

  // ── teams, members, guests ──
  const createTeam = useCallback(async (name, color) => {
    const mk = (s) => db.from("teams").insert({ org_id: orgId, name, slug: s, color: color || "#3b82f6", created_by: uid }).select().single();
    let { data, error } = await mk(slug(name)); if (error && (error.code === "23505" || /duplicate|unique/i.test(error.message || ""))) ({ data, error } = await mk(slug(name) + "-" + Math.random().toString(36).slice(2, 6)));
    if (error || !data) { say("Couldn't create the team" + (error?.message ? ": " + error.message : "")); return null; }
    S.setTeams((p) => p.concat(data).sort((a, b) => (a.name || "").localeCompare(b.name || ""))); return data;
  }, [db, orgId, uid]);
  const updateMember = useCallback(async (pid, userId, patch) => { S.setMembers((p) => p.map((m) => (m.project_id === pid && m.user_id === userId ? { ...m, ...patch } : m))); const { error } = await db.from("project_members").update(patch).eq("project_id", pid).eq("user_id", userId); if (error) say("Couldn't update that member"); }, [db]);
  const inviteGuest = useCallback(async (pid, { email, name, role, scope }) => {
    const { data, error } = await invokeFunction("invite-external-collaborator", { body: { email: email.trim(), display_name: (name || "").trim() || null, project_id: pid, role, access_scope: scope, invited_by: uid, org_id: C.current.orgFor(pid) } });
    if (error || data?.error || !data?.user_id) return { error: data?.error || error?.message || "The invite didn't go through" };
    const row = { project_id: pid, user_id: data.user_id, role, access_scope: scope, invited_as_external: true };
    S.setMembers((p) => p.filter((m) => !(m.project_id === pid && m.user_id === data.user_id)).concat(row));
    const { data: prof } = await db.from("profiles").select("*").eq("id", data.user_id).maybeSingle();
    S.setPeopleList((p) => (p.some((x) => x.id === data.user_id) ? p : p.concat(prof || { id: data.user_id, display_name: (name || "").trim() || email.trim(), email: email.trim(), is_external: true })));
    return { ok: true };
  }, [db, uid]);

  // ── task templates and forms (rows live in the tab; these create the tasks) ──
  const addCollabs = async (task, ids, org) => { for (const id of ids || []) { if (!id) continue; await db.from("task_assignees").insert({ task_id: task.id, user_id: id, role: "collaborator", org_id: org }); C.current.notify(id, `${personName(C.current.people[uid]) || "Someone"} added you as a collaborator`, task.title, task); } };
  const applyTaskTemplate = useCallback(async (pid, tmpl) => {
    const td = tmpl.template_data || {}; const org = C.current.orgFor(pid); const secs = C.current.sectionsOf.get(pid) || [];
    const sid = td.section_id && secs.some((s) => s.id === td.section_id) ? td.section_id : secs[0]?.id || null;
    const mx = (C.current.tasksOf.get(pid) || []).filter((t) => t.section_id === sid).reduce((m, t) => Math.max(m, t.sort_order || 0), 0);
    const items = (td.subtasks || []).map((s) => (typeof s === "string" ? { id: s, title: s } : s)).filter((s) => (s.title || "").trim());
    const { data: main, error } = await db.from("tasks").insert({ org_id: org, project_id: pid, section_id: sid, title: td.title || tmpl.name, description: td.description || "", status: "todo", priority: td.priority || "none", assignee_id: td.assignee_id || null, start_date: relDate(td.start_in_days), due_date: relDate(td.due_in_days), sort_order: mx + GAP, created_by: uid }).select().single();
    if (error || !main) { say("Couldn't create the task" + (error?.message ? ": " + error.message : "")); return null; }
    const idMap = { __main: main.id }; const made = [];
    for (let i = 0; i < items.length; i++) { const it = items[i]; const { data: sub } = await db.from("tasks").insert({ org_id: org, project_id: pid, section_id: sid, parent_task_id: main.id, title: it.title.trim(), description: it.description || "", status: "todo", priority: it.priority || "none", assignee_id: it.assignee_id || null, start_date: relDate(it.start_in_days), due_date: relDate(it.due_in_days), sort_order: (i + 1) * GAP, created_by: uid }).select().single(); if (sub) { made.push(sub); idMap[it.id] = sub.id; } }
    C.current._subLoaded.current.add(main.id);
    S.setTasks((p) => p.concat({ ...main, subtask_count: made.length }, made));
    await addCollabs(main, td.collaborator_ids, org); for (const it of items) if (idMap[it.id]) await addCollabs({ id: idMap[it.id], title: it.title, project_id: pid }, it.collaborator_ids, org);
    const link = async (local, list) => { const suc = idMap[local]; if (!suc) return; for (const d of list || []) { const pre = idMap[d]; if (pre && pre !== suc) await C.current.addDep(pre, suc); } };
    await link("__main", td.depends_on); for (const it of items) await link(it.id, it.depends_on);
    if (main.assignee_id) C.current.notify(main.assignee_id, `${personName(C.current.people[uid]) || "Someone"} assigned you a task`, main.title, main);
    C.current.runRules(main, "__created", true, null);
    return main;
  }, [db, uid]);
  const submitForm = useCallback(async (form, values) => {
    const pid = form.project_id; const org = C.current.orgFor(pid); const secs = C.current.sectionsOf.get(pid) || [];
    let title = "", description = "", assignee = form.default_assignee_id || null, priority = form.default_priority || "none", due = null, secOverride = null; const extra = [];
    for (const fld of form.fields || []) {
      const v = values[fld.id]; if (v == null || v === "" || (Array.isArray(v) && !v.length)) continue;
      if (fld.maps_to === "title") title = String(v); else if (fld.maps_to === "description") description = String(v); else if (fld.maps_to === "assignee") assignee = v; else if (fld.maps_to === "priority") priority = v; else if (fld.maps_to === "due_date") due = v; else if (fld.maps_to === "section") secOverride = v;
      else if (fld.maps_to === "attachments") { /* uploaded after the task exists */ } else if (fld.maps_to === "multi_select") extra.push(`${fld.label}: ${v.join(", ")}`); else extra.push(`${fld.label}: ${v}`);
    }
    const sid = secOverride || (form.target_section_id && secs.some((s) => s.id === form.target_section_id) ? form.target_section_id : secs[0]?.id || null);
    const mx = (C.current.tasksOf.get(pid) || []).filter((t) => t.section_id === sid).reduce((m, t) => Math.max(m, t.sort_order || 0), 0);
    const { data, error } = await db.from("tasks").insert({ org_id: org, project_id: pid, section_id: sid, title: title || form.name, description: [description, extra.join("\n")].filter(Boolean).join("\n\n"), status: "todo", priority: priority || "none", assignee_id: assignee || null, due_date: due || null, sort_order: mx + GAP, created_by: uid }).select().single();
    if (error || !data) { say("Couldn't submit the form" + (error?.message ? ": " + error.message : "")); return null; }
    S.setTasks((p) => p.concat(data));
    for (const fld of form.fields || []) { if (fld.maps_to !== "attachments" || !Array.isArray(values[fld.id])) continue; for (const file of values[fld.id]) { try { const path = `${org}/${data.id}/${Date.now()}_${file.name}`; const { error: ue } = await db.storage.from("attachments").upload(path, file); if (!ue) await db.from("attachments").insert({ org_id: org, entity_type: "task", entity_id: data.id, filename: file.name, file_path: path, file_size: file.size, mime_type: file.type, uploaded_by: uid }); } catch {} } }
    db.from("project_forms").update({ submit_count: (form.submit_count || 0) + 1 }).eq("id", form.id).then(() => {}, () => {});
    if (data.assignee_id) C.current.notify(data.assignee_id, `${personName(C.current.people[uid]) || "Someone"} assigned you a task`, data.title, data);
    C.current.runRules(data, "__created", true, null);
    return data;
  }, [db, uid]);

  // ── project templates ──
  // Fill a freshly created project from a template's sections → tasks → subtasks tree.
  const fillFromTemplate = async (project, tmpl) => {
    const known = (id) => (id && C.current.people[id] ? id : null); const made = []; const labelRows = [];
    const node = async (n, sectionId, order, parentId) => {
      const str = typeof n === "string"; const title = (str ? n : n.title || "") || "Untitled";
      const { data: t } = await db.from("tasks").insert({ org_id: orgId, project_id: project.id, section_id: sectionId, parent_task_id: parentId || null, title, description: str ? "" : n.description || "", status: "todo", priority: str ? "none" : n.priority || "none", assignee_id: str ? null : known(n.assignee_id), sort_order: order * GAP, created_by: uid }).select().single();
      if (!t) return; made.push(t); if (str) return;
      for (const lid of Array.isArray(n.labels) ? n.labels : []) { const row = { task_id: t.id, label_id: lid, org_id: orgId }; const { error } = await db.from("task_label_assignments").insert(row); if (!error) labelRows.push(row); }
      for (const att of Array.isArray(n.attachments) ? n.attachments : []) { try { const safe = String(att.filename || "file").replace(/[^\w.\-]+/g, "_"); const to = `${orgId}/${t.id}/${Date.now()}_${safe}`; const { error: ce } = await db.storage.from("attachments").copy(att.file_path, to); if (!ce) await db.from("attachments").insert({ org_id: orgId, entity_type: "task", entity_id: t.id, filename: att.filename, file_path: to, file_size: att.file_size, mime_type: att.mime_type, uploaded_by: uid }); } catch {} }
      if (Array.isArray(n.subtasks) && n.subtasks.length) { C.current._subLoaded.current.add(t.id); await pool(n.subtasks, 4, (c, k) => node(c, sectionId, k + 1, t.id)); }
    };
    for (const sec of project._sections || []) await pool(sec._src?.tasks || [], 5, (n, j) => node(n, sec.id, j + 1, null));
    const kids = {}; made.forEach((t) => { if (t.parent_task_id) kids[t.parent_task_id] = (kids[t.parent_task_id] || 0) + 1; });
    S.setTasks((p) => p.concat(made.map((t) => ({ ...t, subtask_count: kids[t.id] || 0 })))); if (labelRows.length) S.setLabelLinks((p) => p.concat(labelRows));
    return made.length;
  };
  const createFromTemplate = useCallback(async (tmpl, f) => {
    const p = await C.current.createProject({ ...f, default_view: tmpl.template_data?.default_view || "List", sections: (tmpl.sections || []).map((s) => ({ name: s.name, is_complete_column: !!s.is_complete_column, wip_limit: s.wip_limit || null, tasks: s.tasks || [] })) });
    if (!p) return null; const n = await fillFromTemplate(p, tmpl); say(`Project created from "${tmpl.name}" with ${n} task${n === 1 ? "" : "s"}`); return p;
  }, [db, orgId, uid]);
  const saveAsTemplate = useCallback(async (src, form) => {
    const inc = form.include || {};
    const { data: all } = await db.from("tasks").select("id,title,description,priority,assignee_id,section_id,parent_task_id,sort_order").eq("project_id", src.id).is("deleted_at", null);
    const list = all || []; const by = (a, b) => (a.sort_order || 0) - (b.sort_order || 0); const kids = (id) => list.filter((t) => t.parent_task_id === id).sort(by);
    const att = {}; if (inc.files && list.length) { const { data: a } = await db.from("attachments").select("entity_id,filename,file_path,mime_type,file_size").eq("entity_type", "task").in("entity_id", list.map((t) => t.id)); (a || []).forEach((x) => { (att[x.entity_id] = att[x.entity_id] || []).push({ filename: x.filename, file_path: x.file_path, mime_type: x.mime_type, file_size: x.file_size }); }); }
    const build = (t) => { const o = { title: t.title }; if (inc.descriptions && t.description) o.description = t.description; if (t.priority && t.priority !== "none") o.priority = t.priority; if (inc.assignees && t.assignee_id) o.assignee_id = t.assignee_id; if (inc.tags) { const l = C.current.labelsOfMap.get(t.id) || []; if (l.length) o.labels = l; } if (inc.files && att[t.id]) o.attachments = att[t.id]; if (inc.subtasks) { const s = kids(t.id).map(build); if (s.length) o.subtasks = s; } return o; };
    const sections = (C.current.sectionsOf.get(src.id) || []).map((s, i) => ({ name: s.name, sort_order: s.sort_order ?? i + 1, is_complete_column: !!s.is_complete_column, wip_limit: s.wip_limit || null, tasks: list.filter((t) => t.section_id === s.id && !t.parent_task_id).sort(by).map(build) }));
    const { data, error } = await db.from("project_templates").insert({ org_id: orgId, name: form.name.trim(), description: form.description || src.description || "", icon: form.icon || "📋", color: form.color || src.color || "#3b82f6", is_builtin: false, created_by: uid, template_data: { default_view: src.default_view || "List", include: inc }, sections }).select().single();
    if (error || !data) { say("Couldn't save the template" + (error?.message ? ": " + error.message : "")); return null; }
    setTemplates((p) => p.concat(data)); return data;
  }, [db, orgId, uid]);
  const saveTemplate = useCallback(async (ed) => {
    const payload = { name: ed.name.trim(), description: (ed.description || "").trim(), icon: ed.icon || "📋", color: ed.color || "#3b82f6", sections: ed.sections, template_data: ed.template_data || { default_view: "List" } };
    const res = ed.id ? await db.from("project_templates").update(payload).eq("id", ed.id).select().single() : await db.from("project_templates").insert({ ...payload, org_id: orgId, is_builtin: false, created_by: uid }).select().single();
    if (res.error || !res.data) { say("Couldn't save the template" + (res.error?.message ? ": " + res.error.message : "")); return null; }
    setTemplates((p) => (ed.id ? p.map((t) => (t.id === ed.id ? res.data : t)) : p.concat(res.data))); return res.data;
  }, [db, orgId, uid]);
  const deleteTemplate = useCallback(async (t) => { if (t.is_builtin) return; const { error } = await db.from("project_templates").delete().eq("id", t.id); if (error) { say("Couldn't delete the template"); return; } setTemplates((p) => p.filter((x) => x.id !== t.id)); }, [db]);

  // ── duplicate a project ──
  const copyProject = useCallback(async (src, opt) => {
    const cur = C.current; const srcSecs = cur.sectionsOf.get(src.id) || [];
    const p = await cur.createProject({ name: opt.name, description: src.description || "", color: src.color, visibility: src.visibility || "public", join_policy: src.join_policy, team_id: src.team_id, objective_id: src.objective_id, key_result_id: src.key_result_id, plm_program_id: src.plm_program_id, default_view: src.default_view, members: opt.members ? cur.members.filter((m) => m.project_id === src.id && !m.invited_as_external).map((m) => m.user_id) : [], sections: srcSecs.map((s) => ({ name: s.name, is_complete_column: !!s.is_complete_column, wip_limit: s.wip_limit || null, _from: s.id })) });
    if (!p) return null;
    const secMap = {}; (p._sections || []).forEach((s) => { secMap[s._src._from] = s.id; });
    const views = src.settings?.views; if (Array.isArray(views) && views.length) cur.updateProject(p.id, { settings: { views } });
    // custom fields first, so rules and values can point at the new ones
    const fieldMap = {};
    if (opt.fields) for (const f of cur.fields.filter((x) => x.project_id === src.id)) { const { data } = await db.from("custom_fields").insert({ project_id: p.id, org_id: orgId, name: f.name, field_type: f.field_type, options: f.options || [], sort_order: f.sort_order }).select().single(); if (data) { fieldMap[f.id] = data.id; S.setFields((x) => x.concat(data)); } }
    if (opt.rules) for (const r of cur.rules.filter((x) => x.project_id === src.id)) {
      const mapCfg = (c) => { const o = { ...(c || {}) }; if (o.section_id) o.section_id = secMap[o.section_id] || null; if (Array.isArray(o.section_ids)) o.section_ids = o.section_ids.map((x) => secMap[x]).filter(Boolean); if (o.field_id) o.field_id = fieldMap[o.field_id] || null; return o; };
      const { data } = await db.from("project_rules").insert({ project_id: p.id, name: r.name, description: r.description || "", trigger_type: r.trigger_type, trigger_config: mapCfg(r.trigger_config), actions: (r.actions || []).map((a) => ({ ...a, config: mapCfg(a.config) })), is_active: r.is_active, created_by: uid }).select().single();
      if (data) S.setRules((x) => x.concat(data));
    }
    let n = 0;
    if (opt.tasks) {
      const { data: all } = await db.from("tasks").select("*").eq("project_id", src.id).is("deleted_at", null); const list = all || [];
      const row = (t, parentId) => ({ org_id: orgId, project_id: p.id, section_id: secMap[t.section_id] || null, parent_task_id: parentId || null, title: t.title, description: t.description || "", html_description: t.html_description || null, status: "todo", priority: t.priority || "none", assignee_id: opt.assignees ? t.assignee_id || null : null, start_date: opt.dates ? t.start_date || null : null, due_date: opt.dates ? t.due_date || null : null, sort_order: t.sort_order, estimated_hours: t.estimated_hours ?? null, story_points: t.story_points ?? null, metadata: t.metadata?.is_milestone ? { is_milestone: true } : {}, approval_status: t.approval_status && t.approval_status !== "none" ? "pending" : "none", created_by: uid });
      const made = []; const idMap = {};
      const copy = async (t, parentId) => { const { data } = await db.from("tasks").insert(row(t, parentId)).select().single(); if (!data) return; idMap[t.id] = data.id; made.push(data); if (opt.subtasks) { const kids = list.filter((c) => c.parent_task_id === t.id); if (kids.length) { cur._subLoaded.current.add(data.id); await pool(kids, 4, (c) => copy(c, data.id)); } } };
      await pool(list.filter((t) => !t.parent_task_id), 6, (t) => copy(t, null));
      const kidsN = {}; made.forEach((t) => { if (t.parent_task_id) kidsN[t.parent_task_id] = (kidsN[t.parent_task_id] || 0) + 1; });
      S.setTasks((x) => x.concat(made.map((t) => ({ ...t, subtask_count: kidsN[t.id] || 0 })))); n = made.filter((t) => !t.parent_task_id).length;
      for (const d of cur.deps) { const a = idMap[d.predecessor_id], b = idMap[d.successor_id]; if (a && b) await cur.addDep(a, b); }
      const lab = []; for (const [tid, ids] of cur.labelsOfMap) { if (!idMap[tid]) continue; for (const lid of ids) lab.push({ task_id: idMap[tid], label_id: lid, org_id: orgId }); }
      if (lab.length) { await pool(lab, 6, (r) => db.from("task_label_assignments").insert(r)); S.setLabelLinks((x) => x.concat(lab)); }
      if (opt.fields) { const vals = []; for (const [tid, m] of Object.entries(cur.fieldValues)) { if (!idMap[tid]) continue; for (const [fid, v] of Object.entries(m)) if (fieldMap[fid] && v != null && v !== "") vals.push({ task_id: idMap[tid], field_id: fieldMap[fid], value: v, org_id: orgId }); }
        if (vals.length) { await pool(vals, 6, (r) => db.from("custom_field_values").insert(r)); S.setFieldValues((x) => { const o = { ...x }; vals.forEach((r) => { o[r.task_id] = { ...(o[r.task_id] || {}), [r.field_id]: r.value }; }); return o; }); } }
    }
    say(`Copied to "${p.name}"` + (opt.tasks ? ` with ${n} task${n === 1 ? "" : "s"}` : ""));
    return p;
  }, [db, orgId, uid]);

  return { ...core, objectives, keyResults, plmPrograms, templates, docs, saveRule, toggleRule, deleteRule, createDoc, linkDoc, unlinkDoc, createTeam, updateMember, inviteGuest, applyTaskTemplate, submitForm, createFromTemplate, saveAsTemplate, saveTemplate, deleteTemplate, copyProject };
}
