"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";
import { useResponsive } from "../lib/responsive";
import SearchableMultiSelect from "./SearchableSelect";
import { useAuth } from "../lib/auth";
import { notifySlack } from "../lib/slack";

const AVATAR_COLORS = ["#3b82f6","#a855f7","#ec4899","#06b6d4","#f97316","#22c55e","#84cc16","#ef4444"];
const acol = (uid) => uid ? AVATAR_COLORS[uid.charCodeAt(uid.length-1)%AVATAR_COLORS.length] : T.text3;
const HEALTH = { on_track:{label:"On Track",color:"#22c55e"}, at_risk:{label:"At Risk",color:"#eab308"}, off_track:{label:"Off Track",color:"#ef4444"} };

const fmt$ = (v) => {
  if (v == null) return "—";
  const abs = Math.abs(v);
  const s = v < 0 ? "-" : "";
  if (abs >= 1_000_000) return s + "$" + (abs/1_000_000).toFixed(1) + "M";
  if (abs >= 1_000)     return s + "$" + (abs/1_000).toFixed(0)     + "K";
  return s + "$" + abs.toFixed(0);
};

function Ring({ pct, size=80, stroke=6, color }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} style={{ transform:"rotate(-90deg)", flexShrink:0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={T.surface3} strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color||T.accent} strokeWidth={stroke}
        strokeDasharray={`${(Math.min(100,pct)/100)*circ} ${circ}`} strokeLinecap="round"
        style={{ transition:"stroke-dasharray 0.8s ease" }} />
    </svg>
  );
}

function KPICard({ label, value, sub, color, icon, onClick }) {
  return (
    <div onClick={onClick} style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:12,
      padding:"16px 20px", cursor:onClick?"pointer":"default", transition:"border-color 0.15s",
      display:"flex", flexDirection:"column", gap:4 }}
      onMouseEnter={e=>onClick&&(e.currentTarget.style.borderColor=T.accent+"60")}
      onMouseLeave={e=>onClick&&(e.currentTarget.style.borderColor=T.border)}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:2 }}>
        <span style={{ fontSize:16 }}>{icon}</span>
        <span style={{ fontSize:11, fontWeight:600, color:T.text3, textTransform:"uppercase", letterSpacing:0.5 }}>{label}</span>
      </div>
      <div style={{ fontSize:28, fontWeight:800, color:color||T.text, lineHeight:1.1 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:T.text3 }}>{sub}</div>}
    </div>
  );
}

function SectionHeader({ title, action, icon, count }) {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        {icon && <span style={{ fontSize:14 }}>{icon}</span>}
        <span style={{ fontSize:15, fontWeight:700 }}>{title}</span>
        {count != null && <span style={{ fontSize:11, color:T.text3, background:T.surface2, padding:"1px 8px", borderRadius:8 }}>{count}</span>}
      </div>
      {action}
    </div>
  );
}

function Card({ children, style={} }) {
  return <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:14, padding:20, ...style }}>{children}</div>;
}

/* ═══════════════════════════════════════════════════════
   TODAY'S FOCUS — Enhanced with + Add Focus Item
   ═══════════════════════════════════════════════════════ */
