"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { T } from "../tokens";

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
  const EB_ORG = "a0000000-0000-0000-0000-000000000001";
  const isEB = orgId === EB_ORG;
  
  // Only show mock data for Earth Breeze; other orgs get empty state until data sources are connected
  if (!isEB) {
    return (
      <div style={{ padding: 60, textAlign: "center" }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>📦</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>No Supply Chain Data Yet</div>
        <div style={{ fontSize: 12, color: T.text3, marginTop: 6, maxWidth: 400, margin: "6px auto 0", lineHeight: 1.6 }}>Connect your data sources in the Data Sources tab to start tracking inventory health, demand forecasts, and PO recommendations for this workspace.</div>
      </div>
    );
  }
  const sortedInv = [...MOCK_INVENTORY].sort((a, b) => {
    const aWos = a.on_hand / Math.max(a.weekly_demand, 1);
    const bWos = b.on_hand / Math.max(b.weekly_demand, 1);
    return aWos - bWos;
  });

  const totalOnHand = MOCK_INVENTORY.reduce((s, i) => s + i.on_hand, 0);
  const totalIncoming = MOCK_INVENTORY.reduce((s, i) => s + i.incoming, 0);
  const totalWeeklyDemand = MOCK_INVENTORY.reduce((s, i) => s + i.weekly_demand, 0);
  const avgWos = totalOnHand / Math.max(totalWeeklyDemand, 1);
  const criticalCount = sortedInv.filter(i => (i.on_hand / Math.max(i.weekly_demand, 1)) < 4).length;

  const getRisk = (wos) => wos < 3 ? "critical" : wos < 5 ? "red" : wos < 8 ? "yellow" : "green";
  const getRiskLabel = (wos) => wos < 3 ? "CRITICAL" : wos < 5 ? "LOW" : wos < 8 ? "WATCH" : "OK";

  return (
    <div>
      {/* KPI Strip */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
        <KPI label="Total On-Hand" value={fmt(totalOnHand)} sub="units across all warehouses" icon="📦" />
        <KPI label="Incoming" value={fmt(totalIncoming)} sub="on open POs / in transit" icon="🚢" color={T.accent} />
        <KPI label="Avg Weeks of Supply" value={avgWos.toFixed(1)} sub={`at ${fmt(totalWeeklyDemand)} units/week`} icon="⏱" color={avgWos < 6 ? "#f59e0b" : "#22c55e"} />
        <KPI label="At Risk SKUs" value={criticalCount} sub="below 4 weeks supply" icon="⚠️" color={criticalCount > 0 ? "#ef4444" : "#22c55e"} />
      </div>

      {/* Inventory Health Table */}
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Inventory Health by Product</div>
            <div style={{ fontSize: 11, color: T.text3 }}>Sorted by weeks of supply — most urgent first</div>
          </div>
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: T.surface2 }}>
                {["Product", "Warehouse", "On Hand", "Incoming", "Weekly Demand", "Weeks of Supply", "Risk", "Reorder By"].map(h => (
                  <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.04em", whiteSpace: "nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedInv.map((inv, i) => {
                const wos = inv.on_hand / Math.max(inv.weekly_demand, 1);
                const risk = getRisk(wos);
                const reorderBy = new Date();
                reorderBy.setDate(reorderBy.getDate() + Math.max(0, (wos - (inv.lead_time / 7)) * 7));
                return (
                  <tr key={i} style={{ borderBottom: `1px solid ${T.border}`, background: risk === "critical" ? "#fef2f210" : risk === "red" ? "#fef2f208" : "transparent" }}>
                    <td style={{ padding: "10px 12px", fontWeight: 600, color: T.text, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{inv.base_product}</td>
                    <td style={{ padding: "10px 12px", color: T.text2 }}>{inv.warehouse}</td>
                    <td style={{ padding: "10px 12px", fontWeight: 700, fontFamily: "monospace" }}>{fmt(inv.on_hand)}</td>
                    <td style={{ padding: "10px 12px", fontFamily: "monospace", color: inv.incoming > 0 ? T.accent : T.text3 }}>{inv.incoming > 0 ? `+${fmt(inv.incoming)}` : "—"}{inv.arrival ? <span style={{ fontSize: 9, color: T.text3, marginLeft: 4 }}>({inv.arrival})</span> : ""}</td>
                    <td style={{ padding: "10px 12px", fontFamily: "monospace" }}>{fmt(inv.weekly_demand)}/wk</td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 60, height: 6, borderRadius: 3, background: T.surface3, overflow: "hidden" }}>
                          <div style={{ height: "100%", width: `${Math.min(100, (wos / 12) * 100)}%`, background: RISK_COLORS[risk], borderRadius: 3 }} />
                        </div>
                        <span style={{ fontWeight: 700, fontFamily: "monospace", color: RISK_COLORS[risk] }}>{wos.toFixed(1)}</span>
                      </div>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: RISK_COLORS[risk] + "18", color: RISK_COLORS[risk] }}>{getRiskLabel(wos)}</span>
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: 11, color: T.text3, whiteSpace: "nowrap" }}>{reorderBy.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* PO Recommendations */}
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden", marginBottom: 20 }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>PO Recommendations</div>
          <div style={{ fontSize: 11, color: T.text3 }}>Auto-generated based on forecast + lead times + safety stock</div>
        </div>
        <div style={{ padding: 16 }}>
          {sortedInv.filter(i => (i.on_hand / Math.max(i.weekly_demand, 1)) < 8).map((inv, i) => {
            const wos = inv.on_hand / Math.max(inv.weekly_demand, 1);
            const targetWos = 10;
            const needed = Math.max(0, Math.ceil((targetWos * inv.weekly_demand) - inv.on_hand - inv.incoming));
            if (needed <= 0) return null;
            const orderBy = new Date();
            orderBy.setDate(orderBy.getDate() + Math.max(0, (wos * 7) - inv.lead_time));
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", background: T.surface2, borderRadius: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 18 }}>📋</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{inv.base_product} — {inv.warehouse}</div>
                  <div style={{ fontSize: 11, color: T.text3 }}>Order <span style={{ fontWeight: 700, color: T.accent }}>{fmt(needed)} units</span> by {orderBy.toLocaleDateString("en-US", { month: "short", day: "numeric" })} ({inv.lead_time}d lead time)</div>
                </div>
                <span style={{ fontSize: 9, fontWeight: 700, padding: "3px 10px", borderRadius: 6, background: RISK_COLORS[getRisk(wos)] + "18", color: RISK_COLORS[getRisk(wos)] }}>{getRiskLabel(wos)}</span>
              </div>
            );
          }).filter(Boolean)}
          {sortedInv.filter(i => (i.on_hand / Math.max(i.weekly_demand, 1)) < 8).length === 0 && (
            <div style={{ padding: 20, textAlign: "center", color: T.text3, fontSize: 12 }}>All products above 8 weeks supply — no POs needed right now</div>
          )}
        </div>
      </div>

      {/* International Split */}
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Demand by Region</div>
          <div style={{ fontSize: 11, color: T.text3 }}>Weekly base-unit demand split by geography</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 12, padding: 16 }}>
          {[
            { region: "United States", pct: 0.82, units: Math.round(totalWeeklyDemand * 0.82), flag: "🇺🇸", trend: "+3.1%" },
            { region: "Canada", pct: 0.08, units: Math.round(totalWeeklyDemand * 0.08), flag: "🇨🇦", trend: "+5.2%" },
            { region: "United Kingdom", pct: 0.06, units: Math.round(totalWeeklyDemand * 0.06), flag: "🇬🇧", trend: "+8.7%" },
            { region: "Australia", pct: 0.025, units: Math.round(totalWeeklyDemand * 0.025), flag: "🇦🇺", trend: "+12.1%" },
            { region: "Europe (Other)", pct: 0.01, units: Math.round(totalWeeklyDemand * 0.01), flag: "🇪🇺", trend: "+15.3%" },
            { region: "Rest of World", pct: 0.005, units: Math.round(totalWeeklyDemand * 0.005), flag: "🌏", trend: "+9.4%" },
          ].map(r => (
            <div key={r.region} style={{ padding: "12px 14px", background: T.surface2, borderRadius: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 16 }}>{r.flag}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{r.region}</span>
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: T.text, marginBottom: 2 }}>{fmt(r.units)}<span style={{ fontSize: 10, fontWeight: 400, color: T.text3 }}> units/wk</span></div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ flex: 1, height: 4, borderRadius: 2, background: T.surface3, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${r.pct * 100}%`, background: T.accent, borderRadius: 2 }} />
                </div>
                <span style={{ fontSize: 10, fontWeight: 600, color: "#22c55e" }}>{r.trend}</span>
                <span style={{ fontSize: 10, color: T.text3 }}>{(r.pct * 100).toFixed(1)}%</span>
              </div>
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
  { key: "hero_gwp", label: "Hero GWP", icon: "🎁", group: "primary", desc: "Primary new customer acquisition — ad spend drives this product as the hero GWP offer" },
  { key: "upsell", label: "Upsell", icon: "⬆️", group: "dtc", desc: "Upsell at checkout to existing + new customers. Can be halo from hero ad spend." },
  { key: "email", label: "Email", icon: "📧", group: "dtc", desc: "Email campaign to existing subscriber list" },
  { key: "sms", label: "SMS", icon: "💬", group: "dtc", desc: "SMS/MMS campaign to opted-in subscriber list" },
  { key: "free_gift", label: "Free Gift", icon: "🎀", group: "dtc", desc: "Free gift at spend tier threshold (e.g. free with $50+ order)" },
  { key: "amazon", label: "Amazon", icon: "📦", group: "marketplace", desc: "Amazon sales — can be direct PPC or halo from DTC brand awareness" },
  { key: "retail", label: "Retail", icon: "🏬", group: "offline", desc: "Brick & mortar retail distribution" },
  { key: "dtc_paid", label: "DTC Paid (Non-Hero)", icon: "📱", group: "dtc", desc: "Paid media driving this product directly (not as GWP)" },
  { key: "organic", label: "Organic / PR", icon: "🌿", group: "dtc", desc: "Organic traffic, PR, influencer seeding" },
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
function FmtInput({ defaultValue, onBlur, style }) {
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
      style={style}
    />
  );
}

function ChannelInputs({ ch, onUpdateChannel, allChannels, allPeriods, onAddPeriod, onUpdatePeriod, onRemovePeriod, onInitPeriods, emailSends, onAddEmailSend, onUpdateEmailSend, onRemoveEmailSend, variantSplits, onAddVariantSplit, onUpdateVariantSplit, onRemoveVariantSplit, onInitDefaultVariants, gwpTiers, onAddGwpTier, onUpdateGwpTier, onRemoveGwpTier }) {
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
              <div style={{ display: "flex", gap: 6 }}>
                {splits.length === 0 && (
                  <button onClick={() => onInitDefaultVariants(ch.id)} style={{ padding: "3px 10px", fontSize: 9, fontWeight: 600, border: `1px solid #8b5cf630`, borderRadius: 4, background: "#8b5cf610", color: "#8b5cf6", cursor: "pointer" }}>Load Defaults (1-4 Pack)</button>
                )}
                <button onClick={() => onAddVariantSplit(ch.id)} style={{ padding: "3px 10px", fontSize: 9, fontWeight: 600, border: `1px solid #8b5cf630`, borderRadius: 4, background: "transparent", color: "#8b5cf6", cursor: "pointer" }}>+ Add Variant</button>
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
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: "", product_name: "", launch_date: "", moq: 5000, lead_time_days: 45, unit_cost: "", retail_price: "", target_margin_pct: 65, forecast_period_weeks: 12, supplier: "" });

  const load = async () => {
    const [{ data: l }, { data: c }, { data: p }, { data: pr }, { data: es }, { data: vs }, { data: gt }] = await Promise.all([
      supabase.from("dp_launches").select("*").eq("org_id", orgId).order("created_at", { ascending: false }),
      supabase.from("dp_launch_channels").select("*").eq("org_id", orgId),
      supabase.from("dp_launch_pos").select("*").eq("org_id", orgId),
      supabase.from("dp_launch_periods").select("*").eq("org_id", orgId).order("period_index"),
      supabase.from("dp_launch_email_sends").select("*").eq("org_id", orgId).order("sort_order"),
      supabase.from("dp_launch_variant_splits").select("*").eq("org_id", orgId).order("sort_order"),
      supabase.from("dp_launch_gwp_tiers").select("*").eq("org_id", orgId).order("sort_order"),
    ]);
    setLaunches(l || []); setChannels(c || []); setPos(p || []); setPeriods(pr || []);
    setEmailSends(es || []); setVariantSplits(vs || []); setGwpTiers(gt || []); setLoading(false);
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
      supplier: form.supplier || null, created_by: user?.id,
    }).select().single();
    if (data) { setLaunches(p => [data, ...p]); setSelected(data); setShowNew(false); }
  };

  const updateLaunch = async (id, field, value) => {
    await supabase.from("dp_launches").update({ [field]: value, updated_at: new Date().toISOString() }).eq("id", id);
    setLaunches(p => p.map(l => l.id === id ? { ...l, [field]: value } : l));
    if (selected?.id === id) setSelected(s => ({ ...s, [field]: value }));
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
  const totalUnits = launchChannels.reduce((s, c) => s + calcChannelUnits(c, launchChannels, launchPeriods), 0);
  const totalRevenue = totalUnits * (selected?.retail_price || 0);
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
          </div>
        </div>

        {/* KPI Cards */}
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(2,1fr)" : "repeat(5,1fr)", gap: 8, marginBottom: 20 }}>
          {[
            { label: "Total Forecast", value: fmt(totalUnits), sub: "units", color: T.accent },
            { label: "Revenue", value: "$" + fmt(Math.round(totalRevenue)), sub: "at retail", color: "#22c55e" },
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
            <I label="SKU" value={selected.sku} onChange={v => updateLaunch(selected.id, "sku", v)} placeholder="e.g. LS-60-LEMON" />
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
              <I label="Units per Case" value={selected.units_per_case} onChange={v => updateLaunch(selected.id, "units_per_case", v)} type="number" />
              <I label="Forecast Period" value={selected.forecast_period_weeks} onChange={v => updateLaunch(selected.id, "forecast_period_weeks", v)} type="number" suffix="weeks" />
            </div>
            <I label="Supplier" value={selected.supplier} onChange={v => updateLaunch(selected.id, "supplier", v)} />
          </div>
        </div>

        {/* Promotion Channels — Demand Drivers */}
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 16, marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>📣 Promotion Channels — Demand Drivers</div>
          </div>
          <div style={{ fontSize: 11, color: T.text3, marginBottom: 12, lineHeight: 1.5 }}>The Hero GWP is your primary driver — ad spend and CPA determine new customer orders. Other channels can model demand directly or as <strong>halo sales</strong> (a % of orders driven by paid media that flow to that channel).</div>

          {/* Add channel buttons — grouped */}
          {[
            { group: "primary", label: "Primary Driver" },
            { group: "dtc", label: "DTC Channels" },
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
                        style={{ padding: "5px 10px", fontSize: 10, fontWeight: 600, borderRadius: 6, border: `1px solid ${exists ? T.border : (g.group === "primary" ? "#8b5cf6" : T.accent) + "40"}`, background: exists ? T.surface2 : (g.group === "primary" ? "#8b5cf6" : T.accent) + "08", color: exists ? T.text3 : (g.group === "primary" ? "#8b5cf6" : T.accent), cursor: exists ? "default" : "pointer", opacity: exists ? 0.5 : 1, display: "flex", alignItems: "center", gap: 4 }}>
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
                const units = calcChannelUnits(ch, launchChannels, launchPeriods);
                const pct = totalUnits > 0 ? ((units / totalUnits) * 100).toFixed(1) : 0;
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
                          <div style={{ fontSize: 15, fontWeight: 800, color: T.accent }}>{fmt(units)}</div>
                          <div style={{ fontSize: 9, color: T.text3 }}>{pct}% of total</div>
                        </div>
                        <button onClick={() => removeChannel(ch.id)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 14 }}>×</button>
                      </div>
                    </div>
                    <div style={{ padding: "10px 14px" }}>
                      <ChannelInputs ch={ch} onUpdateChannel={updateChannel} allChannels={launchChannels} allPeriods={launchPeriods} onAddPeriod={addPeriod} onUpdatePeriod={updatePeriod} onRemovePeriod={removePeriod} onInitPeriods={initPeriods} emailSends={emailSends.filter(s => s.channel_id === ch.id)} onAddEmailSend={addEmailSend} onUpdateEmailSend={updateEmailSend} onRemoveEmailSend={removeEmailSend} variantSplits={variantSplits.filter(s => s.channel_id === ch.id)} onAddVariantSplit={addVariantSplit} onUpdateVariantSplit={updateVariantSplit} onRemoveVariantSplit={removeVariantSplit} onInitDefaultVariants={initDefaultVariants} gwpTiers={gwpTiers.filter(t => t.channel_id === ch.id)} onAddGwpTier={addGwpTier} onUpdateGwpTier={updateGwpTier} onRemoveGwpTier={removeGwpTier} />
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

        {/* Subscription Economics + Reorder Curve */}
        {totalUnits > 0 && (() => {
          const s = selected;
          const subRate = (s.sub_take_rate ?? 70) / 100;
          const otpRate = 1 - subRate;
          const upo = 1; // simplify — units_per_order is on channels
          const forecastMonths = s.forecast_months || 6;
          const reorderWeeks = s.reorder_frequency_weeks || 8;
          const unitsPerReorder = s.units_per_reorder || 1;
          const otpReorderRate = (s.otp_reorder_rate ?? 10) / 100;
          const otpReorderWeeks = s.otp_reorder_frequency_weeks || 12;

          // Churn curve: monthly retention rates
          const churnRates = [
            (s.churn_m1 ?? 15) / 100,
            (s.churn_m2 ?? 8) / 100,
            (s.churn_m3 ?? 6) / 100,
          ];
          const steadyChurn = (s.churn_m4_plus ?? 4) / 100;

          // Calculate total customers from first-order demand
          // totalUnits / avg_units_per_order — use 1 as default
          const totalCustomers = totalUnits; // simplification: 1 unit per customer for first order
          const subCustomers = Math.round(totalCustomers * subRate);
          const otpCustomers = totalCustomers - subCustomers;

          // Build month-by-month projection
          const months = [];
          let activeSubs = subCustomers;
          let cumulativeUnits = totalUnits; // month 0 = launch orders already counted

          for (let m = 0; m < forecastMonths; m++) {
            // How many reorders this month from active subs?
            // If reorder every N weeks, that's ~4.33/N reorders per month
            const reordersPerMonth = 4.33 / reorderWeeks;
            const subReorderUnits = Math.round(activeSubs * reordersPerMonth * unitsPerReorder);

            // OTP reorders (one-time buyers who come back)
            const otpReordersPerMonth = 4.33 / otpReorderWeeks;
            const otpReorderUnits = Math.round(otpCustomers * otpReorderRate * otpReordersPerMonth * unitsPerReorder);

            const monthTotal = subReorderUnits + otpReorderUnits;
            cumulativeUnits += monthTotal;

            months.push({
              label: `Month ${m + 1}`,
              activeSubs: Math.round(activeSubs),
              subReorderUnits,
              otpReorderUnits,
              total: monthTotal,
              cumulative: cumulativeUnits,
              retention: subCustomers > 0 ? ((activeSubs / subCustomers) * 100).toFixed(1) : 0,
            });

            // Apply churn for next month
            const churnRate = m < churnRates.length ? churnRates[m] : steadyChurn;
            activeSubs = activeSubs * (1 - churnRate);
          }

          const totalReorderUnits = months.reduce((s, m) => s + m.total, 0);
          const grandTotal = totalUnits + totalReorderUnits;
          // Bar chart max for scaling
          const maxMonthUnits = Math.max(...months.map(m => m.total), 1);

          return (
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 16, marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 4 }}>🔄 Subscription & Reorder Economics</div>
              <div style={{ fontSize: 10, color: T.text3, marginBottom: 14, lineHeight: 1.5 }}>
                Model recurring demand from subscribers and one-time buyers who reorder. First-order units come from the channels above; this section projects reorder demand over {forecastMonths} months.
              </div>

              {/* Inputs — two columns */}
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16, marginBottom: 16 }}>
                <div style={{ background: T.surface2, borderRadius: 8, padding: 12, border: `1px solid ${T.border}` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.text, marginBottom: 8 }}>📊 Subscription</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    <I label="Sub Take Rate" value={s.sub_take_rate} onChange={v => updateLaunch(s.id, "sub_take_rate", v)} type="number" suffix="%" small />
                    <I label="Reorder Every" value={s.reorder_frequency_weeks} onChange={v => updateLaunch(s.id, "reorder_frequency_weeks", v)} type="number" suffix="wks" small />
                    <I label="Units / Reorder" value={s.units_per_reorder} onChange={v => updateLaunch(s.id, "units_per_reorder", v)} type="number" small />
                    <I label="Forecast Months" value={s.forecast_months} onChange={v => updateLaunch(s.id, "forecast_months", v)} type="number" small />
                  </div>
                </div>
                <div style={{ background: T.surface2, borderRadius: 8, padding: 12, border: `1px solid ${T.border}` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.text, marginBottom: 8 }}>📉 Churn Curve</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                    <I label="Month 1 Churn" value={s.churn_m1} onChange={v => updateLaunch(s.id, "churn_m1", v)} type="number" suffix="%" small />
                    <I label="Month 2 Churn" value={s.churn_m2} onChange={v => updateLaunch(s.id, "churn_m2", v)} type="number" suffix="%" small />
                    <I label="Month 3 Churn" value={s.churn_m3} onChange={v => updateLaunch(s.id, "churn_m3", v)} type="number" suffix="%" small />
                    <I label="Month 4+ Churn" value={s.churn_m4_plus} onChange={v => updateLaunch(s.id, "churn_m4_plus", v)} type="number" suffix="%" small />
                  </div>
                  <div style={{ marginTop: 6, borderTop: `1px solid ${T.border}`, paddingTop: 6 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: T.text3, textTransform: "uppercase", marginBottom: 4 }}>One-Time Buyers</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                      <I label="OTP Reorder Rate" value={s.otp_reorder_rate} onChange={v => updateLaunch(s.id, "otp_reorder_rate", v)} type="number" suffix="%" small />
                      <I label="OTP Reorder Every" value={s.otp_reorder_frequency_weeks} onChange={v => updateLaunch(s.id, "otp_reorder_frequency_weeks", v)} type="number" suffix="wks" small />
                    </div>
                  </div>
                </div>
              </div>

              {/* Summary KPIs */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 14 }}>
                {[
                  { label: "Subscribers", value: fmt(subCustomers), sub: `${(subRate * 100).toFixed(0)}% of ${fmt(totalCustomers)}`, color: "#8b5cf6" },
                  { label: "OTP Buyers", value: fmt(otpCustomers), sub: `${(otpRate * 100).toFixed(0)}% one-time`, color: "#f59e0b" },
                  { label: "Reorder Units", value: fmt(totalReorderUnits), sub: `${forecastMonths}mo total`, color: "#0ea5e9" },
                  { label: "Grand Total", value: fmt(grandTotal), sub: `launch + reorders`, color: "#22c55e" },
                ].map(k => (
                  <div key={k.label} style={{ padding: "8px 10px", background: k.color + "08", borderRadius: 8, border: `1px solid ${k.color}20` }}>
                    <div style={{ fontSize: 9, fontWeight: 600, color: T.text3, textTransform: "uppercase" }}>{k.label}</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: k.color }}>{k.value}</div>
                    <div style={{ fontSize: 9, color: T.text3 }}>{k.sub}</div>
                  </div>
                ))}
              </div>

              {/* Reorder Curve Table */}
              <div style={{ fontSize: 11, fontWeight: 700, color: T.text, marginBottom: 6 }}>📈 Reorder Curve — Monthly Projection</div>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${T.border}` }}>
                    <th style={{ textAlign: "left", padding: "5px 8px", color: T.text3, fontWeight: 700 }}>Period</th>
                    <th style={{ textAlign: "right", padding: "5px 8px", color: T.text3, fontWeight: 700 }}>Active Subs</th>
                    <th style={{ textAlign: "right", padding: "5px 8px", color: T.text3, fontWeight: 700 }}>Retention</th>
                    <th style={{ textAlign: "right", padding: "5px 8px", color: T.text3, fontWeight: 700 }}>Sub Units</th>
                    <th style={{ textAlign: "right", padding: "5px 8px", color: T.text3, fontWeight: 700 }}>OTP Units</th>
                    <th style={{ textAlign: "right", padding: "5px 8px", color: T.text3, fontWeight: 700 }}>Month Total</th>
                    <th style={{ textAlign: "right", padding: "5px 8px", color: T.text3, fontWeight: 700 }}>Cumulative</th>
                    <th style={{ width: 80, padding: "5px 4px" }}></th>
                  </tr>
                </thead>
                <tbody>
                  <tr style={{ borderBottom: `1px solid ${T.border}`, background: T.accent + "06" }}>
                    <td style={{ padding: "5px 8px", fontWeight: 700, color: T.accent }}>Launch</td>
                    <td style={{ padding: "5px 8px", textAlign: "right", color: T.text3 }}>—</td>
                    <td style={{ padding: "5px 8px", textAlign: "right", color: T.text3 }}>—</td>
                    <td style={{ padding: "5px 8px", textAlign: "right", color: T.text3 }}>—</td>
                    <td style={{ padding: "5px 8px", textAlign: "right", color: T.text3 }}>—</td>
                    <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700, color: T.accent }}>{fmt(totalUnits)}</td>
                    <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700, color: T.text }}>{fmt(totalUnits)}</td>
                    <td style={{ padding: "5px 4px" }}><div style={{ height: 10, borderRadius: 3, background: T.accent, width: `${Math.min(100, (totalUnits / Math.max(maxMonthUnits, totalUnits)) * 100)}%` }} /></td>
                  </tr>
                  {months.map((m, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${T.border}08` }}>
                      <td style={{ padding: "5px 8px", fontWeight: 600, color: T.text2 }}>{m.label}</td>
                      <td style={{ padding: "5px 8px", textAlign: "right", color: T.text2 }}>{fmt(m.activeSubs)}</td>
                      <td style={{ padding: "5px 8px", textAlign: "right", color: parseFloat(m.retention) > 60 ? "#22c55e" : parseFloat(m.retention) > 40 ? "#f59e0b" : "#ef4444", fontWeight: 600 }}>{m.retention}%</td>
                      <td style={{ padding: "5px 8px", textAlign: "right", color: "#8b5cf6", fontWeight: 600 }}>{fmt(m.subReorderUnits)}</td>
                      <td style={{ padding: "5px 8px", textAlign: "right", color: "#f59e0b" }}>{fmt(m.otpReorderUnits)}</td>
                      <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700, color: T.text }}>{fmt(m.total)}</td>
                      <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 600, color: T.text2 }}>{fmt(m.cumulative)}</td>
                      <td style={{ padding: "5px 4px" }}><div style={{ height: 10, borderRadius: 3, background: "#8b5cf6", opacity: 0.6, width: `${Math.min(100, (m.total / maxMonthUnits) * 100)}%` }} /></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: `2px solid ${T.border}` }}>
                    <td style={{ padding: "6px 8px", fontWeight: 800, color: T.text }}>Total</td>
                    <td colSpan={4}></td>
                    <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 800, fontSize: 12, color: "#22c55e" }}>{fmt(totalReorderUnits)}</td>
                    <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: 800, fontSize: 12, color: "#22c55e" }}>{fmt(grandTotal)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          );
        })()}

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
              <div key={l.id} onClick={() => setSelected(l)} style={{ padding: "14px 18px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, cursor: "pointer", transition: "all 0.1s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent + "40"; }} onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
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
  const tabs = [
    { id: "supply", label: "Supply Chain", icon: "📦" },
    { id: "launches", label: "New Product Launch", icon: "🚀" },
    { id: "growth", label: "Growth Planner", icon: "📈" },
    { id: "sources", label: "Data Sources", icon: "🔌" },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: T.text, letterSpacing: "-0.3px" }}>Demand Planning</div>
        <div style={{ fontSize: 12, color: T.text3, marginTop: 2 }}>Forecast demand, plan inventory, and model growth scenarios</div>
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
    </div>
  );
}
