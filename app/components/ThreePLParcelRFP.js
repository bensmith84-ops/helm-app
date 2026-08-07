"use client";
import React, { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useTheme } from "../lib/theme";

const PORTAL_BASE = "https://helm-app-six.vercel.app/rfp/index.html";

const TYPE_META = {
  proposal: { label: "Proposal", bg: "rgba(52,168,83,0.15)", fg: "#34a853" },
  question: { label: "Question", bg: "rgba(251,188,5,0.15)", fg: "#b8860b" },
  intent:   { label: "Intent to bid", bg: "rgba(66,133,244,0.15)", fg: "#4285f4" },
};
const ANSWER_HINT = "Answers are published to every bidder without naming who asked, so write them as general clarifications.";
const STATUS_META = {
  pending:  { label: "Pending",  bg: "rgba(251,188,5,0.15)", fg: "#b8860b" },
  approved: { label: "Approved", bg: "rgba(52,168,83,0.15)", fg: "#34a853" },
  denied:   { label: "Denied",   bg: "rgba(229,72,77,0.15)", fg: "#e5484d" },
};

const FIELDS_CM = [
  { key: "eyebrow",           label: "Eyebrow line (RFP no.)",              type: "input" },
  { key: "title_html",        label: "Title (HTML, <br> for line break)",   type: "input" },
  { key: "sub",               label: "Subtitle",                             type: "text", rows: 2 },
  { key: "facts",             label: "Hero facts - one per line: value | label", type: "facts" },
  { key: "overview_lead",     label: "Overview - lead paragraph (HTML ok)",  type: "text", rows: 4 },
  { key: "overview_bullets",  label: "Overview - bullets (one per line)",    type: "list", rows: 4 },
  { key: "product_rows",      label: "Product summary - one per line: item | detail", type: "pairs", rows: 7 },
  { key: "offer_rows",        label: "Product offer & MOQ - one per line: SKU | MOQ tiers", type: "pairs", rows: 4 },
  { key: "claims_core",       label: "Brand claims (must deliver)",          type: "list", rows: 8 },
  { key: "claims_additional", label: "Additional claims",                    type: "list", rows: 5 },
  { key: "efficacy",          label: "Efficacy standards",                   type: "list", rows: 4 },
  { key: "materials_certs",   label: "Raw materials & certifications",       type: "list", rows: 4 },
  { key: "packaging",         label: "Packaging bullets",                    type: "list", rows: 4 },
  { key: "regulatory",        label: "Regulatory bullets",                   type: "list", rows: 4 },
  { key: "commercial",        label: "Commercial & pricing format bullets",  type: "list", rows: 6 },
  { key: "timeline_rows",     label: "Timeline - one per line: milestone | date", type: "pairs", rows: 9 },
  { key: "eval_rows",         label: "Evaluation - one per line: criterion | weight", type: "pairs", rows: 7 },
  { key: "response_format",   label: "Response format bullets",              type: "list", rows: 10 },
  { key: "documentation",     label: "Documentation requirements bullets",   type: "list", rows: 5 },
  { key: "terms",             label: "Terms bullets",                        type: "list", rows: 5 },
  { key: "contacts",          label: "Contacts paragraph (HTML ok)",         type: "text", rows: 2 },
  { key: "nda_text",          label: "NDA text (HTML - shown at signing)",   type: "text", rows: 14 },
];

const FIELDS_FF = [
  { key: "eyebrow",           label: "Eyebrow line (RFP no. / issue date)", type: "input" },
  { key: "title_html",        label: "Title (HTML, <br> for line break)",   type: "input" },
  { key: "sub",               label: "Subtitle",                             type: "text", rows: 2 },
  { key: "facts",             label: "Hero facts - one per line: value | label", type: "facts" },
  { key: "overview_lead",     label: "Overview - lead paragraph (HTML ok)",  type: "text", rows: 4 },
  { key: "overview_bullets",  label: "Overview - bullets (one per line)",    type: "list", rows: 5 },
  { key: "profile_rows",      label: "Business profile - one per line: metric | value", type: "pairs", rows: 11 },
  { key: "scope_core",        label: "Scope - core services",               type: "list", rows: 6 },
  { key: "scope_operational", label: "Scope - operational",                 type: "list", rows: 5 },
  { key: "scope_service",     label: "Scope - service levels",              type: "list", rows: 3 },
  { key: "sku_intro",         label: "SKU profile - intro paragraph (HTML ok)", type: "text", rows: 3 },
  { key: "sku_profile",       label: "SKU profile rows - one SKU per line, fields separated by |  in this order: SKU | Description | Image URL | Unit weight | Unit dimensions | Qty per master carton | Master carton dimensions | Cartons per pallet | Per 20ft container | Per 40ft container | Per 40ft HC container", type: "skus", rows: 16 },
  { key: "sku_note",          label: "SKU profile - footnote",              type: "text", rows: 2 },
  { key: "postage",           label: "Postage requirements",                type: "list", rows: 5 },
  { key: "pricing_bullets",   label: "Pricing format bullets",              type: "list", rows: 7 },
  { key: "timeline_rows",     label: "Timeline - one per line: milestone | date", type: "pairs", rows: 8 },
  { key: "eval_rows",         label: "Evaluation - one per line: criterion | weight", type: "pairs", rows: 7 },
  { key: "response_format",   label: "Response format bullets",             type: "list", rows: 10 },
  { key: "terms",             label: "Terms bullets",                       type: "list", rows: 5 },
  { key: "contacts",          label: "Contacts paragraph (HTML ok)",        type: "text", rows: 2 },
  { key: "nda_text",          label: "NDA text (HTML - shown at signing)",  type: "text", rows: 14 },
];

