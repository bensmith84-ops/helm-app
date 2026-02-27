"use client";
import { T, AUTOMATIONS } from "../tokens";
import { Stat, SectionHeader, Badge } from "./ui";

export default function AutomationView() {
  return (
    <div style={{ padding: 24, overflow: "auto", maxWidth: 800 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>Automation Rules</h2>
        <button style={{ background: T.accent, border: "none", borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 600, color: "#fff", cursor: "pointer" }}>+ New Rule</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 24 }}>
        <Stat label="Active Rules" value={AUTOMATIONS.filter(a => a.active).length} color={T.green} />
        <Stat label="Total Runs" value={AUTOMATIONS.reduce((s, a) => s + a.runs, 0)} color={T.accent} />
        <Stat label="Time Saved" value="~18h" sub="This month" color={T.purple} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {AUTOMATIONS.map(a => (
          <div key={a.id} style={{ background: T.surface2, borderRadius: 8, padding: 14, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: a.active ? T.accentDim : T.surface3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>⚡</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{a.name}</div>
              <div style={{ fontSize: 11, color: T.text3 }}>
                <span style={{ color: T.yellow }}>When</span> {a.trigger} → <span style={{ color: T.green }}>Then</span> {a.action}
              </div>
            </div>
            <Badge small color={T.text3}>{a.runs} runs</Badge>
            <div style={{ width: 32, height: 18, borderRadius: 9, background: a.active ? T.green : T.surface3, padding: 2, cursor: "pointer" }}>
              <div style={{ width: 14, height: 14, borderRadius: 7, background: "#fff", transition: "transform 0.15s", transform: a.active ? "translateX(14px)" : "translateX(0)" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
