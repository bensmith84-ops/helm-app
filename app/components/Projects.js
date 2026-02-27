"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { T, priorityColor } from "../tokens";
import { Badge, StatusDot } from "./ui";

export default function ProjectsView() {
  const [projects, setProjects] = useState([]);
  const [sections, setSections] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [activeProject, setActiveProject] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [{ data: p }, { data: prof }] = await Promise.all([
        supabase.from("projects").select("*").order("name"),
        supabase.from("profiles").select("id,display_name,avatar_url"),
      ]);
      setProjects(p || []);
      const map = {};
      (prof || []).forEach(u => { map[u.id] = u; });
      setProfiles(map);
      if (p && p.length > 0) setActiveProject(p[0].id);
      setLoading(false);
    }
    load();
  }, []);

  useEffect(() => {
    if (!activeProject) return;
    async function loadProject() {
      const [{ data: s }, { data: t }] = await Promise.all([
        supabase.from("sections").select("*").eq("project_id", activeProject).order("sort_order"),
        supabase.from("tasks").select("*").eq("project_id", activeProject),
      ]);
      setSections(s || []);
      setTasks(t || []);
    }
    loadProject();
  }, [activeProject]);

  if (loading) return <div style={{ padding: 40, color: T.text3 }}>Loading projects…</div>;

  const project = projects.find(p => p.id === activeProject);
  const doneTasks = tasks.filter(t => t.status === "done").length;
  const totalTasks = tasks.length;
  const progress = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  const getInitials = (userId) => {
    const u = profiles[userId];
    if (!u || !u.display_name) return "?";
    return u.display_name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase();
  };

  const getName = (userId) => profiles[userId]?.display_name || "Unassigned";

  const toggleTask = async (task, e) => {
    e.stopPropagation();
    const newStatus = task.status === "done" ? "todo" : "done";
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status: newStatus } : t));
    if (selectedTask?.id === task.id) setSelectedTask(prev => ({ ...prev, status: newStatus }));
    await supabase.from("tasks").update({ status: newStatus }).eq("id", task.id);
  };

  const updateTask = async (field, value) => {
    if (!selectedTask) return;
    setSelectedTask(prev => ({ ...prev, [field]: value }));
    setTasks(prev => prev.map(t => t.id === selectedTask.id ? { ...t, [field]: value } : t));
    await supabase.from("tasks").update({ [field]: value }).eq("id", selectedTask.id);
  };

  return (
    <div style={{ display: "flex", height: "100%" }}>
      <div style={{ width: 220, borderRight: `1px solid ${T.border}`, padding: 12, overflow: "auto" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: T.text3, marginBottom: 8, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          Projects ({projects.length})
        </div>
        {projects.map(p => (
          <button key={p.id} onClick={() => setActiveProject(p.id)} style={{
            width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 6, border: "none",
            cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 2,
            background: activeProject === p.id ? T.surface3 : "transparent",
            color: activeProject === p.id ? T.text : T.text2,
          }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: p.color || T.accent, flexShrink: 0 }} />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</span>
          </button>
        ))}
      </div>
      <div style={{ flex: 1, padding: 20, overflow: "auto" }}>
        {project && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: project.color || T.accent }} />
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>{project.name}</h2>
              <Badge color={T.green}>{progress}% complete</Badge>
              <Badge small color={T.text3}>{totalTasks} tasks</Badge>
            </div>
            {project.description && (
              <div style={{ fontSize: 12, color: T.text3, marginBottom: 16, paddingLeft: 22 }}>{project.description}</div>
            )}
            {project.owner_id && profiles[project.owner_id] && (
              <div style={{ fontSize: 11, color: T.text3, marginBottom: 16, paddingLeft: 22 }}>
                Owner: {getName(project.owner_id)}
              </div>
            )}
            <div style={{ display: "flex", gap: 16, overflow: "auto", paddingBottom: 12 }}>
              {sections.map(section => {
                const sectionTasks = tasks.filter(t => t.section_id === section.id);
                return (
                  <div key={section.id} style={{ minWidth: 260, flex: 1, maxWidth: 320 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: T.text2, marginBottom: 10, display: "flex", justifyContent: "space-between" }}>
                      <span>{section.name}</span>
                      <Badge small color={T.text3}>{sectionTasks.length}</Badge>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {sectionTasks.map(task => (
                        <div key={task.id} onClick={() => setSelectedTask(task)} style={{
                          background: T.surface2, borderRadius: 8, padding: 12, cursor: "pointer",
                          border: `1px solid ${selectedTask?.id === task.id ? T.accent : T.border}`,
                          borderLeft: `3px solid ${task.status === "done" ? T.green : priorityColor(task.priority)}`,
                          opacity: task.status === "done" ? 0.6 : 1,
                          transition: "border-color 0.15s ease",
                        }}>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
                            <div onClick={(e) => toggleTask(task, e)} style={{
                              width: 16, height: 16, borderRadius: 4, flexShrink: 0, marginTop: 1, cursor: "pointer",
                              border: `2px solid ${task.status === "done" ? T.green : T.text3}`,
                              background: task.status === "done" ? T.green : "transparent",
                              display: "flex", alignItems: "center", justifyContent: "center",
                              transition: "all 0.15s ease",
                            }}>
                              {task.status === "done" && <span style={{ color: "#fff", fontSize: 10, lineHeight: 1 }}>✓</span>}
                            </div>
                            <div style={{ fontSize: 13, fontWeight: 500,
                              textDecoration: task.status === "done" ? "line-through" : "none",
                              color: task.status === "done" ? T.text3 : T.text,
                            }}>{task.title}</div>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              {task.priority && (
                                <>
                                  <StatusDot color={priorityColor(task.priority)} size={6} />
                                  <span style={{ fontSize: 10, color: T.text3 }}>{task.priority}</span>
                                </>
                              )}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              {task.due_date && (
                                <span style={{ fontSize: 10, color: T.text3 }}>
                                  {new Date(task.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                </span>
                              )}
                              {task.assignee_id && (
                                <div style={{
                                  width: 22, height: 22, borderRadius: "50%",
                                  background: T.accentDim, display: "flex", alignItems: "center", justifyContent: "center",
                                  fontSize: 9, fontWeight: 600, color: T.accent,
                                }} title={getName(task.assignee_id)}>
                                  {getInitials(task.assignee_id)}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                      {sectionTasks.length === 0 && (
                        <div style={{ fontSize: 11, color: T.text3, fontStyle: "italic", padding: 8 }}>No tasks</div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Task Detail Panel */}
      {selectedTask && (
        <div style={{
          width: 340, borderLeft: `1px solid ${T.border}`, padding: 20, overflow: "auto",
          background: T.surface, flexShrink: 0,
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <input
              value={selectedTask.title}
              onChange={(e) => {
                const val = e.target.value;
                setSelectedTask(prev => ({ ...prev, title: val }));
                setTasks(prev => prev.map(t => t.id === selectedTask.id ? { ...t, title: val } : t));
              }}
              onBlur={() => supabase.from("tasks").update({ title: selectedTask.title }).eq("id", selectedTask.id)}
              onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
              style={{
                fontSize: 15, fontWeight: 600, color: T.text, lineHeight: 1.3, flex: 1, marginRight: 8,
                background: "transparent", border: "none", outline: "none", padding: 0, width: "100%",
                borderBottom: `1px solid transparent`,
              }}
              onFocus={(e) => e.target.style.borderBottom = `1px solid ${T.accent}`}
            />
            <button onClick={() => setSelectedTask(null)} style={{
              background: "none", border: "none", color: T.text3, cursor: "pointer",
              fontSize: 18, lineHeight: 1, padding: 0, flexShrink: 0,
            }}>×</button>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {/* Status */}
            <DetailRow label="Status">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Badge color={selectedTask.status === "done" ? T.green : selectedTask.status === "in_progress" ? T.accent : T.text3}>
                  {selectedTask.status === "done" ? "Done" : selectedTask.status === "in_progress" ? "In Progress" : selectedTask.status === "todo" ? "To Do" : selectedTask.status || "—"}
                </Badge>
                <button onClick={(e) => toggleTask(selectedTask, e)} style={{
                  background: "none", border: `1px solid ${T.border}`, borderRadius: 4, padding: "2px 8px",
                  fontSize: 10, color: T.text2, cursor: "pointer",
                }}>{selectedTask.status === "done" ? "Reopen" : "Complete"}</button>
              </div>
            </DetailRow>

            {/* Priority */}
            <DetailRow label="Priority">
              <select
                value={selectedTask.priority || ""}
                onChange={(e) => updateTask("priority", e.target.value || null)}
                style={{
                  fontSize: 12, color: T.text, background: T.surface2, border: `1px solid ${T.border}`,
                  borderRadius: 4, padding: "3px 6px", cursor: "pointer", outline: "none",
                }}
              >
                <option value="">None</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </DetailRow>

            {/* Assignee */}
            <DetailRow label="Assignee">
              <select
                value={selectedTask.assignee_id || ""}
                onChange={(e) => updateTask("assignee_id", e.target.value || null)}
                style={{
                  fontSize: 12, color: T.text, background: T.surface2, border: `1px solid ${T.border}`,
                  borderRadius: 4, padding: "3px 6px", cursor: "pointer", outline: "none", maxWidth: 180,
                }}
              >
                <option value="">Unassigned</option>
                {Object.values(profiles).sort((a, b) => (a.display_name || "").localeCompare(b.display_name || "")).map(p => (
                  <option key={p.id} value={p.id}>{p.display_name}</option>
                ))}
              </select>
            </DetailRow>

            {/* Due Date */}
            <DetailRow label="Due Date">
              <input
                type="date"
                value={selectedTask.due_date || ""}
                onChange={(e) => updateTask("due_date", e.target.value || null)}
                style={{
                  fontSize: 12, color: T.text, background: T.surface2, border: `1px solid ${T.border}`,
                  borderRadius: 4, padding: "3px 6px", cursor: "pointer", outline: "none",
                  colorScheme: "dark",
                }}
              />
            </DetailRow>

            {/* Section */}
            <DetailRow label="Section">
              <span style={{ fontSize: 13, color: T.text }}>
                {sections.find(s => s.id === selectedTask.section_id)?.name || "—"}
              </span>
            </DetailRow>

            {/* Description */}
            <div style={{ marginTop: 4 }}>
              <div style={{ fontSize: 11, color: T.text3, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>Description</div>
              <textarea
                value={selectedTask.description || ""}
                onChange={(e) => {
                  const val = e.target.value;
                  setSelectedTask(prev => ({ ...prev, description: val }));
                  setTasks(prev => prev.map(t => t.id === selectedTask.id ? { ...t, description: val } : t));
                }}
                onBlur={() => supabase.from("tasks").update({ description: selectedTask.description || null }).eq("id", selectedTask.id)}
                placeholder="Add a description…"
                style={{
                  width: "100%", minHeight: 70, fontSize: 13, color: T.text2, lineHeight: 1.5,
                  padding: 10, background: T.surface2, borderRadius: 6, border: `1px solid ${T.border}`,
                  resize: "vertical", outline: "none", fontFamily: "inherit",
                }}
              />
            </div>

            {/* Timestamps */}
            <div style={{ marginTop: 8, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
              {selectedTask.created_at && (
                <div style={{ fontSize: 11, color: T.text3, marginBottom: 4 }}>
                  Created: {new Date(selectedTask.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </div>
              )}
              {selectedTask.updated_at && (
                <div style={{ fontSize: 11, color: T.text3 }}>
                  Updated: {new Date(selectedTask.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, children }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
      <span style={{ fontSize: 11, color: T.text3, textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>{label}</span>
      {children}
    </div>
  );
}