const FIELDS_PARCEL = [
  { key: "eyebrow",           label: "Eyebrow line (RFP no. / issue date)", type: "input" },
  { key: "title_html",        label: "Title (HTML, <br> for line break)",   type: "input" },
  { key: "sub",               label: "Subtitle",                             type: "text", rows: 2 },
  { key: "facts",             label: "Hero facts - one per line: value | label", type: "facts" },
  { key: "overview_lead",     label: "Overview - lead paragraph (HTML ok)",  type: "text", rows: 4 },
  { key: "overview_bullets",  label: "Overview - bullets (one per line, HTML ok)", type: "list", rows: 4 },
  { key: "profile_rows",      label: "Shipment profile - one per line: metric | value", type: "pairs", rows: 9 },
  { key: "scope_core",        label: "Scope - core service bullets",         type: "list", rows: 5 },
  { key: "scope_operational", label: "Scope - operational bullets",          type: "list", rows: 4 },
  { key: "scope_service",     label: "Scope - service level bullets",        type: "list", rows: 3 },
  { key: "pricing_bullets",   label: "Pricing format bullets",               type: "list", rows: 6 },
  { key: "timeline_rows",     label: "Timeline - one per line: milestone | date", type: "pairs", rows: 8 },
  { key: "eval_rows",         label: "Evaluation - one per line: criterion | weight", type: "pairs", rows: 6 },
  { key: "response_format",   label: "Response format bullets",              type: "list", rows: 8 },
  { key: "terms",             label: "RFP terms & conditions bullets",       type: "list", rows: 5 },
  { key: "contacts",          label: "Contacts paragraph (HTML ok)",         type: "text", rows: 2 },
  { key: "nda_text",          label: "NDA text (HTML - shown at signing)",   type: "text", rows: 14 },
];

const SKU_KEYS = ["sku","desc","img","weight","dims","qty_carton","carton_dims","cartons_pallet","c20","c40","c40hc"];

function toDraft(content, FIELDS) {
  const d = {};
  for (const f of FIELDS) {
    const v = content?.[f.key];
    if (f.type === "skus") { d[f.key] = Array.isArray(v) ? v.map(r => SKU_KEYS.map(k => r[k] ?? "").join(" | ")).join("\n") : ""; continue; }
    if (f.type === "list") d[f.key] = Array.isArray(v) ? v.join("\n") : "";
    else if (f.type === "pairs") d[f.key] = Array.isArray(v) ? v.map(r => `${r[0]} | ${r[1]}`).join("\n") : "";
    else if (f.type === "facts") d[f.key] = Array.isArray(v) ? v.map(x => `${x.v} | ${x.l}`).join("\n") : "";
    else d[f.key] = v || "";
  }
  return d;
}
function fromDraft(draft, FIELDS) {
  const c = {};
  const splitPair = (line) => {
    const i = line.indexOf(" | ");
    return i === -1 ? [line.trim(), ""] : [line.slice(0, i).trim(), line.slice(i + 3).trim()];
  };
  for (const f of FIELDS) {
    const raw = draft[f.key] || "";
    if (f.type === "skus") {
      c[f.key] = raw.split("\n").filter(l => l.trim()).map(line => {
        const parts = line.split("|").map(x => x.trim());
        const o = {}; SKU_KEYS.forEach((k, i) => { o[k] = parts[i] ?? ""; });
        return o;
      });
      continue;
    }
    if (f.type === "list") c[f.key] = raw.split("\n").map(s => s.trim()).filter(Boolean);
    else if (f.type === "pairs") c[f.key] = raw.split("\n").filter(s => s.trim()).map(splitPair);
    else if (f.type === "facts") c[f.key] = raw.split("\n").filter(s => s.trim()).map(l => { const [v, lab] = splitPair(l); return { v, l: lab }; });
    else c[f.key] = raw.trim();
  }
  return c;
}

