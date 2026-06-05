"use client";

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useTheme } from "../lib/theme";
import { useAuth } from "../lib/auth";

const ALLOWED_CATEGORIES = [
  "adjustment","admin","freight","inbound_receiving","labour","materials",
  "order_processing","other","outbound_handling","returns","storage","vas",
];

const CATEGORY_COLORS = {
  freight: "#3B82F6", storage: "#10B981", outbound_handling: "#F59E0B",
  inbound_receiving: "#EF4444", order_processing: "#EC4899",
  materials: "#8B5CF6", admin: "#0EA5E9", labour: "#14B8A6",
  vas: "#84CC16", returns: "#F472B6", adjustment: "#DC2626", other: "#6B7280",
};
const CAT_COLOR = (k) => CATEGORY_COLORS[k] || "#6B7280";

const fmtCompact = (n) => {
  const x = Number(n || 0);
  if (Math.abs(x) >= 1_000_000_000) return (x / 1e9).toFixed(2) + "B";
  if (Math.abs(x) >= 1_000_000) return (x / 1e6).toFixed(2) + "M";
  if (Math.abs(x) >= 10_000) return (x / 1e3).toFixed(0) + "k";
  if (Math.abs(x) >= 1_000) return (x / 1e3).toFixed(1) + "k";
  return x.toLocaleString();
};
const fmt$ = (n) => (Number(n||0) < 0 ? "-$" : "$") + fmtCompact(Math.abs(Number(n||0)));
const fmt$Full = (n, frac = 2) =>
  (Number(n||0) < 0 ? "-$" : "$") + Math.abs(Number(n || 0)).toLocaleString(undefined, { minimumFractionDigits: frac, maximumFractionDigits: frac });
const fmtNum = (n) => Number(n || 0).toLocaleString();
const fmtMonth = (s) => {
  if (!s) return "";
  return new Date(s).toLocaleString(undefined, { month: "short", year: "2-digit" });
};
const fmtDate = (s) => {
  if (!s) return "";
  return new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" });
};
const fmtPct = (n, withSign = true) => {
  if (n == null || isNaN(n)) return "—";
  const x = Number(n);
  const sign = withSign && x > 0 ? "+" : "";
  return sign + x.toFixed(1) + "%";
};

