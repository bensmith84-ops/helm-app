"use client";
// Program workspace (PLM v3): one header with the facts that matter, tabs for each
// part of the product's life, and an AI agent beside every tab. All numbers come
// from Helm data; formula maths runs through the same code the R&D Advisor uses.
import { useState, useEffect, useMemo, useCallback, useRef, Suspense } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { askAdvisor } from "../lib/rdAdvisor";
import { Icon, Chip, Seg, Modal, Progress, Avatar } from "./work/ui";
import { renderMarkdown } from "./plmMarkdown";
import * as C from "../../helm-api/src/lib/advisor/calc";

// ───────────────────────── constants ─────────────────────────
export const V3_STAGES = [
  { key: "ideation", label: "Ideation" }, { key: "concept", label: "Concept" }, { key: "feasibility", label: "Feasibility" },
  { key: "development", label: "Development" }, { key: "optimization", label: "Optimization" }, { key: "validation", label: "Validation" },
  { key: "scale_up", label: "Scale-Up" }, { key: "regulatory", label: "Regulatory" }, { key: "launch_ready", label: "Launch Ready" }, { key: "launched", label: "Launched" },
];
const STAGE_IX = Object.fromEntries(V3_STAGES.map((s, i) => [s.key, i]));
const PRIORITY_TONE = { critical: "coral", high: "amber", medium: "amber", low: "slate" };
const TABS = [
  { key: "overview", label: "Overview", icon: "home" },
  { key: "formula", label: "Formula", icon: "flask" },
  { key: "sourcing", label: "Sourcing", icon: "factory" },
  { key: "claims", label: "Claims & Legal", icon: "stamp" },
  { key: "pricing", label: "Pricing & Margin", icon: "chart" },
  { key: "timeline", label: "Timeline", icon: "timeline" },
  { key: "gates", label: "Stage Gates", icon: "check" },
  { key: "launch", label: "Launch", icon: "flag" },
  { key: "agent", label: "AI agent", icon: "spark" },
];
const AGENTS = {
  chemist: { name: "Formula agent", mode: "chemist", icon: "flask", desc: "Formulation, stains, stability, cost and DOE" },
  sourcing: { name: "Sourcing agent", mode: "sourcing", icon: "factory", desc: "Finds and qualifies ingredients and manufacturers" },
  claims: { name: "Claims agent", mode: "chemist", icon: "stamp", desc: "Checks claims against the formula, evidence and rules" },
  pricing: { name: "Pricing agent", mode: "rfp", icon: "chart", desc: "Quotes, landed cost, price and margin" },
};

// ───────────────────────── helpers ─────────────────────────
const ymd = (d) => (d ? String(d).slice(0, 10) : null);
const today = () => new Date().toISOString().slice(0, 10);
const days = (a, b) => Math.round((new Date(b + "T00:00:00") - new Date(a + "T00:00:00")) / 86400000);
const fmtD = (d, o = { month: "short", day: "numeric", year: "numeric" }) => (d ? new Date(String(d).slice(0, 10) + "T00:00:00").toLocaleDateString("en-US", o) : "—");
const money = (v, d = 2) => (v == null || !isFinite(v) ? "—" : "$" + Number(v).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d }));
const pct = (v, d = 1) => (v == null || !isFinite(v) ? "—" : Number(v).toFixed(d) + "%");
const ago = (d) => { if (!d) return ""; const m = Math.round((Date.now() - new Date(d)) / 60000); return m < 1 ? "just now" : m < 60 ? m + " min ago" : m < 1440 ? Math.round(m / 60) + " h ago" : m < 2880 ? "yesterday" : Math.round(m / 1440) + " d ago"; };
const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1).replace(/_/g, " ") : "");
const loadLS = (k, d = null) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const verNum = (v) => String(v || "").replace(/[^0-9.]/g, "").split(".").map((x) => Number(x) || 0);
const byVersionDesc = (a, b) => { const x = verNum(a.version), y = verNum(b.version); for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((y[i] || 0) !== (x[i] || 0)) return (y[i] || 0) - (x[i] || 0); } return String(b.created_at || "").localeCompare(String(a.created_at || "")); };
const CLASS_COLORS = { anionic: "#3b82f6", nonionic: "#06b6d4", amphoteric: "#8b5cf6", cationic: "#a855f7", biosurfactant: "#14b8a6", enzyme: "#22c55e", builder: "#6366f1", bleach: "#f59e0b", polymer: "#ec4899", film: "#0ea5e9", plasticizer: "#84cc16", disintegrant: "#a3a3a3", solvent: "#f97316", acid: "#ef4444", alkali: "#eab308", brightener: "#d946ef", fragrance: "#f43f5e", preservative: "#64748b", colorant: "#e11d48", filler: "#94a3b8", other: "#cbd5e1" };
const GOOD_SOURCING = new Set(["approved", "qualified", "preferred", "selected", "active"]);

// Library prices → { [ingredient_id | normalised name]: { price_per_kg, currency, supplier } }
function priceMap(lib, sups, pr) {
  const t = today(); const out = {};
  for (const l of lib) {
    const ss = sups.filter((s) => s.ingredient_id === l.id && !["disqualified", "inactive"].includes(s.status)).sort((a, b) => (b.is_preferred ? 1 : 0) - (a.is_preferred ? 1 : 0));
    for (const s of ss) {
      const rows = pr.filter((p) => p.supplier_id === s.id && (!p.effective_date || p.effective_date <= t) && (!p.expiry_date || p.expiry_date >= t)).map((p) => ({ ...p, perKg: C.pricePerKg(p.unit_price, p.uom || "kg") })).filter((p) => p.perKg != null).sort((a, b) => (Number(a.min_qty) || 0) - (Number(b.min_qty) || 0));
      if (rows.length) { const v = { price_per_kg: rows[0].perKg, currency: rows[0].currency || "USD", supplier: s.supplier_name }; out[l.id] = v; out[C.norm(l.name)] = v; if (l.inci_name) out[C.norm(l.inci_name)] = v; break; }
    }
  }
  return out;
}
function linkItems(items, lib) {
  return items.map((it) => { if (it.ingredient_id) return it; const m = lib.find((l) => C.norm(l.name) === C.norm(it.ingredient_name) || C.norm(l.inci_name) === C.norm(it.ingredient_name)); return m ? { ...it, ingredient_id: m.id, inci_name: m.inci_name } : it; });
}
const lowestTier = (tiers) => { const p = (tiers || []).map((t) => Number(t.unit_price ?? t.price)).filter((x) => isFinite(x) && x > 0); return p.length ? Math.min(...p) : null; };

// ───────────────────────── data ─────────────────────────
function useProgramData(program, orgId) {
  const [d, setD] = useState(null); const [tick, setTick] = useState(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  useEffect(() => {
    let alive = true; const pid = program.id;
    const q = (t, f) => { let b = supabase.from(t).select("*"); if (orgId) b = b.eq("org_id", orgId); return f(b).then((r) => r.data || [], () => []); };
    (async () => {
      const [forms, skus, sourcing, rfps, claims, docs, tests, issues, gates, exps, projects] = await Promise.all([
        q("plm_formulations", (b) => b.eq("program_id", pid)),
        q("plm_skus", (b) => b.eq("program_id", pid)),
        q("plm_sourcing", (b) => b.eq("program_id", pid)),
        q("plm_rfps", (b) => b.eq("program_id", pid)),
        q("plm_claims", (b) => b.eq("program_id", pid)),
        q("plm_claim_documents", (b) => b.eq("program_id", pid)),
        q("plm_test_results", (b) => b.eq("program_id", pid)),
        q("plm_issues", (b) => b.eq("program_id", pid)),
        q("plm_gate_reviews", (b) => b.eq("program_id", pid)),
        q("plm_experiments", (b) => b.eq("program_id", pid)),
        q("projects", (b) => b.eq("plm_program_id", pid).is("deleted_at", null)),
      ]);
      const fids = forms.map((f) => f.id); const rids = rfps.map((r) => r.id); const prj = projects.map((p) => p.id);
      const [items, providers, subs, tasks] = await Promise.all([
        fids.length ? q("plm_formula_items", (b) => b.in("formulation_id", fids)) : [],
        rids.length ? q("plm_rfp_providers", (b) => b.in("rfp_id", rids)) : [],
        rids.length ? q("plm_rfp_submissions", (b) => b.in("rfp_id", rids)) : [],
        prj.length ? q("tasks", (b) => b.in("project_id", prj).is("parent_task_id", null).is("deleted_at", null)) : [],
      ]);
      const libAll = await q("plm_ingredient_library", (b) => b);
      const wanted = new Set(items.map((i) => i.ingredient_id).filter(Boolean)); const names = new Set(items.map((i) => C.norm(i.ingredient_name)));
      const lib = libAll.filter((l) => wanted.has(l.id) || names.has(C.norm(l.name)) || names.has(C.norm(l.inci_name)));
      const sups = lib.length ? await q("plm_ingredient_suppliers", (b) => b.in("ingredient_id", lib.map((l) => l.id))) : [];
      const pr = sups.length ? await q("plm_ingredient_pricing", (b) => b.in("supplier_id", sups.map((s) => s.id))) : [];
      const people = [...new Set([...tasks.map((t) => t.assignee_id), ...forms.map((f) => f.created_by || f.formulator_id)].filter(Boolean))];
      const profiles = people.length ? await supabase.from("profiles").select("id,display_name,avatar_url").in("id", people).then((r) => r.data || [], () => []) : [];
      if (!alive) return;
      setD({ forms: forms.slice().sort(byVersionDesc), items: items.map((i) => ({ ...i })), skus, sourcing, rfps, providers, subs, claims, docs, tests, issues, gates: gates.slice().sort((a, b) => String(b.decision_date || b.review_date || b.created_at || "").localeCompare(String(a.decision_date || a.review_date || a.created_at || ""))), exps, projects, tasks, lib, prices: priceMap(lib, sups, pr), people: Object.fromEntries(profiles.map((p) => [p.id, p])) });
    })();
    return () => { alive = false; };
  }, [program.id, orgId, tick]);
  return [d, reload, setD];
}

// Current formula: the newest approved/production one, else the newest.
const currentFormula = (forms) => forms.find((f) => /production|scale_up|pilot/.test(f.status || "")) || forms[0] || null;
function formulaStats(d, f, unitWeightG) {
  if (!f) return null;
  const items = linkItems(d.items.filter((i) => i.formulation_id === f.id).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)), d.lib);
  if (!items.length) return { items: [], analysis: null, formula: f };
  const sku = d.skus.find((s) => s.formulation_id === f.id && C.massToGrams(s.net_weight, s.weight_unit || "g") != null);
  const w = unitWeightG || (sku ? C.massToGrams(sku.net_weight, sku.weight_unit || "g") : null);
  const analysis = C.analyzeFormula(items, { prices: d.prices, unitWeightG: w });
  analysis.screen = C.screenIngredients(items.map((i) => ({ ...i, pct: analysis.items.find((x) => x.ingredient === i.ingredient_name)?.pct })));
  return { items, analysis, formula: f, unitWeightG: w, unitSource: unitWeightG ? "entered" : sku ? `SKU ${sku.name}` : null };
}
function programHealth(program, d) {
  const t = today(); const lateLaunch = program.target_launch_date && ymd(program.target_launch_date) < t && program.current_stage !== "launched";
  const crit = d.issues.filter((i) => i.status !== "resolved" && i.status !== "closed" && (i.severity === "critical" || i.severity === "high")).length;
  const failing = d.tests.filter((x) => x.status === "fail").length;
  const lateTasks = d.tasks.filter((x) => x.due_date && ymd(x.due_date) < t && !["done", "cancelled"].includes(x.status)).length;
  if (lateLaunch) return { key: "off", label: "Off track", tone: "coral", why: "Past the target launch date" };
  if (crit || failing || lateTasks > 5) return { key: "risk", label: "At risk", tone: "amber", why: [crit && `${crit} high or critical issue${crit > 1 ? "s" : ""}`, failing && `${failing} failing test${failing > 1 ? "s" : ""}`, lateTasks > 5 && `${lateTasks} late tasks`].filter(Boolean).join(", ") };
  return { key: "on", label: "On track", tone: "green", why: "No late launch, critical issues or failing tests" };
}

