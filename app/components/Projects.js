"use client";
import { useState } from "react";
import { T, PROJECTS, TASKS, priorityColor } from "../tokens";
import { Badge, Avatar, StatusDot, ProgressBar } from "./ui";

export default function ProjectsView() {
  const [activeProject, setActiveProject] = useState("p1");
  const project = PROJECTS.find(p => p.id === activeProject);
  const tasks = TASKS.filter(t => t.project === activeProject);
  const sections = ["In Progress", "To Do", "Backlog", "Done"];

  return (
    <div style={{ display: "flex", height: "100%" }}>
      <div style={{ width: 200, borderRight: `1px solid ${T.border}`, padding: 12, overflow: "auto" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: T.text3, marginBottom: 8, letterSpacing: "0.06em", textTransform: "uppercase" }}>Projects</div>
        {PROJECTS.map(p => (
          <button key={p.id} onClick={() => setActiveProject(p.id)} style={{
            width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 6, border: "none",
            cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 2,
            background: activeProject === p.id ? T.surface3 : "transparent", color: activeProject === p.id ? T.text : T.text2,
          }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />
            {p.name}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, padding: 20, overflow: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: project?.color }} />
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>{project?.name}</h2>
          <Badge color={T.green}>{project?.progress}% complete</Badge>
        </div>
        <div style={{ display: "flex", gap: 16, overflow: "auto" }}>
          {sections.map(section => {
            const sectionTasks = tasks.filter(t => t.section === section);
            return (
              <div key={section} style={{ minWidth: 260, flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.text2, marginBottom: 10, display: "flex", justifyContent: "space-between" }}>
                  <span>{section}</span>
                  <Badge small color={T.text3}>{sectionTasks.length}</Badge>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {sectionTasks.map(task => (
                    <div key={task.id} style={{ background: T.surface2, borderRadius: 8, padding: 12, border: `1px solid ${T.border}` }}>
                      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>{task.title}</div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <StatusDot color={priorityColor(task.priority)} size={6} />
                          <span style={{ fontSize: 10, color: T.text3 }}>{task.priority}</span>
                        </div>
                        {task.assignee && <Avatar user={task.assignee} size={22} />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
