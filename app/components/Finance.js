"use client";
import { useState, useEffect, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { T } from "../tokens";

const TABS = ["Dashboard", "Budgets", "Purchase Orders", "Expenses", "Invoices", "Vendors", "Import"];
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

  const showToast = useCallback((msg, type = "success") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); }, []);
  const orgId = profile?.org_id;

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      const [b, bl, po, pol, ex, exi, inv, il, v, a, ap, pay, pr] = await Promise.all([
        supabase.from("fin_budgets").select("*").eq("org_id", orgId),
        supabase.from("fin_budget_lines").select("*"),
        supabase.from("fin_purchase_orders").select("*").eq("org_id", orgId).order("created_at", { ascending: false }),
        supabase.from("fin_po_lines").select("*"),
        supabase.from("fin_expense_reports").select("*").eq("org_id", orgId).order("created_at", { ascending: false }),
        supabase.from("fin_expense_items").select("*"),
        supabase.from("fin_invoices").select("*").eq("org_id", orgId).order("created_at", { ascending: false }),
        supabase.from("fin_invoice_lines").select("*"),
        supabase.from("fin_vendors").select("*").eq("org_id", orgId),
        supabase.from("fin_accounts").select("*").eq("org_id", orgId),
        supabase.from("fin_approvals").select("*").eq("org_id", orgId),
        supabase.from("fin_payments").select("*").eq("org_id", orgId),
        supabase.from("profiles").select("id, display_name, email, avatar_url"),
      ]);
      setBudgets(b.data || []);
      setBudgetLines(bl.data || []);
      setPOs(po.data || []);
      setPOLines(pol.data || []);
      setExpenses(ex.data || []);
      setExpenseItems(exi.data || []);
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

  const StatCard = ({ label, value, sub, color }) => (
    <div style={{ background: T.surface, borderRadius: 10, padding: 20, border: `1px solid ${T.border}`, flex: 1 }}>
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
        {tab === "Dashboard" && <>
          <div style={{ display: "flex", gap: 16, marginBottom: 24 }}>
            <StatCard label="Total Budget" value={fmtK(totalBudget)} sub={`${budgets.filter(b => b.status === "active").length} active budgets`} />
            <StatCard label="Purchase Orders" value={fmtK(totalPO)} sub={`${pos.filter(p => p.status === "pending_approval").length} pending approval`} color={T.accent} />
            <StatCard label="Expenses" value={fmtK(totalExp)} sub={`${expenses.filter(e => e.status === "submitted" || e.status === "pending_approval").length} awaiting review`} color="#f97316" />
            <StatCard label="Invoices Due" value={fmtK(invoices.filter(i => !["paid", "void"].includes(i.status)).reduce((s, i) => s + Number(i.total_amount || 0), 0))} sub={overdueInvoices.length > 0 ? `${overdueInvoices.length} overdue!` : "All current"} color={overdueInvoices.length > 0 ? (T.red || "#ef4444") : (T.green || "#22c55e")} />
            <StatCard label="Total Paid" value={fmtK(totalPaid)} sub={`${payments.length} payments`} color={T.green || "#22c55e"} />
          </div>

          {/* Pending Approvals */}
          {pendingApprovals.length > 0 && <>
            <h3 style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 12 }}>Pending Approvals</h3>
            <Table columns={[
              { label: "Type", render: r => <StatusPill status={r.approvable_type.replace(/_/g, " ")} />, nowrap: true },
              { label: "Step", render: r => `${r.current_step} / ${r.total_steps}` },
              { label: "Submitted", render: r => r.submitted_at ? new Date(r.submitted_at).toLocaleDateString() : "—" },
              { label: "By", render: r => uname(r.submitted_by) },
              { label: "", align: "right", render: r => (
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={(e) => { e.stopPropagation(); handleApprovalDecision(r.id, "approved"); }} style={{ ..._btn, background: T.green || "#22c55e", color: "#fff", padding: "4px 10px", fontSize: 11 }}>Approve</button>
                  <button onClick={(e) => { e.stopPropagation(); handleApprovalDecision(r.id, "rejected"); }} style={{ ..._btn, background: T.red || "#ef4444", color: "#fff", padding: "4px 10px", fontSize: 11 }}>Reject</button>
                </div>
              )}
            ]} data={pendingApprovals} emptyMsg="No pending approvals" />
          </>}

          {/* Recent Activity */}
          <h3 style={{ fontSize: 15, fontWeight: 700, color: T.text, margin: "24px 0 12px" }}>Recent Purchase Orders</h3>
          <Table columns={[
            { label: "PO #", key: "po_number", nowrap: true },
            { label: "Title", key: "title" },
            { label: "Vendor", render: r => vname(r.vendor_id) },
            { label: "Amount", align: "right", render: r => fmt(r.total_amount), nowrap: true },
            { label: "Status", render: r => <StatusPill status={r.status} /> },
          ]} data={pos.slice(0, 5)} onRowClick={r => setModal({ type: "po", mode: "edit", data: r })} emptyMsg="No purchase orders yet" />
        </>}

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

        {tab === "Expenses" && <>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: T.text }}>Expense Reports</h3>
            <button onClick={() => setModal({ type: "expense", mode: "new", data: { status: "draft" } })} style={{ ..._btn, background: T.accent, color: "#fff" }}>+ New Expense</button>
          </div>
          <Table columns={[
            { label: "Report #", key: "report_number", nowrap: true },
            { label: "Title", key: "title" },
            { label: "Submitted By", render: r => uname(r.submitted_by) },
            { label: "Amount", align: "right", render: r => fmt(r.total_amount), nowrap: true },
            { label: "Status", render: r => <StatusPill status={r.status} /> },
            { label: "", align: "right", render: r => (
              <div style={{ display: "flex", gap: 4 }}>
                {r.status === "draft" && <button onClick={e => { e.stopPropagation(); submitForApproval("expense", r.id, r.total_amount); }} style={{ ..._btn, background: "#f97316", color: "#fff", padding: "3px 8px", fontSize: 11 }}>Submit</button>}
                <button onClick={e => { e.stopPropagation(); deleteRecord("fin_expense_reports", r.id, expenses, setExpenses); }} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 14, opacity: 0.4 }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.4}>×</button>
              </div>
            )}
          ]} data={expenses} onRowClick={r => setModal({ type: "expense", mode: "edit", data: r })} emptyMsg="No expense reports yet" />
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
              { key: "code", label: "Account Code", required: true },
              { key: "name", label: "Account Name", required: true },
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

          const parseCSV = (text) => {
            const lines = text.split(/\r?\n/).filter(l => l.trim());
            if (lines.length < 2) return null;
            // Handle quoted fields
            const parseLine = (line) => {
              const result = []; let current = ""; let inQuotes = false;
              for (let i = 0; i < line.length; i++) {
                const c = line[i];
                if (c === '"') { inQuotes = !inQuotes; }
                else if (c === ',' && !inQuotes) { result.push(current.trim()); current = ""; }
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
            const reader = new FileReader();
            reader.onload = (ev) => {
              const parsed = parseCSV(ev.target.result);
              if (!parsed || parsed.rows.length === 0) return showToast("Could not parse CSV — check the file format", "error");
              setCsvData(parsed);
              // Auto-map columns by fuzzy matching headers to field labels/keys
              const autoMap = {};
              cfg.fields.forEach(f => {
                const match = parsed.headers.findIndex(h => {
                  const hl = h.toLowerCase().replace(/[^a-z0-9]/g, "");
                  const fl = f.label.toLowerCase().replace(/[^a-z0-9]/g, "");
                  const fk = f.key.toLowerCase().replace(/[^a-z0-9]/g, "");
                  return hl === fk || hl === fl || hl.includes(fk) || fk.includes(hl) || hl.includes(fl.split(" ")[0]);
                });
                if (match >= 0) autoMap[f.key] = match;
              });
              setColMap(autoMap);
              setImportPreview(null);
            };
            reader.readAsText(file);
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

            for (const row of csvData.rows) {
              const obj = { org_id: orgId };
              let skip = false;
              cfg.fields.forEach(f => {
                const ci = colMap[f.key];
                if (ci !== undefined && ci !== "" && ci !== -1) {
                  let val = row[ci] || "";
                  if (f.numeric) val = parseFloat(val.replace(/[^0-9.\-]/g, "")) || 0;
                  if (f.required && !val && val !== 0) skip = true;
                  // Handle vendor lookup
                  if (f.key === "vendor_name" && f.lookup === "vendor") {
                    const vid = vendorMap[String(val).toLowerCase()];
                    if (vid) obj.vendor_id = vid;
                    return; // don't set vendor_name on PO/invoice
                  }
                  // Handle expense report lookup
                  if (f.key === "report_number" && f.lookup === "expense") {
                    const eid = expMap[String(val).toLowerCase()];
                    if (eid) obj.report_id = eid;
                    return;
                  }
                  // Handle invoice lookup
                  if (f.key === "invoice_number" && f.lookup === "invoice") {
                    const iid = invMap[String(val).toLowerCase()];
                    if (iid) obj.invoice_id = iid;
                    return;
                  }
                  obj[f.key] = val;
                }
              });
              if (skip) { errors++; continue; }
              // Set defaults
              if (cfg.table === "fin_purchase_orders" && !obj.status) obj.status = "draft";
              if (cfg.table === "fin_expense_reports" && !obj.status) obj.status = "draft";
              if (cfg.table === "fin_invoices" && !obj.status) obj.status = "received";
              if (cfg.table === "fin_accounts" && !obj.type) obj.type = "expense";
              if (cfg.table === "fin_expense_items" && !obj.category) obj.category = "other";
              if (cfg.table === "fin_payments" && !obj.status) obj.status = "completed";
              // Remove org_id for child tables
              if (["fin_expense_items"].includes(cfg.table)) delete obj.org_id;

              const { error } = await supabase.from(cfg.table).insert(obj);
              if (error) { console.error("Import row error:", error, obj); errors++; }
              else imported++;
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
                {importType === "accounts" && "In QBO: Go to Settings (⚙) → Chart of Accounts → Run Report → Export to Excel. You'll get account number, name, type, and balance."}
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