// ───────────────────────── styles ─────────────────────────
export const PLM_V3_CSS = `
.pv{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--paper)}
.pv-head{background:var(--surface);border-bottom:1px solid var(--line);padding:14px 28px 0;flex:none}
.pv-crumb{display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--ink3)}
.pv-crumb button{border:none;background:none;color:var(--ink3);cursor:pointer;padding:0;font:inherit}.pv-crumb button:hover{color:var(--ink)}
.pv-hero{display:flex;gap:18px;align-items:center;margin-top:10px}
.pv-img{width:84px;height:84px;border-radius:16px;flex:none;display:flex;align-items:center;justify-content:center;background:linear-gradient(145deg,color-mix(in srgb,var(--accent) 22%,var(--surface)),color-mix(in srgb,var(--accent) 6%,var(--surface)));color:var(--accent-ink);overflow:hidden;border:1px solid var(--line)}
.pv-img img{width:100%;height:100%;object-fit:cover}
.pv-eyebrow{font-size:11px;font-weight:650;letter-spacing:.08em;text-transform:uppercase;color:var(--ink3)}
.pv-title{margin:2px 0 6px;font-size:24px;line-height:1.2;font-weight:750;letter-spacing:-.01em}
.pv-facts{display:flex;gap:26px;flex-wrap:wrap;margin:14px 0 2px}
.pv-fact{display:flex;gap:10px;align-items:center;min-width:0}
.pv-fact .ic{width:32px;height:32px;border-radius:9px;background:var(--sunken);display:flex;align-items:center;justify-content:center;color:var(--ink2);flex:none}
.pv-fact small{display:block;font-size:11.5px;color:var(--ink3)}
.pv-fact b{display:block;font-size:14px;font-weight:650;white-space:nowrap}
.pv-tabs{display:flex;gap:2px;overflow-x:auto;margin-top:14px;scrollbar-width:none}
.pv-tabs::-webkit-scrollbar{display:none}
.pv-tab{display:inline-flex;align-items:center;gap:7px;height:42px;padding:0 12px;border:none;background:none;color:var(--ink3);font:inherit;font-size:13.5px;font-weight:550;cursor:pointer;border-bottom:2px solid transparent;white-space:nowrap}
.pv-tab:hover{color:var(--ink)}
.pv-tab.on{color:var(--accent-ink);border-bottom-color:var(--accent)}
.pv-tab .n{font-size:11px;color:var(--ink3);font-variant-numeric:tabular-nums}
.pv-body{flex:1;min-height:0;overflow:auto}
.pv-grid{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:18px;padding:20px 28px 32px;align-items:start;max-width:1560px}
.pv-main{display:flex;flex-direction:column;gap:16px;min-width:0}
.pv-rail{display:flex;flex-direction:column;gap:16px;position:sticky;top:20px}
.pv-card{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:18px 20px;min-width:0}
.pv-card>h3,.pv-h{margin:0 0 12px;font-size:15px;font-weight:700;display:flex;align-items:center;gap:10px}
.pv-h .sp{flex:1}
.pv-sub{font-size:12.5px;color:var(--ink3);margin:-8px 0 12px}
.pv-ai{background:linear-gradient(160deg,color-mix(in srgb,var(--accent) 9%,var(--surface)),var(--surface) 55%);border:1px solid color-mix(in srgb,var(--accent) 22%,var(--line))}
.pv-ai .ttl{display:flex;align-items:center;gap:10px;font-size:15.5px;font-weight:700}
.pv-ai .ttl .ic{color:var(--accent)}
.pv-live{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:650;color:var(--green);background:var(--green-soft);padding:2px 8px;border-radius:10px}
.pv-live i{width:6px;height:6px;border-radius:50%;background:var(--green)}
.pv-act{display:flex;align-items:center;gap:10px;width:100%;text-align:left;border:1px solid var(--line);background:var(--surface);border-radius:12px;padding:10px 12px;cursor:pointer;font:inherit;color:var(--ink);margin-top:8px;transition:border-color .12s,box-shadow .12s}
.pv-act:hover{border-color:var(--accent);box-shadow:var(--sh1)}
.pv-act .ic{width:30px;height:30px;border-radius:9px;background:var(--accent-soft);color:var(--accent-ink);display:flex;align-items:center;justify-content:center;flex:none}
.pv-act b{display:block;font-size:13px;font-weight:650}
.pv-act small{display:block;font-size:12px;color:var(--ink3);line-height:1.35}
.pv-ask{display:flex;gap:6px;align-items:flex-end;margin-top:12px;background:var(--surface);border:1px solid var(--line2);border-radius:12px;padding:8px 8px 8px 12px}
.pv-ask textarea{flex:1;border:none;outline:none;background:transparent;resize:none;font:inherit;font-size:13px;color:var(--ink);min-height:38px;line-height:1.45}
.pv-ask button{width:32px;height:32px;border-radius:9px;border:none;background:var(--accent);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;flex:none}
.pv-ask button:disabled{opacity:.4;cursor:default}
.pv-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}
.pv-chip{border:1px solid var(--line2);background:var(--surface);border-radius:14px;padding:4px 10px;font:inherit;font-size:12px;color:var(--ink2);cursor:pointer}
.pv-chip:hover{border-color:var(--accent);color:var(--accent-ink)}
.pv-step{display:flex;align-items:flex-start;overflow-x:auto;padding:4px 2px 2px}
.pv-step>div{flex:1;min-width:86px;display:flex;flex-direction:column;align-items:center;position:relative;text-align:center}
.pv-step>div::before{content:"";position:absolute;top:12px;left:-50%;right:50%;height:2px;background:var(--line2)}
.pv-step>div:first-child::before{display:none}
.pv-step>div.done::before,.pv-step>div.on::before{background:var(--accent)}
.pv-step .dot{width:26px;height:26px;border-radius:50%;border:2px solid var(--line2);background:var(--surface);display:flex;align-items:center;justify-content:center;z-index:1;color:#fff}
.pv-step .done .dot{background:var(--accent);border-color:var(--accent)}
.pv-step .on .dot{border-color:var(--accent);box-shadow:0 0 0 5px var(--accent-soft)}
.pv-step .on .dot::after{content:"";width:10px;height:10px;border-radius:50%;background:var(--accent)}
.pv-step .lb{font-size:12.5px;font-weight:550;color:var(--ink2);margin-top:8px;white-space:nowrap}
.pv-step .on .lb{color:var(--accent-ink);font-weight:700}
.pv-step .dt{font-size:11px;color:var(--ink3);margin-top:2px;white-space:nowrap}
.pv-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.pv-kpi{background:var(--surface);border:1px solid var(--line);border-radius:16px;padding:14px 16px;display:flex;flex-direction:column;gap:4px;min-width:0}
.pv-kpi .l{display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:600;color:var(--ink3)}
.pv-kpi .l .ic{width:28px;height:28px;border-radius:8px;background:var(--sunken);display:flex;align-items:center;justify-content:center;color:var(--ink2)}
.pv-kpi .v{font-size:26px;font-weight:750;line-height:1.15;letter-spacing:-.01em;font-variant-numeric:tabular-nums;margin-top:4px}
.pv-kpi .s{font-size:12px;color:var(--ink3)}
.pv-row{display:flex;align-items:center;gap:12px;padding:10px 2px;border-top:1px solid var(--line);min-width:0}
.pv-row:first-of-type{border-top:none}
.pv-row.click{cursor:pointer;border-radius:8px}.pv-row.click:hover{background:var(--raise)}
.pv-row .t{flex:1;min-width:0}
.pv-row .t b{display:block;font-weight:600;font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pv-row .t small{display:block;font-size:12px;color:var(--ink3);margin-top:1px}
.pv-ico{width:34px;height:34px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex:none;background:var(--sunken);color:var(--ink2)}
.pv-tbl{width:100%;border-collapse:collapse;font-size:13px;font-variant-numeric:tabular-nums}
.pv-tbl th{text-align:left;font-size:11.5px;font-weight:600;color:var(--ink3);padding:8px 10px;border-bottom:1px solid var(--line);white-space:nowrap}
.pv-tbl td{padding:10px;border-bottom:1px solid var(--line);vertical-align:middle}
.pv-tbl tr:last-child td{border-bottom:none}
.pv-tbl tfoot td{font-weight:700;background:var(--sunken);border-bottom:none}
.pv-tbl tbody tr.click{cursor:pointer}.pv-tbl tbody tr.click:hover{background:var(--raise)}
.pv-tbl tbody tr.sel{background:var(--accent-soft)}
.pv-tbl .r{text-align:right}
.pv-fn{display:inline-block;font-size:11.5px;font-weight:600;padding:2px 9px;border-radius:10px;white-space:nowrap}
.pv-bar{height:6px;border-radius:3px;background:var(--sunken);overflow:hidden;min-width:60px}.pv-bar i{display:block;height:100%;border-radius:3px;background:var(--accent)}
.pv-stats{display:flex;background:var(--surface);border:1px solid var(--line);border-radius:16px;overflow-x:auto}
.pv-stats>div{flex:1;min-width:130px;padding:14px 18px;display:flex;gap:12px;align-items:center;border-left:1px solid var(--line)}
.pv-stats>div:first-child{border-left:none}
.pv-stats b{display:block;font-size:22px;font-weight:750;line-height:1.1;font-variant-numeric:tabular-nums}
.pv-stats small{font-size:12px;color:var(--ink3)}
.pv-check{display:flex;gap:10px;align-items:flex-start;padding:7px 0;font-size:13px;line-height:1.4}
.pv-check .ic{flex:none;margin-top:1px}
.pv-scen{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.pv-sc{border:1.5px solid var(--line);background:var(--surface);border-radius:16px;padding:14px 16px;cursor:pointer;text-align:left;font:inherit;color:var(--ink);transition:border-color .12s,box-shadow .12s}
.pv-sc:hover{border-color:var(--line2)}.pv-sc.on{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.pv-sc .nm{display:flex;align-items:center;gap:8px;font-weight:700;font-size:14.5px}
.pv-sc .ds{font-size:12px;color:var(--ink3);margin:2px 0 12px}
.pv-sc .nums{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:6px}
.pv-sc .nums small{display:block;font-size:11px;color:var(--ink3)}
.pv-sc .nums b{display:block;font-size:16px;font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap}
.pv-in{display:grid;grid-template-columns:1fr 120px;align-items:center;gap:10px;padding:6px 0;font-size:13px;color:var(--ink2)}
.pv-in input{height:32px;border:1px solid var(--line2);border-radius:8px;padding:0 10px;font:inherit;font-size:13px;color:var(--ink);background:var(--surface);text-align:right;width:100%;box-sizing:border-box;font-variant-numeric:tabular-nums}
.pv-in small{display:block;font-size:11px;color:var(--ink3)}
.pv-gantt{position:relative;overflow-x:auto}
.pv-gh,.pv-gr{display:grid;grid-template-columns:260px 110px 80px minmax(420px,1fr);align-items:center;min-height:40px;border-bottom:1px solid var(--line)}
.pv-gh{font-size:11.5px;font-weight:600;color:var(--ink3);min-height:34px}
.pv-gr .nm{display:flex;align-items:center;gap:8px;min-width:0;font-size:13px;font-weight:550;padding-right:8px}
.pv-gr.sub .nm{padding-left:26px;font-weight:450;color:var(--ink2)}
.pv-track{position:relative;height:100%;min-height:40px;border-left:1px solid var(--line)}
.pv-gbar{position:absolute;top:50%;height:14px;margin-top:-7px;border-radius:7px}
.pv-mon{position:absolute;top:0;bottom:0;border-left:1px dashed var(--line);font-size:11px;color:var(--ink3);padding:9px 0 0 6px;white-space:nowrap}
.pv-today{position:absolute;top:0;bottom:0;width:0;border-left:2px dashed var(--accent);z-index:2}
.pv-today span{position:absolute;top:-1px;left:-26px;background:var(--accent);color:#fff;font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:8px}
.pv-gate{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:12px;cursor:pointer}
.pv-gate:hover{background:var(--raise)}.pv-gate.on{background:var(--accent-soft)}
.pv-drawer{position:fixed;top:0;right:0;bottom:0;width:min(520px,100vw);background:var(--surface);border-left:1px solid var(--line);box-shadow:-12px 0 40px rgba(15,23,42,.14);z-index:60;display:flex;flex-direction:column}
.pv-drawer-h{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--line)}
.pv-msgs{flex:1;overflow:auto;padding:16px;display:flex;flex-direction:column;gap:12px}
.pv-msg{max-width:92%;padding:10px 13px;border-radius:14px;font-size:13px;line-height:1.6}
.pv-msg.u{align-self:flex-end;background:var(--accent-soft);white-space:pre-wrap}
.pv-msg.a{align-self:flex-start;background:var(--sunken)}
.pv-empty{color:var(--ink3);font-size:13px;line-height:1.55}
@media (max-width:1180px){.pv-grid{grid-template-columns:minmax(0,1fr)}.pv-rail{position:static}.pv-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:760px){.pv-img{width:56px;height:56px;border-radius:12px}.pv-head{padding:12px 14px 0}.pv-grid{padding:14px}.pv-scen{grid-template-columns:1fr}.pv-facts{gap:14px}.pv-title{font-size:20px}}
`;

// ───────────────────────── AI: drawer + rail ─────────────────────────
function AgentDrawer({ program, open, onClose }) {
  const [mode, setMode] = useState(open?.mode || "chemist"); const [msgs, setMsgs] = useState([]); const [input, setInput] = useState(""); const [busy, setBusy] = useState(false); const [conv, setConv] = useState(null);
  const box = useRef(null); const sentFor = useRef(null);
  const send = useCallback(async (text, m) => {
    const q = String(text || "").trim(); if (!q) return;
    const md = m || mode; setInput(""); setBusy(true);
    let hist; setMsgs((p) => { hist = p; return [...p, { role: "user", text: q }]; });
    const r = await askAdvisor({ question: q, program_id: program.id, mode: md, conversation_id: conv || undefined, history: (hist || []).map((x) => ({ role: x.role, content: x.text })) });
    setBusy(false);
    if (r.success) { setMsgs((p) => [...p, { role: "assistant", text: r.response, created: r.created_items }]); if (r.conversation_id) setConv(r.conversation_id); }
    else setMsgs((p) => [...p, { role: "assistant", text: "Error: " + (r.error || "no answer"), err: true }]);
  }, [mode, conv, program.id]);
  useEffect(() => { if (open && open.at !== sentFor.current) { sentFor.current = open.at; if (open.mode) setMode(open.mode); if (open.reset) { setMsgs([]); setConv(null); } if (open.prompt) send(open.prompt, open.mode); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" }); }, [msgs, busy]);
  if (!open) return null;
  const busyText = mode === "sourcing" ? "Searching and checking suppliers. This can take a minute or two." : "Reading the program's data and working it through…";
  return <div className="pv-drawer" role="dialog" aria-label="AI agent">
    <div className="pv-drawer-h">
      <Icon name="spark" size={18} style={{ color: "var(--accent)" }} />
      <b style={{ fontSize: 15 }}>Ask AI</b>
      <Seg value={mode} options={[["chemist", "Chemist"], ["sourcing", "Sourcing"], ["rfp", "Commercial"]]} onChange={setMode} />
      <span style={{ flex: 1 }} />
      {msgs.length > 0 && <button className="hw-btn ghost sm" onClick={() => { setMsgs([]); setConv(null); }}>New chat</button>}
      <button className="hw-icb" onClick={onClose} title="Close"><Icon name="x" /></button>
    </div>
    <div className="pv-msgs" ref={box}>
      {!msgs.length && !busy && <div className="pv-empty">Ask anything about <b>{program.name}</b>: the formula, a stain or stability problem, suppliers, claims, price and margin. The agent reads this program's data, checks outside facts on the web, and links its sources. Conversations are saved under AI agent.</div>}
      {msgs.map((m, i) => <div key={i} className={"pv-msg " + (m.role === "user" ? "u" : "a")} style={m.err ? { color: "var(--coral)" } : undefined}>{m.role === "user" ? m.text : renderMarkdown(m.text)}{(m.created || []).map((c, j) => <div key={j} style={{ marginTop: 6, fontSize: 12, color: "var(--green)" }}>{c.tool === "save_supplier" ? "Saved" : "Created"}: {c.result?.message || c.result?.name || c.name}</div>)}</div>)}
      {busy && <div className="pv-msg a" style={{ color: "var(--ink3)" }}>{busyText}</div>}
    </div>
    <div style={{ padding: "10px 14px 14px", borderTop: "1px solid var(--line)" }}>
      <div className="pv-ask" style={{ marginTop: 0 }}><textarea rows={2} value={input} placeholder="Ask about this program…" onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(input); } }} /><button disabled={busy || !input.trim()} onClick={() => send(input)}><Icon name="send" size={15} /></button></div>
    </div>
  </div>;
}

function AgentRail({ title, desc, icon = "spark", actions = [], chips = [], placeholder, ask, mode, children, live = true }) {
  const [q, setQ] = useState("");
  const go = () => { if (q.trim()) { ask(q.trim(), mode); setQ(""); } };
  return <div className="pv-card pv-ai">
    <div className="ttl"><Icon name={icon} size={20} className="ic" style={{ color: "var(--accent)" }} />{title}<span style={{ flex: 1 }} />{live && <span className="pv-live"><i />Live</span>}</div>
    {desc && <div style={{ fontSize: 12.5, color: "var(--ink3)", marginTop: 6, lineHeight: 1.5 }}>{desc}</div>}
    {children}
    {actions.map((a, i) => <button key={i} className="pv-act" onClick={() => ask(a.prompt, a.mode || mode)}><span className="ic"><Icon name={a.icon || "spark"} size={15} /></span><span style={{ flex: 1, minWidth: 0 }}><b>{a.label}</b>{a.hint && <small>{a.hint}</small>}</span><Icon name="chevR" size={15} style={{ color: "var(--ink3)" }} /></button>)}
    <div className="pv-ask"><textarea rows={2} value={q} placeholder={placeholder || "Ask a question…"} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); go(); } }} /><button disabled={!q.trim()} onClick={go}><Icon name="send" size={15} /></button></div>
    {chips.length > 0 && <div className="pv-chips">{chips.map((c) => <button key={c.label} className="pv-chip" onClick={() => ask(c.prompt, c.mode || mode)}>{c.label}</button>)}</div>}
  </div>;
}

