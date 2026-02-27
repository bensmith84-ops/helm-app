"use client";
import { useState } from "react";
import { T, CAMPAIGNS, CAMPAIGN_CONTENT, getUser } from "../tokens";

const AVATAR_COLORS = ["#3b82f6","#a855f7","#ec4899","#06b6d4","#f97316","#22c55e","#84cc16","#ef4444"];
const STATUS_CFG = {
  published: { label: "Published", color: "#22c55e", bg: "#0d3a20" },
  scheduled: { label: "Scheduled", color: "#3b82f6", bg: "#172554" },
  approved: { label: "Approved", color: "#06b6d4", bg: "#083344" },
  draft: { label: "Draft", color: "#eab308", bg: "#3d3000" },
  in_review: { label: "In Review", color: "#f97316", bg: "#3d2000" },
  idea: { label: "Idea", color: "#64748b", bg: "#1e293b" },
  sent: { label: "Sent", color: "#22c55e", bg: "#0d3a20" },
};

export default function CampaignsView() {
  const [view, setView] = useState("campaigns");
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [selectedContent, setSelectedContent] = useState(null);

  const totalBudget = CAMPAIGNS.reduce((s, c) => s + c.budget, 0);
  const totalSpent = CAMPAIGNS.reduce((s, c) => s + c.spent, 0);
  const activeCount = CAMPAIGNS.filter(c => c.status === "active").length;

  const Ava = ({ uid, sz = 22 }) => {
    const u = getUser(uid);
    const c = AVATAR_COLORS[uid.charCodeAt(1) % AVATAR_COLORS.length];
    return (
      <div title={u.name} style={{
        width: sz, height: sz, borderRadius: "50%", background: `${c}18`, border: `1.5px solid ${c}50`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: Math.max(sz * 0.36, 9), fontWeight: 700, color: c, flexShrink: 0,
      }}>{u.avatar}</div>
    );
  };

  const selected = selectedCampaign || selectedContent;
  const panelType = selectedCampaign ? "campaign" : selectedContent ? "content" : null;

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Main */}
      <div style={{ flex: 1, overflow: "auto", padding: "28px 32px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Marketing Campaigns</h2>
            <p style={{ fontSize: 13, color: T.text3 }}>Campaign management, content calendar, and performance</p>
          </div>
          <button style={{ padding: "8px 18px", borderRadius: 10, border: "none", background: T.accent, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>+ New Campaign</button>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
          {[
            { label: "Campaigns", value: CAMPAIGNS.length, color: T.accent },
            { label: "Active", value: activeCount, color: T.green },
            { label: "Total Budget", value: `$${(totalBudget/1000).toFixed(0)}k`, color: T.purple },
            { label: "Spent", value: `$${(totalSpent/1000).toFixed(0)}k (${Math.round(totalSpent/totalBudget*100)}%)`, color: totalSpent/totalBudget > 0.8 ? T.red : T.yellow },
          ].map(s => (
            <div key={s.label} style={{ padding: "14px 18px", background: T.surface, borderRadius: 12, border: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 10, color: T.text3, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* View tabs */}
        <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: `1px solid ${T.border}` }}>
          {[
            { key: "campaigns", label: "Campaigns" },
            { key: "content", label: "Content Pipeline" },
            { key: "calendar", label: "Calendar" },
          ].map(v => (
            <button key={v.key} onClick={() => { setView(v.key); setSelectedCampaign(null); setSelectedContent(null); }} style={{
              padding: "10px 18px", border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer",
              background: "transparent", color: view === v.key ? T.text : T.text3,
              borderBottom: `2px solid ${view === v.key ? T.accent : "transparent"}`, transition: "all 0.15s",
            }}>{v.label}</button>
          ))}
        </div>

        {/* Campaigns view */}
        {view === "campaigns" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {CAMPAIGNS.map(c => {
              const sel = selectedCampaign?.id === c.id;
              const pct = Math.round(c.spent / c.budget * 100);
              const contentCount = CAMPAIGN_CONTENT.filter(cc => cc.campaign === c.id).length;
              return (
                <div key={c.id} onClick={() => { setSelectedCampaign(c); setSelectedContent(null); }} style={{
                  background: sel ? `${T.accent}08` : T.surface, borderRadius: 14,
                  border: `1px solid ${sel ? T.accent : T.border}`, padding: 20, cursor: "pointer",
                  transition: "all 0.12s",
                }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 12, height: 12, borderRadius: 3, background: c.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 16, fontWeight: 700 }}>{c.name}</span>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 6,
                        background: c.status === "active" ? "#0d3a20" : "#3d3000",
                        color: c.status === "active" ? T.green : T.yellow,
                      }}>{c.status}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Ava uid={c.owner} sz={24} />
                      <span style={{ fontSize: 12, color: T.text3 }}>{getUser(c.owner).name}</span>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 14 }}>
                    {[
                      { label: "Budget", value: `$${(c.budget/1000).toFixed(0)}k` },
                      { label: "Spent", value: `$${(c.spent/1000).toFixed(0)}k` },
                      { label: "Content", value: contentCount },
                      { label: "Period", value: `${c.start.slice(5)} → ${c.end.slice(5)}` },
                    ].map(s => (
                      <div key={s.label}>
                        <div style={{ fontSize: 10, color: T.text3, marginBottom: 3 }}>{s.label}</div>
                        <div style={{ fontSize: 14, fontWeight: 700 }}>{s.value}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ flex: 1, height: 5, borderRadius: 5, background: T.surface3, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", borderRadius: 5, background: pct > 90 ? T.red : c.color, transition: "width 0.5s" }} />
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 600, color: T.text2, minWidth: 35 }}>{pct}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Content pipeline */}
        {view === "content" && (
          <>
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 90px 90px 100px 70px",
              padding: "8px 16px", fontSize: 10, fontWeight: 600, color: T.text3,
              textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${T.border}`,
            }}>
              <span>Content</span><span>Channel</span><span>Date</span><span>Assignee</span><span>Status</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              {CAMPAIGN_CONTENT.map(cc => {
                const sel = selectedContent?.id === cc.id;
                const camp = CAMPAIGNS.find(c => c.id === cc.campaign);
                const st = STATUS_CFG[cc.status] || STATUS_CFG.draft;
                return (
                  <div key={cc.id} onClick={() => { setSelectedContent(cc); setSelectedCampaign(null); }} style={{
                    display: "grid", gridTemplateColumns: "1fr 90px 90px 100px 70px",
                    padding: "11px 16px", alignItems: "center", cursor: "pointer",
                    borderBottom: `1px solid ${T.border}`,
                    background: sel ? `${T.accent}10` : "transparent",
                    borderLeft: sel ? `3px solid ${T.accent}` : "3px solid transparent",
                    transition: "background 0.1s",
                  }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 6, height: 6, borderRadius: 6, background: camp?.color || T.text3, flexShrink: 0 }} />
                      <span style={{ fontSize: 13, fontWeight: 500 }}>{cc.title}</span>
                    </div>
                    <span style={{ fontSize: 12, color: T.text2 }}>{cc.channel}</span>
                    <span style={{ fontSize: 12, color: T.text3 }}>{cc.date}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <Ava uid={cc.assignee} sz={20} />
                      <span style={{ fontSize: 11, color: T.text2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{getUser(cc.assignee).name.split(" ")[0]}</span>
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 5, background: st.bg, color: st.color, textAlign: "center" }}>{st.label}</span>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Calendar view */}
        {view === "calendar" && (
          <div>
            <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
              {CAMPAIGNS.map(c => (
                <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 6, background: `${c.color}12`, border: `1px solid ${c.color}30` }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: c.color }} />
                  <span style={{ fontSize: 11, color: c.color, fontWeight: 500 }}>{c.name}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, background: T.border, borderRadius: 10, overflow: "hidden" }}>
              {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => (
                <div key={d} style={{ background: T.surface2, padding: "8px", fontSize: 11, fontWeight: 600, color: T.text3, textAlign: "center" }}>{d}</div>
              ))}
              {Array.from({ length: 35 }, (_, i) => {
                const dayNum = i - 2;
                const date = dayNum >= 1 && dayNum <= 28 ? dayNum : null;
                const dayContent = CAMPAIGN_CONTENT.filter(cc => date && parseInt(cc.date.slice(-2)) === date);
                const isToday = date === new Date().getDate();
                return (
                  <div key={i} style={{ background: T.surface, minHeight: 80, padding: 6 }}>
                    {date && (
                      <div style={{
                        fontSize: 11, fontWeight: isToday ? 700 : 400, marginBottom: 4,
                        color: isToday ? T.accent : T.text3,
                        width: isToday ? 22 : "auto", height: isToday ? 22 : "auto",
                        borderRadius: 11, background: isToday ? `${T.accent}15` : "transparent",
                        display: isToday ? "flex" : "block", alignItems: "center", justifyContent: "center",
                      }}>{date}</div>
                    )}
                    {dayContent.slice(0, 2).map(cc => {
                      const camp = CAMPAIGNS.find(c => c.id === cc.campaign);
                      return (
                        <div key={cc.id} onClick={() => { setSelectedContent(cc); setSelectedCampaign(null); }} style={{
                          fontSize: 9, padding: "3px 5px", borderRadius: 4, marginBottom: 2,
                          background: `${camp?.color || T.accent}18`, color: camp?.color || T.accent,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          cursor: "pointer", fontWeight: 500,
                        }}>{cc.title}</div>
                      );
                    })}
                    {dayContent.length > 2 && <div style={{ fontSize: 9, color: T.text3, fontWeight: 500 }}>+{dayContent.length - 2}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Detail panel */}
      {selected && (
        <div style={{ width: 370, borderLeft: `1px solid ${T.border}`, background: T.surface, flexShrink: 0, overflow: "auto", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: `1px solid ${T.border}` }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: T.text3 }}>{panelType === "campaign" ? "Campaign" : "Content"} Details</span>
            <button onClick={() => { setSelectedCampaign(null); setSelectedContent(null); }} style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text3, cursor: "pointer", width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8" stroke={T.text3} strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>
          </div>
          <div style={{ padding: "20px 24px" }}>
            {panelType === "campaign" && selectedCampaign && (() => {
              const c = selectedCampaign;
              const pct = Math.round(c.spent / c.budget * 100);
              const contents = CAMPAIGN_CONTENT.filter(cc => cc.campaign === c.id);
              return (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
                    <div style={{ width: 16, height: 16, borderRadius: 4, background: c.color }} />
                    <div style={{ fontSize: 20, fontWeight: 700 }}>{c.name}</div>
                  </div>
                  {[
                    { icon: "📊", label: "Status", value: c.status },
                    { icon: "👤", label: "Owner", value: getUser(c.owner).name },
                    { icon: "💰", label: "Budget", value: `$${(c.budget/1000).toFixed(0)}k` },
                    { icon: "💸", label: "Spent", value: `$${(c.spent/1000).toFixed(0)}k (${pct}%)` },
                    { icon: "📅", label: "Period", value: `${c.start} → ${c.end}` },
                    { icon: "📝", label: "Content", value: `${contents.length} items` },
                  ].map(f => (
                    <div key={f.label} style={{ display: "grid", gridTemplateColumns: "110px 1fr", padding: "10px 0", borderBottom: `1px solid ${T.border}`, alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.text3 }}><span style={{ fontSize: 14 }}>{f.icon}</span><span>{f.label}</span></div>
                      <span style={{ fontSize: 13, color: T.text }}>{f.value}</span>
                    </div>
                  ))}
                  <div style={{ marginTop: 20 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Budget Usage</div>
                    <div style={{ height: 8, borderRadius: 8, background: T.surface3, overflow: "hidden", marginBottom: 4 }}>
                      <div style={{ width: `${pct}%`, height: "100%", borderRadius: 8, background: pct > 90 ? T.red : c.color }} />
                    </div>
                    <div style={{ fontSize: 11, color: T.text3 }}>{pct}% of budget used</div>
                  </div>
                  {contents.length > 0 && (
                    <div style={{ marginTop: 20 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Content ({contents.length})</div>
                      {contents.map(cc => {
                        const st = STATUS_CFG[cc.status] || STATUS_CFG.draft;
                        return (
                          <div key={cc.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
                            <span style={{ fontSize: 12, flex: 1, fontWeight: 500 }}>{cc.title}</span>
                            <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 5, background: st.bg, color: st.color }}>{st.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              );
            })()}
            {panelType === "content" && selectedContent && (() => {
              const cc = selectedContent;
              const camp = CAMPAIGNS.find(c => c.id === cc.campaign);
              const st = STATUS_CFG[cc.status] || STATUS_CFG.draft;
              return (
                <>
                  <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>{cc.title}</div>
                  {[
                    { icon: "📋", label: "Status", value: st.label },
                    { icon: "📣", label: "Channel", value: cc.channel },
                    { icon: "📅", label: "Date", value: cc.date },
                    { icon: "👤", label: "Assignee", value: getUser(cc.assignee).name },
                    { icon: "🎯", label: "Campaign", value: camp?.name || "—" },
                  ].map(f => (
                    <div key={f.label} style={{ display: "grid", gridTemplateColumns: "110px 1fr", padding: "10px 0", borderBottom: `1px solid ${T.border}`, alignItems: "center" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.text3 }}><span style={{ fontSize: 14 }}>{f.icon}</span><span>{f.label}</span></div>
                      <span style={{ fontSize: 13, color: T.text }}>{f.value}</span>
                    </div>
                  ))}
                </>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}