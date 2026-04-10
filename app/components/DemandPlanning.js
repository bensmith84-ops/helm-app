"use client";
import { useState, useEffect, useCallback } from "react";
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
function SupplyChainView({ isMobile }) {
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
function GrowthPlannerView({ isMobile }) {
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
// MAIN DEMAND PLANNING VIEW
// ═══════════════════════════════════════════════════════════════════════════════
export default function DemandPlanningView({ isMobile, orgId }) {
  const [tab, setTab] = useState("supply");
  const tabs = [
    { id: "supply", label: "Supply Chain", icon: "📦" },
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
      {tab === "supply" && <SupplyChainView isMobile={isMobile} />}
      {tab === "growth" && <GrowthPlannerView isMobile={isMobile} />}
      {tab === "sources" && <DataSourcesView isMobile={isMobile} orgId={orgId} />}
    </div>
  );
}
