// Compute a budget snapshot for the GL category that contains a given GL code.
// Returns { hasPlan, categoryName, monthBudget, monthSpent, monthRemaining,
//           ytdBudget, ytdSpent, ytdRemaining, ... }.
//
// Data sources (Earth Breeze, FY26):
//   - Resolution:     af_gl_codes.budget_category_id → af_gl_categories.name
//   - Budget:         af_monthly_budgets joined to af_budget_versions where
//                     is_default = true. (af_monthly_budgets uses 1-indexed
//                     month, year as integer, category_id as text.)
//   - Actuals:        fin_vendor_spend with budget_or_actual = 'Actual',
//                     period like 'YYYY-MM'.
//   - In-flight:      af_requests with status = 'approved', date in year.
//
// The legacy budget_plans / budget_plan_gl / budget_plan_categories tables
// are queried as a fallback in case af_monthly_budgets is empty.

import { supabase } from "./supabase";

/**
 * @param {Object} args
 * @param {string} args.glCode      The af_gl_codes.code on the request
 * @param {string} args.orgId       Active org id
 * @param {string} [args.atDate]    ISO date the request is FOR (defaults to today)
 * @param {string} [args.requestId] Exclude this request when summing approved
 */
export async function getBudgetSnapshot({ glCode, orgId, atDate, requestId }) {
  const ref = atDate ? new Date(atDate) : new Date();
  const year = ref.getUTCFullYear();
  const month0 = ref.getUTCMonth();           // 0-indexed (0=Jan)
  const month1 = month0 + 1;                  // 1-indexed (1=Jan) — af_monthly_budgets convention
  const periodKey = `${year}-${String(month1).padStart(2, "0")}`;
  const yearStart = `${year}-01-01`;
  const nextYearStart = `${year + 1}-01-01`;

  // 1. Resolve GL → category
  const { data: glRow } = await supabase
    .from("af_gl_codes").select("id, code, name, budget_category_id")
    .eq("org_id", orgId).eq("code", glCode).maybeSingle();
  if (!glRow?.budget_category_id) {
    return { hasPlan: false, reason: "no_gl_or_category" };
  }
  const categoryId = glRow.budget_category_id;

  const { data: catRow } = await supabase
    .from("af_gl_categories").select("id, name").eq("id", categoryId).maybeSingle();
  const categoryName = catRow?.name || "Uncategorized";

  // 2. Find the default budget version for this org
  const { data: defaultVersion } = await supabase
    .from("af_budget_versions").select("id, name")
    .eq("org_id", orgId).eq("is_default", true)
    .order("saved_at", { ascending: false }).limit(1).maybeSingle();

  // 3. Monthly + YTD budget for this category, from af_monthly_budgets
  let monthBudget = 0, ytdBudget = 0, sourceUsed = null;
  if (defaultVersion?.id) {
    const { data: amb } = await supabase
      .from("af_monthly_budgets")
      .select("month, amount")
      .eq("budget_version_id", defaultVersion.id)
      .eq("category_id", categoryId)
      .eq("year", year);
    if ((amb || []).length) {
      monthBudget = Number((amb || []).find(r => r.month === month1)?.amount || 0);
      ytdBudget = (amb || []).filter(r => r.month <= month1).reduce((s, r) => s + Number(r.amount || 0), 0);
      sourceUsed = "af_monthly_budgets";
    }
  }

  // 3b. Fallback: legacy budget_plans / budget_plan_categories / budget_plan_gl
  // (used if no af_monthly_budgets data — kept so newer plans still surface).
  if (!sourceUsed) {
    const { data: plans } = await supabase
      .from("budget_plans").select("id, status")
      .eq("org_id", orgId).eq("fiscal_year", year)
      .order("updated_at", { ascending: false }).limit(5);
    const plan = (plans || []).find(p => p.status === "active") || (plans || [])[0];
    if (plan) {
      const { data: catBudgets } = await supabase
        .from("budget_plan_categories")
        .select("month, budget_amount")
        .eq("plan_id", plan.id).eq("category_id", categoryId);
      const cb = (catBudgets || []);
      if (cb.length) {
        monthBudget = Number(cb.find(b => b.month === month0)?.budget_amount || 0);
        ytdBudget = cb.filter(b => b.month <= month0).reduce((s, b) => s + Number(b.budget_amount || 0), 0);
        sourceUsed = "budget_plan_categories";
      } else {
        // Try GL-level rollup within the category
        const { data: codesInCat } = await supabase
          .from("af_gl_codes").select("id, code")
          .eq("org_id", orgId).eq("budget_category_id", categoryId);
        const codeIds = (codesInCat || []).map(c => c.id).filter(Boolean);
        if (codeIds.length) {
          const { data: glBudgets } = await supabase
            .from("budget_plan_gl")
            .select("month, budget_amount")
            .eq("plan_id", plan.id)
            .in("gl_code_id", codeIds);
          if ((glBudgets || []).length) {
            monthBudget = (glBudgets || []).filter(b => b.month === month0).reduce((s, b) => s + Number(b.budget_amount || 0), 0);
            ytdBudget = (glBudgets || []).filter(b => b.month <= month0).reduce((s, b) => s + Number(b.budget_amount || 0), 0);
            sourceUsed = "budget_plan_gl";
          }
        }
      }
    }
  }

  // 4. Look up all GL codes in this category (for actuals + approved request rollup)
  const { data: codesInCat2 } = await supabase
    .from("af_gl_codes").select("code")
    .eq("org_id", orgId).eq("budget_category_id", categoryId);
  const codes = (codesInCat2 || []).map(c => c.code).filter(Boolean);

  // 5. Actuals from fin_vendor_spend for these GL codes
  let monthActual = 0, ytdActual = 0;
  if (codes.length) {
    const { data: spend } = await supabase
      .from("fin_vendor_spend")
      .select("gl_account, amount, period")
      .eq("org_id", orgId).eq("budget_or_actual", "Actual")
      .in("gl_account", codes)
      .gte("period", `${year}-01`).lte("period", `${year}-12`);
    for (const r of (spend || [])) {
      const amt = Number(r.amount || 0);
      ytdActual += amt;
      if (r.period === periodKey) monthActual += amt;
    }
  }

  // 6. Already-approved spend requests this month / ytd in same category
  let approvedThisMonth = 0, approvedYtd = 0;
  if (codes.length) {
    const { data: approvedReqs } = await supabase
      .from("af_requests")
      .select("amount, date, status, id")
      .eq("status", "approved")
      .in("gl_code", codes)
      .gte("date", yearStart).lt("date", nextYearStart);
    for (const r of (approvedReqs || [])) {
      if (requestId && r.id === requestId) continue; // exclude the in-review request
      const amt = Number(r.amount || 0);
      approvedYtd += amt;
      const d = r.date ? new Date(r.date) : null;
      if (d && d.getUTCFullYear() === year && d.getUTCMonth() === month0) approvedThisMonth += amt;
    }
  }

  const monthSpent = monthActual + approvedThisMonth;
  const ytdSpent = ytdActual + approvedYtd;
  const hasBudget = monthBudget > 0 || ytdBudget > 0;

  // hasPlan is true if we have either a budget OR actuals for the category — that
  // way the approver still sees actuals even when no budget has been entered.
  return {
    hasPlan: hasBudget || ytdSpent > 0,
    hasBudget,
    sourceUsed,
    categoryId, categoryName,
    monthBudget, monthActual, monthApproved: approvedThisMonth, monthSpent,
    monthRemaining: monthBudget - monthSpent,
    monthPct: monthBudget > 0 ? (monthSpent / monthBudget) : null,
    ytdBudget, ytdActual, ytdApproved: approvedYtd, ytdSpent,
    ytdRemaining: ytdBudget - ytdSpent,
    ytdPct: ytdBudget > 0 ? (ytdSpent / ytdBudget) : null,
  };
}

/** Format helper used by callers — short money string */
export function fmtMoney(n) {
  if (n == null) return "$0";
  const v = Number(n);
  if (Math.abs(v) >= 1000) return `$${Math.round(v).toLocaleString()}`;
  return `$${v.toFixed(0)}`;
}
