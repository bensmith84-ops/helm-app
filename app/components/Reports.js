"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";

const STATUS_COLORS = {
  backlog: "#6b7280", todo: "#8b93a8", in_progress: "#3b82f6",
  in_review: "#a855f7", done: "#22c55e", cancelled: "#ef4444",
};

export default function ReportsView() {
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("overview");

  useEffect(() => {
    (async () => {
      const [{ data: p }, { data: t }, { data: prof }] = await Promise.all([
        supabase.from("projects").select("*").is("deleted_at", null),
        supabase.from("tasks").select("*").is("deleted_at", null),
        supabase.from("profiles").select("id,display_name"),
      ]);
      setProjects(p || []); setTasks(t || []);
      const m = {}; (prof || []).forEach(u => { m[u.id] = u; }); setProfiles(m);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: T.text3, fontSize: 13 }}>Loading reports…</div>;

  const total = tasks.length;
  const done = tasks.filter(t => t.status === "done").length;
  const overdue = tasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== "done").length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  // Status distribution
  const statusCounts = {};
  tasks.filter(t => !t.parent_task_id).forEach(t => { statusCounts[t.status] = (statusCounts[t.status] || 0) + 1; });

  // Priority distribution
  const priCounts = {};
  tasks.filter(t => !t.parent_task_id && t.status !== "done").forEach(t => { priCounts[t.priority || "none"] = (priCounts[t.priority || "none"] || 0) + 1; });

  // Per-project stats
  const projStats = projects.map(p => {
    const pt = tasks.filter(t => t.project_id === p.id && !t.parent_task_id);
    const pd = pt.filter(t => t.status === "done").length;
    return { ...p, total: pt.length, done: pd, pct: pt.length > 0 ? Math.round((pd / pt.length) * 100) : 0, overdue: pt.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== "done").length };
  }).sort((a, b) => b.total - a.total);

  // Assignee workload
  const assigneeCounts = {};
  tasks.filter(t => t.assignee_id && t.status !== "done" && !t.parent_task_id).forEach(t => {
    assigneeCounts[t.assignee_id] = (assigneeCounts[t.assignee_id] || 0) + 1;
  });
  const topAssignees = Object.entries(assigneeCounts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const maxWork = topAssignees[0]?.[1] || 1;

  // Tasks created per day (last 14 days)
  const daysBack = 14;
  const dayLabels = [];
  const dayCounts = [];
  for (let i = daysBack - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const ds = d.toISOString().split("T")[0];
    dayLabels.push(d.toLocaleDateString("en-US", { month: "short", day: "numeric" }));
    dayCounts.push(tasks.filter(t => t.created_at?.startsWith(ds)).length);
  }
  const maxDay = Math.max(...dayCounts, 1);

  const Bar = ({ value, max, color, label, count }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
      <span style={{ fontSize: 11, color: T.text2, width: 80, textAlign: "right" }}>{label}</span>
      <div style={{ flex: 1, height: 20, background: T.surface3, borderRadius: 4, overflow: "hidden" }}>
        <div style={{ width: `${max > 0 ? (value / max) * 100 : 0}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.4s" }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 600, color: T.text, width: 30 }}>{count}</span>
    </div>
  );

  const Card = ({ title, children }) => (
    <div style={{ background: T.surface, borderRadius: 12, border: `1px solid ${T.border}`, padding: 20 }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>{title}</div>
      {children}
    </div>
  );

  const StatBox = ({ label, value, color }) => (
    <div style={{ padding: "16px 20px", background: T.surface, borderRadius: 10, border: `1px solid ${T.border}`, textAlign: "center" }}>
      <div style={{ fontSize: 28, fontWeight: 800, color: color || T.text, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 11, color: T.text3, marginTop: 6 }}>{label}</div>
    </div>
  );

  return (
    <div style={{ padding: "28px 32px", overflow: "auto", maxWidth: 1200 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 800 }}>Reports</h1>
        <div style={{ display: "flex", gap: 4 }}>
          {["overview", "projects", "workload"].map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              padding: "6px 14px", fontSize: 12, fontWeight: 600, borderRadius: 6, cursor: "pointer",
              background: view === v ? `${T.accent}20` : T.surface2, color: view === v ? T.accent : T.text3,
              border: `1px solid ${view === v ? T.accent + "40" : T.border}`,
            }}>{v.charAt(0).toUpperCase() + v.slice(1)}</button>
          ))}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 12, marginBottom: 24 }}>
        <StatBox label="Total Tasks" value={total} />
        <StatBox label="Completed" value={done} color={T.green} />
        <StatBox label="Completion %" value={`${pct}%`} color={pct >= 70 ? T.green : pct >= 40 ? T.yellow : T.text} />
        <StatBox label="Overdue" value={overdue} color={overdue > 0 ? "#ef4444" : T.text3} />
        <StatBox label="Projects" value={projects.length} color={T.accent} />
      </div>

      {view === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: 20 }}>
          <Card title="Status Distribution">
            {Object.entries(STATUS_COLORS).map(([k, c]) => (
              <Bar key={k} label={k.replace("_", " ")} value={statusCounts[k] || 0} max={total} color={c} count={statusCounts[k] || 0} />
            ))}
          </Card>
          <Card title="Task Creation (Last 14 Days)">
            <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 120 }}>
              {dayCounts.map((c, i) => (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                  <span style={{ fontSize: 8, color: T.text3 }}>{c > 0 ? c : ""}</span>
                  <div style={{ width: "100%", height: `${(c / maxDay) * 100}px`, background: T.accent, borderRadius: 2, minHeight: c > 0 ? 4 : 0 }} />
                  <span style={{ fontSize: 7, color: T.text3, transform: "rotate(-45deg)", transformOrigin: "top left", whiteSpace: "nowrap" }}>{i % 2 === 0 ? dayLabels[i] : ""}</span>
                </div>
              ))}
            </div>
          </Card>
          <Card title="Priority Breakdown">
            {[
              { k: "urgent", l: "Urgent", c: "#ef4444" }, { k: "high", l: "High", c: "#f97316" },
              { k: "medium", l: "Medium", c: "#eab308" }, { k: "low", l: "Low", c: "#22c55e" },
              { k: "none", l: "None", c: "#6b7280" },
            ].map(p => <Bar key={p.k} label={p.l} value={priCounts[p.k] || 0} max={total} color={p.c} count={priCounts[p.k] || 0} />)}
          </Card>
        </div>
      )}

      {view === "projects" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {projStats.map(p => (
            <div key={p.id} style={{ background: T.surface, borderRadius: 10, border: `1px solid ${T.border}`, padding: "16px 20px", display: "flex", alignItems: "center", gap: 16 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: p.color || T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: "#fff" }}>{p.name.charAt(0)}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{p.name}</div>
                <div style={{ height: 6, borderRadius: 6, background: T.surface3, overflow: "hidden" }}>
                  <div style={{ width: `${p.pct}%`, height: "100%", borderRadius: 6, background: p.color || T.accent }} />
                </div>
              </div>
              <div style={{ textAlign: "right", minWidth: 80 }}>
                <div style={{ fontSize: 18, fontWeight: 700, color: p.pct >= 50 ? T.green : T.text2 }}>{p.pct}%</div>
                <div style={{ fontSize: 10, color: T.text3 }}>{p.done}/{p.total} done{p.overdue > 0 ? ` · ${p.overdue} overdue` : ""}</div>
              </div>
            </div>
          ))}
          {projStats.length === 0 && <div style={{ textAlign: "center", color: T.text3, padding: 40 }}>No projects</div>}
        </div>
      )}

      {view === "workload" && (
        <Card title="Team Workload (Open Tasks)">
          {topAssignees.map(([uid, count]) => (
            <Bar key={uid} label={profiles[uid]?.display_name || "?"} value={count} max={maxWork} color={T.accent} count={count} />
          ))}
          {topAssignees.length === 0 && <div style={{ color: T.text3, fontSize: 13, padding: 12 }}>No assigned tasks</div>}
        </Card>
      )}
    </div>
  );
}
