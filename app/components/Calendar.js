"use client";
import { T, CALENDAR_EVENTS } from "../tokens";
import { Badge, Avatar } from "./ui";

export default function CalendarView() {
  const days = ["Mon 27", "Tue 28", "Wed 1", "Thu 2", "Fri 3"];
  return (
    <div style={{ padding: 24, overflow: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>Calendar</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <Badge color={T.text2}>← Feb 2026 →</Badge>
          <button style={{ background: T.accent, border: "none", borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 600, color: "#fff", cursor: "pointer" }}>+ New Event</button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 1, background: T.border, borderRadius: 8, overflow: "hidden" }}>
        {days.map((day, di) => (
          <div key={day} style={{ background: T.surface, minHeight: 400 }}>
            <div style={{ padding: "8px 10px", background: T.surface2, fontSize: 12, fontWeight: 600, color: di === 0 ? T.accent : T.text2, borderBottom: `1px solid ${T.border}` }}>
              {day}
            </div>
            <div style={{ padding: 6, display: "flex", flexDirection: "column", gap: 4 }}>
              {CALENDAR_EVENTS.filter(ev => ev.day === di).map(ev => (
                <div key={ev.id} style={{ padding: "8px 10px", borderRadius: 6, background: ev.color + "15", borderLeft: `3px solid ${ev.color}`, cursor: "pointer" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: ev.color, marginBottom: 2 }}>{ev.title}</div>
                  <div style={{ fontSize: 10, color: T.text3 }}>{ev.time} · {ev.duration}</div>
                  <div style={{ display: "flex", gap: -4, marginTop: 4 }}>
                    {ev.attendees.slice(0, 3).map(a => <Avatar key={a} user={a} size={16} />)}
                    {ev.attendees.length > 3 && <span style={{ fontSize: 9, color: T.text3, marginLeft: 4 }}>+{ev.attendees.length - 3}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
