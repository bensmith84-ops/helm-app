"use client";
import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";
import { useAuth } from "../lib/auth";

const ATTACH_KINDS = [
  { key: "coa", label: "📋 Certificate of Analysis (CoA)" },
  { key: "test_result", label: "🧪 Test Result" },
  { key: "certification", label: "🏅 Certification" },
  { key: "msds", label: "⚠️ MSDS / Safety Data" },
  { key: "spec_sheet", label: "📐 Spec Sheet" },
  { key: "sample_photo", label: "📷 Sample Photo" },
  { key: "formulation", label: "🧬 Formulation Detail" },
  { key: "other", label: "📎 Other" },
];

const STATUS = {
  submitted: { label: "Submitted", color: "#3b82f6" },
  under_review: { label: "Under Review", color: "#eab308" },
  clarification_requested: { label: "Clarification", color: "#f97316" },
  shortlisted: { label: "Shortlisted", color: "#06b6d4" },
  rejected: { label: "Rejected", color: "#ef4444" },
  accepted: { label: "Accepted", color: "#22c55e" },
};

const fmtMoney = (n, c = "USD") => n == null || n === "" ? "—" : ({USD:"$",GBP:"£",AUD:"A$",EUR:"€",CAD:"C$"}[c]||"$") + Number(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:4});
const fmtQty = (n, unit) => n == null || n === "" ? "—" : Number(n).toLocaleString() + (unit ? " " + unit : "");

