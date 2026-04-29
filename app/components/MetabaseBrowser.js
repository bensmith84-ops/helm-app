"use client";
import { useState } from "react";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/theme";

const MB_URL = "https://upbjdmnykheubxkuknuj.supabase.co/functions/v1/metabase-sync";

async function mb(action, extra = {}) {
  const res = await fetch(MB_URL, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...extra }),
  });
  return await res.json();
}

export default function MetabaseBrowser({ onClose }) {
  const { orgId } = useAuth();
  const { tokens: T } = useTheme();
  const [tab, setTab] = useState("collections");
  const [collections, setCollections] = useState(null);
  const [questions, setQuestions] = useState(null);
  const [dashboards, setDashboards] = useState(null);
  const [selectedCollection, setSelectedCollection] = useState(null);
  const [queryResult, setQueryResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = async (what) => {
    setLoading(true); setError(null);
    try {
      if (what === "collections") {
        const r = await mb("list_collections");
        setCollections(r.collections || []);
      } else if (what === "questions") {
        const r = await mb("list_questions", selectedCollection ? { collection_id: selectedCollection } : {});
        setQuestions(r.questions || []);
      } else if (what === "dashboards") {
        const r = await mb("list_dashboards");
        setDashboards(r.dashboards || []);
      }
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const runQuestion = async (id, name) => {
    setLoading(true); setError(null);
    try {
      const r = await mb("run_question", { question_id: id });
      setQueryResult({ name, ...r });
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const loadDashboard = async (id, name) => {
    setLoading(true); setError(null);
    try {
      const r = await mb("get_dashboard", { dashboard_id: id });
      setQueryResult({ name: r.name, dashboard: true, cards: r.cards || [] });
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  const S = { overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }, modal: { width: "90vw", maxWidth: 1100, maxHeight: "85vh", borderRadius: 16, background: T.bg, border: `1px solid ${T.border}`, display: "flex", flexDirection: "column", overflow: "hidden" }, header: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: `1px solid ${T.border}` }, tabBar: { display: "flex", gap: 1, borderBottom: `1px solid ${T.border}`, padding: "0 16px" }, tab: (active) => ({ padding: "8px 16px", fontSize: 12, fontWeight: active ? 700 : 500, color: active ? T.accent : T.text3, border: "none", borderBottom: active ? `2px solid ${T.accent}` : "2px solid transparent", background: "transparent", cursor: "pointer" }), body: { flex: 1, overflow: "auto", padding: 16 } };

  const renderCollections = (items, depth = 0) => (items || []).map(c => (
    <div key={c.id}>
      <div onClick={() => { setSelectedCollection(c.id); setTab("questions"); load("questions"); }}
        style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", paddingLeft: 12 + depth * 20, cursor: "pointer", borderRadius: 6, fontSize: 13, color: T.text }}
        onMouseEnter={e => e.currentTarget.style.background = T.surface2}
        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
        <span>{c.children?.length > 0 ? "📂" : "📁"}</span>
        <span style={{ fontWeight: 600 }}>{c.name}</span>
        {c.children?.length > 0 && <span style={{ fontSize: 10, color: T.text3 }}>({c.children.length})</span>}
      </div>
      {c.children?.length > 0 && renderCollections(c.children, depth + 1)}
    </div>
  ));

  return (
    <div style={S.overlay} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <div style={S.header}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>📊</span>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>Metabase Data Browser</div>
              <div style={{ fontSize: 11, color: T.text3 }}>Browse collections, run saved questions, view dashboards</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, color: T.text3, cursor: "pointer" }}>✕</button>
        </div>

        <div style={S.tabBar}>
          {[{ key: "collections", label: "📁 Collections" }, { key: "questions", label: "❓ Questions" }, { key: "dashboards", label: "📊 Dashboards" }].map(t => (
            <button key={t.key} onClick={() => { setTab(t.key); if (t.key === "collections" && !collections) load("collections"); if (t.key === "questions" && !questions) load("questions"); if (t.key === "dashboards" && !dashboards) load("dashboards"); }} style={S.tab(tab === t.key)}>{t.label}</button>
          ))}
        </div>

        <div style={S.body}>
          {loading && <div style={{ padding: 40, textAlign: "center", color: T.text3 }}>⏳ Loading from Metabase...</div>}
          {error && <div style={{ padding: 16, background: "#ef444410", borderRadius: 8, color: "#ef4444", fontSize: 12, marginBottom: 12 }}>❌ {error}</div>}

          {/* Collections */}
          {tab === "collections" && !loading && (
            <div>
              {!collections && <button onClick={() => load("collections")} style={{ padding: "10px 20px", borderRadius: 8, background: T.accent, color: "#fff", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Load Collections</button>}
              {collections && renderCollections(collections)}
            </div>
          )}

          {/* Questions */}
          {tab === "questions" && !loading && !queryResult && (
            <div>
              {!questions && <button onClick={() => load("questions")} style={{ padding: "10px 20px", borderRadius: 8, background: T.accent, color: "#fff", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Load All Questions</button>}
              {selectedCollection && <div style={{ fontSize: 11, color: T.text3, marginBottom: 8 }}>Showing questions from collection #{selectedCollection} · <span style={{ color: T.accent, cursor: "pointer" }} onClick={() => { setSelectedCollection(null); setQuestions(null); load("questions"); }}>Show all</span></div>}
              {(questions || []).map(q => (
                <div key={q.id} onClick={() => runQuestion(q.id, q.name)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 8, border: `1px solid ${T.border}`, marginBottom: 6, cursor: "pointer", background: T.surface }}
                  onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                  onMouseLeave={e => e.currentTarget.style.background = T.surface}>
                  <span style={{ fontSize: 14 }}>{q.display === "table" ? "📋" : q.display === "bar" ? "📊" : q.display === "line" ? "📈" : q.display === "pie" ? "🥧" : q.display === "scalar" ? "🔢" : "❓"}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{q.name}</div>
                    {q.description && <div style={{ fontSize: 11, color: T.text3 }}>{q.description}</div>}
                  </div>
                  <span style={{ fontSize: 10, color: T.text3 }}>{q.display}</span>
                </div>
              ))}
            </div>
          )}

          {/* Dashboards */}
          {tab === "dashboards" && !loading && !queryResult && (
            <div>
              {!dashboards && <button onClick={() => load("dashboards")} style={{ padding: "10px 20px", borderRadius: 8, background: T.accent, color: "#fff", border: "none", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Load Dashboards</button>}
              {(dashboards || []).map(d => (
                <div key={d.id} onClick={() => loadDashboard(d.id, d.name)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 8, border: `1px solid ${T.border}`, marginBottom: 6, cursor: "pointer", background: T.surface }}
                  onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                  onMouseLeave={e => e.currentTarget.style.background = T.surface}>
                  <span style={{ fontSize: 16 }}>📊</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{d.name}</div>
                    {d.description && <div style={{ fontSize: 11, color: T.text3 }}>{d.description}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Query Result / Dashboard View */}
          {queryResult && !loading && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{queryResult.name}</div>
                  {queryResult.row_count !== undefined && <div style={{ fontSize: 11, color: T.text3 }}>{queryResult.row_count} rows{queryResult.truncated ? " (showing first 500)" : ""}</div>}
                </div>
                <button onClick={() => setQueryResult(null)} style={{ padding: "5px 12px", borderRadius: 6, background: T.surface2, border: `1px solid ${T.border}`, color: T.text3, fontSize: 12, cursor: "pointer" }}>← Back</button>
              </div>

              {queryResult.dashboard ? (
                queryResult.cards.map((card, i) => (
                  <div key={i} style={{ marginBottom: 16, padding: 14, borderRadius: 10, border: `1px solid ${T.border}`, background: T.surface }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 8 }}>{card.name} {card.error ? `❌ ${card.error}` : `(${card.row_count} rows)`}</div>
                    {!card.error && card.data?.length > 0 && (
                      <div style={{ overflow: "auto", maxHeight: 200 }}>
                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                          <thead><tr>{(card.columns || []).map(c => <th key={c} style={{ textAlign: "left", padding: "4px 8px", borderBottom: `1px solid ${T.border}`, color: T.text3, fontWeight: 600, whiteSpace: "nowrap" }}>{c}</th>)}</tr></thead>
                          <tbody>{card.data.slice(0, 20).map((row, ri) => <tr key={ri}>{(card.columns || []).map(c => <td key={c} style={{ padding: "4px 8px", borderBottom: `1px solid ${T.border}08`, color: T.text, whiteSpace: "nowrap" }}>{String(row[c] ?? "")}</td>)}</tr>)}</tbody>
                        </table>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                queryResult.data?.length > 0 && (
                  <div style={{ overflow: "auto", maxHeight: 500, borderRadius: 8, border: `1px solid ${T.border}` }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                      <thead><tr>{(queryResult.columns || []).map(c => <th key={c} style={{ textAlign: "left", padding: "6px 10px", borderBottom: `2px solid ${T.border}`, color: T.text3, fontWeight: 700, whiteSpace: "nowrap", position: "sticky", top: 0, background: T.surface }}>{c}</th>)}</tr></thead>
                      <tbody>{queryResult.data.map((row, ri) => <tr key={ri} style={{ background: ri % 2 === 0 ? "transparent" : T.surface2 + "40" }}>{(queryResult.columns || []).map(c => <td key={c} style={{ padding: "5px 10px", borderBottom: `1px solid ${T.border}08`, color: T.text, whiteSpace: "nowrap", maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis" }}>{String(row[c] ?? "")}</td>)}</tr>)}</tbody>
                    </table>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
