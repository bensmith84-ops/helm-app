"use client";
import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";
import { useResponsive } from "../lib/responsive";
import { useAuth } from "../lib/auth";

const STAGES = [
  { key: "ideation", label: "Ideation", color: "#8b5cf6" },
  { key: "concept", label: "Concept", color: "#6366f1" },
  { key: "feasibility", label: "Feasibility", color: "#3b82f6" },
  { key: "development", label: "Development", color: "#0ea5e9" },
  { key: "optimization", label: "Optimization", color: "#06b6d4" },
  { key: "validation", label: "Validation", color: "#10b981" },
  { key: "scale_up", label: "Scale-Up", color: "#84cc16" },
  { key: "regulatory", label: "Regulatory", color: "#eab308" },
  { key: "launch_ready", label: "Launch Ready", color: "#f97316" },
  { key: "launched", label: "Launched", color: "#22c55e" },
];
const STAGE_MAP = Object.fromEntries(STAGES.map(s => [s.key, s]));
const PRI_COLORS = { critical: "#ef4444", high: "#f97316", medium: "#eab308", low: "#22c55e" };

export default function LaunchHub() {
  const { isMobile } = useResponsive();
  const { user, profile } = useAuth();
  const [view, setView] = useState("cards");
  const [programs, setPrograms] = useState([]);
  const [projects, setProjects] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [objectives, setObjectives] = useState([]);
  const [keyResults, setKeyResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (!profile?.org_id) return;
    const load = async () => {
      const [pgR, prR, tR, oR, krR] = await Promise.all([
        supabase.from("plm_programs").select("*").is("deleted_at", null).order("target_launch_date"),
        supabase.from("projects").select("*").is("deleted_at", null).order("name"),
        supabase.from("tasks").select("id,project_id,status,parent_task_id").is("deleted_at", null),
        supabase.from("objectives").select("*").eq("org_id", profile.org_id).is("deleted_at", null).order("title"),
        supabase.from("key_results").select("*").eq("org_id", profile.org_id).is("deleted_at", null).order("title"),
      ]);
      setPrograms(pgR.data || []);
      setProjects(prR.data || []);
      setTasks(tR.data || []);
      setObjectives(oR.data || []);
      setKeyResults(krR.data || []);
      setLoading(false);
    };
    load();
  }, [profile?.org_id]);

  // Build launch items — aggregate PLM programs with their linked projects and OKRs
  const launches = programs.map(pg => {
    const linkedProjects = projects.filter(p => p.plm_program_id === pg.id);
    const linkedProjectIds = new Set(linkedProjects.map(p => p.id));
    const projTasks = tasks.filter(t => linkedProjectIds.has(t.project_id) && !t.parent_task_id);
    const doneTasks = projTasks.filter(t => t.status === "done").length;

    // Find linked OKRs (through projects or directly)
    const objIds = new Set(linkedProjects.map(p => p.objective_id).filter(Boolean));
    const krIds = new Set(linkedProjects.map(p => p.key_result_id).filter(Boolean));
    const linkedObjs = objectives.filter(o => objIds.has(o.id));
    const linkedKRs = keyResults.filter(kr => krIds.has(kr.id));

    // Also find objectives that mention this program by name (loose coupling)
    const progress = projTasks.length > 0 ? Math.round((doneTasks / projTasks.length) * 100) : 0;

    return {
      id: pg.id,
      program: pg,
      projects: linkedProjects,
      objectives: linkedObjs,
      keyResults: linkedKRs,
      taskCount: projTasks.length,
      doneCount: doneTasks,
      progress,
      stage: STAGE_MAP[pg.current_stage] || { label: pg.current_stage, color: "#8b93a8" },
      launchDate: pg.target_launch_date,
    };
  });

  // Also find orphan projects linked to OKRs but not PLM
  const plmLinkedProjectIds = new Set(projects.filter(p => p.plm_program_id).map(p => p.id));
  const orphanProjects = projects.filter(p => !p.plm_program_id && p.objective_id && p.status !== "archived");

  // Sort: pipeline first (by launch date), then launched
  const pipeline = launches.filter(l => l.program.current_stage !== "launched").sort((a, b) => (a.launchDate || "9999").localeCompare(b.launchDate || "9999"));
  const launched = launches.filter(l => l.program.current_stage === "launched");

  // Summary stats
  const totalLaunches = programs.length;
  const inPipeline = pipeline.length;
  const liveProd = launched.length;
  const avgProgress = pipeline.length > 0 ? Math.round(pipeline.reduce((a, l) => a + l.progress, 0) / pipeline.length) : 0;

  if (loading) return <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: T.text3, fontSize: 13 }}>Loading launch hub…</div>;

  // ─── TIMELINE VIEW ─────────────────────────────────────────────────────────
  const renderTimeline = () => {
    const today = new Date();
    const todayStr = today.toISOString().split("T")[0];
    const items = [];

    // Pipeline programs
    pipeline.forEach(l => {
      if (l.launchDate) items.push({ id: l.id, type: "pipeline", name: l.program.name, brand: l.program.brand, stage: l.program.current_stage, priority: l.program.priority, date: l.launchDate, color: l.stage.color, launch: l });
    });
    // Launched
    launched.forEach(l => {
      items.push({ id: l.id, type: "live", name: l.program.name, brand: l.program.brand, date: l.launchDate || l.program.created_at?.split("T")[0], color: "#22c55e", launch: l });
    });
    items.sort((a, b) => (a.date || "").localeCompare(b.date || ""));

    if (items.length === 0) return <div style={{ padding: 40, textAlign: "center", color: T.text3 }}>No programs with launch dates yet.</div>;

    const allDates = items.map(i => i.date).filter(Boolean);
    const minDate = new Date(Math.min(today.getTime() - 90 * 86400000, ...allDates.map(d => new Date(d).getTime())));
    const maxDate = new Date(Math.max(today.getTime() + 540 * 86400000, ...allDates.map(d => new Date(d).getTime() + 60 * 86400000)));
    const totalDays = Math.max(1, (maxDate - minDate) / 86400000);
    const dayPx = isMobile ? 3 : 4.5;
    const timelineW = totalDays * dayPx;
    const getX = (dateStr) => { if (!dateStr) return 0; return Math.max(0, ((new Date(dateStr) - minDate) / 86400000) * dayPx); };
    const todayX = getX(todayStr);

    const months = [];
    const cursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
    while (cursor <= maxDate) { months.push(new Date(cursor)); cursor.setMonth(cursor.getMonth() + 1); }
    const monthPos = months.map((m, i) => {
      const x = getX(m.toISOString().split("T")[0]);
      const nx = i < months.length - 1 ? getX(months[i + 1].toISOString().split("T")[0]) : timelineW;
      return { date: m, x, w: nx - x };
    });

    const ROW_H = 48;
    const LABEL_W = isMobile ? 150 : 260;

    return (
      <div style={{ display: "flex", border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden", background: T.surface }}>
        {/* Fixed labels */}
        <div style={{ width: LABEL_W, flexShrink: 0, borderRight: `1px solid ${T.border}` }}>
          <div style={{ height: 32, borderBottom: `2px solid ${T.border}`, display: "flex", alignItems: "center", padding: "0 12px", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.5 }}>Launch</div>
          {items.map(item => (
            <div key={item.id} style={{ height: ROW_H, display: "flex", alignItems: "center", gap: 8, padding: "0 12px", borderBottom: `1px solid ${T.border}`, overflow: "hidden" }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
                  {item.launch?.objectives.length > 0 && <span style={{ fontSize: 8, padding: "1px 4px", borderRadius: 3, background: T.accentDim, color: T.accent, fontWeight: 700 }}>OKR</span>}
                  {item.launch?.projects.length > 0 && <span style={{ fontSize: 8, padding: "1px 4px", borderRadius: 3, background: "#8b5cf620", color: "#8b5cf6", fontWeight: 700 }}>{item.launch.projects.length} proj</span>}
                  {item.launch && item.launch.taskCount > 0 && <span style={{ fontSize: 9, color: T.text3 }}>{item.launch.doneCount}/{item.launch.taskCount}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
        {/* Scrollable timeline */}
        <div ref={scrollRef} style={{ flex: 1, overflowX: "auto", overflowY: "hidden", position: "relative" }}>
          <div style={{ width: timelineW, minWidth: "100%" }}>
            {/* Month headers */}
            <div style={{ height: 32, borderBottom: `2px solid ${T.border}`, position: "sticky", top: 0, background: T.surface, zIndex: 2 }}>
              {monthPos.map((mp, i) => {
                const cur = mp.date.getMonth() === today.getMonth() && mp.date.getFullYear() === today.getFullYear();
                const yr = mp.date.getMonth() === 0 || i === 0;
                return <div key={i} style={{ position: "absolute", left: mp.x, width: mp.w, height: "100%", borderRight: `1px solid ${T.border}`, display: "flex", alignItems: "center", padding: "0 8px", fontSize: 11, fontWeight: cur ? 700 : 500, color: cur ? T.accent : T.text3 }}>{mp.date.toLocaleDateString("en-US", { month: "short" })}{yr ? " \u2019" + String(mp.date.getFullYear()).slice(2) : ""}</div>;
              })}
            </div>
            {/* Today */}
            <div style={{ position: "absolute", left: todayX, top: 0, bottom: 0, width: 2, background: T.accent, zIndex: 3, pointerEvents: "none", opacity: 0.6 }}>
              <div style={{ position: "absolute", top: 2, left: -14, fontSize: 8, fontWeight: 800, color: "#fff", background: T.accent, padding: "1px 5px", borderRadius: 3 }}>TODAY</div>
            </div>
            {/* Bars */}
            {items.map(item => {
              const x = getX(item.date);
              return (
                <div key={item.id} style={{ height: ROW_H, position: "relative", borderBottom: `1px solid ${T.border}` }}>
                  {/* Grid lines */}
                  {monthPos.map((mp, i) => <div key={i} style={{ position: "absolute", left: mp.x, top: 0, bottom: 0, width: 1, background: T.border, opacity: 0.3, pointerEvents: "none" }} />)}
                  {item.type === "live" ? (
                    <div style={{ position: "absolute", left: x, top: 16, height: 16, width: Math.max(todayX - x, 12), borderRadius: 8, background: `linear-gradient(90deg, ${item.color}40, ${item.color})` }}>
                      <div style={{ position: "absolute", right: -1, top: 3, width: 10, height: 10, borderRadius: 5, background: item.color, border: "2px solid #fff" }} />
                    </div>
                  ) : (<>
                    <div style={{ position: "absolute", left: 0, top: 23, width: x, height: 2, background: `linear-gradient(90deg, transparent, ${item.color}40)` }} />
                    <div style={{ position: "absolute", left: x - 7, top: 17, width: 14, height: 14, transform: "rotate(45deg)", borderRadius: 2, background: item.color + "25", border: `2px solid ${item.color}` }} />
                    <div style={{ position: "absolute", left: x + 14, top: 12, fontSize: 10, color: item.color, fontWeight: 600, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 4 }}>
                      {new Date(item.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: item.color + "18", fontWeight: 700, textTransform: "uppercase" }}>{STAGE_MAP[item.stage]?.label || item.stage}</span>
                      {item.launch && item.launch.progress > 0 && <span style={{ fontSize: 9, color: T.text3 }}>{item.launch.progress}%</span>}
                    </div>
                  </>)}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // ─── CARD VIEW ─────────────────────────────────────────────────────────────
  const renderCard = (l) => {
    const pg = l.program;
    const daysToLaunch = l.launchDate ? Math.ceil((new Date(l.launchDate) - new Date()) / 86400000) : null;
    const isOverdue = daysToLaunch !== null && daysToLaunch < 0 && pg.current_stage !== "launched";
    const stageIdx = STAGES.findIndex(s => s.key === pg.current_stage);
    const stageProgress = STAGES.length > 0 ? Math.round(((stageIdx + 1) / STAGES.length) * 100) : 0;

    return (
      <div key={l.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Header */}
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            {pg.brand && <span style={{ fontSize: 10, color: T.text3, fontWeight: 600, textTransform: "uppercase" }}>{pg.brand}</span>}
            <span style={{ marginLeft: "auto", fontSize: 10, padding: "2px 8px", borderRadius: 4, background: l.stage.color + "18", color: l.stage.color, fontWeight: 700 }}>{l.stage.label}</span>
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{pg.name}</div>
          {l.launchDate && (
            <div style={{ fontSize: 11, color: isOverdue ? "#ef4444" : T.text3, marginTop: 2, fontWeight: isOverdue ? 600 : 400 }}>
              {isOverdue ? `${Math.abs(daysToLaunch)}d overdue` : pg.current_stage === "launched" ? `Launched ${l.launchDate}` : `${daysToLaunch}d to launch · ${l.launchDate}`}
            </div>
          )}
        </div>

        {/* Stage progress bar */}
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ fontSize: 10, color: T.text3, fontWeight: 600 }}>PLM Stage</span>
            <span style={{ fontSize: 10, color: l.stage.color, fontWeight: 700 }}>{stageIdx + 1}/{STAGES.length}</span>
          </div>
          <div style={{ height: 4, borderRadius: 2, background: T.surface3, overflow: "hidden" }}>
            <div style={{ width: `${stageProgress}%`, height: "100%", borderRadius: 2, background: l.stage.color, transition: "width 0.3s" }} />
          </div>
        </div>

        {/* Linked OKRs */}
        {l.objectives.length > 0 ? (
          <div style={{ padding: "8px 10px", borderRadius: 6, background: T.accentDim, border: `1px solid ${T.accent}30` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, marginBottom: 4 }}>OKR</div>
            {l.objectives.map(o => (
              <div key={o.id} style={{ fontSize: 11, color: T.accent, fontWeight: 600 }}>◎ {o.title}</div>
            ))}
            {l.keyResults.map(kr => (
              <div key={kr.id} style={{ fontSize: 10, color: T.text2, marginTop: 3, display: "flex", alignItems: "center", gap: 6 }}>
                <span>◉ {kr.title}</span>
                <span style={{ marginLeft: "auto", fontSize: 9, fontWeight: 700, color: T.accent }}>{Math.round(kr.progress || 0)}%</span>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ padding: "6px 10px", borderRadius: 6, border: `1px dashed ${T.border}`, fontSize: 10, color: T.text3, textAlign: "center" }}>No linked OKR</div>
        )}

        {/* Linked Projects */}
        {l.projects.length > 0 ? (
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, marginBottom: 4 }}>Projects</div>
            {l.projects.map(p => {
              const pt = tasks.filter(t => t.project_id === p.id && !t.parent_task_id);
              const pd = pt.filter(t => t.status === "done").length;
              const pp = pt.length > 0 ? Math.round((pd / pt.length) * 100) : 0;
              return (
                <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0" }}>
                  <div style={{ width: 6, height: 6, borderRadius: 3, background: p.color || T.accent, flexShrink: 0 }} />
                  <span style={{ fontSize: 11, color: T.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
                  <div style={{ width: 40, height: 3, borderRadius: 2, background: T.surface3, flexShrink: 0 }}>
                    <div style={{ width: `${pp}%`, height: "100%", borderRadius: 2, background: p.color || T.accent }} />
                  </div>
                  <span style={{ fontSize: 10, color: T.text3, flexShrink: 0 }}>{pp}%</span>
                </div>
              );
            })}
          </div>
        ) : (
          <div style={{ padding: "6px 10px", borderRadius: 6, border: `1px dashed ${T.border}`, fontSize: 10, color: T.text3, textAlign: "center" }}>No linked project</div>
        )}

        {/* Task summary */}
        {l.taskCount > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ flex: 1, height: 4, borderRadius: 2, background: T.surface3 }}>
              <div style={{ width: `${l.progress}%`, height: "100%", borderRadius: 2, background: "#22c55e" }} />
            </div>
            <span style={{ fontSize: 10, color: T.text3 }}>{l.doneCount}/{l.taskCount} tasks</span>
          </div>
        )}

        {/* Priority */}
        {pg.priority && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: (PRI_COLORS[pg.priority] || T.text3) + "15", color: PRI_COLORS[pg.priority] || T.text3, fontWeight: 700, textTransform: "uppercase" }}>{pg.priority}</span>
            {pg.target_gross_margin_pct && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: "#22c55e15", color: "#22c55e", fontWeight: 700 }}>GM {pg.target_gross_margin_pct}%</span>}
            {(pg.target_markets_v2 || []).map(m => <span key={m} style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: T.surface3, color: T.text3, fontWeight: 600 }}>{m}</span>)}
          </div>
        )}
      </div>
    );
  };

  // Scroll to today on timeline mount
  useEffect(() => {
    if (view === "timeline" && scrollRef.current) {
      const today = new Date();
      const allDates = launches.map(l => l.launchDate).filter(Boolean);
      if (allDates.length === 0) return;
      const minDate = new Date(Math.min(today.getTime() - 90 * 86400000, ...allDates.map(d => new Date(d).getTime())));
      const totalDays = Math.max(1, (new Date(Math.max(today.getTime() + 540 * 86400000, ...allDates.map(d => new Date(d).getTime() + 60 * 86400000))) - minDate) / 86400000);
      const dayPx = isMobile ? 3 : 4.5;
      const todayX = ((today - minDate) / 86400000) * dayPx;
      scrollRef.current.scrollLeft = Math.max(0, todayX - 200);
    }
  }, [view]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "14px 24px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.text, flex: 1 }}>Launch Hub</div>
        <div style={{ display: "flex", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, overflow: "hidden" }}>
          {[["cards", "◫ Cards"], ["timeline", "📅 Timeline"]].map(([k, label]) => (
            <button key={k} onClick={() => setView(k)} style={{ padding: "5px 14px", fontSize: 12, fontWeight: 600, background: view === k ? T.accent : "transparent", color: view === k ? "#fff" : T.text3, border: "none", cursor: "pointer" }}>{label}</button>
          ))}
        </div>
      </div>

      {/* Stats bar */}
      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${T.border}`, padding: "0 24px", flexShrink: 0 }}>
        {[
          { label: "Total Programs", val: totalLaunches },
          { label: "In Pipeline", val: inPipeline },
          { label: "Live Products", val: liveProd },
          { label: "Avg Progress", val: avgProgress + "%" },
          { label: "Linked to OKR", val: launches.filter(l => l.objectives.length > 0).length },
          { label: "Has Project", val: launches.filter(l => l.projects.length > 0).length },
        ].map(k => (
          <div key={k.label} style={{ padding: "12px 20px", borderRight: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.text }}>{k.val}</div>
            <div style={{ fontSize: 11, color: T.text3 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>
        {view === "timeline" ? renderTimeline() : (
          <>
            {/* Pipeline */}
            {pipeline.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 14 }}>🔷</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.text, textTransform: "uppercase", letterSpacing: 0.5 }}>Pipeline</span>
                  <span style={{ fontSize: 11, color: T.text3, background: T.surface2, padding: "1px 8px", borderRadius: 4 }}>{pipeline.length}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
                  {pipeline.map(l => renderCard(l))}
                </div>
              </div>
            )}

            {/* Launched */}
            {launched.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 14 }}>🟢</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.text, textTransform: "uppercase", letterSpacing: 0.5 }}>Live Products</span>
                  <span style={{ fontSize: 11, color: T.text3, background: T.surface2, padding: "1px 8px", borderRadius: 4 }}>{launched.length}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
                  {launched.map(l => renderCard(l))}
                </div>
              </div>
            )}

            {/* Orphan projects (linked to OKR but not PLM) */}
            {orphanProjects.length > 0 && (
              <div style={{ marginBottom: 24 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <span style={{ fontSize: 14 }}>◫</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.text, textTransform: "uppercase", letterSpacing: 0.5 }}>Projects without PLM Program</span>
                  <span style={{ fontSize: 11, color: T.text3, background: T.surface2, padding: "1px 8px", borderRadius: 4 }}>{orphanProjects.length}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
                  {orphanProjects.map(p => {
                    const obj = objectives.find(o => o.id === p.objective_id);
                    const pt = tasks.filter(t => t.project_id === p.id && !t.parent_task_id);
                    const pd = pt.filter(t => t.status === "done").length;
                    const pp = pt.length > 0 ? Math.round((pd / pt.length) * 100) : 0;
                    return (
                      <div key={p.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "14px 16px" }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 4 }}>{p.name}</div>
                        {obj && <div style={{ fontSize: 11, color: T.accent, marginBottom: 6 }}>◎ {obj.title}</div>}
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ flex: 1, height: 4, borderRadius: 2, background: T.surface3 }}>
                            <div style={{ width: `${pp}%`, height: "100%", borderRadius: 2, background: p.color || T.accent }} />
                          </div>
                          <span style={{ fontSize: 10, color: T.text3 }}>{pd}/{pt.length} tasks</span>
                        </div>
                        <div style={{ fontSize: 10, color: T.text3, marginTop: 6, fontStyle: "italic" }}>Link to a PLM program to see full launch status</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {launches.length === 0 && orphanProjects.length === 0 && (
              <div style={{ padding: 40, textAlign: "center" }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>🚀</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 6 }}>No launches yet</div>
                <div style={{ fontSize: 13, color: T.text3, lineHeight: 1.7 }}>
                  Create programs in PLM, link them to Projects and OKRs, and they'll appear here as unified launch cards.
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
