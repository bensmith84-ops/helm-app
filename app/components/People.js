"use client";
import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";
import { useResponsive } from "../lib/responsive";
import { useAuth } from "../lib/auth";
import { useResizableColumns } from "../lib/useResizableColumns";

const AVATAR_COLORS = ["#3b82f6","#a855f7","#ec4899","#06b6d4","#f97316","#22c55e","#84cc16","#ef4444"];
const acol = (uid) => uid ? AVATAR_COLORS[uid.charCodeAt(uid.length - 1) % AVATAR_COLORS.length] : T.text3;
// Editable field — uses local state to avoid cursor bouncing, saves on blur/Enter
function EditableField({ value, onSave, placeholder, style: customStyle }) {
  const [editing, setEditing] = useState(false);
  const [localVal, setLocalVal] = useState(value);
  const inputRef = useRef(null);
  useEffect(() => { if (!editing) setLocalVal(value); }, [value, editing]);
  return editing ? (
    <input ref={inputRef} autoFocus value={localVal} onChange={e => setLocalVal(e.target.value)}
      onBlur={() => { setEditing(false); if (localVal !== value) onSave(localVal); }}
      onKeyDown={e => { if (e.key === "Enter") { e.target.blur(); } if (e.key === "Escape") { setLocalVal(value); setEditing(false); } }}
      style={{ ...customStyle, border: "none", outline: "none", background: `${T.accent}08`, borderRadius: 4, padding: "2px 6px", margin: "-2px -6px", boxSizing: "content-box" }} />
  ) : (
    <div onClick={() => setEditing(true)} title="Click to edit"
      style={{ ...customStyle, cursor: "pointer", padding: "2px 6px", margin: "-2px -6px", borderRadius: 4, border: `1px dashed transparent`, transition: "all 0.15s" }}
      onMouseEnter={e => { e.currentTarget.style.background = T.surface2; e.currentTarget.style.borderColor = T.border; }}
      onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent"; }}>
      {value || <span style={{ color: T.text3, fontStyle: "italic", fontWeight: 400 }}>{placeholder}</span>}
      <span style={{ fontSize: 10, color: T.text3, marginLeft: 6, opacity: 0.5 }}>✎</span>
    </div>
  );
}

const ROLES = ["owner", "admin", "member", "viewer"];
const ROLE_COLORS = { owner: "#ef4444", admin: "#a855f7", member: "#3b82f6", viewer: "#6b7280" };
const MODULE_TREE = [
  { key: "dashboard", label: "Home", icon: "⬡" },
  { key: "okrs", label: "OKRs", icon: "◎" },
  { key: "projects", label: "Projects", icon: "◫" },
  { key: "launches", label: "Launches", icon: "🚀" },
  { key: "demand_planning", label: "Demand Planning", icon: "📊", children: [
    { key: "demand_planning.view", label: "View Plans" },
    { key: "demand_planning.edit", label: "Edit Plans" },
    { key: "demand_planning.create", label: "Create Launches" },
    { key: "demand_planning.channels", label: "Manage Channels" },
    { key: "demand_planning.variants", label: "Manage Variants" },
    { key: "demand_planning.rebill", label: "Rebill/Reorder Curves" },
  ]},
  { key: "supply_chain", label: "Supply Chain", icon: "🔗", children: [
    { key: "supply_chain.forecasting", label: "Forecasting" },
    { key: "supply_chain.procurement", label: "Procurement" },
    { key: "supply_chain.logistics", label: "Logistics" },
    { key: "supply_chain.quality", label: "Quality Control" },
  ]},
  { key: "finance", label: "Finance", icon: "💰", children: [
    { key: "finance.ap", label: "Accounts Payable" },
    { key: "finance.ar", label: "Accounts Receivable" },
    { key: "finance.budgets", label: "Budget Planner" },
    { key: "finance.expenses", label: "Expense Reports" },
    { key: "finance.invoices", label: "Invoice Management" },
    { key: "finance.approvals", label: "Approval Workflows" },
  ]},
  { key: "scorecard", label: "Scorecard", icon: "▣" },
  { key: "learning", label: "Learning", icon: "📚", children: [
    { key: "learning.take_courses", label: "Take Courses" },
    { key: "learning.view_catalog", label: "View Catalog" },
    { key: "learning.manage_courses", label: "Manage Courses (Admin)" },
    { key: "learning.assign_courses", label: "Assign Courses" },
    { key: "learning.view_analytics", label: "View Analytics" },
  ]},
  { key: "support", label: "Support", icon: "🎧", children: [
    { key: "support.inbox", label: "View Inbox" },
    { key: "support.reply", label: "Reply to Tickets" },
    { key: "support.assign", label: "Assign Tickets" },
    { key: "support.manage_kb", label: "Manage Knowledge Base" },
    { key: "support.manage_macros", label: "Manage Macros" },
    { key: "support.view_analytics", label: "View Analytics" },
    { key: "support.ai_config", label: "Configure AI Agent" },
  ]},
  { key: "docs", label: "Docs", icon: "▤" },
  { key: "messages", label: "Messages", icon: "◬" },
  { key: "calendar", label: "Calendar", icon: "▦" },
  { key: "calls", label: "Calls", icon: "◉" },
  { key: "campaigns", label: "Campaigns", icon: "◈" },
  { key: "plm", label: "PLM", icon: "⬢", children: [
    { key: "plm.programs", label: "Programs" },
    { key: "plm.formulations", label: "Formulations" },
    { key: "plm.experiments", label: "Experiments" },
    { key: "plm.trials", label: "Trials" },
    { key: "plm.stability", label: "Stability" },
    { key: "plm.claims", label: "Claims" },
    { key: "plm.ai", label: "AI Advisors" },
  ]},
  { key: "erp", label: "ERP", icon: "◧", children: [
    { key: "erp.dashboard", label: "Dashboard" },
    { key: "erp.cfo_dash", label: "CFO Dashboard" },
    { key: "erp.pl_explorer", label: "P&L Explorer" },
    { key: "erp.cash_flow", label: "Cash Flow" },
    { key: "erp.vendor_intel", label: "Vendor Intelligence" },
    { key: "erp.ap_aging", label: "AP / AR" },
    { key: "erp.txn_search", label: "Transaction Search" },
    { key: "erp.revenue", label: "Revenue Analytics" },
    { key: "erp.fin_budgets", label: "Budgets", children: [
      { key: "erp.fin_budgets.view_amounts", label: "View Budget Amounts ($)" },
      { key: "erp.fin_budgets.view_actuals", label: "View QBO Actuals ($)" },
      { key: "erp.fin_budgets.drill_down", label: "Drill Down into Categories" },
      { key: "erp.fin_budgets.edit_budgets", label: "Edit Budget Amounts" },
      { key: "erp.fin_budgets.monthly_view", label: "Monthly View" },
    ]},
    { key: "erp.fin_requests", label: "Spend Requests" },
    { key: "erp.fin_rules", label: "Approval Rules" },
    { key: "erp.fin_audit", label: "Audit Log" },
    { key: "erp.orders", label: "Orders" },
    { key: "erp.customers", label: "Customers" },
    { key: "erp.inventory", label: "Inventory" },
    { key: "erp.products", label: "Products" },
    { key: "erp.suppliers", label: "Suppliers" },
    { key: "erp.purchase_orders", label: "Purchase Orders" },
    { key: "erp.manufacturing", label: "Manufacturing" },
    { key: "erp.facilities", label: "Facilities" },
    { key: "erp.entities", label: "Entities" },
    { key: "erp.shipping", label: "Shipping" },
    { key: "erp.returns", label: "Returns" },
  ]},
  { key: "wms", label: "WMS", icon: "◨" },
  { key: "scoreboard", label: "Scoreboard", icon: "▩" },
  { key: "automation", label: "Automation", icon: "⚡" },
  { key: "reports", label: "Reports", icon: "▥" },
  { key: "people", label: "Team", icon: "◔" },
  { key: "activity", label: "Activity", icon: "◑" },
  { key: "ai-builder", label: "AI Builder", icon: "🧠" },
  { key: "settings", label: "Settings", icon: "⚙" },
];
const MODULES = MODULE_TREE.map(m => m.key);
const TEAM_COLORS = ["#3b82f6","#22c55e","#a855f7","#f97316","#ec4899","#06b6d4","#eab308","#ef4444"];

