"use client";
import { T } from "../tokens";
import { SectionHeader, Badge } from "./ui";

export default function ReportsView() {
  const miniChart = (data, color) => {
    const max = Math.max(...data);
    return (
      <div style={{ display: "flex", alignItems: "end", gap: 2, height: 32 }}>
        {data.map((v, i) => (
          <div key={i} style={{ flex: 1, height: `${(v/max)*100}%`, background: color + "60", borderRadius: 2, minHeight: 2 }} />
        ))}
      </div>
    );
  };

  return (
    <div style={{ padding: 24, overflow: "auto" }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Reports & Dashboards</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
        <div style={{ background: T.surface2, borderRadius: 10, border: `1px solid ${T.border}`, padding: 16 }}>
          <div style={{ fontSize: 11, color: T.text3, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>Task Completion</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: T.green, marginBottom: 8 }}>87%</div>
          {miniChart([12, 8, 15, 22, 18, 24, 20], T.green)}
          <div style={{ fontSize: 10, color: T.text3, marginTop: 4 }}>Last 7 days</div>
        </div>
        <div style={{ background: T.surface2, borderRadius: 10, border: `1px solid ${T.border}`, padding: 16 }}>
          <div style={{ fontSize: 11, color: T.text3, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>Team Velocity</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: T.accent, marginBottom: 8 }}>34 pts</div>
          {miniChart([28, 32, 24, 36, 30, 34, 34], T.accent)}
          <div style={{ fontSize: 10, color: T.text3, marginTop: 4 }}>Per sprint avg</div>
        </div>
        <div style={{ background: T.surface2, borderRadius: 10, border: `1px solid ${T.border}`, padding: 16 }}>
          <div style={{ fontSize: 11, color: T.text3, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>Workload Balance</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: T.yellow, marginBottom: 8 }}>72%</div>
          {miniChart([60, 75, 88, 70, 65, 72, 72], T.yellow)}
          <div style={{ fontSize: 10, color: T.text3, marginTop: 4 }}>Avg utilization</div>
        </div>
      </div>

      <SectionHeader icon="▥" title="Saved Reports" />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {[
          { name: "Weekly Sprint Report", type: "project", schedule: "Every Monday 9 AM", lastRun: "Feb 24" },
          { name: "OKR Progress Dashboard", type: "okr", schedule: "Manual", lastRun: "Feb 26" },
          { name: "PLM Pipeline Overview", type: "plm", schedule: "Every Friday", lastRun: "Feb 21" },
          { name: "Campaign Performance", type: "marketing", schedule: "Daily 8 AM", lastRun: "Feb 27" },
          { name: "Team Workload Report", type: "workload", schedule: "Every Monday 8 AM", lastRun: "Feb 24" },
        ].map(r => (
          <div key={r.name} style={{ background: T.surface2, borderRadius: 8, padding: 12, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 6, background: T.surface3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>📊</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</div>
              <div style={{ fontSize: 11, color: T.text3 }}>{r.schedule} · Last: {r.lastRun}</div>
            </div>
            <Badge small color={T.accent}>{r.type}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
