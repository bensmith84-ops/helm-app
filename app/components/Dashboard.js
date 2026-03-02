"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";
import { useAuth } from "../lib/auth";

const AVATAR_COLORS = ["#3b82f6","#a855f7","#ec4899","#06b6d4","#f97316","#22c55e","#84cc16","#ef4444"];
const acol = (uid) => uid ? AVATAR_COLORS[uid.charCodeAt(uid.length-1)%AVATAR_COLORS.length] : T.text3;

export default function DashboardView({ setActive }) {
  const { profile } = useAuth();
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: p }, { data: t }, { data: prof }] = await Promise.all([
        supabase.from("projects").select("*").is("deleted_at", null).order("name"),
        supabase.from("tasks").select("*").is("deleted_at", null),
        supabase.from("profiles").select("id,display_name"),
      ]);
      setProjects(p || []);
      setTasks(t || []);
      const m = {}; (prof || []).forEach(u => { m[u.id] = u; }); setProfiles(m);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div style={{ display:"flex",height:"100%",alignItems:"center",justifyContent:"center",color:T.text3,fontSize:13 }}>Loading dashboard…</div>;

  const now = new Date();
  const greet = now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.status === "done").length;
  const overdue = tasks.filter(t => t.due_date && new Date(t.due_date) < now && t.status !== "done").length;
  const inProgress = tasks.filter(t => t.status === "in_progress").length;
  const completionPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const projStats = projects.map(p => {
    const pt = tasks.filter(t => t.project_id === p.id);
    const pd = pt.filter(t => t.status === "done").length;
    return { ...p, total: pt.length, done: pd, pct: pt.length > 0 ? Math.round((pd / pt.length) * 100) : 0 };
  });

  const recentTasks = [...tasks].sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)).slice(0, 8);

  const assigneeCounts = {};
  tasks.filter(t => t.assignee_id && t.status !== "done").forEach(t => { assigneeCounts[t.assignee_id] = (assigneeCounts[t.assignee_id] || 0) + 1; });
  const topAssignees = Object.entries(assigneeCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxWorkload = topAssignees.length > 0 ? topAssignees[0][1] : 1;

  const priCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  tasks.filter(t => t.status !== "done").forEach(t => { if (t.priority && priCounts[t.priority] !== undefined) priCounts[t.priority]++; });

  const ini = (uid) => { const u = profiles[uid]; return u?.display_name ? u.display_name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() : "?"; };
  const uname = (uid) => profiles[uid]?.display_name || "Unknown";

  const Ring = ({ pct, size = 44, stroke = 4, color = T.green }) => (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={(size-stroke)/2} fill="none" stroke={T.surface3} strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={(size-stroke)/2} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${pct * ((size-stroke)*Math.PI)/100} ${(size-stroke)*Math.PI}`}
        strokeLinecap="round" style={{ transition: "stroke-dasharray 0.8s ease" }} />
    </svg>
  );

  const StatCard = ({ label, value, sub, color, icon }) => (
    <div style={{ padding: "18px 20px", background: T.surface, borderRadius: 12, border: `1px solid ${T.border}`, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: -10, right: -10, width: 60, height: 60, borderRadius: 60, background: `${color}08` }} />
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
        <div style={{ width: 32, height: 32, borderRadius: 8, background: `${color}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill={color}>{icon}</svg>
        </div>
        <span style={{ fontSize: 11, color: T.text3, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: T.text3, marginTop: 6 }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ padding: "28px 32px", overflow: "auto", maxWidth: 1200 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4, lineHeight: 1.2 }}>{greet}, {profile?.display_name || "there"}</h1>
        <p style={{ color: T.text3, fontSize: 13 }}>{dateStr} — Here&apos;s your workspace at a glance.</p>
      </div>

      {/* Quick Actions */}
      <div style={{ display: "flex", gap: 10, marginBottom: 22, flexWrap: "wrap" }}>
        {[
          { label: "New Task", icon: "☐", mod: "projects" },
          { label: "New Doc", icon: "📄", mod: "docs" },
          { label: "Schedule Call", icon: "📞", mod: "calls" },
          { label: "View Reports", icon: "📊", mod: "reports" },
        ].map(a => (
          <button key={a.label} onClick={() => setActive(a.mod)} style={{
            display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8,
            border: `1px solid ${T.border}`, background: T.surface, color: T.text2, fontSize: 12,
            fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
          }}>
            <span>{a.icon}</span>{a.label}
          </button>
        ))}
      </div>

      {/* My Tasks — assigned to current user, not done, sorted by due date */}
      {(() => {
        const myTasks = tasks.filter(t => t.assignee_id === profile?.id && t.status !== "done" && !t.parent_task_id)
          .sort((a, b) => {
            if (!a.due_date && !b.due_date) return 0;
            if (!a.due_date) return 1;
            if (!b.due_date) return -1;
            return new Date(a.due_date) - new Date(b.due_date);
          }).slice(0, 6);
        if (myTasks.length === 0) return null;
        const today = now.toISOString().split("T")[0];
        return (
          <div style={{ background: T.surface, borderRadius: 14, border: `1px solid ${T.border}`, padding: 20, marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14 }}>👤</span>
                <span style={{ fontSize: 15, fontWeight: 700 }}>My Tasks</span>
                <span style={{ fontSize: 11, color: T.text3 }}>{myTasks.length} open</span>
              </div>
              <button onClick={() => setActive("projects")} style={{ background: "none", border: "none", color: T.accent, fontSize: 12, cursor: "pointer", fontWeight: 500 }}>View all →</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 8 }}>
              {myTasks.map(t => {
                const proj = projects.find(p => p.id === t.project_id);
                const isOverdue = t.due_date && t.due_date < today;
                const isToday = t.due_date === today;
                const priColors = { urgent: "#ef4444", high: "#f97316", medium: "#eab308", low: "#22c55e" };
                return (
                  <div key={t.id} onClick={() => setActive("projects")} style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8,
                    background: T.surface2, border: `1px solid ${T.border}`, cursor: "pointer",
                    borderLeft: `3px solid ${priColors[t.priority] || T.text3}`,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                      <div style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>{proj?.name || "—"} · {t.status.replace("_", " ")}</div>
                    </div>
                    {t.due_date && (
                      <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4, flexShrink: 0,
                        background: isOverdue ? "#ef444420" : isToday ? `${T.accent}20` : T.surface3,
                        color: isOverdue ? "#ef4444" : isToday ? T.accent : T.text3,
                      }}>
                        {isToday ? "Today" : isOverdue ? `${Math.ceil((now - new Date(t.due_date)) / 86400000)}d late` : new Date(t.due_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 28 }}>
        <StatCard label="Active Projects" value={projects.length} sub={`${projStats.filter(p=>p.pct>=50).length} past halfway`} color={T.accent}
          icon={<><rect x="1" y="1" width="6" height="14" rx="1"/><rect x="9" y="5" width="6" height="10" rx="1"/></>} />
        <StatCard label="Open Tasks" value={totalTasks - doneTasks} sub={`${overdue} overdue`} color={overdue > 0 ? T.red : T.yellow}
          icon={<><rect x="2" y="2" width="12" height="2" rx="1"/><rect x="2" y="7" width="12" height="2" rx="1"/><rect x="2" y="12" width="8" height="2" rx="1"/></>} />
        <StatCard label="Completion" value={`${completionPct}%`} sub={`${doneTasks} of ${totalTasks} tasks`} color={T.green}
          icon={<path d="M2 8l4 4 8-8" fill="none" stroke={T.green} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>} />
        <StatCard label="In Progress" value={inProgress} sub="Actively being worked" color={T.accent}
          icon={<circle cx="8" cy="8" r="6" fill="none" stroke={T.accent} strokeWidth="2" strokeDasharray="8 4"/>} />
      </div>

      {/* Overdue Tasks */}
      {overdue > 0 && (() => {
        const overdueTasks = tasks.filter(t => t.due_date && new Date(t.due_date) < now && t.status !== "done").sort((a, b) => new Date(a.due_date) - new Date(b.due_date)).slice(0, 5);
        return (
          <div style={{ background: "#ef444408", borderRadius: 14, border: "1px solid #ef444420", padding: 20, marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 14 }}>🚨</span>
              <span style={{ fontSize: 15, fontWeight: 700, color: "#ef4444" }}>Overdue Tasks</span>
              <span style={{ fontSize: 11, color: T.text3, marginLeft: 4 }}>{overdue} total</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {overdueTasks.map(t => {
                const proj = projects.find(p => p.id === t.project_id);
                const daysLate = Math.ceil((now - new Date(t.due_date)) / (1000 * 60 * 60 * 24));
                return (
                  <div key={t.id} onClick={() => setActive("projects")} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, background: T.surface, border: `1px solid ${T.border}`, cursor: "pointer" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                      <div style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>{proj?.name || "—"}</div>
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "#ef4444", flexShrink: 0 }}>{daysLate}d late</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Upcoming deadlines (next 7 days, not overdue) */}
      {(() => {
        const todayStr = now.toISOString().split("T")[0];
        const nextWeek = new Date(now); nextWeek.setDate(nextWeek.getDate() + 7);
        const nextWeekStr = nextWeek.toISOString().split("T")[0];
        const upcoming = tasks.filter(t => t.due_date && t.due_date >= todayStr && t.due_date <= nextWeekStr && t.status !== "done" && !t.parent_task_id)
          .sort((a, b) => a.due_date.localeCompare(b.due_date)).slice(0, 6);
        if (upcoming.length === 0) return null;
        return (
          <div style={{ background: T.surface, borderRadius: 14, border: `1px solid ${T.border}`, padding: 20, marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <span style={{ fontSize: 14 }}>📅</span>
              <span style={{ fontSize: 15, fontWeight: 700 }}>Due This Week</span>
              <span style={{ fontSize: 11, color: T.text3 }}>{upcoming.length} tasks</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 6 }}>
              {upcoming.map(t => {
                const proj = projects.find(p => p.id === t.project_id);
                const isToday = t.due_date === todayStr;
                const priColors = { urgent: "#ef4444", high: "#f97316", medium: "#eab308", low: "#22c55e" };
                return (
                  <div key={t.id} onClick={() => setActive("projects")} style={{
                    display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8,
                    background: T.surface2, border: `1px solid ${T.border}`, cursor: "pointer",
                    borderLeft: `3px solid ${priColors[t.priority] || T.text3}`,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                      <div style={{ fontSize: 10, color: T.text3, marginTop: 1 }}>{proj?.name || "—"}</div>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4, flexShrink: 0,
                      background: isToday ? `${T.accent}20` : T.surface3,
                      color: isToday ? T.accent : T.text3,
                    }}>
                      {isToday ? "Today" : new Date(t.due_date + "T12:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 20, marginBottom: 28 }}>
        <div style={{ background: T.surface, borderRadius: 14, border: `1px solid ${T.border}`, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>Projects</span>
            <button onClick={() => setActive("projects")} style={{ background: "none", border: "none", color: T.accent, fontSize: 12, cursor: "pointer", fontWeight: 500 }}>View all →</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {projStats.map(p => (
              <div key={p.id} onClick={() => setActive("projects")} style={{
                display: "flex", alignItems: "center", gap: 14, padding: "10px 12px",
                borderRadius: 10, background: T.surface2, cursor: "pointer", transition: "background 0.15s",
              }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: p.color || T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: "#fff" }}>
                  {p.name.charAt(0)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 5 }}>{p.name}</div>
                  <div style={{ height: 4, borderRadius: 4, background: T.surface3, overflow: "hidden" }}>
                    <div style={{ width: `${p.pct}%`, height: "100%", borderRadius: 4, background: p.color || T.accent, transition: "width 0.6s" }} />
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: p.pct >= 50 ? T.green : T.text2 }}>{p.pct}%</div>
                  <div style={{ fontSize: 10, color: T.text3 }}>{p.done}/{p.total}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ background: T.surface, borderRadius: 14, border: `1px solid ${T.border}`, padding: 20 }}>
          <span style={{ fontSize: 15, fontWeight: 700, display: "block", marginBottom: 16 }}>Recent Activity</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {recentTasks.map(task => {
              const proj = projects.find(p => p.id === task.project_id);
              const isDone = task.status === "done";
              return (
                <div key={task.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 6px", borderRadius: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 8, flexShrink: 0, background: isDone ? T.green : task.status === "in_progress" ? T.accent : T.text3 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: isDone ? T.text3 : T.text, textDecoration: isDone ? "line-through" : "none" }}>{task.title}</div>
                    <div style={{ fontSize: 10, color: T.text3, marginTop: 1 }}>{proj?.name}{task.assignee_id ? ` · ${uname(task.assignee_id)}` : ""}</div>
                  </div>
                  {task.updated_at && <span style={{ fontSize: 10, color: T.text3, flexShrink: 0 }}>{new Date(task.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 20 }}>
        <div style={{ background: T.surface, borderRadius: 14, border: `1px solid ${T.border}`, padding: 20 }}>
          <span style={{ fontSize: 15, fontWeight: 700, display: "block", marginBottom: 16 }}>Team Workload</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {topAssignees.map(([uid, count]) => {
              const c = acol(uid);
              return (
                <div key={uid} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 14, background: `${c}18`, border: `1.5px solid ${c}50`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: c, flexShrink: 0 }}>{ini(uid)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{uname(uid)}</div>
                    <div style={{ height: 6, borderRadius: 6, background: T.surface3, overflow: "hidden" }}>
                      <div style={{ width: `${(count / maxWorkload) * 100}%`, height: "100%", borderRadius: 6, background: count > maxWorkload * 0.8 ? T.red : c, transition: "width 0.5s" }} />
                    </div>
                  </div>
                  <span style={{ fontSize: 12, fontWeight: 600, color: T.text2, minWidth: 32, textAlign: "right" }}>{count}</span>
                </div>
              );
            })}
            {topAssignees.length === 0 && <div style={{ fontSize: 12, color: T.text3, padding: 12 }}>No assigned tasks</div>}
          </div>
        </div>

        <div style={{ background: T.surface, borderRadius: 14, border: `1px solid ${T.border}`, padding: 20 }}>
          <span style={{ fontSize: 15, fontWeight: 700, display: "block", marginBottom: 16 }}>Priority Breakdown</span>
          <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
            <div style={{ position: "relative", width: 100, height: 100, flexShrink: 0 }}>
              <Ring pct={completionPct} size={100} stroke={8} color={T.green} />
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
                <span style={{ fontSize: 20, fontWeight: 800, color: T.green, lineHeight: 1 }}>{completionPct}%</span>
                <span style={{ fontSize: 9, color: T.text3 }}>complete</span>
              </div>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                { key: "critical", label: "Critical", color: "#ef4444" },
                { key: "high", label: "High", color: "#f97316" },
                { key: "medium", label: "Medium", color: "#eab308" },
                { key: "low", label: "Low", color: "#22c55e" },
              ].map(p => {
                const total = Object.values(priCounts).reduce((s, v) => s + v, 0) || 1;
                return (
                  <div key={p.key} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 8, background: p.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 11, color: T.text2, width: 52 }}>{p.label}</span>
                    <div style={{ flex: 1, height: 6, borderRadius: 6, background: T.surface3, overflow: "hidden" }}>
                      <div style={{ width: `${(priCounts[p.key] / total) * 100}%`, height: "100%", borderRadius: 6, background: p.color, transition: "width 0.5s" }} />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: T.text2, minWidth: 20, textAlign: "right" }}>{priCounts[p.key]}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}