"use client";
import React, { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";
import { useAuth } from "../lib/auth";
import { useResizableColumns } from "../lib/useResizableColumns";

const AVATAR_COLORS = ["#3b82f6","#a855f7","#ec4899","#06b6d4","#f97316","#22c55e","#84cc16","#ef4444"];
const acol = (uid) => uid ? AVATAR_COLORS[uid.charCodeAt(uid.length - 1) % AVATAR_COLORS.length] : T.text3;
const ROLES = ["owner", "admin", "member", "viewer"];
const ROLE_COLORS = { owner: "#ef4444", admin: "#a855f7", member: "#3b82f6", viewer: "#6b7280" };
const MODULES = ["dashboard", "projects", "messages", "calendar", "docs", "okrs", "reports", "campaigns", "plm", "people", "automation", "calls", "settings"];
const TEAM_COLORS = ["#3b82f6","#22c55e","#a855f7","#f97316","#ec4899","#06b6d4","#eab308","#ef4444"];

export default function PeopleView() {
  const { user, profile } = useAuth();
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
  const [tab, setTab] = useState("overview");
  const [filterRole, setFilterRole] = useState("");
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

  useEffect(() => {
    if (!profile?.org_id) return;
    (async () => {
      const [mR, omR, tR, pR, pmR, tmR, tmrR, krR] = await Promise.all([
        supabase.from("profiles").select("*").eq("org_id", profile.org_id),
        supabase.from("org_memberships").select("*").eq("org_id", profile.org_id),
        supabase.from("tasks").select("id, title, status, priority, assignee_id, project_id, due_date").is("deleted_at", null),
        supabase.from("projects").select("id, name, color").is("deleted_at", null),
        supabase.from("project_members").select("*"),
        supabase.from("teams").select("*").eq("org_id", profile.org_id).is("deleted_at", null).order("name"),
        supabase.from("team_members").select("*"),
        supabase.from("key_results").select("id,title,progress,target_value,unit,owner_id").is("deleted_at", null),
      ]);
      setMembers(mR.data || []); setMemberships(omR.data || []); setTasks(tR.data || []); setProjects(pR.data || []); setProjectMembers(pmR.data || []); setTeams(tmR.data || []); setTeamMembers(tmrR.data || []);
      setKeyResults(krR.data || []);
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
  const getStats = (uid) => { const ut = tasks.filter(t => t.assignee_id === uid); return { open: ut.filter(t => t.status !== "done").length, done: ut.filter(t => t.status === "done").length, total: ut.length, overdue: ut.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== "done").length, projs: [...new Set(ut.map(t => t.project_id).filter(Boolean))] }; };

  const filtered = members.filter(m => {
    if (search && !m.display_name?.toLowerCase().includes(search.toLowerCase()) && !m.email?.toLowerCase().includes(search.toLowerCase())) return false;
    if (filterRole) { const om = getMembership(m.id); if (om?.role !== filterRole) return false; }
    return true;
  });

  const inviteUser = async () => {
    if (!inviteEmail.trim()) return showToast("Email required");
    try {
      const res = await fetch("https://upbjdmnykheubxkuknuj.supabase.co/functions/v1/invite-user", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwYmpkbW55a2hldWJ4a3VrbnVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNDI3OTcsImV4cCI6MjA4NzcxODc5N30.pvTTkiZWNDPuo-Fdzm54uy8w1mlx0AjB5jtFm3MeGq4" },
        body: JSON.stringify({ email: inviteEmail.trim(), display_name: inviteName.trim() || inviteEmail.split("@")[0], role: inviteRole, org_id: profile.org_id }),
      });
      const result = await res.json();
      if (result.error) return showToast("Failed: " + result.error);
      const userId = result.user_id;
      setMembers(p => [...p, { id: userId, display_name: inviteName.trim() || inviteEmail.split("@")[0], email: inviteEmail.trim(), org_id: profile.org_id }]);
      setMemberships(p => [...p, { org_id: profile.org_id, user_id: userId, role: inviteRole, is_active: true }]);
      setInviteEmail(""); setInviteName(""); setInviteRole("member"); setShowInvite(false);
      showToast(result.existing ? "User already exists — added to org" : "Invite sent to " + inviteEmail.trim(), "success");
    } catch (e) {
      showToast("Failed: " + e.message);
    }
  };

  const updateRole = async (uid, newRole) => { const om = getMembership(uid); if (!om) return; const { error } = await supabase.from("org_memberships").update({ role: newRole }).eq("id", om.id); if (error) return showToast("Failed to update role"); setMemberships(p => p.map(m => m.id === om.id ? { ...m, role: newRole } : m)); showToast("Role updated", "success"); };
  const toggleModuleAccess = async (uid, mod) => { const om = getMembership(uid); if (!om) return; const perms = om.module_permissions || {}; const current = perms[mod] !== false; const updated = { ...perms, [mod]: !current }; const { error } = await supabase.from("org_memberships").update({ module_permissions: updated }).eq("id", om.id); if (error) return showToast("Failed to update permissions"); setMemberships(p => p.map(m => m.id === om.id ? { ...m, module_permissions: updated } : m)); };
  const toggleProjectAccess = async (uid, projectId) => { const existing = projectMembers.find(pm => pm.user_id === uid && pm.project_id === projectId); if (existing) { await supabase.from("project_members").delete().eq("id", existing.id); setProjectMembers(p => p.filter(pm => pm.id !== existing.id)); } else { const { data, error } = await supabase.from("project_members").insert({ project_id: projectId, user_id: uid, role: "member" }).select().single(); if (!error && data) setProjectMembers(p => [...p, data]); } };
  const deactivateUser = async (uid) => { const om = getMembership(uid); if (!om) return; const newActive = !om.is_active; const updates = { is_active: newActive }; if (!newActive) updates.deactivated_at = new Date().toISOString(); else updates.deactivated_at = null; const { error } = await supabase.from("org_memberships").update(updates).eq("id", om.id); if (error) return showToast("Failed to update"); setMemberships(p => p.map(m => m.id === om.id ? { ...m, ...updates } : m)); showToast(newActive ? "User reactivated" : "User deactivated", "success"); };
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
  const hasModuleAccess = (uid, mod) => { const om = getMembership(uid); if (!om) return true; if (om.role === "owner" || om.role === "admin") return true; const perms = om.module_permissions || {}; return perms[mod] !== false; };
  const hasProjectAccess = (uid, pid) => projectMembers.some(pm => pm.user_id === uid && pm.project_id === pid);

  // Team CRUD
  const createTeam = async () => { if (!teamForm.name.trim()) return showToast("Team name required"); const { data, error } = await supabase.from("teams").insert({ org_id: profile.org_id, name: teamForm.name.trim(), description: teamForm.description, color: teamForm.color, parent_team_id: teamForm.parent_team_id || null, created_by: user.id }).select().single(); if (error) return showToast("Failed to create team"); setTeams(p => [...p, data]); setShowTeamForm(false); setTeamForm({ name: "", description: "", color: TEAM_COLORS[0], parent_team_id: null }); showToast("Team created", "success"); };
  const deleteTeam = async (tid) => { if (!confirm("Delete this team?")) return; await supabase.from("team_members").delete().eq("team_id", tid); await supabase.from("teams").update({ deleted_at: new Date().toISOString() }).eq("id", tid); setTeams(p => p.filter(t => t.id !== tid)); setTeamMembers(p => p.filter(tm => tm.team_id !== tid)); if (selectedTeam === tid) setSelectedTeam(null); showToast("Team deleted", "success"); };
  const addTeamMember = async (teamId, userId) => { const exists = teamMembers.find(tm => tm.team_id === teamId && tm.user_id === userId); if (exists) return; const { data, error } = await supabase.from("team_members").insert({ team_id: teamId, user_id: userId }).select().single(); if (!error && data) { setTeamMembers(p => [...p, data]); showToast("Member added", "success"); } };
  const removeTeamMember = async (tmId) => { await supabase.from("team_members").delete().eq("id", tmId); setTeamMembers(p => p.filter(tm => tm.id !== tmId)); };

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
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
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
            for (const uid of selectedPeople) { const om = getMembership(uid); if (om?.is_active === false) { await supabase.from("org_memberships").update({ is_active: true }).eq("user_id", uid).eq("org_id", profile?.org_id); setMemberships(p => p.map(m => m.user_id === uid ? { ...m, is_active: true } : m)); } }
            setSelectedPeople(new Set());
          }} style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: "#22c55e", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>✓ Activate</button>
          <button onClick={async () => {
            for (const uid of selectedPeople) { await supabase.from("org_memberships").update({ is_active: false }).eq("user_id", uid).eq("org_id", profile?.org_id); setMemberships(p => p.map(m => m.user_id === uid ? { ...m, is_active: false } : m)); }
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
            <div style={{ minWidth: 0, display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{member.display_name || "Unknown"}</span>
              {isMe && <span style={{ fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: T.accentDim, color: T.accent }}>You</span>}
              {!active && <span style={{ fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 4, background: T.redDim, color: T.red }}>Off</span>}
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
    <div style={{ width: 380, borderLeft: `1px solid ${T.border}`, background: T.surface, flexShrink: 0, overflow: "auto", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: `1px solid ${T.border}` }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: T.text3 }}>Member Details</span>
        <button onClick={() => setSelected(null)} style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text3, cursor: "pointer", width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>×</button>
      </div>
      <div style={{ padding: "20px 20px 12px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
          <div style={{ width: 52, height: 52, borderRadius: 26, background: `${c}18`, border: `2px solid ${c}50`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, color: c }}>{ini(selected.display_name)}</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{selected.display_name || "Unknown"}</div>
            <div style={{ fontSize: 12, color: T.text3, marginTop: 2 }}>{selected.email}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: T.text3, width: 60 }}>Role</span>
          <select value={om?.role || "member"} onChange={e => updateRole(selected.id, e.target.value)} disabled={isOwner && isMe} style={{ flex: 1, padding: "5px 8px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 12, cursor: "pointer", outline: "none" }}>
            {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {!isMe && <button onClick={async () => {
            try {
              const res = await fetch("https://upbjdmnykheubxkuknuj.supabase.co/functions/v1/invite-user", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwYmpkbW55a2hldWJ4a3VrbnVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNDI3OTcsImV4cCI6MjA4NzcxODc5N30.pvTTkiZWNDPuo-Fdzm54uy8w1mlx0AjB5jtFm3MeGq4" },
                body: JSON.stringify({ email: selected.email, display_name: selected.display_name, role: om?.role || "member", org_id: profile.org_id, resend: true }),
              });
              const result = await res.json();
              if (result.error) showToast("Failed: " + result.error);
              else showToast("Invite resent to " + selected.email, "success");
            } catch (e) { showToast("Failed: " + e.message); }
          }} style={{ flex: 1, padding: "7px 0", borderRadius: 6, border: `1px solid ${T.accent}30`, background: T.accentDim, color: T.accent, fontSize: 12, cursor: "pointer", fontWeight: 500 }}>📧 Resend Invite</button>}
          {!isMe && <button onClick={() => deactivateUser(selected.id)} style={{ flex: 1, padding: "7px 0", borderRadius: 6, border: `1px solid ${T.border}`, background: om?.is_active !== false ? T.surface2 : T.greenDim, color: om?.is_active !== false ? T.text2 : T.green, fontSize: 12, cursor: "pointer", fontWeight: 500 }}>{om?.is_active !== false ? "Deactivate" : "Reactivate"}</button>}
          {!isMe && !isOwner && <button onClick={() => deleteUser(selected.id)} style={{ padding: "7px 12px", borderRadius: 6, border: `1px solid ${T.red}30`, background: T.redDim, color: T.red, fontSize: 12, cursor: "pointer", fontWeight: 500 }}>Remove</button>}
        </div>
      </div>
      <div style={{ display: "flex", borderBottom: `1px solid ${T.border}`, padding: "0 20px" }}>
        {["overview", "permissions"].map(t => <button key={t} onClick={() => setTab(t)} style={{ padding: "8px 16px", fontSize: 12, fontWeight: tab === t ? 600 : 400, color: tab === t ? T.accent : T.text3, background: "none", border: "none", borderBottom: tab === t ? `2px solid ${T.accent}` : "2px solid transparent", cursor: "pointer", textTransform: "capitalize" }}>{t}</button>)}
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
        {tab === "overview" && <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
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
        {tab === "permissions" && <>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.text3, marginBottom: 10 }}>Module Access</div>
            {(om?.role === "owner" || om?.role === "admin") && <div style={{ fontSize: 11, color: T.accent, marginBottom: 10, padding: "6px 10px", background: T.accentDim, borderRadius: 6 }}>Admins and owners have access to all modules</div>}
            {MODULES.map(mod => { const has = hasModuleAccess(selected.id, mod); return (
              <div key={mod} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
                <span style={{ fontSize: 13, color: T.text, textTransform: "capitalize" }}>{mod}</span>
                <ToggleSwitch on={has} onClick={() => { if (om?.role !== "owner" && om?.role !== "admin") toggleModuleAccess(selected.id, mod); }} />
              </div>); })}
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
  const inviteModal = showInvite && (
    <div onClick={() => setShowInvite(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 400, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: T.text, margin: "0 0 16px" }}>Add Team Member</h3>
        <div style={{ marginBottom: 12 }}><label style={{ fontSize: 12, fontWeight: 500, color: T.text3, display: "block", marginBottom: 4 }}>Name</label><input value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="Full name" style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, outline: "none", boxSizing: "border-box" }} /></div>
        <div style={{ marginBottom: 12 }}><label style={{ fontSize: 12, fontWeight: 500, color: T.text3, display: "block", marginBottom: 4 }}>Email</label><input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="email@company.com" type="email" style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, outline: "none", boxSizing: "border-box" }} /></div>
        <div style={{ marginBottom: 16 }}><label style={{ fontSize: 12, fontWeight: 500, color: T.text3, display: "block", marginBottom: 4 }}>Role</label><select value={inviteRole} onChange={e => setInviteRole(e.target.value)} style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, outline: "none" }}>{ROLES.filter(r => r !== "owner").map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}</select></div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><button onClick={() => setShowInvite(false)} style={{ padding: "8px 16px", borderRadius: 6, background: T.surface3, color: T.text2, border: "none", fontSize: 13, cursor: "pointer" }}>Cancel</button><button onClick={inviteUser} style={{ padding: "8px 16px", borderRadius: 6, background: T.accent, color: "#fff", border: "none", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>Add Member</button></div>
      </div>
    </div>);

  const teamFormModal = showTeamForm && (
    <div onClick={() => setShowTeamForm(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 400, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
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
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes slideIn{from{transform:translateX(20px);opacity:0}to{transform:translateX(0);opacity:1}}`}</style>
      {toast && <div style={{ position: "fixed", top: 16, right: 16, zIndex: 200, padding: "10px 16px", borderRadius: 8, background: toast.type === "success" ? T.greenDim : T.redDim, color: toast.type === "success" ? T.green : T.red, fontSize: 13, fontWeight: 500, boxShadow: "0 4px 16px rgba(0,0,0,0.2)", animation: "slideIn 0.2s ease" }}>{toast.msg}</div>}
      <div style={{ flex: 1, overflow: "auto", padding: "28px 32px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div><h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Team</h1><p style={{ fontSize: 12, color: T.text3 }}>{members.length} member{members.length !== 1 ? "s" : ""} · {memberships.filter(m => m.is_active !== false).length} active · {teams.length} team{teams.length !== 1 ? "s" : ""}</p></div>
          <div style={{ display: "flex", gap: 8 }}>
            {/* View toggle: Cards | List | Teams */}
            <div style={{ display: "flex", borderRadius: 8, border: `1px solid ${T.border}`, overflow: "hidden" }}>
              <button onClick={() => setView("cards")} title="Cards" style={{ padding: "7px 10px", background: viewMode === "cards" ? T.accent : T.surface2, color: viewMode === "cards" ? "#fff" : T.text3, border: "none", cursor: "pointer", display: "flex", alignItems: "center" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg></button>
              <button onClick={() => setView("list")} title="List" style={{ padding: "7px 10px", background: viewMode === "list" ? T.accent : T.surface2, color: viewMode === "list" ? "#fff" : T.text3, border: "none", cursor: "pointer", display: "flex", alignItems: "center", borderLeft: `1px solid ${T.border}` }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg></button>
              <button onClick={() => setView("teams")} title="Teams" style={{ padding: "7px 10px", background: viewMode === "teams" ? T.accent : T.surface2, color: viewMode === "teams" ? "#fff" : T.text3, border: "none", cursor: "pointer", display: "flex", alignItems: "center", borderLeft: `1px solid ${T.border}` }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg></button>
            </div>
            {viewMode !== "teams" && <select value={filterRole} onChange={e => setFilterRole(e.target.value)} style={{ padding: "7px 10px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface2, color: filterRole ? T.text : T.text3, fontSize: 12, cursor: "pointer", outline: "none" }}><option value="">All roles</option>{ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}</select>}
            {viewMode !== "teams" && <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", borderRadius: 8, background: T.surface2, border: `1px solid ${T.border}` }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.text3} strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search team…" style={{ background: "transparent", border: "none", outline: "none", color: T.text, fontSize: 12, width: 140, fontFamily: "inherit" }} /></div>}
            <button onClick={() => setShowInvite(true)} style={{ padding: "7px 16px", borderRadius: 8, background: T.accent, color: "#fff", border: "none", fontSize: 12, cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/></svg>Add Member</button>
          </div>
        </div>
        {viewMode === "cards" && <MemberCards />}
        {viewMode === "list" && <MemberList />}
        {viewMode === "teams" && <TeamsView />}
      </div>
      {viewMode !== "teams" && <DetailPanel />}
      {inviteModal}
      {teamFormModal}
    </div>
  );
}
