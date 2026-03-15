"use client";
import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";
import { useAuth } from "../lib/auth";
import { notifySlack } from "../lib/slack";

const AVATAR_COLORS = ["#3b82f6","#a855f7","#ec4899","#06b6d4","#f97316","#22c55e","#84cc16","#ef4444"];
const acol = (uid) => uid ? AVATAR_COLORS[uid.charCodeAt(uid.length-1)%AVATAR_COLORS.length] : T.text3;
const HEALTH = { on_track:{label:"On Track",color:"#22c55e"}, at_risk:{label:"At Risk",color:"#eab308"}, off_track:{label:"Off Track",color:"#ef4444"} };

const fmt$ = (v) => {
  if (v == null) return "—";
  const abs = Math.abs(v);
  const s = v < 0 ? "-" : "";
  if (abs >= 1_000_000) return s + "$" + (abs/1_000_000).toFixed(1) + "M";
  if (abs >= 1_000)     return s + "$" + (abs/1_000).toFixed(0)     + "K";
  return s + "$" + abs.toFixed(0);
};
const fmtPct = (v) => v == null ? "—" : (v >= 0 ? "+" : "") + v.toFixed(1) + "%";

function Ring({ pct, size=80, stroke=6, color }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} style={{ transform:"rotate(-90deg)", flexShrink:0 }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={T.surface3} strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color||T.accent} strokeWidth={stroke}
        strokeDasharray={`${(Math.min(100,pct)/100)*circ} ${circ}`} strokeLinecap="round"
        style={{ transition:"stroke-dasharray 0.8s ease" }} />
    </svg>
  );
}

function KPICard({ label, value, sub, color, icon, onClick }) {
  return (
    <div onClick={onClick} style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:12,
      padding:"16px 20px", cursor:onClick?"pointer":"default", transition:"border-color 0.15s",
      display:"flex", flexDirection:"column", gap:4 }}
      onMouseEnter={e=>onClick&&(e.currentTarget.style.borderColor=T.accent+"60")}
      onMouseLeave={e=>onClick&&(e.currentTarget.style.borderColor=T.border)}>
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:2 }}>
        <span style={{ fontSize:16 }}>{icon}</span>
        <span style={{ fontSize:11, fontWeight:600, color:T.text3, textTransform:"uppercase", letterSpacing:0.5 }}>{label}</span>
      </div>
      <div style={{ fontSize:28, fontWeight:800, color:color||T.text, lineHeight:1.1 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:T.text3 }}>{sub}</div>}
    </div>
  );
}

function MiniSparkline({ values, color }) {
  if (!values || values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const w = 80, h = 32;
  const pts = values.map((v, i) => `${(i/(values.length-1))*w},${h-((v-min)/range)*(h-4)-2}`).join(" ");
  return (
    <svg width={w} height={h} style={{ overflow:"visible" }}>
      <polyline points={pts} fill="none" stroke={color||T.accent} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {/* Last point dot */}
      <circle cx={(w)} cy={h-((values[values.length-1]-min)/range)*(h-4)-2} r={3} fill={color||T.accent} />
    </svg>
  );
}

function SectionHeader({ title, action, icon }) {
  return (
    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        {icon && <span style={{ fontSize:14 }}>{icon}</span>}
        <span style={{ fontSize:15, fontWeight:700 }}>{title}</span>
      </div>
      {action}
    </div>
  );
}

function Card({ children, style={} }) {
  return <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:14, padding:20, ...style }}>{children}</div>;
}