// ───────────────────────── small pieces ─────────────────────────
function Donut({ parts, size = 150, stroke = 20, center }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1; const r = (size - stroke) / 2; const c = 2 * Math.PI * r; let off = 0;
  return <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Composition">
    <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--sunken)" strokeWidth={stroke} />
    {parts.map((p, i) => { const len = (p.value / total) * c; const el = <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.color} strokeWidth={stroke} strokeDasharray={`${Math.max(0, len - 2)} ${c}`} strokeDashoffset={-off} transform={`rotate(-90 ${size / 2} ${size / 2})`}><title>{p.label}: {p.value.toFixed(2)}%</title></circle>; off += len; return el; })}
    <text x="50%" y="47%" textAnchor="middle" style={{ font: "700 19px var(--sans)", fill: "var(--ink)" }}>{center?.[0]}</text>
    <text x="50%" y="60%" textAnchor="middle" style={{ font: "500 11px var(--sans)", fill: "var(--ink3)" }}>{center?.[1]}</text>
  </svg>;
}
const Fn = ({ cls }) => { const col = CLASS_COLORS[cls?.key] || "#94a3b8"; return <span className="pv-fn" style={{ background: `color-mix(in srgb, ${col} 14%, transparent)`, color: `color-mix(in srgb, ${col} 75%, var(--ink))` }}>{cls?.label?.replace(/ \/.*$/, "") || "Other"}</span>; };
const Empty = ({ children }) => <div className="pv-empty" style={{ padding: "6px 0" }}>{children}</div>;
const Check = ({ ok, warn, children }) => <div className="pv-check"><Icon name={ok ? "check" : "alert"} size={15} className="ic" style={{ color: ok ? "var(--green)" : warn ? "var(--amber)" : "var(--coral)" }} /><span>{children}</span></div>;

// ───────────────────────── Overview ─────────────────────────
function OverviewTab({ program, d, ask, go, navigateToProject, formula }) {
  const t = today(); const health = programHealth(program, d); const cur = STAGE_IX[program.current_stage] ?? 0;
  const gateDone = (k) => d.gates.find((g) => g.to_stage === k && g.decision === "approved");
  const pricing = program.cost_scenarios || {}; const base = (pricing.scenarios || []).find((s) => s.key === (pricing.selected || "base"));
  const open = d.tasks.filter((x) => !["done", "cancelled"].includes(x.status)).sort((a, b) => String(a.due_date || "9999").localeCompare(String(b.due_date || "9999"))).slice(0, 5);
  const lateDays = program.target_launch_date ? days(t, ymd(program.target_launch_date)) : null;
  const subs = d.claims.filter((c) => ["substantiated", "approved", "active"].includes(c.status)).length;
  const fa = formula?.analysis;
  const readiness = loadLS(`plm.review.stage_readiness.${program.id}`);
  const insights = [
    { icon: "flask", title: "Formula", tab: "formula", text: formula ? `${formula.formula.name} ${formula.formula.version || ""}: ${fa ? `${pct(fa.total_surfactant_pct)} surfactant${fa.cost.raw_material_cost_per_unit != null ? `, ${money(fa.cost.raw_material_cost_per_unit, 3)} raw materials per unit` : fa.cost.raw_material_cost_per_kg != null ? `, ${money(fa.cost.raw_material_cost_per_kg)} per kg` : ""}${fa.checks.length ? `, ${fa.checks.length} check${fa.checks.length > 1 ? "s" : ""} to look at` : ""}` : "no ingredients yet"}` : "No formula yet" },
    { icon: "factory", title: "Sourcing", tab: "sourcing", text: d.sourcing.length ? `${d.sourcing.length} supplier${d.sourcing.length > 1 ? "s" : ""} tracked, ${d.sourcing.filter((s) => GOOD_SOURCING.has(s.status)).length} approved. ${d.subs.length ? `${d.subs.length} quote${d.subs.length > 1 ? "s" : ""} on ${d.rfps.length} RFP${d.rfps.length > 1 ? "s" : ""}.` : d.rfps.length ? `${d.rfps.length} RFP${d.rfps.length > 1 ? "s" : ""}, no quotes yet.` : ""}` : "No suppliers tracked yet" },
    { icon: "stamp", title: "Claims", tab: "claims", text: d.claims.length ? `${subs} of ${d.claims.length} claims substantiated or approved; ${d.docs.length} evidence document${d.docs.length === 1 ? "" : "s"}.` : (program.desired_claims || []).length ? `${program.desired_claims.length} desired claims, none recorded with evidence yet.` : "No claims yet" },
    { icon: "check", title: "Gate readiness", tab: "gates", text: readiness ? `${Math.round(readiness.readiness_score)}/100 to move to ${readiness.next_stage} (checked ${ago(readiness.generated_at)}). ${(readiness.blockers || []).length} blocker${(readiness.blockers || []).length === 1 ? "" : "s"}.` : "Not checked yet. Run the readiness check on Stage Gates." },
  ];
  const activity = [
    ...d.forms.map((f) => ({ at: f.updated_at || f.created_at, icon: "flask", tag: "Formula", text: `${f.name} ${f.version || ""} ${f.created_at === f.updated_at ? "created" : "updated"}`, tab: "formula" })),
    ...d.sourcing.map((s) => ({ at: s.updated_at || s.created_at, icon: "factory", tag: "Sourcing", text: `${s.supplier_name || s.name} ${cap(s.status || "added")}`, tab: "sourcing" })),
    ...d.claims.map((c) => ({ at: c.updated_at || c.created_at, icon: "stamp", tag: "Claims", text: `“${c.claim_text}” ${cap(c.status || "")}`, tab: "claims" })),
    ...d.tests.map((x) => ({ at: x.reported_date || x.tested_date || x.updated_at || x.created_at, icon: "chart", tag: "Testing", text: `${x.test_name}: ${x.status || "recorded"}`, tab: "claims" })),
    ...d.gates.map((g) => ({ at: g.decision_date || g.created_at, icon: "check", tag: "Stage gate", text: `${cap(g.from_stage)} → ${cap(g.to_stage)} ${g.decision || ""}`, tab: "gates" })),
    ...d.issues.map((i) => ({ at: i.updated_at || i.created_at, icon: "alert", tag: "Issue", text: `${i.title} (${i.status})`, tab: "launch" })),
  ].filter((a) => a.at).sort((a, b) => String(b.at).localeCompare(String(a.at))).slice(0, 7);
  const team = [
    { k: "chemist", status: formula ? `${d.forms.length} formula${d.forms.length > 1 ? "s" : ""} · ${formula.formula.version || "current"}` : "No formula yet", prompt: `Review the current formula for ${program.name}: what would you change first for performance, cost and claims?` },
    { k: "sourcing", status: `${d.sourcing.length} supplier${d.sourcing.length === 1 ? "" : "s"} · ${d.rfps.length} RFP${d.rfps.length === 1 ? "" : "s"}`, prompt: `What are the sourcing gaps and risks for ${program.name}, and who should we approach next?` },
    { k: "claims", status: `${subs}/${d.claims.length || (program.desired_claims || []).length} claims supported`, prompt: `Which of ${program.name}'s claims are at risk with the current formula and evidence, and what's missing?` },
    { k: "pricing", status: base ? `${money(base.price)} · ${pct(base.gm)} GM` : "No pricing model yet", prompt: `Check the pricing and margin for ${program.name} against the ${program.target_gross_margin_pct || ""}% GM target. What moves the margin most?` },
  ];
  const prjSpan = d.projects.map((p) => { const ts = d.tasks.filter((x) => x.project_id === p.id); const st = ts.map((x) => ymd(x.start_date || x.created_at)).filter(Boolean).sort()[0]; const en = ts.map((x) => ymd(x.due_date)).filter(Boolean).sort().pop(); return { p, st, en, done: ts.filter((x) => ["done", "cancelled"].includes(x.status)).length, n: ts.length }; }).filter((x) => x.st && x.en);
  return <div className="pv-grid">
    <div className="pv-main">
      <div className="pv-card">
        <div className="pv-h">Stage gate<span className="sp" /><button className="hw-btn ghost sm" onClick={() => go("gates")}>View stage gates<Icon name="arrowR" size={13} /></button></div>
        <div className="pv-step">{V3_STAGES.filter((s) => s.key !== "launch_ready").map((s) => { const i = STAGE_IX[s.key]; const st = i < cur ? "done" : i === cur ? "on" : ""; const g = gateDone(s.key); return <div key={s.key} className={st}><span className="dot">{st === "done" && <Icon name="check" size={13} sw={2.6} />}</span><span className="lb">{s.label}</span><span className="dt">{st === "done" ? (g ? "Approved " + fmtD(g.decision_date || g.review_date, { month: "short", day: "numeric" }) : "Completed") : st === "on" ? (program.stage_entered_at ? "Since " + fmtD(program.stage_entered_at, { month: "short", day: "numeric" }) : "In progress") : ""}</span></div>; })}</div>
      </div>
      <div className="pv-kpis">
        <div className="pv-kpi"><div className="l"><span className="ic"><Icon name="target" size={15} /></span>Target GM%</div><div className="v">{program.target_gross_margin_pct ? program.target_gross_margin_pct + "%" : "—"}</div><div className="s">{base ? <>Projected <b style={{ color: base.gm >= Number(program.target_gross_margin_pct || 0) ? "var(--green)" : "var(--coral)" }}>{pct(base.gm)}</b> at {money(base.price)}</> : "Model it on Pricing & Margin"}</div></div>
        <div className="pv-kpi"><div className="l"><span className="ic"><Icon name="tag" size={15} /></span>Target price</div><div className="v">{program.target_unit_price ? money(program.target_unit_price) : "—"}</div><div className="s">{(program.channels_v2 || []).join(", ") || "Channels not set"}</div></div>
        <div className="pv-kpi"><div className="l"><span className="ic"><Icon name="cal" size={15} /></span>Target launch</div><div className="v" style={{ fontSize: 22 }}>{fmtD(program.target_launch_date)}</div><div className="s" style={lateDays != null && lateDays < 0 && program.current_stage !== "launched" ? { color: "var(--coral)", fontWeight: 600 } : undefined}>{lateDays == null ? "No date set" : program.current_stage === "launched" ? "Launched" : lateDays < 0 ? `${-lateDays} days past target` : lateDays < 70 ? `In ${lateDays} days` : `In ${Math.round(lateDays / 7)} weeks`}</div></div>
        <div className="pv-kpi"><div className="l"><span className="ic"><Icon name="chart" size={15} /></span>Program health</div><div className="v" style={{ fontSize: 22, display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 10, height: 10, borderRadius: 5, background: `var(--${health.tone === "green" ? "green" : health.tone === "amber" ? "amber" : "coral"})` }} />{health.label}</div><div className="s">{health.why}</div></div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))", gap: 16 }}>
        <div className="pv-card">
          <div className="pv-h">Key insights</div>
          {insights.map((x) => <div key={x.title} className="pv-row click" onClick={() => go(x.tab)}><span className="pv-ico"><Icon name={x.icon} size={16} /></span><span className="t"><b>{x.title}</b><small style={{ whiteSpace: "normal" }}>{x.text}</small></span><Icon name="chevR" size={15} style={{ color: "var(--ink3)" }} /></div>)}
        </div>
        <div className="pv-card">
          <div className="pv-h">Recent activity</div>
          {!activity.length ? <Empty>Nothing recorded yet.</Empty> : activity.map((a, i) => <div key={i} className="pv-row click" onClick={() => go(a.tab)}><span className="pv-ico" style={{ width: 28, height: 28, borderRadius: 8 }}><Icon name={a.icon} size={14} /></span><span className="t"><b style={{ fontWeight: 550 }}>{a.text}</b><small>{ago(a.at)}</small></span><Chip t="slate">{a.tag}</Chip></div>)}
        </div>
      </div>
      <div className="pv-card">
        <div className="pv-h">Timeline<span className="sp" /><button className="hw-btn ghost sm" onClick={() => go("timeline")}>Open full timeline<Icon name="arrowR" size={13} /></button></div>
        {prjSpan.length ? <MiniGantt rows={prjSpan.map((x) => ({ id: x.p.id, label: x.p.name, color: x.p.color, st: x.st, en: x.en, sub: `${x.done}/${x.n}` }))} launch={ymd(program.target_launch_date)} onOpen={(id) => navigateToProject && navigateToProject(id)} /> : <Empty>Link a project to this program (in Projects, set its PLM product) to see its workstreams here.</Empty>}
      </div>
    </div>
    <div className="pv-rail">
      <div className="pv-card pv-ai">
        <div className="ttl"><Icon name="spark" size={20} style={{ color: "var(--accent)" }} />AI product team<span style={{ flex: 1 }} /><span className="pv-live"><i />Active</span></div>
        <div style={{ fontSize: 12.5, color: "var(--ink3)", margin: "6px 0 2px" }}>Four specialists that read this program's data. Click one to put it to work.</div>
        {team.map((t) => { const a = AGENTS[t.k]; return <button key={t.k} className="pv-act" onClick={() => ask(t.prompt, a.mode)}><span className="ic"><Icon name={a.icon} size={15} /></span><span style={{ flex: 1, minWidth: 0 }}><b>{a.name}</b><small>{a.desc}</small></span><span style={{ fontSize: 11, color: "var(--ink3)", textAlign: "right", maxWidth: 90 }}>{t.status}</span></button>; })}
      </div>
      <div className="pv-card">
        <div className="pv-h">Next up<span className="sp" />{d.projects.length > 0 && <span style={{ fontSize: 12, color: "var(--ink3)", fontWeight: 500 }}>{d.tasks.filter((x) => !["done", "cancelled"].includes(x.status)).length} open</span>}</div>
        {!open.length ? <Empty>{d.projects.length ? "No open tasks in the linked projects." : "No linked projects yet."}</Empty> : open.map((x) => { const late = x.due_date && ymd(x.due_date) < t; return <div key={x.id} className="pv-row click" onClick={() => navigateToProject && navigateToProject(x.project_id)}><span style={{ width: 16, height: 16, borderRadius: 8, border: "1.5px solid var(--line2)", flex: "none" }} /><span className="t"><b style={{ fontWeight: 550 }}>{x.title}</b><small>{d.projects.find((p) => p.id === x.project_id)?.name}</small></span><span style={{ fontSize: 12, color: late ? "var(--coral)" : "var(--ink3)", fontWeight: late ? 600 : 400, whiteSpace: "nowrap" }}>{x.due_date ? fmtD(x.due_date, { month: "short", day: "numeric" }) : ""}</span></div>; })}
      </div>
      <AgentRail title="Need help with this program?" icon="spark" live={false} placeholder="Ask your AI team anything about this program…" mode="chemist" ask={ask} />
    </div>
  </div>;
}

