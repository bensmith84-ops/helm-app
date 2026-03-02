"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";

const STAGES = [
  { id: "concept", label: "Concept", color: "#a855f7" },
  { id: "feasibility", label: "Feasibility", color: "#06b6d4" },
  { id: "development", label: "Development", color: "#3b82f6" },
  { id: "pilot", label: "Pilot", color: "#f97316" },
  { id: "validation", label: "Validation", color: "#eab308" },
  { id: "scale_up", label: "Scale Up", color: "#22c55e" },
  { id: "launched", label: "Launched", color: "#84cc16" },
];
const PRIORITIES = { high: "#ef4444", medium: "#eab308", low: "#22c55e" };

export default function PLMView() {
  const [products, setProducts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [viewMode, setViewMode] = useState("pipeline");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("plm_products").select("*").is("deleted_at", null).order("created_at", { ascending: false });
      setProducts(data || []);
      setLoading(false);
    })();
  }, []);

  const createProduct = async () => {
    const name = prompt("Product name:");
    if (!name?.trim()) return;
    const { data } = await supabase.from("plm_products").insert({
      org_id: "a0000000-0000-0000-0000-000000000001", name: name.trim(), stage: "concept",
    }).select().single();
    if (data) { setProducts(p => [data, ...p]); setSelected(data); }
  };

  const updateProduct = async (id, updates) => {
    const ts = { ...updates, updated_at: new Date().toISOString() };
    setProducts(p => p.map(pr => pr.id === id ? { ...pr, ...ts } : pr));
    if (selected?.id === id) setSelected(p => ({ ...p, ...ts }));
    await supabase.from("plm_products").update(ts).eq("id", id);
  };

  const deleteProduct = async (id) => {
    if (!confirm("Delete this product?")) return;
    setProducts(p => p.filter(pr => pr.id !== id));
    if (selected?.id === id) setSelected(null);
    await supabase.from("plm_products").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  };

  if (loading) return <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: T.text3, fontSize: 13 }}>Loading PLM…</div>;

  const pipeline = STAGES.map(s => ({ ...s, products: products.filter(p => p.stage === s.id) }));

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "16px 24px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, flex: 1 }}>Product Lifecycle</h2>
          <div style={{ display: "flex", gap: 4 }}>
            {["pipeline", "list"].map(v => (
              <button key={v} onClick={() => setViewMode(v)} style={{
                padding: "5px 12px", fontSize: 11, fontWeight: 600, borderRadius: 6, cursor: "pointer",
                background: viewMode === v ? `${T.accent}20` : T.surface2, color: viewMode === v ? T.accent : T.text3,
                border: `1px solid ${viewMode === v ? T.accent + "40" : T.border}`,
              }}>{v.charAt(0).toUpperCase() + v.slice(1)}</button>
            ))}
          </div>
          <button onClick={createProduct} style={{ padding: "6px 14px", fontSize: 12, fontWeight: 600, borderRadius: 6, border: "none", background: T.accent, color: "#fff", cursor: "pointer" }}>+ New Product</button>
        </div>

        {viewMode === "pipeline" ? (
          <div style={{ flex: 1, overflow: "auto", padding: 20, display: "flex", gap: 12 }}>
            {pipeline.map(stage => (
              <div key={stage.id} style={{ minWidth: 200, flex: 1, display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, padding: "0 4px" }}>
                  <div style={{ width: 8, height: 8, borderRadius: 8, background: stage.color }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: T.text2 }}>{stage.label}</span>
                  <span style={{ fontSize: 10, color: T.text3, fontWeight: 600, marginLeft: "auto" }}>{stage.products.length}</span>
                </div>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
                  {stage.products.map(p => {
                    const sel = selected?.id === p.id;
                    return (
                      <div key={p.id} onClick={() => setSelected(p)} style={{
                        padding: "10px 12px", borderRadius: 8, cursor: "pointer",
                        background: sel ? `${T.accent}15` : T.surface, border: `1px solid ${sel ? T.accent + "40" : T.border}`,
                      }}>
                        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{p.name}</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, color: T.text3 }}>
                          {p.priority && <span style={{ color: PRIORITIES[p.priority] || T.text3 }}>{p.priority}</span>}
                          {p.target_launch && <span>🚀 {p.target_launch}</span>}
                        </div>
                        {p.progress > 0 && (
                          <div style={{ height: 3, borderRadius: 3, background: T.surface3, overflow: "hidden", marginTop: 6 }}>
                            <div style={{ width: `${p.progress}%`, height: "100%", borderRadius: 3, background: stage.color }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ flex: 1, overflow: "auto", padding: "0 24px" }}>
            {products.length === 0 && <div style={{ textAlign: "center", padding: 40, color: T.text3 }}>No products yet</div>}
            {products.map(p => {
              const sel = selected?.id === p.id;
              const stg = STAGES.find(s => s.id === p.stage);
              return (
                <div key={p.id} onClick={() => setSelected(p)} style={{
                  display: "flex", alignItems: "center", gap: 14, padding: "12px 16px",
                  borderBottom: `1px solid ${T.border}`, cursor: "pointer",
                  background: sel ? `${T.accent}10` : "transparent",
                }}>
                  <div style={{ width: 8, height: 8, borderRadius: 8, background: stg?.color || T.text3 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>{stg?.label || p.stage}{p.target_launch ? ` · Launch: ${p.target_launch}` : ""}</div>
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.text2 }}>{p.progress || 0}%</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {selected && (
        <div style={{ width: 360, borderLeft: `1px solid ${T.border}`, background: T.surface, flexShrink: 0, overflow: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: `1px solid ${T.border}` }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: T.text3 }}>Product Details</span>
            <button onClick={() => setSelected(null)} style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text3, cursor: "pointer", width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>×</button>
          </div>
          <div style={{ padding: 24 }}>
            <input value={selected.name} onChange={e => updateProduct(selected.id, { name: e.target.value })}
              style={{ fontSize: 20, fontWeight: 700, color: T.text, background: "transparent", border: "none", outline: "none", width: "100%", marginBottom: 12, fontFamily: "inherit" }} />
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <select value={selected.stage} onChange={e => updateProduct(selected.id, { stage: e.target.value })}
                style={{ fontSize: 11, padding: "4px 8px", borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontFamily: "inherit" }}>
                {STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
              <select value={selected.priority || "medium"} onChange={e => updateProduct(selected.id, { priority: e.target.value })}
                style={{ fontSize: 11, padding: "4px 8px", borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontFamily: "inherit" }}>
                {Object.keys(PRIORITIES).map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.text3, display: "block", marginBottom: 4 }}>Progress (%)</label>
              <input type="range" min="0" max="100" value={selected.progress || 0} onChange={e => updateProduct(selected.id, { progress: Number(e.target.value) })}
                style={{ width: "100%" }} />
              <div style={{ fontSize: 12, color: T.text2, textAlign: "center" }}>{selected.progress || 0}%</div>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.text3, display: "block", marginBottom: 4 }}>Target Launch</label>
              <input type="date" value={selected.target_launch || ""} onChange={e => updateProduct(selected.id, { target_launch: e.target.value || null })}
                style={{ padding: "6px 10px", fontSize: 13, color: T.text, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, outline: "none", fontFamily: "inherit", colorScheme: "dark" }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.text3, display: "block", marginBottom: 4 }}>Description</label>
              <textarea value={selected.description || ""} onChange={e => updateProduct(selected.id, { description: e.target.value })}
                placeholder="Product details…"
                style={{ width: "100%", minHeight: 100, fontSize: 13, color: T.text, lineHeight: 1.6, padding: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, resize: "vertical", outline: "none", fontFamily: "inherit" }} />
            </div>
            <button onClick={() => deleteProduct(selected.id)} style={{ padding: "7px 14px", fontSize: 12, fontWeight: 600, borderRadius: 6, border: "1px solid #ef444440", background: "#ef444410", color: "#ef4444", cursor: "pointer" }}>Delete</button>
          </div>
        </div>
      )}
    </div>
  );
}
