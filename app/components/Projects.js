"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";

/* ═══════════════════════════════════════════════════════
   CONFIG
   ═══════════════════════════════════════════════════════ */
const STATUS = {
  backlog:     { label: "Backlog",     color: "#6b7280", bg: "#1a1d2a" },
  todo:        { label: "To Do",       color: "#8b93a8", bg: "#1c2030" },
  in_progress: { label: "Working",     color: "#3b82f6", bg: "#1d3a6a" },
  in_review:   { label: "In Review",   color: "#a855f7", bg: "#2d1650" },
  done:        { label: "Done",        color: "#22c55e", bg: "#0d3a20" },
  cancelled:   { label: "Cancelled",   color: "#ef4444", bg: "#3d1111" },
};
const PRIORITY = {
  urgent:   { label: "Urgent",  color: "#fff",    bg: "#ef4444", dot: "#ef4444" },
  high:     { label: "High",    color: "#ef4444", bg: "#3d1111", dot: "#ef4444" },
  medium:   { label: "Medium",  color: "#eab308", bg: "#3d3000", dot: "#eab308" },
  low:      { label: "Low",     color: "#22c55e", bg: "#0d3a20", dot: "#22c55e" },
  none:     { label: "None",    color: "#6b7280", bg: "#1a1d2a", dot: "#6b7280" },
};
const SECTION_COLORS = ["#3b82f6", "#a855f7", "#22c55e", "#eab308", "#ef4444", "#ec4899", "#f97316", "#06b6d4"];
const AVATAR_COLORS = ["#3b82f6", "#a855f7", "#ec4899", "#06b6d4", "#f97316", "#22c55e", "#84cc16", "#ef4444"];

