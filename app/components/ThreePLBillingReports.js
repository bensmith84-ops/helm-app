// 3PL Billing — Interactive Reports & Analysis
//
// Single-page, multi-chart analytics view backed by the wms_3pl_billing_report
// Postgres RPC. Every chart is custom inline-SVG (no chart library dependency)
// for bundle size + visual control.
//
// Filter bar controls the RPC call. On filter change, we re-fetch and re-render.
// All charts share the same theme tokens for consistency with the rest of Helm.

"use client";

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useTheme } from "../lib/theme";
import { useAuth } from "../lib/auth";

// ─── Palette ──────────────────────────────────────────────────────────────
// Stable color mapping for billing categories so the donut, stacked area,
// and warehouse bars all stay visually consistent.
const CATEGORY_COLORS = {
  freight:            "#3B82F6",
  storage:            "#10B981",
  outbound_handling:  "#F59E0B",
  inbound_handling:   "#F97316",
  inbound_receiving:  "#EF4444",
  pick_pack:          "#A855F7",
  order_processing:   "#EC4899",
  materials:          "#8B5CF6",
  management:         "#06B6D4",
  admin:              "#0EA5E9",
  labour:             "#14B8A6",
  vas:                "#84CC16",
  returns:            "#F472B6",
  adjustment:         "#DC2626",
  other:              "#6B7280",
};
const CAT_COLOR = (k) => CATEGORY_COLORS[k] || "#6B7280";

const fmt$ = (n, frac = 0) => {
  const x = Number(n || 0);
  if (Math.abs(x) >= 1_000_000) return "$" + (x / 1_000_000).toFixed(2) + "M";
  if (Math.abs(x) >= 10_000) return "$" + (x / 1_000).toFixed(0) + "k";
  if (Math.abs(x) >= 1_000) return "$" + (x / 1_000).toFixed(1) + "k";
  return "$" + x.toLocaleString(undefined, { minimumFractionDigits: frac, maximumFractionDigits: frac });
};
const fmt$Full = (n, frac = 2) =>
  "$" + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: frac, maximumFractionDigits: frac });
const fmtNum = (n) => Number(n || 0).toLocaleString();
const fmtMonth = (s) => {
  if (!s) return "";
  const d = new Date(s);
  return d.toLocaleString(undefined, { month: "short", year: "2-digit" });
};

