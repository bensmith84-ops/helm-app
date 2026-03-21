"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";
import { useAuth } from "../lib/auth";
import { useResponsive } from "../lib/responsive";

// ═══════════════════════════════════════════════════════════════════════════════
// ERP MODULE — Products, Suppliers, POs, Inventory, Orders, Customers, Mfg, Facilities
// ═══════════════════════════════════════════════════════════════════════════════

const fmt = n => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n || 0);
const fmtN = n => new Intl.NumberFormat("en-US").format(n || 0);

const NAV = [
  { id: "products", label: "Products", icon: "📦", badge: null },
  { id: "suppliers", label: "Suppliers", icon: "🏭", badge: null },
  { id: "purchase_orders", label: "Purchase Orders", icon: "📋", badge: null },
  { id: "inventory", label: "Inventory", icon: "📊", badge: null },
  { id: "orders", label: "Orders", icon: "🛒", badge: null },
  { id: "customers", label: "Customers", icon: "👥", badge: null },
  { id: "manufacturing", label: "Manufacturing", icon: "⚙", badge: null },
  { id: "facilities", label: "Facilities", icon: "🏢", badge: null },
];

const STATUS_PILL = {
  active: { bg: "#D1FAE520", color: "#065F46" }, development: { bg: "#EFF6FF20", color: "#1D4ED8" },
  discontinued: { bg: "#FEE2E220", color: "#991B1B" }, archived: { bg: T.surface2, color: T.text3 },
  draft: { bg: T.surface2, color: T.text3 }, submitted: { bg: "#FEF3C720", color: "#92400E" },
  confirmed: { bg: "#EFF6FF20", color: "#1D4ED8" }, partially_received: { bg: "#FEF3C720", color: "#92400E" },
  received: { bg: "#D1FAE520", color: "#065F46" }, closed: { bg: T.surface2, color: T.text3 },
  cancelled: { bg: "#FEE2E220", color: "#991B1B" },
  pending: { bg: "#FEF3C720", color: "#92400E" }, processing: { bg: "#EFF6FF20", color: "#1D4ED8" },
  shipped: { bg: "#D1FAE520", color: "#065F46" }, delivered: { bg: "#D1FAE520", color: "#065F46" },
  planned: { bg: T.surface2, color: T.text3 }, released: { bg: "#EFF6FF20", color: "#1D4ED8" },
  in_progress: { bg: "#FEF3C720", color: "#92400E" }, completed: { bg: "#D1FAE520", color: "#065F46" },
};

const Pill = ({ status }) => {
  const s = STATUS_PILL[status] || STATUS_PILL.active;
  return <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 10, background: s.bg, color: s.color, textTransform: "capitalize", whiteSpace: "nowrap" }}>{(status || "").replace(/_/g, " ")}</span>;
};

const Card = ({ children, style = {}, onClick }) => (
  <div onClick={onClick} style={{ background: T.surface, borderRadius: 10, border: `1px solid ${T.border}`, padding: 16, cursor: onClick ? "pointer" : "default", position: "relative", ...style }}>{children}</div>
);

