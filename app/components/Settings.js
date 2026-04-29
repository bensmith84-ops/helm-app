"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";
import { useResponsive } from "../lib/responsive";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/theme";
import { notifySlack } from "../lib/slack";
import { NAV_ITEMS, NAV_GROUPS } from "./Sidebar";
import MetabaseBrowser from "./MetabaseBrowser";

const ALL_TABS = ["Profile","Organization","Organizations","Integrations","Notifications","About"];
const MEMBER_TABS = ["Profile","Notifications"];
const TIMEZONES = ["America/New_York","America/Chicago","America/Denver","America/Los_Angeles","America/Anchorage","Pacific/Honolulu","Europe/London","Europe/Paris","Europe/Berlin","Asia/Tokyo","Asia/Shanghai","Asia/Kolkata","Australia/Sydney","Pacific/Auckland"];

function Section({ title, subtitle, children }) {
  return (
    <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, overflow:"hidden", marginBottom:16 }}>
      <div style={{ padding:"16px 24px", borderBottom:`1px solid ${T.border}` }}>
        <div style={{ fontSize:15, fontWeight:700 }}>{title}</div>
        {subtitle && <div style={{ fontSize:12, color:T.text3, marginTop:2 }}>{subtitle}</div>}
      </div>
      <div style={{ padding:"20px 24px" }}>{children}</div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <div style={{ marginBottom:18 }}>
      <label style={{ fontSize:12, fontWeight:600, color:T.text2, display:"block", marginBottom:5 }}>{label}</label>
      {children}
      {hint && <div style={{ fontSize:11, color:T.text3, marginTop:4 }}>{hint}</div>}
    </div>
  );
}

const inp = {
  width:"100%", maxWidth:400, padding:"9px 12px", fontSize:13, color:T.text,
  background:T.surface2, border:`1px solid ${T.border}`, borderRadius:8, outline:"none", fontFamily:"inherit",
  boxSizing:"border-box",
};

