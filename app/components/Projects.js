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
                        <div key={task.id} style={{
                          background: T.surface2, borderRadius: 8, padding: 12,
                          border: `1px solid ${T.border}`,
                          borderLeft: `3px solid ${task.status === "done" ? T.green : priorityColor(task.priority)}`,
                          opacity: task.status === "done" ? 0.6 : 1,
                        }}>
                          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6,
                            textDecoration: task.status === "done" ? "line-through" : "none",
                            color: task.status === "done" ? T.text3 : T.text,
                          }}>{task.title}</div>
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
    </div>
  );
}