"use client";
import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";
import { useAuth } from "../lib/auth";

const AVATAR_COLORS = ["#3b82f6","#a855f7","#ec4899","#06b6d4","#f97316","#22c55e","#84cc16","#ef4444"];
const acol = (uid) => uid ? AVATAR_COLORS[uid.charCodeAt(uid.length - 1) % AVATAR_COLORS.length] : T.text3;
const ROLES = ["owner", "admin", "member", "viewer"];
const ROLE_COLORS = { owner: "#ef4444", admin: "#a855f7", member: "#3b82f6", viewer: "#6b7280" };
const MODULES = ["dashboard", "projects", "messages", "calendar", "docs", "okrs", "reports", "campaigns", "plm", "people", "automation", "calls", "settings"];

export default function PeopleView() {
  const { user, profile } = useAuth();
  const [members, setMembers] = useState([]);
  const [memberships, setMemberships] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [projectMembers, setProjectMembers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [tab, setTab] = useState("overview"); // overview | permissions
  const [filterRole, setFilterRole] = useState("");

  const showToast = (msg, type = "error") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); };
  const ini = (name) => name ? name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() : "?";

  useEffect(() => {
    if (!profile?.org_id) return;
    (async () => {
      const [mR, omR, tR, pR, pmR] = await Promise.all([
        supabase.from("profiles").select("*").eq("org_id", profile.org_id),
        supabase.from("org_memberships").select("*").eq("org_id", profile.org_id),
        supabase.from("tasks").select("id, title, status, priority, assignee_id, project_id, due_date").is("deleted_at", null),
        supabase.from("projects").select("id, name, color").is("deleted_at", null),
        supabase.from("project_members").select("*"),
      ]);
      setMembers(mR.data || []); setMemberships(omR.data || []); setTasks(tR.data || []); setProjects(pR.data || []); setProjectMembers(pmR.data || []);
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
    // Create profile + org_membership
    const newId = crypto.randomUUID();
    const { error: pErr } = await supabase.from("profiles").insert({ id: newId, display_name: inviteName.trim() || inviteEmail.split("@")[0], email: inviteEmail.trim(), org_id: profile.org_id });
    if (pErr) return showToast("Failed to create user: " + (pErr.message || ""));
    const { error: omErr } = await supabase.from("org_memberships").insert({ org_id: profile.org_id, user_id: newId, role: inviteRole, is_active: true, module_permissions: {} });
    if (omErr) return showToast("Failed to create membership");
    const newMember = { id: newId, display_name: inviteName.trim() || inviteEmail.split("@")[0], email: inviteEmail.trim(), org_id: profile.org_id };
    setMembers(p => [...p, newMember]);
    setMemberships(p => [...p, { org_id: profile.org_id, user_id: newId, role: inviteRole, is_active: true, module_permissions: {} }]);
    setInviteEmail(""); setInviteName(""); setInviteRole("member"); setShowInvite(false);
    showToast("User added", "success");
  };

  const updateRole = async (uid, newRole) => {
    const om = getMembership(uid);
    if (!om) return;
    const { error } = await supabase.from("org_memberships").update({ role: newRole }).eq("id", om.id);
    if (error) return showToast("Failed to update role");
    setMemberships(p => p.map(m => m.id === om.id ? { ...m, role: newRole } : m));
    showToast("Role updated", "success");
  };

  const toggleModuleAccess = async (uid, mod) => {
    const om = getMembership(uid);
    if (!om) return;
    const perms = om.module_permissions || {};
    const current = perms[mod] !== false; // default = true (has access)
    const updated = { ...perms, [mod]: !current };
    const { error } = await supabase.from("org_memberships").update({ module_permissions: updated }).eq("id", om.id);
    if (error) return showToast("Failed to update permissions");
    setMemberships(p => p.map(m => m.id === om.id ? { ...m, module_permissions: updated } : m));
  };

  const toggleProjectAccess = async (uid, projectId) => {
    const existing = projectMembers.find(pm => pm.user_id === uid && pm.project_id === projectId);
    if (existing) {
      await supabase.from("project_members").delete().eq("id", existing.id);
      setProjectMembers(p => p.filter(pm => pm.id !== existing.id));
    } else {
      const { data, error } = await supabase.from("project_members").insert({ project_id: projectId, user_id: uid, role: "member" }).select().single();
      if (!error && data) setProjectMembers(p => [...p, data]);
    }
  };

  const deactivateUser = async (uid) => {
    const om = getMembership(uid);
    if (!om) return;
    const newActive = !om.is_active;
    const updates = { is_active: newActive };
    if (!newActive) updates.deactivated_at = new Date().toISOString();
    else updates.deactivated_at = null;
    const { error } = await supabase.from("org_memberships").update(updates).eq("id", om.id);
    if (error) return showToast("Failed to update");
    setMemberships(p => p.map(m => m.id === om.id ? { ...m, ...updates } : m));
    showToast(newActive ? "User reactivated" : "User deactivated", "success");
  };

  const deleteUser = async (uid) => {
    if (!confirm("Permanently remove this user?")) return;
    const om = getMembership(uid);
    if (om) await supabase.from("org_memberships").delete().eq("id", om.id);
    await supabase.from("project_members").delete().eq("user_id", uid);
    await supabase.from("profiles").delete().eq("id", uid);
    setMembers(p => p.filter(m => m.id !== uid));
    setMemberships(p => p.filter(m => m.user_id !== uid));
    setProjectMembers(p => p.filter(pm => pm.user_id !== uid));
    if (selected?.id === uid) setSelected(null);
    showToast("User removed", "success");
  };

  const hasModuleAccess = (uid, mod) => { const om = getMembership(uid); if (!om) return true; if (om.role === "owner" || om.role === "admin") return true; const perms = om.module_permissions || {}; return perms[mod] !== false; };
  const hasProjectAccess = (uid, pid) => projectMembers.some(pm => pm.user_id === uid && pm.project_id === pid);
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
  const DetailPanel = () => { if (!selected) return null; const c = acol(selected.id); const stats = getStats(selected.id); const om = getMembership(selected.id); const memberTasks = tasks.filter(t => t.assignee_id === selected.id && t.status !== "done").sort((a, b) => { if (!a.due_date) return 1; if (!b.due_date) return -1; return new Date(a.due_date) - new Date(b.due_date); }).slice(0, 12); const memberProjs = stats.projs.map(pid => projects.find(p => p.id === pid)).filter(Boolean); const isMe = selected.id === user?.id; const isOwner = om?.role === "owner"; return (
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
        {/* Role selector */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 12, color: T.text3, width: 60 }}>Role</span>
          <select value={om?.role || "member"} onChange={e => updateRole(selected.id, e.target.value)} disabled={isOwner && isMe} style={{ flex: 1, padding: "5px 8px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 12, cursor: "pointer", outline: "none" }}>
            {ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}
          </select>
        </div>
        {/* Action buttons */}
        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          {!isMe && <button onClick={() => deactivateUser(selected.id)} style={{ flex: 1, padding: "7px 0", borderRadius: 6, border: `1px solid ${T.border}`, background: om?.is_active !== false ? T.surface2 : T.greenDim, color: om?.is_active !== false ? T.text2 : T.green, fontSize: 12, cursor: "pointer", fontWeight: 500 }}>{om?.is_active !== false ? "Deactivate" : "Reactivate"}</button>}
          {!isMe && !isOwner && <button onClick={() => deleteUser(selected.id)} style={{ padding: "7px 12px", borderRadius: 6, border: `1px solid ${T.red}30`, background: T.redDim, color: T.red, fontSize: 12, cursor: "pointer", fontWeight: 500 }}>Remove</button>}
        </div>
      </div>
      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: `1px solid ${T.border}`, padding: "0 20px" }}>
        {["overview", "permissions"].map(t => <button key={t} onClick={() => setTab(t)} style={{ padding: "8px 16px", fontSize: 12, fontWeight: tab === t ? 600 : 400, color: tab === t ? T.accent : T.text3, background: "none", border: "none", borderBottom: tab === t ? `2px solid ${T.accent}` : "2px solid transparent", cursor: "pointer", textTransform: "capitalize" }}>{t}</button>)}
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
        {tab === "overview" && <>
          {/* Stats */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
            {[{ l: "Total", v: stats.total, c: T.text }, { l: "Open", v: stats.open, c: T.accent }, { l: "Done", v: stats.done, c: T.green }, { l: "Overdue", v: stats.overdue, c: stats.overdue > 0 ? T.red : T.text3 }].map(s => (
              <div key={s.l} style={{ textAlign: "center", padding: "8px 0", background: T.surface2, borderRadius: 8 }}><div style={{ fontSize: 18, fontWeight: 700, color: s.c }}>{s.v}</div><div style={{ fontSize: 9, color: T.text3, marginTop: 2 }}>{s.l}</div></div>))}
          </div>
          {memberProjs.length > 0 && <div style={{ marginBottom: 20 }}><div style={{ fontSize: 12, fontWeight: 700, color: T.text3, marginBottom: 8 }}>Projects</div><div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>{memberProjs.map(p => <span key={p.id} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, background: `${p.color || T.accent}15`, color: p.color || T.accent, fontWeight: 600 }}>{p.name}</span>)}</div></div>}
          <div style={{ fontSize: 12, fontWeight: 700, color: T.text3, marginBottom: 8 }}>Open Tasks</div>
          {memberTasks.length === 0 && <div style={{ fontSize: 12, color: T.text3, padding: 8 }}>No open tasks</div>}
          {memberTasks.map(t => { const proj = projects.find(p => p.id === t.project_id); const od = t.due_date && new Date(t.due_date) < new Date(); return (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 6, background: T.surface2, marginBottom: 4, border: `1px solid ${T.border}` }}>
              <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div><div style={{ fontSize: 10, color: T.text3, marginTop: 1 }}>{proj?.name || "—"}</div></div>
              {t.due_date && <span style={{ fontSize: 10, fontWeight: 600, color: od ? T.red : T.text3, flexShrink: 0 }}>{new Date(t.due_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
            </div>); })}
        </>}
        {tab === "permissions" && <>
          {/* Module permissions */}
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.text3, marginBottom: 10 }}>Module Access</div>
            {(om?.role === "owner" || om?.role === "admin") && <div style={{ fontSize: 11, color: T.accent, marginBottom: 10, padding: "6px 10px", background: T.accentDim, borderRadius: 6 }}>Admins and owners have access to all modules</div>}
            {MODULES.map(mod => { const has = hasModuleAccess(selected.id, mod); const locked = om?.role === "owner" || om?.role === "admin"; return (
              <div key={mod} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
                <span style={{ fontSize: 13, color: T.text, textTransform: "capitalize" }}>{mod}</span>
                <button onClick={() => { if (!locked) toggleModuleAccess(selected.id, mod); }} style={{ width: 36, height: 20, borderRadius: 10, border: "none", cursor: locked ? "default" : "pointer", background: has ? T.green : T.surface3, position: "relative", transition: "background 0.2s", opacity: locked ? 0.5 : 1 }}>
                  <div style={{ width: 16, height: 16, borderRadius: 8, background: "#fff", position: "absolute", top: 2, left: has ? 18 : 2, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
                </button>
              </div>); })}
          </div>
          {/* Project-level access */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.text3, marginBottom: 10 }}>Project Access</div>
            {projects.map(p => { const has = hasProjectAccess(selected.id, p.id); return (
              <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 4, background: p.color || T.accent }} />
                  <span style={{ fontSize: 13, color: T.text }}>{p.name}</span>
                </div>
                <button onClick={() => toggleProjectAccess(selected.id, p.id)} style={{ width: 36, height: 20, borderRadius: 10, border: "none", cursor: "pointer", background: has ? T.green : T.surface3, position: "relative", transition: "background 0.2s" }}>
                  <div style={{ width: 16, height: 16, borderRadius: 8, background: "#fff", position: "absolute", top: 2, left: has ? 18 : 2, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
                </button>
              </div>); })}
          </div>
        </>}
      </div>
    </div>); };
  const InviteModal = () => { if (!showInvite) return null; return (
    <div onClick={() => setShowInvite(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 400, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, color: T.text, margin: "0 0 16px" }}>Add Team Member</h3>
        <div style={{ marginBottom: 12 }}><label style={{ fontSize: 12, fontWeight: 500, color: T.text3, display: "block", marginBottom: 4 }}>Name</label><input value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="Full name" autoFocus style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, outline: "none", boxSizing: "border-box" }} /></div>
        <div style={{ marginBottom: 12 }}><label style={{ fontSize: 12, fontWeight: 500, color: T.text3, display: "block", marginBottom: 4 }}>Email</label><input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="email@company.com" type="email" style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, outline: "none", boxSizing: "border-box" }} /></div>
        <div style={{ marginBottom: 16 }}><label style={{ fontSize: 12, fontWeight: 500, color: T.text3, display: "block", marginBottom: 4 }}>Role</label><select value={inviteRole} onChange={e => setInviteRole(e.target.value)} style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, outline: "none" }}>{ROLES.filter(r => r !== "owner").map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}</select></div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}><button onClick={() => setShowInvite(false)} style={{ padding: "8px 16px", borderRadius: 6, background: T.surface3, color: T.text2, border: "none", fontSize: 13, cursor: "pointer" }}>Cancel</button><button onClick={inviteUser} style={{ padding: "8px 16px", borderRadius: 6, background: T.accent, color: "#fff", border: "none", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>Add Member</button></div>
      </div>
    </div>); };
  if (loading) return <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: T.text3, fontSize: 13 }}><div style={{ width: 28, height: 28, border: `3px solid ${T.border}`, borderTopColor: T.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite", marginRight: 10 }} />Loading team…<style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style></div>;

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes slideIn{from{transform:translateX(20px);opacity:0}to{transform:translateX(0);opacity:1}}`}</style>
      {toast && <div style={{ position: "fixed", top: 16, right: 16, zIndex: 200, padding: "10px 16px", borderRadius: 8, background: toast.type === "success" ? T.greenDim : T.redDim, color: toast.type === "success" ? T.green : T.red, fontSize: 13, fontWeight: 500, boxShadow: "0 4px 16px rgba(0,0,0,0.2)", animation: "slideIn 0.2s ease" }}>{toast.msg}</div>}
      <div style={{ flex: 1, overflow: "auto", padding: "28px 32px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div><h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Team</h1><p style={{ fontSize: 12, color: T.text3 }}>{members.length} member{members.length !== 1 ? "s" : ""} · {memberships.filter(m => m.is_active !== false).length} active</p></div>
          <div style={{ display: "flex", gap: 8 }}>
            <select value={filterRole} onChange={e => setFilterRole(e.target.value)} style={{ padding: "7px 10px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface2, color: filterRole ? T.text : T.text3, fontSize: 12, cursor: "pointer", outline: "none" }}><option value="">All roles</option>{ROLES.map(r => <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>)}</select>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", borderRadius: 8, background: T.surface2, border: `1px solid ${T.border}` }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.text3} strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search team…" style={{ background: "transparent", border: "none", outline: "none", color: T.text, fontSize: 12, width: 140, fontFamily: "inherit" }} /></div>
            <button onClick={() => setShowInvite(true)} style={{ padding: "7px 16px", borderRadius: 8, background: T.accent, color: "#fff", border: "none", fontSize: 12, cursor: "pointer", fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><path d="M20 8v6M23 11h-6"/></svg>Add Member</button>
          </div>
        </div>
        <MemberCards />
      </div>
      <DetailPanel />
      <InviteModal />
    </div>
  );
}