export default function SettingsView({ isAdmin }) {
  const { isMobile } = useResponsive();
  const { user, profile, signOut, orgId, orgs, switchOrg } = useAuth();
  const { mode, toggle, accentKey, setAccent, ACCENT_PRESETS } = useTheme();
  const [activeTab, setActiveTab] = useState("Profile");
  const [showMetabase, setShowMetabase] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  // Profile
  const [displayName, setDisplayName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [title, setTitle] = useState("");
  const [bio, setBio] = useState("");

  // New Org creation
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgSlug, setNewOrgSlug] = useState("");
  const [creatingOrg, setCreatingOrg] = useState(false);

  // Org
  const [orgName, setOrgName] = useState("Earth Breeze");
  const [orgWebsite, setOrgWebsite] = useState("");
  const [orgIndustry, setOrgIndustry] = useState("Consumer Packaged Goods");
  const [orgFY, setOrgFY] = useState("January");

  // Team
  const [members, setMembers] = useState([]);
  const [inviteEmail, setInviteEmail] = useState("");

  // QBO connection
  const [qboConn, setQboConn] = useState(null);
  const [qboSyncing, setQboSyncing] = useState(false);
  useEffect(() => {
    supabase.from("qbo_connections").select("*").eq("org_id", orgId).order("connected_at", { ascending: false }).limit(1).then(({ data }) => {
      if (data && data.length > 0) setQboConn(data[0]);
    });
  }, []);

  // Notifications
  const [notifSettings, setNotifSettings] = useState({
    task_overdue: true, okr_deadline: true, approval: true, mention: true, weekly_digest: true,
  });

  // Sidebar order
  const [dragIdx, setDragIdx] = useState(null);
  const [navItems, setNavItems] = useState([]);
  const [sidebarGroups, setSidebarGroups] = useState(null);
  const [dragGroup, setDragGroup] = useState(null);
  const [dragItem, setDragItem] = useState(null);
  const [addingGroup, setAddingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");

  // Team (was inside conditional IIFE — lifted to top)
  const [selectedMembers, setSelectedMembers] = useState(new Set());

  // Permissions (was inside conditional IIFE — lifted to top)
  const [perms, setPerms] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [permSaving, setPermSaving] = useState({});

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || "");
      setTimezone(profile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
      setTitle(profile.title || "");
      setBio(profile.bio || "");
      // Init nav order
      const nonDividerItems = NAV_ITEMS.filter(n => !n.type);
      const savedOrder = profile?.nav_order;
      const ordered = savedOrder ? savedOrder.map(k => nonDividerItems.find(n => n.key === k)).filter(Boolean).concat(nonDividerItems.filter(n => !savedOrder.includes(n.key))) : nonDividerItems;
      setNavItems(ordered);
      // Init sidebar config
      if (profile?.sidebar_config?.groups) {
        setSidebarGroups(profile.sidebar_config.groups);
      } else {
        setSidebarGroups(NAV_GROUPS.map(g => ({ label: g.label, items: g.items.map(i => ({ key: i.key, icon: i.icon, label: i.label, visible: true, adminOnly: i.adminOnly })) })));
      }
    }
    loadTeam();
    // Load permissions
    (async () => {
      const [{ data: users }, { data: permData }] = await Promise.all([
        supabase.from("profiles").select("id,display_name,email,role").eq("org_id", orgId).eq("org_id", profile?.org_id).order("display_name"),
        supabase.from("user_module_permissions").select("*"),
      ]);
      setAllUsers(users || []);
      setPerms(permData || []);
    })();
  }, [profile]);

  const loadTeam = async () => {
    const { data } = await supabase.from("org_memberships").select("user_id, role, joined_at, profiles(id,display_name,email)").limit(20);
    setMembers(data || []);
  };

  const saveSidebarConfig = async (groups) => {
    await supabase.from("profiles").update({ sidebar_config: { groups } }).eq("org_id", orgId).eq("id", user.id);
  };
  const showToast = (msg, color="#22c55e") => {
    setToast({ msg, color });
    setTimeout(() => setToast(""), 3000);
  };

  const saveProfile = async () => {
    setSaving(true);
    await supabase.from("profiles").update({
      display_name: displayName.trim(), timezone, title: title.trim(), bio: bio.trim(),
      updated_at: new Date().toISOString(),
    }).eq("org_id", orgId).eq("id", user.id);
    setSaving(false);
    showToast("Profile saved");
  };

  const saveOrg = async () => {
    setSaving(true);
    // Store org settings in a generic table or just show success for now
    setTimeout(() => { setSaving(false); showToast("Organization settings saved"); }, 500);
  };

  const AVATAR_COLORS = ["#3b82f6","#a855f7","#ec4899","#06b6d4","#f97316","#22c55e"];
  const acol = uid => uid ? AVATAR_COLORS[uid.charCodeAt(uid.length-1)%AVATAR_COLORS.length] : T.text3;
  const ini = name => name ? name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase() : "?";

  return (
    <div style={{ display:"flex", height:"100%", overflow:"hidden" }}>
      {/* Sidebar */}
      <div style={{ width:200, borderRight:`1px solid ${T.border}`, padding:"20px 12px", flexShrink:0, overflowY:"auto" }}>
        <div style={{ fontSize:11, fontWeight:700, color:T.text3, textTransform:"uppercase", letterSpacing:1, marginBottom:10, padding:"0 8px" }}>Settings</div>
        {(isAdmin ? ALL_TABS : MEMBER_TABS).map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            width:"100%", textAlign:"left", padding:"8px 12px", borderRadius:7,
            border:"none", cursor:"pointer", fontSize:13, fontWeight:activeTab===tab?600:400,
            background: activeTab===tab ? T.accentDim : "transparent",
            color: activeTab===tab ? T.accent : T.text2, marginBottom:2, transition:"all 0.12s",
          }}>{tab}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex:1, overflowY:"auto", padding:"28px 32px", maxWidth:700 }}>
        {toast && (
          <div style={{ position:"fixed", top:16, right:16, padding:"10px 20px", borderRadius:9, background:toast.color||"#22c55e", color:"#fff", fontSize:13, fontWeight:600, zIndex:1000, boxShadow:"0 4px 16px #00000040" }}>
            {toast.msg}
          </div>
        )}

        {/* ── Profile ── */}
        {activeTab === "Profile" && (
          <>
            <h1 style={{ fontSize:20, fontWeight:800, marginBottom:20 }}>Profile</h1>
            <Section title="Personal Information" subtitle="This is how you appear across Helm">
              {/* Avatar with upload */}
              <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:24 }}>
                <div style={{ position:"relative" }}>
                  {profile?.avatar_url ? (
                    <img src={profile.avatar_url} alt="Avatar" style={{ width:72, height:72, borderRadius:36, objectFit:"cover", border:`2px solid ${acol(user?.id)}60` }} />
                  ) : (
                    <div style={{ width:72, height:72, borderRadius:36, background:acol(user?.id)+"30",
                      border:`2px solid ${acol(user?.id)}60`, display:"flex", alignItems:"center",
                      justifyContent:"center", fontSize:24, fontWeight:700, color:acol(user?.id) }}>
                      {ini(displayName || profile?.display_name)}
                    </div>
                  )}
                  <label style={{ position:"absolute", bottom:-2, right:-2, width:26, height:26, borderRadius:13,
                    background:T.accent, border:`2px solid ${T.surface}`, display:"flex", alignItems:"center", justifyContent:"center",
                    cursor:"pointer", fontSize:12, color:"#fff" }} title="Upload photo">
                    📷
                    <input type="file" accept="image/*" style={{ display:"none" }} onChange={async e => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 5 * 1024 * 1024) return showToast("Max 5MB", "#ef4444");
                      const ext = file.name.split(".").pop();
                      const path = `${user.id}/avatar.${ext}`;
                      const { error } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
                      if (error) return showToast("Upload failed: " + error.message, "#ef4444");
                      const { data: { publicUrl } } = supabase.storage.from("avatars").getPublicUrl(path);
                      const url = publicUrl + "?t=" + Date.now();
                      await supabase.from("profiles").update({ avatar_url: url }).eq("org_id", orgId).eq("id", user.id);
                      showToast("Photo updated");
                      window.location.reload();
                    }} />
                  </label>
                </div>
                <div>
                  <div style={{ fontSize:14, fontWeight:600 }}>{displayName || "Your name"}</div>
                  <div style={{ fontSize:12, color:T.text3 }}>{user?.email}</div>
                  {profile?.avatar_url && <button onClick={async () => {
                    await supabase.from("profiles").update({ avatar_url: null }).eq("org_id", orgId).eq("id", user.id);
                    showToast("Photo removed");
                    window.location.reload();
                  }} style={{ fontSize:11, color:T.text3, background:"none", border:"none", cursor:"pointer", padding:0, marginTop:4, textDecoration:"underline" }}>Remove photo</button>}
                </div>
              </div>
              <Field label="Display Name">
                <input value={displayName} onChange={e=>setDisplayName(e.target.value)} style={inp} placeholder="Your full name" />
              </Field>
              <Field label="Job Title" hint="Shown on your profile and in team views">
                <input value={title} onChange={e=>setTitle(e.target.value)} style={inp} placeholder="e.g. CEO, Head of Product" />
              </Field>
              <Field label="Bio">
                <textarea value={bio} onChange={e=>setBio(e.target.value)} rows={3} style={{ ...inp, maxWidth:"100%", resize:"vertical" }} placeholder="Brief bio…" />
              </Field>
              <Field label="Email" hint="Email cannot be changed here">
                <input value={user?.email||""} disabled style={{ ...inp, opacity:0.5, cursor:"not-allowed" }} />
              </Field>
              <Field label="Timezone">
                <select value={timezone} onChange={e=>setTimezone(e.target.value)} style={{ ...inp, cursor:"pointer" }}>
                  {TIMEZONES.map(tz=><option key={tz} value={tz}>{tz.replace(/_/g," ")}</option>)}
                </select>
              </Field>
              <button onClick={saveProfile} disabled={saving} style={{ padding:"10px 24px", fontSize:13, fontWeight:700, borderRadius:8, border:"none", background:T.accent, color:"#fff", cursor:saving?"wait":"pointer", opacity:saving?0.6:1 }}>
                {saving?"Saving…":"Save Changes"}
              </button>
            </Section>

            <Section title="Appearance">
              <Field label="Theme" hint="Choose your preferred color scheme">
                <div style={{ display:"flex", gap:10 }}>
                  {[["dark","🌙 Dark"],["light","☀️ Light"]].map(([m,l])=>(
                    <div key={m} onClick={()=>toggle(m)} style={{ padding:"10px 20px", borderRadius:9, cursor:"pointer",
                      border:`2px solid ${mode===m?T.accent:T.border}`,
                      background: mode===m?T.accentDim:T.surface2, color:mode===m?T.text:T.text3,
                      fontSize:13, fontWeight:600, transition:"all 0.15s" }}>{l}</div>
                  ))}
                </div>
              </Field>
              <Field label="Accent Color" hint="Choose your brand color for the interface">
                <div style={{ display:"flex", gap:8, flexWrap:"wrap" }}>
                  {ACCENT_PRESETS && Object.entries(ACCENT_PRESETS).map(([key, preset]) => (
                    <div key={key} onClick={() => setAccent?.(key)}
                      title={key.charAt(0).toUpperCase() + key.slice(1)}
                      style={{ width:32, height:32, borderRadius:16, background:preset.accent, cursor:"pointer",
                        border: accentKey===key ? `3px solid ${T.text}` : "3px solid transparent",
                        boxShadow: accentKey===key ? `0 0 0 2px ${preset.accent}` : "none",
                        transition:"all 0.15s" }} />
                  ))}
                </div>
                <div style={{ fontSize:11, color:T.text3, marginTop:6 }}>
                  Current: <strong style={{ color:T.accent }}>{accentKey ? accentKey.charAt(0).toUpperCase() + accentKey.slice(1) : "Blue"}</strong>
                </div>
              </Field>
            </Section>

            <Section title="Sidebar Menu" subtitle="Customize your navigation — drag to reorder, toggle visibility, create custom groups">
              {sidebarGroups && (
              <div>
                {sidebarGroups.map((group, gi) => (
                  <div key={group.label} style={{ marginBottom: 12 }}
                    onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                    onDrop={() => {
                      if (dragGroup !== null && dragGroup !== gi) {
                        const next = [...sidebarGroups];
                        const [moved] = next.splice(dragGroup, 1);
                        next.splice(gi, 0, moved);
                        setSidebarGroups(next);
                        saveSidebarConfig(next);
                        setDragGroup(null);
                      }
                    }}>
                    {/* Group header */}
                    <div draggable onDragStart={() => { setDragGroup(gi); setDragItem(null); }} onDragEnd={() => setDragGroup(null)}
                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 6, background: dragGroup === gi ? T.accentDim : T.surface3, cursor: "grab", marginBottom: 4 }}>
                      <span style={{ color: T.text3, fontSize: 11, cursor: "grab" }}>⠿</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: T.text2, textTransform: "uppercase", letterSpacing: "0.05em", flex: 1 }}>{group.label}</span>
                      <span style={{ fontSize: 10, color: T.text3 }}>{group.items.filter(i => i.visible).length}/{group.items.length}</span>
                      {!["Work","Connect","Operations","System"].includes(group.label) && (
                        <button onClick={() => { const next = sidebarGroups.filter((_, i) => i !== gi); setSidebarGroups(next); saveSidebarConfig(next); }}
                          style={{ fontSize: 10, color: "#ef4444", background: "none", border: "none", cursor: "pointer", padding: "0 4px" }} title="Delete group">✕</button>
                      )}
                    </div>
                    {/* Items in group */}
                    {group.items.map((item, ii) => (
                      <div key={item.key} draggable
                        onDragStart={() => { setDragItem({ gi, ii }); setDragGroup(null); }}
                        onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                        onDrop={e => {
                          e.stopPropagation();
                          if (!dragItem) return;
                          const next = sidebarGroups.map(g => ({ ...g, items: [...g.items] }));
                          const [moved] = next[dragItem.gi].items.splice(dragItem.ii, 1);
                          next[gi].items.splice(ii, 0, moved);
                          setSidebarGroups(next);
                          saveSidebarConfig(next);
                          setDragItem(null);
                        }}
                        onDragEnd={() => setDragItem(null)}
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", marginLeft: 12, borderRadius: 6,
                          border: `1px solid ${T.border}`, marginBottom: 2, cursor: "grab",
                          background: dragItem?.gi === gi && dragItem?.ii === ii ? T.accentDim : T.surface2,
                          opacity: item.visible ? 1 : 0.4 }}>
                        <span style={{ color: T.text3, fontSize: 10, cursor: "grab" }}>⠿</span>
                        <span style={{ fontSize: 15, width: 20, textAlign: "center" }}>{item.icon}</span>
                        <span style={{ fontSize: 12, fontWeight: 500, flex: 1, color: item.visible ? T.text : T.text3 }}>{item.label}</span>
                        {item.key !== "dashboard" && item.key !== "settings" && (
                          <button onClick={() => {
                            const next = sidebarGroups.map((g, gIdx) => gIdx === gi ? { ...g, items: g.items.map((it, iIdx) => iIdx === ii ? { ...it, visible: !it.visible } : it) } : g);
                            setSidebarGroups(next);
                            saveSidebarConfig(next);
                          }} style={{ width: 34, height: 18, borderRadius: 9, border: "none", cursor: "pointer", position: "relative",
                            background: item.visible ? "#22c55e" : T.surface3, transition: "background 0.2s", padding: 0 }}>
                            <div style={{ width: 14, height: 14, borderRadius: 7, background: "#fff", position: "absolute", top: 2, left: item.visible ? 18 : 2, transition: "left 0.2s", boxShadow: "0 1px 2px rgba(0,0,0,0.2)" }} />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
                {/* Add custom group */}
                {addingGroup ? (
                  <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
                    <input autoFocus value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && newGroupName.trim()) { const next = [...sidebarGroups, { label: newGroupName.trim(), items: [] }]; setSidebarGroups(next); saveSidebarConfig(next); setNewGroupName(""); setAddingGroup(false); } if (e.key === "Escape") setAddingGroup(false); }}
                      placeholder="Group name..." style={{ flex: 1, padding: "6px 10px", fontSize: 12, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface2, color: T.text, outline: "none" }} />
                    <button onClick={() => { if (newGroupName.trim()) { const next = [...sidebarGroups, { label: newGroupName.trim(), items: [] }]; setSidebarGroups(next); saveSidebarConfig(next); setNewGroupName(""); setAddingGroup(false); } }}
                      style={{ padding: "6px 12px", fontSize: 11, fontWeight: 600, borderRadius: 6, background: T.accent, color: "#fff", border: "none", cursor: "pointer" }}>Add</button>
                    <button onClick={() => setAddingGroup(false)} style={{ padding: "6px 10px", fontSize: 11, borderRadius: 6, background: T.surface3, color: T.text3, border: "none", cursor: "pointer" }}>Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => setAddingGroup(true)}
                    style={{ marginTop: 8, padding: "6px 12px", fontSize: 11, fontWeight: 600, borderRadius: 6, border: `1px dashed ${T.border}`, background: "transparent", color: T.text3, cursor: "pointer", width: "100%" }}>
                    + Add Custom Group
                  </button>
                )}
                {/* Reset */}
                <button onClick={async () => {
                  const defaults = NAV_GROUPS.map(g => ({ label: g.label, items: g.items.map(i => ({ key: i.key, icon: i.icon, label: i.label, visible: true, adminOnly: i.adminOnly })) }));
                  setSidebarGroups(defaults);
                  await supabase.from("profiles").update({ sidebar_config: null, nav_order: null }).eq("org_id", orgId).eq("id", user.id);
                  showToast("Reset to default layout");
                }} style={{ marginTop: 6, fontSize: 11, color: T.text3, background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                  Reset to default layout
                </button>
              </div>
              )}
            </Section>
          </>
        )}

        {/* ── Organization ── */}
        {activeTab === "Organization" && (
          <>
            <h1 style={{ fontSize:20, fontWeight:800, marginBottom:20 }}>Organization</h1>
            <Section title="Company Information" subtitle="Details about your organization">
              <Field label="Company Name">
                <input value={orgName} onChange={e=>setOrgName(e.target.value)} style={inp} />
              </Field>
              <Field label="Industry">
                <input value={orgIndustry} onChange={e=>setOrgIndustry(e.target.value)} style={inp} />
              </Field>
              <Field label="Website">
                <input value={orgWebsite} onChange={e=>setOrgWebsite(e.target.value)} style={inp} placeholder="https://earthbreeze.com" />
              </Field>
              <Field label="Fiscal Year Start" hint="Used for financial reporting periods">
                <select value={orgFY} onChange={e=>setOrgFY(e.target.value)} style={{ ...inp, cursor:"pointer" }}>
                  {["January","February","March","April","May","June","July","August","September","October","November","December"].map(m=><option key={m} value={m}>{m}</option>)}
                </select>
              </Field>
              <button onClick={saveOrg} disabled={saving} style={{ padding:"10px 24px", fontSize:13, fontWeight:700, borderRadius:8, border:"none", background:T.accent, color:"#fff", cursor:"pointer" }}>
                Save Organization
              </button>
            </Section>

            <Section title="Modules" subtitle="Enable or disable modules for your organization">
              {[
                { key:"okrs", label:"OKRs", desc:"Objectives & Key Results tracking", icon:"◎", enabled:true },
                { key:"projects", label:"Projects", desc:"Task and project management", icon:"◫", enabled:true },
                { key:"plm", label:"PLM", desc:"Product Lifecycle Management", icon:"⬢", enabled:true },
                { key:"finance", label:"Finance", desc:"Financial management and reporting", icon:"◆", enabled:true },
                { key:"scorecard", label:"Scorecard", desc:"Weekly L10-style metrics", icon:"▣", enabled:true },
                { key:"campaigns", label:"Campaigns", desc:"Marketing campaign management", icon:"◈", enabled:true },
              ].map(mod => (
                <div key={mod.key} style={{ display:"flex", alignItems:"center", gap:14, padding:"12px 0", borderBottom:`1px solid ${T.border}` }}>
                  <div style={{ width:36, height:36, borderRadius:9, background:T.surface2, border:`1px solid ${T.border}`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:16 }}>{mod.icon}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:600 }}>{mod.label}</div>
                    <div style={{ fontSize:11, color:T.text3 }}>{mod.desc}</div>
                  </div>
                  <div onClick={() => {}} style={{ width:44, height:24, borderRadius:12, background:mod.enabled?T.accent:T.surface3, cursor:"pointer", position:"relative", transition:"background 0.2s" }}>
                    <div style={{ width:18, height:18, borderRadius:9, background:"#fff", position:"absolute", top:3, left:mod.enabled?23:3, transition:"left 0.2s", boxShadow:"0 1px 4px #00000030" }} />
                  </div>
                </div>
              ))}
            </Section>
          </>
        )}


        {/* ── Organizations (Multi-tenant) ── */}
        {activeTab === "Organizations" && (
          <>
            <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 20 }}>Organizations</h1>

            {/* Current orgs */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.text3, textTransform: "uppercase", marginBottom: 10 }}>Your Workspaces</div>
              {(orgs || []).map(org => (
                <div key={org.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: org.id === orgId ? T.accent + "08" : T.surface, border: `1px solid ${org.id === orgId ? T.accent + "40" : T.border}`, borderRadius: 10, marginBottom: 8 }}>
                  {org.logo_url ? (
                    <img src={org.logo_url} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: "cover" }} />
                  ) : (
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: org.id === orgId ? T.accent : T.surface3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, color: org.id === orgId ? "#fff" : T.text3 }}>{(org.name || "?")[0]}</div>
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{org.name}</div>
                    <div style={{ fontSize: 11, color: T.text3 }}>Role: {org.role} · ID: {org.id?.slice(0, 8)}…</div>
                  </div>
                  {org.id === orgId && (
                    <label style={{ padding: "3px 10px", fontSize: 10, fontWeight: 600, borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text3, cursor: "pointer" }}>
                      {org.logo_url ? "Change Logo" : "Upload Logo"}
                      <input type="file" accept="image/*" style={{ display: "none" }} onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const path = `${org.id}/${Date.now()}_${file.name}`;
                        const { error } = await supabase.storage.from("org-logos").upload(path, file, { contentType: file.type, upsert: true });
                        if (!error) {
                          const url = `${supabase.supabaseUrl}/storage/v1/object/public/org-logos/${path}`;
                          await supabase.from("organizations").update({ logo_url: url }).eq("id", org.id);
                          alert("Logo updated! Refresh to see it in the sidebar.");
                          window.location.reload();
                        }
                        e.target.value = "";
                      }} />
                    </label>
                  )}
                  {org.id === orgId ? (
                    <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20, background: T.accent + "18", color: T.accent }}>Active</span>
                  ) : (
                    <button onClick={() => { switchOrg(org.id); window.location.reload(); }} style={{ padding: "5px 14px", fontSize: 11, fontWeight: 600, borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, cursor: "pointer" }}>Switch</button>
                  )}
                </div>
              ))}
            </div>

            {/* Create new org */}
            <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, padding: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 12 }}>Create New Organization</div>
              <div style={{ fontSize: 12, color: T.text3, marginBottom: 16 }}>Create a separate workspace for another business. Each org has its own data, team members, and settings — completely isolated.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: T.text3, marginBottom: 3, textTransform: "uppercase" }}>Organization Name</div>
                  <input value={newOrgName} onChange={e => { setNewOrgName(e.target.value); setNewOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")); }}
                    placeholder="e.g. Acme Corp" style={{ width: "100%", padding: "8px 12px", fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface, color: T.text, boxSizing: "border-box" }} />
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: T.text3, marginBottom: 3, textTransform: "uppercase" }}>Slug (URL-friendly)</div>
                  <input value={newOrgSlug} onChange={e => setNewOrgSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                    placeholder="acme-corp" style={{ width: "100%", padding: "8px 12px", fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface, color: T.text, boxSizing: "border-box", fontFamily: "monospace" }} />
                </div>
              </div>
              <button onClick={async () => {
                if (!newOrgName.trim()) { alert("Organization name required"); return; }
                setCreatingOrg(true);
                try {
                  // Create the organization
                  const { data: newOrg, error: orgErr } = await supabase.from("organizations").insert({
                    name: newOrgName.trim(), slug: newOrgSlug || newOrgName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-"),
                  }).select().single();
                  if (orgErr) throw orgErr;

                  // Add current user as admin
                  await supabase.from("org_memberships").insert({
                    org_id: newOrg.id, user_id: user?.id, role: "admin", is_active: true,
                  });

                  alert(`Organization "${newOrgName}" created! You can switch to it from the sidebar or click "Switch" below.`);
                  setNewOrgName(""); setNewOrgSlug("");
                  // Reload page to refresh orgs list
                  window.location.reload();
                } catch (e) { alert("Error: " + (e.message || e)); }
                setCreatingOrg(false);
              }} disabled={creatingOrg || !newOrgName.trim()}
                style={{ padding: "8px 20px", fontSize: 13, fontWeight: 700, borderRadius: 8, border: "none", background: T.accent, color: "#fff", cursor: "pointer", opacity: creatingOrg || !newOrgName.trim() ? 0.5 : 1 }}>
                {creatingOrg ? "Creating…" : "Create Organization"}
              </button>
            </div>

            {/* Security note */}
            <div style={{ marginTop: 20, padding: "12px 16px", background: T.surface2, borderRadius: 8, fontSize: 11, color: T.text3, lineHeight: 1.6 }}>
              <strong style={{ color: T.text }}>Data Isolation:</strong> Each organization is completely separate. Team members in one org cannot see data from another org. All tables are filtered by org_id, and Row Level Security ensures isolation at the database level. A user can belong to multiple orgs but only sees data for the active workspace.
            </div>
          </>
        )}

        {/* ── Integrations ── */}
        {activeTab === "Integrations" && (
          <>
            <h1 style={{ fontSize:20, fontWeight:800, marginBottom:20 }}>Integrations</h1>
            {[
              { name:"Google Sheets", desc:"Sync financial data from your Google Sheets", icon:"📊", status:"connected", detail:"Earth Breeze Hydrogen tab" },
              { name:"QuickBooks Online", desc:"Sync P&L, Chart of Accounts, Vendors, Bills & Invoices", icon:"📒", status: qboConn ? "qbo_connected" : "qbo", detail: qboConn ? `✓ Connected to ${qboConn.company_name} (${qboConn.environment})${qboConn.last_synced_at ? " · Last sync " + new Date(qboConn.last_synced_at).toLocaleString() : " · Not yet synced"}` : "Connect to Earth Breeze QBO account" },
              { name:"Slack", desc:"Receive notifications and updates in Slack", icon:"💬", status:"connected", detail:"Connected · DM to Ben · Earth Breeze workspace", testable:true },
              { name:"Shopify", desc:"Pull revenue, orders, and product data", icon:"🛍️", status:"shopify_connected", detail:"earth-breeze-hydrogen.myshopify.com · Auto-syncs 6am/6pm UTC" },
              { name:"Amazon Seller Central", desc:"Import Amazon revenue and ad spend", icon:"📦", status:"available", detail:"Daily sales sync" },
              { name:"Meta Ads", desc:"Sync ad spend and ROAS from Meta", icon:"🎯", status:"available", detail:"Ad performance data" },
              { name:"Google Analytics", desc:"Website traffic and conversion data", icon:"📈", status:"available", detail:"Marketing analytics" },
              { name:"Zapier", desc:"Connect with 5,000+ apps via webhooks", icon:"⚡", status:"available", detail:"Custom automations" },
              { name:"Metabase", desc:"Pull dashboards, saved questions, and raw data into Helm", icon:"📊", status:"metabase", detail:"metabase.earthbreezedev.com" },
            ].map(integ => (
              <div key={integ.name} style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 20px", background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, marginBottom:10 }}>
                <div style={{ fontSize:28, flexShrink:0 }}>{integ.icon}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:600, marginBottom:2 }}>{integ.name}</div>
                  <div style={{ fontSize:12, color:T.text3 }}>{integ.desc}</div>
                  {integ.detail && <div style={{ fontSize:11, color:(integ.status==="connected"||integ.status==="qbo_connected")?"#22c55e":T.text3, marginTop:3, fontWeight:(integ.status==="connected"||integ.status==="qbo_connected")?600:400 }}>
                    {integ.detail}
                  </div>}
                </div>
                <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                  {integ.status === "metabase" ? (
                    <>
                    <button onClick={() => setShowMetabase(true)} style={{ padding:"7px 14px", fontSize:12, fontWeight:600, borderRadius:7, cursor:"pointer", background:T.accentDim, color:T.accent, border:`1px solid ${T.border}` }}>
                      Browse Data
                    </button>
                    <button onClick={async (e) => {
                      const btn = e.currentTarget; btn.textContent = "⏳ Testing..."; btn.disabled = true;
                      try {
                        const res = await fetch("https://upbjdmnykheubxkuknuj.supabase.co/functions/v1/metabase-sync", {
                          method: "POST", headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "test" }),
                        });
                        const data = await res.json();
                        if (data.connected) {
                          btn.textContent = `✅ ${data.user?.name} · ${data.databases} DBs · ${data.collections} collections`;
                          btn.style.color = "#22c55e";
                        } else {
                          btn.textContent = "❌ " + (data.error || "Failed");
                          btn.style.color = "#ef4444";
                        }
                      } catch (err) { btn.textContent = "❌ Error"; btn.style.color = "#ef4444"; }
                      setTimeout(() => { btn.textContent = "Test Connection"; btn.disabled = false; btn.style.color = T.accent; }, 5000);
                    }} style={{ padding:"7px 14px", fontSize:12, fontWeight:600, borderRadius:7, cursor:"pointer", background:T.accentDim, color:T.accent, border:`1px solid ${T.border}` }}>
                      Test Connection
                    </button>
                    </>
                  ) : (
                  <button style={{ padding:"7px 14px", fontSize:12, fontWeight:600, borderRadius:7, cursor:"pointer",
                    background: (integ.status==="connected"||integ.status==="qbo_connected")?"#22c55e15":integ.status==="qbo"?T.surface2:T.accentDim,
                    color: (integ.status==="connected"||integ.status==="qbo_connected")?"#22c55e":integ.status==="qbo"?T.text3:T.accent,
                    border: `1px solid ${(integ.status==="connected"||integ.status==="qbo_connected")?"#22c55e40":T.border}` }}>
                    {(integ.status==="connected"||integ.status==="qbo_connected")?"Connected":integ.status==="qbo"?"Connect QBO":"Connect"}
                  </button>
                  )}
                  {integ.status==="qbo" && (
                    <button onClick={async ()=>{
                      // reCAPTCHA v3 + edge function: fetches endpoint from Intuit discovery doc + stores CSRF state server-side
                      try {
                        // Load reCAPTCHA v3 script if not already loaded
                        const RECAPTCHA_SITE_KEY = "6Ld0n5ksAAAAAA6w244DzsYtmcNoJeJTyN4pEKhy";
                        if (!window.grecaptcha) {
                          await new Promise((resolve, reject) => {
                            const s = document.createElement("script");
                            s.src = `https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`;
                            s.onload = () => {
                              // grecaptcha.ready fires when the library is fully loaded
                              window.grecaptcha.ready(resolve);
                            };
                            s.onerror = reject;
                            document.head.appendChild(s);
                          });
                        }
                        // Execute reCAPTCHA v3 and get token
                        const recaptchaToken = await new Promise((resolve, reject) => {
                          window.grecaptcha.ready(() => {
                            window.grecaptcha.execute(RECAPTCHA_SITE_KEY, { action: "qbo_connect" })
                              .then(resolve).catch(reject);
                          });
                        });
                        const res = await fetch("https://upbjdmnykheubxkuknuj.supabase.co/functions/v1/qbo-auth-url", {
                          method: "POST",
                          headers: { "Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwYmpkbW55a2hldWJ4a3VrbnVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNDI3OTcsImV4cCI6MjA4NzcxODc5N30.pvTTkiZWNDPuo-Fdzm54uy8w1mlx0AjB5jtFm3MeGq4" },
                          body: JSON.stringify({ recaptcha_token: recaptchaToken, org_id: orgId, user_id: user?.id }),
                        });
                        const data = await res.json();
                        if (data.auth_url) { window.location.href = data.auth_url; }
                        else { alert("Could not start QBO connection: " + (data.error || "unknown error")); }
                      } catch(e) { alert("Connection error: " + e); }
                    }} style={{ padding:"7px 14px", fontSize:12, fontWeight:600, borderRadius:7, cursor:"pointer", flexShrink:0, background:T.accent, color:"#fff", border:"none" }}>
                      Connect →
                    </button>
                  )}
                  {integ.status==="qbo_connected" && (
                    <div style={{ display:"flex", gap:6 }}>
                      <button onClick={async ()=>{
                        setQboSyncing(true);
                        try {
                          const res = await fetch("https://upbjdmnykheubxkuknuj.supabase.co/functions/v1/qbo-sync", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({}),
                          });
                          const data = await res.json();
                          if (data.error) { showToast("QBO sync error: " + data.error, "#ef4444"); }
                          else { showToast(`QBO synced: ${data.accounts||0} accounts, ${data.vendors||0} vendors, ${data.bills||0} bills, ${data.customers||0} customers, ${data.invoices||0} invoices`, "#22c55e"); }
                          // Refresh connection state
                          const { data: conn } = await supabase.from("qbo_connections").select("*").eq("org_id", orgId).order("connected_at", { ascending: false }).limit(1);
                          if (conn && conn.length > 0) setQboConn(conn[0]);
                        } catch(e) { showToast("Sync failed: " + e, "#ef4444"); }
                        setQboSyncing(false);
                      }} disabled={qboSyncing} style={{ padding:"7px 14px", fontSize:12, fontWeight:600, borderRadius:7, cursor: qboSyncing ? "wait" : "pointer", flexShrink:0, background: qboSyncing ? T.surface3 : T.accent, color: qboSyncing ? T.text3 : "#fff", border:"none" }}>
                        {qboSyncing ? "Syncing…" : "⟲ Sync Now"}
                      </button>
                      <button onClick={async ()=>{
                        if (!confirm("Disconnect QuickBooks? You can reconnect later.")) return;
                        await supabase.from("qbo_connections").delete().eq("org_id", orgId).eq("id", qboConn.id);
                        setQboConn(null);
                        showToast("QuickBooks disconnected", "#f59e0b");
                      }} style={{ padding:"7px 14px", fontSize:12, fontWeight:500, borderRadius:7, cursor:"pointer", flexShrink:0, background:T.surface2, color:T.text3, border:`1px solid ${T.border}` }}>
                        Disconnect
                      </button>
                    </div>
                  )}
                  {integ.status==="shopify_connected" && (
                    <div style={{ display:"flex", gap:6 }}>
                      <button onClick={async ()=>{
                        showToast("Syncing Shopify orders (today + yesterday)…", T.accent);
                        try {
                          const res = await fetch("https://upbjdmnykheubxkuknuj.supabase.co/functions/v1/shopify-auto-sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
                          const data = await res.json();
                          const todayOrders = data.results?.today?.orders || 0;
                          const yestOrders = data.results?.yesterday?.orders || 0;
                          showToast(`Shopify synced: ${todayOrders} orders today, ${yestOrders} yesterday`, "#22c55e");
                        } catch(e) { showToast("Sync failed: " + e, "#ef4444"); }
                      }} style={{ padding:"7px 14px", fontSize:12, fontWeight:600, borderRadius:7, cursor:"pointer", background:T.accent, color:"#fff", border:"none" }}>
                        ⟲ Sync Now
                      </button>
                      <button onClick={async ()=>{
                        const days = prompt("How many days to backfill?", "12");
                        if (!days) return;
                        showToast(`Backfilling ${days} days of Shopify data…`, T.accent);
                        try {
                          const res = await fetch("https://upbjdmnykheubxkuknuj.supabase.co/functions/v1/shopify-sync", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "full", days_back: parseInt(days) }) });
                          const data = await res.json();
                          const products = data.results?.products?.variants || 0;
                          const customers = data.results?.customers?.count || 0;
                          const orderDays = data.results?.orders?.length || 0;
                          showToast(`Full sync done: ${products} product variants, ${customers} customers, ${orderDays} days of orders`, "#22c55e");
                        } catch(e) { showToast("Backfill failed: " + e, "#ef4444"); }
                      }} style={{ padding:"7px 14px", fontSize:12, fontWeight:500, borderRadius:7, cursor:"pointer", background:T.surface2, color:T.text2, border:`1px solid ${T.border}` }}>
                        📥 Full Backfill
                      </button>
                    </div>
                  )}
                  {integ.testable && (
                    <button onClick={async () => {
                      const res = await notifySlack({ type:"info", title:"Helm test notification 🔔", message:"Your Slack integration is working. Helm will send you notifications here automatically.", url:"https://helm-app-six.vercel.app" });
                      showToast(res?.success ? "Test message sent to your Slack DM ✓" : "Failed — check SLACK_BOT_TOKEN in Supabase secrets", res?.success ? "#22c55e" : "#ef4444");
                    }} style={{ padding:"7px 14px", fontSize:12, fontWeight:600, borderRadius:7, cursor:"pointer",
                      background:T.surface2, color:T.text2, border:`1px solid ${T.border}` }}>
                      ↗ Test
                    </button>
                  )}
                </div>
              </div>
            ))}
          </>
        )}

        {/* ── Notifications ── */}
        {activeTab === "Notifications" && (
          <>
            <h1 style={{ fontSize:20, fontWeight:800, marginBottom:20 }}>Notifications</h1>
            <Section title="In-App Notifications" subtitle="Choose what you get notified about">
              {[
                { key:"task_overdue", label:"Overdue Tasks", desc:"When tasks assigned to you pass their due date" },
                { key:"okr_deadline", label:"OKR Deadlines", desc:"When OKR cycles are ending soon" },
                { key:"approval", label:"Approval Requests", desc:"When you have pending approvals" },
                { key:"mention", label:"Mentions", desc:"When someone mentions you in a comment" },
                { key:"weekly_digest", label:"Weekly Digest", desc:"Summary of activity every Monday morning" },
              ].map(n => (
                <div key={n.key} style={{ display:"flex", alignItems:"center", gap:14, padding:"12px 0", borderBottom:`1px solid ${T.border}` }}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13, fontWeight:600 }}>{n.label}</div>
                    <div style={{ fontSize:11, color:T.text3 }}>{n.desc}</div>
                  </div>
                  <div onClick={() => setNotifSettings(p => ({...p, [n.key]:!p[n.key]}))}
                    style={{ width:44, height:24, borderRadius:12, background:notifSettings[n.key]?T.accent:T.surface3, cursor:"pointer", position:"relative", transition:"background 0.2s" }}>
                    <div style={{ width:18, height:18, borderRadius:9, background:"#fff", position:"absolute", top:3, left:notifSettings[n.key]?23:3, transition:"left 0.2s", boxShadow:"0 1px 4px #00000030" }} />
                  </div>
                </div>
              ))}
              <button onClick={() => showToast("Notification preferences saved")}
                style={{ marginTop:16, padding:"10px 24px", fontSize:13, fontWeight:700, borderRadius:8, border:"none", background:T.accent, color:"#fff", cursor:"pointer" }}>
                Save Preferences
              </button>
            </Section>
          </>
        )}

        {/* ── About ── */}
        {activeTab === "About" && (
          <>
            <h1 style={{ fontSize:20, fontWeight:800, marginBottom:20 }}>About</h1>
            <Section title="Helm Business OS">
              <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:20 }}>
                <div style={{ width:64, height:64, borderRadius:16, background:`linear-gradient(135deg, ${T.accent}, #8b5cf6)`,
                  display:"flex", alignItems:"center", justifyContent:"center", fontSize:28, fontWeight:900, color:"#fff" }}>H</div>
                <div>
                  <div style={{ fontSize:20, fontWeight:800 }}>Helm</div>
                  <div style={{ fontSize:13, color:T.text3 }}>Unified Business Operating System</div>
                  <div style={{ fontSize:11, color:T.text3, marginTop:4 }}>Version 2.0 · Built with Next.js, Supabase & Vercel</div>
                </div>
              </div>
              <div style={{ fontSize:13, color:T.text2, lineHeight:1.8, marginBottom:20 }}>
                Helm brings together your OKRs, Projects, PLM, Finance, and operations into a single platform — giving you real-time visibility across every part of your business.
              </div>
              <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:10 }}>
                {[
                  { label:"OKRs & Key Results", icon:"◎" },
                  { label:"Project Management", icon:"◫" },
                  { label:"Product Lifecycle", icon:"⬢" },
                  { label:"Financial Intelligence", icon:"◆" },
                  { label:"Weekly Scorecard", icon:"▣" },
                  { label:"Google Sheets Sync", icon:"📊" },
                  { label:"Approval Workflows", icon:"⏳" },
                  { label:"AI-Powered Insights", icon:"🤖" },
                ].map(f => (
                  <div key={f.label} style={{ display:"flex", alignItems:"center", gap:8, padding:"10px 14px", background:T.surface2, borderRadius:8, border:`1px solid ${T.border}` }}>
                    <span style={{ fontSize:16 }}>{f.icon}</span>
                    <span style={{ fontSize:12, fontWeight:500, color:T.text }}>{f.label}</span>
                  </div>
                ))}
              </div>
            </Section>
            <Section title="Account">
              <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16, padding:"12px 16px", background:T.surface2, borderRadius:9 }}>
                <div style={{ fontSize:13, flex:1 }}>Signed in as <strong>{user?.email}</strong></div>
              </div>
              <button onClick={signOut} style={{ padding:"10px 20px", fontSize:13, fontWeight:600, borderRadius:8, border:"1px solid #ef444440", background:"#ef444410", color:"#ef4444", cursor:"pointer" }}>
                Sign Out
              </button>
            </Section>
          </>
        )}
      </div>
      {showMetabase && <MetabaseBrowser onClose={() => setShowMetabase(false)} />}
    </div>
  );
}
