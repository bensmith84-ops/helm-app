"use client";
import { useState, useEffect, useCallback, useMemo, lazy, Suspense } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";
import { useAuth } from "../lib/auth";

const PLMRFPDetail = lazy(() => import("./PLMRFPDetail"));

const SOURCING_TYPES = [
  { key: "ingredient",            label: "Ingredient",            icon: "🧪", color: "#3b82f6" },
  { key: "packaging",             label: "Packaging",             icon: "📦", color: "#8b5cf6" },
  { key: "contract_manufacturer", label: "Contract Manufacturer", icon: "🏭", color: "#f97316" },
  { key: "other",                 label: "Other",                 icon: "🔧", color: "#8b93a8" },
];

const STATUS_COLORS = {
  draft:           { bg: "#94a3b815", color: "#94a3b8", label: "Draft" },
  review:          { bg: "#eab30815", color: "#eab308", label: "In review" },
  sent:            { bg: "#3b82f615", color: "#3b82f6", label: "Sent" },
  responses_open:  { bg: "#06b6d415", color: "#06b6d4", label: "Responses open" },
  closed:          { bg: "#64748b15", color: "#64748b", label: "Closed" },
  awarded:         { bg: "#22c55e15", color: "#22c55e", label: "Awarded" },
  cancelled:       { bg: "#ef444415", color: "#ef4444", label: "Cancelled" },
};

const fmtDate = (d) => d ? new Date(d).toLocaleDateString(undefined, { month:"short", day:"numeric", year:"numeric" }) : "—";

