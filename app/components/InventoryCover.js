"use client";
// Demand Planning > Inventory Cover: the Daily Units forecast run per stock
// item and region, set against stock on hand (Stord + Cin7) and open Cin7
// purchase orders. Shows days of cover, projected stockout, reorder-by date
// and a suggested order quantity, with a projected-stock chart per item.
// Sales SKUs map to stock items through Cin7 kits, marketplace suffixes and
// manual mappings (edited at the bottom of this view).
import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";
import { forecast, addDays, MODEL_LABELS } from "../lib/forecast";
import { planItem, poArrival, STATUS } from "../lib/cover";

const HISTORY_DAYS = 548;   // 18 months: enough for the last-year model and its backtest
const HORIZON = 400;
const CHART_DAYS = 180;
const REGIONS = ["US", "UK", "CA", "AU"];
const LS_KEY = "helm.dp.cover.v1";

// Local calendar date (the stock snapshots are dated in US time, sales by order date).
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const sum = (a) => a.reduce((s, x) => s + (x || 0), 0);
const fmtN = (n) => {
  if (n == null || !isFinite(n)) return "-";
  const v = Number(n), a = Math.abs(v);
  return a >= 1e6 ? `${(v / 1e6).toFixed(2)}M` : a >= 1e4 ? `${(v / 1e3).toFixed(1)}k` : Math.round(v).toLocaleString();
};
const fmtDate = (iso) => (iso ? new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric", timeZone: "UTC" }) : "-");
const fmtDateY = (iso) => (iso ? new Date(iso + "T00:00:00Z").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "-");
const daysLabel = (d, H) => (d == null ? `>${H}` : String(d));
const loadPrefs = () => { try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); } catch { return {}; } };
const savePrefs = (p) => { try { localStorage.setItem(LS_KEY, JSON.stringify(p)); } catch { /* private mode */ } };

const toneColor = (tone) => ({ critical: T.red, serious: T.orange, warning: T.yellow, good: T.green, info: T.accent, muted: T.text3 }[tone] || T.text3);

function StatusBadge({ status }) {
  const s = STATUS[status];
  const c = toneColor(s.tone);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 700, color: c, background: c + "18", border: `1px solid ${c}40`, whiteSpace: "nowrap" }}>
      <span aria-hidden>{s.icon}</span>{s.label}
    </span>
  );
}

function Field({ label, children }) {
  return <div style={{ display: "flex", flexDirection: "column", gap: 4 }}><span style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</span>{children}</div>;
}

function Seg({ options, value, onChange }) {
  return (
    <div style={{ display: "inline-flex", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 7, overflow: "hidden" }}>
      {options.map(([k, l]) => (
        <button key={k} onClick={() => onChange(k)}
          style={{ padding: "5px 10px", fontSize: 11.5, fontWeight: 600, border: "none", cursor: "pointer", background: value === k ? T.accent : "transparent", color: value === k ? "#fff" : T.text2 }}>{l}</button>
      ))}
    </div>
  );
}

function NumIn({ value, onChange, suffix, min = 0, max = 730 }) {
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
      <input type="number" value={value} min={min} max={max}
        onChange={(e) => { const v = Math.round(Number(e.target.value)); if (isFinite(v)) onChange(Math.min(max, Math.max(min, v))); }}
        style={{ width: 62, padding: "5px 6px", fontSize: 12, borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontVariantNumeric: "tabular-nums" }} />
      {suffix && <span style={{ fontSize: 11, color: T.text3 }}>{suffix}</span>}
    </div>
  );
}

