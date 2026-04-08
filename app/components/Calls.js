"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";
import { useResponsive } from "../lib/responsive";
import { useAuth } from "../lib/auth";
import { useModal } from "../lib/modal";

const STATUS_CFG = {
  upcoming:  { label: "Upcoming",  color: T.accent,   bg: `${T.accent}15` },
  live:      { label: "Live",      color: "#22c55e",  bg: "#22c55e20" },
  completed: { label: "Completed", color: T.text3,    bg: T.surface3 },
  cancelled: { label: "Cancelled", color: "#ef4444",  bg: "#ef444415" },
};
const TYPE_CFG = {
  scheduled:  { icon: "📅", label: "Scheduled" },
  huddle:     { icon: "💬", label: "Huddle" },
  recurring:  { icon: "🔄", label: "Recurring" },
  one_on_one: { icon: "👤", label: "1:1" },
  all_hands:  { icon: "🏢", label: "All Hands" },
  client:     { icon: "🤝", label: "Client" },
};

export default function CallsView() {
  const { isMobile } = useResponsive();
  const { user, profile } = useAuth();
  const { showConfirm } = useModal();
  const [calls, setCalls] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ title: "", call_type: "scheduled", scheduled_at: new Date().toISOString().slice(0, 16), duration_minutes: 60 });
  const [actionInput, setActionInput] = useState("");

  useEffect(() => {
    (async () => {
      const [{ data: c }, { data: p }] = await Promise.all([
        supabase.from("calls").select("*").eq("org_id", orgId).order("scheduled_at", { ascending: false }),
        supabase.from("profiles").select("id,display_name"),
      ]);
      setCalls(c || []);
      const m = {}; (p || []).forEach(u => { m[u.id] = u; }); setProfiles(m);
      setLoading(false);
    })();
  }, []);

  const update = async (id, updates) => {
    setCalls(p => p.map(c => c.id === id ? { ...c, ...updates } : c));
    if (selected?.id === id) setSelected(p => ({ ...p, ...updates }));
    await supabase.from("calls").update(updates).eq("id", id);
  };

  const createCall = async () => {
    if (!form.title.trim()) return;
    const scheduledAt = new Date(form.scheduled_at).toISOString();
    const endAt = new Date(new Date(form.scheduled_at).getTime() + (form.duration_minutes || 60) * 60000).toISOString();
    const { data } = await supabase.from("calls").insert({
      org_id: profile?.org_id, created_by: user?.id,
      title: form.title.trim(), call_type: form.call_type,
      scheduled_at: scheduledAt,
      duration_minutes: form.duration_minutes, status: "upcoming",
    }).select().single();
    if (data) {
      setCalls(p => [data, ...p]); setSelected(data); setShowCreate(false);
      setForm({ title: "", call_type: "scheduled", scheduled_at: new Date().toISOString().slice(0, 16), duration_minutes: 60 });
      // Also create a calendar event so it shows on the dashboard
      await supabase.from("calendar_events").insert({
        org_id: profile?.org_id, organizer_id: user?.id,
        title: form.title.trim(), start_at: scheduledAt, end_at: endAt,
        has_video_call: true, call_id: data.id, event_type: "call",
        status: "confirmed",
      });
    }
  };

  const deleteCall = async (id) => {
    if (!(await showConfirm("Delete Call", "Delete this call record?"))) return;
    setCalls(p => p.filter(c => c.id !== id));
    if (selected?.id === id) setSelected(null);
    await supabase.from("calls").delete().eq("id", id);
  };

  const addActionItem = async () => {
    if (!actionInput.trim() || !selected) return;
    const items = [...(selected.action_items || []), { text: actionInput.trim(), done: false, created_at: new Date().toISOString() }];
    await update(selected.id, { action_items: items });
    setActionInput("");
  };

  const toggleActionItem = async (idx) => {
    const items = (selected.action_items || []).map((a, i) => i === idx ? { ...a, done: !a.done } : a);
    await update(selected.id, { action_items: items });
  };

  const filtered = filter === "all" ? calls : calls.filter(c => c.status === filter);
  const upcoming = calls.filter(c => c.status === "upcoming");
  const completed = calls.filter(c => c.status === "completed");
  const totalMins = completed.reduce((s, c) => s + (c.duration_minutes || 0), 0);
  const totalActionItems = calls.reduce((s, c) => s + (c.action_items?.length || 0), 0);
  const pendingItems = calls.reduce((s, c) => s + (c.action_items?.filter(a => !a.done).length || 0), 0);

  if (loading) return <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: T.text3, fontSize: 13 }}>Loading calls…</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "18px 28px 0", borderBottom: `1px solid ${T.border}`, background: T.surface, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 2 }}>Calls</h2>
            <div style={{ fontSize: 12, color: T.text3 }}>{upcoming.length} upcoming · {completed.length} completed · {Math.round(totalMins / 60)}h recorded</div>
          </div>
          <button onClick={() => setShowCreate(true)} style={{ padding: "8px 16px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "none", background: T.accent, color: "#fff", cursor: "pointer" }}>+ Schedule Call</button>
        </div>
        <div style={{ display: "flex", gap: 0 }}>
          {[["all", "All"], ["upcoming", "Upcoming"], ["live", "Live"], ["completed", "Completed"]].map(([f, l]) => (
            <button key={f} onClick={() => setFilter(f)} style={{ padding: "8px 14px", fontSize: 12, fontWeight: 500, border: "none", background: "none", cursor: "pointer", color: filter === f ? T.accent : T.text3, borderBottom: `2px solid ${filter === f ? T.accent : "transparent"}`, transition: "color 0.15s" }}>{l}</button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflow: "auto", display: "flex" }}>
        <div style={{ flex: 1, padding: isMobile ? "10px 12px" : "20px 28px", overflow: "auto" }}>
          {/* KPI row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 24 }}>
            {[
              { label: "Upcoming",      value: upcoming.length,                        color: T.accent },
              { label: "Hours in Calls", value: `${Math.round(totalMins / 60)}h`,      color: "#a855f7" },
              { label: "Action Items",   value: totalActionItems,                      color: "#f97316" },
              { label: "Pending Items",  value: pendingItems,                          color: pendingItems > 0 ? "#ef4444" : T.text3 },
            ].map(s => (
              <div key={s.label} style={{ padding: "14px 16px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10 }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: "48px 0", color: T.text3 }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📞</div>
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>No calls{filter !== "all" ? ` with status "${filter}"` : " yet"}</div>
              {filter === "all" && <button onClick={() => setShowCreate(true)} style={{ padding: "9px 20px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "none", background: T.accent, color: "#fff", cursor: "pointer" }}>Schedule your first call</button>}
            </div>
          )}

          {filtered.map(call => {
            const sel = selected?.id === call.id;
            const st = STATUS_CFG[call.status] || STATUS_CFG.upcoming;
            const tp = TYPE_CFG[call.call_type] || TYPE_CFG.scheduled;
            const pending = (call.action_items || []).filter(a => !a.done).length;
            const d = new Date(call.scheduled_at);
            const isToday = d.toDateString() === new Date().toDateString();
            return (
              <div key={call.id} onClick={() => setSelected(sel ? null : call)}
                style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", marginBottom: 6, borderRadius: 12, border: `1px solid ${sel ? T.accent + "50" : T.border}`, background: sel ? T.accentDim : T.surface, cursor: "pointer", transition: "all 0.1s" }}
                onMouseEnter={e => { if (!sel) e.currentTarget.style.background = T.surface2; }}
                onMouseLeave={e => { if (!sel) e.currentTarget.style.background = T.surface; }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: T.surface3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>{tp.icon}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", marginBottom: 4 }}>{call.title}</div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 11, color: T.text3 }}>
                    <span style={{ color: isToday ? T.accent : T.text3, fontWeight: isToday ? 700 : 400 }}>
                      {isToday ? "Today, " : ""}{d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} {d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                    </span>
                    {call.duration_minutes && <span>· {call.duration_minutes}m</span>}
                    <span>· {tp.label}</span>
                    {call.recording && <span style={{ color: "#ef4444" }}>· 🔴 Rec</span>}
                    {pending > 0 && <span style={{ color: "#f97316", fontWeight: 600 }}>· {pending} actions</span>}
                  </div>
                </div>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 9px", borderRadius: 6, background: st.bg, color: st.color, flexShrink: 0 }}>{st.label}</span>
              </div>
            );
          })}
        </div>

        {/* Detail panel */}
        {selected && (
          <div style={{ width: isMobile ? "100%" : 380, position: isMobile ? "fixed" : "relative", inset: isMobile ? 0 : "auto", zIndex: isMobile ? 50 : "auto", borderLeft: `1px solid ${T.border}`, background: T.surface, flexShrink: 0, overflow: "auto", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.8 }}>Call Details</span>
              <button onClick={() => setSelected(null)} style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text3, cursor: "pointer", width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>×</button>
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
              <input value={selected.title} onChange={e => update(selected.id, { title: e.target.value })}
                style={{ fontSize: 18, fontWeight: 700, color: T.text, background: "transparent", border: "none", outline: "none", width: "100%", marginBottom: 12, fontFamily: "inherit" }} />
              <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                <select value={selected.status} onChange={e => update(selected.id, { status: e.target.value })}
                  style={{ fontSize: 11, padding: "4px 8px", borderRadius: 5, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontFamily: "inherit", cursor: "pointer" }}>
                  {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <select value={selected.call_type} onChange={e => update(selected.id, { call_type: e.target.value })}
                  style={{ fontSize: 11, padding: "4px 8px", borderRadius: 5, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontFamily: "inherit", cursor: "pointer" }}>
                  {Object.entries(TYPE_CFG).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
                </select>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10, marginBottom: 16 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: T.text3, display: "block", marginBottom: 3 }}>Scheduled</label>
                  <input type="datetime-local" value={selected.scheduled_at ? new Date(selected.scheduled_at).toISOString().slice(0, 16) : ""}
                    onChange={e => update(selected.id, { scheduled_at: e.target.value ? new Date(e.target.value).toISOString() : null })}
                    style={{ width: "100%", padding: "6px 8px", fontSize: 11, color: T.text, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 5, outline: "none", fontFamily: "inherit", boxSizing: "border-box", colorScheme: "dark" }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: T.text3, display: "block", marginBottom: 3 }}>Duration (min)</label>
                  <input type="number" value={selected.duration_minutes || ""} onChange={e => update(selected.id, { duration_minutes: Number(e.target.value) || null })}
                    style={{ width: "100%", padding: "6px 8px", fontSize: 12, color: T.text, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 5, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
                {[{ k: "recording", l: "🔴 Recording" }, { k: "transcript", l: "📝 Transcript" }].map(f => (
                  <label key={f.k} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: T.text2, cursor: "pointer" }}>
                    <input type="checkbox" checked={selected[f.k] || false} onChange={e => update(selected.id, { [f.k]: e.target.checked })} />
                    {f.l}
                  </label>
                ))}
              </div>

              {/* Notes */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.8, display: "block", marginBottom: 6 }}>Notes / Summary</label>
                <textarea defaultValue={selected.summary || ""} key={selected.id + "-sum"} onBlur={e => update(selected.id, { summary: e.target.value })}
                  placeholder="Meeting notes, key decisions, context…"
                  style={{ width: "100%", minHeight: 100, fontSize: 12, color: T.text, lineHeight: 1.6, padding: "10px 12px", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 7, resize: "vertical", outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
              </div>

              {/* Action items */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>
                  Action Items {(selected.action_items||[]).length > 0 && `(${(selected.action_items||[]).filter(a=>!a.done).length} pending)`}
                </div>
                {(selected.action_items || []).map((item, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 0", borderBottom: `1px solid ${T.border}20` }}>
                    <div onClick={() => toggleActionItem(i)} style={{ width: 14, height: 14, borderRadius: 7, border: `2px solid ${item.done ? "#22c55e" : T.border}`, background: item.done ? "#22c55e" : "transparent", cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {item.done && <svg width="8" height="8" viewBox="0 0 10 10"><path d="M1.5 5l3 3 4-4.5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" /></svg>}
                    </div>
                    <span style={{ fontSize: 12, color: item.done ? T.text3 : T.text, textDecoration: item.done ? "line-through" : "none", flex: 1 }}>{item.text}</span>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <input value={actionInput} onChange={e => setActionInput(e.target.value)} onKeyDown={e => e.key === "Enter" && addActionItem()}
                    placeholder="Add action item…" style={{ flex: 1, padding: "6px 8px", fontSize: 12, color: T.text, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 5, outline: "none", fontFamily: "inherit" }} />
                  <button onClick={addActionItem} style={{ padding: "6px 10px", borderRadius: 5, background: T.accent, color: "#fff", border: "none", fontSize: 12, cursor: "pointer" }}>Add</button>
                </div>
              </div>

              <button onClick={() => deleteCall(selected.id)} style={{ padding: "7px 14px", fontSize: 12, fontWeight: 600, borderRadius: 6, border: "1px solid #ef444440", background: "#ef444410", color: "#ef4444", cursor: "pointer" }}>Delete Call</button>
            </div>
          </div>
        )}
      </div>

      {/* Create modal */}
      {showCreate && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowCreate(false)}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} />
          <div onClick={e => e.stopPropagation()} style={{ position: "relative", width: "min(420px, 95vw)", background: T.surface, borderRadius: 14, border: `1px solid ${T.border}`, padding: 28, zIndex: 201, boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 20 }}>Schedule Call</h3>
            {[
              { l: "Title *",    k: "title",            t: "text" },
              { l: "Date & Time",k: "scheduled_at",     t: "datetime-local" },
              { l: "Duration (min)", k: "duration_minutes", t: "number" },
            ].map(f => (
              <div key={f.k} style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: T.text3, display: "block", marginBottom: 4 }}>{f.l}</label>
                <input type={f.t} value={form[f.k] || ""} onChange={e => setForm(p => ({ ...p, [f.k]: f.t === "number" ? Number(e.target.value) || 60 : e.target.value }))} onKeyDown={e => e.key === "Enter" && createCall()}
                  style={{ width: "100%", padding: "8px 10px", fontSize: 13, color: T.text, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, outline: "none", fontFamily: "inherit", boxSizing: "border-box", colorScheme: "dark" }} />
              </div>
            ))}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.text3, display: "block", marginBottom: 4 }}>Type</label>
              <select value={form.call_type} onChange={e => setForm(p => ({ ...p, call_type: e.target.value }))}
                style={{ width: "100%", padding: "8px 10px", fontSize: 12, color: T.text, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, cursor: "pointer", outline: "none", fontFamily: "inherit" }}>
                {Object.entries(TYPE_CFG).map(([k, v]) => <option key={k} value={k}>{v.icon} {v.label}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setShowCreate(false)} style={{ padding: "9px 18px", fontSize: 13, fontWeight: 600, borderRadius: 7, border: `1px solid ${T.border}`, background: T.surface2, color: T.text3, cursor: "pointer" }}>Cancel</button>
              <button onClick={createCall} disabled={!form.title.trim()} style={{ padding: "9px 20px", fontSize: 13, fontWeight: 600, borderRadius: 7, border: "none", background: form.title.trim() ? T.accent : T.surface3, color: form.title.trim() ? "#fff" : T.text3, cursor: form.title.trim() ? "pointer" : "default" }}>Schedule</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


