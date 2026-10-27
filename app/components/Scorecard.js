"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { invokeFunction } from "../lib/invokeFunction";
import { T } from "../tokens";
import { useResponsive } from "../lib/responsive";
import { useAuth } from "../lib/auth";
import MetricSourcePicker, { sourceFromMetric, metricFieldsFromSource, describeSource } from "./MetricSourcePicker";

const AVATAR_COLORS = ["#3b82f6","#a855f7","#ec4899","#06b6d4","#f97316","#22c55e","#84cc16","#ef4444"];
const acol = (uid) => uid ? AVATAR_COLORS[uid.charCodeAt(uid.length-1)%AVATAR_COLORS.length] : T.text3;

const fmt = (v, unit) => {
  if (v == null) return "-";
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

const ROLLING_WEEKS = weeksBack(13); // 13 weeks = rolling quarter
// Weeks (Monday starts) of an OKR cycle up to this week; a cycle that hasn't
// started yet shows its first 13 weeks. At most the latest 53 weeks.
const weeksForCycle = (c) => {
  if (!c?.start_date || !c?.end_date) return ROLLING_WEEKS;
  const today = getWeekStart(new Date());
  const first = getWeekStart(new Date(c.start_date + "T12:00:00"));
  const lastCycle = getWeekStart(new Date(c.end_date + "T12:00:00"));
  const weeks = [];
  const d = new Date(first + "T12:00:00");
  for (let i = 0; i < 400; i++) {
    const w = getWeekStart(d);
    if (w > lastCycle) break;
    if (w > today && weeks.length >= 13) break;
    weeks.push(w);
    d.setDate(d.getDate() + 7);
  }
  return weeks.slice(-53);
};
const PERIOD_KEY = "helm_okr_cycle"; // shared with OKRs so both views follow the same period
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
      {value != null ? fmt(value, unit) : <span style={{ color:T.border, fontSize:10 }}>-</span>}
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
  const { isMobile } = useResponsive();
  const { user, profile, orgId } = useAuth();
  // Period: rolling 13 weeks, or an OKR cycle (same list and same selection as OKRs).
  const [cycles, setCycles] = useState([]);
  const [objectives, setObjectives] = useState([]);
  const [period, setPeriodState] = useState(() => { try { return localStorage.getItem("helm_scorecard_period") || "rolling"; } catch { return "rolling"; } });
  const [scope, setScope] = useState("all"); // all | okr (metrics linked to this period's key results)
  const [showFromOkrs, setShowFromOkrs] = useState(false);
  const setPeriod = (v) => {
    setPeriodState(v);
    try { localStorage.setItem("helm_scorecard_period", v); if (v !== "rolling") localStorage.setItem(PERIOD_KEY, v); } catch { /* private mode */ }
  };
  const activeCycleObj = cycles.find(c => c.id === period) || null;
  const WEEKS = useMemo(() => (activeCycleObj ? weeksForCycle(activeCycleObj) : ROLLING_WEEKS), [activeCycleObj?.id, activeCycleObj?.start_date, activeCycleObj?.end_date]); // eslint-disable-line react-hooks/exhaustive-deps
  const weeksKey = WEEKS.join(",");
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
  const [newMetric, setNewMetric] = useState({ name:"", unit:"number", goal:"", frequency:"weekly", description:"", linked_kr_id:"", auto_source:"", auto_agg:"sum", auto_weight_key:"", source:null, target_direction:"above", metric_type:"quantitative" });
  const [saving, setSaving] = useState(false);
  const [autoCalcRunning, setAutoCalcRunning] = useState(false);
  const [editAutoSource, setEditAutoSource] = useState(null);
  const [ragModal, setRagModal] = useState(null); // { metricId, weekStart, currentColor, currentComment }
  const [ragEntries, setRagEntries] = useState({}); // { metricId: { weekStart: { color, comment, comment_by, comment_at } } }
  const [ragPick, setRagPick] = useState("");
  const [ragText, setRagText] = useState(""); // { metricId, auto_source, auto_agg, auto_weight_key }


  useEffect(() => {
    (async () => {
      const [{ data: met }, { data: prof }, { data: mem }, { data: krs }] = await Promise.all([
        supabase.from("scorecard_metrics").select("*").eq("active", true).order("sort_order").order("created_at"),
        supabase.from("profiles").select("id,display_name"),
        supabase.from("org_memberships").select("org_id").eq("user_id", (await supabase.auth.getUser()).data.user?.id).maybeSingle(),
        supabase.from("key_results").select("id,title,current_value,target_value,unit,progress,objective_id,owner_id,target_direction").eq("org_id", orgId).is("deleted_at", null).order("sort_order"),
      ]);
      const [{ data: cyc }, { data: objs }] = await Promise.all([
        supabase.from("okr_cycles").select("id,name,start_date,end_date,status").eq("org_id", orgId).order("start_date", { ascending: false }),
        supabase.from("objectives").select("id,title,cycle_id,sort_order").eq("org_id", orgId).is("deleted_at", null).order("sort_order"),
      ]);
      setCycles(cyc || []);
      setObjectives(objs || []);
      // Follow the period picked in OKRs the first time this view opens.
      try {
        if (!localStorage.getItem("helm_scorecard_period")) {
          const okrCycle = localStorage.getItem(PERIOD_KEY);
          if (okrCycle && (cyc || []).some(c => c.id === okrCycle)) setPeriodState(okrCycle);
        }
      } catch { /* ignore */ }
      const profMap = {};
      (prof || []).forEach(u => { profMap[u.id] = u; });
      setProfiles(profMap);
      setMetrics(met || []);
      setKeyResults(krs || []);

      if (met?.length) {
        const [{ data: ent }, { data: gp }] = await Promise.all([
          supabase.from("scorecard_entries").select("*").eq("org_id", orgId).in("metric_id", met.map(m => m.id)).in("week_start", WEEKS),
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
        // Build RAG entries map
        const rMap = {};
        (ent || []).forEach(e => {
          if (e.rag_color) {
            if (!rMap[e.metric_id]) rMap[e.metric_id] = {};
            rMap[e.metric_id][e.week_start] = { color: e.rag_color, comment: e.comment, comment_by: e.comment_by, comment_at: e.comment_at };
          }
        });
        setRagEntries(rMap);
        const gpMap = {};
        (gp || []).forEach(g => {
          if (!gpMap[g.metric_id]) gpMap[g.metric_id] = [];
          gpMap[g.metric_id].push(g);
        });
        setGoalPeriods(gpMap);
      }
      setLoading(false);
    })();
  }, [weeksKey]); // eslint-disable-line react-hooks/exhaustive-deps

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

  const saveRag = async (metricId, weekStart, color, comment) => {
    const trimmed = comment?.trim() || null;
    setRagEntries(p => {
      const next = { ...p };
      if (!next[metricId]) next[metricId] = {};
      next[metricId] = { ...next[metricId], [weekStart]: { color, comment: trimmed, comment_by: user?.id, comment_at: new Date().toISOString() } };
      return next;
    });
    // Also store the comment in the regular comments map
    if (trimmed) {
      setComments(p => {
        const next = { ...p };
        if (!next[metricId]) next[metricId] = {};
        next[metricId] = { ...next[metricId], [weekStart]: { comment: trimmed, comment_by: user?.id, comment_at: new Date().toISOString() } };
        return next;
      });
    }
    const { error } = await supabase.from("scorecard_entries").upsert(
      { metric_id: metricId, week_start: weekStart, rag_color: color, comment: trimmed, comment_by: user?.id, comment_at: new Date().toISOString() },
      { onConflict: "metric_id,week_start" }
    );
    if (error) console.error("[Scorecard] saveRag error:", error);
  };

  const addMetric = async () => {
    if (!newMetric.name.trim()) return;
    setSaving(true);
    const isRag = newMetric.metric_type === "rag";
    const { data } = await supabase.from("scorecard_metrics").insert({
      name: newMetric.name, unit: isRag ? "rag" : newMetric.unit,
      goal: isRag ? null : (newMetric.goal ? parseFloat(newMetric.goal) : null),
      frequency: newMetric.frequency || "weekly", description: newMetric.description,
      linked_kr_id: newMetric.linked_kr_id || null,
      target_direction: isRag ? null : (newMetric.target_direction || "above"),
      metric_type: newMetric.metric_type || "quantitative",
      ...metricFieldsFromSource(isRag ? null : newMetric.source),
      org_id: orgId, owner_id: user.id, sort_order: metrics.length,
    }).select().single();
    if (data) { setMetrics(p => [...p, data]); setEntries(p => ({...p, [data.id]: {}})); }
    setNewMetric({ name:"", unit:"number", goal:"", frequency:"weekly", description:"", linked_kr_id:"", auto_source:"", auto_agg:"sum", auto_weight_key:"", source:null, target_direction:"above", metric_type:"quantitative" });
    setShowAddMetric(false);
    setSaving(false);
    if (data?.auto_source) runAutoCalc(data.id);
  };

  const runAutoCalc = async (metricId) => {
    setAutoCalcRunning(true);
    try {
      const { data: result, error: invokeErr } = await invokeFunction("scorecard-auto-calc", { body: typeof metricId === "string" ? { metric_id: metricId } : {} });
      if (invokeErr) throw new Error(invokeErr.message);
      console.log("[Scorecard] Auto-calc result:", result);
      // Reload metrics (in case auto_source was configured externally)
      const { data: freshMetrics } = await supabase.from("scorecard_metrics").select("*").eq("active", true).order("sort_order");
      if (freshMetrics) setMetrics(freshMetrics);
      // Reload entries - match original load format exactly
      const metricIds = (freshMetrics || metrics).map(m => m.id);
      const { data: allEntries } = await supabase.from("scorecard_entries").select("*").eq("org_id", orgId)
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
  // KRs in the selected period (cycle), and which metrics belong to it.
  const periodObjIds = new Set(objectives.filter(o => !activeCycleObj || o.cycle_id === activeCycleObj.id).map(o => o.id));
  const periodKRs = keyResults.filter(k => !activeCycleObj || periodObjIds.has(k.objective_id));
  const periodKRIds = new Set(periodKRs.map(k => k.id));
  const shownMetrics = scope === "okr" ? metrics.filter(m => m.linked_kr_id && periodKRIds.has(m.linked_kr_id)) : metrics;
  const metricSummary = shownMetrics.map(m => {
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
            <div style={{ display:"flex", alignItems:"center", gap:8, flexWrap:"wrap", marginTop:4 }}>
              <select value={activeCycleObj ? period : "rolling"} onChange={e => setPeriod(e.target.value)} title="Period: the same OKR cycles as the OKRs page"
                style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:6, color:T.text, padding:"4px 8px", fontSize:12, cursor:"pointer", outline:"none", fontFamily:"inherit" }}>
                <option value="rolling">Rolling 13 weeks</option>
                {cycles.map(c => <option key={c.id} value={c.id}>{c.name}{c.status && c.status !== "active" ? ` (${c.status})` : ""}</option>)}
              </select>
              {activeCycleObj && (
                <select value={scope} onChange={e => setScope(e.target.value)}
                  style={{ background:T.surface2, border:`1px solid ${T.border}`, borderRadius:6, color:T.text, padding:"4px 8px", fontSize:12, cursor:"pointer", outline:"none", fontFamily:"inherit" }}>
                  <option value="all">All metrics</option>
                  <option value="okr">This period's OKR metrics</option>
                </select>
              )}
              <span style={{ fontSize:12, color:T.text3 }}>
                {activeCycleObj ? `${WEEKS.length} weeks · ${new Date(WEEKS[0]+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})} to week of ${new Date(thisWeek+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})}` : `Week of ${new Date(thisWeek+"T12:00:00").toLocaleDateString("en-US",{month:"long",day:"numeric"})}`}
              </span>
            </div>
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
                m.total > 0 ? `${Math.round((m.hits/m.total)*100)}%` : "-",
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
            <button onClick={() => setShowFromOkrs(true)} title="Track key results weekly on the scorecard"
              style={{ padding:"7px 14px", fontSize:12, fontWeight:600, background:T.surface2, color:T.accent, border:`1px solid ${T.accent}40`, borderRadius:7, cursor:"pointer" }}>
              ◎ Add from OKRs
            </button>
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
          {/* Metric Type Toggle */}
          <div style={{ display:"flex", gap:0, marginBottom:12, borderRadius:8, overflow:"hidden", border:`1px solid ${T.border}`, alignSelf:"flex-start", width:"fit-content" }}>
            <button onClick={() => setNewMetric(p => ({ ...p, metric_type:"quantitative" }))} style={{ padding:"6px 16px", fontSize:12, fontWeight:600, border:"none", cursor:"pointer", background: newMetric.metric_type === "quantitative" ? T.accent : T.surface, color: newMetric.metric_type === "quantitative" ? "#fff" : T.text3 }}>📊 Quantitative</button>
            <button onClick={() => setNewMetric(p => ({ ...p, metric_type:"rag", unit:"rag", goal:"" }))} style={{ padding:"6px 16px", fontSize:12, fontWeight:600, border:"none", cursor:"pointer", background: newMetric.metric_type === "rag" ? T.accent : T.surface, color: newMetric.metric_type === "rag" ? "#fff" : T.text3, borderLeft:`1px solid ${T.border}` }}>🚦 RAG Status</button>
          </div>

          {newMetric.metric_type === "rag" ? (
            /* RAG Metric Form */
            <div style={{ display:"grid", gridTemplateColumns:"2fr 2fr 2fr auto", gap:10, alignItems:"end" }}>
              <div>
                <div style={{ fontSize:11, color:T.text3, marginBottom:4, fontWeight:600 }}>Metric Name *</div>
                <input value={newMetric.name} onChange={e => setNewMetric(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Brand Health, Team Morale, Product Quality"
                  style={{ width:"100%", fontSize:12, background:T.surface, border:`1px solid ${T.border}`, borderRadius:6, padding:"7px 8px", color:T.text, outline:"none", boxSizing:"border-box" }} />
              </div>
              <div>
                <div style={{ fontSize:11, color:T.text3, marginBottom:4, fontWeight:600 }}>Description</div>
                <input value={newMetric.description} onChange={e => setNewMetric(p => ({ ...p, description: e.target.value }))}
                  placeholder="What does this track?"
                  style={{ width:"100%", fontSize:12, background:T.surface, border:`1px solid ${T.border}`, borderRadius:6, padding:"7px 8px", color:T.text, outline:"none", boxSizing:"border-box" }} />
              </div>
              <div>
                <div style={{ fontSize:11, color:T.text3, marginBottom:4, fontWeight:600 }}>Owner</div>
                <select value={newMetric.linked_kr_id} onChange={e => setNewMetric(p => ({ ...p, linked_kr_id: e.target.value }))}
                  style={{ width:"100%", fontSize:12, background:T.surface, border:`1px solid ${T.border}`, borderRadius:6, padding:"7px 8px", color:T.text, outline:"none" }}>
                  <option value="">Link to KR (optional)</option>
                  {periodKRs.map(kr => <option key={kr.id} value={kr.id}>{kr.title}</option>)}
                </select>
              </div>
              <div style={{ display:"flex", gap:6 }}>
                <button onClick={addMetric} disabled={saving || !newMetric.name.trim()}
                  style={{ padding:"7px 14px", fontSize:12, fontWeight:700, background:T.accent, color:"#fff", border:"none", borderRadius:6, cursor:"pointer", opacity: saving || !newMetric.name.trim() ? 0.5 : 1 }}>
                  {saving ? "…" : "Add"}
                </button>
                <button onClick={() => setShowAddMetric(false)} style={{ padding:"7px 10px", fontSize:12, background:T.surface, border:`1px solid ${T.border}`, borderRadius:6, cursor:"pointer", color:T.text3 }}>✕</button>
              </div>
            </div>
          ) : null}

          {/* Quantitative Metric Form */}
          {newMetric.metric_type !== "rag" && (<>
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
          {/* Auto-calculate from the Scoreboard or Metabase */}
          {newMetric.metric_type !== "rag" && (
          <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 8, border: `1px solid ${newMetric.source ? T.accent + "40" : T.border}`, background: newMetric.source ? T.accent + "08" : "transparent" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: newMetric.source ? T.accent : T.text2, marginBottom: 8 }}>⚡ Auto-calculate weekly values</div>
            <MetricSourcePicker mode="scorecard" value={newMetric.source} onChange={v => setNewMetric(p => ({ ...p, source: v }))} />
          </div>
          )}
          <div style={{ display:"flex", gap:6, justifyContent:"flex-end", marginTop:12 }}>
            <button onClick={() => setShowAddMetric(false)}
              style={{ padding:"7px 10px", fontSize:12, background:T.surface3, color:T.text2, border:`1px solid ${T.border}`, borderRadius:6, cursor:"pointer" }}>Cancel</button>
            <button onClick={addMetric} disabled={saving||!newMetric.name.trim()}
              style={{ padding:"7px 14px", fontSize:12, fontWeight:600, background:T.accent, color:"#fff", border:"none", borderRadius:6, cursor:"pointer", opacity:saving?0.6:1 }}>
              {saving?"Adding…":"Add"}
            </button>
          </div>
          </>)}
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
                          <div style={{ fontSize:13, fontWeight:600, color:T.text }}>{m.name}{m.auto_source && <span title={m.auto_error ? `Auto-calc failed: ${m.auto_error}` : `${describeSource(sourceFromMetric(m))} (${m.auto_agg || "sum"} per week)`} style={{ fontSize:10, color: m.auto_error ? "#ef4444" : T.accent, marginLeft:5, fontWeight:700 }}>⚡</span>}</div>
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
                    {/* Goal - hide for RAG metrics */}
                    <td style={{ padding:"10px 8px", textAlign:"center" }}>
                      {m.metric_type === "rag" ? (
                        <span style={{ fontSize:9, padding:"2px 6px", borderRadius:4, background:"#6366f115", color:"#6366f1", fontWeight:600 }}>RAG</span>
                      ) : (
                      <span style={{ fontSize:12, color:T.text2, fontWeight:500 }}>
                        {m.currentGoal != null ? <span onClick={e => { e.stopPropagation(); setEditingGoals(editingGoals === m.id ? null : m.id); }} style={{ cursor: "pointer" }} title="Click to manage goal periods">{fmt(m.currentGoal, m.unit)}</span> : <span onClick={e => { e.stopPropagation(); setEditingGoals(m.id); }} style={{ cursor: "pointer" }} title="Set goal">-</span>}
                      </span>
                      )}
                    </td>
                    {/* Sparkline - RAG dots for RAG metrics */}
                    <td style={{ padding:"10px 8px", textAlign:"center" }}>
                      {m.metric_type === "rag" ? (
                        <div style={{ display:"flex", gap:2, justifyContent:"center" }}>
                          {WEEKS.slice(-8).map(w => {
                            const re = ragEntries[m.id]?.[w];
                            const c = re?.color === "green" ? "#22c55e" : re?.color === "amber" ? "#f59e0b" : re?.color === "red" ? "#ef4444" : T.surface3;
                            return <div key={w} style={{ width:6, height:6, borderRadius:3, background:c }} />;
                          })}
                        </div>
                      ) : (
                      <div style={{ display:"flex", justifyContent:"center" }}>
                        <SparkTrend values={m.vals} />
                      </div>
                      )}
                    </td>
                    {/* Hit % - hide for RAG */}
                    <td style={{ padding:"10px 8px", textAlign:"center" }}>
                      {m.metric_type === "rag" ? (
                        <span style={{ color:T.border, fontSize:11 }}>-</span>
                      ) : hitPct != null ? (
                        <span style={{ fontSize:11, fontWeight:700,
                          color: hitPct>=80?"#22c55e":hitPct>=60?"#eab308":"#ef4444" }}>
                          {hitPct}%
                        </span>
                      ) : <span style={{ color:T.border, fontSize:11 }}>-</span>}
                    </td>
                    {/* Weekly cells */}
                    {WEEKS.map(w => {
                      const isThis = w === thisWeek;
                      if (m.metric_type === "rag") {
                        // RAG cell - colored circle with click to update
                        const re = ragEntries[m.id]?.[w];
                        const ragColor = re?.color;
                        const bgColor = ragColor === "green" ? "#22c55e" : ragColor === "amber" ? "#f59e0b" : ragColor === "red" ? "#ef4444" : null;
                        const cm = comments[m.id]?.[w];
                        return (
                          <td key={w} style={{ padding:"6px 4px", background: isThis ? T.accentDim+"80" : "transparent", textAlign:"center", position:"relative" }}>
                            {cm && (
                              <div style={{ position:"absolute", top:-1, right:1, zIndex:2, fontSize:10 }}
                                onMouseEnter={e => { const tip = e.currentTarget.querySelector("[data-tip]"); if (tip) tip.style.display = "block"; }}
                                onMouseLeave={e => { const tip = e.currentTarget.querySelector("[data-tip]"); if (tip) tip.style.display = "none"; }}>
                                💬
                                <div data-tip="1" style={{ display:"none", position:"absolute", top:"calc(100% + 6px)", right:-8, zIndex:100,
                                  minWidth:200, maxWidth:300, padding:"10px 14px", borderRadius:10,
                                  background:T.surface, border:`1px solid ${T.border}`, boxShadow:"0 8px 24px rgba(0,0,0,0.3)", pointerEvents:"none" }}>
                                  <div style={{ fontSize:12, color:T.text, lineHeight:1.6, whiteSpace:"pre-wrap" }}>{cm.comment}</div>
                                  <div style={{ fontSize:10, color:T.text3, marginTop:4, borderTop:`1px solid ${T.border}`, paddingTop:4 }}>
                                    {profiles[cm.comment_by]?.display_name || "Someone"} · {cm.comment_at ? new Date(cm.comment_at).toLocaleDateString("en-US", { month:"short", day:"numeric" }) : ""}
                                  </div>
                                </div>
                              </div>
                            )}
                            <div onClick={() => { setRagPick(ragColor || ""); setRagText(re?.comment || ""); setRagModal({ metricId: m.id, weekStart: w }); }}
                              style={{ width:24, height:24, borderRadius:12, margin:"0 auto", cursor:"pointer",
                                background: bgColor || "transparent", border: bgColor ? `2px solid ${bgColor}` : `2px dashed ${T.border}`,
                                display:"flex", alignItems:"center", justifyContent:"center", transition:"transform 0.1s" }}
                              onMouseEnter={e => e.currentTarget.style.transform = "scale(1.2)"} onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>
                              {!bgColor && <span style={{ fontSize:8, color:T.text3 }}>+</span>}
                            </div>
                          </td>
                        );
                      }
                      // Regular quantitative cell
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
                                  <div data-tip="1" style={{ display:"none", position:"absolute", top:"calc(100% + 6px)", right:-8, zIndex:100,
                                    minWidth:200, maxWidth:320, padding:"10px 14px", borderRadius:10,
                                    background:T.surface, border:`1px solid ${T.border}`, boxShadow:"0 8px 24px rgba(0,0,0,0.3)",
                                    pointerEvents:"none" }}>
                                    <div style={{ position:"absolute", top:-4, right:12, width:8, height:8, background:T.surface,
                                      border:`1px solid ${T.border}`, borderBottom:"none", borderRight:"none",
                                      transform:"rotate(45deg)" }} />
                                    <div style={{ fontSize:12, color:T.text, lineHeight:1.6, whiteSpace:"pre-wrap", wordBreak:"break-word" }}>{cm.comment}</div>
                                    <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:10, color:T.text3, marginTop:6, borderTop:`1px solid ${T.border}`, paddingTop:6 }}>
                                      <span style={{ fontWeight:600 }}>{cmAuthor}</span>
                                      {cmTime && <><span>·</span><span>{cmTime}</span></>}
                                    </div>
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
                        setEditAutoSource({ metricId: m.id, name: m.name, source: sourceFromMetric(m), error: m.auto_error, synced: m.auto_synced_at });
                      }}
                        title={m.auto_error ? `Auto-calc failed: ${m.auto_error}` : m.auto_source ? `${describeSource(sourceFromMetric(m))} (${m.auto_agg || "sum"} per week)` : "Configure auto-calculate"}
                        style={{ background:"none", border:"none", color: m.auto_error ? "#ef4444" : m.auto_source ? T.accent : T.text3, cursor:"pointer", fontSize:11, opacity: m.auto_source ? 1 : 0.5 }}>⚡</button>
                      <button onClick={() => deleteMetric(m.id)}
                        style={{ background:"none", border:"none", color:T.text3, cursor:"pointer", fontSize:12, opacity:0.5 }}>✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {showFromOkrs && (
          <FromOkrsModal cycles={cycles} objectives={objectives} keyResults={keyResults} metrics={metrics} profiles={profiles}
            defaultCycle={activeCycleObj?.id || (cycles.find(c => c.status === "active") || cycles[0])?.id}
            onClose={() => setShowFromOkrs(false)}
            onAdd={async (krs) => {
              const rows = krs.map((kr, i) => {
                const obj = objectives.find(o => o.id === kr.objective_id);
                return { name: kr.title, unit: "number", goal: null, frequency: "weekly", description: obj ? `OKR: ${obj.title}` : "From OKRs",
                  linked_kr_id: kr.id, target_direction: kr.target_direction === "below" ? "below" : "above", metric_type: "quantitative",
                  org_id: orgId, owner_id: kr.owner_id || user.id, sort_order: metrics.length + i };
              });
              const { data, error } = await supabase.from("scorecard_metrics").insert(rows).select();
              if (error) { alert("Couldn't add: " + error.message); return; }
              setMetrics(p => [...p, ...(data || [])]);
              setEntries(p => { const n = { ...p }; (data || []).forEach(d => { n[d.id] = {}; }); return n; });
              setShowFromOkrs(false);
            }} />
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
              <div style={{ position: "relative", width: "min(480px, 95vw)", background: T.surface, borderRadius: 14, border: `1px solid ${T.border}`, boxShadow: "0 20px 60px rgba(0,0,0,0.4)", zIndex: 201, maxHeight: "80vh", overflow: "auto" }}>
                <div style={{ padding: "18px 24px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Goal Periods - {m.name}</h3>
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
                <div onClick={e => e.stopPropagation()} style={{ position: "relative", width: "min(400px, 95vw)", background: T.surface, borderRadius: 14, border: `1px solid ${T.border}`, boxShadow: "0 20px 60px rgba(0,0,0,0.4)", zIndex: 201 }}>
                  <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700 }}>{existing ? "Edit Comment" : "Add Comment"}</div>
                      <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>{metric?.name} - Week of {weekLabel}</div>
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
          return <CommentModalInner key="comment-modal" />;
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

        {/* RAG Status Update Modal */}
        {ragModal && (() => {
          const rm = ragModal;
          const metric = metrics.find(x => x.id === rm.metricId);
          const weekDate = new Date(rm.weekStart + "T12:00:00");
          const weekLabel = weekDate.toLocaleDateString("en-US", { month:"short", day:"numeric" });
          const RAG_OPTIONS = [
            { key:"green", label:"Green", desc:"On track", color:"#22c55e", bg:"#22c55e18" },
            { key:"amber", label:"Amber", desc:"At risk / needs attention", color:"#f59e0b", bg:"#f59e0b18" },
            { key:"red", label:"Red", desc:"Off track / blocked", color:"#ef4444", bg:"#ef444418" },
          ];
          return (
            <div style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.5)", display:"flex", alignItems:"center", justifyContent:"center", zIndex:1000 }} onClick={() => setRagModal(null)}>
              <div onClick={e => e.stopPropagation()} style={{ background:T.surface, borderRadius:16, padding:24, width:"min(440px, 92vw)", boxShadow:"0 20px 60px rgba(0,0,0,0.4)" }}>
                <div style={{ fontSize:16, fontWeight:800, color:T.text, marginBottom:4 }}>{metric?.name || "RAG Status"}</div>
                <div style={{ fontSize:12, color:T.text3, marginBottom:16 }}>Week of {weekLabel}</div>

                {/* Color picker */}
                <div style={{ display:"flex", gap:10, marginBottom:16 }}>
                  {RAG_OPTIONS.map(opt => (
                    <button key={opt.key} onClick={() => setRagPick(opt.key)}
                      style={{ flex:1, padding:"14px 12px", borderRadius:12, border: ragPick === opt.key ? `2px solid ${opt.color}` : `2px solid ${T.border}`,
                        background: ragPick === opt.key ? opt.bg : "transparent", cursor:"pointer", textAlign:"center", transition:"all 0.15s" }}>
                      <div style={{ width:28, height:28, borderRadius:14, background:opt.color, margin:"0 auto 6px", display:"flex", alignItems:"center", justifyContent:"center" }}>
                        {ragPick === opt.key && <span style={{ color:"#fff", fontSize:14, fontWeight:700 }}>✓</span>}
                      </div>
                      <div style={{ fontSize:12, fontWeight:700, color:opt.color }}>{opt.label}</div>
                      <div style={{ fontSize:10, color:T.text3, marginTop:2 }}>{opt.desc}</div>
                    </button>
                  ))}
                </div>

                {/* Comment */}
                <div style={{ marginBottom:16 }}>
                  <div style={{ fontSize:11, fontWeight:600, color:T.text3, marginBottom:4 }}>Comment (required)</div>
                  <textarea value={ragText} onChange={e => setRagText(e.target.value)}
                    placeholder="What's the status? What changed? Any blockers?"
                    rows={3} style={{ width:"100%", padding:"10px 12px", fontSize:13, background:T.surface2, border:`1px solid ${T.border}`,
                      borderRadius:10, color:T.text, outline:"none", resize:"vertical", boxSizing:"border-box", lineHeight:1.5 }} />
                </div>

                {/* Actions */}
                <div style={{ display:"flex", gap:8, justifyContent:"flex-end" }}>
                  <button onClick={() => setRagModal(null)}
                    style={{ padding:"8px 16px", fontSize:12, background:T.surface2, border:`1px solid ${T.border}`, borderRadius:8, color:T.text3, cursor:"pointer" }}>Cancel</button>
                  <button onClick={() => { if (ragPick && ragText.trim()) { saveRag(rm.metricId, rm.weekStart, ragPick, ragText.trim()); setRagModal(null); } }}
                    disabled={!ragPick || !ragText.trim()}
                    style={{ padding:"8px 16px", fontSize:12, fontWeight:700, background: ragPick ? (ragPick === "green" ? "#22c55e" : ragPick === "amber" ? "#f59e0b" : "#ef4444") : T.accent,
                      color:"#fff", border:"none", borderRadius:8, cursor:"pointer", opacity: !ragPick || !ragText.trim() ? 0.5 : 1 }}>
                    Save Status
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Auto-Source Edit Modal */}
        {editAutoSource && (() => {
          const eas = editAutoSource;
          const save = async () => {
            const fields = metricFieldsFromSource(eas.source);
            await supabase.from("scorecard_metrics").update({ ...fields, auto_error: null }).eq("id", eas.metricId);
            setMetrics(p => p.map(m => m.id === eas.metricId ? { ...m, ...fields, auto_error: null } : m));
            setEditAutoSource(null);
            if (fields.auto_source) runAutoCalc(eas.metricId);
          };
          return (
            <div onClick={() => setEditAutoSource(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <div onClick={e => e.stopPropagation()} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 22, width: 620, maxWidth: "95vw", maxHeight: "88vh", overflow: "auto" }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>Auto-calculate</div>
                <div style={{ fontSize: 12, color: T.text3, marginBottom: 14 }}>{eas.name}: pick a Scoreboard number or search Metabase for any question, model or table.</div>
                {eas.error && <div style={{ fontSize: 11, color: "#ef4444", marginBottom: 10 }}>Last run failed: {eas.error}</div>}
                <MetricSourcePicker mode="scorecard" value={eas.source} onChange={v => setEditAutoSource(p => ({ ...p, source: v }))} />
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16, alignItems: "center" }}>
                  {eas.synced && <span style={{ fontSize: 10, color: T.text3, marginRight: "auto" }}>Last calculated {new Date(eas.synced).toLocaleString()}</span>}
                  <button onClick={() => setEditAutoSource(null)} style={{ padding: "7px 16px", fontSize: 12, background: "none", border: `1px solid ${T.border}`, borderRadius: 6, color: T.text3, cursor: "pointer" }}>Cancel</button>
                  <button onClick={save} style={{ padding: "7px 16px", fontSize: 12, fontWeight: 600, background: T.accent, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>Save and calculate</button>
                </div>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}


// Pick key results (by OKR cycle and objective) to track weekly on the scorecard.
function FromOkrsModal({ cycles, objectives, keyResults, metrics, profiles, defaultCycle, onClose, onAdd }) {
  const [cycleId, setCycleId] = useState(defaultCycle || "");
  const [picked, setPicked] = useState(new Set());
  const [busy, setBusy] = useState(false);
  const linked = new Set(metrics.filter(m => m.linked_kr_id).map(m => m.linked_kr_id));
  const objs = objectives.filter(o => o.cycle_id === cycleId);
  const toggle = (id) => setPicked(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const available = keyResults.filter(k => objs.some(o => o.id === k.objective_id) && !linked.has(k.id));
  return (
    <div onClick={onClose} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, width:"100%", maxWidth:620, maxHeight:"85vh", display:"flex", flexDirection:"column", boxShadow:"0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ padding:"16px 20px", borderBottom:`1px solid ${T.border}` }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <div style={{ fontSize:16, fontWeight:700, color:T.text }}>Add key results to the scorecard</div>
            <button onClick={onClose} style={{ background:"none", border:"none", color:T.text3, fontSize:20, cursor:"pointer" }}>×</button>
          </div>
          <div style={{ fontSize:12, color:T.text3, marginTop:4 }}>Each one becomes a weekly metric linked to its key result, owned by the KR owner. Set the goal and unit on the scorecard after adding.</div>
          <select value={cycleId} onChange={e => { setCycleId(e.target.value); setPicked(new Set()); }}
            style={{ marginTop:10, background:T.surface2, border:`1px solid ${T.border}`, borderRadius:6, color:T.text, padding:"5px 8px", fontSize:12, outline:"none", fontFamily:"inherit" }}>
            {cycles.map(c => <option key={c.id} value={c.id}>{c.name}{c.status && c.status !== "active" ? ` (${c.status})` : ""}</option>)}
          </select>
        </div>
        <div style={{ overflow:"auto", padding:"8px 20px", flex:1 }}>
          {!objs.length && <div style={{ color:T.text3, fontSize:12, padding:"16px 0" }}>No objectives in this cycle.</div>}
          {objs.map(o => {
            const krs = keyResults.filter(k => k.objective_id === o.id);
            if (!krs.length) return null;
            const open = krs.filter(k => !linked.has(k.id));
            const allOn = open.length > 0 && open.every(k => picked.has(k.id));
            return (
              <div key={o.id} style={{ marginBottom:12 }}>
                <label style={{ display:"flex", alignItems:"center", gap:8, fontSize:12.5, fontWeight:700, color:T.text, padding:"6px 0" }}>
                  <input type="checkbox" disabled={!open.length} checked={allOn} onChange={() => setPicked(p => { const n = new Set(p); open.forEach(k => allOn ? n.delete(k.id) : n.add(k.id)); return n; })} />
                  {o.title}
                </label>
                {krs.map(k => {
                  const on = linked.has(k.id);
                  return (
                    <label key={k.id} style={{ display:"flex", alignItems:"center", gap:8, fontSize:12.5, color: on ? T.text3 : T.text2, padding:"4px 0 4px 22px", cursor: on ? "default" : "pointer" }}>
                      <input type="checkbox" disabled={on} checked={on || picked.has(k.id)} onChange={() => toggle(k.id)} />
                      <span style={{ flex:1 }}>{k.title}</span>
                      {k.owner_id && profiles[k.owner_id] && <span style={{ fontSize:11, color:T.text3 }}>{profiles[k.owner_id].display_name}</span>}
                      {on && <span style={{ fontSize:10.5, color:T.green, fontWeight:600 }}>On scorecard</span>}
                    </label>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div style={{ padding:"12px 20px", borderTop:`1px solid ${T.border}`, display:"flex", alignItems:"center", gap:10 }}>
          <button onClick={() => setPicked(new Set(available.map(k => k.id)))} disabled={!available.length} style={{ fontSize:12, color:T.accent, background:"none", border:"none", cursor:"pointer" }}>Select all ({available.length})</button>
          <div style={{ flex:1 }} />
          <button onClick={onClose} style={{ padding:"7px 14px", fontSize:12, background:T.surface2, border:`1px solid ${T.border}`, borderRadius:7, cursor:"pointer", color:T.text2 }}>Cancel</button>
          <button disabled={!picked.size || busy} onClick={async () => { setBusy(true); await onAdd(keyResults.filter(k => picked.has(k.id))); setBusy(false); }}
            style={{ padding:"7px 14px", fontSize:12, fontWeight:700, background:T.accent, color:"#fff", border:"none", borderRadius:7, cursor:"pointer", opacity: picked.size && !busy ? 1 : 0.5 }}>
            {busy ? "Adding…" : `Add ${picked.size || ""} to scorecard`}
          </button>
        </div>
      </div>
    </div>
  );
}
