"use client";
// Finance > Zero-Based Budget: a zero-based Opex plan for one year.
// People: an org chart seeded from Helm, where each person is kept, removed or
// added, with salary, bonus and the months they are paid. Vendors and software:
// every Opex vendor from QuickBooks (baseline = trailing actuals) starts "to
// decide" and counts as zero until kept or changed; new tools are searched in
// QuickBooks or priced from their public pricing pages. Removed: what was cut.
// Data lives behind POST /zbb (owners/admins), not /rest/v1, because of salaries.
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
const parseMoney = (s) => {
  let t = String(s ?? "").replace(/[$,\s]/g, "");
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

// Paid months in the plan year and cost of a person.
const paidMonths = (p) => (p.status === "remove" ? Math.max(0, Number(p.end_month) || 0) : Math.max(0, (Number(p.end_month) || 12) - (Number(p.start_month) || 1) + 1));
const personCost = (p, load) => ((Number(p.salary) || 0) + (Number(p.bonus) || 0)) * (1 + load / 100) * paidMonths(p) / 12;
const personBase = (p, load) => (p.status === "new" ? 0 : ((Number(p.salary) || 0) + (Number(p.bonus) || 0)) * (1 + load / 100));
const catLabel = (c) => (c === "People Costs" ? "Other people costs (hiring, training, perks, fees)" : c);
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

export default function ZeroBasedBudget({ isMobile }) {
  const [year, setYear] = useState(new Date().getFullYear() + (new Date().getMonth() >= 6 ? 1 : 0));
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState("");
  const [tab, setTab] = useState("summary");
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    setErr(null);
    try { setData(await call({ action: "load", year })); } catch (e) { setErr(e.message); }
  }, [year]);
  useEffect(() => { setData(null); load(); }, [load]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 3500); return () => clearTimeout(t); }, [toast]);

  const plan = data?.plan;
  const settings = plan?.settings || {};
  const load_pct = Number(settings.load_pct ?? 18);
  const hidden = settings.hidden_categories || DEFAULT_HIDDEN;

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
  const totals = useMemo(() => {
    if (!data) return null;
    const visible = (c) => !hidden.includes(c || "");
    const base = {}; let payBase = 0; let salBase = 0; let loadBase = 0;
    for (const a of data.baseline) {
      if (PAY_ACCT.test(a.account_num)) { payBase += a.total; if (SALARY_ACCT.test(a.account_num)) salBase += a.total; if (LOAD_ACCT.test(a.account_num)) loadBase += a.total; continue; }
      base[a.category] = (base[a.category] || 0) + a.total;
    }
    const cats = {};
    const ensure = (c) => cats[c] || (cats[c] = { category: c, baseline: 0, plan: 0, review: 0, keep: 0, change: 0, remove: 0, newN: 0, removed: 0, added: 0 });
    for (const [c, v] of Object.entries(base)) ensure(c).baseline = v;
    for (const l of data.lines) {
      const e = ensure(l.category || "Non-Fixed and Other");
      e.plan += lineAmount(l);
      if (l.status === "review") e.review++; else if (l.status === "new") { e.newN++; e.added += lineAmount(l); } else e[l.status]++;
      if (l.status === "remove") e.removed += Number(l.baseline) || 0;
    }
    const people = data.people;
    const pplPlan = people.reduce((s, p) => s + personCost(p, load_pct), 0);
    const pplBaseEntered = people.reduce((s, p) => s + personBase(p, load_pct), 0);
    const head = { keep: people.filter((p) => p.status === "keep").length, remove: people.filter((p) => p.status === "remove").length, add: people.filter((p) => p.status === "new").length };
    const missingPay = people.filter((p) => p.status !== "remove" && !(Number(p.salary) > 0)).length;
    const list = Object.values(cats).filter((c) => c.category !== "People Costs" || c.baseline || c.plan).sort((a, b) => b.baseline - a.baseline);
    const shown = list.filter((c) => visible(c.category));
    const vBase = shown.reduce((s, c) => s + c.baseline, 0);
    const vPlan = shown.reduce((s, c) => s + c.plan, 0);
    const review = data.lines.filter((l) => l.status === "review" && visible(l.category)).length;
    return { list, shown, vBase, vPlan, payBase, salBase, loadBase, pplPlan, pplBaseEntered, head, missingPay, review, actualLoad: salBase ? (loadBase / salBase) * 100 : null };
  }, [data, hidden, load_pct]);

  if (err && !data) return <div style={{ padding: 24, color: T.red, fontSize: 13 }}>{err}</div>;
  if (!data) return <div style={{ padding: 24, color: T.text3, fontSize: 13 }}>Loading the zero-based budget…</div>;

  const noActuals = !plan.actuals_refreshed_at;
  const totalBase = totals.vBase + totals.payBase;
  const totalPlan = totals.vPlan + totals.pplPlan;

  const TABS = [
    { id: "summary", label: "Summary" },
    { id: "people", label: `Org chart (${data.people.length})` },
    { id: "lines", label: `Vendors & software${totals.review ? ` · ${totals.review} to decide` : ""}` },
    { id: "removed", label: "Removed" },
  ];

  return (
    <div style={{ "--zbb-th": T.text3, maxWidth: 1400 }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginBottom: 14 }}>
        <div style={{ flex: "1 1 320px", minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, letterSpacing: ".06em", textTransform: "uppercase" }}>Zero-based budget · Opex</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}>
            <h2 style={{ margin: 0, fontSize: 20, color: T.text }}>FY {year}</h2>
            <select value={year} onChange={(e) => setYear(Number(e.target.value))} style={{ fontSize: 12, padding: "3px 6px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text }}>
              {[0, 1, 2].map((d) => { const y = new Date().getFullYear() + d; return <option key={y} value={y}>{y}</option>; })}
            </select>
          </div>
          <div style={{ fontSize: 12, color: T.text3, marginTop: 4 }}>
            Every line starts at zero. Baseline is QuickBooks actuals {settings.base_start ? `${settings.base_start.slice(0, 7)} to ${settings.base_end.slice(0, 7)}` : ""}
            {plan.actuals_refreshed_at ? ` (pulled ${new Date(plan.actuals_refreshed_at).toLocaleDateString()})` : " (not pulled yet)"}.
          </div>
        </div>
        <label style={{ fontSize: 11, color: T.text3, display: "flex", alignItems: "center", gap: 6 }} title="Payroll taxes, benefits and 401k on top of salary and bonus">
          Taxes &amp; benefits load
          <input type="number" min={0} max={100} step={0.5} defaultValue={load_pct} key={load_pct}
            onBlur={(e) => { const v = Number(e.target.value); if (v !== load_pct) wrap(saveSettings)({ load_pct: v }); }}
            style={{ width: 58, padding: "4px 6px", fontSize: 12, borderRadius: 5, border: `1px solid ${T.border}`, background: T.surface2, color: T.text }} />%
          {totals.actualLoad != null && <span style={{ color: T.text3 }}>(QBO actual {totals.actualLoad.toFixed(1)}%)</span>}
        </label>
        <button onClick={refresh} disabled={!!busy} style={{ ...btn(true), padding: "7px 12px", fontSize: 12 }}>{busy || (noActuals ? "Pull QuickBooks actuals" : "Refresh actuals")}</button>
      </div>

      {err && <div style={{ padding: "8px 12px", marginBottom: 10, borderRadius: 8, background: T.redDim, color: T.red, fontSize: 12 }}>{err}</div>}
      {noActuals && !busy && (
        <div style={{ ...card(), padding: 14, marginBottom: 14, fontSize: 13, color: T.text2 }}>
          Start by pulling QuickBooks actuals. That loads every Opex (6xxxx) account by vendor for the baseline window and lists each vendor here to keep, change or remove. It takes about a minute.
        </div>
      )}

      {/* Tiles */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(5, minmax(0, 1fr))", gap: 10, marginBottom: 14 }}>
        <Tile label="Baseline Opex" value={money(totalBase)} sub="trailing actuals, shown categories" />
        <Tile label={`FY ${year} plan`} value={money(totalPlan)} sub={`${signed(totalPlan - totalBase)} vs baseline`} tone={totalPlan <= totalBase ? T.green : T.red} />
        <Tile label="People" value={money(totals.pplPlan)} sub={`${totals.head.keep + totals.head.add} ${totals.head.keep + totals.head.add === 1 ? "head" : "heads"} · ${totals.head.remove} removed · ${totals.head.add} new`} />
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
      {tab === "people" && <OrgChart people={data.people} load={load_pct} savePerson={wrap(savePerson)} deletePerson={wrap(deletePerson)} isMobile={isMobile} payBase={totals.payBase} />}
      {tab === "lines" && <Lines lines={data.lines.filter((l) => !hidden.includes(l.category || ""))} planId={plan.id} categories={data.categories} saveLine={wrap(saveLine)} deleteLine={wrap(deleteLine)} isMobile={isMobile} setToast={setToast} allLines={data.lines} />}
      {tab === "removed" && <Removed people={data.people} lines={data.lines.filter((l) => !hidden.includes(l.category || ""))} load={load_pct} />}

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
    { category: "People (salary, bonus, taxes & benefits)", baseline: totals.payBase, plan: totals.pplPlan, people: true },
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
                  {r.people ? "see org chart" : <>{r.keep + r.change} kept · {r.remove} removed · {r.newN} new{r.review ? <b style={{ color: T.amber || T.yellow }}> · {r.review} to decide</b> : ""}</>}
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
        Grey bar: baseline actuals. Coloured bar: FY {year} plan. Vendor lines still "to decide" count as $0, as zero-based budgeting intends. The people baseline is QuickBooks pay accounts (60010–60059); the plan is the org chart.
      </div>
    </div>
  );
}

// ── Org chart ───────────────────────────────────────────────────────────────
function OrgChart({ people, load, savePerson, deletePerson, isMobile, payBase }) {
  const [view, setView] = useState("chart");
  const [q, setQ] = useState("");
  const [dept, setDept] = useState("");
  const [open, setOpen] = useState(() => new Set());
  const [edit, setEdit] = useState(null);
  const [drag, setDrag] = useState(null);
  const [allOpen, setAllOpen] = useState(true);

  const byId = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const kids = useMemo(() => {
    const m = new Map();
    for (const p of people) {
      const k = p.manager_id && byId.has(p.manager_id) ? p.manager_id : "root";
      if (!m.has(k)) m.set(k, []);
      m.get(k).push(p);
    }
    for (const v of m.values()) v.sort((a, b) => (kidsCount(b) - kidsCount(a)) || a.name.localeCompare(b.name));
    function kidsCount(p) { return people.filter((x) => x.manager_id === p.id).length; }
    return m;
  }, [people, byId]);
  const subtree = useCallback((id) => {
    const out = []; const st = [...(kids.get(id) || [])];
    while (st.length) { const p = st.pop(); out.push(p); st.push(...(kids.get(p.id) || [])); }
    return out;
  }, [kids]);
  const depts = [...new Set(people.map((p) => p.department).filter(Boolean))].sort();
  const match = (p) => (!dept || p.department === dept) && (!q || `${p.name} ${p.title || ""} ${p.department || ""}`.toLowerCase().includes(q.toLowerCase()));
  const filtering = !!(q || dept);
  const visibleIds = useMemo(() => {
    if (!filtering) return null;
    const s = new Set();
    for (const p of people) if (match(p)) { let c = p; let guard = 0; while (c && guard++ < 50) { s.add(c.id); c = byId.get(c.manager_id); } }
    return s;
  }, [people, q, dept, byId]); // eslint-disable-line react-hooks/exhaustive-deps

  const isOpen = (id) => (filtering ? true : allOpen ? !open.has(id) : open.has(id));
  const toggle = (id) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const set = (p, patch) => savePerson({ ...p, ...patch });

  const removeWithTeam = (p) => {
    const team = subtree(p.id);
    set(p, { status: "remove", end_month: 0 });
    if (team.length) team.forEach((t) => t.status !== "remove" && set(t, { status: "remove", end_month: 0 }));
  };
  const addRole = async (manager) => {
    const r = await savePerson({ name: "New role", title: "", department: manager?.department || "", manager_id: manager?.id || null, status: "new", start_month: 1, end_month: 12 });
    if (r) setEdit(r);
  };
  const onDrop = (target) => {
    if (!drag || drag === target?.id) return;
    if (target && subtree(drag).some((x) => x.id === target.id)) return; // no cycles
    const p = byId.get(drag); if (p) set(p, { manager_id: target ? target.id : null });
    setDrag(null);
  };

  const renderNode = (p, depth) => {
    if (visibleIds && !visibleIds.has(p.id)) return null;
    const ch = kids.get(p.id) || [];
    const team = ch.length ? subtree(p.id) : [];
    const teamCost = team.reduce((s, x) => s + personCost(x, load), 0);
    const gone = p.status === "remove";
    const mgr = byId.get(p.manager_id);
    const orphan = mgr && mgr.status === "remove" && !gone;
    const c = STATUS[p.status].c();
    return (
      <div key={p.id} style={{ marginLeft: depth ? (isMobile ? 12 : 22) : 0, borderLeft: depth ? `1px dashed ${T.border}` : "none", paddingLeft: depth ? 10 : 0 }}>
        <div draggable onDragStart={() => setDrag(p.id)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onDrop(p); }}
          style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: isMobile ? "wrap" : "nowrap", padding: "6px 8px", margin: "4px 0", borderRadius: 8,
            border: `1px solid ${orphan ? (T.amber || T.yellow) : T.border}`, borderLeft: `3px solid ${c}`, background: drag === p.id ? T.accentDim : T.surface, opacity: gone ? 0.62 : 1 }}>
          <button onClick={() => toggle(p.id)} disabled={!ch.length} style={{ width: 18, border: "none", background: "none", color: T.text3, cursor: ch.length ? "pointer" : "default", fontSize: 11, padding: 0 }}>{ch.length ? (isOpen(p.id) ? "▾" : "▸") : "·"}</button>
          <div style={{ flex: "1 1 200px", minWidth: 0, cursor: "pointer" }} onClick={() => setEdit(p)}>
            <div style={{ fontSize: 13, fontWeight: 600, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              <span style={{ textDecoration: gone ? "line-through" : "none" }}>{p.name}</span> {p.status !== "keep" && <Pill status={p.status} small />}
            </div>
            <div style={{ fontSize: 11, color: T.text3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {[p.title, p.department].filter(Boolean).join(" · ") || "No title"}
              {ch.length ? ` · ${team.filter((x) => x.status !== "remove").length}/${team.length} in team, ${money(teamCost)}` : ""}
              {orphan ? " · manager removed, reassign" : ""}
              {p.status === "new" ? ` · from ${MONTHS[(p.start_month || 1) - 1]}` : ""}
              {gone && p.end_month ? ` · paid through ${MONTHS[p.end_month - 1]}` : ""}
            </div>
          </div>
          <span style={{ fontSize: 10, color: T.text3 }}>Salary</span>
          <MoneyInput value={Number(p.salary)} onSave={(v) => set(p, { salary: v })} width={86} />
          <span style={{ fontSize: 12, color: T.text2, width: 70, textAlign: "right", fontVariantNumeric: "tabular-nums" }} title="Plan cost: (salary + bonus) × load × months paid">{money(personCost(p, load))}</span>
          {gone
            ? <button onClick={() => set(p, { status: p.profile_id ? "keep" : "new", end_month: 12 })} style={btn(false)}>Restore</button>
            : <button onClick={() => set(p, { status: "remove", end_month: 0 })} style={btn(false, T.red)} title="Remove from the plan">Remove</button>}
          <button onClick={() => addRole(p)} style={btn(false)} title="Add a new role reporting to this person">+ Report</button>
        </div>
        {ch.length > 0 && isOpen(p.id) && ch.map((k) => renderNode(k, depth + 1))}
      </div>
    );
  };

  const roots = kids.get("root") || [];
  const missing = people.filter((p) => p.status !== "remove" && !(Number(p.salary) > 0)).length;
  const planTotal = people.reduce((s, p) => s + personCost(p, load), 0);

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 10 }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people, titles…" style={{ flex: "1 1 200px", padding: "6px 10px", fontSize: 12, borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text }} />
        <select value={dept} onChange={(e) => setDept(e.target.value)} style={{ padding: "6px 8px", fontSize: 12, borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text }}>
          <option value="">All departments</option>{depts.map((d) => <option key={d}>{d}</option>)}
        </select>
        <button onClick={() => setView("chart")} style={btn(view === "chart")}>Chart</button>
        <button onClick={() => setView("table")} style={btn(view === "table")}>Table</button>
        {view === "chart" && <button onClick={() => { setAllOpen((v) => !v); setOpen(new Set()); }} style={btn(false)}>{allOpen ? "Collapse all" : "Expand all"}</button>}
        <button onClick={() => addRole(null)} style={btn(true)}>+ New role</button>
      </div>
      <div style={{ fontSize: 11, color: T.text3, marginBottom: 8 }}>
        Plan {full(planTotal)} vs QuickBooks pay baseline {full(payBase)}. {missing ? <b style={{ color: T.amber || T.yellow }}>{missing} people still need a salary. </b> : ""}
        Click a person to edit. Drag a person onto someone else to change who they report to{view === "chart" ? <>, or <span onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); onDrop(null); }} style={{ border: `1px dashed ${T.border}`, padding: "0 6px", borderRadius: 4 }}>drop here for top level</span></> : ""}.
      </div>
      {view === "chart"
        ? <div style={{ ...card(), padding: 10 }}>{roots.map((p) => renderNode(p, 0))}</div>
        : <PeopleTable people={people.filter(match)} byId={byId} load={load} set={set} setEdit={setEdit} />}
      {edit && <PersonEditor person={people.find((p) => p.id === edit.id) || edit} people={people} subtree={subtree} load={load}
        onClose={() => setEdit(null)} onSave={async (patch) => { await set(people.find((p) => p.id === edit.id) || edit, patch); }}
        onRemoveTeam={(p) => removeWithTeam(p)} onDelete={async (p) => { await deletePerson(p.id); setEdit(null); }} />}
    </div>
  );
}