function MiniGantt({ rows, launch, onOpen, height }) {
  const t = today(); const all = rows.flatMap((r) => [r.st, r.en]).concat(launch ? [launch] : [], [t]).filter(Boolean).sort();
  const start = new Date(all[0] + "T00:00:00"); start.setDate(1); const endD = new Date(all[all.length - 1] + "T00:00:00"); endD.setMonth(endD.getMonth() + 1, 1);
  const span = (endD - start) / 86400000; const x = (d) => ((new Date(d + "T00:00:00") - start) / 86400000 / span) * 100;
  const months = []; for (const m = new Date(start); m < endD; m.setMonth(m.getMonth() + 1)) months.push(new Date(m));
  return <div className="pv-gantt"><div style={{ minWidth: 640 }}>
    <div className="pv-gh" style={{ gridTemplateColumns: "220px minmax(420px,1fr)" }}><span>Workstream</span><div className="pv-track" style={{ minHeight: 30 }}>{months.map((m, i) => <span key={i} className="pv-mon" style={{ left: x(m.toISOString().slice(0, 10)) + "%" }}>{m.toLocaleDateString("en-US", { month: "short" })}</span>)}</div></div>
    {rows.map((r) => <div key={r.id} className={"pv-gr" + (r.child ? " sub" : "")} style={{ gridTemplateColumns: "220px minmax(420px,1fr)", cursor: onOpen ? "pointer" : "default", minHeight: height || 38 }} onClick={() => onOpen && onOpen(r.id)}>
      <span className="nm"><span style={{ width: 9, height: 9, borderRadius: 3, background: r.color || "var(--accent)", flex: "none" }} /><span className="hw-trunc">{r.label}</span>{r.sub && <span style={{ fontSize: 11.5, color: "var(--ink3)", fontWeight: 400 }}>{r.sub}</span>}</span>
      <div className="pv-track">{months.map((m, i) => <span key={i} className="pv-mon" style={{ left: x(m.toISOString().slice(0, 10)) + "%", padding: 0 }} />)}<span className="pv-gbar" style={{ left: x(r.st) + "%", width: Math.max(1, x(r.en) - x(r.st)) + "%", background: `color-mix(in srgb, ${r.color || "var(--accent)"} 55%, var(--surface))` }} title={`${fmtD(r.st)} – ${fmtD(r.en)}`} /></div>
    </div>)}
    {launch && <div className="pv-gr" style={{ gridTemplateColumns: "220px minmax(420px,1fr)", minHeight: height || 38 }}><span className="nm" style={{ color: "var(--green)" }}><Icon name="flag" size={14} />Target launch <span style={{ fontSize: 11.5, color: "var(--ink3)", fontWeight: 400 }}>{fmtD(launch, { month: "short", day: "numeric" })}</span></span><div className="pv-track">{months.map((m, i) => <span key={i} className="pv-mon" style={{ left: x(m.toISOString().slice(0, 10)) + "%", padding: 0 }} />)}<span title={"Target launch " + fmtD(launch)} style={{ position: "absolute", left: `calc(${x(launch)}% - 7px)`, top: "50%", marginTop: -7, width: 14, height: 14, transform: "rotate(45deg)", background: "var(--green)", borderRadius: 3 }} /></div></div>}
    <div style={{ position: "relative", marginLeft: 220, height: 0 }}>
      <span className="pv-today" style={{ left: x(t) + "%", top: -((rows.length + (launch ? 1 : 0)) * (height || 38)) - 4, height: (rows.length + (launch ? 1 : 0)) * (height || 38) + 4 }}><span>Today</span></span>
    </div>
  </div></div>;
}

// ───────────────────────── Formula ─────────────────────────
function FormulaTab({ program, d, ask, setView }) {
  const [fid, setFid] = useState(() => currentFormula(d.forms)?.id || null); const [cmp, setCmp] = useState(null);
  const [unitG, setUnitG] = useState(""); const f = d.forms.find((x) => x.id === fid) || null;
  const st = useMemo(() => formulaStats(d, f, Number(unitG) || null), [d, f, unitG]);
  if (!d.forms.length) return <div className="pv-grid"><div className="pv-main"><div className="pv-card"><div className="pv-h">Formula</div><Empty>No formulations yet. Create one in the formula editor, or ask the Formula agent to draft a starting formula.</Empty><div style={{ display: "flex", gap: 8, marginTop: 12 }}><button className="hw-btn primary" onClick={() => setView("editor")}>Open formula editor</button><button className="hw-btn" onClick={() => ask(`Draft a starting formula for ${program.name} (${program.category || "cleaning product"}) that supports these claims: ${(program.desired_claims || []).join(", ") || "none set"}. Explain each ingredient's job and typical level.`, "chemist")}>Ask the agent for a draft</button></div></div></div></div>;
  const a = st?.analysis; const tests = d.tests.filter((x) => x.formulation_id === fid); const tsum = C.summarizeTests(tests);
  const diff = cmp ? C.compareFormulas(d.items.filter((i) => i.formulation_id === cmp), d.items.filter((i) => i.formulation_id === fid)) : null;
  const parts = a ? Object.entries(a.class_totals).map(([k, v]) => ({ key: k, label: v.label, value: v.pct || 0, color: CLASS_COLORS[k] || "#94a3b8" })).filter((p) => p.value > 0).sort((x, y) => y.value - x.value) : [];
  const lineFor = (name) => a?.cost.lines.find((l) => l.ingredient === name);
  const flags = a?.screen?.hits || [];
  const fname = `${f.name} ${f.version || ""}`.trim();
  return <div className="pv-grid">
    <div className="pv-main">
      <div className="pv-card">
        <div className="pv-h" style={{ flexWrap: "wrap" }}>
          <span>{fname}</span>{f.status && <Chip t={/production|approved/.test(f.status) ? "green" : /testing|pilot/.test(f.status) ? "blue" : "slate"}>{cap(f.status)}</Chip>}
          <span className="sp" />
          <select className="hw-input" style={{ width: 170, height: 32, fontSize: 13 }} value={fid || ""} onChange={(e) => { setFid(e.target.value); setCmp(null); }}>{d.forms.map((x) => <option key={x.id} value={x.id}>{`${x.name} ${x.version || ""}`}</option>)}</select>
          <select className="hw-input" style={{ width: 150, height: 32, fontSize: 13 }} value={cmp || ""} onChange={(e) => setCmp(e.target.value || null)}><option value="">Compare with…</option>{d.forms.filter((x) => x.id !== fid).map((x) => <option key={x.id} value={x.id}>{`${x.name} ${x.version || ""}`}</option>)}</select>
          <button className="hw-btn primary" onClick={() => setView("editor")}><Icon name="note" size={14} />Edit formula</button>
        </div>
        {f.lab_notes && <div className="pv-sub" style={{ margin: "-4px 0 12px" }}>{String(f.lab_notes).slice(0, 220)}</div>}
        {diff && <div style={{ background: "var(--sunken)", borderRadius: 12, padding: "10px 14px", marginBottom: 14, fontSize: 13 }}>
          <b>Changes from {d.forms.find((x) => x.id === cmp)?.version || "the other version"}:</b>{" "}
          {!diff.added.length && !diff.removed.length && !diff.changed.length ? "none" : [...diff.changed.map((c) => `${c.ingredient} ${c.from}% → ${c.to}%`), ...diff.added.map((c) => `+ ${c.ingredient} ${c.pct}%`), ...diff.removed.map((c) => `− ${c.ingredient}`)].join(" · ")}
        </div>}
        {!st?.items.length ? <Empty>This version has no ingredients yet.</Empty> : <div style={{ overflowX: "auto" }}><table className="pv-tbl">
          <thead><tr><th>Ingredient</th><th>Function</th><th className="r">% w/w</th><th className="r">Cost / kg</th><th className="r">Cost / unit</th><th style={{ width: 130 }}>% of cost</th></tr></thead>
          <tbody>{st.items.map((it, i) => { const row = a.items.find((x) => x.ingredient === it.ingredient_name); const l = lineFor(it.ingredient_name); const flag = flags.find((h) => h.ingredient === it.ingredient_name); return <tr key={i}>
            <td><div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>{it.ingredient_name}{flag && <span title={flag.flags.map((x) => x.concern).join("\n\n")} style={{ color: "var(--amber)", display: "inline-flex" }}><Icon name="alert" size={13} /></span>}</div><div style={{ fontSize: 11.5, color: "var(--ink3)" }}>{[it.inci_name && it.inci_name !== it.ingredient_name ? it.inci_name : null, it.function_in_formula].filter(Boolean).join(" · ")}</div></td>
            <td><Fn cls={C.classify(it)} /></td>
            <td className="r">{row?.pct != null ? row.pct.toFixed(3) : "—"}</td>
            <td className="r">{l ? money(l.price_per_kg) : <span style={{ color: "var(--ink4)" }}>no price</span>}</td>
            <td className="r">{l && st.unitWeightG ? money(l.cost_per_kg_finished * st.unitWeightG / 1000, 4) : "—"}</td>
            <td>{l ? <div style={{ display: "flex", alignItems: "center", gap: 8 }}><div className="pv-bar" style={{ flex: 1 }}><i style={{ width: Math.min(100, l.share_of_cost_pct) + "%" }} /></div><span style={{ width: 38, textAlign: "right", fontSize: 12 }}>{Math.round(l.share_of_cost_pct)}%</span></div> : null}</td>
          </tr>; })}</tbody>
          <tfoot><tr><td>Total</td><td /><td className="r">{a.total_pct.toFixed(3)}</td><td className="r">{a.cost.raw_material_cost_per_kg != null ? money(a.cost.raw_material_cost_per_kg) : "—"}</td><td className="r">{a.cost.raw_material_cost_per_unit != null ? money(a.cost.raw_material_cost_per_unit, 4) : "—"}</td><td>{a.cost.complete ? "100%" : <span style={{ fontWeight: 500, fontSize: 12, color: "var(--amber)" }}>{a.cost.missing_prices.length} unpriced</span>}</td></tr></tfoot>
        </table></div>}
      </div>
      {a && <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16 }}>
        <div className="pv-card">
          <div className="pv-h">Composition</div>
          <div style={{ display: "flex", gap: 18, alignItems: "center", flexWrap: "wrap" }}>
            <Donut parts={parts} center={[a.total_pct.toFixed(1) + "%", "total"]} />
            <div style={{ flex: 1, minWidth: 150 }}>{parts.map((p) => <div key={p.key} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, padding: "3px 0" }}><span style={{ width: 9, height: 9, borderRadius: 3, background: p.color }} /><span style={{ flex: 1 }}>{p.label.replace(/ \(.*\)$/, "")}</span><b className="hw-num" style={{ fontWeight: 600 }}>{p.value.toFixed(2)}%</b></div>)}</div>
          </div>
        </div>
        <div className="pv-card">
          <div className="pv-h">Key metrics</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div><div className="pv-kpi" style={{ border: "none", padding: 0 }}><div className="s">Raw materials / unit</div><div className="v" style={{ fontSize: 22 }}>{a.cost.raw_material_cost_per_unit != null ? money(a.cost.raw_material_cost_per_unit, 3) : "—"}</div></div></div>
            <div><div className="pv-kpi" style={{ border: "none", padding: 0 }}><div className="s">Raw materials / kg</div><div className="v" style={{ fontSize: 22 }}>{a.cost.raw_material_cost_per_kg != null ? money(a.cost.raw_material_cost_per_kg) : "—"}</div></div></div>
            <div><div className="pv-kpi" style={{ border: "none", padding: 0 }}><div className="s">Total surfactant</div><div className="v" style={{ fontSize: 22 }}>{pct(a.total_surfactant_pct)}</div></div></div>
            <div><div className="pv-kpi" style={{ border: "none", padding: 0 }}><div className="s">Unit weight</div><div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}><input className="hw-input" style={{ width: 80, height: 30, textAlign: "right" }} placeholder={st.unitWeightG ? String(C.round(st.unitWeightG, 2)) : "g"} value={unitG} onChange={(e) => setUnitG(e.target.value.replace(/[^0-9.]/g, ""))} /><span style={{ fontSize: 12, color: "var(--ink3)" }}>g {st.unitSource && !unitG ? `(${st.unitSource})` : ""}</span></div></div></div>
          </div>
          {!a.cost.complete && <div style={{ fontSize: 12, color: "var(--amber)", marginTop: 12 }}>Partial cost: {a.cost.missing_prices.join(", ")} {a.cost.missing_prices.length === 1 ? "has" : "have"} no price in the ingredient library.</div>}
        </div>
        <div className="pv-card">
          <div className="pv-h">Formula health</div>
          {a.checks.length === 0 ? <Check ok>Totals, quantities and functions all check out</Check> : a.checks.slice(0, 4).map((c, i) => <Check key={i} warn>{c}</Check>)}
          {flags.length === 0 ? <Check ok>No ingredients on the regulatory and claims watchlist</Check> : <Check warn>{flags.length} ingredient{flags.length > 1 ? "s" : ""} flagged: {flags.map((h) => h.ingredient).join(", ")}</Check>}
          {tsum.total === 0 ? <Check warn>No test results recorded for this version</Check> : tsum.fail ? <Check>{tsum.fail} of {tsum.total} tests failing: {tsum.failing.map((x) => x.test).join(", ")}</Check> : <Check ok>{tsum.pass} of {tsum.total} tests passing{tsum.pending ? `, ${tsum.pending} pending` : ""}</Check>}
        </div>
      </div>}
      <div className="pv-card">
        <div className="pv-h">Version history<span className="sp" /><button className="hw-btn ghost sm" onClick={() => setView("experiments")}>Experiments<Icon name="arrowR" size={13} /></button></div>
        {d.forms.map((x) => <div key={x.id} className="pv-row click" onClick={() => { setFid(x.id); setCmp(null); }}><span style={{ width: 16, height: 16, borderRadius: 8, border: "2px solid " + (x.id === fid ? "var(--accent)" : "var(--line2)"), background: x.id === fid ? "radial-gradient(var(--accent) 40%, transparent 45%)" : "none", flex: "none" }} /><span className="t"><b>{x.name} {x.version}</b><small>{x.lab_notes ? String(x.lab_notes).slice(0, 90) : cap(x.status)}</small></span>{x.id === currentFormula(d.forms)?.id && <Chip t="green">Current</Chip>}<span style={{ fontSize: 12, color: "var(--ink3)", width: 100, textAlign: "right" }}>{fmtD(x.updated_at || x.created_at, { month: "short", day: "numeric", year: "numeric" })}</span><span style={{ fontSize: 12, color: "var(--ink3)", width: 110, textAlign: "right" }} className="hw-trunc">{d.people[x.formulator_id || x.created_by]?.display_name || ""}</span></div>)}
      </div>
    </div>
    <div className="pv-rail">
      <AgentRail title="AI formula agent" desc="A PhD-level detergent chemist. It reads this formula, its tests and prices, and runs the numbers." icon="flask" mode="chemist" ask={ask} placeholder={`Ask about ${fname}…`}
        actions={[
          { icon: "tag", label: "Find cost savings", hint: "Cheaper equivalents without losing performance", prompt: `For ${fname} in ${program.name}: analyse the formula and find the biggest raw-material cost savings that keep stain removal and the claims intact. Quantify each with analyze_formulation.` },
          { icon: "zap", label: "Boost performance", hint: "Stain removal, dissolution, stability", prompt: `For ${fname} in ${program.name}: what changes would most improve stain removal (protein, grease, tannin) and cold-water performance? Give the mechanism, expected effect, risks and the test to prove it.` },
          { icon: "stamp", label: "Check claims and compliance", hint: "Screen ingredients against claims and markets", prompt: `Screen ${fname} against ${program.name}'s claims (${(program.desired_claims || []).join(", ") || "none set"}) and target markets (${(program.target_markets_v2 || []).join(", ") || "not set"}). Flag conflicts and what to change.` },
          { icon: "list", label: "Design an experiment", hint: "DOE with a run table you can save", prompt: `Design a DOE to optimise ${fname} for its main weaknesses. Use design_experiment and explain the factors, levels and responses. Offer to create it as an experiment.` },
        ]} />
      {flags.length > 0 && <div className="pv-card"><div className="pv-h">Watchlist</div>{flags.slice(0, 5).map((h, i) => <div key={i} style={{ fontSize: 12.5, lineHeight: 1.5, padding: "6px 0", borderTop: i ? "1px solid var(--line)" : "none" }}><b>{h.ingredient}</b>: {h.flags[0].concern}</div>)}<div style={{ fontSize: 11.5, color: "var(--ink3)", marginTop: 6 }}>A screening aid. Rules change, so confirm before relying on it.</div></div>}
    </div>
  </div>;
}