function Tile({ label, value, sub, tone }) {
  return (
    <div style={{ flex: "1 1 170px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 14px", minWidth: 0 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.05em" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: tone ? toneColor(tone) : T.text, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 11.5, color: T.text2, marginTop: 2 }}>{sub}</div>
    </div>
  );
}

// ── Projected stock chart ────────────────────────────────────────────────────
function StockChart({ row, days = CHART_DAYS, height = 240 }) {
  const wrap = useRef(null);
  const [w, setW] = useState(800);
  const [hover, setHover] = useState(null);
  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(320, Math.floor(e.contentRect.width))));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);
  const p = row.plan, n = Math.min(days, p.proj.length);
  const proj = p.proj.slice(0, n), noPo = p.projNoPo.slice(0, n);
  const pad = { l: 56, r: 16, t: 14, b: 26 };
  const iw = w - pad.l - pad.r, ih = height - pad.t - pad.b;
  const yMax = Math.max(1, row.stock, ...proj, p.safety) * 1.08;
  const yMin = Math.min(0, ...proj, ...noPo);
  const x = (i) => pad.l + (i / Math.max(1, n - 1)) * iw;
  const y = (v) => pad.t + ih - ((v - yMin) / (yMax - yMin)) * ih;
  const path = (vals) => vals.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const ticks = Array.from({ length: 5 }, (_, i) => yMin + ((yMax - yMin) / 4) * i);
  const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 80))));
  const arrivals = row.pos.filter((po) => po.counted && po.idx < n);
  const onMove = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left - pad.l) / iw) * (n - 1));
    setHover(i >= 0 && i < n ? i : null);
  };
  const lineColor = T.accent, noPoColor = T.text3;
  return (
    <div ref={wrap} style={{ position: "relative", width: "100%" }}>
      <svg width={w} height={height} onMouseMove={onMove} onMouseLeave={() => setHover(null)} style={{ display: "block" }}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke={T.border} opacity={0.6} />
            <text x={pad.l - 8} y={y(t) + 3.5} textAnchor="end" fontSize={10.5} fill={T.text3}>{fmtN(t)}</text>
          </g>
        ))}
        {Array.from({ length: n }, (_, i) => (i % every === 0 ? <text key={i} x={x(i)} y={height - 8} textAnchor="middle" fontSize={10.5} fill={T.text3}>{fmtDate(addDays(row.today, i))}</text> : null))}
        {yMin < 0 && <rect x={pad.l} y={y(0)} width={iw} height={Math.max(0, y(yMin) - y(0))} fill={T.red} opacity={0.06} />}
        <line x1={pad.l} x2={w - pad.r} y1={y(0)} y2={y(0)} stroke={T.text3} strokeWidth={1} />
        {p.safety > 0 && (
          <g>
            <line x1={pad.l} x2={w - pad.r} y1={y(p.safety)} y2={y(p.safety)} stroke={T.yellow} strokeDasharray="4 4" strokeWidth={1.5} />
            <text x={w - pad.r - 4} y={y(p.safety) - 4} textAnchor="end" fontSize={10.5} fill={T.text2}>Safety stock</text>
          </g>
        )}
        {p.reorderDays != null && p.reorderDays >= 0 && p.reorderDays < n && (
          <g>
            <line x1={x(p.reorderDays)} x2={x(p.reorderDays)} y1={pad.t} y2={pad.t + ih} stroke={T.orange} strokeWidth={1.5} />
            <text x={x(p.reorderDays) + 4} y={pad.t + 10} fontSize={10.5} fill={T.text2}>Reorder by {fmtDate(p.reorderDate)}</text>
          </g>
        )}
        <path d={path(noPo)} fill="none" stroke={noPoColor} strokeWidth={1.5} strokeDasharray="5 4" />
        <path d={path(proj)} fill="none" stroke={lineColor} strokeWidth={2} strokeLinejoin="round" />
        {arrivals.map((po, k) => (
          <g key={k}>
            <circle cx={x(po.idx)} cy={y(proj[po.idx])} r={5} fill={T.green} stroke={T.surface} strokeWidth={2} />
          </g>
        ))}
        {hover != null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke={T.text3} />
            <circle cx={x(hover)} cy={y(proj[hover])} r={4} fill={lineColor} stroke={T.surface} strokeWidth={2} />
          </g>
        )}
      </svg>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 11, color: T.text2, marginTop: 4 }}>
        <span><span style={{ display: "inline-block", width: 14, height: 2, background: lineColor, verticalAlign: "middle", marginRight: 5 }} />Projected stock with open POs</span>
        <span><span style={{ display: "inline-block", width: 14, borderTop: `2px dashed ${noPoColor}`, verticalAlign: "middle", marginRight: 5 }} />Without POs</span>
        <span><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: T.green, verticalAlign: "middle", marginRight: 5 }} />PO arrival</span>
      </div>
      {hover != null && (() => {
        const d = addDays(row.today, hover);
        const arr = arrivals.filter((po) => po.idx === hover);
        const left = x(hover) > w * 0.6 ? x(hover) - 230 : x(hover) + 14;
        return (
          <div style={{ position: "absolute", top: 8, left, width: 216, pointerEvents: "none", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 10px", boxShadow: "0 6px 18px rgba(0,0,0,0.12)", fontSize: 11.5, zIndex: 2, color: T.text2, lineHeight: 1.6 }}>
            <div style={{ fontWeight: 700, color: T.text }}>{fmtDateY(d)}</div>
            <div>Projected stock <b style={{ color: T.text }}>{fmtN(proj[hover])}</b></div>
            <div>Without POs <b style={{ color: T.text }}>{fmtN(noPo[hover])}</b></div>
            <div>Forecast that day <b style={{ color: T.text }}>{fmtN(row.demand[hover])}</b></div>
            {arr.map((po, k) => <div key={k} style={{ color: T.green }}>+{fmtN(po.qty_open)} {po.order_number}</div>)}
          </div>
        );
      })()}
    </div>
  );
}

