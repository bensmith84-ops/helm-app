"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";
import { useAuth } from "../lib/auth";
import { useResizableColumns } from "../lib/useResizableColumns";
import { useModal } from "../lib/modal";

const HEALTH = {
  on_track:  { label: "On Track",  color: "#22c55e", bg: "#0d3a20" },
  at_risk:   { label: "At Risk",   color: "#eab308", bg: "#3d3000" },
  off_track: { label: "Off Track", color: "#ef4444", bg: "#3d1111" },
};
const AVATAR_COLORS = ["#3b82f6","#a855f7","#ec4899","#06b6d4","#f97316","#22c55e","#84cc16","#ef4444"];
const acol = (uid) => uid ? AVATAR_COLORS[uid.charCodeAt(uid.length - 1) % AVATAR_COLORS.length] : T.text3;
const TIMEFRAME_OPTIONS = [
  { value: "month", label: "Monthly" },
  { value: "quarter", label: "Quarterly" },
  { value: "half", label: "Half Year" },
  { value: "year", label: "Annual" },
  { value: "custom", label: "Custom" },
];
const MS_COLORS = ["#6366f1","#3b82f6","#22c55e","#a855f7","#f97316","#ec4899","#06b6d4","#eab308"];

export default function OKRsView() {
  const { user, profile } = useAuth();
  const { showPrompt, showConfirm } = useModal();
  const [cycles, setCycles] = useState([]);
  const [activeCycle, setActiveCycle] = useState(null);
  const [objectives, setObjectives] = useState([]);
  const [keyResults, setKeyResults] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [expanded, setExpanded] = useState([]);
  const [selectedKR, setSelectedKR] = useState(null);
  const [editItem, setEditItem] = useState(null); // { type: 'objective'|'kr'|'milestone', data: {...} }
  const [viewMode, setViewMode] = useState(() => {
    if (typeof window !== "undefined") { try { return localStorage.getItem("okr_view") || "list"; } catch {} }
    return "list";
  });
  const { gridTemplate: okrGrid, onResizeStart: okrResize } = useResizableColumns([250, 160, 80, 80, 60], "okrs");
  const ORH = ({ index }) => (<div onMouseDown={(e) => okrResize(index, e)} style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 6, cursor: "col-resize", zIndex: 2 }} onMouseEnter={e => e.currentTarget.style.background = T.accent + "40"} onMouseLeave={e => e.currentTarget.style.background = "transparent"} />);
  const [loading, setLoading] = useState(true);
  // Milestone form
  const [msForm, setMsForm] = useState(null); // { objectiveId, title, start_date, end_date, color }
  const [objForm, setObjForm] = useState(null); // full objective creation form

  const setView = (v) => { setViewMode(v); try { localStorage.setItem("okr_view", v); } catch {} };

  useEffect(() => {
    (async () => {
      const [{ data: c }, { data: prof }] = await Promise.all([
        supabase.from("okr_cycles").select("*").order("start_date", { ascending: false }),
        supabase.from("profiles").select("id,display_name,avatar_url"),
      ]);
      setCycles(c || []);
      const m = {}; (prof || []).forEach(u => { m[u.id] = u; }); setProfiles(m);
      const active = (c || []).find(cy => cy.status === "active") || c?.[0];
      if (active) setActiveCycle(active.id);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!activeCycle) return;
    (async () => {
      const [{ data: obj }, { data: kr }, { data: ms }] = await Promise.all([
        supabase.from("objectives").select("*").eq("cycle_id", activeCycle).is("deleted_at", null).order("sort_order"),
        supabase.from("key_results").select("*").is("deleted_at", null).order("sort_order"),
        supabase.from("okr_milestones").select("*").order("sort_order"),
      ]);
      setObjectives(obj || []);
      const filteredKR = (kr || []).filter(k => (obj || []).some(o => o.id === k.objective_id));
      setKeyResults(filteredKR);
      const filteredMS = (ms || []).filter(m => (obj || []).some(o => o.id === m.objective_id));
      setMilestones(filteredMS);
      setExpanded((obj || []).map(o => o.id));
      setSelectedKR(null);
    })();
  }, [activeCycle]);

  const ini = (uid) => { const u = profiles[uid]; return u?.display_name ? u.display_name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() : "?"; };
  const uname = (uid) => profiles[uid]?.display_name || "";
  const toggle = (id) => setExpanded(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  const updateKRValue = async (krId, value) => {
    const kr = keyResults.find(k => k.id === krId);
    if (!kr) return;
    const newProgress = kr.target_value > 0 ? Math.min(100, Math.round((value / kr.target_value) * 100)) : 0;
    setKeyResults(p => p.map(k => k.id === krId ? { ...k, current_value: value, progress: newProgress } : k));
    await supabase.from("key_results").update({ current_value: value, progress: newProgress }).eq("id", krId);
    const objId = kr.objective_id;
    const objKRs = keyResults.map(k => k.id === krId ? { ...k, progress: newProgress } : k).filter(k => k.objective_id === objId);
    const avgProgress = objKRs.length > 0 ? Math.round(objKRs.reduce((s, k) => s + Number(k.progress || 0), 0) / objKRs.length) : 0;
    setObjectives(p => p.map(o => o.id === objId ? { ...o, progress: avgProgress } : o));
    await supabase.from("objectives").update({ progress: avgProgress }).eq("id", objId);
  };

  const updateHealth = async (objId, health) => {
    setObjectives(p => p.map(o => o.id === objId ? { ...o, health } : o));
    await supabase.from("objectives").update({ health }).eq("id", objId);
  };

  const updateObjectiveTimeframe = async (objId, field, value) => {
    setObjectives(p => p.map(o => o.id === objId ? { ...o, [field]: value } : o));
    await supabase.from("objectives").update({ [field]: value }).eq("id", objId);
  };

  const openObjectiveForm = () => {
    const c = cycles.find(cy => cy.id === activeCycle);
    setObjForm({
      title: "", description: "", health: "on_track", timeframe: "quarter",
      start_date: c?.start_date || "", end_date: c?.end_date || "",
      owner_id: user?.id || "", team_id: "",
      keyResults: [{ title: "", target_value: 100, unit: "", owner_id: "", start_date: "", end_date: "" }],
      milestones: [],
    });
  };

  const saveObjective = async () => {
    if (!objForm?.title?.trim()) return;
    const maxSort = objectives.reduce((m, o) => Math.max(m, o.sort_order || 0), 0);
    const { data: objData, error: objErr } = await supabase.from("objectives").insert({
      org_id: profile?.org_id, cycle_id: activeCycle,
      title: objForm.title.trim(), description: objForm.description || null,
      health: objForm.health, progress: 0, sort_order: maxSort + 1,
      timeframe: objForm.timeframe,
      start_date: objForm.start_date || null, end_date: objForm.end_date || null,
      owner_id: objForm.owner_id || null, team_id: objForm.team_id || null,
    }).select().single();
    if (objErr || !objData) return;
    // Create key results
    const validKRs = objForm.keyResults.filter(kr => kr.title.trim());
    const krInserts = validKRs.map((kr, i) => ({
      org_id: profile?.org_id, objective_id: objData.id, title: kr.title.trim(),
      target_value: Number(kr.target_value) || 100, start_value: 0, current_value: 0,
      progress: 0, unit: kr.unit || null, owner_id: kr.owner_id || null, sort_order: i + 1,
      start_date: kr.start_date || null, end_date: kr.end_date || null,
    }));
    let newKRs = [];
    if (krInserts.length > 0) {
      const { data: krData } = await supabase.from("key_results").insert(krInserts).select();
      newKRs = krData || [];
    }
    // Create milestones
    const validMS = (objForm.milestones || []).filter(m => m.title.trim() && m.start_date && m.end_date);
    let newMS = [];
    if (validMS.length > 0) {
      const msInserts = validMS.map((m, i) => ({
        objective_id: objData.id, title: m.title.trim(),
        start_date: m.start_date, end_date: m.end_date,
        color: m.color || MS_COLORS[i % MS_COLORS.length], sort_order: i,
        target_value: Number(m.target_value) || 100, unit: m.unit || null,
        current_value: 0, progress: 0,
      }));
      const { data: msData } = await supabase.from("okr_milestones").insert(msInserts).select();
      newMS = msData || [];
    }
    setObjectives(p => [...p, objData]);
    setKeyResults(p => [...p, ...newKRs]);
    setMilestones(p => [...p, ...newMS]);
    setExpanded(p => [...p, objData.id]);
    setObjForm(null);
  };

  const createObjective = openObjectiveForm;

  const createKeyResult = async (objId) => {
    const title = await showPrompt("New Key Result", "Key Result title");
    if (!title?.trim()) return;
    const target = await showPrompt("Target Value", "Target value", "100");
    const maxSort = keyResults.filter(k => k.objective_id === objId).reduce((m, k) => Math.max(m, k.sort_order || 0), 0);
    const { data, error } = await supabase.from("key_results").insert({
      org_id: profile?.org_id, objective_id: objId, title: title.trim(), target_value: Number(target) || 100,
      start_value: 0, current_value: 0, progress: 0, sort_order: maxSort + 1,
    }).select().single();
    if (error) return;
    if (data) setKeyResults(p => [...p, data]);
  };

  const deleteObjective = async (objId) => {
    if (!(await showConfirm("Delete Objective", "This will delete the objective and all its key results."))) return;
    setObjectives(p => p.filter(o => o.id !== objId));
    setKeyResults(p => p.filter(k => k.objective_id !== objId));
    setMilestones(p => p.filter(m => m.objective_id !== objId));
    await supabase.from("key_results").update({ deleted_at: new Date().toISOString() }).eq("objective_id", objId);
    await supabase.from("okr_milestones").delete().eq("objective_id", objId);
    await supabase.from("objectives").update({ deleted_at: new Date().toISOString() }).eq("id", objId);
  };

  const deleteKeyResult = async (krId) => {
    setKeyResults(p => p.filter(k => k.id !== krId));
    await supabase.from("key_results").update({ deleted_at: new Date().toISOString() }).eq("id", krId);
  };

  // Milestone CRUD
  const saveMilestone = async () => {
    if (!msForm || !msForm.title?.trim() || !msForm.start_date || !msForm.end_date) return;
    const { data, error } = await supabase.from("okr_milestones").insert({
      objective_id: msForm.objectiveId, title: msForm.title.trim(),
      start_date: msForm.start_date, end_date: msForm.end_date,
      color: msForm.color || MS_COLORS[milestones.length % MS_COLORS.length],
    }).select().single();
    if (!error && data) setMilestones(p => [...p, data]);
    setMsForm(null);
  };
  const deleteMilestone = async (id) => {
    setMilestones(p => p.filter(m => m.id !== id));
    await supabase.from("okr_milestones").delete().eq("id", id);
  };

  // Edit functions
  const editObjective = (obj) => setEditItem({ type: "objective", data: { ...obj } });
  const editKR = (kr) => { setSelectedKR(null); setEditItem({ type: "kr", data: { ...kr } }); };
  const editMilestone = (ms) => setEditItem({ type: "milestone", data: { ...ms } });

  const recalcObjectiveProgress = async (objId, krArr) => {
    if (!objId) return;
    const objKRs = (krArr || keyResults).filter(k => k.objective_id === objId);
    const avg = objKRs.length > 0 ? Math.round(objKRs.reduce((s, k) => s + Number(k.progress || 0), 0) / objKRs.length) : 0;
    setObjectives(p => p.map(o => o.id === objId ? { ...o, progress: avg } : o));
    await supabase.from("objectives").update({ progress: avg }).eq("id", objId);
  };

  const recalcKRFromMilestones = async (krId, msArr) => {
    const kr = keyResults.find(k => k.id === krId);
    if (!kr || kr.progress_mode !== "milestones") return;
    const linked = (msArr || milestones).filter(m => m.key_result_id === krId);
    const prog = linked.length > 0 ? Math.round(linked.reduce((s, m) => s + Number(m.progress || 0), 0) / linked.length) : 0;
    const cv = Math.round((prog / 100) * (kr.target_value || 100));
    setKeyResults(p => p.map(k => k.id === krId ? { ...k, progress: prog, current_value: cv } : k));
    await supabase.from("key_results").update({ progress: prog, current_value: cv }).eq("id", krId);
    recalcObjectiveProgress(kr.objective_id, keyResults.map(k => k.id === krId ? { ...k, progress: prog, current_value: cv } : k));
  };

  const saveEdit = async () => {
    if (!editItem) return;
    const { type, data } = editItem;
    if (type === "objective") {
      const { id, ...rest } = data;
      const updates = { title: rest.title, description: rest.description, health: rest.health, owner_id: rest.owner_id || null, timeframe: rest.timeframe, start_date: rest.start_date || null, end_date: rest.end_date || null };
      setObjectives(p => p.map(o => o.id === id ? { ...o, ...updates } : o));
      await supabase.from("objectives").update(updates).eq("id", id);
    } else if (type === "kr") {
      const { id, ...rest } = data;
      const mode = rest.progress_mode || "manual";
      const updates = { title: rest.title, target_value: Number(rest.target_value) || 100, unit: rest.unit || null, owner_id: rest.owner_id || null, start_date: rest.start_date || null, end_date: rest.end_date || null, current_value: Number(rest.current_value) || 0, progress_mode: mode };
      if (mode === "manual") {
        updates.progress = updates.target_value > 0 ? Math.min(100, Math.round((updates.current_value / updates.target_value) * 100)) : 0;
      } else {
        const linked = milestones.filter(m => m.key_result_id === id);
        updates.progress = linked.length > 0 ? Math.round(linked.reduce((s, m) => s + Number(m.progress || 0), 0) / linked.length) : 0;
        updates.current_value = Math.round((updates.progress / 100) * updates.target_value);
      }
      setKeyResults(p => p.map(k => k.id === id ? { ...k, ...updates } : k));
      await supabase.from("key_results").update(updates).eq("id", id);
      recalcObjectiveProgress(keyResults.find(k => k.id === id)?.objective_id, keyResults.map(k => k.id === id ? { ...k, ...updates } : k));
    } else if (type === "milestone") {
      const { id, ...rest } = data;
      const cv = Number(rest.current_value) || 0;
      const tv = Number(rest.target_value) || 100;
      const autoProg = tv > 0 ? Math.min(100, Math.round((cv / tv) * 100)) : 0;
      const updates = { title: rest.title, start_date: rest.start_date, end_date: rest.end_date, color: rest.color, current_value: cv, target_value: tv, unit: rest.unit || null, progress: autoProg, status: rest.status || "not_started", key_result_id: rest.key_result_id || null };
      setMilestones(p => p.map(m => m.id === id ? { ...m, ...updates } : m));
      await supabase.from("okr_milestones").update(updates).eq("id", id);
      if (updates.key_result_id) {
        const newMilestones = milestones.map(m => m.id === id ? { ...m, ...updates } : m);
        await recalcKRFromMilestones(updates.key_result_id, newMilestones);
      }
    }
    setEditItem(null);
  };

  const editSet = (k, v) => setEditItem(p => ({ ...p, data: { ...p.data, [k]: v } }));

  if (loading) return <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: T.text3, fontSize: 13 }}>Loading OKRs…</div>;

  const cycle = cycles.find(c => c.id === activeCycle);
  const overallProgress = objectives.length > 0 ? Math.round(objectives.reduce((s, o) => s + Number(o.progress || 0), 0) / objectives.length) : 0;
  const onTrackCount = objectives.filter(o => o.health === "on_track").length;
  const atRiskCount = objectives.filter(o => o.health === "at_risk" || o.health === "off_track").length;
  const daysLeft = cycle ? Math.max(0, Math.ceil((new Date(cycle.end_date) - new Date()) / 86400000)) : 0;

  const Ava = ({ uid, sz = 24 }) => {
    if (!uid) return <div style={{ width: sz, height: sz }} />;
    const c = acol(uid);
    return (<div title={uname(uid)} style={{ width: sz, height: sz, borderRadius: "50%", background: `${c}18`, border: `1.5px solid ${c}50`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.max(sz * 0.38, 9), fontWeight: 700, color: c, flexShrink: 0 }}>{ini(uid)}</div>);
  };

  const ConfidenceDot = ({ value }) => {
    const pct = Number(value || 0) * 100;
    const color = pct >= 70 ? T.green : pct >= 40 ? T.yellow : T.red;
    return (<div title={`${Math.round(pct)}% confidence`} style={{ display: "flex", alignItems: "center", gap: 5 }}><div style={{ width: 8, height: 8, borderRadius: 8, background: color }} /><span style={{ fontSize: 11, color: T.text3 }}>{Math.round(pct)}%</span></div>);
  };

  // ============================
  // ROADMAP TIMELINE VIEW
  // ============================
  const RoadmapView = () => {
    // Calculate date range from cycle
    const startDate = cycle?.start_date ? new Date(cycle.start_date + "T00:00:00") : new Date();
    const endDate = cycle?.end_date ? new Date(cycle.end_date + "T00:00:00") : new Date(startDate.getTime() + 180 * 86400000);
    const totalDays = Math.max(1, (endDate - startDate) / 86400000);

    // Generate month columns
    const months = [];
    const d = new Date(startDate);
    d.setDate(1);
    while (d <= endDate) {
      const monthStart = new Date(Math.max(d.getTime(), startDate.getTime()));
      const nextMonth = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const monthEnd = new Date(Math.min(nextMonth.getTime() - 86400000, endDate.getTime()));
      months.push({
        label: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
        start: monthStart,
        end: monthEnd,
        startPct: ((monthStart - startDate) / (endDate - startDate)) * 100,
        widthPct: ((monthEnd - monthStart) / (endDate - startDate)) * 100,
      });
      d.setMonth(d.getMonth() + 1);
    }

    // Group months into quarters for the top header
    const quarters = [];
    months.forEach((m, i) => {
      const qMonth = m.start.getMonth();
      const qNum = Math.floor(qMonth / 3) + 1;
      const qLabel = `Q${qNum} '${String(m.start.getFullYear()).slice(2)}`;
      const last = quarters[quarters.length - 1];
      if (last && last.label === qLabel) {
        last.widthPct += m.widthPct;
        last.count++;
      } else {
        quarters.push({ label: qLabel, startPct: m.startPct, widthPct: m.widthPct, count: 1 });
      }
    });

    const posBar = (sd, ed) => {
      const s = new Date(sd + "T00:00:00");
      const e = new Date(ed + "T00:00:00");
      const left = Math.max(0, ((s - startDate) / (endDate - startDate)) * 100);
      const right = Math.min(100, ((e - startDate) / (endDate - startDate)) * 100);
      return { left: `${left}%`, width: `${Math.max(0.5, right - left)}%` };
    };

    // Today marker
    const now = new Date();
    const todayPct = ((now - startDate) / (endDate - startDate)) * 100;
    const showToday = todayPct >= 0 && todayPct <= 100;

    const leftColW = 140;
    const krColW = 260;

    return (
      <div style={{ flex: 1, overflow: "auto", position: "relative" }}>
        <div style={{ display: "flex", minWidth: leftColW + krColW + 900 }}>
          {/* Fixed left columns: Objectives + Key Results */}
          <div style={{ width: leftColW + krColW, flexShrink: 0, borderRight: `1px solid ${T.border}`, position: "sticky", left: 0, zIndex: 3, background: T.bg }}>
            {/* Quarter header spacer */}
            <div style={{ height: 24, borderBottom: `1px solid ${T.border}`, background: T.surface }} />
            {/* Month header row */}
            <div style={{ display: "flex", height: 32, borderBottom: `1px solid ${T.border}`, background: T.surface }}>
              <div style={{ width: leftColW, fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.06em", display: "flex", alignItems: "center", paddingLeft: 16 }}>Objectives</div>
              <div style={{ width: krColW, fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.06em", display: "flex", alignItems: "center", paddingLeft: 12, borderLeft: `1px solid ${T.border}` }}>Key Results</div>
            </div>
            {/* Objective rows */}
            {objectives.map((obj, oi) => {
              const objKRs = keyResults.filter(k => k.objective_id === obj.id);
              const objMS = milestones.filter(m => m.objective_id === obj.id);
              const rowH = Math.max(1, objKRs.length) * 34 + objMS.length * 28 + 8;
              const h = HEALTH[obj.health] || HEALTH.on_track;
              return (
                <div key={obj.id} style={{ display: "flex", borderBottom: `1px solid ${T.border}`, minHeight: rowH }}>
                  {/* Objective cell */}
                  <div style={{ width: leftColW, padding: "10px 12px 10px 16px", borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", justifyContent: "center" }}>
                    <div onClick={() => editObjective(obj)} style={{ fontSize: 12, fontWeight: 700, color: T.text, lineHeight: 1.3, marginBottom: 4, cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.textDecoration = "underline"} onMouseLeave={e => e.currentTarget.style.textDecoration = "none"}>{obj.title}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: h.bg, color: h.color }}>{h.label}</span>
                      <span style={{ fontSize: 10, color: T.text3 }}>{Math.round(obj.progress || 0)}%</span>
                    </div>
                    {/* Timeframe selector */}
                    <select value={obj.timeframe || "quarter"} onChange={e => updateObjectiveTimeframe(obj.id, "timeframe", e.target.value)}
                      style={{ marginTop: 4, fontSize: 9, padding: "1px 3px", borderRadius: 3, border: `1px solid ${T.border}`, background: T.surface2, color: T.text3, cursor: "pointer", outline: "none", width: "fit-content" }}>
                      {TIMEFRAME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  {/* Key Results cell */}
                  <div style={{ width: krColW, padding: "6px 12px", display: "flex", flexDirection: "column", justifyContent: "center", gap: 2 }}>
                    {objKRs.map(kr => {
                      const kp = Number(kr.progress || 0);
                      return (
                      <div key={kr.id} onClick={() => editKR(kr)} style={{ fontSize: 11, color: T.text2, lineHeight: 1.4, padding: "4px 0", display: "flex", alignItems: "center", gap: 6, minHeight: 30, cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.background = T.surface2} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <span style={{ color: T.text3, fontSize: 10 }}>•</span>
                        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{kr.title}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
                          <div style={{ width: 32, height: 4, borderRadius: 4, background: T.surface3, overflow: "hidden" }}><div style={{ width: `${kp}%`, height: "100%", borderRadius: 4, background: kp >= 70 ? T.green : kp >= 40 ? T.yellow : T.accent }} /></div>
                          <span style={{ fontSize: 9, fontWeight: 600, color: kp >= 70 ? T.green : kp >= 40 ? T.yellow : T.text3, minWidth: 20 }}>{kp}%</span>
                        </div>
                      </div>);
                    })}
                    {objKRs.length === 0 && <div style={{ fontSize: 10, color: T.text3, fontStyle: "italic" }}>No key results</div>}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Timeline columns */}
          <div style={{ flex: 1, position: "relative", minWidth: 600 }}>
            {/* Quarter header */}
            <div style={{ display: "flex", height: 24, borderBottom: `1px solid ${T.border}`, background: T.surface }}>
              {quarters.map((q, i) => (
                <div key={i} style={{ width: `${q.widthPct}%`, borderRight: `1px solid ${T.border}`, fontSize: 10, fontWeight: 700, color: T.text2, display: "flex", alignItems: "center", justifyContent: "center" }}>{q.label}</div>
              ))}
            </div>
            {/* Month header */}
            <div style={{ display: "flex", height: 32, borderBottom: `1px solid ${T.border}`, background: T.surface }}>
              {months.map((m, i) => (
                <div key={i} style={{ width: `${m.widthPct}%`, borderRight: `1px solid ${T.border}`, fontSize: 10, fontWeight: 500, color: T.text3, display: "flex", alignItems: "center", justifyContent: "center" }}>{m.label}</div>
              ))}
            </div>
            {/* Week sub-header */}
            {(() => {
              const weeks = [];
              const ws = new Date(startDate);
              ws.setDate(ws.getDate() - ws.getDay() + 1); // Start on Monday
              if (ws < startDate) ws.setDate(ws.getDate() + 7);
              while (ws <= endDate) {
                const pct = ((ws - startDate) / (endDate - startDate)) * 100;
                const we = new Date(ws); we.setDate(we.getDate() + 6);
                const wLabel = `W${Math.ceil(ws.getDate() / 7)}`;
                weeks.push({ pct, label: wLabel, date: new Date(ws) });
                ws.setDate(ws.getDate() + 7);
              }
              return (
                <div style={{ position: "relative", height: 18, borderBottom: `1px solid ${T.border}`, background: T.bg }}>
                  {weeks.map((w, i) => (
                    <div key={i} style={{ position: "absolute", left: `${w.pct}%`, top: 0, bottom: 0, display: "flex", alignItems: "center" }}>
                      <div style={{ width: 1, height: "100%", background: `${T.text3}30` }} />
                      <span style={{ fontSize: 8, color: T.text3, marginLeft: 3, whiteSpace: "nowrap" }}>{w.label}</span>
                    </div>
                  ))}
                </div>
              );
            })()}
            {/* Data rows — one per objective */}
            {objectives.map((obj, oi) => {
              const objKRs = keyResults.filter(k => k.objective_id === obj.id);
              const objMS = milestones.filter(m => m.objective_id === obj.id);
              const rowH = Math.max(1, objKRs.length) * 34 + objMS.length * 28 + 8;
              return (
                <div key={obj.id} style={{ position: "relative", minHeight: rowH, borderBottom: `1px solid ${T.border}`, display: "flex", flexDirection: "column", justifyContent: "center", padding: "4px 0" }}>
                  {/* Vertical month grid lines */}
                  {months.map((m, i) => (
                    <div key={i} style={{ position: "absolute", left: `${m.startPct + m.widthPct}%`, top: 0, bottom: 0, width: 1, background: T.border, zIndex: 0 }} />
                  ))}
                  {/* Weekly grid lines */}
                  {(() => {
                    const wlines = [];
                    const wk = new Date(startDate);
                    wk.setDate(wk.getDate() - wk.getDay() + 1);
                    if (wk < startDate) wk.setDate(wk.getDate() + 7);
                    while (wk <= endDate) {
                      const pct = ((wk - startDate) / (endDate - startDate)) * 100;
                      wlines.push(pct);
                      wk.setDate(wk.getDate() + 7);
                    }
                    return wlines.map((p, i) => (
                      <div key={`w${i}`} style={{ position: "absolute", left: `${p}%`, top: 0, bottom: 0, width: 1, background: `${T.text3}15`, zIndex: 0 }} />
                    ));
                  })()}
                  {/* Milestone bars */}
                  {objMS.map((ms, mi) => {
                    const bar = posBar(ms.start_date, ms.end_date);
                    return (
                      <div key={ms.id} style={{ position: "relative", height: 24, marginBottom: 2, zIndex: 1 }}>
                        <div title={`${ms.title}\n${ms.start_date} → ${ms.end_date}\n${ms.current_value || 0}/${ms.target_value || 100}${ms.unit ? " " + ms.unit : ""} (${Math.round(Number(ms.progress) || 0)}%)\nClick to edit`}
                          onClick={() => editMilestone(ms)}
                          style={{ position: "absolute", ...bar, height: 22, borderRadius: 4, background: `${ms.color || "#6366f1"}40`, display: "flex", alignItems: "center", paddingLeft: 8, paddingRight: 8, cursor: "pointer", overflow: "hidden" }}>
                          {/* Progress fill */}
                          <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Number(ms.progress) || 0}%`, background: ms.color || "#6366f1", borderRadius: 4, transition: "width 0.3s" }} />
                          <span style={{ fontSize: 10, fontWeight: 600, color: "#fff", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", position: "relative", zIndex: 1 }}>{ms.title}</span>
                          {Number(ms.progress) > 0 && <span style={{ fontSize: 9, fontWeight: 700, color: "#fff", marginLeft: "auto", paddingLeft: 4, position: "relative", zIndex: 1, opacity: 0.9 }}>{Math.round(ms.progress)}%</span>}
                          <button onClick={e => { e.stopPropagation(); deleteMilestone(ms.id); }} style={{ position: "absolute", right: 2, top: 2, width: 14, height: 14, borderRadius: 7, border: "none", background: "rgba(0,0,0,0.3)", color: "#fff", fontSize: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0.5, zIndex: 2 }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.5}>×</button>
                        </div>
                      </div>
                    );
                  })}
                  {/* Add milestone button row */}
                  <div style={{ height: 20, position: "relative", zIndex: 1, paddingLeft: 8 }}>
                    <button onClick={() => setMsForm({ objectiveId: obj.id, title: "", start_date: "", end_date: "", color: MS_COLORS[milestones.filter(m => m.objective_id === obj.id).length % MS_COLORS.length] })}
                      style={{ fontSize: 9, color: T.text3, background: "none", border: "none", cursor: "pointer", padding: "2px 6px", borderRadius: 3, opacity: 0.5 }}
                      onMouseEnter={e => { e.currentTarget.style.opacity = 1; e.currentTarget.style.background = T.surface2; }}
                      onMouseLeave={e => { e.currentTarget.style.opacity = 0.5; e.currentTarget.style.background = "none"; }}>
                      + milestone
                    </button>
                  </div>
                  {/* Today line */}
                  {showToday && <div style={{ position: "absolute", left: `${todayPct}%`, top: 0, bottom: 0, width: 2, background: T.red, zIndex: 2, opacity: 0.6 }}><div style={{ position: "absolute", top: -2, left: -4, width: 10, height: 10, borderRadius: 10, background: T.red }} /></div>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // ============================
  // LIST VIEW (existing)
  // ============================
  const ListView = () => (
    <div style={{ flex: 1, overflow: "auto", padding: "20px 28px" }}>
      {objectives.length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: T.text3 }}>
          <div style={{ fontSize: 14, marginBottom: 8 }}>No objectives yet</div>
          <button onClick={createObjective} style={{ padding: "8px 18px", fontSize: 13, fontWeight: 600, borderRadius: 6, border: "none", background: T.accent, color: "#fff", cursor: "pointer" }}>Create your first objective</button>
        </div>
      )}
      {objectives.map((obj) => {
        const objKRs = keyResults.filter(k => k.objective_id === obj.id);
        const isExp = expanded.includes(obj.id);
        const pct = Number(obj.progress || 0);
        const h = HEALTH[obj.health] || HEALTH.on_track;
        return (
          <div key={obj.id} style={{ marginBottom: 16, background: T.surface, borderRadius: 14, border: `1px solid ${T.border}`, overflow: "hidden" }}>
            <div onClick={() => toggle(obj.id)} style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 20px", cursor: "pointer", userSelect: "none" }}>
              <svg width="10" height="10" viewBox="0 0 10 10" fill={T.text3} style={{ transition: "transform 0.2s", transform: isExp ? "rotate(0)" : "rotate(-90deg)", flexShrink: 0 }}>
                <path d="M2 3l3 3.5L8 3" fill="none" stroke={T.text3} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                  <span onClick={e => { e.stopPropagation(); editObjective(obj); }} style={{ fontSize: 15, fontWeight: 700, cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.textDecoration = "underline"} onMouseLeave={e => e.currentTarget.style.textDecoration = "none"}>{obj.title}</span>
                  <span onClick={e => e.stopPropagation()}><HealthPill obj={obj} onUpdate={updateHealth} /></span>
                  {/* Timeframe badge */}
                  <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: T.surface3, color: T.text3, fontWeight: 600 }}>
                    {TIMEFRAME_OPTIONS.find(o => o.value === (obj.timeframe || "quarter"))?.label || "Quarterly"}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12, color: T.text3 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Ava uid={obj.owner_id} sz={18} /> {uname(obj.owner_id)}</span>
                  <span>·</span><span>{objKRs.length} key results</span><span>·</span>
                  {obj.start_date && <span>{obj.start_date} → {obj.end_date || "TBD"}</span>}
                  {obj.start_date && <span>·</span>}
                  <button onClick={e => { e.stopPropagation(); createKeyResult(obj.id); }} style={{ background: "none", border: "none", color: T.accent, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>+ Add KR</button>
                  <button onClick={e => { e.stopPropagation(); deleteObjective(obj.id); }} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 11, fontWeight: 600 }}>Delete</button>
                </div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                <div style={{ width: 120, height: 6, borderRadius: 6, background: T.surface3, overflow: "hidden" }}>
                  <div style={{ width: `${pct}%`, height: "100%", borderRadius: 6, background: h.color, transition: "width 0.5s" }} />
                </div>
                <span style={{ fontSize: 14, fontWeight: 700, color: h.color, minWidth: 36, textAlign: "right" }}>{Math.round(pct)}%</span>
              </div>
            </div>
            {isExp && objKRs.length > 0 && (
              <div style={{ borderTop: `1px solid ${T.border}` }}>
                <div style={{ display: "grid", gridTemplateColumns: okrGrid, gap: 0, padding: "0 20px 0 48px", alignItems: "center", height: 28, fontSize: 10, fontWeight: 600, color: T.text3, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${T.border}`, background: T.bg }}>
                  <span style={{ position: "relative" }}>Key Result<ORH index={0} /></span><span style={{ position: "relative" }}>Progress<ORH index={1} /></span><span style={{ position: "relative" }}>Value<ORH index={2} /></span><span style={{ position: "relative" }}>Confidence<ORH index={3} /></span><span>Owner</span>
                </div>
                {objKRs.map(kr => {
                  const p = Number(kr.progress || 0); const sel = selectedKR === kr.id;
                  return (
                    <div key={kr.id} onClick={() => editKR(kr)} style={{ display: "grid", gridTemplateColumns: okrGrid, gap: 0, padding: "0 20px 0 48px", alignItems: "center", height: 42, cursor: "pointer", borderBottom: `1px solid ${T.border}`, background: sel ? `${T.accent}10` : "transparent", borderLeft: sel ? `3px solid ${T.accent}` : "3px solid transparent", transition: "background 0.1s" }}>
                      <span style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 12, display: "flex", alignItems: "center", gap: 6 }}>{kr.title}{kr.progress_mode === "milestones" && <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3, background: `${T.accent}20`, color: T.accent, fontWeight: 700, flexShrink: 0 }}>AUTO</span>}</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ flex: 1, height: 5, borderRadius: 5, background: T.surface3, overflow: "hidden" }}><div style={{ width: `${p}%`, height: "100%", borderRadius: 5, background: p >= 70 ? T.green : p >= 40 ? T.yellow : T.accent, transition: "width 0.3s" }} /></div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: p >= 70 ? T.green : p >= 40 ? T.yellow : T.text2, minWidth: 28 }}>{Math.round(p)}%</span>
                      </div>
                      <span style={{ fontSize: 12, color: T.text2 }}>{kr.current_value}/{kr.target_value}</span>
                      <ConfidenceDot value={kr.confidence} />
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <Ava uid={kr.owner_id} sz={22} />
                        <button onClick={e => { e.stopPropagation(); deleteKeyResult(kr.id); }} title="Delete" style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 12, padding: 0, lineHeight: 1, opacity: 0.4 }}>×</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
      {objectives.length > 0 && (
        <button onClick={createObjective} style={{ padding: "10px 18px", fontSize: 13, fontWeight: 600, borderRadius: 8, marginTop: 12, border: `1px dashed ${T.border}`, background: "transparent", color: T.text3, cursor: "pointer", width: "100%" }}>+ Add Objective</button>
      )}
    </div>
  );

  // Detail panel
  // Edit modal for objectives, KRs, milestones
  const _elbl = { fontSize: 12, fontWeight: 500, color: T.text3, display: "block", marginBottom: 4 };
  const _einp = { width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
  const editModal = editItem && (() => {
    const { type, data: d } = editItem;
    const typeLabel = type === "objective" ? "Objective" : type === "kr" ? "Key Result" : "Milestone";
    return (
      <div onClick={() => setEditItem(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div onClick={e => e.stopPropagation()} style={{ width: type === "milestone" ? 420 : 500, maxHeight: "80vh", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "16px 24px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Edit {typeLabel}</h3>
            <button onClick={() => setEditItem(null)} style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text3, cursor: "pointer", width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>×</button>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>
            {/* OBJECTIVE EDIT */}
            {type === "objective" && <>
              <div style={{ marginBottom: 12 }}><label style={_elbl}>Title</label><input value={d.title || ""} onChange={e => editSet("title", e.target.value)} autoFocus style={_einp} /></div>
              <div style={{ marginBottom: 12 }}><label style={_elbl}>Description</label><textarea value={d.description || ""} onChange={e => editSet("description", e.target.value)} rows={2} style={{ ..._einp, resize: "vertical" }} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div><label style={_elbl}>Owner</label><OwnerPicker profiles={profiles} value={d.owner_id || ""} onChange={v => editSet("owner_id", v)} /></div>
                <div><label style={_elbl}>Health</label>
                  <select value={d.health || "on_track"} onChange={e => editSet("health", e.target.value)} style={{ ..._einp, cursor: "pointer" }}>
                    {Object.entries(HEALTH).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <div><label style={_elbl}>Timeframe</label>
                  <select value={d.timeframe || "quarter"} onChange={e => editSet("timeframe", e.target.value)} style={{ ..._einp, cursor: "pointer" }}>
                    {TIMEFRAME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div><label style={_elbl}>Start Date</label><input type="date" value={d.start_date || ""} onChange={e => editSet("start_date", e.target.value)} style={_einp} /></div>
                <div><label style={_elbl}>End Date</label><input type="date" value={d.end_date || ""} onChange={e => editSet("end_date", e.target.value)} style={_einp} /></div>
              </div>
            </>}
            {/* KEY RESULT EDIT */}
            {type === "kr" && (() => {
              const mode = d.progress_mode || "manual";
              const linkedMS = milestones.filter(m => m.key_result_id === d.id);
              const autoProgress = linkedMS.length > 0 ? Math.round(linkedMS.reduce((s, m) => s + Number(m.progress || 0), 0) / linkedMS.length) : 0;
              const displayPct = mode === "milestones" ? autoProgress : (d.target_value > 0 ? Math.min(100, Math.round(((d.current_value || 0) / d.target_value) * 100)) : 0);
              return <>
              <div style={{ marginBottom: 12 }}><label style={_elbl}>Title</label><input value={d.title || ""} onChange={e => editSet("title", e.target.value)} autoFocus style={_einp} /></div>
              {/* Progress mode toggle */}
              <div style={{ marginBottom: 12, padding: "10px 14px", background: T.surface2, borderRadius: 8, border: `1px solid ${T.border}` }}>
                <label style={{ ..._elbl, marginBottom: 8 }}>Progress Mode</label>
                <div style={{ display: "flex", gap: 0, borderRadius: 6, overflow: "hidden", border: `1px solid ${T.border}` }}>
                  {[{ k: "manual", l: "Manual" }, { k: "milestones", l: "From Milestones" }].map(o => (
                    <button key={o.k} onClick={() => editSet("progress_mode", o.k)}
                      style={{ flex: 1, padding: "7px 0", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", background: mode === o.k ? T.accent : T.surface3, color: mode === o.k ? "#fff" : T.text3 }}>{o.l}</button>
                  ))}
                </div>
                {mode === "milestones" && <div style={{ marginTop: 8, fontSize: 11, color: T.text3 }}>
                  {linkedMS.length > 0 ? `${linkedMS.length} linked milestone${linkedMS.length > 1 ? "s" : ""} → ${autoProgress}% avg` : "No milestones linked yet — edit milestones and link them to this KR"}
                </div>}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div><label style={_elbl}>Current Value</label><input type="number" value={d.current_value ?? 0} onChange={e => editSet("current_value", e.target.value)} disabled={mode === "milestones"} style={{ ..._einp, opacity: mode === "milestones" ? 0.5 : 1 }} /></div>
                <div><label style={_elbl}>Target Value</label><input type="number" value={d.target_value ?? 100} onChange={e => editSet("target_value", e.target.value)} style={_einp} /></div>
                <div><label style={_elbl}>Unit</label><input value={d.unit || ""} onChange={e => editSet("unit", e.target.value)} placeholder="e.g. $, %" style={_einp} /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div><label style={_elbl}>Owner</label><OwnerPicker profiles={profiles} value={d.owner_id || ""} onChange={v => editSet("owner_id", v)} /></div>
                <div>
                  <label style={_elbl}>Progress</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                    <div style={{ flex: 1, height: 8, borderRadius: 8, background: T.surface3, overflow: "hidden" }}>
                      <div style={{ width: `${displayPct}%`, height: "100%", borderRadius: 8, background: T.accent, transition: "width 0.3s" }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: T.accent }}>{displayPct}%</span>
                  </div>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div><label style={_elbl}>Start Date</label><input type="date" value={d.start_date || ""} onChange={e => editSet("start_date", e.target.value)} style={_einp} /></div>
                <div><label style={_elbl}>End Date</label><input type="date" value={d.end_date || ""} onChange={e => editSet("end_date", e.target.value)} style={_einp} /></div>
              </div>
            </>;})()}
            {/* MILESTONE EDIT */}
            {type === "milestone" && (() => {
              const objKRs = keyResults.filter(k => k.objective_id === d.objective_id);
              const MS_STATUSES = [{ k: "not_started", l: "Not Started" }, { k: "in_progress", l: "In Progress" }, { k: "complete", l: "Complete" }, { k: "blocked", l: "Blocked" }];
              const cv = Number(d.current_value) || 0;
              const tv = Number(d.target_value) || 100;
              const autoPct = tv > 0 ? Math.min(100, Math.round((cv / tv) * 100)) : 0;
              return <>
              <div style={{ marginBottom: 12 }}><label style={_elbl}>Title</label><input value={d.title || ""} onChange={e => editSet("title", e.target.value)} autoFocus style={_einp} /></div>
              {/* Value-based progress */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div><label style={_elbl}>Current Value</label><input type="number" value={d.current_value ?? 0} onChange={e => {
                  const v = Number(e.target.value) || 0;
                  editSet("current_value", v);
                  const p = tv > 0 ? Math.min(100, Math.round((v / tv) * 100)) : 0;
                  editSet("progress", p);
                  if (p >= 100) editSet("status", "complete");
                  else if (p > 0) editSet("status", "in_progress");
                  else editSet("status", "not_started");
                }} style={_einp} /></div>
                <div><label style={_elbl}>Target Value</label><input type="number" value={d.target_value ?? 100} onChange={e => {
                  const t = Number(e.target.value) || 100;
                  editSet("target_value", t);
                  const p = t > 0 ? Math.min(100, Math.round((cv / t) * 100)) : 0;
                  editSet("progress", p);
                }} style={_einp} /></div>
                <div><label style={_elbl}>Unit</label><input value={d.unit || ""} onChange={e => editSet("unit", e.target.value)} placeholder="e.g. $, %, users" style={_einp} /></div>
              </div>
              {/* Progress bar + status */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div>
                  <label style={_elbl}>Progress</label>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                    <div style={{ flex: 1, height: 8, borderRadius: 8, background: T.surface3, overflow: "hidden" }}>
                      <div style={{ width: `${autoPct}%`, height: "100%", borderRadius: 8, background: autoPct >= 100 ? T.green : T.accent, transition: "width 0.3s" }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 700, color: autoPct >= 100 ? T.green : T.accent }}>{autoPct}%</span>
                  </div>
                </div>
                <div><label style={_elbl}>Status</label>
                  <select value={d.status || "not_started"} onChange={e => {
                    const s = e.target.value;
                    editSet("status", s);
                    if (s === "complete") { editSet("current_value", tv); editSet("progress", 100); }
                    else if (s === "not_started") { editSet("current_value", 0); editSet("progress", 0); }
                  }} style={{ ..._einp, cursor: "pointer" }}>
                    {MS_STATUSES.map(s => <option key={s.k} value={s.k}>{s.l}</option>)}
                  </select>
                </div>
              </div>
              {/* Linked KR */}
              <div style={{ marginBottom: 12 }}>
                <label style={_elbl}>Linked Key Result <span style={{ fontWeight: 400, color: T.text3 }}>(optional — rolls progress into KR)</span></label>
                <select value={d.key_result_id || ""} onChange={e => editSet("key_result_id", e.target.value || null)} style={{ ..._einp, cursor: "pointer" }}>
                  <option value="">None</option>
                  {objKRs.map(kr => <option key={kr.id} value={kr.id}>{kr.title}</option>)}
                </select>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div><label style={_elbl}>Start Date</label><input type="date" value={d.start_date || ""} onChange={e => editSet("start_date", e.target.value)} style={_einp} /></div>
                <div><label style={_elbl}>End Date</label><input type="date" value={d.end_date || ""} onChange={e => editSet("end_date", e.target.value)} style={_einp} /></div>
              </div>
              <div><label style={_elbl}>Color</label>
                <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
                  {MS_COLORS.map(c => <div key={c} onClick={() => editSet("color", c)} style={{ width: 24, height: 24, borderRadius: 6, background: c, cursor: "pointer", border: d.color === c ? "3px solid #fff" : "3px solid transparent", boxShadow: d.color === c ? `0 0 0 2px ${c}` : "none" }} />)}
                </div>
              </div>
            </>;})()}
          </div>
          <div style={{ padding: "14px 24px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => setEditItem(null)} style={{ padding: "9px 18px", borderRadius: 8, background: T.surface3, color: T.text2, border: "none", fontSize: 13, cursor: "pointer" }}>Cancel</button>
            <button onClick={saveEdit} style={{ padding: "9px 18px", borderRadius: 8, background: T.accent, color: "#fff", border: "none", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>Save</button>
          </div>
        </div>
      </div>
    );
  })();

  // Milestone form modal
  const MilestoneModal = () => { if (!msForm) return null; return (
    <div onClick={() => setMsForm(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 380, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 16px" }}>Add Milestone</h3>
        <div style={{ marginBottom: 12 }}><label style={{ fontSize: 12, fontWeight: 500, color: T.text3, display: "block", marginBottom: 4 }}>Title</label>
          <input value={msForm.title} onChange={e => setMsForm(p => ({ ...p, title: e.target.value }))} placeholder="e.g. Launch Australia GWP" autoFocus style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
        </div>
        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <div style={{ flex: 1 }}><label style={{ fontSize: 12, fontWeight: 500, color: T.text3, display: "block", marginBottom: 4 }}>Start</label><input type="date" value={msForm.start_date} onChange={e => setMsForm(p => ({ ...p, start_date: e.target.value }))} style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 12, outline: "none", boxSizing: "border-box" }} /></div>
          <div style={{ flex: 1 }}><label style={{ fontSize: 12, fontWeight: 500, color: T.text3, display: "block", marginBottom: 4 }}>End</label><input type="date" value={msForm.end_date} onChange={e => setMsForm(p => ({ ...p, end_date: e.target.value }))} style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 12, outline: "none", boxSizing: "border-box" }} /></div>
        </div>
        <div style={{ marginBottom: 16 }}><label style={{ fontSize: 12, fontWeight: 500, color: T.text3, display: "block", marginBottom: 6 }}>Color</label><div style={{ display: "flex", gap: 6 }}>{MS_COLORS.map(c => <div key={c} onClick={() => setMsForm(p => ({ ...p, color: c }))} style={{ width: 24, height: 24, borderRadius: 12, background: c, cursor: "pointer", border: msForm.color === c ? "3px solid #fff" : "3px solid transparent", boxShadow: msForm.color === c ? `0 0 0 2px ${c}` : "none" }} />)}</div></div>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={() => setMsForm(null)} style={{ padding: "8px 16px", borderRadius: 6, background: T.surface3, color: T.text2, border: "none", fontSize: 13, cursor: "pointer" }}>Cancel</button>
          <button onClick={saveMilestone} style={{ padding: "8px 16px", borderRadius: 6, background: T.accent, color: "#fff", border: "none", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>Add</button>
        </div>
      </div>
    </div>); };

  // Header

  const objFormModal = objForm && (
    <ObjFormModalInner
      objForm={objForm}
      setObjForm={setObjForm}
      saveObjective={saveObjective}
      profiles={profiles}
    />
  );

  const header = (
    <div style={{ padding: "24px 28px 0", borderBottom: `1px solid ${T.border}`, background: T.surface }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18 }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Objectives &amp; Key Results</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12 }}>
            <select value={activeCycle || ""} onChange={e => setActiveCycle(e.target.value)} style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, padding: "4px 8px", fontSize: 12, cursor: "pointer", outline: "none", fontFamily: "inherit" }}>
              {cycles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {cycle && <span style={{ color: T.text3 }}>{daysLeft} days remaining</span>}
            <button onClick={createObjective} style={{ padding: "4px 12px", borderRadius: 5, border: `1px solid ${T.accent}40`, background: `${T.accent}10`, color: T.accent, fontSize: 11, cursor: "pointer", fontWeight: 600 }}>+ Objective</button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <div style={{ position: "relative", width: 52, height: 52 }}>
            <svg width={52} height={52} style={{ transform: "rotate(-90deg)" }}><circle cx={26} cy={26} r={22} fill="none" stroke={T.surface3} strokeWidth={4} /><circle cx={26} cy={26} r={22} fill="none" stroke={T.accent} strokeWidth={4} strokeDasharray={`${overallProgress * 1.38} 200`} strokeLinecap="round" style={{ transition: "stroke-dasharray 0.6s ease" }} /></svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: T.accent }}>{overallProgress}%</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}><span style={{ width: 8, height: 8, borderRadius: 8, background: T.green }} /><span style={{ color: T.text2 }}>{onTrackCount} on track</span></div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}><span style={{ width: 8, height: 8, borderRadius: 8, background: T.yellow }} /><span style={{ color: T.text2 }}>{atRiskCount} need attention</span></div>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 0 }}>
        {[{ key: "list", label: "Objectives", icon: "≡" }, { key: "roadmap", label: "Roadmap", icon: "▬" }].map(t => (
          <button key={t.key} onClick={() => setView(t.key)} style={{ padding: "9px 16px", fontSize: 13, fontWeight: 500, color: viewMode === t.key ? T.text : T.text3, borderBottom: viewMode === t.key ? `2px solid ${T.accent}` : "2px solid transparent", cursor: "pointer", background: "none", border: "none", borderBottomWidth: 2, borderBottomStyle: "solid", display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 14 }}>{t.icon}</span>{t.label}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {header}
        {viewMode === "list" ? <ListView /> : <RoadmapView />}
      </div>
      {editModal}
      <MilestoneModal />
      {objFormModal}
    </div>
  );
}

function PanelField({ label, children }) {
  return (<div style={{ display: "grid", gridTemplateColumns: "100px 1fr", padding: "10px 0", borderBottom: `1px solid ${T.border}`, alignItems: "center" }}><span style={{ fontSize: 12, color: T.text3 }}>{label}</span><div style={{ fontSize: 13, color: T.text }}>{children}</div></div>);
}

function HealthPill({ obj, onUpdate }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const H = { on_track: { label: "On Track", color: "#22c55e", bg: "#0d3a20" }, at_risk: { label: "At Risk", color: "#eab308", bg: "#3d3000" }, off_track: { label: "Off Track", color: "#ef4444", bg: "#3d1111" } };
  const h = H[obj.health] || H.on_track;
  useEffect(() => { if (!open) return; const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener("mousedown", fn); return () => document.removeEventListener("mousedown", fn); }, [open]);
  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div onClick={(e) => { e.stopPropagation(); setOpen(!open); }} style={{ display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: "pointer", background: h.bg, color: h.color, border: open ? `1px solid ${h.color}` : "1px solid transparent" }}>{h.label}</div>
      {open && (<div style={{ position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 100, background: "#1a1f2e", border: `1px solid ${T.border2}`, borderRadius: 8, padding: 4, minWidth: 120, boxShadow: "0 8px 24px rgba(0,0,0,0.4)" }}>
        {Object.entries(H).map(([k, v]) => (<div key={k} onClick={(e) => { e.stopPropagation(); onUpdate(obj.id, k); setOpen(false); }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 4, cursor: "pointer", fontSize: 12, color: v.color, transition: "background 0.1s" }} onMouseEnter={e => e.currentTarget.style.background = T.surface3} onMouseLeave={e => e.currentTarget.style.background = "transparent"}><span style={{ width: 8, height: 8, borderRadius: 2, background: v.color }} />{v.label}</div>))}
      </div>)}
    </div>
  );
}

const _lbl = { fontSize: 12, fontWeight: 500, color: T.text3, display: "block", marginBottom: 4 };
const _inp = { width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };

function OwnerPicker({ profiles, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef(null);
  const profList = Object.values(profiles || {});
  const sel = profiles?.[value];
  const filtered = profList.filter(u => !q || u.display_name?.toLowerCase().includes(q.toLowerCase()));
  const ini = (uid) => { const u = profiles?.[uid]; return u?.display_name ? u.display_name.split(" ").map(w => w[0]).join("").slice(0,2).toUpperCase() : "?"; };

  useEffect(() => {
    if (!open) return;
    const fn = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div onClick={() => setOpen(!open)} style={{ ..._inp, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, minHeight: 36 }}>
        {sel ? <><div style={{ width: 20, height: 20, borderRadius: 10, background: `${acol(value)}18`, border: `1.5px solid ${acol(value)}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: acol(value) }}>{ini(value)}</div><span style={{ fontSize: 12 }}>{sel.display_name}</span></> : <span style={{ color: T.text3, fontSize: 12 }}>Select owner…</span>}
      </div>
      {open && <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, zIndex: 50, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.3)", overflow: "hidden" }}>
        <div style={{ padding: 6, borderBottom: `1px solid ${T.border}` }}>
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…" autoFocus
            style={{ ..._inp, padding: "6px 8px", fontSize: 11 }}
            onClick={e => e.stopPropagation()} />
        </div>
        <div style={{ maxHeight: 160, overflow: "auto" }}>
          {value && <div onClick={() => { onChange(""); setOpen(false); }} style={{ padding: "6px 10px", fontSize: 11, color: T.text3, cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.background = T.surface2} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>Clear</div>}
          {filtered.map(u => { const c = acol(u.id); return (
            <div key={u.id} onClick={() => { onChange(u.id); setOpen(false); setQ(""); }}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", cursor: "pointer", background: u.id === value ? T.accentDim : "transparent" }}
              onMouseEnter={e => { if (u.id !== value) e.currentTarget.style.background = T.surface2; }}
              onMouseLeave={e => { e.currentTarget.style.background = u.id === value ? T.accentDim : "transparent"; }}>
              <div style={{ width: 22, height: 22, borderRadius: 11, background: `${c}18`, border: `1.5px solid ${c}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: c }}>{ini(u.id)}</div>
              <div style={{ fontSize: 12, fontWeight: 500 }}>{u.display_name}</div>
            </div>); })}
        </div>
      </div>}
    </div>
  );
}

function ObjFormModalInner({ objForm, setObjForm, saveObjective, profiles }) {
  const set = useCallback((k, v) => setObjForm(p => ({ ...p, [k]: v })), [setObjForm]);
  const setKR = useCallback((idx, k, v) => setObjForm(p => ({ ...p, keyResults: p.keyResults.map((kr, i) => i === idx ? { ...kr, [k]: v } : kr) })), [setObjForm]);
  const addKR = useCallback(() => setObjForm(p => ({ ...p, keyResults: [...p.keyResults, { title: "", target_value: 100, unit: "", owner_id: "", start_date: "", end_date: "" }] })), [setObjForm]);
  const removeKR = useCallback((idx) => setObjForm(p => ({ ...p, keyResults: p.keyResults.filter((_, i) => i !== idx) })), [setObjForm]);
  const cloneKR = useCallback((idx) => setObjForm(p => {
    const src = p.keyResults[idx];
    const copy = { ...src, title: src.title ? src.title + " (copy)" : "" };
    const kr = [...p.keyResults];
    kr.splice(idx + 1, 0, copy);
    return { ...p, keyResults: kr };
  }), [setObjForm]);
  const setMS = useCallback((idx, k, v) => setObjForm(p => ({ ...p, milestones: p.milestones.map((m, i) => i === idx ? { ...m, [k]: v } : m) })), [setObjForm]);
  const addMS = useCallback(() => setObjForm(p => ({ ...p, milestones: [...(p.milestones || []), { title: "", start_date: "", end_date: "", color: MS_COLORS[(p.milestones || []).length % MS_COLORS.length], progress: 0, status: "not_started", target_value: 100, unit: "" }] })), [setObjForm]);
  const removeMS = useCallback((idx) => setObjForm(p => ({ ...p, milestones: p.milestones.filter((_, i) => i !== idx) })), [setObjForm]);
  const cloneMS = useCallback((idx) => setObjForm(p => {
    const src = p.milestones[idx];
    const copy = { ...src, title: src.title ? src.title + " (copy)" : "" };
    const ms = [...p.milestones];
    ms.splice(idx + 1, 0, copy);
    return { ...p, milestones: ms };
  }), [setObjForm]);
  const f = objForm;

  return (
    <div onClick={() => setObjForm(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 560, maxHeight: "85vh", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "18px 24px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>New Objective</h3>
          <button onClick={() => setObjForm(null)} style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text3, cursor: "pointer", width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>×</button>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>
          <div style={{ marginBottom: 14 }}><label style={_lbl}>Objective Title *</label>
            <input value={f.title} onChange={e => set("title", e.target.value)} placeholder="e.g. Win and Lead the Category at Mass Retail" autoFocus style={_inp} />
          </div>
          <div style={{ marginBottom: 14 }}><label style={_lbl}>Description</label>
            <textarea value={f.description} onChange={e => set("description", e.target.value)} rows={2} placeholder="Optional context or details" style={{ ..._inp, resize: "vertical", minHeight: 48 }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div><label style={_lbl}>Owner</label><OwnerPicker profiles={profiles} value={f.owner_id} onChange={v => set("owner_id", v)} /></div>
            <div><label style={_lbl}>Health</label>
              <select value={f.health} onChange={e => set("health", e.target.value)} style={{ ..._inp, cursor: "pointer" }}>
                {Object.entries(HEALTH).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 14 }}>
            <div><label style={_lbl}>Timeframe</label>
              <select value={f.timeframe} onChange={e => set("timeframe", e.target.value)} style={{ ..._inp, cursor: "pointer" }}>
                {TIMEFRAME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div><label style={_lbl}>Start Date</label><input type="date" value={f.start_date} onChange={e => set("start_date", e.target.value)} style={_inp} /></div>
            <div><label style={_lbl}>End Date</label><input type="date" value={f.end_date} onChange={e => set("end_date", e.target.value)} style={_inp} /></div>
          </div>
          <div style={{ borderTop: `1px solid ${T.border}`, margin: "18px 0", paddingTop: 18 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>Key Results</span>
              <button onClick={addKR} style={{ padding: "4px 12px", borderRadius: 5, border: `1px solid ${T.accent}40`, background: `${T.accent}10`, color: T.accent, fontSize: 11, cursor: "pointer", fontWeight: 600 }}>+ Add KR</button>
            </div>
            {f.keyResults.map((kr, idx) => (
              <div key={idx} style={{ padding: "12px 14px", background: T.surface2, borderRadius: 10, border: `1px solid ${T.border}`, marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: T.text3 }}>KR {idx + 1}</span>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => cloneKR(idx)} title="Clone KR" style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 10, padding: "2px 6px", borderRadius: 4, fontWeight: 600 }} onMouseEnter={e => { e.currentTarget.style.background = T.surface3; e.currentTarget.style.color = T.accent; }} onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = T.text3; }}>⧉ Clone</button>
                    {f.keyResults.length > 1 && <button onClick={() => removeKR(idx)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 13, padding: 0 }}>×</button>}
                  </div>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <input value={kr.title} onChange={e => setKR(idx, "title", e.target.value)} placeholder="e.g. $10M Net Revenue @ 40% Margin" style={{ ..._inp, fontSize: 12 }} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
                  <div><label style={{ ..._lbl, fontSize: 10 }}>Target Value</label><input type="number" value={kr.target_value} onChange={e => setKR(idx, "target_value", e.target.value)} style={{ ..._inp, fontSize: 12 }} /></div>
                  <div><label style={{ ..._lbl, fontSize: 10 }}>Unit</label><input value={kr.unit} onChange={e => setKR(idx, "unit", e.target.value)} placeholder="e.g. $, %, users" style={{ ..._inp, fontSize: 12 }} /></div>
                  <div><label style={{ ..._lbl, fontSize: 10 }}>KR Owner</label><OwnerPicker profiles={profiles} value={kr.owner_id} onChange={v => setKR(idx, "owner_id", v)} /></div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div><label style={{ ..._lbl, fontSize: 10 }}>Start Date</label><input type="date" value={kr.start_date || ""} onChange={e => setKR(idx, "start_date", e.target.value)} style={{ ..._inp, fontSize: 12 }} /></div>
                  <div><label style={{ ..._lbl, fontSize: 10 }}>End Date</label><input type="date" value={kr.end_date || ""} onChange={e => setKR(idx, "end_date", e.target.value)} style={{ ..._inp, fontSize: 12 }} /></div>
                </div>
              </div>
            ))}
          </div>
          {/* Milestones section */}
          <div style={{ borderTop: `1px solid ${T.border}`, margin: "18px 0", paddingTop: 18 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 14, fontWeight: 700 }}>Milestones</span>
                <span style={{ fontSize: 10, color: T.text3 }}>Timeline bars on roadmap</span>
              </div>
              <button onClick={addMS} style={{ padding: "4px 12px", borderRadius: 5, border: `1px solid ${T.accent}40`, background: `${T.accent}10`, color: T.accent, fontSize: 11, cursor: "pointer", fontWeight: 600 }}>+ Add Milestone</button>
            </div>
            {(f.milestones || []).map((ms, idx) => (
              <div key={idx} style={{ padding: "10px 14px", background: T.surface2, borderRadius: 10, border: `1px solid ${T.border}`, marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 14, height: 14, borderRadius: 3, background: ms.color || MS_COLORS[0], flexShrink: 0 }} />
                    <span style={{ fontSize: 11, fontWeight: 600, color: T.text3 }}>Milestone {idx + 1}</span>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => cloneMS(idx)} title="Clone Milestone" style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 10, padding: "2px 6px", borderRadius: 4, fontWeight: 600 }} onMouseEnter={e => { e.currentTarget.style.background = T.surface3; e.currentTarget.style.color = T.accent; }} onMouseLeave={e => { e.currentTarget.style.background = "none"; e.currentTarget.style.color = T.text3; }}>⧉ Clone</button>
                    <button onClick={() => removeMS(idx)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 13, padding: 0 }}>×</button>
                  </div>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <input value={ms.title} onChange={e => setMS(idx, "title", e.target.value)} placeholder="e.g. Launch Australia & UK GWP" style={{ ..._inp, fontSize: 12 }} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                  <div><label style={{ ..._lbl, fontSize: 10 }}>Target Value</label><input type="number" value={ms.target_value ?? 100} onChange={e => setMS(idx, "target_value", e.target.value)} style={{ ..._inp, fontSize: 12 }} /></div>
                  <div><label style={{ ..._lbl, fontSize: 10 }}>Unit</label><input value={ms.unit || ""} onChange={e => setMS(idx, "unit", e.target.value)} placeholder="e.g. $, %, users" style={{ ..._inp, fontSize: 12 }} /></div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 80px", gap: 8 }}>
                  <div><label style={{ ..._lbl, fontSize: 10 }}>Start Date</label><input type="date" value={ms.start_date || ""} onChange={e => setMS(idx, "start_date", e.target.value)} style={{ ..._inp, fontSize: 12 }} /></div>
                  <div><label style={{ ..._lbl, fontSize: 10 }}>End Date</label><input type="date" value={ms.end_date || ""} onChange={e => setMS(idx, "end_date", e.target.value)} style={{ ..._inp, fontSize: 12 }} /></div>
                  <div><label style={{ ..._lbl, fontSize: 10 }}>Color</label>
                    <div style={{ display: "flex", gap: 3, flexWrap: "wrap", paddingTop: 2 }}>
                      {MS_COLORS.map(c => <div key={c} onClick={() => setMS(idx, "color", c)} style={{ width: 16, height: 16, borderRadius: 4, background: c, cursor: "pointer", border: ms.color === c ? "2px solid #fff" : "2px solid transparent", boxShadow: ms.color === c ? `0 0 0 1px ${c}` : "none" }} />)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {(f.milestones || []).length === 0 && <div style={{ fontSize: 11, color: T.text3, fontStyle: "italic", padding: "4px 0" }}>No milestones — add some to see them on the roadmap timeline</div>}
          </div>
        </div>
        <div style={{ padding: "14px 24px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 8, justifyContent: "flex-end" }}>
          <button onClick={() => setObjForm(null)} style={{ padding: "9px 18px", borderRadius: 8, background: T.surface3, color: T.text2, border: "none", fontSize: 13, cursor: "pointer" }}>Cancel</button>
          <button onClick={saveObjective} disabled={!f.title.trim()} style={{ padding: "9px 18px", borderRadius: 8, background: f.title.trim() ? T.accent : T.surface3, color: f.title.trim() ? "#fff" : T.text3, border: "none", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>Create Objective</button>
        </div>
      </div>
    </div>
  );
}
