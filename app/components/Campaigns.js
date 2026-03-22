"use client";
import { useResponsive } from "../lib/responsive";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";
import { useAuth } from "../lib/auth";
import { useModal } from "../lib/modal";

const STATUS_CFG = {
  draft:     { label: "Draft",     color: "#eab308", bg: "#3d300020" },
  active:    { label: "Active",    color: "#22c55e", bg: "#0d3a2020" },
  paused:    { label: "Paused",    color: "#f97316", bg: "#3d200020" },
  completed: { label: "Completed", color: "#3b82f6", bg: "#17255420" },
  cancelled: { label: "Cancelled", color: "#ef4444", bg: "#3d111120" },
};
const CHANNELS = [
  { id: "email",    label: "Email",    icon: "📧" },
  { id: "social",   label: "Social",   icon: "📱" },
  { id: "paid_ads", label: "Paid Ads", icon: "💰" },
  { id: "content",  label: "Content",  icon: "📝" },
  { id: "seo",      label: "SEO",      icon: "🔍" },
  { id: "events",   label: "Events",   icon: "🎪" },
  { id: "pr",       label: "PR",       icon: "📰" },
  { id: "affiliate",label: "Affiliate",icon: "🤝" },
];
const fmtK = (n) => { const v = Number(n) || 0; return v >= 1e6 ? (v/1e6).toFixed(1)+"M" : v >= 1e3 ? (v/1e3).toFixed(0)+"K" : String(v); };
const fmt$ = (n) => { const v = Number(n) || 0; return v >= 1e6 ? "$"+(v/1e6).toFixed(1)+"M" : v >= 1e3 ? "$"+(v/1e3).toFixed(0)+"K" : "$"+v.toLocaleString(); };
const roas = (rev, spend) => spend > 0 ? (Number(rev)/Number(spend)).toFixed(1)+"x" : "—";
const cpa  = (spend, conv) => conv > 0 ? "$"+(Number(spend)/Number(conv)).toFixed(0) : "—";
const cvr  = (clicks, conv) => clicks > 0 ? ((Number(conv)/Number(clicks))*100).toFixed(1)+"%" : "—";