// ── Main view ────────────────────────────────────────────────────────────────
export default function InventoryCoverView({ isMobile }) {
  const prefs0 = useMemo(loadPrefs, []);
  const [leadDays, setLeadDays] = useState(prefs0.leadDays ?? 45);
  const [safetyDays, setSafetyDays] = useState(prefs0.safetyDays ?? 14);
  const [targetDays, setTargetDays] = useState(prefs0.targetDays ?? 60);
  const [includeAmazon, setIncludeAmazon] = useState(prefs0.includeAmazon ?? true);
  const [countStale, setCountStale] = useState(prefs0.countStale ?? false);
  const [basis, setBasis] = useState(prefs0.basis || "available");
  const [locOverride, setLocOverride] = useState(prefs0.locOverride || {});
  const [region, setRegion] = useState(prefs0.region || "all");
  const [statusFilter, setStatusFilter] = useState("active");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ key: "status", dir: 1 });
  const [open, setOpen] = useState(null);
  const [showLocs, setShowLocs] = useState(false);

  const [demand, setDemand] = useState(null);
  const [stock, setStock] = useState([]);
  const [pos, setPos] = useState([]);
  const [items, setItems] = useState([]);
  const [unmapped, setUnmapped] = useState([]);
  const [maps, setMaps] = useState([]);
  const [aliases, setAliases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [range] = useState(() => { const t = today(); return { from: addDays(t, -HISTORY_DAYS), to: addDays(t, -1), today: t }; });
  const lastReq = useRef(0);

  useEffect(() => { savePrefs({ leadDays, safetyDays, targetDays, includeAmazon, countStale, locOverride, region, basis }); }, [leadDays, safetyDays, targetDays, includeAmazon, countStale, locOverride, region, basis]);

  const loadDemand = useCallback(async () => {
    const req = ++lastReq.current;
    const { data, error: e } = await supabase.rpc("dp_item_demand", { p_from: range.from, p_to: range.to, p_channels: includeAmazon ? null : ["shopify"] });
    if (req !== lastReq.current) return;
    if (e) setError(e.message); else setDemand(data || []);
  }, [range, includeAmazon]);

  const loadRest = useCallback(async () => {
    const [st, po, it, um, mp, al] = await Promise.all([
      supabase.from("v_dp_stock").select("source,location,sku,snapshot_date,on_hand,available,region,default_on,plan_sku,plan_qty").range(0, 9999),
      supabase.from("v_dp_open_po").select("po_id,order_number,supplier,location,status,sku,name,qty_open,required_by,order_date,region,plan_sku,plan_qty").range(0, 9999),
      supabase.from("dp_items").select("sku,name,family").range(0, 9999),
      supabase.rpc("dp_unmapped_skus", { p_from: addDays(range.today, -90), p_to: range.today }),
      supabase.from("dp_sku_map").select("sales_sku,item_sku,qty,note,updated_at").order("updated_at", { ascending: false }),
      supabase.from("dp_item_alias").select("alias_sku,item_sku,qty,note,updated_at").order("updated_at", { ascending: false }),
    ]);
    const err = [st, po, it, um, mp, al].find((r) => r.error);
    if (err) setError(err.error.message);
    setStock(st.data || []); setPos(po.data || []); setItems(it.data || []); setUnmapped(um.data || []); setMaps(mp.data || []); setAliases(al.data || []);
  }, [range]);

  useEffect(() => { setLoading(true); Promise.all([loadDemand(), loadRest()]).finally(() => setLoading(false)); }, [loadDemand, loadRest]);

  // Locations, with whether each counts.
  const locations = useMemo(() => {
    const m = new Map();
    stock.forEach((r) => {
      const k = `${r.source}|${r.location}`;
      if (!m.has(k)) m.set(k, { key: k, source: r.source, location: r.location, region: r.region, default_on: r.default_on, on_hand: 0, snapshot_date: r.snapshot_date });
      m.get(k).on_hand += Number(r.on_hand || 0);
    });
    return [...m.values()].map((l) => ({ ...l, on: locOverride[l.key] ?? l.default_on }))
      .sort((a, b) => REGIONS.indexOf(a.region) - REGIONS.indexOf(b.region) || b.on_hand - a.on_hand);
  }, [stock, locOverride]);

  const itemName = useMemo(() => Object.fromEntries(items.map((i) => [i.sku, i])), [items]);

  // One row per item x region with demand or stock.
  const rows = useMemo(() => {
    if (!demand) return [];
    const t = range.today;
    const on = new Set(locations.filter((l) => l.on).map((l) => l.key));
    const stockBy = new Map(), locBy = new Map();
    // Stock basis: "available" (on hand less reserved, floored at zero per
    // location: Stord reserves can far exceed customer orders, e.g. 770k
    // reserved against 556k L-04 at Medford) or plain on hand.
    stock.forEach((r) => {
      const k = `${r.plan_sku || r.sku}|${r.region}`;
      if (!locBy.has(k)) locBy.set(k, []);
      locBy.get(k).push(r);
      if (!on.has(`${r.source}|${r.location}`)) return;
      const q = basis === "on_hand" ? Number(r.on_hand ?? 0) : Number(r.available ?? r.on_hand ?? 0);
      stockBy.set(k, (stockBy.get(k) || 0) + Math.max(0, q) * Number(r.plan_qty || 1));
    });
    const poBy = new Map();
    pos.forEach((p) => {
      const k = `${p.plan_sku || p.sku}|${p.region}`;
      const a = poArrival(p, { today: t, leadDays, countStale });
      const idx = Math.round((Date.parse(a.arrive) - Date.parse(t)) / 864e5);
      if (!poBy.has(k)) poBy.set(k, []);
      poBy.get(k).push({ ...p, ...a, idx, qty_open: Number(p.qty_open) * Number(p.plan_qty || 1) });
    });
    // Series end on the last day with any sales (the day before today, unless
    // today's sync hasn't run yet).
    let last = -1;
    demand.forEach((r) => { const i = r.idx[r.idx.length - 1]; if (i > last) last = i; });
    if (last < 0) return [];
    const dates = Array.from({ length: last + 1 }, (_, i) => addDays(range.from, i));
    const gap = Math.max(0, Math.round((Date.parse(t) - Date.parse(dates[last])) / 864e5) - 1); // forecast days before today
    const keys = new Map();
    demand.forEach((r) => {
      const values = new Array(last + 1).fill(0);
      r.idx.forEach((i, j) => { if (i <= last) values[i] = Number(r.u[j]); });
      keys.set(`${r.item_sku}|${r.region}`, { sku: r.item_sku, region: r.region, values });
    });
    stockBy.forEach((q, k) => { if (q !== 0 && !keys.has(k)) { const [sku, reg] = k.split("|"); keys.set(k, { sku, region: reg, values: new Array(last + 1).fill(0) }); } });
    const out = [];
    keys.forEach((s, k) => {
      const recent = sum(s.values.slice(-90));
      const fc = recent > 0 ? forecast({ dates, values: s.values }, { horizon: HORIZON + gap, model: "auto" }) : null;
      const dem = fc ? fc.points.slice(gap).map((p) => p.value) : new Array(HORIZON).fill(0);
      const myPos = (poBy.get(k) || []).sort((a, b) => a.idx - b.idx);
      const arrivals = new Array(HORIZON).fill(0);
      myPos.forEach((p) => { if (p.counted && p.idx < HORIZON) arrivals[Math.max(0, p.idx)] += p.qty_open; });
      const st = stockBy.get(k) || 0;
      const plan = planItem({ stock: st, demand: dem, arrivals, today: t, leadDays, safetyDays, targetDays });
      // Sold but never stocked at any location we can see and nothing on order:
      // most likely held only at Amazon FBA, which isn't in the warehouse data.
      if (plan.status !== "idle" && !(locBy.get(k) || []).some((l) => Number(l.on_hand) > 0) && !myPos.length) plan.status = "nodata";
      const nextPo = myPos.find((p) => p.counted);
      const info = itemName[s.sku] || {};
      out.push({
        key: k, sku: s.sku, region: s.region, name: info.name || s.sku, family: info.family || "",
        stock: st, recent90: recent, demand: dem, plan, pos: myPos, nextPo, locs: locBy.get(k) || [],
        model: fc?.model, wape: fc?.wape, today: t,
        poOpen: sum(myPos.filter((p) => p.counted).map((p) => p.qty_open)),
        staleQty: sum(myPos.filter((p) => !p.counted).map((p) => p.qty_open)),
      });
    });
    return out;
  }, [demand, stock, pos, locations, itemName, range, leadDays, safetyDays, targetDays, countStale, basis]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let r = rows.filter((x) => (region === "all" || x.region === region)
      && (statusFilter === "all" || (statusFilter === "active" ? !["idle", "nodata"].includes(x.plan.status) : statusFilter === "action" ? ["stockout", "late", "now", "soon"].includes(x.plan.status) : x.plan.status === statusFilter))
      && (!q || x.sku.toLowerCase().includes(q) || x.name.toLowerCase().includes(q) || x.family.toLowerCase().includes(q)));
    const big = 1e9;
    const val = {
      status: (x) => STATUS[x.plan.status].rank * big + (x.plan.reorderDays ?? big / 10),
      sku: (x) => x.sku, region: (x) => x.region, stock: (x) => x.stock, avg: (x) => x.plan.avgDaily,
      cover: (x) => x.plan.coverDays ?? big, stockout: (x) => x.plan.stockoutDays ?? big,
      reorder: (x) => x.plan.reorderDays ?? big, qty: (x) => x.plan.suggestQty, po: (x) => x.nextPo?.idx ?? big,
    }[sort.key];
    r = [...r].sort((a, b) => { const va = val(a), vb = val(b); return (va < vb ? -1 : va > vb ? 1 : 0) * sort.dir; });
    return r;
  }, [rows, region, statusFilter, search, sort]);

  const kpi = useMemo(() => {
    const inRegion = rows.filter((x) => region === "all" || x.region === region);
    const count = (st) => inRegion.filter((x) => st.includes(x.plan.status)).length;
    const active = inRegion.filter((x) => !["idle", "nodata"].includes(x.plan.status));
    const totStock = sum(active.map((x) => x.stock)), totDaily = sum(active.map((x) => x.plan.avgDaily));
    const unmappedUnits = sum(unmapped.map((u) => Number(u.units || 0)));
    return {
      items: active.length, critical: count(["stockout", "late"]), now: count(["now"]), soon: count(["soon"]),
      cover: totDaily > 0 ? totStock / totDaily : null, unmappedUnits, unmappedSkus: unmapped.length,
    };
  }, [rows, region, unmapped]);

  const snapshotDates = useMemo(() => {
    const m = {}; locations.forEach((l) => { m[l.source] = l.snapshot_date > (m[l.source] || "") ? l.snapshot_date : m[l.source]; }); return m;
  }, [locations]);

  const exportCsv = () => {
    const head = ["item_sku", "name", "region", "available", "avg_daily_next30", "days_cover_on_hand", "stockout_date_with_pos", "next_po_date", "next_po_qty", "open_po_qty", "reorder_by", "suggested_order_qty", "status", "forecast_model", "backtest_error"];
    const lines = visible.map((x) => [x.sku, x.name, x.region, Math.round(x.stock), x.plan.avgDaily.toFixed(1), x.plan.coverDays ?? `>${HORIZON}`, x.plan.stockoutDate || "", x.nextPo?.arrive || "", x.nextPo ? Math.round(x.nextPo.qty_open) : "", Math.round(x.poOpen), x.plan.reorderDate || "", x.plan.suggestQty, STATUS[x.plan.status].label, x.model ? MODEL_LABELS[x.model] : "", x.wape != null ? (x.wape * 100).toFixed(1) + "%" : ""]);
    const csv = [head, ...lines].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `inventory-cover-${range.today}.csv`; a.click();
  };

  const th = (key, label, align = "right") => (
    <th onClick={() => setSort((s) => ({ key, dir: s.key === key ? -s.dir : 1 }))}
      style={{ padding: "8px 10px", textAlign: align, fontSize: 10.5, fontWeight: 700, color: sort.key === key ? T.accent : T.text3, textTransform: "uppercase", letterSpacing: "0.04em", cursor: "pointer", whiteSpace: "nowrap", position: "sticky", top: 0, background: T.surface }}>
      {label}{sort.key === key ? (sort.dir > 0 ? " ↑" : " ↓") : ""}
    </th>
  );
  const td = { padding: "8px 10px", fontSize: 12, color: T.text, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", borderTop: `1px solid ${T.border}` };

  return (
    <div>
      {/* Controls */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end", marginBottom: 14 }}>
        <Field label="Region"><Seg options={[["all", "All"], ...REGIONS.map((r) => [r, r])]} value={region} onChange={setRegion} /></Field>
        <Field label="Lead time"><NumIn value={leadDays} onChange={setLeadDays} suffix="days" min={1} /></Field>
        <Field label="Safety stock"><NumIn value={safetyDays} onChange={setSafetyDays} suffix="days" /></Field>
        <Field label="Order covers"><NumIn value={targetDays} onChange={setTargetDays} suffix="days" min={7} /></Field>
        <Field label="Stock"><Seg options={[["available", "Available"], ["on_hand", "On hand"]]} value={basis} onChange={setBasis} /></Field>
        <Field label="Demand">
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: T.text2, padding: "5px 0" }}>
            <input type="checkbox" checked={includeAmazon} onChange={(e) => setIncludeAmazon(e.target.checked)} /> Include Amazon
          </label>
        </Field>
        <Field label="Open POs">
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: T.text2, padding: "5px 0" }} title="POs more than 30 days past their due date are left out unless this is on">
            <input type="checkbox" checked={countStale} onChange={(e) => setCountStale(e.target.checked)} /> Count POs over 30 days late
          </label>
        </Field>
        <button onClick={() => setShowLocs((v) => !v)} style={{ padding: "6px 12px", fontSize: 11.5, fontWeight: 600, borderRadius: 7, border: `1px solid ${T.border}`, background: showLocs ? T.accentDim : T.surface2, color: showLocs ? T.accent : T.text2, cursor: "pointer" }}>
          Locations ({locations.filter((l) => l.on).length}/{locations.length})
        </button>
        <div style={{ flex: 1 }} />
        <button onClick={exportCsv} disabled={!visible.length} style={{ padding: "6px 12px", fontSize: 11.5, fontWeight: 600, borderRadius: 7, border: `1px solid ${T.border}`, background: T.surface2, color: T.text2, cursor: "pointer" }}>⬇ CSV</button>
      </div>

      {showLocs && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 11.5, color: T.text2, marginBottom: 8 }}>
            Stock counted at each location (latest snapshot: Stord {fmtDate(snapshotDates.stord)}, Cin7 {fmtDate(snapshotDates.cin7)}). Stord is read directly, so Cin7's mirrors of it ("US-Stord", "White City / Medford") are off by default. Amazon FBA stock isn't in the warehouse data.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fill, minmax(300px, 1fr))", gap: 6 }}>
            {locations.map((l) => (
              <label key={l.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: l.on ? T.text : T.text3, padding: "4px 6px", borderRadius: 6, background: l.on ? T.surface2 : "transparent" }}>
                <input type="checkbox" checked={l.on} onChange={(e) => setLocOverride((o) => ({ ...o, [l.key]: e.target.checked }))} />
                <span style={{ fontSize: 10, fontWeight: 700, color: T.text3, width: 22 }}>{l.region}</span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.location} <span style={{ color: T.text3 }}>· {l.source === "stord" ? "Stord" : "Cin7"}</span></span>
                <span style={{ fontVariantNumeric: "tabular-nums", color: T.text2 }}>{fmtN(l.on_hand)}</span>
              </label>
            ))}
          </div>
          {Object.keys(locOverride).length > 0 && <button onClick={() => setLocOverride({})} style={{ marginTop: 8, fontSize: 11, color: T.accent, background: "none", border: "none", cursor: "pointer", padding: 0 }}>Reset to defaults</button>}
        </div>
      )}

      {error && <div style={{ padding: 10, borderRadius: 8, background: T.red + "15", color: T.red, fontSize: 12, marginBottom: 12 }}>{error}</div>}

      {/* KPIs */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <Tile label="Items with demand" value={loading ? "…" : kpi.items} sub={region === "all" ? "item x region" : region} />
        <Tile label="Out or short before an order lands" value={loading ? "…" : kpi.critical} tone={kpi.critical ? "critical" : undefined} sub={`stockout inside the ${leadDays}-day lead time`} />
        <Tile label="Order now" value={loading ? "…" : kpi.now} tone={kpi.now ? "serious" : undefined} sub="reorder-by date has passed" />
        <Tile label="Order in the next 2 weeks" value={loading ? "…" : kpi.soon} tone={kpi.soon ? "warning" : undefined} sub="reorder-by within 14 days" />
        <Tile label="Network cover" value={loading || kpi.cover == null ? "…" : `${Math.round(kpi.cover)} days`} sub="stock ÷ forecast daily demand" />
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <Seg options={[["active", "With demand"], ["action", "Needs action"], ["ok", "OK"], ["excess", "Excess"], ["nodata", "No stock data"], ["idle", "No demand"], ["all", "All"]]} value={statusFilter} onChange={setStatusFilter} />
        <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search SKU, product or family"
          style={{ width: isMobile ? "100%" : 260, padding: "6px 10px", fontSize: 12, borderRadius: 7, border: `1px solid ${T.border}`, background: T.surface2, color: T.text }} />
        <span style={{ fontSize: 11.5, color: T.text3 }}>{visible.length} rows · click a row for the projection</span>
      </div>

      {/* Table */}
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, overflow: "auto", maxHeight: 640 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 1080 }}>
          <thead>
            <tr>
              {th("sku", "Item", "left")}{th("region", "Region", "left")}{th("stock", basis === "on_hand" ? "On hand" : "Available")}{th("avg", "Daily fcst")}
              {th("cover", "Days cover")}{th("stockout", "Stockout (with POs)")}{th("po", "Next PO")}{th("reorder", "Reorder by")}{th("qty", "Suggested order")}{th("status", "Status", "left")}
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={10} style={{ ...td, textAlign: "center", color: T.text3, padding: 30 }}>Loading stock, open POs and forecasting each item…</td></tr>}
            {!loading && !visible.length && <tr><td colSpan={10} style={{ ...td, textAlign: "center", color: T.text3, padding: 30 }}>No items match.</td></tr>}
            {!loading && visible.map((x) => {
              const isOpen = open === x.key;
              return [
                <tr key={x.key} onClick={() => setOpen(isOpen ? null : x.key)} style={{ cursor: "pointer", background: isOpen ? T.surface2 : "transparent" }}>
                  <td style={{ ...td, textAlign: "left", maxWidth: 320 }}>
                    <div style={{ fontWeight: 700 }}>{x.sku}</div>
                    <div style={{ fontSize: 11, color: T.text3, overflow: "hidden", textOverflow: "ellipsis", maxWidth: 300 }}>{x.name !== x.sku ? x.name : x.family}</div>
                  </td>
                  <td style={{ ...td, textAlign: "left" }}>{x.region}</td>
                  <td style={td}>{fmtN(x.stock)}</td>
                  <td style={td}>{x.plan.avgDaily >= 1 ? fmtN(x.plan.avgDaily) : "-"}</td>
                  <td style={td}>{x.plan.avgDaily >= 1 ? daysLabel(x.plan.coverDays, HORIZON) : "-"}</td>
                  <td style={td}>{x.plan.stockoutDate ? fmtDateY(x.plan.stockoutDate) : x.plan.avgDaily >= 1 ? `>${HORIZON} days` : "-"}</td>
                  <td style={td}>{x.nextPo ? <span>{fmtDate(x.nextPo.arrive)} <span style={{ color: T.text3 }}>+{fmtN(x.nextPo.qty_open)}</span>{x.nextPo.overdue ? <span title="past its due date" style={{ color: T.orange }}> late</span> : ""}</span> : <span style={{ color: T.text3 }}>{x.staleQty > 0 ? `stale ${fmtN(x.staleQty)}` : "none"}</span>}</td>
                  <td style={{ ...td, fontWeight: 700, color: x.plan.reorderDays != null && x.plan.reorderDays <= 0 ? T.orange : T.text }}>{x.plan.reorderDate ? (x.plan.reorderDays <= 0 ? "Now" : fmtDate(x.plan.reorderDate)) : "-"}</td>
                  <td style={td}>{x.plan.suggestQty > 0 ? fmtN(x.plan.suggestQty) : "-"}</td>
                  <td style={{ ...td, textAlign: "left" }}><StatusBadge status={x.plan.status} /></td>
                </tr>,
                isOpen && (
                  <tr key={x.key + "-d"}>
                    <td colSpan={10} style={{ padding: "12px 14px", borderTop: `1px solid ${T.border}`, background: T.surface2 }}>
                      <div style={{ display: "flex", gap: 18, flexWrap: "wrap", alignItems: "flex-start" }}>
                        <div style={{ flex: "2 1 520px", minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 4 }}>{x.name} · {x.region} · next {CHART_DAYS} days</div>
                          <div style={{ fontSize: 11.5, color: T.text2, marginBottom: 6 }}>
                            Forecast {fmtN(sum(x.demand.slice(0, 30)))} in the next 30 days ({x.model ? MODEL_LABELS[x.model] : "no history"}{x.wape != null ? `, backtest error ${(x.wape * 100).toFixed(0)}%` : ""}). Safety stock {fmtN(x.plan.safety)}.
                            {x.plan.suggestQty > 0 && <> Ordering <b>{fmtN(x.plan.suggestQty)}</b> by {x.plan.reorderDays <= 0 ? "today" : fmtDate(x.plan.reorderDate)} lands around {fmtDate(addDays(x.today, Math.max(0, x.plan.reorderDays) + leadDays))} and covers {targetDays} days after that.</>}
                          </div>
                          <StockChart row={x} />
                        </div>
                        <div style={{ flex: "1 1 280px", minWidth: 0, fontSize: 12 }}>
                          <div style={{ fontWeight: 700, color: T.text, marginBottom: 4 }}>Stock by location</div>
                          {x.locs.length ? x.locs.map((l, i) => {
                            const counted = locations.find((k) => k.key === `${l.source}|${l.location}`)?.on;
                            return <div key={i} style={{ display: "flex", justifyContent: "space-between", color: counted ? T.text2 : T.text3, lineHeight: 1.7 }}><span>{l.location}{l.sku !== x.sku ? ` · ${l.sku}${Number(l.plan_qty) !== 1 ? ` x${l.plan_qty}` : ""}` : ""}{counted ? "" : " (not counted)"}</span><span style={{ fontVariantNumeric: "tabular-nums" }} title={`on hand ${fmtN(l.on_hand)}`}>{fmtN(basis === "on_hand" ? l.on_hand : l.available ?? l.on_hand)}</span></div>;
                          }) : <div style={{ color: T.text3 }}>No stock recorded.</div>}
                          <div style={{ fontWeight: 700, color: T.text, margin: "10px 0 4px" }}>Open POs</div>
                          {x.pos.length ? x.pos.map((p, i) => (
                            <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 8, color: p.counted ? T.text2 : T.text3, lineHeight: 1.7 }}>
                              <span title={`${p.supplier || ""} → ${p.location || ""} · ${p.status}`}>{p.order_number} · {p.expected ? fmtDate(p.expected) : "no date"}{p.assumed ? " (est.)" : ""}{p.stale ? " · stale" : p.overdue ? " · late" : ""}</span>
                              <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmtN(p.qty_open)}</span>
                            </div>
                          )) : <div style={{ color: T.text3 }}>None.</div>}
                          <AliasEditor item={x.sku} items={items} aliases={aliases} onSaved={() => { loadRest(); loadDemand(); }} />
                        </div>
                      </div>
                    </td>
                  </tr>
                ),
              ];
            })}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize: 11, color: T.text3, marginTop: 8, lineHeight: 1.6 }}>
        Demand is the Daily Units forecast per stock item, with kits and multi-packs expanded to the units they use, free units included, and sales assigned to a region by ship-to country.
        PO dates are Cin7's required-by date; POs without one are assumed to land one lead time after ordering. Stock is available (on hand less reserved, never below zero at a location) or on hand, at the counted locations.
      </div>

      <SkuMapping unmapped={unmapped} maps={maps} aliases={aliases} items={items} onSaved={() => { loadRest(); loadDemand(); }} />
    </div>
  );
}

