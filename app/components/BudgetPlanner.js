"use client";
import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from "react";
import { T } from "../tokens";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ── Formatting helpers ────────────────────────────────────────────────────────
const fmt = (n) => {
  if (n == null || isNaN(n)) return "$0";
  const num = Number(n);
  const abs = Math.abs(num);
  if (abs >= 1_000_000) return `$${(num/1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(num/1_000).toFixed(1)}K`;
  return `$${num.toFixed(0)}`;
};
const fmtFull = (n) => n == null ? "$0.00" : `$${Number(n).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`;

// Period helper: convert (month index 0-11, year) → "YYYY-MM" used by fin_vendor_spend
const periodKey = (mIdx, year) => `${year}-${String(mIdx+1).padStart(2,"0")}`;

// ─────────────────────────────────────────────────────────────────────────────
// EditableCell — inline numeric editor with click-to-edit
// ─────────────────────────────────────────────────────────────────────────────
function EditableCell({ value, onSave, isOver, isReadOnly, small }) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value);
  const ref = useRef(null);
  useEffect(() => { setLocal(value); }, [value]);
  useEffect(() => { if (editing && ref.current) { ref.current.focus(); ref.current.select(); } }, [editing]);

  if (editing) {
    return (
      <input
        ref={ref}
        type="number"
        value={local}
        onChange={e => setLocal(e.target.value)}
        onBlur={() => { onSave(Number(local) || 0); setEditing(false); }}
        onKeyDown={e => {
          if (e.key === "Enter") { onSave(Number(local) || 0); setEditing(false); }
          if (e.key === "Escape") { setLocal(value); setEditing(false); }
        }}
        style={{
          width: "100%", background: T.bg, border: `1px solid ${T.accent}`,
          color: T.text, padding: "3px 6px", borderRadius: 4,
          fontSize: small ? 11 : 12, outline: "none", textAlign: "right",
          fontFamily: "ui-monospace, SFMono-Regular, monospace",
        }}
      />
    );
  }
  return (
    <div
      onClick={(e) => { if (!isReadOnly) { e.stopPropagation(); setEditing(true); } }}
      style={{
        cursor: isReadOnly ? "default" : "pointer",
        textAlign: "right", padding: "3px 6px", borderRadius: 4,
        fontSize: small ? 11 : 12,
        fontFamily: "ui-monospace, SFMono-Regular, monospace",
        color: isOver ? T.red : (Number(value) > 0 ? T.text : T.text3),
        background: isOver ? T.redDim : "transparent",
        borderBottom: !isReadOnly ? `1px dashed ${T.border2}` : "none",
        transition: "background .12s",
      }}
    >
      {fmt(value)}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Vendor row inside an expanded GL — shows actuals (read-only) and planned (editable)
// ─────────────────────────────────────────────────────────────────────────────
function VendorRow({ vendor, glId, plan, year, vendorPlans, actuals, savePlan, deletePlan, visibleMonths }) {
  // Get amount for this vendor across each visible month period
  const getActualForMonth = (mIdx) => {
    const pkey = periodKey(mIdx, year);
    return actuals[glId]?.[pkey]?.[vendor] || 0;
  };
  const getPlanForMonth = (mIdx) => {
    const pkey = periodKey(mIdx, year);
    return vendorPlans[glId]?.[pkey]?.[vendor]?.amount || 0;
  };
  const getPlanIdForMonth = (mIdx) => {
    const pkey = periodKey(mIdx, year);
    return vendorPlans[glId]?.[pkey]?.[vendor]?.id || null;
  };

  const totalActual = MONTHS.reduce((s,_,i) => s + getActualForMonth(i), 0);
  const totalPlan = MONTHS.reduce((s,_,i) => s + getPlanForMonth(i), 0);

  return (
    <tr style={{ background: T.surface + "55" }}>
      <td style={{
        padding: "4px 12px 4px 64px", position: "sticky", left: 0,
        background: T.surface + "55", zIndex: 8,
        borderBottom: `1px solid ${T.border}33`,
        fontSize: 11, color: T.text2,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 5, height: 5, borderRadius: "50%", background: T.text3 }} />
          {vendor}
        </div>
      </td>
      <td style={{ borderBottom: `1px solid ${T.border}33` }} />
      {visibleMonths.map(([label, start, end]) => {
        const months = Array.from({length: end-start+1}, (_,k) => start+k);
        const actSum = months.reduce((s,m) => s + getActualForMonth(m), 0);
        const planSum = months.reduce((s,m) => s + getPlanForMonth(m), 0);
        const isAggregated = months.length > 1;
        // For single month: show editable plan + actual readonly. For aggregated: show both as readonly summed.
        const singleMonth = months[0];
        return (
          <td key={label} style={{
            textAlign: "right", padding: "4px 6px",
            borderBottom: `1px solid ${T.border}33`,
          }}>
            {actSum > 0 && (
              <div style={{
                fontSize: 10, color: T.green,
                fontFamily: "ui-monospace, SFMono-Regular, monospace",
              }}>
                {fmt(actSum)} <span style={{ color: T.text3 }}>act</span>
              </div>
            )}
            {!isAggregated ? (
              <EditableCell
                value={getPlanForMonth(singleMonth)}
                onSave={(v) => savePlan(vendor, glId, singleMonth, v, getPlanIdForMonth(singleMonth))}
                small
              />
            ) : (
              planSum > 0 && (
                <div style={{
                  fontSize: 10, color: T.purple,
                  fontFamily: "ui-monospace, SFMono-Regular, monospace",
                }}>
                  {fmt(planSum)} <span style={{ color: T.text3 }}>plan</span>
                </div>
              )
            )}
          </td>
        );
      })}
      <td style={{
        textAlign: "right", padding: "4px 12px",
        borderBottom: `1px solid ${T.border}33`,
        fontSize: 11,
        fontFamily: "ui-monospace, SFMono-Regular, monospace",
      }}>
        <div style={{ color: T.green }}>{totalActual > 0 ? fmt(totalActual) : ""}</div>
        <div style={{ color: T.purple }}>{totalPlan > 0 ? fmt(totalPlan) : ""}</div>
      </td>
    </tr>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main BudgetPlanner component
// ─────────────────────────────────────────────────────────────────────────────
export default function BudgetPlanner() {
  const { user, profile, orgId } = useAuth();
  const [activeTab, setActiveTab] = useState("spend");
  const [year, setYear] = useState(new Date().getFullYear());
  const [viewMode, setViewMode] = useState("monthly"); // monthly | quarterly | annual
  const [searchFilter, setSearchFilter] = useState("");

  // ── Data state ─────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [activePlan, setActivePlan] = useState(null);
  const [allPlans, setAllPlans] = useState([]);
  const [categories, setCategories] = useState([]); // af_gl_categories
  const [glCodes, setGlCodes] = useState([]); // af_gl_codes
  const [actuals, setActuals] = useState({}); // { glCode: { period: { vendor: amount } } }

  // Plan-specific data
  const [catBudgets, setCatBudgets] = useState({}); // { catId: { period: amount } }
  const [glBudgets, setGlBudgets] = useState({}); // { glCodeId: { period: amount } }
  const [vendorPlans, setVendorPlans] = useState({}); // { glCodeId: { period: { vendor: { id, amount } } } }
  const [people, setPeople] = useState([]);
  const [planAccess, setPlanAccess] = useState([]);

  // UI state
  const [expandedCats, setExpandedCats] = useState({});
  const [expandedGLs, setExpandedGLs] = useState({});
  const [showAddVendor, setShowAddVendor] = useState(null); // { glId, month }
  const [newVendorName, setNewVendorName] = useState("");
  const [newVendorAmount, setNewVendorAmount] = useState("");
  const [showPlanPicker, setShowPlanPicker] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [orgMembers, setOrgMembers] = useState([]);

  // ── Load reference data (GL cats/codes + actuals) ──────────────────────────
  // Extract GL code prefix (e.g., "60211" from "60211 Google Ads" or "60211 Direct Ad Spend:Google Ads")
  const extractGLCode = (str) => {
    if (!str) return null;
    const m = String(str).match(/^(\d{5})/);
    return m ? m[1] : null;
  };

  const [lastSynced, setLastSynced] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [glMonthlyTotals, setGlMonthlyTotals] = useState({}); // { glCode: { period: total } } - from qbo_pl_monthly

  const loadActuals = useCallback(async () => {
    if (!orgId) return;
    setSyncing(true);
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year + 1}-01-01`;

    // Paginated fetch — Supabase server default max is 1000 rows per request
    // Must use page size ≤ server max so we can detect when more rows exist
    const fetchAll = async (buildQuery) => {
      const PAGE = 1000;
      let all = [];
      let from = 0;
      while (true) {
        const { data, error } = await buildQuery().range(from, from + PAGE - 1);
        if (error) { console.error("[BudgetPlanner] fetchAll error:", error); break; }
        if (!data || data.length === 0) break;
        all = all.concat(data);
        if (data.length < PAGE) break; // last page
        from += PAGE;
      }
      return all;
    };

    // Pull from 5 sources in parallel (paginated for large tables)
    const [vs, bills, purchases, plMonthly, qboAccounts] = await Promise.all([
      fetchAll(() =>
        supabase.from("fin_vendor_spend")
          .select("vendor_name, gl_account, amount, period, budget_or_actual")
          .eq("org_id", orgId).eq("budget_or_actual", "Actual")
          .like("period", `${year}-%`)
      ),
      fetchAll(() =>
        supabase.from("qbo_bills")
          .select("vendor_name, txn_date, total_amount, gl_accounts, line_items")
          .eq("org_id", orgId)
          .gte("txn_date", yearStart).lt("txn_date", yearEnd)
      ),
      fetchAll(() =>
        supabase.from("qbo_purchases")
          .select("vendor_name, txn_date, total_amount, gl_accounts, line_items")
          .eq("org_id", orgId)
          .gte("txn_date", yearStart).lt("txn_date", yearEnd)
      ),
      fetchAll(() =>
        supabase.from("qbo_pl_monthly")
          .select("period_month, account_name, amount")
          .eq("org_id", orgId)
          .like("period_month", `${year}-%`)
      ),
      fetchAll(() =>
        supabase.from("qbo_accounts")
          .select("qbo_id, name, fully_qualified_name")
          .eq("org_id", orgId).eq("active", true)
      ),
    ]);

    console.log(`[BudgetPlanner] Loaded: ${vs.length} vendor_spend, ${bills.length} bills, ${purchases.length} purchases, ${plMonthly.length} pl_monthly, ${qboAccounts.length} accounts`);
    // "60520 Software & Subscriptions" → leaf name "Software & Subscriptions" → code "60520"
    // Also map fully_qualified_name from qbo_accounts to code
    const leafToCode = {};   // "Software & Subscriptions" → "60520"
    const fqnToCode = {};    // "G&A:Software & Subscriptions" → "60520"
    const qboIdToCode = {};  // "234" → "60520"

    (plMonthly || []).forEach(row => {
      const code = extractGLCode(row.account_name);
      if (!code) return;
      // Extract the suffix after "60520 " — e.g. "Software & Subscriptions" or "Direct Ad Spend:Google Ads"
      const suffix = String(row.account_name).replace(/^\d{5}\s+/, "");
      if (suffix) {
        // Map both the full suffix and the leaf part
        leafToCode[suffix] = code;
        const parts = suffix.split(":");
        if (parts.length > 1) leafToCode[parts[parts.length - 1].trim()] = code;
      }
    });

    // Map QBO accounts to codes via leaf name matching
    (qboAccounts || []).forEach(acc => {
      const code = leafToCode[acc.name] || leafToCode[acc.fully_qualified_name];
      if (code) {
        fqnToCode[acc.fully_qualified_name] = code;
        qboIdToCode[acc.qbo_id] = code;
      }
    });

    // Resolve GL code from any format: "60520 ...", "G&A:Software & Subscriptions", gl_id "234"
    const resolveCode = (glStr, glId) => {
      if (!glStr && !glId) return null;
      // Try 5-digit prefix first
      const direct = extractGLCode(glStr);
      if (direct) return direct;
      // Try fully qualified name
      if (glStr && fqnToCode[glStr]) return fqnToCode[glStr];
      // Try leaf name
      if (glStr) {
        const leaf = glStr.split(":").pop().trim();
        if (leafToCode[leaf]) return leafToCode[leaf];
      }
      // Try QBO account ID
      if (glId && qboIdToCode[glId]) return qboIdToCode[glId];
      return null;
    };

    // ── Build month-level totals from qbo_pl_monthly (authoritative source) ──
    const monthlyMap = {};
    (plMonthly || []).forEach(row => {
      const code = extractGLCode(row.account_name);
      if (!code) return;
      if (!monthlyMap[code]) monthlyMap[code] = {};
      monthlyMap[code][row.period_month] = (monthlyMap[code][row.period_month] || 0) + Number(row.amount || 0);
    });
    setGlMonthlyTotals(monthlyMap);

    // ── Build vendor-level actuals map: { glCode: { period: { vendor: amount } } } ──
    const actMap = {};

    const addToMap = (code, period, vendor, amount) => {
      if (!code || !period) return;
      if (!actMap[code]) actMap[code] = {};
      if (!actMap[code][period]) actMap[code][period] = {};
      actMap[code][period][vendor] = (actMap[code][period][vendor] || 0) + amount;
    };

    // 1. fin_vendor_spend (Jan baseline with vendor breakdown)
    (vs || []).forEach(row => {
      const code = extractGLCode(row.gl_account);
      if (code) addToMap(code, row.period, row.vendor_name || "(blank)", Number(row.amount || 0));
    });

    // Track which periods are covered by fin_vendor_spend
    const coveredPeriods = new Set();
    (vs || []).forEach(row => coveredPeriods.add(row.period));

    // Helper: process a bill or purchase transaction
    const processTxn = (txn) => {
      if (!txn.txn_date) return;
      const period = txn.txn_date.slice(0, 7);
      if (coveredPeriods.has(period)) return;

      const vendor = txn.vendor_name || "(blank)";
      let items = txn.line_items;
      // line_items might be a JSON string
      if (typeof items === "string") { try { items = JSON.parse(items); } catch { items = []; } }
      if (!Array.isArray(items)) items = [];

      if (items.length > 0) {
        items.forEach(li => {
          const code = resolveCode(li.gl_account, li.gl_id);
          if (code) addToMap(code, period, vendor, Number(li.amount || 0));
        });
      } else if (txn.gl_accounts) {
        const code = resolveCode(txn.gl_accounts, null);
        if (code) addToMap(code, period, vendor, Number(txn.total_amount || 0));
      }
    };

    // 2. qbo_bills (AP invoices)
    (bills || []).forEach(processTxn);

    // 3. qbo_purchases (CC charges, bank debits — the big one)
    (purchases || []).forEach(processTxn);

    const totalVendorEntries = Object.values(actMap).reduce((s, periods) => s + Object.values(periods).reduce((s2, vendors) => s2 + Object.keys(vendors).length, 0), 0);
    console.log(`[BudgetPlanner] actMap: ${Object.keys(actMap).length} GL codes, ${totalVendorEntries} vendor×month entries, coveredPeriods: [${[...coveredPeriods]}]`);
    setActuals(actMap);
    setLastSynced(new Date());
    setSyncing(false);
  }, [orgId, year]);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      const [{ data: cats }, { data: codes }] = await Promise.all([
        supabase.from("af_gl_categories").select("*").eq("org_id", orgId).order("sort_order"),
        supabase.from("af_gl_codes").select("*").eq("org_id", orgId).eq("is_active", true).order("code"),
      ]);
      setCategories(cats || []);
      setGlCodes(codes || []);
    })();
  }, [orgId]);

  useEffect(() => { loadActuals(); }, [loadActuals]);

  // ── Load org members for sharing ───────────────────────────────────────────
  useEffect(() => {
    if (!orgId) return;
    (async () => {
      const { data } = await supabase
        .from("org_memberships")
        .select("user_id, profiles(display_name, email, avatar_url)")
        .eq("org_id", orgId);
      setOrgMembers(data || []);
    })();
  }, [orgId]);

  // ── Load list of plans owned-or-shared with current user ───────────────────
  const loadPlans = useCallback(async () => {
    if (!user || !orgId) return;
    const { data } = await supabase
      .from("budget_plans")
      .select("*")
      .eq("org_id", orgId)
      .eq("fiscal_year", year)
      .order("created_at", { ascending: false });
    setAllPlans(data || []);
    if (!activePlan && data && data.length > 0) {
      setActivePlan(data[0]);
    } else if (!data || data.length === 0) {
      setActivePlan(null);
    }
  }, [user, orgId, year, activePlan]);

  useEffect(() => { loadPlans(); }, [user, orgId, year]); // eslint-disable-line

  // ── Load plan-specific data when activePlan changes ────────────────────────
  useEffect(() => {
    if (!activePlan) {
      setCatBudgets({}); setGlBudgets({}); setVendorPlans({}); setPeople([]); setPlanAccess([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    (async () => {
      const [
        { data: cats },
        { data: gls },
        { data: vendors },
        { data: ppl },
        { data: access },
      ] = await Promise.all([
        supabase.from("budget_plan_categories").select("*").eq("plan_id", activePlan.id),
        supabase.from("budget_plan_gl").select("*").eq("plan_id", activePlan.id),
        supabase.from("budget_plan_vendors").select("*").eq("plan_id", activePlan.id),
        supabase.from("budget_plan_people").select("*").eq("plan_id", activePlan.id),
        supabase.from("budget_plan_access").select("*, profile:profiles!budget_plan_access_user_id_fkey(display_name,email)").eq("plan_id", activePlan.id),
      ]);

      const cb = {};
      (cats || []).forEach(r => {
        if (!cb[r.category_id]) cb[r.category_id] = {};
        cb[r.category_id][periodKey(r.month-1, activePlan.fiscal_year)] = Number(r.budget_amount);
      });
      setCatBudgets(cb);

      const gb = {};
      (gls || []).forEach(r => {
        if (!gb[r.gl_code_id]) gb[r.gl_code_id] = {};
        gb[r.gl_code_id][periodKey(r.month-1, activePlan.fiscal_year)] = Number(r.budget_amount);
      });
      setGlBudgets(gb);

      const vp = {};
      (vendors || []).forEach(r => {
        if (!vp[r.gl_code_id]) vp[r.gl_code_id] = {};
        const pk = periodKey(r.month-1, activePlan.fiscal_year);
        if (!vp[r.gl_code_id][pk]) vp[r.gl_code_id][pk] = {};
        vp[r.gl_code_id][pk][r.vendor_name] = { id: r.id, amount: Number(r.planned_amount), notes: r.notes };
      });
      setVendorPlans(vp);

      setPeople(ppl || []);
      setPlanAccess(access || []);
      setLoading(false);
    })();
  }, [activePlan]);

  // ── Create new plan ────────────────────────────────────────────────────────
  const createPlan = async () => {
    if (!user || !orgId) return;
    const { data, error } = await supabase
      .from("budget_plans")
      .insert({
        org_id: orgId,
        name: `FY ${year} Budget Plan`,
        fiscal_year: year,
        owner_id: user.id,
        status: "draft",
      })
      .select()
      .single();
    if (error) { alert("Failed to create plan: " + error.message); return; }
    await loadPlans();
    setActivePlan(data);
  };

  // ── Save handlers (upsert into Supabase) ───────────────────────────────────
  const saveCatBudget = async (catId, monthIdx, amount) => {
    if (!activePlan) return;
    const pk = periodKey(monthIdx, activePlan.fiscal_year);
    setCatBudgets(p => ({ ...p, [catId]: { ...(p[catId]||{}), [pk]: amount } }));
    await supabase.from("budget_plan_categories").upsert({
      plan_id: activePlan.id, category_id: catId, month: monthIdx+1, budget_amount: amount,
    }, { onConflict: "plan_id,category_id,month" });
  };

  const saveGLBudget = async (glCodeId, monthIdx, amount) => {
    if (!activePlan) return;
    const pk = periodKey(monthIdx, activePlan.fiscal_year);
    setGlBudgets(p => ({ ...p, [glCodeId]: { ...(p[glCodeId]||{}), [pk]: amount } }));
    await supabase.from("budget_plan_gl").upsert({
      plan_id: activePlan.id, gl_code_id: glCodeId, month: monthIdx+1, budget_amount: amount,
    }, { onConflict: "plan_id,gl_code_id,month" });
  };

  const saveVendorPlan = async (vendor, glCodeId, monthIdx, amount, existingId) => {
    if (!activePlan) return;
    const pk = periodKey(monthIdx, activePlan.fiscal_year);
    if (existingId) {
      // Update
      setVendorPlans(p => {
        const next = { ...p };
        if (!next[glCodeId]) next[glCodeId] = {};
        if (!next[glCodeId][pk]) next[glCodeId][pk] = {};
        next[glCodeId][pk][vendor] = { ...next[glCodeId][pk][vendor], amount };
        return next;
      });
      await supabase.from("budget_plan_vendors").update({ planned_amount: amount }).eq("id", existingId);
    } else {
      // Insert
      const { data } = await supabase.from("budget_plan_vendors").insert({
        plan_id: activePlan.id, vendor_name: vendor, gl_code_id: glCodeId,
        month: monthIdx+1, planned_amount: amount,
      }).select().single();
      if (data) {
        setVendorPlans(p => {
          const next = { ...p };
          if (!next[glCodeId]) next[glCodeId] = {};
          if (!next[glCodeId][pk]) next[glCodeId][pk] = {};
          next[glCodeId][pk][vendor] = { id: data.id, amount };
          return next;
        });
      }
    }
  };

  const addVendorToGL = async (glCodeId, vendor, monthIdx, amount) => {
    if (!activePlan || !vendor.trim()) return;
    await saveVendorPlan(vendor.trim(), glCodeId, monthIdx, Number(amount) || 0, null);
    setNewVendorName(""); setNewVendorAmount(""); setShowAddVendor(null);
  };

  const deleteVendorPlan = async (planId) => {
    if (!planId) return;
    await supabase.from("budget_plan_vendors").delete().eq("id", planId);
    // Re-fetch
    const { data: vendors } = await supabase.from("budget_plan_vendors").select("*").eq("plan_id", activePlan.id);
    const vp = {};
    (vendors || []).forEach(r => {
      if (!vp[r.gl_code_id]) vp[r.gl_code_id] = {};
      const pk = periodKey(r.month-1, activePlan.fiscal_year);
      if (!vp[r.gl_code_id][pk]) vp[r.gl_code_id][pk] = {};
      vp[r.gl_code_id][pk][r.vendor_name] = { id: r.id, amount: Number(r.planned_amount) };
    });
    setVendorPlans(vp);
  };

  // ── Sharing ────────────────────────────────────────────────────────────────
  const shareWithUser = async (userId, role) => {
    await supabase.from("budget_plan_access").insert({
      plan_id: activePlan.id, user_id: userId, role, granted_by: user.id,
    });
    const { data } = await supabase.from("budget_plan_access")
      .select("*, profile:profiles!budget_plan_access_user_id_fkey(display_name,email)")
      .eq("plan_id", activePlan.id);
    setPlanAccess(data || []);
  };

  const removeAccess = async (accessId) => {
    await supabase.from("budget_plan_access").delete().eq("id", accessId);
    setPlanAccess(p => p.filter(a => a.id !== accessId));
  };

  // ── Computed totals ────────────────────────────────────────────────────────
  // Priority: qbo_pl_monthly (official P&L) > vendor breakdown sum from fin_vendor_spend + qbo_bills
  const getActualVendorTotal = useCallback((glCode, monthIdx) => {
    const pk = periodKey(monthIdx, year);
    // Prefer authoritative P&L total if available for this GL+month
    const plTotal = glMonthlyTotals[glCode]?.[pk];
    if (plTotal != null) return plTotal;
    // Fallback: sum vendor breakdown
    const vendors = actuals[glCode]?.[pk] || {};
    return Object.values(vendors).reduce((s,v) => s + v, 0);
  }, [actuals, glMonthlyTotals, year]);

  const getVendorPlanTotal = useCallback((glCodeId, monthIdx) => {
    const pk = periodKey(monthIdx, year);
    const vendors = vendorPlans[glCodeId]?.[pk] || {};
    return Object.values(vendors).reduce((s,v) => s + v.amount, 0);
  }, [vendorPlans, year]);

  const getCatGLBudgetSum = useCallback((catId, monthIdx) => {
    const pk = periodKey(monthIdx, year);
    return glCodes.filter(g => g.budget_category_id === catId)
      .reduce((s,g) => s + (Number(glBudgets[g.id]?.[pk]) || 0), 0);
  }, [glCodes, glBudgets, year]);

  const getCatActualTotal = useCallback((catId, monthIdx) => {
    return glCodes.filter(g => g.budget_category_id === catId)
      .reduce((s,g) => s + getActualVendorTotal(g.code, monthIdx), 0);
  }, [glCodes, getActualVendorTotal]);

  const isGLOverBudget = useCallback((glCodeId, monthIdx) => {
    const pk = periodKey(monthIdx, year);
    const planned = getVendorPlanTotal(glCodeId, monthIdx);
    const budget = Number(glBudgets[glCodeId]?.[pk]) || 0;
    return planned > 0 && budget > 0 && planned > budget;
  }, [getVendorPlanTotal, glBudgets, year]);

  const isCatOverBudget = useCallback((catId, monthIdx) => {
    const pk = periodKey(monthIdx, year);
    const glSum = getCatGLBudgetSum(catId, monthIdx);
    const catBudget = Number(catBudgets[catId]?.[pk]) || 0;
    return glSum > 0 && catBudget > 0 && glSum > catBudget;
  }, [getCatGLBudgetSum, catBudgets, year]);

  // ── View modes (monthly/quarterly/annual) ──────────────────────────────────
  const visibleMonths = useMemo(() => {
    if (viewMode === "quarterly") return [["Q1",0,2],["Q2",3,5],["Q3",6,8],["Q4",9,11]];
    if (viewMode === "annual") return [[`FY${year}`, 0, 11]];
    return MONTHS.map((m,i) => [m, i, i]);
  }, [viewMode, year]);

  // ── Filtered categories ────────────────────────────────────────────────────
  const filteredCategories = useMemo(() => {
    if (!searchFilter) return categories;
    const q = searchFilter.toLowerCase();
    return categories.filter(c => {
      if (c.name.toLowerCase().includes(q)) return true;
      return glCodes.some(g => g.budget_category_id === c.id &&
        (g.name.toLowerCase().includes(q) || g.code.includes(q)));
    });
  }, [categories, glCodes, searchFilter]);

  // ── Grand totals ───────────────────────────────────────────────────────────
  const grandTotals = useMemo(() => {
    const out = {};
    MONTHS.forEach((_,i) => {
      const pk = periodKey(i, year);
      let budget = 0, actual = 0, planned = 0;
      categories.forEach(c => {
        budget += Number(catBudgets[c.id]?.[pk]) || 0;
        actual += getCatActualTotal(c.id, i);
      });
      glCodes.forEach(g => {
        planned += getVendorPlanTotal(g.id, i);
      });
      out[i] = { budget, actual, planned };
    });
    return out;
  }, [categories, glCodes, catBudgets, year, getCatActualTotal, getVendorPlanTotal]);

  // ── No plan? Show create CTA ───────────────────────────────────────────────
  if (!activePlan && !loading && allPlans.length === 0) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", padding: 40 }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>💰</div>
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>No Budget Plan for FY {year}</div>
        <div style={{ fontSize: 13, color: T.text2, marginBottom: 20, textAlign: "center", maxWidth: 420 }}>
          Create a budget plan to start setting category, GL code, and vendor-level spend targets that track against QuickBooks actuals.
        </div>
        <button onClick={createPlan} style={{
          background: T.accent, color: "#fff", border: "none",
          padding: "10px 24px", borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: "pointer",
        }}>
          + Create FY {year} Plan
        </button>
      </div>
    );
  }

  if (loading) {
    return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: T.text3, fontSize: 13 }}>Loading budget plan…</div>;
  }

  const isOwner = activePlan && user && activePlan.owner_id === user.id;
  const annualBudget = Object.values(grandTotals).reduce((s,t) => s + t.budget, 0);
  const ytdActual = Object.values(grandTotals).reduce((s,t) => s + t.actual, 0);
  const totalPlanned = Object.values(grandTotals).reduce((s,t) => s + t.planned, 0);
  const remaining = annualBudget - ytdActual;

  // Spend-to-date: only include months we have actuals for, and matching budget for same months
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonthIdx = now.getMonth(); // 0-11
  // If viewing past year, use all 12 months; if current, through current month; if future, 0
  const monthsElapsed = year < currentYear ? 12 : year > currentYear ? 0 : currentMonthIdx + 1;
  const budgetToDate = Array.from({length: monthsElapsed}, (_,i) => grandTotals[i]?.budget || 0).reduce((s,v) => s + v, 0);
  const spendToDate = Array.from({length: monthsElapsed}, (_,i) => grandTotals[i]?.actual || 0).reduce((s,v) => s + v, 0);
  const ytdVariance = budgetToDate - spendToDate; // positive = under budget
  const pctOfBudget = annualBudget > 0 ? (ytdActual / annualBudget) * 100 : 0;

  // ───────────────────────────────────────────────────────────────────────────
  // RENDER
  // ───────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: T.bg, color: T.text, height: "100%", overflow: "auto", display: "flex", flexDirection: "column" }}>
      {/* ─── Header ─── */}
      <div style={{ padding: "18px 24px 0", borderBottom: `1px solid ${T.border}`, background: T.surface, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: "-0.02em" }}>Budget Planner</span>
              {activePlan && (
                <button onClick={() => setShowPlanPicker(p => !p)} style={{
                  background: T.accentDim, color: T.accent, fontSize: 11, padding: "3px 10px",
                  borderRadius: 4, fontWeight: 600, border: "none", cursor: "pointer",
                  display: "flex", alignItems: "center", gap: 6,
                }}>
                  {activePlan.name} ▾
                </button>
              )}
              {activePlan?.status && (
                <span style={{
                  background: activePlan.status === "active" ? T.greenDim : activePlan.status === "locked" ? T.yellowDim : T.surface2,
                  color: activePlan.status === "active" ? T.green : activePlan.status === "locked" ? T.yellow : T.text2,
                  fontSize: 10, padding: "2px 8px", borderRadius: 4, fontWeight: 600, textTransform: "uppercase",
                }}>{activePlan.status}</span>
              )}
            </div>
            <div style={{ fontSize: 12, color: T.text2, marginTop: 4 }}>
              Vendor-level planning by GL code · Real-time QuickBooks tracking
            </div>
            {showPlanPicker && (
              <div style={{
                position: "absolute", marginTop: 6, background: T.surface2, border: `1px solid ${T.border}`,
                borderRadius: 6, padding: 6, minWidth: 240, boxShadow: "0 8px 20px rgba(0,0,0,0.4)", zIndex: 100,
              }}>
                {allPlans.map(p => (
                  <button key={p.id} onClick={() => { setActivePlan(p); setShowPlanPicker(false); }}
                    style={{
                      width: "100%", textAlign: "left", padding: "6px 10px",
                      background: activePlan?.id === p.id ? T.accentDim : "transparent",
                      color: activePlan?.id === p.id ? T.accent : T.text,
                      border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12, marginBottom: 2,
                    }}>{p.name} <span style={{ color: T.text3, fontSize: 10 }}>FY{p.fiscal_year}</span></button>
                ))}
                <div style={{ height: 1, background: T.border, margin: "4px 0" }} />
                <button onClick={() => { createPlan(); setShowPlanPicker(false); }}
                  style={{ width: "100%", textAlign: "left", padding: "6px 10px", background: "transparent",
                    color: T.accent, border: "none", borderRadius: 4, cursor: "pointer", fontSize: 12 }}>
                  + New plan for FY {year}
                </button>
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <select value={year} onChange={e => setYear(Number(e.target.value))} style={{
              background: T.surface2, border: `1px solid ${T.border}`, color: T.text,
              padding: "6px 10px", borderRadius: 6, fontSize: 12,
            }}>
              {[2024,2025,2026,2027,2028].map(y => <option key={y} value={y}>FY {y}</option>)}
            </select>
            <select value={viewMode} onChange={e => setViewMode(e.target.value)} style={{
              background: T.surface2, border: `1px solid ${T.border}`, color: T.text,
              padding: "6px 10px", borderRadius: 6, fontSize: 12,
            }}>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
              <option value="annual">Annual</option>
            </select>
            <button onClick={loadActuals} disabled={syncing} title={lastSynced ? `Last synced: ${lastSynced.toLocaleTimeString()}` : "Pull latest actuals from QBO"} style={{
              background: syncing ? T.surface2 : T.surface2, color: syncing ? T.text3 : T.text,
              border: `1px solid ${T.border}`, padding: "7px 12px",
              borderRadius: 6, fontSize: 12, fontWeight: 500, cursor: syncing ? "wait" : "pointer",
              display: "flex", alignItems: "center", gap: 6,
            }}>
              <span style={{ display: "inline-block", transform: syncing ? "rotate(360deg)" : "none", transition: "transform 1s linear" }}>↻</span>
              {syncing ? "Syncing…" : "Refresh QBO"}
            </button>
            {isOwner && (
              <button onClick={() => setShowShare(true)} style={{
                background: T.accent, color: "#fff", border: "none", padding: "7px 14px",
                borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
              }}>Share Plan</button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: "flex", gap: 0 }}>
          {[
            { key: "spend", label: "Spend Planning", icon: "📊" },
            { key: "people", label: "People & Salaries", icon: "🔒", ownerOnly: true },
            { key: "settings", label: "Settings", icon: "⚙" },
          ].map(t => {
            if (t.ownerOnly && !isOwner) return null;
            return (
              <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
                background: activeTab === t.key ? T.bg : "transparent",
                color: activeTab === t.key ? T.text : T.text2,
                border: "none",
                borderBottom: activeTab === t.key ? `2px solid ${T.accent}` : "2px solid transparent",
                padding: "10px 18px", fontSize: 12, fontWeight: 500, cursor: "pointer",
              }}>
                {t.icon} {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ─── SPEND TAB ─── */}
      {activeTab === "spend" && (
        <>
          {/* Summary cards */}
          <div style={{
            display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10,
            padding: "14px 24px", borderBottom: `1px solid ${T.border}`, flexShrink: 0,
          }}>
            {/* Annual Budget */}
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ fontSize: 10, color: T.text2, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Annual Budget</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: T.accent, fontFamily: "ui-monospace, monospace" }}>{fmt(annualBudget)}</div>
            </div>
            {/* Spend to Date */}
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <div style={{ fontSize: 10, color: T.text2, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  Spend to Date
                  <span style={{ color: T.text3, textTransform: "none", letterSpacing: 0 }}> ({monthsElapsed}mo)</span>
                </div>
                <div style={{ fontSize: 10, color: pctOfBudget > 100 ? T.red : T.text3, fontWeight: 600 }}>
                  {pctOfBudget.toFixed(1)}% used
                </div>
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: T.green, fontFamily: "ui-monospace, monospace" }}>{fmt(spendToDate)}</div>
              {/* Progress bar */}
              <div style={{ marginTop: 6, height: 4, borderRadius: 2, background: T.surface3 }}>
                <div style={{
                  height: "100%", borderRadius: 2,
                  width: `${Math.min(pctOfBudget, 100)}%`,
                  background: pctOfBudget > 100 ? T.red : pctOfBudget > 80 ? T.yellow : T.green,
                  transition: "width 0.4s ease",
                }} />
              </div>
            </div>
            {/* YTD Variance */}
            <div style={{ background: T.surface, border: `1px solid ${ytdVariance < 0 ? T.red + "44" : T.border}`, borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ fontSize: 10, color: T.text2, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>
                YTD Variance
              </div>
              <div style={{
                fontSize: 20, fontWeight: 800, fontFamily: "ui-monospace, monospace",
                color: ytdVariance < 0 ? T.red : T.green,
              }}>
                {ytdVariance >= 0 ? "+" : ""}{fmt(ytdVariance)}
              </div>
              <div style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>
                vs {fmt(budgetToDate)} budget ({monthsElapsed}mo)
              </div>
            </div>
            {/* Vendor Plans */}
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ fontSize: 10, color: T.text2, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Planned (Vendors)</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: T.purple, fontFamily: "ui-monospace, monospace" }}>{fmt(totalPlanned)}</div>
            </div>
            {/* Remaining */}
            <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: "12px 14px" }}>
              <div style={{ fontSize: 10, color: T.text2, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>Remaining</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: remaining < 0 ? T.red : T.yellow, fontFamily: "ui-monospace, monospace" }}>{fmt(remaining)}</div>
              {lastSynced && (
                <div style={{ fontSize: 9, color: T.text3, marginTop: 3 }}>
                  QBO synced {lastSynced.toLocaleTimeString()}
                </div>
              )}
            </div>
          </div>

          {/* Search */}
          <div style={{ padding: "10px 24px", borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
            <input
              placeholder="Search categories, GL codes, or vendors…"
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
              style={{
                width: 320, background: T.surface2, border: `1px solid ${T.border}`,
                color: T.text, padding: "7px 10px", borderRadius: 6, fontSize: 12, outline: "none",
              }}
            />
          </div>

          {/* Table */}
          <div style={{ flex: 1, overflow: "auto", padding: "0 24px 24px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
              <thead>
                <tr>
                  <th style={{
                    textAlign: "left", padding: "8px 12px", fontSize: 10, color: T.text2,
                    textTransform: "uppercase", letterSpacing: "0.05em",
                    position: "sticky", left: 0, top: 0, background: T.bg, zIndex: 12,
                    minWidth: 280, borderBottom: `1px solid ${T.border}`,
                  }}>Category / GL / Vendor</th>
                  <th style={{
                    textAlign: "center", padding: "8px 6px", fontSize: 10, color: T.text2,
                    textTransform: "uppercase", borderBottom: `1px solid ${T.border}`, minWidth: 50,
                    position: "sticky", top: 0, background: T.bg, zIndex: 11,
                  }}>Type</th>
                  {visibleMonths.map(([label]) => (
                    <th key={label} style={{
                      textAlign: "right", padding: "8px 6px", fontSize: 10, color: T.text2,
                      textTransform: "uppercase", borderBottom: `1px solid ${T.border}`, minWidth: 90,
                      position: "sticky", top: 0, background: T.bg, zIndex: 11,
                    }}>{label}</th>
                  ))}
                  <th style={{
                    textAlign: "right", padding: "8px 12px", fontSize: 10, color: T.text2,
                    textTransform: "uppercase", borderBottom: `1px solid ${T.border}`, minWidth: 90,
                    position: "sticky", top: 0, background: T.bg, zIndex: 11,
                  }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {/* Grand total */}
                <tr style={{ background: T.surface }}>
                  <td style={{
                    padding: "10px 12px", fontWeight: 700, fontSize: 12,
                    position: "sticky", left: 0, background: T.surface, zIndex: 10,
                    borderBottom: `2px solid ${T.border}`,
                  }}>■ TOTAL BUDGET</td>
                  <td style={{ borderBottom: `2px solid ${T.border}`, fontSize: 9, color: T.text3, textAlign: "center" }}>—</td>
                  {visibleMonths.map(([label, start, end]) => {
                    const months = Array.from({length: end-start+1}, (_,k) => start+k);
                    const v = months.reduce((s,m) => s + (grandTotals[m]?.budget || 0), 0);
                    return (
                      <td key={label} style={{
                        textAlign: "right", padding: "10px 6px", fontWeight: 700, fontSize: 12,
                        fontFamily: "ui-monospace, monospace", borderBottom: `2px solid ${T.border}`,
                      }}>{fmt(v)}</td>
                    );
                  })}
                  <td style={{
                    textAlign: "right", padding: "10px 12px", fontWeight: 800, fontSize: 13,
                    fontFamily: "ui-monospace, monospace", borderBottom: `2px solid ${T.border}`, color: T.accent,
                  }}>{fmt(annualBudget)}</td>
                </tr>

                {/* Categories */}
                {filteredCategories.map(cat => {
                  const isExp = expandedCats[cat.id];
                  const glsInCat = glCodes.filter(g => g.budget_category_id === cat.id);
                  const overSomeMonth = MONTHS.some((_,i) => isCatOverBudget(cat.id, i));
                  return (
                    <Fragment key={cat.id}>
                      <tr onClick={() => setExpandedCats(p => ({ ...p, [cat.id]: !p[cat.id] }))} style={{
                        cursor: "pointer", background: overSomeMonth ? T.redDim : "transparent",
                      }}>
                        <td style={{
                          padding: "9px 12px", position: "sticky", left: 0,
                          background: overSomeMonth ? T.redDim : T.bg, zIndex: 10,
                          borderBottom: `1px solid ${T.border}`,
                        }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 9, color: T.text2, transform: isExp ? "rotate(90deg)" : "none", transition: "transform .12s" }}>▶</span>
                            <span style={{ width: 8, height: 8, borderRadius: 2, background: cat.color || T.accent, flexShrink: 0 }} />
                            <span style={{ fontWeight: 600, fontSize: 12 }}>{cat.name}</span>
                            {overSomeMonth && <span style={{ fontSize: 9, color: T.red, fontWeight: 700 }}>⚠ OVER</span>}
                            <span style={{ fontSize: 10, color: T.text3, marginLeft: 4 }}>({glsInCat.length})</span>
                          </div>
                        </td>
                        <td style={{ textAlign: "center", fontSize: 9, color: T.accent, borderBottom: `1px solid ${T.border}` }}>Cat</td>
                        {visibleMonths.map(([label, start, end]) => {
                          const months = Array.from({length: end-start+1}, (_,k) => start+k);
                          const budget = months.reduce((s,m) => s + (Number(catBudgets[cat.id]?.[periodKey(m, year)]) || 0), 0);
                          const actual = months.reduce((s,m) => s + getCatActualTotal(cat.id, m), 0);
                          const isOver = months.some(m => isCatOverBudget(cat.id, m));
                          const singleMonth = months.length === 1 ? months[0] : null;
                          return (
                            <td key={label} onClick={e => e.stopPropagation()} style={{
                              textAlign: "right", padding: "8px 6px", borderBottom: `1px solid ${T.border}`,
                            }}>
                              {singleMonth !== null ? (
                                <EditableCell
                                  value={budget}
                                  onSave={(v) => saveCatBudget(cat.id, singleMonth, v)}
                                  isOver={isOver}
                                />
                              ) : (
                                <div style={{
                                  fontFamily: "ui-monospace, monospace", fontSize: 12, fontWeight: 600,
                                  color: isOver ? T.red : T.text, padding: "3px 6px",
                                }}>{fmt(budget)}</div>
                              )}
                              {actual > 0 && (
                                <div style={{ fontSize: 10, color: actual > budget ? T.red : T.green, marginTop: 1 }}>
                                  {fmt(actual)} act
                                </div>
                              )}
                            </td>
                          );
                        })}
                        <td style={{
                          textAlign: "right", padding: "9px 12px", borderBottom: `1px solid ${T.border}`,
                          fontFamily: "ui-monospace, monospace", fontSize: 12, fontWeight: 700,
                        }}>
                          {fmt(MONTHS.reduce((s,_,i) => s + (Number(catBudgets[cat.id]?.[periodKey(i, year)]) || 0), 0))}
                        </td>
                      </tr>

                      {/* GL codes */}
                      {isExp && glsInCat.map(gl => {
                        const glExp = expandedGLs[gl.id];
                        const overSome = MONTHS.some((_,i) => isGLOverBudget(gl.id, i));
                        // Aggregate vendor names from BOTH planned and actual for this GL
                        const allVendors = new Set();
                        Object.values(vendorPlans[gl.id] || {}).forEach(periodMap => Object.keys(periodMap).forEach(v => allVendors.add(v)));
                        Object.values(actuals[gl.code] || {}).forEach(periodMap => Object.keys(periodMap).forEach(v => allVendors.add(v)));
                        const vendorList = Array.from(allVendors).sort();
                        return (
                          <Fragment key={gl.id}>
                            <tr onClick={() => setExpandedGLs(p => ({ ...p, [gl.id]: !p[gl.id] }))} style={{
                              cursor: "pointer", background: overSome ? T.redDim + "88" : "transparent",
                            }}>
                              <td style={{
                                padding: "7px 12px 7px 32px", position: "sticky", left: 0,
                                background: overSome ? T.redDim + "88" : T.bg, zIndex: 10,
                                borderBottom: `1px solid ${T.border}`,
                              }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <span style={{ fontSize: 8, color: T.text2, transform: glExp ? "rotate(90deg)" : "none", transition: "transform .12s" }}>▶</span>
                                  <span style={{ fontSize: 10, color: T.text3, fontFamily: "ui-monospace, monospace", minWidth: 42 }}>{gl.code}</span>
                                  <span style={{ fontSize: 12 }}>{gl.name}</span>
                                  {overSome && <span style={{ fontSize: 9, color: T.red, fontWeight: 700 }}>⚠</span>}
                                  <span style={{ fontSize: 10, color: T.text3 }}>({vendorList.length} vendors)</span>
                                </div>
                              </td>
                              <td style={{ textAlign: "center", fontSize: 9, color: T.yellow, borderBottom: `1px solid ${T.border}` }}>GL</td>
                              {visibleMonths.map(([label, start, end]) => {
                                const months = Array.from({length: end-start+1}, (_,k) => start+k);
                                const budget = months.reduce((s,m) => s + (Number(glBudgets[gl.id]?.[periodKey(m, year)]) || 0), 0);
                                const actual = months.reduce((s,m) => s + getActualVendorTotal(gl.code, m), 0);
                                const planned = months.reduce((s,m) => s + getVendorPlanTotal(gl.id, m), 0);
                                const overBudget = months.some(m => isGLOverBudget(gl.id, m));
                                const singleMonth = months.length === 1 ? months[0] : null;
                                return (
                                  <td key={label} onClick={e => e.stopPropagation()} style={{
                                    textAlign: "right", padding: "6px 6px", borderBottom: `1px solid ${T.border}`,
                                  }}>
                                    {singleMonth !== null ? (
                                      <EditableCell
                                        value={budget}
                                        onSave={(v) => saveGLBudget(gl.id, singleMonth, v)}
                                        isOver={overBudget}
                                      />
                                    ) : (
                                      <div style={{
                                        fontFamily: "ui-monospace, monospace", fontSize: 11,
                                        color: overBudget ? T.red : T.text, padding: "3px 6px",
                                      }}>{fmt(budget)}</div>
                                    )}
                                    {actual > 0 && (
                                      <div style={{ fontSize: 9, color: actual > budget && budget > 0 ? T.red : T.green }}>
                                        {fmt(actual)} act
                                      </div>
                                    )}
                                    {planned > 0 && (
                                      <div style={{ fontSize: 9, color: overBudget ? T.red : T.purple }}>
                                        {fmt(planned)} plan
                                      </div>
                                    )}
                                  </td>
                                );
                              })}
                              <td style={{
                                textAlign: "right", padding: "7px 12px", borderBottom: `1px solid ${T.border}`,
                                fontFamily: "ui-monospace, monospace", fontSize: 11, fontWeight: 600,
                              }}>
                                {fmt(MONTHS.reduce((s,_,i) => s + (Number(glBudgets[gl.id]?.[periodKey(i, year)]) || 0), 0))}
                              </td>
                            </tr>

                            {/* Vendor rows */}
                            {glExp && vendorList.map(vendor => (
                              <VendorRow
                                key={`${gl.id}-${vendor}`}
                                vendor={vendor}
                                glId={gl.id}
                                glCode={gl.code}
                                year={year}
                                vendorPlans={vendorPlans}
                                actuals={{ [gl.id]: actuals[gl.code] || {} }}
                                savePlan={saveVendorPlan}
                                deletePlan={deleteVendorPlan}
                                visibleMonths={visibleMonths}
                              />
                            ))}

                            {/* Add vendor row */}
                            {glExp && (
                              <tr>
                                <td colSpan={visibleMonths.length + 3} style={{
                                  padding: "5px 12px 5px 64px", borderBottom: `1px solid ${T.border}`,
                                }}>
                                  {showAddVendor?.glId === gl.id ? (
                                    <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                                      <input placeholder="Vendor name" value={newVendorName} autoFocus
                                        onChange={e => setNewVendorName(e.target.value)}
                                        style={{
                                          background: T.surface2, border: `1px solid ${T.border}`, color: T.text,
                                          padding: "4px 8px", borderRadius: 4, fontSize: 11, width: 180,
                                        }} />
                                      <select value={showAddVendor.month} onChange={e => setShowAddVendor(p => ({ ...p, month: Number(e.target.value) }))}
                                        style={{
                                          background: T.surface2, border: `1px solid ${T.border}`, color: T.text,
                                          padding: "4px 8px", borderRadius: 4, fontSize: 11,
                                        }}>
                                        {MONTHS.map((m,i) => <option key={i} value={i}>{m} {year}</option>)}
                                      </select>
                                      <input placeholder="Amount" type="number" value={newVendorAmount}
                                        onChange={e => setNewVendorAmount(e.target.value)}
                                        style={{
                                          background: T.surface2, border: `1px solid ${T.border}`, color: T.text,
                                          padding: "4px 8px", borderRadius: 4, fontSize: 11, width: 100,
                                        }} />
                                      <button onClick={() => addVendorToGL(gl.id, newVendorName, showAddVendor.month, newVendorAmount)}
                                        style={{
                                          background: T.accent, color: "#fff", border: "none",
                                          padding: "4px 12px", borderRadius: 4, fontSize: 11, cursor: "pointer", fontWeight: 600,
                                        }}>Add</button>
                                      <button onClick={() => { setShowAddVendor(null); setNewVendorName(""); setNewVendorAmount(""); }}
                                        style={{
                                          background: "none", color: T.text2, border: `1px solid ${T.border}`,
                                          padding: "4px 10px", borderRadius: 4, fontSize: 11, cursor: "pointer",
                                        }}>Cancel</button>
                                    </div>
                                  ) : (
                                    <button onClick={() => setShowAddVendor({ glId: gl.id, month: 0 })}
                                      style={{
                                        background: "none", border: "none", color: T.accent,
                                        fontSize: 11, cursor: "pointer", padding: 0,
                                      }}>+ Plan vendor spend</button>
                                  )}
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          <div style={{
            padding: "10px 24px", borderTop: `1px solid ${T.border}`,
            display: "flex", gap: 18, fontSize: 10, color: T.text2, flexShrink: 0, background: T.surface,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: T.green }} /> QBO Actual
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: T.purple }} /> Planned
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 7, height: 7, borderRadius: 2, background: T.red }} /> Over Budget
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ borderBottom: `1px dashed ${T.border2}`, width: 16, display: "inline-block" }} /> Click to edit
            </div>
          </div>
        </>
      )}

      {/* ─── PEOPLE TAB (owner-only) ─── */}
      {activeTab === "people" && isOwner && (
        <div style={{ padding: 20, overflow: "auto", flex: 1 }}>
          <div style={{
            background: T.redDim, border: `1px solid ${T.red}33`,
            borderRadius: 8, padding: "10px 14px", marginBottom: 16,
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <span style={{ fontSize: 16 }}>🔒</span>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.red }}>Confidential — Owner Access Only</div>
              <div style={{ fontSize: 10, color: T.text2 }}>Restricted by RLS to plan owners.</div>
            </div>
          </div>

          <PeopleSection
            activePlan={activePlan}
            people={people}
            setPeople={setPeople}
            glCodes={glCodes.filter(g => {
              const cat = categories.find(c => c.id === g.budget_category_id);
              return cat && cat.name.toLowerCase().includes("people");
            })}
          />
        </div>
      )}

      {/* ─── SETTINGS TAB ─── */}
      {activeTab === "settings" && (
        <div style={{ padding: 24, overflow: "auto", flex: 1, maxWidth: 700 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Plan Access</h3>
          <div style={{ fontSize: 11, color: T.text2, marginBottom: 12 }}>
            Only people listed below can view this plan. Owner-level access is required for the People & Salaries tab.
          </div>
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: `1px solid ${T.border}` }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600 }}>{profile?.display_name || user?.email}</div>
                <div style={{ fontSize: 10, color: T.text2 }}>{user?.email}</div>
              </div>
              <span style={{ background: T.accentDim, color: T.accent, fontSize: 10, padding: "2px 8px", borderRadius: 4, fontWeight: 600 }}>OWNER</span>
            </div>
            {planAccess.map(a => (
              <div key={a.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderBottom: `1px solid ${T.border}` }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{a.profile?.display_name || a.profile?.email}</div>
                  <div style={{ fontSize: 10, color: T.text2 }}>{a.profile?.email}</div>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span style={{
                    background: a.role === "owner" ? T.accentDim : a.role === "editor" ? T.greenDim : T.surface2,
                    color: a.role === "owner" ? T.accent : a.role === "editor" ? T.green : T.text2,
                    fontSize: 10, padding: "2px 8px", borderRadius: 4, fontWeight: 600, textTransform: "uppercase",
                  }}>{a.role}</span>
                  {isOwner && (
                    <button onClick={() => removeAccess(a.id)} style={{
                      background: "none", border: "none", color: T.red, cursor: "pointer", fontSize: 11,
                    }}>Remove</button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {isOwner && (
            <button onClick={() => setShowShare(true)} style={{
              background: "none", border: `1px dashed ${T.border}`, color: T.accent,
              padding: "8px 16px", borderRadius: 6, fontSize: 12, cursor: "pointer",
            }}>+ Share with team member</button>
          )}

          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, marginTop: 28 }}>Plan Status</h3>
          <div style={{ display: "flex", gap: 6 }}>
            {["draft","active","locked","archived"].map(s => (
              <button key={s} disabled={!isOwner} onClick={async () => {
                await supabase.from("budget_plans").update({ status: s }).eq("id", activePlan.id);
                setActivePlan({ ...activePlan, status: s });
              }} style={{
                background: activePlan?.status === s ? T.accentDim : T.surface,
                color: activePlan?.status === s ? T.accent : T.text2,
                border: `1px solid ${activePlan?.status === s ? T.accent : T.border}`,
                padding: "6px 16px", borderRadius: 6, fontSize: 11, cursor: isOwner ? "pointer" : "not-allowed",
                fontWeight: 600, textTransform: "uppercase", opacity: isOwner ? 1 : 0.5,
              }}>{s}</button>
            ))}
          </div>

          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12, marginTop: 28 }}>Data Sources</h3>
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: 14 }}>
            {[
              { label: "QBO P&L Monthly", status: `${Object.keys(glMonthlyTotals).length} GL accounts · Jan–${MONTHS[monthsElapsed - 1] || "–"} ${year}`, color: T.green },
              { label: "QBO Bills (Vendor Detail)", status: `${Object.keys(actuals).length} GL codes with vendors`, color: T.green },
              { label: "Last Synced", status: lastSynced ? lastSynced.toLocaleString() : "Not synced yet", color: lastSynced ? T.green : T.yellow },
              { label: "GL Categories (Helm)", status: `${categories.length} categories`, color: T.accent },
              { label: "GL Codes (Helm)", status: `${glCodes.length} active codes`, color: T.accent },
            ].map((d,i) => (
              <div key={i} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "7px 0", borderBottom: i < 2 ? `1px solid ${T.border}` : "none",
              }}>
                <span style={{ fontSize: 12 }}>{d.label}</span>
                <span style={{ fontSize: 10, color: d.color }}>{d.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Share modal ─── */}
      {showShare && (
        <div onClick={() => setShowShare(false)} style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", zIndex: 200,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10,
            padding: 20, width: 460, maxHeight: "80vh", overflow: "auto",
          }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Share "{activePlan?.name}"</div>
            <div style={{ fontSize: 11, color: T.text2, marginBottom: 16 }}>
              Choose people from your org to grant access. Owner role can see People & Salaries.
            </div>
            <div style={{ maxHeight: 320, overflow: "auto" }}>
              {orgMembers.filter(m => m.user_id !== user?.id && !planAccess.some(a => a.user_id === m.user_id)).map(m => (
                <div key={m.user_id} style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  padding: "8px 10px", borderBottom: `1px solid ${T.border}`,
                }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{m.profiles?.display_name || m.profiles?.email}</div>
                    <div style={{ fontSize: 10, color: T.text2 }}>{m.profiles?.email}</div>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    {["viewer","editor","owner"].map(r => (
                      <button key={r} onClick={() => shareWithUser(m.user_id, r)} style={{
                        background: T.surface2, border: `1px solid ${T.border}`, color: T.text2,
                        padding: "3px 8px", borderRadius: 4, fontSize: 10, cursor: "pointer", fontWeight: 600,
                      }}>{r}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setShowShare(false)} style={{
              background: T.surface2, color: T.text, border: `1px solid ${T.border}`,
              padding: "8px 14px", borderRadius: 6, fontSize: 12, marginTop: 12, cursor: "pointer", width: "100%",
            }}>Done</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// PeopleSection — confidential salary planning
// ─────────────────────────────────────────────────────────────────────────────
function PeopleSection({ activePlan, people, setPeople, glCodes }) {
  const [editing, setEditing] = useState(null); // person id being edited
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ employee_name: "", role_title: "", department: "", gl_code_id: "", base_salary: "", benefits: "", bonus: "", payroll_tax: "" });

  // Aggregate by employee (sum across months)
  const byEmployee = useMemo(() => {
    const map = {};
    people.forEach(p => {
      if (!map[p.employee_name]) {
        map[p.employee_name] = { ...p, months: 0, total_base: 0, total_benefits: 0, total_bonus: 0, total_tax: 0 };
      }
      map[p.employee_name].months += 1;
      map[p.employee_name].total_base += Number(p.base_salary);
      map[p.employee_name].total_benefits += Number(p.benefits);
      map[p.employee_name].total_bonus += Number(p.bonus);
      map[p.employee_name].total_tax += Number(p.payroll_tax);
    });
    return Object.values(map);
  }, [people]);

  const addEmployee = async () => {
    if (!form.employee_name || !form.gl_code_id) { alert("Name and GL code required"); return; }
    const rows = Array.from({length: 12}, (_,i) => ({
      plan_id: activePlan.id,
      employee_name: form.employee_name,
      role_title: form.role_title,
      department: form.department,
      gl_code_id: form.gl_code_id,
      month: i+1,
      base_salary: Number(form.base_salary) || 0,
      benefits: Number(form.benefits) || 0,
      bonus: Number(form.bonus) || 0,
      payroll_tax: Number(form.payroll_tax) || 0,
    }));
    const { data } = await supabase.from("budget_plan_people").insert(rows).select();
    if (data) setPeople(p => [...p, ...data]);
    setShowAdd(false);
    setForm({ employee_name: "", role_title: "", department: "", gl_code_id: "", base_salary: "", benefits: "", bonus: "", payroll_tax: "" });
  };

  const deleteEmployee = async (name) => {
    if (!confirm(`Delete ${name} from plan?`)) return;
    await supabase.from("budget_plan_people").delete().eq("plan_id", activePlan.id).eq("employee_name", name);
    setPeople(p => p.filter(x => x.employee_name !== name));
  };

  return (
    <>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            {["Employee","Title","Dept","GL Code","Base/mo","Benefits/mo","Bonus/mo","Tax/mo","Total/mo","Annual",""].map(h => (
              <th key={h} style={{
                textAlign: ["Base/mo","Benefits/mo","Bonus/mo","Tax/mo","Total/mo","Annual"].includes(h) ? "right" : "left",
                padding: "9px 10px", fontSize: 10, color: T.text2,
                textTransform: "uppercase", letterSpacing: "0.05em",
                borderBottom: `1px solid ${T.border}`,
              }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {byEmployee.map(emp => {
            const monthly = (emp.total_base + emp.total_benefits + emp.total_bonus + emp.total_tax) / Math.max(emp.months, 1);
            const annual = emp.total_base + emp.total_benefits + emp.total_bonus + emp.total_tax;
            const gl = glCodes.find(g => g.id === emp.gl_code_id);
            return (
              <tr key={emp.employee_name} style={{ borderBottom: `1px solid ${T.border}` }}>
                <td style={{ padding: "9px 10px", fontSize: 12, fontWeight: 500 }}>{emp.employee_name}</td>
                <td style={{ padding: "9px 10px", fontSize: 11, color: T.text2 }}>{emp.role_title}</td>
                <td style={{ padding: "9px 10px", fontSize: 11, color: T.text2 }}>{emp.department}</td>
                <td style={{ padding: "9px 10px", fontSize: 10, fontFamily: "ui-monospace, monospace", color: T.text3 }}>
                  {gl?.code} {gl?.name}
                </td>
                <td style={{ textAlign: "right", padding: "9px 10px", fontSize: 11, fontFamily: "ui-monospace, monospace" }}>{fmtFull(emp.total_base / Math.max(emp.months,1))}</td>
                <td style={{ textAlign: "right", padding: "9px 10px", fontSize: 11, fontFamily: "ui-monospace, monospace" }}>{fmtFull(emp.total_benefits / Math.max(emp.months,1))}</td>
                <td style={{ textAlign: "right", padding: "9px 10px", fontSize: 11, fontFamily: "ui-monospace, monospace" }}>{fmtFull(emp.total_bonus / Math.max(emp.months,1))}</td>
                <td style={{ textAlign: "right", padding: "9px 10px", fontSize: 11, fontFamily: "ui-monospace, monospace" }}>{fmtFull(emp.total_tax / Math.max(emp.months,1))}</td>
                <td style={{ textAlign: "right", padding: "9px 10px", fontSize: 12, fontWeight: 700, fontFamily: "ui-monospace, monospace", color: T.accent }}>{fmtFull(monthly)}</td>
                <td style={{ textAlign: "right", padding: "9px 10px", fontSize: 12, fontWeight: 700, fontFamily: "ui-monospace, monospace", color: T.yellow }}>{fmtFull(annual)}</td>
                <td>
                  <button onClick={() => deleteEmployee(emp.employee_name)} style={{
                    background: "none", border: "none", color: T.red, cursor: "pointer", fontSize: 11,
                  }}>✕</button>
                </td>
              </tr>
            );
          })}
          {byEmployee.length > 0 && (
            <tr style={{ background: T.surface }}>
              <td colSpan={4} style={{ padding: "11px 10px", fontWeight: 700, fontSize: 12, borderTop: `2px solid ${T.border}` }}>
                TOTAL ({byEmployee.length} employees)
              </td>
              {[
                byEmployee.reduce((s,p) => s + p.total_base / Math.max(p.months,1), 0),
                byEmployee.reduce((s,p) => s + p.total_benefits / Math.max(p.months,1), 0),
                byEmployee.reduce((s,p) => s + p.total_bonus / Math.max(p.months,1), 0),
                byEmployee.reduce((s,p) => s + p.total_tax / Math.max(p.months,1), 0),
              ].map((v,i) => (
                <td key={i} style={{ textAlign: "right", padding: "11px 10px", fontSize: 12, fontWeight: 700, fontFamily: "ui-monospace, monospace", borderTop: `2px solid ${T.border}` }}>{fmtFull(v)}</td>
              ))}
              <td style={{ textAlign: "right", padding: "11px 10px", fontSize: 13, fontWeight: 800, color: T.accent, fontFamily: "ui-monospace, monospace", borderTop: `2px solid ${T.border}` }}>
                {fmtFull(byEmployee.reduce((s,p) => s + (p.total_base + p.total_benefits + p.total_bonus + p.total_tax) / Math.max(p.months,1), 0))}
              </td>
              <td style={{ textAlign: "right", padding: "11px 10px", fontSize: 13, fontWeight: 800, color: T.yellow, fontFamily: "ui-monospace, monospace", borderTop: `2px solid ${T.border}` }}>
                {fmtFull(byEmployee.reduce((s,p) => s + p.total_base + p.total_benefits + p.total_bonus + p.total_tax, 0))}
              </td>
              <td style={{ borderTop: `2px solid ${T.border}` }} />
            </tr>
          )}
        </tbody>
      </table>

      {showAdd ? (
        <div style={{
          marginTop: 16, background: T.surface, border: `1px solid ${T.border}`,
          borderRadius: 8, padding: 14,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 10 }}>Add Employee (applies to all 12 months)</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 8 }}>
            <input placeholder="Name *" value={form.employee_name} onChange={e => setForm({...form, employee_name: e.target.value})}
              style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text, padding: "6px 10px", borderRadius: 4, fontSize: 12 }} />
            <input placeholder="Title" value={form.role_title} onChange={e => setForm({...form, role_title: e.target.value})}
              style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text, padding: "6px 10px", borderRadius: 4, fontSize: 12 }} />
            <input placeholder="Department" value={form.department} onChange={e => setForm({...form, department: e.target.value})}
              style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text, padding: "6px 10px", borderRadius: 4, fontSize: 12 }} />
          </div>
          <select value={form.gl_code_id} onChange={e => setForm({...form, gl_code_id: e.target.value})}
            style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text, padding: "6px 10px", borderRadius: 4, fontSize: 12, width: "100%", marginBottom: 8 }}>
            <option value="">— Select Salary GL Code —</option>
            {glCodes.map(g => <option key={g.id} value={g.id}>{g.code} — {g.name}</option>)}
          </select>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 10 }}>
            <input placeholder="Base/mo" type="number" value={form.base_salary} onChange={e => setForm({...form, base_salary: e.target.value})}
              style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text, padding: "6px 10px", borderRadius: 4, fontSize: 12 }} />
            <input placeholder="Benefits/mo" type="number" value={form.benefits} onChange={e => setForm({...form, benefits: e.target.value})}
              style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text, padding: "6px 10px", borderRadius: 4, fontSize: 12 }} />
            <input placeholder="Bonus/mo" type="number" value={form.bonus} onChange={e => setForm({...form, bonus: e.target.value})}
              style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text, padding: "6px 10px", borderRadius: 4, fontSize: 12 }} />
            <input placeholder="Tax/mo" type="number" value={form.payroll_tax} onChange={e => setForm({...form, payroll_tax: e.target.value})}
              style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text, padding: "6px 10px", borderRadius: 4, fontSize: 12 }} />
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button onClick={addEmployee} style={{
              background: T.accent, color: "#fff", border: "none", padding: "7px 16px",
              borderRadius: 4, fontSize: 12, fontWeight: 600, cursor: "pointer",
            }}>Add Employee</button>
            <button onClick={() => setShowAdd(false)} style={{
              background: "none", color: T.text2, border: `1px solid ${T.border}`,
              padding: "7px 14px", borderRadius: 4, fontSize: 12, cursor: "pointer",
            }}>Cancel</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)} style={{
          marginTop: 14, background: "none", border: `1px dashed ${T.border}`,
          color: T.accent, padding: "9px 18px", borderRadius: 6, fontSize: 12, cursor: "pointer", width: "100%",
        }}>+ Add Employee</button>
      )}
    </>
  );
}
