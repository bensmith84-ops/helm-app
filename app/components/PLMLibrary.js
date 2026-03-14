"use client";
import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";

const UOM_OPTIONS = ["kg","g","lb","oz","L","mL","units","each","case","drum","tote","pallet","MT"];
const INGREDIENT_TYPES = [
  { value:"ingredient", label:"Ingredient" },
  { value:"packaging",  label:"Packaging"  },
  { value:"other",      label:"Other"      },
];
const CATEGORIES = [
  "Active","Preservative","Emulsifier","Surfactant","Humectant","Emollient",
  "Thickener","Fragrance","Colorant","Solvent","Antioxidant","Botanical",
  "Vitamin","Mineral","Packaging - Primary","Packaging - Secondary",
  "Packaging - Tertiary","Contract Service","Other",
];
const SUPPLIER_STATUSES = ["active","evaluating","approved","inactive","disqualified"];
const STATUS_COLORS = { active:"#22c55e", approved:"#22c55e", evaluating:"#eab308", inactive:"#8b93a8", disqualified:"#ef4444" };

function InlineField({ label, value, onChange, onBlur, type="text", placeholder, options, multiline }) {
  const base = { width:"100%", fontSize:13, color:T.text, background:T.surface2, border:`1px solid ${T.border}`, borderRadius:6, padding:"6px 10px", outline:"none", fontFamily:"inherit", boxSizing:"border-box" };
  return (
    <div style={{ marginBottom:12 }}>
      {label && <div style={{ fontSize:11, color:T.text3, marginBottom:4, fontWeight:600 }}>{label}</div>}
      {options ? (
        <select value={value||""} onChange={e=>onChange(e.target.value)} onBlur={onBlur} style={{ ...base, cursor:"pointer" }}>
          <option value="">—</option>
          {options.map(o=><option key={o.value||o} value={o.value||o}>{o.label||o}</option>)}
        </select>
      ) : multiline ? (
        <textarea value={value||""} onChange={e=>onChange(e.target.value)} onBlur={onBlur} placeholder={placeholder} style={{ ...base, minHeight:72, resize:"vertical" }} />
      ) : (
        <input type={type} value={value||""} onChange={e=>onChange(e.target.value)} onBlur={onBlur} placeholder={placeholder} style={base} />
      )}
    </div>
  );
}

