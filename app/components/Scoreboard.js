"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";

const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwYmpkbW55a2hldWJ4a3VrbnVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNDI3OTcsImV4cCI6MjA4NzcxODc5N30.pvTTkiZWNDPuo-Fdzm54uy8w1mlx0AjB5jtFm3MeGq4";
const BASE = "https://upbjdmnykheubxkuknuj.supabase.co/functions/v1";
const HEADERS = { "Content-Type": "application/json", Authorization: `Bearer ${ANON}` };

const fmt$ = (v, compact=true) => {
  if (v == null || isNaN(v)) return "—";
  const abs = Math.abs(v), s = v < 0 ? "-" : "";
  if (compact) {
    if (abs >= 1e6) return s + "$" + (abs/1e6).toFixed(2) + "M";
    if (abs >= 1e3) return s + "$" + (abs/1e3).toFixed(1) + "K";
  }
  return s + "$" + abs.toLocaleString("en-US", {minimumFractionDigits:0,maximumFractionDigits:0});
};
const fmtN = (v) => v == null ? "—" : Number(v).toLocaleString();
const fmtPct = (v) => v == null ? "—" : (v >= 0 ? "+" : "") + Number(v).toFixed(1) + "%";

// METRIC_META: display info for all scoreboard metrics
const METRIC_META = {
  revenue:          { label:"Revenue",                  unit:"$",  group:"Finance",      color:"#22c55e" },
  comp_yago:        { label:"COMP YAGO",                unit:"$",  group:"Finance",      color:"#22c55e" },
  amazon_revenue:   { label:"Amazon Revenue",           unit:"$",  group:"Finance",      color:"#f97316" },
  net_dollars:      { label:"Net $",                    unit:"$",  group:"Finance",      color:"#22c55e" },
  ad_spend:         { label:"Ad Spend",                 unit:"$",  group:"Finance",      color:"#ef4444" },
  opex_pct_rev:     { label:"OPEX % REV",               unit:"%",  group:"Finance",      color:"#8b5cf6" },
  roas:             { label:"ROAS",                     unit:"x",  group:"Finance",      color:"#4f7fff" },
  units_shipped:    { label:"Units Shipped",            unit:"#",  group:"Operations",   color:"#4f7fff" },
  total_orders:     { label:"Total Orders",             unit:"#",  group:"Orders",       color:"#4f7fff" },
  new_orders:       { label:"New Orders",               unit:"#",  group:"Orders",       color:"#22c55e" },
  amazon_total_orders:{ label:"Amazon Total Orders",    unit:"#",  group:"Orders",       color:"#f97316" },
  dtc_new_customers:{ label:"DTC New Unique Customers", unit:"#",  group:"Customers",    color:"#22c55e" },
  amz_new_customers:{ label:"AMZ New Unique Customers", unit:"#",  group:"Customers",    color:"#f97316" },
  new_gwp_subs:     { label:"New GWP Subs",             unit:"#",  group:"Subscriptions",color:"#4f7fff" },
  gwp_cpa:          { label:"GWP CPA",                  unit:"$",  group:"Subscriptions",color:"#8b5cf6" },
  new_shopify_subs: { label:"New Shopify Subs",         unit:"#",  group:"Subscriptions",color:"#22c55e" },
  upsell_take_rate: { label:"Upsell Take Rate",         unit:"%",  group:"Subscriptions",color:"#f97316" },
  sub_rate:         { label:"Sub Rate %",               unit:"%",  group:"Subscriptions",color:"#4f7fff" },
  daily_cancels:    { label:"Daily Cancels",            unit:"#",  group:"Subscriptions",color:"#ef4444" },
  amz_net_subs:     { label:"Amz Net Daily Subs",       unit:"#",  group:"Subscriptions",color:"#f97316" },
  net_daily_subs:   { label:"Net Daily Subs",           unit:"#",  group:"Subscriptions",color:"#22c55e" },
  cpa:              { label:"CPA",                      unit:"$",  group:"Acquisition",  color:"#8b5cf6" },
  dtc_cac:          { label:"DTC CAC",                  unit:"$",  group:"Acquisition",  color:"#4f7fff" },
  x_cac:            { label:"X-CAC",                    unit:"$",  group:"Acquisition",  color:"#8b5cf6" },
  nc_aov:           { label:"NC AOV",                   unit:"$",  group:"Acquisition",  color:"#22c55e" },
  traffic:          { label:"Traffic (Sessions)",        unit:"#",  group:"Marketing",    color:"#4f7fff" },
  blended_cvr:      { label:"Blended CVR",              unit:"%",  group:"Marketing",    color:"#22c55e" },
};