// ───────────────────────── Sourcing ─────────────────────────
const SRC_TYPES = [["ingredient", "Ingredients", "flask"], ["contract_manufacturer", "Manufacturers", "factory"], ["packaging", "Packaging", "box"], ["other", "Other", "layers"]];
function SourcingTab({ program, d, ask, setView }) {
  const [type, setType] = useState("ingredient"); const [q, setQ] = useState("");
  const rows = d.sourcing.filter((s) => (s.sourcing_type || "other") === type && (!q || `${s.name} ${s.supplier_name}`.toLowerCase().includes(q.toLowerCase())));
  const all = d.sourcing.filter((s) => (s.sourcing_type || "other") === type);
  const count = (k) => d.sourcing.filter((s) => (s.sourcing_type || "other") === k).length;
  const good = all.filter((s) => GOOD_SOURCING.has(s.status)).length; const review = all.filter((s) => !GOOD_SOURCING.has(s.status) && s.status !== "disqualified").length;
  const srcOf = (s) => /Source: (https?:\/\/\S+)/.exec(s.notes || "")?.[1] || /from (https?:\/\/\S+)/.exec(s.notes || "")?.[1];
  const quotes = d.subs.length; const prov = (id) => d.providers.find((p) => p.id === id);
  const best = d.subs.filter((s) => s.base_unit_price != null).sort((a, b) => a.base_unit_price - b.base_unit_price)[0];
  return <div className="pv-grid">
    <div className="pv-main">
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "stretch" }}>
        <div className="hw-seg" style={{ height: "auto" }}>{SRC_TYPES.filter(([k]) => k !== "other" || count("other")).map(([k, l, ic]) => <button key={k} className={type === k ? "on" : ""} onClick={() => setType(k)} style={{ height: 40, padding: "0 14px", display: "inline-flex", gap: 7, alignItems: "center" }}><Icon name={ic} size={15} />{l} <span className="hw-num" style={{ color: "var(--ink3)" }}>{count(k)}</span></button>)}</div>
        <div className="pv-stats" style={{ flex: 1, minWidth: 320 }}>
          <div><Icon name="box" size={20} style={{ color: "var(--ink3)" }} /><span><b>{all.length}</b><small>Tracked</small></span></div>
          <div><Icon name="check" size={20} style={{ color: "var(--green)" }} /><span><b>{good}</b><small>Approved</small></span></div>
          <div><Icon name="clock" size={20} style={{ color: "var(--blue,#3b82f6)" }} /><span><b>{review}</b><small>Under review</small></span></div>
          <div><Icon name="note" size={20} style={{ color: "var(--violet)" }} /><span><b>{quotes}</b><small>Quotes</small></span></div>
        </div>
      </div>
      <div className="pv-card" style={{ padding: 0 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", padding: "12px 16px", borderBottom: "1px solid var(--line)", flexWrap: "wrap" }}>
          <div style={{ position: "relative", flex: 1, minWidth: 200, maxWidth: 360 }}><Icon name="search" size={15} style={{ position: "absolute", left: 10, top: 9, color: "var(--ink3)" }} /><input className="hw-input" style={{ paddingLeft: 32, height: 34 }} placeholder="Search suppliers or items…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <span style={{ flex: 1 }} />
          <button className="hw-btn" onClick={() => setView("rfps")}><Icon name="plus" size={14} />Add supplier or RFP</button>
          <button className="hw-btn primary" onClick={() => ask(type === "contract_manufacturer" ? `Find and qualify contract manufacturers for ${program.name} (${program.category || "home care"}) that can serve ${(program.target_markets_v2 || []).join(", ") || "our markets"}. Rank them and say what's verified.` : type === "packaging" ? `Find packaging suppliers for ${program.name} that fit its claims and sustainability goals.` : `Review ${program.name}'s formula ingredients and find better or alternative suppliers for the ones with no approved source, cost pressure or claim risk.`, "sourcing")}><Icon name="spark" size={14} />Run AI sourcing</button>
        </div>
        {!rows.length ? <div style={{ padding: 18 }}><Empty>{all.length ? "Nothing matches that search." : `No ${SRC_TYPES.find((x) => x[0] === type)[1].toLowerCase()} tracked yet. Run AI sourcing, or add one under RFPs & suppliers.`}</Empty></div> : <div style={{ overflowX: "auto" }}><table className="pv-tbl">
          <thead><tr><th style={{ paddingLeft: 16 }}>{type === "contract_manufacturer" ? "Manufacturer" : "Supplier"}</th><th>{type === "contract_manufacturer" ? "Scope" : "Item"}</th><th>Status</th><th className="r">Lead time</th><th className="r">MOQ</th><th className="r">Best price</th><th>Evidence</th></tr></thead>
          <tbody>{rows.map((s) => { const src = srcOf(s); const p = lowestTier(s.volume_tiers); return <tr key={s.id} className="click" onClick={() => setView("rfps")}>
            <td style={{ paddingLeft: 16 }}><div style={{ display: "flex", alignItems: "center", gap: 10 }}><Avatar person={{ display_name: s.supplier_name || s.name }} size={28} /><span><b style={{ fontWeight: 650 }}>{s.supplier_name || "No supplier yet"}</b>{s.supplier_url && <div style={{ fontSize: 11.5 }}><a href={s.supplier_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: "var(--ink3)" }}>{String(s.supplier_url).replace(/^https?:\/\/(www\.)?/, "").split("/")[0]}</a></div>}</span></div></td>
            <td><div style={{ fontWeight: 550 }}>{s.name}</div>{s.description && <div style={{ fontSize: 11.5, color: "var(--ink3)" }} className="hw-trunc">{s.description}</div>}</td>
            <td><Chip t={GOOD_SOURCING.has(s.status) ? "green" : s.status === "disqualified" ? "coral" : "blue"} dot>{cap(s.status || "considering")}</Chip></td>
            <td className="r">{s.lead_time_days ? `${s.lead_time_days} days` : "—"}</td>
            <td className="r">{s.moq ? `${Number(s.moq).toLocaleString()} ${s.moq_unit || ""}` : "—"}</td>
            <td className="r" style={{ fontWeight: 650 }}>{p != null ? money(p) : "—"}</td>
            <td>{src ? <a href={src} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ color: "var(--accent-ink)", fontSize: 12.5 }}>Verified source</a> : <span style={{ color: "var(--ink4)", fontSize: 12.5 }}>—</span>}</td>
          </tr>; })}</tbody></table></div>}
      </div>
      <div className="pv-card">
        <div className="pv-h">RFPs and quotes<span className="sp" /><button className="hw-btn ghost sm" onClick={() => setView("rfps")}>Open RFPs<Icon name="arrowR" size={13} /></button></div>
        {!d.rfps.length ? <Empty>No RFPs yet. An RFP collects comparable quotes; the Pricing agent then compares them on landed cost.</Empty> : d.rfps.map((r) => { const ps = d.providers.filter((p) => p.rfp_id === r.id); const ss = d.subs.filter((s) => s.rfp_id === r.id); return <div key={r.id} className="pv-row click" onClick={() => setView("rfps")}><span className="pv-ico"><Icon name="note" size={16} /></span><span className="t"><b>{r.name}</b><small>{ps.length} provider{ps.length === 1 ? "" : "s"} · {ss.length} quote{ss.length === 1 ? "" : "s"}{r.due_date ? ` · due ${fmtD(r.due_date, { month: "short", day: "numeric" })}` : ""}</small></span><Chip t={r.status === "awarded" ? "green" : r.status === "sent" || r.status === "open" ? "blue" : "slate"}>{cap(r.status || "draft")}</Chip>{ss.length > 0 && <button className="hw-btn sm" onClick={(e) => { e.stopPropagation(); ask(`Compare the quotes on the RFP "${r.name}" (id ${r.id}) on landed cost per unit at ${r.target_volume || "our expected"} units. State the freight, duty and currency assumptions and flag anything not comparable.`, "rfp"); }}>Compare quotes</button>}</div>; })}
      </div>
    </div>
    <div className="pv-rail">
      <AgentRail title="AI sourcing agent" desc="Finds, qualifies and compares suppliers. Every company it names comes from a page it found, with the link." icon="factory" mode="sourcing" ask={ask} placeholder={`e.g. Find 2–3 alternative suppliers for MGDA in the US with MOQ under 1,000 kg`}
        chips={[{ label: "Alternative suppliers", prompt: `Find alternative suppliers for the ingredients in ${program.name}'s current formula that have only one source.` }, { label: "Cost savings", prompt: `Where can ${program.name} save on raw materials or manufacturing without changing performance? Use our formula and sourcing data.` }, { label: "Regional options", prompt: `Find suppliers and manufacturers close to ${(program.target_markets_v2 || ["US"]).join(", ")} for ${program.name} to cut freight and duty.` }, { label: "Lower MOQ", prompt: `Which suppliers could serve ${program.name} at lower minimum order quantities for launch volumes?` }]} />
      {best && <div className="pv-card"><div className="pv-h">Lowest quote so far</div><div style={{ display: "flex", alignItems: "center", gap: 12 }}><Avatar person={{ display_name: prov(best.rfp_provider_id)?.company_name || "?" }} size={36} /><div style={{ flex: 1 }}><b>{prov(best.rfp_provider_id)?.company_name || "Provider"}</b><div style={{ fontSize: 12, color: "var(--ink3)" }}>{best.manufacturing_location || prov(best.rfp_provider_id)?.country || ""}</div></div><div className="plm-big" style={{ fontSize: 22 }}>{money(best.base_unit_price)}<span style={{ fontSize: 12, color: "var(--ink3)", fontWeight: 500 }}> {best.base_currency || ""}/unit</span></div></div><div style={{ fontSize: 12, color: "var(--ink3)", marginTop: 8 }}>Base price before freight and duty. Ask the Pricing agent for landed cost.</div></div>}
    </div>
  </div>;
}

