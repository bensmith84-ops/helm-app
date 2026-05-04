// Compute a budget snapshot for the GL category that contains a given GL code.
// Returns { categoryId, categoryName, monthBudget, monthActual, monthApproved,
//           monthRemaining, ytdBudget, ytdActual, ytdRemaining, hasPlan }.
//
// Used by the approval flow so reviewers can see "if I approve this, do we
// still have budget room in the parent bucket?". Cheap enough to call per
// request (3 small queries) — does not paginate.

import { supabase } from "./supabase";

/**
 * @param {Object} args
 * @param {string} args.glCode      The af_gl_codes.code on the request
 * @param {string} args.orgId       Active org id
 * @param {string} [args.atDate]    ISO date the request is FOR (defaults to today)
 * @param {string} [args.requestId] Exclude this request when summing approved
 *                                  (so the reviewer's view of "already approved"
 *                                  doesn't double-count the request being reviewed)
 */
export async function getBudgetSnapshot({ glCode, orgId, atDate, requestId }) {
  const ref = atDate ? new Date(atDate) : new Date();
  const year = ref.getUTCFullYear();
  const month = ref.getUTCMonth(); // 0-indexed for BudgetPlanner convention
  // BudgetPlanner stores month as 0-indexed integer; QBO/fin tables use period like "YYYY-MM" 1-indexed.
  const periodKey = `${year}-${String(month + 1).padStart(2, "0")}`;
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

  // 2. Find the active plan for this fiscal year
  const { data: plans } = await supabase
    .from("budget_plans").select("id, status")
    .eq("org_id", orgId).eq("fiscal_year", year)
    .order("updated_at", { ascending: false }).limit(5);
  // Prefer 'active' status, else most recent
  const plan = (plans || []).find(p => p.status === "active") || (plans || [])[0];
  if (!plan) {
    return { hasPlan: false, categoryId, categoryName, reason: "no_plan" };
  }

  // 3. Pull category-level monthly budgets for this plan + category
  const { data: catBudgets } = await supabase
    .from("budget_plan_categories")
    .select("month, budget_amount")
    .eq("plan_id", plan.id).eq("category_id", categoryId);
  let monthBudget = (catBudgets || []).find(b => b.month === month)?.budget_amount || 0;
  let ytdBudget = (catBudgets || []).filter(b => b.month <= month).reduce((s, b) => s + Number(b.budget_amount || 0), 0);

  // 4. Pull all GL codes in this category (so we can sum actuals for the whole bucket)
  const { data: codesInCat } = await supabase
    .from("af_gl_codes").select("id, code")
    .eq("org_id", orgId).eq("budget_category_id", categoryId);
  const codes = (codesInCat || []).map(c => c.code).filter(Boolean);
  const codeIds = (codesInCat || []).map(c => c.id).filter(Boolean);

  // 4b. If no category-level budget rows, roll up GL-level rows. Common case
  // when the budget was entered at the GL line rather than the category total.
  if (monthBudget === 0 && ytdBudget === 0 && codeIds.length) {
    const { data: glBudgets } = await supabase
      .from("budget_plan_gl")
      .select("month, budget_amount")
      .eq("plan_id", plan.id)
      .in("gl_code_id", codeIds);
    monthBudget = (glBudgets || []).filter(b => b.month === month).reduce((s, b) => s + Number(b.budget_amount || 0), 0);
    ytdBudget = (glBudgets || []).filter(b => b.month <= month).reduce((s, b) => s + Number(b.budget_amount || 0), 0);
  }

  // 5. Actuals from fin_vendor_spend for these GL codes
  let monthActual = 0;
  let ytdActual = 0;
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
  let approvedThisMonth = 0;
  let approvedYtd = 0;
  if (codes.length) {
    let q = supabase.from("af_requests")
      .select("amount, date, status, id")
      .eq("status", "approved")
      .in("gl_code", codes)
      .gte("date", yearStart).lt("date", nextYearStart);
    const { data: approvedReqs } = await q;
    for (const r of (approvedReqs || [])) {
      if (requestId && r.id === requestId) continue; // don't count the in-review request
      const amt = Number(r.amount || 0);
      approvedYtd += amt;
      const d = r.date ? new Date(r.date) : null;
      if (d && d.getUTCFullYear() === year && d.getUTCMonth() === month) approvedThisMonth += amt;
    }
  }

  const monthSpentTotal = monthActual + approvedThisMonth;
  const ytdSpentTotal = ytdActual + approvedYtd;

  return {
    hasPlan: true,
    categoryId, categoryName,
    monthBudget, monthActual, monthApproved: approvedThisMonth, monthSpent: monthSpentTotal,
    monthRemaining: monthBudget - monthSpentTotal,
    monthPct: monthBudget > 0 ? (monthSpentTotal / monthBudget) : null,
    ytdBudget, ytdActual, ytdApproved: approvedYtd, ytdSpent: ytdSpentTotal,
    ytdRemaining: ytdBudget - ytdSpentTotal,
    ytdPct: ytdBudget > 0 ? (ytdSpentTotal / ytdBudget) : null,
  };
}

/** Format helper used by callers — short money string, no decimals for >=$1K */
export function fmtMoney(n) {
  if (n == null) return "$0";
  const v = Number(n);
  if (Math.abs(v) >= 1000) return `$${Math.round(v).toLocaleString()}`;
  return `$${v.toFixed(0)}`;
}

/** Build a 10-char ASCII bar like ██████░░░░ for a 0..1+ percentage. */
export function asciiBar(pct, width = 10) {
  if (pct == null) return "";
  const clamped = Math.max(0, Math.min(1, pct));
  const filled = Math.round(clamped * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}