const fmtVal = (v, unit, compact=true) => {
  if (v == null || v === undefined) return "—";
  const n = Number(v);
  if (isNaN(n)) return "—";
  if (unit === "$") return fmt$(n, compact);
  if (unit === "%") return n.toFixed(1) + "%";
  if (unit === "x") return n.toFixed(2) + "x";
  return compact && n >= 1e6 ? (n/1e6).toFixed(1)+"M" : compact && n >= 1e3 ? (n/1e3).toFixed(1)+"K" : n.toLocaleString();
};
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ── Mini SVG Bar Chart ──────────────────────────────────────────────────────
function BarChart({ data, color = T.accent, height = 60 }) {
  if (!data?.length) return null;
  const vals = data.map(d => d.value ?? 0);
  const max = Math.max(...vals, 1);
  const w = 500, h = height;
  const barW = Math.max(2, (w / vals.length) - 2);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width:"100%", height }} preserveAspectRatio="none">
      {vals.map((v, i) => {
        const bh = Math.max(2, (v / max) * h);
        return (
          <g key={i}>
            <rect x={i * (w/vals.length)} y={h - bh} width={barW} height={bh}
              fill={v < 0 ? "#ef4444" : color} opacity={i === vals.length-1 ? 1 : 0.7} rx={1} />
          </g>
        );
      })}
    </svg>
  );
}