// ───────────────────────── Claims & Legal ─────────────────────────
const CLAIM_GOOD = new Set(["substantiated", "approved", "active"]);
const CLAIM_REVIEW = new Set(["researching", "partially_supported", "in_legal_review"]);
function ClaimsTab({ program, d, ask, setView }) {
  const [review, setReview] = useState(() => loadLS(`plm.review.claims_review.${program.id}`)); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null);
  const rec = d.claims.map((c) => ({ ...c, _src: "claim" }));
  const have = new Set(rec.map((c) => C.norm(c.claim_text)));
  const proposed = (program.desired_claims || []).filter((t) => !have.has(C.norm(t))).map((t, i) => ({ id: "desired-" + i, claim_text: t, status: "proposed", _src: "brief" }));
  const list = [...rec, ...proposed]; const [sel, setSel] = useState(list[0]?.id || null); const [filter, setFilter] = useState("all");
  const docsFor = (c) => d.docs.filter((x) => (x.claim_refs || []).some((r) => r === c.id || C.norm(r) === C.norm(c.claim_text)));
  const aiFor = (c) => (review?.claim_reviews || []).find((r) => C.norm(r.claim) === C.norm(c.claim_text) || C.norm(c.claim_text).includes(C.norm(r.claim)) || C.norm(r.claim).includes(C.norm(c.claim_text)));
  const needs = (c) => c.status === "unsupported" || c.status === "rejected" || c.legal_status === "rejected" || (c._src === "brief") || (aiFor(c) && (aiFor(c).regulatory_risk === "high" || aiFor(c).evidence_strength === "none"));
  const n = { all: list.length, approved: list.filter((c) => CLAIM_GOOD.has(c.status)).length, review: list.filter((c) => CLAIM_REVIEW.has(c.status)).length, action: list.filter(needs).length };
  const shown = list.filter((c) => filter === "all" || (filter === "approved" ? CLAIM_GOOD.has(c.status) : filter === "review" ? CLAIM_REVIEW.has(c.status) : needs(c)));
  const s = list.find((c) => c.id === sel) || shown[0]; const ai = s && aiFor(s); const sdocs = s ? docsFor(s) : [];
  const run = async () => { setBusy(true); setErr(null); const r = await askAdvisor({ action: "review", review_type: "claims_review", program_id: program.id }); setBusy(false); if (!r.success) { setErr(r.error || "The review didn't finish."); return; } const v = { ...r.result, generated_at: r.generated_at, sources: r.sources || [] }; try { localStorage.setItem(`plm.review.claims_review.${program.id}`, JSON.stringify(v)); } catch {} setReview(v); };
  const risk = (c) => aiFor(c)?.regulatory_risk; const markets = program.target_markets_v2 || [];
  const prog = list.length ? Math.round((n.approved / list.length) * 100) : 0;
  return <div className="pv-grid">
    <div className="pv-main">
      <div className="pv-stats">
        <div><Icon name="stamp" size={22} style={{ color: "var(--accent)" }} /><span><b>{n.all}</b><small>Product claims</small></span></div>
        <div><Icon name="check" size={22} style={{ color: "var(--green)" }} /><span><b>{n.approved}</b><small>Substantiated</small></span></div>
        <div><Icon name="clock" size={22} style={{ color: "var(--blue,#3b82f6)" }} /><span><b>{n.review}</b><small>In review</small></span></div>
        <div><Icon name="alert" size={22} style={{ color: "var(--amber)" }} /><span><b>{n.action}</b><small>Needs action</small></span></div>
        <div style={{ flex: 1.6, display: "block" }}><div style={{ display: "flex", fontSize: 12.5, fontWeight: 600, marginBottom: 8 }}><span style={{ flex: 1 }}>Approval progress</span><span className="hw-num">{prog}%</span></div><Progress value={prog} /></div>
      </div>
      <div className="pv-card" style={{ padding: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: "1px solid var(--line)", flexWrap: "wrap" }}>
          <b style={{ fontSize: 15 }}>Product claims</b>
          <Seg value={filter} options={[["all", `All (${n.all})`], ["approved", `Substantiated (${n.approved})`], ["review", `In review (${n.review})`], ["action", `Needs action (${n.action})`]]} onChange={setFilter} />
          <span style={{ flex: 1 }} /><button className="hw-btn primary sm" onClick={() => setView("evidence")}><Icon name="plus" size={13} />Add claim</button>
        </div>
        {!shown.length ? <div style={{ padding: 18 }}><Empty>{list.length ? "No claims in this filter." : "No claims yet. Add the claims you want to make and the evidence behind them."}</Empty></div> : <div style={{ overflowX: "auto" }}><table className="pv-tbl">
          <thead><tr><th style={{ paddingLeft: 18 }}>Claim wording</th><th>Evidence</th><th>Regions</th><th>Risk</th><th>Status</th></tr></thead>
          <tbody>{shown.map((c) => { const dc = docsFor(c).length; const rk = risk(c); return <tr key={c.id} className={"click" + (s?.id === c.id ? " sel" : "")} onClick={() => setSel(c.id)}>
            <td style={{ paddingLeft: 18, fontWeight: 600 }}>{c.claim_text}{c._src === "brief" && <div style={{ fontSize: 11.5, color: "var(--ink3)", fontWeight: 400 }}>From the program brief, not yet tracked</div>}</td>
            <td>{dc ? <span style={{ color: "var(--accent-ink)", display: "inline-flex", gap: 5, alignItems: "center" }}><Icon name="note" size={14} />{dc} document{dc > 1 ? "s" : ""}</span> : <span style={{ color: "var(--ink4)" }}>None</span>}</td>
            <td><div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>{markets.slice(0, 3).map((m) => <span key={m} className="pv-fn" style={{ background: "var(--sunken)", color: "var(--ink2)" }}>{m}</span>)}{markets.length > 3 && <span className="pv-fn" style={{ background: "var(--sunken)", color: "var(--ink2)" }}>+{markets.length - 3}</span>}</div></td>
            <td>{rk ? <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontWeight: 550 }}><span style={{ width: 8, height: 8, borderRadius: 4, background: rk === "low" ? "var(--green)" : rk === "medium" ? "var(--amber)" : "var(--coral)" }} />{cap(rk)}</span> : <span style={{ color: "var(--ink4)" }}>—</span>}</td>
            <td><Chip t={CLAIM_GOOD.has(c.status) ? "green" : CLAIM_REVIEW.has(c.status) ? "blue" : needs(c) ? "amber" : "slate"} dot>{CLAIM_GOOD.has(c.status) ? cap(c.status) : c._src === "brief" ? "Proposed" : cap(c.status || "proposed")}</Chip></td>
          </tr>; })}</tbody></table></div>}
      </div>
    </div>
    <div className="pv-rail">
      <div className="pv-card pv-ai">
        <div className="ttl"><Icon name="stamp" size={20} style={{ color: "var(--accent)" }} />AI claims assistant</div>
        <div style={{ fontSize: 12.5, color: "var(--ink3)", margin: "6px 0 12px", lineHeight: 1.5 }}>Reviews each claim against the formula, the evidence on file and the rules in your markets.</div>
        {!s ? <Empty>Select a claim.</Empty> : <>
          <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: "10px 12px" }}><div style={{ fontSize: 11.5, color: "var(--ink3)" }}>Currently reviewing</div><div style={{ fontWeight: 700, marginTop: 2 }}>{s.claim_text}</div></div>
          {ai ? <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}><Icon name={ai.regulatory_risk === "low" && ai.evidence_strength !== "none" ? "check" : "alert"} size={20} style={{ color: ai.regulatory_risk === "low" && ai.evidence_strength !== "none" ? "var(--green)" : "var(--amber)", flex: "none", marginTop: 2 }} /><div><b>Assessment: {cap(ai.regulatory_risk)} regulatory risk</b><div style={{ fontSize: 12.5, color: "var(--ink2)", marginTop: 2 }}>Feasibility {ai.feasibility}, evidence {ai.evidence_strength}. Reviewed {ago(review.generated_at)}.</div></div></div>
            {(ai.gaps || []).length > 0 && <div style={{ marginTop: 10 }}><div className="hw-eyebrow" style={{ marginBottom: 4 }}>Gaps</div>{ai.gaps.map((g, i) => <Check key={i} warn>{g}</Check>)}</div>}
            {(ai.recommendations || []).length > 0 && <div style={{ marginTop: 6 }}><div className="hw-eyebrow" style={{ marginBottom: 4 }}>What to do</div>{ai.recommendations.map((g, i) => <Check key={i} ok>{g}</Check>)}</div>}
            {(ai.conflicting_ingredients || []).length > 0 && <div style={{ fontSize: 12.5, color: "var(--coral)", marginTop: 6 }}>Conflicts with: {ai.conflicting_ingredients.join(", ")}</div>}
          </div> : <div style={{ fontSize: 12.5, color: "var(--ink3)", margin: "12px 0 0" }}>{review ? "The last review didn't cover this claim. Run it again." : "No review yet. Run one to assess every claim."}</div>}
          {sdocs.length > 0 && <div style={{ marginTop: 12 }}><div className="hw-eyebrow" style={{ marginBottom: 4 }}>Evidence on file</div>{sdocs.map((x) => <div key={x.id} style={{ fontSize: 12.5, padding: "3px 0" }}>{x.url ? <a href={x.url} target="_blank" rel="noreferrer" style={{ color: "var(--accent-ink)" }}>{x.title}</a> : x.title} <span style={{ color: "var(--ink3)" }}>{x.doc_type || ""}</span></div>)}</div>}
          {err && <div style={{ color: "var(--coral)", fontSize: 12.5, marginTop: 10 }}>{err}</div>}
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button className="hw-btn primary" style={{ flex: 1, justifyContent: "center" }} disabled={busy} onClick={run}><Icon name="spark" size={14} />{busy ? "Reviewing… (about a minute)" : review ? "Review all again" : "Review all claims"}</button>
            <button className="hw-btn" onClick={() => ask(`Suggest compliant wording for the claim "${s.claim_text}" for ${program.name} in ${markets.join(", ") || "our markets"}. Give 2-3 options, what each needs as substantiation, and which rules or guidance they follow (cite them).`, "chemist")}>Suggest wording</button>
          </div>
        </>}
      </div>
    </div>
  </div>;
}

// ───────────────────────── Pricing & Margin ─────────────────────────
const SCEN_DEF = [{ key: "base", label: "Base", desc: "Balanced margin and volume", mult: 1 }, { key: "growth", label: "Growth", desc: "Lower price to drive trial and share", mult: 0.92 }, { key: "premium", label: "Premium", desc: "Premium positioning", mult: 1.15 }];
function PricingTab({ program, d, ask, onUpdate, formula }) {
  const { orgId } = useAuth();
  const saved = program.cost_scenarios || {};
  const rmFormula = formula?.analysis?.cost?.raw_material_cost_per_unit ?? null;
  const tp = Number(program.target_unit_price) || 0;
  const [A, setA] = useState(() => ({ volume: 100000, raw: rmFormula != null ? null : "", packaging: "", manufacturing: "", freight: "", overhead: "", marketing_pct: "", ...saved.assumptions }));
  const [prices, setPrices] = useState(() => Object.fromEntries(SCEN_DEF.map((s) => [s.key, (saved.scenarios || []).find((x) => x.key === s.key)?.price ?? (tp ? Math.round(tp * s.mult * 100) / 100 : "")])));
  const [sel, setSel] = useState(saved.selected || "base"); const [dirty, setDirty] = useState(false); const [savedAt, setSavedAt] = useState(null);
  const num = (v) => (v === "" || v == null ? 0 : Number(v) || 0);
  const raw = A.raw === null || A.raw === undefined ? (rmFormula ?? 0) : num(A.raw);
  const cogs = raw + num(A.packaging) + num(A.manufacturing) + num(A.freight);
  const econ = (price) => { const p = num(price); const gm = p ? ((p - cogs) / p) * 100 : null; const contrib = p - cogs - num(A.overhead) - p * num(A.marketing_pct) / 100; return { price: p, cogs, gm, contrib, revenue: p * num(A.volume) }; };
  const target = Number(program.target_gross_margin_pct) || null; const breakEven = target && cogs ? cogs / (1 - target / 100) : null;
  const set = (k, v) => { setA((p) => ({ ...p, [k]: v })); setDirty(true); };
  const save = async () => {
    const scenarios = SCEN_DEF.map((s) => ({ key: s.key, label: s.label, price: num(prices[s.key]), cogs: C.round(cogs, 4), gm: C.round(econ(prices[s.key]).gm, 2), contrib: C.round(econ(prices[s.key]).contrib, 4) }));
    const v = { ...saved, assumptions: A, scenarios, selected: sel, updated_at: new Date().toISOString() };
    let b = supabase.from("plm_programs").update({ cost_scenarios: v }).eq("id", program.id); if (orgId) b = b.eq("org_id", orgId);
    const { error } = await b; if (!error) { onUpdate({ ...program, cost_scenarios: v }); setDirty(false); setSavedAt(new Date()); }
  };
  const e = econ(prices[sel]); const parts = [["Raw materials" + (A.raw === null || A.raw === undefined ? (rmFormula != null ? " (from formula)" : "") : ""), raw, "flask"], ["Packaging", num(A.packaging), "box"], ["Manufacturing (toll)", num(A.manufacturing), "factory"], ["Freight & duties", num(A.freight), "globe"]];
  // sensitivity: GM% vs price
  const p0 = num(prices[sel]) || tp || 10; const xs = Array.from({ length: 9 }, (_, i) => C.round(p0 * (0.7 + i * 0.075), 2));
  const ys = xs.map((x) => (x ? ((x - cogs) / x) * 100 : 0)); const ymin = Math.min(...ys, target || 100) - 5, ymax = Math.max(...ys, target || 0) + 5;
  const W = 420, H = 200, px = (i) => 40 + (i / (xs.length - 1)) * (W - 60), py = (y) => 12 + (1 - (y - ymin) / (ymax - ymin)) * (H - 40);
  const inp = (k, label, hint, unit = "$") => <label key={k} className="pv-in"><span>{label}{hint && <small>{hint}</small>}</span><span style={{ position: "relative" }}><input inputMode="decimal" value={A[k] === null || A[k] === undefined ? "" : A[k]} placeholder={k === "raw" && rmFormula != null ? money(rmFormula, 3).slice(1) : "0"} onChange={(ev) => set(k, ev.target.value.replace(/[^0-9.]/g, ""))} />{unit && <span style={{ position: "absolute", left: 9, top: 7, color: "var(--ink3)", fontSize: 13 }}>{unit}</span>}</span></label>;
  return <div className="pv-grid">
    <div className="pv-main">
      <div className="pv-card" style={{ padding: "16px 18px" }}>
        <div className="pv-h" style={{ marginBottom: 4 }}>Pricing and margin<span className="sp" />{savedAt && !dirty && <span style={{ fontSize: 12, color: "var(--green)", fontWeight: 500 }}>Saved</span>}<button className="hw-btn primary sm" disabled={!dirty} onClick={save}>Save model</button></div>
        <div className="pv-sub" style={{ margin: "0 0 14px" }}>Per-unit model for {(program.target_markets_v2 || []).join(", ") || "your markets"}. The base price starts from the program's target price; COGS starts from the current formula's raw-material cost.</div>
        <div className="pv-scen">{SCEN_DEF.map((s) => { const x = econ(prices[s.key]); const ok = target && x.gm != null ? x.gm >= target : null; return <div key={s.key} className={"pv-sc" + (sel === s.key ? " on" : "")} onClick={() => { setSel(s.key); setDirty(true); }} role="button" tabIndex={0}>
          <div className="nm"><span style={{ width: 16, height: 16, borderRadius: 8, border: "2px solid " + (sel === s.key ? "var(--accent)" : "var(--line2)"), background: sel === s.key ? "radial-gradient(var(--accent) 40%, transparent 45%)" : "none" }} />{s.label}</div>
          <div className="ds">{s.desc}</div>
          <div className="nums">
            <div><small>Price</small><span style={{ display: "flex", alignItems: "baseline", fontWeight: 700, fontSize: 16 }}>$<input onClick={(ev) => ev.stopPropagation()} value={prices[s.key]} onChange={(ev) => { setPrices((p) => ({ ...p, [s.key]: ev.target.value.replace(/[^0-9.]/g, "") })); setDirty(true); }} style={{ width: "100%", border: "none", borderBottom: "1px dashed var(--line2)", background: "transparent", font: "700 16px var(--sans)", color: "var(--ink)", padding: 0, minWidth: 0 }} /></span></div>
            <div><small>COGS</small><b>{money(cogs)}</b></div>
            <div><small>Gross margin</small><b style={{ color: ok == null ? "var(--ink)" : ok ? "var(--green)" : "var(--coral)" }}>{pct(x.gm)}</b></div>
            <div><small>Contribution</small><b>{money(x.contrib)}</b></div>
          </div>
        </div>; })}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16 }}>
        <div className="pv-card">
          <div className="pv-h">Key assumptions <span style={{ fontSize: 12, color: "var(--ink3)", fontWeight: 500 }}>per unit</span></div>
          {inp("volume", "Volume (annual units)", null, "")}
          {inp("raw", "Raw materials", rmFormula != null ? `Formula: ${money(rmFormula, 3)}${formula.analysis.cost.complete ? "" : " (partial)"}` : "No formula cost yet")}
          {inp("packaging", "Packaging", null)}
          {inp("manufacturing", "Manufacturing (toll)", null)}
          {inp("freight", "Freight & duties", null)}
          {inp("overhead", "Overhead", null)}
          {inp("marketing_pct", "Marketing (% of price)", null, "%")}
        </div>
        <div className="pv-card">
          <div className="pv-h">Unit economics · {SCEN_DEF.find((s) => s.key === sel).label}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 8, marginBottom: 14 }}>
            {[["Price", money(e.price)], ["COGS", money(e.cogs)], ["Gross margin", pct(e.gm)], ["Contribution", money(e.contrib)]].map(([l, v], i) => <div key={l}><div style={{ fontSize: 19, fontWeight: 750, color: i === 2 ? "var(--accent-ink)" : "var(--ink)" }} className="hw-num">{v}</div><div style={{ fontSize: 11.5, color: "var(--ink3)" }}>{l}</div></div>)}
          </div>
          <div className="hw-eyebrow" style={{ marginBottom: 6 }}>COGS breakdown</div>
          {parts.map(([l, v, ic]) => <div key={l} style={{ display: "grid", gridTemplateColumns: "18px 1fr 64px 90px 36px", gap: 8, alignItems: "center", fontSize: 12.5, padding: "5px 0" }}><Icon name={ic} size={14} style={{ color: "var(--ink3)" }} /><span>{l}</span><b className="hw-num" style={{ textAlign: "right", fontWeight: 600 }}>{money(v)}</b><div className="pv-bar"><i style={{ width: (cogs ? (v / cogs) * 100 : 0) + "%" }} /></div><span className="hw-num" style={{ textAlign: "right", color: "var(--ink3)" }}>{cogs ? Math.round((v / cogs) * 100) : 0}%</span></div>)}
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, background: "var(--sunken)", borderRadius: 8, padding: "8px 10px", marginTop: 8 }}><span>Total COGS</span><span className="hw-num">{money(cogs)}</span></div>
          <div style={{ fontSize: 12.5, color: "var(--ink2)", marginTop: 10 }}>Year-one revenue at {num(A.volume).toLocaleString()} units: <b>{money(e.revenue, 0)}</b></div>
        </div>
        <div className="pv-card">
          <div className="pv-h">Sensitivity <span style={{ fontSize: 12, color: "var(--ink3)", fontWeight: 500 }}>gross margin vs price</span></div>
          {!cogs ? <Empty>Enter costs to see how margin moves with price.</Empty> : <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto" }} role="img" aria-label="Gross margin by price">
            {[0, 1, 2, 3].map((i) => { const y = ymin + ((ymax - ymin) * i) / 3; return <g key={i}><line x1={40} x2={W - 20} y1={py(y)} y2={py(y)} stroke="var(--line)" /><text x={34} y={py(y) + 4} textAnchor="end" style={{ font: "11px var(--sans)", fill: "var(--ink3)" }}>{Math.round(y)}%</text></g>; })}
            {target && <g><line x1={40} x2={W - 20} y1={py(target)} y2={py(target)} stroke="var(--green)" strokeDasharray="4 4" /><text x={W - 22} y={py(target) - 5} textAnchor="end" style={{ font: "600 11px var(--sans)", fill: "var(--green)" }}>Target {target}%</text></g>}
            <path d={`M${px(0)},${py(ys[0])} ` + ys.map((y, i) => `L${px(i)},${py(y)}`).join(" ") + ` L${px(ys.length - 1)},${H - 28} L${px(0)},${H - 28}Z`} fill="var(--accent)" opacity=".1" />
            <polyline points={ys.map((y, i) => `${px(i)},${py(y)}`).join(" ")} fill="none" stroke="var(--accent)" strokeWidth="2" />
            {ys.map((y, i) => <circle key={i} cx={px(i)} cy={py(y)} r={i === 4 ? 5 : 3} fill={i === 4 ? "var(--accent)" : "var(--surface)"} stroke="var(--accent)" strokeWidth="2"><title>{money(xs[i])}: {pct(y)}</title></circle>)}
            {xs.map((x, i) => i % 2 === 0 && <text key={i} x={px(i)} y={H - 10} textAnchor="middle" style={{ font: (i === 4 ? "700 " : "") + "11px var(--sans)", fill: i === 4 ? "var(--accent-ink)" : "var(--ink3)" }}>{money(x)}</text>)}
          </svg>}
        </div>
      </div>
    </div>
    <div className="pv-rail">
      <AgentRail title="AI pricing agent" desc="Works from this model, your quotes and the formula cost. Market prices it cites come from sources it found." icon="chart" mode="rfp" ask={ask} placeholder="Ask about price, COGS or margin…"
        actions={[
          { icon: "chart", label: "What moves margin most?", hint: "Rank the levers on this model", prompt: `For ${program.name}: with price ${money(e.price)}, raw materials ${money(raw)}, packaging ${money(num(A.packaging))}, manufacturing ${money(num(A.manufacturing))}, freight ${money(num(A.freight))}, the gross margin is ${pct(e.gm)} vs a ${target || "?"}% target. Rank the levers that move margin most and what each would take.` },
          { icon: "globe", label: "Compare to the category", hint: "Shelf prices for similar products", prompt: `Find current shelf prices (per unit and per load/use) for products comparable to ${program.name} in ${(program.target_markets_v2 || ["US"]).join(", ")}. Cite each source, then position our ${money(e.price)} price.` },
          { icon: "note", label: "Use real quotes", hint: "Landed cost from the RFP quotes", prompt: `Use compare_quotes on ${program.name}'s RFPs to work out landed manufacturing cost per unit at ${num(A.volume).toLocaleString()} units, and tell me what to put in the model.` },
        ]}>
        <div style={{ marginTop: 12, background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: "10px 12px" }}>
          {target && e.gm != null ? <Check ok={e.gm >= target} warn={e.gm < target}>{e.gm >= target ? `Meets the ${target}% GM target` : `${C.round(target - e.gm, 1)} points under the ${target}% GM target`}</Check> : <Check warn>Set a GM target on the program to compare</Check>}
          {breakEven && <Check ok={e.price >= breakEven} warn={e.price < breakEven}>Lowest price for {target}% GM: <b>{money(breakEven)}</b></Check>}
          {rmFormula != null && !formula.analysis.cost.complete && <Check warn>Raw-material cost is partial: some ingredients have no price</Check>}
        </div>
      </AgentRail>
    </div>
  </div>;
}

