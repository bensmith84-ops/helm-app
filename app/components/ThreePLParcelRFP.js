"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useTheme } from "../lib/theme";

const RFP_CODE = "EB-2026-PARCEL-01";
const PORTAL_URL = "https://helm-app-six.vercel.app/rfp/index.html";

const TYPE_META = {
  proposal: { label: "Proposal", bg: "rgba(52,168,83,0.15)", fg: "#34a853" },
  question: { label: "Question", bg: "rgba(251,188,5,0.15)", fg: "#b8860b" },
  intent:   { label: "Intent to bid", bg: "rgba(66,133,244,0.15)", fg: "#4285f4" },
};
const STATUS_META = {
  pending:  { label: "Pending",  bg: "rgba(251,188,5,0.15)", fg: "#b8860b" },
  approved: { label: "Approved", bg: "rgba(52,168,83,0.15)", fg: "#34a853" },
  denied:   { label: "Denied",   bg: "rgba(229,72,77,0.15)", fg: "#e5484d" },
};

const FIELDS = [
  { key: "eyebrow",           label: "Eyebrow line (RFP no. / issue date)", type: "input" },
  { key: "title_html",        label: "Title (HTML, <br> for line break)",   type: "input" },
  { key: "sub",               label: "Subtitle",                             type: "text", rows: 2 },
  { key: "facts",             label: "Hero facts — one per line: value | label", type: "facts" },
  { key: "overview_lead",     label: "Overview — lead paragraph (HTML ok)",  type: "text", rows: 4 },
  { key: "overview_bullets",  label: "Overview — bullets (one per line, HTML ok)", type: "list", rows: 4 },
  { key: "profile_rows",      label: "Shipment profile — one per line: metric | value", type: "pairs", rows: 9 },
  { key: "scope_core",        label: "Scope — core service bullets",         type: "list", rows: 5 },
  { key: "scope_operational", label: "Scope — operational bullets",          type: "list", rows: 4 },
  { key: "scope_service",     label: "Scope — service level bullets",        type: "list", rows: 3 },
  { key: "pricing_bullets",   label: "Pricing format bullets",               type: "list", rows: 6 },
  { key: "timeline_rows",     label: "Timeline — one per line: milestone | date", type: "pairs", rows: 8 },
  { key: "eval_rows",         label: "Evaluation — one per line: criterion | weight", type: "pairs", rows: 6 },
  { key: "response_format",   label: "Response format bullets",              type: "list", rows: 8 },
  { key: "terms",             label: "RFP terms & conditions bullets",       type: "list", rows: 5 },
  { key: "contacts",          label: "Contacts paragraph (HTML ok)",         type: "text", rows: 2 },
  { key: "nda_text",          label: "NDA text (HTML — shown at signing)",   type: "text", rows: 14 },
];

function toDraft(content) {
  const d = {};
  for (const f of FIELDS) {
    const v = content?.[f.key];
    if (f.type === "list") d[f.key] = Array.isArray(v) ? v.join("\n") : "";
    else if (f.type === "pairs") d[f.key] = Array.isArray(v) ? v.map(r => `${r[0]} | ${r[1]}`).join("\n") : "";
    else if (f.type === "facts") d[f.key] = Array.isArray(v) ? v.map(x => `${x.v} | ${x.l}`).join("\n") : "";
    else d[f.key] = v || "";
  }
  return d;
}
function fromDraft(draft) {
  const c = {};
  const splitPair = (line) => {
    const i = line.indexOf(" | ");
    return i === -1 ? [line.trim(), ""] : [line.slice(0, i).trim(), line.slice(i + 3).trim()];
  };
  for (const f of FIELDS) {
    const raw = draft[f.key] || "";
    if (f.type === "list") c[f.key] = raw.split("\n").map(s => s.trim()).filter(Boolean);
    else if (f.type === "pairs") c[f.key] = raw.split("\n").filter(s => s.trim()).map(splitPair);
    else if (f.type === "facts") c[f.key] = raw.split("\n").filter(s => s.trim()).map(l => { const [v, lab] = splitPair(l); return { v, l: lab }; });
    else c[f.key] = raw.trim();
  }
  return c;
}

