"use client";
import { useState } from "react";
import { T, getUser } from "../tokens";

const AVATAR_COLORS = ["#3b82f6","#a855f7","#ec4899","#06b6d4","#f97316","#22c55e","#84cc16","#ef4444"];

const CALLS = [
  { id: "c1", title: "Sprint Planning", type: "scheduled", participants: ["u1","u2","u3","u4","u5"], duration: "47m", date: "Today, 9:00 AM", recording: true, transcript: true, summary: "Discussed sprint goals for the week. Assigned 12 tasks across 3 workstreams. Agreed to prioritize packaging redesign. Next sprint review scheduled for Friday.", actions: ["Review packaging mockups by Wednesday", "Update PLM timeline in project board", "Schedule design review with Sarah"] },
  { id: "c2", title: "Design Review", type: "scheduled", participants: ["u1","u3","u6"], duration: "32m", date: "Today, 11:00 AM", recording: true, transcript: true, summary: "Reviewed new product page layouts. Approved mobile-first approach. Discussed color palette changes for Spring campaign. Sarah to finalize assets.", actions: ["Finalize Spring color palette", "Share mobile mockups in #design", "Update brand guidelines doc"] },
  { id: "c3", title: "Quick huddle — API issue", type: "huddle", participants: ["u1","u4"], duration: "8m", date: "Yesterday, 3:15 PM", recording: false, transcript: false, summary: null, actions: [] },
  { id: "c4", title: "All Hands", type: "scheduled", participants: ["u1","u2","u3","u4","u5","u6","u7","u8"], duration: "55m", date: "Feb 25, 10:00 AM", recording: true, transcript: true, summary: "Q1 progress update. Revenue up 18% YoY. New hire announcements. Product roadmap preview for Q2 including PLM enhancements and automation features.", actions: ["Share Q1 deck with team", "Follow up on hiring pipeline", "Draft Q2 roadmap doc"] },
  { id: "c5", title: "1:1 with Easton", type: "scheduled", participants: ["u1","u3"], duration: "25m", date: "Feb 24, 2:00 PM", recording: false, transcript: true, summary: "Discussed tech request backlog. Agreed to close 5 stale tickets. Easton to own new CI/CD pipeline setup.", actions: ["Close stale tech requests", "Draft CI/CD proposal"] },
  { id: "c6", title: "Growth Strategy Sync", type: "scheduled", participants: ["u1","u4","u5","u7"], duration: "40m", date: "Feb 23, 11:00 AM", recording: true, transcript: true, summary: "Reviewed channel performance. Social media driving 35% of traffic. Discussed expanding influencer partnerships and testing new ad formats.", actions: ["Analyze influencer ROI data", "Propose new ad format tests", "Update campaign budget tracker"] },
];

