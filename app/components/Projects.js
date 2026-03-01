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
  const [milestones, setMilestones] = useState([]);
  const [showMilestoneForm, setShowMilestoneForm] = useState(false);
  const [milestoneForm, setMilestoneForm] = useState({ name: "", target_date: "", description: "" });
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [assigneeSearch, setAssigneeSearch] = useState("");
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [dependencies, setDependencies] = useState([]); // { id, predecessor_id, successor_id }
  const [attachments, setAttachments] = useState([]);
  const [tableSort, setTableSort] = useState({ col: "title", dir: "asc" });
  const [myTasks, setMyTasks] = useState([]);
  const [myTasksProjects, setMyTasksProjects] = useState({});
  const [dragTask, setDragTask] = useState(null);
  const [dragOverTarget, setDragOverTarget] = useState(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState(new Set());
  const [customFields, setCustomFields] = useState([]);
  const [customFieldValues, setCustomFieldValues] = useState({}); // { taskId: { fieldId: value } }
  const [showFieldForm, setShowFieldForm] = useState(false);
  const [fieldForm, setFieldForm] = useState({ name: "", field_type: "text", options: "" });

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

  /* ── Load comments + attachments for selected task ── */
  useEffect(() => {
    if (!selectedTask) { setComments([]); setNewComment(""); setAttachments([]); return; }
    (async () => {
      const [{ data: c }, { data: a }] = await Promise.all([
        supabase.from("comments").select("*").eq("entity_type", "task").eq("entity_id", selectedTask.id).is("deleted_at", null).order("created_at", { ascending: true }),
        supabase.from("attachments").select("*").eq("entity_type", "task").eq("entity_id", selectedTask.id).order("created_at", { ascending: false }),
      ]);
      setComments(c || []); setAttachments(a || []);
    })();
  }, [selectedTask?.id]);

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
    if (activeProject === "__my_tasks__") {
      (async () => {
        // Load all non-deleted tasks across all projects, with their project info
        const { data: allTasks } = await supabase.from("tasks").select("*").is("deleted_at", null).is("parent_task_id", null).order("due_date", { ascending: true, nullsFirst: false });
        setMyTasks(allTasks || []);
        // Build project lookup from projects we already have
        const projMap = {};
        projects.forEach(p => { projMap[p.id] = p; });
        setMyTasksProjects(projMap);
        setSelectedTask(null);
      })();
      return;
    }
    (async () => {
      const [{ data: s }, { data: t }, { data: m }] = await Promise.all([
        supabase.from("sections").select("*").eq("project_id", activeProject).order("sort_order"),
        supabase.from("tasks").select("*").eq("project_id", activeProject).is("deleted_at", null).order("sort_order"),
        supabase.from("milestones").select("*").eq("project_id", activeProject).order("sort_order"),
      ]);
      setSections(s || []); setTasks(t || []); setMilestones(m || []);
      // Load dependencies for all project tasks
      const taskIds = (t || []).map(x => x.id);
      if (taskIds.length > 0) {
        const { data: deps } = await supabase.from("task_dependencies").select("*").or(`predecessor_id.in.(${taskIds.join(",")}),successor_id.in.(${taskIds.join(",")})`);
        setDependencies(deps || []);
      } else { setDependencies([]); }
      // Load custom fields
      const { data: cf } = await supabase.from("custom_fields").select("*").eq("project_id", activeProject).order("sort_order");
      setCustomFields(cf || []);
      if (cf?.length > 0 && taskIds.length > 0) {
        const { data: cfv } = await supabase.from("custom_field_values").select("*").in("task_id", taskIds);
        const map = {};
        (cfv || []).forEach(v => { if (!map[v.task_id]) map[v.task_id] = {}; map[v.task_id][v.field_id] = v.value; });
        setCustomFieldValues(map);
      } else { setCustomFieldValues({}); }
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

  const duplicateTask = async (task) => {
    const maxSort = tasks.filter(t => t.section_id === task.section_id && !t.parent_task_id).reduce((m, t) => Math.max(m, t.sort_order || 0), 0);
    const { data, error } = await supabase.from("tasks").insert({
      org_id: proj?.org_id, project_id: activeProject, section_id: task.section_id,
      title: task.title + " (copy)", description: task.description,
      status: "todo", priority: task.priority, assignee_id: task.assignee_id,
      due_date: task.due_date, start_date: task.start_date,
      milestone_id: task.milestone_id, sort_order: maxSort + 1,
    }).select().single();
    if (error) { showToast("Failed to duplicate task"); return; }
    if (data) { setTasks(p => [...p, data]); showToast("Task duplicated", "success"); setSelectedTask(data); }
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

  const createSubtask = async (parentTask) => {
    const title = prompt("Subtask name:");
    if (!title?.trim()) return;
    const maxSort = tasks.filter(t => t.parent_task_id === parentTask.id).reduce((m, t) => Math.max(m, t.sort_order || 0), 0);
    const { data, error } = await supabase.from("tasks").insert({
      org_id: proj.org_id, project_id: activeProject, section_id: parentTask.section_id, parent_task_id: parentTask.id,
      title: title.trim(), status: "todo", priority: "none", sort_order: maxSort + 1,
    }).select().single();
    if (error) { showToast("Failed to create subtask"); return; }
    if (data) {
      setTasks(p => [...p, data]);
      setExpandedTasks(p => ({ ...p, [parentTask.id]: true }));
      showToast("Subtask created", "success");
    }
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

  /* ── Milestone mutations ── */
  const MILESTONE_STATUS = {
    upcoming: { label: "Upcoming", color: "#8b93a8", bg: "#1c2030" },
    in_progress: { label: "In Progress", color: "#3b82f6", bg: "#1d3a6a" },
    completed: { label: "Completed", color: "#22c55e", bg: "#0d3a20" },
    missed: { label: "Missed", color: "#ef4444", bg: "#3d1111" },
  };

  const createMilestone = async () => {
    if (!milestoneForm.name.trim()) return;
    const maxSort = milestones.reduce((m, ms) => Math.max(m, ms.sort_order || 0), 0);
    const { data, error } = await supabase.from("milestones").insert({
      project_id: activeProject, name: milestoneForm.name.trim(),
      description: milestoneForm.description.trim() || null,
      target_date: milestoneForm.target_date || null, status: "upcoming",
      sort_order: maxSort + 1,
    }).select().single();
    if (error) { showToast("Failed to create milestone"); return; }
    if (data) { setMilestones(p => [...p, data]); showToast("Milestone created", "success"); }
    setShowMilestoneForm(false); setMilestoneForm({ name: "", target_date: "", description: "" });
  };

  const deleteMilestone = async (msId) => {
    if (!confirm("Delete this milestone?")) return;
    setMilestones(p => p.filter(m => m.id !== msId));
    // Unlink tasks from milestone
    await supabase.from("tasks").update({ milestone_id: null }).eq("milestone_id", msId);
    const { error } = await supabase.from("milestones").delete().eq("id", msId);
    if (error) showToast("Failed to delete milestone");
  };

  const updateMilestoneStatus = async (msId, status) => {
    setMilestones(p => p.map(m => m.id === msId ? { ...m, status } : m));
    await supabase.from("milestones").update({ status }).eq("id", msId);
  };

  /* ── Comment mutations ── */
  const addComment = async () => {
    if (!newComment.trim() || !selectedTask) return;
    const { data, error } = await supabase.from("comments").insert({
      org_id: proj.org_id, entity_type: "task", entity_id: selectedTask.id,
      content: newComment.trim(),
    }).select().single();
    if (error) { showToast("Failed to post comment"); return; }
    if (data) setComments(p => [...p, data]);
    setNewComment("");
  };

  const deleteComment = async (commentId) => {
    setComments(p => p.filter(c => c.id !== commentId));
    const { error } = await supabase.from("comments").update({ deleted_at: new Date().toISOString() }).eq("id", commentId);
    if (error) showToast("Failed to delete comment");
  };

  /* ── Attachment mutations ── */
  const uploadAttachment = async (file) => {
    if (!file || !selectedTask) return;
    const path = `tasks/${selectedTask.id}/${Date.now()}_${file.name}`;
    const { error: uploadErr } = await supabase.storage.from("attachments").upload(path, file);
    if (uploadErr) { showToast("Failed to upload file"); return; }
    const { data: { publicUrl } } = supabase.storage.from("attachments").getPublicUrl(path);
    const { data, error } = await supabase.from("attachments").insert({
      org_id: proj.org_id, entity_type: "task", entity_id: selectedTask.id,
      filename: file.name, file_path: path, file_size: file.size, mime_type: file.type,
    }).select().single();
    if (error) { showToast("Failed to save attachment record"); return; }
    if (data) { setAttachments(p => [data, ...p]); showToast("File attached", "success"); }
  };

  const deleteAttachment = async (att) => {
    setAttachments(p => p.filter(a => a.id !== att.id));
    await supabase.storage.from("attachments").remove([att.file_path]);
    const { error } = await supabase.from("attachments").delete().eq("id", att.id);
    if (error) showToast("Failed to delete attachment");
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const fileIcon = (mime) => {
    if (mime?.startsWith("image/")) return "🖼️";
    if (mime?.includes("pdf")) return "📄";
    if (mime?.includes("spreadsheet") || mime?.includes("excel")) return "📊";
    if (mime?.includes("document") || mime?.includes("word")) return "📝";
    if (mime?.includes("video")) return "🎬";
    if (mime?.includes("audio")) return "🎵";
    return "📎";
  };

  /* ── Dependency mutations ── */
  const getBlockedBy = (taskId) => dependencies.filter(d => d.successor_id === taskId).map(d => ({ ...d, task: tasks.find(t => t.id === d.predecessor_id) })).filter(d => d.task);
  const getBlocking = (taskId) => dependencies.filter(d => d.predecessor_id === taskId).map(d => ({ ...d, task: tasks.find(t => t.id === d.successor_id) })).filter(d => d.task);

  const addDependency = async (predecessorId, successorId) => {
    if (predecessorId === successorId) return;
    if (dependencies.some(d => d.predecessor_id === predecessorId && d.successor_id === successorId)) return;
    const { data, error } = await supabase.from("task_dependencies").insert({
      predecessor_id: predecessorId, successor_id: successorId, dependency_type: "finish_to_start",
    }).select().single();
    if (error) { showToast("Failed to add dependency"); return; }
    if (data) { setDependencies(p => [...p, data]); showToast("Dependency added", "success"); }
  };

  const removeDependency = async (depId) => {
    setDependencies(p => p.filter(d => d.id !== depId));
    const { error } = await supabase.from("task_dependencies").delete().eq("id", depId);
    if (error) showToast("Failed to remove dependency");
  };

  const getFileUrl = (path) => `https://upbjdmnykheubxkuknuj.supabase.co/storage/v1/object/public/attachments/${path}`;

  /* ── Custom field mutations ── */
  const createCustomField = async () => {
    if (!fieldForm.name.trim()) return;
    const maxSort = customFields.reduce((m, f) => Math.max(m, f.sort_order || 0), 0);
    const opts = fieldForm.field_type === "select" && fieldForm.options.trim()
      ? fieldForm.options.split(",").map(s => s.trim()).filter(Boolean) : null;
    const { data, error } = await supabase.from("custom_fields").insert({
      project_id: activeProject, name: fieldForm.name.trim(),
      field_type: fieldForm.field_type, options: opts, sort_order: maxSort + 1,
    }).select().single();
    if (error) { showToast("Failed to create field"); return; }
    if (data) { setCustomFields(p => [...p, data]); showToast("Custom field added", "success"); }
    setShowFieldForm(false); setFieldForm({ name: "", field_type: "text", options: "" });
  };

  const deleteCustomField = async (fieldId) => {
    if (!confirm("Delete this custom field and all its values?")) return;
    setCustomFields(p => p.filter(f => f.id !== fieldId));
    await supabase.from("custom_field_values").delete().eq("field_id", fieldId);
    await supabase.from("custom_fields").delete().eq("id", fieldId);
  };

  const setCustomFieldValue = async (taskId, fieldId, value) => {
    setCustomFieldValues(p => ({ ...p, [taskId]: { ...(p[taskId] || {}), [fieldId]: value } }));
    const { error } = await supabase.from("custom_field_values").upsert({
      task_id: taskId, field_id: fieldId, value: value || null,
    }, { onConflict: "task_id,field_id" });
    if (error) showToast("Failed to save field value");
  };

  /* ── Drag & Drop reorder ── */
  const handleDrop = async (targetTaskId, targetSectionId) => {
    if (!dragTask) return;
    const sourceId = dragTask.id;
    if (sourceId === targetTaskId) { setDragTask(null); setDragOverTarget(null); return; }
    // Get ordered tasks in target section
    const secTasks = tasks.filter(t => t.section_id === targetSectionId && !t.parent_task_id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    // Remove source from its current position
    const without = secTasks.filter(t => t.id !== sourceId);
    // Find target index
    const targetIdx = targetTaskId ? without.findIndex(t => t.id === targetTaskId) : without.length;
    // Insert at target position
    without.splice(targetIdx >= 0 ? targetIdx : without.length, 0, { ...dragTask, section_id: targetSectionId });
    // Update sort orders
    const updates = without.map((t, i) => ({ id: t.id, sort_order: i + 1, section_id: targetSectionId }));
    setTasks(prev => {
      let next = prev.map(t => {
        const upd = updates.find(u => u.id === t.id);
        return upd ? { ...t, sort_order: upd.sort_order, section_id: upd.section_id } : t;
      });
      // Also update the dragged task's section if moved
      if (dragTask.section_id !== targetSectionId) {
        next = next.map(t => t.id === sourceId ? { ...t, section_id: targetSectionId } : t);
      }
      return next;
    });
    // Persist to DB
    for (const u of updates) {
      await supabase.from("tasks").update({ sort_order: u.sort_order, section_id: u.section_id }).eq("id", u.id);
    }
    setDragTask(null); setDragOverTarget(null);
  };

  /* ── Bulk actions ── */
  const toggleSelectTask = (taskId, e) => {
    e.stopPropagation();
    setSelectedTaskIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
      return next;
    });
  };
  const selectAllInSection = (sectionId) => {
    const ids = tasks.filter(t => t.section_id === sectionId && !t.parent_task_id).map(t => t.id);
    setSelectedTaskIds(new Set(ids));
  };
  const clearSelection = () => setSelectedTaskIds(new Set());
  const bulkUpdateStatus = async (status) => {
    const ids = [...selectedTaskIds];
    setTasks(p => p.map(t => ids.includes(t.id) ? { ...t, status } : t));
    for (const id of ids) await supabase.from("tasks").update({ status }).eq("id", id);
    showToast(`${ids.length} tasks updated`, "success"); clearSelection();
  };
  const bulkUpdateAssignee = async (assigneeId) => {
    const ids = [...selectedTaskIds];
    setTasks(p => p.map(t => ids.includes(t.id) ? { ...t, assignee_id: assigneeId } : t));
    for (const id of ids) await supabase.from("tasks").update({ assignee_id: assigneeId }).eq("id", id);
    showToast(`${ids.length} tasks assigned`, "success"); clearSelection();
  };
  const bulkDelete = async () => {
    if (!confirm(`Delete ${selectedTaskIds.size} tasks?`)) return;
    const ids = [...selectedTaskIds];
    setTasks(p => p.filter(t => !ids.includes(t.id)));
    for (const id of ids) await supabase.from("tasks").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    showToast(`${ids.length} tasks deleted`, "success"); clearSelection();
    if (selectedTask && ids.includes(selectedTask.id)) setSelectedTask(null);
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
    const filteredProfiles = Object.values(profiles)
      .filter(p => !assigneeSearch || (p.display_name || "").toLowerCase().includes(assigneeSearch.toLowerCase()))
      .sort((a, b) => (a.display_name || "").localeCompare(b.display_name || ""));
    return (
      <div style={{ position: "relative" }}>
        <div onClick={(e) => { e.stopPropagation(); setEditingCell(editing ? null : { taskId: task.id, field: "assignee" }); setAssigneeSearch(""); }}
          style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", padding: "2px 4px", borderRadius: 4, border: editing ? `1px solid ${T.accent}` : "1px solid transparent" }}>
          <Ava uid={task.assignee_id} sz={22} />
          <span style={{ fontSize: 12, color: task.assignee_id ? T.text2 : T.text3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {task.assignee_id ? uname(task.assignee_id) : "—"}
          </span>
        </div>
        {editing && (
          <Dropdown onClose={() => { setEditingCell(null); setAssigneeSearch(""); }} wide>
            <div style={{ padding: "4px 8px", borderBottom: `1px solid ${T.border}` }}>
              <input autoFocus value={assigneeSearch} onChange={e => setAssigneeSearch(e.target.value)}
                onClick={e => e.stopPropagation()} placeholder="Search people…"
                style={{ width: "100%", fontSize: 12, color: T.text, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, padding: "5px 8px", outline: "none", fontFamily: "inherit" }} />
            </div>
            <DropdownItem onClick={() => updateField(task.id, "assignee_id", null)}>
              <span style={{ color: T.text3 }}>Unassigned</span>
            </DropdownItem>
            {filteredProfiles.map(p => (
              <DropdownItem key={p.id} onClick={() => updateField(task.id, "assignee_id", p.id)}>
                <Ava uid={p.id} sz={18} />
                <span>{p.display_name}</span>
              </DropdownItem>
            ))}
            {filteredProfiles.length === 0 && <div style={{ padding: "8px 12px", fontSize: 12, color: T.text3, fontStyle: "italic" }}>No matches</div>}
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
      {/* My Tasks nav */}
      <div style={{ padding: "16px 8px 4px" }}>
        <button onClick={() => { setActiveProject("__my_tasks__"); }}
          style={{
            width: "100%", textAlign: "left", padding: "9px 12px", borderRadius: 8, border: "none",
            cursor: "pointer", display: "flex", alignItems: "center", gap: 10, fontSize: 13,
            background: activeProject === "__my_tasks__" ? `${T.accent}15` : "transparent",
            color: activeProject === "__my_tasks__" ? T.text : T.text2,
          }}>
          <div style={{ width: 26, height: 26, borderRadius: 6, background: T.green, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0 }}>✓</div>
          <span style={{ fontWeight: activeProject === "__my_tasks__" ? 600 : 400 }}>My Tasks</span>
        </button>
      </div>
      <div style={{ padding: "12px 20px 14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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
          {proj.description && <div style={{ fontSize: 12, color: T.text3, marginTop: 2, maxWidth: 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{proj.description}</div>}
        </div>
        {/* Project actions */}
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginRight: 16 }}>
          <button onClick={openEditProject} title="Edit project" style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, cursor: "pointer", color: T.text3, fontSize: 11, padding: "5px 10px", fontWeight: 600 }}>Edit</button>
          <button onClick={() => setShowFieldForm(true)} title="Manage custom fields" style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, cursor: "pointer", color: T.text3, fontSize: 11, padding: "5px 10px", fontWeight: 600 }}>Fields</button>
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
      {/* Milestones bar */}
      {milestones.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 28px 4px", flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: T.text3, textTransform: "uppercase", letterSpacing: "0.06em" }}>Milestones</span>
          {milestones.map(ms => {
            const cfg = MILESTONE_STATUS[ms.status] || MILESTONE_STATUS.upcoming;
            const linked = tasks.filter(t => t.milestone_id === ms.id);
            const done = linked.filter(t => t.status === "done").length;
            return (
              <div key={ms.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 6, background: cfg.bg, border: `1px solid ${cfg.color}30`, fontSize: 11 }}>
                <span style={{ color: cfg.color, fontWeight: 600 }}>🏁 {ms.name}</span>
                {ms.target_date && <span style={{ color: T.text3, fontSize: 10 }}>{new Date(ms.target_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
                {linked.length > 0 && <span style={{ color: T.text3, fontSize: 10 }}>{done}/{linked.length}</span>}
                <select value={ms.status} onChange={e => updateMilestoneStatus(ms.id, e.target.value)} onClick={e => e.stopPropagation()}
                  style={{ fontSize: 9, color: cfg.color, background: "transparent", border: "none", cursor: "pointer", fontFamily: "inherit", outline: "none" }}>
                  {Object.entries(MILESTONE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <button onClick={() => deleteMilestone(ms.id)} style={{ background: "none", border: "none", cursor: "pointer", color: T.text3, fontSize: 12, padding: 0, lineHeight: 1 }}>×</button>
              </div>
            );
          })}
          <button onClick={() => setShowMilestoneForm(true)} style={{ padding: "3px 8px", borderRadius: 4, border: `1px dashed ${T.border}`, background: "transparent", color: T.text3, cursor: "pointer", fontSize: 10, fontWeight: 600 }}>+ Add</button>
        </div>
      )}
      {milestones.length === 0 && (
        <div style={{ padding: "6px 28px 2px" }}>
          <button onClick={() => setShowMilestoneForm(true)} style={{ fontSize: 11, color: T.text3, background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 13 }}>🏁</span> Add milestone…
          </button>
        </div>
      )}
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
        {[
          { k: "list",  l: "List",  icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="2" width="14" height="2" rx="1"/><rect x="1" y="7" width="14" height="2" rx="1"/><rect x="1" y="12" width="14" height="2" rx="1"/></svg> },
          { k: "board", l: "Board", icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="4" height="14" rx="1"/><rect x="6" y="1" width="4" height="10" rx="1"/><rect x="11" y="1" width="4" height="7" rx="1"/></svg> },
          { k: "timeline", l: "Timeline", icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="2" width="8" height="2" rx="1"/><rect x="4" y="7" width="10" height="2" rx="1"/><rect x="2" y="12" width="6" height="2" rx="1"/></svg> },
          { k: "calendar", l: "Calendar", icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="3" width="14" height="12" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5"/><line x1="1" y1="7" x2="15" y2="7" stroke="currentColor" strokeWidth="1.5"/><line x1="5" y1="1" x2="5" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/><line x1="11" y1="1" x2="11" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg> },
          { k: "table", l: "Table", icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="14" height="14" rx="1.5" fill="none" stroke="currentColor" strokeWidth="1.5"/><line x1="1" y1="5.5" x2="15" y2="5.5" stroke="currentColor" strokeWidth="1"/><line x1="1" y1="10" x2="15" y2="10" stroke="currentColor" strokeWidth="1"/><line x1="6" y1="1" x2="6" y2="15" stroke="currentColor" strokeWidth="1"/></svg> },
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
            <div
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
              onDrop={(e) => { e.preventDefault(); handleDrop(null, sec.id); }}
              style={{
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
                    draggable
                    onDragStart={(e) => { setDragTask(task); e.dataTransfer.effectAllowed = "move"; }}
                    onDragEnd={() => { setDragTask(null); setDragOverTarget(null); }}
                    onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setDragOverTarget(task.id); }}
                    onDragLeave={() => setDragOverTarget(null)}
                    onDrop={(e) => { e.preventDefault(); handleDrop(task.id, sec.id); }}
                    onMouseEnter={() => setHoveredRow(task.id)}
                    onMouseLeave={() => setHoveredRow(null)}
                    onClick={(e) => { if (e.ctrlKey || e.metaKey) { toggleSelectTask(task.id, e); } else { clearSelection(); setSelectedTask(task); } }}
                    style={{
                      display: "grid", gridTemplateColumns: "40px 1fr 90px 90px 150px 100px",
                      gap: 0, padding: "0 28px", alignItems: "center", height: 38,
                      cursor: dragTask ? "grabbing" : "pointer", borderBottom: `1px solid ${T.border}`,
                      background: selectedTaskIds.has(task.id) ? `${T.accent}18` : dragOverTarget === task.id && dragTask ? `${T.accent}20` : sel ? `${T.accent}10` : hov ? `${T.text}06` : "transparent",
                      borderLeft: selectedTaskIds.has(task.id) ? `3px solid ${T.accent}` : sel ? `3px solid ${T.accent}` : "3px solid transparent",
                      borderTop: dragOverTarget === task.id && dragTask ? `2px solid ${T.accent}` : "2px solid transparent",
                      transition: "background 0.1s",
                      opacity: dragTask?.id === task.id ? 0.4 : 1,
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
     TIMELINE VIEW (Gantt-style)
     ═══════════════════════════════════════════════════════ */
  const timelineView = (() => {
    const tasksWithDates = filt.filter(t => t.due_date && !t.parent_task_id);
    if (tasksWithDates.length === 0) return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 10, color: T.text3, fontSize: 13 }}>
        <span>No tasks with due dates to display</span>
        <span style={{ fontSize: 11 }}>Add due dates to your tasks to see them on the timeline</span>
      </div>
    );
    // Compute date range
    const dates = tasksWithDates.map(t => new Date(t.due_date));
    const starts = tasksWithDates.map(t => t.start_date ? new Date(t.start_date) : new Date(t.due_date));
    const allDates = [...dates, ...starts];
    let minDate = new Date(Math.min(...allDates)); let maxDate = new Date(Math.max(...allDates));
    minDate.setDate(minDate.getDate() - 3); maxDate.setDate(maxDate.getDate() + 7);
    const totalDays = Math.max(Math.ceil((maxDate - minDate) / 86400000), 14);
    const dayWidth = 36;
    const getX = (d) => Math.round(((new Date(d) - minDate) / 86400000) * dayWidth);
    // Build day columns
    const dayCols = [];
    for (let i = 0; i <= totalDays; i++) {
      const d = new Date(minDate); d.setDate(d.getDate() + i);
      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
      const isToday = d.toDateString() === new Date().toDateString();
      dayCols.push({ date: d, isWeekend, isToday, label: d.getDate() === 1 || i === 0 ? d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) : d.getDate().toString() });
    }
    // Group by section
    const secGroups = sections.map(sec => ({
      sec, tasks: tasksWithDates.filter(t => t.section_id === sec.id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)),
    })).filter(g => g.tasks.length > 0);
    return (
      <div style={{ flex: 1, overflow: "auto", position: "relative" }}>
        {/* Day header */}
        <div style={{ display: "flex", position: "sticky", top: 0, zIndex: 5, background: T.surface, borderBottom: `1px solid ${T.border}` }}>
          <div style={{ width: 200, flexShrink: 0, padding: "8px 12px", fontSize: 11, fontWeight: 600, color: T.text3, borderRight: `1px solid ${T.border}` }}>Task</div>
          <div style={{ display: "flex" }}>
            {dayCols.map((d, i) => (
              <div key={i} style={{
                width: dayWidth, textAlign: "center", fontSize: 9, padding: "6px 0", color: d.isToday ? T.accent : d.isWeekend ? T.text3 + "60" : T.text3,
                fontWeight: d.isToday ? 700 : 400, background: d.isToday ? `${T.accent}10` : d.isWeekend ? `${T.text}04` : "transparent",
                borderRight: `1px solid ${T.border}30`,
              }}>{d.label}</div>
            ))}
          </div>
        </div>
        {/* Rows */}
        {secGroups.map(({ sec, tasks: secTasks }, si) => (
          <div key={sec.id}>
            <div style={{ display: "flex", background: T.surface2, borderBottom: `1px solid ${T.border}` }}>
              <div style={{ width: 200, flexShrink: 0, padding: "6px 12px", fontSize: 12, fontWeight: 700, color: T.text }}>{sec.name}</div>
            </div>
            {secTasks.map(task => {
              const start = task.start_date || task.due_date;
              const end = task.due_date;
              const left = getX(start);
              const width = Math.max(getX(end) - left, dayWidth);
              const pcfg = PRIORITY[task.priority];
              const dn = task.status === "done";
              return (
                <div key={task.id} style={{ display: "flex", borderBottom: `1px solid ${T.border}30`, height: 36, alignItems: "center" }}>
                  <div onClick={() => setSelectedTask(task)} style={{
                    width: 200, flexShrink: 0, padding: "0 12px", fontSize: 12, color: dn ? T.text3 : T.text,
                    textDecoration: dn ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis",
                    whiteSpace: "nowrap", cursor: "pointer",
                  }}>{task.title}</div>
                  <div style={{ position: "relative", flex: 1, height: "100%" }}>
                    {/* Today line */}
                    {dayCols.some(d => d.isToday) && (
                      <div style={{ position: "absolute", left: getX(new Date().toISOString().split("T")[0]), top: 0, bottom: 0, width: 2, background: T.accent, opacity: 0.3, zIndex: 1 }} />
                    )}
                    <div onClick={() => setSelectedTask(task)} style={{
                      position: "absolute", left, top: 6, height: 24, width,
                      background: dn ? T.surface3 : pcfg?.bg || `${T.accent}30`,
                      border: `1px solid ${dn ? T.border : pcfg?.color || T.accent}40`,
                      borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", paddingLeft: 8,
                      fontSize: 10, color: dn ? T.text3 : pcfg?.color || T.accent, fontWeight: 600, overflow: "hidden",
                    }}>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.title}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  })();

  /* ═══════════════════════════════════════════════════════
     CALENDAR VIEW
     ═══════════════════════════════════════════════════════ */
  const calendarView = (() => {
    const year = calMonth.getFullYear(), month = calMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date().toISOString().split("T")[0];
    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    const getTasksForDay = (day) => {
      const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      return filt.filter(t => t.due_date === dateStr && !t.parent_task_id);
    };
    return (
      <div style={{ flex: 1, overflow: "auto", padding: "20px 28px" }}>
        {/* Month nav */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <button onClick={() => setCalMonth(new Date(year, month - 1, 1))} style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, cursor: "pointer", color: T.text3, padding: "4px 10px", fontSize: 14 }}>←</button>
          <span style={{ fontSize: 16, fontWeight: 700, color: T.text, minWidth: 160, textAlign: "center" }}>
            {calMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </span>
          <button onClick={() => setCalMonth(new Date(year, month + 1, 1))} style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, cursor: "pointer", color: T.text3, padding: "4px 10px", fontSize: 14 }}>→</button>
          <button onClick={() => setCalMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1))} style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, cursor: "pointer", color: T.text3, padding: "4px 10px", fontSize: 11, fontWeight: 600 }}>Today</button>
        </div>
        {/* Day names */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1 }}>
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
            <div key={d} style={{ padding: "6px 8px", fontSize: 10, fontWeight: 600, color: T.text3, textTransform: "uppercase", textAlign: "center" }}>{d}</div>
          ))}
        </div>
        {/* Cells */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1 }}>
          {cells.map((day, i) => {
            if (!day) return <div key={i} style={{ background: T.surface2 + "40", minHeight: 90 }} />;
            const dateStr = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const isToday = dateStr === today;
            const dayTasks = getTasksForDay(day);
            return (
              <div key={i} style={{
                minHeight: 90, padding: 6, background: T.surface, border: `1px solid ${T.border}30`,
                borderColor: isToday ? T.accent + "60" : T.border + "30",
              }}>
                <div style={{
                  fontSize: 11, fontWeight: isToday ? 700 : 400, marginBottom: 4, textAlign: "right",
                  color: isToday ? T.accent : T.text3,
                }}>{day}</div>
                {dayTasks.slice(0, 3).map(task => (
                  <div key={task.id} onClick={() => setSelectedTask(task)} style={{
                    fontSize: 10, padding: "2px 5px", borderRadius: 3, marginBottom: 2, cursor: "pointer",
                    background: PRIORITY[task.priority]?.bg || T.surface2, color: PRIORITY[task.priority]?.color || T.text2,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: 500,
                  }}>{task.title}</div>
                ))}
                {dayTasks.length > 3 && <div style={{ fontSize: 9, color: T.text3, textAlign: "center" }}>+{dayTasks.length - 3} more</div>}
              </div>
            );
          })}
        </div>
      </div>
    );
  })();

  /* ═══════════════════════════════════════════════════════
     MY TASKS VIEW (Cross-project personal task list)
     ═══════════════════════════════════════════════════════ */
  const myTasksView = (() => {
    const grouped = {};
    const MY_GROUPS = ["overdue", "today", "upcoming", "later", "no_date", "done"];
    const GROUP_LABELS = { overdue: "Overdue", today: "Today", upcoming: "Next 7 Days", later: "Later", no_date: "No Due Date", done: "Completed" };
    const todayStr = new Date().toISOString().split("T")[0];
    const weekStr = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];
    MY_GROUPS.forEach(g => { grouped[g] = []; });
    myTasks.forEach(t => {
      if (t.status === "done") { grouped.done.push(t); return; }
      if (!t.due_date) { grouped.no_date.push(t); return; }
      if (t.due_date < todayStr) grouped.overdue.push(t);
      else if (t.due_date === todayStr) grouped.today.push(t);
      else if (t.due_date <= weekStr) grouped.upcoming.push(t);
      else grouped.later.push(t);
    });
    const groupColors = { overdue: "#ef4444", today: T.accent, upcoming: T.green, later: T.text3, no_date: T.text3, done: T.green };
    return (
      <div style={{ flex: 1, overflow: "auto", padding: "20px 28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: T.green, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, color: "#fff" }}>✓</div>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>My Tasks</h2>
            <div style={{ fontSize: 12, color: T.text3, marginTop: 2 }}>{myTasks.filter(t => t.status !== "done").length} tasks remaining</div>
          </div>
        </div>
        {MY_GROUPS.filter(g => grouped[g].length > 0).map(g => (
          <div key={g} style={{ marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: groupColors[g] }}>{GROUP_LABELS[g]}</span>
              <span style={{ fontSize: 10, color: T.text3 }}>({grouped[g].length})</span>
            </div>
            {grouped[g].map(task => {
              const proj = myTasksProjects[task.project_id];
              const pcfg = PRIORITY[task.priority];
              const dn = task.status === "done";
              return (
                <div key={task.id} onClick={() => { setActiveProject(task.project_id); setTimeout(() => setSelectedTask(task), 100); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", marginBottom: 2,
                    borderRadius: 6, cursor: "pointer", border: `1px solid ${T.border}30`, background: T.surface,
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = T.surface2} onMouseLeave={e => e.currentTarget.style.background = T.surface}>
                  <Check on={dn} fn={e => { e.stopPropagation(); toggleDone(task, e); }} sz={17} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: dn ? T.text3 : T.text, textDecoration: dn ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.title}</div>
                    <div style={{ fontSize: 10, color: T.text3, display: "flex", gap: 8, marginTop: 2 }}>
                      {proj && <span style={{ display: "flex", alignItems: "center", gap: 3 }}><span style={{ width: 6, height: 6, borderRadius: 2, background: proj.color || T.accent }} />{proj.name}</span>}
                      {task.due_date && <span>{new Date(task.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
                    </div>
                  </div>
                  {pcfg && <span style={{ padding: "2px 6px", borderRadius: 3, fontSize: 9, fontWeight: 600, background: pcfg.bg, color: pcfg.color }}>{pcfg.label}</span>}
                  <Ava uid={task.assignee_id} sz={20} />
                </div>
              );
            })}
          </div>
        ))}
        {myTasks.length === 0 && <div style={{ textAlign: "center", color: T.text3, fontSize: 13, padding: 40 }}>No tasks found</div>}
      </div>
    );
  })();

  /* ═══════════════════════════════════════════════════════
     TABLE VIEW (Spreadsheet-style sortable)
     ═══════════════════════════════════════════════════════ */
  const tableView = (() => {
    const rootFiltered = filt.filter(t => !t.parent_task_id);
    const COLS = [
      { key: "title", label: "Task", flex: 3 },
      { key: "status", label: "Status", flex: 1 },
      { key: "priority", label: "Priority", flex: 1 },
      { key: "assignee_id", label: "Assignee", flex: 1.5 },
      { key: "section_id", label: "Section", flex: 1 },
      { key: "due_date", label: "Due Date", flex: 1 },
      { key: "created_at", label: "Created", flex: 1 },
    ];
    const toggleSort = (col) => setTableSort(p => ({ col, dir: p.col === col && p.dir === "asc" ? "desc" : "asc" }));
    const sorted = [...rootFiltered].sort((a, b) => {
      const { col, dir } = tableSort;
      let av = a[col], bv = b[col];
      if (col === "assignee_id") { av = uname(av) || "zzz"; bv = uname(bv) || "zzz"; }
      if (col === "section_id") { av = sections.find(s => s.id === av)?.name || ""; bv = sections.find(s => s.id === bv)?.name || ""; }
      if (av == null) av = ""; if (bv == null) bv = "";
      const cmp = typeof av === "string" ? av.localeCompare(bv) : av > bv ? 1 : av < bv ? -1 : 0;
      return dir === "asc" ? cmp : -cmp;
    });
    const arrow = (col) => tableSort.col === col ? (tableSort.dir === "asc" ? " ↑" : " ↓") : "";
    const hStyle = { padding: "8px 10px", fontSize: 11, fontWeight: 700, color: T.text3, cursor: "pointer", userSelect: "none", borderBottom: `2px solid ${T.border}`, whiteSpace: "nowrap", textTransform: "uppercase", letterSpacing: "0.04em" };
    const cStyle = { padding: "7px 10px", fontSize: 12, color: T.text2, borderBottom: `1px solid ${T.border}30`, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };
    return (
      <div style={{ flex: 1, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
          <thead style={{ position: "sticky", top: 0, background: T.surface, zIndex: 5 }}>
            <tr>
              {COLS.map(c => (
                <th key={c.key} onClick={() => toggleSort(c.key)} style={{ ...hStyle, width: c.flex === 3 ? "auto" : undefined, textAlign: "left" }}>
                  {c.label}{arrow(c.key)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map(task => {
              const dn = task.status === "done";
              const secName = sections.find(s => s.id === task.section_id)?.name || "—";
              const pcfg = PRIORITY[task.priority];
              const scfg = STATUS[task.status];
              return (
                <tr key={task.id} onClick={() => setSelectedTask(task)} style={{ cursor: "pointer", background: "transparent" }}
                  onMouseEnter={e => e.currentTarget.style.background = T.surface2} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <td style={{ ...cStyle, fontWeight: 500, color: dn ? T.text3 : T.text, textDecoration: dn ? "line-through" : "none" }}>{task.title}</td>
                  <td style={cStyle}>
                    <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: scfg?.bg || T.surface2, color: scfg?.color || T.text3, border: `1px solid ${scfg?.color || T.border}30` }}>
                      {scfg?.label || task.status}
                    </span>
                  </td>
                  <td style={cStyle}>
                    {pcfg ? (
                      <span style={{ padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: pcfg.bg, color: pcfg.color, border: `1px solid ${pcfg.color}30` }}>
                        {pcfg.label}
                      </span>
                    ) : <span style={{ color: T.text3 }}>—</span>}
                  </td>
                  <td style={cStyle}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <Ava uid={task.assignee_id} sz={20} />
                      <span style={{ color: task.assignee_id ? T.text2 : T.text3 }}>{task.assignee_id ? uname(task.assignee_id) : "—"}</span>
                    </div>
                  </td>
                  <td style={{ ...cStyle, color: T.text3 }}>{secName}</td>
                  <td style={{ ...cStyle, color: task.due_date ? T.text2 : T.text3 }}>
                    {task.due_date ? new Date(task.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                  </td>
                  <td style={{ ...cStyle, color: T.text3, fontSize: 11 }}>
                    {task.created_at ? new Date(task.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {sorted.length === 0 && (
          <div style={{ padding: 40, textAlign: "center", color: T.text3, fontSize: 13 }}>No tasks to display</div>
        )}
      </div>
    );
  })();

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
        {selectedTask.parent_task_id && (() => {
          const parent = tasks.find(t => t.id === selectedTask.parent_task_id);
          return parent ? (
            <div onClick={() => setSelectedTask(parent)} style={{ fontSize: 11, color: T.accent, cursor: "pointer", marginBottom: 6, display: "flex", alignItems: "center", gap: 4 }}>
              <svg width="10" height="10" viewBox="0 0 10 10"><path d="M6 2L3 5l3 3" fill="none" stroke={T.accent} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              {parent.title}
            </div>
          ) : null;
        })()}
        <input value={selectedTask.title}
          onChange={e => { const v = e.target.value; setSelectedTask(p => ({ ...p, title: v })); setTasks(p => p.map(t => t.id === selectedTask.id ? { ...t, title: v } : t)); }}
          onBlur={() => supabase.from("tasks").update({ title: selectedTask.title }).eq("id", selectedTask.id)}
          onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
          style={{ fontSize: 20, fontWeight: 700, color: T.text, lineHeight: 1.3, background: "transparent", border: "none", outline: "none", padding: 0, width: "100%", marginBottom: 24 }} />
        {/* Fields */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <PanelField icon="👤" label="Assignee">
            <div style={{ position: "relative" }}>
              <div onClick={() => setEditingCell(editingCell?.field === "panelAssignee" ? null : { taskId: selectedTask.id, field: "panelAssignee" })}
                style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", padding: "2px 4px", borderRadius: 4 }}>
                <Ava uid={selectedTask.assignee_id} sz={24} />
                <span style={{ fontSize: 13, color: selectedTask.assignee_id ? T.text : T.text3 }}>
                  {selectedTask.assignee_id ? uname(selectedTask.assignee_id) : "Unassigned"}
                </span>
              </div>
              {editingCell?.field === "panelAssignee" && (
                <Dropdown onClose={() => { setEditingCell(null); setAssigneeSearch(""); }} wide>
                  <div style={{ padding: "4px 8px", borderBottom: `1px solid ${T.border}` }}>
                    <input autoFocus value={assigneeSearch} onChange={e => setAssigneeSearch(e.target.value)}
                      onClick={e => e.stopPropagation()} placeholder="Search people…"
                      style={{ width: "100%", fontSize: 12, color: T.text, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, padding: "5px 8px", outline: "none", fontFamily: "inherit" }} />
                  </div>
                  <DropdownItem onClick={() => updateField(selectedTask.id, "assignee_id", null)}>
                    <span style={{ color: T.text3 }}>Unassigned</span>
                  </DropdownItem>
                  {Object.values(profiles).filter(p => !assigneeSearch || (p.display_name || "").toLowerCase().includes(assigneeSearch.toLowerCase()))
                    .sort((a, b) => (a.display_name || "").localeCompare(b.display_name || "")).map(p => (
                    <DropdownItem key={p.id} onClick={() => updateField(selectedTask.id, "assignee_id", p.id)}>
                      <Ava uid={p.id} sz={18} /><span>{p.display_name}</span>
                    </DropdownItem>
                  ))}
                </Dropdown>
              )}
            </div>
          </PanelField>
          <PanelField icon="🗓" label="Start date">
            <input type="date" value={selectedTask.start_date || ""} onChange={e => updateField(selectedTask.id, "start_date", e.target.value || null)}
              style={{ fontSize: 13, color: T.text, background: "transparent", border: "none", outline: "none", cursor: "pointer", colorScheme: "dark", fontFamily: "inherit" }} />
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
          {milestones.length > 0 && (
            <PanelField icon="🏁" label="Milestone">
              <select value={selectedTask.milestone_id || ""} onChange={e => updateField(selectedTask.id, "milestone_id", e.target.value || null)}
                style={{ fontSize: 13, color: T.text, background: "transparent", border: "none", outline: "none", cursor: "pointer", fontFamily: "inherit" }}>
                <option value="">None</option>
                {milestones.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </PanelField>
          )}
        </div>
        {/* Custom Fields */}
        {customFields.length > 0 && (
          <div style={{ marginTop: 16 }}>
            {customFields.map(cf => {
              const val = customFieldValues[selectedTask.id]?.[cf.id] || "";
              return (
                <PanelField key={cf.id} icon="🏷️" label={cf.name}>
                  {cf.field_type === "text" && (
                    <input value={val} onChange={e => setCustomFieldValue(selectedTask.id, cf.id, e.target.value)}
                      placeholder="—" style={{ fontSize: 13, color: T.text, background: "transparent", border: "none", outline: "none", fontFamily: "inherit", width: "100%" }} />
                  )}
                  {cf.field_type === "number" && (
                    <input type="number" value={val} onChange={e => setCustomFieldValue(selectedTask.id, cf.id, e.target.value)}
                      placeholder="—" style={{ fontSize: 13, color: T.text, background: "transparent", border: "none", outline: "none", fontFamily: "inherit", width: 80 }} />
                  )}
                  {cf.field_type === "date" && (
                    <input type="date" value={val} onChange={e => setCustomFieldValue(selectedTask.id, cf.id, e.target.value)}
                      style={{ fontSize: 13, color: T.text, background: "transparent", border: "none", outline: "none", fontFamily: "inherit", colorScheme: "dark" }} />
                  )}
                  {cf.field_type === "checkbox" && (
                    <input type="checkbox" checked={val === "true"} onChange={e => setCustomFieldValue(selectedTask.id, cf.id, e.target.checked ? "true" : "false")}
                      style={{ cursor: "pointer" }} />
                  )}
                  {cf.field_type === "select" && (
                    <select value={val} onChange={e => setCustomFieldValue(selectedTask.id, cf.id, e.target.value)}
                      style={{ fontSize: 13, color: T.text, background: "transparent", border: "none", outline: "none", cursor: "pointer", fontFamily: "inherit" }}>
                      <option value="">—</option>
                      {(cf.options || []).map(opt => <option key={opt} value={opt}>{opt}</option>)}
                    </select>
                  )}
                </PanelField>
              );
            })}
          </div>
        )}
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
        {/* Dependencies */}
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 10 }}>Dependencies</div>
          {/* Blocked by */}
          {getBlockedBy(selectedTask.id).length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: T.text3, textTransform: "uppercase", marginBottom: 4 }}>Blocked by</div>
              {getBlockedBy(selectedTask.id).map(dep => (
                <div key={dep.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px", borderRadius: 4, background: "#ef444410", border: "1px solid #ef444420", marginBottom: 3 }}>
                  <span style={{ fontSize: 12, color: "#ef4444", fontWeight: 500 }}>🚫</span>
                  <span onClick={() => setSelectedTask(dep.task)} style={{ fontSize: 12, color: T.text2, cursor: "pointer", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dep.task.title}</span>
                  <button onClick={() => removeDependency(dep.id)} style={{ background: "none", border: "none", cursor: "pointer", color: T.text3, fontSize: 12, padding: 0, lineHeight: 1 }}>×</button>
                </div>
              ))}
            </div>
          )}
          {/* Blocking */}
          {getBlocking(selectedTask.id).length > 0 && (
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: T.text3, textTransform: "uppercase", marginBottom: 4 }}>Blocking</div>
              {getBlocking(selectedTask.id).map(dep => (
                <div key={dep.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px", borderRadius: 4, background: `${T.accent}10`, border: `1px solid ${T.accent}20`, marginBottom: 3 }}>
                  <span style={{ fontSize: 12, color: T.accent, fontWeight: 500 }}>⏳</span>
                  <span onClick={() => setSelectedTask(dep.task)} style={{ fontSize: 12, color: T.text2, cursor: "pointer", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{dep.task.title}</span>
                  <button onClick={() => removeDependency(dep.id)} style={{ background: "none", border: "none", cursor: "pointer", color: T.text3, fontSize: 12, padding: 0, lineHeight: 1 }}>×</button>
                </div>
              ))}
            </div>
          )}
          {/* Add dependency */}
          <div style={{ display: "flex", gap: 4 }}>
            <select id="depTarget" defaultValue="" style={{ flex: 1, fontSize: 11, color: T.text, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, padding: "4px 6px", outline: "none", fontFamily: "inherit" }}>
              <option value="" disabled>Select task…</option>
              {tasks.filter(t => t.id !== selectedTask.id && !t.parent_task_id).map(t => <option key={t.id} value={t.id}>{t.title}</option>)}
            </select>
            <button onClick={() => { const sel = document.getElementById("depTarget"); if (sel.value) { addDependency(sel.value, selectedTask.id); sel.value = ""; } }}
              style={{ padding: "4px 8px", fontSize: 10, fontWeight: 600, borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface2, color: T.text3, cursor: "pointer", whiteSpace: "nowrap" }}>+ Blocked by</button>
            <button onClick={() => { const sel = document.getElementById("depTarget"); if (sel.value) { addDependency(selectedTask.id, sel.value); sel.value = ""; } }}
              style={{ padding: "4px 8px", fontSize: 10, fontWeight: 600, borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface2, color: T.text3, cursor: "pointer", whiteSpace: "nowrap" }}>+ Blocking</button>
          </div>
          {getBlockedBy(selectedTask.id).length === 0 && getBlocking(selectedTask.id).length === 0 && (
            <div style={{ fontSize: 12, color: T.text3, fontStyle: "italic", marginTop: 6 }}>No dependencies</div>
          )}
        </div>
        {/* Attachments */}
        <div style={{ marginTop: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>Attachments</div>
            <label style={{ padding: "3px 10px", fontSize: 11, fontWeight: 600, borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface2, color: T.text3, cursor: "pointer" }}>
              + Upload
              <input type="file" hidden onChange={e => { if (e.target.files[0]) uploadAttachment(e.target.files[0]); e.target.value = ""; }} />
            </label>
          </div>
          {attachments.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {attachments.map(att => {
                const isImage = att.mime_type?.startsWith("image/");
                return (
                  <div key={att.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 6, background: T.surface2, border: `1px solid ${T.border}` }}>
                    {isImage ? (
                      <img src={getFileUrl(att.file_path)} alt="" style={{ width: 32, height: 32, borderRadius: 4, objectFit: "cover", flexShrink: 0 }} />
                    ) : (
                      <span style={{ fontSize: 18, flexShrink: 0 }}>{fileIcon(att.mime_type)}</span>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <a href={getFileUrl(att.file_path)} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 12, color: T.accent, textDecoration: "none", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {att.filename}
                      </a>
                      <span style={{ fontSize: 10, color: T.text3 }}>{formatSize(att.file_size)}</span>
                    </div>
                    <button onClick={() => deleteAttachment(att)} style={{ background: "none", border: "none", cursor: "pointer", color: T.text3, fontSize: 12, padding: 0, lineHeight: 1 }}>×</button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: T.text3, fontStyle: "italic" }}>No attachments</div>
          )}
        </div>
        {/* Subtasks */}
        <div style={{ marginTop: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>Subtasks</div>
            <button onClick={() => createSubtask(selectedTask)} style={{
              padding: "3px 10px", fontSize: 11, fontWeight: 600, borderRadius: 4,
              border: `1px solid ${T.border}`, background: T.surface2, color: T.text3, cursor: "pointer",
            }}>+ Add</button>
          </div>
          {getSubtasks(selectedTask.id).length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {getSubtasks(selectedTask.id).map(sub => (
                <div key={sub.id} onClick={() => setSelectedTask(sub)} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderRadius: 6,
                  cursor: "pointer", background: T.surface2, border: `1px solid ${T.border}`,
                }}>
                  <Check on={sub.status === "done"} fn={e => { e.stopPropagation(); toggleDone(sub, e); }} sz={15} />
                  <span style={{
                    flex: 1, fontSize: 12, color: sub.status === "done" ? T.text3 : T.text,
                    textDecoration: sub.status === "done" ? "line-through" : "none",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>{sub.title}</span>
                  {sub.assignee_id && <Ava uid={sub.assignee_id} sz={18} />}
                </div>
              ))}
              {/* Subtask progress bar */}
              {(() => {
                const subs = getSubtasks(selectedTask.id);
                const doneCount = subs.filter(s => s.status === "done").length;
                const pctDone = Math.round((doneCount / subs.length) * 100);
                return (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                    <div style={{ flex: 1, height: 3, background: T.surface3, borderRadius: 3 }}>
                      <div style={{ height: 3, borderRadius: 3, background: T.green, width: `${pctDone}%`, transition: "width 0.3s" }} />
                    </div>
                    <span style={{ fontSize: 10, color: T.text3 }}>{doneCount}/{subs.length}</span>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: T.text3, fontStyle: "italic" }}>No subtasks yet</div>
          )}
        </div>
        {/* Attachments */}
        <div style={{ marginTop: 24 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>Attachments</div>
            <label style={{
              padding: "3px 10px", fontSize: 11, fontWeight: 600, borderRadius: 4,
              border: `1px solid ${T.border}`, background: T.surface2, color: T.text3, cursor: "pointer",
            }}>
              + Upload
              <input type="file" hidden onChange={e => { if (e.target.files[0]) uploadAttachment(e.target.files[0]); e.target.value = ""; }} />
            </label>
          </div>
          {attachments.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {attachments.map(att => {
                const url = supabase.storage.from("attachments").getPublicUrl(att.file_path).data.publicUrl;
                const isImage = att.mime_type?.startsWith("image/");
                return (
                  <div key={att.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 6, background: T.surface2, border: `1px solid ${T.border}` }}>
                    {isImage ? (
                      <img src={url} alt={att.filename} style={{ width: 32, height: 32, borderRadius: 4, objectFit: "cover", flexShrink: 0 }} />
                    ) : (
                      <span style={{ fontSize: 18, flexShrink: 0 }}>{fileIcon(att.mime_type)}</span>
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <a href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: T.accent, textDecoration: "none", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{att.filename}</a>
                      <span style={{ fontSize: 10, color: T.text3 }}>{formatFileSize(att.file_size)}</span>
                    </div>
                    <button onClick={() => deleteAttachment(att)} style={{ background: "none", border: "none", cursor: "pointer", color: T.text3, fontSize: 12, padding: 0, lineHeight: 1 }}>×</button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ fontSize: 12, color: T.text3, fontStyle: "italic" }}>No attachments</div>
          )}
        </div>
        {/* Comments & Activity */}
        <div style={{ marginTop: 28, paddingTop: 18, borderTop: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 12 }}>Comments & Activity</div>
          {/* Comment input */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <div style={{ width: 28, height: 28, borderRadius: 14, background: T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "#fff", flexShrink: 0 }}>You</div>
            <div style={{ flex: 1 }}>
              <textarea value={newComment} onChange={e => setNewComment(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addComment(); } }}
                placeholder="Write a comment… (Enter to send)"
                style={{
                  width: "100%", minHeight: 60, fontSize: 13, color: T.text, lineHeight: 1.5,
                  padding: "8px 12px", background: T.surface2, borderRadius: 8, border: `1px solid ${T.border}`,
                  resize: "vertical", outline: "none", fontFamily: "inherit",
                }} />
              {newComment.trim() && (
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 6 }}>
                  <button onClick={addComment} style={{ padding: "5px 14px", fontSize: 11, fontWeight: 600, borderRadius: 4, border: "none", background: T.accent, color: "#fff", cursor: "pointer" }}>Comment</button>
                </div>
              )}
            </div>
          </div>
          {/* Comments list */}
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {comments.map(c => {
              const author = profiles[c.author_id];
              const timeAgo = (() => {
                const diff = Date.now() - new Date(c.created_at).getTime();
                const mins = Math.floor(diff / 60000);
                if (mins < 1) return "just now";
                if (mins < 60) return `${mins}m ago`;
                const hrs = Math.floor(mins / 60);
                if (hrs < 24) return `${hrs}h ago`;
                const days = Math.floor(hrs / 24);
                if (days < 30) return `${days}d ago`;
                return new Date(c.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" });
              })();
              return (
                <div key={c.id} style={{ display: "flex", gap: 8 }}>
                  <Ava uid={c.author_id} sz={28} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{author?.display_name || "Anonymous"}</span>
                      <span style={{ fontSize: 10, color: T.text3 }}>{timeAgo}</span>
                      <div style={{ flex: 1 }} />
                      <button onClick={() => deleteComment(c.id)} title="Delete comment"
                        style={{ background: "none", border: "none", cursor: "pointer", color: T.text3, fontSize: 12, padding: "0 2px", opacity: 0.5, lineHeight: 1 }}>×</button>
                    </div>
                    <div style={{ fontSize: 13, color: T.text2, lineHeight: 1.5, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{c.content}</div>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Activity log */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: comments.length > 0 ? 16 : 0, paddingTop: comments.length > 0 ? 12 : 0, borderTop: comments.length > 0 ? `1px solid ${T.border}30` : "none" }}>
            {selectedTask.created_at && (
              <div style={{ fontSize: 11, color: T.text3, display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 5, height: 5, borderRadius: 5, background: T.green, flexShrink: 0 }} />
                Task created · {new Date(selectedTask.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </div>
            )}
            {selectedTask.completed_at && (
              <div style={{ fontSize: 11, color: T.text3, display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 5, height: 5, borderRadius: 5, background: T.green, flexShrink: 0 }} />
                Completed · {new Date(selectedTask.completed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </div>
            )}
          </div>
        </div>
        {/* Actions */}
        <div style={{ marginTop: 28, paddingTop: 18, borderTop: `1px solid ${T.border}`, display: "flex", gap: 8 }}>
          <button onClick={() => duplicateTask(selectedTask)}
            style={{ padding: "7px 14px", fontSize: 12, fontWeight: 600, borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text3, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.text3} strokeWidth="2" strokeLinecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            Duplicate
          </button>
          <button onClick={() => { if (confirm("Delete this task?")) deleteTask(selectedTask.id); }}
            style={{ padding: "7px 14px", fontSize: 12, fontWeight: 600, borderRadius: 6, border: `1px solid #ef444440`, background: "#ef444410", color: "#ef4444", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/></svg>
            Delete
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
        {activeProject === "__my_tasks__" ? myTasksView : (
          <>
            {header}
            {/* Bulk actions toolbar */}
            {selectedTaskIds.size > 0 && (
              <div style={{
                display: "flex", alignItems: "center", gap: 10, padding: "8px 28px",
                background: `${T.accent}15`, borderBottom: `1px solid ${T.accent}30`,
              }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: T.accent }}>{selectedTaskIds.size} selected</span>
                <div style={{ display: "flex", gap: 4 }}>
                  <select onChange={e => { if (e.target.value) bulkUpdateStatus(e.target.value); e.target.value = ""; }}
                    style={{ fontSize: 11, padding: "4px 8px", borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, cursor: "pointer", fontFamily: "inherit" }}>
                    <option value="">Set status…</option>
                    <option value="backlog">Backlog</option><option value="todo">To Do</option><option value="in_progress">In Progress</option>
                    <option value="in_review">In Review</option><option value="done">Done</option><option value="cancelled">Cancelled</option>
                  </select>
                  <select onChange={e => { if (e.target.value !== "") bulkUpdateAssignee(e.target.value || null); e.target.value = ""; }}
                    style={{ fontSize: 11, padding: "4px 8px", borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, cursor: "pointer", fontFamily: "inherit" }}>
                    <option value="">Assign to…</option><option value="">Unassigned</option>
                    {Object.values(profiles).sort((a, b) => (a.display_name || "").localeCompare(b.display_name || "")).map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
                  </select>
                  <button onClick={bulkDelete} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 4, border: "1px solid #ef444440", background: "#ef444410", color: "#ef4444", cursor: "pointer", fontWeight: 600 }}>Delete</button>
                </div>
                <div style={{ flex: 1 }} />
                <button onClick={clearSelection} style={{ fontSize: 11, color: T.text3, background: "none", border: "none", cursor: "pointer" }}>Clear</button>
              </div>
            )}
            {proj && (viewMode === "list" ? listView : viewMode === "board" ? boardView : viewMode === "timeline" ? timelineView : viewMode === "calendar" ? calendarView : tableView)}
            {!proj && !loading && (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
                <div style={{ fontSize: 14, color: T.text3 }}>No projects yet</div>
                <button onClick={openNewProject} style={{ padding: "8px 18px", fontSize: 13, fontWeight: 600, borderRadius: 6, border: "none", background: T.accent, color: "#fff", cursor: "pointer" }}>Create your first project</button>
              </div>
            )}
          </>
        )}
      </div>
      {detail}
      {projectModal}
      {/* Milestone form modal */}
      {showMilestoneForm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setShowMilestoneForm(false)}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} />
          <div onClick={e => e.stopPropagation()} style={{ position: "relative", width: 380, background: T.surface, borderRadius: 12, border: `1px solid ${T.border}`, padding: 24, zIndex: 101 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>New Milestone</h3>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.text3, marginBottom: 4, display: "block" }}>Name</label>
              <input autoFocus value={milestoneForm.name} onChange={e => setMilestoneForm(p => ({ ...p, name: e.target.value }))}
                onKeyDown={e => { if (e.key === "Enter") createMilestone(); }}
                placeholder="Milestone name…" style={{ width: "100%", padding: "8px 12px", fontSize: 13, color: T.text, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, outline: "none", fontFamily: "inherit" }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.text3, marginBottom: 4, display: "block" }}>Target Date</label>
              <input type="date" value={milestoneForm.target_date} onChange={e => setMilestoneForm(p => ({ ...p, target_date: e.target.value }))}
                style={{ padding: "8px 12px", fontSize: 13, color: T.text, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, outline: "none", fontFamily: "inherit", colorScheme: "dark" }} />
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.text3, marginBottom: 4, display: "block" }}>Description</label>
              <input value={milestoneForm.description} onChange={e => setMilestoneForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Optional description…" style={{ width: "100%", padding: "8px 12px", fontSize: 13, color: T.text, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, outline: "none", fontFamily: "inherit" }} />
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setShowMilestoneForm(false)} style={{ padding: "8px 16px", fontSize: 13, fontWeight: 600, borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text3, cursor: "pointer" }}>Cancel</button>
              <button onClick={createMilestone} style={{ padding: "8px 16px", fontSize: 13, fontWeight: 600, borderRadius: 6, border: "none", background: T.accent, color: "#fff", cursor: "pointer", opacity: milestoneForm.name.trim() ? 1 : 0.5 }}>Create</button>
            </div>
          </div>
        </div>
      )}
      {/* Toast notification */}
      {/* Custom field form modal */}
      {showFieldForm && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setShowFieldForm(false)}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} />
          <div onClick={e => e.stopPropagation()} style={{ position: "relative", width: 380, background: T.surface, borderRadius: 12, border: `1px solid ${T.border}`, padding: 24, zIndex: 101 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>New Custom Field</h3>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.text3, marginBottom: 4, display: "block" }}>Name</label>
              <input autoFocus value={fieldForm.name} onChange={e => setFieldForm(p => ({ ...p, name: e.target.value }))}
                onKeyDown={e => { if (e.key === "Enter") createCustomField(); }}
                placeholder="Field name…" style={{ width: "100%", padding: "8px 12px", fontSize: 13, color: T.text, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, outline: "none", fontFamily: "inherit" }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.text3, marginBottom: 4, display: "block" }}>Type</label>
              <select value={fieldForm.field_type} onChange={e => setFieldForm(p => ({ ...p, field_type: e.target.value }))}
                style={{ padding: "8px 12px", fontSize: 13, color: T.text, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, outline: "none", fontFamily: "inherit" }}>
                <option value="text">Text</option><option value="number">Number</option><option value="date">Date</option>
                <option value="checkbox">Checkbox</option><option value="select">Dropdown</option>
              </select>
            </div>
            {fieldForm.field_type === "select" && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: T.text3, marginBottom: 4, display: "block" }}>Options (comma separated)</label>
                <input value={fieldForm.options} onChange={e => setFieldForm(p => ({ ...p, options: e.target.value }))}
                  placeholder="Option A, Option B, Option C" style={{ width: "100%", padding: "8px 12px", fontSize: 13, color: T.text, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, outline: "none", fontFamily: "inherit" }} />
              </div>
            )}
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setShowFieldForm(false)} style={{ padding: "8px 16px", fontSize: 13, fontWeight: 600, borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text3, cursor: "pointer" }}>Cancel</button>
              <button onClick={createCustomField} style={{ padding: "8px 16px", fontSize: 13, fontWeight: 600, borderRadius: 6, border: "none", background: T.accent, color: "#fff", cursor: "pointer", opacity: fieldForm.name.trim() ? 1 : 0.5 }}>Create</button>
            </div>
            {/* Existing fields list */}
            {customFields.length > 0 && (
              <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.text3, marginBottom: 6 }}>EXISTING FIELDS</div>
                {customFields.map(cf => (
                  <div key={cf.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0", fontSize: 12, color: T.text2 }}>
                    <span>🏷️ {cf.name} <span style={{ color: T.text3, fontSize: 10 }}>({cf.field_type})</span></span>
                    <button onClick={() => deleteCustomField(cf.id)} style={{ background: "none", border: "none", color: "#ef4444", fontSize: 11, cursor: "pointer" }}>Delete</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
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