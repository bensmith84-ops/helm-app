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
    if (abs >= 1_000)     return s + "$" + (abs/1e3).toFixed(0) + "K";
    return s + "$" + Number(v).toFixed(0);
  }
  if (unit === "%") return Number(v).toFixed(1) + "%";
  if (unit === "bool") return v ? "✓" : "✗";
  return Number(v).toLocaleString();
};

const getWeekStart = (d = new Date()) => {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d.setDate(diff));
  return mon.toISOString().split("T")[0];
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

function InlineEntry({ value, onSave, unit }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(value != null ? String(value) : "");
  const inputRef = useRef(null);

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

function RagDot({ value, goal, unit }) {
  if (value == null || goal == null) return <div style={{ width:10, height:10, borderRadius:"50%", background:T.border }} />;
  const ratio = unit === "bool" ? (value ? 1 : 0) : (goal !== 0 ? value / goal : 1);
  const color = ratio >= 1 ? "#22c55e" : ratio >= 0.8 ? "#eab308" : "#ef4444";
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
  const [profiles, setProfiles] = useState({});
  const [keyResults, setKeyResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddMetric, setShowAddMetric] = useState(false);
  const [newMetric, setNewMetric] = useState({ name:"", unit:"number", goal:"", frequency:"weekly", description:"", linked_kr_id:"" });
  const [saving, setSaving] = useState(false);
  const [orgId, setOrgId] = useState(null);

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
        const { data: ent } = await supabase.from("scorecard_entries")
          .select("*").in("metric_id", met.map(m => m.id))
          .in("week_start", WEEKS);
        const map = {};
        (ent || []).forEach(e => {
          if (!map[e.metric_id]) map[e.metric_id] = {};
          map[e.metric_id][e.week_start] = e.value;
        });
        setEntries(map);
      }
      setLoading(false);
    })();
  }, []);

  const saveEntry = async (metricId, weekStart, value) => {
    setEntries(p => ({
      ...p,
      [metricId]: { ...(p[metricId]||{}), [weekStart]: value }
    }));
    const existing = await supabase.from("scorecard_entries")
      .select("id").eq("metric_id", metricId).eq("week_start", weekStart).maybeSingle();
    if (existing.data?.id) {
      await supabase.from("scorecard_entries").update({ value, entered_by: user.id }).eq("id", existing.data.id);
    } else {
      await supabase.from("scorecard_entries").insert({ metric_id: metricId, week_start: weekStart, value, entered_by: user.id });
    }
  };

  const addMetric = async () => {
    if (!newMetric.name.trim()) return;
    setSaving(true);
    const { data } = await supabase.from("scorecard_metrics").insert({
      name: newMetric.name, unit: newMetric.unit,
      goal: newMetric.goal ? parseFloat(newMetric.goal) : null,
      frequency: newMetric.frequency, description: newMetric.description,
      linked_kr_id: newMetric.linked_kr_id || null,
      org_id: orgId, owner_id: user.id, sort_order: metrics.length,
    }).select().single();
    if (data) { setMetrics(p => [...p, data]); setEntries(p => ({...p, [data.id]: {}})); }
    setNewMetric({ name:"", unit:"number", goal:"", frequency:"weekly", description:"", linked_kr_id:"" });
    setShowAddMetric(false);
    setSaving(false);
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
    const goal = m.goal;
    const hits = vals.filter(v => v!=null && goal != null && (m.unit==="bool"?v>=1:v>=goal)).length;
    const total = vals.filter(v=>v!=null).length;
    return { ...m, latest, vals, hits, total };
  });

  const onTrack = metricSummary.filter(m => m.goal!=null && m.latest!=null && (m.unit==="bool"?m.latest>=1:m.latest>=m.goal)).length;
  const offTrack = metricSummary.filter(m => m.goal!=null && m.latest!=null && (m.unit==="bool"?m.latest<1:m.latest<m.goal)).length;
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
            <div style={{ display:"flex", gap:6 }}>
              <button onClick={() => setShowAddMetric(false)}
                style={{ padding:"7px 10px", fontSize:12, background:T.surface3, color:T.text2, border:`1px solid ${T.border}`, borderRadius:6, cursor:"pointer" }}>Cancel</button>
              <button onClick={addMetric} disabled={saving||!newMetric.name.trim()}
                style={{ padding:"7px 14px", fontSize:12, fontWeight:600, background:T.accent, color:"#fff", border:"none", borderRadius:6, cursor:"pointer", opacity:saving?0.6:1 }}>
                {saving?"Adding…":"Add"}
              </button>
            </div>
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
                        <RagDot value={m.latest} goal={m.goal} unit={m.unit} />
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:13, fontWeight:600, color:T.text }}>{m.name}</div>
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
                        {m.goal != null ? fmt(m.goal, m.unit) : "—"}
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
                      const onTarget = v!=null && m.goal!=null && (m.unit==="bool"?v>=1:v>=m.goal);
                      return (
                        <td key={w} style={{ padding:"6px 4px", background: isThis?T.accentDim+"80":"transparent" }}>
                          <div style={{ position:"relative" }}>
                            {v!=null && m.goal!=null && (
                              <div style={{ position:"absolute", top:0, right:2, width:5, height:5, borderRadius:"50%",
                                background: onTarget?"#22c55e":"#ef4444", zIndex:1 }} />
                            )}
                            <InlineEntry value={v} unit={m.unit}
                              onSave={(val) => saveEntry(m.id, w, val)} />
                          </div>
                        </td>
                      );
                    })}
                    <td style={{ padding:"6px 4px", textAlign:"center" }}>
                      <button onClick={() => deleteMetric(m.id)}
                        style={{ background:"none", border:"none", color:T.text3, cursor:"pointer", fontSize:12, opacity:0.5 }}>✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

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
