"use client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";
import { useAuth } from "../lib/auth";

// ━━━ CONSTANTS ━━━
const STAGES = [
  { id: "ideation", label: "Ideation", icon: "💡", color: "#a78bfa" },
  { id: "concept", label: "Concept", icon: "🎯", color: "#c084fc" },
  { id: "feasibility", label: "Feasibility", icon: "🔬", color: "#06b6d4" },
  { id: "development", label: "Development", icon: "⚙️", color: "#3b82f6" },
  { id: "pilot", label: "Pilot", icon: "🧪", color: "#f97316" },
  { id: "validation", label: "Validation", icon: "✅", color: "#eab308" },
  { id: "scale_up", label: "Scale-Up", icon: "📈", color: "#22c55e" },
  { id: "launch_prep", label: "Launch Prep", icon: "🚀", color: "#84cc16" },
  { id: "launched", label: "Launched", icon: "🏆", color: "#10b981" },
  { id: "post_launch", label: "Post Launch", icon: "📊", color: "#059669" },
];
const PRIORITY_CFG = { critical: { color: "#ef4444", bg: "#ef444415" }, high: { color: "#f97316", bg: "#f9731615" }, medium: { color: "#eab308", bg: "#eab30815" }, low: { color: "#22c55e", bg: "#22c55e15" }, exploratory: { color: "#8b5cf6", bg: "#8b5cf615" } };
const PROGRAM_TYPES = ["new_product","line_extension","reformulation","cost_reduction","packaging_change","claim_addition","market_expansion","renovation","discontinuation","private_label","co_manufacturing"];
const DOE_DESIGNS = ["full_factorial","fractional_factorial","plackett_burman","box_behnken","central_composite","taguchi","mixture_design","simplex_lattice","d_optimal","one_factor_at_a_time","screening","optimization","response_surface","custom","none"];
const EXP_TYPES = ["formulation","process","stability","efficacy","safety","sensory","packaging","shelf_life","bioavailability","dissolution","compatibility","preservative_challenge","microbial","other"];
const TRIAL_TYPES = ["lab_bench","pilot","scale_up","first_production","validation","process_optimization","troubleshooting","stability_batch","registration_batch","commercial"];
const ISSUE_TYPES = ["formulation","process","stability","quality","regulatory","supply_chain","equipment","packaging","labeling","safety","efficacy","consumer_complaint","deviation","capa","other"];
const ISSUE_SEVERITY = ["critical","major","minor","observation"];
const CLAIM_TYPES = ["efficacy","safety","comparative","sensory","ingredient","natural","organic","clinical","dermatologist_tested","consumer_perception","sustainability","patent","structure_function","nutrient_content","health"];
const FORM_TYPES = ["liquid","cream","gel","powder","tablet","capsule","softgel","gummy","bar","spray","foam","serum","oil","paste","suspension","emulsion","solution","ointment","patch","film","sachet","other"];
const TEST_CATEGORIES = ["physical","chemical","microbiological","stability","efficacy","safety","sensory","consumer","packaging","environmental","bioavailability","dissolution","compatibility","clinical","raw_material","finished_product"];
const STABILITY_TYPES = ["real_time","accelerated","intermediate","photostability","in_use","freeze_thaw","cycling","ongoing","confirmatory"];

const now = () => new Date().toISOString();
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
const fmtShort = (d) => d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—";
const pill = (label, color, bg) => ({ display: "inline-block", padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 600, color, background: bg || color + "15" });

