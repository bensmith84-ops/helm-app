"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { T } from "../tokens";

const TABS = ["Dashboard", "Forecast", "Chart of Accounts", "Expenses", "Budgets", "Purchase Orders", "Invoices", "Vendors", "Import"];
const CURR = "$";
const fmt = (n) => n != null ? CURR + Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "$0.00";
const fmtK = (n) => { const v = Number(n) || 0; return v >= 1000000 ? CURR + (v/1000000).toFixed(1) + "M" : v >= 1000 ? CURR + (v/1000).toFixed(1) + "K" : fmt(v); };
const pct = (a, b) => b > 0 ? Math.round((a / b) * 100) : 0;
const _lbl = { fontSize: 12, fontWeight: 500, color: T.text3, display: "block", marginBottom: 4 };
const _inp = { width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
const _sel = { ..._inp, cursor: "pointer" };
const _btn = { padding: "8px 16px", borderRadius: 6, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer" };
const _pill = (bg, fg) => ({ display: "inline-flex", padding: "3px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600, background: bg, color: fg });

const STATUS_COLORS = {
  draft: { bg: T.surface3, fg: T.text3 },
  active: { bg: T.greenDim || "#dcfce7", fg: T.green || "#22c55e" },
  pending_approval: { bg: "#fef3c7", fg: "#d97706" },
  submitted: { bg: "#fef3c7", fg: "#d97706" },
  approved: { bg: T.greenDim || "#dcfce7", fg: T.green || "#22c55e" },
  rejected: { bg: T.redDim || "#fecaca", fg: T.red || "#ef4444" },
  paid: { bg: "#dbeafe", fg: "#3b82f6" },
  partially_paid: { bg: "#e0e7ff", fg: "#6366f1" },
  received: { bg: "#f3e8ff", fg: "#a855f7" },
  overdue: { bg: T.redDim || "#fecaca", fg: T.red || "#ef4444" },
  closed: { bg: T.surface3, fg: T.text3 },
  cancelled: { bg: T.surface3, fg: T.text3 },
  frozen: { bg: "#e0e7ff", fg: "#6366f1" },
  under_review: { bg: "#fef3c7", fg: "#d97706" },
  scheduled: { bg: "#dbeafe", fg: "#3b82f6" },
  disputed: { bg: T.redDim || "#fecaca", fg: T.red || "#ef4444" },
  void: { bg: T.surface3, fg: T.text3 },
  returned: { bg: "#fef3c7", fg: "#d97706" },
  partially_received: { bg: "#f3e8ff", fg: "#a855f7" },
  invoiced: { bg: "#dbeafe", fg: "#3b82f6" },
  in_progress: { bg: "#fef3c7", fg: "#d97706" },
};

const StatusPill = ({ status }) => {
  const s = STATUS_COLORS[status] || STATUS_COLORS.draft;
  return <span style={_pill(s.bg, s.fg)}>{(status || "draft").replace(/_/g, " ")}</span>;
};

export default function FinanceView() {
  const { user, profile } = useAuth();
  const [tab, setTab] = useState("Dashboard");
  const [budgets, setBudgets] = useState([]);
  const [budgetLines, setBudgetLines] = useState([]);
  const [pos, setPOs] = useState([]);
  const [poLines, setPOLines] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [expenseItems, setExpenseItems] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [invoiceLines, setInvoiceLines] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [approvals, setApprovals] = useState([]);
  const [payments, setPayments] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null); // {type, mode, data}
  const [toast, setToast] = useState(null);
  const [importType, setImportType] = useState("vendors");
  const [csvData, setCsvData] = useState(null); // {headers, rows}
  const [colMap, setColMap] = useState({});
  const [importPreview, setImportPreview] = useState(null);
  const [importing, setImporting] = useState(false);
  const [glSearch, setGlSearch] = useState("");
  const [expSearch, setExpSearch] = useState("");
  const [expSort, setExpSort] = useState("amount"); // amount, name, count
  const [selectedReport, setSelectedReport] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);
  const [vendorSearch, setVendorSearch] = useState("");
  const [drillCategory, setDrillCategory] = useState(null); // which P&L category is expanded
  const [aiAnalysis, setAiAnalysis] = useState(null); // AI insights
  const [aiLoading, setAiLoading] = useState(false);
  const [aiReclassifying, setAiReclassifying] = useState({});
  const [fcDrivers, setFcDrivers] = useState({
    dtcAdSpend: 2300000, dtcCAC: 65, dtcAOV1st: 44.52, dtcAOV2nd: 49.15,
    amznAdSpend: 400000, amznCAC: 12.4, amznAOV: 19.3,
    walmartDoors: 4000, walmartVel: 1.2, targetDoors: 1800, targetVel: 0.9, krogerDoors: 1785, krogerVel: 0.95,
    discountRate: -0.0924, chargebackRate: -0.0192, ccRate: 0.04,
    inflator27: 0.02, inflator28: 0.02, decayCurve: 2,
  });

  const showToast = useCallback((msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), type === "error" ? 8000 : 3000); }, []);
  const orgId = profile?.org_id;

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      const [b, bl, po, pol, ex, inv, il, v, a, ap, pay, pr] = await Promise.all([
        supabase.from("fin_budgets").select("*").eq("org_id", orgId),
        supabase.from("fin_budget_lines").select("*"),
        supabase.from("fin_purchase_orders").select("*").eq("org_id", orgId).order("created_at", { ascending: false }),
        supabase.from("fin_po_lines").select("*"),
        supabase.from("fin_expense_reports").select("*").eq("org_id", orgId).order("total_amount", { ascending: false }),
        supabase.from("fin_invoices").select("*").eq("org_id", orgId).order("created_at", { ascending: false }),
        supabase.from("fin_invoice_lines").select("*"),
        supabase.from("fin_vendors").select("*").eq("org_id", orgId),
        supabase.from("fin_accounts").select("*").eq("org_id", orgId).order("code"),
        supabase.from("fin_approvals").select("*").eq("org_id", orgId),
        supabase.from("fin_payments").select("*").eq("org_id", orgId),
        supabase.from("profiles").select("id, display_name, email, avatar_url"),
      ]);
      setBudgets(b.data || []);
      setBudgetLines(bl.data || []);
      setPOs(po.data || []);
      setPOLines(pol.data || []);
      setExpenses(ex.data || []);
      setExpenseItems([]); // Load on demand per report
      setInvoices(inv.data || []);
      setInvoiceLines(il.data || []);
      setVendors(v.data || []);
      setAccounts(a.data || []);
      setApprovals(ap.data || []);
      setPayments(pay.data || []);
      const pm = {};
      (pr.data || []).forEach(p => pm[p.id] = p);
      setProfiles(pm);
      setLoading(false);
    })();
  }, [orgId]);

  const uname = (id) => profiles[id]?.display_name || "";
  const vname = (id) => vendors.find(v => v.id === id)?.name || "";
  const acctName = (id) => { const a = accounts.find(a => a.id === id); return a ? `${a.code} ${a.name}` : ""; };
  
  // Load expense items on demand for a selected report
  const loadReportItems = async (reportId) => {
    setSelectedReport(reportId);
    const { data } = await supabase.from("fin_expense_items").select("*").eq("report_id", reportId).order("date", { ascending: false }).limit(500);
    setSelectedItems(data || []);
  };

  const runAiAnalysis = async () => {
    setAiLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(`https://upbjdmnykheubxkuknuj.supabase.co/functions/v1/fin-analyze`, {
        method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token || ""}` },
        body: JSON.stringify({ action: "analyze" })
      });
      const result = await resp.json();
      if (result.error) { showToast("AI error: " + result.error, "error"); setAiAnalysis({ summary: "Error: " + result.error, trends: [], misclassifications: [], recommendations: [] }); }
      else setAiAnalysis(result);
    } catch (err) { showToast("AI analysis failed: " + err.message, "error"); }
    setAiLoading(false);
  };

  const approveReclassify = async (misclass, idx) => {
    setAiReclassifying(p => ({ ...p, [idx]: "loading" }));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const resp = await fetch(`https://upbjdmnykheubxkuknuj.supabase.co/functions/v1/fin-analyze`, {
        method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token || ""}` },
        body: JSON.stringify({ action: "reclassify", data: { vendor: misclass.vendor, from_account: misclass.current_account, to_account: misclass.suggested_account } })
      });
      const result = await resp.json();
      if (result.error) { showToast("Reclassify error: " + result.error, "error"); setAiReclassifying(p => ({ ...p, [idx]: "error" })); }
      else { showToast(`Moved ${result.moved} transactions ($${result.amount?.toLocaleString()}) to ${misclass.suggested_account}`); setAiReclassifying(p => ({ ...p, [idx]: "done" })); 
        // Refresh reports
        const { data: er } = await supabase.from("fin_expense_reports").select("*").eq("org_id", orgId).order("total_amount", { ascending: false });
        setExpenses(er || []);
      }
    } catch (err) { showToast("Failed: " + err.message, "error"); setAiReclassifying(p => ({ ...p, [idx]: "error" })); }
  };

  // ──── CRUD helpers ────
  const saveRecord = async (table, data, list, setList, idField = "id") => {
    if (data[idField]) {
      const { id, created_at, updated_at, ...rest } = data;
      const { data: upd, error } = await supabase.from(table).update(rest).eq("id", id).select().single();
      if (error) { showToast(error.message, "error"); return null; }
      setList(p => p.map(r => r.id === id ? upd : r));
      return upd;
    } else {
      const { data: ins, error } = await supabase.from(table).insert({ ...data, org_id: orgId }).select().single();
      if (error) { showToast(error.message, "error"); return null; }
      setList(p => [ins, ...p]);
      return ins;
    }
  };

  const deleteRecord = async (table, id, list, setList) => {
    if (!window.confirm("Delete this item permanently?")) return;
    await supabase.from(table).delete().eq("id", id);
    setList(p => p.filter(r => r.id !== id));
    showToast("Deleted");
  };

  // ──── Auto-number generators ────
  const nextPO = async () => { const { data } = await supabase.rpc("fin_next_po_number", { org: orgId }); return data || "PO-" + Date.now(); };
  const nextEXP = async () => { const { data } = await supabase.rpc("fin_next_exp_number", { org: orgId }); return data || "EXP-" + Date.now(); };
  const nextINV = async () => { const { data } = await supabase.rpc("fin_next_inv_number", { org: orgId }); return data || "INV-" + Date.now(); };

  // ──── SUBMIT FOR APPROVAL ────
  const submitForApproval = async (type, id, amount) => {
    // Find matching approval chain
    const { data: chains } = await supabase.from("fin_approval_chains").select("*, fin_approval_steps(*)").eq("org_id", orgId).eq("is_active", true).or(`applies_to.eq.${type},applies_to.eq.any`);
    let chain = (chains || []).find(c => (!c.min_amount || amount >= c.min_amount) && (!c.max_amount || amount <= c.max_amount)) || (chains || [])[0];
    if (!chain) {
      // No chain configured — auto-approve
      const statusTable = type === "purchase_order" ? "fin_purchase_orders" : type === "expense" ? "fin_expense_reports" : "fin_invoices";
      await supabase.from(statusTable).update({ status: "approved" }).eq("id", id);
      if (type === "purchase_order") setPOs(p => p.map(r => r.id === id ? { ...r, status: "approved" } : r));
      if (type === "expense") setExpenses(p => p.map(r => r.id === id ? { ...r, status: "approved" } : r));
      if (type === "invoice") setInvoices(p => p.map(r => r.id === id ? { ...r, status: "approved" } : r));
      showToast("Auto-approved (no approval chain configured)");
      return;
    }
    const steps = (chain.fin_approval_steps || []).sort((a, b) => a.step_order - b.step_order);
    const { data: approval } = await supabase.from("fin_approvals").insert({
      org_id: orgId, chain_id: chain.id, approvable_type: type, approvable_id: id,
      current_step: 1, total_steps: steps.length, status: "in_progress", submitted_by: user?.id
    }).select().single();
    if (approval) {
      setApprovals(p => [...p, approval]);
      // Create placeholder decisions for each step
      for (const s of steps) {
        await supabase.from("fin_approval_decisions").insert({ approval_id: approval.id, step_order: s.step_order, step_id: s.id, approver_id: s.approver_id });
      }
    }
    // Update source status
    const statusTable = type === "purchase_order" ? "fin_purchase_orders" : type === "expense" ? "fin_expense_reports" : "fin_invoices";
    await supabase.from(statusTable).update({ status: "pending_approval" }).eq("id", id);
    if (type === "purchase_order") setPOs(p => p.map(r => r.id === id ? { ...r, status: "pending_approval" } : r));
    if (type === "expense") setExpenses(p => p.map(r => r.id === id ? { ...r, status: "pending_approval", submitted_at: new Date().toISOString() } : r));
    if (type === "invoice") setInvoices(p => p.map(r => r.id === id ? { ...r, status: "pending_approval" } : r));
    showToast("Submitted for approval");
  };

  // ──── APPROVE / REJECT ────
  const handleApprovalDecision = async (approvalId, decision, comment) => {
    const appr = approvals.find(a => a.id === approvalId);
    if (!appr) return;
    // Record decision for current step
    await supabase.from("fin_approval_decisions").update({ decision, comment, approver_id: user?.id, decided_at: new Date().toISOString() }).eq("approval_id", approvalId).eq("step_order", appr.current_step);
    if (decision === "rejected") {
      await supabase.from("fin_approvals").update({ status: "rejected", completed_at: new Date().toISOString() }).eq("id", approvalId);
      setApprovals(p => p.map(a => a.id === approvalId ? { ...a, status: "rejected" } : a));
      const statusTable = appr.approvable_type === "purchase_order" ? "fin_purchase_orders" : appr.approvable_type === "expense" ? "fin_expense_reports" : "fin_invoices";
      await supabase.from(statusTable).update({ status: "rejected" }).eq("id", appr.approvable_id);
      showToast("Rejected");
    } else if (appr.current_step >= appr.total_steps) {
      // Final step — fully approved
      await supabase.from("fin_approvals").update({ status: "approved", completed_at: new Date().toISOString() }).eq("id", approvalId);
      setApprovals(p => p.map(a => a.id === approvalId ? { ...a, status: "approved" } : a));
      const statusTable = appr.approvable_type === "purchase_order" ? "fin_purchase_orders" : appr.approvable_type === "expense" ? "fin_expense_reports" : "fin_invoices";
      await supabase.from(statusTable).update({ status: "approved" }).eq("id", appr.approvable_id);
      if (appr.approvable_type === "purchase_order") setPOs(p => p.map(r => r.id === appr.approvable_id ? { ...r, status: "approved" } : r));
      if (appr.approvable_type === "expense") setExpenses(p => p.map(r => r.id === appr.approvable_id ? { ...r, status: "approved" } : r));
      if (appr.approvable_type === "invoice") setInvoices(p => p.map(r => r.id === appr.approvable_id ? { ...r, status: "approved" } : r));
      showToast("Approved!");
    } else {
      // Advance to next step
      await supabase.from("fin_approvals").update({ current_step: appr.current_step + 1 }).eq("id", approvalId);
      setApprovals(p => p.map(a => a.id === approvalId ? { ...a, current_step: a.current_step + 1 } : a));
      showToast(`Step ${appr.current_step} approved — moved to step ${appr.current_step + 1}`);
    }
  };

  // ──── TABLE COMPONENT ────
  const Table = ({ columns, data, onRowClick, emptyMsg }) => (
    <div style={{ overflow: "auto", borderRadius: 8, border: `1px solid ${T.border}` }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead><tr style={{ background: T.surface2 }}>
          {columns.map((c, i) => <th key={i} style={{ padding: "10px 12px", textAlign: c.align || "left", fontWeight: 600, color: T.text2, borderBottom: `1px solid ${T.border}`, whiteSpace: "nowrap", fontSize: 12 }}>{c.label}</th>)}
        </tr></thead>
        <tbody>
          {data.length === 0 ? <tr><td colSpan={columns.length} style={{ padding: 40, textAlign: "center", color: T.text3, fontStyle: "italic" }}>{emptyMsg || "No records yet"}</td></tr> :
          data.map((row, ri) => <tr key={row.id || ri} onClick={() => onRowClick?.(row)} style={{ cursor: onRowClick ? "pointer" : "default", borderBottom: `1px solid ${T.border}`, transition: "background 0.1s" }} onMouseEnter={e => e.currentTarget.style.background = T.surface2} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            {columns.map((c, ci) => <td key={ci} style={{ padding: "10px 12px", textAlign: c.align || "left", color: T.text, whiteSpace: c.nowrap ? "nowrap" : "normal" }}>{c.render ? c.render(row) : row[c.key]}</td>)}
          </tr>)}
        </tbody>
      </table>
    </div>
  );

  // ──── MODAL FORM ────
  const ModalForm = () => {
    if (!modal) return null;
    const { type, mode, data: initialData } = modal;
    const [f, setF] = useState(initialData || {});
    const [lines, setLines] = useState([]);
    const set = (k, v) => setF(p => ({ ...p, [k]: v }));

    useEffect(() => {
      if (mode === "edit" && f.id) {
        if (type === "po") supabase.from("fin_po_lines").select("*").eq("po_id", f.id).order("sort_order").then(r => setLines(r.data || []));
        if (type === "expense") supabase.from("fin_expense_items").select("*").eq("report_id", f.id).order("sort_order").then(r => setLines(r.data || []));
        if (type === "invoice") supabase.from("fin_invoice_lines").select("*").eq("invoice_id", f.id).order("sort_order").then(r => setLines(r.data || []));
      }
    }, []);

    const save = async () => {
      if (type === "budget") {
        const rec = await saveRecord("fin_budgets", { ...f, total_amount: Number(f.total_amount) || 0 }, budgets, setBudgets);
        if (rec) setModal(null);
      } else if (type === "vendor") {
        const rec = await saveRecord("fin_vendors", f, vendors, setVendors);
        if (rec) setModal(null);
      } else if (type === "po") {
        if (!f.title) return showToast("Title required", "error");
        let num = f.po_number;
        if (!num && mode === "new") num = await nextPO();
        const subtotal = lines.reduce((s, l) => s + (Number(l.quantity) || 1) * (Number(l.unit_price) || 0), 0);
        const taxAmt = lines.reduce((s, l) => s + ((Number(l.quantity) || 1) * (Number(l.unit_price) || 0) * (Number(l.tax_rate) || 0) / 100), 0);
        const total = subtotal + taxAmt + (Number(f.shipping_amount) || 0);
        const rec = await saveRecord("fin_purchase_orders", { ...f, po_number: num, subtotal, tax_amount: taxAmt, total_amount: total, requested_by: f.requested_by || user?.id }, pos, setPOs);
        if (rec) {
          // Save lines
          if (f.id) await supabase.from("fin_po_lines").delete().eq("po_id", f.id);
          if (lines.length > 0) {
            const lineData = lines.map((l, i) => ({ po_id: rec.id, line_number: i + 1, description: l.description, quantity: Number(l.quantity) || 1, unit_price: Number(l.unit_price) || 0, unit: l.unit || "ea", tax_rate: Number(l.tax_rate) || 0, sort_order: i, account_id: l.account_id || null }));
            await supabase.from("fin_po_lines").insert(lineData);
            setPOLines(p => [...p.filter(l => l.po_id !== rec.id), ...lineData.map((l, i) => ({ ...l, id: `temp-${i}` }))]);
          }
          setModal(null);
        }
      } else if (type === "expense") {
        if (!f.title) return showToast("Title required", "error");
        let num = f.report_number;
        if (!num && mode === "new") num = await nextEXP();
        const total = lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
        const rec = await saveRecord("fin_expense_reports", { ...f, report_number: num, total_amount: total, submitted_by: f.submitted_by || user?.id }, expenses, setExpenses);
        if (rec) {
          if (f.id) await supabase.from("fin_expense_items").delete().eq("report_id", f.id);
          if (lines.length > 0) {
            const lineData = lines.map((l, i) => ({ report_id: rec.id, date: l.date || new Date().toISOString().slice(0, 10), category: l.category || "other", description: l.description, amount: Number(l.amount) || 0, vendor_name: l.vendor_name, receipt_url: l.receipt_url, sort_order: i }));
            await supabase.from("fin_expense_items").insert(lineData);
          }
          setModal(null);
        }
      } else if (type === "invoice") {
        if (!f.invoice_number) return showToast("Invoice number required", "error");
        let ref = f.internal_ref;
        if (!ref && mode === "new") ref = await nextINV();
        const subtotal = lines.reduce((s, l) => s + (Number(l.quantity) || 1) * (Number(l.unit_price) || 0), 0);
        const rec = await saveRecord("fin_invoices", { ...f, internal_ref: ref, subtotal, total_amount: subtotal + (Number(f.tax_amount) || 0) }, invoices, setInvoices);
        if (rec) {
          if (f.id) await supabase.from("fin_invoice_lines").delete().eq("invoice_id", f.id);
          if (lines.length > 0) {
            const lineData = lines.map((l, i) => ({ invoice_id: rec.id, description: l.description, quantity: Number(l.quantity) || 1, unit_price: Number(l.unit_price) || 0, sort_order: i }));
            await supabase.from("fin_invoice_lines").insert(lineData);
          }
          setModal(null);
        }
      } else if (type === "account") {
        const rec = await saveRecord("fin_accounts", f, accounts, setAccounts);
        if (rec) setModal(null);
      }
      showToast(mode === "new" ? "Created" : "Updated");
    };

    const addLine = () => setLines(p => [...p, { description: "", quantity: 1, unit_price: 0, amount: 0, category: "other", date: new Date().toISOString().slice(0, 10) }]);
    const setLine = (idx, k, v) => setLines(p => p.map((l, i) => i === idx ? { ...l, [k]: v } : l));
    const removeLine = (idx) => setLines(p => p.filter((_, i) => i !== idx));
    const lineTotal = lines.reduce((s, l) => s + ((Number(l.quantity) || 1) * (Number(l.unit_price) || 0) + (Number(l.amount) || 0)), 0);

    return (
      <div onClick={() => setModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: 12, padding: 24, width: 680, maxHeight: "90vh", overflow: "auto", boxShadow: "0 16px 48px rgba(0,0,0,0.3)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: T.text }}>{mode === "new" ? "New" : "Edit"} {type === "po" ? "Purchase Order" : type === "expense" ? "Expense Report" : type === "account" ? "Account" : type.charAt(0).toUpperCase() + type.slice(1)}</h3>
            <button onClick={() => setModal(null)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: T.text3 }}>×</button>
          </div>

          {/* Budget form */}
          {type === "budget" && <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div><label style={_lbl}>Name *</label><input value={f.name || ""} onChange={e => set("name", e.target.value)} style={_inp} placeholder="e.g. Q2 Marketing Budget" /></div>
              <div><label style={_lbl}>Fiscal Year</label><input type="number" value={f.fiscal_year || ""} onChange={e => set("fiscal_year", e.target.value)} style={_inp} placeholder="2026" /></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div><label style={_lbl}>Total Amount *</label><input type="number" value={f.total_amount || ""} onChange={e => set("total_amount", e.target.value)} style={_inp} /></div>
              <div><label style={_lbl}>Period</label><select value={f.period || ""} onChange={e => set("period", e.target.value)} style={_sel}><option value="">Select</option><option>annual</option><option>quarterly</option><option>monthly</option><option>custom</option></select></div>
              <div><label style={_lbl}>Status</label><select value={f.status || "draft"} onChange={e => set("status", e.target.value)} style={_sel}><option>draft</option><option>active</option><option>frozen</option><option>closed</option></select></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div><label style={_lbl}>Start Date</label><input type="date" value={f.start_date || ""} onChange={e => set("start_date", e.target.value)} style={_inp} /></div>
              <div><label style={_lbl}>End Date</label><input type="date" value={f.end_date || ""} onChange={e => set("end_date", e.target.value)} style={_inp} /></div>
            </div>
            <div><label style={_lbl}>Description</label><textarea value={f.description || ""} onChange={e => set("description", e.target.value)} rows={2} style={{ ..._inp, resize: "vertical" }} /></div>
          </>}

          {/* Vendor form */}
          {type === "vendor" && <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div><label style={_lbl}>Name *</label><input value={f.name || ""} onChange={e => set("name", e.target.value)} style={_inp} /></div>
              <div><label style={_lbl}>Code</label><input value={f.code || ""} onChange={e => set("code", e.target.value)} style={_inp} placeholder="Internal code" /></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div><label style={_lbl}>Contact Name</label><input value={f.contact_name || ""} onChange={e => set("contact_name", e.target.value)} style={_inp} /></div>
              <div><label style={_lbl}>Email</label><input value={f.contact_email || ""} onChange={e => set("contact_email", e.target.value)} style={_inp} /></div>
              <div><label style={_lbl}>Phone</label><input value={f.contact_phone || ""} onChange={e => set("contact_phone", e.target.value)} style={_inp} /></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div><label style={_lbl}>Payment Terms</label><select value={f.payment_terms || "net_30"} onChange={e => set("payment_terms", e.target.value)} style={_sel}><option value="immediate">Immediate</option><option value="net_15">Net 15</option><option value="net_30">Net 30</option><option value="net_45">Net 45</option><option value="net_60">Net 60</option><option value="net_90">Net 90</option></select></div>
              <div><label style={_lbl}>Category</label><input value={f.category || ""} onChange={e => set("category", e.target.value)} style={_inp} placeholder="e.g. Raw Materials" /></div>
            </div>
            <div><label style={_lbl}>Tax ID</label><input value={f.tax_id || ""} onChange={e => set("tax_id", e.target.value)} style={_inp} /></div>
          </>}

          {/* Account form */}
          {type === "account" && <>
            <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 12, marginBottom: 12 }}>
              <div><label style={_lbl}>Code *</label><input value={f.code || ""} onChange={e => set("code", e.target.value)} style={_inp} placeholder="5100" /></div>
              <div><label style={_lbl}>Name *</label><input value={f.name || ""} onChange={e => set("name", e.target.value)} style={_inp} placeholder="Marketing Expenses" /></div>
            </div>
            <div style={{ marginBottom: 12 }}><label style={_lbl}>Type</label><select value={f.type || "expense"} onChange={e => set("type", e.target.value)} style={_sel}><option>expense</option><option>revenue</option><option>asset</option><option>liability</option></select></div>
            <div><label style={_lbl}>Description</label><input value={f.description || ""} onChange={e => set("description", e.target.value)} style={_inp} /></div>
          </>}

          {/* PO form */}
          {type === "po" && <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div><label style={_lbl}>Title *</label><input value={f.title || ""} onChange={e => set("title", e.target.value)} style={_inp} /></div>
              <div><label style={_lbl}>Vendor</label><select value={f.vendor_id || ""} onChange={e => set("vendor_id", e.target.value)} style={_sel}><option value="">Select vendor</option>{vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div><label style={_lbl}>Priority</label><select value={f.priority || "normal"} onChange={e => set("priority", e.target.value)} style={_sel}><option>low</option><option>normal</option><option>high</option><option>urgent</option></select></div>
              <div><label style={_lbl}>Required By</label><input type="date" value={f.required_by || ""} onChange={e => set("required_by", e.target.value)} style={_inp} /></div>
              <div><label style={_lbl}>Budget</label><select value={f.budget_id || ""} onChange={e => set("budget_id", e.target.value)} style={_sel}><option value="">None</option>{budgets.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
            </div>
            <div style={{ marginBottom: 8 }}><label style={_lbl}>Notes</label><textarea value={f.notes || ""} onChange={e => set("notes", e.target.value)} rows={2} style={{ ..._inp, resize: "vertical" }} /></div>
            <div style={{ marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Line Items</span>
              <button onClick={addLine} style={{ ..._btn, background: T.accent, color: "#fff", padding: "4px 12px", fontSize: 12 }}>+ Add Line</button>
            </div>
            {lines.map((l, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 60px 90px 60px 24px", gap: 6, marginBottom: 4, alignItems: "end" }}>
                <input value={l.description || ""} onChange={e => setLine(i, "description", e.target.value)} placeholder="Description" style={{ ..._inp, padding: "6px 8px", fontSize: 12 }} />
                <input type="number" value={l.quantity || ""} onChange={e => setLine(i, "quantity", e.target.value)} placeholder="Qty" style={{ ..._inp, padding: "6px 8px", fontSize: 12 }} />
                <input type="number" value={l.unit_price || ""} onChange={e => setLine(i, "unit_price", e.target.value)} placeholder="Price" style={{ ..._inp, padding: "6px 8px", fontSize: 12 }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: T.accent, textAlign: "right" }}>{fmt((Number(l.quantity) || 1) * (Number(l.unit_price) || 0))}</span>
                <button onClick={() => removeLine(i)} style={{ background: "none", border: "none", color: T.red, cursor: "pointer", fontSize: 14 }}>×</button>
              </div>
            ))}
            {lines.length > 0 && <div style={{ textAlign: "right", fontSize: 14, fontWeight: 700, color: T.text, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.border}` }}>Total: {fmt(lineTotal + (Number(f.shipping_amount) || 0))}</div>}
          </>}

          {/* Expense form */}
          {type === "expense" && <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div><label style={_lbl}>Title *</label><input value={f.title || ""} onChange={e => set("title", e.target.value)} style={_inp} placeholder="e.g. Q1 Travel Expenses" /></div>
              <div><label style={_lbl}>Budget</label><select value={f.budget_id || ""} onChange={e => set("budget_id", e.target.value)} style={_sel}><option value="">None</option>{budgets.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
            </div>
            <div style={{ marginBottom: 8 }}><label style={_lbl}>Description</label><textarea value={f.description || ""} onChange={e => set("description", e.target.value)} rows={2} style={{ ..._inp, resize: "vertical" }} /></div>
            <div style={{ marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Expense Items</span>
              <button onClick={addLine} style={{ ..._btn, background: T.accent, color: "#fff", padding: "4px 12px", fontSize: 12 }}>+ Add Item</button>
            </div>
            {lines.map((l, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "90px 100px 2fr 90px 24px", gap: 6, marginBottom: 4, alignItems: "end" }}>
                <input type="date" value={l.date || ""} onChange={e => setLine(i, "date", e.target.value)} style={{ ..._inp, padding: "6px 4px", fontSize: 11 }} />
                <select value={l.category || "other"} onChange={e => setLine(i, "category", e.target.value)} style={{ ..._inp, padding: "6px 4px", fontSize: 11 }}>
                  {["travel","meals","lodging","transport","office_supplies","software","equipment","phone","internet","training","entertainment","subscriptions","shipping","other"].map(c => <option key={c} value={c}>{c.replace(/_/g, " ")}</option>)}
                </select>
                <input value={l.description || ""} onChange={e => setLine(i, "description", e.target.value)} placeholder="Description" style={{ ..._inp, padding: "6px 8px", fontSize: 12 }} />
                <input type="number" value={l.amount || ""} onChange={e => setLine(i, "amount", e.target.value)} placeholder="Amount" style={{ ..._inp, padding: "6px 8px", fontSize: 12 }} />
                <button onClick={() => removeLine(i)} style={{ background: "none", border: "none", color: T.red, cursor: "pointer", fontSize: 14 }}>×</button>
              </div>
            ))}
            {lines.length > 0 && <div style={{ textAlign: "right", fontSize: 14, fontWeight: 700, color: T.text, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.border}` }}>Total: {fmt(lines.reduce((s, l) => s + (Number(l.amount) || 0), 0))}</div>}
          </>}

          {/* Invoice form */}
          {type === "invoice" && <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div><label style={_lbl}>Vendor Invoice # *</label><input value={f.invoice_number || ""} onChange={e => set("invoice_number", e.target.value)} style={_inp} /></div>
              <div><label style={_lbl}>Vendor</label><select value={f.vendor_id || ""} onChange={e => set("vendor_id", e.target.value)} style={_sel}><option value="">Select</option>{vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div><label style={_lbl}>Invoice Date</label><input type="date" value={f.invoice_date || ""} onChange={e => set("invoice_date", e.target.value)} style={_inp} /></div>
              <div><label style={_lbl}>Due Date</label><input type="date" value={f.due_date || ""} onChange={e => set("due_date", e.target.value)} style={_inp} /></div>
              <div><label style={_lbl}>Linked PO</label><select value={f.po_id || ""} onChange={e => set("po_id", e.target.value)} style={_sel}><option value="">None</option>{pos.map(p => <option key={p.id} value={p.id}>{p.po_number} — {p.title}</option>)}</select></div>
            </div>
            <div style={{ marginBottom: 8 }}><label style={_lbl}>Title</label><input value={f.title || ""} onChange={e => set("title", e.target.value)} style={_inp} /></div>
            <div style={{ marginBottom: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>Line Items</span>
              <button onClick={addLine} style={{ ..._btn, background: T.accent, color: "#fff", padding: "4px 12px", fontSize: 12 }}>+ Add Line</button>
            </div>
            {lines.map((l, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "2fr 60px 90px 60px 24px", gap: 6, marginBottom: 4, alignItems: "end" }}>
                <input value={l.description || ""} onChange={e => setLine(i, "description", e.target.value)} placeholder="Description" style={{ ..._inp, padding: "6px 8px", fontSize: 12 }} />
                <input type="number" value={l.quantity || ""} onChange={e => setLine(i, "quantity", e.target.value)} placeholder="Qty" style={{ ..._inp, padding: "6px 8px", fontSize: 12 }} />
                <input type="number" value={l.unit_price || ""} onChange={e => setLine(i, "unit_price", e.target.value)} placeholder="Price" style={{ ..._inp, padding: "6px 8px", fontSize: 12 }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: T.accent, textAlign: "right" }}>{fmt((Number(l.quantity) || 1) * (Number(l.unit_price) || 0))}</span>
                <button onClick={() => removeLine(i)} style={{ background: "none", border: "none", color: T.red, cursor: "pointer", fontSize: 14 }}>×</button>
              </div>
            ))}
            {lines.length > 0 && <div style={{ textAlign: "right", fontSize: 14, fontWeight: 700, color: T.text, marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.border}` }}>Total: {fmt(lineTotal)}</div>}
          </>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 16, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
            <button onClick={() => setModal(null)} style={{ ..._btn, background: T.surface3, color: T.text3 }}>Cancel</button>
            <button onClick={save} style={{ ..._btn, background: T.accent, color: "#fff" }}>Save</button>
          </div>
        </div>
      </div>
    );
  };

  // ──── DASHBOARD TAB ────
  const totalBudget = budgets.reduce((s, b) => s + Number(b.total_amount || 0), 0);
  const totalPO = pos.reduce((s, p) => s + Number(p.total_amount || 0), 0);
  const totalExp = expenses.reduce((s, e) => s + Number(e.total_amount || 0), 0);
  const totalInv = invoices.reduce((s, i) => s + Number(i.total_amount || 0), 0);
  const totalPaid = payments.reduce((s, p) => s + Number(p.amount || 0), 0);
  const pendingApprovals = approvals.filter(a => a.status === "in_progress" || a.status === "pending");
  const overdueInvoices = invoices.filter(i => i.due_date && new Date(i.due_date) < new Date() && !["paid", "void"].includes(i.status));

  const StatCard = ({ label, value, sub, color, onClick }) => (
    <div onClick={onClick} style={{ background: T.surface, borderRadius: 10, padding: 20, border: `1px solid ${T.border}`, flex: 1, cursor: onClick ? "pointer" : "default", transition: "all 0.15s" }} onMouseEnter={e => onClick && (e.currentTarget.style.borderColor = T.accent)} onMouseLeave={e => onClick && (e.currentTarget.style.borderColor = T.border)}>
      <div style={{ fontSize: 12, color: T.text3, fontWeight: 500, marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: color || T.text }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: T.text3, marginTop: 4 }}>{sub}</div>}
    </div>
  );

  if (loading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: T.text3 }}>Loading finance data…</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: T.bg, overflow: "hidden" }}>
      {toast && <div style={{ position: "fixed", top: 16, right: 16, zIndex: 200, padding: "10px 16px", borderRadius: 8, background: toast.type === "error" ? (T.redDim || "#fecaca") : (T.greenDim || "#dcfce7"), color: toast.type === "error" ? (T.red || "#ef4444") : (T.green || "#22c55e"), fontSize: 13, fontWeight: 500, boxShadow: "0 4px 16px rgba(0,0,0,0.2)" }}>{toast.msg}</div>}
      {/* Header */}
      <div style={{ borderBottom: `1px solid ${T.border}`, background: T.surface, padding: "12px 24px 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: T.text }}>Finance</h2>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={() => setModal({ type: "account", mode: "new", data: { type: "expense" } })} style={{ ..._btn, background: T.surface3, color: T.text2, padding: "6px 12px", fontSize: 12 }}>+ Account</button>
            <button onClick={() => setModal({ type: "vendor", mode: "new", data: {} })} style={{ ..._btn, background: T.surface3, color: T.text2, padding: "6px 12px", fontSize: 12 }}>+ Vendor</button>
          </div>
        </div>
        <div style={{ display: "flex", gap: 0 }}>
          {TABS.map(t => <button key={t} onClick={() => setTab(t)} style={{ padding: "8px 16px", fontSize: 13, fontWeight: tab === t ? 600 : 400, color: tab === t ? T.accent : T.text3, background: "none", border: "none", borderBottom: tab === t ? `2px solid ${T.accent}` : "2px solid transparent", cursor: "pointer" }}>{t}</button>)}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
        {tab === "Dashboard" && (() => {
          const expByType = {};
          expenses.forEach(e => {
            const code = (e.title || "").match(/^(\d+)/)?.[1] || "0";
            const prefix = code.substring(0, 1);
            const typeMap = { "1": "Assets", "2": "Liabilities", "3": "Equity", "4": "Revenue", "5": "COGS", "6": "Operating Expenses" };
            const type = typeMap[prefix] || "Other";
            if (!expByType[type]) expByType[type] = { total: 0, count: 0, reports: [] };
            expByType[type].total += Number(e.total_amount || 0);
            expByType[type].count++;
            expByType[type].reports.push(e);
          });
          const topSpend = expenses.filter(e => Number(e.total_amount || 0) > 0).sort((a, b) => Number(b.total_amount) - Number(a.total_amount)).slice(0, 10);
          const totalRevenue = expByType["Revenue"]?.total || 0;
          const totalCOGS = expByType["COGS"]?.total || 0;
          const totalOpex = expByType["Operating Expenses"]?.total || 0;
          const grossProfit = totalRevenue - totalCOGS;
          const netIncome = grossProfit - totalOpex;
          const txnTotal = expenses.reduce((s, e) => { const m = e.description?.match(/(\d+) txns/); return s + (m ? parseInt(m[1]) : 0); }, 0);
          const drillToCategory = (cat) => { setDrillCategory(drillCategory === cat ? null : cat); };
          const sevColor = (s) => s === "critical" ? (T.red || "#ef4444") : s === "warning" ? "#f97316" : T.accent;
          const prioColor = (p) => p === "high" ? (T.red || "#ef4444") : p === "medium" ? "#f97316" : (T.green || "#22c55e");
          
          return <>
            {/* P&L Summary Cards - clickable */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 24 }}>
              <StatCard label="Revenue" value={fmtK(totalRevenue)} sub={`${expByType["Revenue"]?.count || 0} accounts`} color={T.green || "#22c55e"} onClick={() => drillToCategory("Revenue")} />
              <StatCard label="COGS" value={fmtK(totalCOGS)} sub={`${expByType["COGS"]?.count || 0} accounts`} color="#f97316" onClick={() => drillToCategory("COGS")} />
              <StatCard label="Gross Profit" value={fmtK(grossProfit)} sub={totalRevenue > 0 ? `${Math.round(grossProfit/totalRevenue*100)}% margin` : ""} color={grossProfit > 0 ? (T.green || "#22c55e") : (T.red || "#ef4444")} />
              <StatCard label="OpEx" value={fmtK(totalOpex)} sub={`${expByType["Operating Expenses"]?.count || 0} accounts`} color={T.accent} onClick={() => drillToCategory("Operating Expenses")} />
              <StatCard label="Net Income" value={fmtK(netIncome)} sub={totalRevenue > 0 ? `${Math.round(netIncome/totalRevenue*100)}% margin` : ""} color={netIncome > 0 ? (T.green || "#22c55e") : (T.red || "#ef4444")} />
            </div>

            {/* Drill-down panel when a card is clicked */}
            {drillCategory && expByType[drillCategory] && (
              <div style={{ marginBottom: 24, borderRadius: 8, border: `1px solid ${T.accent}`, overflow: "hidden" }}>
                <div style={{ padding: "10px 14px", background: T.accentDim || "#dbeafe", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: T.accent }}>{drillCategory} — {expByType[drillCategory].reports.length} accounts, {fmtK(expByType[drillCategory].total)} total</span>
                  <button onClick={() => setDrillCategory(null)} style={{ background: "none", border: "none", color: T.accent, cursor: "pointer", fontSize: 16, fontWeight: 700 }}>×</button>
                </div>
                <div style={{ maxHeight: 300, overflow: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead><tr style={{ background: T.surface2 }}>
                      <th style={{ padding: "6px 12px", textAlign: "left", fontWeight: 600, color: T.text2, fontSize: 11 }}>Account</th>
                      <th style={{ padding: "6px 12px", textAlign: "right", fontWeight: 600, color: T.text2, fontSize: 11 }}>Transactions</th>
                      <th style={{ padding: "6px 12px", textAlign: "right", fontWeight: 600, color: T.text2, fontSize: 11 }}>Amount</th>
                    </tr></thead>
                    <tbody>{expByType[drillCategory].reports.sort((a, b) => Math.abs(Number(b.total_amount)) - Math.abs(Number(a.total_amount))).map(r => (
                      <tr key={r.id} onClick={() => { setTab("Expenses"); loadReportItems(r.id); }} style={{ cursor: "pointer", borderBottom: `1px solid ${T.border}` }} onMouseEnter={e => e.currentTarget.style.background = T.surface2} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <td style={{ padding: "6px 12px", color: T.text }}>{r.title}</td>
                        <td style={{ padding: "6px 12px", textAlign: "right", color: T.text3, fontSize: 12 }}>{r.description?.match(/(\d+) txns/)?.[1] || "—"}</td>
                        <td style={{ padding: "6px 12px", textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: Number(r.total_amount) < 0 ? (T.red || "#ef4444") : T.text }}>{fmt(r.total_amount)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24 }}>
              {/* P&L by Category - clickable rows */}
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 12 }}>P&L by Category</h3>
                <div style={{ borderRadius: 8, border: `1px solid ${T.border}`, overflow: "hidden" }}>
                  {Object.entries(expByType).sort((a, b) => { const o = { Revenue: 0, COGS: 1, "Operating Expenses": 2, Assets: 3, Liabilities: 4, Equity: 5 }; return (o[a[0]] ?? 9) - (o[b[0]] ?? 9); }).map(([type, data]) => (
                    <div key={type} onClick={() => drillToCategory(type)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", borderBottom: `1px solid ${T.border}`, background: drillCategory === type ? (T.accentDim || "#dbeafe") : T.surface, cursor: "pointer" }} onMouseEnter={e => e.currentTarget.style.background = drillCategory === type ? (T.accentDim || "#dbeafe") : T.surface2} onMouseLeave={e => e.currentTarget.style.background = drillCategory === type ? (T.accentDim || "#dbeafe") : T.surface}>
                      <div><div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{type}</div><div style={{ fontSize: 11, color: T.text3 }}>{data.count} accounts</div></div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: data.total >= 0 ? (T.green || "#22c55e") : (T.red || "#ef4444"), fontVariantNumeric: "tabular-nums" }}>{fmtK(data.total)}</div>
                        <span style={{ fontSize: 10, color: T.text3 }}>▶</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top Accounts */}
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 12 }}>Top Accounts by Amount</h3>
                <div style={{ borderRadius: 8, border: `1px solid ${T.border}`, overflow: "hidden" }}>
                  {topSpend.map((r, i) => (
                    <div key={r.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 14px", borderBottom: `1px solid ${T.border}`, background: T.surface, cursor: "pointer" }} onClick={() => { setTab("Expenses"); loadReportItems(r.id); }} onMouseEnter={e => e.currentTarget.style.background = T.surface2} onMouseLeave={e => e.currentTarget.style.background = T.surface}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}><span style={{ fontSize: 11, fontWeight: 600, color: T.text3, width: 18, textAlign: "right" }}>{i + 1}.</span><span style={{ fontSize: 13, color: T.text }}>{r.title}</span></div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: T.accent, fontVariantNumeric: "tabular-nums" }}>{fmtK(r.total_amount)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* AI Insights */}
            <div style={{ marginTop: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <h3 style={{ fontSize: 15, fontWeight: 700, color: T.text, margin: 0 }}>AI Insights</h3>
                <button onClick={runAiAnalysis} disabled={aiLoading} style={{ ..._btn, background: aiLoading ? T.surface3 : "linear-gradient(135deg, #8b5cf6, #6366f1)", color: aiLoading ? T.text3 : "#fff", padding: "6px 16px", fontSize: 12, opacity: aiLoading ? 0.7 : 1 }}>
                  {aiLoading ? "Analyzing..." : aiAnalysis ? "Re-analyze" : "✦ Analyze Finances"}
                </button>
              </div>

              {!aiAnalysis && !aiLoading && (
                <div style={{ padding: 32, textAlign: "center", borderRadius: 8, border: `1px dashed ${T.border}`, color: T.text3, fontSize: 13 }}>
                  Click "Analyze Finances" to get AI-powered trend analysis, misclassification detection, and recommendations
                </div>
              )}

              {aiLoading && (
                <div style={{ padding: 32, textAlign: "center", borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface }}>
                  <div style={{ fontSize: 14, color: T.accent, fontWeight: 600, marginBottom: 8 }}>Analyzing {txnTotal.toLocaleString()} transactions across {accounts.length} GL accounts...</div>
                  <div style={{ fontSize: 12, color: T.text3 }}>AI is reviewing trends, checking classifications, and generating recommendations</div>
                </div>
              )}

              {aiAnalysis && (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {/* Summary */}
                  <div style={{ padding: 16, borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface }}>
                    <div style={{ fontSize: 13, color: T.text, lineHeight: 1.6 }}>{aiAnalysis.summary}</div>
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                    {/* Trends */}
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 8 }}>Trends & Observations</div>
                      {(aiAnalysis.trends || []).map((t, i) => (
                        <div key={i} style={{ padding: "10px 12px", marginBottom: 6, borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, borderLeft: `3px solid ${sevColor(t.severity)}` }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 2 }}>{t.title}</div>
                          <div style={{ fontSize: 11, color: T.text3, lineHeight: 1.5 }}>{t.description}</div>
                        </div>
                      ))}
                    </div>

                    {/* Recommendations */}
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 8 }}>Recommendations</div>
                      {(aiAnalysis.recommendations || []).map((r, i) => (
                        <div key={i} style={{ padding: "10px 12px", marginBottom: 6, borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, borderLeft: `3px solid ${prioColor(r.priority)}` }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{r.title}</span>
                            <span style={{ ..._pill(prioColor(r.priority) + "22", prioColor(r.priority)), fontSize: 10 }}>{r.priority}</span>
                          </div>
                          <div style={{ fontSize: 11, color: T.text3, lineHeight: 1.5, marginTop: 2 }}>{r.description}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Misclassifications - actionable */}
                  {(aiAnalysis.misclassifications || []).length > 0 && (
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 8 }}>Potential Misclassifications</div>
                      <div style={{ borderRadius: 8, border: `1px solid ${T.border}`, overflow: "hidden" }}>
                        {aiAnalysis.misclassifications.map((m, i) => (
                          <div key={i} style={{ padding: "10px 14px", borderBottom: `1px solid ${T.border}`, background: T.surface }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{m.vendor}</div>
                                <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>
                                  Currently in: <span style={{ color: T.red || "#ef4444" }}>{m.current_account}</span> → Suggested: <span style={{ color: T.green || "#22c55e" }}>{m.suggested_account}</span>
                                </div>
                                <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>{m.reason}{m.impact ? ` • ${m.impact}` : ""}</div>
                              </div>
                              <div style={{ display: "flex", gap: 4, flexShrink: 0, marginLeft: 12 }}>
                                {aiReclassifying[i] === "done" ? (
                                  <span style={{ ..._pill(T.greenDim || "#dcfce7", T.green || "#22c55e"), fontSize: 11 }}>✓ Moved</span>
                                ) : aiReclassifying[i] === "loading" ? (
                                  <span style={{ ..._pill(T.surface3, T.text3), fontSize: 11 }}>Moving...</span>
                                ) : aiReclassifying[i] === "error" ? (
                                  <span style={{ ..._pill(T.redDim || "#fecaca", T.red || "#ef4444"), fontSize: 11 }}>Failed</span>
                                ) : (
                                  <>
                                    <button onClick={() => approveReclassify(m, i)} style={{ ..._btn, background: T.green || "#22c55e", color: "#fff", padding: "4px 10px", fontSize: 11 }}>Approve</button>
                                    <button onClick={() => setAiReclassifying(p => ({ ...p, [i]: "done" }))} style={{ ..._btn, background: T.surface3, color: T.text3, padding: "4px 10px", fontSize: 11 }}>Dismiss</button>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Data Snapshot */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginTop: 24 }}>
              <StatCard label="GL Accounts" value={accounts.length} sub="Chart of Accounts" onClick={() => setTab("Chart of Accounts")} />
              <StatCard label="Transactions" value={txnTotal.toLocaleString()} sub="Expense items" onClick={() => setTab("Expenses")} />
              <StatCard label="Vendors" value={vendors.length.toLocaleString()} sub="Active vendors" onClick={() => setTab("Vendors")} />
              <StatCard label="Purchase Orders" value={pos.length} sub={`${pos.filter(p => p.status === "pending_approval").length} pending`} onClick={() => setTab("Purchase Orders")} />
            </div>
          </>;
        })()}

        {tab === "Forecast" && (() => {
          const d = fcDrivers;
          const setD = (k, v) => setFcDrivers(p => ({ ...p, [k]: Number(v) }));
          const CURVES = { 1: [1,.68,.25,.23,.21,.19,.17,.15,.13,.11,.09,.07], 2: [1,.79,.33,.15,.10,.08,.08,.05,.05,.05,.05,.05], 3: [1,.68,.25,.10,.08,.06,.04,.02,.02,.02,.02,.02] };
          const curve = CURVES[d.decayCurve] || CURVES[2];
          const BASE = { grossDTC: 86556924, grossAMZN: 22490523, grossRetail: 11786801, grossIntl: 1021663, productCost: 16913242, gwpCOGS: 2030379, donatedProduct: 930826, processingFees: 7124462, amazonFBA: 4317034, warehouseStorage: 867607, otherCOGS: 2305598, personnel: 8311906, freightOut: 13759334, warehouseFulfill: 733812, otherMarketing: 1920191, travelMeals: 269742, gaOH: 1710298, proFees: 578541, otherFixed: 283779, ofsTNT: 1229123, depreciation: 498889, interestExpense: 402411, otherExpense: 1618757, otherIncome: 301873 };
          const fc = {};
          for (const yr of [2026, 2027, 2028]) {
            const inf = yr === 2026 ? 1 : yr === 2027 ? (1 + d.inflator27) : (1 + d.inflator27) * (1 + d.inflator28);
            const dtcNew = (d.dtcAdSpend * 12) / d.dtcCAC;
            let ltv = d.dtcAOV1st; for (let m = 1; m < 12; m++) ltv += (curve[m] || 0.02) * d.dtcAOV2nd;
            const dtcGross = yr === 2026 ? BASE.grossDTC : dtcNew * ltv * inf;
            const amznGross = yr === 2026 ? BASE.grossAMZN : ((d.amznAdSpend * 12) / d.amznCAC) * d.amznAOV * 12 * 0.055 * inf * (yr === 2027 ? 0.815 : 0.707);
            const retailGross = yr === 2026 ? BASE.grossRetail : (d.walmartDoors * d.walmartVel * 52 * 8.6 + d.targetDoors * d.targetVel * 52 * 8.4 + d.krogerDoors * d.krogerVel * 52 * 8.6) * inf;
            const intlGross = yr === 2026 ? BASE.grossIntl : BASE.grossIntl * inf * (yr === 2027 ? 0.88 : 0.76);
            const totalGross = dtcGross + amznGross + retailGross + intlGross;
            const disc = totalGross * d.discountRate;
            const cb = totalGross * d.chargebackRate;
            const netSales = totalGross + disc + cb;
            const rr = totalGross / (BASE.grossDTC + BASE.grossAMZN + BASE.grossRetail + BASE.grossIntl);
            const productCost = BASE.productCost * rr * (yr === 2026 ? 1 : inf * 0.95);
            const totalCOGS = productCost + BASE.gwpCOGS * rr * inf + BASE.donatedProduct * inf + netSales * d.ccRate * 1.6 + amznGross * 0.192 + BASE.warehouseStorage * rr * inf + BASE.otherCOGS * rr * inf;
            const grossProfit = netSales - totalCOGS;
            const adSpend = (d.dtcAdSpend + d.amznAdSpend) * 12 + d.dtcAdSpend * 0.004; // + intl
            const totalGA = BASE.personnel * inf + adSpend + BASE.freightOut * rr * inf + (yr === 2026 ? BASE.warehouseFulfill : BASE.warehouseFulfill * rr * inf) + (yr === 2026 ? BASE.otherMarketing : BASE.otherMarketing * 0.05 * inf) + BASE.travelMeals * inf + (yr === 2026 ? BASE.gaOH : BASE.gaOH * 0.4 * inf) + (yr === 2026 ? BASE.proFees : 278100 * inf) + BASE.otherFixed * inf + BASE.ofsTNT * inf;
            const ebitda = grossProfit - totalGA;
            const netIncome = ebitda - BASE.depreciation * inf - BASE.interestExpense * inf - BASE.otherExpense * inf + BASE.otherIncome * inf;
            fc[yr] = { dtcGross, amznGross, retailGross, intlGross, totalGross, disc, cb, netSales, productCost, totalCOGS, grossProfit, adSpend, totalGA, ebitda, netIncome, grossMargin: grossProfit / netSales, ebitdaMargin: ebitda / netSales, netMargin: netIncome / netSales };
          }
          const FcInput = ({ label, dk, prefix = "$", step = 1 }) => (
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 11, color: T.text3, width: 120, flexShrink: 0 }}>{label}</span>
              <div style={{ display: "flex", alignItems: "center", gap: 2 }}>{prefix && <span style={{ fontSize: 10, color: T.text3 }}>{prefix}</span>}<input type="number" step={step} value={d[dk]} onChange={e => setD(dk, e.target.value)} style={{ ..._inp, width: 100, padding: "4px 6px", fontSize: 12, textAlign: "right", fontFamily: "monospace" }} /></div>
            </div>
          );
          const FcRow = ({ label, vals, bold, neg, indent }) => (
            <div style={{ display: "grid", gridTemplateColumns: "180px 1fr 1fr 1fr", padding: `${bold ? 5 : 2}px 0`, borderTop: bold ? `1px solid ${T.border}` : "none" }}>
              <div style={{ fontSize: 12, fontWeight: bold ? 700 : 400, color: bold ? T.text : T.text2, paddingLeft: indent ? 12 : 0 }}>{label}</div>
              {[2026, 2027, 2028].map(y => <div key={y} style={{ fontSize: 12, fontWeight: bold ? 700 : 400, textAlign: "right", fontFamily: "monospace", color: neg ? (T.red || "#ef4444") : bold ? (T.accent || "#3b82f6") : T.text, paddingRight: 8 }}>{fmtK(vals[y])}</div>)}
            </div>
          );
          const FcPctRow = ({ label, vals }) => (
            <div style={{ display: "grid", gridTemplateColumns: "180px 1fr 1fr 1fr", padding: "2px 0" }}>
              <div style={{ fontSize: 11, color: T.text3, fontStyle: "italic" }}>{label}</div>
              {[2026, 2027, 2028].map(y => <div key={y} style={{ fontSize: 11, textAlign: "right", fontFamily: "monospace", color: vals[y] >= 0 ? (T.green || "#22c55e") : (T.red || "#ef4444"), paddingRight: 8 }}>{(vals[y] * 100).toFixed(1)}%</div>)}
            </div>
          );
          return <>
            <div style={{ display: "grid", gridTemplateColumns: "280px 1fr", gap: 16 }}>
              {/* Driver Panel */}
              <div style={{ borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface, padding: 14, overflow: "auto", maxHeight: "calc(100vh - 180px)" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.accent, marginBottom: 10 }}>Forecast Drivers</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.text2, marginBottom: 6 }}>DTC / GWP</div>
                <FcInput label="Monthly Ad Spend" dk="dtcAdSpend" step={50000} />
                <FcInput label="CAC" dk="dtcCAC" />
                <FcInput label="1st Order AOV" dk="dtcAOV1st" step={0.5} />
                <FcInput label="Rebill AOV" dk="dtcAOV2nd" step={0.5} />
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                  <span style={{ fontSize: 11, color: T.text3, width: 120 }}>Decay Curve</span>
                  <select value={d.decayCurve} onChange={e => setD("decayCurve", e.target.value)} style={{ ..._sel, width: 100, padding: "4px 6px", fontSize: 11 }}>
                    <option value={1}>Optimistic</option><option value={2}>Base</option><option value={3}>Conservative</option>
                  </select>
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.text2, marginBottom: 6, marginTop: 10 }}>Amazon</div>
                <FcInput label="Monthly Ad Spend" dk="amznAdSpend" step={25000} />
                <FcInput label="CAC" dk="amznCAC" step={0.5} />
                <FcInput label="AOV" dk="amznAOV" step={0.5} />
                <div style={{ fontSize: 11, fontWeight: 600, color: T.text2, marginBottom: 6, marginTop: 10 }}>Retail</div>
                <FcInput label="Walmart Doors" dk="walmartDoors" prefix="" step={100} />
                <FcInput label="Walmart Vel/wk" dk="walmartVel" prefix="" step={0.1} />
                <FcInput label="Target Doors" dk="targetDoors" prefix="" step={100} />
                <FcInput label="Target Vel/wk" dk="targetVel" prefix="" step={0.1} />
                <FcInput label="Kroger Doors" dk="krogerDoors" prefix="" step={100} />
                <FcInput label="Kroger Vel/wk" dk="krogerVel" prefix="" step={0.1} />
                <div style={{ fontSize: 11, fontWeight: 600, color: T.text2, marginBottom: 6, marginTop: 10 }}>Economics</div>
                <FcInput label="Discount Rate" dk="discountRate" prefix="" step={0.005} />
                <FcInput label="Chargeback Rate" dk="chargebackRate" prefix="" step={0.001} />
                <FcInput label="CC Processing %" dk="ccRate" prefix="" step={0.005} />
                <FcInput label="2027 Inflator" dk="inflator27" prefix="" step={0.005} />
                <FcInput label="2028 Inflator" dk="inflator28" prefix="" step={0.005} />
                <button onClick={() => setFcDrivers({ dtcAdSpend: 2300000, dtcCAC: 65, dtcAOV1st: 44.52, dtcAOV2nd: 49.15, amznAdSpend: 400000, amznCAC: 12.4, amznAOV: 19.3, walmartDoors: 4000, walmartVel: 1.2, targetDoors: 1800, targetVel: 0.9, krogerDoors: 1785, krogerVel: 0.95, discountRate: -0.0924, chargebackRate: -0.0192, ccRate: 0.04, inflator27: 0.02, inflator28: 0.02, decayCurve: 2 })} style={{ ..._btn, width: "100%", background: T.surface3, color: T.text3, fontSize: 11, marginTop: 8 }}>Reset to Base</button>
              </div>
              {/* P&L Output */}
              <div style={{ borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface, padding: 16, overflow: "auto", maxHeight: "calc(100vh - 180px)" }}>
                {/* KPIs */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 16 }}>
                  {[
                    { label: "2026 Net Sales", val: fmtK(fc[2026]?.netSales), color: T.accent },
                    { label: "Gross Margin", val: (fc[2026]?.grossMargin * 100).toFixed(1) + "%", color: (fc[2026]?.grossMargin || 0) > 0.65 ? (T.green || "#22c55e") : "#f97316" },
                    { label: "EBITDA", val: fmtK(fc[2026]?.ebitda), color: (fc[2026]?.ebitda || 0) > 0 ? (T.green || "#22c55e") : (T.red || "#ef4444") },
                    { label: "Net Income", val: fmtK(fc[2026]?.netIncome), color: (fc[2026]?.netIncome || 0) > 0 ? (T.green || "#22c55e") : (T.red || "#ef4444") },
                  ].map(kpi => (
                    <div key={kpi.label} style={{ padding: 12, borderRadius: 8, background: T.surface2 || T.bg, border: `1px solid ${T.border}` }}>
                      <div style={{ fontSize: 10, color: T.text3, textTransform: "uppercase", marginBottom: 4 }}>{kpi.label}</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: kpi.color, fontFamily: "monospace" }}>{kpi.val}</div>
                    </div>
                  ))}
                </div>
                {/* P&L Table */}
                <div style={{ display: "grid", gridTemplateColumns: "180px 1fr 1fr 1fr", padding: "6px 0", borderBottom: `1px solid ${T.border}`, marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: T.accent }}>P&L Forecast</div>
                  {[2026, 2027, 2028].map(y => <div key={y} style={{ fontSize: 13, fontWeight: 700, textAlign: "right", color: T.text, paddingRight: 8 }}>{y}</div>)}
                </div>
                <FcRow label="DTC Gross Sales" vals={{ 2026: fc[2026]?.dtcGross, 2027: fc[2027]?.dtcGross, 2028: fc[2028]?.dtcGross }} indent />
                <FcRow label="Amazon Gross Sales" vals={{ 2026: fc[2026]?.amznGross, 2027: fc[2027]?.amznGross, 2028: fc[2028]?.amznGross }} indent />
                <FcRow label="Retail Gross Sales" vals={{ 2026: fc[2026]?.retailGross, 2027: fc[2027]?.retailGross, 2028: fc[2028]?.retailGross }} indent />
                <FcRow label="Int'l Gross Sales" vals={{ 2026: fc[2026]?.intlGross, 2027: fc[2027]?.intlGross, 2028: fc[2028]?.intlGross }} indent />
                <FcRow label="Total Gross Sales" vals={{ 2026: fc[2026]?.totalGross, 2027: fc[2027]?.totalGross, 2028: fc[2028]?.totalGross }} bold />
                <FcRow label="Discounts" vals={{ 2026: fc[2026]?.disc, 2027: fc[2027]?.disc, 2028: fc[2028]?.disc }} indent neg />
                <FcRow label="Chargebacks" vals={{ 2026: fc[2026]?.cb, 2027: fc[2027]?.cb, 2028: fc[2028]?.cb }} indent neg />
                <FcRow label="Net Sales" vals={{ 2026: fc[2026]?.netSales, 2027: fc[2027]?.netSales, 2028: fc[2028]?.netSales }} bold />
                <FcRow label="Total COGS" vals={{ 2026: fc[2026]?.totalCOGS, 2027: fc[2027]?.totalCOGS, 2028: fc[2028]?.totalCOGS }} bold />
                <FcRow label="Gross Profit" vals={{ 2026: fc[2026]?.grossProfit, 2027: fc[2027]?.grossProfit, 2028: fc[2028]?.grossProfit }} bold />
                <FcPctRow label="  Gross Margin" vals={{ 2026: fc[2026]?.grossMargin, 2027: fc[2027]?.grossMargin, 2028: fc[2028]?.grossMargin }} />
                <FcRow label="Ad Spend" vals={{ 2026: fc[2026]?.adSpend, 2027: fc[2027]?.adSpend, 2028: fc[2028]?.adSpend }} indent />
                <FcRow label="Total G&A" vals={{ 2026: fc[2026]?.totalGA, 2027: fc[2027]?.totalGA, 2028: fc[2028]?.totalGA }} bold />
                <FcRow label="EBITDA" vals={{ 2026: fc[2026]?.ebitda, 2027: fc[2027]?.ebitda, 2028: fc[2028]?.ebitda }} bold />
                <FcPctRow label="  EBITDA Margin" vals={{ 2026: fc[2026]?.ebitdaMargin, 2027: fc[2027]?.ebitdaMargin, 2028: fc[2028]?.ebitdaMargin }} />
                <FcRow label="Net Income" vals={{ 2026: fc[2026]?.netIncome, 2027: fc[2027]?.netIncome, 2028: fc[2028]?.netIncome }} bold />
                <FcPctRow label="  Net Margin" vals={{ 2026: fc[2026]?.netMargin, 2027: fc[2027]?.netMargin, 2028: fc[2028]?.netMargin }} />
                {/* Revenue Mix Bars */}
                <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 8 }}>Revenue Mix — 2026</div>
                  {[
                    { label: "DTC", val: fc[2026]?.dtcGross, color: T.accent || "#3b82f6" },
                    { label: "Amazon", val: fc[2026]?.amznGross, color: "#f59e0b" },
                    { label: "Retail", val: fc[2026]?.retailGross, color: "#f97316" },
                    { label: "Int'l", val: fc[2026]?.intlGross, color: "#a855f7" },
                  ].map(ch => { const p = ch.val / (fc[2026]?.totalGross || 1); return (
                    <div key={ch.label} style={{ marginBottom: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                        <span style={{ fontSize: 11, color: T.text2 }}>{ch.label}</span>
                        <span style={{ fontSize: 11, fontFamily: "monospace", color: ch.color }}>{fmtK(ch.val)} ({(p * 100).toFixed(1)}%)</span>
                      </div>
                      <div style={{ height: 5, borderRadius: 3, background: T.surface3 || T.border }}>
                        <div style={{ width: `${p * 100}%`, height: "100%", borderRadius: 3, background: ch.color, transition: "width 0.3s" }} />
                      </div>
                    </div>
                  ); })}
                </div>
                {/* Retention Curve */}
                <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 8 }}>GWP Retention Curve</div>
                  <div style={{ display: "flex", gap: 3, alignItems: "end", height: 50 }}>
                    {curve.map((v, i) => <div key={i} style={{ flex: 1, background: T.accent || "#3b82f6", opacity: i === 0 ? 1 : 0.5 + v * 0.5, height: `${v * 100}%`, borderRadius: 2, minHeight: 2 }} title={`M${i}: ${(v*100).toFixed(0)}%`} />)}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}><span style={{ fontSize: 9, color: T.text3 }}>M0</span><span style={{ fontSize: 9, color: T.text3 }}>M11</span></div>
                </div>
              </div>
            </div>
          </>;
        })()}

        {tab === "Chart of Accounts" && (() => {
          const filtered = accounts.filter(a => { if (!glSearch) return true; const s = glSearch.toLowerCase(); return (a.code || "").toLowerCase().includes(s) || (a.name || "").toLowerCase().includes(s); });
          const grouped = {};
          const typeMap = { "1": "Assets (1xxxx)", "2": "Liabilities (2xxxx)", "3": "Equity (3xxxx)", "4": "Revenue (4xxxx)", "5": "Cost of Goods Sold (5xxxx)", "6": "Operating Expenses (6xxxx)" };
          filtered.forEach(a => { const prefix = (a.code || "0").substring(0, 1); const group = typeMap[prefix] || `Other (${prefix}xxxx)`; if (!grouped[group]) grouped[group] = []; grouped[group].push(a); });
          const acctBalances = {};
          expenses.forEach(e => { const m = accounts.find(a => e.title === `${a.code} ${a.name}` || e.title?.startsWith(a.code + " ")); if (m) acctBalances[m.id] = { bal: Number(e.total_amount || 0), txns: e.description?.match(/(\d+) txns/)?.[1] || "0", reportId: e.id }; });
          return <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: T.text }}>Chart of Accounts ({filtered.length})</h3>
              <input value={glSearch} onChange={e => setGlSearch(e.target.value)} placeholder="Search accounts..." style={{ ..._inp, width: 280 }} />
            </div>
            {Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0])).map(([group, accts]) => (
              <div key={group} style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.accent, marginBottom: 8, padding: "6px 0", borderBottom: `1px solid ${T.border}` }}>{group} ({accts.length})</div>
                <div style={{ borderRadius: 8, border: `1px solid ${T.border}`, overflow: "hidden" }}>
                  {accts.map(a => { const info = acctBalances[a.id] || {}; return (
                    <div key={a.id} style={{ display: "grid", gridTemplateColumns: "80px 1fr 80px 120px", alignItems: "center", padding: "8px 14px", borderBottom: `1px solid ${T.border}`, background: T.surface, cursor: info.reportId ? "pointer" : "default" }} onClick={() => info.reportId && (setTab("Expenses"), loadReportItems(info.reportId))} onMouseEnter={e => info.reportId && (e.currentTarget.style.background = T.surface2)} onMouseLeave={e => e.currentTarget.style.background = T.surface}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: T.accent, fontFamily: "monospace" }}>{a.code}</span>
                      <span style={{ fontSize: 13, color: T.text }}>{a.name}</span>
                      <span style={{ fontSize: 11, color: T.text3, textAlign: "right" }}>{info.txns || "0"} txns</span>
                      <span style={{ fontSize: 13, fontWeight: 600, textAlign: "right", fontVariantNumeric: "tabular-nums", color: (info.bal || 0) >= 0 ? T.text : (T.red || "#ef4444") }}>{info.bal ? fmt(info.bal) : "—"}</span>
                    </div>
                  ); })}
                </div>
              </div>
            ))}
          </>;
        })()}

        {tab === "Expenses" && (() => {
          const filtered = expenses.filter(e => { if (!expSearch) return true; const s = expSearch.toLowerCase(); return (e.title || "").toLowerCase().includes(s); });
          const sorted = [...filtered].sort((a, b) => {
            if (expSort === "amount") return Math.abs(Number(b.total_amount)) - Math.abs(Number(a.total_amount));
            if (expSort === "name") return (a.title || "").localeCompare(b.title || "");
            if (expSort === "count") { const ca = parseInt(a.description?.match(/(\d+) txns/)?.[1] || "0"); const cb = parseInt(b.description?.match(/(\d+) txns/)?.[1] || "0"); return cb - ca; }
            return 0;
          });
          return <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: T.text }}>Expense Reports ({filtered.length})</h3>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input value={expSearch} onChange={e => setExpSearch(e.target.value)} placeholder="Search..." style={{ ..._inp, width: 200 }} />
                <select value={expSort} onChange={e => setExpSort(e.target.value)} style={{ ..._sel, width: 140 }}><option value="amount">Sort: Amount</option><option value="name">Sort: Name</option><option value="count">Sort: Txn Count</option></select>
                <button onClick={() => setModal({ type: "expense", mode: "new", data: { status: "draft" } })} style={{ ..._btn, background: T.accent, color: "#fff", whiteSpace: "nowrap" }}>+ New</button>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: selectedReport ? "1fr 1fr" : "1fr", gap: 16 }}>
              <div style={{ borderRadius: 8, border: `1px solid ${T.border}`, overflow: "auto", maxHeight: "calc(100vh - 220px)" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead><tr style={{ background: T.surface2, position: "sticky", top: 0, zIndex: 1 }}>
                    <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: T.text2, fontSize: 12 }}>Account</th>
                    <th style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: T.text2, fontSize: 12 }}>Txns</th>
                    <th style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: T.text2, fontSize: 12 }}>Amount</th>
                  </tr></thead>
                  <tbody>{sorted.map(r => { const isSelected = selectedReport === r.id; return (
                    <tr key={r.id} onClick={() => loadReportItems(r.id)} style={{ cursor: "pointer", borderBottom: `1px solid ${T.border}`, background: isSelected ? (T.accentDim || "#dbeafe") : "transparent" }} onMouseEnter={e => !isSelected && (e.currentTarget.style.background = T.surface2)} onMouseLeave={e => !isSelected && (e.currentTarget.style.background = "transparent")}>
                      <td style={{ padding: "8px 12px", color: T.text }}>{r.title}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right", color: T.text3, fontSize: 12 }}>{r.description?.match(/(\d+) txns/)?.[1] || "—"}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: Number(r.total_amount) < 0 ? (T.red || "#ef4444") : T.text }}>{fmt(r.total_amount)}</td>
                    </tr>
                  ); })}</tbody>
                </table>
              </div>
              {selectedReport && <div style={{ borderRadius: 8, border: `1px solid ${T.border}`, overflow: "auto", maxHeight: "calc(100vh - 220px)" }}>
                <div style={{ padding: "10px 14px", background: T.surface2, borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center", position: "sticky", top: 0, zIndex: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{expenses.find(e => e.id === selectedReport)?.title} — {selectedItems.length} txns</span>
                  <button onClick={() => { setSelectedReport(null); setSelectedItems([]); }} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 16 }}>×</button>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead><tr style={{ background: T.surface2, position: "sticky", top: 41, zIndex: 1 }}>
                    <th style={{ padding: "6px 10px", textAlign: "left", fontWeight: 600, color: T.text2, fontSize: 11 }}>Date</th>
                    <th style={{ padding: "6px 10px", textAlign: "left", fontWeight: 600, color: T.text2, fontSize: 11 }}>Description</th>
                    <th style={{ padding: "6px 10px", textAlign: "right", fontWeight: 600, color: T.text2, fontSize: 11 }}>Amount</th>
                  </tr></thead>
                  <tbody>{selectedItems.map((item, i) => { let meta = {}; try { meta = JSON.parse(item.notes || "{}"); } catch(e) {} return (
                    <tr key={item.id || i} style={{ borderBottom: `1px solid ${T.border}` }}>
                      <td style={{ padding: "6px 10px", color: T.text3, whiteSpace: "nowrap", fontSize: 12 }}>{item.date}</td>
                      <td style={{ padding: "6px 10px", color: T.text }}><div style={{ fontSize: 12 }}>{item.vendor_name || item.description}</div>{meta.txn_type && <div style={{ fontSize: 10, color: T.text3 }}>{meta.txn_type}{meta.split ? ` → ${meta.split}` : ""}</div>}</td>
                      <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: Number(item.amount) < 0 ? (T.red || "#ef4444") : T.text }}>{fmt(item.amount)}</td>
                    </tr>
                  ); })}</tbody>
                </table>
              </div>}
            </div>
          </>;
        })()}

        {tab === "Budgets" && <>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: T.text }}>Budgets</h3>
            <button onClick={() => setModal({ type: "budget", mode: "new", data: { status: "draft", fiscal_year: new Date().getFullYear() } })} style={{ ..._btn, background: T.accent, color: "#fff" }}>+ New Budget</button>
          </div>
          <Table columns={[
            { label: "Name", key: "name" },
            { label: "Year", key: "fiscal_year", nowrap: true },
            { label: "Total", align: "right", render: r => fmt(r.total_amount), nowrap: true },
            { label: "Spent", align: "right", render: r => { const bl = budgetLines.filter(l => l.budget_id === r.id); const spent = bl.reduce((s, l) => s + Number(l.spent_amount || 0), 0); return fmt(spent); }, nowrap: true },
            { label: "Remaining", align: "right", render: r => { const bl = budgetLines.filter(l => l.budget_id === r.id); const spent = bl.reduce((s, l) => s + Number(l.spent_amount || 0), 0); return fmt(Number(r.total_amount || 0) - spent); }, nowrap: true },
            { label: "Utilization", render: r => { const bl = budgetLines.filter(l => l.budget_id === r.id); const spent = bl.reduce((s, l) => s + Number(l.spent_amount || 0), 0); const p = pct(spent, r.total_amount); return (<div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 60, height: 6, borderRadius: 3, background: T.surface3 }}><div style={{ width: `${Math.min(100, p)}%`, height: "100%", borderRadius: 3, background: p > 90 ? (T.red || "#ef4444") : p > 70 ? "#f97316" : (T.green || "#22c55e") }} /></div><span style={{ fontSize: 11, fontWeight: 600, color: T.text3 }}>{p}%</span></div>); } },
            { label: "Status", render: r => <StatusPill status={r.status} /> },
            { label: "", align: "right", render: r => <button onClick={e => { e.stopPropagation(); deleteRecord("fin_budgets", r.id, budgets, setBudgets); }} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 14, opacity: 0.4 }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.4}>×</button> }
          ]} data={budgets} onRowClick={r => setModal({ type: "budget", mode: "edit", data: r })} emptyMsg="No budgets — create your first budget to start tracking" />
        </>}

        {tab === "Purchase Orders" && <>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: T.text }}>Purchase Orders</h3>
            <button onClick={() => setModal({ type: "po", mode: "new", data: { status: "draft", priority: "normal" } })} style={{ ..._btn, background: T.accent, color: "#fff" }}>+ New PO</button>
          </div>
          <Table columns={[
            { label: "PO #", key: "po_number", nowrap: true },
            { label: "Title", key: "title" },
            { label: "Vendor", render: r => vname(r.vendor_id) },
            { label: "Amount", align: "right", render: r => fmt(r.total_amount), nowrap: true },
            { label: "Required By", render: r => r.required_by || "—", nowrap: true },
            { label: "Status", render: r => <StatusPill status={r.status} /> },
            { label: "", align: "right", render: r => (
              <div style={{ display: "flex", gap: 4 }}>
                {r.status === "draft" && <button onClick={e => { e.stopPropagation(); submitForApproval("purchase_order", r.id, r.total_amount); }} style={{ ..._btn, background: "#f97316", color: "#fff", padding: "3px 8px", fontSize: 11 }}>Submit</button>}
                <button onClick={e => { e.stopPropagation(); deleteRecord("fin_purchase_orders", r.id, pos, setPOs); }} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 14, opacity: 0.4 }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.4}>×</button>
              </div>
            )}
          ]} data={pos} onRowClick={r => setModal({ type: "po", mode: "edit", data: r })} emptyMsg="No purchase orders yet" />
        </>}

        {tab === "Invoices" && <>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: T.text }}>Invoices</h3>
            <button onClick={() => setModal({ type: "invoice", mode: "new", data: { status: "received" } })} style={{ ..._btn, background: T.accent, color: "#fff" }}>+ New Invoice</button>
          </div>
          <Table columns={[
            { label: "Ref", render: r => r.internal_ref || r.invoice_number, nowrap: true },
            { label: "Vendor Invoice #", key: "invoice_number" },
            { label: "Vendor", render: r => vname(r.vendor_id) },
            { label: "Amount", align: "right", render: r => fmt(r.total_amount), nowrap: true },
            { label: "Due", render: r => r.due_date || "—", nowrap: true },
            { label: "Paid", align: "right", render: r => fmt(r.amount_paid), nowrap: true },
            { label: "Status", render: r => <StatusPill status={r.status} /> },
            { label: "", align: "right", render: r => (
              <div style={{ display: "flex", gap: 4 }}>
                {["received", "under_review"].includes(r.status) && <button onClick={e => { e.stopPropagation(); submitForApproval("invoice", r.id, r.total_amount); }} style={{ ..._btn, background: "#f97316", color: "#fff", padding: "3px 8px", fontSize: 11 }}>Submit</button>}
                <button onClick={e => { e.stopPropagation(); deleteRecord("fin_invoices", r.id, invoices, setInvoices); }} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 14, opacity: 0.4 }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.4}>×</button>
              </div>
            )}
          ]} data={invoices} onRowClick={r => setModal({ type: "invoice", mode: "edit", data: r })} emptyMsg="No invoices yet" />
        </>}

        {tab === "Vendors" && <>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: T.text }}>Vendors</h3>
            <button onClick={() => setModal({ type: "vendor", mode: "new", data: { payment_terms: "net_30" } })} style={{ ..._btn, background: T.accent, color: "#fff" }}>+ New Vendor</button>
          </div>
          <Table columns={[
            { label: "Name", key: "name" },
            { label: "Code", key: "code" },
            { label: "Contact", key: "contact_name" },
            { label: "Email", key: "contact_email" },
            { label: "Terms", render: r => (r.payment_terms || "").replace(/_/g, " ") },
            { label: "Category", key: "category" },
            { label: "POs", render: r => pos.filter(p => p.vendor_id === r.id).length },
            { label: "Total Spend", align: "right", render: r => fmt(invoices.filter(i => i.vendor_id === r.id).reduce((s, i) => s + Number(i.total_amount || 0), 0)), nowrap: true },
            { label: "", align: "right", render: r => <button onClick={e => { e.stopPropagation(); deleteRecord("fin_vendors", r.id, vendors, setVendors); }} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 14, opacity: 0.4 }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.4}>×</button> }
          ]} data={vendors} onRowClick={r => setModal({ type: "vendor", mode: "edit", data: r })} emptyMsg="No vendors yet — add your first vendor" />
        </>}

        {tab === "Import" && (() => {
          const IMPORT_TYPES = {
            vendors: { table: "fin_vendors", label: "Vendors", fields: [
              { key: "name", label: "Vendor Name", required: true },
              { key: "code", label: "Vendor Code" },
              { key: "contact_name", label: "Contact Name" },
              { key: "contact_email", label: "Contact Email" },
              { key: "contact_phone", label: "Phone" },
              { key: "payment_terms", label: "Payment Terms" },
              { key: "category", label: "Category" },
              { key: "tax_id", label: "Tax ID / EIN" },
              { key: "notes", label: "Notes" },
            ]},
            accounts: { table: "fin_accounts", label: "Chart of Accounts", fields: [
              { key: "name", label: "Account Name", required: true },
              { key: "code", label: "Account Code / Number" },
              { key: "type", label: "Type (expense/revenue/asset/liability)" },
              { key: "description", label: "Description" },
            ]},
            purchase_orders: { table: "fin_purchase_orders", label: "Purchase Orders", fields: [
              { key: "po_number", label: "PO Number", required: true },
              { key: "title", label: "Title / Memo", required: true },
              { key: "vendor_name", label: "Vendor Name (will match existing)", lookup: "vendor" },
              { key: "total_amount", label: "Total Amount", numeric: true },
              { key: "subtotal", label: "Subtotal", numeric: true },
              { key: "tax_amount", label: "Tax Amount", numeric: true },
              { key: "status", label: "Status" },
              { key: "order_date", label: "Order Date" },
              { key: "required_by", label: "Required By Date" },
              { key: "notes", label: "Notes / Memo" },
            ]},
            expenses: { table: "fin_expense_reports", label: "Expense Reports", fields: [
              { key: "report_number", label: "Report Number", required: true },
              { key: "title", label: "Title", required: true },
              { key: "total_amount", label: "Total Amount", numeric: true },
              { key: "status", label: "Status" },
              { key: "description", label: "Description" },
              { key: "notes", label: "Notes" },
            ]},
            expense_items: { table: "fin_expense_items", label: "Expense Line Items", fields: [
              { key: "report_number", label: "Report Number (to match parent)", lookup: "expense" },
              { key: "date", label: "Date" },
              { key: "category", label: "Category" },
              { key: "description", label: "Description", required: true },
              { key: "amount", label: "Amount", required: true, numeric: true },
              { key: "vendor_name", label: "Vendor / Payee" },
            ]},
            invoices: { table: "fin_invoices", label: "Invoices (Bills)", fields: [
              { key: "invoice_number", label: "Invoice / Bill Number", required: true },
              { key: "title", label: "Title / Memo" },
              { key: "vendor_name", label: "Vendor Name (will match existing)", lookup: "vendor" },
              { key: "total_amount", label: "Total Amount", required: true, numeric: true },
              { key: "tax_amount", label: "Tax", numeric: true },
              { key: "invoice_date", label: "Invoice Date" },
              { key: "due_date", label: "Due Date" },
              { key: "status", label: "Status" },
              { key: "notes", label: "Notes / Memo" },
            ]},
            payments: { table: "fin_payments", label: "Payments", fields: [
              { key: "invoice_number", label: "Invoice # (to match)", lookup: "invoice" },
              { key: "amount", label: "Amount", required: true, numeric: true },
              { key: "payment_date", label: "Payment Date" },
              { key: "payment_method", label: "Method (ach/wire/check/credit_card)" },
              { key: "reference_number", label: "Reference / Check #" },
              { key: "notes", label: "Notes" },
            ]},
          };

          const cfg = IMPORT_TYPES[importType];

          const parseCSV = (text, delim = ",") => {
            const lines = text.split(/\r?\n/).filter(l => l.trim());
            if (lines.length < 2) return null;
            const parseLine = (line) => {
              if (delim === "\t") return line.split("\t").map(c => c.trim().replace(/^"|"$/g, ""));
              const result = []; let current = ""; let inQuotes = false;
              for (let i = 0; i < line.length; i++) {
                const c = line[i];
                if (c === '"') { inQuotes = !inQuotes; }
                else if (c === delim && !inQuotes) { result.push(current.trim()); current = ""; }
                else { current += c; }
              }
              result.push(current.trim());
              return result;
            };
            const headers = parseLine(lines[0]);
            const rows = lines.slice(1).map(parseLine).filter(r => r.some(c => c));
            return { headers, rows };
          };

          const handleFile = (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const ext = file.name.split(".").pop().toLowerCase();

            if (ext === "xlsx" || ext === "xls") {
              setImporting(true);
              showToast("Processing Excel file...");
              const reader = new FileReader();
              reader.onload = async (ev) => {
                try {
                  // Load SheetJS if not already loaded
                  if (!window.XLSX) {
                    await new Promise((resolve, reject) => {
                      const script = document.createElement("script");
                      script.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
                      script.onload = resolve;
                      script.onerror = reject;
                      document.head.appendChild(script);
                    });
                  }
                  const wb = window.XLSX.read(new Uint8Array(ev.target.result), { type: "array" });
                  const ws = wb.Sheets[wb.SheetNames[0]];
                  
                  const A2 = ws["A2"]?.v || "";
                  if (A2?.toString().includes("Transaction Detail")) {
                    await handleTxnDetailImport(ws);
                    return;
                  }
                  
                  const csv = window.XLSX.utils.sheet_to_csv(ws);
                  processCSVText(csv);
                  setImporting(false);
                } catch (err) {
                  console.error("XLSX parse error:", err);
                  showToast("Could not parse Excel file: " + err.message, "error");
                  setImporting(false);
                }
              };
              reader.readAsArrayBuffer(file);
              return;
            }

            // CSV/TSV — try multiple encodings
            const tryRead = (encoding) => {
              const reader = new FileReader();
              reader.onload = (ev) => {
                let text = ev.target.result;
                // Strip BOM
                if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
                // Check for garbled characters (replacement char or lots of nulls)
                const garbled = (text.match(/\uFFFD/g) || []).length > 5 || (text.match(/\x00/g) || []).length > 5;
                if (garbled && encoding === "UTF-8") {
                  // Retry with UTF-16LE (common QBO encoding)
                  tryRead("UTF-16LE");
                  return;
                }
                if (garbled && encoding === "UTF-16LE") {
                  tryRead("windows-1252");
                  return;
                }
                processCSVText(text);
              };
              reader.readAsText(file, encoding);
            };
            tryRead("UTF-8");
          };

          const handleTxnDetailImport = async (ws) => {
            showToast("Detected QBO Transaction Detail by Account — parsing...");
            try {
              const range = window.XLSX.utils.decode_range(ws["!ref"]);
              const accounts = [];
              const transactions = [];
              let currentAccount = null;
              
              for (let r = 5; r <= range.e.r; r++) {
                const cellA = ws[window.XLSX.utils.encode_cell({ r, c: 0 })]?.v;
                const cellB = ws[window.XLSX.utils.encode_cell({ r, c: 1 })]?.v;
                
                // Account header row: col A has value, col B empty
                if (cellA && !cellB) {
                  const acct = String(cellA).trim();
                  if (acct && !acct.startsWith("Total") && !acct.startsWith("TOTAL")) {
                    currentAccount = acct;
                    if (!accounts.includes(acct)) accounts.push(acct);
                  }
                  continue;
                }
                
                // Transaction row: col B has date
                if (cellB && currentAccount) {
                  const dateVal = cellB;
                  let dateStr = "";
                  if (typeof dateVal === "number") {
                    // Excel serial date
                    const d = new Date((dateVal - 25569) * 86400000);
                    dateStr = `${String(d.getMonth()+1).padStart(2,"0")}/${String(d.getDate()).padStart(2,"0")}/${d.getFullYear()}`;
                  } else {
                    dateStr = String(dateVal);
                  }
                  
                  transactions.push({
                    account: currentAccount,
                    date: dateStr,
                    type: String(ws[window.XLSX.utils.encode_cell({ r, c: 2 })]?.v || ""),
                    num: String(ws[window.XLSX.utils.encode_cell({ r, c: 3 })]?.v || ""),
                    name: String(ws[window.XLSX.utils.encode_cell({ r, c: 4 })]?.v || ""),
                    cls: String(ws[window.XLSX.utils.encode_cell({ r, c: 5 })]?.v || ""),
                    memo: String(ws[window.XLSX.utils.encode_cell({ r, c: 6 })]?.v || ""),
                    split: String(ws[window.XLSX.utils.encode_cell({ r, c: 7 })]?.v || ""),
                    amount: Number(ws[window.XLSX.utils.encode_cell({ r, c: 8 })]?.v) || 0,
                  });
                }
              }
              
              showToast(`Parsed ${accounts.length} GL accounts, ${transactions.length} transactions — importing in batches...`);
              
              const { data: { session } } = await supabase.auth.getSession();
              const hdrs = { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token || ""}` };
              const url = `https://upbjdmnykheubxkuknuj.supabase.co/functions/v1/import-expenses`;
              
              // Step 1: Send accounts only
              const r1 = await (await fetch(url, { method: "POST", headers: hdrs, body: JSON.stringify({ import_type: "txn_detail", accounts, transactions: [] }) })).json();
              if (r1.error) { showToast("Account import error: " + r1.error, "error"); setImporting(false); return; }
              showToast(`Created ${r1.accounts} GL accounts — importing ${transactions.length} transactions...`);
              
              // Step 2: Send transactions in batches of 2000
              const TBATCH = 2000;
              let totalReports = 0, totalItems = 0;
              for (let i = 0; i < transactions.length; i += TBATCH) {
                const chunk = transactions.slice(i, i + TBATCH);
                const rn = await (await fetch(url, { method: "POST", headers: hdrs, body: JSON.stringify({ import_type: "txn_detail", accounts: [], transactions: chunk }) })).json();
                if (rn.error) { showToast(`Batch ${Math.floor(i/TBATCH)+1} error: ${rn.error}`, "error"); continue; }
                totalReports += rn.reports || 0;
                totalItems += rn.items || 0;
                showToast(`Batch ${Math.floor(i/TBATCH)+1}/${Math.ceil(transactions.length/TBATCH)} done — ${totalItems} items so far...`);
              }
              
              showToast(`Done! ${r1.accounts} GL accounts, ${totalReports} reports, ${totalItems} transactions imported`);
              const [er, ea] = await Promise.all([
                supabase.from("fin_expense_reports").select("*").eq("org_id", orgId).order("created_at", { ascending: false }),
                supabase.from("fin_accounts").select("*").eq("org_id", orgId),
              ]);
              setExpenses(er.data || []);
              setAccounts(ea.data || []);
            } catch (err) {
              console.error("Txn detail import error:", err);
              showToast("Import failed: " + err.message, "error");
            }
            setImporting(false);
          };

          const handlePivotImport = async (text, delimiter) => {
            setImporting(true);
            showToast("Detected QBO Expenses by Vendor Summary — unpivoting and importing...");
            try {
              const lines = text.split(/\r?\n/).filter(l => l.trim());
              const parseLine = (line) => {
                const result = []; let current = ""; let inQ = false;
                for (let i = 0; i < line.length; i++) {
                  const c = line[i];
                  if (c === '"') inQ = !inQ;
                  else if (c === ',' && !inQ) { result.push(current.trim()); current = ""; }
                  else current += c;
                }
                result.push(current.trim());
                return result;
              };
              // Find header row (the one starting with "Vendor" and having dates)
              let headerIdx = -1;
              for (let i = 0; i < Math.min(10, lines.length); i++) {
                if (lines[i].startsWith("Vendor,")) { headerIdx = i; break; }
              }
              if (headerIdx < 0) { showToast("Could not find Vendor header row", "error"); setImporting(false); return; }
              const headers = parseLine(lines[headerIdx]);
              const dates = headers.slice(1, -1); // skip Vendor and Total
              // Parse data rows
              const expenses = [];
              for (let i = headerIdx + 1; i < lines.length; i++) {
                const cells = parseLine(lines[i]);
                const vendor = cells[0];
                if (!vendor || vendor === "TOTAL" || vendor.startsWith("Accrual")) continue;
                for (let d = 0; d < dates.length; d++) {
                  const raw = (cells[d + 1] || "").replace(/[\$,]/g, "").trim();
                  const amount = parseFloat(raw);
                  if (!raw || isNaN(amount) || amount === 0) continue;
                  const parts = dates[d].split("/");
                  const isoDate = parts.length === 3 ? `${parts[2]}-${parts[0].padStart(2,"0")}-${parts[1].padStart(2,"0")}` : dates[d];
                  expenses.push({ vendor_name: vendor, date: isoDate, amount });
                }
              }
              showToast(`Parsed ${expenses.length} expense items from ${new Set(expenses.map(e => e.vendor_name)).size} vendors — sending to server...`);
              // Call edge function
              const { data: { session } } = await supabase.auth.getSession();
              const resp = await fetch(`https://upbjdmnykheubxkuknuj.supabase.co/functions/v1/import-expenses`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token || ""}` },
                body: JSON.stringify({ expenses })
              });
              const result = await resp.json();
              if (result.error) { showToast("Import error: " + result.error, "error"); }
              else {
                showToast(`Imported ${result.reports} expense reports with ${result.items} line items!`);
                // Refresh
                const { data: er } = await supabase.from("fin_expense_reports").select("*").eq("org_id", orgId).order("created_at", { ascending: false });
                setExpenses(er || []);
              }
            } catch (err) {
              console.error("Pivot import error:", err);
              showToast("Import failed: " + err.message, "error");
            }
            setImporting(false);
          };

          const processCSVText = (text) => {
            // Detect delimiter (tab vs comma)
            const firstLine = text.split(/\r?\n/)[0] || "";
            const tabCount = (firstLine.match(/\t/g) || []).length;
            const commaCount = (firstLine.match(/,/g) || []).length;
            const delimiter = tabCount > commaCount ? "\t" : ",";

            // Detect QBO pivot table format (Expenses by Vendor Summary)
            const lines = text.split(/\r?\n/).filter(l => l.trim());
            if (lines[0]?.includes("Expenses by Vendor") || (lines.length > 4 && lines[4]?.match(/^Vendor,\d{2}\/\d{2}\/\d{4}/))) {
              handlePivotImport(text, delimiter);
              return;
            }

            const parsed = parseCSV(text, delimiter);
            if (!parsed || parsed.rows.length === 0) return showToast("Could not parse file — check the format", "error");
            setCsvData(parsed);
            const autoMap = {};
            const usedCols = new Set();
            cfg.fields.forEach(f => {
              const fk = f.key.toLowerCase().replace(/_/g, "");
              const fl = f.label.toLowerCase();
              let bestMatch = -1; let bestScore = 0;
              parsed.headers.forEach((h, i) => {
                if (usedCols.has(i)) return;
                const hl = h.toLowerCase().trim();
                const hc = hl.replace(/[^a-z0-9]/g, "");
                let score = 0;
                if (hc === fk) score = 100;                           // exact: "vendor" == "vendor"
                else if (hl === fl) score = 95;                        // exact label match
                else if (hc === fk.replace(/name$/, "")) score = 80;   // "vendor" matches "vendorname"
                else if (hl.replace(/[^a-z0-9 ]/g, "") === fl.replace(/[^a-z0-9 ]/g, "")) score = 75;
                else if (hc === "name" && fk === "name") score = 90;
                else if (hc === "email" && fk.includes("email")) score = 85;
                else if (hc === "phone" && fk.includes("phone")) score = 85;
                else if (hc === "vendor" && fk === "name") score = 70;  // QBO "Vendor" column = vendor name
                else if (hc === "companyname" && fk === "contactname") score = 60;
                else if (hl.includes("company") && fk === "contactname") score = 55;
                if (score > bestScore) { bestScore = score; bestMatch = i; }
              });
              if (bestMatch >= 0 && bestScore >= 55) {
                autoMap[f.key] = bestMatch;
                usedCols.add(bestMatch);
              }
            });
            setColMap(autoMap);
            // Auto-generate preview
            const previewRows = parsed.rows.slice(0, 5).map(row => {
              const obj = {};
              cfg.fields.forEach(fld => {
                const ci = autoMap[fld.key];
                if (ci !== undefined && ci !== "" && ci !== -1) {
                  let val = row[ci] || "";
                  if (fld.numeric) val = parseFloat(String(val).replace(/[^0-9.\-]/g, "")) || 0;
                  obj[fld.key] = val;
                }
              });
              return obj;
            });
            setImportPreview(previewRows);
          };

          const buildPreview = () => {
            if (!csvData) return;
            const rows = csvData.rows.slice(0, 5).map(row => {
              const obj = {};
              cfg.fields.forEach(f => {
                const ci = colMap[f.key];
                if (ci !== undefined && ci !== "" && ci !== -1) {
                  let val = row[ci] || "";
                  if (f.numeric) val = parseFloat(val.replace(/[^0-9.\-]/g, "")) || 0;
                  obj[f.key] = val;
                }
              });
              return obj;
            });
            setImportPreview(rows);
          };

          const runImport = async () => {
            if (!csvData || importing) return;
            setImporting(true);
            let imported = 0; let errors = 0;
            const vendorMap = {}; vendors.forEach(v => vendorMap[v.name.toLowerCase()] = v.id);
            const expMap = {}; expenses.forEach(e => expMap[e.report_number?.toLowerCase()] = e.id);
            const invMap = {}; invoices.forEach(i => invMap[i.invoice_number?.toLowerCase()] = i.id);

            // Build all records first
            const records = [];
            for (const row of csvData.rows) {
              const obj = { org_id: orgId };
              let skip = false;
              cfg.fields.forEach(f => {
                const ci = colMap[f.key];
                if (ci !== undefined && ci !== "" && ci !== -1) {
                  let val = row[ci] || "";
                  if (f.numeric) val = parseFloat(String(val).replace(/[^0-9.\-]/g, "")) || 0;
                  if (f.required && !val && val !== 0) skip = true;
                  if (f.key === "vendor_name" && f.lookup === "vendor") {
                    const vid = vendorMap[String(val).toLowerCase()];
                    if (vid) obj.vendor_id = vid;
                    return;
                  }
                  if (f.key === "report_number" && f.lookup === "expense") {
                    const eid = expMap[String(val).toLowerCase()];
                    if (eid) obj.report_id = eid;
                    return;
                  }
                  if (f.key === "invoice_number" && f.lookup === "invoice") {
                    const iid = invMap[String(val).toLowerCase()];
                    if (iid) obj.invoice_id = iid;
                    return;
                  }
                  obj[f.key] = val;
                }
              });
              if (skip) { errors++; continue; }
              if (cfg.table === "fin_purchase_orders" && !obj.status) obj.status = "draft";
              if (cfg.table === "fin_expense_reports" && !obj.status) obj.status = "draft";
              if (cfg.table === "fin_invoices" && !obj.status) obj.status = "received";
              if (cfg.table === "fin_accounts" && !obj.type) obj.type = "expense";
              if (cfg.table === "fin_accounts" && !obj.code) obj.code = String(imported + errors + 1).padStart(4, "0");
              if (cfg.table === "fin_accounts" && obj.name) {
                // Skip QBO report sub-headers
                const skip_names = ["full name", "name", "account", "type", "detail type", "description", "balance", ""];
                if (skip_names.includes(obj.name.toLowerCase().trim())) { errors++; continue; }
              }
              if (cfg.table === "fin_expense_items" && !obj.category) obj.category = "other";
              if (cfg.table === "fin_payments" && !obj.status) obj.status = "completed";
              if (["fin_expense_items"].includes(cfg.table)) delete obj.org_id;
              // Skip rows where all values are empty (blank separator rows in reports)
              const vals = Object.entries(obj).filter(([k]) => k !== "org_id" && k !== "status" && k !== "type" && k !== "category" && k !== "code");
              if (vals.length === 0 || vals.every(([_, v]) => !v && v !== 0)) { errors++; continue; }
              records.push(obj);
            }

            // Batch insert in chunks of 500
            const BATCH = 500;
            for (let i = 0; i < records.length; i += BATCH) {
              const chunk = records.slice(i, i + BATCH);
              const { data, error } = await supabase.from(cfg.table).insert(chunk).select("id");
              if (error) {
                console.error("Batch insert error at offset", i, error);
                // Fallback: try inserting one by one for this chunk
                for (const obj of chunk) {
                  const { error: e2 } = await supabase.from(cfg.table).insert(obj);
                  if (e2) errors++;
                  else imported++;
                }
              } else {
                imported += (data || chunk).length;
              }
            }

            // Refresh data
            if (cfg.table === "fin_vendors") { const { data } = await supabase.from("fin_vendors").select("*").eq("org_id", orgId); setVendors(data || []); }
            if (cfg.table === "fin_accounts") { const { data } = await supabase.from("fin_accounts").select("*").eq("org_id", orgId); setAccounts(data || []); }
            if (cfg.table === "fin_purchase_orders") { const { data } = await supabase.from("fin_purchase_orders").select("*").eq("org_id", orgId); setPOs(data || []); }
            if (cfg.table === "fin_expense_reports") { const { data } = await supabase.from("fin_expense_reports").select("*").eq("org_id", orgId); setExpenses(data || []); }
            if (cfg.table === "fin_invoices") { const { data } = await supabase.from("fin_invoices").select("*").eq("org_id", orgId); setInvoices(data || []); }
            if (cfg.table === "fin_payments") { const { data } = await supabase.from("fin_payments").select("*").eq("org_id", orgId); setPayments(data || []); }

            setImporting(false);
            setCsvData(null); setColMap({}); setImportPreview(null);
            showToast(`Imported ${imported} records${errors > 0 ? ` (${errors} skipped/errors)` : ""}`);
          };

          return <>
            <h3 style={{ margin: "0 0 8px", fontSize: 16, fontWeight: 700, color: T.text }}>Import from CSV</h3>
            <p style={{ fontSize: 13, color: T.text3, marginBottom: 16, marginTop: 0 }}>
              Export your data from QuickBooks Online as CSV/Excel, then upload it here. Map columns to Helm fields and import.
            </p>

            {/* Step 1: Choose type */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              {Object.entries(IMPORT_TYPES).map(([k, v]) => (
                <button key={k} onClick={() => { setImportType(k); setCsvData(null); setColMap({}); setImportPreview(null); }}
                  style={{ ..._btn, padding: "8px 14px", fontSize: 12, background: importType === k ? T.accent : T.surface2, color: importType === k ? "#fff" : T.text2, border: importType === k ? "none" : `1px solid ${T.border}` }}>{v.label}</button>
              ))}
            </div>

            {/* QBO export tips */}
            <div style={{ background: T.surface2, borderRadius: 8, padding: 16, marginBottom: 16, border: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 8 }}>QuickBooks Online Export Tips for {cfg.label}</div>
              <div style={{ fontSize: 12, color: T.text3, lineHeight: 1.6 }}>
                {importType === "vendors" && "In QBO: Go to Expenses → Vendors → Export to Excel. The CSV will include vendor name, email, phone, and terms."}
                {importType === "accounts" && "In QBO: Go to Settings (⚙) → Chart of Accounts → Export to Excel (icon next to Print). If the export has a single 'Account List' column, map it to Account Name — codes will be auto-generated. For separate columns, try Reports → Account List → Export."}
                {importType === "purchase_orders" && "In QBO: Go to Reports → Transaction List → filter by Transaction Type = 'Purchase Order' → Export to Excel."}
                {importType === "expenses" && "In QBO: Go to Reports → Expenses by Vendor Summary/Detail → Export to Excel. Or use Transaction List filtered to Expense type."}
                {importType === "expense_items" && "In QBO: Go to Reports → Transaction Detail → filter to Expenses → Export to Excel. Each row will be one expense line."}
                {importType === "invoices" && "In QBO: Go to Reports → Transaction List → filter by Transaction Type = 'Bill' → Export to Excel. Bills in QBO = vendor invoices."}
                {importType === "payments" && "In QBO: Go to Reports → Transaction List → filter by Transaction Type = 'Bill Payment' → Export to Excel."}
              </div>
            </div>

            {/* Step 2: Upload */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ ..._btn, background: T.accent, color: "#fff", display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></svg>
                Upload CSV
                <input type="file" accept=".csv,.tsv,.txt,.xls,.xlsx" onChange={handleFile} style={{ display: "none" }} />
              </label>
              {csvData && <span style={{ marginLeft: 12, fontSize: 13, color: T.green || "#22c55e", fontWeight: 600 }}>✓ {csvData.rows.length} rows loaded ({csvData.headers.length} columns)</span>}
            </div>

            {/* Step 3: Map columns */}
            {csvData && <>
              <div style={{ background: T.surface, borderRadius: 8, padding: 16, border: `1px solid ${T.border}`, marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 12 }}>Map Columns</div>
                <div style={{ fontSize: 11, color: T.text3, marginBottom: 12 }}>Match your CSV columns to Helm fields. Required fields are marked with *</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {cfg.fields.map(f => (
                    <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 12, color: T.text2, minWidth: 160, fontWeight: f.required ? 600 : 400 }}>{f.label}{f.required ? " *" : ""}</span>
                      <select value={colMap[f.key] ?? ""} onChange={e => setColMap(p => ({ ...p, [f.key]: e.target.value === "" ? "" : Number(e.target.value) }))}
                        style={{ ..._sel, flex: 1, fontSize: 12, padding: "5px 8px" }}>
                        <option value="">— skip —</option>
                        {csvData.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                      </select>
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <button onClick={buildPreview} style={{ ..._btn, background: T.surface3, color: T.text2, fontSize: 12 }}>Preview</button>
                  <button onClick={runImport} disabled={importing} style={{ ..._btn, background: T.accent, color: "#fff", fontSize: 12, opacity: importing ? 0.5 : 1 }}>
                    {importing ? "Importing…" : `Import ${csvData.rows.length} Records`}
                  </button>
                </div>
              </div>

              {/* Preview table */}
              {importPreview && <div style={{ overflow: "auto", borderRadius: 8, border: `1px solid ${T.border}`, marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.text3, padding: "8px 12px", background: T.surface2, borderBottom: `1px solid ${T.border}` }}>Preview (first 5 rows)</div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead><tr>{cfg.fields.filter(f => colMap[f.key] !== undefined && colMap[f.key] !== "").map(f => <th key={f.key} style={{ padding: "6px 10px", textAlign: "left", fontWeight: 600, color: T.text2, borderBottom: `1px solid ${T.border}`, fontSize: 11, background: T.surface2 }}>{f.label}</th>)}</tr></thead>
                  <tbody>{importPreview.map((row, i) => <tr key={i}>{cfg.fields.filter(f => colMap[f.key] !== undefined && colMap[f.key] !== "").map(f => <td key={f.key} style={{ padding: "6px 10px", borderBottom: `1px solid ${T.border}`, color: T.text, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{String(row[f.key] ?? "")}</td>)}</tr>)}</tbody>
                </table>
              </div>}

              {/* Raw data peek */}
              <div style={{ background: T.surface2, borderRadius: 8, padding: 12, border: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.text3, marginBottom: 8 }}>Raw CSV Headers</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {csvData.headers.map((h, i) => <span key={i} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 4, background: T.surface3, color: T.text2 }}>{i}: {h}</span>)}
                </div>
              </div>
            </>}
          </>;
        })()}
      </div>
      <ModalForm />
    </div>
  );
}