/* ═══════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════ */
export default function ProjectsView() {
  const [projects, setProjects] = useState([]);
  const [sections, setSections] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [activeProject, setActiveProject] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [addingTo, setAddingTo] = useState(null);
  const [newTitle, setNewTitle] = useState("");
  const [viewMode, setViewMode] = useState("list");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState({});
  const [editingCell, setEditingCell] = useState(null); // { taskId, field }
  const [hoveredRow, setHoveredRow] = useState(null);
  const [editingSectionId, setEditingSectionId] = useState(null);
  const [editingSectionName, setEditingSectionName] = useState("");
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [showProjectForm, setShowProjectForm] = useState(false); // "new" | "edit" | false
  const [projectForm, setProjectForm] = useState({ name: "", description: "", color: "#3b82f6", status: "active" });
  const [toast, setToast] = useState(null); // { message, type: "error" | "success" }
  const [expandedTasks, setExpandedTasks] = useState({}); // track which parent tasks show subtasks

  const showToast = useCallback((message, type = "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  /* ── Keyboard shortcuts ── */
  useEffect(() => {
    const fn = (e) => {
      if (e.key === "Escape") {
        if (showProjectForm) setShowProjectForm(false);
        else if (selectedTask) setSelectedTask(null);
        else if (editingSectionId) setEditingSectionId(null);
      }
    };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [showProjectForm, selectedTask, editingSectionId]);

  /* ── Data loading ── */
  useEffect(() => {
    (async () => {
      const [{ data: p }, { data: prof }] = await Promise.all([
        supabase.from("projects").select("*").is("deleted_at", null).order("name"),
        supabase.from("profiles").select("id,display_name,avatar_url"),
      ]);
      setProjects(p || []);
      const m = {}; (prof || []).forEach(u => { m[u.id] = u; }); setProfiles(m);
      if (p?.length) setActiveProject(p[0].id);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!activeProject) return;
    (async () => {
      const [{ data: s }, { data: t }] = await Promise.all([
        supabase.from("sections").select("*").eq("project_id", activeProject).order("sort_order"),
        supabase.from("tasks").select("*").eq("project_id", activeProject).is("deleted_at", null).order("sort_order"),
      ]);
      setSections(s || []); setTasks(t || []);
      setSelectedTask(null); setCollapsed({}); setEditingCell(null);
      setAddingTo(null); setAddingSection(false); setEditingSectionId(null); setSearch("");
    })();
  }, [activeProject]);

  /* ── Helpers ── */
  const ini = (uid) => { const u = profiles[uid]; return u?.display_name ? u.display_name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() : "?"; };
  const acol = (uid) => uid ? AVATAR_COLORS[uid.charCodeAt(uid.length - 1) % AVATAR_COLORS.length] : T.text3;
  const uname = (uid) => profiles[uid]?.display_name || "";
  const secColor = (i) => SECTION_COLORS[i % SECTION_COLORS.length];

  const proj = projects.find(p => p.id === activeProject);
  const done = tasks.filter(t => t.status === "done").length;
  const total = tasks.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const filt = search ? tasks.filter(t => t.title.toLowerCase().includes(search.toLowerCase())) : tasks;
  const getSubtasks = (parentId) => filt.filter(t => t.parent_task_id === parentId);
  const rootTasks = (sectionTasks) => sectionTasks.filter(t => !t.parent_task_id);

  /* ── Task mutations ── */
  const toggleDone = async (task, e) => {
    e?.stopPropagation();
    const isDone = task.status !== "done";
    const ns = isDone ? "done" : "todo";
    const updates = { status: ns, completed_at: isDone ? new Date().toISOString() : null };
    setTasks(p => p.map(t => t.id === task.id ? { ...t, ...updates } : t));
    if (selectedTask?.id === task.id) setSelectedTask(p => ({ ...p, ...updates }));
    const { error } = await supabase.from("tasks").update(updates).eq("id", task.id);
    if (error) showToast("Failed to update task status");
  };

  const updateField = async (taskId, field, value) => {
    setTasks(p => p.map(t => t.id === taskId ? { ...t, [field]: value } : t));
    if (selectedTask?.id === taskId) setSelectedTask(p => ({ ...p, [field]: value }));
    const { error } = await supabase.from("tasks").update({ [field]: value }).eq("id", taskId);
    if (error) showToast("Failed to update task");
    setEditingCell(null);
  };

  const deleteTask = async (taskId) => {
    setTasks(p => p.filter(t => t.id !== taskId));
    if (selectedTask?.id === taskId) setSelectedTask(null);
    const { error } = await supabase.from("tasks").update({ deleted_at: new Date().toISOString() }).eq("id", taskId);
    if (error) showToast("Failed to delete task");
  };

  const createTask = async (sid) => {
    if (!newTitle.trim()) { setAddingTo(null); return; }
    const sectionTasks = tasks.filter(t => t.section_id === sid);
    const maxSort = sectionTasks.reduce((m, t) => Math.max(m, t.sort_order || 0), 0);
    const { data, error } = await supabase.from("tasks").insert({
      org_id: proj.org_id, project_id: activeProject, section_id: sid,
      title: newTitle.trim(), status: "todo", priority: "medium",
      sort_order: maxSort + 1,
    }).select().single();
    if (error) { showToast("Failed to create task"); return; }
    if (data) { setTasks(p => [...p, data]); showToast("Task created", "success"); }
    setNewTitle(""); setAddingTo(null);
  };

  /* ── Section mutations ── */
  const createSection = async () => {
    if (!newSectionName.trim()) { setAddingSection(false); return; }
    const maxSort = sections.reduce((m, s) => Math.max(m, s.sort_order || 0), 0);
    const { data, error } = await supabase.from("sections").insert({
      project_id: activeProject, name: newSectionName.trim(), sort_order: maxSort + 1,
    }).select().single();
    if (error) { showToast("Failed to create section"); return; }
    if (data) setSections(p => [...p, data]);
    setNewSectionName(""); setAddingSection(false);
  };

  const renameSection = async (secId) => {
    if (!editingSectionName.trim()) { setEditingSectionId(null); return; }
    setSections(p => p.map(s => s.id === secId ? { ...s, name: editingSectionName.trim() } : s));
    const { error } = await supabase.from("sections").update({ name: editingSectionName.trim() }).eq("id", secId);
    if (error) showToast("Failed to rename section");
    setEditingSectionId(null);
  };

  const deleteSection = async (secId) => {
    const secTasks = tasks.filter(t => t.section_id === secId);
    if (secTasks.length > 0 && !confirm(`This section has ${secTasks.length} task(s). Delete section and all its tasks?`)) return;
    // Soft-delete tasks in section
    if (secTasks.length > 0) {
      setTasks(p => p.filter(t => t.section_id !== secId));
      await supabase.from("tasks").update({ deleted_at: new Date().toISOString() }).eq("section_id", secId);
    }
    setSections(p => p.filter(s => s.id !== secId));
    const { error } = await supabase.from("sections").delete().eq("id", secId);
    if (error) showToast("Failed to delete section");
  };

  const moveSectionUp = async (secId) => {
    const idx = sections.findIndex(s => s.id === secId);
    if (idx <= 0) return;
    const newSections = [...sections];
    [newSections[idx - 1], newSections[idx]] = [newSections[idx], newSections[idx - 1]];
    const updated = newSections.map((s, i) => ({ ...s, sort_order: i + 1 }));
    setSections(updated);
    await Promise.all(updated.map(s => supabase.from("sections").update({ sort_order: s.sort_order }).eq("id", s.id)));
  };

  const moveSectionDown = async (secId) => {
    const idx = sections.findIndex(s => s.id === secId);
    if (idx < 0 || idx >= sections.length - 1) return;
    const newSections = [...sections];
    [newSections[idx], newSections[idx + 1]] = [newSections[idx + 1], newSections[idx]];
    const updated = newSections.map((s, i) => ({ ...s, sort_order: i + 1 }));
    setSections(updated);
    await Promise.all(updated.map(s => supabase.from("sections").update({ sort_order: s.sort_order }).eq("id", s.id)));
  };

  /* ── Project mutations ── */
  const PROJECT_COLORS = ["#3b82f6", "#a855f7", "#22c55e", "#eab308", "#ef4444", "#ec4899", "#f97316", "#06b6d4", "#6366f1", "#14b8a6"];

  const openNewProject = () => {
    setProjectForm({ name: "", description: "", color: "#3b82f6", status: "active" });
    setShowProjectForm("new");
  };

  const openEditProject = () => {
    if (!proj) return;
    setProjectForm({ name: proj.name, description: proj.description || "", color: proj.color || "#3b82f6", status: proj.status || "active" });
    setShowProjectForm("edit");
  };

  const saveProject = async () => {
    if (!projectForm.name.trim()) return;
    if (showProjectForm === "new") {
      const orgId = projects[0]?.org_id || "a0000000-0000-0000-0000-000000000001";
      const { data, error } = await supabase.from("projects").insert({
        org_id: orgId, name: projectForm.name.trim(), description: projectForm.description.trim() || null,
        color: projectForm.color, status: projectForm.status, visibility: "public", default_view: "list",
      }).select().single();
      if (error) { showToast("Failed to create project"); return; }
      if (data) {
        setProjects(p => [...p, data].sort((a, b) => a.name.localeCompare(b.name)));
        setActiveProject(data.id);
        // Create a default section
        await supabase.from("sections").insert({ project_id: data.id, name: "To Do", sort_order: 1 });
        const { data: newSecs } = await supabase.from("sections").select("*").eq("project_id", data.id).order("sort_order");
        setSections(newSecs || []); setTasks([]);
      }
    } else {
      setProjects(p => p.map(pr => pr.id === activeProject ? { ...pr, ...projectForm } : pr));
      const { error } = await supabase.from("projects").update({
        name: projectForm.name.trim(), description: projectForm.description.trim() || null,
        color: projectForm.color, status: projectForm.status,
      }).eq("id", activeProject);
      if (error) showToast("Failed to update project");
    }
    setShowProjectForm(false);
  };

  const archiveProject = async () => {
    if (!confirm("Archive this project? It will be hidden from the list.")) return;
    setProjects(p => p.filter(pr => pr.id !== activeProject));
    await supabase.from("projects").update({ status: "archived", deleted_at: new Date().toISOString() }).eq("id", activeProject);
    setActiveProject(projects.find(p => p.id !== activeProject)?.id || null);
    setSections([]); setTasks([]); setSelectedTask(null);
  };

  if (loading) return (
    <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
      <div style={{ width: 24, height: 24, border: `3px solid ${T.surface3}`, borderTopColor: T.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <span style={{ color: T.text3, fontSize: 13 }}>Loading projects…</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } } @keyframes fadeIn { from { opacity: 0; transform: translateX(-50%) translateY(10px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }`}</style>
    </div>
  );

  /* ═══════════════════════════════════════════════════════
     REUSABLE COMPONENTS
     ═══════════════════════════════════════════════════════ */

  /* ── Checkbox (Asana-style circle) ── */
  const Check = ({ on, fn, sz = 18 }) => (
    <div onClick={fn} style={{
      width: sz, height: sz, borderRadius: "50%", flexShrink: 0, cursor: "pointer",
      border: `2px solid ${on ? "#22c55e" : "#3f4760"}`,
      background: on ? "#22c55e" : "transparent",
      display: "flex", alignItems: "center", justifyContent: "center",
      transition: "all 0.2s ease",
    }}>
      {on && <svg width={sz * 0.55} height={sz * 0.55} viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
    </div>
  );

  /* ── Avatar ── */
  const Ava = ({ uid, sz = 24 }) => {
    if (!uid) return <div style={{ width: sz, height: sz }} />;
    const c = acol(uid);
    return (
      <div title={uname(uid)} style={{
        width: sz, height: sz, borderRadius: "50%",
        background: `${c}18`, border: `1.5px solid ${c}50`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: Math.max(sz * 0.38, 9), fontWeight: 700, color: c, flexShrink: 0,
        letterSpacing: "-0.02em",
      }}>{ini(uid)}</div>
    );
  };

  /* ── Inline-editable Status Pill (Monday style) ── */
  const StatusCell = ({ task }) => {
    const editing = editingCell?.taskId === task.id && editingCell?.field === "status";
    const cfg = STATUS[task.status] || STATUS.todo;
    return (
      <div style={{ position: "relative" }}>
        <div onClick={(e) => { e.stopPropagation(); setEditingCell(editing ? null : { taskId: task.id, field: "status" }); }}
          style={{
            display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 4,
            fontSize: 11, fontWeight: 600, cursor: "pointer", userSelect: "none",
            background: cfg.bg, color: cfg.color, transition: "all 0.15s",
            border: editing ? `1px solid ${cfg.color}` : "1px solid transparent",
          }}>{cfg.label}</div>
        {editing && (
          <Dropdown onClose={() => setEditingCell(null)}>
            {Object.entries(STATUS).map(([k, v]) => (
              <DropdownItem key={k} onClick={() => updateField(task.id, "status", k)}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: v.color, flexShrink: 0 }} />
                <span style={{ color: v.color }}>{v.label}</span>
              </DropdownItem>
            ))}
          </Dropdown>
        )}
      </div>
    );
  };

  /* ── Inline-editable Priority Pill ── */
  const PriorityCell = ({ task }) => {
    const editing = editingCell?.taskId === task.id && editingCell?.field === "priority";
    const cfg = PRIORITY[task.priority];
    return (
      <div style={{ position: "relative" }}>
        <div onClick={(e) => { e.stopPropagation(); setEditingCell(editing ? null : { taskId: task.id, field: "priority" }); }}
          style={{
            display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 4,
            fontSize: 11, fontWeight: 600, cursor: "pointer", userSelect: "none",
            background: cfg?.bg || T.surface3, color: cfg?.color || T.text3,
            border: editing ? `1px solid ${cfg?.color || T.text3}` : "1px solid transparent",
            transition: "all 0.15s",
          }}>
          {cfg && <span style={{ width: 6, height: 6, borderRadius: 6, background: cfg.dot }} />}
          {cfg?.label || "—"}
        </div>
        {editing && (
          <Dropdown onClose={() => setEditingCell(null)}>
            {Object.entries(PRIORITY).map(([k, v]) => (
              <DropdownItem key={k} onClick={() => updateField(task.id, "priority", k)}>
                <span style={{ width: 6, height: 6, borderRadius: 6, background: v.dot }} />
                <span style={{ color: v.color }}>{v.label}</span>
              </DropdownItem>
            ))}
          </Dropdown>
        )}
      </div>
    );
  };

  /* ── Inline Assignee Picker ── */
  const AssigneeCell = ({ task }) => {
    const editing = editingCell?.taskId === task.id && editingCell?.field === "assignee";
    return (
      <div style={{ position: "relative" }}>
        <div onClick={(e) => { e.stopPropagation(); setEditingCell(editing ? null : { taskId: task.id, field: "assignee" }); }}
          style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", padding: "2px 4px", borderRadius: 4, border: editing ? `1px solid ${T.accent}` : "1px solid transparent" }}>
          <Ava uid={task.assignee_id} sz={22} />
          <span style={{ fontSize: 12, color: task.assignee_id ? T.text2 : T.text3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {task.assignee_id ? uname(task.assignee_id) : "—"}
          </span>
        </div>
        {editing && (
          <Dropdown onClose={() => setEditingCell(null)} wide>
            <DropdownItem onClick={() => updateField(task.id, "assignee_id", null)}>
              <span style={{ color: T.text3 }}>Unassigned</span>
            </DropdownItem>
            {Object.values(profiles).sort((a, b) => (a.display_name || "").localeCompare(b.display_name || "")).map(p => (
              <DropdownItem key={p.id} onClick={() => updateField(task.id, "assignee_id", p.id)}>
                <Ava uid={p.id} sz={18} />
                <span>{p.display_name}</span>
              </DropdownItem>
            ))}
          </Dropdown>
        )}
      </div>
    );
  };

  /* ── Inline Date Picker ── */
  const DateCell = ({ task }) => {
    const overdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== "done";
    return (
      <div style={{ position: "relative" }}>
        <input type="date" value={task.due_date || ""}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => updateField(task.id, "due_date", e.target.value || null)}
          style={{
            fontSize: 12, color: overdue ? "#ef4444" : T.text3, background: "transparent",
            border: "none", outline: "none", cursor: "pointer", fontFamily: "inherit",
            colorScheme: "dark", padding: "2px 0", width: 90,
          }}
        />
      </div>
    );
  };

  /* ── Add task row ── */
  const AddRow = ({ sid }) => addingTo === sid ? (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px 8px 44px", borderBottom: `1px solid ${T.border}` }}>
      <input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") createTask(sid); if (e.key === "Escape") { setAddingTo(null); setNewTitle(""); } }}
        placeholder="Task name…" style={{ flex: 1, fontSize: 13, color: T.text, background: "transparent", border: "none", outline: "none", fontFamily: "inherit" }} />
      <button onClick={() => createTask(sid)} style={{ padding: "3px 10px", fontSize: 11, fontWeight: 600, borderRadius: 4, border: "none", background: T.accent, color: "#fff", cursor: "pointer" }}>Add</button>
      <button onClick={() => { setAddingTo(null); setNewTitle(""); }} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 16, padding: "0 4px" }}>×</button>
    </div>
  ) : (
    <div onClick={() => { setAddingTo(sid); setNewTitle(""); }} style={{ padding: "6px 12px 6px 44px", cursor: "pointer", color: T.text3, fontSize: 13, borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 6, transition: "color 0.15s" }}>
      <span style={{ fontSize: 15, fontWeight: 300, lineHeight: 1 }}>+</span> Add task…
    </div>
  );

  /* ═══════════════════════════════════════════════════════
     SIDEBAR
     ═══════════════════════════════════════════════════════ */
  const sidebar = (
    <div style={{ width: 248, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", background: T.bg, flexShrink: 0 }}>
      <div style={{ padding: "20px 20px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: T.text3, letterSpacing: "0.1em", textTransform: "uppercase" }}>Projects</span>
        <button onClick={openNewProject} title="New project" style={{ background: "none", border: "none", cursor: "pointer", color: T.text3, fontSize: 16, lineHeight: 1, padding: "0 2px" }}>+</button>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "0 8px 16px" }}>
        {projects.map(p => {
          const on = activeProject === p.id;
          // Compute per-project task counts (we already have full data for active project)
          return (
            <button key={p.id} onClick={() => setActiveProject(p.id)} style={{
              width: "100%", textAlign: "left", padding: "9px 12px", borderRadius: 8, border: "none",
              cursor: "pointer", display: "flex", alignItems: "center", gap: 10, fontSize: 13, marginBottom: 1,
              background: on ? `${T.accent}15` : "transparent",
              color: on ? T.text : T.text2, transition: "all 0.12s",
            }}>
              <div style={{
                width: 26, height: 26, borderRadius: 6, flexShrink: 0,
                background: p.color || T.accent,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 800, color: "#fff",
              }}>{p.name.charAt(0).toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: on ? 600 : 400 }}>{p.name}</div>
            </button>
          );
        })}
      </div>
    </div>
  );

  /* ═══════════════════════════════════════════════════════
     HEADER
     ═══════════════════════════════════════════════════════ */
  const header = proj && (
    <div style={{ padding: "20px 28px 0", borderBottom: `1px solid ${T.border}`, background: T.surface }}>
      {/* Title row */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: proj.color || T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, color: "#fff" }}>{proj.name.charAt(0)}</div>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>{proj.name}</h2>
          {proj.owner_id && profiles[proj.owner_id] && <div style={{ fontSize: 12, color: T.text3, marginTop: 2 }}>Owned by {uname(proj.owner_id)}</div>}
        </div>
        {/* Project actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginRight: 16 }}>
          <button onClick={openEditProject} title="Edit project" style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, cursor: "pointer", color: T.text3, fontSize: 11, padding: "5px 10px", fontWeight: 600 }}>Edit</button>
          <button onClick={archiveProject} title="Archive project" style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, cursor: "pointer", color: "#ef4444", fontSize: 11, padding: "5px 10px", fontWeight: 600 }}>Archive</button>
        </div>
        {/* Progress */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: T.green, lineHeight: 1 }}>{pct}%</div>
            <div style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>{done} of {total} done</div>
          </div>
          <div style={{ width: 36, height: 36, position: "relative" }}>
            <svg width={36} height={36} style={{ transform: "rotate(-90deg)" }}>
              <circle cx={18} cy={18} r={15} fill="none" stroke={T.surface3} strokeWidth={3} />
              <circle cx={18} cy={18} r={15} fill="none" stroke={T.green} strokeWidth={3}
                strokeDasharray={`${pct * 0.94} 100`} strokeLinecap="round"
                style={{ transition: "stroke-dasharray 0.5s ease" }} />
            </svg>
          </div>
        </div>
      </div>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
        {[
          { k: "list",  l: "List",  icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="2" width="14" height="2" rx="1"/><rect x="1" y="7" width="14" height="2" rx="1"/><rect x="1" y="12" width="14" height="2" rx="1"/></svg> },
          { k: "board", l: "Board", icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="4" height="14" rx="1"/><rect x="6" y="1" width="4" height="10" rx="1"/><rect x="11" y="1" width="4" height="7" rx="1"/></svg> },
        ].map(v => (
          <button key={v.k} onClick={() => setViewMode(v.k)} style={{
            padding: "9px 16px", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500,
            background: "transparent", color: viewMode === v.k ? T.text : T.text3,
            borderBottom: `2px solid ${viewMode === v.k ? T.accent : "transparent"}`,
            display: "flex", alignItems: "center", gap: 7, transition: "all 0.15s",
          }}>{v.icon}{v.l}</button>
        ))}
        <div style={{ flex: 1 }} />
        {/* Search */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", marginBottom: 6,
          background: T.surface2, borderRadius: 6, border: `1px solid ${search ? T.accent : T.border}`,
          width: search ? 220 : 160, transition: "all 0.2s",
        }}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill={T.text3}><circle cx="7" cy="7" r="5.5" fill="none" stroke={T.text3} strokeWidth="2"/><line x1="11" y1="11" x2="15" y2="15" stroke={T.text3} strokeWidth="2" strokeLinecap="round"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks…"
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: T.text, fontSize: 12, fontFamily: "inherit" }} />
          {search && <button onClick={() => setSearch("")} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>}
        </div>
      </div>
    </div>
  );

  /* ═══════════════════════════════════════════════════════
     LIST VIEW (Asana-style)
     ═══════════════════════════════════════════════════════ */
  const listView = (
    <div style={{ flex: 1, overflow: "auto" }} onClick={() => setEditingCell(null)}>
      {sections.length === 0 && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 20px", gap: 10 }}>
          <div style={{ fontSize: 13, color: T.text3 }}>This project has no sections yet</div>
          <button onClick={() => { setAddingSection(true); setNewSectionName(""); }}
            style={{ padding: "6px 14px", fontSize: 12, fontWeight: 600, borderRadius: 6, border: "none", background: T.accent, color: "#fff", cursor: "pointer" }}>Add a section</button>
        </div>
      )}
      {sections.map((sec, si) => {
        const st = filt.filter(t => t.section_id === sec.id);
        const sd = st.filter(t => t.status === "done").length;
        const cl = collapsed[sec.id];
        const sc = secColor(si);
        return (
          <div key={sec.id}>
            {/* Section header */}
            <div style={{
              display: "flex", alignItems: "center", gap: 0,
              padding: "10px 28px", cursor: "pointer", userSelect: "none",
              background: T.surface, borderBottom: `1px solid ${T.border}`,
              position: "sticky", top: 0, zIndex: 2,
            }}>
              {/* Color bar */}
              <div style={{ width: 4, height: 20, borderRadius: 2, background: sc, marginRight: 12, flexShrink: 0 }} />
              <svg onClick={() => setCollapsed(p => ({ ...p, [sec.id]: !p[sec.id] }))} width="10" height="10" viewBox="0 0 10 10" fill={T.text3} style={{ transition: "transform 0.2s", transform: cl ? "rotate(-90deg)" : "rotate(0)", marginRight: 10, flexShrink: 0, cursor: "pointer" }}>
                <path d="M2 3l3 3.5L8 3" fill="none" stroke={T.text3} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {editingSectionId === sec.id ? (
                <input autoFocus value={editingSectionName}
                  onChange={e => setEditingSectionName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") renameSection(sec.id); if (e.key === "Escape") setEditingSectionId(null); }}
                  onBlur={() => renameSection(sec.id)}
                  onClick={e => e.stopPropagation()}
                  style={{ fontSize: 14, fontWeight: 700, color: T.text, background: T.surface2, border: `1px solid ${T.accent}`, borderRadius: 4, outline: "none", padding: "2px 8px", fontFamily: "inherit" }} />
              ) : (
                <span onDoubleClick={(e) => { e.stopPropagation(); setEditingSectionId(sec.id); setEditingSectionName(sec.name); }}
                  onClick={() => setCollapsed(p => ({ ...p, [sec.id]: !p[sec.id] }))}
                  style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{sec.name}</span>
              )}
              <span style={{ fontSize: 11, color: T.text3, marginLeft: 8 }} onClick={() => setCollapsed(p => ({ ...p, [sec.id]: !p[sec.id] }))}>{sd}/{st.length}</span>
              {st.length > 0 && (
                <div style={{ width: 48, height: 3, borderRadius: 3, background: T.surface3, overflow: "hidden", marginLeft: 10 }}>
                  <div style={{ width: `${st.length > 0 ? (sd / st.length) * 100 : 0}%`, height: "100%", borderRadius: 3, background: sc, transition: "width 0.3s" }} />
                </div>
              )}
              <div style={{ flex: 1 }} />
              {/* Section actions */}
              <div style={{ display: "flex", alignItems: "center", gap: 2 }} onClick={e => e.stopPropagation()}>
                {si > 0 && <button onClick={() => moveSectionUp(sec.id)} title="Move up" style={{ background: "none", border: "none", cursor: "pointer", color: T.text3, fontSize: 14, padding: "2px 4px", lineHeight: 1 }}>↑</button>}
                {si < sections.length - 1 && <button onClick={() => moveSectionDown(sec.id)} title="Move down" style={{ background: "none", border: "none", cursor: "pointer", color: T.text3, fontSize: 14, padding: "2px 4px", lineHeight: 1 }}>↓</button>}
                <button onClick={() => { setEditingSectionId(sec.id); setEditingSectionName(sec.name); }} title="Rename" style={{ background: "none", border: "none", cursor: "pointer", color: T.text3, fontSize: 12, padding: "2px 4px", lineHeight: 1 }}>✏️</button>
                <button onClick={() => deleteSection(sec.id)} title="Delete section" style={{ background: "none", border: "none", cursor: "pointer", color: T.text3, fontSize: 12, padding: "2px 4px", lineHeight: 1 }}>🗑</button>
              </div>
            </div>
            {/* Column headers */}
            {!cl && st.length > 0 && (
              <div style={{
                display: "grid", gridTemplateColumns: "40px 1fr 90px 90px 150px 100px",
                gap: 0, padding: "0 28px", alignItems: "center", height: 28,
                fontSize: 10, fontWeight: 600, color: T.text3, textTransform: "uppercase", letterSpacing: "0.06em",
                borderBottom: `1px solid ${T.border}`, background: T.bg,
              }}>
                <span /><span style={{ paddingLeft: 4 }}>Task name</span><span>Status</span><span>Priority</span><span>Assignee</span><span>Due date</span>
              </div>
            )}
            {/* Task rows */}
            {!cl && rootTasks(st).map(task => {
              const sel = selectedTask?.id === task.id;
              const dn = task.status === "done";
              const hov = hoveredRow === task.id;
              const subs = getSubtasks(task.id);
              const expanded = expandedTasks[task.id];
              return (
                <div key={task.id}>
                  <div
                    onMouseEnter={() => setHoveredRow(task.id)}
                    onMouseLeave={() => setHoveredRow(null)}
                    onClick={() => setSelectedTask(task)}
                    style={{
                      display: "grid", gridTemplateColumns: "40px 1fr 90px 90px 150px 100px",
                      gap: 0, padding: "0 28px", alignItems: "center", height: 38,
                      cursor: "pointer", borderBottom: `1px solid ${T.border}`,
                      background: sel ? `${T.accent}10` : hov ? `${T.text}06` : "transparent",
                      borderLeft: sel ? `3px solid ${T.accent}` : "3px solid transparent",
                      transition: "background 0.1s",
                    }}>
                    {/* Checkbox */}
                    <div style={{ display: "flex", justifyContent: "center" }}>
                      <Check on={dn} fn={e => toggleDone(task, e)} sz={17} />
                    </div>
                    {/* Title */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden", paddingLeft: 4, paddingRight: 8 }}>
                      {subs.length > 0 && (
                        <svg onClick={e => { e.stopPropagation(); setExpandedTasks(p => ({ ...p, [task.id]: !p[task.id] })); }}
                          width="10" height="10" viewBox="0 0 10 10" style={{ flexShrink: 0, cursor: "pointer", transition: "transform 0.15s", transform: expanded ? "rotate(0)" : "rotate(-90deg)" }}>
                          <path d="M2 3l3 3.5L8 3" fill="none" stroke={T.text3} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                      <span style={{
                        fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        textDecoration: dn ? "line-through" : "none",
                        color: dn ? T.text3 : T.text, fontWeight: sel ? 600 : 400,
                      }}>{task.title}</span>
                      {subs.length > 0 && (
                        <span style={{ fontSize: 10, color: T.text3, background: T.surface3, borderRadius: 8, padding: "1px 6px", flexShrink: 0 }}>
                          {subs.filter(s => s.status === "done").length}/{subs.length}
                        </span>
                      )}
                      {hov && (
                        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, opacity: 0.4 }}>
                          <path d="M6 3l5 5-5 5" stroke={T.text2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      )}
                    </div>
                    <StatusCell task={task} />
                    <PriorityCell task={task} />
                    <AssigneeCell task={task} />
                    <DateCell task={task} />
                  </div>
                  {/* Subtasks */}
                  {expanded && subs.map(sub => {
                    const subSel = selectedTask?.id === sub.id;
                    const subDn = sub.status === "done";
                    const subHov = hoveredRow === sub.id;
                    return (
                      <div key={sub.id}
                        onMouseEnter={() => setHoveredRow(sub.id)}
                        onMouseLeave={() => setHoveredRow(null)}
                        onClick={() => setSelectedTask(sub)}
                        style={{
                          display: "grid", gridTemplateColumns: "40px 1fr 90px 90px 150px 100px",
                          gap: 0, padding: "0 28px", alignItems: "center", height: 34,
                          cursor: "pointer", borderBottom: `1px solid ${T.border}`,
                          background: subSel ? `${T.accent}10` : subHov ? `${T.text}06` : `${T.surface}80`,
                          borderLeft: subSel ? `3px solid ${T.accent}` : "3px solid transparent",
                        }}>
                        <div style={{ display: "flex", justifyContent: "center" }}>
                          <Check on={subDn} fn={e => toggleDone(sub, e)} sz={15} />
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden", paddingLeft: 28, paddingRight: 8 }}>
                          <span style={{ fontSize: 12, color: subDn ? T.text3 : T.text2, textDecoration: subDn ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub.title}</span>
                        </div>
                        <StatusCell task={sub} />
                        <PriorityCell task={sub} />
                        <AssigneeCell task={sub} />
                        <DateCell task={sub} />
                      </div>
                    );
                  })}
                </div>
              );
            })}
            {/* Add task */}
            {/* Empty section message */}
            {!cl && st.length === 0 && (
              <div style={{ padding: "16px 28px 8px 52px", color: T.text3, fontSize: 12, fontStyle: "italic" }}>No tasks in this section</div>
            )}
            {!cl && <AddRow sid={sec.id} />}
          </div>
        );
      })}
      {/* Add section */}
      {addingSection ? (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 28px", borderBottom: `1px solid ${T.border}`, background: T.surface }}>
          <input autoFocus value={newSectionName} onChange={e => setNewSectionName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") createSection(); if (e.key === "Escape") { setAddingSection(false); setNewSectionName(""); } }}
            placeholder="Section name…" style={{ flex: 1, fontSize: 14, fontWeight: 700, color: T.text, background: "transparent", border: "none", outline: "none", fontFamily: "inherit" }} />
          <button onClick={createSection} style={{ padding: "3px 10px", fontSize: 11, fontWeight: 600, borderRadius: 4, border: "none", background: T.accent, color: "#fff", cursor: "pointer" }}>Add</button>
          <button onClick={() => { setAddingSection(false); setNewSectionName(""); }} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 16, padding: "0 4px" }}>×</button>
        </div>
      ) : (
        <div onClick={() => { setAddingSection(true); setNewSectionName(""); }} style={{ padding: "10px 28px", cursor: "pointer", color: T.text3, fontSize: 13, borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 6, transition: "color 0.15s" }}>
          <span style={{ fontSize: 15, fontWeight: 300, lineHeight: 1 }}>+</span> Add section…
        </div>
      )}
    </div>
  );

  /* ═══════════════════════════════════════════════════════
     BOARD VIEW
     ═══════════════════════════════════════════════════════ */
  const boardView = (
    <div style={{ flex: 1, overflow: "auto", padding: "20px 28px 28px", display: "flex", gap: 16 }}>
      {sections.map((sec, si) => {
        const st = filt.filter(t => t.section_id === sec.id);
        const sc = secColor(si);
        return (
          <div key={sec.id} style={{ minWidth: 290, width: 290, flexShrink: 0 }}>
            {/* Column header with color bar */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ height: 3, borderRadius: 3, background: sc, marginBottom: 10 }} />
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{sec.name}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: T.text3, background: T.surface3, borderRadius: 10, padding: "1px 8px" }}>{st.length}</span>
              </div>
            </div>
            {/* Cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {st.map(task => {
                const dn = task.status === "done";
                const sel = selectedTask?.id === task.id;
                const pcfg = PRIORITY[task.priority];
                return (
                  <div key={task.id} onClick={() => setSelectedTask(task)} style={{
                    background: T.surface2, borderRadius: 10, padding: "12px 14px", cursor: "pointer",
                    border: `1px solid ${sel ? T.accent : T.border}`,
                    opacity: dn ? 0.5 : 1, transition: "all 0.15s", position: "relative",
                  }}>
                    {pcfg && <div style={{ position: "absolute", left: 0, top: 10, bottom: 10, width: 3, borderRadius: "0 3px 3px 0", background: pcfg.dot }} />}
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <Check on={dn} fn={e => toggleDone(task, e)} sz={17} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 13, fontWeight: 500, lineHeight: 1.4, marginBottom: 10,
                          textDecoration: dn ? "line-through" : "none", color: dn ? T.text3 : T.text,
                        }}>{task.title}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          {task.status && task.status !== "todo" && (
                            <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 4, background: STATUS[task.status]?.bg, color: STATUS[task.status]?.color }}>{STATUS[task.status]?.label}</span>
                          )}
                          {pcfg && (
                            <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 4, background: pcfg.bg, color: pcfg.color, display: "flex", alignItems: "center", gap: 3 }}>
                              <span style={{ width: 5, height: 5, borderRadius: 5, background: pcfg.dot }} />{pcfg.label}
                            </span>
                          )}
                          {task.due_date && (
                            <span style={{ fontSize: 10, color: new Date(task.due_date) < new Date() && !dn ? "#ef4444" : T.text3, fontWeight: 500 }}>
                              {new Date(task.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </span>
                          )}
                          <div style={{ flex: 1 }} />
                          <Ava uid={task.assignee_id} sz={22} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Add task */}
            {addingTo === sec.id ? (
              <div style={{ padding: "8px 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: T.surface2, borderRadius: 8, border: `1px solid ${T.accent}` }}>
                  <input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") createTask(sec.id); if (e.key === "Escape") { setAddingTo(null); setNewTitle(""); } }}
                    placeholder="Task name…" style={{ flex: 1, fontSize: 13, color: T.text, background: "transparent", border: "none", outline: "none", fontFamily: "inherit" }} />
                  <button onClick={() => createTask(sec.id)} style={{ padding: "3px 10px", fontSize: 11, fontWeight: 600, borderRadius: 4, border: "none", background: T.accent, color: "#fff", cursor: "pointer" }}>Add</button>
                  <button onClick={() => { setAddingTo(null); setNewTitle(""); }} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 16 }}>×</button>
                </div>
              </div>
            ) : (
              <button onClick={() => { setAddingTo(sec.id); setNewTitle(""); }} style={{
                width: "100%", padding: "8px 12px", borderRadius: 8, border: "none", marginTop: 8,
                background: "transparent", color: T.text3, cursor: "pointer", fontSize: 12,
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <span style={{ fontSize: 16, fontWeight: 300, lineHeight: 1 }}>+</span> Add task
              </button>
            )}
          </div>
        );
      })}
      {/* Add section column */}
      <div style={{ minWidth: 290, width: 290, flexShrink: 0 }}>
        {addingSection ? (
          <div style={{ background: T.surface2, borderRadius: 10, padding: 12 }}>
            <input autoFocus value={newSectionName} onChange={e => setNewSectionName(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") createSection(); if (e.key === "Escape") { setAddingSection(false); setNewSectionName(""); } }}
              placeholder="Section name…" style={{ width: "100%", fontSize: 14, fontWeight: 700, color: T.text, background: "transparent", border: "none", outline: "none", fontFamily: "inherit", marginBottom: 8 }} />
            <div style={{ display: "flex", gap: 6 }}>
              <button onClick={createSection} style={{ padding: "3px 10px", fontSize: 11, fontWeight: 600, borderRadius: 4, border: "none", background: T.accent, color: "#fff", cursor: "pointer" }}>Add</button>
              <button onClick={() => { setAddingSection(false); setNewSectionName(""); }} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 16 }}>×</button>
            </div>
          </div>
        ) : (
          <button onClick={() => { setAddingSection(true); setNewSectionName(""); }} style={{
            width: "100%", padding: "12px", borderRadius: 10, border: `1px dashed ${T.border2}`,
            background: "transparent", color: T.text3, cursor: "pointer", fontSize: 13, fontWeight: 600,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}>
            <span style={{ fontSize: 16, fontWeight: 300, lineHeight: 1 }}>+</span> Add section
          </button>
        )}
      </div>
    </div>
  );

  /* ═══════════════════════════════════════════════════════
     DETAIL PANEL (Asana-style slide-over)
     ═══════════════════════════════════════════════════════ */
  const detail = selectedTask && (
    <div style={{
      width: 400, borderLeft: `1px solid ${T.border}`, display: "flex", flexDirection: "column",
      background: T.surface, flexShrink: 0, overflow: "hidden",
    }}>
      {/* Panel header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 20px", borderBottom: `1px solid ${T.border}`, flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Check on={selectedTask.status === "done"} fn={e => toggleDone(selectedTask, e)} sz={20} />
          <span style={{ fontSize: 12, color: selectedTask.status === "done" ? T.green : T.text3, fontWeight: 500 }}>
            {selectedTask.status === "done" ? "Completed" : "Mark complete"}
          </span>
        </div>
        <button onClick={() => setSelectedTask(null)} style={{
          background: T.surface2, border: `1px solid ${T.border}`, color: T.text3, cursor: "pointer",
          width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8" stroke={T.text3} strokeWidth="1.5" strokeLinecap="round"/></svg>
        </button>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>
        {/* Title */}
        <input value={selectedTask.title}
          onChange={e => { const v = e.target.value; setSelectedTask(p => ({ ...p, title: v })); setTasks(p => p.map(t => t.id === selectedTask.id ? { ...t, title: v } : t)); }}
          onBlur={() => supabase.from("tasks").update({ title: selectedTask.title }).eq("id", selectedTask.id)}
          onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
          style={{ fontSize: 20, fontWeight: 700, color: T.text, lineHeight: 1.3, background: "transparent", border: "none", outline: "none", padding: 0, width: "100%", marginBottom: 24 }} />
        {/* Fields */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <PanelField icon="👤" label="Assignee">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Ava uid={selectedTask.assignee_id} sz={24} />
              <select value={selectedTask.assignee_id || ""} onChange={e => updateField(selectedTask.id, "assignee_id", e.target.value || null)}
                style={{ fontSize: 13, color: T.text, background: "transparent", border: "none", outline: "none", cursor: "pointer", fontFamily: "inherit", flex: 1 }}>
                <option value="">Unassigned</option>
                {Object.values(profiles).sort((a, b) => (a.display_name || "").localeCompare(b.display_name || "")).map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
              </select>
            </div>
          </PanelField>
          <PanelField icon="📅" label="Due date">
            <input type="date" value={selectedTask.due_date || ""} onChange={e => updateField(selectedTask.id, "due_date", e.target.value || null)}
              style={{ fontSize: 13, color: T.text, background: "transparent", border: "none", outline: "none", cursor: "pointer", colorScheme: "dark", fontFamily: "inherit" }} />
          </PanelField>
          <PanelField icon="🎯" label="Priority">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {PRIORITY[selectedTask.priority] && <span style={{ width: 8, height: 8, borderRadius: 8, background: PRIORITY[selectedTask.priority].dot }} />}
              <select value={selectedTask.priority || ""} onChange={e => updateField(selectedTask.id, "priority", e.target.value || null)}
                style={{ fontSize: 13, color: T.text, background: "transparent", border: "none", outline: "none", cursor: "pointer", fontFamily: "inherit" }}>
                <option value="none">None</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
              </select>
            </div>
          </PanelField>
          <PanelField icon="📋" label="Status">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: STATUS[selectedTask.status]?.color || T.text3 }} />
              <select value={selectedTask.status || "todo"} onChange={e => updateField(selectedTask.id, "status", e.target.value)}
                style={{ fontSize: 13, color: T.text, background: "transparent", border: "none", outline: "none", cursor: "pointer", fontFamily: "inherit" }}>
                <option value="backlog">Backlog</option><option value="todo">To Do</option><option value="in_progress">In Progress</option><option value="in_review">In Review</option><option value="done">Done</option><option value="cancelled">Cancelled</option>
              </select>
            </div>
          </PanelField>
          <PanelField icon="📂" label="Section">
            <select value={selectedTask.section_id || ""} onChange={e => updateField(selectedTask.id, "section_id", e.target.value)}
              style={{ fontSize: 13, color: T.text, background: "transparent", border: "none", outline: "none", cursor: "pointer", fontFamily: "inherit" }}>
              {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </PanelField>
        </div>
        {/* Description */}
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 10 }}>Description</div>
          <textarea value={selectedTask.description || ""}
            onChange={e => { const v = e.target.value; setSelectedTask(p => ({ ...p, description: v })); setTasks(p => p.map(t => t.id === selectedTask.id ? { ...t, description: v } : t)); }}
            onBlur={() => supabase.from("tasks").update({ description: selectedTask.description || null }).eq("id", selectedTask.id)}
            placeholder="Add a description…"
            style={{
              width: "100%", minHeight: 100, fontSize: 13, color: T.text2, lineHeight: 1.6,
              padding: 14, background: T.surface2, borderRadius: 10, border: `1px solid ${T.border}`,
              resize: "vertical", outline: "none", fontFamily: "inherit",
            }} />
        </div>
        {/* Activity */}
        <div style={{ marginTop: 28, paddingTop: 18, borderTop: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 12 }}>Activity</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {selectedTask.created_at && (
              <div style={{ fontSize: 12, color: T.text3, display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: 6, background: T.green, flexShrink: 0 }} />
                Task created · {new Date(selectedTask.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </div>
            )}
            {selectedTask.updated_at && selectedTask.updated_at !== selectedTask.created_at && (
              <div style={{ fontSize: 12, color: T.text3, display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: 6, background: T.accent, flexShrink: 0 }} />
                Last updated · {new Date(selectedTask.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </div>
            )}
          </div>
        </div>
        {/* Delete */}
        <div style={{ marginTop: 28, paddingTop: 18, borderTop: `1px solid ${T.border}` }}>
          <button onClick={() => { if (confirm("Delete this task?")) deleteTask(selectedTask.id); }}
            style={{ padding: "7px 14px", fontSize: 12, fontWeight: 600, borderRadius: 6, border: `1px solid #ef444440`, background: "#ef444410", color: "#ef4444", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
            Delete task
          </button>
        </div>
      </div>
    </div>
  );

  /* ═══════════════════════════════════════════════════════
     PROJECT FORM MODAL
     ═══════════════════════════════════════════════════════ */
  const projectModal = showProjectForm && (
    <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={() => setShowProjectForm(false)}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} />
      <div onClick={e => e.stopPropagation()} style={{
        position: "relative", width: 420, background: T.surface, borderRadius: 12,
        border: `1px solid ${T.border}`, padding: 28, zIndex: 101,
      }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>
          {showProjectForm === "new" ? "New Project" : "Edit Project"}
        </h3>
        {/* Name */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: T.text3, marginBottom: 6, display: "block" }}>Name</label>
          <input autoFocus value={projectForm.name} onChange={e => setProjectForm(p => ({ ...p, name: e.target.value }))}
            onKeyDown={e => { if (e.key === "Enter") saveProject(); }}
            placeholder="Project name…" style={{ width: "100%", padding: "8px 12px", fontSize: 14, color: T.text, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, outline: "none", fontFamily: "inherit" }} />
        </div>
        {/* Description */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: T.text3, marginBottom: 6, display: "block" }}>Description</label>
          <textarea value={projectForm.description} onChange={e => setProjectForm(p => ({ ...p, description: e.target.value }))}
            placeholder="What's this project about?" rows={3}
            style={{ width: "100%", padding: "8px 12px", fontSize: 13, color: T.text, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, outline: "none", fontFamily: "inherit", resize: "vertical" }} />
        </div>
        {/* Color */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: T.text3, marginBottom: 6, display: "block" }}>Color</label>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {PROJECT_COLORS.map(c => (
              <div key={c} onClick={() => setProjectForm(p => ({ ...p, color: c }))} style={{
                width: 28, height: 28, borderRadius: 6, background: c, cursor: "pointer",
                border: projectForm.color === c ? "2px solid #fff" : "2px solid transparent",
                transition: "border 0.15s",
              }} />
            ))}
          </div>
        </div>
        {/* Status (only for edit) */}
        {showProjectForm === "edit" && (
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: T.text3, marginBottom: 6, display: "block" }}>Status</label>
            <select value={projectForm.status} onChange={e => setProjectForm(p => ({ ...p, status: e.target.value }))}
              style={{ padding: "8px 12px", fontSize: 13, color: T.text, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, outline: "none", fontFamily: "inherit", cursor: "pointer" }}>
              <option value="planning">Planning</option><option value="active">Active</option><option value="paused">Paused</option>
              <option value="completed">Completed</option><option value="cancelled">Cancelled</option>
            </select>
          </div>
        )}
        {/* Actions */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={() => setShowProjectForm(false)} style={{ padding: "8px 16px", fontSize: 13, fontWeight: 600, borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text3, cursor: "pointer" }}>Cancel</button>
          <button onClick={saveProject} style={{ padding: "8px 16px", fontSize: 13, fontWeight: 600, borderRadius: 6, border: "none", background: T.accent, color: "#fff", cursor: "pointer", opacity: projectForm.name.trim() ? 1 : 0.5 }}>
            {showProjectForm === "new" ? "Create" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );

  /* ═══════════════════════════════════════════════════════
     LAYOUT
     ═══════════════════════════════════════════════════════ */
  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {sidebar}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {header}
        {proj && (viewMode === "list" ? listView : boardView)}
        {!proj && !loading && (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
            <div style={{ fontSize: 14, color: T.text3 }}>No projects yet</div>
            <button onClick={openNewProject} style={{ padding: "8px 18px", fontSize: 13, fontWeight: 600, borderRadius: 6, border: "none", background: T.accent, color: "#fff", cursor: "pointer" }}>Create your first project</button>
          </div>
        )}
      </div>
      {detail}
      {projectModal}
      {/* Toast notification */}
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 200,
          padding: "10px 20px", borderRadius: 8, fontSize: 13, fontWeight: 600,
          background: toast.type === "error" ? "#ef4444" : "#22c55e", color: "#fff",
          boxShadow: "0 4px 20px rgba(0,0,0,0.3)", animation: "fadeIn 0.2s ease",
        }}>{toast.message}</div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   HELPER COMPONENTS
   ═══════════════════════════════════════════════════════ */
function Dropdown({ children, onClose, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [onClose]);
  return (
    <div ref={ref} onClick={e => e.stopPropagation()} style={{
      position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 100,
      background: "#1a1f2e", border: `1px solid ${T.border2}`, borderRadius: 8,
      padding: 4, minWidth: wide ? 200 : 120, boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
      maxHeight: 240, overflow: "auto",
    }}>{children}</div>
  );
}

function DropdownItem({ children, onClick }) {
  return (
    <div onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 8, padding: "6px 10px",
      borderRadius: 4, cursor: "pointer", fontSize: 12, color: T.text2,
      transition: "background 0.1s",
    }}
    onMouseEnter={e => e.currentTarget.style.background = T.surface3}
    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
    >{children}</div>
  );
}

function PanelField({ icon, label, children }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "120px 1fr",
      padding: "10px 0", borderBottom: `1px solid ${T.border}`, alignItems: "center",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.text3 }}>
        <span style={{ fontSize: 14 }}>{icon}</span><span>{label}</span>
      </div>
      <div>{children}</div>
    </div>
  );
}