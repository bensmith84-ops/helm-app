"use client";
import { useState } from "react";
import { T, CALENDAR_EVENTS, getUser } from "../tokens";

const AVATAR_COLORS = ["#3b82f6","#a855f7","#ec4899","#06b6d4","#f97316","#22c55e","#84cc16","#ef4444"];
const HOURS = [8,9,10,11,12,13,14,15,16,17];

export default function CalendarView() {
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [viewMode, setViewMode] = useState("week"); // week | day

  const today = new Date();
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - today.getDay() + 1);

  const days = Array.from({ length: 5 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const dayNames = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

  // Parse time to hour
  const parseHour = (timeStr) => {
    const m = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
    if (!m) return 9;
    let h = parseInt(m[1]);
    if (m[3].toUpperCase() === "PM" && h !== 12) h += 12;
    if (m[3].toUpperCase() === "AM" && h === 12) h = 0;
    return h;
  };

  const parseDuration = (dur) => {
    const m = dur.match(/(\d+)(h|m)/);
    if (!m) return 60;
    return m[2] === "h" ? parseInt(m[1]) * 60 : parseInt(m[1]);
  };

  const Ava = ({ uid, sz = 20 }) => {
    const u = getUser(uid);
    const c = AVATAR_COLORS[uid.charCodeAt(1) % AVATAR_COLORS.length];
    return (
      <div title={u.name} style={{
        width: sz, height: sz, borderRadius: "50%", background: `${c}18`, border: `1px solid ${c}50`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: Math.max(sz * 0.38, 8), fontWeight: 700, color: c, flexShrink: 0,
      }}>{u.avatar}</div>
    );
  };

  const todayEvents = CALENDAR_EVENTS.filter(e => e.day === 0);
  const totalMeetingMins = CALENDAR_EVENTS.reduce((s, e) => s + parseDuration(e.duration), 0);

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Main calendar */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ padding: "16px 28px", borderBottom: `1px solid ${T.border}`, background: T.surface, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <h2 style={{ fontSize: 20, fontWeight: 800 }}>
              {monthNames[today.getMonth()]} {today.getFullYear()}
            </h2>
            <div style={{ display: "flex", gap: 4 }}>
              <button style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: T.text3 }}>
                <svg width="10" height="10" viewBox="0 0 10 10"><path d="M7 1L3 5l4 4" fill="none" stroke={T.text3} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
              <button style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: T.text3 }}>
                <svg width="10" height="10" viewBox="0 0 10 10"><path d="M3 1l4 4-4 4" fill="none" stroke={T.text3} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </div>
            <button style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Today</button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* View toggle */}
            <div style={{ display: "flex", gap: 0 }}>
              {["week", "day"].map(v => (
                <button key={v} onClick={() => setViewMode(v)} style={{
                  padding: "6px 14px", border: "none", fontSize: 12, fontWeight: 500, cursor: "pointer",
                  background: "transparent", color: viewMode === v ? T.text : T.text3,
                  borderBottom: `2px solid ${viewMode === v ? T.accent : "transparent"}`,
                  transition: "all 0.15s", textTransform: "capitalize",
                }}>{v}</button>
              ))}
            </div>
            <button style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: T.accent, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>+ Event</button>
          </div>
        </div>

        {/* Day headers */}
        <div style={{ display: "grid", gridTemplateColumns: `60px repeat(${viewMode === "week" ? 5 : 1}, 1fr)`, borderBottom: `1px solid ${T.border}`, background: T.surface, flexShrink: 0 }}>
          <div />
          {(viewMode === "week" ? days : [days[0]]).map((d, i) => {
            const isToday = d.toDateString() === today.toDateString();
            return (
              <div key={i} style={{ padding: "10px 12px", textAlign: "center", borderLeft: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: isToday ? T.accent : T.text3, marginBottom: 2 }}>{dayNames[viewMode === "week" ? i : today.getDay() - 1]}</div>
                <div style={{
                  fontSize: 20, fontWeight: 700, color: isToday ? T.accent : T.text,
                  width: 32, height: 32, borderRadius: 16, display: "inline-flex", alignItems: "center", justifyContent: "center",
                  background: isToday ? `${T.accent}15` : "transparent",
                }}>{d.getDate()}</div>
              </div>
            );
          })}
        </div>

        {/* Time grid */}
        <div style={{ flex: 1, overflow: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: `60px repeat(${viewMode === "week" ? 5 : 1}, 1fr)`, position: "relative" }}>
            {/* Hour labels */}
            <div>
              {HOURS.map(h => (
                <div key={h} style={{ height: 64, display: "flex", alignItems: "flex-start", justifyContent: "flex-end", paddingRight: 10, paddingTop: 0, fontSize: 10, color: T.text3, fontWeight: 500 }}>
                  {h === 12 ? "12 PM" : h > 12 ? `${h-12} PM` : `${h} AM`}
                </div>
              ))}
            </div>
            {/* Day columns */}
            {(viewMode === "week" ? [0,1,2,3,4] : [0]).map(di => (
              <div key={di} style={{ position: "relative", borderLeft: `1px solid ${T.border}` }}>
                {HOURS.map(h => (
                  <div key={h} style={{ height: 64, borderBottom: `1px solid ${T.border}20` }} />
                ))}
                {/* Events */}
                {CALENDAR_EVENTS.filter(e => viewMode === "week" ? e.day === di : e.day === 0).map(ev => {
                  const hour = parseHour(ev.time);
                  const dur = parseDuration(ev.duration);
                  const top = (hour - HOURS[0]) * 64;
                  const height = Math.max((dur / 60) * 64, 28);
                  const sel = selectedEvent?.id === ev.id;
                  return (
                    <div key={ev.id} onClick={() => setSelectedEvent(ev)} style={{
                      position: "absolute", top, left: 4, right: 4, height,
                      background: `${ev.color}20`, border: `1px solid ${sel ? ev.color : `${ev.color}40`}`,
                      borderLeft: `3px solid ${ev.color}`, borderRadius: 6,
                      padding: "4px 8px", cursor: "pointer", overflow: "hidden",
                      transition: "border-color 0.15s", zIndex: sel ? 2 : 1,
                    }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: ev.color, lineHeight: 1.2, marginBottom: 2 }}>{ev.title}</div>
                      <div style={{ fontSize: 10, color: T.text3 }}>{ev.time} · {ev.duration}</div>
                      {height > 50 && (
                        <div style={{ display: "flex", gap: -2, marginTop: 4 }}>
                          {ev.attendees.slice(0, 4).map(a => <Ava key={a} uid={a} sz={16} />)}
                          {ev.attendees.length > 4 && <span style={{ fontSize: 9, color: T.text3, marginLeft: 4 }}>+{ev.attendees.length-4}</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Detail panel */}
      {selectedEvent && (
        <div style={{ width: 340, borderLeft: `1px solid ${T.border}`, background: T.surface, flexShrink: 0, overflow: "auto", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: `1px solid ${T.border}` }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: T.text3 }}>Event Details</span>
            <button onClick={() => setSelectedEvent(null)} style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text3, cursor: "pointer", width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8" stroke={T.text3} strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>
          </div>
          <div style={{ padding: "20px 24px" }}>
            {/* Color bar + title */}
            <div style={{ display: "flex", alignItems: "flex-start", gap: 12, marginBottom: 24 }}>
              <div style={{ width: 4, height: 40, borderRadius: 2, background: selectedEvent.color, flexShrink: 0, marginTop: 2 }} />
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.3, marginBottom: 4 }}>{selectedEvent.title}</div>
                <div style={{ fontSize: 13, color: T.text3 }}>{selectedEvent.time} · {selectedEvent.duration}</div>
              </div>
            </div>

            {/* Fields */}
            {[
              { icon: "🕐", label: "Time", value: `${selectedEvent.time} (${selectedEvent.duration})` },
              { icon: "📅", label: "Day", value: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"][selectedEvent.day] || "—" },
              { icon: "📹", label: "Video", value: selectedEvent.hasCall ? "Video call enabled" : "No video call" },
              { icon: "👥", label: "Attendees", value: `${selectedEvent.attendees.length} people` },
            ].map(f => (
              <div key={f.label} style={{ display: "grid", gridTemplateColumns: "110px 1fr", padding: "10px 0", borderBottom: `1px solid ${T.border}`, alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.text3 }}>
                  <span style={{ fontSize: 14 }}>{f.icon}</span><span>{f.label}</span>
                </div>
                <span style={{ fontSize: 13, color: T.text }}>{f.value}</span>
              </div>
            ))}

            {/* Attendees list */}
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Attendees</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {selectedEvent.attendees.map(uid => {
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

            {/* Actions */}
            {selectedEvent.hasCall && (
              <button style={{
                width: "100%", padding: "10px 16px", borderRadius: 10, border: "none",
                background: T.green, color: "#fff", fontSize: 13, fontWeight: 600,
                cursor: "pointer", marginTop: 24, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="7" stroke="#fff" strokeWidth="1.5"/><path d="M6 5.5l5 2.5-5 2.5z" fill="#fff"/></svg>
                Join Video Call
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}