export default function ThreePLParcelRFP({ rfpCode = "EB-2026-PARCEL-01", rfpType = "parcel", title = "US Parcel Network RFP", onBack }) {
  const RFP_CODE = rfpCode;
  const PORTAL_URL = PORTAL_BASE + "?rfp=" + encodeURIComponent(rfpCode);
  const FIELDS = rfpType === "cm" ? FIELDS_CM : (rfpCode === "EB-2026-3PL-01" ? FIELDS_FF : FIELDS_PARCEL);
  const { tokens: T } = useTheme();
  const [tab, setTab] = useState("requests");

  const [reqs, setReqs] = useState([]);
  const [reqsLoading, setReqsLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [copied, setCopied] = useState(null);

  const [subs, setSubs] = useState([]);
  const [subsLoading, setSubsLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [answerDraft, setAnswerDraft] = useState({});
  const [qBusy, setQBusy] = useState(null);

  const [schema, setSchema] = useState(null);           // structured response form definition
  const [fdraft, setFdraft] = useState(null);          // editable copy of the schema
  const [fsaving, setFsaving] = useState(false);
  const [fsaved, setFsaved] = useState(null);
  const [ferr, setFerr] = useState(null);
  const [openSec, setOpenSec] = useState(0);
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
    if (!error && data?.content) {
      setBaseContent(data.content); setDraft(toDraft(data.content, FIELDS));
      setSchema(data.content.response_form || null);
      setFdraft(data.content.response_form ? JSON.parse(JSON.stringify(data.content.response_form)) : null);
    }
    setContentLoading(false);
  }, []);

  useEffect(() => { loadReqs(); loadSubs(); loadContent(); }, [loadReqs, loadSubs, loadContent]);

  const accessLink = (r) => `${PORTAL_URL}&token=${r.id}`;

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
    const subject = encodeURIComponent("Earth Breeze US Parcel RFP - access approved");
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
      // Merge edits over a FRESH read (not the mount-time snapshot) so data updated
      // elsewhere (packet tables, downloads, etc.) is never clobbered by a stale save.
      const { data: fresh } = await supabase.from("rfp_portal_content").select("content").eq("rfp_code", RFP_CODE).maybeSingle();
      const content = { ...(fresh?.content || baseContent || {}), ...fromDraft(draft, FIELDS) };
      const { error } = await supabase.from("rfp_portal_content").upsert({ rfp_code: RFP_CODE, content, updated_at: new Date().toISOString() });
      if (error) throw error;
      setBaseContent(content);
      setSavedAt(new Date());
    } catch (e) { setErr(e.message || String(e)); }
    setSaving(false);
  };

  const openAttachment = async (att) => {
    try {
      const { data, error } = await supabase.storage.from("rfp-submissions").createSignedUrl(att.path, 300);
      if (error) throw error;
      window.open(data.signedUrl, "_blank", "noopener");
    } catch (e) { alert("Could not open file: " + (e.message || e)); }
  };

  const saveAnswer = async (sub, publish) => {
    const text = (answerDraft[sub.id] ?? sub.answer ?? "").trim();
    if (publish && !text) { alert("Write an answer before publishing."); return; }
    setQBusy(sub.id);
    const patch = { answer: text || null, answered_at: text ? new Date().toISOString() : null, published: publish };
    const { error } = await supabase.from("rfp_submissions").update(patch).eq("id", sub.id);
    setQBusy(null);
    if (error) { alert("Could not save: " + error.message); return; }
    setSubs(list => list.map(x => x.id === sub.id ? { ...x, ...patch } : x));
  };
  const unpublish = async (sub) => {
    setQBusy(sub.id);
    const { error } = await supabase.from("rfp_submissions").update({ published: false }).eq("id", sub.id);
    setQBusy(null);
    if (!error) setSubs(list => list.map(x => x.id === sub.id ? { ...x, published: false } : x));
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

  const structuredSubs = subs.filter(s => s.structured && Object.keys(s.structured).length > 0);
  const fmtNode = (n) => [n.address1, n.city, n.state, n.zip].filter(Boolean).join(", ");
  const fmtVal = (f, v) => {
    if (v === undefined || v === null || v === "") return null;
    if (f.t === "nodes" && Array.isArray(v)) {
      return v.map((n, i) => `${i + 1}. ${fmtNode(n)}${n.sqft ? ` (${Number(n.sqft).toLocaleString()} sq ft)` : ""}${n.status ? ` - ${n.status}` : ""}`).join("\n");
    }
    if (Array.isArray(v)) return v.join(", ");
    if (f.t === "cur" && typeof v === "number") return "$" + v.toLocaleString(undefined, { minimumFractionDigits: f.dp ?? 2, maximumFractionDigits: f.dp ?? 2 });
    if (f.t === "num" && typeof v === "number") return v.toLocaleString() + (f.unit ? ` ${f.unit}` : "");
    return String(v);
  };
  // for numeric rows, flag the best (lowest cost / shortest time) and worst
  const numericExtremes = (f, vals) => {
    const nums = vals.filter(v => typeof v === "number");
    if (nums.length < 2) return {};
    const lowerIsBetter = f.t === "cur" || ["impl_weeks", "escalator", "min_monthly"].includes(f.k);
    return { best: lowerIsBetter ? Math.min(...nums) : Math.max(...nums),
             worst: lowerIsBetter ? Math.max(...nums) : Math.min(...nums) };
  };
  const exportCompare = () => {
    if (!schema) return;
    const cols = ["Section", "Field", ...structuredSubs.map(s => s.company || "(unnamed)")];
    const rows = [];
    schema.forEach(sec => (sec.f || []).forEach(f => {
      rows.push([sec.s, f.l, ...structuredSubs.map(s => {
        const v = s.structured?.[f.k];
        if (f.t === "nodes" && Array.isArray(v)) return v.map(fmtNode).join(" | ");
        return Array.isArray(v) ? v.join("; ") : (v ?? "");
      })]);
    }));
    const escv = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [cols.map(escv).join(","), ...rows.map(r => r.map(escv).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${RFP_CODE}_comparison.csv`; a.click();
  };

  // ── response form schema editor ──
  const FIELD_TYPES = [
    { t: "cur",   label: "Currency ($)" },
    { t: "num",   label: "Number" },
    { t: "text",  label: "Short text" },
    { t: "area",  label: "Long text" },
    { t: "sel",   label: "Dropdown (pick one)" },
    { t: "multi", label: "Checkboxes (pick many)" },
    { t: "nodes", label: "Facility addresses" },
  ];
  const slugKey = (label, taken) => {
    let base = (label || "field").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) || "field";
    let k = base, i = 2;
    while (taken.has(k)) { k = `${base}_${i++}`; }
    return k;
  };
  const allKeys = (sch) => new Set((sch || []).flatMap(s2 => (s2.f || []).map(f => f.k)));
  // how many submissions already answered a given field - used to warn before deletion
  const answeredCount = (key) => subs.filter(s2 => s2.structured && s2.structured[key] !== undefined && s2.structured[key] !== "").length;

  const mutate = (fn) => setFdraft(d => { const c = JSON.parse(JSON.stringify(d || [])); fn(c); return c; });
  const addSection = () => mutate(c => c.push({ s: "New section", f: [] }));
  const delSection = (si) => {
    const sec = fdraft[si];
    const answered = (sec.f || []).reduce((n, f) => n + answeredCount(f.k), 0);
    if (!confirm(`Delete section "${sec.s}" and its ${(sec.f || []).length} field(s)?${answered ? `\n\n${answered} existing answer(s) across submissions reference these fields. The answers stay in the database but will no longer be shown in Compare.` : ""}`)) return;
    mutate(c => c.splice(si, 1));
  };
  const moveSection = (si, dir) => mutate(c => {
    const j = si + dir; if (j < 0 || j >= c.length) return;
    [c[si], c[j]] = [c[j], c[si]];
  });
  const addField = (si) => mutate(c => {
    (c[si].f = c[si].f || []).push({ k: "", l: "", t: "cur", dp: 2, __new: true });
  });
  const delField = (si, fi) => {
    const f = fdraft[si].f[fi]; const n = answeredCount(f.k);
    if (!confirm(`Remove "${f.l}"?${n ? `\n\n${n} submission(s) have already answered this. Their answers stay in the database but will disappear from Compare.` : ""}`)) return;
    mutate(c => c[si].f.splice(fi, 1));
  };
  const moveField = (si, fi, dir) => mutate(c => {
    const j = fi + dir; if (j < 0 || j >= c[si].f.length) return;
    [c[si].f[fi], c[si].f[j]] = [c[si].f[j], c[si].f[fi]];
  });
  const setField = (si, fi, patch) => mutate(c => {
    const f = c[si].f[fi];
    Object.assign(f, patch);
    // Derive the key from the label while the field is new and unanswered, so keys are
    // meaningful (storage_rate, not new_field_7). Once answers exist the key is frozen.
    if (patch.l !== undefined && f.__new) {
      const taken = allKeys(c); taken.delete(f.k);
      f.k = slugKey(patch.l, taken);
    }
    if (patch.t) { // tidy type-specific extras
      if (!["sel", "multi"].includes(f.t)) delete f.opts;
      if (!["cur"].includes(f.t)) delete f.dp;
      if (!["num"].includes(f.t)) delete f.unit;
      if (["sel", "multi"].includes(f.t) && !f.opts) f.opts = ["Option 1", "Option 2"];
      if (f.t === "cur" && f.dp === undefined) f.dp = 2;
    }
  });

  const saveSchema = async () => {
    setFsaving(true); setFerr(null);
    try {
      // validate
      const keys = new Set();
      for (const sec of fdraft || []) {
        if (!String(sec.s || "").trim()) throw new Error("Every section needs a name.");
        for (const f of sec.f || []) {
          if (!String(f.l || "").trim()) throw new Error(`A field in "${sec.s}" has no question text yet - type it or remove the field.`);
          if (!/^[a-z0-9_]+$/.test(f.k || "")) throw new Error(`Field key "${f.k}" must be lowercase letters, numbers and underscores.`);
          if (keys.has(f.k)) throw new Error(`Duplicate field key "${f.k}". Keys must be unique across the whole form.`);
          keys.add(f.k);
          if (["sel", "multi"].includes(f.t) && !(f.opts || []).filter(o => String(o).trim()).length) throw new Error(`"${f.l}" needs at least one option.`);
        }
      }
      const clean = JSON.parse(JSON.stringify(fdraft)).map(sec => ({ ...sec, f: (sec.f || []).map(f => { const { __new, ...rest } = f; return rest; }) }));
      const { data: fresh } = await supabase.from("rfp_portal_content").select("content").eq("rfp_code", RFP_CODE).maybeSingle();
      // Guard against overwriting changes made elsewhere while this tab was open.
      const liveForm = fresh?.content?.response_form || null;
      const loadedForm = schema || null;
      if (liveForm && loadedForm && JSON.stringify(liveForm) !== JSON.stringify(loadedForm)) {
        const liveCount = liveForm.reduce((n, s2) => n + (s2.f || []).length, 0);
        const mineCount = clean.reduce((n, s2) => n + (s2.f || []).length, 0);
        const ok = window.confirm(
          "This form was changed somewhere else after you opened this tab.\n\n" +
          `Saved version now: ${liveForm.length} sections, ${liveCount} fields\n` +
          `Your version: ${clean.length} sections, ${mineCount} fields\n\n` +
          "OK = overwrite with your version (the other changes will be lost).\n" +
          "Cancel = discard your edits and load the current saved version."
        );
        if (!ok) {
          setSchema(liveForm);
          setFdraft(JSON.parse(JSON.stringify(liveForm)));
          setFsaving(false);
          setFerr("Loaded the current saved version. Your unsaved edits were discarded.");
          return;
        }
      }
      const content = { ...(fresh?.content || baseContent || {}), response_form: clean };
      const { error } = await supabase.from("rfp_portal_content").upsert({ rfp_code: RFP_CODE, content, updated_at: new Date().toISOString() });
      if (error) throw error;
      setBaseContent(content); setSchema(clean); setFdraft(clean); setFsaved(new Date());
    } catch (e) { setFerr(e.message || String(e)); }
    setFsaving(false);
  };

  const exportNodes = () => {
    const rows = [];
    structuredSubs.forEach(s => {
      const ns = s.structured?.nodes;
      if (Array.isArray(ns)) ns.forEach((n, i) => rows.push([
        s.company || "(unnamed)", i + 1, n.address1 || "", n.city || "", n.state || "", n.zip || "",
        n.sqft || "", n.status || "", n.role || "",
      ]));
    });
    if (!rows.length) return;
    const cols = ["Bidder", "Node #", "Address", "City", "State", "ZIP", "Sq ft", "Status", "Role"];
    const escv = v => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [cols.join(","), ...rows.map(r => r.map(escv).join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `${RFP_CODE}_proposed_nodes.csv`; a.click();
  };

  const pendingCount = reqs.filter(r => r.status === "pending").length;
  const counts = subs.reduce((a, s) => { a[s.submission_type] = (a[s.submission_type] || 0) + 1; return a; }, {});

  return (
    <div style={{ maxWidth: 1000 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
        {onBack && <button onClick={onBack} style={{ padding: "7px 10px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", background: T.surface2, color: T.text2, border: `1px solid ${T.border}` }}>←</button>}
        <b style={{ fontSize: 13.5, color: T.text }}>{title}</b>
        <div style={{ display: "flex", gap: 2, background: T.surface2, borderRadius: 8, padding: 3 }}>
          {[["requests", `Access Requests${pendingCount ? ` (${pendingCount})` : ""}`], ["submissions", `Submissions${subs.length ? ` (${subs.length})` : ""}`], ...(schema ? [["compare", `Compare${structuredSubs.length ? ` (${structuredSubs.length})` : ""}`]] : []), ["form", "Response Form"], ["content", "Portal Content"]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ ...btn, background: tab === k ? T.surface : "transparent", color: tab === k ? T.text : T.text3, boxShadow: tab === k ? "0 1px 3px rgba(0,0,0,0.15)" : "none" }}>{l}</button>
          ))}
        </div>
        <div style={{ flex: 1 }} />
        <button onClick={async () => {
          const link = `${PORTAL_URL}&preview=1`;
          try { await navigator.clipboard.writeText(link); setCopied("preview"); setTimeout(() => setCopied(null), 2000); }
          catch (e) { window.prompt("Internal preview link:", link); }
        }} style={btnGhost} title="Anyone signed in to Helm can open this - no NDA, no access request">
          {copied === "preview" ? "✓ Copied" : "🔗 Internal preview link"}
        </button>
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
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{r.company || "-"} <span style={{ fontWeight: 400, color: T.text2 }}>· {r.name || "-"}</span></div>
                    <div style={{ fontSize: 12, color: T.text2 }}>{r.email}</div>
                  </div>
                  <div style={{ flex: 1 }} />
                  {r.nda_signed_at
                    ? <span style={{ fontSize: 11.5, color: "#34a853", fontWeight: 600 }}>✓ NDA signed - {r.nda_name}{r.nda_title ? `, ${r.nda_title}` : ""}{r.nda_details?.signer_email ? ` (${r.nda_details.signer_email})` : ""} · {new Date(r.nda_signed_at).toLocaleString()}</span>
                    : r.status === "approved" && (r.delegate_email
                      ? <span style={{ fontSize: 11.5, color: "#b8860b", fontWeight: 600 }}>✉ NDA forwarded to {r.delegate_name || r.delegate_email} ({r.delegate_email}) - awaiting signature</span>
                      : <span style={{ fontSize: 11.5, color: T.text3 }}>NDA not yet signed</span>)}
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
            <div style={{ ...card, padding: 36, textAlign: "center", color: T.text3, fontSize: 13 }}>No submissions yet. Carriers submit through the portal - intents, questions, and proposals all land here.</div>
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
                  {s.submission_type === "question" && (
                    <span style={{ fontSize: 10.5, fontWeight: 700, padding: "1px 8px", borderRadius: 99,
                      background: s.published ? "rgba(52,168,83,0.15)" : s.answer ? "rgba(251,188,5,0.15)" : "rgba(229,72,77,0.12)",
                      color: s.published ? "#34a853" : s.answer ? "#b8860b" : "#e5484d" }}>
                      {s.published ? "published" : s.answer ? "drafted" : "unanswered"}
                    </span>
                  )}
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
                    {Array.isArray(s.attachments) && s.attachments.length > 0 && (
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>Attachments ({s.attachments.length})</div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
                          {s.attachments.map((a, i) => (
                            <button key={i} onClick={() => openAttachment(a)}
                              style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px", borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: "pointer", background: T.surface2, color: T.accent, border: `1px solid ${T.border}` }}>
                              📎 {a.name}
                              <span style={{ color: T.text3, fontWeight: 400 }}>{a.size ? (a.size / 1048576).toFixed(1) + " MB" : ""}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    {s.summary && (<>
                      <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Executive summary</div>
                      <div style={{ fontSize: 12.5, color: T.text, whiteSpace: "pre-wrap", marginBottom: 10 }}>{s.summary}</div>
                    </>)}
                    {s.questions && (<>
                      <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{s.submission_type === "question" ? "Question" : "Questions"}</div>
                      <div style={{ fontSize: 12.5, color: T.text, whiteSpace: "pre-wrap" }}>{s.questions}</div>
                    </>)}
                    {s.submission_type === "question" && (
                      <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>Your answer</div>
                        <div style={{ fontSize: 11.5, color: T.text3, marginBottom: 6 }}>{ANSWER_HINT}</div>
                        <textarea rows={4} value={answerDraft[s.id] ?? s.answer ?? ""}
                          onChange={e => setAnswerDraft(d => ({ ...d, [s.id]: e.target.value }))}
                          placeholder="Write the clarification all bidders will see…"
                          style={{ ...inputStyle, resize: "vertical" }} />
                        <div style={{ display: "flex", gap: 8, marginTop: 9, alignItems: "center", flexWrap: "wrap" }}>
                          <button disabled={qBusy === s.id} onClick={() => saveAnswer(s, true)} style={{ ...btnSm, background: "#34a853", color: "#fff" }}>
                            {qBusy === s.id ? "Saving…" : s.published ? "Update published answer" : "✓ Publish to all bidders"}
                          </button>
                          <button disabled={qBusy === s.id} onClick={() => saveAnswer(s, false)} style={{ ...btnSm, ...btnGhost }}>Save draft</button>
                          {s.published && <button disabled={qBusy === s.id} onClick={() => unpublish(s)} style={{ ...btnSm, background: "transparent", color: T.text3, border: `1px solid ${T.border}` }}>Unpublish</button>}
                          {s.answered_at && <span style={{ fontSize: 11.5, color: T.text3 }}>last answered {new Date(s.answered_at).toLocaleString()}</span>}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── COMPARE ── */}
      {tab === "compare" && schema && (
        <div>
          <div style={{ ...card, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: T.text2, display: "flex", gap: 10, alignItems: "center" }}>
            <span>📊</span>
            <span>Every bidder answers the same {schema.reduce((n, s2) => n + (s2.f || []).length, 0)} fields, so responses line up row by row. Green marks the most favourable answer on numeric rows, amber the least. Blank means the bidder left it empty.</span>
            <div style={{ flex: 1 }} />
            <button onClick={exportNodes} style={btnGhost} disabled={!structuredSubs.some(s => Array.isArray(s.structured?.nodes) && s.structured.nodes.length)}>Export node addresses</button>
            <button onClick={exportCompare} style={btnGhost} disabled={!structuredSubs.length}>Export CSV</button>
          </div>
          {!structuredSubs.length && (
            <div style={{ ...card, padding: 36, textAlign: "center", color: T.text3, fontSize: 13 }}>
              No structured responses yet. They appear here as bidders submit proposals through the portal.
            </div>
          )}
          {structuredSubs.length > 0 && (
            <div style={{ ...card, overflow: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", fontSize: 12.5 }}>
                <thead>
                  <tr>
                    <th style={{ position: "sticky", left: 0, background: T.surface2, textAlign: "left", padding: "9px 12px", borderBottom: `1px solid ${T.border}`, minWidth: 260, zIndex: 2 }}>Field</th>
                    {structuredSubs.map(s2 => (
                      <th key={s2.id} style={{ textAlign: "left", padding: "9px 12px", borderBottom: `1px solid ${T.border}`, background: T.surface2, minWidth: 170, color: T.text }}>
                        {s2.company || "(unnamed)"}
                        <div style={{ fontWeight: 400, fontSize: 11, color: T.text3 }}>{new Date(s2.created_at).toLocaleDateString()}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {schema.map(sec => (
                    <React.Fragment key={sec.s}>
                      <tr>
                        <td colSpan={structuredSubs.length + 1} style={{ padding: "9px 12px", background: T.accent + "12", fontWeight: 700, color: T.accent, fontSize: 12, borderBottom: `1px solid ${T.border}` }}>{sec.s}</td>
                      </tr>
                      {(sec.f || []).map(f => {
                        const vals = structuredSubs.map(s2 => s2.structured?.[f.k]);
                        const ext = numericExtremes(f, vals);
                        return (
                          <tr key={f.k}>
                            <td style={{ position: "sticky", left: 0, background: T.surface, padding: "7px 12px", borderBottom: `1px solid ${T.border}`, color: T.text2, zIndex: 1 }}>
                              {f.l}{f.req ? <span style={{ color: "#e5484d" }}> *</span> : null}
                            </td>
                            {vals.map((v, i) => {
                              const disp = fmtVal(f, v);
                              const isBest = typeof v === "number" && ext.best !== undefined && v === ext.best && ext.best !== ext.worst;
                              const isWorst = typeof v === "number" && ext.worst !== undefined && v === ext.worst && ext.best !== ext.worst;
                              return (
                                <td key={i} style={{ padding: "7px 12px", borderBottom: `1px solid ${T.border}`, whiteSpace: (f.t === "area" || f.t === "nodes") ? "pre-line" : "nowrap",
                                  color: disp ? T.text : T.text3,
                                  background: isBest ? "rgba(52,168,83,0.13)" : isWorst ? "rgba(251,188,5,0.13)" : "transparent",
                                  fontWeight: isBest ? 700 : 400,
                                  maxWidth: (f.t === "area" || f.t === "nodes") ? 320 : undefined }}>
                                  {disp || "-"}
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── RESPONSE FORM EDITOR ── */}
      {tab === "form" && (
        <div>
          <div style={{ ...card, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: T.text2, display: "flex", gap: 10, alignItems: "flex-start" }}>
            <span>🧩</span>
            <span>These are the fields bidders fill in on the portal. Add, remove or reorder them and hit Save - the form updates live. Answers already submitted are never deleted, but removing a field hides it from Compare. Field keys must stay unique; changing a key on a field that already has answers will orphan those answers, so rename the label instead.</span>
          </div>

          {!fdraft && (
            <div style={{ ...card, padding: 30, textAlign: "center" }}>
              <div style={{ fontSize: 13, color: T.text2, marginBottom: 14 }}>This portal has no structured response form yet.</div>
              <button onClick={() => setFdraft([{ s: "Pricing", f: [{ k: "price_per_order", l: "Cost per order", t: "cur", dp: 3, req: 1 }] }])} style={btnPrimary}>Create a response form</button>
            </div>
          )}

          {fdraft && (<>
            {fdraft.map((sec, si) => {
              const open = openSec === si;
              return (
                <div key={si} style={{ ...card, marginBottom: 10, overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 13px", background: T.surface2, cursor: "pointer" }}
                       onClick={() => setOpenSec(open ? -1 : si)}>
                    <span style={{ color: T.text3, fontSize: 11 }}>{open ? "▼" : "▶"}</span>
                    <input value={sec.s} onClick={e => e.stopPropagation()}
                      onChange={e => mutate(c => { c[si].s = e.target.value; })}
                      style={{ ...inputStyle, background: T.surface, fontWeight: 700, maxWidth: 340 }} />
                    <span style={{ fontSize: 11.5, color: T.text3 }}>{(sec.f || []).length} field{(sec.f || []).length === 1 ? "" : "s"}</span>
                    {sec.note && <span title="Has bidder instructions" style={{ fontSize: 11 }}>💬</span>}
                    <div style={{ flex: 1 }} />
                    <button onClick={e => { e.stopPropagation(); moveSection(si, -1); }} disabled={si === 0} style={{ ...btnSm, ...btnGhost, opacity: si === 0 ? 0.4 : 1 }}>↑</button>
                    <button onClick={e => { e.stopPropagation(); moveSection(si, 1); }} disabled={si === fdraft.length - 1} style={{ ...btnSm, ...btnGhost, opacity: si === fdraft.length - 1 ? 0.4 : 1 }}>↓</button>
                    <button onClick={e => { e.stopPropagation(); delSection(si); }} style={{ ...btnSm, background: "transparent", color: "#e5484d", border: `1px solid ${T.border}` }}>Delete</button>
                  </div>

                  {open && (
                    <div style={{ padding: "12px 13px" }}>
                      <div style={{ marginBottom: 12 }}>
                        <label style={{ ...label, margin: "0 0 4px" }}>
                          Instructions for bidders <span style={{ fontWeight: 400, color: T.text3 }}>- shown above these fields on the portal. Basic HTML like &lt;b&gt; works. Leave blank to hide.</span>
                        </label>
                        <textarea rows={3} value={sec.note || ""}
                          onChange={e => mutate(c => { const v = e.target.value; if (v) c[si].note = v; else delete c[si].note; })}
                          placeholder="e.g. Quote all rates FOB your facility, excluding postage. If your structure differs from these fields, use the notes box at the end of the section."
                          style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }} />
                      </div>
                      {(sec.f || []).map((f, fi) => {
                        const used = answeredCount(f.k);
                        return (
                          <div key={fi} style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 12px", marginBottom: 8, background: T.surface2 }}>
                            <div style={{ display: "grid", gridTemplateColumns: "2fr 1.1fr 0.9fr auto", gap: 10, alignItems: "end" }}>
                              <div>
                                <label style={{ ...label, margin: "0 0 4px" }}>Question shown to bidders</label>
                                <input value={f.l} onChange={e => setField(si, fi, { l: e.target.value })} style={inputStyle} />
                              </div>
                              <div>
                                <label style={{ ...label, margin: "0 0 4px" }}>Type</label>
                                <select value={f.t} onChange={e => setField(si, fi, { t: e.target.value })} style={inputStyle}>
                                  {FIELD_TYPES.map(ft => <option key={ft.t} value={ft.t}>{ft.label}</option>)}
                                </select>
                              </div>
                              <div>
                                {f.t === "cur" && (<>
                                  <label style={{ ...label, margin: "0 0 4px" }}>Decimals</label>
                                  <select value={f.dp ?? 2} onChange={e => setField(si, fi, { dp: parseInt(e.target.value, 10) })} style={inputStyle}>
                                    {[0, 2, 3, 4].map(d => <option key={d} value={d}>{d}</option>)}
                                  </select>
                                </>)}
                                {f.t === "num" && (<>
                                  <label style={{ ...label, margin: "0 0 4px" }}>Unit</label>
                                  <input value={f.unit || ""} onChange={e => setField(si, fi, { unit: e.target.value })} placeholder="%, weeks…" style={inputStyle} />
                                </>)}
                                {["text", "area"].includes(f.t) && (<>
                                  <label style={{ ...label, margin: "0 0 4px" }}>Placeholder</label>
                                  <input value={f.ph || ""} onChange={e => setField(si, fi, { ph: e.target.value })} style={inputStyle} />
                                </>)}
                              </div>
                              <div style={{ display: "flex", gap: 5, alignItems: "center", paddingBottom: 6 }}>
                                <button onClick={() => moveField(si, fi, -1)} disabled={fi === 0} style={{ ...btnSm, ...btnGhost, opacity: fi === 0 ? 0.4 : 1 }}>↑</button>
                                <button onClick={() => moveField(si, fi, 1)} disabled={fi === sec.f.length - 1} style={{ ...btnSm, ...btnGhost, opacity: fi === sec.f.length - 1 ? 0.4 : 1 }}>↓</button>
                                <button onClick={() => delField(si, fi)} style={{ ...btnSm, background: "transparent", color: "#e5484d", border: `1px solid ${T.border}` }}>✕</button>
                              </div>
                            </div>

                            {["sel", "multi"].includes(f.t) && (
                              <div style={{ marginTop: 9 }}>
                                <label style={{ ...label, margin: "0 0 4px" }}>Options (one per line)</label>
                                <textarea rows={Math.min(6, (f.opts || []).length + 1)} value={(f.opts || []).join("\n")}
                                  onChange={e => setField(si, fi, { opts: e.target.value.split("\n").map(x => x.trim()).filter(Boolean) })}
                                  style={{ ...inputStyle, resize: "vertical" }} />
                              </div>
                            )}

                            <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 9, flexWrap: "wrap" }}>
                              <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: T.text2, margin: 0, fontWeight: 600 }}>
                                <input type="checkbox" checked={!!f.req} onChange={e => setField(si, fi, { req: e.target.checked ? 1 : undefined })} />
                                Required
                              </label>
                              <span style={{ fontSize: 11.5, color: T.text3, fontFamily: "monospace" }}>key: {f.k || "(from question text)"}{f.__new ? " · not saved yet" : ""}</span>
                              {used > 0 && <span style={{ fontSize: 11.5, color: "#b8860b", fontWeight: 600 }}>{used} submission{used === 1 ? "" : "s"} answered this</span>}
                            </div>
                          </div>
                        );
                      })}
                      <button onClick={() => addField(si)} style={{ ...btnGhost, borderStyle: "dashed" }}>+ Add field</button>
                    </div>
                  )}
                </div>
              );
            })}

            <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 14, flexWrap: "wrap" }}>
              <button onClick={addSection} style={{ ...btnGhost, borderStyle: "dashed" }}>+ Add section</button>
              <div style={{ flex: 1 }} />
              {ferr && <span style={{ fontSize: 12, color: "#e5484d", maxWidth: 460 }}>{ferr}</span>}
              {fsaved && !fsaving && !ferr && <span style={{ fontSize: 12, color: "#34a853" }}>✓ Published {fsaved.toLocaleTimeString()}</span>}
              <button onClick={() => { setFdraft(schema ? JSON.parse(JSON.stringify(schema)) : null); setFerr(null); }} style={btnGhost}>Revert</button>
              <button onClick={saveSchema} disabled={fsaving} style={btnPrimary}>{fsaving ? "Saving…" : "Save & publish form"}</button>
            </div>
            <div style={{ fontSize: 11.5, color: T.text3, marginTop: 8 }}>
              {fdraft.reduce((n, s2) => n + (s2.f || []).length, 0)} fields across {fdraft.length} sections · {fdraft.reduce((n, s2) => n + (s2.f || []).filter(f => f.req).length, 0)} required
            </div>
          </>)}
        </div>
      )}

      {/* ── PORTAL CONTENT ── */}
      {tab === "content" && (
        <div>
          <div style={{ ...card, padding: "10px 14px", marginBottom: 14, fontSize: 12, color: T.text2, display: "flex", alignItems: "center", gap: 10 }}>
            <span>💡</span>
            <span>Edits go <b>live on the portal immediately</b> - no redeploy; carriers see them on next page load. HTML like &lt;b&gt; is allowed. This includes the full on-site RFP (all sections) and the NDA text. The data tables (monthly volume, weights, geography, carrier mix) and download files are generated from shipment data - ask Claude to refresh those.</span>
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
