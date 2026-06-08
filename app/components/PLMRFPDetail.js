"use client";
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";
import { useAuth } from "../lib/auth";

const STATUS_COLORS = {
  draft: { bg: "#94a3b815", color: "#94a3b8", label: "Draft" },
  review: { bg: "#eab30815", color: "#eab308", label: "In review" },
  sent: { bg: "#3b82f615", color: "#3b82f6", label: "Sent" },
  responses_open: { bg: "#06b6d415", color: "#06b6d4", label: "Responses open" },
  closed: { bg: "#64748b15", color: "#64748b", label: "Closed" },
  awarded: { bg: "#22c55e15", color: "#22c55e", label: "Awarded" },
  cancelled: { bg: "#ef444415", color: "#ef4444", label: "Cancelled" },
};

const TYPE_LABELS = { ingredient: "🧪 Ingredient", packaging: "📦 Packaging", contract_manufacturer: "🏭 Contract Manufacturer", other: "🔧 Other" };

const fmtMoney = (n, c = "USD") => n == null ? "—" : ({USD:"$",GBP:"£",AUD:"A$",EUR:"€",CAD:"C$"}[c]||"$") + Number(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtDate  = (d) => d ? new Date(d).toLocaleDateString(undefined, { month:"short", day:"numeric", year:"numeric" }) : "—";

export default function PLMRFPDetail({ rfp: rfpInitial, program, onBack }) {
  const { orgId } = useAuth();
  const [rfp, setRfp] = useState(rfpInitial);
  const [items, setItems] = useState([]);
  const [providers, setProviders] = useState([]);
  const [responses, setResponses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [aiChat, setAiChat] = useState([]);
  const [aiInput, setAiInput] = useState("");
  const [toast, setToast] = useState(null);
  const showToast = (msg, kind = "ok") => { setToast({ msg, kind }); setTimeout(() => setToast(null), 3500); };

  const sc = STATUS_COLORS[rfp.status] || STATUS_COLORS.draft;
  const isEditable = rfp.status === "draft" || rfp.status === "review";
  const isSent = ["sent","responses_open","closed","awarded"].includes(rfp.status);

  // ── Loaders ──────────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    if (!orgId || !rfp.id) return;
    setLoading(true);
    const [{ data: it }, { data: pv }, { data: rs }] = await Promise.all([
      supabase.from("plm_rfp_items").select("*").eq("rfp_id", rfp.id).order("sort_order"),
      supabase.from("plm_rfp_providers").select("*").eq("rfp_id", rfp.id).order("invited_at"),
      supabase.from("plm_rfp_responses").select("*").eq("rfp_id", rfp.id),
    ]);
    setItems(it || []);
    setProviders(pv || []);
    setResponses(rs || []);
    setLoading(false);
  }, [orgId, rfp.id]);

  useEffect(() => { load(); }, [load]);

  // ── RFP-level edits ──────────────────────────────────────────────────────
  const updateRfp = async (patch) => {
    const next = { ...rfp, ...patch };
    setRfp(next);
    await supabase.from("plm_rfps").update(patch).eq("id", rfp.id);
  };

  const setStatus = async (status) => {
    await updateRfp({ status });
    showToast(`Status → ${status}`);
  };

  // ── Items CRUD ───────────────────────────────────────────────────────────
  const addItem = async () => {
    const { data } = await supabase.from("plm_rfp_items").insert({
      org_id: orgId, rfp_id: rfp.id, item_name: "New item",
      sort_order: items.length,
    }).select().single();
    if (data) setItems(prev => [...prev, data]);
  };
  const updateItem = async (id, patch) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
    await supabase.from("plm_rfp_items").update(patch).eq("id", id);
  };
  const deleteItem = async (id) => {
    if (!confirm("Delete this item?")) return;
    await supabase.from("plm_rfp_items").delete().eq("id", id);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  // ── Providers CRUD ───────────────────────────────────────────────────────
  const addProvider = async (data = {}) => {
    const { data: p } = await supabase.from("plm_rfp_providers").insert({
      org_id: orgId, rfp_id: rfp.id,
      company_name: data.company_name || "New provider",
      contact_name: data.contact_name || null,
      contact_email: data.contact_email || "",
      website: data.website || null,
      country: data.country || null,
      notes: data.notes || null,
      ai_recommended: data.ai_recommended || false,
    }).select().single();
    if (p) setProviders(prev => [...prev, p]);
  };
  const updateProvider = async (id, patch) => {
    setProviders(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p));
    await supabase.from("plm_rfp_providers").update(patch).eq("id", id);
  };
  const deleteProvider = async (id) => {
    if (!confirm("Remove this provider?")) return;
    await supabase.from("plm_rfp_providers").delete().eq("id", id);
    setProviders(prev => prev.filter(p => p.id !== id));
    setResponses(prev => prev.filter(r => r.rfp_provider_id !== id));
  };

  // ── Responses (manual entry until public response page is live) ─────────
  const upsertResponse = async (rfp_item_id, rfp_provider_id, patch) => {
    const existing = responses.find(r => r.rfp_item_id === rfp_item_id && r.rfp_provider_id === rfp_provider_id);
    if (existing) {
      setResponses(prev => prev.map(r => r.id === existing.id ? { ...r, ...patch } : r));
      await supabase.from("plm_rfp_responses").update(patch).eq("id", existing.id);
    } else {
      const { data } = await supabase.from("plm_rfp_responses").insert({
        org_id: orgId, rfp_id: rfp.id, rfp_item_id, rfp_provider_id, ...patch,
      }).select().single();
      if (data) setResponses(prev => [...prev, data]);
    }
  };
  const getResp = (itemId, providerId) => responses.find(r => r.rfp_item_id === itemId && r.rfp_provider_id === providerId);

  // ── AI actions ───────────────────────────────────────────────────────────
  const callAI = async (action, body) => {
    setAiBusy(true); setAiResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("plm-rfp-assist", {
        body: { action, ...body },
      });
      if (error) throw error;
      return data;
    } catch (e) {
      showToast("AI error: " + (e.message || String(e)), "err");
      return null;
    } finally {
      setAiBusy(false);
    }
  };

  const aiDraftBrief = async () => {
    const sourcingItem = items.length > 0 ? { name: items[0].item_name, description: items[0].specification, notes: items[0].notes } : { name: rfp.name, description: rfp.description };
    const r = await callAI("draft_brief", {
      program: { name: program.name, description: program.description, category: program.category, target_markets: program.target_markets_v2 },
      sourcing_item: sourcingItem,
      rfp_type: rfp.rfp_type,
      target_volume: rfp.target_volume,
      target_volume_unit: rfp.target_volume_unit,
      currency: rfp.currency,
    });
    if (r?.brief) {
      setAiResult({ kind: "brief", data: r.brief });
      setAiPanelOpen(true);
    }
  };

  const aiSuggestProviders = async () => {
    const r = await callAI("suggest_providers", {
      rfp: { name: rfp.name, rfp_type: rfp.rfp_type, description: rfp.description, target_volume: rfp.target_volume, target_volume_unit: rfp.target_volume_unit, currency: rfp.currency },
      items: items.map(i => ({ item_name: i.item_name, specification: i.specification, quantity: i.quantity, quantity_unit: i.quantity_unit })),
      known_providers: providers.map(p => ({ company_name: p.company_name })),
    });
    if (r?.providers) {
      setAiResult({ kind: "providers", data: r });
      setAiPanelOpen(true);
    }
  };

  const aiAnalyzeResponses = async () => {
    const r = await callAI("analyze_responses", {
      rfp, items, providers, responses,
    });
    if (r?.rankings) {
      setAiResult({ kind: "rankings", data: r });
      setAiPanelOpen(true);
      // Persist ai_score back to provider rows
      for (const rk of r.rankings) {
        await supabase.from("plm_rfp_providers").update({
          ai_score: rk.score, ai_score_breakdown: rk.breakdown, ai_score_notes: (rk.strengths?.join(". ") || "") + (rk.concerns?.length ? " | Concerns: " + rk.concerns.join(", ") : ""),
        }).eq("id", rk.rfp_provider_id);
      }
      await load();
    }
  };

  const aiChatSend = async () => {
    if (!aiInput.trim()) return;
    const msg = aiInput.trim();
    setAiInput("");
    const newHist = [...aiChat, { role: "user", content: msg }];
    setAiChat(newHist);
    const r = await callAI("chat", {
      rfp, items, providers, responses,
      history: aiChat, user_message: msg,
    });
    if (r?.reply) setAiChat([...newHist, { role: "assistant", content: r.reply }]);
  };

  const applyBrief = async (brief) => {
    await updateRfp({
      description: brief.description || rfp.description,
      evaluation_criteria: brief.evaluation_criteria,
      ai_brief: brief,
    });
    if (items.length === 1 && (brief.specification || brief.questions_for_providers)) {
      await updateItem(items[0].id, {
        specification: brief.specification || items[0].specification,
        required_certifications: brief.required_certifications || items[0].required_certifications,
      });
    }
    showToast("Brief applied to RFP");
    setAiPanelOpen(false);
  };

  const addSuggestedProvider = async (p) => {
    await addProvider({
      company_name: p.company_name,
      country: p.country,
      website: p.website,
      contact_email: "",
      notes: p.why_suggested + (p.strengths?.length ? ". Strengths: " + p.strengths.join(", ") : "") + (p.risks?.length ? ". Risks: " + p.risks.join(", ") : ""),
      ai_recommended: true,
    });
    showToast(`Added ${p.company_name}`);
  };

  // ── Render ───────────────────────────────────────────────────────────────
  if (loading) return <div style={{ padding: 40, textAlign: "center", color: T.text3 }}>Loading RFP…</div>;

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
          <button onClick={onBack} style={ghostBtn}>← Back to Sourcing</button>
          <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 4, background: sc.bg, color: sc.color }}>{sc.label}</span>
          <span style={{ fontSize: 11, color: T.text3 }}>{TYPE_LABELS[rfp.rfp_type]}</span>
          {rfp.due_date && <span style={{ fontSize: 11, color: T.text3 }}>Due {fmtDate(rfp.due_date)}</span>}
          <div style={{ flex: 1 }} />
          <button onClick={() => setAiPanelOpen(o => !o)} style={{ ...primaryBtn, background: "#8b5cf6" }}>✨ AI Assistant</button>
          {rfp.status === "draft" && <button onClick={() => setStatus("sent")} disabled={items.length === 0 || providers.length === 0} style={{ ...primaryBtn, opacity: (items.length === 0 || providers.length === 0) ? 0.5 : 1 }} title={items.length === 0 ? "Add items first" : providers.length === 0 ? "Invite providers first" : "Send RFP"}>📤 Send RFP</button>}
          {isSent && rfp.status !== "closed" && rfp.status !== "awarded" && <button onClick={() => setStatus("closed")} style={ghostBtn}>Close</button>}
          {(rfp.status === "closed" || rfp.status === "sent" || rfp.status === "responses_open") && <AwardButton providers={providers} onAward={async (pid) => { await updateRfp({ awarded_provider_id: pid, status: "awarded", awarded_at: new Date().toISOString() }); await supabase.from("plm_rfp_providers").update({ status: "awarded" }).eq("id", pid); showToast("Provider awarded"); }} />}
        </div>

        {/* Name + description */}
        <div style={{ marginBottom: 18 }}>
          <input value={rfp.name} onChange={e => updateRfp({ name: e.target.value })} disabled={!isEditable} style={{ background: "transparent", border: "none", color: T.text, fontSize: 22, fontWeight: 700, width: "100%", outline: "none", padding: "2px 0" }} />
          <textarea value={rfp.description || ""} onChange={e => updateRfp({ description: e.target.value })} disabled={!isEditable} placeholder="Description / scope of work…" rows={2} style={{ background: "transparent", border: "none", color: T.text2, fontSize: 13, width: "100%", outline: "none", padding: "2px 0", resize: "vertical", fontFamily: "inherit" }} />
        </div>

        {/* Settings row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 24, padding: 12, background: T.surface2, borderRadius: 8 }}>
          <SmallField label="Due date" type="date" value={rfp.due_date || ""} onChange={v => updateRfp({ due_date: v || null })} disabled={!isEditable} />
          <SmallField label="Currency" value={rfp.currency || "USD"} onChange={v => updateRfp({ currency: v })} disabled={!isEditable} />
          <SmallField label="Target volume" type="number" value={rfp.target_volume || ""} onChange={v => updateRfp({ target_volume: v ? Number(v) : null })} disabled={!isEditable} />
          <SmallField label="Unit" value={rfp.target_volume_unit || ""} onChange={v => updateRfp({ target_volume_unit: v })} disabled={!isEditable} />
        </div>

        {/* Items */}
        <Section title={`Items (${items.length})`} action={isEditable && <button onClick={addItem} style={ghostBtn}>+ Add item</button>}>
          {items.length === 0 ? <Empty hint="No items yet — add what you want providers to bid on" /> : (
            <div>
              {items.map((it, idx) => (
                <div key={it.id} style={{ background: T.surface2, border: "1px solid " + T.border, borderRadius: 8, padding: 12, marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, padding: "3px 8px", background: T.surface, borderRadius: 4 }}>#{idx + 1}</div>
                    <div style={{ flex: 1 }}>
                      <input value={it.item_name} onChange={e => updateItem(it.id, { item_name: e.target.value })} disabled={!isEditable} style={{ background: "transparent", border: "none", color: T.text, fontSize: 14, fontWeight: 600, width: "100%", outline: "none" }} />
                      <textarea value={it.specification || ""} onChange={e => updateItem(it.id, { specification: e.target.value })} disabled={!isEditable} placeholder="Specification / scope of work / requirements" rows={2} style={{ background: "transparent", border: "none", color: T.text2, fontSize: 12, width: "100%", outline: "none", marginTop: 6, resize: "vertical", fontFamily: "inherit" }} />
                      <div style={{ display: "flex", gap: 8, marginTop: 8, alignItems: "center" }}>
                        <input value={it.quantity || ""} onChange={e => updateItem(it.id, { quantity: e.target.value ? Number(e.target.value) : null })} disabled={!isEditable} type="number" placeholder="Qty" style={smallInp(80)} />
                        <input value={it.quantity_unit || ""} onChange={e => updateItem(it.id, { quantity_unit: e.target.value })} disabled={!isEditable} placeholder="unit" style={smallInp(80)} />
                        <input value={(it.required_certifications || []).join(", ")} onChange={e => updateItem(it.id, { required_certifications: e.target.value.split(",").map(s=>s.trim()).filter(Boolean) })} disabled={!isEditable} placeholder="Required certs (organic, ISO9001, kosher…)" style={{ ...smallInp(0), flex: 1 }} />
                      </div>
                    </div>
                    {isEditable && <button onClick={() => deleteItem(it.id)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 14 }}>✕</button>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Providers */}
        <Section title={`Providers (${providers.length})`} action={
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={aiSuggestProviders} disabled={aiBusy} style={{ ...ghostBtn, color: "#8b5cf6", borderColor: "#8b5cf650" }}>✨ {aiBusy ? "Thinking…" : "AI suggest"}</button>
            {isEditable && <button onClick={() => addProvider()} style={ghostBtn}>+ Add provider</button>}
          </div>
        }>
          {providers.length === 0 ? <Empty hint="No providers yet — invite suppliers to bid, or use AI to suggest candidates" /> : (
            <div style={{ overflow: "auto", border: "1px solid " + T.border, borderRadius: 8 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: T.surface }}>
                    {["Company","Contact","Email","Country","Status","AI Score",""].map(h => <th key={h} style={th}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {providers.map(p => (
                    <tr key={p.id} style={{ borderTop: "1px solid " + T.border + "60" }}>
                      <td style={td}>
                        <input value={p.company_name} onChange={e => updateProvider(p.id, { company_name: e.target.value })} disabled={!isEditable && rfp.status !== "sent"} style={inlineInp} />
                        {p.ai_recommended && <span style={{ fontSize: 9, color: "#8b5cf6", marginLeft: 4 }}>✨ AI</span>}
                        {p.website && <a href={p.website} target="_blank" rel="noreferrer" style={{ fontSize: 10, color: T.text3, marginLeft: 6, textDecoration: "underline" }}>website</a>}
                      </td>
                      <td style={td}><input value={p.contact_name || ""} onChange={e => updateProvider(p.id, { contact_name: e.target.value })} disabled={!isEditable && rfp.status !== "sent"} style={inlineInp} placeholder="Contact" /></td>
                      <td style={td}><input value={p.contact_email || ""} onChange={e => updateProvider(p.id, { contact_email: e.target.value })} disabled={!isEditable && rfp.status !== "sent"} style={inlineInp} placeholder="email@example.com" /></td>
                      <td style={td}><input value={p.country || ""} onChange={e => updateProvider(p.id, { country: e.target.value })} disabled={!isEditable && rfp.status !== "sent"} style={inlineInp} placeholder="—" /></td>
                      <td style={td}><span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 3, background: T.surface, color: T.text3 }}>{p.status}</span></td>
                      <td style={td}>{p.ai_score != null ? <strong style={{ color: p.ai_score >= 70 ? "#22c55e" : p.ai_score >= 50 ? "#eab308" : "#ef4444" }}>{Math.round(p.ai_score)}</strong> : "—"}</td>
                      <td style={td}>{isEditable && <button onClick={() => deleteProvider(p.id)} style={{ background:"none", border:"none", color:T.text3, cursor:"pointer", fontSize:14 }}>✕</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>

        {/* Responses (manual entry matrix) */}
        {providers.length > 0 && items.length > 0 && (
          <Section title="Response Matrix" subtitle="Enter responses as they come in. Click ✨ Analyze to score with AI." action={
            <button onClick={aiAnalyzeResponses} disabled={aiBusy || responses.length === 0} style={{ ...primaryBtn, background: "#8b5cf6", opacity: (aiBusy || responses.length === 0) ? 0.5 : 1 }}>
              ✨ {aiBusy ? "Analyzing…" : "Analyze with AI"}
            </button>
          }>
            <div style={{ overflow: "auto", border: "1px solid " + T.border, borderRadius: 8 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: T.surface }}>
                    <th style={th}>Item</th>
                    {providers.map(p => <th key={p.id} style={th} colSpan={2}>{p.company_name}</th>)}
                  </tr>
                  <tr style={{ background: T.surface }}>
                    <th style={th}></th>
                    {providers.map(p => <>
                      <th key={`u${p.id}`} style={{ ...th, fontSize: 9 }}>Unit price</th>
                      <th key={`l${p.id}`} style={{ ...th, fontSize: 9 }}>Lead (d)</th>
                    </>)}
                  </tr>
                </thead>
                <tbody>
                  {items.map(it => (
                    <tr key={it.id} style={{ borderTop: "1px solid " + T.border + "60" }}>
                      <td style={td}><strong>{it.item_name}</strong></td>
                      {providers.map(p => {
                        const r = getResp(it.id, p.id);
                        return <>
                          <td key={`u${p.id}`} style={td}>
                            <input value={r?.unit_price ?? ""} onChange={e => upsertResponse(it.id, p.id, { unit_price: e.target.value ? Number(e.target.value) : null, currency: rfp.currency })} type="number" placeholder="—" style={smallInp(90)} />
                          </td>
                          <td key={`l${p.id}`} style={td}>
                            <input value={r?.lead_time_days ?? ""} onChange={e => upsertResponse(it.id, p.id, { lead_time_days: e.target.value ? Number(e.target.value) : null })} type="number" placeholder="—" style={smallInp(60)} />
                          </td>
                        </>;
                      })}
                    </tr>
                  ))}
                  <tr style={{ borderTop: "2px solid " + T.border, background: T.surface }}>
                    <td style={{ ...td, fontWeight: 700, fontSize: 11 }}>Totals</td>
                    {providers.map(p => {
                      const tot = items.reduce((s, it) => s + (Number(getResp(it.id, p.id)?.unit_price) || 0) * (Number(it.quantity) || 1), 0);
                      const avgLead = (() => {
                        const ls = items.map(it => Number(getResp(it.id, p.id)?.lead_time_days)).filter(n => n > 0);
                        return ls.length ? Math.round(ls.reduce((a,b)=>a+b,0)/ls.length) : null;
                      })();
                      return <>
                        <td key={`tu${p.id}`} style={{ ...td, fontWeight: 700 }}>{tot > 0 ? fmtMoney(tot, rfp.currency) : "—"}</td>
                        <td key={`tl${p.id}`} style={{ ...td, fontWeight: 700 }}>{avgLead != null ? avgLead : "—"}</td>
                      </>;
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>
        )}
      </div>

      {/* AI Panel */}
      {aiPanelOpen && (
        <div style={{ width: 380, flexShrink: 0, position: "sticky", top: 20, background: T.surface2, border: "1px solid " + T.border, borderRadius: 10, padding: 14, maxHeight: "calc(100vh - 80px)", overflow: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#8b5cf6" }}>✨ AI Assistant</div>
            <button onClick={() => setAiPanelOpen(false)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer" }}>✕</button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 12 }}>
            <button onClick={aiDraftBrief} disabled={aiBusy} style={aiActionBtn}>📝 Draft brief</button>
            <button onClick={aiSuggestProviders} disabled={aiBusy} style={aiActionBtn}>🔍 Suggest providers</button>
            <button onClick={aiAnalyzeResponses} disabled={aiBusy || responses.length === 0} style={{ ...aiActionBtn, opacity: responses.length === 0 ? 0.5 : 1 }}>📊 Analyze responses</button>
            <button onClick={() => setAiResult(null)} style={aiActionBtn}>🔄 Clear</button>
          </div>

          {aiBusy && <div style={{ padding: 16, textAlign: "center", color: T.text3, fontSize: 12 }}>AI is thinking…</div>}

          {/* AI Results */}
          {aiResult?.kind === "brief" && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 6 }}>Suggested Brief</div>
              <div style={{ fontSize: 11, color: T.text2, lineHeight: 1.5, padding: 10, background: T.surface, borderRadius: 6, maxHeight: 200, overflow: "auto" }}>
                <div><strong>Name:</strong> {aiResult.data.name}</div>
                <div style={{ marginTop: 4 }}><strong>Description:</strong> {aiResult.data.description}</div>
                <div style={{ marginTop: 4 }}><strong>Spec:</strong> {aiResult.data.specification}</div>
                {aiResult.data.required_certifications?.length > 0 && <div style={{ marginTop: 4 }}><strong>Certs:</strong> {aiResult.data.required_certifications.join(", ")}</div>}
                {aiResult.data.market_context && <div style={{ marginTop: 4, fontStyle: "italic" }}>{aiResult.data.market_context}</div>}
              </div>
              <button onClick={() => applyBrief(aiResult.data)} style={{ ...primaryBtn, width: "100%", marginTop: 8 }}>Apply to RFP</button>
            </div>
          )}

          {aiResult?.kind === "providers" && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 6 }}>Suggested Providers</div>
              {aiResult.data.market_notes && <div style={{ fontSize: 11, color: T.text3, fontStyle: "italic", marginBottom: 8 }}>{aiResult.data.market_notes}</div>}
              {aiResult.data.providers.map((p, i) => (
                <div key={i} style={{ padding: 10, background: T.surface, borderRadius: 6, marginBottom: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 6 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{p.company_name}</div>
                      <div style={{ fontSize: 10, color: T.text3 }}>{p.country} {p.website && <>· <a href={p.website} target="_blank" rel="noreferrer" style={{ color: T.text3 }}>{p.website.replace(/^https?:\/\//,"")}</a></>} · {p.confidence}% match</div>
                    </div>
                    <button onClick={() => addSuggestedProvider(p)} style={{ ...ghostBtn, padding: "3px 8px", fontSize: 10 }}>+ Add</button>
                  </div>
                  <div style={{ fontSize: 11, color: T.text2, marginTop: 4 }}>{p.why_suggested}</div>
                </div>
              ))}
            </div>
          )}

          {aiResult?.kind === "rankings" && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 6 }}>AI Analysis</div>
              {aiResult.data.summary && <div style={{ fontSize: 11, color: T.text2, fontStyle: "italic", marginBottom: 8, padding: 8, background: T.surface, borderRadius: 6 }}>{aiResult.data.summary}</div>}
              {aiResult.data.rankings.map((rk, i) => (
                <div key={i} style={{ padding: 10, background: T.surface, borderRadius: 6, marginBottom: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>#{i + 1} {rk.company_name}</div>
                    <div style={{ fontSize: 14, fontWeight: 800, color: rk.score >= 70 ? "#22c55e" : rk.score >= 50 ? "#eab308" : "#ef4444" }}>{Math.round(rk.score)}</div>
                  </div>
                  <div style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>{rk.recommendation}</div>
                  {rk.strengths?.length > 0 && <div style={{ fontSize: 11, color: "#22c55e", marginTop: 4 }}>+ {rk.strengths.join("; ")}</div>}
                  {rk.concerns?.length > 0 && <div style={{ fontSize: 11, color: "#ef4444", marginTop: 2 }}>− {rk.concerns.join("; ")}</div>}
                </div>
              ))}
              {aiResult.data.clarifications_needed?.length > 0 && (
                <div style={{ marginTop: 10, padding: 10, background: "#eab30815", borderLeft: "3px solid #eab308", borderRadius: 4 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#eab308", marginBottom: 4 }}>Clarifications needed</div>
                  {aiResult.data.clarifications_needed.map((q, i) => <div key={i} style={{ fontSize: 11, color: T.text2 }}>• {q}</div>)}
                </div>
              )}
            </div>
          )}

          {/* Chat */}
          <div style={{ borderTop: "1px solid " + T.border, paddingTop: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>Ask anything</div>
            <div style={{ maxHeight: 200, overflow: "auto", marginBottom: 6 }}>
              {aiChat.map((m, i) => (
                <div key={i} style={{ marginBottom: 6, padding: 8, background: m.role === "user" ? T.accent + "15" : T.surface, borderRadius: 6, fontSize: 11, color: T.text2, lineHeight: 1.4 }}>{m.content}</div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <input value={aiInput} onChange={e => setAiInput(e.target.value)} onKeyDown={e => e.key === "Enter" && aiChatSend()} placeholder="Ask about this RFP…" style={{ flex: 1, background: T.surface, border: "1px solid " + T.border, color: T.text, fontSize: 12, padding: "7px 10px", borderRadius: 5, outline: "none" }} />
              <button onClick={aiChatSend} disabled={aiBusy || !aiInput.trim()} style={{ ...primaryBtn, padding: "7px 12px", background: "#8b5cf6", opacity: (aiBusy || !aiInput.trim()) ? 0.5 : 1 }}>→</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: 20, right: 20, padding: "10px 18px", background: toast.kind === "err" ? "#ef4444" : "#22c55e", color: "#fff", borderRadius: 6, fontSize: 13, fontWeight: 600, boxShadow: "0 4px 12px rgba(0,0,0,0.2)" }}>{toast.msg}</div>
      )}
    </div>
  );
}

function AwardButton({ providers, onAward }) {
  const [open, setOpen] = useState(false);
  const submitted = providers.filter(p => p.status !== "rejected");
  if (submitted.length === 0) return null;
  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)} style={{ ...primaryBtn, background: "#22c55e" }}>🏆 Award</button>
      {open && (
        <div style={{ position: "absolute", top: "100%", right: 0, marginTop: 4, background: T.surface, border: "1px solid " + T.border, borderRadius: 6, minWidth: 240, zIndex: 100, boxShadow: "0 4px 12px rgba(0,0,0,0.15)" }}>
          {submitted.map(p => (
            <div key={p.id} onClick={() => { setOpen(false); onAward(p.id); }} style={{ padding: "10px 14px", fontSize: 12, color: T.text2, cursor: "pointer", borderBottom: "1px solid " + T.border + "40" }} onMouseEnter={e => e.currentTarget.style.background = T.surface2} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              {p.company_name} {p.ai_score != null && <span style={{ fontSize: 10, color: T.text3 }}>· AI {Math.round(p.ai_score)}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Shared bits ────────────────────────────────────────────────────────────────
const th = { padding: "10px 12px", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.4, textAlign: "left", whiteSpace: "nowrap" };
const td = { padding: "8px 12px", fontSize: 12, color: T.text2 };
const primaryBtn = { background: T.accent, color: "#fff", border: "none", borderRadius: 6, padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" };
const ghostBtn   = { background: "none", border: "1px solid " + T.border, color: T.text2, borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" };
const aiActionBtn = { background: T.surface, border: "1px solid " + T.border, color: T.text2, borderRadius: 6, padding: "8px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer", textAlign: "left" };
const inlineInp = { background: "transparent", border: "none", color: T.text2, fontSize: 12, padding: "2px 4px", width: "100%", outline: "none" };
const smallInp = (w) => ({ background: T.surface, border: "1px solid " + T.border, color: T.text, fontSize: 12, padding: "5px 7px", borderRadius: 4, outline: "none", width: w || undefined });

function SmallField({ label, value, onChange, type = "text", disabled }) {
  return (
    <div>
      <div style={{ fontSize: 9, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 3 }}>{label}</div>
      <input value={value} onChange={e => onChange(e.target.value)} type={type} disabled={disabled} style={{ ...smallInp(0), width: "100%" }} />
    </div>
  );
}

function Section({ title, subtitle, action, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>{subtitle}</div>}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function Empty({ hint }) {
  return <div style={{ padding: 20, textAlign: "center", background: T.surface2, borderRadius: 8, border: "1px dashed " + T.border, color: T.text3, fontSize: 12 }}>{hint}</div>;
}