// ───────────────────────── Timeline ─────────────────────────
function TimelineTab({ program, d, ask, navigateToProject, setView }) {
  const [open, setOpen] = useState({}); const t = today();
  const rows = [];
  for (const p of d.projects) {
    const ts = d.tasks.filter((x) => x.project_id === p.id); const st = ts.map((x) => ymd(x.start_date || x.due_date)).filter(Boolean).sort()[0]; const en = ts.map((x) => ymd(x.due_date)).filter(Boolean).sort().pop();
    if (!st || !en) continue;
    const late = ts.filter((x) => x.due_date && ymd(x.due_date) < t && !["done", "cancelled"].includes(x.status)).length;
    rows.push({ id: p.id, label: p.name, color: p.color, st, en, sub: late ? `${late} late` : `${ts.filter((x) => ["done", "cancelled"].includes(x.status)).length}/${ts.length}`, kids: ts.filter((x) => x.due_date).sort((a, b) => String(a.due_date).localeCompare(String(b.due_date))) });
  }
  const flat = []; for (const r of rows) { flat.push(r); if (open[r.id]) for (const k of r.kids.slice(0, 12)) flat.push({ id: r.id + ":" + k.id, label: k.title, color: r.color, st: ymd(k.start_date || k.due_date), en: ymd(k.due_date), sub: d.people[k.assignee_id]?.display_name?.split(" ")[0] || "", child: true }); }
  const gates = d.gates.filter((g) => g.decision_date || g.review_date);
  return <div className="pv-grid" style={{ gridTemplateColumns: "minmax(0,1fr)" }}>
    <div className="pv-main">
      <div className="pv-card">
        <div className="pv-h">Project timeline<span className="sp" /><button className="hw-btn ghost sm" onClick={() => setView("projects")}>Linked projects</button><button className="hw-btn sm" onClick={() => ask(`Look at ${program.name}'s timeline: linked project tasks, stage and target launch ${fmtD(program.target_launch_date)}. What's on the critical path, what's late, and what should we do this week?`, "rfp")}><Icon name="spark" size={14} />Ask the project agent</button></div>
        {!rows.length ? <Empty>No dated work yet. Link projects to this program (in Projects, set the PLM product) and give tasks dates to see the Gantt.</Empty> : <>
          <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>{rows.map((r) => <button key={r.id} className={"pv-chip"} style={open[r.id] ? { borderColor: "var(--accent)", color: "var(--accent-ink)" } : undefined} onClick={() => setOpen((p) => ({ ...p, [r.id]: !p[r.id] }))}>{open[r.id] ? "Hide" : "Show"} {r.label} tasks</button>)}</div>
          <MiniGantt rows={flat} launch={ymd(program.target_launch_date)} onOpen={(id) => { const pid = String(id).split(":")[0]; navigateToProject && navigateToProject(pid); }} height={36} />
          <div style={{ display: "flex", gap: 16, fontSize: 12, color: "var(--ink3)", marginTop: 12 }}><span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><span style={{ width: 10, height: 10, transform: "rotate(45deg)", background: "var(--green)", borderRadius: 2 }} />Target launch {fmtD(program.target_launch_date)}</span><span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><span style={{ width: 14, borderTop: "2px dashed var(--accent)" }} />Today</span></div>
        </>}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))", gap: 16 }}>
        <div className="pv-card"><div className="pv-h">Milestones</div>
          <div className="pv-row"><span className="pv-ico"><Icon name="flag" size={16} /></span><span className="t"><b>Target launch</b><small>{program.current_stage === "launched" ? "Launched" : program.target_launch_date ? (days(t, ymd(program.target_launch_date)) < 0 ? `${-days(t, ymd(program.target_launch_date))} days late` : `In ${days(t, ymd(program.target_launch_date))} days`) : "Not set"}</small></span><span style={{ fontWeight: 600 }}>{fmtD(program.target_launch_date)}</span></div>
          {gates.slice(0, 5).map((g) => <div key={g.id} className="pv-row"><span className="pv-ico"><Icon name="check" size={16} /></span><span className="t"><b>{cap(g.from_stage)} → {cap(g.to_stage)}</b><small>{cap(g.decision || "scheduled")}</small></span><span style={{ fontWeight: 600 }}>{fmtD(g.decision_date || g.review_date)}</span></div>)}
        </div>
        <div className="pv-card"><div className="pv-h">Late work</div>
          {(() => { const late = d.tasks.filter((x) => x.due_date && ymd(x.due_date) < t && !["done", "cancelled"].includes(x.status)).sort((a, b) => String(a.due_date).localeCompare(String(b.due_date))); return !late.length ? <Check ok>Nothing late in the linked projects</Check> : late.slice(0, 6).map((x) => <div key={x.id} className="pv-row click" onClick={() => navigateToProject && navigateToProject(x.project_id)}><Avatar person={d.people[x.assignee_id]} id={x.assignee_id} size={24} /><span className="t"><b style={{ fontWeight: 550 }}>{x.title}</b><small>{d.projects.find((p) => p.id === x.project_id)?.name}</small></span><span style={{ color: "var(--coral)", fontWeight: 600, fontSize: 12.5 }}>{-days(t, ymd(x.due_date))}d late</span></div>); })()}
        </div>
      </div>
    </div>
  </div>;
}

