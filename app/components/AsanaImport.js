"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { T } from "../tokens";

const fmt = n => n == null ? "0" : Number(n).toLocaleString();

export default function AsanaImportModal({ onClose, onImported }) {
  const { user, profile, orgId } = useAuth();
  const [step, setStep] = useState("loading"); // loading | list | preview | importing | done | error
  const [asanaProjects, setAsanaProjects] = useState([]);
  const [selectedProject, setSelectedProject] = useState(null);
  const [projectDetail, setProjectDetail] = useState(null); // { name, notes, sections: [{ name, tasks: [{ name, notes, assignee, due_on, completed }] }] }
  const [search, setSearch] = useState("");
  const [error, setError] = useState(null);
  const [importProgress, setImportProgress] = useState("");
  const [importResult, setImportResult] = useState(null);

  // Step 1: Fetch Asana projects list via Anthropic API + Asana MCP
  useEffect(() => {
    fetchAsanaProjects();
  }, []);

  const callClaude = async (prompt, systemPrompt) => {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: systemPrompt || "You are a data extraction assistant. Return ONLY valid JSON, no markdown, no explanation.",
        messages: [{ role: "user", content: prompt }],
        mcp_servers: [{ type: "url", url: "https://mcp.asana.com/v2/mcp", name: "asana-mcp" }],
      }),
    });
    const data = await res.json();
    // Extract text from response
    const textBlocks = (data.content || []).filter(b => b.type === "text").map(b => b.text);
    const toolResults = (data.content || []).filter(b => b.type === "mcp_tool_result").map(b => b.content?.[0]?.text || "");
    return { text: textBlocks.join("\n"), toolResults, raw: data };
  };

  const fetchAsanaProjects = async () => {
    try {
      setStep("loading");
      const { text, toolResults } = await callClaude(
        `List all projects from Asana. Return ONLY a JSON array of objects with these fields: gid, name, num_tasks, num_incomplete_tasks. No other text. Example: [{"gid":"123","name":"My Project","num_tasks":10,"num_incomplete_tasks":5}]`,
        "You are a data extraction assistant. Use the Asana MCP tools to list all projects (limit 100). Return ONLY a valid JSON array of project objects with gid, name, num_tasks, num_incomplete_tasks. No markdown, no explanation, no backticks."
      );
      
      // Try to parse from text first, then tool results
      let projects = null;
      for (const src of [text, ...toolResults]) {
        try {
          const clean = src.replace(/```json|```/g, "").trim();
          const parsed = JSON.parse(clean);
          if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].gid) {
            projects = parsed;
            break;
          }
        } catch {}
      }
      
      if (!projects) {
        // Fallback: try to extract JSON array from the combined text
        const combined = [text, ...toolResults].join("\n");
        const match = combined.match(/\[[\s\S]*?\]/);
        if (match) {
          try { projects = JSON.parse(match[0]); } catch {}
        }
      }
      
      if (projects && projects.length > 0) {
        setAsanaProjects(projects);
        setStep("list");
      } else {
        setError("Could not load Asana projects. The response didn't contain project data.");
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
      
      const { text } = await callClaude(
        `Get the Asana project with GID "${project.gid}" including its sections. Then for each section, get the tasks in that section (include name, notes, assignee name, due_on, start_on, completed status). Return ONLY a JSON object like:
{
  "name": "Project Name",
  "notes": "Project description",
  "sections": [
    {
      "name": "Section Name",
      "tasks": [
        { "name": "Task Name", "notes": "description", "assignee_name": "Person", "due_on": "2026-01-15", "start_on": "2026-01-10", "completed": false }
      ]
    }
  ]
}
No other text, no markdown.`,
        "You are a data extraction assistant. Use the Asana MCP tools to get the project details with sections, then get tasks for each section. Return ONLY valid JSON with the project structure. No markdown, no backticks, no explanation."
      );
      
      let detail = null;
      try {
        const clean = text.replace(/```json|```/g, "").trim();
        detail = JSON.parse(clean);
      } catch {
        // Try to find JSON object in text
        const match = text.match(/\{[\s\S]*\}/);
        if (match) {
          try { detail = JSON.parse(match[0]); } catch {}
        }
      }
      
      if (detail && detail.sections) {
        setProjectDetail(detail);
        setStep("preview");
      } else {
        setError("Could not parse project details from Asana.");
        setStep("error");
      }
    } catch (err) {
      setError("Failed to fetch project details: " + err.message);
      setStep("error");
    }
  };

  const runImport = async () => {
    if (!projectDetail || !orgId) return;
    setStep("importing");
    
    try {
      // 1. Create the project in Helm
      setImportProgress("Creating project...");
      const { data: proj, error: projErr } = await supabase.from("projects").insert({
        org_id: orgId,
        name: projectDetail.name,
        description: projectDetail.notes || "",
        status: "active",
        color: "#3b82f6",
        owner_id: user?.id,
        created_by: user?.id,
        metadata: { asana_gid: selectedProject.gid, imported_from: "asana", imported_at: new Date().toISOString() },
      }).select().single();
      
      if (projErr) throw new Error("Project create failed: " + projErr.message);
      
      let totalSections = 0;
      let totalTasks = 0;
      
      // 2. Create sections and tasks
      for (let si = 0; si < (projectDetail.sections || []).length; si++) {
        const sec = projectDetail.sections[si];
        setImportProgress(`Creating section: ${sec.name} (${si + 1}/${projectDetail.sections.length})`);
        
        const { data: section, error: secErr } = await supabase.from("sections").insert({
          org_id: orgId,
          project_id: proj.id,
          name: sec.name,
          sort_order: si,
        }).select().single();
        
        if (secErr) { console.error("Section error:", secErr); continue; }
        totalSections++;
        
        // 3. Create tasks in this section
        for (let ti = 0; ti < (sec.tasks || []).length; ti++) {
          const task = sec.tasks[ti];
          const { error: taskErr } = await supabase.from("tasks").insert({
            org_id: orgId,
            project_id: proj.id,
            section_id: section.id,
            title: task.name,
            description: task.notes || "",
            status: task.completed ? "done" : "todo",
            completed_at: task.completed ? new Date().toISOString() : null,
            start_date: task.start_on || null,
            due_date: task.due_on || null,
            sort_order: ti,
            created_by: user?.id,
            metadata: { asana_assignee: task.assignee_name || null },
          });
          
          if (!taskErr) totalTasks++;
        }
      }
      
      setImportResult({
        projectId: proj.id,
        projectName: proj.name,
        sections: totalSections,
        tasks: totalTasks,
      });
      setStep("done");
      
    } catch (err) {
      setError("Import failed: " + err.message);
      setStep("error");
    }
  };

  const filtered = asanaProjects.filter(p => 
    !search || p.name.toLowerCase().includes(search.toLowerCase())
  );

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
                {step === "list" && `${asanaProjects.length} projects found`}
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
          
          {/* Loading */}
          {step === "loading" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, gap: 12 }}>
              <div style={{ width: 32, height: 32, border: `3px solid ${T.border}`, borderTopColor: T.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              <div style={{ fontSize: 13, color: T.text3 }}>Connecting to Asana via AI...</div>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* Error */}
          {step === "error" && (
            <div style={{ padding: 20, textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>⚠️</div>
              <div style={{ fontSize: 13, color: T.red, marginBottom: 16 }}>{error}</div>
              <button onClick={() => { setError(null); fetchAsanaProjects(); }} style={{ padding: "8px 20px", borderRadius: 6, background: T.accent, color: "#fff", border: "none", fontSize: 13, cursor: "pointer" }}>Retry</button>
            </div>
          )}

          {/* Project List */}
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
                        {p.num_incomplete_tasks != null ? ` · ${fmt(p.num_incomplete_tasks)} incomplete` : ""}
                      </div>
                    </div>
                    <span style={{ fontSize: 12, color: T.accent }}>→</span>
                  </div>
                ))}
                {filtered.length === 0 && (
                  <div style={{ textAlign: "center", padding: 20, color: T.text3, fontSize: 13 }}>No projects match your search</div>
                )}
              </div>
            </div>
          )}

          {/* Preview */}
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
                  {(sec.tasks || []).slice(0, 10).map((task, ti) => (
                    <div key={ti} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", fontSize: 12, color: task.completed ? T.text3 : T.text, borderBottom: `1px solid ${T.border}08` }}>
                      <span style={{ fontSize: 10, color: task.completed ? T.green : T.text3 }}>{task.completed ? "✓" : "○"}</span>
                      <span style={{ flex: 1, textDecoration: task.completed ? "line-through" : "none" }}>{task.name}</span>
                      {task.assignee_name && <span style={{ fontSize: 10, color: T.text3 }}>{task.assignee_name}</span>}
                      {task.due_on && <span style={{ fontSize: 10, color: T.text3 }}>{task.due_on}</span>}
                    </div>
                  ))}
                  {(sec.tasks?.length || 0) > 10 && (
                    <div style={{ fontSize: 10, color: T.text3, padding: "4px 8px", fontStyle: "italic" }}>+ {sec.tasks.length - 10} more tasks</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Importing */}
          {step === "importing" && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40, gap: 12 }}>
              <div style={{ width: 32, height: 32, border: `3px solid ${T.border}`, borderTopColor: T.accent, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              <div style={{ fontSize: 13, color: T.text2, fontWeight: 500 }}>{importProgress}</div>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}

          {/* Done */}
          {step === "done" && importResult && (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: 30, gap: 12 }}>
              <div style={{ fontSize: 48 }}>✅</div>
              <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>Import Complete</div>
              <div style={{ fontSize: 13, color: T.text2, textAlign: "center", lineHeight: 1.6 }}>
                <strong>{importResult.projectName}</strong> has been imported with {importResult.sections} sections and {importResult.tasks} tasks.
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
          <div style={{ padding: "14px 20px", borderTop: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <button onClick={() => { setProjectDetail(null); setSelectedProject(null); setStep("list"); }}
              style={{ padding: "8px 16px", borderRadius: 6, background: T.surface3, color: T.text2, border: "none", fontSize: 13, cursor: "pointer" }}>
              ← Back
            </button>
            <button onClick={runImport}
              style={{ padding: "8px 24px", borderRadius: 8, background: T.accent, color: "#fff", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Import {totalPreviewTasks} Tasks →
            </button>
          </div>
        )}

        {step === "list" && (
          <div style={{ padding: "10px 20px", borderTop: `1px solid ${T.border}`, fontSize: 10, color: T.text3, textAlign: "center" }}>
            Select a project to preview before importing
          </div>
        )}
      </div>
    </div>
  );
}
