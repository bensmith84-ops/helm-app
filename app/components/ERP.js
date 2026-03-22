"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";
import { useAuth } from "../lib/auth";
import { useResponsive } from "../lib/responsive";

// ═══════════════════════════════════════════════════════════════════════════════
// ERP MODULE — Products, Suppliers, POs, Inventory, Orders, Customers, Mfg, Facilities
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Searchable Select Component (inline) ─────────────────────────────────────
function Select({ options = [], value, onChange, placeholder = "Select…", multi = false, disabled = false, style = {} }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);
  const inputRef = useRef(null);
  useEffect(() => { const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);
  useEffect(() => { if (open && inputRef.current) inputRef.current.focus(); }, [open]);
  const filtered = options.filter(o => { if (!search) return true; const q = search.toLowerCase(); return (o.label||"").toLowerCase().includes(q) || (o.sublabel||"").toLowerCase().includes(q) || String(o.value||"").toLowerCase().includes(q); });
  const isSelected = v => multi ? Array.isArray(value) && value.includes(v) : value === v;
  const handleSelect = v => { if (multi) { const a = Array.isArray(value) ? [...value] : []; if (a.includes(v)) onChange(a.filter(x => x !== v)); else onChange([...a, v]); } else { onChange(v); setOpen(false); setSearch(""); } };
  const getLabel = () => { if (multi && Array.isArray(value)) { const s = options.filter(o => value.includes(o.value)); if (s.length === 0) return null; if (s.length <= 2) return s.map(x => x.label).join(", "); return `${s.length} selected`; } const s = options.find(o => o.value === value); return s ? s.label : null; };
  const label = getLabel();
  return (
    <div ref={ref} style={{ position: "relative", ...style }}>
      <button onClick={() => { if (!disabled) { setOpen(!open); setSearch(""); } }} disabled={disabled} type="button"
        style={{ width: "100%", padding: "7px 28px 7px 10px", fontSize: 12, background: T.surface2, border: `1px solid ${open ? T.accent : T.border}`, borderRadius: 8, color: label ? T.text : T.text3, cursor: disabled ? "not-allowed" : "pointer", textAlign: "left", outline: "none", boxSizing: "border-box", position: "relative", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", opacity: disabled ? 0.6 : 1 }}>
        {label || placeholder}
        <span style={{ position: "absolute", right: 8, top: "50%", transform: `translateY(-50%) rotate(${open ? 180 : 0}deg)`, fontSize: 9, color: T.text3, transition: "transform 0.15s" }}>▼</span>
      </button>
      {multi && Array.isArray(value) && value.length > 0 && (
        <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginTop: 4 }}>
          {options.filter(o => value.includes(o.value)).map(o => (
            <span key={o.value} style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, padding: "2px 6px", borderRadius: 6, background: T.accentDim, color: T.accent, fontWeight: 600 }}>
              {o.icon && <span style={{ fontSize: 9 }}>{o.icon}</span>}{o.label}
              <span onClick={e => { e.stopPropagation(); handleSelect(o.value); }} style={{ cursor: "pointer", fontSize: 8, color: T.text3 }}>✕</span>
            </span>
          ))}
        </div>
      )}
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.15)", zIndex: 999, maxHeight: 260, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 180 }}>
          <div style={{ padding: "6px 6px 3px", flexShrink: 0 }}>
            <input ref={inputRef} value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" onClick={e => e.stopPropagation()}
              style={{ width: "100%", padding: "6px 10px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, outline: "none", boxSizing: "border-box" }} />
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: "2px 4px 4px" }}>
            {filtered.length === 0 && <div style={{ padding: "10px 8px", fontSize: 11, color: T.text3, textAlign: "center" }}>No matches</div>}
            {filtered.map(o => (
              <div key={o.value} onClick={() => handleSelect(o.value)}
                style={{ padding: "6px 10px", borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", gap: 7, background: isSelected(o.value) ? T.accentDim : "transparent", marginBottom: 1 }}
                onMouseEnter={e => { if (!isSelected(o.value)) e.currentTarget.style.background = T.surface2; }}
                onMouseLeave={e => { if (!isSelected(o.value)) e.currentTarget.style.background = "transparent"; }}>
                {multi && <span style={{ width: 13, height: 13, borderRadius: 3, flexShrink: 0, border: `1.5px solid ${isSelected(o.value) ? T.accent : T.border}`, background: isSelected(o.value) ? T.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, color: "#fff", fontWeight: 800 }}>{isSelected(o.value) ? "✓" : ""}</span>}
                {o.icon && <span style={{ fontSize: 13, flexShrink: 0 }}>{o.icon}</span>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: isSelected(o.value) ? 700 : 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label}</div>
                  {o.sublabel && <div style={{ fontSize: 10, color: T.text3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.sublabel}</div>}
                </div>
                {!multi && isSelected(o.value) && <span style={{ fontSize: 10, color: T.accent }}>✓</span>}
              </div>
            ))}
          </div>
          {multi && <div style={{ padding: "5px 10px", borderTop: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", fontSize: 10 }}><span style={{ color: T.text3 }}>{(Array.isArray(value) ? value.length : 0)} selected</span><button onClick={() => onChange([])} type="button" style={{ color: T.accent, background: "none", border: "none", cursor: "pointer", fontWeight: 600, fontSize: 10 }}>Clear</button></div>}
        </div>
      )}
    </div>
  );
}

const fmt = n => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(n || 0);
const fmtN = n => new Intl.NumberFormat("en-US").format(n || 0);

// GL Auto-Posting helper — creates balanced journal entries
const postJournalEntry = async (source, refType, refId, description, lines, entityId) => {
  const entryNum = `JE-${Date.now().toString(36).toUpperCase()}`;
  const totalDebit = lines.reduce((s, l) => s + (l.debit || 0), 0);
  const totalCredit = lines.reduce((s, l) => s + (l.credit || 0), 0);
  const period = new Date().toISOString().slice(0, 7);
  const { data: je } = await supabase.from("erp_journal_entries").insert({
    entry_number: entryNum, entry_date: new Date().toISOString().slice(0, 10), period,
    entity_id: entityId || null, source, reference_type: refType, reference_id: refId,
    description, total_debit: totalDebit, total_credit: totalCredit, status: "posted",
  }).select().single();
  if (je) {
    const jeLines = lines.map((l, i) => ({
      entry_id: je.id, account_number: l.account, account_name: l.name,
      debit: l.debit || 0, credit: l.credit || 0, description: l.desc || description, sort_order: i,
    }));
    await supabase.from("erp_journal_lines").insert(jeLines);
  }
  return je;
};

const ERP_NAV = [
  { type: "header", label: "Overview" },
  { id: "dashboard", label: "Dashboard", icon: "⬡" },
  { type: "header", label: "Supply Chain" },
  { id: "products", label: "Products", icon: "📦" },
  { id: "suppliers", label: "Suppliers", icon: "🏭" },
  { id: "purchase_orders", label: "Purchase Orders", icon: "📋" },
  { id: "inventory", label: "Inventory", icon: "📊" },
  { id: "manufacturing", label: "Manufacturing", icon: "⚙" },
  { type: "header", label: "Sales & Fulfillment" },
  { id: "orders", label: "Orders", icon: "🛒" },
  { id: "customers", label: "Customers", icon: "👥" },
  { id: "shipping", label: "Shipping", icon: "🚚" },
  { id: "returns", label: "Returns", icon: "↩️" },
  { type: "header", label: "Finance" },
  { id: "ap_ar", label: "AP / AR", icon: "💰" },
  { id: "gl", label: "General Ledger", icon: "📒" },
  { id: "entities", label: "Entities", icon: "🌐" },
  { id: "facilities", label: "Facilities", icon: "🏢" },
  { id: "reports", label: "Reports", icon: "📈" },
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
  const [view, setView] = useState("dashboard");
  const [pendingNav, setPendingNav] = useState(null); // { view, selectId }
  const navigateTo = (targetView, selectId) => { setPendingNav({ view: targetView, selectId }); setView(targetView); };
  const [loading, setLoading] = useState(true);

  // Core data
  const [products, setProducts] = useState([]);
  const [variants, setVariants] = useState([]);
  const [boms, setBoms] = useState([]);
  const [bomItems, setBomItems] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [supplierContacts, setSupplierContacts] = useState([]);
  const [supplierItems, setSupplierItems] = useState([]);
  const [facilities, setFacilities] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [lots, setLots] = useState([]);
  const [purchaseOrders, setPurchaseOrders] = useState([]);
  const [poItems, setPoItems] = useState([]);
  const [orders, setOrders] = useState([]);
  const [orderItems, setOrderItems] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [workOrders, setWorkOrders] = useState([]);
  const [movements, setMovements] = useState([]);
  const [carriers, setCarriers] = useState([]);
  const [carrierServices, setCarrierServices] = useState([]);
  const [fulfillmentIntegrations, setFulfillmentIntegrations] = useState([]);
  const [rmas, setRmas] = useState([]);
  const [rmaItems, setRmaItems] = useState([]);
  const [apInvoices, setApInvoices] = useState([]);
  const [arInvoices, setArInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [glAccounts, setGlAccounts] = useState([]);
  const [journalEntries, setJournalEntries] = useState([]);
  const [entities, setEntities] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [exchangeRates, setExchangeRates] = useState([]);

  useEffect(() => {
    const load = async () => {
      const [
        { data: prods }, { data: vars }, { data: bm }, { data: bi },
        { data: sups }, { data: facs }, { data: inv }, { data: lt },
        { data: pos }, { data: pois }, { data: ords }, { data: ois },
        { data: custs }, { data: wos }, { data: ents }, { data: curs }, { data: rates },
        { data: supItems },
        { data: mvmts },
        { data: cars }, { data: carSvcs }, { data: fIntg }, { data: rmaData }, { data: rmaItemsData }, { data: apInv }, { data: arInv }, { data: pmts }, { data: glAccts }, { data: jeData },
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
        supabase.from("erp_entities").select("*").order("code"),
        supabase.from("erp_currencies").select("*").eq("is_active", true).order("code"),
        supabase.from("erp_exchange_rates").select("*").order("effective_date", { ascending: false }),
        supabase.from("erp_supplier_items").select("*").order("item_name"),
        supabase.from("erp_inventory_movements").select("*").order("created_at", { ascending: false }).limit(200),
        supabase.from("erp_carriers").select("*").order("name"),
        supabase.from("erp_carrier_services").select("*").order("carrier_id, name"),
        supabase.from("erp_fulfillment_integrations").select("*").order("name"),
        supabase.from("erp_rma").select("*").order("created_at", { ascending: false }),
        supabase.from("erp_rma_items").select("*"),
        supabase.from("erp_ap_invoices").select("*").order("created_at", { ascending: false }),
        supabase.from("erp_ar_invoices").select("*").order("created_at", { ascending: false }),
        supabase.from("erp_payments").select("*").order("created_at", { ascending: false }),
        supabase.from("erp_gl_accounts").select("*").order("account_number"),
        supabase.from("erp_journal_entries").select("*").order("entry_date", { ascending: false }).limit(100),
      ]);
      setProducts(prods || []); setVariants(vars || []); setBoms(bm || []); setBomItems(bi || []);
      setSuppliers(sups || []); setFacilities(facs || []); setInventory(inv || []); setLots(lt || []);
      setPurchaseOrders(pos || []); setPoItems(pois || []); setOrders(ords || []); setOrderItems(ois || []);
      setCustomers(custs || []); setWorkOrders(wos || []);
      setEntities(ents || []); setCurrencies(curs || []); setExchangeRates(rates || []);
      setSupplierItems(supItems || []);
      setMovements(mvmts || []);
      setCarriers(cars || []); setCarrierServices(carSvcs || []); setFulfillmentIntegrations(fIntg || []); setRmas(rmaData || []); setRmaItems(rmaItemsData || []); setApInvoices(apInv || []); setArInvoices(arInv || []); setPayments(pmts || []); setGlAccounts(glAccts || []); setJournalEntries(jeData || []);
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
      {/* Left nav — desktop (grouped) */}
      {!isMobile && (
        <div style={{ width: 185, borderRight: `1px solid ${T.border}`, padding: "8px 6px", flexShrink: 0, overflow: "auto" }}>
          {ERP_NAV.map((n, i) => n.type === "header" ? (
            <div key={n.label} style={{ fontSize: 9, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.08em", padding: "10px 10px 3px", marginTop: i > 0 ? 4 : 0 }}>{n.label}</div>
          ) : (
            <button key={n.id} onClick={() => setView(n.id)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 7, padding: "6px 10px", background: view === n.id ? T.accentDim : "transparent", border: "none", borderRadius: 6, cursor: "pointer", color: view === n.id ? T.accent : T.text2, fontSize: 12, fontWeight: view === n.id ? 700 : 400, textAlign: "left", marginBottom: 1, transition: "background 0.1s" }}
              onMouseEnter={e => { if (view !== n.id) e.currentTarget.style.background = T.surface2; }}
              onMouseLeave={e => { if (view !== n.id) e.currentTarget.style.background = "transparent"; }}>
              <span style={{ fontSize: 12, opacity: view === n.id ? 1 : 0.6 }}>{n.icon}</span>{n.label}
            </button>
          ))}
        </div>
      )}

      {/* Content column */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        {/* Mobile tab bar */}
        {isMobile && (
          <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${T.border}`, overflowX: "auto", flexShrink: 0, background: T.bg, WebkitOverflowScrolling: "touch" }}>
            {ERP_NAV.filter(n => !n.type).map(n => (
              <button key={n.id} onClick={() => setView(n.id)}
                style={{ padding: "10px 14px", background: "none", border: "none", borderBottom: view === n.id ? `2px solid ${T.accent}` : "2px solid transparent", cursor: "pointer", color: view === n.id ? T.accent : T.text3, fontSize: 18, fontWeight: 600, whiteSpace: "nowrap" }}>
                {n.icon}
              </button>
            ))}
          </div>
        )}

        {/* Scrollable content */}
        <div style={{ flex: 1, overflow: "auto", padding: isMobile ? "10px 10px 20px" : "20px 24px" }}>
          {view === "dashboard" && <ERPDashboard navigateTo={navigateTo} products={products} variants={variants} suppliers={suppliers} purchaseOrders={purchaseOrders} inventory={inventory} lots={lots} orders={orders} customers={customers} workOrders={workOrders} facilities={facilities} entities={entities} setView={setView} isMobile={isMobile} />}
          {view === "products" && <ProductsView navigateTo={navigateTo} products={products} setProducts={setProducts} variants={variants} setVariants={setVariants} boms={boms} setBoms={setBoms} bomItems={bomItems} setBomItems={setBomItems} inventory={inventory} isMobile={isMobile} />}
          {view === "suppliers" && <SuppliersView navigateTo={navigateTo} pendingNav={pendingNav} setPendingNav={setPendingNav} suppliers={suppliers} setSuppliers={setSuppliers} entities={entities} purchaseOrders={purchaseOrders} supplierItems={supplierItems} setSupplierItems={setSupplierItems} products={products} isMobile={isMobile} />}
          {view === "purchase_orders" && <PurchaseOrdersView navigateTo={navigateTo} pendingNav={pendingNav} setPendingNav={setPendingNav} setApInvoices={setApInvoices} purchaseOrders={purchaseOrders} setPurchaseOrders={setPurchaseOrders} poItems={poItems} setPoItems={setPoItems} suppliers={suppliers} facilities={facilities} variants={variants} products={products} entities={entities} currencies={currencies} exchangeRates={exchangeRates} isMobile={isMobile} />}
          {view === "inventory" && <InventoryView navigateTo={navigateTo} inventory={inventory} setInventory={setInventory} lots={lots} setLots={setLots} variants={variants} products={products} facilities={facilities} suppliers={suppliers} purchaseOrders={purchaseOrders} setPurchaseOrders={setPurchaseOrders} movements={movements} setMovements={setMovements} isMobile={isMobile} />}
          {view === "orders" && <OrdersView navigateTo={navigateTo} pendingNav={pendingNav} setPendingNav={setPendingNav} orders={orders} setOrders={setOrders} orderItems={orderItems} setOrderItems={setOrderItems} customers={customers} variants={variants} carriers={carriers} carrierServices={carrierServices} facilities={facilities} setArInvoices={setArInvoices} isMobile={isMobile} />}
          {view === "customers" && <CustomersView navigateTo={navigateTo} pendingNav={pendingNav} setPendingNav={setPendingNav} customers={customers} setCustomers={setCustomers} orders={orders} isMobile={isMobile} />}
          {view === "manufacturing" && <ManufacturingView navigateTo={navigateTo} workOrders={workOrders} setWorkOrders={setWorkOrders} variants={variants} products={products} facilities={facilities} boms={boms} bomItems={bomItems} lots={lots} setLots={setLots} inventory={inventory} setInventory={setInventory} isMobile={isMobile} />}
          {view === "facilities" && <FacilitiesView facilities={facilities} setFacilities={setFacilities} inventory={inventory} entities={entities} isMobile={isMobile} />}
          {view === "gl" && <GLView glAccounts={glAccounts} journalEntries={journalEntries} setJournalEntries={setJournalEntries} entities={entities} isMobile={isMobile} />}
          {view === "ap_ar" && <APARView apInvoices={apInvoices} setApInvoices={setApInvoices} arInvoices={arInvoices} setArInvoices={setArInvoices} payments={payments} setPayments={setPayments} suppliers={suppliers} customers={customers} orders={orders} purchaseOrders={purchaseOrders} isMobile={isMobile} />}
          {view === "returns" && <ReturnsView rmas={rmas} setRmas={setRmas} rmaItems={rmaItems} setRmaItems={setRmaItems} orders={orders} orderItems={orderItems} customers={customers} variants={variants} inventory={inventory} setInventory={setInventory} movements={movements} setMovements={setMovements} facilities={facilities} isMobile={isMobile} />}
          {view === "shipping" && <ShippingView carriers={carriers} setCarriers={setCarriers} carrierServices={carrierServices} setCarrierServices={setCarrierServices} fulfillmentIntegrations={fulfillmentIntegrations} orders={orders} isMobile={isMobile} />}
          {view === "entities" && <EntitiesView entities={entities} setEntities={setEntities} facilities={facilities} currencies={currencies} exchangeRates={exchangeRates} suppliers={suppliers} isMobile={isMobile} />}
          {view === "reports" && <ReportsView products={products} variants={variants} suppliers={suppliers} purchaseOrders={purchaseOrders} poItems={poItems} inventory={inventory} lots={lots} orders={orders} orderItems={orderItems} customers={customers} workOrders={workOrders} facilities={facilities} entities={entities} supplierItems={supplierItems} boms={boms} bomItems={bomItems} isMobile={isMobile} />}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ERP DASHBOARD — Overview across all modules
// ═══════════════════════════════════════════════════════════════════════════════
function ERPDashboard({ navigateTo, products, variants, suppliers, purchaseOrders, inventory, lots, orders, customers, workOrders, facilities, entities, setView, isMobile }) {
  const totalStock = inventory.reduce((s, i) => s + (i.quantity || 0), 0);
  const inventoryValue = inventory.reduce((s, i) => { const v = variants.find(x => x.id === i.variant_id); return s + (i.quantity || 0) * (v?.cost || 0); }, 0);
  const openPOs = purchaseOrders.filter(p => !["received", "closed", "cancelled"].includes(p.status));
  const pendingOrders = orders.filter(o => o.fulfillment_status !== "fulfilled" && o.status !== "cancelled");
  const activeWOs = workOrders.filter(w => w.status === "in_progress" || w.status === "released");
  const expiringLots = lots.filter(l => l.expiry_date && new Date(l.expiry_date) < new Date(Date.now() + 90 * 86400000) && l.status === "available");
  const totalRev = orders.reduce((s, o) => s + (o.total || 0), 0);
  const totalPOValue = openPOs.reduce((s, p) => s + (p.total || 0), 0);
  const finishedGoods = products.filter(p => p.product_type === "finished_good");
  const woPlanned = workOrders.filter(w => w.status !== "cancelled").reduce((s, w) => s + (w.planned_quantity || 0), 0);
  const woCompleted = workOrders.reduce((s, w) => s + (w.completed_quantity || 0), 0);

  const DashCard = ({ icon, title, value, sub, color, onClick }) => (
    <div onClick={onClick} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16, cursor: onClick ? "pointer" : "default", position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 20 }}>{icon}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: T.text3 }}>{title}</span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 900, color: color || T.text }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div><div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>ERP Dashboard</div><div style={{ fontSize: 12, color: T.text3 }}>{entities.length} entities · {facilities.length} facilities · Real-time operations overview</div></div>

      {/* Primary KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 10 }}>
        <DashCard icon="📦" title="Products" value={finishedGoods.length} sub={`${variants.length} SKUs · ${products.length} total items`} color={T.accent} onClick={() => setView("products")} />
        <DashCard icon="📊" title="Inventory" value={fmtN(totalStock)} sub={`${fmt(inventoryValue)} value · ${lots.filter(l=>l.status==="available").length} lots`} color="#10B981" onClick={() => setView("inventory")} />
        <DashCard icon="🛒" title="Pending Orders" value={pendingOrders.length} sub={`${fmt(totalRev)} total revenue`} color={pendingOrders.length > 0 ? "#F59E0B" : T.text3} onClick={() => setView("orders")} />
        <DashCard icon="📋" title="Open POs" value={openPOs.length} sub={`${fmt(totalPOValue)} outstanding`} color={openPOs.length > 0 ? "#3B82F6" : T.text3} onClick={() => setView("purchase_orders")} />
      </div>

      {/* Secondary KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 10 }}>
        <DashCard icon="🏭" title="Suppliers" value={suppliers.length} sub={`${suppliers.filter(s=>s.supplier_type==="raw_material").length} raw · ${suppliers.filter(s=>s.supplier_type==="contract_manufacturer").length} CMs`} onClick={() => setView("suppliers")} />
        <DashCard icon="👥" title="Customers" value={customers.length} sub={`${customers.filter(c=>c.customer_type==="retail").length} retail · ${customers.filter(c=>c.customer_type==="wholesale").length} wholesale`} onClick={() => setView("customers")} />
        <DashCard icon="⚙" title="Manufacturing" value={activeWOs.length} sub={`${workOrders.length} total WOs`} color={activeWOs.length > 0 ? "#8B5CF6" : T.text3} onClick={() => setView("manufacturing")} />
        <DashCard icon="🏢" title="Facilities" value={facilities.length} sub={`${facilities.filter(f=>f.facility_type==="warehouse").length} WH · ${facilities.filter(f=>f.facility_type==="3pl").length} 3PL · ${facilities.filter(f=>f.facility_type==="factory").length} MFG`} onClick={() => setView("facilities")} />
      </div>

      {/* Alerts */}
      {(expiringLots.length > 0 || pendingOrders.length > 5) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {expiringLots.length > 0 && (
            <div onClick={() => setView("inventory")} style={{ padding: "12px 16px", background: "#FEE2E215", border: "1px solid #FECACA", borderRadius: 10, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18 }}>⚠️</span>
              <div><div style={{ fontSize: 13, fontWeight: 700, color: "#991B1B" }}>{expiringLots.length} lot{expiringLots.length !== 1 ? "s" : ""} expiring within 90 days</div>
              <div style={{ fontSize: 11, color: T.text3 }}>Click to review in Inventory → Lots & Traceability</div></div>
            </div>
          )}
          {pendingOrders.length > 5 && (
            <div onClick={() => setView("orders")} style={{ padding: "12px 16px", background: "#FEF3C715", border: "1px solid #FCD34D", borderRadius: 10, cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 18 }}>📦</span>
              <div><div style={{ fontSize: 13, fontWeight: 700, color: "#92400E" }}>{pendingOrders.length} orders awaiting fulfillment</div>
              <div style={{ fontSize: 11, color: T.text3 }}>Click to review pending orders</div></div>
            </div>
          )}
        </div>
      )}

      {/* Recent activity */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
        {/* Recent orders */}
        <Card style={{ padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 10 }}>Recent Orders</div>
          {orders.slice(0, 5).map(o => (
            <div key={o.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${T.border}`, fontSize: 11 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: { shopify: "#95BF47", amazon: "#FF9900", retail: "#3B82F6" }[o.channel] || T.text3 }} />
                <strong onClick={() => navigateTo("orders", o.id)} style={{ fontFamily: "monospace", cursor: "pointer", color: T.accent, textDecoration: "underline dotted" }} onMouseEnter={e => e.currentTarget.style.textDecoration = "underline"} onMouseLeave={e => e.currentTarget.style.textDecoration = "underline dotted"}>{o.order_number}</strong>
                <Pill status={o.status} />
              </div>
              <span style={{ fontWeight: 700 }}>{fmt(o.total)}</span>
            </div>
          ))}
        </Card>

        {/* Active work orders */}
        <Card style={{ padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 10 }}>Work Orders</div>
          {workOrders.slice(0, 5).map(wo => {
            const pct = wo.planned_quantity > 0 ? Math.round(((wo.completed_quantity || 0) / wo.planned_quantity) * 100) : 0;
            return (
              <div key={wo.id} style={{ padding: "6px 0", borderBottom: `1px solid ${T.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 3 }}>
                  <div><strong onClick={() => navigateTo("manufacturing", wo.id)} style={{ fontFamily: "monospace", color: T.accent, cursor: "pointer", textDecoration: "underline dotted" }} onMouseEnter={e => e.currentTarget.style.textDecoration = "underline"} onMouseLeave={e => e.currentTarget.style.textDecoration = "underline dotted"}>{wo.wo_number}</strong><span style={{ marginLeft: 6 }}><Pill status={wo.status} /></span></div>
                  <span style={{ fontSize: 10 }}>{fmtN(wo.completed_quantity || 0)}/{fmtN(wo.planned_quantity)}</span>
                </div>
                <div style={{ height: 3, background: T.surface2, borderRadius: 3, overflow: "hidden" }}><div style={{ height: "100%", width: `${pct}%`, background: pct >= 100 ? "#10B981" : T.accent, borderRadius: 3 }} /></div>
              </div>
            );
          })}
          {workOrders.length === 0 && <div style={{ fontSize: 11, color: T.text3 }}>No work orders</div>}
        </Card>
      </div>

      {/* Inventory by facility */}
      <Card style={{ padding: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 10 }}>Inventory by Facility</div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 8 }}>
          {facilities.map(f => {
            const facInv = inventory.filter(i => i.facility_id === f.id);
            const units = facInv.reduce((s, i) => s + (i.quantity || 0), 0);
            const skus = new Set(facInv.map(i => i.variant_id).filter(Boolean)).size;
            const TYPE_ICONS = { warehouse: "🏢", factory: "🏭", "3pl": "🚚" };
            return (
              <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: T.surface2, borderRadius: 8 }}>
                <span style={{ fontSize: 16 }}>{TYPE_ICONS[f.facility_type] || "🏢"}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: T.text }}>{f.name}</div>
                  <div style={{ fontSize: 10, color: T.text3 }}>{fmtN(units)} units · {skus} SKUs</div>
                </div>
                <div style={{ width: 40, height: 40, borderRadius: 20, background: `conic-gradient(${T.accent} ${Math.min(100, Math.round((units / Math.max(totalStock, 1)) * 100))}%, ${T.surface2} 0)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <div style={{ width: 30, height: 30, borderRadius: 15, background: T.surface2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: T.text3 }}>{Math.round((units / Math.max(totalStock, 1)) * 100)}%</div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRODUCTS VIEW — SKU master, variants, BOMs
// ═══════════════════════════════════════════════════════════════════════════════
function ProductsView({ navigateTo, products, setProducts, variants, setVariants, boms, setBoms, bomItems, setBomItems, inventory, isMobile }) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", category: "laundry", product_type: "finished_good", brand: "Earth Breeze", status: "active" });

  const filtered = products.filter(p => {
    if (typeFilter !== "all" && p.product_type !== typeFilter) return false;
    if (search) { const q = search.toLowerCase(); const pVars = variants.filter(v => v.product_id === p.id); const matchesSku = pVars.some(v => v.sku?.toLowerCase().includes(q) || v.barcode?.includes(q)); if (!p.name.toLowerCase().includes(q) && !p.category?.toLowerCase().includes(q) && !p.brand?.toLowerCase().includes(q) && !matchesSku) return false; }
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
    // Check for open orders using this product's variants
    const prodVars = variants.filter(v => v.product_id === id);
    const varIds = prodVars.map(v => v.id);
    const { data: openOI } = await supabase.from("erp_order_items").select("id, order_id").in("variant_id", varIds.length > 0 ? varIds : ["none"]);
    const openOrderCount = openOI?.length || 0;
    const hasInventory = inventory.some(i => varIds.includes(i.variant_id) && i.quantity > 0);

    let msg = "Delete this product and all its variants?";
    if (openOrderCount > 0) msg = `⚠ This product has ${openOrderCount} line items across open orders. ${msg}`;
    if (hasInventory) msg = `⚠ This product has on-hand inventory. ${msg}`;

    if (!window.confirm(msg)) return;
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
                    <Pill status={p.status} />{p.is_kit && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: "#EDE9FE", color: "#5B21B6", fontWeight: 700 }}>KIT</span>}
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

            {/* Kit Info */}
            {selected.is_kit && (
              <div style={{ marginBottom: 16, padding: "12px 14px", background: "#EDE9FE15", border: "1px solid #C4B5FD40", borderRadius: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 16 }}>📦</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#5B21B6" }}>Kit / Bundle</span>
                  <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: "#EDE9FE", color: "#5B21B6", fontWeight: 600, textTransform: "capitalize" }}>{selected.kit_type?.replace(/_/g, " ")}</span>
                </div>
                <div style={{ fontSize: 11, color: T.text3, marginBottom: 10 }}>
                  {selected.kit_type === "assemble_to_order" ? "Components are picked and assembled at time of order fulfillment. Component inventory is consumed, not kit inventory." : "Kit is pre-assembled into finished inventory. Assemble kits in advance to maintain stock."}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={async () => {
                    const qty = parseInt(prompt("How many kits to assemble?", "10") || "0");
                    if (!qty) return;
                    const kitBom = boms.find(b => prodVariants.some(v => v.id === b.variant_id) && b.status === "active");
                    if (!kitBom) { alert("No active BOM found for this kit"); return; }
                    const fac = prompt("Facility name:", "EB - Harrodsburg");
                    const asmNum = `KIT-ASM-${Date.now().toString(36).toUpperCase()}`;
                    await supabase.from("erp_kit_assemblies").insert({ assembly_number: asmNum, product_id: selected.id, variant_id: prodVariants[0]?.id, bom_id: kitBom.id, facility_id: null, assembly_type: "assembly", quantity: qty, status: "completed" });
                    alert(`✅ Assembled ${qty} × ${selected.name}\nComponents consumed per BOM: ${kitBom.name}`);
                  }} style={{ padding: "6px 14px", fontSize: 11, fontWeight: 700, background: "#10B981", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>🔧 Assemble Kit</button>
                  <button onClick={async () => {
                    const qty = parseInt(prompt("How many kits to disassemble?", "1") || "0");
                    if (!qty) return;
                    const asmNum = `KIT-DIS-${Date.now().toString(36).toUpperCase()}`;
                    await supabase.from("erp_kit_assemblies").insert({ assembly_number: asmNum, product_id: selected.id, variant_id: prodVariants[0]?.id, assembly_type: "disassembly", quantity: qty, status: "completed" });
                    alert(`✅ Disassembled ${qty} × ${selected.name}\nComponents returned to inventory`);
                  }} style={{ padding: "6px 14px", fontSize: 11, fontWeight: 700, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text2, cursor: "pointer" }}>↩ Disassemble</button>
                </div>
              </div>
            )}

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
                      {["SKU", "Name", "Size", "Cost", "Wholesale", "MSRP", "Pack", ""].map(h => <th key={h} style={{ textAlign: "left", padding: "6px 6px", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase" }}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {prodVariants.map(v => (
                        <tr key={v.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                          <td style={{ padding: "6px" }}><input defaultValue={v.sku} onBlur={async e => { const val = e.target.value.trim(); if (!val || val === v.sku) return; await supabase.from("erp_product_variants").update({ sku: val }).eq("id", v.id); setVariants(p => p.map(x => x.id === v.id ? { ...x, sku: val } : x)); }} style={{ width: 80, padding: "2px 4px", fontSize: 11, fontWeight: 700, fontFamily: "monospace", color: T.accent, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, outline: "none" }} /></td>
                          <td style={{ padding: "6px" }}><input defaultValue={v.name} onBlur={async e => { const val = e.target.value.trim(); if (!val) return; await supabase.from("erp_product_variants").update({ name: val }).eq("id", v.id); setVariants(p => p.map(x => x.id === v.id ? { ...x, name: val } : x)); }} style={{ width: "100%", padding: "2px 4px", fontSize: 11, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, color: T.text, outline: "none" }} /></td>
                          <td style={{ padding: "6px" }}><input defaultValue={v.size || ""} onBlur={async e => { await supabase.from("erp_product_variants").update({ size: e.target.value }).eq("id", v.id); setVariants(p => p.map(x => x.id === v.id ? { ...x, size: e.target.value } : x)); }} style={{ width: 45, padding: "2px 4px", fontSize: 11, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, color: T.text3, outline: "none" }} /></td>
                          <td style={{ padding: "6px" }}><input type="number" step="0.01" defaultValue={v.cost} onBlur={async e => { const val = parseFloat(e.target.value) || 0; await supabase.from("erp_product_variants").update({ cost: val }).eq("id", v.id); setVariants(p => p.map(x => x.id === v.id ? { ...x, cost: val } : x)); }} style={{ width: 55, padding: "2px 4px", fontSize: 11, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, color: T.text, outline: "none", textAlign: "right" }} /></td>
                          <td style={{ padding: "6px" }}><input type="number" step="0.01" defaultValue={v.wholesale_price} onBlur={async e => { const val = parseFloat(e.target.value) || 0; await supabase.from("erp_product_variants").update({ wholesale_price: val }).eq("id", v.id); setVariants(p => p.map(x => x.id === v.id ? { ...x, wholesale_price: val } : x)); }} style={{ width: 55, padding: "2px 4px", fontSize: 11, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, color: T.text, outline: "none", textAlign: "right" }} /></td>
                          <td style={{ padding: "6px" }}><input type="number" step="0.01" defaultValue={v.msrp} onBlur={async e => { const val = parseFloat(e.target.value) || 0; await supabase.from("erp_product_variants").update({ msrp: val }).eq("id", v.id); setVariants(p => p.map(x => x.id === v.id ? { ...x, msrp: val } : x)); }} style={{ width: 55, padding: "2px 4px", fontSize: 11, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, color: T.text, outline: "none", textAlign: "right" }} /></td>
                          <td style={{ padding: "6px" }}><input type="number" defaultValue={v.case_pack} onBlur={async e => { const val = parseInt(e.target.value) || 0; await supabase.from("erp_product_variants").update({ case_pack: val }).eq("id", v.id); setVariants(p => p.map(x => x.id === v.id ? { ...x, case_pack: val } : x)); }} style={{ width: 40, padding: "2px 4px", fontSize: 11, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, color: T.text3, outline: "none", textAlign: "right" }} /></td>
                          <td style={{ padding: "6px" }}><button onClick={async () => { if (!window.confirm(`Delete variant ${v.sku}?`)) return; await supabase.from("erp_product_variants").delete().eq("id", v.id); setVariants(p => p.filter(x => x.id !== v.id)); }} style={{ background: "none", border: "none", color: "#EF4444", cursor: "pointer", fontSize: 10, padding: 0 }}>✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              }
            </div>

            {/* Tags */}
            {(selected.tags || []).length > 0 && (
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 16 }}>
                {selected.tags.map(t => <span key={t} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: T.surface2, color: T.text3, fontWeight: 600 }}>{t}</span>)}
              </div>
            )}

            {/* BOM Section */}
            {selected.product_type === "finished_good" && (() => {
              const prodBoms = boms.filter(b => prodVariants.some(v => v.id === b.variant_id));
              return (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Bills of Materials</div>
                    <button onClick={async () => {
                      if (prodVariants.length === 0) return alert("Add a variant first");
                      const vId = prodVariants[0].id;
                      const { data } = await supabase.from("erp_bom").insert({ variant_id: vId, name: `${prodVariants[0].sku} BOM`, version: "1.0", status: "draft" }).select().single();
                      if (data) setBoms(p => [...p, data]);
                    }} style={{ padding: "4px 10px", fontSize: 11, fontWeight: 600, background: T.accentDim, color: T.accent, border: `1px solid ${T.accent}30`, borderRadius: 6, cursor: "pointer" }}>+ BOM</button>
                  </div>
                  {prodBoms.length === 0 ? <div style={{ fontSize: 12, color: T.text3, textAlign: "center", padding: 12 }}>No BOMs — create one to define ingredient composition</div> :
                    prodBoms.map(bom => {
                      const items = bomItems.filter(i => i.bom_id === bom.id).sort((a, b) => a.sort_order - b.sort_order);
                      const totalCost = items.reduce((s, i) => s + ((i.quantity || 0) * (i.cost_per_unit || 0)), 0);
                      const variant = prodVariants.find(v => v.id === bom.variant_id);
                      return (
                        <div key={bom.id} style={{ background: T.surface2, borderRadius: 8, padding: 12, marginBottom: 10 }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                            <div>
                              <input defaultValue={bom.name} onBlur={async e => { const val = e.target.value.trim(); if (!val) return; await supabase.from("erp_bom").update({ name: val }).eq("id", bom.id); setBoms(p => p.map(x => x.id === bom.id ? { ...x, name: val } : x)); }} style={{ width: 140, padding: "2px 4px", fontSize: 12, fontWeight: 700, background: "transparent", border: `1px solid transparent`, borderRadius: 4, color: T.text, outline: "none" }} onFocus={e => e.target.style.borderColor = T.border} onBlur2={e => e.target.style.borderColor = "transparent"} />
                              <select defaultValue={bom.status} onChange={async e => { await supabase.from("erp_bom").update({ status: e.target.value }).eq("id", bom.id); setBoms(p => p.map(x => x.id === bom.id ? { ...x, status: e.target.value } : x)); }} style={{ fontSize: 10, padding: "1px 4px", borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface2, color: T.text3, cursor: "pointer" }}><option value="draft">Draft</option><option value="active">Active</option><option value="superseded">Superseded</option></select>
                              {variant && <span style={{ fontSize: 10, color: T.text3, marginLeft: 6 }}>({variant.sku})</span>}
                            </div>
                            <div style={{ display: "flex", gap: 4 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: T.accent }}>{fmt(totalCost)}/unit</span>
                              <button onClick={async () => {
                                const name = prompt("Item name (e.g. PVA Film, LAS Surfactant):");
                                if (!name) return;
                                const { data } = await supabase.from("erp_bom_items").insert({ bom_id: bom.id, item_type: "raw_material", item_name: name, quantity: 0, unit: "g", cost_per_unit: 0, sort_order: items.length }).select().single();
                                if (data) setBomItems(p => [...p, data]);
                              }} style={{ padding: "2px 8px", fontSize: 10, background: T.accent + "20", color: T.accent, border: "none", borderRadius: 4, cursor: "pointer", fontWeight: 700 }}>+ Item</button>
                              <button onClick={async () => { if (!window.confirm("Delete this BOM and all items?")) return; await supabase.from("erp_bom").delete().eq("id", bom.id); setBoms(p => p.filter(x => x.id !== bom.id)); setBomItems(p => p.filter(x => x.bom_id !== bom.id)); }} style={{ padding: "2px 8px", fontSize: 10, background: "#EF444420", color: "#EF4444", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: 700 }}>Delete</button>
                            </div>
                          </div>
                          {items.length === 0 ? <div style={{ fontSize: 11, color: T.text3, padding: 6 }}>No ingredients — add items to define the recipe</div> :
                            <div style={{ overflowX: "auto" }}>
                              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                                <thead><tr style={{ borderBottom: `1px solid ${T.border}` }}>
                                  {["Ingredient", "Type", "Qty", "Unit", "$/Unit", "Total", ""].map(h => <th key={h} style={{ textAlign: "left", padding: "4px 6px", fontSize: 9, fontWeight: 700, color: T.text3, textTransform: "uppercase" }}>{h}</th>)}
                                </tr></thead>
                                <tbody>
                                  {items.map(item => (
                                    <tr key={item.id} style={{ borderBottom: `1px solid ${T.border}20` }}>
                                      <td style={{ padding: "4px 6px", fontWeight: 600, color: T.text }}>{item.item_name}</td>
                                      <td style={{ padding: "4px 6px", color: T.text3, fontSize: 10, textTransform: "capitalize" }}>{item.item_type?.replace(/_/g, " ")}</td>
                                      <td style={{ padding: "4px 6px" }}><input type="number" defaultValue={item.quantity} onBlur={async e => { const v = parseFloat(e.target.value) || 0; await supabase.from("erp_bom_items").update({ quantity: v }).eq("id", item.id); setBomItems(p => p.map(x => x.id === item.id ? { ...x, quantity: v } : x)); }} style={{ width: 50, padding: "2px 4px", fontSize: 11, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, color: T.text, outline: "none", textAlign: "right" }} /></td>
                                      <td style={{ padding: "4px 6px", color: T.text3, fontSize: 10 }}>{item.unit}</td>
                                      <td style={{ padding: "4px 6px" }}><input type="number" step="0.001" defaultValue={item.cost_per_unit} onBlur={async e => { const v = parseFloat(e.target.value) || 0; await supabase.from("erp_bom_items").update({ cost_per_unit: v }).eq("id", item.id); setBomItems(p => p.map(x => x.id === item.id ? { ...x, cost_per_unit: v } : x)); }} style={{ width: 60, padding: "2px 4px", fontSize: 11, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 4, color: T.text, outline: "none", textAlign: "right" }} /></td>
                                      <td style={{ padding: "4px 6px", fontWeight: 700, fontSize: 10, color: T.accent }}>{fmt((item.quantity || 0) * (item.cost_per_unit || 0))}</td>
                                      <td style={{ padding: "4px 2px" }}><button onClick={async () => { await supabase.from("erp_bom_items").delete().eq("id", item.id); setBomItems(p => p.filter(x => x.id !== item.id)); }} style={{ background: "none", border: "none", color: "#EF4444", cursor: "pointer", fontSize: 10, padding: 0 }}>✕</button></td>
                                    </tr>
                                  ))}
                                </tbody>
                                <tfoot><tr style={{ borderTop: `1px solid ${T.border}` }}>
                                  <td colSpan={5} style={{ padding: "4px 6px", fontWeight: 700, textAlign: "right", fontSize: 10 }}>Total Material Cost</td>
                                  <td style={{ padding: "4px 6px", fontWeight: 800, color: T.accent }}>{fmt(totalCost)}</td>
                                  <td></td>
                                </tr></tfoot>
                              </table>
                            </div>
                          }
                        </div>
                      );
                    })
                  }
                </div>
              );
            })()}
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
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Type</div><Select value={form.product_type} onChange={v => setForm(f => ({ ...f, product_type: v }))} options={[{ value: "finished_good", label: "Finished Good", icon: "📦" }, { value: "raw_material", label: "Raw Material", icon: "🧪" }, { value: "packaging", label: "Packaging", icon: "📋" }, { value: "component", label: "Component", icon: "🔧" }, { value: "service", label: "Service", icon: "🛠" }]} /></div>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Category</div><Select value={form.category} onChange={v => setForm(f => ({ ...f, category: v }))} options={["laundry","dish","floor","fabric_care","component","raw_material","packaging"].map(c => ({ value: c, label: c.replace(/_/g, " ") }))} /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Brand</div><input value={form.brand || ""} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} style={{ width: "100%", padding: "8px 12px", fontSize: 13, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, outline: "none", boxSizing: "border-box" }} /></div>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Status</div><Select value={form.status} onChange={v => setForm(f => ({ ...f, status: v }))} options={[{ value: "active", label: "Active" }, { value: "development", label: "Development" }, { value: "discontinued", label: "Discontinued" }, { value: "archived", label: "Archived" }]} /></div>
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
function SuppliersView({ navigateTo, pendingNav, setPendingNav, suppliers, setSuppliers, entities, purchaseOrders, supplierItems, setSupplierItems, products, isMobile }) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  useEffect(() => { if (pendingNav?.view === "suppliers" && pendingNav.selectId) { const s = suppliers.find(x => x.id === pendingNav.selectId); if (s) setSelected(s); setPendingNav(null); } }, [pendingNav]);
  const [showNew, setShowNew] = useState(false);
  const FORM_INIT = { name: "", code: "", supplier_type: "raw_material", website: "", email: "", phone: "", country: "US", city: "", state: "", payment_terms: "net_30", lead_time_days: "", certifications: [], rating: 3, is_intercompany: false, entity_id: "", notes: "" };
  const [form, setForm] = useState(FORM_INIT);
  const CERT_OPTIONS = ["ISO9001","ISO14001","GMP","EPA_Safer_Choice","EWG_Verified","USDA_BioPreferred","Vegan","Halal","Kosher","FSC","SFI","C2C","RSPO","IFRA","Compostable"];

  const filtered = suppliers.filter(s => {
    if (typeFilter !== "all" && s.supplier_type !== typeFilter) return false;
    if (search && !s.name.toLowerCase().includes(search.toLowerCase()) && !s.code?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
  const TYPE_ICONS = { raw_material: "🧪", packaging: "📋", contract_manufacturer: "🏭", "3pl": "🚚", service: "🛠", white_label: "📦" };
  const getEntity = id => entities?.find(e => e.id === id);
  const supplierPOs = selected ? purchaseOrders.filter(po => po.supplier_id === selected.id) : [];
  const totalSpend = supplierPOs.reduce((s, po) => s + (po.total || 0), 0);

  const saveSupplier = async () => {
    if (!form.name.trim()) return;
    const payload = { ...form, lead_time_days: parseInt(form.lead_time_days) || null, entity_id: form.entity_id || null };
    if (selected && showNew) {
      const { data } = await supabase.from("erp_suppliers").update(payload).eq("id", selected.id).select().single();
      if (data) { setSuppliers(p => p.map(x => x.id === data.id ? data : x)); setSelected(data); }
    } else {
      const { data } = await supabase.from("erp_suppliers").insert(payload).select().single();
      if (data) { setSuppliers(p => [...p, data]); setSelected(data); }
    }
    setShowNew(false);
  };

  const deleteSupplier = async (id) => {
    const openPOs = purchaseOrders.filter(p => p.supplier_id === id && !["received","closed","cancelled"].includes(p.status));
    let msg = "Delete this supplier?";
    if (openPOs.length > 0) msg = `⚠ This supplier has ${openPOs.length} open PO(s). ${msg}`;
    if (!window.confirm(msg)) return;
    await supabase.from("erp_suppliers").delete().eq("id", id);
    setSuppliers(p => p.filter(x => x.id !== id));
    if (selected?.id === id) setSelected(null);
  };

  const inp = { width: "100%", padding: "8px 12px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, outline: "none", boxSizing: "border-box" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div><div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>Suppliers</div><div style={{ fontSize: 12, color: T.text3 }}>{suppliers.length} vendors</div></div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" style={{ padding: "6px 12px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, width: isMobile ? 120 : 180, outline: "none" }} />
          <button onClick={() => { setForm(FORM_INIT); setShowNew(true); }} style={{ padding: "6px 14px", fontSize: 12, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>+ Supplier</button>
        </div>
      </div>
      <div style={{ display: "flex", gap: 3, background: T.surface2, borderRadius: 7, padding: 2, flexWrap: "wrap" }}>
        {[["all","All"],["raw_material","🧪 Raw"],["packaging","📋 Pack"],["contract_manufacturer","🏭 CM"],["3pl","🚚 3PL"],["white_label","📦 WL"]].map(([v,l]) => (
          <button key={v} onClick={() => setTypeFilter(v)} style={{ padding: "4px 10px", borderRadius: 5, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, background: typeFilter === v ? T.surface : "transparent", color: typeFilter === v ? T.text : T.text3 }}>{l}</button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : selected ? "1fr 1.2fr" : "1fr 1fr", gap: selected ? 16 : 10 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map(s => {
            const sel = selected?.id === s.id;
            const ent = getEntity(s.entity_id);
            return (
              <Card key={s.id} onClick={() => setSelected(s)} style={{ padding: "12px 14px", cursor: "pointer", borderLeft: sel ? `3px solid ${T.accent}` : "3px solid transparent" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 18 }}>{TYPE_ICONS[s.supplier_type] || "🏢"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{s.name}</span>
                      {s.code && <span style={{ fontSize: 9, fontFamily: "monospace", color: T.text3, background: T.surface2, padding: "1px 5px", borderRadius: 3 }}>{s.code}</span>}
                      {s.is_intercompany && <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 6, background: "#EDE9FE", color: "#5B21B6", fontWeight: 700 }}>IC</span>}
                      {ent && <span style={{ fontSize: 8, color: T.text3 }}>{ent.code}</span>}
                    </div>
                    <div style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>{s.country}{s.lead_time_days ? ` · ${s.lead_time_days}d` : ""}{s.payment_terms ? ` · ${s.payment_terms.replace(/_/g," ")}` : ""}</div>
                  </div>
                  <div style={{ display: "flex", gap: 1 }}>{[1,2,3,4,5].map(i => <span key={i} style={{ fontSize: 9, color: i <= (s.rating||0) ? "#F59E0B" : T.border }}>★</span>)}</div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Detail panel */}
        {selected && !isMobile && (
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20, overflow: "auto", maxHeight: "calc(100vh - 220px)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 24 }}>{TYPE_ICONS[selected.supplier_type] || "🏢"}</span>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>{selected.name}</div>
                    <div style={{ fontSize: 11, color: T.text3 }}>{selected.code ? `${selected.code} · ` : ""}{selected.supplier_type?.replace(/_/g, " ")}</div>
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => { setForm({ ...selected, lead_time_days: selected.lead_time_days || "", entity_id: selected.entity_id || "", certifications: selected.certifications || [] }); setShowNew(true); }} style={{ padding: "5px 10px", fontSize: 11, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text2, cursor: "pointer" }}>Edit</button>
                <button onClick={() => deleteSupplier(selected.id)} style={{ padding: "5px 10px", fontSize: 11, background: "#FEE2E2", border: "1px solid #FECACA", borderRadius: 6, color: "#991B1B", cursor: "pointer" }}>Delete</button>
              </div>
            </div>

            {/* Rating */}
            <div style={{ display: "flex", gap: 2, marginBottom: 12 }}>{[1,2,3,4,5].map(i => <span key={i} style={{ fontSize: 16, color: i <= (selected.rating||0) ? "#F59E0B" : T.border, cursor: "pointer" }} onClick={async () => { await supabase.from("erp_suppliers").update({ rating: i }).eq("id", selected.id); const updated = { ...selected, rating: i }; setSuppliers(p => p.map(x => x.id === updated.id ? updated : x)); setSelected(updated); }}>★</span>)}</div>

            {/* Details grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16, padding: "12px 14px", background: T.surface2, borderRadius: 8 }}>
              {[
                { l: "Country", v: selected.country || "—" }, { l: "City", v: selected.city || "—" }, { l: "Payment", v: selected.payment_terms?.replace(/_/g, " ") || "—" },
                { l: "Lead Time", v: selected.lead_time_days ? `${selected.lead_time_days} days` : "—" }, { l: "Currency", v: selected.currency || "USD" }, { l: "Min Order", v: selected.minimum_order_value ? fmt(selected.minimum_order_value) : "—" },
              ].map(d => <div key={d.l}><div style={{ fontSize: 9, color: T.text3, fontWeight: 700, textTransform: "uppercase" }}>{d.l}</div><div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginTop: 2 }}>{d.v}</div></div>)}
            </div>

            {/* Contact info */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 6 }}>Contact</div>
              <div style={{ fontSize: 11, color: T.text3 }}>
                {selected.email && <div>📧 {selected.email}</div>}
                {selected.phone && <div>📞 {selected.phone}</div>}
                {selected.website && <div>🌐 <a href={selected.website} target="_blank" rel="noopener" style={{ color: T.accent }}>{selected.website}</a></div>}
                {!selected.email && !selected.phone && !selected.website && <div>No contact info</div>}
              </div>
            </div>

            {/* Certifications */}
            {(selected.certifications || []).length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 6 }}>Certifications</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {selected.certifications.map(c => <span key={c} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 8, background: "#D1FAE520", color: "#065F46", fontWeight: 600 }}>{c}</span>)}
                </div>
              </div>
            )}

            {/* PO history */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 6 }}>Purchase Orders ({supplierPOs.length})</div>
              {supplierPOs.length === 0 ? <div style={{ fontSize: 11, color: T.text3 }}>No POs with this supplier</div> :
                <>
                  <div style={{ fontSize: 11, color: T.text3, marginBottom: 8 }}>Total spend: <strong style={{ color: T.text }}>{fmt(totalSpend)}</strong></div>
                  {supplierPOs.slice(0, 5).map(po => (
                    <div key={po.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${T.border}`, fontSize: 11 }}>
                      <div><strong onClick={() => navigateTo("purchase_orders", po.id)} style={{ fontFamily: "monospace", color: T.accent, cursor: "pointer", textDecoration: "underline dotted" }} onMouseEnter={e => e.currentTarget.style.textDecoration = "underline"} onMouseLeave={e => e.currentTarget.style.textDecoration = "underline dotted"}>{po.po_number}</strong><span style={{ marginLeft: 6 }}><Pill status={po.status} /></span></div>
                      <span style={{ fontWeight: 700 }}>{fmt(po.total)}</span>
                    </div>
                  ))}
                </>
              }
            </div>

            {/* Catalog / Item Pricing */}
            {(() => {
              const items = (supplierItems || []).filter(si => si.supplier_id === selected.id);
              const getProduct = id => (products || []).find(p => p.id === id);
              return (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>Catalog & Pricing ({items.length})</div>
                    <button onClick={async () => {
                      const name = prompt("Item name (supplier's product name):");
                      if (!name) return;
                      const price = parseFloat(prompt("Unit price (USD):", "0") || "0");
                      const moq = parseInt(prompt("MOQ:", "0") || "0");
                      const { data } = await supabase.from("erp_supplier_items").insert({ supplier_id: selected.id, item_name: name, unit_price: price, moq: moq || null, moq_unit: "each" }).select().single();
                      if (data && setSupplierItems) setSupplierItems(p => [...p, data]);
                    }} style={{ padding: "3px 8px", fontSize: 10, fontWeight: 600, background: T.accentDim, color: T.accent, border: `1px solid ${T.accent}30`, borderRadius: 5, cursor: "pointer" }}>+ Item</button>
                  </div>
                  {items.length === 0 ? <div style={{ fontSize: 11, color: T.text3 }}>No catalog items</div> :
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                        <thead><tr style={{ borderBottom: `1px solid ${T.border}` }}>
                          {["Item", "Part #", "Price", "MOQ", "Lead", ""].map(h => <th key={h} style={{ textAlign: "left", padding: "4px 6px", fontSize: 9, fontWeight: 700, color: T.text3, textTransform: "uppercase" }}>{h}</th>)}
                        </tr></thead>
                        <tbody>
                          {items.map(si => {
                            const prod = getProduct(si.product_id);
                            return (
                              <tr key={si.id} style={{ borderBottom: `1px solid ${T.border}20` }}>
                                <td style={{ padding: "6px", color: T.text }}>
                                  <div style={{ fontWeight: 600 }}>{si.item_name}</div>
                                  {prod && <div style={{ fontSize: 9, color: T.text3 }}>→ {prod.name}</div>}
                                </td>
                                <td style={{ padding: "6px", fontFamily: "monospace", fontSize: 10, color: T.text3 }}>{si.supplier_part_number || "—"}</td>
                                <td style={{ padding: "6px", fontWeight: 700, color: T.accent }}>{fmt(si.unit_price)}<span style={{ fontWeight: 400, color: T.text3 }}>/{si.moq_unit || "ea"}</span></td>
                                <td style={{ padding: "6px", color: T.text3 }}>{si.moq ? `${fmtN(si.moq)} ${si.moq_unit || ""}` : "—"}</td>
                                <td style={{ padding: "6px", color: T.text3 }}>{si.lead_time_days ? `${si.lead_time_days}d` : "—"}</td>
                                <td style={{ padding: "6px" }}>{si.is_preferred && <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 6, background: "#D1FAE520", color: "#065F46", fontWeight: 700 }}>PREF</span>}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  }
                </div>
              );
            })()}

            {selected.notes && <div style={{ fontSize: 11, color: T.text3, padding: "8px 10px", background: T.surface2, borderRadius: 6 }}>{selected.notes}</div>}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showNew && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowNew(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: 14, padding: isMobile ? 14 : 24, width: "min(600px, 95vw)", maxHeight: "90vh", overflow: "auto" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 16 }}>{selected && form.name ? "Edit Supplier" : "New Supplier"}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr", gap: 10 }}>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Name *</div><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inp} /></div>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Code</div><input value={form.code || ""} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="BASF" style={{ ...inp, fontFamily: "monospace" }} /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 10 }}>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Type</div><Select value={form.supplier_type} onChange={v => setForm(f => ({ ...f, supplier_type: v }))} options={[{ value: "raw_material", label: "Raw Material", icon: "🧪" }, { value: "packaging", label: "Packaging", icon: "📋" }, { value: "contract_manufacturer", label: "Contract Manufacturer", icon: "🏭" }, { value: "3pl", label: "3PL", icon: "🚚" }, { value: "service", label: "Service", icon: "🛠" }, { value: "white_label", label: "White Label", icon: "📦" }]} /></div>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Country</div><input value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} style={inp} /></div>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Lead Time (days)</div><input type="number" value={form.lead_time_days} onChange={e => setForm(f => ({ ...f, lead_time_days: e.target.value }))} style={inp} /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 10 }}>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Email</div><input value={form.email || ""} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={inp} /></div>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Phone</div><input value={form.phone || ""} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} style={inp} /></div>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Website</div><input value={form.website || ""} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://" style={inp} /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Payment Terms</div><Select value={form.payment_terms} onChange={v => setForm(f => ({ ...f, payment_terms: v }))} options={["prepaid","cod","net_15","net_30","net_45","net_60","net_90"].map(t => ({ value: t, label: t.replace(/_/g, " ") }))} /></div>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Rating</div><div style={{ display: "flex", gap: 4, padding: "8px 0" }}>{[1,2,3,4,5].map(i => <span key={i} onClick={() => setForm(f => ({ ...f, rating: i }))} style={{ fontSize: 18, color: i <= form.rating ? "#F59E0B" : T.border, cursor: "pointer" }}>★</span>)}</div></div>
              </div>
              {/* Intercompany */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: T.surface2, borderRadius: 8 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: T.text, cursor: "pointer" }}><input type="checkbox" checked={form.is_intercompany} onChange={e => setForm(f => ({ ...f, is_intercompany: e.target.checked }))} /> Intercompany supplier</label>
                {form.is_intercompany && <Select value={form.entity_id} onChange={v => setForm(f => ({ ...f, entity_id: v }))} placeholder="Select entity…" style={{ flex: 1 }} options={(entities||[]).map(e => ({ value: e.id, label: `${e.code} — ${e.name}`, sublabel: `${e.country} · ${e.base_currency}` }))} />}
              </div>
              {/* Certifications */}
              <div>
                <div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 6 }}>Certifications</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {CERT_OPTIONS.map(c => (
                    <button key={c} onClick={() => setForm(f => ({ ...f, certifications: (f.certifications||[]).includes(c) ? f.certifications.filter(x => x !== c) : [...(f.certifications||[]), c] }))}
                      style={{ fontSize: 10, padding: "3px 8px", borderRadius: 10, cursor: "pointer", border: `1px solid ${(form.certifications||[]).includes(c) ? "#10B981" : T.border}`, background: (form.certifications||[]).includes(c) ? "#D1FAE520" : "transparent", color: (form.certifications||[]).includes(c) ? "#065F46" : T.text3, fontWeight: 600 }}>{c}</button>
                  ))}
                </div>
              </div>
              <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Notes</div><textarea value={form.notes || ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...inp, resize: "vertical" }} /></div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => setShowNew(false)} style={{ padding: "8px 16px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text3, cursor: "pointer" }}>Cancel</button>
                <button onClick={saveSupplier} disabled={!form.name.trim()} style={{ padding: "8px 16px", fontSize: 12, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", opacity: !form.name.trim() ? 0.5 : 1 }}>{selected && form.name === selected.name ? "Save" : "Create"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PURCHASE ORDERS VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function PurchaseOrdersView({ navigateTo, pendingNav, setPendingNav, setApInvoices, purchaseOrders, setPurchaseOrders, poItems, setPoItems, suppliers, facilities, variants, products, entities, currencies, exchangeRates, isMobile }) {
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  useEffect(() => { if (pendingNav?.view === "purchase_orders" && pendingNav.selectId) { const p = purchaseOrders.find(x => x.id === pendingNav.selectId); if (p) setSelected(p); setPendingNav(null); } }, [pendingNav]);
  const [showNew, setShowNew] = useState(false);
  const [showReceivePO, setShowReceivePO] = useState(false);
  const [receiveQtys, setReceiveQtys] = useState({});
  const [lineItems, setLineItems] = useState([]);

  const FORM_INIT = { supplier_id: "", facility_id: "", buying_entity_id: "", po_currency: "USD", payment_terms: "net_30", expected_date: "", notes: "", is_intercompany: false };
  const [form, setForm] = useState(FORM_INIT);

  const filtered = purchaseOrders.filter(po => statusFilter === "all" || po.status === statusFilter);
  const getSupplier = id => suppliers.find(s => s.id === id);
  const getFacility = id => facilities.find(f => f.id === id);
  const getEntity = id => entities.find(e => e.id === id);
  const getCurrencySymbol = code => currencies.find(c => c.code === code)?.symbol || "$";

  const openPOs = purchaseOrders.filter(p => !["received", "closed", "cancelled"].includes(p.status));
  const totalOpen = openPOs.reduce((s, p) => s + (p.total || 0), 0);

  // Auto-generate PO number
  const nextPONum = () => {
    const year = new Date().getFullYear();
    const existing = purchaseOrders.filter(p => p.po_number.startsWith(`PO-${year}`));
    const max = existing.reduce((m, p) => { const n = parseInt(p.po_number.split("-")[2]) || 0; return Math.max(m, n); }, 0);
    return `PO-${year}-${String(max + 1).padStart(4, "0")}`;
  };

  // When supplier changes, check if intercompany
  const onSupplierChange = (supId) => {
    const sup = suppliers.find(s => s.id === supId);
    setForm(f => ({
      ...f,
      supplier_id: supId,
      is_intercompany: sup?.is_intercompany || false,
      selling_entity_id: sup?.entity_id || "",
      po_currency: sup?.currency || "USD",
    }));
  };

  // Add line item
  const addLine = () => setLineItems(p => [...p, { variant_id: "", product_id: "", description: "", quantity: 1, unit: "each", unit_price: 0 }]);
  const updateLine = (i, field, val) => setLineItems(p => p.map((l, j) => j === i ? { ...l, [field]: val } : l));
  const removeLine = (i) => setLineItems(p => p.filter((_, j) => j !== i));

  // When a product/variant is selected on a line, auto-fill description and cost
  const onLineProductChange = (i, variantId) => {
    const v = variants.find(x => x.id === variantId);
    if (v) {
      const p = products.find(x => x.id === v.product_id);
      updateLine(i, "variant_id", variantId);
      updateLine(i, "description", `${v.name} (${v.sku})`);
      updateLine(i, "unit_price", v.cost || 0);
    }
  };

  const lineTotal = lineItems.reduce((s, l) => s + (parseFloat(l.quantity) || 0) * (parseFloat(l.unit_price) || 0), 0);

  // Create PO
  const createPO = async () => {
    if (!form.supplier_id || lineItems.length === 0) return;
    const payload = {
      supplier_id: form.supplier_id,
      facility_id: form.facility_id || null,
      buying_entity_id: form.buying_entity_id || null,
      is_intercompany: form.is_intercompany,
      po_currency: form.po_currency,
      expected_date: form.expected_date || null,
      payment_terms: form.payment_terms,
      subtotal: lineTotal,
      total: lineTotal,
      notes: form.notes,
    };

    if (selected && (selected.status === "draft" || selected.status === "submitted")) {
      // UPDATE existing PO
      const { data: po } = await supabase.from("erp_purchase_orders").update(payload).eq("id", selected.id).select().single();
      if (!po) return;
      // Delete old items and re-insert
      await supabase.from("erp_po_items").delete().eq("po_id", selected.id);
      const items = lineItems.map((l, i) => ({
        po_id: po.id, variant_id: l.variant_id || null, description: l.description,
        quantity: parseFloat(l.quantity) || 0, unit: l.unit || "each",
        unit_price: parseFloat(l.unit_price) || 0, total: (parseFloat(l.quantity) || 0) * (parseFloat(l.unit_price) || 0), sort_order: i,
      }));
      const { data: newItems } = await supabase.from("erp_po_items").insert(items).select();
      setPurchaseOrders(p => p.map(x => x.id === po.id ? po : x));
      setPoItems(p => [...p.filter(x => x.po_id !== po.id), ...(newItems || [])]);
      setSelected(po);
    } else {
      // CREATE new PO
      const poNumber = nextPONum();
      const { data: po } = await supabase.from("erp_purchase_orders").insert({ ...payload, po_number: poNumber, status: "draft", order_date: new Date().toISOString().slice(0, 10) }).select().single();
      if (!po) return;
      const items = lineItems.map((l, i) => ({
        po_id: po.id, variant_id: l.variant_id || null, description: l.description,
        quantity: parseFloat(l.quantity) || 0, unit: l.unit || "each",
        unit_price: parseFloat(l.unit_price) || 0, total: (parseFloat(l.quantity) || 0) * (parseFloat(l.unit_price) || 0), sort_order: i,
      }));
      const { data: createdItems } = await supabase.from("erp_po_items").insert(items).select();
      setPurchaseOrders(p => [po, ...p]);
      if (createdItems) setPoItems(p => [...p, ...createdItems]);
      setSelected(po);
    }
  };

  // Update PO status
  const updateStatus = async (po, newStatus) => {
    const updates = { status: newStatus };
    if (newStatus === "received") updates.received_date = new Date().toISOString().slice(0, 10);
    const { data } = await supabase.from("erp_purchase_orders").update(updates).eq("id", po.id).select().single();
    if (data) { setPurchaseOrders(p => p.map(x => x.id === data.id ? data : x)); setSelected(data); }
  };

  const selItems = selected ? poItems.filter(i => i.po_id === selected.id) : [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div><div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>Purchase Orders</div><div style={{ fontSize: 12, color: T.text3 }}>{purchaseOrders.length} POs · {openPOs.length} open · {fmt(totalOpen)} outstanding</div></div>
        <button onClick={() => { setForm(FORM_INIT); setLineItems([{ variant_id: "", description: "", quantity: 1, unit: "each", unit_price: 0 }]); setShowNew(true); }}
          style={{ padding: "6px 14px", fontSize: 12, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>+ New PO</button>
      </div>

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 8 }}>
        {[{ l: "Open POs", v: openPOs.length, c: T.accent }, { l: "Outstanding", v: fmt(totalOpen), c: "#F59E0B" }, { l: "Received MTD", v: purchaseOrders.filter(p => p.status === "received" && p.received_date >= new Date().toISOString().slice(0, 7)).length, c: "#10B981" }, { l: "Avg Lead", v: `${Math.round(suppliers.reduce((s, x) => s + (x.lead_time_days || 0), 0) / Math.max(suppliers.length, 1))}d`, c: T.text3 }].map(s => (
          <Card key={s.l} style={{ textAlign: "center", padding: 10 }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: s.c }}>{s.v}</div>
            <div style={{ fontSize: 10, color: T.text3 }}>{s.l}</div>
          </Card>
        ))}
      </div>

      {/* Status filter */}
      <div style={{ display: "flex", gap: 3, background: T.surface2, borderRadius: 7, padding: 2, flexWrap: "wrap" }}>
        {[["all","All"],["draft","Draft"],["submitted","Submitted"],["confirmed","Confirmed"],["partially_received","Partial"],["received","Received"]].map(([v,l]) => (
          <button key={v} onClick={() => setStatusFilter(v)} style={{ padding: "4px 10px", borderRadius: 5, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, background: statusFilter === v ? T.surface : "transparent", color: statusFilter === v ? T.text : T.text3 }}>{l}</button>
        ))}
      </div>

      {/* PO list + detail */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : selected ? "1fr 1.2fr" : "1fr", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.length === 0 ? <EmptyState icon="📋" text="No purchase orders found" /> :
            filtered.map(po => {
              const sup = getSupplier(po.supplier_id);
              const fac = getFacility(po.facility_id);
              const ent = getEntity(po.buying_entity_id);
              const sel = selected?.id === po.id;
              const sym = getCurrencySymbol(po.po_currency);
              return (
                <Card key={po.id} onClick={() => setSelected(po)} style={{ padding: "12px 14px", cursor: "pointer", borderLeft: sel ? `3px solid ${T.accent}` : "3px solid transparent" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 13, fontWeight: 800, fontFamily: "monospace", color: T.accent }}>{po.po_number}</span>
                        <Pill status={po.status} />
                        {po.is_intercompany && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 8, background: "#EDE9FE", color: "#5B21B6", fontWeight: 700 }}>IC</span>}
                      </div>
                      <div style={{ fontSize: 11, color: T.text3, marginTop: 3 }}>
                        {sup?.name || "—"}{fac ? ` → ${fac.name}` : ""}{ent ? ` · ${ent.code}` : ""}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>{sym}{fmtN(po.total)}</div>
                      <div style={{ fontSize: 10, color: T.text3 }}>{po.po_currency !== "USD" ? po.po_currency : ""}{po.expected_date ? ` ETA ${new Date(po.expected_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}</div>
                    </div>
                  </div>
                </Card>
              );
            })
          }
        </div>

        {/* Detail panel */}
        {selected && !isMobile && (
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20, overflow: "auto", maxHeight: "calc(100vh - 240px)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "monospace", color: T.accent }}>{selected.po_number}</div>
                <div style={{ fontSize: 12, color: T.text3, marginTop: 2 }}>{(() => { const s = getSupplier(selected.supplier_id); return s ? <span onClick={() => navigateTo("suppliers", s.id)} style={{ cursor: "pointer", textDecoration: "underline dotted" }} onMouseEnter={e => e.currentTarget.style.textDecoration = "underline"} onMouseLeave={e => e.currentTarget.style.textDecoration = "underline dotted"}>{s.name}</span> : "Unknown"; })()}{selected.is_intercompany ? " (Intercompany)" : ""}</div>
              </div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {(selected.status === "draft" || selected.status === "submitted") && <button onClick={() => { setForm({ supplier_id: selected.supplier_id, facility_id: selected.facility_id || "", buying_entity_id: selected.buying_entity_id || "", po_currency: selected.po_currency || "USD", payment_terms: selected.payment_terms || "net_30", expected_date: selected.expected_date || "", notes: selected.notes || "", is_intercompany: selected.is_intercompany || false }); setLineItems(poItems.filter(i => i.po_id === selected.id).map(i => ({ variant_id: i.variant_id || "", description: i.description, quantity: i.quantity, unit: i.unit || "each", unit_price: i.unit_price }))); setShowNew(true); }} style={{ padding: "5px 10px", fontSize: 11, fontWeight: 600, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text2, cursor: "pointer" }}>Edit</button>}
                {selected.status === "draft" && <button onClick={() => updateStatus(selected, "submitted")} style={{ padding: "5px 10px", fontSize: 11, fontWeight: 600, background: "#EFF6FF", border: "1px solid #93C5FD", borderRadius: 6, color: "#1D4ED8", cursor: "pointer" }}>Submit</button>}
                {selected.status === "submitted" && <button onClick={() => updateStatus(selected, "confirmed")} style={{ padding: "5px 10px", fontSize: 11, fontWeight: 600, background: "#D1FAE5", border: "1px solid #6EE7B7", borderRadius: 6, color: "#065F46", cursor: "pointer" }}>Confirm</button>}
                {(selected.status === "confirmed" || selected.status === "partially_received") && <button onClick={() => setShowReceivePO(true)} style={{ padding: "5px 10px", fontSize: 11, fontWeight: 600, background: "#10B981", border: "none", borderRadius: 6, color: "#fff", cursor: "pointer" }}>📥 Receive Items</button>}
                {selected.status !== "cancelled" && selected.status !== "closed" && selected.status !== "received" && <button onClick={() => updateStatus(selected, "cancelled")} style={{ padding: "5px 10px", fontSize: 11, fontWeight: 600, background: "#FEE2E2", border: "1px solid #FECACA", borderRadius: 6, color: "#991B1B", cursor: "pointer" }}>Cancel</button>}
              </div>
            </div>

            {/* PO details grid */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16, padding: "12px 14px", background: T.surface2, borderRadius: 8 }}>
              {[
                { l: "Status", v: selected.status?.replace(/_/g, " ") },
                { l: "Order Date", v: selected.order_date ? new Date(selected.order_date).toLocaleDateString() : "—" },
                { l: "Expected", v: selected.expected_date ? new Date(selected.expected_date).toLocaleDateString() : "—" },
                { l: "Entity", v: getEntity(selected.buying_entity_id)?.code || "—" },
                { l: "Currency", v: selected.po_currency || "USD" },
                { l: "Terms", v: selected.payment_terms?.replace(/_/g, " ") || "—" },
                { l: "Facility", v: getFacility(selected.facility_id)?.name || "—" },
                { l: "Total", v: `${getCurrencySymbol(selected.po_currency)}${fmtN(selected.total)}` },
                { l: "Received", v: selected.received_date ? new Date(selected.received_date).toLocaleDateString() : "—" },
              ].map(d => (
                <div key={d.l}><div style={{ fontSize: 9, color: T.text3, fontWeight: 700, textTransform: "uppercase" }}>{d.l}</div><div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginTop: 2, textTransform: "capitalize" }}>{d.v}</div></div>
              ))}
            </div>

            {/* Receiving progress bar */}
            {(() => {
              const totalOrdered = selItems.reduce((s, i) => s + (i.quantity || 0), 0);
              const totalReceived = selItems.reduce((s, i) => s + (i.received_quantity || 0), 0);
              const pct = totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0;
              return totalOrdered > 0 && (
                <div style={{ marginBottom: 12, padding: "8px 12px", background: T.surface2, borderRadius: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4 }}>
                    <span style={{ fontWeight: 700, color: T.text }}>Receiving Progress</span>
                    <span style={{ color: pct >= 100 ? "#10B981" : T.text3, fontWeight: 700 }}>{fmtN(totalReceived)} / {fmtN(totalOrdered)} ({pct}%)</span>
                  </div>
                  <div style={{ height: 6, background: T.bg, borderRadius: 4, overflow: "hidden" }}><div style={{ height: "100%", width: `${pct}%`, background: pct >= 100 ? "#10B981" : T.accent, borderRadius: 4, transition: "width 0.3s" }} /></div>
                </div>
              );
            })()}

            {/* Line items table */}
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 8 }}>Line Items</div>
            {selItems.length === 0 ? <div style={{ fontSize: 12, color: T.text3, padding: 12, textAlign: "center" }}>No line items</div> :
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead><tr style={{ borderBottom: `2px solid ${T.border}` }}>
                    {["Item", "Qty", "Unit", "Price", "Total", "Received"].map(h => <th key={h} style={{ textAlign: "left", padding: "6px 8px", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase" }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {selItems.map(item => {
                      const fullyRcvd = (item.received_quantity || 0) >= item.quantity;
                      return (
                        <tr key={item.id} style={{ borderBottom: `1px solid ${T.border}`, background: fullyRcvd ? "#10B98108" : "transparent" }}>
                          <td style={{ padding: "8px", color: T.text, fontWeight: 600 }}>{item.description}</td>
                          <td style={{ padding: "8px" }}>{fmtN(item.quantity)}</td>
                          <td style={{ padding: "8px", color: T.text3 }}>{item.unit}</td>
                          <td style={{ padding: "8px" }}>{fmt(item.unit_price)}</td>
                          <td style={{ padding: "8px", fontWeight: 700 }}>{fmt(item.total)}</td>
                          <td style={{ padding: "8px" }}>
                            <span style={{ color: fullyRcvd ? "#10B981" : "#F59E0B", fontWeight: 700 }}>{fmtN(item.received_quantity || 0)}</span>
                            <span style={{ color: T.text3 }}>/{fmtN(item.quantity)}</span>
                            {fullyRcvd && <span style={{ marginLeft: 4, fontSize: 10 }}>✅</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot><tr style={{ borderTop: `2px solid ${T.border}` }}>
                    <td colSpan={4} style={{ padding: "8px", fontWeight: 700, textAlign: "right" }}>Total</td>
                    <td style={{ padding: "8px", fontWeight: 800, color: T.accent }}>{fmt(selItems.reduce((s, i) => s + (i.total || 0), 0))}</td>
                    <td></td>
                  </tr></tfoot>
                </table>
              </div>
            }

            {/* Landed Costs (Checklist 2.3) */}
            <div style={{ marginTop: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>🚢 Landed Costs</div>
                <button onClick={async () => {
                  const costType = prompt("Cost type (duty, freight_in, brokerage, insurance, customs, other):", "freight_in");
                  if (!costType) return;
                  const desc = prompt("Description:", `${costType.replace(/_/g, " ")} for ${selected.po_number}`);
                  const est = parseFloat(prompt("Estimated amount:", "0") || "0");
                  const { data } = await supabase.from("erp_landed_costs").insert({ po_id: selected.id, cost_type: costType, description: desc, estimated_amount: est, gl_account: { duty: "6100", freight_in: "6110", brokerage: "6120" }[costType] || "6100" }).select().single();
                  if (data) alert(`✅ Added ${costType}: ${fmt(est)}`);
                }} style={{ padding: "3px 8px", fontSize: 10, fontWeight: 600, background: T.accentDim, color: T.accent, border: `1px solid ${T.accent}30`, borderRadius: 5, cursor: "pointer" }}>+ Cost</button>
              </div>
              <div style={{ fontSize: 11, color: T.text3 }}>
                {selected.incoterms && <span style={{ marginRight: 8, fontWeight: 600 }}>Incoterms: {selected.incoterms}</span>}
                Est: {fmt(selected.estimated_landed_cost || 0)} · Actual: {fmt(selected.actual_landed_cost || 0)}
              </div>
            </div>

            {selected.notes && <div style={{ marginTop: 12, fontSize: 11, color: T.text3, padding: "8px 10px", background: T.surface2, borderRadius: 6 }}>{selected.notes}</div>}
          </div>
        )}
      </div>

      {/* Create PO Modal */}
      {showNew && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowNew(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: 14, padding: isMobile ? 14 : 24, width: "min(700px, 95vw)", maxHeight: "90vh", overflow: "auto" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 16 }}>New Purchase Order</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {/* Supplier + Entity */}
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Supplier *</div><Select value={form.supplier_id} onChange={v => onSupplierChange(v)} placeholder="Select supplier…" options={suppliers.map(s => ({ value: s.id, label: `${s.name} (${s.code || "—"})`, sublabel: `${s.supplier_type?.replace(/_/g," ")} · ${s.country}${s.is_intercompany ? " · Intercompany" : ""}`, icon: { raw_material: "🧪", packaging: "📋", contract_manufacturer: "🏭", "3pl": "🚚" }[s.supplier_type] || "🏢" }))} /></div>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Buying Entity</div><Select value={form.buying_entity_id} onChange={v => setForm(f => ({ ...f, buying_entity_id: v }))} placeholder="Select entity…" options={entities.map(e => ({ value: e.id, label: `${e.code} — ${e.name}`, sublabel: `${e.country} · ${e.base_currency}`, icon: e.entity_type === "parent" ? "🏛" : "🌐" }))} /></div>
              </div>
              {/* Facility + Currency + Terms */}
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 10 }}>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Receive At</div><Select value={form.facility_id} onChange={v => setForm(f => ({ ...f, facility_id: v }))} placeholder="Select facility…" options={facilities.map(f => ({ value: f.id, label: f.name, sublabel: `${f.facility_type?.replace(/_/g," ")} · ${f.city || ""}${f.state ? `, ${f.state}` : ""}`, icon: { warehouse: "🏢", factory: "🏭", "3pl": "🚚" }[f.facility_type] || "🏢" }))} /></div>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Currency</div><Select value={form.po_currency} onChange={v => setForm(f => ({ ...f, po_currency: v }))} options={currencies.map(c => ({ value: c.code, label: `${c.code} (${c.symbol})`, sublabel: c.name }))} /></div>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Payment Terms</div><Select value={form.payment_terms} onChange={v => setForm(f => ({ ...f, payment_terms: v }))} options={["prepaid","cod","net_15","net_30","net_45","net_60","net_90"].map(t => ({ value: t, label: t.replace(/_/g, " ") }))} /></div>
              </div>
              {/* Expected date + notes */}
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Expected Delivery</div><input type="date" value={form.expected_date} onChange={e => setForm(f => ({ ...f, expected_date: e.target.value }))} style={{ width: "100%", padding: "8px 12px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, boxSizing: "border-box" }} /></div>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Notes</div><input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="PO notes…" style={{ width: "100%", padding: "8px 12px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, outline: "none", boxSizing: "border-box" }} /></div>
              </div>

              {/* Intercompany indicator */}
              {form.is_intercompany && (
                <div style={{ padding: "8px 12px", borderRadius: 8, background: "#EDE9FE", border: "1px solid #C4B5FD", fontSize: 11, color: "#5B21B6", fontWeight: 600 }}>
                  ⚡ Intercompany PO — transfer pricing rules will apply. Markup: {suppliers.find(s => s.id === form.supplier_id)?.entity_id ? `${entities.find(e => e.id === suppliers.find(s => s.id === form.supplier_id)?.entity_id)?.transfer_pricing_markup_pct || 0}%` : "—"}
                </div>
              )}

              {/* Line items */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Line Items</div>
                  <button onClick={addLine} style={{ padding: "4px 10px", fontSize: 11, fontWeight: 600, background: T.accentDim, color: T.accent, border: `1px solid ${T.accent}30`, borderRadius: 6, cursor: "pointer" }}>+ Add Line</button>
                </div>
                {lineItems.map((line, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr 1fr 1fr auto", gap: 6, marginBottom: 6, alignItems: "end" }}>
                    <div>
                      {i === 0 && <div style={{ fontSize: 9, color: T.text3, fontWeight: 700, marginBottom: 2 }}>ITEM</div>}
                      <Select value={line.variant_id} onChange={v => { updateLine(i, "variant_id", v); onLineProductChange(i, v); }} placeholder="Select item…"
                        options={[...variants.map(v => ({ value: v.id, label: `${v.sku} — ${v.name}`, sublabel: v.size || "", icon: "📦" })), ...products.filter(p => p.product_type !== "finished_good").map(p => ({ value: `raw-${p.id}`, label: p.name, sublabel: p.product_type?.replace(/_/g, " "), icon: "🧪" }))]} />
                    </div>
                    <div>
                      {i === 0 && <div style={{ fontSize: 9, color: T.text3, fontWeight: 700, marginBottom: 2 }}>QTY</div>}
                      <input type="number" value={line.quantity} onChange={e => updateLine(i, "quantity", e.target.value)}
                        style={{ width: "100%", padding: "7px 10px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, outline: "none", boxSizing: "border-box" }} />
                    </div>
                    <div>
                      {i === 0 && <div style={{ fontSize: 9, color: T.text3, fontWeight: 700, marginBottom: 2 }}>UNIT PRICE</div>}
                      <input type="number" step="0.01" value={line.unit_price} onChange={e => updateLine(i, "unit_price", e.target.value)}
                        style={{ width: "100%", padding: "7px 10px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, outline: "none", boxSizing: "border-box" }} />
                    </div>
                    <div>
                      {i === 0 && <div style={{ fontSize: 9, color: T.text3, fontWeight: 700, marginBottom: 2 }}>LINE TOTAL</div>}
                      <div style={{ padding: "7px 10px", fontSize: 12, fontWeight: 700, color: T.text }}>{getCurrencySymbol(form.po_currency)}{((parseFloat(line.quantity) || 0) * (parseFloat(line.unit_price) || 0)).toFixed(2)}</div>
                    </div>
                    <button onClick={() => removeLine(i)} style={{ padding: "6px 8px", background: "none", border: "none", color: "#EF4444", cursor: "pointer", fontSize: 14, marginBottom: 1 }}>✕</button>
                  </div>
                ))}
                {lineItems.length > 0 && (
                  <div style={{ display: "flex", justifyContent: "flex-end", padding: "8px 0", borderTop: `2px solid ${T.border}`, marginTop: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 800, color: T.accent }}>{getCurrencySymbol(form.po_currency)}{lineTotal.toFixed(2)}{form.po_currency !== "USD" ? ` ${form.po_currency}` : ""}</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => { setShowNew(false); setLineItems([]); }} style={{ padding: "8px 16px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text3, cursor: "pointer" }}>Cancel</button>
                <button onClick={createPO} disabled={!form.supplier_id || lineItems.length === 0}
                  style={{ padding: "8px 16px", fontSize: 12, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", opacity: !form.supplier_id || lineItems.length === 0 ? 0.5 : 1 }}>Create PO</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Receive PO Items Modal */}
      {showReceivePO && selected && (() => {
        const items = poItems.filter(i => i.po_id === selected.id);
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowReceivePO(false)}>
            <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: 14, padding: isMobile ? 14 : 24, width: "min(600px, 95vw)", maxHeight: "90vh", overflow: "auto" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: "#10B981", marginBottom: 4 }}>📥 Receive Items — {selected.po_number}</div>
              <div style={{ fontSize: 12, color: T.text3, marginBottom: 16 }}>{getSupplier(selected.supplier_id)?.name} → {getFacility(selected.facility_id)?.name || "No facility"}</div>

              {items.map(item => {
                const remaining = item.quantity - (item.received_quantity || 0);
                const fullyRcvd = remaining <= 0;
                return (
                  <div key={item.id} style={{ padding: "10px 12px", background: fullyRcvd ? "#10B98108" : T.surface2, borderRadius: 8, marginBottom: 8, border: `1px solid ${fullyRcvd ? "#10B98130" : T.border}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{item.description}</div>
                        <div style={{ fontSize: 10, color: T.text3 }}>Ordered: {fmtN(item.quantity)} · Received: {fmtN(item.received_quantity || 0)} · Remaining: <strong style={{ color: remaining > 0 ? "#F59E0B" : "#10B981" }}>{fmtN(remaining)}</strong></div>
                      </div>
                      {fullyRcvd && <span style={{ fontSize: 16 }}>✅</span>}
                    </div>
                    {!fullyRcvd && (
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <div style={{ fontSize: 11, color: T.text3, flexShrink: 0 }}>Receive:</div>
                        <input type="number" value={receiveQtys[item.id] || ""} onChange={e => setReceiveQtys(q => ({ ...q, [item.id]: e.target.value }))}
                          placeholder={String(remaining)} max={remaining}
                          style={{ width: 80, padding: "6px 10px", fontSize: 14, fontWeight: 700, textAlign: "center", background: T.surface, border: `2px solid ${T.accent}40`, borderRadius: 8, color: T.text, outline: "none" }} />
                        <button onClick={() => setReceiveQtys(q => ({ ...q, [item.id]: String(remaining) }))}
                          style={{ padding: "4px 8px", fontSize: 10, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 5, cursor: "pointer", color: T.text3 }}>All</button>
                      </div>
                    )}
                  </div>
                );
              })}

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
                <button onClick={() => { setShowReceivePO(false); setReceiveQtys({}); }} style={{ padding: "8px 16px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text3, cursor: "pointer" }}>Cancel</button>
                <button onClick={async () => {
                  let anyReceived = false;
                  for (const item of items) {
                    const qty = parseInt(receiveQtys[item.id]);
                    if (!qty || qty <= 0) continue;
                    const newRcvd = (item.received_quantity || 0) + qty;
                    await supabase.from("erp_po_items").update({ received_quantity: newRcvd }).eq("id", item.id);
                    setPoItems(p => p.map(x => x.id === item.id ? { ...x, received_quantity: newRcvd } : x));
                    anyReceived = true;
                  }
                  if (anyReceived) {
                    // Check if all items fully received
                    const updatedItems = items.map(i => ({ ...i, received_quantity: (i.received_quantity || 0) + (parseInt(receiveQtys[i.id]) || 0) }));
                    const allReceived = updatedItems.every(i => i.received_quantity >= i.quantity);
                    const anyPartial = updatedItems.some(i => i.received_quantity > 0 && i.received_quantity < i.quantity);
                    const newStatus = allReceived ? "received" : anyPartial || updatedItems.some(i => i.received_quantity > 0) ? "partially_received" : selected.status;
                    const updates = { status: newStatus };
                    if (allReceived) updates.received_date = new Date().toISOString().slice(0, 10);
                    const { data: updPO } = await supabase.from("erp_purchase_orders").update(updates).eq("id", selected.id).select().single();
                    if (updPO) { setPurchaseOrders(p => p.map(x => x.id === updPO.id ? updPO : x)); setSelected(updPO); }

                    // Auto-create AP Invoice on full receipt (Checklist 2.4)
                    if (allReceived) {
                      const apInvNum = `AP-${selected.po_number.replace("PO-", "")}`;
                      const sup = getSupplier(selected.supplier_id);
                      const dueDate = new Date();
                      const termDays = { net_15: 15, net_30: 30, net_45: 45, net_60: 60, net_90: 90, prepaid: 0, cod: 0 }[selected.payment_terms] || 30;
                      dueDate.setDate(dueDate.getDate() + termDays);
                      const { data: apInv } = await supabase.from("erp_ap_invoices").insert({ invoice_number: apInvNum, supplier_id: selected.supplier_id, po_id: selected.id, status: "pending", invoice_date: new Date().toISOString().slice(0,10), due_date: dueDate.toISOString().slice(0,10), currency: selected.po_currency || "USD", subtotal: selected.subtotal || selected.total, total: selected.total, match_status: "matched", payment_terms: selected.payment_terms }).select().single();
                      if (apInv) setApInvoices(p => [apInv, ...p]);
                      // GL: DR Inventory, CR AP Accrual (Checklist 8.1.1)
                      await postJournalEntry("po_receipt", "purchase_order", selected.id,
                        `PO Receipt: ${selected.po_number} — ${getSupplier(selected.supplier_id)?.name}`,
                        [{ account: "1200", name: "Inventory - Raw Materials", debit: selected.total, desc: "Goods received" },
                         { account: "2100", name: "AP Accrual", credit: selected.total, desc: "Vendor accrual" }],
                        selected.buying_entity_id);
                    }
                  }
                  setShowReceivePO(false); setReceiveQtys({});
                }} style={{ padding: "8px 16px", fontSize: 12, fontWeight: 700, background: "#10B981", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>Confirm Receipt</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// INVENTORY VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function InventoryView({ navigateTo, inventory, setInventory, lots, setLots, variants, products, facilities, suppliers, purchaseOrders, setPurchaseOrders, movements, setMovements, isMobile }) {
  const [subView, setSubView] = useState("overview"); // overview, lots, receive, adjust, transfer
  const [showReceive, setShowReceive] = useState(false);
  const [showAdjust, setShowAdjust] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [facilityFilter, setFacilityFilter] = useState("all");

  const getVariant = id => variants.find(v => v.id === id);
  const getProduct = id => products.find(p => p.id === id);
  const getFacility = id => facilities.find(f => f.id === id);
  const getSupplier = id => suppliers.find(s => s.id === id);

  const filteredInv = facilityFilter === "all" ? inventory : inventory.filter(i => i.facility_id === facilityFilter);

  // Aggregations
  const bySku = {};
  filteredInv.forEach(inv => {
    const v = getVariant(inv.variant_id);
    const key = v?.sku || inv.product_id || "unknown";
    if (!bySku[key]) bySku[key] = { sku: v?.sku || "—", name: v?.name || getProduct(inv.product_id)?.name || "Unknown", variantId: inv.variant_id, total: 0, reserved: 0, facilities: {}, lots: new Set() };
    bySku[key].total += inv.quantity || 0;
    bySku[key].reserved += inv.reserved_quantity || 0;
    const fName = getFacility(inv.facility_id)?.name || "Unknown";
    bySku[key].facilities[fName] = (bySku[key].facilities[fName] || 0) + (inv.quantity || 0);
    if (inv.lot_id) bySku[key].lots.add(inv.lot_id);
  });
  const skuList = Object.values(bySku).sort((a, b) => b.total - a.total);
  const totalUnits = filteredInv.reduce((s, i) => s + (i.quantity || 0), 0);
  const totalReserved = filteredInv.reduce((s, i) => s + (i.reserved_quantity || 0), 0);
  const totalSKUs = new Set(filteredInv.map(i => i.variant_id).filter(Boolean)).size;
  const activeLots = lots.filter(l => l.status === "available");
  const expiringLots = lots.filter(l => l.expiry_date && new Date(l.expiry_date) < new Date(Date.now() + 90 * 86400000) && l.status === "available");

  // ── RECEIVE FORM ────────────────────────────────────────────────────────────
  const [rcvForm, setRcvForm] = useState({ variant_id: "", facility_id: "", supplier_id: "", quantity: "", lot_number: "", supplier_lot: "", manufactured_date: "", expiry_date: "", po_id: "", bin_location: "", notes: "" });

  const autoLotNumber = () => {
    const d = new Date();
    const seq = lots.length + 1;
    return `LOT-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${String(seq).padStart(3, "0")}`;
  };

  const submitReceive = async () => {
    if (!rcvForm.variant_id || !rcvForm.facility_id || !rcvForm.quantity) return;
    const qty = parseFloat(rcvForm.quantity);
    const lotNum = rcvForm.lot_number || autoLotNumber();

    // Create lot
    const lotPayload = {
      lot_number: lotNum,
      variant_id: rcvForm.variant_id,
      supplier_id: rcvForm.supplier_id || null,
      supplier_lot_number: rcvForm.supplier_lot || null,
      manufactured_date: rcvForm.manufactured_date || null,
      expiry_date: rcvForm.expiry_date || null,
      received_date: new Date().toISOString().slice(0, 10),
      po_id: rcvForm.po_id || null,
      status: "available",
    };
    const { data: lot } = await supabase.from("erp_inventory_lots").insert(lotPayload).select().single();
    if (!lot) return;

    // Create or update inventory record
    const { data: existing } = await supabase.from("erp_inventory").select("*").eq("variant_id", rcvForm.variant_id).eq("facility_id", rcvForm.facility_id).eq("lot_id", lot.id).maybeSingle();
    let invRecord;
    if (existing) {
      const { data } = await supabase.from("erp_inventory").update({ quantity: existing.quantity + qty, bin_location: rcvForm.bin_location || existing.bin_location }).eq("id", existing.id).select().single();
      invRecord = data;
      setInventory(p => p.map(x => x.id === data.id ? data : x));
    } else {
      const { data } = await supabase.from("erp_inventory").insert({ variant_id: rcvForm.variant_id, facility_id: rcvForm.facility_id, lot_id: lot.id, quantity: qty, unit: "each", bin_location: rcvForm.bin_location || null }).select().single();
      invRecord = data;
      setInventory(p => [...p, data]);
    }

    // Log movement
    const { data: mvmt } = await supabase.from("erp_inventory_movements").insert({ variant_id: rcvForm.variant_id, facility_id: rcvForm.facility_id, lot_id: lot.id, movement_type: "receipt", quantity: qty, reference_type: rcvForm.po_id ? "purchase_order" : null, reference_id: rcvForm.po_id || null, notes: rcvForm.notes || `Received ${qty} units, lot ${lotNum}` }).select().single();
    if (mvmt && setMovements) setMovements(p => [mvmt, ...p]);

    setLots(p => [lot, ...p]);

    // Create QC hold if requested
    if (rcvForm.qc_hold) {
      await supabase.from("erp_qc_holds").insert({ variant_id: rcvForm.variant_id, lot_id: lot.id, facility_id: rcvForm.facility_id, hold_type: "incoming", quantity: qty, status: "on_hold", reference_type: rcvForm.po_id ? "purchase_order" : null, reference_id: rcvForm.po_id || null, reason: "Incoming inspection required" });
      // Update lot status to qc_hold
      await supabase.from("erp_inventory_lots").update({ status: "qc_hold" }).eq("id", lot.id);
      setLots(p => p.map(x => x.id === lot.id ? { ...x, status: "qc_hold" } : x));
    }

    setShowReceive(false);
    setRcvForm({ variant_id: "", facility_id: "", supplier_id: "", quantity: "", lot_number: "", supplier_lot: "", manufactured_date: "", expiry_date: "", po_id: "", bin_location: "", notes: "", qc_hold: false });
  };

  // ── ADJUSTMENT FORM ─────────────────────────────────────────────────────────
  const [adjForm, setAdjForm] = useState({ variant_id: "", facility_id: "", lot_id: "", quantity: "", reason: "cycle_count", notes: "" });

  const submitAdjust = async () => {
    if (!adjForm.variant_id || !adjForm.facility_id || !adjForm.quantity) return;
    const adjQty = parseFloat(adjForm.quantity); // positive or negative
    const { data: existing } = await supabase.from("erp_inventory").select("*").eq("variant_id", adjForm.variant_id).eq("facility_id", adjForm.facility_id).maybeSingle();
    if (existing) {
      const newQty = Math.max(0, existing.quantity + adjQty);
      const { data } = await supabase.from("erp_inventory").update({ quantity: newQty }).eq("id", existing.id).select().single();
      if (data) setInventory(p => p.map(x => x.id === data.id ? data : x));
    } else if (adjQty > 0) {
      const { data } = await supabase.from("erp_inventory").insert({ variant_id: adjForm.variant_id, facility_id: adjForm.facility_id, quantity: adjQty, unit: "each" }).select().single();
      if (data) setInventory(p => [...p, data]);
    }
    const { data: mvmt } = await supabase.from("erp_inventory_movements").insert({ variant_id: adjForm.variant_id, facility_id: adjForm.facility_id, lot_id: adjForm.lot_id || null, movement_type: "adjustment", quantity: adjQty, reference_type: "adjustment", notes: `${adjForm.reason}: ${adjForm.notes || "Manual adjustment"}` }).select().single();
    if (mvmt && setMovements) setMovements(p => [mvmt, ...p]);

    // GL: DR/CR Inventory, CR/DR Adjustment Expense (Checklist 8.1.6)
    const absAmt = Math.abs(adjQty) * (variants.find(v => v.id === adjForm.variant_id)?.cost || 0);
    if (absAmt > 0) {
      await postJournalEntry("adjustment", "adjustment", mvmt?.id,
        `Inv Adjustment: ${adjForm.reason} — ${getVariant(adjForm.variant_id)?.sku}`,
        adjQty > 0
          ? [{ account: "1210", name: "Inventory - Finished Goods", debit: absAmt }, { account: "5400", name: "Inventory Adjustment Expense", credit: absAmt }]
          : [{ account: "5400", name: "Inventory Adjustment Expense", debit: absAmt }, { account: "1210", name: "Inventory - Finished Goods", credit: absAmt }]);
    }

    setShowAdjust(false);
    setAdjForm({ variant_id: "", facility_id: "", lot_id: "", quantity: "", reason: "cycle_count", notes: "" });
  };

  // ── TRANSFER FORM ───────────────────────────────────────────────────────────
  const [xferForm, setXferForm] = useState({ variant_id: "", from_facility_id: "", to_facility_id: "", quantity: "", lot_id: "", notes: "" });

  const submitTransfer = async () => {
    if (!xferForm.variant_id || !xferForm.from_facility_id || !xferForm.to_facility_id || !xferForm.quantity) return;
    if (xferForm.from_facility_id === xferForm.to_facility_id) return;
    const qty = parseFloat(xferForm.quantity);

    // Decrease from source
    const { data: fromInv } = await supabase.from("erp_inventory").select("*").eq("variant_id", xferForm.variant_id).eq("facility_id", xferForm.from_facility_id).maybeSingle();
    if (!fromInv || fromInv.quantity < qty) { alert("Insufficient stock at source facility"); return; }
    const { data: updFrom } = await supabase.from("erp_inventory").update({ quantity: fromInv.quantity - qty }).eq("id", fromInv.id).select().single();
    if (updFrom) setInventory(p => p.map(x => x.id === updFrom.id ? updFrom : x));

    // Increase at destination
    const { data: toInv } = await supabase.from("erp_inventory").select("*").eq("variant_id", xferForm.variant_id).eq("facility_id", xferForm.to_facility_id).maybeSingle();
    if (toInv) {
      const { data: updTo } = await supabase.from("erp_inventory").update({ quantity: toInv.quantity + qty }).eq("id", toInv.id).select().single();
      if (updTo) setInventory(p => p.map(x => x.id === updTo.id ? updTo : x));
    } else {
      const { data: newTo } = await supabase.from("erp_inventory").insert({ variant_id: xferForm.variant_id, facility_id: xferForm.to_facility_id, lot_id: xferForm.lot_id || null, quantity: qty, unit: "each" }).select().single();
      if (newTo) setInventory(p => [...p, newTo]);
    }

    // Log movements
    const fromName = getFacility(xferForm.from_facility_id)?.name;
    const toName = getFacility(xferForm.to_facility_id)?.name;
    await supabase.from("erp_inventory_movements").insert([
      { variant_id: xferForm.variant_id, facility_id: xferForm.from_facility_id, lot_id: xferForm.lot_id || null, movement_type: "transfer_out", quantity: -qty, notes: `Transfer to ${toName}: ${xferForm.notes || ""}`.trim() },
      { variant_id: xferForm.variant_id, facility_id: xferForm.to_facility_id, lot_id: xferForm.lot_id || null, movement_type: "transfer_in", quantity: qty, notes: `Transfer from ${fromName}: ${xferForm.notes || ""}`.trim() },
    ]);

    setShowTransfer(false);
    setXferForm({ variant_id: "", from_facility_id: "", to_facility_id: "", quantity: "", lot_id: "", notes: "" });
  };

  // ── INPUT STYLES ────────────────────────────────────────────────────────────
  const inp = { width: "100%", padding: "8px 12px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, outline: "none", boxSizing: "border-box" };
  const lbl = { fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div><div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>Inventory</div><div style={{ fontSize: 12, color: T.text3 }}>{fmtN(totalUnits)} units · {totalSKUs} SKUs · {facilities.length} facilities</div></div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => { setRcvForm(f => ({ ...f, lot_number: autoLotNumber() })); setShowReceive(true); }} style={{ padding: "6px 12px", fontSize: 11, fontWeight: 700, background: "#10B981", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>📥 Receive</button>
          <button onClick={() => setShowAdjust(true)} style={{ padding: "6px 12px", fontSize: 11, fontWeight: 700, background: "#F59E0B", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>±  Adjust</button>
          <button onClick={() => setShowTransfer(true)} style={{ padding: "6px 12px", fontSize: 11, fontWeight: 700, background: "#3B82F6", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>↔ Transfer</button>
        </div>
      </div>

      {/* KPI cards */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr 1fr", gap: 8 }}>
        {[{ l: "Total Units", v: fmtN(totalUnits), c: T.accent }, { l: "Reserved", v: fmtN(totalReserved), c: "#F59E0B" }, { l: "Available", v: fmtN(totalUnits - totalReserved), c: "#10B981" }, { l: "Active Lots", v: activeLots.length, c: "#3B82F6" }, { l: "Expiring <90d", v: expiringLots.length, c: expiringLots.length > 0 ? "#EF4444" : T.text3 }].map(s => (
          <Card key={s.l} style={{ textAlign: "center", padding: 10 }}>
            <div style={{ fontSize: 18, fontWeight: 900, color: s.c }}>{s.v}</div>
            <div style={{ fontSize: 9, color: T.text3 }}>{s.l}</div>
          </Card>
        ))}
      </div>

      {/* Sub-nav: Overview | Lots */}
      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${T.border}` }}>
        {[["overview", "📊 Stock Levels"], ["lots", "🏷 Lots & Traceability"], ["movements", "📜 Movement Log"]].map(([k, l]) => (
          <button key={k} onClick={() => setSubView(k)} style={{ padding: "8px 16px", background: "none", border: "none", borderBottom: subView === k ? `2px solid ${T.accent}` : "2px solid transparent", cursor: "pointer", color: subView === k ? T.accent : T.text3, fontSize: 12, fontWeight: subView === k ? 700 : 500 }}>{l}</button>
        ))}
        <div style={{ flex: 1 }} />
        {/* Facility filter */}
        <Select value={facilityFilter} onChange={v => setFacilityFilter(v)} style={{ width: 180, marginBottom: 2 }}
          options={[{ value: "all", label: "All Facilities" }, ...facilities.map(f => ({ value: f.id, label: f.name, sublabel: f.facility_type?.replace(/_/g," "), icon: { warehouse: "🏢", factory: "🏭", "3pl": "🚚" }[f.facility_type] || "🏢" }))]} />
      </div>

      {/* STOCK LEVELS VIEW */}
      {subView === "overview" && (
        <>
          {skuList.map(item => (
            <Card key={item.sku} style={{ padding: "12px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div><span style={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace", color: T.accent }}>{item.sku}</span><span style={{ fontSize: 12, color: T.text, marginLeft: 8 }}>{item.name}</span></div>
                <div style={{ textAlign: "right" }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: T.text }}>{fmtN(item.total)}</span>
                  {item.reserved > 0 && <span style={{ fontSize: 11, color: "#F59E0B", marginLeft: 6 }}>({fmtN(item.reserved)} reserved)</span>}
                </div>
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
        </>
      )}

      {/* LOTS & TRACEABILITY VIEW */}
      {subView === "lots" && (
        <>
          {activeLots.length === 0 && expiringLots.length === 0 && lots.length === 0 && <EmptyState icon="🏷" text="No lots recorded yet" />}
          {expiringLots.length > 0 && (
            <div style={{ padding: "10px 14px", background: "#FEE2E220", border: "1px solid #FECACA", borderRadius: 8, marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#991B1B", marginBottom: 6 }}>⚠ Expiring Soon ({expiringLots.length})</div>
              {expiringLots.map(l => {
                const v = getVariant(l.variant_id);
                const daysLeft = Math.ceil((new Date(l.expiry_date) - new Date()) / 86400000);
                return (
                  <div key={l.id} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 11 }}>
                    <span><strong style={{ fontFamily: "monospace" }}>{l.lot_number}</strong> · {v?.sku || "—"} · {v?.name || "—"}</span>
                    <span style={{ color: daysLeft < 30 ? "#EF4444" : "#F59E0B", fontWeight: 700 }}>{daysLeft}d left · exp {new Date(l.expiry_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" })}</span>
                  </div>
                );
              })}
            </div>
          )}
          {lots.map(lot => {
            const v = getVariant(lot.variant_id);
            const sup = getSupplier(lot.supplier_id);
            const lotInv = inventory.filter(i => i.lot_id === lot.id);
            const lotQty = lotInv.reduce((s, i) => s + (i.quantity || 0), 0);
            const isExpiring = lot.expiry_date && new Date(lot.expiry_date) < new Date(Date.now() + 90 * 86400000);
            return (
              <Card key={lot.id} style={{ padding: "12px 14px", borderLeft: `3px solid ${lot.status === "available" ? "#10B981" : lot.status === "quarantine" ? "#F59E0B" : lot.status === "expired" ? "#EF4444" : T.text3}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 800, fontFamily: "monospace", color: T.text }}>{lot.lot_number}</span>
                      <Pill status={lot.status} />
                      {isExpiring && lot.status === "available" && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 8, background: "#FEE2E2", color: "#991B1B", fontWeight: 700 }}>EXPIRING</span>}
                    </div>
                    <div style={{ fontSize: 11, color: T.text3, marginTop: 3 }}>
                      {v?.sku || "—"} · {v?.name || getProduct(lot.product_id)?.name || "—"}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>{fmtN(lotQty)} units</div>
                    <div style={{ fontSize: 10, color: T.text3 }}>{lotInv.length} location{lotInv.length !== 1 ? "s" : ""}</div>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 6, marginTop: 8, padding: "8px 10px", background: T.surface2, borderRadius: 6 }}>
                  <div><div style={{ fontSize: 9, color: T.text3, fontWeight: 700 }}>SUPPLIER</div><div style={{ fontSize: 11, color: T.text }}>{sup?.name || "—"}</div></div>
                  <div><div style={{ fontSize: 9, color: T.text3, fontWeight: 700 }}>SUPPLIER LOT</div><div style={{ fontSize: 11, color: T.text, fontFamily: "monospace" }}>{lot.supplier_lot_number || "—"}</div></div>
                  <div><div style={{ fontSize: 9, color: T.text3, fontWeight: 700 }}>MFG DATE</div><div style={{ fontSize: 11, color: T.text }}>{lot.manufactured_date ? new Date(lot.manufactured_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }) : "—"}</div></div>
                  <div><div style={{ fontSize: 9, color: T.text3, fontWeight: 700 }}>EXPIRY</div><div style={{ fontSize: 11, color: isExpiring ? "#EF4444" : T.text, fontWeight: isExpiring ? 700 : 400 }}>{lot.expiry_date ? new Date(lot.expiry_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }) : "—"}</div></div>
                </div>
              </Card>
            );
          })}
        </>
      )}

      {/* MOVEMENT LOG VIEW */}
      {subView === "movements" && (() => {
        const filteredMvmts = facilityFilter === "all" ? (movements || []) : (movements || []).filter(m => m.facility_id === facilityFilter);
        const MOVE_ICONS = { receipt: "📥", shipment: "📤", transfer_in: "➡️", transfer_out: "⬅️", adjustment: "±", production_in: "🏭", production_out: "📦", return: "↩️", scrap: "🗑" };
        const MOVE_COLORS = { receipt: "#10B981", shipment: "#3B82F6", transfer_in: "#0EA5E9", transfer_out: "#F59E0B", adjustment: "#8B5CF6", production_in: "#10B981", production_out: "#3B82F6", return: "#EC4899", scrap: "#EF4444" };
        return (
          <>
            {filteredMvmts.length === 0 ? <EmptyState icon="📜" text="No inventory movements recorded" /> :
              filteredMvmts.slice(0, 100).map(m => {
                const v = getVariant(m.variant_id);
                const fac = getFacility(m.facility_id);
                const isPositive = m.quantity > 0;
                return (
                  <Card key={m.id} style={{ padding: "10px 14px", borderLeft: `3px solid ${MOVE_COLORS[m.movement_type] || T.text3}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 16 }}>{MOVE_ICONS[m.movement_type] || "📦"}</span>
                        <div>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: T.text, textTransform: "capitalize" }}>{m.movement_type.replace(/_/g, " ")}</span>
                            {v && <span style={{ fontSize: 10, fontFamily: "monospace", color: T.accent }}>{v.sku}</span>}
                          </div>
                          <div style={{ fontSize: 10, color: T.text3 }}>{fac?.name || "—"} · {new Date(m.created_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</div>
                        </div>
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: isPositive ? "#10B981" : "#EF4444" }}>{isPositive ? "+" : ""}{fmtN(m.quantity)}</div>
                    </div>
                    {m.notes && <div style={{ fontSize: 10, color: T.text3, marginTop: 4, paddingLeft: 32 }}>{m.notes}</div>}
                  </Card>
                );
              })
            }
            {filteredMvmts.length > 100 && <div style={{ fontSize: 11, color: T.text3, textAlign: "center", padding: 8 }}>Showing first 100 of {filteredMvmts.length} movements</div>}
          </>
        );
      })()}

      {/* ══════ RECEIVE MODAL ══════ */}
      {showReceive && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowReceive(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: 14, padding: isMobile ? 14 : 24, width: "min(580px, 95vw)", maxHeight: "90vh", overflow: "auto" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#10B981", marginBottom: 16 }}>📥 Receive Inventory</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                <div><div style={lbl}>Product / SKU *</div><Select value={rcvForm.variant_id} onChange={v => setRcvForm(f => ({ ...f, variant_id: v }))} placeholder="Select SKU…" options={variants.map(v => ({ value: v.id, label: `${v.sku} — ${v.name}`, sublabel: v.size || "", icon: "📦" }))} /></div>
                <div><div style={lbl}>Receive At *</div><Select value={rcvForm.facility_id} onChange={v => setRcvForm(f => ({ ...f, facility_id: v }))} placeholder="Select facility…" options={facilities.map(f => ({ value: f.id, label: f.name, sublabel: f.facility_type?.replace(/_/g," "), icon: { warehouse: "🏢", factory: "🏭", "3pl": "🚚" }[f.facility_type] || "🏢" }))} /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 10 }}>
                <div><div style={lbl}>Quantity *</div><input type="number" value={rcvForm.quantity} onChange={e => setRcvForm(f => ({ ...f, quantity: e.target.value }))} placeholder="0" style={inp} /></div>
                <div><div style={lbl}>Supplier</div><Select value={rcvForm.supplier_id} onChange={v => setRcvForm(f => ({ ...f, supplier_id: v }))} placeholder="Select…" options={suppliers.map(s => ({ value: s.id, label: s.name, sublabel: s.supplier_type?.replace(/_/g," "), icon: "🏭" }))} /></div>
                <div><div style={lbl}>Against PO</div><Select value={rcvForm.po_id} onChange={v => setRcvForm(f => ({ ...f, po_id: v }))} placeholder="None" options={purchaseOrders.filter(p => p.status !== "cancelled" && p.status !== "closed").map(p => ({ value: p.id, label: p.po_number, sublabel: getSupplier(p.supplier_id)?.name || "" }))} /></div>
              </div>
              <div style={{ background: T.surface2, borderRadius: 8, padding: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 8 }}>🏷 Lot Details</div>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                  <div><div style={lbl}>Lot Number</div><input value={rcvForm.lot_number} onChange={e => setRcvForm(f => ({ ...f, lot_number: e.target.value }))} style={{ ...inp, fontFamily: "monospace" }} /></div>
                  <div><div style={lbl}>Supplier Lot #</div><input value={rcvForm.supplier_lot} onChange={e => setRcvForm(f => ({ ...f, supplier_lot: e.target.value }))} placeholder="Supplier's batch number" style={inp} /></div>
                  <div><div style={lbl}>Manufactured Date</div><input type="date" value={rcvForm.manufactured_date} onChange={e => setRcvForm(f => ({ ...f, manufactured_date: e.target.value }))} style={inp} /></div>
                  <div><div style={lbl}>Expiry Date</div><input type="date" value={rcvForm.expiry_date} onChange={e => setRcvForm(f => ({ ...f, expiry_date: e.target.value }))} style={inp} /></div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                <div><div style={lbl}>Bin Location</div><input value={rcvForm.bin_location} onChange={e => setRcvForm(f => ({ ...f, bin_location: e.target.value }))} placeholder="e.g. A-01-01" style={inp} /></div>
                <div><div style={lbl}>Notes</div><input value={rcvForm.notes} onChange={e => setRcvForm(f => ({ ...f, notes: e.target.value }))} placeholder="Receipt notes…" style={inp} /></div>
              </div>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 12, color: T.text }}>
                <input type="checkbox" checked={rcvForm.qc_hold || false} onChange={e => setRcvForm(f => ({ ...f, qc_hold: e.target.checked }))} style={{ width: 16, height: 16, accentColor: "#F59E0B" }} />
                <span>🔬 Place on <strong style={{ color: "#F59E0B" }}>QC Hold</strong> — requires inspection before available for allocation</span>
              </label>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => setShowReceive(false)} style={{ padding: "8px 16px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text3, cursor: "pointer" }}>Cancel</button>
                <button onClick={submitReceive} disabled={!rcvForm.variant_id || !rcvForm.facility_id || !rcvForm.quantity} style={{ padding: "8px 16px", fontSize: 12, fontWeight: 700, background: "#10B981", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", opacity: !rcvForm.variant_id || !rcvForm.facility_id || !rcvForm.quantity ? 0.5 : 1 }}>Receive</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════ ADJUST MODAL ══════ */}
      {showAdjust && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowAdjust(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: 14, padding: isMobile ? 14 : 24, width: "min(480px, 95vw)" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#F59E0B", marginBottom: 16 }}>± Adjust Inventory</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                <div><div style={lbl}>Product / SKU *</div><Select value={adjForm.variant_id} onChange={v => setAdjForm(f => ({ ...f, variant_id: v }))} placeholder="Select SKU…" options={variants.map(v => ({ value: v.id, label: `${v.sku} — ${v.name}`, icon: "📦" }))} /></div>
                <div><div style={lbl}>Facility *</div><Select value={adjForm.facility_id} onChange={v => setAdjForm(f => ({ ...f, facility_id: v }))} placeholder="Select…" options={facilities.map(f => ({ value: f.id, label: f.name, sublabel: f.facility_type?.replace(/_/g," "), icon: { warehouse: "🏢", factory: "🏭", "3pl": "🚚" }[f.facility_type] || "🏢" }))} /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                <div><div style={lbl}>Quantity (+/-) *</div><input type="number" value={adjForm.quantity} onChange={e => setAdjForm(f => ({ ...f, quantity: e.target.value }))} placeholder="+100 or -50" style={inp} /><div style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>Positive to add, negative to remove</div></div>
                <div><div style={lbl}>Reason</div><Select value={adjForm.reason} onChange={v => setAdjForm(f => ({ ...f, reason: v }))} options={["cycle_count","damage","spoilage","theft","correction","other"].map(r => ({ value: r, label: r.replace(/_/g, " ") }))} /></div>
              </div>
              <div><div style={lbl}>Notes</div><input value={adjForm.notes} onChange={e => setAdjForm(f => ({ ...f, notes: e.target.value }))} placeholder="Adjustment reason…" style={inp} /></div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => setShowAdjust(false)} style={{ padding: "8px 16px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text3, cursor: "pointer" }}>Cancel</button>
                <button onClick={submitAdjust} disabled={!adjForm.variant_id || !adjForm.facility_id || !adjForm.quantity} style={{ padding: "8px 16px", fontSize: 12, fontWeight: 700, background: "#F59E0B", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", opacity: !adjForm.variant_id || !adjForm.facility_id || !adjForm.quantity ? 0.5 : 1 }}>Submit Adjustment</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════ TRANSFER MODAL ══════ */}
      {showTransfer && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowTransfer(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: 14, padding: isMobile ? 14 : 24, width: "min(500px, 95vw)" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#3B82F6", marginBottom: 16 }}>↔ Transfer Inventory</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div><div style={lbl}>Product / SKU *</div><Select value={xferForm.variant_id} onChange={v => setXferForm(f => ({ ...f, variant_id: v }))} placeholder="Select SKU…" options={variants.map(v => ({ value: v.id, label: `${v.sku} — ${v.name}`, icon: "📦" }))} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto 1fr", gap: 8, alignItems: "end" }}>
                <div><div style={lbl}>From Facility *</div><Select value={xferForm.from_facility_id} onChange={v => setXferForm(f => ({ ...f, from_facility_id: v }))} placeholder="Select…" options={facilities.map(f => ({ value: f.id, label: f.name, sublabel: f.facility_type?.replace(/_/g," "), icon: { warehouse: "🏢", factory: "🏭", "3pl": "🚚" }[f.facility_type] || "🏢" }))} /></div>
                <div style={{ fontSize: 18, color: T.text3, paddingBottom: 8 }}>→</div>
                <div><div style={lbl}>To Facility *</div><Select value={xferForm.to_facility_id} onChange={v => setXferForm(f => ({ ...f, to_facility_id: v }))} placeholder="Select…" options={facilities.map(f => ({ value: f.id, label: f.name, sublabel: f.facility_type?.replace(/_/g," "), icon: { warehouse: "🏢", factory: "🏭", "3pl": "🚚" }[f.facility_type] || "🏢" }))} /></div>
              </div>
              {xferForm.variant_id && xferForm.from_facility_id && (() => {
                const avail = inventory.filter(i => i.variant_id === xferForm.variant_id && i.facility_id === xferForm.from_facility_id).reduce((s, i) => s + (i.quantity || 0), 0);
                return <div style={{ fontSize: 11, color: avail > 0 ? "#10B981" : "#EF4444", fontWeight: 600 }}>Available at source: {fmtN(avail)} units</div>;
              })()}
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                <div><div style={lbl}>Quantity *</div><input type="number" value={xferForm.quantity} onChange={e => setXferForm(f => ({ ...f, quantity: e.target.value }))} placeholder="0" style={inp} /></div>
                <div><div style={lbl}>Notes</div><input value={xferForm.notes} onChange={e => setXferForm(f => ({ ...f, notes: e.target.value }))} placeholder="Transfer reason…" style={inp} /></div>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => setShowTransfer(false)} style={{ padding: "8px 16px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text3, cursor: "pointer" }}>Cancel</button>
                <button onClick={submitTransfer} disabled={!xferForm.variant_id || !xferForm.from_facility_id || !xferForm.to_facility_id || !xferForm.quantity || xferForm.from_facility_id === xferForm.to_facility_id} style={{ padding: "8px 16px", fontSize: 12, fontWeight: 700, background: "#3B82F6", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", opacity: !xferForm.variant_id || !xferForm.from_facility_id || !xferForm.to_facility_id || !xferForm.quantity ? 0.5 : 1 }}>Transfer</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ORDERS VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function OrdersView({ navigateTo, pendingNav, setPendingNav, orders, setOrders, orderItems, setOrderItems, customers, variants, carriers, carrierServices, facilities, setArInvoices, isMobile }) {
  const [channelFilter, setChannelFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  useEffect(() => { if (pendingNav?.view === "orders" && pendingNav.selectId) { const o = orders.find(x => x.id === pendingNav.selectId); if (o) setSelected(o); setPendingNav(null); } }, [pendingNav]);
  const [showNew, setShowNew] = useState(false);
  const [lineItems, setLineItems] = useState([]);
  const FORM_INIT = { channel: "manual", customer_id: "", notes: "" };
  const [form, setForm] = useState(FORM_INIT);
  const [showShipModal, setShowShipModal] = useState(false);
  const [shipForm, setShipForm] = useState({ carrier_id: "", service_id: "", tracking_number: "", weight_g: "" });

  const filtered = orders.filter(o => {
    if (channelFilter !== "all" && o.channel !== channelFilter) return false;
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    return true;
  });
  const getCustomer = id => customers.find(c => c.id === id);
  const getVariant = id => variants.find(v => v.id === id);
  const CHANNEL_COLORS = { shopify: "#95BF47", amazon: "#FF9900", retail: "#3B82F6", wholesale: "#8B5CF6", manual: T.text3 };
  const totalRev = filtered.reduce((s, o) => s + (o.total || 0), 0);
  const pendingCount = orders.filter(o => o.fulfillment_status !== "fulfilled" && o.status !== "cancelled").length;
  const selItems = selected ? orderItems.filter(i => i.order_id === selected.id) : [];

  const updateOrderStatus = async (id, status) => {
    const updates = { status };
    if (status === "shipped") updates.fulfillment_status = "fulfilled";
    const { data } = await supabase.from("erp_orders").update(updates).eq("id", id).select().single();
    if (data) { setOrders(p => p.map(x => x.id === data.id ? data : x)); setSelected(data); }
    // Auto-allocate on processing
    if (status === "processing") {
      const items = orderItems.filter(i => i.order_id === id);
      for (const item of items) {
        if (item.variant_id) {
          await supabase.from("erp_allocations").insert({ order_id: id, order_item_id: item.id, variant_id: item.variant_id, facility_id: facilities?.[0]?.id, allocated_quantity: item.quantity, allocation_type: "hard", status: "active" });
          // Update reserved_quantity on inventory
          await supabase.from("erp_inventory").update({ reserved_quantity: supabase.rpc ? item.quantity : item.quantity }).eq("variant_id", item.variant_id).eq("facility_id", facilities?.[0]?.id);
        }
      }
    }
    // Release allocations on cancel
    if (status === "cancelled") {
      await supabase.from("erp_allocations").update({ status: "cancelled", released_at: new Date().toISOString() }).eq("order_id", id).eq("status", "active");
    }
    // Release allocations on ship
    if (status === "shipped") {
      await supabase.from("erp_allocations").update({ status: "picked", released_at: new Date().toISOString() }).eq("order_id", id).eq("status", "active");
    }
  };

  // Order creation
  const nextOrderNum = () => {
    const max = orders.reduce((m, o) => { const n = parseInt(o.order_number.replace(/[^0-9]/g, "")) || 0; return Math.max(m, n); }, 100000);
    return `ORD-${max + 1}`;
  };
  const addLine = () => setLineItems(p => [...p, { variant_id: "", title: "", quantity: 1, unit_price: 0 }]);
  const updateLine = (i, f, v) => setLineItems(p => p.map((l, j) => j === i ? { ...l, [f]: v } : l));
  const removeLine = i => setLineItems(p => p.filter((_, j) => j !== i));
  const onLineVariantChange = (i, vId) => {
    const v = variants.find(x => x.id === vId);
    if (v) { updateLine(i, "variant_id", vId); updateLine(i, "title", v.name); updateLine(i, "unit_price", v.msrp || v.wholesale_price || 0); updateLine(i, "sku", v.sku); }
  };
  const lineTotal = lineItems.reduce((s, l) => s + (parseFloat(l.quantity) || 0) * (parseFloat(l.unit_price) || 0), 0);

  const createOrder = async () => {
    if (lineItems.length === 0) return;
    if (selected && selected.status === "pending") {
      // UPDATE existing order
      const { data: ord } = await supabase.from("erp_orders").update({ channel: form.channel, customer_id: form.customer_id || null, subtotal: lineTotal, total: lineTotal, notes: form.notes }).eq("id", selected.id).select().single();
      if (!ord) return;
      await supabase.from("erp_order_items").delete().eq("order_id", selected.id);
      const items = lineItems.map((l, i) => ({ order_id: ord.id, variant_id: l.variant_id || null, sku: l.sku || null, title: l.title || "Item", quantity: parseInt(l.quantity) || 0, unit_price: parseFloat(l.unit_price) || 0, total: (parseInt(l.quantity) || 0) * (parseFloat(l.unit_price) || 0), sort_order: i }));
      const { data: ois } = await supabase.from("erp_order_items").insert(items).select();
      setOrders(p => p.map(x => x.id === ord.id ? ord : x));
      setOrderItems(p => [...p.filter(x => x.order_id !== ord.id), ...(ois || [])]);
      setSelected(ord);
    } else {
      // CREATE new order
      const orderNum = nextOrderNum();
      const { data: ord } = await supabase.from("erp_orders").insert({ order_number: orderNum, channel: form.channel, customer_id: form.customer_id || null, status: "pending", fulfillment_status: "unfulfilled", payment_status: "pending", subtotal: lineTotal, total: lineTotal, notes: form.notes }).select().single();
      if (!ord) return;
      const items = lineItems.map((l, i) => ({ order_id: ord.id, variant_id: l.variant_id || null, sku: l.sku || null, title: l.title || "Item", quantity: parseInt(l.quantity) || 0, unit_price: parseFloat(l.unit_price) || 0, total: (parseInt(l.quantity) || 0) * (parseFloat(l.unit_price) || 0), sort_order: i }));
      const { data: ois } = await supabase.from("erp_order_items").insert(items).select();
      setOrders(p => [ord, ...p]);
      if (ois) setOrderItems(p => [...p, ...ois]);
      setSelected(ord);
    }
    setShowNew(false); setForm(FORM_INIT); setLineItems([]);
  };

  const inp = { width: "100%", padding: "8px 12px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, outline: "none", boxSizing: "border-box" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div><div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>Orders</div><div style={{ fontSize: 12, color: T.text3 }}>{orders.length} orders · {pendingCount} pending · {fmt(totalRev)}</div></div>
        <button onClick={() => { setForm(FORM_INIT); setLineItems([{ variant_id: "", title: "", quantity: 1, unit_price: 0 }]); setShowNew(true); }}
          style={{ padding: "6px 14px", fontSize: 12, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>+ Order</button>
      </div>

      {/* KPI */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr 1fr", gap: 8 }}>
        {[
          { l: "Total Orders", v: orders.length, c: T.accent },
          { l: "Pending", v: pendingCount, c: "#F59E0B" },
          { l: "Revenue", v: fmt(orders.reduce((s,o) => s + (o.total||0), 0)), c: "#10B981" },
          { l: "Shopify", v: orders.filter(o=>o.channel==="shopify").length, c: "#95BF47" },
          { l: "Retail", v: orders.filter(o=>o.channel==="retail").length, c: "#3B82F6" },
        ].map(s => <Card key={s.l} style={{ textAlign: "center", padding: 10 }}><div style={{ fontSize: 18, fontWeight: 900, color: s.c }}>{s.v}</div><div style={{ fontSize: 9, color: T.text3 }}>{s.l}</div></Card>)}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 3, background: T.surface2, borderRadius: 7, padding: 2 }}>
          {[["all","All"],["shopify","🟢 Shopify"],["amazon","🟠 Amazon"],["retail","🔵 Retail"],["wholesale","🟣 Wholesale"],["manual","⚪ Manual"]].map(([v,l]) => (
            <button key={v} onClick={() => setChannelFilter(v)} style={{ padding: "4px 10px", borderRadius: 5, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, background: channelFilter === v ? T.surface : "transparent", color: channelFilter === v ? T.text : T.text3 }}>{l}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 3, background: T.surface2, borderRadius: 7, padding: 2 }}>
          {[["all","All"],["pending","Pending"],["processing","Processing"],["shipped","Shipped"],["cancelled","Cancelled"]].map(([v,l]) => (
            <button key={v} onClick={() => setStatusFilter(v)} style={{ padding: "4px 8px", borderRadius: 5, border: "none", cursor: "pointer", fontSize: 10, fontWeight: 600, background: statusFilter === v ? T.surface : "transparent", color: statusFilter === v ? T.text : T.text3 }}>{l}</button>
          ))}
        </div>
      </div>

      {/* Order list + detail */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : selected ? "1fr 1.2fr" : "1fr", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {filtered.length === 0 ? <EmptyState icon="🛒" text="No orders found" /> :
            filtered.map(o => {
              const cust = getCustomer(o.customer_id);
              const sel = selected?.id === o.id;
              return (
                <Card key={o.id} onClick={() => setSelected(o)} style={{ padding: "10px 14px", cursor: "pointer", borderLeft: sel ? `3px solid ${CHANNEL_COLORS[o.channel] || T.accent}` : "3px solid transparent" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ width: 8, height: 8, borderRadius: "50%", background: CHANNEL_COLORS[o.channel] || T.text3, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace", color: T.text }}>{o.order_number}</span>
                      <Pill status={o.status} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 800, color: T.text }}>{fmt(o.total)}</span>
                  </div>
                  <div style={{ fontSize: 10, color: T.text3, marginTop: 3, display: "flex", gap: 10 }}>
                    <span>{cust?.name || "DTC"}</span>
                    <span>{new Date(o.order_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                    <span style={{ textTransform: "capitalize" }}>{o.channel}</span>
                    <span>{o.fulfillment_status === "fulfilled" ? "✅" : o.fulfillment_status === "partial" ? "🔶" : "⬜"} {o.fulfillment_status}</span>
                  </div>
                </Card>
              );
            })
          }
        </div>

        {/* Detail panel */}
        {selected && !isMobile && (
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20, overflow: "auto", maxHeight: "calc(100vh - 240px)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 10, height: 10, borderRadius: "50%", background: CHANNEL_COLORS[selected.channel] }} />
                  <span style={{ fontSize: 18, fontWeight: 800, fontFamily: "monospace", color: T.text }}>{selected.order_number}</span>
                </div>
                <div style={{ fontSize: 12, color: T.text3, marginTop: 2 }}>{(() => { const c = getCustomer(selected.customer_id); return c ? <span onClick={() => navigateTo("customers", c.id)} style={{ cursor: "pointer", textDecoration: "underline dotted" }} onMouseEnter={e => e.currentTarget.style.textDecoration = "underline"} onMouseLeave={e => e.currentTarget.style.textDecoration = "underline dotted"}>{c.name}</span> : "DTC"; })()} · {selected.channel}</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {selected.status === "pending" && <button onClick={() => { setForm({ channel: selected.channel, customer_id: selected.customer_id || "", notes: selected.notes || "" }); setLineItems(orderItems.filter(i => i.order_id === selected.id).map(i => ({ variant_id: i.variant_id || "", title: i.title, quantity: i.quantity, unit_price: i.unit_price, sku: i.sku }))); setShowNew(true); }} style={{ padding: "5px 10px", fontSize: 11, fontWeight: 600, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text2, cursor: "pointer" }}>Edit</button>}
                {selected.status === "pending" && <button onClick={() => updateOrderStatus(selected.id, "processing")} style={{ padding: "5px 10px", fontSize: 11, fontWeight: 600, background: "#EFF6FF", border: "1px solid #93C5FD", borderRadius: 6, color: "#1D4ED8", cursor: "pointer" }}>Process</button>}
                {selected.status === "processing" && <button onClick={() => { setShipForm({ carrier_id: "", service_id: "", tracking_number: "", weight_g: "" }); setShowShipModal(true); }} style={{ padding: "5px 10px", fontSize: 11, fontWeight: 600, background: "#10B981", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>📦 Ship Order</button>}
                {selected.status !== "cancelled" && selected.status !== "delivered" && <button onClick={() => updateOrderStatus(selected.id, "cancelled")} style={{ padding: "5px 10px", fontSize: 11, fontWeight: 600, background: "#FEE2E2", border: "1px solid #FECACA", borderRadius: 6, color: "#991B1B", cursor: "pointer" }}>Cancel</button>}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16, padding: "12px 14px", background: T.surface2, borderRadius: 8 }}>
              {[
                { l: "Status", v: selected.status?.replace(/_/g, " ") }, { l: "Fulfillment", v: selected.fulfillment_status }, { l: "Payment", v: selected.payment_status },
                { l: "Order Date", v: new Date(selected.order_date).toLocaleDateString() }, { l: "Channel", v: selected.channel }, { l: "Total", v: fmt(selected.total) },
              ].map(d => <div key={d.l}><div style={{ fontSize: 9, color: T.text3, fontWeight: 700, textTransform: "uppercase" }}>{d.l}</div><div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginTop: 2, textTransform: "capitalize" }}>{d.v}</div></div>)}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 8 }}>Line Items</div>
            {selItems.length === 0 ? <div style={{ fontSize: 12, color: T.text3, textAlign: "center", padding: 12 }}>No line items</div> :
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead><tr style={{ borderBottom: `2px solid ${T.border}` }}>
                    {["Item", "SKU", "Qty", "Price", "Total"].map(h => <th key={h} style={{ textAlign: "left", padding: "6px 8px", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase" }}>{h}</th>)}
                  </tr></thead>
                  <tbody>{selItems.map(item => (
                    <tr key={item.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                      <td style={{ padding: "8px", color: T.text, fontWeight: 600 }}>{item.title}</td>
                      <td style={{ padding: "8px", fontFamily: "monospace", fontSize: 11, color: T.accent }}>{item.sku || getVariant(item.variant_id)?.sku || "—"}</td>
                      <td style={{ padding: "8px" }}>{item.quantity}</td>
                      <td style={{ padding: "8px" }}>{fmt(item.unit_price)}</td>
                      <td style={{ padding: "8px", fontWeight: 700 }}>{fmt(item.total || item.quantity * item.unit_price)}</td>
                    </tr>
                  ))}</tbody>
                  <tfoot><tr style={{ borderTop: `2px solid ${T.border}` }}><td colSpan={4} style={{ padding: "8px", fontWeight: 700, textAlign: "right" }}>Total</td><td style={{ padding: "8px", fontWeight: 800, color: T.accent }}>{fmt(selItems.reduce((s,i)=>s+(i.total||0),0))}</td></tr></tfoot>
                </table>
              </div>
            }

            {/* Shipping Address */}
            {selected.shipping_name && (
              <div style={{ marginTop: 12, padding: "10px 12px", background: T.surface2, borderRadius: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 4 }}>📍 Ship To</div>
                <div style={{ fontSize: 12, color: T.text, lineHeight: 1.5 }}>
                  <div style={{ fontWeight: 600 }}>{selected.shipping_name}</div>
                  {selected.shipping_address_line1 && <div>{selected.shipping_address_line1}</div>}
                  <div>{[selected.shipping_city, selected.shipping_state, selected.shipping_postal_code].filter(Boolean).join(", ")}</div>
                  {selected.shipping_phone && <div style={{ color: T.text3, fontSize: 11 }}>📞 {selected.shipping_phone}</div>}
                </div>
              </div>
            )}

            {/* Carrier info if shipped */}
            {selected.carrier_id && (() => {
              const car = carriers.find(c => c.id === selected.carrier_id);
              const svc = carrierServices.find(s => s.id === selected.service_id);
              return car && (
                <div style={{ marginTop: 8, padding: "8px 12px", background: "#10B98110", border: "1px solid #10B98130", borderRadius: 8, fontSize: 11, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontWeight: 700, color: "#10B981" }}>✅ {car.name}</span>
                  {svc && <span style={{ color: T.text3 }}>· {svc.name}</span>}
                  {svc && <span style={{ color: T.text3 }}>· {svc.estimated_days_min}-{svc.estimated_days_max}d</span>}
                </div>
              );
            })()}

            {selected.notes && <div style={{ marginTop: 8, fontSize: 11, color: T.text3, padding: "8px 10px", background: T.surface2, borderRadius: 6 }}>{selected.notes}</div>}
          </div>
        )}
      </div>

      {/* Ship Order Modal */}
      {showShipModal && selected && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowShipModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: 14, padding: isMobile ? 14 : 24, width: "min(540px, 95vw)", maxHeight: "90vh", overflow: "auto" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#10B981", marginBottom: 4 }}>📦 Ship Order — {selected.order_number}</div>
            <div style={{ fontSize: 12, color: T.text3, marginBottom: 16 }}>{getCustomer(selected.customer_id)?.name || "DTC"} · {selItems.length} item{selItems.length !== 1 ? "s" : ""} · {fmt(selected.total)}</div>

            {selected.shipping_name && (
              <div style={{ padding: "8px 12px", background: T.surface2, borderRadius: 8, marginBottom: 12, fontSize: 11 }}>
                <div style={{ fontWeight: 700, color: T.text }}>📍 {selected.shipping_name}</div>
                <div style={{ color: T.text3 }}>{selected.shipping_address_line1}{selected.shipping_city ? `, ${selected.shipping_city}` : ""} {selected.shipping_state} {selected.shipping_postal_code}</div>
              </div>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Carrier *</div>
                <Select value={shipForm.carrier_id} onChange={v => setShipForm(f => ({ ...f, carrier_id: v, service_id: "" }))} placeholder="Select carrier…"
                  options={carriers.filter(c => c.is_active).map(c => ({ value: c.id, label: c.name, sublabel: `${c.carrier_type?.replace(/_/g," ")} · via ${c.integration || "direct"}`, icon: { usps: "📮", ups: "📦", fedex: "✈️", dhl: "🟡", stord: "🏭" }[c.code] || "🚚" }))} /></div>

              {shipForm.carrier_id && (
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Service *</div>
                  <Select value={shipForm.service_id} onChange={v => setShipForm(f => ({ ...f, service_id: v }))} placeholder="Select service…"
                    options={carrierServices.filter(s => s.carrier_id === shipForm.carrier_id && s.is_active).map(s => ({ value: s.id, label: s.name, sublabel: `${s.estimated_days_min}-${s.estimated_days_max} days · ~${fmt(s.base_rate)}` }))} /></div>
              )}

              {shipForm.service_id && (() => { const svc = carrierServices.find(s => s.id === shipForm.service_id); return svc && (
                <div style={{ padding: "10px 12px", background: "#EFF6FF15", border: "1px solid #93C5FD40", borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div><div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{svc.name}</div><div style={{ fontSize: 11, color: T.text3 }}>{svc.estimated_days_min}-{svc.estimated_days_max} business days</div></div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: T.accent }}>~{fmt(svc.base_rate)}</div>
                </div>
              ); })()}

              <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Tracking Number</div><input value={shipForm.tracking_number} onChange={e => setShipForm(f => ({ ...f, tracking_number: e.target.value }))} placeholder="Enter or auto-generate" style={{ width: "100%", padding: "8px 12px", fontSize: 12, fontFamily: "monospace", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, outline: "none", boxSizing: "border-box" }} /></div>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Weight (g)</div><input type="number" value={shipForm.weight_g} onChange={e => setShipForm(f => ({ ...f, weight_g: e.target.value }))} placeholder="180" style={{ width: "100%", padding: "8px 12px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, outline: "none", boxSizing: "border-box" }} /></div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <button style={{ padding: "10px", fontSize: 12, fontWeight: 600, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text2, cursor: "pointer" }}>🖨 Generate Label</button>
                <button style={{ padding: "10px", fontSize: 12, fontWeight: 600, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text2, cursor: "pointer" }}>🧾 Packing Slip</button>
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => setShowShipModal(false)} style={{ padding: "8px 16px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text3, cursor: "pointer" }}>Cancel</button>
                <button onClick={async () => {
                  if (!shipForm.carrier_id) return;
                  const car = carriers.find(c => c.id === shipForm.carrier_id);
                  const svc = carrierServices.find(s => s.id === shipForm.service_id);
                  const shipNum = `SHP-${selected.order_number.replace("ORD-", "")}`;
                  const trackUrl = car?.tracking_url_template && shipForm.tracking_number ? car.tracking_url_template.replace("{tracking}", shipForm.tracking_number) : null;
                  const { data: shipment } = await supabase.from("erp_shipments").insert({ order_id: selected.id, shipment_number: shipNum, carrier: car?.name, carrier_id: shipForm.carrier_id, service_id: shipForm.service_id || null, tracking_number: shipForm.tracking_number || null, tracking_url: trackUrl, rate_amount: svc?.base_rate || null, weight_g: parseFloat(shipForm.weight_g) || null, status: "shipped", shipped_at: new Date().toISOString() }).select().single();
                  await supabase.from("erp_orders").update({ carrier_id: shipForm.carrier_id, service_id: shipForm.service_id || null, weight_g: parseFloat(shipForm.weight_g) || null }).eq("id", selected.id);

                  // Auto-generate AR Invoice (Checklist 3.4)
                  const invNum = `INV-${selected.order_number.replace("ORD-", "")}`;
                  const cust = getCustomer(selected.customer_id);
                  const dueDate = new Date(); dueDate.setDate(dueDate.getDate() + (cust?.payment_terms === "net_15" ? 15 : cust?.payment_terms === "net_60" ? 60 : 30));
                  const { data: inv } = await supabase.from("erp_ar_invoices").insert({ invoice_number: invNum, order_id: selected.id, customer_id: selected.customer_id, shipment_id: shipment?.id || null, status: "sent", invoice_date: new Date().toISOString().slice(0,10), due_date: dueDate.toISOString().slice(0,10), subtotal: selected.subtotal || selected.total, total: selected.total, payment_terms: cust?.payment_terms || "net_30" }).select().single();
                  if (inv) {
                    const invItems = selItems.map((i, idx) => ({ invoice_id: inv.id, order_item_id: i.id, variant_id: i.variant_id, sku: i.sku, title: i.title, quantity: i.quantity, unit_price: i.unit_price, total: i.total || i.quantity * i.unit_price, sort_order: idx }));
                    await supabase.from("erp_ar_invoice_items").insert(invItems);
                    setArInvoices(p => [inv, ...p]);
                    await supabase.from("erp_orders").update({ ar_invoice_id: inv.id }).eq("id", selected.id);
                  }

                  // GL: DR AR + DR COGS, CR Revenue + CR Inventory (Checklist 8.1.3)
                  const orderTotal = selected.total || 0;
                  const costTotal = selItems.reduce((s, i) => { const v = variants.find(x => x.id === i.variant_id); return s + (i.quantity || 0) * (v?.cost || 0); }, 0);
                  await postJournalEntry("shipment", "order", selected.id,
                    `Shipment: ${selected.order_number} — ${getCustomer(selected.customer_id)?.name || "DTC"}`,
                    [{ account: "1100", name: "Accounts Receivable", debit: orderTotal, desc: "Customer invoice" },
                     { account: "5000", name: "Cost of Goods Sold", debit: costTotal, desc: "COGS on shipment" },
                     { account: "4000", name: "Revenue - Product Sales", credit: orderTotal, desc: "Revenue recognized" },
                     { account: "1210", name: "Inventory - Finished Goods", credit: costTotal, desc: "Inventory consumed" }]);

                  updateOrderStatus(selected.id, "shipped");
                  setShowShipModal(false);
                }} disabled={!shipForm.carrier_id} style={{ padding: "8px 20px", fontSize: 12, fontWeight: 700, background: "#10B981", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", opacity: !shipForm.carrier_id ? 0.5 : 1 }}>✓ Confirm & Ship</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showNew && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowNew(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: 14, padding: isMobile ? 14 : 24, width: "min(650px, 95vw)", maxHeight: "90vh", overflow: "auto" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 16 }}>New Order</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Channel</div><Select value={form.channel} onChange={v => setForm(f => ({ ...f, channel: v }))} options={[{ value: "manual", label: "Manual", icon: "⚪" }, { value: "shopify", label: "Shopify", icon: "🟢" }, { value: "amazon", label: "Amazon", icon: "🟠" }, { value: "retail", label: "Retail", icon: "🔵" }, { value: "wholesale", label: "Wholesale", icon: "🟣" }]} /></div>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Customer</div><Select value={form.customer_id} onChange={v => setForm(f => ({ ...f, customer_id: v }))} placeholder="Select customer…" options={customers.map(c => ({ value: c.id, label: c.name, sublabel: c.customer_type?.replace(/_/g, " "), icon: "👥" }))} /></div>
              </div>
              {/* Line items */}
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Line Items</div>
                  <button onClick={addLine} style={{ padding: "4px 10px", fontSize: 11, fontWeight: 600, background: T.accentDim, color: T.accent, border: `1px solid ${T.accent}30`, borderRadius: 6, cursor: "pointer" }}>+ Line</button>
                </div>
                {lineItems.map((line, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr 1fr auto", gap: 6, marginBottom: 6, alignItems: "end" }}>
                    <div>{i === 0 && <div style={{ fontSize: 9, color: T.text3, fontWeight: 700, marginBottom: 2 }}>PRODUCT</div>}<Select value={line.variant_id} onChange={v => onLineVariantChange(i, v)} placeholder="Select…" options={variants.map(v => ({ value: v.id, label: `${v.sku} — ${v.name}`, sublabel: v.size || "", icon: "📦" }))} /></div>
                    <div>{i === 0 && <div style={{ fontSize: 9, color: T.text3, fontWeight: 700, marginBottom: 2 }}>QTY</div>}<input type="number" value={line.quantity} onChange={e => updateLine(i, "quantity", e.target.value)} style={{ ...inp, padding: "7px 10px" }} /></div>
                    <div>{i === 0 && <div style={{ fontSize: 9, color: T.text3, fontWeight: 700, marginBottom: 2 }}>PRICE</div>}<input type="number" step="0.01" value={line.unit_price} onChange={e => updateLine(i, "unit_price", e.target.value)} style={{ ...inp, padding: "7px 10px" }} /></div>
                    <button onClick={() => removeLine(i)} style={{ padding: "6px 8px", background: "none", border: "none", color: "#EF4444", cursor: "pointer", fontSize: 14 }}>✕</button>
                  </div>
                ))}
                {lineItems.length > 0 && <div style={{ textAlign: "right", fontSize: 14, fontWeight: 800, color: T.accent, paddingTop: 8, borderTop: `2px solid ${T.border}` }}>{fmt(lineTotal)}</div>}
              </div>
              <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Notes</div><input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Order notes…" style={inp} /></div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => { setShowNew(false); setLineItems([]); }} style={{ padding: "8px 16px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text3, cursor: "pointer" }}>Cancel</button>
                <button onClick={createOrder} disabled={lineItems.length === 0} style={{ padding: "8px 16px", fontSize: 12, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", opacity: lineItems.length === 0 ? 0.5 : 1 }}>Create Order</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CUSTOMERS VIEW — with CRUD
// ═══════════════════════════════════════════════════════════════════════════════
function CustomersView({ navigateTo, pendingNav, setPendingNav, customers, setCustomers, orders, isMobile }) {
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState(null);
  useEffect(() => { if (pendingNav?.view === "customers" && pendingNav.selectId) { const c = customers.find(x => x.id === pendingNav.selectId); if (c) setSelected(c); setPendingNav(null); } }, [pendingNav]);
  const [form, setForm] = useState({ name: "", customer_type: "retail", email: "", phone: "", website: "", payment_terms: "net_30", credit_limit: "", notes: "" });
  const [typeFilter, setTypeFilter] = useState("all");
  const filtered = customers.filter(c => typeFilter === "all" || c.customer_type === typeFilter);
  const totalRev = orders.reduce((s, o) => s + (o.total || 0), 0);
  const inp = { width: "100%", padding: "8px 12px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, outline: "none", boxSizing: "border-box" };

  const saveCustomer = async () => {
    if (!form.name.trim()) return;
    const payload = { ...form, credit_limit: parseFloat(form.credit_limit) || null };
    if (selected && showNew) {
      const { data } = await supabase.from("erp_customers").update(payload).eq("id", selected.id).select().single();
      if (data) { setCustomers(p => p.map(x => x.id === data.id ? data : x)); setSelected(data); }
    } else {
      const { data } = await supabase.from("erp_customers").insert(payload).select().single();
      if (data) { setCustomers(p => [...p, data]); setSelected(data); }
    }
    setShowNew(false);
  };

  const custOrders = selected ? orders.filter(o => o.customer_id === selected.id).sort((a, b) => new Date(b.order_date) - new Date(a.order_date)) : [];
  const custRev = custOrders.reduce((s, o) => s + (o.total || 0), 0);
  const CHANNEL_COLORS = { shopify: "#95BF47", amazon: "#FF9900", retail: "#3B82F6", wholesale: "#8B5CF6" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div><div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>Customers</div><div style={{ fontSize: 12, color: T.text3 }}>{customers.length} accounts · {fmt(totalRev)} total revenue</div></div>
        <button onClick={() => { setForm({ name: "", customer_type: "retail", email: "", phone: "", website: "", payment_terms: "net_30", credit_limit: "", notes: "" }); setSelected(null); setShowNew(true); }} style={{ padding: "6px 14px", fontSize: 12, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>+ Customer</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 8 }}>
        {[{ l: "Total Accounts", v: customers.length, c: T.accent }, { l: "Retail", v: customers.filter(c=>c.customer_type==="retail").length, c: "#3B82F6" }, { l: "Wholesale", v: customers.filter(c=>c.customer_type==="wholesale").length, c: "#8B5CF6" }, { l: "Total Revenue", v: fmt(totalRev), c: "#10B981" }].map(s => (
          <Card key={s.l} style={{ textAlign: "center", padding: 10 }}><div style={{ fontSize: 18, fontWeight: 900, color: s.c }}>{s.v}</div><div style={{ fontSize: 9, color: T.text3 }}>{s.l}</div></Card>
        ))}
      </div>

      <div style={{ display: "flex", gap: 3, background: T.surface2, borderRadius: 7, padding: 2, flexWrap: "wrap" }}>
        {[["all","All"],["retail","🏬 Retail"],["wholesale","📦 Wholesale"],["dtc","🛒 DTC"],["distributor","🚚 Distributor"]].map(([v,l]) => (
          <button key={v} onClick={() => setTypeFilter(v)} style={{ padding: "4px 10px", borderRadius: 5, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, background: typeFilter === v ? T.surface : "transparent", color: typeFilter === v ? T.text : T.text3 }}>{l}</button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : selected ? "1fr 1.2fr" : "1fr 1fr", gap: selected ? 16 : 10 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map(c => {
            const cOrders = orders.filter(o => o.customer_id === c.id);
            const cRev = cOrders.reduce((s, o) => s + (o.total || 0), 0);
            const sel = selected?.id === c.id;
            return (
              <Card key={c.id} onClick={() => setSelected(c)} style={{ padding: "12px 14px", cursor: "pointer", borderLeft: sel ? `3px solid ${T.accent}` : "3px solid transparent" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{c.name}</div>
                    <div style={{ fontSize: 10, color: T.text3, marginTop: 2, textTransform: "capitalize" }}>{c.customer_type?.replace(/_/g, " ")}{c.payment_terms ? ` · ${c.payment_terms.replace(/_/g, " ")}` : ""}</div>
                  </div>
                  <div style={{ textAlign: "right" }}><div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>{fmt(cRev)}</div><div style={{ fontSize: 10, color: T.text3 }}>{cOrders.length} orders</div></div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Detail panel */}
        {selected && !isMobile && (
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20, overflow: "auto", maxHeight: "calc(100vh - 240px)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>{selected.name}</div>
                <div style={{ fontSize: 12, color: T.text3, textTransform: "capitalize" }}>{selected.customer_type?.replace(/_/g, " ")}</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => { setForm({ ...selected, credit_limit: selected.credit_limit || "" }); setShowNew(true); }} style={{ padding: "5px 10px", fontSize: 11, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text2, cursor: "pointer" }}>Edit</button>
                <button onClick={async () => { if (!window.confirm(`Delete ${selected.name}?`)) return; await supabase.from("erp_customers").delete().eq("id", selected.id); setCustomers(p => p.filter(x => x.id !== selected.id)); setSelected(null); }} style={{ padding: "5px 10px", fontSize: 11, background: "#FEE2E2", border: "1px solid #FECACA", borderRadius: 6, color: "#991B1B", cursor: "pointer" }}>Delete</button>
                <Pill status={selected.status} />
              </div>
            </div>

            {/* Customer KPIs */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
              {[{ l: "Total Revenue", v: fmt(custRev), c: "#10B981" }, { l: "Orders", v: custOrders.length, c: T.accent }, { l: "Avg Order", v: custOrders.length > 0 ? fmt(custRev / custOrders.length) : "—", c: "#F59E0B" }].map(s => (
                <div key={s.l} style={{ textAlign: "center", padding: 8, background: T.surface2, borderRadius: 8 }}><div style={{ fontSize: 16, fontWeight: 800, color: s.c }}>{s.v}</div><div style={{ fontSize: 9, color: T.text3 }}>{s.l}</div></div>
              ))}
            </div>

            {/* Contact info */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12, padding: "12px 14px", background: T.surface2, borderRadius: 8 }}>
              {[
                { l: "Email", v: selected.email || "—" }, { l: "Phone", v: selected.phone || "—" },
                { l: "Payment Terms", v: selected.payment_terms?.replace(/_/g, " ") || "—" }, { l: "Credit Limit", v: selected.credit_limit ? fmt(selected.credit_limit) : "—" },
                { l: "Source", v: selected.source || "—" }, { l: "Lifetime Orders", v: selected.total_orders || 0 },
                { l: "Lifetime Spent", v: fmt(selected.total_spent) }, { l: "Last Order", v: selected.last_order_at ? new Date(selected.last_order_at).toLocaleDateString() : "—" },
              ].map(d => <div key={d.l}><div style={{ fontSize: 9, color: T.text3, fontWeight: 700, textTransform: "uppercase" }}>{d.l}</div><div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginTop: 2 }}>{d.v}</div></div>)}
            </div>

            {/* Address */}
            {selected.address_line1 && (
              <div style={{ marginBottom: 12, padding: "10px 12px", background: T.surface2, borderRadius: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, marginBottom: 4 }}>📍 ADDRESS</div>
                <div style={{ fontSize: 12, color: T.text, lineHeight: 1.5 }}>
                  {selected.address_line1}{selected.address_line2 ? `, ${selected.address_line2}` : ""}
                  <br />{[selected.city, selected.state, selected.postal_code].filter(Boolean).join(", ")}{selected.country && selected.country !== "US" ? ` · ${selected.country}` : ""}
                </div>
              </div>
            )}

            {/* Tags */}
            {(selected.tags || []).length > 0 && (
              <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
                {selected.tags.map(t => <span key={t} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 10, background: T.accentDim, color: T.accent, fontWeight: 600 }}>{t}</span>)}
              </div>
            )}

            {/* Order history */}
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 8 }}>Order History ({custOrders.length})</div>
            {custOrders.length === 0 ? <div style={{ fontSize: 12, color: T.text3 }}>No orders</div> :
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead><tr style={{ borderBottom: `2px solid ${T.border}` }}>
                    {["Order", "Date", "Channel", "Status", "Total"].map(h => <th key={h} style={{ textAlign: "left", padding: "5px 6px", fontSize: 9, fontWeight: 700, color: T.text3, textTransform: "uppercase" }}>{h}</th>)}
                  </tr></thead>
                  <tbody>{custOrders.slice(0, 10).map(o => (
                    <tr key={o.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                      <td style={{ padding: "6px" }}><span onClick={e => { e.stopPropagation(); navigateTo("orders", o.id); }} style={{ fontFamily: "monospace", fontWeight: 700, color: T.accent, cursor: "pointer", textDecoration: "underline dotted" }} onMouseEnter={e => e.currentTarget.style.textDecoration = "underline"} onMouseLeave={e => e.currentTarget.style.textDecoration = "underline dotted"}>{o.order_number}</span></td>
                      <td style={{ padding: "6px", color: T.text3 }}>{new Date(o.order_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
                      <td style={{ padding: "6px" }}><span style={{ width: 6, height: 6, borderRadius: "50%", background: CHANNEL_COLORS[o.channel] || T.text3, display: "inline-block", marginRight: 4 }} />{o.channel}</td>
                      <td style={{ padding: "6px" }}><Pill status={o.status} /></td>
                      <td style={{ padding: "6px", fontWeight: 700 }}>{fmt(o.total)}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            }

            {selected.notes && <div style={{ marginTop: 12, fontSize: 11, color: T.text3, padding: "8px 10px", background: T.surface2, borderRadius: 6 }}>{selected.notes}</div>}
          </div>
        )}
      </div>

      {showNew && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowNew(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: 14, padding: isMobile ? 14 : 24, width: "min(520px, 95vw)" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 16 }}>{selected ? "Edit Customer" : "New Customer"}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Name *</div><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inp} /></div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Type</div><Select value={form.customer_type} onChange={v => setForm(f => ({ ...f, customer_type: v }))} options={[{value:"retail",label:"Retail",icon:"🏬"},{value:"wholesale",label:"Wholesale",icon:"📦"},{value:"dtc",label:"DTC",icon:"🛒"},{value:"distributor",label:"Distributor",icon:"🚚"},{value:"amazon",label:"Amazon",icon:"🟠"}]} /></div>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Email</div><input value={form.email || ""} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} style={inp} /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Phone</div><input value={form.phone || ""} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} style={inp} /></div>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Website</div><input value={form.website || ""} onChange={e => setForm(f => ({ ...f, website: e.target.value }))} placeholder="https://" style={inp} /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Payment Terms</div><select value={form.payment_terms} onChange={e => setForm(f => ({ ...f, payment_terms: e.target.value }))} style={inp}>{["prepaid","cod","net_15","net_30","net_45","net_60","net_90"].map(t => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}</select></div>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Credit Limit</div><input type="number" value={form.credit_limit} onChange={e => setForm(f => ({ ...f, credit_limit: e.target.value }))} placeholder="0" style={inp} /></div>
              </div>
              <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Notes</div><textarea value={form.notes || ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...inp, resize: "vertical" }} /></div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => setShowNew(false)} style={{ padding: "8px 16px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text3, cursor: "pointer" }}>Cancel</button>
                <button onClick={saveCustomer} disabled={!form.name.trim()} style={{ padding: "8px 16px", fontSize: 12, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", opacity: !form.name.trim() ? 0.5 : 1 }}>{selected ? "Save" : "Create"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MANUFACTURING VIEW — with work order creation
// ═══════════════════════════════════════════════════════════════════════════════
function ManufacturingView({ navigateTo, workOrders, setWorkOrders, variants, products, facilities, boms, bomItems, lots, setLots, inventory, setInventory, isMobile }) {
  const [showNew, setShowNew] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ variant_id: "", facility_id: "", planned_quantity: "", planned_start: "", planned_end: "", notes: "" });
  const getVariant = id => variants.find(v => v.id === id);
  const getFacility = id => facilities.find(f => f.id === id);
  const filtered = workOrders.filter(wo => statusFilter === "all" || wo.status === statusFilter);
  const factories = facilities.filter(f => f.facility_type === "factory");

  const nextWONum = () => {
    const year = new Date().getFullYear();
    const existing = workOrders.filter(w => w.wo_number.startsWith(`WO-${year}`));
    const max = existing.reduce((m, w) => { const n = parseInt(w.wo_number.split("-")[2]) || 0; return Math.max(m, n); }, 0);
    return `WO-${year}-${String(max + 1).padStart(4, "0")}`;
  };

  const createWO = async () => {
    if (!form.variant_id || !form.planned_quantity) return;
    const vBom = boms.find(b => b.variant_id === form.variant_id && b.status === "active");
    const payload = {
      variant_id: form.variant_id,
      bom_id: vBom?.id || null,
      facility_id: form.facility_id || null,
      planned_quantity: parseFloat(form.planned_quantity),
      planned_start: form.planned_start || null,
      planned_end: form.planned_end || null,
      notes: form.notes,
    };
    if (selected && (selected.status === "planned" || selected.status === "released")) {
      const { data } = await supabase.from("erp_work_orders").update(payload).eq("id", selected.id).select().single();
      if (data) { setWorkOrders(p => p.map(x => x.id === data.id ? data : x)); setSelected(data); }
    } else {
      const { data } = await supabase.from("erp_work_orders").insert({ ...payload, wo_number: nextWONum(), status: "planned" }).select().single();
      if (data) { setWorkOrders(p => [data, ...p]); setSelected(data); }
    }
    setShowNew(false);
    setForm({ variant_id: "", facility_id: "", planned_quantity: "", planned_start: "", planned_end: "", notes: "" });
  };

  const updateWOStatus = async (wo, newStatus) => {
    const updates = { status: newStatus };
    if (newStatus === "in_progress") updates.actual_start = new Date().toISOString();
    if (newStatus === "completed") { updates.actual_end = new Date().toISOString(); updates.completed_quantity = wo.planned_quantity; }
    const { data } = await supabase.from("erp_work_orders").update(updates).eq("id", wo.id).select().single();
    if (data) { setWorkOrders(p => p.map(x => x.id === data.id ? data : x)); setSelected(data); }
  };

  const totalPlanned = workOrders.filter(w => w.status !== "cancelled").reduce((s, w) => s + (w.planned_quantity || 0), 0);
  const totalCompleted = workOrders.reduce((s, w) => s + (w.completed_quantity || 0), 0);
  const inProgress = workOrders.filter(w => w.status === "in_progress").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div><div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>Manufacturing</div><div style={{ fontSize: 12, color: T.text3 }}>{workOrders.length} work orders</div></div>
        <button onClick={() => setShowNew(true)} style={{ padding: "6px 14px", fontSize: 12, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>+ Work Order</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 8 }}>
        {[{ l: "Planned", v: fmtN(totalPlanned), c: T.accent }, { l: "Completed", v: fmtN(totalCompleted), c: "#10B981" }, { l: "In Progress", v: inProgress, c: "#F59E0B" }, { l: "Yield", v: totalPlanned > 0 ? `${Math.round((totalCompleted / totalPlanned) * 100)}%` : "—", c: "#3B82F6" }].map(s => (
          <Card key={s.l} style={{ textAlign: "center", padding: 10 }}><div style={{ fontSize: 18, fontWeight: 900, color: s.c }}>{s.v}</div><div style={{ fontSize: 9, color: T.text3 }}>{s.l}</div></Card>
        ))}
      </div>

      <div style={{ display: "flex", gap: 3, background: T.surface2, borderRadius: 7, padding: 2, flexWrap: "wrap" }}>
        {[["all","All"],["planned","Planned"],["released","Released"],["in_progress","In Progress"],["completed","Completed"]].map(([v,l]) => (
          <button key={v} onClick={() => setStatusFilter(v)} style={{ padding: "4px 10px", borderRadius: 5, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, background: statusFilter === v ? T.surface : "transparent", color: statusFilter === v ? T.text : T.text3 }}>{l}</button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : selected ? "1fr 1fr" : "1fr", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.length === 0 ? <EmptyState icon="⚙" text="No work orders found" /> :
            filtered.map(wo => {
              const v = getVariant(wo.variant_id);
              const f = getFacility(wo.facility_id);
              const pct = wo.planned_quantity > 0 ? Math.round(((wo.completed_quantity || 0) / wo.planned_quantity) * 100) : 0;
              const sel = selected?.id === wo.id;
              return (
                <Card key={wo.id} onClick={() => setSelected(wo)} style={{ padding: "12px 14px", cursor: "pointer", borderLeft: sel ? `3px solid ${T.accent}` : "3px solid transparent" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}><span style={{ fontSize: 13, fontWeight: 800, fontFamily: "monospace", color: T.accent }}>{wo.wo_number}</span><Pill status={wo.status} /></div>
                    <div style={{ fontSize: 12, fontWeight: 700 }}>{fmtN(wo.completed_quantity || 0)} / {fmtN(wo.planned_quantity)}</div>
                  </div>
                  <div style={{ fontSize: 12, color: T.text, marginBottom: 4 }}>{v?.sku || ""} — {v?.name || "Unknown"}</div>
                  <div style={{ height: 4, background: T.surface2, borderRadius: 4, overflow: "hidden", marginBottom: 4 }}><div style={{ height: "100%", width: `${pct}%`, background: pct >= 100 ? "#10B981" : pct > 0 ? T.accent : T.surface2, borderRadius: 4 }} /></div>
                  <div style={{ fontSize: 10, color: T.text3 }}>{f?.name || "—"}{wo.planned_start ? ` · Start ${new Date(wo.planned_start).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}</div>
                </Card>
              );
            })
          }
        </div>

        {selected && !isMobile && (
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20, overflow: "auto", maxHeight: "calc(100vh - 240px)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "monospace", color: T.accent }}>{selected.wo_number}</div>
                <div style={{ fontSize: 12, color: T.text3, marginTop: 2 }}>{getVariant(selected.variant_id)?.name || "—"}</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {(selected.status === "planned" || selected.status === "released") && <button onClick={() => { setForm({ variant_id: selected.variant_id, facility_id: selected.facility_id || "", planned_quantity: selected.planned_quantity || "", planned_start: selected.planned_start || "", planned_end: selected.planned_end || "", notes: selected.notes || "" }); setShowNew(true); }} style={{ padding: "5px 10px", fontSize: 11, fontWeight: 600, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text2, cursor: "pointer" }}>Edit</button>}
                {selected.status === "planned" && <button onClick={() => updateWOStatus(selected, "released")} style={{ padding: "5px 10px", fontSize: 11, fontWeight: 600, background: "#EFF6FF", border: "1px solid #93C5FD", borderRadius: 6, color: "#1D4ED8", cursor: "pointer" }}>Release</button>}
                {selected.status === "released" && <button onClick={() => updateWOStatus(selected, "in_progress")} style={{ padding: "5px 10px", fontSize: 11, fontWeight: 600, background: "#FEF3C7", border: "1px solid #FCD34D", borderRadius: 6, color: "#92400E", cursor: "pointer" }}>Start</button>}
                {selected.status === "in_progress" && <button onClick={() => updateWOStatus(selected, "completed")} style={{ padding: "5px 10px", fontSize: 11, fontWeight: 600, background: "#D1FAE5", border: "1px solid #6EE7B7", borderRadius: 6, color: "#065F46", cursor: "pointer" }}>Complete</button>}
                {selected.status !== "cancelled" && selected.status !== "completed" && <button onClick={() => updateWOStatus(selected, "cancelled")} style={{ padding: "5px 10px", fontSize: 11, fontWeight: 600, background: "#FEE2E2", border: "1px solid #FECACA", borderRadius: 6, color: "#991B1B", cursor: "pointer" }}>Cancel</button>}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, padding: "12px 14px", background: T.surface2, borderRadius: 8, marginBottom: 12 }}>
              {[
                { l: "Status", v: selected.status?.replace(/_/g, " ") }, { l: "Planned Qty", v: fmtN(selected.planned_quantity) }, { l: "Completed", v: fmtN(selected.completed_quantity || 0) },
                { l: "Facility", v: getFacility(selected.facility_id)?.name || "—" }, { l: "Start", v: selected.planned_start ? new Date(selected.planned_start).toLocaleDateString() : "—" }, { l: "End", v: selected.planned_end ? new Date(selected.planned_end).toLocaleDateString() : "—" },
              ].map(d => <div key={d.l}><div style={{ fontSize: 9, color: T.text3, fontWeight: 700, textTransform: "uppercase" }}>{d.l}</div><div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginTop: 2, textTransform: "capitalize" }}>{d.v}</div></div>)}
            </div>
            {selected.notes && <div style={{ fontSize: 11, color: T.text3, padding: "8px 10px", background: T.surface2, borderRadius: 6, marginBottom: 12 }}>{selected.notes}</div>}

            {/* BOM Material Requirements */}
            {(() => {
              const woBom = boms.find(b => b.id === selected.bom_id);
              const woItems = woBom ? bomItems.filter(bi => bi.bom_id === woBom.id).sort((a, b) => a.sort_order - b.sort_order) : [];
              const multiplier = selected.planned_quantity / (woBom?.batch_size || selected.planned_quantity || 1);
              if (woItems.length === 0) return <div style={{ fontSize: 11, color: T.text3 }}>No BOM linked — {selected.bom_id ? "BOM has no items" : "link a BOM to see material requirements"}</div>;
              const materialItems = woItems.filter(i => i.item_type !== "labor");
              const laborItems = woItems.filter(i => i.item_type === "labor");
              const totalMaterialCost = materialItems.reduce((s, i) => s + ((i.quantity || 0) * (i.cost_per_unit || 0) * multiplier), 0);
              const totalLaborCost = laborItems.reduce((s, i) => s + ((i.quantity || 0) * (i.cost_per_unit || 0) * multiplier), 0);
              const totalCost = totalMaterialCost + totalLaborCost;
              return (
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Material Requirements</div>
                    <span style={{ fontSize: 10, color: T.text3 }}>{woBom?.name} v{woBom?.version}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
                    <div style={{ textAlign: "center", padding: 8, background: T.surface2, borderRadius: 8 }}><div style={{ fontSize: 14, fontWeight: 800, color: T.accent }}>{fmt(totalMaterialCost)}</div><div style={{ fontSize: 9, color: T.text3 }}>Materials</div></div>
                    <div style={{ textAlign: "center", padding: 8, background: T.surface2, borderRadius: 8 }}><div style={{ fontSize: 14, fontWeight: 800, color: "#8B5CF6" }}>{fmt(totalLaborCost)}</div><div style={{ fontSize: 9, color: T.text3 }}>Labor</div></div>
                    <div style={{ textAlign: "center", padding: 8, background: T.surface2, borderRadius: 8 }}><div style={{ fontSize: 14, fontWeight: 800, color: "#10B981" }}>{selected.planned_quantity > 0 ? fmt(totalCost / selected.planned_quantity) : "—"}</div><div style={{ fontSize: 9, color: T.text3 }}>Cost/Unit</div></div>
                  </div>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                      <thead><tr style={{ borderBottom: `1px solid ${T.border}` }}>
                        {["Material", "Type", "Per Unit", "Required", "Unit", "Cost"].map(h => <th key={h} style={{ textAlign: "left", padding: "4px 6px", fontSize: 9, fontWeight: 700, color: T.text3, textTransform: "uppercase" }}>{h}</th>)}
                      </tr></thead>
                      <tbody>
                        {woItems.map(item => (
                          <tr key={item.id} style={{ borderBottom: `1px solid ${T.border}20` }}>
                            <td style={{ padding: "5px 6px", fontWeight: 600, color: T.text }}>{item.item_name}</td>
                            <td style={{ padding: "5px 6px", color: T.text3, fontSize: 10, textTransform: "capitalize" }}>{item.item_type?.replace(/_/g," ")}</td>
                            <td style={{ padding: "5px 6px", fontFamily: "monospace", color: T.text3 }}>{item.quantity}</td>
                            <td style={{ padding: "5px 6px", fontWeight: 700, color: T.accent }}>{fmtN(Math.ceil(item.quantity * multiplier * (1 + (item.scrap_pct || 0) / 100)))}</td>
                            <td style={{ padding: "5px 6px", color: T.text3 }}>{item.unit}</td>
                            <td style={{ padding: "5px 6px", fontWeight: 600 }}>{fmt(item.quantity * (item.cost_per_unit || 0) * multiplier)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot><tr style={{ borderTop: `1px solid ${T.border}` }}>
                        <td colSpan={5} style={{ padding: "5px 6px", fontWeight: 700, textAlign: "right", fontSize: 10 }}>Total Production Cost</td>
                        <td style={{ padding: "5px 6px", fontWeight: 800, color: T.accent }}>{fmt(totalCost)}</td>
                      </tr></tfoot>
                    </table>
                  </div>
                  {/* Backflush button */}
                  {(selected.status === "in_progress" || selected.status === "released") && (
                    <button onClick={async () => {
                      if (!window.confirm("Backflush all materials for this work order? This will deduct component inventory.")) return;
                      for (const item of materialItems) {
                        const reqQty = Math.ceil(item.quantity * multiplier * (1 + (item.scrap_pct || 0) / 100));
                        await supabase.from("erp_wo_issues").insert({ work_order_id: selected.id, bom_item_id: item.id, item_name: item.item_name, planned_quantity: reqQty, issued_quantity: reqQty, facility_id: selected.facility_id, issue_type: "backflush" });
                      }
                      alert(`✅ Backflushed ${materialItems.length} components for ${selected.wo_number}`);
                    }} style={{ marginTop: 10, padding: "8px 16px", fontSize: 12, fontWeight: 700, background: "#8B5CF620", border: "1px solid #8B5CF640", borderRadius: 8, color: "#5B21B6", cursor: "pointer", width: "100%" }}>⚡ Backflush All Materials</button>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Create WO Modal */}
      {showNew && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowNew(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: 14, padding: isMobile ? 14 : 24, width: "min(520px, 95vw)" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 16 }}>New Work Order</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Product / SKU *</div><Select value={form.variant_id} onChange={v => setForm(f => ({ ...f, variant_id: v }))} placeholder="Select finished good…" options={variants.filter(v => products.find(p => p.id === v.product_id)?.product_type === "finished_good").map(v => ({ value: v.id, label: `${v.sku} — ${v.name}`, sublabel: v.size || "", icon: "📦" }))} /></div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Quantity *</div><input type="number" value={form.planned_quantity} onChange={e => setForm(f => ({ ...f, planned_quantity: e.target.value }))} placeholder="10000" style={{ width: "100%", padding: "8px 12px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, outline: "none", boxSizing: "border-box" }} /></div>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Facility</div><Select value={form.facility_id} onChange={v => setForm(f => ({ ...f, facility_id: v }))} placeholder="Select…" options={(factories.length > 0 ? factories : facilities).map(f => ({ value: f.id, label: f.name, sublabel: f.facility_type?.replace(/_/g," "), icon: {warehouse:"🏢",factory:"🏭","3pl":"🚚"}[f.facility_type]||"🏢" }))} /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Planned Start</div><input type="date" value={form.planned_start} onChange={e => setForm(f => ({ ...f, planned_start: e.target.value }))} style={{ width: "100%", padding: "8px 12px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, boxSizing: "border-box" }} /></div>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Planned End</div><input type="date" value={form.planned_end} onChange={e => setForm(f => ({ ...f, planned_end: e.target.value }))} style={{ width: "100%", padding: "8px 12px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, boxSizing: "border-box" }} /></div>
              </div>
              {form.variant_id && (() => { const vBom = boms.find(b => b.variant_id === form.variant_id && b.status === "active"); return vBom ? <div style={{ fontSize: 11, color: "#10B981", fontWeight: 600, padding: "6px 10px", background: "#D1FAE520", borderRadius: 6 }}>✓ Active BOM: {vBom.name} (v{vBom.version})</div> : <div style={{ fontSize: 11, color: "#F59E0B", fontWeight: 600, padding: "6px 10px", background: "#FEF3C720", borderRadius: 6 }}>⚠ No active BOM found for this variant</div>; })()}
              <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Notes</div><input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Production run notes…" style={{ width: "100%", padding: "8px 12px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, outline: "none", boxSizing: "border-box" }} /></div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => setShowNew(false)} style={{ padding: "8px 16px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text3, cursor: "pointer" }}>Cancel</button>
                <button onClick={createWO} disabled={!form.variant_id || !form.planned_quantity} style={{ padding: "8px 16px", fontSize: 12, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", opacity: !form.variant_id || !form.planned_quantity ? 0.5 : 1 }}>Create Work Order</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FACILITIES VIEW — with CRUD and entity assignment
// ═══════════════════════════════════════════════════════════════════════════════
function FacilitiesView({ facilities, setFacilities, inventory, entities, isMobile }) {
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState({ name: "", facility_type: "warehouse", operator: "", city: "", state: "", country: "US", entity_id: "" });
  const TYPE_ICONS = { warehouse: "🏢", factory: "🏭", "3pl": "🚚", office: "🏫", retail: "🏬" };
  const getEntity = id => entities?.find(e => e.id === id);
  const inp = { width: "100%", padding: "8px 12px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, outline: "none", boxSizing: "border-box" };

  const saveFacility = async () => {
    if (!form.name.trim()) return;
    const payload = { ...form, entity_id: form.entity_id || null };
    if (selected) {
      const { data } = await supabase.from("erp_facilities").update(payload).eq("id", selected.id).select().single();
      if (data) setFacilities(p => p.map(x => x.id === data.id ? data : x));
    } else {
      const { data } = await supabase.from("erp_facilities").insert(payload).select().single();
      if (data) setFacilities(p => [...p, data]);
    }
    setShowNew(false); setSelected(null); setForm({ name: "", facility_type: "warehouse", operator: "", city: "", state: "", country: "US", entity_id: "" });
  };

  const totalUnitsAll = inventory.reduce((s, i) => s + (i.quantity || 0), 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div><div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>Facilities</div><div style={{ fontSize: 12, color: T.text3 }}>{facilities.length} locations · {fmtN(totalUnitsAll)} total units</div></div>
        <button onClick={() => setShowNew(true)} style={{ padding: "6px 14px", fontSize: 12, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>+ Facility</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 8 }}>
        {[{ l: "Warehouses", v: facilities.filter(f=>f.facility_type==="warehouse").length, c: T.accent }, { l: "Factories", v: facilities.filter(f=>f.facility_type==="factory").length, c: "#F59E0B" }, { l: "3PL", v: facilities.filter(f=>f.facility_type==="3pl").length, c: "#3B82F6" }, { l: "Total Units", v: fmtN(totalUnitsAll), c: "#10B981" }].map(s => (
          <Card key={s.l} style={{ textAlign: "center", padding: 10 }}><div style={{ fontSize: 18, fontWeight: 900, color: s.c }}>{s.v}</div><div style={{ fontSize: 9, color: T.text3 }}>{s.l}</div></Card>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
        {facilities.map(f => {
          const facInv = inventory.filter(i => i.facility_id === f.id);
          const totalUnits = facInv.reduce((s, i) => s + (i.quantity || 0), 0);
          const skuCount = new Set(facInv.map(i => i.variant_id).filter(Boolean)).size;
          const ent = getEntity(f.entity_id);
          return (
            <Card key={f.id} style={{ padding: "14px 16px", borderLeft: `3px solid ${f.is_default ? T.accent : "transparent"}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 22 }}>{TYPE_ICONS[f.facility_type] || "🏢"}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{f.name}</span>
                    {f.is_default && <span style={{ fontSize: 9, color: T.accent, fontWeight: 600 }}>DEFAULT</span>}
                    {ent && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: T.surface2, color: T.text3, fontWeight: 600 }}>{ent.code}</span>}
                    <button onClick={e => { e.stopPropagation(); setForm({ name: f.name, facility_type: f.facility_type, operator: f.operator || "", city: f.city || "", state: f.state || "", country: f.country || "US", entity_id: f.entity_id || "" }); setShowNew(true); setSelected(f); }} style={{ padding: "2px 6px", fontSize: 9, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, color: T.text3, cursor: "pointer", marginLeft: "auto" }}>Edit</button>
                    <button onClick={async e => { e.stopPropagation(); if (!window.confirm(`Delete ${f.name}?`)) return; await supabase.from("erp_facilities").delete().eq("id", f.id); setFacilities(p => p.filter(x => x.id !== f.id)); }} style={{ padding: "2px 6px", fontSize: 9, background: "#FEE2E2", border: "1px solid #FECACA", borderRadius: 4, color: "#991B1B", cursor: "pointer" }}>✕</button>
                  </div>
                  <div style={{ fontSize: 11, color: T.text3, textTransform: "capitalize" }}>{f.facility_type?.replace(/_/g, " ")}{f.operator ? ` · ${f.operator}` : ""}</div>
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, fontSize: 11, color: T.text3 }}>
                <span style={{ fontWeight: 700, color: T.text }}>{fmtN(totalUnits)} units</span>
                <span>{skuCount} SKUs</span>
                <span>{f.city}{f.state ? `, ${f.state}` : ""}{f.country && f.country !== "US" ? ` · ${f.country}` : ""}</span>
              </div>
            </Card>
          );
        })}
      </div>

      {showNew && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowNew(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: 14, padding: isMobile ? 14 : 24, width: "min(520px, 95vw)" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 16 }}>New Facility</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Name *</div><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inp} /></div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Type</div><Select value={form.facility_type} onChange={v => setForm(f => ({ ...f, facility_type: v }))} options={[{value:"warehouse",label:"Warehouse",icon:"🏢"},{value:"factory",label:"Factory",icon:"🏭"},{value:"3pl",label:"3PL",icon:"🚚"},{value:"office",label:"Office",icon:"🏫"},{value:"retail",label:"Retail",icon:"🏬"}]} /></div>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Operator</div><input value={form.operator} onChange={e => setForm(f => ({ ...f, operator: e.target.value }))} placeholder="e.g. ShipBob, internal" style={inp} /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 10 }}>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>City</div><input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} style={inp} /></div>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>State</div><input value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} style={inp} /></div>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Country</div><input value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} style={inp} /></div>
              </div>
              <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Legal Entity</div><Select value={form.entity_id} onChange={v => setForm(f => ({ ...f, entity_id: v }))} placeholder="None" options={(entities||[]).map(e => ({ value: e.id, label: `${e.code} — ${e.name}`, sublabel: `${e.country} · ${e.base_currency}`, icon: e.entity_type==="parent"?"🏛":"🌐" }))} /></div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => setShowNew(false)} style={{ padding: "8px 16px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text3, cursor: "pointer" }}>Cancel</button>
                <button onClick={saveFacility} disabled={!form.name.trim()} style={{ padding: "8px 16px", fontSize: 12, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", opacity: !form.name.trim() ? 0.5 : 1 }}>Create</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// GL VIEW — Chart of Accounts, Journal Entries, Trial Balance
// ═══════════════════════════════════════════════════════════════════════════════
function GLView({ glAccounts, journalEntries, setJournalEntries, entities, isMobile }) {
  const [subView, setSubView] = useState("coa");
  const [selected, setSelected] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [jeForm, setJeForm] = useState({ description: "", lines: [{ account: "", debit: "", credit: "", desc: "" }, { account: "", debit: "", credit: "", desc: "" }] });
  const inp = { width: "100%", padding: "8px 12px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, outline: "none", boxSizing: "border-box" };

  const TYPE_COLORS = { asset: "#3B82F6", liability: "#EF4444", equity: "#8B5CF6", revenue: "#10B981", expense: "#F59E0B", cogs: "#EC4899" };
  const typeAccounts = (type) => glAccounts.filter(a => a.account_type === type);

  // Trial balance calculation
  const trialBalance = glAccounts.map(a => {
    const entries = journalEntries.flatMap(je => []);
    // Simplified: just show account structure
    return { ...a, balance: 0 };
  });

  const createJournalEntry = async () => {
    if (!jeForm.description.trim()) return;
    const lines = jeForm.lines.filter(l => l.account && (parseFloat(l.debit) > 0 || parseFloat(l.credit) > 0));
    if (lines.length < 2) { alert("Need at least 2 lines"); return; }
    const totalDr = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
    const totalCr = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
    if (Math.abs(totalDr - totalCr) > 0.01) { alert(`Entry must balance. DR: ${fmt(totalDr)} ≠ CR: ${fmt(totalCr)}`); return; }
    const je = await postJournalEntry("manual", null, null, jeForm.description,
      lines.map(l => {
        const acct = glAccounts.find(a => a.account_number === l.account || a.id === l.account);
        return { account: acct?.account_number || l.account, name: acct?.name || "", debit: parseFloat(l.debit) || 0, credit: parseFloat(l.credit) || 0, desc: l.desc };
      }));
    if (je) setJournalEntries(p => [je, ...p]);
    setShowNew(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div><div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>General Ledger</div><div style={{ fontSize: 12, color: T.text3 }}>{glAccounts.length} accounts · {journalEntries.length} journal entries</div></div>
        <button onClick={() => { setJeForm({ description: "", lines: [{ account: "", debit: "", credit: "", desc: "" }, { account: "", debit: "", credit: "", desc: "" }] }); setShowNew(true); }} style={{ padding: "6px 14px", fontSize: 12, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>+ Journal Entry</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr 1fr" : "1fr 1fr 1fr 1fr 1fr 1fr", gap: 8 }}>
        {[["asset", "Assets"], ["liability", "Liabilities"], ["equity", "Equity"], ["revenue", "Revenue"], ["cogs", "COGS"], ["expense", "Expenses"]].map(([type, label]) => (
          <Card key={type} style={{ textAlign: "center", padding: 8 }}>
            <div style={{ fontSize: 16, fontWeight: 900, color: TYPE_COLORS[type] }}>{typeAccounts(type).length}</div>
            <div style={{ fontSize: 9, color: T.text3 }}>{label}</div>
          </Card>
        ))}
      </div>

      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${T.border}` }}>
        {[["coa", "📒 Chart of Accounts"], ["journal", "📝 Journal Entries"]].map(([k, l]) => (
          <button key={k} onClick={() => setSubView(k)} style={{ padding: "8px 16px", background: "none", border: "none", borderBottom: subView === k ? `2px solid ${T.accent}` : "2px solid transparent", cursor: "pointer", color: subView === k ? T.accent : T.text3, fontSize: 12, fontWeight: subView === k ? 700 : 500 }}>{l}</button>
        ))}
      </div>

      {/* CHART OF ACCOUNTS */}
      {subView === "coa" && (
        <div>
          {["asset", "liability", "equity", "revenue", "cogs", "expense"].map(type => {
            const accts = typeAccounts(type);
            if (accts.length === 0) return null;
            return (
              <div key={type} style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: TYPE_COLORS[type], textTransform: "uppercase", marginBottom: 6, letterSpacing: "0.05em" }}>{type === "cogs" ? "Cost of Goods Sold" : type}</div>
                {accts.map(a => (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderBottom: `1px solid ${T.border}20`, fontSize: 12 }}>
                    <span style={{ fontFamily: "monospace", fontWeight: 700, color: T.accent, width: 50 }}>{a.account_number}</span>
                    <span style={{ flex: 1, color: T.text }}>{a.name}</span>
                    <span style={{ fontSize: 10, color: T.text3, textTransform: "uppercase" }}>{a.normal_balance}</span>
                    {a.is_active ? <span style={{ fontSize: 9, color: "#10B981", fontWeight: 600 }}>Active</span> : <span style={{ fontSize: 9, color: T.text3 }}>Inactive</span>}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* JOURNAL ENTRIES */}
      {subView === "journal" && (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : selected ? "1fr 1.2fr" : "1fr", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {journalEntries.length === 0 ? <EmptyState icon="📝" text="No journal entries" /> :
              journalEntries.map(je => {
                const sel = selected?.id === je.id;
                return (
                  <Card key={je.id} onClick={() => setSelected(je)} style={{ padding: "10px 14px", cursor: "pointer", borderLeft: sel ? `3px solid ${T.accent}` : "3px solid transparent" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace", color: T.accent }}>{je.entry_number}</span>
                        <Pill status={je.status} />
                        {je.source && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: T.surface2, color: T.text3, fontWeight: 600 }}>{je.source}</span>}
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{fmt(je.total_debit)}</span>
                    </div>
                    <div style={{ fontSize: 10, color: T.text3, marginTop: 3 }}>{je.description?.slice(0, 60)}{je.description?.length > 60 ? "…" : ""} · {new Date(je.entry_date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>
                  </Card>
                );
              })
            }
          </div>

          {selected && !isMobile && (
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20, overflow: "auto", maxHeight: "calc(100vh - 280px)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "monospace", color: T.accent }}>{selected.entry_number}</div>
                  <div style={{ fontSize: 12, color: T.text3 }}>{selected.description}</div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <Pill status={selected.status} />
                  {selected.is_balanced ? <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: "#D1FAE520", color: "#065F46", fontWeight: 700 }}>BALANCED</span> : <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: "#FEE2E2", color: "#991B1B", fontWeight: 700 }}>UNBALANCED</span>}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16, padding: "12px 14px", background: T.surface2, borderRadius: 8 }}>
                {[{ l: "Date", v: new Date(selected.entry_date).toLocaleDateString() }, { l: "Period", v: selected.period || "—" }, { l: "Source", v: selected.source || "manual" }, { l: "Total Debit", v: fmt(selected.total_debit) }, { l: "Total Credit", v: fmt(selected.total_credit) }, { l: "Reference", v: selected.reference_type || "—" }].map(d => (
                  <div key={d.l}><div style={{ fontSize: 9, color: T.text3, fontWeight: 700, textTransform: "uppercase" }}>{d.l}</div><div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginTop: 2, textTransform: "capitalize" }}>{d.v}</div></div>
                ))}
              </div>

              <div style={{ fontSize: 11, color: T.text3, textAlign: "center", padding: 12 }}>Journal lines loaded on detail view — expand to show debit/credit per account</div>
            </div>
          )}
        </div>
      )}

      {/* Create JE Modal */}
      {showNew && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowNew(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: 14, padding: isMobile ? 14 : 24, width: "min(650px, 95vw)", maxHeight: "90vh", overflow: "auto" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 16 }}>New Journal Entry</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Description *</div><input value={jeForm.description} onChange={e => setJeForm(f => ({ ...f, description: e.target.value }))} placeholder="Manual adjustment — describe the entry" style={inp} /></div>

              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Lines</div>
                  <button onClick={() => setJeForm(f => ({ ...f, lines: [...f.lines, { account: "", debit: "", credit: "", desc: "" }] }))} style={{ padding: "3px 10px", fontSize: 10, fontWeight: 600, background: T.accentDim, color: T.accent, border: `1px solid ${T.accent}30`, borderRadius: 5, cursor: "pointer" }}>+ Line</button>
                </div>
                {jeForm.lines.map((line, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr 1fr 1.5fr auto", gap: 6, marginBottom: 6, alignItems: "end" }}>
                    <div>{i === 0 && <div style={{ fontSize: 9, color: T.text3, fontWeight: 700, marginBottom: 2 }}>ACCOUNT</div>}<Select value={line.account} onChange={v => { const ls = [...jeForm.lines]; ls[i].account = v; setJeForm(f => ({ ...f, lines: ls })); }} placeholder="Select account…" options={glAccounts.map(a => ({ value: a.account_number, label: `${a.account_number} — ${a.name}`, sublabel: a.account_type }))} /></div>
                    <div>{i === 0 && <div style={{ fontSize: 9, color: T.text3, fontWeight: 700, marginBottom: 2 }}>DEBIT</div>}<input type="number" step="0.01" value={line.debit} onChange={e => { const ls = [...jeForm.lines]; ls[i].debit = e.target.value; if (e.target.value) ls[i].credit = ""; setJeForm(f => ({ ...f, lines: ls })); }} placeholder="0.00" style={{ ...inp, padding: "7px 10px", textAlign: "right", color: "#10B981" }} /></div>
                    <div>{i === 0 && <div style={{ fontSize: 9, color: T.text3, fontWeight: 700, marginBottom: 2 }}>CREDIT</div>}<input type="number" step="0.01" value={line.credit} onChange={e => { const ls = [...jeForm.lines]; ls[i].credit = e.target.value; if (e.target.value) ls[i].debit = ""; setJeForm(f => ({ ...f, lines: ls })); }} placeholder="0.00" style={{ ...inp, padding: "7px 10px", textAlign: "right", color: "#EF4444" }} /></div>
                    <div>{i === 0 && <div style={{ fontSize: 9, color: T.text3, fontWeight: 700, marginBottom: 2 }}>MEMO</div>}<input value={line.desc} onChange={e => { const ls = [...jeForm.lines]; ls[i].desc = e.target.value; setJeForm(f => ({ ...f, lines: ls })); }} placeholder="Line description" style={{ ...inp, padding: "7px 10px" }} /></div>
                    <button onClick={() => setJeForm(f => ({ ...f, lines: f.lines.filter((_, j) => j !== i) }))} style={{ background: "none", border: "none", color: "#EF4444", cursor: "pointer", fontSize: 14, padding: "6px" }}>✕</button>
                  </div>
                ))}
                {(() => {
                  const dr = jeForm.lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0);
                  const cr = jeForm.lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0);
                  const balanced = Math.abs(dr - cr) < 0.01 && dr > 0;
                  return (
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: 16, padding: "8px 0", borderTop: `2px solid ${T.border}`, fontSize: 13 }}>
                      <span style={{ color: "#10B981", fontWeight: 700 }}>DR: {fmt(dr)}</span>
                      <span style={{ color: "#EF4444", fontWeight: 700 }}>CR: {fmt(cr)}</span>
                      <span style={{ fontWeight: 800, color: balanced ? "#10B981" : "#EF4444" }}>{balanced ? "✅ Balanced" : `⚠ Off by ${fmt(Math.abs(dr - cr))}`}</span>
                    </div>
                  );
                })()}
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => setShowNew(false)} style={{ padding: "8px 16px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text3, cursor: "pointer" }}>Cancel</button>
                <button onClick={createJournalEntry} disabled={!jeForm.description.trim()} style={{ padding: "8px 16px", fontSize: 12, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", opacity: !jeForm.description.trim() ? 0.5 : 1 }}>Post Entry</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// AP / AR VIEW — Accounts Payable, Accounts Receivable, Payments
// ═══════════════════════════════════════════════════════════════════════════════
function APARView({ apInvoices, setApInvoices, arInvoices, setArInvoices, payments, setPayments, suppliers, customers, orders, purchaseOrders, isMobile }) {
  const [subView, setSubView] = useState("ar");
  const [selected, setSelected] = useState(null);
  const [showPayment, setShowPayment] = useState(false);
  const [payForm, setPayForm] = useState({ amount: "", payment_method: "ach", reference_number: "", notes: "" });
  const getSupplier = id => suppliers.find(s => s.id === id);
  const getCustomer = id => customers.find(c => c.id === id);
  const getOrder = id => orders.find(o => o.id === id);
  const getPO = id => purchaseOrders.find(p => p.id === id);

  const apOpen = apInvoices.filter(i => i.status !== "paid" && i.status !== "voided");
  const arOpen = arInvoices.filter(i => i.status !== "paid" && i.status !== "voided" && i.status !== "credited");
  const apTotal = apOpen.reduce((s, i) => s + (i.balance || i.total - (i.paid_amount || 0)), 0);
  const arTotal = arOpen.reduce((s, i) => s + (i.balance || i.total - (i.paid_amount || 0)), 0);

  const recordPayment = async () => {
    if (!selected || !payForm.amount) return;
    const amt = parseFloat(payForm.amount);
    const isAP = subView === "ap";
    const pmtNum = `PMT-${Date.now().toString(36).toUpperCase()}`;
    const { data: pmt } = await supabase.from("erp_payments").insert({
      payment_number: pmtNum, payment_type: isAP ? "ap_payment" : "ar_payment",
      ap_invoice_id: isAP ? selected.id : null, ar_invoice_id: !isAP ? selected.id : null,
      supplier_id: isAP ? selected.supplier_id : null, customer_id: !isAP ? selected.customer_id : null,
      amount: amt, payment_method: payForm.payment_method, reference_number: payForm.reference_number || null,
      payment_date: new Date().toISOString().slice(0, 10), notes: payForm.notes,
    }).select().single();
    if (pmt) setPayments(p => [pmt, ...p]);

    const newPaid = (selected.paid_amount || 0) + amt;
    const newStatus = newPaid >= selected.total ? "paid" : "partial";
    if (isAP) {
      const { data } = await supabase.from("erp_ap_invoices").update({ paid_amount: newPaid, status: newStatus }).eq("id", selected.id).select().single();
      if (data) { setApInvoices(p => p.map(x => x.id === data.id ? data : x)); setSelected(data); }
    } else {
      const { data } = await supabase.from("erp_ar_invoices").update({ paid_amount: newPaid, status: newStatus }).eq("id", selected.id).select().single();
      if (data) { setArInvoices(p => p.map(x => x.id === data.id ? data : x)); setSelected(data); }
    }
    setShowPayment(false); setPayForm({ amount: "", payment_method: "ach", reference_number: "", notes: "" });
  };

  const invoices = subView === "ap" ? apInvoices : arInvoices;
  const inp = { width: "100%", padding: "8px 12px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, outline: "none", boxSizing: "border-box" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div><div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>Accounts Payable / Receivable</div><div style={{ fontSize: 12, color: T.text3 }}>AP: {fmt(apTotal)} outstanding · AR: {fmt(arTotal)} outstanding · {payments.length} payments</div></div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr 1fr", gap: 8 }}>
        {[{ l: "AP Outstanding", v: fmt(apTotal), c: "#EF4444" }, { l: "AP Invoices", v: apInvoices.length, c: T.accent }, { l: "AR Outstanding", v: fmt(arTotal), c: "#10B981" }, { l: "AR Invoices", v: arInvoices.length, c: "#3B82F6" }, { l: "Payments", v: payments.length, c: "#8B5CF6" }].map(s => (
          <Card key={s.l} style={{ textAlign: "center", padding: 10 }}><div style={{ fontSize: 16, fontWeight: 900, color: s.c }}>{s.v}</div><div style={{ fontSize: 9, color: T.text3 }}>{s.l}</div></Card>
        ))}
      </div>

      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${T.border}` }}>
        {[["ar", "📥 Receivable (AR)"], ["ap", "📤 Payable (AP)"], ["payments", "💳 Payments"]].map(([k, l]) => (
          <button key={k} onClick={() => { setSubView(k); setSelected(null); }} style={{ padding: "8px 16px", background: "none", border: "none", borderBottom: subView === k ? `2px solid ${T.accent}` : "2px solid transparent", cursor: "pointer", color: subView === k ? T.accent : T.text3, fontSize: 12, fontWeight: subView === k ? 700 : 500 }}>{l}</button>
        ))}
        <div style={{ flex: 1 }} />
        {subView === "ap" && <button onClick={async () => {
          const supName = prompt("Supplier name or code:");
          if (!supName) return;
          const sup = suppliers.find(s => s.name.toLowerCase().includes(supName.toLowerCase()) || s.code?.toLowerCase() === supName.toLowerCase());
          if (!sup) { alert("Supplier not found"); return; }
          const vendorInv = prompt("Vendor invoice number:");
          const total = parseFloat(prompt("Invoice total:", "0") || "0");
          if (!total) return;
          const invNum = `AP-${Date.now().toString(36).toUpperCase()}`;
          const dueDate = new Date(); dueDate.setDate(dueDate.getDate() + 30);
          const { data } = await supabase.from("erp_ap_invoices").insert({ invoice_number: invNum, vendor_invoice_number: vendorInv || null, supplier_id: sup.id, status: "pending", invoice_date: new Date().toISOString().slice(0,10), due_date: dueDate.toISOString().slice(0,10), total, subtotal: total, payment_terms: sup.payment_terms || "net_30" }).select().single();
          if (data) { setApInvoices(p => [data, ...p]); setSelected(data); }
        }} style={{ padding: "4px 12px", fontSize: 11, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", margin: "4px 0" }}>+ AP Invoice</button>}
        {subView === "ar" && <button onClick={async () => {
          const ordNum = prompt("Order number (e.g. ORD-100001):");
          if (!ordNum) return;
          const ord = orders.find(o => o.order_number === ordNum);
          if (!ord) { alert("Order not found"); return; }
          const invNum = `INV-${ord.order_number.replace("ORD-", "")}`;
          const cust = getCustomer(ord.customer_id);
          const dueDate = new Date(); dueDate.setDate(dueDate.getDate() + 30);
          const { data } = await supabase.from("erp_ar_invoices").insert({ invoice_number: invNum, order_id: ord.id, customer_id: ord.customer_id, status: "sent", invoice_date: new Date().toISOString().slice(0,10), due_date: dueDate.toISOString().slice(0,10), subtotal: ord.subtotal || ord.total, total: ord.total, payment_terms: cust?.payment_terms || "net_30" }).select().single();
          if (data) { setArInvoices(p => [data, ...p]); setSelected(data); }
        }} style={{ padding: "4px 12px", fontSize: 11, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", margin: "4px 0" }}>+ AR Invoice</button>}
      </div>

      {/* AR / AP Invoice List */}
      {(subView === "ar" || subView === "ap") && (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : selected ? "1fr 1.2fr" : "1fr", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {invoices.length === 0 ? <EmptyState icon="💰" text={`No ${subView === "ap" ? "AP" : "AR"} invoices`} /> :
              invoices.map(inv => {
                const entity = subView === "ap" ? getSupplier(inv.supplier_id) : getCustomer(inv.customer_id);
                const ref = subView === "ap" ? getPO(inv.po_id) : getOrder(inv.order_id);
                const bal = inv.balance != null ? inv.balance : inv.total - (inv.paid_amount || 0);
                const sel = selected?.id === inv.id;
                const overdue = inv.due_date && new Date(inv.due_date) < new Date() && inv.status !== "paid";
                return (
                  <Card key={inv.id} onClick={() => setSelected(inv)} style={{ padding: "10px 14px", cursor: "pointer", borderLeft: sel ? `3px solid ${T.accent}` : overdue ? "3px solid #EF4444" : "3px solid transparent" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, fontFamily: "monospace", color: T.accent }}>{inv.invoice_number}</span>
                        <Pill status={inv.status} />
                        {overdue && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: "#FEE2E2", color: "#991B1B", fontWeight: 700 }}>OVERDUE</span>}
                      </div>
                      <span style={{ fontSize: 13, fontWeight: 800, color: bal > 0 ? T.text : "#10B981" }}>{fmt(bal)}</span>
                    </div>
                    <div style={{ fontSize: 10, color: T.text3, marginTop: 3 }}>
                      {entity?.name || "Unknown"} · {ref ? (subView === "ap" ? ref.po_number : ref.order_number) : "—"} · Due {inv.due_date ? new Date(inv.due_date).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                    </div>
                  </Card>
                );
              })
            }
          </div>

          {selected && !isMobile && (
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20, overflow: "auto", maxHeight: "calc(100vh - 280px)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "monospace", color: T.accent }}>{selected.invoice_number}</div>
                  <div style={{ fontSize: 12, color: T.text3 }}>{subView === "ap" ? getSupplier(selected.supplier_id)?.name : getCustomer(selected.customer_id)?.name}</div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  {selected.status !== "paid" && selected.status !== "voided" && (
                    <button onClick={() => { setPayForm({ amount: String(selected.balance != null ? selected.balance : selected.total - (selected.paid_amount || 0)), payment_method: "ach", reference_number: "", notes: "" }); setShowPayment(true); }}
                      style={{ padding: "5px 12px", fontSize: 11, fontWeight: 700, background: "#10B981", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>💳 Record Payment</button>
                  )}
                  {selected.status !== "voided" && <button onClick={async () => {
                    if (!window.confirm("Void this invoice?")) return;
                    const tbl = subView === "ap" ? "erp_ap_invoices" : "erp_ar_invoices";
                    const { data } = await supabase.from(tbl).update({ status: "voided" }).eq("id", selected.id).select().single();
                    if (data) { (subView === "ap" ? setApInvoices : setArInvoices)(p => p.map(x => x.id === data.id ? data : x)); setSelected(data); }
                  }} style={{ padding: "5px 10px", fontSize: 11, background: "#FEE2E2", border: "1px solid #FECACA", borderRadius: 6, color: "#991B1B", cursor: "pointer" }}>Void</button>}
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16, padding: "12px 14px", background: T.surface2, borderRadius: 8 }}>
                {[
                  { l: "Status", v: selected.status }, { l: "Invoice Date", v: selected.invoice_date ? new Date(selected.invoice_date).toLocaleDateString() : "—" }, { l: "Due Date", v: selected.due_date ? new Date(selected.due_date).toLocaleDateString() : "—" },
                  { l: "Total", v: fmt(selected.total) }, { l: "Paid", v: fmt(selected.paid_amount || 0) }, { l: "Balance", v: fmt(selected.balance != null ? selected.balance : selected.total - (selected.paid_amount || 0)) },
                  { l: "Currency", v: selected.currency || "USD" }, { l: "Terms", v: selected.payment_terms?.replace(/_/g, " ") || "—" }, { l: subView === "ap" ? "Match Status" : "Ref", v: subView === "ap" ? (selected.match_status || "—") : (getOrder(selected.order_id)?.order_number || "—") },
                ].map(d => <div key={d.l}><div style={{ fontSize: 9, color: T.text3, fontWeight: 700, textTransform: "uppercase" }}>{d.l}</div><div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginTop: 2, textTransform: "capitalize" }}>{d.v}</div></div>)}
              </div>

              {/* Payment history */}
              {(() => {
                const invPayments = payments.filter(p => subView === "ap" ? p.ap_invoice_id === selected.id : p.ar_invoice_id === selected.id);
                return invPayments.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 6 }}>Payment History</div>
                    {invPayments.map(p => (
                      <div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${T.border}`, fontSize: 11 }}>
                        <div><strong style={{ fontFamily: "monospace", color: "#10B981" }}>{p.payment_number}</strong><span style={{ marginLeft: 6, color: T.text3 }}>{p.payment_method} · {new Date(p.payment_date).toLocaleDateString()}</span></div>
                        <span style={{ fontWeight: 700 }}>{fmt(p.amount)}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {selected.notes && <div style={{ fontSize: 11, color: T.text3, padding: "8px 10px", background: T.surface2, borderRadius: 6 }}>{selected.notes}</div>}
            </div>
          )}
        </div>
      )}

      {/* Payments Tab */}
      {subView === "payments" && (
        <div style={{ overflowX: "auto" }}>
          {payments.length === 0 ? <EmptyState icon="💳" text="No payments recorded" /> :
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead><tr style={{ borderBottom: `2px solid ${T.border}` }}>
                {["Payment #", "Type", "Date", "Method", "Amount", "Ref", "To/From"].map(h => <th key={h} style={{ textAlign: "left", padding: "8px", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase" }}>{h}</th>)}
              </tr></thead>
              <tbody>{payments.map(p => {
                const entity = p.supplier_id ? getSupplier(p.supplier_id) : getCustomer(p.customer_id);
                return (
                  <tr key={p.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                    <td style={{ padding: "8px", fontFamily: "monospace", fontWeight: 700, color: T.accent }}>{p.payment_number}</td>
                    <td style={{ padding: "8px" }}><Pill status={p.payment_type} /></td>
                    <td style={{ padding: "8px", color: T.text3 }}>{new Date(p.payment_date).toLocaleDateString()}</td>
                    <td style={{ padding: "8px", textTransform: "uppercase", fontSize: 10, fontWeight: 600, color: T.text3 }}>{p.payment_method}</td>
                    <td style={{ padding: "8px", fontWeight: 700, color: p.payment_type === "ap_payment" ? "#EF4444" : "#10B981" }}>{p.payment_type === "ap_payment" ? "-" : "+"}{fmt(p.amount)}</td>
                    <td style={{ padding: "8px", fontFamily: "monospace", fontSize: 10, color: T.text3 }}>{p.reference_number || "—"}</td>
                    <td style={{ padding: "8px", color: T.text }}>{entity?.name || "—"}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          }
        </div>
      )}

      {/* Record Payment Modal */}
      {showPayment && selected && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowPayment(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: 14, padding: isMobile ? 14 : 24, width: "min(440px, 95vw)" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#10B981", marginBottom: 4 }}>💳 Record Payment</div>
            <div style={{ fontSize: 12, color: T.text3, marginBottom: 16 }}>{selected.invoice_number} · Balance: {fmt(selected.balance != null ? selected.balance : selected.total - (selected.paid_amount || 0))}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Amount *</div><input type="number" step="0.01" value={payForm.amount} onChange={e => setPayForm(f => ({ ...f, amount: e.target.value }))} style={{ ...inp, fontSize: 18, fontWeight: 800, textAlign: "center" }} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Method</div><Select value={payForm.payment_method} onChange={v => setPayForm(f => ({ ...f, payment_method: v }))} options={[{ value: "ach", label: "ACH" }, { value: "wire", label: "Wire Transfer" }, { value: "check", label: "Check" }, { value: "credit_card", label: "Credit Card" }, { value: "store_credit", label: "Store Credit" }]} /></div>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Reference #</div><input value={payForm.reference_number} onChange={e => setPayForm(f => ({ ...f, reference_number: e.target.value }))} placeholder="Check #, txn ID" style={{ ...inp, fontFamily: "monospace" }} /></div>
              </div>
              <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Notes</div><input value={payForm.notes} onChange={e => setPayForm(f => ({ ...f, notes: e.target.value }))} style={inp} /></div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => setShowPayment(false)} style={{ padding: "8px 16px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text3, cursor: "pointer" }}>Cancel</button>
                <button onClick={recordPayment} disabled={!payForm.amount} style={{ padding: "8px 20px", fontSize: 12, fontWeight: 700, background: "#10B981", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", opacity: !payForm.amount ? 0.5 : 1 }}>Record Payment</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// RETURNS VIEW — RMA management, inspection, disposition
// ═══════════════════════════════════════════════════════════════════════════════
function ReturnsView({ rmas, setRmas, rmaItems, setRmaItems, orders, orderItems, customers, variants, inventory, setInventory, movements, setMovements, facilities, isMobile }) {
  const [selected, setSelected] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [form, setForm] = useState({ order_id: "", reason_code: "defective", return_type: "refund", notes: "" });
  const [newItems, setNewItems] = useState([]);
  const inp = { width: "100%", padding: "8px 12px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, outline: "none", boxSizing: "border-box" };

  const getCustomer = id => customers.find(c => c.id === id);
  const getOrder = id => orders.find(o => o.id === id);
  const filtered = rmas.filter(r => statusFilter === "all" || r.status === statusFilter);
  const selItems = selected ? rmaItems.filter(i => i.rma_id === selected.id) : [];

  const nextRmaNum = () => { const max = rmas.reduce((m, r) => { const n = parseInt(r.rma_number.replace(/[^0-9]/g, "")) || 0; return Math.max(m, n); }, 1000); return `RMA-${max + 1}`; };

  const createRma = async () => {
    if (!form.order_id || newItems.length === 0) return;
    const ord = getOrder(form.order_id);
    const refund = newItems.reduce((s, i) => s + (parseFloat(i.refund_amount) || 0), 0);
    const { data: rma } = await supabase.from("erp_rma").insert({ rma_number: nextRmaNum(), order_id: form.order_id, customer_id: ord?.customer_id || null, status: "requested", reason_code: form.reason_code, return_type: form.return_type, refund_amount: refund, notes: form.notes }).select().single();
    if (!rma) return;
    const items = newItems.map((i, idx) => ({ rma_id: rma.id, variant_id: i.variant_id || null, sku: i.sku, title: i.title, quantity: parseInt(i.quantity) || 0, refund_amount: parseFloat(i.refund_amount) || 0, sort_order: idx }));
    const { data: created } = await supabase.from("erp_rma_items").insert(items).select();
    setRmas(p => [rma, ...p]);
    if (created) setRmaItems(p => [...p, ...created]);
    setShowNew(false); setSelected(rma);
  };

  const updateRmaStatus = async (rma, newStatus) => {
    const updates = { status: newStatus };
    if (newStatus === "approved") updates.approved_at = new Date().toISOString();
    if (newStatus === "received") updates.received_at = new Date().toISOString();
    if (newStatus === "closed") updates.closed_at = new Date().toISOString();
    const { data } = await supabase.from("erp_rma").update(updates).eq("id", rma.id).select().single();
    if (data) { setRmas(p => p.map(x => x.id === data.id ? data : x)); setSelected(data); }
  };

  const dispositionItem = async (item, disp) => {
    await supabase.from("erp_rma_items").update({ disposition: disp, received_quantity: item.quantity, inspection_result: disp === "scrap" ? "fail" : "pass" }).eq("id", item.id);
    setRmaItems(p => p.map(x => x.id === item.id ? { ...x, disposition: disp, received_quantity: item.quantity, inspection_result: disp === "scrap" ? "fail" : "pass" } : x));
    // If restock, add back to inventory
    if (disp === "restock" && item.variant_id) {
      const fac = facilities[0];
      if (fac) {
        const { data: existing } = await supabase.from("erp_inventory").select("*").eq("variant_id", item.variant_id).eq("facility_id", fac.id).maybeSingle();
        if (existing) { await supabase.from("erp_inventory").update({ quantity: existing.quantity + item.quantity }).eq("id", existing.id); setInventory(p => p.map(x => x.id === existing.id ? { ...x, quantity: x.quantity + item.quantity } : x)); }
        else { const { data: inv } = await supabase.from("erp_inventory").insert({ variant_id: item.variant_id, facility_id: fac.id, quantity: item.quantity }).select().single(); if (inv) setInventory(p => [...p, inv]); }
        const { data: mvmt } = await supabase.from("erp_inventory_movements").insert({ variant_id: item.variant_id, facility_id: fac.id, movement_type: "return", quantity: item.quantity, reference_type: "rma", reference_id: selected.id, notes: `RMA ${selected.rma_number}: Restocked ${item.quantity} × ${item.sku}` }).select().single();
        if (mvmt && setMovements) setMovements(p => [mvmt, ...p]);
      }
    }
  };

  const REASON_LABELS = { defective: "Defective", wrong_item: "Wrong Item", damaged_in_transit: "Damaged in Transit", customer_changed_mind: "Changed Mind", warranty: "Warranty", quality: "Quality Issue" };
  const STATUS_FLOW = { requested: ["approved", "cancelled"], approved: ["received", "cancelled"], received: ["inspected", "closed"], inspected: ["closed"] };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div><div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>Returns & RMA</div><div style={{ fontSize: 12, color: T.text3 }}>{rmas.length} returns · {rmas.filter(r => r.status !== "closed" && r.status !== "cancelled").length} open</div></div>
        <button onClick={() => { setForm({ order_id: "", reason_code: "defective", return_type: "refund", notes: "" }); setNewItems([]); setShowNew(true); }} style={{ padding: "6px 14px", fontSize: 12, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>+ RMA</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 8 }}>
        {[{ l: "Open", v: rmas.filter(r => !["closed","cancelled"].includes(r.status)).length, c: "#F59E0B" }, { l: "Received", v: rmas.filter(r => r.status === "received").length, c: "#3B82F6" }, { l: "Closed", v: rmas.filter(r => r.status === "closed").length, c: "#10B981" }, { l: "Refund Total", v: fmt(rmas.filter(r => r.status === "closed").reduce((s, r) => s + (r.refund_amount || 0), 0)), c: T.accent }].map(s => (
          <Card key={s.l} style={{ textAlign: "center", padding: 10 }}><div style={{ fontSize: 18, fontWeight: 900, color: s.c }}>{s.v}</div><div style={{ fontSize: 9, color: T.text3 }}>{s.l}</div></Card>
        ))}
      </div>

      <div style={{ display: "flex", gap: 3, background: T.surface2, borderRadius: 7, padding: 2, flexWrap: "wrap" }}>
        {[["all","All"],["requested","Requested"],["approved","Approved"],["received","Received"],["closed","Closed"],["cancelled","Cancelled"]].map(([v,l]) => (
          <button key={v} onClick={() => setStatusFilter(v)} style={{ padding: "4px 10px", borderRadius: 5, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 700, background: statusFilter === v ? T.surface : "transparent", color: statusFilter === v ? T.text : T.text3 }}>{l}</button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : selected ? "1fr 1.2fr" : "1fr", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {filtered.length === 0 ? <EmptyState icon="↩️" text="No returns found" /> :
            filtered.map(r => {
              const ord = getOrder(r.order_id);
              const cust = getCustomer(r.customer_id);
              const sel = selected?.id === r.id;
              return (
                <Card key={r.id} onClick={() => setSelected(r)} style={{ padding: "10px 14px", cursor: "pointer", borderLeft: sel ? `3px solid ${T.accent}` : "3px solid transparent" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, fontFamily: "monospace", color: T.accent }}>{r.rma_number}</span>
                      <Pill status={r.status} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>{fmt(r.refund_amount)}</span>
                  </div>
                  <div style={{ fontSize: 10, color: T.text3, marginTop: 3 }}>
                    {cust?.name || "Unknown"} · {ord?.order_number || "—"} · {REASON_LABELS[r.reason_code] || r.reason_code} · {r.return_type}
                  </div>
                </Card>
              );
            })
          }
        </div>

        {selected && !isMobile && (
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20, overflow: "auto", maxHeight: "calc(100vh - 240px)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, fontFamily: "monospace", color: T.accent }}>{selected.rma_number}</div>
                <div style={{ fontSize: 12, color: T.text3 }}>{getCustomer(selected.customer_id)?.name} · {getOrder(selected.order_id)?.order_number}</div>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                {(STATUS_FLOW[selected.status] || []).map(ns => (
                  <button key={ns} onClick={() => updateRmaStatus(selected, ns)} style={{ padding: "5px 10px", fontSize: 11, fontWeight: 600, background: ns === "cancelled" ? "#FEE2E2" : "#D1FAE5", border: `1px solid ${ns === "cancelled" ? "#FECACA" : "#6EE7B7"}`, borderRadius: 6, color: ns === "cancelled" ? "#991B1B" : "#065F46", cursor: "pointer", textTransform: "capitalize" }}>{ns}</button>
                ))}
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16, padding: "12px 14px", background: T.surface2, borderRadius: 8 }}>
              {[{ l: "Status", v: selected.status }, { l: "Reason", v: REASON_LABELS[selected.reason_code] || selected.reason_code }, { l: "Type", v: selected.return_type }, { l: "Refund", v: fmt(selected.refund_amount) }, { l: "Requested", v: selected.requested_at ? new Date(selected.requested_at).toLocaleDateString() : "—" }, { l: "Received", v: selected.received_at ? new Date(selected.received_at).toLocaleDateString() : "—" }].map(d => (
                <div key={d.l}><div style={{ fontSize: 9, color: T.text3, fontWeight: 700, textTransform: "uppercase" }}>{d.l}</div><div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginTop: 2, textTransform: "capitalize" }}>{d.v}</div></div>
              ))}
            </div>

            <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 8 }}>Return Items</div>
            {selItems.length === 0 ? <div style={{ fontSize: 12, color: T.text3, textAlign: "center", padding: 12 }}>No items</div> :
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead><tr style={{ borderBottom: `2px solid ${T.border}` }}>
                    {["Item", "SKU", "Qty", "Rcvd", "Disposition", "Action"].map(h => <th key={h} style={{ textAlign: "left", padding: "6px", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase" }}>{h}</th>)}
                  </tr></thead>
                  <tbody>{selItems.map(item => (
                    <tr key={item.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                      <td style={{ padding: "6px", fontWeight: 600, color: T.text }}>{item.title}</td>
                      <td style={{ padding: "6px", fontFamily: "monospace", fontSize: 11, color: T.accent }}>{item.sku}</td>
                      <td style={{ padding: "6px" }}>{item.quantity}</td>
                      <td style={{ padding: "6px", color: item.received_quantity >= item.quantity ? "#10B981" : T.text3 }}>{item.received_quantity || 0}</td>
                      <td style={{ padding: "6px" }}>{item.disposition ? <Pill status={item.disposition} /> : <span style={{ color: T.text3, fontSize: 11 }}>Pending</span>}</td>
                      <td style={{ padding: "6px" }}>{!item.disposition && (selected.status === "received" || selected.status === "inspected") && (
                        <div style={{ display: "flex", gap: 3 }}>
                          <button onClick={() => dispositionItem(item, "restock")} style={{ padding: "2px 6px", fontSize: 9, background: "#D1FAE520", border: "1px solid #6EE7B7", borderRadius: 4, color: "#065F46", cursor: "pointer" }}>Restock</button>
                          <button onClick={() => dispositionItem(item, "scrap")} style={{ padding: "2px 6px", fontSize: 9, background: "#FEE2E220", border: "1px solid #FECACA", borderRadius: 4, color: "#991B1B", cursor: "pointer" }}>Scrap</button>
                          <button onClick={() => dispositionItem(item, "rework")} style={{ padding: "2px 6px", fontSize: 9, background: "#FEF3C720", border: "1px solid #FCD34D", borderRadius: 4, color: "#92400E", cursor: "pointer" }}>Rework</button>
                        </div>
                      )}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            }
            {selected.notes && <div style={{ marginTop: 12, fontSize: 11, color: T.text3, padding: "8px 10px", background: T.surface2, borderRadius: 6 }}>{selected.notes}</div>}
          </div>
        )}
      </div>

      {/* Create RMA Modal */}
      {showNew && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowNew(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: 14, padding: isMobile ? 14 : 24, width: "min(600px, 95vw)", maxHeight: "90vh", overflow: "auto" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 16 }}>New Return (RMA)</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Original Order *</div>
                <Select value={form.order_id} onChange={v => { setForm(f => ({ ...f, order_id: v })); const ois = orderItems.filter(i => i.order_id === v); setNewItems(ois.map(i => ({ variant_id: i.variant_id, sku: i.sku, title: i.title, quantity: 1, refund_amount: i.unit_price || 0 }))); }} placeholder="Select order…" options={orders.filter(o => o.status === "shipped" || o.status === "delivered").map(o => ({ value: o.id, label: o.order_number, sublabel: `${getCustomer(o.customer_id)?.name || "DTC"} · ${fmt(o.total)}` }))} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Reason</div>
                  <Select value={form.reason_code} onChange={v => setForm(f => ({ ...f, reason_code: v }))} options={Object.entries(REASON_LABELS).map(([k, v]) => ({ value: k, label: v }))} /></div>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Return Type</div>
                  <Select value={form.return_type} onChange={v => setForm(f => ({ ...f, return_type: v }))} options={[{ value: "refund", label: "Refund" }, { value: "exchange", label: "Exchange" }, { value: "store_credit", label: "Store Credit" }, { value: "repair", label: "Repair" }]} /></div>
              </div>
              {newItems.length > 0 && (
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 6 }}>Items to Return</div>
                  {newItems.map((item, i) => (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr auto", gap: 6, marginBottom: 4, alignItems: "center" }}>
                      <div style={{ fontSize: 11 }}>{item.sku} — {item.title}</div>
                      <input type="number" value={item.quantity} min="1" onChange={e => setNewItems(p => p.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))} style={{ ...inp, padding: "5px 8px", fontSize: 11 }} />
                      <input type="number" step="0.01" value={item.refund_amount} onChange={e => setNewItems(p => p.map((x, j) => j === i ? { ...x, refund_amount: e.target.value } : x))} style={{ ...inp, padding: "5px 8px", fontSize: 11 }} />
                      <button onClick={() => setNewItems(p => p.filter((_, j) => j !== i))} style={{ background: "none", border: "none", color: "#EF4444", cursor: "pointer", fontSize: 12 }}>✕</button>
                    </div>
                  ))}
                  <div style={{ textAlign: "right", fontWeight: 700, color: T.accent, marginTop: 6 }}>Refund: {fmt(newItems.reduce((s, i) => s + (parseFloat(i.quantity) || 0) * (parseFloat(i.refund_amount) || 0), 0))}</div>
                </div>
              )}
              <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Notes</div><textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...inp, resize: "vertical" }} /></div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => setShowNew(false)} style={{ padding: "8px 16px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text3, cursor: "pointer" }}>Cancel</button>
                <button onClick={createRma} disabled={!form.order_id || newItems.length === 0} style={{ padding: "8px 16px", fontSize: 12, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", opacity: !form.order_id ? 0.5 : 1 }}>Create RMA</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SHIPPING VIEW — Carriers, services, rules, integrations
// ═══════════════════════════════════════════════════════════════════════════════
function ShippingView({ carriers, setCarriers, carrierServices, setCarrierServices, fulfillmentIntegrations, orders, isMobile }) {
  const [subView, setSubView] = useState("carriers");
  const [showCarrierModal, setShowCarrierModal] = useState(false);
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [editingCarrier, setEditingCarrier] = useState(null);
  const [editingService, setEditingService] = useState(null);
  const [carrierForm, setCarrierForm] = useState({ name: "", code: "", carrier_type: "direct", integration: "shipstation", account_number: "", is_active: true });
  const [serviceForm, setServiceForm] = useState({ carrier_id: "", name: "", code: "", service_level: "standard", estimated_days_min: "", estimated_days_max: "", base_rate: "", is_active: true });
  const CARRIER_ICONS = { usps: "📮", ups: "📦", fedex: "✈️", dhl: "🟡", stord: "🏭" };
  const inp = { width: "100%", padding: "8px 12px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, outline: "none", boxSizing: "border-box" };

  const shippedOrders = orders.filter(o => o.status === "shipped" || o.status === "delivered");
  const pendingShip = orders.filter(o => o.status === "processing");

  const saveCarrier = async () => {
    if (!carrierForm.name.trim()) return;
    if (editingCarrier) {
      const { data } = await supabase.from("erp_carriers").update(carrierForm).eq("id", editingCarrier.id).select().single();
      if (data) setCarriers(p => p.map(x => x.id === data.id ? data : x));
    } else {
      const { data } = await supabase.from("erp_carriers").insert(carrierForm).select().single();
      if (data) setCarriers(p => [...p, data]);
    }
    setShowCarrierModal(false); setEditingCarrier(null);
  };

  const deleteCarrier = async (id) => {
    if (!window.confirm("Delete this carrier and all its services?")) return;
    await supabase.from("erp_carriers").delete().eq("id", id);
    setCarriers(p => p.filter(x => x.id !== id));
    setCarrierServices(p => p.filter(x => x.carrier_id !== id));
  };

  const saveService = async () => {
    if (!serviceForm.name.trim() || !serviceForm.carrier_id) return;
    const payload = { ...serviceForm, estimated_days_min: parseInt(serviceForm.estimated_days_min) || null, estimated_days_max: parseInt(serviceForm.estimated_days_max) || null, base_rate: parseFloat(serviceForm.base_rate) || null };
    if (editingService) {
      const { data } = await supabase.from("erp_carrier_services").update(payload).eq("id", editingService.id).select().single();
      if (data) setCarrierServices(p => p.map(x => x.id === data.id ? data : x));
    } else {
      const { data } = await supabase.from("erp_carrier_services").insert(payload).select().single();
      if (data) setCarrierServices(p => [...p, data]);
    }
    setShowServiceModal(false); setEditingService(null);
  };

  const deleteService = async (id) => {
    if (!window.confirm("Delete this service?")) return;
    await supabase.from("erp_carrier_services").delete().eq("id", id);
    setCarrierServices(p => p.filter(x => x.id !== id));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div><div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>Shipping</div><div style={{ fontSize: 12, color: T.text3 }}>{carriers.length} carriers · {carrierServices.length} services · {pendingShip.length} awaiting shipment</div></div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 8 }}>
        {[{ l: "Active Carriers", v: carriers.filter(c => c.is_active).length, c: T.accent }, { l: "Services", v: carrierServices.filter(s => s.is_active).length, c: "#3B82F6" }, { l: "Awaiting Ship", v: pendingShip.length, c: pendingShip.length > 0 ? "#F59E0B" : T.text3 }, { l: "Shipped Today", v: shippedOrders.filter(o => new Date(o.updated_at || o.order_date).toDateString() === new Date().toDateString()).length, c: "#10B981" }].map(s => (
          <Card key={s.l} style={{ textAlign: "center", padding: 10 }}><div style={{ fontSize: 18, fontWeight: 900, color: s.c }}>{s.v}</div><div style={{ fontSize: 9, color: T.text3 }}>{s.l}</div></Card>
        ))}
      </div>

      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${T.border}` }}>
        {[["carriers", "🚚 Carriers"], ["services", "📋 Services"], ["integrations", "🔗 Integrations"]].map(([k, l]) => (
          <button key={k} onClick={() => setSubView(k)} style={{ padding: "8px 16px", background: "none", border: "none", borderBottom: subView === k ? `2px solid ${T.accent}` : "2px solid transparent", cursor: "pointer", color: subView === k ? T.accent : T.text3, fontSize: 12, fontWeight: subView === k ? 700 : 500 }}>{l}</button>
        ))}
        <div style={{ flex: 1 }} />
        {subView === "carriers" && <button onClick={() => { setCarrierForm({ name: "", code: "", carrier_type: "direct", integration: "shipstation", account_number: "", is_active: true }); setEditingCarrier(null); setShowCarrierModal(true); }} style={{ padding: "4px 12px", fontSize: 11, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", margin: "4px 0" }}>+ Carrier</button>}
        {subView === "services" && <button onClick={() => { setServiceForm({ carrier_id: carriers[0]?.id || "", name: "", code: "", service_level: "standard", estimated_days_min: "", estimated_days_max: "", base_rate: "", is_active: true }); setEditingService(null); setShowServiceModal(true); }} style={{ padding: "4px 12px", fontSize: 11, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", margin: "4px 0" }}>+ Service</button>}
      </div>

      {/* CARRIERS TAB */}
      {subView === "carriers" && (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
          {carriers.map(c => {
            const services = carrierServices.filter(s => s.carrier_id === c.id);
            return (
              <Card key={c.id} style={{ padding: "14px 16px", borderLeft: `3px solid ${c.is_active ? "#10B981" : T.text3}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 24 }}>{CARRIER_ICONS[c.code] || "🚚"}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: T.text }}>{c.name}</span>
                      <span style={{ fontSize: 9, fontFamily: "monospace", padding: "1px 5px", borderRadius: 3, background: T.surface2, color: T.text3 }}>{c.code}</span>
                      {c.is_active ? <span style={{ fontSize: 9, color: "#10B981", fontWeight: 700 }}>ACTIVE</span> : <span style={{ fontSize: 9, color: T.text3 }}>INACTIVE</span>}
                    </div>
                    <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>{c.carrier_type?.replace(/_/g, " ")} · via {c.integration || "direct"}</div>
                  </div>
                </div>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.text, marginBottom: 4 }}>{services.length} Service{services.length !== 1 ? "s" : ""}</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {services.filter(s => s.is_active).map(s => (
                    <span key={s.id} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 8, background: T.surface2, color: T.text3, fontWeight: 600 }}>
                      {s.name} · {s.estimated_days_min}-{s.estimated_days_max}d · ~{fmt(s.base_rate)}
                    </span>
                  ))}
                </div>
                {c.account_number && <div style={{ marginTop: 6, fontSize: 10, color: T.text3 }}>Account: {c.account_number}</div>}
                <div style={{ display: "flex", gap: 4, marginTop: 8, borderTop: `1px solid ${T.border}`, paddingTop: 8 }}>
                  <button onClick={() => { setCarrierForm({ name: c.name, code: c.code, carrier_type: c.carrier_type, integration: c.integration || "", account_number: c.account_number || "", is_active: c.is_active }); setEditingCarrier(c); setShowCarrierModal(true); }} style={{ padding: "3px 8px", fontSize: 10, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, color: T.text3, cursor: "pointer" }}>Edit</button>
                  <button onClick={() => { const active = !c.is_active; supabase.from("erp_carriers").update({ is_active: active }).eq("id", c.id).then(() => setCarriers(p => p.map(x => x.id === c.id ? { ...x, is_active: active } : x))); }} style={{ padding: "3px 8px", fontSize: 10, background: c.is_active ? "#FEF3C720" : "#D1FAE520", border: `1px solid ${c.is_active ? "#FCD34D" : "#6EE7B7"}`, borderRadius: 4, color: c.is_active ? "#92400E" : "#065F46", cursor: "pointer" }}>{c.is_active ? "Deactivate" : "Activate"}</button>
                  <button onClick={() => deleteCarrier(c.id)} style={{ padding: "3px 8px", fontSize: 10, background: "#FEE2E2", border: "1px solid #FECACA", borderRadius: 4, color: "#991B1B", cursor: "pointer" }}>Delete</button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* SERVICES TAB */}
      {subView === "services" && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr style={{ borderBottom: `2px solid ${T.border}` }}>
              {["Carrier", "Service", "Code", "Level", "Est. Days", "Rate", "Status", ""].map(h => <th key={h} style={{ textAlign: "left", padding: "8px", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase" }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {carrierServices.map(s => {
                const car = carriers.find(c => c.id === s.carrier_id);
                return (
                  <tr key={s.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                    <td style={{ padding: "8px", display: "flex", alignItems: "center", gap: 6 }}><span>{CARRIER_ICONS[car?.code] || "🚚"}</span><span style={{ fontWeight: 600, color: T.text }}>{car?.name}</span></td>
                    <td style={{ padding: "8px", fontWeight: 600, color: T.text }}>{s.name}</td>
                    <td style={{ padding: "8px", fontFamily: "monospace", fontSize: 11, color: T.text3 }}>{s.code}</td>
                    <td style={{ padding: "8px" }}><span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 6, background: { economy: T.surface2, standard: "#EFF6FF20", express: "#FEF3C720", overnight: "#FEE2E220" }[s.service_level] || T.surface2, color: { economy: T.text3, standard: "#1D4ED8", express: "#92400E", overnight: "#991B1B" }[s.service_level] || T.text3, fontWeight: 600, textTransform: "capitalize" }}>{s.service_level}</span></td>
                    <td style={{ padding: "8px", color: T.text3 }}>{s.estimated_days_min}-{s.estimated_days_max}</td>
                    <td style={{ padding: "8px", fontWeight: 700, color: T.accent }}>{fmt(s.base_rate)}</td>
                    <td style={{ padding: "8px" }}>{s.is_active ? <span style={{ fontSize: 10, color: "#10B981", fontWeight: 700 }}>Active</span> : <span style={{ fontSize: 10, color: T.text3 }}>Inactive</span>}</td>
                    <td style={{ padding: "8px", display: "flex", gap: 4 }}>
                      <button onClick={() => { setServiceForm({ carrier_id: s.carrier_id, name: s.name, code: s.code, service_level: s.service_level, estimated_days_min: s.estimated_days_min || "", estimated_days_max: s.estimated_days_max || "", base_rate: s.base_rate || "", is_active: s.is_active }); setEditingService(s); setShowServiceModal(true); }} style={{ padding: "2px 6px", fontSize: 9, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, color: T.text3, cursor: "pointer" }}>Edit</button>
                      <button onClick={() => deleteService(s.id)} style={{ padding: "2px 6px", fontSize: 9, background: "#FEE2E2", border: "1px solid #FECACA", borderRadius: 4, color: "#991B1B", cursor: "pointer" }}>✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* INTEGRATIONS TAB */}
      {subView === "integrations" && (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
          {fulfillmentIntegrations.map(intg => {
            const INTG_ICONS = { shipstation: "📮", stord: "🏭", shopify: "🟢", helm: "⬡" };
            return (
              <Card key={intg.id} style={{ padding: "14px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 22 }}>{INTG_ICONS[intg.code] || "🔗"}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{intg.name}</span>
                      {intg.is_active ? <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 8, background: "#D1FAE520", color: "#065F46", fontWeight: 700 }}>Connected</span> : <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 8, background: T.surface2, color: T.text3, fontWeight: 600 }}>Disconnected</span>}
                    </div>
                    <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>{intg.integration_type?.replace(/_/g, " ")}</div>
                  </div>
                </div>
                {intg.api_url && <div style={{ fontSize: 10, color: T.text3, fontFamily: "monospace", marginBottom: 4 }}>{intg.api_url}</div>}
                {intg.config && Object.keys(intg.config).length > 0 && (
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {Object.entries(intg.config).map(([k, v]) => (
                      <span key={k} style={{ fontSize: 9, padding: "2px 6px", borderRadius: 6, background: T.surface2, color: T.text3 }}>{k.replace(/_/g, " ")}: {String(v)}</span>
                    ))}
                  </div>
                )}
                {intg.last_sync_at && <div style={{ marginTop: 6, fontSize: 10, color: T.text3 }}>Last sync: {new Date(intg.last_sync_at).toLocaleString()}</div>}
              </Card>
            );
          })}
        </div>
      )}

      {/* Carrier Create/Edit Modal */}
      {showCarrierModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowCarrierModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: 14, padding: isMobile ? 14 : 24, width: "min(480px, 95vw)" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 16 }}>{editingCarrier ? "Edit Carrier" : "New Carrier"}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr", gap: 10 }}>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Name *</div><input value={carrierForm.name} onChange={e => setCarrierForm(f => ({ ...f, name: e.target.value }))} style={inp} /></div>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Code *</div><input value={carrierForm.code} onChange={e => setCarrierForm(f => ({ ...f, code: e.target.value.toLowerCase() }))} placeholder="usps" style={{ ...inp, fontFamily: "monospace" }} /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Type</div><Select value={carrierForm.carrier_type} onChange={v => setCarrierForm(f => ({ ...f, carrier_type: v }))} options={[{value:"direct",label:"Direct"},{value:"3pl_managed",label:"3PL Managed"},{value:"marketplace",label:"Marketplace"}]} /></div>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Integration</div><Select value={carrierForm.integration} onChange={v => setCarrierForm(f => ({ ...f, integration: v }))} options={[{value:"shipstation",label:"ShipStation"},{value:"stord",label:"STORD"},{value:"native",label:"Helm Native"},{value:"easypost",label:"EasyPost"},{value:"manual",label:"Manual"}]} /></div>
              </div>
              <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Account Number</div><input value={carrierForm.account_number} onChange={e => setCarrierForm(f => ({ ...f, account_number: e.target.value }))} style={inp} /></div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => setShowCarrierModal(false)} style={{ padding: "8px 16px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text3, cursor: "pointer" }}>Cancel</button>
                <button onClick={saveCarrier} disabled={!carrierForm.name.trim()} style={{ padding: "8px 16px", fontSize: 12, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", opacity: !carrierForm.name.trim() ? 0.5 : 1 }}>{editingCarrier ? "Save" : "Create"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Service Create/Edit Modal */}
      {showServiceModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowServiceModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: 14, padding: isMobile ? 14 : 24, width: "min(520px, 95vw)" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 16 }}>{editingService ? "Edit Service" : "New Service"}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Carrier *</div><Select value={serviceForm.carrier_id} onChange={v => setServiceForm(f => ({ ...f, carrier_id: v }))} placeholder="Select carrier…" options={carriers.map(c => ({ value: c.id, label: c.name, icon: CARRIER_ICONS[c.code] || "🚚" }))} /></div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr", gap: 10 }}>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Service Name *</div><input value={serviceForm.name} onChange={e => setServiceForm(f => ({ ...f, name: e.target.value }))} placeholder="Priority Mail" style={inp} /></div>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Code *</div><input value={serviceForm.code} onChange={e => setServiceForm(f => ({ ...f, code: e.target.value.toLowerCase() }))} placeholder="usps_priority" style={{ ...inp, fontFamily: "monospace" }} /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr 1fr", gap: 10 }}>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Level</div><Select value={serviceForm.service_level} onChange={v => setServiceForm(f => ({ ...f, service_level: v }))} options={[{value:"economy",label:"Economy"},{value:"standard",label:"Standard"},{value:"express",label:"Express"},{value:"overnight",label:"Overnight"}]} /></div>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Min Days</div><input type="number" value={serviceForm.estimated_days_min} onChange={e => setServiceForm(f => ({ ...f, estimated_days_min: e.target.value }))} style={inp} /></div>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Max Days</div><input type="number" value={serviceForm.estimated_days_max} onChange={e => setServiceForm(f => ({ ...f, estimated_days_max: e.target.value }))} style={inp} /></div>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Base Rate</div><input type="number" step="0.01" value={serviceForm.base_rate} onChange={e => setServiceForm(f => ({ ...f, base_rate: e.target.value }))} placeholder="8.50" style={inp} /></div>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => setShowServiceModal(false)} style={{ padding: "8px 16px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text3, cursor: "pointer" }}>Cancel</button>
                <button onClick={saveService} disabled={!serviceForm.name.trim() || !serviceForm.carrier_id} style={{ padding: "8px 16px", fontSize: 12, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", opacity: !serviceForm.name.trim() || !serviceForm.carrier_id ? 0.5 : 1 }}>{editingService ? "Save" : "Create"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ENTITIES VIEW — Legal entities, subsidiaries, transfer pricing, currencies
// ═══════════════════════════════════════════════════════════════════════════════
function EntitiesView({ entities, setEntities, facilities, currencies, exchangeRates, suppliers, isMobile }) {
  const [selected, setSelected] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const FORM_INIT = { name: "", code: "", entity_type: "subsidiary", country: "", region: "North America", base_currency: "USD", city: "", tax_id: "", transfer_pricing_method: "cost_plus", transfer_pricing_markup_pct: 10, fiscal_year_start: 1, notes: "" };
  const [form, setForm] = useState(FORM_INIT);
  const inp = { width: "100%", padding: "8px 12px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, outline: "none", boxSizing: "border-box" };

  const parentEntity = entities.find(e => e.entity_type === "parent");
  const subsidiaries = entities.filter(e => e.entity_type !== "parent");
  const getEntityFacilities = eid => facilities.filter(f => f.entity_id === eid);
  const getEntitySuppliers = eid => suppliers.filter(s => s.entity_id === eid);
  const getRate = (from, to) => { const r = exchangeRates.find(x => x.from_currency === from && x.to_currency === to); return r?.rate; };

  const REGION_COLORS = { "North America": "#3B82F6", "Europe": "#10B981", "APAC": "#F59E0B", "LATAM": "#EF4444" };
  const TP_METHODS = { cost_plus: "Cost Plus", resale_minus: "Resale Minus", comparable_uncontrolled: "Comparable Uncontrolled", transactional_net_margin: "Trans. Net Margin", profit_split: "Profit Split" };
  const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  const saveEntity = async () => {
    if (!form.name.trim() || !form.code.trim()) return;
    const payload = { ...form, parent_entity_id: parentEntity?.id || null, transfer_pricing_markup_pct: parseFloat(form.transfer_pricing_markup_pct) || 0, fiscal_year_start: parseInt(form.fiscal_year_start) || 1 };
    if (selected && showNew) {
      const { data } = await supabase.from("erp_entities").update(payload).eq("id", selected.id).select().single();
      if (data) { setEntities(p => p.map(x => x.id === data.id ? data : x)); setSelected(data); }
    } else {
      const { data } = await supabase.from("erp_entities").insert(payload).select().single();
      if (data) { setEntities(p => [...p, data]); setSelected(data); }
    }
    setShowNew(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div><div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>Legal Entities</div><div style={{ fontSize: 12, color: T.text3 }}>{entities.length} entities · {currencies.length} currencies</div></div>
        <button onClick={() => { setForm(FORM_INIT); setSelected(null); setShowNew(true); }} style={{ padding: "6px 14px", fontSize: 12, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>+ Entity</button>
      </div>

      {/* KPI */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 8 }}>
        {[{ l: "Entities", v: entities.length, c: T.accent }, { l: "Currencies", v: currencies.length, c: "#3B82F6" }, { l: "Regions", v: new Set(entities.map(e => e.region).filter(Boolean)).size, c: "#10B981" }, { l: "Exchange Rates", v: exchangeRates.length, c: "#F59E0B" }].map(s => (
          <Card key={s.l} style={{ textAlign: "center", padding: 10 }}><div style={{ fontSize: 18, fontWeight: 900, color: s.c }}>{s.v}</div><div style={{ fontSize: 9, color: T.text3 }}>{s.l}</div></Card>
        ))}
      </div>

      {/* Entity org chart */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : selected ? "1fr 1.2fr" : "1fr", gap: 16 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {/* Parent entity */}
          {parentEntity && (
            <Card onClick={() => setSelected(parentEntity)} style={{ padding: "14px 16px", borderLeft: `4px solid ${T.accent}`, cursor: "pointer", background: selected?.id === parentEntity.id ? T.accentDim : T.surface }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 22 }}>🏛</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>{parentEntity.name}</div>
                  <div style={{ fontSize: 11, color: T.text3 }}>{parentEntity.code} · {parentEntity.country} · {parentEntity.base_currency} · Parent</div>
                </div>
              </div>
            </Card>
          )}

          {/* Subsidiaries */}
          {subsidiaries.map(ent => {
            const sel = selected?.id === ent.id;
            const regionColor = REGION_COLORS[ent.region] || T.text3;
            const facCount = getEntityFacilities(ent.id).length;
            return (
              <Card key={ent.id} onClick={() => setSelected(ent)} style={{ padding: "12px 16px", marginLeft: isMobile ? 0 : 20, borderLeft: `4px solid ${regionColor}`, cursor: "pointer", background: sel ? `${regionColor}10` : T.surface }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 18 }}>🌐</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{ent.name}</span>
                      <span style={{ fontSize: 9, fontFamily: "monospace", padding: "1px 5px", borderRadius: 3, background: T.surface2, color: T.text3 }}>{ent.code}</span>
                    </div>
                    <div style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>{ent.country} · {ent.base_currency} · {ent.region}{facCount > 0 ? ` · ${facCount} facilities` : ""}</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: regionColor }}>{ent.transfer_pricing_markup_pct || 0}%</div>
                    <div style={{ fontSize: 9, color: T.text3 }}>{TP_METHODS[ent.transfer_pricing_method] || "—"}</div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Detail panel */}
        {selected && !isMobile && (
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20, overflow: "auto", maxHeight: "calc(100vh - 240px)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>{selected.name}</div>
                <div style={{ fontSize: 12, color: T.text3 }}>{selected.code} · {selected.entity_type}</div>
              </div>
              <button onClick={() => { setForm({ ...selected, transfer_pricing_markup_pct: selected.transfer_pricing_markup_pct || 0, fiscal_year_start: selected.fiscal_year_start || 1 }); setShowNew(true); }} style={{ padding: "5px 10px", fontSize: 11, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text2, cursor: "pointer" }}>Edit</button>
              {selected.entity_type !== "parent" && <button onClick={async () => { if (!window.confirm(`Delete ${selected.name}?`)) return; await supabase.from("erp_entities").delete().eq("id", selected.id); setEntities(p => p.filter(x => x.id !== selected.id)); setSelected(null); }} style={{ padding: "5px 10px", fontSize: 11, background: "#FEE2E2", border: "1px solid #FECACA", borderRadius: 6, color: "#991B1B", cursor: "pointer" }}>Delete</button>}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 16, padding: "12px 14px", background: T.surface2, borderRadius: 8 }}>
              {[
                { l: "Country", v: selected.country }, { l: "Region", v: selected.region || "—" }, { l: "Base Currency", v: selected.base_currency },
                { l: "Fiscal Year", v: `Starts ${MONTHS[(selected.fiscal_year_start || 1) - 1]}` }, { l: "Tax ID", v: selected.tax_id || "—" }, { l: "City", v: selected.city || "—" },
              ].map(d => <div key={d.l}><div style={{ fontSize: 9, color: T.text3, fontWeight: 700, textTransform: "uppercase" }}>{d.l}</div><div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginTop: 2 }}>{d.v}</div></div>)}
            </div>

            {/* Transfer Pricing */}
            <div style={{ marginBottom: 16, padding: "12px 14px", background: "#EDE9FE15", border: "1px solid #C4B5FD40", borderRadius: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#5B21B6", marginBottom: 8 }}>⚡ Transfer Pricing</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                <div><div style={{ fontSize: 9, color: T.text3, fontWeight: 700 }}>METHOD</div><div style={{ fontSize: 12, fontWeight: 600, color: T.text, textTransform: "capitalize" }}>{TP_METHODS[selected.transfer_pricing_method] || "—"}</div></div>
                <div><div style={{ fontSize: 9, color: T.text3, fontWeight: 700 }}>MARKUP</div><div style={{ fontSize: 18, fontWeight: 800, color: "#5B21B6" }}>{selected.transfer_pricing_markup_pct || 0}%</div></div>
              </div>
              {selected.base_currency !== "USD" && (
                <div style={{ marginTop: 8, fontSize: 11, color: T.text3 }}>
                  Exchange rate: 1 USD = {getRate("USD", selected.base_currency) || "?"} {selected.base_currency}
                </div>
              )}
            </div>

            {/* Facilities at this entity */}
            {(() => {
              const eFacs = getEntityFacilities(selected.id);
              return eFacs.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 6 }}>Facilities ({eFacs.length})</div>
                  {eFacs.map(f => (
                    <div key={f.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${T.border}`, fontSize: 11 }}>
                      <span>{f.name} ({f.facility_type})</span>
                      <span style={{ color: T.text3 }}>{f.city}{f.state ? `, ${f.state}` : ""}</span>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* IC Suppliers */}
            {(() => {
              const icSups = getEntitySuppliers(selected.id);
              return icSups.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 6 }}>Intercompany Suppliers ({icSups.length})</div>
                  {icSups.map(s => (
                    <div key={s.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: `1px solid ${T.border}`, fontSize: 11 }}>
                      <span>{s.name} ({s.code})</span>
                      <span style={{ color: T.text3 }}>{s.supplier_type?.replace(/_/g, " ")}</span>
                    </div>
                  ))}
                </div>
              );
            })()}

            {selected.notes && <div style={{ fontSize: 11, color: T.text3, padding: "8px 10px", background: T.surface2, borderRadius: 6 }}>{selected.notes}</div>}
          </div>
        )}
      </div>

      {/* Exchange Rates */}
      <Card style={{ padding: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 10 }}>Exchange Rates (USD base)</div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 8 }}>
          {currencies.filter(c => c.code !== "USD").map(c => {
            const rate = getRate("USD", c.code);
            return (
              <div key={c.code} style={{ padding: "8px 10px", background: T.surface2, borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div><div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{c.symbol} {c.code}</div><div style={{ fontSize: 9, color: T.text3 }}>{c.name}</div></div>
                <div style={{ fontSize: 14, fontWeight: 800, color: T.accent }}>{rate || "—"}</div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Create/Edit Entity Modal */}
      {showNew && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowNew(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: 14, padding: isMobile ? 14 : 24, width: "min(580px, 95vw)", maxHeight: "90vh", overflow: "auto" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 16 }}>{selected ? "Edit Entity" : "New Entity"}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr", gap: 10 }}>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Name *</div><input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} style={inp} /></div>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Code *</div><input value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="EB-XX" style={{ ...inp, fontFamily: "monospace" }} /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 10 }}>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Country</div><input value={form.country} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} style={inp} /></div>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Region</div><Select value={form.region} onChange={v => setForm(f => ({ ...f, region: v }))} options={["North America","Europe","APAC","LATAM","Africa","Middle East"].map(r => ({ value: r, label: r }))} /></div>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Base Currency</div><Select value={form.base_currency} onChange={v => setForm(f => ({ ...f, base_currency: v }))} options={currencies.map(c => ({ value: c.code, label: `${c.code} (${c.symbol})`, sublabel: c.name }))} /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 10 }}>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>City</div><input value={form.city || ""} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} style={inp} /></div>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Tax ID</div><input value={form.tax_id || ""} onChange={e => setForm(f => ({ ...f, tax_id: e.target.value }))} placeholder="EIN / VAT" style={inp} /></div>
                <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Fiscal Year Start</div><Select value={String(form.fiscal_year_start)} onChange={v => setForm(f => ({ ...f, fiscal_year_start: v }))} options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))} /></div>
              </div>
              <div style={{ padding: "10px 12px", background: "#EDE9FE15", border: "1px solid #C4B5FD40", borderRadius: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#5B21B6", marginBottom: 8 }}>Transfer Pricing</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Method</div><Select value={form.transfer_pricing_method} onChange={v => setForm(f => ({ ...f, transfer_pricing_method: v }))} options={Object.entries(TP_METHODS).map(([k, v]) => ({ value: k, label: v }))} /></div>
                  <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Markup %</div><input type="number" value={form.transfer_pricing_markup_pct} onChange={e => setForm(f => ({ ...f, transfer_pricing_markup_pct: e.target.value }))} style={inp} /></div>
                </div>
              </div>
              <div><div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Notes</div><textarea value={form.notes || ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...inp, resize: "vertical" }} /></div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => setShowNew(false)} style={{ padding: "8px 16px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text3, cursor: "pointer" }}>Cancel</button>
                <button onClick={saveEntity} disabled={!form.name.trim() || !form.code.trim()} style={{ padding: "8px 16px", fontSize: 12, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", opacity: !form.name.trim() || !form.code.trim() ? 0.5 : 1 }}>{selected ? "Save" : "Create"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORTS VIEW — Pre-built reports + Custom Report Builder
// ═══════════════════════════════════════════════════════════════════════════════

// Schema map — describes all ERP tables and their relationships
const ERP_SCHEMA = {
  products: { label: "Products", icon: "📦", table: "erp_products", fields: [
    { key: "name", label: "Name", type: "text" }, { key: "category", label: "Category", type: "text" },
    { key: "product_type", label: "Type", type: "enum", options: ["finished_good","raw_material","packaging","component","service"] },
    { key: "brand", label: "Brand", type: "text" }, { key: "status", label: "Status", type: "enum", options: ["active","development","discontinued","archived"] },
    { key: "default_uom", label: "UOM", type: "text" }, { key: "country_of_origin", label: "Origin", type: "text" },
  ], joins: ["variants","boms"] },
  variants: { label: "SKU Variants", icon: "🏷", table: "erp_product_variants", fields: [
    { key: "sku", label: "SKU", type: "text" }, { key: "name", label: "Name", type: "text" },
    { key: "size", label: "Size", type: "text" }, { key: "barcode", label: "Barcode", type: "text" },
    { key: "cost", label: "Cost", type: "currency" }, { key: "wholesale_price", label: "Wholesale", type: "currency" },
    { key: "msrp", label: "MSRP", type: "currency" }, { key: "case_pack", label: "Case Pack", type: "number" },
    { key: "shelf_life_days", label: "Shelf Life (days)", type: "number" },
    { key: "status", label: "Status", type: "enum", options: ["active","discontinued"] },
  ], joins: ["products","inventory","order_items","boms"] },
  suppliers: { label: "Suppliers", icon: "🏭", table: "erp_suppliers", fields: [
    { key: "name", label: "Name", type: "text" }, { key: "code", label: "Code", type: "text" },
    { key: "supplier_type", label: "Type", type: "enum", options: ["raw_material","packaging","contract_manufacturer","3pl","service","white_label"] },
    { key: "country", label: "Country", type: "text" }, { key: "payment_terms", label: "Terms", type: "text" },
    { key: "lead_time_days", label: "Lead Time", type: "number" }, { key: "rating", label: "Rating", type: "number" },
    { key: "is_intercompany", label: "Intercompany", type: "boolean" },
  ], joins: ["purchase_orders","supplier_items","lots"] },
  purchase_orders: { label: "Purchase Orders", icon: "📋", table: "erp_purchase_orders", fields: [
    { key: "po_number", label: "PO #", type: "text" },
    { key: "status", label: "Status", type: "enum", options: ["draft","submitted","confirmed","partially_received","received","closed","cancelled"] },
    { key: "order_date", label: "Order Date", type: "date" }, { key: "expected_date", label: "Expected", type: "date" },
    { key: "total", label: "Total", type: "currency" }, { key: "po_currency", label: "Currency", type: "text" },
    { key: "is_intercompany", label: "Intercompany", type: "boolean" },
  ], joins: ["suppliers","facilities","po_items","entities"] },
  inventory: { label: "Inventory", icon: "📊", table: "erp_inventory", fields: [
    { key: "quantity", label: "Quantity", type: "number" }, { key: "reserved_quantity", label: "Reserved", type: "number" },
    { key: "bin_location", label: "Bin", type: "text" }, { key: "unit", label: "Unit", type: "text" },
  ], joins: ["variants","facilities","lots"] },
  lots: { label: "Inventory Lots", icon: "🏷", table: "erp_inventory_lots", fields: [
    { key: "lot_number", label: "Lot #", type: "text" }, { key: "supplier_lot_number", label: "Supplier Lot", type: "text" },
    { key: "manufactured_date", label: "Mfg Date", type: "date" }, { key: "expiry_date", label: "Expiry", type: "date" },
    { key: "status", label: "Status", type: "enum", options: ["available","quarantine","expired","consumed","recalled"] },
  ], joins: ["variants","suppliers","inventory"] },
  orders: { label: "Sales Orders", icon: "🛒", table: "erp_orders", fields: [
    { key: "order_number", label: "Order #", type: "text" },
    { key: "channel", label: "Channel", type: "enum", options: ["shopify","amazon","retail","wholesale","manual"] },
    { key: "status", label: "Status", type: "enum", options: ["pending","confirmed","processing","shipped","delivered","cancelled","refunded"] },
    { key: "fulfillment_status", label: "Fulfillment", type: "enum", options: ["unfulfilled","partial","fulfilled"] },
    { key: "order_date", label: "Order Date", type: "date" }, { key: "total", label: "Total", type: "currency" },
  ], joins: ["customers","order_items","entities"] },
  order_items: { label: "Order Line Items", icon: "📝", table: "erp_order_items", fields: [
    { key: "sku", label: "SKU", type: "text" }, { key: "title", label: "Title", type: "text" },
    { key: "quantity", label: "Qty", type: "number" }, { key: "unit_price", label: "Price", type: "currency" },
    { key: "total", label: "Total", type: "currency" },
  ], joins: ["orders","variants"] },
  customers: { label: "Customers", icon: "👥", table: "erp_customers", fields: [
    { key: "name", label: "Name", type: "text" },
    { key: "customer_type", label: "Type", type: "enum", options: ["dtc","retail","wholesale","distributor","amazon"] },
    { key: "payment_terms", label: "Terms", type: "text" }, { key: "credit_limit", label: "Credit Limit", type: "currency" },
    { key: "status", label: "Status", type: "enum", options: ["active","inactive"] },
  ], joins: ["orders"] },
  work_orders: { label: "Work Orders", icon: "⚙", table: "erp_work_orders", fields: [
    { key: "wo_number", label: "WO #", type: "text" },
    { key: "status", label: "Status", type: "enum", options: ["planned","released","in_progress","completed","cancelled"] },
    { key: "planned_quantity", label: "Planned Qty", type: "number" }, { key: "completed_quantity", label: "Completed", type: "number" },
    { key: "planned_start", label: "Start", type: "date" }, { key: "planned_end", label: "End", type: "date" },
  ], joins: ["variants","facilities","boms"] },
  facilities: { label: "Facilities", icon: "🏢", table: "erp_facilities", fields: [
    { key: "name", label: "Name", type: "text" },
    { key: "facility_type", label: "Type", type: "enum", options: ["warehouse","factory","3pl","office","retail"] },
    { key: "operator", label: "Operator", type: "text" }, { key: "city", label: "City", type: "text" },
    { key: "country", label: "Country", type: "text" }, { key: "is_active", label: "Active", type: "boolean" },
  ], joins: ["inventory","entities","purchase_orders","work_orders"] },
  entities: { label: "Entities", icon: "🌐", table: "erp_entities", fields: [
    { key: "name", label: "Name", type: "text" }, { key: "code", label: "Code", type: "text" },
    { key: "country", label: "Country", type: "text" }, { key: "region", label: "Region", type: "text" },
    { key: "base_currency", label: "Currency", type: "text" },
    { key: "transfer_pricing_method", label: "TP Method", type: "text" },
    { key: "transfer_pricing_markup_pct", label: "TP Markup %", type: "number" },
  ], joins: ["facilities","suppliers","purchase_orders","orders"] },
};

function ReportsView({ products, variants, suppliers, purchaseOrders, poItems, inventory, lots, orders, orderItems, customers, workOrders, facilities, entities, supplierItems, boms, bomItems, isMobile }) {
  const [activeReport, setActiveReport] = useState(null);
  const [subView, setSubView] = useState("library"); // library, builder, results
  const [builderConfig, setBuilderConfig] = useState({ source: "", fields: [], filters: [], groupBy: "", sortBy: "", sortDir: "asc" });
  const [customResults, setCustomResults] = useState(null);

  // Data map for the report builder
  const DATA_MAP = { products, variants, suppliers, purchase_orders: purchaseOrders, po_items: poItems, inventory, lots, orders, order_items: orderItems, customers, work_orders: workOrders, facilities, entities, supplier_items: supplierItems, boms, bom_items: bomItems };

  // Lookup helpers
  const lookup = (collection, id) => DATA_MAP[collection]?.find(x => x.id === id);
  const getVariant = id => variants.find(v => v.id === id);
  const getProduct = id => products.find(p => p.id === id);
  const getSupplier = id => suppliers.find(s => s.id === id);
  const getFacility = id => facilities.find(f => f.id === id);
  const getCustomer = id => customers.find(c => c.id === id);
  const getEntity = id => entities.find(e => e.id === id);

  // ── PRE-BUILT REPORTS ───────────────────────────────────────────────────────
  const REPORTS = [
    { id: "inv_valuation", name: "Inventory Valuation", icon: "💰", category: "Inventory", description: "Total inventory value by SKU across all facilities",
      run: () => {
        const rows = [];
        const bySku = {};
        inventory.forEach(inv => {
          const v = getVariant(inv.variant_id);
          if (!v) return;
          if (!bySku[v.sku]) bySku[v.sku] = { sku: v.sku, name: v.name, cost: v.cost || 0, totalQty: 0, totalValue: 0, facilities: 0 };
          bySku[v.sku].totalQty += inv.quantity || 0;
          bySku[v.sku].totalValue += (inv.quantity || 0) * (v.cost || 0);
          bySku[v.sku].facilities++;
        });
        return { columns: ["SKU", "Product", "Unit Cost", "Total Qty", "Value", "Locations"], rows: Object.values(bySku).sort((a,b) => b.totalValue - a.totalValue).map(r => [r.sku, r.name, fmt(r.cost), fmtN(r.totalQty), fmt(r.totalValue), r.facilities]),
          summary: `Total: ${fmt(Object.values(bySku).reduce((s,r) => s + r.totalValue, 0))}` };
      }
    },
    { id: "inv_by_facility", name: "Inventory by Facility", icon: "🏢", category: "Inventory", description: "Stock distribution across warehouses, 3PLs, and factories",
      run: () => {
        const rows = facilities.map(f => {
          const facInv = inventory.filter(i => i.facility_id === f.id);
          const units = facInv.reduce((s,i) => s + (i.quantity||0), 0);
          const skus = new Set(facInv.map(i => i.variant_id).filter(Boolean)).size;
          const value = facInv.reduce((s,i) => { const v = getVariant(i.variant_id); return s + (i.quantity||0) * (v?.cost||0); }, 0);
          return [f.name, f.facility_type, f.operator || "—", fmtN(units), skus, fmt(value)];
        }).filter(r => parseInt(r[3].replace(/,/g,"")) > 0);
        return { columns: ["Facility", "Type", "Operator", "Units", "SKUs", "Value"], rows, summary: `${facilities.length} facilities` };
      }
    },
    { id: "expiring_lots", name: "Expiring Lots", icon: "⚠️", category: "Inventory", description: "Lots expiring within 90, 60, and 30 days",
      run: () => {
        const now = Date.now();
        const rows = lots.filter(l => l.expiry_date && l.status === "available").map(l => {
          const days = Math.ceil((new Date(l.expiry_date) - now) / 86400000);
          const v = getVariant(l.variant_id);
          const sup = getSupplier(l.supplier_id);
          const qty = inventory.filter(i => i.lot_id === l.id).reduce((s,i) => s + (i.quantity||0), 0);
          return { days, row: [l.lot_number, v?.sku || "—", v?.name || "—", sup?.name || "—", fmtN(qty), l.expiry_date ? new Date(l.expiry_date).toLocaleDateString() : "—", days < 0 ? "EXPIRED" : `${days}d`] };
        }).sort((a,b) => a.days - b.days);
        return { columns: ["Lot #", "SKU", "Product", "Supplier", "Qty", "Expiry", "Days Left"], rows: rows.map(r => r.row), summary: `${rows.filter(r => r.days <= 30).length} critical (<30d), ${rows.filter(r => r.days <= 90).length} total` };
      }
    },
    { id: "sales_by_channel", name: "Sales by Channel", icon: "🛒", category: "Sales", description: "Revenue and order count breakdown by sales channel",
      run: () => {
        const channels = {};
        orders.forEach(o => {
          if (!channels[o.channel]) channels[o.channel] = { channel: o.channel, orders: 0, revenue: 0, avgOrder: 0, fulfilled: 0 };
          channels[o.channel].orders++;
          channels[o.channel].revenue += o.total || 0;
          if (o.fulfillment_status === "fulfilled") channels[o.channel].fulfilled++;
        });
        Object.values(channels).forEach(c => c.avgOrder = c.orders > 0 ? c.revenue / c.orders : 0);
        return { columns: ["Channel", "Orders", "Revenue", "Avg Order", "Fulfilled", "Fill Rate"], rows: Object.values(channels).sort((a,b) => b.revenue - a.revenue).map(c => [c.channel, c.orders, fmt(c.revenue), fmt(c.avgOrder), c.fulfilled, c.orders > 0 ? `${Math.round(c.fulfilled/c.orders*100)}%` : "—"]),
          summary: `Total: ${fmt(orders.reduce((s,o) => s + (o.total||0), 0))}` };
      }
    },
    { id: "sales_by_customer", name: "Sales by Customer", icon: "👥", category: "Sales", description: "Top customers by revenue with order counts",
      run: () => {
        const custs = {};
        orders.forEach(o => {
          const c = getCustomer(o.customer_id);
          const key = c?.id || "unknown";
          if (!custs[key]) custs[key] = { name: c?.name || "DTC", type: c?.customer_type || "—", orders: 0, revenue: 0, lastOrder: null };
          custs[key].orders++;
          custs[key].revenue += o.total || 0;
          if (!custs[key].lastOrder || new Date(o.order_date) > new Date(custs[key].lastOrder)) custs[key].lastOrder = o.order_date;
        });
        return { columns: ["Customer", "Type", "Orders", "Revenue", "Avg Order", "Last Order"], rows: Object.values(custs).sort((a,b) => b.revenue - a.revenue).map(c => [c.name, c.type, c.orders, fmt(c.revenue), fmt(c.revenue/c.orders), c.lastOrder ? new Date(c.lastOrder).toLocaleDateString() : "—"]) };
      }
    },
    { id: "top_skus", name: "Top Selling SKUs", icon: "🏆", category: "Sales", description: "Best-selling products by units sold and revenue",
      run: () => {
        const skus = {};
        orderItems.forEach(oi => {
          const key = oi.sku || oi.variant_id || "unknown";
          const v = getVariant(oi.variant_id);
          if (!skus[key]) skus[key] = { sku: oi.sku || v?.sku || "—", name: oi.title || v?.name || "—", units: 0, revenue: 0, orders: 0 };
          skus[key].units += oi.quantity || 0;
          skus[key].revenue += oi.total || (oi.quantity * oi.unit_price) || 0;
          skus[key].orders++;
        });
        return { columns: ["SKU", "Product", "Units Sold", "Revenue", "Avg Price", "# Orders"], rows: Object.values(skus).sort((a,b) => b.revenue - a.revenue).map(s => [s.sku, s.name, fmtN(s.units), fmt(s.revenue), fmt(s.units > 0 ? s.revenue/s.units : 0), s.orders]) };
      }
    },
    { id: "po_summary", name: "PO Summary", icon: "📋", category: "Purchasing", description: "Purchase order overview by status and supplier",
      run: () => {
        const rows = purchaseOrders.map(po => {
          const sup = getSupplier(po.supplier_id);
          const items = poItems.filter(i => i.po_id === po.id);
          return [po.po_number, sup?.name || "—", po.status, po.order_date ? new Date(po.order_date).toLocaleDateString() : "—", po.expected_date ? new Date(po.expected_date).toLocaleDateString() : "—", items.length, fmt(po.total), po.is_intercompany ? "Yes" : "No"];
        });
        return { columns: ["PO #", "Supplier", "Status", "Order Date", "Expected", "Lines", "Total", "IC"], rows, summary: `Total: ${fmt(purchaseOrders.reduce((s,p) => s + (p.total||0), 0))}` };
      }
    },
    { id: "supplier_spend", name: "Supplier Spend Analysis", icon: "💳", category: "Purchasing", description: "Spend breakdown by supplier with PO counts",
      run: () => {
        const sups = {};
        purchaseOrders.forEach(po => {
          const s = getSupplier(po.supplier_id);
          const key = s?.id || "unknown";
          if (!sups[key]) sups[key] = { name: s?.name || "—", code: s?.code || "—", type: s?.supplier_type || "—", pos: 0, total: 0, open: 0 };
          sups[key].pos++;
          sups[key].total += po.total || 0;
          if (!["received","closed","cancelled"].includes(po.status)) sups[key].open++;
        });
        return { columns: ["Supplier", "Code", "Type", "POs", "Open", "Total Spend"], rows: Object.values(sups).sort((a,b) => b.total - a.total).map(s => [s.name, s.code, s.type, s.pos, s.open, fmt(s.total)]) };
      }
    },
    { id: "bom_cost", name: "BOM Cost Analysis", icon: "🧪", category: "Manufacturing", description: "Bill of materials cost breakdown per product",
      run: () => {
        const rows = boms.filter(b => b.status === "active").map(b => {
          const v = variants.find(x => x.id === b.variant_id);
          const items = bomItems.filter(i => i.bom_id === b.id);
          const materialCost = items.filter(i => i.item_type === "raw_material").reduce((s,i) => s + (i.quantity||0)*(i.cost_per_unit||0), 0);
          const packagingCost = items.filter(i => i.item_type === "packaging").reduce((s,i) => s + (i.quantity||0)*(i.cost_per_unit||0), 0);
          const laborCost = items.filter(i => i.item_type === "labor").reduce((s,i) => s + (i.quantity||0)*(i.cost_per_unit||0), 0);
          const total = materialCost + packagingCost + laborCost;
          const margin = v?.msrp ? ((v.msrp - total) / v.msrp * 100) : 0;
          return [v?.sku || "—", b.name, items.length, fmt(materialCost), fmt(packagingCost), fmt(laborCost), fmt(total), v?.msrp ? fmt(v.msrp) : "—", `${margin.toFixed(1)}%`];
        });
        return { columns: ["SKU", "BOM", "Items", "Materials", "Packaging", "Labor", "Total Cost", "MSRP", "Margin %"], rows };
      }
    },
    { id: "wo_production", name: "Production Report", icon: "⚙", category: "Manufacturing", description: "Work order status, yield, and completion rates",
      run: () => {
        const rows = workOrders.map(wo => {
          const v = getVariant(wo.variant_id);
          const f = getFacility(wo.facility_id);
          const yld = wo.planned_quantity > 0 ? ((wo.completed_quantity||0)/wo.planned_quantity*100) : 0;
          return [wo.wo_number, v?.sku || "—", f?.name || "—", wo.status, fmtN(wo.planned_quantity), fmtN(wo.completed_quantity||0), `${yld.toFixed(0)}%`, wo.planned_start ? new Date(wo.planned_start).toLocaleDateString() : "—"];
        });
        return { columns: ["WO #", "SKU", "Facility", "Status", "Planned", "Completed", "Yield", "Start"], rows };
      }
    },
    { id: "entity_overview", name: "Entity Overview", icon: "🌐", category: "Corporate", description: "Legal entity summary with facilities, transfer pricing, and currencies",
      run: () => {
        const rows = entities.map(e => {
          const facs = facilities.filter(f => f.entity_id === e.id).length;
          const sups = suppliers.filter(s => s.entity_id === e.id).length;
          return [e.code, e.name, e.country, e.region || "—", e.base_currency, e.entity_type, facs, e.transfer_pricing_method || "—", `${e.transfer_pricing_markup_pct||0}%`];
        });
        return { columns: ["Code", "Name", "Country", "Region", "Currency", "Type", "Facilities", "TP Method", "Markup"], rows };
      }
    },
    { id: "stock_reorder", name: "Stock Reorder Report", icon: "🔄", category: "Inventory", description: "Low stock items that may need reordering based on sales velocity",
      run: () => {
        const skuData = {};
        inventory.forEach(inv => {
          const v = getVariant(inv.variant_id);
          if (!v) return;
          if (!skuData[v.sku]) skuData[v.sku] = { sku: v.sku, name: v.name, stock: 0, sold30d: 0, daysOfStock: 0, cost: v.cost || 0 };
          skuData[v.sku].stock += inv.quantity || 0;
        });
        const thirtyAgo = new Date(Date.now() - 30 * 86400000);
        orderItems.forEach(oi => {
          const v = getVariant(oi.variant_id);
          if (!v || !skuData[v.sku]) return;
          const order = orders.find(o => o.id === oi.order_id);
          if (order && new Date(order.order_date) >= thirtyAgo) skuData[v.sku].sold30d += oi.quantity || 0;
        });
        Object.values(skuData).forEach(s => { s.dailyRate = s.sold30d / 30; s.daysOfStock = s.dailyRate > 0 ? Math.round(s.stock / s.dailyRate) : 999; });
        return { columns: ["SKU", "Product", "Stock", "Sold (30d)", "Daily Rate", "Days of Stock", "Reorder Value"], rows: Object.values(skuData).sort((a,b) => a.daysOfStock - b.daysOfStock).map(s => [s.sku, s.name, fmtN(s.stock), fmtN(s.sold30d), s.dailyRate.toFixed(1), s.daysOfStock >= 999 ? "∞" : s.daysOfStock, s.daysOfStock < 60 ? fmt(s.dailyRate * 90 * s.cost) : "—"]) };
      }
    },
  ];

  const CATEGORIES = [...new Set(REPORTS.map(r => r.category))];

  // ── CUSTOM REPORT BUILDER ───────────────────────────────────────────────────
  const runCustomReport = () => {
    const schema = ERP_SCHEMA[builderConfig.source];
    if (!schema) return;
    let data = [...(DATA_MAP[builderConfig.source] || [])];
    // Apply filters
    (builderConfig.filters || []).forEach(f => {
      if (!f.field || !f.value) return;
      data = data.filter(row => {
        const val = String(row[f.field] || "").toLowerCase();
        const target = String(f.value).toLowerCase();
        if (f.op === "equals") return val === target;
        if (f.op === "contains") return val.includes(target);
        if (f.op === "not_equals") return val !== target;
        if (f.op === "gt") return parseFloat(row[f.field]) > parseFloat(f.value);
        if (f.op === "lt") return parseFloat(row[f.field]) < parseFloat(f.value);
        if (f.op === "is_true") return row[f.field] === true;
        if (f.op === "is_false") return row[f.field] !== true;
        return true;
      });
    });
    // Sort
    if (builderConfig.sortBy) {
      data.sort((a, b) => {
        const av = a[builderConfig.sortBy], bv = b[builderConfig.sortBy];
        const cmp = typeof av === "number" ? av - bv : String(av || "").localeCompare(String(bv || ""));
        return builderConfig.sortDir === "desc" ? -cmp : cmp;
      });
    }
    // Select fields
    const fields = (builderConfig.fields.length > 0 ? builderConfig.fields : schema.fields.map(f => f.key)).slice(0, 10);
    const fieldLabels = fields.map(k => schema.fields.find(f => f.key === k)?.label || k);
    // Resolve lookups for display
    const rows = data.map(row => fields.map(k => {
      const val = row[k];
      if (val === null || val === undefined) return "—";
      if (typeof val === "boolean") return val ? "Yes" : "No";
      if (k.endsWith("_id") && typeof val === "string" && val.includes("-")) {
        // Try to resolve foreign keys
        if (k === "product_id") { const p = getProduct(val); return p?.name || val.slice(0,8); }
        if (k === "variant_id") { const v = getVariant(val); return v?.sku || val.slice(0,8); }
        if (k === "supplier_id") { const s = getSupplier(val); return s?.name || val.slice(0,8); }
        if (k === "facility_id") { const f = getFacility(val); return f?.name || val.slice(0,8); }
        if (k === "customer_id") { const c = getCustomer(val); return c?.name || val.slice(0,8); }
        if (k === "entity_id" || k === "buying_entity_id") { const e = getEntity(val); return e?.code || val.slice(0,8); }
        return val.slice(0, 8) + "…";
      }
      if (typeof val === "number" && (k.includes("price") || k.includes("cost") || k === "total" || k.includes("limit") || k.includes("value"))) return fmt(val);
      if (typeof val === "string" && val.match(/^\d{4}-\d{2}-\d{2}/)) return new Date(val).toLocaleDateString();
      return String(val);
    }));
    setCustomResults({ columns: fieldLabels, rows, count: data.length, source: schema.label });
    setSubView("results");
  };

  const addFilter = () => setBuilderConfig(c => ({ ...c, filters: [...c.filters, { field: "", op: "equals", value: "" }] }));
  const updateFilter = (i, key, val) => setBuilderConfig(c => ({ ...c, filters: c.filters.map((f, j) => j === i ? { ...f, [key]: val } : f) }));
  const removeFilter = i => setBuilderConfig(c => ({ ...c, filters: c.filters.filter((_, j) => j !== i) }));

  const inp = { width: "100%", padding: "7px 10px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, outline: "none", boxSizing: "border-box" };
  const activeSchema = ERP_SCHEMA[builderConfig.source];

  // ── RENDER REPORT TABLE ─────────────────────────────────────────────────────
  const ReportTable = ({ columns, rows, summary }) => (
    <div>
      {summary && <div style={{ fontSize: 12, fontWeight: 700, color: T.accent, marginBottom: 8 }}>{summary}</div>}
      <div style={{ overflowX: "auto", border: `1px solid ${T.border}`, borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
          <thead><tr style={{ background: T.surface2 }}>
            {columns.map(c => <th key={c} style={{ textAlign: "left", padding: "8px 10px", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", borderBottom: `2px solid ${T.border}`, whiteSpace: "nowrap" }}>{c}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} style={{ borderBottom: `1px solid ${T.border}`, background: i % 2 === 0 ? "transparent" : T.surface2 + "40" }}>
                {row.map((cell, j) => <td key={j} style={{ padding: "6px 10px", color: T.text, whiteSpace: "nowrap" }}>{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 11, color: T.text3, marginTop: 6 }}>{rows.length} row{rows.length !== 1 ? "s" : ""}</div>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div><div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>Reports</div><div style={{ fontSize: 12, color: T.text3 }}>{REPORTS.length} pre-built reports + custom builder</div></div>
      </div>

      {/* Sub-nav */}
      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${T.border}` }}>
        {[["library", "📊 Report Library"], ["builder", "🔧 Custom Builder"], ...(activeReport || customResults ? [["results", "📋 Results"]] : [])].map(([k, l]) => (
          <button key={k} onClick={() => setSubView(k)} style={{ padding: "8px 16px", background: "none", border: "none", borderBottom: subView === k ? `2px solid ${T.accent}` : "2px solid transparent", cursor: "pointer", color: subView === k ? T.accent : T.text3, fontSize: 12, fontWeight: subView === k ? 700 : 500 }}>{l}</button>
        ))}
      </div>

      {/* REPORT LIBRARY */}
      {subView === "library" && (
        <>
          {CATEGORIES.map(cat => (
            <div key={cat}>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 8 }}>{cat}</div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
                {REPORTS.filter(r => r.category === cat).map(r => (
                  <Card key={r.id} onClick={() => { setActiveReport(r); setCustomResults(null); setSubView("results"); }}
                    style={{ padding: "12px 14px", cursor: "pointer" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 18 }}>{r.icon}</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{r.name}</span>
                    </div>
                    <div style={{ fontSize: 11, color: T.text3, lineHeight: 1.4 }}>{r.description}</div>
                  </Card>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {/* CUSTOM REPORT BUILDER */}
      {subView === "builder" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {/* Data source */}
          <Card style={{ padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 10 }}>1. Select Data Source</div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 6 }}>
              {Object.entries(ERP_SCHEMA).map(([key, schema]) => (
                <button key={key} onClick={() => setBuilderConfig(c => ({ ...c, source: key, fields: [], filters: [], groupBy: "", sortBy: "" }))}
                  style={{ padding: "8px", background: builderConfig.source === key ? T.accent + "15" : T.surface2, border: `1px solid ${builderConfig.source === key ? T.accent : T.border}`, borderRadius: 8, cursor: "pointer", textAlign: "left" }}>
                  <div style={{ fontSize: 14 }}>{schema.icon}</div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: builderConfig.source === key ? T.accent : T.text }}>{schema.label}</div>
                  <div style={{ fontSize: 9, color: T.text3 }}>{schema.fields.length} fields</div>
                </button>
              ))}
            </div>
            {activeSchema && (
              <div style={{ marginTop: 8, fontSize: 11, color: T.text3 }}>
                Connects to: {activeSchema.joins.map(j => ERP_SCHEMA[j]?.label || j).join(", ")}
              </div>
            )}
          </Card>

          {activeSchema && (
            <>
              {/* Select fields */}
              <Card style={{ padding: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 10 }}>2. Select Fields</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {activeSchema.fields.map(f => (
                    <button key={f.key} onClick={() => setBuilderConfig(c => ({ ...c, fields: c.fields.includes(f.key) ? c.fields.filter(x => x !== f.key) : [...c.fields, f.key] }))}
                      style={{ fontSize: 11, padding: "4px 10px", borderRadius: 12, cursor: "pointer", border: `1px solid ${builderConfig.fields.includes(f.key) ? T.accent : T.border}`, background: builderConfig.fields.includes(f.key) ? T.accent + "15" : "transparent", color: builderConfig.fields.includes(f.key) ? T.accent : T.text3, fontWeight: 600 }}>
                      {f.label}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 10, color: T.text3, marginTop: 6 }}>{builderConfig.fields.length === 0 ? "All fields selected (click to choose specific ones)" : `${builderConfig.fields.length} selected`}</div>
              </Card>

              {/* Filters */}
              <Card style={{ padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>3. Filters</div>
                  <button onClick={addFilter} style={{ padding: "4px 10px", fontSize: 11, fontWeight: 600, background: T.accentDim, color: T.accent, border: `1px solid ${T.accent}30`, borderRadius: 6, cursor: "pointer" }}>+ Filter</button>
                </div>
                {builderConfig.filters.map((f, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr 2fr auto", gap: 6, marginBottom: 6, alignItems: "center" }}>
                    <select value={f.field} onChange={e => updateFilter(i, "field", e.target.value)} style={inp}>
                      <option value="">Field…</option>
                      {activeSchema.fields.map(sf => <option key={sf.key} value={sf.key}>{sf.label}</option>)}
                    </select>
                    <select value={f.op} onChange={e => updateFilter(i, "op", e.target.value)} style={inp}>
                      {[["equals","="],["not_equals","≠"],["contains","contains"],["gt",">"],["lt","<"],["is_true","is true"],["is_false","is false"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    {!["is_true","is_false"].includes(f.op) && (() => {
                      const sf = activeSchema.fields.find(x => x.key === f.field);
                      if (sf?.type === "enum") return <select value={f.value} onChange={e => updateFilter(i, "value", e.target.value)} style={inp}><option value="">Any</option>{sf.options.map(o => <option key={o} value={o}>{o}</option>)}</select>;
                      return <input value={f.value} onChange={e => updateFilter(i, "value", e.target.value)} placeholder="Value…" style={inp} />;
                    })()}
                    <button onClick={() => removeFilter(i)} style={{ padding: "4px 8px", background: "none", border: "none", color: "#EF4444", cursor: "pointer", fontSize: 14 }}>✕</button>
                  </div>
                ))}
                {builderConfig.filters.length === 0 && <div style={{ fontSize: 11, color: T.text3 }}>No filters — showing all records</div>}
              </Card>

              {/* Sort + Run */}
              <Card style={{ padding: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 10 }}>4. Sort & Run</div>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr auto", gap: 8, alignItems: "end" }}>
                  <div><div style={{ fontSize: 10, color: T.text3, marginBottom: 2 }}>Sort By</div><select value={builderConfig.sortBy} onChange={e => setBuilderConfig(c => ({ ...c, sortBy: e.target.value }))} style={inp}><option value="">Default</option>{activeSchema.fields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}</select></div>
                  <div><div style={{ fontSize: 10, color: T.text3, marginBottom: 2 }}>Direction</div><select value={builderConfig.sortDir} onChange={e => setBuilderConfig(c => ({ ...c, sortDir: e.target.value }))} style={inp}><option value="asc">Ascending</option><option value="desc">Descending</option></select></div>
                  <button onClick={runCustomReport} style={{ padding: "8px 20px", fontSize: 13, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", whiteSpace: "nowrap" }}>▶ Run Report</button>
                </div>
              </Card>
            </>
          )}
        </div>
      )}

      {/* RESULTS */}
      {subView === "results" && (
        <div>
          {activeReport && (() => {
            const result = activeReport.run();
            return (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <span style={{ fontSize: 24 }}>{activeReport.icon}</span>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>{activeReport.name}</div>
                    <div style={{ fontSize: 12, color: T.text3 }}>{activeReport.description}</div>
                  </div>
                  <div style={{ flex: 1 }} />
                  <button onClick={() => { setSubView("library"); setActiveReport(null); }} style={{ padding: "6px 12px", fontSize: 11, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text3, cursor: "pointer" }}>← Back</button>
                </div>
                <ReportTable columns={result.columns} rows={result.rows} summary={result.summary} />
              </div>
            );
          })()}
          {customResults && !activeReport && (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                <span style={{ fontSize: 24 }}>🔧</span>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>Custom Report: {customResults.source}</div>
                  <div style={{ fontSize: 12, color: T.text3 }}>{customResults.count} records found</div>
                </div>
                <div style={{ flex: 1 }} />
                <button onClick={() => setSubView("builder")} style={{ padding: "6px 12px", fontSize: 11, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text3, cursor: "pointer" }}>← Edit</button>
              </div>
              <ReportTable columns={customResults.columns} rows={customResults.rows} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
