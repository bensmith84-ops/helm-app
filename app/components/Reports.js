"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";
import { useResponsive } from "../lib/responsive";
import { useAuth } from "../lib/auth";

const fmt$ = (v) => { if(!v&&v!==0) return "—"; const abs=Math.abs(v); const s=v<0?"-":""; return abs>=1e6?s+"$"+(abs/1e6).toFixed(1)+"M":abs>=1e3?s+"$"+(abs/1e3).toFixed(0)+"K":s+"$"+abs.toFixed(0); };
const fmtN = (v) => v==null?"—":Number(v).toLocaleString();
const fmtPct = (v) => v==null?"—":v.toFixed(1)+"%";

const STATUS_COLORS = {
  backlog:"#6b7280",todo:"#8b93a8",in_progress:"#3b82f6",in_review:"#a855f7",done:"#22c55e",cancelled:"#ef4444"
};

const REPORT_TABS = ["Executive Summary","Projects","OKRs","Finance","PLM","Team"];

function StatCard({ label, value, sub, color, icon }) {
  return (
    <div style={{ padding:"16px 20px", background:T.surface, border:`1px solid ${T.border}`, borderRadius:10 }}>
      <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:6 }}>
        {icon&&<span style={{ fontSize:14 }}>{icon}</span>}
        <span style={{ fontSize:11, color:T.text3, fontWeight:600, textTransform:"uppercase", letterSpacing:0.5 }}>{label}</span>
      </div>
      <div style={{ fontSize:26, fontWeight:800, color:color||T.text, lineHeight:1 }}>{value}</div>
      {sub&&<div style={{ fontSize:11, color:T.text3, marginTop:4 }}>{sub}</div>}
    </div>
  );
}

function HorizBar({ label, value, max, color, count, pct }) {
  return (
    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
      <span style={{ fontSize:11, color:T.text2, width:90, textAlign:"right", flexShrink:0 }}>{label}</span>
      <div style={{ flex:1, height:18, background:T.surface3, borderRadius:4, overflow:"hidden" }}>
        <div style={{ width:`${max>0?(value/max)*100:0}%`, height:"100%", background:color||T.accent, borderRadius:4, transition:"width 0.4s", display:"flex", alignItems:"center", paddingLeft:4 }}>
          {value>max*0.15&&<span style={{ fontSize:9, color:"#fff", fontWeight:700 }}>{count}</span>}
        </div>
      </div>
      <span style={{ fontSize:11, fontWeight:600, color:T.text, width:30, textAlign:"right" }}>{count}</span>
      {pct!=null&&<span style={{ fontSize:10, color:T.text3, width:32 }}>{fmtPct(pct)}</span>}
    </div>
  );
}

function Card({ title, children, action }) {
  return (
    <div style={{ background:T.surface, border:`1px solid ${T.border}`, borderRadius:12, padding:20 }}>
      {(title||action)&&<div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:16 }}>
        {title&&<div style={{ fontSize:14, fontWeight:700 }}>{title}</div>}
        {action}
      </div>}
      {children}
    </div>
  );
}

