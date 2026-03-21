"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";
import { useResponsive } from "../lib/responsive";
import { useAuth } from "../lib/auth";

const TRIGGERS = [
  { id: "task_status_change",  label: "Task status changes",      icon: "↻", group: "Tasks" },
  { id: "task_assigned",       label: "Task is assigned",         icon: "→", group: "Tasks" },
  { id: "task_overdue",        label: "Task becomes overdue",     icon: "⚠", group: "Tasks" },
  { id: "task_completed",      label: "Task is completed",        icon: "✓", group: "Tasks" },
  { id: "task_created",        label: "Task is created",          icon: "+", group: "Tasks" },
  { id: "kr_checkin",          label: "KR check-in submitted",    icon: "◎", group: "OKRs" },
  { id: "kr_stale",            label: "KR has no check-in 7d",    icon: "⏰", group: "OKRs" },
  { id: "kr_at_risk",          label: "KR health → at risk",      icon: "⚡", group: "OKRs" },
  { id: "project_health",      label: "Project health changes",   icon: "◫", group: "Projects" },
  { id: "plm_stage_change",    label: "PLM stage changes",        icon: "⬢", group: "PLM" },
  { id: "schedule_daily",      label: "Every day at 9am",         icon: "📅", group: "Schedule" },
  { id: "schedule_weekly",     label: "Every Monday at 9am",      icon: "📅", group: "Schedule" },
];

const ACTIONS = [
  { id: "send_notification",   label: "Send notification",        icon: "🔔", group: "Notify" },
  { id: "send_slack",          label: "Post to Slack",            icon: "💬", group: "Notify" },
  { id: "assign_task",         label: "Assign task to person",    icon: "👤", group: "Tasks" },
  { id: "move_to_section",     label: "Move task to section",     icon: "→", group: "Tasks" },
  { id: "update_status",       label: "Update task status",       icon: "↻", group: "Tasks" },
  { id: "set_priority",        label: "Set task priority",        icon: "⬆", group: "Tasks" },
  { id: "create_task",         label: "Create a task",            icon: "+", group: "Tasks" },
  { id: "update_kr",           label: "Nudge KR owner",           icon: "◎", group: "OKRs" },
  { id: "log_activity",        label: "Log to activity feed",     icon: "◔", group: "System" },
];

const TEMPLATES = [
  {
    name: "Overdue task alert",
    description: "Notify assignee when their task becomes overdue",
    trigger_type: "task_overdue",
    action_type: "send_notification",
    icon: "⚠️",
    color: "#ef4444",
  },
  {
    name: "Auto-assign by label",
    description: "Assign new bug tasks to the QA lead",
    trigger_type: "task_created",
    action_type: "assign_task",
    icon: "🐛",
    color: "#f97316",
  },
  {
    name: "KR check-in nudge",
    description: "Slack the KR owner when no check-in for 7 days",
    trigger_type: "kr_stale",
    action_type: "send_slack",
    icon: "◎",
    color: "#22c55e",
  },
  {
    name: "Weekly OKR digest",
    description: "Post weekly OKR summary to Slack every Monday",
    trigger_type: "schedule_weekly",
    action_type: "send_slack",
    icon: "📊",
    color: "#3b82f6",
  },
  {
    name: "Move done tasks",
    description: "Auto-move completed tasks to Done section",
    trigger_type: "task_completed",
    action_type: "move_to_section",
    icon: "✅",
    color: "#22c55e",
  },
  {
    name: "Project health alert",
    description: "Notify PM when project goes off track",
    trigger_type: "project_health",
    action_type: "send_notification",
    icon: "📁",
    color: "#a855f7",
  },
];

const CATEGORY_COLORS = {
  tasks: "#3b82f6", projects: "#22c55e", notifications: "#a855f7",
  okrs: "#06b6d4", plm: "#f97316", system: "#8b5cf6",
};

const relTime = (d) => {
  if (!d) return "never";
  const diff = Date.now() - new Date(d).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
};