function FloatingTooltip({ tip, T }) {
  if (!tip) return null;
  return (
    <div style={{
      position: "fixed", left: tip.x + 14, top: tip.y + 14,
      background: T.surface3 || T.surface, color: T.text,
      padding: "10px 12px", borderRadius: 8, fontSize: 11,
      boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
      pointerEvents: "none", zIndex: 9999,
      border: `1px solid ${T.border}`, maxWidth: 320, lineHeight: 1.45,
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

function Section({ T, title, subtitle, right, children, accent, count, sectionRef }) {
  return (
    <div ref={sectionRef} style={{
      background: T.surface, border: `1px solid ${T.border}`,
      borderRadius: 12, padding: 18, marginBottom: 14,
      boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
      scrollMarginTop: 88,
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {accent && <div style={{ width: 4, height: 16, background: accent, borderRadius: 2 }} />}
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text, letterSpacing: -0.2 }}>{title}</div>
            {count != null && (
              <span style={{ fontSize: 10, fontWeight: 700, color: accent, background: accent + "20", padding: "2px 8px", borderRadius: 10 }}>{count}</span>
            )}
          </div>
          {subtitle && <div style={{ fontSize: 11.5, color: T.text3, marginTop: 3, marginLeft: accent ? 12 : 0 }}>{subtitle}</div>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

function EmptyState({ T, message, icon = "✓", color }) {
  return (
    <div style={{ padding: 32, textAlign: "center", color: T.text3, fontSize: 12 }}>
      <div style={{ fontSize: 24, color: color || T.text3, marginBottom: 6 }}>{icon}</div>
      {message}
    </div>
  );
}

// ─── Clickable status card ──────────────────────────────────────────────
function StatusCard({ T, label, value, color, sub, icon, onClick }) {
  const interactive = typeof onClick === "function";
  return (
    <div
      onClick={onClick}
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onKeyDown={interactive ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      style={{
        flex: "1 1 0", minWidth: 175,
        background: T.surface, border: `1px solid ${T.border}`,
        borderLeft: `3px solid ${color}`,
        borderRadius: 10, padding: "12px 14px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
        cursor: interactive ? "pointer" : "default",
        transition: "transform 0.1s, box-shadow 0.1s, border-color 0.1s",
      }}
      onMouseEnter={interactive ? (e) => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.10)"; } : undefined}
      onMouseLeave={interactive ? (e) => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.06)"; } : undefined}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
        <div style={{ fontSize: 10, color: T.text3, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.6 }}>{label}</div>
        <span style={{ fontSize: 14, color }}>{icon}</span>
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color, fontFamily: '"SF Mono", Monaco, monospace', letterSpacing: -0.4 }}>{value}</div>
      {sub && (
        <div style={{ fontSize: 11, color: T.text3, marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
          {sub}
          {interactive && <span style={{ color, fontWeight: 700, marginLeft: 2 }}>→</span>}
        </div>
      )}
    </div>
  );
}

function RateAlertsTable({ data, T, setTip }) {
  if (!data || !data.length) return <EmptyState T={T} message="No material rate changes detected between latest and prior month" color="#10B981" />;
  return (
    <div style={{ fontSize: 11.5 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 90px 100px 100px 90px 100px", gap: 10, fontWeight: 700, color: T.text3, paddingBottom: 8, borderBottom: `1px solid ${T.border}`, fontSize: 9.5, textTransform: "uppercase", letterSpacing: 0.4 }}>
        <div>Description</div>
        <div style={{ textAlign: "right" }}>Prior rate</div>
        <div style={{ textAlign: "right" }}>Curr rate</div>
        <div style={{ textAlign: "right" }}>Δ%</div>
        <div style={{ textAlign: "right" }}>Curr qty</div>
        <div style={{ textAlign: "right" }}>$ impact</div>
      </div>
      {data.map((r, i) => {
        const isUp = Number(r.rate_delta_pct) > 0;
        const c = isUp ? "#EF4444" : "#10B981";
        return (
          <div key={i}
            onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, lines: [
              { value: r.description, bold: true, swatch: CAT_COLOR(r.category) },
              { label: "Category", value: r.category },
              { label: "Prior month", value: `${fmtNum(r.prior_month_qty)} × $${Number(r.prior_month_rate||0).toFixed(4)} = ${fmt$Full(r.prior_month_amount)}`, mono: true },
              { label: "This month", value: `${fmtNum(r.last_month_qty)} × $${Number(r.last_month_rate||0).toFixed(4)} = ${fmt$Full(r.last_month_amount)}`, mono: true },
              { label: "Rate Δ", value: fmtPct(r.rate_delta_pct), mono: true, swatch: c },
              { label: "Cost impact", value: (isUp?"+":"")+fmt$Full(r.impact), mono: true, swatch: c },
            ]})}
            onMouseLeave={() => setTip(null)}
            style={{ display: "grid", gridTemplateColumns: "1fr 90px 100px 100px 90px 100px", gap: 10, padding: "8px 0", borderBottom: `1px solid ${T.border}20`, alignItems: "center" }}>
            <div style={{ overflow: "hidden" }}>
              <div style={{ color: T.text2, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={r.description}>{r.description}</div>
              <div style={{ marginTop: 2 }}>
                <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: CAT_COLOR(r.category) + "30", color: CAT_COLOR(r.category), fontWeight: 600 }}>{r.category}</span>
              </div>
            </div>
            <div style={{ textAlign: "right", fontFamily: '"SF Mono", Monaco, monospace', color: T.text3 }}>${Number(r.prior_month_rate||0).toFixed(4)}</div>
            <div style={{ textAlign: "right", fontFamily: '"SF Mono", Monaco, monospace', fontWeight: 700 }}>${Number(r.last_month_rate||0).toFixed(4)}</div>
            <div style={{ textAlign: "right" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 2, padding: "2px 6px", borderRadius: 3, background: c + "20", color: c, fontWeight: 700, fontFamily: '"SF Mono", Monaco, monospace', fontSize: 11 }}>
                <span style={{ fontSize: 8 }}>{isUp?"▲":"▼"}</span>{fmtPct(Math.abs(r.rate_delta_pct), false)}
              </span>
            </div>
            <div style={{ textAlign: "right", fontFamily: '"SF Mono", Monaco, monospace', color: T.text3, fontSize: 10.5 }}>{fmtCompact(r.last_month_qty)}</div>
            <div style={{ textAlign: "right", fontFamily: '"SF Mono", Monaco, monospace', fontWeight: 700, color: c }}>{isUp?"+":""}{fmt$Full(r.impact)}</div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Uncategorized table — with per-row Apply / category override ───────
function UncategorizedTable({ data, T, setTip, totalOther, onRelabel, busyDescriptions }) {
  // Per-row category selection (defaults to suggested_category if present)
  const [picks, setPicks] = useState(() => {
    const p = {};
    (data || []).forEach(u => { if (u.suggested_category) p[u.description] = u.suggested_category; });
    return p;
  });

  if (!data || !data.length) return <EmptyState T={T} message="Nothing categorized as 'other' — all charges are properly categorized" color="#10B981" />;

  return (
    <div style={{ fontSize: 11.5 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 200px 100px 100px 90px 80px", gap: 10, fontWeight: 700, color: T.text3, paddingBottom: 8, borderBottom: `1px solid ${T.border}`, fontSize: 9.5, textTransform: "uppercase", letterSpacing: 0.4 }}>
        <div>Description</div>
        <div>Reassign to</div>
        <div style={{ textAlign: "right" }}>Amount</div>
        <div style={{ textAlign: "right" }}>Share of "other"</div>
        <div style={{ textAlign: "right" }}>Lines</div>
        <div style={{ textAlign: "right" }}>Action</div>
      </div>
      {data.map((u, i) => {
        const pct = totalOther > 0 ? (Number(u.total_amount) / totalOther) * 100 : 0;
        const suggested = u.suggested_category;
        const chosen = picks[u.description] || suggested || "";
        const busy = !!busyDescriptions?.[u.description];
        const canApply = !!chosen && chosen !== u.category && !busy;
        return (
          <div key={i}
            onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, lines: [
              { value: u.description, bold: true },
              { label: "Total", value: fmt$Full(u.total_amount), mono: true },
              { label: "Qty", value: fmtNum(u.total_qty), mono: true },
              { label: "Avg rate", value: "$"+Number(u.avg_rate||0).toFixed(4), mono: true },
              { label: "First seen", value: fmtDate(u.first_seen), mono: true },
              { label: "Last seen", value: fmtDate(u.last_seen), mono: true },
              suggested ? { label: "Suggested", value: suggested, swatch: CAT_COLOR(suggested) } : null,
            ].filter(Boolean) })}
            onMouseLeave={() => setTip(null)}
            style={{ display: "grid", gridTemplateColumns: "1fr 200px 100px 100px 90px 80px", gap: 10, padding: "10px 0", borderBottom: `1px solid ${T.border}20`, alignItems: "center", opacity: busy ? 0.5 : 1 }}>
            <div style={{ overflow: "hidden" }}>
              <div style={{ color: T.text2, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={u.description}>{u.description}</div>
              <div style={{ fontSize: 9.5, color: T.text3, marginTop: 1, fontFamily: '"SF Mono", Monaco, monospace' }}>{fmtDate(u.first_seen)} → {fmtDate(u.last_seen)}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: CAT_COLOR("other") + "25", color: CAT_COLOR("other"), fontWeight: 600, flexShrink: 0 }}>other</span>
              <span style={{ fontSize: 11, color: T.text3, flexShrink: 0 }}>→</span>
              <select
                value={chosen}
                disabled={busy}
                onChange={(e) => setPicks(p => ({ ...p, [u.description]: e.target.value }))}
                style={{
                  flex: 1, minWidth: 0,
                  padding: "4px 6px", fontSize: 11, fontWeight: 700,
                  borderRadius: 4, border: `1px solid ${chosen ? CAT_COLOR(chosen) : T.border}`,
                  background: chosen ? CAT_COLOR(chosen) + "20" : T.surface,
                  color: chosen ? CAT_COLOR(chosen) : T.text3,
                  cursor: busy ? "not-allowed" : "pointer",
                  outline: "none",
                  fontFamily: "inherit",
                }}
              >
                <option value="">— pick category —</option>
                {ALLOWED_CATEGORIES.filter(c => c !== "other").map(c => (
                  <option key={c} value={c}>{c}{c === suggested ? " (suggested)" : ""}</option>
                ))}
              </select>
            </div>
            <div style={{ textAlign: "right", fontFamily: '"SF Mono", Monaco, monospace', fontWeight: 700 }}>{fmt$Full(u.total_amount)}</div>
            <div style={{ textAlign: "right", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
              <span style={{ fontFamily: '"SF Mono", Monaco, monospace', fontSize: 10.5, color: T.text2 }}>{pct.toFixed(1)}%</span>
              <div style={{ width: 60, height: 4, background: T.surface2, borderRadius: 2, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${pct}%`, background: CAT_COLOR("other"), borderRadius: 2 }} />
              </div>
            </div>
            <div style={{ textAlign: "right", fontFamily: '"SF Mono", Monaco, monospace', color: T.text3 }}>{u.line_count}</div>
            <div style={{ textAlign: "right" }}>
              <button
                onClick={() => onRelabel(u.description, chosen)}
                disabled={!canApply}
                style={{
                  padding: "5px 12px", fontSize: 11, fontWeight: 700,
                  background: canApply ? CAT_COLOR(chosen) : T.surface2,
                  color: canApply ? "#fff" : T.text3,
                  border: "none", borderRadius: 5,
                  cursor: canApply ? "pointer" : "not-allowed",
                  transition: "opacity 0.1s",
                  letterSpacing: 0.3,
                }}
              >
                {busy ? "…" : "Apply"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CreditsTable({ data, T, setTip }) {
  if (!data || !data.length) return <EmptyState T={T} message="No credits or negative amounts on file" color="#10B981" />;
  return (
    <div style={{ fontSize: 11.5 }}>
      <div style={{ display: "grid", gridTemplateColumns: "100px 80px 1fr 90px 70px 90px 100px", gap: 10, fontWeight: 700, color: T.text3, paddingBottom: 8, borderBottom: `1px solid ${T.border}`, fontSize: 9.5, textTransform: "uppercase", letterSpacing: 0.4 }}>
        <div>Invoice</div><div>Period</div><div>Description</div><div>Category</div><div style={{ textAlign: "right" }}>Qty</div><div style={{ textAlign: "right" }}>Rate</div><div style={{ textAlign: "right" }}>Amount</div>
      </div>
      {data.map((c, i) => (
        <div key={i}
          onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, lines: [
            { value: c.description, bold: true, swatch: CAT_COLOR(c.category) },
            { label: "Invoice", value: c.invoice_number, mono: true },
            { label: "Period", value: fmtDate(c.period_end), mono: true },
            { label: "Warehouse", value: c.warehouse || "—" },
            { label: "Qty × Rate", value: `${fmtNum(c.qty)} × $${Number(c.rate||0).toFixed(4)}`, mono: true },
            { label: "Credit", value: fmt$Full(c.amount), mono: true, swatch: "#10B981" },
          ]})}
          onMouseLeave={() => setTip(null)}
          style={{ display: "grid", gridTemplateColumns: "100px 80px 1fr 90px 70px 90px 100px", gap: 10, padding: "6px 0", borderBottom: `1px solid ${T.border}20`, alignItems: "center", fontFamily: '"SF Mono", Monaco, monospace', fontSize: 10.5 }}>
          <div style={{ color: T.text3 }}>{(c.invoice_number || "").slice(0, 14)}</div>
          <div style={{ color: T.text3 }}>{fmtDate(c.period_end)}</div>
          <div style={{ fontFamily: "system-ui", color: T.text2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={c.description}>{c.description}</div>
          <div><span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: CAT_COLOR(c.category) + "30", color: CAT_COLOR(c.category), fontWeight: 600 }}>{c.category}</span></div>
          <div style={{ textAlign: "right", color: T.text3 }}>{fmtNum(c.qty)}</div>
          <div style={{ textAlign: "right", color: T.text3 }}>${Number(c.rate||0).toFixed(4)}</div>
          <div style={{ textAlign: "right", fontWeight: 700, color: "#10B981" }}>{fmt$Full(c.amount)}</div>
        </div>
      ))}
    </div>
  );
}

function ChangedChargesPanel({ T, newCharges, vanished, setTip }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
      <div>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: "#EF4444", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10 }}>▲</span> New this month <span style={{ color: T.text3, fontWeight: 500 }}>({(newCharges || []).length})</span>
        </div>
        {!newCharges || !newCharges.length ? <EmptyState T={T} message="No new charge types" icon="—" /> : (
          <div style={{ fontSize: 11 }}>
            {newCharges.map((c, i) => (
              <div key={i}
                onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, lines: [
                  { value: c.description, bold: true, swatch: CAT_COLOR(c.category) },
                  { label: "Category", value: c.category },
                  { label: "Qty", value: fmtNum(c.qty), mono: true },
                  { label: "Rate", value: c.rate ? "$"+Number(c.rate).toFixed(4) : "—", mono: true },
                  { label: "Amount", value: fmt$Full(c.amount), mono: true },
                  { label: "First seen", value: fmtDate(c.first_month), mono: true },
                ]})}
                onMouseLeave={() => setTip(null)}
                style={{ display: "grid", gridTemplateColumns: "1fr 80px", gap: 8, padding: "6px 0", borderBottom: `1px solid ${T.border}20`, alignItems: "center" }}>
                <div style={{ overflow: "hidden" }}>
                  <div style={{ color: T.text2, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={c.description}>{c.description}</div>
                  <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: CAT_COLOR(c.category) + "30", color: CAT_COLOR(c.category), fontWeight: 600 }}>{c.category}</span>
                </div>
                <div style={{ textAlign: "right", fontFamily: '"SF Mono", Monaco, monospace', fontWeight: 700, color: "#EF4444" }}>{fmt$Full(c.amount)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <div style={{ fontSize: 11.5, fontWeight: 700, color: "#10B981", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 10 }}>▼</span> Vanished from this month <span style={{ color: T.text3, fontWeight: 500 }}>({(vanished || []).length})</span>
        </div>
        {!vanished || !vanished.length ? <EmptyState T={T} message="No charges disappeared" icon="—" /> : (
          <div style={{ fontSize: 11 }}>
            {vanished.map((c, i) => (
              <div key={i}
                onMouseMove={(e) => setTip({ x: e.clientX, y: e.clientY, lines: [
                  { value: c.description, bold: true, swatch: CAT_COLOR(c.category) },
                  { label: "Category", value: c.category },
                  { label: "Prior month qty", value: fmtNum(c.prior_qty), mono: true },
                  { label: "Prior month rate", value: c.prior_rate ? "$"+Number(c.prior_rate).toFixed(4) : "—", mono: true },
                  { label: "Prior month amount", value: fmt$Full(c.prior_amount), mono: true },
                  { label: "Last seen", value: fmtDate(c.last_seen), mono: true },
                ]})}
                onMouseLeave={() => setTip(null)}
                style={{ display: "grid", gridTemplateColumns: "1fr 80px", gap: 8, padding: "6px 0", borderBottom: `1px solid ${T.border}20`, alignItems: "center" }}>
                <div style={{ overflow: "hidden" }}>
                  <div style={{ color: T.text2, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={c.description}>{c.description}</div>
                  <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: CAT_COLOR(c.category) + "30", color: CAT_COLOR(c.category), fontWeight: 600 }}>{c.category}</span>
                </div>
                <div style={{ textAlign: "right", fontFamily: '"SF Mono", Monaco, monospace', fontWeight: 700, color: "#10B981" }}>{fmt$Full(c.prior_amount)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function OutlierShipmentsTable({ data, T, setTip }) {
  if (!data || !data.length) return <EmptyState T={T} message="No outlier shipments found above $30" />;
  return (
    <div style={{ overflowX: "auto", fontSize: 11 }}>
      <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
        <thead>
          <tr style={{ background: T.surface2 }}>
            {["Date", "Order #", "Carrier", "Service", "Zone", "Weight", "Region", "Freight", "Fuel", "Surcharges", "Total"].map((h, i) => (
              <th key={h} style={{ padding: "8px 10px", textAlign: i >= 7 ? "right" : "left", fontSize: 9.5, color: T.text3, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, borderBottom: `2px solid ${T.border}`, whiteSpace: "nowrap" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((s, i) => (
            <tr key={i}
              onMouseEnter={(e) => e.currentTarget.style.background = T.surface2 + "80"}
              onMouseLeave={(e) => e.currentTarget.style.background = "transparent"}
              style={{ borderBottom: `1px solid ${T.border}20`, transition: "background 0.1s" }}>
              <td style={{ padding: "6px 10px", color: T.text3, fontFamily: '"SF Mono", Monaco, monospace', whiteSpace: "nowrap" }}>{fmtDate(s.shipment_date)}</td>
              <td style={{ padding: "6px 10px", fontFamily: '"SF Mono", Monaco, monospace', color: T.text2, fontWeight: 600 }}>{s.external_order_no || "—"}</td>
              <td style={{ padding: "6px 10px", color: T.text3 }}>{s.carrier || "—"}</td>
              <td style={{ padding: "6px 10px", color: T.text2 }}>{s.service_level || "—"}</td>
              <td style={{ padding: "6px 10px", color: T.text3, fontFamily: '"SF Mono", Monaco, monospace', textAlign: "center" }}>{s.zone || "—"}</td>
              <td style={{ padding: "6px 10px", color: T.text3, fontFamily: '"SF Mono", Monaco, monospace' }}>{s.weight_kg ? Number(s.weight_kg).toFixed(2) + "kg" : "—"}</td>
              <td style={{ padding: "6px 10px", color: T.text3 }}>{s.recipient_region || s.recipient_country || "—"}</td>
              <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: '"SF Mono", Monaco, monospace' }}>{fmt$Full(s.freight_cost)}</td>
              <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: '"SF Mono", Monaco, monospace', color: T.text3 }}>{s.fuel_surcharge > 0 ? fmt$Full(s.fuel_surcharge) : "—"}</td>
              <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: '"SF Mono", Monaco, monospace', color: T.text3 }}>{s.other_surcharges > 0 ? fmt$Full(s.other_surcharges) : "—"}</td>
              <td style={{ padding: "6px 10px", textAlign: "right", fontFamily: '"SF Mono", Monaco, monospace', fontWeight: 700 }}>{fmt$Full(s.total_cost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MiniRateChart({ history, T, color = "#3B82F6" }) {
  if (!history || history.length < 2) return null;
  const W = 600, H = 180, padL = 60, padR = 16, padT = 14, padB = 30;
  const iW = W - padL - padR, iH = H - padT - padB;
  const rates = history.map(h => Number(h.rate || 0));
  const max = Math.max(...rates, 0.001) * 1.1;
  const min = Math.min(...rates, 0);
  const x = (i) => padL + (history.length === 1 ? iW/2 : (i / (history.length - 1)) * iW);
  const y = (v) => padT + iH - ((v - min) / (max - min || 1)) * iH;
  const linePath = history.map((h, i) => `${i===0?"M":"L"} ${x(i).toFixed(1)} ${y(Number(h.rate||0)).toFixed(1)}`).join(" ");
  const areaPath = `${linePath} L ${x(history.length-1).toFixed(1)} ${padT+iH} L ${padL} ${padT+iH} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H, display: "block" }}>
      <defs>
        <linearGradient id="mini-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {[0, 0.25, 0.5, 0.75, 1].map((p, i) => (
        <g key={i}>
          <line x1={padL} y1={padT + iH * (1-p)} x2={W-padR} y2={padT + iH * (1-p)} stroke={T.border} strokeDasharray={i===0?"none":"2,4"} strokeWidth={i===0?1:0.5} opacity={i===0?1:0.5} />
          <text x={padL-8} y={padT + iH * (1-p) + 3} fontSize={9} fill={T.text3} textAnchor="end">${(min + (max-min)*p).toFixed(4)}</text>
        </g>
      ))}
      <path d={areaPath} fill="url(#mini-grad)" />
      <path d={linePath} fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
      {history.map((h, i) => (
        <g key={i}>
          <circle cx={x(i)} cy={y(Number(h.rate||0))} r={3.5} fill={color} stroke={T.surface} strokeWidth={1.5} />
          <text x={x(i)} y={H-12} fontSize={9.5} fill={T.text3} textAnchor="middle">{fmtMonth(h.month)}</text>
        </g>
      ))}
    </svg>
  );
}

function RateHistoryExplorer({ data, T }) {
  const [selected, setSelected] = useState(data && data[0] ? data[0].description : null);
  const current = useMemo(() => data?.find(d => d.description === selected), [data, selected]);
  if (!data || !data.length) return <EmptyState T={T} message="No rate history available" />;
  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "0 0 260px", maxHeight: 360, overflowY: "auto", border: `1px solid ${T.border}`, borderRadius: 8, padding: 4 }}>
          {data.map((d, i) => (
            <div key={i} onClick={() => setSelected(d.description)}
              style={{
                padding: "7px 10px", fontSize: 11.5, cursor: "pointer", borderRadius: 4,
                background: selected === d.description ? CAT_COLOR(d.category) + "25" : "transparent",
                color: selected === d.description ? CAT_COLOR(d.category) : T.text2,
                fontWeight: selected === d.description ? 700 : 500,
                marginBottom: 2,
              }}>
              <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={d.description}>{d.description}</div>
              <div style={{ fontSize: 9.5, color: T.text3, marginTop: 2, fontFamily: '"SF Mono", Monaco, monospace' }}>{fmt$Full(d.total_amount)}</div>
            </div>
          ))}
        </div>
        <div style={{ flex: 1, minWidth: 380 }}>
          {current && (
            <>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{current.description}</div>
                <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 3, background: CAT_COLOR(current.category) + "30", color: CAT_COLOR(current.category), fontWeight: 700 }}>{current.category}</span>
                  <span style={{ fontSize: 11, color: T.text3 }}>{current.line_count} lines · {fmt$Full(current.total_amount)} total</span>
                </div>
              </div>
              <MiniRateChart history={current.history} T={T} color={CAT_COLOR(current.category)} />
              <div style={{ marginTop: 14, fontSize: 11 }}>
                <div style={{ display: "grid", gridTemplateColumns: "80px 100px 100px 110px", gap: 10, fontWeight: 700, color: T.text3, paddingBottom: 6, borderBottom: `1px solid ${T.border}`, fontSize: 9.5, textTransform: "uppercase", letterSpacing: 0.4 }}>
                  <div>Month</div><div style={{ textAlign: "right" }}>Qty</div><div style={{ textAlign: "right" }}>Amount</div><div style={{ textAlign: "right" }}>Effective rate</div>
                </div>
                {(current.history || []).map((h, i) => {
                  const prev = i > 0 ? current.history[i-1] : null;
                  const rateChange = prev && Number(prev.rate) > 0 ? ((Number(h.rate) - Number(prev.rate)) / Number(prev.rate)) * 100 : null;
                  const rc = rateChange == null ? null : (rateChange > 0 ? "#EF4444" : "#10B981");
                  return (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "80px 100px 100px 110px", gap: 10, padding: "5px 0", fontFamily: '"SF Mono", Monaco, monospace', fontSize: 10.5, alignItems: "center" }}>
                      <div style={{ color: T.text2, fontWeight: 600 }}>{fmtMonth(h.month)}</div>
                      <div style={{ textAlign: "right", color: T.text3 }}>{fmtNum(h.qty)}</div>
                      <div style={{ textAlign: "right" }}>{fmt$Full(h.amount)}</div>
                      <div style={{ textAlign: "right", display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 6 }}>
                        <span style={{ fontWeight: 700 }}>${Number(h.rate||0).toFixed(4)}</span>
                        {rc && Math.abs(rateChange) >= 1 && (
                          <span style={{ fontSize: 9, color: rc, fontWeight: 700 }}>{rateChange > 0 ? "▲" : "▼"}{Math.abs(rateChange).toFixed(0)}%</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ReconciliationTable({ data, T, summary }) {
  const [showAll, setShowAll] = useState(false);
  if (!data || !data.length) return <EmptyState T={T} message="No invoices in scope" />;
  const visible = showAll ? data : data.filter(r => r.status === "discrepancy").concat(data.filter(r => r.status === "ok").slice(0, 10));
  return (
    <div>
      <div style={{ marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontSize: 12, color: T.text2 }}>
          {summary?.discrepancy_count > 0 ? (
            <span style={{ color: "#EF4444", fontWeight: 700 }}>⚠ {summary.discrepancy_count} invoice{summary.discrepancy_count !== 1 ? "s" : ""} with discrepancies totaling {fmt$Full(summary.discrepancy_total_abs)}</span>
          ) : (
            <span style={{ color: "#10B981", fontWeight: 700 }}>✓ All {data.length} invoices reconcile (line sums match invoice totals)</span>
          )}
        </div>
        <button onClick={() => setShowAll(s => !s)} style={{ padding: "4px 10px", fontSize: 10.5, fontWeight: 600, background: "transparent", color: T.text2, border: `1px solid ${T.border}`, borderRadius: 14, cursor: "pointer" }}>
          {showAll ? "Show flagged only" : "Show all"}
        </button>
      </div>
      <div style={{ overflowX: "auto", fontSize: 11 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}>
          <thead>
            <tr style={{ background: T.surface2 }}>
              {["Invoice", "Period", "WH", "Source", "Total", "Lines sum", "Diff", "Δ %", "# Lines", "Status"].map((h, i) => (
                <th key={h} style={{ padding: "8px 10px", textAlign: i >= 4 && i <= 7 ? "right" : "left", fontSize: 9.5, color: T.text3, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, borderBottom: `2px solid ${T.border}`, whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => {
              const isDiscrepancy = r.status === "discrepancy";
              return (
                <tr key={i} style={{ borderBottom: `1px solid ${T.border}20` }}>
                  <td style={{ padding: "5px 10px", fontFamily: '"SF Mono", Monaco, monospace', color: T.text2, fontWeight: 600 }}>{r.invoice_number}</td>
                  <td style={{ padding: "5px 10px", color: T.text3, fontFamily: '"SF Mono", Monaco, monospace' }}>{fmtDate(r.period_end)}</td>
                  <td style={{ padding: "5px 10px", fontWeight: 600 }}>{r.warehouse || "—"}</td>
                  <td style={{ padding: "5px 10px", fontSize: 10, color: T.text3 }}>{r.source}</td>
                  <td style={{ padding: "5px 10px", textAlign: "right", fontFamily: '"SF Mono", Monaco, monospace', fontWeight: 600 }}>{fmt$Full(r.invoice_total)}</td>
                  <td style={{ padding: "5px 10px", textAlign: "right", fontFamily: '"SF Mono", Monaco, monospace', color: T.text3 }}>{fmt$Full(r.lines_sum)}</td>
                  <td style={{ padding: "5px 10px", textAlign: "right", fontFamily: '"SF Mono", Monaco, monospace', fontWeight: isDiscrepancy ? 700 : 400, color: isDiscrepancy ? "#EF4444" : T.text3 }}>{Math.abs(r.diff_abs) < 0.01 ? "—" : fmt$Full(r.diff_abs, 2)}</td>
                  <td style={{ padding: "5px 10px", textAlign: "right", fontFamily: '"SF Mono", Monaco, monospace', color: isDiscrepancy ? "#EF4444" : T.text3 }}>{r.diff_pct != null && Math.abs(r.diff_pct) >= 0.01 ? fmtPct(r.diff_pct) : "—"}</td>
                  <td style={{ padding: "5px 10px", textAlign: "right", fontFamily: '"SF Mono", Monaco, monospace', color: T.text3 }}>{r.line_count}</td>
                  <td style={{ padding: "5px 10px" }}>
                    {isDiscrepancy ? (
                      <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 3, background: "#EF444425", color: "#EF4444", fontWeight: 700 }}>✗ DIFF</span>
                    ) : (
                      <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 3, background: "#10B98125", color: "#10B981", fontWeight: 700 }}>✓ OK</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Main component
// ════════════════════════════════════════════════════════════════════════

export default function ThreePLBillingAudit({ goBack }) {
  const { tokens: T } = useTheme();
  const { orgId } = useAuth();
  const [audit, setAudit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [tip, setTip] = useState(null);
  const [busyDescriptions, setBusyDescriptions] = useState({});
  const [toast, setToast] = useState(null);

  // Section refs for status-card scroll-to
  const refRateAlerts = useRef(null);
  const refUncategorized = useRef(null);
  const refCredits = useRef(null);
  const refReconciliation = useRef(null);

  const scrollTo = useCallback((ref) => {
    if (ref?.current) ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const fetchAudit = useCallback(async () => {
    if (!orgId) return;
    setLoading(true); setErr(null);
    try {
      const { data, error } = await supabase.rpc("wms_3pl_billing_audit", { p_org_id: orgId });
      if (error) throw error;
      setAudit(data);
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => { fetchAudit(); }, [fetchAudit]);

  const handleRelabel = useCallback(async (description, targetCategory) => {
    if (!orgId || !description || !targetCategory) return;
    setBusyDescriptions(b => ({ ...b, [description]: true }));
    try {
      const { data, error } = await supabase.rpc("wms_3pl_relabel_description", {
        p_org_id: orgId,
        p_description: description,
        p_target_category: targetCategory,
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setToast({
        kind: "success",
        msg: `Reassigned "${description}" → ${targetCategory}: ${data.rows_updated} line${data.rows_updated === 1 ? "" : "s"} updated, ${fmt$Full(data.amount_moved)} moved out of "other"`,
      });
      await fetchAudit();
    } catch (e) {
      setToast({ kind: "error", msg: e.message || String(e) });
    } finally {
      setBusyDescriptions(b => { const c = { ...b }; delete c[description]; return c; });
      setTimeout(() => setToast(null), 6000);
    }
  }, [orgId, fetchAudit]);

  if (!orgId) return <div style={{ padding: 30, color: T.text3 }}>Loading…</div>;

  const summary = audit?.summary;
  const reconCount = summary?.discrepancy_count || 0;
  const alertCount = (audit?.rate_alerts || []).length;
  const otherTotal = Number(summary?.other_category_total || 0);
  const totalSpend = Number(summary?.total_spend || 0);
  const otherPct = totalSpend > 0 ? (otherTotal / totalSpend) * 100 : 0;
  const creditCount = Number(summary?.credits_count || 0);
  const creditTotal = Number(summary?.credits_total || 0);
  const uncategorizedCount = (audit?.uncategorized || []).length;

  return (
    <div style={{ position: "relative" }}>
      <FloatingTooltip tip={tip} T={T} />

      {toast && (
        <div style={{
          position: "fixed", top: 16, right: 16, zIndex: 10000,
          background: toast.kind === "success" ? "#10B981" : "#EF4444",
          color: "#fff", padding: "10px 16px", borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,0.3)", fontSize: 12, fontWeight: 600,
          maxWidth: 500,
        }}>
          {toast.kind === "success" ? "✓ " : "✗ "}{toast.msg}
        </div>
      )}

      <div style={{
        position: "sticky", top: 0, zIndex: 50,
        background: T.bg, padding: "8px 0 12px 0", marginBottom: 12,
        borderBottom: `1px solid ${T.border}`,
      }}>
        <div style={{
          background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12,
          padding: "12px 16px", display: "flex", alignItems: "center", gap: 12,
          boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Billing Audit</div>
            <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>
              {audit ? `Scrutinizing ${summary.total_invoices} invoices · ${summary.total_lines} lines · ${summary.total_descriptions} distinct charges` : "Loading…"}
            </div>
          </div>
          <button onClick={fetchAudit} disabled={loading}
            style={{ padding: "5px 10px", fontSize: 11, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 14, color: T.text2, cursor: "pointer", opacity: loading ? 0.5 : 1, fontWeight: 600 }}>
            {loading ? "Loading…" : "↻ Refresh"}
          </button>
        </div>
      </div>

      {err && (
        <div style={{ padding: 14, background: "#EF444415", border: "1px solid #EF4444", borderRadius: 8, color: "#EF4444", fontSize: 12, marginBottom: 14 }}>
          ⚠ {err}
        </div>
      )}

      {loading && !audit && (
        <div style={{ padding: 80, textAlign: "center", color: T.text3, fontSize: 12 }}>Loading audit…</div>
      )}

      {audit && (
        <>
          {/* ═══ STATUS BANNER (now clickable) ═══ */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 20 }}>
            <StatusCard T={T}
              label="Reconciliation"
              value={reconCount === 0 ? "Clean" : `${reconCount} flagged`}
              color={reconCount === 0 ? "#10B981" : "#EF4444"}
              sub={reconCount === 0 ? `${summary.total_invoices} invoices · sums match totals` : "review discrepancies"}
              icon={reconCount === 0 ? "✓" : "⚠"}
              onClick={() => scrollTo(refReconciliation)} />
            <StatusCard T={T}
              label="Rate alerts"
              value={alertCount.toString()}
              color={alertCount === 0 ? "#10B981" : "#F59E0B"}
              sub={alertCount === 0 ? "no notable rate changes" : "review rate movements"}
              icon={alertCount === 0 ? "✓" : "⚠"}
              onClick={alertCount > 0 ? () => scrollTo(refRateAlerts) : undefined} />
            <StatusCard T={T}
              label="Uncategorized"
              value={fmt$(otherTotal)}
              color={otherPct > 20 ? "#EF4444" : otherPct > 5 ? "#F59E0B" : "#10B981"}
              sub={`${otherPct.toFixed(1)}% of total spend`}
              icon={otherPct > 5 ? "⚠" : "✓"}
              onClick={uncategorizedCount > 0 ? () => scrollTo(refUncategorized) : undefined} />
            <StatusCard T={T}
              label="Credits"
              value={creditCount > 0 ? fmt$(creditTotal) : "—"}
              color={creditCount > 0 ? "#3B82F6" : T.text3}
              sub={creditCount > 0 ? `${creditCount} negative-amount lines` : "none"}
              icon={creditCount > 0 ? "↶" : "—"}
              onClick={creditCount > 0 ? () => scrollTo(refCredits) : undefined} />
          </div>

          {/* ═══ RATE ALERTS ═══ */}
          {alertCount > 0 && (
            <Section T={T} accent="#EF4444" sectionRef={refRateAlerts}
              title="Rate alerts"
              count={alertCount}
              subtitle={`Charge descriptions where the effective unit rate moved ≥5% or ≥$500 impact between ${fmtMonth(summary.prior_month)} and ${fmtMonth(summary.last_month)}`}>
              <RateAlertsTable data={audit.rate_alerts} T={T} setTip={setTip} />
            </Section>
          )}

          {/* ═══ UNCATEGORIZED ═══ */}
          {uncategorizedCount > 0 && (
            <Section T={T} accent="#F59E0B" sectionRef={refUncategorized}
              title="Uncategorized charges"
              count={uncategorizedCount}
              subtitle={`${fmt$Full(otherTotal)} (${otherPct.toFixed(1)}% of total spend) currently in the "other" bucket — pick a category and click Apply to reassign all matching lines`}>
              <UncategorizedTable
                data={audit.uncategorized}
                T={T} setTip={setTip}
                totalOther={otherTotal}
                onRelabel={handleRelabel}
                busyDescriptions={busyDescriptions} />
            </Section>
          )}

          {/* ═══ CHANGED CHARGES ═══ */}
          {((audit.new_charges || []).length > 0 || (audit.vanished_charges || []).length > 0) && (
            <Section T={T} accent="#A855F7"
              title="Charge type changes"
              subtitle={`Charge descriptions that appeared or disappeared between ${fmtMonth(summary.prior_month)} and ${fmtMonth(summary.last_month)}`}>
              <ChangedChargesPanel T={T} newCharges={audit.new_charges} vanished={audit.vanished_charges} setTip={setTip} />
            </Section>
          )}

          {/* ═══ CREDITS ═══ */}
          {creditCount > 0 && (
            <Section T={T} accent="#10B981" sectionRef={refCredits}
              title="Credits & negative lines"
              count={creditCount}
              subtitle={`${creditCount} lines with negative amounts totaling ${fmt$Full(Math.abs(creditTotal))} — refunds, voids, adjustments`}>
              <CreditsTable data={audit.credits} T={T} setTip={setTip} />
            </Section>
          )}

          {/* ═══ OUTLIER SHIPMENTS ═══ */}
          {(audit.outlier_shipments || []).length > 0 && (
            <Section T={T} accent="#06B6D4"
              title="Outlier shipments"
              count={audit.outlier_shipments.length}
              subtitle="Most expensive single parcels — useful for spotting surcharge-heavy shipments and dimensional weight surprises">
              <OutlierShipmentsTable data={audit.outlier_shipments} T={T} setTip={setTip} />
            </Section>
          )}

          {/* ═══ RATE HISTORY EXPLORER ═══ */}
          {(audit.rate_history || []).length > 0 && (
            <Section T={T} accent="#3B82F6"
              title="Rate history explorer"
              subtitle="Select any charge description to see the effective unit rate over time — flags rate creep, mid-period contract changes, or seasonal variation">
              <RateHistoryExplorer data={audit.rate_history} T={T} />
            </Section>
          )}

          {/* ═══ RECONCILIATION ═══ */}
          <Section T={T} accent={reconCount === 0 ? "#10B981" : "#EF4444"} sectionRef={refReconciliation}
            title="Reconciliation"
            subtitle="Invoice totals vs sum of line items — flags any invoice where the breakdown doesn't add up">
            <ReconciliationTable data={audit.reconciliation} T={T} summary={summary} />
          </Section>

          <div style={{ fontSize: 10, color: T.text3, textAlign: "right", marginTop: 16, paddingBottom: 20 }}>
            Generated {audit.generated_at ? new Date(audit.generated_at).toLocaleString() : ""}
          </div>
        </>
      )}
    </div>
  );
}
