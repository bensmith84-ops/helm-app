"use client";
import { useState } from "react";
import { T, CAMPAIGNS, CAMPAIGN_CONTENT, getUser } from "../tokens";
import { Badge, Avatar, StatusDot, TabBar } from "./ui";

export default function CampaignsView() {
  const [view, setView] = useState("calendar");
  const statusColor = { published: T.green, scheduled: T.accent, approved: T.cyan, draft: T.yellow, in_review: T.orange, idea: T.text3, sent: T.green };

  return (
    <div style={{ padding: 24, overflow: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>Marketing Campaigns</h2>
        <TabBar tabs={[{ key: "calendar", label: "Calendar" }, { key: "list", label: "Content" }, { key: "campaigns", label: "Campaigns" }]} active={view} onChange={setView} />
      </div>

      {view === "campaigns" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {CAMPAIGNS.map(c => (
            <div key={c.id} style={{ background: T.surface2, borderRadius: 10, border: `1px solid ${T.border}`, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: c.color }} />
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{c.name}</span>
                  <Badge color={c.status === "active" ? T.green : T.yellow}>{c.status}</Badge>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Avatar user={c.owner} size={22} />
                  <span style={{ fontSize: 11, color: T.text3 }}>{getUser(c.owner).name}</span>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                <div><div style={{ fontSize: 10, color: T.text3 }}>Budget</div><div style={{ fontSize: 14, fontWeight: 700 }}>${(c.budget/1000).toFixed(0)}k</div></div>
                <div><div style={{ fontSize: 10, color: T.text3 }}>Spent</div><div style={{ fontSize: 14, fontWeight: 700 }}>${(c.spent/1000).toFixed(0)}k</div></div>
                <div><div style={{ fontSize: 10, color: T.text3 }}>Content Items</div><div style={{ fontSize: 14, fontWeight: 700 }}>{CAMPAIGN_CONTENT.filter(cc => cc.campaign === c.id).length}</div></div>
                <div><div style={{ fontSize: 10, color: T.text3 }}>Period</div><div style={{ fontSize: 12, fontWeight: 500 }}>{c.start.slice(5)} → {c.end.slice(5)}</div></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {view === "list" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {CAMPAIGN_CONTENT.map(cc => (
            <div key={cc.id} style={{ background: T.surface2, borderRadius: 8, padding: 12, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12 }}>
              <StatusDot color={statusColor[cc.status] || T.text3} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{cc.title}</div>
                <div style={{ fontSize: 11, color: T.text3 }}>{cc.channel} · {cc.date}</div>
              </div>
              <Badge small color={statusColor[cc.status] || T.text3}>{cc.status.replace(/_/g, " ")}</Badge>
              <Avatar user={cc.assignee} size={22} />
            </div>
          ))}
        </div>
      )}

      {view === "calendar" && (
        <div>
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            {CAMPAIGNS.map(c => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 4, background: c.color + "15", border: `1px solid ${c.color}30` }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: c.color }} />
                <span style={{ fontSize: 11, color: c.color, fontWeight: 500 }}>{c.name}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, background: T.border, borderRadius: 8, overflow: "hidden" }}>
            {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => (
              <div key={d} style={{ background: T.surface2, padding: "6px 8px", fontSize: 10, fontWeight: 600, color: T.text3, textAlign: "center" }}>{d}</div>
            ))}
            {Array.from({ length: 35 }, (_, i) => {
              const dayNum = i - 2;
              const date = dayNum >= 1 && dayNum <= 28 ? dayNum : null;
              const dayContent = CAMPAIGN_CONTENT.filter(cc => date && parseInt(cc.date.slice(-2)) === date);
              return (
                <div key={i} style={{ background: T.surface, minHeight: 70, padding: 4, borderBottom: `1px solid ${T.border}10` }}>
                  {date && <div style={{ fontSize: 10, color: date === 27 ? T.accent : T.text3, fontWeight: date === 27 ? 700 : 400, marginBottom: 2 }}>{date}</div>}
                  {dayContent.slice(0, 2).map(cc => {
                    const camp = CAMPAIGNS.find(c => c.id === cc.campaign);
                    return (
                      <div key={cc.id} style={{ fontSize: 9, padding: "2px 4px", borderRadius: 3, marginBottom: 1, background: (camp?.color || T.accent) + "20", color: camp?.color || T.accent, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {cc.title}
                      </div>
                    );
                  })}
                  {dayContent.length > 2 && <div style={{ fontSize: 9, color: T.text3 }}>+{dayContent.length - 2} more</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