// ── Stock that counts as this item (older generation, relabelled stock) ─────
function AliasEditor({ item, items, aliases, onSaved }) {
  const [sku, setSku] = useState("");
  const [qty, setQty] = useState(1);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const mine = aliases.filter((a) => a.item_sku === item);
  const taken = new Set([item, ...aliases.map((a) => a.alias_sku), ...aliases.map((a) => a.item_sku)]);
  const options = items.filter((i) => !taken.has(i.sku) && !/^RM-|^ENV-/.test(i.sku)).sort((a, b) => a.sku.localeCompare(b.sku));
  const run = async (fn) => { setBusy(true); setErr(""); const { error } = await fn(); setBusy(false); if (error) setErr(error.message); else { setSku(""); onSaved(); } };
  const inp = { padding: "4px 6px", fontSize: 12, borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.text };
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontWeight: 700, color: T.text, marginBottom: 4 }}>Also count stock of</div>
      {mine.map((a) => (
        <div key={a.alias_sku} style={{ display: "flex", justifyContent: "space-between", gap: 8, color: T.text2, lineHeight: 1.7 }}>
          <span>{a.alias_sku}{Number(a.qty) !== 1 ? ` x${a.qty}` : ""}</span>
          <button disabled={busy} onClick={() => run(() => supabase.from("dp_item_alias").delete().eq("alias_sku", a.alias_sku))} style={{ fontSize: 11, color: T.red, background: "none", border: "none", cursor: "pointer" }}>Remove</button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }} onClick={(e) => e.stopPropagation()}>
        <select value={sku} onChange={(e) => setSku(e.target.value)} style={{ ...inp, maxWidth: 210 }}>
          <option value="">Another SKU that ships as this…</option>
          {options.map((i) => <option key={i.sku} value={i.sku}>{i.sku}{i.name ? ` · ${i.name}` : ""}</option>)}
        </select>
        <input type="number" min={0.01} step="any" value={qty} onChange={(e) => setQty(e.target.value)} title="Units of this item per unit of that SKU" style={{ ...inp, width: 50 }} />
        <button disabled={!sku || !(Number(qty) > 0) || busy} onClick={() => run(() => supabase.from("dp_item_alias").upsert({ alias_sku: sku, item_sku: item, qty: Number(qty), updated_at: new Date().toISOString() }, { onConflict: "org_id,alias_sku" }))}
          style={{ padding: "4px 10px", fontSize: 11.5, fontWeight: 700, borderRadius: 6, border: "none", background: sku ? T.accent : T.surface2, color: sku ? "#fff" : T.text3, cursor: sku ? "pointer" : "default" }}>Add</button>
      </div>
      <div style={{ fontSize: 10.5, color: T.text3, marginTop: 3 }}>Its stock, open POs and sales are then planned under {item}.</div>
      {err && <div style={{ color: T.red, fontSize: 11.5 }}>{err}</div>}
    </div>
  );
}