export default function CampaignsView() {
  const { user, profile } = useAuth();
  const { showPrompt, showConfirm } = useModal();
  const { isMobile } = useResponsive();
  const [campaigns, setCampaigns] = useState([]);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", channel: "email", status: "draft" });
  const [tab, setTab] = useState("overview");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("campaigns").select("*").is("deleted_at", null).order("created_at", { ascending: false });
      setCampaigns(data || []);
      setLoading(false);
    })();
  }, []);

  const update = async (id, updates) => {
    const ts = { ...updates, updated_at: new Date().toISOString() };
    setCampaigns(p => p.map(c => c.id === id ? { ...c, ...ts } : c));
    if (selected?.id === id) setSelected(p => ({ ...p, ...ts }));
    await supabase.from("campaigns").update(ts).eq("id", id);
  };

  const createCampaign = async () => {
    if (!form.name.trim()) return;
    const { data } = await supabase.from("campaigns").insert({
      org_id: profile?.org_id, name: form.name.trim(),
      status: form.status, campaign_type: form.channel,
    }).select().single();
    if (data) { setCampaigns(p => [data, ...p]); setSelected(data); setShowCreate(false); setForm({ name: "", channel: "email", status: "draft" }); }
  };

  const deleteCampaign = async (id) => {
    if (!(await showConfirm("Delete Campaign", "Delete this campaign? This cannot be undone."))) return;
    setCampaigns(p => p.filter(c => c.id !== id));
    if (selected?.id === id) setSelected(null);
    await supabase.from("campaigns").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  };

  const filtered = filter === "all" ? campaigns : campaigns.filter(c => c.status === filter);
  const totBudget = campaigns.reduce((s, c) => s + Number(c.budget || 0), 0);
  const totSpent = campaigns.reduce((s, c) => s + Number(c.spent || 0), 0);
  const totConversions = campaigns.reduce((s, c) => s + Number(c.conversions || 0), 0);
  const totRevenue = campaigns.reduce((s, c) => s + Number(c.revenue || 0), 0);
  const active = campaigns.filter(c => c.status === "active");

  if (loading) return <div style={{ display:"flex", height:"100%", alignItems:"center", justifyContent:"center", color:T.text3, fontSize:13 }}>Loading campaigns…</div>;

  return (
    <div style={{ display:"flex", flexDirection:"column", height:"100%", overflow:"hidden" }}>
      {/* Header */}
      <div style={{ padding:"18px 28px 0", borderBottom:`1px solid ${T.border}`, background:T.surface, flexShrink:0 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
          <div>
            <h2 style={{ fontSize:20, fontWeight:700, marginBottom:2 }}>Campaigns</h2>
            <div style={{ fontSize:12, color:T.text3 }}>{campaigns.length} campaigns · {active.length} active · {fmt$(totSpent)} spent</div>
          </div>
          <button onClick={() => setShowCreate(true)} style={{ padding:"8px 16px", fontSize:13, fontWeight:600, borderRadius:8, border:"none", background:T.accent, color:"#fff", cursor:"pointer" }}>+ New Campaign</button>
        </div>
        {/* Filter tabs */}
        <div style={{ display:"flex", gap:0 }}>
          {[["all","All"], ...Object.entries(STATUS_CFG).map(([k,v]) => [k, v.label])].map(([f, l]) => (
            <button key={f} onClick={() => setFilter(f)} style={{ padding:"8px 14px", fontSize:12, fontWeight:500, border:"none", background:"none", cursor:"pointer", color:filter===f?T.accent:T.text3, borderBottom:`2px solid ${filter===f?T.accent:"transparent"}`, transition:"color 0.15s" }}>{l}</button>
          ))}
        </div>
      </div>

      <div style={{ flex:1, overflow:"auto", display:"flex" }}>
        <div style={{ flex:1, padding:"20px 28px", overflow:"auto" }}>
          {/* KPI Row */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:12, marginBottom:24 }}>
            {[
              { label:"Total Budget",  value:fmt$(totBudget), sub:`${fmt$(totSpent)} spent`, color:"#3b82f6" },
              { label:"Conversions",   value:fmtK(totConversions), sub:`${fmt$(totSpent)} spend`, color:"#22c55e" },
              { label:"Revenue",       value:fmt$(totRevenue), sub:roas(totRevenue, totSpent)+" ROAS", color:"#22c55e" },
              { label:"CPA",           value:cpa(totSpent, totConversions), sub:`${fmtK(totConversions)} total`, color:T.accent },
            ].map(s => (
              <div key={s.label} style={{ padding:"14px 16px", background:T.surface, border:`1px solid ${T.border}`, borderRadius:10 }}>
                <div style={{ fontSize:11, color:T.text3, fontWeight:600, textTransform:"uppercase", letterSpacing:0.5, marginBottom:4 }}>{s.label}</div>
                <div style={{ fontSize:22, fontWeight:800, color:s.color }}>{s.value}</div>
                <div style={{ fontSize:11, color:T.text3, marginTop:2 }}>{s.sub}</div>
              </div>
            ))}
          </div>

          {filtered.length === 0 && (
            <div style={{ textAlign:"center", padding:"48px 0", color:T.text3 }}>
              <div style={{ fontSize:40, marginBottom:12 }}>📢</div>
              <div style={{ fontSize:15, fontWeight:600, marginBottom:4 }}>No campaigns {filter !== "all" ? `with status "${filter}"` : "yet"}</div>
              {filter === "all" && <button onClick={() => setShowCreate(true)} style={{ padding:"9px 20px", fontSize:13, fontWeight:600, borderRadius:8, border:"none", background:T.accent, color:"#fff", cursor:"pointer" }}>Launch your first campaign</button>}
            </div>
          )}

          {filtered.map(camp => {
            const sel = selected?.id === camp.id;
            const st = STATUS_CFG[camp.status] || STATUS_CFG.draft;
            const ch = CHANNELS.find(c => c.id === camp.campaign_type);
            const spentPct = camp.budget > 0 ? Math.min(100, Math.round((Number(camp.spent||0) / Number(camp.budget)) * 100)) : 0;
            const roasVal = Number(camp.revenue) > 0 && Number(camp.spent) > 0 ? (Number(camp.revenue)/Number(camp.spent)).toFixed(1) : null;
            const isOver = camp.budget > 0 && Number(camp.spent) > Number(camp.budget);
            return (
              <div key={camp.id} onClick={() => setSelected(sel ? null : camp)}
                style={{ padding:"16px 18px", marginBottom:8, borderRadius:12, border:`1px solid ${sel ? T.accent+"60" : T.border}`, background:sel ? T.accentDim : T.surface, cursor:"pointer", transition:"all 0.1s" }}
                onMouseEnter={e => { if (!sel) e.currentTarget.style.background = T.surface2; }}
                onMouseLeave={e => { if (!sel) e.currentTarget.style.background = T.surface; }}>
                <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:8 }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:4 }}>
                      <span style={{ fontSize:16 }}>{ch?.icon || "📢"}</span>
                      <span style={{ fontSize:14, fontWeight:700, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{camp.name}</span>
                    </div>
                    <div style={{ display:"flex", gap:8, alignItems:"center", flexWrap:"wrap" }}>
                      <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:6, background:st.bg, color:st.color }}>{st.label}</span>
                      {ch && <span style={{ fontSize:11, color:T.text3 }}>{ch.label}</span>}
                      {camp.start_date && <span style={{ fontSize:11, color:T.text3 }}>{camp.start_date}{camp.end_date ? ` → ${camp.end_date}` : ""}</span>}
                    </div>
                  </div>
                  <div style={{ display:"flex", gap:16, flexShrink:0, textAlign:"right" }}>
                    {Number(camp.spent) > 0 && <div><div style={{ fontSize:13, fontWeight:700, color:isOver?"#ef4444":T.text2 }}>{fmt$(camp.spent)}</div><div style={{ fontSize:10, color:T.text3 }}>spent{camp.budget>0?` / ${fmt$(camp.budget)}`:""}</div></div>}
                    {Number(camp.conversions) > 0 && <div><div style={{ fontSize:13, fontWeight:700, color:"#22c55e" }}>{fmtK(camp.conversions)}</div><div style={{ fontSize:10, color:T.text3 }}>conversions</div></div>}
                    {roasVal && <div><div style={{ fontSize:13, fontWeight:700, color:T.accent }}>{roasVal}x</div><div style={{ fontSize:10, color:T.text3 }}>ROAS</div></div>}
                  </div>
                </div>
                {camp.budget > 0 && (
                  <div>
                    <div style={{ height:4, borderRadius:4, background:T.surface3, overflow:"hidden" }}>
                      <div style={{ width:`${spentPct}%`, height:"100%", borderRadius:4, background:isOver?"#ef4444":spentPct>80?"#eab308":T.accent, transition:"width 0.4s" }} />
                    </div>
                    <div style={{ display:"flex", justifyContent:"space-between", fontSize:9, color:T.text3, marginTop:2 }}>
                      <span>{spentPct}% of budget used</span>
                      {isOver && <span style={{ color:"#ef4444", fontWeight:700 }}>Over budget!</span>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Detail panel */}
        {selected && (
          <div style={{ width:380, borderLeft:`1px solid ${T.border}`, background:T.surface, flexShrink:0, overflow:"auto", display:"flex", flexDirection:"column" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"14px 20px", borderBottom:`1px solid ${T.border}`, flexShrink:0 }}>
              <span style={{ fontSize:12, fontWeight:700, color:T.text3, textTransform:"uppercase", letterSpacing:0.8 }}>Campaign</span>
              <button onClick={() => setSelected(null)} style={{ background:T.surface2, border:`1px solid ${T.border}`, color:T.text3, cursor:"pointer", width:28, height:28, borderRadius:6, display:"flex", alignItems:"center", justifyContent:"center", fontSize:12 }}>×</button>
            </div>
            {/* Tabs */}
            <div style={{ display:"flex", borderBottom:`1px solid ${T.border}`, padding:"0 20px", flexShrink:0 }}>
              {["overview","metrics","settings"].map(t => (
                <button key={t} onClick={() => setTab(t)} style={{ padding:"8px 12px", fontSize:12, fontWeight:tab===t?600:400, color:tab===t?T.accent:T.text3, background:"none", border:"none", borderBottom:`2px solid ${tab===t?T.accent:"transparent"}`, cursor:"pointer", textTransform:"capitalize" }}>{t}</button>
              ))}
            </div>
            <div style={{ flex:1, overflow:"auto", padding:20 }}>
              {tab === "overview" && (
                <>
                  <input value={selected.name} onChange={e => update(selected.id, { name: e.target.value })}
                    style={{ fontSize:18, fontWeight:700, color:T.text, background:"transparent", border:"none", outline:"none", width:"100%", marginBottom:12, fontFamily:"inherit" }} />
                  <div style={{ display:"flex", gap:8, marginBottom:16, flexWrap:"wrap" }}>
                    <select value={selected.status} onChange={e => update(selected.id, { status: e.target.value })}
                      style={{ fontSize:11, padding:"4px 8px", borderRadius:5, border:`1px solid ${T.border}`, background:T.surface2, color:T.text, fontFamily:"inherit", cursor:"pointer" }}>
                      {Object.entries(STATUS_CFG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                    <select value={selected.campaign_type||"email"} onChange={e => update(selected.id, { campaign_type: e.target.value })}
                      style={{ fontSize:11, padding:"4px 8px", borderRadius:5, border:`1px solid ${T.border}`, background:T.surface2, color:T.text, fontFamily:"inherit", cursor:"pointer" }}>
                      {CHANNELS.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
                    </select>
                  </div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:16 }}>
                    {[
                      { l:"Start Date",  k:"start_date", t:"date" },
                      { l:"End Date",    k:"end_date",   t:"date" },
                      { l:"Budget ($)",  k:"budget",     t:"number" },
                      { l:"Spent ($)",   k:"spent",      t:"number" },
                    ].map(f => (
                      <div key={f.k}>
                        <label style={{ fontSize:11, fontWeight:600, color:T.text3, display:"block", marginBottom:3 }}>{f.l}</label>
                        <input type={f.t} value={selected[f.k]||""} onChange={e => update(selected.id, { [f.k]: f.t==="number" ? Number(e.target.value)||0 : e.target.value||null })}
                          style={{ width:"100%", padding:"6px 8px", fontSize:12, color:T.text, background:T.surface2, border:`1px solid ${T.border}`, borderRadius:5, outline:"none", fontFamily:"inherit", boxSizing:"border-box", colorScheme:"dark" }} />
                      </div>
                    ))}
                  </div>
                  {selected.budget > 0 && (
                    <div style={{ marginBottom:16, padding:"12px 14px", background:T.surface2, borderRadius:8 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:6, fontSize:12 }}>
                        <span style={{ color:T.text3 }}>Budget used</span>
                        <span style={{ fontWeight:700, color:Number(selected.spent)>Number(selected.budget)?"#ef4444":T.text }}>
                          {Math.round((Number(selected.spent||0)/Number(selected.budget))*100)}%
                        </span>
                      </div>
                      <div style={{ height:6, borderRadius:6, background:T.surface3 }}>
                        <div style={{ width:`${Math.min(100,Math.round((Number(selected.spent||0)/Number(selected.budget))*100))}%`, height:"100%", borderRadius:6, background:Number(selected.spent)>Number(selected.budget)?"#ef4444":T.accent }} />
                      </div>
                    </div>
                  )}
                  <label style={{ fontSize:11, fontWeight:600, color:T.text3, display:"block", marginBottom:4 }}>Description</label>
                  <textarea defaultValue={selected.description||""} key={selected.id + "-desc"} onBlur={e => update(selected.id, { description: e.target.value })}
                    placeholder="Campaign notes, goals, target audience…"
                    style={{ width:"100%", minHeight:100, fontSize:12, color:T.text, lineHeight:1.6, padding:"10px 12px", background:T.surface2, border:`1px solid ${T.border}`, borderRadius:7, resize:"vertical", outline:"none", fontFamily:"inherit", boxSizing:"border-box" }} />
                </>
              )}
              {tab === "metrics" && (
                <>
                  <div style={{ fontSize:12, color:T.text3, marginBottom:16 }}>Track your campaign performance metrics</div>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10, marginBottom:20 }}>
                    {[
                      { l:"Impressions",  k:"impressions",  t:"number" },
                      { l:"Clicks",       k:"clicks",       t:"number" },
                      { l:"Conversions",  k:"conversions",  t:"number" },
                      { l:"Revenue ($)",  k:"revenue",      t:"number" },
                    ].map(f => (
                      <div key={f.k}>
                        <label style={{ fontSize:11, fontWeight:600, color:T.text3, display:"block", marginBottom:3 }}>{f.l}</label>
                        <input type="number" value={selected[f.k]||""} onChange={e => update(selected.id, { [f.k]: Number(e.target.value)||0 })}
                          placeholder="0" style={{ width:"100%", padding:"6px 8px", fontSize:13, color:T.text, background:T.surface2, border:`1px solid ${T.border}`, borderRadius:5, outline:"none", fontFamily:"inherit", boxSizing:"border-box" }} />
                      </div>
                    ))}
                  </div>
                  {/* Computed metrics */}
                  <div style={{ background:T.surface2, borderRadius:10, padding:14 }}>
                    <div style={{ fontSize:11, fontWeight:700, color:T.text3, textTransform:"uppercase", letterSpacing:0.8, marginBottom:12 }}>Computed</div>
                    {[
                      { l:"CTR",      v: selected.impressions>0 ? ((Number(selected.clicks||0)/Number(selected.impressions))*100).toFixed(2)+"%" : "—" },
                      { l:"CVR",      v: cvr(selected.clicks, selected.conversions) },
                      { l:"CPC",      v: selected.clicks>0 ? "$"+(Number(selected.spent||0)/Number(selected.clicks)).toFixed(2) : "—" },
                      { l:"CPA",      v: cpa(selected.spent, selected.conversions) },
                      { l:"ROAS",     v: roas(selected.revenue, selected.spent) },
                    ].map(m => (
                      <div key={m.l} style={{ display:"flex", justifyContent:"space-between", padding:"6px 0", borderBottom:`1px solid ${T.border}20`, fontSize:12 }}>
                        <span style={{ color:T.text3 }}>{m.l}</span>
                        <span style={{ fontWeight:700, color:T.text }}>{m.v}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {tab === "settings" && (
                <>
                  <div style={{ fontSize:12, color:T.text3, marginBottom:16 }}>Manage campaign settings</div>
                  <div style={{ marginBottom:12 }}>
                    <label style={{ fontSize:11, fontWeight:600, color:T.text3, display:"block", marginBottom:4 }}>Target Audience</label>
                    <input value={selected.target_audience||""} onChange={e => update(selected.id, { target_audience: e.target.value })}
                      placeholder="e.g. 25-45 health-conscious consumers"
                      style={{ width:"100%", padding:"8px 10px", fontSize:12, color:T.text, background:T.surface2, border:`1px solid ${T.border}`, borderRadius:6, outline:"none", fontFamily:"inherit", boxSizing:"border-box" }} />
                  </div>
                  <div style={{ marginBottom:12 }}>
                    <label style={{ fontSize:11, fontWeight:600, color:T.text3, display:"block", marginBottom:4 }}>Goal / KPI</label>
                    <input value={selected.goal||""} onChange={e => update(selected.id, { goal: e.target.value })}
                      placeholder="e.g. 500 new subscribers at <$15 CPA"
                      style={{ width:"100%", padding:"8px 10px", fontSize:12, color:T.text, background:T.surface2, border:`1px solid ${T.border}`, borderRadius:6, outline:"none", fontFamily:"inherit", boxSizing:"border-box" }} />
                  </div>
                  <div style={{ marginTop:24, paddingTop:16, borderTop:`1px solid ${T.border}` }}>
                    <button onClick={() => deleteCampaign(selected.id)} style={{ padding:"8px 14px", fontSize:12, fontWeight:600, borderRadius:6, border:"1px solid #ef444440", background:"#ef444410", color:"#ef4444", cursor:"pointer" }}>Delete Campaign</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div style={{ position:"fixed", inset:0, zIndex:200, display:"flex", alignItems:"center", justifyContent:"center" }} onClick={() => setShowCreate(false)}>
          <div style={{ position:"absolute", inset:0, background:"rgba(0,0,0,0.5)" }} />
          <div onClick={e => e.stopPropagation()} style={{ position:"relative", width:400, background:T.surface, borderRadius:14, border:`1px solid ${T.border}`, padding:28, zIndex:201, boxShadow:"0 20px 60px rgba(0,0,0,0.4)" }}>
            <h3 style={{ fontSize:17, fontWeight:700, marginBottom:20 }}>New Campaign</h3>
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:12, fontWeight:600, color:T.text3, display:"block", marginBottom:4 }}>Name *</label>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} onKeyDown={e => e.key==="Enter" && createCampaign()}
                placeholder="Campaign name…" style={{ width:"100%", padding:"9px 12px", fontSize:13, color:T.text, background:T.surface2, border:`1px solid ${T.border}`, borderRadius:7, outline:"none", fontFamily:"inherit", boxSizing:"border-box" }} />
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginBottom:20 }}>
              <div>
                <label style={{ fontSize:12, fontWeight:600, color:T.text3, display:"block", marginBottom:4 }}>Channel</label>
                <select value={form.channel} onChange={e => setForm(p => ({ ...p, channel: e.target.value, campaign_type: e.target.value }))}
                  style={{ width:"100%", padding:"8px 10px", fontSize:12, color:T.text, background:T.surface2, border:`1px solid ${T.border}`, borderRadius:6, cursor:"pointer", outline:"none", fontFamily:"inherit" }}>
                  {CHANNELS.map(c => <option key={c.id} value={c.id}>{c.icon} {c.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize:12, fontWeight:600, color:T.text3, display:"block", marginBottom:4 }}>Status</label>
                <select value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}
                  style={{ width:"100%", padding:"8px 10px", fontSize:12, color:T.text, background:T.surface2, border:`1px solid ${T.border}`, borderRadius:6, cursor:"pointer", outline:"none", fontFamily:"inherit" }}>
                  {Object.entries(STATUS_CFG).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display:"flex", gap:10, justifyContent:"flex-end" }}>
              <button onClick={() => setShowCreate(false)} style={{ padding:"9px 18px", fontSize:13, fontWeight:600, borderRadius:7, border:`1px solid ${T.border}`, background:T.surface2, color:T.text3, cursor:"pointer" }}>Cancel</button>
              <button onClick={createCampaign} disabled={!form.name.trim()} style={{ padding:"9px 20px", fontSize:13, fontWeight:600, borderRadius:7, border:"none", background:form.name.trim()?T.accent:T.surface3, color:form.name.trim()?"#fff":T.text3, cursor:form.name.trim()?"pointer":"default" }}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