function PeopleTable({ people, byId, load, set, setEdit }) {
  const [sort, setSort] = useState({ k: "department", d: 1 });
  const rows = [...people].sort((a, b) => {
    const va = sort.k === "cost" ? personCost(a, load) : sort.k === "salary" ? Number(a.salary) : String(a[sort.k] || "");
    const vb = sort.k === "cost" ? personCost(b, load) : sort.k === "salary" ? Number(b.salary) : String(b[sort.k] || "");
    return (va > vb ? 1 : va < vb ? -1 : a.name.localeCompare(b.name)) * sort.d;
  });
  const H = ({ k, children, right }) => <th onClick={() => setSort((s) => ({ k, d: s.k === k ? -s.d : 1 }))} style={{ ...th, cursor: "pointer", textAlign: right ? "right" : "left" }}>{children}{sort.k === k ? (sort.d > 0 ? " ▲" : " ▼") : ""}</th>;
  return (
    <div style={{ ...card(), overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead><tr style={{ borderBottom: `1px solid ${T.border}` }}>
          <H k="name">Name</H><H k="title">Title</H><H k="department">Dept</H><th style={th}>Reports to</th><H k="status">Status</H>
          <H k="salary" right>Salary</H><th style={{ ...th, textAlign: "right" }}>Bonus</th><th style={th}>Months</th><H k="cost" right>Plan cost</H>
        </tr></thead>
        <tbody>{rows.map((p) => (
          <tr key={p.id} style={{ borderBottom: `1px solid ${T.border}`, opacity: p.status === "remove" ? 0.6 : 1 }}>
            <td style={{ padding: "5px 8px", color: T.text, cursor: "pointer", fontWeight: 600, whiteSpace: "nowrap" }} onClick={() => setEdit(p)}>{p.name}</td>
            <td style={{ padding: "5px 8px", color: T.text2 }}>{p.title}</td>
            <td style={{ padding: "5px 8px", color: T.text2 }}>{p.department}</td>
            <td style={{ padding: "5px 8px", color: T.text3, whiteSpace: "nowrap" }}>{byId.get(p.manager_id)?.name || "—"}</td>
            <td style={{ padding: "5px 8px" }}><Pill status={p.status} small /></td>
            <td style={{ padding: "5px 8px", textAlign: "right" }}><MoneyInput value={Number(p.salary)} onSave={(v) => set(p, { salary: v })} /></td>
            <td style={{ padding: "5px 8px", textAlign: "right" }}><MoneyInput value={Number(p.bonus)} onSave={(v) => set(p, { bonus: v })} width={80} /></td>
            <td style={{ padding: "5px 8px", color: T.text3, whiteSpace: "nowrap" }}>{paidMonths(p)}</td>
            <td style={{ padding: "5px 8px", textAlign: "right", color: T.text, fontVariantNumeric: "tabular-nums" }}>{full(personCost(p, load))}</td>
          </tr>
        ))}</tbody>
      </table>
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

function PersonEditor({ person: p, people, subtree, load, onClose, onSave, onRemoveTeam, onDelete }) {
  const [f, setF] = useState(p);
  useEffect(() => setF(p), [p.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const team = subtree(p.id);
  const banned = new Set([p.id, ...team.map((t) => t.id)]);
  const put = (k, v) => setF((x) => ({ ...x, [k]: v }));
  const save = async () => { await onSave({ name: f.name, title: f.title, department: f.department, manager_id: f.manager_id || null, status: f.status, salary: parseMoney(f.salary), bonus: parseMoney(f.bonus), start_month: Number(f.start_month) || 1, end_month: Number(f.end_month), note: f.note }); onClose(); };
  const preview = { ...f, salary: parseMoney(f.salary), bonus: parseMoney(f.bonus) };
  return (
    <Drawer title={p.profile_id ? p.name : "Role"} onClose={onClose}>
      <Field label="Name or role"><input style={inp()} value={f.name || ""} onChange={(e) => put("name", e.target.value)} /></Field>
      <Field label="Title"><input style={inp()} value={f.title || ""} onChange={(e) => put("title", e.target.value)} /></Field>
      <Field label="Department"><input style={inp()} value={f.department || ""} onChange={(e) => put("department", e.target.value)} /></Field>
      <Field label="Reports to">
        <select style={inp()} value={f.manager_id || ""} onChange={(e) => put("manager_id", e.target.value)}>
          <option value="">— top level —</option>
          {people.filter((x) => !banned.has(x.id)).sort((a, b) => a.name.localeCompare(b.name)).map((x) => <option key={x.id} value={x.id}>{x.name}{x.status === "remove" ? " (removed)" : ""}</option>)}
        </select>
      </Field>
      <Field label="Status">
        <div style={{ display: "flex", gap: 6 }}>
          {(p.profile_id ? ["keep", "remove"] : ["new", "remove"]).map((s) => (
            <button key={s} onClick={() => setF((x) => ({ ...x, status: s, end_month: s === "remove" ? 0 : 12 }))} style={btn(f.status === s, STATUS[s].c())}>{STATUS[s].label}</button>
          ))}
        </div>
      </Field>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        <Field label="Annual salary"><input style={inp()} value={f.salary ?? ""} onChange={(e) => put("salary", e.target.value)} placeholder="e.g. 95000 or 95k" /></Field>
        <Field label="Annual bonus"><input style={inp()} value={f.bonus ?? ""} onChange={(e) => put("bonus", e.target.value)} /></Field>
      </div>
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
      <div style={{ fontSize: 12, color: T.text2, margin: "6px 0 14px" }}>Plan cost <b>{full(personCost(preview, load))}</b> ({paidMonths(preview)} months, {load}% taxes &amp; benefits). Full-year cost {full(personBase({ ...preview, status: "keep" }, load))}.</div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button onClick={save} style={{ ...btn(true), padding: "7px 14px", fontSize: 12 }}>Save</button>
        {team.length > 0 && <button onClick={() => { onRemoveTeam(p); onClose(); }} style={btn(false, T.red)}>Remove with team ({team.length})</button>}
        {!p.profile_id && <button onClick={() => onDelete(p)} style={btn(false, T.red)}>Delete role</button>}
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
  const order = Object.keys(groups).sort((a, b) => groups[b].reduce((s, l) => s + Number(l.baseline), 0) - groups[a].reduce((s, l) => s + Number(l.baseline), 0));

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
              <span style={{ fontWeight: 700, fontSize: 13, color: T.text, flex: 1 }}>{catLabel(cat)} <span style={{ fontWeight: 400, color: T.text3, fontSize: 11 }}>{ls.length} lines</span></span>
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
  const cats = [...new Set([...(categories || []).map((c) => c.name), ...Object.keys(CAT_ACCOUNT)])].filter((c) => c !== "COGS" && c !== "People Costs");
  return (
    <Drawer title={line.id ? line.vendor : "New line"} onClose={onClose}>
      <Field label="Vendor / tool"><input style={inp()} value={f.vendor || ""} onChange={(e) => put("vendor", e.target.value)} /></Field>
      <Field label="Category">
        <select style={inp()} value={f.category || ""} onChange={(e) => { const c = e.target.value; setF((x) => ({ ...x, category: c, ...(CAT_ACCOUNT[c] && !line.account_num ? { account_num: CAT_ACCOUNT[c][0], account_name: CAT_ACCOUNT[c][1] } : {}) })); }}>
          {cats.map((c) => <option key={c}>{c}</option>)}
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
function Removed({ people, lines, load }) {
  const gone = people.filter((p) => p.status === "remove").map((p) => ({ ...p, saving: personBase(p, load) - personCost(p, load) })).sort((a, b) => b.saving - a.saving);
  const cut = lines.filter((l) => l.status === "remove" && Number(l.baseline)).sort((a, b) => b.baseline - a.baseline);
  const reduced = lines.filter((l) => l.status === "change" && Number(l.amount) < Number(l.baseline)).map((l) => ({ ...l, saving: l.baseline - l.amount })).sort((a, b) => b.saving - a.saving);
  const pSave = gone.reduce((s, p) => s + p.saving, 0);
  const vSave = cut.reduce((s, l) => s + Number(l.baseline), 0);
  const rSave = reduced.reduce((s, l) => s + l.saving, 0);
  const byCat = {};
  for (const l of cut) byCat[l.category] = (byCat[l.category] || 0) + Number(l.baseline);
  for (const l of reduced) byCat[l.category] = (byCat[l.category] || 0) + l.saving;
  const noSalary = gone.filter((p) => !(Number(p.salary) > 0)).length;

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
        <Tile label="Total removed" value={money(pSave + vSave + rSave)} sub="vs baseline run rate" tone={T.green} />
        <Tile label="People" value={money(pSave)} sub={`${gone.length} roles${noSalary ? `, ${noSalary} without salary entered` : ""}`} />
        <Tile label="Vendors cut" value={money(vSave)} sub={`${cut.length} vendors`} />
        <Tile label="Vendors reduced" value={money(rSave)} sub={`${reduced.length} renegotiated or downsized`} />
      </div>
      {Object.keys(byCat).length > 0 && (
        <div style={{ ...card(), padding: "10px 12px", marginBottom: 12, display: "flex", flexWrap: "wrap", gap: 16 }}>
          {Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([c, v]) => <div key={c} style={{ fontSize: 12, color: T.text2 }}>{c} <b style={{ color: T.text }}>{money(v)}</b></div>)}
        </div>
      )}
      <Section title="People removed" total={pSave} empty="Nobody removed yet. Use Remove on the org chart.">
        {gone.length ? tbl(["Name", "Title", "Department", "Paid through", "Saving"], gone.map((p) => (
          <tr key={p.id}>{td(p.name, false, true)}{td(p.title)}{td(p.department)}{td(p.end_month ? MONTHS[p.end_month - 1] : "Before Jan")}{td(Number(p.salary) > 0 ? full(p.saving) : "salary not entered", true, true)}</tr>
        ))) : null}
      </Section>
      <Section title="Vendors removed" total={vSave} empty="No vendors removed yet.">
        {cut.length ? tbl(["Vendor", "Category", "Account", "Note", "Baseline saved"], cut.map((l) => (
          <tr key={l.id}>{td(l.vendor, false, true)}{td(l.category)}{td(`${l.account_num || ""} ${String(l.account_name || "").split(":").pop()}`)}{td(l.note || "")}{td(full(l.baseline), true, true)}</tr>
        ))) : null}
      </Section>
      <Section title="Vendors reduced" total={rSave} empty="No reductions yet. Use Change and enter a lower amount.">
        {reduced.length ? tbl(["Vendor", "Category", "Baseline", "Plan", "Saving"], reduced.map((l) => (
          <tr key={l.id}>{td(l.vendor, false, true)}{td(l.category)}{td(full(l.baseline))}{td(full(l.amount))}{td(full(l.saving), true, true)}</tr>
        ))) : null}
      </Section>
    </div>
  );
}
