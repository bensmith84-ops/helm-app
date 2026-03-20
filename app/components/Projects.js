"use client";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useModal } from "../lib/modal";
import { useResponsive } from "../lib/responsive";

// Filter persistence handled inside component via useEffect
import { T } from "../tokens";
import { useResizableColumns } from "../lib/useResizableColumns";
import SearchableMultiSelect from "./SearchableSelect";
import { STATUS, PRIORITY, SECTION_COLORS, AVATAR_COLORS } from "./projectConfig";

const TABS = ["Info", "List", "Board", "Timeline", "Calendar", "Updates", "Docs", "Rules"];
const toDateStr = (d) => d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
const isOverdue = (d) => d && new Date(d) < new Date() && new Date(d).toDateString() !== new Date().toDateString();

export default function ProjectsView({ pendingTaskId, clearPendingTask }) {
  const { user, profile } = useAuth();
  const { isMobile, isTablet } = useResponsive();
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
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [hoveredRow, setHoveredRow] = useState(null);
  const [editingSectionId, setEditingSectionId] = useState(null);
  const [editingSectionName, setEditingSectionName] = useState("");
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editingTaskTitle, setEditingTaskTitle] = useState("");
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const [expandedTasks, setExpandedTasks] = useState({});
  const [toast, setToast] = useState(null);
  const [dragTask, setDragTask] = useState(null);
  const [dragOverTarget, setDragOverTarget] = useState(null);
  const [addingSubtaskTo, setAddingSubtaskTo] = useState(null);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [projectForm, setProjectForm] = useState({ name: "", description: "", color: "#3b82f6", status: "active", visibility: "private", join_policy: "invite_only", team_id: "", objective_id: "", owner_id: "", start_date: "", target_end_date: "", default_view: "List", plm_program_id: "", members: [] });
  const [teams, setTeams] = useState([]);
  const [objectives, setObjectives] = useState([]);
  const [allProfiles, setAllProfiles] = useState([]);
  const [formStep, setFormStep] = useState(1);
  // Filter state with persistence
  const [filterStatus, _setFS] = useState("all");
  const [filterPriority, _setFP] = useState("all");
  const [filtersLoaded, setFiltersLoaded] = useState(false);
  useEffect(() => {
    try {
      const s = localStorage.getItem("helm_fS");
      const p = localStorage.getItem("helm_fP");
      if (s) _setFS(JSON.parse(s));
      if (p) _setFP(JSON.parse(p));
    } catch {}
    setFiltersLoaded(true);
  }, []);
  const setFilterStatus = (v) => { _setFS(v); try { localStorage.setItem("helm_fS", JSON.stringify(v)); } catch {} };
  const setFilterPriority = (v) => { _setFP(v); try { localStorage.setItem("helm_fP", JSON.stringify(v)); } catch {} };
  const [filterAssignee, setFilterAssignee] = useState([]);
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
  const [showMyTasks, setShowMyTasks] = useState(true);
  const [ctxProject, setCtxProject] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [favorites, setFavorites] = useState(new Set());
  const [projMembersList, setProjMembersList] = useState([]); // [{ project_id, user_id, role }]
  const [showAddMember, setShowAddMember] = useState(false);
  const _profilesRef = useRef({});
  // Labels
  const [labels, setLabels] = useState([]); // all org labels
  const [labelAssignments, setLabelAssignments] = useState([]); // task_id <-> label_id
  // Custom fields - uses existing customFields/customFieldValues state above
  const [showFieldSettings, setShowFieldSettings] = useState(false);
  const [plmPrograms, setPlmPrograms] = useState([]); // PLM programs for linking
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
  // Rules engine
  const [rules, setRules] = useState([]);
  const [showRuleBuilder, setShowRuleBuilder] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [ruleForm, setRuleForm] = useState({ name: "", trigger_type: "task_moved_to_section", trigger_config: {}, actions: [] });

  const showToast = useCallback((msg, type = "error") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); }, []);
  const toggleFavorite = async (projectId, e) => {
    e?.stopPropagation();
    const isFav = favorites.has(projectId);
    if (isFav) {
      setFavorites(p => { const n = new Set(p); n.delete(projectId); return n; });
      await supabase.from("project_favorites").delete().eq("user_id", user?.id).eq("project_id", projectId);
    } else {
      setFavorites(p => new Set(p).add(projectId));
      await supabase.from("project_favorites").insert({ user_id: user?.id, project_id: projectId });
    }
  };
  const archiveProject = async (id) => { const { error } = await supabase.from("projects").update({ status: "archived" }).eq("id", id); if (error) return showToast("Failed to archive"); setProjects(p => p.map(pr => pr.id === id ? { ...pr, status: "archived" } : pr)); if (activeProject === id) setActiveProject(null); showToast("Project archived", "success"); };
  const unarchiveProject = async (id) => { const { error } = await supabase.from("projects").update({ status: "active" }).eq("id", id); if (error) return showToast("Failed to restore"); setProjects(p => p.map(pr => pr.id === id ? { ...pr, status: "active" } : pr)); showToast("Project restored", "success"); };
  const deleteProject = async (id) => { const name = projects.find(p => p.id === id)?.name || "this project"; if (!window.confirm(`Delete "${name}"? This will permanently remove the project and all its tasks. This cannot be undone.`)) return; const { error } = await supabase.from("projects").delete().eq("id", id); if (error) return showToast("Failed to delete: " + error.message); setProjects(p => p.filter(pr => pr.id !== id)); setTasks(p => p.filter(t => t.project_id !== id)); setSections(p => p.filter(s => s.project_id !== id)); if (activeProject === id) { setActiveProject(null); setSelectedTask(null); } showToast("Project deleted", "success"); };
  const ini = (uid) => { const u = _profilesRef.current[uid]; return u?.display_name ? u.display_name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() : "?"; };
  const iniName = (name) => name ? name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() : "?";
  const acol = (uid) => uid ? AVATAR_COLORS[uid.charCodeAt(uid.length - 1) % AVATAR_COLORS.length] : T.text3;
  const uname = (uid) => _profilesRef.current[uid]?.display_name || "";
  const secColor = (i) => SECTION_COLORS[i % SECTION_COLORS.length];
  const timeAgo = (ds) => { const m = Math.floor((Date.now() - new Date(ds).getTime()) / 60000); if (m < 1) return "just now"; if (m < 60) return m + "m ago"; const h = Math.floor(m / 60); if (h < 24) return h + "h ago"; return Math.floor(h / 24) + "d ago"; };
  const formatFileSize = (b) => { if (!b) return "0 B"; const k = 1024; const s = ["B", "KB", "MB", "GB"]; const i = Math.floor(Math.log(b) / Math.log(k)); return parseFloat((b / Math.pow(k, i)).toFixed(1)) + " " + s[i]; };
  const getFileUrl = (path) => `https://upbjdmnykheubxkuknuj.supabase.co/storage/v1/object/public/attachments/${path}`;
  useEffect(() => {
    if (!profile?.org_id) return;
    const load = async () => {
      setLoading(true);
      try {
        const [pR, sR, tR, prR, tmR, obR, favR, pmR, permR, allPmR] = await Promise.all([
          supabase.from("projects").select("*").eq("org_id", profile.org_id).is("deleted_at", null).order("name"),
          supabase.from("sections").select("*").order("sort_order"),
          supabase.from("tasks").select("*").eq("org_id", profile.org_id).is("deleted_at", null).order("sort_order"),
          supabase.from("profiles").select("*").eq("org_id", profile.org_id),
          supabase.from("teams").select("*").eq("org_id", profile.org_id).is("deleted_at", null).order("name"),
          supabase.from("objectives").select("*").eq("org_id", profile.org_id).is("deleted_at", null).order("title"),
          supabase.from("project_favorites").select("project_id").eq("user_id", user?.id),
          supabase.from("project_members").select("project_id, user_id, role").eq("user_id", user?.id),
          supabase.from("user_module_permissions").select("is_admin").eq("user_id", user?.id).maybeSingle(),
          supabase.from("project_members").select("project_id, user_id, role"),
        ]);
        // Filter projects by visibility: public visible to all, private only to members/owner/admin
        const isAdmin = permR.data?.is_admin === true;
        const myMemberProjects = new Set((pmR.data || []).map(pm => pm.project_id));
        const visibleProjects = isAdmin ? (pR.data || []) : (pR.data || []).filter(p => 
          p.visibility === "public" || p.owner_id === user?.id || p.created_by === user?.id || myMemberProjects.has(p.id)
        );
        setProjects(visibleProjects); setSections(sR.data || []); setTasks(tR.data || []);
        setTeams(tmR.data || []); setObjectives(obR.data || []); setAllProfiles(prR.data || []);
        setFavorites(new Set((favR.data || []).map(f => f.project_id)));
        setProjMembersList(allPmR.data || []);
        const m = {}; (prR.data || []).forEach(u => { m[u.id] = u; }); setProfiles(m);
        if (!activeProject && pR.data?.length) setActiveProject(pR.data[0].id);
        // Load labels, assignments, custom fields
        const [lblR, lblAR] = await Promise.all([
          supabase.from("task_labels").select("*").order("name"),
          supabase.from("task_label_assignments").select("*"),
        ]);
        setLabels(lblR.data || []);
        setLabelAssignments(lblAR.data || []);
        // Load PLM programs for linking
        supabase.from("plm_programs").select("id, name, category, current_stage, brand").is("deleted_at", null).order("name").then(({ data }) => setPlmPrograms(data || []));
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

  // Open a specific task when navigating from Dashboard
  useEffect(() => {
    if (pendingTaskId && tasks.length > 0 && !loading) {
      const task = tasks.find(t => t.id === pendingTaskId);
      if (task) {
        setSelectedTask(task);
        if (task.project_id) {
          setActiveProject(task.project_id);
          setShowMyTasks(false);
        }
        // Stay on My Tasks for personal tasks
      }
      clearPendingTask?.();
    }
  }, [pendingTaskId, tasks, loading]);

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
      supabase.from("project_rules").select("*").eq("project_id", activeProject).order("created_at"),
    ]).then(([dR, cfR, cvR, msR, suR, ruR]) => {
      setDependencies(dR.data || []); setCustomFields(cfR.data || []); setMilestones(msR.data || []); setStatusUpdates(suR.data || []);
      setRules(ruR.data || []);
      const cfm = {}; (cvR.data || []).forEach(v => { if (!cfm[v.task_id]) cfm[v.task_id] = {}; cfm[v.task_id][v.field_id] = v.value; }); setCustomFieldValues(cfm);
    });
  }, [activeProject]);

  const proj = projects.find(p => p.id === activeProject);
  const projSections = useMemo(() => sections.filter(s => s.project_id === activeProject).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)), [sections, activeProject]);
  const projTasks = useMemo(() => tasks.filter(t => t.project_id === activeProject), [tasks, activeProject]);
  const filteredTasks = useMemo(() => projTasks.filter(t => {
    if (search) { const s = search.toLowerCase(); const nameMatch = t.assignee_id && profiles[t.assignee_id]?.display_name?.toLowerCase().includes(s); if (!t.title?.toLowerCase().includes(s) && !nameMatch) return false; }
    if (filterStatus !== "all" && filterStatus.length && !filterStatus.includes(t.status)) return false;
    if (filterPriority !== "all" && filterPriority.length && !filterPriority.includes(t.priority)) return false;
    if (filterAssignee.length && !filterAssignee.includes(t.assignee_id)) return false;
    return true;
  }), [projTasks, search, filterStatus, filterPriority, filterAssignee]);

  useEffect(() => {
    const fn = (e) => {
      const tag = document.activeElement?.tagName;
      const isInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || document.activeElement?.contentEditable === "true";

      if (e.key === "Escape") {
        if (sectionCtxMenu) { setSectionCtxMenu(null); return; }
        if (ctxProject) { setCtxProject(null); return; }
        if (showProjectForm) { setShowProjectForm(false); return; }
        if (selectedTask) { setSelectedTask(null); return; }
        if (editingSectionId) { setEditingSectionId(null); return; }
        if (addingTo) { setAddingTo(null); setNewTitle(""); return; }
        if (selectedTasks.size > 0) { setSelectedTasks(new Set()); return; }
      }

      if (isInput) return; // Don't trigger shortcuts when typing

      const allRootTasks = filteredTasks.filter(t => !t.parent_task_id);
      const curIdx = selectedTask ? allRootTasks.findIndex(t => t.id === selectedTask.id) : -1;

      switch (e.key) {
        case "j": case "ArrowDown":
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            const next = allRootTasks[Math.min(curIdx + 1, allRootTasks.length - 1)];
            if (next) setSelectedTask(next);
          }
          break;
        case "k": case "ArrowUp":
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            const prev = allRootTasks[Math.max(curIdx - 1, 0)];
            if (prev) setSelectedTask(prev);
          }
          break;
        case " ":
          if (selectedTask) {
            e.preventDefault();
            toggleDone(selectedTask);
          }
          break;
        case "Enter":
          if (selectedTask) {
            e.preventDefault();
            setSelectedTask(selectedTask); // opens detail panel
          }
          break;
        case "n":
          if (!e.metaKey && projSections.length > 0) {
            e.preventDefault();
            setAddingTo(projSections[0].id);
            setNewTitle("");
          }
          break;
        case "f":
          e.preventDefault();
          document.querySelector('[placeholder*="Search"]')?.focus();
          break;
        case "1": setViewMode("List"); break;
        case "2": setViewMode("Board"); break;
        case "3": setViewMode("Timeline"); break;
        case "?":
          setShowKeyboardHelp(v => !v);
          break;
      }
    };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [showProjectForm, selectedTask, editingSectionId, addingTo, filteredTasks, projSections, selectedTasks, sectionCtxMenu, ctxProject]);
  const rootTasks = (secTasks) => secTasks.filter(t => !t.parent_task_id);
  const getSubtasks = (pid) => filteredTasks.filter(t => t.parent_task_id === pid);

  // Label helpers
  const getTaskLabels = (taskId) => {
    const assignedIds = labelAssignments.filter(a => a.task_id === taskId).map(a => a.label_id);
    return labels.filter(l => assignedIds.includes(l.id));
  };
  const toggleLabel = async (taskId, labelId) => {
    const existing = labelAssignments.find(a => a.task_id === taskId && a.label_id === labelId);
    if (existing) {
      await supabase.from("task_label_assignments").delete().eq("id", existing.id);
      setLabelAssignments(p => p.filter(a => a.id !== existing.id));
    } else {
      const { data } = await supabase.from("task_label_assignments").insert({ task_id: taskId, label_id: labelId }).select().single();
      if (data) setLabelAssignments(p => [...p, data]);
    }
  };
  const createLabel = async (name, color) => {
    const { data } = await supabase.from("task_labels").insert({ name, color, org_id: profile?.org_id || "a0000000-0000-0000-0000-000000000001" }).select().single();
    if (data) setLabels(p => [...p, data]);
    return data;
  };
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
  const createTask = async (sid) => { if (!newTitle.trim()) return; const st = tasks.filter(t => t.section_id === sid && !t.parent_task_id); const mx = st.reduce((m, t) => Math.max(m, t.sort_order || 0), 0); const { data, error } = await supabase.from("tasks").insert({ org_id: profile.org_id, project_id: activeProject, section_id: sid, title: newTitle.trim(), status: "todo", priority: "none", sort_order: mx + 1, created_by: user.id }).select().single(); if (error) return showToast("Failed to create task"); setTasks(p => [...p, data]); setNewTitle(""); showToast("Task created", "success"); executeRules(data.id, "__created", true, null, data); };
  const createStandaloneTask = async (title) => { if (!title?.trim() || !profile?.org_id) return; const { data, error } = await supabase.from("tasks").insert({ org_id: profile.org_id, title: title.trim(), status: "todo", priority: "none", assignee_id: user.id, sort_order: 0, created_by: user.id }).select().single(); if (error) return showToast("Failed to create task"); setTasks(p => [...p, data]); showToast("Personal task created", "success"); };
  const createSubtask = async (parentTask, titleOverride) => { const title = titleOverride || _newSubTitleRef.current || newSubtaskTitle; if (!title.trim()) return; const currentTasks = _tasksRef.current; const mx = currentTasks.filter(t => t.parent_task_id === parentTask.id).reduce((m, t) => Math.max(m, t.sort_order || 0), 0); const { data, error } = await supabase.from("tasks").insert({ org_id: profile.org_id, project_id: activeProject, section_id: parentTask.section_id, parent_task_id: parentTask.id, title: title.trim(), status: "todo", priority: "none", sort_order: mx + 1, created_by: user.id }).select().single(); if (error) return showToast("Failed to create subtask"); setTasks(p => [...p, data]); setExpandedTasks(p => ({ ...p, [parentTask.id]: true })); setNewSubtaskTitle(""); setAddingSubtaskTo(null); executeRules(data.id, "__created", true, null, data); };
  const startAddSubtask = (task, e) => { e?.stopPropagation(); setAddingSubtaskTo(task.id); setNewSubtaskTitle(""); setExpandedTasks(p => ({ ...p, [task.id]: true })); };
  const updateField = async (taskId, field, value) => { const old = tasks.find(t => t.id === taskId); setTasks(p => p.map(t => t.id === taskId ? { ...t, [field]: value } : t)); if (selectedTask?.id === taskId) setSelectedTask(p => ({ ...p, [field]: value })); const ups = { [field]: value, updated_at: new Date().toISOString() }; if (field === "status" && value === "done") ups.completed_at = new Date().toISOString(); if (field === "status" && old?.status === "done" && value !== "done") ups.completed_at = null; const { error } = await supabase.from("tasks").update(ups).eq("id", taskId); if (error) { showToast("Update failed"); setTasks(p => p.map(t => t.id === taskId ? old : t)); return; } if (field === "status") { const updatedTasks = tasks.map(t => t.id === taskId ? { ...t, [field]: value } : t); syncProjectProgress(old?.project_id || activeProject, updatedTasks); } executeRules(taskId, field, value, old?.[field]); };
  const toggleDone = async (task, e) => {
    e?.stopPropagation();
    const newStatus = task.status === "done" ? "todo" : "done";
    await updateField(task.id, "status", newStatus);
    // Handle recurring tasks
    if (newStatus === "done" && task.recurrence && task.recurrence !== "none") {
      const mode = task.recurrence_mode || "on_date";
      const rec = task.recurrence; // daily, weekly, biweekly, monthly, quarterly
      const calcNext = (from) => {
        const d = new Date(from || new Date());
        if (rec === "daily") d.setDate(d.getDate() + 1);
        else if (rec === "weekly") d.setDate(d.getDate() + 7);
        else if (rec === "biweekly") d.setDate(d.getDate() + 14);
        else if (rec === "monthly") d.setMonth(d.getMonth() + 1);
        else if (rec === "quarterly") d.setMonth(d.getMonth() + 3);
        return d.toISOString().split("T")[0];
      };
      const endDate = task.recurrence_end_date;
      const nextDue = mode === "on_complete" ? calcNext(new Date()) : calcNext(task.due_date || new Date());
      if (endDate && nextDue > endDate) return; // past end date, don't create
      const { data: newTask } = await supabase.from("tasks").insert({
        org_id: task.org_id, project_id: task.project_id, section_id: task.section_id,
        title: task.title, status: "todo", priority: task.priority,
        assignee_id: task.assignee_id, due_date: nextDue,
        start_date: task.start_date ? calcNext(task.start_date) : null,
        recurrence: task.recurrence, recurrence_mode: task.recurrence_mode,
        recurrence_end_date: task.recurrence_end_date,
        recurring_parent_id: task.recurring_parent_id || task.id,
        sort_order: (task.sort_order || 0) + 1, created_by: user?.id,
      }).select().single();
      if (newTask) {
        setTasks(p => [...p, newTask]);
        showToast(`Recurring task created for ${new Date(nextDue).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`, "success");
      }
    }
  };
  const deleteTask = async (taskId) => { const ok = await showConfirm("Delete Task", "Are you sure?"); if (!ok) return; await supabase.from("tasks").update({ deleted_at: new Date().toISOString() }).eq("id", taskId); setTasks(p => p.filter(t => t.id !== taskId)); if (selectedTask?.id === taskId) setSelectedTask(null); };
  const duplicateTask = async (task) => { const mx = tasks.filter(t => t.section_id === task.section_id && !t.parent_task_id).reduce((m, t) => Math.max(m, t.sort_order || 0), 0); const { data, error } = await supabase.from("tasks").insert({ org_id: profile.org_id, project_id: activeProject, section_id: task.section_id, title: task.title + " (copy)", status: task.status, priority: task.priority, assignee_id: task.assignee_id, due_date: task.due_date, sort_order: mx + 1, created_by: user.id }).select().single(); if (!error && data) { setTasks(p => [...p, data]); executeRules(data.id, "__created", true, null, data); } };
  const createSection = async () => { if (!newSectionName.trim()) return; const mx = projSections.reduce((m, s) => Math.max(m, s.sort_order || 0), 0); const { data, error } = await supabase.from("sections").insert({ project_id: activeProject, name: newSectionName.trim(), sort_order: mx + 1 }).select().single(); if (!error && data) setSections(p => [...p, data]); setNewSectionName(""); setAddingSection(false); };
  const renameSection = async (secId) => { if (!editingSectionName.trim()) return; await supabase.from("sections").update({ name: editingSectionName.trim() }).eq("id", secId); setSections(p => p.map(s => s.id === secId ? { ...s, name: editingSectionName.trim() } : s)); setEditingSectionId(null); };
  const deleteSection = async (secId) => { const st = tasks.filter(t => t.section_id === secId); const ok = await showConfirm("Delete Section", st.length ? `Delete ${st.length} task(s) too?` : "Delete this section?"); if (!ok) return; if (st.length) await supabase.from("tasks").update({ deleted_at: new Date().toISOString() }).eq("section_id", secId); await supabase.from("sections").delete().eq("id", secId); setSections(p => p.filter(s => s.id !== secId)); setTasks(p => p.filter(t => t.section_id !== secId)); };
  const moveSection = async (secId, direction) => {
    const idx = projSections.findIndex(s => s.id === secId);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= projSections.length) return;
    const a = projSections[idx];
    const b = projSections[swapIdx];
    const newOrderA = b.sort_order ?? swapIdx;
    const newOrderB = a.sort_order ?? idx;
    setSections(p => p.map(s => s.id === a.id ? { ...s, sort_order: newOrderA } : s.id === b.id ? { ...s, sort_order: newOrderB } : s));
    await Promise.all([
      supabase.from("sections").update({ sort_order: newOrderA }).eq("id", a.id),
      supabase.from("sections").update({ sort_order: newOrderB }).eq("id", b.id),
    ]);
  };
  const openNewProject = () => { setProjectForm({ name: "", description: "", color: "#3b82f6", status: "active", visibility: "private", join_policy: "invite_only", team_id: "", objective_id: "", owner_id: user?.id || "", start_date: "", target_end_date: "", default_view: "List", plm_program_id: "", members: [] }); setFormStep(1); setShowProjectForm("new"); };
  const openEditProject = () => { if (!proj) return; setProjectForm({ name: proj.name, description: proj.description || "", color: proj.color || "#3b82f6", status: proj.status || "active", visibility: proj.visibility || "private", join_policy: proj.join_policy || "invite_only", team_id: proj.team_id || "", objective_id: proj.objective_id || "", owner_id: proj.owner_id || "", start_date: proj.start_date || "", target_end_date: proj.target_end_date || "", default_view: proj.default_view || "List", plm_program_id: proj.plm_program_id || "", members: [] }); setFormStep(1); setShowProjectForm("edit"); };
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

  const saveProject = async () => { if (!projectForm.name.trim()) return showToast("Name required"); if (!profile?.org_id) return showToast("No organization found"); const payload = { name: projectForm.name.trim(), description: projectForm.description || "", color: projectForm.color || "#3b82f6", status: projectForm.status || "active", visibility: projectForm.visibility || "private", join_policy: projectForm.join_policy || "invite_only", team_id: projectForm.team_id || null, objective_id: projectForm.objective_id || null, owner_id: projectForm.owner_id || null, start_date: projectForm.start_date || null, target_end_date: projectForm.target_end_date || null, default_view: projectForm.default_view || "List", plm_program_id: projectForm.plm_program_id || null }; if (showProjectForm === "new") { payload.org_id = profile.org_id; payload.created_by = profile?.id || null; console.log("Creating project with payload:", JSON.stringify(payload)); const { data, error } = await supabase.from("projects").insert(payload).select().single(); if (error) { console.error("Project create error:", error); return showToast("Failed: " + (error.message || error.details || "Unknown error")); } setProjects(p => [...p, data]); setActiveProject(data.id); for (let i = 0; i < 3; i++) { const n = ["To Do", "In Progress", "Done"][i]; const { data: sec } = await supabase.from("sections").insert({ project_id: data.id, name: n, sort_order: i + 1 }).select().single(); if (sec) setSections(p => [...p, sec]); } if (projectForm.members.length > 0) { for (const uid of projectForm.members) { await supabase.from("project_members").insert({ project_id: data.id, user_id: uid, role: "member" }); } } if (projectForm.owner_id) { const exists = projectForm.members.includes(projectForm.owner_id); if (!exists) await supabase.from("project_members").insert({ project_id: data.id, user_id: projectForm.owner_id, role: "owner" }); } } else { const { error } = await supabase.from("projects").update(payload).eq("id", activeProject); if (error) { console.error("Project update error:", error); return showToast("Failed: " + (error.message || error.details || "Unknown error")); } setProjects(p => p.map(pr => pr.id === activeProject ? { ...pr, ...payload } : pr)); } setShowProjectForm(false); showToast(showProjectForm === "new" ? "Project created" : "Project updated", "success"); };
  const addComment = async () => { if (!newComment.trim() || !selectedTask) return; const { data, error } = await supabase.from("comments").insert({ org_id: profile.org_id, entity_type: "task", entity_id: selectedTask.id, author_id: user.id, content: newComment.trim() }).select().single(); if (!error && data) setComments(p => [...p, data]); setNewComment(""); };
  const uploadAttachment = async (file) => { if (!selectedTask) return; const path = `${profile.org_id}/${selectedTask.id}/${Date.now()}_${file.name}`; const { error: ue } = await supabase.storage.from("attachments").upload(path, file); if (ue) return showToast("Upload failed"); const { data, error } = await supabase.from("attachments").insert({ org_id: profile.org_id, entity_type: "task", entity_id: selectedTask.id, filename: file.name, file_path: path, file_size: file.size, mime_type: file.type, uploaded_by: user.id }).select().single(); if (!error && data) setAttachments(p => [...p, data]); };
  const deleteAttachment = async (att) => { await supabase.storage.from("attachments").remove([att.file_path]); await supabase.from("attachments").delete().eq("id", att.id); setAttachments(p => p.filter(a => a.id !== att.id)); };
  const addDependency = async (pre, suc) => { if (pre === suc || dependencies.some(d => d.predecessor_id === pre && d.successor_id === suc)) return; const { data, error } = await supabase.from("task_dependencies").insert({ predecessor_id: pre, successor_id: suc, dependency_type: "finish_to_start" }).select().single(); if (!error && data) setDependencies(p => [...p, data]); };
  const removeDependency = async (depId) => { await supabase.from("task_dependencies").delete().eq("id", depId); setDependencies(p => p.filter(d => d.id !== depId)); };
  const [showCFCreate, setShowCFCreate] = useState(false);
  const [cfForm, setCfForm] = useState({ name: "", field_type: "text", currency_prefix: "$", options: [] });
  const FIELD_TYPES = [
    { key: "text", label: "Text", icon: "Aa" },
    { key: "number", label: "Number", icon: "#" },
    { key: "currency", label: "Currency", icon: "$" },
    { key: "date", label: "Date", icon: "📅" },
    { key: "select", label: "Dropdown", icon: "▾" },
    { key: "checkbox", label: "Checkbox", icon: "☑" },
    { key: "url", label: "URL", icon: "🔗" },
    { key: "email", label: "Email", icon: "✉" },
    { key: "percent", label: "Percent", icon: "%" },
    { key: "rating", label: "Rating", icon: "⭐" },
  ];
  const CURRENCY_PREFIXES = ["$", "€", "£", "¥", "₹", "A$", "C$", "CHF", "R$", "₩"];
  const createCustomField = async () => {
    if (!cfForm.name.trim()) return;
    const mx = customFields.reduce((m, f) => Math.max(m, f.sort_order || 0), 0);
    const opts = {};
    if (cfForm.field_type === "currency") opts.currency_prefix = cfForm.currency_prefix || "$";
    if (cfForm.field_type === "select" && cfForm.options.length) opts.choices = cfForm.options;
    const { data, error } = await supabase.from("custom_fields").insert({
      project_id: activeProject, name: cfForm.name.trim(), field_type: cfForm.field_type,
      options: Object.keys(opts).length ? opts : null, sort_order: mx + 1,
    }).select().single();
    if (!error && data) setCustomFields(p => [...p, data]);
    setCfForm({ name: "", field_type: "text", currency_prefix: "$", options: [] });
    setShowCFCreate(false);
  };
  const deleteCustomField = async (cfId) => {
    await supabase.from("custom_field_values").delete().eq("field_id", cfId);
    await supabase.from("custom_fields").delete().eq("id", cfId);
    setCustomFields(p => p.filter(f => f.id !== cfId));
  };
  const updateCustomFieldValue = async (taskId, fieldId, value) => { setCustomFieldValues(p => ({ ...p, [taskId]: { ...(p[taskId] || {}), [fieldId]: value } })); const ex = await supabase.from("custom_field_values").select("id").eq("task_id", taskId).eq("field_id", fieldId).single(); if (ex.data) { await supabase.from("custom_field_values").update({ value }).eq("id", ex.data.id); } else { await supabase.from("custom_field_values").insert({ task_id: taskId, field_id: fieldId, value }); } };
  // ═══ Rules Engine ═══
  const TRIGGER_TYPES = [
    { key: "task_moved_to_section", label: "Task moved to section", icon: "→", configFields: ["section_id"] },
    { key: "status_changed", label: "Status changed to", icon: "◉", configFields: ["status"] },
    { key: "task_completed", label: "Task marked complete", icon: "✓", configFields: [] },
    { key: "task_assigned", label: "Task assigned to", icon: "👤", configFields: ["assignee_id"] },
    { key: "priority_changed", label: "Priority set to", icon: "!", configFields: ["priority"] },
    { key: "due_date_approaching", label: "Due date approaching", icon: "📅", configFields: ["days_before"] },
    { key: "task_created", label: "Task created", icon: "+", configFields: [] },
    { key: "custom_field_changed", label: "Custom field changed", icon: "✦", configFields: ["field_id", "value"] },
  ];
  const ACTION_TYPES = [
    { key: "set_status", label: "Set status", icon: "◉", configFields: ["status"] },
    { key: "move_to_section", label: "Move to section", icon: "→", configFields: ["section_id"] },
    { key: "set_assignee", label: "Set assignee", icon: "👤", configFields: ["assignee_id"] },
    { key: "set_priority", label: "Set priority", icon: "!", configFields: ["priority"] },
    { key: "mark_complete", label: "Mark complete", icon: "✓", configFields: [] },
    { key: "add_comment", label: "Add comment", icon: "💬", configFields: ["comment"] },
    { key: "set_due_date_offset", label: "Set due date", icon: "📅", configFields: ["days_offset"] },
    { key: "set_custom_field", label: "Set custom field", icon: "✦", configFields: ["field_id", "value"] },
  ];

  const saveRule = async () => {
    if (!ruleForm.name.trim() || !ruleForm.trigger_type || ruleForm.actions.length === 0) return showToast("Rule needs a name, trigger, and at least one action");
    const payload = {
      project_id: activeProject, name: ruleForm.name.trim(), description: ruleForm.description || "",
      trigger_type: ruleForm.trigger_type, trigger_config: ruleForm.trigger_config || {},
      actions: ruleForm.actions, is_active: true, created_by: user?.id,
    };
    if (editingRule) {
      const { error } = await supabase.from("project_rules").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", editingRule.id);
      if (error) return showToast("Failed: " + error.message);
      setRules(p => p.map(r => r.id === editingRule.id ? { ...r, ...payload } : r));
    } else {
      const { data, error } = await supabase.from("project_rules").insert(payload).select().single();
      if (error) return showToast("Failed: " + error.message);
      setRules(p => [...p, data]);
    }
    setShowRuleBuilder(false); setEditingRule(null);
    setRuleForm({ name: "", trigger_type: "task_moved_to_section", trigger_config: {}, actions: [] });
    showToast(editingRule ? "Rule updated" : "Rule created", "success");
  };

  const deleteRule = async (ruleId) => {
    if (!window.confirm("Delete this rule?")) return;
    await supabase.from("project_rules").delete().eq("id", ruleId);
    setRules(p => p.filter(r => r.id !== ruleId));
    showToast("Rule deleted", "success");
  };

  const toggleRule = async (ruleId) => {
    const rule = rules.find(r => r.id === ruleId);
    if (!rule) return;
    const { error } = await supabase.from("project_rules").update({ is_active: !rule.is_active }).eq("id", ruleId);
    if (!error) setRules(p => p.map(r => r.id === ruleId ? { ...r, is_active: !r.is_active } : r));
  };

  const executeRules = async (taskId, field, value, oldValue, taskOverride) => {
    const activeRules = rules.filter(r => r.is_active);
    if (!activeRules.length) return;
    const task = taskOverride || tasks.find(t => t.id === taskId);
    if (!task) return;

    for (const rule of activeRules) {
      let shouldFire = false;
      const tc = rule.trigger_config || {};

      switch (rule.trigger_type) {
        case "task_moved_to_section":
          shouldFire = field === "section_id" && (!tc.section_id && !(tc.section_ids?.length) || tc.section_id === value || (tc.section_ids || []).includes(value));
          break;
        case "status_changed":
          shouldFire = field === "status" && (!tc.status && !(tc.statuses?.length) || tc.status === value || (tc.statuses || []).includes(value));
          break;
        case "task_completed":
          shouldFire = field === "status" && value === "done" && oldValue !== "done";
          break;
        case "task_assigned":
          shouldFire = field === "assignee_id" && (!tc.assignee_id && !(tc.assignee_ids?.length) || tc.assignee_id === value || (tc.assignee_ids || []).includes(value));
          break;
        case "priority_changed":
          shouldFire = field === "priority" && (!tc.priority && !(tc.priorities?.length) || tc.priority === value || (tc.priorities || []).includes(value));
          break;
        case "task_created":
          shouldFire = field === "__created";
          break;
        case "custom_field_changed":
          shouldFire = field === "custom_field" && (!tc.field_id || tc.field_id === oldValue);
          break;
      }

      if (!shouldFire) continue;

      // Execute actions
      const executed = [];
      for (const action of (rule.actions || [])) {
        const ac = action.config || {};
        try {
          switch (action.type) {
            case "set_status":
              if (ac.status) await updateField(taskId, "status", ac.status);
              break;
            case "move_to_section":
              if (ac.section_id) await updateField(taskId, "section_id", ac.section_id);
              break;
            case "set_assignee":
              await updateField(taskId, "assignee_id", ac.assignee_id || null);
              break;
            case "set_priority":
              if (ac.priority) await updateField(taskId, "priority", ac.priority);
              break;
            case "mark_complete":
              await updateField(taskId, "status", "done");
              break;
            case "add_comment":
              if (ac.comment) {
                await supabase.from("comments").insert({
                  org_id: profile.org_id, entity_type: "task", entity_id: taskId,
                  author_id: user.id, content: `🤖 Auto: ${ac.comment}`,
                });
              }
              break;
            case "set_due_date_offset":
              if (ac.days_offset != null) {
                const d = new Date(); d.setDate(d.getDate() + Number(ac.days_offset));
                await updateField(taskId, "due_date", d.toISOString().split("T")[0]);
              }
              break;
            case "set_custom_field":
              if (ac.field_id) await updateCustomFieldValue(taskId, ac.field_id, ac.value || "");
              break;
          }
          executed.push({ type: action.type, success: true });
        } catch (err) {
          executed.push({ type: action.type, success: false, error: err.message });
        }
      }

      // Log execution
      await supabase.from("rule_executions").insert({
        rule_id: rule.id, task_id: taskId,
        trigger_data: { field, value, old_value: oldValue },
        actions_executed: executed, success: executed.every(e => e.success),
      });
      await supabase.from("project_rules").update({ run_count: (rule.run_count || 0) + 1, last_run_at: new Date().toISOString() }).eq("id", rule.id);
      setRules(p => p.map(r => r.id === rule.id ? { ...r, run_count: (r.run_count || 0) + 1, last_run_at: new Date().toISOString() } : r));
    }
  };

  const handleBoardDrop = async (taskId, newSec) => { await updateField(taskId, "section_id", newSec); setDragTask(null); setDragOverTarget(null); };
  const { gridTemplate: projGrid, onResizeStart: projResize } = useResizableColumns([280, 110, 90, 110, 100], "projects");
  const mobileGrid = "1fr 70px"; // title + status only
  const activeGrid = isMobile ? mobileGrid : projGrid;
  const ResizeHandle = ({ index, onStart }) => isMobile ? null : (<div onMouseDown={(e) => onStart(index, e)} style={{ position: "absolute", right: -1, top: 4, bottom: 4, width: 3, cursor: "col-resize", zIndex: 2, borderRadius: 2, background: T.border + "60", transition: "background 0.15s" }} onMouseEnter={e => e.currentTarget.style.background = T.accent} onMouseLeave={e => e.currentTarget.style.background = T.border + "60"} />);

  const S = {
    pill: { display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer" },
    iconBtn: { background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 4, borderRadius: 4, color: T.text3 },
    addRow: { display: "flex", alignItems: "center", gap: 8, padding: "6px 12px 6px 40px", cursor: "pointer", color: T.text3, fontSize: 13, borderRadius: 6 },
    colHdr: { fontSize: 11, fontWeight: 600, color: T.text3, textTransform: "uppercase", letterSpacing: "0.04em", padding: "6px 8px", cursor: "pointer", userSelect: "none", display: "flex", alignItems: "center", gap: 4 },
    row: (hov, sel) => ({ display: "grid", gridTemplateColumns: activeGrid, alignItems: "center", padding: isMobile ? "0 8px" : "0 12px", minHeight: isMobile ? 42 : 36, borderBottom: `1px solid ${T.border}`, background: sel ? T.accentDim : "transparent", cursor: "pointer", transition: "background 0.08s" }),
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
        {/* ★ Favorites */}
        {projects.filter(p => p.status !== "archived" && favorites.has(p.id)).length > 0 && (
          <>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.08em", padding: "8px 10px 4px", display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ color: "#eab308", fontSize: 11 }}>★</span> Favorites
            </div>
            {projects.filter(p => p.status !== "archived" && favorites.has(p.id)).map(p => {
          const pt = tasks.filter(t => t.project_id === p.id && !t.parent_task_id);
          const pd = pt.filter(t => t.status === "done").length;
          const pp = pt.length ? Math.round((pd / pt.length) * 100) : 0;
          const act = activeProject === p.id && !showMyTasks;
          const pToday = new Date().toISOString().split("T")[0];
          const pOverdue = pt.filter(t => t.status !== "done" && t.due_date && t.due_date < pToday).length;
          const pHealth = pOverdue > pt.length * 0.2 ? "#ef4444" : pOverdue > 0 ? "#eab308" : "#22c55e";
          return (
          <div key={p.id} onClick={() => { setActiveProject(p.id); setShowMyTasks(false); setSelectedTask(null); setSearch(""); }}
            onContextMenu={e => { e.preventDefault(); setCtxProject(ctxProject === p.id ? null : p.id); }}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 6, cursor: "pointer", background: act ? T.accentDim : "transparent", marginBottom: 2, position: "relative" }}>
            <div onClick={e => toggleFavorite(p.id, e)} style={{ cursor: "pointer", fontSize: 12, color: "#eab308", flexShrink: 0, lineHeight: 1 }} title="Remove from favorites">★</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: act ? 600 : 400, color: act ? T.accent : T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.emoji || ""} {p.name}</span>
                <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 6px", borderRadius: 10, background: act ? T.accent : T.surface3, color: act ? "#fff" : T.text2, flexShrink: 0 }}>{tasks.filter(t => t.project_id === p.id && t.status !== "done" && !t.parent_task_id).length}</span>
              </div>
              <div style={{ fontSize: 11, color: T.text3, marginTop: 1, display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: pHealth, display: "inline-block" }} />
                {pt.length} tasks · {pp}%
                {pOverdue > 0 && <span style={{ color: "#ef4444" }}>· {pOverdue} late</span>}
              </div>
            </div>
            <div style={{ width: 28, height: 3, borderRadius: 2, background: T.surface3, flexShrink: 0 }}><div style={{ width: `${pp}%`, height: "100%", borderRadius: 2, background: p.color || T.accent, transition: "width 0.4s" }} /></div>
          </div>); })}
            <div style={{ height: 1, background: T.border, margin: "6px 10px" }} />
          </>
        )}
        {/* All Projects */}
        {projects.filter(p => p.status !== "archived" && !favorites.has(p.id)).length > 0 && favorites.size > 0 && (
          <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.08em", padding: "4px 10px 4px" }}>All Projects</div>
        )}
        {projects.filter(p => p.status !== "archived" && (!favorites.size || !favorites.has(p.id))).map(p => {
          const pt = tasks.filter(t => t.project_id === p.id && !t.parent_task_id);
          const pd = pt.filter(t => t.status === "done").length;
          const pp = pt.length ? Math.round((pd / pt.length) * 100) : 0;
          const act = activeProject === p.id && !showMyTasks;
          const pToday = new Date().toISOString().split("T")[0];
          const pOverdue = pt.filter(t => t.status !== "done" && t.due_date && t.due_date < pToday).length;
          const pHealth = pOverdue > pt.length * 0.2 ? "#ef4444" : pOverdue > 0 ? "#eab308" : "#22c55e";
          return (
          <div key={p.id} onClick={() => { setActiveProject(p.id); setShowMyTasks(false); setSelectedTask(null); setSearch(""); }}
            onContextMenu={e => { e.preventDefault(); setCtxProject(ctxProject === p.id ? null : p.id); }}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 6, cursor: "pointer", background: act ? T.accentDim : "transparent", marginBottom: 2, position: "relative" }}>
            <div onClick={e => toggleFavorite(p.id, e)} style={{ cursor: "pointer", fontSize: 12, color: T.text3, flexShrink: 0, lineHeight: 1, opacity: 0.3, transition: "opacity 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.color = "#eab308"; }} onMouseLeave={e => { e.currentTarget.style.opacity = "0.3"; e.currentTarget.style.color = T.text3; }}
              title="Add to favorites">☆</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: act ? 600 : 400, color: act ? T.accent : T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.emoji || ""} {p.name}</span>
                <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 6px", borderRadius: 10, background: act ? T.accent : T.surface3, color: act ? "#fff" : T.text2, flexShrink: 0 }}>{tasks.filter(t => t.project_id === p.id && t.status !== "done" && !t.parent_task_id).length}</span>
              </div>
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
  const projectHeaderEl = (() => { if (!proj) return null;
    const hColor = healthColors[projHealth];
    const hLabel = healthLabels[projHealth];
    return (
    <div style={{ borderBottom: `1px solid ${T.border}`, background: T.surface }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px 8px" }}>
        {!showSidebar && <button onClick={() => setShowSidebar(true)} style={S.iconBtn}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.text2} strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg></button>}
        <div style={{ width: 12, height: 12, borderRadius: 6, background: proj.color || T.accent, flexShrink: 0 }} />
        <h2 style={{ fontSize: 18, fontWeight: 700, color: T.text, margin: 0, flex: 1 }}>{proj.emoji || ""} {proj.name}</h2>
        {/* Project members */}
        {(() => {
          const members = projMembersList.filter(pm => pm.project_id === activeProject);
          const ownerIncluded = members.some(m => m.user_id === proj.owner_id);
          const allMemberIds = ownerIncluded ? members.map(m => m.user_id) : [proj.owner_id, ...members.map(m => m.user_id)].filter(Boolean);
          const uniqueIds = [...new Set(allMemberIds)];
          const maxShow = 5;
          const shown = uniqueIds.slice(0, maxShow);
          const extra = uniqueIds.length - maxShow;
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 0, flexShrink: 0 }}>
              {shown.map((uid, i) => {
                const p = profiles[uid];
                const name = p?.display_name || "?";
                const c = acol(uid);
                const isOwner = uid === proj.owner_id;
                return (
                  <div key={uid} title={`${name}${isOwner ? " (Owner)" : ""}`}
                    style={{ width: 28, height: 28, borderRadius: 14, background: `${c}20`, border: `2px solid ${isOwner ? c : T.surface}`, color: c, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, marginLeft: i > 0 ? -6 : 0, zIndex: maxShow - i, cursor: "default", position: "relative" }}>
                    {ini(uid)}
                  </div>
                );
              })}
              {extra > 0 && <div style={{ width: 28, height: 28, borderRadius: 14, background: T.surface3, border: `2px solid ${T.surface}`, color: T.text3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, marginLeft: -6 }}>+{extra}</div>}
              <button onClick={() => setShowAddMember(true)} title="Manage members"
                style={{ width: 28, height: 28, borderRadius: 14, background: "transparent", border: `1.5px dashed ${T.border}`, color: T.text3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, cursor: "pointer", marginLeft: 4 }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.color = T.accent; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.text3; }}>+</button>
            </div>
          );
        })()}
        {viewMode !== "Info" && <>{/* Visibility + Health badge */}
        <span style={{ ...S.pill, background: proj.visibility === "private" ? "#a855f715" : T.surface2, color: proj.visibility === "private" ? "#a855f7" : T.text3, border: `1px solid ${proj.visibility === "private" ? "#a855f730" : T.border}`, fontSize: 11, fontWeight: 600, gap: 4 }}>
          {proj.visibility === "private" ? "🔒 Private" : "🌐 Public"}
        </span>
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
        </>}
        <button onClick={openEditProject} style={S.iconBtn} title="Edit"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.text3} strokeWidth="2"><path d="M18.4 2.6a2.17 2.17 0 013 3L12 15l-4 1 1-4 9.4-9.4z"/></svg></button>
        <button onClick={() => archiveProject(proj.id)} style={S.iconBtn} title="Archive"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.text3} strokeWidth="2"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg></button>
        <button onClick={() => deleteProject(proj.id)} style={{ ...S.iconBtn, color: T.red }} title="Delete"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button>
        {showSidebar && <button onClick={() => setShowSidebar(false)} style={S.iconBtn} title="Collapse"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.text3} strokeWidth="2"><path d="M11 19l-7-7 7-7"/><path d="M4 12h16"/></svg></button>}
      </div>
      <div style={{ display: "flex", gap: 0, padding: "0 20px", overflow: "auto", alignItems: "center" }}>
        {TABS.map(tab => (<button key={tab} onClick={() => setViewMode(tab)} style={{ padding: "8px 16px", fontSize: 13, fontWeight: viewMode === tab ? 600 : 400, color: viewMode === tab ? T.accent : T.text3, background: "none", border: "none", borderBottom: viewMode === tab ? `2px solid ${T.accent}` : "2px solid transparent", cursor: "pointer", transition: "all 0.15s" }}>{tab}</button>))}
        <div style={{ marginLeft: "auto" }}>
          <button onClick={() => setShowKeyboardHelp(v => !v)} title="Keyboard shortcuts (?)" style={{ ...S.iconBtn, fontSize: 11, color: T.text3, border: `1px solid ${T.border}`, borderRadius: 4, padding: "2px 7px" }}>?</button>
        </div>
      </div>
    </div>); })();
  const filterAssignees = [...new Set(projTasks.map(t => t.assignee_id).filter(Boolean))];
  const hasFilters = filterStatus !== "all" || filterPriority !== "all" || filterAssignee.length > 0;
  const filterBarEl = (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 20px", flexWrap: "wrap" }}>
      <div style={{ position: "relative", flex: "0 0 220px" }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.text3} strokeWidth="2" style={{ position: "absolute", left: 8, top: 7 }}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks…" style={{ width: "100%", padding: "5px 8px 5px 28px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 12, outline: "none" }} />
      </div>
      <div style={{ width: 130 }}>
        <SearchableMultiSelect multi={true} placeholder="Status" allByDefault={true}
          options={Object.entries(STATUS).map(([k, v]) => ({ value: k, label: v.label, color: v.color }))}
          selected={filterStatus} onChange={setFilterStatus} />
      </div>
      <div style={{ width: 130 }}>
        <SearchableMultiSelect multi={true} placeholder="Priority" allByDefault={true}
          options={Object.entries(PRIORITY).map(([k, v]) => ({ value: k, label: v.label, color: v.dot }))}
          selected={filterPriority} onChange={setFilterPriority} />
      </div>
      <div style={{ width: 140 }}>
        <SearchableMultiSelect multi={true} placeholder="Assignee"
          options={filterAssignees.map(uid => ({ value: uid, label: uname(uid) || uid.slice(0, 8), icon: "👤" }))}
          selected={filterAssignee} onChange={setFilterAssignee} />
      </div>
      {hasFilters && <button onClick={() => { setFilterStatus("all"); setFilterPriority("all"); setFilterAssignee([]); }} style={{ ...S.iconBtn, fontSize: 11, color: T.red }}>✕ Clear</button>}
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
            <div style={{ width: 110 }}>
              <SearchableMultiSelect multi={false} placeholder="Assign…"
                options={[{ value: "__none__", label: "Unassign", icon: "✕" }, ...Object.values(profiles).map(u => ({ value: u.id, label: u.display_name || u.email, icon: "👤" }))]}
                selected="" onChange={val => { if (val === "__none__") bulkUpdateTasks("assignee_id", null); else if (val) bulkUpdateTasks("assignee_id", val); }} />
            </div>
            <button onClick={() => { [...selectedTasks].forEach(id => deleteTask(id)); setSelectedTasks(new Set()); }}
              style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, border: `1px solid #ef444440`, background: "#ef444415", color: "#ef4444", cursor: "pointer", fontWeight: 600 }}>
              Delete
            </button>
            <button onClick={() => setSelectedTasks(new Set())} style={{ fontSize: 11, color: T.text3, background: "none", border: "none", cursor: "pointer", padding: "2px 4px" }}>✕</button>
          </div>
        )}
        <span style={{ fontSize: 11, color: T.text3 }}>{filteredTasks.filter(t => !t.parent_task_id).length} tasks</span>
      </div>
    </div>);
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

  // StatusPill, PriorityPill, AssigneeCell, DateCell moved to module scope






  // Refs to track current state values inside the stable TaskRow closure
  const _addingSubRef = useRef(null);
  const _expandedRef = useRef({});
  const _selTaskRef = useRef(null);
  const _editIdRef = useRef(null);
  const _editTitleRef = useRef("");
  const _newSubTitleRef = useRef("");
  const _selTasksRef = useRef(new Set());
  const _tasksRef = useRef([]);
  _addingSubRef.current = addingSubtaskTo;
  _expandedRef.current = expandedTasks;
  _selTaskRef.current = selectedTask;
  _editIdRef.current = editingTaskId;
  _editTitleRef.current = editingTaskTitle;
  _newSubTitleRef.current = newSubtaskTitle;
  _selTasksRef.current = selectedTasks;
  _tasksRef.current = tasks;

  const _profileRef = useRef(null);
  _profilesRef.current = profiles;
  _profileRef.current = profile;
  const _projMembersRef = useRef([]);
  _projMembersRef.current = projMembersList;
  const _isMobileRef = useRef(false);
  _isMobileRef.current = isMobile;

  const _taskRowRef = useRef(null);
  if (!_taskRowRef.current) _taskRowRef.current = ({ task, depth = 0 }) => {
    // Read current values from refs (not stale closure)
    const currentTasks = _tasksRef.current;
    const subs = currentTasks.filter(t => t.parent_task_id === task.id && (!filterStatus || filterStatus === "all" || t.status === filterStatus));
    const addingSub = _addingSubRef.current;
    const expanded = _expandedRef.current;
    const selTask = _selTaskRef.current;
    const editId = _editIdRef.current;
    const editTitle = _editTitleRef.current;
    const newSubTitle = _newSubTitleRef.current;
    const selTasks = _selTasksRef.current;

    const hasSubs = subs.length > 0 || addingSub === task.id;
    const exp = expanded[task.id];
    const sel = selTask?.id === task.id;
    const isEditingTitle = editId === task.id;
    const saveTitle = async () => { if (_editTitleRef.current.trim() && _editTitleRef.current !== task.title) { await updateField(task.id, "title", _editTitleRef.current.trim()); } setEditingTaskId(null); };
    const rowRef = useRef(null);
    const TaskRow = _taskRowRef.current;
    return (<>{/* row */}<div ref={rowRef} className="task-row" style={{ ...S.row(false, sel), paddingLeft: 12 + depth * 24, background: selTasks.has(task.id) ? T.accentDim : sel ? T.accentDim : "transparent" }} onMouseEnter={e => { e.currentTarget.querySelector('.row-actions')?.style.setProperty('display','flex'); e.currentTarget.style.background = sel ? T.accentDim : T.surface2; }} onMouseLeave={e => { e.currentTarget.querySelector('.row-actions')?.style.setProperty('display','none'); e.currentTarget.style.background = sel ? T.accentDim : selTasks.has(task.id) ? T.accentDim : 'transparent'; }}><div style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>{hasSubs ? <svg onClick={(e) => { e.stopPropagation(); setExpandedTasks(p => ({ ...p, [task.id]: !exp })); }} width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ cursor: "pointer", transform: exp ? "rotate(0)" : "rotate(-90deg)", transition: "transform 0.15s", flexShrink: 0 }}><path d="M3 4.5l3 3 3-3" stroke={T.text3} strokeWidth="1.5" strokeLinecap="round" /></svg> : <div style={{ width: 12 }} />}<Checkbox task={task} />{isEditingTitle ? <input value={editTitle} onChange={e => setEditingTaskTitle(e.target.value)} onBlur={saveTitle} onKeyDown={e => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") setEditingTaskId(null); }} onClick={e => e.stopPropagation()} style={{ flex: 1, fontSize: 13, background: T.surface2, border: `1px solid ${T.accent}`, borderRadius: 4, padding: "1px 6px", color: T.text, outline: "none", fontFamily: "inherit" }} /> : <span onClick={() => setSelectedTask(task)} onDoubleClick={e => { e.stopPropagation(); setEditingTaskId(task.id); setEditingTaskTitle(task.title); }} style={{ fontSize: 13, color: task.status === "done" ? T.text3 : T.text, textDecoration: task.status === "done" ? "line-through" : "none", fontWeight: sel ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, cursor: "pointer" }}>{task.title}</span>}{subs.length > 0 && !isEditingTitle && <span style={{ fontSize: 10, color: T.text3, background: T.surface3, padding: "1px 5px", borderRadius: 8, fontWeight: 600 }}>{subs.filter(s => s.status === "done").length}/{subs.length}</span>}{task.recurrence && task.recurrence !== "none" && !isEditingTitle && <span title={`Repeats ${task.recurrence}`} style={{ fontSize: 10, color: T.text3, opacity: 0.6 }}>🔄</span>}<div className="row-actions" style={{ display: "none", gap: 2 }}><button onClick={(e) => startAddSubtask(task, e)} style={S.iconBtn} title="Add subtask"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.text3} strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg></button><button onClick={(e) => { e.stopPropagation(); duplicateTask(task); }} style={S.iconBtn} title="Duplicate"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.text3} strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button><button onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }} style={S.iconBtn} title="Delete"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.text3} strokeWidth="2"><path d="M3 6h18M8 6V4h8v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button></div></div><div onClick={e => e.stopPropagation()}><StatusPill task={task} onUpdate={updateField} S={S} /></div>{!_isMobileRef.current && <div onClick={e => e.stopPropagation()}><PriorityPill task={task} onUpdate={updateField} S={S} /></div>}{!_isMobileRef.current && <div onClick={e => e.stopPropagation()}><AssigneeCell task={task} onUpdate={updateField} profiles={_profilesRef.current} profile={_profileRef.current} ini={ini} acol={acol} uname={uname} projectMembers={_projMembersRef.current} activeProject={activeProject} /></div>}{!_isMobileRef.current && <div onClick={e => e.stopPropagation()}><DateCell task={task} onUpdate={updateField} /></div>}</div>{exp && subs.map(sub => <TaskRow key={sub.id} task={sub} depth={depth + 1} />)}{exp && addingSub === task.id && <div style={{ ...S.row(false, false), paddingLeft: 36 + depth * 24, background: T.surface2 }}><div style={{ display: "flex", alignItems: "center", gap: 6 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg><input value={newSubTitle} onChange={e => setNewSubtaskTitle(e.target.value)} onKeyDown={e => { if (e.key === "Enter") createSubtask(task); if (e.key === "Escape") { setAddingSubtaskTo(null); setNewSubtaskTitle(""); } }} onBlur={() => { if (_newSubTitleRef.current.trim()) createSubtask(task); else { setAddingSubtaskTo(null); setNewSubtaskTitle(""); } }} autoFocus placeholder="Subtask name…" style={{ flex: 1, background: "none", border: "none", color: T.text, fontSize: 12, outline: "none" }} /></div>{!_isMobileRef.current && <><div /><div /><div /></>}</div>}</>); };

  const listViewEl = (() => { const TaskRow = _taskRowRef.current; const toggleSort = (col) => { setSortCol(col); setSortDir(p => sortCol === col && p === "asc" ? "desc" : "asc"); }; const arrow = (col) => sortCol === col ? (sortDir === "asc" ? " ↑" : " ↓") : ""; return (
    <div style={{ flex: 1, overflow: "auto", padding: "0 0 80px" }}>
      <div style={{ display: "grid", gridTemplateColumns: activeGrid, padding: isMobile ? "0 8px" : "0 12px", borderBottom: `1px solid ${T.border}`, position: "sticky", top: 0, zIndex: 5, background: T.bg }}>
        <div style={{ ...S.colHdr, position: "relative" }} onClick={() => toggleSort("title")}>Task name{arrow("title")}<ResizeHandle index={0} onStart={projResize} /></div>
        <div style={{ ...S.colHdr, position: "relative" }} onClick={() => toggleSort("status")}>Status{arrow("status")}<ResizeHandle index={1} onStart={projResize} /></div>
        {!isMobile && <div style={{ ...S.colHdr, position: "relative" }} onClick={() => toggleSort("priority")}>Priority{arrow("priority")}<ResizeHandle index={2} onStart={projResize} /></div>}
        {!isMobile && <div style={{ ...S.colHdr, position: "relative" }}>Assignee<ResizeHandle index={3} onStart={projResize} /></div>}
        {!isMobile && <div style={{ ...S.colHdr, position: "relative" }} onClick={() => toggleSort("due_date")}>Due date{arrow("due_date")}<ResizeHandle index={4} onStart={projResize} /></div>}
      </div>
      {projSections.map((sec, si) => { const st = filteredTasks.filter(t => t.section_id === sec.id); const roots = sortedTasks(rootTasks(st)); const isColl = collapsed[sec.id]; const sd = st.filter(t => t.status === "done").length; const color = secColor(si);
        const wipBreached = sec.wip_limit && st.filter(t => t.status !== "done").length > sec.wip_limit;
        return (
        <div key={sec.id}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", cursor: "pointer", userSelect: "none", position: "relative" }}
            onContextMenu={e => { e.preventDefault(); setSectionCtxMenu({ secId: sec.id, x: e.clientX, y: e.clientY }); }}
            draggable onDragStart={e => { e.dataTransfer.setData("section-id", sec.id); e.currentTarget.style.opacity = "0.4"; }}
            onDragEnd={e => { e.currentTarget.style.opacity = "1"; }}
            onDragOver={e => { e.preventDefault(); e.currentTarget.style.background = T.accentDim; }}
            onDragLeave={e => { e.currentTarget.style.background = "transparent"; }}
            onDrop={async e => {
              e.currentTarget.style.background = "transparent";
              const draggedId = e.dataTransfer.getData("section-id");
              if (!draggedId || draggedId === sec.id) return;
              const draggedIdx = projSections.findIndex(s => s.id === draggedId);
              const dropIdx = si;
              if (draggedIdx < 0) return;
              const reordered = [...projSections];
              const [moved] = reordered.splice(draggedIdx, 1);
              reordered.splice(dropIdx, 0, moved);
              const updates = reordered.map((s, i) => ({ ...s, sort_order: i + 1 }));
              setSections(p => p.map(s => { const u = updates.find(x => x.id === s.id); return u ? { ...s, sort_order: u.sort_order } : s; }));
              for (const u of updates) { await supabase.from("sections").update({ sort_order: u.sort_order }).eq("id", u.id); }
            }}>
            {/* Drag handle */}
            <div style={{ cursor: "grab", color: T.text3, opacity: 0.3, fontSize: 10, flexShrink: 0, lineHeight: 1 }} title="Drag to reorder">⣿</div>
            <svg onClick={() => setCollapsed(p => ({ ...p, [sec.id]: !isColl }))} width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ cursor: "pointer", transform: isColl ? "rotate(-90deg)" : "rotate(0)", transition: "transform 0.15s" }}><path d="M3 4.5l3 3 3-3" stroke={color} strokeWidth="1.5" strokeLinecap="round" /></svg>
            {editingSectionId === sec.id ? <input value={editingSectionName} onChange={e => setEditingSectionName(e.target.value)} onBlur={() => renameSection(sec.id)} onKeyDown={e => { if (e.key === "Enter") renameSection(sec.id); if (e.key === "Escape") setEditingSectionId(null); }} onClick={e => e.stopPropagation()} style={{ fontSize: 13, fontWeight: 700, color, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, padding: "2px 6px", outline: "none" }} /> : <span onDoubleClick={() => { setEditingSectionId(sec.id); setEditingSectionName(sec.name); }} style={{ fontSize: 13, fontWeight: 700, color, flex: 1 }}>{sec.name}</span>}
            {sec.is_complete_column && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: "#22c55e20", color: "#22c55e", fontWeight: 700 }}>DONE</span>}
            {sec.wip_limit && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: wipBreached ? "#ef444420" : T.surface3, color: wipBreached ? "#ef4444" : T.text3, fontWeight: 700 }}>WIP {st.filter(t => t.status !== "done").length}/{sec.wip_limit}</span>}
            <span style={{ fontSize: 11, color: T.text3, fontWeight: 500 }}>{sd}/{st.length}</span>
            {/* Up/Down arrows */}
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              <button onClick={e => { e.stopPropagation(); moveSection(sec.id, "up"); }} disabled={si === 0}
                style={{ ...S.iconBtn, padding: 0, opacity: si === 0 ? 0.15 : 0.5, fontSize: 9, lineHeight: 1 }} title="Move up">▲</button>
              <button onClick={e => { e.stopPropagation(); moveSection(sec.id, "down"); }} disabled={si === projSections.length - 1}
                style={{ ...S.iconBtn, padding: 0, opacity: si === projSections.length - 1 ? 0.15 : 0.5, fontSize: 9, lineHeight: 1 }} title="Move down">▼</button>
            </div>
            {/* Rename button */}
            <button onClick={e => { e.stopPropagation(); setEditingSectionId(sec.id); setEditingSectionName(sec.name); }} style={{ ...S.iconBtn, opacity: 0.4 }} title="Rename section">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18.4 2.6a2.17 2.17 0 013 3L12 15l-4 1 1-4 9.4-9.4z"/></svg>
            </button>
            <button onClick={() => deleteSection(sec.id)} style={{ ...S.iconBtn, opacity: 0.4 }} title="Delete section"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button>
          </div>
          {!isColl && <>{roots.map(task => <TaskRow key={task.id} task={task} depth={0} />)}{addingTo === sec.id ? <div style={{ ...S.row(false, false), background: T.surface2 }}><div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 20 }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg><input value={newTitle} onChange={e => setNewTitle(e.target.value)} onKeyDown={e => { if (e.key === "Enter") createTask(sec.id); if (e.key === "Escape") { setAddingTo(null); setNewTitle(""); } }} onBlur={() => { if (newTitle.trim()) createTask(sec.id); else { setAddingTo(null); setNewTitle(""); } }} autoFocus placeholder="Task name…" style={{ flex: 1, background: "none", border: "none", color: T.text, fontSize: 13, outline: "none" }} /></div><div /><div /><div /><div /></div> : <div onClick={() => { setAddingTo(sec.id); setNewTitle(""); }} style={{ ...S.addRow, opacity: 0.6 }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.6}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>Add task…</div>}</>}
        </div>); })}
      {addingSection ? <div style={{ padding: "8px 12px", display: "flex", gap: 8 }}><input value={newSectionName} onChange={e => setNewSectionName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") createSection(); if (e.key === "Escape") setAddingSection(false); }} placeholder="Section name…" style={{ flex: 1, padding: "5px 8px", borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, outline: "none" }} /><button onClick={createSection} style={{ padding: "4px 12px", borderRadius: 4, background: T.accent, color: "#fff", border: "none", fontSize: 12, cursor: "pointer" }}>Add</button></div> : <div onClick={() => setAddingSection(true)} style={{ ...S.addRow, opacity: 0.5, paddingLeft: 12 }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.5}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>Add section…</div>}
    </div>); })();
  const boardViewEl = (
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
            onDragOver={(e) => {
              e.preventDefault();
              // Accept both task drops and section drops
              setDragOverTarget(sec.id);
            }}
            onDragLeave={() => setDragOverTarget(null)}
            onDrop={(e) => {
              const sectionId = e.dataTransfer.getData("board-section-id");
              if (sectionId && sectionId !== sec.id) {
                // Section reorder
                const draggedIdx = projSections.findIndex(s => s.id === sectionId);
                const dropIdx = si;
                if (draggedIdx >= 0) {
                  const reordered = [...projSections];
                  const [moved] = reordered.splice(draggedIdx, 1);
                  reordered.splice(dropIdx, 0, moved);
                  const updates = reordered.map((s, i) => ({ ...s, sort_order: i + 1 }));
                  setSections(p => p.map(s => { const u = updates.find(x => x.id === s.id); return u ? { ...s, sort_order: u.sort_order } : s; }));
                  for (const u of updates) { supabase.from("sections").update({ sort_order: u.sort_order }).eq("id", u.id); }
                }
                setDragOverTarget(null);
                return;
              }
              if (dragTask) handleBoardDrop(dragTask, sec.id);
            }}
            style={{ width: isMobile ? 260 : 280, flexShrink: 0, display: "flex", flexDirection: "column", borderRadius: 10, background: isOver ? T.accentDim : T.surface, border: `1px solid ${borderColor}`, transition: "border 0.15s" }}>
            <div
              draggable
              onDragStart={e => { e.dataTransfer.setData("board-section-id", sec.id); e.currentTarget.style.opacity = "0.4"; }}
              onDragEnd={e => { e.currentTarget.style.opacity = "1"; setDragOverTarget(null); }}
              style={{ padding: "12px 14px 8px", display: "flex", alignItems: "center", gap: 8, borderBottom: `2px solid ${isDoneCol ? "#22c55e" : color}`, cursor: "grab" }}>
              <div style={{ color: T.text3, opacity: 0.3, fontSize: 10, flexShrink: 0, lineHeight: 1 }} title="Drag to reorder">⣿</div>
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
                ? <div style={{ padding: 8 }}><input value={newTitle} onChange={e => setNewTitle(e.target.value)} onKeyDown={e => { if (e.key === "Enter") createTask(sec.id); if (e.key === "Escape") { setAddingTo(null); setNewTitle(""); } }} onBlur={() => { if (newTitle.trim()) createTask(sec.id); else { setAddingTo(null); setNewTitle(""); } }} autoFocus placeholder="Task name…" style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontSize: 12, outline: "none" }} /></div>
                : <div onClick={() => { setAddingTo(sec.id); setNewTitle(""); }} style={{ padding: "6px 8px", color: T.text3, fontSize: 12, cursor: "pointer", borderRadius: 6, display: "flex", alignItems: "center", gap: 4, opacity: 0.6 }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.6}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>Add task</div>}
            </div>
          </div>
        );
      })}
      {/* Add Section column */}
      {addingSection ? (
        <div style={{ width: isMobile ? 260 : 280, flexShrink: 0, display: "flex", flexDirection: "column", borderRadius: 10, background: T.surface, border: `1px dashed ${T.accent}40`, padding: 12 }}>
          <input value={newSectionName} onChange={e => setNewSectionName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && newSectionName.trim()) createSection(); if (e.key === "Escape") { setAddingSection(false); setNewSectionName(""); } }}
            onBlur={() => { if (newSectionName.trim()) createSection(); else { setAddingSection(false); setNewSectionName(""); } }}
            placeholder="Section name…"
            style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${T.accent}40`, background: T.surface2, color: T.text, fontSize: 13, outline: "none", fontFamily: "inherit" }} />
        </div>
      ) : (
        <div onClick={() => { setAddingSection(true); setNewSectionName(""); }}
          style={{ width: isMobile ? 260 : 280, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 10, border: `2px dashed ${T.border}`, cursor: "pointer", minHeight: 120, transition: "all 0.15s" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent + "60"; e.currentTarget.style.background = T.surface + "80"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = "transparent"; }}>
          <div style={{ textAlign: "center", color: T.text3 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ margin: "0 auto 6px", display: "block", opacity: 0.5 }}><path d="M12 5v14M5 12h14"/></svg>
            <span style={{ fontSize: 12, fontWeight: 600 }}>Add Section</span>
          </div>
        </div>
      )}
    </div>
  );
  const timelineViewEl = (() => {
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
  })();
  const calendarViewEl = (() => { const yr = calMonth.getFullYear(); const mo = calMonth.getMonth(); const fd = new Date(yr, mo, 1).getDay(); const dim = new Date(yr, mo + 1, 0).getDate(); const today = new Date(); const cells = []; for (let i = 0; i < fd; i++) cells.push(null); for (let d = 1; d <= dim; d++) cells.push(d); const gtd = (day) => { const ds = `${yr}-${String(mo + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`; return filteredTasks.filter(t => t.due_date === ds); }; return (
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
    </div>); })();
  const myTasksViewEl = (() => {
    const today = new Date(); today.setHours(0,0,0,0);
    const weekOut = new Date(today); weekOut.setDate(weekOut.getDate() + 7);
    const mt = tasks.filter(t => t.assignee_id === user?.id && t.status !== "done" && t.status !== "cancelled" && !t.parent_task_id);
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
          <div style={{ flex: 1 }} />
          <button onClick={async () => { const title = await showPrompt("New Personal Task", "Task title…"); if (title) createStandaloneTask(title); }}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 6, border: `1px solid ${T.accent}40`, background: `${T.accent}10`, color: T.accent, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            + Add Task
          </button>
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
                <div key={task.id} onClick={() => { if (task.project_id) { setActiveProject(task.project_id); setShowMyTasks(false); } setTimeout(() => setSelectedTask(task), 100); }}
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
  })();
  // DetailPane uses hooks — must be inline component (useRef pattern causes stale closures)
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
      <div style={{ width: isMobile ? "100%" : 420, flexShrink: 0, borderLeft: isMobile ? "none" : `1px solid ${T.border}`, background: T.surface, display: "flex", flexDirection: "column", overflow: "hidden", animation: "slideIn 0.2s ease", ...(isMobile ? { position: "fixed", inset: 0, zIndex: 100 } : {}) }}>
        {/* Header */}
        <div style={{ padding: "12px 16px 10px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
            <Checkbox task={task} size={18} />
            <div style={{ flex: 1, minWidth: 0 }}>
              {parent && <div style={{ fontSize: 10, color: T.text3, marginBottom: 3 }}>↳ {parent.title}</div>}
              <input defaultValue={task.title} key={task.id + "-title"}
                onBlur={e => { if (e.target.value.trim() && e.target.value !== task.title) updateField(task.id, "title", e.target.value.trim()); }}
                onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
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
                <span style={FIELD_LABEL}>Status</span><StatusPill task={task} onUpdate={updateField} S={S} />
                <span style={FIELD_LABEL}>Priority</span><PriorityPill task={task} onUpdate={updateField} S={S} />
                <span style={FIELD_LABEL}>Assignee</span><AssigneeCell task={task} onUpdate={updateField} profiles={profiles} profile={profile} ini={ini} acol={acol} uname={uname} projectMembers={projMembersList} activeProject={activeProject} />
                <span style={FIELD_LABEL}>Due Date</span><DateCell task={task} onUpdate={updateField} />
                <span style={FIELD_LABEL}>Start Date</span>
                <input type="date" value={task.start_date || ""} onChange={e => updateField(task.id, "start_date", e.target.value || null)}
                  style={{ background: "none", border: "none", color: task.start_date ? T.text2 : T.text3, fontSize: 12, cursor: "pointer", outline: "none", fontFamily: "inherit" }} />
                <span style={FIELD_LABEL}>Section</span>
                <SearchableMultiSelect multi={false} placeholder="Select section"
                  options={projSections.map(s => ({ value: s.id, label: s.name }))}
                  selected={task.section_id || ""} onChange={val => updateField(task.id, "section_id", val)} />
                <span style={FIELD_LABEL}>PLM Product</span>
                <SearchableMultiSelect multi={false} placeholder="No product linked"
                  options={[{ value: "", label: "None", icon: "" }, ...plmPrograms.map(p => ({ value: p.id, label: `${p.name}${p.category ? ` (${p.category})` : ""}`, icon: "⬢" }))]}
                  selected={task.plm_program_id || ""} onChange={val => updateField(task.id, "plm_program_id", val || null)} />
              </div>

              {/* Effort tracking */}
              <div style={{ background: T.surface2, borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Effort</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 10, color: T.text3, display: "block", marginBottom: 3 }}>Est. Hours</label>
                    <input type="number" defaultValue={task.estimated_hours || ""} key={task.id + "-esthrs"}
                      onBlur={e => updateField(task.id, "estimated_hours", e.target.value ? Number(e.target.value) : null)}
                      onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
                      placeholder="0" style={{ width: "100%", padding: "5px 8px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: T.text3, display: "block", marginBottom: 3 }}>Story Points</label>
                    <input type="number" defaultValue={task.story_points || ""} key={task.id + "-sp"}
                      onBlur={e => updateField(task.id, "story_points", e.target.value ? Number(e.target.value) : null)}
                      onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
                      placeholder="0" style={{ width: "100%", padding: "5px 8px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                  </div>
                </div>
              </div>

              {/* Link to OKR KR */}
              {objectives.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <label style={{ ...FIELD_LABEL, display: "block", marginBottom: 6 }}>Linked OKR</label>
                  <SearchableMultiSelect multi={false} placeholder="No linked KR"
                    options={objectives.map(o => ({ value: o.id, label: o.title, icon: "◎" }))}
                    selected={task.linked_kr_id || ""} onChange={val => updateField(task.id, "linked_kr_id", val || null)} />
                  {task.linked_kr_id && <div style={{ fontSize: 10, color: T.accent, marginTop: 4 }}>✓ Contributes to OKR progress</div>}
                </div>
              )}

              {/* Description */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ ...FIELD_LABEL, display: "block", marginBottom: 6 }}>Description</label>
                <textarea defaultValue={task.description || ""} key={task.id + "-desc"} rows={3} placeholder="Add context, requirements, or notes…"
                  onBlur={e => updateField(task.id, "description", e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, resize: "vertical", outline: "none", fontFamily: "inherit", lineHeight: 1.5, boxSizing: "border-box", minHeight: 80 }} />
              </div>

              {/* Recurrence */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ ...FIELD_LABEL, display: "block", marginBottom: 6 }}>Recurrence</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: task.recurrence && task.recurrence !== "none" ? 8 : 0 }}>
                  {[
                    { k: "none", l: "None" }, { k: "daily", l: "Daily" }, { k: "weekly", l: "Weekly" },
                    { k: "biweekly", l: "Bi-weekly" }, { k: "monthly", l: "Monthly" }, { k: "quarterly", l: "Quarterly" },
                  ].map(r => (
                    <button key={r.k} onClick={() => updateField(task.id, "recurrence", r.k === "none" ? null : r.k)}
                      style={{ padding: "3px 10px", borderRadius: 12, border: (task.recurrence || "none") === r.k ? `1.5px solid ${T.accent}` : `1px solid ${T.border}`,
                        background: (task.recurrence || "none") === r.k ? `${T.accent}15` : "transparent",
                        color: (task.recurrence || "none") === r.k ? T.accent : T.text3, fontSize: 11, fontWeight: 500, cursor: "pointer" }}>{r.l}</button>
                  ))}
                </div>
                {task.recurrence && task.recurrence !== "none" && (
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <label style={{ fontSize: 10, color: T.text3 }}>On:</label>
                      <div style={{ display: "flex", gap: 3 }}>
                        {[
                          { k: "on_date", l: "Next due date", d: "Creates when the due date arrives" },
                          { k: "on_complete", l: "On completion", d: "Creates immediately when marked done" },
                        ].map(m => (
                          <button key={m.k} onClick={() => updateField(task.id, "recurrence_mode", m.k)} title={m.d}
                            style={{ padding: "2px 8px", borderRadius: 4, border: (task.recurrence_mode || "on_date") === m.k ? `1px solid ${T.accent}40` : `1px solid ${T.border}`,
                              background: (task.recurrence_mode || "on_date") === m.k ? `${T.accent}10` : "transparent",
                              color: (task.recurrence_mode || "on_date") === m.k ? T.accent : T.text3, fontSize: 10, cursor: "pointer" }}>{m.l}</button>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <label style={{ fontSize: 10, color: T.text3 }}>Until:</label>
                      <input type="date" value={task.recurrence_end_date || ""} onChange={e => updateField(task.id, "recurrence_end_date", e.target.value || null)}
                        style={{ background: "none", border: `1px solid ${T.border}`, borderRadius: 4, color: T.text2, fontSize: 11, padding: "2px 6px", outline: "none", cursor: "pointer" }} />
                    </div>
                    {task.recurring_parent_id && <span style={{ fontSize: 10, color: T.text3 }}>🔄 Recurring instance</span>}
                  </div>
                )}
              </div>

              {/* Custom fields */}
              {customFields.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <label style={{ ...FIELD_LABEL, display: "block", marginBottom: 6 }}>Custom Fields</label>
                  {customFields.map(cf => {
                    const val = tcf[cf.id] || "";
                    const prefix = cf.options?.currency_prefix || "$";
                    const choices = cf.options?.choices || [];
                    const inp = { flex: 1, padding: "4px 7px", borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 12, outline: "none" };
                    return (
                      <div key={cf.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 12, color: T.text3, width: 90, flexShrink: 0, display: "flex", alignItems: "center", gap: 4 }}>
                          {cf.name}
                          <button onClick={() => deleteCustomField(cf.id)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 9, opacity: 0.3, padding: 0 }}
                            onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.3}>×</button>
                        </span>
                        {cf.field_type === "currency" ? (
                          <div style={{ display: "flex", alignItems: "center", flex: 1, gap: 0 }}>
                            <span style={{ padding: "4px 6px", background: T.surface3, borderRadius: "4px 0 0 4px", border: `1px solid ${T.border}`, borderRight: "none", fontSize: 12, color: T.text3 }}>{prefix}</span>
                            <input type="number" defaultValue={val} key={task.id + "-cf-" + cf.id} onBlur={e => updateCustomFieldValue(task.id, cf.id, e.target.value)} onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
                              placeholder="0.00" step="0.01" style={{ ...inp, borderRadius: "0 4px 4px 0", flex: 1 }} />
                          </div>
                        ) : cf.field_type === "number" ? (
                          <input type="number" defaultValue={val} key={task.id + "-cf-" + cf.id} onBlur={e => updateCustomFieldValue(task.id, cf.id, e.target.value)} onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }} placeholder="0" style={inp} />
                        ) : cf.field_type === "percent" ? (
                          <div style={{ display: "flex", alignItems: "center", flex: 1, gap: 0 }}>
                            <input type="number" defaultValue={val} key={task.id + "-cf-" + cf.id} onBlur={e => updateCustomFieldValue(task.id, cf.id, e.target.value)} onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
                              placeholder="0" min="0" max="100" style={{ ...inp, borderRadius: "4px 0 0 4px" }} />
                            <span style={{ padding: "4px 6px", background: T.surface3, borderRadius: "0 4px 4px 0", border: `1px solid ${T.border}`, borderLeft: "none", fontSize: 12, color: T.text3 }}>%</span>
                          </div>
                        ) : cf.field_type === "date" ? (
                          <input type="date" defaultValue={val} key={task.id + "-cf-" + cf.id} onChange={e => updateCustomFieldValue(task.id, cf.id, e.target.value)} style={{ ...inp, cursor: "pointer" }} />
                        ) : cf.field_type === "select" ? (
                          <SearchableMultiSelect multi={false} placeholder="Select…"
                            options={choices.map(c => ({ value: c, label: c }))}
                            selected={val || ""} onChange={v => updateCustomFieldValue(task.id, cf.id, v)} />
                        ) : cf.field_type === "checkbox" ? (
                          <div onClick={() => updateCustomFieldValue(task.id, cf.id, val === "true" ? "false" : "true")}
                            style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${val === "true" ? T.accent : T.border}`, background: val === "true" ? T.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                            {val === "true" && <span style={{ color: "#fff", fontSize: 11 }}>✓</span>}
                          </div>
                        ) : cf.field_type === "url" ? (
                          <div style={{ display: "flex", alignItems: "center", flex: 1, gap: 4 }}>
                            <input type="url" defaultValue={val} key={task.id + "-cf-" + cf.id} onBlur={e => updateCustomFieldValue(task.id, cf.id, e.target.value)} onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
                              placeholder="https://..." style={inp} />
                            {val && <a href={val} target="_blank" rel="noopener" style={{ color: T.accent, fontSize: 11, flexShrink: 0 }}>↗</a>}
                          </div>
                        ) : cf.field_type === "email" ? (
                          <input type="email" defaultValue={val} key={task.id + "-cf-" + cf.id} onBlur={e => updateCustomFieldValue(task.id, cf.id, e.target.value)} onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
                            placeholder="name@example.com" style={inp} />
                        ) : cf.field_type === "rating" ? (
                          <div style={{ display: "flex", gap: 2 }}>
                            {[1,2,3,4,5].map(n => (
                              <span key={n} onClick={() => updateCustomFieldValue(task.id, cf.id, String(n === Number(val) ? 0 : n))}
                                style={{ cursor: "pointer", fontSize: 16, opacity: n <= Number(val || 0) ? 1 : 0.2 }}>⭐</span>
                            ))}
                          </div>
                        ) : (
                          <input defaultValue={val} key={task.id + "-cf-" + cf.id} onBlur={e => updateCustomFieldValue(task.id, cf.id, e.target.value)} onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }} style={inp} />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {/* Add custom field */}
              {showCFCreate ? (
                <div style={{ marginBottom: 16, padding: "12px 14px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface2 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>New Custom Field</span>
                    <button onClick={() => setShowCFCreate(false)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 14 }}>×</button>
                  </div>
                  <input value={cfForm.name} onChange={e => setCfForm(p => ({ ...p, name: e.target.value }))} placeholder="Field name"
                    onKeyDown={e => { if (e.key === "Enter" && cfForm.name.trim()) createCustomField(); }}
                    style={{ width: "100%", padding: "6px 8px", borderRadius: 5, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontSize: 12, outline: "none", fontFamily: "inherit", boxSizing: "border-box", marginBottom: 8 }} />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4, marginBottom: 8 }}>
                    {FIELD_TYPES.map(ft => (
                      <button key={ft.key} onClick={() => setCfForm(p => ({ ...p, field_type: ft.key }))}
                        style={{ padding: "4px 2px", borderRadius: 4, border: cfForm.field_type === ft.key ? `1.5px solid ${T.accent}` : `1px solid ${T.border}`,
                          background: cfForm.field_type === ft.key ? `${T.accent}15` : T.surface, color: cfForm.field_type === ft.key ? T.accent : T.text3,
                          fontSize: 9, fontWeight: 600, cursor: "pointer", textAlign: "center", lineHeight: 1.3 }}>
                        <div style={{ fontSize: 12 }}>{ft.icon}</div>{ft.label}
                      </button>
                    ))}
                  </div>
                  {cfForm.field_type === "currency" && (
                    <div style={{ marginBottom: 8 }}>
                      <label style={{ fontSize: 10, color: T.text3, display: "block", marginBottom: 3 }}>Currency</label>
                      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                        {CURRENCY_PREFIXES.map(c => (
                          <button key={c} onClick={() => setCfForm(p => ({ ...p, currency_prefix: c }))}
                            style={{ padding: "3px 8px", borderRadius: 4, border: cfForm.currency_prefix === c ? `1.5px solid ${T.accent}` : `1px solid ${T.border}`,
                              background: cfForm.currency_prefix === c ? `${T.accent}15` : "transparent", color: cfForm.currency_prefix === c ? T.accent : T.text3,
                              fontSize: 11, cursor: "pointer", fontWeight: 600 }}>{c}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {cfForm.field_type === "select" && (
                    <div style={{ marginBottom: 8 }}>
                      <label style={{ fontSize: 10, color: T.text3, display: "block", marginBottom: 3 }}>Options (comma-separated)</label>
                      <input value={cfForm.options.join(", ")} onChange={e => setCfForm(p => ({ ...p, options: e.target.value.split(",").map(s => s.trim()).filter(Boolean) }))}
                        placeholder="Option 1, Option 2, Option 3" style={{ width: "100%", padding: "5px 8px", borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontSize: 11, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
                    </div>
                  )}
                  <button onClick={createCustomField} disabled={!cfForm.name.trim()} style={{ width: "100%", padding: "6px 0", borderRadius: 5, border: "none", background: cfForm.name.trim() ? T.accent : T.surface3, color: cfForm.name.trim() ? "#fff" : T.text3, fontSize: 12, fontWeight: 600, cursor: cfForm.name.trim() ? "pointer" : "default" }}>Add Field</button>
                </div>
              ) : (
                <button onClick={() => setShowCFCreate(true)} style={{ fontSize: 11, color: T.accent, background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 16 }}>+ Add custom field</button>
              )}

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
                  <input value={newSubtaskTitle} onChange={e => setNewSubtaskTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") createSubtask(task); if (e.key === "Escape") { setAddingSubtaskTo(null); setNewSubtaskTitle(""); } }}
                    onBlur={() => { if (newSubtaskTitle.trim()) createSubtask(task); else { setAddingSubtaskTo(null); setNewSubtaskTitle(""); } }}
                    placeholder="Subtask name…" autoFocus
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
            <div style={{ marginBottom: 12 }}><label style={lbl}>Project Name *</label><input value={f.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Q2 Marketing Campaign" style={inp} /></div>
            <div style={{ marginBottom: 12 }}><label style={lbl}>Description</label><textarea value={f.description} onChange={e => set("description", e.target.value)} rows={3} placeholder="What is this project about?" style={{ ...inp, resize: "vertical", fontFamily: "inherit" }} /></div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div><label style={lbl}>Start Date</label><input type="date" value={f.start_date} onChange={e => set("start_date", e.target.value)} style={inp} /></div>
              <div><label style={lbl}>Target End Date</label><input type="date" value={f.target_end_date} onChange={e => set("target_end_date", e.target.value)} style={inp} /></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div><label style={lbl}>Status</label><SearchableMultiSelect multi={false} placeholder="Status" options={[{value:"active",label:"Active",color:"#22c55e"},{value:"on_hold",label:"On Hold",color:"#eab308"},{value:"completed",label:"Completed",color:"#3b82f6"},{value:"archived",label:"Archived",color:"#6b7280"}]} selected={f.status||"active"} onChange={val => set("status", val)} /></div>
              <div><label style={lbl}>Default View</label><SearchableMultiSelect multi={false} placeholder="View" options={[{value:"List",label:"List"},{value:"Board",label:"Board"},{value:"Timeline",label:"Timeline"},{value:"Calendar",label:"Calendar"}]} selected={f.default_view||"List"} onChange={val => set("default_view", val)} /></div>
            </div>
            <div style={{ marginBottom: 12 }}><label style={lbl}>Color</label><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{colors.map(c => <div key={c} onClick={() => set("color", c)} style={{ width: 28, height: 28, borderRadius: 14, background: c, cursor: "pointer", border: f.color === c ? "3px solid #fff" : "3px solid transparent", boxShadow: f.color === c ? `0 0 0 2px ${c}` : "none", transition: "all 0.15s" }} />)}</div></div>
            <div style={{ marginBottom: 12 }}><label style={lbl}>Link to Goal / OKR</label><SearchableMultiSelect multi={false} placeholder="None" options={objectives.map(o => ({ value: o.id, label: o.title, icon: "◎" }))} selected={f.objective_id||""} onChange={val => set("objective_id", val)} />{f.objective_id && <div style={{ marginTop: 6, padding: "6px 10px", borderRadius: 6, background: T.accentDim, fontSize: 11, color: T.accent }}>Linked to: {objectives.find(o => o.id === f.objective_id)?.title}</div>}</div>
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
            <div style={{ marginBottom: 16 }}><label style={lbl}>Assign to Team</label><SearchableMultiSelect multi={false} placeholder="No team" options={teams.map(t => ({ value: t.id, label: t.name, icon: "👥" }))} selected={f.team_id||""} onChange={val => set("team_id", val)} />{teams.length === 0 && <div style={{ fontSize: 11, color: T.text3, marginTop: 4 }}>No teams created yet</div>}</div>
            <div style={{ marginBottom: 16 }}><label style={lbl}>Link to PLM Product</label><SearchableMultiSelect multi={false} placeholder="No product linked" options={plmPrograms.map(p => ({ value: p.id, label: `${p.name}${p.category ? ` (${p.category})` : ""}`, icon: "⬢" }))} selected={f.plm_program_id||""} onChange={val => set("plm_program_id", val)} />{f.plm_program_id && <div style={{ marginTop: 6, padding: "6px 10px", borderRadius: 6, background: "#8b5cf620", fontSize: 11, color: "#8b5cf6", display: "flex", alignItems: "center", gap: 6 }}>⬢ Linked to: {plmPrograms.find(p => p.id === f.plm_program_id)?.name}</div>}</div>
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
            <div style={{ marginBottom: 16 }}><label style={lbl}>Project Owner</label>
              <SearchableMultiSelect multi={false} placeholder="Unassigned"
                options={allProfiles.map(u => ({ value: u.id, label: u.display_name || u.email, icon: "👤" }))}
                selected={f.owner_id || ""} onChange={val => set("owner_id", val || null)} />
            </div>
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
  const updatesViewEl = (() => {
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
  })();

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
              <input value={newDocTitle} onChange={e => setNewDocTitle(e.target.value)}
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
  const templatesModalEl = (() => {
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
  })();

  // Copy project modal
  const saveAsTemplateModalEl = (() => {
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
  })();

  const copyModalEl = (() => {
    if (!copyingProject) return null;
    return (
      <div onClick={() => setCopyingProject(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div onClick={e => e.stopPropagation()} style={{ width: "min(380px, 95vw)", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
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
  })();

  // Status form modal
  const HEALTH_OPTS = [{ k: "on_track", l: "On Track", color: "#22c55e" }, { k: "at_risk", l: "At Risk", color: "#eab308" }, { k: "off_track", l: "Off Track", color: "#ef4444" }];
  const statusFormModalEl = !showStatusForm ? null : (
      <div onClick={() => setShowStatusForm(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div onClick={e => e.stopPropagation()} style={{ width: "min(500px, 95vw)", maxHeight: "80vh", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
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
                rows={3} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, resize: "vertical", outline: "none", fontFamily: "inherit", lineHeight: 1.5, boxSizing: "border-box" }} />
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

  // MAIN RENDER
  return (
    <div onClick={() => ctxProject && setCtxProject(null)} style={{ display: "flex", height: "100%", background: T.bg, overflow: "hidden" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes slideIn{from{transform:translateX(20px);opacity:0}to{transform:translateX(0);opacity:1}}`}</style>
      {/* Keyboard shortcuts help */}
      {showKeyboardHelp && (
        <div onClick={() => setShowKeyboardHelp(false)} style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} />
          <div onClick={e => e.stopPropagation()} style={{ position: "relative", width: "min(420px, 95vw)", background: T.surface, borderRadius: 14, border: `1px solid ${T.border}`, padding: 28, zIndex: 301, boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Keyboard Shortcuts</h3>
              <button onClick={() => setShowKeyboardHelp(false)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 18 }}>×</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
              {[
                ["J / ↓", "Next task"],
                ["K / ↑", "Previous task"],
                ["Space", "Toggle done"],
                ["Enter", "Open task detail"],
                ["N", "New task"],
                ["F", "Focus search"],
                ["1", "List view"],
                ["2", "Board view"],
                ["3", "Timeline view"],
                ["Esc", "Close / deselect"],
                ["?", "Show this help"],
              ].map(([key, desc]) => (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: `1px solid ${T.border}20` }}>
                  <kbd style={{ padding: "2px 7px", borderRadius: 5, border: `1px solid ${T.border}`, background: T.surface2, fontSize: 11, fontFamily: "monospace", color: T.accent, fontWeight: 700, minWidth: 40, textAlign: "center", flexShrink: 0 }}>{key}</kbd>
                  <span style={{ fontSize: 13, color: T.text2 }}>{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

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
        {showMyTasks ? (
          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
            {myTasksViewEl}
            <DetailPane />
          </div>
        ) : proj ? (<>
          {projectHeaderEl}
          {viewMode !== "Info" && filterBarEl}
          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {viewMode === "Info" && (
                <div style={{ flex: 1, overflow: "auto", padding: "24px 28px", maxWidth: 700 }}>
                  {/* Quick actions */}
                  <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
                    <button onClick={openEditProject} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface2, color: T.text2, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18.4 2.6a2.17 2.17 0 013 3L12 15l-4 1 1-4 9.4-9.4z"/></svg> Edit Project
                    </button>
                    <button onClick={() => { setStatusForm({ health: projHealth, summary: "", highlights: "", blockers: "" }); setShowStatusForm(true); }}
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface2, color: T.text2, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      📋 Post Status Update
                    </button>
                  </div>

                  {/* Description */}
                  {proj.description && (
                    <div style={{ marginBottom: 24 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Description</div>
                      <div style={{ fontSize: 14, color: T.text, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{proj.description}</div>
                    </div>
                  )}

                  {/* Details grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "14px 16px", marginBottom: 28 }}>
                    <div style={{ fontSize: 12, color: T.text3, fontWeight: 600 }}>Status</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 4, background: healthColors[projHealth] }} />
                      <span style={{ fontSize: 13, color: healthColors[projHealth], fontWeight: 600 }}>{healthLabels[projHealth]}</span>
                    </div>

                    <div style={{ fontSize: 12, color: T.text3, fontWeight: 600 }}>Progress</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ flex: 1, maxWidth: 200, height: 6, borderRadius: 3, background: T.surface3, overflow: "hidden" }}>
                        <div style={{ width: `${progress}%`, height: "100%", borderRadius: 3, background: proj.color || T.accent, transition: "width 0.3s" }} />
                      </div>
                      <span style={{ fontSize: 12, color: T.text2, fontWeight: 600 }}>{progress}%</span>
                      <span style={{ fontSize: 11, color: T.text3 }}>{doneCount}/{projTasks.length} tasks done</span>
                    </div>

                    <div style={{ fontSize: 12, color: T.text3, fontWeight: 600 }}>Owner</div>
                    <div style={{ fontSize: 13, color: T.text }}>{proj.owner_id ? (profiles[proj.owner_id]?.display_name || "Unknown") : <span style={{ color: T.text3 }}>Unassigned</span>}</div>

                    {proj.team_id && <>
                      <div style={{ fontSize: 12, color: T.text3, fontWeight: 600 }}>Team</div>
                      <div style={{ fontSize: 13, color: T.text }}>{teams.find(t => t.id === proj.team_id)?.name || "—"}</div>
                    </>}

                    <div style={{ fontSize: 12, color: T.text3, fontWeight: 600 }}>Visibility</div>
                    <div style={{ fontSize: 13, color: T.text }}>{{ private: "🔒 Private", team: "👥 Team", public: "🌐 Public" }[proj.visibility] || proj.visibility || "Private"}</div>

                    <div style={{ fontSize: 12, color: T.text3, fontWeight: 600 }}>Color</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 18, height: 18, borderRadius: 6, background: proj.color || T.accent, border: `1px solid ${T.border}` }} />
                      <span style={{ fontSize: 12, color: T.text3 }}>{proj.color || "#3b82f6"}</span>
                    </div>

                    {proj.start_date && <>
                      <div style={{ fontSize: 12, color: T.text3, fontWeight: 600 }}>Start Date</div>
                      <div style={{ fontSize: 13, color: T.text }}>{new Date(proj.start_date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</div>
                    </>}

                    {proj.target_end_date && <>
                      <div style={{ fontSize: 12, color: T.text3, fontWeight: 600 }}>Target End Date</div>
                      <div style={{ fontSize: 13, color: T.text }}>{new Date(proj.target_end_date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</div>
                    </>}

                    <div style={{ fontSize: 12, color: T.text3, fontWeight: 600 }}>Created</div>
                    <div style={{ fontSize: 13, color: T.text }}>{proj.created_at ? new Date(proj.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "—"}</div>

                    <div style={{ fontSize: 12, color: T.text3, fontWeight: 600 }}>Default View</div>
                    <div style={{ fontSize: 13, color: T.text }}>{proj.default_view || "List"}</div>
                  </div>

                  {/* Overdue warning */}
                  {projOverdue.length > 0 && (
                    <div style={{ padding: "14px 16px", borderRadius: 10, background: "#ef444410", border: "1px solid #ef444430", marginBottom: 20 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#ef4444", marginBottom: 6 }}>⚠ {projOverdue.length} Overdue Task{projOverdue.length !== 1 ? "s" : ""}</div>
                      {projOverdue.slice(0, 5).map(t => (
                        <div key={t.id} onClick={() => { setViewMode("List"); setTimeout(() => setSelectedTask(t), 100); }}
                          style={{ fontSize: 12, color: T.text2, padding: "4px 0", cursor: "pointer" }}
                          onMouseEnter={e => e.currentTarget.style.color = T.accent} onMouseLeave={e => e.currentTarget.style.color = T.text2}>
                          · {t.title} <span style={{ color: T.text3 }}>— due {toDateStr(t.due_date)}</span>
                        </div>
                      ))}
                      {projOverdue.length > 5 && <div style={{ fontSize: 11, color: T.text3, marginTop: 4 }}>and {projOverdue.length - 5} more...</div>}
                    </div>
                  )}

                  {/* Recent status updates */}
                  {statusUpdates.length > 0 && (
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Recent Updates</div>
                      {statusUpdates.slice(0, 3).map(su => {
                        const suColor = { on_track: "#22c55e", at_risk: "#eab308", off_track: "#ef4444" }[su.status] || T.text3;
                        return (
                          <div key={su.id} style={{ padding: "12px 14px", borderRadius: 8, border: `1px solid ${T.border}`, marginBottom: 6, background: T.surface2 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                              <span style={{ width: 8, height: 8, borderRadius: 4, background: suColor }} />
                              <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{su.title}</span>
                              <span style={{ fontSize: 10, color: T.text3, marginLeft: "auto" }}>{new Date(su.created_at).toLocaleDateString()}</span>
                            </div>
                            {su.body && <div style={{ fontSize: 12, color: T.text3, lineHeight: 1.5, marginTop: 4 }}>{su.body.slice(0, 200)}{su.body.length > 200 ? "..." : ""}</div>}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Section breakdown */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Sections</div>
                    {projSections.map((sec, si) => {
                      const st = projTasks.filter(t => t.section_id === sec.id && !t.parent_task_id);
                      const dn = st.filter(t => t.status === "done").length;
                      const pct = st.length ? Math.round((dn / st.length) * 100) : 0;
                      return (
                        <div key={sec.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${T.border}10` }}>
                          <span style={{ width: 10, height: 10, borderRadius: 3, background: secColor(si), flexShrink: 0 }} />
                          <span style={{ fontSize: 13, color: T.text, fontWeight: 500, flex: 1 }}>{sec.name}</span>
                          <div style={{ width: 80, height: 4, borderRadius: 2, background: T.surface3, overflow: "hidden" }}>
                            <div style={{ width: `${pct}%`, height: "100%", borderRadius: 2, background: secColor(si) }} />
                          </div>
                          <span style={{ fontSize: 11, color: T.text3, width: 50, textAlign: "right" }}>{dn}/{st.length}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {viewMode === "List" && listViewEl}
              {viewMode === "Board" && boardViewEl}
              {viewMode === "Timeline" && timelineViewEl}
              {viewMode === "Calendar" && calendarViewEl}
              {viewMode === "Updates" && updatesViewEl}
              {viewMode === "Docs" && <DocsView />}
              {viewMode === "Rules" && (
                <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                    <div>
                      <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: T.text }}>Rules</h3>
                      <div style={{ fontSize: 12, color: T.text3, marginTop: 2 }}>Automate actions when triggers fire on tasks in this project</div>
                    </div>
                    <button onClick={() => { setEditingRule(null); setRuleForm({ name: "", trigger_type: "task_moved_to_section", trigger_config: {}, actions: [] }); setShowRuleBuilder(true); }}
                      style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 16px", borderRadius: 8, border: "none", background: T.accent, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                      <span style={{ fontSize: 16 }}>+</span> Add Rule
                    </button>
                  </div>

                  {rules.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "60px 0", color: T.text3 }}>
                      <div style={{ fontSize: 40, marginBottom: 12 }}>⚡</div>
                      <div style={{ fontSize: 15, fontWeight: 600 }}>No rules yet</div>
                      <div style={{ fontSize: 13, marginTop: 4 }}>Create rules to automatically update tasks when things happen.</div>
                      <div style={{ fontSize: 12, marginTop: 16, color: T.text3, lineHeight: 1.8 }}>
                        Examples:<br/>
                        When a task moves to "Done" → mark it complete<br/>
                        When priority is set to "Urgent" → assign to team lead<br/>
                        When a task is created → set due date to 7 days from now
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {rules.map(rule => {
                        const trig = TRIGGER_TYPES.find(t => t.key === rule.trigger_type) || { label: rule.trigger_type, icon: "?" };
                        const trigDesc = (() => {
                          const tc = rule.trigger_config || {};
                          if (rule.trigger_type === "task_moved_to_section" && tc.section_id) { const s = projSections.find(s => s.id === tc.section_id); return s ? `"${s.name}"` : "any section"; }
                          if (rule.trigger_type === "status_changed" && tc.status) return `"${(STATUS[tc.status] || {}).label || tc.status}"`;
                          if (rule.trigger_type === "priority_changed" && tc.priority) return `"${(PRIORITY[tc.priority] || {}).label || tc.priority}"`;
                          if (rule.trigger_type === "task_assigned" && tc.assignee_id) return `"${profiles[tc.assignee_id]?.display_name || "someone"}"`;
                          if (rule.trigger_type === "due_date_approaching" && tc.days_before) return `${tc.days_before} day(s) before`;
                          return "";
                        })();

                        return (
                          <div key={rule.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderRadius: 10, border: `1px solid ${rule.is_active ? T.border : T.border + "60"}`, background: rule.is_active ? T.surface : T.surface + "80", opacity: rule.is_active ? 1 : 0.6 }}>
                            {/* Toggle */}
                            <div onClick={() => toggleRule(rule.id)} style={{ width: 36, height: 20, borderRadius: 10, background: rule.is_active ? T.accent : T.surface3, cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                              <div style={{ width: 16, height: 16, borderRadius: 8, background: "#fff", position: "absolute", top: 2, left: rule.is_active ? 18 : 2, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }} />
                            </div>

                            {/* Rule info */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 4 }}>{rule.name}</div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: `${T.accent}15`, color: T.accent, fontWeight: 600 }}>
                                  {trig.icon} {trig.label} {trigDesc}
                                </span>
                                <span style={{ color: T.text3, fontSize: 11 }}>→</span>
                                {(rule.actions || []).map((a, ai) => {
                                  const act = ACTION_TYPES.find(t => t.key === a.type) || { label: a.type, icon: "?" };
                                  return (
                                    <span key={ai} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: T.surface3, color: T.text2, fontWeight: 500 }}>
                                      {act.icon} {act.label}
                                    </span>
                                  );
                                })}
                              </div>
                              {rule.run_count > 0 && (
                                <div style={{ fontSize: 10, color: T.text3, marginTop: 4 }}>
                                  Ran {rule.run_count} time{rule.run_count !== 1 ? "s" : ""} · Last: {rule.last_run_at ? new Date(rule.last_run_at).toLocaleDateString() : "never"}
                                </div>
                              )}
                            </div>

                            {/* Actions */}
                            <div style={{ display: "flex", gap: 4 }}>
                              <button onClick={() => { setEditingRule(rule); setRuleForm({ name: rule.name, description: rule.description || "", trigger_type: rule.trigger_type, trigger_config: rule.trigger_config || {}, actions: rule.actions || [] }); setShowRuleBuilder(true); }}
                                style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 13, padding: 4 }}>✎</button>
                              <button onClick={() => deleteRule(rule.id)}
                                style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 13, padding: 4 }}>🗑</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Rule Builder Modal */}
                  {showRuleBuilder && (
                    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} onClick={() => setShowRuleBuilder(false)} />
                      <div style={{ position: "relative", width: 560, maxHeight: "85vh", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, boxShadow: "0 20px 60px rgba(0,0,0,0.4)", overflow: "auto", zIndex: 201 }}>
                        <div style={{ padding: "20px 24px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{editingRule ? "Edit Rule" : "Create Rule"}</h3>
                          <button onClick={() => setShowRuleBuilder(false)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 18 }}>×</button>
                        </div>
                        <div style={{ padding: "20px 24px" }}>
                          {/* Name */}
                          <div style={{ marginBottom: 16 }}>
                            <label style={{ fontSize: 12, fontWeight: 600, color: T.text2, display: "block", marginBottom: 4 }}>Rule Name</label>
                            <input value={ruleForm.name} onChange={e => setRuleForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g., Auto-complete when moved to Done"
                              style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                          </div>

                          {/* Trigger */}
                          <div style={{ marginBottom: 16 }}>
                            <label style={{ fontSize: 12, fontWeight: 700, color: T.accent, display: "block", marginBottom: 8 }}>⚡ WHEN...</label>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
                              {TRIGGER_TYPES.map(t => (
                                <button key={t.key} onClick={() => setRuleForm(p => ({ ...p, trigger_type: t.key, trigger_config: {} }))}
                                  style={{ padding: "10px 12px", borderRadius: 8, border: ruleForm.trigger_type === t.key ? `2px solid ${T.accent}` : `1px solid ${T.border}`,
                                    background: ruleForm.trigger_type === t.key ? `${T.accent}10` : T.surface2, color: ruleForm.trigger_type === t.key ? T.accent : T.text2,
                                    fontSize: 12, fontWeight: 500, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 8 }}>
                                  <span style={{ fontSize: 14 }}>{t.icon}</span>{t.label}
                                </button>
                              ))}
                            </div>
                            {/* Trigger config */}
                            <div style={{ marginTop: 10 }}>
                              {ruleForm.trigger_type === "task_moved_to_section" && (
                                <SearchableMultiSelect
                                  options={projSections.map(s => ({ value: s.id, label: s.name, color: secColor(projSections.indexOf(s)) }))}
                                  selected={ruleForm.trigger_config.section_ids || (ruleForm.trigger_config.section_id ? [ruleForm.trigger_config.section_id] : [])}
                                  onChange={vals => setRuleForm(p => ({ ...p, trigger_config: { ...p.trigger_config, section_ids: vals, section_id: vals[0] || null } }))}
                                  placeholder="Any section" multi={true} />
                              )}
                              {ruleForm.trigger_type === "status_changed" && (
                                <SearchableMultiSelect
                                  options={Object.entries(STATUS).map(([k, v]) => ({ value: k, label: v.label, color: v.color }))}
                                  selected={ruleForm.trigger_config.statuses || (ruleForm.trigger_config.status ? [ruleForm.trigger_config.status] : [])}
                                  onChange={vals => setRuleForm(p => ({ ...p, trigger_config: { ...p.trigger_config, statuses: vals, status: vals[0] || null } }))}
                                  placeholder="Any status" multi={true} />
                              )}
                              {ruleForm.trigger_type === "priority_changed" && (
                                <SearchableMultiSelect
                                  options={Object.entries(PRIORITY).map(([k, v]) => ({ value: k, label: v.label, color: v.dot }))}
                                  selected={ruleForm.trigger_config.priorities || (ruleForm.trigger_config.priority ? [ruleForm.trigger_config.priority] : [])}
                                  onChange={vals => setRuleForm(p => ({ ...p, trigger_config: { ...p.trigger_config, priorities: vals, priority: vals[0] || null } }))}
                                  placeholder="Any priority" multi={true} />
                              )}
                              {ruleForm.trigger_type === "task_assigned" && (
                                <SearchableMultiSelect
                                  options={allProfiles.map(u => ({ value: u.id, label: u.display_name || u.email, icon: "👤" }))}
                                  selected={ruleForm.trigger_config.assignee_ids || (ruleForm.trigger_config.assignee_id ? [ruleForm.trigger_config.assignee_id] : [])}
                                  onChange={vals => setRuleForm(p => ({ ...p, trigger_config: { ...p.trigger_config, assignee_ids: vals, assignee_id: vals[0] || null } }))}
                                  placeholder="Anyone" multi={true} />
                              )}
                              {ruleForm.trigger_type === "due_date_approaching" && (
                                <input type="number" value={ruleForm.trigger_config.days_before || ""} onChange={e => setRuleForm(p => ({ ...p, trigger_config: { ...p.trigger_config, days_before: Number(e.target.value) || null } }))}
                                  placeholder="Days before due date" min="1" style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 12 }} />
                              )}
                            </div>
                          </div>

                          {/* Actions */}
                          <div style={{ marginBottom: 16 }}>
                            <label style={{ fontSize: 12, fontWeight: 700, color: "#22c55e", display: "block", marginBottom: 8 }}>✓ THEN...</label>
                            {ruleForm.actions.map((action, ai) => {
                              const act = ACTION_TYPES.find(t => t.key === action.type);
                              return (
                                <div key={ai} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, padding: "10px 12px", borderRadius: 8, background: T.surface2, border: `1px solid ${T.border}` }}>
                                  <span style={{ fontSize: 12, fontWeight: 600, color: T.text2, width: 24, textAlign: "center" }}>{ai + 1}.</span>
                                  <select value={action.type} onChange={e => { const nw = [...ruleForm.actions]; nw[ai] = { type: e.target.value, config: {} }; setRuleForm(p => ({ ...p, actions: nw })); }}
                                    style={{ flex: 1, padding: "5px 8px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontSize: 12 }}>
                                    {ACTION_TYPES.map(a => <option key={a.key} value={a.key}>{a.icon} {a.label}</option>)}
                                  </select>
                                  {/* Action config */}
                                  {action.type === "set_status" && (
                                    <div style={{ width: 140 }}>
                                      <SearchableMultiSelect multi={false}
                                        options={Object.entries(STATUS).map(([k, v]) => ({ value: k, label: v.label, color: v.color }))}
                                        selected={action.config?.status || ""}
                                        onChange={val => { const nw = [...ruleForm.actions]; nw[ai] = { ...nw[ai], config: { status: val } }; setRuleForm(p => ({ ...p, actions: nw })); }}
                                        placeholder="Pick..." />
                                    </div>
                                  )}
                                  {action.type === "move_to_section" && (
                                    <div style={{ width: 140 }}>
                                      <SearchableMultiSelect multi={false}
                                        options={projSections.map(s => ({ value: s.id, label: s.name }))}
                                        selected={action.config?.section_id || ""}
                                        onChange={val => { const nw = [...ruleForm.actions]; nw[ai] = { ...nw[ai], config: { section_id: val } }; setRuleForm(p => ({ ...p, actions: nw })); }}
                                        placeholder="Pick..." />
                                    </div>
                                  )}
                                  {action.type === "set_assignee" && (
                                    <div style={{ width: 140 }}>
                                      <SearchableMultiSelect multi={false}
                                        options={allProfiles.map(u => ({ value: u.id, label: u.display_name || u.email, icon: "👤" }))}
                                        selected={action.config?.assignee_id || ""}
                                        onChange={val => { const nw = [...ruleForm.actions]; nw[ai] = { ...nw[ai], config: { assignee_id: val || null } }; setRuleForm(p => ({ ...p, actions: nw })); }}
                                        placeholder="Pick..." />
                                    </div>
                                  )}
                                  {action.type === "set_priority" && (
                                    <div style={{ width: 140 }}>
                                      <SearchableMultiSelect multi={false}
                                        options={Object.entries(PRIORITY).map(([k, v]) => ({ value: k, label: v.label, color: v.dot }))}
                                        selected={action.config?.priority || ""}
                                        onChange={val => { const nw = [...ruleForm.actions]; nw[ai] = { ...nw[ai], config: { priority: val } }; setRuleForm(p => ({ ...p, actions: nw })); }}
                                        placeholder="Pick..." />
                                    </div>
                                  )}
                                  {action.type === "add_comment" && (
                                    <input value={action.config?.comment || ""} onChange={e => { const nw = [...ruleForm.actions]; nw[ai] = { ...nw[ai], config: { comment: e.target.value } }; setRuleForm(p => ({ ...p, actions: nw })); }}
                                      placeholder="Comment text..." style={{ width: 160, padding: "5px 8px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontSize: 11 }} />
                                  )}
                                  {action.type === "set_due_date_offset" && (
                                    <input type="number" value={action.config?.days_offset || ""} onChange={e => { const nw = [...ruleForm.actions]; nw[ai] = { ...nw[ai], config: { days_offset: Number(e.target.value) } }; setRuleForm(p => ({ ...p, actions: nw })); }}
                                      placeholder="Days" style={{ width: 80, padding: "5px 8px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontSize: 11 }} />
                                  )}
                                  <button onClick={() => setRuleForm(p => ({ ...p, actions: p.actions.filter((_, i) => i !== ai) }))}
                                    style={{ background: "none", border: "none", color: T.red, cursor: "pointer", fontSize: 14, padding: "0 4px" }}>×</button>
                                </div>
                              );
                            })}
                            <button onClick={() => setRuleForm(p => ({ ...p, actions: [...p.actions, { type: "set_status", config: {} }] }))}
                              style={{ width: "100%", padding: "8px", borderRadius: 8, border: `2px dashed ${T.border}`, background: "transparent", color: T.text3, fontSize: 12, cursor: "pointer", fontWeight: 500 }}>
                              + Add Action
                            </button>
                          </div>
                        </div>

                        {/* Footer */}
                        <div style={{ padding: "14px 24px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 8, justifyContent: "flex-end" }}>
                          <button onClick={() => setShowRuleBuilder(false)} style={{ padding: "8px 16px", borderRadius: 8, background: T.surface3, color: T.text2, border: "none", fontSize: 13, cursor: "pointer" }}>Cancel</button>
                          <button onClick={saveRule} disabled={!ruleForm.name.trim() || ruleForm.actions.length === 0}
                            style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: ruleForm.name.trim() && ruleForm.actions.length > 0 ? T.accent : T.surface3, color: ruleForm.name.trim() && ruleForm.actions.length > 0 ? "#fff" : T.text3, fontSize: 13, fontWeight: 600, cursor: ruleForm.name.trim() && ruleForm.actions.length > 0 ? "pointer" : "default" }}>
                            {editingRule ? "Update Rule" : "Create Rule"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
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
      {templatesModalEl}
      {saveAsTemplateModalEl}
      {copyModalEl}
      {statusFormModalEl}
      {showAddMember && activeProject && (() => {
        const currentMembers = projMembersList.filter(pm => pm.project_id === activeProject);
        const currentMemberIds = new Set(currentMembers.map(m => m.user_id));
        const availableProfiles = Object.values(profiles).filter(p => !currentMemberIds.has(p.id) && p.id !== proj?.owner_id);
        const addMember = async (uid) => {
          const { error } = await supabase.from("project_members").insert({ project_id: activeProject, user_id: uid, role: "member" });
          if (error) return;
          setProjMembersList(p => [...p, { project_id: activeProject, user_id: uid, role: "member" }]);
        };
        const removeMember = async (uid) => {
          await supabase.from("project_members").delete().eq("project_id", activeProject).eq("user_id", uid);
          setProjMembersList(p => p.filter(pm => !(pm.project_id === activeProject && pm.user_id === uid)));
        };
        return (
          <div onClick={() => setShowAddMember(false)} style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} />
            <div onClick={e => e.stopPropagation()} style={{ position: "relative", width: "min(420px, 95vw)", maxHeight: "70vh", background: T.surface, borderRadius: 14, border: `1px solid ${T.border}`, boxShadow: "0 20px 60px rgba(0,0,0,0.4)", zIndex: 201, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>Project Members</div>
                  <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>{proj?.name}</div>
                </div>
                <button onClick={() => setShowAddMember(false)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 18 }}>×</button>
              </div>
              <div style={{ flex: 1, overflow: "auto", padding: "12px 20px" }}>
                {/* Current members */}
                <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Current Members ({currentMembers.length + (proj?.owner_id ? 1 : 0)})</div>
                {proj?.owner_id && (() => {
                  const p = profiles[proj.owner_id]; const c = acol(proj.owner_id);
                  return <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
                    <div style={{ width: 30, height: 30, borderRadius: 15, background: `${c}20`, color: c, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>{ini(proj.owner_id)}</div>
                    <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{p?.display_name || "Unknown"}</div><div style={{ fontSize: 10, color: T.text3 }}>{p?.email}</div></div>
                    <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 8, background: T.accent + "20", color: T.accent, fontWeight: 700 }}>OWNER</span>
                  </div>;
                })()}
                {currentMembers.filter(m => m.user_id !== proj?.owner_id).map(m => {
                  const p = profiles[m.user_id]; const c = acol(m.user_id);
                  return <div key={m.user_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
                    <div style={{ width: 30, height: 30, borderRadius: 15, background: `${c}20`, color: c, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>{ini(m.user_id)}</div>
                    <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{p?.display_name || "Unknown"}</div><div style={{ fontSize: 10, color: T.text3 }}>{p?.email}</div></div>
                    <button onClick={() => removeMember(m.user_id)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 11 }} title="Remove">✕</button>
                  </div>;
                })}
                {/* Add new members */}
                {availableProfiles.length > 0 && <>
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 16, marginBottom: 8 }}>Add Members</div>
                  {availableProfiles.map(p => {
                    const c = acol(p.id);
                    return <div key={p.id} onClick={() => addMember(p.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${T.border}`, cursor: "pointer", borderRadius: 6 }}
                      onMouseEnter={e => e.currentTarget.style.background = T.surface2} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <div style={{ width: 30, height: 30, borderRadius: 15, background: `${c}20`, color: c, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>{ini(p.id)}</div>
                      <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 500 }}>{p.display_name}</div><div style={{ fontSize: 10, color: T.text3 }}>{p.email}</div></div>
                      <span style={{ fontSize: 11, color: T.accent, fontWeight: 600 }}>+ Add</span>
                    </div>;
                  })}
                </>}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}


function StatusPill({ task, onUpdate, S }) {
  const st = STATUS[task.status] || STATUS.todo;
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <span onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer", background: st.bg, color: st.color }}>{st.label}</span>
      {open && (
        <Dropdown onClose={() => setOpen(false)}>
          {Object.entries(STATUS).map(([k, v]) => (
            <DropdownItem key={k} onClick={() => { onUpdate(task.id, "status", k); setOpen(false); }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: v.color, display: "inline-block", marginRight: 6 }} />{v.label}
            </DropdownItem>
          ))}
        </Dropdown>
      )}
    </div>
  );
}

function PriorityPill({ task, onUpdate, S }) {
  const pr = PRIORITY[task.priority] || PRIORITY.none;
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <span onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer", background: pr.bg, color: pr.color }}>{pr.label}</span>
      {open && (
        <Dropdown onClose={() => setOpen(false)}>
          {Object.entries(PRIORITY).map(([k, v]) => (
            <DropdownItem key={k} onClick={() => { onUpdate(task.id, "priority", k); setOpen(false); }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: v.dot, display: "inline-block", marginRight: 6 }} />{v.label}
            </DropdownItem>
          ))}
        </Dropdown>
      )}
    </div>
  );
}

function AssigneeCell({ task, onUpdate, profiles, profile, ini, acol, uname, projectMembers, activeProject }) {
  const [open, setOpen] = useState(false);
  const [aSearch, setASearch] = useState("");
  const [showAddPrompt, setShowAddPrompt] = useState(null); // user to prompt about
  const pl = Object.values(profiles);
  const memberIds = new Set((projectMembers || []).filter(pm => pm.project_id === activeProject).map(pm => pm.user_id));
  const filtered = aSearch.trim() ? pl.filter(u => (u.display_name||"").toLowerCase().includes(aSearch.toLowerCase()) || (u.email||"").toLowerCase().includes(aSearch.toLowerCase())) : pl;
  
  const assignUser = async (userId) => {
    // Check if user is a project member
    if (activeProject && !memberIds.has(userId) && userId !== profile?.id) {
      setShowAddPrompt(userId);
      return;
    }
    onUpdate(task.id, "assignee_id", userId);
    setOpen(false);
  };

  const confirmAssign = async (addToProject) => {
    const userId = showAddPrompt;
    if (addToProject && activeProject) {
      await supabase.from("project_members").insert({ project_id: activeProject, user_id: userId, role: "member" });
    }
    onUpdate(task.id, "assignee_id", userId);
    setShowAddPrompt(null);
    setOpen(false);
  };

  return (
    <div style={{ position: "relative" }}>
      <div onClick={(e) => { e.stopPropagation(); setOpen(!open); setASearch(""); setShowAddPrompt(null); }}
        style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", padding: "2px 4px", borderRadius: 4 }}>
        {task.assignee_id ? (
          <>
            <div style={{ width: 20, height: 20, borderRadius: 10, background: acol(task.assignee_id) + "30", color: acol(task.assignee_id), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700 }}>{ini(task.assignee_id)}</div>
            <span style={{ fontSize: 12, color: T.text2, maxWidth: 70, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{uname(task.assignee_id).split(" ")[0]}</span>
          </>
        ) : (
          <div style={{ width: 20, height: 20, borderRadius: 10, border: `1.5px dashed ${T.text3}` }} />
        )}
      </div>
      {open && !showAddPrompt && (
        <Dropdown onClose={() => setOpen(false)} wide>
          <div style={{ padding: "4px 6px" }}>
            <input value={aSearch} onChange={e => setASearch(e.target.value)} onClick={e => e.stopPropagation()} placeholder="Search people…" autoFocus
              style={{ width: "100%", padding: "4px 8px", borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 11, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
          </div>
          {profile?.id && task.assignee_id !== profile.id && (
            <DropdownItem onClick={() => { onUpdate(task.id, "assignee_id", profile.id); setOpen(false); }}>
              <span style={{ color: T.accent, fontWeight: 600, fontSize: 11 }}>→ Assign to me</span>
            </DropdownItem>
          )}
          <DropdownItem onClick={() => { onUpdate(task.id, "assignee_id", null); setOpen(false); }}>
            <span style={{ color: T.text3 }}>Unassigned</span>
          </DropdownItem>
          {activeProject && <div style={{ padding: "2px 8px", fontSize: 9, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 4 }}>Project Members</div>}
          {filtered.filter(u => memberIds.has(u.id)).map(u => (
            <DropdownItem key={u.id} onClick={() => { onUpdate(task.id, "assignee_id", u.id); setOpen(false); }}>
              <div style={{ width: 18, height: 18, borderRadius: 9, background: acol(u.id) + "30", color: acol(u.id), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700 }}>{ini(u.id)}</div>
              <span style={{ flex: 1 }}>{u.display_name || u.email}</span>
            </DropdownItem>
          ))}
          {filtered.filter(u => !memberIds.has(u.id) && u.id !== profile?.id).length > 0 && (
            <div style={{ padding: "2px 8px", fontSize: 9, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 6, borderTop: `1px solid ${T.border}`, paddingTop: 6 }}>Others in Org</div>
          )}
          {filtered.filter(u => !memberIds.has(u.id) && u.id !== profile?.id).map(u => (
            <DropdownItem key={u.id} onClick={() => assignUser(u.id)}>
              <div style={{ width: 18, height: 18, borderRadius: 9, background: acol(u.id) + "20", color: acol(u.id), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, opacity: 0.6 }}>{ini(u.id)}</div>
              <span style={{ flex: 1, color: T.text3 }}>{u.display_name || u.email}</span>
            </DropdownItem>
          ))}
        </Dropdown>
      )}
      {open && showAddPrompt && (
        <Dropdown onClose={() => { setShowAddPrompt(null); setOpen(false); }} wide>
          <div style={{ padding: "10px 12px" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 8 }}>
              {profiles[showAddPrompt]?.display_name || "This person"} isn't in this project
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <button onClick={() => confirmAssign(true)}
                style={{ padding: "7px 12px", fontSize: 11, fontWeight: 600, background: T.accent, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", textAlign: "left" }}>
                Add to project & assign task
              </button>
              <button onClick={() => confirmAssign(false)}
                style={{ padding: "7px 12px", fontSize: 11, fontWeight: 500, background: T.surface2, color: T.text2, border: `1px solid ${T.border}`, borderRadius: 6, cursor: "pointer", textAlign: "left" }}>
                Assign task only (won't see project)
              </button>
              <button onClick={() => { setShowAddPrompt(null); }}
                style={{ padding: "5px 12px", fontSize: 11, color: T.text3, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
                Cancel
              </button>
            </div>
          </div>
        </Dropdown>
      )}
    </div>
  );
}

function DateCell({ task, onUpdate }) {
  const od = isOverdue(task.due_date) && task.status !== "done";
  return (
    <input type="date" value={task.due_date || ""} onChange={(e) => onUpdate(task.id, "due_date", e.target.value || null)}
      onClick={(e) => e.stopPropagation()}
      style={{ background: "none", border: "none", color: od ? T.red : task.due_date ? T.text2 : T.text3, fontSize: 12, cursor: "pointer", outline: "none", width: 95, fontFamily: "inherit" }} />
  );
}


function LabelPills({ taskLabels, small }) {
  if (!taskLabels || taskLabels.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 3, flexWrap: "wrap", flexShrink: 0 }}>
      {taskLabels.map(l => (
        <span key={l.id} style={{ fontSize: small ? 8 : 9, fontWeight: 700, padding: small ? "1px 4px" : "1px 6px", borderRadius: 3, background: l.color + "20", color: l.color, whiteSpace: "nowrap" }}>{l.name}</span>
      ))}
    </div>
  );
}

function LabelPicker({ taskId, taskLabels, allLabels, onToggle, onCreate, onClose }) {
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#3b82f6");
  const [showCreate, setShowCreate] = useState(false);
  const ref = useRef(null);
  useEffect(() => { const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); }; document.addEventListener("mousedown", fn); return () => document.removeEventListener("mousedown", fn); }, [onClose]);
  const assignedIds = new Set(taskLabels.map(l => l.id));
  const filtered = search ? allLabels.filter(l => l.name.toLowerCase().includes(search.toLowerCase())) : allLabels;
  const COLORS = ["#ef4444","#f97316","#eab308","#22c55e","#06b6d4","#3b82f6","#8b5cf6","#ec4899","#6b7280"];
  return (
    <div ref={ref} style={{ position: "absolute", top: "100%", left: 0, zIndex: 50, marginTop: 4, width: 220, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.25)", padding: 4 }}>
      <div style={{ padding: "4px 6px" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search labels..." autoFocus
          style={{ width: "100%", padding: "4px 8px", borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 11, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
      </div>
      <div style={{ maxHeight: 180, overflow: "auto" }}>
        {filtered.map(l => (
          <div key={l.id} onClick={() => onToggle(taskId, l.id)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 4, cursor: "pointer", fontSize: 12 }}
            onMouseEnter={e => e.currentTarget.style.background = T.surface2} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            <div style={{ width: 14, height: 14, borderRadius: 3, background: l.color + "30", border: `2px solid ${l.color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9 }}>
              {assignedIds.has(l.id) ? "✓" : ""}
            </div>
            <span style={{ color: T.text }}>{l.name}</span>
          </div>
        ))}
      </div>
      <div style={{ borderTop: `1px solid ${T.border}`, padding: "4px 6px", marginTop: 2 }}>
        {!showCreate ? (
          <button onClick={() => setShowCreate(true)} style={{ width: "100%", padding: "4px 0", fontSize: 11, color: T.accent, background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>+ Create label</button>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Label name" style={{ width: "100%", padding: "4px 6px", fontSize: 11, border: `1px solid ${T.border}`, borderRadius: 4, background: T.surface2, color: T.text, outline: "none", boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: 3 }}>
              {COLORS.map(c => <div key={c} onClick={() => setNewColor(c)} style={{ width: 16, height: 16, borderRadius: 3, background: c, cursor: "pointer", border: newColor === c ? "2px solid #fff" : "2px solid transparent", boxShadow: newColor === c ? `0 0 0 1px ${c}` : "none" }} />)}
            </div>
            <button onClick={async () => { if (!newName.trim()) return; const l = await onCreate(newName.trim(), newColor); if (l) { onToggle(taskId, l.id); setNewName(""); setShowCreate(false); } }}
              style={{ padding: "4px 8px", fontSize: 11, fontWeight: 600, background: T.accent, color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}>Create & Apply</button>
          </div>
        )}
      </div>
    </div>
  );
}

function CustomFieldCell({ task, field, value, onChange }) {
  const ft = field.field_type;
  const base = { fontSize: 12, color: T.text, background: "none", border: "none", outline: "none", fontFamily: "inherit", width: "100%", padding: "2px 4px" };
  if (ft === "checkbox") return <input type="checkbox" checked={value === "true"} onChange={e => onChange(task.id, field.id, e.target.checked ? "true" : "false")} style={{ accentColor: T.accent }} />;
  if (ft === "select") return (
    <select value={value || ""} onChange={e => onChange(task.id, field.id, e.target.value)} style={{ ...base, cursor: "pointer" }}>
      <option value="">—</option>
      {(field.options || []).map(o => <option key={o.value || o} value={o.value || o}>{o.value || o}</option>)}
    </select>
  );
  if (ft === "date") return <input type="date" value={value || ""} onChange={e => onChange(task.id, field.id, e.target.value)} style={{ ...base, width: 110 }} />;
  if (ft === "number") return <input type="number" value={value || ""} onBlur={e => onChange(task.id, field.id, e.target.value)} onChange={() => {}} style={{ ...base, textAlign: "right", width: 60 }} />;
  return <input value={value || ""} onBlur={e => onChange(task.id, field.id, e.target.value)} style={{ ...base }} placeholder="—" />;
}

function Dropdown({ children, onClose, wide }) {
  const ref = useRef(null);
  useEffect(() => { const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); }; document.addEventListener("mousedown", fn); return () => document.removeEventListener("mousedown", fn); }, [onClose]);
  return (<div ref={ref} style={{ position: "absolute", top: "100%", left: 0, zIndex: 50, marginTop: 4, minWidth: wide ? 180 : 130, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.25)", padding: 4, animation: "slideIn 0.15s ease" }}>{children}</div>);
}

function DropdownItem({ children, onClick }) {
  return (<div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 4, fontSize: 12, color: T.text, cursor: "pointer", transition: "background 0.1s" }} onMouseEnter={e => e.currentTarget.style.background = T.surface2} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>{children}</div>);
}
