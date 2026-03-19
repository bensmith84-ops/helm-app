"use client";
import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";

const STAGES = [
  { key: "identified", label: "Identified", color: "#6b7280" },
  { key: "outreach_pending", label: "Outreach Pending", color: "#8b5cf6" },
  { key: "outreach_sent", label: "Outreach Sent", color: "#3b82f6" },
  { key: "responded", label: "Responded", color: "#06b6d4" },
  { key: "nda_sent", label: "NDA Sent", color: "#eab308" },
  { key: "nda_signed", label: "NDA Signed", color: "#22c55e" },
  { key: "rfq_sent", label: "RFQ Sent", color: "#f97316" },
  { key: "quote_received", label: "Quote Received", color: "#ec4899" },
  { key: "evaluating", label: "Evaluating", color: "#8b5cf6" },
  { key: "shortlisted", label: "Shortlisted", color: "#22c55e" },
  { key: "awarded", label: "Awarded", color: "#16a34a" },
  { key: "rejected", label: "Rejected", color: "#ef4444" },
];

const CERTIFICATIONS = ["ISO 9001", "ISO 14001", "ISO 22716", "GMP", "EPA Safer Choice", "USDA BioPreferred", "B Corp", "SQF", "BRC", "NSF", "Organic", "Vegan", "Cruelty Free", "FSC", "Fair Trade"];
const SOURCING_TYPES = [
  { value: "toll_manufacturing", label: "Toll Manufacturing (our formula)" },
  { value: "white_label", label: "White Label / Off-the-shelf" },
  { value: "custom_formulation", label: "Custom Formulation (CM formulates)" },
  { value: "packaging", label: "Packaging Sourcing" },
];

function StagePill({ stage }) {
  const s = STAGES.find(x => x.key === stage) || { label: stage, color: T.text3 };
  return <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: s.color + "20", color: s.color }}>{s.label}</span>;
}

