"use client";
import { T, OBJECTIVES, KEY_RESULTS } from "../tokens";
import { Badge, Avatar, ProgressBar } from "./ui";

export default function OKRsView() {
  const healthColor = (h) => ({ on_track: T.green, at_risk: T.yellow, off_track: T.red }[h] || T.text3);
  return (
    <div style={{ padding: 24, overflow: "auto", maxWidth: 900 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Objectives & Key Results</h2>
      <p style={{ fontSize: 12, color: T.text3, marginBottom: 20 }}>Q1 2026 · Jan 1 – Mar 31</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {OBJECTIVES.map(obj => (
          <div key={obj.id} style={{ background: T.surface2, borderRadius: 10, border: `1px solid ${T.border}`, overflow: "hidden" }}>
            <div style={{ padding: 16, borderBottom: `1px solid ${T.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Avatar user={obj.owner} size={24} />
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{obj.title}</span>
                </div>
                <Badge color={healthColor(obj.health)}>{obj.health.replace(/_/g, " ")}</Badge>
              </div>
              <ProgressBar value={obj.progress} color={healthColor(obj.health)} height={5} />
              <div style={{ fontSize: 11, color: T.text3, marginTop: 4, textAlign: "right" }}>{obj.progress}%</div>
            </div>
            <div style={{ padding: "8px 16px 16px" }}>
              {KEY_RESULTS.filter(kr => kr.objective === obj.id).map(kr => (
                <div key={kr.id} style={{ padding: "8px 0", display: "flex", alignItems: "center", gap: 12, borderBottom: `1px solid ${T.border}20` }}>
                  <div style={{ flex: 1, fontSize: 12, color: T.text2 }}>{kr.title}</div>
                  <div style={{ width: 80 }}><ProgressBar value={kr.progress} color={T.accent} height={3} /></div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: T.text2, minWidth: 35, textAlign: "right" }}>{kr.progress}%</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