export default function PeopleView() {
  const { isMobile } = useResponsive();
  const { user, profile, orgId } = useAuth();
  const [members, setMembers] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [projectMembers, setProjectMembers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [inviteTitle, setInviteTitle] = useState("");
  const [inviteDept, setInviteDept] = useState("");
  const [invitePhone, setInvitePhone] = useState("");
  const [inviteLocation, setInviteLocation] = useState("");
  const [inviteStartDate, setInviteStartDate] = useState("");
  const [inviteReportsTo, setInviteReportsTo] = useState("");
  const [inviteReportsSearch, setInviteReportsSearch] = useState("");
  const [inviteReportsOpen, setInviteReportsOpen] = useState(false);
  const [inviteEmploymentType, setInviteEmploymentType] = useState("full_time");
  const [invitePersonalEmail, setInvitePersonalEmail] = useState("");
  // Module permissions to grant at invite time (default deny — empty allow list)
  const [inviteAllowedModules, setInviteAllowedModules] = useState([]);
  const [tab, setTab] = useState("overview");
  const [reportsSearch, setReportsSearch] = useState("");
  const [reportsSearchOpen, setReportsSearchOpen] = useState(false);
  const [filterRole, setFilterRole] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const [viewMode, setViewMode] = useState(() => {
    if (typeof window !== "undefined") { try { return localStorage.getItem("people_view") || "cards"; } catch {} }
    return "cards";
  });
  const [hoveredRow, setHoveredRow] = useState(null);
  const [selectedPeople, setSelectedPeople] = useState(new Set());
  // Teams view state
  const [showTeamForm, setShowTeamForm] = useState(false);
  const [teamForm, setTeamForm] = useState({ name: "", description: "", color: TEAM_COLORS[0], parent_team_id: null });
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [orgDragPerson, setOrgDragPerson] = useState(null);
  const [orgDropTarget, setOrgDropTarget] = useState(null);
  const [orgCollapsed, setOrgCollapsed] = useState(new Set());
  const [orgZoom, setOrgZoom] = useState(1);
  const [orgInitialized, setOrgInitialized] = useState(false);
  const [orgFocusId, setOrgFocusId] = useState(null);
  const [teamSearch, setTeamSearch] = useState("");
  const [addingMemberToTeam, setAddingMemberToTeam] = useState(null);
  const [teamMemberSearch, setTeamMemberSearch] = useState("");

  const showToast = (msg, type = "error") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };
  const { gridTemplate: peopleGrid, onResizeStart: peopleResize } = useResizableColumns([200, 140, 100, 80, 80, 80, 80, 120], "people");
  const RH = ({ index }) => (<div onMouseDown={(e) => peopleResize(index, e)} style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 6, cursor: "col-resize", zIndex: 2 }} onMouseEnter={e => e.currentTarget.style.background = T.accent + "40"} onMouseLeave={e => e.currentTarget.style.background = "transparent"} />);
  const ini = (name) => name ? name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() : "?";

  const setView = (v) => { setViewMode(v); try { localStorage.setItem("people_view", v); } catch {} };

  const [keyResults, setKeyResults] = useState([]);
  const [checkIns, setCheckIns] = useState([]);
  // External collaborators — invited via project members, not part of org_memberships.
  // Their profile rows have org_id = NULL, so we resolve them by joining
  // project_members (which IS scoped to the org) → profiles by id.
  const [externals, setExternals] = useState([]); // [{ profile, projects: [{id, name, role, access_scope}] }]

  useEffect(() => {
    if (!profile?.org_id) return;
    (async () => {
      const [mR, omR, tR, pR, pmR, tmR, tmrR, krR] = await Promise.all([
        supabase.from("profiles").select("*").eq("org_id", profile.org_id),
        supabase.from("org_memberships").select("*").eq("org_id", profile.org_id),
        supabase.from("tasks").select("id, title, status, priority, assignee_id, project_id, due_date").eq("org_id", orgId).is("deleted_at", null),
        supabase.from("projects").select("id, name, color").eq("org_id", orgId).is("deleted_at", null),
        supabase.from("project_members").select("*").eq("org_id", orgId),
        supabase.from("teams").select("*").eq("org_id", profile.org_id).is("deleted_at", null).order("name"),
        supabase.from("team_members").select("*"),
        supabase.from("key_results").select("id,title,progress,target_value,unit,owner_id").eq("org_id", orgId).is("deleted_at", null),
      ]);
      setMembers(mR.data || []); setMemberships(omR.data || []); setTasks(tR.data || []); setProjects(pR.data || []); setProjectMembers(pmR.data || []); setTeams(tmR.data || []); setTeamMembers(tmrR.data || []);
      setKeyResults(krR.data || []);
      // Resolve external collaborators: project_members rows where invited_as_external = true.
      // Pull their profile rows separately (org_id is NULL on those, so they're not in mR).
      const externalPm = (pmR.data || []).filter(pm => pm.invited_as_external);
      const externalUserIds = [...new Set(externalPm.map(pm => pm.user_id))];
      let extProfiles = [];
      if (externalUserIds.length) {
        const { data: ep } = await supabase.from("profiles").select("*").in("id", externalUserIds);
        extProfiles = ep || [];
      }
      const extByUser = extProfiles.map(prof => ({
        profile: prof,
        projects: externalPm
          .filter(pm => pm.user_id === prof.id)
          .map(pm => {
            const proj = (pR.data || []).find(p => p.id === pm.project_id);
            return { id: pm.project_id, name: proj?.name || "Unknown project", color: proj?.color, role: pm.role || "member", access_scope: pm.access_scope || { tasks: true } };
          }),
      }));
      setExternals(extByUser);
      // Load recent check-ins
      if (krR.data?.length) {
        const { data: ciData } = await supabase.from("okr_check_ins")
          .select("key_result_id,created_at,health_status,value")
          .in("key_result_id", krR.data.map(k => k.id))
          .order("created_at", { ascending: false });
        setCheckIns(ciData || []);
      }
      setLoading(false);
    })();
  }, [profile?.org_id]);

  const getMembership = (uid) => memberships.find(m => m.user_id === uid);
  const getPermMode = (uid) => {
    const om = getMembership(uid);
    if (!om) return null;
    if (om.role === "owner" || om.role === "admin") return { mode: "admin", label: "FULL", color: "#22c55e" };
    const perms = om.module_permissions || {};
    if (perms._default_deny === true) {
      const grants = Object.keys(perms).filter(k => k !== "_default_deny" && perms[k] === true).length;
      return { mode: "allow", label: grants === 0 ? "NO MODULES" : `${grants} GRANTED`, color: grants === 0 ? "#ef4444" : "#3b82f6" };
    }
    const blocks = Object.keys(perms).filter(k => perms[k] === false).length;
    if (blocks > 0) return { mode: "block", label: `${blocks} BLOCKED`, color: "#f59e0b" };
    return { mode: "full", label: "FULL", color: "#22c55e" };
  };
  const getStats = (uid) => { const ut = tasks.filter(t => t.assignee_id === uid); return { open: ut.filter(t => t.status !== "done").length, done: ut.filter(t => t.status === "done").length, total: ut.length, overdue: ut.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== "done").length, projs: [...new Set(ut.map(t => t.project_id).filter(Boolean))] }; };

  const filtered = members.filter(m => {
    if (search && !m.display_name?.toLowerCase().includes(search.toLowerCase()) && !m.email?.toLowerCase().includes(search.toLowerCase()) && !m.title?.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterRole) { const om = getMembership(m.id); if (om?.role !== filterRole) return false; }
    if (filterDept && m.department !== filterDept) return false;
    return true;
  });
  const departments = [...new Set(members.map(m => m.department).filter(Boolean))].sort();

  const inviteUser = async () => {
    if (!inviteEmail.trim()) return showToast("Email required");
    if (!inviteName.trim()) return showToast("Name required");
    try {
      // Build module_permissions: default-deny baseline + explicit grants per checkbox
      const modulePerms = { _default_deny: true };
      inviteAllowedModules.forEach(k => { modulePerms[k] = true; });
      const res = await fetch("https://upbjdmnykheubxkuknuj.supabase.co/functions/v1/invite-user", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwYmpkbW55a2hldWJ4a3VrbnVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNDI3OTcsImV4cCI6MjA4NzcxODc5N30.pvTTkiZWNDPuo-Fdzm54uy8w1mlx0AjB5jtFm3MeGq4" },
        body: JSON.stringify({
          email: inviteEmail.trim(),
          display_name: inviteName.trim(),
          role: inviteRole,
          org_id: profile.org_id,
          module_permissions: modulePerms,
        }),
      });
      const result = await res.json();
      if (result.error) return showToast("Failed: " + result.error);
      const userId = result.user_id;
      // Save extra profile fields
      const extra = {};
      if (inviteTitle.trim()) extra.title = inviteTitle.trim();
      if (inviteDept) extra.department = inviteDept;
      if (invitePhone.trim()) extra.phone = invitePhone.trim();
      if (inviteLocation.trim()) extra.location = inviteLocation.trim();
      if (inviteStartDate) extra.start_date = inviteStartDate;
      if (inviteReportsTo) extra.reports_to = inviteReportsTo;
      if (inviteEmploymentType) extra.employment_type = inviteEmploymentType;
      if (invitePersonalEmail.trim()) extra.personal_email = invitePersonalEmail.trim();
      if (Object.keys(extra).length > 0) {
        await supabase.from("profiles").update(extra).eq("org_id", orgId).eq("id", userId);
      }
      const newMember = { id: userId, display_name: inviteName.trim(), email: inviteEmail.trim(), org_id: profile.org_id, ...extra };
      setMembers(p => [...p.filter(m => m.id !== userId), newMember]);
      setMemberships(p => { const exists = p.find(m => m.user_id === userId); return exists ? p : [...p, { org_id: profile.org_id, user_id: userId, role: inviteRole, is_active: true, module_permissions: modulePerms }]; });
      setInviteEmail(""); setInviteName(""); setInviteRole("member"); setInviteTitle(""); setInviteDept(""); setInvitePhone(""); setInviteLocation(""); setInviteStartDate(""); setInviteReportsTo(""); setInviteEmploymentType("full_time"); setInvitePersonalEmail(""); setInviteAllowedModules([]); setShowInvite(false);
      showToast(result.existing ? "User already exists — added to org" : "Invite sent to " + inviteEmail.trim(), "success");
    } catch (e) {
      showToast("Failed: " + e.message);
    }
  };

  const updateRole = async (uid, newRole) => { const om = getMembership(uid); if (!om) return; const { error } = await supabase.from("org_memberships").update({ role: newRole }).eq("org_id", orgId).eq("id", om.id); if (error) return showToast("Failed to update role"); setMemberships(p => p.map(m => m.id === om.id ? { ...m, role: newRole } : m)); showToast("Role updated", "success"); };
  const permScrollRef = React.useRef(0);
  useEffect(() => { if (permScrollRef.current > 0) { setTimeout(() => { const el = document.querySelector("[data-perm-scroll]"); if (el) el.scrollTop = permScrollRef.current; }, 10); } }, [memberships]);
  const toggleModuleAccess = async (uid, mod) => {
    const om = getMembership(uid);
    if (!om) return;
    const perms = om.module_permissions || {};
    const isDefaultDeny = perms._default_deny === true;
    let updated;
    if (isDefaultDeny) {
      // Allow-list mode: toggle the explicit `true` flag for this module
      const currentlyAllowed = perms[mod] === true;
      updated = { ...perms, [mod]: !currentlyAllowed };
      if (currentlyAllowed) delete updated[mod]; // remove the key entirely instead of setting false
    } else {
      // Legacy block mode: toggle the explicit `false` flag
      const currentlyAllowed = perms[mod] !== false;
      updated = { ...perms, [mod]: !currentlyAllowed ? true : false };
    }
    const scrollEl = document.querySelector("[data-perm-scroll]");
    permScrollRef.current = scrollEl?.scrollTop || 0;
    await supabase.from("org_memberships").update({ module_permissions: updated }).eq("org_id", orgId).eq("id", om.id);
    setMemberships(p => p.map(m => m.id === om.id ? { ...m, module_permissions: updated } : m));
  };
  const toggleProjectAccess = async (uid, projectId) => { const existing = projectMembers.find(pm => pm.user_id === uid && pm.project_id === projectId); if (existing) { await supabase.from("project_members").delete().eq("org_id", orgId).eq("id", existing.id); setProjectMembers(p => p.filter(pm => pm.id !== existing.id)); } else { const { data, error } = await supabase.from("project_members").insert({ project_id: projectId, user_id: uid, role: "member" }).select().single(); if (!error && data) setProjectMembers(p => [...p, data]); } };
  const deactivateUser = async (uid) => { const om = getMembership(uid); if (!om) return; const newActive = !om.is_active; const updates = { is_active: newActive }; if (!newActive) updates.deactivated_at = new Date().toISOString(); else updates.deactivated_at = null; const { error } = await supabase.from("org_memberships").update(updates).eq("org_id", orgId).eq("id", om.id); if (error) return showToast("Failed to update"); setMemberships(p => p.map(m => m.id === om.id ? { ...m, ...updates } : m)); showToast(newActive ? "User reactivated" : "User deactivated", "success"); };
  const removeUser = async (uid) => {
    try {
      const res = await fetch("https://upbjdmnykheubxkuknuj.supabase.co/functions/v1/remove-user", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwYmpkbW55a2hldWJ4a3VrbnVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNDI3OTcsImV4cCI6MjA4NzcxODc5N30.pvTTkiZWNDPuo-Fdzm54uy8w1mlx0AjB5jtFm3MeGq4" },
        body: JSON.stringify({ user_id: uid }),
      });
      const result = await res.json();
      if (result.error) { console.error("[People] Remove failed:", result.error); return; }
    } catch (e) { console.error("[People] Remove failed:", e); }
    setMembers(p => p.filter(m => m.id !== uid));
    setMemberships(p => p.filter(m => m.user_id !== uid));
    setProjectMembers(p => p.filter(pm => pm.user_id !== uid));
    setTeamMembers(p => p.filter(tm => tm.user_id !== uid));
    if (selected?.id === uid) setSelected(null);
  };
  const deleteUser = async (uid) => { if (!confirm("Permanently remove this user?")) return; await removeUser(uid); showToast("User removed", "success"); };
  const hasModuleAccess = (uid, mod) => {
    const om = getMembership(uid);
    if (!om) return true;
    if (om.role === "owner" || om.role === "admin") return true;
    const perms = om.module_permissions || {};
    const isDefaultDeny = perms._default_deny === true;
    if (isDefaultDeny) {
      // Allow-list mode: only show as ON if explicitly granted
      if (perms[mod] === true) return true;
      // Check ancestor grants too
      const parts = mod.split(".");
      for (let i = 1; i < parts.length; i++) {
        const ancestor = parts.slice(0, i).join(".");
        if (perms[ancestor] === true) return true;
      }
      return false;
    }
    // Legacy block mode
    if (perms[mod] === false) return false;
    const parts = mod.split(".");
    for (let i = 1; i <= parts.length; i++) {
      const ancestor = parts.slice(0, i).join(".");
      if (perms[ancestor] === false) return false;
    }
    return true;
  };
  const hasProjectAccess = (uid, pid) => projectMembers.some(pm => pm.user_id === uid && pm.project_id === pid);

  // Team CRUD
  const createTeam = async () => { if (!teamForm.name.trim()) return showToast("Team name required"); const { data, error } = await supabase.from("teams").insert({ org_id: profile.org_id, name: teamForm.name.trim(), description: teamForm.description, color: teamForm.color, parent_team_id: teamForm.parent_team_id || null, created_by: user.id }).select().single(); if (error) return showToast("Failed to create team"); setTeams(p => [...p, data]); setShowTeamForm(false); setTeamForm({ name: "", description: "", color: TEAM_COLORS[0], parent_team_id: null }); showToast("Team created", "success"); };
  const deleteTeam = async (tid) => { if (!confirm("Delete this team?")) return; await supabase.from("team_members").delete().eq("team_id", tid); await supabase.from("teams").update({ deleted_at: new Date().toISOString() }).eq("org_id", orgId).eq("id", tid); setTeams(p => p.filter(t => t.id !== tid)); setTeamMembers(p => p.filter(tm => tm.team_id !== tid)); if (selectedTeam === tid) setSelectedTeam(null); showToast("Team deleted", "success"); };
  const addTeamMember = async (teamId, userId) => { const exists = teamMembers.find(tm => tm.team_id === teamId && tm.user_id === userId); if (exists) return; const { data, error } = await supabase.from("team_members").insert({ team_id: teamId, user_id: userId }).select().single(); if (!error && data) { setTeamMembers(p => [...p, data]); showToast("Member added", "success"); } };
  const removeTeamMember = async (tmId) => { await supabase.from("team_members").delete().eq("org_id", orgId).eq("id", tmId); setTeamMembers(p => p.filter(tm => tm.id !== tmId)); };

  // === Searchable Person Picker (reusable) ===
  const SearchablePicker = ({ people, selected: selIds, onToggle, placeholder }) => {
    const [q, setQ] = useState("");
    const filt = people.filter(u => !q || u.display_name?.toLowerCase().includes(q.toLowerCase()) || u.email?.toLowerCase().includes(q.toLowerCase()));
    return (<div>
      <div style={{ padding: "6px 10px", borderBottom: `1px solid ${T.border}`, position: "sticky", top: 0, background: T.surface, zIndex: 1 }}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder || "Search people…"} style={{ width: "100%", padding: "6px 8px", borderRadius: 5, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 12, outline: "none", boxSizing: "border-box" }} />
      </div>
      <div style={{ maxHeight: 220, overflow: "auto" }}>
        {filt.length === 0 && <div style={{ padding: 12, fontSize: 12, color: T.text3, textAlign: "center" }}>No matches</div>}
        {filt.map(u => { const isSel = selIds?.includes(u.id); const c = acol(u.id); return (
          <div key={u.id} onClick={() => onToggle(u.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 12px", cursor: "pointer", background: isSel ? T.accentDim : "transparent", borderBottom: `1px solid ${T.border}` }} onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = T.surface2; }} onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = isSel ? T.accentDim : "transparent"; }}>
            {selIds && <div style={{ width: 14, height: 14, borderRadius: 3, border: `2px solid ${isSel ? T.accent : T.border}`, background: isSel ? T.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{isSel && <svg width="8" height="8" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" /></svg>}</div>}
            <div style={{ width: 26, height: 26, borderRadius: 13, background: `${c}18`, border: `1.5px solid ${c}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: c, flexShrink: 0 }}>{ini(u.display_name)}</div>
            <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12, fontWeight: 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.display_name || "Unknown"}</div><div style={{ fontSize: 10, color: T.text3 }}>{u.email}</div></div>
          </div>); })}
      </div>
    </div>);
  };

  // === CARDS VIEW ===
  const MemberCards = () => (<div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
    {filtered.map(member => { const c = acol(member.id); const stats = getStats(member.id); const om = getMembership(member.id); const sel = selected?.id === member.id; const isMe = member.id === user?.id; const active = om?.is_active !== false; return (
      <div key={member.id} onClick={() => setSelected(member)} style={{ padding: "18px 20px", borderRadius: 12, cursor: "pointer", background: sel ? `${T.accent}08` : T.surface, border: `1px solid ${sel ? T.accent + "40" : T.border}`, opacity: active ? 1 : 0.5, transition: "border-color 0.15s" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
          <div style={{ width: 40, height: 40, borderRadius: 20, background: `${c}18`, border: `2px solid ${c}50`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: c, flexShrink: 0 }}>{ini(member.display_name)}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{member.display_name || "Unknown"}</span>
              {isMe && <span style={{ fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 4, background: `${T.accent}20`, color: T.accent }}>You</span>}
              {!active && <span style={{ fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 4, background: T.redDim, color: T.red }}>Inactive</span>}
            </div>
            <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>{member.email || "—"}</div>
          </div>
          {om?.role && <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 8, background: (ROLE_COLORS[om.role] || T.text3) + "18", color: ROLE_COLORS[om.role] || T.text3, textTransform: "capitalize" }}>{om.role}</span>}
          {(() => { const pm = getPermMode(member.id); return pm ? (<span title={`Permission mode: ${pm.mode}`} style={{ fontSize: 8, padding: "2px 6px", borderRadius: 3, background: pm.color + "15", color: pm.color, fontWeight: 700, letterSpacing: 0.5 }}>{pm.label}</span>) : null; })()}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 8 }}>
          <div style={{ textAlign: "center", padding: "6px 0", background: T.surface2, borderRadius: 6 }}><div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{stats.open}</div><div style={{ fontSize: 9, color: T.text3 }}>Open</div></div>
          <div style={{ textAlign: "center", padding: "6px 0", background: T.surface2, borderRadius: 6 }}><div style={{ fontSize: 16, fontWeight: 700, color: T.green }}>{stats.done}</div><div style={{ fontSize: 9, color: T.text3 }}>Done</div></div>
          <div style={{ textAlign: "center", padding: "6px 0", background: T.surface2, borderRadius: 6 }}><div style={{ fontSize: 16, fontWeight: 700, color: stats.overdue > 0 ? T.red : T.text3 }}>{stats.overdue}</div><div style={{ fontSize: 9, color: T.text3 }}>Overdue</div></div>
        </div>
      </div>); })}
  </div>);

  const ToggleSwitch = ({ on, onClick }) => (<button onClick={onClick} style={{ width: 36, height: 20, borderRadius: 10, border: "none", cursor: "pointer", background: on ? T.green : T.surface3, position: "relative", transition: "background 0.2s", flexShrink: 0 }}><div style={{ width: 16, height: 16, borderRadius: 8, background: "#fff", position: "absolute", top: 2, left: on ? 18 : 2, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} /></button>);
  const ActionBtn = ({ icon, label, color, onClick }) => (<button onClick={(e) => { e.stopPropagation(); onClick(); }} title={label} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 6, border: `1px solid ${color || T.border}`, background: "transparent", cursor: "pointer", color: color || T.text3, transition: "background 0.1s" }} onMouseEnter={e => e.currentTarget.style.background = (color || T.text3) + "15"} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>{icon}</button>);

  // === LIST VIEW ===
  const MemberList = () => { const colH = { fontSize: 11, fontWeight: 600, color: T.text3, textTransform: "uppercase", letterSpacing: "0.04em", padding: "8px 12px", position: "relative" }; return (
    <div style={{ borderRadius: 10, border: `1px solid ${T.border}`, overflow: "hidden" }}>
      {/* Bulk action bar */}
      {selectedPeople.size > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", marginBottom: 4, borderRadius: 8, background: T.accentDim, border: `1px solid ${T.accent}30` }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: T.accent }}>{selectedPeople.size} selected</span>
          <div style={{ flex: 1 }} />
          <button onClick={async () => {
            for (const uid of selectedPeople) { const om = getMembership(uid); if (om?.is_active === false) { await supabase.from("org_memberships").update({ is_active: true }).eq("org_id", orgId).eq("user_id", uid).eq("org_id", profile?.org_id); setMemberships(p => p.map(m => m.user_id === uid ? { ...m, is_active: true } : m)); } }
            setSelectedPeople(new Set());
          }} style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: "#22c55e", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>✓ Activate</button>
          <button onClick={async () => {
            for (const uid of selectedPeople) { await supabase.from("org_memberships").update({ is_active: false }).eq("org_id", orgId).eq("user_id", uid).eq("org_id", profile?.org_id); setMemberships(p => p.map(m => m.user_id === uid ? { ...m, is_active: false } : m)); }
            setSelectedPeople(new Set());
          }} style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: "#eab308", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>⊘ Deactivate</button>
          <button onClick={async () => {
            if (!confirm(`Remove ${selectedPeople.size} member${selectedPeople.size !== 1 ? "s" : ""}? This cannot be undone.`)) return;
            for (const uid of selectedPeople) { await removeUser(uid); }
            setSelectedPeople(new Set());
            showToast(`${selectedPeople.size} members removed`, "success");
          }} style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid #ef444440`, background: "#ef444410", color: "#ef4444", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>✕ Remove</button>
        </div>
      )}
      <div style={{ display: "grid", gridTemplateColumns: `32px ${peopleGrid}`, background: T.surface, borderBottom: `1px solid ${T.border}` }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "8px 0" }}>
          <input type="checkbox" checked={selectedPeople.size > 0 && selectedPeople.size === filtered.length} onChange={() => {
            setSelectedPeople(p => p.size === filtered.length ? new Set() : new Set(filtered.map(m => m.id)));
          }} style={{ width: 14, height: 14, accentColor: T.accent, cursor: "pointer" }} />
        </div>
        <div style={colH}>Name<RH index={0} /></div><div style={colH}>Email<RH index={1} /></div><div style={colH}>Role<RH index={2} /></div><div style={colH}>Projects<RH index={3} /></div><div style={colH}>Tasks<RH index={4} /></div><div style={colH}>Done<RH index={5} /></div><div style={colH}>Overdue<RH index={6} /></div><div style={{ ...colH, textAlign: "right" }}>Actions</div>
      </div>
      {filtered.map(member => { const c = acol(member.id); const stats = getStats(member.id); const om = getMembership(member.id); const isMe = member.id === user?.id; const active = om?.is_active !== false; const isOwner = om?.role === "owner"; const hov = hoveredRow === member.id; const sel = selected?.id === member.id; const checked = selectedPeople.has(member.id); return (
        <div key={member.id} onMouseEnter={() => setHoveredRow(member.id)} onMouseLeave={() => setHoveredRow(null)}
          style={{ display: "grid", gridTemplateColumns: `32px ${peopleGrid}`, alignItems: "center", borderBottom: `1px solid ${T.border}`, cursor: "pointer", background: checked ? T.accentDim : sel ? T.accentDim : hov ? T.surface2 : "transparent", opacity: active ? 1 : 0.5, transition: "background 0.1s" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center" }} onClick={e => { e.stopPropagation(); setSelectedPeople(p => { const n = new Set(p); n.has(member.id) ? n.delete(member.id) : n.add(member.id); return n; }); }}>
            <input type="checkbox" checked={checked} readOnly style={{ width: 14, height: 14, accentColor: T.accent, cursor: "pointer" }} />
          </div>
          <div onClick={() => setSelected(member)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px" }}>
            <div style={{ width: 32, height: 32, borderRadius: 16, background: `${c}18`, border: `2px solid ${c}50`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: c, flexShrink: 0 }}>{ini(member.display_name)}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{member.display_name || "Unknown"}</span>
                {isMe && <span style={{ fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: T.accentDim, color: T.accent }}>You</span>}
                {!active && <span style={{ fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: T.redDim, color: T.red }}>Off</span>}
                {(() => { const pm = getPermMode(member.id); return pm ? (<span title={`Permission mode: ${pm.mode}`} style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3, background: pm.color + "15", color: pm.color, fontWeight: 700, letterSpacing: 0.4 }}>{pm.label}</span>) : null; })()}
              </div>
              {(member.title || member.department) && <div style={{ fontSize: 10, color: T.text3, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{member.title}{member.title && member.department ? " · " : ""}{member.department}{member.sub_department ? ` / ${member.sub_department}` : ""}</div>}
            </div>
          </div>
          <div style={{ padding: "0 12px", fontSize: 12, color: T.text3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{member.email || "—"}</div>
          <div style={{ padding: "0 12px" }}><select value={om?.role || "member"} onChange={e => { e.stopPropagation(); updateRole(member.id, e.target.value); }} onClick={e => e.stopPropagation()} disabled={isOwner && isMe} style={{ padding: "3px 6px", borderRadius: 5, border: "1px solid transparent", background: (ROLE_COLORS[om?.role] || T.text3) + "15", color: ROLE_COLORS[om?.role] || T.text3, fontSize: 11, fontWeight: 600, cursor: "pointer", outline: "none", textTransform: "capitalize", width: "100%" }}>{ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}</select></div>
          <div style={{ padding: "0 12px", fontSize: 12, fontWeight: 600, color: T.text2 }}>{stats.projs.length}</div>
          <div style={{ padding: "0 12px", fontSize: 12, fontWeight: 600, color: T.accent }}>{stats.total}</div>
          <div style={{ padding: "0 12px", fontSize: 12, fontWeight: 600, color: T.green }}>{stats.done}</div>
          <div style={{ padding: "0 12px", fontSize: 12, fontWeight: 600, color: stats.overdue > 0 ? T.red : T.text3 }}>{stats.overdue}</div>
          <div style={{ padding: "0 12px", display: "flex", gap: 4, justifyContent: "flex-end" }}>
            {(hov || sel) && !isMe && <>
              <ActionBtn onClick={() => deactivateUser(member.id)} color={active ? "#f59e0b" : T.green} label={active ? "Deactivate" : "Reactivate"} icon={active ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M4 12h16"/></svg> : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/></svg>} />
              {!isOwner && <ActionBtn onClick={() => deleteUser(member.id)} color={T.red} label="Remove" icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg>} />}
            </>}
          </div>
        </div>); })}
    </div>); };

  // === TEAMS VIEW ===
  const TeamsView = () => {
    const filteredTeams = teams.filter(t => !teamSearch || t.name?.toLowerCase().includes(teamSearch.toLowerCase()));
    return (<div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", borderRadius: 8, background: T.surface2, border: `1px solid ${T.border}`, flex: 1 }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.text3} strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg><input value={teamSearch} onChange={e => setTeamSearch(e.target.value)} placeholder="Search teams…" style={{ background: "transparent", border: "none", outline: "none", color: T.text, fontSize: 12, width: "100%", fontFamily: "inherit" }} /></div>
        <button onClick={() => setShowTeamForm(true)} style={{ padding: "7px 16px", borderRadius: 8, background: T.accent, color: "#fff", border: "none", fontSize: 12, cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 6, whiteSpace: "nowrap" }}>+ New Team</button>
      </div>
      {filteredTeams.length === 0 && <div style={{ textAlign: "center", padding: 40, color: T.text3 }}><div style={{ fontSize: 32, marginBottom: 8 }}>👥</div><div style={{ fontSize: 14, marginBottom: 4 }}>No teams yet</div><div style={{ fontSize: 12 }}>Create a team to organize your people</div></div>}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
        {filteredTeams.filter(t => !t.parent_team_id).map(team => {
          const tms = teamMembers.filter(tm => tm.team_id === team.id);
          const tmProfiles = tms.map(tm => members.find(m => m.id === tm.user_id)).filter(Boolean);
          const isExp = selectedTeam === team.id;
          const subTeams = teams.filter(t => t.parent_team_id === team.id);
          const totalMembers = tms.length + subTeams.reduce((s, st) => s + teamMembers.filter(tm => tm.team_id === st.id).length, 0);
          return (<React.Fragment key={team.id}>
            <div style={{ borderRadius: 10, border: `1px solid ${isExp ? T.accent + "40" : T.border}`, background: T.surface, overflow: "hidden", transition: "border-color 0.15s", gridColumn: "1 / -1" }}>
              <div onClick={() => setSelectedTeam(isExp ? null : team.id)} style={{ padding: "16px 18px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: (team.color || TEAM_COLORS[0]) + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, color: team.color || TEAM_COLORS[0], flexShrink: 0 }}>{team.name?.[0]?.toUpperCase()}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{team.name}{subTeams.length > 0 && <span style={{ fontSize: 11, color: T.text3, fontWeight: 400, marginLeft: 6 }}>({subTeams.length} sub-team{subTeams.length !== 1 ? "s" : ""})</span>}</div>
                  <div style={{ fontSize: 11, color: T.text3, marginTop: 1 }}>{totalMembers} member{totalMembers !== 1 ? "s" : ""}{team.description ? ` · ${team.description}` : ""}</div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={(e) => { e.stopPropagation(); setTeamForm({ name: "", description: "", color: team.color || TEAM_COLORS[0], parent_team_id: team.id }); setShowTeamForm(true); }} title="Add sub-team" style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${T.border}`, background: "transparent", cursor: "pointer", color: T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700 }}>+</button>
                  <button onClick={(e) => { e.stopPropagation(); deleteTeam(team.id); }} title="Delete team" style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${T.border}`, background: "transparent", cursor: "pointer", color: T.text3, display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.text3} strokeWidth="2" style={{ transition: "transform 0.2s", transform: isExp ? "rotate(180deg)" : "rotate(0)" }}><path d="M6 9l6 6 6-6"/></svg>
                </div>
              </div>
              {isExp && <div style={{ borderTop: `1px solid ${T.border}`, padding: "12px 18px" }}>
                {tmProfiles.map(m => { const c = acol(m.id); const tm = tms.find(t => t.user_id === m.id); return (
                  <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: `1px solid ${T.border}` }}>
                    <div style={{ width: 28, height: 28, borderRadius: 14, background: `${c}18`, border: `1.5px solid ${c}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: c }}>{ini(m.display_name)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{m.display_name}</span>
                      <span style={{ fontSize: 11, color: T.text3, marginLeft: 8 }}>{m.email}</span>
                    </div>
                    <button onClick={() => removeTeamMember(tm.id)} style={{ width: 22, height: 22, borderRadius: 4, border: `1px solid ${T.border}`, background: "transparent", cursor: "pointer", color: T.text3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10 }}>×</button>
                  </div>); })}
                {addingMemberToTeam === team.id ? (
                  <div style={{ marginTop: 8, border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden" }}>
                    <SearchablePicker people={members.filter(m => !tms.some(t => t.user_id === m.id))} onToggle={(uid) => { addTeamMember(team.id, uid); }} placeholder="Search to add member…" />
                    <div style={{ padding: 6, borderTop: `1px solid ${T.border}`, textAlign: "right" }}><button onClick={() => setAddingMemberToTeam(null)} style={{ padding: "4px 12px", borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface2, color: T.text3, fontSize: 11, cursor: "pointer" }}>Done</button></div>
                  </div>
                ) : (
                  <button onClick={() => setAddingMemberToTeam(team.id)} style={{ marginTop: 8, padding: "6px 12px", borderRadius: 6, border: `1px dashed ${T.border}`, background: "transparent", color: T.accent, fontSize: 12, cursor: "pointer", width: "100%", fontWeight: 500 }}>+ Add Member</button>
                )}
                {/* Sub-teams inside expanded parent */}
                {subTeams.length > 0 && <div style={{ marginTop: 12, borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Sub-teams</div>
                  {subTeams.map(sub => {
                    const stms = teamMembers.filter(tm => tm.team_id === sub.id);
                    const stmProfiles = stms.map(tm => members.find(m => m.id === tm.user_id)).filter(Boolean);
                    const isSubExp = selectedTeam === sub.id;
                    return (
                      <div key={sub.id} style={{ marginLeft: 8, borderRadius: 8, border: `1px solid ${isSubExp ? T.accent + "40" : T.border}`, background: T.bg, overflow: "hidden", marginBottom: 6 }}>
                        <div onClick={(e) => { e.stopPropagation(); setSelectedTeam(isSubExp ? null : sub.id); }} style={{ padding: "10px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
                          <div style={{ width: 26, height: 26, borderRadius: 6, background: (sub.color || team.color || TEAM_COLORS[0]) + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: sub.color || team.color || TEAM_COLORS[0], flexShrink: 0 }}>{sub.name?.[0]?.toUpperCase()}</div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{sub.name}</div>
                            <div style={{ fontSize: 10, color: T.text3 }}>{stms.length} member{stms.length !== 1 ? "s" : ""}{sub.description ? ` · ${sub.description}` : ""}</div>
                          </div>
                          <button onClick={(e) => { e.stopPropagation(); deleteTeam(sub.id); }} title="Delete" style={{ width: 22, height: 22, borderRadius: 5, border: `1px solid ${T.border}`, background: "transparent", cursor: "pointer", color: T.text3, display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={T.text3} strokeWidth="2" style={{ transition: "transform 0.2s", transform: isSubExp ? "rotate(180deg)" : "rotate(0)" }}><path d="M6 9l6 6 6-6"/></svg>
                        </div>
                        {isSubExp && <div style={{ borderTop: `1px solid ${T.border}`, padding: "8px 14px" }}>
                          {stmProfiles.map(m => { const c2 = acol(m.id); const tm2 = stms.find(t => t.user_id === m.id); return (
                            <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", borderBottom: `1px solid ${T.border}` }}>
                              <div style={{ width: 22, height: 22, borderRadius: 11, background: `${c2}18`, border: `1px solid ${c2}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: c2 }}>{ini(m.display_name)}</div>
                              <span style={{ fontSize: 12, fontWeight: 500, flex: 1 }}>{m.display_name}</span>
                              <button onClick={() => removeTeamMember(tm2.id)} style={{ width: 18, height: 18, borderRadius: 3, border: `1px solid ${T.border}`, background: "transparent", cursor: "pointer", color: T.text3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8 }}>×</button>
                            </div>); })}
                          {addingMemberToTeam === sub.id ? (
                            <div style={{ marginTop: 6, border: `1px solid ${T.border}`, borderRadius: 6, overflow: "hidden" }}>
                              <SearchablePicker people={members.filter(m => !stms.some(t => t.user_id === m.id))} onToggle={(uid) => { addTeamMember(sub.id, uid); }} placeholder="Search to add…" />
                              <div style={{ padding: 4, borderTop: `1px solid ${T.border}`, textAlign: "right" }}><button onClick={() => setAddingMemberToTeam(null)} style={{ padding: "2px 8px", borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface2, color: T.text3, fontSize: 10, cursor: "pointer" }}>Done</button></div>
                            </div>
                          ) : (
                            <button onClick={() => setAddingMemberToTeam(sub.id)} style={{ marginTop: 6, padding: "4px 8px", borderRadius: 5, border: `1px dashed ${T.border}`, background: "transparent", color: T.accent, fontSize: 11, cursor: "pointer", width: "100%", fontWeight: 500 }}>+ Add Member</button>
                          )}
                        </div>}
                      </div>
                    );
                  })}
                </div>}
              </div>}
            </div>
          </React.Fragment>); })}
      </div>
    </div>);
  };

  // === DETAIL PANEL ===
  const DetailPanel = () => { if (!selected) return null; const c = acol(selected.id); const stats = getStats(selected.id); const om = getMembership(selected.id); const memberTasks = tasks.filter(t => t.assignee_id === selected.id && t.status !== "done").sort((a, b) => { if (!a.due_date) return 1; if (!b.due_date) return -1; return new Date(a.due_date) - new Date(b.due_date); }).slice(0, 12); const memberProjs = stats.projs.map(pid => projects.find(p => p.id === pid)).filter(Boolean); const isMe = selected.id === user?.id; const isOwner = om?.role === "owner"; const userTeams = teamMembers.filter(tm => tm.user_id === selected.id).map(tm => teams.find(t => t.id === tm.team_id)).filter(Boolean); return (
    <div style={{ width: isMobile ? "100%" : 380, position: isMobile ? "fixed" : "relative", inset: isMobile ? 0 : "auto", zIndex: isMobile ? 50 : "auto", borderLeft: `1px solid ${T.border}`, background: T.surface, flexShrink: 0, overflow: "auto", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: `1px solid ${T.border}` }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: T.text3 }}>Member Details</span>
        <button onClick={() => setSelected(null)} style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text3, cursor: "pointer", width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>×</button>
      </div>
      <div style={{ padding: "20px 20px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
          <div style={{ width: 52, height: 52, borderRadius: 26, background: `${c}18`, border: `2px solid ${c}50`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, color: c }}>{ini(selected.display_name)}</div>
          <div style={{ flex: 1 }}>
            <EditableField value={selected.display_name || ""} placeholder="Full name"
              style={{ fontSize: 18, fontWeight: 700, color: T.text, width: "100%" }}
              onSave={async (v) => { await supabase.from("profiles").update({ display_name: v }).eq("org_id", orgId).eq("id", selected.id); setSelected(s => ({ ...s, display_name: v })); setMembers(p => p.map(m => m.id === selected.id ? { ...m, display_name: v } : m)); }} />
            <EditableField value={selected.email || ""} placeholder="Email address"
              style={{ fontSize: 12, color: T.text3, marginTop: 2, width: "100%" }}
              onSave={async (v) => {
                await supabase.from("profiles").update({ email: v }).eq("org_id", orgId).eq("id", selected.id);
                setSelected(s => ({ ...s, email: v })); setMembers(p => p.map(m => m.id === selected.id ? { ...m, email: v } : m));
                const res = await fetch("https://upbjdmnykheubxkuknuj.supabase.co/functions/v1/invite-user", {
                  method: "POST", headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ action: "update_email", user_id: selected.id, email: v }),
                });
                const result = await res.json();
                if (result.error) showToast("Profile updated. Auth: " + result.error);
                else showToast("Email updated", "success");
              }} />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: T.text3, width: 60 }}>Role</span>
          <select value={om?.role || "member"} onChange={e => updateRole(selected.id, e.target.value)} disabled={isOwner && isMe} style={{ flex: 1, padding: "5px 8px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 12, cursor: "pointer", outline: "none" }}>
            {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, position: "relative" }}>
          <span style={{ fontSize: 12, color: T.text3, width: 60 }}>Reports to</span>
          {(() => {
            const currentSup = members.find(m => m.id === selected.reports_to);
            const opts = members.filter(m => m.id !== selected.id);
            const filtered = reportsSearch
              ? opts.filter(m => (m.display_name || "").toLowerCase().includes(reportsSearch.toLowerCase()) || (m.email || "").toLowerCase().includes(reportsSearch.toLowerCase()))
              : opts;
            return (
              <div style={{ flex: 1, position: "relative" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 6, border: `1px solid ${reportsSearchOpen ? T.accent : T.border}`, background: T.surface2, cursor: "pointer" }}
                  onClick={() => { setReportsSearchOpen(true); setReportsSearch(""); }}>
                  {!reportsSearchOpen ? (
                    <span style={{ fontSize: 12, color: currentSup ? T.text : T.text3, flex: 1 }}>
                      {currentSup ? currentSup.display_name || currentSup.email : "— No supervisor —"}
                    </span>
                  ) : (
                    <input autoFocus value={reportsSearch} onChange={e => setReportsSearch(e.target.value)}
                      onBlur={() => setTimeout(() => setReportsSearchOpen(false), 200)}
                      placeholder="Search by name or email..."
                      style={{ flex: 1, fontSize: 12, border: "none", outline: "none", background: "transparent", color: T.text, padding: 0 }} />
                  )}
                  {selected.reports_to && !reportsSearchOpen && (
                    <span onClick={async (e) => { e.stopPropagation(); await supabase.from("profiles").update({ reports_to: null }).eq("org_id", orgId).eq("id", selected.id); setMembers(p => p.map(m => m.id === selected.id ? { ...m, reports_to: null } : m)); setSelected(s => ({ ...s, reports_to: null })); }}
                      style={{ fontSize: 11, color: T.text3, cursor: "pointer", padding: "0 4px" }} title="Clear">✕</span>
                  )}
                  <span style={{ fontSize: 10, color: T.text3 }}>▾</span>
                </div>
                {reportsSearchOpen && (
                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 100, maxHeight: 200, overflow: "auto", border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface, boxShadow: "0 4px 12px rgba(0,0,0,0.15)", marginTop: 2 }}>
                    <div onClick={async () => { await supabase.from("profiles").update({ reports_to: null }).eq("org_id", orgId).eq("id", selected.id); setMembers(p => p.map(m => m.id === selected.id ? { ...m, reports_to: null } : m)); setSelected(s => ({ ...s, reports_to: null })); setReportsSearchOpen(false); }}
                      style={{ padding: "7px 10px", fontSize: 12, color: T.text3, cursor: "pointer", borderBottom: `1px solid ${T.border}` }}
                      onMouseEnter={e => e.currentTarget.style.background = T.surface2} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      — No supervisor —
                    </div>
                    {filtered.slice(0, 20).map(m => (
                      <div key={m.id} onClick={async () => { await supabase.from("profiles").update({ reports_to: m.id }).eq("org_id", orgId).eq("id", selected.id); setMembers(p => p.map(x => x.id === selected.id ? { ...x, reports_to: m.id } : x)); setSelected(s => ({ ...s, reports_to: m.id })); setReportsSearchOpen(false); }}
                        style={{ padding: "7px 10px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", borderBottom: `1px solid ${T.border}` }}
                        onMouseEnter={e => e.currentTarget.style.background = T.surface2} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <div style={{ width: 22, height: 22, borderRadius: 11, background: acol(m.id) + "20", color: acol(m.id), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, flexShrink: 0 }}>{ini(m.display_name)}</div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.display_name || "Unknown"}</div>
                          <div style={{ fontSize: 10, color: T.text3 }}>{m.job_title || m.email || ""}</div>
                        </div>
                        {m.id === selected.reports_to && <span style={{ fontSize: 10, color: T.accent, marginLeft: "auto" }}>✓</span>}
                      </div>
                    ))}
                    {filtered.length === 0 && <div style={{ padding: "12px 10px", fontSize: 11, color: T.text3, textAlign: "center" }}>No matches found</div>}
                    {filtered.length > 20 && <div style={{ padding: "6px 10px", fontSize: 10, color: T.text3, textAlign: "center" }}>Showing first 20 — type to narrow</div>}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
        {selected.reports_to && (() => {
          const sup = members.find(m => m.id === selected.reports_to);
          return sup ? (
            <div onClick={() => setSelected(sup)} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, padding: "6px 10px", background: T.surface2, borderRadius: 6, cursor: "pointer" }}>
              <div style={{ width: 24, height: 24, borderRadius: 12, background: acol(sup.id) + "20", color: acol(sup.id), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700 }}>{ini(sup.display_name)}</div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.text }}>{sup.display_name}</div>
                <div style={{ fontSize: 10, color: T.text3 }}>Direct Supervisor</div>
              </div>
            </div>
          ) : null;
        })()}
        {/* Profile fields */}
        <div style={{ background: T.surface2, borderRadius: 8, padding: "10px 12px", marginBottom: 12 }}>
          {[["Title", "title"], ["Department", "department"], ["Sub-Department", "sub_department"], ["Location", "location"]].map(([label, field]) => (
            <div key={field} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 11, color: T.text3, width: 90, flexShrink: 0 }}>{label}</span>
              <input defaultValue={selected[field] || ""} key={selected.id + "-" + field}
                onBlur={async (e) => { const v = e.target.value.trim() || null; if (v === (selected[field] || null)) return; await supabase.from("profiles").update({ [field]: v }).eq("org_id", orgId).eq("id", selected.id); setMembers(p => p.map(m => m.id === selected.id ? { ...m, [field]: v } : m)); setSelected(s => ({ ...s, [field]: v })); }}
                onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
                placeholder={`No ${label.toLowerCase()}`}
                style={{ flex: 1, padding: "4px 8px", borderRadius: 5, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontSize: 11, outline: "none", boxSizing: "border-box" }} />
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
          {!isMe && <button onClick={async () => {
            try {
              const res = await fetch("https://upbjdmnykheubxkuknuj.supabase.co/functions/v1/invite-user", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwYmpkbW55a2hldWJ4a3VrbnVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNDI3OTcsImV4cCI6MjA4NzcxODc5N30.pvTTkiZWNDPuo-Fdzm54uy8w1mlx0AjB5jtFm3MeGq4" },
                body: JSON.stringify({ email: selected.email, display_name: selected.display_name, role: om?.role || "member", org_id: profile.org_id, resend: true }),
              });
              const result = await res.json();
              if (result.error) { showToast("Failed: " + result.error); return; }
              // If user ID was refreshed (deleted and re-created), update local state
              if (result.refreshed && result.user_id && result.user_id !== selected.id) {
                setMembers(p => p.map(m => m.id === selected.id ? { ...m, id: result.user_id } : m));
                setMemberships(p => p.map(m => m.user_id === selected.id ? { ...m, user_id: result.user_id } : m));
                setSelected(s => ({ ...s, id: result.user_id }));
              }
              showToast(result.message || "Invite resent!", "success");
            } catch (e) { showToast("Failed: " + e.message); }
          }} style={{ flex: 1, padding: "7px 0", borderRadius: 6, border: `1px solid ${T.accent}30`, background: T.accentDim, color: T.accent, fontSize: 12, cursor: "pointer", fontWeight: 500 }}>📧 Resend Invite</button>}
          {!isMe && <button onClick={async () => {
            try {
              const res = await fetch("https://upbjdmnykheubxkuknuj.supabase.co/functions/v1/invite-user", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwYmpkbW55a2hldWJ4a3VrbnVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNDI3OTcsImV4cCI6MjA4NzcxODc5N30.pvTTkiZWNDPuo-Fdzm54uy8w1mlx0AjB5jtFm3MeGq4" },
                body: JSON.stringify({ email: selected.email, display_name: selected.display_name, resend: true }),
              });
              const result = await res.json();
              if (result.error) showToast("Failed: " + result.error);
              else showToast(result.message || "Password reset sent!", "success");
            } catch (e) { showToast("Failed: " + e.message); }
          }} style={{ flex: 1, padding: "7px 0", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text2, fontSize: 12, cursor: "pointer", fontWeight: 500 }}>🔑 Reset Password</button>}
          {!isMe && <button onClick={() => deactivateUser(selected.id)} style={{ padding: "7px 12px", borderRadius: 6, border: `1px solid ${T.border}`, background: om?.is_active !== false ? T.surface2 : T.greenDim, color: om?.is_active !== false ? T.text2 : T.green, fontSize: 12, cursor: "pointer", fontWeight: 500 }}>{om?.is_active !== false ? "Deactivate" : "Reactivate"}</button>}
          {!isMe && !isOwner && <button onClick={() => deleteUser(selected.id)} style={{ padding: "7px 12px", borderRadius: 6, border: `1px solid ${T.red}30`, background: T.redDim, color: T.red, fontSize: 12, cursor: "pointer", fontWeight: 500 }}>Remove</button>}
        </div>
      </div>
      <div style={{ display: "flex", borderBottom: `1px solid ${T.border}`, padding: isMobile ? "0 10px" : "0 20px" }}>
        {["overview", "approval", "permissions"].map(t => <button key={t} onClick={() => setTab(t)} style={{ padding: "8px 16px", fontSize: 12, fontWeight: tab === t ? 600 : 400, color: tab === t ? T.accent : T.text3, background: "none", border: "none", borderBottom: tab === t ? `2px solid ${T.accent}` : "2px solid transparent", cursor: "pointer", textTransform: "capitalize" }}>{t === "approval" ? "Approval" : t}</button>)}
      </div>
      <div data-perm-scroll="1" style={{ flex: 1, overflow: "auto", padding: 20 }}>
        {tab === "overview" && <>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
            {[{ l: "Total", v: stats.total, c: T.text }, { l: "Open", v: stats.open, c: T.accent }, { l: "Done", v: stats.done, c: T.green }, { l: "Overdue", v: stats.overdue, c: stats.overdue > 0 ? T.red : T.text3 }].map(s => (
              <div key={s.l} style={{ textAlign: "center", padding: "8px 0", background: T.surface2, borderRadius: 8 }}><div style={{ fontSize: 18, fontWeight: 700, color: s.c }}>{s.v}</div><div style={{ fontSize: 9, color: T.text3, marginTop: 2 }}>{s.l}</div></div>))}
          </div>
          {userTeams.length > 0 && <div style={{ marginBottom: 20 }}><div style={{ fontSize: 12, fontWeight: 700, color: T.text3, marginBottom: 8 }}>Teams</div><div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{userTeams.map(t => <span key={t.id} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, background: (t.color || T.accent) + "15", color: t.color || T.accent, fontWeight: 600 }}>{t.name}</span>)}</div></div>}
          {memberProjs.length > 0 && <div style={{ marginBottom: 20 }}><div style={{ fontSize: 12, fontWeight: 700, color: T.text3, marginBottom: 8 }}>Projects</div><div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{memberProjs.map(p => <span key={p.id} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, background: `${p.color || T.accent}15`, color: p.color || T.accent, fontWeight: 600 }}>{p.name}</span>)}</div></div>}
          <div style={{ fontSize: 12, fontWeight: 700, color: T.text3, marginBottom: 8 }}>Open Tasks</div>
          {memberTasks.length === 0 && <div style={{ fontSize: 12, color: T.text3, padding: 8 }}>No open tasks</div>}
          {memberTasks.map(t => { const proj = projects.find(p => p.id === t.project_id); const od = t.due_date && new Date(t.due_date) < new Date(); return (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 6, background: T.surface2, marginBottom: 4, border: `1px solid ${T.border}` }}>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div><div style={{ fontSize: 10, color: T.text3, marginTop: 1 }}>{proj?.name || "—"}</div></div>
              {t.due_date && <span style={{ fontSize: 10, fontWeight: 600, color: od ? T.red : T.text3, flexShrink: 0 }}>{new Date(t.due_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
            </div>); })}

          {/* KR Ownership */}
          {(() => {
            const memberKRs = keyResults.filter(kr => kr.owner_id === selected.id);
            if (memberKRs.length === 0) return null;
            return (
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text3, marginBottom: 8 }}>Key Results Owned</div>
                {memberKRs.map(kr => {
                  const pct = Math.round(Number(kr.progress || 0));
                  const lastCI = checkIns.find(c => c.key_result_id === kr.id);
                  const dAgo = lastCI ? Math.floor((Date.now() - new Date(lastCI.created_at).getTime()) / 86400000) : null;
                  const isStale = dAgo === null || dAgo >= 7;
                  const pColor = pct >= 70 ? "#22c55e" : pct >= 40 ? "#eab308" : "#ef4444";
                  return (
                    <div key={kr.id} style={{ padding: "9px 10px", borderRadius: 6, background: T.surface2, marginBottom: 4, border: `1px solid ${isStale ? "#eab30840" : T.border}` }}>
                      <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{kr.title}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, height: 4, borderRadius: 2, background: T.surface3 }}>
                          <div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", borderRadius: 2, background: pColor }} />
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 700, color: pColor, minWidth: 28 }}>{pct}%</span>
                        <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: isStale ? "#ef444415" : T.accentDim, color: isStale ? "#ef4444" : T.accent, fontWeight: 600 }}>
                          {dAgo === null ? "no check-in" : dAgo === 0 ? "today" : `${dAgo}d ago`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </>}
        {tab === "approval" && <>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.text3, marginBottom: 4 }}>Spend Approval Settings</div>
            <div style={{ fontSize: 11, color: T.text3, marginBottom: 14 }}>Controls how this person's spend requests are routed and auto-approved in Finance.</div>
          </div>
          {/* AF Role */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: T.text3, marginBottom: 4 }}>Finance Role</div>
            <div style={{ display: "flex", gap: 0, border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden" }}>
              {[["requester","Requester"],["approver","Approver"],["admin","Admin"]].map(([v,l]) => (
                <button key={v} onClick={async () => { 
                  const membership = getMembership(selected?.id); 
                  if (!membership?.id) { showToast("No membership found for this user"); return; } 
                  const { error } = await supabase.from("org_memberships").update({ af_role: v }).eq("org_id", orgId).eq("id", membership.id); 
                  if (error) { showToast("Error: " + error.message); return; }
                  setMemberships(p => p.map(m => m.id === membership.id ? { ...m, af_role: v } : m)); 
                  showToast("Finance role → " + l, "success"); 
                }}
                  style={{ flex: 1, padding: "9px 0", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, borderRadius: 0,
                    background: om?.af_role === v ? T.accent : "transparent", color: om?.af_role === v ? "#fff" : T.text3, transition: "all 0.12s" }}>{l}</button>
              ))}
            </div>
            <div style={{ fontSize: 10, color: T.text3, marginTop: 6 }}>
              {om?.af_role === "admin" ? "Can approve any request, manage rules, and delete requests" : om?.af_role === "approver" ? "Can approve, reject, and request info on pending requests" : "Can only submit requests — approvals routed to approvers"}
            </div>
          </div>
          {/* Spend Limit */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: T.text3, marginBottom: 4 }}>Auto-Approve Limit</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 13, color: T.text3 }}>$</span>
              <input type="number" defaultValue={om?.af_spend_limit || 500}
                onBlur={async (e) => { if (!om?.id) return; const val = parseFloat(e.target.value) || 0; await supabase.from("org_memberships").update({ af_spend_limit: val }).eq("org_id", orgId).eq("id", om.id); setMemberships(p => p.map(m => m.id === om.id ? { ...m, af_spend_limit: val } : m)); showToast("Spend limit updated", "success"); }}
                onKeyDown={async (e) => { if (e.key === "Enter") { if (!om?.id) return; const val = parseFloat(e.target.value) || 0; await supabase.from("org_memberships").update({ af_spend_limit: val }).eq("org_id", orgId).eq("id", om.id); setMemberships(p => p.map(m => m.id === om.id ? { ...m, af_spend_limit: val } : m)); showToast("Spend limit updated", "success"); e.target.blur(); } }}
                style={{ flex: 1, padding: "8px 10px", borderRadius: 7, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 14, fontWeight: 700, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div style={{ fontSize: 10, color: T.text3, marginTop: 6 }}>Requests below this amount auto-approve without routing through the approval chain</div>
          </div>
          {/* Level */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: T.text3, marginBottom: 4 }}>Org Level</div>
            <select defaultValue={om?.af_level || "IC"} onChange={async (e) => { if (!om?.id) return; await supabase.from("org_memberships").update({ af_level: e.target.value }).eq("org_id", orgId).eq("id", om.id); setMemberships(p => p.map(m => m.id === om.id ? { ...m, af_level: e.target.value } : m)); showToast("Level updated", "success"); }}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 7, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, cursor: "pointer", outline: "none", boxSizing: "border-box" }}>
              {["IC","Senior IC","Lead","Manager","Director","VP","C-Suite","Contractor"].map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <div style={{ fontSize: 10, color: T.text3, marginTop: 6 }}>Used for default spend limits and approval chain routing</div>
          </div>
          {/* Summary card */}
          <div style={{ background: T.surface2, borderRadius: 8, padding: "12px 14px", marginTop: 8 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", marginBottom: 8 }}>Current Settings</div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 8 }}>
              <div><div style={{ fontSize: 9, color: T.text3 }}>Role</div><div style={{ fontSize: 12, fontWeight: 700, color: om?.af_role === "admin" ? "#5B21B6" : om?.af_role === "approver" ? "#1D4ED8" : T.text3, textTransform: "capitalize" }}>{om?.af_role || "requester"}</div></div>
              <div><div style={{ fontSize: 9, color: T.text3 }}>Limit</div><div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>${(om?.af_spend_limit || 500).toLocaleString()}</div></div>
              <div><div style={{ fontSize: 9, color: T.text3 }}>Level</div><div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{om?.af_level || "IC"}</div></div>
            </div>
          </div>
        </>}
        {tab === "permissions" && <>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.text3, marginBottom: 10 }}>Module Access</div>
            {(om?.role === "owner" || om?.role === "admin") && <div style={{ fontSize: 11, color: T.accent, marginBottom: 10, padding: "6px 10px", background: T.accentDim, borderRadius: 6 }}>Admins and owners have access to all modules</div>}
            {MODULE_TREE.map(mod => {
              const parentOn = hasModuleAccess(selected.id, mod.key);
              const isAdm = om?.role === "owner" || om?.role === "admin";
              return (
              <div key={mod.key}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: mod.children ? "none" : `1px solid ${T.border}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, opacity: 0.6 }}>{mod.icon}</span>
                    <span style={{ fontSize: 13, color: T.text, fontWeight: mod.children ? 600 : 400 }}>{mod.label}</span>
                    {mod.children && <span style={{ fontSize: 9, color: T.text3, marginLeft: 4 }}>({mod.children.length})</span>}
                  </div>
                  <ToggleSwitch on={parentOn} onClick={() => { if (!isAdm) toggleModuleAccess(selected.id, mod.key); }} />
                </div>
                {mod.children && parentOn && (
                  <div style={{ paddingLeft: 28, paddingBottom: 8, borderBottom: `1px solid ${T.border}` }}>
                    {mod.children.map(sub => {
                      const subOn = hasModuleAccess(selected.id, sub.key);
                      return (
                        <div key={sub.key}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "5px 0" }}>
                            <span style={{ fontSize: 12, color: subOn ? T.text2 : T.text3, fontWeight: sub.children ? 600 : 400 }}>{sub.label}{sub.children ? ` (${sub.children.length})` : ""}</span>
                            <ToggleSwitch on={subOn} onClick={() => { if (!isAdm) toggleModuleAccess(selected.id, sub.key); }} />
                          </div>
                          {sub.children && subOn && (
                            <div style={{ paddingLeft: 20, paddingBottom: 4 }}>
                              {sub.children.map(leaf => {
                                const leafOn = hasModuleAccess(selected.id, leaf.key);
                                return (
                                  <div key={leaf.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "3px 0" }}>
                                    <span style={{ fontSize: 11, color: leafOn ? T.text3 : T.text3 + "80" }}>{leaf.label}</span>
                                    <ToggleSwitch on={leafOn} onClick={() => { if (!isAdm) toggleModuleAccess(selected.id, leaf.key); }} />
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>);
            })}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.text3, marginBottom: 10 }}>Project Access</div>
            {projects.map(p => { const has = hasProjectAccess(selected.id, p.id); return (
              <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}><div style={{ width: 8, height: 8, borderRadius: 4, background: p.color || T.accent }} /><span style={{ fontSize: 13, color: T.text }}>{p.name}</span></div>
                <ToggleSwitch on={has} onClick={() => toggleProjectAccess(selected.id, p.id)} />
              </div>); })}
          </div>
        </>}
      </div>
    </div>); };

  // === MODALS ===
  const DEPARTMENTS = ["Executive","Marketing","Operations","Finance","Customer Delight","R&D/Product","Retail Sales","Community Engagement","Engineering","HR","Legal"];
  const inviteModal = showInvite && (
    <div onClick={() => setShowInvite(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "min(520px, 95vw)", maxHeight: "90vh", overflow: "auto", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <div style={{ width: 40, height: 40, borderRadius: 20, background: T.accent + "15", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>👤</div>
          <div>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: T.text, margin: 0 }}>Add Team Member</h3>
            <div style={{ fontSize: 11, color: T.text3 }}>They'll receive an invite email to join Helm</div>
          </div>
        </div>
        {/* Required fields */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: T.text3, display: "block", marginBottom: 4 }}>Full Name <span style={{ color: T.red }}>*</span></label>
            <input value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="Jane Smith"
              style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: T.text3, display: "block", marginBottom: 4 }}>Email <span style={{ color: T.red }}>*</span></label>
            <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="jane@earthbreeze.com" type="email"
              style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
          </div>
        </div>
        {/* Role & Department */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: T.text3, display: "block", marginBottom: 4 }}>Role</label>
            <select value={inviteRole} onChange={e => setInviteRole(e.target.value)}
              style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, outline: "none", cursor: "pointer" }}>
              {ROLES.filter(r => r !== "owner").map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: T.text3, display: "block", marginBottom: 4 }}>Department</label>
            <select value={inviteDept} onChange={e => setInviteDept(e.target.value)}
              style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, outline: "none", cursor: "pointer" }}>
              <option value="">Select department...</option>
              {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>
        {/* Job Title & Phone */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: T.text3, display: "block", marginBottom: 4 }}>Job Title</label>
            <input value={inviteTitle} onChange={e => setInviteTitle(e.target.value)} placeholder="e.g. Marketing Manager"
              style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: T.text3, display: "block", marginBottom: 4 }}>Phone</label>
            <input value={invitePhone} onChange={e => setInvitePhone(e.target.value)} placeholder="+1 (555) 123-4567" type="tel"
              style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
          </div>
        </div>
        {/* Location & Start Date */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: T.text3, display: "block", marginBottom: 4 }}>Location</label>
            <input value={inviteLocation} onChange={e => setInviteLocation(e.target.value)} placeholder="e.g. Portland, OR"
              style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: T.text3, display: "block", marginBottom: 4 }}>Start Date</label>
            <input value={inviteStartDate} onChange={e => setInviteStartDate(e.target.value)} type="date"
              style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
          </div>
        </div>
        {/* Employment Type & Personal Email */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: T.text3, display: "block", marginBottom: 4 }}>Employment Type</label>
            <select value={inviteEmploymentType} onChange={e => setInviteEmploymentType(e.target.value)}
              style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, outline: "none", cursor: "pointer" }}>
              <option value="full_time">Full Time</option>
              <option value="part_time">Part Time</option>
              <option value="contractor">Contractor</option>
              <option value="intern">Intern</option>
              <option value="temporary">Temporary</option>
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 600, color: T.text3, display: "block", marginBottom: 4 }}>Personal Email</label>
            <input value={invitePersonalEmail} onChange={e => setInvitePersonalEmail(e.target.value)} placeholder="personal@gmail.com" type="email"
              style={{ width: "100%", padding: "9px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
          </div>
        </div>
        {/* Reports To */}
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: T.text3, display: "block", marginBottom: 4 }}>Reports To</label>
          <div style={{ position: "relative" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 10px", borderRadius: 6, border: `1px solid ${inviteReportsOpen ? T.accent : T.border}`, background: T.surface2, cursor: "pointer" }}
              onClick={() => { setInviteReportsOpen(true); setInviteReportsSearch(""); }}>
              {!inviteReportsOpen ? (
                <span style={{ fontSize: 13, color: inviteReportsTo ? T.text : T.text3, flex: 1 }}>
                  {inviteReportsTo ? (members.find(m => m.id === inviteReportsTo)?.display_name || "Selected") : "Select supervisor..."}
                </span>
              ) : (
                <input autoFocus value={inviteReportsSearch} onChange={e => setInviteReportsSearch(e.target.value)}
                  onBlur={() => setTimeout(() => setInviteReportsOpen(false), 200)}
                  placeholder="Search by name..." style={{ flex: 1, fontSize: 13, border: "none", outline: "none", background: "transparent", color: T.text, padding: 0 }} />
              )}
              {inviteReportsTo && !inviteReportsOpen && <span onClick={e => { e.stopPropagation(); setInviteReportsTo(""); }} style={{ fontSize: 11, color: T.text3, cursor: "pointer", padding: "0 4px" }}>✕</span>}
              <span style={{ fontSize: 10, color: T.text3 }}>▾</span>
            </div>
            {inviteReportsOpen && (
              <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 110, maxHeight: 180, overflow: "auto", border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface, boxShadow: "0 4px 12px rgba(0,0,0,0.15)", marginTop: 2 }}>
                {members.filter(m => !inviteReportsSearch || (m.display_name || "").toLowerCase().includes(inviteReportsSearch.toLowerCase())).slice(0, 15).map(m => (
                  <div key={m.id} onClick={() => { setInviteReportsTo(m.id); setInviteReportsOpen(false); }}
                    style={{ padding: "7px 10px", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", borderBottom: `1px solid ${T.border}` }}
                    onMouseEnter={e => e.currentTarget.style.background = T.surface2} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <div style={{ width: 22, height: 22, borderRadius: 11, background: acol(m.id) + "20", color: acol(m.id), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700 }}>{ini(m.display_name)}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{m.display_name}</div>
                    <div style={{ fontSize: 10, color: T.text3 }}>{m.title || m.department || ""}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        {/* Module Access — what this user will see */}
        <div style={{ marginBottom: 20, padding: 12, background: T.accent + "06", border: `1px solid ${T.accent}30`, borderRadius: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <label style={{ fontSize: 12, fontWeight: 700, color: T.text }}>Module Access</label>
            <span style={{ fontSize: 10, color: T.text3 }}>
              {inviteAllowedModules.length === 0 ? "No modules — Dashboard + Settings only" : `${inviteAllowedModules.length} module${inviteAllowedModules.length === 1 ? "" : "s"} granted`}
            </span>
          </div>
          <div style={{ fontSize: 10, color: T.text3, marginBottom: 8 }}>
            New users default to <strong>no access</strong>. Check the modules this person needs to see. You can change this anytime in their profile.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 4 }}>
            {[
              { k: "projects", l: "Projects" },
              { k: "okrs", l: "OKRs" },
              { k: "scorecard", l: "Scorecard" },
              { k: "scoreboard", l: "Scoreboard" },
              { k: "messages", l: "Messages" },
              { k: "calendar", l: "Calendar" },
              { k: "calls", l: "Calls" },
              { k: "docs", l: "Docs" },
              { k: "learning", l: "Learning" },
              { k: "support", l: "Support" },
              { k: "campaigns", l: "Campaigns" },
              { k: "plm", l: "PLM" },
              { k: "erp", l: "ERP" },
              { k: "wms", l: "WMS" },
              { k: "finance", l: "Finance" },
              { k: "automation", l: "Automation" },
              { k: "reports", l: "Reports" },
              { k: "people", l: "People" },
              { k: "demand_planning", l: "Demand Planning" },
              { k: "launches", l: "Launches" },
            ].map(opt => {
              const checked = inviteAllowedModules.includes(opt.k);
              return (
                <label key={opt.k} style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 6px", fontSize: 11, cursor: "pointer", borderRadius: 4, background: checked ? T.accent + "12" : "transparent" }}>
                  <input type="checkbox" checked={checked}
                    onChange={() => setInviteAllowedModules(p => checked ? p.filter(x => x !== opt.k) : [...p, opt.k])} />
                  <span style={{ color: checked ? T.accent : T.text2, fontWeight: checked ? 600 : 400 }}>{opt.l}</span>
                </label>
              );
            })}
          </div>
          <div style={{ marginTop: 8, display: "flex", gap: 6, fontSize: 10 }}>
            <button type="button"
              onClick={() => setInviteAllowedModules(["projects","okrs","scorecard","messages","calendar","docs","learning"])}
              style={{ padding: "3px 8px", fontSize: 10, fontWeight: 600, background: "transparent", color: T.accent, border: `1px dashed ${T.accent}50`, borderRadius: 4, cursor: "pointer" }}>
              Quick: Standard employee
            </button>
            <button type="button"
              onClick={() => setInviteAllowedModules([])}
              style={{ padding: "3px 8px", fontSize: 10, fontWeight: 600, background: "transparent", color: T.text3, border: `1px dashed ${T.border}`, borderRadius: 4, cursor: "pointer" }}>
              Clear
            </button>
          </div>
        </div>
        {/* Actions */}
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 8, borderTop: `1px solid ${T.border}` }}>
          <button onClick={() => setShowInvite(false)} style={{ padding: "9px 18px", borderRadius: 6, background: T.surface3, color: T.text2, border: "none", fontSize: 13, cursor: "pointer" }}>Cancel</button>
          <button onClick={inviteUser} disabled={!inviteEmail.trim() || !inviteName.trim()}
            style={{ padding: "9px 22px", borderRadius: 6, background: T.accent, color: "#fff", border: "none", fontSize: 13, cursor: "pointer", fontWeight: 600, opacity: !inviteEmail.trim() || !inviteName.trim() ? 0.5 : 1 }}>
            Send Invite
          </button>
        </div>
      </div>
    </div>);

  const teamFormModal = showTeamForm && (
    <div onClick={() => setShowTeamForm(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "min(400px, 95vw)", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: T.text, margin: "0 0 16px" }}>{teamForm.parent_team_id ? "New Sub-team" : "New Team"}</h3>
        {teamForm.parent_team_id && (() => { const parent = teams.find(t => t.id === teamForm.parent_team_id); return parent ? (
          <div style={{ marginBottom: 12, padding: "8px 12px", borderRadius: 6, background: T.accentDim, fontSize: 12, color: T.accent, display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontWeight: 600 }}>Sub-team of:</span> {parent.name}
            <button onClick={() => setTeamForm(p => ({ ...p, parent_team_id: null }))} style={{ marginLeft: "auto", background: "none", border: "none", color: T.accent, cursor: "pointer", fontSize: 11 }}>✕ Remove</button>
          </div>
        ) : null; })()}
        <div style={{ marginBottom: 12 }}><label style={{ fontSize: 12, fontWeight: 500, color: T.text3, display: "block", marginBottom: 4 }}>Team Name</label><input value={teamForm.name} onChange={e => setTeamForm(p => ({ ...p, name: e.target.value }))} placeholder={teamForm.parent_team_id ? "e.g. Manufacturing" : "e.g. Operations"} style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, outline: "none", boxSizing: "border-box" }} /></div>
        <div style={{ marginBottom: 12 }}><label style={{ fontSize: 12, fontWeight: 500, color: T.text3, display: "block", marginBottom: 4 }}>Description</label><input value={teamForm.description} onChange={e => setTeamForm(p => ({ ...p, description: e.target.value }))} placeholder="Optional description" style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, outline: "none", boxSizing: "border-box" }} /></div>
        {!teamForm.parent_team_id && teams.filter(t => !t.parent_team_id).length > 0 && (
          <div style={{ marginBottom: 12 }}><label style={{ fontSize: 12, fontWeight: 500, color: T.text3, display: "block", marginBottom: 4 }}>Parent Team (optional)</label>
            <select value={teamForm.parent_team_id || ""} onChange={e => setTeamForm(p => ({ ...p, parent_team_id: e.target.value || null }))}
              style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, cursor: "pointer" }}>
              <option value="">None (top-level team)</option>
              {teams.filter(t => !t.parent_team_id).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
        )}
        <div style={{ marginBottom: 16 }}><label style={{ fontSize: 12, fontWeight: 500, color: T.text3, display: "block", marginBottom: 6 }}>Color</label><div style={{ display: "flex", gap: 6 }}>{TEAM_COLORS.map(c => <div key={c} onClick={() => setTeamForm(p => ({ ...p, color: c }))} style={{ width: 28, height: 28, borderRadius: 14, background: c, cursor: "pointer", border: teamForm.color === c ? "3px solid #fff" : "3px solid transparent", boxShadow: teamForm.color === c ? `0 0 0 2px ${c}` : "none" }} />)}</div></div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><button onClick={() => setShowTeamForm(false)} style={{ padding: "8px 16px", borderRadius: 6, background: T.surface3, color: T.text2, border: "none", fontSize: 13, cursor: "pointer" }}>Cancel</button><button onClick={createTeam} style={{ padding: "8px 16px", borderRadius: 6, background: T.accent, color: "#fff", border: "none", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>Create Team</button></div>
      </div>
    </div>);

  if (loading) return <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: T.text3, fontSize: 13 }}><div style={{ width: 28, height: 28, border: `3px solid ${T.border}`, borderTopColor: T.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite", marginRight: 10 }} />Loading team…<style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>;

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden", flexDirection: isMobile && selected ? "column" : "row" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes slideIn{from{transform:translateX(20px);opacity:0}to{transform:translateX(0);opacity:1}}`}</style>
      {toast && <div style={{ position: "fixed", top: 16, right: 16, zIndex: 200, padding: "10px 16px", borderRadius: 8, background: toast.type === "success" ? T.greenDim : T.redDim, color: toast.type === "success" ? T.green : T.red, fontSize: 13, fontWeight: 500, boxShadow: "0 4px 16px rgba(0,0,0,0.2)", animation: "slideIn 0.2s ease" }}>{toast.msg}</div>}
      <div style={{ flex: 1, overflow: "auto", padding: isMobile ? "16px 12px" : "28px 32px", display: isMobile && selected ? "none" : "block" }}>
        <div style={{ display: "flex", alignItems: isMobile ? "flex-start" : "center", justifyContent: "space-between", marginBottom: 20, flexDirection: isMobile ? "column" : "row", gap: isMobile ? 12 : 0 }}>
          <div><h1 style={{ fontSize: isMobile ? 18 : 22, fontWeight: 800, marginBottom: 4 }}>Team</h1><p style={{ fontSize: 12, color: T.text3 }}>{members.length} member{members.length !== 1 ? "s" : ""} · {memberships.filter(m => m.is_active !== false).length} active · {teams.length} team{teams.length !== 1 ? "s" : ""}</p></div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {/* View toggle: Cards | List | Teams */}
            <div style={{ display: "flex", borderRadius: 8, border: `1px solid ${T.border}`, overflow: "hidden" }}>
              <button onClick={() => setView("cards")} title="Cards" style={{ padding: "7px 10px", background: viewMode === "cards" ? T.accent : T.surface2, color: viewMode === "cards" ? "#fff" : T.text3, border: "none", cursor: "pointer", display: "flex", alignItems: "center" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg></button>
              <button onClick={() => setView("list")} title="List" style={{ padding: "7px 10px", background: viewMode === "list" ? T.accent : T.surface2, color: viewMode === "list" ? "#fff" : T.text3, border: "none", cursor: "pointer", display: "flex", alignItems: "center", borderLeft: `1px solid ${T.border}` }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg></button>
              <button onClick={() => setView("teams")} title="Teams" style={{ padding: "7px 10px", background: viewMode === "teams" ? T.accent : T.surface2, color: viewMode === "teams" ? "#fff" : T.text3, border: "none", cursor: "pointer", display: "flex", alignItems: "center", borderLeft: `1px solid ${T.border}` }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg></button>
              <button onClick={() => setView("orgchart")} title="Org Chart" style={{ padding: "7px 10px", background: viewMode === "orgchart" ? T.accent : T.surface2, color: viewMode === "orgchart" ? "#fff" : T.text3, border: "none", cursor: "pointer", display: "flex", alignItems: "center", borderLeft: `1px solid ${T.border}`, borderRadius: "0 8px 8px 0" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="2" width="6" height="4" rx="1"/><rect x="2" y="14" width="6" height="4" rx="1"/><rect x="9" y="14" width="6" height="4" rx="1"/><rect x="16" y="14" width="6" height="4" rx="1"/><path d="M12 6v4M5 14v-2a2 2 0 012-2h10a2 2 0 012 2v2M12 10v4"/></svg></button>
            </div>
            {viewMode !== "teams" && <select value={filterRole} onChange={e => setFilterRole(e.target.value)} style={{ padding: "7px 10px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface2, color: filterRole ? T.text : T.text3, fontSize: 12, cursor: "pointer", outline: "none" }}><option value="">All roles</option>{ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}</select>}
            {viewMode !== "teams" && <select value={filterDept} onChange={e => setFilterDept(e.target.value)} style={{ padding: "7px 10px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface2, color: filterDept ? T.text : T.text3, fontSize: 12, cursor: "pointer", outline: "none" }}><option value="">All departments</option>{departments.map(d => <option key={d} value={d}>{d}</option>)}</select>}
            {viewMode !== "teams" && <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", borderRadius: 8, background: T.surface2, border: `1px solid ${T.border}` }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.text3} strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search team…" style={{ background: "transparent", border: "none", outline: "none", color: T.text, fontSize: 12, width: 140, fontFamily: "inherit" }} /></div>}
            <button onClick={() => setShowInvite(true)} style={{ padding: "7px 16px", borderRadius: 8, background: T.accent, color: "#fff", border: "none", fontSize: 12, cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/></svg>Add Member</button>
          </div>
        </div>
        {viewMode === "cards" && <MemberCards />}
        {viewMode === "list" && <div style={{ overflowX: isMobile ? "auto" : "visible" }}><MemberList key="members" /></div>}
        {viewMode === "teams" && <TeamsView key="teams" />}
        {viewMode === "orgchart" && (() => {
          const getChildren = (parentId) => members.filter(m => m.reports_to === parentId).sort((a, b) => (a.display_name || "").localeCompare(b.display_name || ""));
          const roots = members.filter(m => !m.reports_to || !members.find(x => x.id === m.reports_to));
          const hasAnyReporting = members.some(m => m.reports_to);

          const dragPerson = orgDragPerson;
          const setDragPerson = setOrgDragPerson;
          const dropTarget = orgDropTarget;
          const setDropTarget = setOrgDropTarget;

          // Auto-collapse depth 2+ on first render
          if (!orgInitialized && hasAnyReporting) {
            const toCollapse = new Set();
            const walk = (pid, depth) => {
              const kids = getChildren(pid);
              if (depth >= 2 && kids.length > 0) toCollapse.add(pid);
              kids.forEach(k => walk(k.id, depth + 1));
            };
            roots.forEach(r => walk(r.id, 0));
            if (toCollapse.size > 0) { setOrgCollapsed(toCollapse); setOrgInitialized(true); }
            else setOrgInitialized(true);
          }

          const countDescendants = (pid) => {
            const kids = getChildren(pid);
            return kids.length + kids.reduce((s, k) => s + countDescendants(k.id), 0);
          };

          const getDepth = (pid) => {
            const kids = getChildren(pid);
            if (kids.length === 0) return 0;
            return 1 + Math.max(...kids.map(k => getDepth(k.id)));
          };

          const toggleCollapse = (id, e) => {
            e.stopPropagation();
            setOrgCollapsed(prev => {
              const next = new Set(prev);
              next.has(id) ? next.delete(id) : next.add(id);
              return next;
            });
          };

          const expandAll = () => setOrgCollapsed(new Set());
          const collapseAll = () => {
            const all = new Set();
            const walk = (pid) => { const kids = getChildren(pid); if (kids.length > 0) all.add(pid); kids.forEach(k => walk(k.id)); };
            roots.forEach(r => walk(r.id));
            setOrgCollapsed(all);
          };

          const collapseToDepth = (maxDepth) => {
            const collapsed = new Set();
            const walk = (pid, depth) => {
              const kids = getChildren(pid);
              if (kids.length > 0 && depth >= maxDepth) collapsed.add(pid);
              kids.forEach(k => walk(k.id, depth + 1));
            };
            roots.forEach(r => walk(r.id, 0));
            setOrgCollapsed(collapsed);
          };

          const handleDrop = async (targetId) => {
            if (!dragPerson || dragPerson === targetId) { setDragPerson(null); setDropTarget(null); return; }
            const isDescendant = (parentId, checkId) => {
              const kids = getChildren(parentId);
              if (kids.some(k => k.id === checkId)) return true;
              return kids.some(k => isDescendant(k.id, checkId));
            };
            if (isDescendant(dragPerson, targetId)) { setDragPerson(null); setDropTarget(null); return; }
            await supabase.from("profiles").update({ reports_to: targetId }).eq("org_id", orgId).eq("id", dragPerson);
            setMembers(p => p.map(m => m.id === dragPerson ? { ...m, reports_to: targetId } : m));
            if (selected?.id === dragPerson) setSelected(s => ({ ...s, reports_to: targetId }));
            setDragPerson(null); setDropTarget(null);
          };

          const handleUnassign = async () => {
            if (!dragPerson) return;
            await supabase.from("profiles").update({ reports_to: null }).eq("org_id", orgId).eq("id", dragPerson);
            setMembers(p => p.map(m => m.id === dragPerson ? { ...m, reports_to: null } : m));
            if (selected?.id === dragPerson) setSelected(s => ({ ...s, reports_to: null }));
            setDragPerson(null); setDropTarget(null);
          };

          // Focus on subtree
          const focusOnPerson = (pid) => {
            setOrgFocusId(pid);
            // Expand path to this person
            setOrgCollapsed(prev => {
              const next = new Set(prev);
              next.delete(pid);
              return next;
            });
          };

          const clearFocus = () => setOrgFocusId(null);

          // Build breadcrumb path for focused person
          const buildBreadcrumb = (pid) => {
            const path = [];
            let current = members.find(m => m.id === pid);
            while (current) {
              path.unshift(current);
              current = current.reports_to ? members.find(m => m.id === current.reports_to) : null;
            }
            return path;
          };

          const DEPT_COLORS = { "Operations": "#3b82f6", "Marketing": "#f59e0b", "Customer Delight": "#ec4899", "R&D/Product": "#8b5cf6", "Executive": "#10b981", "Retail Sales": "#06b6d4", "Community Engagement": "#f97316" };
          const CARD_W = 164;
          const V_GAP = 40;
          const H_GAP = 10;

          const OrgCard = ({ person, depth = 0 }) => {
            const c = acol(person.id);
            const children = getChildren(person.id);
            const isSel = selected?.id === person.id;
            const isDrag = dragPerson === person.id;
            const isDrop = dropTarget === person.id;
            const isCollapsed = orgCollapsed.has(person.id);
            const descCount = children.length > 0 ? countDescendants(person.id) : 0;
            const deptColor = DEPT_COLORS[person.department] || T.text3;

            return (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                {/* Card */}
                <div
                  draggable
                  onDragStart={(e) => { setDragPerson(person.id); e.dataTransfer.effectAllowed = "move"; }}
                  onDragEnd={() => { setDragPerson(null); setDropTarget(null); }}
                  onDragOver={(e) => { e.preventDefault(); if (dragPerson && dragPerson !== person.id) setDropTarget(person.id); }}
                  onDragLeave={() => { if (dropTarget === person.id) setDropTarget(null); }}
                  onDrop={(e) => { e.preventDefault(); handleDrop(person.id); }}
                  onClick={() => setSelected(person)}
                  onDoubleClick={() => { if (children.length > 0) focusOnPerson(person.id); }}
                  style={{
                    width: CARD_W, padding: "8px 10px", borderRadius: 10, textAlign: "center", position: "relative",
                    background: isDrop ? T.accentDim : isSel ? T.accent + "08" : T.surface,
                    border: "1.5px solid " + (isDrop ? T.accent : isSel ? T.accent : T.border),
                    borderLeft: "3px solid " + deptColor,
                    boxShadow: isDrop ? "0 0 0 3px " + T.accent + "25" : depth === 0 ? "0 3px 12px rgba(0,0,0,0.1)" : "0 1px 4px rgba(0,0,0,0.05)",
                    cursor: isDrag ? "grabbing" : "grab", opacity: isDrag ? 0.4 : 1,
                    transition: "all 0.15s"
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 14, background: c + "15", border: "2px solid " + c + "40", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: c, flexShrink: 0 }}>{ini(person.display_name)}</div>
                    <div style={{ textAlign: "left", minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3 }}>{person.display_name || "Unknown"}</div>
                      {person.title && <div style={{ fontSize: 8, color: T.text3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", lineHeight: 1.3 }}>{person.title}</div>}
                    </div>
                  </div>

                  {/* Collapse/expand toggle */}
                  {children.length > 0 && (
                    <button
                      onClick={(e) => toggleCollapse(person.id, e)}
                      style={{
                        position: "absolute", bottom: -12, left: "50%", transform: "translateX(-50%)", zIndex: 5,
                        height: 20, borderRadius: 10, padding: "0 7px", minWidth: 20,
                        background: isCollapsed ? T.accent : T.surface, border: "1.5px solid " + (isCollapsed ? T.accent : T.border),
                        color: isCollapsed ? "#fff" : T.text3, fontSize: 9, fontWeight: 700,
                        display: "flex", alignItems: "center", justifyContent: "center", gap: 3,
                        cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,0.12)", lineHeight: 1
                      }}
                      title={isCollapsed ? `Expand (${descCount} people)` : "Collapse"}
                    >
                      {isCollapsed ? <>{descCount} <span style={{ fontSize: 8 }}>▸</span></> : <span style={{ fontSize: 10 }}>−</span>}
                    </button>
                  )}

                  {/* Focus button */}
                  {children.length > 0 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); focusOnPerson(person.id); }}
                      style={{
                        position: "absolute", top: 4, right: 4, width: 16, height: 16, borderRadius: 4,
                        background: "transparent", border: "none", color: T.text3, fontSize: 9,
                        cursor: "pointer", opacity: 0.4, display: "flex", alignItems: "center", justifyContent: "center"
                      }}
                      onMouseEnter={e => e.currentTarget.style.opacity = "1"}
                      onMouseLeave={e => e.currentTarget.style.opacity = "0.4"}
                      title="Focus on this subtree"
                    >⤢</button>
                  )}
                </div>

                {/* Children connector + rendering */}
                {children.length > 0 && !isCollapsed && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <svg width="2" height={V_GAP / 2} style={{ display: "block" }}>
                      <line x1="1" y1="0" x2="1" y2={V_GAP / 2} stroke={T.border} strokeWidth="1.5" />
                    </svg>
                    <div style={{ position: "relative", display: "flex", justifyContent: "center" }}>
                      {children.length > 1 && (
                        <svg width="100%" height={V_GAP / 2} style={{ position: "absolute", top: 0, left: 0, right: 0, overflow: "visible" }}>
                          <line x1={100 / (2 * children.length) + "%"} y1="0" x2={(100 - 100 / (2 * children.length)) + "%"} y2="0" stroke={T.border} strokeWidth="1.5" />
                        </svg>
                      )}
                      <div style={{ display: "flex", gap: H_GAP, alignItems: "flex-start" }}>
                        {children.map(child => (
                          <div key={child.id} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                            <svg width="2" height={V_GAP / 2} style={{ display: "block" }}>
                              <line x1="1" y1="0" x2="1" y2={V_GAP / 2} stroke={T.border} strokeWidth="1.5" />
                            </svg>
                            <OrgCard person={child} depth={depth + 1} />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          };

          const focusedPerson = orgFocusId ? members.find(m => m.id === orgFocusId) : null;
          const breadcrumb = focusedPerson ? buildBreadcrumb(orgFocusId) : [];
          const displayRoots = focusedPerson ? [focusedPerson] : roots;

          return (
            <div style={{ position: "relative", minHeight: 300 }}>
              {/* Toolbar */}
              <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderBottom: "1px solid " + T.border, background: T.surface, position: "sticky", top: 0, zIndex: 15, flexWrap: "wrap" }}>
                {/* Depth buttons */}
                <div style={{ display: "flex", alignItems: "center", border: "1px solid " + T.border, borderRadius: 6, overflow: "hidden" }}>
                  {[["All", expandAll], ["L1", () => collapseToDepth(1)], ["L2", () => collapseToDepth(2)], ["L3", () => collapseToDepth(3)]].map(([label, fn], i) => (
                    <button key={label} onClick={fn} style={{ padding: "4px 8px", fontSize: 10, fontWeight: 600, background: T.surface2, color: T.text3, border: "none", borderLeft: i > 0 ? "1px solid " + T.border : "none", cursor: "pointer" }}
                      onMouseEnter={e => { e.currentTarget.style.background = T.accent; e.currentTarget.style.color = "#fff"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = T.surface2; e.currentTarget.style.color = T.text3; }}
                    >{label}</button>
                  ))}
                  <button onClick={collapseAll} style={{ padding: "4px 8px", fontSize: 10, fontWeight: 600, background: T.surface2, color: T.text3, border: "none", borderLeft: "1px solid " + T.border, cursor: "pointer" }}
                    onMouseEnter={e => { e.currentTarget.style.background = T.accent; e.currentTarget.style.color = "#fff"; }}
                    onMouseLeave={e => { e.currentTarget.style.background = T.surface2; e.currentTarget.style.color = T.text3; }}
                  >▪</button>
                </div>

                <div style={{ flex: 1 }} />

                {/* Zoom controls */}
                <span style={{ fontSize: 10, color: T.text3 }}>{Math.round(orgZoom * 100)}%</span>
                <button onClick={() => setOrgZoom(z => Math.max(0.3, z - 0.1))} style={{ width: 24, height: 24, borderRadius: 6, border: "1px solid " + T.border, background: T.surface2, color: T.text3, cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                <button onClick={() => setOrgZoom(1)} style={{ padding: "3px 8px", fontSize: 10, borderRadius: 6, border: "1px solid " + T.border, background: T.surface2, color: T.text3, cursor: "pointer" }}>Fit</button>
                <button onClick={() => setOrgZoom(z => Math.min(2, z + 0.1))} style={{ width: 24, height: 24, borderRadius: 6, border: "1px solid " + T.border, background: T.surface2, color: T.text3, cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>

                {/* Dept legend */}
                <div style={{ display: "flex", gap: 6, marginLeft: 8, flexWrap: "wrap" }}>
                  {Object.entries(DEPT_COLORS).map(([dept, color]) => (
                    <div key={dept} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                      <div style={{ width: 8, height: 3, borderRadius: 1, background: color }} />
                      <span style={{ fontSize: 8, color: T.text3 }}>{dept.length > 12 ? dept.split(" ")[0] : dept}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Breadcrumb (when focused) */}
              {focusedPerson && (
                <div style={{ display: "flex", alignItems: "center", gap: 4, padding: "6px 16px", borderBottom: "1px solid " + T.border, background: T.surface2, fontSize: 11 }}>
                  <button onClick={clearFocus} style={{ background: "none", border: "none", color: T.accent, cursor: "pointer", fontSize: 11, fontWeight: 600, padding: 0 }}>🏢 All</button>
                  {breadcrumb.map((p, i) => (
                    <span key={p.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ color: T.text3 }}>›</span>
                      <button
                        onClick={() => i < breadcrumb.length - 1 ? focusOnPerson(p.id) : null}
                        style={{ background: "none", border: "none", color: i < breadcrumb.length - 1 ? T.accent : T.text, cursor: i < breadcrumb.length - 1 ? "pointer" : "default", fontSize: 11, fontWeight: i === breadcrumb.length - 1 ? 700 : 400, padding: 0 }}
                      >{p.display_name}</button>
                    </span>
                  ))}
                  <span style={{ color: T.text3, marginLeft: 4 }}>({countDescendants(orgFocusId)} people)</span>
                </div>
              )}

              {/* Drag-to-unassign zone */}
              {dragPerson && (
                <div
                  onDragOver={e => { e.preventDefault(); setDropTarget("__unassign__"); }}
                  onDragLeave={() => setDropTarget(null)}
                  onDrop={e => { e.preventDefault(); handleUnassign(); }}
                  style={{
                    position: "sticky", top: 41, zIndex: 10, margin: "0 16px 8px",
                    padding: "8px 20px", borderRadius: 8, textAlign: "center",
                    border: "2px dashed " + (dropTarget === "__unassign__" ? "#EF4444" : T.border),
                    background: dropTarget === "__unassign__" ? "#EF444410" : T.surface2,
                    color: dropTarget === "__unassign__" ? "#EF4444" : T.text3,
                    fontSize: 11, fontWeight: 600
                  }}
                >
                  Drop here to remove from reporting chain
                </div>
              )}

              {/* Chart area with scroll wheel zoom */}
              <div
                style={{ padding: 20, overflow: "auto" }}
                onWheel={e => {
                  if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    setOrgZoom(z => Math.max(0.3, Math.min(2, z - e.deltaY * 0.002)));
                  }
                }}
              >
                {!hasAnyReporting ? (
                  <div style={{ textAlign: "center", padding: 40 }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>🏢</div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 6 }}>No Reporting Structure Set</div>
                    <div style={{ fontSize: 12, color: T.text3, maxWidth: 400, margin: "0 auto", lineHeight: 1.5 }}>
                      Select a team member and set their "Reports to" field to build the org chart. Or drag and drop people onto each other to assign supervisors.
                    </div>
                  </div>
                ) : (
                  <div style={{ transform: "scale(" + orgZoom + ")", transformOrigin: "top center", transition: "transform 0.2s" }}>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0, minWidth: "fit-content", paddingBottom: 40 }}>
                      {displayRoots.map(root => <OrgCard key={root.id} person={root} />)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })()}

        {/* External collaborators — surfaced on cards/list view since they don't
            appear in the standard internal-team grid. Lets you adjust scope or
            remove without diving into individual project pages. */}
        {(viewMode === "cards" || viewMode === "list") && externals.length > 0 && (
          <div style={{ marginTop: 32 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.5 }}>External Collaborators</span>
              <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: "#f59e0b15", color: "#f59e0b", fontWeight: 700, letterSpacing: 0.5 }}>{externals.length}</span>
              <span style={{ fontSize: 11, color: T.text3 }}>People invited to specific projects only — no broader org access</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {externals.map(({ profile: ep, projects: eprojects }) => (
                <div key={ep.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 16, background: "#f59e0b20", color: "#f59e0b", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700 }}>
                      {(ep.display_name || ep.email || "?").slice(0, 2).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{ep.display_name || "Unknown"}</div>
                      <div style={{ fontSize: 11, color: T.text3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ep.email}</div>
                    </div>
                    <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 3, background: "#f59e0b15", color: "#f59e0b", letterSpacing: 0.5 }}>EXTERNAL</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingLeft: 42 }}>
                    {eprojects.map(pj => {
                      const scope = pj.access_scope || {};
                      const scopeLabels = [
                        scope.tasks ? "Tasks" : null,
                        scope.documents ? "Docs" : null,
                        scope.messages ? "Messages" : null,
                      ].filter(Boolean);
                      return (
                        <div key={pj.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", fontSize: 11 }}>
                          {pj.color && <span style={{ width: 6, height: 6, borderRadius: 3, background: pj.color, flexShrink: 0 }} />}
                          <span style={{ color: T.text, fontWeight: 500 }}>{pj.name}</span>
                          <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: T.surface2, color: T.text3, fontWeight: 600, textTransform: "capitalize" }}>{pj.role}</span>
                          <span style={{ color: T.text3, marginLeft: "auto" }}>
                            {scopeLabels.length > 0 ? `Access: ${scopeLabels.join(" · ")}` : <span style={{ color: "#EF4444" }}>No access</span>}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ fontSize: 10, color: T.text3, marginTop: 6, paddingLeft: 42 }}>
                    To change roles or fine-tune access, open the project and click <strong>Project Members</strong>.
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      {viewMode !== "teams" && viewMode !== "orgchart" && <DetailPanel key={selected?.id || "none"} />}
      {viewMode === "orgchart" && selected && <DetailPanel key={selected?.id || "none"} />}
      {inviteModal}
      {teamFormModal}
    </div>
  );
}
