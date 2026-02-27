"use client";
import { useState } from "react";
import { T } from "../tokens";

const REPORTS = [
  { id: "r1", name: "Weekly Sprint Report", type: "project", icon: "📊", schedule: "Every Monday 9 AM", lastRun: "Feb 24", description: "Task completion rates, blockers, and velocity metrics across all active projects.", metrics: [{ label: "Tasks Completed", value: "24", change: "+12%" }, { label: "Velocity", value: "34 pts", change: "+8%" }] },
  { id: "r2", name: "OKR Progress Dashboard", type: "okr", icon: "🎯", schedule: "Manual", lastRun: "Feb 26", description: "Progress tracking for Q1 2026 objectives and key results.", metrics: [{ label: "Avg Progress", value: "40%", change: "+5%" }, { label: "On Track", value: "2/3", change: "—" }] },
  { id: "r3", name: "PLM Pipeline Overview", type: "plm", icon: "⬢", schedule: "Every Friday", lastRun: "Feb 21", description: "Product lifecycle status, stage progression, and pipeline health.", metrics: [{ label: "Active Programs", value: "3", change: "—" }, { label: "In Pilot", value: "1", change: "New" }] },
  { id: "r4", name: "Campaign Performance", type: "marketing", icon: "📣", schedule: "Daily 8 AM", lastRun: "Feb 27", description: "Campaign spend, ROI, content pipeline status, and channel performance.", metrics: [{ label: "Budget Used", value: "67%", change: "+3%" }, { label: "Content Live", value: "8", change: "+2" }] },
  { id: "r5", name: "Team Workload Report", type: "workload", icon: "👥", schedule: "Every Monday 8 AM", lastRun: "Feb 24", description: "Task distribution, utilization rates, and capacity planning.", metrics: [{ label: "Avg Utilization", value: "72%", change: "-3%" }, { label: "Overloaded", value: "1", change: "—" }] },
  { id: "r6", name: "Automation Analytics", type: "automation", icon: "⚡", schedule: "Weekly", lastRun: "Feb 25", description: "Automation rule performance, trigger frequency, and time saved.", metrics: [{ label: "Rules Active", value: "4", change: "—" }, { label: "Time Saved", value: "18h", change: "+3h" }] },
];

const TYPE_COLORS = {
  project: T.accent, okr: T.green, plm: T.cyan, marketing: T.orange, workload: T.yellow, automation: T.purple,
};

const CHART_DATA = {
  completion: [65, 72, 58, 80, 75, 88, 87],
  velocity: [28, 32, 24, 36, 30, 34, 34],
  workload: [60, 75, 88, 70, 65, 72, 72],
};

