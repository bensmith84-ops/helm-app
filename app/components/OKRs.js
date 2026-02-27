"use client";
import { useState } from "react";
import { T, OBJECTIVES, KEY_RESULTS, getUser } from "../tokens";

const HEALTH = {
  on_track:  { label: "On Track",  color: "#22c55e", bg: "#0d3a20" },
  at_risk:   { label: "At Risk",   color: "#eab308", bg: "#3d3000" },
  off_track: { label: "Off Track", color: "#ef4444", bg: "#3d1111" },
};
const AVATAR_COLORS = ["#3b82f6","#a855f7","#ec4899","#06b6d4","#f97316","#22c55e","#84cc16","#ef4444"];

export default function OKRsView() {
  const [expandedObj, setExpandedObj] = useState(OBJECTIVES.map(o => o.id));
  const [selectedKR, setSelectedKR] = useState(null);

  const toggle = (id) => setExpandedObj(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const overallProgress = OBJECTIVES.length > 0 ? Math.round(OBJECTIVES.reduce((s, o) => s + o.progress, 0) / OBJECTIVES.length) : 0;
  const onTrackCount = OBJECTIVES.filter(o => o.health === "on_track").length;
  const atRiskCount = OBJECTIVES.filter(o => o.health === "at_risk" || o.health === "off_track").length;

  const Ava = ({ uid, sz = 24 }) => {
    const u = getUser(uid);
    const c = AVATAR_COLORS[uid.charCodeAt(1) % AVATAR_COLORS.length];
    return (
      <div title={u.name} style={{
        width: sz, height: sz, borderRadius: "50%", background: `${c}18`, border: `1.5px solid ${c}50`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: Math.max(sz * 0.38, 9), fontWeight: 700, color: c, flexShrink: 0,
      }}>{u.avatar}</div>
    );
  };

  const Ring = ({ pct, size = 48, stroke = 5, color = T.green }) => (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={(size-stroke)/2} fill="none" stroke={T.surface3} strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={(size-stroke)/2} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${pct * ((size-stroke)*Math.PI)/100} ${(size-stroke)*Math.PI}`}
        strokeLinecap="round" style={{ transition: "stroke-dasharray 0.8s ease" }} />
    </svg>
  );

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Main content */}
      <div style={{ flex: 1, overflow: "auto", padding: "28px 32px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Objectives & Key Results</h2>
            <p style={{ fontSize: 13, color: T.text3 }}>Q1 2026 · Jan 1 – Mar 31</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ position: "relative", width: 56, height: 56 }}>
                <Ring pct={overallProgress} size={56} stroke={5} color={T.green} />
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 14, fontWeight: 800, color: T.green }}>{overallProgress}%</span>
                </div>
              </div>
              <div style={{ fontSize: 9, color: T.text3, marginTop: 4 }}>Overall</div>
            </div>
          </div>
        </div>

        {/* Stats bar */}
        <div style={{ display: "flex", gap: 12, marginBottom: 24 }}>
          {[
            { label: "Objectives", value: OBJECTIVES.length, color: T.accent },
            { label: "Key Results", value: KEY_RESULTS.length, color: T.purple },
            { label: "On Track", value: onTrackCount, color: T.green },
            { label: "Needs Attention", value: atRiskCount, color: atRiskCount > 0 ? T.yellow : T.text3 },
          ].map(s => (
            <div key={s.label} style={{ padding: "12px 18px", background: T.surface, borderRadius: 10, border: `1px solid ${T.border}`, flex: 1 }}>
              <div style={{ fontSize: 10, color: T.text3, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{s.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* Objectives */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {OBJECTIVES.map(obj => {
            const krs = KEY_RESULTS.filter(kr => kr.objective === obj.id);
            const h = HEALTH[obj.health] || HEALTH.on_track;
            const expanded = expandedObj.includes(obj.id);
            return (
              <div key={obj.id} style={{ background: T.surface, borderRadius: 14, border: `1px solid ${T.border}`, overflow: "hidden" }}>
                {/* Objective header */}
                <div onClick={() => toggle(obj.id)} style={{
                  padding: "18px 22px", cursor: "pointer", display: "flex", alignItems: "center", gap: 14,
                  borderBottom: expanded ? `1px solid ${T.border}` : "none",
                }}>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill={T.text3} style={{ transition: "transform 0.2s", transform: expanded ? "rotate(0)" : "rotate(-90deg)", flexShrink: 0 }}>
                    <path d="M2 3l3 3.5L8 3" fill="none" stroke={T.text3} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <div style={{ position: "relative", width: 40, height: 40, flexShrink: 0 }}>
                    <Ring pct={obj.progress} size={40} stroke={4} color={h.color} />
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: h.color }}>{obj.progress}%</span>
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 3 }}>{obj.title}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Ava uid={obj.owner} sz={18} />
                      <span style={{ fontSize: 11, color: T.text3 }}>{getUser(obj.owner).name}</span>
                    </div>
                  </div>
                  <div style={{
                    padding: "4px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600,
                    background: h.bg, color: h.color,
                  }}>{h.label}</div>
                </div>

                {/* Key Results */}
                {expanded && (
                  <div style={{ padding: "4px 0" }}>
                    {/* Column headers */}
                    <div style={{
                      display: "grid", gridTemplateColumns: "1fr 100px 80px 60px",
                      padding: "6px 22px 6px 80px", fontSize: 10, fontWeight: 600, color: T.text3,
                      textTransform: "uppercase", letterSpacing: "0.06em",
                    }}>
                      <span>Key Result</span><span>Progress</span><span>Target</span><span>Current</span>
                    </div>
                    {krs.map(kr => {
                      const sel = selectedKR?.id === kr.id;
                      return (
                        <div key={kr.id} onClick={() => setSelectedKR(sel ? null : kr)} style={{
                          display: "grid", gridTemplateColumns: "1fr 100px 80px 60px",
                          padding: "12px 22px 12px 80px", alignItems: "center", cursor: "pointer",
                          borderBottom: `1px solid ${T.border}`,
                          background: sel ? `${T.accent}10` : "transparent",
                          borderLeft: sel ? `3px solid ${T.accent}` : "3px solid transparent",
                          transition: "background 0.1s",
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div style={{
                              width: 6, height: 6, borderRadius: 6, flexShrink: 0,
                              background: kr.progress >= 75 ? T.green : kr.progress >= 40 ? T.yellow : T.red,
                            }} />
                            <span style={{ fontSize: 13, fontWeight: 500 }}>{kr.title}</span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ flex: 1, height: 5, borderRadius: 5, background: T.surface3, overflow: "hidden" }}>
                              <div style={{
                                width: `${kr.progress}%`, height: "100%", borderRadius: 5,
                                background: kr.progress >= 75 ? T.green : kr.progress >= 40 ? T.yellow : T.red,
                                transition: "width 0.5s",
                              }} />
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 600, color: T.text2, minWidth: 28 }}>{kr.progress}%</span>
                          </div>
                          <span style={{ fontSize: 12, color: T.text3 }}>{kr.target}</span>
                          <span style={{ fontSize: 12, fontWeight: 600, color: T.text2 }}>{kr.current}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail panel */}
      {selectedKR && (
        <div style={{ width: 360, borderLeft: `1px solid ${T.border}`, background: T.surface, flexShrink: 0, overflow: "auto", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: `1px solid ${T.border}` }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: T.text3 }}>Key Result Detail</span>
            <button onClick={() => setSelectedKR(null)} style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text3, cursor: "pointer", width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8" stroke={T.text3} strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>
          </div>
          <div style={{ padding: "20px 24px", flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 20, lineHeight: 1.3 }}>{selectedKR.title}</div>
            {/* Progress ring */}
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24 }}>
              <div style={{ position: "relative", width: 64, height: 64 }}>
                <Ring pct={selectedKR.progress} size={64} stroke={6} color={selectedKR.progress >= 75 ? T.green : selectedKR.progress >= 40 ? T.yellow : T.red} />
                <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <span style={{ fontSize: 16, fontWeight: 800, color: selectedKR.progress >= 75 ? T.green : selectedKR.progress >= 40 ? T.yellow : T.red }}>{selectedKR.progress}%</span>
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: T.text3, marginBottom: 4 }}>Current / Target</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{selectedKR.current} <span style={{ color: T.text3, fontWeight: 400 }}>/ {selectedKR.target}</span></div>
              </div>
            </div>
            {/* Fields */}
            {[
              { icon: "🎯", label: "Objective", value: OBJECTIVES.find(o => o.id === selectedKR.objective)?.title || "" },
              { icon: "📊", label: "Progress", value: `${selectedKR.progress}%` },
              { icon: "🏁", label: "Target", value: selectedKR.target },
              { icon: "📈", label: "Current", value: selectedKR.current },
              { icon: "⚡", label: "Status", value: selectedKR.progress >= 75 ? "Strong" : selectedKR.progress >= 40 ? "Moderate" : "Behind" },
            ].map(f => (
              <div key={f.label} style={{ display: "grid", gridTemplateColumns: "110px 1fr", padding: "10px 0", borderBottom: `1px solid ${T.border}`, alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.text3 }}>
                  <span style={{ fontSize: 14 }}>{f.icon}</span><span>{f.label}</span>
                </div>
                <span style={{ fontSize: 13, color: T.text }}>{f.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}