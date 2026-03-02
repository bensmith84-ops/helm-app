"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";
import { useAuth } from "../lib/auth";

const AVATAR_COLORS = ["#3b82f6","#a855f7","#ec4899","#06b6d4","#f97316","#22c55e","#84cc16","#ef4444"];
const acol = (uid) => uid ? AVATAR_COLORS[uid.charCodeAt(uid.length-1)%AVATAR_COLORS.length] : T.text3;
const HEALTH = { on_track: { label: "On Track", color: "#22c55e", bg: "#0d3a20" }, at_risk: { label: "At Risk", color: "#eab308", bg: "#3d3000" }, off_track: { label: "Off Track", color: "#ef4444", bg: "#3d1111" } };

export default function DashboardView({ setActive }) {
  const { profile } = useAuth();
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [objectives, setObjectives] = useState([]);
  const [keyResults, setKeyResults] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: p }, { data: t }, { data: prof }, { data: obj }, { data: kr }, { data: cyc }] = await Promise.all([
        supabase.from("projects").select("*").is("deleted_at", null).order("name"),
        supabase.from("tasks").select("*").is("deleted_at", null),
        supabase.from("profiles").select("id,display_name"),
        supabase.from("objectives").select("*").is("deleted_at", null).order("sort_order"),
        supabase.from("key_results").select("*").is("deleted_at", null).order("sort_order"),
        supabase.from("okr_cycles").select("*").order("start_date", { ascending: false }),
      ]);
      setProjects(p || []); setTasks(t || []);
      const m = {}; (prof || []).forEach(u => { m[u.id] = u; }); setProfiles(m);
      setCycles(cyc || []);
      // Get active cycle objectives
      const activeCycle = (cyc || []).find(c => c.status === "active") || cyc?.[0];
      const cycleObjs = activeCycle ? (obj || []).filter(o => o.cycle_id === activeCycle.id) : (obj || []);
      setObjectives(cycleObjs);
      const cycleKRs = (kr || []).filter(k => cycleObjs.some(o => o.id === k.objective_id));
      setKeyResults(cycleKRs);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div style={{ display:"flex",height:"100%",alignItems:"center",justifyContent:"center",color:T.text3,fontSize:13 }}>Loading dashboard…</div>;

  const now = new Date();
  const greet = now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";
  const dateStr = now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const ini = (uid) => { const u = profiles[uid]; return u?.display_name ? u.display_name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() : "?"; };
  const uname = (uid) => profiles[uid]?.display_name || "Unknown";

  // Task stats
  const totalTasks = tasks.length;
  const doneTasks = tasks.filter(t => t.status === "done").length;
  const overdue = tasks.filter(t => t.due_date && new Date(t.due_date) < now && t.status !== "done").length;
  const todayStr = now.toISOString().split("T")[0];

  // OKR stats
  const overallProgress = objectives.length > 0 ? Math.round(objectives.reduce((s, o) => s + Number(o.progress || 0), 0) / objectives.length) : 0;
  const onTrackCount = objectives.filter(o => o.health === "on_track").length;
  const atRiskCount = objectives.filter(o => o.health === "at_risk").length;
  const offTrackCount = objectives.filter(o => o.health === "off_track").length;
  const activeCycle = cycles.find(c => c.status === "active") || cycles[0];
  const daysLeft = activeCycle ? Math.max(0, Math.ceil((new Date(activeCycle.end_date) - now) / 86400000)) : 0;
  const totalDays = activeCycle ? Math.max(1, Math.ceil((new Date(activeCycle.end_date) - new Date(activeCycle.start_date)) / 86400000)) : 1;
  const timeElapsedPct = Math.round(((totalDays - daysLeft) / totalDays) * 100);

  const Ring = ({ pct, size = 80, stroke = 6, color = T.accent }) => (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={(size-stroke)/2} fill="none" stroke={T.surface3} strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={(size-stroke)/2} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${pct * ((size-stroke)*Math.PI)/100} ${(size-stroke)*Math.PI}`}
        strokeLinecap="round" style={{ transition: "stroke-dasharray 0.8s ease" }} />
    </svg>
  );

  const projStats = projects.map(p => {
    const pt = tasks.filter(t => t.project_id === p.id); const pd = pt.filter(t => t.status === "done").length;
    return { ...p, total: pt.length, done: pd, pct: pt.length > 0 ? Math.round((pd / pt.length) * 100) : 0 };
  });

  return (
    <div style={{ padding: "28px 32px", overflow: "auto", maxWidth: 1200 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4, lineHeight: 1.2 }}>{greet}, {profile?.display_name || "there"}</h1>
        <p style={{ color: T.text3, fontSize: 13 }}>{dateStr}{activeCycle ? ` · ${activeCycle.name} — ${daysLeft} days remaining` : ""}</p>
      </div>

      {/* ====== OKR HERO SECTION ====== */}
      <div style={{ background: T.surface, borderRadius: 16, border: `1px solid ${T.border}`, padding: 24, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 16 }}>◎</span>
            <span style={{ fontSize: 17, fontWeight: 700 }}>Company Objectives</span>
            {activeCycle && <span style={{ fontSize: 11, padding: "2px 10px", borderRadius: 6, background: T.accentDim, color: T.accent, fontWeight: 600 }}>{activeCycle.name}</span>}
          </div>
          <button onClick={() => setActive("okrs")} style={{ background: "none", border: "none", color: T.accent, fontSize: 12, cursor: "pointer", fontWeight: 500 }}>View OKRs →</button>
        </div>

        {/* Progress ring + stats row */}
        <div style={{ display: "flex", gap: 24, marginBottom: 24, alignItems: "center" }}>
          <div style={{ position: "relative", flexShrink: 0 }}>
            <Ring pct={overallProgress} size={90} stroke={7} color={overallProgress >= 60 ? "#22c55e" : overallProgress >= 30 ? "#eab308" : T.accent} />
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
              <span style={{ fontSize: 22, fontWeight: 800, color: T.text, lineHeight: 1 }}>{overallProgress}%</span>
              <span style={{ fontSize: 9, color: T.text3, marginTop: 2 }}>overall</span>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, flex: 1 }}>
            {[
              { label: "On Track", value: onTrackCount, color: "#22c55e", bgc: "#0d3a20" },
              { label: "At Risk", value: atRiskCount, color: "#eab308", bgc: "#3d3000" },
              { label: "Off Track", value: offTrackCount, color: "#ef4444", bgc: "#3d1111" },
              { label: "Time Elapsed", value: `${timeElapsedPct}%`, color: T.text2, bgc: T.surface2 },
            ].map(s => (
              <div key={s.label} style={{ padding: "12px 14px", borderRadius: 10, background: s.bgc, textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.color, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 10, color: T.text3, marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Objective cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {objectives.map(obj => {
            const objKRs = keyResults.filter(k => k.objective_id === obj.id);
            const pct = Math.round(Number(obj.progress || 0));
            const h = HEALTH[obj.health] || HEALTH.on_track;
            return (
              <div key={obj.id} onClick={() => setActive("okrs")} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderRadius: 10, background: T.surface2, border: `1px solid ${T.border}`, cursor: "pointer", transition: "border-color 0.15s" }} onMouseEnter={e => e.currentTarget.style.borderColor = T.accent + "40"} onMouseLeave={e => e.currentTarget.style.borderColor = T.border}>
                {/* Health dot */}
                <div style={{ width: 10, height: 10, borderRadius: 10, background: h.color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{obj.title}</div>
                  <div style={{ fontSize: 11, color: T.text3 }}>{objKRs.length} key results · {h.label}</div>
                </div>
                {/* Mini progress bar */}
                <div style={{ width: 120, flexShrink: 0 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                    <span style={{ fontSize: 10, color: T.text3 }}>Progress</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: h.color }}>{pct}%</span>
                  </div>
                  <div style={{ height: 5, borderRadius: 5, background: T.surface3, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", borderRadius: 5, background: h.color, transition: "width 0.5s" }} />
                  </div>
                </div>
              </div>
            );
          })}
          {objectives.length === 0 && <div style={{ textAlign: "center", padding: 24, color: T.text3 }}><div style={{ fontSize: 13, marginBottom: 6 }}>No objectives yet</div><button onClick={() => setActive("okrs")} style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: T.accent, color: "#fff", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>Set up OKRs</button></div>}
        </div>
      </div>

      {/* ====== MY TASKS ====== */}
      {(() => {
        const myTasks = tasks.filter(t => t.assignee_id === profile?.id && t.status !== "done" && !t.parent_task_id)
          .sort((a, b) => { if (!a.due_date && !b.due_date) return 0; if (!a.due_date) return 1; if (!b.due_date) return -1; return new Date(a.due_date) - new Date(b.due_date); }).slice(0, 6);
        if (myTasks.length === 0) return null;
        return (
          <div style={{ background: T.surface, borderRadius: 14, border: `1px solid ${T.border}`, padding: 20, marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 14 }}>👤</span><span style={{ fontSize: 15, fontWeight: 700 }}>My Tasks</span><span style={{ fontSize: 11, color: T.text3 }}>{myTasks.length} open</span></div>
              <button onClick={() => setActive("projects")} style={{ background: "none", border: "none", color: T.accent, fontSize: 12, cursor: "pointer", fontWeight: 500 }}>View all →</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 8 }}>
              {myTasks.map(t => {
                const proj = projects.find(p => p.id === t.project_id);
                const isOverdue = t.due_date && t.due_date < todayStr; const isToday = t.due_date === todayStr;
                const priColors = { urgent: "#ef4444", high: "#f97316", medium: "#eab308", low: "#22c55e" };
                return (
                  <div key={t.id} onClick={() => setActive("projects")} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, background: T.surface2, border: `1px solid ${T.border}`, cursor: "pointer", borderLeft: `3px solid ${priColors[t.priority] || T.text3}` }}>
                    <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div><div style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>{proj?.name || "—"} · {t.status.replace("_", " ")}</div></div>
                    {t.due_date && <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4, flexShrink: 0, background: isOverdue ? "#ef444420" : isToday ? `${T.accent}20` : T.surface3, color: isOverdue ? "#ef4444" : isToday ? T.accent : T.text3 }}>
                      {isToday ? "Today" : isOverdue ? `${Math.ceil((now - new Date(t.due_date)) / 86400000)}d late` : new Date(t.due_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </span>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ====== OVERDUE ALERT ====== */}
      {overdue > 0 && (() => {
        const overdueTasks = tasks.filter(t => t.due_date && new Date(t.due_date) < now && t.status !== "done").sort((a, b) => new Date(a.due_date) - new Date(b.due_date)).slice(0, 5);
        return (
          <div style={{ background: "#ef444408", borderRadius: 14, border: "1px solid #ef444420", padding: 20, marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}><span style={{ fontSize: 14 }}>🚨</span><span style={{ fontSize: 15, fontWeight: 700, color: "#ef4444" }}>Overdue Tasks</span><span style={{ fontSize: 11, color: T.text3, marginLeft: 4 }}>{overdue} total</span></div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {overdueTasks.map(t => { const proj = projects.find(p => p.id === t.project_id); const daysLate = Math.ceil((now - new Date(t.due_date)) / 86400000); return (
                <div key={t.id} onClick={() => setActive("projects")} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 8, background: T.surface, border: `1px solid ${T.border}`, cursor: "pointer" }}>
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div><div style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>{proj?.name || "—"}</div></div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#ef4444", flexShrink: 0 }}>{daysLate}d late</span>
                </div>); })}
            </div>
          </div>
        );
      })()}

      {/* ====== TWO-COLUMN LOWER SECTION ====== */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 20 }}>
        {/* Projects progress */}
        <div style={{ background: T.surface, borderRadius: 14, border: `1px solid ${T.border}`, padding: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <span style={{ fontSize: 15, fontWeight: 700 }}>Projects</span>
            <button onClick={() => setActive("projects")} style={{ background: "none", border: "none", color: T.accent, fontSize: 12, cursor: "pointer", fontWeight: 500 }}>View all →</button>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {projStats.slice(0, 6).map(p => (
              <div key={p.id} onClick={() => setActive("projects")} style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 12px", borderRadius: 10, background: T.surface2, cursor: "pointer" }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: p.color || T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, color: "#fff" }}>{p.name.charAt(0)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 5 }}>{p.name}</div>
                  <div style={{ height: 4, borderRadius: 4, background: T.surface3, overflow: "hidden" }}><div style={{ width: `${p.pct}%`, height: "100%", borderRadius: 4, background: p.color || T.accent, transition: "width 0.6s" }} /></div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}><div style={{ fontSize: 16, fontWeight: 700, color: p.pct >= 50 ? T.green : T.text2 }}>{p.pct}%</div><div style={{ fontSize: 10, color: T.text3 }}>{p.done}/{p.total}</div></div>
              </div>
            ))}
            {projStats.length === 0 && <div style={{ fontSize: 12, color: T.text3, padding: 12 }}>No projects yet</div>}
          </div>
        </div>

        {/* Team workload */}
        <div style={{ background: T.surface, borderRadius: 14, border: `1px solid ${T.border}`, padding: 20 }}>
          <span style={{ fontSize: 15, fontWeight: 700, display: "block", marginBottom: 16 }}>Team Workload</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {(() => {
              const assigneeCounts = {};
              tasks.filter(t => t.assignee_id && t.status !== "done").forEach(t => { assigneeCounts[t.assignee_id] = (assigneeCounts[t.assignee_id] || 0) + 1; });
              const topAssignees = Object.entries(assigneeCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
              const maxW = topAssignees.length > 0 ? topAssignees[0][1] : 1;
              return topAssignees.length > 0 ? topAssignees.map(([uid, count]) => {
                const c = acol(uid);
                return (
                  <div key={uid} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 28, height: 28, borderRadius: 14, background: `${c}18`, border: `1.5px solid ${c}50`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: c, flexShrink: 0 }}>{ini(uid)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{uname(uid)}</div>
                      <div style={{ height: 6, borderRadius: 6, background: T.surface3, overflow: "hidden" }}><div style={{ width: `${(count / maxW) * 100}%`, height: "100%", borderRadius: 6, background: count > maxW * 0.8 ? T.red : c }} /></div>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 600, color: T.text2, minWidth: 32, textAlign: "right" }}>{count}</span>
                  </div>
                );
              }) : <div style={{ fontSize: 12, color: T.text3, padding: 12 }}>No assigned tasks</div>;
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