export default function CallsView() {
  const [selectedCall, setSelectedCall] = useState(null);
  const [filter, setFilter] = useState("all"); // all | recorded | huddles

  const filtered = CALLS.filter(c => {
    if (filter === "recorded") return c.recording;
    if (filter === "huddles") return c.type === "huddle";
    return true;
  });

  const totalDuration = CALLS.reduce((s, c) => {
    const m = c.duration.match(/(\d+)/);
    return s + (m ? parseInt(m[1]) : 0);
  }, 0);
  const recordedCount = CALLS.filter(c => c.recording).length;
  const aiSummaries = CALLS.filter(c => c.transcript).length;

  const Ava = ({ uid, sz = 28 }) => {
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

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Main */}
      <div style={{ flex: 1, overflow: "auto", padding: "28px 32px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Calls & Meetings</h2>
            <p style={{ fontSize: 13, color: T.text3 }}>Video calls, huddles, recordings and AI summaries</p>
          </div>
          <button style={{ padding: "8px 18px", borderRadius: 10, border: "none", background: T.green, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="#fff" strokeWidth="2"/><circle cx="8" cy="8" r="2.5" fill="#fff"/></svg>
            Start Huddle
          </button>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
          {[
            { label: "Calls This Week", value: CALLS.length, color: T.accent, icon: <circle cx="8" cy="8" r="6" fill="none" stroke={T.accent} strokeWidth="2"/> },
            { label: "Total Time", value: `${Math.floor(totalDuration/60)}h ${totalDuration%60}m`, color: T.purple, icon: <><circle cx="8" cy="8" r="6" fill="none" stroke={T.purple} strokeWidth="2"/><path d="M8 5v3l2 2" fill="none" stroke={T.purple} strokeWidth="1.5" strokeLinecap="round"/></> },
            { label: "Recordings", value: recordedCount, color: T.red, icon: <circle cx="8" cy="8" r="4" fill={T.red}/> },
            { label: "AI Summaries", value: aiSummaries, color: T.cyan, icon: <><rect x="3" y="2" width="10" height="12" rx="2" fill="none" stroke={T.cyan} strokeWidth="1.5"/><path d="M6 6h4M6 9h3" stroke={T.cyan} strokeWidth="1.5" strokeLinecap="round"/></> },
          ].map(s => (
            <div key={s.label} style={{ padding: "16px 18px", background: T.surface, borderRadius: 12, border: `1px solid ${T.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: `${s.color}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="16" height="16" viewBox="0 0 16 16">{s.icon}</svg>
                </div>
                <span style={{ fontSize: 10, color: T.text3, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</span>
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: `1px solid ${T.border}` }}>
          {[
            { key: "all", label: "All Calls" },
            { key: "recorded", label: "Recorded" },
            { key: "huddles", label: "Huddles" },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)} style={{
              padding: "10px 18px", border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer",
              background: "transparent", color: filter === f.key ? T.text : T.text3,
              borderBottom: `2px solid ${filter === f.key ? T.accent : "transparent"}`,
              transition: "all 0.15s",
            }}>{f.label}</button>
          ))}
        </div>

        {/* Call list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {filtered.map(call => {
            const sel = selectedCall?.id === call.id;
            return (
              <div key={call.id} onClick={() => setSelectedCall(call)} style={{
                display: "flex", alignItems: "center", gap: 14, padding: "14px 16px",
                borderRadius: 12, cursor: "pointer", transition: "all 0.12s",
                background: sel ? `${T.accent}10` : T.surface,
                border: `1px solid ${sel ? T.accent : T.border}`,
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                  background: call.type === "huddle" ? `${T.green}15` : `${T.accent}15`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  {call.type === "huddle" ? (
                    <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><path d="M2 4a2 2 0 012-2h8a2 2 0 012 2v5a2 2 0 01-2 2H8l-3 2.5V11H4a2 2 0 01-2-2V4z" fill={T.green}/></svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="10" height="10" rx="2" fill={T.accent}/><path d="M11 6l4-2v8l-4-2V6z" fill={T.accent}/></svg>
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>{call.title}</div>
                  <div style={{ fontSize: 12, color: T.text3 }}>{call.date} · {call.participants.length} people · {call.duration}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: -4 }}>
                  {call.participants.slice(0, 3).map(uid => <Ava key={uid} uid={uid} sz={24} />)}
                  {call.participants.length > 3 && <span style={{ fontSize: 10, color: T.text3, marginLeft: 6 }}>+{call.participants.length - 3}</span>}
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  {call.recording && (
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 6, background: `${T.red}15`, color: T.red }}>
                      <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: 6, background: T.red, marginRight: 4 }} />REC
                    </span>
                  )}
                  {call.transcript && (
                    <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 6, background: `${T.cyan}15`, color: T.cyan }}>AI</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail panel */}
      {selectedCall && (
        <div style={{ width: 380, borderLeft: `1px solid ${T.border}`, background: T.surface, flexShrink: 0, overflow: "auto", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: `1px solid ${T.border}` }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: T.text3 }}>Call Details</span>
            <button onClick={() => setSelectedCall(null)} style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text3, cursor: "pointer", width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8" stroke={T.text3} strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>
          </div>
          <div style={{ padding: "20px 24px", flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>{selectedCall.title}</div>
            <div style={{ fontSize: 12, color: T.text3, marginBottom: 20 }}>{selectedCall.date} · {selectedCall.duration}</div>

            {/* Actions row */}
            <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
              {selectedCall.recording && (
                <button style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 12, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                  <svg width="12" height="12" viewBox="0 0 16 16"><path d="M6 4l6 4-6 4z" fill={T.accent}/></svg>
                  Play
                </button>
              )}
              <button style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>Share</button>
            </div>

            {/* Fields */}
            {[
              { icon: "📅", label: "When", value: selectedCall.date },
              { icon: "⏱", label: "Duration", value: selectedCall.duration },
              { icon: "🎥", label: "Type", value: selectedCall.type === "huddle" ? "Huddle" : "Scheduled Call" },
              { icon: "🔴", label: "Recording", value: selectedCall.recording ? "Available" : "Not recorded" },
              { icon: "🤖", label: "AI Summary", value: selectedCall.transcript ? "Generated" : "Not available" },
            ].map(f => (
              <div key={f.label} style={{ display: "grid", gridTemplateColumns: "110px 1fr", padding: "10px 0", borderBottom: `1px solid ${T.border}`, alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.text3 }}>
                  <span style={{ fontSize: 14 }}>{f.icon}</span><span>{f.label}</span>
                </div>
                <span style={{ fontSize: 13, color: T.text }}>{f.value}</span>
              </div>
            ))}

            {/* Participants */}
            <div style={{ marginTop: 20, marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Participants ({selectedCall.participants.length})</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {selectedCall.participants.map(uid => {
                  const u = getUser(uid);
                  return (
                    <div key={uid} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Ava uid={uid} sz={28} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{u.name}</div>
                        <div style={{ fontSize: 11, color: T.text3 }}>{u.role}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* AI Summary */}
            {selectedCall.summary && (
              <div style={{ marginTop: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 6, background: `${T.cyan}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <svg width="12" height="12" viewBox="0 0 16 16"><rect x="3" y="2" width="10" height="12" rx="2" fill="none" stroke={T.cyan} strokeWidth="1.5"/><path d="M6 6h4M6 9h3" stroke={T.cyan} strokeWidth="1.5" strokeLinecap="round"/></svg>
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>AI Summary</span>
                </div>
                <div style={{ fontSize: 13, color: T.text2, lineHeight: 1.6, padding: 14, background: T.surface2, borderRadius: 10, border: `1px solid ${T.border}`, marginBottom: 16 }}>
                  {selectedCall.summary}
                </div>

                {selectedCall.actions.length > 0 && (
                  <>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Action Items</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {selectedCall.actions.map((a, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 12px", background: T.surface2, borderRadius: 8, border: `1px solid ${T.border}` }}>
                          <div style={{ width: 16, height: 16, borderRadius: 8, border: `2px solid ${T.border}`, flexShrink: 0, marginTop: 1 }} />
                          <span style={{ fontSize: 12, color: T.text2, lineHeight: 1.4 }}>{a}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}