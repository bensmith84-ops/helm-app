"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";
import { useAuth } from "../lib/auth";

const CATEGORY_COLORS = {
  tasks: "#22c55e", projects: "#3b82f6", notifications: "#a855f7",
  campaigns: "#f97316", plm: "#06b6d4",
};
const TRIGGER_TYPES = [
  { id: "task_status_change", label: "Task status changes" },
  { id: "task_assigned", label: "Task assigned" },
  { id: "task_overdue", label: "Task becomes overdue" },
  { id: "task_completed", label: "Task completed" },
  { id: "comment_added", label: "Comment added" },
];
const ACTION_TYPES = [
  { id: "notification", label: "Send notification" },
  { id: "move_task", label: "Move task to section" },
  { id: "assign_task", label: "Auto-assign task" },
  { id: "update_status", label: "Update task status" },
];

export default function AutomationView() {
  const { user, profile } = useAuth();
  const [rules, setRules] = useState([]);
  const [selectedRule, setSelectedRule] = useState(null);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", trigger_type: "task_status_change", action_type: "notification", category: "tasks" });

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("automations").select("*").order("created_at", { ascending: false });
      setRules(data || []);
      setLoading(false);
    })();
  }, []);

  const toggleRule = async (id) => {
    const rule = rules.find(r => r.id === id);
    if (!rule) return;
    const newActive = !rule.active;
    setRules(p => p.map(r => r.id === id ? { ...r, active: newActive } : r));
    if (selectedRule?.id === id) setSelectedRule(p => ({ ...p, active: newActive }));
    await supabase.from("automations").update({ active: newActive }).eq("id", id);
  };

  const createRule = async () => {
    if (!form.name.trim()) return;
    const { data, error } = await supabase.from("automations").insert({
      org_id: profile?.org_id,
      name: form.name.trim(), description: form.description,
      trigger_type: form.trigger_type, action_type: form.action_type,
      category: form.category, active: true, runs: 0,
    }).select().single();
    if (data) { setRules(p => [data, ...p]); setShowCreate(false); setForm({ name: "", description: "", trigger_type: "task_status_change", action_type: "notification", category: "tasks" }); }
  };

  const deleteRule = async (id) => {
    if (!confirm("Delete this automation?")) return;
    setRules(p => p.filter(r => r.id !== id));
    if (selectedRule?.id === id) setSelectedRule(null);
    await supabase.from("automations").delete().eq("id", id);
  };

  const activeCount = rules.filter(r => r.active).length;
  const totalRuns = rules.reduce((s, r) => s + (r.runs || 0), 0);
  const filtered = filter === "all" ? rules : rules.filter(r => r.active === (filter === "active"));

  if (loading) return <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: T.text3, fontSize: 13 }}>Loading automations…</div>;

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <div style={{ flex: 1, overflow: "auto", padding: "28px 32px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Automations</h1>
            <p style={{ fontSize: 12, color: T.text3 }}>{activeCount} active · {totalRuns} total runs</p>
          </div>
          <button onClick={() => setShowCreate(true)} style={{ padding: "8px 16px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "none", background: T.accent, color: "#fff", cursor: "pointer" }}>+ New Rule</button>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
          {["all", "active", "inactive"].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: "5px 12px", fontSize: 11, fontWeight: 600, borderRadius: 6, cursor: "pointer",
              background: filter === f ? `${T.accent}20` : T.surface2, color: filter === f ? T.accent : T.text3,
              border: `1px solid ${filter === f ? T.accent + "40" : T.border}`,
            }}>{f.charAt(0).toUpperCase() + f.slice(1)}</button>
          ))}
        </div>

        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: T.text3 }}>
            <div style={{ fontSize: 14, marginBottom: 8 }}>No automations yet</div>
            <button onClick={() => setShowCreate(true)} style={{ padding: "8px 18px", fontSize: 13, fontWeight: 600, borderRadius: 6, border: "none", background: T.accent, color: "#fff", cursor: "pointer" }}>Create your first rule</button>
          </div>
        )}

        {filtered.map(rule => {
          const sel = selectedRule?.id === rule.id;
          const catColor = CATEGORY_COLORS[rule.category] || T.text3;
          return (
            <div key={rule.id} onClick={() => setSelectedRule(rule)} style={{
              display: "flex", alignItems: "center", gap: 16, padding: "14px 18px", marginBottom: 6,
              borderRadius: 10, border: `1px solid ${sel ? T.accent + "40" : T.border}`,
              background: sel ? `${T.accent}08` : T.surface, cursor: "pointer",
            }}>
              <div onClick={e => { e.stopPropagation(); toggleRule(rule.id); }} style={{
                width: 36, height: 20, borderRadius: 10, padding: 2, cursor: "pointer",
                background: rule.active ? T.accent : T.surface3, transition: "background 0.2s",
              }}>
                <div style={{ width: 16, height: 16, borderRadius: 8, background: "#fff", transform: rule.active ? "translateX(16px)" : "translateX(0)", transition: "transform 0.2s" }} />
              </div>
              <div style={{ width: 8, height: 8, borderRadius: 8, background: catColor, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600, color: rule.active ? T.text : T.text3 }}>{rule.name}</div>
                {rule.description && <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>{rule.description}</div>}
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.text2 }}>{rule.runs || 0} runs</div>
                {rule.last_run && <div style={{ fontSize: 10, color: T.text3 }}>{new Date(rule.last_run).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail panel */}
      {selectedRule && (
        <div style={{ width: 360, borderLeft: `1px solid ${T.border}`, background: T.surface, flexShrink: 0, overflow: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: `1px solid ${T.border}` }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: T.text3 }}>Rule Details</span>
            <button onClick={() => setSelectedRule(null)} style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text3, cursor: "pointer", width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>×</button>
          </div>
          <div style={{ padding: 24 }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>{selectedRule.name}</h3>
            {[
              { l: "Status", v: selectedRule.active ? "Active" : "Inactive" },
              { l: "Trigger", v: TRIGGER_TYPES.find(t => t.id === selectedRule.trigger_type)?.label || selectedRule.trigger_type },
              { l: "Action", v: ACTION_TYPES.find(a => a.id === selectedRule.action_type)?.label || selectedRule.action_type },
              { l: "Category", v: selectedRule.category },
              { l: "Total Runs", v: String(selectedRule.runs || 0) },
            ].map(f => (
              <div key={f.l} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${T.border}`, fontSize: 13 }}>
                <span style={{ color: T.text3 }}>{f.l}</span>
                <span style={{ color: T.text, fontWeight: 500 }}>{f.v}</span>
              </div>
            ))}
            <div style={{ marginTop: 20 }}>
              <button onClick={() => deleteRule(selectedRule.id)} style={{ padding: "7px 14px", fontSize: 12, fontWeight: 600, borderRadius: 6, border: "1px solid #ef444440", background: "#ef444410", color: "#ef4444", cursor: "pointer" }}>Delete Rule</button>
            </div>
          </div>
        </div>
      )}

      {/* Create modal */}
      {showCreate && (
        <div style={{ position: "fixed", inset: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowCreate(false)}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} />
          <div onClick={e => e.stopPropagation()} style={{ position: "relative", width: 420, background: T.surface, borderRadius: 12, border: `1px solid ${T.border}`, padding: 24, zIndex: 101 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>New Automation Rule</h3>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.text3, marginBottom: 4, display: "block" }}>Name</label>
              <input autoFocus value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} onKeyDown={e => { if (e.key === "Enter") createRule(); }}
                placeholder="Rule name…" style={{ width: "100%", padding: "8px 12px", fontSize: 13, color: T.text, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, outline: "none", fontFamily: "inherit" }} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.text3, marginBottom: 4, display: "block" }}>Description</label>
              <input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Optional…" style={{ width: "100%", padding: "8px 12px", fontSize: 13, color: T.text, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, outline: "none", fontFamily: "inherit" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: T.text3, marginBottom: 4, display: "block" }}>When…</label>
                <select value={form.trigger_type} onChange={e => setForm(p => ({ ...p, trigger_type: e.target.value }))}
                  style={{ width: "100%", padding: "8px 12px", fontSize: 12, color: T.text, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, fontFamily: "inherit" }}>
                  {TRIGGER_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: T.text3, marginBottom: 4, display: "block" }}>Then…</label>
                <select value={form.action_type} onChange={e => setForm(p => ({ ...p, action_type: e.target.value }))}
                  style={{ width: "100%", padding: "8px 12px", fontSize: 12, color: T.text, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, fontFamily: "inherit" }}>
                  {ACTION_TYPES.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setShowCreate(false)} style={{ padding: "8px 16px", fontSize: 13, fontWeight: 600, borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text3, cursor: "pointer" }}>Cancel</button>
              <button onClick={createRule} style={{ padding: "8px 16px", fontSize: 13, fontWeight: 600, borderRadius: 6, border: "none", background: T.accent, color: "#fff", cursor: "pointer", opacity: form.name.trim() ? 1 : 0.5 }}>Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