export default function AutomationView() {
  const { isMobile } = useResponsive();
  const { user, profile } = useAuth();
  const [rules, setRules] = useState([]);
  const [selectedRule, setSelectedRule] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("rules"); // rules | templates
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", trigger_type: "task_overdue", action_type: "send_notification", category: "tasks" });
  const [filter, setFilter] = useState("all");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("automations").select("*").order("created_at", { ascending: false });
      setRules(data || []);
      setLoading(false);
    })();
  }, []);

  const toggleRule = async (id, e) => {
    e?.stopPropagation();
    const rule = rules.find(r => r.id === id);
    if (!rule) return;
    const newActive = !rule.active;
    setRules(p => p.map(r => r.id === id ? { ...r, active: newActive } : r));
    if (selectedRule?.id === id) setSelectedRule(p => ({ ...p, active: newActive }));
    await supabase.from("automations").update({ active: newActive }).eq("id", id);
  };

  const createRule = async (overrides = {}) => {
    const payload = { ...form, ...overrides };
    if (!payload.name.trim()) return;
    const { data } = await supabase.from("automations").insert({
      org_id: profile?.org_id,
      name: payload.name.trim(), description: payload.description || "",
      trigger_type: payload.trigger_type, action_type: payload.action_type,
      category: payload.category || "tasks", active: true, runs: 0,
    }).select().single();
    if (data) {
      setRules(p => [data, ...p]);
      setShowCreate(false);
      setView("rules");
      setForm({ name: "", description: "", trigger_type: "task_overdue", action_type: "send_notification", category: "tasks" });
    }
  };

  const deleteRule = async (id, e) => {
    e?.stopPropagation();
    setRules(p => p.filter(r => r.id !== id));
    if (selectedRule?.id === id) setSelectedRule(null);
    await supabase.from("automations").delete().eq("id", id);
  };

  const activeCount = rules.filter(r => r.active).length;
  const totalRuns = rules.reduce((s, r) => s + (r.runs || 0), 0);
  const filtered = filter === "all" ? rules : filter === "active" ? rules.filter(r => r.active) : rules.filter(r => !r.active);

  if (loading) return <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: T.text3, fontSize: 13 }}>Loading automations…</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "18px 28px 0", borderBottom: `1px solid ${T.border}`, background: T.surface, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 2 }}>Automations</h2>
            <div style={{ fontSize: 12, color: T.text3 }}>{activeCount} active · {totalRuns.toLocaleString()} total runs</div>
          </div>
          <button onClick={() => setShowCreate(true)} style={{ padding: "8px 16px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "none", background: T.accent, color: "#fff", cursor: "pointer" }}>+ New Rule</button>
        </div>
        <div style={{ display: "flex", gap: 0 }}>
          {["rules", "templates"].map(v => (
            <button key={v} onClick={() => setView(v)} style={{ padding: "8px 16px", fontSize: 12, fontWeight: 500, border: "none", background: "none", cursor: "pointer", textTransform: "capitalize", color: view === v ? T.accent : T.text3, borderBottom: `2px solid ${view === v ? T.accent : "transparent"}`, transition: "color 0.15s" }}>{v}</button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto", display: "flex" }}>
        <div style={{ flex: 1, padding: "24px 28px", overflow: "auto" }}>
          {view === "templates" ? (
            <div>
              <p style={{ fontSize: 13, color: T.text3, marginBottom: 20 }}>Start with a pre-built automation. You can customise it after creating.</p>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 14 }}>
                {TEMPLATES.map(t => (
                  <div key={t.name} style={{ padding: "18px 20px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, cursor: "pointer", transition: "all 0.15s" }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = t.color; e.currentTarget.style.background = t.color + "08"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = T.surface; }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: t.color + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{t.icon}</div>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{t.name}</div>
                    </div>
                    <p style={{ fontSize: 12, color: T.text3, marginBottom: 14, lineHeight: 1.5 }}>{t.description}</p>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 14 }}>
                      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, background: t.color + "15", color: t.color, fontWeight: 700 }}>
                        WHEN: {TRIGGERS.find(x => x.id === t.trigger_type)?.label}
                      </span>
                      <span style={{ color: T.text3, fontSize: 12 }}>→</span>
                      <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, background: T.surface3, color: T.text3, fontWeight: 700 }}>
                        THEN: {ACTIONS.find(x => x.id === t.action_type)?.label}
                      </span>
                    </div>
                    <button onClick={() => createRule({ name: t.name, description: t.description, trigger_type: t.trigger_type, action_type: t.action_type })}
                      style={{ width: "100%", padding: "7px", borderRadius: 7, background: t.color + "15", color: t.color, border: `1px solid ${t.color}30`, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      Use Template →
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div>
              {/* Stats row */}
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
                {[
                  { label: "Total Rules", value: rules.length, color: T.accent },
                  { label: "Active", value: activeCount, color: "#22c55e" },
                  { label: "Inactive", value: rules.length - activeCount, color: T.text3 },
                  { label: "Total Runs", value: totalRuns.toLocaleString(), color: "#a855f7" },
                ].map(s => (
                  <div key={s.label} style={{ padding: "14px 16px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10 }}>
                    <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
                    <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>{s.label}</div>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
                {["all", "active", "inactive"].map(f => (
                  <button key={f} onClick={() => setFilter(f)} style={{ padding: "5px 12px", fontSize: 11, fontWeight: 600, borderRadius: 6, cursor: "pointer", background: filter === f ? T.accentDim : T.surface2, color: filter === f ? T.accent : T.text3, border: `1px solid ${filter === f ? T.accent + "40" : T.border}` }}>
                    {f.charAt(0).toUpperCase() + f.slice(1)}
                  </button>
                ))}
              </div>

              {filtered.length === 0 && (
                <div style={{ textAlign: "center", padding: "48px 0", color: T.text3 }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>⚡</div>
                  <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>No automations yet</div>
                  <div style={{ fontSize: 13, marginBottom: 20 }}>Automate repetitive work across your team</div>
                  <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
                    <button onClick={() => setShowCreate(true)} style={{ padding: "9px 20px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "none", background: T.accent, color: "#fff", cursor: "pointer" }}>Create Rule</button>
                    <button onClick={() => setView("templates")} style={{ padding: "9px 20px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface2, color: T.text2, cursor: "pointer" }}>Browse Templates</button>
                  </div>
                </div>
              )}

              {filtered.map(rule => {
                const trigger = TRIGGERS.find(t => t.id === rule.trigger_type);
                const action = ACTIONS.find(a => a.id === rule.action_type);
                const sel = selectedRule?.id === rule.id;
                const catColor = CATEGORY_COLORS[rule.category] || T.text3;
                return (
                  <div key={rule.id} onClick={() => setSelectedRule(sel ? null : rule)}
                    style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", marginBottom: 6, borderRadius: 10, border: `1px solid ${sel ? T.accent + "50" : T.border}`, background: sel ? T.accentDim : T.surface, cursor: "pointer", transition: "all 0.1s" }}
                    onMouseEnter={e => { if (!sel) e.currentTarget.style.background = T.surface2; }}
                    onMouseLeave={e => { if (!sel) e.currentTarget.style.background = T.surface; }}>
                    {/* Toggle */}
                    <div onClick={e => toggleRule(rule.id, e)} style={{ width: 36, height: 20, borderRadius: 10, padding: 2, cursor: "pointer", background: rule.active ? T.accent : T.surface3, transition: "background 0.2s", flexShrink: 0 }}>
                      <div style={{ width: 16, height: 16, borderRadius: 8, background: "#fff", transform: rule.active ? "translateX(16px)" : "translateX(0)", transition: "transform 0.2s" }} />
                    </div>
                    <div style={{ width: 8, height: 8, borderRadius: 8, background: catColor, flexShrink: 0 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: rule.active ? T.text : T.text3, marginBottom: 4 }}>{rule.name}</div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                        <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 5, background: T.surface3, color: T.text3, fontWeight: 600 }}>
                          {trigger?.icon} {trigger?.label || rule.trigger_type}
                        </span>
                        <span style={{ color: T.text3, fontSize: 11 }}>→</span>
                        <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 5, background: T.accentDim, color: T.accent, fontWeight: 600 }}>
                          {action?.icon} {action?.label || rule.action_type}
                        </span>
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: T.text2 }}>{(rule.runs || 0).toLocaleString()} runs</div>
                      <div style={{ fontSize: 10, color: T.text3 }}>{rule.last_run ? relTime(rule.last_run) : "never run"}</div>
                    </div>
                    <button onClick={e => deleteRule(rule.id, e)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 14, opacity: 0.4, padding: "0 4px" }}
                      onMouseEnter={e => { e.currentTarget.style.opacity = 1; e.currentTarget.style.color = "#ef4444"; }}
                      onMouseLeave={e => { e.currentTarget.style.opacity = 0.4; e.currentTarget.style.color = T.text3; }}>✕</button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selectedRule && (
          <div style={{ width: 340, borderLeft: `1px solid ${T.border}`, background: T.surface, flexShrink: 0, overflow: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: `1px solid ${T.border}` }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.8 }}>Rule Details</span>
              <button onClick={() => setSelectedRule(null)} style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text3, cursor: "pointer", width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>×</button>
            </div>
            <div style={{ padding: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                <div onClick={e => toggleRule(selectedRule.id, e)} style={{ width: 40, height: 22, borderRadius: 11, padding: 2, cursor: "pointer", background: selectedRule.active ? T.accent : T.surface3, transition: "background 0.2s" }}>
                  <div style={{ width: 18, height: 18, borderRadius: 9, background: "#fff", transform: selectedRule.active ? "translateX(18px)" : "translateX(0)", transition: "transform 0.2s" }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: selectedRule.active ? T.accent : T.text3 }}>{selectedRule.active ? "Active" : "Inactive"}</span>
              </div>

              <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>{selectedRule.name}</h3>
              {selectedRule.description && <p style={{ fontSize: 13, color: T.text3, marginBottom: 16, lineHeight: 1.5 }}>{selectedRule.description}</p>}

              {/* IF/THEN display */}
              <div style={{ background: T.surface2, borderRadius: 10, padding: 14, marginBottom: 20 }}>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>When (Trigger)</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: T.surface3, borderRadius: 8 }}>
                    <span style={{ fontSize: 16 }}>{TRIGGERS.find(t => t.id === selectedRule.trigger_type)?.icon || "⚡"}</span>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{TRIGGERS.find(t => t.id === selectedRule.trigger_type)?.label || selectedRule.trigger_type}</span>
                  </div>
                </div>
                <div style={{ fontSize: 12, color: T.text3, textAlign: "center", padding: "2px 0" }}>↓</div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 6 }}>Then (Action)</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: T.accentDim, borderRadius: 8 }}>
                    <span style={{ fontSize: 16 }}>{ACTIONS.find(a => a.id === selectedRule.action_type)?.icon || "🔔"}</span>
                    <span style={{ fontSize: 13, fontWeight: 500, color: T.accent }}>{ACTIONS.find(a => a.id === selectedRule.action_type)?.label || selectedRule.action_type}</span>
                  </div>
                </div>
              </div>

              <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
                {[
                  { l: "Category", v: selectedRule.category },
                  { l: "Total Runs", v: (selectedRule.runs || 0).toLocaleString() },
                  { l: "Last Run", v: relTime(selectedRule.last_run) },
                  { l: "Created", v: new Date(selectedRule.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) },
                ].map(f => (
                  <div key={f.l} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${T.border}20`, fontSize: 12 }}>
                    <span style={{ color: T.text3 }}>{f.l}</span>
                    <span style={{ color: T.text, fontWeight: 500, textTransform: "capitalize" }}>{f.v}</span>
                  </div>
                ))}
              </div>

              <button onClick={e => deleteRule(selectedRule.id, e)} style={{ marginTop: 20, width: "100%", padding: "8px", fontSize: 12, fontWeight: 600, borderRadius: 7, border: "1px solid #ef444440", background: "#ef444410", color: "#ef4444", cursor: "pointer" }}>Delete Rule</button>
            </div>
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowCreate(false)}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} />
          <div onClick={e => e.stopPropagation()} style={{ position: "relative", width: "min(480px, 95vw)", background: T.surface, borderRadius: 14, border: `1px solid ${T.border}`, padding: 28, zIndex: 201, boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 20 }}>New Automation Rule</h3>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.text3, marginBottom: 4, display: "block" }}>Name *</label>
              <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} onKeyDown={e => e.key === "Enter" && createRule()}
                placeholder="e.g. Alert on overdue tasks" style={{ width: "100%", padding: "9px 12px", fontSize: 13, color: T.text, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 7, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.text3, marginBottom: 4, display: "block" }}>Description</label>
              <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder="What does this automation do?" style={{ width: "100%", padding: "9px 12px", fontSize: 13, color: T.text, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 7, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>

            {/* Visual IF/THEN builder */}
            <div style={{ background: T.surface2, borderRadius: 10, padding: 16, marginBottom: 16 }}>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.accent, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>WHEN (Trigger)</div>
                {Object.entries(TRIGGERS.reduce((acc, t) => { if (!acc[t.group]) acc[t.group] = []; acc[t.group].push(t); return acc; }, {})).map(([group, items]) => (
                  <optgroup key={group} label={group} />
                ))}
                <select value={form.trigger_type} onChange={e => setForm(p => ({ ...p, trigger_type: e.target.value }))}
                  style={{ width: "100%", padding: "8px 10px", fontSize: 12, color: T.text, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 7, cursor: "pointer", outline: "none", fontFamily: "inherit" }}>
                  {Object.entries(TRIGGERS.reduce((acc, t) => { if (!acc[t.group]) acc[t.group] = []; acc[t.group].push(t); return acc; }, {})).map(([group, items]) => (
                    <optgroup key={group} label={group}>
                      {items.map(t => <option key={t.id} value={t.id}>{t.icon} {t.label}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div style={{ textAlign: "center", fontSize: 18, color: T.text3, marginBottom: 12 }}>↓</div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#22c55e", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>THEN (Action)</div>
                <select value={form.action_type} onChange={e => setForm(p => ({ ...p, action_type: e.target.value }))}
                  style={{ width: "100%", padding: "8px 10px", fontSize: 12, color: T.text, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 7, cursor: "pointer", outline: "none", fontFamily: "inherit" }}>
                  {Object.entries(ACTIONS.reduce((acc, a) => { if (!acc[a.group]) acc[a.group] = []; acc[a.group].push(a); return acc; }, {})).map(([group, items]) => (
                    <optgroup key={group} label={group}>
                      {items.map(a => <option key={a.id} value={a.id}>{a.icon} {a.label}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setShowCreate(false)} style={{ padding: "9px 18px", fontSize: 13, fontWeight: 600, borderRadius: 7, border: `1px solid ${T.border}`, background: T.surface2, color: T.text3, cursor: "pointer" }}>Cancel</button>
              <button onClick={() => createRule()} disabled={!form.name.trim()} style={{ padding: "9px 20px", fontSize: 13, fontWeight: 600, borderRadius: 7, border: "none", background: form.name.trim() ? T.accent : T.surface3, color: form.name.trim() ? "#fff" : T.text3, cursor: form.name.trim() ? "pointer" : "default" }}>Create Rule</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