export default function ReportsView() {
  const [selectedReport, setSelectedReport] = useState(null);
  const [filter, setFilter] = useState("all");

  const filtered = filter === "all" ? REPORTS : REPORTS.filter(r => r.type === filter);

  const MiniChart = ({ data, color, height = 40 }) => {
    const max = Math.max(...data);
    const w = 100;
    const barW = (w / data.length) - 3;
    return (
      <svg width={w} height={height} viewBox={`0 0 ${w} ${height}`}>
        {data.map((v, i) => {
          const h = (v / max) * (height - 4);
          const x = i * (barW + 3) + 1;
          const isLast = i === data.length - 1;
          return <rect key={i} x={x} y={height - h - 2} width={barW} height={h} rx={2} fill={isLast ? color : `${color}50`} />;
        })}
      </svg>
    );
  };

  const Sparkline = ({ data, color, width = 80, height = 24 }) => {
    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min || 1;
    const points = data.map((v, i) => `${(i / (data.length - 1)) * width},${height - 2 - ((v - min) / range) * (height - 4)}`).join(" ");
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Main */}
      <div style={{ flex: 1, overflow: "auto", padding: "28px 32px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Reports & Analytics</h2>
            <p style={{ fontSize: 13, color: T.text3 }}>Dashboards, scheduled reports, and workspace analytics</p>
          </div>
          <button style={{ padding: "8px 18px", borderRadius: 10, border: "none", background: T.accent, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="12" height="12" viewBox="0 0 12 12"><path d="M6 1v10M1 6h10" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/></svg>
            New Report
          </button>
        </div>

        {/* Metric cards with charts */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 28 }}>
          {[
            { label: "Task Completion", value: "87%", change: "+5%", data: CHART_DATA.completion, color: T.green },
            { label: "Team Velocity", value: "34 pts", change: "+2 pts", data: CHART_DATA.velocity, color: T.accent },
            { label: "Workload Balance", value: "72%", change: "-3%", data: CHART_DATA.workload, color: T.yellow },
          ].map(m => (
            <div key={m.label} style={{ padding: "18px 20px", background: T.surface, borderRadius: 14, border: `1px solid ${T.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 10, color: T.text3, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{m.label}</div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <span style={{ fontSize: 28, fontWeight: 800, color: m.color }}>{m.value}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: m.change.startsWith("+") ? T.green : m.change.startsWith("-") ? T.red : T.text3 }}>{m.change}</span>
                  </div>
                </div>
                <Sparkline data={m.data} color={m.color} />
              </div>
              <MiniChart data={m.data} color={m.color} height={36} />
              <div style={{ fontSize: 10, color: T.text3, marginTop: 6 }}>Last 7 days</div>
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: `1px solid ${T.border}` }}>
          {[
            { key: "all", label: "All Reports" },
            { key: "project", label: "Projects" },
            { key: "marketing", label: "Marketing" },
            { key: "okr", label: "OKRs" },
            { key: "plm", label: "PLM" },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)} style={{
              padding: "10px 18px", border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer",
              background: "transparent", color: filter === f.key ? T.text : T.text3,
              borderBottom: `2px solid ${filter === f.key ? T.accent : "transparent"}`, transition: "all 0.15s",
            }}>{f.label}</button>
          ))}
        </div>

        {/* Report list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map(report => {
            const sel = selectedReport?.id === report.id;
            const typeColor = TYPE_COLORS[report.type] || T.accent;
            return (
              <div key={report.id} onClick={() => setSelectedReport(report)} style={{
                display: "flex", alignItems: "center", gap: 16, padding: "16px 18px",
                borderRadius: 12, cursor: "pointer", transition: "all 0.12s",
                background: sel ? `${T.accent}08` : T.surface,
                border: `1px solid ${sel ? T.accent : T.border}`,
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                  background: `${typeColor}15`, display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 18,
                }}>{report.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>{report.name}</div>
                  <div style={{ fontSize: 12, color: T.text3 }}>{report.schedule} · Last: {report.lastRun}</div>
                </div>
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 6,
                  background: `${typeColor}15`, color: typeColor,
                }}>{report.type}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail panel */}
      {selectedReport && (
        <div style={{ width: 380, borderLeft: `1px solid ${T.border}`, background: T.surface, flexShrink: 0, overflow: "auto", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: `1px solid ${T.border}` }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: T.text3 }}>Report Details</span>
            <button onClick={() => setSelectedReport(null)} style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text3, cursor: "pointer", width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8" stroke={T.text3} strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>
          </div>
          <div style={{ padding: "20px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
              <div style={{ width: 48, height: 48, borderRadius: 12, background: `${TYPE_COLORS[selectedReport.type] || T.accent}15`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>{selectedReport.icon}</div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{selectedReport.name}</div>
                <span style={{
                  fontSize: 10, fontWeight: 600, padding: "2px 10px", borderRadius: 6,
                  background: `${TYPE_COLORS[selectedReport.type] || T.accent}15`,
                  color: TYPE_COLORS[selectedReport.type] || T.accent,
                }}>{selectedReport.type}</span>
              </div>
            </div>

            <div style={{ fontSize: 13, color: T.text2, lineHeight: 1.6, padding: 14, background: T.surface2, borderRadius: 10, border: `1px solid ${T.border}`, marginBottom: 24 }}>
              {selectedReport.description}
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
              <button style={{ flex: 1, padding: "9px 12px", borderRadius: 8, border: "none", background: T.accent, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Run Now</button>
              <button style={{ flex: 1, padding: "9px 12px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>Export</button>
            </div>

            {/* Fields */}
            {[
              { icon: "📅", label: "Schedule", value: selectedReport.schedule },
              { icon: "🕐", label: "Last Run", value: selectedReport.lastRun },
              { icon: "📁", label: "Category", value: selectedReport.type },
            ].map(f => (
              <div key={f.label} style={{ display: "grid", gridTemplateColumns: "110px 1fr", padding: "10px 0", borderBottom: `1px solid ${T.border}`, alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.text3 }}>
                  <span style={{ fontSize: 14 }}>{f.icon}</span><span>{f.label}</span>
                </div>
                <span style={{ fontSize: 13, color: T.text }}>{f.value}</span>
              </div>
            ))}

            {/* Key Metrics */}
            {selectedReport.metrics && (
              <div style={{ marginTop: 24 }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>Key Metrics</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {selectedReport.metrics.map(m => (
                    <div key={m.label} style={{ padding: 14, background: T.surface2, borderRadius: 10, border: `1px solid ${T.border}` }}>
                      <div style={{ fontSize: 10, color: T.text3, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 6 }}>{m.label}</div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                        <span style={{ fontSize: 20, fontWeight: 800, color: T.text }}>{m.value}</span>
                        <span style={{ fontSize: 11, fontWeight: 600, color: m.change.startsWith("+") ? T.green : m.change.startsWith("-") ? T.red : T.text3 }}>{m.change}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Run history */}
            <div style={{ marginTop: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Run History</div>
              {[
                { date: selectedReport.lastRun, status: "success", duration: "2.3s" },
                { date: "Feb 20", status: "success", duration: "1.8s" },
                { date: "Feb 17", status: "success", duration: "2.1s" },
                { date: "Feb 13", status: "failed", duration: "0.5s" },
                { date: "Feb 10", status: "success", duration: "1.9s" },
              ].map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
                  <div style={{ width: 8, height: 8, borderRadius: 8, background: r.status === "success" ? T.green : T.red }} />
                  <span style={{ fontSize: 12, flex: 1 }}>{r.date}</span>
                  <span style={{ fontSize: 11, color: T.text3 }}>{r.duration}</span>
                  <span style={{ fontSize: 11, color: r.status === "success" ? T.green : T.red, fontWeight: 500 }}>{r.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}