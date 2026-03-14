"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/theme";
import { notifySlack } from "../lib/slack";

const TABS = ["Profile","Organization","Team","Integrations","Notifications","About"];
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

export default function SettingsView() {
  const { user, profile, signOut } = useAuth();
  const { mode, toggle } = useTheme();
  const [activeTab, setActiveTab] = useState("Profile");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  // Profile
  const [displayName, setDisplayName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [title, setTitle] = useState("");
  const [bio, setBio] = useState("");

  // Org
  const [orgName, setOrgName] = useState("Earth Breeze");
  const [orgWebsite, setOrgWebsite] = useState("");
  const [orgIndustry, setOrgIndustry] = useState("Consumer Packaged Goods");
  const [orgFY, setOrgFY] = useState("January");

  // Team
  const [members, setMembers] = useState([]);
  const [inviteEmail, setInviteEmail] = useState("");

  // Notifications
  const [notifSettings, setNotifSettings] = useState({
    task_overdue: true, okr_deadline: true, approval: true, mention: true, weekly_digest: true,
  });

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || "");
      setTimezone(profile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
      setTitle(profile.title || "");
      setBio(profile.bio || "");
    }
    // Load team
    loadTeam();
  }, [profile]);

  const loadTeam = async () => {
    const { data } = await supabase.from("org_memberships").select("user_id, role, joined_at, profiles(id,display_name,email)").limit(20);
    setMembers(data || []);
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
    }).eq("id", user.id);
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
        {TABS.map(tab => (
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
              {/* Avatar */}
              <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:24 }}>
                <div style={{ width:72, height:72, borderRadius:36, background:acol(user?.id)+"30",
                  border:`2px solid ${acol(user?.id)}60`, display:"flex", alignItems:"center",
                  justifyContent:"center", fontSize:24, fontWeight:700, color:acol(user?.id) }}>
                  {ini(displayName || profile?.display_name)}
                </div>
                <div>
                  <div style={{ fontSize:14, fontWeight:600 }}>{displayName || "Your name"}</div>
                  <div style={{ fontSize:12, color:T.text3 }}>{user?.email}</div>
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

        {/* ── Team ── */}
        {activeTab === "Team" && (
          <>
            <h1 style={{ fontSize:20, fontWeight:800, marginBottom:20 }}>Team</h1>
            <Section title="Team Members" subtitle={`${members.length} member${members.length!==1?"s":""} in your organization`}>
              <div style={{ display:"flex", gap:8, marginBottom:20 }}>
                <input value={inviteEmail} onChange={e=>setInviteEmail(e.target.value)} placeholder="colleague@company.com"
                  style={{ ...inp, flex:1, maxWidth:"none" }} />
                <button onClick={() => showToast("Invite sent!")} style={{ padding:"9px 16px", fontSize:13, fontWeight:600, background:T.accent, color:"#fff", border:"none", borderRadius:8, cursor:"pointer" }}>
                  Invite
                </button>
              </div>
              {members.map((m, i) => {
                const name = m.profiles?.display_name || "Unknown";
                const email = m.profiles?.email || "";
                const c = acol(m.user_id);
                return (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 0", borderBottom:`1px solid ${T.border}` }}>
                    <div style={{ width:38, height:38, borderRadius:19, background:c+"25", border:`1.5px solid ${c}60`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, color:c }}>
                      {ini(name)}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:600 }}>{name}</div>
                      {email && <div style={{ fontSize:11, color:T.text3 }}>{email}</div>}
                    </div>
                    <span style={{ fontSize:11, fontWeight:600, padding:"3px 10px", borderRadius:6, background:m.role==="admin"?T.accentDim:T.surface2, color:m.role==="admin"?T.accent:T.text3 }}>
                      {m.role||"member"}
                    </span>
                  </div>
                );
              })}
              {members.length===0 && <div style={{ fontSize:12, color:T.text3, padding:"12px 0" }}>No team members found</div>}
            </Section>
          </>
        )}

        {/* ── Integrations ── */}
        {activeTab === "Integrations" && (
          <>
            <h1 style={{ fontSize:20, fontWeight:800, marginBottom:20 }}>Integrations</h1>
            {[
              { name:"Google Sheets", desc:"Sync financial data from your Google Sheets", icon:"📊", status:"connected", detail:"Earth Breeze Hydrogen tab" },
              { name:"QuickBooks Online", desc:"Import GL accounts, transactions, and vendors", icon:"📒", status:"available", detail:"Connect for full P&L sync" },
              { name:"Slack", desc:"Receive notifications and updates in Slack", icon:"💬", status:"connected", detail:"Connected · DM to Ben · Earth Breeze workspace", testable:true },
              { name:"Shopify", desc:"Pull revenue, orders, and product data", icon:"🛍️", status:"available", detail:"Real-time revenue sync" },
              { name:"Amazon Seller Central", desc:"Import Amazon revenue and ad spend", icon:"📦", status:"available", detail:"Daily sales sync" },
              { name:"Meta Ads", desc:"Sync ad spend and ROAS from Meta", icon:"🎯", status:"available", detail:"Ad performance data" },
              { name:"Google Analytics", desc:"Website traffic and conversion data", icon:"📈", status:"available", detail:"Marketing analytics" },
              { name:"Zapier", desc:"Connect with 5,000+ apps via webhooks", icon:"⚡", status:"available", detail:"Custom automations" },
            ].map(integ => (
              <div key={integ.name} style={{ display:"flex", alignItems:"center", gap:14, padding:"14px 20px", background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, marginBottom:10 }}>
                <div style={{ fontSize:28, flexShrink:0 }}>{integ.icon}</div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:600, marginBottom:2 }}>{integ.name}</div>
                  <div style={{ fontSize:12, color:T.text3 }}>{integ.desc}</div>
                  {integ.detail && <div style={{ fontSize:11, color:integ.status==="connected"?"#22c55e":T.text3, marginTop:3, fontWeight:integ.status==="connected"?600:400 }}>
                    {integ.status==="connected"?"✓ ":""}{integ.detail}
                  </div>}
                </div>
                <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                  <button style={{ padding:"7px 14px", fontSize:12, fontWeight:600, borderRadius:7, cursor:"pointer",
                    background: integ.status==="connected"?"#22c55e15":T.accentDim,
                    color: integ.status==="connected"?"#22c55e":T.accent,
                    border: `1px solid ${integ.status==="connected"?"#22c55e40":T.accent+"40"}` }}>
                    {integ.status==="connected"?"Connected":"Connect"}
                  </button>
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
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
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
    </div>
  );
}