// ── Mini SVG Line Chart ─────────────────────────────────────────────────────
function LineChart({ data, color = T.accent, height = 60, showArea = true }) {
  if (!data?.length || data.length < 2) return null;
  const vals = data.map(d => d.value ?? 0);
  const min = Math.min(...vals), max = Math.max(...vals);
  const range = max - min || 1;
  const w = 500, h = height, pad = 4;
  const pts = vals.map((v, i) => `${(i/(vals.length-1))*w},${h-pad - ((v-min)/range)*(h-2*pad)}`).join(" ");
  const areaPath = `M 0,${h} L ${pts.split(" ").map((p,i) => i===0 ? p.replace(/^\d+/,"0") : p).join(" L ")} L ${w},${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width:"100%", height }} preserveAspectRatio="none">
      {showArea && <path d={areaPath} fill={color} opacity={0.08} />}
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {/* Last point dot */}
      {(() => {
        const lastPt = pts.split(" ").pop()?.split(",");
        if (!lastPt) return null;
        return <circle cx={lastPt[0]} cy={lastPt[1]} r={3} fill={color} />;
      })()}
    </svg>
  );
}

// ── AI Chart Renderer ──────────────────────────────────────────────────────
function AIChart({ chart }) {
  if (!chart?.data?.length) return null;
  const { type="bar", title, data, series=[], colors=["#4f7fff","#22c55e","#f97316"] } = chart;
  const max = Math.max(...data.map(d => Math.max(d.value??0, d.value2??0, d.value3??0)), 1);
  const h = 180, w = 600, pad = { top:20, right:10, bottom:30, left:60 };
  const iw = w - pad.left - pad.right, ih = h - pad.top - pad.bottom;

  if (type === "bar") {
    const bw = Math.max(4, (iw / data.length) - 6);
    return (
      <div style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:10, padding:16, marginTop:12 }}>
        {title && <div style={{ fontSize:13, fontWeight:700, color:T.text, marginBottom:12 }}>{title}</div>}
        <svg viewBox={`0 0 ${w} ${h}`} style={{ width:"100%", maxHeight:h }}>
          <g transform={`translate(${pad.left},${pad.top})`}>
            {/* Y-axis gridlines */}
            {[0,.25,.5,.75,1].map(f => (
              <g key={f}>
                <line x1={0} y1={ih*(1-f)} x2={iw} y2={ih*(1-f)} stroke={T.border} strokeWidth={0.5} />
                <text x={-4} y={ih*(1-f)+4} textAnchor="end" fontSize={9} fill={T.text3}>{fmt$(max*f,true)}</text>
              </g>
            ))}
            {/* Bars */}
            {data.map((d, i) => {
              const x = (i/data.length)*iw;
              const bh = Math.max(2, ((d.value??0)/max)*ih);
              return (
                <g key={i}>
                  <rect x={x+(bw*0.1)} y={ih-bh} width={bw*0.8} height={bh} fill={colors[0]} rx={2} opacity={0.9} />
                  {d.value2!=null && <rect x={x+bw*0.5} y={ih-((d.value2/max)*ih)} width={bw*0.4} height={(d.value2/max)*ih} fill={colors[1]} rx={2} opacity={0.7} />}
                  <text x={x+bw*0.5} y={ih+14} textAnchor="middle" fontSize={9} fill={T.text3}>{d.label}</text>
                </g>
              );
            })}
          </g>
        </svg>
        {series.length > 0 && (
          <div style={{ display:"flex", gap:16, marginTop:8 }}>
            {series.map((s,i) => <div key={s} style={{ display:"flex", alignItems:"center", gap:4, fontSize:11, color:T.text3 }}><div style={{ width:10, height:10, borderRadius:2, background:colors[i]||T.accent }} />{s}</div>)}
          </div>
        )}
      </div>
    );
  }

  if (type === "line" || type === "area") {
    const points = data.map((d, i) => {
      const x = pad.left + (i/(data.length-1)) * iw;
      const y = pad.top + ih - ((d.value??0)/max) * ih;
      return `${x},${y}`;
    }).join(" ");
    const areaPath = `M ${pad.left},${pad.top+ih} L ${points.split(" ").join(" L ")} L ${pad.left+iw},${pad.top+ih} Z`;
    return (
      <div style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:10, padding:16, marginTop:12 }}>
        {title && <div style={{ fontSize:13, fontWeight:700, color:T.text, marginBottom:12 }}>{title}</div>}
        <svg viewBox={`0 0 ${w} ${h}`} style={{ width:"100%", maxHeight:h }}>
          {[0,.25,.5,.75,1].map(f => (
            <g key={f}>
              <line x1={pad.left} y1={pad.top+ih*(1-f)} x2={pad.left+iw} y2={pad.top+ih*(1-f)} stroke={T.border} strokeWidth={0.5} />
              <text x={pad.left-4} y={pad.top+ih*(1-f)+4} textAnchor="end" fontSize={9} fill={T.text3}>{fmt$(max*f)}</text>
            </g>
          ))}
          {type==="area" && <path d={areaPath} fill={colors[0]} opacity={0.1} />}
          <polyline points={points} fill="none" stroke={colors[0]} strokeWidth={2} strokeLinejoin="round" />
          {data.map((d,i) => {
            const x = pad.left + (i/(data.length-1))*iw;
            const y = pad.top + ih - ((d.value??0)/max)*ih;
            return <text key={i} x={x} y={pad.top+ih+14} textAnchor="middle" fontSize={9} fill={T.text3}>{d.label}</text>;
          })}
        </svg>
      </div>
    );
  }

  return null;
}

// ── KPI Card ────────────────────────────────────────────────────────────────
function KPICard({ label, value, prev, unit="$", sparkData, color }) {
  const change = prev && value ? ((value - prev) / Math.abs(prev)) * 100 : null;
  const isUp = change > 0;
  const cardColor = color || (value < 0 ? "#ef4444" : T.accent);
  return (
    <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, padding:"16px 18px", display:"flex", flexDirection:"column", gap:8 }}>
      <div style={{ fontSize:11, fontWeight:600, color:T.text3, textTransform:"uppercase", letterSpacing:0.5 }}>{label}</div>
      <div style={{ fontSize:26, fontWeight:800, color:cardColor, lineHeight:1 }}>
        {unit==="$" ? fmt$(value) : unit==="%" ? fmtPct(value) : fmtN(value)}
      </div>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:8 }}>
        {change != null && (
          <span style={{ fontSize:11, fontWeight:600, color:isUp?"#22c55e":"#ef4444" }}>
            {isUp?"▲":"▼"} {Math.abs(change).toFixed(1)}% vs prev
          </span>
        )}
        {sparkData?.length > 1 && (
          <div style={{ flex:1, maxWidth:80, height:28 }}>
            <LineChart data={sparkData} color={cardColor} height={28} showArea={false} />
          </div>
        )}
      </div>
    </div>
  );
}

// ── Chat Message ────────────────────────────────────────────────────────────
function ChatMessage({ msg }) {
  const isUser = msg.role === "user";
  return (
    <div style={{ display:"flex", gap:10, marginBottom:16, flexDirection:isUser?"row-reverse":"row", alignItems:"flex-start" }}>
      <div style={{ width:28, height:28, borderRadius:14, flexShrink:0,
        background:isUser?"#4f7fff20":"#22c55e20",
        border:`1px solid ${isUser?"#4f7fff50":"#22c55e50"}`,
        display:"flex", alignItems:"center", justifyContent:"center",
        fontSize:12, fontWeight:700, color:isUser?"#4f7fff":"#22c55e" }}>
        {isUser?"B":"AI"}
      </div>
      <div style={{ maxWidth:"80%", minWidth:0 }}>
        <div style={{
          background:isUser?T.accentDim:T.surface2,
          border:`1px solid ${isUser?T.accent+"40":T.border}`,
          borderRadius:isUser?"12px 2px 12px 12px":"2px 12px 12px 12px",
          padding:"10px 14px", fontSize:13, color:T.text, lineHeight:1.7,
          whiteSpace:"pre-wrap",
        }}>{msg.content}</div>
        {msg.chart && <AIChart chart={msg.chart} />}
      </div>
    </div>
  );
}

// ── Suggested Prompts ───────────────────────────────────────────────────────
const PROMPTS = [
  "Show me revenue by month as a bar chart",
  "What's our ROAS trend and what's driving it?",
  "Compare Jan vs Feb performance",
  "What was our best day this month?",
  "Show ad spend vs revenue over time",
  "What's our net margin trend?",
  "Which month had the highest revenue?",
  "Analyze our March performance so far",
];

// ── Main Scoreboard View ────────────────────────────────────────────────────
export default function ScoreboardView() {
  const [metrics, setMetrics] = useState([]);
  const [monthly, setMonthly] = useState({});
  const [daily, setDaily] = useState({});
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [selectedMetric, setSelectedMetric] = useState(null);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => { loadData(); }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior:"smooth" });
  }, [messages]);

  const loadData = async () => {
    const yr = new Date().getFullYear();
    const [{ data: mets }, { data: dailyRows }] = await Promise.all([
      supabase.from("okr_financial_metrics").select("*, okr_financial_monthly(month, actual, target)").eq("year", yr).order("sort_order"),
      supabase.from("scoreboard_daily").select("*").order("date", { ascending:false }).limit(1000),
    ]);

    // Build monthly map
    const mMap = {};
    for (const m of (mets||[])) {
      mMap[m.metric_key] = { ...m, monthly: m.okr_financial_monthly || [] };
    }
    setMetrics(mets||[]);
    setMonthly(mMap);

    // Build daily map
    const dMap = {};
    for (const r of (dailyRows||[])) {
      if (!dMap[r.metric_key]) dMap[r.metric_key] = [];
      dMap[r.metric_key].push({ date:r.date, value:r.value, label:r.date?.slice(5) });
    }
    setDaily(dMap);
    if (mets?.length) setSelectedMetric(mets[0].metric_key);
    setLoading(false);
  };

  const syncSheet = async () => {
    setSyncing(true);
    try {
      // First sync daily data
      const r1 = await fetch(`${BASE}/sheets-daily-sync`, { method:"POST", headers:HEADERS });
      const d1 = await r1.json();
      // Then sync monthly
      const r2 = await fetch(`${BASE}/sheets-sync`, { method:"POST", headers:HEADERS });
      const d2 = await r2.json();
      await loadData();
      const msg = d1.rows_upserted > 0
        ? `Synced ${d1.rows_upserted} daily rows (${d1.metrics_found?.join(", ")}) + ${d2.rowsUpserted} monthly rows`
        : d2.success ? `Monthly sync: ${d2.rowsUpserted} rows` : "Sync complete";
      setMessages(p => [...p, { role:"assistant", content:`📊 ${msg}` }]);
    } catch(e) {
      setMessages(p => [...p, { role:"assistant", content:`Sync error: ${e}` }]);
    }
    setSyncing(false);
  };

  const sendMessage = async (question) => {
    if (!question?.trim()) return;
    const userMsg = { role:"user", content:question };
    setMessages(p => [...p, userMsg]);
    setInput("");
    setAiLoading(true);

    try {
      const res = await fetch(`${BASE}/scoreboard-chat`, {
        method:"POST", headers:HEADERS,
        body: JSON.stringify({
          question,
          messages: messages.slice(-10).map(m => ({ role:m.role, content:m.content })),
        }),
      });
      const data = await res.json();
      setMessages(p => [...p, { role:"assistant", content:data.text || data.error, chart:data.chart }]);
    } catch(e) {
      setMessages(p => [...p, { role:"assistant", content:`Error: ${e}` }]);
    }
    setAiLoading(false);
  };

  const yr = new Date().getFullYear();
  const curMonth = new Date().getMonth() + 1;

  // Build KPI data from monthly
  const getMonthVal = (key, month) => monthly[key]?.monthly?.find(r => r.month === month)?.actual;
  const revCur = getMonthVal("revenue", curMonth);
  const revPrev = getMonthVal("revenue", curMonth-1);
  const netCur = getMonthVal("net_dollars", curMonth);
  const netPrev = getMonthVal("net_dollars", curMonth-1);
  const adsCur = getMonthVal("adspend", curMonth);
  const adsPrev = getMonthVal("adspend", curMonth-1);
  const roasCur = revCur && adsCur ? revCur / adsCur : null;
  const roasPrev = revPrev && adsPrev ? revPrev / adsPrev : null;
  const marginCur = revCur && netCur ? (netCur/revCur)*100 : null;
  const marginPrev = revPrev && netPrev ? (netPrev/revPrev)*100 : null;

  // YTD totals
  const ytdRev = monthly["revenue"]?.monthly?.filter(r=>r.month<=curMonth).reduce((s,r)=>s+(r.actual||0),0);
  const ytdNet = monthly["net_dollars"]?.monthly?.filter(r=>r.month<=curMonth).reduce((s,r)=>s+(r.actual||0),0);
  const ytdAds = monthly["adspend"]?.monthly?.filter(r=>r.month<=curMonth).reduce((s,r)=>s+(r.actual||0),0);

  // Spark data for KPIs
  const revSpark = monthly["revenue"]?.monthly?.filter(r=>r.month<=curMonth).map(r=>({value:r.actual||0})) || [];
  const netSpark = monthly["net_dollars"]?.monthly?.filter(r=>r.month<=curMonth).map(r=>({value:r.actual||0})) || [];
  const adsSpark = monthly["adspend"]?.monthly?.filter(r=>r.month<=curMonth).map(r=>({value:r.actual||0})) || [];

  if (loading) return (
    <div style={{ display:"flex", height:"100%", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:12, color:T.text3 }}>
      <div style={{ width:36, height:36, borderRadius:"50%", border:`3px solid ${T.border}`, borderTopColor:T.accent, animation:"spin 0.8s linear infinite" }} />
      <span style={{ fontSize:13 }}>Loading scoreboard…</span>
    </div>
  );

  const hasData = Object.keys(monthly).length > 0;

  return (
    <div style={{ display:"flex", height:"100%", overflow:"hidden", flexDirection:"column" }}>
      {/* Header */}
      <div style={{ padding:"16px 24px", borderBottom:`1px solid ${T.border}`, flexShrink:0, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
        <div>
          <h2 style={{ fontSize:18, fontWeight:700, margin:0 }}>Daily Scoreboard</h2>
          <div style={{ fontSize:12, color:T.text3, marginTop:2 }}>Earth Breeze Hydrogen · {yr}</div>
        </div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          {/* Tab selector */}
          <div style={{ display:"flex", background:T.surface2, border:`1px solid ${T.border}`, borderRadius:6, overflow:"hidden" }}>
            {[["overview","Overview"],["monthly","Monthly"],["daily","Daily"],["chat","🤖 AI Chat"]].map(([k,l]) => (
              <button key={k} onClick={()=>setActiveTab(k)} style={{ padding:"5px 12px", fontSize:12, fontWeight:600, border:"none", cursor:"pointer", background:activeTab===k?T.accent:"transparent", color:activeTab===k?"#fff":T.text3, transition:"all 0.12s" }}>{l}</button>
            ))}
          </div>
          <button onClick={syncSheet} disabled={syncing} style={{ padding:"6px 14px", fontSize:12, fontWeight:600, background:syncing?T.surface2:T.accentDim, color:T.accent, border:`1px solid ${T.accent}40`, borderRadius:6, cursor:syncing?"wait":"pointer", opacity:syncing?0.6:1 }}>
            {syncing?"Syncing…":"↻ Sync Sheet"}
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex:1, overflow:"auto", padding:"20px 24px" }}>

        {/* No data state */}
        {!hasData && activeTab !== "chat" && (
          <div style={{ textAlign:"center", padding:"60px 0", color:T.text3 }}>
            <div style={{ fontSize:40, marginBottom:12 }}>📊</div>
            <div style={{ fontSize:16, fontWeight:600, marginBottom:8 }}>No scoreboard data yet</div>
            <div style={{ fontSize:13, marginBottom:24 }}>Click "↻ Sync Sheet" to pull data from the Google Sheet</div>
            <button onClick={syncSheet} disabled={syncing} style={{ padding:"10px 24px", fontSize:13, fontWeight:700, background:T.accent, color:"#fff", border:"none", borderRadius:8, cursor:"pointer" }}>
              {syncing?"Syncing…":"↻ Sync Now"}
            </button>
          </div>
        )}

        {/* Overview tab */}
        {activeTab === "overview" && hasData && (
          <div>
            {/* KPI row */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))", gap:12, marginBottom:24 }}>
              <KPICard label={`Revenue (${MONTH_NAMES[curMonth-1]})`} value={revCur} prev={revPrev} sparkData={revSpark} color="#22c55e" />
              <KPICard label={`Net $ (${MONTH_NAMES[curMonth-1]})`} value={netCur} prev={netPrev} sparkData={netSpark} color={netCur>=0?"#22c55e":"#ef4444"} />
              <KPICard label={`Ad Spend (${MONTH_NAMES[curMonth-1]})`} value={adsCur} prev={adsPrev} sparkData={adsSpark} color="#f97316" />
              <KPICard label="ROAS" value={roasCur} prev={roasPrev} unit="x" color="#8b5cf6" />
              <KPICard label="Net Margin" value={marginCur} prev={marginPrev} unit="%" color={marginCur>=0?"#22c55e":"#ef4444"} />
            </div>

            {/* YTD summary */}
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:24 }}>
              {[
                {label:"YTD Revenue", value:ytdRev, color:"#22c55e"},
                {label:"YTD Net $", value:ytdNet, color:ytdNet>=0?"#22c55e":"#ef4444"},
                {label:"YTD Ad Spend", value:ytdAds, color:"#f97316"},
              ].map(k => (
                <div key={k.label} style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, padding:"16px 18px" }}>
                  <div style={{ fontSize:11, fontWeight:600, color:T.text3, textTransform:"uppercase", letterSpacing:0.5, marginBottom:6 }}>{k.label}</div>
                  <div style={{ fontSize:28, fontWeight:800, color:k.color }}>{fmt$(k.value)}</div>
                  <div style={{ fontSize:11, color:T.text3, marginTop:4 }}>Jan – {MONTH_NAMES[curMonth-1]} {yr}</div>
                </div>
              ))}
            </div>

            {/* Monthly chart */}
            <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, padding:20 }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
                <div style={{ fontSize:14, fontWeight:700 }}>Monthly Performance</div>
                <div style={{ display:"flex", gap:6 }}>
                  {Object.keys(monthly).map(k => (
                    <button key={k} onClick={()=>setSelectedMetric(k)} style={{ padding:"3px 10px", fontSize:11, fontWeight:600, borderRadius:5, border:"none", cursor:"pointer", background:selectedMetric===k?T.accent:T.surface2, color:selectedMetric===k?"#fff":T.text3 }}>
                      {monthly[k]?.metric_label}
                    </button>
                  ))}
                </div>
              </div>
              {selectedMetric && monthly[selectedMetric] && (
                <div>
                  {/* Bar chart */}
                  <div style={{ display:"flex", alignItems:"flex-end", gap:4, height:120, marginBottom:8 }}>
                    {MONTH_NAMES.map((m, i) => {
                      const mv = monthly[selectedMetric]?.monthly?.find(r=>r.month===i+1);
                      const v = mv?.actual ?? null;
                      const maxV = Math.max(...(monthly[selectedMetric]?.monthly?.map(r=>Math.abs(r.actual||0))||[1]),1);
                      const pct = v != null ? Math.abs(v)/maxV : 0;
                      const h = Math.max(2, pct * 112);
                      const isCur = i+1 === curMonth;
                      const isFuture = i+1 > curMonth;
                      return (
                        <div key={m} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
                          {v != null && <div style={{ fontSize:8, color:T.text3, fontWeight:isCur?700:400 }}>{fmt$(v,true)}</div>}
                          <div style={{ width:"100%", height:`${h}px`, borderRadius:"3px 3px 0 0",
                            background: isFuture ? T.surface3 : v<0 ? "#ef4444" : isCur ? T.accent : T.accent+"80",
                            transition:"height 0.4s" }} />
                          <div style={{ fontSize:8, color:isCur?T.accent:T.text3, fontWeight:isCur?700:400 }}>{m}</div>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:T.text3 }}>
                    <span>YTD: <strong style={{ color:T.text }}>{fmt$(monthly[selectedMetric]?.monthly?.filter(r=>r.month<=curMonth).reduce((s,r)=>s+(r.actual||0),0))}</strong></span>
                    <span style={{ color:T.text3 }}>Click "AI Chat" to ask questions about this data</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Monthly tab */}
        {activeTab === "monthly" && hasData && (
          <div>
            <table style={{ width:"100%", borderCollapse:"collapse" }}>
              <thead>
                <tr style={{ borderBottom:`2px solid ${T.border}` }}>
                  <th style={{ padding:"8px 12px", textAlign:"left", fontSize:11, fontWeight:700, color:T.text3, textTransform:"uppercase" }}>Metric</th>
                  {MONTH_NAMES.slice(0, curMonth).map(m => (
                    <th key={m} style={{ padding:"8px 8px", textAlign:"right", fontSize:11, fontWeight:700, color:T.text3, textTransform:"uppercase" }}>{m}</th>
                  ))}
                  <th style={{ padding:"8px 12px", textAlign:"right", fontSize:11, fontWeight:700, color:T.accent, textTransform:"uppercase" }}>YTD</th>
                  <th style={{ padding:"8px 12px", textAlign:"center", fontSize:10, fontWeight:700, color:T.text3, textTransform:"uppercase" }}>Trend</th>
                </tr>
              </thead>
              <tbody>
                {Object.values(monthly).map((m, idx) => {
                  const ytd = m.monthly?.filter(r=>r.month<=curMonth).reduce((s,r)=>s+(r.actual||0),0);
                  const sparkVals = m.monthly?.filter(r=>r.month<=curMonth).map(r=>({value:r.actual||0})) || [];
                  return (
                    <tr key={m.metric_key} style={{ borderBottom:`1px solid ${T.border}`, background:idx%2===0?"transparent":T.surface2+"40" }}>
                      <td style={{ padding:"10px 12px", fontSize:13, fontWeight:600 }}>{m.metric_label}</td>
                      {MONTH_NAMES.slice(0, curMonth).map((mn, i) => {
                        const row = m.monthly?.find(r=>r.month===i+1);
                        const v = row?.actual;
                        const prev = m.monthly?.find(r=>r.month===i)?.actual;
                        const change = prev && v ? ((v-prev)/Math.abs(prev))*100 : null;
                        return (
                          <td key={mn} style={{ padding:"10px 8px", textAlign:"right", fontSize:12 }}>
                            <div style={{ fontWeight: i+1===curMonth ? 700 : 400, color: v<0?"#ef4444":T.text }}>{fmt$(v)}</div>
                            {change!=null && <div style={{ fontSize:9, color:change>0?"#22c55e":"#ef4444" }}>{change>0?"▲":"▼"}{Math.abs(change).toFixed(0)}%</div>}
                          </td>
                        );
                      })}
                      <td style={{ padding:"10px 12px", textAlign:"right", fontSize:13, fontWeight:700, color:ytd<0?"#ef4444":"#22c55e" }}>{fmt$(ytd)}</td>
                      <td style={{ padding:"10px 12px", width:80 }}>
                        <LineChart data={sparkVals} color={ytd<0?"#ef4444":T.accent} height={32} showArea={false} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Daily tab */}
        {activeTab === "daily" && (
          <div>
            {Object.keys(daily).length === 0 ? (
              <div style={{ textAlign:"center", padding:"40px 0", color:T.text3 }}>
                <div style={{ fontSize:32, marginBottom:8 }}>📅</div>
                <div style={{ fontSize:14, fontWeight:600, marginBottom:4 }}>No daily data yet</div>
                <div style={{ fontSize:12, marginBottom:16 }}>Click "↻ Sync Sheet" to import daily data from the Google Sheet</div>
                <button onClick={syncSheet} style={{ padding:"8px 20px", fontSize:12, fontWeight:600, background:T.accent, color:"#fff", border:"none", borderRadius:7, cursor:"pointer" }}>Sync Now</button>
              </div>
            ) : (
              <div>
                <div style={{ display:"flex", gap:8, marginBottom:20, flexWrap:"wrap" }}>
                  {/* Group metrics by category */}
                  {Object.entries(
                    Object.keys(daily).reduce((groups, k) => {
                      const g = (METRIC_META[k]?.group) || "Other";
                      if (!groups[g]) groups[g] = [];
                      groups[g].push(k);
                      return groups;
                    }, {})
                  ).map(([group, keys]) => (
                    <div key={group} style={{ display:"flex", flexWrap:"wrap", gap:4, alignItems:"center" }}>
                      <span style={{ fontSize:10, fontWeight:700, color:T.text3, textTransform:"uppercase", letterSpacing:0.5, marginRight:2 }}>{group}</span>
                      {keys.map(k => (
                        <button key={k} onClick={()=>setSelectedMetric(k)} style={{ padding:"4px 10px", fontSize:11, fontWeight:600, borderRadius:5, border:"none", cursor:"pointer", background:selectedMetric===k?(METRIC_META[k]?.color||T.accent):T.surface2, color:selectedMetric===k?"#fff":T.text3 }}>
                          {METRIC_META[k]?.label || daily[k]?.[0]?.metric_label || k}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
                {selectedMetric && daily[selectedMetric] && (
                  <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, padding:20 }}>
                    <div style={{ fontSize:14, fontWeight:700, marginBottom:16 }}>
                      {daily[selectedMetric]?.[0]?.metric_label} — Daily
                      <span style={{ fontSize:11, color:T.text3, marginLeft:8, fontWeight:400 }}>{daily[selectedMetric]?.length} days</span>
                    </div>
                    <div style={{ height:120, marginBottom:12 }}>
                      <BarChart data={[...daily[selectedMetric]].reverse()} color={METRIC_META[selectedMetric]?.color||T.accent} height={120} />
                    </div>
                    {/* Recent rows table */}
                    <table style={{ width:"100%", borderCollapse:"collapse" }}>
                      <thead><tr style={{ borderBottom:`1px solid ${T.border}` }}>
                        <th style={{ padding:"6px 8px", textAlign:"left", fontSize:10, fontWeight:700, color:T.text3, textTransform:"uppercase" }}>Date</th>
                        <th style={{ padding:"6px 8px", textAlign:"right", fontSize:10, fontWeight:700, color:T.text3, textTransform:"uppercase" }}>Value</th>
                        <th style={{ padding:"6px 8px", textAlign:"right", fontSize:10, fontWeight:700, color:T.text3, textTransform:"uppercase" }}>vs Prev Day</th>
                      </tr></thead>
                      <tbody>
                        {daily[selectedMetric]?.slice(0,20).map((row, i, arr) => {
                          const prev = arr[i+1]?.value;
                          const change = prev ? ((row.value-prev)/Math.abs(prev))*100 : null;
                          return (
                            <tr key={row.date} style={{ borderBottom:`1px solid ${T.border}` }}>
                              <td style={{ padding:"6px 8px", fontSize:12, color:T.text2 }}>{row.date}</td>
                              <td style={{ padding:"6px 8px", textAlign:"right", fontSize:12, fontWeight:500, color:row.value<0?"#ef4444":T.text }}>{fmtVal(row.value, METRIC_META[selectedMetric]?.unit||"$")}</td>
                              <td style={{ padding:"6px 8px", textAlign:"right", fontSize:11, color:change>0?"#22c55e":change<0?"#ef4444":T.text3 }}>{change!=null?`${change>0?"▲":"▼"}${Math.abs(change).toFixed(1)}%`:"—"}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* AI Chat tab */}
        {activeTab === "chat" && (
          <div style={{ display:"flex", flexDirection:"column", height:"calc(100vh - 200px)", minHeight:400 }}>
            {/* Messages */}
            <div style={{ flex:1, overflow:"auto", marginBottom:16 }}>
              {messages.length === 0 && (
                <div style={{ padding:"20px 0" }}>
                  <div style={{ fontSize:22, fontWeight:700, marginBottom:8 }}>Ask me anything about your data 🤖</div>
                  <div style={{ fontSize:13, color:T.text3, marginBottom:24, lineHeight:1.7 }}>
                    I have access to your Google Sheets scoreboard data. I can analyze trends, calculate metrics, compare periods, and generate charts.
                    {!hasData && <span style={{ color:"#f97316" }}> No data synced yet — click "↻ Sync Sheet" first.</span>}
                  </div>
                  <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
                    {PROMPTS.map(p => (
                      <button key={p} onClick={()=>sendMessage(p)}
                        style={{ padding:"7px 14px", fontSize:12, background:T.surface2, color:T.text2, border:`1px solid ${T.border}`, borderRadius:20, cursor:"pointer", transition:"all 0.12s" }}
                        onMouseEnter={e=>{e.currentTarget.style.background=T.accentDim;e.currentTarget.style.borderColor=T.accent+"60";e.currentTarget.style.color=T.accent;}}
                        onMouseLeave={e=>{e.currentTarget.style.background=T.surface2;e.currentTarget.style.borderColor=T.border;e.currentTarget.style.color=T.text2;}}>
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((m, i) => <ChatMessage key={i} msg={m} />)}
              {aiLoading && (
                <div style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
                  <div style={{ width:28, height:28, borderRadius:14, background:"#22c55e20", border:"1px solid #22c55e50", display:"flex", alignItems:"center", justifyContent:"center", fontSize:12, fontWeight:700, color:"#22c55e" }}>AI</div>
                  <div style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:"2px 12px 12px 12px", padding:"12px 16px" }}>
                    <div style={{ display:"flex", gap:4 }}>
                      {[0,1,2].map(i => <div key={i} style={{ width:6, height:6, borderRadius:"50%", background:T.accent, animation:`bounce 1s ease-in-out ${i*0.15}s infinite` }} />)}
                    </div>
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div style={{ display:"flex", gap:10, flexShrink:0, borderTop:`1px solid ${T.border}`, paddingTop:16 }}>
              <input
                ref={inputRef}
                value={input}
                onChange={e=>setInput(e.target.value)}
                onKeyDown={e=>{ if(e.key==="Enter"&&!e.shiftKey&&input.trim()){ e.preventDefault(); sendMessage(input); }}}
                placeholder="Ask about your data... e.g. 'Show me revenue by month' or 'What's our ROAS trend?'"
                style={{ flex:1, padding:"10px 16px", fontSize:13, background:T.surface2, border:`1px solid ${T.border}`, borderRadius:10, color:T.text, outline:"none", fontFamily:"inherit" }}
              />
              <button onClick={()=>sendMessage(input)} disabled={aiLoading||!input.trim()}
                style={{ padding:"10px 20px", fontSize:13, fontWeight:700, background:T.accent, color:"#fff", border:"none", borderRadius:10, cursor:"pointer", opacity:aiLoading||!input.trim()?0.5:1 }}>
                Send
              </button>
            </div>
          </div>
        )}
      </div>

      <style>{`
        @keyframes bounce { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-4px)} }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>
    </div>
  );
}
