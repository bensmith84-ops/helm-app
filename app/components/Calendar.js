"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";

const PRIORITY_COLORS = {
  urgent: "#ef4444", high: "#f97316", medium: "#eab308", low: "#22c55e", none: "#6b7280",
};
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export default function CalendarView() {
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState({});
  const [month, setMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: t }, { data: p }] = await Promise.all([
        supabase.from("tasks").select("*").is("deleted_at", null).not("due_date", "is", null),
        supabase.from("projects").select("id,name,color").is("deleted_at", null),
      ]);
      setTasks(t || []);
      const m = {}; (p || []).forEach(pr => { m[pr.id] = pr; }); setProjects(m);
      setLoading(false);
    })();
  }, []);

  const year = month.getFullYear();
  const mo = month.getMonth();
  const firstDay = new Date(year, mo, 1).getDay();
  const daysInMonth = new Date(year, mo + 1, 0).getDate();
  const today = new Date().toISOString().split("T")[0];

  const prev = () => setMonth(new Date(year, mo - 1, 1));
  const next = () => setMonth(new Date(year, mo + 1, 1));
  const goToday = () => setMonth(new Date());

  const getTasksForDate = (dateStr) => tasks.filter(t => t.due_date === dateStr);

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const selectedTasks = selectedDate ? getTasksForDate(selectedDate) : [];

  if (loading) return <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: T.text3, fontSize: 13 }}>Loading calendar…</div>;

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ padding: "16px 24px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
          <button onClick={prev} style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, cursor: "pointer", color: T.text3, padding: "6px 10px", fontSize: 14 }}>‹</button>
          <h2 style={{ fontSize: 18, fontWeight: 700, minWidth: 200, textAlign: "center" }}>{MONTHS[mo]} {year}</h2>
          <button onClick={next} style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, cursor: "pointer", color: T.text3, padding: "6px 10px", fontSize: 14 }}>›</button>
          <button onClick={goToday} style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, cursor: "pointer", color: T.text3, padding: "6px 10px", fontSize: 11, fontWeight: 600 }}>Today</button>
          <div style={{ flex: 1 }} />
          <span style={{ fontSize: 12, color: T.text3 }}>{tasks.length} tasks with due dates</span>
        </div>

        {/* Day headers */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", borderBottom: `1px solid ${T.border}` }}>
          {DAYS.map(d => (
            <div key={d} style={{ padding: "8px 0", textAlign: "center", fontSize: 11, fontWeight: 600, color: T.text3 }}>{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div style={{ flex: 1, overflow: "auto", display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gridAutoRows: "minmax(90px, 1fr)" }}>
          {cells.map((day, i) => {
            if (!day) return <div key={`e${i}`} style={{ borderRight: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}`, background: T.bg }} />;
            const dateStr = `${year}-${String(mo + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const dayTasks = getTasksForDate(dateStr);
            const isToday = dateStr === today;
            const isSel = dateStr === selectedDate;
            return (
              <div key={dateStr} onClick={() => setSelectedDate(dateStr)} style={{
                borderRight: `1px solid ${T.border}`, borderBottom: `1px solid ${T.border}`,
                padding: 4, cursor: "pointer", overflow: "hidden",
                background: isSel ? `${T.accent}10` : isToday ? `${T.accent}05` : "transparent",
              }}>
                <div style={{
                  fontSize: 12, fontWeight: isToday ? 700 : 500, marginBottom: 2,
                  color: isToday ? T.accent : T.text,
                  width: 24, height: 24, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
                  background: isToday ? `${T.accent}20` : "transparent",
                }}>{day}</div>
                {dayTasks.slice(0, 3).map(t => {
                  const proj = projects[t.project_id];
                  return (
                    <div key={t.id} style={{
                      fontSize: 10, padding: "2px 4px", borderRadius: 3, marginBottom: 1,
                      background: `${proj?.color || T.accent}20`, color: T.text,
                      overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      borderLeft: `2px solid ${PRIORITY_COLORS[t.priority] || "#6b7280"}`,
                    }}>{t.title}</div>
                  );
                })}
                {dayTasks.length > 3 && <div style={{ fontSize: 9, color: T.text3, paddingLeft: 4 }}>+{dayTasks.length - 3} more</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Day detail sidebar */}
      {selectedDate && (
        <div style={{ width: 320, borderLeft: `1px solid ${T.border}`, background: T.surface, flexShrink: 0, overflow: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: `1px solid ${T.border}` }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>{new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</span>
            <button onClick={() => setSelectedDate(null)} style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text3, cursor: "pointer", width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>×</button>
          </div>
          <div style={{ padding: 16 }}>
            <div style={{ fontSize: 11, color: T.text3, marginBottom: 8 }}>{selectedTasks.length} task{selectedTasks.length !== 1 ? "s" : ""} due</div>
            {selectedTasks.length === 0 && <div style={{ color: T.text3, fontSize: 13, padding: 20, textAlign: "center" }}>Nothing due this day</div>}
            {selectedTasks.map(t => {
              const proj = projects[t.project_id];
              const done = t.status === "done";
              return (
                <div key={t.id} style={{
                  padding: "10px 12px", borderRadius: 8, marginBottom: 6,
                  background: T.surface2, border: `1px solid ${T.border}`,
                  borderLeft: `3px solid ${PRIORITY_COLORS[t.priority] || "#6b7280"}`,
                  opacity: done ? 0.5 : 1,
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.text, textDecoration: done ? "line-through" : "none", marginBottom: 4 }}>{t.title}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 10, color: T.text3 }}>
                    {proj && <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 6, height: 6, borderRadius: 6, background: proj.color || T.accent }} />
                      {proj.name}
                    </span>}
                    <span>{t.status.replace("_", " ")}</span>
                    {t.priority && t.priority !== "none" && <span style={{ color: PRIORITY_COLORS[t.priority] }}>{t.priority}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