function TodaysFocus({ tasks, projects, focusItems, setFocusItems, todayStr, setActive, profile }) {
  const [addMode, setAddMode] = useState(null); // null | "custom" | "task"
  const [customTitle, setCustomTitle] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [collapsed, setCollapsed] = useState(() => { try { return localStorage.getItem("helm-focus-collapsed") === "1"; } catch { return false; } });
  const inputRef = useRef(null);

  // Auto-pulled focus tasks (urgent/high/due today)
  const autoPulled = tasks.filter(t =>
    t.status !== "done" && t.status !== "cancelled" && !t.parent_task_id &&
    (t.due_date === todayStr || t.priority === "urgent" || (t.priority === "high" && t.due_date && t.due_date <= todayStr))
  ).sort((a, b) => {
    const pOrder = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
    return (pOrder[a.priority] || 4) - (pOrder[b.priority] || 4);
  }).slice(0, 6);

  // Combined: auto-pulled + user custom focus items (deduplicated)
  const focusTaskIds = new Set(focusItems.filter(f => f.task_id).map(f => f.task_id));
  const autoNotDuped = autoPulled.filter(t => !focusTaskIds.has(t.id));

  useEffect(() => {
    if (addMode && inputRef.current) inputRef.current.focus();
  }, [addMode]);

  // Search tasks for "select existing" mode
  useEffect(() => {
    if (addMode !== "task" || !searchTerm.trim()) { setSearchResults([]); return; }
    const term = searchTerm.toLowerCase();
    const results = tasks.filter(t =>
      t.status !== "done" && t.status !== "cancelled" && !t.parent_task_id &&
      t.title?.toLowerCase().includes(term) &&
      !focusTaskIds.has(t.id) &&
      !autoPulled.some(ap => ap.id === t.id)
    ).slice(0, 8);
    setSearchResults(results);
  }, [searchTerm, addMode]);

  const addCustomItem = async () => {
    if (!customTitle.trim() || !profile?.org_id) return;
    const { data, error } = await supabase.from("dashboard_focus_items").insert({
      org_id: profile.org_id, user_id: profile.id, title: customTitle.trim(),
      focus_date: todayStr, sort_order: focusItems.length,
    }).select().single();
    if (!error && data) setFocusItems(prev => [...prev, data]);
    setCustomTitle(""); setAddMode(null);
  };

  const addTaskItem = async (task) => {
    if (!profile?.org_id) return;
    const proj = projects.find(p => p.id === task.project_id);
    const { data, error } = await supabase.from("dashboard_focus_items").insert({
      org_id: profile.org_id, user_id: profile.id, title: task.title,
      task_id: task.id, project_id: task.project_id,
      focus_date: todayStr, sort_order: focusItems.length,
    }).select().single();
    if (!error && data) setFocusItems(prev => [...prev, data]);
    setSearchTerm(""); setSearchResults([]); setAddMode(null);
  };

  const toggleComplete = async (item) => {
    const next = !item.is_completed;
    await supabase.from("dashboard_focus_items").update({ is_completed: next }).eq("id", item.id);
    setFocusItems(prev => prev.map(f => f.id === item.id ? { ...f, is_completed: next } : f));
  };

  const removeItem = async (id) => {
    await supabase.from("dashboard_focus_items").delete().eq("id", id);
    setFocusItems(prev => prev.filter(f => f.id !== id));
  };

  const totalItems = autoNotDuped.length + focusItems.length;

  return (
    <div style={{ marginBottom:20, padding: collapsed ? "10px 20px" : "16px 20px", background:T.surface, border:`1px solid ${T.border}`, borderRadius:14, borderLeft:`4px solid ${T.accent}`, transition:"padding 0.15s" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: collapsed ? 0 : 12 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, cursor:"pointer" }} onClick={() => { const next = !collapsed; setCollapsed(next); try { localStorage.setItem("helm-focus-collapsed", next ? "1" : "0"); } catch {} }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ transform: collapsed ? "rotate(-90deg)" : "rotate(0)", transition:"transform 0.15s", flexShrink:0 }}><path d="M3 4.5l3 3 3-3" stroke={T.text3} strokeWidth="1.5" strokeLinecap="round"/></svg>
          <span style={{ fontSize:16 }}>🎯</span>
          <span style={{ fontSize:14, fontWeight:700 }}>Daily Focus</span>
          {totalItems > 0 && <span style={{ fontSize:11, color:T.text3, background:T.surface2, padding:"1px 8px", borderRadius:8 }}>{totalItems} items</span>}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <button onClick={() => setActive("projects")} style={{ background:"none", border:"none", color:T.accent, fontSize:12, cursor:"pointer", fontWeight:500 }}>View all →</button>
        </div>
      </div>

      {!collapsed && <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
        {/* Auto-pulled focus tasks */}
        {autoNotDuped.map(t => {
          const proj = projects.find(p => p.id === t.project_id);
          const priColors = { urgent:"#ef4444", high:"#f97316", medium:"#eab308", low:"#22c55e" };
          const priColor = priColors[t.priority] || T.text3;
          const isDueToday = t.due_date === todayStr;
          const isOverdue = t.due_date && t.due_date < todayStr;
          return (
            <div key={`auto-${t.id}`} onClick={() => setActive("projects", t.id)} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 12px", borderRadius:8, background:T.surface2, cursor:"pointer", borderLeft:`3px solid ${priColor}` }}
              onMouseEnter={e => e.currentTarget.style.background = T.surface3}
              onMouseLeave={e => e.currentTarget.style.background = T.surface2}>
              <div style={{ width:16, height:16, borderRadius:4, border:`2px solid ${T.border2}`, flexShrink:0 }} />
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.title}</div>
                <div style={{ fontSize:10, color:T.text3, marginTop:2, display:"flex", gap:6 }}>
                  {proj && <span style={{ display:"flex", alignItems:"center", gap:3 }}><span style={{ width:5, height:5, borderRadius:3, background:proj.color||T.accent }} />{proj.name}</span>}
                  {isDueToday && <span style={{ color:T.accent, fontWeight:600 }}>Due today</span>}
                  {isOverdue && <span style={{ color:"#ef4444", fontWeight:600 }}>Overdue</span>}
                </div>
              </div>
              <span style={{ fontSize:9, padding:"1px 6px", borderRadius:4, background:priColor+"20", color:priColor, fontWeight:700, flexShrink:0 }}>{t.priority}</span>
            </div>
          );
        })}

        {/* User-added focus items */}
        {focusItems.map(item => {
          const proj = item.project_id ? projects.find(p => p.id === item.project_id) : null;
          const linkedTask = item.task_id ? tasks.find(t => t.id === item.task_id) : null;
          const priColor = linkedTask ? ({ urgent:"#ef4444", high:"#f97316", medium:"#eab308", low:"#22c55e" }[linkedTask.priority] || T.text3) : T.accent;
          return (
            <div key={item.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 12px", borderRadius:8, background:T.surface2, borderLeft:`3px solid ${item.is_completed ? "#22c55e" : priColor}`, opacity: item.is_completed ? 0.6 : 1, transition:"opacity 0.2s" }}>
              <div onClick={(e) => { e.stopPropagation(); toggleComplete(item); }}
                style={{ width:16, height:16, borderRadius:4, border:`2px solid ${item.is_completed ? "#22c55e" : T.border2}`, background: item.is_completed ? "#22c55e" : "transparent", cursor:"pointer", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center", transition:"all 0.15s" }}>
                {item.is_completed && <span style={{ color:"#fff", fontSize:10, lineHeight:1 }}>✓</span>}
              </div>
              <div onClick={() => linkedTask && setActive("projects", linkedTask.id)} style={{ flex:1, minWidth:0, cursor: linkedTask ? "pointer" : "default" }}>
                <div style={{ fontSize:13, fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", textDecoration: item.is_completed ? "line-through" : "none" }}>{item.title}</div>
                <div style={{ fontSize:10, color:T.text3, marginTop:2, display:"flex", gap:6 }}>
                  {proj && <span style={{ display:"flex", alignItems:"center", gap:3 }}><span style={{ width:5, height:5, borderRadius:3, background:proj.color||T.accent }} />{proj.name}</span>}
                  {linkedTask && <span style={{ color:T.text3 }}>Task</span>}
                  {!linkedTask && <span style={{ color:T.accent }}>Custom</span>}
                </div>
              </div>
              <button onClick={() => removeItem(item.id)} style={{ background:"none", border:"none", color:T.text3, cursor:"pointer", fontSize:14, padding:"0 2px", opacity:0.5, transition:"opacity 0.15s" }}
                onMouseEnter={e => e.currentTarget.style.opacity = 1}
                onMouseLeave={e => e.currentTarget.style.opacity = 0.5}>×</button>
            </div>
          );
        })}

        {/* Add Focus Item UI */}
        {addMode === null && (
          <div style={{ display:"flex", gap:6, marginTop:4 }}>
            <button onClick={() => setAddMode("custom")} style={{ display:"flex", alignItems:"center", gap:5, padding:"7px 12px", borderRadius:8, border:`1px dashed ${T.border2}`, background:"transparent", color:T.text3, fontSize:12, cursor:"pointer", transition:"all 0.15s", flex:1 }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.color = T.accent; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = T.border2; e.currentTarget.style.color = T.text3; }}>
              <span style={{ fontSize:14, lineHeight:1 }}>+</span> Write your own
            </button>
            <button onClick={() => setAddMode("task")} style={{ display:"flex", alignItems:"center", gap:5, padding:"7px 12px", borderRadius:8, border:`1px dashed ${T.border2}`, background:"transparent", color:T.text3, fontSize:12, cursor:"pointer", transition:"all 0.15s", flex:1 }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.color = T.accent; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = T.border2; e.currentTarget.style.color = T.text3; }}>
              <span style={{ fontSize:14, lineHeight:1 }}>◫</span> Pick a task
            </button>
          </div>
        )}

        {/* Custom write mode */}
        {addMode === "custom" && (
          <div style={{ display:"flex", gap:6, marginTop:4 }}>
            <input ref={inputRef} value={customTitle} onChange={e => setCustomTitle(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") addCustomItem(); if (e.key === "Escape") { setAddMode(null); setCustomTitle(""); } }}
              placeholder="What do you want to focus on today?"
              style={{ flex:1, padding:"8px 12px", borderRadius:8, border:`1px solid ${T.border}`, background:T.surface2, color:T.text, fontSize:13, outline:"none", fontFamily:"inherit" }} />
            <button onClick={addCustomItem} disabled={!customTitle.trim()} style={{ padding:"8px 14px", borderRadius:8, border:"none", background:T.accent, color:"#fff", fontSize:12, fontWeight:600, cursor:"pointer", opacity:customTitle.trim()?1:0.4 }}>Add</button>
            <button onClick={() => { setAddMode(null); setCustomTitle(""); }} style={{ padding:"8px 10px", borderRadius:8, border:`1px solid ${T.border}`, background:"transparent", color:T.text3, fontSize:12, cursor:"pointer" }}>✕</button>
          </div>
        )}

        {/* Task search mode */}
        {addMode === "task" && (
          <div style={{ marginTop:4, position:"relative" }}>
            <div style={{ display:"flex", gap:6 }}>
              <input ref={inputRef} value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
                onKeyDown={e => { if (e.key === "Escape") { setAddMode(null); setSearchTerm(""); } }}
                placeholder="Search tasks…"
                style={{ flex:1, padding:"8px 12px", borderRadius:8, border:`1px solid ${T.border}`, background:T.surface2, color:T.text, fontSize:13, outline:"none", fontFamily:"inherit" }} />
              <button onClick={() => { setAddMode(null); setSearchTerm(""); }} style={{ padding:"8px 10px", borderRadius:8, border:`1px solid ${T.border}`, background:"transparent", color:T.text3, fontSize:12, cursor:"pointer" }}>✕</button>
            </div>
            {searchResults.length > 0 && (
              <div style={{ marginTop:6, borderRadius:8, border:`1px solid ${T.border}`, background:T.surface, overflow:"hidden", maxHeight:220, overflowY:"auto" }}>
                {searchResults.map(t => {
                  const proj = projects.find(p => p.id === t.project_id);
                  return (
                    <div key={t.id} onClick={() => addTaskItem(t)} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 12px", cursor:"pointer", borderBottom:`1px solid ${T.border}20`, transition:"background 0.1s" }}
                      onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <span style={{ fontSize:12, color:T.text3 }}>☐</span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:12, fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.title}</div>
                        {proj && <div style={{ fontSize:10, color:T.text3 }}>{proj.name}</div>}
                      </div>
                      <span style={{ fontSize:10, color:T.accent, fontWeight:600 }}>+ Add</span>
                    </div>
                  );
                })}
              </div>
            )}
            {searchTerm.trim() && searchResults.length === 0 && (
              <div style={{ marginTop:6, padding:"12px 16px", borderRadius:8, background:T.surface2, fontSize:12, color:T.text3, textAlign:"center" }}>No tasks found for "{searchTerm}"</div>
            )}
          </div>
        )}
      </div>}

      {totalItems === 0 && addMode === null && !collapsed && (
        <div style={{ textAlign:"center", padding:"12px 0", color:T.text3, fontSize:12 }}>
          No focus items yet — add something to keep your day on track
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   TODAY'S CALENDAR SIDEBAR — Collapsible right panel
   ═══════════════════════════════════════════════════════ */
function TodaysCalendar({ profile, collapsed, setCollapsed }) {
  const { isMobile } = useResponsive();
  const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwYmpkbW55a2hldWJ4a3VrbnVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNDI3OTcsImV4cCI6MjA4NzcxODc5N30.pvTTkiZWNDPuo-Fdzm54uy8w1mlx0AjB5jtFm3MeGq4";
  const EDGE_BASE = "https://upbjdmnykheubxkuknuj.supabase.co/functions/v1";

  const [events, setEvents] = useState([]);
  const [calendars, setCalendars] = useState([]);
  const [enabledCals, setEnabledCals] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [showCalPicker, setShowCalPicker] = useState(false);
  const [showConnect, setShowConnect] = useState(false);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [icalUrl, setIcalUrl] = useState("");
  const [icalName, setIcalName] = useState("");
  const [icalError, setIcalError] = useState("");
  const [newEvt, setNewEvt] = useState({ title:"", start:"", end:"", video_link:"", location:"" });
  const [dayOffset, setDayOffset] = useState(0);
  const [timezones, setTimezones] = useState(() => {
    try { return JSON.parse(localStorage.getItem("helm-cal-timezones")||"[]"); } catch { return []; }
  });
  const [showTzAdd, setShowTzAdd] = useState(false);
  const [tzSearch, setTzSearch] = useState("");
  const [tzLabel, setTzLabel] = useState("");
  const [nowTick, setNowTick] = useState(Date.now());
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [eventAttendees, setEventAttendees] = useState([]);
  const [attendeeSearch, setAttendeeSearch] = useState("");
  const [attendeeEmail, setAttendeeEmail] = useState("");
  const [allProfiles, setAllProfiles] = useState([]);
  const [editingEvent, setEditingEvent] = useState(null);
  const calPickerRef = useRef(null);
  const timelineRef = useRef(null);

  useEffect(() => { const iv = setInterval(() => setNowTick(Date.now()), 60000); return () => clearInterval(iv); }, []);

  useEffect(() => {
    if (timelineRef.current && dayOffset === 0 && !selectedEvent) {
      const scrollTo = Math.max(0, (new Date().getHours() - 1) * 56);
      setTimeout(() => timelineRef.current?.scrollTo({ top: scrollTo, behavior: "smooth" }), 300);
    }
  }, [loading, dayOffset, collapsed, selectedEvent]);

  useEffect(() => {
    const fn = (e) => { if (calPickerRef.current && !calPickerRef.current.contains(e.target)) setShowCalPicker(false); };
    document.addEventListener("mousedown", fn); return () => document.removeEventListener("mousedown", fn);
  }, []);

  // Load profiles for attendee search
  useEffect(() => {
    supabase.from("profiles").select("id,display_name,email,avatar_url").then(({ data }) => setAllProfiles(data || []));
  }, []);

  // Server-side iCal sync
  const syncIcalFeeds = async (cals) => {
    const icalCals = (cals || calendars).filter(c => c.calendar_type === "ical" && c.external_calendar_id);
    if (!icalCals.length) return;
    setSyncing(true); setSyncError("");
    for (const cal of icalCals) {
      try {
        const res = await fetch(`${EDGE_BASE}/ical-proxy?mode=sync&url=${encodeURIComponent(cal.external_calendar_id)}&calendar_id=${cal.id}&org_id=${profile?.org_id}&user_id=${profile?.id}`, {
          headers: { "Authorization": `Bearer ${ANON_KEY}` }
        });
        const json = await res.json();
        if (!res.ok) setSyncError(json.error || `Sync failed for ${cal.name}`);
      } catch (err) { setSyncError(`Network error syncing ${cal.name}`); }
    }
    setSyncing(false);
    // Reload events from DB after sync
    const viewDate = new Date(); viewDate.setDate(viewDate.getDate() + dayOffset);
    const dayStart = new Date(viewDate); dayStart.setHours(0,0,0,0);
    const dayEnd = new Date(viewDate); dayEnd.setHours(23,59,59,999);
    const { data: evts } = await supabase.from("calendar_events").select("*").gte("start_at", dayStart.toISOString()).lte("start_at", dayEnd.toISOString()).is("deleted_at", null).order("start_at");
    setEvents(evts || []);
  };

  const loadEvents = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    const viewDate = new Date(); viewDate.setDate(viewDate.getDate() + dayOffset);
    const dayStart = new Date(viewDate); dayStart.setHours(0,0,0,0);
    const dayEnd = new Date(viewDate); dayEnd.setHours(23,59,59,999);
    const [{ data: cals }, { data: evts }] = await Promise.all([
      supabase.from("calendars").select("*").eq("owner_id", profile.id).is("deleted_at", null).order("name"),
      supabase.from("calendar_events").select("*").gte("start_at", dayStart.toISOString()).lte("start_at", dayEnd.toISOString()).is("deleted_at", null).order("start_at"),
    ]);
    setCalendars(cals || []); setEvents(evts || []);
    const saved = localStorage.getItem("helm-enabled-cals");
    if (saved) { try { setEnabledCals(new Set(JSON.parse(saved))); } catch { setEnabledCals(new Set((cals||[]).map(c=>c.id))); } }
    else setEnabledCals(new Set((cals||[]).map(c=>c.id)));
    setLoading(false);
    syncIcalFeeds(cals);
  }, [profile?.id, dayOffset]);

  useEffect(() => { loadEvents(); }, [loadEvents]);

  const toggleCalendar = (calId) => {
    setEnabledCals(prev => { const next = new Set(prev); if (next.has(calId)) next.delete(calId); else next.add(calId); localStorage.setItem("helm-enabled-cals", JSON.stringify([...next])); return next; });
  };

  const allEvents = events.filter(e => !e.calendar_id || enabledCals.has(e.calendar_id)).sort((a,b) => new Date(a.start_at) - new Date(b.start_at));

  const addIcalFeed = async () => {
    if (!icalUrl.trim() || !profile?.org_id) return;
    setIcalError("");
    try { new URL(icalUrl.trim()); } catch { setIcalError("Invalid URL"); return; }
    const { data, error } = await supabase.from("calendars").insert({
      org_id: profile.org_id, owner_id: profile.id, name: icalName.trim() || "External Calendar",
      calendar_type: "ical", external_provider: "ical", external_calendar_id: icalUrl.trim(), sync_enabled: true,
      color: ["#3b82f6","#a855f7","#22c55e","#f97316","#ec4899","#06b6d4"][calendars.length % 6],
    }).select().single();
    if (error) { setIcalError(error.message); return; }
    if (data) { setCalendars(prev => [...prev, data]); setEnabledCals(prev => new Set([...prev, data.id])); syncIcalFeeds([...calendars, data]); }
    setIcalUrl(""); setIcalName(""); setShowConnect(false);
  };

  const removeCalendar = async (calId) => {
    await supabase.from("calendars").update({ deleted_at: new Date().toISOString() }).eq("id", calId);
    setCalendars(prev => prev.filter(c => c.id !== calId));
  };

  const addManualEvent = async () => {
    if (!newEvt.title.trim() || !newEvt.start || !profile?.org_id) return;
    const { data } = await supabase.from("calendar_events").insert({
      org_id: profile.org_id, organizer_id: profile.id, title: newEvt.title.trim(),
      start_at: new Date(newEvt.start).toISOString(), end_at: newEvt.end ? new Date(newEvt.end).toISOString() : null,
      video_link: newEvt.video_link || null, has_video_call: !!newEvt.video_link, location: newEvt.location || null, status: "confirmed",
    }).select().single();
    if (data) setEvents(prev => [...prev, data].sort((a,b) => new Date(a.start_at) - new Date(b.start_at)));
    setNewEvt({ title:"", start:"", end:"", video_link:"", location:"" }); setShowAddEvent(false);
  };

  // Event detail: load attendees
  const openEventDetail = async (evt) => {
    setSelectedEvent(evt);
    setEditingEvent({ title: evt.title, description: evt.description||"", location: evt.location||"", video_link: evt.video_link||"",
      start_at: evt.start_at ? new Date(evt.start_at).toISOString().slice(0,16) : "", end_at: evt.end_at ? new Date(evt.end_at).toISOString().slice(0,16) : "" });
    const { data } = await supabase.from("event_attendees").select("*").eq("event_id", evt.id);
    setEventAttendees(data || []);
  };

  const saveEventChanges = async () => {
    if (!selectedEvent || !editingEvent) return;
    const updates = {
      title: editingEvent.title, description: editingEvent.description || null,
      location: editingEvent.location || null, video_link: editingEvent.video_link || null,
      has_video_call: !!editingEvent.video_link,
      start_at: editingEvent.start_at ? new Date(editingEvent.start_at).toISOString() : selectedEvent.start_at,
      end_at: editingEvent.end_at ? new Date(editingEvent.end_at).toISOString() : null,
    };
    await supabase.from("calendar_events").update(updates).eq("id", selectedEvent.id);
    setEvents(prev => prev.map(e => e.id === selectedEvent.id ? { ...e, ...updates } : e));
    setSelectedEvent(prev => ({ ...prev, ...updates }));
  };

  const addAttendee = async (email, name, userId) => {
    if (!selectedEvent || !email) return;
    const { data } = await supabase.from("event_attendees").insert({
      event_id: selectedEvent.id, email, display_name: name || email.split("@")[0],
      user_id: userId || null, rsvp_status: "pending", attendee_role: "attendee",
    }).select().single();
    if (data) setEventAttendees(prev => [...prev, data]);
    setAttendeeSearch(""); setAttendeeEmail("");
    // Trigger invite via edge function
    fetch(`${EDGE_BASE}/send-invite`, {
      method: "POST", headers: { "Authorization": `Bearer ${ANON_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ event_id: selectedEvent.id, attendees: [{ email, name, user_id: userId }] }),
    }).catch(() => {});
  };

  const removeAttendee = async (attId) => {
    await supabase.from("event_attendees").delete().eq("id", attId);
    setEventAttendees(prev => prev.filter(a => a.id !== attId));
  };

  const deleteEvent = async (id) => {
    await supabase.from("calendar_events").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    setEvents(prev => prev.filter(e => e.id !== id));
    setSelectedEvent(null);
  };

  const saveTz = (tz) => { const next = [...timezones, tz]; setTimezones(next); localStorage.setItem("helm-cal-timezones", JSON.stringify(next)); };
  const removeTz = (idx) => { const next = timezones.filter((_,i)=>i!==idx); setTimezones(next); localStorage.setItem("helm-cal-timezones", JSON.stringify(next)); };

  const TZ_LIST = ["America/New_York","America/Chicago","America/Denver","America/Los_Angeles","America/Anchorage","Pacific/Honolulu","America/Toronto","America/Sao_Paulo","Europe/London","Europe/Paris","Europe/Berlin","Europe/Moscow","Asia/Dubai","Asia/Kolkata","Asia/Shanghai","Asia/Tokyo","Asia/Seoul","Asia/Singapore","Australia/Sydney","Pacific/Auckland","Africa/Cairo","Africa/Johannesburg"];
  const filteredTzList = tzSearch.trim() ? TZ_LIST.filter(tz => tz.toLowerCase().includes(tzSearch.toLowerCase())) : TZ_LIST;
  const fmtHourInTz = (hour, tz) => { try { const d = new Date(); d.setDate(d.getDate() + dayOffset); d.setHours(hour,0,0,0); return d.toLocaleTimeString("en-US",{hour:"numeric",hour12:true,timeZone:tz}); } catch { return ""; } };
  const getTzAbbr = (tz) => { try { return new Intl.DateTimeFormat("en-US",{timeZone:tz,timeZoneName:"short"}).formatToParts(new Date()).find(p=>p.type==="timeZoneName")?.value||tz.split("/").pop(); } catch { return tz.split("/").pop(); } };

  const HOUR_H = 56;
  const viewDate = new Date(); viewDate.setDate(viewDate.getDate() + dayOffset);
  const isToday = dayOffset === 0;
  const nowFrac = new Date(nowTick).getHours() + new Date(nowTick).getMinutes() / 60;
  const dateLabel = viewDate.toLocaleDateString("en-US", { weekday:"short", month:"short", day:"numeric" });
  const positionedEvents = allEvents.filter(e=>!e.all_day).map(e => {
    const s = new Date(e.start_at), en = e.end_at ? new Date(e.end_at) : new Date(s.getTime()+3600000);
    return { ...e, startH: s.getHours()+s.getMinutes()/60, durH: Math.max(0.5,(en-s)/3600000) };
  });
  const allDayEvents = allEvents.filter(e => e.all_day);

  // Profile search for attendees
  const matchedProfiles = attendeeSearch.trim() ? allProfiles.filter(p =>
    (p.display_name||"").toLowerCase().includes(attendeeSearch.toLowerCase()) ||
    (p.email||"").toLowerCase().includes(attendeeSearch.toLowerCase())
  ).filter(p => !eventAttendees.some(a => a.user_id === p.id || a.email === p.email)).slice(0,5) : [];

  const _inp = { padding:"6px 8px", borderRadius:5, border:`1px solid ${T.border}`, background:T.surface2, color:T.text, fontSize:11, outline:"none", fontFamily:"inherit", width:"100%", boxSizing:"border-box" };
  const _lbl = { fontSize:10, fontWeight:600, color:T.text3, display:"block", marginBottom:3 };

  if (collapsed) {
    return (
      <div onClick={() => setCollapsed(false)} style={{ width:36, flexShrink:0, background:T.surface, borderLeft:`1px solid ${T.border}`, display:"flex", flexDirection:"column", alignItems:"center", paddingTop:16, cursor:"pointer" }}
        onMouseEnter={e=>e.currentTarget.style.background=T.surface2} onMouseLeave={e=>e.currentTarget.style.background=T.surface}>
        <span style={{ fontSize:16, marginBottom:6 }}>📅</span>
        <span style={{ writingMode:"vertical-rl", fontSize:11, fontWeight:600, color:T.text3 }}>Calendar</span>
        {allEvents.length > 0 && <div style={{ width:18, height:18, borderRadius:9, background:T.accent, color:"#fff", fontSize:9, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center", marginTop:8 }}>{allEvents.length}</div>}
      </div>
    );
  }

  // ── EVENT DETAIL PANEL ──
  if (selectedEvent) {
    const evt = selectedEvent;
    const cal = evt.calendar_id ? calendars.find(c=>c.id===evt.calendar_id) : null;
    const evtColor = evt.color || cal?.color || T.accent;
    const isOwner = evt.organizer_id === profile?.id || !evt.organizer_id;
    return (
      <div style={{ width:320, flexShrink:0, background:T.surface, borderLeft:`1px solid ${T.border}`, display:"flex", flexDirection:"column", overflow:"hidden" }}>
        {/* Header */}
        <div style={{ padding:"12px 14px", borderBottom:`1px solid ${T.border}`, display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
          <button onClick={() => setSelectedEvent(null)} style={{ background:"none", border:"none", color:T.text3, cursor:"pointer", fontSize:16, padding:0 }}>←</button>
          <span style={{ fontSize:12, fontWeight:700, flex:1, textAlign:"center" }}>Event Details</span>
          <div style={{ display:"flex", gap:4 }}>
            {isOwner && <button onClick={() => deleteEvent(evt.id)} style={{ background:"none", border:"none", color:"#ef4444", cursor:"pointer", fontSize:11, fontWeight:600 }}>Delete</button>}
            <button onClick={() => setCollapsed(true)} style={{ background:"none", border:"none", color:T.text3, cursor:"pointer", fontSize:13 }}>»</button>
          </div>
        </div>

        <div style={{ flex:1, overflowY:"auto", padding:"14px" }}>
          {/* Color + Title */}
          <div style={{ borderLeft:`4px solid ${evtColor}`, paddingLeft:12, marginBottom:16 }}>
            {isOwner ? (
              <input value={editingEvent?.title||""} onChange={e => setEditingEvent(p=>({...p,title:e.target.value}))} onBlur={saveEventChanges}
                style={{ fontSize:16, fontWeight:700, color:T.text, background:"transparent", border:"none", outline:"none", width:"100%", fontFamily:"inherit", padding:0 }} />
            ) : (
              <div style={{ fontSize:16, fontWeight:700, color:T.text }}>{evt.title}</div>
            )}
            {cal && <div style={{ fontSize:10, color:T.text3, marginTop:3 }}>{cal.name}</div>}
          </div>

          {/* Date/Time */}
          <div style={{ marginBottom:14 }}>
            <label style={_lbl}>When</label>
            {isOwner ? (
              <div style={{ display:"flex", gap:4 }}>
                <input type="datetime-local" value={editingEvent?.start_at||""} onChange={e => setEditingEvent(p=>({...p,start_at:e.target.value}))} onBlur={saveEventChanges} style={{..._inp, flex:1}} />
                <input type="datetime-local" value={editingEvent?.end_at||""} onChange={e => setEditingEvent(p=>({...p,end_at:e.target.value}))} onBlur={saveEventChanges} style={{..._inp, flex:1}} />
              </div>
            ) : (
              <div style={{ fontSize:12, color:T.text }}>
                {new Date(evt.start_at).toLocaleString("en-US", { weekday:"short", month:"short", day:"numeric", hour:"numeric", minute:"2-digit" })}
                {evt.end_at && ` – ${new Date(evt.end_at).toLocaleTimeString("en-US", { hour:"numeric", minute:"2-digit" })}`}
              </div>
            )}
          </div>

          {/* Location */}
          <div style={{ marginBottom:14 }}>
            <label style={_lbl}>Location</label>
            {isOwner ? (
              <input value={editingEvent?.location||""} onChange={e => setEditingEvent(p=>({...p,location:e.target.value}))} onBlur={saveEventChanges} placeholder="Add location" style={_inp} />
            ) : evt.location ? (
              <div style={{ fontSize:12, color:T.text }}>📍 {evt.location}</div>
            ) : <div style={{ fontSize:11, color:T.text3 }}>No location</div>}
          </div>

          {/* Video link */}
          <div style={{ marginBottom:14 }}>
            <label style={_lbl}>Video Call</label>
            {isOwner ? (
              <input value={editingEvent?.video_link||""} onChange={e => setEditingEvent(p=>({...p,video_link:e.target.value}))} onBlur={saveEventChanges} placeholder="Zoom/Meet/Teams link" style={_inp} />
            ) : null}
            {(evt.video_link || editingEvent?.video_link) && (
              <button onClick={() => window.open(editingEvent?.video_link || evt.video_link, "_blank")}
                style={{ marginTop:6, display:"flex", alignItems:"center", gap:5, padding:"6px 12px", borderRadius:6, border:`1px solid ${evtColor}40`, background:`${evtColor}10`, color:evtColor, fontSize:11, fontWeight:600, cursor:"pointer", width:"100%" }}>
                📹 Join Meeting
              </button>
            )}
          </div>

          {/* Description */}
          <div style={{ marginBottom:16 }}>
            <label style={_lbl}>Notes</label>
            {isOwner ? (
              <textarea value={editingEvent?.description||""} onChange={e => setEditingEvent(p=>({...p,description:e.target.value}))} onBlur={saveEventChanges} placeholder="Add notes…" rows={3}
                style={{..._inp, resize:"vertical", minHeight:50}} />
            ) : evt.description ? (
              <div style={{ fontSize:12, color:T.text2, whiteSpace:"pre-wrap", lineHeight:1.5 }}>{evt.description}</div>
            ) : <div style={{ fontSize:11, color:T.text3 }}>No notes</div>}
          </div>

          {/* ── ATTENDEES ── */}
          <div>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:8 }}>
              <label style={{..._lbl, marginBottom:0}}>Attendees ({eventAttendees.length})</label>
            </div>

            {/* Existing attendees */}
            {eventAttendees.map(att => (
              <div key={att.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"6px 0", borderBottom:`1px solid ${T.border}15` }}>
                <div style={{ width:24, height:24, borderRadius:12, background:`${T.accent}20`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:700, color:T.accent, flexShrink:0 }}>
                  {(att.display_name||att.email||"?").slice(0,2).toUpperCase()}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:11, fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{att.display_name || att.email}</div>
                  {att.email && <div style={{ fontSize:9, color:T.text3 }}>{att.email}</div>}
                </div>
                <span style={{ fontSize:9, padding:"1px 5px", borderRadius:3,
                  background: att.rsvp_status === "accepted" ? "#22c55e20" : att.rsvp_status === "declined" ? "#ef444420" : `${T.accent}15`,
                  color: att.rsvp_status === "accepted" ? "#22c55e" : att.rsvp_status === "declined" ? "#ef4444" : T.text3,
                  fontWeight:600 }}>{(att.rsvp_status||"pending")}</span>
                {isOwner && <button onClick={() => removeAttendee(att.id)} style={{ background:"none", border:"none", color:T.text3, cursor:"pointer", fontSize:10, opacity:0.4 }}
                  onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=0.4}>×</button>}
              </div>
            ))}

            {/* Add attendee */}
            {isOwner && (
              <div style={{ marginTop:8 }}>
                <div style={{ position:"relative" }}>
                  <input value={attendeeSearch} onChange={e => { setAttendeeSearch(e.target.value); setAttendeeEmail(e.target.value); }}
                    onKeyDown={e => { if (e.key === "Enter" && attendeeEmail.includes("@")) { addAttendee(attendeeEmail, "", null); } }}
                    placeholder="Search users or type email…" style={_inp} />
                  {matchedProfiles.length > 0 && (
                    <div style={{ position:"absolute", top:"100%", left:0, right:0, background:T.surface, border:`1px solid ${T.border}`, borderRadius:6, boxShadow:"0 8px 24px #00000040", zIndex:50, maxHeight:150, overflowY:"auto", marginTop:2 }}>
                      {matchedProfiles.map(p => (
                        <div key={p.id} onClick={() => addAttendee(p.email, p.display_name, p.id)}
                          style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 10px", cursor:"pointer", fontSize:11 }}
                          onMouseEnter={e=>e.currentTarget.style.background=T.surface2} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                          <div style={{ width:22, height:22, borderRadius:11, background:`${T.accent}20`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:8, fontWeight:700, color:T.accent }}>
                            {(p.display_name||p.email||"?").slice(0,2).toUpperCase()}
                          </div>
                          <div style={{ flex:1 }}>
                            <div style={{ fontWeight:500 }}>{p.display_name}</div>
                            <div style={{ fontSize:9, color:T.text3 }}>{p.email}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                {attendeeEmail.includes("@") && matchedProfiles.length === 0 && attendeeSearch.trim() && (
                  <button onClick={() => addAttendee(attendeeEmail, "", null)}
                    style={{ marginTop:4, width:"100%", padding:"5px 0", borderRadius:5, border:`1px dashed ${T.border2}`, background:"transparent", color:T.accent, fontSize:10, fontWeight:600, cursor:"pointer" }}>
                    Invite {attendeeEmail}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── MAIN CALENDAR VIEW ──
  return (
    <div style={{ width:320, flexShrink:0, background:T.surface, borderLeft:`1px solid ${T.border}`, display:"flex", flexDirection:"column", overflow:"hidden" }}>
      {/* Header */}
      <div style={{ padding:"10px 14px", borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: timezones.length > 0 || !isToday ? 6 : 0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:6 }}>
            <button onClick={() => setDayOffset(d=>d-1)} style={{ width:24, height:24, borderRadius:5, border:`1px solid ${T.border}`, background:"transparent", cursor:"pointer", color:T.text3, fontSize:12, display:"flex", alignItems:"center", justifyContent:"center" }}>‹</button>
            <button onClick={() => setDayOffset(0)} style={{ padding:"2px 8px", borderRadius:5, border:isToday?`1px solid ${T.accent}40`:`1px solid ${T.border}`, background:isToday?`${T.accent}10`:"transparent", color:isToday?T.accent:T.text, fontSize:12, fontWeight:600, cursor:"pointer" }}>
              {isToday ? "Today" : dateLabel}
            </button>
            <button onClick={() => setDayOffset(d=>d+1)} style={{ width:24, height:24, borderRadius:5, border:`1px solid ${T.border}`, background:"transparent", cursor:"pointer", color:T.text3, fontSize:12, display:"flex", alignItems:"center", justifyContent:"center" }}>›</button>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:4 }}>
            <div style={{ position:"relative" }} ref={calPickerRef}>
              <button onClick={() => setShowCalPicker(!showCalPicker)} style={{ width:26, height:26, borderRadius:5, border:`1px solid ${T.border}`, background:"transparent", cursor:"pointer", fontSize:12, color:T.text3, display:"flex", alignItems:"center", justifyContent:"center" }}>⚙</button>
              {showCalPicker && (
                <div style={{ position:"absolute", top:"calc(100% + 6px)", right:0, width:250, background:T.surface, border:`1px solid ${T.border}`, borderRadius:10, boxShadow:"0 12px 40px #00000050", zIndex:100 }}>
                  <div style={{ padding:"8px 12px", borderBottom:`1px solid ${T.border}`, fontSize:11, fontWeight:700 }}>Calendars</div>
                  <div style={{ maxHeight:160, overflowY:"auto" }}>
                    {calendars.map(cal => (
                      <div key={cal.id} style={{ padding:"6px 12px", borderBottom:`1px solid ${T.border}10` }} onMouseEnter={e=>e.currentTarget.style.background=T.surface2} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <div onClick={() => toggleCalendar(cal.id)} style={{ width:14, height:14, borderRadius:3, border:`2px solid ${cal.color||T.accent}`, background:enabledCals.has(cal.id)?(cal.color||T.accent):"transparent", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
                            {enabledCals.has(cal.id) && <span style={{ color:"#fff", fontSize:8 }}>✓</span>}
                          </div>
                          <span onClick={() => toggleCalendar(cal.id)} style={{ flex:1, fontSize:10, cursor:"pointer", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{cal.name}</span>
                          {cal.calendar_type === "ical" && (
                            <button onClick={() => { const url = prompt("iCal URL:", cal.external_calendar_id || ""); if (url && url !== cal.external_calendar_id) { supabase.from("calendars").update({ external_calendar_id: url }).eq("id", cal.id).then(() => { setCalendars(prev => prev.map(c => c.id === cal.id ? {...c, external_calendar_id: url} : c)); syncIcalFeeds([{...cal, external_calendar_id: url}]); }); }}} style={{ background:"none", border:"none", color:T.text3, cursor:"pointer", fontSize:9, opacity:0.4 }} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=0.4} title="Edit iCal URL">✎</button>
                          )}
                          <button onClick={() => removeCalendar(cal.id)} style={{ background:"none", border:"none", color:T.text3, cursor:"pointer", fontSize:10, opacity:0.3 }} onMouseEnter={e=>e.currentTarget.style.opacity=1} onMouseLeave={e=>e.currentTarget.style.opacity=0.3}>×</button>
                        </div>
                        {cal.calendar_type === "ical" && (
                          <div style={{ fontSize:8, color:T.text3, marginTop:2, marginLeft:22 }}>
                            {cal.last_synced_at ? `Synced ${new Date(cal.last_synced_at).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"})}` : "Not synced yet"}
                            {!cal.last_synced_at && <span style={{ color:"#f97316", marginLeft:4 }}>— check URL?</span>}
                          </div>
                        )}
                      </div>
                    ))}
                    {calendars.length === 0 && <div style={{ padding:"12px", fontSize:10, color:T.text3, textAlign:"center" }}>No calendars</div>}
                  </div>
                  <div style={{ padding:"8px 12px", borderTop:`1px solid ${T.border}` }}>
                    <button onClick={() => setShowConnect(!showConnect)} style={{ width:"100%", padding:"5px 0", borderRadius:5, border:`1px dashed ${T.border2}`, background:"transparent", color:T.accent, fontSize:10, fontWeight:600, cursor:"pointer" }}>+ Connect calendar</button>
                    {showConnect && (
                      <div style={{ marginTop:6, display:"flex", flexDirection:"column", gap:4 }}>
                        <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:4 }}>
                          {[{p:"google",l:"Google",c:"#4285f4"},{p:"outlook",l:"Outlook",c:"#0078d4"}].map(p => (
                            <button key={p.p} onClick={() => alert(`${p.l} OAuth coming soon`)} style={{ padding:"5px 6px", borderRadius:4, border:`1px solid ${T.border}`, background:T.surface2, cursor:"pointer", color:T.text, fontSize:9, fontWeight:600 }}>{p.l}</button>
                          ))}
                        </div>
                        <input value={icalName} onChange={e => setIcalName(e.target.value)} placeholder="Name" style={{..._inp, fontSize:10}} />
                        <input value={icalUrl} onChange={e => { setIcalUrl(e.target.value); setIcalError(""); }} placeholder="iCal URL" style={{..._inp, fontSize:10, borderColor:icalError?"#ef4444":T.border}} />
                        {icalError && <div style={{ fontSize:9, color:"#ef4444" }}>{icalError}</div>}
                        <button onClick={addIcalFeed} disabled={!icalUrl.trim()} style={{ padding:"5px 0", borderRadius:5, border:"none", background:T.accent, color:"#fff", fontSize:10, fontWeight:600, cursor:"pointer", opacity:icalUrl.trim()?1:0.4 }}>Add</button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <button onClick={() => setCollapsed(true)} style={{ width:26, height:26, borderRadius:5, border:`1px solid ${T.border}`, background:"transparent", cursor:"pointer", fontSize:13, color:T.text3, display:"flex", alignItems:"center", justifyContent:"center" }}>»</button>
          </div>
        </div>
        {!isToday && <div style={{ fontSize:10, color:T.text3, textAlign:"center" }}>{viewDate.toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}</div>}
        {timezones.length > 0 && (
          <div style={{ display:"flex", gap:3, marginTop:4, flexWrap:"wrap" }}>
            {timezones.map((tz,i) => (
              <span key={i} style={{ display:"inline-flex", alignItems:"center", gap:2, padding:"1px 5px", borderRadius:3, background:T.surface2, fontSize:8, color:T.text2, border:`1px solid ${T.border}` }}>
                {tz.label||getTzAbbr(tz.zone)} <button onClick={()=>removeTz(i)} style={{ background:"none", border:"none", color:T.text3, cursor:"pointer", fontSize:8, padding:0 }}>×</button>
              </span>
            ))}
          </div>
        )}
        {syncError && <div style={{ fontSize:9, color:"#ef4444", marginTop:4, padding:"3px 6px", borderRadius:4, background:"#ef444410" }}>{syncError}</div>}
      </div>

      {/* All-day */}
      {allDayEvents.length > 0 && (
        <div style={{ padding:"4px 14px", borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
          {allDayEvents.map(e => {
            const c = e.color || T.accent;
            return <div key={e.id} onClick={() => openEventDetail(e)} style={{ padding:"3px 8px", borderRadius:4, background:`${c}15`, borderLeft:`3px solid ${c}`, fontSize:10, fontWeight:500, marginBottom:2, cursor:"pointer" }}>{e.title}</div>;
          })}
        </div>
      )}

      {/* Timeline */}
      <div ref={timelineRef} style={{ flex:1, overflowY:"auto", position:"relative" }}>
        {loading ? <div style={{ textAlign:"center", padding:"24px 0", color:T.text3, fontSize:12 }}>Loading…</div> : (
          <div style={{ position:"relative", height:24*HOUR_H }}>
            {Array.from({length:24},(_,h) => (
              <div key={h} style={{ position:"absolute", top:h*HOUR_H, left:0, right:0, height:HOUR_H, borderBottom:`1px solid ${T.border}12`, display:"flex" }}>
                <div style={{ width:timezones.length>0?44:52, flexShrink:0, textAlign:"right", paddingRight:5, paddingTop:2, fontSize:10, color:T.text3 }}>
                  {h===0?"12 AM":h<12?`${h} AM`:h===12?"12 PM":`${h-12} PM`}
                </div>
                {timezones.map((tz,i) => (
                  <div key={i} style={{ width:38, flexShrink:0, textAlign:"right", paddingRight:3, paddingTop:2, fontSize:9, color:T.text3, opacity:0.6 }}>{fmtHourInTz(h,tz.zone)}</div>
                ))}
              </div>
            ))}
            {isToday && (
              <div style={{ position:"absolute", top:nowFrac*HOUR_H, left:0, right:0, zIndex:10, pointerEvents:"none", display:"flex", alignItems:"center" }}>
                <div style={{ width:(timezones.length>0?44:52)+timezones.length*38-4, display:"flex", justifyContent:"flex-end" }}><div style={{ width:8, height:8, borderRadius:4, background:"#ef4444" }} /></div>
                <div style={{ flex:1, height:2, background:"#ef4444" }} />
              </div>
            )}
            {positionedEvents.map(evt => {
              const cal = evt.calendar_id ? calendars.find(c=>c.id===evt.calendar_id) : null;
              const c = evt.color || cal?.color || T.accent;
              const leftOff = (timezones.length>0?44:52)+timezones.length*38+4;
              const hasVideo = evt.has_video_call || evt.video_link;
              const isNow = isToday && new Date(evt.start_at).getTime() <= nowTick && evt.end_at && new Date(evt.end_at).getTime() > nowTick;
              return (
                <div key={evt.id} onClick={() => openEventDetail(evt)} style={{
                  position:"absolute", top:evt.startH*HOUR_H+1, left:leftOff, right:8,
                  height:Math.max(24, evt.durH*HOUR_H-2), borderRadius:6,
                  background:`${c}18`, borderLeft:`3px solid ${c}`, padding:"3px 8px", cursor:"pointer",
                  border:isNow?`1px solid ${c}50`:"none", zIndex:5,
                }} onMouseEnter={e=>e.currentTarget.style.background=`${c}28`} onMouseLeave={e=>e.currentTarget.style.background=`${c}18`}>
                  <div style={{ fontSize:11, fontWeight:600, color:T.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{evt.title}</div>
                  <div style={{ fontSize:9, color:T.text3 }}>{new Date(evt.start_at).toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit",hour12:true})}</div>
                  {hasVideo && evt.durH >= 1 && <div style={{ fontSize:8, color:c, marginTop:1, fontWeight:600 }}>📹 Video</div>}
                </div>
              );
            })}
            {syncing && <div style={{ position:"absolute", top:4, right:8, fontSize:9, color:T.accent, zIndex:20 }}>⟳ Syncing…</div>}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ padding:"7px 14px", borderTop:`1px solid ${T.border}`, display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
        <div style={{ display:"flex", gap:6 }}>
          <button onClick={() => setShowTzAdd(!showTzAdd)} style={{ background:"none", border:"none", color:T.accent, fontSize:9, cursor:"pointer", fontWeight:600 }}>+ TZ</button>
          <button onClick={() => setShowAddEvent(!showAddEvent)} style={{ background:"none", border:"none", color:T.accent, fontSize:9, cursor:"pointer", fontWeight:600 }}>+ Event</button>
        </div>
        <span style={{ fontSize:9, color:T.text3 }}>{allEvents.length} event{allEvents.length!==1?"s":""}</span>
      </div>

      {showTzAdd && (
        <div style={{ padding:"8px 14px", borderTop:`1px solid ${T.border}`, background:T.surface2, flexShrink:0 }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}><span style={{ fontSize:10, fontWeight:700 }}>Add Timezone</span><button onClick={()=>{setShowTzAdd(false);setTzSearch("");setTzLabel("");}} style={{ background:"none", border:"none", color:T.text3, cursor:"pointer", fontSize:12 }}>×</button></div>
          <input value={tzLabel} onChange={e=>setTzLabel(e.target.value)} placeholder="Label (optional)" style={{..._inp, fontSize:10, marginBottom:3}} />
          <input value={tzSearch} onChange={e=>setTzSearch(e.target.value)} placeholder="Search…" style={{..._inp, fontSize:10}} />
          <div style={{ maxHeight:100, overflowY:"auto", marginTop:3 }}>
            {filteredTzList.map(tz => (
              <div key={tz} onClick={()=>{saveTz({zone:tz,label:tzLabel.trim()||""});setShowTzAdd(false);setTzSearch("");setTzLabel("");}} style={{ padding:"4px 6px", fontSize:9, cursor:"pointer", borderRadius:3, display:"flex", justifyContent:"space-between" }}
                onMouseEnter={e=>e.currentTarget.style.background=T.surface3} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                <span>{tz.replace(/_/g," ")}</span><span style={{ color:T.text3 }}>{getTzAbbr(tz)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {showAddEvent && (
        <div style={{ padding:"8px 14px", borderTop:`1px solid ${T.border}`, background:T.surface2, flexShrink:0 }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}><span style={{ fontSize:10, fontWeight:700 }}>New Event</span><button onClick={()=>setShowAddEvent(false)} style={{ background:"none", border:"none", color:T.text3, cursor:"pointer", fontSize:12 }}>×</button></div>
          <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
            <input value={newEvt.title} onChange={e=>setNewEvt(p=>({...p,title:e.target.value}))} placeholder="Title" style={{..._inp, fontSize:10}} />
            <div style={{ display:"flex", gap:3 }}>
              <input type="datetime-local" value={newEvt.start} onChange={e=>setNewEvt(p=>({...p,start:e.target.value}))} style={{..._inp, flex:1, fontSize:9}} />
              <input type="datetime-local" value={newEvt.end} onChange={e=>setNewEvt(p=>({...p,end:e.target.value}))} style={{..._inp, flex:1, fontSize:9}} />
            </div>
            <input value={newEvt.video_link} onChange={e=>setNewEvt(p=>({...p,video_link:e.target.value}))} placeholder="Video link" style={{..._inp, fontSize:10}} />
            <button onClick={addManualEvent} disabled={!newEvt.title.trim()||!newEvt.start} style={{ padding:"5px 0", borderRadius:5, border:"none", background:T.accent, color:"#fff", fontSize:10, fontWeight:600, cursor:"pointer", opacity:newEvt.title.trim()&&newEvt.start?1:0.4 }}>Add</button>
          </div>
        </div>
      )}
    </div>
  );
}



/* ═══════════════════════════════════════════════════════
   MAIN DASHBOARD
   ═══════════════════════════════════════════════════════ */
export default function DashboardView({ setActive }) {
  const { profile } = useAuth();
  const { isMobile, isTablet } = useResponsive();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [finMetrics, setFinMetrics] = useState([]);
  const [finMonthly, setFinMonthly] = useState({});
  const [plmPrograms, setPlmPrograms] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [scoreboardData, setScoreboardData] = useState([]);
  const [inbox, setInbox] = useState([]);
  const [checkIns, setCheckIns] = useState([]);
  const [focusItems, setFocusItems] = useState([]);
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTaskForm, setNewTaskForm] = useState({ title: "", project_id: "", section_id: "", priority: "none", due_date: new Date().toISOString().split("T")[0] });
  const [calCollapsed, setCalCollapsed] = useState(() => {
    try { return localStorage.getItem("helm-cal-collapsed") === "true"; } catch { return false; }
  });

  const toggleCalCollapsed = useCallback((v) => {
    setCalCollapsed(v);
    try { localStorage.setItem("helm-cal-collapsed", String(v)); } catch {}
  }, []);

  useEffect(() => {
    (async () => {
      const yr = new Date().getFullYear();
      const todayStr = new Date().toISOString().split("T")[0];
      const [
        { data: projects }, { data: sections }, { data: tasks }, { data: profiles },
        { data: objectives }, { data: keyResults }, { data: cycles },
        { data: approvals }, { data: spendRequests }, { data: fmData }, { data: plm },
        { data: activity }, { data: focus }, { data: scoreboardDaily },
      ] = await Promise.all([
        supabase.from("projects").select("*").is("deleted_at", null).order("name"),
        supabase.from("sections").select("*").order("sort_order"),
        supabase.from("tasks").select("*").is("deleted_at", null),
        supabase.from("profiles").select("id,display_name,avatar_url"),
        supabase.from("objectives").select("*").is("deleted_at", null).order("sort_order"),
        supabase.from("key_results").select("*").is("deleted_at", null),
        supabase.from("okr_cycles").select("*").order("start_date", { ascending: false }),
        supabase.from("approval_requests").select("*").eq("status", "pending").order("created_at", { ascending: false }).limit(5),
        supabase.from("af_requests").select("*").eq("status", "pending").order("created_at", { ascending: false }),
        supabase.from("okr_financial_metrics").select("*").eq("year", yr).order("sort_order"),
        supabase.from("plm_programs").select("*").is("deleted_at", null).order("created_at", { ascending: false }).limit(10),
        supabase.from("activity_log").select("*").order("created_at", { ascending: false }).limit(20),
        supabase.from("dashboard_focus_items").select("*").eq("focus_date", todayStr).order("sort_order"),
        supabase.from("scoreboard_daily").select("date,metric_key,value").in("metric_key", ["revenue", "amazon_revenue", "net_dollars"]).gte("date", `${yr}-01-01`).order("date"),
      ]);

      const profMap = {};
      (profiles || []).forEach(u => { profMap[u.id] = u; });

      const activeCycle = (cycles || []).find(c => c.status === "active") || cycles?.[0];
      const cycleObjs = activeCycle ? (objectives || []).filter(o => o.cycle_id === activeCycle.id) : (objectives || []);
      const cycleKRs = (keyResults || []).filter(k => cycleObjs.some(o => o.id === k.objective_id));

      setData({ projects: projects||[], sections: sections||[], tasks: tasks||[], profiles: profMap,
        objectives: cycleObjs, keyResults: cycleKRs, cycles: cycles||[], activeCycle });
      setPendingApprovals([
        ...(approvals || []),
        ...(spendRequests || []).filter(r => r.require_person_id === profile?.id || r.approval_chain === "high_value").map(r => ({
          id: r.id, entity_name: r.title, entity_type: "Spend Request",
          amount: r.amount, description: `${r.department || "—"} · ${r.gl_code || "—"}`,
          module: "finance", created_at: r.created_at, _type: "spend",
        })),
      ]);
      setPlmPrograms(plm || []);
      setRecentActivity(activity || []);
      setScoreboardData(scoreboardDaily || []);
      setFocusItems(focus || []);

      // Load inbox notifications for current user
      if (profile?.id) {
        const { data: notifs } = await supabase.from("notifications")
          .select("*").eq("user_id", profile.id)
          .order("created_at", { ascending: false }).limit(50);
        setInbox(notifs || []);
      }

      if (cycleKRs.length > 0) {
        const krIds = cycleKRs.map(k => k.id);
        const { data: ciData } = await supabase.from("okr_check_ins")
          .select("key_result_id, check_in_date, created_at")
          .in("key_result_id", krIds)
          .order("created_at", { ascending: false });
        setCheckIns(ciData || []);
      }

      if (fmData?.length) {
        setFinMetrics(fmData);
        const { data: mData } = await supabase.from("okr_financial_monthly")
          .select("*").in("metric_id", fmData.map(m => m.id)).eq("year", yr);
        const mMap = {};
        (mData || []).forEach(r => {
          if (!mMap[r.metric_id]) mMap[r.metric_id] = {};
          mMap[r.metric_id][r.month] = r;
        });
        setFinMonthly(mMap);
      }

      setLoading(false);
    })();
  }, []);

  if (loading) return (
    <div style={{ display:"flex", height:"100%", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:12, color:T.text3 }}>
      <div style={{ width:40, height:40, borderRadius:"50%", border:`3px solid ${T.border}`, borderTopColor:T.accent, animation:"spin 0.8s linear infinite" }} />
      <span style={{ fontSize:13 }}>Loading your workspace…</span>
    </div>
  );

  const { projects, tasks, profiles, objectives, keyResults, cycles, activeCycle } = data;
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const curMonth = now.getMonth() + 1;
  const greet = now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";
  const dateStr = now.toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric", year:"numeric" });

  const overallProgress = objectives.length > 0
    ? Math.round(objectives.reduce((s,o) => s + Number(o.progress||0), 0) / objectives.length) : 0;
  const onTrackCount = objectives.filter(o => o.health === "on_track").length;
  const atRiskCount  = objectives.filter(o => o.health === "at_risk").length;
  const offTrackCount= objectives.filter(o => o.health === "off_track").length;
  const daysLeft = activeCycle ? Math.max(0, Math.ceil((new Date(activeCycle.end_date) - now) / 86400000)) : 0;

  const openTasks    = tasks.filter(t => t.status !== "done" && t.status !== "cancelled");
  const overdueTasks = openTasks.filter(t => t.due_date && t.due_date < todayStr);
  const myTasks      = openTasks.filter(t => t.assignee_id === profile?.id && !t.parent_task_id)
    .sort((a,b) => { if(!a.due_date&&!b.due_date) return 0; if(!a.due_date) return 1; if(!b.due_date) return -1; return a.due_date.localeCompare(b.due_date); }).slice(0, 6);

  // YTD from Daily Scoreboard — sum Shopify (revenue) + Amazon (amazon_revenue)
  const sbShopifyRev = scoreboardData.filter(r => r.metric_key === "revenue").reduce((s, r) => s + (Number(r.value) || 0), 0);
  const sbAmazonRev = scoreboardData.filter(r => r.metric_key === "amazon_revenue").reduce((s, r) => s + (Number(r.value) || 0), 0);
  const ytdRev = (sbShopifyRev + sbAmazonRev) || null;
  const ytdNet = scoreboardData.filter(r => r.metric_key === "net_dollars").reduce((s, r) => s + (Number(r.value) || 0), 0) || null;

  // Monthly sparkline from scoreboard — group by month, sum shopify + amazon per month
  const revByMonth = {};
  scoreboardData.filter(r => r.metric_key === "revenue" || r.metric_key === "amazon_revenue").forEach(r => {
    const m = new Date(r.date + "T00:00:00").getMonth() + 1;
    revByMonth[m] = (revByMonth[m] || 0) + (Number(r.value) || 0);
  });
  const revSparkline = Array.from({ length: curMonth }, (_, i) => revByMonth[i + 1] || 0);

  const inDev = plmPrograms.filter(p => ["development","optimization","validation","scale_up"].includes(p.current_stage)).length;
  const launchReady = plmPrograms.filter(p => p.current_stage === "launch_ready").length;

  const ini  = (uid) => { const u=profiles[uid]; return u?.display_name ? u.display_name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase() : "?"; };
  const uname = (uid) => profiles[uid]?.display_name || "Team member";

  const relTime = (d) => {
    const diff = Date.now() - new Date(d).getTime();
    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff/3600000)}h ago`;
    return `${Math.floor(diff/86400000)}d ago`;
  };

  const lastCheckInByKR = {};
  checkIns.forEach(ci => { if (!lastCheckInByKR[ci.key_result_id]) lastCheckInByKR[ci.key_result_id] = ci; });
  const staleKRs = keyResults.filter(kr => {
    const last = lastCheckInByKR[kr.id];
    if (!last) return true;
    return Math.floor((Date.now() - new Date(last.created_at).getTime()) / 86400000) >= 7;
  }).slice(0, 5);
  const checkedInToday = keyResults.filter(kr => {
    const last = lastCheckInByKR[kr.id];
    return last && Math.floor((Date.now() - new Date(last.created_at).getTime()) / 86400000) === 0;
  }).length;

  return (
    <div style={{ display:"flex", height:"100%", overflow:"hidden" }}>
      {/* Main content */}
      <div style={{ flex:1, overflow:"auto", padding: isMobile ? "16px 12px" : "28px 32px", boxSizing:"border-box" }}>
        {/* ── Header ── */}
        <div style={{ marginBottom:20, display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
          <div>
            <h1 style={{ fontSize:26, fontWeight:800, marginBottom:4, lineHeight:1.2 }}>
              {greet}, {profile?.display_name?.split(" ")[0] || "there"} 👋
            </h1>
            <p style={{ color:T.text3, fontSize:13 }}>
              {dateStr}{activeCycle ? ` · ${activeCycle.name} — ${daysLeft} days left` : ""}
            </p>
          </div>
          {pendingApprovals.length > 0 && (
            <div style={{ background:"#f9731618", border:"1px solid #f9731640", borderRadius:10, padding:"10px 16px", display:"flex", alignItems:"center", gap:8, cursor:"pointer" }}
              onClick={() => setActive("erp", "fin_requests")}>
              <span style={{ fontSize:18 }}>⏳</span>
              <div>
                <div style={{ fontSize:13, fontWeight:700, color:"#f97316" }}>{pendingApprovals.length} Pending Approval{pendingApprovals.length!==1?"s":""}</div>
                <div style={{ fontSize:11, color:T.text3 }}>Awaiting your review</div>
              </div>
            </div>
          )}
        </div>

        {/* ── Quick Actions ── */}
        <div style={{ display:"flex", gap:8, marginBottom:24, flexWrap:"wrap", alignItems:"center" }}>
          {[
            { icon:"☐", label:"New Task", action:() => { setNewTaskForm({ title: "", project_id: "", section_id: "", priority: "none", due_date: new Date().toISOString().split("T")[0] }); setShowNewTask(true); }, color:"#3b82f6" },
            { icon:"📄", label:"New Doc", action:async () => {
              await supabase.from("documents").insert({
                org_id: profile.org_id, title: "Untitled", emoji: "📄", status: "draft", visibility: "team",
                created_by: profile.id, content: [{ type: "text", content: "" }], sort_order: 0, depth: 0,
              });
              setActive("docs");
            }, color:"#06b6d4" },
            { icon:"📊", label:"Reports", action:() => setActive("reports"), color:"#f97316" },
          ].map(a => (
            <button key={a.label} onClick={a.action} style={{ display:"flex", alignItems:"center", gap:6, padding:"8px 14px", borderRadius:8, border:`1px solid ${a.color}30`, background:`${a.color}10`, color:a.color, fontSize:12, fontWeight:600, cursor:"pointer", transition:"all 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.background = `${a.color}20`; e.currentTarget.style.transform = "translateY(-1px)"; }}
              onMouseLeave={e => { e.currentTarget.style.background = `${a.color}10`; e.currentTarget.style.transform = "none"; }}>
              <span style={{ fontSize:14 }}>{a.icon}</span>{a.label}
            </button>
          ))}
        </div>

        {/* ── New Task Modal ── */}
        {showNewTask && (
          <div style={{ position:"fixed", inset:0, zIndex:200, display:"flex", alignItems:"center", justifyContent:"center" }}>
            <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.5)" }} onClick={() => setShowNewTask(false)} />
            <div style={{ position:"relative", width:460, background:T.surface, borderRadius:14, border:`1px solid ${T.border}`, boxShadow:"0 20px 60px rgba(0,0,0,0.4)", zIndex:201, overflow:"hidden" }}>
              <div style={{ padding:"18px 24px", borderBottom:`1px solid ${T.border}`, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                <h3 style={{ fontSize:16, fontWeight:700, margin:0 }}>New Task</h3>
                <button onClick={() => setShowNewTask(false)} style={{ background:"none", border:"none", color:T.text3, cursor:"pointer", fontSize:18 }}>×</button>
              </div>
              <div style={{ padding:"20px 24px" }}>
                <div style={{ marginBottom:14 }}>
                  <label style={{ fontSize:12, fontWeight:600, color:T.text2, display:"block", marginBottom:4 }}>Task Title *</label>
                  <input value={newTaskForm.title} onChange={e => setNewTaskForm(p => ({...p, title: e.target.value}))}
                    onKeyDown={e => { if (e.key === "Enter" && newTaskForm.title.trim()) { document.getElementById("dash-create-task-btn")?.click(); } }}
                    placeholder="What needs to be done?"
                    style={{ width:"100%", padding:"10px 12px", borderRadius:8, border:`1px solid ${T.border}`, background:T.surface2, color:T.text, fontSize:14, outline:"none", boxSizing:"border-box" }} />
                </div>
                <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:10, marginBottom:14 }}>
                  <div>
                    <label style={{ fontSize:11, fontWeight:600, color:T.text3, display:"block", marginBottom:4 }}>Project</label>
                    <SearchableMultiSelect multi={false} placeholder="Personal Task (no project)"
                      options={(data?.projects||[]).filter(p => p.status !== "archived").map(p => ({ value: p.id, label: p.name, color: p.color }))}
                      selected={newTaskForm.project_id || ""}
                      onChange={val => setNewTaskForm(p => ({...p, project_id: val, section_id: ""}))} />
                  </div>
                  <div>
                    <label style={{ fontSize:11, fontWeight:600, color:T.text3, display:"block", marginBottom:4 }}>Section</label>
                    {newTaskForm.project_id ? (
                      <SearchableMultiSelect multi={false} placeholder="Default (first section)"
                        options={(data?.sections||[]).filter(s => s.project_id === newTaskForm.project_id).map(s => ({ value: s.id, label: s.name }))}
                        selected={newTaskForm.section_id || ""}
                        onChange={val => setNewTaskForm(p => ({...p, section_id: val}))} />
                    ) : (
                      <div style={{ padding:"7px 10px", borderRadius:6, border:`1px solid ${T.border}`, background:T.surface2, color:T.text3, fontSize:12, opacity:0.5 }}>Select a project first</div>
                    )}
                  </div>
                </div>
                <div style={{ marginBottom:14 }}>
                  <label style={{ fontSize:11, fontWeight:600, color:T.text3, display:"block", marginBottom:4 }}>Priority</label>
                  <div style={{ display:"flex", gap:6 }}>
                    {[{k:"none",l:"None"},{k:"low",l:"Low",c:"#22c55e"},{k:"medium",l:"Medium",c:"#eab308"},{k:"high",l:"High",c:"#f97316"},{k:"urgent",l:"Urgent",c:"#ef4444"}].map(p => (
                      <button key={p.k} onClick={() => setNewTaskForm(prev => ({...prev, priority: p.k}))}
                        style={{ padding:"4px 12px", borderRadius:6, border: newTaskForm.priority === p.k ? `1.5px solid ${p.c||T.border}` : `1px solid ${T.border}`,
                          background: newTaskForm.priority === p.k ? (p.c||T.text3)+"15" : "transparent",
                          color: newTaskForm.priority === p.k ? (p.c||T.text2) : T.text3, fontSize:11, fontWeight:500, cursor:"pointer" }}>{p.l}</button>
                    ))}
                  </div>
                </div>
                <div style={{ marginBottom:14 }}>
                  <label style={{ fontSize:11, fontWeight:600, color:T.text3, display:"block", marginBottom:4 }}>Due Date</label>
                  <input type="date" value={newTaskForm.due_date || ""} onChange={e => setNewTaskForm(p => ({...p, due_date: e.target.value}))}
                    style={{ padding:"7px 10px", borderRadius:6, border:`1px solid ${T.border}`, background:T.surface2, color:T.text, fontSize:12, cursor:"pointer", outline:"none" }} />
                </div>
              </div>
              <div style={{ padding:"14px 24px", borderTop:`1px solid ${T.border}`, display:"flex", gap:8, justifyContent:"space-between", alignItems:"center" }}>
                <div style={{ fontSize:11, color:T.text3 }}>{newTaskForm.project_id ? "Will be added to project" : "Personal task — appears in My Tasks"}</div>
                <div style={{ display:"flex", gap:8 }}>
                  <button onClick={() => setShowNewTask(false)} style={{ padding:"8px 16px", borderRadius:8, background:T.surface3, color:T.text2, border:"none", fontSize:13, cursor:"pointer" }}>Cancel</button>
                  <button id="dash-create-task-btn" onClick={async () => {
                    if (!newTaskForm.title.trim()) return;
                    const secs = newTaskForm.project_id && !newTaskForm.section_id
                      ? (data?.sections||[]).filter(s => s.project_id === newTaskForm.project_id)
                      : [];
                    const secId = newTaskForm.section_id || (secs.length > 0 ? secs[0].id : null);
                    const { data: newTask, error } = await supabase.from("tasks").insert({
                      org_id: profile.org_id, project_id: newTaskForm.project_id || null,
                      section_id: secId, title: newTaskForm.title.trim(),
                      status: "todo", priority: newTaskForm.priority || "none",
                      due_date: newTaskForm.due_date || null,
                      assignee_id: profile.id, sort_order: 0, created_by: profile.id,
                    }).select().single();
                    if (error) { alert("Failed: " + error.message); return; }
                    setShowNewTask(false);
                    setActive("projects");
                  }}
                    disabled={!newTaskForm.title.trim()}
                    style={{ padding:"8px 20px", borderRadius:8, border:"none",
                      background: newTaskForm.title.trim() ? T.accent : T.surface3,
                      color: newTaskForm.title.trim() ? "#fff" : T.text3,
                      fontSize:13, fontWeight:600, cursor: newTaskForm.title.trim() ? "pointer" : "default" }}>
                    Create Task
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Daily Focus ── */}
        <TodaysFocus tasks={tasks} projects={projects} focusItems={focusItems} setFocusItems={setFocusItems} todayStr={todayStr} setActive={setActive} profile={profile} />

        {/* ── KPI Row ── */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))", gap:12, marginBottom:24 }}>
          <KPICard icon="📈" label="YTD Revenue" value={ytdRev!=null?fmt$(ytdRev):"—"}
            sub={ytdRev ? `Shopify ${fmt$(sbShopifyRev)} · Amazon ${fmt$(sbAmazonRev)}` : "Sync Daily Scoreboard for data"}
            color="#22c55e" onClick={() => setActive("okrs")} />
          <KPICard icon="💵" label="YTD Net $" value={ytdNet!=null?fmt$(ytdNet):"—"}
            sub={ytdRev&&ytdNet ? `${((ytdNet/ytdRev)*100).toFixed(1)}% margin` : ""}
            color={ytdNet!=null&&ytdNet>=0?"#22c55e":"#ef4444"} onClick={() => setActive("okrs")} />
          <KPICard icon="◎" label="OKR Progress" value={`${overallProgress}%`}
            sub={`${onTrackCount} on track · ${atRiskCount} at risk`}
            color={overallProgress>=60?"#22c55e":overallProgress>=30?"#eab308":"#ef4444"} onClick={() => setActive("okrs")} />
          <KPICard icon="☐" label="Open Tasks" value={openTasks.length}
            sub={overdueTasks.length>0?`${overdueTasks.length} overdue`:`${myTasks.length} assigned to me`}
            color={overdueTasks.length>0?"#ef4444":T.text} onClick={() => setActive("projects")} />
          <KPICard icon="⬢" label="PLM Programs" value={plmPrograms.length}
            sub={`${inDev} in development · ${launchReady} launch ready`}
            color={T.accent} onClick={() => setActive("plm")} />
        </div>

        {/* ── My Tasks + Inbox — TOP POSITION ── */}
        <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:20, marginBottom:20 }}>
          <Card>
            <SectionHeader title="My Tasks" icon="👤" action={
              <button onClick={() => setActive("projects")} style={{ background:"none", border:"none", color:T.accent, fontSize:12, cursor:"pointer", fontWeight:500 }}>View all →</button>
            } />
            {myTasks.length === 0 ? (
              <div style={{ textAlign:"center", padding:"24px 0", color:T.text3, fontSize:13 }}>No open tasks assigned to you 🎉</div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
                {myTasks.map(t => {
                  const proj = projects.find(p => p.id === t.project_id);
                  const isOverdue = t.due_date && t.due_date < todayStr;
                  const isDueToday = t.due_date === todayStr;
                  const priColors = { urgent:"#ef4444", high:"#f97316", medium:"#eab308", low:"#22c55e" };
                  const priColor = priColors[t.priority] || T.text3;
                  return (
                    <div key={t.id} onClick={() => setActive("projects", t.id)} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 12px", borderRadius:8, background:T.surface2, cursor:"pointer", borderLeft:`3px solid ${isOverdue?"#ef4444":priColor}` }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:13, fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.title}</div>
                        <div style={{ fontSize:10, color:T.text3, marginTop:2 }}>{proj?.name || "—"}</div>
                      </div>
                      {t.due_date && (
                        <span style={{ fontSize:10, fontWeight:600, padding:"2px 7px", borderRadius:4, flexShrink:0,
                          background: isOverdue ? "#ef444420" : isDueToday ? T.accent+"20" : T.surface3,
                          color: isOverdue ? "#ef4444" : isDueToday ? T.accent : T.text3 }}>
                          {isDueToday ? "Today" : isOverdue ? `${Math.ceil((now - new Date(t.due_date))/86400000)}d late` : new Date(t.due_date+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            {overdueTasks.length > 0 && (
              <div style={{ marginTop:10, padding:"8px 12px", borderRadius:8, background:"#ef444408", border:"1px solid #ef444430" }}>
                <span style={{ fontSize:11, color:"#ef4444", fontWeight:600 }}>⚠️ {overdueTasks.length} overdue task{overdueTasks.length!==1?"s":""} across all projects</span>
              </div>
            )}
          </Card>

          {/* ── Inbox ── */}
          <Card>
            <SectionHeader title="Inbox" icon="📥" action={
              inbox.filter(n => !n.is_read).length > 0 ? (
                <button onClick={async () => {
                  const unread = inbox.filter(n => !n.is_read).map(n => n.id);
                  if (unread.length === 0) return;
                  await supabase.from("notifications").update({ is_read: true, read_at: new Date().toISOString() }).in("id", unread);
                  setInbox(p => p.map(n => ({ ...n, is_read: true, read_at: new Date().toISOString() })));
                }} style={{ background:"none", border:"none", color:T.accent, fontSize:11, cursor:"pointer", fontWeight:500 }}>Mark all read</button>
              ) : <span style={{ fontSize:10, color:T.text3 }}>All caught up</span>
            } />
            {inbox.length === 0 ? (
              <div style={{ textAlign:"center", padding:"30px 0", color:T.text3 }}>
                <div style={{ fontSize:32, marginBottom:8 }}>📭</div>
                <div style={{ fontSize:13, fontWeight:500 }}>No notifications yet</div>
                <div style={{ fontSize:11, marginTop:4 }}>When someone @mentions you or assigns you a task, it will show up here.</div>
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:2, maxHeight:400, overflow:"auto" }}>
                {inbox.map(n => {
                  const actor = profiles[n.actor_id];
                  const ac = acol(n.actor_id);
                  const isUnread = !n.is_read;
                  const meta = n.metadata || {};
                  const typeIcon = n.type === "mention" ? "💬" : n.type === "assignment" ? "📋" : n.type === "status_change" ? "🔄" : "🔔";
                  const age = relTime(n.created_at);
                  return (
                    <div key={n.id}
                      onClick={async () => {
                        if (isUnread) {
                          await supabase.from("notifications").update({ is_read: true, read_at: new Date().toISOString() }).eq("id", n.id);
                          setInbox(p => p.map(x => x.id === n.id ? { ...x, is_read: true } : x));
                        }
                        if (n.entity_type === "task" && n.entity_id) setActive("projects", n.entity_id);
                      }}
                      style={{
                        display:"flex", gap:10, padding:"10px 12px", borderRadius:8, cursor:"pointer",
                        background: isUnread ? T.accent + "08" : "transparent",
                        borderLeft: isUnread ? `3px solid ${T.accent}` : "3px solid transparent",
                      }}
                      onMouseEnter={e => { if (!isUnread) e.currentTarget.style.background = T.surface2; }}
                      onMouseLeave={e => { if (!isUnread) e.currentTarget.style.background = "transparent"; }}
                    >
                      <div style={{ width:28, height:28, borderRadius:14, background:ac+"15", border:"2px solid "+ac+"30", display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, color:ac, flexShrink:0, marginTop:1 }}>
                        {actor?.display_name ? actor.display_name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase() : "?"}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                          <span style={{ fontSize:12, fontWeight: isUnread ? 700 : 500, color:T.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1 }}>{n.title}</span>
                          <span style={{ fontSize:9, color:T.text3, flexShrink:0 }}>{age}</span>
                        </div>
                        {n.body && (
                          <div style={{ fontSize:11, color:T.text3, marginTop:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                            {n.body.split(/(@[A-Za-z\u00C0-\u024F' ]+)/g).map((part, i) =>
                              part.startsWith("@") ? <span key={i} style={{ color:T.accent, fontWeight:600 }}>{part}</span> : part
                            )}
                          </div>
                        )}
                        {meta.task_title && (
                          <div style={{ fontSize:10, color:T.text3, marginTop:3, display:"flex", alignItems:"center", gap:4 }}>
                            <span>{typeIcon}</span>
                            <span style={{ fontWeight:500 }}>{meta.task_title}</span>
                            {meta.project_name && <span>in {meta.project_name}</span>}
                          </div>
                        )}
                      </div>
                      {isUnread && <div style={{ width:8, height:8, borderRadius:4, background:T.accent, flexShrink:0, marginTop:8 }} />}
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* ── Revenue trend + OKRs ── */}
        <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:20, marginBottom:20 }}>
          <Card>
            <SectionHeader title="Revenue This Year" icon="📊" action={
              <button onClick={() => setActive("okrs")} style={{ background:"none", border:"none", color:T.accent, fontSize:12, cursor:"pointer", fontWeight:500 }}>View metrics →</button>
            } />
            {revSparkline.some(v=>v>0) ? (
              <div>
                <div style={{ display:"flex", gap:24, marginBottom:16, flexWrap:"wrap" }}>
                  <div><div style={{ fontSize:24, fontWeight:800, color:"#22c55e" }}>{fmt$(ytdRev)}</div><div style={{ fontSize:11, color:T.text3 }}>YTD Revenue (Shopify + Amazon)</div></div>
                  {ytdNet!=null&&<div><div style={{ fontSize:24, fontWeight:800, color:ytdNet>=0?"#22c55e":"#ef4444" }}>{fmt$(ytdNet)}</div><div style={{ fontSize:11, color:T.text3 }}>YTD Net $</div></div>}
                  <div><div style={{ fontSize:16, fontWeight:700, color:T.text2 }}>{fmt$(sbShopifyRev)}</div><div style={{ fontSize:10, color:T.text3 }}>Shopify</div></div>
                  <div><div style={{ fontSize:16, fontWeight:700, color:T.text2 }}>{fmt$(sbAmazonRev)}</div><div style={{ fontSize:10, color:T.text3 }}>Amazon</div></div>
                </div>
                <div style={{ display:"flex", alignItems:"flex-end", gap:4, height:80 }}>
                  {revSparkline.map((v, i) => {
                    const maxV = Math.max(...revSparkline, 1);
                    const h = Math.max(4, (v/maxV)*76);
                    const months = ["J","F","M","A","M","J","J","A","S","O","N","D"];
                    const isCur = i+1 === curMonth;
                    return (
                      <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
                        <div style={{ fontSize:9, color:T.text3, fontWeight:600 }}>{v>0?fmt$(v):""}</div>
                        <div style={{ width:"100%", height:`${h}px`, borderRadius:"3px 3px 0 0", background: isCur ? T.accent : v>0 ? T.accent+"70" : T.surface3, transition:"height 0.4s" }} />
                        <div style={{ fontSize:9, color:isCur?T.accent:T.text3, fontWeight:isCur?700:400 }}>{months[i]}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div style={{ textAlign:"center", padding:"24px 0", color:T.text3 }}>
                <div style={{ fontSize:32, marginBottom:8 }}>📊</div>
                <div style={{ fontSize:13, marginBottom:4 }}>No financial data yet</div>
                <div style={{ fontSize:11, marginBottom:12 }}>Go to OKRs and click "Sync from Sheet"</div>
                <button onClick={() => setActive("okrs")} style={{ padding:"6px 14px", fontSize:12, fontWeight:600, background:T.accent, color:"#fff", border:"none", borderRadius:6, cursor:"pointer" }}>Go to OKRs →</button>
              </div>
            )}
          </Card>

          <Card>
            <SectionHeader title={activeCycle?.name || "OKRs"} icon="◎" action={
              <button onClick={() => setActive("okrs")} style={{ background:"none", border:"none", color:T.accent, fontSize:12, cursor:"pointer", fontWeight:500 }}>View all →</button>
            } />
            <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:16 }}>
              <div style={{ position:"relative", flexShrink:0 }}>
                <Ring pct={overallProgress} size={72} stroke={6} color={overallProgress>=60?"#22c55e":overallProgress>=30?"#eab308":"#ef4444"} />
                <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
                  <span style={{ fontSize:18, fontWeight:800, color:T.text }}>{overallProgress}%</span>
                </div>
              </div>
              <div style={{ display:"flex", flexDirection:"column", gap:6, flex:1 }}>
                {[["#22c55e","On Track",onTrackCount],["#eab308","At Risk",atRiskCount],["#ef4444","Off Track",offTrackCount]].map(([c,l,v])=>(
                  <div key={l} style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <div style={{ width:8, height:8, borderRadius:"50%", background:c, flexShrink:0 }} />
                    <span style={{ fontSize:12, color:T.text2, flex:1 }}>{l}</span>
                    <span style={{ fontSize:13, fontWeight:700, color:c }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {objectives.slice(0,4).map(obj => {
                const pct = Math.round(Number(obj.progress||0));
                const h = HEALTH[obj.health] || HEALTH.on_track;
                return (
                  <div key={obj.id} onClick={()=>setActive("okrs")} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 10px", borderRadius:8, background:T.surface2, cursor:"pointer" }}>
                    <div style={{ width:6, height:6, borderRadius:"50%", background:h.color, flexShrink:0 }} />
                    <div style={{ fontSize:12, fontWeight:500, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{obj.title}</div>
                    <div style={{ width:60, flexShrink:0 }}>
                      <div style={{ height:4, borderRadius:4, background:T.surface3, overflow:"hidden" }}>
                        <div style={{ width:`${pct}%`, height:"100%", background:h.color, borderRadius:4 }} />
                      </div>
                    </div>
                    <span style={{ fontSize:11, fontWeight:700, color:h.color, minWidth:28, textAlign:"right" }}>{pct}%</span>
                  </div>
                );
              })}
              {objectives.length === 0 && <div style={{ fontSize:12, color:T.text3, textAlign:"center", padding:"16px 0" }}>No objectives in this cycle</div>}
            </div>
          </Card>
        </div>


        {/* ── PLM Pipeline ── */}
        <div style={{ marginBottom:20 }}>
          <Card>
            <SectionHeader title="PLM Pipeline" icon="⬢" action={
              <button onClick={() => setActive("plm")} style={{ background:"none", border:"none", color:T.accent, fontSize:12, cursor:"pointer", fontWeight:500 }}>View all →</button>
            } />
            {plmPrograms.length === 0 ? (
              <div style={{ textAlign:"center", padding:"24px 0", color:T.text3 }}>
                <div style={{ fontSize:32, marginBottom:8 }}>⬢</div>
                <div style={{ fontSize:13 }}>No programs yet</div>
              </div>
            ) : (
              <div>
                {[
                  {key:"ideation",label:"Ideation",color:"#8b5cf6"},
                  {key:"development",label:"Development",color:"#0ea5e9"},
                  {key:"validation",label:"Validation",color:"#10b981"},
                  {key:"launch_ready",label:"Launch Ready",color:"#f97316"},
                  {key:"launched",label:"Launched",color:"#22c55e"},
                ].map(stage => {
                  const count = plmPrograms.filter(p => p.current_stage === stage.key || (stage.key==="development"&&["development","optimization","scale_up","regulatory","feasibility","concept"].includes(p.current_stage))).length;
                  const pct = plmPrograms.length > 0 ? (count/plmPrograms.length)*100 : 0;
                  if (count === 0) return null;
                  return (
                    <div key={stage.key} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                      <div style={{ fontSize:11, color:T.text2, width:80, textAlign:"right" }}>{stage.label}</div>
                      <div style={{ flex:1, height:16, background:T.surface3, borderRadius:8, overflow:"hidden" }}>
                        <div style={{ width:`${pct}%`, height:"100%", background:stage.color, borderRadius:8, display:"flex", alignItems:"center", paddingLeft:6, minWidth:24 }}>
                          {count>0&&<span style={{ fontSize:9, fontWeight:700, color:"#fff" }}>{count}</span>}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div style={{ marginTop:12, display:"flex", flexDirection:"column", gap:5 }}>
                  {plmPrograms.slice(0,3).map(p => (
                    <div key={p.id} onClick={()=>setActive("plm")} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 10px", borderRadius:7, background:T.surface2, cursor:"pointer" }}>
                      <div style={{ fontSize:11, flex:1, fontWeight:500 }}>{p.name}</div>
                      <span style={{ fontSize:9, fontWeight:700, padding:"2px 6px", borderRadius:4,
                        background: p.priority==="critical"?"#ef444420":p.priority==="high"?"#f9731620":"#22c55e15",
                        color: p.priority==="critical"?"#ef4444":p.priority==="high"?"#f97316":"#22c55e" }}>
                        {(p.current_stage||"").replace(/_/g," ").toUpperCase()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        </div>

        {/* ── Projects Health Summary ── */}
        {projects.filter(p => p.status !== "archived").length > 0 && (() => {
          const activeProjs = projects.filter(p => p.status !== "archived").map(p => {
            const pt = tasks.filter(t => t.project_id === p.id && !t.parent_task_id);
            const done = pt.filter(t => t.status === "done").length;
            const overdue = pt.filter(t => t.status !== "done" && t.due_date && t.due_date < todayStr).length;
            const pct = pt.length ? Math.round((done / pt.length) * 100) : 0;
            const health = overdue > pt.length * 0.2 ? "off_track" : overdue > 0 ? "at_risk" : "on_track";
            return { ...p, pct, overdue, taskCount: pt.length, health };
          });
          const atRiskProjs = activeProjs.filter(p => p.health !== "on_track");
          if (atRiskProjs.length === 0) return null;
          return (
            <div style={{ marginBottom:20 }}>
              <Card>
                <SectionHeader title="Projects Needing Attention" icon="📁" action={
                  <button onClick={() => setActive("projects")} style={{ background:"none", border:"none", color:T.accent, fontSize:12, cursor:"pointer", fontWeight:500 }}>All projects →</button>
                } />
                <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill, minmax(200px,1fr))", gap:10 }}>
                  {atRiskProjs.slice(0,6).map(p => {
                    const hc = p.health === "off_track" ? "#ef4444" : "#eab308";
                    return (
                      <div key={p.id} onClick={() => setActive("projects")} style={{ padding:"12px 14px", borderRadius:10, background:T.surface2, border:`1px solid ${hc}40`, cursor:"pointer", borderLeft:`3px solid ${hc}` }}
                        onMouseEnter={e => e.currentTarget.style.background = T.surface3}
                        onMouseLeave={e => e.currentTarget.style.background = T.surface2}>
                        <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:8 }}>
                          <div style={{ width:8, height:8, borderRadius:4, background:p.color||T.accent, flexShrink:0 }} />
                          <span style={{ fontSize:12, fontWeight:600, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{p.name}</span>
                          <span style={{ fontSize:9, fontWeight:700, padding:"1px 6px", borderRadius:8, background:hc+"20", color:hc }}>
                            {p.health === "off_track" ? "Off Track" : "At Risk"}
                          </span>
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                          <div style={{ flex:1, height:3, borderRadius:2, background:T.surface3 }}>
                            <div style={{ width:`${p.pct}%`, height:"100%", borderRadius:2, background:p.color||T.accent }} />
                          </div>
                          <span style={{ fontSize:11, color:T.text3, fontWeight:600, minWidth:28 }}>{p.pct}%</span>
                        </div>
                        {p.overdue > 0 && <div style={{ fontSize:10, color:hc, marginTop:5 }}>⚠ {p.overdue} overdue task{p.overdue!==1?"s":""}</div>}
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          );
        })()}

        {/* ── Check-ins Needed ── */}
        {staleKRs.length > 0 && (
          <div style={{ marginBottom:20 }}>
            <Card style={{ borderColor: "#eab30840", background: `linear-gradient(135deg, ${T.surface} 0%, #eab30808 100%)` }}>
              <SectionHeader title="Check-ins Needed" icon="📝" action={
                <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                  {checkedInToday > 0 && <span style={{ fontSize:11, color:"#22c55e", fontWeight:600 }}>✓ {checkedInToday} done today</span>}
                  <button onClick={() => setActive("okrs")} style={{ background:"none", border:"none", color:T.accent, fontSize:12, cursor:"pointer", fontWeight:500 }}>Go to OKRs →</button>
                </div>
              } />
              <div style={{ fontSize:12, color:T.text3, marginBottom:12 }}>
                These Key Results haven't been updated in 7+ days. A quick check-in keeps everyone aligned.
              </div>
              <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:8 }}>
                {staleKRs.map(kr => {
                  const last = lastCheckInByKR[kr.id];
                  const daysSince = last ? Math.floor((Date.now() - new Date(last.created_at).getTime()) / 86400000) : null;
                  const obj = objectives.find(o => o.id === kr.objective_id);
                  const pct = Math.round(Number(kr.progress || 0));
                  const urgentColor = daysSince === null ? "#ef4444" : daysSince >= 14 ? "#ef4444" : "#eab308";
                  return (
                    <div key={kr.id} onClick={() => setActive("okrs")} style={{
                      display:"flex", alignItems:"center", gap:10, padding:"10px 14px",
                      borderRadius:8, background:T.surface2, cursor:"pointer",
                      border:`1px solid ${urgentColor}30`, borderLeft:`3px solid ${urgentColor}`,
                    }}
                      onMouseEnter={e => e.currentTarget.style.background = T.surface3}
                      onMouseLeave={e => e.currentTarget.style.background = T.surface2}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:12, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", color:T.text }}>{kr.title}</div>
                        {obj && <div style={{ fontSize:10, color:T.text3, marginTop:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{obj.title}</div>}
                      </div>
                      <div style={{ flexShrink:0, display:"flex", flexDirection:"column", alignItems:"flex-end", gap:3 }}>
                        <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:8, background:urgentColor+"20", color:urgentColor }}>
                          {daysSince === null ? "Never" : `${daysSince}d ago`}
                        </span>
                        <div style={{ fontSize:10, color:T.text3 }}>{pct}% progress</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        )}

        {/* ── Recent Activity + Approvals ── */}
        <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:20 }}>
          <Card>
            <SectionHeader title="Recent Activity" icon="🕐" action={
              <button onClick={() => setActive("activity")} style={{ background:"none", border:"none", color:T.accent, fontSize:12, cursor:"pointer", fontWeight:500 }}>View all →</button>
            } />
            {recentActivity.length === 0 ? (
              <div style={{ fontSize:12, color:T.text3, textAlign:"center", padding:"24px 0" }}>No recent activity</div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
                {recentActivity.slice(0,10).map((act, i) => {
                  const c = acol(act.actor_id);
                  const entityIcons = { task:"☐", project:"◼", doc:"📄", objective:"🎯", key_result:"◎", campaign:"📢", product:"⬢", call:"📞" };
                  const actionColors = { created:"#22c55e", completed:"#22c55e", updated:"#3b82f6", deleted:"#ef4444", assigned:"#a855f7", commented:"#06b6d4" };
                  const actionColor = actionColors[act.action] || T.text3;
                  const eIcon = entityIcons[act.entity_type] || "◔";
                  return (
                    <div key={act.id} onClick={() => {
                      const modMap = { task:"projects", project:"projects", doc:"docs", objective:"okrs", key_result:"okrs", campaign:"campaigns", product:"plm" };
                      if (modMap[act.entity_type]) setActive(modMap[act.entity_type]);
                    }} style={{ display:"flex", gap:10, padding:"8px 6px", borderBottom: i<9?`1px solid ${T.border}20`:"none", cursor:"pointer", borderRadius:6, transition:"background 0.1s" }}
                      onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <div style={{ width:28, height:28, borderRadius:14, background:c+"20", border:`1.5px solid ${c}50`,
                        display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, color:c, flexShrink:0 }}>
                        {ini(act.actor_id)}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:12, lineHeight:1.4, display:"flex", alignItems:"center", gap:4, flexWrap:"wrap" }}>
                          <span style={{ fontWeight:600 }}>{uname(act.actor_id)}</span>
                          <span style={{ color:actionColor, fontWeight:600, fontSize:11 }}>{act.action}</span>
                          <span style={{ fontSize:12 }}>{eIcon}</span>
                          <span style={{ color:T.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:140 }}>{act.entity_name || act.entity_type}</span>
                        </div>
                        <div style={{ fontSize:10, color:T.text3, marginTop:1 }}>{relTime(act.created_at)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>

          <Card>
            <SectionHeader title="Pending Approvals" icon="⏳" action={
              <button onClick={() => setActive("erp", "fin_requests")} style={{ background:"none", border:"none", color:T.accent, fontSize:12, cursor:"pointer", fontWeight:500 }}>View all →</button>
            } />
            {pendingApprovals.length === 0 ? (
              <div style={{ fontSize:12, color:T.text3, textAlign:"center", padding:"24px 0" }}>
                <div style={{ fontSize:28, marginBottom:8 }}>✅</div>
                No pending approvals — you're all caught up!
              </div>
            ) : (
              <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                {pendingApprovals.map(req => (
                  <div key={req.id} style={{ padding:"10px 12px", background:T.surface2, borderRadius:9, border:`1px solid ${T.border}` }}>
                    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:4 }}>
                      <div>
                        <div style={{ fontSize:13, fontWeight:600 }}>{req.entity_name || req.entity_type}</div>
                        {req._type === "spend" && <span style={{ fontSize:9, fontWeight:700, padding:"1px 5px", borderRadius:3, background:"#f59e0b18", color:"#f59e0b" }}>SPEND REQUEST</span>}
                      </div>
                      {req.amount && <div style={{ fontSize:13, fontWeight:700, color:"#f97316" }}>{fmt$(req.amount)}</div>}
                    </div>
                    <div style={{ fontSize:11, color:T.text3, marginBottom:8 }}>{req.description || req.module} · {relTime(req.created_at)}</div>
                    <div style={{ display:"flex", gap:6 }}>
                      <button onClick={async()=>{
                        if (req._type === "spend") {
                          const approvals = [...(req.approvals || []), { step: 0, by: profile?.id, at: new Date().toISOString().slice(0, 10) }];
                          await supabase.from("af_requests").update({ status: "approved", approval_step: 1, approvals }).eq("id", req.id);
                        } else {
                          await supabase.from("approval_requests").update({status:"approved",decided_at:new Date().toISOString()}).eq("id",req.id);
                        }
                        setPendingApprovals(p=>p.filter(a=>a.id!==req.id));
                        notifySlack({ type:"approval", channel:"ben", title:"Approval Granted ✅", message:`${req.entity_name||req.entity_type} has been approved${req.amount?" ("+fmt$(req.amount)+")":""}`, url:"https://helm-app-six.vercel.app" });
                      }} style={{ flex:1, padding:"5px 0", fontSize:11, fontWeight:600, background:"#22c55e20", color:"#22c55e", border:"1px solid #22c55e40", borderRadius:5, cursor:"pointer" }}>✓ Approve</button>
                      <button onClick={async()=>{
                        if (req._type === "spend") {
                          await supabase.from("af_requests").update({ status: "rejected", rejected_by: profile?.id, rejected_at: new Date().toISOString().slice(0, 10) }).eq("id", req.id);
                        } else {
                          await supabase.from("approval_requests").update({status:"rejected",decided_at:new Date().toISOString()}).eq("id",req.id);
                        }
                        setPendingApprovals(p=>p.filter(a=>a.id!==req.id));
                        notifySlack({ type:"approval", channel:"ben", title:"Approval Rejected ❌", message:`${req.entity_name||req.entity_type} was rejected`, url:"https://helm-app-six.vercel.app" });
                      }} style={{ flex:1, padding:"5px 0", fontSize:11, fontWeight:600, background:"#ef444410", color:"#ef4444", border:"1px solid #ef444430", borderRadius:5, cursor:"pointer" }}>✕ Reject</button>
                      {req._type === "spend" && <button onClick={() => setActive("erp", "fin_requests")} style={{ padding:"5px 8px", fontSize:11, fontWeight:500, background:T.surface, border:`1px solid ${T.border}`, borderRadius:5, cursor:"pointer", color:T.text3 }}>View →</button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop:16, paddingTop:16, borderTop:`1px solid ${T.border}` }}>
              <div style={{ fontSize:12, fontWeight:700, color:T.text3, marginBottom:10, textTransform:"uppercase", letterSpacing:0.5 }}>Project Health</div>
              {projects.slice(0,4).map(proj => {
                const pt = tasks.filter(t=>t.project_id===proj.id&&!t.parent_task_id);
                const pd = pt.filter(t=>t.status==="done").length;
                const pct = pt.length>0?Math.round((pd/pt.length)*100):0;
                const od = pt.filter(t=>t.due_date&&t.due_date<todayStr&&t.status!=="done").length;
                return (
                  <div key={proj.id} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:7 }}>
                    <div style={{ width:24, height:24, borderRadius:6, background:proj.color||T.accent, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, color:"#fff", flexShrink:0 }}>{proj.name.charAt(0)}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:11, fontWeight:500, marginBottom:3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{proj.name}</div>
                      <div style={{ height:4, borderRadius:4, background:T.surface3, overflow:"hidden" }}>
                        <div style={{ width:`${pct}%`, height:"100%", background:od>0?"#ef4444":proj.color||T.accent, borderRadius:4 }} />
                      </div>
                    </div>
                    <span style={{ fontSize:11, fontWeight:700, color:od>0?"#ef4444":T.text2, minWidth:30, textAlign:"right" }}>{pct}%</span>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      </div>

      {/* ── Calendar Sidebar ── */}
      <TodaysCalendar profile={profile} collapsed={calCollapsed} setCollapsed={toggleCalCollapsed} />
    </div>
  );
}
