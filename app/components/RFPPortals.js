"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useTheme } from "../lib/theme";
import PortalAdmin from "./ThreePLParcelRFP";

const PORTAL_BASE = "https://helm-app-six.vercel.app/rfp/index.html";
const CM_TEMPLATE_CODE = "EB-2026-CM-POWDER-01";

const TYPE_META = {
  parcel: { label: "Parcel / Freight", bg: "rgba(66,133,244,0.15)", fg: "#4285f4" },
  cm:     { label: "Contract Mfg",     bg: "rgba(52,168,83,0.15)",  fg: "#34a853" },
};

export default function RFPPortals() {
  const { tokens: T } = useTheme();
  const [portals, setPortals] = useState([]);
  const [counts, setCounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [creating, setCreating] = useState(false);
  const [plmRfps, setPlmRfps] = useState([]);
  const [newForm, setNewForm] = useState({ plm_rfp_id: "", code: "", title: "" });
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: rows }, { data: reqs }, { data: subs }] = await Promise.all([
      supabase.from("rfp_portal_content").select("rfp_code,title,rfp_type,status,plm_rfp_id,updated_at").order("rfp_code"),
      supabase.from("rfp_access_requests").select("rfp_code,status,nda_signed_at"),
      supabase.from("rfp_submissions").select("rfp_code,submission_type"),
    ]);
    setPortals(rows || []);
    const c = {};
    (reqs || []).forEach(r => { const k = r.rfp_code; c[k] = c[k] || { pending: 0, signed: 0, subs: 0 }; if (r.status === "pending") c[k].pending++; if (r.nda_signed_at) c[k].signed++; });
    (subs || []).forEach(s2 => { const k = s2.rfp_code; c[k] = c[k] || { pending: 0, signed: 0, subs: 0 }; c[k].subs++; });
    setCounts(c);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = async () => {
    setCreating(true); setErr(null);
    const { data } = await supabase.from("plm_rfps").select("id,name,rfp_type,status,target_volume,target_volume_unit").order("created_at", { ascending: false });
    setPlmRfps(data || []);
  };

  const slugify = (name) => "EB-" + new Date().getFullYear() + "-CM-" + (name || "").toUpperCase().replace(/[^A-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 18) + "-01";

  const createPortal = async () => {
    setBusy(true); setErr(null);
    try {
      const code = newForm.code.trim();
      const title = newForm.title.trim();
      if (!/^[A-Z0-9-]{6,60}$/.test(code)) throw new Error("Code must be uppercase letters, numbers, and dashes (e.g. EB-2026-CM-WIDGET-01).");
      if (title.length < 4) throw new Error("Enter a portal title.");
      // clone the CM template content
      const { data: tpl, error: e1 } = await supabase.from("rfp_portal_content").select("content").eq("rfp_code", CM_TEMPLATE_CODE).maybeSingle();
      if (e1 || !tpl?.content) throw new Error("CM template content not found.");
      const cloned = JSON.parse(JSON.stringify(tpl.content).split(CM_TEMPLATE_CODE).join(code));
      cloned.eyebrow = `Request for Proposal · ${code} · Contract Manufacturing`;
      cloned.title_html = title;
      const { error: e2 } = await supabase.from("rfp_portal_content").insert({
        rfp_code: code, title, rfp_type: "cm", status: "active",
        plm_rfp_id: newForm.plm_rfp_id || null, content: cloned,
      });
      if (e2) throw e2;
      setCreating(false); setNewForm({ plm_rfp_id: "", code: "", title: "" });
      await load();
      setSelected({ rfp_code: code, title, rfp_type: "cm" });
    } catch (e) { setErr(e.message || String(e)); }
    setBusy(false);
  };

  const setStatus = async (p, status) => {
    await supabase.from("rfp_portal_content").update({ status }).eq("rfp_code", p.rfp_code);
    load();
  };

  const card = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10 };
  const btn = { padding: "7px 14px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none" };
  const btnPrimary = { ...btn, background: T.accent, color: "#fff" };
  const btnGhost = { ...btn, background: T.surface2, color: T.text2, border: `1px solid ${T.border}` };
  const inputStyle = { width: "100%", padding: "8px 10px", borderRadius: 7, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 12.5, fontFamily: "inherit" };
  const label = { fontSize: 11.5, fontWeight: 700, color: T.text2, margin: "12px 0 5px", display: "block" };

  if (selected) {
    return <PortalAdmin rfpCode={selected.rfp_code} rfpType={selected.rfp_type} title={selected.title} onBack={() => { setSelected(null); load(); }} />;
  }

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
        <b style={{ fontSize: 14, color: T.text }}>RFP Portals</b>
        <span style={{ fontSize: 12, color: T.text3 }}>gated external portals - access requests, NDA, submissions</span>
        <div style={{ flex: 1 }} />
        <button onClick={openCreate} style={btnPrimary}>+ New CM RFP portal</button>
      </div>

      {creating && (
        <div style={{ ...card, padding: 18, marginBottom: 14 }}>
          <b style={{ fontSize: 13, color: T.text }}>New contract-manufacturing RFP portal</b>
          <label style={label}>Link to PLM RFP (optional)</label>
          <select style={inputStyle} value={newForm.plm_rfp_id}
            onChange={e => {
              const r = plmRfps.find(x => x.id === e.target.value);
              setNewForm(f => ({ ...f, plm_rfp_id: e.target.value, code: f.code || (r ? slugify(r.name) : f.code), title: f.title || (r ? `${r.name} - Contract Manufacturing RFP` : f.title) }));
            }}>
            <option value="">- none -</option>
            {plmRfps.map(r => <option key={r.id} value={r.id}>{r.name} ({r.rfp_type}, {r.status}{r.target_volume ? `, ${r.target_volume} ${r.target_volume_unit || ""}` : ""})</option>)}
          </select>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div><label style={label}>RFP code (in links & NDA)</label><input style={inputStyle} value={newForm.code} onChange={e => setNewForm(f => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="EB-2026-CM-WIDGET-01" /></div>
            <div><label style={label}>Portal title</label><input style={inputStyle} value={newForm.title} onChange={e => setNewForm(f => ({ ...f, title: e.target.value }))} placeholder="Widget - Contract Manufacturing RFP" /></div>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 14 }}>
            <button onClick={createPortal} disabled={busy} style={btnPrimary}>{busy ? "Creating…" : "Create portal"}</button>
            <button onClick={() => setCreating(false)} style={btnGhost}>Cancel</button>
            {err && <span style={{ fontSize: 12, color: "#e5484d" }}>{err}</span>}
          </div>
          <div style={{ fontSize: 11.5, color: T.text3, marginTop: 10 }}>Content is cloned from the powder-detergent CM template (incl. MNDA with the new RFP code in Exhibit A) - edit every section in the portal's Content tab after creating.</div>
        </div>
      )}

      {loading && <div style={{ padding: 30, color: T.text3, fontSize: 13 }}>Loading…</div>}
      {portals.map(p => {
        const m = TYPE_META[p.rfp_type] || TYPE_META.parcel;
        const c = counts[p.rfp_code] || { pending: 0, signed: 0, subs: 0 };
        return (
          <div key={p.rfp_code} style={{ ...card, marginBottom: 8, padding: "13px 16px", display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ fontSize: 11, padding: "2px 9px", borderRadius: 99, background: m.bg, color: m.fg, fontWeight: 700 }}>{m.label}</span>
            <div style={{ minWidth: 260, cursor: "pointer" }} onClick={() => setSelected(p)}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: T.text }}>{p.title || p.rfp_code}</div>
              <div style={{ fontSize: 11.5, color: T.text3 }}>{p.rfp_code}{p.plm_rfp_id ? " · linked to PLM" : ""}</div>
            </div>
            <div style={{ flex: 1 }} />
            {c.pending > 0 && <span style={{ fontSize: 11.5, color: "#b8860b", fontWeight: 700 }}>{c.pending} pending request{c.pending === 1 ? "" : "s"}</span>}
            <span style={{ fontSize: 11.5, color: T.text3 }}>{c.signed} NDA{c.signed === 1 ? "" : "s"} · {c.subs} submission{c.subs === 1 ? "" : "s"}</span>
            <span style={{ fontSize: 11, padding: "2px 9px", borderRadius: 99, fontWeight: 700, background: p.status === "active" ? "rgba(52,168,83,0.15)" : "rgba(128,128,128,0.15)", color: p.status === "active" ? "#34a853" : T.text3 }}>{p.status}</span>
            <button onClick={() => setSelected(p)} style={btnGhost}>Manage</button>
            <a href={`${PORTAL_BASE}?rfp=${encodeURIComponent(p.rfp_code)}`} target="_blank" rel="noreferrer" style={{ ...btnGhost, textDecoration: "none" }}>Portal ↗</a>
            {p.status === "active"
              ? <button onClick={() => setStatus(p, "closed")} style={{ ...btnGhost, color: T.text3 }}>Close</button>
              : <button onClick={() => setStatus(p, "active")} style={btnGhost}>Reopen</button>}
          </div>
        );
      })}
    </div>
  );
}
