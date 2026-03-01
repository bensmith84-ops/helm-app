"use client";
import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";

const HEALTH = {
  on_track:  { label: "On Track",  color: "#22c55e", bg: "#0d3a20" },
  at_risk:   { label: "At Risk",   color: "#eab308", bg: "#3d3000" },
  off_track: { label: "Off Track", color: "#ef4444", bg: "#3d1111" },
};
const AVATAR_COLORS = ["#3b82f6","#a855f7","#ec4899","#06b6d4","#f97316","#22c55e","#84cc16","#ef4444"];
const acol = (uid) => uid ? AVATAR_COLORS[uid.charCodeAt(uid.length - 1) % AVATAR_COLORS.length] : T.text3;

export default function OKRsView() {
  const [cycles, setCycles] = useState([]);
  const [activeCycle, setActiveCycle] = useState(null);
  const [objectives, setObjectives] = useState([]);
  const [keyResults, setKeyResults] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [expanded, setExpanded] = useState([]);
  const [selectedKR, setSelectedKR] = useState(null);
  const [loading, setLoading] = useState(true);

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
      const [{ data: obj }, { data: kr }] = await Promise.all([
        supabase.from("objectives").select("*").eq("cycle_id", activeCycle).is("deleted_at", null).order("sort_order"),
        supabase.from("key_results").select("*").is("deleted_at", null).order("sort_order"),
      ]);
      setObjectives(obj || []);
      const filteredKR = (kr || []).filter(k => (obj || []).some(o => o.id === k.objective_id));
      setKeyResults(filteredKR);
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

  if (loading) return <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: T.text3, fontSize: 13 }}>Loading OKRs…</div>;

  const cycle = cycles.find(c => c.id === activeCycle);
  const overallProgress = objectives.length > 0 ? Math.round(objectives.reduce((s, o) => s + Number(o.progress || 0), 0) / objectives.length) : 0;
  const onTrackCount = objectives.filter(o => o.health === "on_track").length;
  const atRiskCount = objectives.filter(o => o.health === "at_risk" || o.health === "off_track").length;
  const daysLeft = cycle ? Math.max(0, Math.ceil((new Date(cycle.end_date) - new Date()) / 86400000)) : 0;

  const Ava = ({ uid, sz = 24 }) => {
    if (!uid) return <div style={{ width: sz, height: sz }} />;
    const c = acol(uid);
    return (
      <div title={uname(uid)} style={{
        width: sz, height: sz, borderRadius: "50%",
        background: `${c}18`, border: `1.5px solid ${c}50`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: Math.max(sz * 0.38, 9), fontWeight: 700, color: c, flexShrink: 0,
      }}>{ini(uid)}</div>
    );
  };

  const ConfidenceDot = ({ value }) => {
    const pct = Number(value || 0) * 100;
    const color = pct >= 70 ? T.green : pct >= 40 ? T.yellow : T.red;
    return (
      <div title={`${Math.round(pct)}% confidence`} style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <div style={{ width: 8, height: 8, borderRadius: 8, background: color }} />
        <span style={{ fontSize: 11, color: T.text3 }}>{Math.round(pct)}%</span>
      </div>
    );
  };

  const header = (
    <div style={{ padding: "24px 28px 0", borderBottom: `1px solid ${T.border}`, background: T.surface }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 18 }}>
        <div style={{ flex: 1 }}>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>Objectives &amp; Key Results</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12 }}>
            <select value={activeCycle || ""} onChange={e => setActiveCycle(e.target.value)}
              style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, padding: "4px 8px", fontSize: 12, cursor: "pointer", outline: "none", fontFamily: "inherit" }}>
              {cycles.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            {cycle && <span style={{ color: T.text3 }}>{daysLeft} days remaining</span>}
          </div>
        </div>
        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <div style={{ position: "relative", width: 52, height: 52 }}>
            <svg width={52} height={52} style={{ transform: "rotate(-90deg)" }}>
              <circle cx={26} cy={26} r={22} fill="none" stroke={T.surface3} strokeWidth={4} />
              <circle cx={26} cy={26} r={22} fill="none" stroke={T.accent} strokeWidth={4}
                strokeDasharray={`${overallProgress * 1.38} 200`} strokeLinecap="round"
                style={{ transition: "stroke-dasharray 0.6s ease" }} />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: T.accent }}>{overallProgress}%</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <span style={{ width: 8, height: 8, borderRadius: 8, background: T.green }} />
              <span style={{ color: T.text2 }}>{onTrackCount} on track</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
              <span style={{ width: 8, height: 8, borderRadius: 8, background: T.yellow }} />
              <span style={{ color: T.text2 }}>{atRiskCount} need attention</span>
            </div>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: 0 }}>
        <div style={{ padding: "9px 16px", fontSize: 13, fontWeight: 500, color: T.text, borderBottom: `2px solid ${T.accent}`, cursor: "pointer" }}>All Objectives</div>
      </div>
    </div>
  );

  const detail = selectedKR && (() => {
    const kr = keyResults.find(k => k.id === selectedKR);
    if (!kr) return null;
    const obj = objectives.find(o => o.id === kr.objective_id);
    const pct = Number(kr.progress || 0);
    const conf = Number(kr.confidence || 0) * 100;
    const confColor = conf >= 70 ? T.green : conf >= 40 ? T.yellow : T.red;
    return (
      <div style={{ width: 380, borderLeft: `1px solid ${T.border}`, display: "flex", flexDirection: "column", background: T.surface, flexShrink: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px", borderBottom: `1px solid ${T.border}` }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: T.text3 }}>Key Result</span>
          <button onClick={() => setSelectedKR(null)} style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text3, cursor: "pointer", width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8" stroke={T.text3} strokeWidth="1.5" strokeLinecap="round"/></svg>
          </button>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>
          <h3 style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.3, marginBottom: 8 }}>{kr.title}</h3>
          {obj && <div style={{ fontSize: 12, color: T.text3, marginBottom: 20 }}>Part of: {obj.title}</div>}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 12, color: T.text3 }}>Progress</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: pct >= 70 ? T.green : pct >= 40 ? T.yellow : T.text2 }}>{Math.round(pct)}%</span>
            </div>
            <div style={{ height: 8, borderRadius: 8, background: T.surface3, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", borderRadius: 8, background: pct >= 70 ? T.green : pct >= 40 ? T.yellow : T.accent, transition: "width 0.5s" }} />
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <PanelField label="Owner"><div style={{ display: "flex", alignItems: "center", gap: 8 }}><Ava uid={kr.owner_id} sz={22} /><span style={{ fontSize: 13 }}>{uname(kr.owner_id)}</span></div></PanelField>
            <PanelField label="Current">{kr.current_value} / {kr.target_value} {kr.unit}</PanelField>
            <PanelField label="Start">{kr.start_value} {kr.unit}</PanelField>
            <PanelField label="Confidence">
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 8, height: 8, borderRadius: 8, background: confColor }} />
                <span style={{ fontSize: 13, color: confColor, fontWeight: 600 }}>{Math.round(conf)}%</span>
              </div>
            </PanelField>
          </div>
          <div style={{ marginTop: 24, padding: 16, background: T.surface2, borderRadius: 10, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Update Progress</div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <input type="number" defaultValue={kr.current_value}
                onKeyDown={e => { if (e.key === "Enter") updateKRValue(kr.id, Number(e.target.value)); }}
                style={{ flex: 1, padding: "8px 12px", background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, fontSize: 13, outline: "none", fontFamily: "inherit" }}
              />
              <span style={{ fontSize: 12, color: T.text3 }}>/ {kr.target_value} {kr.unit}</span>
            </div>
            <div style={{ fontSize: 11, color: T.text3, marginTop: 6 }}>Press Enter to save</div>
          </div>
        </div>
      </div>
    );
  })();

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {header}
        <div style={{ flex: 1, overflow: "auto", padding: "20px 28px" }}>
          {objectives.map((obj) => {
            const objKRs = keyResults.filter(k => k.objective_id === obj.id);
            const isExp = expanded.includes(obj.id);
            const pct = Number(obj.progress || 0);
            const h = HEALTH[obj.health] || HEALTH.on_track;
            return (
              <div key={obj.id} style={{ marginBottom: 16, background: T.surface, borderRadius: 14, border: `1px solid ${T.border}`, overflow: "hidden" }}>
                <div onClick={() => toggle(obj.id)} style={{ display: "flex", alignItems: "center", gap: 14, padding: "16px 20px", cursor: "pointer", userSelect: "none" }}>
                  <svg width="10" height="10" viewBox="0 0 10 10" fill={T.text3}
                    style={{ transition: "transform 0.2s", transform: isExp ? "rotate(0)" : "rotate(-90deg)", flexShrink: 0 }}>
                    <path d="M2 3l3 3.5L8 3" fill="none" stroke={T.text3} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                      <span style={{ fontSize: 15, fontWeight: 700 }}>{obj.title}</span>
                      <span onClick={e => e.stopPropagation()}>
                        <HealthPill obj={obj} onUpdate={updateHealth} />
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 12, color: T.text3 }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 4 }}><Ava uid={obj.owner_id} sz={18} /> {uname(obj.owner_id)}</span>
                      <span>·</span>
                      <span>{objKRs.length} key results</span>
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
                    <div style={{
                      display: "grid", gridTemplateColumns: "1fr 160px 80px 80px 60px",
                      gap: 0, padding: "0 20px 0 48px", alignItems: "center", height: 28,
                      fontSize: 10, fontWeight: 600, color: T.text3, textTransform: "uppercase", letterSpacing: "0.06em",
                      borderBottom: `1px solid ${T.border}`, background: T.bg,
                    }}>
                      <span>Key Result</span><span>Progress</span><span>Value</span><span>Confidence</span><span>Owner</span>
                    </div>
                    {objKRs.map(kr => {
                      const p = Number(kr.progress || 0);
                      const sel = selectedKR === kr.id;
                      return (
                        <div key={kr.id} onClick={() => setSelectedKR(kr.id)} style={{
                          display: "grid", gridTemplateColumns: "1fr 160px 80px 80px 60px",
                          gap: 0, padding: "0 20px 0 48px", alignItems: "center", height: 42,
                          cursor: "pointer", borderBottom: `1px solid ${T.border}`,
                          background: sel ? `${T.accent}10` : "transparent",
                          borderLeft: sel ? `3px solid ${T.accent}` : "3px solid transparent",
                          transition: "background 0.1s",
                        }}>
                          <span style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", paddingRight: 12 }}>{kr.title}</span>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <div style={{ flex: 1, height: 5, borderRadius: 5, background: T.surface3, overflow: "hidden" }}>
                              <div style={{ width: `${p}%`, height: "100%", borderRadius: 5, background: p >= 70 ? T.green : p >= 40 ? T.yellow : T.accent, transition: "width 0.3s" }} />
                            </div>
                            <span style={{ fontSize: 11, fontWeight: 600, color: p >= 70 ? T.green : p >= 40 ? T.yellow : T.text2, minWidth: 28 }}>{Math.round(p)}%</span>
                          </div>
                          <span style={{ fontSize: 12, color: T.text2 }}>{kr.current_value}/{kr.target_value}</span>
                          <ConfidenceDot value={kr.confidence} />
                          <Ava uid={kr.owner_id} sz={22} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {objectives.length === 0 && (
            <div style={{ textAlign: "center", padding: 60, color: T.text3, fontSize: 14 }}>No objectives found for this cycle.</div>
          )}
        </div>
      </div>
      {detail}
    </div>
  );
}

function PanelField({ label, children }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", padding: "10px 0", borderBottom: `1px solid ${T.border}`, alignItems: "center" }}>
      <span style={{ fontSize: 12, color: T.text3 }}>{label}</span>
      <div style={{ fontSize: 13, color: T.text }}>{children}</div>
    </div>
  );
}

function HealthPill({ obj, onUpdate }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const H = {
    on_track:  { label: "On Track",  color: "#22c55e", bg: "#0d3a20" },
    at_risk:   { label: "At Risk",   color: "#eab308", bg: "#3d3000" },
    off_track: { label: "Off Track", color: "#ef4444", bg: "#3d1111" },
  };
  const h = H[obj.health] || H.on_track;

  useEffect(() => {
    if (!open) return;
    const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div onClick={(e) => { e.stopPropagation(); setOpen(!open); }} style={{
        display: "inline-flex", alignItems: "center", padding: "2px 8px", borderRadius: 4,
        fontSize: 10, fontWeight: 700, cursor: "pointer",
        background: h.bg, color: h.color, border: open ? `1px solid ${h.color}` : "1px solid transparent",
      }}>{h.label}</div>
      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 0, marginTop: 4, zIndex: 100,
          background: "#1a1f2e", border: `1px solid ${T.border2}`, borderRadius: 8,
          padding: 4, minWidth: 120, boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        }}>
          {Object.entries(H).map(([k, v]) => (
            <div key={k} onClick={(e) => { e.stopPropagation(); onUpdate(obj.id, k); setOpen(false); }}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 4, cursor: "pointer", fontSize: 12, color: v.color, transition: "background 0.1s" }}
              onMouseEnter={e => e.currentTarget.style.background = T.surface3}
              onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: v.color }} />
              {v.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
