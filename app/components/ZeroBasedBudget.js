"use client";
// Finance > Zero-Based Budget: a zero-based Opex plan for one year.
// People: an org chart imported from the HRIS export (current comp in each
// person's pay currency), where each person is kept, removed or added and their
// plan-year salary, bonus and paid months are set; FX rates convert to USD and
// departments marked COGS (the KY plant) sit outside the Opex totals.
// Vendors and software: every Opex vendor from QuickBooks (baseline = trailing
// actuals) starts "to decide" and counts as zero until kept or changed; new
// tools are searched in QuickBooks or priced from public pricing pages.
// Removed: what was cut. Export: the whole plan as an Excel workbook.
// Data lives behind POST /zbb (named people only), not /rest/v1, because of salaries.
import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from "react";
import { T } from "../tokens";
import { supabase } from "../lib/supabase";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DEFAULT_HIDDEN = ["Direct Ad Spend", "Depreciation & Amortization", "COGS"];
const PAY_ACCT = /^600[1-5]\d$/; // salaries, benefits, payroll tax, 401k, bonus, severance
const SALARY_ACCT = /^600(1\d|2[0-3])$/;
const LOAD_ACCT = /^600(25|30|40)$/;

const money = (n) => {
  const v = Number(n) || 0; const a = Math.abs(v);
  const s = a >= 1e6 ? `$${(a / 1e6).toFixed(2)}M` : a >= 1e4 ? `$${(a / 1e3).toFixed(0)}K` : a >= 1e3 ? `$${(a / 1e3).toFixed(1)}K` : `$${a.toFixed(0)}`;
  return v < 0 ? `−${s}` : s;
};
const full = (n) => `$${Math.round(Number(n) || 0).toLocaleString("en-US")}`;
const signed = (n) => (n > 0 ? "+" : "") + money(n);
const local = (n, cur) => (cur && cur !== "USD" ? `${cur} ${Math.round(Number(n) || 0).toLocaleString("en-US")}` : full(n));
const parseMoney = (s) => {
  let t = String(s ?? "").replace(/[$,\s]/g, "").replace(/^[A-Z]{3}/i, "");
  const k = /k$/i.test(t); const m = /m$/i.test(t); t = t.replace(/[km]$/i, "");
  const n = parseFloat(t);
  return Number.isFinite(n) ? n * (k ? 1e3 : m ? 1e6 : 1) : 0;
};

async function call(body) {
  const { data, error } = await supabase.functions.invoke("zbb", { body });
  if (error) {
    let msg = error.message;
    try { const j = await error.context?.json?.(); if (j?.error) msg = j.error; } catch {}
    throw new Error(msg);
  }
  return data;
}

// SheetJS from its CDN, as the 3PL billing import does.
let xlsxPromise = null;
function loadXLSX() {
  if (typeof window !== "undefined" && window.XLSX) return Promise.resolve(window.XLSX);
  if (xlsxPromise) return xlsxPromise;
  xlsxPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
    s.onload = () => resolve(window.XLSX);
    s.onerror = () => { xlsxPromise = null; reject(new Error("Could not load the Excel library")); };
    document.head.appendChild(s);
  });
  return xlsxPromise;
}

// ── People cost model ─────────────────────────────────────────────────────────
// ctx = { load (%), fx: {CUR: USD per unit}, cogs: Set(departments outside Opex) }
const fxOf = (p, ctx) => (p.currency && p.currency !== "USD" ? Number(ctx.fx?.[p.currency]) || 0 : 1);
const paidMonths = (p) => (p.status === "remove" ? Math.max(0, Number(p.end_month) || 0) : Math.max(0, (Number(p.end_month) || 12) - (Number(p.start_month) || 1) + 1));
// Person costs are pay only (salary + bonus, USD, for the months paid). Payroll taxes and
// benefits are a separate budget line: ctx.load % of total headcount cost (taxLine below).
const personCost = (p, ctx) => ((Number(p.salary) || 0) + (Number(p.bonus) || 0)) * fxOf(p, ctx) * paidMonths(p) / 12;
// Current run rate: today's salary (from the HRIS export) in USD. New roles have none.
const personCurrent = (p, ctx) => (p.status === "new" || !p.is_existing ? 0 : (Number(p.current_salary) || 0) * fxOf(p, ctx));
const taxLine = (headcountCost, ctx) => headcountCost * (Number(ctx.load) || 0) / 100;
const TAX_NOTE = (load) => `Calculated at ${load}% of total headcount cost (salary + bonus); set the rate in the header.`;
const isOpex = (p, ctx) => !ctx.cogs.has(p.department || "");
const changePct = (p) => (Number(p.current_salary) > 0 ? ((Number(p.salary) || 0) / Number(p.current_salary) - 1) * 100 : null);
const COGS = "COGS"; // lines moved out of Opex: listed, but outside the Opex baseline and plan
const catLabel = (c) => (c === "People Costs" ? "Other people costs (hiring, training, perks, fees)" : c === COGS ? "COGS (moved out of Opex)" : c);
const lineAmount = (l) => (l.status === "keep" || l.status === "change" || l.status === "new" ? Number(l.amount) || 0 : 0);

const STATUS = {
  keep: { label: "Keep", c: () => T.green },
  change: { label: "Change", c: () => T.amber || T.yellow },
  remove: { label: "Remove", c: () => T.red },
  new: { label: "New", c: () => T.blue || T.accent },
  review: { label: "To decide", c: () => T.text3 },
};

function Pill({ status, small }) {
  const s = STATUS[status] || STATUS.review;
  return <span style={{ fontSize: small ? 10 : 11, fontWeight: 700, color: s.c(), border: `1px solid ${s.c()}55`, background: `${s.c()}14`, borderRadius: 10, padding: small ? "0 6px" : "1px 8px", whiteSpace: "nowrap" }}>{s.label}</span>;
}

