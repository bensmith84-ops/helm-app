"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";

/* ═══════════════════════════════════════════════════════
   CONFIG
   ═══════════════════════════════════════════════════════ */
const STATUS = {
  todo:        { label: "To Do",       color: "#8b93a8", bg: "#1c2030" },
  in_progress: { label: "Working",     color: "#3b82f6", bg: "#1d3a6a" },
  done:        { label: "Done",        color: "#22c55e", bg: "#0d3a20" },
  blocked:     { label: "Blocked",     color: "#ef4444", bg: "#3d1111" },
};
const PRIORITY = {
  critical: { label: "Critical", color: "#fff",    bg: "#ef4444", dot: "#ef4444" },
  high:     { label: "High",     color: "#ef4444", bg: "#3d1111", dot: "#ef4444" },
  medium:   { label: "Medium",   color: "#eab308", bg: "#3d3000", dot: "#eab308" },
  low:      { label: "Low",      color: "#22c55e", bg: "#0d3a20", dot: "#22c55e" },
};
const SECTION_COLORS = ["#3b82f6", "#a855f7", "#22c55e", "#eab308", "#ef4444", "#ec4899", "#f97316", "#06b6d4"];
const AVATAR_COLORS = ["#3b82f6", "#a855f7", "#ec4899", "#06b6d4", "#f97316", "#22c55e", "#84cc16", "#ef4444"];