// ── Pricing Tier Table ────────────────────────────────────────────────────────
function PricingTiers({ supplierId, uom }) {
  const [tiers, setTiers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("plm_ingredient_pricing").select("*").eq("supplier_id", supplierId).order("min_qty")
      .then(({ data }) => { setTiers(data || []); setLoading(false); });
  }, [supplierId]);

  const addTier = async () => {
    const { data } = await supabase.from("plm_ingredient_pricing")
      .insert({ supplier_id: supplierId, min_qty: 0, unit_price: 0, uom: uom || "kg", currency: "USD" })
      .select().single();
    if (data) setTiers(p => [...p, data]);
  };

  const updateTier = async (id, field, val) => {
    const parsed = ["min_qty","max_qty","unit_price"].includes(field) ? (val === "" ? null : parseFloat(val)) : val;
    setTiers(p => p.map(t => t.id === id ? { ...t, [field]: parsed } : t));
    await supabase.from("plm_ingredient_pricing").update({ [field]: parsed }).eq("id", id);
  };

  const deleteTier = async (id) => {
    await supabase.from("plm_ingredient_pricing").delete().eq("id", id);
    setTiers(p => p.filter(t => t.id !== id));
  };

  if (loading) return <div style={{ fontSize:12, color:T.text3 }}>Loading…</div>;

  const inp = { background:"transparent", border:"none", fontSize:12, color:T.text, outline:"none", fontFamily:"inherit", width:"100%", textAlign:"right" };

  return (
    <div style={{ marginTop:12 }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:8 }}>
        <div style={{ fontSize:11, fontWeight:700, color:T.text3, textTransform:"uppercase", letterSpacing:1 }}>Volume Pricing Tiers</div>
        <button onClick={addTier} style={{ fontSize:11, fontWeight:600, padding:"3px 10px", borderRadius:5, background:T.accentDim, color:T.accent, border:`1px solid ${T.accent}40`, cursor:"pointer" }}>
          + Add Tier
        </button>
      </div>
      {tiers.length === 0 ? (
        <div style={{ fontSize:12, color:T.text3, fontStyle:"italic" }}>No pricing tiers — add tiers for volume-based pricing</div>
      ) : (
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr style={{ borderBottom:`1px solid ${T.border}` }}>
              {["Min Qty","Max Qty","UOM","Unit Price ($)","Currency","Expires",""].map(h => (
                <th key={h} style={{ padding:"4px 6px", textAlign:"left", fontSize:9, fontWeight:700, color:T.text3, textTransform:"uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tiers.map(tier => (
              <tr key={tier.id} style={{ borderBottom:`1px solid ${T.border}` }}>
                <td style={{ padding:"4px 6px" }}><input value={tier.min_qty||""} onChange={e=>updateTier(tier.id,"min_qty",e.target.value)} style={inp} placeholder="0" /></td>
                <td style={{ padding:"4px 6px" }}><input value={tier.max_qty||""} onChange={e=>updateTier(tier.id,"max_qty",e.target.value)} style={inp} placeholder="∞" /></td>
                <td style={{ padding:"4px 6px" }}>
                  <select value={tier.uom||"kg"} onChange={e=>updateTier(tier.id,"uom",e.target.value)} style={{ ...inp, textAlign:"left", cursor:"pointer" }}>
                    {UOM_OPTIONS.map(u=><option key={u} value={u}>{u}</option>)}
                  </select>
                </td>
                <td style={{ padding:"4px 6px" }}><input value={tier.unit_price||""} onChange={e=>updateTier(tier.id,"unit_price",e.target.value)} style={inp} type="number" placeholder="0.00" /></td>
                <td style={{ padding:"4px 6px" }}>
                  <select value={tier.currency||"USD"} onChange={e=>updateTier(tier.id,"currency",e.target.value)} style={{ ...inp, textAlign:"left", cursor:"pointer" }}>
                    {["USD","CAD","AUD","GBP","EUR"].map(c=><option key={c} value={c}>{c}</option>)}
                  </select>
                </td>
                <td style={{ padding:"4px 6px" }}><input value={tier.expiry_date||""} onChange={e=>updateTier(tier.id,"expiry_date",e.target.value)} style={{ ...inp, textAlign:"left" }} type="date" /></td>
                <td style={{ padding:"4px 6px", textAlign:"center" }}>
                  <button onClick={()=>deleteTier(tier.id)} style={{ background:"none", border:"none", color:T.text3, cursor:"pointer", fontSize:12 }}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Supplier Card ─────────────────────────────────────────────────────────────
function SupplierCard({ supplier, onUpdate, onDelete, defaultUom }) {
  const [expanded, setExpanded] = useState(false);
  const [vals, setVals] = useState(supplier);

  const save = async (field, val) => {
    const updated = { ...vals, [field]: val };
    setVals(updated);
    await supabase.from("plm_ingredient_suppliers").update({ [field]: val }).eq("id", supplier.id);
    onUpdate(updated);
  };

  const sc = STATUS_COLORS[supplier.status] || "#8b93a8";

  return (
    <div style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:8, marginBottom:8, overflow:"hidden" }}>
      {/* Header */}
      <div style={{ padding:"10px 14px", display:"flex", alignItems:"center", gap:10, cursor:"pointer" }} onClick={() => setExpanded(e => !e)}>
        {supplier.is_preferred && <span style={{ fontSize:10, fontWeight:700, color:"#f97316", flexShrink:0 }}>★</span>}
        <div style={{ fontSize:13, fontWeight:600, color:T.text, flex:1 }}>{supplier.supplier_name}</div>
        {supplier.contact_email && <div style={{ fontSize:11, color:T.text3 }}>{supplier.contact_email}</div>}
        <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:4, background:sc+"20", color:sc }}>{supplier.status}</span>
        {supplier.lead_time_days && <span style={{ fontSize:11, color:T.text3 }}>{supplier.lead_time_days}d lead</span>}
        <span style={{ color:T.text3, fontSize:11 }}>{expanded?"▲":"▼"}</span>
        <button onClick={e=>{e.stopPropagation(); if(confirm("Remove this supplier?")) onDelete(supplier.id);}} style={{ background:"none", border:"none", color:T.text3, cursor:"pointer", fontSize:12, padding:0 }}>✕</button>
      </div>

      {expanded && (
        <div style={{ borderTop:`1px solid ${T.border}`, padding:14 }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:8 }}>
            <InlineField label="Supplier Name" value={vals.supplier_name} onChange={v=>setVals(p=>({...p,supplier_name:v}))} onBlur={()=>save("supplier_name",vals.supplier_name)} />
            <InlineField label="Supplier Code / SKU" value={vals.supplier_code} onChange={v=>setVals(p=>({...p,supplier_code:v}))} onBlur={()=>save("supplier_code",vals.supplier_code)} placeholder="Their internal code" />
            <InlineField label="Contact Name" value={vals.contact_name} onChange={v=>setVals(p=>({...p,contact_name:v}))} onBlur={()=>save("contact_name",vals.contact_name)} />
            <InlineField label="Contact Email" value={vals.contact_email} onChange={v=>setVals(p=>({...p,contact_email:v}))} onBlur={()=>save("contact_email",vals.contact_email)} placeholder="supplier@company.com" />
            <InlineField label="Phone" value={vals.contact_phone} onChange={v=>setVals(p=>({...p,contact_phone:v}))} onBlur={()=>save("contact_phone",vals.contact_phone)} />
            <InlineField label="Website" value={vals.website} onChange={v=>setVals(p=>({...p,website:v}))} onBlur={()=>save("website",vals.website)} placeholder="https://…" />
            <InlineField label="Country" value={vals.country} onChange={v=>setVals(p=>({...p,country:v}))} onBlur={()=>save("country",vals.country)} placeholder="e.g. China, USA" />
            <InlineField label="Status" value={vals.status} onChange={v=>save("status",v)} options={SUPPLIER_STATUSES.map(s=>({value:s,label:s}))} />
            <InlineField label="Lead Time (days)" value={vals.lead_time_days} onChange={v=>setVals(p=>({...p,lead_time_days:v}))} onBlur={()=>save("lead_time_days",parseFloat(vals.lead_time_days)||null)} type="number" />
            <InlineField label={`MOQ (${vals.moq_uom||"kg"})`} value={vals.moq} onChange={v=>setVals(p=>({...p,moq:v}))} onBlur={()=>save("moq",parseFloat(vals.moq)||null)} type="number" />
          </div>
          <div style={{ display:"flex", gap:12, marginBottom:12, alignItems:"center" }}>
            <label style={{ fontSize:12, color:T.text2, display:"flex", alignItems:"center", gap:6, cursor:"pointer" }}>
              <input type="checkbox" checked={!!vals.is_preferred} onChange={e=>{const v=e.target.checked;setVals(p=>({...p,is_preferred:v}));save("is_preferred",v);}} />
              <span>⭐ Mark as preferred supplier</span>
            </label>
          </div>
          <InlineField label="Notes" value={vals.notes} onChange={v=>setVals(p=>({...p,notes:v}))} onBlur={()=>save("notes",vals.notes)} multiline placeholder="Sourcing notes, certifications, quality history…" />
          <PricingTiers supplierId={supplier.id} uom={defaultUom} />
        </div>
      )}
    </div>
  );
}

// ── Ingredient Detail Panel ───────────────────────────────────────────────────
function IngredientDetail({ ingredient, onUpdate, onClose }) {
  const [vals, setVals] = useState(ingredient);
  const [suppliers, setSuppliers] = useState([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(true);
  const [showAddSupplier, setShowAddSupplier] = useState(false);
  const [newSupplier, setNewSupplier] = useState({ supplier_name:"", contact_email:"", status:"active" });

  useEffect(() => {
    supabase.from("plm_ingredient_suppliers").select("*").eq("ingredient_id", ingredient.id).order("is_preferred desc, supplier_name")
      .then(({ data }) => { setSuppliers(data || []); setLoadingSuppliers(false); });
  }, [ingredient.id]);

  const save = async (field, val) => {
    const updated = { ...vals, [field]: val };
    setVals(updated);
    await supabase.from("plm_ingredient_library").update({ [field]: val, updated_at: new Date().toISOString() }).eq("id", ingredient.id);
    onUpdate(updated);
  };

  const addSupplier = async () => {
    if (!newSupplier.supplier_name.trim()) return;
    const { data } = await supabase.from("plm_ingredient_suppliers")
      .insert({ ...newSupplier, ingredient_id: ingredient.id, moq_uom: vals.default_uom || "kg" })
      .select().single();
    if (data) { setSuppliers(p => [...p, data]); setShowAddSupplier(false); setNewSupplier({ supplier_name:"", contact_email:"", status:"active" }); }
  };

  const preferredSupplier = suppliers.find(s => s.is_preferred) || suppliers[0];

  return (
    <div style={{ flex:1, overflow:"auto", padding:20 }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:20 }}>
        <button onClick={onClose} style={{ background:"none", border:`1px solid ${T.border}`, color:T.text2, cursor:"pointer", borderRadius:6, padding:"4px 10px", fontSize:12 }}>← Back</button>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:18, fontWeight:700, color:T.text }}>{ingredient.name}</div>
          {ingredient.inci_name && <div style={{ fontSize:12, color:T.text3, marginTop:2 }}>INCI: {ingredient.inci_name}</div>}
        </div>
        <span style={{ fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:6,
          background: ingredient.ingredient_type==="packaging"?"#8b5cf620":"#3b82f620",
          color: ingredient.ingredient_type==="packaging"?"#8b5cf6":"#3b82f6" }}>
          {ingredient.ingredient_type}
        </span>
        {preferredSupplier && (
          <div style={{ fontSize:12, color:T.text3 }}>
            Preferred: <span style={{ fontWeight:600, color:T.text }}>{preferredSupplier.supplier_name}</span>
          </div>
        )}
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:24 }}>
        {/* Left: ingredient details */}
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:T.text3, textTransform:"uppercase", letterSpacing:1, marginBottom:12 }}>Ingredient Details</div>
          <InlineField label="Name *" value={vals.name} onChange={v=>setVals(p=>({...p,name:v}))} onBlur={()=>save("name",vals.name)} />
          <InlineField label="INCI Name" value={vals.inci_name} onChange={v=>setVals(p=>({...p,inci_name:v}))} onBlur={()=>save("inci_name",vals.inci_name)} placeholder="INCI / chemical name" />
          <InlineField label="CAS Number" value={vals.cas_number} onChange={v=>setVals(p=>({...p,cas_number:v}))} onBlur={()=>save("cas_number",vals.cas_number)} placeholder="e.g. 7732-18-5" />
          <InlineField label="Type" value={vals.ingredient_type} onChange={v=>save("ingredient_type",v)} options={INGREDIENT_TYPES} />
          <InlineField label="Category" value={vals.category} onChange={v=>save("category",v)} options={CATEGORIES.map(c=>({value:c,label:c}))} />
          <InlineField label="Default UOM" value={vals.default_uom} onChange={v=>save("default_uom",v)} options={UOM_OPTIONS.map(u=>({value:u,label:u}))} />
          <InlineField label="Description" value={vals.description} onChange={v=>setVals(p=>({...p,description:v}))} onBlur={()=>save("description",vals.description)} multiline placeholder="What this ingredient does, key properties…" />
          <InlineField label="Notes" value={vals.notes} onChange={v=>setVals(p=>({...p,notes:v}))} onBlur={()=>save("notes",vals.notes)} multiline placeholder="Regulatory notes, storage conditions, certifications…" />

          {/* Quick pricing summary */}
          {suppliers.length > 0 && (
            <div style={{ marginTop:16, padding:12, background:T.surface2, border:`1px solid ${T.border}`, borderRadius:8 }}>
              <div style={{ fontSize:11, fontWeight:700, color:T.text3, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>Best Available Pricing</div>
              {suppliers.slice(0,3).map(s => (
                <div key={s.id} style={{ display:"flex", justifyContent:"space-between", fontSize:12, padding:"4px 0", borderBottom:`1px solid ${T.border}` }}>
                  <span style={{ color:T.text2 }}>{s.is_preferred?"⭐ ":""}{s.supplier_name}</span>
                  <span style={{ color:T.text3 }}>{s.lead_time_days ? `${s.lead_time_days}d lead` : "—"}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: suppliers */}
        <div>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:12 }}>
            <div style={{ fontSize:11, fontWeight:700, color:T.text3, textTransform:"uppercase", letterSpacing:1 }}>
              Suppliers ({suppliers.length})
            </div>
            <button onClick={() => setShowAddSupplier(true)} style={{ fontSize:11, fontWeight:600, padding:"3px 10px", borderRadius:5, background:T.accent, color:"#fff", border:"none", cursor:"pointer" }}>
              + Add Supplier
            </button>
          </div>

          {showAddSupplier && (
            <div style={{ background:T.surface2, border:`1px solid ${T.accent}40`, borderRadius:8, padding:14, marginBottom:14 }}>
              <div style={{ fontSize:12, fontWeight:700, color:T.text, marginBottom:12 }}>New Supplier</div>
              <InlineField label="Supplier Name *" value={newSupplier.supplier_name} onChange={v=>setNewSupplier(p=>({...p,supplier_name:v}))} placeholder="e.g. BASF Corporation" />
              <InlineField label="Contact Email" value={newSupplier.contact_email} onChange={v=>setNewSupplier(p=>({...p,contact_email:v}))} placeholder="contact@supplier.com" />
              <InlineField label="Status" value={newSupplier.status} onChange={v=>setNewSupplier(p=>({...p,status:v}))} options={SUPPLIER_STATUSES.map(s=>({value:s,label:s}))} />
              <div style={{ display:"flex", gap:8 }}>
                <button onClick={()=>setShowAddSupplier(false)} style={{ flex:1, padding:8, fontSize:12, background:T.surface3, color:T.text2, border:`1px solid ${T.border}`, borderRadius:6, cursor:"pointer" }}>Cancel</button>
                <button onClick={addSupplier} disabled={!newSupplier.supplier_name.trim()} style={{ flex:2, padding:8, fontSize:12, fontWeight:600, background:T.accent, color:"#fff", border:"none", borderRadius:6, cursor:"pointer" }}>Add Supplier</button>
              </div>
            </div>
          )}

          {loadingSuppliers ? <div style={{ fontSize:12, color:T.text3 }}>Loading…</div>
          : suppliers.length === 0 ? (
            <div style={{ padding:"24px 0", textAlign:"center", color:T.text3 }}>
              <div style={{ fontSize:28, marginBottom:8 }}>🏭</div>
              <div style={{ fontSize:12 }}>No suppliers yet — add your first supplier to start tracking pricing</div>
            </div>
          ) : suppliers.map(s => (
            <SupplierCard key={s.id} supplier={s} defaultUom={vals.default_uom}
              onUpdate={updated => setSuppliers(p => p.map(x => x.id === updated.id ? updated : x))}
              onDelete={id => setSuppliers(p => p.filter(x => x.id !== id))} />
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Main Library View ─────────────────────────────────────────────────────────
export default function PLMLibraryView() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newItem, setNewItem] = useState({ name:"", ingredient_type:"ingredient", category:"", default_uom:"kg" });
  const [orgId, setOrgId] = useState(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: mem } = await supabase.from("org_memberships").select("org_id").eq("user_id", user.id).maybeSingle();
        if (mem?.org_id) setOrgId(mem.org_id);
        else {
          const { data: prog } = await supabase.from("plm_programs").select("org_id").not("org_id","is",null).limit(1).maybeSingle();
          if (prog?.org_id) setOrgId(prog.org_id);
        }
      }
      const { data } = await supabase.from("plm_ingredient_library").select("*").eq("active", true).order("ingredient_type,name");
      setItems(data || []);
      setLoading(false);
    })();
  }, []);

  const addItem = async () => {
    if (!newItem.name.trim()) return;
    const { data } = await supabase.from("plm_ingredient_library")
      .insert({ ...newItem, org_id: orgId }).select().single();
    if (data) { setItems(p => [...p, data]); setSelected(data); setShowAdd(false); setNewItem({ name:"", ingredient_type:"ingredient", category:"", default_uom:"kg" }); }
  };

  const deleteItem = async (id) => {
    if (!confirm("Archive this ingredient from the library?")) return;
    await supabase.from("plm_ingredient_library").update({ active: false }).eq("id", id);
    setItems(p => p.filter(x => x.id !== id));
    if (selected?.id === id) setSelected(null);
  };

  const categories = [...new Set(items.map(i => i.category).filter(Boolean))].sort();

  const filtered = items.filter(i => {
    const matchType = typeFilter === "all" || i.ingredient_type === typeFilter;
    const matchCat  = categoryFilter === "all" || i.category === categoryFilter;
    const matchSearch = !search || i.name.toLowerCase().includes(search.toLowerCase()) ||
      i.inci_name?.toLowerCase().includes(search.toLowerCase()) ||
      i.cas_number?.toLowerCase().includes(search.toLowerCase()) ||
      i.category?.toLowerCase().includes(search.toLowerCase());
    return matchType && matchCat && matchSearch;
  });

  if (selected) return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>
      <IngredientDetail ingredient={selected} onClose={() => setSelected(null)}
        onUpdate={updated => { setItems(p => p.map(x => x.id === updated.id ? updated : x)); setSelected(updated); }} />
    </div>
  );

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>
      {/* Toolbar */}
      <div style={{ padding:"14px 24px", borderBottom:`1px solid ${T.border}`, display:"flex", alignItems:"center", gap:12, flexShrink:0 }}>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:16, fontWeight:700, color:T.text }}>Ingredient & Supplier Library</div>
          <div style={{ fontSize:11, color:T.text3, marginTop:2 }}>Reusable ingredients, packaging, and supplier pricing — shared across all programs</div>
        </div>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name, INCI, CAS…"
          style={{ fontSize:12, padding:"6px 12px", background:T.surface2, border:`1px solid ${T.border}`, borderRadius:7, color:T.text, width:220, outline:"none" }} />
        <select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)}
          style={{ fontSize:12, padding:"6px 10px", background:T.surface2, border:`1px solid ${T.border}`, borderRadius:7, color:T.text, outline:"none", cursor:"pointer" }}>
          <option value="all">All Types</option>
          <option value="ingredient">Ingredients</option>
          <option value="packaging">Packaging</option>
          <option value="other">Other</option>
        </select>
        {categories.length > 0 && (
          <select value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}
            style={{ fontSize:12, padding:"6px 10px", background:T.surface2, border:`1px solid ${T.border}`, borderRadius:7, color:T.text, outline:"none", cursor:"pointer" }}>
            <option value="all">All Categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        <button onClick={() => setShowAdd(true)} style={{ padding:"6px 14px", fontSize:12, fontWeight:600, background:T.accent, color:"#fff", border:"none", borderRadius:6, cursor:"pointer" }}>
          + Add Item
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div style={{ padding:"14px 24px", background:T.surface2, borderBottom:`1px solid ${T.accent}40`, flexShrink:0 }}>
          <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr auto", gap:12, alignItems:"end" }}>
            <div>
              <div style={{ fontSize:11, color:T.text3, marginBottom:4, fontWeight:600 }}>Name *</div>
              <input value={newItem.name} onChange={e=>setNewItem(p=>({...p,name:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&addItem()} placeholder="e.g. Retinol, HDPE Bottle 8oz" style={{ width:"100%", fontSize:13, background:T.surface, border:`1px solid ${T.border}`, borderRadius:6, padding:"7px 10px", color:T.text, outline:"none" }} />
            </div>
            {[
              {label:"Type",key:"ingredient_type",opts:INGREDIENT_TYPES},
              {label:"Category",key:"category",opts:CATEGORIES.map(c=>({value:c,label:c}))},
              {label:"Default UOM",key:"default_uom",opts:UOM_OPTIONS.map(u=>({value:u,label:u}))},
            ].map(f=>(
              <div key={f.key}>
                <div style={{ fontSize:11, color:T.text3, marginBottom:4, fontWeight:600 }}>{f.label}</div>
                <select value={newItem[f.key]||""} onChange={e=>setNewItem(p=>({...p,[f.key]:e.target.value}))} style={{ width:"100%", fontSize:12, background:T.surface, border:`1px solid ${T.border}`, borderRadius:6, padding:"7px 8px", color:T.text, outline:"none", cursor:"pointer" }}>
                  <option value="">—</option>
                  {f.opts.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            ))}
            <div style={{ display:"flex", gap:6 }}>
              <button onClick={()=>setShowAdd(false)} style={{ padding:"7px 10px", fontSize:12, background:T.surface3, color:T.text2, border:`1px solid ${T.border}`, borderRadius:6, cursor:"pointer" }}>Cancel</button>
              <button onClick={addItem} disabled={!newItem.name.trim()} style={{ padding:"7px 14px", fontSize:12, fontWeight:600, background:T.accent, color:"#fff", border:"none", borderRadius:6, cursor:"pointer" }}>Add</button>
            </div>
          </div>
        </div>
      )}

      {/* Stats bar */}
      <div style={{ display:"flex", gap:0, borderBottom:`1px solid ${T.border}`, padding:"0 24px", flexShrink:0, background:T.surface }}>
        {[
          { label:"Total Items",    val:items.length },
          { label:"Ingredients",    val:items.filter(i=>i.ingredient_type==="ingredient").length },
          { label:"Packaging",      val:items.filter(i=>i.ingredient_type==="packaging").length },
          { label:"Showing",        val:filtered.length },
        ].map(k=>(
          <div key={k.label} style={{ padding:"10px 20px", borderRight:`1px solid ${T.border}` }}>
            <div style={{ fontSize:16, fontWeight:700, color:T.text }}>{k.val}</div>
            <div style={{ fontSize:11, color:T.text3 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* List */}
      <div style={{ flex:1, overflow:"auto" }}>
        {loading ? <div style={{ padding:40, textAlign:"center", color:T.text3 }}>Loading library…</div>
        : filtered.length === 0 ? (
          <div style={{ padding:"60px 0", textAlign:"center", color:T.text3 }}>
            <div style={{ fontSize:40, marginBottom:12 }}>🧪</div>
            <div style={{ fontSize:15, fontWeight:600, marginBottom:8 }}>
              {items.length === 0 ? "Your library is empty" : "No items match your search"}
            </div>
            <div style={{ fontSize:13, maxWidth:420, margin:"0 auto", lineHeight:1.7 }}>
              {items.length === 0
                ? "Add ingredients, packaging, and other materials to the library. Once added, they can be quickly pulled into any PLM program's formula and sourcing."
                : "Try adjusting your search or filters"}
            </div>
          </div>
        ) : (
          <table style={{ width:"100%", borderCollapse:"collapse" }}>
            <thead>
              <tr style={{ borderBottom:`2px solid ${T.border}`, position:"sticky", top:0, background:T.surface, zIndex:1 }}>
                {["Name","INCI Name","Category","Type","UOM","Suppliers","CAS #",""].map(h=>(
                  <th key={h} style={{ padding:"9px 16px", textAlign:"left", fontSize:10, fontWeight:700, color:T.text3, textTransform:"uppercase", letterSpacing:0.5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, idx) => (
                <tr key={item.id} onClick={()=>setSelected(item)}
                  style={{ borderBottom:`1px solid ${T.border}`, cursor:"pointer", background:idx%2===0?"transparent":T.surface2+"50" }}
                  onMouseEnter={e=>e.currentTarget.style.background=T.surface2}
                  onMouseLeave={e=>e.currentTarget.style.background=idx%2===0?"transparent":T.surface2+"50"}>
                  <td style={{ padding:"11px 16px", fontSize:13, fontWeight:600, color:T.text }}>{item.name}</td>
                  <td style={{ padding:"11px 16px", fontSize:12, color:T.text2 }}>{item.inci_name||"—"}</td>
                  <td style={{ padding:"11px 16px", fontSize:12, color:T.text3 }}>{item.category||"—"}</td>
                  <td style={{ padding:"11px 16px" }}>
                    <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:4,
                      background:item.ingredient_type==="packaging"?"#8b5cf620":"#3b82f620",
                      color:item.ingredient_type==="packaging"?"#8b5cf6":"#3b82f6" }}>
                      {item.ingredient_type}
                    </span>
                  </td>
                  <td style={{ padding:"11px 16px", fontSize:12, color:T.text3 }}>{item.default_uom||"—"}</td>
                  <td style={{ padding:"11px 16px", fontSize:12, color:T.text3 }}>
                    <SupplierCount ingredientId={item.id} />
                  </td>
                  <td style={{ padding:"11px 16px", fontSize:11, color:T.text3 }}>{item.cas_number||"—"}</td>
                  <td style={{ padding:"11px 16px" }}>
                    <button onClick={e=>{e.stopPropagation();deleteItem(item.id);}} style={{ background:"none", border:"none", color:T.text3, cursor:"pointer", fontSize:11, opacity:0.5 }}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// Lazy supplier count to avoid N+1 on the list
const supplierCounts = {};
function SupplierCount({ ingredientId }) {
  const [count, setCount] = useState(supplierCounts[ingredientId]);
  useEffect(() => {
    if (count != null) return;
    supabase.from("plm_ingredient_suppliers").select("id", { count:"exact", head:true }).eq("ingredient_id", ingredientId)
      .then(({ count: c }) => { supplierCounts[ingredientId]=c||0; setCount(c||0); });
  }, [ingredientId]);
  if (count == null) return <span style={{ color:T.border }}>—</span>;
  return <span style={{ color: count>0?T.text:T.text3, fontWeight:count>0?600:400 }}>{count} {count===1?"supplier":"suppliers"}</span>;
}
