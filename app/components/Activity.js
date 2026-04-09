"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";
import { useAuth } from "../lib/auth";

const AVATAR_COLORS = ["#3b82f6","#a855f7","#ec4899","#06b6d4","#f97316","#22c55e","#84cc16","#ef4444"];
const acol = (uid) => uid ? AVATAR_COLORS[uid.charCodeAt(uid.length - 1) % AVATAR_COLORS.length] : T.text3;

const ACTION_CFG = {
  created:   { icon: "✚", color: "#22c55e",  verb: "created" },
  updated:   { icon: "✎", color: "#3b82f6",  verb: "updated" },
  completed: { icon: "✓", color: "#22c55e",  verb: "completed" },
  deleted:   { icon: "✕", color: "#ef4444",  verb: "deleted" },
  assigned:  { icon: "→", color: "#a855f7",  verb: "assigned" },
  commented: { icon: "💬",color: "#06b6d4",  verb: "commented on" },
  moved:     { icon: "↻", color: "#f97316",  verb: "moved" },
  archived:  { icon: "⊟", color: "#8b93a8",  verb: "archived" },
  restored:  { icon: "↩", color: "#22c55e",  verb: "restored" },
  approved:  { icon: "✓", color: "#22c55e",  verb: "approved" },
  rejected:  { icon: "✕", color: "#ef4444",  verb: "rejected" },
  status_changed: { icon: "↻", color: "#f97316", verb: "changed status of" },
};

const ENTITY_CFG = {
  task:      { icon: "☐",  color: "#3b82f6", label: "Task" },
  project:   { icon: "◼",  color: "#22c55e", label: "Project" },
  doc:       { icon: "📄", color: "#06b6d4", label: "Doc" },
  document:  { icon: "📄", color: "#06b6d4", label: "Doc" },
  campaign:  { icon: "📢", color: "#f97316", label: "Campaign" },
  objective: { icon: "🎯", color: "#a855f7", label: "Objective" },
  key_result:{ icon: "◎",  color: "#22c55e", label: "KR" },
  product:   { icon: "⬢",  color: "#8b5cf6", label: "PLM" },
  call:      { icon: "📞", color: "#06b6d4", label: "Call" },
  automation:{ icon: "⚡", color: "#eab308", label: "Automation" },
};

const ENTITY_FILTERS = ["task", "project", "document", "campaign", "objective", "key_result"];

const relTime = (date) => {
  const diff = Date.now() - new Date(date).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const dayLabel = (date) => {
  const d = new Date(date);
  const today = new Date(); today.setHours(0,0,0,0);
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1);
  if (d >= today) return "Today";
  if (d >= yesterday) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
};