// ── Unmapped sales SKUs and manual mappings ─────────────────────────────────
const tokens = (s) => new Set(String(s || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 2 && !["earth", "breeze", "the", "and", "for", "with", "pack"].includes(w)));
function suggest(name, items) {
  const a = tokens(name);
  let best = null, bestScore = 0;
  items.forEach((it) => {
    const b = tokens(it.name);
    let s = 0; a.forEach((w) => { if (b.has(w)) s++; });
    const score = s / Math.max(1, Math.sqrt(a.size * b.size));
    if (score > bestScore) { bestScore = score; best = it; }
  });
  return bestScore >= 0.35 ? best : null;
}

function SkuMapping({ unmapped, maps, aliases, items, onSaved }) {
  const [draft, setDraft] = useState({});
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [showAll, setShowAll] = useState(false);
  const stockItems = useMemo(() => [...items].filter((i) => i.sku && !/^RM-|^ENV-/.test(i.sku)).sort((a, b) => a.sku.localeCompare(b.sku)), [items]);
  const total = sum(unmapped.map((u) => Number(u.units || 0)));
  const list = showAll ? unmapped : unmapped.slice(0, 12);

  const save = async (sales_sku, item_sku, qty, note) => {
    setBusy(sales_sku); setErr("");
    const { error } = await supabase.from("dp_sku_map").upsert({ sales_sku, item_sku, qty, note, updated_at: new Date().toISOString() }, { onConflict: "org_id,sales_sku,item_sku" });
    setBusy("");
    if (error) { setErr(error.message); return; }
    onSaved();
  };
  const remove = async (m) => {
    setBusy(m.sales_sku); setErr("");
    const { error } = await supabase.from("dp_sku_map").delete().eq("sales_sku", m.sales_sku).eq("item_sku", m.item_sku);
    setBusy("");
    if (error) setErr(error.message); else onSaved();
  };

  const inp = { padding: "4px 6px", fontSize: 12, borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.text };
  return (
    <div style={{ marginTop: 22 }}>
      <div style={{ fontSize: 14, fontWeight: 800, color: T.text }}>Sales SKUs without a stock item</div>
      <div style={{ fontSize: 12, color: T.text2, margin: "2px 0 10px" }}>
        {unmapped.length ? `${unmapped.length} SKUs, ${fmtN(total)} units in the last 90 days, aren't counted above. Map each to the stock item it ships as (and how many), or mark it as not stocked.` : "Every product SKU sold in the last 90 days maps to a stock item."}
      </div>
      {err && <div style={{ color: T.red, fontSize: 12, marginBottom: 8 }}>{err}</div>}
      {unmapped.length > 0 && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 820 }}>
            <thead><tr>{["Sales SKU", "Sold as", "Units (90d)", "Stock item", "Qty each", ""].map((h, i) => <th key={i} style={{ padding: "8px 10px", textAlign: i === 2 || i === 4 ? "right" : "left", fontSize: 10.5, fontWeight: 700, color: T.text3, textTransform: "uppercase" }}>{h}</th>)}</tr></thead>
            <tbody>
              {list.map((u) => {
                const sug = suggest(u.name, stockItems);
                const d = draft[u.sku] || { item: sug?.sku || "", qty: 1 };
                const set = (p) => setDraft((o) => ({ ...o, [u.sku]: { ...d, ...p } }));
                return (
                  <tr key={u.sku}>
                    <td style={{ padding: "6px 10px", fontSize: 12, fontWeight: 700, color: T.text, borderTop: `1px solid ${T.border}`, whiteSpace: "nowrap" }}>{u.sku}<div style={{ fontSize: 10.5, color: T.text3, fontWeight: 500 }}>{u.channels}</div></td>
                    <td style={{ padding: "6px 10px", fontSize: 11.5, color: T.text2, borderTop: `1px solid ${T.border}`, maxWidth: 320 }}>{u.name}</td>
                    <td style={{ padding: "6px 10px", fontSize: 12, textAlign: "right", color: T.text, borderTop: `1px solid ${T.border}`, fontVariantNumeric: "tabular-nums" }}>{fmtN(u.units)}</td>
                    <td style={{ padding: "6px 10px", borderTop: `1px solid ${T.border}` }}>
                      <select value={d.item} onChange={(e) => set({ item: e.target.value })} style={{ ...inp, maxWidth: 300 }}>
                        <option value="">Choose…</option>
                        {sug && <option value={sug.sku}>Suggested: {sug.sku} · {sug.name}</option>}
                        {stockItems.map((it) => <option key={it.sku} value={it.sku}>{it.sku}{it.name ? ` · ${it.name}` : ""}</option>)}
                      </select>
                    </td>
                    <td style={{ padding: "6px 10px", borderTop: `1px solid ${T.border}`, textAlign: "right" }}>
                      <input type="number" min={0.01} step="any" value={d.qty} onChange={(e) => set({ qty: e.target.value })} style={{ ...inp, width: 60, textAlign: "right" }} />
                    </td>
                    <td style={{ padding: "6px 10px", borderTop: `1px solid ${T.border}`, whiteSpace: "nowrap" }}>
                      <button disabled={!d.item || !(Number(d.qty) > 0) || busy === u.sku} onClick={() => save(u.sku, d.item, Number(d.qty), null)}
                        style={{ padding: "4px 10px", fontSize: 11.5, fontWeight: 700, borderRadius: 6, border: "none", background: d.item ? T.accent : T.surface2, color: d.item ? "#fff" : T.text3, cursor: d.item ? "pointer" : "default", marginRight: 6 }}>Map</button>
                      <button disabled={busy === u.sku} onClick={() => save(u.sku, "", 0, "not stocked")}
                        style={{ padding: "4px 10px", fontSize: 11.5, fontWeight: 600, borderRadius: 6, border: `1px solid ${T.border}`, background: "transparent", color: T.text2, cursor: "pointer" }}>Not stocked</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {unmapped.length > 12 && <button onClick={() => setShowAll((v) => !v)} style={{ margin: 8, fontSize: 11.5, color: T.accent, background: "none", border: "none", cursor: "pointer" }}>{showAll ? "Show fewer" : `Show all ${unmapped.length}`}</button>}
        </div>
      )}
      {aliases.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 6 }}>Stock planned under another item ({aliases.length})</div>
          {aliases.map((a) => (
            <div key={a.alias_sku} style={{ fontSize: 12, color: T.text2, lineHeight: 1.7 }}><b style={{ color: T.text }}>{a.alias_sku}</b> counts as {Number(a.qty) !== 1 ? `${a.qty} × ` : ""}{a.item_sku}</div>
          ))}
        </div>
      )}
      {maps.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 6 }}>Manual mappings ({maps.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {maps.map((m) => (
              <div key={m.sales_sku + m.item_sku} style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: T.text2 }}>
                <span style={{ fontWeight: 700, color: T.text }}>{m.sales_sku}</span>
                <span>→ {m.qty > 0 ? `${m.qty} × ${m.item_sku}` : "not stocked"}</span>
                <button disabled={busy === m.sales_sku} onClick={() => remove(m)} style={{ fontSize: 11, color: T.red, background: "none", border: "none", cursor: "pointer" }}>Remove</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
