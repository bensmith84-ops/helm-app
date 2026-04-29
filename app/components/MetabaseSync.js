"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/theme";

const MB_URL = "https://upbjdmnykheubxkuknuj.supabase.co/functions/v1/metabase-sync";

async function mb(action, extra = {}) {
  const res = await fetch(MB_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, ...extra }) });
  return await res.json();
}

// Dashboard 56 — Demand Planning — card-to-table mapping
const DASHBOARD_SYNC_MAP = [
  { card_id: 526, table: "dp_weekly_sales", label: "Weekly Unit Sales", icon: "📈" },
  { card_id: 527, table: "dp_sku_master", label: "SKU Master", icon: "📦" },
  { card_id: 528, table: "dp_inventory", label: "Inventory", icon: "🏭" },
  { card_id: 529, table: "dp_offer_performance", label: "Offer Performance", icon: "🎯" },
  { card_id: 530, table: "dp_subscription_cohorts", label: "Subscription Cohorts", icon: "🔄" },
];

const TARGET_TABLES = [
  { key: "dp_weekly_sales", label: "Weekly Sales", icon: "📈", desc: "Weekly sales by SKU, channel, country", fields: "week_start, sku, product_title, variant_title, units_sold, gross_revenue, net_revenue, orders_count, channel, country, is_subscription" },
  { key: "dp_subscription_cohorts", label: "Subscription Cohorts", icon: "🔄", desc: "Monthly cohort retention + churn", fields: "cohort_month, months_since_signup, active_subscribers, churned, paused, revenue, pack_size_1-4, frequency_monthly/bimonthly/quarterly" },
  { key: "dp_sku_master", label: "SKU Master", icon: "📦", desc: "Product catalog with pricing + COGS", fields: "sku, product_title, variant_title, base_product, product_category, units_per_sku, is_gwp/sub/otp, current_price, cogs_per_unit, status" },
  { key: "dp_inventory", label: "Inventory", icon: "🏭", desc: "Current stock levels + incoming", fields: "sku, warehouse_location, qty_on_hand/reserved/incoming, expected_arrival_date, reorder_point, lead_time_days, snapshot_date" },
  { key: "dp_offer_performance", label: "Offer Performance", icon: "🎯", desc: "Offer/promotion take rates", fields: "month, offer_name, times_shown, times_accepted, take_rate, revenue_impact" },
];

