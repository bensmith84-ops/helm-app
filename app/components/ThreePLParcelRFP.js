"use client";
import React, { useState, useEffect, useCallback, useMemo } from "react";
import CopyInviteButton from "./CopyInviteButton";
import { supabase } from "../lib/supabase";
import { useTheme } from "../lib/theme";

const PORTAL_BASE = "https://helm-app-six.vercel.app/rfp/index.html";
const PREVIEW_KEY = "k7m2q9x4vt8bn3rf"; // internal preview capability key (rfp_preview_content)

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

// ---- Generic editors for content keys not in the curated FIELDS lists ----
// Covers everything added since the editor was built (returns_*, retail_*,
// downloads, etc.) so the whole portal is editable without code changes.
// The bidder portal appends an acceptance question per legal clause to the
// response form at render time (source of truth = legal_terms). Mirror that here
// so Compare and the CSV export show those answers instead of silently dropping them.
function normalizeLegalTerms(c) {
  let v = c?.legal_terms;
  if (v === undefined && c) {
    const k = Object.keys(c).find(k => /^legal[_\- ]?terms$/i.test(k));
    if (k) v = c[k];
  }
  if (typeof v === "string") { try { v = JSON.parse(v); } catch (e) { return []; } }
  if (v && !Array.isArray(v) && typeof v === "object") {
    v = v.legal_terms || v.clauses || v.terms || null;
    if (typeof v === "string") { try { v = JSON.parse(v); } catch (e) { v = null; } }
  }
  if (!Array.isArray(v)) return [];
  return v.map(t => (typeof t === "string" ? { heading: "", body: t } : t)).filter(t => t && (t.heading || t.body));
}
function withLegalSection(content) {
  const base = content?.response_form || null;
  if (!base) return base;
  const clauses = normalizeLegalTerms(content);
  if (!clauses.length) return base;
  if (base.some(sec => (sec.s || "").toLowerCase().startsWith("legal terms"))) return base;
  const f = [];
  clauses.forEach((t, i) => {
    const k = "legal_" + (t.key || ("clause" + (i + 1)));
    f.push({ k, l: (t.group ? t.group + " - " : "") + (t.heading || ("Clause " + (i + 1))), t: "sel", req: 1,
             opts: ["Accept as written", "Accept with exceptions (describe below)", "Cannot accept"] });
    f.push({ k: k + "_ex", l: "↳ Exception / proposed alternative language", t: "area" });
  });
  f.push({ k: "legal_insurance_confirm", l: "Can you meet the insurance schedule?", t: "sel", req: 1,
           opts: ["Yes - all limits met", "Yes - with variances described below", "No"] });
  f.push({ k: "legal_insurance_detail", l: "↳ Insurance variances or carrier detail", t: "area" });
  f.push({ k: "legal_counsel", l: "Contracting/legal point of contact", t: "text" });
  return base.concat([{ s: "Legal terms - acceptance", note: "Generated from the published legal terms. Edit the clauses in Portal Content; these questions follow automatically.", f }]);
}

