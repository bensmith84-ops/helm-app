"use client";
import { T, PROJECTS, CALENDAR_EVENTS, CAMPAIGNS, PLM_PROGRAMS, CAMPAIGN_CONTENT, priorityColor } from "../tokens";
import { Stat, SectionHeader, Badge, ProgressBar, Avatar } from "./ui";

export default function DashboardView({ setActive }) {
  return (
    <div style={{ padding: 28, maxWidth: 1100, overflow: "auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Good morning, Ben</h1>
        <p style={{ color: T.text2, fontSize: 13 }}>Friday, February 27, 2026 — Here&apos;s what&apos;s happening across Helm.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        <Stat label="Active Projects" value="4" sub="2 on track" color={T.accent} />
        <Stat label="Open Tasks" value="18" sub="3 overdue" color={T.yellow} />
        <Stat label="OKR Progress" value="40%" sub="Q1 2026" color={T.green} />
        <Stat label="PLM Programs" value="3" sub="1 in pilot" color={T.orange} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <div>
          <SectionHeader icon="◫" title="Projects" count={4} action={() => setActive("projects")} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {PROJECTS.map(p => (
              <div key={p.id} style={{ background: T.surface2, borderRadius: 8, padding: 12, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 4, height: 32, borderRadius: 2, background: p.color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{p.name}</div>
                  <ProgressBar value={p.progress} color={p.color} />
                </div>
                <span style={{ fontSize: 12, color: T.text2, fontWeight: 600 }}>{p.progress}%</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <SectionHeader icon="▦" title="Today's Schedule" count={CALENDAR_EVENTS.filter(e => e.day === 0).length} action={() => setActive("calendar")} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {CALENDAR_EVENTS.filter(e => e.day === 0).map(ev => (
              <div key={ev.id} style={{ background: T.surface2, borderRadius: 8, padding: 10, border: `1px solid ${T.border}`, display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ width: 3, height: 28, borderRadius: 2, background: ev.color, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{ev.title}</div>
                  <div style={{ fontSize: 11, color: T.text3 }}>{ev.time} · {ev.duration}</div>
                </div>
                {ev.hasCall && <span style={{ fontSize: 10, color: T.green }}>◉ Video</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <SectionHeader icon="◈" title="Active Campaigns" count={2} action={() => setActive("campaigns")} />
          {CAMPAIGNS.filter(c => c.status === "active").map(c => (
            <div key={c.id} style={{ background: T.surface2, borderRadius: 8, padding: 12, border: `1px solid ${T.border}`, marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</span>
                <Badge color={c.color}>{c.type.replace(/_/g, " ")}</Badge>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.text3 }}>
                <span>Budget: ${(c.budget/1000).toFixed(0)}k</span>
                <span>Spent: ${(c.spent/1000).toFixed(0)}k ({Math.round(c.spent/c.budget*100)}%)</span>
              </div>
              <div style={{ marginTop: 6 }}><ProgressBar value={c.spent/c.budget*100} color={c.color} /></div>
            </div>
          ))}
        </div>

        <div>
          <SectionHeader icon="⬢" title="PLM Pipeline" count={3} action={() => setActive("plm")} />
          {PLM_PROGRAMS.map(p => (
            <div key={p.id} style={{ background: T.surface2, borderRadius: 8, padding: 12, border: `1px solid ${T.border}`, marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</span>
                <Badge color={priorityColor(p.priority)}>{p.priority}</Badge>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.text3, marginBottom: 6 }}>
                <span>{p.category} › {p.subcategory}</span>
                <Badge small color={T.cyan}>{p.stage}</Badge>
              </div>
              <ProgressBar value={p.progress} color={p.stage === "pilot" ? T.orange : T.accent} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