export default function MetabaseSync({ onClose }) {
  const { orgId } = useAuth();
  const { tokens: T } = useTheme();
  const [step, setStep] = useState("select_target"); // select_target, browse_questions, preview, syncing, done
  const [target, setTarget] = useState(null);
  const [questions, setQuestions] = useState(null);
  const [collections, setCollections] = useState(null);
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [selectedQuestion, setSelectedQuestion] = useState(null);
  const [preview, setPreview] = useState(null);
  const [columnMapping, setColumnMapping] = useState({});
  const [syncResult, setSyncResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [existingCounts, setExistingCounts] = useState({});

  useEffect(() => {
    // Load existing row counts
    (async () => {
      const counts = {};
      for (const t of TARGET_TABLES) {
        const { count } = await supabase.from(t.key).select("id", { count: "exact", head: true }).eq("org_id", orgId);
        counts[t.key] = count || 0;
      }
      setExistingCounts(counts);
    })();
  }, []);

  const loadQuestions = async (collectionId) => {
    setLoading(true); setError(null);
    try {
      const r = await mb("list_questions", collectionId ? { collection_id: collectionId } : {});
      setQuestions(r.questions || []);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const loadCollections = async () => {
    setLoading(true);
    try {
      const r = await mb("list_collections");
      setCollections(r.collections || []);
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const previewQuestion = async (q) => {
    setLoading(true); setError(null); setSelectedQuestion(q);
    try {
      const r = await mb("run_question", { question_id: q.id });
      setPreview(r);
      // Auto-map columns by name similarity
      const targetFields = target.fields.split(", ").map(f => f.split("/")[0].trim());
      const mapping = {};
      for (const col of (r.columns || [])) {
        const lc = col.toLowerCase().replace(/[^a-z0-9]/g, "_");
        const match = targetFields.find(f => f === lc || lc.includes(f) || f.includes(lc));
        if (match) mapping[col] = match;
      }
      setColumnMapping(mapping);
      setStep("preview");
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const runSync = async () => {
    if (!preview || !target) return;
    setStep("syncing"); setLoading(true); setError(null);
    try {
      // Transform data using column mapping
      const rows = (preview.data || []).map(row => {
        const mapped = { org_id: orgId };
        for (const [srcCol, destCol] of Object.entries(columnMapping)) {
          if (destCol && row[srcCol] !== undefined) {
            mapped[destCol] = row[srcCol];
          }
        }
        return mapped;
      });

      if (rows.length === 0) { setError("No rows to sync"); setLoading(false); return; }

      // Clear existing data and insert new
      await supabase.from(target.key).delete().eq("org_id", orgId);
      
      // Insert in batches of 100
      let synced = 0;
      for (let i = 0; i < rows.length; i += 100) {
        const batch = rows.slice(i, i + 100).map(r => ({ ...r, imported_at: new Date().toISOString() }));
        const { error: insErr } = await supabase.from(target.key).insert(batch);
        if (insErr) { setError(`Batch ${i}: ${insErr.message}`); break; }
        synced += batch.length;
      }

      setSyncResult({ rows: synced, table: target.key, question: selectedQuestion.name });
      setStep("done");
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ width: "90vw", maxWidth: 900, maxHeight: "85vh", borderRadius: 16, background: T.bg, border: `1px solid ${T.border}`, display: "flex", flexDirection: "column", overflow: "hidden" }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: `1px solid ${T.border}` }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>📊 Metabase → Demand Planning Sync</div>
            <div style={{ fontSize: 11, color: T.text3 }}>
              {step === "select_target" ? "Choose which table to populate" : step === "browse_questions" ? "Select a Metabase question to pull data from" : step === "preview" ? "Map columns and preview data" : step === "syncing" ? "Syncing..." : "Done!"}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, color: T.text3, cursor: "pointer" }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
          {error && <div style={{ padding: 12, background: "#ef444410", borderRadius: 8, color: "#ef4444", fontSize: 12, marginBottom: 12 }}>❌ {error}</div>}
          {loading && <div style={{ padding: 30, textAlign: "center", color: T.text3 }}>⏳ Loading...</div>}

          {/* Step 1: Select target table */}
          {step === "select_target" && !loading && (
            <div>
              {/* Quick sync all from Dashboard 56 */}
              <div style={{ padding: 16, borderRadius: 10, border: `1px solid ${T.accent}30`, background: T.accent + "05", marginBottom: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>🚀 Sync All from Metabase Dashboard</div>
                    <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>Pull all 5 datasets from the Demand Planning dashboard in one click.</div>
                  </div>
                  <button onClick={async () => {
                    setStep("syncing"); setLoading(true); setError(null);
                    const results = [];
                    for (const mapping of DASHBOARD_SYNC_MAP) {
                      setError(`Syncing ${mapping.icon} ${mapping.label}...`);
                      try {
                        const r = await mb("run_question", { question_id: mapping.card_id });
                        if (r.data && r.data.length > 0) {
                          // Clean column names to match DB
                          const cleanData = r.data.map(row => {
                            const clean = { org_id: orgId, imported_at: new Date().toISOString() };
                            for (const [key, val] of Object.entries(row)) {
                              clean[key.toLowerCase().replace(/[^a-z0-9_]/g, "_")] = val;
                            }
                            return clean;
                          });
                          await supabase.from(mapping.table).delete().eq("org_id", orgId);
                          // Batch insert
                          for (let i = 0; i < cleanData.length; i += 100) {
                            await supabase.from(mapping.table).insert(cleanData.slice(i, i + 100));
                          }
                          results.push({ ...mapping, rows: cleanData.length, status: "ok" });
                        } else {
                          results.push({ ...mapping, rows: 0, status: "empty" });
                        }
                      } catch (e) {
                        results.push({ ...mapping, rows: 0, status: "error", error: e.message });
                      }
                    }
                    setError(null);
                    setSyncResult({ bulk: true, results });
                    setStep("done");
                    setLoading(false);
                  }} style={{ padding: "10px 20px", borderRadius: 8, background: T.accent, color: "#fff", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                    🔄 Sync All (5 tables)
                  </button>
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                  {DASHBOARD_SYNC_MAP.map(m => (
                    <span key={m.card_id} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, background: T.surface, border: `1px solid ${T.border}`, color: T.text2 }}>{m.icon} {m.label}</span>
                  ))}
                </div>
              </div>

              <div style={{ fontSize: 12, fontWeight: 600, color: T.text3, marginBottom: 8 }}>Or sync individual tables:</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {TARGET_TABLES.map(t => (
                <div key={t.key} onClick={() => { setTarget(t); setStep("browse_questions"); loadQuestions(); loadCollections(); }}
                  style={{ display: "flex", alignItems: "center", gap: 14, padding: 16, borderRadius: 10, border: `1px solid ${T.border}`, background: T.surface, cursor: "pointer" }}
                  onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                  onMouseLeave={e => e.currentTarget.style.background = T.surface}>
                  <span style={{ fontSize: 28 }}>{t.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{t.label}</div>
                    <div style={{ fontSize: 12, color: T.text3 }}>{t.desc}</div>
                    <div style={{ fontSize: 10, color: T.text3, marginTop: 2, fontFamily: "monospace" }}>{t.fields}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: existingCounts[t.key] > 0 ? "#22c55e" : T.text3 }}>{existingCounts[t.key] || 0}</div>
                    <div style={{ fontSize: 9, color: T.text3 }}>rows</div>
                  </div>
                </div>
              ))}
              </div>
            </div>
          )}

          {/* Step 2: Browse and select a question */}
          {step === "browse_questions" && !loading && (
            <div>
              <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
                <button onClick={() => { setStep("select_target"); setTarget(null); setQuestions(null); }}
                  style={{ padding: "6px 12px", borderRadius: 6, background: T.surface2, border: `1px solid ${T.border}`, color: T.text3, fontSize: 12, cursor: "pointer" }}>← Back</button>
                <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Syncing to: {target?.icon} {target?.label}</span>
                <div style={{ flex: 1 }} />
                {selectedCollection && <button onClick={() => { setSelectedCollection(null); loadQuestions(); }} style={{ padding: "4px 8px", fontSize: 10, borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface2, color: T.text3, cursor: "pointer" }}>Show all</button>}
              </div>

              {/* Collections sidebar + questions */}
              <div style={{ display: "flex", gap: 12 }}>
                {collections && collections.length > 0 && (
                  <div style={{ width: 200, flexShrink: 0, borderRadius: 8, border: `1px solid ${T.border}`, padding: 8, maxHeight: 400, overflow: "auto" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, marginBottom: 6, textTransform: "uppercase" }}>Collections</div>
                    {collections.map(c => (
                      <div key={c.id} onClick={() => { setSelectedCollection(c.id); loadQuestions(c.id); }}
                        style={{ fontSize: 11, padding: "4px 8px", borderRadius: 4, cursor: "pointer", color: selectedCollection === c.id ? T.accent : T.text2, fontWeight: selectedCollection === c.id ? 700 : 400 }}
                        onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        📁 {c.name}
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ flex: 1 }}>
                  {(questions || []).length === 0 && <div style={{ color: T.text3, fontSize: 13, padding: 20, textAlign: "center" }}>No questions found. Try selecting a collection.</div>}
                  {(questions || []).map(q => (
                    <div key={q.id} onClick={() => previewQuestion(q)}
                      style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, border: `1px solid ${T.border}`, marginBottom: 6, cursor: "pointer", background: T.surface }}
                      onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                      onMouseLeave={e => e.currentTarget.style.background = T.surface}>
                      <span style={{ fontSize: 14 }}>{q.display === "table" ? "📋" : q.display === "bar" ? "📊" : q.display === "line" ? "📈" : "❓"}</span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{q.name}</div>
                        {q.description && <div style={{ fontSize: 11, color: T.text3 }}>{q.description}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Preview and map columns */}
          {step === "preview" && !loading && preview && (
            <div>
              <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
                <button onClick={() => { setStep("browse_questions"); setPreview(null); }}
                  style={{ padding: "6px 12px", borderRadius: 6, background: T.surface2, border: `1px solid ${T.border}`, color: T.text3, fontSize: 12, cursor: "pointer" }}>← Back</button>
                <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{selectedQuestion?.name} → {target?.icon} {target?.label}</span>
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 11, color: T.text3 }}>{preview.row_count} rows</span>
              </div>

              {/* Column mapping */}
              <div style={{ padding: 14, borderRadius: 10, border: `1px solid ${T.accent}30`, background: T.accent + "05", marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 8 }}>Column Mapping</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: "6px 12px", alignItems: "center" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.text3 }}>METABASE COLUMN</div>
                  <div />
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.text3 }}>HELM FIELD</div>
                  {(preview.columns || []).map(col => (
                    <>
                      <div key={col + "_src"} style={{ fontSize: 12, color: T.text, fontFamily: "monospace" }}>{col}</div>
                      <span key={col + "_arr"} style={{ color: T.text3 }}>→</span>
                      <select key={col + "_dest"} value={columnMapping[col] || ""} onChange={e => setColumnMapping(m => ({ ...m, [col]: e.target.value }))}
                        style={{ padding: "4px 8px", fontSize: 11, border: `1px solid ${T.border}`, borderRadius: 4, background: T.surface2, color: columnMapping[col] ? T.text : T.text3, cursor: "pointer" }}>
                        <option value="">— skip —</option>
                        {target.fields.split(", ").map(f => f.split("/")[0].trim()).map(f => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                      </select>
                    </>
                  ))}
                </div>
                <div style={{ fontSize: 10, color: T.text3, marginTop: 8 }}>Mapped: {Object.values(columnMapping).filter(v => v).length}/{(preview.columns || []).length} columns. Unmapped columns will be skipped.</div>
              </div>

              {/* Data preview */}
              <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 6 }}>Data Preview (first 10 rows)</div>
              <div style={{ overflow: "auto", maxHeight: 250, borderRadius: 8, border: `1px solid ${T.border}` }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead><tr>{(preview.columns || []).map(c => <th key={c} style={{ textAlign: "left", padding: "5px 8px", borderBottom: `2px solid ${T.border}`, color: columnMapping[c] ? T.accent : T.text3, fontWeight: 700, whiteSpace: "nowrap", position: "sticky", top: 0, background: T.surface }}>{columnMapping[c] || c}</th>)}</tr></thead>
                  <tbody>{(preview.data || []).slice(0, 10).map((row, ri) => <tr key={ri}>{(preview.columns || []).map(c => <td key={c} style={{ padding: "4px 8px", borderBottom: `1px solid ${T.border}08`, color: T.text, whiteSpace: "nowrap" }}>{String(row[c] ?? "")}</td>)}</tr>)}</tbody>
                </table>
              </div>

              {/* Sync button */}
              <div style={{ marginTop: 16, display: "flex", justifyContent: "flex-end", gap: 8 }}>
                <button onClick={runSync}
                  style={{ padding: "10px 24px", borderRadius: 8, background: T.accent, color: "#fff", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  🔄 Sync {preview.row_count} Rows → {target?.label}
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Done */}
          {step === "done" && syncResult && (
            <div style={{ textAlign: "center", padding: 30 }}>
              <div style={{ fontSize: 48 }}>✅</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: T.text, marginTop: 8 }}>Sync Complete</div>
              {syncResult.bulk ? (
                <div style={{ marginTop: 12, textAlign: "left", maxWidth: 400, margin: "12px auto" }}>
                  {syncResult.results.map((r, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 6, border: `1px solid ${T.border}`, marginBottom: 4, background: T.surface }}>
                      <span style={{ fontSize: 12, color: T.text }}>{r.icon} {r.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: r.status === "ok" ? "#22c55e" : r.status === "empty" ? T.text3 : "#ef4444" }}>
                        {r.status === "ok" ? `✅ ${r.rows} rows` : r.status === "empty" ? "— empty" : `❌ ${r.error}`}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: 13, color: T.text2, marginTop: 4 }}>
                  <strong>{syncResult.rows}</strong> rows from <strong>{syncResult.question}</strong> → <strong>{syncResult.table}</strong>
                </div>
              )}
              <button onClick={onClose} style={{ marginTop: 20, padding: "10px 24px", borderRadius: 8, background: T.accent, color: "#fff", border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Done</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