// Execution copy of a signed NDA, rendered from the stored record. Mirrors the
// bidder-side renderer in public/rfp/index.html so both produce the same document.
function ndaDocumentHTML(o) {
  const e = v => String(v == null ? "" : v).replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
  const when = o.signed_at ? new Date(o.signed_at) : new Date();
  const d = o.details || {};
  const eb = { name: "Ben Smith", title: "Chief Operating Officer", company: "EARTH BREEZE, INC.", ...(o.eb || {}) };
  const row = (k, v) => (v ? `<tr><th>${e(k)}</th><td>${e(v)}</td></tr>` : "");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Signed NDA - ${e(o.company || o.name || "")}</title><style>
@page{margin:22mm 18mm}
body{font:12px/1.65 Georgia,"Times New Roman",serif;color:#111;max-width:760px;margin:0 auto;padding:24px}
h1{font-size:17px;margin:0 0 2px}.sub{font-size:11px;color:#555;margin:0 0 20px}
.body-text p{margin:0 0 10px}
.exec{margin-top:26px;border-top:1.5px solid #111;padding-top:14px;page-break-inside:avoid}
.exec h2{font-size:13px;margin:0 0 10px;text-transform:uppercase;letter-spacing:.02em}
table{border-collapse:collapse;width:100%;font-family:system-ui,sans-serif;font-size:11.5px}
th{text-align:left;padding:5px 12px 5px 0;color:#555;font-weight:600;width:190px;vertical-align:top;white-space:nowrap}
td{padding:5px 0;vertical-align:top}
.sig{margin-top:16px;font-family:"Segoe Script","Brush Script MT",cursive;font-size:21px;border-bottom:1px solid #111;display:inline-block;padding:0 26px 3px 2px}
.att{margin-top:18px;font-family:system-ui,sans-serif;font-size:10px;color:#666;border-top:1px dotted #bbb;padding-top:8px}
.parties{display:flex;gap:28px;margin:4px 0 14px}.party{flex:1;min-width:0}.pname{font-family:system-ui,sans-serif;font-weight:700;font-size:11.5px;letter-spacing:.03em}
.party table th{width:44px}.detail{margin-top:6px}
.noprint{margin:0 0 18px;font-family:system-ui,sans-serif}
button{font:13px system-ui;padding:8px 16px;border:0;border-radius:6px;background:#1C3883;color:#fff;cursor:pointer}
@media print{.noprint{display:none}}
</style></head><body>
<div class="noprint"><button onclick="window.print()">Download / print this NDA</button></div>
<h1>Mutual Non-Disclosure Agreement</h1>
<p class="sub">Earth Breeze${o.rfp_title ? " &middot; " + e(o.rfp_title) : ""}${o.rfp_code ? " (" + e(o.rfp_code) + ")" : ""}</p>
<div class="body-text">${o.nda_text || "<p>(Agreement text unavailable.)</p>"}</div>
<div class="exec"><h2>Agreed to and accepted by</h2>
<div class="parties">
<div class="party"><div class="pname">${e(eb.company)}</div><div class="sig">${e(eb.name)}</div>
<table>${row("By", eb.name)}${row("Its", eb.title)}${row("Date", when.toLocaleDateString())}</table></div>
<div class="party"><div class="pname">${e((o.company || "").toUpperCase())}</div><div class="sig">${e(o.name || "")}</div>
<table>${row("By", o.name)}${row("Its", o.title)}${row("Date", when.toLocaleDateString())}</table></div>
</div>
<table class="detail">
${row("Counterparty entity type", d.entity)}${row("Counterparty address", d.address)}
${row("Counterparty signer email", d.signer_email || o.email)}${row("Executed (date and time)", when.toLocaleString())}
${row("Agreement reference", o.rfp_code)}
</table>
<div class="att">Executed electronically. Earth Breeze, Inc. pre-executed this agreement through its authorized officer; it became effective upon the counterparty&rsquo;s signature, when the signatory confirmed authority to bind the named entity and accepted these terms by typing their full legal name in the Earth Breeze supplier portal. This copy was generated from the recorded signature on ${new Date().toLocaleString()}.</div>
</div></body></html>`;
}

const EXTRA_EXCLUDE = new Set(["response_form", "sku_profile"]); // edited in their own tabs
function detectKind(v) {
  if (typeof v === "string") return v.length > 90 ? "text" : "input";
  if (Array.isArray(v)) {
    if (v.length === 0) return "json";
    if (v.every(x => typeof x === "string")) return "list";
    if (v.every(x => Array.isArray(x))) return "table";
    if (v.every(x => x && typeof x === "object" && !Array.isArray(x))) {
      const flat = v.every(o => Object.values(o).every(val => typeof val !== "object" || val === null));
      return flat ? "objects" : "json";
    }
  }
  return "json";
}
function prettyKey(k) {
  return k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

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
  { key: "sku_profile",       label: "SKU profile",                          type: "skus" },
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
    if (f.type === "skus") { d[f.key] = Array.isArray(v) ? JSON.parse(JSON.stringify(v)) : []; continue; }
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
      c[f.key] = (Array.isArray(raw) ? raw : []).filter(r => String(r.sku || "").trim() || String(r.desc || "").trim());
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
  const PORTAL_URL = PORTAL_BASE + "?rfp=" + encodeURIComponent(rfpCode) + (rfpType === "internal" ? "&key=" + PREVIEW_KEY : "");
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
      setSchema(withLegalSection(data.content));
      setFdraft(data.content.response_form ? JSON.parse(JSON.stringify(data.content.response_form)) : null); // stored form only - legal section is derived
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

  const openNDACopy = (r) => {
    const w = window.open("", "_blank");
    if (!w) { setErr("Allow pop-ups to open the signed NDA copy."); return; }
    w.document.write(ndaDocumentHTML({
      name: r.nda_name, title: r.nda_title, company: r.nda_details?.company_legal || r.company,
      email: r.email, signed_at: r.nda_signed_at, details: r.nda_details || {},
      nda_text: (baseContent && baseContent.nda_text) || "",
      rfp_code: rfpCode, rfp_title: title,
      eb: {
        name: (baseContent && baseContent.nda_signatory_name) || "Ben Smith",
        title: (baseContent && baseContent.nda_signatory_title) || "Chief Operating Officer",
        company: (baseContent && baseContent.nda_company_legal) || "EARTH BREEZE, INC.",
      },
    }));
    w.document.close();
  };

  // Addressed to the forwarded signatory, not the original requester.
  const signatoryMailto = (r) => {
    const rfpName = title || rfpCode;
    const subject = encodeURIComponent(`Earth Breeze ${rfpName} - NDA for your signature`);
    const body = encodeURIComponent(
`Hi ${r.delegate_name || ""},

${r.name || "A colleague"}${r.company ? ` at ${r.company}` : ""} has asked you to sign the mutual NDA for the Earth Breeze ${rfpName} (${rfpCode}), as your organization's authorized signatory.

Open the link below, review the agreement, and sign in your own name. Earth Breeze has already countersigned; the agreement takes effect when you sign, and you can download the executed copy immediately afterwards.

${accessLink(r)}

Best regards,
Earth Breeze Procurement`);
    return `mailto:${r.delegate_email}?subject=${subject}&body=${body}`;
  };

  // Clears a signature entered on someone else's behalf. The access link keeps
  // working and returns to the NDA screen so the right person can sign.
  const resetSignature = async (r) => {
    if (!window.confirm(`Void the NDA signature recorded for ${r.nda_name || "this request"}?\n\nAccess to the full RFP is removed until the correct signatory signs from the same link. Use this when someone signed in another person's name.`)) return;
    setBusy(r.id);
    const { error } = await supabase.from("rfp_access_requests")
      .update({ nda_signed_at: null, nda_name: null, nda_title: null, nda_details: null })
      .eq("id", r.id);
    setBusy(null);
    if (error) { setErr("Could not void signature: " + error.message); return; }
    loadReqs();
  };

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inv, setInv] = useState({ company: "", name: "", email: "", waive: false, ref: "" });
  const [invBusy, setInvBusy] = useState(false);

  // Adds a bidder straight to the approved list. With "NDA already on file" the
  // NDA gate is satisfied by reference to the existing agreement - recorded as a
  // waiver, never as a portal signature, so the audit trail stays truthful.
  const inviteBidder = async () => {
    if (!inv.company.trim() || !inv.email.includes("@")) { setErr("Company and a valid email are required."); return; }
    setInvBusy(true); setErr(null);
    const now = new Date().toISOString();
    const row = {
      rfp_code: RFP_CODE,
      company: inv.company.trim(),
      name: inv.name.trim() || null,
      email: inv.email.trim(),
      status: "approved",
      decided_at: now,
    };
    if (inv.waive) {
      row.nda_signed_at = now;
      row.nda_name = inv.name.trim() || inv.company.trim();
      row.nda_title = "NDA on file";
      row.nda_details = { waiver: true, waiver_ref: inv.ref.trim() || null, waived_by: "admin", waived_at: now };
    }
    const { data, error } = await supabase.from("rfp_access_requests").insert(row).select().maybeSingle();
    setInvBusy(false);
    if (error) { setErr("Could not add bidder: " + error.message); return; }
    setInviteOpen(false);
    setInv({ company: "", name: "", email: "", waive: false, ref: "" });
    await loadReqs();
    if (data?.id) { copyLink(data); }
  };

  const copyLink = async (r) => {
    try { await navigator.clipboard.writeText(accessLink(r)); setCopied(r.id); setTimeout(() => setCopied(null), 1800); } catch (e) {}
  };

  // Deadline comes from the portal's own timeline so the invite can never
  // contradict what the bidder reads on the page.
  const dueLine = () => {
    const rows = (baseContent && baseContent.timeline_rows) || [];
    const hit = rows.find(row => /due|deadline|submission/i.test(String(row && row[0])));
    return hit ? `Proposals are due ${String(hit[1]).replace(/<[^>]+>/g, "")}.` : "Submission deadlines are listed in the portal timeline.";
  };

  const mailtoHref = (r) => {
    const rfpName = title || rfpCode;
    const subject = encodeURIComponent(`Earth Breeze ${rfpName} - access approved`);
    const body = encodeURIComponent(
`Hi ${r.name || ""},

Your access to the Earth Breeze ${rfpName} (${rfpCode}) has been approved.

Open your personal access link below, sign the NDA, and you'll have the full RFP, data tables, and downloads:

${accessLink(r)}

${dueLine()} Questions can be submitted through the portal.

Best regards,
Earth Breeze Procurement`);
    return `mailto:${r.email}?subject=${subject}&body=${body}`;
  };

  const [jsonMode, setJsonMode] = useState({});
  const [newKey, setNewKey] = useState("");
  const [newKind, setNewKind] = useState("text");
  const [extraDraft, setExtraDraft] = useState({});   // generic editors: key -> value (parsed)
  const [extraJsonErr, setExtraJsonErr] = useState({}); // key -> parse error for raw JSON editors
  const extraKeys = useMemo(() => {
    const covered = new Set(FIELDS.map(f => f.key));
    const keys = new Set([...Object.keys(baseContent || {}), ...Object.keys(extraDraft)]);
    return [...keys].filter(k => !covered.has(k) && !EXTRA_EXCLUDE.has(k)).sort();
  }, [baseContent, FIELDS, extraDraft]);
  const setExtra = (k, v) => setExtraDraft(p => ({ ...p, [k]: v }));
  const extraVal = (k) => (k in extraDraft ? extraDraft[k] : (baseContent || {})[k]);

  const save = async () => {
    if (Object.keys(extraJsonErr).some(k => extraJsonErr[k])) { setErr("Fix the JSON errors highlighted below before publishing."); return; }
    // Guardrail: the B2B section intentionally publishes no pricing.
    const leak = Object.entries(extraDraft).find(([k, v]) => k.startsWith("retail_") && /\$\s?\d/.test(JSON.stringify(v)));
    if (leak && !window.confirm(`"${prettyKey(leak[0])}" contains a dollar amount. The Retail & wholesale section intentionally publishes no pricing. Publish anyway?`)) return;
    setSaving(true); setErr(null);
    try {
      // Merge edits over a FRESH read (not the mount-time snapshot) so data updated
      // elsewhere (packet tables, downloads, etc.) is never clobbered by a stale save.
      const { data: fresh } = await supabase.from("rfp_portal_content").select("content").eq("rfp_code", RFP_CODE).maybeSingle();
      const content = { ...(fresh?.content || baseContent || {}), ...fromDraft(draft, FIELDS), ...extraDraft };
      const { error } = await supabase.from("rfp_portal_content").upsert({ rfp_code: RFP_CODE, content, updated_at: new Date().toISOString() });
      if (error) throw error;
      setBaseContent(content);
      setExtraDraft({});
      setSavedAt(new Date());
    } catch (e) { setErr(e.message || String(e)); }
    setSaving(false);
  };

  const [skuBusy, setSkuBusy] = useState(null);
  const SKU_GROUPS = [
    { title: "Identity", min: 260, cols: [
      { k: "sku",  l: "SKU",         ph: "L-06-LS-FS30S" },
      { k: "desc", l: "Description", ph: "Laundry Sheets - Fresh Scent, 30ct", grow: 2 },
    ]},
    { title: "Selling unit", min: 190, cols: [
      { k: "weight", l: "Unit weight",       ph: "4.16 oz" },
      { k: "dims",   l: "Unit dimensions (L x W x H)", ph: "9.76 x 6.46 x 0.35 in" },
    ]},
    { title: "Master carton", min: 190, cols: [
      { k: "qty_carton",     l: "Units per carton",        ph: "48" },
      { k: "carton_dims",    l: "Carton dimensions",       ph: "15 x 12 x 9 in" },
      { k: "cartons_pallet", l: "Cartons per pallet",      ph: "60" },
    ]},
    { title: "Cartons per container", min: 170, cols: [
      { k: "c20",   l: "20' standard",  ph: "620" },
      { k: "c40",   l: "40' standard",  ph: "1,280" },
      { k: "c40hc", l: "40' high cube", ph: "1,450" },
    ]},
  ];
  const skuRows = () => (Array.isArray(draft?.sku_profile) ? draft.sku_profile : []);
  const setSkuRows = (fn) => setDraft(d => {
    const rows = JSON.parse(JSON.stringify(Array.isArray(d.sku_profile) ? d.sku_profile : []));
    fn(rows);
    return { ...d, sku_profile: rows };
  });
  const setSkuCell = (i, k, v) => setSkuRows(rows => { rows[i] = { ...(rows[i] || {}), [k]: v }; });
  const addSkuRow = () => setSkuRows(rows => rows.push(Object.fromEntries(SKU_KEYS.map(k => [k, ""]))));
  const delSkuRow = (i) => { if (!confirm(`Remove ${skuRows()[i]?.sku || "this SKU"} from the table?`)) return; setSkuRows(rows => rows.splice(i, 1)); };
  const moveSkuRow = (i, dir) => setSkuRows(rows => { const j = i + dir; if (j < 0 || j >= rows.length) return; [rows[i], rows[j]] = [rows[j], rows[i]]; });

  const uploadSkuImage = async (i, file) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { alert("Please choose an image file."); return; }
    if (file.size > 5 * 1024 * 1024) { alert("Images must be under 5 MB."); return; }
    setSkuBusy(i);
    try {
      const safe = (skuRows()[i]?.sku || "sku").replace(/[^A-Za-z0-9._-]/g, "_");
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${RFP_CODE}/skus/${safe}_${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("rfp-assets").upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      const { data } = supabase.storage.from("rfp-assets").getPublicUrl(path);
      setSkuCell(i, "img", data.publicUrl);
    } catch (e) { alert("Upload failed: " + (e.message || e)); }
    setSkuBusy(null);
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
        <CopyInviteButton rfpCode={rfpCode} rfpType={rfpType} style={{ ...btnSm, ...btnGhost }} />
        <button onClick={async () => {
          const link = `${PORTAL_URL}&preview=1&key=${PREVIEW_KEY}`;
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
          <div style={{ display: "flex", marginBottom: 10, gap: 8 }}>
            <button onClick={() => setInviteOpen(o => !o)} style={{ ...btnGhost, fontWeight: 600 }}>{inviteOpen ? "Cancel" : "+ Invite bidder directly"}</button>
            <div style={{ flex: 1 }} />
            <button onClick={loadReqs} style={btnGhost}>Refresh</button>
          </div>
          {inviteOpen && (
            <div style={{ ...card, padding: 16, marginBottom: 12 }}>
              <div style={{ fontSize: 12.5, color: T.text2, marginBottom: 12 }}>
                Adds a bidder straight to the approved list - no request needed. Tick the NDA box if you already hold a signed NDA with them and they should skip that gate entirely. The access link is copied to your clipboard when you save.
              </div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 200px" }}>
                  <label style={label}>Company *</label>
                  <input value={inv.company} onChange={e => setInv(p => ({ ...p, company: e.target.value }))} placeholder="Next3PL" style={inputStyle} />
                </div>
                <div style={{ flex: "1 1 180px" }}>
                  <label style={label}>Contact name</label>
                  <input value={inv.name} onChange={e => setInv(p => ({ ...p, name: e.target.value }))} placeholder="Full name" style={inputStyle} />
                </div>
                <div style={{ flex: "1 1 200px" }}>
                  <label style={label}>Contact email *</label>
                  <input value={inv.email} onChange={e => setInv(p => ({ ...p, email: e.target.value }))} placeholder="name@company.com" style={inputStyle} />
                </div>
              </div>
              <label style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 14, fontSize: 12.5, color: T.text, cursor: "pointer" }}>
                <input type="checkbox" checked={inv.waive} onChange={e => setInv(p => ({ ...p, waive: e.target.checked }))} style={{ marginTop: 2 }} />
                <span><b>NDA already on file</b> - skip the portal NDA. They go straight into the full RFP from their link. Recorded as a waiver against the existing agreement, not as a new signature.</span>
              </label>
              {inv.waive && (
                <div style={{ marginTop: 10 }}>
                  <label style={label}>Existing NDA reference (recommended)</label>
                  <input value={inv.ref} onChange={e => setInv(p => ({ ...p, ref: e.target.value }))} placeholder="e.g. MNDA executed 14 March 2025 - DocuSign 90862C1E" style={inputStyle} />
                </div>
              )}
              <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center" }}>
                <button onClick={inviteBidder} disabled={invBusy} style={{ ...btnSm, background: T.accent, color: "#fff" }}>{invBusy ? "Adding…" : "Add bidder & copy link"}</button>
                <span style={{ fontSize: 11.5, color: T.text3 }}>You send the link yourself - nothing is emailed automatically.</span>
              </div>
            </div>
          )}
          {reqsLoading && <div style={{ padding: 30, color: T.text3, fontSize: 13 }}>Loading…</div>}
          {!reqsLoading && !reqs.length && (
            <div style={{ ...card, padding: 36, textAlign: "center", color: T.text3, fontSize: 13 }}>No access requests yet. They appear here the moment a carrier submits the request form on the portal.</div>
          )}
          {groupByOrg(reqs).map(g => {
            const anyAccess = g.rows.some(r => r.nda_signed_at);
            const signer = g.rows.find(r => r.nda_signed_at && !r.nda_details?.waiver);
            const waived = g.rows.find(r => r.nda_details?.waiver);
            const pending = g.rows.filter(r => r.status === "pending").length;
            return (
            <div key={g.key} style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "6px 2px 8px" }}>
                <span style={{ fontSize: 13.5, fontWeight: 800, color: T.text }}>{g.label}</span>
                <span style={{ fontSize: 11.5, color: T.text3 }}>{g.rows.length} {g.rows.length === 1 ? "person" : "people"}</span>
                {signer && <span style={{ fontSize: 11.5, color: "#34a853", fontWeight: 600 }}>· NDA signed by {signer.nda_name}</span>}
                {!signer && waived && <span style={{ fontSize: 11.5, color: "#0b7285", fontWeight: 600 }}>· NDA on file (waived)</span>}
                {!anyAccess && <span style={{ fontSize: 11.5, color: T.text3 }}>· no NDA yet</span>}
                {pending > 0 && <span style={{ fontSize: 11.5, color: "#b8860b", fontWeight: 600 }}>· {pending} awaiting approval</span>}
                <div style={{ flex: 1 }} />
                <span style={{ fontSize: 11, color: T.text3 }}>One submission expected per organisation</span>
              </div>
              {g.rows.map(r => {
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
                  {r.nda_signed_at && r.nda_details?.waiver
                    ? <span style={{ fontSize: 11.5, color: "#0b7285", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        🔓 NDA gate waived - existing NDA on file{r.nda_details.waiver_ref ? ` (${r.nda_details.waiver_ref})` : ""} · added {new Date(r.nda_signed_at).toLocaleDateString()}
                        <button onClick={() => copyLink(r)} style={{ ...btnSm, ...btnGhost, fontWeight: 500 }}>{copied === r.id ? "✓ Copied" : "Copy access link"}</button>
                      </span>
                    : r.nda_signed_at
                    ? <span style={{ fontSize: 11.5, color: "#34a853", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        ✓ NDA signed - {r.nda_name}{r.nda_title ? `, ${r.nda_title}` : ""}{r.nda_details?.signer_email ? ` (${r.nda_details.signer_email})` : ""} · {new Date(r.nda_signed_at).toLocaleString()}
                        <button onClick={() => openNDACopy(r)} style={{ ...btnSm, ...btnGhost, fontWeight: 500 }}>NDA copy</button>
                        <button onClick={() => resetSignature(r)} disabled={busy === r.id} style={{ ...btnSm, ...btnGhost, fontWeight: 500, color: "#e5484d" }} title="Void this signature so the correct signatory can sign from the same link">Void signature</button>
                      </span>
                    : r.status === "approved" && (r.delegate_email
                      ? <span style={{ fontSize: 11.5, color: "#b8860b", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          ✉ NDA forwarded to {r.delegate_name || r.delegate_email} ({r.delegate_email}) - awaiting signature
                          <button onClick={() => copyLink(r)} style={{ ...btnSm, ...btnGhost, fontWeight: 500 }}>{copied === r.id ? "✓ Copied" : "Copy signing link"}</button>
                          <a href={signatoryMailto(r)} style={{ ...btnSm, ...btnGhost, fontWeight: 500, textDecoration: "none" }}>Email signatory</a>
                        </span>
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
                  {sibs.length > 1 && (isLatest
                    ? <span title="Another person from this organisation also submitted. This is the most recent." style={{ fontSize: 10.5, fontWeight: 700, color: "#0b7285", background: "rgba(11,114,133,0.10)", padding: "2px 7px", borderRadius: 20 }}>latest of {sibs.length} from this org</span>
                    : <span title={`Superseded by a later submission from ${supersededBy?.contact_name || "a colleague"}`} style={{ fontSize: 10.5, fontWeight: 700, color: "#b8860b", background: "rgba(184,134,11,0.12)", padding: "2px 7px", borderRadius: 20 }}>superseded</span>)}
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
            <span>Edits go <b>live on the portal immediately</b> - no redeploy; carriers see them on next page load. HTML like &lt;b&gt; is allowed. Every published section is editable here - the curated fields below, then everything else under "All other sections" (returns, retail/B2B, downloads, notes). The data tables (monthly volume, weights, geography, carrier mix) and download files are generated from shipment data - ask Claude to refresh those.</span>
          </div>
          {contentLoading && <div style={{ padding: 30, color: T.text3, fontSize: 13 }}>Loading…</div>}
          {!contentLoading && draft && (
            <div style={{ ...card, padding: 18 }}>
              {FIELDS.map(f => (
                <div key={f.key}>
                  <label style={label}>{f.label}</label>
                  {f.type === "skus" ? (
                    <div>
                      <div style={{ fontSize: 11.5, color: T.text3, marginBottom: 10 }}>
                        One row per SKU. Blank cells show as “TBC” to bidders. Images upload straight to Helm - no links needed.
                      </div>
                      {skuRows().map((row, i) => (
                        <div key={i} style={{ border: `1px solid ${T.border}`, borderRadius: 10, padding: 16, marginBottom: 14, background: T.surface2 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 12 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: T.text3, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 99, padding: "2px 9px" }}>{i + 1}</span>
                            <b style={{ fontSize: 13, color: T.text }}>{row.sku || "New SKU"}</b>
                            {row.desc && <span style={{ fontSize: 12, color: T.text3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{row.desc}</span>}
                            <div style={{ flex: 1 }} />
                            <button onClick={() => moveSkuRow(i, -1)} disabled={i === 0} style={{ ...btnSm, ...btnGhost, opacity: i === 0 ? 0.4 : 1 }}>↑</button>
                            <button onClick={() => moveSkuRow(i, 1)} disabled={i === skuRows().length - 1} style={{ ...btnSm, ...btnGhost, opacity: i === skuRows().length - 1 ? 0.4 : 1 }}>↓</button>
                            <button onClick={() => delSkuRow(i)} style={{ ...btnSm, background: "transparent", color: "#e5484d", border: `1px solid ${T.border}` }}>Remove</button>
                          </div>
                          <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
                            {/* image */}
                            <div style={{ flexShrink: 0, textAlign: "center" }}>
                              {row.img ? (
                                <img src={row.img} alt={row.sku || ""} style={{ width: 92, height: 92, objectFit: "contain", borderRadius: 8, border: `1px solid ${T.border}`, background: "#fff", display: "block" }} />
                              ) : (
                                <div style={{ width: 92, height: 92, borderRadius: 8, border: `1px dashed ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center", color: T.text3, fontSize: 11 }}>no image</div>
                              )}
                              <label style={{ display: "block", marginTop: 7, fontSize: 11.5, color: T.accent, cursor: "pointer", fontWeight: 600 }}>
                                {skuBusy === i ? "Uploading…" : row.img ? "Replace" : "Upload"}
                                <input type="file" accept="image/*" style={{ display: "none" }}
                                  onChange={e => { uploadSkuImage(i, e.target.files?.[0]); e.target.value = ""; }} />
                              </label>
                              {row.img && (
                                <div onClick={() => setSkuCell(i, "img", "")} style={{ fontSize: 10, color: T.text3, cursor: "pointer", marginTop: 2 }}>remove</div>
                              )}
                            </div>
                            {/* fields, grouped and wrapping so nothing gets squeezed */}
                            <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 12 }}>
                              {SKU_GROUPS.map(g => (
                                <div key={g.title}>
                                  <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 5 }}>{g.title}</div>
                                  <div style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${g.min}px, 1fr))`, gap: 10 }}>
                                    {g.cols.map(col => (
                                      <div key={col.k} style={{ gridColumn: col.grow ? `span ${col.grow}` : undefined, minWidth: 0 }}>
                                        <label style={{ display: "block", fontSize: 11.5, fontWeight: 600, color: T.text2, marginBottom: 4 }}>{col.l}</label>
                                        <input value={row[col.k] || ""} placeholder={col.ph}
                                          onChange={e => setSkuCell(i, col.k, e.target.value)}
                                          style={{ ...inputStyle, background: T.surface, padding: "9px 11px", fontSize: 13.5 }} />
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      ))}
                      <button onClick={addSkuRow} style={{ ...btnGhost, borderStyle: "dashed" }}>+ Add SKU</button>
                      <span style={{ fontSize: 11.5, color: T.text3, marginLeft: 10 }}>{skuRows().length} SKU{skuRows().length === 1 ? "" : "s"}</span>
                    </div>
                  ) : f.type === "input" ? (
                    <input style={inputStyle} value={draft[f.key]} onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))} />
                  ) : (
                    <textarea style={{ ...inputStyle, resize: "vertical" }} rows={f.rows || 4} value={draft[f.key]} onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))} />
                  )}
                </div>
              ))}
{extraKeys.length > 0 && (
                  <div style={{ marginTop: 26, borderTop: `1px solid ${T.border}`, paddingTop: 18 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <b style={{ fontSize: 13, color: T.text }}>All other sections</b>
                      <div style={{ flex: 1 }} />
                      <input placeholder="new_section_key" value={newKey} onChange={e => setNewKey(e.target.value.replace(/[^a-z0-9_]/g, "_").toLowerCase())} style={{ ...inputStyle, width: 190 }} />
                      <select value={newKind} onChange={e => setNewKind(e.target.value)} style={{ ...inputStyle, width: 150 }}>
                        <option value="input">Short text</option>
                        <option value="text">Long text</option>
                        <option value="list">Bullet list</option>
                        <option value="table">Table</option>
                        <option value="objects">Labelled rows</option>
                      </select>
                      <button style={{ ...btnSm, ...btnGhost }} disabled={!newKey} onClick={() => {
                        if (!newKey) return;
                        if (extraKeys.includes(newKey) || (baseContent || {})[newKey] !== undefined) { setErr(`"${newKey}" already exists.`); return; }
                        const seed = newKind === "input" || newKind === "text" ? ""
                          : newKind === "list" ? [""]
                          : newKind === "table" ? [["", ""]]
                          : [{ heading: "", body: "" }];
                        setExtra(newKey, seed); setNewKey(""); setErr(null);
                      }}>+ Add section</button>
                    </div>
                    <div style={{ fontSize: 11.5, color: T.text3, margin: "4px 0 14px" }}>
                      Everything else this portal publishes, editable directly. Tables add/remove rows; long text allows &lt;b&gt; HTML. These save with the same Save &amp; publish button.
                    </div>
                    {extraKeys.map(k => {
                      const v = extraVal(k);
                      const kind = detectKind((baseContent || {})[k] !== undefined ? (baseContent || {})[k] : extraDraft[k]);
                      return (
                        <div key={k} style={{ marginBottom: 18 }}>
                          <label style={{ ...label, display: "flex", alignItems: "center", gap: 8 }}>
                            {prettyKey(k)}
                            {k in extraDraft && <span style={{ fontSize: 10, color: T.accent }}>● edited</span>}
                            <div style={{ flex: 1 }} />
                            {kind !== "json" && (
                              <button onClick={() => setJsonMode(p => ({ ...p, [k]: !p[k] }))} style={{ ...btnSm, ...btnGhost, fontWeight: 500 }}>
                                {jsonMode[k] ? "◂ Back to editor" : "Edit as JSON"}
                              </button>
                            )}
                          </label>
                          {jsonMode[k] && kind !== "json" && (
                            <div>
                              <textarea
                                defaultValue={JSON.stringify(v, null, 2)}
                                rows={12}
                                onChange={e => {
                                  try { setExtra(k, JSON.parse(e.target.value)); setExtraJsonErr(p => ({ ...p, [k]: null })); }
                                  catch (er) { setExtraJsonErr(p => ({ ...p, [k]: er.message })); }
                                }}
                                style={{ ...inputStyle, resize: "vertical", fontFamily: "ui-monospace, monospace", fontSize: 11.5, lineHeight: 1.5, borderColor: extraJsonErr[k] ? "#e5484d" : undefined }} />
                              {extraJsonErr[k]
                                ? <div style={{ fontSize: 11, color: "#e5484d", marginTop: 3 }}>Invalid JSON: {extraJsonErr[k]}</div>
                                : <div style={{ fontSize: 11, color: T.text3, marginTop: 3 }}>Paste replaces this whole section. Switch back to the editor to check it looks right before publishing.</div>}
                            </div>
                          )}
                          {!jsonMode[k] && kind === "input" && <input value={v ?? ""} onChange={e => setExtra(k, e.target.value)} style={inputStyle} />}
                          {!jsonMode[k] && kind === "text" && <textarea value={v ?? ""} onChange={e => setExtra(k, e.target.value)} rows={Math.min(8, Math.max(3, Math.ceil(String(v ?? "").length / 110)))} style={{ ...inputStyle, resize: "vertical", lineHeight: 1.5 }} />}
                          {!jsonMode[k] && kind === "list" && (
                            <div>
                              {(v || []).map((item, i) => (
                                <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                                  <textarea value={item} rows={Math.max(1, Math.ceil(String(item).length / 100))} onChange={e => { const n = [...v]; n[i] = e.target.value; setExtra(k, n); }} style={{ ...inputStyle, flex: 1, resize: "vertical", lineHeight: 1.45 }} />
                                  <button onClick={() => setExtra(k, v.filter((_, j) => j !== i))} style={{ ...btnSm, ...btnGhost }}>✕</button>
                                </div>
                              ))}
                              <button onClick={() => setExtra(k, [...(v || []), ""])} style={{ ...btnSm, ...btnGhost }}>+ Add item</button>
                            </div>
                          )}
                          {!jsonMode[k] && kind === "table" && (
                            <div style={{ overflowX: "auto" }}>
                              {(v || []).map((row, i) => (
                                <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
                                  {row.map((cell, j) => (
                                    <input key={j} value={cell ?? ""} onChange={e => { const n = v.map(r => [...r]); n[i][j] = e.target.value; setExtra(k, n); }} style={{ ...inputStyle, flex: j === 0 ? 2 : 1, minWidth: 90 }} />
                                  ))}
                                  <button onClick={() => { const n = v.map(r => [...r]); if (i > 0) { const t = n[i-1]; n[i-1] = n[i]; n[i] = t; setExtra(k, n); } }} disabled={i === 0} style={{ ...btnSm, ...btnGhost, opacity: i === 0 ? .4 : 1 }}>↑</button>
                                  <button onClick={() => setExtra(k, v.filter((_, j) => j !== i))} style={{ ...btnSm, ...btnGhost }}>✕</button>
                                </div>
                              ))}
                              <button onClick={() => setExtra(k, [...(v || []), new Array((v?.[0] || ["",""]).length).fill("")])} style={{ ...btnSm, ...btnGhost }}>+ Add row</button>
                            </div>
                          )}
                          {!jsonMode[k] && kind === "objects" && (() => {
                            const cols = Array.from(new Set((v || []).flatMap(o => Object.keys(o))));
                            return (
                              <div style={{ overflowX: "auto" }}>
                                <div style={{ display: "flex", gap: 6, marginBottom: 4 }}>
                                  {cols.map(c => <span key={c} style={{ flex: 1, minWidth: 110, fontSize: 10.5, color: T.text3, fontWeight: 700, textTransform: "uppercase" }}>{c}</span>)}
                                  <span style={{ width: 58 }} />
                                </div>
                                {(v || []).map((o, i) => (
                                  <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                                    {cols.map(c => (
                                      <textarea key={c} value={o[c] ?? ""} rows={Math.max(1, Math.ceil(String(o[c] ?? "").length / 60))} onChange={e => { const n = v.map(x => ({ ...x })); n[i][c] = e.target.value; setExtra(k, n); }} style={{ ...inputStyle, flex: 1, minWidth: 110, resize: "vertical", lineHeight: 1.4 }} />
                                    ))}
                                    <button onClick={() => setExtra(k, v.filter((_, j) => j !== i))} style={{ ...btnSm, ...btnGhost, alignSelf: "flex-start" }}>✕</button>
                                  </div>
                                ))}
                                <button onClick={() => setExtra(k, [...(v || []), Object.fromEntries(cols.map(c => [c, ""]))])} style={{ ...btnSm, ...btnGhost }}>+ Add row</button>
                              </div>
                            );
                          })()}
                          {kind === "json" && (
                            <div>
                              <textarea
                                defaultValue={JSON.stringify(v, null, 2)}
                                rows={8}
                                onChange={e => {
                                  try { setExtra(k, JSON.parse(e.target.value)); setExtraJsonErr(p => ({ ...p, [k]: null })); }
                                  catch (er) { setExtraJsonErr(p => ({ ...p, [k]: er.message })); }
                                }}
                                style={{ ...inputStyle, resize: "vertical", fontFamily: "ui-monospace, monospace", fontSize: 11.5, lineHeight: 1.5, borderColor: extraJsonErr[k] ? "#e5484d" : undefined }} />
                              {extraJsonErr[k] && <div style={{ fontSize: 11, color: "#e5484d", marginTop: 3 }}>Invalid JSON: {extraJsonErr[k]}</div>}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
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