// ━━━ MAIN COMPONENT ━━━
export default function PLMView() {
  const { user, profile } = useAuth();
  const orgId = profile?.org_id;

  // ── Core state ──
  const [programs, setPrograms] = useState([]);
  const [activeProgram, setActiveProgram] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("pipeline"); // pipeline | programs | ingredients | ideas
  const [subTab, setSubTab] = useState("overview"); // overview | formulations | experiments | trials | stability | skus | claims | issues | ai
  const [search, setSearch] = useState("");

  // ── Sub-data (loaded per program) ──
  const [formulations, setFormulations] = useState([]);
  const [formulaItems, setFormulaItems] = useState([]);
  const [experiments, setExperiments] = useState([]);
  const [trials, setTrials] = useState([]);
  const [testResults, setTestResults] = useState([]);
  const [stabilityStudies, setStabilityStudies] = useState([]);
  const [skus, setSkus] = useState([]);
  const [claims, setClaims] = useState([]);
  const [benefits, setBenefits] = useState([]);
  const [issues, setIssues] = useState([]);
  const [gateReviews, setGateReviews] = useState([]);
  const [ideas, setIdeas] = useState([]);
  const [ingredients, setIngredients] = useState([]);

  // ── AI state ──
  const [aiAction, setAiAction] = useState("formulation_advisor");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiResponse, setAiResponse] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiHistory, setAiHistory] = useState([]);

  // ── Detail panels ──
  const [selectedFormulation, setSelectedFormulation] = useState(null);
  const [selectedExperiment, setSelectedExperiment] = useState(null);
  const [selectedTrial, setSelectedTrial] = useState(null);
  const [selectedIssue, setSelectedIssue] = useState(null);

  // ── Load programs ──
  useEffect(() => {
    if (!orgId) return;
    (async () => {
      const { data } = await supabase.from("plm_programs").select("*").eq("org_id", orgId).is("deleted_at", null).order("created_at", { ascending: false });
      setPrograms(data || []);
      // Also load global ingredients and ideas
      const [{ data: ing }, { data: ideasData }] = await Promise.all([
        supabase.from("plm_ingredients").select("*").eq("org_id", orgId).eq("is_active", true).order("name"),
        supabase.from("plm_ideas").select("*").eq("org_id", orgId).order("created_at", { ascending: false }),
      ]);
      setIngredients(ing || []);
      setIdeas(ideasData || []);
      setLoading(false);
    })();
  }, [orgId]);

  // ── Load program detail data ──
  const loadProgramData = async (programId) => {
    const [f, fi, e, t, tr, ss, s, c, b, i, gr] = await Promise.all([
      supabase.from("plm_formulations").select("*").eq("program_id", programId).order("created_at"),
      supabase.from("plm_formula_items").select("*,plm_ingredients(name,inci_name)").order("sort_order"),
      supabase.from("plm_experiments").select("*").eq("program_id", programId).order("created_at", { ascending: false }),
      supabase.from("plm_manufacturing_trials").select("*").eq("program_id", programId).order("created_at", { ascending: false }),
      supabase.from("plm_test_results").select("*").eq("program_id", programId).order("tested_date", { ascending: false }).limit(200),
      supabase.from("plm_stability_studies").select("*").eq("program_id", programId).order("created_at", { ascending: false }),
      supabase.from("plm_skus").select("*").eq("program_id", programId).order("created_at"),
      supabase.from("plm_claims").select("*").eq("program_id", programId).order("priority"),
      supabase.from("plm_benefits").select("*").eq("program_id", programId).order("sort_order"),
      supabase.from("plm_issues").select("*").eq("program_id", programId).order("created_at", { ascending: false }),
      supabase.from("plm_gate_reviews").select("*").eq("program_id", programId).order("created_at"),
    ]);
    setFormulations(f.data || []);
    // Filter formula items to this program's formulations
    const fIds = (f.data || []).map(ff => ff.id);
    setFormulaItems((fi.data || []).filter(item => fIds.includes(item.formulation_id)));
    setExperiments(e.data || []);
    setTrials(t.data || []);
    setTestResults(tr.data || []);
    setStabilityStudies(ss.data || []);
    setSkus(s.data || []);
    setClaims(c.data || []);
    setBenefits(b.data || []);
    setIssues(i.data || []);
    setGateReviews(gr.data || []);
  };

  const openProgram = async (prog) => {
    setActiveProgram(prog);
    setSubTab("overview");
    await loadProgramData(prog.id);
  };

  // ── CRUD helpers ──
  const createProgram = async () => {
    const { data } = await supabase.from("plm_programs").insert({
      org_id: orgId, name: "New Program", program_type: "new_product", current_stage: "ideation", priority: "medium", created_by: user?.id,
    }).select().single();
    if (data) { setPrograms(p => [data, ...p]); openProgram(data); }
  };

  const updateProgram = async (id, upd) => {
    await supabase.from("plm_programs").update({ ...upd, updated_at: now() }).eq("id", id);
    setPrograms(p => p.map(pr => pr.id === id ? { ...pr, ...upd } : pr));
    if (activeProgram?.id === id) setActiveProgram(p => ({ ...p, ...upd }));
  };

  const createFormulation = async () => {
    if (!activeProgram) return;
    const { data } = await supabase.from("plm_formulations").insert({
      program_id: activeProgram.id, name: `Formula v${formulations.length + 1}.0`, version: `${formulations.length + 1}.0`, status: "draft", created_by: user?.id,
    }).select().single();
    if (data) setFormulations(p => [...p, data]);
  };

  const createExperiment = async () => {
    if (!activeProgram) return;
    const { data } = await supabase.from("plm_experiments").insert({
      program_id: activeProgram.id, name: `Experiment ${experiments.length + 1}`, experiment_type: "formulation", doe_design: "none", status: "planning", created_by: user?.id,
      factors: [], responses: [], run_matrix: [],
    }).select().single();
    if (data) { setExperiments(p => [data, ...p]); setSelectedExperiment(data); }
  };

  const createTrial = async () => {
    if (!activeProgram) return;
    const { data } = await supabase.from("plm_manufacturing_trials").insert({
      program_id: activeProgram.id, trial_number: `T-${String(trials.length + 1).padStart(3, "0")}`, name: `Trial ${trials.length + 1}`, trial_type: "lab_bench", status: "planned", created_by: user?.id,
    }).select().single();
    if (data) { setTrials(p => [data, ...p]); setSelectedTrial(data); }
  };

  const createIssue = async () => {
    if (!activeProgram) return;
    const { data } = await supabase.from("plm_issues").insert({
      org_id: orgId, program_id: activeProgram.id, title: "New Issue", issue_type: "formulation", severity: "minor", status: "open", reported_by: user?.id,
    }).select().single();
    if (data) { setIssues(p => [data, ...p]); setSelectedIssue(data); }
  };

  const createClaim = async () => {
    if (!activeProgram) return;
    const { data } = await supabase.from("plm_claims").insert({
      program_id: activeProgram.id, claim_text: "New claim", claim_type: "efficacy", status: "proposed", created_by: user?.id,
    }).select().single();
    if (data) setClaims(p => [...p, data]);
  };

  const createSKU = async () => {
    if (!activeProgram) return;
    const { data } = await supabase.from("plm_skus").insert({
      program_id: activeProgram.id, sku_code: `SKU-${Date.now().toString(36).toUpperCase()}`, name: "New SKU", status: "draft", created_by: user?.id,
    }).select().single();
    if (data) setSkus(p => [...p, data]);
  };

  const createStability = async () => {
    if (!activeProgram) return;
    const { data } = await supabase.from("plm_stability_studies").insert({
      program_id: activeProgram.id, study_name: `Stability Study ${stabilityStudies.length + 1}`, study_type: "real_time", status: "planned", created_by: user?.id,
    }).select().single();
    if (data) setStabilityStudies(p => [data, ...p]);
  };

  // ── AI Call ──
  const callAI = async () => {
    if (!aiPrompt.trim()) return;
    setAiLoading(true);
    setAiResponse("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/plm-ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          action: aiAction,
          program_id: activeProgram?.id,
          context: {
            question: aiPrompt,
            formula: selectedFormulation ? { items: formulaItems.filter(fi => fi.formulation_id === selectedFormulation.id), ...selectedFormulation } : undefined,
            experiment: selectedExperiment || undefined,
            trial: selectedTrial || undefined,
            issue: selectedIssue?.title || undefined,
          },
        }),
      });
      const result = await resp.json();
      if (result.success) {
        setAiResponse(result.response);
        setAiHistory(h => [{ action: aiAction, prompt: aiPrompt, response: result.response, ts: now() }, ...h].slice(0, 20));
      } else {
        setAiResponse(`Error: ${result.error}`);
      }
    } catch (e) { setAiResponse(`Error: ${e.message}`); }
    setAiLoading(false);
  };

  // ── Shared styles ──
  const cardS = { padding: "14px 16px", borderRadius: 10, background: T.surface, border: `1px solid ${T.border}`, cursor: "pointer", marginBottom: 6 };
  const btnS = { padding: "6px 14px", fontSize: 12, fontWeight: 600, borderRadius: 6, border: "none", background: T.accent, color: "#fff", cursor: "pointer" };
  const btnOutS = { ...btnS, background: "transparent", border: `1px solid ${T.border}`, color: T.text2 };
  const labelS = { fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4, display: "block" };
  const inputS = { padding: "7px 10px", fontSize: 13, color: T.text, background: T.surface2 || T.surface, border: `1px solid ${T.border}`, borderRadius: 6, outline: "none", fontFamily: "inherit", width: "100%" };
  const selectS = { ...inputS, cursor: "pointer" };

  if (loading) return <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: T.text3, fontSize: 13 }}>Loading PLM…</div>;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PROGRAM DETAIL VIEW
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  if (activeProgram) {
    const prog = activeProgram;
    const stg = STAGES.find(s => s.id === prog.current_stage) || STAGES[0];
    const priCfg = PRIORITY_CFG[prog.priority] || PRIORITY_CFG.medium;

    return (
      <div style={{ display: "flex", height: "100%", overflow: "hidden", background: T.bg }}>
        {/* Left nav */}
        <div style={{ width: 220, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", background: T.surface, flexShrink: 0 }}>
          <button onClick={() => { setActiveProgram(null); setSubTab("overview"); }} style={{ padding: "12px 16px", textAlign: "left", border: "none", background: "transparent", color: T.text3, fontSize: 12, cursor: "pointer", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 6 }}>
            ← All Programs
          </button>
          <div style={{ padding: "12px 16px" }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{prog.name}</div>
            <div style={{ display: "flex", gap: 6 }}>
              <span style={pill(stg.color, stg.color + "20")}>{stg.icon} {stg.label}</span>
              <span style={pill(priCfg.color, priCfg.bg)}>{prog.priority}</span>
            </div>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: "0 8px" }}>
            {[
              { id: "overview", icon: "📋", label: "Overview", count: null },
              { id: "formulations", icon: "🧪", label: "Formulations", count: formulations.length },
              { id: "experiments", icon: "🔬", label: "DOE / Experiments", count: experiments.length },
              { id: "trials", icon: "🏭", label: "Mfg Trials", count: trials.length },
              { id: "stability", icon: "📊", label: "Stability", count: stabilityStudies.length },
              { id: "skus", icon: "📦", label: "SKUs", count: skus.length },
              { id: "claims", icon: "📜", label: "Claims", count: claims.length },
              { id: "issues", icon: "⚠️", label: "Issues", count: issues.filter(i => i.status !== "closed").length },
              { id: "ai", icon: "✦", label: "AI Advisor", count: null },
            ].map(t => (
              <button key={t.id} onClick={() => setSubTab(t.id)} style={{
                width: "100%", textAlign: "left", padding: "8px 12px", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 12, marginBottom: 1,
                background: subTab === t.id ? `${T.accent}15` : "transparent", color: subTab === t.id ? T.text : T.text2, fontWeight: subTab === t.id ? 600 : 400,
                display: "flex", alignItems: "center", gap: 8,
              }}>
                <span>{t.icon}</span><span style={{ flex: 1 }}>{t.label}</span>
                {t.count !== null && t.count > 0 && <span style={{ fontSize: 10, color: T.text3, fontWeight: 600 }}>{t.count}</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Main content */}
        <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
          {/* ── OVERVIEW ── */}
          {subTab === "overview" && <ProgramOverview prog={prog} updateProgram={updateProgram} formulations={formulations} experiments={experiments} trials={trials} claims={claims} issues={issues} skus={skus} gateReviews={gateReviews} benefits={benefits} stg={stg} inputS={inputS} selectS={selectS} labelS={labelS} />}

          {/* ── FORMULATIONS ── */}
          {subTab === "formulations" && <FormulationsTab formulations={formulations} setFormulations={setFormulations} formulaItems={formulaItems} setFormulaItems={setFormulaItems} ingredients={ingredients} createFormulation={createFormulation} selectedFormulation={selectedFormulation} setSelectedFormulation={setSelectedFormulation} programId={activeProgram.id} btnS={btnS} cardS={cardS} inputS={inputS} selectS={selectS} labelS={labelS} />}

          {/* ── DOE / EXPERIMENTS ── */}
          {subTab === "experiments" && <ExperimentsTab experiments={experiments} setExperiments={setExperiments} createExperiment={createExperiment} selectedExperiment={selectedExperiment} setSelectedExperiment={setSelectedExperiment} formulations={formulations} callAI={callAI} setAiAction={setAiAction} setAiPrompt={setAiPrompt} setSubTab={setSubTab} btnS={btnS} cardS={cardS} inputS={inputS} selectS={selectS} labelS={labelS} />}

          {/* ── MANUFACTURING TRIALS ── */}
          {subTab === "trials" && <TrialsTab trials={trials} setTrials={setTrials} createTrial={createTrial} selectedTrial={selectedTrial} setSelectedTrial={setSelectedTrial} formulations={formulations} skus={skus} callAI={callAI} setAiAction={setAiAction} setAiPrompt={setAiPrompt} setSubTab={setSubTab} btnS={btnS} cardS={cardS} inputS={inputS} selectS={selectS} labelS={labelS} />}

          {/* ── STABILITY ── */}
          {subTab === "stability" && <StabilityTab studies={stabilityStudies} setStudies={setStabilityStudies} createStability={createStability} formulations={formulations} skus={skus} btnS={btnS} cardS={cardS} inputS={inputS} selectS={selectS} labelS={labelS} />}

          {/* ── SKUs ── */}
          {subTab === "skus" && <SKUsTab skus={skus} setSkus={setSkus} createSKU={createSKU} formulations={formulations} btnS={btnS} cardS={cardS} inputS={inputS} selectS={selectS} labelS={labelS} />}

          {/* ── CLAIMS ── */}
          {subTab === "claims" && <ClaimsTab claims={claims} setClaims={setClaims} benefits={benefits} setBenefits={setBenefits} createClaim={createClaim} programId={activeProgram.id} callAI={callAI} setAiAction={setAiAction} setAiPrompt={setAiPrompt} setSubTab={setSubTab} btnS={btnS} cardS={cardS} inputS={inputS} selectS={selectS} labelS={labelS} />}

          {/* ── ISSUES ── */}
          {subTab === "issues" && <IssuesTab issues={issues} setIssues={setIssues} createIssue={createIssue} selectedIssue={selectedIssue} setSelectedIssue={setSelectedIssue} callAI={callAI} setAiAction={setAiAction} setAiPrompt={setAiPrompt} setSubTab={setSubTab} btnS={btnS} cardS={cardS} inputS={inputS} selectS={selectS} labelS={labelS} />}

          {/* ── AI ADVISOR ── */}
          {subTab === "ai" && <AIAdvisorTab aiAction={aiAction} setAiAction={setAiAction} aiPrompt={aiPrompt} setAiPrompt={setAiPrompt} aiResponse={aiResponse} aiLoading={aiLoading} aiHistory={aiHistory} callAI={callAI} btnS={btnS} inputS={inputS} selectS={selectS} labelS={labelS} />}
        </div>
      </div>
    );
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // MAIN DASHBOARD (no program selected)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  const filteredPrograms = programs.filter(p => !search || p.name?.toLowerCase().includes(search.toLowerCase()));
  const pipeline = STAGES.map(s => ({ ...s, programs: filteredPrograms.filter(p => p.current_stage === s.id) }));
  const activeCount = programs.filter(p => !["launched","post_launch","discontinued"].includes(p.current_stage)).length;
  const openIssuesGlobal = ideas.filter(i => i.status === "submitted" || i.status === "under_review").length;

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden", flexDirection: "column", background: T.bg }}>
      {/* Header */}
      <div style={{ padding: "16px 24px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Product Lifecycle Management</h2>
          <div style={{ fontSize: 12, color: T.text3, marginTop: 2 }}>{programs.length} programs · {activeCount} active · {ideas.length} ideas</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 6, background: T.surface2, border: `1px solid ${T.border}` }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.text3} strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search programs..." style={{ background: "transparent", border: "none", outline: "none", color: T.text, fontSize: 12, fontFamily: "inherit", width: 140 }} />
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {["pipeline","programs","ideas"].map(v => (
            <button key={v} onClick={() => setTab(v)} style={{
              padding: "5px 12px", fontSize: 11, fontWeight: 600, borderRadius: 6, cursor: "pointer",
              background: tab === v ? `${T.accent}20` : "transparent", color: tab === v ? T.accent : T.text3,
              border: `1px solid ${tab === v ? T.accent + "40" : T.border}`,
            }}>{v === "pipeline" ? "Pipeline" : v === "programs" ? "List" : "Ideas"}</button>
          ))}
        </div>
        <button onClick={createProgram} style={btnS}>+ New Program</button>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {tab === "pipeline" && (
          <div style={{ padding: 16, display: "flex", gap: 10, overflow: "auto", minHeight: "100%" }}>
            {pipeline.map(stage => (
              <div key={stage.id} style={{ minWidth: 180, width: 180, flexShrink: 0, display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, padding: "0 4px" }}>
                  <span style={{ fontSize: 14 }}>{stage.icon}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: T.text2 }}>{stage.label}</span>
                  <span style={{ fontSize: 10, color: T.text3, fontWeight: 600, marginLeft: "auto", background: T.surface2, padding: "1px 6px", borderRadius: 8 }}>{stage.programs.length}</span>
                </div>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                  {stage.programs.map(p => {
                    const pri = PRIORITY_CFG[p.priority] || PRIORITY_CFG.medium;
                    return (
                      <div key={p.id} onClick={() => openProgram(p)} style={{
                        padding: "10px 12px", borderRadius: 8, cursor: "pointer", background: T.surface, border: `1px solid ${T.border}`, transition: "border-color 0.15s",
                      }} onMouseEnter={e => e.currentTarget.style.borderColor = stage.color} onMouseLeave={e => e.currentTarget.style.borderColor = T.border}>
                        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, lineHeight: 1.3 }}>{p.name}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                          <span style={pill(pri.color, pri.bg)}>{p.priority}</span>
                          {p.brand && <span style={{ fontSize: 10, color: T.text3 }}>{p.brand}</span>}
                        </div>
                        {p.target_launch_date && <div style={{ fontSize: 10, color: T.text3, marginTop: 4 }}>🚀 {fmtShort(p.target_launch_date)}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "programs" && (
          <div style={{ padding: "0 24px" }}>
            {filteredPrograms.length === 0 && <div style={{ textAlign: "center", padding: 60, color: T.text3 }}><div style={{ fontSize: 40, marginBottom: 8 }}>🧪</div><div>No programs yet</div></div>}
            {filteredPrograms.map(p => {
              const stg = STAGES.find(s => s.id === p.current_stage) || STAGES[0];
              const pri = PRIORITY_CFG[p.priority] || PRIORITY_CFG.medium;
              return (
                <div key={p.id} onClick={() => openProgram(p)} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 16px", borderBottom: `1px solid ${T.border}`, cursor: "pointer" }}
                  onMouseEnter={e => e.currentTarget.style.background = T.surface2} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <span style={{ fontSize: 18 }}>{stg.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>
                      {p.program_type?.replace(/_/g, " ")} · {p.category || "No category"}{p.brand ? ` · ${p.brand}` : ""}
                    </div>
                  </div>
                  <span style={pill(stg.color, stg.color + "20")}>{stg.label}</span>
                  <span style={pill(pri.color, pri.bg)}>{p.priority}</span>
                  {p.target_launch_date && <span style={{ fontSize: 11, color: T.text3 }}>🚀 {fmtShort(p.target_launch_date)}</span>}
                </div>
              );
            })}
          </div>
        )}

        {tab === "ideas" && (
          <div style={{ padding: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700 }}>Innovation Pipeline</h3>
              <button onClick={async () => {
                const { data } = await supabase.from("plm_ideas").insert({ org_id: orgId, title: "New Idea", status: "submitted", submitted_by: user?.id }).select().single();
                if (data) setIdeas(p => [data, ...p]);
              }} style={btnS}>+ New Idea</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
              {ideas.map(idea => (
                <div key={idea.id} style={cardS}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                    <input value={idea.title} onChange={async e => { const t = e.target.value; setIdeas(p => p.map(i => i.id === idea.id ? { ...i, title: t } : i)); await supabase.from("plm_ideas").update({ title: t }).eq("id", idea.id); }}
                      style={{ fontSize: 14, fontWeight: 600, color: T.text, background: "transparent", border: "none", outline: "none", flex: 1, fontFamily: "inherit" }} />
                    <span style={pill(idea.status === "approved" ? "#22c55e" : idea.status === "rejected" ? "#ef4444" : "#eab308", undefined)}>{idea.status}</span>
                  </div>
                  {idea.description && <div style={{ fontSize: 12, color: T.text2, marginBottom: 6, lineHeight: 1.5 }}>{idea.description.slice(0, 120)}</div>}
                  <div style={{ display: "flex", gap: 8, fontSize: 10, color: T.text3 }}>
                    {idea.idea_source && <span>{idea.idea_source.replace(/_/g, " ")}</span>}
                    {idea.feasibility_score && <span>F:{idea.feasibility_score}</span>}
                    {idea.desirability_score && <span>D:{idea.desirability_score}</span>}
                    {idea.viability_score && <span>V:{idea.viability_score}</span>}
                    <span style={{ marginLeft: "auto" }}>👍{idea.votes_up || 0} 👎{idea.votes_down || 0}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SUB-COMPONENTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── PROGRAM OVERVIEW ──
function ProgramOverview({ prog, updateProgram, formulations, experiments, trials, claims, issues, skus, gateReviews, benefits, stg, inputS, selectS, labelS }) {
  const [editing, setEditing] = useState(false);
  const openIssues = issues.filter(i => i.status !== "closed").length;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 24 }}>
        <div style={{ flex: 1 }}>
          {editing ? (
            <input autoFocus value={prog.name} onChange={e => updateProgram(prog.id, { name: e.target.value })} onBlur={() => setEditing(false)} style={{ fontSize: 24, fontWeight: 800, color: T.text, background: "transparent", border: "none", outline: "none", width: "100%", fontFamily: "inherit" }} />
          ) : (
            <h2 style={{ fontSize: 24, fontWeight: 800, cursor: "pointer" }} onClick={() => setEditing(true)}>{prog.name}</h2>
          )}
          <div style={{ fontSize: 13, color: T.text3, marginTop: 4 }}>{prog.program_type?.replace(/_/g, " ")} · {prog.category || "—"}{prog.brand ? ` · ${prog.brand}` : ""}</div>
        </div>
      </div>

      {/* Stage-gate timeline */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ ...labelS, marginBottom: 8 }}>Stage-Gate Progress</div>
        <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
          {STAGES.slice(0, 8).map((s, i) => {
            const stgIdx = STAGES.findIndex(st => st.id === prog.current_stage);
            const isCurrent = s.id === prog.current_stage;
            const isPast = i < stgIdx;
            return (
              <div key={s.id} onClick={() => updateProgram(prog.id, { current_stage: s.id, stage_entered_at: now() })} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", cursor: "pointer" }}>
                <div style={{ width: "100%", height: 6, borderRadius: 3, background: isPast ? s.color : isCurrent ? s.color : T.border, opacity: isPast ? 0.5 : 1, transition: "all 0.2s" }} />
                <span style={{ fontSize: 9, color: isCurrent ? s.color : T.text3, fontWeight: isCurrent ? 700 : 400, marginTop: 4 }}>{s.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 10, marginBottom: 24 }}>
        {[
          { label: "Formulations", value: formulations.length, icon: "🧪", color: "#3b82f6" },
          { label: "Experiments", value: experiments.length, icon: "🔬", color: "#8b5cf6" },
          { label: "Mfg Trials", value: trials.length, icon: "🏭", color: "#f97316" },
          { label: "SKUs", value: skus.length, icon: "📦", color: "#22c55e" },
          { label: "Claims", value: claims.length, icon: "📜", color: "#06b6d4" },
          { label: "Open Issues", value: openIssues, icon: "⚠️", color: openIssues > 0 ? "#ef4444" : "#22c55e" },
        ].map(k => (
          <div key={k.label} style={{ padding: 14, borderRadius: 10, background: T.surface, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 12, color: T.text3, marginBottom: 4 }}>{k.icon} {k.label}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Program details form */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
        <div><label style={labelS}>Program Type</label><select value={prog.program_type} onChange={e => updateProgram(prog.id, { program_type: e.target.value })} style={selectS}>{PROGRAM_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}</select></div>
        <div><label style={labelS}>Priority</label><select value={prog.priority} onChange={e => updateProgram(prog.id, { priority: e.target.value })} style={selectS}>{Object.keys(PRIORITY_CFG).map(p => <option key={p} value={p}>{p}</option>)}</select></div>
        <div><label style={labelS}>Category</label><input value={prog.category || ""} onChange={e => updateProgram(prog.id, { category: e.target.value })} style={inputS} placeholder="e.g. Skincare" /></div>
        <div><label style={labelS}>Brand</label><input value={prog.brand || ""} onChange={e => updateProgram(prog.id, { brand: e.target.value })} style={inputS} placeholder="Brand name" /></div>
        <div><label style={labelS}>Target Launch</label><input type="date" value={prog.target_launch_date || ""} onChange={e => updateProgram(prog.id, { target_launch_date: e.target.value || null })} style={inputS} /></div>
        <div><label style={labelS}>Target Market</label><input value={prog.target_market || ""} onChange={e => updateProgram(prog.id, { target_market: e.target.value })} style={inputS} placeholder="US, EU, Global..." /></div>
        <div><label style={labelS}>Projected Revenue</label><input type="number" value={prog.projected_revenue || ""} onChange={e => updateProgram(prog.id, { projected_revenue: e.target.value || null })} style={inputS} placeholder="$" /></div>
        <div><label style={labelS}>Dev Budget</label><input type="number" value={prog.development_budget || ""} onChange={e => updateProgram(prog.id, { development_budget: e.target.value || null })} style={inputS} placeholder="$" /></div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <label style={labelS}>Description</label>
        <textarea value={prog.description || ""} onChange={e => updateProgram(prog.id, { description: e.target.value })} placeholder="Program overview..." rows={3}
          style={{ ...inputS, resize: "vertical", minHeight: 80, lineHeight: 1.6 }} />
      </div>

      {/* Gate Reviews */}
      {gateReviews.length > 0 && (
        <div>
          <div style={labelS}>Gate Reviews</div>
          {gateReviews.map(gr => (
            <div key={gr.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 6, background: T.surface, border: `1px solid ${T.border}`, marginBottom: 4 }}>
              <span style={pill(gr.decision === "approved" ? "#22c55e" : gr.decision === "rejected" ? "#ef4444" : "#eab308", undefined)}>{gr.decision}</span>
              <span style={{ fontSize: 12, color: T.text }}>{gr.from_stage} → {gr.to_stage}</span>
              <span style={{ fontSize: 11, color: T.text3, marginLeft: "auto" }}>{fmtShort(gr.review_date)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── FORMULATIONS TAB ──
function FormulationsTab({ formulations, setFormulations, formulaItems, setFormulaItems, ingredients, createFormulation, selectedFormulation, setSelectedFormulation, programId, btnS, cardS, inputS, selectS, labelS }) {
  const updateFormulation = async (id, upd) => {
    await supabase.from("plm_formulations").update({ ...upd, updated_at: now() }).eq("id", id);
    setFormulations(p => p.map(f => f.id === id ? { ...f, ...upd } : f));
    if (selectedFormulation?.id === id) setSelectedFormulation(p => ({ ...p, ...upd }));
  };

  const addIngredient = async (formulationId) => {
    const { data } = await supabase.from("plm_formula_items").insert({
      formulation_id: formulationId, ingredient_name: "New Ingredient", quantity: 0, unit: "%w/w", sort_order: formulaItems.filter(fi => fi.formulation_id === formulationId).length,
    }).select().single();
    if (data) setFormulaItems(p => [...p, data]);
  };

  const updateItem = async (id, upd) => {
    await supabase.from("plm_formula_items").update(upd).eq("id", id);
    setFormulaItems(p => p.map(fi => fi.id === id ? { ...fi, ...upd } : fi));
  };

  const deleteItem = async (id) => {
    await supabase.from("plm_formula_items").delete().eq("id", id);
    setFormulaItems(p => p.filter(fi => fi.id !== id));
  };

  const sel = selectedFormulation;
  const selItems = sel ? formulaItems.filter(fi => fi.formulation_id === sel.id) : [];
  const totalPct = selItems.reduce((s, i) => s + (Number(i.quantity) || 0), 0);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ fontSize: 18, fontWeight: 700 }}>🧪 Formulations</h3>
        <button onClick={createFormulation} style={btnS}>+ New Formula</button>
      </div>

      <div style={{ display: "flex", gap: 16 }}>
        {/* Formula list */}
        <div style={{ width: 280, flexShrink: 0 }}>
          {formulations.map(f => (
            <div key={f.id} onClick={() => setSelectedFormulation(f)} style={{ ...cardS, borderColor: sel?.id === f.id ? T.accent : T.border }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{f.name}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                <span style={pill(f.status === "production_approved" ? "#22c55e" : "#eab308", undefined)}>{f.status?.replace(/_/g, " ")}</span>
                <span style={{ fontSize: 10, color: T.text3 }}>v{f.version}</span>
                {f.form_type && <span style={{ fontSize: 10, color: T.text3 }}>{f.form_type}</span>}
              </div>
            </div>
          ))}
          {formulations.length === 0 && <div style={{ padding: 20, textAlign: "center", color: T.text3, fontSize: 12 }}>No formulations yet</div>}
        </div>

        {/* Formula detail */}
        {sel && (
          <div style={{ flex: 1 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
              <div><label style={labelS}>Name</label><input value={sel.name} onChange={e => updateFormulation(sel.id, { name: e.target.value })} style={inputS} /></div>
              <div><label style={labelS}>Version</label><input value={sel.version} onChange={e => updateFormulation(sel.id, { version: e.target.value })} style={inputS} /></div>
              <div><label style={labelS}>Form Type</label><select value={sel.form_type || ""} onChange={e => updateFormulation(sel.id, { form_type: e.target.value })} style={selectS}><option value="">—</option>{FORM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
              <div><label style={labelS}>Status</label><select value={sel.status} onChange={e => updateFormulation(sel.id, { status: e.target.value })} style={selectS}>
                {["draft","in_development","testing","pilot_approved","scale_up_approved","production_approved","superseded","rejected","archived"].map(s => <option key={s} value={s}>{s.replace(/_/g," ")}</option>)}
              </select></div>
              <div><label style={labelS}>Target pH</label><input type="number" step="0.1" value={sel.target_ph || ""} onChange={e => updateFormulation(sel.id, { target_ph: e.target.value || null })} style={inputS} /></div>
              <div><label style={labelS}>Batch Size ({sel.batch_size_unit || "kg"})</label><input type="number" value={sel.target_batch_size || ""} onChange={e => updateFormulation(sel.id, { target_batch_size: e.target.value || null })} style={inputS} /></div>
            </div>

            {/* Ingredient table */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span style={labelS}>Bill of Materials ({selItems.length} items · {totalPct.toFixed(2)}%)</span>
              <button onClick={() => addIngredient(sel.id)} style={{ ...btnS, padding: "4px 10px", fontSize: 11 }}>+ Add</button>
            </div>
            <div style={{ border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 60px 100px 40px", gap: 0, padding: "6px 10px", background: T.surface2, fontSize: 10, fontWeight: 600, color: T.text3, textTransform: "uppercase" }}>
                <span>Ingredient</span><span>Qty</span><span>Unit</span><span>Function</span><span></span>
              </div>
              {selItems.map(item => (
                <div key={item.id} style={{ display: "grid", gridTemplateColumns: "1fr 80px 60px 100px 40px", gap: 0, padding: "4px 10px", borderTop: `1px solid ${T.border}`, alignItems: "center" }}>
                  <input value={item.ingredient_name || ""} onChange={e => updateItem(item.id, { ingredient_name: e.target.value })} style={{ background: "transparent", border: "none", outline: "none", color: T.text, fontSize: 12, fontFamily: "inherit" }} />
                  <input type="number" step="0.01" value={item.quantity || ""} onChange={e => updateItem(item.id, { quantity: Number(e.target.value) })} style={{ background: "transparent", border: "none", outline: "none", color: T.text, fontSize: 12, fontFamily: "monospace", width: 70 }} />
                  <span style={{ fontSize: 10, color: T.text3 }}>{item.unit}</span>
                  <input value={item.function_in_formula || ""} onChange={e => updateItem(item.id, { function_in_formula: e.target.value })} style={{ background: "transparent", border: "none", outline: "none", color: T.text3, fontSize: 11, fontFamily: "inherit" }} placeholder="fn..." />
                  <button onClick={() => deleteItem(item.id)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 12, opacity: 0.4 }}>×</button>
                </div>
              ))}
            </div>

            {sel.lab_notes !== undefined && (
              <div style={{ marginTop: 12 }}><label style={labelS}>Lab Notes</label>
                <textarea value={sel.lab_notes || ""} onChange={e => updateFormulation(sel.id, { lab_notes: e.target.value })} rows={3} style={{ ...inputS, resize: "vertical", lineHeight: 1.6, minHeight: 60 }} placeholder="Lab observations..." />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── EXPERIMENTS / DOE TAB ──
function ExperimentsTab({ experiments, setExperiments, createExperiment, selectedExperiment, setSelectedExperiment, formulations, callAI, setAiAction, setAiPrompt, setSubTab, btnS, cardS, inputS, selectS, labelS }) {
  const updateExp = async (id, upd) => {
    await supabase.from("plm_experiments").update({ ...upd, updated_at: now() }).eq("id", id);
    setExperiments(p => p.map(e => e.id === id ? { ...e, ...upd } : e));
    if (selectedExperiment?.id === id) setSelectedExperiment(p => ({ ...p, ...upd }));
  };

  const exp = selectedExperiment;
  const factors = exp?.factors || [];
  const responses = exp?.responses || [];
  const runMatrix = exp?.run_matrix || [];

  const addFactor = () => { if (!exp) return; const f = [...factors, { name: `Factor ${factors.length + 1}`, low: "", high: "", unit: "" }]; updateExp(exp.id, { factors: f }); };
  const addResponse = () => { if (!exp) return; const r = [...responses, { name: `Response ${responses.length + 1}`, unit: "", target: "", direction: "maximize" }]; updateExp(exp.id, { responses: r }); };

  const askDOE = () => { setAiAction("doe_advisor"); setAiPrompt(`Design a DOE for this experiment: ${exp?.name}. Factors: ${JSON.stringify(factors)}. Responses: ${JSON.stringify(responses)}. Suggest optimal design and generate run matrix.`); setSubTab("ai"); };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ fontSize: 18, fontWeight: 700 }}>🔬 DOE / Experiments</h3>
        <button onClick={createExperiment} style={btnS}>+ New Experiment</button>
      </div>

      <div style={{ display: "flex", gap: 16 }}>
        {/* List */}
        <div style={{ width: 280, flexShrink: 0 }}>
          {experiments.map(e => (
            <div key={e.id} onClick={() => setSelectedExperiment(e)} style={{ ...cardS, borderColor: exp?.id === e.id ? T.accent : T.border }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{e.name}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                <span style={pill(e.status === "completed" || e.status === "concluded" ? "#22c55e" : "#3b82f6", undefined)}>{e.status}</span>
                <span style={{ fontSize: 10, color: T.text3 }}>{e.experiment_type}</span>
                {e.doe_design && e.doe_design !== "none" && <span style={pill("#8b5cf6", undefined)}>{e.doe_design.replace(/_/g, " ")}</span>}
              </div>
            </div>
          ))}
          {experiments.length === 0 && <div style={{ padding: 20, textAlign: "center", color: T.text3, fontSize: 12 }}>No experiments yet</div>}
        </div>

        {/* Detail */}
        {exp && (
          <div style={{ flex: 1 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              <div><label style={labelS}>Name</label><input value={exp.name} onChange={e => updateExp(exp.id, { name: e.target.value })} style={inputS} /></div>
              <div><label style={labelS}>Type</label><select value={exp.experiment_type} onChange={e => updateExp(exp.id, { experiment_type: e.target.value })} style={selectS}>{EXP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
              <div><label style={labelS}>DOE Design</label><select value={exp.doe_design || "none"} onChange={e => updateExp(exp.id, { doe_design: e.target.value })} style={selectS}>{DOE_DESIGNS.map(d => <option key={d} value={d}>{d.replace(/_/g," ")}</option>)}</select></div>
              <div><label style={labelS}>Status</label><select value={exp.status} onChange={e => updateExp(exp.id, { status: e.target.value })} style={selectS}>{["planning","in_progress","completed","analyzing","concluded","cancelled"].map(s => <option key={s} value={s}>{s.replace(/_/g," ")}</option>)}</select></div>
            </div>

            <div style={{ marginBottom: 12 }}><label style={labelS}>Hypothesis</label><textarea value={exp.hypothesis || ""} onChange={e => updateExp(exp.id, { hypothesis: e.target.value })} rows={2} style={{ ...inputS, resize: "vertical", lineHeight: 1.5 }} placeholder="If we change X then Y will..." /></div>

            {/* Factors */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={labelS}>Factors ({factors.length})</span>
              <button onClick={addFactor} style={{ background: "none", border: "none", color: T.accent, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>+ Add</button>
            </div>
            <div style={{ border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden", marginBottom: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 60px", gap: 0, padding: "6px 10px", background: T.surface2, fontSize: 10, fontWeight: 600, color: T.text3 }}>
                <span>FACTOR</span><span>LOW</span><span>HIGH</span><span>UNIT</span>
              </div>
              {factors.map((f, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px 60px", gap: 0, padding: "4px 10px", borderTop: `1px solid ${T.border}`, alignItems: "center" }}>
                  <input value={f.name} onChange={e => { const nf = [...factors]; nf[i] = { ...f, name: e.target.value }; updateExp(exp.id, { factors: nf }); }} style={{ background: "transparent", border: "none", outline: "none", color: T.text, fontSize: 12, fontFamily: "inherit" }} />
                  <input value={f.low} onChange={e => { const nf = [...factors]; nf[i] = { ...f, low: e.target.value }; updateExp(exp.id, { factors: nf }); }} style={{ background: "transparent", border: "none", outline: "none", color: T.text, fontSize: 12, fontFamily: "monospace" }} />
                  <input value={f.high} onChange={e => { const nf = [...factors]; nf[i] = { ...f, high: e.target.value }; updateExp(exp.id, { factors: nf }); }} style={{ background: "transparent", border: "none", outline: "none", color: T.text, fontSize: 12, fontFamily: "monospace" }} />
                  <input value={f.unit} onChange={e => { const nf = [...factors]; nf[i] = { ...f, unit: e.target.value }; updateExp(exp.id, { factors: nf }); }} style={{ background: "transparent", border: "none", outline: "none", color: T.text3, fontSize: 11 }} />
                </div>
              ))}
            </div>

            {/* Responses */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span style={labelS}>Responses ({responses.length})</span>
              <button onClick={addResponse} style={{ background: "none", border: "none", color: T.accent, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>+ Add</button>
            </div>
            <div style={{ border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden", marginBottom: 16 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px", gap: 0, padding: "6px 10px", background: T.surface2, fontSize: 10, fontWeight: 600, color: T.text3 }}>
                <span>RESPONSE</span><span>TARGET</span><span>DIRECTION</span>
              </div>
              {responses.map((r, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 80px 80px", gap: 0, padding: "4px 10px", borderTop: `1px solid ${T.border}`, alignItems: "center" }}>
                  <input value={r.name} onChange={e => { const nr = [...responses]; nr[i] = { ...r, name: e.target.value }; updateExp(exp.id, { responses: nr }); }} style={{ background: "transparent", border: "none", outline: "none", color: T.text, fontSize: 12, fontFamily: "inherit" }} />
                  <input value={r.target || ""} onChange={e => { const nr = [...responses]; nr[i] = { ...r, target: e.target.value }; updateExp(exp.id, { responses: nr }); }} style={{ background: "transparent", border: "none", outline: "none", color: T.text, fontSize: 12, fontFamily: "monospace" }} />
                  <select value={r.direction || "maximize"} onChange={e => { const nr = [...responses]; nr[i] = { ...r, direction: e.target.value }; updateExp(exp.id, { responses: nr }); }} style={{ background: "transparent", border: "none", color: T.text3, fontSize: 11 }}>
                    <option value="maximize">Max</option><option value="minimize">Min</option><option value="target">Target</option>
                  </select>
                </div>
              ))}
            </div>

            {/* Run matrix */}
            {runMatrix.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <span style={labelS}>Run Matrix ({runMatrix.length} runs)</span>
                <div style={{ overflow: "auto", border: `1px solid ${T.border}`, borderRadius: 8 }}>
                  <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12 }}>
                    <thead><tr style={{ background: T.surface2 }}>
                      <th style={{ padding: "6px 10px", textAlign: "left", fontSize: 10, fontWeight: 600, color: T.text3 }}>Run</th>
                      {factors.map((f, i) => <th key={i} style={{ padding: "6px 10px", textAlign: "left", fontSize: 10, fontWeight: 600, color: T.text3 }}>{f.name}</th>)}
                      {responses.map((r, i) => <th key={i} style={{ padding: "6px 10px", textAlign: "left", fontSize: 10, fontWeight: 600, color: T.accent }}>{r.name}</th>)}
                    </tr></thead>
                    <tbody>{runMatrix.map((run, ri) => (
                      <tr key={ri} style={{ borderTop: `1px solid ${T.border}` }}>
                        <td style={{ padding: "4px 10px", color: T.text3 }}>{ri + 1}</td>
                        {factors.map((f, fi) => <td key={fi} style={{ padding: "4px 10px" }}>{run.factors?.[fi] ?? "—"}</td>)}
                        {responses.map((r, rri) => <td key={rri} style={{ padding: "4px 10px", color: T.accent }}>
                          <input value={run.results?.[rri] ?? ""} onChange={e => {
                            const nm = [...runMatrix]; if (!nm[ri].results) nm[ri].results = []; nm[ri].results[rri] = e.target.value; updateExp(exp.id, { run_matrix: nm });
                          }} style={{ background: "transparent", border: "none", outline: "none", color: T.accent, fontSize: 12, fontFamily: "monospace", width: 60 }} placeholder="—" />
                        </td>)}
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            )}

            {/* AI DOE button */}
            <button onClick={askDOE} style={{ ...btnS, background: "linear-gradient(135deg, #8b5cf6, #06b6d4)", display: "flex", alignItems: "center", gap: 6 }}>
              ✦ AI: Design / Analyze DOE
            </button>

            {exp.conclusions && <div style={{ marginTop: 12 }}><label style={labelS}>Conclusions</label><div style={{ fontSize: 13, color: T.text2, lineHeight: 1.6, padding: 12, background: T.surface, borderRadius: 8, border: `1px solid ${T.border}` }}>{exp.conclusions}</div></div>}
          </div>
        )}
      </div>
    </div>
  );
}

// ── TRIALS TAB ──
function TrialsTab({ trials, setTrials, createTrial, selectedTrial, setSelectedTrial, formulations, skus, callAI, setAiAction, setAiPrompt, setSubTab, btnS, cardS, inputS, selectS, labelS }) {
  const updateTrial = async (id, upd) => {
    await supabase.from("plm_manufacturing_trials").update({ ...upd, updated_at: now() }).eq("id", id);
    setTrials(p => p.map(t => t.id === id ? { ...t, ...upd } : t));
    if (selectedTrial?.id === id) setSelectedTrial(p => ({ ...p, ...upd }));
  };

  const t = selectedTrial;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ fontSize: 18, fontWeight: 700 }}>🏭 Manufacturing Trials</h3>
        <button onClick={createTrial} style={btnS}>+ New Trial</button>
      </div>
      <div style={{ display: "flex", gap: 16 }}>
        <div style={{ width: 280, flexShrink: 0 }}>
          {trials.map(tr => (
            <div key={tr.id} onClick={() => setSelectedTrial(tr)} style={{ ...cardS, borderColor: t?.id === tr.id ? T.accent : T.border }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{tr.name}</span>
                <span style={{ fontSize: 10, color: T.text3 }}>{tr.trial_number}</span>
              </div>
              <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                <span style={pill(tr.status === "completed" ? "#22c55e" : tr.status === "failed" ? "#ef4444" : "#3b82f6", undefined)}>{tr.status}</span>
                <span style={{ fontSize: 10, color: T.text3 }}>{tr.trial_type?.replace(/_/g, " ")}</span>
              </div>
              {tr.yield_pct && <div style={{ fontSize: 10, color: T.text3, marginTop: 4 }}>Yield: {tr.yield_pct}%</div>}
            </div>
          ))}
        </div>
        {t && (
          <div style={{ flex: 1 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              <div><label style={labelS}>Name</label><input value={t.name} onChange={e => updateTrial(t.id, { name: e.target.value })} style={inputS} /></div>
              <div><label style={labelS}>Trial #</label><input value={t.trial_number} onChange={e => updateTrial(t.id, { trial_number: e.target.value })} style={inputS} /></div>
              <div><label style={labelS}>Type</label><select value={t.trial_type} onChange={e => updateTrial(t.id, { trial_type: e.target.value })} style={selectS}>{TRIAL_TYPES.map(tt => <option key={tt} value={tt}>{tt.replace(/_/g," ")}</option>)}</select></div>
              <div><label style={labelS}>Status</label><select value={t.status} onChange={e => updateTrial(t.id, { status: e.target.value })} style={selectS}>{["planned","in_progress","completed","on_hold","failed","cancelled"].map(s => <option key={s} value={s}>{s.replace(/_/g," ")}</option>)}</select></div>
              <div><label style={labelS}>Batch Size</label><input type="number" value={t.batch_size || ""} onChange={e => updateTrial(t.id, { batch_size: e.target.value || null })} style={inputS} /></div>
              <div><label style={labelS}>Units Produced</label><input type="number" value={t.units_produced || ""} onChange={e => updateTrial(t.id, { units_produced: Number(e.target.value) || null })} style={inputS} /></div>
              <div><label style={labelS}>Yield %</label><input type="number" value={t.yield_pct || ""} onChange={e => updateTrial(t.id, { yield_pct: e.target.value || null })} style={inputS} /></div>
              <div><label style={labelS}>Cost/Unit</label><input type="number" step="0.01" value={t.cost_per_unit || ""} onChange={e => updateTrial(t.id, { cost_per_unit: e.target.value || null })} style={inputS} /></div>
              <div><label style={labelS}>Site</label><input value={t.site_name || ""} onChange={e => updateTrial(t.id, { site_name: e.target.value })} style={inputS} /></div>
              <div><label style={labelS}>Disposition</label><select value={t.batch_disposition || "pending"} onChange={e => updateTrial(t.id, { batch_disposition: e.target.value })} style={selectS}>{["pending","approved","conditionally_approved","rejected","quarantine","destroyed"].map(s => <option key={s} value={s}>{s.replace(/_/g," ")}</option>)}</select></div>
            </div>
            <button onClick={() => { setAiAction("manufacturing_troubleshoot"); setAiPrompt(`Analyze this manufacturing trial: ${t.name}. Type: ${t.trial_type}, Batch: ${t.batch_size}${t.batch_size_unit || "kg"}, Yield: ${t.yield_pct}%. Help troubleshoot and optimize.`); setSubTab("ai"); }}
              style={{ ...btnS, background: "linear-gradient(135deg, #f97316, #ef4444)", display: "flex", alignItems: "center", gap: 6 }}>✦ AI: Troubleshoot Trial</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── STABILITY TAB ──
function StabilityTab({ studies, setStudies, createStability, formulations, skus, btnS, cardS, inputS, selectS, labelS }) {
  const updateStudy = async (id, upd) => {
    await supabase.from("plm_stability_studies").update({ ...upd, updated_at: now() }).eq("id", id);
    setStudies(p => p.map(s => s.id === id ? { ...s, ...upd } : s));
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ fontSize: 18, fontWeight: 700 }}>📊 Stability Studies</h3>
        <button onClick={createStability} style={btnS}>+ New Study</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 12 }}>
        {studies.map(s => (
          <div key={s.id} style={cardS}>
            <input value={s.study_name} onChange={e => updateStudy(s.id, { study_name: e.target.value })} style={{ fontSize: 14, fontWeight: 600, color: T.text, background: "transparent", border: "none", outline: "none", width: "100%", fontFamily: "inherit", marginBottom: 6 }} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <div><label style={labelS}>Type</label><select value={s.study_type} onChange={e => updateStudy(s.id, { study_type: e.target.value })} style={selectS}>{STABILITY_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g," ")}</option>)}</select></div>
              <div><label style={labelS}>Status</label><select value={s.status} onChange={e => updateStudy(s.id, { status: e.target.value })} style={selectS}>{["planned","active","completed","on_hold","terminated"].map(st => <option key={st} value={st}>{st}</option>)}</select></div>
              <div><label style={labelS}>Start</label><input type="date" value={s.start_date || ""} onChange={e => updateStudy(s.id, { start_date: e.target.value || null })} style={inputS} /></div>
              <div><label style={labelS}>Shelf Life (mo)</label><input type="number" value={s.recommended_shelf_life_months || ""} onChange={e => updateStudy(s.id, { recommended_shelf_life_months: Number(e.target.value) || null })} style={inputS} /></div>
            </div>
            <div><label style={labelS}>Conclusion</label><textarea value={s.conclusion || ""} onChange={e => updateStudy(s.id, { conclusion: e.target.value })} rows={2} style={{ ...inputS, resize: "vertical", lineHeight: 1.5, fontSize: 12 }} placeholder="Study conclusion..." /></div>
          </div>
        ))}
      </div>
      {studies.length === 0 && <div style={{ textAlign: "center", padding: 40, color: T.text3, fontSize: 12 }}>No stability studies yet</div>}
    </div>
  );
}

// ── SKUs TAB ──
function SKUsTab({ skus, setSkus, createSKU, formulations, btnS, cardS, inputS, selectS, labelS }) {
  const updateSKU = async (id, upd) => {
    await supabase.from("plm_skus").update({ ...upd, updated_at: now() }).eq("id", id);
    setSkus(p => p.map(s => s.id === id ? { ...s, ...upd } : s));
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ fontSize: 18, fontWeight: 700 }}>📦 SKUs</h3>
        <button onClick={createSKU} style={btnS}>+ New SKU</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))", gap: 12 }}>
        {skus.map(s => (
          <div key={s.id} style={cardS}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <input value={s.name} onChange={e => updateSKU(s.id, { name: e.target.value })} style={{ fontSize: 14, fontWeight: 600, color: T.text, background: "transparent", border: "none", outline: "none", flex: 1, fontFamily: "inherit" }} />
              <span style={{ fontSize: 10, fontFamily: "monospace", color: T.text3 }}>{s.sku_code}</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
              <div><label style={labelS}>Status</label><select value={s.status} onChange={e => updateSKU(s.id, { status: e.target.value })} style={selectS}>{["draft","pending_approval","approved","pilot_production","validated","active","limited_release","full_distribution","on_hold","discontinued"].map(st => <option key={st} value={st}>{st.replace(/_/g," ")}</option>)}</select></div>
              <div><label style={labelS}>Unit COGS</label><input type="number" step="0.01" value={s.unit_cogs || ""} onChange={e => updateSKU(s.id, { unit_cogs: e.target.value || null })} style={inputS} /></div>
              <div><label style={labelS}>Retail Price</label><input type="number" step="0.01" value={s.target_retail || ""} onChange={e => updateSKU(s.id, { target_retail: e.target.value || null })} style={inputS} /></div>
              <div><label style={labelS}>Net Weight</label><input type="number" value={s.net_weight || ""} onChange={e => updateSKU(s.id, { net_weight: e.target.value || null })} style={inputS} /></div>
              <div><label style={labelS}>Shelf Life (mo)</label><input type="number" value={s.shelf_life_months || ""} onChange={e => updateSKU(s.id, { shelf_life_months: Number(e.target.value) || null })} style={inputS} /></div>
              <div><label style={labelS}>Margin %</label><input type="number" step="0.1" value={s.margin_pct || ""} onChange={e => updateSKU(s.id, { margin_pct: e.target.value || null })} style={inputS} /></div>
            </div>
          </div>
        ))}
      </div>
      {skus.length === 0 && <div style={{ textAlign: "center", padding: 40, color: T.text3, fontSize: 12 }}>No SKUs yet</div>}
    </div>
  );
}

// ── CLAIMS TAB ──
function ClaimsTab({ claims, setClaims, benefits, setBenefits, createClaim, programId, callAI, setAiAction, setAiPrompt, setSubTab, btnS, cardS, inputS, selectS, labelS }) {
  const updateClaim = async (id, upd) => {
    await supabase.from("plm_claims").update({ ...upd, updated_at: now() }).eq("id", id);
    setClaims(p => p.map(c => c.id === id ? { ...c, ...upd } : c));
  };

  const evaluateClaim = (claim) => {
    setAiAction("claim_support");
    setAiPrompt(`Evaluate this claim: "${claim.claim_text}". Type: ${claim.claim_type}. Current evidence level: ${claim.evidence_level || "none"}. Assess regulatory risk and suggest compliant alternatives.`);
    setSubTab("ai");
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ fontSize: 18, fontWeight: 700 }}>📜 Claims & Benefits</h3>
        <button onClick={createClaim} style={btnS}>+ New Claim</button>
      </div>
      {claims.map(c => (
        <div key={c.id} style={{ ...cardS, marginBottom: 8 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <textarea value={c.claim_text} onChange={e => updateClaim(c.id, { claim_text: e.target.value })} rows={2} style={{ ...inputS, resize: "vertical", fontSize: 13, fontWeight: 500, lineHeight: 1.5, marginBottom: 8 }} />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <select value={c.claim_type} onChange={e => updateClaim(c.id, { claim_type: e.target.value })} style={{ ...selectS, width: "auto", fontSize: 11, padding: "3px 6px" }}>{CLAIM_TYPES.map(t => <option key={t} value={t}>{t.replace(/_/g," ")}</option>)}</select>
                <select value={c.status} onChange={e => updateClaim(c.id, { status: e.target.value })} style={{ ...selectS, width: "auto", fontSize: 11, padding: "3px 6px" }}>
                  {["proposed","researching","substantiated","partially_supported","unsupported","approved","rejected","in_legal_review","active","retired"].map(s => <option key={s} value={s}>{s.replace(/_/g," ")}</option>)}
                </select>
                <select value={c.evidence_level || ""} onChange={e => updateClaim(c.id, { evidence_level: e.target.value })} style={{ ...selectS, width: "auto", fontSize: 11, padding: "3px 6px" }}>
                  <option value="">Evidence level</option>{["anecdotal","in_vitro","animal","clinical_pilot","clinical_pivotal","meta_analysis","systematic_review","consumer_study"].map(s => <option key={s} value={s}>{s.replace(/_/g," ")}</option>)}
                </select>
              </div>
            </div>
            <button onClick={() => evaluateClaim(c)} style={{ ...btnS, background: "linear-gradient(135deg, #8b5cf6, #06b6d4)", fontSize: 11, padding: "4px 10px", whiteSpace: "nowrap" }}>✦ Evaluate</button>
          </div>
        </div>
      ))}
      {claims.length === 0 && <div style={{ textAlign: "center", padding: 30, color: T.text3, fontSize: 12 }}>No claims yet</div>}
    </div>
  );
}

// ── ISSUES TAB ──
function IssuesTab({ issues, setIssues, createIssue, selectedIssue, setSelectedIssue, callAI, setAiAction, setAiPrompt, setSubTab, btnS, cardS, inputS, selectS, labelS }) {
  const updateIssue = async (id, upd) => {
    await supabase.from("plm_issues").update({ ...upd, updated_at: now() }).eq("id", id);
    setIssues(p => p.map(i => i.id === id ? { ...i, ...upd } : i));
    if (selectedIssue?.id === id) setSelectedIssue(p => ({ ...p, ...upd }));
  };

  const sevColor = { critical: "#ef4444", major: "#f97316", minor: "#eab308", observation: "#22c55e" };
  const iss = selectedIssue;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h3 style={{ fontSize: 18, fontWeight: 700 }}>⚠️ Issues & CAPA</h3>
        <button onClick={createIssue} style={btnS}>+ New Issue</button>
      </div>
      <div style={{ display: "flex", gap: 16 }}>
        <div style={{ width: 280, flexShrink: 0 }}>
          {issues.map(i => (
            <div key={i.id} onClick={() => setSelectedIssue(i)} style={{ ...cardS, borderColor: iss?.id === i.id ? T.accent : T.border, borderLeft: `3px solid ${sevColor[i.severity] || T.border}` }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{i.title}</div>
              <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                <span style={pill(sevColor[i.severity] || T.text3, undefined)}>{i.severity}</span>
                <span style={pill(i.status === "closed" ? "#22c55e" : "#f97316", undefined)}>{i.status?.replace(/_/g, " ")}</span>
                <span style={{ fontSize: 10, color: T.text3 }}>{i.issue_type}</span>
              </div>
            </div>
          ))}
        </div>
        {iss && (
          <div style={{ flex: 1 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
              <div style={{ gridColumn: "1 / -1" }}><label style={labelS}>Title</label><input value={iss.title} onChange={e => updateIssue(iss.id, { title: e.target.value })} style={inputS} /></div>
              <div><label style={labelS}>Type</label><select value={iss.issue_type} onChange={e => updateIssue(iss.id, { issue_type: e.target.value })} style={selectS}>{ISSUE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
              <div><label style={labelS}>Severity</label><select value={iss.severity} onChange={e => updateIssue(iss.id, { severity: e.target.value })} style={selectS}>{ISSUE_SEVERITY.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
              <div><label style={labelS}>Status</label><select value={iss.status} onChange={e => updateIssue(iss.id, { status: e.target.value })} style={selectS}>{["open","investigating","root_cause_identified","corrective_action","verification","closed","deferred"].map(s => <option key={s} value={s}>{s.replace(/_/g," ")}</option>)}</select></div>
              <div><label style={labelS}>Target Resolution</label><input type="date" value={iss.target_resolution_date || ""} onChange={e => updateIssue(iss.id, { target_resolution_date: e.target.value || null })} style={inputS} /></div>
            </div>
            <div style={{ marginBottom: 12 }}><label style={labelS}>Description</label><textarea value={iss.description || ""} onChange={e => updateIssue(iss.id, { description: e.target.value })} rows={2} style={{ ...inputS, resize: "vertical", lineHeight: 1.5 }} /></div>
            <div style={{ marginBottom: 12 }}><label style={labelS}>Root Cause</label><textarea value={iss.root_cause || ""} onChange={e => updateIssue(iss.id, { root_cause: e.target.value })} rows={2} style={{ ...inputS, resize: "vertical", lineHeight: 1.5 }} placeholder="Root cause analysis..." /></div>
            <div style={{ marginBottom: 12 }}><label style={labelS}>Corrective Action</label><textarea value={iss.corrective_action || ""} onChange={e => updateIssue(iss.id, { corrective_action: e.target.value })} rows={2} style={{ ...inputS, resize: "vertical", lineHeight: 1.5 }} placeholder="Corrective action..." /></div>
            <div style={{ marginBottom: 12 }}><label style={labelS}>Preventive Action</label><textarea value={iss.preventive_action || ""} onChange={e => updateIssue(iss.id, { preventive_action: e.target.value })} rows={2} style={{ ...inputS, resize: "vertical", lineHeight: 1.5 }} placeholder="Preventive action..." /></div>
            <button onClick={() => { setAiAction("manufacturing_troubleshoot"); setAiPrompt(`Diagnose this issue: "${iss.title}". Type: ${iss.issue_type}, Severity: ${iss.severity}. Description: ${iss.description || "N/A"}. Provide root cause analysis, corrective actions, and preventive measures.`); setSubTab("ai"); }}
              style={{ ...btnS, background: "linear-gradient(135deg, #ef4444, #f97316)", display: "flex", alignItems: "center", gap: 6 }}>✦ AI: Diagnose & Solve</button>

            {iss.ai_diagnosis && (
              <div style={{ marginTop: 12, padding: 14, background: `${T.accent}08`, borderRadius: 8, border: `1px solid ${T.accent}30` }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.accent, marginBottom: 6 }}>✦ AI DIAGNOSIS</div>
                <div style={{ fontSize: 12, color: T.text2, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{typeof iss.ai_diagnosis === "string" ? iss.ai_diagnosis : iss.ai_diagnosis?.response || JSON.stringify(iss.ai_diagnosis)}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── AI ADVISOR TAB ──
function AIAdvisorTab({ aiAction, setAiAction, aiPrompt, setAiPrompt, aiResponse, aiLoading, aiHistory, callAI, btnS, inputS, selectS, labelS }) {
  const AI_ACTIONS = [
    { id: "formulation_advisor", label: "🧪 Formulation Advisor", desc: "Get help with formulation design, troubleshooting, ingredient selection" },
    { id: "doe_advisor", label: "🔬 DOE Advisor", desc: "Design experiments, analyze results, optimize processes" },
    { id: "manufacturing_troubleshoot", label: "🏭 Manufacturing", desc: "Diagnose production issues, process optimization" },
    { id: "stability_predictor", label: "📊 Stability Predictor", desc: "Analyze stability data, predict shelf life" },
    { id: "claim_support", label: "📜 Claims Evaluator", desc: "Assess regulatory compliance, substantiation requirements" },
    { id: "ingredient_advisor", label: "💊 Ingredient Advisor", desc: "Ingredient selection, compatibility, regulatory status" },
  ];

  return (
    <div>
      <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>✦ AI R&D Advisor</h3>

      {/* Action cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 8, marginBottom: 20 }}>
        {AI_ACTIONS.map(a => (
          <div key={a.id} onClick={() => setAiAction(a.id)} style={{
            padding: "12px 14px", borderRadius: 8, cursor: "pointer", border: `1px solid ${aiAction === a.id ? T.accent : T.border}`, background: aiAction === a.id ? `${T.accent}10` : T.surface,
          }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{a.label}</div>
            <div style={{ fontSize: 11, color: T.text3, lineHeight: 1.4 }}>{a.desc}</div>
          </div>
        ))}
      </div>

      {/* Prompt */}
      <div style={{ marginBottom: 16 }}>
        <label style={labelS}>Ask the AI ({AI_ACTIONS.find(a => a.id === aiAction)?.label})</label>
        <div style={{ display: "flex", gap: 8 }}>
          <textarea value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} rows={3} style={{ ...inputS, flex: 1, resize: "vertical", lineHeight: 1.5 }}
            placeholder="Describe your question, issue, or what you need help with..." onKeyDown={e => { if (e.key === "Enter" && e.metaKey) callAI(); }} />
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <button onClick={callAI} disabled={aiLoading || !aiPrompt.trim()} style={{ ...btnS, background: aiLoading ? T.text3 : "linear-gradient(135deg, #8b5cf6, #06b6d4)", opacity: aiLoading ? 0.6 : 1 }}>
            {aiLoading ? "⏳ Analyzing..." : "✦ Ask AI Advisor"}
          </button>
          <span style={{ fontSize: 11, color: T.text3, display: "flex", alignItems: "center" }}>⌘+Enter to send</span>
        </div>
      </div>

      {/* Response */}
      {aiResponse && (
        <div style={{ padding: 20, background: T.surface, borderRadius: 10, border: `1px solid ${T.border}`, marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: T.accent, textTransform: "uppercase" }}>✦ AI Response</span>
            <button onClick={() => navigator.clipboard?.writeText(aiResponse)} style={{ background: "none", border: "none", color: T.text3, fontSize: 11, cursor: "pointer" }}>Copy</button>
          </div>
          <div style={{ fontSize: 13, color: T.text, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{aiResponse}</div>
        </div>
      )}

      {/* History */}
      {aiHistory.length > 0 && (
        <div>
          <div style={labelS}>Recent Queries</div>
          {aiHistory.slice(0, 5).map((h, i) => (
            <div key={i} onClick={() => { setAiAction(h.action); setAiPrompt(h.prompt); }} style={{ padding: "8px 12px", borderRadius: 6, background: T.surface, border: `1px solid ${T.border}`, marginBottom: 4, cursor: "pointer", fontSize: 12, color: T.text2 }}
              onMouseEnter={e => e.currentTarget.style.background = T.surface2} onMouseLeave={e => e.currentTarget.style.background = T.surface}>
              <span style={{ fontSize: 10, color: T.text3 }}>{h.action.replace(/_/g, " ")}</span> — {h.prompt.slice(0, 80)}...
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
