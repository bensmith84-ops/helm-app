"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";
import { useAuth } from "../lib/auth";
import { useModal } from "../lib/modal";

const TYPE_ICONS = { scheduled: "📅", huddle: "💬", recurring: "🔄" };

export default function CallsView() {
  const { user, profile } = useAuth();
  const { showPrompt, showConfirm } = useModal();
  const [calls, setCalls] = useState([]);
  const [selectedCall, setSelectedCall] = useState(null);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("calls").select("*").order("scheduled_at", { ascending: false });
      setCalls(data || []);
      setLoading(false);
    })();
  }, []);

  const createCall = async () => {
    const title = await showPrompt("Schedule Call", "Call title");
    if (!title?.trim()) return;
    const { data } = await supabase.from("calls").insert({
      org_id: profile?.org_id,
      title: title.trim(), call_type: "scheduled",
      scheduled_at: new Date().toISOString(), status: "upcoming",
    }).select().single();
    if (data) { setCalls(p => [data, ...p]); setSelectedCall(data); }
  };

  const updateCall = async (id, updates) => {
    setCalls(p => p.map(c => c.id === id ? { ...c, ...updates } : c));
    if (selectedCall?.id === id) setSelectedCall(p => ({ ...p, ...updates }));
    await supabase.from("calls").update(updates).eq("id", id);
  };

  const deleteCall = async (id) => {
    if (!(await showConfirm("Delete Call", "Are you sure you want to delete this call?"))) return;
    setCalls(p => p.filter(c => c.id !== id));
    if (selectedCall?.id === id) setSelectedCall(null);
    await supabase.from("calls").delete().eq("id", id);
  };

  const filtered = filter === "all" ? calls : calls.filter(c => c.status === filter);

  if (loading) return <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: T.text3, fontSize: 13 }}>Loading calls…</div>;

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <div style={{ flex: 1, overflow: "auto", padding: "28px 32px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Calls</h1>
            <p style={{ fontSize: 12, color: T.text3 }}>{calls.length} total · {calls.filter(c => c.status === "completed").length} completed</p>
          </div>
          <button onClick={createCall} style={{ padding: "8px 16px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "none", background: T.accent, color: "#fff", cursor: "pointer" }}>+ Schedule Call</button>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
          {["all", "upcoming", "completed"].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: "5px 12px", fontSize: 11, fontWeight: 600, borderRadius: 6, cursor: "pointer",
              background: filter === f ? `${T.accent}20` : T.surface2, color: filter === f ? T.accent : T.text3,
              border: `1px solid ${filter === f ? T.accent + "40" : T.border}`,
            }}>{f.charAt(0).toUpperCase() + f.slice(1)}</button>
          ))}
        </div>

        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: T.text3 }}>
            <div style={{ fontSize: 14, marginBottom: 8 }}>No calls yet</div>
            <button onClick={createCall} style={{ padding: "8px 18px", fontSize: 13, fontWeight: 600, borderRadius: 6, border: "none", background: T.accent, color: "#fff", cursor: "pointer" }}>Schedule your first call</button>
          </div>
        )}

        {filtered.map(call => {
          const sel = selectedCall?.id === call.id;
          return (
            <div key={call.id} onClick={() => setSelectedCall(call)} style={{
              display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", marginBottom: 6,
              borderRadius: 10, border: `1px solid ${sel ? T.accent + "40" : T.border}`,
              background: sel ? `${T.accent}08` : T.surface, cursor: "pointer",
            }}>
              <span style={{ fontSize: 20 }}>{TYPE_ICONS[call.call_type] || "📞"}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{call.title}</div>
                <div style={{ fontSize: 11, color: T.text3, marginTop: 2, display: "flex", gap: 8 }}>
                  {call.scheduled_at && <span>{new Date(call.scheduled_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>}
                  {call.duration_minutes && <span>· {call.duration_minutes}m</span>}
                  {call.recording && <span>· 🔴 Recorded</span>}
                </div>
              </div>
              <span style={{
                fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 6,
                background: call.status === "completed" ? "#0d3a20" : call.status === "upcoming" ? `${T.accent}15` : T.surface2,
                color: call.status === "completed" ? "#22c55e" : call.status === "upcoming" ? T.accent : T.text3,
              }}>{call.status}</span>
            </div>
          );
        })}
      </div>

      {selectedCall && (
        <div style={{ width: 380, borderLeft: `1px solid ${T.border}`, background: T.surface, flexShrink: 0, overflow: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: `1px solid ${T.border}` }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: T.text3 }}>Call Details</span>
            <button onClick={() => setSelectedCall(null)} style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text3, cursor: "pointer", width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>×</button>
          </div>
          <div style={{ padding: 24 }}>
            <input value={selectedCall.title} onChange={e => updateCall(selectedCall.id, { title: e.target.value })}
              style={{ fontSize: 20, fontWeight: 700, color: T.text, background: "transparent", border: "none", outline: "none", width: "100%", marginBottom: 12, fontFamily: "inherit" }} />
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <select value={selectedCall.status} onChange={e => updateCall(selectedCall.id, { status: e.target.value })}
                style={{ fontSize: 11, padding: "4px 8px", borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontFamily: "inherit" }}>
                <option value="upcoming">Upcoming</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option>
              </select>
              <select value={selectedCall.call_type} onChange={e => updateCall(selectedCall.id, { call_type: e.target.value })}
                style={{ fontSize: 11, padding: "4px 8px", borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontFamily: "inherit" }}>
                <option value="scheduled">Scheduled</option><option value="huddle">Huddle</option><option value="recurring">Recurring</option>
              </select>
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.text3, display: "block", marginBottom: 4 }}>Duration (min)</label>
              <input type="number" value={selectedCall.duration_minutes || ""} onChange={e => updateCall(selectedCall.id, { duration_minutes: Number(e.target.value) || null })}
                style={{ padding: "6px 10px", fontSize: 13, color: T.text, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, outline: "none", width: 80, fontFamily: "inherit" }} />
            </div>
            <div style={{ display: "flex", gap: 12, marginBottom: 16 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: T.text2, cursor: "pointer" }}>
                <input type="checkbox" checked={selectedCall.recording || false} onChange={e => updateCall(selectedCall.id, { recording: e.target.checked })} /> Recording
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: T.text2, cursor: "pointer" }}>
                <input type="checkbox" checked={selectedCall.transcript || false} onChange={e => updateCall(selectedCall.id, { transcript: e.target.checked })} /> Transcript
              </label>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.text3, display: "block", marginBottom: 4 }}>Summary / Notes</label>
              <textarea value={selectedCall.summary || ""} onChange={e => updateCall(selectedCall.id, { summary: e.target.value })}
                placeholder="Add meeting notes…"
                style={{ width: "100%", minHeight: 120, fontSize: 13, color: T.text, lineHeight: 1.6, padding: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, resize: "vertical", outline: "none", fontFamily: "inherit" }} />
            </div>
            <button onClick={() => deleteCall(selectedCall.id)} style={{ padding: "7px 14px", fontSize: 12, fontWeight: 600, borderRadius: 6, border: "1px solid #ef444440", background: "#ef444410", color: "#ef4444", cursor: "pointer" }}>Delete</button>
          </div>
        </div>
      )}
    </div>
  );
}
