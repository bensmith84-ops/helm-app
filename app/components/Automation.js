"use client";
import { useState } from "react";
import { T, AUTOMATIONS } from "../tokens";

const CATEGORY_COLORS = {
  projects: "#3b82f6",
  tasks: "#22c55e",
  notifications: "#a855f7",
  campaigns: "#f97316",
  plm: "#06b6d4",
};

export default function AutomationView() {
  const [rules, setRules] = useState(AUTOMATIONS.map(a => ({ ...a })));
  const [selectedRule, setSelectedRule] = useState(null);
  const [filter, setFilter] = useState("all");

  const toggleRule = (id) => {
    setRules(p => p.map(r => r.id === id ? { ...r, active: !r.active } : r));
    if (selectedRule?.id === id) setSelectedRule(p => ({ ...p, active: !p.active }));
  };

  const activeCount = rules.filter(r => r.active).length;
  const totalRuns = rules.reduce((s, r) => s + r.runs, 0);
  const filtered = filter === "all" ? rules : rules.filter(r => r.active === (filter === "active"));

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Main */}
      <div style={{ flex: 1, overflow: "auto", padding: "28px 32px" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Automation Rules</h2>
            <p style={{ fontSize: 13, color: T.text3 }}>Automate workflows with triggers and actions</p>
          </div>
          <button style={{ padding: "8px 18px", borderRadius: 10, border: "none", background: T.accent, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
            <svg width="12" height="12" viewBox="0 0 12 12"><path d="M6 1v10M1 6h10" stroke="#fff" strokeWidth="1.5" strokeLinecap="round"/></svg>
            New Rule
          </button>
        </div>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 24 }}>
          {[
            { label: "Total Rules", value: rules.length, color: T.accent, icon: <path d="M3 2l4 6-4 6M9 2l4 6-4 6" fill="none" stroke={T.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/> },
            { label: "Active", value: activeCount, color: T.green, icon: <circle cx="8" cy="8" r="5" fill="none" stroke={T.green} strokeWidth="2"/> },
            { label: "Total Runs", value: totalRuns, color: T.purple, icon: <><path d="M2 14V6l4-4 4 4v8" fill="none" stroke={T.purple} strokeWidth="1.5"/><path d="M10 14V9l3-3 3 3v5" fill="none" stroke={T.purple} strokeWidth="1.5"/></> },
            { label: "Time Saved", value: "~18h", sub: "This month", color: T.cyan, icon: <><circle cx="8" cy="8" r="6" fill="none" stroke={T.cyan} strokeWidth="1.5"/><path d="M8 5v3l2.5 1.5" fill="none" stroke={T.cyan} strokeWidth="1.5" strokeLinecap="round"/></> },
          ].map(s => (
            <div key={s.label} style={{ padding: "16px 18px", background: T.surface, borderRadius: 12, border: `1px solid ${T.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: `${s.color}15`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width="16" height="16" viewBox="0 0 16 16">{s.icon}</svg>
                </div>
                <span style={{ fontSize: 10, color: T.text3, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>{s.label}</span>
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: s.color }}>{s.value}</div>
              {s.sub && <div style={{ fontSize: 11, color: T.text3, marginTop: 4 }}>{s.sub}</div>}
            </div>
          ))}
        </div>

        {/* Filter tabs */}
        <div style={{ display: "flex", gap: 0, marginBottom: 20, borderBottom: `1px solid ${T.border}` }}>
          {[
            { key: "all", label: "All Rules" },
            { key: "active", label: "Active" },
            { key: "inactive", label: "Inactive" },
          ].map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)} style={{
              padding: "10px 18px", border: "none", fontSize: 13, fontWeight: 500, cursor: "pointer",
              background: "transparent", color: filter === f.key ? T.text : T.text3,
              borderBottom: `2px solid ${filter === f.key ? T.accent : "transparent"}`, transition: "all 0.15s",
            }}>{f.label}</button>
          ))}
        </div>

        {/* Rule list */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {filtered.map(rule => {
            const sel = selectedRule?.id === rule.id;
            return (
              <div key={rule.id} onClick={() => setSelectedRule(rule)} style={{
                display: "flex", alignItems: "center", gap: 16, padding: "16px 18px",
                borderRadius: 12, cursor: "pointer", transition: "all 0.12s",
                background: sel ? `${T.accent}08` : T.surface,
                border: `1px solid ${sel ? T.accent : T.border}`,
                opacity: rule.active ? 1 : 0.6,
              }}>
                {/* Icon */}
                <div style={{
                  width: 42, height: 42, borderRadius: 10, flexShrink: 0,
                  background: rule.active ? `${T.accent}15` : T.surface3,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <svg width="20" height="20" viewBox="0 0 16 16" fill="none">
                    <path d="M9 1L5 9h4l-2 6 6-8H9l2-6z" fill={rule.active ? T.yellow : T.text3}/>
                  </svg>
                </div>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 5 }}>{rule.name}</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
                    <span style={{ color: T.yellow, fontWeight: 600, fontSize: 10, padding: "1px 6px", borderRadius: 4, background: `${T.yellow}15` }}>WHEN</span>
                    <span style={{ color: T.text2 }}>{rule.trigger}</span>
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 6h8M7 3l3 3-3 3" stroke={T.text3} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                    <span style={{ color: T.green, fontWeight: 600, fontSize: 10, padding: "1px 6px", borderRadius: 4, background: `${T.green}15` }}>THEN</span>
                    <span style={{ color: T.text2 }}>{rule.action}</span>
                  </div>
                </div>

                {/* Runs badge */}
                <span style={{ fontSize: 11, fontWeight: 600, color: T.text3, padding: "3px 10px", borderRadius: 6, background: T.surface2, border: `1px solid ${T.border}`, flexShrink: 0 }}>
                  {rule.runs} runs
                </span>

                {/* Toggle */}
                <div onClick={(e) => { e.stopPropagation(); toggleRule(rule.id); }} style={{
                  width: 38, height: 22, borderRadius: 11, padding: 2, cursor: "pointer", flexShrink: 0,
                  background: rule.active ? T.green : T.surface3, transition: "background 0.2s",
                }}>
                  <div style={{
                    width: 18, height: 18, borderRadius: 9, background: "#fff",
                    transition: "transform 0.2s", transform: rule.active ? "translateX(16px)" : "translateX(0)",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                  }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail panel */}
      {selectedRule && (
        <div style={{ width: 380, borderLeft: `1px solid ${T.border}`, background: T.surface, flexShrink: 0, overflow: "auto", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: `1px solid ${T.border}` }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: T.text3 }}>Rule Details</span>
            <button onClick={() => setSelectedRule(null)} style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text3, cursor: "pointer", width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8" stroke={T.text3} strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>
          </div>
          <div style={{ padding: "20px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, background: selectedRule.active ? `${T.accent}15` : T.surface3, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="20" height="20" viewBox="0 0 16 16"><path d="M9 1L5 9h4l-2 6 6-8H9l2-6z" fill={selectedRule.active ? T.yellow : T.text3}/></svg>
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{selectedRule.name}</div>
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: "2px 10px", borderRadius: 6,
                  background: selectedRule.active ? "#0d3a20" : T.surface3,
                  color: selectedRule.active ? T.green : T.text3,
                }}>{selectedRule.active ? "Active" : "Inactive"}</span>
              </div>
            </div>

            {/* Flow visualization */}
            <div style={{ background: T.surface2, borderRadius: 12, padding: 16, marginBottom: 24, border: `1px solid ${T.border}` }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: `${T.yellow}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: T.yellow }}>IF</span>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: T.text3, fontWeight: 600, textTransform: "uppercase", marginBottom: 3 }}>Trigger</div>
                    <div style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>{selectedRule.trigger}</div>
                  </div>
                </div>
                <div style={{ width: 1, height: 16, background: T.border, marginLeft: 14 }} />
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, background: `${T.green}15`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <span style={{ fontSize: 10, fontWeight: 800, color: T.green }}>DO</span>
                  </div>
                  <div>
                    <div style={{ fontSize: 10, color: T.text3, fontWeight: 600, textTransform: "uppercase", marginBottom: 3 }}>Action</div>
                    <div style={{ fontSize: 13, color: T.text, fontWeight: 500 }}>{selectedRule.action}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Fields */}
            {[
              { icon: "📊", label: "Total Runs", value: `${selectedRule.runs}` },
              { icon: "⚡", label: "Status", value: selectedRule.active ? "Active" : "Inactive" },
              { icon: "🕐", label: "Last Run", value: "2 hours ago" },
              { icon: "📅", label: "Created", value: "Feb 10, 2026" },
            ].map(f => (
              <div key={f.label} style={{ display: "grid", gridTemplateColumns: "110px 1fr", padding: "10px 0", borderBottom: `1px solid ${T.border}`, alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.text3 }}>
                  <span style={{ fontSize: 14 }}>{f.icon}</span><span>{f.label}</span>
                </div>
                <span style={{ fontSize: 13, color: T.text }}>{f.value}</span>
              </div>
            ))}

            {/* Toggle button */}
            <button onClick={() => toggleRule(selectedRule.id)} style={{
              width: "100%", padding: "10px 16px", borderRadius: 10, border: "none", marginTop: 24,
              background: selectedRule.active ? T.surface3 : T.green,
              color: selectedRule.active ? T.text : "#fff",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}>
              {selectedRule.active ? "Disable Rule" : "Enable Rule"}
            </button>

            {/* Run history */}
            <div style={{ marginTop: 24 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Recent Runs</div>
              {[
                { time: "2h ago", status: "success" },
                { time: "6h ago", status: "success" },
                { time: "Yesterday", status: "success" },
                { time: "Feb 25", status: "skipped" },
                { time: "Feb 24", status: "success" },
              ].map((r, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
                  <div style={{
                    width: 8, height: 8, borderRadius: 8,
                    background: r.status === "success" ? T.green : T.yellow,
                  }} />
                  <span style={{ fontSize: 12, flex: 1 }}>{r.time}</span>
                  <span style={{ fontSize: 11, color: r.status === "success" ? T.green : T.yellow, fontWeight: 500 }}>{r.status}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}