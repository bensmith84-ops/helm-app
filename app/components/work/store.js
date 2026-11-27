"use client";
// Data layer for the new Projects suite. One hook owns every collection, applies
// changes optimistically, and keeps the side effects the classic module had
// (assignment notifications, rules, recurring tasks, project progress).
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { today, addDays, ymd, isDone, defaultViews, personName } from "./model";

const nowIso = () => new Date().toISOString();
const tmpId = () => "tmp-" + Math.random().toString(36).slice(2, 10);
const chunk = (a, n) => { const o = []; for (let i = 0; i < a.length; i += n) o.push(a.slice(i, i + n)); return o; };
const GAP = 1024;

export function useWorkStore({ db, user, profile, toast, onCelebrate }) {
  const orgId = profile?.org_id || null;
  const uid = user?.id || null;
  const external = !!profile?.is_external;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [projects, setProjects] = useState([]);
  const [sections, setSections] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [peopleList, setPeopleList] = useState([]);
  const [members, setMembers] = useState([]);
  const [favorites, setFavorites] = useState(() => new Set());
  const [labels, setLabels] = useState([]);
  const [labelLinks, setLabelLinks] = useState([]);
  const [deps, setDeps] = useState([]);
  const [links, setLinks] = useState([]);
  const [fields, setFields] = useState([]);
  const [fieldValues, setFieldValues] = useState({});
  const [rules, setRules] = useState([]);
  const [portfolios, setPortfolios] = useState([]);
  const [portfoliosReady, setPortfoliosReady] = useState(true);
  const [teams, setTeams] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [undoStack, setUndoStack] = useState([]);
  const subLoaded = useRef(new Set());
  const dirty = useRef(new Map()); // task id -> time of last local write, so polling doesn't clobber it
  const R = useRef({}); // latest state for callbacks
  R.current = { projects, sections, tasks, peopleList, members, labels, labelLinks, deps, links, fields, fieldValues, rules, portfolios };
  const syncedAt = useRef(nowIso());

  // ── load ──
  useEffect(() => {
    if (!uid || (!orgId && !external)) return;
    let alive = true;
    (async () => {
      setLoading(true); setError(null);
      try {
        const q = (p) => p.then((r) => { if (r.error) throw r.error; return r.data || []; });
        const soft = (p) => p.then((r) => r.data || [], () => []);
        let pr, se, ta, pe, pm;
        if (external) {
          const mine = await q(db.from("project_members").select("project_id").eq("user_id", uid));
          const ids = mine.map((m) => m.project_id);
          if (!ids.length) { if (alive) setLoading(false); return; }
          [pr, se, ta, pm] = await Promise.all([
            q(db.from("projects").select("*").in("id", ids).is("deleted_at", null).order("name")),
            q(db.from("sections").select("*").in("project_id", ids).order("sort_order")),
            q(db.from("tasks").select("*").in("project_id", ids).is("deleted_at", null).order("sort_order")),
            q(db.from("project_members").select("id, project_id, user_id, role, access_scope, invited_as_external").in("project_id", ids)),
          ]);
          const uids = [...new Set(pm.map((m) => m.user_id))];
          pe = uids.length ? await q(db.from("profiles").select("*").in("id", uids)) : [];
          ta.forEach((t) => { if (t.parent_task_id) subLoaded.current.add(t.parent_task_id); });
        } else {
          let perm;
          [pr, se, ta, pe, pm, perm] = await Promise.all([
            q(db.from("projects").select("*").eq("org_id", orgId).is("deleted_at", null).order("name")),
            q(db.from("sections").select("*").order("sort_order")),
            q(db.rpc("get_top_level_tasks_with_subcounts", { p_org: orgId })),
            q(db.from("profiles").select("*").eq("org_id", orgId)),
            q(db.from("project_members").select("id, project_id, user_id, role, access_scope, invited_as_external").eq("org_id", orgId)),
            db.from("user_module_permissions").select("is_admin").eq("user_id", uid).maybeSingle().then((r) => r.data, () => null),
          ]);
          const admin = perm?.is_admin === true; if (alive) setIsAdmin(admin);
          const mineSet = new Set(pm.filter((m) => m.user_id === uid).map((m) => m.project_id));
          if (!admin) pr = pr.filter((p) => p.visibility === "public" || p.owner_id === uid || p.created_by === uid || mineSet.has(p.id));
          const have = new Set(pe.map((p) => p.id)); const guests = [...new Set(pm.map((m) => m.user_id))].filter((id) => !have.has(id));
          if (guests.length) pe = pe.concat(await soft(db.from("profiles").select("*").in("id", guests)));
        }
        if (!alive) return;
        setProjects(pr); setSections(se); setTasks(ta); setPeopleList(pe); setMembers(pm); setLoading(false);
        // second wave — nothing here blocks first paint
        const [fav, lb, ll, dp, lk, cf, cv, rl, pf, tm, mySubs] = await Promise.all([
          soft(db.from("project_favorites").select("project_id").eq("user_id", uid)),
          external ? [] : soft(db.from("task_labels").select("*").eq("org_id", orgId).order("name")),
          soft(db.from("task_label_assignments").select("*")),
          soft(db.from("task_dependencies").select("*")),
          external ? [] : soft(db.from("task_projects").select("id,task_id,project_id,section_id").eq("org_id", orgId)),
          soft(db.from("custom_fields").select("*").order("sort_order")),
          soft(db.from("custom_field_values").select("*")),
          external ? [] : soft(db.from("project_rules").select("*")),
          external ? [] : db.from("portfolios").select("*").is("deleted_at", null).order("name").then((r) => { if (r.error) { setPortfoliosReady(false); return []; } return r.data || []; }, () => { setPortfoliosReady(false); return []; }),
          external ? [] : soft(db.from("teams").select("id,name").eq("org_id", orgId).is("deleted_at", null).order("name")),
          external ? [] : soft(db.from("tasks").select("*").eq("org_id", orgId).eq("assignee_id", uid).not("parent_task_id", "is", null).is("deleted_at", null)),
        ]);
        if (!alive) return;
        setFavorites(new Set(fav.map((f) => f.project_id))); setLabels(lb); setLabelLinks(ll); setDeps(dp); setLinks(lk); setFields(cf); setRules(rl); setPortfolios(pf); setTeams(tm);
        const m = {}; cv.forEach((v) => { (m[v.task_id] = m[v.task_id] || {})[v.field_id] = v.value; }); setFieldValues(m);
        if (mySubs.length) setTasks((prev) => { const seen = new Set(prev.map((t) => t.id)); return prev.concat(mySubs.filter((t) => !seen.has(t.id))); });
      } catch (e) { console.error("[work] load", e); if (alive) { setError(e.message || "Couldn't load projects"); setLoading(false); } }
    })();
    return () => { alive = false; };
  }, [db, uid, orgId, external, reloadKey]);
  const reload = useCallback(() => setReloadKey((k) => k + 1), []);

  // ── live sync: pick up other people's changes every 20s while the tab is visible ──
  useEffect(() => {
    if (!orgId || loading) return;
    const tick = async () => {
      if (typeof document !== "undefined" && document.hidden) return;
      const since = syncedAt.current; const started = nowIso();
      const { data, error: e } = await db.from("tasks").select("*").eq("org_id", orgId).gt("updated_at", since).limit(500);
      if (e || !data) return; syncedAt.current = started;
      if (!data.length) return;
      setTasks((prev) => {
        const byId = new Map(prev.map((t) => [t.id, t])); let changed = false;
        for (const row of data) {
          const mine = dirty.current.get(row.id); if (mine && Date.now() - mine < 15000) continue;
          const cur = byId.get(row.id);
          if (row.deleted_at) { if (cur) { byId.delete(row.id); changed = true; } continue; }
          if (cur) { if (cur.updated_at !== row.updated_at) { byId.set(row.id, { ...cur, ...row }); changed = true; } }
          else if (!row.parent_task_id || subLoaded.current.has(row.parent_task_id)) { byId.set(row.id, row); changed = true; }
        }
        return changed ? [...byId.values()] : prev;
      });
    };
    const iv = setInterval(tick, 20000);
    return () => clearInterval(iv);
  }, [db, orgId, loading]);

  // ── indexes ──
  const people = useMemo(() => { const m = {}; peopleList.forEach((p) => { m[p.id] = p; }); return m; }, [peopleList]);
  const projectsById = useMemo(() => { const m = {}; projects.forEach((p) => { m[p.id] = p; }); return m; }, [projects]);
  const tasksById = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);
  const childrenOf = useMemo(() => { const m = new Map(); for (const t of tasks) if (t.parent_task_id) { const a = m.get(t.parent_task_id); if (a) a.push(t); else m.set(t.parent_task_id, [t]); } for (const a of m.values()) a.sort((x, y) => (x.sort_order ?? 0) - (y.sort_order ?? 0) || String(x.created_at).localeCompare(String(y.created_at))); return m; }, [tasks]);
  const sectionsOf = useMemo(() => { const m = new Map(); for (const s of sections) { const a = m.get(s.project_id); if (a) a.push(s); else m.set(s.project_id, [s]); } for (const a of m.values()) a.sort((x, y) => (x.sort_order ?? 0) - (y.sort_order ?? 0)); return m; }, [sections]);
  // Top-level tasks per project, including tasks multi-homed in from other projects (shown in the link's section).
  const tasksOf = useMemo(() => {
    const m = new Map(); const add = (pid, t) => { const a = m.get(pid); if (a) a.push(t); else m.set(pid, [t]); };
    for (const t of tasks) if (!t.parent_task_id && t.project_id) add(t.project_id, t);
    for (const l of links) { const t = tasksById.get(l.task_id); if (t && t.project_id !== l.project_id) add(l.project_id, { ...t, section_id: l.section_id, _link: l.id, _home: t.project_id }); }
    return m;
  }, [tasks, links, tasksById]);
  const labelsOfMap = useMemo(() => { const m = new Map(); for (const l of labelLinks) { const a = m.get(l.task_id); if (a) a.push(l.label_id); else m.set(l.task_id, [l.label_id]); } return m; }, [labelLinks]);
  const blockedByMap = useMemo(() => { const m = new Map(); for (const d of deps) { const a = m.get(d.successor_id); if (a) a.push(d); else m.set(d.successor_id, [d]); } return m; }, [deps]);
  const projectStats = useMemo(() => {
    const m = {}; const t0 = today();
    for (const p of projects) m[p.id] = { total: 0, done: 0, overdue: 0, open: 0 };
    for (const t of tasks) { const s = m[t.project_id]; if (!s || t.parent_task_id) continue; s.total++; if (isDone(t)) s.done++; else { s.open++; if (t.due_date && String(t.due_date).slice(0, 10) < t0) s.overdue++; } }
    return m;
  }, [projects, tasks]);
  const membersOf = useCallback((pid) => { const ids = new Set(R.current.members.filter((m) => m.project_id === pid).map((m) => m.user_id)); const p = projectsById[pid]; if (p?.owner_id) ids.add(p.owner_id); return [...ids].map((id) => people[id]).filter(Boolean).sort((a, b) => personName(a).localeCompare(personName(b))); }, [people, projectsById, members]);
  const assignable = useCallback((pid) => { const p = projectsById[pid]; const internal = peopleList.filter((x) => !x.is_external); if (!p) return internal; const guests = membersOf(pid).filter((x) => x.is_external); return [...internal, ...guests].sort((a, b) => personName(a).localeCompare(personName(b))); }, [peopleList, projectsById, membersOf]);

  const undoRef = useRef([]);
  const pushUndo = useCallback((label, run) => { undoRef.current = [...undoRef.current.slice(-19), { label, run }]; setUndoStack(undoRef.current); }, []);
  const undo = useCallback(() => { const last = undoRef.current[undoRef.current.length - 1]; if (!last) { toast?.("Nothing to undo"); return; } undoRef.current = undoRef.current.slice(0, -1); setUndoStack(undoRef.current); Promise.resolve(last.run()).catch(() => {}); toast?.("Undid: " + last.label); }, [toast]);
  const orgFor = useCallback((pid) => projectsById[pid]?.org_id || orgId, [projectsById, orgId]);
  const myName = () => personName(people[uid]) || "Someone";
  const notify = (userId, title, body, task, category = "assignment") => { if (!userId || userId === uid) return; db.from("notifications").insert({ org_id: orgFor(task?.project_id), user_id: userId, type: category, title, body, entity_type: "task", entity_id: task?.id, actor_id: uid, is_read: false, category, metadata: { task_title: task?.title, project_name: projectsById[task?.project_id]?.name || null } }).then(() => {}, () => {}); };
  const logActivity = (task, field, oldV, newV) => { db.from("task_activity").insert({ task_id: task.id, actor_id: uid, action: "updated", field, old_value: oldV == null ? null : String(oldV), new_value: newV == null ? null : String(newV), org_id: orgFor(task.project_id) }).then(() => {}, () => {}); };

  const syncProgress = useCallback((pid) => {
    if (!pid) return; const list = R.current.tasks.filter((t) => t.project_id === pid && !t.parent_task_id); if (!list.length) return;
    const pct = Math.round((list.filter(isDone).length / list.length) * 100); const p = R.current.projects.find((x) => x.id === pid);
    if (p && p.progress !== pct) { setProjects((ps) => ps.map((x) => (x.id === pid ? { ...x, progress: pct } : x))); db.from("projects").update({ progress: pct }).eq("id", pid).then(() => {}, () => {}); }
  }, [db]);

  // ── tasks ──
  const loadSubtasks = useCallback(async (parentId) => {
    if (!parentId || subLoaded.current.has(parentId) || String(parentId).startsWith("tmp-")) return;
    subLoaded.current.add(parentId);
    const { data, error: e } = await db.from("tasks").select("*").eq("parent_task_id", parentId).is("deleted_at", null).order("sort_order");
    if (e) { subLoaded.current.delete(parentId); return; }
    if (data?.length) setTasks((prev) => { const have = new Set(prev.map((t) => t.id)); const add = data.filter((d) => !have.has(d.id)); return add.length ? prev.concat(add) : prev; });
  }, [db]);
  const fetchTask = useCallback(async (id) => {
    const { data } = await db.from("tasks").select("*").eq("id", id).is("deleted_at", null).maybeSingle();
    if (data) setTasks((prev) => (prev.some((t) => t.id === data.id) ? prev : prev.concat(data)));
    return data || null;
  }, [db]);

  const runRulesRef = useRef(null);
  const updateTask = useCallback(async (id, patch, opts = {}) => {
    const old = R.current.tasks.find((t) => t.id === id); if (!old) return;
    const ups = { ...patch };
    if ("status" in ups) { if (ups.status === "done" && old.status !== "done") { ups.completed_at = nowIso(); ups.completed_by = uid; } else if (old.status === "done" && ups.status !== "done") { ups.completed_at = null; } }
    if ("section_id" in ups && ups.section_id !== old.section_id && !("status" in ups)) {
      const sec = R.current.sections.find((s) => s.id === ups.section_id); const from = R.current.sections.find((s) => s.id === old.section_id);
      if (sec?.is_complete_column && !isDone(old)) { ups.status = "done"; ups.completed_at = nowIso(); ups.completed_by = uid; }
      else if (from?.is_complete_column && !sec?.is_complete_column && old.status === "done") { ups.status = "todo"; ups.completed_at = null; }
    }
    const changed = Object.keys(ups).filter((k) => JSON.stringify(ups[k]) !== JSON.stringify(old[k])); if (!changed.length) return;
    ups.updated_at = nowIso(); dirty.current.set(id, Date.now());
    setTasks((p) => p.map((t) => (t.id === id ? { ...t, ...ups } : t)));
    if (String(id).startsWith("tmp-")) return;
    const { error: e } = await db.from("tasks").update(ups).eq("id", id);
    if (e) { setTasks((p) => p.map((t) => (t.id === id ? old : t))); toast?.("Couldn't save that change"); return; }
    if (opts.undo !== false) { const inv = {}; changed.forEach((k) => { inv[k] = old[k] ?? null; }); pushUndo(opts.label || "edit", () => updateTask(id, inv, { undo: false, rules: false })); }
    if (changed.includes("assignee_id") && ups.assignee_id) notify(ups.assignee_id, `${myName()} assigned you a task`, old.title || "Untitled task", old);
    for (const k of ["status", "assignee_id", "due_date", "section_id", "priority", "approval_status"]) if (changed.includes(k)) logActivity(old, k, old[k], ups[k]);
    if (changed.includes("status")) { syncProgress(old.project_id); if (ups.status === "done" && old.status !== "done" && opts.celebrate !== false) onCelebrate?.(); }
    if (opts.rules !== false) for (const k of ["status", "assignee_id", "section_id", "priority"]) if (changed.includes(k)) runRulesRef.current?.({ ...old, ...ups }, k, ups[k], old[k]);
  }, [db, uid, toast, pushUndo, syncProgress, onCelebrate, people, projectsById]);

  const updateTasks = useCallback(async (ids, patch) => { await Promise.all(ids.map((id) => updateTask(id, patch, { undo: false, celebrate: false }))); }, [updateTask]);

  const nextOrder = (list, top) => { if (!list.length) return GAP; const v = list.map((t) => t.sort_order ?? 0); return top ? Math.min(...v) - GAP : Math.max(...v) + GAP; };
  const createTask = useCallback(async (init, opts = {}) => {
    const title = (init.title || "").trim(); if (!title && !opts.allowEmpty) return null;
    const pid = init.project_id || null; const org = orgFor(pid); if (!org) { toast?.("Can't create a task here"); return null; }
    const sibs = R.current.tasks.filter((t) => (init.parent_task_id ? t.parent_task_id === init.parent_task_id : !t.parent_task_id && t.project_id === pid && t.section_id === (init.section_id || null)));
    const row = { org_id: org, project_id: pid, section_id: init.section_id || null, parent_task_id: init.parent_task_id || null, title, status: "todo", priority: "none", sort_order: init.sort_order ?? nextOrder(sibs, opts.top), created_by: uid, ...init };
    const temp = { ...row, id: tmpId(), created_at: nowIso(), updated_at: nowIso(), _pending: true };
    setTasks((p) => p.concat(temp));
    const { data, error: e } = await db.from("tasks").insert(row).select().single();
    if (e || !data) { setTasks((p) => p.filter((t) => t.id !== temp.id)); toast?.("Couldn't create the task" + (e?.message ? ": " + e.message : "")); return null; }
    dirty.current.set(data.id, Date.now());
    // keep whatever the person typed into the temp row while the insert was in flight
    setTasks((p) => p.map((t) => { if (t.id !== temp.id) return t.parent_task_id === temp.id ? { ...t, parent_task_id: data.id } : t; const local = {}; for (const k of ["title", "assignee_id", "due_date", "start_date", "priority", "status"]) if (t[k] !== temp[k]) local[k] = t[k]; if (Object.keys(local).length) db.from("tasks").update(local).eq("id", data.id).then(() => {}, () => {}); return { ...data, ...local, _k: temp.id }; }));
    if (data.parent_task_id) { subLoaded.current.add(data.parent_task_id); setTasks((p) => p.map((t) => (t.id === data.parent_task_id ? { ...t, subtask_count: (t.subtask_count || 0) + 1 } : t))); }
    if (data.assignee_id) notify(data.assignee_id, `${myName()} assigned you a task`, data.title, data);
    runRulesRef.current?.(data, "__created", true, null);
    opts.onCreated?.(data, temp.id);
    return data;
  }, [db, uid, orgFor, toast, people]);

  const deleteTasks = useCallback(async (ids) => {
    const gone = R.current.tasks.filter((t) => ids.includes(t.id)); if (!gone.length) return;
    setTasks((p) => p.filter((t) => !ids.includes(t.id)));
    const real = ids.filter((id) => !String(id).startsWith("tmp-"));
    if (real.length) { const { error: e } = await db.from("tasks").update({ deleted_at: nowIso(), updated_at: nowIso() }).in("id", real); if (e) { setTasks((p) => p.concat(gone)); toast?.("Couldn't delete"); return; } }
    toast?.(gone.length === 1 ? "Task deleted" : `${gone.length} tasks deleted`, { label: "Undo", run: async () => { await db.from("tasks").update({ deleted_at: null, updated_at: nowIso() }).in("id", real); setTasks((p) => { const have = new Set(p.map((t) => t.id)); return p.concat(gone.filter((t) => !have.has(t.id))); }); } });
    [...new Set(gone.map((t) => t.project_id))].forEach(syncProgress);
  }, [db, toast, syncProgress]);

  const duplicateTask = useCallback(async (task) => createTask({ project_id: task.project_id, section_id: task._link ? null : task.section_id, parent_task_id: task.parent_task_id, title: task.title + " (copy)", description: task.description, html_description: task.html_description, priority: task.priority, assignee_id: task.assignee_id, due_date: task.due_date, start_date: task.start_date, estimated_hours: task.estimated_hours, sort_order: (task.sort_order ?? 0) + 1 }), [createTask]);

  const completeTask = useCallback(async (task, done = !isDone(task)) => {
    const t = R.current.tasks.find((x) => x.id === task.id) || task;
    await updateTask(t.id, { status: done ? "done" : "todo" }, { label: done ? "complete task" : "reopen task" });
    if (done && t.recurrence && t.recurrence !== "none") {
      const step = (from) => { const d = from ? new Date(from + "T12:00:00") : new Date(); const r = t.recurrence; if (r === "daily") d.setDate(d.getDate() + 1); else if (r === "weekly") d.setDate(d.getDate() + 7); else if (r === "biweekly") d.setDate(d.getDate() + 14); else if (r === "monthly") d.setMonth(d.getMonth() + 1); else if (r === "quarterly") d.setMonth(d.getMonth() + 3); return ymd(d); };
      const nextDue = (t.recurrence_mode || "on_date") === "on_complete" ? step(today()) : step(t.due_date ? String(t.due_date).slice(0, 10) : today());
      if (t.recurrence_end_date && nextDue > t.recurrence_end_date) return;
      const made = await createTask({ project_id: t.project_id, section_id: t.section_id, parent_task_id: t.parent_task_id, title: t.title, priority: t.priority, assignee_id: t.assignee_id, due_date: nextDue, start_date: t.start_date ? step(String(t.start_date).slice(0, 10)) : null, recurrence: t.recurrence, recurrence_mode: t.recurrence_mode, recurrence_end_date: t.recurrence_end_date, recurring_parent_id: t.recurring_parent_id || t.id, sort_order: (t.sort_order ?? 0) + 1 });
      if (made) toast?.("Next occurrence created for " + new Date(nextDue + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }));
    }
  }, [updateTask, createTask, toast]);

  // Put `ids` into `orderedIds` (the destination list as it should read afterwards) and set `patch` on the moved ones.
  const placeTasks = useCallback(async (ids, patch, orderedIds) => {
    const cur = new Map(R.current.tasks.map((t) => [t.id, t])); const moved = new Set(ids); const writes = new Map();
    const idx = orderedIds.findIndex((id) => moved.has(id));
    if (orderedIds.length && idx >= 0) {
      let last = idx; while (last + 1 < orderedIds.length && moved.has(orderedIds[last + 1])) last++;
      const before = idx > 0 ? cur.get(orderedIds[idx - 1])?.sort_order ?? 0 : null; const after = last + 1 < orderedIds.length ? cur.get(orderedIds[last + 1])?.sort_order ?? 0 : null;
      const n = last - idx + 1; const lo = before ?? (after != null ? after - GAP * (n + 1) : 0); const hi = after ?? lo + GAP * (n + 1);
      const sorted = orderedIds.every((id, i) => i === 0 || moved.has(id) || moved.has(orderedIds[i - 1]) || (cur.get(orderedIds[i - 1])?.sort_order ?? 0) <= (cur.get(id)?.sort_order ?? 0));
      if (sorted && hi - lo > n && !(before != null && after != null && before === after)) { const step = Math.floor((hi - lo) / (n + 1)); for (let i = 0; i < n; i++) writes.set(orderedIds[idx + i], { sort_order: lo + step * (i + 1) }); }
      else orderedIds.forEach((id, i) => { const so = (i + 1) * GAP; if (cur.get(id)?.sort_order !== so) writes.set(id, { sort_order: so }); });
    }
    const side = [];
    for (const id of ids) { const t = cur.get(id); if (!t) continue; const w = writes.get(id) || {}; writes.delete(id); side.push(updateTask(id, { ...patch, ...w }, { undo: ids.length === 1, label: "move task", celebrate: false })); }
    if (writes.size) {
      setTasks((p) => p.map((t) => (writes.has(t.id) ? { ...t, ...writes.get(t.id) } : t)));
      for (const part of chunk([...writes.entries()].filter(([id]) => !String(id).startsWith("tmp-")), 25)) await Promise.all(part.map(([id, w]) => db.from("tasks").update(w).eq("id", id)));
    }
    await Promise.all(side);
  }, [db, updateTask]);
  const moveLink = useCallback(async (linkId, sectionId) => { setLinks((p) => p.map((l) => (l.id === linkId ? { ...l, section_id: sectionId } : l))); await db.from("task_projects").update({ section_id: sectionId }).eq("id", linkId); }, [db]);

  // No unique key on (task_id, field_id), so look the row up first like the classic module does.
  const writeFieldValue = async (taskId, fieldId, value, org) => { const ex = await db.from("custom_field_values").select("id").eq("task_id", taskId).eq("field_id", fieldId).maybeSingle(); if (ex.data) await db.from("custom_field_values").update({ value }).eq("id", ex.data.id); else await db.from("custom_field_values").insert({ task_id: taskId, field_id: fieldId, value, org_id: org }); };
  // ── rules (same triggers/actions as the classic rule builder) ──
  const setFieldValue = useCallback(async (taskId, fieldId, value) => {
    setFieldValues((p) => ({ ...p, [taskId]: { ...(p[taskId] || {}), [fieldId]: value } }));
    const t = R.current.tasks.find((x) => x.id === taskId);
    await writeFieldValue(taskId, fieldId, value, orgFor(t?.project_id));
    if (t) runRulesRef.current?.(t, "custom_field", value, fieldId);
  }, [db, orgFor]);
  runRulesRef.current = async (task, field, value, oldValue) => {
    const active = R.current.rules.filter((r) => r.is_active && r.project_id === task.project_id); if (!active.length) return;
    const hit = (one, many) => (!one && !(many || []).length) || one === value || (many || []).includes(value);
    for (const rule of active) {
      const tc = rule.trigger_config || {}; let fire = false;
      if (rule.trigger_type === "task_moved_to_section") fire = field === "section_id" && hit(tc.section_id, tc.section_ids);
      else if (rule.trigger_type === "status_changed") fire = field === "status" && hit(tc.status, tc.statuses);
      else if (rule.trigger_type === "task_completed") fire = field === "status" && value === "done" && oldValue !== "done";
      else if (rule.trigger_type === "task_assigned") fire = field === "assignee_id" && hit(tc.assignee_id, tc.assignee_ids);
      else if (rule.trigger_type === "priority_changed") fire = field === "priority" && hit(tc.priority, tc.priorities);
      else if (rule.trigger_type === "task_created") fire = field === "__created";
      else if (rule.trigger_type === "custom_field_changed") fire = field === "custom_field" && (!tc.field_id || tc.field_id === oldValue);
      else if (rule.trigger_type === "due_date_approaching") fire = field === "__due" && oldValue === rule.id; // raised by the due-date sweep, one rule at a time
      if (!fire) continue;
      const ran = []; const set = (patch) => updateTask(task.id, patch, { undo: false, rules: false, celebrate: false });
      for (const a of rule.actions || []) {
        const c = a.config || {};
        try {
          if (a.type === "set_status" && c.status) await set({ status: c.status });
          else if (a.type === "move_to_section" && c.section_id) await set({ section_id: c.section_id });
          else if (a.type === "set_assignee") await set({ assignee_id: c.assignee_id || null });
          else if (a.type === "set_priority" && c.priority) await set({ priority: c.priority });
          else if (a.type === "mark_complete") await set({ status: "done" });
          else if (a.type === "add_comment" && c.comment) await db.from("comments").insert({ org_id: orgFor(task.project_id), entity_type: "task", entity_id: task.id, author_id: uid, content: `🤖 Auto: ${c.comment}` });
          else if (a.type === "set_due_date_offset" && c.days_offset != null) await set({ due_date: addDays(today(), Number(c.days_offset)) });
          else if (a.type === "set_custom_field" && c.field_id) { setFieldValues((p) => ({ ...p, [task.id]: { ...(p[task.id] || {}), [c.field_id]: c.value || "" } })); await writeFieldValue(task.id, c.field_id, c.value || "", orgFor(task.project_id)); }
          ran.push({ type: a.type, success: true });
        } catch (err) { ran.push({ type: a.type, success: false, error: err.message }); }
      }
      db.from("rule_executions").insert({ rule_id: rule.id, task_id: task.id, trigger_data: { field, value, old_value: oldValue }, actions_executed: ran, success: ran.every((x) => x.success) }).then(() => {}, () => {});
      db.from("project_rules").update({ run_count: (rule.run_count || 0) + 1, last_run_at: nowIso() }).eq("id", rule.id).then(() => {}, () => {});
    }
  };

  // ── sections ──
  const createSection = useCallback(async (pid, name, afterId) => {
    const list = R.current.sections.filter((s) => s.project_id === pid).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const at = afterId ? list.findIndex((s) => s.id === afterId) + 1 : list.length;
    const { data, error: e } = await db.from("sections").insert({ project_id: pid, org_id: orgFor(pid), name: name || "Untitled section", sort_order: at + 1 }).select().single();
    if (e || !data) { toast?.("Couldn't add the section"); return null; }
    const next = [...list.slice(0, at), data, ...list.slice(at)];
    setSections((p) => p.filter((s) => s.project_id !== pid).concat(next.map((s, i) => ({ ...s, sort_order: i + 1 }))));
    next.forEach((s, i) => { if (s.sort_order !== i + 1) db.from("sections").update({ sort_order: i + 1 }).eq("id", s.id).then(() => {}, () => {}); });
    return data;
  }, [db, orgFor, toast]);
  const updateSection = useCallback(async (id, patch) => { setSections((p) => p.map((s) => (s.id === id ? { ...s, ...patch } : s))); await db.from("sections").update(patch).eq("id", id); }, [db]);
  const reorderSections = useCallback(async (pid, orderedIds) => { setSections((p) => p.map((s) => (s.project_id === pid && orderedIds.includes(s.id) ? { ...s, sort_order: orderedIds.indexOf(s.id) + 1 } : s))); await Promise.all(orderedIds.map((id, i) => db.from("sections").update({ sort_order: i + 1 }).eq("id", id))); }, [db]);
  const deleteSection = useCallback(async (id, moveTo) => {
    const mine = R.current.tasks.filter((t) => t.section_id === id);
    if (mine.length) { setTasks((p) => p.map((t) => (t.section_id === id ? { ...t, section_id: moveTo || null } : t))); await db.from("tasks").update({ section_id: moveTo || null, updated_at: nowIso() }).eq("section_id", id); }
    setSections((p) => p.filter((s) => s.id !== id)); await db.from("sections").delete().eq("id", id);
  }, [db]);

  // ── projects ──
  const updateProject = useCallback(async (id, patch) => { const old = R.current.projects.find((p) => p.id === id); setProjects((p) => p.map((x) => (x.id === id ? { ...x, ...patch } : x))); const { error: e } = await db.from("projects").update(patch).eq("id", id); if (e) { setProjects((p) => p.map((x) => (x.id === id ? old : x))); toast?.("Couldn't save: " + e.message); } }, [db, toast]);
  const viewsOf = useCallback((p) => (Array.isArray(p?.settings?.views) && p.settings.views.length ? p.settings.views : defaultViews()), []);
  const saveViews = useCallback((pid, views) => { const p = R.current.projects.find((x) => x.id === pid); return updateProject(pid, { settings: { ...(p?.settings || {}), views } }); }, [updateProject]);
  const createProject = useCallback(async (f) => {
    const owner = f.owner_id || uid;
    const { data, error: e } = await db.from("projects").insert({ org_id: orgId, name: f.name.trim(), description: f.description || "", color: f.color, status: "active", visibility: f.visibility || "public", join_policy: f.join_policy || "invite_only", owner_id: owner, created_by: uid, default_view: f.default_view || "List", team_id: f.team_id || null, objective_id: f.objective_id || null, key_result_id: f.key_result_id || null, plm_program_id: f.plm_program_id || null, start_date: f.start_date || null, target_end_date: f.target_end_date || null, health: "on_track" }).select().single();
    if (e || !data) { toast?.("Couldn't create the project" + (e?.message ? ": " + e.message : "")); return null; }
    const secs = []; const defs = (f.sections ?? ["To do", "In progress", "Done"]).map((x) => (typeof x === "string" ? { name: x, is_complete_column: /^(done|complete|completed)$/i.test(x) } : x));
    for (let i = 0; i < defs.length; i++) { const { data: s } = await db.from("sections").insert({ project_id: data.id, org_id: orgId, name: defs[i].name, sort_order: i + 1, is_complete_column: !!defs[i].is_complete_column, wip_limit: defs[i].wip_limit || null }).select().single(); if (s) secs.push({ ...s, _src: defs[i] }); }
    let mem = [...new Set([uid, owner, ...(f.members || [])])];
    if (f.team_id) { const { data: tm } = await db.from("team_members").select("user_id").eq("team_id", f.team_id); mem = [...new Set([...mem, ...(tm || []).map((r) => r.user_id).filter(Boolean)])]; }
    for (const m of mem) { await db.from("project_members").insert({ project_id: data.id, user_id: m, role: m === owner ? "owner" : "member", org_id: orgId }); if (m !== uid) db.from("notifications").insert({ org_id: orgId, user_id: m, type: "project_added", title: `${myName()} added you to ${data.name}`, body: data.description || "You've been added to a project", entity_type: "project", entity_id: data.id, actor_id: uid, is_read: false, category: "assignment", metadata: { project_name: data.name } }).then(() => {}, () => {}); }
    setProjects((p) => p.concat(data).sort((a, b) => a.name.localeCompare(b.name))); setSections((p) => p.concat(secs.map(({ _src, ...s }) => s))); setMembers((p) => p.concat(mem.map((m) => ({ project_id: data.id, user_id: m, role: m === owner ? "owner" : "member" }))));
    return { ...data, _sections: secs };
  }, [db, orgId, uid, toast, people]);
  const toggleFavorite = useCallback(async (pid) => {
    const on = favorites.has(pid); setFavorites((s) => { const n = new Set(s); if (on) n.delete(pid); else n.add(pid); return n; });
    if (on) await db.from("project_favorites").delete().eq("user_id", uid).eq("project_id", pid); else await db.from("project_favorites").insert({ user_id: uid, project_id: pid, org_id: orgFor(pid) });
  }, [db, uid, favorites, orgFor]);
  const addMember = useCallback(async (pid, userId) => { if (R.current.members.some((m) => m.project_id === pid && m.user_id === userId)) return; const { data } = await db.from("project_members").insert({ project_id: pid, user_id: userId, role: "member", org_id: orgFor(pid) }).select().single(); setMembers((p) => p.concat(data || { project_id: pid, user_id: userId, role: "member" })); db.from("notifications").insert({ org_id: orgFor(pid), user_id: userId, type: "project_added", title: `${myName()} added you to ${projectsById[pid]?.name}`, body: "You've been added to a project", entity_type: "project", entity_id: pid, actor_id: uid, is_read: false, category: "assignment", metadata: { project_name: projectsById[pid]?.name } }).then(() => {}, () => {}); }, [db, orgFor, projectsById, people, uid]);
  const removeMember = useCallback(async (pid, userId) => { setMembers((p) => p.filter((m) => !(m.project_id === pid && m.user_id === userId))); await db.from("project_members").delete().eq("project_id", pid).eq("user_id", userId); }, [db]);

  // ── labels, dependencies, links, fields ──
  const toggleLabel = useCallback(async (taskId, labelId) => {
    const has = R.current.labelLinks.find((l) => l.task_id === taskId && l.label_id === labelId);
    if (has) { setLabelLinks((p) => p.filter((l) => l !== has)); await db.from("task_label_assignments").delete().eq("task_id", taskId).eq("label_id", labelId); }
    else { const t = R.current.tasks.find((x) => x.id === taskId); const row = { task_id: taskId, label_id: labelId, org_id: orgFor(t?.project_id) }; setLabelLinks((p) => p.concat(row)); await db.from("task_label_assignments").insert(row); }
  }, [db, orgFor]);
  const createLabel = useCallback(async (name, color) => { const { data } = await db.from("task_labels").insert({ org_id: orgId, name, color }).select().single(); if (data) setLabels((p) => p.concat(data).sort((a, b) => a.name.localeCompare(b.name))); return data; }, [db, orgId]);
  const addDep = useCallback(async (pre, suc) => {
    if (pre === suc || R.current.deps.some((d) => (d.predecessor_id === pre && d.successor_id === suc) || (d.predecessor_id === suc && d.successor_id === pre))) return;
    const t = R.current.tasks.find((x) => x.id === suc);
    const { data, error: e } = await db.from("task_dependencies").insert({ predecessor_id: pre, successor_id: suc, dependency_type: "finish_to_start", org_id: orgFor(t?.project_id) }).select().single();
    if (e || !data) toast?.("Couldn't add the dependency"); else setDeps((p) => p.concat(data));
  }, [db, orgFor, toast]);
  const removeDep = useCallback(async (id) => { setDeps((p) => p.filter((d) => d.id !== id)); await db.from("task_dependencies").delete().eq("id", id); }, [db]);
  const addLink = useCallback(async (taskId, pid, sectionId = null) => { if (R.current.links.some((l) => l.task_id === taskId && l.project_id === pid)) return; const { data } = await db.from("task_projects").insert({ task_id: taskId, project_id: pid, section_id: sectionId, org_id: orgFor(pid), created_by: uid }).select().single(); if (data) setLinks((p) => p.concat(data)); else toast?.("Couldn't add to that project"); }, [db, orgFor, uid, toast]);
  const removeLink = useCallback(async (id) => { setLinks((p) => p.filter((l) => l.id !== id)); await db.from("task_projects").delete().eq("id", id); }, [db]);
  const createField = useCallback(async (pid, f) => { const mx = R.current.fields.filter((x) => x.project_id === pid).reduce((m, x) => Math.max(m, x.sort_order || 0), 0); const { data, error: e } = await db.from("custom_fields").insert({ project_id: pid, org_id: orgFor(pid), name: f.name, field_type: f.field_type, options: f.options || [], sort_order: mx + 1 }).select().single(); if (e || !data) { toast?.("Couldn't add the field"); return null; } setFields((p) => p.concat(data)); return data; }, [db, orgFor, toast]);
  const deleteField = useCallback(async (id) => { setFields((p) => p.filter((f) => f.id !== id)); await db.from("custom_field_values").delete().eq("field_id", id); await db.from("custom_fields").delete().eq("id", id); }, [db]);

  // ── portfolios ──
  const savePortfolio = useCallback(async (pf) => {
    if (pf.id) { setPortfolios((p) => p.map((x) => (x.id === pf.id ? { ...x, ...pf } : x))); const { id, ...rest } = pf; await db.from("portfolios").update({ ...rest, updated_at: nowIso() }).eq("id", id); return pf; }
    const { data, error: e } = await db.from("portfolios").insert({ org_id: orgId, name: pf.name, description: pf.description || "", color: pf.color, project_ids: pf.project_ids || [], owner_id: uid, created_by: uid }).select().single();
    if (e || !data) { toast?.("Couldn't create the portfolio"); return null; } setPortfolios((p) => p.concat(data)); return data;
  }, [db, orgId, uid, toast]);
  const deletePortfolio = useCallback(async (id) => { setPortfolios((p) => p.filter((x) => x.id !== id)); await db.from("portfolios").update({ deleted_at: nowIso() }).eq("id", id); }, [db]);

  return {
    db, uid, orgId, external, isAdmin, loading, error,
    projects, projectsById, sections, sectionsOf, tasks, tasksById, tasksOf, childrenOf, people, peopleList, members, membersOf, assignable, teams,
    favorites, labels, labelsOfMap, deps, blockedByMap, links, fields, fieldValues, rules, portfolios, portfoliosReady, projectStats, undoStack,
    loadSubtasks, fetchTask, updateTask, updateTasks, createTask, deleteTasks, duplicateTask, completeTask, placeTasks, moveLink,
    createSection, updateSection, reorderSections, deleteSection, updateProject, createProject, viewsOf, saveViews, toggleFavorite, addMember, removeMember,
    toggleLabel, createLabel, addDep, removeDep, addLink, removeLink, createField, deleteField, setFieldValue, savePortfolio, deletePortfolio, undo, orgFor, notify, reload,
    // for the extras hook (rules, docs, forms, templates): direct setters and the rules engine
    toast, _set: { setTasks, setProjects, setSections, setMembers, setRules, setTeams, setLabelLinks, setFields, setFieldValues, setPeopleList }, _subLoaded: subLoaded, runRules: (...a) => runRulesRef.current?.(...a),
  };
}