/* ═══════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════ */
export default function ProjectsView() {
  const [projects, setProjects] = useState([]);
  const [sections, setSections] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [activeProject, setActiveProject] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [addingTo, setAddingTo] = useState(null);
  const [newTitle, setNewTitle] = useState("");
  const [viewMode, setViewMode] = useState("list");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState({});
  const [editingCell, setEditingCell] = useState(null); // { taskId, field }
  const [hoveredRow, setHoveredRow] = useState(null);

  /* ── Data loading ── */
  useEffect(() => {
    (async () => {
      const [{ data: p }, { data: prof }] = await Promise.all([
        supabase.from("projects").select("*").order("name"),
        supabase.from("profiles").select("id,display_name,avatar_url"),
      ]);
      setProjects(p || []);
      const m = {}; (prof || []).forEach(u => { m[u.id] = u; }); setProfiles(m);
      if (p?.length) setActiveProject(p[0].id);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!activeProject) return;
    (async () => {
      const [{ data: s }, { data: t }] = await Promise.all([
        supabase.from("sections").select("*").eq("project_id", activeProject).order("sort_order"),
        supabase.from("tasks").select("*").eq("project_id", activeProject),
      ]);
      setSections(s || []); setTasks(t || []);
      setSelectedTask(null); setCollapsed({}); setEditingCell(null);
    })();
  }, [activeProject]);

  /* ── Helpers ── */
  const ini = (uid) => { const u = profiles[uid]; return u?.display_name ? u.display_name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() : "?"; };
  const acol = (uid) => uid ? AVATAR_COLORS[uid.charCodeAt(uid.length - 1) % AVATAR_COLORS.length] : T.text3;
  const uname = (uid) => profiles[uid]?.display_name || "";
  const secColor = (i) => SECTION_COLORS[i % SECTION_COLORS.length];

  const proj = projects.find(p => p.id === activeProject);
  const done = tasks.filter(t => t.status === "done").length;
  const total = tasks.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const filt = search ? tasks.filter(t => t.title.toLowerCase().includes(search.toLowerCase())) : tasks;

  /* ── Task mutations ── */
  const toggleDone = async (task, e) => {
    e?.stopPropagation();
    const ns = task.status === "done" ? "todo" : "done";
    setTasks(p => p.map(t => t.id === task.id ? { ...t, status: ns } : t));
    if (selectedTask?.id === task.id) setSelectedTask(p => ({ ...p, status: ns }));
    await supabase.from("tasks").update({ status: ns }).eq("id", task.id);
  };

  const updateField = async (taskId, field, value) => {
    setTasks(p => p.map(t => t.id === taskId ? { ...t, [field]: value } : t));
    if (selectedTask?.id === taskId) setSelectedTask(p => ({ ...p, [field]: value }));
    await supabase.from("tasks").update({ [field]: value }).eq("id", taskId);
    setEditingCell(null);
  };

  const createTask = async (sid) => {
    if (!newTitle.trim()) { setAddingTo(null); return; }
    const { data } = await supabase.from("tasks").insert({
      org_id: proj.org_id, project_id: activeProject, section_id: sid,
      title: newTitle.trim(), status: "todo", priority: "medium",
    }).select().single();
    if (data) setTasks(p => [...p, data]);
    setNewTitle(""); setAddingTo(null);
  };

  if (loading) return <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: T.text3, fontSize: 13 }}>Loading projects…</div>;

  /* ═══════════════════════════════════════════════════════
     REUSABLE COMPONENTS
     ═══════════════════════════════════════════════════════ */

  /* ── Checkbox (Asana-style circle) ── */
  const Check = ({ on, fn, sz = 18 }) => (
    <div onClick={fn} style={{
      width: sz, height: sz, borderRadius: "50%", flexShrink: 0, cursor: "pointer",
      border: `2px solid ${on ? "#22c55e" : "#3f4760"}`,
      background: on ? "#22c55e" : "transparent",
      display: "flex", alignItems: "center", justifyContent: "center",
      transition: "all 0.2s ease",
    }}>
      {on && <svg width={sz * 0.55} height={sz * 0.55} viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
    </div>
  );

  /* ── Avatar ── */
  const Ava = ({ uid, sz = 24 }) => {
    if (!uid) return <div style={{ width: sz, height: sz }} />;
    const c = acol(uid);
    return (
      <div title={uname(uid)} style={{
        width: sz, height: sz, borderRadius: "50%",
        background: `${c}18`, border: `1.5px solid ${c}50`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: Math.max(sz * 0.38, 9), fontWeight: 700, color: c, flexShrink: 0,
        letterSpacing: "-0.02em",
      }}>{ini(uid)}</div>
    );
  };

  /* ── Inline-editable Status Pill (Monday style) ── */
  const StatusCell = ({ task }) => {
    const editing = editingCell?.taskId === task.id && editingCell?.field === "status";
    const cfg = STATUS[task.status] || STATUS.todo;
    return (
      <div style={{ position: "relative" }}>
        <div onClick={(e) => { e.stopPropagation(); setEditingCell(editing ? null : { taskId: task.id, field: "status" }); }}
          style={{
            display: "inline-flex", alignItems: "center", padding: "3px 10px", borderRadius: 4,
            fontSize: 11, fontWeight: 600, cursor: "pointer", userSelect: "none",
            background: cfg.bg, color: cfg.color, transition: "all 0.15s",
            border: editing ? `1px solid ${cfg.color}` : "1px solid transparent",
          }}>{cfg.label}</div>
        {editing && (
          <Dropdown onClose={() => setEditingCell(null)}>
            {Object.entries(STATUS).map(([k, v]) => (
              <DropdownItem key={k} onClick={() => updateField(task.id, "status", k)}>
                <span style={{ width: 8, height: 8, borderRadius: 2, background: v.color, flexShrink: 0 }} />
                <span style={{ color: v.color }}>{v.label}</span>
              </DropdownItem>
            ))}
          </Dropdown>
        )}
      </div>
    );
  };

  /* ── Inline-editable Priority Pill ── */
  const PriorityCell = ({ task }) => {
    const editing = editingCell?.taskId === task.id && editingCell?.field === "priority";
    const cfg = PRIORITY[task.priority];
    return (
      <div style={{ position: "relative" }}>
        <div onClick={(e) => { e.stopPropagation(); setEditingCell(editing ? null : { taskId: task.id, field: "priority" }); }}
          style={{
            display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 10px", borderRadius: 4,
            fontSize: 11, fontWeight: 600, cursor: "pointer", userSelect: "none",
            background: cfg?.bg || T.surface3, color: cfg?.color || T.text3,
            border: editing ? `1px solid ${cfg?.color || T.text3}` : "1px solid transparent",
            transition: "all 0.15s",
          }}>
          {cfg && <span style={{ width: 6, height: 6, borderRadius: 6, background: cfg.dot }} />}
          {cfg?.label || "—"}
        </div>
        {editing && (
          <Dropdown onClose={() => setEditingCell(null)}>
            {Object.entries(PRIORITY).map(([k, v]) => (
              <DropdownItem key={k} onClick={() => updateField(task.id, "priority", k)}>
                <span style={{ width: 6, height: 6, borderRadius: 6, background: v.dot }} />
                <span style={{ color: v.color }}>{v.label}</span>
              </DropdownItem>
            ))}
            <DropdownItem onClick={() => updateField(task.id, "priority", null)}>
              <span style={{ width: 6, height: 6, borderRadius: 6, background: T.text3 }} />
              <span style={{ color: T.text3 }}>None</span>
            </DropdownItem>
          </Dropdown>
        )}
      </div>
    );
  };

  /* ── Inline Assignee Picker ── */
  const AssigneeCell = ({ task }) => {
    const editing = editingCell?.taskId === task.id && editingCell?.field === "assignee";
    return (
      <div style={{ position: "relative" }}>
        <div onClick={(e) => { e.stopPropagation(); setEditingCell(editing ? null : { taskId: task.id, field: "assignee" }); }}
          style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", padding: "2px 4px", borderRadius: 4, border: editing ? `1px solid ${T.accent}` : "1px solid transparent" }}>
          <Ava uid={task.assignee_id} sz={22} />
          <span style={{ fontSize: 12, color: task.assignee_id ? T.text2 : T.text3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {task.assignee_id ? uname(task.assignee_id) : "—"}
          </span>
        </div>
        {editing && (
          <Dropdown onClose={() => setEditingCell(null)} wide>
            <DropdownItem onClick={() => updateField(task.id, "assignee_id", null)}>
              <span style={{ color: T.text3 }}>Unassigned</span>
            </DropdownItem>
            {Object.values(profiles).sort((a, b) => (a.display_name || "").localeCompare(b.display_name || "")).map(p => (
              <DropdownItem key={p.id} onClick={() => updateField(task.id, "assignee_id", p.id)}>
                <Ava uid={p.id} sz={18} />
                <span>{p.display_name}</span>
              </DropdownItem>
            ))}
          </Dropdown>
        )}
      </div>
    );
  };

  /* ── Inline Date Picker ── */
  const DateCell = ({ task }) => {
    const overdue = task.due_date && new Date(task.due_date) < new Date() && task.status !== "done";
    return (
      <div style={{ position: "relative" }}>
        <input type="date" value={task.due_date || ""}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => updateField(task.id, "due_date", e.target.value || null)}
          style={{
            fontSize: 12, color: overdue ? "#ef4444" : T.text3, background: "transparent",
            border: "none", outline: "none", cursor: "pointer", fontFamily: "inherit",
            colorScheme: "dark", padding: "2px 0", width: 90,
          }}
        />
      </div>
    );
  };

  /* ── Add task row ── */
  const AddRow = ({ sid }) => addingTo === sid ? (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px 8px 44px", borderBottom: `1px solid ${T.border}` }}>
      <input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") createTask(sid); if (e.key === "Escape") { setAddingTo(null); setNewTitle(""); } }}
        placeholder="Task name…" style={{ flex: 1, fontSize: 13, color: T.text, background: "transparent", border: "none", outline: "none", fontFamily: "inherit" }} />
      <button onClick={() => createTask(sid)} style={{ padding: "3px 10px", fontSize: 11, fontWeight: 600, borderRadius: 4, border: "none", background: T.accent, color: "#fff", cursor: "pointer" }}>Add</button>
      <button onClick={() => { setAddingTo(null); setNewTitle(""); }} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 16, padding: "0 4px" }}>×</button>
    </div>
  ) : (
    <div onClick={() => { setAddingTo(sid); setNewTitle(""); }} style={{ padding: "6px 12px 6px 44px", cursor: "pointer", color: T.text3, fontSize: 13, borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 6, transition: "color 0.15s" }}>
      <span style={{ fontSize: 15, fontWeight: 300, lineHeight: 1 }}>+</span> Add task…
    </div>
  );

  /* ═══════════════════════════════════════════════════════
     SIDEBAR
     ═══════════════════════════════════════════════════════ */
  const sidebar = (
    <div style={{ width: 248, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", background: T.bg, flexShrink: 0 }}>
      <div style={{ padding: "20px 20px 14px" }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: T.text3, letterSpacing: "0.1em", textTransform: "uppercase" }}>Projects</span>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "0 8px 16px" }}>
        {projects.map(p => {
          const on = activeProject === p.id;
          // Compute per-project task counts (we already have full data for active project)
          return (
            <button key={p.id} onClick={() => setActiveProject(p.id)} style={{
              width: "100%", textAlign: "left", padding: "9px 12px", borderRadius: 8, border: "none",
              cursor: "pointer", display: "flex", alignItems: "center", gap: 10, fontSize: 13, marginBottom: 1,
              background: on ? `${T.accent}15` : "transparent",
              color: on ? T.text : T.text2, transition: "all 0.12s",
            }}>
              <div style={{
                width: 26, height: 26, borderRadius: 6, flexShrink: 0,
                background: p.color || T.accent,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 11, fontWeight: 800, color: "#fff",
              }}>{p.name.charAt(0).toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: on ? 600 : 400 }}>{p.name}</div>
            </button>
          );
        })}
      </div>
    </div>
  );

  /* ═══════════════════════════════════════════════════════
     HEADER
     ═══════════════════════════════════════════════════════ */
  const header = proj && (
    <div style={{ padding: "20px 28px 0", borderBottom: `1px solid ${T.border}`, background: T.surface }}>
      {/* Title row */}
      <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
        <div style={{ width: 36, height: 36, borderRadius: 10, background: proj.color || T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 800, color: "#fff" }}>{proj.name.charAt(0)}</div>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>{proj.name}</h2>
          {proj.owner_id && profiles[proj.owner_id] && <div style={{ fontSize: 12, color: T.text3, marginTop: 2 }}>Owned by {uname(proj.owner_id)}</div>}
        </div>
        {/* Progress */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: T.green, lineHeight: 1 }}>{pct}%</div>
            <div style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>{done} of {total} done</div>
          </div>
          <div style={{ width: 36, height: 36, position: "relative" }}>
            <svg width={36} height={36} style={{ transform: "rotate(-90deg)" }}>
              <circle cx={18} cy={18} r={15} fill="none" stroke={T.surface3} strokeWidth={3} />
              <circle cx={18} cy={18} r={15} fill="none" stroke={T.green} strokeWidth={3}
                strokeDasharray={`${pct * 0.94} 100`} strokeLinecap="round"
                style={{ transition: "stroke-dasharray 0.5s ease" }} />
            </svg>
          </div>
        </div>
      </div>
      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
        {[
          { k: "list",  l: "List",  icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="2" width="14" height="2" rx="1"/><rect x="1" y="7" width="14" height="2" rx="1"/><rect x="1" y="12" width="14" height="2" rx="1"/></svg> },
          { k: "board", l: "Board", icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="4" height="14" rx="1"/><rect x="6" y="1" width="4" height="10" rx="1"/><rect x="11" y="1" width="4" height="7" rx="1"/></svg> },
        ].map(v => (
          <button key={v.k} onClick={() => setViewMode(v.k)} style={{
            padding: "9px 16px", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 500,
            background: "transparent", color: viewMode === v.k ? T.text : T.text3,
            borderBottom: `2px solid ${viewMode === v.k ? T.accent : "transparent"}`,
            display: "flex", alignItems: "center", gap: 7, transition: "all 0.15s",
          }}>{v.icon}{v.l}</button>
        ))}
        <div style={{ flex: 1 }} />
        {/* Search */}
        <div style={{
          display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", marginBottom: 6,
          background: T.surface2, borderRadius: 6, border: `1px solid ${search ? T.accent : T.border}`,
          width: search ? 220 : 160, transition: "all 0.2s",
        }}>
          <svg width="13" height="13" viewBox="0 0 16 16" fill={T.text3}><circle cx="7" cy="7" r="5.5" fill="none" stroke={T.text3} strokeWidth="2"/><line x1="11" y1="11" x2="15" y2="15" stroke={T.text3} strokeWidth="2" strokeLinecap="round"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks…"
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: T.text, fontSize: 12, fontFamily: "inherit" }} />
          {search && <button onClick={() => setSearch("")} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 14, padding: 0, lineHeight: 1 }}>×</button>}
        </div>
      </div>
    </div>
  );

  /* ═══════════════════════════════════════════════════════
     LIST VIEW (Asana-style)
     ═══════════════════════════════════════════════════════ */
  const listView = (
    <div style={{ flex: 1, overflow: "auto" }} onClick={() => setEditingCell(null)}>
      {sections.map((sec, si) => {
        const st = filt.filter(t => t.section_id === sec.id);
        const sd = st.filter(t => t.status === "done").length;
        const cl = collapsed[sec.id];
        const sc = secColor(si);
        return (
          <div key={sec.id}>
            {/* Section header */}
            <div style={{
              display: "flex", alignItems: "center", gap: 0,
              padding: "10px 28px", cursor: "pointer", userSelect: "none",
              background: T.surface, borderBottom: `1px solid ${T.border}`,
              position: "sticky", top: 0, zIndex: 2,
            }} onClick={() => setCollapsed(p => ({ ...p, [sec.id]: !p[sec.id] }))}>
              {/* Color bar */}
              <div style={{ width: 4, height: 20, borderRadius: 2, background: sc, marginRight: 12, flexShrink: 0 }} />
              <svg width="10" height="10" viewBox="0 0 10 10" fill={T.text3} style={{ transition: "transform 0.2s", transform: cl ? "rotate(-90deg)" : "rotate(0)", marginRight: 10, flexShrink: 0 }}>
                <path d="M2 3l3 3.5L8 3" fill="none" stroke={T.text3} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{sec.name}</span>
              <span style={{ fontSize: 11, color: T.text3, marginLeft: 8 }}>{sd}/{st.length}</span>
              {st.length > 0 && (
                <div style={{ width: 48, height: 3, borderRadius: 3, background: T.surface3, overflow: "hidden", marginLeft: 10 }}>
                  <div style={{ width: `${st.length > 0 ? (sd / st.length) * 100 : 0}%`, height: "100%", borderRadius: 3, background: sc, transition: "width 0.3s" }} />
                </div>
              )}
            </div>
            {/* Column headers */}
            {!cl && st.length > 0 && (
              <div style={{
                display: "grid", gridTemplateColumns: "40px 1fr 90px 90px 150px 100px",
                gap: 0, padding: "0 28px", alignItems: "center", height: 28,
                fontSize: 10, fontWeight: 600, color: T.text3, textTransform: "uppercase", letterSpacing: "0.06em",
                borderBottom: `1px solid ${T.border}`, background: T.bg,
              }}>
                <span /><span style={{ paddingLeft: 4 }}>Task name</span><span>Status</span><span>Priority</span><span>Assignee</span><span>Due date</span>
              </div>
            )}
            {/* Task rows */}
            {!cl && st.map(task => {
              const sel = selectedTask?.id === task.id;
              const dn = task.status === "done";
              const hov = hoveredRow === task.id;
              return (
                <div key={task.id}
                  onMouseEnter={() => setHoveredRow(task.id)}
                  onMouseLeave={() => setHoveredRow(null)}
                  onClick={() => setSelectedTask(task)}
                  style={{
                    display: "grid", gridTemplateColumns: "40px 1fr 90px 90px 150px 100px",
                    gap: 0, padding: "0 28px", alignItems: "center", height: 38,
                    cursor: "pointer", borderBottom: `1px solid ${T.border}`,
                    background: sel ? `${T.accent}10` : hov ? `${T.text}06` : "transparent",
                    borderLeft: sel ? `3px solid ${T.accent}` : "3px solid transparent",
                    transition: "background 0.1s",
                  }}>
                  {/* Checkbox */}
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <Check on={dn} fn={e => toggleDone(task, e)} sz={17} />
                  </div>
                  {/* Title */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, overflow: "hidden", paddingLeft: 4, paddingRight: 8 }}>
                    <span style={{
                      fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      textDecoration: dn ? "line-through" : "none",
                      color: dn ? T.text3 : T.text, fontWeight: sel ? 600 : 400,
                    }}>{task.title}</span>
                    {/* Open detail icon on hover */}
                    {hov && (
                      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, opacity: 0.4 }}>
                        <path d="M6 3l5 5-5 5" stroke={T.text2} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                  {/* Status */}
                  <StatusCell task={task} />
                  {/* Priority */}
                  <PriorityCell task={task} />
                  {/* Assignee */}
                  <AssigneeCell task={task} />
                  {/* Due date */}
                  <DateCell task={task} />
                </div>
              );
            })}
            {/* Add task */}
            {!cl && <AddRow sid={sec.id} />}
          </div>
        );
      })}
    </div>
  );

  /* ═══════════════════════════════════════════════════════
     BOARD VIEW
     ═══════════════════════════════════════════════════════ */
  const boardView = (
    <div style={{ flex: 1, overflow: "auto", padding: "20px 28px 28px", display: "flex", gap: 16 }}>
      {sections.map((sec, si) => {
        const st = filt.filter(t => t.section_id === sec.id);
        const sc = secColor(si);
        return (
          <div key={sec.id} style={{ minWidth: 290, width: 290, flexShrink: 0 }}>
            {/* Column header with color bar */}
            <div style={{ marginBottom: 12 }}>
              <div style={{ height: 3, borderRadius: 3, background: sc, marginBottom: 10 }} />
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{sec.name}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: T.text3, background: T.surface3, borderRadius: 10, padding: "1px 8px" }}>{st.length}</span>
              </div>
            </div>
            {/* Cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {st.map(task => {
                const dn = task.status === "done";
                const sel = selectedTask?.id === task.id;
                const pcfg = PRIORITY[task.priority];
                return (
                  <div key={task.id} onClick={() => setSelectedTask(task)} style={{
                    background: T.surface2, borderRadius: 10, padding: "12px 14px", cursor: "pointer",
                    border: `1px solid ${sel ? T.accent : T.border}`,
                    opacity: dn ? 0.5 : 1, transition: "all 0.15s", position: "relative",
                  }}>
                    {pcfg && <div style={{ position: "absolute", left: 0, top: 10, bottom: 10, width: 3, borderRadius: "0 3px 3px 0", background: pcfg.dot }} />}
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <Check on={dn} fn={e => toggleDone(task, e)} sz={17} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 13, fontWeight: 500, lineHeight: 1.4, marginBottom: 10,
                          textDecoration: dn ? "line-through" : "none", color: dn ? T.text3 : T.text,
                        }}>{task.title}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          {task.status && task.status !== "todo" && (
                            <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 4, background: STATUS[task.status]?.bg, color: STATUS[task.status]?.color }}>{STATUS[task.status]?.label}</span>
                          )}
                          {pcfg && (
                            <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 4, background: pcfg.bg, color: pcfg.color, display: "flex", alignItems: "center", gap: 3 }}>
                              <span style={{ width: 5, height: 5, borderRadius: 5, background: pcfg.dot }} />{pcfg.label}
                            </span>
                          )}
                          {task.due_date && (
                            <span style={{ fontSize: 10, color: new Date(task.due_date) < new Date() && !dn ? "#ef4444" : T.text3, fontWeight: 500 }}>
                              {new Date(task.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                            </span>
                          )}
                          <div style={{ flex: 1 }} />
                          <Ava uid={task.assignee_id} sz={22} />
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Add task */}
            {addingTo === sec.id ? (
              <div style={{ padding: "8px 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: T.surface2, borderRadius: 8, border: `1px solid ${T.accent}` }}>
                  <input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") createTask(sec.id); if (e.key === "Escape") { setAddingTo(null); setNewTitle(""); } }}
                    placeholder="Task name…" style={{ flex: 1, fontSize: 13, color: T.text, background: "transparent", border: "none", outline: "none", fontFamily: "inherit" }} />
                  <button onClick={() => createTask(sec.id)} style={{ padding: "3px 10px", fontSize: 11, fontWeight: 600, borderRadius: 4, border: "none", background: T.accent, color: "#fff", cursor: "pointer" }}>Add</button>
                  <button onClick={() => { setAddingTo(null); setNewTitle(""); }} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 16 }}>×</button>
                </div>
              </div>
            ) : (
              <button onClick={() => { setAddingTo(sec.id); setNewTitle(""); }} style={{
                width: "100%", padding: "8px 12px", borderRadius: 8, border: "none", marginTop: 8,
                background: "transparent", color: T.text3, cursor: "pointer", fontSize: 12,
                display: "flex", alignItems: "center", gap: 6,
              }}>
                <span style={{ fontSize: 16, fontWeight: 300, lineHeight: 1 }}>+</span> Add task
              </button>
            )}
          </div>
        );
      })}
    </div>
  );

  /* ═══════════════════════════════════════════════════════
     DETAIL PANEL (Asana-style slide-over)
     ═══════════════════════════════════════════════════════ */
  const detail = selectedTask && (
    <div style={{
      width: 400, borderLeft: `1px solid ${T.border}`, display: "flex", flexDirection: "column",
      background: T.surface, flexShrink: 0, overflow: "hidden",
    }}>
      {/* Panel header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "10px 20px", borderBottom: `1px solid ${T.border}`, flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Check on={selectedTask.status === "done"} fn={e => toggleDone(selectedTask, e)} sz={20} />
          <span style={{ fontSize: 12, color: selectedTask.status === "done" ? T.green : T.text3, fontWeight: 500 }}>
            {selectedTask.status === "done" ? "Completed" : "Mark complete"}
          </span>
        </div>
        <button onClick={() => setSelectedTask(null)} style={{
          background: T.surface2, border: `1px solid ${T.border}`, color: T.text3, cursor: "pointer",
          width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8" stroke={T.text3} strokeWidth="1.5" strokeLinecap="round"/></svg>
        </button>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>
        {/* Title */}
        <input value={selectedTask.title}
          onChange={e => { const v = e.target.value; setSelectedTask(p => ({ ...p, title: v })); setTasks(p => p.map(t => t.id === selectedTask.id ? { ...t, title: v } : t)); }}
          onBlur={() => supabase.from("tasks").update({ title: selectedTask.title }).eq("id", selectedTask.id)}
          onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
          style={{ fontSize: 20, fontWeight: 700, color: T.text, lineHeight: 1.3, background: "transparent", border: "none", outline: "none", padding: 0, width: "100%", marginBottom: 24 }} />
        {/* Fields */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <PanelField icon="👤" label="Assignee">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Ava uid={selectedTask.assignee_id} sz={24} />
              <select value={selectedTask.assignee_id || ""} onChange={e => updateField(selectedTask.id, "assignee_id", e.target.value || null)}
                style={{ fontSize: 13, color: T.text, background: "transparent", border: "none", outline: "none", cursor: "pointer", fontFamily: "inherit", flex: 1 }}>
                <option value="">Unassigned</option>
                {Object.values(profiles).sort((a, b) => (a.display_name || "").localeCompare(b.display_name || "")).map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
              </select>
            </div>
          </PanelField>
          <PanelField icon="📅" label="Due date">
            <input type="date" value={selectedTask.due_date || ""} onChange={e => updateField(selectedTask.id, "due_date", e.target.value || null)}
              style={{ fontSize: 13, color: T.text, background: "transparent", border: "none", outline: "none", cursor: "pointer", colorScheme: "dark", fontFamily: "inherit" }} />
          </PanelField>
          <PanelField icon="🎯" label="Priority">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {PRIORITY[selectedTask.priority] && <span style={{ width: 8, height: 8, borderRadius: 8, background: PRIORITY[selectedTask.priority].dot }} />}
              <select value={selectedTask.priority || ""} onChange={e => updateField(selectedTask.id, "priority", e.target.value || null)}
                style={{ fontSize: 13, color: T.text, background: "transparent", border: "none", outline: "none", cursor: "pointer", fontFamily: "inherit" }}>
                <option value="">None</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option>
              </select>
            </div>
          </PanelField>
          <PanelField icon="📋" label="Status">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: STATUS[selectedTask.status]?.color || T.text3 }} />
              <select value={selectedTask.status || "todo"} onChange={e => updateField(selectedTask.id, "status", e.target.value)}
                style={{ fontSize: 13, color: T.text, background: "transparent", border: "none", outline: "none", cursor: "pointer", fontFamily: "inherit" }}>
                <option value="todo">To Do</option><option value="in_progress">In Progress</option><option value="done">Done</option><option value="blocked">Blocked</option>
              </select>
            </div>
          </PanelField>
          <PanelField icon="📂" label="Section">
            <select value={selectedTask.section_id || ""} onChange={e => updateField(selectedTask.id, "section_id", e.target.value)}
              style={{ fontSize: 13, color: T.text, background: "transparent", border: "none", outline: "none", cursor: "pointer", fontFamily: "inherit" }}>
              {sections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </PanelField>
        </div>
        {/* Description */}
        <div style={{ marginTop: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 10 }}>Description</div>
          <textarea value={selectedTask.description || ""}
            onChange={e => { const v = e.target.value; setSelectedTask(p => ({ ...p, description: v })); setTasks(p => p.map(t => t.id === selectedTask.id ? { ...t, description: v } : t)); }}
            onBlur={() => supabase.from("tasks").update({ description: selectedTask.description || null }).eq("id", selectedTask.id)}
            placeholder="Add a description…"
            style={{
              width: "100%", minHeight: 100, fontSize: 13, color: T.text2, lineHeight: 1.6,
              padding: 14, background: T.surface2, borderRadius: 10, border: `1px solid ${T.border}`,
              resize: "vertical", outline: "none", fontFamily: "inherit",
            }} />
        </div>
        {/* Activity */}
        <div style={{ marginTop: 28, paddingTop: 18, borderTop: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 12 }}>Activity</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {selectedTask.created_at && (
              <div style={{ fontSize: 12, color: T.text3, display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: 6, background: T.green, flexShrink: 0 }} />
                Task created · {new Date(selectedTask.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </div>
            )}
            {selectedTask.updated_at && selectedTask.updated_at !== selectedTask.created_at && (
              <div style={{ fontSize: 12, color: T.text3, display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 6, height: 6, borderRadius: 6, background: T.accent, flexShrink: 0 }} />
                Last updated · {new Date(selectedTask.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  /* ═══════════════════════════════════════════════════════
     LAYOUT
     ═══════════════════════════════════════════════════════ */
  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {sidebar}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {header}
        {proj && (viewMode === "list" ? listView : boardView)}
      </div>
      {detail}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   HELPER COMPONENTS
   ═══════════════════════════════════════════════════════ */
function Dropdown({ children, onClose, wide }) {
  const ref = useRef(null);
  useEffect(() => {
    const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [onClose]);
  return (
    <div ref={ref} onClick={e => e.stopPropagation()} style={{
      position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 100,
      background: "#1a1f2e", border: `1px solid ${T.border2}`, borderRadius: 8,
      padding: 4, minWidth: wide ? 200 : 120, boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
      maxHeight: 240, overflow: "auto",
    }}>{children}</div>
  );
}

function DropdownItem({ children, onClick }) {
  return (
    <div onClick={onClick} style={{
      display: "flex", alignItems: "center", gap: 8, padding: "6px 10px",
      borderRadius: 4, cursor: "pointer", fontSize: 12, color: T.text2,
      transition: "background 0.1s",
    }}
    onMouseEnter={e => e.currentTarget.style.background = T.surface3}
    onMouseLeave={e => e.currentTarget.style.background = "transparent"}
    >{children}</div>
  );
}

function PanelField({ icon, label, children }) {
  return (
    <div style={{
      display: "grid", gridTemplateColumns: "120px 1fr",
      padding: "10px 0", borderBottom: `1px solid ${T.border}`, alignItems: "center",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.text3 }}>
        <span style={{ fontSize: 14 }}>{icon}</span><span>{label}</span>
      </div>
      <div>{children}</div>
    </div>
  );
}