const EmptyState = ({ icon, text }) => (
  <div style={{ textAlign: "center", padding: 40, color: T.text3 }}>
    <div style={{ fontSize: 36, marginBottom: 8 }}>{icon}</div>
    <div style={{ fontSize: 13 }}>{text}</div>
  </div>
);

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════════════
export default function ERPView() {
  const { user, profile } = useAuth();
  const { isMobile } = useResponsive();
  const [view, setView] = useState("products");
  const [loading, setLoading] = useState(true);

  // Core data
  const [products, setProducts] = useState([]);
  const [variants, setVariants] = useState([]);
  const [boms, setBoms] = useState([]);
  const [bomItems, setBomItems] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [supplierContacts, setSupplierContacts] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [lots, setLots] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [poItems, setPoItems] = useState([]);
  const [orders, setOrders] = useState([]);
  const [orderItems, setOrderItems] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);

  useEffect(() => {
    const load = async () => {
      const [
        { data: prods }, { data: vars }, { data: bm }, { data: bi },
        { data: sups }, { data: facs }, { data: inv }, { data: lt },
        { data: pos }, { data: pois }, { data: ords }, { data: ois },
        { data: custs }, { data: wos },
      ] = await Promise.all([
        supabase.from("erp_products").select("*").order("name"),
        supabase.from("erp_product_variants").select("*").order("sku"),
        supabase.from("erp_bom").select("*").order("created_at"),
        supabase.from("erp_bom_items").select("*").order("sort_order"),
        supabase.from("erp_suppliers").select("*").order("name"),
        supabase.from("erp_facilities").select("*").order("name"),
        supabase.from("erp_inventory").select("*"),
        supabase.from("erp_inventory_lots").select("*").order("created_at", { ascending: false }),
        supabase.from("erp_purchase_orders").select("*").order("created_at", { ascending: false }),
        supabase.from("erp_po_items").select("*"),
        supabase.from("erp_orders").select("*").order("order_date", { ascending: false }),
        supabase.from("erp_order_items").select("*"),
        supabase.from("erp_customers").select("*").order("name"),
        supabase.from("erp_work_orders").select("*").order("created_at", { ascending: false }),
      ]);
      setProducts(prods || []); setVariants(vars || []); setBoms(bm || []); setBomItems(bi || []);
      setSuppliers(sups || []); setFacilities(facs || []); setInventory(inv || []); setLots(lt || []);
      setPurchaseOrders(pos || []); setPoItems(pois || []); setOrders(ords || []); setOrderItems(ois || []);
      setCustomers(custs || []); setWorkOrders(wos || []);
      setLoading(false);
    };
    if (user) load();
  }, [user]);

  // Derived
  const finishedGoods = products.filter(p => p.product_type === "finished_good");
  const rawMaterials = products.filter(p => p.product_type === "raw_material");
  const packaging = products.filter(p => p.product_type === "packaging");
  const totalStock = inventory.reduce((s, i) => s + (i.quantity || 0), 0);
  const openPOs = purchaseOrders.filter(p => !["received", "closed", "cancelled"].includes(p.status));
  const pendingOrders = orders.filter(o => o.fulfillment_status !== "fulfilled" && o.status !== "cancelled");

  if (loading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: T.text3, fontSize: 13 }}>Loading ERP…</div>;

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Left nav — desktop */}
      {!isMobile && (
        <div style={{ width: 180, borderRight: `1px solid ${T.border}`, padding: "12px 8px", flexShrink: 0, overflow: "auto" }}>
          {NAV.map(n => (
            <button key={n.id} onClick={() => setView(n.id)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: view === n.id ? T.accentDim : "transparent", border: "none", borderRadius: 6, cursor: "pointer", color: view === n.id ? T.accent : T.text3, fontSize: 12, fontWeight: view === n.id ? 700 : 500, textAlign: "left", marginBottom: 2 }}>
              <span style={{ fontSize: 13 }}>{n.icon}</span>{n.label}
            </button>
          ))}
        </div>
      )}

      {/* Content column */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        {/* Mobile tab bar */}
        {isMobile && (
          <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${T.border}`, overflowX: "auto", flexShrink: 0, background: T.bg, WebkitOverflowScrolling: "touch" }}>
            {NAV.map(n => (
              <button key={n.id} onClick={() => setView(n.id)}
                style={{ padding: "10px 14px", background: "none", border: "none", borderBottom: view === n.id ? `2px solid ${T.accent}` : "2px solid transparent", cursor: "pointer", color: view === n.id ? T.accent : T.text3, fontSize: 18, fontWeight: 600, whiteSpace: "nowrap" }}>
                {n.icon}
              </button>
            ))}
          </div>
        )}

        {/* Scrollable content */}
        <div style={{ flex: 1, overflow: "auto", padding: isMobile ? "10px 10px 20px" : "20px 24px" }}>
          {view === "products" && <ProductsView products={products} setProducts={setProducts} variants={variants} setVariants={setVariants} boms={boms} setBoms={setBoms} bomItems={bomItems} setBomItems={setBomItems} inventory={inventory} isMobile={isMobile} />}
          {view === "suppliers" && <SuppliersView suppliers={suppliers} setSuppliers={setSuppliers} isMobile={isMobile} />}
          {view === "purchase_orders" && <PurchaseOrdersView purchaseOrders={purchaseOrders} setPurchaseOrders={setPurchaseOrders} poItems={poItems} setPoItems={setPoItems} suppliers={suppliers} facilities={facilities} variants={variants} products={products} isMobile={isMobile} />}
          {view === "inventory" && <InventoryView inventory={inventory} setInventory={setInventory} lots={lots} variants={variants} products={products} facilities={facilities} isMobile={isMobile} />}
          {view === "orders" && <OrdersView orders={orders} setOrders={setOrders} orderItems={orderItems} customers={customers} isMobile={isMobile} />}
          {view === "customers" && <CustomersView customers={customers} setCustomers={setCustomers} orders={orders} isMobile={isMobile} />}
          {view === "manufacturing" && <ManufacturingView workOrders={workOrders} setWorkOrders={setWorkOrders} variants={variants} facilities={facilities} boms={boms} isMobile={isMobile} />}
          {view === "facilities" && <FacilitiesView facilities={facilities} setFacilities={setFacilities} inventory={inventory} isMobile={isMobile} />}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRODUCTS VIEW — SKU master, variants, BOMs
// ═══════════════════════════════════════════════════════════════════════════════
function ProductsView({ products, setProducts, variants, setVariants, boms, setBoms, bomItems, setBomItems, inventory, isMobile }) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", category: "laundry", product_type: "finished_good", brand: "Earth Breeze", status: "active" });

  const filtered = products.filter(p => {
    if (typeFilter !== "all" && p.product_type !== typeFilter) return false;
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) && !p.category?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const saveProduct = async () => {
    if (!form.name.trim()) return;
    if (selected) {
      const { data } = await supabase.from("erp_products").update(form).eq("id", selected.id).select().single();
      if (data) { setProducts(p => p.map(x => x.id === data.id ? data : x)); setSelected(data); }
    } else {
      const { data } = await supabase.from("erp_products").insert(form).select().single();
      if (data) { setProducts(p => [...p, data]); setSelected(data); }
    }
    setShowNew(false);
  };

  const deleteProduct = async (id) => {
    if (!window.confirm("Delete this product and all its variants?")) return;
    await supabase.from("erp_products").delete().eq("id", id);
    setProducts(p => p.filter(x => x.id !== id));
    setVariants(v => v.filter(x => x.product_id !== id));
    if (selected?.id === id) setSelected(null);
  };

  // Variant CRUD
  const [showVariantForm, setShowVariantForm] = useState(false);
  const [varForm, setVarForm] = useState({ sku: "", name: "", size: "", barcode: "", case_pack: 24, cost: "", wholesale_price: "", msrp: "", shelf_life_days: 730, storage_requirements: "cool_dry" });

  const saveVariant = async () => {
    if (!varForm.sku.trim() || !selected) return;
    const payload = { ...varForm, product_id: selected.id, cost: parseFloat(varForm.cost) || 0, wholesale_price: parseFloat(varForm.wholesale_price) || 0, msrp: parseFloat(varForm.msrp) || 0, case_pack: parseInt(varForm.case_pack) || 24, shelf_life_days: parseInt(varForm.shelf_life_days) || 730 };
    const { data } = await supabase.from("erp_product_variants").insert(payload).select().single();
    if (data) setVariants(p => [...p, data]);
    setShowVariantForm(false);
    setVarForm({ sku: "", name: "", size: "", barcode: "", case_pack: 24, cost: "", wholesale_price: "", msrp: "", shelf_life_days: 730, storage_requirements: "cool_dry" });
  };

  const prodVariants = selected ? variants.filter(v => v.product_id === selected.id) : [];
  const prodStock = selected ? inventory.filter(i => prodVariants.some(v => v.id === i.variant_id)).reduce((s, i) => s + (i.quantity || 0), 0) : 0;

  const TYPE_ICONS = { finished_good: "📦", raw_material: "🧪", packaging: "📋", component: "🔧", service: "🛠" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div><div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>Products</div><div style={{ fontSize: 12, color: T.text3 }}>{products.length} products · {variants.length} SKUs</div></div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" style={{ padding: "6px 12px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, width: isMobile ? 120 : 180, outline: "none" }} />
          <button onClick={() => { setForm({ name: "", description: "", category: "laundry", product_type: "finished_good", brand: "Earth Breeze", status: "active" }); setSelected(null); setShowNew(true); }}
            style={{ padding: "6px 14px", fontSize: 12, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>+ Product</button>
        </div>
      </div>

      {/* Type filter pills */}
      <div style={{ display: "flex", gap: 3, background: T.surface2, borderRadius: 7, padding: 2, flexWrap: "wrap" }}>
        {[["all", "All"], ["finished_good", "📦 Finished"], ["raw_material", "🧪 Raw Material"], ["packaging", "📋 Packaging"]].map(([v, l]) => (
          <button key={v} onClick={() => setTypeFilter(v)} style={{ padding: "4px 10px", borderRadius: 5, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, background: typeFilter === v ? T.surface : "transparent", color: typeFilter === v ? T.text : T.text3 }}>{l}</button>
        ))}
      </div>

      {/* Product list + detail split */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : selected ? "1fr 1fr" : "1fr", gap: 16 }}>
        {/* Product cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.length === 0 && <EmptyState icon="📦" text="No products found" />}
          {filtered.map(p => {
            const pVars = variants.filter(v => v.product_id === p.id);
            const pStock = inventory.filter(i => pVars.some(v => v.id === i.variant_id)).reduce((s, i) => s + (i.quantity || 0), 0);
            const sel = selected?.id === p.id;
            return (
              <Card key={p.id} onClick={() => setSelected(p)} style={{ borderLeft: sel ? `3px solid ${T.accent}` : `3px solid transparent`, padding: "12px 14px", cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 20 }}>{TYPE_ICONS[p.product_type] || "📦"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
                    <div style={{ fontSize: 11, color: T.text3, display: "flex", gap: 8, marginTop: 2, flexWrap: "wrap" }}>
                      <span>{pVars.length} SKU{pVars.length !== 1 ? "s" : ""}</span>
                      <span>{fmtN(pStock)} in stock</span>
                      {p.brand && p.brand !== "N/A" && <span>{p.brand}</span>}
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    <Pill status={p.status} />
                    <span style={{ fontSize: 10, color: T.text3, textTransform: "capitalize" }}>{(p.category || "").replace(/_/g, " ")}</span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Detail panel */}
        {selected && !isMobile && (
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20, overflow: "auto", maxHeight: "calc(100vh - 200px)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>{selected.name}</div>
                <div style={{ fontSize: 12, color: T.text3, marginTop: 2 }}>{selected.product_type?.replace(/_/g, " ")} · {selected.category}</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => { setForm(selected); setShowNew(true); }} style={{ padding: "5px 10px", fontSize: 11, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text2, cursor: "pointer" }}>Edit</button>
                <button onClick={() => deleteProduct(selected.id)} style={{ padding: "5px 10px", fontSize: 11, background: "#FEE2E2", border: "1px solid #FECACA", borderRadius: 6, color: "#991B1B", cursor: "pointer" }}>Delete</button>
              </div>
            </div>

            {selected.description && <div style={{ fontSize: 12, color: T.text2, lineHeight: 1.6, marginBottom: 16, padding: "8px 12px", background: T.surface2, borderRadius: 8 }}>{selected.description}</div>}

            {/* KPI row */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
              {[{ l: "SKUs", v: prodVariants.length, c: T.accent }, { l: "Total Stock", v: fmtN(prodStock), c: "#10B981" }, { l: "Avg Cost", v: prodVariants.length > 0 ? fmt(prodVariants.reduce((s, v) => s + (v.cost || 0), 0) / prodVariants.length) : "—", c: "#F59E0B" }].map(s => (
                <div key={s.l} style={{ textAlign: "center", padding: 10, background: T.surface2, borderRadius: 8 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: s.c }}>{s.v}</div>
                  <div style={{ fontSize: 10, color: T.text3 }}>{s.l}</div>
                </div>
              ))}
            </div>

            {/* Variants table */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>SKU Variants</div>
                <button onClick={() => setShowVariantForm(true)} style={{ padding: "4px 10px", fontSize: 11, fontWeight: 600, background: T.accentDim, color: T.accent, border: `1px solid ${T.accent}30`, borderRadius: 6, cursor: "pointer" }}>+ Variant</button>
              </div>
              {prodVariants.length === 0 ? <div style={{ fontSize: 12, color: T.text3, padding: 12, textAlign: "center" }}>No variants yet</div> :
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead><tr style={{ borderBottom: `2px solid ${T.border}` }}>
                      {["SKU", "Name", "Size", "Cost", "Wholesale", "MSRP", "Case Pack"].map(h => <th key={h} style={{ textAlign: "left", padding: "6px 8px", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase" }}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {prodVariants.map(v => (
                        <tr key={v.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                          <td style={{ padding: "8px", fontWeight: 700, color: T.accent, fontFamily: "monospace", fontSize: 11 }}>{v.sku}</td>
                          <td style={{ padding: "8px", color: T.text }}>{v.name}</td>
                          <td style={{ padding: "8px", color: T.text3 }}>{v.size}</td>
                          <td style={{ padding: "8px", fontWeight: 600 }}>{fmt(v.cost)}</td>
                          <td style={{ padding: "8px" }}>{fmt(v.wholesale_price)}</td>
                          <td style={{ padding: "8px" }}>{fmt(v.msrp)}</td>
                          <td style={{ padding: "8px", color: T.text3 }}>{v.case_pack}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              }
            </div>

            {/* Tags */}
            {(selected.tags || []).length > 0 && (
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {selected.tags.map(t => <span key={t} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: T.surface2, color: T.text3, fontWeight: 600 }}>{t}</span>)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Mobile detail modal */}
      {selected && isMobile && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 1000 }} onClick={() => setSelected(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: "16px 16px 0 0", width: "100%", maxHeight: "85vh", overflow: "auto", padding: 16 }}>
            <div style={{ width: 32, height: 4, borderRadius: 2, background: T.border, margin: "0 auto 12px" }} />
            <div style={{ fontSize: 16, fontWeight: 800, color: T.text, marginBottom: 4 }}>{selected.name}</div>
            <div style={{ fontSize: 12, color: T.text3, marginBottom: 12 }}>{selected.product_type?.replace(/_/g, " ")} · {selected.category} · {prodVariants.length} SKUs · {fmtN(prodStock)} in stock</div>
            {prodVariants.map(v => (
              <div key={v.id} style={{ padding: "10px 0", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between" }}>
                <div><div style={{ fontSize: 12, fontWeight: 600, fontFamily: "monospace", color: T.accent }}>{v.sku}</div><div style={{ fontSize: 11, color: T.text3 }}>{v.name}</div></div>
                <div style={{ textAlign: "right" }}><div style={{ fontSize: 12, fontWeight: 700 }}>{fmt(v.cost)}</div><div style={{ fontSize: 10, color: T.text3 }}>MSRP {fmt(v.msrp)}</div></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* New/Edit Product Modal */}
      {showNew && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowNew(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: 14, padding: isMobile ? 14 : 24, width: "min(520px, 95vw)", maxHeight: "85vh", overflow: "auto" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 16 }}>{selected ? "Edit Product" : "New Product"}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Name *</div><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={{ width: "100%", padding: "8px 12px", fontSize: 13, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, outline: "none", boxSizing: "border-box" }} /></div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Type</div><select value={form.product_type} onChange={e => setForm(f => ({ ...f, product_type: e.target.value }))} style={{ width: "100%", padding: "8px 12px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, boxSizing: "border-box" }}>{["finished_good", "raw_material", "packaging", "component", "service"].map(t => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}</select></div>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Category</div><select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} style={{ width: "100%", padding: "8px 12px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, boxSizing: "border-box" }}>{["laundry", "dish", "floor", "fabric_care", "component", "raw_material", "packaging"].map(c => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}</select></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Brand</div><input value={form.brand || ""} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} style={{ width: "100%", padding: "8px 12px", fontSize: 13, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, outline: "none", boxSizing: "border-box" }} /></div>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Status</div><select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} style={{ width: "100%", padding: "8px 12px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, boxSizing: "border-box" }}>{["active", "development", "discontinued", "archived"].map(s => <option key={s} value={s}>{s}</option>)}</select></div>
              </div>
              <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Description</div><textarea value={form.description || ""} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} style={{ width: "100%", padding: "8px 12px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, outline: "none", resize: "vertical", boxSizing: "border-box" }} /></div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => setShowNew(false)} style={{ padding: "8px 16px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text3, cursor: "pointer" }}>Cancel</button>
                <button onClick={saveProduct} disabled={!form.name.trim()} style={{ padding: "8px 16px", fontSize: 12, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", opacity: !form.name.trim() ? 0.5 : 1 }}>{selected ? "Save" : "Create"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* New Variant Modal */}
      {showVariantForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowVariantForm(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: 14, padding: isMobile ? 14 : 24, width: "min(520px, 95vw)", maxHeight: "85vh", overflow: "auto" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 16 }}>New Variant for {selected?.name}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>SKU *</div><input value={varForm.sku} onChange={e => setVarForm(f => ({ ...f, sku: e.target.value }))} placeholder="EB-LS-60-FS" style={{ width: "100%", padding: "8px 12px", fontSize: 13, fontFamily: "monospace", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, outline: "none", boxSizing: "border-box" }} /></div>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Name *</div><input value={varForm.name} onChange={e => setVarForm(f => ({ ...f, name: e.target.value }))} placeholder="60ct Fresh Scent" style={{ width: "100%", padding: "8px 12px", fontSize: 13, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, outline: "none", boxSizing: "border-box" }} /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 10 }}>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Size</div><input value={varForm.size} onChange={e => setVarForm(f => ({ ...f, size: e.target.value }))} placeholder="60ct" style={{ width: "100%", padding: "8px 12px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, outline: "none", boxSizing: "border-box" }} /></div>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Barcode</div><input value={varForm.barcode} onChange={e => setVarForm(f => ({ ...f, barcode: e.target.value }))} placeholder="UPC" style={{ width: "100%", padding: "8px 12px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, outline: "none", boxSizing: "border-box" }} /></div>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Case Pack</div><input type="number" value={varForm.case_pack} onChange={e => setVarForm(f => ({ ...f, case_pack: e.target.value }))} style={{ width: "100%", padding: "8px 12px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, outline: "none", boxSizing: "border-box" }} /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Cost</div><input type="number" step="0.01" value={varForm.cost} onChange={e => setVarForm(f => ({ ...f, cost: e.target.value }))} placeholder="3.20" style={{ width: "100%", padding: "8px 12px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, outline: "none", boxSizing: "border-box" }} /></div>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Wholesale</div><input type="number" step="0.01" value={varForm.wholesale_price} onChange={e => setVarForm(f => ({ ...f, wholesale_price: e.target.value }))} placeholder="8.99" style={{ width: "100%", padding: "8px 12px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, outline: "none", boxSizing: "border-box" }} /></div>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>MSRP</div><input type="number" step="0.01" value={varForm.msrp} onChange={e => setVarForm(f => ({ ...f, msrp: e.target.value }))} placeholder="14.99" style={{ width: "100%", padding: "8px 12px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, outline: "none", boxSizing: "border-box" }} /></div>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => setShowVariantForm(false)} style={{ padding: "8px 16px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text3, cursor: "pointer" }}>Cancel</button>
                <button onClick={saveVariant} disabled={!varForm.sku.trim()} style={{ padding: "8px 16px", fontSize: 12, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", opacity: !varForm.sku.trim() ? 0.5 : 1 }}>Create Variant</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUPPLIERS VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function SuppliersView({ suppliers, setSuppliers, isMobile }) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const filtered = suppliers.filter(s => {
    if (typeFilter !== "all" && s.supplier_type !== typeFilter) return false;
    if (search && !s.name.toLowerCase().includes(search.toLowerCase()) && !s.code?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const TYPE_ICONS = { raw_material: "🧪", packaging: "📋", contract_manufacturer: "🏭", "3pl": "🚚", service: "🛠", white_label: "📦" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div><div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>Suppliers</div><div style={{ fontSize: 12, color: T.text3 }}>{suppliers.length} vendors</div></div>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" style={{ padding: "6px 12px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, width: isMobile ? 140 : 200, outline: "none" }} />
      </div>
      <div style={{ display: "flex", gap: 3, background: T.surface2, borderRadius: 7, padding: 2, flexWrap: "wrap" }}>
        {[["all", "All"], ["raw_material", "🧪 Raw"], ["packaging", "📋 Pack"], ["contract_manufacturer", "🏭 CM"], ["3pl", "🚚 3PL"]].map(([v, l]) => (
          <button key={v} onClick={() => setTypeFilter(v)} style={{ padding: "4px 10px", borderRadius: 5, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, background: typeFilter === v ? T.surface : "transparent", color: typeFilter === v ? T.text : T.text3 }}>{l}</button>
        ))}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
        {filtered.map(s => (
          <Card key={s.id} style={{ padding: "12px 14px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 20 }}>{TYPE_ICONS[s.supplier_type] || "🏢"}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{s.name}</span>{s.code && <span style={{ fontSize: 10, fontFamily: "monospace", color: T.text3, background: T.surface2, padding: "1px 5px", borderRadius: 3 }}>{s.code}</span>}</div>
                <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>{s.supplier_type?.replace(/_/g, " ")} · {s.country}{s.lead_time_days ? ` · ${s.lead_time_days}d lead` : ""}{s.payment_terms ? ` · ${s.payment_terms.replace(/_/g, " ")}` : ""}</div>
              </div>
              <div style={{ display: "flex", gap: 2 }}>{[1,2,3,4,5].map(i => <span key={i} style={{ fontSize: 10, color: i <= (s.rating || 0) ? "#F59E0B" : T.border }}>★</span>)}</div>
            </div>
            {(s.certifications || []).length > 0 && (
              <div style={{ display: "flex", gap: 3, marginTop: 8, flexWrap: "wrap" }}>
                {s.certifications.map(c => <span key={c} style={{ fontSize: 9, padding: "1px 6px", borderRadius: 8, background: "#D1FAE520", color: "#065F46", fontWeight: 600 }}>{c}</span>)}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PURCHASE ORDERS VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function PurchaseOrdersView({ purchaseOrders, setPurchaseOrders, poItems, setPoItems, suppliers, facilities, variants, products, isMobile }) {
  const [statusFilter, setStatusFilter] = useState("all");
  const filtered = purchaseOrders.filter(po => statusFilter === "all" || po.status === statusFilter);
  const getSupplier = id => suppliers.find(s => s.id === id);
  const getFacility = id => facilities.find(f => f.id === id);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div><div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>Purchase Orders</div><div style={{ fontSize: 12, color: T.text3 }}>{purchaseOrders.length} POs · {purchaseOrders.filter(p => !["received","closed","cancelled"].includes(p.status)).length} open</div></div>
      </div>
      <div style={{ display: "flex", gap: 3, background: T.surface2, borderRadius: 7, padding: 2, flexWrap: "wrap" }}>
        {[["all","All"],["draft","Draft"],["submitted","Submitted"],["confirmed","Confirmed"],["partially_received","Partial"],["received","Received"]].map(([v,l]) => (
          <button key={v} onClick={() => setStatusFilter(v)} style={{ padding: "4px 10px", borderRadius: 5, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, background: statusFilter === v ? T.surface : "transparent", color: statusFilter === v ? T.text : T.text3 }}>{l}</button>
        ))}
      </div>
      {filtered.length === 0 ? <EmptyState icon="📋" text="No purchase orders found" /> :
        filtered.map(po => {
          const sup = getSupplier(po.supplier_id);
          const fac = getFacility(po.facility_id);
          return (
            <Card key={po.id} style={{ padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 800, fontFamily: "monospace", color: T.accent }}>{po.po_number}</span>
                    <Pill status={po.status} />
                  </div>
                  <div style={{ fontSize: 12, color: T.text3, marginTop: 4 }}>{sup?.name || "Unknown"}{fac ? ` → ${fac.name}` : ""}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>{fmt(po.total)}</div>
                  <div style={{ fontSize: 10, color: T.text3 }}>{po.expected_date ? `ETA ${new Date(po.expected_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}</div>
                </div>
              </div>
              {po.notes && <div style={{ fontSize: 11, color: T.text3, padding: "6px 0", borderTop: `1px solid ${T.border}` }}>{po.notes}</div>}
            </Card>
          );
        })
      }
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// INVENTORY VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function InventoryView({ inventory, setInventory, lots, variants, products, facilities, isMobile }) {
  const [groupBy, setGroupBy] = useState("sku");
  const getVariant = id => variants.find(v => v.id === id);
  const getProduct = id => products.find(p => p.id === id);
  const getFacility = id => facilities.find(f => f.id === id);
  const getLot = id => lots.find(l => l.id === id);

  // Aggregate by SKU
  const bySku = {};
  inventory.forEach(inv => {
    const v = getVariant(inv.variant_id);
    const key = v?.sku || inv.product_id || "unknown";
    if (!bySku[key]) bySku[key] = { sku: v?.sku || "—", name: v?.name || getProduct(inv.product_id)?.name || "Unknown", total: 0, facilities: {}, lots: new Set() };
    bySku[key].total += inv.quantity || 0;
    const fName = getFacility(inv.facility_id)?.name || "Unknown";
    bySku[key].facilities[fName] = (bySku[key].facilities[fName] || 0) + (inv.quantity || 0);
    if (inv.lot_id) bySku[key].lots.add(inv.lot_id);
  });
  const skuList = Object.values(bySku).sort((a, b) => b.total - a.total);
  const totalUnits = inventory.reduce((s, i) => s + (i.quantity || 0), 0);
  const totalSKUs = new Set(inventory.map(i => i.variant_id).filter(Boolean)).size;
  const expiringLots = lots.filter(l => l.expiry_date && new Date(l.expiry_date) < new Date(Date.now() + 90 * 86400000) && l.status === "available");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div><div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>Inventory</div><div style={{ fontSize: 12, color: T.text3 }}>{fmtN(totalUnits)} units across {facilities.length} facilities</div></div>
      </div>

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 8 }}>
        {[{ l: "Total Units", v: fmtN(totalUnits), c: T.accent }, { l: "Active SKUs", v: totalSKUs, c: "#10B981" }, { l: "Active Lots", v: lots.filter(l => l.status === "available").length, c: "#3B82F6" }, { l: "Expiring <90d", v: expiringLots.length, c: expiringLots.length > 0 ? "#EF4444" : T.text3 }].map(s => (
          <Card key={s.l} style={{ textAlign: "center", padding: 12 }}>
            <div style={{ fontSize: 22, fontWeight: 900, color: s.c }}>{s.v}</div>
            <div style={{ fontSize: 10, color: T.text3 }}>{s.l}</div>
          </Card>
        ))}
      </div>

      {/* Inventory by SKU */}
      {skuList.map(item => (
        <Card key={item.sku} style={{ padding: "12px 14px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <div><span style={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace", color: T.accent }}>{item.sku}</span><span style={{ fontSize: 12, color: T.text, marginLeft: 8 }}>{item.name}</span></div>
            <div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>{fmtN(item.total)}</div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {Object.entries(item.facilities).map(([fName, qty]) => (
              <span key={fName} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 8, background: T.surface2, color: T.text3, fontWeight: 600 }}>{fName}: {fmtN(qty)}</span>
            ))}
            <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 8, background: "#EFF6FF20", color: "#1D4ED8", fontWeight: 600 }}>{item.lots.size} lot{item.lots.size !== 1 ? "s" : ""}</span>
          </div>
        </Card>
      ))}
      {skuList.length === 0 && <EmptyState icon="📊" text="No inventory records" />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ORDERS VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function OrdersView({ orders, setOrders, orderItems, customers, isMobile }) {
  const [channelFilter, setChannelFilter] = useState("all");
  const filtered = orders.filter(o => channelFilter === "all" || o.channel === channelFilter);
  const getCustomer = id => customers.find(c => c.id === id);
  const CHANNEL_COLORS = { shopify: "#95BF47", amazon: "#FF9900", retail: "#3B82F6", wholesale: "#8B5CF6", manual: T.text3 };
  const totalRev = orders.reduce((s, o) => s + (o.total || 0), 0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div><div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>Orders</div><div style={{ fontSize: 12, color: T.text3 }}>{orders.length} orders · {fmt(totalRev)} total</div></div>
      </div>
      <div style={{ display: "flex", gap: 3, background: T.surface2, borderRadius: 7, padding: 2, flexWrap: "wrap" }}>
        {[["all","All"],["shopify","🟢 Shopify"],["amazon","🟠 Amazon"],["retail","🔵 Retail"],["wholesale","🟣 Wholesale"]].map(([v,l]) => (
          <button key={v} onClick={() => setChannelFilter(v)} style={{ padding: "4px 10px", borderRadius: 5, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, background: channelFilter === v ? T.surface : "transparent", color: channelFilter === v ? T.text : T.text3 }}>{l}</button>
        ))}
      </div>
      {filtered.length === 0 ? <EmptyState icon="🛒" text="No orders found" /> :
        filtered.map(o => {
          const cust = getCustomer(o.customer_id);
          return (
            <Card key={o.id} style={{ padding: "12px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: CHANNEL_COLORS[o.channel] || T.text3 }} />
                  <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "monospace", color: T.text }}>{o.order_number}</span>
                  <Pill status={o.status} />
                  <Pill status={o.fulfillment_status === "fulfilled" ? "completed" : o.fulfillment_status === "partial" ? "in_progress" : "pending"} />
                </div>
                <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>{fmt(o.total)}</div>
              </div>
              <div style={{ fontSize: 11, color: T.text3, marginTop: 4, display: "flex", gap: 12 }}>
                <span>{cust?.name || "DTC"}</span>
                <span>{new Date(o.order_date).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                <span style={{ textTransform: "capitalize" }}>{o.channel}</span>
              </div>
            </Card>
          );
        })
      }
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CUSTOMERS VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function CustomersView({ customers, setCustomers, orders, isMobile }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div><div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>Customers</div><div style={{ fontSize: 12, color: T.text3 }}>{customers.length} accounts</div></div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
        {customers.map(c => {
          const custOrders = orders.filter(o => o.customer_id === c.id);
          const custRev = custOrders.reduce((s, o) => s + (o.total || 0), 0);
          return (
            <Card key={c.id} style={{ padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: T.text3, marginTop: 2, textTransform: "capitalize" }}>{c.customer_type?.replace(/_/g, " ")}{c.payment_terms ? ` · ${c.payment_terms.replace(/_/g, " ")}` : ""}</div>
                </div>
                <Pill status={c.status} />
              </div>
              <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 11, color: T.text3 }}>
                <span>{custOrders.length} order{custOrders.length !== 1 ? "s" : ""}</span>
                <span style={{ fontWeight: 700, color: T.text }}>{fmt(custRev)}</span>
                {c.credit_limit && <span>Limit: {fmt(c.credit_limit)}</span>}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MANUFACTURING VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function ManufacturingView({ workOrders, setWorkOrders, variants, facilities, boms, isMobile }) {
  const getVariant = id => variants.find(v => v.id === id);
  const getFacility = id => facilities.find(f => f.id === id);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div><div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>Manufacturing</div><div style={{ fontSize: 12, color: T.text3 }}>{workOrders.length} work orders</div></div>
      {workOrders.length === 0 ? <EmptyState icon="⚙" text="No work orders yet. Create one from a BOM to start a production run." /> :
        workOrders.map(wo => {
          const v = getVariant(wo.variant_id);
          const f = getFacility(wo.facility_id);
          const pct = wo.planned_quantity > 0 ? Math.round((wo.completed_quantity / wo.planned_quantity) * 100) : 0;
          return (
            <Card key={wo.id} style={{ padding: "14px 16px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div><span style={{ fontSize: 13, fontWeight: 800, fontFamily: "monospace", color: T.accent }}>{wo.wo_number}</span><span style={{ marginLeft: 8 }}><Pill status={wo.status} /></span></div>
                <div style={{ fontSize: 12, fontWeight: 700 }}>{fmtN(wo.completed_quantity)} / {fmtN(wo.planned_quantity)}</div>
              </div>
              <div style={{ fontSize: 12, color: T.text, marginBottom: 4 }}>{v?.name || "Unknown"}</div>
              <div style={{ height: 4, background: T.surface2, borderRadius: 4, overflow: "hidden", marginBottom: 6 }}><div style={{ height: "100%", width: `${pct}%`, background: pct >= 100 ? "#10B981" : T.accent, borderRadius: 4 }} /></div>
              <div style={{ fontSize: 11, color: T.text3 }}>{f?.name || ""}{wo.planned_start ? ` · ${new Date(wo.planned_start).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}</div>
            </Card>
          );
        })
      }
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACILITIES VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function FacilitiesView({ facilities, setFacilities, inventory, isMobile }) {
  const TYPE_ICONS = { warehouse: "🏢", factory: "🏭", "3pl": "🚚", office: "🏫", retail: "🏬" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div><div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>Facilities</div><div style={{ fontSize: 12, color: T.text3 }}>{facilities.length} locations</div></div>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
        {facilities.map(f => {
          const facInv = inventory.filter(i => i.facility_id === f.id);
          const totalUnits = facInv.reduce((s, i) => s + (i.quantity || 0), 0);
          const skuCount = new Set(facInv.map(i => i.variant_id).filter(Boolean)).size;
          return (
            <Card key={f.id} style={{ padding: "14px 16px", borderLeft: `3px solid ${f.is_default ? T.accent : "transparent"}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 22 }}>{TYPE_ICONS[f.facility_type] || "🏢"}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{f.name}{f.is_default ? <span style={{ fontSize: 9, marginLeft: 6, color: T.accent, fontWeight: 600 }}>DEFAULT</span> : ""}</div>
                  <div style={{ fontSize: 11, color: T.text3, textTransform: "capitalize" }}>{f.facility_type?.replace(/_/g, " ")}{f.operator ? ` · ${f.operator}` : ""}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, fontSize: 11, color: T.text3 }}>
                <span style={{ fontWeight: 700, color: T.text }}>{fmtN(totalUnits)} units</span>
                <span>{skuCount} SKUs</span>
                <span>{f.city}{f.state ? `, ${f.state}` : ""}</span>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
