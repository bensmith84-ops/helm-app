"use client";
import { useState, useEffect, useRef } from "react";
import { T } from "../tokens";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useModal } from "../lib/modal";

// Get Monday of a given week
const getMonday = (d) => {
  const dt = new Date(d);
  const day = dt.getDay();
  const diff = dt.getDate() - day + (day === 0 ? -6 : 1);
  dt.setDate(diff);
  dt.setHours(0, 0, 0, 0);
  return dt;
};

const fmt = (d) => d.toISOString().split("T")[0];

const getWeekLabel = (d) => {
  const dt = new Date(d + "T00:00:00");
  const m = dt.toLocaleDateString("en-US", { month: "short" });
  return `${m} ${dt.getDate()}`;
};

export default function ScorecardView() {
  const { user, profile } = useAuth();
  const { showPrompt, showConfirm } = useModal();
  const [metrics, setMetrics] = useState([]);
  const [entries, setEntries] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [loading, setLoading] = useState(true);
  const [editMetric, setEditMetric] = useState(null);
  const [editEntry, setEditEntry] = useState(null);
  const [weekOffset, setWeekOffset] = useState(0);

  // Calculate visible weeks (13 weeks = 1 quarter, centered on current)
  const VISIBLE_WEEKS = 13;
  const today = new Date();
  const currentMonday = getMonday(today);

  const weeks = [];
  for (let i = -Math.floor(VISIBLE_WEEKS / 2) + weekOffset; i < Math.ceil(VISIBLE_WEEKS / 2) + weekOffset; i++) {
    const d = new Date(currentMonday);
    d.setDate(d.getDate() + i * 7);
    weeks.push(fmt(d));
  }
  const thisWeek = fmt(currentMonday);

  useEffect(() => {
    (async () => {
      const [{ data: m }, { data: p }] = await Promise.all([
        supabase.from("l10_metrics").select("*").eq("org_id", profile?.org_id).order("sort_order"),
        supabase.from("profiles").select("id,display_name,avatar_url"),
      ]);
      setMetrics(m || []);
      const pm = {};
      (p || []).forEach(u => { pm[u.id] = u; });
      setProfiles(pm);

      if (m && m.length > 0) {
        const ids = m.map(x => x.id);
        const { data: e } = await supabase.from("l10_entries").select("*").in("metric_id", ids);
        setEntries(e || []);
      }
      setLoading(false);
    })();
  }, [profile?.org_id]);

  const getEntry = (metricId, weekStart) => entries.find(e => e.metric_id === metricId && e.week_start === weekStart);

  const uname = (uid) => profiles[uid]?.display_name || "";
  const ini = (uid) => {
    const u = profiles[uid];
    return u?.display_name ? u.display_name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() : "?";
  };
  const acol = (uid) => {
    if (!uid) return T.text3;
    let h = 0;
    for (let i = 0; i < uid.length; i++) h = uid.charCodeAt(i) + ((h << 5) - h);
    const hue = Math.abs(h) % 360;
    return `hsl(${hue},60%,60%)`;
  };
  const Ava = ({ uid, sz = 24 }) => {
    if (!uid) return <div style={{ width: sz, height: sz }} />;
    const c = acol(uid);
    return (<div title={uname(uid)} style={{ width: sz, height: sz, borderRadius: "50%", background: `${c}18`, border: `1.5px solid ${c}50`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.max(sz * 0.38, 9), fontWeight: 700, color: c, flexShrink: 0 }}>{ini(uid)}</div>);
  };

  // CRUD
  const addMetric = () => {
    setEditMetric({ title: "", owner_id: user?.id || "", unit: "", target_value: 0, goal_direction: "above" });
  };

  const saveMetric = async () => {
    if (!editMetric || !editMetric.title.trim()) return;
    if (editMetric.id) {
      // Update
      const { id, ...rest } = editMetric;
      const updates = { title: rest.title, owner_id: rest.owner_id || null, unit: rest.unit, target_value: Number(rest.target_value), goal_direction: rest.goal_direction };
      setMetrics(p => p.map(m => m.id === id ? { ...m, ...updates } : m));
      await supabase.from("l10_metrics").update(updates).eq("id", id);
    } else {
      // Insert
      const ins = { org_id: profile?.org_id, title: editMetric.title.trim(), owner_id: editMetric.owner_id || null, unit: editMetric.unit, target_value: Number(editMetric.target_value), goal_direction: editMetric.goal_direction, sort_order: metrics.length };
      const { data } = await supabase.from("l10_metrics").insert(ins).select().single();
      if (data) setMetrics(p => [...p, data]);
    }
    setEditMetric(null);
  };

  const deleteMetric = async (id) => {
    const ok = await showConfirm("Delete this metric? All weekly entries will also be removed.");
    if (!ok) return;
    setMetrics(p => p.filter(m => m.id !== id));
    setEntries(p => p.filter(e => e.metric_id !== id));
    await supabase.from("l10_metrics").delete().eq("id", id);
  };

  const openEntry = (metricId, weekStart) => {
    const existing = getEntry(metricId, weekStart);
    const metric = metrics.find(m => m.id === metricId);
    setEditEntry({
      id: existing?.id || null,
      metric_id: metricId,
      week_start: weekStart,
      actual_value: existing?.actual_value ?? "",
      comment: existing?.comment || "",
      improvement_plan: existing?.improvement_plan || "",
      _metric: metric,
    });
  };

  const saveEntry = async () => {
    if (!editEntry) return;
    const metric = metrics.find(m => m.id === editEntry.metric_id);
    const av = Number(editEntry.actual_value);
    const onTrack = metric?.goal_direction === "above" ? av >= metric.target_value : av <= metric.target_value;
    const payload = {
      metric_id: editEntry.metric_id,
      week_start: editEntry.week_start,
      actual_value: av || null,
      on_track: editEntry.actual_value !== "" ? onTrack : null,
      comment: editEntry.comment || null,
      improvement_plan: editEntry.improvement_plan || null,
      entered_by: user?.id,
    };

    if (editEntry.id) {
      setEntries(p => p.map(e => e.id === editEntry.id ? { ...e, ...payload } : e));
      await supabase.from("l10_entries").update(payload).eq("id", editEntry.id);
    } else {
      const { data } = await supabase.from("l10_entries").insert(payload).select().single();
      if (data) setEntries(p => [...p, data]);
    }
    setEditEntry(null);
  };

  // Styles
  const _lbl = { fontSize: 11, fontWeight: 500, color: T.text3, display: "block", marginBottom: 3 };
  const _inp = { width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };

  if (loading) return <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: T.text3, fontSize: 13 }}>Loading Scorecard…</div>;

  // Stats
  const currentEntries = entries.filter(e => e.week_start === thisWeek);
  const onTrackCount = currentEntries.filter(e => e.on_track === true).length;
  const offTrackCount = currentEntries.filter(e => e.on_track === false).length;
  const missingCount = metrics.length - currentEntries.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ padding: "16px 24px 12px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>L10 Scorecard</h2>
          <p style={{ fontSize: 12, color: T.text3, margin: "4px 0 0" }}>Weekly metrics tracking • {metrics.length} metrics</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Stats badges */}
          <div style={{ display: "flex", gap: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 6, background: `${T.green}15`, color: T.green }}>{onTrackCount} on track</span>
            {offTrackCount > 0 && <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 6, background: `${T.red}15`, color: T.red }}>{offTrackCount} off track</span>}
            {missingCount > 0 && <span style={{ fontSize: 11, fontWeight: 600, padding: "4px 10px", borderRadius: 6, background: `${T.yellow}15`, color: T.yellow }}>{missingCount} missing</span>}
          </div>
          <button onClick={addMetric} style={{ padding: "8px 16px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "none", background: T.accent, color: "#fff", cursor: "pointer" }}>+ Add Metric</button>
        </div>
      </div>

      {/* Week navigation */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: "8px 24px", borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
        <button onClick={() => setWeekOffset(p => p - 4)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 16, padding: "4px 8px" }}>«</button>
        <button onClick={() => setWeekOffset(p => p - 1)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 16, padding: "4px 8px" }}>‹</button>
        <button onClick={() => setWeekOffset(0)} style={{ padding: "4px 14px", fontSize: 11, fontWeight: 600, borderRadius: 6, border: `1px solid ${T.border}`, background: weekOffset === 0 ? T.accent : T.surface2, color: weekOffset === 0 ? "#fff" : T.text2, cursor: "pointer" }}>This Week</button>
        <button onClick={() => setWeekOffset(p => p + 1)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 16, padding: "4px 8px" }}>›</button>
        <button onClick={() => setWeekOffset(p => p + 4)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 16, padding: "4px 8px" }}>»</button>
      </div>

      {/* Scorecard table */}
      <div style={{ flex: 1, overflow: "auto" }}>
        {metrics.length === 0 ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, color: T.text3 }}>
            <div style={{ fontSize: 40 }}>▣</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>No metrics yet</div>
            <div style={{ fontSize: 12 }}>Add your first L10 scorecard metric to start tracking weekly numbers</div>
            <button onClick={addMetric} style={{ marginTop: 8, padding: "10px 20px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: `1px dashed ${T.border}`, background: "transparent", color: T.accent, cursor: "pointer" }}>+ Add Metric</button>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: T.surface, borderBottom: `1px solid ${T.border}` }}>
                <th style={{ position: "sticky", left: 0, background: T.surface, zIndex: 2, padding: "8px 16px", textAlign: "left", fontWeight: 600, color: T.text3, fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em", minWidth: 200, borderRight: `1px solid ${T.border}` }}>Metric</th>
                <th style={{ position: "sticky", left: 200, background: T.surface, zIndex: 2, padding: "8px 12px", textAlign: "center", fontWeight: 600, color: T.text3, fontSize: 10, textTransform: "uppercase", minWidth: 50, borderRight: `1px solid ${T.border}` }}>Owner</th>
                <th style={{ padding: "8px 12px", textAlign: "center", fontWeight: 600, color: T.text3, fontSize: 10, textTransform: "uppercase", minWidth: 60, borderRight: `1px solid ${T.border}` }}>Goal</th>
                {weeks.map(w => {
                  const isCurrent = w === thisWeek;
                  return (
                    <th key={w} style={{ padding: "6px 8px", textAlign: "center", fontWeight: isCurrent ? 700 : 500, color: isCurrent ? T.accent : T.text3, fontSize: 10, minWidth: 72, borderRight: `1px solid ${T.border}`, background: isCurrent ? `${T.accent}08` : "transparent" }}>
                      {getWeekLabel(w)}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {metrics.map(metric => (
                <tr key={metric.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                  {/* Metric name */}
                  <td style={{ position: "sticky", left: 0, background: T.bg, zIndex: 1, padding: "10px 16px", borderRight: `1px solid ${T.border}`, minWidth: 200 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span onClick={() => setEditMetric({ ...metric })} style={{ fontWeight: 600, fontSize: 13, cursor: "pointer", flex: 1 }} onMouseEnter={e => e.currentTarget.style.textDecoration = "underline"} onMouseLeave={e => e.currentTarget.style.textDecoration = "none"}>{metric.title}</span>
                      <button onClick={() => deleteMetric(metric.id)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 11, opacity: 0.3, padding: 0 }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.3}>×</button>
                    </div>
                    {metric.unit && <div style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>{metric.unit}</div>}
                  </td>
                  {/* Owner */}
                  <td style={{ position: "sticky", left: 200, background: T.bg, zIndex: 1, textAlign: "center", borderRight: `1px solid ${T.border}` }}>
                    <Ava uid={metric.owner_id} sz={24} />
                  </td>
                  {/* Goal */}
                  <td style={{ textAlign: "center", padding: "8px", borderRight: `1px solid ${T.border}`, fontWeight: 600, color: T.text2 }}>
                    {metric.goal_direction === "above" ? "≥" : "≤"} {metric.target_value}
                  </td>
                  {/* Week cells */}
                  {weeks.map(w => {
                    const entry = getEntry(metric.id, w);
                    const isCurrent = w === thisWeek;
                    const hasValue = entry?.actual_value != null;
                    const isOnTrack = entry?.on_track;
                    const isOffTrack = entry?.on_track === false;

                    let cellBg = "transparent";
                    let cellColor = T.text3;
                    if (hasValue && isOnTrack) { cellBg = `${T.green}12`; cellColor = T.green; }
                    else if (hasValue && isOffTrack) { cellBg = `${T.red}12`; cellColor = T.red; }
                    if (isCurrent) cellBg = hasValue ? cellBg : `${T.accent}06`;

                    return (
                      <td key={w} onClick={() => openEntry(metric.id, w)}
                        style={{ textAlign: "center", padding: "8px 6px", borderRight: `1px solid ${T.border}`, cursor: "pointer", background: cellBg, transition: "background 0.15s", position: "relative" }}
                        onMouseEnter={e => { if (!hasValue) e.currentTarget.style.background = `${T.accent}15`; }}
                        onMouseLeave={e => { e.currentTarget.style.background = cellBg; }}>
                        {hasValue ? (
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 13, color: cellColor }}>{entry.actual_value}</div>
                            {isOffTrack && entry.improvement_plan && <div title={entry.improvement_plan} style={{ fontSize: 8, marginTop: 2, color: T.red, opacity: 0.7 }}>⚠ plan</div>}
                            {entry.comment && <div title={entry.comment} style={{ fontSize: 8, marginTop: 1, color: T.text3 }}>💬</div>}
                          </div>
                        ) : (
                          <span style={{ color: T.text3, opacity: 0.3, fontSize: 16 }}>·</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Edit Metric Modal */}
      {editMetric && (
        <div onClick={() => setEditMetric(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 440, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", overflow: "hidden" }}>
            <div style={{ padding: "16px 24px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{editMetric.id ? "Edit" : "Add"} Metric</h3>
              <button onClick={() => setEditMetric(null)} style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text3, cursor: "pointer", width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>×</button>
            </div>
            <div style={{ padding: "20px 24px" }}>
              <div style={{ marginBottom: 12 }}>
                <label style={_lbl}>Metric Name</label>
                <input value={editMetric.title} onChange={e => setEditMetric(p => ({ ...p, title: e.target.value }))} autoFocus placeholder="e.g. Weekly Revenue, New Leads, NPS Score" style={_inp} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={_lbl}>Target Value</label>
                  <input type="number" value={editMetric.target_value} onChange={e => setEditMetric(p => ({ ...p, target_value: e.target.value }))} style={_inp} />
                </div>
                <div>
                  <label style={_lbl}>Unit</label>
                  <input value={editMetric.unit} onChange={e => setEditMetric(p => ({ ...p, unit: e.target.value }))} placeholder="e.g. $, leads, points" style={_inp} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={_lbl}>On Track When</label>
                  <select value={editMetric.goal_direction} onChange={e => setEditMetric(p => ({ ...p, goal_direction: e.target.value }))} style={{ ..._inp, cursor: "pointer" }}>
                    <option value="above">At or Above Target</option>
                    <option value="below">At or Below Target</option>
                  </select>
                </div>
                <div>
                  <label style={_lbl}>Owner</label>
                  <select value={editMetric.owner_id || ""} onChange={e => setEditMetric(p => ({ ...p, owner_id: e.target.value || null }))} style={{ ..._inp, cursor: "pointer" }}>
                    <option value="">Unassigned</option>
                    {Object.values(profiles).map(p => <option key={p.id} value={p.id}>{p.display_name}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div style={{ padding: "14px 24px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setEditMetric(null)} style={{ padding: "9px 18px", borderRadius: 8, background: T.surface3, color: T.text2, border: "none", fontSize: 13, cursor: "pointer" }}>Cancel</button>
              <button onClick={saveMetric} disabled={!editMetric.title?.trim()} style={{ padding: "9px 18px", borderRadius: 8, background: T.accent, color: "#fff", border: "none", fontSize: 13, cursor: "pointer", fontWeight: 600, opacity: editMetric.title?.trim() ? 1 : 0.5 }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Entry Modal */}
      {editEntry && (() => {
        const metric = editEntry._metric;
        const av = Number(editEntry.actual_value);
        const hasVal = editEntry.actual_value !== "" && editEntry.actual_value != null;
        const onTrack = hasVal && metric ? (metric.goal_direction === "above" ? av >= metric.target_value : av <= metric.target_value) : null;
        return (
          <div onClick={() => setEditEntry(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div onClick={e => e.stopPropagation()} style={{ width: 480, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", overflow: "hidden" }}>
              <div style={{ padding: "16px 24px", borderBottom: `1px solid ${T.border}` }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{metric?.title || "Entry"}</h3>
                <div style={{ fontSize: 12, color: T.text3, marginTop: 4 }}>Week of {getWeekLabel(editEntry.week_start)} • Target: {metric?.goal_direction === "above" ? "≥" : "≤"} {metric?.target_value} {metric?.unit}</div>
              </div>
              <div style={{ padding: "20px 24px" }}>
                {/* Actual value + status indicator */}
                <div style={{ marginBottom: 16 }}>
                  <label style={_lbl}>Actual Value</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <input type="number" value={editEntry.actual_value} onChange={e => setEditEntry(p => ({ ...p, actual_value: e.target.value }))} autoFocus placeholder="Enter this week's number" style={{ ..._inp, flex: 1, fontSize: 18, fontWeight: 700, padding: "12px 14px" }} />
                    {hasVal && (
                      <div style={{ padding: "8px 16px", borderRadius: 8, fontWeight: 700, fontSize: 13, background: onTrack ? `${T.green}15` : `${T.red}15`, color: onTrack ? T.green : T.red }}>
                        {onTrack ? "✓ On Track" : "✗ Off Track"}
                      </div>
                    )}
                  </div>
                </div>

                {/* Off-track improvement plan */}
                {hasVal && !onTrack && (
                  <div style={{ marginBottom: 16, padding: 16, background: `${T.red}08`, border: `1px solid ${T.red}25`, borderRadius: 10 }}>
                    <label style={{ ..._lbl, color: T.red, fontWeight: 600, fontSize: 12 }}>⚠ Improvement Plan — What will you do to get this back on track?</label>
                    <textarea value={editEntry.improvement_plan} onChange={e => setEditEntry(p => ({ ...p, improvement_plan: e.target.value }))} rows={3}
                      placeholder="Describe the specific actions you'll take this week to improve this number..."
                      style={{ ..._inp, resize: "vertical", background: T.surface, marginTop: 4 }} />
                  </div>
                )}

                {/* Comment */}
                <div>
                  <label style={_lbl}>Comment (optional)</label>
                  <textarea value={editEntry.comment} onChange={e => setEditEntry(p => ({ ...p, comment: e.target.value }))} rows={2} placeholder="Any context or notes for this week..." style={{ ..._inp, resize: "vertical" }} />
                </div>
              </div>
              <div style={{ padding: "14px 24px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => setEditEntry(null)} style={{ padding: "9px 18px", borderRadius: 8, background: T.surface3, color: T.text2, border: "none", fontSize: 13, cursor: "pointer" }}>Cancel</button>
                <button onClick={saveEntry} style={{ padding: "9px 18px", borderRadius: 8, background: T.accent, color: "#fff", border: "none", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>Save</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