// ───────────────────────── Stage gates ─────────────────────────
function GatesTab({ program, d, onUpdate, reload }) {
  const { orgId, user } = useAuth();
  const cur = STAGE_IX[program.current_stage] ?? 0; const next = V3_STAGES[cur + 1];
  const [rd, setRd] = useState(() => loadLS(`plm.review.stage_readiness.${program.id}`)); const [busy, setBusy] = useState(false); const [err, setErr] = useState(null); const [confirm, setConfirm] = useState(null); const [notes, setNotes] = useState("");
  const stale = rd && rd.stage_at_review && rd.stage_at_review !== program.current_stage;
  const run = async () => { setBusy(true); setErr(null); const r = await askAdvisor({ action: "review", review_type: "stage_readiness", program_id: program.id }); setBusy(false); if (!r.success) { setErr(r.error || "The check didn't finish."); return; } const v = { ...r.result, generated_at: r.generated_at, stage_at_review: program.current_stage }; try { localStorage.setItem(`plm.review.stage_readiness.${program.id}`, JSON.stringify(v)); } catch {} setRd(v); };
  const decide = async (decision) => {
    const row = { org_id: orgId, program_id: program.id, from_stage: program.current_stage, to_stage: next?.key, review_date: today(), decision, decision_date: new Date().toISOString(), meeting_notes: notes || null, overall_score: rd && !stale ? Math.round(rd.readiness_score) : null, criteria: rd && !stale ? (rd.checklist || []) : null, created_by: user?.id || null };
    const { error } = await supabase.from("plm_gate_reviews").insert(row);
    if (error) { setErr(error.message); return; }
    if (decision === "approved" && next) { let b = supabase.from("plm_programs").update({ current_stage: next.key, stage_entered_at: new Date().toISOString() }).eq("id", program.id); if (orgId) b = b.eq("org_id", orgId); await b; onUpdate({ ...program, current_stage: next.key, stage_entered_at: new Date().toISOString() }); }
    setConfirm(null); setNotes(""); reload();
  };
  const crit = rd && !stale ? rd.checklist || [] : [];
  return <div className="pv-grid">
    <div className="pv-main">
      <div style={{ display: "grid", gridTemplateColumns: "260px minmax(0,1fr)", gap: 16, alignItems: "start" }}>
        <div className="pv-card" style={{ padding: 10 }}>
          {V3_STAGES.map((s, i) => { const g = d.gates.find((x) => x.to_stage === s.key && x.decision === "approved"); const st = i < cur ? "done" : i === cur ? "on" : ""; return <div key={s.key} className={"pv-gate" + (st === "on" ? " on" : "")} style={{ cursor: "default" }}>
            <span style={{ width: 22, height: 22, borderRadius: 11, display: "flex", alignItems: "center", justifyContent: "center", border: "2px solid " + (st ? "var(--accent)" : "var(--line2)"), background: st === "done" ? "var(--accent)" : "var(--surface)", color: "#fff", flex: "none" }}>{st === "done" ? <Icon name="check" size={12} sw={2.8} /> : st === "on" ? <span style={{ width: 8, height: 8, borderRadius: 4, background: "var(--accent)" }} /> : null}</span>
            <span style={{ flex: 1, fontWeight: st === "on" ? 700 : 550, color: st ? "var(--ink)" : "var(--ink3)" }}>{s.label}</span>
            <span style={{ fontSize: 11.5, color: st === "done" ? "var(--green)" : st === "on" ? "var(--accent-ink)" : "var(--ink4)", fontWeight: 600 }}>{st === "done" ? (g ? fmtD(g.decision_date || g.review_date, { month: "short", day: "numeric" }) : "Complete") : st === "on" ? "Current" : ""}</span>
          </div>; })}
        </div>
        <div className="pv-card">
          <div className="pv-h" style={{ flexWrap: "wrap" }}>{next ? `${V3_STAGES[cur].label} gate review` : "Launched"}<span className="sp" />{rd && !stale && <Chip t={rd.readiness_score >= 75 ? "green" : rd.readiness_score >= 45 ? "amber" : "coral"}>{Math.round(rd.readiness_score)}/100 ready</Chip>}</div>
          {next && <div className="pv-sub" style={{ margin: "-6px 0 14px" }}>Confirm the formula, sourcing, claims and costs are ready to move to {next.label}.</div>}
          {busy && <div style={{ fontSize: 12.5, color: "var(--ink3)", marginBottom: 10 }}>Reading formulas, tests, claims, issues and sourcing. About a minute.</div>}
          {err && <div style={{ color: "var(--coral)", fontSize: 12.5, marginBottom: 10 }}>{err}</div>}
          {!rd || stale ? <Empty>{stale ? "The stage changed since the last check. " : ""}Run the readiness check: the agent reads this program's data and lists what's done, in progress and missing for this gate, with the evidence.</Empty> : <>
            {rd.summary && <div style={{ lineHeight: 1.55, color: "var(--ink2)", marginBottom: 12 }}>{rd.summary}</div>}
            <div className="hw-eyebrow" style={{ marginBottom: 6 }}>Gate criteria</div>
            {crit.map((c, i) => <div key={i} className="pv-check" style={{ borderTop: i ? "1px solid var(--line)" : "none", padding: "9px 0" }}><span style={{ width: 18, height: 18, borderRadius: 5, border: "1.5px solid " + (c.status === "complete" ? "var(--green)" : "var(--line2)"), background: c.status === "complete" ? "var(--green)" : c.status === "in_progress" ? "var(--blue-soft,#dbeafe)" : "var(--surface)", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", flex: "none" }}>{c.status === "complete" && <Icon name="check" size={12} sw={2.8} />}</span><span style={{ flex: 1 }}><b style={{ fontWeight: 600 }}>{c.item}</b>{c.required === false && <span style={{ color: "var(--ink3)" }}> (optional)</span>}{c.evidence && <div style={{ fontSize: 12, color: "var(--ink3)", marginTop: 2 }}>{c.evidence}</div>}</span><Chip t={c.status === "complete" ? "green" : c.status === "in_progress" ? "blue" : "slate"}>{cap(c.status)}</Chip></div>)}
            {(rd.blockers || []).length > 0 && <><div className="hw-eyebrow" style={{ margin: "14px 0 6px" }}>Blockers</div>{rd.blockers.map((b, i) => <Check key={i} warn={b.severity !== "critical"}><b>{b.item}</b>{b.next_action && <span style={{ color: "var(--ink3)" }}> — next: {b.next_action}</span>}</Check>)}</>}
            <div style={{ fontSize: 11.5, color: "var(--ink3)", marginTop: 10 }}>Checked {ago(rd.generated_at)}</div>
          </>}
          {next && <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
            <button className="hw-btn" disabled={busy} onClick={run}><Icon name="spark" size={14} />{rd && !stale ? "Check again" : "Run readiness check"}</button>
            <span style={{ flex: 1 }} />
            <button className="hw-btn" onClick={() => setConfirm("deferred")}>Request changes</button>
            <button className="hw-btn primary" onClick={() => setConfirm("approved")}><Icon name="check" size={14} />Approve gate</button>
          </div>}
        </div>
      </div>
      <div className="pv-card"><div className="pv-h">Review history</div>
        {!d.gates.length ? <Empty>No gate decisions recorded yet.</Empty> : d.gates.map((g) => <div key={g.id} className="pv-row"><span className="pv-ico"><Icon name={g.decision === "approved" ? "check" : "alert"} size={16} /></span><span className="t"><b>{cap(g.from_stage)} → {cap(g.to_stage)}</b><small>{g.meeting_notes || (g.overall_score != null ? `Readiness ${g.overall_score}/100` : "")}</small></span><Chip t={g.decision === "approved" ? "green" : g.decision === "rejected" ? "coral" : "amber"}>{cap(g.decision || "pending")}</Chip><span style={{ fontSize: 12, color: "var(--ink3)", width: 96, textAlign: "right" }}>{fmtD(g.decision_date || g.review_date, { month: "short", day: "numeric", year: "numeric" })}</span></div>)}
      </div>
    </div>
    <div className="pv-rail">
      <div className="pv-card pv-ai"><div className="ttl"><Icon name="check" size={20} style={{ color: "var(--accent)" }} />AI gate coach</div>
        <div style={{ fontSize: 12.5, color: "var(--ink3)", margin: "6px 0 10px", lineHeight: 1.5 }}>A gate decision is yours. The coach makes sure it's made on evidence: what's done, what's missing, and what's risky.</div>
        {rd && !stale && (rd.blockers || []).length > 0 ? rd.blockers.slice(0, 3).map((b, i) => <div key={i} style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 12, padding: "10px 12px", marginTop: 8 }}><div style={{ display: "flex", gap: 8, alignItems: "center" }}><Chip t={b.severity === "critical" ? "coral" : b.severity === "major" ? "amber" : "slate"}>{b.severity}</Chip><b style={{ fontSize: 13 }}>{b.item}</b></div>{b.next_action && <div style={{ fontSize: 12.5, color: "var(--ink2)", marginTop: 4 }}>{b.next_action}</div>}</div>) : <Empty>{rd && !stale ? "No blockers found." : "Run the readiness check to see blockers here."}</Empty>}
      </div>
    </div>
    {confirm && <Modal title={confirm === "approved" ? `Approve the move to ${next?.label}?` : "Request changes"} onClose={() => setConfirm(null)} width={480} footer={<><button className="hw-btn ghost" onClick={() => setConfirm(null)}>Cancel</button><button className="hw-btn primary" onClick={() => decide(confirm)}>{confirm === "approved" ? "Approve and move stage" : "Record decision"}</button></>}>
      <div style={{ lineHeight: 1.55, marginBottom: 12 }}>{confirm === "approved" ? `This records an approved gate review and moves ${program.name} from ${V3_STAGES[cur].label} to ${next?.label}.` : `This records that the ${V3_STAGES[cur].label} gate needs changes. The stage stays where it is.`}{rd && !stale ? ` The readiness check (${Math.round(rd.readiness_score)}/100) and its checklist are saved with the decision.` : ""}</div>
      <textarea className="hw-input" rows={3} placeholder="Notes for the record (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
    </Modal>}
  </div>;
}

// ───────────────────────── the workspace ─────────────────────────
const SUBVIEWS = {
  formula: [["workspace", "Workspace"], ["editor", "Formula editor"], ["experiments", "Experiments"], ["trials", "Trials"]],
  sourcing: [["workspace", "Suppliers"], ["rfps", "RFPs & suppliers"], ["gm", "Volume tiers"]],
  claims: [["workspace", "Claims"], ["evidence", "Claims & evidence editor"], ["regulatory", "Regulatory"], ["tests", "Test results"]],
  timeline: [["workspace", "Gantt"], ["projects", "Linked projects"]],
  gates: [["workspace", "Gate review"], ["history", "All gate records"]],
  launch: [["skus", "SKUs"], ["issues", "Issues"]],
};
export default function ProgramWorkspace({ program, onBack, onUpdate, onDelete, navigateTo, navigateToProject, linkCount, legacy, initialTab }) {
  const { orgId } = useAuth();
  const [tab, setTab] = useState(initialTab || "overview"); const [view, setView] = useState({}); const [drawer, setDrawer] = useState(null); const [menu, setMenu] = useState(false);
  const [d, reload] = useProgramData(program, orgId);
  const formula = useMemo(() => (d ? formulaStats(d, currentFormula(d.forms)) : null), [d]);
  const ask = useCallback((prompt, mode) => setDrawer({ prompt, mode, at: Date.now() }), []);
  const go = (t) => { setTab(t); };
  const sv = view[tab] || (SUBVIEWS[tab] ? SUBVIEWS[tab][0][0] : "workspace");
  const setSv = (v) => setView((p) => ({ ...p, [tab]: v }));
  const cur = STAGE_IX[program.current_stage] ?? 0; const stage = V3_STAGES[cur];
  const art = d?.skus.map((s) => s.artwork_urls).flat().map((a) => (typeof a === "string" ? a : a?.url)).find((u) => /^https?:\/\/.+\.(png|jpe?g|webp|gif)(\?|$)/i.test(u || ""));
  const L = legacy || {};
  const counts = d ? { formula: d.forms.length, sourcing: d.sourcing.length, claims: d.claims.length || (program.desired_claims || []).length, launch: d.issues.filter((i) => i.status !== "resolved" && i.status !== "closed").length } : {};
  const body = () => {
    if (!d) return <div style={{ padding: 40, color: "var(--ink3)" }}>Loading program…</div>;
    if (tab === "overview") return <OverviewTab program={program} d={d} ask={ask} go={go} navigateToProject={navigateToProject} formula={formula} />;
    if (tab === "agent") return <div style={{ padding: "18px 28px" }}>{L.AIAgentTab && <L.AIAgentTab program={program} />}</div>;
    const legacyView = (el) => <div style={{ padding: "18px 28px 32px", background: "var(--surface)", minHeight: "100%" }}><Suspense fallback={<div style={{ color: "var(--ink3)" }}>Loading…</div>}>{el}</Suspense></div>;
    if (tab === "formula") return sv === "editor" ? legacyView(L.FormulationsTab && <L.FormulationsTab programId={program.id} />) : sv === "experiments" ? legacyView(L.ExperimentsTab && <L.ExperimentsTab programId={program.id} />) : sv === "trials" ? legacyView(L.TrialsTab && <L.TrialsTab programId={program.id} />) : <FormulaTab program={program} d={d} ask={ask} setView={setSv} />;
    if (tab === "sourcing") return sv === "rfps" ? legacyView(L.PLMSourcingTab && <L.PLMSourcingTab program={program} />) : sv === "gm" ? legacyView(L.GMScenarioTab && <L.GMScenarioTab program={program} />) : <SourcingTab program={program} d={d} ask={ask} setView={setSv} />;
    if (tab === "claims") return sv === "evidence" ? legacyView(L.ClaimsSubstantiationTab && <L.ClaimsSubstantiationTab program={program} onUpdate={onUpdate} />) : sv === "regulatory" ? legacyView(L.RegClaimsTab && <L.RegClaimsTab programId={program.id} />) : sv === "tests" ? legacyView(L.TestResultsTab && <L.TestResultsTab programId={program.id} />) : <ClaimsTab program={program} d={d} ask={ask} setView={setSv} />;
    if (tab === "pricing") return <PricingTab program={program} d={d} ask={ask} onUpdate={onUpdate} formula={formula} />;
    if (tab === "timeline") return sv === "projects" ? legacyView(L.LinkedWorkTab && <L.LinkedWorkTab programId={program.id} navigateTo={navigateTo} navigateToProject={navigateToProject} />) : <TimelineTab program={program} d={d} ask={ask} navigateToProject={navigateToProject} setView={setSv} />;
    if (tab === "gates") return sv === "history" ? legacyView(L.GateReviewsTab && <L.GateReviewsTab programId={program.id} />) : <GatesTab program={program} d={d} onUpdate={onUpdate} reload={reload} />;
    if (tab === "launch") return sv === "issues" ? legacyView(L.IssuesTab && <L.IssuesTab programId={program.id} />) : legacyView(L.SKUsTab && <L.SKUsTab programId={program.id} />);
    return null;
  };
  // leaving an editor reloads the workspace data
  useEffect(() => { if (sv === "workspace") reload(); }, [tab, sv]); // eslint-disable-line react-hooks/exhaustive-deps
  const facts = [["cal", "Target launch", program.target_launch_date ? fmtD(program.target_launch_date) : "Not set"], ["layers", "Category", program.category ? cap(program.category) : "—"], ["globe", "Markets", (program.target_markets_v2 || []).join(", ") || "—"], ["target", "Target GM%", program.target_gross_margin_pct ? "≥ " + program.target_gross_margin_pct + "%" : "—"], ["tag", "Target price", program.target_unit_price ? money(program.target_unit_price) : "—"]];
  return <div className="pv">
    <style dangerouslySetInnerHTML={{ __html: PLM_V3_CSS }} />
    <div className="pv-head">
      <div className="pv-crumb"><button onClick={onBack}>Programs</button><Icon name="chevR" size={12} /><span style={{ color: "var(--ink)", fontWeight: 600 }} className="hw-trunc">{program.name}</span></div>
      <div className="pv-hero">
        <div className="pv-img">{art ? <img src={art} alt="" /> : <Icon name="flask" size={34} />}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="pv-eyebrow">{program.brand || "Earth Breeze"}{program.code ? ` · ${program.code}` : ""}</div>
          <h1 className="pv-title hw-trunc">{program.name}</h1>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}><Chip t="blue" dot>{stage?.label || cap(program.current_stage)}</Chip>{program.priority && <Chip t={PRIORITY_TONE[program.priority] || "slate"}>{cap(program.priority)} priority</Chip>}{program.program_type && <span style={{ fontSize: 12, color: "var(--ink3)" }}>{cap(program.program_type)}</span>}</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", alignSelf: "flex-start", position: "relative" }}>
          <button className="hw-btn primary" onClick={() => setDrawer({ at: Date.now() })}><Icon name="spark" size={15} />Ask AI</button>
          <button className="hw-icb" onClick={() => setMenu((v) => !v)} title="More"><Icon name="more" /></button>
          {menu && <div className="hw-pop" style={{ position: "absolute", right: 0, top: 40, width: 220, zIndex: 20 }} onMouseLeave={() => setMenu(false)}>
            <button className="hw-mi" onClick={() => { setMenu(false); setTab("gates"); }}><Icon name="check" size={15} />Stage gate review</button>
            <button className="hw-mi" onClick={() => { setMenu(false); setTab("agent"); }}><Icon name="spark" size={15} />AI conversations</button>
            {onDelete && <button className="hw-mi" style={{ color: "var(--coral)" }} onClick={() => { setMenu(false); if (window.confirm(`Delete "${program.name}"? This soft-deletes the program and its data.`)) onDelete(); }}><Icon name="trash" size={15} />Delete program</button>}
          </div>}
        </div>
      </div>
      <div className="pv-facts">{facts.map(([ic, l, v]) => <div key={l} className="pv-fact"><span className="ic"><Icon name={ic} size={16} /></span><span><small>{l}</small><b>{v}</b></span></div>)}</div>
      <div className="pv-tabs">{TABS.map((t) => <button key={t.key} className={"pv-tab" + (tab === t.key ? " on" : "")} onClick={() => setTab(t.key)}><Icon name={t.icon} size={15} />{t.label}{counts[t.key] > 0 && <span className="n">{counts[t.key]}</span>}{t.key === "timeline" && linkCount ? <span className="n">{linkCount}</span> : null}</button>)}</div>
    </div>
    {SUBVIEWS[tab] && <div className="plm-bar" style={{ padding: "8px 28px" }}><div className="hw-seg">{SUBVIEWS[tab].map(([k, l]) => <button key={k} className={sv === k ? "on" : ""} onClick={() => setSv(k)}>{l}</button>)}</div></div>}
    <div className="pv-body">{body()}</div>
    <AgentDrawer program={program} open={drawer} onClose={() => setDrawer(null)} />
  </div>;
}
