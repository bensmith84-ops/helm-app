"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";
import { useResponsive } from "../lib/responsive";
import { useAuth } from "../lib/auth";

const PRIORITY_COLORS = { urgent: "#ef4444", high: "#f97316", medium: "#eab308", low: "#22c55e", none: "#6b7280" };
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHORT_DAYS = ["S","M","T","W","T","F","S"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const SHORT_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function CalendarView() {
  const { user, profile } = useAuth();
  const { isMobile } = useResponsive();
  const [tasks, setTasks] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [projects, setProjects] = useState({});
  const [month, setMonth] = useState(new Date());
  const [viewMode, setViewMode] = useState("month"); // month | week | agenda
  const [selectedDate, setSelectedDate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [addingTask, setAddingTask] = useState(null); // date string
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [filterProject, setFilterProject] = useState("");
  const [filterMe, setFilterMe] = useState(false);

  useEffect(() => {
    if (!profile?.org_id) return;
    (async () => {
      const [{ data: t }, { data: p }, { data: ms }] = await Promise.all([
        supabase.from("tasks").select("*").is("deleted_at", null).not("due_date", "is", null).order("due_date"),
        supabase.from("projects").select("id,name,color,emoji").is("deleted_at", null),
        supabase.from("okr_milestones").select("id,title,start_date,end_date,health,progress,color").order("start_date"),
      ]);
      setTasks(t || []);
      setMilestones(ms || []);
      const m = {}; (p || []).forEach(pr => { m[pr.id] = pr; }); setProjects(m);
      setLoading(false);
    })();
  }, [profile?.org_id]);

  const year = month.getFullYear();
  const mo = month.getMonth();
  const today = new Date().toISOString().split("T")[0];

  const prev = () => {
    if (viewMode === "week") setMonth(new Date(month.getTime() - 7 * 86400000));
    else setMonth(new Date(year, mo - 1, 1));
  };
  const next = () => {
    if (viewMode === "week") setMonth(new Date(month.getTime() + 7 * 86400000));
    else setMonth(new Date(year, mo + 1, 1));
  };
  const goToday = () => setMonth(new Date());

  const getEvents = (dateStr) => {
    const filtered = tasks.filter(t => {
      if (t.due_date !== dateStr) return false;
      if (filterProject && t.project_id !== filterProject) return false;
      if (filterMe && t.assignee_id !== user?.id) return false;
      return true;
    });
    return filtered;
  };

  const getMilestones = (dateStr) => milestones.filter(m => m.start_date <= dateStr && m.end_date >= dateStr);

  const quickAddTask = async (dateStr) => {
    if (!newTaskTitle.trim() || !profile?.org_id) return;
    const { data } = await supabase.from("tasks").insert({
      org_id: profile.org_id, created_by: user?.id,
      title: newTaskTitle.trim(), status: "todo", priority: "none",
      due_date: dateStr, sort_order: 0,
    }).select().single();
    if (data) setTasks(p => [...p, data]);
    setNewTaskTitle("");
    setAddingTask(null);
  };

  const projList = Object.values(projects);

  // Month view
  const firstDay = new Date(year, mo, 1).getDay();
  const daysInMonth = new Date(year, mo + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  // Pad to full weeks
  while (cells.length % 7 !== 0) cells.push(null);

  // Week view - get week containing current month state
  const getWeekDates = () => {
    const d = new Date(month);
    const dayOfWeek = d.getDay();
    const weekStart = new Date(d);
    weekStart.setDate(d.getDate() - dayOfWeek);
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const dd = new Date(weekStart);
      dd.setDate(weekStart.getDate() + i);
      dates.push(dd.toISOString().split("T")[0]);
    }
    return dates;
  };

  const weekDates = getWeekDates();

  // Agenda view - next 30 days
  const agendaDays = [];
  for (let i = 0; i < 30; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    const ds = d.toISOString().split("T")[0];
    const events = getEvents(ds);
    const ms2 = getMilestones(ds);
    if (events.length > 0 || ms2.length > 0) agendaDays.push({ ds, events, milestones: ms2 });
  }

  // Today stats
  const todayTasks = getEvents(today);
  const todayDone = todayTasks.filter(t => t.status === "done").length;
  const overdueTasks = tasks.filter(t => t.due_date < today && t.status !== "done" && t.status !== "cancelled" && (!filterMe || t.assignee_id === user?.id));

  if (loading) return <div style={{ display:"flex", height:"100%", alignItems:"center", justifyContent:"center", color:T.text3, fontSize:13 }}>Loading calendar…</div>;

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>
      {/* Header */}
      <div style={{ padding:"14px 24px", borderBottom:`1px solid ${T.border}`, background:T.surface, display:"flex", alignItems:"center", gap:12, flexShrink:0 }}>
        <button onClick={prev} style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:6, cursor:"pointer", color:T.text2, padding:"6px 10px", fontSize:14 }}>‹</button>
        <h2 style={{ fontSize:17, fontWeight:700, minWidth:180 }}>
          {viewMode === "week"
            ? `${SHORT_MONTHS[new Date(weekDates[0]).getMonth()]} ${new Date(weekDates[0]).getDate()} – ${SHORT_MONTHS[new Date(weekDates[6]).getMonth()]} ${new Date(weekDates[6]).getDate()}, ${new Date(weekDates[6]).getFullYear()}`
            : viewMode === "agenda" ? "Next 30 Days"
            : `${MONTHS[mo]} ${year}`}
        </h2>
        <button onClick={next} style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:6, cursor:"pointer", color:T.text2, padding:"6px 10px", fontSize:14 }}>›</button>
        <button onClick={goToday} style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:6, cursor:"pointer", color:T.text3, padding:"5px 10px", fontSize:11, fontWeight:600 }}>Today</button>
        <div style={{ flex:1 }} />
        {/* Filters */}
        <select value={filterProject} onChange={e => setFilterProject(e.target.value)}
          style={{ padding:"5px 8px", borderRadius:6, border:`1px solid ${T.border}`, background:T.surface2, color:filterProject?T.text:T.text3, fontSize:12, cursor:"pointer", outline:"none" }}>
          <option value="">All Projects</option>
          {projList.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button onClick={() => setFilterMe(!filterMe)} style={{ padding:"5px 10px", borderRadius:6, border:`1px solid ${filterMe?T.accent:T.border}`, background:filterMe?T.accentDim:"transparent", color:filterMe?T.accent:T.text3, fontSize:11, fontWeight:600, cursor:"pointer" }}>
          My tasks
        </button>
        {/* View switcher */}
        <div style={{ display:"flex", borderRadius:8, overflow:"hidden", border:`1px solid ${T.border}` }}>
          {["month","week","agenda"].map(v => (
            <button key={v} onClick={() => setViewMode(v)} style={{ padding:"5px 12px", fontSize:11, fontWeight:600, border:"none", cursor:"pointer", background:viewMode===v?T.accent:"transparent", color:viewMode===v?"#fff":T.text3, textTransform:"capitalize" }}>{v}</button>
          ))}
        </div>
      </div>

      {/* Today strip */}
      <div style={{ display:"flex", alignItems:"center", gap:16, padding:"8px 24px", background:T.surface2, borderBottom:`1px solid ${T.border}`, flexShrink:0, fontSize:12 }}>
        <span style={{ color:T.text3 }}>Today:</span>
        {todayTasks.length === 0
          ? <span style={{ color:T.text3 }}>No tasks due</span>
          : <span style={{ color:T.text2, fontWeight:500 }}>{todayDone}/{todayTasks.length} tasks done</span>}
        {todayTasks.length > 0 && (
          <div style={{ display:"flex", gap:6 }}>
            {todayTasks.slice(0,4).map(t => (
              <span key={t.id} style={{ fontSize:11, padding:"2px 8px", borderRadius:8, background:(t.status==="done"?"#22c55e":"#3b82f6")+"20", color:t.status==="done"?"#22c55e":T.accent, fontWeight:600, textDecoration:t.status==="done"?"line-through":"none" }}>
                {t.title.length > 24 ? t.title.slice(0,22)+"…" : t.title}
              </span>
            ))}
            {todayTasks.length > 4 && <span style={{ color:T.text3 }}>+{todayTasks.length-4}</span>}
          </div>
        )}
        {overdueTasks.length > 0 && (
          <span style={{ marginLeft:"auto", color:"#ef4444", fontWeight:600 }}>⚠ {overdueTasks.length} overdue</span>
        )}
      </div>

      {/* Main content */}
      <div style={{ flex:1, overflow:"auto", display:"flex" }}>
        <div style={{ flex:1, display:"flex", flexDirection:"column" }}>

          {/* MONTH VIEW */}
          {viewMode === "month" && (
            <>
              {/* Day headers */}
              <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
                {DAYS.map(d => (
                  <div key={d} style={{ padding:"8px 0", textAlign:"center", fontSize:11, fontWeight:600, color:T.text3 }}>{d}</div>
                ))}
              </div>
              {/* Grid */}
              <div style={{ flex:1, display:"grid", gridTemplateColumns:"repeat(7,1fr)", gridAutoRows:"minmax(100px,1fr)" }}>
                {cells.map((day, i) => {
                  if (!day) return <div key={`e${i}`} style={{ borderRight:`1px solid ${T.border}`, borderBottom:`1px solid ${T.border}`, background:`${T.bg}60` }} />;
                  const dateStr = `${year}-${String(mo+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
                  const dayEvents = getEvents(dateStr);
                  const dayMS = getMilestones(dateStr);
                  const isToday = dateStr === today;
                  const isSel = dateStr === selectedDate;
                  const isPast = dateStr < today;
                  return (
                    <div key={dateStr} onClick={() => { setSelectedDate(isSel ? null : dateStr); setAddingTask(null); }}
                      style={{ borderRight:`1px solid ${T.border}`, borderBottom:`1px solid ${T.border}`, padding:"4px 6px", cursor:"pointer", overflow:"hidden", background: isSel?`${T.accent}10`:isToday?`${T.accent}05`:isPast?"transparent":"transparent", transition:"background 0.1s" }}
                      onMouseEnter={e => { if (!isSel && !isToday) e.currentTarget.style.background = T.surface2; }}
                      onMouseLeave={e => { if (!isSel && !isToday) e.currentTarget.style.background = "transparent"; }}>
                      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:2 }}>
                        <div style={{ fontSize:12, fontWeight:isToday?700:500, color:isToday?T.accent:isPast?T.text3:T.text, width:22, height:22, borderRadius:11, display:"flex", alignItems:"center", justifyContent:"center", background:isToday?`${T.accent}25`:"transparent" }}>{day}</div>
                        {dayEvents.length > 0 && <span style={{ fontSize:9, color:T.text3, fontWeight:600 }}>{dayEvents.length}</span>}
                      </div>
                      {dayMS.slice(0,1).map(ms => (
                        <div key={ms.id} style={{ fontSize:9, padding:"1px 4px", borderRadius:2, marginBottom:1, background:`${ms.color||T.accent}25`, color:ms.color||T.accent, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontWeight:600 }}>
                          ◆ {ms.title}
                        </div>
                      ))}
                      {dayEvents.slice(0, dayMS.length > 0 ? 2 : 3).map(t => {
                        const proj = projects[t.project_id];
                        const isDone = t.status === "done";
                        return (
                          <div key={t.id} style={{ fontSize:10, padding:"1px 4px", borderRadius:3, marginBottom:1, background:`${proj?.color||T.accent}18`, color:T.text, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", borderLeft:`2px solid ${PRIORITY_COLORS[t.priority]||"#6b7280"}`, opacity:isDone?0.5:1, textDecoration:isDone?"line-through":"none" }}>
                            {t.title}
                          </div>
                        );
                      })}
                      {dayEvents.length > (dayMS.length > 0 ? 2 : 3) && <div style={{ fontSize:9, color:T.text3, paddingLeft:4 }}>+{dayEvents.length - (dayMS.length > 0 ? 2 : 3)} more</div>}
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* WEEK VIEW */}
          {viewMode === "week" && (
            <>
              <div style={{ display:"grid", gridTemplateColumns:"60px repeat(7,1fr)", borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
                <div style={{ borderRight:`1px solid ${T.border}`, background:T.surface }} />
                {weekDates.map(ds => {
                  const d = new Date(ds + "T12:00:00");
                  const isToday = ds === today;
                  const dayEvents = getEvents(ds);
                  return (
                    <div key={ds} onClick={() => setSelectedDate(ds)} style={{ padding:"10px 0", textAlign:"center", borderRight:`1px solid ${T.border}`, cursor:"pointer", background:isToday?`${T.accent}10`:"transparent" }}>
                      <div style={{ fontSize:11, color:isToday?T.accent:T.text3, fontWeight:700, textTransform:"uppercase" }}>{SHORT_DAYS[d.getDay()]}</div>
                      <div style={{ fontSize:20, fontWeight:800, color:isToday?T.accent:T.text, marginTop:2 }}>{d.getDate()}</div>
                      {dayEvents.length > 0 && <div style={{ fontSize:9, color:T.accent, fontWeight:700 }}>{dayEvents.length} task{dayEvents.length!==1?"s":""}</div>}
                    </div>
                  );
                })}
              </div>
              <div style={{ flex:1, overflow:"auto", display:"grid", gridTemplateColumns:"60px repeat(7,1fr)" }}>
                <div style={{ borderRight:`1px solid ${T.border}`, paddingTop:8 }}>
                  {Array.from({length:24},(_,h) => (
                    <div key={h} style={{ height:52, borderBottom:`1px solid ${T.border}20`, display:"flex", alignItems:"flex-start", paddingTop:2, paddingRight:6, justifyContent:"flex-end" }}>
                      <span style={{ fontSize:9, color:T.text3, fontWeight:600 }}>{h===0?"":h < 12?`${h}am`:h===12?"12pm":`${h-12}pm`}</span>
                    </div>
                  ))}
                </div>
                {weekDates.map(ds => {
                  const isToday = ds === today;
                  const dayEvents = getEvents(ds);
                  const dayMS = getMilestones(ds);
                  return (
                    <div key={ds} style={{ borderRight:`1px solid ${T.border}`, position:"relative", background:isToday?`${T.accent}04`:"transparent" }}>
                      {Array.from({length:24},(_,h) => (
                        <div key={h} style={{ height:52, borderBottom:`1px solid ${T.border}20` }} />
                      ))}
                      {/* All-day events at top */}
                      <div style={{ position:"absolute", top:4, left:2, right:2 }}>
                        {dayMS.map(ms => (
                          <div key={ms.id} style={{ fontSize:9, padding:"1px 5px", borderRadius:3, marginBottom:2, background:`${ms.color||T.accent}25`, color:ms.color||T.accent, fontWeight:700, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>◆ {ms.title}</div>
                        ))}
                        {dayEvents.map(t => {
                          const proj = projects[t.project_id];
                          return (
                            <div key={t.id} onClick={() => setSelectedDate(ds)} style={{ fontSize:10, padding:"3px 6px", borderRadius:4, marginBottom:2, background:`${proj?.color||T.accent}20`, color:T.text, fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", borderLeft:`2px solid ${PRIORITY_COLORS[t.priority]||"#6b7280"}`, cursor:"pointer" }}>
                              {t.title}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* AGENDA VIEW */}
          {viewMode === "agenda" && (
            <div style={{ padding:"16px 24px", overflow:"auto", flex:1 }}>
              {agendaDays.length === 0 && (
                <div style={{ textAlign:"center", padding:"60px 0", color:T.text3 }}>
                  <div style={{ fontSize:40, marginBottom:12 }}>📅</div>
                  <div style={{ fontSize:15, fontWeight:600 }}>No events in the next 30 days</div>
                </div>
              )}
              {agendaDays.map(({ ds, events, milestones: ms2 }) => {
                const d = new Date(ds + "T12:00:00");
                const isToday = ds === today;
                return (
                  <div key={ds} style={{ display:"flex", gap:16, marginBottom:16 }}>
                    <div style={{ width:60, textAlign:"right", paddingTop:4, flexShrink:0 }}>
                      <div style={{ fontSize:12, fontWeight:700, color:isToday?T.accent:T.text3 }}>{d.toLocaleDateString("en-US",{weekday:"short"})}</div>
                      <div style={{ fontSize:20, fontWeight:800, color:isToday?T.accent:T.text2, lineHeight:1 }}>{d.getDate()}</div>
                      <div style={{ fontSize:10, color:T.text3 }}>{SHORT_MONTHS[d.getMonth()]}</div>
                    </div>
                    <div style={{ flex:1, borderTop:`1px solid ${isToday?T.accent:T.border}`, paddingTop:8 }}>
                      {ms2.map(ms => (
                        <div key={ms.id} style={{ display:"flex", alignItems:"center", gap:8, padding:"7px 12px", borderRadius:8, background:`${ms.color||T.accent}15`, marginBottom:6 }}>
                          <span style={{ color:ms.color||T.accent, fontWeight:800 }}>◆</span>
                          <span style={{ fontSize:12, fontWeight:600, color:T.text }}>{ms.title}</span>
                          <span style={{ fontSize:10, color:T.text3, marginLeft:"auto" }}>{Math.round(ms.progress||0)}%</span>
                        </div>
                      ))}
                      {events.map(t => {
                        const proj = projects[t.project_id];
                        const isDone = t.status === "done";
                        return (
                          <div key={t.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 12px", borderRadius:8, background:T.surface2, marginBottom:6, border:`1px solid ${T.border}`, borderLeft:`3px solid ${PRIORITY_COLORS[t.priority]||"#6b7280"}`, opacity:isDone?0.5:1 }}>
                            <div style={{ flex:1 }}>
                              <div style={{ fontSize:13, fontWeight:500, textDecoration:isDone?"line-through":"none" }}>{t.title}</div>
                              {proj && <div style={{ fontSize:10, color:T.text3, marginTop:2, display:"flex", alignItems:"center", gap:4 }}>
                                <span style={{ width:6, height:6, borderRadius:3, background:proj.color||T.accent }} />{proj.name}
                              </div>}
                            </div>
                            <span style={{ fontSize:10, padding:"2px 7px", borderRadius:6, background:isDone?"#22c55e20":"#3b82f620", color:isDone?"#22c55e":"#3b82f6", fontWeight:600 }}>{isDone?"done":t.status.replace("_"," ")}</span>
                          </div>
                        );
                      })}
                      {/* Quick add */}
                      {addingTask === ds ? (
                        <div style={{ display:"flex", gap:6, marginTop:4 }}>
                          <input value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)}
                            onKeyDown={e => { if (e.key==="Enter") quickAddTask(ds); if (e.key==="Escape") { setAddingTask(null); setNewTaskTitle(""); } }}
                            placeholder="Task name…"
                            style={{ flex:1, padding:"6px 10px", borderRadius:6, border:`1px solid ${T.accent}`, background:T.surface2, color:T.text, fontSize:12, outline:"none" }} />
                          <button onClick={() => quickAddTask(ds)} style={{ padding:"6px 12px", borderRadius:6, background:T.accent, color:"#fff", border:"none", fontSize:12, cursor:"pointer", fontWeight:600 }}>Add</button>
                        </div>
                      ) : (
                        <button onClick={() => { setAddingTask(ds); setNewTaskTitle(""); }} style={{ fontSize:11, color:T.text3, background:"none", border:"none", cursor:"pointer", padding:"4px 0" }}
                          onMouseEnter={e => e.currentTarget.style.color=T.accent}
                          onMouseLeave={e => e.currentTarget.style.color=T.text3}>
                          + Add task
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Day sidebar */}
        {selectedDate && viewMode !== "agenda" && (
          <div style={{ width:300, borderLeft:`1px solid ${T.border}`, background:T.surface, flexShrink:0, overflow:"auto", display:"flex", flexDirection:"column" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 16px", borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
              <div>
                <div style={{ fontSize:14, fontWeight:700 }}>{new Date(selectedDate+"T12:00:00").toLocaleDateString("en-US",{weekday:"long",month:"long",day:"numeric"})}</div>
                <div style={{ fontSize:11, color:T.text3, marginTop:2 }}>{getEvents(selectedDate).length} tasks · {getMilestones(selectedDate).length} milestones</div>
              </div>
              <button onClick={() => setSelectedDate(null)} style={{ background:T.surface2, border:`1px solid ${T.border}`, color:T.text3, cursor:"pointer", width:28, height:28, borderRadius:6, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12 }}>×</button>
            </div>
            <div style={{ flex:1, overflow:"auto", padding:14 }}>
              {getMilestones(selectedDate).map(ms => (
                <div key={ms.id} style={{ padding:"8px 10px", borderRadius:8, marginBottom:6, background:`${ms.color||T.accent}15`, borderLeft:`3px solid ${ms.color||T.accent}` }}>
                  <div style={{ fontSize:12, fontWeight:700, color:ms.color||T.accent }}>◆ {ms.title}</div>
                  <div style={{ fontSize:10, color:T.text3, marginTop:2 }}>{ms.start_date} → {ms.end_date}</div>
                  <div style={{ height:3, borderRadius:2, background:T.surface3, marginTop:5, overflow:"hidden" }}>
                    <div style={{ width:`${ms.progress||0}%`, height:"100%", borderRadius:2, background:ms.color||T.accent }} />
                  </div>
                </div>
              ))}
              {getEvents(selectedDate).map(t => {
                const proj = projects[t.project_id];
                const isDone = t.status === "done";
                return (
                  <div key={t.id} style={{ padding:"9px 11px", borderRadius:8, marginBottom:6, background:T.surface2, border:`1px solid ${T.border}`, borderLeft:`3px solid ${PRIORITY_COLORS[t.priority]||"#6b7280"}`, opacity:isDone?0.5:1 }}>
                    <div style={{ fontSize:13, fontWeight:600, textDecoration:isDone?"line-through":"none", marginBottom:4 }}>{t.title}</div>
                    <div style={{ display:"flex", alignItems:"center", gap:8, fontSize:10, color:T.text3 }}>
                      {proj && <span style={{ display:"flex", alignItems:"center", gap:3 }}><span style={{ width:6, height:6, borderRadius:3, background:proj.color||T.accent }} />{proj.name}</span>}
                      <span style={{ padding:"1px 5px", borderRadius:4, background:isDone?"#22c55e20":"transparent", color:isDone?"#22c55e":T.text3 }}>{isDone?"✓ done":t.status.replace("_"," ")}</span>
                      {t.priority && t.priority!=="none" && <span style={{ color:PRIORITY_COLORS[t.priority] }}>{t.priority}</span>}
                    </div>
                  </div>
                );
              })}
              {getEvents(selectedDate).length === 0 && getMilestones(selectedDate).length === 0 && (
                <div style={{ color:T.text3, fontSize:12, textAlign:"center", padding:"20px 0" }}>Nothing scheduled</div>
              )}
              {/* Quick add */}
              {addingTask === selectedDate ? (
                <div style={{ display:"flex", gap:6, marginTop:8 }}>
                  <input value={newTaskTitle} onChange={e => setNewTaskTitle(e.target.value)}
                    onKeyDown={e => { if (e.key==="Enter") quickAddTask(selectedDate); if (e.key==="Escape") { setAddingTask(null); setNewTaskTitle(""); } }}
                    placeholder="New task…"
                    style={{ flex:1, padding:"6px 8px", borderRadius:6, border:`1px solid ${T.accent}`, background:T.surface2, color:T.text, fontSize:12, outline:"none" }} />
                  <button onClick={() => quickAddTask(selectedDate)} style={{ padding:"6px 10px", borderRadius:6, background:T.accent, color:"#fff", border:"none", fontSize:12, cursor:"pointer" }}>Add</button>
                </div>
              ) : (
                <button onClick={() => { setAddingTask(selectedDate); setNewTaskTitle(""); }} style={{ marginTop:8, width:"100%", padding:"7px 0", borderRadius:7, border:`1px dashed ${T.border}`, background:"transparent", color:T.text3, fontSize:12, cursor:"pointer" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor=T.accent; e.currentTarget.style.color=T.accent; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor=T.border; e.currentTarget.style.color=T.text3; }}>
                  + Add task
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
