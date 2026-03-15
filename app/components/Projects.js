"use client";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useModal } from "../lib/modal";
import { T } from "../tokens";
import { useResizableColumns } from "../lib/useResizableColumns";
import { STATUS, PRIORITY, SECTION_COLORS, AVATAR_COLORS } from "./projectConfig";

const TABS = ["List", "Board", "Timeline", "Calendar", "Updates", "Docs"];
const toDateStr = (d) => d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
const isOverdue = (d) => d && new Date(d) < new Date() && new Date(d).toDateString() !== new Date().toDateString();

export default function ProjectsView() {
  const { user, profile } = useAuth();
  const { showPrompt, showConfirm } = useModal();
  const [projects, setProjects] = useState([]);
  const [sections, setSections] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [activeProject, setActiveProject] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [viewMode, setViewMode] = useState("List");
  const [loading, setLoading] = useState(true);
  const [showSidebar, setShowSidebar] = useState(true);
  const [addingTo, setAddingTo] = useState(null);
  const [newTitle, setNewTitle] = useState("");
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState({});
  const [sectionCtxMenu, setSectionCtxMenu] = useState(null); // { secId, x, y }
  const [wipLimitInput, setWipLimitInput] = useState("");
  const [hoveredRow, setHoveredRow] = useState(null);
  const [editingSectionId, setEditingSectionId] = useState(null);
  const [editingSectionName, setEditingSectionName] = useState("");
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [expandedTasks, setExpandedTasks] = useState({});
  const [toast, setToast] = useState(null);
  const [dragTask, setDragTask] = useState(null);
  const [dragOverTarget, setDragOverTarget] = useState(null);
  const [addingSubtaskTo, setAddingSubtaskTo] = useState(null);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [projectForm, setProjectForm] = useState({ name: "", description: "", color: "#3b82f6", status: "active", visibility: "private", join_policy: "invite_only", team_id: "", objective_id: "", owner_id: "", start_date: "", target_end_date: "", default_view: "List", members: [] });
  const [teams, setTeams] = useState([]);
  const [objectives, setObjectives] = useState([]);
  const [allProfiles, setAllProfiles] = useState([]);
  const [formStep, setFormStep] = useState(1);
  const [filterStatus, setFilterStatus] = useState("");
  const [filterPriority, setFilterPriority] = useState("");
  const [filterAssignee, setFilterAssignee] = useState("");
  const [sortCol, setSortCol] = useState("sort_order");
  const [sortDir, setSortDir] = useState("asc");
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [dependencies, setDependencies] = useState([]);
  const [customFields, setCustomFields] = useState([]);
  const [customFieldValues, setCustomFieldValues] = useState({});
  const [milestones, setMilestones] = useState([]);
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [showMyTasks, setShowMyTasks] = useState(false);
  const [ctxProject, setCtxProject] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  // Templates & copy
  const [showTemplates, setShowTemplates] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [copyingProject, setCopyingProject] = useState(null);
  // Status updates
  const [statusUpdates, setStatusUpdates] = useState([]);
  const [showStatusForm, setShowStatusForm] = useState(false);
  const [statusForm, setStatusForm] = useState({ health: "on_track", summary: "", highlights: "", blockers: "" });
  // Bulk select
  const [selectedTasks, setSelectedTasks] = useState(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  // Task activity
  const [taskActivity, setTaskActivity] = useState([]);
  // Docs
  const [docs, setDocs] = useState([]);

  const showToast = useCallback((msg, type = "error") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); }, []);
  const archiveProject = async (id) => { const { error } = await supabase.from("projects").update({ status: "archived" }).eq("id", id); if (error) return showToast("Failed to archive"); setProjects(p => p.map(pr => pr.id === id ? { ...pr, status: "archived" } : pr)); if (activeProject === id) setActiveProject(null); showToast("Project archived", "success"); };
  const unarchiveProject = async (id) => { const { error } = await supabase.from("projects").update({ status: "active" }).eq("id", id); if (error) return showToast("Failed to restore"); setProjects(p => p.map(pr => pr.id === id ? { ...pr, status: "active" } : pr)); showToast("Project restored", "success"); };
  const deleteProject = async (id) => { const name = projects.find(p => p.id === id)?.name || "this project"; if (!window.confirm(`Delete "${name}"? This will permanently remove the project and all its tasks. This cannot be undone.`)) return; const { error } = await supabase.from("projects").delete().eq("id", id); if (error) return showToast("Failed to delete: " + error.message); setProjects(p => p.filter(pr => pr.id !== id)); setTasks(p => p.filter(t => t.project_id !== id)); setSections(p => p.filter(s => s.project_id !== id)); if (activeProject === id) { setActiveProject(null); setSelectedTask(null); } showToast("Project deleted", "success"); };
  const ini = (uid) => { const u = profiles[uid]; return u?.display_name ? u.display_name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() : "?"; };
  const iniName = (name) => name ? name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() : "?";
  const acol = (uid) => uid ? AVATAR_COLORS[uid.charCodeAt(uid.length - 1) % AVATAR_COLORS.length] : T.text3;
  const uname = (uid) => profiles[uid]?.display_name || "";
  const secColor = (i) => SECTION_COLORS[i % SECTION_COLORS.length];
  const timeAgo = (ds) => { const m = Math.floor((Date.now() - new Date(ds).getTime()) / 60000); if (m < 1) return "just now"; if (m < 60) return m + "m ago"; const h = Math.floor(m / 60); if (h < 24) return h + "h ago"; return Math.floor(h / 24) + "d ago"; };
  const formatFileSize = (b) => { if (!b) return "0 B"; const k = 1024; const s = ["B", "KB", "MB", "GB"]; const i = Math.floor(Math.log(b) / Math.log(k)); return parseFloat((b / Math.pow(k, i)).toFixed(1)) + " " + s[i]; };
  const getFileUrl = (path) => `https://upbjdmnykheubxkuknuj.supabase.co/storage/v1/object/public/attachments/${path}`;
  useEffect(() => {
    if (!profile?.org_id) return;
    const load = async () => {
      setLoading(true);
      try {
        const [pR, sR, tR, prR, tmR, obR] = await Promise.all([
          supabase.from("projects").select("*").eq("org_id", profile.org_id).is("deleted_at", null).order("name"),
          supabase.from("sections").select("*").order("sort_order"),
          supabase.from("tasks").select("*").eq("org_id", profile.org_id).is("deleted_at", null).order("sort_order"),
          supabase.from("profiles").select("*").eq("org_id", profile.org_id),
          supabase.from("teams").select("*").eq("org_id", profile.org_id).is("deleted_at", null).order("name"),
          supabase.from("objectives").select("*").eq("org_id", profile.org_id).is("deleted_at", null).order("title"),
        ]);
        setProjects(pR.data || []); setSections(sR.data || []); setTasks(tR.data || []);
        setTeams(tmR.data || []); setObjectives(obR.data || []); setAllProfiles(prR.data || []);
        const m = {}; (prR.data || []).forEach(u => { m[u.id] = u; }); setProfiles(m);
        if (!activeProject && pR.data?.length) setActiveProject(pR.data[0].id);
        // Load templates and docs
        const [tmplR, docsR] = await Promise.all([
          supabase.from("project_templates").select("*").order("is_builtin", { ascending: false }).order("name"),
          supabase.from("documents").select("id,title,emoji,updated_at,project_id,status").is("deleted_at", null).order("updated_at", { ascending: false }),
        ]);
        setTemplates(tmplR.data || []);
        setDocs(docsR.data || []);
      } catch (e) { showToast("Failed to load data"); }
      setLoading(false);
    };
    load();
  }, [profile?.org_id]);

  useEffect(() => {
    if (!selectedTask) return;
    Promise.all([
      supabase.from("comments").select("*").eq("entity_type", "task").eq("entity_id", selectedTask.id).is("deleted_at", null).order("created_at", { ascending: true }),
      supabase.from("attachments").select("*").eq("entity_type", "task").eq("entity_id", selectedTask.id),
    ]).then(([cR, aR]) => { setComments(cR.data || []); setAttachments(aR.data || []); });
  }, [selectedTask?.id]);

  useEffect(() => {
    if (!activeProject) return;
    Promise.all([
      supabase.from("task_dependencies").select("*"),
      supabase.from("custom_fields").select("*").eq("project_id", activeProject).order("sort_order"),
      supabase.from("custom_field_values").select("*"),
      supabase.from("milestones").select("*").eq("project_id", activeProject).order("sort_order"),
      supabase.from("project_status_updates").select("*").eq("project_id", activeProject).order("created_at", { ascending: false }).limit(10),
    ]).then(([dR, cfR, cvR, msR, suR]) => {
      setDependencies(dR.data || []); setCustomFields(cfR.data || []); setMilestones(msR.data || []); setStatusUpdates(suR.data || []);
      const cfm = {}; (cvR.data || []).forEach(v => { if (!cfm[v.task_id]) cfm[v.task_id] = {}; cfm[v.task_id][v.field_id] = v.value; }); setCustomFieldValues(cfm);
    });
  }, [activeProject]);

  useEffect(() => {
    const fn = (e) => { if (e.key === "Escape") { if (ctxProject) setCtxProject(null); else if (showProjectForm) setShowProjectForm(false); else if (selectedTask) setSelectedTask(null); else if (editingSectionId) setEditingSectionId(null); else if (addingTo) { setAddingTo(null); setNewTitle(""); } } };
    document.addEventListener("keydown", fn); return () => document.removeEventListener("keydown", fn);
  }, [showProjectForm, selectedTask, editingSectionId, addingTo]);
  const proj = projects.find(p => p.id === activeProject);
  const projSections = useMemo(() => sections.filter(s => s.project_id === activeProject).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)), [sections, activeProject]);
  const projTasks = useMemo(() => tasks.filter(t => t.project_id === activeProject), [tasks, activeProject]);
  const filteredTasks = useMemo(() => projTasks.filter(t => {
    if (search && !t.title?.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterStatus && t.status !== filterStatus) return false;
    if (filterPriority && t.priority !== filterPriority) return false;
    if (filterAssignee && t.assignee_id !== filterAssignee) return false;
    return true;
  }), [projTasks, search, filterStatus, filterPriority, filterAssignee]);
  const rootTasks = (secTasks) => secTasks.filter(t => !t.parent_task_id);
  const getSubtasks = (pid) => filteredTasks.filter(t => t.parent_task_id === pid);
  const sortedTasks = (list) => { if (sortCol === "sort_order") return list; return [...list].sort((a, b) => { let va = a[sortCol] || "", vb = b[sortCol] || ""; if (sortCol === "due_date") { va = va ? new Date(va).getTime() : 9e15; vb = vb ? new Date(vb).getTime() : 9e15; } const c = va < vb ? -1 : va > vb ? 1 : 0; return sortDir === "asc" ? c : -c; }); };
  const doneCount = projTasks.filter(t => t.status === "done").length;
  const progress = projTasks.length ? Math.round((doneCount / projTasks.length) * 100) : 0;
  // Auto-compute project health from tasks
  const today = new Date().toISOString().split("T")[0];
  const projOverdue = projTasks.filter(t => t.status !== "done" && t.due_date && t.due_date < today);
  const projHealth = projOverdue.length > projTasks.length * 0.2 ? "off_track" : projOverdue.length > 0 ? "at_risk" : "on_track";
  const healthColors = { on_track: "#22c55e", at_risk: "#eab308", off_track: "#ef4444" };
  const healthLabels = { on_track: "On Track", at_risk: "At Risk", off_track: "Off Track" };

  // Sync progress to DB whenever it changes meaningfully
  const syncProjectProgress = useCallback(async (pid, taskList) => {
    const done = taskList.filter(t => t.project_id === pid && t.status === "done").length;
    const total = taskList.filter(t => t.project_id === pid && !t.parent_task_id).length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    await supabase.from("projects").update({ progress: pct }).eq("id", pid);
    if (pct === 100 && total > 0) {
      showToast("🎉 Project complete! All tasks done.", "success");
    }
  }, [showToast]);
  const getBlockedBy = (tid) => dependencies.filter(d => d.successor_id === tid).map(d => ({ ...d, task: tasks.find(t => t.id === d.predecessor_id) })).filter(d => d.task);
  const getBlocking = (tid) => dependencies.filter(d => d.predecessor_id === tid).map(d => ({ ...d, task: tasks.find(t => t.id === d.successor_id) })).filter(d => d.task);
  const createTask = async (sid) => { if (!newTitle.trim()) return; const st = tasks.filter(t => t.section_id === sid && !t.parent_task_id); const mx = st.reduce((m, t) => Math.max(m, t.sort_order || 0), 0); const { data, error } = await supabase.from("tasks").insert({ org_id: profile.org_id, project_id: activeProject, section_id: sid, title: newTitle.trim(), status: "todo", priority: "none", sort_order: mx + 1, created_by: user.id }).select().single(); if (error) return showToast("Failed to create task"); setTasks(p => [...p, data]); setNewTitle(""); showToast("Task created", "success"); };
  const createSubtask = async (parentTask) => { if (!newSubtaskTitle.trim()) return; const mx = tasks.filter(t => t.parent_task_id === parentTask.id).reduce((m, t) => Math.max(m, t.sort_order || 0), 0); const { data, error } = await supabase.from("tasks").insert({ org_id: profile.org_id, project_id: activeProject, section_id: parentTask.section_id, parent_task_id: parentTask.id, title: newSubtaskTitle.trim(), status: "todo", priority: "none", sort_order: mx + 1, created_by: user.id }).select().single(); if (error) return showToast("Failed to create subtask"); setTasks(p => [...p, data]); setExpandedTasks(p => ({ ...p, [parentTask.id]: true })); setNewSubtaskTitle(""); setAddingSubtaskTo(null); };
  const startAddSubtask = (task, e) => { e?.stopPropagation(); setAddingSubtaskTo(task.id); setNewSubtaskTitle(""); setExpandedTasks(p => ({ ...p, [task.id]: true })); };
  const updateField = async (taskId, field, value) => { const old = tasks.find(t => t.id === taskId); setTasks(p => p.map(t => t.id === taskId ? { ...t, [field]: value } : t)); if (selectedTask?.id === taskId) setSelectedTask(p => ({ ...p, [field]: value })); const ups = { [field]: value, updated_at: new Date().toISOString() }; if (field === "status" && value === "done") ups.completed_at = new Date().toISOString(); if (field === "status" && old?.status === "done" && value !== "done") ups.completed_at = null; const { error } = await supabase.from("tasks").update(ups).eq("id", taskId); if (error) { showToast("Update failed"); setTasks(p => p.map(t => t.id === taskId ? old : t)); } if (field === "status") { const updatedTasks = tasks.map(t => t.id === taskId ? { ...t, [field]: value } : t); syncProjectProgress(old?.project_id || activeProject, updatedTasks); } };
  const toggleDone = async (task, e) => { e?.stopPropagation(); await updateField(task.id, "status", task.status === "done" ? "todo" : "done"); };
  const deleteTask = async (taskId) => { const ok = await showConfirm("Delete Task", "Are you sure?"); if (!ok) return; await supabase.from("tasks").update({ deleted_at: new Date().toISOString() }).eq("id", taskId); setTasks(p => p.filter(t => t.id !== taskId)); if (selectedTask?.id === taskId) setSelectedTask(null); };
  const duplicateTask = async (task) => { const mx = tasks.filter(t => t.section_id === task.section_id && !t.parent_task_id).reduce((m, t) => Math.max(m, t.sort_order || 0), 0); const { data, error } = await supabase.from("tasks").insert({ org_id: profile.org_id, project_id: activeProject, section_id: task.section_id, title: task.title + " (copy)", status: task.status, priority: task.priority, assignee_id: task.assignee_id, due_date: task.due_date, sort_order: mx + 1, created_by: user.id }).select().single(); if (!error && data) setTasks(p => [...p, data]); };
  const createSection = async () => { if (!newSectionName.trim()) return; const mx = projSections.reduce((m, s) => Math.max(m, s.sort_order || 0), 0); const { data, error } = await supabase.from("sections").insert({ project_id: activeProject, name: newSectionName.trim(), sort_order: mx + 1 }).select().single(); if (!error && data) setSections(p => [...p, data]); setNewSectionName(""); setAddingSection(false); };
  const renameSection = async (secId) => { if (!editingSectionName.trim()) return; await supabase.from("sections").update({ name: editingSectionName.trim() }).eq("id", secId); setSections(p => p.map(s => s.id === secId ? { ...s, name: editingSectionName.trim() } : s)); setEditingSectionId(null); };
  const deleteSection = async (secId) => { const st = tasks.filter(t => t.section_id === secId); const ok = await showConfirm("Delete Section", st.length ? `Delete ${st.length} task(s) too?` : "Delete this section?"); if (!ok) return; if (st.length) await supabase.from("tasks").update({ deleted_at: new Date().toISOString() }).eq("section_id", secId); await supabase.from("sections").delete().eq("id", secId); setSections(p => p.filter(s => s.id !== secId)); setTasks(p => p.filter(t => t.section_id !== secId)); };
  const openNewProject = () => { setProjectForm({ name: "", description: "", color: "#3b82f6", status: "active", visibility: "private", join_policy: "invite_only", team_id: "", objective_id: "", owner_id: user?.id || "", start_date: "", target_end_date: "", default_view: "List", members: [] }); setFormStep(1); setShowProjectForm("new"); };
  const openEditProject = () => { if (!proj) return; setProjectForm({ name: proj.name, description: proj.description || "", color: proj.color || "#3b82f6", status: proj.status || "active", visibility: proj.visibility || "private", join_policy: proj.join_policy || "invite_only", team_id: proj.team_id || "", objective_id: proj.objective_id || "", owner_id: proj.owner_id || "", start_date: proj.start_date || "", target_end_date: proj.target_end_date || "", default_view: proj.default_view || "List", members: [] }); setFormStep(1); setShowProjectForm("edit"); };
  const createProjectFromTemplate = async (template) => {
    if (!profile?.org_id) return showToast("No organization found");
    const secs = template.sections || [];
    const color = template.color || "#3b82f6";
    const { data, error } = await supabase.from("projects").insert({
      org_id: profile.org_id, created_by: profile.id,
      name: template.name, description: template.description || "",
      color, status: "active", visibility: "private",
    }).select().single();
    if (error) return showToast("Failed to create: " + error.message);
    setProjects(p => [...p, data]);
    setActiveProject(data.id);
    setShowTemplates(false);
    // Create sections and tasks from template
    for (let i = 0; i < secs.length; i++) {
      const sec = secs[i];
      const { data: secData } = await supabase.from("sections").insert({ project_id: data.id, name: sec.name, sort_order: i + 1 }).select().single();
      if (secData && sec.tasks?.length) {
        for (let j = 0; j < sec.tasks.length; j++) {
          await supabase.from("tasks").insert({ org_id: profile.org_id, project_id: data.id, section_id: secData.id, title: sec.tasks[j], status: "todo", priority: "none", sort_order: j + 1, created_by: profile.id });
        }
      }
      if (secData) setSections(p => [...p, secData]);
    }
    // Reload tasks
    const { data: newTasks } = await supabase.from("tasks").select("*").eq("project_id", data.id).is("deleted_at", null);
    setTasks(p => [...p.filter(t => t.project_id !== data.id), ...(newTasks || [])]);
    showToast(`Project created from ${template.name} template`, "success");
  };

  const copyProject = async (srcProject) => {
    if (!profile?.org_id) return;
    const srcSections = sections.filter(s => s.project_id === srcProject.id);
    const srcTasks = tasks.filter(t => t.project_id === srcProject.id && !t.parent_task_id);
    const { data, error } = await supabase.from("projects").insert({
      org_id: profile.org_id, created_by: profile.id,
      name: srcProject.name + " (copy)", description: srcProject.description || "",
      color: srcProject.color, status: "active", visibility: srcProject.visibility || "private",
    }).select().single();
    if (error) return showToast("Copy failed: " + error.message);
    setProjects(p => [...p, data]);
    // Copy sections
    const secMap = {};
    for (const sec of srcSections) {
      const { data: newSec } = await supabase.from("sections").insert({ project_id: data.id, name: sec.name, sort_order: sec.sort_order }).select().single();
      if (newSec) { secMap[sec.id] = newSec.id; setSections(p => [...p, newSec]); }
    }
    // Copy tasks
    const newTaskList = [];
    for (const task of srcTasks) {
      const { data: newTask } = await supabase.from("tasks").insert({
        org_id: profile.org_id, project_id: data.id,
        section_id: secMap[task.section_id] || null,
        title: task.title, status: "todo", priority: task.priority,
        sort_order: task.sort_order, created_by: profile.id,
        estimated_hours: task.estimated_hours, story_points: task.story_points,
        labels: task.labels,
      }).select().single();
      if (newTask) newTaskList.push(newTask);
    }
    setTasks(p => [...p, ...newTaskList]);
    setActiveProject(data.id);
    setCopyingProject(null);
    showToast("Project copied successfully", "success");
  };

  const saveStatusUpdate = async () => {
    if (!statusForm.summary.trim()) return showToast("Summary required");
    const { data, error } = await supabase.from("project_status_updates").insert({
      org_id: profile?.org_id,
      project_id: activeProject, author_id: user?.id,
      status: statusForm.health,
      title: statusForm.summary,
      body: [statusForm.highlights ? `**Highlights:** ${statusForm.highlights}` : "", statusForm.blockers ? `**Blockers:** ${statusForm.blockers}` : ""].filter(Boolean).join("\n\n") || null,
    }).select().single();
    if (error) return showToast("Failed to save update");
    setStatusUpdates(p => [data, ...p]);
    // Update project health based on status
    await supabase.from("projects").update({ status: statusForm.health === "off_track" ? "on_hold" : "active" }).eq("id", activeProject);
    setShowStatusForm(false);
    setStatusForm({ health: "on_track", summary: "", highlights: "", blockers: "" });
    showToast("Status update posted", "success");
  };

  const bulkUpdateTasks = async (field, value) => {
    const ids = [...selectedTasks];
    setTasks(p => p.map(t => ids.includes(t.id) ? { ...t, [field]: value } : t));
    await supabase.from("tasks").update({ [field]: value }).in("id", ids);
    setSelectedTasks(new Set()); setBulkMode(false);
    showToast(`Updated ${ids.length} task${ids.length > 1 ? "s" : ""}`, "success");
  };

  const logActivity = async (taskId, action, field, oldVal, newVal) => {
    await supabase.from("task_activity").insert({ task_id: taskId, actor_id: user?.id, action, field, old_value: oldVal ? String(oldVal) : null, new_value: newVal ? String(newVal) : null });
  };

  const [savingAsTemplate, setSavingAsTemplate] = useState(null); // project being saved as template

  const saveAsTemplate = async (srcProject) => {
    if (!profile?.org_id) return;
    const srcSections = sections.filter(s => s.project_id === srcProject.id);
    const sectionData = srcSections.map(s => ({
      name: s.name,
      sort_order: s.sort_order,
      is_complete_column: s.is_complete_column || false,
      tasks: tasks.filter(t => t.section_id === s.id && !t.parent_task_id && !t.deleted_at)
        .map(t => t.title),
    }));
    const { data, error } = await supabase.from("project_templates").insert({
      org_id: profile.org_id,
      name: srcProject.name,
      description: srcProject.description || "",
      icon: srcProject.emoji || "📋",
      color: srcProject.color || "#3b82f6",
      is_builtin: false,
      created_by: profile.id,
      template_data: { default_view: srcProject.default_view || "List" },
      sections: sectionData,
    }).select().single();
    if (error) return showToast("Failed to save as template: " + error.message);
    setTemplates(p => [...p, data]);
    setSavingAsTemplate(null);
    showToast(`"${srcProject.name}" saved as template`, "success");
  };

  const saveProject = async () => { if (!projectForm.name.trim()) return showToast("Name required"); if (!profile?.org_id) return showToast("No organization found"); const payload = { name: projectForm.name.trim(), description: projectForm.description || "", color: projectForm.color || "#3b82f6", status: projectForm.status || "active", visibility: projectForm.visibility || "private", join_policy: projectForm.join_policy || "invite_only", team_id: projectForm.team_id || null, objective_id: projectForm.objective_id || null, owner_id: projectForm.owner_id || null, start_date: projectForm.start_date || null, target_end_date: projectForm.target_end_date || null, default_view: projectForm.default_view || "List" }; if (showProjectForm === "new") { payload.org_id = profile.org_id; payload.created_by = profile?.id || null; console.log("Creating project with payload:", JSON.stringify(payload)); const { data, error } = await supabase.from("projects").insert(payload).select().single(); if (error) { console.error("Project create error:", error); return showToast("Failed: " + (error.message || error.details || "Unknown error")); } setProjects(p => [...p, data]); setActiveProject(data.id); for (let i = 0; i < 3; i++) { const n = ["To Do", "In Progress", "Done"][i]; const { data: sec } = await supabase.from("sections").insert({ project_id: data.id, name: n, sort_order: i + 1 }).select().single(); if (sec) setSections(p => [...p, sec]); } if (projectForm.members.length > 0) { for (const uid of projectForm.members) { await supabase.from("project_members").insert({ project_id: data.id, user_id: uid, role: "member" }); } } if (projectForm.owner_id) { const exists = projectForm.members.includes(projectForm.owner_id); if (!exists) await supabase.from("project_members").insert({ project_id: data.id, user_id: projectForm.owner_id, role: "owner" }); } } else { const { error } = await supabase.from("projects").update(payload).eq("id", activeProject); if (error) { console.error("Project update error:", error); return showToast("Failed: " + (error.message || error.details || "Unknown error")); } setProjects(p => p.map(pr => pr.id === activeProject ? { ...pr, ...payload } : pr)); } setShowProjectForm(false); showToast(showProjectForm === "new" ? "Project created" : "Project updated", "success"); };
  const addComment = async () => { if (!newComment.trim() || !selectedTask) return; const { data, error } = await supabase.from("comments").insert({ org_id: profile.org_id, entity_type: "task", entity_id: selectedTask.id, author_id: user.id, content: newComment.trim() }).select().single(); if (!error && data) setComments(p => [...p, data]); setNewComment(""); };
  const uploadAttachment = async (file) => { if (!selectedTask) return; const path = `${profile.org_id}/${selectedTask.id}/${Date.now()}_${file.name}`; const { error: ue } = await supabase.storage.from("attachments").upload(path, file); if (ue) return showToast("Upload failed"); const { data, error } = await supabase.from("attachments").insert({ org_id: profile.org_id, entity_type: "task", entity_id: selectedTask.id, filename: file.name, file_path: path, file_size: file.size, mime_type: file.type, uploaded_by: user.id }).select().single(); if (!error && data) setAttachments(p => [...p, data]); };
  const deleteAttachment = async (att) => { await supabase.storage.from("attachments").remove([att.file_path]); await supabase.from("attachments").delete().eq("id", att.id); setAttachments(p => p.filter(a => a.id !== att.id)); };
  const addDependency = async (pre, suc) => { if (pre === suc || dependencies.some(d => d.predecessor_id === pre && d.successor_id === suc)) return; const { data, error } = await supabase.from("task_dependencies").insert({ predecessor_id: pre, successor_id: suc, dependency_type: "finish_to_start" }).select().single(); if (!error && data) setDependencies(p => [...p, data]); };
  const removeDependency = async (depId) => { await supabase.from("task_dependencies").delete().eq("id", depId); setDependencies(p => p.filter(d => d.id !== depId)); };
  const createCustomField = async () => { const name = await showPrompt("New custom field", "Field name…"); if (!name) return; const mx = customFields.reduce((m, f) => Math.max(m, f.sort_order || 0), 0); const { data, error } = await supabase.from("custom_fields").insert({ project_id: activeProject, name, field_type: "text", sort_order: mx + 1 }).select().single(); if (!error && data) setCustomFields(p => [...p, data]); };
  const updateCustomFieldValue = async (taskId, fieldId, value) => { setCustomFieldValues(p => ({ ...p, [taskId]: { ...(p[taskId] || {}), [fieldId]: value } })); const ex = await supabase.from("custom_field_values").select("id").eq("task_id", taskId).eq("field_id", fieldId).single(); if (ex.data) { await supabase.from("custom_field_values").update({ value }).eq("id", ex.data.id); } else { await supabase.from("custom_field_values").insert({ task_id: taskId, field_id: fieldId, value }); } };
  const handleBoardDrop = async (taskId, newSec) => { await updateField(taskId, "section_id", newSec); setDragTask(null); setDragOverTarget(null); };
  const { gridTemplate: projGrid, onResizeStart: projResize } = useResizableColumns([280, 110, 90, 110, 100], "projects");
  const ResizeHandle = ({ index, onStart }) => (<div onMouseDown={(e) => onStart(index, e)} style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 6, cursor: "col-resize", zIndex: 2 }} onMouseEnter={e => e.currentTarget.style.background = T.accent + "40"} onMouseLeave={e => e.currentTarget.style.background = "transparent"} />);

  const S = {
    pill: { display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer" },
    iconBtn: { background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 4, borderRadius: 4, color: T.text3 },
    addRow: { display: "flex", alignItems: "center", gap: 8, padding: "6px 12px 6px 40px", cursor: "pointer", color: T.text3, fontSize: 13, borderRadius: 6 },
    colHdr: { fontSize: 11, fontWeight: 600, color: T.text3, textTransform: "uppercase", letterSpacing: "0.04em", padding: "6px 8px", cursor: "pointer", userSelect: "none", display: "flex", alignItems: "center", gap: 4 },
    row: (hov, sel) => ({ display: "grid", gridTemplateColumns: projGrid, alignItems: "center", padding: "0 12px", minHeight: 36, borderBottom: `1px solid ${T.border}`, background: sel ? T.accentDim : hov ? T.surface2 : "transparent", cursor: "pointer", transition: "background 0.12s" }),
  };
  const ProjectSidebar = () => (
    <div style={{ width: showSidebar ? 260 : 0, flexShrink: 0, borderRight: `1px solid ${T.border}`, background: T.surface, overflow: "hidden", transition: "width 0.2s", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "16px 16px 8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: T.text2, textTransform: "uppercase", letterSpacing: "0.06em" }}>Projects</span>
        <div style={{ display: "flex", gap: 4 }}>
          <button onClick={() => setShowTemplates(true)} title="From template" style={{ ...S.iconBtn, fontSize: 12, padding: "3px 6px", borderRadius: 5, color: T.accent }}>⊞</button>
          <button onClick={openNewProject} style={{ ...S.iconBtn, background: T.accent, color: "#fff", borderRadius: 6, width: 24, height: 24, fontSize: 16 }}>+</button>
        </div>
      </div>
      <div onClick={() => { setShowMyTasks(true); setActiveProject(null); }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", margin: "0 8px", borderRadius: 6, cursor: "pointer", background: showMyTasks ? T.accentDim : "transparent", color: showMyTasks ? T.accent : T.text2, fontSize: 13, fontWeight: 500 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
        My Tasks
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "4px 8px" }}>
        {projects.filter(p => p.status !== "archived").map(p => {
          const pt = tasks.filter(t => t.project_id === p.id && !t.parent_task_id);
          const pd = pt.filter(t => t.status === "done").length;
          const pp = pt.length ? Math.round((pd / pt.length) * 100) : 0;
          const act = activeProject === p.id && !showMyTasks;
          const pToday = new Date().toISOString().split("T")[0];
          const pOverdue = pt.filter(t => t.status !== "done" && t.due_date && t.due_date < pToday).length;
          const pHealth = pOverdue > pt.length * 0.2 ? "#ef4444" : pOverdue > 0 ? "#eab308" : "#22c55e";
          return (
          <div key={p.id} onClick={() => { setActiveProject(p.id); setShowMyTasks(false); setSelectedTask(null); setSearch(""); setFilterStatus(""); setFilterPriority(""); setFilterAssignee(""); }}
            onContextMenu={e => { e.preventDefault(); setCtxProject(ctxProject === p.id ? null : p.id); }}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 6, cursor: "pointer", background: act ? T.accentDim : "transparent", marginBottom: 2, position: "relative" }}>
            <div style={{ width: 8, height: 8, borderRadius: 4, background: p.color || T.accent, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: act ? 600 : 400, color: act ? T.accent : T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.emoji || ""} {p.name}</div>
              <div style={{ fontSize: 11, color: T.text3, marginTop: 1, display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: pHealth, display: "inline-block" }} />
                {pt.length} tasks · {pp}%
                {pOverdue > 0 && <span style={{ color: "#ef4444" }}>· {pOverdue} late</span>}
              </div>
            </div>
            <div style={{ width: 28, height: 3, borderRadius: 2, background: T.surface3, flexShrink: 0 }}><div style={{ width: `${pp}%`, height: "100%", borderRadius: 2, background: p.color || T.accent, transition: "width 0.4s" }} /></div>
            {ctxProject === p.id && <div onClick={e => e.stopPropagation()} style={{ position: "absolute", right: 4, top: "100%", zIndex: 50, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, padding: 4, minWidth: 140, boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }}>
              <div onClick={() => { setCopyingProject(p); setCtxProject(null); }} style={{ padding: "7px 10px", fontSize: 12, color: T.text2, borderRadius: 4, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }} onMouseEnter={e => e.currentTarget.style.background = T.surface3} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>Copy
              </div>
              <div onClick={() => { setSavingAsTemplate(p); setCtxProject(null); }} style={{ padding: "7px 10px", fontSize: 12, color: T.text2, borderRadius: 4, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }} onMouseEnter={e => e.currentTarget.style.background = T.surface3} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>Save as Template
              </div>
              <div onClick={() => { archiveProject(p.id); setCtxProject(null); }} style={{ padding: "7px 10px", fontSize: 12, color: T.text2, borderRadius: 4, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }} onMouseEnter={e => e.currentTarget.style.background = T.surface3} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg>Archive
              </div>
              <div onClick={() => { deleteProject(p.id); setCtxProject(null); }} style={{ padding: "7px 10px", fontSize: 12, color: T.red, borderRadius: 4, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }} onMouseEnter={e => e.currentTarget.style.background = T.surface3} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg>Delete
              </div>
            </div>}
          </div>); })}
        {projects.some(p => p.status === "archived") && <>
          <div onClick={() => setShowArchived(!showArchived)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", marginTop: 8, fontSize: 11, color: T.text3, cursor: "pointer", fontWeight: 600 }}>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" style={{ transform: showArchived ? "rotate(0)" : "rotate(-90deg)", transition: "transform 0.15s" }}><path d="M3 4.5l3 3 3-3" stroke={T.text3} strokeWidth="1.5" strokeLinecap="round" /></svg>
            Archived ({projects.filter(p => p.status === "archived").length})
          </div>
          {showArchived && projects.filter(p => p.status === "archived").map(p => (
            <div key={p.id} onClick={() => { setActiveProject(p.id); setShowMyTasks(false); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderRadius: 6, cursor: "pointer", background: activeProject === p.id ? T.accentDim : "transparent", marginBottom: 2, opacity: 0.6 }}>
              <div style={{ width: 8, height: 8, borderRadius: 4, background: p.color || T.text3, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: T.text3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
              </div>
              <button onClick={e => { e.stopPropagation(); unarchiveProject(p.id); }} style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, border: "none", background: T.surface3, color: T.text3, cursor: "pointer" }}>Restore</button>
            </div>
          ))}
        </>}
      </div>
    </div>
  );
  const ProjectHeader = () => { if (!proj) return null;
    const hColor = healthColors[projHealth];
    const hLabel = healthLabels[projHealth];
    return (
    <div style={{ borderBottom: `1px solid ${T.border}`, background: T.surface }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px 8px" }}>
        {!showSidebar && <button onClick={() => setShowSidebar(true)} style={S.iconBtn}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.text2} strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg></button>}
        <div style={{ width: 12, height: 12, borderRadius: 6, background: proj.color || T.accent, flexShrink: 0 }} />
        <h2 style={{ fontSize: 18, fontWeight: 700, color: T.text, margin: 0, flex: 1 }}>{proj.emoji || ""} {proj.name}</h2>
        {/* Health badge */}
        <span style={{ ...S.pill, background: hColor + "18", color: hColor, border: `1px solid ${hColor}40`, fontSize: 11, fontWeight: 700 }}>
          {hLabel}
        </span>
        {projOverdue.length > 0 && (
          <span style={{ ...S.pill, background: "#ef444415", color: "#ef4444", fontSize: 11 }}>
            ⚠ {projOverdue.length} overdue
          </span>
        )}
        {/* Progress ring */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div style={{ position: "relative", width: 32, height: 32 }}>
            <svg width="32" height="32" style={{ transform: "rotate(-90deg)" }}>
              <circle cx="16" cy="16" r="12" fill="none" stroke={T.surface3} strokeWidth="3" />
              <circle cx="16" cy="16" r="12" fill="none" stroke={proj.color || T.accent} strokeWidth="3"
                strokeDasharray={`${progress * 0.754} 100`} strokeLinecap="round" />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 800, color: T.text }}>{progress}%</div>
          </div>
          <div style={{ fontSize: 11, color: T.text3 }}>{doneCount}/{projTasks.length} done</div>
        </div>
        <button onClick={() => { setStatusForm({ health: projHealth, summary: "", highlights: "", blockers: "" }); setShowStatusForm(true); }} style={{ ...S.pill, background: T.surface2, color: T.text3, fontSize: 11, gap: 4 }} title="Post status update">
          📋 Update
        </button>
        <button onClick={openEditProject} style={S.iconBtn} title="Edit"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.text3} strokeWidth="2"><path d="M18.4 2.6a2.17 2.17 0 013 3L12 15l-4 1 1-4 9.4-9.4z"/></svg></button>
        <button onClick={() => archiveProject(proj.id)} style={S.iconBtn} title="Archive"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.text3} strokeWidth="2"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg></button>
        <button onClick={() => deleteProject(proj.id)} style={{ ...S.iconBtn, color: T.red }} title="Delete"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button>
        {showSidebar && <button onClick={() => setShowSidebar(false)} style={S.iconBtn} title="Collapse"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.text3} strokeWidth="2"><path d="M11 19l-7-7 7-7"/><path d="M4 12h16"/></svg></button>}
      </div>
      <div style={{ display: "flex", gap: 0, padding: "0 20px", overflow: "auto" }}>
        {TABS.map(tab => (<button key={tab} onClick={() => setViewMode(tab)} style={{ padding: "8px 16px", fontSize: 13, fontWeight: viewMode === tab ? 600 : 400, color: viewMode === tab ? T.accent : T.text3, background: "none", border: "none", borderBottom: viewMode === tab ? `2px solid ${T.accent}` : "2px solid transparent", cursor: "pointer", transition: "all 0.15s" }}>{tab}</button>))}
      </div>
    </div>); };
  const FilterBar = () => { const assignees = [...new Set(projTasks.map(t => t.assignee_id).filter(Boolean))]; const hasF = filterStatus || filterPriority || filterAssignee; return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 20px", flexWrap: "wrap" }}>
      <div style={{ position: "relative", flex: "0 0 220px" }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.text3} strokeWidth="2" style={{ position: "absolute", left: 8, top: 7 }}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks…" style={{ width: "100%", padding: "5px 8px 5px 28px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 12, outline: "none" }} />
      </div>
      <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ padding: "5px 8px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: filterStatus ? T.text : T.text3, fontSize: 12, cursor: "pointer", outline: "none" }}><option value="">Status</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
      <select value={filterPriority} onChange={e => setFilterPriority(e.target.value)} style={{ padding: "5px 8px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: filterPriority ? T.text : T.text3, fontSize: 12, cursor: "pointer", outline: "none" }}><option value="">Priority</option>{Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</select>
      <select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} style={{ padding: "5px 8px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: filterAssignee ? T.text : T.text3, fontSize: 12, cursor: "pointer", outline: "none" }}><option value="">Assignee</option>{assignees.map(uid => <option key={uid} value={uid}>{uname(uid) || uid.slice(0, 8)}</option>)}</select>
      {hasF && <button onClick={() => { setFilterStatus(""); setFilterPriority(""); setFilterAssignee(""); }} style={{ ...S.iconBtn, fontSize: 11, color: T.red }}>✕ Clear</button>}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
        {selectedTasks.size > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 8, background: T.accentDim, border: `1px solid ${T.accent}40` }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: T.accent }}>{selectedTasks.size} selected</span>
            <div style={{ width: 1, height: 14, background: T.accent + "40", margin: "0 2px" }} />
            <select onChange={e => { if (e.target.value) { bulkUpdateTasks("status", e.target.value); e.target.value = ""; } }} defaultValue=""
              style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, border: `1px solid ${T.accent}40`, background: T.surface, color: T.text, cursor: "pointer", outline: "none" }}>
              <option value="">Status…</option>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select onChange={e => { if (e.target.value) { bulkUpdateTasks("priority", e.target.value); e.target.value = ""; } }} defaultValue=""
              style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, border: `1px solid ${T.accent}40`, background: T.surface, color: T.text, cursor: "pointer", outline: "none" }}>
              <option value="">Priority…</option>
              {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select onChange={e => { if (e.target.value) { bulkUpdateTasks("section_id", e.target.value); e.target.value = ""; } }} defaultValue=""
              style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, border: `1px solid ${T.accent}40`, background: T.surface, color: T.text, cursor: "pointer", outline: "none" }}>
              <option value="">Move to…</option>
              {projSections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select onChange={e => { if (e.target.value !== "__clear__") { bulkUpdateTasks("assignee_id", e.target.value === "__none__" ? null : e.target.value); } e.target.value = ""; }} defaultValue=""
              style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, border: `1px solid ${T.accent}40`, background: T.surface, color: T.text, cursor: "pointer", outline: "none" }}>
              <option value="">Assign…</option>
              <option value="__none__">Unassign</option>
              {Object.values(profiles).map(u => <option key={u.id} value={u.id}>{u.display_name || u.email}</option>)}
            </select>
            <button onClick={() => { [...selectedTasks].forEach(id => deleteTask(id)); setSelectedTasks(new Set()); }}
              style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, border: `1px solid #ef444440`, background: "#ef444415", color: "#ef4444", cursor: "pointer", fontWeight: 600 }}>
              Delete
            </button>
            <button onClick={() => setSelectedTasks(new Set())} style={{ fontSize: 11, color: T.text3, background: "none", border: "none", cursor: "pointer", padding: "2px 4px" }}>✕</button>
          </div>
        )}
        <span style={{ fontSize: 11, color: T.text3 }}>{filteredTasks.filter(t => !t.parent_task_id).length} tasks</span>
      </div>
    </div>); };
  const Checkbox = ({ task, size = 16 }) => {
    const dn = task.status === "done";
    const st = STATUS[task.status] || STATUS.todo;
    const isMultiSel = selectedTasks.has(task.id);
    return (
      <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
        {/* Multi-select checkbox (shown on hover or when any tasks selected) */}
        {(selectedTasks.size > 0 || isMultiSel) ? (
          <div onClick={e => { e.stopPropagation(); setSelectedTasks(p => { const n = new Set(p); n.has(task.id) ? n.delete(task.id) : n.add(task.id); return n; }); }}
            style={{ width: size, height: size, borderRadius: 4, border: `2px solid ${isMultiSel ? T.accent : T.border}`, background: isMultiSel ? T.accent : T.surface2, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            {isMultiSel && <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          </div>
        ) : (
          <div onClick={e => toggleDone(task, e)} style={{ width: size, height: size, borderRadius: size / 2, border: `2px solid ${dn ? T.green : st.color}`, background: dn ? T.green : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            {dn && <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          </div>
        )}
      </div>
    );
  };

  const StatusPill = ({ task }) => { const st = STATUS[task.status] || STATUS.todo; const [open, setOpen] = useState(false); return (<div style={{ position: "relative" }}><span onClick={(e) => { e.stopPropagation(); setOpen(!open); }} style={{ ...S.pill, background: st.bg, color: st.color }}>{st.label}</span>{open && (<Dropdown onClose={() => setOpen(false)}>{Object.entries(STATUS).map(([k, v]) => (<DropdownItem key={k} onClick={() => { updateField(task.id, "status", k); setOpen(false); }}><span style={{ width: 8, height: 8, borderRadius: 4, background: v.color, display: "inline-block", marginRight: 6 }} />{v.label}</DropdownItem>))}</Dropdown>)}</div>); };

  const PriorityPill = ({ task }) => { const pr = PRIORITY[task.priority] || PRIORITY.none; const [open, setOpen] = useState(false); return (<div style={{ position: "relative" }}><span onClick={(e) => { e.stopPropagation(); setOpen(!open); }} style={{ ...S.pill, background: pr.bg, color: pr.color }}>{pr.label}</span>{open && (<Dropdown onClose={() => setOpen(false)}>{Object.entries(PRIORITY).map(([k, v]) => (<DropdownItem key={k} onClick={() => { updateField(task.id, "priority", k); setOpen(false); }}><span style={{ width: 8, height: 8, borderRadius: 4, background: v.dot, display: "inline-block", marginRight: 6 }} />{v.label}</DropdownItem>))}</Dropdown>)}</div>); };

  const AssigneeCell = ({ task }) => { const [open, setOpen] = useState(false); const pl = Object.values(profiles); return (<div style={{ position: "relative" }}><div onClick={(e) => { e.stopPropagation(); setOpen(!open); }} style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", padding: "2px 4px", borderRadius: 4 }}>{task.assignee_id ? (<><div style={{ width: 20, height: 20, borderRadius: 10, background: acol(task.assignee_id) + "30", color: acol(task.assignee_id), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700 }}>{ini(task.assignee_id)}</div><span style={{ fontSize: 12, color: T.text2, maxWidth: 70, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{uname(task.assignee_id).split(" ")[0]}</span></>) : (<div style={{ width: 20, height: 20, borderRadius: 10, border: `1.5px dashed ${T.text3}` }} />)}</div>{open && (<Dropdown onClose={() => setOpen(false)} wide><DropdownItem onClick={() => { updateField(task.id, "assignee_id", null); setOpen(false); }}><span style={{ color: T.text3 }}>Unassigned</span></DropdownItem>{pl.map(u => (<DropdownItem key={u.id} onClick={() => { updateField(task.id, "assignee_id", u.id); setOpen(false); }}><div style={{ width: 18, height: 18, borderRadius: 9, background: acol(u.id) + "30", color: acol(u.id), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700 }}>{ini(u.id)}</div>{u.display_name || u.email}</DropdownItem>))}</Dropdown>)}</div>); };

  const DateCell = ({ task }) => { const od = isOverdue(task.due_date) && task.status !== "done"; return (<input type="date" value={task.due_date || ""} onChange={(e) => updateField(task.id, "due_date", e.target.value || null)} onClick={(e) => e.stopPropagation()} style={{ background: "none", border: "none", color: od ? T.red : task.due_date ? T.text2 : T.text3, fontSize: 12, cursor: "pointer", outline: "none", width: 95, fontFamily: "inherit" }} />); };
  const TaskRow = ({ task, depth = 0 }) => { const subs = getSubtasks(task.id); const hasSubs = subs.length > 0 || addingSubtaskTo === task.id; const exp = expandedTasks[task.id]; const hov = hoveredRow === task.id; const sel = selectedTask?.id === task.id; return (<>{/* row */}<div style={{ ...S.row(hov, sel), paddingLeft: 12 + depth * 24, background: selectedTasks.has(task.id) ? T.accentDim : sel ? T.accentDim : hov ? T.surface2 : "transparent" }} onClick={() => setSelectedTask(task)} onMouseEnter={() => setHoveredRow(task.id)} onMouseLeave={() => setHoveredRow(null)}><div style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>{hasSubs ? <svg onClick={(e) => { e.stopPropagation(); setExpandedTasks(p => ({ ...p, [task.id]: !exp })); }} width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ cursor: "pointer", transform: exp ? "rotate(0)" : "rotate(-90deg)", transition: "transform 0.15s", flexShrink: 0 }}><path d="M3 4.5l3 3 3-3" stroke={T.text3} strokeWidth="1.5" strokeLinecap="round" /></svg> : <div style={{ width: 12 }} />}<Checkbox task={task} /><span style={{ fontSize: 13, color: task.status === "done" ? T.text3 : T.text, textDecoration: task.status === "done" ? "line-through" : "none", fontWeight: sel ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{task.title}</span>{subs.length > 0 && <span style={{ fontSize: 10, color: T.text3, background: T.surface3, padding: "1px 5px", borderRadius: 8, fontWeight: 600 }}>{subs.filter(s => s.status === "done").length}/{subs.length}</span>}{hov && <div style={{ display: "flex", gap: 2 }}><button onClick={(e) => startAddSubtask(task, e)} style={S.iconBtn} title="Add subtask"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.text3} strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg></button><button onClick={(e) => { e.stopPropagation(); duplicateTask(task); }} style={S.iconBtn} title="Duplicate"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.text3} strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button><button onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }} style={S.iconBtn} title="Delete"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.text3} strokeWidth="2"><path d="M3 6h18M8 6V4h8v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button></div>}</div><StatusPill task={task} /><PriorityPill task={task} /><AssigneeCell task={task} /><DateCell task={task} /></div>{exp && subs.map(sub => <TaskRow key={sub.id} task={sub} depth={depth + 1} />)}{exp && addingSubtaskTo === task.id && <div style={{ ...S.row(false, false), paddingLeft: 36 + depth * 24, background: T.surface2 }}><div style={{ display: "flex", alignItems: "center", gap: 6 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg><input autoFocus value={newSubtaskTitle} onChange={e => setNewSubtaskTitle(e.target.value)} onKeyDown={e => { if (e.key === "Enter") createSubtask(task); if (e.key === "Escape") { setAddingSubtaskTo(null); setNewSubtaskTitle(""); } }} onBlur={() => { if (newSubtaskTitle.trim()) createSubtask(task); else { setAddingSubtaskTo(null); setNewSubtaskTitle(""); } }} placeholder="Subtask name…" style={{ flex: 1, background: "none", border: "none", color: T.text, fontSize: 12, outline: "none" }} /></div><div /><div /><div /><div /></div>}</>); };

  const ListView = () => { const toggleSort = (col) => { setSortCol(col); setSortDir(p => sortCol === col && p === "asc" ? "desc" : "asc"); }; const arrow = (col) => sortCol === col ? (sortDir === "asc" ? " ↑" : " ↓") : ""; return (
    <div style={{ flex: 1, overflow: "auto", padding: "0 0 80px" }}>
      <div style={{ display: "grid", gridTemplateColumns: projGrid, padding: "0 12px", borderBottom: `1px solid ${T.border}`, position: "sticky", top: 0, zIndex: 5, background: T.bg }}>
        <div style={{ ...S.colHdr, position: "relative" }} onClick={() => toggleSort("title")}>Task name{arrow("title")}<ResizeHandle index={0} onStart={projResize} /></div>
        <div style={{ ...S.colHdr, position: "relative" }} onClick={() => toggleSort("status")}>Status{arrow("status")}<ResizeHandle index={1} onStart={projResize} /></div>
        <div style={{ ...S.colHdr, position: "relative" }} onClick={() => toggleSort("priority")}>Priority{arrow("priority")}<ResizeHandle index={2} onStart={projResize} /></div>
        <div style={{ ...S.colHdr, position: "relative" }}>Assignee<ResizeHandle index={3} onStart={projResize} /></div>
        <div style={S.colHdr} onClick={() => toggleSort("due_date")}>Due date{arrow("due_date")}</div>
      </div>
      {projSections.map((sec, si) => { const st = filteredTasks.filter(t => t.section_id === sec.id); const roots = sortedTasks(rootTasks(st)); const isColl = collapsed[sec.id]; const sd = st.filter(t => t.status === "done").length; const color = secColor(si);
        const wipBreached = sec.wip_limit && st.filter(t => t.status !== "done").length > sec.wip_limit;
        return (
        <div key={sec.id}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", cursor: "pointer", userSelect: "none", position: "relative" }}
            onContextMenu={e => { e.preventDefault(); setSectionCtxMenu({ secId: sec.id, x: e.clientX, y: e.clientY }); }}>
            <svg onClick={() => setCollapsed(p => ({ ...p, [sec.id]: !isColl }))} width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ cursor: "pointer", transform: isColl ? "rotate(-90deg)" : "rotate(0)", transition: "transform 0.15s" }}><path d="M3 4.5l3 3 3-3" stroke={color} strokeWidth="1.5" strokeLinecap="round" /></svg>
            {editingSectionId === sec.id ? <input autoFocus value={editingSectionName} onChange={e => setEditingSectionName(e.target.value)} onBlur={() => renameSection(sec.id)} onKeyDown={e => e.key === "Enter" && renameSection(sec.id)} style={{ fontSize: 13, fontWeight: 700, color, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, padding: "2px 6px", outline: "none" }} /> : <span onDoubleClick={() => { setEditingSectionId(sec.id); setEditingSectionName(sec.name); }} style={{ fontSize: 13, fontWeight: 700, color, flex: 1 }}>{sec.name}</span>}
            {sec.is_complete_column && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: "#22c55e20", color: "#22c55e", fontWeight: 700 }}>DONE</span>}
            {sec.wip_limit && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: wipBreached ? "#ef444420" : T.surface3, color: wipBreached ? "#ef4444" : T.text3, fontWeight: 700 }}>WIP {st.filter(t => t.status !== "done").length}/{sec.wip_limit}</span>}
            <span style={{ fontSize: 11, color: T.text3, fontWeight: 500 }}>{sd}/{st.length}</span>
            <button onClick={() => deleteSection(sec.id)} style={{ ...S.iconBtn, opacity: 0.4 }} title="Delete section"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button>
          </div>
          {!isColl && <>{roots.map(task => <TaskRow key={task.id} task={task} depth={0} />)}{addingTo === sec.id ? <div style={{ ...S.row(false, false), background: T.surface2 }}><div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 20 }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg><input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)} onKeyDown={e => { if (e.key === "Enter") createTask(sec.id); if (e.key === "Escape") { setAddingTo(null); setNewTitle(""); } }} onBlur={() => { if (newTitle.trim()) createTask(sec.id); else { setAddingTo(null); setNewTitle(""); } }} placeholder="Task name…" style={{ flex: 1, background: "none", border: "none", color: T.text, fontSize: 13, outline: "none" }} /></div><div /><div /><div /><div /></div> : <div onClick={() => { setAddingTo(sec.id); setNewTitle(""); }} style={{ ...S.addRow, opacity: 0.6 }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.6}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>Add task…</div>}</>}
        </div>); })}
      {addingSection ? <div style={{ padding: "8px 12px", display: "flex", gap: 8 }}><input autoFocus value={newSectionName} onChange={e => setNewSectionName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") createSection(); if (e.key === "Escape") setAddingSection(false); }} placeholder="Section name…" style={{ flex: 1, padding: "5px 8px", borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, outline: "none" }} /><button onClick={createSection} style={{ padding: "4px 12px", borderRadius: 4, background: T.accent, color: "#fff", border: "none", fontSize: 12, cursor: "pointer" }}>Add</button></div> : <div onClick={() => setAddingSection(true)} style={{ ...S.addRow, opacity: 0.5, paddingLeft: 12 }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.5}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>Add section…</div>}
    </div>); };
  const BoardView = () => (
    <div style={{ flex: 1, display: "flex", gap: 16, padding: "16px 20px", overflow: "auto" }}>
      {projSections.map((sec, si) => {
        const st = filteredTasks.filter(t => t.section_id === sec.id && !t.parent_task_id);
        const color = secColor(si);
        const isOver = dragOverTarget === sec.id;
        const wipLimit = sec.wip_limit;
        const isWipBreached = wipLimit && st.length > wipLimit;
        const isDoneCol = sec.is_complete_column || sec.name.toLowerCase() === "done";
        const borderColor = isOver ? T.accent : isWipBreached ? "#ef4444" : T.border;
        return (
          <div key={sec.id}
            onDragOver={(e) => { e.preventDefault(); setDragOverTarget(sec.id); }}
            onDragLeave={() => setDragOverTarget(null)}
            onDrop={() => { if (dragTask) handleBoardDrop(dragTask, sec.id); }}
            style={{ width: 280, flexShrink: 0, display: "flex", flexDirection: "column", borderRadius: 10, background: isOver ? T.accentDim : T.surface, border: `1px solid ${borderColor}`, transition: "border 0.15s" }}>
            <div style={{ padding: "12px 14px 8px", display: "flex", alignItems: "center", gap: 8, borderBottom: `2px solid ${isDoneCol ? "#22c55e" : color}` }}>
              {isDoneCol ? <span style={{ fontSize: 14 }}>✅</span> : null}
              <span style={{ fontSize: 13, fontWeight: 700, color: isDoneCol ? "#22c55e" : color, flex: 1 }}>{sec.name}</span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 8,
                background: isWipBreached ? "#ef444420" : T.surface3,
                color: isWipBreached ? "#ef4444" : T.text3 }}>
                {st.length}{wipLimit ? `/${wipLimit}` : ""}
              </span>
              {isWipBreached && <span title="WIP limit exceeded!" style={{ fontSize: 12 }}>⚠️</span>}
            </div>
            <div style={{ flex: 1, padding: 8, display: "flex", flexDirection: "column", gap: 6, overflow: "auto" }}>
              {st.map(task => {
                const subs = getSubtasks(task.id);
                const pr = PRIORITY[task.priority] || PRIORITY.none;
                const isDone = task.status === "done";
                return (
                  <div key={task.id} draggable
                    onDragStart={() => setDragTask(task.id)}
                    onDragEnd={() => { setDragTask(null); setDragOverTarget(null); }}
                    onClick={() => setSelectedTask(task)}
                    style={{ padding: "10px 12px", borderRadius: 8, background: isDone ? T.surface3 : T.surface2, border: `1px solid ${T.border}`, cursor: "pointer", opacity: dragTask === task.id ? 0.5 : 1, transition: "all 0.1s" }}
                    onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 3px 12px rgba(0,0,0,0.15)`; e.currentTarget.style.transform = "translateY(-1px)"; }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "none"; }}>
                    {task.priority && task.priority !== "none" && <div style={{ width: "100%", height: 2, borderRadius: 1, background: pr.dot, marginBottom: 6 }} />}
                    <div style={{ fontSize: 13, fontWeight: 500, color: isDone ? T.text3 : T.text, textDecoration: isDone ? "line-through" : "none", marginBottom: 8, lineHeight: 1.4 }}>{task.title}</div>
                    {task.labels?.length > 0 && (
                      <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginBottom: 6 }}>
                        {task.labels.slice(0, 3).map(l => {
                          const lc = { bug: "#ef4444", feature: "#22c55e", improvement: "#3b82f6", design: "#a855f7", urgent: "#f97316", research: "#06b6d4" }[l] || T.accent;
                          return <span key={l} style={{ fontSize: 9, padding: "1px 6px", borderRadius: 8, background: lc+"20", color: lc, fontWeight: 700 }}>{l}</span>;
                        })}
                      </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      {task.due_date && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 8, background: isOverdue(task.due_date) && !isDone ? T.redDim : T.surface3, color: isOverdue(task.due_date) && !isDone ? T.red : T.text3, fontWeight: 500 }}>{toDateStr(task.due_date)}</span>}
                      {subs.length > 0 && <span style={{ fontSize: 10, color: T.text3 }}>✓ {subs.filter(s => s.status === "done").length}/{subs.length}</span>}
                      {task.story_points && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: T.surface3, color: T.text3, fontWeight: 700 }}>{task.story_points}sp</span>}
                      <div style={{ flex: 1 }} />
                      {task.assignee_id && <div style={{ width: 22, height: 22, borderRadius: 11, background: acol(task.assignee_id) + "30", color: acol(task.assignee_id), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700 }}>{ini(task.assignee_id)}</div>}
                    </div>
                  </div>
                );
              })}
              {addingTo === sec.id
                ? <div style={{ padding: 8 }}><input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)} onKeyDown={e => { if (e.key === "Enter") createTask(sec.id); if (e.key === "Escape") { setAddingTo(null); setNewTitle(""); } }} onBlur={() => { if (newTitle.trim()) createTask(sec.id); else { setAddingTo(null); setNewTitle(""); } }} placeholder="Task name…" style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontSize: 12, outline: "none" }} /></div>
                : <div onClick={() => { setAddingTo(sec.id); setNewTitle(""); }} style={{ padding: "6px 8px", color: T.text3, fontSize: 12, cursor: "pointer", borderRadius: 6, display: "flex", alignItems: "center", gap: 4, opacity: 0.6 }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.6}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>Add task</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
  const TimelineView = () => {
    const tw = filteredTasks.filter(t => !t.parent_task_id && (t.start_date || t.due_date));
    if (!tw.length) return (
      <div style={{ padding: 40, textAlign: "center", color: T.text3 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📅</div>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>No tasks with dates</div>
        <div style={{ fontSize: 12 }}>Add start dates and due dates to your tasks to see the Gantt chart</div>
      </div>
    );
    const DAY_W = 30;
    const ROW_H = 36;
    const LABEL_W = 220;
    const today = new Date().toISOString().split("T")[0];

    // Date range
    const allDates = tw.flatMap(t => [t.start_date, t.due_date].filter(Boolean).map(d => new Date(d)));
    const minD = new Date(Math.min(...allDates.map(d => d.getTime())) - 7 * 86400000);
    const maxD = new Date(Math.max(...allDates.map(d => d.getTime())) + 21 * 86400000);
    const totalDays = Math.ceil((maxD - minD) / 86400000);

    const getX = (dateStr) => Math.round(((new Date(dateStr) - minD) / 86400000) * DAY_W);
    const todayX = getX(today);

    // Build month markers
    const months = [];
    const d = new Date(minD); d.setDate(1);
    while (d <= maxD) {
      const mStart = Math.max(0, Math.round(((new Date(d) - minD) / 86400000) * DAY_W));
      const nextM = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const mEnd = Math.round(((Math.min(nextM, maxD) - minD) / 86400000) * DAY_W);
      months.push({ label: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }), x: mStart, width: mEnd - mStart });
      d.setMonth(d.getMonth() + 1);
    }

    // Group tasks by section
    const bySection = projSections.map(sec => ({
      sec,
      tasks: tw.filter(t => t.section_id === sec.id),
    })).filter(g => g.tasks.length > 0);

    let rowIndex = 0;
    const rows = bySection.flatMap(({ sec, tasks }) => {
      const secRow = { type: "section", sec, rowIndex: rowIndex++ };
      const taskRows = tasks.map(task => ({ type: "task", task, rowIndex: rowIndex++ }));
      return [secRow, ...taskRows];
    });

    const totalHeight = rows.length * ROW_H + 60;

    return (
      <div style={{ flex: 1, overflow: "auto" }}>
        <div style={{ display: "flex", minWidth: LABEL_W + totalDays * DAY_W }}>
          {/* Sticky label column */}
          <div style={{ width: LABEL_W, flexShrink: 0, position: "sticky", left: 0, zIndex: 4, background: T.bg }}>
            {/* Header */}
            <div style={{ height: 52, borderBottom: `1px solid ${T.border}`, borderRight: `1px solid ${T.border}`, background: T.surface, display: "flex", alignItems: "flex-end", padding: "0 12px 6px" }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.8 }}>Task</span>
            </div>
            {/* Rows */}
            {rows.map(row => (
              <div key={row.type === "section" ? `sec-${row.sec.id}` : `task-${row.task.id}`}
                style={{ height: ROW_H, borderBottom: `1px solid ${T.border}`, borderRight: `1px solid ${T.border}`, display: "flex", alignItems: "center", padding: row.type === "section" ? "0 12px" : "0 12px 0 24px", background: row.type === "section" ? T.surface2 : "transparent" }}>
                {row.type === "section" ? (
                  <span style={{ fontSize: 11, fontWeight: 700, color: SECTION_COLORS[projSections.indexOf(row.sec) % SECTION_COLORS.length] || T.accent, textTransform: "uppercase", letterSpacing: 0.5 }}>{row.sec.name}</span>
                ) : (
                  <div onClick={() => setSelectedTask(row.task)} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", flex: 1, minWidth: 0 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 5, border: `2px solid ${row.task.status === "done" ? "#22c55e" : T.border}`, background: row.task.status === "done" ? "#22c55e" : "transparent", flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: row.task.status === "done" ? T.text3 : T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: row.task.status === "done" ? "line-through" : "none" }}>{row.task.title}</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Timeline area */}
          <div style={{ flex: 1, position: "relative" }}>
            {/* Month header row */}
            <div style={{ height: 26, position: "sticky", top: 0, zIndex: 3, background: T.surface, borderBottom: `1px solid ${T.border}`, display: "flex" }}>
              {months.map((m, i) => (
                <div key={i} style={{ width: m.width, flexShrink: 0, borderRight: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: T.text3 }}>{m.label}</div>
              ))}
            </div>
            {/* Day header row */}
            <div style={{ height: 26, position: "sticky", top: 26, zIndex: 3, background: T.surface, borderBottom: `1px solid ${T.border}`, position: "relative" }}>
              {/* Week markers */}
              {Array.from({ length: Math.ceil(totalDays / 7) }, (_, i) => {
                const d2 = new Date(minD.getTime() + i * 7 * 86400000);
                return (
                  <div key={i} style={{ position: "absolute", left: i * 7 * DAY_W, top: 0, bottom: 0, display: "flex", alignItems: "center", paddingLeft: 3 }}>
                    <div style={{ width: 1, height: "60%", background: `${T.border}` }} />
                    <span style={{ fontSize: 9, color: T.text3, marginLeft: 3 }}>{d2.toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}</span>
                  </div>
                );
              })}
            </div>

            {/* Grid + bars */}
            <div style={{ position: "relative", height: rows.length * ROW_H }}>
              {/* Vertical grid lines (weeks) */}
              {Array.from({ length: Math.ceil(totalDays / 7) }, (_, i) => (
                <div key={i} style={{ position: "absolute", left: i * 7 * DAY_W, top: 0, bottom: 0, width: 1, background: `${T.border}40` }} />
              ))}
              {/* Today line */}
              {todayX >= 0 && todayX <= totalDays * DAY_W && (
                <div style={{ position: "absolute", left: todayX, top: 0, bottom: 0, width: 2, background: "#ef444470", zIndex: 2 }}>
                  <div style={{ position: "absolute", top: -4, left: -4, width: 10, height: 10, borderRadius: 5, background: "#ef4444" }} />
                </div>
              )}
              {/* Row backgrounds */}
              {rows.map((row, i) => (
                <div key={i} style={{ position: "absolute", left: 0, right: 0, top: i * ROW_H, height: ROW_H, background: row.type === "section" ? T.surface2 : i % 2 === 0 ? "transparent" : `${T.surface}40`, borderBottom: `1px solid ${T.border}20` }} />
              ))}
              {/* Task bars */}
              {rows.filter(r => r.type === "task").map(row => {
                const t = row.task;
                const startStr = t.start_date || t.due_date;
                const endStr = t.due_date || t.start_date;
                const sx = getX(startStr);
                const ex = getX(endStr) + DAY_W;
                const bw = Math.max(ex - sx, DAY_W);
                const st = STATUS[t.status] || STATUS.todo;
                const isOverdueTask = t.due_date && t.due_date < today && t.status !== "done";
                const pr = PRIORITY[t.priority] || PRIORITY.none;
                const pct = t.status === "done" ? 100 : 0;
                return (
                  <div key={t.id} style={{ position: "absolute", top: row.rowIndex * ROW_H + 7, left: sx, width: bw, height: ROW_H - 14 }}>
                    <div onClick={() => setSelectedTask(t)} style={{ position: "relative", height: "100%", borderRadius: 5, background: isOverdueTask ? "#ef444420" : t.status === "done" ? "#22c55e18" : `${proj?.color || T.accent}20`, border: `1.5px solid ${isOverdueTask ? "#ef4444" : t.status === "done" ? "#22c55e" : proj?.color || T.accent}60`, cursor: "pointer", overflow: "hidden", display: "flex", alignItems: "center", paddingLeft: 6, paddingRight: 4, gap: 4 }}
                      onMouseEnter={e => e.currentTarget.style.opacity = "0.8"}
                      onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                      {/* Fill bar */}
                      {pct > 0 && <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`, background: "#22c55e20", borderRadius: 4 }} />}
                      {/* Priority dot */}
                      {t.priority && t.priority !== "none" && <div style={{ width: 5, height: 5, borderRadius: 3, background: pr.dot, flexShrink: 0, position: "relative" }} />}
                      <span style={{ fontSize: 10, fontWeight: 600, color: isOverdueTask ? "#ef4444" : t.status === "done" ? "#22c55e" : T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, position: "relative" }}>{t.title}</span>
                      {t.assignee_id && <div style={{ width: 16, height: 16, borderRadius: 8, background: acol(t.assignee_id) + "40", color: acol(t.assignee_id), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, fontWeight: 700, flexShrink: 0, position: "relative" }}>{ini(t.assignee_id)}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  };
  const CalendarView = () => { const yr = calMonth.getFullYear(); const mo = calMonth.getMonth(); const fd = new Date(yr, mo, 1).getDay(); const dim = new Date(yr, mo + 1, 0).getDate(); const today = new Date(); const cells = []; for (let i = 0; i < fd; i++) cells.push(null); for (let d = 1; d <= dim; d++) cells.push(d); const gtd = (day) => { const ds = `${yr}-${String(mo + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`; return filteredTasks.filter(t => t.due_date === ds); }; return (
    <div style={{ flex: 1, overflow: "auto", padding: "12px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <button onClick={() => setCalMonth(new Date(yr, mo - 1, 1))} style={S.iconBtn}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.text2} strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg></button>
        <span style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{calMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span>
        <button onClick={() => setCalMonth(new Date(yr, mo + 1, 1))} style={S.iconBtn}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.text2} strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg></button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1 }}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => <div key={d} style={{ padding: 6, fontSize: 11, fontWeight: 600, color: T.text3, textAlign: "center" }}>{d}</div>)}
        {cells.map((day, i) => { if (!day) return <div key={`e${i}`} />; const dt = gtd(day); const isT = day === today.getDate() && mo === today.getMonth() && yr === today.getFullYear(); return (
          <div key={i} style={{ minHeight: 80, padding: 4, border: `1px solid ${T.border}`, borderRadius: 4, background: isT ? T.accentDim : T.surface }}>
            <div style={{ fontSize: 11, fontWeight: isT ? 700 : 400, color: isT ? T.accent : T.text2, marginBottom: 4, textAlign: "right", padding: "0 2px" }}>{day}</div>
            {dt.slice(0, 3).map(task => <div key={task.id} onClick={() => setSelectedTask(task)} style={{ fontSize: 10, padding: "1px 4px", borderRadius: 3, background: (STATUS[task.status] || STATUS.todo).bg, color: (STATUS[task.status] || STATUS.todo).color, marginBottom: 2, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.title}</div>)}
            {dt.length > 3 && <div style={{ fontSize: 9, color: T.text3, textAlign: "center" }}>+{dt.length - 3}</div>}
          </div>); })}
      </div>
    </div>); };
  const MyTasksView = () => {
    const today = new Date(); today.setHours(0,0,0,0);
    const weekOut = new Date(today); weekOut.setDate(weekOut.getDate() + 7);
    const mt = tasks.filter(t => t.assignee_id === user?.id && t.status !== "done" && !t.parent_task_id);
    const todayTasks = mt.filter(t => t.due_date && new Date(t.due_date) <= today);
    const upcomingTasks = mt.filter(t => t.due_date && new Date(t.due_date) > today && new Date(t.due_date) <= weekOut);
    const somedayTasks = mt.filter(t => !t.due_date || new Date(t.due_date) > weekOut);
    const [myFilter, setMyFilter] = useState("all");
    const groups = [
      { key: "overdue", label: "⚠️ Overdue", tasks: todayTasks, color: "#ef4444" },
      { key: "upcoming", label: "📅 Next 7 Days", tasks: upcomingTasks, color: T.accent },
      { key: "someday", label: "🗓 Later", tasks: somedayTasks, color: T.text3 },
    ].filter(g => g.tasks.length > 0);
    return (
      <div style={{ flex: 1, overflow: "auto", padding: "20px 28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: T.text, margin: 0 }}>My Tasks</h2>
          <span style={{ fontSize: 12, color: T.text3 }}>· {mt.length} open</span>
        </div>
        {!mt.length ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: T.text3 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>All clear!</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>No tasks assigned to you.</div>
          </div>
        ) : groups.map(group => (
          <div key={group.key} style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: group.color, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              {group.label}
              <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: 8, background: group.color + "20", color: group.color }}>{group.tasks.length}</span>
            </div>
            {group.tasks.map(task => {
              const p = projects.find(pr => pr.id === task.project_id);
              const pr = PRIORITY[task.priority] || PRIORITY.none;
              return (
                <div key={task.id} onClick={() => { setActiveProject(task.project_id); setShowMyTasks(false); setTimeout(() => setSelectedTask(task), 100); }}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 8, border: `1px solid ${T.border}`, marginBottom: 5, cursor: "pointer", background: T.surface, borderLeft: `3px solid ${pr.dot}` }}
                  onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                  onMouseLeave={e => e.currentTarget.style.background = T.surface}>
                  <Checkbox task={task} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: T.text, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.title}</div>
                    <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>
                      <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: p?.color || T.text3, marginRight: 4 }} />
                      {p?.name || ""}
                      {task.section_id && <span style={{ color: T.text3 }}> · {sections.find(s => s.id === task.section_id)?.name || ""}</span>}
                    </div>
                  </div>
                  {task.estimated_hours && <span style={{ fontSize: 10, color: T.text3 }}>{task.estimated_hours}h</span>}
                  {task.due_date && <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 8, background: group.key === "overdue" ? "#ef444420" : T.surface3, color: group.key === "overdue" ? "#ef4444" : T.text3, fontWeight: 500 }}>{toDateStr(task.due_date)}</span>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  };
  const DetailPane = () => {
    const [activeDetailTab, setActiveDetailTab] = useState("details");
    const [activity, setActivity] = useState([]);
    const [activityLoading, setActivityLoading] = useState(false);
    if (!selectedTask) return null;
    const task = selectedTask;
    const subs = getSubtasks(task.id);
    const bb = getBlockedBy(task.id);
    const bl = getBlocking(task.id);
    const tcf = customFieldValues[task.id] || {};
    const parent = task.parent_task_id ? tasks.find(t => t.id === task.parent_task_id) : null;

    const DETAIL_TABS = ["Details", "Activity", "Subtasks", "Files"];
    const LABEL_COLORS = { bug: "#ef4444", feature: "#22c55e", improvement: "#3b82f6", design: "#a855f7", urgent: "#f97316", research: "#06b6d4" };
    const ALL_LABELS = Object.keys(LABEL_COLORS);
    const taskLabels = task.labels || [];
    const toggleLabel = (label) => {
      const newLabels = taskLabels.includes(label) ? taskLabels.filter(l => l !== label) : [...taskLabels, label];
      updateField(task.id, "labels", newLabels);
    };
    const prBar = task.target_value > 0 ? Math.min(100, Math.round(((task.current_value || 0) / task.target_value) * 100)) : 0;

    // Load activity when tab switches
    const loadActivity = async () => {
      if (activity.length && activity[0]?.task_id === task.id) return;
      setActivityLoading(true);
      const { data } = await supabase.from("task_activity").select("*").eq("task_id", task.id).order("created_at", { ascending: false }).limit(50);
      setActivity(data || []);
      setActivityLoading(false);
    };

    const pct = subs.length > 0 ? (subs.filter(s => s.status === "done").length / subs.length) * 100 : 0;
    const FIELD_LABEL = { fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 };

    return (
      <div style={{ width: 420, flexShrink: 0, borderLeft: `1px solid ${T.border}`, background: T.surface, display: "flex", flexDirection: "column", overflow: "hidden", animation: "slideIn 0.2s ease" }}>
        {/* Header */}
        <div style={{ padding: "12px 16px 10px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
            <Checkbox task={task} size={18} />
            <div style={{ flex: 1, minWidth: 0 }}>
              {parent && <div style={{ fontSize: 10, color: T.text3, marginBottom: 3 }}>↳ {parent.title}</div>}
              <input value={task.title} onChange={e => { const v = e.target.value; setSelectedTask(p => ({ ...p, title: v })); setTasks(p => p.map(t => t.id === task.id ? { ...t, title: v } : t)); }}
                onBlur={() => updateField(task.id, "title", task.title)}
                style={{ fontSize: 15, fontWeight: 700, color: T.text, background: "none", border: "none", outline: "none", width: "100%", padding: 0, lineHeight: 1.3 }} />
            </div>
            <button onClick={() => setSelectedTask(null)} style={S.iconBtn}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.text3} strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
          {/* Labels */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
            {taskLabels.map(l => (
              <span key={l} onClick={() => toggleLabel(l)} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 8, background: (LABEL_COLORS[l] || T.accent) + "20", color: LABEL_COLORS[l] || T.accent, fontWeight: 700, cursor: "pointer" }}>
                {l} ×
              </span>
            ))}
            <div style={{ position: "relative" }}>
              <button style={{ fontSize: 10, padding: "2px 7px", borderRadius: 8, border: `1px dashed ${T.border}`, background: "none", color: T.text3, cursor: "pointer" }}
                onClick={e => { e.stopPropagation(); const m = e.currentTarget.nextSibling; m.style.display = m.style.display === "none" ? "block" : "none"; }}>
                + label
              </button>
              <div style={{ display: "none", position: "absolute", top: "100%", left: 0, zIndex: 50, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: 6, minWidth: 120, boxShadow: "0 8px 24px rgba(0,0,0,0.25)", marginTop: 4 }}>
                {ALL_LABELS.map(l => (
                  <div key={l} onClick={e => { e.stopPropagation(); toggleLabel(l); e.currentTarget.closest("[style*='display: block']").style.display = "none"; }}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 4, cursor: "pointer", fontSize: 11 }}
                    onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: LABEL_COLORS[l] }} />
                    <span style={{ color: taskLabels.includes(l) ? T.accent : T.text }}>{l}</span>
                    {taskLabels.includes(l) && <span style={{ marginLeft: "auto", fontSize: 10, color: T.accent }}>✓</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
          {/* Tab bar */}
          <div style={{ display: "flex", gap: 0, marginTop: 4 }}>
            {DETAIL_TABS.map(tab => (
              <button key={tab} onClick={() => { setActiveDetailTab(tab.toLowerCase()); if (tab === "Activity") loadActivity(); }}
                style={{ padding: "5px 12px", fontSize: 12, fontWeight: activeDetailTab === tab.toLowerCase() ? 600 : 400, color: activeDetailTab === tab.toLowerCase() ? T.accent : T.text3, background: "none", border: "none", borderBottom: `2px solid ${activeDetailTab === tab.toLowerCase() ? T.accent : "transparent"}`, cursor: "pointer" }}>
                {tab}{tab === "Subtasks" && subs.length > 0 ? ` (${subs.length})` : ""}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "14px 16px" }}>
          {/* DETAILS TAB */}
          {activeDetailTab === "details" && (
            <div>
              {/* Core fields grid */}
              <div style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: "10px 12px", alignItems: "center", marginBottom: 18 }}>
                <span style={FIELD_LABEL}>Status</span><StatusPill task={task} />
                <span style={FIELD_LABEL}>Priority</span><PriorityPill task={task} />
                <span style={FIELD_LABEL}>Assignee</span><AssigneeCell task={task} />
                <span style={FIELD_LABEL}>Due Date</span><DateCell task={task} />
                <span style={FIELD_LABEL}>Start Date</span>
                <input type="date" value={task.start_date || ""} onChange={e => updateField(task.id, "start_date", e.target.value || null)}
                  style={{ background: "none", border: "none", color: task.start_date ? T.text2 : T.text3, fontSize: 12, cursor: "pointer", outline: "none", fontFamily: "inherit" }} />
                <span style={FIELD_LABEL}>Section</span>
                <select value={task.section_id || ""} onChange={e => updateField(task.id, "section_id", e.target.value)}
                  style={{ padding: "3px 6px", borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 12, outline: "none" }}>
                  {projSections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              {/* Effort tracking */}
              <div style={{ background: T.surface2, borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Effort</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 10, color: T.text3, display: "block", marginBottom: 3 }}>Est. Hours</label>
                    <input type="number" value={task.estimated_hours || ""} onChange={e => updateField(task.id, "estimated_hours", e.target.value ? Number(e.target.value) : null)}
                      placeholder="0" style={{ width: "100%", padding: "5px 8px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: T.text3, display: "block", marginBottom: 3 }}>Story Points</label>
                    <input type="number" value={task.story_points || ""} onChange={e => updateField(task.id, "story_points", e.target.value ? Number(e.target.value) : null)}
                      placeholder="0" style={{ width: "100%", padding: "5px 8px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                  </div>
                </div>
              </div>

              {/* Link to OKR KR */}
              {objectives.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <label style={{ ...FIELD_LABEL, display: "block", marginBottom: 6 }}>Linked OKR</label>
                  <select value={task.linked_kr_id || ""} onChange={e => updateField(task.id, "linked_kr_id", e.target.value || null)}
                    style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: task.linked_kr_id ? T.accent : T.text3, fontSize: 12, outline: "none", cursor: "pointer" }}>
                    <option value="">No linked KR</option>
                    {objectives.map(obj => (
                      <optgroup key={obj.id} label={obj.title}>
                        {/* We don't have KRs here easily, but show objectives as a start */}
                      </optgroup>
                    ))}
                  </select>
                  {task.linked_kr_id && <div style={{ fontSize: 10, color: T.accent, marginTop: 4 }}>✓ Contributes to OKR progress</div>}
                </div>
              )}

              {/* Description */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ ...FIELD_LABEL, display: "block", marginBottom: 6 }}>Description</label>
                <textarea value={task.description || ""} rows={3} placeholder="Add context, requirements, or notes…"
                  onChange={e => { const v = e.target.value; setSelectedTask(p => ({ ...p, description: v })); setTasks(p => p.map(t => t.id === task.id ? { ...t, description: v } : t)); }}
                  onBlur={() => updateField(task.id, "description", task.description || "")}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, resize: "vertical", outline: "none", fontFamily: "inherit", lineHeight: 1.5, boxSizing: "border-box", minHeight: 80 }} />
              </div>

              {/* Custom fields */}
              {customFields.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <label style={{ ...FIELD_LABEL, display: "block", marginBottom: 6 }}>Custom Fields</label>
                  {customFields.map(cf => (
                    <div key={cf.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 12, color: T.text3, width: 90, flexShrink: 0 }}>{cf.name}</span>
                      <input value={tcf[cf.id] || ""} onChange={e => updateCustomFieldValue(task.id, cf.id, e.target.value)}
                        style={{ flex: 1, padding: "4px 7px", borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 12, outline: "none" }} />
                    </div>
                  ))}
                </div>
              )}
              <button onClick={createCustomField} style={{ fontSize: 11, color: T.accent, background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 16 }}>+ Add custom field</button>

              {/* Dependencies */}
              {(bb.length > 0 || bl.length > 0) && (
                <div style={{ marginBottom: 16 }}>
                  <label style={{ ...FIELD_LABEL, display: "block", marginBottom: 6 }}>Dependencies</label>
                  {bb.map(d => <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", fontSize: 12 }}>
                    <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "#ef444420", color: "#ef4444", fontWeight: 700 }}>BLOCKED BY</span>
                    <span style={{ color: T.text2, flex: 1 }}>{d.task.title}</span>
                    <button onClick={() => removeDependency(d.id)} style={S.iconBtn}>✕</button>
                  </div>)}
                  {bl.map(d => <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", fontSize: 12 }}>
                    <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "#f9731620", color: "#f97316", fontWeight: 700 }}>BLOCKING</span>
                    <span style={{ color: T.text2, flex: 1 }}>{d.task.title}</span>
                    <button onClick={() => removeDependency(d.id)} style={S.iconBtn}>✕</button>
                  </div>)}
                </div>
              )}

              {/* Comments */}
              <div>
                <label style={{ ...FIELD_LABEL, display: "block", marginBottom: 8 }}>Comments</label>
                {comments.map(c => (
                  <div key={c.id} style={{ marginBottom: 10, display: "flex", gap: 8 }}>
                    <div style={{ width: 24, height: 24, borderRadius: 12, background: acol(c.author_id) + "30", color: acol(c.author_id), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, flexShrink: 0, marginTop: 2 }}>{ini(c.author_id)}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{uname(c.author_id)}</span>
                        <span style={{ fontSize: 10, color: T.text3 }}>{timeAgo(c.created_at)}</span>
                      </div>
                      <div style={{ fontSize: 13, color: T.text2, lineHeight: 1.4 }}>{c.content}</div>
                    </div>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 12, background: acol(user?.id) + "30", color: acol(user?.id), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, flexShrink: 0 }}>{ini(user?.id)}</div>
                  <input value={newComment} onChange={e => setNewComment(e.target.value)} onKeyDown={e => e.key === "Enter" && addComment()}
                    placeholder="Write a comment…"
                    style={{ flex: 1, padding: "6px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 12, outline: "none" }} />
                  <button onClick={addComment} disabled={!newComment.trim()} style={{ padding: "6px 12px", borderRadius: 6, background: newComment.trim() ? T.accent : T.surface3, color: newComment.trim() ? "#fff" : T.text3, border: "none", fontSize: 12, cursor: "pointer" }}>→</button>
                </div>
              </div>
            </div>
          )}

          {/* ACTIVITY TAB */}
          {activeDetailTab === "activity" && (
            <div>
              {activityLoading ? (
                <div style={{ textAlign: "center", padding: 20, color: T.text3, fontSize: 12 }}>Loading activity…</div>
              ) : activity.length === 0 ? (
                <div style={{ textAlign: "center", padding: 30, color: T.text3 }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>📋</div>
                  <div style={{ fontSize: 12 }}>No activity recorded yet.</div>
                </div>
              ) : activity.map(a => (
                <div key={a.id} style={{ display: "flex", gap: 8, marginBottom: 12, fontSize: 12 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 12, background: acol(a.actor_id) + "30", color: acol(a.actor_id), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, flexShrink: 0 }}>{ini(a.actor_id)}</div>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 600, color: T.text }}>{uname(a.actor_id) || "Someone"}</span>
                    <span style={{ color: T.text3 }}> {a.action}</span>
                    {a.field && <span style={{ color: T.text3 }}> {a.field}</span>}
                    {a.new_value && <span style={{ color: T.text2 }}> → <strong>{a.new_value}</strong></span>}
                    <div style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>{timeAgo(a.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* SUBTASKS TAB */}
          {activeDetailTab === "subtasks" && (
            <div>
              {subs.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ height: 4, borderRadius: 2, background: T.surface3, marginBottom: 8 }}>
                    <div style={{ width: `${pct}%`, height: "100%", borderRadius: 2, background: T.green, transition: "width 0.4s" }} />
                  </div>
                  <div style={{ fontSize: 11, color: T.text3, textAlign: "right" }}>{subs.filter(s => s.status === "done").length}/{subs.length} complete</div>
                </div>
              )}
              {subs.map(sub => (
                <div key={sub.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 6, border: `1px solid ${T.border}`, marginBottom: 6, cursor: "pointer", background: T.surface2 }}
                  onClick={() => setSelectedTask(sub)}>
                  <Checkbox task={sub} size={14} />
                  <span style={{ fontSize: 13, color: sub.status === "done" ? T.text3 : T.text, textDecoration: sub.status === "done" ? "line-through" : "none", flex: 1 }}>{sub.title}</span>
                  {sub.assignee_id && <div style={{ width: 18, height: 18, borderRadius: 9, background: acol(sub.assignee_id) + "30", color: acol(sub.assignee_id), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, fontWeight: 700 }}>{ini(sub.assignee_id)}</div>}
                  {sub.due_date && <span style={{ fontSize: 10, color: isOverdue(sub.due_date) && sub.status !== "done" ? T.red : T.text3 }}>{toDateStr(sub.due_date)}</span>}
                </div>
              ))}
              {addingSubtaskTo === task.id ? (
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  <input autoFocus value={newSubtaskTitle} onChange={e => setNewSubtaskTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") createSubtask(task); if (e.key === "Escape") { setAddingSubtaskTo(null); setNewSubtaskTitle(""); } }}
                    onBlur={() => { if (newSubtaskTitle.trim()) createSubtask(task); else { setAddingSubtaskTo(null); setNewSubtaskTitle(""); } }}
                    placeholder="Subtask name…"
                    style={{ flex: 1, padding: "7px 10px", borderRadius: 6, border: `1px solid ${T.accent}`, background: T.surface2, color: T.text, fontSize: 13, outline: "none" }} />
                </div>
              ) : (
                <button onClick={() => { setAddingSubtaskTo(task.id); setNewSubtaskTitle(""); }}
                  style={{ width: "100%", padding: "8px 0", borderRadius: 6, border: `1px dashed ${T.border}`, background: "transparent", color: T.text3, fontSize: 12, cursor: "pointer", marginTop: 4 }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.color = T.accent; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.text3; }}>
                  + Add subtask
                </button>
              )}
            </div>
          )}

          {/* FILES TAB */}
          {activeDetailTab === "files" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <label style={{ ...FIELD_LABEL }}>Attachments</label>
                <label style={{ fontSize: 11, color: T.accent, cursor: "pointer", padding: "4px 10px", borderRadius: 5, border: `1px solid ${T.accent}40`, background: T.accentDim }}>
                  ↑ Upload
                  <input type="file" hidden onChange={e => e.target.files?.[0] && uploadAttachment(e.target.files[0])} />
                </label>
              </div>
              {attachments.length === 0 ? (
                <div style={{ textAlign: "center", padding: "30px 0", color: T.text3 }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📎</div>
                  <div style={{ fontSize: 12 }}>No files attached yet.</div>
                  <label style={{ fontSize: 12, color: T.accent, cursor: "pointer", display: "block", marginTop: 8 }}>
                    Upload a file
                    <input type="file" hidden onChange={e => e.target.files?.[0] && uploadAttachment(e.target.files[0])} />
                  </label>
                </div>
              ) : attachments.map(att => (
                <div key={att.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 8, border: `1px solid ${T.border}`, marginBottom: 6, background: T.surface2 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.text3} strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <a href={getFileUrl(att.file_path)} target="_blank" rel="noopener" style={{ fontSize: 13, color: T.accent, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{att.filename}</a>
                    <div style={{ fontSize: 10, color: T.text3 }}>{formatFileSize(att.file_size)}</div>
                  </div>
                  <button onClick={() => deleteAttachment(att)} style={{ ...S.iconBtn, color: T.red }}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

    const projectFormModalEl = (() => { if (!showProjectForm) return null; const isNew = showProjectForm === "new"; const colors = ["#3b82f6", "#22c55e", "#ef4444", "#a855f7", "#f97316", "#ec4899", "#06b6d4", "#eab308", "#6366f1", "#6b7280"]; const f = projectForm; const set = (k, v) => setProjectForm(p => ({ ...p, [k]: v })); const toggleMember = (uid) => set("members", f.members.includes(uid) ? f.members.filter(id => id !== uid) : [...f.members, uid]); const lbl = { fontSize: 12, fontWeight: 500, color: T.text3, display: "block", marginBottom: 4 }; const inp = { width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, outline: "none", boxSizing: "border-box" }; const sel = { ...inp, cursor: "pointer" }; const stepNames = ["Details", "Access & Privacy", "People"]; return (
    <div onClick={() => setShowProjectForm(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 520, maxHeight: "85vh", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ padding: "20px 24px 0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: T.text, margin: 0 }}>{isNew ? "New Project" : "Edit Project"}</h3>
            <button onClick={() => setShowProjectForm(false)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 18 }}>×</button>
          </div>
          {/* Step indicator */}
          <div style={{ display: "flex", gap: 0, marginBottom: 16 }}>
            {stepNames.map((s, i) => (<button key={s} onClick={() => setFormStep(i + 1)} style={{ flex: 1, padding: "8px 0", fontSize: 12, fontWeight: formStep === i + 1 ? 600 : 400, color: formStep === i + 1 ? T.accent : T.text3, background: "none", border: "none", borderBottom: formStep === i + 1 ? `2px solid ${T.accent}` : `2px solid ${T.border}`, cursor: "pointer" }}>{i + 1}. {s}</button>))}
          </div>
        </div>
        {/* Body */}
        <div style={{ flex: 1, overflow: "auto", padding: "0 24px 16px" }}>
          {formStep === 1 && <>
            <div style={{ marginBottom: 12 }}><label style={lbl}>Project Name *</label><input value={f.name} onChange={e => set("name", e.target.value)} autoFocus placeholder="e.g. Q2 Marketing Campaign" style={inp} /></div>
            <div style={{ marginBottom: 12 }}><label style={lbl}>Description</label><textarea value={f.description} onChange={e => set("description", e.target.value)} rows={3} placeholder="What is this project about?" style={{ ...inp, resize: "vertical", fontFamily: "inherit" }} /></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div><label style={lbl}>Start Date</label><input type="date" value={f.start_date} onChange={e => set("start_date", e.target.value)} style={inp} /></div>
              <div><label style={lbl}>Target End Date</label><input type="date" value={f.target_end_date} onChange={e => set("target_end_date", e.target.value)} style={inp} /></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div><label style={lbl}>Status</label><select value={f.status} onChange={e => set("status", e.target.value)} style={sel}><option value="active">Active</option><option value="on_hold">On Hold</option><option value="completed">Completed</option><option value="archived">Archived</option></select></div>
              <div><label style={lbl}>Default View</label><select value={f.default_view} onChange={e => set("default_view", e.target.value)} style={sel}><option value="List">List</option><option value="Board">Board</option><option value="Timeline">Timeline</option><option value="Calendar">Calendar</option></select></div>
            </div>
            <div style={{ marginBottom: 12 }}><label style={lbl}>Color</label><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{colors.map(c => <div key={c} onClick={() => set("color", c)} style={{ width: 28, height: 28, borderRadius: 14, background: c, cursor: "pointer", border: f.color === c ? "3px solid #fff" : "3px solid transparent", boxShadow: f.color === c ? `0 0 0 2px ${c}` : "none", transition: "all 0.15s" }} />)}</div></div>
            <div style={{ marginBottom: 12 }}><label style={lbl}>Link to Goal / OKR</label><select value={f.objective_id} onChange={e => set("objective_id", e.target.value)} style={sel}><option value="">None</option>{objectives.map(o => <option key={o.id} value={o.id}>{o.title}</option>)}</select>{f.objective_id && <div style={{ marginTop: 6, padding: "6px 10px", borderRadius: 6, background: T.accentDim, fontSize: 11, color: T.accent }}>Linked to: {objectives.find(o => o.id === f.objective_id)?.title}</div>}</div>
          </>}
          {formStep === 2 && <>
            {/* Visibility */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ ...lbl, marginBottom: 8 }}>Visibility</label>
              {[{ v: "private", l: "Private", d: "Only added members can see this project", icon: "🔒" }, { v: "team", l: "Team", d: "Visible to everyone on the assigned team", icon: "👥" }, { v: "public", l: "Public", d: "Anyone in the organization can search, view, and join", icon: "🌐" }].map(opt => (
                <div key={opt.v} onClick={() => set("visibility", opt.v)} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", borderRadius: 8, border: `1.5px solid ${f.visibility === opt.v ? T.accent : T.border}`, background: f.visibility === opt.v ? T.accentDim : "transparent", marginBottom: 8, cursor: "pointer", transition: "all 0.15s" }}>
                  <span style={{ fontSize: 18, lineHeight: 1 }}>{opt.icon}</span>
                  <div><div style={{ fontSize: 13, fontWeight: 600, color: f.visibility === opt.v ? T.accent : T.text }}>{opt.l}</div><div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>{opt.d}</div></div>
                  <div style={{ marginLeft: "auto", width: 18, height: 18, borderRadius: 9, border: `2px solid ${f.visibility === opt.v ? T.accent : T.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>{f.visibility === opt.v && <div style={{ width: 10, height: 10, borderRadius: 5, background: T.accent }} />}</div>
                </div>))}
            </div>
            {/* Team assignment - show when visibility is team or always as optional */}
            <div style={{ marginBottom: 16 }}><label style={lbl}>Assign to Team</label><select value={f.team_id} onChange={e => set("team_id", e.target.value)} style={sel}><option value="">No team</option>{teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>{teams.length === 0 && <div style={{ fontSize: 11, color: T.text3, marginTop: 4 }}>No teams created yet</div>}</div>
            {/* Join policy */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ ...lbl, marginBottom: 8 }}>Who can join?</label>
              {[{ v: "invite_only", l: "Invite only", d: "Only project admins can add members" }, { v: "request_to_join", l: "Request to join", d: "People can request access, admins approve" }, { v: "open", l: "Open", d: "Anyone can join freely" }].map(opt => (
                <div key={opt.v} onClick={() => set("join_policy", opt.v)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 6, border: `1.5px solid ${f.join_policy === opt.v ? T.accent : T.border}`, background: f.join_policy === opt.v ? T.accentDim : "transparent", marginBottom: 6, cursor: "pointer", transition: "all 0.15s" }}>
                  <div style={{ width: 16, height: 16, borderRadius: 8, border: `2px solid ${f.join_policy === opt.v ? T.accent : T.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{f.join_policy === opt.v && <div style={{ width: 8, height: 8, borderRadius: 4, background: T.accent }} />}</div>
                  <div><div style={{ fontSize: 13, fontWeight: f.join_policy === opt.v ? 600 : 400, color: f.join_policy === opt.v ? T.accent : T.text }}>{opt.l}</div><div style={{ fontSize: 11, color: T.text3 }}>{opt.d}</div></div>
                </div>))}
            </div>
            {f.visibility === "team" && f.team_id && <div style={{ padding: "8px 12px", borderRadius: 6, background: T.surface2, border: `1px solid ${T.border}`, fontSize: 12, color: T.text2 }}>Team members will have access. {f.join_policy === "open" ? "Others in the org can also join." : f.join_policy === "request_to_join" ? "Others can request to join." : "Only invited members outside the team can access."}</div>}
          </>}
          {formStep === 3 && (() => {
            const [mSearch, setMSearch] = [projectForm._mSearch || "", (v) => setProjectForm(p => ({ ...p, _mSearch: v }))];
            const filtProf = allProfiles.filter(u => u.id !== f.owner_id).filter(u => !mSearch || u.display_name?.toLowerCase().includes(mSearch.toLowerCase()) || u.email?.toLowerCase().includes(mSearch.toLowerCase()));
            return <>
            {/* Owner - searchable */}
            <div style={{ marginBottom: 16 }}><label style={lbl}>Project Owner</label><select value={f.owner_id} onChange={e => set("owner_id", e.target.value)} style={sel}><option value="">Unassigned</option>{allProfiles.map(u => <option key={u.id} value={u.id}>{u.display_name || u.email}</option>)}</select></div>
            {/* Add members - searchable */}
            <div style={{ marginBottom: 12 }}><label style={{ ...lbl, marginBottom: 8 }}>Add Members {f.members.length > 0 && <span style={{ color: T.accent, fontWeight: 600 }}>({f.members.length} selected)</span>}</label>
              <div style={{ border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden" }}>
                <div style={{ padding: "6px 10px", borderBottom: `1px solid ${T.border}`, background: T.surface }}>
                  <input value={mSearch} onChange={e => setMSearch(e.target.value)} placeholder="Search people…" style={{ width: "100%", padding: "6px 8px", borderRadius: 5, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 12, outline: "none", boxSizing: "border-box" }} />
                </div>
                <div style={{ maxHeight: 220, overflow: "auto" }}>
                  {filtProf.length === 0 && <div style={{ padding: 12, fontSize: 12, color: T.text3, textAlign: "center" }}>No matches</div>}
                  {filtProf.map(u => { const isSel = f.members.includes(u.id); const c = acol(u.id); return (
                    <div key={u.id} onClick={() => toggleMember(u.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 12px", cursor: "pointer", background: isSel ? T.accentDim : "transparent", borderBottom: `1px solid ${T.border}` }} onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = T.surface2; }} onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = isSel ? T.accentDim : "transparent"; }}>
                      <div style={{ width: 14, height: 14, borderRadius: 3, border: `2px solid ${isSel ? T.accent : T.border}`, background: isSel ? T.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{isSel && <svg width="8" height="8" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" /></svg>}</div>
                      <div style={{ width: 26, height: 26, borderRadius: 13, background: `${c}18`, border: `1.5px solid ${c}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: c, flexShrink: 0 }}>{iniName(u.display_name)}</div>
                      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12, fontWeight: 500, color: T.text }}>{u.display_name || "Unknown"}</div><div style={{ fontSize: 10, color: T.text3 }}>{u.email}</div></div>
                    </div>); })}
                </div>
              </div>
            </div>
            {f.members.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{f.members.map(uid => { const u = allProfiles.find(p => p.id === uid); const c = acol(uid); return (<span key={uid} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px 3px 4px", borderRadius: 12, background: `${c}15`, fontSize: 11, color: T.text2 }}><div style={{ width: 16, height: 16, borderRadius: 8, background: `${c}30`, color: c, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, fontWeight: 700 }}>{iniName(u?.display_name)}</div>{u?.display_name?.split(" ")[0]}<span onClick={() => toggleMember(uid)} style={{ cursor: "pointer", color: T.text3, marginLeft: 2 }}>×</span></span>); })}</div>}
          </>; })()}
        </div>
        {/* Footer */}
        <div style={{ padding: "12px 24px 20px", borderTop: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 11, color: T.text3 }}>Step {formStep} of 3</div>
          <div style={{ display: "flex", gap: 8 }}>
            {formStep > 1 && <button onClick={() => setFormStep(p => p - 1)} style={{ padding: "8px 16px", borderRadius: 6, background: T.surface3, color: T.text2, border: "none", fontSize: 13, cursor: "pointer" }}>Back</button>}
            <button onClick={() => setShowProjectForm(false)} style={{ padding: "8px 16px", borderRadius: 6, background: T.surface3, color: T.text2, border: "none", fontSize: 13, cursor: "pointer" }}>Cancel</button>
            {formStep < 3 ? <button onClick={() => { if (formStep === 1 && !f.name.trim()) return showToast("Project name required"); setFormStep(p => p + 1); }} style={{ padding: "8px 20px", borderRadius: 6, background: T.accent, color: "#fff", border: "none", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>Next</button> : <button onClick={saveProject} style={{ padding: "8px 20px", borderRadius: 6, background: T.accent, color: "#fff", border: "none", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>{isNew ? "Create Project" : "Save Changes"}</button>}
          </div>
        </div>
      </div>
    </div>); })();
  const UpdatesView = () => {
    const HEALTH_COLORS = { on_track: "#22c55e", at_risk: "#eab308", off_track: "#ef4444" };
    const HEALTH_LABELS = { on_track: "On Track", at_risk: "At Risk", off_track: "Off Track" };
    return (
      <div style={{ flex: 1, overflow: "auto", padding: "20px 28px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Project Status Updates</h3>
          <button onClick={() => { setStatusForm({ health: "on_track", summary: "", highlights: "", blockers: "" }); setShowStatusForm(true); }}
            style={{ padding: "7px 14px", borderRadius: 6, background: T.accent, color: "#fff", border: "none", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
            + Post Update
          </button>
        </div>
        {statusUpdates.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: T.text3 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>No status updates yet</div>
            <div style={{ fontSize: 13, marginBottom: 20 }}>Post a weekly update to keep the team informed on progress, wins, and blockers.</div>
            <button onClick={() => { setStatusForm({ health: "on_track", summary: "", highlights: "", blockers: "" }); setShowStatusForm(true); }}
              style={{ padding: "9px 20px", borderRadius: 8, background: T.accent, color: "#fff", border: "none", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
              Post First Update
            </button>
          </div>
        ) : statusUpdates.map(su => {
          const h = su.status || "on_track";
          const color = HEALTH_COLORS[h];
          const dAgo = Math.floor((Date.now() - new Date(su.created_at).getTime()) / 86400000);
          return (
            <div key={su.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "18px 22px", marginBottom: 12, borderLeft: `4px solid ${color}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 12, background: color + "20", color }}>{HEALTH_LABELS[h]}</span>
                <span style={{ fontSize: 12, color: T.text3 }}>{dAgo === 0 ? "Today" : `${dAgo} day${dAgo > 1 ? "s" : ""} ago`}</span>
                <span style={{ fontSize: 12, color: T.text3 }}>· {uname(su.author_id) || "Unknown"}</span>
              </div>
              {su.title && <p style={{ fontSize: 14, color: T.text, lineHeight: 1.6, margin: "0 0 10px" }}>{su.title}</p>}
              {su.body && <p style={{ fontSize: 13, color: T.text2, margin: 0, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{su.body}</p>}
            </div>
          );
        })}
      </div>
    );
  };

  const DocsView = () => {
    const [creatingDoc, setCreatingDoc] = useState(false);
    const [newDocTitle, setNewDocTitle] = useState("");
    const [newDocEmoji, setNewDocEmoji] = useState("📄");
    const [docSearch, setDocSearch] = useState("");
    const [saving, setSaving] = useState(false);

    const projDoc = proj?.linked_doc_id ? docs.find(d => d.id === proj.linked_doc_id) : null;
    // Docs already linked to this project (either via project_id or linked_doc_id)
    const linkedDocs = docs.filter(d => d.project_id === activeProject || d.id === proj?.linked_doc_id);
    const otherDocs = docs.filter(d => d.project_id !== activeProject && d.id !== proj?.linked_doc_id);
    const filteredOther = otherDocs.filter(d => !docSearch || (d.title || "").toLowerCase().includes(docSearch.toLowerCase()));

    const createDoc = async () => {
      if (!newDocTitle.trim()) return;
      setSaving(true);
      const { data, error } = await supabase.from("documents").insert({
        org_id: profile.org_id,
        created_by: user?.id,
        title: newDocTitle.trim(),
        emoji: newDocEmoji,
        project_id: activeProject,
        status: "draft",
        visibility: "team",
        content: [{ id: crypto.randomUUID(), type: "text", content: "" }],
        sort_order: 0,
      }).select().single();
      if (!error && data) {
        setDocs(p => [data, ...p]);
        // Also set as the linked doc if none linked yet
        if (!proj?.linked_doc_id) {
          await supabase.from("projects").update({ linked_doc_id: data.id }).eq("id", activeProject);
          setProjects(p => p.map(pr => pr.id === activeProject ? { ...pr, linked_doc_id: data.id } : pr));
        }
        showToast("Doc created — open it in the Docs module to edit", "success");
      } else {
        showToast("Failed to create doc: " + (error?.message || "unknown error"));
      }
      setNewDocTitle("");
      setNewDocEmoji("📄");
      setCreatingDoc(false);
      setSaving(false);
    };

    const linkDoc = async (docId) => {
      await supabase.from("documents").update({ project_id: activeProject }).eq("id", docId);
      setDocs(p => p.map(d => d.id === docId ? { ...d, project_id: activeProject } : d));
      if (!proj?.linked_doc_id) {
        await supabase.from("projects").update({ linked_doc_id: docId }).eq("id", activeProject);
        setProjects(p => p.map(pr => pr.id === activeProject ? { ...pr, linked_doc_id: docId } : pr));
      }
      showToast("Doc linked to project", "success");
    };

    const setPrimary = async (docId) => {
      await supabase.from("projects").update({ linked_doc_id: docId }).eq("id", activeProject);
      setProjects(p => p.map(pr => pr.id === activeProject ? { ...pr, linked_doc_id: docId } : pr));
    };

    const unlinkDoc = async (docId) => {
      await supabase.from("documents").update({ project_id: null }).eq("id", docId);
      setDocs(p => p.map(d => d.id === docId ? { ...d, project_id: null } : d));
      if (proj?.linked_doc_id === docId) {
        await supabase.from("projects").update({ linked_doc_id: null }).eq("id", activeProject);
        setProjects(p => p.map(pr => pr.id === activeProject ? { ...pr, linked_doc_id: null } : pr));
      }
      showToast("Doc unlinked", "success");
    };

    const DOC_EMOJIS = ["📄","📝","📋","📊","📈","🎯","💡","🔬","📣","⚙️","🧪","🗂️","📐","💬","📌"];
    const fmtDate = (d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

    return (
      <div style={{ flex: 1, overflow: "auto", padding: "24px 32px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Project Docs</h3>
            <p style={{ fontSize: 13, color: T.text3, margin: "4px 0 0" }}>Briefs, specs, and notes linked to <strong style={{ color: T.text }}>{proj?.name}</strong></p>
          </div>
          <button onClick={() => setCreatingDoc(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 8, background: T.accent, color: "#fff", border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
            New Doc
          </button>
        </div>

        {/* Create new doc form */}
        {creatingDoc && (
          <div style={{ background: T.surface, border: `1px solid ${T.accent}40`, borderRadius: 12, padding: "18px 20px", marginBottom: 24, boxShadow: "0 4px 20px rgba(0,0,0,0.12)" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 14 }}>New Doc</div>
            <div style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "center" }}>
              <div style={{ position: "relative" }}>
                <div style={{ fontSize: 24, cursor: "pointer", padding: "6px 8px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface2, lineHeight: 1 }}>{newDocEmoji}</div>
              </div>
              <input autoFocus value={newDocTitle} onChange={e => setNewDocTitle(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") createDoc(); if (e.key === "Escape") setCreatingDoc(false); }}
                placeholder="Doc title…"
                style={{ flex: 1, padding: "9px 12px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 14, fontWeight: 600, outline: "none" }} />
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
              {DOC_EMOJIS.map(e => (
                <button key={e} onClick={() => setNewDocEmoji(e)} style={{ fontSize: 16, padding: "4px 6px", borderRadius: 6, border: `1.5px solid ${newDocEmoji === e ? T.accent : "transparent"}`, background: newDocEmoji === e ? T.accentDim : T.surface2, cursor: "pointer" }}>{e}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setCreatingDoc(false)} style={{ padding: "7px 14px", borderRadius: 7, background: T.surface3, color: T.text2, border: "none", fontSize: 13, cursor: "pointer" }}>Cancel</button>
              <button onClick={createDoc} disabled={!newDocTitle.trim() || saving} style={{ padding: "7px 16px", borderRadius: 7, background: newDocTitle.trim() ? T.accent : T.surface3, color: newDocTitle.trim() ? "#fff" : T.text3, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{saving ? "Creating…" : "Create Doc"}</button>
            </div>
          </div>
        )}

        {/* Project docs */}
        {linkedDocs.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>This Project's Docs ({linkedDocs.length})</div>
            {linkedDocs.map(d => {
              const isPrimary = proj?.linked_doc_id === d.id;
              return (
                <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", background: T.surface, border: `1px solid ${isPrimary ? T.accent + "60" : T.border}`, borderRadius: 10, marginBottom: 8, transition: "border 0.15s" }}
                  onMouseEnter={e => !isPrimary && (e.currentTarget.style.borderColor = T.border)}
                  onMouseLeave={e => !isPrimary && (e.currentTarget.style.borderColor = T.border)}>
                  <span style={{ fontSize: 24, flexShrink: 0 }}>{d.emoji || "📄"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.title || "Untitled"}</span>
                      {isPrimary && <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 8, background: T.accentDim, color: T.accent, fontWeight: 700, flexShrink: 0 }}>PRIMARY</span>}
                    </div>
                    <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>Updated {fmtDate(d.updated_at)}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    {!isPrimary && (
                      <button onClick={() => setPrimary(d.id)} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: "none", color: T.text3, fontSize: 11, cursor: "pointer" }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.color = T.accent; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.text3; }}>
                        Set Primary
                      </button>
                    )}
                    <button onClick={() => unlinkDoc(d.id)} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: "none", color: T.text3, fontSize: 11, cursor: "pointer" }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = "#ef4444"; e.currentTarget.style.color = "#ef4444"; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.text3; }}>
                      Unlink
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Link existing docs */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.8 }}>All Org Docs</div>
            <div style={{ position: "relative" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.text3} strokeWidth="2" style={{ position: "absolute", left: 8, top: 7 }}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input value={docSearch} onChange={e => setDocSearch(e.target.value)} placeholder="Search docs…"
                style={{ padding: "5px 8px 5px 26px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 12, outline: "none", width: 200 }} />
            </div>
          </div>
          {filteredOther.length === 0 ? (
            <div style={{ textAlign: "center", padding: "30px 0", color: T.text3 }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>📂</div>
              <div style={{ fontSize: 13 }}>{docSearch ? "No docs match your search" : "No other docs — create a new one above"}</div>
            </div>
          ) : filteredOther.map(d => (
            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 18 }}>{d.emoji || "📄"}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.title || "Untitled"}</div>
                <div style={{ fontSize: 11, color: T.text3 }}>Updated {fmtDate(d.updated_at)}</div>
              </div>
              <button onClick={() => linkDoc(d.id)} style={{ padding: "4px 12px", borderRadius: 6, border: `1px solid ${T.accent}40`, background: T.accentDim, color: T.accent, fontSize: 11, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
                + Link
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Templates modal
  const TemplatesModal = () => {
    if (!showTemplates) return null;
    return (
      <div onClick={() => setShowTemplates(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div onClick={e => e.stopPropagation()} style={{ width: 640, maxHeight: "80vh", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, boxShadow: "0 24px 80px rgba(0,0,0,0.35)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Start from Template</h3>
              <button onClick={() => setShowTemplates(false)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 20 }}>×</button>
            </div>
            <p style={{ fontSize: 13, color: T.text3, margin: "6px 0 0" }}>Choose a template to pre-populate your project with sections and tasks.</p>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {templates.map(t => (
                <div key={t.id} onClick={() => createProjectFromTemplate(t)}
                  style={{ padding: "16px 18px", background: T.surface2, border: `1.5px solid ${T.border}`, borderRadius: 12, cursor: "pointer", transition: "all 0.15s" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = t.color || T.accent; e.currentTarget.style.background = (t.color || T.accent) + "10"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = T.surface2; }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <span style={{ fontSize: 24 }}>{t.icon || "📋"}</span>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{t.name}</div>
                      <div style={{ fontSize: 11, color: T.text3 }}>{t.description}</div>
                    </div>
                  </div>
                  {t.sections && t.sections.length > 0 && (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {t.sections.map((s, i) => (
                        <span key={i} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 8, background: (t.color || T.accent) + "15", color: t.color || T.accent, fontWeight: 600 }}>
                          {s.name} ({s.tasks?.length || 0})
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div onClick={() => { setShowTemplates(false); openNewProject(); }} style={{ marginTop: 16, padding: "14px 18px", border: `1.5px dashed ${T.border}`, borderRadius: 12, cursor: "pointer", textAlign: "center", color: T.text3, fontSize: 13, fontWeight: 500 }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.color = T.accent; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.text3; }}>
              + Start with blank project
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Copy project modal
  const SaveAsTemplateModal = () => {
    if (!savingAsTemplate) return null;
    const secCount = sections.filter(s => s.project_id === savingAsTemplate.id).length;
    const taskCount = tasks.filter(t => t.project_id === savingAsTemplate.id && !t.parent_task_id).length;
    return (
      <div onClick={() => setSavingAsTemplate(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div onClick={e => e.stopPropagation()} style={{ width: 400, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: (savingAsTemplate.color || T.accent) + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>📋</div>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Save as Template</h3>
              <div style={{ fontSize: 12, color: T.text3, marginTop: 2 }}>{savingAsTemplate.name}</div>
            </div>
          </div>
          <div style={{ padding: "12px 14px", background: T.surface2, borderRadius: 10, marginBottom: 18, fontSize: 13, color: T.text2, lineHeight: 1.5 }}>
            This will save <strong style={{ color: T.text }}>{secCount} section{secCount !== 1 ? "s" : ""}</strong> and <strong style={{ color: T.text }}>{taskCount} task{taskCount !== 1 ? "s" : ""}</strong> as a reusable template. Task titles will be kept but assignees, due dates, and progress will be cleared.
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => setSavingAsTemplate(null)} style={{ padding: "9px 18px", borderRadius: 8, background: T.surface3, color: T.text2, border: "none", fontSize: 13, cursor: "pointer" }}>Cancel</button>
            <button onClick={() => saveAsTemplate(savingAsTemplate)} style={{ padding: "9px 18px", borderRadius: 8, background: T.accent, color: "#fff", border: "none", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>Save Template</button>
          </div>
        </div>
      </div>
    );
  };

  const CopyModal = () => {
    if (!copyingProject) return null;
    return (
      <div onClick={() => setCopyingProject(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div onClick={e => e.stopPropagation()} style={{ width: 380, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 10px" }}>Copy "{copyingProject.name}"</h3>
          <p style={{ fontSize: 13, color: T.text3, margin: "0 0 20px", lineHeight: 1.5 }}>
            This will create a new project with all the same sections and tasks (reset to "To Do" status). Assignees and due dates will not be copied.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => setCopyingProject(null)} style={{ padding: "9px 18px", borderRadius: 8, background: T.surface3, color: T.text2, border: "none", fontSize: 13, cursor: "pointer" }}>Cancel</button>
            <button onClick={() => copyProject(copyingProject)} style={{ padding: "9px 18px", borderRadius: 8, background: T.accent, color: "#fff", border: "none", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>Copy Project</button>
          </div>
        </div>
      </div>
    );
  };

  // Status form modal
  const StatusFormModal = () => {
    if (!showStatusForm) return null;
    const HEALTH_OPTS = [{ k: "on_track", l: "On Track", color: "#22c55e" }, { k: "at_risk", l: "At Risk", color: "#eab308" }, { k: "off_track", l: "Off Track", color: "#ef4444" }];
    return (
      <div onClick={() => setShowStatusForm(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div onClick={e => e.stopPropagation()} style={{ width: 500, maxHeight: "80vh", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "18px 24px", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Post Status Update</h3>
              <button onClick={() => setShowStatusForm(false)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 18 }}>×</button>
            </div>
            <div style={{ fontSize: 12, color: T.text3, marginTop: 4 }}>{proj?.name}</div>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>
            {/* Health */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.text2, display: "block", marginBottom: 8 }}>Overall Health</label>
              <div style={{ display: "flex", gap: 6 }}>
                {HEALTH_OPTS.map(h => (
                  <button key={h.k} onClick={() => setStatusForm(p => ({ ...p, health: h.k }))}
                    style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: `1.5px solid ${statusForm.health === h.k ? h.color : T.border}`, background: statusForm.health === h.k ? h.color + "20" : "transparent", color: statusForm.health === h.k ? h.color : T.text3, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                    {h.l}
                  </button>
                ))}
              </div>
            </div>
            {/* Summary */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.text2, display: "block", marginBottom: 6 }}>Summary *</label>
              <textarea value={statusForm.summary} onChange={e => setStatusForm(p => ({ ...p, summary: e.target.value }))}
                placeholder="How is the project going overall? What's the current state?"
                rows={3} autoFocus style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, resize: "vertical", outline: "none", fontFamily: "inherit", lineHeight: 1.5, boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.text2, display: "block", marginBottom: 6 }}>Highlights <span style={{ color: T.text3, fontWeight: 400 }}>(optional)</span></label>
              <textarea value={statusForm.highlights} onChange={e => setStatusForm(p => ({ ...p, highlights: e.target.value }))}
                placeholder="Wins, completions, milestones hit…"
                rows={2} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, resize: "vertical", outline: "none", fontFamily: "inherit", lineHeight: 1.5, boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.text2, display: "block", marginBottom: 6 }}>Blockers <span style={{ color: T.text3, fontWeight: 400 }}>(optional)</span></label>
              <textarea value={statusForm.blockers} onChange={e => setStatusForm(p => ({ ...p, blockers: e.target.value }))}
                placeholder="What's slowing you down? What do you need?"
                rows={2} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, resize: "vertical", outline: "none", fontFamily: "inherit", lineHeight: 1.5, boxSizing: "border-box" }} />
            </div>
          </div>
          <div style={{ padding: "14px 24px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => setShowStatusForm(false)} style={{ padding: "9px 18px", borderRadius: 8, background: T.surface3, color: T.text2, border: "none", fontSize: 13, cursor: "pointer" }}>Cancel</button>
            <button onClick={saveStatusUpdate} disabled={!statusForm.summary.trim()}
              style={{ padding: "9px 18px", borderRadius: 8, background: statusForm.summary.trim() ? T.accent : T.surface3, color: statusForm.summary.trim() ? "#fff" : T.text3, border: "none", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
              Post Update
            </button>
          </div>
        </div>
      </div>
    );
  };

  // MAIN RENDER
  return (
    <div onClick={() => ctxProject && setCtxProject(null)} style={{ display: "flex", height: "100%", background: T.bg, overflow: "hidden" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes slideIn{from{transform:translateX(20px);opacity:0}to{transform:translateX(0);opacity:1}}`}</style>
      {toast && <div style={{ position: "fixed", top: 16, right: 16, zIndex: 200, padding: "10px 16px", borderRadius: 8, background: toast.type === "success" ? T.greenDim : T.redDim, color: toast.type === "success" ? T.green : T.red, fontSize: 13, fontWeight: 500, boxShadow: "0 4px 16px rgba(0,0,0,0.2)", animation: "slideIn 0.2s ease" }}>{toast.msg}</div>}

      {/* Section context menu */}
      {sectionCtxMenu && (() => {
        const sec = projSections.find(s => s.id === sectionCtxMenu.secId);
        if (!sec) return null;
        return (
          <div onClick={() => setSectionCtxMenu(null)} style={{ position: "fixed", inset: 0, zIndex: 300 }}>
            <div onClick={e => e.stopPropagation()} style={{ position: "fixed", left: Math.min(sectionCtxMenu.x, window.innerWidth - 220), top: Math.min(sectionCtxMenu.y, window.innerHeight - 280), width: 210, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, boxShadow: "0 12px 40px rgba(0,0,0,0.4)", padding: 6, zIndex: 301 }}>
              <div style={{ padding: "6px 10px 4px", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.8 }}>{sec.name}</div>

              {/* WIP limit */}
              <div style={{ padding: "8px 10px", borderBottom: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 11, color: T.text2, fontWeight: 600, marginBottom: 6 }}>WIP Limit</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input type="number" placeholder="None" defaultValue={sec.wip_limit || ""} min="0"
                    onChange={e => setWipLimitInput(e.target.value)}
                    style={{ flex: 1, padding: "4px 8px", borderRadius: 5, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 12, outline: "none" }} />
                  <button onClick={async () => {
                    const val = wipLimitInput === "" ? null : parseInt(wipLimitInput, 10) || null;
                    await supabase.from("sections").update({ wip_limit: val }).eq("id", sec.id);
                    setProjSections(p => p.map(s => s.id === sec.id ? { ...s, wip_limit: val } : s));
                    setSectionCtxMenu(null);
                  }} style={{ padding: "4px 10px", borderRadius: 5, background: T.accent, color: "#fff", border: "none", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>Set</button>
                </div>
                {sec.wip_limit && <button onClick={async () => {
                  await supabase.from("sections").update({ wip_limit: null }).eq("id", sec.id);
                  setProjSections(p => p.map(s => s.id === sec.id ? { ...s, wip_limit: null } : s));
                  setSectionCtxMenu(null);
                }} style={{ fontSize: 10, color: T.text3, background: "none", border: "none", cursor: "pointer", marginTop: 4 }}>Clear limit</button>}
              </div>

              {/* Toggle done column */}
              {[
                { label: sec.is_complete_column ? "✓ Mark as NOT done column" : "Mark as done column", action: async () => {
                  const val = !sec.is_complete_column;
                  await supabase.from("sections").update({ is_complete_column: val }).eq("id", sec.id);
                  setProjSections(p => p.map(s => s.id === sec.id ? { ...s, is_complete_column: val } : s));
                  setSectionCtxMenu(null);
                }},
                { label: "Collapse all sections", action: () => {
                  const all = {};
                  projSections.forEach(s => { all[s.id] = true; });
                  setCollapsed(all);
                  setSectionCtxMenu(null);
                }},
                { label: "Expand all sections", action: () => {
                  setCollapsed({});
                  setSectionCtxMenu(null);
                }},
                { label: "Delete section", action: () => { deleteSection(sec.id); setSectionCtxMenu(null); }, danger: true },
              ].map((item, i) => (
                <div key={i} onClick={item.action}
                  style={{ padding: "8px 10px", fontSize: 12, color: item.danger ? T.red : T.text2, borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}
                  onMouseEnter={e => e.currentTarget.style.background = T.surface3}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  {item.label}
                </div>
              ))}
            </div>
          </div>
        );
      })()}
      <ProjectSidebar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {showMyTasks ? <MyTasksView /> : proj ? (<>
          <ProjectHeader />
          <FilterBar />
          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {viewMode === "List" && <ListView />}
              {viewMode === "Board" && <BoardView />}
              {viewMode === "Timeline" && <TimelineView />}
              {viewMode === "Calendar" && <CalendarView />}
              {viewMode === "Updates" && <UpdatesView />}
              {viewMode === "Docs" && <DocsView />}
            </div>
            <DetailPane />
          </div>
        </>) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: T.text3 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 14, marginBottom: 4 }}>No project selected</div>
              <div style={{ fontSize: 12 }}>Select a project or create a new one</div>
              <button onClick={openNewProject} style={{ marginTop: 12, padding: "8px 16px", borderRadius: 6, background: T.accent, color: "#fff", border: "none", fontSize: 13, cursor: "pointer" }}>+ New Project</button>
            </div>
          </div>
        )}
      </div>
      {projectFormModalEl}
      <TemplatesModal />
      <SaveAsTemplateModal />
      <CopyModal />
      <StatusFormModal />
    </div>
  );
}

function Dropdown({ children, onClose, wide }) {
  const ref = useRef(null);
  useEffect(() => { const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); }; document.addEventListener("mousedown", fn); return () => document.removeEventListener("mousedown", fn); }, [onClose]);
  return (<div ref={ref} style={{ position: "absolute", top: "100%", left: 0, zIndex: 50, marginTop: 4, minWidth: wide ? 180 : 130, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.25)", padding: 4, animation: "slideIn 0.15s ease" }}>{children}</div>);
}

function DropdownItem({ children, onClick }) {
  return (<div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 4, fontSize: 12, color: T.text, cursor: "pointer", transition: "background 0.1s" }} onMouseEnter={e => e.currentTarget.style.background = T.surface2} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>{children}</div>);
}