export default function ReportsView() {
  const { isMobile } = useResponsive();
  const { profile , orgId } = useAuth();
  const [activeTab, setActiveTab] = useState("Executive Summary");
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({});
  const [dateRange, setDateRange] = useState("30d");
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    setLoading(true);
    const yr = new Date().getFullYear();
    const curMonth = new Date().getMonth() + 1;
    const today = new Date().toISOString().split("T")[0];

    const [
      { data: projects }, { data: tasks }, { data: profiles },
      { data: objectives }, { data: keyResults }, { data: cycles },
      { data: plmPrograms }, { data: plmIssues },
      { data: finMetrics }, { data: scorecardMetrics }, { data: scorecardEntries },
      { data: data11 },
    ] = await Promise.all([
      supabase.from("projects").select("*").is("deleted_at", null),
      supabase.from("tasks").select("*").is("deleted_at", null),
      supabase.from("profiles").select("id,display_name"),
      supabase.from("objectives").select("*").eq("org_id", orgId).is("deleted_at", null),
      supabase.from("key_results").select("*").eq("org_id", orgId).is("deleted_at", null),
      supabase.from("okr_cycles").select("*").eq("org_id", orgId).order("start_date",{ascending:false}),
      supabase.from("plm_programs").select("*").eq("org_id", orgId).is("deleted_at", null),
      supabase.from("plm_issues").select("*").eq("org_id", orgId).eq("status","open"),
      supabase.from("okr_financial_metrics").select("*").eq("year",yr),
      supabase.from("scorecard_metrics").select("*").eq("active",true),
      supabase.from("scorecard_entries").select("*").gte("week_start", `${yr}-01-01`),
      supabase.from("okr_check_ins").select("key_result_id,check_in_date,health_status,value,created_at").eq("org_id", orgId).order("created_at", { ascending: false }),
    ]);

    const profMap = {};
    (profiles||[]).forEach(u => { profMap[u.id]=u; });

    // Financial data
    let finMonthly = {};
    if (finMetrics?.length) {
      const { data: mData } = await supabase.from("okr_financial_monthly")
        .select("*").in("metric_id", finMetrics.map(m=>m.id)).eq("year",yr);
      (mData||[]).forEach(r => {
        if (!finMonthly[r.metric_id]) finMonthly[r.metric_id]={};
        finMonthly[r.metric_id][r.month]=r;
      });
    }

    const checkIns = data11 || [];
    setData({ projects:projects||[], tasks:tasks||[], profiles:profMap,
      objectives:objectives||[], keyResults:keyResults||[], cycles:cycles||[],
      plmPrograms:plmPrograms||[], plmIssues:plmIssues||[],
      finMetrics:finMetrics||[], finMonthly, curMonth, today,
      scorecardMetrics:scorecardMetrics||[], scorecardEntries:scorecardEntries||[],
      checkIns });
    setLoading(false);
  };

  const exportCSV = (rows, filename) => {
    if (!rows.length) return;
    const keys = Object.keys(rows[0]);
    const csv = [keys.join(","), ...rows.map(r => keys.map(k => `"${r[k]??""}""`).join(","))].join("\n");
    const blob = new Blob([csv], { type:"text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  };

  if (loading) return <div style={{ display:"flex", height:"100%", alignItems:"center", justifyContent:"center", color:T.text3, fontSize:13 }}>Building reports…</div>;

  const { projects, tasks, profiles, objectives, keyResults, cycles, plmPrograms, plmIssues,
    finMetrics, finMonthly, curMonth, today, scorecardMetrics, scorecardEntries, checkIns } = data;

  // Derived
  const activeCycle = cycles.find(c=>c.status==="active")||cycles[0];
  const cycleObjs = activeCycle ? objectives.filter(o=>o.cycle_id===activeCycle.id) : objectives;
  const openTasks = tasks.filter(t=>t.status!=="done"&&t.status!=="cancelled");
  const doneTasks = tasks.filter(t=>t.status==="done");
  const overdueTasks = openTasks.filter(t=>t.due_date&&t.due_date<today);
  const completionPct = tasks.length>0?Math.round((doneTasks.length/tasks.length)*100):0;
  const okrProgress = cycleObjs.length>0?Math.round(cycleObjs.reduce((s,o)=>s+Number(o.progress||0),0)/cycleObjs.length):0;

  const revMetric = finMetrics.find(m=>m.metric_key==="revenue");
  const netMetric = finMetrics.find(m=>m.metric_key==="net_dollars");
  const ytdRev = revMetric ? Object.entries(finMonthly[revMetric.id]||{}).filter(([m])=>Number(m)<=curMonth).reduce((s,[,r])=>s+(r.actual||0),0) : null;
  const ytdNet = netMetric ? Object.entries(finMonthly[netMetric.id]||{}).filter(([m])=>Number(m)<=curMonth).reduce((s,[,r])=>s+(r.actual||0),0) : null;

  const plmByStage = {};
  plmPrograms.forEach(p => { plmByStage[p.current_stage]=(plmByStage[p.current_stage]||0)+1; });
  const inDev = plmPrograms.filter(p=>["development","optimization","validation","feasibility","concept","scale_up","regulatory"].includes(p.current_stage)).length;

  // Status distribution
  const statusDist = {};
  tasks.filter(t=>!t.parent_task_id).forEach(t=>{ statusDist[t.status]=(statusDist[t.status]||0)+1; });

  // Assignee workload
  const assigneeMap = {};
  openTasks.filter(t=>t.assignee_id&&!t.parent_task_id).forEach(t=>{ assigneeMap[t.assignee_id]=(assigneeMap[t.assignee_id]||0)+1; });
  const topAssignees = Object.entries(assigneeMap).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const maxWork = topAssignees[0]?.[1]||1;

  // Scorecard hit rates
  const metricHits = scorecardMetrics.map(m => {
    const ents = scorecardEntries.filter(e=>e.metric_id===m.id);
    const hits = ents.filter(e=>e.value!=null&&m.goal!=null&&e.value>=m.goal).length;
    return { ...m, hits, total:ents.length, hitPct: ents.length>0?Math.round((hits/ents.length)*100):null };
  });

  const ini = uid => { const u=profiles[uid]; return u?.display_name?u.display_name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase():"?"; };
  const uname = uid => profiles[uid]?.display_name||"Unknown";

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>
      {/* Header */}
      <div style={{ padding:"18px 28px 0", borderBottom:`1px solid ${T.border}`, background:T.surface, flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
          <div>
            <h2 style={{ fontSize:20, fontWeight:700, marginBottom:2 }}>Reports</h2>
            <div style={{ fontSize:12, color:T.text3 }}>Business intelligence across all modules · {new Date().toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"})}</div>
          </div>
          <div style={{ display:"flex", gap:8 }}>
            <button onClick={() => exportCSV(tasks.map(t=>({id:t.id,title:t.title,status:t.status,priority:t.priority,due_date:t.due_date,project:projects.find(p=>p.id===t.project_id)?.name})),"helm-tasks.csv")}
              style={{ padding:"7px 14px", fontSize:12, fontWeight:600, background:T.surface2, color:T.text2, border:`1px solid ${T.border}`, borderRadius:7, cursor:"pointer" }}>
              ↓ Export
            </button>
          </div>
        </div>
        <div style={{ display:"flex", gap:0, overflowX:"auto" }}>
          {REPORT_TABS.map(tab => (
            <button key={tab} onClick={()=>setActiveTab(tab)} style={{ padding:"9px 16px", fontSize:12, fontWeight:500, border:"none", background:"none", cursor:"pointer", whiteSpace:"nowrap",
              color:activeTab===tab?T.accent:T.text3, borderBottom:`2px solid ${activeTab===tab?T.accent:"transparent"}`, transition:"color 0.15s" }}>
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex:1, overflow:"auto", padding:"24px 28px" }}>

        {/* ── Executive Summary ── */}
        {activeTab==="Executive Summary" && (
          <div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(160px, 1fr))", gap:12, marginBottom:24 }}>
              <StatCard icon="📈" label="YTD Revenue" value={ytdRev!=null?fmt$(ytdRev):"—"} sub={revMetric?.target_annual?`Target: ${fmt$(revMetric.target_annual)}`:"Add financial data"} color="#22c55e" />
              <StatCard icon="💵" label="YTD Net $" value={ytdNet!=null?fmt$(ytdNet):"—"} sub={ytdRev&&ytdNet?`${((ytdNet/ytdRev)*100).toFixed(1)}% margin`:""} color={ytdNet!=null&&ytdNet>=0?"#22c55e":"#ef4444"} />
              <StatCard icon="◎" label="OKR Progress" value={`${okrProgress}%`} sub={`${cycleObjs.filter(o=>o.health==="on_track").length}/${cycleObjs.length} on track`} color={okrProgress>=60?"#22c55e":okrProgress>=30?"#eab308":"#ef4444"} />
              <StatCard icon="☐" label="Tasks Done" value={`${completionPct}%`} sub={`${doneTasks.length}/${tasks.length} complete`} color={completionPct>=70?"#22c55e":T.text} />
              <StatCard icon="⬢" label="PLM Programs" value={plmPrograms.length} sub={`${inDev} in development`} color={T.accent} />
              <StatCard icon="⚠️" label="Open Issues" value={plmIssues.length} sub="PLM issues" color={plmIssues.length>5?"#ef4444":T.text} />
            </div>

            <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:20, marginBottom:20 }}>
              {/* Monthly Revenue Chart */}
              <Card title="Monthly Revenue">
                {revMetric&&Object.keys(finMonthly[revMetric.id]||{}).length>0 ? (
                  <div>
                    <div style={{ display:"flex", alignItems:"flex-end", gap:3, height:100, marginBottom:8 }}>
                      {Array.from({length:12},(_,i)=>i+1).map(m=>{
                        const v = finMonthly[revMetric.id]?.[m]?.actual||0;
                        const maxV = Math.max(...Array.from({length:12},(_,i)=>finMonthly[revMetric.id]?.[i+1]?.actual||0),1);
                        const h = Math.max(2,(v/maxV)*96);
                        const isCur = m===curMonth, isFuture=m>curMonth;
                        const months=["J","F","M","A","M","J","J","A","S","O","N","D"];
                        return (
                          <div key={m} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:2 }}>
                            <div style={{ width:"100%", height:`${h}px`, borderRadius:"3px 3px 0 0",
                              background:isFuture?T.surface3:isCur?T.accent:T.accent+"70", transition:"height 0.4s" }} />
                            <div style={{ fontSize:8, color:isCur?T.accent:T.text3, fontWeight:isCur?700:400 }}>{months[m-1]}</div>
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, color:T.text3 }}>
                      <span>YTD: <strong style={{ color:T.text }}>{fmt$(ytdRev)}</strong></span>
                      {revMetric.target_annual&&<span>Annual target: <strong style={{ color:T.text }}>{fmt$(revMetric.target_annual)}</strong></span>}
                    </div>
                  </div>
                ) : <div style={{ fontSize:12, color:T.text3, padding:"24px 0", textAlign:"center" }}>Sync financial data from Google Sheets to see revenue charts</div>}
              </Card>

              {/* OKR Health */}
              <Card title={`OKR Health — ${activeCycle?.name||"Current Cycle"}`}>
                {cycleObjs.length===0 ? <div style={{ fontSize:12, color:T.text3, padding:"24px 0", textAlign:"center" }}>No objectives in current cycle</div> : (
                  cycleObjs.map(obj => {
                    const pct = Math.round(Number(obj.progress||0));
                    const hColor = obj.health==="on_track"?"#22c55e":obj.health==="at_risk"?"#eab308":"#ef4444";
                    const krs = keyResults.filter(k=>k.objective_id===obj.id);
                    return (
                      <div key={obj.id} style={{ marginBottom:14 }}>
                        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
                          <div style={{ fontSize:12, fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", flex:1, marginRight:8 }}>{obj.title}</div>
                          <span style={{ fontSize:11, fontWeight:700, color:hColor, flexShrink:0 }}>{pct}%</span>
                        </div>
                        <div style={{ height:6, borderRadius:6, background:T.surface3, overflow:"hidden" }}>
                          <div style={{ width:`${pct}%`, height:"100%", background:hColor, borderRadius:6 }} />
                        </div>
                        <div style={{ fontSize:10, color:T.text3, marginTop:3 }}>{krs.length} key results</div>
                      </div>
                    );
                  })
                )}
              </Card>
            </div>

            {/* Highlights & Flags */}
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:16 }}>
              <Card title="🟢 Highlights">
                {[
                  cycleObjs.filter(o=>o.health==="on_track").length>0&&`${cycleObjs.filter(o=>o.health==="on_track").length} OKRs on track`,
                  doneTasks.length>0&&`${doneTasks.length} tasks completed`,
                  plmPrograms.filter(p=>p.current_stage==="launch_ready").length>0&&`${plmPrograms.filter(p=>p.current_stage==="launch_ready").length} product(s) launch ready`,
                  ytdRev>0&&`YTD revenue: ${fmt$(ytdRev)}`,
                ].filter(Boolean).map((h,i) => (
                  <div key={i} style={{ fontSize:12, color:T.text, padding:"6px 0", borderBottom:i<3?`1px solid ${T.border}`:"none" }}>✓ {h}</div>
                ))}
              </Card>
              <Card title="🟡 Attention Needed">
                {[
                  cycleObjs.filter(o=>o.health==="at_risk").length>0&&`${cycleObjs.filter(o=>o.health==="at_risk").length} OKRs at risk`,
                  overdueTasks.length>0&&`${overdueTasks.length} overdue tasks`,
                  plmIssues.length>0&&`${plmIssues.length} open PLM issues`,
                ].filter(Boolean).map((h,i) => (
                  <div key={i} style={{ fontSize:12, color:T.text, padding:"6px 0", borderBottom:i<2?`1px solid ${T.border}`:"none" }}>⚡ {h}</div>
                ))}
                {cycleObjs.filter(o=>o.health==="at_risk").length===0&&overdueTasks.length===0&&plmIssues.length===0&&(
                  <div style={{ fontSize:12, color:T.text3 }}>Nothing flagged</div>
                )}
              </Card>
              <Card title="🔴 Critical">
                {[
                  cycleObjs.filter(o=>o.health==="off_track").length>0&&`${cycleObjs.filter(o=>o.health==="off_track").length} OKRs off track`,
                  plmIssues.filter(i=>i.severity==="critical").length>0&&`${plmIssues.filter(i=>i.severity==="critical").length} critical PLM issues`,
                ].filter(Boolean).map((h,i) => (
                  <div key={i} style={{ fontSize:12, color:"#ef4444", padding:"6px 0", borderBottom:`1px solid ${T.border}` }}>🚨 {h}</div>
                ))}
                {cycleObjs.filter(o=>o.health==="off_track").length===0&&plmIssues.filter(i=>i.severity==="critical").length===0&&(
                  <div style={{ fontSize:12, color:T.text3 }}>No critical issues</div>
                )}
              </Card>
            </div>
          </div>
        )}

        {/* ── Projects ── */}
        {activeTab==="Projects" && (() => {
          // Build 8-week task completion velocity
          const weeks8 = [];
          for (let i = 7; i >= 0; i--) {
            const d = new Date(); d.setDate(d.getDate() - i * 7);
            const ws = new Date(d); ws.setDate(d.getDate() - d.getDay() + 1);
            weeks8.push(ws.toISOString().split("T")[0]);
          }
          const completedByWeek = {};
          doneTasks.filter(t => t.completed_at).forEach(t => {
            const d = new Date(t.completed_at);
            const ws = new Date(d); ws.setDate(d.getDate() - d.getDay() + 1);
            const wk = ws.toISOString().split("T")[0];
            completedByWeek[wk] = (completedByWeek[wk] || 0) + 1;
          });
          const maxVel = Math.max(...weeks8.map(w => completedByWeek[w] || 0), 1);

          return (
          <div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:24 }}>
              <StatCard icon="◫" label="Total Projects" value={projects.length} />
              <StatCard icon="☐" label="Total Tasks" value={fmtN(tasks.length)} />
              <StatCard icon="✓" label="Completed" value={fmtN(doneTasks.length)} sub={`${completionPct}% completion`} color="#22c55e" />
              <StatCard icon="⚠️" label="Overdue" value={fmtN(overdueTasks.length)} color={overdueTasks.length>0?"#ef4444":T.text3} />
            </div>
            <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:20, marginBottom:20 }}>
              <Card title="Task Completion Velocity (8 weeks)">
                <div style={{ display:"flex", alignItems:"flex-end", gap:8, height:80, marginBottom:8 }}>
                  {weeks8.map((w, i) => {
                    const count = completedByWeek[w] || 0;
                    const h = Math.max(4, (count / maxVel) * 72);
                    const d = new Date(w + "T12:00:00");
                    const isCur = i === weeks8.length - 1;
                    return (
                      <div key={w} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
                        {count > 0 && <div style={{ fontSize:9, color:T.text3 }}>{count}</div>}
                        <div style={{ width:"100%", height:`${h}px`, borderRadius:"3px 3px 0 0",
                          background: isCur ? "#22c55e" : count > 0 ? "#22c55e70" : T.surface3,
                          transition:"height 0.4s" }} />
                        <div style={{ fontSize:8, color:isCur?T.accent:T.text3, fontWeight:isCur?700:400 }}>
                          {d.toLocaleDateString("en-US",{month:"short",day:"numeric"})}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontSize:11, color:T.text3, textAlign:"center" }}>
                  {doneTasks.filter(t=>t.completed_at&&Date.now()-new Date(t.completed_at).getTime()<56*86400000).length} completed in last 8 weeks
                </div>
              </Card>
              <Card title="Status Distribution">
                {Object.entries(STATUS_COLORS).map(([k,c])=>(
                  <HorizBar key={k} label={k.replace(/_/g," ")} value={statusDist[k]||0} max={tasks.length} color={c} count={statusDist[k]||0} pct={tasks.length>0?((statusDist[k]||0)/tasks.length)*100:null} />
                ))}
              </Card>
            </div>
            <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:20, marginBottom:20 }}>
              <Card title="Priority Breakdown">
                {[{k:"urgent",l:"Urgent",c:"#ef4444"},{k:"high",l:"High",c:"#f97316"},{k:"medium",l:"Medium",c:"#eab308"},{k:"low",l:"Low",c:"#22c55e"}].map(p=>{
                  const open = openTasks.filter(t=>t.priority===p.k).length;
                  return <HorizBar key={p.k} label={p.l} value={open} max={openTasks.length} color={p.c} count={open} pct={openTasks.length>0?(open/openTasks.length)*100:null} />;
                })}
              </Card>
              <Card title="Workload by Assignee">
                {topAssignees.map(([uid,count])=>(
                  <div key={uid} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                    <div style={{ width:28, height:28, borderRadius:14, background:"#3b82f620", border:"1.5px solid #3b82f650", display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:700, color:"#3b82f6", flexShrink:0 }}>{ini(uid)}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:11, fontWeight:500, marginBottom:3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{uname(uid)}</div>
                      <div style={{ height:8, borderRadius:8, background:T.surface3, overflow:"hidden" }}>
                        <div style={{ width:`${(count/maxWork)*100}%`, height:"100%", borderRadius:8, background:count>maxWork*0.8?"#ef4444":T.accent }} />
                      </div>
                    </div>
                    <span style={{ fontSize:12, fontWeight:600, color:T.text2, minWidth:24, textAlign:"right" }}>{count}</span>
                  </div>
                ))}
                {topAssignees.length===0&&<div style={{ fontSize:12, color:T.text3 }}>No assigned tasks</div>}
              </Card>
            </div>
            <Card title="Project Health">
              {projects.map(proj => {
                const pt = tasks.filter(t=>t.project_id===proj.id&&!t.parent_task_id);
                const pd = pt.filter(t=>t.status==="done").length;
                const pct2 = pt.length>0?Math.round((pd/pt.length)*100):0;
                const od = pt.filter(t=>t.due_date&&t.due_date<today&&t.status!=="done").length;
                const hColor = od > pt.length * 0.2 ? "#ef4444" : od > 0 ? "#eab308" : "#22c55e";
                return (
                  <div key={proj.id} style={{ display:"flex", alignItems:"center", gap:14, padding:"12px 0", borderBottom:`1px solid ${T.border}` }}>
                    <div style={{ width:34, height:34, borderRadius:8, background:proj.color||T.accent, display:"flex", alignItems:"center", justifyContent:"center", fontSize:14, fontWeight:800, color:"#fff", flexShrink:0 }}>{(proj.emoji||proj.name.charAt(0))}</div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:600, marginBottom:5 }}>{proj.name}</div>
                      <div style={{ height:6, borderRadius:6, background:T.surface3, overflow:"hidden" }}>
                        <div style={{ width:`${pct2}%`, height:"100%", borderRadius:6, background:hColor }} />
                      </div>
                    </div>
                    <div style={{ textAlign:"right", minWidth:110 }}>
                      <div style={{ fontSize:18, fontWeight:700, color:hColor }}>{pct2}%</div>
                      <div style={{ fontSize:10, color:T.text3 }}>{pd}/{pt.length} · {od>0?<span style={{ color:"#ef4444" }}>{od} late</span>:"all good"}</div>
                    </div>
                  </div>
                );
              })}
            </Card>
          </div>
          );
        })()}

        {activeTab==="OKRs" && (() => {
          // Build 8-week check-in activity heatmap
          const weeks = [];
          for (let i = 7; i >= 0; i--) {
            const d = new Date(); d.setDate(d.getDate() - i * 7);
            const ws = new Date(d); ws.setDate(d.getDate() - d.getDay() + 1);
            weeks.push(ws.toISOString().split("T")[0]);
          }
          const checkInsByWeek = {};
          (checkIns||[]).forEach(ci => {
            const d = new Date(ci.created_at);
            const ws = new Date(d); ws.setDate(d.getDate() - d.getDay() + 1);
            const wk = ws.toISOString().split("T")[0];
            checkInsByWeek[wk] = (checkInsByWeek[wk] || 0) + 1;
          });
          const maxCI = Math.max(...weeks.map(w => checkInsByWeek[w] || 0), 1);

          // KRs sorted by staleness
          const krStaleness = cycleObjs.flatMap(obj =>
            keyResults.filter(k => k.objective_id === obj.id).map(kr => {
              const lastCI = (checkIns||[]).find(c => c.key_result_id === kr.id);
              const daysAgo = lastCI ? Math.floor((Date.now() - new Date(lastCI.created_at).getTime()) / 86400000) : 999;
              return { ...kr, objTitle: obj.title, daysAgo };
            })
          ).sort((a, b) => b.daysAgo - a.daysAgo);

          return (
          <div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:24 }}>
              <StatCard icon="◎" label="Objectives" value={cycleObjs.length} sub={activeCycle?.name} />
              <StatCard icon="✅" label="On Track" value={cycleObjs.filter(o=>o.health==="on_track").length} color="#22c55e" />
              <StatCard icon="⚡" label="At Risk" value={cycleObjs.filter(o=>o.health==="at_risk").length} color="#eab308" />
              <StatCard icon="📝" label="Check-ins (8wk)" value={(checkIns||[]).filter(ci => {
                const d = new Date(ci.created_at);
                return Date.now() - d.getTime() < 56 * 86400000;
              }).length} color={T.accent} />
            </div>

            <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:20, marginBottom:20 }}>
              {/* Check-in activity */}
              <Card title="Check-in Activity (8 weeks)">
                <div style={{ display:"flex", alignItems:"flex-end", gap:8, height:80, marginBottom:8 }}>
                  {weeks.map((w, i) => {
                    const count = checkInsByWeek[w] || 0;
                    const h = Math.max(4, (count / maxCI) * 72);
                    const d = new Date(w + "T12:00:00");
                    const isCur = i === weeks.length - 1;
                    return (
                      <div key={w} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
                        {count > 0 && <div style={{ fontSize:9, color:T.text3 }}>{count}</div>}
                        <div style={{ width:"100%", height:`${h}px`, borderRadius:"3px 3px 0 0",
                          background: isCur ? T.accent : count > 0 ? T.accent+"70" : T.surface3,
                          transition:"height 0.4s" }} />
                        <div style={{ fontSize:8, color:isCur?T.accent:T.text3, fontWeight:isCur?700:400 }}>
                          {d.toLocaleDateString("en-US",{month:"short",day:"numeric"})}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div style={{ fontSize:11, color:T.text3, textAlign:"center" }}>
                  {(checkIns||[]).length} total check-ins · {Object.values(checkInsByWeek).reduce((s,v)=>s+v,0) > 0 ? `avg ${(Object.values(checkInsByWeek).reduce((s,v)=>s+v,0)/8).toFixed(1)}/week` : "no data yet"}
                </div>
              </Card>

              {/* KR Staleness */}
              <Card title="KR Check-in Recency">
                <div style={{ maxHeight:200, overflow:"auto" }}>
                  {krStaleness.slice(0, 8).map(kr => {
                    const color = kr.daysAgo >= 14 ? "#ef4444" : kr.daysAgo >= 7 ? "#eab308" : "#22c55e";
                    return (
                      <div key={kr.id} style={{ display:"flex", alignItems:"center", gap:10, padding:"7px 0", borderBottom:`1px solid ${T.border}` }}>
                        <div style={{ width:8, height:8, borderRadius:"50%", background:color, flexShrink:0 }} />
                        <div style={{ flex:1, minWidth:0 }}>
                          <div style={{ fontSize:12, fontWeight:500, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{kr.title}</div>
                          <div style={{ fontSize:10, color:T.text3 }}>{kr.objTitle}</div>
                        </div>
                        <span style={{ fontSize:11, fontWeight:700, color, flexShrink:0 }}>
                          {kr.daysAgo === 999 ? "Never" : `${kr.daysAgo}d ago`}
                        </span>
                      </div>
                    );
                  })}
                  {krStaleness.length === 0 && <div style={{ fontSize:12, color:T.text3, padding:"16px 0", textAlign:"center" }}>No KRs in active cycle</div>}
                </div>
              </Card>
            </div>

            <Card title="All Objectives">
              {cycleObjs.map(obj => {
                const krs = keyResults.filter(k=>k.objective_id===obj.id);
                const pct2 = Math.round(Number(obj.progress||0));
                const hColor = obj.health==="on_track"?"#22c55e":obj.health==="at_risk"?"#eab308":"#ef4444";
                return (
                  <div key={obj.id} style={{ padding:"14px 0", borderBottom:`1px solid ${T.border}` }}>
                    <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                      <div style={{ width:10, height:10, borderRadius:"50%", background:hColor, flexShrink:0 }} />
                      <div style={{ fontSize:14, fontWeight:600, flex:1 }}>{obj.title}</div>
                      <span style={{ fontSize:12, fontWeight:700, color:hColor }}>{pct2}%</span>
                    </div>
                    <div style={{ height:6, borderRadius:6, background:T.surface3, overflow:"hidden", marginBottom:10 }}>
                      <div style={{ width:`${pct2}%`, height:"100%", background:hColor, borderRadius:6 }} />
                    </div>
                    {krs.map(kr => {
                      const krPct = kr.target_value>0?Math.min(100,Math.round((Number(kr.current_value||0)/Number(kr.target_value))*100)):0;
                      const lastCI = (checkIns||[]).find(c=>c.key_result_id===kr.id);
                      const dAgo = lastCI ? Math.floor((Date.now()-new Date(lastCI.created_at).getTime())/86400000) : null;
                      return (
                        <div key={kr.id} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:5, paddingLeft:20 }}>
                          <div style={{ fontSize:11, color:T.text2, flex:1 }}>{kr.title}</div>
                          <div style={{ width:80, height:4, borderRadius:4, background:T.surface3, overflow:"hidden" }}>
                            <div style={{ width:`${krPct}%`, height:"100%", background:T.accent, borderRadius:4 }} />
                          </div>
                          <span style={{ fontSize:10, color:T.text3, minWidth:30, textAlign:"right" }}>{krPct}%</span>
                          <span style={{ fontSize:9, padding:"1px 5px", borderRadius:4, background: dAgo===null||dAgo>=7?"#ef444415":T.accentDim, color:dAgo===null||dAgo>=7?"#ef4444":T.accent, fontWeight:600, minWidth:44, textAlign:"center" }}>
                            {dAgo===null?"never":dAgo===0?"today":`${dAgo}d ago`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
              {cycleObjs.length===0&&<div style={{ fontSize:12, color:T.text3, padding:"24px 0", textAlign:"center" }}>No objectives in the active cycle</div>}
            </Card>
          </div>
          );
        })()}

        {/* ── Finance ── */}
        {activeTab==="Finance" && (
          <div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:24 }}>
              <StatCard icon="📈" label="YTD Revenue" value={fmt$(ytdRev)} color="#22c55e" sub={revMetric?.target_annual?`${ytdRev&&revMetric.target_annual?((ytdRev/revMetric.target_annual)*100).toFixed(0):0}% of annual target`:""}/>
              <StatCard icon="💵" label="YTD Net $" value={fmt$(ytdNet)} color={ytdNet!=null&&ytdNet>=0?"#22c55e":"#ef4444"} sub={ytdRev&&ytdNet?`${((ytdNet/ytdRev)*100).toFixed(1)}% net margin`:""}/>
              <StatCard icon="🎯" label="Annual Target" value={revMetric?.target_annual?fmt$(revMetric.target_annual):"Not set"} color={T.accent} />
            </div>

            {finMetrics.map(metric => {
              const monthly = finMonthly[metric.id]||{};
              const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
              return (
                <Card key={metric.id} title={metric.metric_label} action={
                  <span style={{ fontSize:11, color:T.text3 }}>YTD: {fmt$(Object.entries(monthly).filter(([m])=>Number(m)<=curMonth).reduce((s,[,r])=>s+(r.actual||0),0))}</span>
                }>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(12,1fr)", gap:6 }}>
                    {Array.from({length:12},(_,i)=>i+1).map(m=>{
                      const row = monthly[m]||{};
                      const isCur=m===curMonth, isFuture=m>curMonth;
                      const onTarget = row.actual!=null&&row.target!=null&&row.actual>=row.target;
                      return (
                        <div key={m} style={{ background:isCur?T.accentDim:T.surface2, border:`1px solid ${isCur?T.accent:T.border}`, borderRadius:6, padding:"8px 6px", textAlign:"center" }}>
                          <div style={{ fontSize:9, fontWeight:700, color:isCur?T.accent:T.text3, marginBottom:4 }}>{months[m-1]}</div>
                          <div style={{ fontSize:11, fontWeight:700, color:isFuture?T.text3:row.actual!=null?onTarget?"#22c55e":"#ef4444":T.border }}>
                            {isFuture?"—":row.actual!=null?fmt$(row.actual):"—"}
                          </div>
                          {row.target!=null&&<div style={{ fontSize:9, color:T.text3 }}>{fmt$(row.target)}</div>}
                        </div>
                      );
                    })}
                  </div>
                </Card>
              );
            })}
            {finMetrics.length===0&&<Card><div style={{ textAlign:"center", padding:"32px 0", color:T.text3 }}>
              <div style={{ fontSize:32, marginBottom:8 }}>📊</div>
              <div style={{ fontSize:14, fontWeight:600, marginBottom:4 }}>No financial data yet</div>
              <div style={{ fontSize:12 }}>Go to OKRs → Sync from Sheet to import financial data</div>
            </div></Card>}
          </div>
        )}

        {/* ── PLM ── */}
        {activeTab==="PLM" && (
          <div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:24 }}>
              <StatCard icon="⬢" label="Total Programs" value={plmPrograms.length} />
              <StatCard icon="🔬" label="In Development" value={inDev} color={T.accent} />
              <StatCard icon="🚀" label="Launch Ready" value={plmPrograms.filter(p=>p.current_stage==="launch_ready").length} color="#f97316" />
              <StatCard icon="⚠️" label="Open Issues" value={plmIssues.length} color={plmIssues.length>0?"#ef4444":T.text3} />
            </div>
            <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:20 }}>
              <Card title="Programs by Stage">
                {["ideation","concept","feasibility","development","optimization","validation","scale_up","regulatory","launch_ready","launched"].map(stage=>{
                  const count = plmPrograms.filter(p=>p.current_stage===stage).length;
                  if(count===0) return null;
                  return <HorizBar key={stage} label={stage.replace(/_/g," ")} value={count} max={plmPrograms.length} color={T.accent} count={count} />;
                })}
              </Card>
              <Card title="Programs by Priority">
                {["critical","high","medium","low"].map(pri=>{
                  const count = plmPrograms.filter(p=>p.priority===pri).length;
                  const colors = {critical:"#ef4444",high:"#f97316",medium:"#eab308",low:"#22c55e"};
                  return <HorizBar key={pri} label={pri} value={count} max={plmPrograms.length} color={colors[pri]} count={count} />;
                })}
              </Card>
            </div>
            <div style={{ marginTop:20 }}>
              <Card title="Active Programs">
                <table style={{ width:"100%", borderCollapse:"collapse" }}>
                  <thead><tr style={{ borderBottom:`1px solid ${T.border}` }}>
                    {["Program","Stage","Priority","Target GM%","Markets","Launch Date"].map(h=><th key={h} style={{ padding:"6px 10px", textAlign:"left", fontSize:10, fontWeight:700, color:T.text3, textTransform:"uppercase" }}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {plmPrograms.map(p=>(
                      <tr key={p.id} style={{ borderBottom:`1px solid ${T.border}` }}>
                        <td style={{ padding:"9px 10px", fontSize:13, fontWeight:500 }}>{p.name}</td>
                        <td style={{ padding:"9px 10px" }}><span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:4, background:T.accentDim, color:T.accent }}>{(p.current_stage||"").replace(/_/g," ")}</span></td>
                        <td style={{ padding:"9px 10px" }}><span style={{ fontSize:10, fontWeight:700, color:{critical:"#ef4444",high:"#f97316",medium:"#eab308",low:"#22c55e"}[p.priority]||T.text3 }}>{p.priority||"—"}</span></td>
                        <td style={{ padding:"9px 10px", fontSize:12, color:p.target_gross_margin_pct?"#22c55e":T.text3, fontWeight:600 }}>{p.target_gross_margin_pct?p.target_gross_margin_pct+"%":"—"}</td>
                        <td style={{ padding:"9px 10px", fontSize:11, color:T.text3 }}>{(p.target_markets_v2||[]).join(", ")||"—"}</td>
                        <td style={{ padding:"9px 10px", fontSize:11, color:T.text3 }}>{p.target_launch_date||"—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            </div>
          </div>
        )}

        {/* ── Team ── */}
        {activeTab==="Team" && (
          <div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:12, marginBottom:24 }}>
              <StatCard icon="👥" label="Team Members" value={Object.keys(profiles).length} />
              <StatCard icon="☐" label="Open Tasks" value={openTasks.length} />
              <StatCard icon="⚠️" label="Overdue" value={overdueTasks.length} color={overdueTasks.length>0?"#ef4444":T.text3} />
            </div>
            <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:20 }}>
              <Card title="Workload by Assignee">
                {topAssignees.map(([uid,count])=>(
                  <div key={uid} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                    <div style={{ width:28, height:28, borderRadius:14, background:"#3b82f620", border:"1.5px solid #3b82f650", display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, fontWeight:700, color:"#3b82f6", flexShrink:0 }}>{ini(uid)}</div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:11, fontWeight:500, marginBottom:3, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{uname(uid)}</div>
                      <div style={{ height:8, borderRadius:8, background:T.surface3, overflow:"hidden" }}>
                        <div style={{ width:`${(count/maxWork)*100}%`, height:"100%", borderRadius:8, background:count>maxWork*0.8?"#ef4444":T.accent }} />
                      </div>
                    </div>
                    <span style={{ fontSize:12, fontWeight:600, color:T.text2, minWidth:24, textAlign:"right" }}>{count}</span>
                  </div>
                ))}
                {topAssignees.length===0&&<div style={{ fontSize:12, color:T.text3 }}>No assigned tasks</div>}
              </Card>
              <Card title="Scorecard Hit Rates">
                {metricHits.map(m=>(
                  <div key={m.id} style={{ display:"flex", alignItems:"center", gap:10, marginBottom:8 }}>
                    <div style={{ fontSize:12, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{m.name}</div>
                    <div style={{ width:80, height:8, borderRadius:8, background:T.surface3, overflow:"hidden" }}>
                      <div style={{ width:`${m.hitPct||0}%`, height:"100%", borderRadius:8, background:m.hitPct>=80?"#22c55e":m.hitPct>=60?"#eab308":"#ef4444" }} />
                    </div>
                    <span style={{ fontSize:11, fontWeight:700, color:m.hitPct>=80?"#22c55e":m.hitPct>=60?"#eab308":m.hitPct!=null?"#ef4444":T.text3, minWidth:36, textAlign:"right" }}>{m.hitPct!=null?m.hitPct+"%":"—"}</span>
                  </div>
                ))}
                {metricHits.length===0&&<div style={{ fontSize:12, color:T.text3 }}>Add scorecard metrics to see hit rates</div>}
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