// ── Main Sourcing View ──────────────────────────────────────────────────────
export default function SourcingView() {
  const [projects, setProjects] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [view, setView] = useState("pipeline"); // pipeline, list, cms

  useEffect(() => {
    supabase.from("sourcing_projects").select("*").order("created_at", { ascending: false })
      .then(({ data }) => { setProjects(data || []); setLoading(false); });
  }, []);

  if (selected) return <ProjectDetail project={selected} onBack={() => setSelected(null)} onUpdate={p => { setProjects(ps => ps.map(x => x.id === p.id ? p : x)); setSelected(p); }} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ padding: "14px 24px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.text, flex: 1 }}>🔍 CM Sourcing</div>
        <div style={{ display: "flex", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, overflow: "hidden" }}>
          {[["pipeline", "Pipeline"], ["list", "List"], ["cms", "CM Directory"]].map(([k, l]) => (
            <button key={k} onClick={() => setView(k)} style={{ padding: "5px 12px", fontSize: 12, fontWeight: 600, background: view === k ? T.accent : "transparent", color: view === k ? "#fff" : T.text3, border: "none", cursor: "pointer" }}>{l}</button>
          ))}
        </div>
        <button onClick={() => setShowNew(true)} style={{ padding: "6px 14px", fontSize: 12, fontWeight: 600, background: T.accent, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>+ New Sourcing Project</button>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>
        {loading ? <div style={{ color: T.text3, fontSize: 13 }}>Loading...</div> : (
          <>
            {/* Projects list */}
            {(view === "pipeline" || view === "list") && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {projects.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "60px 0", color: T.text3 }}>
                    <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
                    <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>No sourcing projects yet</div>
                    <div style={{ fontSize: 13, maxWidth: 400, margin: "0 auto", lineHeight: 1.6 }}>
                      Create a sourcing project to start finding contract manufacturers. The AI agent will search for CMs, draft outreach emails, manage NDAs, and collect quotes.
                    </div>
                  </div>
                ) : projects.map(p => (
                  <div key={p.id} onClick={() => setSelected(p)} style={{ padding: "16px 20px", borderRadius: 10, border: `1px solid ${T.border}`, background: T.surface, cursor: "pointer", display: "flex", alignItems: "center", gap: 16 }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = T.accent + "60"}
                    onMouseLeave={e => e.currentTarget.style.borderColor = T.border}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 600, color: T.text, marginBottom: 4 }}>{p.name}</div>
                      <div style={{ fontSize: 12, color: T.text3, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: T.accent + "20", color: T.accent }}>{p.status}</span>
                        {(p.sourcing_type || []).map(t => <span key={t} style={{ fontSize: 10, color: T.text3 }}>{t.replace(/_/g, " ")}</span>)}
                        {(p.target_geographies || []).length > 0 && <span>📍 {p.target_geographies.join(", ")}</span>}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", fontSize: 11, color: T.text3 }}>
                      <div>{new Date(p.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* CM Directory */}
            {view === "cms" && <CMDirectory />}
          </>
        )}
      </div>

      {/* New Project Modal */}
      {showNew && <NewProjectModal onClose={() => setShowNew(false)} onCreate={p => { setProjects(ps => [p, ...ps]); setSelected(p); setShowNew(false); }} />}
    </div>
  );
}

// ── New Project Modal ───────────────────────────────────────────────────────
function NewProjectModal({ onClose, onCreate }) {
  const [form, setForm] = useState({
    name: "", description: "", sourcing_type: [], target_geographies: [],
    required_certifications: [], min_capacity_units_month: "", max_moq: "",
    target_unit_cost: "", target_lead_time_days: "", sustainability_requirements: "",
    additional_requirements: "", target_award_date: "", target_production_date: "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const toggleArr = (k, v) => set(k, form[k].includes(v) ? form[k].filter(x => x !== v) : [...form[k], v]);

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const { data: { session } } = await supabase.auth.getSession();
    const userId = session?.user?.id;
    const payload = {
      ...form,
      min_capacity_units_month: form.min_capacity_units_month ? parseInt(form.min_capacity_units_month) : null,
      max_moq: form.max_moq ? parseInt(form.max_moq) : null,
      target_unit_cost: form.target_unit_cost ? parseFloat(form.target_unit_cost) : null,
      target_lead_time_days: form.target_lead_time_days ? parseInt(form.target_lead_time_days) : null,
      target_award_date: form.target_award_date || null,
      target_production_date: form.target_production_date || null,
      owner_id: userId, created_by: userId,
    };
    const { data } = await supabase.from("sourcing_projects").insert(payload).select().single();
    if (data) onCreate(data);
    setSaving(false);
  };

  const inp = { width: "100%", padding: "8px 12px", fontSize: 13, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, outline: "none", fontFamily: "inherit", boxSizing: "border-box" };
  const lbl = { fontSize: 11, fontWeight: 600, color: T.text3, marginBottom: 4, display: "block" };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, width: 600, maxHeight: "85vh", overflow: "auto", padding: 24 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 20 }}>New Sourcing Project</div>

        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Project Name *</label>
          <input value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g., New Dishwasher Sheet CM Search" style={inp} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Description</label>
          <textarea value={form.description} onChange={e => set("description", e.target.value)} placeholder="What are you looking for?" rows={3} style={{ ...inp, resize: "vertical" }} />
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Sourcing Type</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {SOURCING_TYPES.map(t => (
              <button key={t.value} onClick={() => toggleArr("sourcing_type", t.value)}
                style={{ padding: "5px 12px", fontSize: 11, borderRadius: 6, cursor: "pointer", fontWeight: 600,
                  background: form.sourcing_type.includes(t.value) ? T.accent + "20" : T.surface2,
                  border: `1px solid ${form.sourcing_type.includes(t.value) ? T.accent : T.border}`,
                  color: form.sourcing_type.includes(t.value) ? T.accent : T.text3 }}>{t.label}</button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Target Geographies</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {["US", "Canada", "Mexico", "EU", "UK", "China", "India", "Southeast Asia", "Japan", "South Korea", "Australia"].map(g => (
              <button key={g} onClick={() => toggleArr("target_geographies", g)}
                style={{ padding: "4px 10px", fontSize: 11, borderRadius: 6, cursor: "pointer",
                  background: form.target_geographies.includes(g) ? T.accent + "20" : T.surface2,
                  border: `1px solid ${form.target_geographies.includes(g) ? T.accent : T.border}`,
                  color: form.target_geographies.includes(g) ? T.accent : T.text3 }}>{g}</button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <label style={lbl}>Required Certifications</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {CERTIFICATIONS.map(c => (
              <button key={c} onClick={() => toggleArr("required_certifications", c)}
                style={{ padding: "4px 10px", fontSize: 10, borderRadius: 6, cursor: "pointer",
                  background: form.required_certifications.includes(c) ? "#22c55e20" : T.surface2,
                  border: `1px solid ${form.required_certifications.includes(c) ? "#22c55e" : T.border}`,
                  color: form.required_certifications.includes(c) ? "#22c55e" : T.text3 }}>{c}</button>
            ))}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 14 }}>
          <div><label style={lbl}>Min Capacity/mo</label><input type="number" value={form.min_capacity_units_month} onChange={e => set("min_capacity_units_month", e.target.value)} placeholder="units" style={inp} /></div>
          <div><label style={lbl}>Max MOQ</label><input type="number" value={form.max_moq} onChange={e => set("max_moq", e.target.value)} placeholder="units" style={inp} /></div>
          <div><label style={lbl}>Target Unit Cost</label><input type="number" step="0.01" value={form.target_unit_cost} onChange={e => set("target_unit_cost", e.target.value)} placeholder="$" style={inp} /></div>
          <div><label style={lbl}>Target Lead Time</label><input type="number" value={form.target_lead_time_days} onChange={e => set("target_lead_time_days", e.target.value)} placeholder="days" style={inp} /></div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <div><label style={lbl}>Target Award Date</label><input type="date" value={form.target_award_date} onChange={e => set("target_award_date", e.target.value)} style={inp} /></div>
          <div><label style={lbl}>Target Production Date</label><input type="date" value={form.target_production_date} onChange={e => set("target_production_date", e.target.value)} style={inp} /></div>
        </div>

        <div style={{ marginBottom: 20 }}>
          <label style={lbl}>Additional Requirements</label>
          <textarea value={form.additional_requirements} onChange={e => set("additional_requirements", e.target.value)} placeholder="Sustainability needs, specific equipment, etc." rows={2} style={{ ...inp, resize: "vertical" }} />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <button onClick={onClose} style={{ padding: "8px 16px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text3, cursor: "pointer" }}>Cancel</button>
          <button onClick={save} disabled={!form.name.trim() || saving}
            style={{ padding: "8px 20px", fontSize: 12, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", opacity: form.name.trim() ? 1 : 0.4 }}>
            {saving ? "Creating..." : "Create Project"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Project Detail ──────────────────────────────────────────────────────────
function ProjectDetail({ project, onBack, onUpdate }) {
  const [tab, setTab] = useState("pipeline"); // pipeline, discovery, outreach, quotes, settings
  const [projectCms, setProjectCms] = useState([]);
  const [cms, setCms] = useState({});
  const [loading, setLoading] = useState(true);
  const [discovering, setDiscovering] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data: pcms } = await supabase.from("sourcing_project_cms").select("*").eq("project_id", project.id);
      setProjectCms(pcms || []);
      if (pcms?.length) {
        const cmIds = [...new Set(pcms.map(pc => pc.cm_id))];
        const { data: cmData } = await supabase.from("sourcing_cms").select("*").in("id", cmIds);
        const m = {}; (cmData || []).forEach(c => m[c.id] = c); setCms(m);
      }
      setLoading(false);
    };
    load();
  }, [project.id]);

  // AI Discovery
  const runDiscovery = async () => {
    setDiscovering(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      const res = await fetch("https://upbjdmnykheubxkuknuj.supabase.co/functions/v1/sourcing-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}`,
          "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwYmpkbW55a2hldWJ4a3VrbnVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNDI3OTcsImV4cCI6MjA4NzcxODc5N30.pvTTkiZWNDPuo-Fdzm54uy8w1mlx0AjB5jtFm3MeGq4" },
        body: JSON.stringify({ action: "discover", project_id: project.id }),
      });
      const data = await res.json();
      if (data.success && data.cms_found) {
        // Reload project CMs
        const { data: pcms } = await supabase.from("sourcing_project_cms").select("*").eq("project_id", project.id);
        setProjectCms(pcms || []);
        const cmIds = [...new Set((pcms || []).map(pc => pc.cm_id))];
        if (cmIds.length) {
          const { data: cmData } = await supabase.from("sourcing_cms").select("*").in("id", cmIds);
          const m = {}; (cmData || []).forEach(c => m[c.id] = c); setCms(m);
        }
      }
    } catch (e) { console.error("Discovery error:", e); }
    setDiscovering(false);
  };

  const stageCount = (stage) => projectCms.filter(pc => pc.stage === stage).length;
  const TABS = [
    { key: "pipeline", label: "Pipeline", count: projectCms.length },
    { key: "discovery", label: "🤖 AI Discovery" },
    { key: "outreach", label: "Outreach" },
    { key: "quotes", label: "Quotes" },
    { key: "compare", label: "Compare" },
    { key: "settings", label: "Settings" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ padding: "12px 24px", borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <button onClick={onBack} style={{ background: "none", border: "none", fontSize: 14, cursor: "pointer", color: T.text3 }}>← Back</button>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{project.name}</div>
          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: T.accent + "20", color: T.accent }}>{project.status}</span>
          {(project.target_geographies || []).map(g => <span key={g} style={{ fontSize: 10, color: T.text3, background: T.surface2, padding: "2px 6px", borderRadius: 4 }}>📍 {g}</span>)}
        </div>
        <div style={{ display: "flex", gap: 0 }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              style={{ padding: "8px 14px", fontSize: 12, fontWeight: tab === t.key ? 700 : 400, color: tab === t.key ? T.accent : T.text3, background: "none", border: "none", borderBottom: tab === t.key ? `2px solid ${T.accent}` : "2px solid transparent", cursor: "pointer" }}>
              {t.label}{t.count != null ? ` (${t.count})` : ""}
            </button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>
        {/* Pipeline view */}
        {tab === "pipeline" && (
          <div>
            {/* Stage summary */}
            <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
              {STAGES.filter(s => stageCount(s.key) > 0 || ["identified", "outreach_sent", "nda_signed", "quote_received", "awarded"].includes(s.key)).map(s => (
                <div key={s.key} style={{ padding: "8px 14px", borderRadius: 8, background: s.color + "10", border: `1px solid ${s.color}30`, minWidth: 80, textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: s.color }}>{stageCount(s.key)}</div>
                  <div style={{ fontSize: 9, fontWeight: 700, color: s.color, textTransform: "uppercase" }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* CM cards */}
            {loading ? <div style={{ color: T.text3, fontSize: 13 }}>Loading...</div> :
              projectCms.length === 0 ? (
                <div style={{ textAlign: "center", padding: "40px 0", color: T.text3 }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>🤖</div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>No CMs in pipeline yet</div>
                  <div style={{ fontSize: 12, marginBottom: 16 }}>Use AI Discovery to find contract manufacturers, or add them manually</div>
                  <button onClick={runDiscovery} disabled={discovering}
                    style={{ padding: "10px 24px", fontSize: 13, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>
                    {discovering ? "🔍 Searching..." : "🤖 Run AI Discovery"}
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {projectCms.map(pc => {
                    const cm = cms[pc.cm_id];
                    if (!cm) return null;
                    return (
                      <div key={pc.id} style={{ padding: "14px 18px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface, display: "flex", alignItems: "center", gap: 14 }}>
                        <div style={{ width: 40, height: 40, borderRadius: 8, background: T.accent + "15", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>🏭</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{cm.company_name}</span>
                            <StagePill stage={pc.stage} />
                            {cm.ai_fit_score && <span style={{ fontSize: 10, fontWeight: 700, color: cm.ai_fit_score >= 70 ? "#22c55e" : cm.ai_fit_score >= 40 ? "#eab308" : "#ef4444" }}>{cm.ai_fit_score}% fit</span>}
                          </div>
                          <div style={{ fontSize: 11, color: T.text3, marginTop: 3, display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {cm.headquarters_country && <span>📍 {[cm.headquarters_city, cm.headquarters_state, cm.headquarters_country].filter(Boolean).join(", ")}</span>}
                            {cm.website && <a href={cm.website} target="_blank" rel="noopener" style={{ color: T.accent }} onClick={e => e.stopPropagation()}>🌐 Website</a>}
                            {(cm.certifications || []).slice(0, 3).map(c => <span key={c} style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "#22c55e20", color: "#22c55e" }}>{c}</span>)}
                          </div>
                          {cm.ai_fit_reasoning && <div style={{ fontSize: 11, color: T.text3, marginTop: 4, fontStyle: "italic" }}>{cm.ai_fit_reasoning}</div>}
                        </div>
                        <div style={{ textAlign: "right", fontSize: 10, color: T.text3 }}>
                          {pc.outreach_sent_at && <div>Outreach: {new Date(pc.outreach_sent_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>}
                          {pc.quote_submitted_at && <div>Quote: {new Date(pc.quote_submitted_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
          </div>
        )}

        {/* AI Discovery tab */}
        {tab === "discovery" && (() => {
          const [editing, setEditing] = useState(false);
          const [form, setForm] = useState({
            sourcing_type: project.sourcing_type || [],
            target_geographies: project.target_geographies || [],
            required_certifications: project.required_certifications || [],
            min_capacity_units_month: project.min_capacity_units_month || "",
            max_moq: project.max_moq || "",
            target_unit_cost: project.target_unit_cost || "",
            target_lead_time_days: project.target_lead_time_days || "",
            additional_requirements: project.additional_requirements || "",
          });
          const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
          const toggleArr = (k, v) => set(k, form[k].includes(v) ? form[k].filter(x => x !== v) : [...form[k], v]);
          const saveCriteria = async () => {
            const payload = {
              ...form,
              min_capacity_units_month: form.min_capacity_units_month ? parseInt(form.min_capacity_units_month) : null,
              max_moq: form.max_moq ? parseInt(form.max_moq) : null,
              target_unit_cost: form.target_unit_cost ? parseFloat(form.target_unit_cost) : null,
              target_lead_time_days: form.target_lead_time_days ? parseInt(form.target_lead_time_days) : null,
              additional_requirements: form.additional_requirements || null,
              updated_at: new Date().toISOString(),
            };
            await supabase.from("sourcing_projects").update(payload).eq("id", project.id);
            onUpdate({ ...project, ...payload });
            setEditing(false);
          };

          const inp = { width: "100%", padding: "6px 10px", fontSize: 12, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, outline: "none", fontFamily: "inherit", boxSizing: "border-box" };
          const lbl = { fontSize: 10, fontWeight: 700, color: T.text3, marginBottom: 3, display: "block", textTransform: "uppercase", letterSpacing: 0.5 };

          return (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>AI-Powered CM Discovery</div>
                <div style={{ fontSize: 12, color: T.text3, marginTop: 2 }}>The AI will search for contract manufacturers matching your criteria below</div>
              </div>
              <button onClick={runDiscovery} disabled={discovering}
                style={{ padding: "10px 24px", fontSize: 13, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>
                {discovering ? "🔍 Searching..." : "🤖 Find CMs"}
              </button>
            </div>

            {/* Editable Search Criteria */}
            <div style={{ padding: 16, borderRadius: 10, background: T.surface2, border: `1px solid ${T.border}`, marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Search Criteria</div>
                {!editing ? (
                  <button onClick={() => setEditing(true)} style={{ fontSize: 11, color: T.accent, background: "none", border: `1px solid ${T.accent}40`, borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontWeight: 600 }}>✎ Edit Criteria</button>
                ) : (
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => setEditing(false)} style={{ fontSize: 11, color: T.text3, background: "none", border: `1px solid ${T.border}`, borderRadius: 6, padding: "4px 12px", cursor: "pointer" }}>Cancel</button>
                    <button onClick={saveCriteria} style={{ fontSize: 11, color: "#fff", background: T.accent, border: "none", borderRadius: 6, padding: "4px 14px", cursor: "pointer", fontWeight: 700 }}>Save & Update</button>
                  </div>
                )}
              </div>

              {!editing ? (
                /* Read-only display */
                <div style={{ fontSize: 12, color: T.text2, lineHeight: 2 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: T.text3, minWidth: 80 }}>TYPE:</span>
                    {(project.sourcing_type || []).length > 0 ? project.sourcing_type.map(t => (
                      <span key={t} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: T.accent + "15", color: T.accent, fontWeight: 600 }}>{t.replace(/_/g, " ")}</span>
                    )) : <span style={{ fontSize: 11, color: T.text3, fontStyle: "italic" }}>Not set</span>}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: T.text3, minWidth: 80 }}>GEOGRAPHY:</span>
                    {(project.target_geographies || []).length > 0 ? project.target_geographies.map(g => (
                      <span key={g} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "#06b6d415", color: "#06b6d4", fontWeight: 600 }}>📍 {g}</span>
                    )) : <span style={{ fontSize: 11, color: T.text3, fontStyle: "italic" }}>Any</span>}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: T.text3, minWidth: 80 }}>CERTS:</span>
                    {(project.required_certifications || []).length > 0 ? project.required_certifications.map(c => (
                      <span key={c} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, background: "#22c55e15", color: "#22c55e", fontWeight: 600 }}>{c}</span>
                    )) : <span style={{ fontSize: 11, color: T.text3, fontStyle: "italic" }}>None required</span>}
                  </div>
                  <div style={{ display: "flex", gap: 16, marginBottom: 8, flexWrap: "wrap" }}>
                    {project.min_capacity_units_month && <span style={{ fontSize: 11 }}><strong style={{ color: T.text }}>Min Capacity:</strong> {project.min_capacity_units_month.toLocaleString()} units/mo</span>}
                    {project.max_moq && <span style={{ fontSize: 11 }}><strong style={{ color: T.text }}>Max MOQ:</strong> {project.max_moq.toLocaleString()}</span>}
                    {project.target_unit_cost && <span style={{ fontSize: 11 }}><strong style={{ color: T.text }}>Target Cost:</strong> ${project.target_unit_cost}</span>}
                    {project.target_lead_time_days && <span style={{ fontSize: 11 }}><strong style={{ color: T.text }}>Lead Time:</strong> {project.target_lead_time_days} days</span>}
                  </div>
                  {project.additional_requirements && <div style={{ fontSize: 11, color: T.text2, padding: "6px 10px", borderRadius: 6, background: T.surface, border: `1px solid ${T.border}` }}><strong style={{ color: T.text }}>Additional:</strong> {project.additional_requirements}</div>}
                </div>
              ) : (
                /* Editing form */
                <div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={lbl}>Sourcing Type</label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {SOURCING_TYPES.map(t => (
                        <button key={t.value} onClick={() => toggleArr("sourcing_type", t.value)}
                          style={{ padding: "4px 10px", fontSize: 11, borderRadius: 6, cursor: "pointer", fontWeight: 600,
                            background: form.sourcing_type.includes(t.value) ? T.accent + "20" : T.surface,
                            border: `1px solid ${form.sourcing_type.includes(t.value) ? T.accent : T.border}`,
                            color: form.sourcing_type.includes(t.value) ? T.accent : T.text3 }}>{t.label}</button>
                      ))}
                    </div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={lbl}>Target Geographies</label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {["US", "Canada", "Mexico", "EU", "UK", "China", "India", "Southeast Asia", "Japan", "South Korea", "Australia"].map(g => (
                        <button key={g} onClick={() => toggleArr("target_geographies", g)}
                          style={{ padding: "3px 9px", fontSize: 11, borderRadius: 6, cursor: "pointer",
                            background: form.target_geographies.includes(g) ? "#06b6d420" : T.surface,
                            border: `1px solid ${form.target_geographies.includes(g) ? "#06b6d4" : T.border}`,
                            color: form.target_geographies.includes(g) ? "#06b6d4" : T.text3 }}>{g}</button>
                      ))}
                    </div>
                  </div>
                  <div style={{ marginBottom: 12 }}>
                    <label style={lbl}>Required Certifications</label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {CERTIFICATIONS.map(c => (
                        <button key={c} onClick={() => toggleArr("required_certifications", c)}
                          style={{ padding: "3px 8px", fontSize: 10, borderRadius: 6, cursor: "pointer",
                            background: form.required_certifications.includes(c) ? "#22c55e20" : T.surface,
                            border: `1px solid ${form.required_certifications.includes(c) ? "#22c55e" : T.border}`,
                            color: form.required_certifications.includes(c) ? "#22c55e" : T.text3 }}>{c}</button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                    <div><label style={lbl}>Min Capacity/mo</label><input type="number" value={form.min_capacity_units_month} onChange={e => set("min_capacity_units_month", e.target.value)} placeholder="units" style={inp} /></div>
                    <div><label style={lbl}>Max MOQ</label><input type="number" value={form.max_moq} onChange={e => set("max_moq", e.target.value)} placeholder="units" style={inp} /></div>
                    <div><label style={lbl}>Target Unit Cost</label><input type="number" step="0.01" value={form.target_unit_cost} onChange={e => set("target_unit_cost", e.target.value)} placeholder="$" style={inp} /></div>
                    <div><label style={lbl}>Target Lead Time</label><input type="number" value={form.target_lead_time_days} onChange={e => set("target_lead_time_days", e.target.value)} placeholder="days" style={inp} /></div>
                  </div>
                  <div>
                    <label style={lbl}>Additional Requirements</label>
                    <textarea value={form.additional_requirements} onChange={e => set("additional_requirements", e.target.value)} rows={2} placeholder="Sustainability needs, specific equipment, product types..."
                      style={{ ...inp, resize: "vertical" }} />
                  </div>
                </div>
              )}
            </div>

            {projectCms.length > 0 && (
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 8 }}>{projectCms.length} CMs Found</div>
                {projectCms.map(pc => {
                  const cm = cms[pc.cm_id];
                  if (!cm) return null;
                  return (
                    <div key={pc.id} style={{ padding: "12px 16px", borderRadius: 8, border: `1px solid ${T.border}`, marginBottom: 8, background: T.surface }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{cm.company_name}</span>
                        {cm.ai_fit_score && (
                          <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4,
                            background: (cm.ai_fit_score >= 70 ? "#22c55e" : cm.ai_fit_score >= 40 ? "#eab308" : "#ef4444") + "20",
                            color: cm.ai_fit_score >= 70 ? "#22c55e" : cm.ai_fit_score >= 40 ? "#eab308" : "#ef4444" }}>
                            {cm.ai_fit_score}% fit
                          </span>
                        )}
                        <StagePill stage={pc.stage} />
                      </div>
                      {cm.description && <div style={{ fontSize: 12, color: T.text2, marginTop: 4 }}>{cm.description}</div>}
                      <div style={{ fontSize: 11, color: T.text3, marginTop: 4, display: "flex", gap: 12, flexWrap: "wrap" }}>
                        {cm.headquarters_country && <span>📍 {[cm.headquarters_city, cm.headquarters_state, cm.headquarters_country].filter(Boolean).join(", ")}</span>}
                        {cm.website && <a href={cm.website} target="_blank" rel="noopener" style={{ color: T.accent }}>🌐 {cm.website}</a>}
                        {cm.general_email && <span>✉ {cm.general_email}</span>}
                      </div>
                      {(cm.certifications || []).length > 0 && (
                        <div style={{ marginTop: 4, display: "flex", gap: 4, flexWrap: "wrap" }}>
                          {cm.certifications.map(c => <span key={c} style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "#22c55e20", color: "#22c55e", fontWeight: 600 }}>{c}</span>)}
                        </div>
                      )}
                      {cm.ai_fit_reasoning && <div style={{ fontSize: 11, color: T.text3, marginTop: 6, padding: "6px 10px", background: T.surface2, borderRadius: 4, fontStyle: "italic" }}>💡 {cm.ai_fit_reasoning}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );})()}

        {/* Placeholder tabs */}
        {tab === "outreach" && <div style={{ color: T.text3, textAlign: "center", padding: 40 }}>📧 Outreach management coming next — draft, approve, and track emails to CMs</div>}
        {tab === "quotes" && <div style={{ color: T.text3, textAlign: "center", padding: 40 }}>📊 Quote collection and comparison coming soon</div>}
        {tab === "compare" && <div style={{ color: T.text3, textAlign: "center", padding: 40 }}>⚖️ Side-by-side CM comparison matrix coming soon</div>}
        {tab === "settings" && <div style={{ color: T.text3, textAlign: "center", padding: 40 }}>⚙️ Project settings</div>}
      </div>
    </div>
  );
}

// ── CM Directory ────────────────────────────────────────────────────────────
function CMDirectory() {
  const [cms, setCms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    supabase.from("sourcing_cms").select("*").order("company_name").then(({ data }) => { setCms(data || []); setLoading(false); });
  }, []);

  const filtered = cms.filter(c => !search || c.company_name?.toLowerCase().includes(search.toLowerCase()) || c.headquarters_country?.toLowerCase().includes(search.toLowerCase()));

  if (loading) return <div style={{ color: T.text3, fontSize: 13 }}>Loading CM directory...</div>;

  return (
    <div>
      <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "center" }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>CM Directory ({cms.length})</div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search CMs..."
          style={{ padding: "6px 12px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, outline: "none", width: 220 }} />
      </div>
      {filtered.length === 0 ? (
        <div style={{ textAlign: "center", padding: 40, color: T.text3, fontSize: 13 }}>No CMs in directory yet. Run AI Discovery from a sourcing project to populate.</div>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${T.border}` }}>
              {["Company", "Location", "Certifications", "Status", "Fit Score", "Source"].map(h => (
                <th key={h} style={{ padding: "6px 8px", textAlign: "left", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <tr key={c.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                <td style={{ padding: "8px", fontWeight: 600, color: T.text }}>{c.company_name}{c.website && <a href={c.website} target="_blank" rel="noopener" style={{ marginLeft: 6, color: T.accent, fontSize: 10 }}>↗</a>}</td>
                <td style={{ padding: "8px", color: T.text3 }}>{[c.headquarters_city, c.headquarters_state, c.headquarters_country].filter(Boolean).join(", ") || "—"}</td>
                <td style={{ padding: "8px" }}>{(c.certifications || []).map(cert => <span key={cert} style={{ fontSize: 9, padding: "1px 4px", borderRadius: 3, background: "#22c55e20", color: "#22c55e", marginRight: 3 }}>{cert}</span>)}</td>
                <td style={{ padding: "8px" }}><StagePill stage={c.status} /></td>
                <td style={{ padding: "8px", fontWeight: 700, color: c.ai_fit_score >= 70 ? "#22c55e" : c.ai_fit_score >= 40 ? "#eab308" : T.text3 }}>{c.ai_fit_score ? `${c.ai_fit_score}%` : "—"}</td>
                <td style={{ padding: "8px", color: T.text3 }}>{c.source || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
// deploy trigger 1773886342