function MoneyInput({ value, onSave, width = 96, placeholder = "$0", disabled }) {
  const [v, setV] = useState(value ? String(Math.round(value)) : "");
  useEffect(() => { setV(value ? String(Math.round(value)) : ""); }, [value]);
  const commit = () => { const n = parseMoney(v); if (Math.round(n) !== Math.round(Number(value) || 0)) onSave(n); };
  return (
    <input value={v} disabled={disabled} placeholder={placeholder} inputMode="decimal"
      onChange={(e) => setV(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") { setV(value ? String(Math.round(value)) : ""); e.currentTarget.blur(); } }}
      style={{ width, textAlign: "right", padding: "4px 6px", fontSize: 12, borderRadius: 5, border: `1px solid ${T.border}`, background: disabled ? "transparent" : T.surface2, color: T.text, fontVariantNumeric: "tabular-nums" }} />
  );
}

const btn = (active, color) => ({
  padding: "4px 10px", fontSize: 11, fontWeight: 600, borderRadius: 6, cursor: "pointer",
  border: `1px solid ${active ? (color || T.accent) : T.border}`,
  background: active ? `${color || T.accent}1f` : "transparent",
  color: active ? (color || T.accent) : T.text2,
});
const card = () => ({ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10 });
const th = { padding: "6px 8px", fontSize: 10, fontWeight: 700, color: "var(--zbb-th)", textTransform: "uppercase", letterSpacing: ".04em", textAlign: "left", whiteSpace: "nowrap" };

// Plan totals for one version (used by the page and by Compare versions).
function computeTotals(data, hidden, ctx) {
    if (!data) return null;
    const visible = (c) => c !== COGS && !hidden.includes(c || "");
    // Non-pay baseline follows each line's category, so a vendor moved to another bucket
    // (or to COGS) takes its baseline with it. Before actuals are pulled there are no lines.
    const base = {}; let payBase = 0; let salBase = 0; let loadBase = 0;
    const fromLines = data.lines.some((l) => l.source === "qbo");
    for (const a of data.baseline) {
      if (PAY_ACCT.test(a.account_num)) { payBase += a.total; if (SALARY_ACCT.test(a.account_num)) salBase += a.total; if (LOAD_ACCT.test(a.account_num)) loadBase += a.total; continue; }
      if (!fromLines) base[a.category] = (base[a.category] || 0) + a.total;
    }
    if (fromLines) for (const l of data.lines) { const c = l.category || "Non-Fixed and Other"; base[c] = (base[c] || 0) + (Number(l.baseline) || 0); }
    const cats = {};
    const ensure = (c) => cats[c] || (cats[c] = { category: c, baseline: 0, plan: 0, review: 0, keep: 0, change: 0, remove: 0, newN: 0, removed: 0, added: 0 });
    for (const [c, v] of Object.entries(base)) ensure(c).baseline = v;
    for (const l of data.lines) {
      const e = ensure(l.category || "Non-Fixed and Other");
      e.plan += lineAmount(l);
      if (l.status === "review") e.review++; else if (l.status === "new") { e.newN++; e.added += lineAmount(l); } else e[l.status]++;
      if (l.status === "remove") e.removed += Number(l.baseline) || 0;
    }
    const opex = data.people.filter((p) => isOpex(p, ctx));
    const cogsPeople = data.people.filter((p) => !isOpex(p, ctx));
    const pplPlan = opex.reduce((s, p) => s + personCost(p, ctx), 0);
    const pplCurrent = opex.reduce((s, p) => s + personCurrent(p, ctx), 0);
    const cogsPlan = cogsPeople.reduce((s, p) => s + personCost(p, ctx), 0);
    const cogsCurrent = cogsPeople.reduce((s, p) => s + personCurrent(p, ctx), 0);
    const head = { keep: opex.filter((p) => p.status === "keep").length, remove: opex.filter((p) => p.status === "remove").length, add: opex.filter((p) => p.status === "new").length };
    const missingPay = data.people.filter((p) => p.status !== "remove" && !(Number(p.salary) > 0)).length;
    const missingFx = [...new Set(data.people.map((p) => p.currency).filter((c) => c && c !== "USD" && !(Number(ctx.fx?.[c]) > 0)))];
    const list = Object.values(cats).filter((c) => c.category !== "People Costs" || c.baseline || c.plan).sort((a, b) => b.baseline - a.baseline);
    const shown = list.filter((c) => visible(c.category));
    const vBase = shown.reduce((s, c) => s + c.baseline, 0);
    const vPlan = shown.reduce((s, c) => s + c.plan, 0);
    const review = data.lines.filter((l) => l.status === "review" && visible(l.category)).length;
    const cogsLines = data.lines.filter((l) => l.category === COGS);
    const movedCogs = { n: cogsLines.length, baseline: cogsLines.reduce((s, l) => s + (Number(l.baseline) || 0), 0), plan: cogsLines.reduce((s, l) => s + lineAmount(l), 0) };
    const taxPlan = taxLine(pplPlan, ctx);
    const taxCurrent = pplCurrent ? taxLine(pplCurrent, ctx) : 0;
    return { movedCogs, list, shown, vBase, vPlan, payBase, salBase, loadBase, pplPlan, pplCurrent, taxPlan, taxCurrent, cogsPlan, cogsCurrent, cogsN: cogsPeople.length, load: ctx.load, head, missingPay, missingFx, review, actualLoad: salBase ? (loadBase / salBase) * 100 : null };
}
const ctxOf = (settings = {}) => ({ load: Number(settings.load_pct ?? 18), fx: settings.fx || { USD: 1 }, cogs: new Set(settings.cogs_departments || ["KY Plant"]) });

export default function ZeroBasedBudget({ isMobile }) {
  const [year, setYear] = useState(new Date().getFullYear() + (new Date().getMonth() >= 6 ? 1 : 0));
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState("");
  const [tab, setTab] = useState("summary");
  const [toast, setToast] = useState("");

  // Versions: several named plans per year. The one in view is remembered per year in this browser.
  const vKey = (y) => `zbb.version.${y}`;
  const [planId, setPlanId] = useState(() => { try { return localStorage.getItem(vKey(year)) || null; } catch { return null; } });
  const [verUi, setVerUi] = useState(null); // { kind: "copy" | "rename" | "delete", name }
  const load = useCallback(async (pid) => {
    setErr(null);
    try {
      const d = await call({ action: "load", year, plan_id: pid === undefined ? planId : pid });
      setData(d); setPlanId(d.plan.id);
      try { localStorage.setItem(vKey(year), d.plan.id); } catch {}
    } catch (e) { setErr(e.message); }
  }, [year]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setData(null); load(); }, [load]);
  const switchVersion = (id) => { setData(null); setVerUi(null); if (tab === "compare") setTab("summary"); load(id); };
  const versionAction = async () => {
    const v = verUi; if (!v) return;
    try {
      if (v.kind === "copy") { const r = await call({ action: "copy_version", plan_id: data.plan.id, name: v.name }); switchVersion(r.plan.id); setToast(`Created "${r.plan.name}".`); }
      if (v.kind === "rename") { const r = await call({ action: "rename_version", plan_id: data.plan.id, name: v.name }); setVerUi(null); await load(r.plan.id); }
      if (v.kind === "delete") {
        const gone = data.plan.name; await call({ action: "delete_version", plan_id: data.plan.id });
        const next = data.versions.find((x) => x.id !== data.plan.id); switchVersion(next?.id || null); setToast(`Deleted "${gone}".`);
      }
    } catch (e) { setToast(e.message); }
  };
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 4000); return () => clearTimeout(t); }, [toast]);

  const plan = data?.plan;
  const settings = plan?.settings || {};
  const load_pct = Number(settings.load_pct ?? 18);
  const hidden = settings.hidden_categories || DEFAULT_HIDDEN;
  const ctx = useMemo(() => ({ load: load_pct, fx: settings.fx || { USD: 1 }, cogs: new Set(settings.cogs_departments || ["KY Plant"]) }), [load_pct, settings.fx, settings.cogs_departments]);

  const savePerson = async (person) => {
    const r = await call({ action: "save_person", plan_id: plan.id, person });
    setData((d) => ({ ...d, people: person.id ? d.people.map((p) => (p.id === r.person.id ? r.person : p)) : [...d.people, r.person] }));
    return r.person;
  };
  const deletePerson = async (id) => {
    await call({ action: "delete_person", id });
    setData((d) => {
      const gone = d.people.find((p) => p.id === id);
      return { ...d, people: d.people.filter((p) => p.id !== id).map((p) => (p.manager_id === id ? { ...p, manager_id: gone?.manager_id || null } : p)) };
    });
  };
  const bulkPeople = async (ids, op, extra = {}) => {
    const r = await call({ action: "bulk_people", plan_id: plan.id, ids, op, ...extra });
    const by = new Map(r.people.map((p) => [p.id, p]));
    setData((d) => ({ ...d, people: d.people.map((p) => by.get(p.id) || p) }));
  };
  const importPeople = async (rows) => {
    const r = await call({ action: "import_people", plan_id: plan.id, rows });
    await load();
    setToast(`Imported ${r.imported} people.${r.missing_fx?.length ? ` Add FX rates for ${r.missing_fx.join(", ")}.` : ""}`);
  };
  const saveLine = async (line) => {
    const r = await call({ action: "save_line", plan_id: plan.id, line });
    setData((d) => ({ ...d, lines: line.id ? d.lines.map((l) => (l.id === r.line.id ? r.line : l)) : [...d.lines, r.line] }));
    return r.line;
  };
  const deleteLine = async (id) => { await call({ action: "delete_line", id }); setData((d) => ({ ...d, lines: d.lines.filter((l) => l.id !== id) })); };
  const saveSettings = async (s) => { const r = await call({ action: "save_settings", plan_id: plan.id, settings: s }); setData((d) => ({ ...d, plan: r.plan })); };
  const refresh = async () => {
    setBusy("Pulling QuickBooks actuals…");
    try {
      const r = await call({ action: "refresh_actuals", plan_id: plan.id });
      setToast(`QuickBooks actuals loaded: ${r.months} months, ${r.txns.toLocaleString()} lines; ${r.added} new vendor lines to decide.`);
      await load();
    } catch (e) { setErr(e.message); }
    setBusy("");
  };
  const wrap = (fn) => async (...a) => { try { return await fn(...a); } catch (e) { setToast(e.message); } };

  // ── Totals ───────────────────────────────────────────────────────────────
  const totals = useMemo(() => computeTotals(data, hidden, ctx), [data, hidden, ctx]);

  const exportExcel = async () => {
    setBusy("Building the Excel file…");
    try { await exportWorkbook({ data, totals, ctx, year, version: plan?.name }); } catch (e) { setToast(e.message); }
    setBusy("");
  };

  if (err && !data) return <div style={{ padding: 24, color: T.red, fontSize: 13 }}>{err}</div>;
  if (!data) return <div style={{ padding: 24, color: T.text3, fontSize: 13 }}>Loading the zero-based budget…</div>;

  const noActuals = !plan.actuals_refreshed_at;
  const pplBase = totals.pplCurrent || totals.payBase;
  const totalBase = totals.vBase + pplBase + totals.taxCurrent;
  const totalPlan = totals.vPlan + totals.pplPlan + totals.taxPlan;

  const TABS = [
    { id: "summary", label: "Summary" },
    { id: "people", label: `Org chart (${data.people.length})` },
    { id: "lines", label: `Vendors & software${totals.review ? ` · ${totals.review} to decide` : ""}` },
    { id: "removed", label: "Removed" },
    ...((data.versions || []).length > 1 ? [{ id: "compare", label: `Compare versions (${data.versions.length})` }] : []),
  ];

  return (
    <div style={{ "--zbb-th": T.text3, maxWidth: 1500 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ flex: "1 1 320px", minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, letterSpacing: ".06em", textTransform: "uppercase" }}>Zero-based budget · Opex · private to you</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
            <h2 style={{ margin: 0, fontSize: 20, color: T.text }}>FY {year}</h2>
            <select value={year} onChange={(e) => { const y = Number(e.target.value); let id = null; try { id = localStorage.getItem(vKey(y)); } catch {} setPlanId(id); setYear(y); }} style={{ fontSize: 12, padding: "3px 6px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text }}>
              {[0, 1, 2].map((d) => { const y = new Date().getFullYear() + d; return <option key={y} value={y}>{y}</option>; })}
            </select>
            <span style={{ fontSize: 11, color: T.text3, marginLeft: 6 }}>Version</span>
            <select value={plan.id} onChange={(e) => switchVersion(e.target.value)} style={{ fontSize: 12, padding: "3px 6px", borderRadius: 6, border: `1px solid ${T.accent}`, background: T.surface2, color: T.text, maxWidth: 260 }}>
              {(data.versions || []).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <button onClick={() => setVerUi({ kind: "copy", name: `${plan.name} (copy)` })} style={btn(false)} title="Duplicate this version to try a different scenario">Duplicate</button>
            <button onClick={() => setVerUi({ kind: "rename", name: plan.name })} style={btn(false)}>Rename</button>
            {(data.versions || []).length > 1 && <button onClick={() => setVerUi({ kind: "delete" })} style={btn(false, T.red)}>Delete</button>}
          </div>
          {verUi && (
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8, padding: "8px 10px", borderRadius: 8, border: `1px solid ${verUi.kind === "delete" ? T.red : T.accent}`, background: T.surface, fontSize: 12, color: T.text2 }}>
              {verUi.kind === "delete"
                ? <span>Delete <b style={{ color: T.text }}>{plan.name}</b> and everything in it (org chart, comp, vendor decisions)? This can't be undone; other versions are not affected.</span>
                : <>
                  <span>{verUi.kind === "copy" ? `New version, copied from "${plan.name}":` : "Version name:"}</span>
                  <input autoFocus value={verUi.name} onChange={(e) => setVerUi({ ...verUi, name: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") versionAction(); if (e.key === "Escape") setVerUi(null); }}
                    style={{ flex: "1 1 220px", padding: "5px 8px", fontSize: 12, borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text }} />
                </>}
              <button onClick={versionAction} style={btn(true, verUi.kind === "delete" ? T.red : null)}>{verUi.kind === "copy" ? "Create version" : verUi.kind === "rename" ? "Save" : "Delete version"}</button>
              <button onClick={() => setVerUi(null)} style={btn(false)}>Cancel</button>
            </div>
          )}
          <div style={{ fontSize: 12, color: T.text3, marginTop: 4 }}>
            Every line starts at zero. Vendor baseline is QuickBooks actuals {settings.base_start ? `${settings.base_start.slice(0, 7)} to ${settings.base_end.slice(0, 7)}` : ""}
            {plan.actuals_refreshed_at ? ` (pulled ${new Date(plan.actuals_refreshed_at).toLocaleDateString()})` : " (not pulled yet)"}; people baseline is current comp.
          </div>
        </div>
        <label style={{ fontSize: 11, color: T.text3, display: "flex", alignItems: "center", gap: 6 }} title="Payroll taxes, benefits and 401k on top of salary and bonus">
          Taxes &amp; benefits load
          <input type="number" min={0} max={100} step={0.5} defaultValue={load_pct} key={load_pct}
            onBlur={(e) => { const v = Number(e.target.value); if (v !== load_pct) wrap(saveSettings)({ load_pct: v }); }}
            style={{ width: 58, padding: "4px 6px", fontSize: 12, borderRadius: 5, border: `1px solid ${T.border}`, background: T.surface2, color: T.text }} />%
          {totals.actualLoad != null && <span style={{ color: T.text3 }}>(QBO actual {totals.actualLoad.toFixed(1)}%)</span>}
        </label>
        <button onClick={exportExcel} disabled={!!busy} style={{ ...btn(false), padding: "7px 12px", fontSize: 12 }}>Export to Excel</button>
        <button onClick={refresh} disabled={!!busy} style={{ ...btn(true), padding: "7px 12px", fontSize: 12 }}>{busy || (noActuals ? "Pull QuickBooks actuals" : "Refresh actuals")}</button>
      </div>

      {err && <div style={{ padding: "8px 12px", marginBottom: 10, borderRadius: 8, background: T.redDim, color: T.red, fontSize: 12 }}>{err}</div>}
      {noActuals && !busy && (
        <div style={{ ...card(), padding: 14, marginBottom: 14, fontSize: 13, color: T.text2 }}>
          Start by pulling QuickBooks actuals. That loads every Opex (6xxxx) account by vendor for the baseline window and lists each vendor here to keep, change or remove. It takes about a minute.
        </div>
      )}
      {totals.missingFx.length > 0 && <div style={{ padding: "8px 12px", marginBottom: 10, borderRadius: 8, background: T.yellowDim || T.surface2, color: T.amber || T.yellow, fontSize: 12 }}>No FX rate for {totals.missingFx.join(", ")}: those people count as $0 until you add one on the Org chart tab.</div>}

      {/* Tiles */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(5, minmax(0, 1fr))", gap: 10, marginBottom: 14 }}>
        <Tile label="Baseline Opex" value={money(totalBase)} sub="current comp + trailing vendor actuals" />
        <Tile label={`FY ${year} plan`} value={money(totalPlan)} sub={`${signed(totalPlan - totalBase)} vs baseline`} tone={totalPlan <= totalBase ? T.green : T.red} />
        <Tile label="Salaries (Opex)" value={money(totals.pplPlan)} sub={`${totals.head.keep + totals.head.add} heads · ${totals.head.remove} removed · ${totals.head.add} new · + ${money(totals.taxPlan)} taxes & benefits`} />
        <Tile label="Vendors & software" value={money(totals.vPlan)} sub={`baseline ${money(totals.vBase)}`} />
        <Tile label="Still to decide" value={String(totals.review)} sub={totals.missingPay ? `${totals.missingPay} people without salary` : "vendor lines counting as $0"} tone={totals.review ? T.amber || T.yellow : T.green} />
      </div>

      {/* Category filter */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        <span style={{ fontSize: 11, color: T.text3, marginRight: 2 }}>Categories:</span>
        {[...new Set([...(data.categories || []).map((c) => c.name), ...totals.list.map((c) => c.category)])].filter((c) => c && c !== "People Costs" && c !== "COGS").map((c) => {
          const on = !hidden.includes(c);
          return <button key={c} onClick={() => wrap(saveSettings)({ hidden_categories: on ? [...hidden, c] : hidden.filter((h) => h !== c) })} style={btn(on)}>{c}</button>;
        })}
      </div>

      <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${T.border}`, marginBottom: 14, overflowX: "auto" }}>
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "8px 12px", fontSize: 12, fontWeight: 600, background: "none", border: "none", cursor: "pointer", whiteSpace: "nowrap", color: tab === t.id ? T.accent : T.text3, borderBottom: `2px solid ${tab === t.id ? T.accent : "transparent"}` }}>{t.label}</button>
        ))}
      </div>

      {tab === "summary" && <Summary totals={totals} year={year} />}
      {tab === "people" && <People people={data.people} ctx={ctx} settings={settings} year={year} savePerson={wrap(savePerson)} deletePerson={wrap(deletePerson)}
        bulkPeople={wrap(bulkPeople)} importPeople={wrap(importPeople)} saveSettings={wrap(saveSettings)} isMobile={isMobile} totals={totals} setToast={setToast} />}
      {tab === "lines" && <Lines lines={data.lines.filter((l) => l.category === COGS || !hidden.includes(l.category || ""))} planId={plan.id} categories={data.categories} saveLine={wrap(saveLine)} deleteLine={wrap(deleteLine)} isMobile={isMobile} setToast={setToast} allLines={data.lines} />}
      {tab === "compare" && <CompareVersions year={year} versions={data.versions || []} currentId={plan.id} onOpen={(id) => { setTab("summary"); switchVersion(id); }} />}
      {tab === "removed" && <Removed people={data.people} lines={data.lines.filter((l) => l.category !== COGS && !hidden.includes(l.category || ""))} ctx={ctx} />}

      {toast && <div style={{ position: "fixed", bottom: 20, right: 20, maxWidth: 420, padding: "10px 14px", borderRadius: 8, background: T.surface3 || T.surface2, color: T.text, border: `1px solid ${T.border}`, fontSize: 12, zIndex: 50, boxShadow: "0 6px 20px rgba(0,0,0,.25)" }}>{toast}</div>}
    </div>
  );
}

function Tile({ label, value, sub, tone }) {
  return (
    <div style={{ ...card(), padding: "10px 12px", minWidth: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: ".05em" }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 700, color: tone || T.text, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      <div style={{ fontSize: 11, color: T.text3, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>
    </div>
  );
}

// ── Summary ─────────────────────────────────────────────────────────────────
function Summary({ totals, year }) {
  const rows = [
    { category: "Salaries & bonus", baseline: totals.pplCurrent || totals.payBase, plan: totals.pplPlan, people: true },
    { category: "Payroll taxes & benefits", baseline: totals.taxCurrent, plan: totals.taxPlan, tax: true },
    ...totals.shown,
  ];
  const tb = rows.reduce((s, r) => s + r.baseline, 0); const tp = rows.reduce((s, r) => s + r.plan, 0);
  const max = Math.max(1, ...rows.map((r) => Math.max(r.baseline, r.plan)));
  return (
    <div style={{ ...card(), overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead><tr style={{ borderBottom: `1px solid ${T.border}` }}>
          <th style={th}>Category</th><th style={{ ...th, textAlign: "right" }}>Baseline</th><th style={{ ...th, textAlign: "right" }}>FY {year}</th>
          <th style={{ ...th, textAlign: "right" }}>Change</th><th style={{ ...th, minWidth: 180 }}></th><th style={th}>Lines</th>
        </tr></thead>
        <tbody>
          {rows.map((r) => {
            const d = r.plan - r.baseline;
            return (
              <tr key={r.category} style={{ borderBottom: `1px solid ${T.border}` }}>
                <td style={{ padding: "8px", color: T.text, fontWeight: 600 }}>{catLabel(r.category)}</td>
                <td style={{ padding: "8px", textAlign: "right", color: T.text2, fontVariantNumeric: "tabular-nums" }}>{full(r.baseline)}</td>
                <td style={{ padding: "8px", textAlign: "right", color: T.text, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{full(r.plan)}</td>
                <td style={{ padding: "8px", textAlign: "right", color: d <= 0 ? T.green : T.red, fontVariantNumeric: "tabular-nums" }}>{signed(d)}{r.baseline ? ` (${((d / r.baseline) * 100).toFixed(0)}%)` : ""}</td>
                <td style={{ padding: "8px" }}>
                  <div style={{ height: 6, borderRadius: 3, background: T.surface3 || T.border, width: `${(r.baseline / max) * 100}%`, minWidth: r.baseline ? 2 : 0 }} />
                  <div style={{ height: 6, borderRadius: 3, background: T.accent, width: `${(r.plan / max) * 100}%`, marginTop: 3, minWidth: r.plan ? 2 : 0 }} />
                </td>
                <td style={{ padding: "8px", fontSize: 11, color: T.text3, whiteSpace: "nowrap" }}>
                  {r.tax ? TAX_NOTE(totals.load) : r.people ? "see org chart" : <>{r.keep + r.change} kept · {r.remove} removed · {r.newN} new{r.review ? <b style={{ color: T.amber || T.yellow }}> · {r.review} to decide</b> : ""}</>}
                </td>
              </tr>
            );
          })}
          <tr><td style={{ padding: 8, fontWeight: 700, color: T.text }}>Total</td>
            <td style={{ padding: 8, textAlign: "right", fontWeight: 700, color: T.text2 }}>{full(tb)}</td>
            <td style={{ padding: 8, textAlign: "right", fontWeight: 700, color: T.text }}>{full(tp)}</td>
            <td style={{ padding: 8, textAlign: "right", fontWeight: 700, color: tp <= tb ? T.green : T.red }}>{signed(tp - tb)}</td><td /><td /></tr>
        </tbody>
      </table>
      <div style={{ padding: "8px 10px", fontSize: 11, color: T.text3, borderTop: `1px solid ${T.border}` }}>
        Grey bar: baseline. Coloured bar: FY {year} plan. Salaries baseline is current base salary from the HRIS import; payroll taxes and benefits are {TAX_NOTE(totals.load).toLowerCase()} (QuickBooks pay accounts 60010–60059 over the baseline window, all-in: {full(totals.payBase)}).
        {totals.cogsN > 0 && <> {totals.cogsN} people in COGS departments are outside these totals (salaries now {money(totals.cogsCurrent)}, plan {money(totals.cogsPlan)}).</>}
        {totals.movedCogs.n > 0 && <> {totals.movedCogs.n} vendor {totals.movedCogs.n === 1 ? "line has" : "lines have"} been moved to COGS and sit outside Opex (baseline {money(totals.movedCogs.baseline)}, plan {money(totals.movedCogs.plan)}).</>} Vendor lines still "to decide" count as $0.
      </div>
    </div>
  );
}

// ── People: org chart + table ───────────────────────────────────────────────
function People({ people, ctx, settings, year, savePerson, deletePerson, bulkPeople, importPeople, saveSettings, isMobile, totals, setToast }) {
  const [view, setView] = useState("chart");
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const [edit, setEdit] = useState(null);
  const [pending, setPending] = useState(null); // parsed import awaiting confirmation
  const [creator, setCreator] = useState(null); // { manager } while adding a role
  const [scratch, setScratch] = useState(false); // confirming "start from scratch"
  const fileRef = useRef(null);
  const hideRemoved = !!settings.hide_removed;

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const shown = useMemo(() => (hideRemoved ? people.filter((p) => p.status !== "remove") : people), [people, hideRemoved]);
  const kids = useMemo(() => {
    // With removed people hidden, someone reports to their nearest manager still in the plan.
    const vis = new Set(shown.map((p) => p.id));
    const parentOf = (p) => { let m = byId.get(p.manager_id); let g = 0; while (m && !vis.has(m.id) && g++ < 60) m = byId.get(m.manager_id); return m && vis.has(m.id) ? m.id : "root"; };
    const m = new Map();
    for (const p of shown) {
      const k = parentOf(p);
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(p);
    }
    const size = (id) => (m.get(id) || []).length;
    for (const v of m.values()) v.sort((a, b) => (size(b.id) - size(a.id)) || a.name.localeCompare(b.name));
    return m;
  }, [shown, byId]);
  const subtree = useCallback((id) => {
    const out = []; const st = [...(kids.get(id) || [])];
    while (st.length) { const p = st.pop(); out.push(p); st.push(...(kids.get(p.id) || [])); }
    return out;
  }, [kids]);
  const depts = [...new Set(people.map((p) => p.department).filter(Boolean))].sort();
  const currencies = [...new Set(people.map((p) => p.currency).filter((c) => c && c !== "USD"))].sort();
  const match = (p) => (!dept || p.department === dept) && (!q || `${p.name} ${p.title || ""} ${p.department || ""}`.toLowerCase().includes(q.toLowerCase()));
  const set = (p, patch) => savePerson({ ...p, ...patch });

  const addRole = (manager, mode) => setCreator({ manager: manager || null, mode: mode || (people.some((p) => p.is_existing && p.status === "remove") ? "existing" : "new") });
  const removedCount = people.filter((p) => p.status === "remove").length;
  const startScratch = async () => {
    const ids = people.filter((p) => p.status !== "remove" && p.is_existing).map((p) => p.id);
    const fresh = people.filter((p) => !p.is_existing);
    if (ids.length) await bulkPeople(ids, "status", { status: "remove" });
    for (const p of fresh) await deletePerson(p.id);
    await saveSettings({ hide_removed: true });
    setScratch(false);
    setToast("Org chart cleared. Use + Add people for current employees and + New role for new roles with a budget.");
  };
  const reassign = (id, target) => {
    if (!id || id === target?.id) return;
    if (target && subtree(id).some((x) => x.id === target.id)) { setToast("Can't report to someone in their own team."); return; }
    const p = byId.get(id); if (p) set(p, { manager_id: target ? target.id : null });
  };
  const removeWithTeam = (p) => bulkPeople([p.id, ...subtree(p.id).map((t) => t.id)], "status", { status: "remove" });

  const onFile = async (f) => {
    if (!f) return;
    try {
      const X = await loadXLSX();
      const wb = X.read(await f.arrayBuffer(), { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const grid = X.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null });
      const hi = grid.findIndex((r) => (r || []).some((c) => /employee|name/i.test(String(c || ""))));
      if (hi < 0) throw new Error("Couldn't find a header row with an Employee or Name column.");
      const H = grid[hi].map((c) => String(c || "").trim());
      const find = (re, not) => H.findIndex((h) => re.test(h) && !(not && not.test(h)));
      const col = {
        name: find(/^employee$|employee name|^name$|full name/i),
        title: find(/position|title|role/i),
        department: find(/department|dept|team/i),
        manager: find(/manager|reports to/i),
        currency: find(/currency/i),
        current: find(/current/i, /currency/i),
        salary: find(/salary|annual|comp|pay/i, /currency|current/i),
        status: find(/^status$/i),
        start: find(/start month/i),
        note: find(/^notes?$/i),
      };
      if (col.name < 0) col.name = find(/employee|name/i, /manager/i);
      if (col.name < 0 || col.salary < 0) throw new Error("The file needs an employee name column and a salary column.");
      const rows = grid.slice(hi + 1).filter((r) => r && r[col.name]).map((r) => ({
        name: String(r[col.name]).trim(),
        title: col.title >= 0 && r[col.title] ? String(r[col.title]).trim() : null,
        department: col.department >= 0 && r[col.department] ? String(r[col.department]).trim() : null,
        manager: col.manager >= 0 && r[col.manager] ? String(r[col.manager]).trim() : null,
        currency: col.currency >= 0 && r[col.currency] ? String(r[col.currency]).trim().toUpperCase() : "USD",
        salary: parseMoney(r[col.salary]),
        ...(col.current >= 0 ? { current_salary: r[col.current] == null || r[col.current] === "" ? null : parseMoney(r[col.current]) } : {}),
        ...(col.status >= 0 && r[col.status] ? { status: String(r[col.status]).trim().toLowerCase() } : {}),
        ...(col.start >= 0 && r[col.start] ? { start_month: Number(r[col.start]) || (MONTHS.indexOf(String(r[col.start]).slice(0, 3)) + 1) || 1 } : {}),
        ...(col.note >= 0 && r[col.note] ? { note: String(r[col.note]) } : {}),
      }));
      if (!rows.length) throw new Error("No employee rows found.");
      setPending({ file: f.name, rows, currencies: [...new Set(rows.map((r) => r.currency))] });
    } catch (e) { setToast(e.message); }
    if (fileRef.current) fileRef.current.value = "";
  };

  const opexPeople = people.filter((p) => isOpex(p, ctx));
  const planOpex = opexPeople.reduce((s, p) => s + personCost(p, ctx), 0);
  const nowOpex = opexPeople.reduce((s, p) => s + personCurrent(p, ctx), 0);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <button onClick={() => setView("chart")} style={btn(view === "chart")}>Org chart</button>
        <button onClick={() => setView("table")} style={btn(view === "table")}>Table</button>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people, titles…" style={{ flex: "1 1 180px", padding: "6px 10px", fontSize: 12, borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text }} />
        <select value={dept} onChange={(e) => setDept(e.target.value)} style={{ padding: "6px 8px", fontSize: 12, borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text }}>
          <option value="">All departments</option>{depts.map((d) => <option key={d}>{d}</option>)}
        </select>
        <button onClick={() => addRole(null, "existing")} style={btn(true)}>+ Add people</button>
        <button onClick={() => addRole(null, "new")} style={btn(true)}>+ New role</button>
        <button onClick={() => saveSettings({ hide_removed: !hideRemoved })} style={btn(!hideRemoved)} title="Show or hide people removed from the plan">{hideRemoved ? `Show removed (${removedCount})` : "Hide removed"}</button>
        <button onClick={() => setScratch(true)} style={btn(false)} title="Start the org from zero and add back only the roles you need">Start from scratch</button>
        <button onClick={() => fileRef.current?.click()} style={btn(false)}>Import HRIS file</button>
        <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: "none" }} onChange={(e) => onFile(e.target.files?.[0])} />
      </div>

      {scratch && (
        <div style={{ ...card(), padding: 12, marginBottom: 10, borderColor: T.accent }}>
          <div style={{ fontSize: 13, color: T.text, marginBottom: 6 }}>
            Build the FY {year} org from zero? Everyone currently on the chart is marked <b>removed</b> (and hidden), so the plan starts at $0 and current comp stays as the baseline.
            Then build it back up: <b>+ Add people</b> to place current employees (one or a whole team, at current salary or a % change), <b>+ New role</b> for roles with a salary budget, or <b>+</b> on any card to add under that person.
          </div>
          <div style={{ fontSize: 11, color: T.text3, marginBottom: 8 }}>{people.filter((p) => !p.is_existing).length ? "Roles added in this plan so far are deleted. " : ""}You can show removed people again at any time, or re-import the HRIS file to go back to the current org.</div>
          <button onClick={startScratch} style={{ ...btn(true), marginRight: 8 }}>Start from scratch</button>
          <button onClick={() => setScratch(false)} style={btn(false)}>Cancel</button>
        </div>
      )}
      {pending && (
        <div style={{ ...card(), padding: 12, marginBottom: 10, borderColor: T.accent }}>
          <div style={{ fontSize: 13, color: T.text, marginBottom: 6 }}>
            Replace the org chart with <b>{pending.rows.length} people</b> from {pending.file}? {pending.rows.some((r) => r.current_salary != null) ? `Current comp and FY ${year} salary come from their own columns; ${pending.rows.filter((r) => r.status === "new").length} rows are new roles.` : `Current comp comes in as each person's FY ${year} salary, ready to adjust.`} Any changes already made on people in this plan are replaced.
          </div>
          <div style={{ fontSize: 11, color: T.text3, marginBottom: 8 }}>Currencies: {pending.currencies.join(", ")}. Managers not in the file are added at the top without comp.</div>
          <button onClick={async () => { const rows = pending.rows; setPending(null); await importPeople(rows); }} style={{ ...btn(true), marginRight: 8 }}>Replace org chart</button>
          <button onClick={() => setPending(null)} style={btn(false)}>Cancel</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", fontSize: 11, color: T.text3, marginBottom: 10 }}>
        <span>Opex salaries: now <b style={{ color: T.text2 }}>{full(nowOpex)}</b> → FY {year} <b style={{ color: T.text }}>{full(planOpex)}</b> <span style={{ color: planOpex <= nowOpex ? T.green : T.red }}>({signed(planOpex - nowOpex)})</span>. Taxes &amp; benefits ({ctx.load}%) are a separate budget line: {full(taxLine(planOpex, ctx))}.</span>
        {currencies.length > 0 && <span style={{ display: "inline-flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>FX (USD per unit):
          {currencies.map((c) => (
            <label key={c} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>{c}
              <input defaultValue={ctx.fx?.[c] ?? ""} key={`${c}${ctx.fx?.[c]}`} onBlur={(e) => { const v = Number(e.target.value); if (v > 0 && v !== Number(ctx.fx?.[c])) saveSettings({ fx: { ...ctx.fx, [c]: v } }); }}
                style={{ width: 74, padding: "2px 5px", fontSize: 11, borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface2, color: T.text }} />
            </label>
          ))}</span>}
        {depts.length > 0 && <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>COGS, not Opex:
          {depts.map((d) => { const on = ctx.cogs.has(d); return on || /plant|manufactur|production/i.test(d) ? <button key={d} onClick={() => saveSettings({ cogs_departments: on ? [...ctx.cogs].filter((x) => x !== d) : [...ctx.cogs, d] })} style={{ ...btn(on, T.purple), padding: "1px 7px" }}>{d}</button> : null; })}
          <select value="" onChange={(e) => e.target.value && saveSettings({ cogs_departments: [...ctx.cogs, e.target.value] })} style={{ fontSize: 11, padding: "1px 4px", borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface2, color: T.text3 }}>
            <option value="">+ dept</option>{depts.filter((d) => !ctx.cogs.has(d)).map((d) => <option key={d}>{d}</option>)}
          </select></span>}
      </div>

      {shown.length === 0 && (
        <div style={{ ...card(), padding: 20, fontSize: 13, color: T.text2, textAlign: "center" }}>
          {people.length ? "No roles in the plan yet." : "No people yet."} Start with the top role, then add the roles that report to it.
          <div style={{ marginTop: 10, display: "flex", gap: 8, justifyContent: "center" }}>
            <button onClick={() => addRole(null, "existing")} style={{ ...btn(true), padding: "6px 14px", fontSize: 12 }}>+ Add existing people</button>
            <button onClick={() => addRole(null, "new")} style={{ ...btn(true), padding: "6px 14px", fontSize: 12 }}>+ Create a new role</button>
          </div>
        </div>
      )}
      {shown.length > 0 && (view === "chart"
        ? <BoxChart people={shown} kids={kids} subtree={subtree} byId={byId} ctx={ctx} match={match} filtering={!!(q || dept)} set={set} setEdit={setEdit} addRole={addRole} reassign={reassign} />
        : <PeopleTable people={shown.filter(match)} byId={byId} ctx={ctx} set={set} setEdit={setEdit} bulkPeople={bulkPeople} year={year} />)}
      {creator && <RoleCreator manager={creator.manager} mode={creator.mode} people={people} ctx={ctx} year={year} depts={depts} onClose={() => setCreator(null)}
        onCreate={async (roles) => { for (const r of roles) await savePerson(r); setCreator(null); setToast(roles.length > 1 ? `Added ${roles.length} to the org.` : "Added to the org."); }} />}
      {edit && <PersonEditor person={people.find((p) => p.id === edit.id) || edit} people={people} subtree={subtree} ctx={ctx} year={year}
        onClose={() => setEdit(null)} onSave={async (patch) => { await set(people.find((p) => p.id === edit.id) || edit, patch); }}
        onRemoveTeam={(p) => removeWithTeam(p)} onDelete={async (p) => { await deletePerson(p.id); setEdit(null); }} />}
    </div>
  );
}

// Classic top-down org chart. Large groups of individual contributors stack
// vertically under their manager so the chart stays readable.
function BoxChart({ people, kids, subtree, byId, ctx, match, filtering, set, setEdit, addRole, reassign }) {
  const [open, setOpen] = useState(() => new Set());
  const [closed, setClosed] = useState(() => new Set());
  const [zoom, setZoom] = useState(0.9);
  const [drag, setDrag] = useState(null);
  const scroller = useRef(null);
  // Keep the top of the chart in view: centre horizontally after layout changes.
  const center = () => setTimeout(() => { const el = scroller.current; if (el) el.scrollLeft = Math.max(0, (el.scrollWidth - el.clientWidth) / 2); }, 30);
  useEffect(() => { center(); }, [zoom, people.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const depthOf = useMemo(() => {
    const d = new Map();
    const walk = (id, n) => { for (const k of kids.get(id) || []) { d.set(k.id, n); walk(k.id, n + 1); } };
    walk("root", 0);
    return d;
  }, [kids]);
  const visible = useMemo(() => {
    if (!filtering) return null;
    const s = new Set();
    for (const p of people) if (match(p)) { let c = p; let g = 0; while (c && g++ < 60) { s.add(c.id); c = byId.get(c.manager_id); } }
    return s;
  }, [people, filtering, match, byId]);
  const isOpen = (id) => (filtering ? true : closed.has(id) ? false : open.has(id) || (depthOf.get(id) ?? 0) < 2);
  const toggle = (id) => {
    if (isOpen(id)) { setClosed((s) => new Set(s).add(id)); setOpen((s) => { const n = new Set(s); n.delete(id); return n; }); }
    else { setOpen((s) => new Set(s).add(id)); setClosed((s) => { const n = new Set(s); n.delete(id); return n; }); }
  };
  const lc = T.border;

  const Card = (p, compact) => {
    const gone = p.status === "remove";
    const c = STATUS[p.status].c();
    const team = (kids.get(p.id) || []).length ? subtree(p.id) : [];
    const cur = personCurrent(p, ctx); const plan = personCost(p, ctx);
    const pct = changePct(p);
    const mgr = byId.get(p.manager_id);
    const orphan = mgr && mgr.status === "remove" && !gone;
    const cogs = !isOpex(p, ctx);
    const hit = filtering && match(p);
    return (
      <div draggable onDragStart={(e) => { e.stopPropagation(); setDrag(p.id); }} onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); reassign(drag, p); setDrag(null); }}
        onClick={() => setEdit(p)}
        style={{ display: "inline-block", width: compact ? 196 : 178, textAlign: "left", verticalAlign: "top", cursor: "pointer", borderRadius: 8, padding: "7px 9px",
          background: drag === p.id ? T.accentDim : T.surface, border: `1px solid ${hit ? T.accent : orphan ? (T.amber || T.yellow) : T.border}`, borderTop: `3px solid ${c}`,
          opacity: gone ? 0.55 : 1, boxShadow: "0 1px 2px rgba(0,0,0,.06)" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textDecoration: gone ? "line-through" : "none" }} title={p.name}>{p.name}</div>
        <div style={{ fontSize: 10.5, color: T.text3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }} title={[p.title, p.department].filter(Boolean).join(" · ")}>
          {[p.title, p.department].filter(Boolean).join(" · ") || "—"}
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 4, marginTop: 4, fontSize: 11, fontVariantNumeric: "tabular-nums" }}>
          <span style={{ color: T.text3 }} title={`Current salary ${local(p.current_salary, p.currency)}`}>{p.is_existing ? money(cur) : "new"}</span>
          <span style={{ color: T.text3 }}>→</span>
          <span style={{ color: T.text, fontWeight: 700 }} title={`FY plan ${local(p.salary, p.currency)} salary${Number(p.bonus) ? ` + ${local(p.bonus, p.currency)} bonus` : ""}, ${paidMonths(p)} months`}>{money(plan)}</span>
          {pct != null && Math.abs(pct) >= 0.05 && !gone && <span style={{ color: pct > 0 ? T.red : T.green, fontSize: 10 }}>{pct > 0 ? "+" : ""}{pct.toFixed(1)}%</span>}
        </div>
        <div style={{ display: "flex", gap: 4, marginTop: 5, alignItems: "center", flexWrap: "wrap" }}>
          {p.status !== "keep" && <Pill status={p.status} small />}
          {cogs && <span style={{ fontSize: 9.5, fontWeight: 700, color: T.purple, border: `1px solid ${T.purple}55`, borderRadius: 8, padding: "0 5px" }}>COGS</span>}
          {p.currency && p.currency !== "USD" && <span style={{ fontSize: 9.5, color: T.text3 }}>{p.currency}</span>}
          {orphan && <span style={{ fontSize: 9.5, color: T.amber || T.yellow }}>reassign</span>}
          <span style={{ flex: 1 }} />
          <button onClick={(e) => { e.stopPropagation(); set(p, gone ? { status: p.is_existing ? "keep" : "new", end_month: 12 } : { status: "remove", end_month: 0 }); }}
            title={gone ? "Restore" : "Remove from the plan"} style={{ ...btn(false, gone ? T.green : T.red), padding: "0 6px", fontSize: 10 }}>{gone ? "Restore" : "Remove"}</button>
          <button onClick={(e) => { e.stopPropagation(); addRole(p); }} title="Add people or a new role reporting to this person" style={{ ...btn(false), padding: "0 6px", fontSize: 10 }}>+</button>
        </div>
        {team.length > 0 && (
          <div onClick={(e) => { e.stopPropagation(); toggle(p.id); }} style={{ marginTop: 5, fontSize: 10, color: T.accent, cursor: "pointer" }}>
            {isOpen(p.id) ? "▾" : "▸"} {(kids.get(p.id) || []).length} direct · {team.filter((x) => x.status !== "remove").length}/{team.length} team · {money(team.reduce((s, x) => s + personCost(x, ctx), 0))}
          </div>
        )}
      </div>
    );
  };

  const branch = (p) => {
    if (visible && !visible.has(p.id)) return null;
    const ch = (kids.get(p.id) || []).filter((k) => !visible || visible.has(k.id));
    const leaves = ch.filter((k) => !(kids.get(k.id) || []).length);
    const stack = ch.length > 4 && leaves.length === ch.length;
    return (
      <li key={p.id}>
        {Card(p)}
        {ch.length > 0 && isOpen(p.id) && (stack
          ? <ul><li><div style={{ display: "inline-flex", flexDirection: "column", gap: 6, padding: 6, borderRadius: 10, border: `1px dashed ${lc}` }}>{ch.map((k) => <div key={k.id}>{Card(k, true)}</div>)}</div></li></ul>
          : <ul>{ch.map((k) => branch(k))}</ul>)}
      </li>
    );
  };

  const roots = (kids.get("root") || []).filter((p) => !visible || visible.has(p.id));
  return (
    <div style={{ ...card(), padding: 0 }}>
      <style>{`
        .zbb-oc ul{padding-top:18px;position:relative;display:flex;justify-content:center;margin:0;padding-left:0}
        .zbb-oc li{list-style:none;position:relative;padding:18px 5px 0;text-align:center}
        .zbb-oc li::before,.zbb-oc li::after{content:'';position:absolute;top:0;right:50%;width:50%;height:18px;border-top:1px solid ${lc}}
        .zbb-oc li::after{right:auto;left:50%;border-left:1px solid ${lc}}
        .zbb-oc li:only-child::before,.zbb-oc li:only-child::after{display:none}
        .zbb-oc li:only-child{padding-top:0}
        .zbb-oc li:first-child::before,.zbb-oc li:last-child::after{border:0 none}
        .zbb-oc li:last-child::before{border-right:1px solid ${lc};border-radius:0 6px 0 0}
        .zbb-oc li:first-child::after{border-radius:6px 0 0 0}
        .zbb-oc ul ul::before{content:'';position:absolute;top:0;left:50%;width:0;height:18px;border-left:1px solid ${lc}}
        .zbb-oc > ul{padding-top:0;width:max-content;min-width:100%}
      `}</style>
      <div style={{ display: "flex", gap: 6, alignItems: "center", padding: "8px 10px", borderBottom: `1px solid ${T.border}`, fontSize: 11, color: T.text3, flexWrap: "wrap" }}>
        <button onClick={() => setZoom((z) => Math.max(0.4, +(z - 0.1).toFixed(2)))} style={btn(false)}>−</button>
        <span style={{ width: 36, textAlign: "center" }}>{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((z) => Math.min(1.3, +(z + 0.1).toFixed(2)))} style={btn(false)}>+</button>
        <button onClick={() => { setOpen(new Set(people.map((p) => p.id))); setClosed(new Set()); center(); }} style={btn(false)}>Expand all</button>
        <button onClick={() => { setOpen(new Set()); setClosed(new Set(people.filter((p) => (kids.get(p.id) || []).length).map((p) => p.id))); center(); }} style={btn(false)}>Collapse all</button>
        <span style={{ marginLeft: 6 }}>Card: current salary → FY plan salary (USD, for the months paid). Click to edit; drag a card onto another to change who they report to.</span>
        <span onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); reassign(drag, null); setDrag(null); }} style={{ border: `1px dashed ${T.border}`, padding: "0 6px", borderRadius: 4 }}>drop here for top level</span>
      </div>
      <div ref={scroller} style={{ overflow: "auto", maxHeight: "75vh", padding: 16 }}>
        <div className="zbb-oc" style={{ zoom, width: "max-content", minWidth: "100%" }}>
          <ul>{roots.map((p) => branch(p))}</ul>
        </div>
      </div>
    </div>
  );
}

function PeopleTable({ people, byId, ctx, set, setEdit, bulkPeople, year }) {
  const [sort, setSort] = useState({ k: "department", d: 1 });
  const [sel, setSel] = useState(() => new Set());
  const [pct, setPct] = useState("3");
  const val = (p, k) => (k === "cost" ? personCost(p, ctx) : k === "current" ? personCurrent(p, ctx) : k === "change" ? (changePct(p) ?? -999) : k === "manager" ? (byId.get(p.manager_id)?.name || "") : String(p[k] || ""));
  const rows = [...people].sort((a, b) => { const va = val(a, sort.k); const vb = val(b, sort.k); return (va > vb ? 1 : va < vb ? -1 : a.name.localeCompare(b.name)) * sort.d; });
  const H = ({ k, children, right }) => <th onClick={() => setSort((s) => ({ k, d: s.k === k ? -s.d : 1 }))} style={{ ...th, cursor: "pointer", textAlign: right ? "right" : "left" }}>{children}{sort.k === k ? (sort.d > 0 ? " ▲" : " ▼") : ""}</th>;
  const ids = [...sel].filter((id) => people.some((p) => p.id === id));
  const allOn = rows.length > 0 && rows.every((p) => sel.has(p.id));
  const td = { padding: "4px 8px", borderTop: `1px solid ${T.border}` };
  const totCur = rows.reduce((s, p) => s + personCurrent(p, ctx), 0); const totPlan = rows.reduce((s, p) => s + personCost(p, ctx), 0);
  return (
    <div style={{ ...card(), overflow: "hidden" }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "8px 10px", borderBottom: `1px solid ${T.border}`, flexWrap: "wrap", fontSize: 12, color: T.text3, minHeight: 30 }}>
        {ids.length ? <>
          <b style={{ color: T.text }}>{ids.length} selected</b>
          <span>Set FY {year} salary to current</span>
          <input value={pct} onChange={(e) => setPct(e.target.value)} style={{ width: 46, padding: "3px 5px", fontSize: 12, borderRadius: 5, border: `1px solid ${T.border}`, background: T.surface2, color: T.text }} />%
          <button onClick={() => bulkPeople(ids, "raise", { pct: Number(pct) || 0 })} style={btn(true)}>Apply</button>
          <button onClick={() => bulkPeople(ids, "reset")} style={btn(false)}>Reset to current</button>
          <button onClick={() => bulkPeople(ids, "status", { status: "remove" })} style={btn(false, T.red)}>Remove</button>
          <button onClick={() => bulkPeople(ids, "status", { status: "keep" })} style={btn(false, T.green)}>Keep</button>
          <button onClick={() => setSel(new Set())} style={btn(false)}>Clear</button>
        </> : <span>Tick people to adjust comp in bulk (e.g. a merit increase on current salary) or remove them. Salaries are in each person's pay currency; costs are USD base pay, before taxes and benefits (a separate budget line).</span>}
      </div>
      <div style={{ overflowX: "auto", maxHeight: "72vh" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
          <thead style={{ position: "sticky", top: 0, background: T.surface, zIndex: 1 }}><tr>
            <th style={th}><input type="checkbox" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(rows.map((p) => p.id)))} /></th>
            <H k="name">Name</H><H k="title">Title</H><H k="department">Department</H><H k="manager">Manager</H><H k="status">Status</H>
            <th style={th}>Cur.</th><th style={{ ...th, textAlign: "right" }}>Current salary</th><H k="current" right>Current cost</H>
            <th style={{ ...th, textAlign: "right" }}>FY {year} salary</th><H k="change" right>Δ</H><th style={{ ...th, textAlign: "right" }}>Bonus</th>
            <th style={th}>Months</th><H k="cost" right>FY {year} cost</H>
          </tr></thead>
          <tbody>{rows.map((p) => {
            const c = changePct(p); const cogs = !isOpex(p, ctx);
            return (
              <tr key={p.id} style={{ opacity: p.status === "remove" ? 0.55 : 1, background: sel.has(p.id) ? T.accentDim : "transparent" }}>
                <td style={td}><input type="checkbox" checked={sel.has(p.id)} onChange={() => setSel((s) => { const n = new Set(s); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; })} /></td>
                <td style={{ ...td, color: T.text, cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }} onClick={() => setEdit(p)}>{p.name}</td>
                <td style={{ ...td, color: T.text2 }}>{p.title}</td>
                <td style={{ ...td, color: T.text2, whiteSpace: "nowrap" }}>{p.department}{cogs && <span style={{ color: T.purple, fontSize: 10, fontWeight: 700 }}> COGS</span>}</td>
                <td style={{ ...td, color: T.text3, whiteSpace: "nowrap" }}>{byId.get(p.manager_id)?.name || "—"}</td>
                <td style={td}><Pill status={p.status} small /></td>
                <td style={{ ...td, color: T.text3 }}>{p.currency || "USD"}</td>
                <td style={{ ...td, textAlign: "right", color: T.text2, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{Number(p.current_salary) ? Math.round(p.current_salary).toLocaleString("en-US") : "—"}</td>
                <td style={{ ...td, textAlign: "right", color: T.text2, fontVariantNumeric: "tabular-nums" }}>{personCurrent(p, ctx) ? full(personCurrent(p, ctx)) : "—"}</td>
                <td style={{ ...td, textAlign: "right" }}><MoneyInput value={Number(p.salary)} onSave={(v) => set(p, { salary: v })} width={92} placeholder="0" /></td>
                <td style={{ ...td, textAlign: "right", color: c == null ? T.text3 : c > 0.05 ? T.red : c < -0.05 ? T.green : T.text3, fontVariantNumeric: "tabular-nums" }}>{c == null ? "—" : `${c > 0 ? "+" : ""}${c.toFixed(1)}%`}</td>
                <td style={{ ...td, textAlign: "right" }}><MoneyInput value={Number(p.bonus)} onSave={(v) => set(p, { bonus: v })} width={76} placeholder="0" /></td>
                <td style={{ ...td, color: T.text3, whiteSpace: "nowrap" }}>{paidMonths(p)}</td>
                <td style={{ ...td, textAlign: "right", color: T.text, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{full(personCost(p, ctx))}</td>
              </tr>
            );
          })}
            <tr><td style={td} /><td style={{ ...td, fontWeight: 700, color: T.text }} colSpan={7}>Total ({rows.length})</td>
              <td style={{ ...td, textAlign: "right", fontWeight: 700, color: T.text2 }}>{full(totCur)}</td><td style={td} /><td style={td} /><td style={td} /><td style={td} />
              <td style={{ ...td, textAlign: "right", fontWeight: 700, color: T.text }}>{full(totPlan)}</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Drawer({ title, onClose, children }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.35)", zIndex: 40, display: "flex", justifyContent: "flex-end" }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: "min(440px, 100%)", height: "100%", overflow: "auto", background: T.bg, borderLeft: `1px solid ${T.border}`, padding: 18 }}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 14 }}>
          <div style={{ flex: 1, fontSize: 15, fontWeight: 700, color: T.text }}>{title}</div>
          <button onClick={onClose} style={{ ...btn(false), fontSize: 14 }}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
const Field = ({ label, children }) => <label style={{ display: "block", marginBottom: 10 }}><div style={{ fontSize: 11, color: T.text3, marginBottom: 3 }}>{label}</div>{children}</label>;
const inp = () => ({ width: "100%", boxSizing: "border-box", padding: "7px 9px", fontSize: 13, borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text });

// Add to the org: existing people (several at once, e.g. a whole team, with their
// current salary or a % change) or new roles with a salary budget (optionally
// several identical roles). Used most when building the org from scratch.
function RoleCreator({ manager, mode: startMode, people, ctx, year, depts, onClose, onCreate }) {
  const [mode, setMode] = useState(startMode || "existing");
  const [managerId, setManagerId] = useState(manager?.id || "");
  const [busy, setBusy] = useState(false);
  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const managers = people.filter((x) => x.status !== "remove" || x.id === managerId).sort((a, b) => a.name.localeCompare(b.name));
  const ReportsTo = (
    <Field label="Reports to">
      <select style={inp()} value={managerId} onChange={(e) => setManagerId(e.target.value)}>
        <option value="">— top level —</option>
        {managers.map((x) => <option key={x.id} value={x.id}>{x.name}{x.title ? ` · ${x.title}` : ""}</option>)}
      </select>
    </Field>
  );

  // Existing people
  const [q, setQ] = useState("");
  const [onlyOut, setOnlyOut] = useState(true);
  const [picked, setPicked] = useState(() => new Set());
  const [pct, setPct] = useState("0");
  const [title, setTitle] = useState("");
  const candidates = people.filter((p) => p.is_existing && p.id !== managerId && (!onlyOut || p.status === "remove")
    && (!q || `${p.name} ${p.title || ""} ${p.department || ""}`.toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => String(a.department || "").localeCompare(String(b.department || "")) || a.name.localeCompare(b.name));
  const raise = (Number(pct) || 0) / 100;
  const planFor = (p) => Math.round((Number(p.current_salary) || Number(p.salary) || 0) * (1 + raise));
  const pickedList = [...picked].map((id) => byId.get(id)).filter(Boolean);
  const pickedCost = pickedList.reduce((s, p) => s + personCost({ ...p, status: "keep", salary: planFor(p), start_month: 1, end_month: 12 }, ctx), 0);
  const toggle = (id) => setPicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const addExisting = async () => {
    if (!pickedList.length) return;
    setBusy(true);
    await onCreate(pickedList.map((p) => ({ ...p, status: "keep", manager_id: managerId || null, salary: planFor(p), start_month: 1, end_month: 12,
      ...(pickedList.length === 1 && title.trim() ? { title: title.trim() } : {}) })));
    setBusy(false);
  };

  // New role
  const [f, setF] = useState({ title: "", department: manager?.department || "", currency: manager?.currency || "USD", salary: "", bonus: "", start_month: 1, count: 1, note: "" });
  const put = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const cur = (f.currency || "USD").toUpperCase();
  const n = Math.max(1, Math.min(50, parseInt(f.count, 10) || 1));
  const each = { status: "new", currency: cur, salary: parseMoney(f.salary), bonus: parseMoney(f.bonus), start_month: Number(f.start_month) || 1, end_month: 12 };
  const eachCost = personCost(each, ctx);
  const addNew = async () => {
    if (!f.title.trim()) return;
    setBusy(true);
    const base = { title: f.title.trim(), department: f.department.trim(), manager_id: managerId || null, currency: cur, salary: each.salary, bonus: each.bonus, start_month: each.start_month, end_month: 12, note: f.note, status: "new" };
    await onCreate(Array.from({ length: n }, (_, i) => ({ ...base, name: n > 1 ? `${base.title} #${i + 1}` : base.title })));
    setBusy(false);
  };

  const tab = (id, label) => <button onClick={() => setMode(id)} style={{ ...btn(mode === id), padding: "6px 12px", fontSize: 12, flex: 1 }}>{label}</button>;
  const mgrName = managerId ? byId.get(managerId)?.name : null;
  return (
    <Drawer title={mgrName ? `Add to ${mgrName}'s team` : "Add to the org"} onClose={onClose}>
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>{tab("existing", "Existing people")}{tab("new", "New role with budget")}</div>
      {ReportsTo}
      {mode === "existing" ? <>
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, title, department…" style={{ ...inp(), flex: 1 }} />
        </div>
        <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 11, color: T.text3, marginBottom: 6 }}>
          <input type="checkbox" checked={onlyOut} onChange={(e) => setOnlyOut(e.target.checked)} /> Only people not yet placed in the FY {year} org
        </label>
        <div style={{ border: `1px solid ${T.border}`, borderRadius: 8, maxHeight: 300, overflow: "auto", marginBottom: 10 }}>
          {candidates.length === 0 && <div style={{ padding: 12, fontSize: 12, color: T.text3 }}>{onlyOut ? "Everyone is already placed. Untick the box to move someone who is." : "No one matches."}</div>}
          {candidates.length > 1 && (
            <div style={{ padding: "5px 10px", borderBottom: `1px solid ${T.border}`, fontSize: 11 }}>
              <button onClick={() => setPicked((s) => { const nn = new Set(s); const all = candidates.every((c) => nn.has(c.id)); candidates.forEach((c) => (all ? nn.delete(c.id) : nn.add(c.id))); return nn; })} style={{ ...btn(false), padding: "1px 8px" }}>
                {candidates.every((c) => picked.has(c.id)) ? "Clear these" : `Select all ${candidates.length}`}
              </button>
            </div>
          )}
          {candidates.map((p) => {
            const mg = byId.get(p.manager_id);
            return (
              <label key={p.id} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 10px", borderBottom: `1px solid ${T.border}`, cursor: "pointer", background: picked.has(p.id) ? T.accentDim : "transparent" }}>
                <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: T.text }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: T.text3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {[p.title, p.department].filter(Boolean).join(" · ") || "—"}{p.status !== "remove" ? ` · in plan${mg ? `, reports to ${mg.name}` : ""}` : ""}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: T.text2, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{Number(p.current_salary) ? money(Number(p.current_salary) * fxOf(p, ctx)) : "no comp"}</div>
              </label>
            );
          })}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label={`FY ${year} salary vs current`}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}><input style={{ ...inp(), width: 80 }} value={pct} onChange={(e) => setPct(e.target.value)} /> <span style={{ fontSize: 12, color: T.text3 }}>% change</span></div>
          </Field>
          {pickedList.length === 1 && <Field label="Title in the new org (optional)"><input style={inp()} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={pickedList[0].title || ""} /></Field>}
        </div>
        <div style={{ fontSize: 12, color: T.text2, margin: "2px 0 14px" }}>
          {pickedList.length ? <>{pickedList.length} {pickedList.length === 1 ? "person" : "people"} · FY {year} salaries <b>{full(pickedCost)}</b> (USD, full year{raise ? `, ${pct}% vs current` : ", at current salary"}). Taxes &amp; benefits are added on the separate {ctx.load}% line.</> : "Tick the people to add. Each keeps their current salary unless you set a % change; you can adjust anyone afterwards."}
        </div>
        <button onClick={addExisting} disabled={busy || !pickedList.length} style={{ ...btn(true), padding: "7px 14px", fontSize: 12, opacity: busy || !pickedList.length ? 0.5 : 1 }}>
          {busy ? "Adding…" : pickedList.length > 1 ? `Add ${pickedList.length} people` : "Add to the org"}
        </button>
      </> : <>
        <Field label="Role title"><input autoFocus style={inp()} value={f.title} onChange={(e) => put("title", e.target.value)} placeholder="e.g. Customer Service Lead" /></Field>
        <Field label="Department"><input style={inp()} list="zbb-depts" value={f.department} onChange={(e) => put("department", e.target.value)} /><datalist id="zbb-depts">{depts.map((d) => <option key={d} value={d} />)}</datalist></Field>
        <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 1fr", gap: 10 }}>
          <Field label="Currency"><input style={inp()} value={f.currency} maxLength={3} onChange={(e) => put("currency", e.target.value.toUpperCase())} /></Field>
          <Field label="Salary budget (annual)"><input style={inp()} value={f.salary} onChange={(e) => put("salary", e.target.value)} placeholder="e.g. 85000 or 85k" /></Field>
          <Field label="Bonus budget"><input style={inp()} value={f.bonus} onChange={(e) => put("bonus", e.target.value)} /></Field>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label="Start month"><select style={inp()} value={f.start_month} onChange={(e) => put("start_month", Number(e.target.value))}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></Field>
          <Field label="Number of roles"><input style={inp()} type="number" min={1} max={50} value={f.count} onChange={(e) => put("count", e.target.value)} /></Field>
        </div>
        <Field label="Why this role (justification)"><textarea style={{ ...inp(), minHeight: 60 }} value={f.note} onChange={(e) => put("note", e.target.value)} /></Field>
        <div style={{ fontSize: 12, color: T.text2, margin: "4px 0 14px" }}>
          {n > 1 ? `${n} roles × ` : ""}FY {year} budget <b>{full(eachCost)}</b>{n > 1 ? <> = <b>{full(eachCost * n)}</b></> : ""} ({paidMonths(each)} months, USD; taxes &amp; benefits on the separate {ctx.load}% line{cur !== "USD" ? `; 1 ${cur} = $${ctx.fx?.[cur] ?? "?"}` : ""}).
          {cur !== "USD" && !(Number(ctx.fx?.[cur]) > 0) && <span style={{ color: T.red }}> No FX rate for {cur} yet.</span>}
        </div>
        <button onClick={addNew} disabled={busy || !f.title.trim()} style={{ ...btn(true), padding: "7px 14px", fontSize: 12, opacity: busy || !f.title.trim() ? 0.5 : 1 }}>{busy ? "Adding…" : n > 1 ? `Add ${n} roles` : "Add role"}</button>
      </>}
    </Drawer>
  );
}

function PersonEditor({ person: p, people, subtree, ctx, year, onClose, onSave, onRemoveTeam, onDelete }) {
  const [f, setF] = useState(p);
  useEffect(() => setF(p), [p.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const team = subtree(p.id);
  const banned = new Set([p.id, ...team.map((t) => t.id)]);
  const put = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const cur = (f.currency || "USD").toUpperCase();
  const save = async () => {
    await onSave({ name: f.name, title: f.title, department: f.department, manager_id: f.manager_id || null, status: f.status, currency: cur,
      current_salary: parseMoney(f.current_salary), salary: parseMoney(f.salary), bonus: parseMoney(f.bonus), start_month: Number(f.start_month) || 1, end_month: Number(f.end_month), note: f.note });
    onClose();
  };
  const preview = { ...f, currency: cur, salary: parseMoney(f.salary), bonus: parseMoney(f.bonus), current_salary: parseMoney(f.current_salary) };
  const pct = changePct(preview);
  return (
    <Drawer title={p.is_existing ? p.name : "Role"} onClose={onClose}>
      <Field label="Name or role"><input style={inp()} value={f.name || ""} onChange={(e) => put("name", e.target.value)} /></Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Title"><input style={inp()} value={f.title || ""} onChange={(e) => put("title", e.target.value)} /></Field>
        <Field label="Department"><input style={inp()} value={f.department || ""} onChange={(e) => put("department", e.target.value)} /></Field>
      </div>
      <Field label="Reports to">
        <select style={inp()} value={f.manager_id || ""} onChange={(e) => put("manager_id", e.target.value)}>
          <option value="">— top level —</option>
          {people.filter((x) => !banned.has(x.id)).sort((a, b) => a.name.localeCompare(b.name)).map((x) => <option key={x.id} value={x.id}>{x.name}{x.status === "remove" ? " (removed)" : ""}</option>)}
        </select>
      </Field>
      <Field label="Status">
        <div style={{ display: "flex", gap: 6 }}>
          {(p.is_existing ? ["keep", "remove"] : ["new", "remove"]).map((s) => (
            <button key={s} onClick={() => setF((x) => ({ ...x, status: s, end_month: s === "remove" ? 0 : 12 }))} style={btn(f.status === s, STATUS[s].c())}>{STATUS[s].label}</button>
          ))}
        </div>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "80px 1fr 1fr", gap: 10 }}>
        <Field label="Currency"><input style={inp()} value={f.currency || "USD"} maxLength={3} onChange={(e) => put("currency", e.target.value.toUpperCase())} /></Field>
        <Field label="Current salary"><input style={inp()} value={f.current_salary ?? ""} onChange={(e) => put("current_salary", e.target.value)} disabled={!p.is_existing} placeholder={p.is_existing ? "" : "new role"} /></Field>
        <Field label={`FY ${year} salary${pct != null ? ` (${pct > 0 ? "+" : ""}${pct.toFixed(1)}%)` : ""}`}><input style={inp()} value={f.salary ?? ""} onChange={(e) => put("salary", e.target.value)} placeholder="e.g. 95000 or 95k" /></Field>
      </div>
      {Number(preview.current_salary) > 0 && (
        <div style={{ display: "flex", gap: 6, marginTop: -4, marginBottom: 10, flexWrap: "wrap" }}>
          {[0, 2, 3, 4, 5, 10].map((r) => <button key={r} onClick={() => put("salary", String(Math.round(preview.current_salary * (1 + r / 100))))} style={{ ...btn(false), padding: "2px 8px" }}>{r ? `+${r}%` : "= current"}</button>)}
        </div>
      )}
      <Field label={`FY ${year} bonus`}><input style={inp()} value={f.bonus ?? ""} onChange={(e) => put("bonus", e.target.value)} /></Field>
      {f.status === "remove"
        ? <Field label="Paid through (notice, transition or severance period)">
          <select style={inp()} value={f.end_month ?? 0} onChange={(e) => put("end_month", Number(e.target.value))}>
            <option value={0}>Gone before January</option>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </select></Field>
        : <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <Field label={f.status === "new" ? "Start month" : "Paid from"}><select style={inp()} value={f.start_month || 1} onChange={(e) => put("start_month", Number(e.target.value))}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></Field>
          <Field label="Paid through"><select style={inp()} value={f.end_month || 12} onChange={(e) => put("end_month", Number(e.target.value))}>{MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}</select></Field>
        </div>}
      <Field label="Note / justification"><textarea style={{ ...inp(), minHeight: 70 }} value={f.note || ""} onChange={(e) => put("note", e.target.value)} /></Field>
      <div style={{ fontSize: 12, color: T.text2, margin: "6px 0 14px", lineHeight: 1.5 }}>
        Current cost <b>{full(personCurrent({ ...preview, status: "keep", is_existing: p.is_existing }, ctx))}</b> · FY {year} cost <b>{full(personCost(preview, ctx))}</b> ({paidMonths(preview)} months, USD base pay; taxes &amp; benefits are on the separate {ctx.load}% line{cur !== "USD" ? `, 1 ${cur} = $${ctx.fx?.[cur] ?? "?"}` : ""}).
        {!isOpex(preview, ctx) && <> Counted as COGS, outside the Opex totals.</>}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={save} style={{ ...btn(true), padding: "7px 14px", fontSize: 12 }}>Save</button>
        {team.length > 0 && <button onClick={() => { onRemoveTeam(p); onClose(); }} style={btn(false, T.red)}>Remove with team ({team.length})</button>}
        {!p.is_existing && <button onClick={() => onDelete(p)} style={btn(false, T.red)}>Delete role</button>}
      </div>
    </Drawer>
  );
}

// ── Vendors & software ──────────────────────────────────────────────────────
function Lines({ lines, allLines, planId, categories, saveLine, deleteLine, isMobile, setToast }) {
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [closed, setClosed] = useState(() => new Set());
  const [edit, setEdit] = useState(null);
  const [flash, setFlash] = useState(null);

  const counts = lines.reduce((m, l) => ((m[l.status] = (m[l.status] || 0) + 1), m), {});
  const shown = lines.filter((l) => (filter === "all" || l.status === filter) && (!q || `${l.vendor} ${l.account_name || ""} ${l.note || ""}`.toLowerCase().includes(q.toLowerCase())));
  const groups = {};
  for (const l of shown) (groups[l.category || "Non-Fixed and Other"] ||= []).push(l);
  const order = Object.keys(groups).sort((a, b) => (a === COGS) - (b === COGS) || groups[b].reduce((s, l) => s + Number(l.baseline), 0) - groups[a].reduce((s, l) => s + Number(l.baseline), 0));

  const decide = (l, status) => saveLine({ ...l, status, amount: status === "keep" ? Number(l.baseline) || Number(l.amount) : status === "change" ? Number(l.amount) || Number(l.baseline) : l.amount });
  const keepRest = async (cat) => { for (const l of groups[cat].filter((x) => x.status === "review")) await decide(l, "keep"); };

  const onAdded = (l) => { setFlash(l.id); setFilter("all"); setQ(""); setClosed((s) => { const n = new Set(s); n.delete(l.category); return n; }); setTimeout(() => setFlash(null), 2500); };

  return (
    <div>
      <SoftwareSearch planId={planId} lines={allLines} categories={categories} saveLine={saveLine} onAdded={onAdded} setToast={setToast} setEdit={setEdit} />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", margin: "12px 0 10px" }}>
        {["all", "review", "keep", "change", "remove", "new"].map((s) => (
          <button key={s} onClick={() => setFilter(s)} style={btn(filter === s, s === "all" ? null : STATUS[s].c())}>{s === "all" ? "All" : STATUS[s].label} {s === "all" ? lines.length : counts[s] || 0}</button>
        ))}
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter lines…" style={{ marginLeft: "auto", flex: "0 1 220px", padding: "5px 9px", fontSize: 12, borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text }} />
      </div>
      {!lines.length && <div style={{ ...card(), padding: 16, fontSize: 13, color: T.text3 }}>No lines yet. Pull QuickBooks actuals, or search above to add software and vendors.</div>}
      {order.map((cat) => {
        const ls = groups[cat];
        const b = ls.reduce((s, l) => s + Number(l.baseline || 0), 0); const p = ls.reduce((s, l) => s + lineAmount(l), 0);
        const rev = ls.filter((l) => l.status === "review").length;
        const isClosed = closed.has(cat);
        return (
          <div key={cat} style={{ ...card(), marginBottom: 10, overflow: "hidden" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", cursor: "pointer", flexWrap: "wrap" }} onClick={() => setClosed((s) => { const n = new Set(s); n.has(cat) ? n.delete(cat) : n.add(cat); return n; })}>
              <span style={{ color: T.text3, fontSize: 11 }}>{isClosed ? "▸" : "▾"}</span>
              <span style={{ fontWeight: 700, fontSize: 13, color: cat === COGS ? T.purple : T.text, flex: 1 }}>{catLabel(cat)} <span style={{ fontWeight: 400, color: T.text3, fontSize: 11 }}>{ls.length} lines{cat === COGS ? " · not in Opex totals; edit a line to move it back" : ""}</span></span>
              <span style={{ fontSize: 12, color: T.text3 }}>baseline {money(b)}</span>
              <span style={{ fontSize: 12, color: T.text, fontWeight: 600 }}>plan {money(p)}</span>
              <span style={{ fontSize: 12, color: p - b <= 0 ? T.green : T.red, width: 70, textAlign: "right" }}>{signed(p - b)}</span>
              {rev > 0 && <button onClick={(e) => { e.stopPropagation(); keepRest(cat); }} style={btn(false, T.green)} title="Keep every undecided line in this category at its baseline">Keep {rev} at baseline</button>}
            </div>
            {!isClosed && (
              <div style={{ overflowX: "auto", borderTop: `1px solid ${T.border}` }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead><tr><th style={th}>Vendor</th>{!isMobile && <th style={th}>Account</th>}<th style={{ ...th, textAlign: "right" }}>Baseline</th><th style={th}>Decision</th><th style={{ ...th, textAlign: "right" }}>Plan</th><th style={th}></th></tr></thead>
                  <tbody>{ls.map((l) => (
                    <tr key={l.id} style={{ borderTop: `1px solid ${T.border}`, background: flash === l.id ? T.accentDim : "transparent" }}>
                      <td style={{ padding: "5px 8px", minWidth: 160 }}>
                        <div style={{ color: T.text, fontWeight: 600, textDecoration: l.status === "remove" ? "line-through" : "none" }}>{l.vendor}{l.kind === "software" && <span style={{ fontSize: 10, color: T.text3, fontWeight: 400 }}> · software</span>}</div>
                        {(l.note || l.seats) && <div style={{ fontSize: 11, color: T.text3 }}>{l.seats ? `${l.seats} × ${full(l.unit_cost)}${l.billing ? ` ${l.billing}` : ""}` : ""}{l.seats && l.note ? " · " : ""}{l.note}</div>}
                      </td>
                      {!isMobile && <td style={{ padding: "5px 8px", color: T.text3, fontSize: 11, whiteSpace: "nowrap" }}>{l.account_num} {String(l.account_name || "").split(":").pop()}</td>}
                      <td style={{ padding: "5px 8px", textAlign: "right", color: T.text2, fontVariantNumeric: "tabular-nums" }}>{Number(l.baseline) ? full(l.baseline) : "—"}</td>
                      <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}>
                        {l.status === "new" ? <Pill status="new" /> : ["keep", "change", "remove"].map((s) => (
                          <button key={s} onClick={() => decide(l, l.status === s ? "review" : s)} style={{ ...btn(l.status === s, STATUS[s].c()), marginRight: 4, padding: "3px 8px" }}>{STATUS[s].label}</button>
                        ))}
                      </td>
                      <td style={{ padding: "5px 8px", textAlign: "right" }}>
                        {l.status === "review" || l.status === "remove" ? <span style={{ color: T.text3 }}>$0</span>
                          : <MoneyInput value={Number(l.amount)} onSave={(v) => saveLine({ ...l, amount: v, status: l.status === "keep" && Math.round(v) !== Math.round(Number(l.baseline)) ? "change" : l.status })} />}
                      </td>
                      <td style={{ padding: "5px 8px", whiteSpace: "nowrap" }}><button onClick={() => setEdit(l)} style={{ ...btn(false), padding: "3px 8px" }}>Edit</button></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
      {edit && <LineEditor line={allLines.find((l) => l.id === edit.id) || edit} categories={categories} onClose={() => setEdit(null)}
        onSave={async (l) => { const r = await saveLine(l); if (r && !edit.id) onAdded(r); setEdit(null); }} onDelete={async (l) => { await deleteLine(l.id); setEdit(null); }} />}
    </div>
  );
}

const CAT_ACCOUNT = { "Software and Subscriptions": ["60520", "Software & Subscriptions"], "Consultants": ["60450", "Consulting Services"], "Brand/Other/Marketing": ["60240", "Marketing Subscriptions"], "Legal": ["60420", "Legal Fees"], "Insurance": ["60570", "Business Insurance"], "T&E": ["60310", "Meals & Entertainment"], "Non-Fixed and Other": ["60900", "Misc Business Expense"], "R&D": ["60130", "R&D"] };

function SoftwareSearch({ planId, lines, categories, saveLine, onAdded, setToast, setEdit }) {
  const [q, setQ] = useState("");
  const [res, setRes] = useState(null);
  const [loading, setLoading] = useState(false);
  const [price, setPrice] = useState(null);
  const t = useRef(null);
  useEffect(() => {
    clearTimeout(t.current);
    if (q.trim().length < 2) { setRes(null); return; }
    t.current = setTimeout(async () => {
      setLoading(true);
      try { const r = await call({ action: "search", plan_id: planId, q: q.trim() }); setRes(r.results || []); } catch (e) { setToast(e.message); }
      setLoading(false);
    }, 250);
    return () => clearTimeout(t.current);
  }, [q, planId]); // eslint-disable-line react-hooks/exhaustive-deps

  const existing = (r) => lines.find((l) => l.vendor === r.vendor && (l.account_num || "") === (r.account_num || ""));
  const addFromQbo = async (r) => {
    const ex = existing(r);
    if (ex) { onAdded(ex); setQ(""); return; }
    const l = await saveLine({ vendor: r.vendor, account_num: r.account_num || null, account_name: r.account_name || null, category: r.category || "Software and Subscriptions", kind: (r.category || "").startsWith("Software") ? "software" : "vendor", status: r.total ? "keep" : "new", amount: r.total || 0, baseline: 0, source: "manual" });
    if (l) { onAdded(l); setQ(""); }
  };
  const lookup = async (name) => {
    setPrice({ name, loading: true });
    try { setPrice({ name, ...(await call({ action: "price_lookup", name })) }); } catch (e) { setPrice({ name, error: e.message }); }
  };

  return (
    <div style={{ ...card(), padding: 12, position: "relative" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 6 }}>Add software or a vendor</div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search QuickBooks spend (e.g. Slack, Klaviyo) or type a new tool to price it…"
        style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", fontSize: 13, borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text }} />
      {q.trim().length >= 2 && (
        <div style={{ marginTop: 8, maxHeight: 320, overflow: "auto" }}>
          {loading && !res && <div style={{ fontSize: 12, color: T.text3, padding: 6 }}>Searching…</div>}
          {(res || []).map((r, i) => {
            const ex = existing(r);
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px", borderRadius: 6, borderBottom: `1px solid ${T.border}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>{r.vendor}</div>
                  <div style={{ fontSize: 11, color: T.text3 }}>
                    {r.source === "qbo" ? <>{r.account_num} {String(r.account_name || "").split(":").pop()} · {full(r.total)} over {r.months} months ({r.txns} txns, last {r.last_month})</> : "QuickBooks vendor with no Opex spend in the baseline"}
                  </div>
                </div>
                {ex ? <button onClick={() => addFromQbo(r)} style={btn(false)}>In plan · {STATUS[ex.status].label}</button>
                  : <button onClick={() => addFromQbo(r)} style={btn(true)}>{r.total ? `Add at ${money(r.total)}` : "Add"}</button>}
              </div>
            );
          })}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "8px 8px 2px" }}>
            <button onClick={() => lookup(q.trim())} style={btn(true)}>Look up pricing for “{q.trim()}”</button>
            <button onClick={() => setEdit({ vendor: q.trim(), category: "Software and Subscriptions", account_num: "60520", account_name: "Software & Subscriptions", kind: "software", status: "new", amount: 0 })} style={btn(false)}>Add manually</button>
          </div>
        </div>
      )}
      {price && <PriceDrawer price={price} categories={categories} onClose={() => setPrice(null)}
        onAdd={async (line) => { const l = await saveLine(line); if (l) { onAdded(l); setPrice(null); setQ(""); } }} />}
    </div>
  );
}

function PriceDrawer({ price, onClose, onAdd }) {
  const [pick, setPick] = useState(0);
  const [seats, setSeats] = useState(1);
  const [amount, setAmount] = useState("");
  const plans = price.plans || [];
  const pl = plans[pick];
  const perUnit = pl ? Number(pl.annual_estimate_per_unit) || (pl.billing === "monthly" || /month/.test(pl.unit || "") ? Number(pl.price) * 12 : Number(pl.price)) : 0;
  const perSeat = pl && /user|seat/i.test(pl.unit || "");
  const calc = Math.round(perUnit * (perSeat ? Number(seats) || 0 : 1));
  const cat = CAT_ACCOUNT[price.category] ? price.category : "Software and Subscriptions";
  const [acct, acctName] = CAT_ACCOUNT[cat];
  const add = () => onAdd({
    vendor: price.product || price.name, category: cat, account_num: acct, account_name: acctName, kind: cat === "Software and Subscriptions" ? "software" : "vendor",
    status: "new", amount: amount !== "" ? parseMoney(amount) : calc, seats: perSeat ? Number(seats) : null, unit_cost: pl ? perUnit : null,
    billing: pl ? `${pl.name}${pl.billing ? `, ${pl.billing}` : ""}` : null,
    note: [pl ? `${pl.name}: $${pl.price} ${pl.unit || ""}`.trim() : null, price.sources?.[0] ? `Source: ${price.sources[0]}` : null].filter(Boolean).join(" · ").slice(0, 900), source: "manual",
  });
  return (
    <Drawer title={`Pricing: ${price.product || price.name}`} onClose={onClose}>
      {price.loading && <div style={{ fontSize: 13, color: T.text3 }}>Searching the vendor's pricing pages… (about 20 seconds)</div>}
      {price.error && <div style={{ fontSize: 13, color: T.red }}>{price.error}</div>}
      {!price.loading && !price.error && <>
        {price.vendor && <div style={{ fontSize: 12, color: T.text3, marginBottom: 8 }}>{price.vendor} · {price.category} · confidence {price.confidence}</div>}
        {plans.length ? plans.map((p, i) => (
          <label key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 10px", marginBottom: 6, borderRadius: 8, border: `1px solid ${pick === i ? T.accent : T.border}`, cursor: "pointer" }}>
            <input type="radio" checked={pick === i} onChange={() => setPick(i)} style={{ marginTop: 3 }} />
            <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{p.name}</div>
              <div style={{ fontSize: 12, color: T.text2 }}>${p.price} {p.unit} · billed {p.billing}{p.annual_estimate_per_unit ? ` · ${full(p.annual_estimate_per_unit)}/yr per unit` : ""}</div></div>
          </label>
        )) : <div style={{ fontSize: 13, color: T.text2, marginBottom: 8 }}>No published prices found.</div>}
        {price.notes && <div style={{ fontSize: 12, color: T.text2, margin: "8px 0" }}>{price.notes}</div>}
        {price.sources?.length > 0 && <div style={{ fontSize: 11, color: T.text3, marginBottom: 10 }}>Sources: {price.sources.map((s, i) => <a key={i} href={s} target="_blank" rel="noreferrer" style={{ color: T.accent, marginRight: 8, wordBreak: "break-all" }}>{s.replace(/^https?:\/\//, "").slice(0, 50)}</a>)}</div>}
        {perSeat && <Field label="Seats / users"><input style={inp()} type="number" min={0} value={seats} onChange={(e) => setSeats(e.target.value)} /></Field>}
        <Field label={`Annual amount for the plan${plans.length ? ` (calculated ${full(calc)})` : ""}`}><input style={inp()} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={plans.length ? String(calc) : "Enter the annual cost or quote"} /></Field>
        <div style={{ fontSize: 11, color: T.text3, marginBottom: 12 }}>Goes to {acct} {acctName}. List prices from the web; check against the actual quote before committing.</div>
        <button onClick={add} style={{ ...btn(true), padding: "7px 14px", fontSize: 12 }}>Add to plan as new</button>
      </>}
    </Drawer>
  );
}

function LineEditor({ line, categories, onClose, onSave, onDelete }) {
  const [f, setF] = useState(line);
  const put = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const seatsTotal = f.seats && f.unit_cost ? parseMoney(f.seats) * parseMoney(f.unit_cost) : null;
  const cats = [...new Set([...(categories || []).map((c) => c.name), ...Object.keys(CAT_ACCOUNT)])].filter((c) => c !== COGS && c !== "People Costs").concat(COGS);
  return (
    <Drawer title={line.id ? line.vendor : "New line"} onClose={onClose}>
      <Field label="Vendor / tool"><input style={inp()} value={f.vendor || ""} onChange={(e) => put("vendor", e.target.value)} /></Field>
      <Field label="Category">
        <select style={inp()} value={f.category || ""} onChange={(e) => { const c = e.target.value; setF((x) => ({ ...x, category: c, ...(CAT_ACCOUNT[c] && !line.account_num ? { account_num: CAT_ACCOUNT[c][0], account_name: CAT_ACCOUNT[c][1] } : {}) })); }}>
          {cats.map((c) => <option key={c} value={c}>{c === COGS ? "COGS (move out of Opex)" : c}</option>)}
        </select>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 10 }}>
        <Field label="Account #"><input style={inp()} value={f.account_num || ""} onChange={(e) => put("account_num", e.target.value)} /></Field>
        <Field label="Account name"><input style={inp()} value={f.account_name || ""} onChange={(e) => put("account_name", e.target.value)} /></Field>
      </div>
      {line.id && line.status !== "new" && (
        <Field label="Decision"><div style={{ display: "flex", gap: 6 }}>{["review", "keep", "change", "remove"].map((s) => <button key={s} onClick={() => setF((x) => ({ ...x, status: s, amount: s === "keep" ? line.baseline : x.amount }))} style={btn(f.status === s, STATUS[s].c())}>{STATUS[s].label}</button>)}</div></Field>
      )}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
        <Field label="Seats"><input style={inp()} value={f.seats ?? ""} onChange={(e) => put("seats", e.target.value)} /></Field>
        <Field label="Cost per seat / yr"><input style={inp()} value={f.unit_cost ?? ""} onChange={(e) => put("unit_cost", e.target.value)} /></Field>
        <Field label="Plan / billing"><input style={inp()} value={f.billing || ""} onChange={(e) => put("billing", e.target.value)} /></Field>
      </div>
      <Field label={`Annual amount${seatsTotal ? ` (seats × cost = ${full(seatsTotal)})` : ""}${line.baseline ? ` · baseline ${full(line.baseline)}` : ""}`}>
        <input style={inp()} value={f.amount ?? ""} onChange={(e) => put("amount", e.target.value)} disabled={f.status === "remove" || f.status === "review"} />
      </Field>
      <Field label="Owner"><input style={inp()} value={f.owner || ""} onChange={(e) => put("owner", e.target.value)} /></Field>
      <Field label="Note / justification"><textarea style={{ ...inp(), minHeight: 70 }} value={f.note || ""} onChange={(e) => put("note", e.target.value)} /></Field>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => onSave({ ...f, amount: parseMoney(f.amount), seats: f.seats === "" ? null : f.seats, unit_cost: f.unit_cost === "" ? null : f.unit_cost, status: f.status || "new", source: line.source || "manual" })} style={{ ...btn(true), padding: "7px 14px", fontSize: 12 }}>Save</button>
        {line.id && line.source !== "qbo" && <button onClick={() => onDelete(line)} style={btn(false, T.red)}>Delete</button>}
      </div>
    </Drawer>
  );
}


// ── Removed ─────────────────────────────────────────────────────────────────
const removedPeople = (people, ctx) => people.filter((p) => p.status === "remove").map((p) => ({ ...p, saving: personCurrent(p, ctx) - personCost(p, ctx), opex: isOpex(p, ctx) })).sort((a, b) => b.saving - a.saving);
const removedLines = (lines) => lines.filter((l) => l.status === "remove" && Number(l.baseline)).sort((a, b) => b.baseline - a.baseline);
const reducedLines = (lines) => lines.filter((l) => l.status === "change" && Number(l.amount) < Number(l.baseline)).map((l) => ({ ...l, saving: l.baseline - l.amount })).sort((a, b) => b.saving - a.saving);

function Removed({ people, lines, ctx }) {
  const gone = removedPeople(people, ctx);
  const goneOpex = gone.filter((p) => p.opex);
  const cut = removedLines(lines);
  const reduced = reducedLines(lines);
  const pSave = goneOpex.reduce((s, p) => s + p.saving, 0);
  const taxSave = taxLine(pSave, ctx);
  const cogsSave = gone.filter((p) => !p.opex).reduce((s, p) => s + p.saving, 0);
  const vSave = cut.reduce((s, l) => s + Number(l.baseline), 0);
  const rSave = reduced.reduce((s, l) => s + l.saving, 0);
  const byCat = {};
  for (const l of cut) byCat[l.category] = (byCat[l.category] || 0) + Number(l.baseline);
  for (const l of reduced) byCat[l.category] = (byCat[l.category] || 0) + l.saving;
  const noSalary = gone.filter((p) => !(Number(p.current_salary) > 0)).length;

  const Section = ({ title, total, children, empty }) => (
    <div style={{ ...card(), marginBottom: 12, overflowX: "auto" }}>
      <div style={{ display: "flex", padding: "10px 12px", borderBottom: `1px solid ${T.border}` }}>
        <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: T.text }}>{title}</div>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.green }}>{money(total)} saved</div>
      </div>
      {children || <div style={{ padding: 12, fontSize: 12, color: T.text3 }}>{empty}</div>}
    </div>
  );
  const tbl = (head, rows) => (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
      <thead><tr>{head.map((h, i) => <th key={i} style={{ ...th, textAlign: i >= head.length - 1 ? "right" : "left" }}>{h}</th>)}</tr></thead>
      <tbody>{rows}</tbody>
    </table>
  );
  const td = (v, right, strong) => <td style={{ padding: "6px 8px", borderTop: `1px solid ${T.border}`, textAlign: right ? "right" : "left", color: strong ? T.text : T.text2, fontWeight: strong ? 600 : 400, fontVariantNumeric: "tabular-nums" }}>{v}</td>;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 12 }}>
        <Tile label="Total removed (Opex)" value={money(pSave + taxSave + vSave + rSave)} sub="vs current run rate, incl. taxes & benefits" tone={T.green} />
        <Tile label="Salaries" value={money(pSave)} sub={`${goneOpex.length} Opex roles · + ${money(taxSave)} taxes & benefits (${ctx.load}%)${cogsSave ? ` · ${money(cogsSave)} more in COGS` : ""}${noSalary ? ` · ${noSalary} without comp` : ""}`} />
        <Tile label="Vendors cut" value={money(vSave)} sub={`${cut.length} vendors`} />
        <Tile label="Vendors reduced" value={money(rSave)} sub={`${reduced.length} renegotiated or downsized`} />
      </div>
      {Object.keys(byCat).length > 0 && (
        <div style={{ ...card(), padding: "10px 12px", marginBottom: 12, display: "flex", flexWrap: "wrap", gap: 16 }}>
          {Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([c, v]) => <div key={c} style={{ fontSize: 12, color: T.text2 }}>{catLabel(c)} <b style={{ color: T.text }}>{money(v)}</b></div>)}
        </div>
      )}
      <Section title="People removed" total={pSave} empty="Nobody removed yet. Use Remove on the org chart.">
        {gone.length ? tbl(["Name", "Title", "Department", "Current salary", "Paid through", "Saving (USD salary)"], gone.map((p) => (
          <tr key={p.id}>{td(p.name, false, true)}{td(p.title)}{td(<>{p.department}{!p.opex && <span style={{ color: T.purple, fontSize: 10, fontWeight: 700 }}> COGS</span>}</>)}{td(Number(p.current_salary) ? local(p.current_salary, p.currency) : "—")}{td(p.end_month ? MONTHS[p.end_month - 1] : "Before Jan")}{td(Number(p.current_salary) > 0 ? full(p.saving) : "no comp entered", true, true)}</tr>
        ))) : null}
      </Section>
      <Section title="Vendors removed" total={vSave} empty="No vendors removed yet.">
        {cut.length ? tbl(["Vendor", "Category", "Account", "Note", "Baseline saved"], cut.map((l) => (
          <tr key={l.id}>{td(l.vendor, false, true)}{td(catLabel(l.category))}{td(`${l.account_num || ""} ${String(l.account_name || "").split(":").pop()}`)}{td(l.note || "")}{td(full(l.baseline), true, true)}</tr>
        ))) : null}
      </Section>
      <Section title="Vendors reduced" total={rSave} empty="No reductions yet. Use Change and enter a lower amount.">
        {reduced.length ? tbl(["Vendor", "Category", "Baseline", "Plan", "Saving"], reduced.map((l) => (
          <tr key={l.id}>{td(l.vendor, false, true)}{td(catLabel(l.category))}{td(full(l.baseline))}{td(full(l.amount))}{td(full(l.saving), true, true)}</tr>
        ))) : null}
      </Section>
    </div>
  );
}

// ── Compare versions ────────────────────────────────────────────────────────
function CompareVersions({ year, versions, currentId, onOpen }) {
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const out = [];
        for (const v of versions) {
          const d = await call({ action: "load", year, plan_id: v.id });
          const st = d.plan.settings || {};
          const ctx = ctxOf(st);
          const t = computeTotals(d, st.hidden_categories || DEFAULT_HIDDEN, ctx);
          const heads = d.people.filter((p) => p.status !== "remove" && isOpex(p, ctx)).length;
          out.push({ v: d.plan, t, heads, removed: d.people.filter((p) => p.status === "remove" && isOpex(p, ctx)).length, added: d.people.filter((p) => p.status === "new" && isOpex(p, ctx)).length });
        }
        if (live) setRows(out);
      } catch (e) { if (live) setErr(e.message); }
    })();
    return () => { live = false; };
  }, [year, versions.map((v) => v.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  if (err) return <div style={{ color: T.red, fontSize: 13 }}>{err}</div>;
  if (!rows) return <div style={{ color: T.text3, fontSize: 13 }}>Loading every version…</div>;
  const cats = [...new Set(rows.flatMap((r) => r.t.shown.map((c) => c.category)))];
  const catOf = (r, c) => r.t.shown.find((x) => x.category === c)?.plan || 0;
  const total = (r) => r.t.pplPlan + r.t.taxPlan + r.t.vPlan;
  const base = rows[0] ? (rows[0].t.pplCurrent || rows[0].t.payBase) + rows[0].t.taxCurrent + rows[0].t.vBase : 0;
  const line = [
    { label: "Opex heads (plan)", f: (r) => String(r.heads), raw: (r) => r.heads },
    { label: "Removed / new roles", f: (r) => `${r.removed} / ${r.added}`, raw: null },
    { label: "Salaries & bonus", f: (r) => full(r.t.pplPlan), raw: (r) => r.t.pplPlan },
    { label: "Payroll taxes & benefits", f: (r) => `${full(r.t.taxPlan)} (${r.t.load}%)`, raw: (r) => r.t.taxPlan },
    ...cats.map((c) => ({ label: catLabel(c), f: (r) => full(catOf(r, c)), raw: (r) => catOf(r, c) })),
    { label: "Total Opex", f: (r) => full(total(r)), raw: total, strong: true },
    { label: "vs baseline", f: (r) => signed(total(r) - base), raw: null, tone: true },
    { label: "Vendor lines to decide", f: (r) => String(r.t.review), raw: null },
  ];
  const minTotal = Math.min(...rows.map(total));
  const td = { padding: "7px 10px", borderTop: `1px solid ${T.border}`, textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" };
  return (
    <div style={{ ...card(), overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead><tr>
          <th style={th}>FY {year}</th>
          {rows.map((r) => (
            <th key={r.v.id} style={{ ...th, textAlign: "right", color: r.v.id === currentId ? T.accent : "var(--zbb-th)" }}>
              <button onClick={() => onOpen(r.v.id)} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "inherit", font: "inherit", textTransform: "inherit", letterSpacing: "inherit" }} title="Open this version">{r.v.name}{r.v.id === currentId ? " (open)" : ""}</button>
            </th>
          ))}
        </tr></thead>
        <tbody>{line.map((l) => (
          <tr key={l.label}>
            <td style={{ ...td, textAlign: "left", color: T.text, fontWeight: l.strong ? 700 : 600 }}>{l.label}</td>
            {rows.map((r) => {
              const v = l.f(r);
              const tone = l.tone ? (total(r) - base <= 0 ? T.green : T.red) : l.strong && total(r) === minTotal && rows.length > 1 ? T.green : l.strong ? T.text : T.text2;
              return <td key={r.v.id} style={{ ...td, color: tone, fontWeight: l.strong ? 700 : 400 }}>{v}</td>;
            })}
          </tr>
        ))}</tbody>
      </table>
      <div style={{ padding: "8px 10px", fontSize: 11, color: T.text3, borderTop: `1px solid ${T.border}` }}>
        Each version uses its own settings (taxes &amp; benefits rate, FX, COGS departments, categories shown). Baseline {full(base)} is current comp plus trailing vendor actuals from the first version. Lowest total in green. Click a version name to open it.
      </div>
    </div>
  );
}

// ── Excel export ────────────────────────────────────────────────────────────
async function exportWorkbook({ data, totals, ctx, year, version }) {
  const X = await loadXLSX();
  const wb = X.utils.book_new();
  const byId = new Map(data.people.map((p) => [p.id, p]));
  const r0 = (n) => Math.round(Number(n) || 0);
  const add = (name, rows, widths) => {
    const ws = X.utils.json_to_sheet(rows.length ? rows : [{ Note: "Nothing yet" }]);
    if (widths) ws["!cols"] = widths.map((w) => ({ wch: w }));
    X.utils.book_append_sheet(wb, ws, name);
  };
  const pplBase = totals.pplCurrent || totals.payBase;
  add("Summary", [
    { Category: "Salaries & bonus", Baseline: r0(pplBase), [`FY ${year}`]: r0(totals.pplPlan), Change: r0(totals.pplPlan - pplBase) },
    { Category: "Payroll taxes & benefits", Baseline: r0(totals.taxCurrent), [`FY ${year}`]: r0(totals.taxPlan), Change: r0(totals.taxPlan - totals.taxCurrent), Note: TAX_NOTE(ctx.load) },
    ...totals.shown.map((c) => ({ Category: catLabel(c.category), Baseline: r0(c.baseline), [`FY ${year}`]: r0(c.plan), Change: r0(c.plan - c.baseline), Kept: c.keep + c.change, Removed: c.remove, New: c.newN, "To decide": c.review })),
    { Category: "Total Opex", Baseline: r0(pplBase + totals.taxCurrent + totals.vBase), [`FY ${year}`]: r0(totals.pplPlan + totals.taxPlan + totals.vPlan), Change: r0(totals.pplPlan + totals.taxPlan + totals.vPlan - pplBase - totals.taxCurrent - totals.vBase) },
    {},
    { Category: "People in COGS departments (not in totals)", Baseline: r0(totals.cogsCurrent), [`FY ${year}`]: r0(totals.cogsPlan), Change: r0(totals.cogsPlan - totals.cogsCurrent) },
    { Category: `Version: ${version || ""}` },
    { Category: `Assumptions: taxes & benefits load ${ctx.load}%; FX ${Object.entries(ctx.fx || {}).filter(([k]) => k !== "USD").map(([k, v]) => `1 ${k} = $${v}`).join(", ")}; COGS departments: ${[...ctx.cogs].join(", ") || "none"}` },
  ], [48, 14, 14, 14, 8, 9, 6, 10]);
  add("People", data.people.slice().sort((a, b) => String(a.department || "").localeCompare(String(b.department || "")) || a.name.localeCompare(b.name)).map((p) => ({
    Name: p.name, Title: p.title || "", Department: p.department || "", "Reports to": byId.get(p.manager_id)?.name || "",
    Bucket: isOpex(p, ctx) ? "Opex" : "COGS", Status: STATUS[p.status]?.label || p.status, Currency: p.currency || "USD",
    "Current salary (local)": r0(p.current_salary), [`FY ${year} salary (local)`]: r0(p.salary), "Change %": changePct(p) == null ? "" : +changePct(p).toFixed(1),
    [`FY ${year} bonus (local)`]: r0(p.bonus), "USD per unit": fxOf(p, ctx), "Paid from": MONTHS[(p.start_month || 1) - 1], "Paid through": p.end_month ? MONTHS[p.end_month - 1] : "None",
    "Months paid": paidMonths(p), "Current salary USD": r0(personCurrent(p, ctx)), [`FY ${year} pay USD (months paid)`]: r0(personCost(p, ctx)), Note: p.note || "",
  })), [26, 22, 20, 22, 7, 9, 8, 14, 14, 9, 12, 11, 9, 11, 8, 16, 16, 40]);
  add("Vendors & software", data.lines.slice().sort((a, b) => String(a.category).localeCompare(String(b.category)) || b.baseline - a.baseline).map((l) => ({
    Category: catLabel(l.category), Vendor: l.vendor, Type: l.kind, Account: `${l.account_num || ""} ${l.account_name || ""}`.trim(),
    Baseline: r0(l.baseline), Decision: STATUS[l.status]?.label || l.status, [`FY ${year}`]: r0(lineAmount(l)), Change: r0(lineAmount(l) - l.baseline),
    Seats: l.seats ?? "", "Cost per seat": l.unit_cost ?? "", Billing: l.billing || "", Owner: l.owner || "", Note: l.note || "",
  })), [28, 32, 9, 36, 12, 10, 12, 12, 7, 12, 18, 16, 40]);
  const gone = removedPeople(data.people, ctx);
  add("Removed", [
    ...gone.map((p) => ({ Type: p.opex ? "Person" : "Person (COGS)", Name: p.name, "Category / department": p.department || "", Baseline: r0(personCurrent(p, ctx)), [`FY ${year}`]: r0(personCost(p, ctx)), Saving: r0(p.saving), Note: p.note || "" })),
    ...removedLines(data.lines).map((l) => ({ Type: "Vendor removed", Name: l.vendor, "Category / department": catLabel(l.category), Baseline: r0(l.baseline), [`FY ${year}`]: 0, Saving: r0(l.baseline), Note: l.note || "" })),
    ...reducedLines(data.lines).map((l) => ({ Type: "Vendor reduced", Name: l.vendor, "Category / department": catLabel(l.category), Baseline: r0(l.baseline), [`FY ${year}`]: r0(l.amount), Saving: r0(l.saving), Note: l.note || "" })),
  ], [16, 32, 30, 12, 12, 12, 40]);
  const months = [...new Set(data.baseline.flatMap((a) => Object.keys(a.months || {})))].sort();
  add("Baseline by account", data.baseline.slice().sort((a, b) => String(a.account_num).localeCompare(String(b.account_num))).map((a) => {
    const row = { Account: a.account_num, Name: a.account_name, Category: catLabel(a.category) };
    for (const m of months) row[m] = r0(a.months?.[m]);
    row.Total = r0(a.total);
    return row;
  }), [9, 34, 26, ...months.map(() => 11), 13]);
  X.writeFile(wb, `Zero-Based Budget FY${year}${version ? ` - ${String(version).replace(/[\\/:*?"<>|]/g, "")}` : ""} ${new Date().toISOString().slice(0, 10)}.xlsx`);
}
