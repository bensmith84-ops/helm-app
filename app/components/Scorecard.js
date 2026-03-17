"use client";
import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";
import { useAuth } from "../lib/auth";

const AVATAR_COLORS = ["#3b82f6","#a855f7","#ec4899","#06b6d4","#f97316","#22c55e","#84cc16","#ef4444"];
const acol = (uid) => uid ? AVATAR_COLORS[uid.charCodeAt(uid.length-1)%AVATAR_COLORS.length] : T.text3;

const fmt = (v, unit) => {
  if (v == null) return "—";
  if (unit === "$") {
    const abs = Math.abs(v);
    const s = v < 0 ? "-" : "";
    if (abs >= 1_000_000) return s + "$" + (abs/1e6).toFixed(1) + "M";
    if (abs >= 10_000)    return s + "$" + Math.round(abs).toLocaleString();
    if (abs >= 1_000)     return s + "$" + (abs/1e3).toFixed(1) + "K";
    // Under $1K: show decimals if the value has them
    const hasDecimals = abs % 1 !== 0;
    return s + "$" + (hasDecimals ? Number(v).toFixed(2) : Number(v).toFixed(0));
  }
  if (unit === "%") return Number(v).toFixed(1) + "%";
  if (unit === "bool") return v ? "✓" : "✗";
  return Number(v).toLocaleString();
};

const getWeekStart = (d = new Date()) => {
  const dt = new Date(d);
  const day = dt.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday = 1
  dt.setDate(dt.getDate() + diff);
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
};

const weeksBack = (n) => {
  const weeks = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i * 7);
    weeks.push(getWeekStart(d));
  }
  return [...new Set(weeks)];
};

const WEEKS = weeksBack(13); // 13 weeks = rolling quarter
const SHORT_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function InlineEntry({ value, onSave, unit, onComment, hasComment }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value != null ? String(value) : "");
  const inputRef = useRef(null);

  useEffect(() => { setVal(value != null ? String(value) : ""); }, [value]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const save = () => {
    const parsed = val === "" ? null : unit === "bool" ? (val.toLowerCase() === "y" || val === "1" || val.toLowerCase() === "true" ? 1 : 0) : parseFloat(val);
    onSave(isNaN(parsed) ? null : parsed);
    setEditing(false);
  };

  if (unit === "bool") {
    return (
      <div onClick={() => onSave(value ? 0 : 1)} style={{ cursor:"pointer", fontSize:16, textAlign:"center", userSelect:"none" }}>
        {value ? "✅" : "⬜"}
      </div>
    );
  }

  if (editing) {
    return (
      <input ref={inputRef} value={val} onChange={e => setVal(e.target.value)}
        onBlur={save} onKeyDown={e => { if (e.key==="Enter") save(); if (e.key==="Escape") setEditing(false); }}
        style={{ width:"100%", fontSize:12, background:T.surface, border:`1px solid ${T.accent}`,
          borderRadius:4, padding:"2px 4px", color:T.text, outline:"none", textAlign:"center" }} />
    );
  }

  return (
    <div onClick={() => { setVal(value != null ? String(value) : ""); setEditing(true); }}
      onContextMenu={e => { if (onComment) { e.preventDefault(); onComment(); } }}
      style={{ cursor:"pointer", fontSize:12, textAlign:"center", color: value != null ? T.text : T.text3,
        fontWeight: value != null ? 600 : 400, padding:"2px 4px", borderRadius:4,
        background:"transparent", transition:"background 0.1s",
        minHeight:20, display:"flex", alignItems:"center", justifyContent:"center" }}
      onMouseEnter={e => e.currentTarget.style.background = T.surface3}
      onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
      {value != null ? fmt(value, unit) : <span style={{ color:T.border, fontSize:10 }}>—</span>}
    </div>
  );
}

function RagDot({ value, goal, unit, direction }) {
  if (value == null || goal == null) return <div style={{ width:10, height:10, borderRadius:"50%", background:T.border }} />;
  const isBelow = direction === "below";
  const onTarget = unit === "bool" ? value >= 1 : isBelow ? value <= goal : value >= goal;
  const ratio = unit === "bool" ? (value ? 1 : 0) : isBelow ? (goal !== 0 ? goal / value : 1) : (goal !== 0 ? value / goal : 1);
  const color = onTarget ? "#22c55e" : ratio >= 0.8 ? "#eab308" : "#ef4444";
  return <div style={{ width:10, height:10, borderRadius:"50%", background:color, flexShrink:0 }} />;
}

function SparkTrend({ values }) {
  const nums = values.filter(v => v != null);
  if (nums.length < 2) return <div style={{ width:60, height:20 }} />;
  const min = Math.min(...nums), max = Math.max(...nums);
  const range = max - min || 1;
  const w = 60, h = 20;
  const pts = values.map((v, i) => v != null
    ? `${(i / (values.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}` : null
  ).filter(Boolean).join(" ");
  const last = nums[nums.length - 1], prev = nums[nums.length - 2];
  const trending = last >= prev ? "#22c55e" : "#ef4444";
  return (
    <svg width={w} height={h}>
      <polyline points={pts} fill="none" stroke={trending} strokeWidth={1.5} strokeLinejoin="round" />
    </svg>
  );
}

