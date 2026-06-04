// 3PL Billing — Interactive Reports & Analysis (rich edition)
//
// Deep analytics view backed by wms_3pl_billing_report RPC. Single-page,
// sticky filter bar with date quick-chips, sparkline-enhanced KPIs with
// period-over-period deltas, gradient SVG charts, and a hover tooltip that
// surfaces precise numbers. Everything is custom SVG / HTML — no chart libs.

"use client";

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useTheme } from "../lib/theme";
import { useAuth } from "../lib/auth";

// ─── Constants ───────────────────────────────────────────────────────────
const CATEGORY_COLORS = {
  freight: "#3B82F6", storage: "#10B981", outbound_handling: "#F59E0B",
  inbound_handling: "#F97316", inbound_receiving: "#EF4444",
  pick_pack: "#A855F7", order_processing: "#EC4899",
  materials: "#8B5CF6", management: "#06B6D4", admin: "#0EA5E9",
  labour: "#14B8A6", vas: "#84CC16", returns: "#F472B6",
  adjustment: "#DC2626", other: "#6B7280",
};
const CAT_COLOR = (k) => CATEGORY_COLORS[k] || "#6B7280";

const SERVICE_COLORS = {
  "Stord Economy": "#3B82F6",
  "Stord Marketing Mail Flats": "#10B981",
  "Stord Standard": "#F59E0B",
  "Stord Second Day": "#A855F7",
  "Stord 3 Day": "#EC4899",
  "Stord International Expedited DDP": "#06B6D4",
  "RTS": "#DC2626",
};
const SVC_COLOR = (k) => SERVICE_COLORS[k] || "#6B7280";

// ─── Formatters ──────────────────────────────────────────────────────────
const fmtCompact = (n) => {
  const x = Number(n || 0);
  if (Math.abs(x) >= 1_000_000_000) return (x / 1e9).toFixed(2) + "B";
  if (Math.abs(x) >= 1_000_000) return (x / 1e6).toFixed(2) + "M";
  if (Math.abs(x) >= 10_000) return (x / 1e3).toFixed(0) + "k";
  if (Math.abs(x) >= 1_000) return (x / 1e3).toFixed(1) + "k";
  return x.toLocaleString();
};
const fmt$ = (n) => "$" + fmtCompact(n);
const fmt$Full = (n, frac = 2) =>
  "$" + Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: frac, maximumFractionDigits: frac });
const fmtNum = (n) => Number(n || 0).toLocaleString();
const fmtMonth = (s) => {
  if (!s) return "";
  const d = new Date(s);
  return d.toLocaleString(undefined, { month: "short", year: "2-digit" });
};
const fmtPct = (n, withSign = true) => {
  if (n == null || isNaN(n)) return "—";
  const x = Number(n);
  const sign = withSign && x > 0 ? "+" : "";
  return sign + x.toFixed(1) + "%";
};

// ─── Floating tooltip ────────────────────────────────────────────────────
function FloatingTooltip({ tip, T }) {
  if (!tip) return null;
  return (
    <div style={{
      position: "fixed", left: tip.x + 14, top: tip.y + 14,
      background: T.surface3 || T.surface, color: T.text,
      padding: "10px 12px", borderRadius: 8, fontSize: 11,
      boxShadow: "0 8px 24px rgba(0,0,0,0.4), 0 2px 8px rgba(0,0,0,0.2)",
      pointerEvents: "none", zIndex: 9999,
      border: `1px solid ${T.border}`, maxWidth: 300, lineHeight: 1.45,
      backdropFilter: "blur(8px)",
    }}>
      {tip.lines.map((l, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {l.swatch && <span style={{ width: 9, height: 9, background: l.swatch, borderRadius: 2, display: "inline-block", flexShrink: 0 }} />}
          {l.label && <span style={{ color: T.text3, marginRight: 4 }}>{l.label}:</span>}
          <span style={{ fontWeight: l.bold ? 700 : 500, fontFamily: l.mono ? '"SF Mono", Monaco, monospace' : undefined }}>{l.value}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Tiny inline sparkline (used inside KPI tiles) ───────────────────────
function Sparkline({ values, color = "#3B82F6", w = 80, h = 26, fill = true }) {
  if (!values || values.length < 2) return null;
  const max = Math.max(...values, 0.0001);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const stepX = w / (values.length - 1);
  const pts = values.map((v, i) => [i * stepX, h - ((v - min) / range) * (h - 4) - 2]);
  const linePath = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const areaPath = `${linePath} L ${w} ${h} L 0 ${h} Z`;
  const gradId = "spark-grad-" + Math.random().toString(36).slice(2, 9);
  return (
    <svg width={w} height={h} style={{ display: "block" }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.4" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={areaPath} fill={`url(#${gradId})`} />}
      <path d={linePath} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={2} fill={color} />
    </svg>
  );
}

// ─── KPI tile (rich) ─────────────────────────────────────────────────────
function KpiTile({ T, label, value, sub, delta, deltaInverse = false, sparkline, sparkColor, accent }) {
  const deltaColor = delta == null ? T.text3
    : (deltaInverse ? (delta < 0 ? "#10B981" : "#EF4444") : (delta > 0 ? "#10B981" : "#EF4444"));
  const deltaArrow = delta == null ? "" : (delta > 0 ? "▲" : delta < 0 ? "▼" : "—");
  return (
    <div style={{
      flex: "1 1 0", minWidth: 165,
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 10, padding: "14px 16px",
      position: "relative", overflow: "hidden",
      boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
    }}>
      {accent && <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 3, background: accent }} />}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: T.text3, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</div>
        {sparkline && sparkline.length > 1 && (
          <div style={{ marginLeft: 8 }}><Sparkline values={sparkline} color={sparkColor || accent || T.accent} /></div>
        )}
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1, fontFamily: '"SF Mono", Monaco, monospace', letterSpacing: -0.5 }}>{value}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, minHeight: 14 }}>
        {delta != null && (
          <span style={{
            fontSize: 11, fontWeight: 700, color: deltaColor,
            display: "inline-flex", alignItems: "center", gap: 2,
            background: deltaColor + "15", padding: "1px 6px", borderRadius: 3,
          }}>
            <span style={{ fontSize: 8 }}>{deltaArrow}</span>
            {fmtPct(Math.abs(delta), false)}
          </span>
        )}
        {sub && <span style={{ fontSize: 11, color: T.text3 }}>{sub}</span>}
      </div>
    </div>
  );
}

