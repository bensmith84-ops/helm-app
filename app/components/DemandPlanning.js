"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { T } from "../tokens";
import MetabaseSync from "./MetabaseSync";

// ═══════════════════════════════════════════════════════════════════════════════
// DEMAND PLANNING MODULE
// Two UIs: Supply Chain (PO/Inventory) + Growth Planner (Marketing)
// ═══════════════════════════════════════════════════════════════════════════════

const fmt = n => n == null ? "—" : Number(n).toLocaleString();
const fmtD = n => n == null ? "—" : `$${Number(n).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const fmtPct = n => n == null ? "—" : `${(Number(n) * 100).toFixed(1)}%`;
const RISK_COLORS = { critical: "#dc2626", red: "#ef4444", yellow: "#f59e0b", green: "#22c55e" };
const CHANNELS = ["website", "amazon", "walmart", "target", "kroger", "wholesale", "other"];
const COUNTRIES = ["US", "CA", "GB", "AU", "EU", "Other"];

// ─── Mock data for development (until Metabase is connected) ──────────────────
const MOCK_PRODUCTS = [
  { base_product: "Laundry Sheets - Fresh Scent", category: "laundry_sheets", weekly_units: 18400, trend: 0.03, sub_pct: 0.72, us_pct: 0.81 },
  { base_product: "Laundry Sheets - Fragrance Free", category: "laundry_sheets", weekly_units: 12100, trend: 0.02, sub_pct: 0.68, us_pct: 0.85 },
  { base_product: "Laundry Sheets - Crisp Linen", category: "laundry_sheets", weekly_units: 3200, trend: 0.05, sub_pct: 0.65, us_pct: 0.78 },
  { base_product: "Power Pebbles", category: "power_pebbles", weekly_units: 4800, trend: 0.08, sub_pct: 0.55, us_pct: 0.88 },
  { base_product: "Dryer Sheets", category: "dryer_sheets", weekly_units: 2100, trend: -0.01, sub_pct: 0.45, us_pct: 0.82 },
  { base_product: "Dishwasher Sheets", category: "dishwasher_sheets", weekly_units: 1600, trend: 0.12, sub_pct: 0.50, us_pct: 0.90 },
  { base_product: "Stain Remover", category: "stain_remover", weekly_units: 900, trend: 0.04, sub_pct: 0.30, us_pct: 0.92 },
  { base_product: "Laundry Sheets - River Rain", category: "laundry_sheets", weekly_units: 2800, trend: 0.06, sub_pct: 0.60, us_pct: 0.75 },
];

const MOCK_INVENTORY = [
  { base_product: "Laundry Sheets - Fresh Scent", warehouse: "Oregon", on_hand: 142000, incoming: 80000, arrival: "2026-04-28", lead_time: 45, weekly_demand: 14900 },
  { base_product: "Laundry Sheets - Fresh Scent", warehouse: "UK", on_hand: 28000, incoming: 0, arrival: null, lead_time: 60, weekly_demand: 3500 },
  { base_product: "Laundry Sheets - Fragrance Free", warehouse: "Oregon", on_hand: 98000, incoming: 60000, arrival: "2026-04-21", lead_time: 45, weekly_demand: 10285 },
  { base_product: "Laundry Sheets - Fragrance Free", warehouse: "UK", on_hand: 16000, incoming: 0, arrival: null, lead_time: 60, weekly_demand: 1815 },
  { base_product: "Laundry Sheets - Crisp Linen", warehouse: "Oregon", on_hand: 22000, incoming: 15000, arrival: "2026-05-05", lead_time: 45, weekly_demand: 2496 },
  { base_product: "Power Pebbles", warehouse: "Oregon", on_hand: 35000, incoming: 20000, arrival: "2026-04-14", lead_time: 30, weekly_demand: 4224 },
  { base_product: "Dryer Sheets", warehouse: "Oregon", on_hand: 18000, incoming: 0, arrival: null, lead_time: 30, weekly_demand: 1722 },
  { base_product: "Dishwasher Sheets", warehouse: "Oregon", on_hand: 8000, incoming: 10000, arrival: "2026-04-18", lead_time: 35, weekly_demand: 1440 },
  { base_product: "Stain Remover", warehouse: "Oregon", on_hand: 6500, incoming: 0, arrival: null, lead_time: 25, weekly_demand: 828 },
  { base_product: "Laundry Sheets - River Rain", warehouse: "Oregon", on_hand: 19000, incoming: 12000, arrival: "2026-05-01", lead_time: 45, weekly_demand: 2100 },
];

const MOCK_COHORTS = [
  { month: "2025-07", size: 8200, m0: 8200, m1: 6970, m2: 6396, m3: 5949, m6: 4838, m9: 4264, m12: 3854 },
  { month: "2025-10", size: 9400, m0: 9400, m1: 8084, m2: 7426, m3: 6862, m6: 5358, m9: null, m12: null },
  { month: "2026-01", size: 10800, m0: 10800, m1: 9396, m2: 8640, m3: 7992, m6: null, m9: null, m12: null },
  { month: "2026-04", size: 11500, m0: 11500, m1: null, m2: null, m3: null, m6: null, m9: null, m12: null },
];

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KPI({ label, value, sub, color, icon }) {
  return (
    <div style={{ padding: "16px 18px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
        {icon && <span style={{ fontSize: 14 }}>{icon}</span>}
        <span style={{ fontSize: 10, fontWeight: 600, color: T.text3, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: color || T.text, letterSpacing: "-0.5px" }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ─── Mini Bar Chart ───────────────────────────────────────────────────────────
function MiniBar({ data, maxH = 40, barW = 6, gap = 2, color = T.accent }) {
  const max = Math.max(...data, 1);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap, height: maxH }}>
      {data.map((v, i) => (
        <div key={i} style={{ width: barW, height: Math.max(2, (v / max) * maxH), background: color, borderRadius: 2, opacity: i >= data.length - 4 ? 1 : 0.4 }} />
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUPPLY CHAIN VIEW — Inventory planning, PO recommendations, stockout risk
// ═══════════════════════════════════════════════════════════════════════════════
function SupplyChainView({ isMobile, orgId }) {
  const [weeklySales, setWeeklySales] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [offers, setOffers] = useState([]);
  const [skuMaster, setSkuMaster] = useState([]);
  const [skuOverrides, setSkuOverrides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subTab, setSubTab] = useState("overview");
  const [rangeWeeks, setRangeWeeks] = useState(4); // 1=latest week, 4=last 4 weeks, 12, 26, 52, 0=custom
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [showOverrideManager, setShowOverrideManager] = useState(false);

  const reloadOverrides = useCallback(async () => {
    const r = await supabase.from("dp_sku_overrides").select("*").eq("org_id", orgId).limit(2000);
    setSkuOverrides(r.data || []);
  }, [orgId]);

  useEffect(() => {
    (async () => {
      setLoading(true);

      // Supabase PostgREST has a server-side max-rows cap (default 1000) that overrides
      // .limit(). To get all daily rows, paginate using .range() until we get fewer than
      // pageSize rows back.
      async function fetchAllDaily() {
        const pageSize = 1000;
        const all = [];
        for (let page = 0; page < 50; page++) { // hard cap at 50K rows
          const from = page * pageSize;
          const to = from + pageSize - 1;
          const { data, error } = await supabase
            .from("dp_daily_sales")
            .select("*")
            .eq("org_id", orgId)
            .order("sale_date", { ascending: false })
            .range(from, to);
          if (error) {
            console.error("[DP] dp_daily_sales fetch error:", error.message);
            break;
          }
          if (!data || data.length === 0) break;
          all.push(...data);
          if (data.length < pageSize) break;
        }
        return all;
      }

      const [dailyData, invR, offR, skuR, ovR] = await Promise.all([
        fetchAllDaily(),
        supabase.from("dp_inventory").select("*").eq("org_id", orgId).limit(3000),
        supabase.from("dp_offer_performance").select("*").eq("org_id", orgId).limit(100),
        supabase.from("dp_sku_master").select("*").eq("org_id", orgId).limit(1000),
        supabase.from("dp_sku_overrides").select("*").eq("org_id", orgId).limit(2000),
      ]);
      let salesData = dailyData;
      if (salesData.length === 0) {
        // Migration fallback: read from legacy weekly table
        const wsR = await supabase.from("dp_weekly_sales").select("*").eq("org_id", orgId).order("week_start", { ascending: false }).limit(5000);
        salesData = (wsR.data || []).map(r => ({ ...r, sale_date: r.week_start }));
      } else {
        // Add week_start derived from sale_date so existing weekly-aggregation code still works
        salesData = salesData.map(r => {
          const d = new Date(r.sale_date);
          // Find Monday of the week (ISO week start)
          const day = d.getUTCDay() || 7;
          if (day !== 1) d.setUTCDate(d.getUTCDate() - (day - 1));
          return { ...r, week_start: d.toISOString().split("T")[0] };
        });
      }
      console.log(`[DP] Loaded ${salesData.length} daily sales rows, ${new Set(salesData.map(r => r.week_start)).size} distinct weeks`);
      setWeeklySales(salesData);
      setInventory(invR.data || []);
      setOffers(offR.data || []);
      setSkuMaster(skuR.data || []);
      setSkuOverrides(ovR.data || []);
      setLoading(false);
    })();
  }, [orgId]);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: T.text3 }}>Loading demand data...</div>;
  if (weeklySales.length === 0 && inventory.length === 0) {
    return (
      <div style={{ padding: 60, textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>No Demand Data Yet</div>
        <div style={{ fontSize: 12, color: T.text3, marginTop: 6, maxWidth: 400, margin: "6px auto 0", lineHeight: 1.6 }}>Click "📊 Sync from Metabase" above to pull in Weekly Sales, Inventory, and SKU data.</div>
      </div>
    );
  }

  const getRisk = (wos) => wos < 3 ? "critical" : wos < 5 ? "red" : wos < 8 ? "yellow" : "green";
  const getRiskLabel = (wos) => wos < 3 ? "CRITICAL" : wos < 5 ? "LOW" : wos < 8 ? "WATCH" : "OK";

  // Build SKU lookup from master + overrides (override fields win when present)
  const overrideMap = {};
  skuOverrides.forEach(o => { overrideMap[o.sku] = o; });
  const skuMap = {};
  skuMaster.forEach(s => {
    const ov = overrideMap[s.sku];
    skuMap[s.sku] = ov ? {
      ...s,
      base_product: ov.base_product ?? s.base_product,
      product_title: ov.product_title ?? s.product_title,
      variant_title: ov.variant_title ?? s.variant_title,
      product_category: ov.product_category ?? s.product_category,
      units_per_sku: ov.units_per_sku ?? s.units_per_sku,
      _has_override: true,
    } : s;
  });
  // Overrides for SKUs not in master (orphans like FREESHIPPING) — still surface them
  skuOverrides.forEach(o => {
    if (!skuMap[o.sku]) {
      skuMap[o.sku] = {
        sku: o.sku,
        base_product: o.base_product,
        product_title: o.product_title,
        variant_title: o.variant_title,
        product_category: o.product_category,
        units_per_sku: o.units_per_sku,
        _has_override: true,
        _orphan: true,
      };
    }
  });

  // Aggregate weekly sales by SKU
  const weeks = [...new Set(weeklySales.map(r => r.week_start))].sort().reverse();
  const latestWeek = weeks[0];

  // Compute the active date range based on user selection
  let rangeFrom = null;
  let rangeTo = null;
  let rangeLabel = "";
  if (rangeWeeks === 0 && customFrom && customTo) {
    rangeFrom = customFrom;
    rangeTo = customTo;
    rangeLabel = `${customFrom} → ${customTo}`;
  } else if (rangeWeeks === 1) {
    rangeFrom = latestWeek;
    rangeTo = latestWeek;
    rangeLabel = `Week of ${latestWeek}`;
  } else if (rangeWeeks > 1 && weeks.length > 0) {
    const sortedAsc = [...weeks].sort();
    const startIdx = Math.max(0, sortedAsc.length - rangeWeeks);
    rangeFrom = sortedAsc[startIdx];
    rangeTo = sortedAsc[sortedAsc.length - 1];
    rangeLabel = `Last ${rangeWeeks} weeks (${rangeFrom} → ${rangeTo})`;
  } else {
    rangeFrom = latestWeek;
    rangeTo = latestWeek;
    rangeLabel = latestWeek ? `Week of ${latestWeek}` : "No data";
  }

  const rangeSales = weeklySales.filter(r => {
    if (!rangeFrom || !rangeTo) return false;
    return r.week_start >= rangeFrom && r.week_start <= rangeTo;
  });
  const weeksInRange = new Set(rangeSales.map(r => r.week_start)).size || 1;
  const isMultiWeek = weeksInRange > 1;

  // Aliased for backward compatibility with downstream code that expects "latestSales"
  const latestSales = rangeSales;
  const totalUnits = latestSales.reduce((s, r) => s + (r.units_sold || 0), 0);
  const totalRevenue = latestSales.reduce((s, r) => s + Number(r.gross_revenue || 0), 0);
  const totalOrders = latestSales.reduce((s, r) => s + (r.orders_count || 0), 0);
  const subUnits = latestSales.filter(r => r.is_subscription).reduce((s, r) => s + (r.units_sold || 0), 0);
  const subPct = totalUnits > 0 ? subUnits / totalUnits : 0;

  // Group by base_product (from SKU master) to combine multi-packs
  const byBaseProduct = {};
  latestSales.forEach(r => {
    const master = skuMap[r.sku];
    const baseKey = master?.base_product || r.product_title || r.sku || "Unknown";
    const category = master?.product_category || "other";
    if (!byBaseProduct[baseKey]) byBaseProduct[baseKey] = { baseProduct: baseKey, category, skus: new Set(), units: 0, revenue: 0, orders: 0, subUnits: 0, variants: [] };
    byBaseProduct[baseKey].skus.add(r.sku);
    byBaseProduct[baseKey].units += r.units_sold || 0;
    byBaseProduct[baseKey].revenue += Number(r.gross_revenue || 0);
    byBaseProduct[baseKey].orders += r.orders_count || 0;
    if (r.is_subscription) byBaseProduct[baseKey].subUnits += r.units_sold || 0;
  });
  const topBaseProducts = Object.values(byBaseProduct).sort((a, b) => b.units - a.units);

  // Top products by individual SKU (for detail view)
  const byProduct = {};
  latestSales.forEach(r => {
    const key = r.sku || r.product_title || "Unknown";
    if (!byProduct[key]) byProduct[key] = { sku: r.sku, name: r.product_title || r.sku, units: 0, revenue: 0, orders: 0, subUnits: 0 };
    byProduct[key].units += r.units_sold || 0;
    byProduct[key].revenue += Number(r.gross_revenue || 0);
    byProduct[key].orders += r.orders_count || 0;
    if (r.is_subscription) byProduct[key].subUnits += r.units_sold || 0;
  });
  const topProducts = Object.values(byProduct).sort((a, b) => b.units - a.units);

  // By channel
  const byChannel = {};
  latestSales.forEach(r => {
    const ch = r.channel || "Unknown";
    if (!byChannel[ch]) byChannel[ch] = { channel: ch, units: 0, revenue: 0, orders: 0 };
    byChannel[ch].units += r.units_sold || 0;
    byChannel[ch].revenue += Number(r.gross_revenue || 0);
    byChannel[ch].orders += r.orders_count || 0;
  });
  const channels = Object.values(byChannel).sort((a, b) => b.units - a.units);

  // By country
  const byCountry = {};
  latestSales.forEach(r => {
    const co = r.country || "Unknown";
    if (!byCountry[co]) byCountry[co] = { country: co, units: 0, revenue: 0 };
    byCountry[co].units += r.units_sold || 0;
    byCountry[co].revenue += Number(r.gross_revenue || 0);
  });
  const countries = Object.values(byCountry).sort((a, b) => b.units - a.units);

  // Inventory aggregated by SKU
  const invBySku = {};
  inventory.forEach(r => {
    const key = r.sku || "Unknown";
    if (!invBySku[key]) invBySku[key] = { sku: key, warehouse: r.warehouse_location || "—", on_hand: 0, reserved: 0, incoming: 0, arrival: r.expected_arrival_date, lead_time: r.lead_time_days || 0 };
    invBySku[key].on_hand += r.quantity_on_hand || 0;
    invBySku[key].reserved += r.quantity_reserved || 0;
    invBySku[key].incoming += r.quantity_incoming || 0;
  });
  // Match inventory to weekly demand
  const invItems = Object.values(invBySku).map(inv => {
    const salesMatch = byProduct[inv.sku];
    const weeklyDemand = salesMatch ? salesMatch.units : 0;
    const wos = weeklyDemand > 0 ? inv.on_hand / weeklyDemand : inv.on_hand > 0 ? 99 : 0;
    return { ...inv, weeklyDemand, wos, name: salesMatch?.name || inv.sku };
  }).sort((a, b) => a.wos - b.wos);

  const totalOnHand = invItems.reduce((s, i) => s + i.on_hand, 0);
  const totalIncoming = invItems.reduce((s, i) => s + i.incoming, 0);
  const totalWeeklyDemand = invItems.reduce((s, i) => s + i.weeklyDemand, 0);
  const avgWos = totalWeeklyDemand > 0 ? totalOnHand / totalWeeklyDemand : 0;
  const criticalCount = invItems.filter(i => i.wos < 4 && i.weeklyDemand > 0).length;

  const SUB_TABS = [
    { id: "overview", label: "Overview", icon: "📊" },
    { id: "products", label: "By Product", icon: "📦" },
    { id: "inventory", label: "Inventory", icon: "🏭" },
    { id: "warehouses", label: "By Location", icon: "📍" },
    { id: "channels", label: "By Channel", icon: "📡" },
  ];

  return (
    <div>
      {/* Sub-tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
        {SUB_TABS.map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            style={{ padding: "6px 14px", fontSize: 11, fontWeight: subTab === t.id ? 700 : 500, borderRadius: 6, border: `1px solid ${subTab === t.id ? T.accent + "40" : T.border}`, background: subTab === t.id ? T.accentDim : "transparent", color: subTab === t.id ? T.accent : T.text3, cursor: "pointer" }}>
            {t.icon} {t.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, color: T.text3 }}>Range:</span>
          {[
            { v: 1, l: "1w" },
            { v: 4, l: "4w" },
            { v: 12, l: "12w" },
            { v: 26, l: "26w" },
            { v: 52, l: "52w" },
            { v: 0, l: "Custom" },
          ].map(opt => (
            <button key={opt.v} onClick={() => setRangeWeeks(opt.v)}
              style={{ padding: "4px 8px", fontSize: 10, fontWeight: 600, border: rangeWeeks === opt.v ? `1px solid ${T.accent}` : `1px solid ${T.border}`, background: rangeWeeks === opt.v ? T.accent : "transparent", color: rangeWeeks === opt.v ? "white" : T.text2, borderRadius: 4, cursor: "pointer" }}>
              {opt.l}
            </button>
          ))}
          {rangeWeeks === 0 && (
            <>
              <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{ fontSize: 10, padding: "3px 6px", border: `1px solid ${T.border}`, borderRadius: 4, background: T.cardBg, color: T.text }} />
              <span style={{ fontSize: 10, color: T.text3 }}>→</span>
              <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{ fontSize: 10, padding: "3px 6px", border: `1px solid ${T.border}`, borderRadius: 4, background: T.cardBg, color: T.text }} />
            </>
          )}
          <span style={{ fontSize: 10, color: T.text3, marginLeft: 4 }}>· {fmt(rangeSales.length)} records · {weeksInRange} {weeksInRange === 1 ? "week" : "weeks"}</span>
          <button onClick={() => setShowOverrideManager(true)}
            style={{ padding: "4px 10px", fontSize: 10, fontWeight: 600, border: `1px solid ${T.border}`, background: skuOverrides.length > 0 ? "#f59e0b" : "transparent", color: skuOverrides.length > 0 ? "white" : T.text2, borderRadius: 4, cursor: "pointer", marginLeft: 8 }}>
            🛠 SKU Mappings{skuOverrides.length > 0 ? ` (${skuOverrides.length})` : ""}
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(5, 1fr)", gap: 10, marginBottom: 20 }}>
        <KPI label={isMultiWeek ? "Total Units" : "Weekly Units"} value={fmt(totalUnits)} sub={isMultiWeek ? `${fmt(Math.round(totalUnits / weeksInRange))}/wk · ${rangeLabel}` : `week of ${latestWeek}`} icon="📦" />
        <KPI label={isMultiWeek ? "Total Revenue" : "Weekly Revenue"} value={fmtD(totalRevenue)} sub={isMultiWeek ? `${fmtD(Math.round(totalRevenue / weeksInRange))}/wk · ${fmt(totalOrders)} orders` : `${fmt(totalOrders)} orders`} icon="💰" color="#22c55e" />
        <KPI label="Sub Mix" value={`${(subPct * 100).toFixed(0)}%`} sub={`${fmt(subUnits)} sub units`} icon="🔄" color={T.accent} />
        <KPI label="Avg WoS" value={avgWos > 0 ? avgWos.toFixed(1) : "—"} sub={inventory.length > 0 ? `${fmt(totalOnHand)} on hand` : "No inventory data"} icon="⏱" color={avgWos > 0 && avgWos < 6 ? "#f59e0b" : "#22c55e"} />
        <KPI label="At Risk" value={criticalCount} sub="SKUs < 4 weeks" icon="⚠️" color={criticalCount > 0 ? "#ef4444" : "#22c55e"} />
      </div>

      {/* OVERVIEW TAB */}
      {subTab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
          {/* Top Base Products (grouped multi-packs) */}
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 12 }}>Top Products by Units {skuMaster.length > 0 ? "(grouped by base product)" : ""}</div>
            {topBaseProducts.slice(0, 10).map((p, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderBottom: i < 9 ? `1px solid ${T.border}08` : "none" }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: T.text3, width: 20, textAlign: "right" }}>#{i + 1}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.baseProduct}</div>
                  <div style={{ fontSize: 9, color: T.text3 }}>{p.skus.size} SKU{p.skus.size !== 1 ? "s" : ""} · {p.category}</div>
                </div>
                <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{fmt(p.units)}</span>
                <span style={{ fontSize: 10, color: "#22c55e" }}>{fmtD(p.revenue)}</span>
              </div>
            ))}
          </div>

          {/* Channel + Country breakdown */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 12 }}>By Channel</div>
              {channels.map((ch, i) => {
                const pct = totalUnits > 0 ? ch.units / totalUnits : 0;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: T.text, width: 80 }}>{ch.channel}</span>
                    <div style={{ flex: 1, height: 8, borderRadius: 4, background: T.surface2, overflow: "hidden" }}>
                      <div style={{ width: `${pct * 100}%`, height: "100%", background: T.accent, borderRadius: 4 }} />
                    </div>
                    <span style={{ fontSize: 10, color: T.text2, minWidth: 50, textAlign: "right" }}>{fmt(ch.units)}</span>
                    <span style={{ fontSize: 9, color: T.text3, minWidth: 35, textAlign: "right" }}>{(pct * 100).toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 12 }}>By Country</div>
              {countries.map((co, i) => {
                const pct = totalUnits > 0 ? co.units / totalUnits : 0;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0" }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: T.text, width: 40 }}>{co.country}</span>
                    <div style={{ flex: 1, height: 8, borderRadius: 4, background: T.surface2, overflow: "hidden" }}>
                      <div style={{ width: `${pct * 100}%`, height: "100%", background: "#22c55e", borderRadius: 4 }} />
                    </div>
                    <span style={{ fontSize: 10, color: T.text2, minWidth: 50, textAlign: "right" }}>{fmt(co.units)}</span>
                    <span style={{ fontSize: 9, color: T.text3, minWidth: 35, textAlign: "right" }}>{(pct * 100).toFixed(0)}%</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* PRODUCTS TAB */}
      {subTab === "products" && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "12px 18px", borderBottom: `1px solid ${T.border}`, fontSize: 13, fontWeight: 700, color: T.text }}>
            Demand by Base Product — {rangeLabel} ({topBaseProducts.length} products, {topProducts.length} SKUs)
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead><tr>
                {["#", "Base Product", "Category", "SKUs", "Units", "Revenue", "Orders", "Sub %", "Share"].map(h => (
                  <th key={h} style={{ textAlign: h === "#" ? "center" : "left", padding: "8px 10px", borderBottom: `2px solid ${T.border}`, color: T.text3, fontWeight: 700, whiteSpace: "nowrap", position: "sticky", top: 0, background: T.surface }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>{topBaseProducts.map((p, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : T.surface2 + "30" }}>
                  <td style={{ padding: "6px 10px", color: T.text3, textAlign: "center", fontWeight: 700 }}>{i + 1}</td>
                  <td style={{ padding: "6px 10px", color: T.text, fontWeight: 600, maxWidth: 300, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.baseProduct}</td>
                  <td style={{ padding: "6px 10px", color: T.text3, fontSize: 10, textTransform: "capitalize" }}>{p.category?.replace("_", " ")}</td>
                  <td style={{ padding: "6px 10px", color: T.accent, fontWeight: 600 }}>{p.skus.size}</td>
                  <td style={{ padding: "6px 10px", color: T.text, fontWeight: 700 }}>{fmt(p.units)}</td>
                  <td style={{ padding: "6px 10px", color: "#22c55e" }}>{fmtD(p.revenue)}</td>
                  <td style={{ padding: "6px 10px", color: T.text2 }}>{fmt(p.orders)}</td>
                  <td style={{ padding: "6px 10px", color: T.accent }}>{p.units > 0 ? `${(p.subUnits / p.units * 100).toFixed(0)}%` : "—"}</td>
                  <td style={{ padding: "6px 10px", color: T.text3 }}>{totalUnits > 0 ? `${(p.units / totalUnits * 100).toFixed(1)}%` : "—"}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {/* SKU detail below */}
          {skuMaster.length > 0 && (
            <div style={{ borderTop: `2px solid ${T.border}`, padding: "12px 18px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 8 }}>SKU Master ({skuMaster.length} SKUs)</div>
              <div style={{ overflowX: "auto", maxHeight: 400 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                  <thead><tr>
                    {["SKU", "Product", "Variant", "Pack Size", "GWP", "Sub", "OTP", "Price", "COGS", "Status", "Category"].map(h => (
                      <th key={h} style={{ textAlign: "left", padding: "5px 8px", borderBottom: `2px solid ${T.border}`, color: T.text3, fontWeight: 700, whiteSpace: "nowrap", position: "sticky", top: 0, background: T.surface }}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>{skuMaster.sort((a, b) => (a.base_product || "").localeCompare(b.base_product || "")).map((s, i) => (
                    <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : T.surface2 + "20", opacity: s.status === "discontinued" ? 0.5 : 1 }}>
                      <td style={{ padding: "4px 8px", fontFamily: "monospace", fontSize: 9 }}>{s.sku}</td>
                      <td style={{ padding: "4px 8px", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.product_title}</td>
                      <td style={{ padding: "4px 8px", color: T.text3 }}>{s.variant_title}</td>
                      <td style={{ padding: "4px 8px", fontWeight: 700, textAlign: "center" }}>{s.units_per_sku || 1}×</td>
                      <td style={{ padding: "4px 8px", textAlign: "center" }}>{s.is_gwp ? "🎁" : ""}</td>
                      <td style={{ padding: "4px 8px", textAlign: "center" }}>{s.is_subscription ? "🔄" : ""}</td>
                      <td style={{ padding: "4px 8px", textAlign: "center" }}>{s.is_one_time ? "1️⃣" : ""}</td>
                      <td style={{ padding: "4px 8px", color: "#22c55e" }}>{s.current_price ? `$${Number(s.current_price).toFixed(0)}` : "—"}</td>
                      <td style={{ padding: "4px 8px", color: T.text3 }}>{s.cogs_per_unit ? `$${Number(s.cogs_per_unit).toFixed(2)}` : "—"}</td>
                      <td style={{ padding: "4px 8px" }}><span style={{ fontSize: 8, fontWeight: 700, padding: "1px 4px", borderRadius: 3, background: s.status === "active" ? "#22c55e15" : "#ef444415", color: s.status === "active" ? "#22c55e" : "#ef4444" }}>{s.status}</span></td>
                      <td style={{ padding: "4px 8px", fontSize: 9, color: T.text3, textTransform: "capitalize" }}>{s.product_category?.replace("_", " ")}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* INVENTORY TAB */}
      {subTab === "inventory" && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "12px 18px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Inventory Health — Sorted by Weeks of Supply</div>
            <span style={{ fontSize: 10, color: T.text3 }}>{inventory.length} inventory records</span>
          </div>
          <div style={{ overflowX: "auto", maxHeight: 500 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead><tr>
                {["SKU", "Product", "On Hand", "Reserved", "Incoming", "Weekly Demand", "WoS", "Status"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "8px 10px", borderBottom: `2px solid ${T.border}`, color: T.text3, fontWeight: 700, whiteSpace: "nowrap", position: "sticky", top: 0, background: T.surface }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>{invItems.filter(i => i.on_hand > 0 || i.weeklyDemand > 0).map((inv, i) => {
                const risk = getRisk(inv.wos);
                return (
                  <tr key={i} style={{ background: risk === "critical" ? "#ef444408" : risk === "red" ? "#f9731608" : i % 2 === 0 ? "transparent" : T.surface2 + "30" }}>
                    <td style={{ padding: "6px 10px", fontFamily: "monospace", fontSize: 10, color: T.text }}>{inv.sku}</td>
                    <td style={{ padding: "6px 10px", color: T.text, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inv.name}</td>
                    <td style={{ padding: "6px 10px", fontWeight: 700, color: T.text }}>{fmt(inv.on_hand)}</td>
                    <td style={{ padding: "6px 10px", color: T.text3 }}>{fmt(inv.reserved)}</td>
                    <td style={{ padding: "6px 10px", color: inv.incoming > 0 ? T.accent : T.text3 }}>{fmt(inv.incoming)}</td>
                    <td style={{ padding: "6px 10px", color: T.text2 }}>{fmt(inv.weeklyDemand)}/wk</td>
                    <td style={{ padding: "6px 10px", fontWeight: 700, color: RISK_COLORS[risk] }}>{inv.wos < 99 ? inv.wos.toFixed(1) : "99+"}</td>
                    <td style={{ padding: "6px 10px" }}><span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 3, background: RISK_COLORS[risk] + "15", color: RISK_COLORS[risk] }}>{getRiskLabel(inv.wos)}</span></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        </div>
      )}

      {/* WAREHOUSES TAB — Inventory by Location */}
      {subTab === "warehouses" && (() => {
        const byWh = {};
        inventory.forEach(r => {
          const wh = r.warehouse_location || "Unknown";
          if (!byWh[wh]) byWh[wh] = { warehouse: wh, skus: new Set(), on_hand: 0, reserved: 0, incoming: 0, items: [] };
          byWh[wh].skus.add(r.sku);
          byWh[wh].on_hand += r.quantity_on_hand || 0;
          byWh[wh].reserved += r.quantity_reserved || 0;
          byWh[wh].incoming += r.quantity_incoming || 0;
          byWh[wh].items.push(r);
        });
        const warehouses = Object.values(byWh).sort((a, b) => b.on_hand - a.on_hand);
        const grandTotal = warehouses.reduce((s, w) => s + w.on_hand, 0);
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {/* Summary strip */}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : `repeat(${Math.min(warehouses.length, 4)}, 1fr)`, gap: 8 }}>
              {warehouses.slice(0, 4).map(w => (
                <div key={w.warehouse} style={{ padding: 12, borderRadius: 10, border: `1px solid ${T.border}`, background: T.surface, textAlign: "center" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, marginBottom: 4 }}>{w.warehouse}</div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>{fmt(w.on_hand)}</div>
                  <div style={{ fontSize: 9, color: T.text3 }}>{w.skus.size} SKUs · {grandTotal > 0 ? (w.on_hand / grandTotal * 100).toFixed(0) : 0}%</div>
                  {w.incoming > 0 && <div style={{ fontSize: 9, color: T.accent, marginTop: 2 }}>+{fmt(w.incoming)} incoming</div>}
                </div>
              ))}
            </div>
            {/* Per-warehouse detail */}
            {warehouses.map(w => (
              <div key={w.warehouse} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>📍 {w.warehouse}</div>
                    <div style={{ fontSize: 11, color: T.text3 }}>{w.skus.size} SKUs · {fmt(w.on_hand)} on hand · {fmt(w.reserved)} reserved · {fmt(w.incoming)} incoming</div>
                  </div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.accent }}>{grandTotal > 0 ? (w.on_hand / grandTotal * 100).toFixed(1) : 0}% of total</div>
                </div>
                <div style={{ overflowX: "auto", maxHeight: 300 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                    <thead><tr>
                      {["SKU", "Product", "On Hand", "Reserved", "Available", "Incoming", "Lead Time"].map(h => (
                        <th key={h} style={{ textAlign: "left", padding: "6px 10px", borderBottom: `2px solid ${T.border}`, color: T.text3, fontWeight: 700, whiteSpace: "nowrap", position: "sticky", top: 0, background: T.surface }}>{h}</th>
                      ))}
                    </tr></thead>
                    <tbody>{w.items.sort((a, b) => (b.quantity_on_hand || 0) - (a.quantity_on_hand || 0)).slice(0, 20).map((r, ri) => {
                      const master = skuMap[r.sku];
                      const available = (r.quantity_on_hand || 0) - (r.quantity_reserved || 0);
                      return (
                        <tr key={ri} style={{ background: ri % 2 === 0 ? "transparent" : T.surface2 + "30" }}>
                          <td style={{ padding: "5px 10px", fontFamily: "monospace", fontSize: 10, color: T.text }}>{r.sku}</td>
                          <td style={{ padding: "5px 10px", color: T.text, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{master?.product_title || r.sku}</td>
                          <td style={{ padding: "5px 10px", fontWeight: 700, color: T.text }}>{fmt(r.quantity_on_hand)}</td>
                          <td style={{ padding: "5px 10px", color: T.text3 }}>{fmt(r.quantity_reserved)}</td>
                          <td style={{ padding: "5px 10px", color: available > 0 ? "#22c55e" : "#ef4444", fontWeight: 600 }}>{fmt(available)}</td>
                          <td style={{ padding: "5px 10px", color: r.quantity_incoming > 0 ? T.accent : T.text3 }}>{r.quantity_incoming > 0 ? `+${fmt(r.quantity_incoming)}` : "—"}</td>
                          <td style={{ padding: "5px 10px", color: T.text3 }}>{r.lead_time_days ? `${r.lead_time_days}d` : "—"}</td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        );
      })()}

      {/* CHANNELS TAB */}
      {subTab === "channels" && (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
          {channels.map((ch, ci) => (
            <div key={ci} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{ch.channel}</div>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#22c55e" }}>{fmtD(ch.revenue)}</div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
                <div><div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>{fmt(ch.units)}</div><div style={{ fontSize: 9, color: T.text3 }}>units</div></div>
                <div><div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>{fmt(ch.orders)}</div><div style={{ fontSize: 9, color: T.text3 }}>orders</div></div>
                <div><div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>{totalUnits > 0 ? `${(ch.units / totalUnits * 100).toFixed(0)}%` : "—"}</div><div style={{ fontSize: 9, color: T.text3 }}>share</div></div>
              </div>
              {/* Top SKUs for this channel */}
              <div style={{ fontSize: 10, fontWeight: 600, color: T.text3, marginBottom: 4 }}>Top SKUs</div>
              {latestSales.filter(r => r.channel === ch.channel).sort((a, b) => (b.units_sold || 0) - (a.units_sold || 0)).slice(0, 5).map((r, ri) => (
                <div key={ri} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 10, color: T.text2 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{r.product_title || r.sku}</span>
                  <span style={{ fontWeight: 700, color: T.text, marginLeft: 8 }}>{fmt(r.units_sold)}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* Offer Performance */}
      {offers.length > 0 && subTab === "overview" && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 16, marginTop: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 12 }}>🎯 Offer Performance</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead><tr>
                {["Offer", "Month", "Shown", "Accepted", "Take Rate", "Revenue Impact"].map(h => (
                  <th key={h} style={{ textAlign: "left", padding: "6px 10px", borderBottom: `2px solid ${T.border}`, color: T.text3, fontWeight: 700 }}>{h}</th>
                ))}
              </tr></thead>
              <tbody>{offers.map((o, i) => (
                <tr key={i}>
                  <td style={{ padding: "5px 10px", fontWeight: 600, color: T.text }}>{o.offer_name}</td>
                  <td style={{ padding: "5px 10px", color: T.text3 }}>{o.month}</td>
                  <td style={{ padding: "5px 10px", color: T.text2 }}>{fmt(o.times_shown)}</td>
                  <td style={{ padding: "5px 10px", color: T.text2 }}>{fmt(o.times_accepted)}</td>
                  <td style={{ padding: "5px 10px", fontWeight: 700, color: T.accent }}>{o.take_rate ? `${(Number(o.take_rate) * 100).toFixed(1)}%` : "—"}</td>
                  <td style={{ padding: "5px 10px", color: "#22c55e" }}>{fmtD(o.revenue_impact)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}

      {showOverrideManager && (
        <SkuOverrideManager
          orgId={orgId}
          weeklySales={weeklySales}
          skuMaster={skuMaster}
          overrides={skuOverrides}
          onClose={() => setShowOverrideManager(false)}
          onSaved={reloadOverrides}
        />
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SKU OVERRIDE MANAGER — Override base_product / variant / category for SKUs
// when the upstream Metabase data is wrong or incomplete
// ═══════════════════════════════════════════════════════════════════════════════
function SkuOverrideManager({ orgId, weeklySales, skuMaster, overrides, onClose, onSaved }) {
  const [filter, setFilter] = useState("issues"); // all | issues | overridden | unmapped
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null); // sku currently being edited
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  // Build per-SKU summary from weekly sales
  const skuSummary = (() => {
    const map = {};
    weeklySales.forEach(r => {
      if (!r.sku) return;
      if (!map[r.sku]) {
        map[r.sku] = {
          sku: r.sku,
          titles: new Set(),
          variants: new Set(),
          base_products: new Set(),
          units: 0,
          revenue: 0,
        };
      }
      if (r.product_title) map[r.sku].titles.add(r.product_title);
      if (r.variant_title) map[r.sku].variants.add(r.variant_title);
      if (r.base_product) map[r.sku].base_products.add(r.base_product);
      map[r.sku].units += r.units_sold || 0;
      map[r.sku].revenue += Number(r.net_revenue || 0);
    });
    return Object.values(map);
  })();

  const masterMap = {};
  skuMaster.forEach(s => { masterMap[s.sku] = s; });
  const overrideMap = {};
  overrides.forEach(o => { overrideMap[o.sku] = o; });

  // Compute issue type for each SKU
  const enriched = skuSummary.map(s => {
    const master = masterMap[s.sku];
    const ov = overrideMap[s.sku];
    const titles = [...s.titles];
    const variants = [...s.variants];
    const baseProducts = [...s.base_products];
    let issue = null;
    if (!master && !ov) issue = "unmapped";
    else if (titles.length > 1 || baseProducts.length > 1) issue = "multi_title";
    else if (variants.length > 0 && baseProducts.length === 1 && !baseProducts[0].includes(variants[0]?.split(" / ")[0] || "_NEVER_MATCH_")) issue = "missing_variant";
    return {
      ...s,
      titles,
      variants,
      baseProducts,
      master,
      override: ov,
      issue,
      effectiveBaseProduct: ov?.base_product ?? master?.base_product ?? baseProducts[0] ?? titles[0] ?? s.sku,
    };
  });

  // Filter
  let filtered = enriched;
  if (filter === "issues") filtered = filtered.filter(e => e.issue);
  if (filter === "overridden") filtered = filtered.filter(e => e.override);
  if (filter === "unmapped") filtered = filtered.filter(e => e.issue === "unmapped");
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(e => e.sku.toLowerCase().includes(q) || e.titles.join(" ").toLowerCase().includes(q) || e.effectiveBaseProduct.toLowerCase().includes(q));
  }
  filtered.sort((a, b) => b.units - a.units);

  const startEdit = (s) => {
    setEditing(s.sku);
    setDraft({
      base_product: s.override?.base_product ?? s.master?.base_product ?? s.baseProducts[0] ?? "",
      product_title: s.override?.product_title ?? s.master?.product_title ?? s.titles[0] ?? "",
      variant_title: s.override?.variant_title ?? s.master?.variant_title ?? s.variants[0] ?? "",
      product_category: s.override?.product_category ?? s.master?.product_category ?? "",
      units_per_sku: s.override?.units_per_sku ?? s.master?.units_per_sku ?? 1,
      notes: s.override?.notes ?? "",
    });
  };

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    const payload = {
      org_id: orgId,
      sku: editing,
      base_product: draft.base_product || null,
      product_title: draft.product_title || null,
      variant_title: draft.variant_title || null,
      product_category: draft.product_category || null,
      units_per_sku: draft.units_per_sku ? Number(draft.units_per_sku) : null,
      notes: draft.notes || null,
    };
    const { error } = await supabase.from("dp_sku_overrides").upsert(payload, { onConflict: "org_id,sku" });
    setSaving(false);
    if (error) {
      alert("Save failed: " + error.message);
    } else {
      setSavedMsg(`Saved ${editing}`);
      setTimeout(() => setSavedMsg(""), 2000);
      setEditing(null);
      setDraft({});
      onSaved && onSaved();
    }
  };

  const deleteOverride = async (sku) => {
    if (!confirm(`Remove override for ${sku}?`)) return;
    const { error } = await supabase.from("dp_sku_overrides").delete().eq("org_id", orgId).eq("sku", sku);
    if (error) alert("Delete failed: " + error.message);
    else {
      setSavedMsg(`Removed override for ${sku}`);
      setTimeout(() => setSavedMsg(""), 2000);
      onSaved && onSaved();
    }
  };

  const issueCount = enriched.filter(e => e.issue).length;
  const overrideCount = overrides.length;
  const unmappedCount = enriched.filter(e => e.issue === "unmapped").length;

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.cardBg, borderRadius: 8, width: "100%", maxWidth: 1200, maxHeight: "90vh", display: "flex", flexDirection: "column", border: `1px solid ${T.border}` }}>
        {/* Header */}
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>🛠 SKU Mapping Overrides</div>
            <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>Manually fix base_product, variant, category, and units-per-SKU when Metabase data is wrong. Overrides take precedence over the SKU master.</div>
          </div>
          <button onClick={onClose} style={{ padding: "6px 10px", fontSize: 11, fontWeight: 600, border: `1px solid ${T.border}`, background: "transparent", color: T.text2, borderRadius: 4, cursor: "pointer" }}>✕ Close</button>
        </div>

        {/* Filter bar */}
        <div style={{ padding: "10px 18px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          {[
            { v: "issues", l: `🚩 Issues (${issueCount})` },
            { v: "unmapped", l: `❓ Unmapped (${unmappedCount})` },
            { v: "overridden", l: `✅ Overridden (${overrideCount})` },
            { v: "all", l: `All (${enriched.length})` },
          ].map(opt => (
            <button key={opt.v} onClick={() => setFilter(opt.v)}
              style={{ padding: "5px 10px", fontSize: 11, fontWeight: 600, border: filter === opt.v ? `1px solid ${T.accent}` : `1px solid ${T.border}`, background: filter === opt.v ? T.accent : "transparent", color: filter === opt.v ? "white" : T.text2, borderRadius: 4, cursor: "pointer" }}>
              {opt.l}
            </button>
          ))}
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search SKU, title, base product..."
            style={{ flex: 1, minWidth: 200, padding: "6px 10px", fontSize: 12, border: `1px solid ${T.border}`, borderRadius: 4, background: T.bg, color: T.text }} />
          {savedMsg && <span style={{ fontSize: 11, color: "#22c55e", fontWeight: 600 }}>{savedMsg}</span>}
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 18px" }}>
          {filtered.length === 0 && (
            <div style={{ padding: 40, textAlign: "center", color: T.text3, fontSize: 12 }}>
              {filter === "issues" ? "🎉 No issues found — all SKUs look mapped correctly!" : "No SKUs match this filter."}
            </div>
          )}
          {filtered.map(s => (
            <div key={s.sku} style={{ padding: "10px 0", borderBottom: `1px solid ${T.border}`, fontSize: 12 }}>
              {editing === s.sku ? (
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <code style={{ fontSize: 11, fontWeight: 700, color: T.accent }}>{s.sku}</code>
                    <span style={{ fontSize: 10, color: T.text3 }}>{fmt(s.units)} units · ${fmt(Math.round(s.revenue))}</span>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 6 }}>
                    <label style={{ fontSize: 10, color: T.text2 }}>
                      base_product
                      <input value={draft.base_product || ""} onChange={e => setDraft({ ...draft, base_product: e.target.value })}
                        style={{ width: "100%", padding: "5px 8px", fontSize: 11, border: `1px solid ${T.border}`, borderRadius: 4, background: T.bg, color: T.text, marginTop: 2 }} />
                    </label>
                    <label style={{ fontSize: 10, color: T.text2 }}>
                      product_category
                      <input value={draft.product_category || ""} onChange={e => setDraft({ ...draft, product_category: e.target.value })}
                        placeholder="e.g. laundry_sheets"
                        style={{ width: "100%", padding: "5px 8px", fontSize: 11, border: `1px solid ${T.border}`, borderRadius: 4, background: T.bg, color: T.text, marginTop: 2 }} />
                    </label>
                    <label style={{ fontSize: 10, color: T.text2 }}>
                      product_title
                      <input value={draft.product_title || ""} onChange={e => setDraft({ ...draft, product_title: e.target.value })}
                        style={{ width: "100%", padding: "5px 8px", fontSize: 11, border: `1px solid ${T.border}`, borderRadius: 4, background: T.bg, color: T.text, marginTop: 2 }} />
                    </label>
                    <label style={{ fontSize: 10, color: T.text2 }}>
                      variant_title
                      <input value={draft.variant_title || ""} onChange={e => setDraft({ ...draft, variant_title: e.target.value })}
                        style={{ width: "100%", padding: "5px 8px", fontSize: 11, border: `1px solid ${T.border}`, borderRadius: 4, background: T.bg, color: T.text, marginTop: 2 }} />
                    </label>
                    <label style={{ fontSize: 10, color: T.text2 }}>
                      units_per_sku
                      <input type="number" value={draft.units_per_sku || ""} onChange={e => setDraft({ ...draft, units_per_sku: e.target.value })}
                        style={{ width: "100%", padding: "5px 8px", fontSize: 11, border: `1px solid ${T.border}`, borderRadius: 4, background: T.bg, color: T.text, marginTop: 2 }} />
                    </label>
                    <label style={{ fontSize: 10, color: T.text2 }}>
                      notes
                      <input value={draft.notes || ""} onChange={e => setDraft({ ...draft, notes: e.target.value })}
                        placeholder="Why this override?"
                        style={{ width: "100%", padding: "5px 8px", fontSize: 11, border: `1px solid ${T.border}`, borderRadius: 4, background: T.bg, color: T.text, marginTop: 2 }} />
                    </label>
                  </div>
                  <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                    <button onClick={saveEdit} disabled={saving}
                      style={{ padding: "5px 14px", fontSize: 11, fontWeight: 600, border: "none", background: "#22c55e", color: "white", borderRadius: 4, cursor: saving ? "wait" : "pointer" }}>
                      {saving ? "Saving..." : "💾 Save"}
                    </button>
                    <button onClick={() => { setEditing(null); setDraft({}); }}
                      style={{ padding: "5px 14px", fontSize: 11, fontWeight: 600, border: `1px solid ${T.border}`, background: "transparent", color: T.text2, borderRadius: 4, cursor: "pointer" }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <code style={{ fontSize: 11, fontWeight: 700, color: T.accent }}>{s.sku}</code>
                      {s.issue === "multi_title" && <span style={{ fontSize: 9, color: "#f59e0b", fontWeight: 700, background: "#f59e0b22", padding: "1px 5px", borderRadius: 3 }}>MULTI-TITLE</span>}
                      {s.issue === "missing_variant" && <span style={{ fontSize: 9, color: "#f59e0b", fontWeight: 700, background: "#f59e0b22", padding: "1px 5px", borderRadius: 3 }}>NO VARIANT</span>}
                      {s.issue === "unmapped" && <span style={{ fontSize: 9, color: "#ef4444", fontWeight: 700, background: "#ef444422", padding: "1px 5px", borderRadius: 3 }}>UNMAPPED</span>}
                      {s.override && <span style={{ fontSize: 9, color: "#22c55e", fontWeight: 700, background: "#22c55e22", padding: "1px 5px", borderRadius: 3 }}>OVERRIDDEN</span>}
                      <span style={{ fontSize: 10, color: T.text3 }}>{fmt(s.units)} units · ${fmt(Math.round(s.revenue))}</span>
                    </div>
                    <div style={{ fontSize: 11, color: T.text, fontWeight: 600 }}>→ {s.effectiveBaseProduct}</div>
                    <div style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>
                      Metabase: {s.titles.length > 1 ? <span style={{ color: "#f59e0b" }}>{s.titles.length} titles seen — </span> : null}
                      {s.titles.slice(0, 2).join(" / ") || "(no title)"}
                      {s.variants.length > 0 ? ` · ${s.variants.slice(0, 2).join(" / ")}` : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button onClick={() => startEdit(s)}
                      style={{ padding: "4px 10px", fontSize: 10, fontWeight: 600, border: `1px solid ${T.border}`, background: "transparent", color: T.text2, borderRadius: 4, cursor: "pointer" }}>
                      ✏️ Edit
                    </button>
                    {s.override && (
                      <button onClick={() => deleteOverride(s.sku)}
                        style={{ padding: "4px 10px", fontSize: 10, fontWeight: 600, border: `1px solid #ef4444`, background: "transparent", color: "#ef4444", borderRadius: 4, cursor: "pointer" }}>
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// GROWTH PLANNER VIEW — Scenario planning, growth headroom, marketing scaling
// ═══════════════════════════════════════════════════════════════════════════════
function GrowthPlannerView({ isMobile, orgId }) {
  const EB_ORG = "a0000000-0000-0000-0000-000000000001";
  const isEB = orgId === EB_ORG;
  
  if (!isEB) {
    return (
      <div style={{ padding: 60, textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>📈</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>No Growth Data Yet</div>
        <div style={{ fontSize: 12, color: T.text3, marginTop: 6, maxWidth: 400, margin: "6px auto 0", lineHeight: 1.6 }}>Connect your data sources to start modeling growth scenarios, subscription cohorts, and regional demand for this workspace.</div>
      </div>
    );
  }
  const [monthlyNewSubs, setMonthlyNewSubs] = useState(10000);
  const [churnRate, setChurnRate] = useState(15);
  const [avgPackSize, setAvgPackSize] = useState(2.4);
  const [upsellRate, setUpsellRate] = useState(12);
  const [cancelSaveRate, setCancelSaveRate] = useState(18);

  // Compute scenario
  const currentWeekly = MOCK_PRODUCTS.reduce((s, p) => s + p.weekly_units, 0);
  const currentMonthly = currentWeekly * 4.33;
  const currentSubs = Math.round(currentMonthly * 0.65); // 65% subscription
  const totalOnHand = MOCK_INVENTORY.reduce((s, i) => s + i.on_hand, 0);
  const totalIncoming = MOCK_INVENTORY.reduce((s, i) => s + i.incoming, 0);

  // New subs add demand, churn removes
  const netNewPerMonth = monthlyNewSubs * (1 - churnRate / 100);
  const additionalMonthlyUnits = netNewPerMonth * avgPackSize;
  const upsellBoost = 1 + (upsellRate / 100) * 0.3; // upsell adds ~0.3 packs avg
  const saveBoost = 1 + (cancelSaveRate / 100) * 0.05; // saves retain ~5% of churning demand
  const projectedMonthly = currentMonthly + (additionalMonthlyUnits * upsellBoost * saveBoost);
  const growthPct = ((projectedMonthly / currentMonthly) - 1) * 100;
  const projectedWeekly = projectedMonthly / 4.33;

  // Stockout risk
  const availableUnits = totalOnHand + totalIncoming;
  const weeksOfSupplyAtProjected = availableUnits / Math.max(projectedWeekly, 1);
  const maxGrowthWithoutStockout = (() => {
    const safeWeeks = 8; // minimum weeks we want
    const maxWeeklyDemand = availableUnits / safeWeeks;
    return Math.max(0, ((maxWeeklyDemand / currentWeekly) - 1) * 100);
  })();

  return (
    <div>
      {/* Growth Headroom Banner */}
      <div style={{ padding: "20px 24px", background: `linear-gradient(135deg, ${T.accent}12, ${T.purple || T.accent}08)`, border: `1px solid ${T.accent}25`, borderRadius: 12, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: isMobile ? "flex-start" : "center", gap: 16, flexDirection: isMobile ? "column" : "row" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.accent, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Growth Headroom</div>
            <div style={{ fontSize: 28, fontWeight: 900, color: T.text, letterSpacing: "-1px" }}>
              {maxGrowthWithoutStockout.toFixed(0)}% <span style={{ fontSize: 14, fontWeight: 500, color: T.text3 }}>growth available</span>
            </div>
            <div style={{ fontSize: 12, color: T.text3, marginTop: 4 }}>You can scale spend up to <span style={{ fontWeight: 700, color: T.accent }}>{maxGrowthWithoutStockout.toFixed(0)}%</span> above current levels without risking stockouts, assuming current inventory + incoming POs and 8 weeks safety stock.</div>
          </div>
          <div style={{ textAlign: "center", padding: "12px 20px", background: T.surface, borderRadius: 10, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 10, color: T.text3, marginBottom: 2 }}>Max Weekly Units</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>{fmt(Math.round(currentWeekly * (1 + maxGrowthWithoutStockout / 100)))}</div>
            <div style={{ fontSize: 10, color: T.text3 }}>vs {fmt(currentWeekly)} today</div>
          </div>
        </div>
      </div>

      {/* Scenario Controls */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, marginBottom: 20 }}>
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 14 }}>Scenario Parameters</div>
          {[
            { label: "New Subscribers / Month", value: monthlyNewSubs, set: setMonthlyNewSubs, min: 0, max: 50000, step: 500, unit: "" },
            { label: "Monthly Churn Rate", value: churnRate, set: setChurnRate, min: 5, max: 40, step: 0.5, unit: "%" },
            { label: "Average Pack Size", value: avgPackSize, set: setAvgPackSize, min: 1, max: 4, step: 0.1, unit: " packs" },
            { label: "Upsell Take Rate", value: upsellRate, set: setUpsellRate, min: 0, max: 40, step: 1, unit: "%" },
            { label: "Cancel-Save Rate", value: cancelSaveRate, set: setCancelSaveRate, min: 0, max: 50, step: 1, unit: "%" },
          ].map(s => (
            <div key={s.label} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: T.text2 }}>{s.label}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: T.accent, fontFamily: "monospace" }}>{s.unit === "%" ? `${s.value}%` : s.unit === " packs" ? s.value.toFixed(1) : fmt(s.value)}</span>
              </div>
              <input type="range" min={s.min} max={s.max} step={s.step} value={s.value} onChange={e => s.set(Number(e.target.value))}
                style={{ width: "100%", height: 4, borderRadius: 2, appearance: "none", background: `linear-gradient(to right, ${T.accent} ${((s.value - s.min) / (s.max - s.min)) * 100}%, ${T.surface3} ${((s.value - s.min) / (s.max - s.min)) * 100}%)`, outline: "none", cursor: "pointer" }} />
            </div>
          ))}
        </div>

        {/* Scenario Results */}
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 14 }}>Projected Impact</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={{ padding: "14px 12px", background: T.surface2, borderRadius: 8, textAlign: "center" }}>
              <div style={{ fontSize: 9, color: T.text3, marginBottom: 4, textTransform: "uppercase", fontWeight: 600 }}>Monthly Demand</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>{fmt(Math.round(projectedMonthly))}</div>
              <div style={{ fontSize: 10, color: growthPct >= 0 ? "#22c55e" : "#ef4444", fontWeight: 600 }}>{growthPct >= 0 ? "+" : ""}{growthPct.toFixed(1)}% vs today</div>
            </div>
            <div style={{ padding: "14px 12px", background: T.surface2, borderRadius: 8, textAlign: "center" }}>
              <div style={{ fontSize: 9, color: T.text3, marginBottom: 4, textTransform: "uppercase", fontWeight: 600 }}>Weekly Demand</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>{fmt(Math.round(projectedWeekly))}</div>
              <div style={{ fontSize: 10, color: T.text3 }}>from {fmt(currentWeekly)} today</div>
            </div>
            <div style={{ padding: "14px 12px", background: T.surface2, borderRadius: 8, textAlign: "center" }}>
              <div style={{ fontSize: 9, color: T.text3, marginBottom: 4, textTransform: "uppercase", fontWeight: 600 }}>Net New Subs/Mo</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: T.accent }}>{fmt(Math.round(netNewPerMonth))}</div>
              <div style={{ fontSize: 10, color: T.text3 }}>{fmt(monthlyNewSubs)} acquired, {churnRate}% churn</div>
            </div>
            <div style={{ padding: "14px 12px", background: weeksOfSupplyAtProjected < 6 ? "#fef2f210" : T.surface2, borderRadius: 8, textAlign: "center" }}>
              <div style={{ fontSize: 9, color: T.text3, marginBottom: 4, textTransform: "uppercase", fontWeight: 600 }}>Weeks of Supply</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: weeksOfSupplyAtProjected < 6 ? "#ef4444" : weeksOfSupplyAtProjected < 8 ? "#f59e0b" : "#22c55e" }}>{weeksOfSupplyAtProjected.toFixed(1)}</div>
              <div style={{ fontSize: 10, color: weeksOfSupplyAtProjected < 6 ? "#ef4444" : T.text3, fontWeight: weeksOfSupplyAtProjected < 6 ? 700 : 400 }}>{weeksOfSupplyAtProjected < 6 ? "⚠️ Stockout risk!" : weeksOfSupplyAtProjected < 8 ? "Watch closely" : "Healthy"}</div>
            </div>
          </div>

          {/* What-if insights */}
          <div style={{ marginTop: 14, padding: "12px 14px", background: T.surface2, borderRadius: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.text, marginBottom: 6 }}>What-If Insights</div>
            <div style={{ fontSize: 11, color: T.text2, lineHeight: 1.6 }}>
              {growthPct > maxGrowthWithoutStockout ? (
                <span style={{ color: "#ef4444" }}>⚠️ This scenario exceeds growth headroom by {(growthPct - maxGrowthWithoutStockout).toFixed(0)}%. You would need to increase inventory by ~{fmt(Math.round((projectedWeekly - currentWeekly * (1 + maxGrowthWithoutStockout / 100)) * 8))} units before scaling to this level.</span>
              ) : growthPct > maxGrowthWithoutStockout * 0.8 ? (
                <span style={{ color: "#f59e0b" }}>⚡ Approaching capacity — using {((growthPct / maxGrowthWithoutStockout) * 100).toFixed(0)}% of growth headroom. Consider placing POs now to maintain runway.</span>
              ) : (
                <span style={{ color: "#22c55e" }}>✅ This scenario is well within current inventory capacity. You have room to scale further.</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Subscription Cohort Retention */}
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Subscription Retention Curves</div>
          <div style={{ fontSize: 11, color: T.text3 }}>Cohort retention rates — shows how subscribers drop off over time</div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: T.surface2 }}>
                {["Cohort", "Size", "M0", "M1", "M2", "M3", "M6", "M9", "M12"].map(h => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: h === "Cohort" ? "left" : "center", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MOCK_COHORTS.map(c => (
                <tr key={c.month} style={{ borderBottom: `1px solid ${T.border}` }}>
                  <td style={{ padding: "8px 12px", fontWeight: 600, color: T.text }}>{c.month}</td>
                  <td style={{ padding: "8px 12px", textAlign: "center", fontFamily: "monospace" }}>{fmt(c.size)}</td>
                  {[c.m0, c.m1, c.m2, c.m3, c.m6, c.m9, c.m12].map((v, i) => {
                    const pct = v != null ? (v / c.size) * 100 : null;
                    return (
                      <td key={i} style={{ padding: "8px 12px", textAlign: "center" }}>
                        {pct != null ? (
                          <div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: pct > 80 ? "#22c55e" : pct > 60 ? "#f59e0b" : "#ef4444" }}>{pct.toFixed(0)}%</div>
                            <div style={{ fontSize: 9, color: T.text3 }}>{fmt(v)}</div>
                          </div>
                        ) : <span style={{ color: T.text3, fontSize: 10 }}>—</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pack Size & Offer Performance */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 12 }}>Pack Size Distribution</div>
          {[
            { label: "1-Pack", pct: 0.18, color: "#94a3b8" },
            { label: "2-Pack", pct: 0.32, color: "#3b82f6" },
            { label: "3-Pack", pct: 0.22, color: "#8b5cf6" },
            { label: "4-Pack", pct: 0.28, color: "#22c55e" },
          ].map(p => (
            <div key={p.label} style={{ marginBottom: 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: T.text2 }}>{p.label}</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: p.color }}>{(p.pct * 100).toFixed(0)}%</span>
              </div>
              <div style={{ height: 6, borderRadius: 3, background: T.surface3, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${p.pct * 100}%`, background: p.color, borderRadius: 3, transition: "width 0.3s" }} />
              </div>
            </div>
          ))}
          <div style={{ fontSize: 10, color: T.text3, marginTop: 8 }}>Average: <span style={{ fontWeight: 700 }}>2.4 packs</span> per subscription</div>
        </div>

        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 12 }}>Offer Take Rates</div>
          {[
            { label: "Cancel → Skip", rate: 0.22, impact: "$18.2K/mo saved" },
            { label: "Cancel → Pause", rate: 0.15, impact: "$12.8K/mo saved" },
            { label: "Cancel → Discount", rate: 0.11, impact: "$8.4K/mo saved" },
            { label: "Upsell 1→2 Pack", rate: 0.09, impact: "$6.1K/mo generated" },
            { label: "Upsell 1→4 Pack", rate: 0.05, impact: "$4.8K/mo generated" },
            { label: "Upsell 2→4 Pack", rate: 0.08, impact: "$7.2K/mo generated" },
          ].map(o => (
            <div key={o.label} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.text2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label}</div>
              </div>
              <div style={{ width: 50, height: 4, borderRadius: 2, background: T.surface3, overflow: "hidden", flexShrink: 0 }}>
                <div style={{ height: "100%", width: `${o.rate * 100 * 2.5}%`, background: T.accent, borderRadius: 2 }} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: T.accent, width: 32, textAlign: "right", flexShrink: 0 }}>{(o.rate * 100).toFixed(0)}%</span>
              <span style={{ fontSize: 9, color: T.text3, width: 75, textAlign: "right", flexShrink: 0 }}>{o.impact}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DATA SOURCES CONFIG VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function DataSourcesView({ isMobile, orgId }) {
  const [sources, setSources] = useState([]);
  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    if (!orgId) return;
    supabase.from("dp_data_sources").select("*").eq("org_id", orgId).then(({ data }) => setSources(data || []));
  }, [orgId]);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Data Sources</div>
          <div style={{ fontSize: 11, color: T.text3 }}>Connect Metabase or upload CSV data to power demand forecasts</div>
        </div>
        <button onClick={() => setShowAdd(true)} style={{ padding: "7px 14px", fontSize: 12, fontWeight: 600, borderRadius: 8, border: "none", background: T.accent, color: "#fff", cursor: "pointer" }}>+ Connect Source</button>
      </div>

      {/* Metabase connection card */}
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 18, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: "#509EE3" + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>📊</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Metabase</div>
            <div style={{ fontSize: 11, color: T.text3 }}>Pull scheduled reports via API</div>
          </div>
          <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 6, background: sources.length > 0 ? "#22c55e18" : "#f59e0b18", color: sources.length > 0 ? "#22c55e" : "#f59e0b" }}>
            {sources.length > 0 ? "Connected" : "Not configured"}
          </span>
        </div>
        <div style={{ fontSize: 11, color: T.text3 }}>
          Required: Metabase API URL, API key, and card IDs for the 5 demand planning reports. Your data team should have the report specifications (see PDF document).
        </div>
      </div>

      {/* CSV upload card */}
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 18, marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 8, background: "#22c55e20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>📁</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>CSV Upload</div>
            <div style={{ fontSize: 11, color: T.text3 }}>Upload data files manually</div>
          </div>
          <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 6, background: T.surface3, color: T.text3 }}>Available</span>
        </div>
        <div style={{ fontSize: 11, color: T.text3 }}>
          Upload CSV exports matching the report schemas. Useful for initial setup or one-off data imports before the API is connected.
        </div>
      </div>

      {/* Status of each report */}
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Report Status</div>
        </div>
        {[
          { name: "Weekly Unit Sales", report: 1, priority: "P1", table: "dp_weekly_sales", status: "awaiting" },
          { name: "SKU Master / Grouping", report: 2, priority: "P1", table: "dp_sku_master", status: "awaiting" },
          { name: "Subscription Cohorts", report: 3, priority: "P2", table: "dp_subscription_cohorts", status: "awaiting" },
          { name: "Offer Performance", report: 4, priority: "P3", table: "dp_offer_performance", status: "awaiting" },
          { name: "Inventory Snapshot", report: 5, priority: "P1", table: "dp_inventory", status: "awaiting" },
        ].map(r => (
          <div key={r.report} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 18px", borderBottom: `1px solid ${T.border}` }}>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: r.priority === "P1" ? "#ef444418" : r.priority === "P2" ? "#f59e0b18" : "#22c55e18", color: r.priority === "P1" ? "#ef4444" : r.priority === "P2" ? "#f59e0b" : "#22c55e" }}>{r.priority}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>Report {r.report}: {r.name}</div>
              <div style={{ fontSize: 10, color: T.text3 }}>{r.table}</div>
            </div>
            <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 6, background: r.status === "connected" ? "#22c55e18" : "#94a3b818", color: r.status === "connected" ? "#22c55e" : "#94a3b8" }}>
              {r.status === "connected" ? "Connected" : "Awaiting Data"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// NEW PRODUCT LAUNCH PLANNER
// ═══════════════════════════════════════════════════════════════════════════════
const CHANNEL_DEFS = [
  { key: "hero_gwp", label: "Hero GWP", icon: "🎁", group: "primary", desc: "Primary acquisition funnel — ALL marketing channels (email, SMS, ads, organic, TikTok, etc.) drive traffic into this GWP offer" },
  { key: "amazon", label: "Amazon", icon: "📦", group: "marketplace", desc: "Amazon sales — direct PPC or halo from DTC brand awareness" },
  { key: "tiktok", label: "TikTok", icon: "🎵", group: "marketplace", desc: "TikTok Shop sales" },
  { key: "retail", label: "Retail", icon: "🏬", group: "offline", desc: "Brick & mortar retail distribution" },
  { key: "wholesale", label: "Wholesale", icon: "🏢", group: "offline", desc: "Wholesale / B2B distribution" },
  { key: "other", label: "Other", icon: "➕", group: "other", desc: "Other channel" },
];

const STATUS_OPTS = [
  { value: "planning", label: "Planning", color: "#6366f1" },
  { value: "approved", label: "Approved", color: "#22c55e" },
  { value: "active", label: "Active", color: "#0ea5e9" },
  { value: "completed", label: "Completed", color: "#10b981" },
  { value: "cancelled", label: "Cancelled", color: "#ef4444" },
];

// Marketing channel type definitions — defines which inputs apply per channel type
const MARKETING_TYPES = [
  { key: "email", label: "Email", icon: "📧", color: "#8b5cf6", inputs: ["sends", "open_rate_pct", "ctr_pct", "conversion_rate_pct"], desc: "Email campaign with full funnel" },
  { key: "sms", label: "SMS", icon: "💬", color: "#f59e0b", inputs: ["sends", "ctr_pct", "conversion_rate_pct"], desc: "SMS / MMS campaign with click + convert" },
  { key: "paid_ads", label: "Paid Ads", icon: "📱", color: "#ef4444", inputs: ["spend", "cpa"], desc: "Paid media (Meta, Google, TikTok, etc.) — budget and target CPA" },
  { key: "influencer", label: "Influencer", icon: "🎬", color: "#ec4899", inputs: ["spend", "cpa", "direct_orders"], desc: "Paid influencer or affiliate" },
  { key: "organic", label: "Organic / PR", icon: "🌿", color: "#22c55e", inputs: ["direct_orders"], desc: "Organic traffic, PR, earned media" },
  { key: "other", label: "Other", icon: "➕", color: "#6b7280", inputs: ["spend", "cpa", "direct_orders"], desc: "Custom marketing source" },
];

// Compute orders for a single marketing channel period based on its channel type
function calcMarketingPeriodOrders(channelType, period) {
  if (!period) return 0;
  if (period.override_orders != null && period.override_orders !== "") return parseInt(period.override_orders) || 0;
  switch (channelType) {
    case "email": {
      const s = parseFloat(period.sends) || 0;
      const o = (parseFloat(period.open_rate_pct) || 0) / 100;
      const c = (parseFloat(period.ctr_pct) || 0) / 100;
      const cv = (parseFloat(period.conversion_rate_pct) || 0) / 100;
      return Math.round(s * o * c * cv);
    }
    case "sms": {
      const s = parseFloat(period.sends) || 0;
      const c = (parseFloat(period.ctr_pct) || 0) / 100;
      const cv = (parseFloat(period.conversion_rate_pct) || 0) / 100;
      return Math.round(s * c * cv);
    }
    case "paid_ads":
    case "influencer": {
      const sp = parseFloat(period.spend) || 0;
      const cpa = parseFloat(period.cpa) || 0;
      const fromSpend = cpa > 0 ? Math.round(sp / cpa) : 0;
      const direct = parseInt(period.direct_orders) || 0;
      return fromSpend + direct;
    }
    case "organic": {
      return parseInt(period.direct_orders) || 0;
    }
    case "other":
    default: {
      const sp = parseFloat(period.spend) || 0;
      const cpa = parseFloat(period.cpa) || 0;
      const fromSpend = cpa > 0 ? Math.round(sp / cpa) : 0;
      const direct = parseInt(period.direct_orders) || 0;
      return fromSpend + direct;
    }
  }
}

function calcChannelUnits(ch, allChannels, allPeriods, chEmailSends) {
  const c = ch.channel;

  // Returns ORDERS (conversions). Variant splits handle unit allocation.
  const getPaidOrders = () => {
    if (!allChannels) return 0;
    const heroChannels = allChannels.filter(s => s.id !== ch.id && (s.channel === "hero_gwp" || s.channel === "dtc_paid"));
    return heroChannels.reduce((sum, s) => sum + calcChannelUnits(s, null, allPeriods), 0);
  };

  const getHaloOrders = () => {
    if (!ch.halo_pct) return 0;
    return Math.round(getPaidOrders() * (ch.halo_pct / 100));
  };

  const getDirectOrders = () => {
    if (c === "hero_gwp" || c === "dtc_paid") {
      const chPeriods = (allPeriods || []).filter(p => p.channel_id === ch.id);
      if (chPeriods.length > 0) {
        return chPeriods.reduce((sum, p) => {
          const spend = parseFloat(p.ad_spend) || 0;
          const cpa = parseFloat(p.cpa) || 0;
          return sum + (cpa > 0 ? Math.round(spend / cpa) : 0);
        }, 0);
      }
      if (ch.ad_spend && ch.cpa && ch.cpa > 0) return Math.round(ch.ad_spend / ch.cpa);
      if (ch.estimated_new_customers) return Math.round(ch.estimated_new_customers);
      return 0;
    }
    if (c === "email") {
      if (chEmailSends && chEmailSends.length > 0) {
        return chEmailSends.reduce((sum, send) => {
          const sent = (send.list_size || 0) * ((send.send_pct || 100) / 100);
          const opened = sent * ((send.open_rate || 25) / 100);
          const clicked = opened * ((send.click_rate || 3) / 100);
          return sum + Math.round(clicked * ((send.conversion_rate || 5) / 100));
        }, 0);
      }
      const sent = (ch.email_list_size || 0) * ((ch.email_send_pct || 100) / 100);
      const opened = sent * ((ch.email_open_rate || 25) / 100);
      const clicked = opened * ((ch.email_click_rate || 3) / 100);
      return Math.round(clicked * ((ch.email_conversion_rate || 5) / 100));
    }
    if (c === "sms") {
      // SMS multi-send mode (reuses emailSends table)
      if (chEmailSends && chEmailSends.length > 0) {
        return chEmailSends.reduce((sum, send) => {
          const sent = (send.list_size || 0) * ((send.send_pct || 100) / 100);
          const clicked = sent * ((send.click_rate || 8) / 100);
          return sum + Math.round(clicked * ((send.conversion_rate || 5) / 100));
        }, 0);
      }
      // Legacy single fields
      const sent = (ch.email_list_size || 0) * ((ch.email_send_pct || 100) / 100);
      const clicked = sent * ((ch.email_click_rate || 8) / 100);
      return Math.round(clicked * ((ch.email_conversion_rate || 5) / 100));
    }
    if (c === "upsell") {
      return Math.round((ch.upsell_eligible_orders || 0) * ((ch.upsell_take_rate || 15) / 100));
    }
    if (c === "free_gift") {
      return Math.round((ch.free_gift_eligible_orders || 0) * ((ch.free_gift_take_rate || 100) / 100));
    }
    if (c === "amazon") {
      const weeks = ch.forecast_weeks || ch.retail_weeks || 12;
      const dailyOrders = (ch.amz_daily_sessions || 0) * ((ch.amz_conversion_rate || 12) / 100);
      return Math.round(dailyOrders * 7 * weeks);
    }
    if (c === "retail") {
      return Math.round((ch.retail_store_count || 0) * (ch.retail_units_per_store_per_week || 0) * (ch.forecast_weeks || ch.retail_weeks || 12));
    }
    if (ch.estimated_new_customers) return Math.round(ch.estimated_new_customers);
    return ch.estimated_units || 0;
  };

  const source = ch.demand_source || "direct";
  if (source === "halo") return getHaloOrders();
  if (source === "both") return getDirectOrders() + getHaloOrders();
  return getDirectOrders();
}

// ── Debounced Input (top-level to avoid re-creation on parent render) ──
function DebouncedInput({ label, value, onChange, type = "text", placeholder, suffix, prefix, small }) {
  const [local, setLocal] = useState(value ?? "");
  const [focused, setFocused] = useState(false);
  const timerRef = useRef(null);
  const dirtyRef = useRef(false);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => { if (!dirtyRef.current) setLocal(value ?? ""); }, [value]);

  const fmtComma = (v) => {
    if (v === "" || v === null || v === undefined) return "";
    const n = Number(v);
    if (isNaN(n)) return String(v);
    if (Number.isInteger(n)) return n.toLocaleString("en-US");
    return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
  };

  const handleChange = (e) => {
    const raw = e.target.value;
    // Strip commas for number fields so user can type freely
    const cleaned = type === "number" ? raw.replace(/,/g, "") : raw;
    const v = type === "number" ? (cleaned === "" ? "" : cleaned) : cleaned;
    setLocal(v);
    dirtyRef.current = true;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const parsed = type === "number" ? (v === "" ? null : Number(v)) : v;
      onChangeRef.current(parsed);
      setTimeout(() => { dirtyRef.current = false; }, 100);
    }, 600);
  };

  const displayValue = type === "number" && !focused ? fmtComma(local) : local;

  return (
    <div style={{ marginBottom: small ? 6 : 10 }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: T.text3, marginBottom: 3 }}>{label}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
        {prefix && <span style={{ fontSize: 11, color: T.text3 }}>{prefix}</span>}
        <input value={displayValue} onChange={handleChange}
          onFocus={() => setFocused(true)}
          onBlur={() => { setFocused(false); dirtyRef.current = false; }}
          type="text" inputMode={type === "number" ? "decimal" : undefined} placeholder={placeholder}
          style={{ flex: 1, padding: "6px 10px", fontSize: 12, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface2, color: T.text, boxSizing: "border-box", width: "100%", textAlign: type === "number" ? "right" : "left" }} />
        {suffix && <span style={{ fontSize: 10, color: T.text3 }}>{suffix}</span>}
      </div>
    </div>
  );
}

// Inline number input with comma formatting for table cells
function FmtInput({ defaultValue, onBlur, style, disabled }) {
  const [val, setVal] = useState(defaultValue ?? "");
  const [focused, setFocused] = useState(false);
  const fmtC = (v) => { if (v === "" || v === null || v === undefined) return ""; const n = Number(v); return isNaN(n) ? String(v) : n.toLocaleString("en-US", { maximumFractionDigits: 4 }); };
  useEffect(() => { if (!focused) setVal(defaultValue ?? ""); }, [defaultValue]);
  return (
    <input
      value={focused ? val : fmtC(val)}
      onChange={e => setVal(e.target.value.replace(/,/g, ""))}
      onFocus={() => setFocused(true)}
      onBlur={e => { setFocused(false); onBlur({ target: { value: String(val).replace(/,/g, "") } }); }}
      type="text" inputMode="decimal"
      disabled={disabled}
      style={style}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SkuPicker — autocomplete search of dp_sku_master with "Create New Draft SKU" fallback
// Used for: launch.product_sku, dp_launch_gwp_tiers.gift_sku, etc.
// ─────────────────────────────────────────────────────────────────────────────
function SkuPicker({ value, onChange, orgId, placeholder, allowCreate = true, isGiftPicker = false, style }) {
  const [query, setQuery] = useState(value || "");
  const [results, setResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [selectedDetails, setSelectedDetails] = useState(null);
  const timerRef = useRef(null);
  const wrapperRef = useRef(null);

  // Sync external value changes (e.g., when switching pack tiers)
  useEffect(() => { setQuery(value || ""); }, [value]);

  // Lookup the selected SKU details for the badge under the input
  useEffect(() => {
    if (!value) { setSelectedDetails(null); return; }
    let active = true;
    (async () => {
      const { data } = await supabase.from("dp_sku_master").select("sku, product_title, variant_title, status").eq("org_id", orgId).eq("sku", value).limit(1).single();
      if (active && data) setSelectedDetails(data);
    })();
    return () => { active = false; };
  }, [value, orgId]);

  // Debounced search
  useEffect(() => {
    if (!showDropdown) return;
    clearTimeout(timerRef.current);
    if (!query || query.length < 1) { setResults([]); return; }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      const q = query.replace(/[%_]/g, "\\$&");
      let req = supabase.from("dp_sku_master")
        .select("sku, product_title, variant_title, base_product, product_category, status, current_price, units_per_sku")
        .eq("org_id", orgId)
        .or(`sku.ilike.%${q}%,product_title.ilike.%${q}%,variant_title.ilike.%${q}%`)
        .limit(15);
      if (isGiftPicker) {
        // Prefer GWP-flagged products at the top, but don't exclude others
      }
      const { data } = await req;
      setResults(data || []);
      setLoading(false);
    }, 200);
    return () => clearTimeout(timerRef.current);
  }, [query, orgId, showDropdown, isGiftPicker]);

  // Click-outside handler
  useEffect(() => {
    const onDown = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setShowDropdown(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const pick = (sku) => {
    setQuery(sku.sku);
    onChange(sku.sku);
    setShowDropdown(false);
  };

  const createDraft = async () => {
    if (!query.trim()) return;
    setCreating(true);
    // Generate a draft SKU code based on the typed query
    let baseCode = query.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
    if (!baseCode) baseCode = "DRAFT";
    let sku = baseCode.startsWith("DRAFT-") ? baseCode : `DRAFT-${baseCode}`;
    // Ensure uniqueness
    let suffix = 0;
    while (true) {
      const candidate = suffix === 0 ? sku : `${sku}-${suffix}`;
      const { data: existing } = await supabase.from("dp_sku_master").select("sku").eq("org_id", orgId).eq("sku", candidate).limit(1);
      if (!existing || existing.length === 0) { sku = candidate; break; }
      suffix++;
      if (suffix > 99) break;
    }
    const { data, error } = await supabase.from("dp_sku_master").insert({
      org_id: orgId,
      sku,
      product_title: query.trim(),
      status: "draft",
      is_gwp: !!isGiftPicker,
    }).select().single();
    setCreating(false);
    if (error) { alert(`Failed to create SKU: ${error.message}`); return; }
    if (data) {
      pick(data);
    }
  };

  const showCreate = allowCreate && query.trim().length >= 2 && !results.some(r => r.sku.toLowerCase() === query.trim().toLowerCase());

  return (
    <div ref={wrapperRef} style={{ position: "relative", ...style }}>
      <input
        type="text"
        value={query}
        placeholder={placeholder || "Search SKU or product title…"}
        onChange={e => { setQuery(e.target.value); setShowDropdown(true); }}
        onFocus={() => setShowDropdown(true)}
        style={{ width: "100%", padding: "5px 8px", fontSize: 11, border: `1px solid ${T.border}`, borderRadius: 5, background: T.surface, color: T.text, outline: "none", boxSizing: "border-box" }}
      />
      {selectedDetails && !showDropdown && (
        <div style={{ marginTop: 3, fontSize: 9, color: T.text3, lineHeight: 1.4 }}>
          {selectedDetails.product_title}{selectedDetails.variant_title ? ` · ${selectedDetails.variant_title}` : ""}
          {selectedDetails.status === "draft" && <span style={{ marginLeft: 6, padding: "1px 5px", background: "#f59e0b15", color: "#f59e0b", borderRadius: 3, fontWeight: 700, fontSize: 8 }}>DRAFT</span>}
        </div>
      )}
      {showDropdown && (
        <div style={{ position: "absolute", top: "calc(100% + 2px)", left: 0, right: 0, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, boxShadow: "0 4px 12px rgba(0,0,0,0.08)", maxHeight: 280, overflowY: "auto", zIndex: 100 }}>
          {loading && <div style={{ padding: 10, fontSize: 10, color: T.text3, textAlign: "center" }}>Searching…</div>}
          {!loading && results.length === 0 && query.trim().length >= 1 && (
            <div style={{ padding: 10, fontSize: 10, color: T.text3, textAlign: "center" }}>No matches.</div>
          )}
          {!loading && results.map(r => (
            <button key={r.sku} type="button" onClick={() => pick(r)}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 10px", border: "none", background: "transparent", color: T.text, cursor: "pointer", fontSize: 11, borderBottom: `1px solid ${T.border}` }}
              onMouseEnter={e => e.currentTarget.style.background = T.surface2}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <div style={{ fontWeight: 700, fontFamily: "monospace", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>{r.sku}</span>
                {r.status === "draft" && <span style={{ padding: "1px 5px", background: "#f59e0b15", color: "#f59e0b", borderRadius: 3, fontWeight: 700, fontSize: 8 }}>DRAFT</span>}
              </div>
              <div style={{ fontSize: 10, color: T.text3, marginTop: 1 }}>
                {r.product_title}{r.variant_title ? ` · ${r.variant_title}` : ""}
                {r.product_category && <span style={{ marginLeft: 6, color: T.text3 }}>· {r.product_category}</span>}
              </div>
            </button>
          ))}
          {showCreate && (
            <button type="button" onClick={createDraft} disabled={creating}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "8px 10px", border: "none", background: T.accent + "08", color: T.accent, cursor: creating ? "wait" : "pointer", fontSize: 11, fontWeight: 600, borderTop: results.length > 0 ? `1px solid ${T.border}` : "none" }}>
              {creating ? "Creating…" : `+ Create draft SKU for "${query.trim()}"`}
            </button>
          )}
          {value && (
            <button type="button" onClick={() => { setQuery(""); onChange(null); setShowDropdown(false); }}
              style={{ display: "block", width: "100%", textAlign: "left", padding: "6px 10px", border: "none", background: "transparent", color: T.text3, cursor: "pointer", fontSize: 10, borderTop: `1px solid ${T.border}` }}>
              Clear selection
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ChannelInputs({ ch, onUpdateChannel, allChannels, allPeriods, onAddPeriod, onUpdatePeriod, onRemovePeriod, onInitPeriods, emailSends, onAddEmailSend, onUpdateEmailSend, onRemoveEmailSend, variantSplits, allVariantSplits, onAddVariantSplit, onUpdateVariantSplit, onRemoveVariantSplit, onInitDefaultVariants, onCopyVariantsFrom, gwpTiers, onAddGwpTier, onUpdateGwpTier, onRemoveGwpTier }) {
  const up = (field, val) => onUpdateChannel(ch.id, { [field]: val });
  const c = ch.channel;
  const units = calcChannelUnits(ch, allChannels, allPeriods, emailSends);
  const I = DebouncedInput;
  const isHalo = ch.demand_source === "halo";
  const isBoth = ch.demand_source === "both";
  const isPrimary = c === "hero_gwp";
  // Channels that can be halo sources (hero GWP, DTC Paid)
  const haloSources = (allChannels || []).filter(s => s.id !== ch.id && (s.channel === "hero_gwp" || s.channel === "dtc_paid"));

  // Calculate halo units for display
  const getPaidOrders = () => {
    return haloSources.reduce((sum, s) => {
      const u = calcChannelUnits(s, null, allPeriods);
      return sum + ((s.units_per_order || 1) > 0 ? u / (s.units_per_order || 1) : u);
    }, 0);
  };
  const haloUnits = ch.halo_pct ? Math.round(getPaidOrders() * (ch.halo_pct / 100) * (ch.units_per_order || 1)) : 0;

  return (
    <div>
      {/* Demand source toggle — not shown for hero_gwp (always direct) */}
      {!isPrimary && haloSources.length > 0 && (
        <div style={{ marginBottom: 10, padding: "8px 12px", background: T.surface3, borderRadius: 6, border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>Demand Source</div>
          <div style={{ display: "flex", gap: 4 }}>
            {[{ v: "direct", l: "Direct", d: "Own demand model" }, { v: "halo", l: "Halo Only", d: "% of paid media orders" }, { v: "both", l: "Direct + Halo", d: "Own model + paid media spillover" }].map(opt => (
              <button key={opt.v} onClick={() => up("demand_source", opt.v)}
                style={{ flex: 1, padding: "6px 8px", fontSize: 10, fontWeight: 600, borderRadius: 5, border: `1px solid ${(ch.demand_source || "direct") === opt.v ? T.accent : T.border}`, background: (ch.demand_source || "direct") === opt.v ? T.accent + "15" : "transparent", color: (ch.demand_source || "direct") === opt.v ? T.accent : T.text3, cursor: "pointer" }}>
                {opt.l}
                <div style={{ fontSize: 8, fontWeight: 400, marginTop: 1 }}>{opt.d}</div>
              </button>
            ))}
          </div>

          {/* Halo inputs — shown for 'halo' and 'both' modes */}
          {(isHalo || isBoth) && (
            <div style={{ marginTop: 8, padding: "8px 10px", background: "#8b5cf610", borderRadius: 6, border: "1px solid #8b5cf620" }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: "#8b5cf6", marginBottom: 4 }}>🌊 Halo Effect — spillover demand from paid media</div>
              <div style={{ fontSize: 9, color: T.text3, marginBottom: 6, lineHeight: 1.4, fontStyle: "italic" }}>{
                c === "amazon" ? "DTC ad spend (Meta, Google, TV) drives brand awareness → organic Amazon searches + higher conversion. What % of DTC orders do you expect to also generate Amazon orders?" :
                c === "upsell" ? "New customers acquired through Hero GWP will see this product as an upsell at checkout. What % of those new orders will take the upsell?" :
                c === "free_gift" ? "Paid acquisition drives order volume → more orders qualifying for the free gift tier. What % of paid orders will qualify?" :
                c === "retail" ? "DTC brand awareness lifts retail sell-through. What % of DTC orders translate to incremental retail sales?" :
                c === "organic" ? "Paid media investment lifts organic search, direct traffic, and PR pickup. What % of paid orders do you expect as organic halo?" :
                "What % of paid media orders will generate additional demand in this channel?"
              }</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <I label="Halo % of Paid Orders" value={ch.halo_pct} onChange={v => up("halo_pct", v)} type="number" suffix="%" placeholder="e.g. 8" />
                {!isBoth && <I label="Units per Order" value={ch.units_per_order} onChange={v => up("units_per_order", v)} type="number" placeholder="1" />}
              </div>
              {haloSources.length > 0 && (
                <div style={{ fontSize: 10, color: T.text3, marginTop: 4, lineHeight: 1.4 }}>
                  📊 Base: {haloSources.map(s => {
                    const def = CHANNEL_DEFS.find(d => d.key === s.channel);
                    const sUnits = calcChannelUnits(s, null, allPeriods);
                    const sOrders = (s.units_per_order || 1) > 0 ? Math.round(sUnits / (s.units_per_order || 1)) : sUnits;
                    return `${def?.label || s.channel}: ${fmt(sOrders)} orders`;
                  }).join(" + ")} → Halo: {fmt(haloUnits)} units
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Direct mode inputs (shown for 'direct', 'both', or always for hero_gwp) */}
      {(!isHalo || isPrimary) && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          
          {/* Hero GWP / DTC Paid — primary driver with optional time-phased spend */}
          {(c === "hero_gwp" || c === "dtc_paid") && (() => {
            const chPeriods = (allPeriods || []).filter(p => p.channel_id === ch.id).sort((a,b) => a.period_index - b.period_index);
            const hasPeriods = chPeriods.length > 0;
            const periodTotalSpend = chPeriods.reduce((s, p) => s + (parseFloat(p.ad_spend) || 0), 0);
            const periodTotalCustomers = chPeriods.reduce((s, p) => {
              const spend = parseFloat(p.ad_spend) || 0;
              const cpa = parseFloat(p.cpa) || 0;
              return s + (cpa > 0 ? Math.round(spend / cpa) : 0);
            }, 0);
            const avgCpa = periodTotalCustomers > 0 ? (periodTotalSpend / periodTotalCustomers) : 0;

            return <>
              {/* Mode toggle: Total vs Time-Phased */}
              <div style={{ gridColumn: "1 / -1", marginBottom: 4 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>Spend Planning</div>
                <div style={{ display: "flex", gap: 4 }}>
                  {[{ v: "total", l: "Total (Single)", d: "One spend + CPA" }, { v: "weekly", l: "Weekly", d: "Spend/CPA per week" }, { v: "monthly", l: "Monthly", d: "Spend/CPA per month" }].map(opt => (
                    <button key={opt.v} onClick={() => {
                      if (opt.v === "total") {
                        // Remove periods, go back to single
                        up("period_type", "total");
                        chPeriods.forEach(p => onRemovePeriod(p.id));
                      } else {
                        const count = opt.v === "weekly" ? (ch.forecast_weeks || 12) : Math.ceil((ch.forecast_weeks || 12) / 4.33);
                        onInitPeriods(ch.id, Math.min(count, 26), opt.v);
                      }
                    }}
                      style={{ flex: 1, padding: "5px 8px", fontSize: 10, fontWeight: 600, borderRadius: 5, border: `1px solid ${(ch.period_type || "total") === opt.v ? T.accent : T.border}`, background: (ch.period_type || "total") === opt.v ? T.accent + "15" : "transparent", color: (ch.period_type || "total") === opt.v ? T.accent : T.text3, cursor: "pointer" }}>
                      {opt.l}
                      <div style={{ fontSize: 8, fontWeight: 400, marginTop: 1 }}>{opt.d}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Single spend mode */}
              {!hasPeriods && <>
                <I label="Total Ad Spend" value={ch.ad_spend} onChange={v => up("ad_spend", v)} type="number" prefix="$" />
                <I label="Avg CPA" value={ch.cpa} onChange={v => up("cpa", v)} type="number" prefix="$" />
                <I label="Est. New Customers" value={ch.estimated_new_customers || (ch.ad_spend && ch.cpa ? Math.round(ch.ad_spend / ch.cpa) : "")} onChange={v => up("estimated_new_customers", v)} type="number" />
              </>}

              {/* Time-phased spend table */}
              {hasPeriods && (
                <div style={{ gridColumn: "1 / -1" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                    <thead>
                      <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                        <th style={{ textAlign: "left", padding: "4px 6px", fontSize: 9, fontWeight: 700, color: T.text3 }}>Period</th>
                        <th style={{ textAlign: "right", padding: "4px 6px", fontSize: 9, fontWeight: 700, color: T.text3 }}>Ad Spend</th>
                        <th style={{ textAlign: "right", padding: "4px 6px", fontSize: 9, fontWeight: 700, color: T.text3 }}>CPA</th>
                        <th style={{ textAlign: "right", padding: "4px 6px", fontSize: 9, fontWeight: 700, color: T.text3 }}>Customers</th>
                        <th style={{ width: 20 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {chPeriods.map(p => {
                        const pSpend = parseFloat(p.ad_spend) || 0;
                        const pCpa = parseFloat(p.cpa) || 0;
                        const pCust = pCpa > 0 ? Math.round(pSpend / pCpa) : 0;
                        return (
                          <tr key={p.id} style={{ borderBottom: `1px solid ${T.border}08` }}>
                            <td style={{ padding: "3px 6px", color: T.text2, fontWeight: 600, fontSize: 10 }}>{p.period_label}</td>
                            <td style={{ padding: "3px 2px" }}>
                              <FmtInput defaultValue={p.ad_spend ?? ""} onBlur={e => onUpdatePeriod(p.id, { ad_spend: e.target.value === "" ? null : Number(e.target.value) })}
                                style={{ width: "100%", padding: "3px 6px", fontSize: 11, textAlign: "right", border: `1px solid ${T.border}`, borderRadius: 4, background: T.surface2, color: T.text, boxSizing: "border-box" }} />
                            </td>
                            <td style={{ padding: "3px 2px" }}>
                              <FmtInput defaultValue={p.cpa ?? ""} onBlur={e => onUpdatePeriod(p.id, { cpa: e.target.value === "" ? null : Number(e.target.value) })}
                                style={{ width: "100%", padding: "3px 6px", fontSize: 11, textAlign: "right", border: `1px solid ${T.border}`, borderRadius: 4, background: T.surface2, color: T.text, boxSizing: "border-box" }} />
                            </td>
                            <td style={{ padding: "3px 6px", textAlign: "right", fontWeight: 700, color: T.accent, fontSize: 11 }}>{fmt(pCust)}</td>
                            <td><button onClick={() => onRemovePeriod(p.id)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 10, padding: 2 }}>×</button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr style={{ borderTop: `2px solid ${T.border}` }}>
                        <td style={{ padding: "5px 6px", fontWeight: 700, fontSize: 10, color: T.text }}>Total</td>
                        <td style={{ padding: "5px 6px", textAlign: "right", fontWeight: 700, fontSize: 11, color: T.text }}>${fmt(Math.round(periodTotalSpend))}</td>
                        <td style={{ padding: "5px 6px", textAlign: "right", fontWeight: 600, fontSize: 10, color: T.text3 }}>${avgCpa.toFixed(0)} avg</td>
                        <td style={{ padding: "5px 6px", textAlign: "right", fontWeight: 800, fontSize: 12, color: T.accent }}>{fmt(periodTotalCustomers)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                  <button onClick={() => onAddPeriod(ch.id, chPeriods.length)} style={{ marginTop: 4, padding: "3px 10px", fontSize: 10, fontWeight: 600, border: `1px solid ${T.border}`, borderRadius: 4, background: "transparent", color: T.text3, cursor: "pointer" }}>+ Add Period</button>
                </div>
              )}
            </>;
          })()}

          {/* GWP Tier Gifts — only for hero_gwp */}
          {c === "hero_gwp" && (() => {
            const tiers = gwpTiers || [];
            const inp4 = { width: "100%", padding: "4px 6px", fontSize: 11, border: `1px solid ${T.border}`, borderRadius: 4, background: T.surface2, color: T.text, boxSizing: "border-box" };
            return (
              <div style={{ gridColumn: "1 / -1", marginTop: 4 }}>
                <div style={{ padding: "10px 12px", background: "#f59e0b08", borderRadius: 8, border: `1px solid #f59e0b15` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: "#f59e0b" }}>🎁 Free Gift Tiers</div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      {/* Trigger type toggle */}
                      <div style={{ display: "flex", gap: 2, background: T.surface3, borderRadius: 4, padding: 2 }}>
                        {[{ v: "units", l: "📦 By Units" }, { v: "spend", l: "💵 By Spend" }].map(opt => {
                          const active = (tiers[0]?.trigger_type || "units") === opt.v;
                          return <button key={opt.v} onClick={() => tiers.forEach(t => onUpdateGwpTier(t.id, { trigger_type: opt.v }))}
                            style={{ padding: "2px 8px", fontSize: 9, fontWeight: 600, borderRadius: 3, border: "none", background: active ? "#f59e0b20" : "transparent", color: active ? "#f59e0b" : T.text3, cursor: "pointer" }}>{opt.l}</button>;
                        })}
                      </div>
                      <button onClick={() => onAddGwpTier(ch.id)} style={{ padding: "3px 10px", fontSize: 9, fontWeight: 600, border: `1px solid #f59e0b30`, borderRadius: 4, background: "transparent", color: "#f59e0b", cursor: "pointer" }}>+ Add Tier</button>
                    </div>
                  </div>

                  {tiers.length > 0 ? (() => {
                    const triggerType = tiers[0]?.trigger_type || "units";
                    const triggerLabel = triggerType === "units" ? "Min Qty" : "Min Spend";
                    return (
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, tableLayout: "fixed" }}>
                      <colgroup>
                        <col style={{ width: "14%" }} />
                        <col style={{ width: "12%" }} />
                        <col style={{ width: "24%" }} />
                        <col style={{ width: "24%" }} />
                        <col style={{ width: "12%" }} />
                        <col style={{ width: "8%" }} />
                        <col style={{ width: "6%" }} />
                      </colgroup>
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                          <th style={{ textAlign: "left", padding: "6px 4px", fontSize: 8, fontWeight: 700, color: T.text3 }}>Tier</th>
                          <th style={{ textAlign: "right", padding: "6px 4px", fontSize: 8, fontWeight: 700, color: T.text3 }}>{triggerLabel}</th>
                          <th style={{ textAlign: "left", padding: "6px 4px", fontSize: 8, fontWeight: 700, color: T.text3 }}>Gift</th>
                          <th style={{ textAlign: "left", padding: "6px 4px", fontSize: 8, fontWeight: 700, color: T.text3 }}>Description</th>
                          <th style={{ textAlign: "right", padding: "6px 4px", fontSize: 8, fontWeight: 700, color: T.text3 }}>Gift Qty</th>
                          <th style={{ textAlign: "right", padding: "6px 4px", fontSize: 8, fontWeight: 700, color: T.red }}>Cost</th>
                          <th style={{ padding: "6px 2px" }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {tiers.map((tier, i) => (
                          <tr key={tier.id} style={{ borderBottom: `1px solid ${T.border}15` }}>
                            <td style={{ padding: "4px 4px" }}>
                              <input defaultValue={tier.tier_label} onBlur={e => onUpdateGwpTier(tier.id, { tier_label: e.target.value })} style={{ ...inp4, textAlign: "left", padding: "4px 4px" }} />
                            </td>
                            <td style={{ padding: "4px 4px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                                {triggerType === "spend" && <span style={{ fontSize: 9, color: T.text3 }}>$</span>}
                                <FmtInput defaultValue={triggerType === "units" ? (tier.trigger_qty ?? 1) : (tier.min_spend ?? 0)} onBlur={e => onUpdateGwpTier(tier.id, triggerType === "units" ? { trigger_qty: Number(e.target.value) || 1 } : { min_spend: Number(e.target.value) || 0 })} style={{ ...inp4, textAlign: "right", padding: "4px 4px" }} />
                              </div>
                            </td>
                            <td style={{ padding: "4px 4px" }}>
                              <input defaultValue={tier.gift_name || ""} onBlur={e => onUpdateGwpTier(tier.id, { gift_name: e.target.value })} placeholder="e.g. Tote Bag" style={{ ...inp4, textAlign: "left", padding: "4px 4px" }} />
                            </td>
                            <td style={{ padding: "4px 4px" }}>
                              <input defaultValue={tier.gift_description || ""} onBlur={e => onUpdateGwpTier(tier.id, { gift_description: e.target.value })} placeholder="Details" style={{ ...inp4, textAlign: "left", padding: "4px 4px", fontSize: 10 }} />
                            </td>
                            <td style={{ padding: "4px 4px" }}>
                              <FmtInput defaultValue={tier.gift_qty ?? 1} onBlur={e => onUpdateGwpTier(tier.id, { gift_qty: Number(e.target.value) || 1 })} style={{ ...inp4, textAlign: "right", padding: "4px 4px" }} />
                            </td>
                            <td style={{ padding: "4px 4px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 2 }}>
                                <span style={{ fontSize: 9, color: T.text3 }}>$</span>
                                <FmtInput defaultValue={tier.gift_cost ?? 0} onBlur={e => onUpdateGwpTier(tier.id, { gift_cost: Number(e.target.value) || 0 })} style={{ ...inp4, textAlign: "right", padding: "4px 4px" }} />
                              </div>
                            </td>
                            <td style={{ padding: "4px 2px", textAlign: "center" }}>
                              <button onClick={() => onRemoveGwpTier(tier.id)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 10, padding: 2 }}>×</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>);
                  })() : (
                    <div style={{ fontSize: 10, color: T.text3, fontStyle: "italic" }}>No gift tiers configured. Add tiers to define free gifts by unit quantity or spend threshold.</div>
                  )}
                </div>
              </div>
            );
          })()}

          {/* Email — Multi-Send Table */}
          {c === "email" && (() => {
            const sends = emailSends || [];
            const hasSends = sends.length > 0;
            // If legacy single-send data exists and no sends, show migration hint
            const hasLegacy = !hasSends && (ch.email_list_size > 0);
            
            const calcSendUnits = (s) => {
              const sent = (s.list_size || 0) * ((s.send_pct || 100) / 100);
              const opened = sent * ((s.open_rate || 25) / 100);
              const clicked = opened * ((s.click_rate || 3) / 100);
              const converted = clicked * ((s.conversion_rate || 5) / 100);
              return Math.round(converted * (s.units_per_order || 1));
            };
            
            const totalSendUnits = sends.reduce((s, send) => s + calcSendUnits(send), 0);
            
            return <div style={{ gridColumn: "1 / -1" }}>
              {hasLegacy && <div style={{ fontSize: 10, color: T.yellow, marginBottom: 8, padding: "6px 10px", background: T.yellow + "10", borderRadius: 6 }}>
                ⚠ Legacy single-send mode. Click "+ Add Send" to switch to multi-send planning.
              </div>}
              
              {/* Legacy single-send (backward compat) */}
              {!hasSends && <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <I label="Email List Size" value={ch.email_list_size} onChange={v => up("email_list_size", v)} type="number" />
                  <I label="Send % of List" value={ch.email_send_pct} onChange={v => up("email_send_pct", v)} type="number" suffix="%" />
                  <I label="Open Rate" value={ch.email_open_rate} onChange={v => up("email_open_rate", v)} type="number" suffix="%" />
                  <I label="Click Rate" value={ch.email_click_rate} onChange={v => up("email_click_rate", v)} type="number" suffix="%" />
                  <I label="Conversion Rate" value={ch.email_conversion_rate} onChange={v => up("email_conversion_rate", v)} type="number" suffix="%" />
                </div>
              </>}
              
              {/* Multi-send table */}
              {hasSends && (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                      <th style={{ textAlign: "left", padding: "4px 4px", fontSize: 9, fontWeight: 700, color: T.text3 }}>Send</th>
                      <th style={{ textAlign: "right", padding: "4px 4px", fontSize: 9, fontWeight: 700, color: T.text3 }}>List Size</th>
                      <th style={{ textAlign: "right", padding: "4px 4px", fontSize: 9, fontWeight: 700, color: T.text3 }}>Send %</th>
                      <th style={{ textAlign: "right", padding: "4px 4px", fontSize: 9, fontWeight: 700, color: T.text3 }}>Open %</th>
                      <th style={{ textAlign: "right", padding: "4px 4px", fontSize: 9, fontWeight: 700, color: T.text3 }}>Click %</th>
                      <th style={{ textAlign: "right", padding: "4px 4px", fontSize: 9, fontWeight: 700, color: T.text3 }}>CVR %</th>
                      <th style={{ textAlign: "right", padding: "4px 4px", fontSize: 9, fontWeight: 700, color: T.text3 }}>UPO</th>
                      <th style={{ textAlign: "right", padding: "4px 4px", fontSize: 9, fontWeight: 700, color: T.accent }}>Units</th>
                      <th style={{ width: 20 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sends.map((s) => {
                      const sUnits = calcSendUnits(s);
                      const inp2 = { width: "100%", padding: "3px 4px", fontSize: 11, textAlign: "right", border: `1px solid ${T.border}`, borderRadius: 4, background: T.surface2, color: T.text, boxSizing: "border-box" };
                      return (
                        <tr key={s.id} style={{ borderBottom: `1px solid ${T.border}08` }}>
                          <td style={{ padding: "3px 4px" }}>
                            <input defaultValue={s.label} onBlur={e => onUpdateEmailSend(s.id, { label: e.target.value })} style={{ ...inp2, textAlign: "left", width: 70 }} />
                          </td>
                          <td style={{ padding: "3px 2px" }}>
                            <FmtInput defaultValue={s.list_size ?? ""} onBlur={e => onUpdateEmailSend(s.id, { list_size: e.target.value === "" ? null : Number(e.target.value) })} style={inp2} />
                          </td>
                          <td style={{ padding: "3px 2px" }}>
                            <FmtInput defaultValue={s.send_pct ?? 100} onBlur={e => onUpdateEmailSend(s.id, { send_pct: Number(e.target.value) || 100 })} style={{ ...inp2, width: 50 }} />
                          </td>
                          <td style={{ padding: "3px 2px" }}>
                            <FmtInput defaultValue={s.open_rate ?? 25} onBlur={e => onUpdateEmailSend(s.id, { open_rate: Number(e.target.value) || 25 })} style={{ ...inp2, width: 50 }} />
                          </td>
                          <td style={{ padding: "3px 2px" }}>
                            <FmtInput defaultValue={s.click_rate ?? 3} onBlur={e => onUpdateEmailSend(s.id, { click_rate: Number(e.target.value) || 3 })} style={{ ...inp2, width: 50 }} />
                          </td>
                          <td style={{ padding: "3px 2px" }}>
                            <FmtInput defaultValue={s.conversion_rate ?? 5} onBlur={e => onUpdateEmailSend(s.id, { conversion_rate: Number(e.target.value) || 5 })} style={{ ...inp2, width: 50 }} />
                          </td>
                          <td style={{ padding: "3px 2px" }}>
                            <FmtInput defaultValue={s.units_per_order ?? 1} onBlur={e => onUpdateEmailSend(s.id, { units_per_order: Number(e.target.value) || 1 })} style={{ ...inp2, width: 40 }} />
                          </td>
                          <td style={{ padding: "3px 4px", textAlign: "right", fontWeight: 700, color: T.accent, fontSize: 11 }}>{fmt(sUnits)}</td>
                          <td><button onClick={() => onRemoveEmailSend(s.id)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 10, padding: 2 }}>×</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: `2px solid ${T.border}` }}>
                      <td colSpan={7} style={{ padding: "5px 4px", fontWeight: 700, fontSize: 10, color: T.text }}>Total ({sends.length} sends)</td>
                      <td style={{ padding: "5px 4px", textAlign: "right", fontWeight: 800, fontSize: 12, color: T.accent }}>{fmt(totalSendUnits)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              )}
              
              <button onClick={() => onAddEmailSend(ch.id)} style={{ marginTop: 6, padding: "4px 12px", fontSize: 10, fontWeight: 600, border: `1px solid ${T.border}`, borderRadius: 4, background: "transparent", color: T.text3, cursor: "pointer" }}>+ Add Send</button>
            </div>;
          })()}

          {/* SMS — Multi-Send Table (like email but no open rate) */}
          {c === "sms" && (() => {
            const sends = emailSends || [];
            const hasSends = sends.length > 0;
            
            const calcSmsOrders = (s) => {
              const sent = (s.list_size || 0) * ((s.send_pct || 100) / 100);
              const clicked = sent * ((s.click_rate || 8) / 100);
              return Math.round(clicked * ((s.conversion_rate || 5) / 100));
            };
            
            const totalSmsOrders = sends.reduce((s, send) => s + calcSmsOrders(send), 0);
            
            return <div style={{ gridColumn: "1 / -1" }}>
              {/* Legacy single-send (backward compat) */}
              {!hasSends && <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <I label="SMS List Size" value={ch.email_list_size} onChange={v => up("email_list_size", v)} type="number" />
                  <I label="Send % of List" value={ch.email_send_pct} onChange={v => up("email_send_pct", v)} type="number" suffix="%" />
                  <I label="Click Rate" value={ch.email_click_rate} onChange={v => up("email_click_rate", v)} type="number" suffix="%" />
                  <I label="Conversion Rate" value={ch.email_conversion_rate} onChange={v => up("email_conversion_rate", v)} type="number" suffix="%" />
                </div>
              </>}
              
              {/* Multi-send table */}
              {hasSends && (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                      <th style={{ textAlign: "left", padding: "4px 4px", fontSize: 9, fontWeight: 700, color: T.text3 }}>Send</th>
                      <th style={{ textAlign: "right", padding: "4px 4px", fontSize: 9, fontWeight: 700, color: T.text3 }}>List Size</th>
                      <th style={{ textAlign: "right", padding: "4px 4px", fontSize: 9, fontWeight: 700, color: T.text3 }}>Send %</th>
                      <th style={{ textAlign: "right", padding: "4px 4px", fontSize: 9, fontWeight: 700, color: T.text3 }}>Click %</th>
                      <th style={{ textAlign: "right", padding: "4px 4px", fontSize: 9, fontWeight: 700, color: T.text3 }}>CVR %</th>
                      <th style={{ textAlign: "right", padding: "4px 4px", fontSize: 9, fontWeight: 700, color: T.accent }}>Orders</th>
                      <th style={{ width: 20 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sends.map((s) => {
                      const sOrders = calcSmsOrders(s);
                      const inp2 = { width: "100%", padding: "3px 4px", fontSize: 11, textAlign: "right", border: `1px solid ${T.border}`, borderRadius: 4, background: T.surface2, color: T.text, boxSizing: "border-box" };
                      return (
                        <tr key={s.id} style={{ borderBottom: `1px solid ${T.border}08` }}>
                          <td style={{ padding: "3px 4px" }}>
                            <input defaultValue={s.label} onBlur={e => onUpdateEmailSend(s.id, { label: e.target.value })} style={{ ...inp2, textAlign: "left", width: 70 }} />
                          </td>
                          <td style={{ padding: "3px 2px" }}>
                            <FmtInput defaultValue={s.list_size ?? ""} onBlur={e => onUpdateEmailSend(s.id, { list_size: e.target.value === "" ? null : Number(e.target.value) })} style={inp2} />
                          </td>
                          <td style={{ padding: "3px 2px" }}>
                            <FmtInput defaultValue={s.send_pct ?? 100} onBlur={e => onUpdateEmailSend(s.id, { send_pct: Number(e.target.value) || 100 })} style={{ ...inp2, width: 50 }} />
                          </td>
                          <td style={{ padding: "3px 2px" }}>
                            <FmtInput defaultValue={s.click_rate ?? 8} onBlur={e => onUpdateEmailSend(s.id, { click_rate: Number(e.target.value) || 8 })} style={{ ...inp2, width: 50 }} />
                          </td>
                          <td style={{ padding: "3px 2px" }}>
                            <FmtInput defaultValue={s.conversion_rate ?? 5} onBlur={e => onUpdateEmailSend(s.id, { conversion_rate: Number(e.target.value) || 5 })} style={{ ...inp2, width: 50 }} />
                          </td>
                          <td style={{ padding: "3px 4px", textAlign: "right", fontWeight: 700, color: T.accent, fontSize: 11 }}>{fmt(sOrders)}</td>
                          <td><button onClick={() => onRemoveEmailSend(s.id)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 10, padding: 2 }}>×</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: `2px solid ${T.border}` }}>
                      <td colSpan={5} style={{ padding: "5px 4px", fontWeight: 700, fontSize: 10, color: T.text }}>Total ({sends.length} sends)</td>
                      <td style={{ padding: "5px 4px", textAlign: "right", fontWeight: 800, fontSize: 12, color: T.accent }}>{fmt(totalSmsOrders)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              )}
              
              <button onClick={() => onAddEmailSend(ch.id)} style={{ marginTop: 6, padding: "4px 12px", fontSize: 10, fontWeight: 600, border: `1px solid ${T.border}`, borderRadius: 4, background: "transparent", color: T.text3, cursor: "pointer" }}>+ Add Send</button>
            </div>;
          })()}

          {/* Upsell */}
          {c === "upsell" && <>
            <I label="Eligible Orders (period)" value={ch.upsell_eligible_orders} onChange={v => up("upsell_eligible_orders", v)} type="number" />
            <I label="Take Rate" value={ch.upsell_take_rate} onChange={v => up("upsell_take_rate", v)} type="number" suffix="%" />
          </>}

          {/* Free Gift */}
          {c === "free_gift" && <>
            <I label="Tier Spend Threshold" value={ch.free_gift_tier_spend} onChange={v => up("free_gift_tier_spend", v)} type="number" prefix="$" placeholder="e.g. 50" />
            <I label="Eligible Orders" value={ch.free_gift_eligible_orders} onChange={v => up("free_gift_eligible_orders", v)} type="number" />
            <I label="Take Rate" value={ch.free_gift_take_rate} onChange={v => up("free_gift_take_rate", v)} type="number" suffix="%" />
            <I label="Qty per Order" value={ch.free_gift_qty_per_order} onChange={v => up("free_gift_qty_per_order", v)} type="number" />
          </>}

          {/* Amazon */}
          {c === "amazon" && <>
            <I label="Daily Sessions" value={ch.amz_daily_sessions} onChange={v => up("amz_daily_sessions", v)} type="number" />
            <I label="Conversion Rate" value={ch.amz_conversion_rate} onChange={v => up("amz_conversion_rate", v)} type="number" suffix="%" />
            <I label="PPC Daily Budget" value={ch.amz_ppc_budget} onChange={v => up("amz_ppc_budget", v)} type="number" prefix="$" />
            <I label="ACOS Target" value={ch.amz_acos_target} onChange={v => up("amz_acos_target", v)} type="number" suffix="%" />
            <I label="Forecast Weeks" value={ch.forecast_weeks || ch.retail_weeks} onChange={v => up("forecast_weeks", v)} type="number" />
          </>}

          {/* Retail */}
          {c === "retail" && <>
            <I label="Store Count" value={ch.retail_store_count} onChange={v => up("retail_store_count", v)} type="number" />
            <I label="Units/Store/Week" value={ch.retail_units_per_store_per_week} onChange={v => up("retail_units_per_store_per_week", v)} type="number" />
            <I label="Weeks" value={ch.forecast_weeks || ch.retail_weeks} onChange={v => up("forecast_weeks", v)} type="number" />
          </>}

          {/* Organic / Wholesale / Other */}
          {(c === "organic" || c === "wholesale" || c === "other") && <>
            <I label="Est. New Customers" value={ch.estimated_new_customers} onChange={v => up("estimated_new_customers", v)} type="number" />
          </>}
        </div>
      )}

      {/* OTP vs Subscription Split — all channels */}
      <div style={{ marginTop: 8, padding: "8px 12px", background: T.surface3, borderRadius: 6, border: `1px solid ${T.border}` }}>
        <div style={{ fontSize: 9, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Order Type Split</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <I label="OTP (One-Time Purchase) %" value={ch.otp_pct} onChange={v => { up("otp_pct", v); if (v !== null) up("sub_take_rate_pct", 100 - v); }} type="number" suffix="%" small />
          <I label="Subscription %" value={ch.sub_take_rate_pct} onChange={v => { up("sub_take_rate_pct", v); if (v !== null) up("otp_pct", 100 - v); }} type="number" suffix="%" small />
        </div>
      </div>

      {/* Result */}
      <div style={{ marginTop: 8, padding: "8px 12px", background: T.accent + "10", borderRadius: 6, border: `1px solid ${T.accent}20` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <span style={{ fontSize: 11, fontWeight: 600, color: T.accent }}>Estimated Orders</span>
            {(isHalo || isBoth) && <span style={{ fontSize: 9, color: T.text3, marginLeft: 6 }}>
              {isHalo ? `(${ch.halo_pct || 0}% halo)` : `(direct + ${ch.halo_pct || 0}% halo)`}
            </span>}
          </div>
          <span style={{ fontSize: 16, fontWeight: 800, color: T.accent }}>{fmt(units)}</span>
        </div>
        {units > 0 && (
          <div style={{ fontSize: 10, color: T.text3, marginTop: 4, display: "flex", gap: 12 }}>
            <span>🛒 OTP: {fmt(Math.round(units * ((ch.otp_pct || 30) / 100)))}</span>
            <span>🔄 Sub: {fmt(Math.round(units * ((ch.sub_take_rate_pct || 70) / 100)))}</span>
          </div>
        )}
        {isBoth && haloUnits > 0 && (
          <div style={{ fontSize: 10, color: T.text3, marginTop: 4, display: "flex", gap: 12 }}>
            <span>📱 Direct: {fmt(units - haloUnits)}</span>
            <span>🌊 Halo: {fmt(haloUnits)}</span>
          </div>
        )}
      </div>

      {/* Variant / Pack-Size Allocation — available on any channel */}
      {(() => {
        const splits = variantSplits || [];
        const totalPct = splits.reduce((s, v) => s + (v.take_rate_pct || 0), 0);
        const pctWarning = splits.length > 0 && Math.abs(totalPct - 100) > 0.5;
        const colors = ["#94a3b8", "#3b82f6", "#8b5cf6", "#22c55e", "#f59e0b", "#ef4444"];
        const totalOrders = units;
        
        return (
          <div style={{ marginTop: 10, padding: "10px 12px", background: "#8b5cf608", borderRadius: 8, border: `1px solid #8b5cf615` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#8b5cf6" }}>📦 Variant / Pack-Size Allocation</div>
              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                {/* Copy from another channel */}
                {(() => {
                  const otherChannelsWithVariants = (allChannels || []).filter(oc => oc.id !== ch.id && (allVariantSplits || []).some(v => v.channel_id === oc.id));
                  if (otherChannelsWithVariants.length === 0) return null;
                  return (
                    <select value="" onChange={e => { if (e.target.value) onCopyVariantsFrom(ch.id, e.target.value); }}
                      style={{ padding: "2px 6px", fontSize: 9, fontWeight: 600, border: `1px solid #8b5cf630`, borderRadius: 4, background: "transparent", color: "#8b5cf6", cursor: "pointer", appearance: "auto" }}>
                      <option value="" disabled>📋 Copy from…</option>
                      {otherChannelsWithVariants.map(oc => {
                        const def = CHANNEL_DEFS.find(d => d.key === oc.channel);
                        const count = (allVariantSplits || []).filter(v => v.channel_id === oc.id).length;
                        return <option key={oc.id} value={oc.id}>{def?.icon || ""} {oc.label || def?.label} ({count} variants)</option>;
                      })}
                    </select>
                  );
                })()}
                {splits.length === 0 && (
                  <button onClick={() => onInitDefaultVariants(ch.id)} style={{ padding: "3px 10px", fontSize: 9, fontWeight: 600, border: `1px solid #8b5cf630`, borderRadius: 4, background: "#8b5cf610", color: "#8b5cf6", cursor: "pointer" }}>Load Defaults</button>
                )}
                <button onClick={() => onAddVariantSplit(ch.id)} style={{ padding: "3px 10px", fontSize: 9, fontWeight: 600, border: `1px solid #8b5cf630`, borderRadius: 4, background: "transparent", color: "#8b5cf6", cursor: "pointer" }}>+ Add</button>
              </div>
            </div>
            
            {splits.length > 0 && (
              <>
                {/* Visual bar */}
                <div style={{ display: "flex", height: 8, borderRadius: 4, overflow: "hidden", marginBottom: 8 }}>
                  {splits.map((v, i) => (
                    <div key={v.id} style={{ width: `${v.take_rate_pct || 0}%`, background: colors[i % colors.length], transition: "width 0.3s" }} />
                  ))}
                </div>
                
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, tableLayout: "fixed" }}>
                  <colgroup>
                    <col style={{ width: "20%" }} />
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "6%" }} />
                    <col style={{ width: "6%" }} />
                  </colgroup>
                  <thead>
                    <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                      <th style={{ textAlign: "left", padding: "6px 4px", fontSize: 8, fontWeight: 700, color: T.text3 }}>Variant</th>
                      <th style={{ textAlign: "right", padding: "6px 4px", fontSize: 8, fontWeight: 700, color: T.text3 }}>Qty</th>
                      <th style={{ textAlign: "right", padding: "6px 4px", fontSize: 8, fontWeight: 700, color: T.text3 }}>Take %</th>
                      <th style={{ textAlign: "right", padding: "6px 4px", fontSize: 8, fontWeight: 700, color: T.text3 }}>OTP Price</th>
                      <th style={{ textAlign: "right", padding: "6px 4px", fontSize: 8, fontWeight: 700, color: T.text3 }}>Sub Price</th>
                      <th style={{ textAlign: "right", padding: "6px 4px", fontSize: 8, fontWeight: 700, color: T.text3 }}>Orders</th>
                      <th style={{ textAlign: "right", padding: "6px 4px", fontSize: 8, fontWeight: 700, color: T.accent }}>Units</th>
                      <th style={{ textAlign: "right", padding: "6px 4px", fontSize: 8, fontWeight: 700, color: T.green }}>Rev</th>
                      <th style={{ padding: "6px 2px" }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {splits.map((v, i) => {
                      const vOrders = Math.round(totalOrders * ((v.take_rate_pct || 0) / 100));
                      const vUnits = Math.round(vOrders * (v.units_per_variant || 1));
                      const otpOrders = Math.round(vOrders * ((ch.otp_pct || 30) / 100));
                      const subOrders = vOrders - otpOrders;
                      const otpRev = otpOrders * (v.first_purchase_price || 0);
                      const subRev = subOrders * (v.subscription_price || 0);
                      const vRev = otpRev + subRev;
                      const inp3 = { width: "100%", padding: "4px 4px", fontSize: 11, textAlign: "right", border: `1px solid ${T.border}`, borderRadius: 4, background: T.surface2, color: T.text, boxSizing: "border-box" };
                      return (
                        <tr key={v.id} style={{ borderBottom: `1px solid ${T.border}15` }}>
                          <td style={{ padding: "4px 4px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                              <span style={{ width: 6, height: 6, borderRadius: 2, background: colors[i % colors.length], flexShrink: 0 }} />
                              <input defaultValue={v.variant_label} onBlur={e => onUpdateVariantSplit(v.id, { variant_label: e.target.value })} style={{ ...inp3, textAlign: "left" }} />
                            </div>
                          </td>
                          <td style={{ padding: "4px 4px" }}>
                            <FmtInput defaultValue={v.units_per_variant ?? 1} onBlur={e => onUpdateVariantSplit(v.id, { units_per_variant: Number(e.target.value) || 1 })} style={inp3} />
                          </td>
                          <td style={{ padding: "4px 4px" }}>
                            <FmtInput defaultValue={v.take_rate_pct ?? 25} onBlur={e => onUpdateVariantSplit(v.id, { take_rate_pct: Number(e.target.value) || 0 })} style={inp3} />
                          </td>
                          <td style={{ padding: "4px 4px" }}>
                            <FmtInput defaultValue={v.first_purchase_price ?? ""} onBlur={e => onUpdateVariantSplit(v.id, { first_purchase_price: e.target.value === "" ? null : Number(e.target.value) })} style={inp3} />
                          </td>
                          <td style={{ padding: "4px 4px" }}>
                            <FmtInput defaultValue={v.subscription_price ?? ""} onBlur={e => onUpdateVariantSplit(v.id, { subscription_price: e.target.value === "" ? null : Number(e.target.value) })} style={inp3} />
                          </td>
                          <td style={{ padding: "4px 4px", textAlign: "right", fontSize: 10, color: T.text2 }}>{totalOrders > 0 ? fmt(vOrders) : "—"}</td>
                          <td style={{ padding: "4px 4px", textAlign: "right", fontWeight: 700, fontSize: 10, color: colors[i % colors.length] }}>{totalOrders > 0 ? fmt(vUnits) : "—"}</td>
                          <td style={{ padding: "4px 4px", textAlign: "right", fontSize: 9, color: T.green }}>{vRev > 0 ? `$${fmt(Math.round(vRev))}` : "—"}</td>
                          <td style={{ padding: "4px 2px", textAlign: "center" }}><button onClick={() => onRemoveVariantSplit(v.id)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 10, padding: 2 }}>×</button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: `2px solid ${T.border}` }}>
                      <td style={{ padding: "6px 4px", fontWeight: 700, fontSize: 10, color: T.text }}>Total</td>
                      <td style={{ padding: "6px 4px" }}></td>
                      <td style={{ padding: "6px 4px", textAlign: "right", fontWeight: 700, fontSize: 10, color: pctWarning ? T.red : T.text }}>{totalPct.toFixed(0)}%{pctWarning ? " ⚠" : ""}</td>
                      <td style={{ padding: "6px 4px" }}></td>
                      <td style={{ padding: "6px 4px" }}></td>
                      <td style={{ padding: "6px 4px", textAlign: "right", fontWeight: 600, fontSize: 10, color: T.text2 }}>{totalOrders > 0 ? fmt(totalOrders) : "—"}</td>
                      <td style={{ padding: "6px 4px", textAlign: "right", fontWeight: 800, fontSize: 11, color: T.accent }}>
                        {totalOrders > 0 ? fmt(splits.reduce((s, v) => {
                          const vOrders = Math.round(totalOrders * ((v.take_rate_pct || 0) / 100));
                          return s + Math.round(vOrders * (v.units_per_variant || 1));
                        }, 0)) : "—"}
                      </td>
                      <td style={{ padding: "6px 4px", textAlign: "right", fontWeight: 700, fontSize: 10, color: T.green }}>
                        {totalOrders > 0 ? "$" + fmt(Math.round(splits.reduce((s, v) => {
                          const vOrders = Math.round(totalOrders * ((v.take_rate_pct || 0) / 100));
                          const otpO = Math.round(vOrders * ((ch.otp_pct || 30) / 100));
                          return s + otpO * (v.first_purchase_price || 0) + (vOrders - otpO) * (v.subscription_price || 0);
                        }, 0))) : "—"}
                      </td>
                      <td style={{ padding: "6px 2px" }}></td>
                    </tr>
                  </tfoot>
                </table>
                {pctWarning && <div style={{ fontSize: 9, color: T.red, marginTop: 4 }}>⚠ Take rates sum to {totalPct.toFixed(0)}% — should total 100%</div>}
                {totalOrders === 0 && splits.length > 0 && <div style={{ fontSize: 9, color: T.text3, marginTop: 4, fontStyle: "italic" }}>Fill in the demand model above to see order/unit projections per variant.</div>}
              </>
            )}
            
            {splits.length === 0 && <div style={{ fontSize: 10, color: T.text3, fontStyle: "italic" }}>No variants configured. Add variants to allocate demand across pack sizes (e.g. 1-Pack, 2-Pack, 4-Pack).</div>}
          </div>
        );
      })()}

      {/* Subscription & Reorder — Rebill Rate Model */}
      <div style={{ marginTop: 10, padding: "10px 12px", background: "#0ea5e908", borderRadius: 8, border: `1px solid #0ea5e915` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#0ea5e9" }}>🔄 Rebill / Reorder Curve</div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <div style={{ display: "flex", gap: 2, background: T.surface3, borderRadius: 4, padding: 2 }}>
              {[{ v: "global", l: "All Variants" }, { v: "per_variant", l: "Per Variant" }].map(opt => {
                const active = (ch.reorder_mode || "global") === opt.v;
                return <button key={opt.v} onClick={() => up("reorder_mode", opt.v)}
                  style={{ padding: "2px 8px", fontSize: 9, fontWeight: 600, borderRadius: 3, border: "none", background: active ? "#0ea5e920" : "transparent", color: active ? "#0ea5e9" : T.text3, cursor: "pointer" }}>{opt.l}</button>;
              })}
            </div>
            {(() => {
              const otherCh = (allChannels || []).filter(oc => oc.id !== ch.id);
              if (otherCh.length === 0) return null;
              return (
                <select value="" onChange={e => {
                  const srcId = e.target.value;
                  if (!srcId) return;
                  const src = allChannels.find(oc => oc.id === srcId);
                  if (!src) return;
                  const srcRates = Array.isArray(src.rebill_rates) ? src.rebill_rates : [52, 21, 15, 12, 10, 8];
                  onUpdateChannel(ch.id, {
                    rebill_rates: srcRates,
                    otp_reorder_rate: src.otp_reorder_rate ?? 10,
                    reorder_mode: src.reorder_mode || "global",
                  });
                  // If per-variant mode, also copy variant-level rebill rates
                  if ((src.reorder_mode || "global") === "per_variant") {
                    const srcVariants = (allVariantSplits || []).filter(v => v.channel_id === srcId);
                    const myVariants = variantSplits || [];
                    myVariants.forEach((mv, i) => {
                      const sv = srcVariants.find(sv => sv.variant_label === mv.variant_label) || srcVariants[i];
                      if (sv && sv.rebill_rates) {
                        onUpdateVariantSplit(mv.id, { rebill_rates: sv.rebill_rates });
                      }
                    });
                  }
                }}
                  style={{ padding: "2px 6px", fontSize: 9, fontWeight: 600, border: `1px solid #0ea5e930`, borderRadius: 4, background: "transparent", color: "#0ea5e9", cursor: "pointer" }}>
                  <option value="" disabled>📋 Copy from…</option>
                  {otherCh.map(oc => {
                    const def = CHANNEL_DEFS.find(d => d.key === oc.channel);
                    return <option key={oc.id} value={oc.id}>{def?.icon || ""} {oc.label || def?.label}</option>;
                  })}
                </select>
              );
            })()}
          </div>
        </div>

        <div style={{ fontSize: 9, color: T.text3, marginBottom: 8, lineHeight: 1.5 }}>
          Each rebill % is based on the <strong>original cohort size</strong>. E.g. if cohort = 2,000 and Rebill 1 = 52%, that's 1,040 rebill orders.
        </div>

        {(ch.reorder_mode || "global") === "global" ? (() => {
          const rates = Array.isArray(ch.rebill_rates) ? ch.rebill_rates : [52, 21, 15, 12, 10, 8];
          const ratesKey = JSON.stringify(rates);
          const subOrders = Math.round(units * ((ch.sub_take_rate_pct || 70) / 100));
          const inp6 = { padding: "3px 4px", fontSize: 11, textAlign: "right", border: `1px solid ${T.border}`, borderRadius: 4, background: T.surface2, color: T.text, boxSizing: "border-box", width: "100%" };
          return (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
                <I label="OTP Reorder Rate (% of OTP who rebuy)" value={ch.otp_reorder_rate} onChange={v => up("otp_reorder_rate", v)} type="number" suffix="%" small />
              </div>
              <table key={ratesKey} style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                <thead>
                  <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                    <th style={{ textAlign: "left", padding: "4px 6px", fontSize: 9, fontWeight: 700, color: T.text3 }}>Rebill #</th>
                    <th style={{ textAlign: "right", padding: "4px 6px", fontSize: 9, fontWeight: 700, color: T.text3 }}>Rate %</th>
                    <th style={{ textAlign: "right", padding: "4px 6px", fontSize: 9, fontWeight: 700, color: "#0ea5e9" }}>Orders</th>
                    <th style={{ width: 20 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {rates.map((rate, i) => {
                    const rebillOrders = subOrders > 0 ? Math.round(subOrders * (rate / 100)) : 0;
                    return (
                      <tr key={`${i}-${rate}`} style={{ borderBottom: `1px solid ${T.border}10` }}>
                        <td style={{ padding: "3px 6px", fontSize: 10, fontWeight: 600, color: T.text2 }}>Rebill {i + 1}</td>
                        <td style={{ padding: "3px 6px", width: 70 }}>
                          <FmtInput defaultValue={rate} onBlur={e => { const newRates = [...rates]; newRates[i] = Number(e.target.value) || 0; up("rebill_rates", newRates); }} style={inp6} />
                        </td>
                        <td style={{ padding: "3px 6px", textAlign: "right", fontWeight: 600, fontSize: 10, color: "#0ea5e9" }}>{subOrders > 0 ? fmt(rebillOrders) : "—"}</td>
                        <td style={{ padding: "3px 2px" }}>
                          {rates.length > 1 && <button onClick={() => { const newRates = rates.filter((_, j) => j !== i); up("rebill_rates", newRates); }} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 10, padding: 2 }}>×</button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: `2px solid ${T.border}` }}>
                    <td style={{ padding: "5px 6px", fontWeight: 700, fontSize: 10, color: T.text }}>Total Rebills</td>
                    <td style={{ padding: "5px 6px", textAlign: "right", fontSize: 9, color: T.text3 }}>{rates.reduce((s, r) => s + r, 0)}% cum.</td>
                    <td style={{ padding: "5px 6px", textAlign: "right", fontWeight: 800, fontSize: 12, color: "#0ea5e9" }}>{subOrders > 0 ? fmt(rates.reduce((s, r) => s + Math.round(subOrders * (r / 100)), 0)) : "—"}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
              <button onClick={() => { const newRates = [...rates, Math.max(2, Math.round((rates[rates.length - 1] || 10) * 0.8))]; up("rebill_rates", newRates); }}
                style={{ marginTop: 4, padding: "3px 10px", fontSize: 9, fontWeight: 600, border: `1px solid #0ea5e930`, borderRadius: 4, background: "transparent", color: "#0ea5e9", cursor: "pointer" }}>+ Add Rebill</button>
              {subOrders > 0 && <div style={{ marginTop: 6, fontSize: 9, color: T.text3 }}>Sub cohort: {fmt(subOrders)} orders → {fmt(rates.reduce((s, r) => s + Math.round(subOrders * (r / 100)), 0))} total rebill orders over {rates.length} cycles</div>}
            </div>
          );
        })() : (
          /* Per-variant rebill rates */
          <div>
            <div style={{ fontSize: 9, color: T.text3, marginBottom: 6 }}>Set rebill curve per variant. Each variant can have different retention behavior.</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 8 }}>
              <I label="OTP Reorder Rate" value={ch.otp_reorder_rate} onChange={v => up("otp_reorder_rate", v)} type="number" suffix="%" small />
            </div>
            {(variantSplits || []).length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {(variantSplits || []).map(v => {
                  const vRates = Array.isArray(v.rebill_rates) ? v.rebill_rates : (Array.isArray(ch.rebill_rates) ? ch.rebill_rates : [52, 21, 15, 12, 10, 8]);
                  const vOrders = units > 0 ? Math.round(units * ((v.take_rate_pct || 0) / 100) * ((ch.sub_take_rate_pct || 70) / 100)) : 0;
                  const inp6 = { padding: "2px 4px", fontSize: 10, textAlign: "right", border: `1px solid ${T.border}`, borderRadius: 4, background: T.surface2, color: T.text, boxSizing: "border-box", width: 45 };
                  const totalRebill = vRates.reduce((s, r) => s + Math.round(vOrders * (r / 100)), 0);
                  return (
                    <div key={v.id} style={{ background: T.surface2, borderRadius: 6, padding: "6px 8px", border: `1px solid ${T.border}` }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: T.text }}>{v.variant_label}</span>
                        <span style={{ fontSize: 9, color: T.text3 }}>Cohort: {fmt(vOrders)} sub orders → {fmt(totalRebill)} rebills</span>
                      </div>
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                        {vRates.map((rate, i) => (
                          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
                            <span style={{ fontSize: 7, color: T.text3 }}>R{i + 1}</span>
                            <FmtInput defaultValue={rate} onBlur={e => { const nr = [...vRates]; nr[i] = Number(e.target.value) || 0; onUpdateVariantSplit(v.id, { rebill_rates: nr }); }} style={inp6} />
                            <span style={{ fontSize: 7, color: "#0ea5e9" }}>{vOrders > 0 ? fmt(Math.round(vOrders * (rate / 100))) : "—"}</span>
                          </div>
                        ))}
                        <button onClick={() => { const nr = [...vRates, Math.max(2, Math.round((vRates[vRates.length - 1] || 10) * 0.8))]; onUpdateVariantSplit(v.id, { rebill_rates: nr }); }}
                          style={{ padding: "2px 6px", fontSize: 8, border: `1px solid ${T.border}`, borderRadius: 3, background: "transparent", color: T.text3, cursor: "pointer", alignSelf: "center" }}>+</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ fontSize: 10, color: T.text3, fontStyle: "italic" }}>Add variants above to set per-variant rebill rates.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RebillRatesEditor — separate OTP and Sub rebill rate tables for any scope
// (used both for the main GWP funnel and for individual upsells with custom rates)
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// MarketingChannelsSection — per-channel, per-period acquisition driver inputs
// Each launch can have multiple marketing channels (Email, SMS, Paid Ads, etc.)
// Each channel has period inputs (W1, W2, ... or M1, M2, ...) configured by type.
// ─────────────────────────────────────────────────────────────────────────────
function MarketingChannelsSection({ launch, launchMarketingChannels, launchMarketingPeriods, updateLaunch, addMarketingChannel, updateMarketingChannel, deleteMarketingChannel, upsertMarketingPeriod, T, isMobile }) {
  const periodType = launch.period_type || "week";
  const periodCount = parseInt(launch.forecast_periods) || 12;
  const periodLabel = periodType === "month" ? "M" : "W";
  const periods = Array.from({ length: periodCount }, (_, i) => i + 1);

  // Sum orders across all marketing channels & periods (for footer)
  const totalOrders = launchMarketingChannels.reduce((sum, ch) => {
    const cps = launchMarketingPeriods.filter(mp => mp.marketing_channel_id === ch.id);
    return sum + cps.reduce((s, p) => s + calcMarketingPeriodOrders(ch.channel_type, p), 0);
  }, 0);
  const totalSpend = launchMarketingChannels.reduce((sum, ch) => {
    const cps = launchMarketingPeriods.filter(mp => mp.marketing_channel_id === ch.id);
    return sum + cps.reduce((s, p) => s + (parseFloat(p.spend) || 0), 0);
  }, 0);
  const blendedCpa = totalOrders > 0 ? totalSpend / totalOrders : 0;

  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 16, marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>📣 Marketing Channels</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ fontSize: 10, color: T.text3 }}>Period:</div>
          <div style={{ display: "flex", border: `1px solid ${T.border}`, borderRadius: 5, overflow: "hidden" }}>
            {["week", "month"].map(pt => (
              <button key={pt} onClick={() => updateLaunch(launch.id, "period_type", pt)}
                style={{ padding: "4px 12px", fontSize: 10, fontWeight: 600, background: periodType === pt ? T.accent : "transparent", color: periodType === pt ? "#fff" : T.text3, border: "none", cursor: "pointer", textTransform: "capitalize" }}>
                {pt}ly
              </button>
            ))}
          </div>
          <div style={{ fontSize: 10, color: T.text3 }}>×</div>
          <input type="number" value={periodCount} min={1} max={52}
            onChange={e => updateLaunch(launch.id, "forecast_periods", Math.max(1, Math.min(52, parseInt(e.target.value) || 1)))}
            style={{ width: 60, padding: "4px 6px", fontSize: 11, border: `1px solid ${T.border}`, borderRadius: 5, background: T.surface, color: T.text, outline: "none", textAlign: "center" }} />
        </div>
      </div>
      <div style={{ fontSize: 11, color: T.text3, marginBottom: 12, lineHeight: 1.5 }}>
        Add channels and define spend, conversion, or send/CTR/conv per period. Orders flow into the Acquisition Funnel below.
      </div>

      {/* Add channel buttons */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {MARKETING_TYPES.map(mt => (
          <button key={mt.key} onClick={() => addMarketingChannel(launch.id, mt.key, mt.label)}
            title={mt.desc}
            style={{ padding: "5px 11px", fontSize: 11, fontWeight: 600, borderRadius: 6, border: `1px solid ${mt.color}40`, background: mt.color + "10", color: mt.color, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
            <span>{mt.icon}</span> + {mt.label}
          </button>
        ))}
      </div>

      {launchMarketingChannels.length === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: T.text3, fontSize: 11, fontStyle: "italic", border: `1px dashed ${T.border}`, borderRadius: 8 }}>
          No marketing channels yet. Click a channel type above to add one.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {launchMarketingChannels.map(ch => (
            <MarketingChannelRow
              key={ch.id}
              channel={ch}
              periods={periods}
              periodLabel={periodLabel}
              launchPeriods={launchMarketingPeriods.filter(mp => mp.marketing_channel_id === ch.id)}
              updateMarketingChannel={updateMarketingChannel}
              deleteMarketingChannel={deleteMarketingChannel}
              upsertMarketingPeriod={(periodIndex, updates) => upsertMarketingPeriod(launch.id, ch.id, periodIndex, updates)}
              T={T}
              isMobile={isMobile}
            />
          ))}
        </div>
      )}

      {/* Footer summary */}
      {launchMarketingChannels.length > 0 && (
        <div style={{ marginTop: 14, padding: 12, background: T.accent + "08", border: `1px solid ${T.accent}30`, borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: T.text2 }}>Total across all marketing channels:</div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
            <div><span style={{ fontSize: 10, color: T.text3 }}>Spend: </span><span style={{ fontSize: 14, fontWeight: 800, color: T.text }}>${fmt(Math.round(totalSpend))}</span></div>
            <div><span style={{ fontSize: 10, color: T.text3 }}>Orders: </span><span style={{ fontSize: 14, fontWeight: 800, color: T.accent }}>{fmt(totalOrders)}</span></div>
            <div><span style={{ fontSize: 10, color: T.text3 }}>Blended CPA: </span><span style={{ fontSize: 14, fontWeight: 800, color: "#f59e0b" }}>${blendedCpa > 0 ? blendedCpa.toFixed(2) : "—"}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}

function MarketingChannelRow({ channel, periods, periodLabel, launchPeriods, updateMarketingChannel, deleteMarketingChannel, upsertMarketingPeriod, T, isMobile }) {
  const def = MARKETING_TYPES.find(m => m.key === channel.channel_type) || MARKETING_TYPES[5];
  const inputs = def.inputs;

  // Map periods by index for quick lookup
  const byIdx = {};
  launchPeriods.forEach(p => { byIdx[p.period_index] = p; });

  // Sum across periods for footer
  const channelOrders = periods.reduce((s, idx) => s + calcMarketingPeriodOrders(channel.channel_type, byIdx[idx]), 0);
  const channelSpend = periods.reduce((s, idx) => s + (parseFloat(byIdx[idx]?.spend) || 0), 0);

  // Each input row needs a label + display props
  const inputRow = (key) => {
    const labels = {
      spend: { label: "Spend", prefix: "$", step: 100, type: "spend" },
      cpa: { label: "Target CPA", prefix: "$", step: 1, type: "cpa" },
      sends: { label: "Sends", suffix: "", step: 1000, type: "count" },
      open_rate_pct: { label: "Open Rate", suffix: "%", step: 1, type: "pct" },
      ctr_pct: { label: "CTR", suffix: "%", step: 0.1, type: "pct" },
      conversion_rate_pct: { label: "Conv Rate", suffix: "%", step: 0.1, type: "pct" },
      direct_orders: { label: "Direct Orders", suffix: "", step: 100, type: "count" },
    };
    return labels[key];
  };

  return (
    <div style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, padding: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
          <span style={{ fontSize: 18 }}>{def.icon}</span>
          <input value={channel.name || ""} onChange={e => updateMarketingChannel(channel.id, { name: e.target.value })}
            placeholder={def.label}
            style={{ flex: 1, fontSize: 13, fontWeight: 700, color: T.text, background: "transparent", border: "none", outline: "none", padding: "2px 0" }} />
          <span style={{ fontSize: 9, fontWeight: 600, color: def.color, textTransform: "uppercase", padding: "2px 6px", background: def.color + "15", borderRadius: 4 }}>{def.label}</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 10, color: T.text3 }}>
            {channelSpend > 0 && <span>Spend: <strong style={{ color: T.text }}>${fmt(Math.round(channelSpend))}</strong> · </span>}
            Orders: <strong style={{ color: def.color }}>{fmt(channelOrders)}</strong>
          </div>
          <button onClick={() => deleteMarketingChannel(channel.id)} title="Remove channel"
            style={{ background: "transparent", border: "none", color: T.text3, cursor: "pointer", fontSize: 14, padding: "0 4px" }}>×</button>
        </div>
      </div>

      {/* Period table — periods as columns, input metrics as rows */}
      <div style={{ overflowX: "auto", border: `1px solid ${T.border}`, borderRadius: 6 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, minWidth: periods.length * 60 + 120 }}>
          <thead>
            <tr style={{ background: T.surface }}>
              <th style={{ padding: "6px 8px", textAlign: "left", fontWeight: 700, color: T.text3, fontSize: 10, borderBottom: `1px solid ${T.border}`, position: "sticky", left: 0, background: T.surface, zIndex: 1, minWidth: 110 }}>Metric</th>
              {periods.map(idx => (
                <th key={idx} style={{ padding: "6px 4px", textAlign: "center", fontWeight: 700, color: T.text3, fontSize: 10, borderBottom: `1px solid ${T.border}`, minWidth: 60 }}>{periodLabel}{idx}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {inputs.map(key => {
              const ir = inputRow(key);
              if (!ir) return null;
              return (
                <tr key={key}>
                  <td style={{ padding: "6px 8px", color: T.text2, fontWeight: 600, borderBottom: `1px solid ${T.border}`, position: "sticky", left: 0, background: T.surface2, zIndex: 1 }}>
                    {ir.label}{ir.suffix ? ` (${ir.suffix})` : ""}{ir.prefix ? ` (${ir.prefix})` : ""}
                  </td>
                  {periods.map(idx => {
                    const p = byIdx[idx] || {};
                    return (
                      <td key={idx} style={{ padding: "3px 2px", textAlign: "center", borderBottom: `1px solid ${T.border}` }}>
                        <FmtInput
                          defaultValue={p[key] ?? ""}
                          onBlur={e => {
                            const val = e.target.value;
                            const parsed = val === "" ? null : (ir.type === "count" ? parseInt(val) : parseFloat(val));
                            upsertMarketingPeriod(idx, { [key]: parsed });
                          }}
                          style={{
                            width: "100%", padding: "4px 2px", fontSize: 11, textAlign: "center",
                            border: `1px solid ${T.border}`, borderRadius: 3, background: T.surface,
                            color: T.text, outline: "none",
                          }}
                        />
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {/* Computed orders row (read-only) */}
            <tr style={{ background: def.color + "08" }}>
              <td style={{ padding: "6px 8px", color: def.color, fontWeight: 700, position: "sticky", left: 0, background: T.surface2, zIndex: 1 }}>Orders →</td>
              {periods.map(idx => {
                const orders = calcMarketingPeriodOrders(channel.channel_type, byIdx[idx]);
                return (
                  <td key={idx} style={{ padding: "6px 4px", textAlign: "center", color: def.color, fontWeight: 700, fontSize: 11 }}>
                    {orders > 0 ? fmt(orders) : "—"}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// GeographySection — toggle/% UI for AU/CA/UK/US + add custom geo
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_GEOS = [
  { code: "US", label: "United States" },
  { code: "CA", label: "Canada" },
  { code: "UK", label: "United Kingdom" },
  { code: "AU", label: "Australia" },
];

function GeographySection({ launchId, launchGeoSplit, totalAcquisitionOrders, upsertGeo, deleteGeo, T, isMobile }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newCode, setNewCode] = useState("");
  const [newLabel, setNewLabel] = useState("");

  // Merge defaults with stored — defaults always show as toggleable rows even if disabled
  const stored = launchGeoSplit;
  const defaultRows = DEFAULT_GEOS.map(g => {
    const s = stored.find(x => x.geo_code === g.code);
    return s || { geo_code: g.code, geo_label: g.label, pct: 0, enabled: false, _default: true };
  });
  const customRows = stored.filter(s => !DEFAULT_GEOS.some(g => g.code === s.geo_code));

  const enabledRows = [...defaultRows.filter(g => g.enabled), ...customRows.filter(g => g.enabled)];
  const totalPct = enabledRows.reduce((s, g) => s + (parseFloat(g.pct) || 0), 0);
  const sumOk = Math.abs(totalPct - 100) < 0.01;

  const toggleGeo = (geoCode, geoLabel, currentEnabled, currentPct) => {
    upsertGeo(launchId, geoCode, { geo_label: geoLabel, enabled: !currentEnabled, pct: currentPct || 0 });
  };
  const updatePct = (geoCode, geoLabel, val) => {
    const pct = Math.max(0, Math.min(100, parseFloat(val) || 0));
    upsertGeo(launchId, geoCode, { geo_label: geoLabel, pct, enabled: true });
  };
  const addCustomGeo = () => {
    if (!newCode.trim()) return;
    upsertGeo(launchId, newCode.toUpperCase().trim(), { geo_label: newLabel.trim() || newCode.toUpperCase().trim(), pct: 0, enabled: true });
    setNewCode(""); setNewLabel(""); setShowAdd(false);
  };
  const rebalance = () => {
    // Auto-redistribute equally across enabled rows
    const enabled = [...defaultRows.filter(g => g.enabled), ...customRows];
    if (enabled.length === 0) return;
    const each = Math.floor(10000 / enabled.length) / 100; // 2 decimal places
    enabled.forEach((g, i) => {
      const pct = i === enabled.length - 1 ? Math.round((100 - each * (enabled.length - 1)) * 100) / 100 : each;
      upsertGeo(launchId, g.geo_code, { geo_label: g.geo_label, pct, enabled: true });
    });
  };

  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 16, marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>🌍 Geography Distribution</div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <div style={{ padding: "3px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600, background: sumOk ? "#22c55e15" : "#ef444415", color: sumOk ? "#22c55e" : "#ef4444" }}>
            Total: {totalPct.toFixed(2)}% {sumOk ? "✓" : "✗"}
          </div>
          <button onClick={rebalance} title="Rebalance enabled geos to equal split"
            style={{ padding: "3px 8px", fontSize: 10, fontWeight: 600, background: "transparent", color: T.text2, border: `1px solid ${T.border}`, borderRadius: 5, cursor: "pointer" }}>⚖️ Rebalance</button>
        </div>
      </div>
      <div style={{ fontSize: 11, color: T.text3, marginBottom: 12, lineHeight: 1.5 }}>
        Set the % of total demand allocated to each market. Used by the demand-by-geography report below.
      </div>

      {/* Default geos row */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,1fr)", gap: 8, marginBottom: 10 }}>
        {defaultRows.map(g => {
          const orders = Math.round(totalAcquisitionOrders * (parseFloat(g.pct) || 0) / 100);
          return (
            <div key={g.geo_code} style={{ padding: 10, background: g.enabled ? T.accent + "08" : T.surface2, border: `1px solid ${g.enabled ? T.accent + "40" : T.border}`, borderRadius: 8 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 700, color: T.text, cursor: "pointer", marginBottom: 6 }}>
                <input type="checkbox" checked={!!g.enabled} onChange={() => toggleGeo(g.geo_code, g.geo_label, g.enabled, g.pct)} />
                {g.geo_code} <span style={{ fontSize: 10, color: T.text3, fontWeight: 400 }}>{g.geo_label}</span>
              </label>
              {g.enabled && (
                <>
                  <input type="number" value={g.pct ?? 0}
                    onChange={e => updatePct(g.geo_code, g.geo_label, e.target.value)}
                    style={{ width: "100%", padding: "4px 6px", fontSize: 12, border: `1px solid ${T.border}`, borderRadius: 4, background: T.surface, color: T.text, outline: "none", textAlign: "right" }}
                  />
                  <div style={{ fontSize: 9, color: T.text3, marginTop: 3, textAlign: "right" }}>{fmt(orders)} orders</div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Custom geos */}
      {customRows.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", marginBottom: 6 }}>Custom Geos</div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4,1fr)", gap: 8 }}>
            {customRows.map(g => {
              const orders = Math.round(totalAcquisitionOrders * (parseFloat(g.pct) || 0) / 100);
              return (
                <div key={g.geo_code} style={{ padding: 10, background: T.accent + "08", border: `1px solid ${T.accent}40`, borderRadius: 8, position: "relative" }}>
                  <button onClick={() => deleteGeo(g.id)} title="Remove" style={{ position: "absolute", top: 4, right: 6, background: "transparent", border: "none", color: T.text3, cursor: "pointer", fontSize: 14 }}>×</button>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 6 }}>{g.geo_code} <span style={{ fontSize: 10, color: T.text3, fontWeight: 400 }}>{g.geo_label}</span></div>
                  <input type="number" value={g.pct ?? 0}
                    onChange={e => updatePct(g.geo_code, g.geo_label, e.target.value)}
                    style={{ width: "100%", padding: "4px 6px", fontSize: 12, border: `1px solid ${T.border}`, borderRadius: 4, background: T.surface, color: T.text, outline: "none", textAlign: "right" }}
                  />
                  <div style={{ fontSize: 9, color: T.text3, marginTop: 3, textAlign: "right" }}>{fmt(orders)} orders</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Add custom geo */}
      {showAdd ? (
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 10 }}>
          <input value={newCode} onChange={e => setNewCode(e.target.value)} placeholder="Code (e.g. NZ)" maxLength={4}
            style={{ width: 80, padding: 6, fontSize: 11, border: `1px solid ${T.border}`, borderRadius: 5, background: T.surface, color: T.text, outline: "none" }} />
          <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder="Label (e.g. New Zealand)"
            style={{ flex: 1, padding: 6, fontSize: 11, border: `1px solid ${T.border}`, borderRadius: 5, background: T.surface, color: T.text, outline: "none" }} />
          <button onClick={addCustomGeo} style={{ padding: "6px 12px", fontSize: 11, fontWeight: 600, background: T.accent, color: "#fff", border: "none", borderRadius: 5, cursor: "pointer" }}>Add</button>
          <button onClick={() => { setShowAdd(false); setNewCode(""); setNewLabel(""); }} style={{ padding: "6px 10px", fontSize: 11, color: T.text3, background: "transparent", border: "none", cursor: "pointer" }}>Cancel</button>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)} style={{ marginTop: 10, padding: "5px 12px", fontSize: 10, fontWeight: 600, background: "transparent", color: T.accent, border: `1px dashed ${T.accent}40`, borderRadius: 5, cursor: "pointer" }}>+ Add Custom Geo</button>
      )}

      {/* Demand by geography report (per geo, per month) */}
      {enabledRows.length > 0 && totalAcquisitionOrders > 0 && (
        <div style={{ marginTop: 16, padding: 12, background: T.surface2, borderRadius: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.text, marginBottom: 8 }}>📦 Demand Allocation by Geography</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${T.border}` }}>
                  <th style={{ textAlign: "left", padding: "6px 8px", fontWeight: 600, color: T.text3, fontSize: 10 }}>Geo</th>
                  <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 600, color: T.text3, fontSize: 10 }}>Split %</th>
                  <th style={{ textAlign: "right", padding: "6px 8px", fontWeight: 600, color: T.text3, fontSize: 10 }}>Orders</th>
                </tr>
              </thead>
              <tbody>
                {enabledRows.map(g => {
                  const orders = Math.round(totalAcquisitionOrders * (parseFloat(g.pct) || 0) / 100);
                  return (
                    <tr key={g.geo_code} style={{ borderBottom: `1px solid ${T.border}` }}>
                      <td style={{ padding: "6px 8px", fontWeight: 700, color: T.text }}>{g.geo_code} <span style={{ fontWeight: 400, color: T.text3 }}>· {g.geo_label}</span></td>
                      <td style={{ padding: "6px 8px", textAlign: "right", color: T.text }}>{(parseFloat(g.pct) || 0).toFixed(2)}%</td>
                      <td style={{ padding: "6px 8px", textAlign: "right", color: T.text }}>{fmt(orders)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CapacityDosSection — manufacturing capacity & days of supply
// ─────────────────────────────────────────────────────────────────────────────
function CapacityDosSection({ launch, totalUnits, peakUnits, maxMonthlyCapacity, targetDos, forecastWeeks, updateLaunch, T, isMobile }) {
  const monthCount = Math.max(1, Math.ceil(forecastWeeks / 4.33));
  const avgMonthlyDemand = totalUnits / monthCount;
  // Peak month is what matters for capacity planning; fall back to average if not provided
  const peak = (peakUnits != null && peakUnits > 0) ? peakUnits : avgMonthlyDemand;
  const dailyDemand = avgMonthlyDemand / 30;
  const cap = parseInt(maxMonthlyCapacity) || 0;
  const dos = parseInt(targetDos) || 60;
  const overCap = cap > 0 && peak > cap;
  const targetInventory = Math.round(dos * dailyDemand);

  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 16, marginBottom: 20 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 12 }}>📊 Capacity & Days of Supply</div>

      {/* Capacity warning */}
      {overCap && (
        <div style={{ padding: 10, background: "#ef444415", border: `1px solid #ef4444`, borderRadius: 6, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontSize: 16 }}>⚠️</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#ef4444" }}>Capacity exceeded</div>
            <div style={{ fontSize: 11, color: T.text2, marginTop: 2 }}>
              Peak monthly demand of <strong>{fmt(Math.round(peak))}</strong> units exceeds your manufacturer's max capacity of <strong>{fmt(cap)}</strong>/mo by <strong>{fmt(Math.round(peak - cap))}</strong> units.
              You'll need additional production capacity, an extended lead time, or to reduce forecast demand.
            </div>
          </div>
        </div>
      )}

      {/* Stats grid */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(4,1fr)", gap: 10, marginBottom: 12 }}>
        <div style={{ padding: "10px 12px", background: T.surface2, borderRadius: 8, border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 9, color: T.text3, fontWeight: 600, textTransform: "uppercase" }}>Forecast / Mo</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>{fmt(Math.round(avgMonthlyDemand))}</div>
          <div style={{ fontSize: 9, color: T.text3 }}>avg · peak {fmt(Math.round(peak))}</div>
        </div>
        <div style={{ padding: "10px 12px", background: T.surface2, borderRadius: 8, border: `1px solid ${overCap ? "#ef4444" : T.border}` }}>
          <div style={{ fontSize: 9, color: T.text3, fontWeight: 600, textTransform: "uppercase" }}>Max Capacity</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: cap > 0 ? (overCap ? "#ef4444" : "#22c55e") : T.text3 }}>{cap > 0 ? fmt(cap) : "—"}</div>
          <div style={{ fontSize: 9, color: T.text3 }}>{cap > 0 ? "units / month" : "not set"}</div>
        </div>
        <div style={{ padding: "10px 12px", background: T.surface2, borderRadius: 8, border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 9, color: T.text3, fontWeight: 600, textTransform: "uppercase" }}>Target DOS</div>
          <input type="number" value={dos} onChange={e => updateLaunch(launch.id, "target_days_of_supply", parseInt(e.target.value) || 60)}
            style={{ width: "100%", fontSize: 18, fontWeight: 800, color: T.accent, background: "transparent", border: "none", outline: "none", padding: 0 }} />
          <div style={{ fontSize: 9, color: T.text3 }}>days</div>
        </div>
        <div style={{ padding: "10px 12px", background: T.surface2, borderRadius: 8, border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 9, color: T.text3, fontWeight: 600, textTransform: "uppercase" }}>Target Inventory</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>{fmt(targetInventory)}</div>
          <div style={{ fontSize: 9, color: T.text3 }}>= {dos} × daily demand</div>
        </div>
      </div>

      <div style={{ fontSize: 10, color: T.text3, fontStyle: "italic" }}>
        Daily demand = {fmt(Math.round(dailyDemand))} units/day. Target inventory of {fmt(targetInventory)} units gives you {dos} days of supply at current forecast pace.
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// UpsellPeriodsEditor — per-period orders inputs for STANDALONE upsells
// (separate funnel from Hero GWP — its own spend, CPA, or direct orders)
// ─────────────────────────────────────────────────────────────────────────────
function UpsellPeriodsEditor({ launch, upsell, upsellPeriods, upsertUpsellPeriod, updateUpsell, T, isMobile }) {
  const periodType = launch.period_type || "week";
  const periodCount = parseInt(launch.forecast_periods) || 12;
  const periodLabel = periodType === "month" ? "M" : "W";
  const periods = Array.from({ length: periodCount }, (_, i) => i + 1);
  const takeRate = parseFloat(upsell.take_rate_pct) || 0;
  const inputMode = upsell.input_mode || "spend_cpa"; // 'spend_cpa' | 'direct'

  const byIdx = {};
  upsellPeriods.forEach(p => { byIdx[p.period_index] = p; });

  // Step 1: New orders for this upsell per period (before take rate)
  // Spend+CPA mode: orders = spend / CPA
  // Direct mode:    orders = direct_orders
  const newOrdersFor = (p) => {
    if (!p) return 0;
    if (inputMode === "direct") {
      return parseInt(p.direct_orders) || 0;
    }
    const sp = parseFloat(p.spend) || 0;
    const cpa = parseFloat(p.cpa) || 0;
    return cpa > 0 ? Math.round(sp / cpa) : 0;
  };
  // Step 2: Apply upsell take rate → final upsell orders
  const upsellOrdersFor = (p) => Math.round(newOrdersFor(p) * takeRate / 100);

  const totalNewOrders = periods.reduce((s, idx) => s + newOrdersFor(byIdx[idx]), 0);
  const totalUpsellOrders = periods.reduce((s, idx) => s + upsellOrdersFor(byIdx[idx]), 0);
  const totalSpend = periods.reduce((s, idx) => s + (parseFloat(byIdx[idx]?.spend) || 0), 0);
  const blendedCpa = totalNewOrders > 0 ? totalSpend / totalNewOrders : 0;

  const cell = (idx, key, type, step) => (
    <FmtInput
      defaultValue={byIdx[idx]?.[key] ?? ""}
      onBlur={e => {
        const val = e.target.value;
        const parsed = val === "" ? null : (type === "count" ? parseInt(val) : parseFloat(val));
        upsertUpsellPeriod(idx, { [key]: parsed });
      }}
      style={{ width: "100%", padding: "3px 2px", fontSize: 10, textAlign: "center", border: `1px solid ${T.border}`, borderRadius: 3, background: T.surface, color: T.text, outline: "none" }}
    />
  );

  return (
    <div style={{ marginTop: 10, padding: 10, background: T.surface, borderRadius: 6, border: `1px solid #ec489940` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#ec4899" }}>📍 Standalone Funnel</div>
          {/* Input mode toggle */}
          <div style={{ display: "flex", border: `1px solid ${T.border}`, borderRadius: 5, overflow: "hidden" }}>
            <button onClick={() => updateUpsell(upsell.id, { input_mode: "spend_cpa" })}
              style={{ padding: "3px 10px", fontSize: 10, fontWeight: 600, background: inputMode === "spend_cpa" ? "#ec4899" : "transparent", color: inputMode === "spend_cpa" ? "#fff" : T.text3, border: "none", cursor: "pointer" }}>
              Spend + CPA
            </button>
            <button onClick={() => updateUpsell(upsell.id, { input_mode: "direct" })}
              style={{ padding: "3px 10px", fontSize: 10, fontWeight: 600, background: inputMode === "direct" ? "#ec4899" : "transparent", color: inputMode === "direct" ? "#fff" : T.text3, border: "none", cursor: "pointer" }}>
              Direct Orders
            </button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, fontSize: 10, color: T.text3, flexWrap: "wrap" }}>
          {totalSpend > 0 && <span>Spend: <strong style={{ color: T.text }}>${fmt(Math.round(totalSpend))}</strong></span>}
          {totalNewOrders > 0 && <span>New Orders: <strong style={{ color: T.text2 }}>{fmt(totalNewOrders)}</strong></span>}
          <span>Upsell Orders: <strong style={{ color: "#ec4899" }}>{fmt(totalUpsellOrders)}</strong> <span style={{ fontSize: 9 }}>(@ {takeRate}% take)</span></span>
          {blendedCpa > 0 && <span>CPA: <strong style={{ color: "#f59e0b" }}>${blendedCpa.toFixed(2)}</strong></span>}
        </div>
      </div>
      <div style={{ overflowX: "auto", border: `1px solid ${T.border}`, borderRadius: 5 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, minWidth: periods.length * 56 + 130 }}>
          <thead>
            <tr style={{ background: T.surface2 }}>
              <th style={{ padding: "5px 8px", textAlign: "left", fontWeight: 700, color: T.text3, fontSize: 9, borderBottom: `1px solid ${T.border}`, position: "sticky", left: 0, background: T.surface2, zIndex: 1, minWidth: 120 }}>Metric</th>
              {periods.map(idx => (
                <th key={idx} style={{ padding: "5px 4px", textAlign: "center", fontWeight: 700, color: T.text3, fontSize: 9, borderBottom: `1px solid ${T.border}`, minWidth: 56 }}>{periodLabel}{idx}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {inputMode === "spend_cpa" ? (
              <>
                <tr>
                  <td style={{ padding: "4px 8px", fontWeight: 600, color: T.text2, position: "sticky", left: 0, background: T.surface, zIndex: 1, borderBottom: `1px solid ${T.border}` }}>Spend ($)</td>
                  {periods.map(idx => <td key={idx} style={{ padding: "3px 2px", borderBottom: `1px solid ${T.border}` }}>{cell(idx, "spend", "decimal", 100)}</td>)}
                </tr>
                <tr>
                  <td style={{ padding: "4px 8px", fontWeight: 600, color: T.text2, position: "sticky", left: 0, background: T.surface, zIndex: 1, borderBottom: `1px solid ${T.border}` }}>Target CPA ($)</td>
                  {periods.map(idx => <td key={idx} style={{ padding: "3px 2px", borderBottom: `1px solid ${T.border}` }}>{cell(idx, "cpa", "decimal", 1)}</td>)}
                </tr>
              </>
            ) : (
              <tr>
                <td style={{ padding: "4px 8px", fontWeight: 600, color: T.text2, position: "sticky", left: 0, background: T.surface, zIndex: 1, borderBottom: `1px solid ${T.border}` }}>New Orders</td>
                {periods.map(idx => <td key={idx} style={{ padding: "3px 2px", borderBottom: `1px solid ${T.border}` }}>{cell(idx, "direct_orders", "count", 100)}</td>)}
              </tr>
            )}
            <tr style={{ background: "#ec489908" }}>
              <td style={{ padding: "5px 8px", fontWeight: 700, color: "#ec4899", position: "sticky", left: 0, background: T.surface, zIndex: 1 }}>Upsell Orders →</td>
              {periods.map(idx => {
                const o = upsellOrdersFor(byIdx[idx]);
                return (
                  <td key={idx} style={{ padding: "5px 4px", textAlign: "center", color: "#ec4899", fontWeight: 700, fontSize: 11 }}>
                    {o > 0 ? fmt(o) : "—"}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
      <div style={{ fontSize: 9, color: T.text3, fontStyle: "italic", marginTop: 4 }}>
        {inputMode === "spend_cpa"
          ? "New Orders = spend ÷ CPA. Upsell Orders = New Orders × Take Rate %."
          : "Enter the new orders shown the upsell each period. Upsell Orders = New Orders × Take Rate %."}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MonthlyDemandSchedule — synthesizes everything into a monthly forecast
// New Orders + Recurring Orders + Total Units, broken out per month
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// computeMonthlyDemand — single source of truth for v3 launch demand math.
// Used by MonthlyDemandSchedule (rendering) AND CapacityDosSection (peak/avg).
// ─────────────────────────────────────────────────────────────────────────────
function computeMonthlyDemand({ launch, marketingChannels, marketingPeriods, packTiers, rebillRates, upsells, upsellPeriods }) {
  const periodType = launch.period_type || "week";
  const periodCount = parseInt(launch.forecast_periods) || 12;
  const totalMonths = periodType === "month" ? Math.max(12, periodCount) : Math.max(12, Math.ceil(periodCount / 4.33));
  const months = Array.from({ length: totalMonths }, (_, i) => i + 1);

  // Step 1: New orders per month (from marketing channels)
  const newOrdersByMonth = new Array(totalMonths + 1).fill(0);
  marketingChannels.forEach(ch => {
    const cps = marketingPeriods.filter(mp => mp.marketing_channel_id === ch.id);
    cps.forEach(p => {
      const orders = calcMarketingPeriodOrders(ch.channel_type, p);
      if (orders <= 0) return;
      const m = periodType === "month"
        ? Math.min(totalMonths, Math.max(1, p.period_index))
        : Math.min(totalMonths, Math.max(1, Math.ceil(p.period_index / 4.33)));
      newOrdersByMonth[m] += orders;
    });
  });

  // Step 2: Pack tier mix → avg units per order
  const totalTakePct = packTiers.reduce((s, t) => s + (parseFloat(t.take_rate_pct) || 0), 0);
  const avgUnitsPerOrder = totalTakePct > 0
    ? packTiers.reduce((s, t) => s + ((parseFloat(t.take_rate_pct) || 0) / 100) * (parseInt(t.pack_size) || 0), 0)
    : 1;

  // Step 3: Rebill rate lookup
  const rebillRate = (scopeType, scopeId, cohort, monthIdx) => {
    const r = rebillRates.find(x =>
      x.launch_id === launch.id &&
      x.scope_type === scopeType &&
      (x.scope_id || null) === (scopeId || null) &&
      x.cohort === cohort &&
      x.month_index === monthIdx
    );
    return parseFloat(r?.rate_pct) || 0;
  };

  const otpPct = parseFloat(launch.gwp_otp_pct) || 0;
  const subPct = parseFloat(launch.gwp_sub_pct) || 0;

  // Step 4: Recurring orders
  const recurringOrdersByMonth = new Array(totalMonths + 1).fill(0);
  const recurringUnitsByMonth = new Array(totalMonths + 1).fill(0);
  for (let M = 2; M <= totalMonths; M++) {
    let monthRebillOrders = 0;
    for (let k = 1; k < M; k++) {
      const offset = M - k;
      const newK = newOrdersByMonth[k] || 0;
      if (newK <= 0) continue;
      const otpR = rebillRate("gwp", null, "otp", offset);
      const subR = rebillRate("gwp", null, "sub", offset);
      monthRebillOrders += newK * (otpPct / 100) * (otpR / 100);
      monthRebillOrders += newK * (subPct / 100) * (subR / 100);
    }
    recurringOrdersByMonth[M] = Math.round(monthRebillOrders);
    recurringUnitsByMonth[M] = Math.round(monthRebillOrders * avgUnitsPerOrder);
  }

  // Step 5: Upsell units
  const upsellUnitsByMonth = new Array(totalMonths + 1).fill(0);
  upsells.forEach(u => {
    const isStandalone = u.funnel_mode === "standalone";
    const upu = parseInt(u.units_per_order) || 1;
    const uOtp = parseFloat(u.otp_pct) || 0;
    const uSub = parseFloat(u.sub_pct) || 0;
    const upsellNewByMonth = new Array(totalMonths + 1).fill(0);
    const takePct = parseFloat(u.take_rate_pct) || 0;
    if (isStandalone) {
      const upInputMode = u.input_mode || "spend_cpa";
      const ups = (upsellPeriods || []).filter(up => up.upsell_id === u.id);
      ups.forEach(p => {
        let newOrders = 0;
        if (upInputMode === "direct") {
          newOrders = parseInt(p.direct_orders) || 0;
        } else {
          const sp = parseFloat(p.spend) || 0;
          const cpa = parseFloat(p.cpa) || 0;
          newOrders = cpa > 0 ? Math.round(sp / cpa) : 0;
        }
        const upsellOrders = Math.round(newOrders * (takePct / 100));
        if (upsellOrders <= 0) return;
        const m = periodType === "month"
          ? Math.min(totalMonths, Math.max(1, p.period_index))
          : Math.min(totalMonths, Math.max(1, Math.ceil(p.period_index / 4.33)));
        upsellNewByMonth[m] += upsellOrders;
      });
    } else {
      for (let M = 1; M <= totalMonths; M++) {
        upsellNewByMonth[M] = (newOrdersByMonth[M] || 0) * (takePct / 100);
      }
    }
    for (let M = 1; M <= totalMonths; M++) {
      upsellUnitsByMonth[M] += Math.round(upsellNewByMonth[M] * upu);
      for (let k = 1; k < M; k++) {
        const offset = M - k;
        const newK = upsellNewByMonth[k];
        if (newK <= 0) continue;
        let otpR, subR;
        if (u.rebill_mode === "custom") {
          otpR = rebillRate("upsell", u.id, "otp", offset);
          subR = rebillRate("upsell", u.id, "sub", offset);
        } else {
          otpR = rebillRate("gwp", null, "otp", offset);
          subR = rebillRate("gwp", null, "sub", offset);
        }
        const rebillOrders = newK * ((uOtp / 100) * (otpR / 100) + (uSub / 100) * (subR / 100));
        upsellUnitsByMonth[M] += Math.round(rebillOrders * upu);
      }
    }
  });

  // Roll up
  const newUnitsByMonth = months.map(m => Math.round((newOrdersByMonth[m] || 0) * avgUnitsPerOrder));
  const newOrdersArr = months.map(m => newOrdersByMonth[m] || 0);
  const recurOrdersArr = months.map(m => recurringOrdersByMonth[m] || 0);
  const recurUnitsArr = months.map(m => recurringUnitsByMonth[m] || 0);
  const upsellUnitsArr = months.map(m => upsellUnitsByMonth[m] || 0);
  const totalUnitsArr = months.map((_, i) => newUnitsByMonth[i] + recurUnitsArr[i] + upsellUnitsArr[i]);

  const sum = arr => arr.reduce((s, v) => s + v, 0);
  const grandTotalUnits = sum(totalUnitsArr);
  const peakUnits = totalUnitsArr.length ? Math.max(...totalUnitsArr) : 0;

  return {
    months, totalMonths, periodType, avgUnitsPerOrder,
    newOrdersArr, newUnitsByMonth, recurOrdersArr, recurUnitsArr, upsellUnitsArr, totalUnitsArr,
    totalNewOrders: sum(newOrdersArr), totalRecurOrders: sum(recurOrdersArr), grandTotalUnits,
    peakUnits,
    otpPct, subPct,
  };
}

function MonthlyDemandSchedule({ launch, marketingChannels, marketingPeriods, packTiers, rebillRates, upsells, upsellPeriods, T, isMobile }) {
  const d = computeMonthlyDemand({ launch, marketingChannels, marketingPeriods, packTiers, rebillRates, upsells, upsellPeriods });
  const { months, totalMonths, avgUnitsPerOrder, newOrdersArr, newUnitsByMonth, recurOrdersArr, recurUnitsArr, upsellUnitsArr, totalUnitsArr, totalNewOrders, totalRecurOrders, grandTotalUnits, peakUnits, otpPct, subPct } = d;
  const cap = parseInt(launch.max_monthly_capacity) || 0;
  const overCap = cap > 0 && peakUnits > cap;

  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 14, marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>📅 Monthly Demand Schedule</div>
          <div style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>
            New Orders → Recurring (rebills from prior cohorts) → Upsell add-ons → Total Units
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Stat label="Total New Orders" value={fmt(totalNewOrders)} color={T.accent} T={T} />
          <Stat label="Total Recurring" value={fmt(totalRecurOrders)} color="#22c55e" T={T} />
          <Stat label="Grand Total Units" value={fmt(grandTotalUnits)} color={T.text} T={T} />
          {overCap && <Stat label="Peak vs Cap" value="⚠ Over" color="#ef4444" T={T} />}
        </div>
      </div>

      {totalNewOrders === 0 ? (
        <div style={{ padding: 24, textAlign: "center", color: T.text3, fontSize: 11, fontStyle: "italic", border: `1px dashed ${T.border}`, borderRadius: 8 }}>
          Add marketing channels and pack tiers above to see the monthly demand schedule.
        </div>
      ) : (
        <div style={{ overflowX: "auto", border: `1px solid ${T.border}`, borderRadius: 6 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, minWidth: totalMonths * 60 + 180 }}>
            <thead>
              <tr style={{ background: T.surface2 }}>
                <th style={{ padding: "6px 10px", textAlign: "left", fontWeight: 700, color: T.text3, fontSize: 10, borderBottom: `1px solid ${T.border}`, position: "sticky", left: 0, background: T.surface2, zIndex: 1, minWidth: 160 }}>Metric</th>
                {months.map(m => (
                  <th key={m} style={{ padding: "6px 4px", textAlign: "center", fontWeight: 700, color: T.text3, fontSize: 10, borderBottom: `1px solid ${T.border}`, minWidth: 60 }}>M{m}</th>
                ))}
                <th style={{ padding: "6px 10px", textAlign: "right", fontWeight: 700, color: T.text3, fontSize: 10, borderBottom: `1px solid ${T.border}`, minWidth: 80 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              <ScheduleRow label="New Orders" subtitle="from marketing channels" values={newOrdersArr} color={T.accent} T={T} />
              <ScheduleRow label="Recurring Orders" subtitle={`OTP ${otpPct}% + Sub ${subPct}% rebills`} values={recurOrdersArr} color="#22c55e" T={T} />
              <ScheduleRow
                label="New Units"
                subtitle={`@ ${avgUnitsPerOrder.toFixed(2)} units/order avg`}
                values={newUnitsByMonth}
                color={T.text2}
                T={T}
                isUnit
              />
              <ScheduleRow label="Recurring Units" subtitle="" values={recurUnitsArr} color={T.text2} T={T} isUnit />
              {upsells.length > 0 && <ScheduleRow label="Upsell Units" subtitle={`${upsells.length} upsell${upsells.length === 1 ? "" : "s"}`} values={upsellUnitsArr} color="#ec4899" T={T} isUnit />}
              <tr style={{ background: T.accent + "08", fontWeight: 800 }}>
                <td style={{ padding: "8px 10px", borderTop: `2px solid ${T.accent}30`, position: "sticky", left: 0, background: T.surface, zIndex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: T.text }}>Total Units</div>
                  <div style={{ fontSize: 9, color: T.text3, fontWeight: 400 }}>= New + Recurring + Upsells</div>
                </td>
                {totalUnitsArr.map((v, i) => {
                  const overThisMonth = cap > 0 && v > cap;
                  return (
                    <td key={i} style={{ padding: "8px 4px", textAlign: "center", fontSize: 12, fontWeight: 800, color: overThisMonth ? "#ef4444" : T.text, borderTop: `2px solid ${T.accent}30`, fontVariantNumeric: "tabular-nums" }}>
                      {v > 0 ? fmt(v) : "—"}
                    </td>
                  );
                })}
                <td style={{ padding: "8px 10px", textAlign: "right", fontSize: 13, fontWeight: 800, color: T.accent, borderTop: `2px solid ${T.accent}30`, fontVariantNumeric: "tabular-nums" }}>
                  {fmt(grandTotalUnits)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {overCap && (
        <div style={{ marginTop: 10, padding: 8, background: "#ef444412", border: `1px solid #ef444440`, borderRadius: 6, fontSize: 11, color: "#ef4444", display: "flex", alignItems: "center", gap: 8 }}>
          <span>⚠️</span>
          <span>Peak month exceeds your manufacturer capacity of <strong>{fmt(cap)}</strong> units/mo. Red cells above show when capacity is breached.</span>
        </div>
      )}
    </div>
  );
}

// Small stat pill helper
function Stat({ label, value, color, T }) {
  return (
    <div style={{ padding: "5px 10px", background: color + "12", borderRadius: 6, display: "flex", alignItems: "baseline", gap: 5 }}>
      <span style={{ fontSize: 9, fontWeight: 600, color: T.text3, textTransform: "uppercase" }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 800, color }}>{value}</span>
    </div>
  );
}

// Schedule row helper
function ScheduleRow({ label, subtitle, values, color, T, isUnit }) {
  const total = values.reduce((s, v) => s + v, 0);
  return (
    <tr>
      <td style={{ padding: "6px 10px", borderBottom: `1px solid ${T.border}`, position: "sticky", left: 0, background: T.surface, zIndex: 1 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.text }}>{label}</div>
        {subtitle && <div style={{ fontSize: 9, color: T.text3, fontWeight: 400 }}>{subtitle}</div>}
      </td>
      {values.map((v, i) => (
        <td key={i} style={{ padding: "6px 4px", textAlign: "center", fontSize: 11, color: v > 0 ? color : T.text3, fontWeight: v > 0 ? 600 : 400, borderBottom: `1px solid ${T.border}`, fontVariantNumeric: "tabular-nums" }}>
          {v > 0 ? fmt(v) : "—"}
        </td>
      ))}
      <td style={{ padding: "6px 10px", textAlign: "right", fontSize: 11, fontWeight: 800, color, borderBottom: `1px solid ${T.border}`, fontVariantNumeric: "tabular-nums" }}>
        {fmt(total)}
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PackTiersEditor — pack-size take rates + free gifts per tier
// e.g., 30% of orders are 1-pack, 50% are 2-pack with free gift X, 20% are 3-pack with gift Y
// Take rates must sum to 100%. Total units = Σ (orders × take% × pack_size).
// ─────────────────────────────────────────────────────────────────────────────
function PackTiersEditor({ launchId, orgId, tiers, totalAcqOrders, addGwpPackTier, updateGwpPackTier, deleteGwpPackTier, T, isMobile }) {
  const sorted = [...tiers].sort((a, b) => (a.pack_size || 0) - (b.pack_size || 0));
  const totalPct = sorted.reduce((s, t) => s + (parseFloat(t.take_rate_pct) || 0), 0);
  const sumOk = Math.abs(totalPct - 100) < 0.01;

  // Per-tier orders + units (tier itself, no cascade)
  const tierWithOrders = sorted.map(t => {
    const orders = Math.round(totalAcqOrders * (parseFloat(t.take_rate_pct) || 0) / 100);
    const units = orders * (parseInt(t.pack_size) || 0);
    return { ...t, _orders: orders, _units: units };
  });

  // Cascade: cumulative orders that reach OR exceed each tier (orders for this tier + every larger tier)
  // because a 3-pack ALSO gets the 1-pack and 2-pack gifts.
  const cumulativeOrdersAtOrAbove = (idx) =>
    tierWithOrders.slice(idx).reduce((s, t) => s + t._orders, 0);

  // Per-row "cumulative gift cost" = own gift cost (×orders) + every smaller tier's gift cost (×orders for this tier)
  // Wait — re-read user requirement:
  //   1-pack gets gift A (qty 1); 2-pack gets A + B; 3-pack gets A + B + C.
  // So orders at THIS tier × (sum of gift costs for THIS tier and all SMALLER tiers).
  const cumulativeGiftCostForTier = (idx) => {
    const orders = tierWithOrders[idx]._orders;
    const cumulativePerOrderCost = tierWithOrders.slice(0, idx + 1).reduce((s, smaller) => {
      return s + ((parseFloat(smaller.gift_cost) || 0) * (parseInt(smaller.gift_qty) || 0));
    }, 0);
    return orders * cumulativePerOrderCost;
  };

  // Gift inventory rollup: for each gift introduced at tier i, total qty = (qty/order at tier i) × Σ orders at tiers ≥ i
  const giftInventory = sorted
    .filter(t => t.gift_name && parseInt(t.gift_qty) > 0)
    .map((t, idx) => {
      // Find the original index in sorted (idx is index in filtered array)
      const originalIdx = sorted.findIndex(x => x.id === t.id);
      const ordersReaching = cumulativeOrdersAtOrAbove(originalIdx);
      const qtyPerOrder = parseInt(t.gift_qty) || 0;
      const totalQty = ordersReaching * qtyPerOrder;
      const totalCost = totalQty * (parseFloat(t.gift_cost) || 0);
      return {
        introducedAt: t.pack_size,
        name: t.gift_name,
        qtyPerOrder,
        ordersReaching,
        totalQty,
        unitCost: parseFloat(t.gift_cost) || 0,
        totalCost,
      };
    });

  const totalUnits = tierWithOrders.reduce((s, t) => s + t._units, 0);
  const totalGiftCost = giftInventory.reduce((s, g) => s + g.totalCost, 0);
  const usedSizes = new Set(sorted.map(t => t.pack_size));

  // Build "includes" string per tier — what gifts cascade in from smaller tiers
  const includesFor = (idx) => {
    const smaller = tierWithOrders.slice(0, idx).filter(s => s.gift_name);
    return smaller.map(s => `${s.pack_size}-pk: ${s.gift_name}`).join(" + ");
  };

  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.text }}>Pack Tiers · Take Rate + Free Gifts <span style={{ fontWeight: 400, color: T.text3, fontSize: 10 }}>(gifts cascade — bigger packs include smaller-pack gifts)</span></div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <div style={{ padding: "2px 8px", borderRadius: 5, fontSize: 9, fontWeight: 700, background: sumOk ? "#22c55e15" : "#ef444415", color: sumOk ? "#22c55e" : "#ef4444" }}>
            {totalPct.toFixed(0)}% {sumOk ? "✓" : "✗"}
          </div>
          {totalUnits > 0 && <div style={{ fontSize: 9, color: T.text3 }}>{fmt(Math.round(totalUnits))} units</div>}
          {totalGiftCost > 0 && <div style={{ fontSize: 9, color: T.text3 }}>· ${fmt(Math.round(totalGiftCost))} total gift cost</div>}
        </div>
      </div>
      {sorted.length === 0 ? (
        <div style={{ padding: 12, textAlign: "center", color: T.text3, fontSize: 10, fontStyle: "italic", border: `1px dashed ${T.border}`, borderRadius: 6, marginBottom: 6 }}>
          No pack tiers yet. Add common tiers below.
        </div>
      ) : (
        <div style={{ overflowX: "auto", border: `1px solid ${T.border}`, borderRadius: 6, marginBottom: 6 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
            <thead>
              <tr style={{ background: T.surface }}>
                <th style={{ padding: "5px 8px", textAlign: "left", fontWeight: 700, color: T.text3, fontSize: 9, borderBottom: `1px solid ${T.border}` }}>Pack</th>
                <th style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700, color: T.text3, fontSize: 9, borderBottom: `1px solid ${T.border}`, minWidth: 70 }}>Take %</th>
                <th style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700, color: T.text3, fontSize: 9, borderBottom: `1px solid ${T.border}` }}>Orders</th>
                <th style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700, color: T.text3, fontSize: 9, borderBottom: `1px solid ${T.border}` }}>Units</th>
                <th style={{ padding: "5px 8px", textAlign: "left", fontWeight: 700, color: T.text3, fontSize: 9, borderBottom: `1px solid ${T.border}`, minWidth: 140 }}>Adds Gift</th>
                <th style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700, color: T.text3, fontSize: 9, borderBottom: `1px solid ${T.border}`, minWidth: 50 }}>Qty/Ord</th>
                <th style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700, color: T.text3, fontSize: 9, borderBottom: `1px solid ${T.border}`, minWidth: 70 }}>Cost ea</th>
                <th style={{ padding: "5px 8px", textAlign: "left", fontWeight: 700, color: T.text3, fontSize: 9, borderBottom: `1px solid ${T.border}`, minWidth: 150 }}>Includes (cascade)</th>
                <th style={{ padding: "5px 4px", borderBottom: `1px solid ${T.border}`, width: 24 }}></th>
              </tr>
            </thead>
            <tbody>
              {tierWithOrders.map((t, idx) => {
                const cumulativeCost = cumulativeGiftCostForTier(idx);
                const inc = includesFor(idx);
                return (
                  <tr key={t.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                    <td style={{ padding: "4px 8px", fontWeight: 700, color: T.text }}>{t.pack_size || "?"}-Pack</td>
                    <td style={{ padding: "3px 4px" }}>
                      <FmtInput defaultValue={t.take_rate_pct ?? 0}
                        onBlur={e => updateGwpPackTier(t.id, { take_rate_pct: parseFloat(e.target.value) || 0 })}
                        style={{ width: "100%", padding: "3px 4px", fontSize: 10, textAlign: "right", border: `1px solid ${T.border}`, borderRadius: 3, background: T.surface, color: T.text, outline: "none" }} />
                    </td>
                    <td style={{ padding: "4px 8px", textAlign: "right", color: T.text2, fontVariantNumeric: "tabular-nums" }}>{fmt(t._orders)}</td>
                    <td style={{ padding: "4px 8px", textAlign: "right", color: T.text, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt(t._units)}</td>
                    <td style={{ padding: "3px 4px" }}>
                      <SkuPicker
                        value={t.gift_sku || null}
                        onChange={(skuCode) => {
                          if (!skuCode) {
                            updateGwpPackTier(t.id, { gift_sku: null });
                            return;
                          }
                          supabase.from("dp_sku_master").select("product_title, variant_title, cogs_per_unit").eq("org_id", orgId).eq("sku", skuCode).limit(1).single().then(({ data }) => {
                            const titleParts = [];
                            if (data?.product_title) titleParts.push(data.product_title);
                            if (data?.variant_title) titleParts.push(data.variant_title);
                            const updates = { gift_sku: skuCode, gift_name: titleParts.join(" · ") || skuCode };
                            if ((t.gift_cost == null || t.gift_cost === "") && data?.cogs_per_unit) {
                              updates.gift_cost = data.cogs_per_unit;
                            }
                            updateGwpPackTier(t.id, updates);
                          });
                        }}
                        orgId={orgId}
                        placeholder={t.gift_name || "Search SKU or product…"}
                        isGiftPicker
                      />
                      {!t.gift_sku && (
                        <input type="text" defaultValue={t.gift_name || ""}
                          placeholder="…or type a non-SKU gift (e.g. Free Shipping)"
                          onBlur={e => updateGwpPackTier(t.id, { gift_name: e.target.value || null })}
                          style={{ width: "100%", padding: "3px 6px", fontSize: 9, border: `1px solid ${T.border}`, borderRadius: 3, background: T.surface2, color: T.text3, outline: "none", marginTop: 3, fontStyle: "italic" }} />
                      )}
                    </td>
                    <td style={{ padding: "3px 4px" }}>
                      <FmtInput defaultValue={t.gift_qty ?? ""}
                        onBlur={e => updateGwpPackTier(t.id, { gift_qty: parseInt(e.target.value) || null })}
                        style={{ width: "100%", padding: "3px 4px", fontSize: 10, textAlign: "right", border: `1px solid ${T.border}`, borderRadius: 3, background: T.surface, color: T.text, outline: "none" }} />
                    </td>
                    <td style={{ padding: "3px 4px" }}>
                      <FmtInput defaultValue={t.gift_cost ?? ""}
                        onBlur={e => updateGwpPackTier(t.id, { gift_cost: parseFloat(e.target.value) || null })}
                        style={{ width: "100%", padding: "3px 4px", fontSize: 10, textAlign: "right", border: `1px solid ${T.border}`, borderRadius: 3, background: T.surface, color: T.text, outline: "none" }} />
                    </td>
                    <td style={{ padding: "4px 8px", color: T.text3, fontSize: 9 }}>
                      {inc ? inc : <span style={{ fontStyle: "italic" }}>—</span>}
                    </td>
                    <td style={{ padding: "3px 4px", textAlign: "center" }}>
                      <button onClick={() => deleteGwpPackTier(t.id)} title="Remove tier"
                        style={{ background: "transparent", border: "none", color: T.text3, cursor: "pointer", fontSize: 14, padding: 0 }}>×</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Gift Inventory Needs — cumulative quantities across all tiers that include each gift */}
      {giftInventory.length > 0 && (
        <div style={{ marginTop: 10, padding: 10, background: T.accent + "06", border: `1px solid ${T.accent}30`, borderRadius: 6 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.text, marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span>📦 Gift Inventory Needs <span style={{ fontWeight: 400, color: T.text3 }}>(cumulative across cascading tiers)</span></span>
            <span style={{ fontSize: 9, color: T.text3 }}>Total: ${fmt(Math.round(totalGiftCost))}</span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
            <thead>
              <tr>
                <th style={{ padding: "4px 6px", textAlign: "left", fontWeight: 700, color: T.text3, fontSize: 9, borderBottom: `1px solid ${T.border}` }}>Gift</th>
                <th style={{ padding: "4px 6px", textAlign: "right", fontWeight: 700, color: T.text3, fontSize: 9, borderBottom: `1px solid ${T.border}` }}>Introduced</th>
                <th style={{ padding: "4px 6px", textAlign: "right", fontWeight: 700, color: T.text3, fontSize: 9, borderBottom: `1px solid ${T.border}` }}>Qty/Ord</th>
                <th style={{ padding: "4px 6px", textAlign: "right", fontWeight: 700, color: T.text3, fontSize: 9, borderBottom: `1px solid ${T.border}` }}>Orders Receiving</th>
                <th style={{ padding: "4px 6px", textAlign: "right", fontWeight: 700, color: T.text3, fontSize: 9, borderBottom: `1px solid ${T.border}` }}>Total Qty Needed</th>
                <th style={{ padding: "4px 6px", textAlign: "right", fontWeight: 700, color: T.text3, fontSize: 9, borderBottom: `1px solid ${T.border}` }}>Total Cost</th>
              </tr>
            </thead>
            <tbody>
              {giftInventory.map((g, i) => (
                <tr key={i} style={{ borderBottom: i < giftInventory.length - 1 ? `1px solid ${T.border}` : "none" }}>
                  <td style={{ padding: "4px 6px", fontWeight: 700, color: T.text }}>{g.name}</td>
                  <td style={{ padding: "4px 6px", textAlign: "right", color: T.text3 }}>{g.introducedAt}-pk and up</td>
                  <td style={{ padding: "4px 6px", textAlign: "right", color: T.text2, fontVariantNumeric: "tabular-nums" }}>{fmt(g.qtyPerOrder)}</td>
                  <td style={{ padding: "4px 6px", textAlign: "right", color: T.text2, fontVariantNumeric: "tabular-nums" }}>{fmt(g.ordersReaching)}</td>
                  <td style={{ padding: "4px 6px", textAlign: "right", color: T.text, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt(g.totalQty)}</td>
                  <td style={{ padding: "4px 6px", textAlign: "right", color: T.accent, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>${fmt(Math.round(g.totalCost))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 8 }}>
        {[1, 2, 3, 4, 6].filter(n => !usedSizes.has(n)).map(n => (
          <button key={n} onClick={() => addGwpPackTier(launchId, n)}
            style={{ padding: "3px 9px", fontSize: 10, fontWeight: 600, background: "transparent", color: T.accent, border: `1px dashed ${T.accent}50`, borderRadius: 5, cursor: "pointer" }}>
            + {n}-Pack
          </button>
        ))}
        <button onClick={() => {
          const next = Math.max(0, ...sorted.map(t => parseInt(t.pack_size) || 0)) + 1;
          addGwpPackTier(launchId, next);
        }}
          style={{ padding: "3px 9px", fontSize: 10, fontWeight: 600, background: "transparent", color: T.text3, border: `1px dashed ${T.border}`, borderRadius: 5, cursor: "pointer" }}>
          + Custom
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RebillRatesEditor — separate OTP and Sub rebill rate tables for any scope
// (used both for the main GWP funnel and for individual upsells with custom rates)
// ─────────────────────────────────────────────────────────────────────────────
function RebillRatesEditor({ launchId, scopeType, scopeId, otpPct, subPct, rebillRates, upsertRebillRate, forecastWeeks, T, isMobile, compact }) {
  // Always show at least 12 months. If forecast is longer (in weeks), expand accordingly.
  const monthCount = Math.max(12, Math.ceil((forecastWeeks || 12) / 4.33));
  const months = Array.from({ length: monthCount }, (_, i) => i + 1);

  const rateFor = (cohort, monthIdx) => {
    const r = rebillRates.find(x =>
      x.launch_id === launchId &&
      x.scope_type === scopeType &&
      (x.scope_id || null) === (scopeId || null) &&
      x.cohort === cohort &&
      x.month_index === monthIdx
    );
    return r?.rate_pct ?? "";
  };

  const cellInput = (cohort, m, color, enabled) => (
    <FmtInput
      defaultValue={rateFor(cohort, m)}
      onBlur={e => {
        const val = parseFloat(e.target.value);
        if (!isNaN(val)) upsertRebillRate(launchId, scopeType, scopeId, cohort, m, val);
      }}
      disabled={!enabled}
      style={{
        width: "100%",
        padding: "3px 2px",
        fontSize: 10,
        textAlign: "center",
        border: `1px solid ${T.border}`,
        borderRadius: 3,
        background: enabled ? T.surface : T.surface2,
        color: enabled ? T.text : T.text3,
        outline: "none",
        opacity: enabled ? 1 : 0.5,
      }}
    />
  );

  const otpEnabled = otpPct > 0;
  const subEnabled = subPct > 0;

  return (
    <div>
      {!compact && (
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.text }}>Monthly Rebill % by Cohort</div>
          <div style={{ fontSize: 9, color: T.text3, fontStyle: "italic" }}>% of cohort that rebills in each month</div>
        </div>
      )}
      <div style={{ overflowX: "auto", border: `1px solid ${T.border}`, borderRadius: 6 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, minWidth: monthCount * 50 + 100 }}>
          <thead>
            <tr style={{ background: T.surface }}>
              <th style={{ padding: "5px 8px", textAlign: "left", fontWeight: 700, color: T.text3, fontSize: 9, borderBottom: `1px solid ${T.border}`, position: "sticky", left: 0, background: T.surface, zIndex: 1, minWidth: 90 }}>Cohort</th>
              {months.map(m => (
                <th key={m} style={{ padding: "5px 4px", textAlign: "center", fontWeight: 700, color: T.text3, fontSize: 9, borderBottom: `1px solid ${T.border}`, minWidth: 48 }}>M{m}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr style={{ opacity: otpEnabled ? 1 : 0.5 }}>
              <td style={{ padding: "4px 8px", borderBottom: `1px solid ${T.border}`, position: "sticky", left: 0, background: T.surface2, zIndex: 1 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#f59e0b" }}>OTP</span>
                <span style={{ fontSize: 9, color: T.text3, marginLeft: 4 }}>{otpPct}%</span>
              </td>
              {months.map(m => (
                <td key={m} style={{ padding: "3px 2px", borderBottom: `1px solid ${T.border}` }}>{cellInput("otp", m, "#f59e0b", otpEnabled)}</td>
              ))}
            </tr>
            <tr style={{ opacity: subEnabled ? 1 : 0.5 }}>
              <td style={{ padding: "4px 8px", position: "sticky", left: 0, background: T.surface2, zIndex: 1 }}>
                <span style={{ fontSize: 10, fontWeight: 700, color: "#22c55e" }}>Sub</span>
                <span style={{ fontSize: 9, color: T.text3, marginLeft: 4 }}>{subPct}%</span>
              </td>
              {months.map(m => (
                <td key={m} style={{ padding: "3px 2px" }}>{cellInput("sub", m, "#22c55e", subEnabled)}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LaunchPlannerView({ isMobile, orgId }) {
  const I = DebouncedInput;
  const { user } = useAuth();
  const [launches, setLaunches] = useState([]);
  const [selected, setSelected] = useState(null);
  const [channels, setChannels] = useState([]);
  const [periods, setPeriods] = useState([]);
  const [pos, setPos] = useState([]);
  const [emailSends, setEmailSends] = useState([]);
  const [variantSplits, setVariantSplits] = useState([]);
  const [gwpTiers, setGwpTiers] = useState([]);
  const [upsells, setUpsells] = useState([]);
  const [geoSplit, setGeoSplit] = useState([]);
  const [rebillRates, setRebillRates] = useState([]);
  const [marketingChannels, setMarketingChannels] = useState([]);
  const [marketingPeriods, setMarketingPeriods] = useState([]);
  const [upsellPeriods, setUpsellPeriods] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", product_name: "", launch_date: "", moq: 5000, lead_time_days: 45, unit_cost: "", retail_price: "", target_margin_pct: 65, forecast_period_weeks: 12, supplier: "", max_monthly_capacity: "", target_days_of_supply: 60 });

  const load = async () => {
    const [{ data: l }, { data: c }, { data: p }, { data: pr }, { data: es }, { data: vs }, { data: gt }, { data: us }, { data: gs }, { data: rr }, { data: mc }, { data: mp }, { data: up }] = await Promise.all([
      supabase.from("dp_launches").select("*").eq("org_id", orgId).order("created_at", { ascending: false }),
      supabase.from("dp_launch_channels").select("*").eq("org_id", orgId),
      supabase.from("dp_launch_pos").select("*").eq("org_id", orgId),
      supabase.from("dp_launch_periods").select("*").eq("org_id", orgId).order("period_index"),
      supabase.from("dp_launch_email_sends").select("*").eq("org_id", orgId).order("sort_order"),
      supabase.from("dp_launch_variant_splits").select("*").eq("org_id", orgId).order("sort_order"),
      supabase.from("dp_launch_gwp_tiers").select("*").eq("org_id", orgId).order("sort_order"),
      supabase.from("dp_launch_upsells").select("*").eq("org_id", orgId).order("sort_order"),
      supabase.from("dp_launch_geo_split").select("*").eq("org_id", orgId).order("sort_order"),
      supabase.from("dp_launch_rebill_rates").select("*").eq("org_id", orgId).order("month_index"),
      supabase.from("dp_launch_marketing_channels").select("*").eq("org_id", orgId).order("sort_order"),
      supabase.from("dp_launch_marketing_periods").select("*").eq("org_id", orgId).order("period_index"),
      supabase.from("dp_launch_upsell_periods").select("*").eq("org_id", orgId).order("period_index"),
    ]);
    setLaunches(l || []); setChannels(c || []); setPos(p || []); setPeriods(pr || []);
    setEmailSends(es || []); setVariantSplits(vs || []); setGwpTiers(gt || []);
    setUpsells(us || []); setGeoSplit(gs || []); setRebillRates(rr || []);
    setMarketingChannels(mc || []); setMarketingPeriods(mp || []);
    setUpsellPeriods(up || []);
    setLoading(false);
  };
  useEffect(() => { if (orgId) load(); }, [orgId]);

  const createLaunch = async () => {
    if (!form.product_name.trim()) return;
    const { data } = await supabase.from("dp_launches").insert({
      name: form.name || form.product_name, product_name: form.product_name,
      launch_date: form.launch_date || null, moq: parseInt(form.moq) || 5000,
      lead_time_days: parseInt(form.lead_time_days) || 45,
      unit_cost: parseFloat(form.unit_cost) || null, retail_price: parseFloat(form.retail_price) || null,
      target_margin_pct: parseFloat(form.target_margin_pct) || null,
      forecast_period_weeks: parseInt(form.forecast_period_weeks) || 12,
      supplier: form.supplier || null,
      max_monthly_capacity: parseInt(form.max_monthly_capacity) || null,
      target_days_of_supply: parseInt(form.target_days_of_supply) || 60,
      gwp_otp_pct: 50, gwp_sub_pct: 50, total_acquisition_orders: 0,
      org_id: orgId, created_by: user?.id,
    }).select().single();
    if (data) {
      // Auto-seed default geos for new launches
      const defaultGeos = [
        { code: "US", label: "United States", pct: 70 },
        { code: "CA", label: "Canada", pct: 10 },
        { code: "UK", label: "United Kingdom", pct: 10 },
        { code: "AU", label: "Australia", pct: 10 },
      ];
      const geoRows = defaultGeos.map((g, i) => ({
        org_id: orgId, launch_id: data.id, geo_code: g.code, geo_label: g.label,
        pct: g.pct, enabled: true, sort_order: i,
      }));
      const { data: newGeos } = await supabase.from("dp_launch_geo_split").insert(geoRows).select();
      if (newGeos) setGeoSplit(p => [...p, ...newGeos]);
      setLaunches(p => [data, ...p]); setSelected(data); setShowNew(false);
    }
  };

  const updateLaunch = async (id, field, value) => {
    await supabase.from("dp_launches").update({ [field]: value, updated_at: new Date().toISOString() }).eq("id", id);
    setLaunches(p => p.map(l => l.id === id ? { ...l, [field]: value } : l));
    if (selected?.id === id) setSelected(s => ({ ...s, [field]: value }));
  };

  const deleteLaunch = async (id, productName) => {
    if (!confirm(`Delete launch "${productName}"? This will also remove all channels, periods, POs, email sends, variants, GWP tiers, upsells, geo splits, and rebill rates tied to it. This cannot be undone.`)) return;
    // Cascade deletes for child tables (FK ON DELETE CASCADE handles new ones, but explicit for old)
    await Promise.all([
      supabase.from("dp_launch_channels").delete().eq("launch_id", id),
      supabase.from("dp_launch_pos").delete().eq("launch_id", id),
      supabase.from("dp_launch_periods").delete().eq("launch_id", id),
      supabase.from("dp_launch_email_sends").delete().eq("launch_id", id),
      supabase.from("dp_launch_variant_splits").delete().eq("launch_id", id),
      supabase.from("dp_launch_gwp_tiers").delete().eq("launch_id", id),
      supabase.from("dp_launch_upsells").delete().eq("launch_id", id),
      supabase.from("dp_launch_geo_split").delete().eq("launch_id", id),
      supabase.from("dp_launch_rebill_rates").delete().eq("launch_id", id),
      supabase.from("dp_launch_marketing_periods").delete().eq("launch_id", id),
      supabase.from("dp_launch_marketing_channels").delete().eq("launch_id", id),
      supabase.from("dp_launch_upsell_periods").delete().eq("launch_id", id),
    ]);
    const { error } = await supabase.from("dp_launches").delete().eq("id", id);
    if (error) { alert(`Failed to delete launch: ${error.message}`); return; }
    setLaunches(p => p.filter(l => l.id !== id));
    setChannels(p => p.filter(c => c.launch_id !== id));
    setPos(p => p.filter(po => po.launch_id !== id));
    setPeriods(p => p.filter(pr => pr.launch_id !== id));
    setEmailSends(p => p.filter(e => e.launch_id !== id));
    setVariantSplits(p => p.filter(v => v.launch_id !== id));
    setGwpTiers(p => p.filter(g => g.launch_id !== id));
    setUpsells(p => p.filter(u => u.launch_id !== id));
    setGeoSplit(p => p.filter(g => g.launch_id !== id));
    setRebillRates(p => p.filter(r => r.launch_id !== id));
    setMarketingChannels(p => p.filter(m => m.launch_id !== id));
    setMarketingPeriods(p => p.filter(mp => mp.launch_id !== id));
    setUpsellPeriods(p => p.filter(up => up.launch_id !== id));
    if (selected?.id === id) setSelected(null);
  };

  // ── GWP Pack Tiers (launch-scoped: 1-pack, 2-pack, 3-pack with take rates + free gifts) ──
  const launchGwpTiers = selected ? gwpTiers.filter(g => g.launch_id === selected.id) : [];

  const addGwpPackTier = async (launchId, packSize) => {
    const max = gwpTiers.filter(g => g.launch_id === launchId).reduce((m, g) => Math.max(m, g.sort_order || 0), -1);
    const { data } = await supabase.from("dp_launch_gwp_tiers").insert({
      org_id: orgId, launch_id: launchId, channel_id: null,
      pack_size: packSize, tier_label: `${packSize}-Pack`,
      take_rate_pct: 0, sort_order: max + 1,
    }).select().single();
    if (data) setGwpTiers(p => [...p, data]);
  };
  const updateGwpPackTier = async (id, updates) => {
    await supabase.from("dp_launch_gwp_tiers").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id);
    setGwpTiers(p => p.map(g => g.id === id ? { ...g, ...updates } : g));
  };
  const deleteGwpPackTier = async (id) => {
    await supabase.from("dp_launch_gwp_tiers").delete().eq("id", id);
    setGwpTiers(p => p.filter(g => g.id !== id));
  };

  // ── Marketing Channels (Email, SMS, Paid Ads, Influencer, Organic, Other) ──
  const addMarketingChannel = async (launchId, channelType, name) => {
    const max = marketingChannels.filter(m => m.launch_id === launchId).reduce((m, x) => Math.max(m, x.sort_order || 0), -1);
    const { data } = await supabase.from("dp_launch_marketing_channels").insert({
      org_id: orgId, launch_id: launchId, channel_type: channelType, name, sort_order: max + 1,
    }).select().single();
    if (data) setMarketingChannels(p => [...p, data]);
    return data;
  };
  const updateMarketingChannel = async (id, updates) => {
    await supabase.from("dp_launch_marketing_channels").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id);
    setMarketingChannels(p => p.map(m => m.id === id ? { ...m, ...updates } : m));
  };
  const deleteMarketingChannel = async (id) => {
    if (!confirm("Delete this marketing channel and all of its periods?")) return;
    await supabase.from("dp_launch_marketing_periods").delete().eq("marketing_channel_id", id);
    await supabase.from("dp_launch_marketing_channels").delete().eq("id", id);
    setMarketingChannels(p => p.filter(m => m.id !== id));
    setMarketingPeriods(p => p.filter(mp => mp.marketing_channel_id !== id));
  };
  const upsertMarketingPeriod = async (launchId, marketingChannelId, periodIndex, updates) => {
    const existing = marketingPeriods.find(mp => mp.marketing_channel_id === marketingChannelId && mp.period_index === periodIndex);
    if (existing) {
      await supabase.from("dp_launch_marketing_periods").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", existing.id);
      setMarketingPeriods(p => p.map(mp => mp.id === existing.id ? { ...mp, ...updates } : mp));
    } else {
      const { data } = await supabase.from("dp_launch_marketing_periods").insert({
        org_id: orgId, launch_id: launchId, marketing_channel_id: marketingChannelId, period_index: periodIndex, ...updates,
      }).select().single();
      if (data) setMarketingPeriods(p => [...p, data]);
    }
  };

  const addUpsell = async (launchId, name = "New Upsell") => {
    const max = upsells.filter(u => u.launch_id === launchId).reduce((m, u) => Math.max(m, u.sort_order || 0), -1);
    const { data } = await supabase.from("dp_launch_upsells").insert({
      org_id: orgId, launch_id: launchId, name,
      take_rate_pct: 20, units_per_order: 1, otp_pct: 50, sub_pct: 50,
      rebill_mode: "inherit", sort_order: max + 1,
    }).select().single();
    if (data) setUpsells(p => [...p, data]);
    return data;
  };
  const updateUpsell = async (id, updates) => {
    await supabase.from("dp_launch_upsells").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", id);
    setUpsells(p => p.map(u => u.id === id ? { ...u, ...updates } : u));
  };
  const deleteUpsell = async (id) => {
    if (!confirm("Delete this upsell?")) return;
    // Also delete any custom rebill rates + standalone period inputs scoped to this upsell
    await supabase.from("dp_launch_rebill_rates").delete().eq("scope_type", "upsell").eq("scope_id", id);
    await supabase.from("dp_launch_upsell_periods").delete().eq("upsell_id", id);
    await supabase.from("dp_launch_upsells").delete().eq("id", id);
    setUpsells(p => p.filter(u => u.id !== id));
    setRebillRates(p => p.filter(r => !(r.scope_type === "upsell" && r.scope_id === id)));
    setUpsellPeriods(p => p.filter(up => up.upsell_id !== id));
  };

  const upsertUpsellPeriod = async (launchId, upsellId, periodIndex, updates) => {
    const existing = upsellPeriods.find(up => up.upsell_id === upsellId && up.period_index === periodIndex);
    if (existing) {
      await supabase.from("dp_launch_upsell_periods").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", existing.id);
      setUpsellPeriods(p => p.map(up => up.id === existing.id ? { ...up, ...updates } : up));
    } else {
      const { data } = await supabase.from("dp_launch_upsell_periods").insert({
        org_id: orgId, launch_id: launchId, upsell_id: upsellId, period_index: periodIndex, ...updates,
      }).select().single();
      if (data) setUpsellPeriods(p => [...p, data]);
    }
  };

  // ── Geo split ──
  const upsertGeo = async (launchId, geoCode, updates) => {
    const existing = geoSplit.find(g => g.launch_id === launchId && g.geo_code === geoCode);
    if (existing) {
      await supabase.from("dp_launch_geo_split").update({ ...updates, updated_at: new Date().toISOString() }).eq("id", existing.id);
      setGeoSplit(p => p.map(g => g.id === existing.id ? { ...g, ...updates } : g));
    } else {
      const max = geoSplit.filter(g => g.launch_id === launchId).reduce((m, g) => Math.max(m, g.sort_order || 0), -1);
      const { data } = await supabase.from("dp_launch_geo_split").insert({
        org_id: orgId, launch_id: launchId, geo_code: geoCode, geo_label: updates.geo_label || geoCode,
        pct: updates.pct ?? 0, enabled: updates.enabled ?? true, sort_order: max + 1,
      }).select().single();
      if (data) setGeoSplit(p => [...p, data]);
    }
  };
  const deleteGeo = async (id) => {
    await supabase.from("dp_launch_geo_split").delete().eq("id", id);
    setGeoSplit(p => p.filter(g => g.id !== id));
  };

  // ── Rebill rates (per launch, scoped to GWP or specific upsell, per cohort, per month) ──
  const upsertRebillRate = async (launchId, scopeType, scopeId, cohort, monthIndex, ratePct) => {
    const existing = rebillRates.find(r =>
      r.launch_id === launchId && r.scope_type === scopeType &&
      (r.scope_id || null) === (scopeId || null) &&
      r.cohort === cohort && r.month_index === monthIndex
    );
    if (existing) {
      await supabase.from("dp_launch_rebill_rates").update({ rate_pct: ratePct, updated_at: new Date().toISOString() }).eq("id", existing.id);
      setRebillRates(p => p.map(r => r.id === existing.id ? { ...r, rate_pct: ratePct } : r));
    } else {
      const { data } = await supabase.from("dp_launch_rebill_rates").insert({
        org_id: orgId, launch_id: launchId, scope_type: scopeType, scope_id: scopeId,
        cohort, month_index: monthIndex, rate_pct: ratePct,
      }).select().single();
      if (data) setRebillRates(p => [...p, data]);
    }
  };

  const addChannel = async (launchId, channelKey) => {
    const def = CHANNEL_DEFS.find(d => d.key === channelKey);
    const { data } = await supabase.from("dp_launch_channels").insert({
      org_id: orgId, launch_id: launchId, channel: channelKey, label: def?.label || channelKey,
      units_per_order: 1, otp_pct: 30, sub_take_rate_pct: 70,
    }).select().single();
    if (data) setChannels(p => [...p, data]);
  };

  const updateChannel = async (id, updates) => {
    const ch = channels.find(c => c.id === id);
    const merged = { ...ch, ...updates };
    const units = calcChannelUnits(merged, channels, periods);
    const price = selected?.retail_price || 0;
    await supabase.from("dp_launch_channels").update({ ...updates, estimated_units: units, estimated_revenue: units * price, updated_at: new Date().toISOString() }).eq("id", id);
    setChannels(p => p.map(c => c.id === id ? { ...c, ...updates, estimated_units: units, estimated_revenue: units * price } : c));
  };

  const removeChannel = async (id) => {
    await supabase.from("dp_launch_channels").delete().eq("id", id);
    setChannels(p => p.filter(c => c.id !== id));
    setPeriods(p => p.filter(pr => pr.channel_id !== id));
    setEmailSends(p => p.filter(s => s.channel_id !== id));
    setVariantSplits(p => p.filter(s => s.channel_id !== id));
    setGwpTiers(p => p.filter(t => t.channel_id !== id));
  };

  // ── Period management (time-phased spend/CPA for paid channels) ──
  const addPeriod = async (channelId, index, typeOverride) => {
    const periodType = typeOverride || channels.find(c => c.id === channelId)?.period_type || "weekly";
    const label = periodType === "monthly" ? `Month ${index + 1}` : `Week ${index + 1}`;
    const { data } = await supabase.from("dp_launch_periods").insert({
      channel_id: channelId, period_label: label, period_index: index,
    }).select().single();
    if (data) setPeriods(p => [...p, data]);
  };

  const updatePeriod = async (id, updates) => {
    await supabase.from("dp_launch_periods").update(updates).eq("id", id);
    setPeriods(p => p.map(pr => pr.id === id ? { ...pr, ...updates } : pr));
  };

  const removePeriod = async (id) => {
    await supabase.from("dp_launch_periods").delete().eq("id", id);
    setPeriods(p => p.filter(pr => pr.id !== id));
  };

  const initPeriods = async (channelId, count, type) => {
    await updateChannel(channelId, { period_type: type });
    const existing = periods.filter(p => p.channel_id === channelId);
    for (const pr of existing) await supabase.from("dp_launch_periods").delete().eq("id", pr.id);
    setPeriods(p => p.filter(pr => pr.channel_id !== channelId));
    for (let i = 0; i < count; i++) {
      await addPeriod(channelId, i, type);
    }
  };

  // ── Email Send management (multiple sends per email channel) ──
  const addEmailSend = async (channelId) => {
    const existing = emailSends.filter(s => s.channel_id === channelId);
    const { data } = await supabase.from("dp_launch_email_sends").insert({
      org_id: orgId, channel_id: channelId, label: `Send ${existing.length + 1}`,
      sort_order: existing.length, list_size: 0, send_pct: 100, open_rate: 25, click_rate: 3, conversion_rate: 5, units_per_order: 1,
    }).select().single();
    if (data) setEmailSends(p => [...p, data]);
  };

  const updateEmailSend = async (id, updates) => {
    await supabase.from("dp_launch_email_sends").update(updates).eq("id", id);
    setEmailSends(p => p.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const removeEmailSend = async (id) => {
    await supabase.from("dp_launch_email_sends").delete().eq("id", id);
    setEmailSends(p => p.filter(s => s.id !== id));
  };

  // ── Variant Split management (pack-size allocation for hero GWP) ──
  const addVariantSplit = async (channelId) => {
    const existing = variantSplits.filter(s => s.channel_id === channelId);
    const { data } = await supabase.from("dp_launch_variant_splits").insert({
      org_id: orgId, channel_id: channelId, variant_label: `${existing.length + 1}-Pack`,
      units_per_variant: existing.length + 1, take_rate_pct: 25, sort_order: existing.length,
    }).select().single();
    if (data) setVariantSplits(p => [...p, data]);
  };

  const updateVariantSplit = async (id, updates) => {
    await supabase.from("dp_launch_variant_splits").update(updates).eq("id", id);
    setVariantSplits(p => p.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const removeVariantSplit = async (id) => {
    await supabase.from("dp_launch_variant_splits").delete().eq("id", id);
    setVariantSplits(p => p.filter(s => s.id !== id));
  };

  const copyVariantsFrom = async (targetChannelId, sourceChannelId) => {
    // Get source variants
    const sourceVariants = variantSplits.filter(v => v.channel_id === sourceChannelId);
    if (sourceVariants.length === 0) return;
    // Remove existing variants on target
    const existing = variantSplits.filter(v => v.channel_id === targetChannelId);
    for (const v of existing) {
      await supabase.from("dp_launch_variant_splits").delete().eq("id", v.id);
    }
    setVariantSplits(p => p.filter(v => v.channel_id !== targetChannelId));
    // Copy each variant
    for (const src of sourceVariants) {
      const { data } = await supabase.from("dp_launch_variant_splits").insert({
        org_id: orgId, channel_id: targetChannelId, variant_label: src.variant_label,
        units_per_variant: src.units_per_variant, take_rate_pct: src.take_rate_pct,
        first_purchase_price: src.first_purchase_price, subscription_price: src.subscription_price,
        rebill_rates: src.rebill_rates,
        reorder_frequency_weeks: src.reorder_frequency_weeks,
        churn_m1: src.churn_m1, churn_m2: src.churn_m2, churn_m3: src.churn_m3, churn_m4_plus: src.churn_m4_plus,
        sort_order: src.sort_order,
      }).select().single();
      if (data) setVariantSplits(p => [...p, data]);
    }
  };

  const initDefaultVariants = async (channelId) => {
    const defaults = [
      { label: "1-Pack", units: 1, pct: 18 },
      { label: "2-Pack", units: 2, pct: 32 },
      { label: "3-Pack", units: 3, pct: 22 },
      { label: "4-Pack", units: 4, pct: 28 },
    ];
    for (let i = 0; i < defaults.length; i++) {
      const { data } = await supabase.from("dp_launch_variant_splits").insert({
        org_id: orgId, channel_id: channelId, variant_label: defaults[i].label,
        units_per_variant: defaults[i].units, take_rate_pct: defaults[i].pct, sort_order: i,
      }).select().single();
      if (data) setVariantSplits(p => [...p, data]);
    }
  };

  // ── GWP Tier management (free gifts per spend tier for hero GWP) ──
  const addGwpTier = async (channelId) => {
    const existing = gwpTiers.filter(t => t.channel_id === channelId);
    const nextMin = existing.length === 0 ? 0 : Math.max(...existing.map(t => t.min_spend || 0)) + 25;
    const { data } = await supabase.from("dp_launch_gwp_tiers").insert({
      org_id: orgId, channel_id: channelId, tier_label: `Tier ${existing.length + 1}`,
      min_spend: nextMin, gift_name: "", gift_qty: 1, sort_order: existing.length,
    }).select().single();
    if (data) setGwpTiers(p => [...p, data]);
  };

  const updateGwpTier = async (id, updates) => {
    await supabase.from("dp_launch_gwp_tiers").update(updates).eq("id", id);
    setGwpTiers(p => p.map(t => t.id === id ? { ...t, ...updates } : t));
  };

  const removeGwpTier = async (id) => {
    await supabase.from("dp_launch_gwp_tiers").delete().eq("id", id);
    setGwpTiers(p => p.filter(t => t.id !== id));
  };

  const addPo = async (launchId) => {
    const lc = channels.filter(c => c.launch_id === launchId);
    const lp = periods.filter(p => lc.some(c => c.id === p.channel_id));
    const totalUnits = lc.reduce((s, c) => s + calcChannelUnits(c, lc, periods), 0);
    const moq = selected?.moq || 5000;
    const qty = Math.max(moq, Math.ceil(totalUnits / moq) * moq);
    const lt = selected?.lead_time_days || 45;
    const ld = selected?.launch_date;
    const orderBy = ld ? new Date(new Date(ld).getTime() - lt * 86400000).toISOString().slice(0, 10) : null;
    const { data } = await supabase.from("dp_launch_pos").insert({
      launch_id: launchId, quantity: qty, unit_cost: selected?.unit_cost || null,
      total_cost: qty * (selected?.unit_cost || 0), order_by_date: orderBy,
      expected_arrival: ld || null,
    }).select().single();
    if (data) setPos(p => [...p, data]);
  };

  const removePo = async (id) => {
    await supabase.from("dp_launch_pos").delete().eq("id", id);
    setPos(p => p.filter(po => po.id !== id));
  };

  const launchChannels = selected ? channels.filter(c => c.launch_id === selected.id) : [];
  const launchPeriods = periods.filter(p => launchChannels.some(c => c.id === p.channel_id));
  const launchPos = selected ? pos.filter(p => p.launch_id === selected.id) : [];
  const launchUpsells = selected ? upsells.filter(u => u.launch_id === selected.id) : [];
  const launchGeoSplit = selected ? geoSplit.filter(g => g.launch_id === selected.id) : [];
  const launchMarketingChannels = selected ? marketingChannels.filter(m => m.launch_id === selected.id) : [];
  const launchMarketingPeriods = selected ? marketingPeriods.filter(mp => mp.launch_id === selected.id) : [];
  const launchUpsellPeriods = selected ? upsellPeriods.filter(up => up.launch_id === selected.id) : [];
  
  // Calculate totals from orders → variant splits → units/revenue
  const totalOrders = launchChannels.reduce((s, c) => s + calcChannelUnits(c, launchChannels, launchPeriods, emailSends.filter(es => es.channel_id === c.id)), 0);
  
  // Sum units + revenue across all channels and their variant splits
  let totalUnits = 0;
  let totalRevenue = 0;
  let totalRebillOrders = 0;
  launchChannels.forEach(ch => {
    const chOrders = calcChannelUnits(ch, launchChannels, launchPeriods, emailSends.filter(es => es.channel_id === ch.id));
    const chSplits = variantSplits.filter(v => v.channel_id === ch.id);
    if (chSplits.length > 0) {
      chSplits.forEach(v => {
        const vOrders = Math.round(chOrders * ((v.take_rate_pct || 0) / 100));
        const vUnits = Math.round(vOrders * (v.units_per_variant || 1));
        totalUnits += vUnits;
        // Revenue: OTP orders × OTP price + Sub orders × Sub price
        const otpOrders = Math.round(vOrders * ((ch.otp_pct || 30) / 100));
        const subOrders = vOrders - otpOrders;
        totalRevenue += otpOrders * (v.first_purchase_price || 0) + subOrders * (v.subscription_price || 0);
        // Rebill revenue
        const vRates = Array.isArray(v.rebill_rates) ? v.rebill_rates : (Array.isArray(ch.rebill_rates) ? ch.rebill_rates : []);
        vRates.forEach(rate => {
          const rebillOrders = Math.round(subOrders * (rate / 100));
          totalRebillOrders += rebillOrders;
          totalRevenue += rebillOrders * (v.subscription_price || 0);
          totalUnits += Math.round(rebillOrders * (v.units_per_variant || 1));
        });
      });
    } else {
      // No variants — orders = units (qty 1)
      totalUnits += chOrders;
      totalRevenue += chOrders * (selected?.retail_price || 0);
    }
  });
  const totalCost = totalUnits * (selected?.unit_cost || 0);

  // I and ChannelInputs are defined outside this function (above) to avoid re-creation on render

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: T.text3 }}>Loading…</div>;

  // ── Detail view ──
  if (selected) {
    const st = STATUS_OPTS.find(s => s.value === selected.status);
    return (
      <div>
        <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 12, marginBottom: 12 }}>← Back to Launches</button>

        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>{selected.product_name}</div>
            {selected.name !== selected.product_name && <div style={{ fontSize: 12, color: T.text3 }}>{selected.name}</div>}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <select value={selected.status} onChange={e => updateLaunch(selected.id, "status", e.target.value)} style={{ padding: "4px 10px", fontSize: 11, fontWeight: 600, border: `1px solid ${st?.color || T.border}`, borderRadius: 6, background: (st?.color || T.accent) + "15", color: st?.color || T.accent, cursor: "pointer" }}>
              {STATUS_OPTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <button onClick={() => deleteLaunch(selected.id, selected.product_name)}
              title="Delete this launch"
              style={{ padding: "4px 10px", fontSize: 11, fontWeight: 600, background: "transparent", color: "#ef4444", border: `1px solid #ef4444`, borderRadius: 6, cursor: "pointer" }}
              onMouseEnter={e => { e.currentTarget.style.background = "#ef4444"; e.currentTarget.style.color = "white"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "#ef4444"; }}>
              🗑 Delete
            </button>
          </div>
        </div>

        {/* KPI Cards */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(5,1fr)", gap: 8, marginBottom: 20 }}>
          {[
            { label: "Total Units", value: fmt(totalUnits), sub: `${fmt(totalOrders)} orders + rebills`, color: T.accent },
            { label: "Revenue", value: "$" + fmt(Math.round(totalRevenue)), sub: "first + rebills", color: "#22c55e" },
            { label: "COGS", value: "$" + fmt(Math.round(totalCost)), sub: "total", color: "#f59e0b" },
            { label: "Margin", value: totalRevenue > 0 ? ((1 - totalCost / totalRevenue) * 100).toFixed(1) + "%" : "—", sub: "gross", color: "#10b981" },
            { label: "Channels", value: launchChannels.length, sub: "active", color: "#8b5cf6" },
          ].map(k => (
            <div key={k.label} style={{ padding: "12px 14px", background: T.surface2, borderRadius: 10, border: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 10, color: T.text3, fontWeight: 600, textTransform: "uppercase", marginBottom: 2 }}>{k.label}</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: k.color }}>{k.value}</div>
              <div style={{ fontSize: 9, color: T.text3 }}>{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Two column: Product Details + Supply */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, marginBottom: 20 }}>
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 10 }}>📋 Product Details</div>
            <I label="Product Name" value={selected.product_name} onChange={v => updateLaunch(selected.id, "product_name", v)} />
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: T.text3, marginBottom: 3 }}>Product SKU</div>
              <SkuPicker
                value={selected.product_sku || selected.sku}
                onChange={(skuCode) => {
                  // Keep legacy sku field in sync for any downstream code still reading it
                  updateLaunch(selected.id, "product_sku", skuCode);
                  updateLaunch(selected.id, "sku", skuCode);
                }}
                orgId={orgId}
                placeholder="Search SKU or product title…"
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <I label="Retail Price" value={selected.retail_price} onChange={v => updateLaunch(selected.id, "retail_price", v)} type="number" prefix="$" />
              <I label="Unit Cost" value={selected.unit_cost} onChange={v => updateLaunch(selected.id, "unit_cost", v)} type="number" prefix="$" />
              <I label="Target Margin %" value={selected.target_margin_pct} onChange={v => updateLaunch(selected.id, "target_margin_pct", v)} type="number" suffix="%" />
              <I label="Launch Date" value={selected.launch_date} onChange={v => updateLaunch(selected.id, "launch_date", v)} type="date" />
            </div>
          </div>
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 10 }}>🏭 Supply & Manufacturing</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <I label="MOQ" value={selected.moq} onChange={v => updateLaunch(selected.id, "moq", v)} type="number" suffix="units" />
              <I label="Lead Time" value={selected.lead_time_days} onChange={v => updateLaunch(selected.id, "lead_time_days", v)} type="number" suffix="days" />
              <I label="Max Monthly Capacity" value={selected.max_monthly_capacity} onChange={v => updateLaunch(selected.id, "max_monthly_capacity", v)} type="number" suffix="units/mo" placeholder="e.g. 200000" />
              <I label="Target Days of Supply" value={selected.target_days_of_supply} onChange={v => updateLaunch(selected.id, "target_days_of_supply", v)} type="number" suffix="days" placeholder="e.g. 60" />
              <I label="Units per Case" value={selected.units_per_case} onChange={v => updateLaunch(selected.id, "units_per_case", v)} type="number" />
              <I label="Forecast Period" value={selected.forecast_period_weeks} onChange={v => updateLaunch(selected.id, "forecast_period_weeks", v)} type="number" suffix="weeks" />
            </div>
            <I label="Supplier" value={selected.supplier} onChange={v => updateLaunch(selected.id, "supplier", v)} />
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* MARKETING CHANNELS — drive orders through Email, SMS, Paid Ads, etc. */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <MarketingChannelsSection
          launch={selected}
          launchMarketingChannels={launchMarketingChannels}
          launchMarketingPeriods={launchMarketingPeriods}
          updateLaunch={updateLaunch}
          addMarketingChannel={addMarketingChannel}
          updateMarketingChannel={updateMarketingChannel}
          deleteMarketingChannel={deleteMarketingChannel}
          upsertMarketingPeriod={upsertMarketingPeriod}
          T={T}
          isMobile={isMobile}
        />

        {/* ACQUISITION FUNNEL — GWP-driven (replaces multi-channel acquisition) */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {(() => {
          const totalAcqOrders = launchMarketingChannels.reduce((sum, ch) => {
            const channelPeriods = launchMarketingPeriods.filter(mp => mp.marketing_channel_id === ch.id);
            return sum + channelPeriods.reduce((s, p) => s + calcMarketingPeriodOrders(ch.channel_type, p), 0);
          }, 0);
          const otpOrders = Math.round(totalAcqOrders * (selected.gwp_otp_pct || 0) / 100);
          const subOrders = Math.round(totalAcqOrders * (selected.gwp_sub_pct || 0) / 100);
          return (
            <div style={{ background: "linear-gradient(135deg, " + T.surface + " 0%, " + T.accent + "06 100%)", border: `1px solid ${T.accent}40`, borderRadius: 10, padding: 14, marginBottom: 20 }}>
              {/* Compact header: title + computed stats inline */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: T.text }}>🎁 Acquisition Funnel <span style={{ fontWeight: 400, color: T.text3, fontSize: 11 }}>· Hero GWP</span></div>
                  <div style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>Orders flow from marketing channels above. Split between OTP and Subscription cohorts.</div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ padding: "5px 10px", background: T.accent + "12", border: `1px solid ${T.accent}30`, borderRadius: 6, display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span style={{ fontSize: 9, color: T.text3, fontWeight: 600, textTransform: "uppercase" }}>Total</span>
                    <span style={{ fontSize: 16, fontWeight: 800, color: T.accent }}>{fmt(totalAcqOrders)}</span>
                  </div>
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <div style={{ padding: "5px 8px", background: "#f59e0b15", borderRadius: 6, display: "flex", alignItems: "baseline", gap: 4 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: "#f59e0b" }}>OTP</span>
                      <input type="number" value={selected.gwp_otp_pct ?? 50}
                        onChange={e => {
                          const otp = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
                          updateLaunch(selected.id, "gwp_otp_pct", otp);
                          updateLaunch(selected.id, "gwp_sub_pct", 100 - otp);
                        }}
                        style={{ width: 36, padding: "1px 3px", fontSize: 11, fontWeight: 700, color: "#f59e0b", border: `1px solid #f59e0b40`, borderRadius: 3, background: T.surface, outline: "none", textAlign: "center" }} />
                      <span style={{ fontSize: 9, color: "#f59e0b" }}>%</span>
                      <span style={{ fontSize: 9, color: T.text3, marginLeft: 4 }}>· {fmt(otpOrders)}</span>
                    </div>
                    <div style={{ padding: "5px 8px", background: "#22c55e15", borderRadius: 6, display: "flex", alignItems: "baseline", gap: 4 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: "#22c55e" }}>Sub</span>
                      <input type="number" value={selected.gwp_sub_pct ?? 50}
                        onChange={e => {
                          const sub = Math.max(0, Math.min(100, parseFloat(e.target.value) || 0));
                          updateLaunch(selected.id, "gwp_sub_pct", sub);
                          updateLaunch(selected.id, "gwp_otp_pct", 100 - sub);
                        }}
                        style={{ width: 36, padding: "1px 3px", fontSize: 11, fontWeight: 700, color: "#22c55e", border: `1px solid #22c55e40`, borderRadius: 3, background: T.surface, outline: "none", textAlign: "center" }} />
                      <span style={{ fontSize: 9, color: "#22c55e" }}>%</span>
                      <span style={{ fontSize: 9, color: T.text3, marginLeft: 4 }}>· {fmt(subOrders)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Pack-size take rates + free gifts (GWP offer config) */}
              <PackTiersEditor
                launchId={selected.id}
                orgId={orgId}
                tiers={launchGwpTiers}
                totalAcqOrders={totalAcqOrders}
                addGwpPackTier={addGwpPackTier}
                updateGwpPackTier={updateGwpPackTier}
                deleteGwpPackTier={deleteGwpPackTier}
                T={T}
                isMobile={isMobile}
              />

              {/* Rebill rate table */}
              <RebillRatesEditor
                launchId={selected.id}
                scopeType="gwp"
                scopeId={null}
                otpPct={selected.gwp_otp_pct || 0}
                subPct={selected.gwp_sub_pct || 0}
                rebillRates={rebillRates}
                upsertRebillRate={upsertRebillRate}
                forecastWeeks={selected.forecast_period_weeks || 12}
                T={T}
                isMobile={isMobile}
              />
            </div>
          );
        })()}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* UPSELLS — multiple named upsells per launch                       */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {(() => {
          // Pre-compute per-upsell totals so we can both render each card AND a footer summary
          const totalAcqOrders = launchMarketingChannels.reduce((sum, ch) => {
            const cps = launchMarketingPeriods.filter(mp => mp.marketing_channel_id === ch.id);
            return sum + cps.reduce((s, p) => s + calcMarketingPeriodOrders(ch.channel_type, p), 0);
          }, 0);
          const upsellsWithTotals = launchUpsells.map(u => {
            const isStandalone = u.funnel_mode === "standalone";
            const upInputMode = u.input_mode || "spend_cpa";
            const upPeriods = launchUpsellPeriods.filter(up => up.upsell_id === u.id);
            const standaloneNewOrders = upPeriods.reduce((s, p) => {
              if (upInputMode === "direct") return s + (parseInt(p.direct_orders) || 0);
              const sp = parseFloat(p.spend) || 0;
              const cpa = parseFloat(p.cpa) || 0;
              return s + (cpa > 0 ? Math.round(sp / cpa) : 0);
            }, 0);
            const standaloneOrders = Math.round(standaloneNewOrders * (u.take_rate_pct || 0) / 100);
            const upTotalOrders = isStandalone
              ? standaloneOrders
              : Math.round(totalAcqOrders * (u.take_rate_pct || 0) / 100);
            const upu = parseInt(u.units_per_order) || 1;
            const upTotalUnits = upTotalOrders * upu;
            const upTotalRevenue = upTotalUnits * (parseFloat(u.unit_price) || 0);
            return { u, isStandalone, upPeriods, upTotalOrders, upTotalUnits, upTotalRevenue, unitsPerOrder: upu };
          });
          const grandOrders = upsellsWithTotals.reduce((s, x) => s + x.upTotalOrders, 0);
          const grandUnits = upsellsWithTotals.reduce((s, x) => s + x.upTotalUnits, 0);
          const grandRevenue = upsellsWithTotals.reduce((s, x) => s + x.upTotalRevenue, 0);

          return (
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 16, marginBottom: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>⬆️ Post-Purchase Upsells ({launchUpsells.length})</div>
                <button onClick={() => addUpsell(selected.id, `Upsell ${launchUpsells.length + 1}`)}
                  style={{ padding: "5px 12px", fontSize: 11, fontWeight: 600, background: T.accent, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>+ Add Upsell</button>
              </div>
              {launchUpsells.length === 0 ? (
                <div style={{ padding: 24, textAlign: "center", color: T.text3, fontSize: 11, fontStyle: "italic", border: `1px dashed ${T.border}`, borderRadius: 8 }}>
                  No upsells configured. Click "+ Add Upsell" to add one — e.g., a same-product upsell or cross-sell.
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {upsellsWithTotals.map(({ u, isStandalone, upPeriods, upTotalOrders, upTotalUnits, upTotalRevenue, unitsPerOrder }) => {
                    return (
                  <div key={u.id} style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, padding: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 8, flexWrap: "wrap" }}>
                      <input value={u.name || ""} onChange={e => updateUpsell(u.id, { name: e.target.value })}
                        placeholder="Upsell name (e.g., Same-product 2-pack upsell)"
                        style={{ flex: 1, minWidth: 180, fontSize: 13, fontWeight: 700, color: T.text, background: "transparent", border: "none", outline: "none", padding: "2px 0" }} />
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <div style={{ padding: "3px 8px", background: T.accent + "12", borderRadius: 5, fontSize: 10, color: T.accent, fontWeight: 600 }}>
                          {fmt(upTotalOrders)} orders
                        </div>
                        <div style={{ padding: "3px 8px", background: "#22c55e15", borderRadius: 5, fontSize: 10, color: "#22c55e", fontWeight: 600 }}>
                          {fmt(upTotalUnits)} units
                          {unitsPerOrder !== 1 && <span style={{ marginLeft: 3, fontWeight: 400, opacity: 0.75 }}>(× {unitsPerOrder}/ord)</span>}
                        </div>
                        {upTotalRevenue > 0 && (
                          <div style={{ padding: "3px 8px", background: "#f59e0b15", borderRadius: 5, fontSize: 10, color: "#f59e0b", fontWeight: 600 }}>
                            ${fmt(Math.round(upTotalRevenue))}
                          </div>
                        )}
                        <button onClick={() => deleteUpsell(u.id)} title="Remove" style={{ background: "transparent", border: "none", color: T.text3, cursor: "pointer", fontSize: 14, padding: "0 4px" }}>×</button>
                      </div>
                    </div>

                    {/* Funnel mode toggle */}
                    <div style={{ marginBottom: 10, padding: 10, background: T.surface, borderRadius: 6, border: `1px solid ${T.border}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: T.text }}>Upsell Source:</div>
                        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: T.text2, cursor: "pointer" }}>
                          <input type="radio" checked={!isStandalone} onChange={() => updateUpsell(u.id, { funnel_mode: "attached" })} />
                          Attached to Hero GWP <span style={{ color: T.text3 }}>(take rate × new acquisitions)</span>
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: T.text2, cursor: "pointer" }}>
                          <input type="radio" checked={isStandalone} onChange={() => updateUpsell(u.id, { funnel_mode: "standalone" })} />
                          Standalone funnel <span style={{ color: T.text3 }}>(its own monthly orders)</span>
                        </label>
                      </div>
                    </div>

                    <I label="Description (optional)" value={u.description || ""} onChange={v => updateUpsell(u.id, { description: v })} placeholder="e.g., Discount on additional pack at checkout" />

                    {/* Common fields */}
                    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr 1fr", gap: 8, marginTop: 8 }}>
                      <I label="Take Rate" value={u.take_rate_pct} onChange={v => updateUpsell(u.id, { take_rate_pct: parseFloat(v) || 0 })} type="number" suffix="%" />
                      <I label="Units / Order" value={u.units_per_order} onChange={v => updateUpsell(u.id, { units_per_order: parseInt(v) || 1 })} type="number" />
                      <I label="Unit Price" value={u.unit_price} onChange={v => updateUpsell(u.id, { unit_price: parseFloat(v) || null })} type="number" prefix="$" />
                      <I label="OTP %" value={u.otp_pct} onChange={v => {
                        const otp = Math.max(0, Math.min(100, parseFloat(v) || 0));
                        updateUpsell(u.id, { otp_pct: otp, sub_pct: 100 - otp });
                      }} type="number" suffix="%" />
                      <I label="Sub %" value={u.sub_pct} onChange={v => {
                        const sub = Math.max(0, Math.min(100, parseFloat(v) || 0));
                        updateUpsell(u.id, { sub_pct: sub, otp_pct: 100 - sub });
                      }} type="number" suffix="%" />
                    </div>

                    {/* Standalone-only: per-period orders grid */}
                    {isStandalone && (
                      <UpsellPeriodsEditor
                        launch={selected}
                        upsell={u}
                        upsellPeriods={upPeriods}
                        upsertUpsellPeriod={(periodIndex, updates) => upsertUpsellPeriod(selected.id, u.id, periodIndex, updates)}
                        updateUpsell={updateUpsell}
                        T={T}
                        isMobile={isMobile}
                      />
                    )}

                    {/* Rebill mode toggle */}
                    <div style={{ marginTop: 10, padding: 10, background: T.surface, borderRadius: 6, border: `1px solid ${T.border}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: u.rebill_mode === "custom" ? 10 : 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: T.text }}>Rebill Rates:</div>
                        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: T.text2, cursor: "pointer" }}>
                          <input type="radio" checked={u.rebill_mode === "inherit"} onChange={() => updateUpsell(u.id, { rebill_mode: "inherit" })} />
                          Inherit from main GWP
                        </label>
                        <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: T.text2, cursor: "pointer" }}>
                          <input type="radio" checked={u.rebill_mode === "custom"} onChange={() => updateUpsell(u.id, { rebill_mode: "custom" })} />
                          Set custom rates
                        </label>
                      </div>
                      {u.rebill_mode === "custom" && (
                        <RebillRatesEditor
                          launchId={selected.id}
                          scopeType="upsell"
                          scopeId={u.id}
                          otpPct={u.otp_pct || 0}
                          subPct={u.sub_pct || 0}
                          rebillRates={rebillRates}
                          upsertRebillRate={upsertRebillRate}
                          forecastWeeks={selected.forecast_period_weeks || 12}
                          T={T}
                          isMobile={isMobile}
                          compact
                        />
                      )}
                    </div>
                  </div>
                );
              })}
                  {/* Footer: summary across all upsells */}
                  {upsellsWithTotals.length > 1 && (
                    <div style={{ marginTop: 4, padding: "10px 14px", background: T.accent + "08", border: `1px solid ${T.accent}30`, borderRadius: 8, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: T.text2 }}>Total across {upsellsWithTotals.length} upsells:</div>
                      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                        <div><span style={{ fontSize: 9, color: T.text3, fontWeight: 600, textTransform: "uppercase" }}>Orders </span><span style={{ fontSize: 14, fontWeight: 800, color: T.accent }}>{fmt(grandOrders)}</span></div>
                        <div><span style={{ fontSize: 9, color: T.text3, fontWeight: 600, textTransform: "uppercase" }}>Units </span><span style={{ fontSize: 14, fontWeight: 800, color: "#22c55e" }}>{fmt(grandUnits)}</span></div>
                        {grandRevenue > 0 && (
                          <div><span style={{ fontSize: 9, color: T.text3, fontWeight: 600, textTransform: "uppercase" }}>Revenue </span><span style={{ fontSize: 14, fontWeight: 800, color: "#f59e0b" }}>${fmt(Math.round(grandRevenue))}</span></div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* GEOGRAPHY — distribution split for shipping/demand allocation     */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {(() => {
          const totalAcqOrders = launchMarketingChannels.reduce((sum, ch) => {
            const cps = launchMarketingPeriods.filter(mp => mp.marketing_channel_id === ch.id);
            return sum + cps.reduce((s, p) => s + calcMarketingPeriodOrders(ch.channel_type, p), 0);
          }, 0);
          return (
            <GeographySection
              launchId={selected.id}
              launchGeoSplit={launchGeoSplit}
              totalAcquisitionOrders={totalAcqOrders}
              upsertGeo={upsertGeo}
              deleteGeo={deleteGeo}
              T={T}
              isMobile={isMobile}
            />
          );
        })()}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* CAPACITY & DAYS OF SUPPLY — production guardrails                 */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        {(() => {
          const dem = computeMonthlyDemand({
            launch: selected,
            marketingChannels: launchMarketingChannels,
            marketingPeriods: launchMarketingPeriods,
            packTiers: launchGwpTiers,
            rebillRates,
            upsells: launchUpsells,
            upsellPeriods: launchUpsellPeriods,
          });
          // Use the longer of: launch forecast_period_weeks (legacy) or v3 totalMonths × ~4.33
          const effectiveForecastWeeks = Math.max(
            selected.forecast_period_weeks || 12,
            Math.round(dem.totalMonths * 4.33)
          );
          return (
            <CapacityDosSection
              launch={selected}
              totalUnits={dem.grandTotalUnits}
              peakUnits={dem.peakUnits}
              maxMonthlyCapacity={selected.max_monthly_capacity}
              targetDos={selected.target_days_of_supply}
              forecastWeeks={effectiveForecastWeeks}
              updateLaunch={updateLaunch}
              T={T}
              isMobile={isMobile}
            />
          );
        })()}

        {/* ═══════════════════════════════════════════════════════════════════ */}
        {/* MONTHLY DEMAND SCHEDULE — pulls everything together               */}
        {/* ═══════════════════════════════════════════════════════════════════ */}
        <MonthlyDemandSchedule
          launch={selected}
          marketingChannels={launchMarketingChannels}
          marketingPeriods={launchMarketingPeriods}
          packTiers={launchGwpTiers}
          rebillRates={rebillRates}
          upsells={launchUpsells}
          upsellPeriods={launchUpsellPeriods}
          T={T}
          isMobile={isMobile}
        />

        {/* Sales Channels (non-acquisition: Amazon, TikTok, Retail, etc.) */}
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 16, marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>🛒 Other Sales Channels</div>
          </div>
          <div style={{ fontSize: 11, color: T.text3, marginBottom: 12, lineHeight: 1.5 }}>Non-acquisition channels with their own demand. Use these for marketplace sales (Amazon, TikTok), retail distribution, and wholesale.</div>

          {/* Add channel buttons — grouped */}
          {[
            { group: "marketplace", label: "Marketplace" },
            { group: "offline", label: "Offline / Wholesale" },
            { group: "other", label: "Other" },
          ].map(g => {
            const groupDefs = CHANNEL_DEFS.filter(cd => cd.group === g.group);
            if (!groupDefs.length) return null;
            return (
              <div key={g.group} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{g.label}</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {groupDefs.map(cd => {
                    const exists = launchChannels.some(c => c.channel === cd.key);
                    return (
                      <button key={cd.key} onClick={() => !exists && addChannel(selected.id, cd.key)} disabled={exists}
                        style={{ padding: "5px 10px", fontSize: 10, fontWeight: 600, borderRadius: 6, border: `1px solid ${exists ? T.border : T.accent + "40"}`, background: exists ? T.surface2 : T.accent + "08", color: exists ? T.text3 : T.accent, cursor: exists ? "default" : "pointer", opacity: exists ? 0.5 : 1, display: "flex", alignItems: "center", gap: 4 }}>
                        <span>{cd.icon}</span> {cd.label} {exists && "✓"}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Channel cards */}
          {launchChannels.length === 0 ? (
            <div style={{ padding: 30, textAlign: "center", color: T.text3, fontSize: 12 }}>No channels added yet. Click a channel above to add it.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {launchChannels.map(ch => {
                const def = CHANNEL_DEFS.find(d => d.key === ch.channel);
                const chOrders = calcChannelUnits(ch, launchChannels, launchPeriods, emailSends.filter(es => es.channel_id === ch.id));
                const chSplits = variantSplits.filter(v => v.channel_id === ch.id);
                let chUnits = 0;
                if (chSplits.length > 0) {
                  chSplits.forEach(v => { chUnits += Math.round(Math.round(chOrders * ((v.take_rate_pct || 0) / 100)) * (v.units_per_variant || 1)); });
                } else { chUnits = chOrders; }
                const pct = totalOrders > 0 ? ((chOrders / totalOrders) * 100).toFixed(1) : 0;
                return (
                  <div key={ch.id} style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden" }}>
                    <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `1px solid ${T.border}` }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 16 }}>{def?.icon}</span>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{def?.label || ch.channel}</div>
                          <div style={{ fontSize: 10, color: T.text3 }}>{def?.desc}</div>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ textAlign: "right" }}>
                          <div style={{ fontSize: 15, fontWeight: 800, color: T.accent }}>{fmt(chOrders)} orders</div>
                          <div style={{ fontSize: 9, color: T.text3 }}>{fmt(chUnits)} units · {pct}% of orders</div>
                        </div>
                        <button onClick={() => removeChannel(ch.id)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 14 }}>×</button>
                      </div>
                    </div>
                    <div style={{ padding: "10px 14px" }}>
                      <ChannelInputs ch={ch} onUpdateChannel={updateChannel} allChannels={launchChannels} allPeriods={launchPeriods} onAddPeriod={addPeriod} onUpdatePeriod={updatePeriod} onRemovePeriod={removePeriod} onInitPeriods={initPeriods} emailSends={emailSends.filter(s => s.channel_id === ch.id)} onAddEmailSend={addEmailSend} onUpdateEmailSend={updateEmailSend} onRemoveEmailSend={removeEmailSend} variantSplits={variantSplits.filter(s => s.channel_id === ch.id)} allVariantSplits={variantSplits} onAddVariantSplit={addVariantSplit} onUpdateVariantSplit={updateVariantSplit} onRemoveVariantSplit={removeVariantSplit} onInitDefaultVariants={initDefaultVariants} onCopyVariantsFrom={copyVariantsFrom} gwpTiers={gwpTiers.filter(t => t.channel_id === ch.id)} onAddGwpTier={addGwpTier} onUpdateGwpTier={updateGwpTier} onRemoveGwpTier={removeGwpTier} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Total bar */}
          {launchChannels.length > 0 && (
            <div style={{ marginTop: 12, padding: "12px 16px", background: T.accent + "12", borderRadius: 8, border: `1px solid ${T.accent}30`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.accent }}>Total Forecast Demand</span>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: T.accent }}>{fmt(totalUnits)} units</div>
                <div style={{ fontSize: 11, color: T.text3 }}>${fmt(Math.round(totalRevenue))} revenue · ${fmt(Math.round(totalCost))} COGS</div>
              </div>
            </div>
          )}
        </div>


        {/* Purchase Orders */}
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>📋 Purchase Orders</div>
            <button onClick={() => addPo(selected.id)} style={{ padding: "5px 14px", fontSize: 11, fontWeight: 600, borderRadius: 6, border: `1px solid ${T.accent}40`, background: T.accent + "10", color: T.accent, cursor: "pointer" }}>+ Generate PO</button>
          </div>
          {launchPos.length === 0 ? (
            <div style={{ padding: 20, textAlign: "center", color: T.text3, fontSize: 12 }}>No POs yet. Click "Generate PO" to auto-calculate based on forecast + MOQ + lead time.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {launchPos.map(po => (
                <div key={po.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: T.surface2, borderRadius: 8, border: `1px solid ${T.border}` }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{fmt(po.quantity)} units</div>
                    <div style={{ fontSize: 10, color: T.text3 }}>
                      ${fmt(Math.round(po.total_cost || 0))} · Order by {po.order_by_date || "—"} · Arrival {po.expected_arrival || "—"}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 4, background: po.status === "ordered" ? "#0ea5e915" : po.status === "received" ? "#22c55e15" : "#6366f115", color: po.status === "ordered" ? "#0ea5e9" : po.status === "received" ? "#22c55e" : "#6366f1" }}>{po.status}</span>
                  <button onClick={() => removePo(po.id)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 12 }}>🗑</button>
                </div>
              ))}
            </div>
          )}
          {totalUnits > 0 && selected.moq && (
            <div style={{ marginTop: 10, fontSize: 10, color: T.text3, lineHeight: 1.5 }}>
              💡 MOQ: {fmt(selected.moq)} · Lead time: {selected.lead_time_days}d · Forecast: {fmt(totalUnits)} units → Recommended PO: {fmt(Math.max(selected.moq, Math.ceil(totalUnits / selected.moq) * selected.moq))} units
              {selected.launch_date && ` · Order by: ${new Date(new Date(selected.launch_date).getTime() - (selected.lead_time_days || 45) * 86400000).toISOString().slice(0, 10)}`}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── List view ──
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Product Launches</div>
        <button onClick={() => setShowNew(true)} style={{ padding: "8px 18px", fontSize: 12, fontWeight: 700, borderRadius: 8, border: "none", background: T.accent, color: "#fff", cursor: "pointer" }}>+ New Launch</button>
      </div>

      {/* New launch form */}
      {showNew && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 12 }}>New Product Launch</div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 10 }}>
            <I label="Product Name *" value={form.product_name} onChange={v => setForm(f => ({ ...f, product_name: v }))} placeholder="e.g. Laundry Sheets - Lemon" />
            <I label="Launch Name" value={form.name} onChange={v => setForm(f => ({ ...f, name: v }))} placeholder="e.g. Q3 Lemon Launch" />
            <I label="Launch Date" value={form.launch_date} onChange={v => setForm(f => ({ ...f, launch_date: v }))} type="date" />
            <I label="Unit Cost" value={form.unit_cost} onChange={v => setForm(f => ({ ...f, unit_cost: v }))} type="number" prefix="$" />
            <I label="Retail Price" value={form.retail_price} onChange={v => setForm(f => ({ ...f, retail_price: v }))} type="number" prefix="$" />
            <I label="MOQ" value={form.moq} onChange={v => setForm(f => ({ ...f, moq: v }))} type="number" suffix="units" />
            <I label="Lead Time" value={form.lead_time_days} onChange={v => setForm(f => ({ ...f, lead_time_days: v }))} type="number" suffix="days" />
            <I label="Supplier" value={form.supplier} onChange={v => setForm(f => ({ ...f, supplier: v }))} />
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
            <button onClick={() => setShowNew(false)} style={{ padding: "6px 16px", fontSize: 11, fontWeight: 600, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface2, color: T.text3, cursor: "pointer" }}>Cancel</button>
            <button onClick={createLaunch} disabled={!form.product_name.trim()} style={{ padding: "6px 20px", fontSize: 11, fontWeight: 700, border: "none", borderRadius: 6, background: T.accent, color: "#fff", cursor: "pointer", opacity: form.product_name.trim() ? 1 : 0.4 }}>Create Launch</button>
          </div>
        </div>
      )}

      {/* Launch list */}
      {launches.length === 0 && !showNew ? (
        <div style={{ padding: 60, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🚀</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>No Product Launches Yet</div>
          <div style={{ fontSize: 12, color: T.text3, marginTop: 6, maxWidth: 420, margin: "6px auto 0", lineHeight: 1.6 }}>Plan demand for new product launches by estimating demand across promotion channels — GWP, upsell, Amazon, email, retail, and more.</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {launches.map(l => {
            const lc = channels.filter(c => c.launch_id === l.id);
            const tu = lc.reduce((s, c) => s + calcChannelUnits(c, lc, periods.filter(p => lc.some(ch => ch.id === p.channel_id))), 0);
            const st = STATUS_OPTS.find(s => s.value === l.status);
            return (
              <div key={l.id} style={{ padding: "14px 18px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, transition: "all 0.1s", display: "flex", alignItems: "center", gap: 12 }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent + "40"; }} onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; }}>
                <div onClick={() => setSelected(l)} style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, cursor: "pointer" }}>
                  <div style={{ fontSize: 24 }}>🚀</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{l.product_name}</div>
                    <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>
                      {l.launch_date || "No date"} · {lc.length} channels · {fmt(tu)} units forecast
                      {l.supplier && ` · ${l.supplier}`}
                    </div>
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 6, background: (st?.color || T.text3) + "15", color: st?.color || T.text3 }}>{st?.label || l.status}</span>
                </div>
                <button onClick={(e) => { e.stopPropagation(); deleteLaunch(l.id, l.product_name); }}
                  title="Delete launch"
                  style={{ padding: "6px 10px", fontSize: 11, fontWeight: 600, background: "transparent", color: T.text3, border: `1px solid ${T.border}`, borderRadius: 6, cursor: "pointer", whiteSpace: "nowrap" }}
                  onMouseEnter={e => { e.currentTarget.style.background = "#ef4444"; e.currentTarget.style.color = "white"; e.currentTarget.style.borderColor = "#ef4444"; }}
                  onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = T.text3; e.currentTarget.style.borderColor = T.border; }}>
                  🗑 Delete
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN DEMAND PLANNING VIEW
// ═══════════════════════════════════════════════════════════════════════════════
export default function DemandPlanningView({ isMobile, orgId }) {
  const [tab, setTab] = useState("supply");
  const [showMetabaseSync, setShowMetabaseSync] = useState(false);
  const tabs = [
    { id: "supply", label: "Supply Chain", icon: "📦" },
    { id: "launches", label: "New Product Launch", icon: "🚀" },
    { id: "growth", label: "Growth Planner", icon: "📈" },
    { id: "sources", label: "Data Sources", icon: "🔌" },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: T.text, letterSpacing: "-0.3px" }}>Demand Planning</div>
          <div style={{ fontSize: 12, color: T.text3, marginTop: 2 }}>Forecast demand, plan inventory, and model growth scenarios</div>
        </div>
        <button onClick={() => setShowMetabaseSync(true)}
          style={{ padding: "6px 14px", fontSize: 11, fontWeight: 600, borderRadius: 6, border: `1px solid ${T.accent}30`, background: T.accent + "10", color: T.accent, cursor: "pointer", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
          📊 Sync from Metabase
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${T.border}`, marginBottom: 20 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 18px", background: "none", border: "none", borderBottom: tab === t.id ? `2px solid ${T.accent}` : "2px solid transparent", cursor: "pointer", color: tab === t.id ? T.accent : T.text3, fontSize: 12, fontWeight: tab === t.id ? 700 : 500, transition: "all 0.15s" }}>
            <span style={{ fontSize: 14 }}>{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === "supply" && <SupplyChainView isMobile={isMobile} orgId={orgId} />}
      {tab === "launches" && <LaunchPlannerView isMobile={isMobile} orgId={orgId} />}
      {tab === "growth" && <GrowthPlannerView isMobile={isMobile} orgId={orgId} />}
      {tab === "sources" && <DataSourcesView isMobile={isMobile} orgId={orgId} />}
      {showMetabaseSync && <MetabaseSync onClose={() => setShowMetabaseSync(false)} />}
    </div>
  );
}