export default function DashboardView({ setActive }) {
  const { profile } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [finMetrics, setFinMetrics] = useState([]);
  const [finMonthly, setFinMonthly] = useState({});
  const [plmPrograms, setPlmPrograms] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);

  const [checkIns, setCheckIns] = useState([]);

  useEffect(() => {
    (async () => {
      const yr = new Date().getFullYear();
      const [
        { data: projects }, { data: tasks }, { data: profiles },
        { data: objectives }, { data: keyResults }, { data: cycles },
        { data: approvals }, { data: fmData }, { data: plm },
        { data: activity },
      ] = await Promise.all([
        supabase.from("projects").select("*").is("deleted_at", null).order("name"),
        supabase.from("tasks").select("*").is("deleted_at", null),
        supabase.from("profiles").select("id,display_name,avatar_url"),
        supabase.from("objectives").select("*").is("deleted_at", null).order("sort_order"),
        supabase.from("key_results").select("*").is("deleted_at", null),
        supabase.from("okr_cycles").select("*").order("start_date", { ascending: false }),
        supabase.from("approval_requests").select("*").eq("status", "pending").order("created_at", { ascending: false }).limit(5),
        supabase.from("okr_financial_metrics").select("*").eq("year", yr).order("sort_order"),
        supabase.from("plm_programs").select("*").is("deleted_at", null).order("created_at", { ascending: false }).limit(10),
        supabase.from("activity_log").select("*").order("created_at", { ascending: false }).limit(20),
      ]);

      const profMap = {};
      (profiles || []).forEach(u => { profMap[u.id] = u; });

      const activeCycle = (cycles || []).find(c => c.status === "active") || cycles?.[0];
      const cycleObjs = activeCycle ? (objectives || []).filter(o => o.cycle_id === activeCycle.id) : (objectives || []);
      const cycleKRs = (keyResults || []).filter(k => cycleObjs.some(o => o.id === k.objective_id));

      setData({ projects: projects||[], tasks: tasks||[], profiles: profMap,
        objectives: cycleObjs, keyResults: cycleKRs, cycles: cycles||[], activeCycle });
      setPendingApprovals(approvals || []);
      setPlmPrograms(plm || []);
      setRecentActivity(activity || []);

      // Load recent check-ins for staleness detection
      if (cycleKRs.length > 0) {
        const krIds = cycleKRs.map(k => k.id);
        const { data: ciData } = await supabase.from("okr_check_ins")
          .select("key_result_id, check_in_date, created_at")
          .in("key_result_id", krIds)
          .order("created_at", { ascending: false });
        setCheckIns(ciData || []);
      }

      if (fmData?.length) {
        setFinMetrics(fmData);
        const { data: mData } = await supabase.from("okr_financial_monthly")
          .select("*").in("metric_id", fmData.map(m => m.id)).eq("year", yr);
        const mMap = {};
        (mData || []).forEach(r => {
          if (!mMap[r.metric_id]) mMap[r.metric_id] = {};
          mMap[r.metric_id][r.month] = r;
        });
        setFinMonthly(mMap);
      }

      setLoading(false);
    })();
  }, []);

  if (loading) return (
    <div style={{ display:"flex", height:"100%", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:12, color:T.text3 }}>
      <div style={{ width:40, height:40, borderRadius:"50%", border:`3px solid ${T.border}`, borderTopColor:T.accent, animation:"spin 0.8s linear infinite" }} />
      <span style={{ fontSize:13 }}>Loading your workspace…</span>
    </div>
  );

  const { projects, tasks, profiles, objectives, keyResults, cycles, activeCycle } = data;
  const now = new Date();
  const todayStr = now.toISOString().split("T")[0];
  const curMonth = now.getMonth() + 1;
  const greet = now.getHours() < 12 ? "Good morning" : now.getHours() < 17 ? "Good afternoon" : "Good evening";
  const dateStr = now.toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric", year:"numeric" });

  // OKR stats
  const overallProgress = objectives.length > 0
    ? Math.round(objectives.reduce((s,o) => s + Number(o.progress||0), 0) / objectives.length) : 0;
  const onTrackCount = objectives.filter(o => o.health === "on_track").length;
  const atRiskCount  = objectives.filter(o => o.health === "at_risk").length;
  const offTrackCount= objectives.filter(o => o.health === "off_track").length;
  const daysLeft = activeCycle ? Math.max(0, Math.ceil((new Date(activeCycle.end_date) - now) / 86400000)) : 0;

  // Task stats
  const openTasks    = tasks.filter(t => t.status !== "done" && t.status !== "cancelled");
  const overdueTasks = openTasks.filter(t => t.due_date && t.due_date < todayStr);
  const myTasks      = openTasks.filter(t => t.assignee_id === profile?.id && !t.parent_task_id)
    .sort((a,b) => { if(!a.due_date&&!b.due_date) return 0; if(!a.due_date) return 1; if(!b.due_date) return -1; return a.due_date.localeCompare(b.due_date); }).slice(0, 6);

  // Financial KPIs from sheet sync
  const revMetric = finMetrics.find(m => m.metric_key === "revenue");
  const netMetric = finMetrics.find(m => m.metric_key === "net_dollars");
  const ytdRev = revMetric ? Object.entries(finMonthly[revMetric.id]||{})
    .filter(([m]) => Number(m) <= curMonth).reduce((s,[,r]) => s+(r.actual||0), 0) : null;
  const ytdNet = netMetric ? Object.entries(finMonthly[netMetric.id]||{})
    .filter(([m]) => Number(m) <= curMonth).reduce((s,[,r]) => s+(r.actual||0), 0) : null;
  const revSparkline = revMetric ? Array.from({length:curMonth},(_,i)=>i+1).map(m=>finMonthly[revMetric.id]?.[m]?.actual||0) : [];

  // PLM stats
  const inDev = plmPrograms.filter(p => ["development","optimization","validation","scale_up"].includes(p.current_stage)).length;
  const launchReady = plmPrograms.filter(p => p.current_stage === "launch_ready").length;

  const ini  = (uid) => { const u=profiles[uid]; return u?.display_name ? u.display_name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase() : "?"; };
  const uname = (uid) => profiles[uid]?.display_name || "Team member";

  const relTime = (d) => {
    const diff = Date.now() - new Date(d).getTime();
    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff/60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff/3600000)}h ago`;
    return `${Math.floor(diff/86400000)}d ago`;
  };

  // KR check-in staleness
  const lastCheckInByKR = {};
  checkIns.forEach(ci => {
    if (!lastCheckInByKR[ci.key_result_id]) lastCheckInByKR[ci.key_result_id] = ci;
  });
  const staleKRs = keyResults.filter(kr => {
    const last = lastCheckInByKR[kr.id];
    if (!last) return true;
    return Math.floor((Date.now() - new Date(last.created_at).getTime()) / 86400000) >= 7;
  }).slice(0, 5);
  const checkedInToday = keyResults.filter(kr => {
    const last = lastCheckInByKR[kr.id];
    return last && Math.floor((Date.now() - new Date(last.created_at).getTime()) / 86400000) === 0;
  }).length;

  return (
    <div style={{ padding:"28px 32px", overflow:"auto", height:"100%", boxSizing:"border-box" }}>
      {/* ── Header ── */}
      <div style={{ marginBottom:28, display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
        <div>
          <h1 style={{ fontSize:26, fontWeight:800, marginBottom:4, lineHeight:1.2 }}>
            {greet}, {profile?.display_name?.split(" ")[0] || "there"} 👋
          </h1>
          <p style={{ color:T.text3, fontSize:13 }}>
            {dateStr}{activeCycle ? ` · ${activeCycle.name} — ${daysLeft} days left` : ""}
          </p>
        </div>
        {pendingApprovals.length > 0 && (
          <div style={{ background:"#f97316"+"18", border:`1px solid ${"#f97316"}40`, borderRadius:10, padding:"10px 16px", display:"flex", alignItems:"center", gap:8, cursor:"pointer" }}
            onClick={() => setActive("finance")}>
            <span style={{ fontSize:18 }}>⏳</span>
            <div>
              <div style={{ fontSize:13, fontWeight:700, color:"#f97316" }}>{pendingApprovals.length} Pending Approval{pendingApprovals.length!==1?"s":""}</div>
              <div style={{ fontSize:11, color:T.text3 }}>Awaiting your review</div>
            </div>
          </div>
        )}
      </div>

      {/* ── KPI Row ── */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(180px, 1fr))", gap:12, marginBottom:24 }}>
        <KPICard icon="📈" label="YTD Revenue" value={ytdRev!=null?fmt$(ytdRev):"—"}
          sub={revMetric?.target_annual ? `Target: ${fmt$(revMetric.target_annual)}` : "Sync from Sheet for data"}
          color="#22c55e" onClick={() => setActive("okrs")} />
        <KPICard icon="💵" label="YTD Net $" value={ytdNet!=null?fmt$(ytdNet):"—"}
          sub={ytdRev&&ytdNet ? `${((ytdNet/ytdRev)*100).toFixed(1)}% margin` : ""}
          color={ytdNet!=null&&ytdNet>=0?"#22c55e":"#ef4444"} onClick={() => setActive("okrs")} />
        <KPICard icon="◎" label="OKR Progress" value={`${overallProgress}%`}
          sub={`${onTrackCount} on track · ${atRiskCount} at risk`}
          color={overallProgress>=60?"#22c55e":overallProgress>=30?"#eab308":"#ef4444"} onClick={() => setActive("okrs")} />
        <KPICard icon="☐" label="Open Tasks" value={openTasks.length}
          sub={overdueTasks.length>0?`${overdueTasks.length} overdue`:`${myTasks.length} assigned to me`}
          color={overdueTasks.length>0?"#ef4444":T.text} onClick={() => setActive("projects")} />
        <KPICard icon="⬢" label="PLM Programs" value={plmPrograms.length}
          sub={`${inDev} in development · ${launchReady} launch ready`}
          color={T.accent} onClick={() => setActive("plm")} />
      </div>

      {/* ── Revenue trend + OKRs ── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, marginBottom:20 }}>
        {/* Revenue sparkline card */}
        <Card>
          <SectionHeader title="Revenue This Year" icon="📊" action={
            <button onClick={() => setActive("okrs")} style={{ background:"none", border:"none", color:T.accent, fontSize:12, cursor:"pointer", fontWeight:500 }}>View metrics →</button>
          } />
          {revSparkline.some(v=>v>0) ? (
            <div>
              <div style={{ display:"flex", gap:24, marginBottom:16 }}>
                <div><div style={{ fontSize:24, fontWeight:800, color:"#22c55e" }}>{fmt$(ytdRev)}</div><div style={{ fontSize:11, color:T.text3 }}>YTD Revenue</div></div>
                {ytdNet!=null&&<div><div style={{ fontSize:24, fontWeight:800, color:ytdNet>=0?"#22c55e":"#ef4444" }}>{fmt$(ytdNet)}</div><div style={{ fontSize:11, color:T.text3 }}>YTD Net $</div></div>}
              </div>
              {/* Monthly bar chart */}
              <div style={{ display:"flex", alignItems:"flex-end", gap:4, height:80 }}>
                {revSparkline.map((v, i) => {
                  const maxV = Math.max(...revSparkline, 1);
                  const h = Math.max(4, (v/maxV)*76);
                  const months = ["J","F","M","A","M","J","J","A","S","O","N","D"];
                  const isCur = i+1 === curMonth;
                  return (
                    <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
                      <div style={{ fontSize:9, color:T.text3, fontWeight:600 }}>{v>0?fmt$(v):""}</div>
                      <div style={{ width:"100%", height:`${h}px`, borderRadius:"3px 3px 0 0",
                        background: isCur ? T.accent : v>0 ? T.accent+"70" : T.surface3,
                        transition:"height 0.4s" }} />
                      <div style={{ fontSize:9, color:isCur?T.accent:T.text3, fontWeight:isCur?700:400 }}>{months[i]}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{ textAlign:"center", padding:"24px 0", color:T.text3 }}>
              <div style={{ fontSize:32, marginBottom:8 }}>📊</div>
              <div style={{ fontSize:13, marginBottom:4 }}>No financial data yet</div>
              <div style={{ fontSize:11, marginBottom:12 }}>Go to OKRs and click "Sync from Sheet"</div>
              <button onClick={() => setActive("okrs")} style={{ padding:"6px 14px", fontSize:12, fontWeight:600, background:T.accent, color:"#fff", border:"none", borderRadius:6, cursor:"pointer" }}>
                Go to OKRs →
              </button>
            </div>
          )}
        </Card>

        {/* OKR Summary */}
        <Card>
          <SectionHeader title={activeCycle?.name || "OKRs"} icon="◎" action={
            <button onClick={() => setActive("okrs")} style={{ background:"none", border:"none", color:T.accent, fontSize:12, cursor:"pointer", fontWeight:500 }}>View all →</button>
          } />
          <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:16 }}>
            <div style={{ position:"relative", flexShrink:0 }}>
              <Ring pct={overallProgress} size={72} stroke={6} color={overallProgress>=60?"#22c55e":overallProgress>=30?"#eab308":"#ef4444"} />
              <div style={{ position:"absolute", inset:0, display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>
                <span style={{ fontSize:18, fontWeight:800, color:T.text }}>{overallProgress}%</span>
              </div>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:6, flex:1 }}>
              {[["#22c55e","On Track",onTrackCount],["#eab308","At Risk",atRiskCount],["#ef4444","Off Track",offTrackCount]].map(([c,l,v])=>(
                <div key={l} style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <div style={{ width:8, height:8, borderRadius:"50%", background:c, flexShrink:0 }} />
                  <span style={{ fontSize:12, color:T.text2, flex:1 }}>{l}</span>
                  <span style={{ fontSize:13, fontWeight:700, color:c }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
            {objectives.slice(0,4).map(obj => {
              const pct = Math.round(Number(obj.progress||0));
              const h = HEALTH[obj.health] || HEALTH.on_track;
              return (
                <div key={obj.id} onClick={()=>setActive("okrs")} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 10px", borderRadius:8, background:T.surface2, cursor:"pointer" }}>
                  <div style={{ width:6, height:6, borderRadius:"50%", background:h.color, flexShrink:0 }} />
                  <div style={{ fontSize:12, fontWeight:500, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{obj.title}</div>
                  <div style={{ width:60, flexShrink:0 }}>
                    <div style={{ height:4, borderRadius:4, background:T.surface3, overflow:"hidden" }}>
                      <div style={{ width:`${pct}%`, height:"100%", background:h.color, borderRadius:4 }} />
                    </div>
                  </div>
                  <span style={{ fontSize:11, fontWeight:700, color:h.color, minWidth:28, textAlign:"right" }}>{pct}%</span>
                </div>
              );
            })}
            {objectives.length === 0 && <div style={{ fontSize:12, color:T.text3, textAlign:"center", padding:"16px 0" }}>No objectives in this cycle</div>}
          </div>
        </Card>
      </div>

      {/* ── My Tasks + PLM Pipeline ── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20, marginBottom:20 }}>
        {/* My Tasks */}
        <Card>
          <SectionHeader title="My Tasks" icon="👤" action={
            <button onClick={() => setActive("projects")} style={{ background:"none", border:"none", color:T.accent, fontSize:12, cursor:"pointer", fontWeight:500 }}>View all →</button>
          } />
          {myTasks.length === 0 ? (
            <div style={{ textAlign:"center", padding:"24px 0", color:T.text3, fontSize:13 }}>No open tasks assigned to you 🎉</div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:6 }}>
              {myTasks.map(t => {
                const proj = projects.find(p => p.id === t.project_id);
                const isOverdue = t.due_date && t.due_date < todayStr;
                const isToday = t.due_date === todayStr;
                const priColor = {urgent:"#ef4444",high:"#f97316",medium:"#eab308",low:"#22c55e"}[t.priority]||T.text3;
                return (
                  <div key={t.id} onClick={() => setActive("projects")} style={{
                    display:"flex", alignItems:"center", gap:10, padding:"9px 12px",
                    borderRadius:8, background:T.surface2, cursor:"pointer",
                    borderLeft:`3px solid ${isOverdue?"#ef4444":priColor}`,
                  }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{t.title}</div>
                      <div style={{ fontSize:10, color:T.text3, marginTop:2 }}>{proj?.name||"—"}</div>
                    </div>
                    {t.due_date && (
                      <span style={{ fontSize:10, fontWeight:600, padding:"2px 7px", borderRadius:4, flexShrink:0,
                        background: isOverdue?"#ef444420":isToday?T.accent+"20":T.surface3,
                        color: isOverdue?"#ef4444":isToday?T.accent:T.text3 }}>
                        {isToday?"Today":isOverdue?`${Math.ceil((now-new Date(t.due_date))/86400000)}d late`:
                          new Date(t.due_date+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {overdueTasks.length > 0 && (
            <div style={{ marginTop:10, padding:"8px 12px", borderRadius:8, background:"#ef444408", border:"1px solid #ef444430" }}>
              <span style={{ fontSize:11, color:"#ef4444", fontWeight:600 }}>⚠️ {overdueTasks.length} overdue task{overdueTasks.length!==1?"s":""} across all projects</span>
            </div>
          )}
        </Card>

        {/* PLM Pipeline */}
        <Card>
          <SectionHeader title="PLM Pipeline" icon="⬢" action={
            <button onClick={() => setActive("plm")} style={{ background:"none", border:"none", color:T.accent, fontSize:12, cursor:"pointer", fontWeight:500 }}>View all →</button>
          } />
          {plmPrograms.length === 0 ? (
            <div style={{ textAlign:"center", padding:"24px 0", color:T.text3 }}>
              <div style={{ fontSize:32, marginBottom:8 }}>⬢</div>
              <div style={{ fontSize:13 }}>No programs yet</div>
            </div>
          ) : (
            <div>
              {/* Stage summary bars */}
              {[
                {key:"ideation",label:"Ideation",color:"#8b5cf6"},
                {key:"development",label:"Development",color:"#0ea5e9"},
                {key:"validation",label:"Validation",color:"#10b981"},
                {key:"launch_ready",label:"Launch Ready",color:"#f97316"},
                {key:"launched",label:"Launched",color:"#22c55e"},
              ].map(stage => {
                const count = plmPrograms.filter(p => p.current_stage === stage.key || (stage.key==="development"&&["development","optimization","scale_up","regulatory","feasibility","concept"].includes(p.current_stage))).length;
                const pct = plmPrograms.length > 0 ? (count/plmPrograms.length)*100 : 0;
                if (count === 0) return null;
                return (
                  <div key={stage.key} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                    <div style={{ fontSize:11, color:T.text2, width:80, textAlign:"right" }}>{stage.label}</div>
                    <div style={{ flex:1, height:16, background:T.surface3, borderRadius:8, overflow:"hidden" }}>
                      <div style={{ width:`${pct}%`, height:"100%", background:stage.color, borderRadius:8, display:"flex", alignItems:"center", paddingLeft:6, minWidth:24 }}>
                        {count>0&&<span style={{ fontSize:9, fontWeight:700, color:"#fff" }}>{count}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div style={{ marginTop:12, display:"flex", flexDirection:"column", gap:5 }}>
                {plmPrograms.slice(0,3).map(p => (
                  <div key={p.id} onClick={()=>setActive("plm")} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 10px", borderRadius:7, background:T.surface2, cursor:"pointer" }}>
                    <div style={{ fontSize:11, flex:1, fontWeight:500 }}>{p.name}</div>
                    <span style={{ fontSize:9, fontWeight:700, padding:"2px 6px", borderRadius:4,
                      background: p.priority==="critical"?"#ef444420":p.priority==="high"?"#f9731620":"#22c55e15",
                      color: p.priority==="critical"?"#ef4444":p.priority==="high"?"#f97316":"#22c55e" }}>
                      {(p.current_stage||"").replace(/_/g," ").toUpperCase()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* ── KR Check-in Needed ── */}
      {staleKRs.length > 0 && (
        <div style={{ marginBottom:20 }}>
          <Card style={{ borderColor: "#eab30840", background: `linear-gradient(135deg, ${T.surface} 0%, #eab30808 100%)` }}>
            <SectionHeader title="Check-ins Needed" icon="📝" action={
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                {checkedInToday > 0 && <span style={{ fontSize:11, color:"#22c55e", fontWeight:600 }}>✓ {checkedInToday} done today</span>}
                <button onClick={() => setActive("okrs")} style={{ background:"none", border:"none", color:T.accent, fontSize:12, cursor:"pointer", fontWeight:500 }}>Go to OKRs →</button>
              </div>
            } />
            <div style={{ fontSize:12, color:T.text3, marginBottom:12 }}>
              These Key Results haven't been updated in 7+ days. A quick check-in keeps everyone aligned.
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
              {staleKRs.map(kr => {
                const last = lastCheckInByKR[kr.id];
                const daysSince = last ? Math.floor((Date.now() - new Date(last.created_at).getTime()) / 86400000) : null;
                const obj = objectives.find(o => o.id === kr.objective_id);
                const pct = Math.round(Number(kr.progress || 0));
                const urgentColor = daysSince === null ? "#ef4444" : daysSince >= 14 ? "#ef4444" : "#eab308";
                return (
                  <div key={kr.id} onClick={() => setActive("okrs")} style={{
                    display:"flex", alignItems:"center", gap:10, padding:"10px 14px",
                    borderRadius:8, background:T.surface2, cursor:"pointer",
                    border:`1px solid ${urgentColor}30`,
                    borderLeft:`3px solid ${urgentColor}`,
                  }}
                    onMouseEnter={e => e.currentTarget.style.background = T.surface3}
                    onMouseLeave={e => e.currentTarget.style.background = T.surface2}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:12, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", color:T.text }}>{kr.title}</div>
                      {obj && <div style={{ fontSize:10, color:T.text3, marginTop:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{obj.title}</div>}
                    </div>
                    <div style={{ flexShrink:0, display:"flex", flexDirection:"column", alignItems:"flex-end", gap:3 }}>
                      <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:8, background:urgentColor+"20", color:urgentColor }}>
                        {daysSince === null ? "Never" : `${daysSince}d ago`}
                      </span>
                      <div style={{ fontSize:10, color:T.text3 }}>{pct}% progress</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {/* ── Recent Activity + Approvals ── */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:20 }}>
        {/* Recent Activity */}
        <Card>
          <SectionHeader title="Recent Activity" icon="🕐" action={
            <button onClick={() => setActive("activity")} style={{ background:"none", border:"none", color:T.accent, fontSize:12, cursor:"pointer", fontWeight:500 }}>View all →</button>
          } />
          {recentActivity.length === 0 ? (
            <div style={{ fontSize:12, color:T.text3, textAlign:"center", padding:"24px 0" }}>No recent activity</div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:0 }}>
              {recentActivity.slice(0,8).map((act, i) => {
                const c = acol(act.user_id);
                return (
                  <div key={act.id} style={{ display:"flex", gap:10, padding:"8px 0", borderBottom: i<7?`1px solid ${T.border}`:"none" }}>
                    <div style={{ width:28, height:28, borderRadius:14, background:c+"20", border:`1.5px solid ${c}50`,
                      display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:700, color:c, flexShrink:0 }}>
                      {ini(act.user_id)}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:12, lineHeight:1.4 }}>
                        <span style={{ fontWeight:600 }}>{uname(act.user_id)}</span>{" "}
                        <span style={{ color:T.text2 }}>{act.action}</span>{" "}
                        <span style={{ color:T.text }}>{act.entity_name || act.entity_type}</span>
                      </div>
                      <div style={{ fontSize:10, color:T.text3 }}>{relTime(act.created_at)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Pending Approvals */}
        <Card>
          <SectionHeader title="Pending Approvals" icon="⏳" action={
            <button onClick={() => setActive("finance")} style={{ background:"none", border:"none", color:T.accent, fontSize:12, cursor:"pointer", fontWeight:500 }}>View all →</button>
          } />
          {pendingApprovals.length === 0 ? (
            <div style={{ fontSize:12, color:T.text3, textAlign:"center", padding:"24px 0" }}>
              <div style={{ fontSize:28, marginBottom:8 }}>✅</div>
              No pending approvals — you're all caught up!
            </div>
          ) : (
            <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
              {pendingApprovals.map(req => (
                <div key={req.id} style={{ padding:"10px 12px", background:T.surface2, borderRadius:9, border:`1px solid ${T.border}` }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:4 }}>
                    <div style={{ fontSize:13, fontWeight:600 }}>{req.entity_name || req.entity_type}</div>
                    {req.amount && <div style={{ fontSize:13, fontWeight:700, color:"#f97316" }}>{fmt$(req.amount)}</div>}
                  </div>
                  <div style={{ fontSize:11, color:T.text3, marginBottom:8 }}>{req.description || req.module} · {relTime(req.created_at)}</div>
                  <div style={{ display:"flex", gap:6 }}>
                    <button onClick={async()=>{
                      await supabase.from("approval_requests").update({status:"approved",decided_at:new Date().toISOString()}).eq("id",req.id);
                      setPendingApprovals(p=>p.filter(a=>a.id!==req.id));
                      notifySlack({ type:"approval", channel:"ben", title:"Approval Granted ✅", message:`${req.entity_name||req.entity_type} has been approved${req.amount?" ("+fmt$(req.amount)+")":""}`, url:"https://helm-app-six.vercel.app" });
                    }} style={{ flex:1, padding:"5px 0", fontSize:11, fontWeight:600, background:"#22c55e20", color:"#22c55e", border:"1px solid #22c55e40", borderRadius:5, cursor:"pointer" }}>✓ Approve</button>
                    <button onClick={async()=>{
                      await supabase.from("approval_requests").update({status:"rejected",decided_at:new Date().toISOString()}).eq("id",req.id);
                      setPendingApprovals(p=>p.filter(a=>a.id!==req.id));
                      notifySlack({ type:"approval", channel:"ben", title:"Approval Rejected ❌", message:`${req.entity_name||req.entity_type} was rejected`, url:"https://helm-app-six.vercel.app" });
                    }} style={{ flex:1, padding:"5px 0", fontSize:11, fontWeight:600, background:"#ef444410", color:"#ef4444", border:"1px solid #ef444430", borderRadius:5, cursor:"pointer" }}>✕ Reject</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {/* Quick project health */}
          <div style={{ marginTop:16, paddingTop:16, borderTop:`1px solid ${T.border}` }}>
            <div style={{ fontSize:12, fontWeight:700, color:T.text3, marginBottom:10, textTransform:"uppercase", letterSpacing:0.5 }}>Project Health</div>
            {projects.slice(0,4).map(proj => {
              const pt = tasks.filter(t=>t.project_id===proj.id&&!t.parent_task_id);
              const pd = pt.filter(t=>t.status==="done").length;
              const pct = pt.length>0?Math.round((pd/pt.length)*100):0;
              const od = pt.filter(t=>t.due_date&&t.due_date<todayStr&&t.status!=="done").length;
              return (
                <div key={proj.id} style={{ display:"flex", alignItems:"center", gap:8, marginBottom:7 }}>
                  <div style={{ width:24, height:24, borderRadius:6, background:proj.color||T.accent, display:"flex", alignItems:"center", justifyContent:"center", fontSize:10, fontWeight:800, color:"#fff", flexShrink:0 }}>{proj.name.charAt(0)}</div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:11, fontWeight:500, marginBottom:3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{proj.name}</div>
                    <div style={{ height:4, borderRadius:4, background:T.surface3, overflow:"hidden" }}>
                      <div style={{ width:`${pct}%`, height:"100%", background:od>0?"#ef4444":proj.color||T.accent, borderRadius:4 }} />
                    </div>
                  </div>
                  <span style={{ fontSize:11, fontWeight:700, color:od>0?"#ef4444":T.text2, minWidth:30, textAlign:"right" }}>{pct}%</span>
                </div>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
