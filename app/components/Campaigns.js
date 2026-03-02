"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";
import { useAuth } from "../lib/auth";
import { useModal } from "../lib/modal";

const STATUS_CFG = {
  draft: { label: "Draft", color: "#eab308", bg: "#3d3000" },
  active: { label: "Active", color: "#22c55e", bg: "#0d3a20" },
  paused: { label: "Paused", color: "#f97316", bg: "#3d2000" },
  completed: { label: "Completed", color: "#3b82f6", bg: "#172554" },
  cancelled: { label: "Cancelled", color: "#ef4444", bg: "#3d1111" },
};
const CHANNELS = ["email", "social", "paid_ads", "content", "seo", "events"];

export default function CampaignsView() {
  const { user, profile } = useAuth();
  const { showPrompt, showConfirm } = useModal();
  const [campaigns, setCampaigns] = useState([]);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("campaigns").select("*").is("deleted_at", null).order("created_at", { ascending: false });
      setCampaigns(data || []);
      setLoading(false);
    })();
  }, []);

  const createCampaign = async () => {
    const name = await showPrompt("New Campaign", "Campaign name");
    if (!name?.trim()) return;
    const { data } = await supabase.from("campaigns").insert({
      org_id: profile?.org_id, name: name.trim(), status: "draft",
    }).select().single();
    if (data) { setCampaigns(p => [data, ...p]); setSelected(data); }
  };

  const updateCampaign = async (id, updates) => {
    const ts = { ...updates, updated_at: new Date().toISOString() };
    setCampaigns(p => p.map(c => c.id === id ? { ...c, ...ts } : c));
    if (selected?.id === id) setSelected(p => ({ ...p, ...ts }));
    await supabase.from("campaigns").update(ts).eq("id", id);
  };

  const deleteCampaign = async (id) => {
    if (!(await showConfirm("Delete Campaign", "Are you sure you want to delete this campaign?"))) return;
    setCampaigns(p => p.filter(c => c.id !== id));
    if (selected?.id === id) setSelected(null);
    await supabase.from("campaigns").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  };

  const filtered = filter === "all" ? campaigns : campaigns.filter(c => c.status === filter);
  const totalBudget = campaigns.reduce((s, c) => s + Number(c.budget || 0), 0);
  const totalSpent = campaigns.reduce((s, c) => s + Number(c.spent || 0), 0);

  if (loading) return <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: T.text3, fontSize: 13 }}>Loading campaigns…</div>;

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <div style={{ flex: 1, overflow: "auto", padding: "28px 32px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Campaigns</h1>
            <p style={{ fontSize: 12, color: T.text3 }}>{campaigns.length} campaigns · ${totalSpent.toLocaleString()} / ${totalBudget.toLocaleString()} budget</p>
          </div>
          <button onClick={createCampaign} style={{ padding: "8px 16px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "none", background: T.accent, color: "#fff", cursor: "pointer" }}>+ New Campaign</button>
        </div>

        <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
          {["all", ...Object.keys(STATUS_CFG)].map(f => (
            <button key={f} onClick={() => setFilter(f)} style={{
              padding: "5px 12px", fontSize: 11, fontWeight: 600, borderRadius: 6, cursor: "pointer",
              background: filter === f ? `${T.accent}20` : T.surface2, color: filter === f ? T.accent : T.text3,
              border: `1px solid ${filter === f ? T.accent + "40" : T.border}`,
            }}>{f === "all" ? "All" : STATUS_CFG[f].label}</button>
          ))}
        </div>

        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: 40, color: T.text3 }}>
            <div style={{ fontSize: 14, marginBottom: 8 }}>No campaigns yet</div>
            <button onClick={createCampaign} style={{ padding: "8px 18px", fontSize: 13, fontWeight: 600, borderRadius: 6, border: "none", background: T.accent, color: "#fff", cursor: "pointer" }}>Launch your first campaign</button>
          </div>
        )}

        {filtered.map(camp => {
          const sel = selected?.id === camp.id;
          const st = STATUS_CFG[camp.status] || STATUS_CFG.draft;
          const spentPct = camp.budget > 0 ? Math.round((camp.spent / camp.budget) * 100) : 0;
          return (
            <div key={camp.id} onClick={() => setSelected(camp)} style={{
              padding: "14px 18px", marginBottom: 6, borderRadius: 10,
              border: `1px solid ${sel ? T.accent + "40" : T.border}`, background: sel ? `${T.accent}08` : T.surface, cursor: "pointer",
            }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{camp.name}</div>
                <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 6, background: st.bg, color: st.color }}>{st.label}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 11, color: T.text3 }}>
                <span>📢 {camp.channel || "—"}</span>
                {camp.budget > 0 && <span>💰 ${Number(camp.spent || 0).toLocaleString()} / ${Number(camp.budget).toLocaleString()}</span>}
                {camp.start_date && <span>📅 {camp.start_date}</span>}
              </div>
              {camp.budget > 0 && (
                <div style={{ height: 4, borderRadius: 4, background: T.surface3, overflow: "hidden", marginTop: 8 }}>
                  <div style={{ width: `${Math.min(spentPct, 100)}%`, height: "100%", borderRadius: 4, background: spentPct > 90 ? "#ef4444" : spentPct > 70 ? "#eab308" : T.accent }} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {selected && (
        <div style={{ width: 380, borderLeft: `1px solid ${T.border}`, background: T.surface, flexShrink: 0, overflow: "auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: `1px solid ${T.border}` }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: T.text3 }}>Campaign Details</span>
            <button onClick={() => setSelected(null)} style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text3, cursor: "pointer", width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>×</button>
          </div>
          <div style={{ padding: 24 }}>
            <input value={selected.name} onChange={e => updateCampaign(selected.id, { name: e.target.value })}
              style={{ fontSize: 20, fontWeight: 700, color: T.text, background: "transparent", border: "none", outline: "none", width: "100%", marginBottom: 12, fontFamily: "inherit" }} />
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <select value={selected.status} onChange={e => updateCampaign(selected.id, { status: e.target.value })}
                style={{ fontSize: 11, padding: "4px 8px", borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontFamily: "inherit" }}>
                {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <select value={selected.channel || "email"} onChange={e => updateCampaign(selected.id, { channel: e.target.value })}
                style={{ fontSize: 11, padding: "4px 8px", borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontFamily: "inherit" }}>
                {CHANNELS.map(c => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
              </select>
            </div>
            {[
              { l: "Budget ($)", k: "budget", type: "number" },
              { l: "Spent ($)", k: "spent", type: "number" },
              { l: "Start Date", k: "start_date", type: "date" },
              { l: "End Date", k: "end_date", type: "date" },
            ].map(f => (
              <div key={f.k} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: T.text3, display: "block", marginBottom: 4 }}>{f.l}</label>
                <input type={f.type} value={selected[f.k] || ""} onChange={e => updateCampaign(selected.id, { [f.k]: f.type === "number" ? Number(e.target.value) || 0 : e.target.value || null })}
                  style={{ padding: "6px 10px", fontSize: 13, color: T.text, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, outline: "none", width: f.type === "number" ? 120 : 160, fontFamily: "inherit", colorScheme: "dark" }} />
              </div>
            ))}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.text3, display: "block", marginBottom: 4 }}>Description</label>
              <textarea value={selected.description || ""} onChange={e => updateCampaign(selected.id, { description: e.target.value })}
                placeholder="Campaign details…"
                style={{ width: "100%", minHeight: 100, fontSize: 13, color: T.text, lineHeight: 1.6, padding: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, resize: "vertical", outline: "none", fontFamily: "inherit" }} />
            </div>
            <button onClick={() => deleteCampaign(selected.id)} style={{ padding: "7px 14px", fontSize: 12, fontWeight: 600, borderRadius: 6, border: "1px solid #ef444440", background: "#ef444410", color: "#ef4444", cursor: "pointer" }}>Delete</button>
          </div>
        </div>
      )}
    </div>
  );
}
