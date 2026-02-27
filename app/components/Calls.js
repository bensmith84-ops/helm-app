"use client";
import { T } from "../tokens";
import { Stat, SectionHeader, Badge } from "./ui";

export default function CallsView() {
  const recentCalls = [
    { id: "c1", title: "Sprint Planning", type: "scheduled", participants: 5, duration: "47m", date: "Today, 9:00 AM", recording: true, transcript: true },
    { id: "c2", title: "Design Review", type: "scheduled", participants: 3, duration: "32m", date: "Today, 11:00 AM", recording: true, transcript: true },
    { id: "c3", title: "Quick huddle — API issue", type: "huddle", participants: 2, duration: "8m", date: "Yesterday", recording: false, transcript: false },
    { id: "c4", title: "All Hands", type: "scheduled", participants: 8, duration: "55m", date: "Feb 25", recording: true, transcript: true },
  ];
  return (
    <div style={{ padding: 24, overflow: "auto", maxWidth: 800 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>Calls & Meetings</h2>
        <button style={{ background: T.green, border: "none", borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 600, color: "#fff", cursor: "pointer" }}>◉ Start Huddle</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 24 }}>
        <Stat label="Calls This Week" value="12" sub="4h 23m total" color={T.accent} />
        <Stat label="AI Summaries" value="9" sub="Auto-generated" color={T.purple} />
        <Stat label="Action Items" value="14" sub="From transcripts" color={T.green} />
      </div>
      <SectionHeader icon="◉" title="Recent Calls" count={recentCalls.length} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {recentCalls.map(call => (
          <div key={call.id} style={{ background: T.surface2, borderRadius: 8, padding: 14, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: call.type === "huddle" ? T.greenDim : T.accentDim, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
              {call.type === "huddle" ? "💬" : "📹"}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{call.title}</div>
              <div style={{ fontSize: 11, color: T.text3 }}>{call.date} · {call.participants} people · {call.duration}</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {call.recording && <Badge small color={T.accent}>Recording</Badge>}
              {call.transcript && <Badge small color={T.purple}>AI Summary</Badge>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
