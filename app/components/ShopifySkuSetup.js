"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";

// ── SKU Setup Page ──────────────────────────────────────────────────────────
// Tabs: SKU Config | Primary SKUs
export default function ShopifySkuSetup({ onClose }) {
  const [tab, setTab] = useState("config"); // config | primary
  const [skuConfigs, setSkuConfigs] = useState([]);
  const [allSkus, setAllSkus] = useState([]); // unique SKUs from shopify_sku_daily
  const [primarySkus, setPrimarySkus] = useState([]);
  const [primaryMembers, setPrimaryMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterVisibility, setFilterVisibility] = useState("all"); // all, visible, hidden
  const [editingPrimary, setEditingPrimary] = useState(null); // null or primary SKU object
  const [showCreatePrimary, setShowCreatePrimary] = useState(false);
  const [saving, setSaving] = useState(false);
  const [addSearch, setAddSearch] = useState("");

  // Load all data
  useEffect(() => {
    const load = async () => {
      setLoading(true);
      // Get unique SKUs from sales data
      const { data: dailySkus } = await supabase
        .from("shopify_sku_daily")
        .select("sku, product_title, variant_title")
        .order("sku");
      
      // Deduplicate
      const skuMap = {};
      for (const r of (dailySkus || [])) {
        if (!skuMap[r.sku]) skuMap[r.sku] = { sku: r.sku, product_title: r.product_title, variant_title: r.variant_title };
      }
      setAllSkus(Object.values(skuMap));

      // Load configs
      const { data: configs } = await supabase.from("shopify_sku_config").select("*").order("sku");
      setSkuConfigs(configs || []);

      // Load primary SKUs
      const { data: primaries } = await supabase.from("shopify_primary_skus").select("*").order("name");
      setPrimarySkus(primaries || []);

      // Load all members
      const { data: members } = await supabase.from("shopify_primary_sku_members").select("*");
      setPrimaryMembers(members || []);

      setLoading(false);
    };
    load();
  }, []);

  // Get config for a SKU (or defaults)
  const getConfig = useCallback((sku) => {
    return skuConfigs.find(c => c.sku === sku) || { sku, is_visible: true, unit_multiplier: 1, display_name: null, category: null, notes: null };
  }, [skuConfigs]);

  // Save a SKU config
  const saveConfig = async (sku, updates) => {
    setSaving(true);
    const existing = skuConfigs.find(c => c.sku === sku);
    if (existing) {
      await supabase.from("shopify_sku_config").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", existing.id);
      setSkuConfigs(p => p.map(c => c.id === existing.id ? { ...c, ...updates } : c));
    } else {
      const { data } = await supabase.from("shopify_sku_config").insert({ sku, ...updates }).select().single();
      if (data) setSkuConfigs(p => [...p, data]);
    }
    setSaving(false);
  };

  // Toggle visibility
  const toggleVisibility = (sku) => {
    const cfg = getConfig(sku);
    saveConfig(sku, { is_visible: !cfg.is_visible });
  };

  // Update multiplier
  const updateMultiplier = (sku, value) => {
    const num = parseFloat(value);
    if (!isNaN(num) && num > 0) saveConfig(sku, { unit_multiplier: num });
  };

  // Update display name
  const updateDisplayName = (sku, value) => {
    saveConfig(sku, { display_name: value || null });
  };

  // Update category
  const updateCategory = (sku, value) => {
    saveConfig(sku, { category: value || null });
  };

  // Bulk toggle
  const bulkSetVisibility = async (visible) => {
    setSaving(true);
    const filtered = getFilteredSkus();
    for (const s of filtered) {
      await saveConfig(s.sku, { is_visible: visible });
    }
    setSaving(false);
  };

  // Filter SKUs
  const getFilteredSkus = () => {
    return allSkus.filter(s => {
      if (search && !s.sku.toLowerCase().includes(search.toLowerCase()) && !s.product_title?.toLowerCase().includes(search.toLowerCase())) return false;
      if (filterVisibility === "visible" && !getConfig(s.sku).is_visible) return false;
      if (filterVisibility === "hidden" && getConfig(s.sku).is_visible) return false;
      return true;
    });
  };

  // ── Primary SKU CRUD ──────────────────────────────────────────────────
  const [newPrimaryName, setNewPrimaryName] = useState("");
  const [newPrimaryDisplaySku, setNewPrimaryDisplaySku] = useState("");
  const [newPrimaryCategory, setNewPrimaryCategory] = useState("");

  const createPrimary = async () => {
    if (!newPrimaryName.trim()) return;
    const { data } = await supabase.from("shopify_primary_skus").insert({
      name: newPrimaryName.trim(),
      display_sku: newPrimaryDisplaySku.trim() || null,
      category: newPrimaryCategory.trim() || null,
    }).select().single();
    if (data) {
      setPrimarySkus(p => [...p, data]);
      setNewPrimaryName("");
      setNewPrimaryDisplaySku("");
      setNewPrimaryCategory("");
      setShowCreatePrimary(false);
      setEditingPrimary(data);
    }
  };

  const deletePrimary = async (id) => {
    if (!confirm("Delete this primary SKU group? Members will be unlinked.")) return;
    await supabase.from("shopify_primary_sku_members").delete().eq("primary_sku_id", id);
    await supabase.from("shopify_primary_skus").delete().eq("id", id);
    setPrimarySkus(p => p.filter(x => x.id !== id));
    setPrimaryMembers(p => p.filter(x => x.primary_sku_id !== id));
    if (editingPrimary?.id === id) setEditingPrimary(null);
  };

  const addMember = async (primaryId, sku, multiplier = 1) => {
    const existing = primaryMembers.find(m => m.primary_sku_id === primaryId && m.sku === sku);
    if (existing) return;
    const { data } = await supabase.from("shopify_primary_sku_members").insert({
      primary_sku_id: primaryId, sku, unit_multiplier: multiplier,
    }).select().single();
    if (data) setPrimaryMembers(p => [...p, data]);
  };

  const removeMember = async (memberId) => {
    await supabase.from("shopify_primary_sku_members").delete().eq("id", memberId);
    setPrimaryMembers(p => p.filter(x => x.id !== memberId));
  };

  const updateMemberMultiplier = async (memberId, value) => {
    const num = parseFloat(value);
    if (!isNaN(num) && num > 0) {
      await supabase.from("shopify_primary_sku_members").update({ unit_multiplier: num }).eq("id", memberId);
      setPrimaryMembers(p => p.map(x => x.id === memberId ? { ...x, unit_multiplier: num } : x));
    }
  };

  const getMembersForPrimary = (primaryId) => primaryMembers.filter(m => m.primary_sku_id === primaryId);

  const filteredSkus = getFilteredSkus();

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: T.text3, fontSize: 13 }}>Loading SKU data...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ padding: "14px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: T.text3, padding: 0 }}>←</button>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>SKU Setup</div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, overflow: "hidden" }}>
          {[["config", "SKU Config"], ["primary", "Primary SKUs"]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ padding: "6px 14px", fontSize: 12, fontWeight: 600, background: tab === k ? T.accent : "transparent", color: tab === k ? "#fff" : T.text3, border: "none", cursor: "pointer" }}>{l}</button>
          ))}
        </div>
      </div>

      {/* ── SKU Config Tab ──────────────────────────────────────────── */}
      {tab === "config" && (
        <div style={{ flex: 1, overflow: "auto", padding: "16px 20px" }}>
          {/* Filters */}
          <div style={{ display: "flex", gap: 10, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search SKU or product..."
              style={{ padding: "6px 12px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, outline: "none", width: 220 }} />
            <select value={filterVisibility} onChange={e => setFilterVisibility(e.target.value)}
              style={{ padding: "6px 10px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text }}>
              <option value="all">All ({allSkus.length})</option>
              <option value="visible">Visible ({allSkus.filter(s => getConfig(s.sku).is_visible).length})</option>
              <option value="hidden">Hidden ({allSkus.filter(s => !getConfig(s.sku).is_visible).length})</option>
            </select>
            <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
              <button onClick={() => bulkSetVisibility(true)} style={{ padding: "5px 10px", fontSize: 11, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text2, cursor: "pointer" }}>Show All Filtered</button>
              <button onClick={() => bulkSetVisibility(false)} style={{ padding: "5px 10px", fontSize: 11, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text2, cursor: "pointer" }}>Hide All Filtered</button>
            </div>
          </div>

          <div style={{ fontSize: 11, color: T.text3, marginBottom: 10 }}>
            {filteredSkus.length} SKUs shown · Click the eye to toggle visibility · Set multiplier for multi-packs (e.g., 3-pack = 3)
          </div>

          {/* SKU Table */}
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${T.border}` }}>
                <th style={{ padding: "6px 8px", textAlign: "center", width: 40, fontSize: 10, fontWeight: 700, color: T.text3 }}>VIS</th>
                <th style={{ padding: "6px 8px", textAlign: "left", fontSize: 10, fontWeight: 700, color: T.text3 }}>SKU</th>
                <th style={{ padding: "6px 8px", textAlign: "left", fontSize: 10, fontWeight: 700, color: T.text3 }}>PRODUCT</th>
                <th style={{ padding: "6px 8px", textAlign: "left", fontSize: 10, fontWeight: 700, color: T.text3 }}>VARIANT</th>
                <th style={{ padding: "6px 8px", textAlign: "left", width: 150, fontSize: 10, fontWeight: 700, color: T.text3 }}>DISPLAY NAME</th>
                <th style={{ padding: "6px 8px", textAlign: "center", width: 70, fontSize: 10, fontWeight: 700, color: T.text3 }}>MULTI</th>
                <th style={{ padding: "6px 8px", textAlign: "left", width: 120, fontSize: 10, fontWeight: 700, color: T.text3 }}>CATEGORY</th>
              </tr>
            </thead>
            <tbody>
              {filteredSkus.map(s => {
                const cfg = getConfig(s.sku);
                return (
                  <tr key={s.sku} style={{ borderBottom: `1px solid ${T.border}`, opacity: cfg.is_visible ? 1 : 0.5 }}>
                    <td style={{ padding: "4px 8px", textAlign: "center" }}>
                      <button onClick={() => toggleVisibility(s.sku)}
                        style={{ background: "none", border: "none", cursor: "pointer", fontSize: 16, padding: 0 }}>
                        {cfg.is_visible ? "👁" : "🚫"}
                      </button>
                    </td>
                    <td style={{ padding: "4px 8px", fontFamily: "monospace", fontSize: 11, fontWeight: 600, color: T.accent }}>{s.sku}</td>
                    <td style={{ padding: "4px 8px", color: T.text, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.product_title}</td>
                    <td style={{ padding: "4px 8px", color: T.text3 }}>{s.variant_title || "—"}</td>
                    <td style={{ padding: "4px 8px" }}>
                      <input defaultValue={cfg.display_name || ""} placeholder="—"
                        onBlur={e => updateDisplayName(s.sku, e.target.value)}
                        style={{ width: "100%", padding: "3px 6px", fontSize: 11, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, color: T.text, outline: "none" }} />
                    </td>
                    <td style={{ padding: "4px 8px", textAlign: "center" }}>
                      <input type="number" defaultValue={cfg.unit_multiplier} min="0.1" step="0.5"
                        onBlur={e => updateMultiplier(s.sku, e.target.value)}
                        style={{ width: 50, padding: "3px 4px", fontSize: 11, textAlign: "center", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, color: T.text, outline: "none" }} />
                    </td>
                    <td style={{ padding: "4px 8px" }}>
                      <input defaultValue={cfg.category || ""} placeholder="—"
                        onBlur={e => updateCategory(s.sku, e.target.value)}
                        style={{ width: "100%", padding: "3px 6px", fontSize: 11, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, color: T.text, outline: "none" }} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Primary SKUs Tab ──────────────────────────────────────── */}
      {tab === "primary" && (
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          {/* Left: Primary SKU list */}
          <div style={{ width: 280, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
            <div style={{ padding: "10px 12px", borderBottom: `1px solid ${T.border}` }}>
              <button onClick={() => setShowCreatePrimary(true)}
                style={{ width: "100%", padding: "8px 12px", fontSize: 12, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>
                + Create Primary SKU
              </button>
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: 8 }}>
              {primarySkus.length === 0 ? (
                <div style={{ padding: 16, fontSize: 12, color: T.text3, textAlign: "center", lineHeight: 1.6 }}>
                  No primary SKUs yet. Create one to group multiple child SKUs together (e.g., "Fresh Scent" grouping 1-pack and 3-pack).
                </div>
              ) : primarySkus.map(p => (
                <div key={p.id} onClick={() => { setEditingPrimary(p); setShowCreatePrimary(false); setAddSearch(''); }}
                  style={{ padding: "10px 12px", borderRadius: 6, cursor: "pointer", marginBottom: 4,
                    background: editingPrimary?.id === p.id ? T.accentDim : "transparent",
                    border: `1px solid ${editingPrimary?.id === p.id ? T.accent + "60" : "transparent"}` }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>
                    {p.display_sku && <span style={{ fontFamily: "monospace" }}>{p.display_sku} · </span>}
                    {getMembersForPrimary(p.id).length} SKUs
                    {p.category && <span> · {p.category}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Detail panel */}
          <div style={{ flex: 1, overflow: "auto", padding: "16px 20px" }}>
            {/* Create new primary */}
            {showCreatePrimary && (
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 16 }}>Create Primary SKU</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 400 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: T.text3, display: "block", marginBottom: 4 }}>Name *</label>
                    <input value={newPrimaryName} onChange={e => setNewPrimaryName(e.target.value)} placeholder="e.g., Fresh Scent"
                      style={{ width: "100%", padding: "8px 12px", fontSize: 13, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, outline: "none" }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: T.text3, display: "block", marginBottom: 4 }}>Display SKU (optional)</label>
                    <input value={newPrimaryDisplaySku} onChange={e => setNewPrimaryDisplaySku(e.target.value)} placeholder="e.g., FS-ALL"
                      style={{ width: "100%", padding: "8px 12px", fontSize: 13, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, outline: "none" }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: T.text3, display: "block", marginBottom: 4 }}>Category (optional)</label>
                    <input value={newPrimaryCategory} onChange={e => setNewPrimaryCategory(e.target.value)} placeholder="e.g., Laundry Sheets"
                      style={{ width: "100%", padding: "8px 12px", fontSize: 13, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, outline: "none" }} />
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                    <button onClick={createPrimary} disabled={!newPrimaryName.trim()}
                      style={{ padding: "8px 16px", fontSize: 12, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", opacity: newPrimaryName.trim() ? 1 : 0.4 }}>Create</button>
                    <button onClick={() => setShowCreatePrimary(false)}
                      style={{ padding: "8px 16px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text3, cursor: "pointer" }}>Cancel</button>
                  </div>
                </div>
              </div>
            )}

            {/* Edit primary detail */}
            {editingPrimary && !showCreatePrimary && (() => {
              const members = getMembersForPrimary(editingPrimary.id);
              const memberSkus = new Set(members.map(m => m.sku));
              const availableSkus = allSkus.filter(s => !memberSkus.has(s.sku));
              const filteredAvailable = availableSkus.filter(s =>
                !addSearch || s.sku.toLowerCase().includes(addSearch.toLowerCase()) || s.product_title?.toLowerCase().includes(addSearch.toLowerCase())
              );
              return (
                <div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{editingPrimary.name}</div>
                      {editingPrimary.display_sku && <div style={{ fontSize: 12, color: T.text3, fontFamily: "monospace" }}>{editingPrimary.display_sku}</div>}
                    </div>
                    <button onClick={() => deletePrimary(editingPrimary.id)}
                      style={{ padding: "5px 12px", fontSize: 11, background: "#ef444415", border: `1px solid #ef444440`, borderRadius: 6, color: "#ef4444", cursor: "pointer" }}>Delete Group</button>
                  </div>

                  {/* Current members */}
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 8 }}>Member SKUs ({members.length})</div>
                  {members.length === 0 ? (
                    <div style={{ padding: 16, fontSize: 12, color: T.text3, background: T.surface2, borderRadius: 8, textAlign: "center" }}>
                      No SKUs added yet. Search below to add child SKUs to this group.
                    </div>
                  ) : (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, marginBottom: 16 }}>
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                          <th style={{ padding: "4px 8px", textAlign: "left", fontSize: 10, fontWeight: 700, color: T.text3 }}>SKU</th>
                          <th style={{ padding: "4px 8px", textAlign: "left", fontSize: 10, fontWeight: 700, color: T.text3 }}>PRODUCT</th>
                          <th style={{ padding: "4px 8px", textAlign: "center", fontSize: 10, fontWeight: 700, color: T.text3, width: 80 }}>MULTIPLIER</th>
                          <th style={{ padding: "4px 8px", textAlign: "center", fontSize: 10, fontWeight: 700, color: T.text3, width: 40 }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {members.map(m => {
                          const skuInfo = allSkus.find(s => s.sku === m.sku);
                          return (
                            <tr key={m.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                              <td style={{ padding: "6px 8px", fontFamily: "monospace", fontSize: 11, fontWeight: 600, color: T.accent }}>{m.sku}</td>
                              <td style={{ padding: "6px 8px", color: T.text }}>{skuInfo?.product_title || "—"} {skuInfo?.variant_title ? `(${skuInfo.variant_title})` : ""}</td>
                              <td style={{ padding: "6px 8px", textAlign: "center" }}>
                                <input type="number" defaultValue={m.unit_multiplier} min="0.1" step="0.5"
                                  onBlur={e => updateMemberMultiplier(m.id, e.target.value)}
                                  style={{ width: 50, padding: "3px 4px", fontSize: 11, textAlign: "center", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, color: T.text, outline: "none" }} />
                              </td>
                              <td style={{ padding: "6px 8px", textAlign: "center" }}>
                                <button onClick={() => removeMember(m.id)}
                                  style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 14, padding: 0 }}>✕</button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}

                  {/* Add member */}
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 8, marginTop: 16 }}>Add SKUs to this group</div>
                  <input value={addSearch} onChange={e => setAddSearch(e.target.value)} placeholder="Search SKU or product to add..."
                    style={{ width: "100%", padding: "8px 12px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, outline: "none", marginBottom: 8 }} />
                  <div style={{ maxHeight: 250, overflow: "auto", border: `1px solid ${T.border}`, borderRadius: 6 }}>
                    {filteredAvailable.slice(0, 30).map(s => (
                      <div key={s.sku} onClick={() => addMember(editingPrimary.id, s.sku, 1)}
                        style={{ padding: "8px 12px", cursor: "pointer", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 8 }}
                        onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <span style={{ fontFamily: "monospace", fontSize: 11, fontWeight: 600, color: T.accent }}>{s.sku}</span>
                        <span style={{ fontSize: 11, color: T.text }}>{s.product_title}</span>
                        {s.variant_title && <span style={{ fontSize: 11, color: T.text3 }}>({s.variant_title})</span>}
                        <span style={{ marginLeft: "auto", fontSize: 10, color: T.accent, fontWeight: 600 }}>+ Add</span>
                      </div>
                    ))}
                    {filteredAvailable.length > 30 && <div style={{ padding: "8px 12px", fontSize: 11, color: T.text3, textAlign: "center" }}>Showing 30 of {filteredAvailable.length} — refine your search</div>}
                    {filteredAvailable.length === 0 && <div style={{ padding: "16px 12px", fontSize: 11, color: T.text3, textAlign: "center" }}>No matching SKUs available</div>}
                  </div>
                </div>
              );
            })()}

            {/* Empty state */}
            {!editingPrimary && !showCreatePrimary && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", flexDirection: "column", gap: 12 }}>
                <div style={{ fontSize: 32 }}>📦</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>Primary SKU Groups</div>
                <div style={{ fontSize: 12, color: T.text3, textAlign: "center", maxWidth: 400, lineHeight: 1.6 }}>
                  Create primary SKU groups to roll up multiple child SKUs into one. For example, group "Fresh Scent 1-Pack" and "Fresh Scent 3-Pack" under a single "Fresh Scent" primary with appropriate multipliers.
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