export default function PLMSourcingTab({ program }) {
  const { orgId } = useAuth();
  const [items, setItems] = useState([]);
  const [rfps, setRfps]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedRFP, setSelectedRFP] = useState(null);
  const [showNewRFP, setShowNewRFP]   = useState(false);
  const [aiOpen, setAiOpen]           = useState(true);
  const [aiBusy, setAiBusy]           = useState(false);
  const [aiResult, setAiResult]       = useState(null);
  const [aiChat, setAiChat]           = useState([]);
  const [aiInput, setAiInput]         = useState("");

  const load = useCallback(async () => {
    if (!orgId || !program?.id) return;
    setLoading(true);
    const [{ data: it }, { data: rf }] = await Promise.all([
      supabase.from("plm_sourcing").select("*").eq("program_id", program.id).order("created_at"),
      supabase.from("plm_rfps").select("*, plm_rfp_items(count), plm_rfp_providers(count)").eq("program_id", program.id).order("created_at", { ascending: false }),
    ]);
    setItems(it || []);
    setRfps(rf || []);
    setLoading(false);
  }, [orgId, program?.id]);

  useEffect(() => { load(); }, [load]);

  const addItem = async (sourcing_type) => {
    if (!orgId) return;
    const { data } = await supabase.from("plm_sourcing").insert({
      org_id: orgId, program_id: program.id, sourcing_type,
      name: `New ${sourcing_type.replace("_"," ")}`,
      status: "considering",
    }).select().single();
    if (data) setItems(prev => [...prev, data]);
  };

  const updateItem = async (id, patch) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
    await supabase.from("plm_sourcing").update(patch).eq("id", id);
  };

  const deleteItem = async (id) => {
    if (!confirm("Delete this sourcing item?")) return;
    await supabase.from("plm_sourcing").delete().eq("id", id);
    setItems(prev => prev.filter(i => i.id !== id));
  };

  // ── RFP detail navigation ─────────────────────────────────────────────────
  if (selectedRFP) {
    return (
      <Suspense fallback={<div style={{ padding: 30, color: T.text3 }}>Loading RFP…</div>}>
        <PLMRFPDetail
          rfp={selectedRFP}
          program={program}
          onBack={() => { setSelectedRFP(null); load(); }}
        />
      </Suspense>
    );
  }

  // ── SourcingItem editor card ──────────────────────────────────────────────
  const ItemCard = ({ item }) => {
    const meta = SOURCING_TYPES.find(t => t.key === item.sourcing_type) || SOURCING_TYPES[3];
    const [open, setOpen] = useState(false);
    return (
      <div style={{ background: T.surface2, border: "1px solid " + T.border, borderRadius: 8, marginBottom: 8 }}>
        <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }} onClick={() => setOpen(o => !o)}>
          <div style={{ fontSize: 16 }}>{meta.icon}</div>
          <div style={{ flex: 1 }}>
            <input
              value={item.name || ""}
              onClick={e => e.stopPropagation()}
              onChange={e => updateItem(item.id, { name: e.target.value })}
              placeholder="Name"
              style={{ background: "none", border: "none", color: T.text, fontSize: 13, fontWeight: 600, width: "100%", outline: "none" }} />
            <div style={{ fontSize: 10, color: meta.color, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>{meta.label}</div>
          </div>
          {item.supplier_name && <div style={{ fontSize: 11, color: T.text3 }}>{item.supplier_name}</div>}
          <button onClick={e => { e.stopPropagation(); deleteItem(item.id); }} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 14 }}>✕</button>
        </div>
        {open && (
          <div style={{ padding: "12px 14px 14px", borderTop: "1px solid " + T.border, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Supplier" value={item.supplier_name || ""} onChange={v => updateItem(item.id, { supplier_name: v })} />
            <Field label="Supplier contact" value={item.supplier_contact || ""} onChange={v => updateItem(item.id, { supplier_contact: v })} />
            <Field label="Lead time (days)" value={item.lead_time_days || ""} onChange={v => updateItem(item.id, { lead_time_days: v ? Number(v) : null })} type="number" />
            <Field label="MOQ" value={item.moq || ""} onChange={v => updateItem(item.id, { moq: v ? Number(v) : null })} type="number" suffix={
              <input value={item.moq_unit || ""} onChange={e => updateItem(item.id, { moq_unit: e.target.value })} placeholder="unit" style={{ background: T.surface, border: "1px solid "+T.border, color: T.text, fontSize: 11, padding: "4px 6px", borderRadius: 4, width: 50 }} />
            } />
            <Field label="URL" value={item.supplier_url || ""} onChange={v => updateItem(item.id, { supplier_url: v })} fullWidth />
            <Field label="Notes" value={item.notes || ""} onChange={v => updateItem(item.id, { notes: v })} fullWidth multiline />
          </div>
        )}
      </div>
    );
  };

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: T.text3 }}>Loading sourcing…</div>;

  const callAI = async (action, body) => {
    setAiBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("plm-rfp-assist", { body: { action, ...body } });
      if (error) throw error;
      return data;
    } catch (e) {
      setAiResult({ kind: "error", message: e.message || String(e) });
      return null;
    } finally {
      setAiBusy(false);
    }
  };
  const aiSuggestItems = async () => {
    const r = await callAI("chat", {
      rfp: { name: program.name + " (program-level sourcing)", rfp_type: "other" }, items: [], providers: [], responses: [], history: [],
      user_message: `I am working on the program "${program.name}". Description: ${program.description || "(no description)"}. Category: ${program.category || "n/a"}. Target markets: ${(program.target_markets_v2 || []).join(", ") || "n/a"}. Current sourcing items already added: ${items.length === 0 ? "none" : items.map(i => `${i.sourcing_type}: ${i.name}`).join("; ")}. \\n\\nWhat sourcing items (ingredients, packaging, contract manufacturers, services) should I be considering for this program? Give a short prioritized list with 1-line rationales.`,
    });
    if (r?.reply) setAiResult({ kind: "items_suggestion", text: r.reply });
  };
  const aiSuggestProviders = async () => {
    if (items.length === 0) { setAiResult({ kind: "error", message: "Add at least one sourcing item first so I know what to find providers for." }); return; }
    const r = await callAI("suggest_providers", {
      rfp: { name: program.name, rfp_type: items[0].sourcing_type, currency: "USD" },
      items: items.map(i => ({ item_name: i.name, specification: i.notes, quantity_unit: i.moq_unit })),
      known_providers: items.filter(i => i.supplier_name).map(i => ({ company_name: i.supplier_name })),
    });
    if (r?.providers) setAiResult({ kind: "providers", data: r });
  };
  const aiChatSend = async () => {
    if (!aiInput.trim()) return;
    const msg = aiInput.trim(); setAiInput("");
    const hist = [...aiChat, { role: "user", content: msg }];
    setAiChat(hist);
    const r = await callAI("chat", {
      rfp: { name: program.name, rfp_type: "other" }, items, providers: [], responses: [], history: aiChat,
      user_message: `Program context — name: "${program.name}", description: ${program.description || "n/a"}, current sourcing items: ${items.length} (${items.map(i => i.sourcing_type + ": " + i.name).join("; ")}).\\n\\nUser question: ${msg}`,
    });
    if (r?.reply) setAiChat([...hist, { role: "assistant", content: r.reply }]);
  };

  return (
    <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
      {/* ── Sourcing Items ── */}
      <div style={{ marginBottom: 32 }}>
        <SectionHeader title="Sourcing Items" subtitle="Ingredients, packaging, contract manufacturers, and other inputs you need for this program.">
          <div style={{ display: "flex", gap: 4 }}>
            {SOURCING_TYPES.map(t => (
              <button key={t.key} onClick={() => addItem(t.key)} style={pillBtn(t.color)}>
                + {t.icon} {t.label}
              </button>
            ))}
          </div>
        </SectionHeader>
        {items.length === 0 ? (
          <Empty title="No sourcing items yet" hint="Click a “+ Ingredient/Packaging/Contract Manufacturer” button above to add one." />
        ) : (
          <div>{items.map(it => <ItemCard key={it.id} item={it} />)}</div>
        )}
      </div>

      {/* ── RFPs ── */}
      <div>
        <SectionHeader title="Requests for Proposal" subtitle="Send sourcing items out to suppliers for competitive bids. AI can help draft briefs, suggest providers, and score responses.">
          <button onClick={() => setShowNewRFP(true)} style={primaryBtn}>＋ New RFP</button>
        </SectionHeader>
        {rfps.length === 0 ? (
          <Empty title="No RFPs yet" hint="Create your first RFP to put items out for bid." />
        ) : (
          <div style={{ overflow: "auto", border: "1px solid " + T.border, borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: T.surface }}>
                  {["Name","Type","Status","Items","Providers","Due","Created"].map(h => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rfps.map(r => {
                  const meta = SOURCING_TYPES.find(t => t.key === r.rfp_type) || SOURCING_TYPES[3];
                  const sc = STATUS_COLORS[r.status] || STATUS_COLORS.draft;
                  return (
                    <tr key={r.id} onClick={() => setSelectedRFP(r)} style={{ cursor: "pointer", borderTop: "1px solid " + T.border + "60" }}
                        onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <td style={td}><div style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>{r.name}</div>{r.description && <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>{truncate(r.description, 80)}</div>}</td>
                      <td style={td}><span style={{ fontSize: 11, fontWeight: 600, color: meta.color }}>{meta.icon} {meta.label}</span></td>
                      <td style={td}><span style={{ fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 4, background: sc.bg, color: sc.color }}>{sc.label}</span></td>
                      <td style={td}>{r.plm_rfp_items?.[0]?.count ?? 0}</td>
                      <td style={td}>{r.plm_rfp_providers?.[0]?.count ?? 0}</td>
                      <td style={td}>{fmtDate(r.due_date)}</td>
                      <td style={td}><span style={{ fontSize: 11, color: T.text3 }}>{fmtDate(r.created_at)}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showNewRFP && <NewRFPModal program={program} items={items} onClose={() => setShowNewRFP(false)} onCreated={(rfp) => { setShowNewRFP(false); setSelectedRFP(rfp); load(); }} />}
      </div>

      {/* ── AI Assistant side panel ── */}
      {aiOpen ? (
        <div style={{ width: 360, flexShrink: 0, position: "sticky", top: 0, background: T.surface2, border: "1px solid " + T.border, borderRadius: 10, padding: 14, maxHeight: "calc(100vh - 80px)", overflow: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#8b5cf6" }}>✨ AI Sourcing Assistant</div>
            <button onClick={() => setAiOpen(false)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 16 }}>✕</button>
          </div>
          <div style={{ fontSize: 11, color: T.text3, marginBottom: 12 }}>Get help deciding what to source and which suppliers to consider for <strong>{program.name}</strong>.</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 12 }}>
            <button onClick={aiSuggestItems} disabled={aiBusy} style={{ background: T.surface, border: "1px solid " + T.border, color: T.text2, borderRadius: 6, padding: "8px 10px", fontSize: 11, fontWeight: 600, cursor: aiBusy ? "default" : "pointer", textAlign: "left", opacity: aiBusy ? 0.5 : 1 }}>🧭 Suggest items to source</button>
            <button onClick={aiSuggestProviders} disabled={aiBusy} style={{ background: T.surface, border: "1px solid " + T.border, color: T.text2, borderRadius: 6, padding: "8px 10px", fontSize: 11, fontWeight: 600, cursor: aiBusy ? "default" : "pointer", textAlign: "left", opacity: aiBusy ? 0.5 : 1 }}>🔍 Suggest providers</button>
          </div>
          {aiBusy && <div style={{ padding: 12, textAlign: "center", color: T.text3, fontSize: 12 }}>AI is thinking…</div>}
          {aiResult?.kind === "error" && <div style={{ padding: 10, background: "#ef444415", color: "#ef4444", borderRadius: 6, fontSize: 11, marginBottom: 10 }}>{aiResult.message}</div>}
          {aiResult?.kind === "items_suggestion" && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.text, marginBottom: 6 }}>Suggested items</div>
              <div style={{ fontSize: 11, color: T.text2, lineHeight: 1.6, padding: 10, background: T.surface, borderRadius: 6, whiteSpace: "pre-wrap" }}>{aiResult.text}</div>
            </div>
          )}
          {aiResult?.kind === "providers" && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.text, marginBottom: 6 }}>Suggested providers</div>
              {aiResult.data.market_notes && <div style={{ fontSize: 11, color: T.text3, fontStyle: "italic", marginBottom: 8 }}>{aiResult.data.market_notes}</div>}
              {(aiResult.data.providers || []).map((p, i) => (
                <div key={i} style={{ padding: 10, background: T.surface, borderRadius: 6, marginBottom: 6 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{p.company_name}</div>
                  <div style={{ fontSize: 10, color: T.text3 }}>{p.country}{p.website && <> · <a href={p.website} target="_blank" rel="noreferrer" style={{ color: T.text3 }}>{p.website.replace("https://","").replace("http://","")}</a></>} · {p.confidence}% match</div>
                  <div style={{ fontSize: 11, color: T.text2, marginTop: 4 }}>{p.why_suggested}</div>
                </div>
              ))}
              <div style={{ fontSize: 10, color: T.text3, marginTop: 6, fontStyle: "italic" }}>Tip: Create an RFP below to invite these providers and collect bids.</div>
            </div>
          )}
          <div style={{ borderTop: "1px solid " + T.border, paddingTop: 10 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>Ask anything</div>
            <div style={{ maxHeight: 200, overflow: "auto", marginBottom: 6 }}>
              {aiChat.map((m, i) => (
                <div key={i} style={{ marginBottom: 6, padding: 8, background: m.role === "user" ? T.accent + "15" : T.surface, borderRadius: 6, fontSize: 11, color: T.text2, lineHeight: 1.4, whiteSpace: "pre-wrap" }}>{m.content}</div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <input value={aiInput} onChange={e => setAiInput(e.target.value)} onKeyDown={e => e.key === "Enter" && aiChatSend()} placeholder="e.g. Which suppliers do Method or Seventh Gen use?" style={{ flex: 1, background: T.surface, border: "1px solid " + T.border, color: T.text, fontSize: 12, padding: "7px 10px", borderRadius: 5, outline: "none" }} />
              <button onClick={aiChatSend} disabled={aiBusy || !aiInput.trim()} style={{ background: "#8b5cf6", color: "#fff", border: "none", borderRadius: 5, padding: "7px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: (aiBusy || !aiInput.trim()) ? 0.5 : 1 }}>→</button>
            </div>
          </div>
        </div>
      ) : (
        <button onClick={() => setAiOpen(true)} style={{ position: "fixed", bottom: 24, right: 24, background: "#8b5cf6", color: "#fff", border: "none", borderRadius: 999, padding: "12px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 12px rgba(139,92,246,0.4)", zIndex: 100 }}>✨ AI Assistant</button>
      )}
    </div>
  );
}

// ── New RFP Modal ──────────────────────────────────────────────────────────────
function NewRFPModal({ program, items, onClose, onCreated }) {
  const { orgId } = useAuth();
  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [rfpType, setRfpType] = useState("ingredient");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState(() => { const d = new Date(); d.setDate(d.getDate() + 21); return d.toISOString().slice(0, 10); });
  const [currency, setCurrency] = useState("USD");
  const [targetVolume, setTargetVolume] = useState("");
  const [targetUnit, setTargetUnit] = useState("");
  const [selectedItemIds, setSelectedItemIds] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const eligibleItems = useMemo(() => items.filter(i => i.sourcing_type === rfpType || rfpType === "other"), [items, rfpType]);

  const toggleItem = (id) => setSelectedItemIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const create = async () => {
    if (!name.trim()) { setErr("Name is required"); return; }
    setBusy(true); setErr(null);
    try {
      const { data: rfp, error } = await supabase.from("plm_rfps").insert({
        org_id: orgId, program_id: program.id, name: name.trim(), description: description.trim() || null,
        rfp_type: rfpType, status: "draft",
        due_date: dueDate || null, currency,
        target_volume: targetVolume ? Number(targetVolume) : null,
        target_volume_unit: targetUnit || null,
      }).select().single();
      if (error) throw error;
      // Add items
      if (selectedItemIds.size > 0) {
        const itemRows = items.filter(i => selectedItemIds.has(i.id)).map((i, idx) => ({
          org_id: orgId, rfp_id: rfp.id, sourcing_id: i.id, sort_order: idx,
          item_name: i.name, specification: i.notes || null,
          quantity: i.moq || null, quantity_unit: i.moq_unit || null,
        }));
        await supabase.from("plm_rfp_items").insert(itemRows);
      }
      onCreated(rfp);
    } catch (e) {
      setErr(e.message || String(e));
      setBusy(false);
    }
  };

  return (
    <Modal onClose={onClose} title={`New RFP — step ${step} of 2`}>
      {step === 1 ? (
        <>
          <Field label="RFP name" value={name} onChange={setName} placeholder="e.g. Citrus-derived surfactant for SS24 launch" fullWidth autoFocus />
          <div style={{ marginBottom: 12 }}>
            <Label>Type</Label>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
              {SOURCING_TYPES.map(t => (
                <button key={t.key} onClick={() => setRfpType(t.key)} style={{ ...selectorBtn, background: rfpType === t.key ? t.color : T.surface2, color: rfpType === t.key ? "#fff" : T.text2, borderColor: rfpType === t.key ? "transparent" : T.border }}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
          </div>
          <Field label="Description" value={description} onChange={setDescription} fullWidth multiline />
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <Field label="Due date" type="date" value={dueDate} onChange={setDueDate} />
            <Field label="Currency" value={currency} onChange={setCurrency} />
            <Field label="Target volume" type="number" value={targetVolume} onChange={setTargetVolume} />
            <Field label="Volume unit" value={targetUnit} onChange={setTargetUnit} placeholder="kg, units, /yr…" />
          </div>
          {err && <div style={{ color: "#ef4444", fontSize: 12, marginTop: 8 }}>{err}</div>}
          <ModalActions>
            <button onClick={onClose} style={ghostBtn}>Cancel</button>
            <button onClick={() => setStep(2)} disabled={!name.trim()} style={{ ...primaryBtn, opacity: !name.trim() ? 0.5 : 1 }}>Next →</button>
          </ModalActions>
        </>
      ) : (
        <>
          <Label>Pre-fill items from this program ({eligibleItems.length} eligible {rfpType === "other" ? "" : rfpType + "s"})</Label>
          {eligibleItems.length === 0 ? (
            <div style={{ padding: 16, fontSize: 12, color: T.text3, background: T.surface2, borderRadius: 6, textAlign: "center" }}>
              No matching sourcing items. You can still create the RFP and add items inside.
            </div>
          ) : (
            <div style={{ maxHeight: 280, overflow: "auto", border: "1px solid " + T.border, borderRadius: 6 }}>
              {eligibleItems.map(i => {
                const m = SOURCING_TYPES.find(t => t.key === i.sourcing_type) || SOURCING_TYPES[3];
                const sel = selectedItemIds.has(i.id);
                return (
                  <div key={i.id} onClick={() => toggleItem(i.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid " + T.border + "40", background: sel ? T.accent + "10" : "transparent" }}>
                    <div style={{ width: 16, height: 16, border: "2px solid " + (sel ? T.accent : T.border), borderRadius: 3, background: sel ? T.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 11 }}>{sel ? "✓" : ""}</div>
                    <div style={{ fontSize: 14 }}>{m.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>{i.name}</div>
                      {i.supplier_name && <div style={{ fontSize: 11, color: T.text3 }}>{i.supplier_name}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {err && <div style={{ color: "#ef4444", fontSize: 12, marginTop: 8 }}>{err}</div>}
          <ModalActions>
            <button onClick={() => setStep(1)} style={ghostBtn}>← Back</button>
            <button onClick={create} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.5 : 1 }}>{busy ? "Creating…" : "Create RFP"}</button>
          </ModalActions>
        </>
      )}
    </Modal>
  );
}

// ── Shared helpers ─────────────────────────────────────────────────────────────
const th = { padding: "10px 12px", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.4, textAlign: "left", whiteSpace: "nowrap" };
const td = { padding: "10px 12px", fontSize: 12, color: T.text2 };
const primaryBtn = { background: T.accent, color: "#fff", border: "none", borderRadius: 6, padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" };
const ghostBtn   = { background: "none", border: "1px solid " + T.border, color: T.text2, borderRadius: 6, padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" };
const selectorBtn = { padding: "10px 14px", borderRadius: 6, border: "1px solid", fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left" };
const pillBtn = (c) => ({ padding: "5px 10px", borderRadius: 14, border: "1px dashed " + c + "60", background: c + "10", color: c, fontSize: 11, fontWeight: 600, cursor: "pointer" });

function truncate(s, n) { return !s ? "" : (s.length > n ? s.slice(0, n - 1) + "…" : s); }

function Label({ children }) {
  return <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>{children}</div>;
}

function Field({ label, value, onChange, placeholder, type = "text", fullWidth, multiline, autoFocus, suffix }) {
  const inputStyle = { background: T.surface, border: "1px solid " + T.border, color: T.text, fontSize: 13, padding: "7px 10px", borderRadius: 5, width: "100%", outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
  return (
    <div style={{ marginBottom: 10, gridColumn: fullWidth ? "1/-1" : undefined }}>
      <Label>{label}</Label>
      <div style={{ display: "flex", gap: 6, alignItems: "stretch" }}>
        {multiline
          ? <textarea value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} autoFocus={autoFocus} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
          : <input  value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} type={type} autoFocus={autoFocus} style={inputStyle} />}
        {suffix}
      </div>
    </div>
  );
}

function SectionHeader({ title, subtitle, children }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14, flexWrap: "wrap", gap: 12 }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{title}</div>
        <div style={{ fontSize: 12, color: T.text3, marginTop: 2, maxWidth: 600 }}>{subtitle}</div>
      </div>
      {children}
    </div>
  );
}

function Empty({ title, hint }) {
  return (
    <div style={{ padding: 32, textAlign: "center", background: T.surface2, borderRadius: 8, border: "1px dashed " + T.border }}>
      <div style={{ fontSize: 13, color: T.text2, fontWeight: 600 }}>{title}</div>
      <div style={{ fontSize: 11, color: T.text3, marginTop: 4 }}>{hint}</div>
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: 10, padding: 24, maxWidth: 560, width: "100%", maxHeight: "90vh", overflow: "auto", border: "1px solid " + T.border }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 16 }}>{title}</div>
        {children}
      </div>
    </div>
  );
}

function ModalActions({ children }) {
  return <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16 }}>{children}</div>;
}