export default function ThreePLParcelRFP() {
  const { tokens: T } = useTheme();
  const [tab, setTab] = useState("requests");

  const [reqs, setReqs] = useState([]);
  const [reqsLoading, setReqsLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [copied, setCopied] = useState(null);

  const [subs, setSubs] = useState([]);
  const [subsLoading, setSubsLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  const [baseContent, setBaseContent] = useState(null); // full JSON incl. packet/download keys
  const [draft, setDraft] = useState(null);
  const [contentLoading, setContentLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [err, setErr] = useState(null);

  const loadReqs = useCallback(async () => {
    setReqsLoading(true);
    const { data, error } = await supabase.from("rfp_access_requests").select("*").eq("rfp_code", RFP_CODE).order("created_at", { ascending: false });
    if (!error) setReqs(data || []);
    setReqsLoading(false);
  }, []);

  const loadSubs = useCallback(async () => {
    setSubsLoading(true);
    const { data, error } = await supabase.from("rfp_submissions").select("*").eq("rfp_code", RFP_CODE).order("created_at", { ascending: false });
    if (!error) setSubs(data || []);
    setSubsLoading(false);
  }, []);

  const loadContent = useCallback(async () => {
    setContentLoading(true);
    const { data, error } = await supabase.from("rfp_portal_content").select("content").eq("rfp_code", RFP_CODE).maybeSingle();
    if (!error && data?.content) { setBaseContent(data.content); setDraft(toDraft(data.content)); }
    setContentLoading(false);
  }, []);

  useEffect(() => { loadReqs(); loadSubs(); loadContent(); }, [loadReqs, loadSubs, loadContent]);

  const accessLink = (r) => `${PORTAL_URL}?token=${r.id}`;

  const decide = async (r, status) => {
    setBusy(r.id);
    const { error } = await supabase.from("rfp_access_requests").update({ status, decided_at: new Date().toISOString() }).eq("id", r.id);
    if (!error) setReqs(list => list.map(x => x.id === r.id ? { ...x, status, decided_at: new Date().toISOString() } : x));
    setBusy(null);
  };

  const copyLink = async (r) => {
    try { await navigator.clipboard.writeText(accessLink(r)); setCopied(r.id); setTimeout(() => setCopied(null), 1800); } catch (e) {}
  };

  const mailtoHref = (r) => {
    const subject = encodeURIComponent("Earth Breeze US Parcel RFP — access approved");
    const body = encodeURIComponent(
`Hi ${r.name || ""},

Your access to the Earth Breeze US Parcel Network RFP (EB-2026-PARCEL-01) has been approved.

Open your personal access link below, sign the NDA, and you'll have the full RFP, data tables, and downloads:

${accessLink(r)}

Proposals are due 28 August 2026, 5:00 pm ET. Questions can be submitted through the portal.

Best regards,
Earth Breeze Procurement`);
    return `mailto:${r.email}?subject=${subject}&body=${body}`;
  };

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      const content = { ...(baseContent || {}), ...fromDraft(draft) }; // merge: preserves packet/downloads/etc.
      const { error } = await supabase.from("rfp_portal_content").upsert({ rfp_code: RFP_CODE, content, updated_at: new Date().toISOString() });
      if (error) throw error;
      setBaseContent(content);
      setSavedAt(new Date());
    } catch (e) { setErr(e.message || String(e)); }
    setSaving(false);
  };

  const exportCSV = () => {
    const cols = ["created_at", "submission_type", "company", "contact_name", "email", "phone", "origins_bid", "rate_card_url", "proposal_url", "summary", "questions"];
    const escv = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [cols.join(","), ...subs.map(s => cols.map(c => escv(s[c])).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "rfp_submissions.csv"; a.click();
  };

  const card = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10 };
  const btn = { padding: "7px 14px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none" };
  const btnPrimary = { ...btn, background: T.accent, color: "#fff" };
  const btnGhost = { ...btn, background: T.surface2, color: T.text2, border: `1px solid ${T.border}` };
  const btnSm = { ...btn, padding: "5px 11px", fontSize: 11.5 };
  const inputStyle = { width: "100%", padding: "8px 10px", borderRadius: 7, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 12.5, fontFamily: "inherit" };
  const label = { fontSize: 11.5, fontWeight: 700, color: T.text2, margin: "14px 0 5px", display: "block" };
  const chip = (m) => ({ fontSize: 11, padding: "2px 9px", borderRadius: 99, background: m.bg, color: m.fg, fontWeight: 700, flexShrink: 0 });

  const pendingCount = reqs.filter(r => r.status === "pending").length;
  const counts = subs.reduce((a, s) => { a[s.submission_type] = (a[s.submission_type] || 0) + 1; return a; }, {});

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 2, background: T.surface2, borderRadius: 8, padding: 3 }}>
          {[["requests", `Access Requests${pendingCount ? ` (${pendingCount})` : ""}`], ["submissions", `Submissions${subs.length ? ` (${subs.length})` : ""}`], ["content", "Portal Content"]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ ...btn, background: tab === k ? T.surface : "transparent", color: tab === k ? T.text : T.text3, boxShadow: tab === k ? "0 1px 3px rgba(0,0,0,0.15)" : "none" }}>{l}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <a href={PORTAL_URL} target="_blank" rel="noreferrer" style={{ ...btnGhost, textDecoration: "none" }}>Open portal ↗</a>
      </div>

      {/* ── ACCESS REQUESTS ── */}
      {tab === "requests" && (
        <div>
          <div style={{ ...card, padding: "10px 14px", marginBottom: 12, fontSize: 12, color: T.text2, display: "flex", gap: 10, alignItems: "center" }}>
            <span>🔐</span>
            <span>Flow: carrier requests access on the portal → you <b>Approve</b> here → send them the access link (Email button prefills it) → they sign the NDA → full RFP unlocks. If they kept the portal open in their browser, it also unlocks automatically after approval.</span>
          </div>
          <div style={{ display: "flex", marginBottom: 10 }}>
            <div style={{ flex: 1 }} />
            <button onClick={loadReqs} style={btnGhost}>Refresh</button>
          </div>
          {reqsLoading && <div style={{ padding: 30, color: T.text3, fontSize: 13 }}>Loading…</div>}
          {!reqsLoading && !reqs.length && (
            <div style={{ ...card, padding: 36, textAlign: "center", color: T.text3, fontSize: 13 }}>No access requests yet. They appear here the moment a carrier submits the request form on the portal.</div>
          )}
          {reqs.map(r => {
            const sm = STATUS_META[r.status] || STATUS_META.pending;
            return (
              <div key={r.id} style={{ ...card, marginBottom: 8, padding: "12px 14px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                  <span style={chip(sm)}>{sm.label}</span>
                  <div style={{ minWidth: 200 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{r.company || "—"} <span style={{ fontWeight: 400, color: T.text2 }}>· {r.name || "—"}</span></div>
                    <div style={{ fontSize: 12, color: T.text2 }}>{r.email}</div>
                  </div>
                  <div style={{ flex: 1 }} />
                  {r.nda_signed_at
                    ? <span style={{ fontSize: 11.5, color: "#34a853", fontWeight: 600 }}>✓ NDA signed — {r.nda_name}{r.nda_title ? `, ${r.nda_title}` : ""} · {new Date(r.nda_signed_at).toLocaleString()}</span>
                    : r.status === "approved" && <span style={{ fontSize: 11.5, color: T.text3 }}>NDA not yet signed</span>}
                  <span style={{ fontSize: 11.5, color: T.text3 }}>{new Date(r.created_at).toLocaleString()}</span>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  {r.status === "pending" && (<>
                    <button disabled={busy === r.id} onClick={() => decide(r, "approved")} style={{ ...btnSm, background: "#34a853", color: "#fff" }}>✓ Approve</button>
                    <button disabled={busy === r.id} onClick={() => decide(r, "denied")} style={{ ...btnSm, background: "rgba(229,72,77,0.12)", color: "#e5484d" }}>✕ Deny</button>
                  </>)}
                  {r.status === "approved" && (<>
                    <a href={mailtoHref(r)} style={{ ...btnSm, background: T.accent, color: "#fff", textDecoration: "none" }}>✉ Email access link</a>
                    <button onClick={() => copyLink(r)} style={{ ...btnSm, ...btnGhost }}>{copied === r.id ? "✓ Copied" : "Copy access link"}</button>
                    <button disabled={busy === r.id} onClick={() => decide(r, "denied")} style={{ ...btnSm, background: "transparent", color: T.text3, border: `1px solid ${T.border}` }}>Revoke</button>
                  </>)}
                  {r.status === "denied" && (
                    <button disabled={busy === r.id} onClick={() => decide(r, "approved")} style={{ ...btnSm, ...btnGhost }}>Approve instead</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── SUBMISSIONS ── */}
      {tab === "submissions" && (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
            {Object.entries(TYPE_META).map(([k, m]) => (
              <span key={k} style={chip(m)}>{counts[k] || 0} {m.label.toLowerCase()}{(counts[k] || 0) === 1 ? "" : "s"}</span>
            ))}
            <div style={{ flex: 1 }} />
            <button onClick={exportCSV} style={btnGhost} disabled={!subs.length}>Export CSV</button>
            <button onClick={loadSubs} style={btnGhost}>Refresh</button>
          </div>
          {subsLoading && <div style={{ padding: 30, color: T.text3, fontSize: 13 }}>Loading…</div>}
          {!subsLoading && !subs.length && (
            <div style={{ ...card, padding: 36, textAlign: "center", color: T.text3, fontSize: 13 }}>No submissions yet. Carriers submit through the portal — intents, questions, and proposals all land here.</div>
          )}
          {subs.map(s => {
            const m = TYPE_META[s.submission_type] || TYPE_META.intent;
            const open = expanded === s.id;
            return (
              <div key={s.id} style={{ ...card, marginBottom: 8, overflow: "hidden" }}>
                <div onClick={() => setExpanded(open ? null : s.id)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 14px", cursor: "pointer" }}>
                  <span style={chip(m)}>{m.label}</span>
                  <b style={{ fontSize: 13, color: T.text }}>{s.company}</b>
                  <span style={{ fontSize: 12, color: T.text2 }}>{s.contact_name}</span>
                  {s.origins_bid && <span style={{ fontSize: 11.5, color: T.text3 }}>· {s.origins_bid}</span>}
                  <div style={{ flex: 1 }} />
                  <span style={{ fontSize: 11.5, color: T.text3 }}>{new Date(s.created_at).toLocaleString()}</span>
                  <span style={{ color: T.text3, fontSize: 11 }}>{open ? "▲" : "▼"}</span>
                </div>
                {open && (
                  <div style={{ padding: "0 14px 14px", borderTop: `1px solid ${T.border}` }}>
                    <div style={{ display: "flex", gap: 16, flexWrap: "wrap", margin: "12px 0", fontSize: 12.5 }}>
                      <a href={`mailto:${s.email}`} style={{ color: T.accent }}>{s.email}</a>
                      {s.phone && <span style={{ color: T.text2 }}>{s.phone}</span>}
                      {s.rate_card_url && <a href={s.rate_card_url} target="_blank" rel="noreferrer" style={{ color: T.accent }}>Rate workbook ↗</a>}
                      {s.proposal_url && <a href={s.proposal_url} target="_blank" rel="noreferrer" style={{ color: T.accent }}>Full proposal ↗</a>}
                    </div>
                    {s.summary && (<>
                      <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Executive summary</div>
                      <div style={{ fontSize: 12.5, color: T.text, whiteSpace: "pre-wrap", marginBottom: 10 }}>{s.summary}</div>
                    </>)}
                    {s.questions && (<>
                      <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Questions</div>
                      <div style={{ fontSize: 12.5, color: T.text, whiteSpace: "pre-wrap" }}>{s.questions}</div>
                    </>)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── PORTAL CONTENT ── */}
      {tab === "content" && (
        <div>
          <div style={{ ...card, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: T.text2, display: "flex", alignItems: "center", gap: 10 }}>
            <span>💡</span>
            <span>Edits go <b>live on the portal immediately</b> — no redeploy; carriers see them on next page load. HTML like &lt;b&gt; is allowed. This includes the full on-site RFP (all sections) and the NDA text. The data tables (monthly volume, weights, geography, carrier mix) and download files are generated from shipment data — ask Claude to refresh those.</span>
          </div>
          {contentLoading && <div style={{ padding: 30, color: T.text3, fontSize: 13 }}>Loading…</div>}
          {!contentLoading && draft && (
            <div style={{ ...card, padding: 18 }}>
              {FIELDS.map(f => (
                <div key={f.key}>
                  <label style={label}>{f.label}</label>
                  {f.type === "input" ? (
                    <input style={inputStyle} value={draft[f.key]} onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))} />
                  ) : (
                    <textarea style={{ ...inputStyle, resize: "vertical" }} rows={f.rows || 4} value={draft[f.key]} onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))} />
                  )}
                </div>
              ))}
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 18 }}>
                <button onClick={save} disabled={saving} style={btnPrimary}>{saving ? "Saving…" : "Save & publish"}</button>
                {savedAt && !saving && <span style={{ fontSize: 12, color: "#34a853" }}>✓ Published {savedAt.toLocaleTimeString()}</span>}
                {err && <span style={{ fontSize: 12, color: "#e5484d" }}>{err}</span>}
                <div style={{ flex: 1 }} />
                <a href={PORTAL_URL} target="_blank" rel="noreferrer" style={{ fontSize: 12, color: T.accent }}>Preview portal ↗</a>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