// ─── Stacked area chart (with gradient fills) ────────────────────────────
function StackedAreaChart({ data, T, setTip, height = 280 }) {
  const { months, categories, stacks, max } = useMemo(() => {
    const ms = Array.from(new Set(data.map(d => d.month))).sort();
    const cs = Array.from(new Set(data.map(d => d.category)));
    const catTotals = cs.map(c => ({ c, t: data.filter(d => d.category === c).reduce((s, d) => s + +d.amount, 0) }));
    catTotals.sort((a, b) => b.t - a.t);
    const ordered = catTotals.map(x => x.c);
    const map = new Map();
    for (const d of data) map.set(`${d.month}|${d.category}`, +d.amount);
    const st = ms.map(m => {
      const layers = []; let acc = 0;
      for (const c of ordered) {
        const v = map.get(`${m}|${c}`) || 0;
        layers.push({ category: c, value: v, y0: acc, y1: acc + v });
        acc += v;
      }
      return { month: m, layers, total: acc };
    });
    return { months: ms, categories: ordered, stacks: st, max: Math.max(1, ...st.map(s => s.total)) };
  }, [data]);

  if (!months.length) return <EmptyChart T={T} message="No spend data" />;
  const W = 780, padL = 56, padR = 16, padT = 16, padB = 36;
  const innerW = W - padL - padR, innerH = height - padT - padB;
  const x = (i) => padL + (months.length === 1 ? innerW / 2 : (i / (months.length - 1)) * innerW);
  const y = (v) => padT + innerH - (v / max) * innerH;

  const paths = categories.map(c => {
    const top = stacks.map((s, i) => `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${y(s.layers.find(l => l.category === c).y1).toFixed(1)}`).join(" ");
    const bot = [...stacks].reverse().map((s, i) => `L ${x(months.length - 1 - i).toFixed(1)} ${y(s.layers.find(l => l.category === c).y0).toFixed(1)}`).join(" ");
    return { category: c, d: `${top} ${bot} Z` };
  });
  const yticks = [0, 0.25, 0.5, 0.75, 1].map(p => max * p);

  return (
    <svg viewBox={`0 0 ${W} ${height}`} style={{ width: "100%", height, display: "block" }}>
      <defs>
        {categories.map(c => (
          <linearGradient key={c} id={`sa-grad-${c}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={CAT_COLOR(c)} stopOpacity="0.95" />
            <stop offset="100%" stopColor={CAT_COLOR(c)} stopOpacity="0.7" />
          </linearGradient>
        ))}
      </defs>
      {yticks.map((v, i) => (
        <g key={i}>
          <line x1={padL} y1={y(v)} x2={W - padR} y2={y(v)} stroke={T.border} strokeDasharray={i === 0 ? "none" : "2,4"} strokeWidth={i === 0 ? 1 : 0.5} opacity={i === 0 ? 1 : 0.5} />
          <text x={padL - 8} y={y(v) + 3} fontSize={9} fill={T.text3} textAnchor="end">{fmt$(v)}</text>
        </g>
      ))}
      {paths.map((p, i) => <path key={i} d={p.d} fill={`url(#sa-grad-${p.category})`} stroke={CAT_COLOR(p.category)} strokeWidth={0.4} opacity={0.95} />)}
      {months.map((m, i) => (
        <text key={i} x={x(i)} y={height - 16} fontSize={9.5} fill={T.text3} textAnchor="middle">{fmtMonth(m)}</text>
      ))}
      {months.map((m, i) => (
        <rect key={`h${i}`}
          x={i === 0 ? padL : x(i) - (months.length > 1 ? (x(1) - x(0)) : 30) / 2}
          y={padT}
          width={months.length === 1 ? innerW : (x(1) - x(0))}
          height={innerH} fill="transparent"
          onMouseMove={(e) => {
            const s = stacks[i];
            setTip({
              x: e.clientX, y: e.clientY,
              lines: [
                { value: fmtMonth(m), bold: true },
                ...s.layers.filter(l => l.value > 0).reverse().map(l => ({
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

// ─── Donut chart with category list ──────────────────────────────────────
function DonutChart({ data, T, setTip }) {
  const total = data.reduce((s, d) => s + Number(d.amount || 0), 0);
  if (total === 0) return <EmptyChart T={T} message="No data" />;
  const sorted = [...data].sort((a, b) => +b.amount - +a.amount).filter(d => +d.amount !== 0);
  const W = 220, R = 92, r = 56, cx = W / 2, cy = W / 2;
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
    return { ...d, d: `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${r} ${r} 0 ${large} 0 ${x4} ${y4} Z`, pct: Math.abs(v) / total };
  });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
      <svg viewBox={`0 0 ${W} ${W}`} style={{ width: 220, height: 220, flexShrink: 0 }}>
        {slices.map((s, i) => (
          <path key={i} d={s.d} fill={CAT_COLOR(s.category)}
            onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, lines: [
              { swatch: CAT_COLOR(s.category), value: s.category, bold: true },
              { label: "Amount", value: fmt$Full(s.amount), mono: true },
              { label: "Share", value: (s.pct * 100).toFixed(1) + "%", mono: true },
              { label: "Lines", value: fmtNum(s.line_count), mono: true },
              s.mom_delta_pct != null ? { label: "MoM", value: fmtPct(s.mom_delta_pct), mono: true } : null,
            ].filter(Boolean) })}
            onMouseLeave={() => setTip(null)}
            style={{ cursor: "pointer", transition: "transform 0.15s", transformOrigin: `${cx}px ${cy}px` }}
            onMouseEnter={(e) => e.target.setAttribute("transform", "scale(1.03)")}
            onMouseOut={(e) => e.target.removeAttribute("transform")}
          />
        ))}
        <text x={cx} y={cy - 8} textAnchor="middle" fontSize={11} fill={T.text3} fontWeight={600}>Total</text>
        <text x={cx} y={cy + 12} textAnchor="middle" fontSize={20} fontWeight={800} fill={T.text} fontFamily='"SF Mono", Monaco, monospace' letterSpacing={-0.5}>{fmt$(total)}</text>
      </svg>
      <div style={{ flex: 1, minWidth: 220, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 11 }}>
        {slices.map((s, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "2px 0" }}>
            <span style={{ width: 10, height: 10, background: CAT_COLOR(s.category), borderRadius: 2, flexShrink: 0 }} />
            <span style={{ color: T.text2, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.category}</span>
            <span style={{ color: T.text, fontFamily: '"SF Mono", Monaco, monospace', fontWeight: 600 }}>{(s.pct * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Horizontal bar list with secondary metric ───────────────────────────
function HBarList({ data, T, setTip, labelKey, valueKey, secondaryKey, secondaryLabel,
                   formatValue = fmt$, formatSecondary = fmtNum,
                   colorOf, sublabelKey, animate = true }) {
  if (!data || !data.length) return <EmptyChart T={T} message="No data" />;
  const max = Math.max(1, ...data.map(d => Math.abs(Number(d[valueKey] || 0))));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {data.map((d, i) => {
        const v = Number(d[valueKey] || 0);
        const w = (Math.abs(v) / max) * 100;
        const c = colorOf ? colorOf(d) : T.accent;
        const sub = sublabelKey ? d[sublabelKey] : null;
        return (
          <div key={i}
            onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, lines: [
              { value: d[labelKey], bold: true, swatch: c },
              { label: valueKey, value: formatValue(v), mono: true },
              secondaryKey && d[secondaryKey] != null ? { label: secondaryLabel, value: formatSecondary(d[secondaryKey]), mono: true } : null,
              d.avg_cost != null && d.avg_cost > 0 ? { label: "avg", value: fmt$Full(d.avg_cost, 3), mono: true } : null,
            ].filter(Boolean) })}
            onMouseLeave={() => setTip(null)}
            style={{ display: "grid", gridTemplateColumns: "160px 1fr 100px", alignItems: "center", gap: 10, cursor: "default", padding: "2px 0" }}>
            <div style={{ overflow: "hidden" }}>
              <div style={{ fontSize: 11.5, color: T.text2, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={d[labelKey]}>{d[labelKey]}</div>
              {sub && <div style={{ fontSize: 9.5, color: T.text3, marginTop: 1 }}>{sub}</div>}
            </div>
            <div style={{ height: 22, background: T.surface2, borderRadius: 4, position: "relative", overflow: "hidden" }}>
              <div style={{
                height: "100%", width: `${w}%`, borderRadius: 4,
                background: `linear-gradient(90deg, ${c}, ${c}dd)`,
                transition: animate ? "width 0.5s cubic-bezier(0.4, 0, 0.2, 1)" : "none",
                boxShadow: `0 0 0 1px ${c}33`,
              }} />
              {secondaryKey && d[secondaryKey] != null && (
                <div style={{
                  position: "absolute", left: 8, top: 0, bottom: 0,
                  display: "flex", alignItems: "center", fontSize: 9.5, color: "#fff",
                  fontFamily: '"SF Mono", Monaco, monospace', fontWeight: 600,
                  textShadow: "0 1px 2px rgba(0,0,0,0.4)",
                }}>
                  {formatSecondary(d[secondaryKey])}
                </div>
              )}
            </div>
            <div style={{ fontSize: 11.5, fontFamily: '"SF Mono", Monaco, monospace', textAlign: "right", fontWeight: 700, color: T.text }}>{formatValue(v)}</div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Multi-line chart (each metric has its own scale) ────────────────────
function MultiLineChart({ data, T, setTip, series, height = 260 }) {
  if (!data || !data.length) return <EmptyChart T={T} message="No data" />;
  const W = 780, padL = 56, padR = 100, padT = 18, padB = 36;
  const innerW = W - padL - padR, innerH = height - padT - padB;
  const ranges = {};
  for (const s of series) {
    const vals = data.map(d => Number(d[s.key])).filter(v => v != null && !isNaN(v));
    if (vals.length) ranges[s.key] = { min: 0, max: Math.max(1, ...vals) };
  }
  const x = (i) => padL + (data.length === 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const yScale = (key, v) => {
    const r = ranges[key];
    if (!r) return padT + innerH;
    return padT + innerH - ((v - r.min) / (r.max - r.min || 1)) * innerH;
  };
  return (
    <svg viewBox={`0 0 ${W} ${height}`} style={{ width: "100%", height, display: "block" }}>
      <defs>
        {series.map(s => (
          <linearGradient key={s.key} id={`ml-grad-${s.key}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={s.color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={s.color} stopOpacity="0" />
          </linearGradient>
        ))}
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
        if (!ranges[series[0]?.key]) return null;
        const v = ranges[series[0].key].max * p;
        return (
          <g key={i}>
            <line x1={padL} y1={yScale(series[0].key, v)} x2={W - padR} y2={yScale(series[0].key, v)} stroke={T.border} strokeDasharray={i === 0 ? "none" : "2,4"} strokeWidth={i === 0 ? 1 : 0.5} opacity={i === 0 ? 1 : 0.5} />
            <text x={padL - 8} y={yScale(series[0].key, v) + 3} fontSize={9} fill={T.text3} textAnchor="end">{series[0].fmt(v)}</text>
          </g>
        );
      })}
      {series.map(s => {
        if (!ranges[s.key]) return null;
        const linePath = data.map((d, i) => {
          const v = Number(d[s.key]);
          if (v == null || isNaN(v)) return null;
          return `${i === 0 ? "M" : "L"} ${x(i).toFixed(1)} ${yScale(s.key, v).toFixed(1)}`;
        }).filter(Boolean).join(" ");
        const areaPath = `${linePath} L ${x(data.length - 1).toFixed(1)} ${padT + innerH} L ${padL} ${padT + innerH} Z`;
        return (
          <g key={s.key}>
            <path d={areaPath} fill={`url(#ml-grad-${s.key})`} />
            <path d={linePath} fill="none" stroke={s.color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
            {data.map((d, i) => {
              const v = Number(d[s.key]);
              if (v == null || isNaN(v)) return null;
              return <circle key={i} cx={x(i)} cy={yScale(s.key, v)} r={3.5} fill={s.color} stroke={T.surface} strokeWidth={1.5} />;
            })}
          </g>
        );
      })}
      {data.map((d, i) => (
        <text key={i} x={x(i)} y={height - 16} fontSize={9.5} fill={T.text3} textAnchor="middle">{fmtMonth(d.month)}</text>
      ))}
      {data.map((d, i) => (
        <rect key={`h${i}`}
          x={i === 0 ? padL : x(i) - (data.length > 1 ? (x(1) - x(0)) : 30) / 2}
          y={padT} width={data.length === 1 ? innerW : (x(1) - x(0))} height={innerH} fill="transparent"
          onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, lines: [
            { value: fmtMonth(d.month), bold: true },
            ...series.map(s => ({ swatch: s.color, label: s.label, value: s.fmt(d[s.key] || 0), mono: true })),
          ]})}
          onMouseLeave={() => setTip(null)}
        />
      ))}
      <g transform={`translate(${W - padR + 12} ${padT})`}>
        {series.map((s, i) => (
          <g key={i} transform={`translate(0 ${i * 18})`}>
            <line x1={0} y1={6} x2={16} y2={6} stroke={s.color} strokeWidth={2.5} strokeLinecap="round" />
            <text x={20} y={6} fontSize={10} fill={T.text2} dominantBaseline="middle" fontWeight={500}>{s.label}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}

// ─── Histogram with gradient bars ────────────────────────────────────────
function Histogram({ data, T, setTip, color = "#3B82F6", height = 240 }) {
  if (!data || !data.length) return <EmptyChart T={T} message="No data" />;
  const max = Math.max(1, ...data.map(d => d.count || d.shipments));
  const W = 780, padL = 48, padR = 16, padT = 18, padB = 44;
  const innerW = W - padL - padR, innerH = height - padT - padB;
  const barW = innerW / data.length * 0.78;
  const x = (i) => padL + (i + 0.5) / data.length * innerW - barW / 2;
  const y = (v) => padT + innerH - (v / max) * innerH;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} style={{ width: "100%", height, display: "block" }}>
      <defs>
        <linearGradient id="hist-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="1" />
          <stop offset="100%" stopColor={color} stopOpacity="0.7" />
        </linearGradient>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map((p, i) => {
        const v = max * p;
        return (
          <g key={i}>
            <line x1={padL} y1={y(v)} x2={W - padR} y2={y(v)} stroke={T.border} strokeDasharray={i === 0 ? "none" : "2,4"} strokeWidth={i === 0 ? 1 : 0.5} opacity={i === 0 ? 1 : 0.5} />
            <text x={padL - 8} y={y(v) + 3} fontSize={9} fill={T.text3} textAnchor="end">{fmtCompact(v)}</text>
          </g>
        );
      })}
      {data.map((d, i) => {
        const count = d.count || d.shipments;
        return (
          <g key={i}>
            <rect x={x(i)} y={y(count)} width={barW} height={padT + innerH - y(count)} fill="url(#hist-grad)" rx={3}
              onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, lines: [
                { value: d.bucket, bold: true, label: "Range", swatch: color },
                { label: "Shipments", value: fmtNum(count), mono: true },
                { label: "Total", value: fmt$Full(d.total || d.cost || 0), mono: true },
                d.avg != null ? { label: "Avg", value: fmt$Full(d.avg, 3), mono: true } : null,
              ].filter(Boolean) })}
              onMouseLeave={() => setTip(null)}
              style={{ transition: "opacity 0.15s", cursor: "default" }}
              onMouseEnter={(e) => e.target.style.opacity = 0.85}
              onMouseOut={(e) => e.target.style.opacity = 1}
            />
            <text x={x(i) + barW / 2} y={height - 26} fontSize={9.5} fill={T.text2} textAnchor="middle" fontWeight={500}>{d.bucket}</text>
            <text x={x(i) + barW / 2} y={height - 12} fontSize={8.5} fill={T.text3} textAnchor="middle" fontFamily='"SF Mono", Monaco, monospace'>{fmt$(d.total || d.cost || 0)}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ─── Daily cadence heatmap (last ~90 days) ───────────────────────────────
function DailyHeatmap({ data, T, setTip }) {
  if (!data || !data.length) return <EmptyChart T={T} message="No daily shipment data" />;
  const byDay = new Map(data.map(d => [d.day, d]));
  const days = [];
  const today = new Date();
  for (let i = 89; i >= 0; i--) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    const iso = d.toISOString().split("T")[0];
    days.push({ date: d, iso, ...byDay.get(iso) });
  }
  const maxShip = Math.max(1, ...days.map(d => d.shipments || 0));
  const startDow = (days[0].date.getDay() + 6) % 7;
  const cellSize = 14, gap = 3;
  const cols = Math.ceil((days.length + startDow) / 7);
  const W = (cellSize + gap) * cols + 30;
  const H = (cellSize + gap) * 7 + 20;
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", maxWidth: 780, height: H, display: "block" }}>
        {["M","T","W","T","F","S","S"].map((d, i) => (
          <text key={i} x={2} y={(cellSize + gap) * i + cellSize - 2} fontSize={8} fill={T.text3}>{d}</text>
        ))}
        {days.map((day, idx) => {
          const pos = idx + startDow;
          const col = Math.floor(pos / 7);
          const row = pos % 7;
          const intensity = day.shipments ? Math.min(1, Math.log10(1 + day.shipments) / Math.log10(1 + maxShip)) : 0;
          const fillColor = day.shipments
            ? `rgba(16, 185, 129, ${0.15 + intensity * 0.85})`
            : T.surface2;
          return (
            <rect key={idx}
              x={col * (cellSize + gap) + 20} y={row * (cellSize + gap)}
              width={cellSize} height={cellSize} rx={2}
              fill={fillColor}
              stroke={T.border} strokeWidth={0.5}
              onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, lines: [
                { value: day.date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" }), bold: true },
                day.shipments ? { label: "Shipments", value: fmtNum(day.shipments), mono: true, swatch: "#10B981" } : { value: "No shipments recorded", label: null },
                day.cost ? { label: "Spend", value: fmt$Full(day.cost), mono: true } : null,
              ].filter(Boolean) })}
              onMouseLeave={() => setTip(null)}
              style={{ cursor: "default", transition: "stroke 0.1s" }}
              onMouseEnter={(e) => { e.target.style.stroke = T.text; e.target.style.strokeWidth = 1.5; }}
              onMouseOut={(e) => { e.target.style.stroke = T.border; e.target.style.strokeWidth = 0.5; }}
            />
          );
        })}
      </svg>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontSize: 9.5, color: T.text3 }}>
        <span>Less</span>
        {[0.1, 0.3, 0.5, 0.7, 0.95].map((o, i) => (
          <span key={i} style={{ width: 12, height: 12, background: `rgba(16, 185, 129, ${o})`, borderRadius: 2, border: `1px solid ${T.border}` }} />
        ))}
        <span>More</span>
        <span style={{ marginLeft: 16, color: T.text3 }}>Last 90 days · log-scaled</span>
      </div>
    </div>
  );
}

// ─── Top movers list (positive/negative bars) ────────────────────────────
function TopMovers({ data, T, setTip }) {
  if (!data || !data.length) return <EmptyChart T={T} message="No month-over-month changes detected" />;
  const max = Math.max(...data.map(d => Math.abs(Number(d.delta_abs || 0))));
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {data.map((m, i) => {
        const v = Number(m.delta_abs);
        const pct = Math.min(100, (Math.abs(v) / max) * 100);
        const isUp = v > 0;
        const color = isUp ? "#EF4444" : "#10B981";
        return (
          <div key={i}
            onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, lines: [
              { value: m.description, bold: true, swatch: CAT_COLOR(m.category) },
              { label: "Category", value: m.category, mono: false },
              { label: "Last month", value: fmt$Full(m.current_amount), mono: true },
              { label: "Prior month", value: fmt$Full(m.prior_amount), mono: true },
              { label: "Change", value: (isUp ? "+" : "") + fmt$Full(m.delta_abs), mono: true, swatch: color },
              m.delta_pct != null ? { label: "Change %", value: fmtPct(m.delta_pct), mono: true } : null,
            ].filter(Boolean) })}
            onMouseLeave={() => setTip(null)}
            style={{
              display: "grid", gridTemplateColumns: "1fr 200px 110px",
              alignItems: "center", gap: 12, padding: "6px 0",
              borderBottom: `1px solid ${T.border}25`,
            }}>
            <div style={{ overflow: "hidden" }}>
              <div style={{ fontSize: 11.5, color: T.text2, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={m.description}>{m.description}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 1 }}>
                <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: CAT_COLOR(m.category) + "30", color: CAT_COLOR(m.category), fontWeight: 600 }}>{m.category}</span>
              </div>
            </div>
            <div style={{ height: 14, position: "relative", display: "flex", alignItems: "center" }}>
              <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: T.border }} />
              <div style={{
                position: "absolute",
                left: isUp ? "50%" : `${50 - pct / 2}%`,
                width: `${pct / 2}%`,
                height: 10, top: 2,
                background: `linear-gradient(${isUp ? "90deg" : "270deg"}, ${color}cc, ${color})`,
                borderRadius: isUp ? "0 3px 3px 0" : "3px 0 0 3px",
              }} />
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color, fontFamily: '"SF Mono", Monaco, monospace' }}>{isUp ? "+" : ""}{fmt$Full(v)}</div>
              {m.delta_pct != null && <div style={{ fontSize: 9.5, color: T.text3, fontFamily: '"SF Mono", Monaco, monospace' }}>{fmtPct(m.delta_pct)}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Empty chart placeholder ─────────────────────────────────────────────
function EmptyChart({ T, message }) {
  return (
    <div style={{ padding: 40, textAlign: "center", color: T.text3, fontSize: 12, fontStyle: "italic" }}>{message}</div>
  );
}

// ─── Section card ────────────────────────────────────────────────────────
function Section({ T, title, subtitle, right, children, accent }) {
  return (
    <div style={{
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 12, padding: 18, marginBottom: 14,
      boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {accent && <div style={{ width: 4, height: 16, background: accent, borderRadius: 2 }} />}
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text, letterSpacing: -0.2 }}>{title}</div>
          </div>
          {subtitle && <div style={{ fontSize: 11.5, color: T.text3, marginTop: 3, marginLeft: accent ? 12 : 0 }}>{subtitle}</div>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

// ─── Period quick-select chips ───────────────────────────────────────────
function PeriodChips({ T, value, onChange }) {
  const now = new Date();
  const iso = (d) => d.toISOString().split("T")[0];
  const today = iso(now);
  const opts = [
    { id: "all", label: "All time", range: [null, null] },
    { id: "ytd", label: "YTD", range: [iso(new Date(now.getFullYear(), 0, 1)), today] },
    { id: "qtd", label: "QTD", range: [iso(new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1)), today] },
    { id: "mtd", label: "MTD", range: [iso(new Date(now.getFullYear(), now.getMonth(), 1)), today] },
    { id: "90d", label: "Last 90d", range: [iso(new Date(now.getTime() - 90 * 86400000)), today] },
    { id: "30d", label: "Last 30d", range: [iso(new Date(now.getTime() - 30 * 86400000)), today] },
  ];
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {opts.map(o => {
        const active = (value || "all") === o.id;
        return (
          <button key={o.id}
            onClick={() => onChange(o.id, o.range)}
            style={{
              padding: "4px 10px", fontSize: 10.5, fontWeight: 600,
              background: active ? T.accent : "transparent",
              color: active ? "#fff" : T.text2,
              border: `1px solid ${active ? T.accent : T.border}`,
              borderRadius: 14, cursor: "pointer",
              transition: "all 0.15s",
            }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ─── Multi-select pill ───────────────────────────────────────────────────
function MultiSelectPill({ T, label, options, value, onChange }) {
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
  const summary = !value ? "All" : value.length === 1 ? value[0] : `${value.length}`;
  return (
    <div ref={wrap} style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)} style={{
        padding: "5px 11px", fontSize: 11, background: value ? T.accent + "20" : T.surface2,
        border: `1px solid ${value ? T.accent : T.border}`,
        borderRadius: 14, color: value ? T.accent : T.text2, cursor: "pointer",
        display: "flex", alignItems: "center", gap: 5, fontWeight: 500,
      }}>
        <span style={{ color: value ? T.accent : T.text3, fontSize: 10 }}>{label}</span>
        <span style={{ fontWeight: 700 }}>{summary}</span>
        <span style={{ fontSize: 7, marginLeft: 2 }}>▼</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 0, marginTop: 6, zIndex: 100,
          background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8,
          padding: 4, minWidth: 200, maxHeight: 320, overflowY: "auto",
          boxShadow: "0 8px 24px rgba(0,0,0,0.2)",
        }}>
          <div onClick={() => { onChange(null); setOpen(false); }} style={{
            padding: "6px 10px", fontSize: 11.5, cursor: "pointer", borderRadius: 4,
            background: !value ? T.accent + "20" : "transparent", color: !value ? T.accent : T.text2,
            fontWeight: 600,
          }}>(All)</div>
          {options.map(opt => (
            <div key={opt} onClick={() => toggle(opt)} style={{
              padding: "6px 10px", fontSize: 11.5, cursor: "pointer", borderRadius: 4,
              display: "flex", alignItems: "center", gap: 8,
              background: selected.includes(opt) ? T.accent + "20" : "transparent",
              color: selected.includes(opt) ? T.accent : T.text2,
              fontWeight: selected.includes(opt) ? 600 : 400,
            }}>
              <span style={{ width: 12, textAlign: "center", fontWeight: 700 }}>{selected.includes(opt) ? "✓" : ""}</span>
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Main Component
// ════════════════════════════════════════════════════════════════════════

export default function ThreePLBillingReports({ goToDetail }) {
  const { tokens: T } = useTheme();
  const { orgId } = useAuth();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [tip, setTip] = useState(null);
  const [activePeriod, setActivePeriod] = useState("all");

  const [filters, setFilters] = useState({
    providers: null, warehouses: null, sources: null,
    periodStart: null, periodEnd: null,
  });
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
  const deltas = report?.kpi_deltas;
  const monthly = report?.timeseries_monthly || [];

  const sparks = useMemo(() => {
    if (!monthly.length) return {};
    return {
      spend:     monthly.map(m => Number(m.spend || 0)),
      shipments: monthly.map(m => Number(m.shipments || 0)),
      units:     monthly.map(m => Number(m.units || 0)),
      orders:    monthly.map(m => Number(m.orders || 0)),
      cps:       monthly.map(m => Number(m.cost_per_shipment || 0)),
      cpkg:      monthly.map(m => Number(m.cost_per_kg || 0)),
    };
  }, [monthly]);

  const handlePeriodChip = (id, [start, end]) => {
    setActivePeriod(id);
    setFilters(f => ({ ...f, periodStart: start, periodEnd: end }));
  };

  if (!orgId) return <div style={{ padding: 30, color: T.text3 }}>Loading…</div>;

  return (
    <div style={{ position: "relative" }}>
      <FloatingTooltip tip={tip} T={T} />

      {/* Sticky filter bar */}
      <div style={{
        position: "sticky", top: 0, zIndex: 50,
        background: T.bg, padding: "8px 0 12px 0", marginBottom: 12,
        borderBottom: `1px solid ${T.border}`,
      }}>
        <div style={{
          background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12,
          padding: "12px 16px", display: "flex", alignItems: "center",
          gap: 16, flexWrap: "wrap",
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        }}>
          <PeriodChips T={T} value={activePeriod} onChange={handlePeriodChip} />
          <div style={{ width: 1, height: 20, background: T.border }} />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <MultiSelectPill T={T} label="Provider" options={filterOptions.providers} value={filters.providers}
              onChange={v => setFilters(f => ({ ...f, providers: v }))} />
            <MultiSelectPill T={T} label="Warehouse" options={filterOptions.warehouses} value={filters.warehouses}
              onChange={v => setFilters(f => ({ ...f, warehouses: v }))} />
            <MultiSelectPill T={T} label="Source" options={filterOptions.sources} value={filters.sources}
              onChange={v => setFilters(f => ({ ...f, sources: v }))} />
          </div>
          <div style={{ display: "flex", gap: 6, marginLeft: "auto", alignItems: "center" }}>
            {(filters.providers || filters.warehouses || filters.sources || filters.periodStart) && (
              <button onClick={() => { setActivePeriod("all"); setFilters({ providers: null, warehouses: null, sources: null, periodStart: null, periodEnd: null }); }}
                style={{ padding: "5px 10px", fontSize: 11, background: "transparent", border: `1px solid ${T.border}`, borderRadius: 14, color: T.text3, cursor: "pointer" }}>
                Reset
              </button>
            )}
            <button onClick={fetchReport} disabled={loading}
              style={{ padding: "5px 10px", fontSize: 11, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 14, color: T.text2, cursor: "pointer", opacity: loading ? 0.5 : 1, fontWeight: 600 }}>
              {loading ? "Loading…" : "↻"}
            </button>
          </div>
        </div>
      </div>

      {err && (
        <div style={{ padding: 14, background: "#EF444415", border: "1px solid #EF4444", borderRadius: 8, color: "#EF4444", fontSize: 12, marginBottom: 14 }}>
          ⚠ {err}
        </div>
      )}

      {loading && !report && (
        <div style={{ padding: 80, textAlign: "center", color: T.text3, fontSize: 12 }}>Loading report…</div>
      )}

      {report && (
        <>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8, marginTop: 4 }}>At a glance</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, marginBottom: 20 }}>
            <KpiTile T={T} label="Total Spend" value={fmt$(kpis.total_spend)}
              sub={`${kpis.invoice_count} invoices`}
              delta={deltas?.spend?.delta_pct} deltaInverse
              sparkline={sparks.spend} sparkColor="#3B82F6" accent="#3B82F6" />
            <KpiTile T={T} label="Shipments" value={fmtCompact(kpis.shipment_count)}
              sub={kpis.shipment_count > 0 ? `${fmt$Full(kpis.total_spend / kpis.shipment_count, 2)} avg` : ""}
              delta={deltas?.shipments?.delta_pct}
              sparkline={sparks.shipments} sparkColor="#10B981" accent="#10B981" />
            <KpiTile T={T} label="Units Shipped" value={fmtCompact(kpis.units_shipped)}
              sub={kpis.units_shipped > 0 ? `${fmt$Full(kpis.total_spend / kpis.units_shipped, 3)}/unit` : ""}
              delta={deltas?.units?.delta_pct}
              sparkline={sparks.units} sparkColor="#F59E0B" accent="#F59E0B" />
            <KpiTile T={T} label="Orders" value={fmtCompact(kpis.orders_shipped)}
              sub={kpis.orders_shipped > 0 ? `${fmt$Full(kpis.total_spend / kpis.orders_shipped, 2)}/order` : ""}
              delta={deltas?.orders?.delta_pct}
              sparkline={sparks.orders} sparkColor="#A855F7" accent="#A855F7" />
            <KpiTile T={T} label="$/Shipment" value={kpis.shipment_count > 0 ? fmt$Full(kpis.total_spend / kpis.shipment_count, 2) : "—"}
              sub="Last 6 months"
              delta={deltas?.cost_per_shipment?.delta_pct} deltaInverse
              sparkline={sparks.cps} sparkColor="#06B6D4" accent="#06B6D4" />
            {kpis.weight_total_kg > 0 && (
              <KpiTile T={T} label="$/Kg" value={fmt$Full(kpis.total_spend / kpis.weight_total_kg, 3)}
                sub={`${fmtCompact(kpis.weight_total_kg)} kg shipped`}
                sparkline={sparks.cpkg} sparkColor="#EC4899" accent="#EC4899" />
            )}
          </div>

          <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Cost & volume trends</div>

          <Section T={T} accent="#3B82F6"
            title="Spend over time"
            subtitle={`Stacked by canonical category, monthly · ${kpis.months_in_range || monthly.length} months in scope`}
            right={deltas?.spend?.delta_pct != null && (
              <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: T.text3 }}>
                <span>vs prior month:</span>
                <span style={{
                  fontWeight: 700, color: deltas.spend.delta_pct > 0 ? "#EF4444" : "#10B981",
                  background: (deltas.spend.delta_pct > 0 ? "#EF4444" : "#10B981") + "15",
                  padding: "2px 8px", borderRadius: 4,
                }}>
                  {deltas.spend.delta_pct > 0 ? "▲" : "▼"} {fmtPct(Math.abs(deltas.spend.delta_pct), false)}
                </span>
              </div>
            )}>
            <StackedAreaChart data={report.monthly_category || []} T={T} setTip={setTip} />
          </Section>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <Section T={T} accent="#10B981" title="Cost mix" subtitle="By canonical category">
              <DonutChart data={report.category_mix || []} T={T} setTip={setTip} />
            </Section>
            <Section T={T} accent="#A855F7" title="Unit economics" subtitle="Cost efficiency over time">
              <MultiLineChart data={monthly} T={T} setTip={setTip} height={260}
                series={[
                  { key: "cost_per_shipment", label: "$/shipment", color: "#3B82F6", fmt: v => fmt$Full(v, 2) },
                  { key: "cost_per_unit", label: "$/unit", color: "#10B981", fmt: v => fmt$Full(v, 3) },
                  { key: "cost_per_order", label: "$/order", color: "#A855F7", fmt: v => fmt$Full(v, 2) },
                ]} />
            </Section>
          </div>

          {report.top_movers?.length > 0 && (
            <Section T={T} accent="#EC4899" title="Top movers" subtitle="Biggest absolute spend changes vs prior month — red rises, green declines">
              <TopMovers data={report.top_movers} T={T} setTip={setTip} />
            </Section>
          )}

          <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.8, marginTop: 24, marginBottom: 8 }}>Operations</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <Section T={T} accent="#F59E0B" title="Service levels"
              subtitle={`Per-shipment cost by tier · ${(report.service_levels || []).length} active`}>
              <HBarList data={report.service_levels || []} T={T} setTip={setTip}
                labelKey="service_level" valueKey="cost"
                secondaryKey="shipments" secondaryLabel="parcels"
                sublabelKey={null}
                colorOf={(d) => SVC_COLOR(d.service_level)} />
            </Section>
            <Section T={T} accent="#06B6D4" title="Warehouses"
              subtitle={`${(report.warehouse_compare || []).length} warehouses tracked`}>
              <HBarList data={report.warehouse_compare || []} T={T} setTip={setTip}
                labelKey="warehouse" valueKey="spend"
                secondaryKey="orders" secondaryLabel="orders"
                colorOf={(d) => d.warehouse === "CVG" ? "#3B82F6" : d.warehouse === "RNO" ? "#10B981" : d.warehouse === "LAS3" ? "#F59E0B" : "#6B7280"} />
              <div style={{ marginTop: 14, fontSize: 11, paddingTop: 14, borderTop: `1px solid ${T.border}` }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px 90px", gap: 6, fontWeight: 700, color: T.text3, fontSize: 9.5, textTransform: "uppercase", letterSpacing: 0.4, paddingBottom: 6 }}>
                  <div>Warehouse</div><div style={{ textAlign: "right" }}>Spend</div><div style={{ textAlign: "right" }}>$/Unit</div><div style={{ textAlign: "right" }}>$/Order</div>
                </div>
                {(report.warehouse_compare || []).map((w, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr 90px 90px 90px", gap: 6, padding: "4px 0", fontFamily: '"SF Mono", Monaco, monospace', fontSize: 10.5 }}>
                    <div style={{ fontWeight: 600, color: T.text2 }}>{w.warehouse}</div>
                    <div style={{ textAlign: "right" }}>{fmt$(w.spend)}</div>
                    <div style={{ textAlign: "right", color: T.text3 }}>{w.cost_per_unit ? fmt$Full(w.cost_per_unit, 3) : "—"}</div>
                    <div style={{ textAlign: "right", color: T.text3 }}>{w.cost_per_order ? fmt$Full(w.cost_per_order, 2) : "—"}</div>
                  </div>
                ))}
              </div>
            </Section>
          </div>

          <Section T={T} accent="#3B82F6" title="Freight cost distribution"
            subtitle="Per-parcel charge distribution — how do most of your shipments price out?">
            <Histogram data={report.freight_histogram || []} T={T} setTip={setTip} color="#3B82F6" />
          </Section>

          {(report.zone_breakdown?.length > 0 || report.weight_distribution?.length > 0) && (
            <div style={{ display: "grid", gridTemplateColumns: (report.zone_breakdown?.length > 0 && report.weight_distribution?.length > 0) ? "1fr 1fr" : "1fr", gap: 14, marginBottom: 14 }}>
              {report.zone_breakdown?.length > 0 && (
                <Section T={T} accent="#A855F7" title="Shipping zones"
                  subtitle="Cost & volume per Stord zone — higher zones = farther destinations">
                  <HBarList data={report.zone_breakdown || []} T={T} setTip={setTip}
                    labelKey="zone" valueKey="cost"
                    secondaryKey="shipments" secondaryLabel="parcels"
                    colorOf={(d) => {
                      const z = parseInt(d.zone);
                      if (isNaN(z)) return "#6B7280";
                      const colors = ["#10B981", "#22C55E", "#84CC16", "#EAB308", "#F59E0B", "#F97316", "#EF4444", "#DC2626", "#991B1B"];
                      return colors[Math.min(z - 1, 8)] || "#6B7280";
                    }} />
                </Section>
              )}
              {report.weight_distribution?.length > 0 && (
                <Section T={T} accent="#EC4899" title="Weight distribution"
                  subtitle="Cost per parcel weight band">
                  <HBarList data={report.weight_distribution || []} T={T} setTip={setTip}
                    labelKey="bucket" valueKey="cost"
                    secondaryKey="shipments" secondaryLabel="parcels"
                    colorOf={() => "#EC4899"} />
                </Section>
              )}
            </div>
          )}

          {report.daily_cadence?.length > 0 && (
            <Section T={T} accent="#10B981" title="Shipping cadence"
              subtitle="Daily shipment volume — darker = more parcels that day">
              <DailyHeatmap data={report.daily_cadence} T={T} setTip={setTip} />
            </Section>
          )}

          <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.8, marginTop: 24, marginBottom: 8 }}>Details</div>

          <div style={{ display: "grid", gridTemplateColumns: report.geo_region?.length > 0 ? "2fr 1fr" : "1fr", gap: 14, marginBottom: 14 }}>
            <Section T={T} accent="#F59E0B" title="Largest line items"
              subtitle={`Biggest single charges across ${kpis.invoice_count} invoices`}>
              <div style={{ fontSize: 11 }}>
                <div style={{ display: "grid", gridTemplateColumns: "90px 1fr 90px 70px 90px", gap: 10, fontWeight: 700, color: T.text3, paddingBottom: 8, borderBottom: `1px solid ${T.border}`, fontSize: 9.5, textTransform: "uppercase", letterSpacing: 0.4 }}>
                  <div>Invoice</div><div>Description</div><div>Category</div><div>Qty</div><div style={{ textAlign: "right" }}>Amount</div>
                </div>
                {(report.top_lines || []).slice(0, 12).map((l, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "90px 1fr 90px 70px 90px", gap: 10, padding: "6px 0", borderBottom: `1px solid ${T.border}20`, fontFamily: '"SF Mono", Monaco, monospace', fontSize: 10.5, alignItems: "center" }}>
                    <div style={{ color: T.text3 }}>{l.invoice_number?.slice(0, 12)}</div>
                    <div style={{ fontFamily: "system-ui", color: T.text2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={l.description}>{l.description}</div>
                    <div><span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: CAT_COLOR(l.category) + "30", color: CAT_COLOR(l.category), fontWeight: 600 }}>{l.category}</span></div>
                    <div style={{ color: T.text3, textAlign: "right" }}>{fmtNum(l.qty)}</div>
                    <div style={{ textAlign: "right", fontWeight: 700, color: T.text }}>{fmt$Full(l.amount)}</div>
                  </div>
                ))}
              </div>
            </Section>
            {report.geo_region?.length > 0 && (
              <Section T={T} accent="#06B6D4" title="Top regions" subtitle="Recipient state breakdown">
                <HBarList data={report.geo_region.slice(0, 10)} T={T} setTip={setTip}
                  labelKey="region" valueKey="cost"
                  secondaryKey="shipments" secondaryLabel="parcels"
                  colorOf={() => "#06B6D4"} />
              </Section>
            )}
          </div>

          {report.adjustments?.count > 0 && (
            <Section T={T} accent="#DC2626" title="Adjustments & returns"
              subtitle={`${report.adjustments.count} credits and voids totaling ${fmt$Full(report.adjustments.amount)}`}>
              {report.adjustments.by_period?.length > 0 ? (
                <HBarList data={report.adjustments.by_period} T={T} setTip={setTip}
                  labelKey="month" valueKey="amount"
                  secondaryKey="count" secondaryLabel="count"
                  formatValue={v => fmt$Full(v, 2)}
                  colorOf={() => "#DC2626"} />
              ) : <EmptyChart T={T} message="No adjustments recorded" />}
            </Section>
          )}

          <Section T={T} accent="#6B7280" title="Invoices in scope"
            subtitle={`${report.invoice_list?.length || 0} invoices · click any row for full detail`}>
            <div style={{ overflowX: "auto", fontSize: 11 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr style={{ background: T.surface2 }}>
                    {["Invoice", "Provider", "Source", "WH", "Period", "Total", "Units", "Orders"].map((h, i) => (
                      <th key={h} style={{ padding: "8px 10px", textAlign: i >= 5 ? "right" : "left", fontSize: 9.5, color: T.text3, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, borderBottom: `2px solid ${T.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(report.invoice_list || []).map((inv, i) => (
                    <tr key={i} onClick={() => goToDetail && goToDetail(inv.id)}
                      style={{ borderBottom: `1px solid ${T.border}20`, cursor: goToDetail ? "pointer" : "default", transition: "background 0.1s" }}
                      onMouseEnter={(e) => e.currentTarget.style.background = T.surface2 + "80"}
                      onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}>
                      <td style={{ padding: "6px 10px", fontFamily: '"SF Mono", Monaco, monospace', color: T.text2, fontWeight: 600 }}>{inv.invoice_number}</td>
                      <td style={{ padding: "6px 10px", fontSize: 10.5 }}>{inv.provider_code}</td>
                      <td style={{ padding: "6px 10px", fontSize: 10, color: T.text3 }}>{inv.source}</td>
                      <td style={{ padding: "6px 10px", fontWeight: 600 }}>{inv.warehouse || "—"}</td>
                      <td style={{ padding: "6px 10px", fontSize: 10, color: T.text3, fontFamily: '"SF Mono", Monaco, monospace' }}>{inv.period_start} → {inv.period_end}</td>
                      <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: '"SF Mono", Monaco, monospace', fontWeight: 700 }}>{fmt$Full(inv.total)}</td>
                      <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: '"SF Mono", Monaco, monospace', color: T.text3 }}>{inv.units ? fmtNum(inv.units) : "—"}</td>
                      <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: '"SF Mono", Monaco, monospace', color: T.text3 }}>{inv.orders ? fmtNum(inv.orders) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <div style={{ fontSize: 10, color: T.text3, textAlign: "right", marginTop: 16, paddingBottom: 20 }}>
            Generated {report.generated_at ? new Date(report.generated_at).toLocaleString() : ""} · {(JSON.stringify(report).length / 1024).toFixed(1)} KB payload
          </div>
        </>
      )}
    </div>
  );
}