// ─── Tooltip (singleton) ──────────────────────────────────────────────────
// Floats above the chart on hover. Set via state from chart components.
function FloatingTooltip({ tip, T }) {
  if (!tip) return null;
  return (
    <div style={{
      position: "fixed", left: tip.x + 12, top: tip.y + 12,
      background: T.surface3 || T.surface2, color: T.text,
      padding: "8px 10px", borderRadius: 6, fontSize: 11,
      boxShadow: "0 4px 16px rgba(0,0,0,0.5)",
      pointerEvents: "none", zIndex: 9999,
      border: `1px solid ${T.border}`,
      maxWidth: 280, lineHeight: 1.4,
    }}>
      {tip.lines.map((l, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {l.swatch && <span style={{ width: 8, height: 8, background: l.swatch, borderRadius: 2, display: "inline-block" }} />}
          {l.label && <span style={{ color: T.text3, marginRight: 4 }}>{l.label}:</span>}
          <span style={{ fontWeight: l.bold ? 700 : 400, fontFamily: l.mono ? "monospace" : undefined }}>{l.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── KPI tile ─────────────────────────────────────────────────────────────
function KpiTile({ T, label, value, sub, accent }) {
  return (
    <div style={{
      flex: "1 1 0", minWidth: 140,
      background: T.surface, border: `1px solid ${T.border}`,
      borderLeft: `4px solid ${accent || T.accent}`,
      borderRadius: 8, padding: "12px 16px",
    }}>
      <div style={{ fontSize: 10, color: T.text3, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4, fontFamily: "monospace" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ─── Stacked Area: spend by category over months ─────────────────────────
function StackedAreaChart({ data, T, setTip }) {
  // data shape: [{ month: 'YYYY-MM-01', category: 'freight', amount: 1234 }]
  const { months, categories, byMonthCat, stacks, max } = useMemo(() => {
    const ms = Array.from(new Set(data.map(d => d.month))).sort();
    const cs = Array.from(new Set(data.map(d => d.category)));
    // Sort categories by total amount desc so largest is at bottom
    const catTotals = cs.map(c => ({ c, t: data.filter(d => d.category === c).reduce((s, d) => s + +d.amount, 0) }));
    catTotals.sort((a, b) => b.t - a.t);
    const orderedCats = catTotals.map(x => x.c);
    const map = new Map();
    for (const d of data) map.set(`${d.month}|${d.category}`, +d.amount);
    // Compute stack heights
    const st = ms.map(m => {
      const layers = [];
      let acc = 0;
      for (const c of orderedCats) {
        const v = map.get(`${m}|${c}`) || 0;
        layers.push({ category: c, value: v, y0: acc, y1: acc + v });
        acc += v;
      }
      return { month: m, layers, total: acc };
    });
    return {
      months: ms, categories: orderedCats, byMonthCat: map, stacks: st,
      max: Math.max(1, ...st.map(s => s.total)),
    };
  }, [data]);

  const W = 760, H = 280, padL = 56, padR = 16, padT = 12, padB = 36;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  if (!months.length) return <div style={{ padding: 30, textAlign: "center", color: T.text3, fontSize: 12 }}>No spend data in range</div>;
  const x = (i) => padL + (months.length === 1 ? innerW / 2 : (i / (months.length - 1)) * innerW);
  const y = (v) => padT + innerH - (v / max) * innerH;
  // Build a path per category (stacked)
  const paths = categories.map(c => {
    const top = stacks.map((s, i) => `${i === 0 ? "M" : "L"} ${x(i)} ${y(s.layers.find(l => l.category === c).y1)}`).join(" ");
    const bot = [...stacks].reverse().map((s, i) => `L ${x(months.length - 1 - i)} ${y(s.layers.find(l => l.category === c).y0)}`).join(" ");
    return { category: c, d: `${top} ${bot} Z` };
  });
  // Y-axis ticks
  const yticks = [0, 0.25, 0.5, 0.75, 1].map(p => max * p);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 280, display: "block" }}>
      {/* Grid + Y axis */}
      {yticks.map((v, i) => (
        <g key={i}>
          <line x1={padL} y1={y(v)} x2={W - padR} y2={y(v)} stroke={T.border} strokeDasharray={i === 0 ? "none" : "2,3"} strokeWidth={i === 0 ? 1 : 0.5} />
          <text x={padL - 6} y={y(v)} fontSize={9} fill={T.text3} textAnchor="end" dominantBaseline="middle">{fmt$(v)}</text>
        </g>
      ))}
      {/* Stacked area paths */}
      {paths.map((p, i) => (
        <path key={i} d={p.d} fill={CAT_COLOR(p.category)} fillOpacity={0.85} stroke={CAT_COLOR(p.category)} strokeWidth={0.5} />
      ))}
      {/* X-axis labels */}
      {months.map((m, i) => (
        <text key={i} x={x(i)} y={H - 16} fontSize={9} fill={T.text3} textAnchor="middle">{fmtMonth(m)}</text>
      ))}
      {/* Invisible hover targets per month */}
      {months.map((m, i) => (
        <rect key={i}
          x={i === 0 ? padL : x(i) - (x(1) - x(0)) / 2}
          y={padT}
          width={(months.length === 1) ? innerW : (i === 0 || i === months.length - 1 ? (x(1) - x(0)) / 2 : (x(1) - x(0)))}
          height={innerH} fill="transparent"
          onMouseMove={(e) => {
            const s = stacks[i];
            setTip({
              x: e.clientX, y: e.clientY,
              lines: [
                { value: fmtMonth(m), bold: true },
                ...s.layers.filter(l => l.value > 0).slice().reverse().map(l => ({
                  swatch: CAT_COLOR(l.category), label: l.category, value: fmt$Full(l.value), mono: true,
                })),
                { label: "Total", value: fmt$Full(s.total), bold: true, mono: true },
              ],
            });
          }}
          onMouseLeave={() => setTip(null)}
        />
      ))}
    </svg>
  );
}

// ─── Donut: cost mix by category ──────────────────────────────────────────
function DonutChart({ data, T, setTip }) {
  const total = data.reduce((s, d) => s + Number(d.amount || 0), 0);
  if (total === 0) return <div style={{ padding: 30, textAlign: "center", color: T.text3, fontSize: 12 }}>No data</div>;
  // Sort by amount descending; collapse anything <2% into "other".
  const sorted = [...data].sort((a, b) => +b.amount - +a.amount).filter(d => +d.amount !== 0);
  const W = 220, R = 90, r = 56, cx = W / 2, cy = W / 2;
  // Arc generator
  let acc = 0;
  const slices = sorted.map(d => {
    const v = Number(d.amount);
    const start = acc / total * Math.PI * 2 - Math.PI / 2;
    acc += Math.abs(v);
    const end = acc / total * Math.PI * 2 - Math.PI / 2;
    const large = (end - start) > Math.PI ? 1 : 0;
    const x1 = cx + R * Math.cos(start), y1 = cy + R * Math.sin(start);
    const x2 = cx + R * Math.cos(end),   y2 = cy + R * Math.sin(end);
    const x3 = cx + r * Math.cos(end),   y3 = cy + r * Math.sin(end);
    const x4 = cx + r * Math.cos(start), y4 = cy + r * Math.sin(start);
    const d_ = `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${r} ${r} 0 ${large} 0 ${x4} ${y4} Z`;
    return { ...d, d: d_, pct: Math.abs(v) / total };
  });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
      <svg viewBox={`0 0 ${W} ${W}`} style={{ width: 220, height: 220 }}>
        {slices.map((s, i) => (
          <path key={i} d={s.d} fill={CAT_COLOR(s.category)}
            onMouseMove={(e) => setTip({
              x: e.clientX, y: e.clientY, lines: [
                { swatch: CAT_COLOR(s.category), value: s.category, bold: true },
                { label: "Amount", value: fmt$Full(s.amount), mono: true },
                { label: "Share", value: (s.pct * 100).toFixed(1) + "%", mono: true },
                { label: "Lines", value: fmtNum(s.line_count), mono: true },
              ]
            })}
            onMouseLeave={() => setTip(null)}
            style={{ cursor: "pointer", transition: "opacity 0.15s" }}
            onMouseEnter={(e) => e.target.setAttribute("opacity", "0.8")}
            onMouseOut={(e) => e.target.setAttribute("opacity", "1")}
          />
        ))}
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize={11} fill={T.text3}>Total</text>
        <text x={cx} y={cy + 10} textAnchor="middle" fontSize={16} fontWeight={700} fill={T.text} fontFamily="monospace">{fmt$(total)}</text>
      </svg>
      {/* Legend */}
      <div style={{ flex: 1, minWidth: 200, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, fontSize: 11 }}>
        {slices.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 10, height: 10, background: CAT_COLOR(s.category), borderRadius: 2 }} />
            <span style={{ color: T.text2, flex: 1 }}>{s.category}</span>
            <span style={{ color: T.text3, fontFamily: "monospace" }}>{(s.pct * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Horizontal bar chart (service levels, warehouses, geo) ──────────────
function HBarChart({ data, T, setTip, valueKey = "cost", labelKey, secondaryKey, secondaryLabel, formatValue = fmt$, formatSecondary = fmtNum, colorOf, height = 24 }) {
  if (!data || !data.length) return <div style={{ padding: 30, textAlign: "center", color: T.text3, fontSize: 12 }}>No data</div>;
  const max = Math.max(1, ...data.map(d => Math.abs(Number(d[valueKey] || 0))));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {data.map((d, i) => {
        const v = Number(d[valueKey] || 0);
        const w = (Math.abs(v) / max) * 100;
        const c = colorOf ? colorOf(d) : T.accent;
        return (
          <div key={i}
            onMouseMove={(e) => setTip({
              x: e.clientX, y: e.clientY, lines: [
                { value: d[labelKey], bold: true },
                { label: valueKey, value: formatValue(v), mono: true, swatch: c },
                secondaryKey && d[secondaryKey] != null ? { label: secondaryLabel || secondaryKey, value: formatSecondary(d[secondaryKey]), mono: true } : null,
              ].filter(Boolean)
            })}
            onMouseLeave={() => setTip(null)}
            style={{ display: "grid", gridTemplateColumns: "150px 1fr 90px", alignItems: "center", gap: 8, cursor: "default" }}>
            <div style={{ fontSize: 11, color: T.text2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={d[labelKey]}>{d[labelKey]}</div>
            <div style={{ height, background: T.surface2, borderRadius: 3, position: "relative" }}>
              <div style={{ height: "100%", width: `${w}%`, background: c, borderRadius: 3, transition: "width 0.3s" }} />
              {secondaryKey && d[secondaryKey] != null && (
                <div style={{ position: "absolute", left: 8, top: 0, bottom: 0, display: "flex", alignItems: "center", fontSize: 9, color: "#fff", fontFamily: "monospace", textShadow: "0 0 4px rgba(0,0,0,0.5)" }}>
                  {formatSecondary(d[secondaryKey])}
                </div>
              )}
            </div>
            <div style={{ fontSize: 11, fontFamily: "monospace", textAlign: "right", color: T.text }}>{formatValue(v)}</div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Multi-line chart (unit economics over time) ─────────────────────────
function MultiLineChart({ data, T, setTip, series, height = 240 }) {
  if (!data || !data.length) return <div style={{ padding: 30, textAlign: "center", color: T.text3, fontSize: 12 }}>No data</div>;
  const W = 760, padL = 56, padR = 80, padT = 12, padB = 36;
  const innerW = W - padL - padR, innerH = height - padT - padB;
  // Determine value range per series (each independent — we'll show right-axis label)
  const ranges = {};
  for (const s of series) {
    const vals = data.map(d => Number(d[s.key])).filter(v => v != null && !isNaN(v));
    ranges[s.key] = { min: 0, max: Math.max(1, ...vals) };
  }
  const x = (i) => padL + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  // Default Y to the FIRST series scale (so the grid + left-axis are anchored there)
  const yScale = (key, v) => {
    const r = ranges[key];
    if (!r) return padT + innerH;
    return padT + innerH - ((v - r.min) / (r.max - r.min || 1)) * innerH;
  };
  return (
    <svg viewBox={`0 0 ${W} ${height}`} style={{ width: "100%", height, display: "block" }}>
      {/* Grid (anchored to first series' scale) */}
      {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
        const v = ranges[series[0].key].max * p;
        return (
          <g key={i}>
            <line x1={padL} y1={yScale(series[0].key, v)} x2={W - padR} y2={yScale(series[0].key, v)} stroke={T.border} strokeDasharray={i === 0 ? "none" : "2,3"} strokeWidth={i === 0 ? 1 : 0.5} />
            <text x={padL - 6} y={yScale(series[0].key, v)} fontSize={9} fill={T.text3} textAnchor="end" dominantBaseline="middle">{series[0].fmt(v)}</text>
          </g>
        );
      })}
      {/* Series lines */}
      {series.map((s, si) => {
        const path = data.map((d, i) => {
          const v = Number(d[s.key]);
          if (v == null || isNaN(v)) return null;
          return `${i === 0 ? "M" : "L"} ${x(i)} ${yScale(s.key, v)}`;
        }).filter(Boolean).join(" ");
        return (
          <g key={si}>
            <path d={path} fill="none" stroke={s.color} strokeWidth={2} />
            {data.map((d, i) => {
              const v = Number(d[s.key]);
              if (v == null || isNaN(v)) return null;
              return <circle key={i} cx={x(i)} cy={yScale(s.key, v)} r={3} fill={s.color} />;
            })}
          </g>
        );
      })}
      {/* X-axis */}
      {data.map((d, i) => (
        <text key={i} x={x(i)} y={height - 16} fontSize={9} fill={T.text3} textAnchor="middle">{fmtMonth(d.month)}</text>
      ))}
      {/* Hover overlay */}
      {data.map((d, i) => (
        <rect key={`h${i}`} x={i === 0 ? padL : x(i) - (data.length > 1 ? (x(1) - x(0)) : 30) / 2}
          y={padT} width={data.length === 1 ? innerW : (x(1) - x(0))} height={innerH} fill="transparent"
          onMouseMove={(e) => setTip({
            x: e.clientX, y: e.clientY, lines: [
              { value: fmtMonth(d.month), bold: true },
              ...series.map(s => ({ swatch: s.color, label: s.label, value: s.fmt(d[s.key] || 0), mono: true })),
            ]
          })}
          onMouseLeave={() => setTip(null)}
        />
      ))}
      {/* Right legend */}
      <g transform={`translate(${W - padR + 8} ${padT})`}>
        {series.map((s, i) => (
          <g key={i} transform={`translate(0 ${i * 16})`}>
            <line x1={0} y1={4} x2={14} y2={4} stroke={s.color} strokeWidth={2} />
            <text x={18} y={4} fontSize={10} fill={T.text2} dominantBaseline="middle">{s.label}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

// ─── Histogram (freight cost distribution) ────────────────────────────────
function Histogram({ data, T, setTip }) {
  if (!data || !data.length) return <div style={{ padding: 30, textAlign: "center", color: T.text3, fontSize: 12 }}>No shipment data</div>;
  const max = Math.max(1, ...data.map(d => d.count));
  const W = 760, H = 240, padL = 48, padR = 16, padT = 12, padB = 40;
  const innerW = W - padL - padR, innerH = H - padT - padB;
  const barW = innerW / data.length * 0.7;
  const x = (i) => padL + (i + 0.5) / data.length * innerW - barW / 2;
  const y = (v) => padT + innerH - (v / max) * innerH;
  // Y-axis ticks
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H, display: "block" }}>
      {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
        const v = max * p;
        return (
          <g key={i}>
            <line x1={padL} y1={y(v)} x2={W - padR} y2={y(v)} stroke={T.border} strokeDasharray={i === 0 ? "none" : "2,3"} strokeWidth={i === 0 ? 1 : 0.5} />
            <text x={padL - 6} y={y(v)} fontSize={9} fill={T.text3} textAnchor="end" dominantBaseline="middle">{fmtNum(v)}</text>
          </g>
        );
      })}
      {data.map((d, i) => (
        <g key={i}>
          <rect x={x(i)} y={y(d.count)} width={barW} height={padT + innerH - y(d.count)} fill={T.accent} fillOpacity={0.85} rx={2}
            onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, lines: [
              { value: d.bucket, bold: true, label: "Bucket" },
              { label: "Shipments", value: fmtNum(d.count), mono: true },
              { label: "Total", value: fmt$Full(d.total), mono: true },
            ]})}
            onMouseLeave={() => setTip(null)}
          />
          <text x={x(i) + barW / 2} y={H - 22} fontSize={9} fill={T.text3} textAnchor="middle">{d.bucket}</text>
          <text x={x(i) + barW / 2} y={H - 10} fontSize={8} fill={T.text3} textAnchor="middle" fontFamily="monospace">{fmt$(d.total)}</text>
        </g>
      ))}
    </svg>
  );
}

// ─── Main Reports component ───────────────────────────────────────────────
export default function ThreePLBillingReports({ goToDetail }) {
  const { tokens: T } = useTheme();
  const { orgId } = useAuth();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [tip, setTip] = useState(null);

  // Filter state
  const [filters, setFilters] = useState({
    providers: null,    // null = all
    warehouses: null,
    sources: null,
    periodStart: null,
    periodEnd: null,
  });

  // Available filter options (extracted from the data itself once loaded)
  const [filterOptions, setFilterOptions] = useState({ providers: [], warehouses: [], sources: [] });

  const fetchReport = useCallback(async () => {
    if (!orgId) return;
    setLoading(true); setErr(null);
    try {
      const { data, error } = await supabase.rpc("wms_3pl_billing_report", {
        p_org_id: orgId,
        p_provider_codes: filters.providers,
        p_warehouse_codes: filters.warehouses,
        p_source_formats: filters.sources,
        p_period_start: filters.periodStart,
        p_period_end: filters.periodEnd,
      });
      if (error) throw error;
      setReport(data);
      // Bootstrap filter options from initial (unfiltered) load
      if (!filterOptions.providers.length) {
        setFilterOptions({
          providers: data?.kpis?.providers || [],
          warehouses: data?.kpis?.warehouses || [],
          sources: ["stord_customer", "stord_consolidated", "stord_parcel_backup", "stord_transaction_history", "stord_rts", "next3pl_uk_monthly", "next3pl_au_warehouse", "next3pl_au_transport", "next3pl_ca_weekly"],
        });
      }
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [orgId, filters, filterOptions.providers.length]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const kpis = report?.kpis;
  const avgCostPerShipment = useMemo(() => {
    if (!kpis || !kpis.shipment_count) return null;
    return Number(kpis.total_spend) / Number(kpis.shipment_count);
  }, [kpis]);

  // Period-over-period: compare most recent month vs prior
  const periodCompare = useMemo(() => {
    const ue = report?.unit_econ || [];
    if (ue.length < 2) return null;
    const cur = ue[ue.length - 1], prev = ue[ue.length - 2];
    const chg = (a, b) => (b == null || b == 0) ? null : ((Number(a) - Number(b)) / Number(b)) * 100;
    return {
      curMonth: cur.month, prevMonth: prev.month,
      spend: { cur: cur.spend, prev: prev.spend, pct: chg(cur.spend, prev.spend) },
      cps: { cur: cur.cost_per_shipment, prev: prev.cost_per_shipment, pct: chg(cur.cost_per_shipment, prev.cost_per_shipment) },
    };
  }, [report]);

  // ─── Render helpers ──────────────────────────────────────────────────
  const SectionCard = ({ title, subtitle, children, right }) => (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: 16, marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{title}</div>
          {subtitle && <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>{subtitle}</div>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );

  const MultiSelectPill = ({ label, options, value, onChange }) => {
    const [open, setOpen] = useState(false);
    const wrap = useRef(null);
    useEffect(() => {
      const onDoc = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
      document.addEventListener("mousedown", onDoc);
      return () => document.removeEventListener("mousedown", onDoc);
    }, []);
    const selected = value || [];
    const toggle = (opt) => {
      const next = selected.includes(opt) ? selected.filter(x => x !== opt) : [...selected, opt];
      onChange(next.length === 0 ? null : next);
    };
    const summary = !value ? "All" : value.length === 1 ? value[0] : `${value.length} selected`;
    return (
      <div ref={wrap} style={{ position: "relative" }}>
        <button onClick={() => setOpen(o => !o)} style={{
          padding: "5px 10px", fontSize: 11, background: T.surface2, border: `1px solid ${T.border}`,
          borderRadius: 4, color: T.text2, cursor: "pointer", display: "flex", alignItems: "center", gap: 6,
        }}>
          <span style={{ color: T.text3 }}>{label}:</span>
          <span style={{ fontWeight: 600 }}>{summary}</span>
          <span style={{ fontSize: 8, color: T.text3 }}>▼</span>
        </button>
        {open && (
          <div style={{
            position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 100,
            background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6,
            padding: 4, minWidth: 200, maxHeight: 300, overflowY: "auto",
            boxShadow: "0 4px 16px rgba(0,0,0,0.3)",
          }}>
            <div onClick={() => { onChange(null); setOpen(false); }} style={{
              padding: "5px 8px", fontSize: 11, cursor: "pointer", borderRadius: 3,
              background: !value ? T.accent + "20" : "transparent", color: !value ? T.accent : T.text2,
            }}>(All)</div>
            {options.map(opt => (
              <div key={opt} onClick={() => toggle(opt)} style={{
                padding: "5px 8px", fontSize: 11, cursor: "pointer", borderRadius: 3,
                display: "flex", alignItems: "center", gap: 6,
                background: selected.includes(opt) ? T.accent + "20" : "transparent",
                color: selected.includes(opt) ? T.accent : T.text2,
              }}>
                <span style={{ width: 12, textAlign: "center" }}>{selected.includes(opt) ? "✓" : ""}</span>
                {opt}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (!orgId) return <div style={{ padding: 30, color: T.text3 }}>Loading…</div>;

  return (
    <div style={{ position: "relative" }}>
      <FloatingTooltip tip={tip} T={T} />

      {/* ─── Filter bar ─── */}
      <div style={{
        background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8,
        padding: "10px 14px", marginBottom: 12,
        display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.4 }}>Filters</span>
        <MultiSelectPill label="Provider" options={filterOptions.providers} value={filters.providers}
          onChange={v => setFilters(f => ({ ...f, providers: v }))} />
        <MultiSelectPill label="Warehouse" options={filterOptions.warehouses} value={filters.warehouses}
          onChange={v => setFilters(f => ({ ...f, warehouses: v }))} />
        <MultiSelectPill label="Source" options={filterOptions.sources} value={filters.sources}
          onChange={v => setFilters(f => ({ ...f, sources: v }))} />
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: T.text3 }}>
          <span>From</span>
          <input type="date" value={filters.periodStart || ""} onChange={(e) => setFilters(f => ({ ...f, periodStart: e.target.value || null }))}
            style={{ background: T.surface2, color: T.text, border: `1px solid ${T.border}`, borderRadius: 4, padding: "3px 6px", fontSize: 11 }} />
          <span>to</span>
          <input type="date" value={filters.periodEnd || ""} onChange={(e) => setFilters(f => ({ ...f, periodEnd: e.target.value || null }))}
            style={{ background: T.surface2, color: T.text, border: `1px solid ${T.border}`, borderRadius: 4, padding: "3px 6px", fontSize: 11 }} />
        </div>
        <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
          {(filters.providers || filters.warehouses || filters.sources || filters.periodStart || filters.periodEnd) && (
            <button onClick={() => setFilters({ providers: null, warehouses: null, sources: null, periodStart: null, periodEnd: null })}
              style={{ padding: "5px 10px", fontSize: 11, background: "transparent", border: `1px solid ${T.border}`, borderRadius: 4, color: T.text3, cursor: "pointer" }}>
              Reset
            </button>
          )}
          <button onClick={fetchReport} disabled={loading}
            style={{ padding: "5px 10px", fontSize: 11, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, color: T.text2, cursor: "pointer", opacity: loading ? 0.5 : 1 }}>
            {loading ? "Loading…" : "↻ Refresh"}
          </button>
        </div>
      </div>

      {err && (
        <div style={{ padding: 12, background: "#EF444420", border: "1px solid #EF4444", borderRadius: 6, color: "#EF4444", fontSize: 12, marginBottom: 12 }}>
          ⚠ Report failed: {err}
        </div>
      )}

      {loading && !report && (
        <div style={{ padding: 60, textAlign: "center", color: T.text3, fontSize: 12 }}>Loading report…</div>
      )}

      {report && (
        <>
          {/* ─── KPI strip ─── */}
          <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
            <KpiTile T={T} label="Total Spend" value={fmt$(kpis.total_spend, 0)} sub={`${kpis.invoice_count} invoices · ${fmtMonth(kpis.earliest)} → ${fmtMonth(kpis.latest)}`} accent="#3B82F6" />
            <KpiTile T={T} label="Shipments" value={fmtNum(kpis.shipment_count)} sub={avgCostPerShipment ? `avg ${fmt$Full(avgCostPerShipment, 3)} ea` : ""} accent="#10B981" />
            <KpiTile T={T} label="Units Shipped" value={fmtNum(kpis.units_shipped)} sub={kpis.units_shipped > 0 ? `${fmt$Full(kpis.total_spend / kpis.units_shipped, 3)} / unit` : ""} accent="#F59E0B" />
            <KpiTile T={T} label="Orders" value={fmtNum(kpis.orders_shipped)} sub={kpis.orders_shipped > 0 ? `${fmt$Full(kpis.total_spend / kpis.orders_shipped, 2)} / order` : ""} accent="#A855F7" />
            {periodCompare && (
              <KpiTile T={T} label={`Spend MoM`} value={(periodCompare.spend.pct >= 0 ? "+" : "") + (periodCompare.spend.pct?.toFixed(1) ?? "—") + "%"}
                sub={`${fmtMonth(periodCompare.prevMonth)} → ${fmtMonth(periodCompare.curMonth)}`}
                accent={periodCompare.spend.pct >= 0 ? "#EF4444" : "#10B981"} />
            )}
            {report.adjustments?.count > 0 && (
              <KpiTile T={T} label="Adjustments" value={fmt$Full(report.adjustments.amount, 2)} sub={`${report.adjustments.count} credits/voids`} accent="#DC2626" />
            )}
          </div>

          {/* ─── Spend over time ─── */}
          <SectionCard title="Spend over time" subtitle="Stacked by canonical category, per month">
            <StackedAreaChart data={report.monthly_category || []} T={T} setTip={setTip} />
          </SectionCard>

          {/* ─── Two-column: Cost mix donut + Service levels ─── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
            <SectionCard title="Cost mix" subtitle="By canonical category">
              <DonutChart data={report.category_mix || []} T={T} setTip={setTip} />
            </SectionCard>
            <SectionCard title="Service levels" subtitle="Per-shipment cost across Stord tiers">
              <HBarChart data={report.service_levels || []} T={T} setTip={setTip}
                labelKey="service_level" valueKey="cost"
                secondaryKey="shipments" secondaryLabel="parcels"
                colorOf={(d) => d.service_level?.includes("Economy") ? "#3B82F6" : d.service_level?.includes("Marketing") ? "#10B981" : d.service_level?.includes("Second Day") ? "#F59E0B" : d.service_level?.includes("3 Day") ? "#A855F7" : d.service_level?.includes("Standard") ? "#06B6D4" : "#6B7280"} />
            </SectionCard>
          </div>

          {/* ─── Unit economics ─── */}
          <SectionCard title="Unit economics over time" subtitle="$ per shipment / unit / order — each on its own scale on hover">
            <MultiLineChart data={report.unit_econ || []} T={T} setTip={setTip} series={[
              { key: "cost_per_shipment", label: "$ / shipment", color: "#3B82F6", fmt: (v) => fmt$Full(v, 3) },
              { key: "cost_per_unit",     label: "$ / unit",     color: "#10B981", fmt: (v) => fmt$Full(v, 3) },
              { key: "cost_per_order",    label: "$ / order",    color: "#A855F7", fmt: (v) => fmt$Full(v, 2) },
            ]} />
          </SectionCard>

          {/* ─── Warehouse comparison ─── */}
          <SectionCard title="Warehouse comparison" subtitle="Spend, volume & unit cost by warehouse">
            <HBarChart data={report.warehouse_compare || []} T={T} setTip={setTip}
              labelKey="warehouse" valueKey="spend"
              secondaryKey="orders" secondaryLabel="orders"
              colorOf={(d) => d.warehouse === "CVG" ? "#3B82F6" : d.warehouse === "RNO" ? "#10B981" : d.warehouse === "LAS3" ? "#F59E0B" : "#6B7280"} />
            {/* Mini cost-per-unit table */}
            <div style={{ marginTop: 16, fontSize: 11 }}>
              <div style={{ display: "grid", gridTemplateColumns: "120px 110px 110px 110px 110px", gap: 8, fontWeight: 700, color: T.text3, paddingBottom: 6, borderBottom: `1px solid ${T.border}` }}>
                <div>Warehouse</div><div style={{ textAlign: "right" }}>Spend</div><div style={{ textAlign: "right" }}>Units</div><div style={{ textAlign: "right" }}>$/Unit</div><div style={{ textAlign: "right" }}>$/Order</div>
              </div>
              {(report.warehouse_compare || []).map((w, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "120px 110px 110px 110px 110px", gap: 8, padding: "5px 0", borderBottom: `1px solid ${T.border}25`, fontFamily: "monospace" }}>
                  <div style={{ fontFamily: "system-ui", fontWeight: 600, color: T.text2 }}>{w.warehouse}</div>
                  <div style={{ textAlign: "right" }}>{fmt$Full(w.spend)}</div>
                  <div style={{ textAlign: "right", color: T.text3 }}>{w.units ? fmtNum(w.units) : "—"}</div>
                  <div style={{ textAlign: "right", color: T.text3 }}>{w.cost_per_unit ? fmt$Full(w.cost_per_unit, 4) : "—"}</div>
                  <div style={{ textAlign: "right", color: T.text3 }}>{w.cost_per_order ? fmt$Full(w.cost_per_order, 2) : "—"}</div>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* ─── Freight distribution ─── */}
          <SectionCard title="Freight cost distribution" subtitle="Per-parcel charge bands across all shipments in scope">
            <Histogram data={report.freight_histogram || []} T={T} setTip={setTip} />
          </SectionCard>

          {/* ─── Two-column: Top lines + Adjustments ─── */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12, marginBottom: 12 }}>
            <SectionCard title="Largest line items" subtitle="Biggest single charges across the filtered set">
              <div style={{ fontSize: 11 }}>
                <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 80px 70px 90px", gap: 8, fontWeight: 700, color: T.text3, paddingBottom: 6, borderBottom: `1px solid ${T.border}` }}>
                  <div>Invoice</div><div>Description</div><div>Category</div><div>Qty</div><div style={{ textAlign: "right" }}>Amount</div>
                </div>
                {(report.top_lines || []).slice(0, 12).map((l, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "80px 1fr 80px 70px 90px", gap: 8, padding: "5px 0", borderBottom: `1px solid ${T.border}25`, fontFamily: "monospace" }}>
                    <div style={{ color: T.text3, fontSize: 10 }}>{l.invoice_number?.slice(0, 12)}</div>
                    <div style={{ fontFamily: "system-ui", color: T.text2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={l.description}>{l.description}</div>
                    <div><span style={{ fontSize: 9, padding: "1px 4px", borderRadius: 3, background: CAT_COLOR(l.category) + "30", color: CAT_COLOR(l.category) }}>{l.category}</span></div>
                    <div style={{ color: T.text3, textAlign: "right" }}>{fmtNum(l.qty)}</div>
                    <div style={{ textAlign: "right", fontWeight: 700 }}>{fmt$Full(l.amount)}</div>
                  </div>
                ))}
              </div>
            </SectionCard>
            <SectionCard title="Adjustments & returns" subtitle={`${report.adjustments?.count || 0} credits / voids`}>
              {report.adjustments?.by_period?.length ? (
                <HBarChart data={report.adjustments.by_period} T={T} setTip={setTip}
                  labelKey="month" valueKey="amount"
                  secondaryKey="count" secondaryLabel="count"
                  formatValue={v => fmt$Full(v, 2)}
                  colorOf={() => "#DC2626"} />
              ) : <div style={{ padding: 30, textAlign: "center", color: T.text3, fontSize: 12 }}>No adjustments recorded</div>}
            </SectionCard>
          </div>

          {/* ─── Geography (if data) ─── */}
          {report.geo_region?.length > 0 && (
            <SectionCard title="Recipient region" subtitle="Top destination regions by freight spend (parcel_backup files only)">
              <HBarChart data={report.geo_region} T={T} setTip={setTip}
                labelKey="region" valueKey="cost"
                secondaryKey="shipments" secondaryLabel="parcels"
                colorOf={() => T.accent} />
            </SectionCard>
          )}

          {/* ─── Invoices table ─── */}
          <SectionCard title="Invoices in scope" subtitle={`${report.invoice_list?.length || 0} invoices · click row to open detail`}>
            <div style={{ overflowX: "auto", fontSize: 11 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ borderBottom: `2px solid ${T.border}`, background: T.surface2 }}>
                    {["Invoice", "Provider", "Source", "Warehouse", "Period", "Total", "Shipments", "Units", "Orders"].map(h => (
                      <th key={h} style={{ padding: "6px 8px", textAlign: h === "Total" || h === "Units" || h === "Orders" || h === "Shipments" ? "right" : "left", fontSize: 10, color: T.text3, fontWeight: 700, textTransform: "uppercase" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(report.invoice_list || []).map((inv, i) => (
                    <tr key={i} onClick={() => goToDetail && goToDetail(inv.id)}
                      style={{ borderBottom: `1px solid ${T.border}25`, cursor: goToDetail ? "pointer" : "default" }}
                      onMouseEnter={(e) => e.currentTarget.style.background = T.surface2 + "60"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                      <td style={{ padding: "5px 8px", fontFamily: "monospace", color: T.text2 }}>{inv.invoice_number}</td>
                      <td style={{ padding: "5px 8px", fontSize: 10 }}>{inv.provider_code}</td>
                      <td style={{ padding: "5px 8px", fontSize: 10, color: T.text3 }}>{inv.source}</td>
                      <td style={{ padding: "5px 8px" }}>{inv.warehouse || "—"}</td>
                      <td style={{ padding: "5px 8px", fontSize: 10, color: T.text3 }}>{inv.period_start} → {inv.period_end}</td>
                      <td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "monospace", fontWeight: 700 }}>{fmt$Full(inv.total)}</td>
                      <td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "monospace", color: T.text3 }}>—</td>
                      <td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "monospace", color: T.text3 }}>{inv.units ? fmtNum(inv.units) : "—"}</td>
                      <td style={{ padding: "5px 8px", textAlign: "right", fontFamily: "monospace", color: T.text3 }}>{inv.orders ? fmtNum(inv.orders) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <div style={{ fontSize: 10, color: T.text3, textAlign: "right", marginTop: 4 }}>
            Generated {report.generated_at ? new Date(report.generated_at).toLocaleString() : ""} · payload via wms_3pl_billing_report RPC
          </div>
        </>
      )}
    </div>
  );
}