export default function ActivityView({ setActive }) {
  const { user , orgId } = useAuth();
  const [activities, setActivities] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [entityFilter, setEntityFilter] = useState("all");
  const [showMine, setShowMine] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const PAGE = 50;

  const load = useCallback(async (offset = 0) => {
    if (offset === 0) setLoading(true); else setLoadingMore(true);
    const [{ data: acts }, { data: prof }] = await Promise.all([
      supabase.from("activity_log").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).range(offset, offset + PAGE - 1),
      offset === 0 ? supabase.from("profiles").select("id,display_name").eq("org_id", orgId) : Promise.resolve({ data: null }),
    ]);
    if (offset === 0) {
      setActivities(acts || []);
      if (prof) { const m = {}; prof.forEach(u => { m[u.id] = u; }); setProfiles(m); }
    } else {
      setActivities(p => [...p, ...(acts || [])]);
    }
    setHasMore((acts || []).length === PAGE);
    setLoading(false); setLoadingMore(false);
  }, []);

  useEffect(() => { load(0); }, []);

  const ini = (uid) => { const u = profiles[uid]; return u?.display_name ? u.display_name.split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase() : "?"; };
  const uname = (uid) => profiles[uid]?.display_name || "Unknown";

  let filtered = activities;
  if (entityFilter !== "all") filtered = filtered.filter(a => a.entity_type === entityFilter);
  if (showMine) filtered = filtered.filter(a => a.actor_id === user?.id);

  // Group by day label
  const groups = filtered.reduce((acc, a) => {
    const label = dayLabel(a.created_at);
    if (!acc[label]) acc[label] = [];
    acc[label].push(a);
    return acc;
  }, {});

  // Stats
  const todayCount = activities.filter(a => {
    const d = new Date(a.created_at); const t = new Date(); t.setHours(0,0,0,0); return d >= t;
  }).length;
  const myCount = activities.filter(a => a.actor_id === user?.id).length;
  const entityCounts = ENTITY_FILTERS.reduce((acc, e) => {
    acc[e] = activities.filter(a => a.entity_type === e).length;
    return acc;
  }, {});

  if (loading) return <div style={{ display:"flex", height:"100%", alignItems:"center", justifyContent:"center", color:T.text3, fontSize:13 }}>Loading activity…</div>;

  return (
    <div style={{ display:"flex", height:"100%", overflow:"hidden" }}>
      {/* Main feed */}
      <div style={{ flex:1, overflow:"auto" }}>
        {/* Header */}
        <div style={{ padding:"20px 28px", borderBottom:`1px solid ${T.border}`, background:T.surface, position:"sticky", top:0, zIndex:5 }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
            <div>
              <h2 style={{ fontSize:20, fontWeight:700, marginBottom:2 }}>Activity</h2>
              <div style={{ fontSize:12, color:T.text3 }}>{todayCount} events today · {activities.length} loaded</div>
            </div>
            <button onClick={() => setShowMine(!showMine)} style={{ padding:"6px 14px", fontSize:12, fontWeight:600, borderRadius:7, border:`1px solid ${showMine?T.accent:T.border}`, background:showMine?T.accentDim:"transparent", color:showMine?T.accent:T.text3, cursor:"pointer" }}>
              {showMine ? "👤 My activity" : "All activity"}
            </button>
          </div>
          {/* Entity filters */}
          <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
            <button onClick={() => setEntityFilter("all")} style={{ padding:"4px 10px", fontSize:11, fontWeight:600, borderRadius:5, cursor:"pointer", background:entityFilter==="all"?T.accentDim:T.surface2, color:entityFilter==="all"?T.accent:T.text3, border:`1px solid ${entityFilter==="all"?T.accent+"40":T.border}` }}>
              All
            </button>
            {ENTITY_FILTERS.filter(e => entityCounts[e] > 0).map(e => {
              const cfg = ENTITY_CFG[e] || {};
              return (
                <button key={e} onClick={() => setEntityFilter(e === entityFilter ? "all" : e)} style={{ padding:"4px 10px", fontSize:11, fontWeight:600, borderRadius:5, cursor:"pointer", display:"flex", alignItems:"center", gap:4, background:entityFilter===e?`${cfg.color}20`:T.surface2, color:entityFilter===e?cfg.color:T.text3, border:`1px solid ${entityFilter===e?cfg.color+"40":T.border}` }}>
                  <span>{cfg.icon}</span>
                  <span>{cfg.label}s</span>
                  <span style={{ fontSize:9, background: entityFilter===e?cfg.color+"30":T.surface3, padding:"0 4px", borderRadius:4 }}>{entityCounts[e]}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ padding:"20px 28px", maxWidth:760 }}>
          {Object.keys(groups).length === 0 && (
            <div style={{ textAlign:"center", padding:"48px 0", color:T.text3 }}>
              <div style={{ fontSize:40, marginBottom:12 }}>◔</div>
              <div style={{ fontSize:15, fontWeight:600, marginBottom:4 }}>No activity found</div>
              <div style={{ fontSize:13 }}>Actions across your workspace will appear here</div>
            </div>
          )}

          {Object.entries(groups).map(([day, items]) => (
            <div key={day} style={{ marginBottom:28 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
                <span style={{ fontSize:11, fontWeight:700, color:T.text3, textTransform:"uppercase", letterSpacing:0.8 }}>{day}</span>
                <div style={{ flex:1, height:1, background:T.border }} />
                <span style={{ fontSize:10, color:T.text3 }}>{items.length}</span>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                {items.map(act => {
                  const cfg = ACTION_CFG[act.action] || { icon:"·", color:T.text3, verb:act.action };
                  const ent = ENTITY_CFG[act.entity_type] || { icon:"·", color:T.text3 };
                  const isMe = act.actor_id === user?.id;
                  return (
                    <div key={act.id} onClick={() => {
                      const modMap = { task:"projects", project:"projects", document:"docs", doc:"docs", objective:"okrs", key_result:"okrs", campaign:"campaigns", product:"plm" };
                      if (setActive && modMap[act.entity_type]) setActive(modMap[act.entity_type]);
                    }} style={{ display:"flex", gap:12, padding:"9px 12px", borderRadius:8, cursor:"pointer", transition:"background 0.1s" }}
                      onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      {/* Avatar */}
                      <div style={{ width:32, height:32, borderRadius:16, background:acol(act.actor_id)+"20", border:`1.5px solid ${acol(act.actor_id)}50`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, color:acol(act.actor_id), flexShrink:0 }}>
                        {ini(act.actor_id)}
                      </div>
                      {/* Content */}
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, lineHeight:1.4, display:"flex", alignItems:"center", gap:4, flexWrap:"wrap" }}>
                          <span style={{ fontWeight:700, color:isMe?T.accent:T.text }}>{isMe ? "You" : uname(act.actor_id)}</span>
                          <span style={{ fontSize:11, padding:"1px 6px", borderRadius:4, background:cfg.color+"18", color:cfg.color, fontWeight:600 }}>{cfg.verb}</span>
                          <span style={{ fontSize:12 }}>{ent.icon}</span>
                          <span style={{ fontWeight:500, color:T.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:240 }}>{act.entity_name || act.entity_type}</span>
                        </div>
                        {act.changes && Object.keys(act.changes).length > 0 && (
                          <div style={{ fontSize:10, color:T.text3, marginTop:3, display:"flex", gap:8, flexWrap:"wrap" }}>
                            {Object.entries(act.changes).slice(0,3).map(([k,v]) => (
                              <span key={k} style={{ padding:"1px 5px", borderRadius:3, background:T.surface3 }}>{k}: <strong>{String(v).slice(0,30)}</strong></span>
                            ))}
                          </div>
                        )}
                        <div style={{ fontSize:10, color:T.text3, marginTop:2 }}>{relTime(act.created_at)}</div>
                      </div>
                      {/* Entity type badge */}
                      <span style={{ fontSize:9, padding:"2px 6px", borderRadius:4, background:ent.color+"15", color:ent.color, fontWeight:700, flexShrink:0, alignSelf:"flex-start", marginTop:2 }}>{ent.label || act.entity_type}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {hasMore && (
            <button onClick={async () => { setLoadingMore(true); await load(activities.length); }} disabled={loadingMore}
              style={{ width:"100%", padding:"10px", borderRadius:8, border:`1px solid ${T.border}`, background:T.surface2, color:T.text3, fontSize:13, cursor:"pointer", marginTop:8, fontWeight:500 }}>
              {loadingMore ? "Loading…" : "Load more"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
