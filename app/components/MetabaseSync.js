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
  { card_id: 526, table: "dp_daily_sales", label: "Daily Unit Sales", icon: "📈" },
  { card_id: 527, table: "dp_sku_master", label: "SKU Master", icon: "📦" },
  { card_id: 528, table: "dp_inventory", label: "Inventory", icon: "🏭" },
  { card_id: 529, table: "dp_offer_performance", label: "Offer Performance", icon: "🎯" },
  { card_id: 530, table: "dp_subscription_cohorts", label: "Subscription Cohorts", icon: "🔄" },
];

const TARGET_TABLES = [
  { key: "dp_daily_sales", label: "Daily Sales", icon: "📈", desc: "Daily sales by SKU, channel, country", fields: "sale_date, sku, product_title, variant_title, base_product, units_sold, gross_revenue, net_revenue, orders_count, channel, country, is_subscription" },
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
  const [weeksToSync, setWeeksToSync] = useState(12); // default 12 weeks
  const [lastSync, setLastSync] = useState(null); // most recent metabase_sync_log row for this org

  useEffect(() => {
    // Load existing row counts
    (async () => {
      const counts = {};
      for (const t of TARGET_TABLES) {
        const { count } = await supabase.from(t.key).select("id", { count: "exact", head: true }).eq("org_id", orgId);
        counts[t.key] = count || 0;
      }
      setExistingCounts(counts);
      // Pull most recent sync log entry (cron + manual both write here)
      const { data: ls } = await supabase.from("metabase_sync_log")
        .select("started_at, finished_at, ok, source, summary")
        .eq("org_id", orgId).order("started_at", { ascending: false }).limit(1).maybeSingle();
      setLastSync(ls);
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
        const batch = rows.slice(i, i + 100);
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
              {/* Last sync — populated from metabase_sync_log (cron + manual) */}
              {lastSync && (() => {
                const ts = new Date(lastSync.started_at);
                const ageMs = Date.now() - ts.getTime();
                const hours = Math.round(ageMs / 3600000);
                const ago = hours < 1 ? "just now" : hours < 24 ? `${hours}h ago` : `${Math.round(hours / 24)}d ago`;
                const totalSynced = (lastSync.summary || []).reduce((s, x) => s + (x.synced || 0), 0);
                const failed = (lastSync.summary || []).filter(x => !x.ok).length;
                const okColor = lastSync.ok && failed === 0 ? "#22c55e" : "#f59e0b";
                return (
                  <div style={{ padding: "10px 14px", borderRadius: 8, background: T.surface2, border: `1px solid ${T.border}`, marginBottom: 12, display: "flex", alignItems: "center", gap: 10, fontSize: 11, color: T.text3 }}>
                    <span style={{ width: 8, height: 8, borderRadius: 4, background: okColor, flexShrink: 0 }} />
                    <span>
                      Last sync: <span style={{ color: T.text, fontWeight: 600 }}>{ago}</span> · {totalSynced.toLocaleString()} rows refreshed
                      {failed > 0 && <span style={{ color: "#f59e0b" }}> · {failed} table{failed === 1 ? "" : "s"} failed</span>}
                      {lastSync.source && <span style={{ marginLeft: 8, fontSize: 9, padding: "1px 5px", borderRadius: 3, background: T.surface, color: T.text3, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>{lastSync.source}</span>}
                    </span>
                    <span style={{ marginLeft: "auto", fontSize: 10 }}>Auto-syncs daily at 1 AM ET</span>
                  </div>
                );
              })()}
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
                        // For daily sales: chunk client-side so each edge function response stays small.
                        // 12 weeks of daily data = ~150K rows = too big to return in one edge function response.
                        let r;
                        if (mapping.table === "dp_daily_sales") {
                          const end = new Date();
                          const start = new Date();
                          start.setDate(start.getDate() - (weeksToSync * 7));
                          // Build 7-day windows
                          const windows = [];
                          let cursor = new Date(start);
                          while (cursor <= end) {
                            const ws = new Date(cursor);
                            const we = new Date(cursor);
                            we.setDate(we.getDate() + 6);
                            if (we > end) we.setTime(end.getTime());
                            windows.push({
                              start: ws.toISOString().split("T")[0],
                              end: we.toISOString().split("T")[0],
                            });
                            cursor.setDate(cursor.getDate() + 7);
                          }
                          // Fetch each chunk separately, accumulate
                          const allData = [];
                          let columns = [];
                          const chunkLog = [];
                          for (let ci = 0; ci < windows.length; ci++) {
                            const w = windows[ci];
                            setError(`${mapping.icon} ${mapping.label}: fetching ${w.start} → ${w.end} (${ci + 1}/${windows.length})...`);
                            const cr = await mb("run_question", {
                              question_id: mapping.card_id,
                              start_date: w.start,
                              end_date: w.end,
                            });
                            if (cr.error) {
                              console.error(`[Sync] Chunk ${w.start}-${w.end} error:`, cr.error);
                              chunkLog.push({ ...w, rows: 0, error: cr.error });
                              continue;
                            }
                            if (cr.columns && columns.length === 0) columns = cr.columns;
                            const chunkRows = cr.data || [];
                            allData.push(...chunkRows);
                            chunkLog.push({ ...w, rows: chunkRows.length });
                          }
                          r = { data: allData, columns, row_count: allData.length, chunks: chunkLog };
                          console.log(`[Sync] ${mapping.label}: chunked fetch — ${chunkLog.length} chunks, ${allData.length} total rows`);
                          console.log(`[Sync] Chunk breakdown:`, chunkLog);
                        } else {
                          r = await mb("run_question", { question_id: mapping.card_id });
                        }
                        if (!r.data || r.data.length === 0) {
                          results.push({ ...mapping, rows: 0, status: "empty" });
                          continue;
                        }

                        // Column rename map
                        const COL_RENAMES = { churn: "churned" };
                        const cleanCol = (c) => { const l = c.toLowerCase().replace(/[^a-z0-9_]/g, "_"); return COL_RENAMES[l] || l; };

                        // Known columns per table — strip anything not in this list
                        const TABLE_COLUMNS = {
                          dp_daily_sales: ["org_id","sale_date","sku","product_title","variant_title","base_product","units_sold","gross_revenue","net_revenue","orders_count","channel","country","is_subscription","units_per_sku","imported_at"],
                          dp_weekly_sales: ["org_id","week_start","sku","product_title","variant_title","units_sold","gross_revenue","net_revenue","orders_count","channel","country","is_subscription","base_product","units_per_sku","imported_at"],
                          dp_sku_master: ["org_id","sku","product_title","variant_title","base_product","product_category","units_per_sku","is_gwp","is_subscription","is_one_time","current_price","cogs_per_unit","status","imported_at"],
                          dp_inventory: ["org_id","sku","warehouse_location","quantity_on_hand","quantity_reserved","quantity_incoming","expected_arrival_date","reorder_point","lead_time_days","snapshot_date","imported_at"],
                          dp_offer_performance: ["org_id","month","offer_name","times_shown","times_accepted","take_rate","revenue_impact","imported_at"],
                          dp_subscription_cohorts: ["org_id","cohort_month","months_since_signup","active_subscribers","churned","paused","revenue","pack_size_1","pack_size_2","pack_size_3","pack_size_4","frequency_monthly","frequency_bimonthly","frequency_quarterly","imported_at"],
                        };
                        const allowedCols = TABLE_COLUMNS[mapping.table] ? new Set(TABLE_COLUMNS[mapping.table]) : null;

                        // Transform rows with null coercion for NOT NULL fields
                        let data = r.data.map(row => {
                          const obj = { org_id: orgId };
                          for (const [key, val] of Object.entries(row)) {
                            const col = cleanCol(key);
                            // Only include columns that exist on the target table
                            if (!allowedCols || allowedCols.has(col)) {
                              obj[col] = val;
                            }
                          }
                          // Coerce NOT NULL fields (only if column exists on target table)
                          const setIfAllowed = (k, v) => { if (!allowedCols || allowedCols.has(k)) obj[k] = v; };
                          if (obj.sku === null || obj.sku === undefined) setIfAllowed("sku", "UNKNOWN");
                          if (obj.units_sold === null || obj.units_sold === undefined) setIfAllowed("units_sold", 0);
                          if (obj.base_product === null || obj.base_product === undefined) setIfAllowed("base_product", obj.product_title || obj.sku || "");
                          if (obj.product_title === null || obj.product_title === undefined) setIfAllowed("product_title", obj.sku || "");
                          if (obj.units_per_sku === null || obj.units_per_sku === undefined) setIfAllowed("units_per_sku", 1);
                          return obj;
                        });

                        // Date filter for sales tables (daily or weekly)
                        const isDailySales = mapping.table === "dp_daily_sales";
                        const isWeeklySales = mapping.table === "dp_weekly_sales";
                        if ((isDailySales || isWeeklySales) && data.length > 0) {
                          const dateField = isDailySales ? "sale_date" : "week_start";
                          if (data[0][dateField]) {
                            const cutoff = new Date();
                            cutoff.setDate(cutoff.getDate() - (weeksToSync * 7));
                            const cutoffStr = cutoff.toISOString().split("T")[0];
                            const before = data.length;
                            data = data.filter(row => row[dateField] >= cutoffStr);
                            const labelName = isDailySales ? "Daily sales" : "Weekly sales";
                            console.log(`[Sync] ${labelName}: ${before} → ${data.length} rows (last ${weeksToSync} weeks, cutoff ${cutoffStr})`);
                          }
                        }

                        // Drop rows where the unique-key dimension that would matter is missing.
                        // SKU master with no SKU is useless data — keeping them would all collapse to "UNKNOWN"
                        // and cause unique constraint conflicts.
                        if (mapping.table === "dp_sku_master") {
                          const before = data.length;
                          data = data.filter(row => row.sku && row.sku !== "UNKNOWN" && String(row.sku).trim() !== "");
                          if (before !== data.length) {
                            console.log(`[Sync] dp_sku_master: dropped ${before - data.length} rows with missing SKU`);
                          }
                        }

                        // Natural-key dedupe (matches DB unique constraints) — last write wins,
                        // but prefer the row with the most informative product_title (longest non-empty)
                        const NATURAL_KEYS = {
                          dp_daily_sales: ["org_id","sale_date","sku","channel","country","is_subscription"],
                          dp_weekly_sales: ["org_id","week_start","sku","channel","country","is_subscription"],
                          dp_sku_master: ["org_id","sku"],
                          dp_inventory: ["org_id","sku","warehouse_location","snapshot_date"],
                          dp_offer_performance: ["org_id","month","offer_name"],
                          dp_subscription_cohorts: ["org_id","cohort_month","months_since_signup"],
                        };
                        const natKey = NATURAL_KEYS[mapping.table];
                        if (natKey) {
                          const dedupeMap = new Map();
                          for (const row of data) {
                            const k = natKey.map(c => String(row[c] ?? "")).join("|");
                            const existing = dedupeMap.get(k);
                            if (!existing) {
                              dedupeMap.set(k, row);
                            } else {
                              // Prefer row with longer product_title (more informative)
                              const newTitle = (row.product_title || "").length;
                              const oldTitle = (existing.product_title || "").length;
                              if (newTitle > oldTitle) dedupeMap.set(k, row);
                            }
                          }
                          const before = data.length;
                          data = Array.from(dedupeMap.values());
                          if (before !== data.length) {
                            console.log(`[Sync] ${mapping.table}: deduped ${before} → ${data.length} rows on (${natKey.join(",")})`);
                          }
                        }

                        // Upsert (no need to delete first — onConflict handles it)
                        const onConflict = natKey ? natKey.join(",") : undefined;

                        // Batch upsert from client (no edge function timeout)
                        let synced = 0;
                        let syncErrors = [];
                        let aborted = false;
                        for (let i = 0; i < data.length; i += 200) {
                          if (aborted) break;
                          setError(`${mapping.icon} ${mapping.label}: upserting ${i}/${data.length}...`);
                          const batch = data.slice(i, i + 200);
                          const { error: insErr } = onConflict
                            ? await supabase.from(mapping.table).upsert(batch, { onConflict, ignoreDuplicates: false })
                            : await supabase.from(mapping.table).insert(batch);
                          if (insErr) {
                            console.error(`[Sync] Batch error for ${mapping.table}:`, insErr.message);
                            syncErrors.push(insErr.message);
                            // Structural errors won't resolve row-by-row — abort this table
                            const isFatalErr = /schema cache|column .* does not exist|violates not-null|invalid input syntax|duplicate key value|violates unique constraint|violates check constraint/i.test(insErr.message || "");
                            if (isFatalErr) {
                              console.error(`[Sync] Aborting ${mapping.table} — fatal error, will not retry rows`);
                              aborted = true;
                              break;
                            }
                            // Fallback: row by row (only for transient/data errors)
                            let rowErrCount = 0;
                            for (const row of batch) {
                              const { error: rErr } = onConflict
                                ? await supabase.from(mapping.table).upsert(row, { onConflict, ignoreDuplicates: false })
                                : await supabase.from(mapping.table).insert(row);
                              if (!rErr) synced++;
                              else {
                                rowErrCount++;
                                if (rowErrCount <= 3) console.error(`[Sync] Row error:`, rErr.message, JSON.stringify(row).substring(0, 200));
                              }
                            }
                            if (rowErrCount > 3) console.error(`[Sync] ...and ${rowErrCount - 3} more row errors suppressed`);
                          } else {
                            synced += batch.length;
                          }
                        }
                        results.push({ ...mapping, rows: synced, total: data.length, status: aborted ? "error" : (synced > 0 ? "ok" : "error"), errors: syncErrors.length > 0 ? syncErrors.slice(0, 3) : undefined });
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
                <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap", alignItems: "center" }}>
                  {DASHBOARD_SYNC_MAP.map(m => (
                    <span key={m.card_id} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, background: T.surface, border: `1px solid ${T.border}`, color: T.text2 }}>{m.icon} {m.label}</span>
                  ))}
                  <div style={{ flex: 1 }} />
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 10, color: T.text3 }}>Weekly Sales:</span>
                    <select value={weeksToSync} onChange={e => setWeeksToSync(Number(e.target.value))}
                      style={{ padding: "3px 8px", fontSize: 11, border: `1px solid ${T.border}`, borderRadius: 4, background: T.surface2, color: T.text, cursor: "pointer" }}>
                      <option value={4}>Last 4 weeks</option>
                      <option value={8}>Last 8 weeks</option>
                      <option value={12}>Last 12 weeks</option>
                      <option value={26}>Last 26 weeks</option>
                      <option value={52}>Last 52 weeks</option>
                      <option value={999}>All time</option>
                    </select>
                  </div>
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
                        {r.status === "ok" ? `✅ ${r.rows}${r.total && r.total !== r.rows ? `/${r.total}` : ""} rows` : r.status === "empty" ? "— empty" : `❌ ${r.error?.substring(0, 60)}`}
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
