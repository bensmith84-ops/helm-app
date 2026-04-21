"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { T } from "../tokens";

const fmt = n => n == null ? "0" : Number(n).toLocaleString();
const PROXY_URL = "https://upbjdmnykheubxkuknuj.supabase.co/functions/v1/asana-proxy";

export default function AsanaImportModal({ onClose, onImported }) {
  const { user, profile, orgId } = useAuth();
  const [step, setStep] = useState("loading");
  const [asanaProjects, setAsanaProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [projectDetail, setProjectDetail] = useState(null);
  const [search, setSearch] = useState("");
  const [error, setError] = useState(null);
  const [importProgress, setImportProgress] = useState("");
  const [importResult, setImportResult] = useState(null);

  useEffect(() => { fetchAsanaProjects(); }, []);

  const callProxy = async (body) => {
    const res = await fetch(PROXY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  };

  const fetchAsanaProjects = async () => {
    try {
      setStep("loading");
      const projects = await callProxy({ action: "list_projects" });
      if (Array.isArray(projects) && projects.length > 0) {
        setAsanaProjects(projects);
        setStep("list");
      } else {
        setError("No projects found in Asana.");
        setStep("error");
      }
    } catch (err) {
      setError("Failed to connect to Asana: " + err.message);
      setStep("error");
    }
  };

  const fetchProjectDetail = async (project) => {
    try {
      setSelectedProject(project);
      setStep("loading");
      const detail = await callProxy({ action: "get_project_detail", project_id: project.gid });
      if (detail && detail.sections) {
        setProjectDetail(detail);
        setStep("preview");
      } else {
        setError("Could not load project details.");
        setStep("error");
      }
    } catch (err) {
      setError("Failed to fetch project: " + err.message);
      setStep("error");
    }
  };

  const runImport = async () => {
    if (!projectDetail || !orgId) return;
    setStep("importing");
    try {
      setImportProgress("Creating project...");
      const { data: proj, error: projErr } = await supabase.from("projects").insert({
        org_id: orgId, name: projectDetail.name, description: projectDetail.notes || "",
        status: "active", color: "#3b82f6", owner_id: user?.id, created_by: user?.id,
        metadata: { asana_gid: selectedProject.gid, imported_from: "asana", imported_at: new Date().toISOString() },
      }).select().single();
      if (projErr) throw new Error("Project create failed: " + projErr.message);

      let totalSections = 0, totalTasks = 0;
      for (let si = 0; si < (projectDetail.sections || []).length; si++) {
        const sec = projectDetail.sections[si];
        setImportProgress(`Creating section: ${sec.name} (${si + 1}/${projectDetail.sections.length})`);
        const { data: section, error: secErr } = await supabase.from("sections").insert({
          org_id: orgId, project_id: proj.id, name: sec.name, sort_order: si,
        }).select().single();
        if (secErr) continue;
        totalSections++;

        for (let ti = 0; ti < (sec.tasks || []).length; ti++) {
          const task = sec.tasks[ti];
          const { error: taskErr } = await supabase.from("tasks").insert({
            org_id: orgId, project_id: proj.id, section_id: section.id,
            title: task.name, description: task.notes || "",
            status: task.completed ? "done" : "todo",
            completed_at: task.completed ? new Date().toISOString() : null,
            start_date: task.start_on || null, due_date: task.due_on || null,
            sort_order: ti, created_by: user?.id,
            metadata: { asana_assignee: task.assignee_name || null },
          });
          if (!taskErr) totalTasks++;
        }
      }

      // Add current user as project member
      await supabase.from("project_members").insert({ project_id: proj.id, user_id: user?.id, role: "owner" });

      setImportResult({ projectId: proj.id, projectName: proj.name, sections: totalSections, tasks: totalTasks });
      setStep("done");
    } catch (err) {
      setError("Import failed: " + err.message);
      setStep("error");
    }
  };

  const filtered = asanaProjects.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()));
  const totalPreviewTasks = (projectDetail?.sections || []).reduce((s, sec) => s + (sec.tasks?.length || 0), 0);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(4px)" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "min(640px, 95vw)", maxHeight: "85vh", background: T.surface, borderRadius: 16, border: `1px solid ${T.border}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Header */}
        <div style={{ padding: "18px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 22 }}>🔗</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>Import from Asana</div>
              <div style={{ fontSize: 11, color: T.text3 }}>
                {step === "list" && `${asanaProjects.length} projects`}
                {step === "preview" && `Preview: ${selectedProject?.name}`}
                {step === "importing" && "Importing..."}
                {step === "done" && "Import complete"}
                {step === "loading" && "Connecting to Asana..."}
              </div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", color: T.text3, fontSize: 20, cursor: "pointer", padding: "4px 8px" }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "auto", padding: "16px 20px" }}>

          {step === "loading" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: 40, gap: 12 }}>
              <div style={{ width: 32, height: 32, border: `3px solid ${T.border}`, borderTopColor: T.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              <div style={{ fontSize: 13, color: T.text3 }}>Fetching projects from Asana...</div>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {step === "error" && (
            <div style={{ padding: 20, textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
              <div style={{ fontSize: 13, color: T.red, marginBottom: 16, lineHeight: 1.5 }}>{error}</div>
              <button onClick={() => { setError(null); fetchAsanaProjects(); }} style={{ padding: "8px 20px", borderRadius: 6, background: T.accent, color: "#fff", border: "none", fontSize: 13, cursor: "pointer" }}>Retry</button>
            </div>
          )}

          {step === "list" && (
            <div>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search Asana projects..."
                style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, marginBottom: 12, boxSizing: "border-box", outline: "none" }} />
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {filtered.map(p => (
                  <div key={p.gid} onClick={() => fetchProjectDetail(p)}
                    style={{ padding: "10px 14px", borderRadius: 8, border: `1px solid ${T.border}`, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", transition: "background 0.1s" }}
                    onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{p.name}</div>
                      <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>
                        {p.num_tasks != null ? `${fmt(p.num_tasks)} tasks` : ""}
                        {p.num_incomplete_tasks != null ? ` · ${fmt(p.num_incomplete_tasks)} open` : ""}
                      </div>
                    </div>
                    <span style={{ fontSize: 12, color: T.accent }}>→</span>
                  </div>
                ))}
                {filtered.length === 0 && <div style={{ textAlign: "center", padding: 20, color: T.text3, fontSize: 13 }}>No projects match</div>}
              </div>
            </div>
          )}

          {step === "preview" && projectDetail && (
            <div>
              <div style={{ padding: "12px 16px", background: T.surface2, borderRadius: 10, marginBottom: 16 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 4 }}>{projectDetail.name}</div>
                {projectDetail.notes && <div style={{ fontSize: 12, color: T.text3, lineHeight: 1.5 }}>{projectDetail.notes.slice(0, 300)}</div>}
                <div style={{ display: "flex", gap: 16, marginTop: 8, fontSize: 11, color: T.text2 }}>
                  <span>📋 {projectDetail.sections?.length || 0} sections</span>
                  <span>✅ {totalPreviewTasks} tasks</span>
                </div>
              </div>
              {(projectDetail.sections || []).map((sec, si) => (
                <div key={si} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.accent, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    {sec.name} ({sec.tasks?.length || 0})
                  </div>
                  {(sec.tasks || []).slice(0, 15).map((task, ti) => (
                    <div key={ti} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", fontSize: 12, color: task.completed ? T.text3 : T.text, borderBottom: `1px solid ${T.border}08` }}>
                      <span style={{ fontSize: 10, color: task.completed ? T.green : T.text3 }}>{task.completed ? "✓" : "○"}</span>
                      <span style={{ flex: 1, textDecoration: task.completed ? "line-through" : "none" }}>{task.name}</span>
                      {task.assignee_name && <span style={{ fontSize: 10, color: T.text3, background: T.surface3, padding: "1px 6px", borderRadius: 4 }}>{task.assignee_name}</span>}
                      {task.due_on && <span style={{ fontSize: 10, color: T.text3 }}>{task.due_on}</span>}
                    </div>
                  ))}
                  {(sec.tasks?.length || 0) > 15 && <div style={{ fontSize: 10, color: T.text3, padding: "4px 8px", fontStyle: "italic" }}>+ {sec.tasks.length - 15} more</div>}
                </div>
              ))}
            </div>
          )}

          {step === "importing" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: 40, gap: 12 }}>
              <div style={{ width: 32, height: 32, border: `3px solid ${T.border}`, borderTopColor: T.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              <div style={{ fontSize: 13, color: T.text2, fontWeight: 500 }}>{importProgress}</div>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {step === "done" && importResult && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: 30, gap: 12 }}>
              <div style={{ fontSize: 48 }}>✅</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>Import Complete</div>
              <div style={{ fontSize: 13, color: T.text2, textAlign: "center", lineHeight: 1.6 }}>
                <strong>{importResult.projectName}</strong> imported with {importResult.sections} sections and {importResult.tasks} tasks.
              </div>
              <button onClick={() => { onImported?.(importResult.projectId); onClose(); }}
                style={{ marginTop: 8, padding: "10px 24px", borderRadius: 8, background: T.accent, color: "#fff", border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                Open Project
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        {step === "preview" && (
          <div style={{ padding: "14px 20px", borderTop: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between" }}>
            <button onClick={() => { setProjectDetail(null); setSelectedProject(null); setStep("list"); }}
              style={{ padding: "8px 16px", borderRadius: 6, background: T.surface3, color: T.text2, border: "none", fontSize: 13, cursor: "pointer" }}>← Back</button>
            <button onClick={runImport}
              style={{ padding: "8px 24px", borderRadius: 8, background: T.accent, color: "#fff", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Import {totalPreviewTasks} Tasks →
            </button>
          </div>
        )}
        {step === "list" && (
          <div style={{ padding: "10px 20px", borderTop: `1px solid ${T.border}`, fontSize: 10, color: T.text3, textAlign: "center" }}>Select a project to preview before importing</div>
        )}
      </div>
    </div>
  );
}