// ─── Main component ───────────────────────────────────────────────────────────
export default function PLMRFPSubmissions({ rfp, brief, providers, items }) {
  const { orgId } = useAuth();
  const [subs, setSubs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null); // submission being edited, or { rfp_provider_id } for new
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResult, setAiResult] = useState(null);

  const load = useCallback(async () => {
    if (!orgId || !rfp?.id) return;
    setLoading(true);
    const { data } = await supabase.from("plm_rfp_submissions").select("*").eq("rfp_id", rfp.id).order("submitted_at", { ascending: false });
    setSubs(data || []);
    setLoading(false);
  }, [orgId, rfp?.id]);

  useEffect(() => { load(); }, [load]);

  const subsByProvider = useMemo(() => {
    const m = new Map();
    for (const p of providers) m.set(p.id, []);
    for (const s of subs) {
      const arr = m.get(s.rfp_provider_id) || [];
      arr.push(s);
      m.set(s.rfp_provider_id, arr);
    }
    return m;
  }, [providers, subs]);

  const onSaved = (saved) => {
    setSubs(prev => {
      const idx = prev.findIndex(s => s.id === saved.id);
      if (idx >= 0) { const copy = [...prev]; copy[idx] = saved; return copy; }
      return [saved, ...prev];
    });
    setEditing(null);
  };

  const onDeleted = async (id) => {
    if (!confirm("Delete this submission?")) return;
    await supabase.from("plm_rfp_submissions").delete().eq("id", id);
    setSubs(prev => prev.filter(s => s.id !== id));
  };

  const aiAnalyze = async () => {
    if (subs.length === 0) return;
    setAiBusy(true); setAiResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("plm-rfp-assist", {
        body: { action: "analyze_submissions", rfp, brief: brief || rfp.brief || {}, providers, submissions: subs },
      });
      if (error) throw error;
      setAiResult(data);
      // Persist ai_score back to submissions
      for (const rk of data.rankings || []) {
        await supabase.from("plm_rfp_submissions").update({
          ai_score: rk.score,
          ai_score_breakdown: rk.breakdown,
          ai_score_notes: (rk.strengths?.join(". ") || "") + (rk.concerns?.length ? " | Concerns: " + rk.concerns.join(", ") : ""),
        }).eq("id", rk.submission_id);
      }
      await load();
    } catch (e) {
      alert("Analyze failed: " + (e.message || String(e)));
    } finally {
      setAiBusy(false);
    }
  };

  if (loading) return <div style={{ padding: 24, textAlign: "center", color: T.text3 }}>Loading submissions…</div>;

  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>📥 Provider Submissions ({subs.length})</div>
          <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>Each provider can submit multiple formulations (Best Performance / Best Cost / Balanced).</div>
        </div>
        <button onClick={aiAnalyze} disabled={aiBusy || subs.length === 0} style={{ ...primaryBtn, background: "#8b5cf6", opacity: (aiBusy || subs.length === 0) ? 0.5 : 1 }}>
          {aiBusy ? "Analyzing…" : "✨ AI Analyze Submissions"}
        </button>
      </div>

      {/* AI analysis result */}
      {aiResult && (
        <div style={{ background: "#8b5cf610", border: "1px solid #8b5cf640", borderRadius: 8, padding: 14, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#8b5cf6" }}>✨ AI Analysis</div>
            <button onClick={() => setAiResult(null)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer" }}>✕</button>
          </div>
          {aiResult.summary && <div style={{ fontSize: 12, color: T.text2, marginBottom: 10, fontStyle: "italic", lineHeight: 1.5 }}>{aiResult.summary}</div>}
          {aiResult.price_curve_insights && <div style={{ fontSize: 12, color: T.text2, marginBottom: 10, padding: 8, background: T.surface, borderRadius: 6 }}>📈 {aiResult.price_curve_insights}</div>}
          {(aiResult.rankings || []).map((rk, i) => (
            <div key={i} style={{ padding: 10, background: T.surface, borderRadius: 6, marginBottom: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>#{i+1} {rk.company_name}</span>
                  {rk.submission_name && <span style={{ fontSize: 11, color: T.text3, marginLeft: 6 }}>({rk.submission_name})</span>}
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: rk.score >= 70 ? "#22c55e" : rk.score >= 50 ? "#eab308" : "#ef4444" }}>{Math.round(rk.score)}</div>
              </div>
              <div style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>{rk.recommendation}{!rk.meets_must_haves && <span style={{ color: "#ef4444", marginLeft: 6 }}>· Misses must-haves</span>}</div>
              {rk.must_have_gaps?.length > 0 && <div style={{ fontSize: 11, color: "#ef4444", marginTop: 4 }}>Gaps: {rk.must_have_gaps.join(", ")}</div>}
              {rk.strengths?.length > 0 && <div style={{ fontSize: 11, color: "#22c55e", marginTop: 4 }}>+ {rk.strengths.join("; ")}</div>}
              {rk.concerns?.length > 0 && <div style={{ fontSize: 11, color: "#ef4444", marginTop: 2 }}>− {rk.concerns.join("; ")}</div>}
            </div>
          ))}
          {aiResult.clarifications_needed?.length > 0 && (
            <div style={{ marginTop: 10, padding: 10, background: "#eab30815", borderLeft: "3px solid #eab308", borderRadius: 4 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#eab308", marginBottom: 4 }}>Clarifications to request</div>
              {aiResult.clarifications_needed.map((q, i) => <div key={i} style={{ fontSize: 11, color: T.text2 }}>• {q}</div>)}
            </div>
          )}
        </div>
      )}

      {providers.length === 0 ? (
        <div style={{ padding: 24, background: T.surface2, borderRadius: 8, border: "1px dashed " + T.border, textAlign: "center", color: T.text3, fontSize: 12 }}>
          Add providers first, then capture their submissions here.
        </div>
      ) : (
        providers.map(p => {
          const ps = subsByProvider.get(p.id) || [];
          return (
            <div key={p.id} style={{ marginBottom: 14, background: T.surface2, border: "1px solid " + T.border, borderRadius: 8 }}>
              <div style={{ padding: "10px 14px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: ps.length ? "1px solid " + T.border : "none" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{p.company_name}</div>
                  <div style={{ fontSize: 10, color: T.text3 }}>{ps.length} submission{ps.length === 1 ? "" : "s"}{p.country ? " · " + p.country : ""}</div>
                </div>
                <button onClick={() => setEditing({ rfp_provider_id: p.id, _new: true })} style={ghostBtn}>+ Add submission</button>
              </div>
              {ps.length > 0 && (
                <div>{ps.map(s => <SubmissionRow key={s.id} sub={s} onEdit={() => setEditing(s)} onDelete={() => onDeleted(s.id)} />)}</div>
              )}
            </div>
          );
        })
      )}

      {editing && <SubmissionModal sub={editing} rfp={rfp} provider={providers.find(p => p.id === editing.rfp_provider_id)} items={items} onClose={() => setEditing(null)} onSaved={onSaved} />}
    </div>
  );
}

// ─── Compact row for a single submission ──────────────────────────────────────
function SubmissionRow({ sub, onEdit, onDelete }) {
  const st = STATUS[sub.status] || STATUS.submitted;
  const tiers = sub.volume_tiers || [];
  return (
    <div onClick={onEdit} style={{ padding: "10px 14px", borderTop: "1px solid " + T.border + "60", cursor: "pointer", display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr auto", gap: 12, alignItems: "center" }} onMouseEnter={e => e.currentTarget.style.background = T.surface} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{sub.submission_name} {sub.variant_label && <span style={{ color: T.text3, fontWeight: 400 }}>· {sub.variant_label}</span>}</div>
        <div style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>{sub.manufacturing_location || "—"} · {sub.formulation_summary ? truncate(sub.formulation_summary, 60) : "no formulation summary"}</div>
      </div>
      <div>
        <div style={{ fontSize: 10, color: T.text3 }}>Base MOQ</div>
        <div style={{ fontSize: 12, color: T.text2, fontFamily: "monospace" }}>{fmtQty(sub.base_moq, sub.base_moq_unit)} @ {fmtMoney(sub.base_unit_price, sub.base_currency)}</div>
      </div>
      <div>
        <div style={{ fontSize: 10, color: T.text3 }}>Max break</div>
        <div style={{ fontSize: 12, color: T.text2, fontFamily: "monospace" }}>{fmtQty(sub.max_break_quantity)} @ {fmtMoney(sub.max_break_unit_price, sub.base_currency)}</div>
      </div>
      <div>
        <div style={{ fontSize: 10, color: T.text3 }}>Lead time</div>
        <div style={{ fontSize: 12, color: T.text2 }}>{sub.lead_time_days ? sub.lead_time_days + " days" : "—"}</div>
      </div>
      <div>
        <div style={{ fontSize: 10, color: T.text3 }}>Status / AI</div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 3, background: st.color + "20", color: st.color }}>{st.label}</span>
          {sub.ai_score != null && <span style={{ fontSize: 11, fontWeight: 700, color: sub.ai_score >= 70 ? "#22c55e" : sub.ai_score >= 50 ? "#eab308" : "#ef4444" }}>{Math.round(sub.ai_score)}</span>}
        </div>
        <div style={{ fontSize: 9, color: T.text3, marginTop: 2 }}>{tiers.length > 0 && tiers.length + " tiers"} {(sub.attachments || []).length > 0 && "· " + (sub.attachments).length + " files"}</div>
      </div>
      <button onClick={e => { e.stopPropagation(); onDelete(); }} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 14 }}>✕</button>
    </div>
  );
}

// ─── Submission modal (add/edit) ──────────────────────────────────────────────
function SubmissionModal({ sub, rfp, provider, items, onClose, onSaved }) {
  const { orgId } = useAuth();
  const isNew = !!sub._new;
  const [form, setForm] = useState(() => isNew ? {
    submission_name: "Primary",
    rfp_provider_id: sub.rfp_provider_id,
    rfp_id: rfp.id,
    org_id: orgId,
    base_currency: rfp?.currency || "USD",
    status: "submitted",
    volume_tiers: [],
    ingredients: [],
    test_results: [],
    attachments: [],
    certifications: [],
  } : { ...sub, volume_tiers: sub.volume_tiers || [], ingredients: sub.ingredients || [], test_results: sub.test_results || [], attachments: sub.attachments || [], certifications: sub.certifications || [] });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  const [tab, setTab] = useState("pricing"); // pricing | formulation | compliance | files

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const save = async () => {
    if (!form.submission_name?.trim()) { setErr("Submission name is required"); return; }
    setSaving(true); setErr(null);
    try {
      const payload = { ...form, submission_name: form.submission_name.trim() };
      delete payload._new;
      if (isNew) {
        const { data, error } = await supabase.from("plm_rfp_submissions").insert(payload).select().single();
        if (error) throw error;
        onSaved(data);
      } else {
        const { id, ...rest } = payload;
        const { data, error } = await supabase.from("plm_rfp_submissions").update(rest).eq("id", id).select().single();
        if (error) throw error;
        onSaved(data);
      }
    } catch (e) {
      setErr(e.message || String(e));
      setSaving(false);
    }
  };

  // Volume tiers
  const addTier = () => set("volume_tiers", [...(form.volume_tiers || []), { volume: "", unit_price: "" }]);
  const updateTier = (idx, k, v) => set("volume_tiers", form.volume_tiers.map((t, i) => i === idx ? { ...t, [k]: v } : t));
  const delTier = (idx) => set("volume_tiers", form.volume_tiers.filter((_, i) => i !== idx));

  // Ingredients
  const addIng = () => set("ingredients", [...(form.ingredients || []), { name: "", percentage: "", supplier_name: "", origin_country: "" }]);
  const updateIng = (idx, k, v) => set("ingredients", form.ingredients.map((t, i) => i === idx ? { ...t, [k]: v } : t));
  const delIng = (idx) => set("ingredients", form.ingredients.filter((_, i) => i !== idx));

  // Test results
  const addTest = () => set("test_results", [...(form.test_results || []), { test_name: "", value: "", unit: "", target: "", pass: null }]);
  const updateTest = (idx, k, v) => set("test_results", form.test_results.map((t, i) => i === idx ? { ...t, [k]: v } : t));
  const delTest = (idx) => set("test_results", form.test_results.filter((_, i) => i !== idx));

  // Attachments
  const addAtt = () => set("attachments", [...(form.attachments || []), { kind: "coa", name: "", url: "", notes: "" }]);
  const updateAtt = (idx, k, v) => set("attachments", form.attachments.map((t, i) => i === idx ? { ...t, [k]: v } : t));
  const delAtt = (idx) => set("attachments", form.attachments.filter((_, i) => i !== idx));

  const tabBtn = (k, label) => (
    <button onClick={() => setTab(k)} style={{ padding: "8px 14px", fontSize: 12, fontWeight: 600, background: tab === k ? T.surface2 : "transparent", color: tab === k ? T.text : T.text3, border: "none", borderBottom: "2px solid " + (tab === k ? T.accent : "transparent"), cursor: "pointer" }}>{label}</button>
  );

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: 10, maxWidth: 880, width: "100%", maxHeight: "92vh", display: "flex", flexDirection: "column", border: "1px solid " + T.border }}>
        {/* Header */}
        <div style={{ padding: "16px 20px", borderBottom: "1px solid " + T.border }}>
          <div style={{ fontSize: 14, color: T.text3 }}>{provider?.company_name}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
            <input value={form.submission_name} onChange={e => set("submission_name", e.target.value)} placeholder="Submission name (e.g. Best Performance)" style={{ background: "transparent", border: "none", color: T.text, fontSize: 18, fontWeight: 700, flex: 1, outline: "none" }} />
            <select value={form.status} onChange={e => set("status", e.target.value)} style={{ background: T.surface2, border: "1px solid " + T.border, color: T.text2, padding: "5px 8px", borderRadius: 5, fontSize: 12 }}>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
          </div>
          <input value={form.variant_label || ""} onChange={e => set("variant_label", e.target.value)} placeholder="Optional sub-label (e.g. Phosphate-free variant)" style={{ background: "transparent", border: "none", color: T.text3, fontSize: 12, width: "100%", outline: "none", marginTop: 4 }} />
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", borderBottom: "1px solid " + T.border, paddingLeft: 12 }}>
          {tabBtn("pricing", "💰 Pricing")}
          {tabBtn("formulation", "🧬 Formulation")}
          {tabBtn("compliance", "🛡️ Compliance & Tests")}
          {tabBtn("files", "📎 Attachments")}
        </div>

        {/* Tab content */}
        <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
          {tab === "pricing" && (
            <>
              <Field label="Manufacturing location" value={form.manufacturing_location} onChange={v => set("manufacturing_location", v)} placeholder="e.g. Lebanon, Kentucky, USA" />
              <Field label="Formulation summary" value={form.formulation_summary} onChange={v => set("formulation_summary", v)} multiline placeholder="High-level description of the proposed formulation" />

              <div style={{ marginTop: 14, padding: 12, background: T.surface2, borderRadius: 8 }}>
                <Label>Base pricing (at MOQ)</Label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 }}>
                  <Inline label="MOQ qty" type="number" value={form.base_moq} onChange={v => set("base_moq", v ? Number(v) : null)} />
                  <Inline label="MOQ unit" value={form.base_moq_unit} onChange={v => set("base_moq_unit", v)} placeholder="units / cs / lb" />
                  <Inline label="Unit price" type="number" value={form.base_unit_price} onChange={v => set("base_unit_price", v ? Number(v) : null)} />
                  <Inline label="Currency" value={form.base_currency} onChange={v => set("base_currency", v)} />
                </div>
              </div>

              <div style={{ marginTop: 14, padding: 12, background: "#22c55e10", borderRadius: 8, border: "1px solid #22c55e40" }}>
                <Label>Maximum price break (lowest achievable price)</Label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <Inline label="At quantity" type="number" value={form.max_break_quantity} onChange={v => set("max_break_quantity", v ? Number(v) : null)} />
                  <Inline label="Unit price at break" type="number" value={form.max_break_unit_price} onChange={v => set("max_break_unit_price", v ? Number(v) : null)} />
                </div>
                <div style={{ fontSize: 10, color: T.text3, marginTop: 6, fontStyle: "italic" }}>The supplier&apos;s lowest unit price and the volume required to unlock it.</div>
              </div>

              <div style={{ marginTop: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <Label>Volume tier table</Label>
                  <button onClick={addTier} style={ghostBtn}>+ Add tier</button>
                </div>
                {(form.volume_tiers || []).length === 0 ? (
                  <div style={{ padding: 12, color: T.text3, fontSize: 11, textAlign: "center", background: T.surface2, borderRadius: 6, fontStyle: "italic" }}>No tiers — add the supplier&apos;s tiered pricing curve</div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", background: T.surface2, borderRadius: 6, overflow: "hidden" }}>
                    <thead><tr style={{ background: T.surface }}>{["Volume","Unit price","Notes",""].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                    <tbody>
                      {form.volume_tiers.map((t, i) => (
                        <tr key={i}>
                          <td style={td}><input value={t.volume} onChange={e => updateTier(i, "volume", e.target.value ? Number(e.target.value) : "")} type="number" placeholder="qty" style={smallInp} /></td>
                          <td style={td}><input value={t.unit_price} onChange={e => updateTier(i, "unit_price", e.target.value ? Number(e.target.value) : "")} type="number" placeholder="0.000" style={smallInp} /></td>
                          <td style={td}><input value={t.notes || ""} onChange={e => updateTier(i, "notes", e.target.value)} placeholder="optional" style={smallInp} /></td>
                          <td style={td}><button onClick={() => delTier(i)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 13 }}>✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                <Inline label="Lead time (days)" type="number" value={form.lead_time_days} onChange={v => set("lead_time_days", v ? Number(v) : null)} />
                <Inline label="Ramp time (days)" type="number" value={form.ramp_time_days} onChange={v => set("ramp_time_days", v ? Number(v) : null)} />
                <Inline label="FOB / shipping point" value={form.fob_location} onChange={v => set("fob_location", v)} />
              </div>
              <Field label="Payment terms" value={form.payment_terms} onChange={v => set("payment_terms", v)} placeholder="e.g. Net 30, 50% deposit on PO" />
            </>
          )}

          {tab === "formulation" && (
            <>
              <Field label="Formulation summary" value={form.formulation_summary} onChange={v => set("formulation_summary", v)} multiline />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, marginTop: 14 }}>
                <Label>Ingredients</Label>
                <button onClick={addIng} style={ghostBtn}>+ Add ingredient</button>
              </div>
              {(form.ingredients || []).length === 0 ? (
                <div style={{ padding: 12, color: T.text3, fontSize: 11, textAlign: "center", background: T.surface2, borderRadius: 6, fontStyle: "italic" }}>No ingredients listed</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", background: T.surface2, borderRadius: 6, overflow: "hidden" }}>
                  <thead><tr style={{ background: T.surface }}>{["Ingredient","%","Supplier","Origin",""].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {form.ingredients.map((ing, i) => (
                      <tr key={i}>
                        <td style={td}><input value={ing.name} onChange={e => updateIng(i, "name", e.target.value)} placeholder="Ingredient name / INCI" style={smallInp} /></td>
                        <td style={td}><input value={ing.percentage} onChange={e => updateIng(i, "percentage", e.target.value)} type="number" step="0.01" placeholder="0.00" style={smallInp} /></td>
                        <td style={td}><input value={ing.supplier_name || ""} onChange={e => updateIng(i, "supplier_name", e.target.value)} placeholder="upstream supplier" style={smallInp} /></td>
                        <td style={td}><input value={ing.origin_country || ""} onChange={e => updateIng(i, "origin_country", e.target.value)} placeholder="country" style={smallInp} /></td>
                        <td style={td}><button onClick={() => delIng(i)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 13 }}>✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <Field label="Notes" value={form.notes} onChange={v => set("notes", v)} multiline placeholder="Anything else the supplier wants to call out" />
            </>
          )}

          {tab === "compliance" && (
            <>
              <Label>Certifications held (one per line)</Label>
              <textarea value={(form.certifications || []).join("\n")} onChange={e => set("certifications", e.target.value.split("\n").map(s => s.trim()).filter(Boolean))} rows={5} placeholder="Leaping Bunny&#10;USDA Biobased 75%&#10;ISO 9001:2015" style={textareaStyle} />

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, marginTop: 14 }}>
                <Label>Test results</Label>
                <button onClick={addTest} style={ghostBtn}>+ Add test</button>
              </div>
              {(form.test_results || []).length === 0 ? (
                <div style={{ padding: 12, color: T.text3, fontSize: 11, textAlign: "center", background: T.surface2, borderRadius: 6, fontStyle: "italic" }}>No test results — add performance test data (SRI, foam height, viscosity, etc.)</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", background: T.surface2, borderRadius: 6, overflow: "hidden" }}>
                  <thead><tr style={{ background: T.surface }}>{["Test","Value","Unit","Target","Pass",""].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>
                    {form.test_results.map((t, i) => (
                      <tr key={i}>
                        <td style={td}><input value={t.test_name} onChange={e => updateTest(i, "test_name", e.target.value)} placeholder="e.g. SRI overall" style={smallInp} /></td>
                        <td style={td}><input value={t.value} onChange={e => updateTest(i, "value", e.target.value)} placeholder="result" style={smallInp} /></td>
                        <td style={td}><input value={t.unit || ""} onChange={e => updateTest(i, "unit", e.target.value)} placeholder="unit" style={smallInp} /></td>
                        <td style={td}><input value={t.target || ""} onChange={e => updateTest(i, "target", e.target.value)} placeholder="target" style={smallInp} /></td>
                        <td style={td}>
                          <select value={t.pass == null ? "" : (t.pass ? "yes" : "no")} onChange={e => updateTest(i, "pass", e.target.value === "" ? null : e.target.value === "yes")} style={{ ...smallInp, padding: "5px 7px" }}>
                            <option value="">—</option><option value="yes">✓ Pass</option><option value="no">✕ Fail</option>
                          </select>
                        </td>
                        <td style={td}><button onClick={() => delTest(i)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 13 }}>✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}

          {tab === "files" && (
            <>
              <div style={{ fontSize: 11, color: T.text3, marginBottom: 10 }}>Paste links to documents the supplier provided (CoAs, test reports, certifications, MSDS, etc.). Use Google Drive / Dropbox / S3 share links.</div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <Label>Attachments</Label>
                <button onClick={addAtt} style={ghostBtn}>+ Add attachment</button>
              </div>
              {(form.attachments || []).length === 0 ? (
                <div style={{ padding: 16, color: T.text3, fontSize: 11, textAlign: "center", background: T.surface2, borderRadius: 6, fontStyle: "italic" }}>No attachments. Click + Add to paste links to CoAs, test reports, etc.</div>
              ) : (
                <div>
                  {form.attachments.map((a, i) => (
                    <div key={i} style={{ padding: 10, background: T.surface2, borderRadius: 6, marginBottom: 6, display: "grid", gridTemplateColumns: "180px 1fr 2fr 60px", gap: 8, alignItems: "center" }}>
                      <select value={a.kind} onChange={e => updateAtt(i, "kind", e.target.value)} style={smallInp}>
                        {ATTACH_KINDS.map(k => <option key={k.key} value={k.key}>{k.label}</option>)}
                      </select>
                      <input value={a.name} onChange={e => updateAtt(i, "name", e.target.value)} placeholder="File name / title" style={smallInp} />
                      <input value={a.url} onChange={e => updateAtt(i, "url", e.target.value)} placeholder="https://..." style={smallInp} />
                      <button onClick={() => delAtt(i)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 14 }}>✕</button>
                      <input value={a.notes || ""} onChange={e => updateAtt(i, "notes", e.target.value)} placeholder="Notes (optional)" style={{ ...smallInp, gridColumn: "1 / -1" }} />
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "12px 20px", borderTop: "1px solid " + T.border, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 11, color: T.text3 }}>{err && <span style={{ color: "#ef4444" }}>{err}</span>}</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={ghostBtn}>Cancel</button>
            <button onClick={save} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.5 : 1 }}>{saving ? "Saving…" : (isNew ? "Add submission" : "Save changes")}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Shared bits ──────────────────────────────────────────────────────────────
const th = { padding: "6px 8px", fontSize: 9, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.4, textAlign: "left" };
const td = { padding: "6px 8px" };
const smallInp = { background: T.surface, border: "1px solid " + T.border, color: T.text, fontSize: 12, padding: "5px 7px", borderRadius: 4, outline: "none", width: "100%", boxSizing: "border-box" };
const primaryBtn = { background: T.accent, color: "#fff", border: "none", borderRadius: 6, padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" };
const ghostBtn   = { background: "none", border: "1px solid " + T.border, color: T.text2, borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer" };
const inputStyle  = { background: T.surface, border: "1px solid " + T.border, color: T.text, fontSize: 13, padding: "7px 10px", borderRadius: 5, width: "100%", outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
const textareaStyle = { ...inputStyle, resize: "vertical", lineHeight: 1.5 };

const Label = ({ children }) => <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>{children}</div>;

function Field({ label, value, onChange, placeholder, type = "text", multiline }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <Label>{label}</Label>
      {multiline
        ? <textarea value={value || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3} style={textareaStyle} />
        : <input value={value || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} type={type} style={inputStyle} />}
    </div>
  );
}

function Inline({ label, value, onChange, placeholder, type = "text" }) {
  return (
    <div>
      <Label>{label}</Label>
      <input value={value ?? ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} type={type} style={smallInp} />
    </div>
  );
}

function truncate(s, n) { return !s ? "" : (s.length > n ? s.slice(0, n - 1) + "…" : s); }