export default function ScorecardView() {
  const { user, profile } = useAuth();
  const [metrics, setMetrics] = useState([]);
  const [entries, setEntries] = useState({}); // { metricId: { weekStart: value } }
  const [comments, setComments] = useState({}); // { metricId: { weekStart: { comment, comment_by, comment_at } } }
  const [goalPeriods, setGoalPeriods] = useState({}); // { metricId: [{ goal, start_date, end_date }] }
  const [editingGoals, setEditingGoals] = useState(null); // metric id or null
  const [commentModal, setCommentModal] = useState(null); // { metricId, weekStart, existing, isOwner }
  const [profiles, setProfiles] = useState({});
  const [keyResults, setKeyResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddMetric, setShowAddMetric] = useState(false);
  const [newMetric, setNewMetric] = useState({ name:"", unit:"number", goal:"", frequency:"weekly", description:"", linked_kr_id:"", auto_source:"", auto_agg:"sum", auto_weight_key:"", target_direction:"above" });
  const [saving, setSaving] = useState(false);
  const [orgId, setOrgId] = useState(null);
  const [autoCalcRunning, setAutoCalcRunning] = useState(false);

  const DAILY_KEYS = ["revenue","amazon_revenue","ad_spend","cpa","dtc_cac","x_cac","gwp_cpa","nc_aov","net_dollars","total_orders","new_orders","amazon_total_orders","units_shipped","dtc_new_customers","amz_new_customers","traffic","blended_cvr","new_gwp_subs","new_shopify_subs","daily_cancels","net_daily_subs","amz_net_subs","sub_rate","upsell_take_rate","comp_yago","opex_pct_rev"];
  const AGG_METHODS = [
    { value: "sum", label: "Sum", desc: "Total for the week (e.g., revenue, orders)" },
    { value: "average", label: "Average", desc: "Simple average of daily values" },
    { value: "weighted_average", label: "Weighted Average", desc: "Weighted by another metric (e.g., CPA weighted by purchases)" },
    { value: "last", label: "Last Value", desc: "Use the last day's value for the week" },
  ];

  useEffect(() => {
    (async () => {
      const [{ data: met }, { data: prof }, { data: mem }, { data: krs }] = await Promise.all([
        supabase.from("scorecard_metrics").select("*").eq("active", true).order("sort_order").order("created_at"),
        supabase.from("profiles").select("id,display_name"),
        supabase.from("org_memberships").select("org_id").eq("user_id", (await supabase.auth.getUser()).data.user?.id).maybeSingle(),
        supabase.from("key_results").select("id,title,current_value,target_value,unit,progress").is("deleted_at", null).order("sort_order"),
      ]);
      const profMap = {};
      (prof || []).forEach(u => { profMap[u.id] = u; });
      setProfiles(profMap);
      setOrgId(mem?.org_id);
      setMetrics(met || []);
      setKeyResults(krs || []);

      if (met?.length) {
        const [{ data: ent }, { data: gp }] = await Promise.all([
          supabase.from("scorecard_entries").select("*").in("metric_id", met.map(m => m.id)).in("week_start", WEEKS),
          supabase.from("scorecard_goal_periods").select("*").in("metric_id", met.map(m => m.id)).order("start_date"),
        ]);
        const map = {};
        const cMap = {};
        (ent || []).forEach(e => {
          if (!map[e.metric_id]) map[e.metric_id] = {};
          map[e.metric_id][e.week_start] = e.value != null ? Number(e.value) : null;
          if (e.comment) {
            if (!cMap[e.metric_id]) cMap[e.metric_id] = {};
            cMap[e.metric_id][e.week_start] = { comment: e.comment, comment_by: e.comment_by, comment_at: e.comment_at };
          }
        });
        setEntries(map);
        setComments(cMap);
        const gpMap = {};
        (gp || []).forEach(g => {
          if (!gpMap[g.metric_id]) gpMap[g.metric_id] = [];
          gpMap[g.metric_id].push(g);
        });
        setGoalPeriods(gpMap);
      }
      setLoading(false);
    })();
  }, []);

  // Get the applicable goal for a given date, checking goal periods first, then falling back to metric.goal
  const getGoalForDate = (metric, dateStr) => {
    const periods = goalPeriods[metric.id];
    if (periods?.length) {
      // Find the period that covers this date (last matching one wins)
      for (let i = periods.length - 1; i >= 0; i--) {
        const p = periods[i];
        if (dateStr >= p.start_date && (!p.end_date || dateStr <= p.end_date)) {
          return Number(p.goal);
        }
      }
    }
    return metric.goal != null ? Number(metric.goal) : null;
  };

  const saveEntry = async (metricId, weekStart, value) => {
    const numVal = value != null ? Number(value) : null;
    setEntries(p => ({
      ...p,
      [metricId]: { ...(p[metricId]||{}), [weekStart]: numVal }
    }));
    const { error } = await supabase.from("scorecard_entries").upsert(
      { metric_id: metricId, week_start: weekStart, value: numVal, entered_by: user?.id || null },
      { onConflict: "metric_id,week_start" }
    );
    if (error) console.error("[Scorecard] saveEntry error:", error);
  };

  const saveComment = async (metricId, weekStart, commentText) => {
    const trimmed = commentText?.trim() || null;
    setComments(p => {
      const next = { ...p };
      if (!next[metricId]) next[metricId] = {};
      if (trimmed) {
        next[metricId] = { ...next[metricId], [weekStart]: { comment: trimmed, comment_by: user?.id, comment_at: new Date().toISOString() } };
      } else {
        next[metricId] = { ...next[metricId] };
        delete next[metricId][weekStart];
      }
      return next;
    });
    const { error } = await supabase.from("scorecard_entries").upsert(
      { metric_id: metricId, week_start: weekStart, comment: trimmed, comment_by: trimmed ? user?.id : null, comment_at: trimmed ? new Date().toISOString() : null },
      { onConflict: "metric_id,week_start" }
    );
    if (error) console.error("[Scorecard] saveComment error:", error);
  };

  const addMetric = async () => {
    if (!newMetric.name.trim()) return;
    setSaving(true);
    const { data } = await supabase.from("scorecard_metrics").insert({
      name: newMetric.name, unit: newMetric.unit,
      goal: newMetric.goal ? parseFloat(newMetric.goal) : null,
      frequency: newMetric.frequency, description: newMetric.description,
      linked_kr_id: newMetric.linked_kr_id || null,
      target_direction: newMetric.target_direction || "above",
      auto_source: newMetric.auto_source || null,
      auto_agg: newMetric.auto_source ? (newMetric.auto_agg || "sum") : null,
      auto_weight_key: newMetric.auto_agg === "weighted_average" ? (newMetric.auto_weight_key || null) : null,
      org_id: orgId, owner_id: user.id, sort_order: metrics.length,
    }).select().single();
    if (data) { setMetrics(p => [...p, data]); setEntries(p => ({...p, [data.id]: {}})); }
    setNewMetric({ name:"", unit:"number", goal:"", frequency:"weekly", description:"", linked_kr_id:"", auto_source:"", auto_agg:"sum", auto_weight_key:"", target_direction:"above" });
    setShowAddMetric(false);
    setSaving(false);
    // Auto-calc if this metric has a source
    if (data?.auto_source) runAutoCalc();
  };

  const runAutoCalc = async () => {
    setAutoCalcRunning(true);
    try {
      const res = await fetch("https://upbjdmnykheubxkuknuj.supabase.co/functions/v1/scorecard-auto-calc", {
        method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwYmpkbW55a2hldWJ4a3VrbnVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNDI3OTcsImV4cCI6MjA4NzcxODc5N30.pvTTkiZWNDPuo-Fdzm54uy8w1mlx0AjB5jtFm3MeGq4" },
      });
      const result = await res.json();
      console.log("[Scorecard] Auto-calc result:", result);
      // Reload metrics (in case auto_source was configured externally)
      const { data: freshMetrics } = await supabase.from("scorecard_metrics").select("*").eq("active", true).order("sort_order");
      if (freshMetrics) setMetrics(freshMetrics);
      // Reload entries — match original load format exactly
      const metricIds = (freshMetrics || metrics).map(m => m.id);
      const { data: allEntries } = await supabase.from("scorecard_entries").select("*")
        .in("metric_id", metricIds).in("week_start", WEEKS);
      const eMap = {};
      const cMap = {};
      (freshMetrics || metrics).forEach(m => { eMap[m.id] = {}; });
      (allEntries || []).forEach(e => {
        if (!eMap[e.metric_id]) eMap[e.metric_id] = {};
        eMap[e.metric_id][e.week_start] = e.value != null ? Number(e.value) : null;
        if (e.comment) {
          if (!cMap[e.metric_id]) cMap[e.metric_id] = {};
          cMap[e.metric_id][e.week_start] = { comment: e.comment, comment_by: e.comment_by, comment_at: e.comment_at };
        }
      });
      setEntries(eMap);
      setComments(cMap);
      if (result.entries_upserted > 0) alert(`⚡ Auto-calculated ${result.entries_upserted} entries for ${result.metrics_processed} metric(s)`);
      else alert(result.message || `Processed ${result.metrics_processed || 0} metrics, ${result.entries_upserted || 0} entries`);
    } catch (e) { console.error("Auto-calc failed:", e); alert("Auto-calc error: " + e.message); }
    setAutoCalcRunning(false);
  };

  const updateMetricAutoSource = async (metricId, field, value) => {
    await supabase.from("scorecard_metrics").update({ [field]: value || null }).eq("id", metricId);
    setMetrics(p => p.map(m => m.id === metricId ? { ...m, [field]: value || null } : m));
  };

  const deleteMetric = async (id) => {
    if (!confirm("Delete this metric and all its history?")) return;
    await supabase.from("scorecard_metrics").update({ active: false }).eq("id", id);
    setMetrics(p => p.filter(m => m.id !== id));
  };

  const thisWeek = WEEKS[WEEKS.length - 1];
  const ini = uid => { const u = profiles[uid]; return u?.display_name ? u.display_name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase() : "?"; };

  if (loading) return (
    <div style={{ display:"flex", height:"100%", alignItems:"center", justifyContent:"center", color:T.text3, fontSize:13 }}>Loading scorecard…</div>
  );

  // Summary stats
  const metricSummary = metrics.map(m => {
    const vals = WEEKS.map(w => entries[m.id]?.[w] ?? null);
    const latest = vals.filter(v=>v!=null).slice(-1)[0];
    const latestWeek = WEEKS.filter((w, i) => vals[i] != null).slice(-1)[0];
    const currentGoal = latestWeek ? getGoalForDate(m, latestWeek) : getGoalForDate(m, WEEKS[WEEKS.length - 1]);
    const isBelow = m.target_direction === "below";
    const hits = WEEKS.filter((w, i) => {
      const v = vals[i];
      if (v == null) return false;
      const g = getGoalForDate(m, w);
      if (g == null) return false;
      return m.unit === "bool" ? v >= 1 : isBelow ? v <= g : v >= g;
    }).length;
    const total = vals.filter(v=>v!=null).length;
    return { ...m, latest, vals, hits, total, currentGoal };
  });

  const onTrack = metricSummary.filter(m => m.currentGoal!=null && m.latest!=null && (m.unit==="bool"?m.latest>=1: m.target_direction==="below" ? m.latest<=m.currentGoal : m.latest>=m.currentGoal)).length;
  const offTrack = metricSummary.filter(m => m.currentGoal!=null && m.latest!=null && (m.unit==="bool"?m.latest<1: m.target_direction==="below" ? m.latest>m.currentGoal : m.latest<m.currentGoal)).length;
  const noData = metricSummary.filter(m => m.latest==null).length;

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>
      {/* Header */}
      <div style={{ padding:"20px 28px 0", borderBottom:`1px solid ${T.border}`, background:T.surface, flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
          <div>
            <h2 style={{ fontSize:20, fontWeight:700, marginBottom:2 }}>Weekly Scorecard</h2>
            <div style={{ fontSize:12, color:T.text3 }}>Rolling 13-week view · Week of {new Date(thisWeek+"T12:00:00").toLocaleDateString("en-US",{month:"long",day:"numeric"})}</div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            {/* Summary pills */}
            <div style={{ display:"flex", gap:8 }}>
              {[["#22c55e",onTrack,"On Track"],["#ef4444",offTrack,"Off Track"],["#8b93a8",noData,"No Data"]].map(([c,v,l])=>(
                <div key={l} style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 10px", borderRadius:6, background:c+"18", border:`1px solid ${c}40` }}>
                  <div style={{ width:8, height:8, borderRadius:"50%", background:c }} />
                  <span style={{ fontSize:11, fontWeight:700, color:c }}>{v}</span>
                  <span style={{ fontSize:11, color:T.text3 }}>{l}</span>
                </div>
              ))}
            </div>
            <button onClick={() => {
              // Export scorecard as CSV
              const header = ["Metric","Goal","Unit","Hit Rate", ...WEEKS].join(",");
              const rows = metricSummary.map(m => [
                `"${m.name}"`, m.goal ?? "", m.unit,
                m.total > 0 ? `${Math.round((m.hits/m.total)*100)}%` : "—",
                ...WEEKS.map(w => entries[m.id]?.[w] ?? "")
              ].join(","));
              const csv = [header, ...rows].join("\n");
              const blob = new Blob([csv], { type: "text/csv" });
              const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "scorecard.csv"; a.click();
            }} style={{ padding:"7px 14px", fontSize:12, fontWeight:600, background:T.surface2, color:T.text2, border:`1px solid ${T.border}`, borderRadius:7, cursor:"pointer" }}>
              ↓ Export
            </button>
            {metrics.some(m => m.auto_source) && (
              <button onClick={runAutoCalc} disabled={autoCalcRunning}
                style={{ padding:"7px 14px", fontSize:12, fontWeight:600, background:T.surface2, color:T.accent, border:`1px solid ${T.accent}40`, borderRadius:7, cursor:autoCalcRunning?"wait":"pointer", opacity:autoCalcRunning?0.6:1 }}>
                {autoCalcRunning ? "Calculating…" : "⚡ Auto-calc"}
              </button>
            )}
            <button onClick={() => setShowAddMetric(true)}
              style={{ padding:"7px 14px", fontSize:12, fontWeight:600, background:T.accent, color:"#fff", border:"none", borderRadius:7, cursor:"pointer" }}>
              + Add Metric
            </button>
          </div>
        </div>
      </div>

      {/* Add Metric Panel */}
      {showAddMetric && (
        <div style={{ padding:"16px 28px", background:T.surface2, borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
          <div style={{ display:"grid", gridTemplateColumns:"2fr 1fr 1fr 1fr 2fr 2fr auto", gap:10, alignItems:"end" }}>
            {[
              { label:"Metric Name *", key:"name", placeholder:"e.g. Weekly Revenue" },
              { label:"Unit", key:"unit", type:"select", options:["number","$","%","bool"] },
              { label:"Weekly Goal", key:"goal", placeholder:"e.g. 250000" },
              { label:"On Track When", key:"target_direction", type:"select", options:["above","below"] },
              { label:"Frequency", key:"frequency", type:"select", options:["daily","weekly","monthly"] },
              { label:"Description", key:"description", placeholder:"Optional description" },
            ].map(f => (
              <div key={f.key}>
                <div style={{ fontSize:11, color:T.text3, marginBottom:4, fontWeight:600 }}>{f.label}</div>
                {f.type==="select" ? (
                  <select value={newMetric[f.key]} onChange={e=>setNewMetric(p=>({...p,[f.key]:e.target.value}))}
                    style={{ width:"100%", fontSize:12, background:T.surface, border:`1px solid ${T.border}`, borderRadius:6, padding:"7px 8px", color:T.text, outline:"none" }}>
                    {f.options.map(o=><option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input value={newMetric[f.key]} onChange={e=>setNewMetric(p=>({...p,[f.key]:e.target.value}))}
                    placeholder={f.placeholder}
                    style={{ width:"100%", fontSize:12, background:T.surface, border:`1px solid ${T.border}`, borderRadius:6, padding:"7px 8px", color:T.text, outline:"none", boxSizing:"border-box" }} />
                )}
              </div>
            ))}
            <div>
              <div style={{ fontSize:11, color:T.text3, marginBottom:4, fontWeight:600 }}>Link to KR</div>
              <select value={newMetric.linked_kr_id} onChange={e=>setNewMetric(p=>({...p,linked_kr_id:e.target.value}))}
                style={{ width:"100%", fontSize:12, background:T.surface, border:`1px solid ${T.border}`, borderRadius:6, padding:"7px 8px", color:T.text, outline:"none" }}>
                <option value="">None</option>
                {keyResults.map(kr=><option key={kr.id} value={kr.id}>{kr.title}</option>)}
              </select>
            </div>
          </div>
          {/* Auto-calculate from Scoreboard */}
          <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 8, border: `1px solid ${newMetric.auto_source ? T.accent + "40" : T.border}`, background: newMetric.auto_source ? T.accent + "08" : "transparent" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: newMetric.auto_source ? 10 : 0 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: newMetric.auto_source ? T.accent : T.text2 }}>⚡ Auto-calculate from Scoreboard</span>
              <select value={newMetric.auto_source} onChange={e => setNewMetric(p => ({ ...p, auto_source: e.target.value }))}
                style={{ fontSize: 11, padding: "4px 8px", borderRadius: 5, border: `1px solid ${T.border}`, background: T.surface, color: T.text, cursor: "pointer" }}>
                <option value="">Manual entry</option>
                {DAILY_KEYS.map(k => <option key={k} value={k}>{k.replace(/_/g, " ")}</option>)}
              </select>
            </div>
            {newMetric.auto_source && (
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 10, color: T.text3, marginBottom: 3, fontWeight: 600 }}>Aggregation</div>
                  <select value={newMetric.auto_agg} onChange={e => setNewMetric(p => ({ ...p, auto_agg: e.target.value }))}
                    style={{ fontSize: 11, padding: "4px 8px", borderRadius: 5, border: `1px solid ${T.border}`, background: T.surface, color: T.text, cursor: "pointer" }}>
                    {AGG_METHODS.map(a => <option key={a.value} value={a.value}>{a.label}</option>)}
                  </select>
                </div>
                {newMetric.auto_agg === "weighted_average" && (
                  <div>
                    <div style={{ fontSize: 10, color: T.text3, marginBottom: 3, fontWeight: 600 }}>Weight by</div>
                    <select value={newMetric.auto_weight_key} onChange={e => setNewMetric(p => ({ ...p, auto_weight_key: e.target.value }))}
                      style={{ fontSize: 11, padding: "4px 8px", borderRadius: 5, border: `1px solid ${T.border}`, background: T.surface, color: T.text, cursor: "pointer" }}>
                      <option value="">Select weight metric…</option>
                      {DAILY_KEYS.filter(k => k !== newMetric.auto_source).map(k => <option key={k} value={k}>{k.replace(/_/g, " ")}</option>)}
                    </select>
                  </div>
                )}
                <div style={{ fontSize: 10, color: T.text3, marginTop: 12, flex: 1 }}>
                  {AGG_METHODS.find(a => a.value === newMetric.auto_agg)?.desc}
                </div>
              </div>
            )}
          </div>
          <div style={{ display:"flex", gap:6, justifyContent:"flex-end", marginTop:12 }}>
            <button onClick={() => setShowAddMetric(false)}
              style={{ padding:"7px 10px", fontSize:12, background:T.surface3, color:T.text2, border:`1px solid ${T.border}`, borderRadius:6, cursor:"pointer" }}>Cancel</button>
            <button onClick={addMetric} disabled={saving||!newMetric.name.trim()}
              style={{ padding:"7px 14px", fontSize:12, fontWeight:600, background:T.accent, color:"#fff", border:"none", borderRadius:6, cursor:"pointer", opacity:saving?0.6:1 }}>
              {saving?"Adding…":"Add"}
            </button>
          </div>
        </div>
      )}

      {/* Scorecard Table */}
      <div style={{ flex:1, overflow:"auto", padding:"16px 28px" }}>
        {metrics.length === 0 ? (
          <div style={{ textAlign:"center", padding:"60px 0", color:T.text3 }}>
            <div style={{ fontSize:40, marginBottom:12 }}>📊</div>
            <div style={{ fontSize:15, fontWeight:600, marginBottom:8 }}>No metrics yet</div>
            <div style={{ fontSize:13, marginBottom:20, color:T.text3 }}>Add your weekly scorecard metrics to track KPIs over time</div>
            <div style={{ fontSize:12, color:T.text3, maxWidth:400, margin:"0 auto", lineHeight:1.7 }}>
              Suggested metrics: Weekly Revenue, New Customers, Ad Spend, ROAS, Refund Rate, NPS, Team Utilization
            </div>
          </div>
        ) : (
          <table style={{ width:"100%", borderCollapse:"collapse", minWidth:900 }}>
            <thead>
              <tr style={{ borderBottom:`2px solid ${T.border}` }}>
                <th style={{ padding:"8px 12px", textAlign:"left", fontSize:11, fontWeight:700, color:T.text3, textTransform:"uppercase", letterSpacing:0.5, minWidth:200, position:"sticky", left:0, background:T.bg||T.surface }}>Metric</th>
                <th style={{ padding:"8px 8px", textAlign:"center", fontSize:11, fontWeight:700, color:T.text3, textTransform:"uppercase", letterSpacing:0.5, minWidth:55 }}>Goal</th>
                <th style={{ padding:"8px 8px", textAlign:"center", fontSize:11, fontWeight:700, color:T.text3, textTransform:"uppercase", letterSpacing:0.5, minWidth:60 }}>Trend</th>
                <th style={{ padding:"8px 8px", textAlign:"center", fontSize:11, fontWeight:700, color:T.text3, textTransform:"uppercase", letterSpacing:0.5, minWidth:50 }}>Hit%</th>
                {WEEKS.map(w => {
                  const d = new Date(w+"T12:00:00");
                  const isThis = w === thisWeek;
                  return (
                    <th key={w} style={{ padding:"6px 4px", textAlign:"center", fontSize:9, fontWeight:700, color:isThis?T.accent:T.text3, textTransform:"uppercase", minWidth:56, background: isThis?T.accentDim:"transparent", borderRadius:isThis?"6px 6px 0 0":"0" }}>
                      <div>{SHORT_MONTHS[d.getMonth()]}</div>
                      <div style={{ fontSize:11, fontWeight:isThis?800:600 }}>{d.getDate()}</div>
                    </th>
                  );
                })}
                <th style={{ width:28 }} />
              </tr>
            </thead>
            <tbody>
              {metricSummary.map((m, idx) => {
                const hitPct = m.total > 0 ? Math.round((m.hits/m.total)*100) : null;
                return (
                  <tr key={m.id} style={{ borderBottom:`1px solid ${T.border}`, background: idx%2===0?"transparent":T.surface2+"60" }}>
                    {/* Metric name + owner */}
                    <td style={{ padding:"10px 12px", position:"sticky", left:0, background: idx%2===0?T.bg||"transparent":T.surface2+"60" }}>
                      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                        <RagDot value={m.latest} goal={m.currentGoal} unit={m.unit} direction={m.target_direction} />
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:600, color:T.text }}>{m.name}{m.auto_source && <span title={`Auto: ${m.auto_agg}${m.auto_weight_key ? ` weighted by ${m.auto_weight_key}` : ""} from ${m.auto_source}`} style={{ fontSize:10, color:T.accent, marginLeft:5, fontWeight:700 }}>⚡</span>}</div>
                          {m.description && <div style={{ fontSize:10, color:T.text3 }}>{m.description}</div>}
                          {m.linked_kr_id && (() => {
                            const kr = keyResults.find(k => k.id === m.linked_kr_id);
                            if (!kr) return null;
                            const kpct = Math.round(Number(kr.progress || 0));
                            const kc = kpct>=70?"#22c55e":kpct>=40?"#eab308":"#ef4444";
                            return (
                              <div style={{ display:"flex", alignItems:"center", gap:4, marginTop:3 }}>
                                <span style={{ fontSize:9, padding:"1px 5px", borderRadius:3, background:`${T.accent}20`, color:T.accent, fontWeight:700 }}>KR</span>
                                <span style={{ fontSize:10, color:T.text3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", maxWidth:130 }}>{kr.title}</span>
                                <span style={{ fontSize:10, fontWeight:700, color:kc }}>{kpct}%</span>
                              </div>
                            );
                          })()}
                        </div>
                        {m.owner_id && (
                          <div style={{ width:22, height:22, borderRadius:11, background:acol(m.owner_id)+"25",
                            border:`1.5px solid ${acol(m.owner_id)}60`, display:"flex", alignItems:"center", justifyContent:"center",
                            fontSize:8, fontWeight:700, color:acol(m.owner_id), flexShrink:0 }}>
                            {ini(m.owner_id)}
                          </div>
                        )}
                      </div>
                    </td>
                    {/* Goal */}
                    <td style={{ padding:"10px 8px", textAlign:"center" }}>
                      <span style={{ fontSize:12, color:T.text2, fontWeight:500 }}>
                        {m.currentGoal != null ? <span onClick={e => { e.stopPropagation(); setEditingGoals(editingGoals === m.id ? null : m.id); }} style={{ cursor: "pointer" }} title="Click to manage goal periods">{fmt(m.currentGoal, m.unit)}</span> : <span onClick={e => { e.stopPropagation(); setEditingGoals(m.id); }} style={{ cursor: "pointer" }} title="Set goal">—</span>}
                      </span>
                    </td>
                    {/* Sparkline */}
                    <td style={{ padding:"10px 8px", textAlign:"center" }}>
                      <div style={{ display:"flex", justifyContent:"center" }}>
                        <SparkTrend values={m.vals} />
                      </div>
                    </td>
                    {/* Hit % */}
                    <td style={{ padding:"10px 8px", textAlign:"center" }}>
                      {hitPct != null ? (
                        <span style={{ fontSize:11, fontWeight:700,
                          color: hitPct>=80?"#22c55e":hitPct>=60?"#eab308":"#ef4444" }}>
                          {hitPct}%
                        </span>
                      ) : <span style={{ color:T.border, fontSize:11 }}>—</span>}
                    </td>
                    {/* Weekly cells */}
                    {WEEKS.map(w => {
                      const isThis = w === thisWeek;
                      const v = entries[m.id]?.[w] ?? null;
                      const weekGoal = getGoalForDate(m, w);
                      const onTarget = v!=null && weekGoal!=null && (m.unit==="bool"?v>=1: m.target_direction==="below" ? v<=weekGoal : v>=weekGoal);
                      const cm = comments[m.id]?.[w];
                      const isMyComment = cm?.comment_by === user?.id;
                      return (
                        <td key={w} style={{ padding:"6px 4px", background: isThis?T.accentDim+"80":"transparent", position:"relative" }}>
                          <div style={{ position:"relative" }}>
                            {v!=null && weekGoal!=null && (
                              <div style={{ position:"absolute", top:0, right: cm ? 14 : 2, width:5, height:5, borderRadius:"50%",
                                background: onTarget?"#22c55e":"#ef4444", zIndex:1 }} />
                            )}
                            {cm && (() => {
                              const cmAuthor = profiles[cm.comment_by]?.display_name || "Someone";
                              const cmTime = cm.comment_at ? new Date(cm.comment_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
                              return (
                              <div style={{ position:"absolute", top:-1, right:1, zIndex:2, cursor:"pointer", fontSize:10 }}
                                onClick={e => { e.stopPropagation(); setCommentModal({ metricId: m.id, weekStart: w, existing: cm.comment, isOwner: isMyComment }); }}>
                                <div style={{ position:"relative" }}
                                  onMouseEnter={e => { const tip = e.currentTarget.querySelector("[data-tip]"); if (tip) tip.style.display = "block"; }}
                                  onMouseLeave={e => { const tip = e.currentTarget.querySelector("[data-tip]"); if (tip) tip.style.display = "none"; }}>
                                  💬
                                  <div data-tip="1" style={{ display:"none", position:"absolute", bottom:"calc(100% + 6px)", right:-8, zIndex:100,
                                    minWidth:180, maxWidth:260, padding:"10px 12px", borderRadius:10,
                                    background:T.surface, border:`1px solid ${T.border}`, boxShadow:"0 8px 24px rgba(0,0,0,0.3)",
                                    pointerEvents:"none" }}>
                                    <div style={{ fontSize:11, color:T.text, lineHeight:1.5, marginBottom:6, wordBreak:"break-word" }}>{cm.comment}</div>
                                    <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:10, color:T.text3 }}>
                                      <span style={{ fontWeight:600 }}>{cmAuthor}</span>
                                      {cmTime && <><span>·</span><span>{cmTime}</span></>}
                                    </div>
                                    <div style={{ position:"absolute", bottom:-4, right:12, width:8, height:8, background:T.surface,
                                      border:`1px solid ${T.border}`, borderTop:"none", borderLeft:"none",
                                      transform:"rotate(45deg)" }} />
                                  </div>
                                </div>
                              </div>);
                            })()}
                            <InlineEntry value={v} unit={m.unit}
                              onSave={(val) => saveEntry(m.id, w, val)}
                              onComment={() => setCommentModal({ metricId: m.id, weekStart: w, existing: cm?.comment || "", isOwner: !cm || isMyComment })}
                              hasComment={!!cm} />
                          </div>
                        </td>
                      );
                    })}
                    <td style={{ padding:"6px 4px", textAlign:"center", whiteSpace:"nowrap" }}>
                      <button onClick={() => {
                        const current = m.auto_source || "";
                        const source = prompt("Auto-source from Scoreboard metric key:\n\nAvailable: " + DAILY_KEYS.join(", ") + "\n\nCurrent: " + (current || "none") + "\n\nEnter key (or leave blank to disable):", current);
                        if (source === null) return; // cancelled
                        if (source === "") {
                          updateMetricAutoSource(m.id, "auto_source", null);
                          updateMetricAutoSource(m.id, "auto_agg", null);
                          updateMetricAutoSource(m.id, "auto_weight_key", null);
                          return;
                        }
                        updateMetricAutoSource(m.id, "auto_source", source);
                        const agg = prompt("Aggregation method:\n\nsum = Total for the week\naverage = Simple daily average\nweighted_average = Weighted by another metric\nlast = Last day's value\n\nCurrent: " + (m.auto_agg || "sum"), m.auto_agg || "sum");
                        if (agg) updateMetricAutoSource(m.id, "auto_agg", agg);
                        if (agg === "weighted_average") {
                          const wk = prompt("Weight by which metric?\n\nAvailable: " + DAILY_KEYS.filter(k => k !== source).join(", "), m.auto_weight_key || "");
                          if (wk) updateMetricAutoSource(m.id, "auto_weight_key", wk);
                        }
                      }}
                        title={m.auto_source ? `Auto: ${m.auto_agg} of ${m.auto_source}${m.auto_weight_key ? " weighted by " + m.auto_weight_key : ""}` : "Configure auto-calculate"}
                        style={{ background:"none", border:"none", color: m.auto_source ? T.accent : T.text3, cursor:"pointer", fontSize:11, opacity: m.auto_source ? 1 : 0.5 }}>⚡</button>
                      <button onClick={() => deleteMetric(m.id)}
                        style={{ background:"none", border:"none", color:T.text3, cursor:"pointer", fontSize:12, opacity:0.5 }}>✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Goal Periods Editor */}
        {editingGoals && (() => {
          const m = metrics.find(x => x.id === editingGoals);
          if (!m) return null;
          const periods = goalPeriods[m.id] || [];
          const addPeriod = async () => {
            const goal = prompt("Goal value:", m.goal || "");
            if (!goal) return;
            const start = prompt("Start date (YYYY-MM-DD):", new Date().toISOString().split("T")[0]);
            if (!start) return;
            const end = prompt("End date (YYYY-MM-DD, leave blank for ongoing):", "");
            const { data } = await supabase.from("scorecard_goal_periods").insert({
              metric_id: m.id, goal: parseFloat(goal), start_date: start, end_date: end || null,
            }).select().single();
            if (data) setGoalPeriods(p => ({ ...p, [m.id]: [...(p[m.id] || []), data].sort((a, b) => a.start_date.localeCompare(b.start_date)) }));
          };
          const deletePeriod = async (id) => {
            await supabase.from("scorecard_goal_periods").delete().eq("id", id);
            setGoalPeriods(p => ({ ...p, [m.id]: (p[m.id] || []).filter(g => g.id !== id) }));
          };
          return (
            <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} onClick={() => setEditingGoals(null)} />
              <div style={{ position: "relative", width: 480, background: T.surface, borderRadius: 14, border: `1px solid ${T.border}`, boxShadow: "0 20px 60px rgba(0,0,0,0.4)", zIndex: 201, maxHeight: "80vh", overflow: "auto" }}>
                <div style={{ padding: "18px 24px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Goal Periods — {m.name}</h3>
                    <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>Set different targets for different time periods. {m.target_direction === "below" ? "Lower is better." : "Higher is better."}</div>
                  </div>
                  <button onClick={() => setEditingGoals(null)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 18 }}>×</button>
                </div>
                <div style={{ padding: "16px 24px" }}>
                  {periods.length === 0 && (
                    <div style={{ padding: "20px 0", textAlign: "center", color: T.text3, fontSize: 12 }}>
                      No goal periods set. Using default goal: {m.goal != null ? fmt(Number(m.goal), m.unit) : "none"}.
                    </div>
                  )}
                  {periods.map((p, i) => (
                    <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: `1px solid ${T.border}` }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: T.accent }}>{fmt(Number(p.goal), m.unit)}</div>
                        <div style={{ fontSize: 11, color: T.text3 }}>
                          {new Date(p.start_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                          {" → "}
                          {p.end_date ? new Date(p.end_date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "Ongoing"}
                        </div>
                        {p.note && <div style={{ fontSize: 10, color: T.text3, fontStyle: "italic", marginTop: 2 }}>{p.note}</div>}
                      </div>
                      <button onClick={() => deletePeriod(p.id)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 12 }}>✕</button>
                    </div>
                  ))}
                  <button onClick={addPeriod} style={{ marginTop: 12, padding: "8px 16px", borderRadius: 8, border: `1px dashed ${T.border}`, background: "transparent", color: T.accent, fontSize: 12, fontWeight: 600, cursor: "pointer", width: "100%" }}>
                    + Add Goal Period
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Comment Modal */}
        {commentModal && (() => {
          const { metricId, weekStart, existing, isOwner } = commentModal;
          const metric = metrics.find(m => m.id === metricId);
          const weekDate = new Date(weekStart + "T12:00:00");
          const weekLabel = weekDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
          const CommentModalInner = () => {
            const [text, setText] = useState(existing || "");
            return (
              <div onClick={() => setCommentModal(null)} style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} />
                <div onClick={e => e.stopPropagation()} style={{ position: "relative", width: 400, background: T.surface, borderRadius: 14, border: `1px solid ${T.border}`, boxShadow: "0 20px 60px rgba(0,0,0,0.4)", zIndex: 201 }}>
                  <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{existing ? "Edit Comment" : "Add Comment"}</div>
                      <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>{metric?.name} — Week of {weekLabel}</div>
                    </div>
                    <button onClick={() => setCommentModal(null)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 18 }}>×</button>
                  </div>
                  <div style={{ padding: "16px 20px" }}>
                    {isOwner ? (
                      <>
                        <textarea value={text} onChange={e => setText(e.target.value)} rows={3} placeholder="Add a note about this week's number..."
                          style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, outline: "none", fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} />
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
                          {existing && (
                            <button onClick={() => { saveComment(metricId, weekStart, null); setCommentModal(null); }}
                              style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid #ef444440`, background: "#ef444410", color: "#ef4444", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Delete</button>
                          )}
                          <button onClick={() => setCommentModal(null)}
                            style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface3, color: T.text2, fontSize: 12, cursor: "pointer" }}>Cancel</button>
                          <button onClick={() => { if (text.trim()) { saveComment(metricId, weekStart, text.trim()); } setCommentModal(null); }} disabled={!text.trim() && !existing}
                            style={{ padding: "8px 18px", borderRadius: 8, border: "none", background: T.accent, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer", opacity: !text.trim() && !existing ? 0.5 : 1 }}>Save</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ padding: "14px 16px", borderRadius: 8, background: T.surface2, border: `1px solid ${T.border}`, fontSize: 13, color: T.text, lineHeight: 1.6 }}>{existing}</div>
                        <div style={{ textAlign: "right", marginTop: 12 }}>
                          <button onClick={() => setCommentModal(null)}
                            style={{ padding: "8px 18px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface3, color: T.text2, fontSize: 12, cursor: "pointer" }}>Close</button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          };
          return <CommentModalInner />;
        })()}

        {/* Legend */}
        {metrics.length > 0 && (
          <div style={{ marginTop:16, display:"flex", gap:16, fontSize:10, color:T.text3, flexWrap:"wrap" }}>
            <div style={{ display:"flex", alignItems:"center", gap:4 }}><div style={{ width:8, height:8, borderRadius:"50%", background:"#22c55e" }} /> On target</div>
            <div style={{ display:"flex", alignItems:"center", gap:4 }}><div style={{ width:8, height:8, borderRadius:"50%", background:"#ef4444" }} /> Below target</div>
            <div style={{ display:"flex", alignItems:"center", gap:4 }}><div style={{ width:5, height:5, borderRadius:"50%", background:"#22c55e", position:"relative" }} /> <span>Green dot = hit goal that week</span></div>
            <div>Click any cell to enter or edit a value · Bool metrics: click to toggle</div>
          </div>
        )}
      </div>
    </div>
  );
}
