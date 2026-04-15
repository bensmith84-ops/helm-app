"use client";
import { useState, useEffect, useRef, useCallback, Fragment } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";
import { useAuth } from "../lib/auth";
import { useResponsive } from "../lib/responsive";

// ═══════════════════════════════════════════════════════════════════════════════
// FINANCE MODULE — ApproveFlow merged into Helm
// Spend requests, budgets, departments, rules engine, integrations
// ═══════════════════════════════════════════════════════════════════════════════

// ── Constants ────────────────────────────────────────────────────────────────
const APPROVAL_CHAINS = {
  standard:   [{ role: "Manager", label: "Manager" }, { role: "Finance", label: "Finance" }],
  high_value: [{ role: "Manager", label: "Manager" }, { role: "Finance", label: "Finance" }, { role: "CFO", label: "CFO" }],
  executive:  [{ role: "CFO", label: "CFO" }],
};

const STATUS_COLORS = {
  pending:               { bg: T.surface2, text: "#856404", dot: "#FFC107" },
  approved:              { bg: "#D1FAE520", text: "#065F46", dot: "#10B981" },
  rejected:              { bg: "#FEE2E220", text: "#991B1B", dot: "#EF4444" },
  conditionally_approved:{ bg: "#FEF3C720", text: "#92400E", dot: "#F59E0B" },
  conditionally_approved_info_added: { bg: "#EFF6FF20", text: "#1D4ED8", dot: "#3B82F6" },
  removal_requested:     { bg: "#FDF2F820", text: "#9D174D", dot: "#EC4899" },
  removed:               { bg: T.surface2, text: T.text3, dot: "#94A3B8" },
};

const STATUS_LABELS = {
  pending: "Pending", approved: "Approved", rejected: "Rejected",
  conditionally_approved: "Info Required", conditionally_approved_info_added: "Info Added",
  removal_requested: "Removal Requested", removed: "Removed",
};

const ROLE_LABELS = { admin: "Admin", approver: "Approver", requester: "Requester" };

const fmt = n => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n || 0);
const pct = (a, b) => b > 0 ? Math.round((a / b) * 100) : 0;

const annualiseAmount = (r) => {
  if (r.cost_type !== "recurring") return r.amount || 0;
  const perPeriod = r.recurring_amount || r.amount || 0;
  const firstAmt = (r.first_amount && r.first_amount !== perPeriod) ? r.first_amount : perPeriod;
  const freq = r.recurring_frequency;
  const periods = { weekly: 52, monthly: 12, quarterly: 4, annually: 1 }[freq] || 12;
  if (r.recurring_end_date) {
    const end = new Date(r.recurring_end_date);
    const today = new Date();
    const msPerPeriod = { weekly: 7, monthly: 30.44, quarterly: 91.31, annually: 365.25 }[freq] || 30.44;
    const days = Math.max(0, (end - today) / 86400000);
    const count = Math.ceil(days / msPerPeriod);
    return firstAmt + (Math.max(0, count - 1) * perPeriod);
  }
  return firstAmt + ((periods - 1) * perPeriod);
};

// ── Shared UI Components ─────────────────────────────────────────────────────
const Badge = ({ status }) => {
  const c = STATUS_COLORS[status] || STATUS_COLORS.pending;
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 5, background: c.bg, color: c.text, padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600 }}>
    <span style={{ width: 6, height: 6, borderRadius: "50%", background: c.dot }} />{STATUS_LABELS[status] || status}
  </span>;
};

const Card = ({ children, style = {}, onClick }) => (
  <div onClick={onClick} style={{ background: T.surface, borderRadius: 12, border: `1px solid ${T.border}`, padding: 20, cursor: onClick ? "pointer" : "default", transition: "box-shadow 0.15s", position: "relative", ...style }}
    onMouseEnter={e => { if (onClick) e.currentTarget.style.boxShadow = "0 4px 16px rgba(0,0,0,0.1)"; }}
    onMouseLeave={e => { if (onClick) e.currentTarget.style.boxShadow = "none"; }}>
    {children}
  </div>
);

const ProgressBar = ({ value, max, color = T.accent, height = 6 }) => {
  const ratio = max > 0 ? value / max : 0;
  const barColor = ratio > 1 ? "#EF4444" : ratio > 0.85 ? "#F59E0B" : color;
  return (
    <div style={{ height, background: T.surface2, borderRadius: height, overflow: "hidden" }}>
      <div style={{ height: "100%", background: barColor, borderRadius: height, width: `${Math.min(100, pct(value, max))}%`, transition: "width 0.5s" }} />
    </div>
  );
};


// ── Approval Chain Stepper ───────────────────────────────────────────────────
const ApprovalChain = ({ req, members }) => {
  const isPersonChain = (req.approval_chain || "").startsWith("person_");
  const chain = isPersonChain
    ? [{ role: "Specific", label: req.require_person_name || "Named Approver" }]
    : (APPROVAL_CHAINS[req.approval_chain] || APPROVAL_CHAINS.standard);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 0 }}>
      {chain.map((step, idx) => {
        const done = idx < req.approval_step || req.status === "approved";
        const current = idx === req.approval_step && req.status === "pending";
        const approval = (req.approvals || []).find(a => a.step === idx);
        const approver = approval ? members.find(m => m.user_id === approval.by) : null;
        return (
          <div key={idx} style={{ display: "flex", alignItems: "center" }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ width: 28, height: 28, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700,
                background: done ? "#10B981" : current ? T.accent : T.surface2,
                color: done || current ? "#fff" : T.text3,
                border: current ? `2px solid ${T.accent}40` : "2px solid transparent",
              }}>{done ? "✓" : idx + 1}</div>
              <div style={{ fontSize: 9, fontWeight: 600, color: done ? "#10B981" : current ? T.accent : T.text3, marginTop: 2, whiteSpace: "nowrap" }}>{step.label}</div>
              {approver && <div style={{ fontSize: 8, color: T.text3 }}>{(approver.profiles?.display_name || "").split(" ")[0]}</div>}
            </div>
            {idx < chain.length - 1 && <div style={{ width: 24, height: 2, background: done ? "#10B981" : T.border, margin: "0 2px", marginBottom: 14 }} />}
          </div>
        );
      })}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════════════
export default function FinanceView({ initialView, embedded, modulePerms = {} } = {}) {
  const { user, profile, orgId } = useAuth();
  const { isMobile } = useResponsive();
  const [view, setView] = useState(initialView || "cfo");
  const [loading, setLoading] = useState(true);

  // Core data
  const [requests, setRequests] = useState([]);
  const [glCategories, setGlCategories] = useState([]);
  const [glCodes, setGlCodes] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [members, setMembers] = useState([]); // org_memberships + profiles for approval routing
  const [rules, setRules] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [budgetVersions, setBudgetVersions] = useState([]);
  const [activeBudget, setActiveBudget] = useState(null);
  const [activeBudgetName, setActiveBudgetName] = useState(null);
  const [myMembership, setMyMembership] = useState(null);

  useEffect(() => {
    const load = async () => {
      const [
        { data: reqs }, { data: cats }, { data: codes }, { data: depts },
        { data: mems }, { data: rls }, { data: audit }, { data: bv },
      ] = await Promise.all([
        supabase.from("af_requests").select("*").order("created_at", { ascending: false }),
        supabase.from("af_gl_categories").select("*").order("sort_order"),
        supabase.from("af_gl_codes").select("*").order("code"),
        supabase.from("af_departments").select("*").order("name"),
        supabase.from("org_memberships").select("*, profiles(display_name, email, avatar_url)").eq("org_id", orgId).eq("org_id", profile?.org_id),
        supabase.from("af_rules").select("*").order("sort_order"),
        supabase.from("af_audit_log").select("*").order("created_at", { ascending: false }).limit(200),
        supabase.from("af_budget_versions").select("*").order("saved_at", { ascending: false }),
      ]);
      setRequests(reqs || []);
      setGlCategories(cats || []);
      setGlCodes(codes || []);
      setDepartments(depts || []);
      setMembers(mems || []);
      setRules(rls || []);
      setAuditLog(audit || []);
      setBudgetVersions(bv || []);
      const me = (mems || []).find(m => m.user_id === user?.id);
      setMyMembership(me || null);

      const defaultBv = (bv || []).find(b => b.is_default);
      if (defaultBv) { setActiveBudget(defaultBv.data); setActiveBudgetName(defaultBv.name); }

      setLoading(false);
    };
    if (user) load();
  }, [user]);

  // Sync view when embedded parent changes the initial view
  useEffect(() => { if (initialView && initialView !== view) setView(initialView); }, [initialView]);

  // ── CRUD helpers ───────────────────────────────────────────────────────────
  const addRequest = async (req) => {
    const { data } = await supabase.from("af_requests").insert(req).select().single();
    if (data) setRequests(p => [data, ...p]);
    return data;
  };

  const updateRequest = async (id, patch) => {
    await supabase.from("af_requests").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
    setRequests(p => p.map(r => r.id === id ? { ...r, ...patch } : r));
  };

  const deleteRequest = async (id) => {
    await supabase.from("af_requests").delete().eq("id", id);
    setRequests(p => p.filter(r => r.id !== id));
  };

  const addAuditEntry = async (action, detail, requestId) => {
    const entry = {
      action, detail, request_id: requestId || null,
      user_name: profile?.display_name || "Unknown",
      user_id: user?.id,
    };
    const { data } = await supabase.from("af_audit_log").insert(entry).select().single();
    if (data) setAuditLog(p => [data, ...p]);
  };

  // ── Derived data ───────────────────────────────────────────────────────────
  const isAdmin = myMembership?.af_role === "admin" || myMembership?.role === "owner" || !myMembership;
  const isApprover = myMembership?.af_role === "approver" || isAdmin;
  const isRequester = myMembership?.af_role === "requester";
  const mySpendLimit = myMembership?.af_spend_limit || 500;

  const approved = requests.filter(r => r.status === "approved");
  const pending = requests.filter(r => r.status === "pending");

  const getDeptSpend = (deptName) => ({
    approved: requests.filter(r => r.status === "approved" && r.department === deptName).reduce((s, r) => s + annualiseAmount(r), 0),
    pending: requests.filter(r => r.status === "pending" && r.department === deptName).reduce((s, r) => s + annualiseAmount(r), 0),
  });

  // ── Navigation ─────────────────────────────────────────────────────────────
  const NAV = [
    { id: "cfo",           label: "CFO Dashboard", icon: "📈" },
    { id: "pl_explorer",   label: "P&L Explorer",  icon: "📊" },
    { id: "cash_flow",     label: "Cash Flow",     icon: "💧" },
    { id: "vendors",       label: "Vendors",       icon: "🏢" },
    { id: "ap_aging",      label: "AP / AR",       icon: "⏳" },
    { id: "txn_search",    label: "Transactions",  icon: "🔍" },
    { id: "revenue",       label: "Revenue",       icon: "💰" },
    { id: "budgets",       label: "Budgets",       icon: "💰" },
    { id: "requests",      label: "Requests",      icon: "📋" },
    { id: "rules",         label: "Rules",          icon: "⚡" },
    { id: "audit",         label: "Audit Log",      icon: "🗂" },
  ];

  if (loading) return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: T.text3, fontSize: 13 }}>Loading ApproveFlow…</div>;

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Left nav — desktop only, hidden when embedded in ERP */}
      {!embedded && !isMobile && (
        <div style={{ width: 180, borderRight: `1px solid ${T.border}`, padding: "12px 8px", flexShrink: 0, overflow: "auto" }}>
          {NAV.map(n => (
            <button key={n.id} onClick={() => setView(n.id)}
              style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", background: view === n.id ? T.accentDim : "transparent", border: "none", borderRadius: 6, cursor: "pointer", color: view === n.id ? T.accent : T.text3, fontSize: 12, fontWeight: view === n.id ? 700 : 500, textAlign: "left", marginBottom: 2 }}>
              <span style={{ fontSize: 13 }}>{n.icon}</span>{n.label}
              {n.id === "requests" && pending.length > 0 && <span style={{ marginLeft: "auto", background: "#EF4444", color: "#fff", fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 8 }}>{pending.length}</span>}
            </button>
          ))}
        </div>
      )}

      {/* Content column */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", minWidth: 0 }}>
        {/* Mobile tab bar — hidden when embedded */}
        {!embedded && isMobile && (
          <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${T.border}`, overflowX: "auto", flexShrink: 0, background: T.bg, WebkitOverflowScrolling: "touch" }}>
            {NAV.map(n => (
              <button key={n.id} onClick={() => setView(n.id)}
                style={{ padding: "10px 14px", background: "none", border: "none", borderBottom: view === n.id ? `2px solid ${T.accent}` : "2px solid transparent", cursor: "pointer", color: view === n.id ? T.accent : T.text3, fontSize: 18, fontWeight: 600, whiteSpace: "nowrap", position: "relative" }}>
                {n.icon}
                {n.id === "requests" && pending.length > 0 && <span style={{ position: "absolute", top: 6, right: 4, width: 6, height: 6, borderRadius: "50%", background: "#EF4444" }} />}
              </button>
            ))}
          </div>
        )}

        {/* Scrollable content area */}
        <div style={{ flex: 1, overflow: "auto", padding: isMobile ? "10px 10px 20px" : "20px 24px" }}>
        {view === "cfo" && <CFODashboard isMobile={isMobile} />}
        {view === "pl_explorer" && <PLExplorer isMobile={isMobile} />}
        {view === "cash_flow" && <CashFlowView isMobile={isMobile} />}
        {view === "vendors" && <VendorIntelligence isMobile={isMobile} />}
        {view === "ap_aging" && <APAgingView isMobile={isMobile} />}
        {view === "txn_search" && <TransactionSearch isMobile={isMobile} />}
        {view === "revenue" && <RevenueAnalytics isMobile={isMobile} />}
        {view === "budgets" && <BudgetsView isMobile={isMobile} glCategories={glCategories} requests={requests} departments={departments} activeBudget={activeBudget} setActiveBudget={setActiveBudget} activeBudgetName={activeBudgetName} setActiveBudgetName={setActiveBudgetName} budgetVersions={budgetVersions} setBudgetVersions={setBudgetVersions} user={user} modulePerms={modulePerms} />}
        {view === "requests" && <RequestsView isMobile={isMobile} requests={requests} addRequest={addRequest} updateRequest={updateRequest} deleteRequest={deleteRequest} members={members} departments={departments} glCodes={glCodes} glCategories={glCategories} rules={rules} activeBudget={activeBudget} myMembership={myMembership} mySpendLimit={mySpendLimit} isAdmin={isAdmin} isApprover={isApprover} user={user} profile={profile} addAuditEntry={addAuditEntry} getDeptSpend={getDeptSpend} />}
        {view === "rules" && <RulesView isMobile={isMobile} rules={rules} setRules={setRules} glCodes={glCodes} members={members} user={user} />}
        {view === "audit" && <AuditLogView isMobile={isMobile} auditLog={auditLog} />}
        {view === "vendor_spend" && <VendorSpendView isMobile={isMobile} glCodes={glCodes} glCategories={glCategories} departments={departments} />}
      </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// REVENUE ANALYTICS — Revenue by channel, trending monthly
// ═══════════════════════════════════════════════════════════════════════════════
function RevenueAnalytics({ isMobile }) {
  const T = typeof window !== "undefined" && document.body.dataset.theme === "dark"
    ? { bg:"#0a0a0f",surface:"#13131a",surface2:"#1a1a24",surface3:"#22222e",text:"#e8e8f0",text2:"#b0b0c0",text3:"#6b6b80",border:"#2a2a3a",accent:"#6366f1",green:"#10B981",red:"#EF4444",yellow:"#F59E0B" }
    : { bg:"#f8f9fc",surface:"#ffffff",surface2:"#f4f5f8",surface3:"#ecedf2",text:"#1a1a2e",text2:"#4a4a5e",text3:"#8a8a9e",border:"#e2e3e8",accent:"#6366f1",green:"#10B981",red:"#EF4444",yellow:"#F59E0B" };
  const fmt = n => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
  const fmtK = n => Math.abs(n) >= 1000000 ? `$${(n / 1000000).toFixed(1)}M` : Math.abs(n) >= 1000 ? `$${(n / 1000).toFixed(0)}K` : fmt(n);

  const { orgId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [plYTD, setPLYTD] = useState([]);
  const [plMonthly, setPLMonthly] = useState([]);

  useEffect(() => {
    (async () => {
      const [r1, r2] = await Promise.all([
        supabase.from("qbo_pl").select("*").eq("org_id", orgId).eq("classification", "Revenue"),
        supabase.from("qbo_pl_monthly").select("*").eq("org_id", orgId).eq("classification", "Revenue").order("period_month"),
      ]);
      setPLYTD(r1.data || []); setPLMonthly(r2.data || []);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: T.text3 }}>Loading revenue data…</div>;

  const currentMonth = new Date().toISOString().slice(0, 7);
  const months = [...new Set(plMonthly.map(r => r.period_month))].sort();
  const isOpenMonth = (m) => m >= currentMonth;
  const grossRevAccts = plYTD.filter(r => (r.account_type || "").includes("Income") && !r.account_name.includes("Discount") && !r.account_name.includes("Refund") && !r.account_name.includes("Rebate") && !r.account_name.includes("Spoils") && !r.account_name.includes("Trade") && Number(r.amount) > 0);
  const discountAccts = plYTD.filter(r => Number(r.amount) < 0 || r.account_name.includes("Discount") || r.account_name.includes("Refund") || r.account_name.includes("Rebate") || r.account_name.includes("Spoils") || r.account_name.includes("Trade"));

  const grossRev = grossRevAccts.reduce((s, r) => s + Number(r.amount), 0);
  const discounts = discountAccts.reduce((s, r) => s + Number(r.amount), 0);
  const netRev = grossRev + discounts;

  // Channel breakdown (from account names)
  const channels = [
    { key: "shopify", label: "Shopify / DTC", match: a => a.includes("Shopify"), color: "#5E8E3E" },
    { key: "amazon", label: "Amazon", match: a => a.includes("Amazon"), color: "#FF9900" },
    { key: "walmart", label: "Walmart", match: a => a.includes("Walmart") || a.includes("Retail"), color: "#0071CE" },
    { key: "other", label: "Other", match: () => true, color: T.text3 },
  ];

  const channelData = [];
  const used = new Set();
  for (const ch of channels) {
    const accts = ch.key === "other" 
      ? grossRevAccts.filter(r => !used.has(r.account_name))
      : grossRevAccts.filter(r => ch.match(r.account_name) && !used.has(r.account_name));
    accts.forEach(r => used.add(r.account_name));
    const ytd = accts.reduce((s, r) => s + Number(r.amount), 0);
    // Monthly data
    const monthly = months.map(m => {
      const mAccts = ch.key === "other"
        ? plMonthly.filter(r => r.period_month === m && !channels.slice(0, -1).some(c => c.match(r.account_name)) && Number(r.amount) > 0)
        : plMonthly.filter(r => r.period_month === m && ch.match(r.account_name) && Number(r.amount) > 0);
      return mAccts.reduce((s, r) => s + Number(r.amount), 0);
    });
    if (ytd > 0 || monthly.some(v => v > 0)) channelData.push({ ...ch, ytd, monthly, accts });
  }

  // Monthly totals for chart
  const monthlyGross = months.map(m => plMonthly.filter(r => r.period_month === m && Number(r.amount) > 0).reduce((s, r) => s + Number(r.amount), 0));
  const monthlyNet = months.map(m => plMonthly.filter(r => r.period_month === m).reduce((s, r) => s + Number(r.amount), 0));
  const maxMonthly = Math.max(...monthlyGross, 1);

  // Discounts breakdown
  const discountItems = discountAccts.sort((a, b) => Number(a.amount) - Number(b.amount));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 900, color: T.text }}>Revenue Analytics</div>
        <div style={{ fontSize: 12, color: T.text3 }}>2026 YTD · {months.length} months</div>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 10 }}>
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase" }}>Gross Revenue</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: T.green }}>{fmtK(grossRev)}</div>
        </div>
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase" }}>Discounts & Returns</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: T.red }}>{fmtK(discounts)}</div>
          <div style={{ fontSize: 9, color: T.text3 }}>{grossRev > 0 ? ((Math.abs(discounts) / grossRev) * 100).toFixed(1) : 0}% of gross</div>
        </div>
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase" }}>Net Revenue</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: T.accent }}>{fmtK(netRev)}</div>
        </div>
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase" }}>Avg Monthly</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: T.text }}>{fmtK(netRev / (months.length || 1))}</div>
        </div>
      </div>

      {/* Monthly revenue chart */}
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: isMobile ? 12 : 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 12 }}>Monthly Revenue by Channel</div>
        <div style={{ display: "flex", gap: isMobile ? 6 : 16, alignItems: "flex-end", height: 180 }}>
          {months.map((m, mi) => {
            const isOpen = isOpenMonth(m);
            return (
            <div key={m} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, opacity: isOpen ? 0.6 : 1 }}>
              <div style={{ fontSize: 9, fontWeight: 600, color: isOpen ? T.yellow : T.green }}>{fmtK(monthlyNet[mi])}</div>
              <div style={{ width: "100%", maxWidth: 50, display: "flex", flexDirection: "column-reverse", height: 150, border: isOpen ? `1px dashed ${T.yellow}40` : "none", borderRadius: 4 }}>
                {channelData.map(ch => {
                  const h = (ch.monthly[mi] / maxMonthly) * 140;
                  return h > 0 ? <div key={ch.key} style={{ width: "100%", height: Math.max(h, 3), background: ch.color, minHeight: 2 }} title={`${ch.label}: ${fmtK(ch.monthly[mi])}`} /> : null;
                })}
              </div>
              <div style={{ fontSize: 10, color: T.text3, fontWeight: 600 }}>{new Date(m + "-15").toLocaleDateString("en-US", { month: "short" })}</div>
              {isOpen && <div style={{ fontSize: 7, fontWeight: 700, color: T.yellow, background: T.yellow + "18", padding: "1px 4px", borderRadius: 3 }}>OPEN</div>}
            </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 10, flexWrap: "wrap" }}>
          {channelData.map(ch => (
            <span key={ch.key} style={{ fontSize: 10, color: T.text3 }}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: ch.color, marginRight: 4 }} />{ch.label}</span>
          ))}
        </div>
        {months.some(m => isOpenMonth(m)) && (
          <div style={{ marginTop: 8, padding: "8px 12px", background: T.yellow + "10", borderRadius: 6, border: `1px solid ${T.yellow}20`, fontSize: 11, color: T.yellow }}>
            ⚠ Open month — Shopify and Amazon revenue typically posts after bank reconciliation. March revenue will update automatically when booked in QuickBooks.
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
        {/* Channel breakdown */}
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: isMobile ? 12 : 18 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 12 }}>Revenue by Channel</div>
          {channelData.map(ch => {
            const pctVal = grossRev > 0 ? (ch.ytd / grossRev * 100) : 0;
            return (
              <div key={ch.key} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: 4, background: ch.color }} />
                    <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{ch.label}</span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{fmtK(ch.ytd)}</span>
                    <span style={{ fontSize: 10, color: T.text3, marginLeft: 6 }}>{pctVal.toFixed(0)}%</span>
                  </div>
                </div>
                <div style={{ height: 6, borderRadius: 3, background: T.surface3, overflow: "hidden" }}>
                  <div style={{ width: `${Math.min(pctVal, 100)}%`, height: "100%", background: ch.color, borderRadius: 3 }} />
                </div>
                {/* Monthly mini table */}
                <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                  {months.map((m, mi) => (
                    <div key={m} style={{ flex: 1, textAlign: "center" }}>
                      <div style={{ fontSize: 8, color: T.text3 }}>{new Date(m + "-15").toLocaleDateString("en-US", { month: "short" })}</div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: ch.monthly[mi] > 0 ? T.text2 : T.text3 }}>{ch.monthly[mi] > 0 ? fmtK(ch.monthly[mi]) : "—"}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>

        {/* Discounts & Returns breakdown */}
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: isMobile ? 12 : 18 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 4 }}>Discounts, Refunds & Returns</div>
          <div style={{ fontSize: 11, color: T.text3, marginBottom: 12 }}>{fmtK(Math.abs(discounts))} total · {grossRev > 0 ? ((Math.abs(discounts) / grossRev) * 100).toFixed(1) : 0}% of gross revenue</div>
          {discountItems.map(r => {
            const pctVal = grossRev > 0 ? (Math.abs(Number(r.amount)) / grossRev * 100) : 0;
            return (
              <div key={r.account_name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", borderBottom: `1px solid ${T.border}08` }}>
                <div style={{ flex: 1, fontSize: 11, color: T.text2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.account_name}</div>
                <span style={{ fontSize: 11, fontWeight: 600, color: T.red, minWidth: 60, textAlign: "right" }}>{fmtK(Math.abs(Number(r.amount)))}</span>
                <span style={{ fontSize: 9, color: T.text3, minWidth: 30, textAlign: "right" }}>{pctVal.toFixed(1)}%</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRANSACTION SEARCH — Search all financial transactions
// ═══════════════════════════════════════════════════════════════════════════════
function TransactionSearch({ isMobile }) {
  const T = typeof window !== "undefined" && document.body.dataset.theme === "dark"
    ? { bg:"#0a0a0f",surface:"#13131a",surface2:"#1a1a24",surface3:"#22222e",text:"#e8e8f0",text2:"#b0b0c0",text3:"#6b6b80",border:"#2a2a3a",accent:"#6366f1",green:"#10B981",red:"#EF4444",yellow:"#F59E0B" }
    : { bg:"#f8f9fc",surface:"#ffffff",surface2:"#f4f5f8",surface3:"#ecedf2",text:"#1a1a2e",text2:"#4a4a5e",text3:"#8a8a9e",border:"#e2e3e8",accent:"#6366f1",green:"#10B981",red:"#EF4444",yellow:"#F59E0B" };
  const fmt = n => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);
  const fmtK = n => Math.abs(n) >= 1000000 ? `$${(n / 1000000).toFixed(1)}M` : Math.abs(n) >= 1000 ? `$${(n / 1000).toFixed(0)}K` : fmt(n);

  const { orgId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [allTxns, setAllTxns] = useState([]);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortBy, setSortBy] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [minAmt, setMinAmt] = useState("");
  const [maxAmt, setMaxAmt] = useState("");

  useEffect(() => {
    (async () => {
      // Load all data — purchases can exceed default 1000 row limit
      const fetchAll = async (table, select, order) => {
        const all = [];
        let from = 0;
        const pageSize = 1000;
        for (let i = 0; i < 10; i++) {
          const q = supabase.from(table).select(select).order(order || "txn_date", { ascending: false }).range(from, from + pageSize - 1);
          const { data } = await q;
          if (!data || data.length === 0) break;
          all.push(...data);
          if (data.length < pageSize) break;
          from += pageSize;
        }
        return all;
      };
      const [r1, r2, r3, r4, r5] = await Promise.all([
        fetchAll("qbo_bills", "vendor_name,total_amount,balance,txn_date,due_date,memo,gl_accounts,payment_status"),
        fetchAll("qbo_purchases", "vendor_name,total_amount,txn_date,memo,gl_accounts,payment_type"),
        fetchAll("qbo_deposits", "total_amount,txn_date,deposit_to,memo"),
        fetchAll("qbo_payments", "payment_type,customer_name,vendor_name,total_amount,txn_date,memo,deposit_to"),
        fetchAll("qbo_journal_entries", "total_amount,txn_date,memo,doc_number"),
      ]);
      const txns = [
        ...r1.map(t => ({ ...t, txn_type: "bill", entity: t.vendor_name, direction: "out" })),
        ...r2.map(t => ({ ...t, txn_type: "purchase", entity: t.vendor_name, direction: "out" })),
        ...r3.map(t => ({ ...t, txn_type: "deposit", entity: t.deposit_to || "Deposit", direction: "in" })),
        ...r4.filter(p => p.payment_type === "received").map(t => ({ ...t, txn_type: "pmt_received", entity: t.customer_name || "Customer", direction: "in" })),
        ...r4.filter(p => p.payment_type === "made").map(t => ({ ...t, txn_type: "pmt_made", entity: t.vendor_name || "Vendor", direction: "out" })),
        ...r5.map(t => ({ ...t, txn_type: "journal", entity: t.memo || `JE #${t.doc_number}`, direction: "neutral" })),
      ];
      setAllTxns(txns);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: T.text3 }}>Loading transactions…</div>;

  // Filter
  let filtered = allTxns;
  if (typeFilter !== "all") filtered = filtered.filter(t => t.txn_type === typeFilter);
  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(t =>
      (t.entity || "").toLowerCase().includes(q) ||
      (t.memo || "").toLowerCase().includes(q) ||
      (t.gl_accounts || "").toLowerCase().includes(q) ||
      (t.doc_number || "").toLowerCase().includes(q) ||
      String(t.total_amount || "").includes(q)
    );
  }
  if (minAmt) filtered = filtered.filter(t => Number(t.total_amount) >= Number(minAmt));
  if (maxAmt) filtered = filtered.filter(t => Number(t.total_amount) <= Number(maxAmt));

  // Sort
  filtered.sort((a, b) => {
    let va, vb;
    if (sortBy === "date") { va = a.txn_date || ""; vb = b.txn_date || ""; return sortDir === "desc" ? vb.localeCompare(va) : va.localeCompare(vb); }
    if (sortBy === "due_date") { va = a.due_date || "9999"; vb = b.due_date || "9999"; return sortDir === "desc" ? vb.localeCompare(va) : va.localeCompare(vb); }
    if (sortBy === "amount") { va = Number(a.total_amount) || 0; vb = Number(b.total_amount) || 0; return sortDir === "desc" ? vb - va : va - vb; }
    if (sortBy === "entity") { va = (a.entity || "").toLowerCase(); vb = (b.entity || "").toLowerCase(); return sortDir === "desc" ? vb.localeCompare(va) : va.localeCompare(vb); }
    return 0;
  });

  const TYPE_CONFIG = {
    bill: { label: "Bill", color: T.yellow, bg: T.yellow + "18" },
    purchase: { label: "Card", color: T.accent, bg: T.accent + "15" },
    deposit: { label: "Deposit", color: T.green, bg: T.green + "18" },
    pmt_received: { label: "Pmt In", color: T.green, bg: T.green + "18" },
    pmt_made: { label: "Pmt Out", color: T.red, bg: T.red + "18" },
    journal: { label: "Journal", color: T.text3, bg: T.text3 + "18" },
  };

  // Category breakdowns
  const categoryTotals = {};
  filtered.forEach(t => {
    const cfg = TYPE_CONFIG[t.txn_type];
    const label = cfg?.label || t.txn_type;
    if (!categoryTotals[label]) categoryTotals[label] = { total: 0, count: 0, color: cfg?.color || T.text3, direction: t.direction, txn_type: t.txn_type };
    categoryTotals[label].total += Math.abs(Number(t.total_amount) || 0);
    categoryTotals[label].count++;
  });

  // Cash flow: only actual cash movements (not accrual entries like bills)
  const cashOut = filtered.filter(t => t.txn_type === "pmt_made" || t.txn_type === "purchase").reduce((s, t) => s + Math.abs(Number(t.total_amount)), 0);
  const cashIn = filtered.filter(t => t.txn_type === "deposit" || t.txn_type === "pmt_received").reduce((s, t) => s + Math.abs(Number(t.total_amount)), 0);
  const netCash = cashIn - cashOut;

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortBy(col); setSortDir("desc"); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 900, color: T.text }}>Transaction Search</div>
        <div style={{ fontSize: 12, color: T.text3 }}>{allTxns.length.toLocaleString()} total transactions · Search bills, card charges, deposits, payments, journal entries</div>
      </div>

      {/* Search + filters */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 10, background: T.surface, border: `1px solid ${T.border}`, flex: isMobile ? "1 1 100%" : "1 1 300px" }}>
          <span style={{ fontSize: 14 }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vendor, memo, GL account, amount…" style={{ background: "transparent", border: "none", outline: "none", color: T.text, fontSize: 13, width: "100%" }} />
          {search && <button onClick={() => setSearch("")} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 14 }}>✕</button>}
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontSize: 11 }}>
          <option value="all">All types</option>
          <option value="bill">Bills</option>
          <option value="purchase">Card charges</option>
          <option value="deposit">Deposits</option>
          <option value="pmt_received">Payments received</option>
          <option value="pmt_made">Payments made</option>
          <option value="journal">Journal entries</option>
        </select>
        <input value={minAmt} onChange={e => setMinAmt(e.target.value)} placeholder="Min $" type="number" style={{ width: 80, padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontSize: 11 }} />
        <input value={maxAmt} onChange={e => setMaxAmt(e.target.value)} placeholder="Max $" type="number" style={{ width: 80, padding: "8px 10px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontSize: 11 }} />
      </div>

      {/* Summary by category */}
      <div style={{ display: "flex", gap: 10, fontSize: 11, color: T.text3, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontWeight: 600 }}>{filtered.length.toLocaleString()} results</span>
        <span style={{ color: T.border }}>|</span>
        {Object.entries(categoryTotals).map(([label, cat]) => (
          <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 6, background: cat.color + "12", border: `1px solid ${cat.color}25` }}>
            <span style={{ color: cat.color, fontWeight: 700 }}>{label}</span>
            <span style={{ color: T.text2 }}>({cat.count})</span>
            <strong style={{ color: cat.direction === "in" ? T.green : cat.direction === "out" ? T.red : T.text2 }}>{fmtK(cat.total)}</strong>
          </span>
        ))}
        {(cashIn > 0 || cashOut > 0) && <>
          <span style={{ color: T.border }}>|</span>
          {cashIn > 0 && <span>Cash In: <strong style={{ color: T.green }}>{fmtK(cashIn)}</strong></span>}
          {cashOut > 0 && <span>Cash Out: <strong style={{ color: T.red }}>{fmtK(cashOut)}</strong></span>}
          <span>Net: <strong style={{ color: netCash >= 0 ? T.green : T.red }}>{netCash >= 0 ? "+" : ""}{fmtK(netCash)}</strong></span>
        </>}
      </div>

      {/* Results table */}
      <div style={{ overflowX: "auto", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 650 }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${T.border}` }}>
              <th style={{ padding: "8px 10px", textAlign: "center", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", width: 60 }}>Type</th>
              <th onClick={() => toggleSort("date")} style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", cursor: "pointer" }}>Txn Date {sortBy === "date" ? (sortDir === "asc" ? "↑" : "↓") : ""}</th>
              <th onClick={() => toggleSort("due_date")} style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", cursor: "pointer" }}>Due Date {sortBy === "due_date" ? (sortDir === "asc" ? "↑" : "↓") : ""}</th>
              <th onClick={() => toggleSort("entity")} style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", cursor: "pointer" }}>Entity {sortBy === "entity" ? (sortDir === "asc" ? "↑" : "↓") : ""}</th>
              <th style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase" }}>Memo</th>
              <th style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase" }}>GL</th>
              <th onClick={() => toggleSort("amount")} style={{ padding: "8px 10px", textAlign: "right", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", cursor: "pointer" }}>Amount {sortBy === "amount" ? (sortDir === "asc" ? "↑" : "↓") : ""}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 200).map((t, i) => {
              const cfg = TYPE_CONFIG[t.txn_type] || TYPE_CONFIG.journal;
              return (
                <tr key={i} style={{ borderBottom: `1px solid ${T.border}`, background: i % 2 === 0 ? "transparent" : T.surface2 + "30" }}>
                  <td style={{ padding: "6px 10px", textAlign: "center" }}>
                    <span style={{ fontSize: 8, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: cfg.bg, color: cfg.color, whiteSpace: "nowrap" }}>{cfg.label}</span>
                  </td>
                  <td style={{ padding: "6px 10px", fontSize: 11, color: T.text2, whiteSpace: "nowrap" }}>
                    {t.txn_date ? new Date(t.txn_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}
                  </td>
                  <td style={{ padding: "6px 10px", fontSize: 11, whiteSpace: "nowrap" }}>
                    {t.due_date ? (() => {
                      const overdue = t.txn_type === "bill" && new Date(t.due_date + "T12:00:00") < new Date();
                      return <span style={{ fontWeight: overdue ? 700 : 400, color: overdue ? T.red : T.text2 }}>
                        {new Date(t.due_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        {overdue && <span style={{ fontSize: 8, marginLeft: 3, padding: "1px 3px", borderRadius: 3, background: T.red + "18", color: T.red, fontWeight: 700 }}>!</span>}
                      </span>;
                    })() : <span style={{ color: T.text3 }}>—</span>}
                  </td>
                  <td style={{ padding: "6px 10px", fontSize: 11, fontWeight: 600, color: T.text, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {t.entity || "—"}
                  </td>
                  <td style={{ padding: "6px 10px", fontSize: 10, color: T.text3, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {(t.memo || "—").slice(0, 60)}
                  </td>
                  <td style={{ padding: "6px 10px", fontSize: 10, color: T.accent, maxWidth: 140, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {(t.gl_accounts || "—").split(",")[0]}
                  </td>
                  <td style={{ padding: "6px 10px", fontSize: 11, fontWeight: 600, textAlign: "right", color: t.direction === "in" ? T.green : t.direction === "out" ? T.text : T.text2 }}>
                    {t.direction === "in" ? "+" : t.direction === "out" ? "" : ""}{fmt(Number(t.total_amount))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {filtered.length > 200 && <div style={{ textAlign: "center", padding: 10, fontSize: 10, color: T.text3 }}>Showing 200 of {filtered.length.toLocaleString()}</div>}
        {filtered.length === 0 && <div style={{ textAlign: "center", padding: 30, color: T.text3, fontSize: 12 }}>No transactions match your search</div>}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// AP AGING — Bills by age bucket + cash needed timeline
// ═══════════════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════════════
// AP / AR AGING — Payables + Receivables with aging buckets — v3 expandable vendors
// ═══════════════════════════════════════════════════════════════════════════════
function APAgingView({ isMobile }) {
  const T = typeof window !== "undefined" && document.body.dataset.theme === "dark"
    ? { bg:"#0a0a0f",surface:"#13131a",surface2:"#1a1a24",surface3:"#22222e",text:"#e8e8f0",text2:"#b0b0c0",text3:"#6b6b80",border:"#2a2a3a",accent:"#6366f1",green:"#10B981",red:"#EF4444",yellow:"#F59E0B" }
    : { bg:"#f8f9fc",surface:"#ffffff",surface2:"#f4f5f8",surface3:"#ecedf2",text:"#1a1a2e",text2:"#4a4a5e",text3:"#8a8a9e",border:"#e2e3e8",accent:"#6366f1",green:"#10B981",red:"#EF4444",yellow:"#F59E0B" };
  const fmt = n => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
  const fmtK = n => Math.abs(n) >= 1000000 ? `$${(n / 1000000).toFixed(1)}M` : Math.abs(n) >= 1000 ? `$${(n / 1000).toFixed(0)}K` : fmt(n);

  const [loading, setLoading] = useState(true);
  const [bills, setBills] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [tab, setTab] = useState("ap");
  const [expandedBucket, setExpandedBucket] = useState(null);
  const [search, setSearch] = useState("");
  const [expandedVendor, setExpandedVendor] = useState(null);
  const [vendorSort, setVendorSort] = useState(["total", "desc"]);
  const [approvalFilter, setApprovalFilter] = useState([]);
  const [viewMode, setViewMode] = useState("vendor"); // vendor, date, status, all
  const [billSort, setBillSort] = useState(["due_date", "asc"]);
  const [notesBillId, setNotesBillId] = useState(null);
  const [notes, setNotes] = useState([]);
  const [noteText, setNoteText] = useState("");
  const [replyTo, setReplyTo] = useState(null);
  const [notesLoading, setNotesLoading] = useState(false);
  const [mentionSearch, setMentionSearch] = useState(null); // null = hidden, string = search query
  const [mentionResults, setMentionResults] = useState([]);
  const [allProfiles, setAllProfiles] = useState([]);
  const [inboxItems, setInboxItems] = useState([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [uploadingInvoice, setUploadingInvoice] = useState(false);
  const [forecast, setForecast] = useState(null);
  const [forecastLoading, setForecastLoading] = useState(false);
  const [selectedInbox, setSelectedInbox] = useState(null);
  const [batchSelected, setBatchSelected] = useState(new Set());
  const [reminders, setReminders] = useState([]);
  const [remindersLoading, setRemindersLoading] = useState(false);
  const [expenses, setExpenses] = useState([]);
  const [expensesLoading, setExpensesLoading] = useState(false);
  const [showExpenseForm, setShowExpenseForm] = useState(false);
  const [expForm, setExpForm] = useState({ merchant_name: "", amount: "", category: "supplies", description: "", expense_date: new Date().toISOString().slice(0, 10) });
  const [gmailConn, setGmailConn] = useState(null);
  const [scanning, setScanning] = useState(false);
  const { user, profile, orgId } = useAuth();

  useEffect(() => {
    (async () => {
      const [r1, r2, r3] = await Promise.all([
        supabase.from("qbo_bills").select("*").eq("org_id", orgId).eq("payment_status", "open").order("due_date"),
        supabase.from("qbo_invoices").select("*").eq("org_id", orgId).gt("balance", 0).order("due_date"),
        // Load approved inbox invoices (not yet in QBO) as standalone bills
        supabase.from("invoice_inbox").select("*").eq("org_id", orgId).in("status", ["approved", "extracted"]).order("created_at", { ascending: false }),
      ]);
      // Convert approved inbox items to bill-like objects so they show in Payables
      const qboBills = r1.data || [];
      const inboxBills = (r3.data || []).filter(inv =>
        inv.status === "approved" && !inv.matched_bill_id // Not already pushed to QBO
      ).map(inv => ({
        id: inv.id,
        vendor_name: inv.vendor_name || "Unknown Vendor",
        total_amount: Number(inv.total_amount) || 0,
        balance: Number(inv.total_amount) || 0,
        txn_date: inv.invoice_date,
        due_date: inv.due_date,
        memo: inv.memo,
        gl_accounts: inv.gl_account,
        payment_status: "open",
        approval_status: "approved",
        currency: inv.currency || "USD",
        attachment_url: inv.file_url,
        _source: "inbox", // Mark as inbox-sourced so we know it's not a QBO bill
      }));
      setBills([...qboBills, ...inboxBills]);
      setInvoices(r2.data || []);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: T.text3 }}>Loading AP/AR data…</div>;

  const today = new Date();
  const daysDiff = (dateStr) => { if (!dateStr) return 999; return Math.floor((today - new Date(dateStr + "T12:00:00")) / 86400000); };

  const items = tab === "ap" ? bills : invoices;
  const entityField = tab === "ap" ? "vendor_name" : "customer_name";
  const totalOpen = items.reduce((s, b) => s + Number(b.balance), 0);
  const apTotal = bills.reduce((s, b) => s + Number(b.balance), 0);
  const arTotal = invoices.reduce((s, b) => s + Number(b.balance), 0);

  const buckets = [
    { key: "current", label: "Current", range: "Not yet due", color: T.green, filter: b => daysDiff(b.due_date) < 0 },
    { key: "1_30", label: "1-30", range: "1-30 days past due", color: T.yellow, filter: b => { const d = daysDiff(b.due_date); return d >= 0 && d <= 30; } },
    { key: "31_60", label: "31-60", range: "31-60 days past due", color: "#F97316", filter: b => { const d = daysDiff(b.due_date); return d >= 31 && d <= 60; } },
    { key: "61_90", label: "61-90", range: "61-90 days past due", color: T.red, filter: b => { const d = daysDiff(b.due_date); return d >= 61 && d <= 90; } },
    { key: "90_plus", label: "90+", range: "Over 90 days past due", color: "#991B1B", filter: b => daysDiff(b.due_date) > 90 },
  ];
  const bucketData = buckets.map(bk => { const its = items.filter(bk.filter); return { ...bk, items: its, total: its.reduce((s, b) => s + Number(b.balance), 0), count: its.length }; });
  const overdueTotal = bucketData.filter(b => b.key !== "current").reduce((s, b) => s + b.total, 0);
  const maxBucket = Math.max(...bucketData.map(b => b.total), 1);

  const cashTimeline = [7, 14, 30, 60].map(days => {
    const cutoff = new Date(today); cutoff.setDate(cutoff.getDate() + days);
    const due = items.filter(b => b.due_date && new Date(b.due_date + "T12:00:00") <= cutoff);
    return { label: days <= 7 ? "This Week" : days <= 14 ? "Next 2 Weeks" : `Next ${days} Days`, days, total: due.reduce((s, b) => s + Number(b.balance), 0), count: due.length };
  });

  const entityMap = {};
  items.forEach(b => {
    const v = b[entityField] || "Unknown";
    if (!entityMap[v]) entityMap[v] = { name: v, total: 0, count: 0, oldest: null };
    entityMap[v].total += Number(b.balance); entityMap[v].count++;
    const age = daysDiff(b.due_date);
    if (entityMap[v].oldest === null || age > entityMap[v].oldest) entityMap[v].oldest = age;
  });
  const entityList = Object.values(entityMap).sort((a, b) => b.total - a.total);
  const filteredEntities = search ? entityList.filter(v => v.name.toLowerCase().includes(search.toLowerCase())) : entityList;

  // Helpers for approval
  const updateBill = async (billId, updates) => {
    await supabase.from("qbo_bills").update(updates).eq("org_id", orgId).eq("id", billId);
    setBills(p => p.map(b => b.id === billId ? { ...b, ...updates } : b));
    // Push approval status to QBO as memo update (non-blocking)
    if (updates.approval_status) {
      const bill = bills.find(b => b.id === billId);
      if (bill?.qbo_id) {
        const statusLabel = updates.approval_status === "approved" ? "✓ Approved in Helm" : updates.approval_status === "paid" ? "✓ Paid" : updates.approval_status === "denied" ? "✗ Denied in Helm" : "";
        if (statusLabel) {
          fetch(supabase.supabaseUrl + "/functions/v1/qbo-push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update_bill_memo", qbo_id: bill.qbo_id, memo: `${statusLabel} (${new Date().toLocaleDateString()})` }) }).catch(() => {});
        }
      }
    }
  };

  const openNotes = async (billId) => {
    if (notesBillId === billId) { setNotesBillId(null); return; }
    setNotesBillId(billId); setNotesLoading(true); setReplyTo(null); setNoteText("");
    const { data } = await supabase.from("bill_notes").select("*").eq("org_id", orgId).eq("bill_id", billId).order("created_at");
    setNotes(data || []); setNotesLoading(false);
  };

  const renderMentions = (text) => {
    if (!text || !text.includes("@")) return text;
    const parts = text.split(/(@[\w\s]+?)(?=\s@|\s*$|[.!?,;:])/g);
    return parts.map((part, i) => part.startsWith("@") ? <span key={i} style={{ color: T.accent, fontWeight: 600 }}>{part}</span> : part);
  };

  const handleNoteChange = async (val) => {
    setNoteText(val);
    // Detect @mention trigger
    const atMatch = val.match(/@(\w*)$/);
    if (atMatch) {
      const query = atMatch[1].toLowerCase();
      setMentionSearch(query);
      // Load profiles if we haven't yet
      if (allProfiles.length === 0) {
        const { data } = await supabase.from("profiles").select("id, display_name, email").eq("org_id", orgId).limit(100);
        setAllProfiles(data || []);
        setMentionResults((data || []).filter(p => !query || p.display_name?.toLowerCase().includes(query) || p.email?.toLowerCase().includes(query)).slice(0, 6));
      } else {
        setMentionResults(allProfiles.filter(p => !query || p.display_name?.toLowerCase().includes(query) || p.email?.toLowerCase().includes(query)).slice(0, 6));
      }
    } else {
      setMentionSearch(null);
      setMentionResults([]);
    }
  };
  const insertMention = (person) => {
    // Replace @query with @Name
    const newText = noteText.replace(/@\w*$/, `@${person.display_name} `);
    setNoteText(newText);
    setMentionSearch(null);
    setMentionResults([]);
  };

  const addNote = async (parentId = null) => {
    if (!noteText.trim() || !notesBillId) return;
    const note = { bill_id: notesBillId, parent_id: parentId, user_id: user?.id, user_name: profile?.display_name || user?.email, content: noteText.trim() };
    const { data } = await supabase.from("bill_notes").insert(note).select().single();
    if (data) {
      setNotes(p => [...p, data]);
      const bill = bills.find(b => b.id === notesBillId);
      const BEN_ID = "32cad5dd-9e94-4095-a16d-b4521391b050";

      // Extract @mentioned users from the note text
      const mentions = noteText.match(/@([\w\s]+?)(?=\s@|\s*$|[.!?,;:])/g) || [];
      const mentionedNames = mentions.map(m => m.slice(1).trim().toLowerCase());
      const mentionedUsers = allProfiles.filter(p => mentionedNames.some(mn => p.display_name?.toLowerCase().startsWith(mn)));

      // Notify @mentioned users
      for (const mentioned of mentionedUsers) {
        if (mentioned.id !== user?.id) {
          await supabase.from("notifications").insert({
            org_id: orgId,
            user_id: mentioned.id,
            type: "bill_note_mention",
            title: `${profile?.display_name || "Someone"} mentioned you on ${bill?.vendor_name || "a bill"}`,
            body: noteText.trim().slice(0, 120),
            entity_type: "qbo_bill",
            entity_id: notesBillId,
            actor_id: user?.id,
            category: "finance",
            link: "/finance/ap-ar",
          });
        }
      }

      // Standard notification logic (Ben gets notified for all notes, others get notified for their bill threads)
      if (user?.id !== BEN_ID && !mentionedUsers.some(m => m.id === BEN_ID)) {
        await supabase.from("notifications").insert({
          org_id: orgId,
          user_id: BEN_ID,
          type: "bill_note",
          title: `New note on ${bill?.vendor_name || "bill"}`,
          body: `${profile?.display_name || "Someone"}: ${noteText.trim().slice(0, 120)}`,
          entity_type: "qbo_bill",
          entity_id: notesBillId,
          actor_id: user?.id,
          category: "finance",
          link: "/finance/ap-ar",
        });
      } else if (user?.id === BEN_ID) {
        const { data: otherNoters } = await supabase.from("bill_notes").select("user_id").eq("org_id", orgId).eq("bill_id", notesBillId).neq("user_id", BEN_ID);
        const uniqueUsers = [...new Set((otherNoters || []).map(n => n.user_id).filter(Boolean))];
        for (const uid of uniqueUsers) {
          if (!mentionedUsers.some(m => m.id === uid)) {
            await supabase.from("notifications").insert({
              org_id: orgId,
              user_id: uid,
              type: "bill_note",
              title: `Ben replied on ${bill?.vendor_name || "bill"}`,
              body: noteText.trim().slice(0, 120),
              entity_type: "qbo_bill",
              entity_id: notesBillId,
              actor_id: user?.id,
              category: "finance",
              link: "/finance/ap-ar",
            });
          }
        }
      }
    }
    setNoteText(""); setReplyTo(null); setMentionSearch(null);
  };

  const noteCount = (billId) => notes.filter(n => n.bill_id === billId).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, color: T.text }}>AP / AR</div>
          <div style={{ fontSize: 12, color: T.text3 }}>AP: {fmtK(apTotal)} ({bills.length} bills) · AR: {fmtK(arTotal)} ({invoices.length} invoices)</div>
        </div>
        <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: `1px solid ${T.border}` }}>
          <button onClick={() => { setTab("ap"); setExpandedBucket(null); setExpandedVendor(null); }} style={{ padding: "6px 16px", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", background: tab === "ap" ? T.red + "20" : T.surface2, color: tab === "ap" ? T.red : T.text3 }}>📤 Payables ({bills.length})</button>
          <button onClick={() => { setTab("ar"); setExpandedBucket(null); setExpandedVendor(null); }} style={{ padding: "6px 16px", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", background: tab === "ar" ? T.green + "20" : T.surface2, color: tab === "ar" ? T.green : T.text3, borderLeft: `1px solid ${T.border}` }}>📥 Receivables ({invoices.length})</button>
          <button onClick={async () => { setTab("inbox"); setInboxLoading(true); const { data } = await supabase.from("invoice_inbox").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(50); setInboxItems(data || []); setInboxLoading(false); if (!gmailConn) { const r = await fetch(supabase.supabaseUrl + "/functions/v1/gmail-scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "list_connections", org_id: orgId }) }).then(r => r.json()).catch(() => ({})); if (r.connections?.length > 0) setGmailConn(r.connections[0]); } }}
            style={{ padding: "6px 16px", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", background: tab === "inbox" ? T.accent + "20" : T.surface2, color: tab === "inbox" ? T.accent : T.text3, borderLeft: `1px solid ${T.border}` }}>📋 Invoice Inbox</button>
          <button onClick={async () => { setTab("expenses"); setExpensesLoading(true); const { data } = await supabase.from("expense_submissions").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(50); setExpenses(data || []); setExpensesLoading(false); }}
            style={{ padding: "6px 16px", fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", background: tab === "expenses" ? "#F59E0B20" : T.surface2, color: tab === "expenses" ? "#F59E0B" : T.text3, borderLeft: `1px solid ${T.border}` }}>💰 Expenses</button>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 10 }}>
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase" }}>Open {tab === "ap" ? "AP" : "AR"}</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: tab === "ap" ? T.red : T.green }}>{fmtK(totalOpen)}</div>
          <div style={{ fontSize: 10, color: T.text3 }}>{items.length} {tab === "ap" ? "bills" : "invoices"}</div>
        </div>
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase" }}>Overdue</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: overdueTotal > 0 ? "#991B1B" : T.green }}>{fmtK(overdueTotal)}</div>
          <div style={{ fontSize: 10, color: T.text3 }}>{totalOpen > 0 ? ((overdueTotal / totalOpen) * 100).toFixed(0) : 0}%</div>
        </div>
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase" }}>{tab === "ap" ? "Due" : "Expected"} This Week</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: T.yellow }}>{fmtK(cashTimeline[0].total)}</div>
          <div style={{ fontSize: 10, color: T.text3 }}>{cashTimeline[0].count} {tab === "ap" ? "bills" : "invoices"}</div>
        </div>
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase" }}>Unique {tab === "ap" ? "Vendors" : "Customers"}</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: T.text }}>{entityList.length}</div>
        </div>
      </div>

      {/* Aging buckets */}
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: isMobile ? 12 : 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 12 }}>{tab === "ap" ? "AP" : "AR"} Aging Buckets</div>
        <div style={{ display: "flex", gap: isMobile ? 4 : 12, alignItems: "flex-end", height: 120 }}>
          {bucketData.map(bk => (
            <div key={bk.key} onClick={() => setExpandedBucket(expandedBucket === bk.key ? null : bk.key)} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer" }}>
              <div style={{ fontSize: 9, fontWeight: 700, color: bk.color }}>{bk.count > 0 ? fmtK(bk.total) : "—"}</div>
              <div style={{ width: "100%", maxWidth: 60, height: Math.max((bk.total / maxBucket) * 100, 4), background: bk.color, borderRadius: "6px 6px 0 0", opacity: expandedBucket === bk.key ? 1 : 0.7 }} />
              <div style={{ fontSize: 10, fontWeight: 600, color: T.text3 }}>{bk.label}</div>
              <div style={{ fontSize: 8, color: T.text3 }}>{bk.count}</div>
            </div>
          ))}
        </div>
        {expandedBucket && (() => {
          const bk = bucketData.find(b => b.key === expandedBucket);
          if (!bk || bk.items.length === 0) return <div style={{ marginTop: 12, fontSize: 11, color: T.text3 }}>No items in this bucket</div>;
          return (
            <div style={{ marginTop: 12, borderTop: `1px solid ${T.border}`, paddingTop: 12 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: bk.color, marginBottom: 6 }}>{bk.label} — {bk.range} ({bk.count}, {fmtK(bk.total)})</div>
              {bk.items.sort((a, b) => Number(b.balance) - Number(a.balance)).slice(0, 15).map(b => (
                <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", fontSize: 11, borderBottom: `1px solid ${T.border}08` }}>
                  <span style={{ fontWeight: 600, color: T.text, flex: 1 }}>{b[entityField] || "—"}</span>
                  <span style={{ fontSize: 10, color: T.text3, marginRight: 10 }}>Due {b.due_date ? new Date(b.due_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}</span>
                  <span style={{ fontWeight: 700, color: bk.color, minWidth: 60, textAlign: "right" }}>{fmt(Number(b.balance))}</span>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* Cash timeline */}
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: isMobile ? 12 : 18 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 12 }}>{tab === "ap" ? "Cash Needed" : "Cash Expected"} Timeline</div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 10 }}>
          {cashTimeline.map(t => (
            <div key={t.days} style={{ background: T.surface2, borderRadius: 8, padding: "12px 14px", textAlign: "center" }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase" }}>{t.label}</div>
              <div style={{ fontSize: 18, fontWeight: 900, color: t.total > 0 ? (tab === "ap" ? T.red : T.green) : T.text3, marginTop: 4 }}>{fmtK(t.total)}</div>
              <div style={{ fontSize: 9, color: T.text3 }}>{t.count} {tab === "ap" ? "bills" : "invoices"}</div>
            </div>
          ))}
        </div>
      </div>

      {/* AI Cash Forecast */}
      {tab === "ap" && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: isMobile ? 12 : 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: forecast ? 10 : 0 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>AI Cash Forecast</div>
            <button onClick={async () => {
              setForecastLoading(true);
              try {
                const res = await fetch(supabase.supabaseUrl + "/functions/v1/ap-alerts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cash_forecast", org_id: orgId }) });
                const data = await res.json();
                if (data.success) setForecast(data);
              } catch (e) { console.error(e); }
              setForecastLoading(false);
            }} disabled={forecastLoading}
              style={{ padding: "5px 14px", fontSize: 11, fontWeight: 600, borderRadius: 6, background: T.accent + "18", border: `1px solid ${T.accent}40`, color: T.accent, cursor: "pointer", opacity: forecastLoading ? 0.5 : 1 }}>
              {forecastLoading ? "Analyzing…" : forecast ? "Refresh" : "Generate Forecast"}
            </button>
          </div>
          {forecast && (
            <div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 12 }}>
                <div style={{ padding: "10px 12px", background: T.red + "08", borderRadius: 8, border: `1px solid ${T.red}20` }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: T.red, textTransform: "uppercase" }}>Total AP (outgoing)</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: T.red }}>{fmtK(forecast.total_ap)}</div>
                </div>
                <div style={{ padding: "10px 12px", background: T.green + "08", borderRadius: 8, border: `1px solid ${T.green}20` }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: T.green, textTransform: "uppercase" }}>Total AR (incoming)</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: T.green }}>{fmtK(forecast.total_ar)}</div>
                </div>
              </div>
              {forecast.forecast && (
                <div style={{ fontSize: 12, color: T.text2, lineHeight: 1.7, padding: "10px 12px", background: T.surface2, borderRadius: 8 }}>{forecast.forecast}</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Smart Alerts Strip */}
      {tab === "ap" && (() => {
        const today = new Date();
        const unapprovedDueSoon = items.filter(b => {
          if (b.approval_status === "approved" || b.approval_status === "paid") return false;
          if (!b.due_date) return false;
          const d = new Date(b.due_date + "T12:00:00");
          return d <= new Date(today.getTime() + 7 * 86400000);
        });
        const overdueUnapproved = items.filter(b => b.due_date && daysDiff(b.due_date) > 0 && b.approval_status !== "approved" && b.approval_status !== "paid");
        const totalUnapprovedDue = unapprovedDueSoon.reduce((s, b) => s + Number(b.balance), 0);
        
        if (unapprovedDueSoon.length === 0 && overdueUnapproved.length === 0) return null;
        return (
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {overdueUnapproved.length > 0 && (
              <div style={{ flex: 1, minWidth: 200, padding: "10px 14px", background: T.red + "08", border: `1px solid ${T.red}20`, borderRadius: 10, display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ fontSize: 20 }}>🚨</div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.red }}>{overdueUnapproved.length} overdue bills need approval</div>
                  <div style={{ fontSize: 10, color: T.text3 }}>{fmtK(overdueUnapproved.reduce((s, b) => s + Number(b.balance), 0))} total — payment delayed</div>
                </div>
              </div>
            )}
            {unapprovedDueSoon.length > 0 && (
              <div style={{ flex: 1, minWidth: 200, padding: "10px 14px", background: T.yellow + "08", border: `1px solid ${T.yellow}20`, borderRadius: 10, display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ fontSize: 20 }}>⏰</div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.yellow }}>{unapprovedDueSoon.length} bills due this week — not yet approved</div>
                  <div style={{ fontSize: 10, color: T.text3 }}>{fmtK(totalUnapprovedDue)} needs approval to avoid late payment</div>
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Spending Insights — Top Vendors */}
      {tab === "ap" && (() => {
        const vendorSpend = {};
        items.forEach(b => {
          const v = b.vendor_name || "Unknown";
          if (!vendorSpend[v]) vendorSpend[v] = { name: v, total: 0, count: 0, open: 0 };
          vendorSpend[v].total += Number(b.total_amount) || 0;
          vendorSpend[v].count++;
          if (b.payment_status === "open") vendorSpend[v].open += Number(b.balance) || 0;
        });
        const topVendors = Object.values(vendorSpend).sort((a, b) => b.total - a.total).slice(0, 8);
        const maxSpend = topVendors[0]?.total || 1;
        return (
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: isMobile ? 12 : 18 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 12 }}>Top Vendors by Spend</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {topVendors.map((v, i) => (
                <div key={v.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 120, fontSize: 11, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flexShrink: 0 }}>{v.name}</div>
                  <div style={{ flex: 1, height: 20, background: T.surface2, borderRadius: 4, position: "relative", overflow: "hidden" }}>
                    <div style={{ width: `${(v.total / maxSpend) * 100}%`, height: "100%", background: i === 0 ? T.accent : i < 3 ? T.accent + "80" : T.accent + "40", borderRadius: 4, transition: "width 0.3s" }} />
                    {v.open > 0 && (
                      <div style={{ position: "absolute", right: 4, top: 2, fontSize: 9, fontWeight: 600, color: T.red }}>{fmtK(v.open)} open</div>
                    )}
                  </div>
                  <div style={{ width: 80, fontSize: 11, fontWeight: 700, color: T.text, textAlign: "right", fontFamily: "monospace", flexShrink: 0 }}>{fmtK(v.total)}</div>
                  <div style={{ width: 30, fontSize: 10, color: T.text3, textAlign: "right", flexShrink: 0 }}>{v.count}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      {/* AR Payment Reminders */}
      {tab === "ar" && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Payment Reminders</div>
            <div style={{ display: "flex", gap: 8 }}>
              {reminders.length > 0 && <span style={{ fontSize: 11, color: T.text3, alignSelf: "center" }}>{reminders.filter(r => r.status === "draft").length} drafts · {reminders.filter(r => r.status === "sent").length} sent</span>}
              <button onClick={async () => {
                setRemindersLoading(true);
                try {
                  const res = await fetch(supabase.supabaseUrl + "/functions/v1/ar-reminders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generate_reminders", org_id: orgId }) });
                  const data = await res.json();
                  if (data.reminders) setReminders(data.reminders);
                } catch (e) { console.error(e); }
                setRemindersLoading(false);
              }} disabled={remindersLoading}
                style={{ padding: "5px 14px", fontSize: 11, fontWeight: 600, borderRadius: 6, background: T.accent + "18", border: `1px solid ${T.accent}40`, color: T.accent, cursor: "pointer", opacity: remindersLoading ? 0.5 : 1 }}>
                {remindersLoading ? "Generating…" : "Generate Reminders"}
              </button>
            </div>
          </div>
          {remindersLoading ? (
            <div style={{ padding: 30, textAlign: "center", color: T.text3, fontSize: 12 }}>AI is drafting personalized payment reminders for overdue invoices…</div>
          ) : reminders.length === 0 ? (
            <div style={{ padding: 24, textAlign: "center", color: T.text3, fontSize: 12 }}>Click "Generate Reminders" to draft payment reminders for overdue AR invoices. AI will personalize each email based on the customer and how overdue they are.</div>
          ) : (
            <div>
              {reminders.map(r => {
                const toneColor = r.days_overdue > 60 ? T.red : r.days_overdue > 30 ? "#F97316" : r.days_overdue > 14 ? T.yellow : T.green;
                return (
                  <div key={r.id} style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{r.customer_name}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 4, background: toneColor + "18", color: toneColor }}>{r.days_overdue}d overdue</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: T.red, fontFamily: "monospace" }}>${Number(r.amount).toLocaleString()}</span>
                        {r.status === "sent" && <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: T.green + "18", color: T.green }}>SENT</span>}
                        {!r.customer_email && <span style={{ fontSize: 9, color: T.yellow }}>No email on file</span>}
                      </div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: T.accent, marginBottom: 2 }}>{r.subject}</div>
                      <div style={{ fontSize: 11, color: T.text3, lineHeight: 1.5, whiteSpace: "pre-wrap", maxHeight: 60, overflow: "hidden" }}>{r.body}</div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, flexShrink: 0 }}>
                      {r.status === "draft" && r.customer_email && (
                        <button onClick={async () => {
                          await fetch(supabase.supabaseUrl + "/functions/v1/ar-reminders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "send_reminder", reminder_id: r.id, user_id: user?.id }) });
                          setReminders(p => p.map(x => x.id === r.id ? { ...x, status: "sent" } : x));
                        }} style={{ padding: "4px 12px", fontSize: 10, fontWeight: 700, borderRadius: 4, border: "none", background: T.accent, color: "#fff", cursor: "pointer" }}>Send</button>
                      )}
                      {r.status === "draft" && (
                        <button onClick={() => {
                          const newBody = prompt("Edit email body:", r.body);
                          if (newBody) {
                            fetch(supabase.supabaseUrl + "/functions/v1/ar-reminders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update", reminder_id: r.id, body: newBody }) });
                            setReminders(p => p.map(x => x.id === r.id ? { ...x, body: newBody } : x));
                          }
                        }} style={{ padding: "4px 12px", fontSize: 10, fontWeight: 600, borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface2, color: T.text3, cursor: "pointer" }}>Edit</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Bills table — group by vendor, date, status, or show all */}
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
        <div style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${T.border}`, flexWrap: "wrap", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{tab === "ap" ? "Bills" : "Invoices"}</div>
            <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: `1px solid ${T.border}`, marginLeft: 8 }}>
              {[["vendor", "By Vendor"], ["date", "By Date"], ["status", "By Status"], ["all", "All Bills"]].map(([k, l]) => (
                <button key={k} onClick={() => { setViewMode(k); setExpandedVendor(null); }}
                  style={{ padding: "3px 10px", fontSize: 10, fontWeight: viewMode === k ? 700 : 500, border: "none", cursor: "pointer", background: viewMode === k ? T.accent : T.surface2, color: viewMode === k ? "#fff" : T.text3 }}>{l}</button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
              {[["pending", "Pending"], ["approved", "Approved"], ["denied", "Denied"], ["paid", "Paid"], ["scheduled", "Scheduled"]].map(([val, label]) => {
                const active = approvalFilter.includes(val);
                return <button key={val} onClick={() => setApprovalFilter(p => active ? p.filter(v => v !== val) : [...p, val])}
                  style={{ padding: "3px 10px", fontSize: 10, fontWeight: active ? 700 : 500, borderRadius: 20, border: `1px solid ${active ? T.accent : T.border}`, background: active ? T.accent + "18" : "transparent", color: active ? T.accent : T.text3, cursor: "pointer" }}>{label}</button>;
              })}
              {approvalFilter.length > 0 && <button onClick={() => setApprovalFilter([])} style={{ padding: "3px 8px", fontSize: 9, fontWeight: 600, borderRadius: 20, border: "none", background: T.surface2, color: T.text3, cursor: "pointer" }}>Clear</button>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 6, background: T.surface2, border: `1px solid ${T.border}` }}>
              <span style={{ fontSize: 12, color: T.text3 }}>🔍</span>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" style={{ background: "transparent", border: "none", outline: "none", color: T.text, fontSize: 11, width: 120 }} />
            </div>
          </div>
        </div>

        {/* ── Shared bill row renderer ── */}
        {(() => {
          const billCols = [
            { key: "vendor_name", label: tab === "ap" ? "Vendor" : "Customer", align: "left", w: null },
            { key: "memo", label: "Memo / GL", align: "left", w: 180 },
            { key: "balance", label: "Amount", align: "right", w: 90 },
            { key: "txn_date", label: "Received", align: "left", w: 100 },
            { key: "due_date", label: "Due Date", align: "left", w: 110 },
            { key: "status", label: "Status", align: "center", w: 80 },
            { key: "approval_status", label: "Payment Approved", align: "center", w: 140 },
            { key: "scheduled_payment_date", label: "Scheduled Payment", align: "center", w: 150 },
            { key: "invoice", label: "Invoice", align: "center", w: 60 },
            { key: "notes", label: "Notes", align: "center", w: 60 },
          ];

          // Filter items
          let filtered = items.filter(b => {
            if (approvalFilter.length === 0) return true;
            const st = b.approval_status || "pending";
            if (approvalFilter.includes("scheduled") && !!b.scheduled_payment_date) return true;
            return approvalFilter.includes(st);
          });
          if (search) {
            const q = search.toLowerCase();
            filtered = filtered.filter(b => (b[entityField] || "").toLowerCase().includes(q) || (b.memo || "").toLowerCase().includes(q) || (b.gl_accounts || "").toLowerCase().includes(q));
          }

          const renderBillRow = (b, showVendor = true) => {
            const overdue = b.due_date && daysDiff(b.due_date) > 0;
            const daysUntil = b.due_date ? -daysDiff(b.due_date) : null;
            return (
            <Fragment key={b.id}>
              <tr style={{ borderBottom: `1px solid ${T.border}15` }}>
                {showVendor && <td style={{ padding: "7px 10px", fontSize: 11, fontWeight: 600, color: T.text, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b[entityField] || "—"}</td>}
                <td style={{ padding: "7px 10px", fontSize: 11, color: T.text3, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{b.memo || b.gl_accounts || "—"}</td>
                <td style={{ padding: "7px 10px", fontSize: 12, fontWeight: 700, color: T.text, textAlign: "right", fontFamily: "monospace" }}>{fmt(Number(b.balance || b.total_amount))}</td>
                <td style={{ padding: "7px 10px", fontSize: 11, color: T.text2, whiteSpace: "nowrap" }}>{b.txn_date ? new Date(b.txn_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }) : "—"}</td>
                <td style={{ padding: "7px 10px", fontSize: 11, whiteSpace: "nowrap" }}>
                  <span style={{ fontWeight: overdue ? 700 : 400, color: overdue ? T.red : daysUntil != null && daysUntil <= 7 ? T.yellow : T.text2 }}>
                    {b.due_date ? new Date(b.due_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }) : "—"}
                  </span>
                  {overdue && <span style={{ fontSize: 8, marginLeft: 4, padding: "1px 4px", borderRadius: 3, background: T.red + "18", color: T.red, fontWeight: 700 }}>{daysDiff(b.due_date)}d</span>}
                  {!overdue && daysUntil != null && daysUntil <= 14 && daysUntil >= 0 && <span style={{ fontSize: 8, marginLeft: 4, color: T.yellow }}>{daysUntil}d</span>}
                </td>
                <td style={{ padding: "7px 10px", textAlign: "center" }}>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: (overdue ? T.red : T.green) + "18", color: overdue ? T.red : T.green }}>{overdue ? "OVERDUE" : "CURRENT"}</span>
                </td>
                <td style={{ padding: "7px 10px", textAlign: "center" }}>
                  {(() => {
                    const st = b.approval_status || "pending";
                    const colors = { pending: { bg: "#94a3b818", c: "#94a3b8" }, approved: { bg: T.green + "18", c: T.green }, denied: { bg: T.red + "18", c: T.red }, paid: { bg: T.accent + "18", c: T.accent } };
                    const col = colors[st] || colors.pending;
                    return (
                      <select value={st} onClick={e => e.stopPropagation()}
                        onChange={e => { const v = e.target.value; const updates = { approval_status: v, approved_at: v === "approved" ? new Date().toISOString() : (v === "pending" ? null : b.approved_at) }; if (v === "pending" || v === "denied") { updates.scheduled_payment_date = null; updates.scheduled_by = null; updates.scheduled_at = null; } updateBill(b.id, updates); }}
                        style={{ padding: "2px 4px", fontSize: 10, fontWeight: 700, borderRadius: 4, border: `1px solid ${col.c}40`, background: col.bg, color: col.c, cursor: "pointer", outline: "none", appearance: "auto" }}>
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="denied">Denied</option>
                        <option value="paid">Paid</option>
                      </select>
                    );
                  })()}
                </td>
                <td style={{ padding: "7px 10px", textAlign: "center" }}>
                  {b.scheduled_payment_date ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 4, justifyContent: "center" }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: T.accent }}>📅 {new Date(b.scheduled_payment_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                      <button onClick={e => { e.stopPropagation(); updateBill(b.id, { scheduled_payment_date: null, scheduled_by: null, scheduled_at: null }); }}
                        style={{ padding: "1px 5px", fontSize: 8, borderRadius: 3, border: "none", background: T.red + "18", color: T.red, cursor: "pointer" }}>✕</button>
                    </div>
                  ) : b.approval_status === "approved" ? (
                    <input type="date" min={new Date().toISOString().slice(0, 10)}
                      onChange={e => { if (e.target.value) updateBill(b.id, { scheduled_payment_date: e.target.value, scheduled_at: new Date().toISOString() }); }}
                      style={{ padding: "2px 4px", fontSize: 10, borderRadius: 4, border: `1px solid ${T.accent}`, background: T.accent + "08", color: T.accent, cursor: "pointer", width: 115 }} />
                  ) : (
                    <span style={{ fontSize: 10, color: T.text3 }}>—</span>
                  )}
                </td>
                <td style={{ padding: "7px 6px", textAlign: "center" }}>
                  {b.attachment_url && b.attachment_url !== "none" ? (
                    <a href={b.attachment_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                      style={{ fontSize: 13, textDecoration: "none" }} title={b.attachment_name || "View Invoice"}>📄</a>
                  ) : (
                    <span style={{ fontSize: 10, color: T.text3 }}>—</span>
                  )}
                </td>
                <td style={{ padding: "7px 6px", textAlign: "center" }}>
                  <button onClick={e => { e.stopPropagation(); openNotes(b.id); }}
                    style={{ padding: "2px 6px", fontSize: 10, borderRadius: 4, border: "none", background: notesBillId === b.id ? T.accent + "20" : "transparent", color: notesBillId === b.id ? T.accent : T.text3, cursor: "pointer", fontWeight: 600 }}
                    title="Notes">💬{notesBillId === b.id && notes.length > 0 ? ` ${notes.length}` : ""}</button>
                </td>
              </tr>
              {notesBillId === b.id && (
                <tr><td colSpan={billCols.length + (showVendor ? 0 : -1)} style={{ padding: 0, background: T.surface2 + "60" }}>
                  <div style={{ padding: "10px 16px", maxHeight: 300, overflow: "auto" }}>
                    {notesLoading ? <div style={{ fontSize: 11, color: T.text3 }}>Loading notes…</div> : (
                      <>
                        {notes.filter(n => !n.parent_id).length === 0 && !replyTo && <div style={{ fontSize: 11, color: T.text3, marginBottom: 8 }}>No notes yet. Add one below.</div>}
                        {notes.filter(n => !n.parent_id).map(n => (
                          <div key={n.id} style={{ marginBottom: 10 }}>
                            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                              <div style={{ width: 24, height: 24, borderRadius: 12, background: T.accent + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: T.accent, flexShrink: 0 }}>{(n.user_name || "?")[0]}</div>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontSize: 10, color: T.text3 }}><strong style={{ color: T.text }}>{n.user_name || "Unknown"}</strong> · {new Date(n.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })} {new Date(n.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</div>
                                <div style={{ fontSize: 12, color: T.text, marginTop: 2, lineHeight: 1.5 }}>{renderMentions(n.content)}</div>
                                <button onClick={() => setReplyTo(replyTo === n.id ? null : n.id)} style={{ fontSize: 9, color: T.accent, background: "none", border: "none", cursor: "pointer", padding: "2px 0", fontWeight: 600 }}>Reply</button>
                              </div>
                            </div>
                            {/* Replies */}
                            {notes.filter(r => r.parent_id === n.id).map(r => (
                              <div key={r.id} style={{ marginLeft: 32, marginTop: 6, display: "flex", gap: 8, alignItems: "flex-start" }}>
                                <div style={{ width: 20, height: 20, borderRadius: 10, background: T.green + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, color: T.green, flexShrink: 0 }}>{(r.user_name || "?")[0]}</div>
                                <div>
                                  <div style={{ fontSize: 10, color: T.text3 }}><strong style={{ color: T.text }}>{r.user_name || "Unknown"}</strong> · {new Date(r.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })} {new Date(r.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}</div>
                                  <div style={{ fontSize: 11, color: T.text, marginTop: 1, lineHeight: 1.4 }}>{renderMentions(r.content)}</div>
                                </div>
                              </div>
                            ))}
                            {replyTo === n.id && (
                              <div style={{ marginLeft: 32, marginTop: 6, display: "flex", gap: 6, position: "relative" }}>
                                <input value={noteText} onChange={e => handleNoteChange(e.target.value)} placeholder="Reply… (use @ to mention)" onKeyDown={e => { if (e.key === "Enter" && noteText.trim() && mentionSearch === null) addNote(n.id); if (e.key === "Escape") { setMentionSearch(null); setMentionResults([]); } }}
                                  style={{ flex: 1, padding: "5px 8px", fontSize: 11, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface, color: T.text, outline: "none" }} autoFocus />
                                {mentionSearch !== null && mentionResults.length > 0 && (
                                  <div style={{ position: "absolute", bottom: "100%", left: 0, right: 60, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.15)", zIndex: 50, maxHeight: 200, overflow: "auto", marginBottom: 4 }}>
                                    {mentionResults.map(p => (
                                      <div key={p.id} onClick={() => insertMention(p)}
                                        style={{ padding: "6px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
                                        onMouseEnter={e => e.currentTarget.style.background = T.surface2} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                                        <div style={{ width: 22, height: 22, borderRadius: 11, background: T.accent + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: T.accent }}>{(p.display_name || "?")[0]}</div>
                                        <div>
                                          <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{p.display_name}</div>
                                          <div style={{ fontSize: 10, color: T.text3 }}>{p.email}</div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                <button onClick={() => addNote(n.id)} disabled={!noteText.trim()} style={{ padding: "5px 10px", fontSize: 10, fontWeight: 700, borderRadius: 6, border: "none", background: T.accent, color: "#fff", cursor: "pointer", opacity: noteText.trim() ? 1 : 0.5 }}>Reply</button>
                              </div>
                            )}
                          </div>
                        ))}
                        {!replyTo && (
                          <div style={{ display: "flex", gap: 6, marginTop: 6, position: "relative" }}>
                            <input value={noteText} onChange={e => handleNoteChange(e.target.value)} placeholder="Add a note… (use @ to mention)" onKeyDown={e => { if (e.key === "Enter" && noteText.trim() && mentionSearch === null) addNote(null); if (e.key === "Escape") { setMentionSearch(null); setMentionResults([]); } }}
                              style={{ flex: 1, padding: "5px 8px", fontSize: 11, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface, color: T.text, outline: "none" }} />
                            {mentionSearch !== null && mentionResults.length > 0 && (
                              <div style={{ position: "absolute", bottom: "100%", left: 0, right: 60, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, boxShadow: "0 4px 12px rgba(0,0,0,0.15)", zIndex: 50, maxHeight: 200, overflow: "auto", marginBottom: 4 }}>
                                {mentionResults.map(p => (
                                  <div key={p.id} onClick={() => insertMention(p)}
                                    style={{ padding: "6px 10px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
                                    onMouseEnter={e => e.currentTarget.style.background = T.surface2} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                                    <div style={{ width: 22, height: 22, borderRadius: 11, background: T.accent + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: T.accent }}>{(p.display_name || "?")[0]}</div>
                                    <div>
                                      <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{p.display_name}</div>
                                      <div style={{ fontSize: 10, color: T.text3 }}>{p.email}</div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                            <button onClick={() => addNote(null)} disabled={!noteText.trim()} style={{ padding: "5px 10px", fontSize: 10, fontWeight: 700, borderRadius: 6, border: "none", background: T.accent, color: "#fff", cursor: "pointer", opacity: noteText.trim() ? 1 : 0.5 }}>Post</button>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </td></tr>
              )}
            </Fragment>
            );
          };

          const renderBillHeader = (showVendor = true) => (
            <thead><tr style={{ borderBottom: `2px solid ${T.border}` }}>
              {billCols.filter(c => showVendor || c.key !== "vendor_name").map(col => (
                <th key={col.key} onClick={() => col.key !== "status" && col.key !== "notes" && col.key !== "invoice" && setBillSort([col.key, billSort[0] === col.key && billSort[1] === "asc" ? "desc" : "asc"])}
                  style={{ padding: "6px 10px", textAlign: col.align, fontSize: 9, fontWeight: 700, color: T.text3, textTransform: "uppercase", cursor: col.key !== "notes" && col.key !== "invoice" ? "pointer" : "default", userSelect: "none", whiteSpace: "nowrap", maxWidth: col.w || "auto" }}>
                  {col.label} {billSort[0] === col.key ? (billSort[1] === "asc" ? "↑" : "↓") : ""}
                </th>
              ))}
            </tr></thead>
          );

          const sortBills = (arr) => {
            const [sk, sd] = billSort;
            return [...arr].sort((a, b) => {
              let va = a[sk], vb = b[sk];
              if (sk === "balance" || sk === "total_amount") { va = Number(va) || 0; vb = Number(vb) || 0; }
              if (va == null) return 1; if (vb == null) return -1;
              const cmp = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb));
              return sd === "desc" ? -cmp : cmp;
            });
          };

          // ── ALL BILLS view ──
          if (viewMode === "all") {
            const sorted = sortBills(filtered);
            return (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                  {renderBillHeader(true)}
                  <tbody>{sorted.slice(0, 100).map(b => renderBillRow(b, true))}</tbody>
                </table>
                {sorted.length > 100 && <div style={{ padding: 8, textAlign: "center", fontSize: 10, color: T.text3 }}>Showing 100 of {sorted.length}</div>}
              </div>
            );
          }

          // ── GROUP BY VENDOR ──
          if (viewMode === "vendor") {
            const [vsk, vsd] = vendorSort;
            const sorted = [...filteredEntities].sort((a, b) => { let va = a[vsk], vb = b[vsk]; if (va == null) return 1; if (vb == null) return -1; const c = typeof va === "number" ? va - vb : String(va).localeCompare(String(vb)); return vsd === "desc" ? -c : c; });
            return (
              <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead><tr style={{ borderBottom: `2px solid ${T.border}` }}>
                  {[{ key: "name", label: tab === "ap" ? "Vendor" : "Customer", align: "left" }, { key: "total", label: "Balance", align: "right" }, { key: "count", label: "#", align: "center" }, { key: "oldest", label: "Status", align: "center" }].map(col => (
                    <th key={col.key} onClick={() => setVendorSort([col.key, vsk === col.key && vsd === "asc" ? "desc" : "asc"])}
                      style={{ padding: "8px 12px", textAlign: col.align, fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", cursor: "pointer", userSelect: "none" }}>
                      {col.label} {vsk === col.key ? (vsd === "asc" ? "↑" : "↓") : ""}
                    </th>
                  ))}
                </tr></thead>
                <tbody>
                  {sorted.slice(0, 50).map(v => {
                    const ageColor = v.oldest <= 0 ? T.green : v.oldest <= 30 ? T.yellow : v.oldest <= 60 ? "#F97316" : T.red;
                    const ageLabel = v.oldest <= 0 ? "Current" : `${v.oldest}d`;
                    const isExp = expandedVendor === v.name;
                    const vBills = isExp ? sortBills(filtered.filter(b => b[entityField] === v.name)) : [];
                    return (
                      <Fragment key={v.name}>
                        <tr onClick={() => setExpandedVendor(isExp ? null : v.name)} style={{ borderBottom: `1px solid ${T.border}`, cursor: "pointer", background: isExp ? T.surface2 : "transparent" }}
                          onMouseEnter={e => { if (!isExp) e.currentTarget.style.background = T.surface2; }} onMouseLeave={e => { if (!isExp) e.currentTarget.style.background = "transparent"; }}>
                          <td style={{ padding: "8px 12px", fontSize: 12, fontWeight: 600, color: T.text }}>
                            <span style={{ fontSize: 10, marginRight: 6, color: T.text3, display: "inline-block", transform: isExp ? "rotate(90deg)" : "rotate(0)", transition: "transform 0.15s" }}>▶</span>{v.name}
                          </td>
                          <td style={{ padding: "8px 12px", textAlign: "right", fontSize: 12, fontWeight: 700, color: T.text }}>{fmtK(v.total)}</td>
                          <td style={{ padding: "8px 12px", textAlign: "center", fontSize: 12, color: T.text2 }}>{v.count}</td>
                          <td style={{ padding: "8px 12px", textAlign: "center" }}><span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4, background: ageColor + "18", color: ageColor }}>{ageLabel}</span></td>
                        </tr>
                        {isExp && vBills.length > 0 && (
                          <tr><td colSpan={4} style={{ padding: 0, background: T.surface2 + "40" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
                              {renderBillHeader(false)}
                              <tbody>{vBills.map(b => renderBillRow(b, false))}</tbody>
                            </table>
                          </td></tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
              </div>
            );
          }

          // ── GROUP BY DATE (week buckets) ──
          if (viewMode === "date") {
            const weeks = {};
            filtered.forEach(b => {
              const d = b.due_date ? new Date(b.due_date + "T12:00:00") : null;
              const label = d ? `Week of ${new Date(d.getFullYear(), d.getMonth(), d.getDate() - d.getDay()).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : "No Due Date";
              if (!weeks[label]) weeks[label] = { label, bills: [], total: 0, sortDate: d ? d.getTime() : 99999999999999 };
              weeks[label].bills.push(b); weeks[label].total += Number(b.balance || 0);
            });
            const weekList = Object.values(weeks).sort((a, b) => a.sortDate - b.sortDate);
            return (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                  {renderBillHeader(true)}
                  <tbody>
                    {weekList.map(w => (
                      <Fragment key={w.label}>
                        <tr><td colSpan={10} style={{ padding: "8px 12px", background: T.surface2, borderBottom: `1px solid ${T.border}`, borderTop: `1px solid ${T.border}` }}>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: T.text }}>{w.label}</span>
                            <span style={{ fontSize: 11, fontWeight: 700, color: T.red }}>{fmtK(w.total)} · {w.bills.length} bills</span>
                          </div>
                        </td></tr>
                        {sortBills(w.bills).map(b => renderBillRow(b, true))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }

          // ── GROUP BY STATUS ──
          if (viewMode === "status") {
            const groups = [
              { key: "overdue", label: "Overdue", color: T.red, filter: b => b.due_date && daysDiff(b.due_date) > 0 },
              { key: "current", label: "Current", color: T.green, filter: b => !b.due_date || daysDiff(b.due_date) <= 0 },
            ];
            return (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                  {renderBillHeader(true)}
                  <tbody>
                    {groups.map(g => {
                      const gBills = filtered.filter(g.filter);
                      if (gBills.length === 0) return null;
                      const gTotal = gBills.reduce((s, b) => s + Number(b.balance || 0), 0);
                      return (
                        <Fragment key={g.key}>
                          <tr><td colSpan={10} style={{ padding: "8px 12px", background: g.color + "10", borderBottom: `1px solid ${T.border}`, borderTop: `1px solid ${T.border}` }}>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: g.color }}>{g.label}</span>
                              <span style={{ fontSize: 11, fontWeight: 700, color: g.color }}>{fmtK(gTotal)} · {gBills.length} bills</span>
                            </div>
                          </td></tr>
                          {sortBills(gBills).map(b => renderBillRow(b, true))}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          }

          return null;
        })()}
      </div>

      {/* Invoice Inbox */}
      {tab === "inbox" && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Invoice Inbox</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => {
                const name = prompt("Rule name (e.g. 'Large bills need CFO approval'):");
                if (!name) return;
                const minAmt = prompt("Minimum amount (or leave empty):");
                const maxAmt = prompt("Maximum amount (or leave empty):");
                const vendors = prompt("Vendor names (comma-separated, or leave empty):");
                const approverEmail = prompt("Approver email:");
                if (!approverEmail) return;
                (async () => {
                  const { data: approver } = await supabase.from("profiles").select("id").eq("org_id", orgId).eq("email", approverEmail).single();
                  if (!approver) { alert("Approver not found"); return; }
                  const approver2Email = prompt("Second approver email (or leave empty):");
                  const approvers = [approver.id];
                  if (approver2Email) {
                    const { data: a2 } = await supabase.from("profiles").select("id").eq("org_id", orgId).eq("email", approver2Email).single();
                    if (a2) approvers.push(a2.id);
                  }
                  await supabase.from("ap_approval_rules").insert({
                    org_id: orgId,
                    name, min_amount: minAmt ? parseFloat(minAmt) : null, max_amount: maxAmt ? parseFloat(maxAmt) : null,
                    vendor_names: vendors ? vendors.split(",").map(v => v.trim()) : null,
                    approvers, created_by: user?.id,
                  });
                  alert("Approval rule created: " + name);
                })();
              }} style={{ padding: "5px 14px", fontSize: 11, fontWeight: 600, borderRadius: 6, background: T.surface2, border: `1px solid ${T.border}`, color: T.text2, cursor: "pointer" }}>⚙ Rules</button>
              {/* Gmail connect + scan */}
              {!gmailConn ? (
                <button onClick={async () => {
                  // Check for existing connection first
                  const res = await fetch(supabase.supabaseUrl + "/functions/v1/gmail-scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "list_connections", org_id: orgId }) });
                  const data = await res.json();
                  if (data.connections?.length > 0) { setGmailConn(data.connections[0]); return; }
                  // No connection — start OAuth
                  const authRes = await fetch(supabase.supabaseUrl + "/functions/v1/gmail-scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "auth_url", org_id: orgId }) });
                  const authData = await authRes.json();
                  if (authData.auth_url) window.open(authData.auth_url, "gmail_connect", "width=600,height=700");
                }} style={{ padding: "5px 14px", fontSize: 11, fontWeight: 600, borderRadius: 6, background: T.surface2, border: `1px solid ${T.border}`, color: T.text2, cursor: "pointer" }}>📧 Connect Gmail</button>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 10, color: T.green }}>✓ {gmailConn.email}</span>
                  <button onClick={async () => {
                    setScanning(true);
                    try {
                      const res = await fetch(supabase.supabaseUrl + "/functions/v1/gmail-scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "scan", connection_id: gmailConn.id }) });
                      const result = await res.json();
                      if (result.imported > 0) {
                        // Reload inbox
                        const { data } = await supabase.from("invoice_inbox").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(50);
                        setInboxItems(data || []);
                        alert(`Scanned ${gmailConn.email}: ${result.imported} new invoices imported, ${result.skipped} already imported`);
                      } else {
                        alert(result.message || `No new invoices found (${result.skipped} already imported)`);
                      }
                    } catch (e) { alert("Scan error: " + e.message); }
                    setScanning(false);
                  }} disabled={scanning} style={{ padding: "5px 14px", fontSize: 11, fontWeight: 700, borderRadius: 6, background: scanning ? T.surface2 : T.accent, color: scanning ? T.text3 : "#fff", cursor: "pointer", border: "none" }}>{scanning ? "Scanning…" : "📥 Scan Inbox"}</button>
                </div>
              )}
              <label style={{ padding: "5px 14px", fontSize: 11, fontWeight: 700, borderRadius: 6, background: T.accent, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                📎 Upload Invoice
                <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" style={{ display: "none" }} onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setUploadingInvoice(true);
                  try {
                    const path = `invoices/${Date.now()}_${file.name}`;
                    const { error: upErr } = await supabase.storage.from("bill-attachments").upload(path, file, { contentType: file.type, upsert: true });
                    if (upErr) throw upErr;
                    const fileUrl = `${supabase.supabaseUrl}/storage/v1/object/public/bill-attachments/${path}`;
                    const { data: inbox } = await supabase.from("invoice_inbox").insert({
                      org_id: orgId,
                      file_name: file.name, file_url: fileUrl, file_content_type: file.type, file_size: file.size,
                      source: "upload", status: "pending", uploaded_by: user?.id,
                    }).select().single();
                    if (inbox) {
                      setInboxItems(p => [inbox, ...p]);
                      // Trigger AI extraction
                      const res = await fetch(supabase.supabaseUrl + "/functions/v1/invoice-ai", {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "extract", inbox_id: inbox.id }),
                      });
                      const result = await res.json();
                      if (result.success) {
                        const { data: updated } = await supabase.from("invoice_inbox").select("*").eq("org_id", orgId).eq("id", inbox.id).single();
                        if (updated) setInboxItems(p => p.map(x => x.id === inbox.id ? updated : x));
                      }
                    }
                  } catch (err) { console.error("Upload error:", err); }
                  setUploadingInvoice(false);
                  e.target.value = "";
                }} />
              </label>
            </div>
          </div>
          {inboxLoading || uploadingInvoice ? (
            <div style={{ padding: 40, textAlign: "center", color: T.text3, fontSize: 12 }}>{uploadingInvoice ? "Uploading & extracting invoice data with AI…" : "Loading inbox…"}</div>
          ) : inboxItems.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>No invoices in inbox</div>
              <div style={{ fontSize: 11, color: T.text3, marginTop: 4 }}>Upload a vendor invoice PDF or image — AI will extract all the details automatically.</div>
            </div>
          ) : (
            <div>
              {/* Batch action bar */}
              {batchSelected.size > 0 && (
                <div style={{ padding: "8px 16px", background: T.accent + "10", borderBottom: `1px solid ${T.accent}30`, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: T.accent }}>{batchSelected.size} selected</span>
                  <button onClick={async () => {
                    for (const id of batchSelected) {
                      await fetch(supabase.supabaseUrl + "/functions/v1/invoice-ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve", inbox_id: id, user_id: user?.id }) });
                    }
                    setInboxItems(p => p.map(x => batchSelected.has(x.id) ? { ...x, status: "approved" } : x));
                    setBatchSelected(new Set());
                  }} style={{ padding: "4px 12px", fontSize: 10, fontWeight: 700, borderRadius: 4, border: "none", background: T.green + "18", color: T.green, cursor: "pointer" }}>Approve All</button>
                  <button onClick={async () => {
                    for (const id of batchSelected) { await supabase.from("invoice_inbox").update({ status: "denied" }).eq("org_id", orgId).eq("id", id); }
                    setInboxItems(p => p.map(x => batchSelected.has(x.id) ? { ...x, status: "denied" } : x));
                    setBatchSelected(new Set());
                  }} style={{ padding: "4px 12px", fontSize: 10, fontWeight: 700, borderRadius: 4, border: "none", background: T.red + "18", color: T.red, cursor: "pointer" }}>Deny All</button>
                  <button onClick={async () => {
                    for (const id of batchSelected) {
                      const inv = inboxItems.find(x => x.id === id);
                      if (inv?.status === "approved" && inv?.matched_vendor_ref) {
                        await fetch(supabase.supabaseUrl + "/functions/v1/qbo-push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create_bill", inbox_id: id }) });
                      }
                    }
                    setInboxItems(p => p.map(x => batchSelected.has(x.id) && x.status === "approved" ? { ...x, status: "synced_to_qbo" } : x));
                    setBatchSelected(new Set());
                  }} style={{ padding: "4px 12px", fontSize: 10, fontWeight: 700, borderRadius: 4, border: "none", background: "#8B5CF618", color: "#8B5CF6", cursor: "pointer" }}>Push All to QBO</button>
                  <button onClick={() => setBatchSelected(new Set())} style={{ padding: "4px 12px", fontSize: 10, fontWeight: 600, borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface2, color: T.text3, cursor: "pointer" }}>Clear</button>
                </div>
              )}
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
                <thead><tr style={{ borderBottom: `2px solid ${T.border}` }}>
                  <th style={{ padding: "6px 6px", width: 30 }}><input type="checkbox" checked={batchSelected.size === inboxItems.filter(i => i.status === "extracted").length && batchSelected.size > 0} onChange={e => { if (e.target.checked) setBatchSelected(new Set(inboxItems.filter(i => i.status === "extracted").map(i => i.id))); else setBatchSelected(new Set()); }} style={{ cursor: "pointer" }} /></th>
                  {["Status", "Vendor", "Invoice #", "Date", "Due", "Amount", "GL Account", "Confidence", "Actions"].map(h => (
                    <th key={h} style={{ padding: "6px 10px", fontSize: 9, fontWeight: 700, color: T.text3, textTransform: "uppercase", textAlign: h === "Amount" ? "right" : "left" }}>{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {inboxItems.map(inv => {
                    const statusColors = { pending: { bg: "#94a3b818", c: "#94a3b8" }, processing: { bg: T.accent + "18", c: T.accent }, extracted: { bg: T.green + "18", c: T.green }, approved: { bg: "#10B98118", c: "#10B981" }, duplicate: { bg: T.yellow + "18", c: T.yellow }, denied: { bg: T.red + "18", c: T.red }, error: { bg: T.red + "18", c: T.red }, synced_to_qbo: { bg: "#8B5CF618", c: "#8B5CF6" }, pushing_to_qbo: { bg: "#8B5CF618", c: "#8B5CF6" } };
                    const sc = statusColors[inv.status] || statusColors.pending;
                    const conf = inv.extracted_data?.confidence;
                    const isSelected = selectedInbox === inv.id;
                    const lineItems = inv.line_items ? (typeof inv.line_items === "string" ? JSON.parse(inv.line_items) : inv.line_items) : [];
                    return (
                      <Fragment key={inv.id}>
                      <tr onClick={() => setSelectedInbox(isSelected ? null : inv.id)} style={{ borderBottom: `1px solid ${T.border}15`, cursor: "pointer", background: isSelected ? T.surface2 : "transparent" }}>
                        <td style={{ padding: "7px 6px" }} onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={batchSelected.has(inv.id)} onChange={e => { const n = new Set(batchSelected); if (e.target.checked) n.add(inv.id); else n.delete(inv.id); setBatchSelected(n); }} style={{ cursor: "pointer" }} />
                        </td>
                        <td style={{ padding: "7px 10px" }}><span style={{ fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: sc.bg, color: sc.c }}>{(inv.status || "pending").toUpperCase()}</span></td>
                        <td style={{ padding: "7px 10px", fontSize: 12, fontWeight: 600, color: T.text }}>{inv.vendor_name || <span style={{ color: T.text3, fontStyle: "italic" }}>Extracting…</span>}</td>
                        <td style={{ padding: "7px 10px", fontSize: 11, fontFamily: "monospace", color: T.accent }}>{inv.invoice_number || "—"}</td>
                        <td style={{ padding: "7px 10px", fontSize: 11, color: T.text2 }}>{inv.invoice_date ? new Date(inv.invoice_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }) : "—"}</td>
                        <td style={{ padding: "7px 10px", fontSize: 11, color: T.text2 }}>{inv.due_date ? new Date(inv.due_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }) : "—"}</td>
                        <td style={{ padding: "7px 10px", fontSize: 12, fontWeight: 700, color: T.text, textAlign: "right", fontFamily: "monospace" }}>{inv.total_amount ? fmt(Number(inv.total_amount)) : "—"}</td>
                        <td style={{ padding: "7px 10px", fontSize: 11, color: T.accent }}>{inv.gl_account || "—"}</td>
                        <td style={{ padding: "7px 10px" }}>{conf != null ? <span style={{ fontSize: 10, fontWeight: 600, color: conf >= 0.9 ? T.green : conf >= 0.7 ? T.yellow : T.red }}>{Math.round(conf * 100)}%</span> : "—"}</td>
                        <td style={{ padding: "7px 10px" }} onClick={e => e.stopPropagation()}>
                          <div style={{ display: "flex", gap: 4, alignItems: "center", flexWrap: "wrap" }}>
                            {inv.file_url && <a href={inv.file_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, textDecoration: "none" }} title="View file">📄</a>}
                            {inv.status === "extracted" && (
                              <button onClick={async () => {
                                await fetch(supabase.supabaseUrl + "/functions/v1/invoice-ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "approve", inbox_id: inv.id, user_id: user?.id }) });
                                setInboxItems(p => p.map(x => x.id === inv.id ? { ...x, status: "approved" } : x));
                              }} style={{ padding: "2px 8px", fontSize: 9, fontWeight: 700, borderRadius: 4, border: "none", background: T.green + "18", color: T.green, cursor: "pointer" }}>Approve</button>
                            )}
                            {inv.status === "extracted" && (
                              <button onClick={async () => {
                                await supabase.from("invoice_inbox").update({ status: "denied" }).eq("org_id", orgId).eq("id", inv.id);
                                setInboxItems(p => p.map(x => x.id === inv.id ? { ...x, status: "denied" } : x));
                              }} style={{ padding: "2px 8px", fontSize: 9, fontWeight: 700, borderRadius: 4, border: "none", background: T.red + "18", color: T.red, cursor: "pointer" }}>Deny</button>
                            )}
                            {inv.status === "error" && (
                              <button onClick={async () => {
                                setInboxItems(p => p.map(x => x.id === inv.id ? { ...x, status: "processing" } : x));
                                const res = await fetch(supabase.supabaseUrl + "/functions/v1/invoice-ai", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "extract", inbox_id: inv.id }) });
                                const result = await res.json();
                                if (result.success) { const { data: updated } = await supabase.from("invoice_inbox").select("*").eq("org_id", orgId).eq("id", inv.id).single(); if (updated) setInboxItems(p => p.map(x => x.id === inv.id ? updated : x)); }
                              }} style={{ padding: "2px 8px", fontSize: 9, fontWeight: 700, borderRadius: 4, border: "none", background: T.accent + "18", color: T.accent, cursor: "pointer" }}>Retry</button>
                            )}
                            {inv.duplicate_of && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: T.yellow + "18", color: T.yellow, fontWeight: 600 }}>⚠ Dup</span>}
                            {inv.extracted_data?.po_match && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: inv.extracted_data.po_match.match === "exact" ? T.green + "18" : T.yellow + "18", color: inv.extracted_data.po_match.match === "exact" ? T.green : T.yellow, fontWeight: 600 }}>PO: {inv.extracted_data.po_match.po_number}</span>}
                            {inv.status === "approved" && inv.matched_vendor_ref && (
                              <button onClick={async () => {
                                setInboxItems(p => p.map(x => x.id === inv.id ? { ...x, status: "pushing_to_qbo" } : x));
                                try {
                                  const res = await fetch(supabase.supabaseUrl + "/functions/v1/qbo-push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create_bill", inbox_id: inv.id }) });
                                  const result = await res.json();
                                  if (result.success) { setInboxItems(p => p.map(x => x.id === inv.id ? { ...x, status: "synced_to_qbo" } : x)); }
                                  else { setInboxItems(p => p.map(x => x.id === inv.id ? { ...x, status: "approved" } : x)); alert(result.error); }
                                } catch (e) { setInboxItems(p => p.map(x => x.id === inv.id ? { ...x, status: "approved" } : x)); }
                              }} style={{ padding: "2px 8px", fontSize: 9, fontWeight: 700, borderRadius: 4, border: "none", background: "#8B5CF618", color: "#8B5CF6", cursor: "pointer" }}>⬆ Push to QBO</button>
                            )}
                            {inv.status === "approved" && !inv.matched_vendor_ref && (
                              <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: T.yellow + "12", color: T.yellow, fontWeight: 600 }}>No vendor match</span>
                            )}
                            {(inv.status === "synced_to_qbo" || inv.status === "pushing_to_qbo") && (
                              <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "#8B5CF618", color: "#8B5CF6", fontWeight: 600 }}>{inv.status === "pushing_to_qbo" ? "Syncing…" : "✓ In QBO"}</span>
                            )}
                          </div>
                        </td>
                      </tr>
                      {/* Expandable detail panel */}
                      {isSelected && (
                        <tr><td colSpan={10} style={{ padding: 0, background: T.surface2 + "40" }}>
                          <div style={{ padding: "14px 16px", display: "grid", gridTemplateColumns: inv.file_url ? "1fr 1fr" : "1fr", gap: 16 }}>
                            {/* Left: extracted details */}
                            <div>
                              <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 8 }}>Extracted Details</div>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 12 }}>
                                {[
                                  { l: "Vendor", v: inv.vendor_name }, { l: "Invoice #", v: inv.invoice_number },
                                  { l: "Invoice Date", v: inv.invoice_date }, { l: "Due Date", v: inv.due_date },
                                  { l: "Total", v: inv.total_amount ? fmt(Number(inv.total_amount)) : "—" }, { l: "GL Account", v: inv.gl_account },
                                  { l: "Payment Terms", v: inv.extracted_data?.payment_terms }, { l: "Currency", v: inv.currency },
                                  { l: "Memo", v: inv.memo }, { l: "PO #", v: inv.extracted_data?.po_number },
                                ].map(d => d.v ? (
                                  <div key={d.l}>
                                    <div style={{ fontSize: 9, fontWeight: 600, color: T.text3, textTransform: "uppercase" }}>{d.l}</div>
                                    <div style={{ fontSize: 12, color: T.text, marginTop: 1 }}>{d.v}</div>
                                  </div>
                                ) : null)}
                              </div>
                              {/* Line items */}
                              {lineItems.length > 0 && (
                                <div>
                                  <div style={{ fontSize: 11, fontWeight: 700, color: T.text, marginBottom: 4 }}>Line Items</div>
                                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                                    <thead><tr style={{ borderBottom: `1px solid ${T.border}` }}>
                                      {["Description", "Qty", "Unit Price", "Amount", "GL"].map(h => <th key={h} style={{ padding: "4px 6px", fontSize: 9, fontWeight: 600, color: T.text3, textAlign: h === "Qty" || h === "Unit Price" || h === "Amount" ? "right" : "left" }}>{h}</th>)}
                                    </tr></thead>
                                    <tbody>
                                      {lineItems.map((li, idx) => (
                                        <tr key={idx} style={{ borderBottom: `1px solid ${T.border}08` }}>
                                          <td style={{ padding: "4px 6px", color: T.text }}>{li.description || "—"}</td>
                                          <td style={{ padding: "4px 6px", color: T.text2, textAlign: "right" }}>{li.quantity || "—"}</td>
                                          <td style={{ padding: "4px 6px", color: T.text2, textAlign: "right", fontFamily: "monospace" }}>{li.unit_price ? fmt(Number(li.unit_price)) : "—"}</td>
                                          <td style={{ padding: "4px 6px", color: T.text, fontWeight: 600, textAlign: "right", fontFamily: "monospace" }}>{li.amount ? fmt(Number(li.amount)) : "—"}</td>
                                          <td style={{ padding: "4px 6px", color: T.accent, fontSize: 10 }}>{li.gl_account || "—"}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                              {/* Vendor match info */}
                              {inv.matched_vendor_ref && <div style={{ marginTop: 8, fontSize: 10, color: T.green }}>✓ Matched to QBO vendor (ref: {inv.matched_vendor_ref})</div>}
                              {inv.extracted_data?.vendor_address && <div style={{ marginTop: 4, fontSize: 10, color: T.text3 }}>Address: {inv.extracted_data.vendor_address}</div>}
                              {inv.extracted_data?.vendor_email && <div style={{ fontSize: 10, color: T.text3 }}>Email: {inv.extracted_data.vendor_email}</div>}
                            </div>
                            {/* Right: file preview */}
                            {inv.file_url && (
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 8 }}>Invoice Document</div>
                                {inv.file_content_type?.startsWith("image/") ? (
                                  <img src={inv.file_url} alt="Invoice" style={{ width: "100%", borderRadius: 8, border: `1px solid ${T.border}` }} />
                                ) : (
                                  <div style={{ background: T.surface3, borderRadius: 8, padding: 20, textAlign: "center" }}>
                                    <a href={inv.file_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: T.accent, textDecoration: "none", fontWeight: 600 }}>📄 Open {inv.file_name || "PDF"} in new tab</a>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </td></tr>
                      )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </div>
          )}
        </div>
      )}

      {/* Expenses Tab — Employee expense submissions */}
      {tab === "expenses" && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
          <div style={{ padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Expense Submissions</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setShowExpenseForm(!showExpenseForm)} style={{ padding: "5px 14px", fontSize: 11, fontWeight: 700, borderRadius: 6, background: showExpenseForm ? T.surface2 : T.accent, color: showExpenseForm ? T.text3 : "#fff", cursor: "pointer", border: showExpenseForm ? `1px solid ${T.border}` : "none" }}>{showExpenseForm ? "Cancel" : "+ Submit Expense"}</button>
              {expenses.length === 0 && !expensesLoading && (
                <button onClick={async () => {
                  setExpensesLoading(true);
                  const { data } = await supabase.from("expense_submissions").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(50);
                  setExpenses(data || []);
                  setExpensesLoading(false);
                }} style={{ padding: "5px 14px", fontSize: 11, fontWeight: 600, borderRadius: 6, background: T.surface2, border: `1px solid ${T.border}`, color: T.text2, cursor: "pointer" }}>Load Expenses</button>
              )}
            </div>
          </div>
          {/* Expense submission form */}
          {showExpenseForm && (
            <div style={{ padding: 16, borderBottom: `1px solid ${T.border}`, background: T.surface2 + "40" }}>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 10, marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: T.text3, marginBottom: 3 }}>MERCHANT / VENDOR</div>
                  <input value={expForm.merchant_name} onChange={e => setExpForm(p => ({ ...p, merchant_name: e.target.value }))} placeholder="e.g. Staples, Uber, Restaurant" style={{ width: "100%", padding: "6px 10px", fontSize: 12, borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.text, boxSizing: "border-box" }} />
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: T.text3, marginBottom: 3 }}>AMOUNT ($)</div>
                  <input value={expForm.amount} onChange={e => setExpForm(p => ({ ...p, amount: e.target.value }))} placeholder="0.00" type="number" step="0.01" style={{ width: "100%", padding: "6px 10px", fontSize: 12, borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.text, boxSizing: "border-box" }} />
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: T.text3, marginBottom: 3 }}>CATEGORY</div>
                  <select value={expForm.category} onChange={e => setExpForm(p => ({ ...p, category: e.target.value }))} style={{ width: "100%", padding: "6px 10px", fontSize: 12, borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.text, boxSizing: "border-box" }}>
                    {["supplies", "meals", "travel", "software", "equipment", "shipping", "marketing", "professional_services", "other"].map(c => <option key={c} value={c}>{c.replace("_", " ").replace(/\b\w/g, l => l.toUpperCase())}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10, marginBottom: 10 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: T.text3, marginBottom: 3 }}>DATE</div>
                  <input value={expForm.expense_date} onChange={e => setExpForm(p => ({ ...p, expense_date: e.target.value }))} type="date" style={{ width: "100%", padding: "6px 10px", fontSize: 12, borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.text, boxSizing: "border-box" }} />
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: T.text3, marginBottom: 3 }}>DESCRIPTION</div>
                  <input value={expForm.description} onChange={e => setExpForm(p => ({ ...p, description: e.target.value }))} placeholder="What was this expense for?" style={{ width: "100%", padding: "6px 10px", fontSize: 12, borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.text, boxSizing: "border-box" }} />
                </div>
              </div>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <label style={{ padding: "5px 14px", fontSize: 11, fontWeight: 600, borderRadius: 6, background: T.surface, border: `1px solid ${T.border}`, color: T.text2, cursor: "pointer" }}>
                  📎 Attach Receipt
                  <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" style={{ display: "none" }} onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const path = `expenses/${Date.now()}_${file.name}`;
                    await supabase.storage.from("bill-attachments").upload(path, file, { contentType: file.type, upsert: true });
                    const url = `${supabase.supabaseUrl}/storage/v1/object/public/bill-attachments/${path}`;
                    setExpForm(p => ({ ...p, receipt_url: url, receipt_name: file.name }));
                    e.target.value = "";
                  }} />
                </label>
                {expForm.receipt_url && <span style={{ fontSize: 11, color: T.green }}>✓ {expForm.receipt_name}</span>}
                <div style={{ flex: 1 }} />
                <button onClick={async () => {
                  if (!expForm.merchant_name || !expForm.amount) { alert("Merchant and amount required"); return; }
                  const { data } = await supabase.from("expense_submissions").insert({
                    org_id: orgId,
                    submitted_by: user?.id, submitter_name: profile?.display_name || user?.email,
                    merchant_name: expForm.merchant_name, amount: parseFloat(expForm.amount),
                    category: expForm.category, description: expForm.description,
                    expense_date: expForm.expense_date, receipt_url: expForm.receipt_url,
                    receipt_name: expForm.receipt_name, status: "pending",
                  }).select().single();
                  if (data) {
                    setExpenses(p => [data, ...p]);
                    setExpForm({ merchant_name: "", amount: "", category: "supplies", description: "", expense_date: new Date().toISOString().slice(0, 10) });
                    setShowExpenseForm(false);
                    // Notify Ben
                    await supabase.from("notifications").insert({
                      org_id: orgId,
                      user_id: "32cad5dd-9e94-4095-a16d-b4521391b050",
                      type: "expense_submitted", title: `Expense: ${expForm.merchant_name} — $${parseFloat(expForm.amount).toFixed(2)}`,
                      body: `${profile?.display_name || "Team member"} submitted an expense for reimbursement`,
                      entity_type: "expense", entity_id: data.id, category: "finance", link: "/finance/ap-ar",
                    });
                  }
                }} style={{ padding: "6px 18px", fontSize: 12, fontWeight: 700, borderRadius: 6, background: T.accent, color: "#fff", border: "none", cursor: "pointer" }}>Submit</button>
              </div>
            </div>
          )}
          {/* Expense list */}
          {expensesLoading ? (
            <div style={{ padding: 30, textAlign: "center", color: T.text3, fontSize: 12 }}>Loading expenses…</div>
          ) : expenses.length === 0 ? (
            <div style={{ padding: 30, textAlign: "center" }}>
              <div style={{ fontSize: 28, marginBottom: 6 }}>💰</div>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>No expenses yet</div>
              <div style={{ fontSize: 11, color: T.text3, marginTop: 3 }}>Click "Submit Expense" to request reimbursement for out-of-pocket purchases.</div>
            </div>
          ) : (
            <div>
              {expenses.map(exp => {
                const stColors = { pending: { bg: "#94a3b818", c: "#94a3b8", l: "PENDING" }, approved: { bg: T.green + "18", c: T.green, l: "APPROVED" }, denied: { bg: T.red + "18", c: T.red, l: "DENIED" }, reimbursed: { bg: "#8B5CF618", c: "#8B5CF6", l: "REIMBURSED" } };
                const st = stColors[exp.status] || stColors.pending;
                return (
                  <div key={exp.id} style={{ padding: "10px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{exp.merchant_name}</span>
                        <span style={{ fontSize: 14, fontWeight: 800, color: T.text, fontFamily: "monospace" }}>${Number(exp.amount).toFixed(2)}</span>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 4, background: st.bg, color: st.c }}>{st.l}</span>
                        <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: T.surface2, color: T.text3 }}>{exp.category?.replace("_", " ")}</span>
                      </div>
                      <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>
                        {exp.submitter_name} · {exp.expense_date ? new Date(exp.expense_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}
                        {exp.description && <span> · {exp.description}</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      {exp.receipt_url && <a href={exp.receipt_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, textDecoration: "none" }}>📄</a>}
                      {exp.status === "pending" && user?.id === "32cad5dd-9e94-4095-a16d-b4521391b050" && (
                        <>
                          <button onClick={async () => {
                            await supabase.from("expense_submissions").update({ status: "approved", approved_by: user?.id, approved_at: new Date().toISOString() }).eq("org_id", orgId).eq("id", exp.id);
                            setExpenses(p => p.map(x => x.id === exp.id ? { ...x, status: "approved" } : x));
                          }} style={{ padding: "2px 8px", fontSize: 9, fontWeight: 700, borderRadius: 4, border: "none", background: T.green + "18", color: T.green, cursor: "pointer" }}>Approve</button>
                          <button onClick={async () => {
                            const reason = prompt("Denial reason:");
                            await supabase.from("expense_submissions").update({ status: "denied", approved_by: user?.id, approved_at: new Date().toISOString(), denial_reason: reason }).eq("org_id", orgId).eq("id", exp.id);
                            setExpenses(p => p.map(x => x.id === exp.id ? { ...x, status: "denied" } : x));
                          }} style={{ padding: "2px 8px", fontSize: 9, fontWeight: 700, borderRadius: 4, border: "none", background: T.red + "18", color: T.red, cursor: "pointer" }}>Deny</button>
                        </>
                      )}
                      {exp.status === "approved" && user?.id === "32cad5dd-9e94-4095-a16d-b4521391b050" && (
                        <button onClick={async () => {
                          await supabase.from("expense_submissions").update({ status: "reimbursed", reimbursed_at: new Date().toISOString() }).eq("org_id", orgId).eq("id", exp.id);
                          setExpenses(p => p.map(x => x.id === exp.id ? { ...x, status: "reimbursed" } : x));
                        }} style={{ padding: "2px 8px", fontSize: 9, fontWeight: 700, borderRadius: 4, border: "none", background: "#8B5CF618", color: "#8B5CF6", cursor: "pointer" }}>Mark Reimbursed</button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// VENDOR INTELLIGENCE — Every vendor, one view
// ═══════════════════════════════════════════════════════════════════════════════
function VendorIntelligence({ isMobile }) {
  const T = typeof window !== "undefined" && document.body.dataset.theme === "dark"
    ? { bg:"#0a0a0f",surface:"#13131a",surface2:"#1a1a24",surface3:"#22222e",text:"#e8e8f0",text2:"#b0b0c0",text3:"#6b6b80",border:"#2a2a3a",accent:"#6366f1",green:"#10B981",red:"#EF4444",yellow:"#F59E0B" }
    : { bg:"#f8f9fc",surface:"#ffffff",surface2:"#f4f5f8",surface3:"#ecedf2",text:"#1a1a2e",text2:"#4a4a5e",text3:"#8a8a9e",border:"#e2e3e8",accent:"#6366f1",green:"#10B981",red:"#EF4444",yellow:"#F59E0B" };
  const fmt = n => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
  const fmtK = n => Math.abs(n) >= 1000000 ? `$${(n / 1000000).toFixed(1)}M` : Math.abs(n) >= 1000 ? `$${(n / 1000).toFixed(0)}K` : fmt(n);

  const { orgId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [bills, setBills] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [mappings, setMappings] = useState({});
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("total");
  const [sortDir, setSortDir] = useState("desc");
  const [selectedVendor, setSelectedVendor] = useState(null);
  const [minSpend, setMinSpend] = useState(0);

  useEffect(() => {
    (async () => {
      const [r1, r2, r3] = await Promise.all([
        supabase.from("qbo_bills").select("vendor_name,total_amount,txn_date,gl_accounts,memo,payment_status").eq("org_id", orgId),
        supabase.from("qbo_purchases").select("vendor_name,total_amount,txn_date,gl_accounts,memo,payment_type").limit(5000),
        supabase.from("qbo_category_mappings").select("*").eq("org_id", orgId),
      ]);
      setBills(r1.data || []); setPurchases(r2.data || []);
      if (r3.data) { const m = {}; r3.data.forEach(r => { m[r.account_name] = r.ga_category; }); setMappings(m); }
      setLoading(false);
    })();
  }, []);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: T.text3 }}>Loading vendor data…</div>;

  // Build vendor map from all transactions
  const vendorMap = {};
  const allTxns = [
    ...bills.map(b => ({ ...b, type: "bill" })),
    ...purchases.map(p => ({ ...p, type: "purchase" })),
  ];

  // Map GL to category
  const glToCategory = (gl) => {
    if (!gl) return null;
    for (const [acctName, cat] of Object.entries(mappings)) {
      const num = acctName.split(" ")[0];
      const name = acctName.split(" ").slice(1).join(" ").toLowerCase();
      if ((num && /^\d+$/.test(num) && gl.includes(num)) || (name && gl.toLowerCase().includes(name))) return cat;
    }
    return null;
  };

  allTxns.forEach(t => {
    const v = t.vendor_name || "Unknown";
    if (!vendorMap[v]) vendorMap[v] = { name: v, total: 0, count: 0, bills: 0, purchases: 0, categories: new Set(), months: {}, transactions: [] };
    const amt = Number(t.total_amount) || 0;
    vendorMap[v].total += amt;
    vendorMap[v].count++;
    if (t.type === "bill") vendorMap[v].bills++; else vendorMap[v].purchases++;
    const cat = glToCategory(t.gl_accounts);
    if (cat) vendorMap[v].categories.add(cat);
    const mo = t.txn_date ? t.txn_date.slice(0, 7) : "unknown";
    if (!vendorMap[v].months[mo]) vendorMap[v].months[mo] = 0;
    vendorMap[v].months[mo] += amt;
    vendorMap[v].transactions.push(t);
  });

  let vendors = Object.values(vendorMap);
  const totalAllVendors = vendors.reduce((s, v) => s + v.total, 0);
  const top5Pct = vendors.sort((a, b) => b.total - a.total).slice(0, 5).reduce((s, v) => s + v.total, 0) / (totalAllVendors || 1) * 100;

  // Filter
  if (search) {
    const q = search.toLowerCase();
    vendors = vendors.filter(v => v.name.toLowerCase().includes(q) || [...v.categories].some(c => c.toLowerCase().includes(q)));
  }
  if (minSpend > 0) vendors = vendors.filter(v => v.total >= minSpend);

  // Sort
  vendors.sort((a, b) => {
    let va, vb;
    if (sortBy === "total") { va = a.total; vb = b.total; }
    else if (sortBy === "count") { va = a.count; vb = b.count; }
    else if (sortBy === "name") { va = a.name.toLowerCase(); vb = b.name.toLowerCase(); return sortDir === "desc" ? vb.localeCompare(va) : va.localeCompare(vb); }
    else { va = a.total; vb = b.total; }
    return sortDir === "desc" ? vb - va : va - vb;
  });

  const months = [...new Set(allTxns.map(t => t.txn_date ? t.txn_date.slice(0, 7) : null).filter(Boolean))].sort();

  const toggleSort = (col) => {
    if (sortBy === col) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortBy(col); setSortDir("desc"); }
  };

  const TH = ({ col, label, align }) => (
    <th onClick={() => toggleSort(col)} style={{ padding: "8px 10px", textAlign: align || "left", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}>
      {label} {sortBy === col ? (sortDir === "asc" ? "↑" : "↓") : ""}
    </th>
  );

  // Selected vendor detail
  const sel = selectedVendor ? vendorMap[selectedVendor] : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, color: T.text }}>Vendor Intelligence</div>
          <div style={{ fontSize: 12, color: T.text3 }}>{Object.keys(vendorMap).length} vendors · {allTxns.length} transactions · {fmtK(totalAllVendors)} total spend</div>
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(4, 1fr)", gap: 10 }}>
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase" }}>Unique Vendors</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: T.text }}>{Object.keys(vendorMap).length}</div>
        </div>
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase" }}>YTD Spend</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: T.accent }}>{fmtK(totalAllVendors)}</div>
        </div>
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase" }}>Top 5 Concentration</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: top5Pct > 50 ? T.yellow : T.green }}>{top5Pct.toFixed(0)}%</div>
          <div style={{ fontSize: 9, color: T.text3 }}>of total spend</div>
        </div>
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: "12px 14px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase" }}>Avg per Vendor</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: T.text }}>{fmtK(totalAllVendors / (Object.keys(vendorMap).length || 1))}</div>
        </div>
      </div>

      {/* Search + filter bar */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, background: T.surface, border: `1px solid ${T.border}`, flex: isMobile ? "1 1 100%" : "0 1 auto" }}>
          <span style={{ fontSize: 12, color: T.text3 }}>🔍</span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vendor or category…" style={{ background: "transparent", border: "none", outline: "none", color: T.text, fontSize: 12, width: isMobile ? "100%" : 240 }} />
        </div>
        <select value={minSpend} onChange={e => setMinSpend(Number(e.target.value))} style={{ padding: "6px 10px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontSize: 11 }}>
          <option value={0}>All vendors</option>
          <option value={1000}>$1K+ spend</option>
          <option value={5000}>$5K+ spend</option>
          <option value={10000}>$10K+ spend</option>
          <option value={50000}>$50K+ spend</option>
          <option value={100000}>$100K+ spend</option>
        </select>
        <span style={{ fontSize: 11, color: T.text3, alignSelf: "center" }}>{vendors.length} vendors</span>
      </div>

      {/* Main content: table + detail panel */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : sel ? "1fr 1.1fr" : "1fr", gap: 16 }}>
        {/* Vendor table */}
        <div style={{ overflowX: "auto", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 500 }}>
            <thead>
              <tr style={{ borderBottom: `2px solid ${T.border}` }}>
                <th style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: T.text3, width: 30 }}>#</th>
                <TH col="name" label="Vendor" />
                <TH col="total" label="YTD Spend" align="right" />
                <TH col="count" label="Txns" align="right" />
                <th style={{ padding: "8px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: T.text3 }}>Categories</th>
                <th style={{ padding: "8px 10px", fontSize: 10, fontWeight: 700, color: T.text3 }}>Trend</th>
              </tr>
            </thead>
            <tbody>
              {vendors.slice(0, 100).map((v, i) => {
                const pctTotal = totalAllVendors > 0 ? (v.total / totalAllVendors * 100) : 0;
                const isSel = selectedVendor === v.name;
                // Mini sparkline
                const mVals = months.map(m => v.months[m] || 0);
                const maxM = Math.max(...mVals, 1);
                return (
                  <tr key={v.name} onClick={() => setSelectedVendor(isSel ? null : v.name)}
                    style={{ borderBottom: `1px solid ${T.border}`, cursor: "pointer", background: isSel ? T.accent + "10" : "transparent" }}
                    onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = T.surface2; }} onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = "transparent"; }}>
                    <td style={{ padding: "6px 10px", fontSize: 10, color: T.text3, fontWeight: 600 }}>{i + 1}</td>
                    <td style={{ padding: "6px 10px" }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: T.text, maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.name}</div>
                      <div style={{ fontSize: 9, color: T.text3 }}>{v.bills > 0 ? `${v.bills} bills` : ""}{v.bills > 0 && v.purchases > 0 ? " · " : ""}{v.purchases > 0 ? `${v.purchases} card` : ""}</div>
                    </td>
                    <td style={{ padding: "6px 10px", textAlign: "right" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{fmtK(v.total)}</div>
                      <div style={{ fontSize: 9, color: T.text3 }}>{pctTotal.toFixed(1)}%</div>
                    </td>
                    <td style={{ padding: "6px 10px", textAlign: "right", fontSize: 12, color: T.text2 }}>{v.count}</td>
                    <td style={{ padding: "6px 10px" }}>
                      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                        {[...v.categories].slice(0, 2).map(c => (
                          <span key={c} style={{ fontSize: 8, padding: "1px 5px", borderRadius: 4, background: T.surface2, color: T.text3, whiteSpace: "nowrap" }}>{c}</span>
                        ))}
                        {v.categories.size > 2 && <span style={{ fontSize: 8, color: T.text3 }}>+{v.categories.size - 2}</span>}
                      </div>
                    </td>
                    <td style={{ padding: "6px 10px" }}>
                      <div style={{ display: "flex", gap: 1, alignItems: "flex-end", height: 16 }}>
                        {mVals.map((val, j) => (
                          <div key={j} style={{ width: 6, height: Math.max((val / maxM) * 14, 1), background: val > 0 ? T.accent : T.surface3, borderRadius: 1 }} />
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {vendors.length > 100 && <div style={{ textAlign: "center", padding: 10, fontSize: 10, color: T.text3 }}>Showing 100 of {vendors.length}</div>}
        </div>

        {/* Detail panel */}
        {sel && (
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: isMobile ? 12 : 18, maxHeight: "80vh", overflow: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>{sel.name}</div>
                <div style={{ fontSize: 11, color: T.text3 }}>{sel.count} transactions · {sel.bills} bills · {sel.purchases} card charges</div>
              </div>
              <button onClick={() => setSelectedVendor(null)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 16 }}>✕</button>
            </div>

            {/* Vendor KPIs */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
              <div style={{ background: T.surface2, borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: T.text3, textTransform: "uppercase" }}>YTD Spend</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: T.accent }}>{fmtK(sel.total)}</div>
              </div>
              <div style={{ background: T.surface2, borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontSize: 9, fontWeight: 700, color: T.text3, textTransform: "uppercase" }}>Avg per Txn</div>
                <div style={{ fontSize: 18, fontWeight: 900, color: T.text }}>{fmtK(sel.total / (sel.count || 1))}</div>
              </div>
            </div>

            {/* Categories */}
            {sel.categories.size > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, marginBottom: 4 }}>BUDGET CATEGORIES</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {[...sel.categories].map(c => (
                    <span key={c} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 6, background: T.accent + "15", color: T.accent, fontWeight: 600 }}>{c}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Monthly trend */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, marginBottom: 6 }}>MONTHLY TREND</div>
              <div style={{ display: "flex", gap: 4, alignItems: "flex-end", height: 60 }}>
                {months.map(m => {
                  const val = sel.months[m] || 0;
                  const maxM = Math.max(...months.map(mo => sel.months[mo] || 0), 1);
                  const h = (val / maxM) * 50;
                  return (
                    <div key={m} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                      {val > 0 && <div style={{ fontSize: 8, color: T.text3, fontWeight: 600 }}>{fmtK(val)}</div>}
                      <div style={{ width: "100%", height: Math.max(h, 2), background: val > 0 ? T.accent : T.surface3, borderRadius: "3px 3px 0 0" }} />
                      <div style={{ fontSize: 8, color: T.text3 }}>{new Date(m + "-15").toLocaleDateString("en-US", { month: "short" })}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Transaction list */}
            <div>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, marginBottom: 4 }}>TRANSACTIONS ({sel.transactions.length})</div>
              <div style={{ maxHeight: 300, overflow: "auto" }}>
                {sel.transactions.sort((a, b) => (b.txn_date || "").localeCompare(a.txn_date || "")).slice(0, 50).map((t, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 0", fontSize: 11, borderBottom: `1px solid ${T.border}08` }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <span style={{ fontSize: 8, fontWeight: 700, padding: "1px 4px", borderRadius: 3, background: t.type === "bill" ? T.yellow + "20" : T.accent + "15", color: t.type === "bill" ? T.yellow : T.accent }}>{t.type === "bill" ? "BILL" : "CARD"}</span>
                        <span style={{ fontSize: 10, color: T.text3 }}>{t.txn_date ? new Date(t.txn_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}</span>
                      </div>
                      {t.memo && <div style={{ fontSize: 9, color: T.text3, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.memo.slice(0, 60)}</div>}
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 8 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: T.text }}>{fmt(Number(t.total_amount))}</div>
                      {t.gl_accounts && <div style={{ fontSize: 8, color: T.text3, maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.gl_accounts.split(",")[0]}</div>}
                    </div>
                  </div>
                ))}
              </div>
              {sel.transactions.length > 50 && <div style={{ fontSize: 9, color: T.text3, marginTop: 4 }}>Showing 50 of {sel.transactions.length}</div>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CASH FLOW VIEW — Weekly/Monthly cash in vs out
// ═══════════════════════════════════════════════════════════════════════════════
function CashFlowView({ isMobile }) {
  const T = typeof window !== "undefined" && document.body.dataset.theme === "dark"
    ? { bg:"#0a0a0f",surface:"#13131a",surface2:"#1a1a24",surface3:"#22222e",text:"#e8e8f0",text2:"#b0b0c0",text3:"#6b6b80",border:"#2a2a3a",accent:"#6366f1",green:"#10B981",red:"#EF4444",yellow:"#F59E0B" }
    : { bg:"#f8f9fc",surface:"#ffffff",surface2:"#f4f5f8",surface3:"#ecedf2",text:"#1a1a2e",text2:"#4a4a5e",text3:"#8a8a9e",border:"#e2e3e8",accent:"#6366f1",green:"#10B981",red:"#EF4444",yellow:"#F59E0B" };
  const fmt = n => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
  const fmtK = n => Math.abs(n) >= 1000000 ? `$${(n / 1000000).toFixed(1)}M` : Math.abs(n) >= 1000 ? `$${(n / 1000).toFixed(0)}K` : fmt(n);

  const { orgId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [deposits, setDeposits] = useState([]);
  const [payments, setPayments] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [bills, setBills] = useState([]);
  const [period, setPeriod] = useState("monthly"); // weekly, monthly
  const [expandedPeriod, setExpandedPeriod] = useState(null);

  useEffect(() => {
    (async () => {
      const [r1, r2, r3, r4, r5] = await Promise.all([
        supabase.from("qbo_deposits").select("*").eq("org_id", orgId).order("txn_date"),
        supabase.from("qbo_payments").select("*").order("txn_date"),
        supabase.from("qbo_purchases").select("vendor_name,total_amount,txn_date,gl_accounts,payment_type").eq("org_id", orgId).limit(5000).order("txn_date"),
        supabase.from("qbo_transfers").select("*").order("txn_date"),
        supabase.from("qbo_bills").select("vendor_name,total_amount,txn_date,payment_status").eq("org_id", orgId).order("txn_date"),
      ]);
      setDeposits(r1.data || []); setPayments(r2.data || []);
      setPurchases(r3.data || []); setTransfers(r4.data || []); setBills(r5.data || []);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: T.text3 }}>Loading cash flow data…</div>;

  // Build period buckets
  const getWeek = (d) => {
    const dt = new Date(d + "T12:00:00");
    const jan1 = new Date(dt.getFullYear(), 0, 1);
    const wk = Math.ceil(((dt - jan1) / 86400000 + jan1.getDay() + 1) / 7);
    return `${dt.getFullYear()}-W${String(wk).padStart(2, "0")}`;
  };
  const getMonth = (d) => d ? d.slice(0, 7) : "unknown";
  const getPeriodKey = (d) => period === "weekly" ? getWeek(d) : getMonth(d);

  // Aggregate all flows into periods
  const periodMap = {};
  const ensure = (k) => { if (!periodMap[k]) periodMap[k] = { key: k, cashIn: 0, cashOut: 0, deposits: [], pmtsReceived: [], pmtsMade: [], cardSpend: [], transfersIn: [], transfersOut: [] }; };

  // CASH IN: Deposits
  deposits.forEach(d => { if (!d.txn_date) return; const k = getPeriodKey(d.txn_date); ensure(k); periodMap[k].cashIn += Number(d.total_amount) || 0; periodMap[k].deposits.push(d); });
  // CASH IN: Payments received
  payments.filter(p => p.payment_type === "received").forEach(p => { if (!p.txn_date) return; const k = getPeriodKey(p.txn_date); ensure(k); periodMap[k].cashIn += Number(p.total_amount) || 0; periodMap[k].pmtsReceived.push(p); });
  // CASH OUT: Bill payments
  payments.filter(p => p.payment_type === "made").forEach(p => { if (!p.txn_date) return; const k = getPeriodKey(p.txn_date); ensure(k); periodMap[k].cashOut += Number(p.total_amount) || 0; periodMap[k].pmtsMade.push(p); });
  // CASH OUT: Card purchases
  purchases.forEach(p => { if (!p.txn_date) return; const k = getPeriodKey(p.txn_date); ensure(k); periodMap[k].cashOut += Number(p.total_amount) || 0; periodMap[k].cardSpend.push(p); });

  const periods = Object.values(periodMap).sort((a, b) => a.key.localeCompare(b.key));
  const totalIn = periods.reduce((s, p) => s + p.cashIn, 0);
  const totalOut = periods.reduce((s, p) => s + p.cashOut, 0);
  const netFlow = totalIn - totalOut;
  const maxBar = Math.max(...periods.map(p => Math.max(p.cashIn, p.cashOut)), 1);

  // Period label
  const periodLabel = (k) => {
    if (period === "weekly") return k;
    return new Date(k + "-15").toLocaleDateString("en-US", { month: "long", year: "numeric" });
  };

  const KPI = ({ label, value, color, sub }) => (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "16px 18px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: isMobile ? 18 : 24, fontWeight: 900, color: color || T.text }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: T.text3 }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, color: T.text }}>Cash Flow</div>
          <div style={{ fontSize: 12, color: T.text3 }}>2026 YTD · {deposits.length} deposits · {purchases.length} card charges · {payments.length} payments</div>
        </div>
        <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: `1px solid ${T.border}` }}>
          {[["monthly","Monthly"],["weekly","Weekly"]].map(([k,l]) => (
            <button key={k} onClick={() => setPeriod(k)} style={{ padding: "5px 14px", fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer", background: period === k ? T.accent : T.surface2, color: period === k ? "#fff" : T.text3 }}>{l}</button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 10 }}>
        <KPI label="Total Cash In" value={fmtK(totalIn)} color={T.green} sub={`${deposits.length + payments.filter(p => p.payment_type === "received").length} inflows`} />
        <KPI label="Total Cash Out" value={fmtK(totalOut)} color={T.red} sub={`${purchases.length + payments.filter(p => p.payment_type === "made").length} outflows`} />
        <KPI label="Net Cash Flow" value={fmtK(netFlow)} color={netFlow >= 0 ? T.green : T.red} sub={netFlow >= 0 ? "Net positive YTD" : "Net negative YTD"} />
        <KPI label="Avg Monthly Burn" value={fmtK(periods.length > 0 ? totalOut / periods.length : 0)} color={T.yellow} sub={`across ${periods.length} ${period === "weekly" ? "weeks" : "months"}`} />
      </div>

      {/* Bar chart */}
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: isMobile ? 12 : 20 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 12 }}>Cash In vs Cash Out — {period === "weekly" ? "Weekly" : "Monthly"}</div>
        <div style={{ display: "flex", gap: isMobile ? 2 : 8, alignItems: "flex-end", height: 180 }}>
          {periods.map(p => {
            const inH = (p.cashIn / maxBar) * 160;
            const outH = (p.cashOut / maxBar) * 160;
            const net = p.cashIn - p.cashOut;
            return (
              <div key={p.key} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 0 }}>
                <div style={{ fontSize: 8, fontWeight: 600, color: net >= 0 ? T.green : T.red, whiteSpace: "nowrap" }}>{net >= 0 ? "+" : ""}{fmtK(net)}</div>
                <div style={{ display: "flex", gap: 1, alignItems: "flex-end", height: 160 }}>
                  <div style={{ width: isMobile ? 10 : 18, height: Math.max(inH, 2), background: T.green, borderRadius: "3px 3px 0 0" }} title={`In: ${fmt(p.cashIn)}`} />
                  <div style={{ width: isMobile ? 10 : 18, height: Math.max(outH, 2), background: T.red + "80", borderRadius: "3px 3px 0 0" }} title={`Out: ${fmt(p.cashOut)}`} />
                </div>
                <div style={{ fontSize: 9, color: T.text3, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "100%" }}>
                  {period === "weekly" ? p.key.split("-W")[1] : new Date(p.key + "-15").toLocaleDateString("en-US", { month: "short" })}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 10 }}>
          <span style={{ fontSize: 10, color: T.text3 }}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: T.green, marginRight: 4 }} />Cash In</span>
          <span style={{ fontSize: 10, color: T.text3 }}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: T.red + "80", marginRight: 4 }} />Cash Out</span>
        </div>
      </div>

      {/* Period detail table */}
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `2px solid ${T.border}` }}>
              <th style={{ padding: "10px 12px", textAlign: "left", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase" }}>Period</th>
              <th style={{ padding: "10px 12px", textAlign: "right", fontSize: 10, fontWeight: 700, color: T.green, textTransform: "uppercase" }}>Cash In</th>
              <th style={{ padding: "10px 12px", textAlign: "right", fontSize: 10, fontWeight: 700, color: T.red, textTransform: "uppercase" }}>Cash Out</th>
              <th style={{ padding: "10px 12px", textAlign: "right", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase" }}>Net</th>
            </tr>
          </thead>
          <tbody>
            {periods.map(p => {
              const net = p.cashIn - p.cashOut;
              const isExp = expandedPeriod === p.key;
              return (
                <Fragment key={p.key}>
                  <tr onClick={() => setExpandedPeriod(isExp ? null : p.key)} style={{ cursor: "pointer", borderBottom: `1px solid ${T.border}` }}
                    onMouseEnter={e => e.currentTarget.style.background = T.surface2} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <td style={{ padding: "10px 12px", fontSize: 12, fontWeight: 600, color: T.text }}>
                      <span style={{ color: T.text3, fontSize: 9, marginRight: 4 }}>{isExp ? "▼" : "▶"}</span>
                      {periodLabel(p.key)}
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: 12, fontWeight: 600, color: T.green, textAlign: "right" }}>{fmtK(p.cashIn)}</td>
                    <td style={{ padding: "10px 12px", fontSize: 12, fontWeight: 600, color: T.red, textAlign: "right" }}>{fmtK(p.cashOut)}</td>
                    <td style={{ padding: "10px 12px", fontSize: 12, fontWeight: 700, color: net >= 0 ? T.green : T.red, textAlign: "right" }}>{net >= 0 ? "+" : ""}{fmtK(net)}</td>
                  </tr>
                  {isExp && (
                    <tr><td colSpan={4} style={{ padding: 0 }}>
                      <div style={{ background: T.surface2, padding: "12px 16px", display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
                        {/* Cash In breakdown */}
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: T.green, marginBottom: 6 }}>CASH IN — {fmtK(p.cashIn)}</div>
                          {p.deposits.length > 0 && <div style={{ fontSize: 10, fontWeight: 600, color: T.text3, marginBottom: 2 }}>Deposits ({p.deposits.length})</div>}
                          {p.deposits.sort((a, b) => Number(b.total_amount) - Number(a.total_amount)).slice(0, 8).map((d, i) => (
                            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: 10, borderBottom: `1px solid ${T.border}08` }}>
                              <span style={{ color: T.text2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, marginRight: 8 }}>{(d.memo || d.deposit_to || "Deposit").slice(0, 50)}</span>
                              <span style={{ fontWeight: 600, color: T.green, flexShrink: 0 }}>{fmtK(Number(d.total_amount))}</span>
                            </div>
                          ))}
                          {p.pmtsReceived.length > 0 && <div style={{ fontSize: 10, fontWeight: 600, color: T.text3, marginTop: 6, marginBottom: 2 }}>Customer Payments ({p.pmtsReceived.length})</div>}
                          {p.pmtsReceived.slice(0, 5).map((r, i) => (
                            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: 10 }}>
                              <span style={{ color: T.text2 }}>{r.customer_name || "Payment"}</span>
                              <span style={{ fontWeight: 600, color: T.green }}>{fmtK(Number(r.total_amount))}</span>
                            </div>
                          ))}
                        </div>
                        {/* Cash Out breakdown */}
                        <div>
                          <div style={{ fontSize: 11, fontWeight: 700, color: T.red, marginBottom: 6 }}>CASH OUT — {fmtK(p.cashOut)}</div>
                          {p.pmtsMade.length > 0 && <div style={{ fontSize: 10, fontWeight: 600, color: T.text3, marginBottom: 2 }}>Bill Payments ({p.pmtsMade.length})</div>}
                          {p.pmtsMade.sort((a, b) => Number(b.total_amount) - Number(a.total_amount)).slice(0, 5).map((r, i) => (
                            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: 10 }}>
                              <span style={{ color: T.text2 }}>{r.vendor_name || "Bill Payment"}</span>
                              <span style={{ fontWeight: 600, color: T.red }}>{fmtK(Number(r.total_amount))}</span>
                            </div>
                          ))}
                          {/* Top card spend vendors this period */}
                          {p.cardSpend.length > 0 && (() => {
                            const byV = {};
                            p.cardSpend.forEach(c => { const v = c.vendor_name || "Unknown"; if (!byV[v]) byV[v] = 0; byV[v] += Number(c.total_amount); });
                            const top = Object.entries(byV).sort((a, b) => b[1] - a[1]).slice(0, 6);
                            return (<>
                              <div style={{ fontSize: 10, fontWeight: 600, color: T.text3, marginTop: 6, marginBottom: 2 }}>Card Spend ({p.cardSpend.length} txns)</div>
                              {top.map(([v, amt]) => (
                                <div key={v} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0", fontSize: 10 }}>
                                  <span style={{ color: T.text2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, marginRight: 8 }}>{v}</span>
                                  <span style={{ fontWeight: 600, color: T.red, flexShrink: 0 }}>{fmtK(amt)}</span>
                                </div>
                              ))}
                            </>);
                          })()}
                        </div>
                      </div>
                    </td></tr>
                  )}
                </Fragment>
              );
            })}
            {/* TOTAL ROW */}
            <tr style={{ borderTop: `3px solid ${T.border}`, background: T.surface2 }}>
              <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 900, color: T.text }}>YTD TOTAL</td>
              <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 900, color: T.green, textAlign: "right" }}>{fmtK(totalIn)}</td>
              <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 900, color: T.red, textAlign: "right" }}>{fmtK(totalOut)}</td>
              <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 900, color: netFlow >= 0 ? T.green : T.red, textAlign: "right" }}>{netFlow >= 0 ? "+" : ""}{fmtK(netFlow)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// P&L EXPLORER — Monthly drill-down
// ═══════════════════════════════════════════════════════════════════════════════
function PLExplorer({ isMobile }) {
  const T = typeof window !== "undefined" && document.body.dataset.theme === "dark"
    ? { bg:"#0a0a0f",surface:"#13131a",surface2:"#1a1a24",surface3:"#22222e",text:"#e8e8f0",text2:"#b0b0c0",text3:"#6b6b80",border:"#2a2a3a",accent:"#6366f1",green:"#10B981",red:"#EF4444",yellow:"#F59E0B" }
    : { bg:"#f8f9fc",surface:"#ffffff",surface2:"#f4f5f8",surface3:"#ecedf2",text:"#1a1a2e",text2:"#4a4a5e",text3:"#8a8a9e",border:"#e2e3e8",accent:"#6366f1",green:"#10B981",red:"#EF4444",yellow:"#F59E0B" };
  const fmt = n => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
  const fmtK = n => Math.abs(n) >= 1000000 ? `$${(n / 1000000).toFixed(1)}M` : Math.abs(n) >= 1000 ? `$${(n / 1000).toFixed(0)}K` : fmt(n);

  const { orgId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [plMonthly, setPLMonthly] = useState([]);
  const [plYTD, setPLYTD] = useState([]);
  const [bills, setBills] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [expandedRow, setExpandedRow] = useState(null);
  const [viewMode, setViewMode] = useState("monthly"); // monthly, quarterly, ytd
  const [showType, setShowType] = useState("all"); // all, revenue, expense

  useEffect(() => {
    (async () => {
      const [r1, r2, r3, r4] = await Promise.all([
        supabase.from("qbo_pl_monthly").select("*").eq("org_id", orgId).order("period_month"),
        supabase.from("qbo_pl").select("*"),
        supabase.from("qbo_bills").select("vendor_name,total_amount,txn_date,gl_accounts,memo").eq("org_id", orgId),
        supabase.from("qbo_purchases").select("vendor_name,total_amount,txn_date,gl_accounts,memo").eq("org_id", orgId).limit(5000),
      ]);
      setPLMonthly(r1.data || []); setPLYTD(r2.data || []);
      setBills(r3.data || []); setPurchases(r4.data || []);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: T.text3 }}>Loading P&L data…</div>;

  const currentMonth = new Date().toISOString().slice(0, 7);
  const months = [...new Set(plMonthly.map(r => r.period_month))].sort();
  const isOpenMonth = (m) => m >= currentMonth;
  const monthLabels = months.map(m => new Date(m + "-15").toLocaleDateString("en-US", { month: "short" }));

  // Build all unique accounts
  const allAccounts = [...new Set([...plMonthly.map(r => r.account_name), ...plYTD.map(r => r.account_name)])];
  const getClassification = (acct) => {
    const row = plMonthly.find(r => r.account_name === acct) || plYTD.find(r => r.account_name === acct);
    return row?.classification || "Expense";
  };
  const getAccountType = (acct) => {
    const row = plMonthly.find(r => r.account_name === acct) || plYTD.find(r => r.account_name === acct);
    return row?.account_type || "";
  };

  // Group accounts by section
  const sections = [];
  const revenueAccts = allAccounts.filter(a => getClassification(a) === "Revenue");
  const cogsAccts = allAccounts.filter(a => getAccountType(a) === "Cost of Goods Sold");
  const opexAccts = allAccounts.filter(a => getClassification(a) === "Expense" && getAccountType(a) !== "Cost of Goods Sold" && getAccountType(a) !== "Other Expenses");
  const otherAccts = allAccounts.filter(a => getAccountType(a) === "Other Expenses");

  if (showType === "all" || showType === "revenue") sections.push({ label: "Revenue", accounts: revenueAccts, color: T.green, sign: 1 });
  if (showType === "all" || showType === "expense") {
    sections.push({ label: "Cost of Goods Sold", accounts: cogsAccts, color: T.red, sign: 1 });
    sections.push({ label: "Operating Expenses", accounts: opexAccts, color: T.yellow, sign: 1 });
    if (otherAccts.length > 0) sections.push({ label: "Other Expenses", accounts: otherAccts, color: T.text3, sign: 1 });
  }

  // Get amount for account in a given month
  const getMonthAmt = (acct, month) => {
    const row = plMonthly.find(r => r.account_name === acct && r.period_month === month);
    return row ? Number(row.amount) : 0;
  };
  const getYTDAmt = (acct) => {
    const row = plYTD.find(r => r.account_name === acct);
    return row ? Number(row.amount) : 0;
  };

  // Section totals
  const getSectionMonthTotal = (accounts, month) => accounts.reduce((s, a) => s + getMonthAmt(a, month), 0);
  const getSectionYTDTotal = (accounts) => accounts.reduce((s, a) => s + getYTDAmt(a), 0);

  // Grand totals
  const revMonthly = months.map(m => getSectionMonthTotal(revenueAccts, m));
  const expMonthly = months.map(m => getSectionMonthTotal([...cogsAccts, ...opexAccts, ...otherAccts], m));
  const revYTD = getSectionYTDTotal(revenueAccts);
  const expYTD = getSectionYTDTotal([...cogsAccts, ...opexAccts, ...otherAccts]);

  // Find transactions for expanded row
  const getTransactions = (acctName) => {
    const num = acctName.split(" ")[0];
    const name = acctName.split(" ").slice(1).join(" ").toLowerCase();
    const allTxns = [...bills, ...purchases].filter(t => {
      if (!t.gl_accounts) return false;
      return t.gl_accounts.includes(num) || t.gl_accounts.toLowerCase().includes(name);
    }).sort((a, b) => (b.txn_date || "").localeCompare(a.txn_date || ""));
    return allTxns.slice(0, 30);
  };

  const TH = { padding: "6px 8px", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", textAlign: "right", whiteSpace: "nowrap", position: "sticky", top: 0, background: T.surface, zIndex: 1 };
  const TD = { padding: "5px 8px", fontSize: 11, textAlign: "right", whiteSpace: "nowrap", borderBottom: `1px solid ${T.border}08` };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 900, color: T.text }}>P&L Explorer</div>
          <div style={{ fontSize: 12, color: T.text3 }}>2026 · {months.length} months · Click any line to see transactions</div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: `1px solid ${T.border}` }}>
            {[["all","All"],["revenue","Revenue"],["expense","Expenses"]].map(([k,l]) => (
              <button key={k} onClick={() => setShowType(k)} style={{ padding: "4px 10px", fontSize: 10, fontWeight: 600, border: "none", cursor: "pointer", background: showType === k ? T.accent : T.surface2, color: showType === k ? "#fff" : T.text3, borderRight: `1px solid ${T.border}` }}>{l}</button>
            ))}
          </div>
        </div>
      </div>

      {/* P&L Table */}
      <div style={{ overflowX: "auto", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 600 }}>
          <thead>
            <tr>
              <th style={{ ...TH, textAlign: "left", minWidth: 200, position: "sticky", left: 0, background: T.surface, zIndex: 2 }}>Account</th>
              {months.map((m, i) => <th key={m} style={TH}>{monthLabels[i]}{isOpenMonth(m) ? <span style={{ display: "block", fontSize: 7, color: "#F59E0B", fontWeight: 700 }}>OPEN</span> : ""}</th>)}
              <th style={{ ...TH, fontWeight: 800, color: T.text }}>YTD</th>
            </tr>
          </thead>
          <tbody>
            {sections.map(section => {
              const sortedAccts = section.accounts.sort((a, b) => Math.abs(getYTDAmt(b)) - Math.abs(getYTDAmt(a)));
              return (
                <Fragment key={section.label}>
                  {/* Section header */}
                  <tr style={{ background: T.surface2 }}>
                    <td style={{ padding: "8px 8px", fontSize: 12, fontWeight: 800, color: section.color, position: "sticky", left: 0, background: T.surface2, zIndex: 1 }}>{section.label}</td>
                    {months.map(m => <td key={m} style={{ ...TD, fontWeight: 700, color: section.color, background: T.surface2 }}>{fmtK(getSectionMonthTotal(section.accounts, m))}</td>)}
                    <td style={{ ...TD, fontWeight: 800, color: section.color, background: T.surface2 }}>{fmtK(getSectionYTDTotal(section.accounts))}</td>
                  </tr>
                  {/* Account rows */}
                  {sortedAccts.map(acct => {
                    const ytd = getYTDAmt(acct);
                    const isExpanded = expandedRow === acct;
                    const txns = isExpanded ? getTransactions(acct) : [];
                    return (
                      <Fragment key={acct}>
                        <tr onClick={() => setExpandedRow(isExpanded ? null : acct)} style={{ cursor: "pointer" }}
                          onMouseEnter={e => e.currentTarget.style.background = T.surface2} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                          <td style={{ padding: "5px 8px 5px 16px", fontSize: 11, color: T.text2, position: "sticky", left: 0, background: "inherit", zIndex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: 260 }}>
                            <span style={{ color: T.text3, fontSize: 9, marginRight: 4 }}>{isExpanded ? "▼" : "▶"}</span>
                            {acct}
                          </td>
                          {months.map(m => {
                            const val = getMonthAmt(acct, m);
                            return <td key={m} style={{ ...TD, color: val === 0 ? T.text3 + "60" : T.text2 }}>{val === 0 ? "—" : fmtK(val)}</td>;
                          })}
                          <td style={{ ...TD, fontWeight: 600, color: T.text }}>{fmtK(ytd)}</td>
                        </tr>
                        {/* Expanded transaction detail */}
                        {isExpanded && (
                          <tr>
                            <td colSpan={months.length + 2} style={{ padding: 0 }}>
                              <div style={{ background: T.surface2, padding: "8px 16px", borderBottom: `1px solid ${T.border}` }}>
                                {txns.length === 0 ? (
                                  <div style={{ fontSize: 11, color: T.text3, fontStyle: "italic" }}>No bill/purchase transactions found. This may be payroll or journal entry based.</div>
                                ) : (
                                  <>
                                    <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, marginBottom: 4 }}>TRANSACTIONS ({txns.length}{txns.length >= 30 ? "+" : ""})</div>
                                    {txns.map((t, i) => (
                                      <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0", fontSize: 11, borderBottom: `1px solid ${T.border}10` }}>
                                        <div style={{ flex: 1, minWidth: 0, display: "flex", gap: 8, alignItems: "center" }}>
                                          <span style={{ fontWeight: 600, color: T.text, whiteSpace: "nowrap" }}>{t.vendor_name || "—"}</span>
                                          {t.memo && <span style={{ color: T.text3, fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>— {t.memo.slice(0, 50)}</span>}
                                        </div>
                                        <div style={{ display: "flex", gap: 10, alignItems: "center", flexShrink: 0 }}>
                                          <span style={{ fontSize: 10, color: T.text3 }}>{t.txn_date ? new Date(t.txn_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}</span>
                                          <span style={{ fontWeight: 600, color: T.text, minWidth: 55, textAlign: "right" }}>{fmt(Number(t.total_amount))}</span>
                                        </div>
                                      </div>
                                    ))}
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </Fragment>
              );
            })}

            {/* NET INCOME row */}
            {showType === "all" && (
              <tr style={{ borderTop: `3px solid ${T.border}` }}>
                <td style={{ padding: "10px 8px", fontSize: 13, fontWeight: 900, color: T.text, position: "sticky", left: 0, background: T.surface, zIndex: 1 }}>NET INCOME</td>
                {months.map((m, i) => {
                  const net = revMonthly[i] - expMonthly[i];
                  return <td key={m} style={{ ...TD, fontSize: 12, fontWeight: 900, color: net >= 0 ? T.green : T.red }}>{fmtK(net)}</td>;
                })}
                <td style={{ ...TD, fontSize: 13, fontWeight: 900, color: revYTD - expYTD >= 0 ? T.green : T.red }}>{fmtK(revYTD - expYTD)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CFO DASHBOARD — Executive Financial Overview
// ═══════════════════════════════════════════════════════════════════════════════
function CFODashboard({ isMobile }) {
  const T = typeof window !== "undefined" && document.body.dataset.theme === "dark"
    ? { bg:"#0a0a0f",surface:"#13131a",surface2:"#1a1a24",surface3:"#22222e",text:"#e8e8f0",text2:"#b0b0c0",text3:"#6b6b80",border:"#2a2a3a",accent:"#6366f1",green:"#10B981",red:"#EF4444",yellow:"#F59E0B",purple:"#8B5CF6" }
    : { bg:"#f8f9fc",surface:"#ffffff",surface2:"#f4f5f8",surface3:"#ecedf2",text:"#1a1a2e",text2:"#4a4a5e",text3:"#8a8a9e",border:"#e2e3e8",accent:"#6366f1",green:"#10B981",red:"#EF4444",yellow:"#F59E0B",purple:"#8B5CF6" };
  const fmt = n => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
  const fmtK = n => Math.abs(n) >= 1000000 ? `$${(n / 1000000).toFixed(1)}M` : Math.abs(n) >= 1000 ? `$${(n / 1000).toFixed(0)}K` : fmt(n);

  const { orgId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [pl, setPL] = useState([]);
  const [plMonthly, setPLMonthly] = useState([]);
  const [bs, setBS] = useState([]);
  const [bills, setBills] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [payments, setPayments] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const [journalEntries, setJournalEntries] = useState([]);
  const [mappings, setMappings] = useState({});
  const [bankAccounts, setBankAccounts] = useState([]);
  const [shopifyOrderStats, setShopifyOrderStats] = useState(null);
  const [conn, setConn] = useState(null);

  useEffect(() => {
    (async () => {
      const [r1, r2, r3, r4, r5, r6, r7, r8, r9, r10, r11, r12] = await Promise.all([
        supabase.from("qbo_pl").select("*").eq("org_id", orgId),
        supabase.from("qbo_pl_monthly").select("*").eq("org_id", orgId).order("period_month"),
        supabase.from("qbo_balance_sheet").select("*"),
        supabase.from("qbo_bills").select("vendor_name,total_amount,balance,payment_status,txn_date,gl_accounts").eq("org_id", orgId),
        supabase.from("qbo_purchases").select("vendor_name,total_amount,txn_date,gl_accounts,payment_type").eq("org_id", orgId).limit(5000),
        supabase.from("qbo_deposits").select("*"),
        supabase.from("qbo_payments").select("*").eq("org_id", orgId),
        supabase.from("qbo_transfers").select("*"),
        supabase.from("qbo_journal_entries").select("qbo_id,txn_date,total_amount,memo"),
        supabase.from("qbo_category_mappings").select("*").eq("org_id", orgId),
        supabase.from("qbo_connections").select("*").eq("org_id", orgId).order("connected_at", { ascending: false }).limit(1),
        supabase.from("qbo_accounts").select("*").eq("org_id", orgId).eq("account_type", "Bank"),
      ]);
      setPL(r1.data || []); setPLMonthly(r2.data || []); setBS(r3.data || []);
      setBills(r4.data || []); setPurchases(r5.data || []); setDeposits(r6.data || []);
      setPayments(r7.data || []); setTransfers(r8.data || []); setJournalEntries(r9.data || []);
      if (r10.data) { const m = {}; r10.data.forEach(r => { m[r.account_name] = r.ga_category; }); setMappings(m); }
      if (r11.data?.[0]) setConn(r11.data[0]);
      setBankAccounts(r12.data || []);
      // Load Shopify order stats
      const today = new Date().toISOString().slice(0, 10);
      const { count: todayOrders } = await supabase.from("shopify_orders").select("*", { count: "exact", head: true }).gte("created_at", today + "T00:00:00");
      const { data: todayRev } = await supabase.from("shopify_orders").select("total_price").gte("created_at", today + "T00:00:00");
      const { count: totalShopifyOrders } = await supabase.from("shopify_orders").select("*", { count: "exact", head: true });
      const { count: totalShopifyCustomers } = await supabase.from("shopify_customers").select("*", { count: "exact", head: true });
      setShopifyOrderStats({
        todayOrders: todayOrders || 0,
        todayRevenue: (todayRev || []).reduce((s, o) => s + Number(o.total_price || 0), 0),
        totalOrders: totalShopifyOrders || 0,
        totalCustomers: totalShopifyCustomers || 0,
      });
      setLoading(false);
    })();
  }, []);

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: T.text3 }}>Loading financial data…</div>;

  // Derived metrics
  const revenue = pl.filter(r => r.classification === "Revenue").reduce((s, r) => s + Number(r.amount), 0);
  const expenses = pl.filter(r => r.classification === "Expense").reduce((s, r) => s + Number(r.amount), 0);
  const netIncome = revenue - expenses;
  const grossMargin = revenue > 0 ? ((revenue - pl.filter(r => r.account_type === "Cost of Goods Sold").reduce((s, r) => s + Number(r.amount), 0)) / revenue * 100) : 0;

  const totalAssets = bs.filter(r => r.section === "Asset").reduce((s, r) => s + Number(r.amount), 0);
  const totalLiabilities = bs.filter(r => r.section === "Liability").reduce((s, r) => s + Number(r.amount), 0);
  const totalEquity = bs.filter(r => r.section === "Equity").reduce((s, r) => s + Number(r.amount), 0);
  const cashAccounts = bs.filter(r => r.section === "Asset" && (r.account_name.toLowerCase().includes("checking") || r.account_name.toLowerCase().includes("savings") || r.account_name.toLowerCase().includes("cash")));
  const totalCashBS = cashAccounts.reduce((s, r) => s + Number(r.amount), 0);
  // Use bank accounts from COA (more current than Balance Sheet)
  const bankTotal = bankAccounts.filter(a => a.current_balance > 0).reduce((s, a) => s + Number(a.current_balance), 0);
  const totalCash = bankTotal > 0 ? bankTotal : totalCashBS;

  const apOpen = bills.filter(b => b.payment_status === "open").reduce((s, b) => s + Number(b.balance), 0);
  const arOpen = 0; // Would need invoices loaded
  const totalBillsYTD = bills.reduce((s, b) => s + Number(b.total_amount), 0);
  const totalPurchasesYTD = purchases.reduce((s, b) => s + Number(b.total_amount), 0);
  const totalDepositsYTD = deposits.reduce((s, d) => s + Number(d.total_amount), 0);
  const pmtsReceived = payments.filter(p => p.payment_type === "received").reduce((s, p) => s + Number(p.total_amount), 0);
  const pmtsMade = payments.filter(p => p.payment_type === "made").reduce((s, p) => s + Number(p.total_amount), 0);

  // Monthly P&L trend — exclude partial current month if data is clearly incomplete
  const currentMo = new Date().toISOString().slice(0, 7);
  const months = [...new Set(plMonthly.map(r => r.period_month))].sort();
  const isOpenMo = (m) => m >= currentMo;
  const monthlyData = months.map(m => {
    const mRows = plMonthly.filter(r => r.period_month === m);
    const rev = mRows.filter(r => r.classification === "Revenue").reduce((s, r) => s + Number(r.amount), 0);
    const exp = mRows.filter(r => r.classification === "Expense").reduce((s, r) => s + Number(r.amount), 0);
    return { month: m, revenue: rev, expenses: exp, net: rev - exp, label: new Date(m + "-15").toLocaleDateString("en-US", { month: "short" }) };
  });
  const maxMonthly = Math.max(...monthlyData.map(m => Math.max(m.revenue, m.expenses)), 1);

  // Top vendors (bills + purchases combined)
  const vendorMap = {};
  bills.forEach(b => { const v = b.vendor_name || "Unknown"; if (!vendorMap[v]) vendorMap[v] = { name: v, total: 0, count: 0 }; vendorMap[v].total += Number(b.total_amount); vendorMap[v].count++; });
  purchases.forEach(p => { const v = p.vendor_name || "Unknown"; if (!vendorMap[v]) vendorMap[v] = { name: v, total: 0, count: 0 }; vendorMap[v].total += Number(p.total_amount); vendorMap[v].count++; });
  const topVendors = Object.values(vendorMap).sort((a, b) => b.total - a.total).slice(0, 12);

  // Spend by category
  const catSpend = {};
  pl.filter(r => r.classification === "Expense").forEach(r => {
    const cat = mappings[r.account_name] || "Unmatched";
    if (!catSpend[cat]) catSpend[cat] = 0;
    catSpend[cat] += Number(r.amount);
  });
  const catList = Object.entries(catSpend).sort((a, b) => b[1] - a[1]);
  const CAT_COLORS = { "COGS":"#EC4899", "Direct Ad Spend":"#EF4444", "People Costs":"#8B5CF6", "Brand/Other/Marketing":"#F59E0B", "Consultants":"#3B82F6", "Software and Subscriptions":"#10B981", "T&E":"#0EA5E9", "R&D":"#6366F1", "Legal":"#A855F7", "Insurance":"#14B8A6", "Non-Fixed and Other":"#6B7280" };

  // Revenue by income account
  const revenueAccts = pl.filter(r => r.classification === "Revenue").sort((a, b) => Number(b.amount) - Number(a.amount));

  const KPI = ({ label, value, sub, color, icon }) => (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: isMobile ? "12px 10px" : "16px 18px", display: "flex", flexDirection: "column", gap: 4 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.5px" }}>{icon && <span style={{ marginRight: 4 }}>{icon}</span>}{label}</div>
      <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 900, color: color || T.text }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: T.text3 }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, color: T.text }}>Earth Breeze — Financial Overview</div>
          <div style={{ fontSize: 12, color: T.text3 }}>2026 YTD · Last synced {conn?.last_synced_at ? new Date(conn.last_synced_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—"}</div>
        </div>
      </div>

      {/* PRIMARY KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(5, 1fr)", gap: 10 }}>
        <KPI icon="💰" label="YTD Revenue" value={fmtK(revenue)} color={T.green} sub={`${months.length} months`} />
        <KPI icon="📤" label="YTD Expenses" value={fmtK(expenses)} color={T.red} />
        <KPI icon="📊" label="Net Income" value={fmtK(netIncome)} color={netIncome >= 0 ? T.green : T.red} sub={`${(netIncome / revenue * 100).toFixed(1)}% margin`} />
        <KPI icon="📈" label="Gross Margin" value={`${grossMargin.toFixed(1)}%`} color={T.accent} />
        <KPI icon="🏦" label="Cash Position" value={totalCash > 0 ? fmtK(totalCash) : "Sync BS"} color={T.purple} sub={totalCash > 0 ? `of ${fmtK(totalAssets)} assets` : ""} />
      </div>

      {/* SECONDARY KPIs */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(5, 1fr)", gap: 10 }}>
        <KPI icon="📋" label="AP Outstanding" value={fmtK(apOpen)} color={T.yellow} sub={`${bills.filter(b => b.payment_status === "open").length} open bills`} />
        <KPI icon="💳" label="Card Spend YTD" value={fmtK(totalPurchasesYTD)} sub={`${purchases.length} transactions`} />
        <KPI icon="📥" label="Deposits YTD" value={fmtK(totalDepositsYTD)} sub={`${deposits.length} deposits`} color={T.green} />
        <KPI icon="🛍️" label="DTC Orders Today" value={shopifyOrderStats?.todayOrders ?? "—"} color="#95BF47" sub={shopifyOrderStats?.todayRevenue ? fmtK(shopifyOrderStats.todayRevenue) + " revenue" : shopifyOrderStats?.totalOrders ? `${shopifyOrderStats.totalOrders.toLocaleString()} total synced` : "Sync Shopify"} />
        <KPI icon="👥" label="DTC Customers" value={shopifyOrderStats?.totalCustomers ? shopifyOrderStats.totalCustomers.toLocaleString() : "—"} sub={shopifyOrderStats?.totalOrders ? `${shopifyOrderStats.totalOrders.toLocaleString()} lifetime orders` : ""} />
      </div>

      {/* BANK ACCOUNTS */}
      {bankAccounts.length > 0 && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: isMobile ? 12 : 18 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 10 }}>Bank Accounts (Chase)</div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : `repeat(${Math.min(bankAccounts.filter(a => Number(a.current_balance) !== 0).length, 4)}, 1fr)`, gap: 10 }}>
            {bankAccounts.filter(a => Number(a.current_balance) !== 0).sort((a, b) => Math.abs(Number(b.current_balance)) - Math.abs(Number(a.current_balance))).map(a => (
              <div key={a.qbo_id} style={{ background: T.surface2, borderRadius: 8, padding: "12px 14px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase" }}>{a.name}</div>
                <div style={{ fontSize: 20, fontWeight: 900, color: Number(a.current_balance) >= 0 ? T.green : T.red, marginTop: 4 }}>{fmtK(Number(a.current_balance))}</div>
                <div style={{ fontSize: 9, color: T.text3 }}>{a.account_sub_type}</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10, color: T.text3, marginTop: 8 }}>Balances from QuickBooks · Last synced {conn?.last_synced_at ? new Date(conn.last_synced_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "—"} · Auto-syncs every 4 hours</div>
        </div>
      )}

      {/* MONTHLY P&L CHART */}
      {monthlyData.length > 0 && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: isMobile ? 12 : 20 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 12 }}>Monthly P&L Trend</div>
          <div style={{ display: "flex", gap: isMobile ? 4 : 12, alignItems: "flex-end", height: 160 }}>
            {monthlyData.map(m => {
              const revH = (m.revenue / maxMonthly) * 140;
              const expH = (m.expenses / maxMonthly) * 140;
              return (
                <div key={m.month} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <div style={{ fontSize: 9, fontWeight: 600, color: m.net >= 0 ? T.green : T.red }}>{fmtK(m.net)}</div>
                  <div style={{ display: "flex", gap: 2, alignItems: "flex-end", height: 140 }}>
                    <div style={{ width: isMobile ? 12 : 20, height: revH, background: T.green, borderRadius: "4px 4px 0 0", minHeight: 2 }} title={`Revenue: ${fmt(m.revenue)}`} />
                    <div style={{ width: isMobile ? 12 : 20, height: expH, background: T.red + "80", borderRadius: "4px 4px 0 0", minHeight: 2 }} title={`Expenses: ${fmt(m.expenses)}`} />
                  </div>
                  <div style={{ fontSize: 10, color: T.text3, fontWeight: 600 }}>{m.label}</div>
                  {isOpenMo(m.month) && <div style={{ fontSize: 7, fontWeight: 700, color: T.yellow, background: T.yellow + "18", padding: "1px 4px", borderRadius: 3 }}>OPEN</div>}
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 10 }}>
            <span style={{ fontSize: 10, color: T.text3 }}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: T.green, marginRight: 4 }} />Revenue</span>
            <span style={{ fontSize: 10, color: T.text3 }}><span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 2, background: T.red + "80", marginRight: 4 }} />Expenses</span>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
        {/* SPEND BY CATEGORY */}
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: isMobile ? 12 : 18 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 12 }}>Spend by Category</div>
          {catList.map(([cat, amt]) => {
            const pctVal = expenses > 0 ? (amt / expenses * 100) : 0;
            return (
              <div key={cat} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: `1px solid ${T.border}10` }}>
                <div style={{ width: 6, height: 6, borderRadius: 3, background: CAT_COLORS[cat] || T.text3, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0, fontSize: 11, color: T.text2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cat}</div>
                <div style={{ width: 50, height: 4, borderRadius: 2, background: T.surface3, overflow: "hidden", flexShrink: 0 }}><div style={{ width: `${Math.min(pctVal, 100)}%`, height: "100%", background: CAT_COLORS[cat] || T.text3, borderRadius: 2 }} /></div>
                <span style={{ fontSize: 11, fontWeight: 600, color: T.text, minWidth: 55, textAlign: "right" }}>{fmtK(amt)}</span>
                <span style={{ fontSize: 9, color: T.text3, minWidth: 28, textAlign: "right" }}>{pctVal.toFixed(0)}%</span>
              </div>
            );
          })}
        </div>

        {/* TOP VENDORS */}
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: isMobile ? 12 : 18 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 12 }}>Top Vendors by Spend</div>
          {topVendors.map((v, i) => (
            <div key={v.name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: `1px solid ${T.border}10` }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: T.text3, width: 18, textAlign: "right" }}>#{i + 1}</span>
              <div style={{ flex: 1, minWidth: 0, fontSize: 11, color: T.text, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.name}</div>
              <span style={{ fontSize: 9, color: T.text3 }}>{v.count} txns</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: T.text, minWidth: 60, textAlign: "right" }}>{fmtK(v.total)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* REVENUE BREAKDOWN + BALANCE SHEET */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
        {/* Revenue by channel */}
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: isMobile ? 12 : 18 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 12 }}>Revenue Breakdown</div>
          {revenueAccts.map(r => {
            const pctVal = revenue > 0 ? (Number(r.amount) / revenue * 100) : 0;
            return (
              <div key={r.account_name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: `1px solid ${T.border}10` }}>
                <div style={{ flex: 1, minWidth: 0, fontSize: 11, color: T.text2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.account_name}</div>
                <div style={{ width: 50, height: 4, borderRadius: 2, background: T.surface3, overflow: "hidden", flexShrink: 0 }}><div style={{ width: `${Math.min(pctVal, 100)}%`, height: "100%", background: T.green, borderRadius: 2 }} /></div>
                <span style={{ fontSize: 11, fontWeight: 600, color: T.green, minWidth: 55, textAlign: "right" }}>{fmtK(Number(r.amount))}</span>
                <span style={{ fontSize: 9, color: T.text3, minWidth: 28, textAlign: "right" }}>{pctVal.toFixed(0)}%</span>
              </div>
            );
          })}
        </div>

        {/* Balance Sheet Summary */}
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: isMobile ? 12 : 18 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 12 }}>Balance Sheet Summary</div>
          {bs.length === 0 ? (
            <div style={{ fontSize: 11, color: T.text3, fontStyle: "italic" }}>Run a sync to populate Balance Sheet data</div>
          ) : (
            <>
              {[{ section: "Asset", color: T.green, label: "Assets" }, { section: "Liability", color: T.red, label: "Liabilities" }, { section: "Equity", color: T.purple, label: "Equity" }].map(({ section, color, label }) => {
                const items = bs.filter(r => r.section === section).sort((a, b) => Math.abs(Number(b.amount)) - Math.abs(Number(a.amount)));
                const total = items.reduce((s, r) => s + Number(r.amount), 0);
                return (
                  <div key={section} style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color }}>{label}</span>
                      <span style={{ fontSize: 12, fontWeight: 800, color }}>{fmtK(total)}</span>
                    </div>
                    {items.slice(0, 5).map(r => (
                      <div key={r.account_name} style={{ display: "flex", justifyContent: "space-between", padding: "2px 0 2px 12px", fontSize: 10, color: T.text3 }}>
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{r.account_name}</span>
                        <span style={{ fontWeight: 600, color: T.text2, marginLeft: 8 }}>{fmtK(Number(r.amount))}</span>
                      </div>
                    ))}
                    {items.length > 5 && <div style={{ fontSize: 9, color: T.text3, paddingLeft: 12, marginTop: 2 }}>+{items.length - 5} more accounts</div>}
                  </div>
                );
              })}
            </>
          )}
        </div>
      </div>

      {/* CASH FLOW SUMMARY */}
      {(deposits.length > 0 || payments.length > 0) && (
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: isMobile ? 12 : 18 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 12 }}>Cash Flow Summary — 2026 YTD</div>
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 16 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.green, marginBottom: 6 }}>CASH IN</div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 11, borderBottom: `1px solid ${T.border}10` }}><span style={{ color: T.text2 }}>Deposits</span><span style={{ fontWeight: 600, color: T.text }}>{fmtK(totalDepositsYTD)}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 11, borderBottom: `1px solid ${T.border}10` }}><span style={{ color: T.text2 }}>Customer Payments</span><span style={{ fontWeight: 600, color: T.text }}>{fmtK(pmtsReceived)}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0 0", fontSize: 12, fontWeight: 700 }}><span style={{ color: T.green }}>Total In</span><span style={{ color: T.green }}>{fmtK(totalDepositsYTD + pmtsReceived)}</span></div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.red, marginBottom: 6 }}>CASH OUT</div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 11, borderBottom: `1px solid ${T.border}10` }}><span style={{ color: T.text2 }}>Bill Payments</span><span style={{ fontWeight: 600, color: T.text }}>{fmtK(pmtsMade)}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 11, borderBottom: `1px solid ${T.border}10` }}><span style={{ color: T.text2 }}>Card Spend</span><span style={{ fontWeight: 600, color: T.text }}>{fmtK(totalPurchasesYTD)}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0 0", fontSize: 12, fontWeight: 700 }}><span style={{ color: T.red }}>Total Out</span><span style={{ color: T.red }}>{fmtK(pmtsMade + totalPurchasesYTD)}</span></div>
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.accent, marginBottom: 6 }}>NET FLOW</div>
              {(() => {
                const netFlow = (totalDepositsYTD + pmtsReceived) - (pmtsMade + totalPurchasesYTD);
                return (
                  <>
                    <div style={{ fontSize: 24, fontWeight: 900, color: netFlow >= 0 ? T.green : T.red, marginTop: 8 }}>{fmtK(netFlow)}</div>
                    <div style={{ fontSize: 10, color: T.text3, marginTop: 4 }}>{netFlow >= 0 ? "Net cash positive" : "Net cash negative"} YTD</div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DASHBOARD VIEW (original spend management)
// ═══════════════════════════════════════════════════════════════════════════════
function DashboardView({ requests, members, isMobile, departments, glCategories, glCodes, activeBudget, activeBudgetName, getDeptSpend, pending, approved, onNavigate }) {
  const totalApproved = approved.reduce((s, r) => s + r.amount, 0);
  const totalPending = pending.reduce((s, r) => s + r.amount, 0);

  const deptStats = departments.filter(d => !d.parent_id).map(d => {
    const { approved: spent, pending: pend } = getDeptSpend(d.name);
    const budget = activeBudget ? (activeBudget.find(b => b.allocations?.find(a => a.department === d.name))?.allocations?.find(a => a.department === d.name)?.amount || 0) : 0;
    return { ...d, spent, pending: pend, budget, utilPct: pct(spent, budget || 1) };
  });

  const byGL = glCodes.map(gl => ({
    ...gl, total: approved.filter(r => r.gl_code === gl.code).reduce((s, r) => s + annualiseAmount(r), 0),
  })).filter(g => g.total > 0).sort((a, b) => b.total - a.total);
  const maxGL = byGL[0]?.total || 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div>
        <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>Finance Dashboard</div>
        <div style={{ fontSize: 12, color: T.text3 }}>Spend approval overview{activeBudgetName ? ` · Budget: ${activeBudgetName}` : ""}</div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12 }}>
        {[
          { label: "Pending", value: pending.length, sub: fmt(totalPending), color: "#FFC107" },
          { label: "Approved", value: approved.length, sub: fmt(totalApproved), color: "#10B981" },
          { label: "Team", value: members.length, sub: "members", color: "#3B82F6" },
          { label: "Departments", value: departments.filter(d => !d.parent_id).length, sub: `${departments.filter(d => d.parent_id).length} sub-depts`, color: "#8B5CF6" },
        ].map(s => (
          <Card key={s.label}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>{s.label}</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: T.text }}>{s.value}</div>
            <div style={{ fontSize: 11, color: T.text3 }}>{s.sub}</div>
            <div style={{ position: "absolute", top: 14, right: 14, width: 8, height: 8, borderRadius: "50%", background: s.color }} />
          </Card>
        ))}
      </div>

      {/* Department Spend */}
      <Card>
        <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 14 }}>Department Spend vs Budget</div>
        {deptStats.length === 0 ? <div style={{ color: T.text3, fontSize: 12 }}>No departments set up yet</div> :
          deptStats.map(d => (
            <div key={d.id} style={{ marginBottom: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: d.color || T.accent }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{d.name}</span>
                  {d.budget > 0 && d.spent > d.budget && <span style={{ fontSize: 10, fontWeight: 700, color: "#991B1B", background: "#FEE2E2", padding: "1px 6px", borderRadius: 8 }}>Over</span>}
                </div>
                <span style={{ fontSize: 12, color: T.text3 }}>{fmt(d.spent)} / {d.budget > 0 ? fmt(d.budget) : "no budget"}</span>
              </div>
              {d.budget > 0 && <ProgressBar value={d.spent} max={d.budget} color={d.color || T.accent} />}
            </div>
          ))
        }
      </Card>

      {/* GL Spend + Recent Requests */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
        <Card>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 14 }}>Spend by GL Category</div>
          {byGL.length === 0 ? <div style={{ fontSize: 12, color: T.text3 }}>No approved spend yet</div> :
            byGL.slice(0, 8).map(gl => (
              <div key={gl.code} style={{ marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                  <span style={{ fontSize: 12, color: T.text2 }}>{gl.name}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{fmt(gl.total)}</span>
                </div>
                <ProgressBar value={gl.total} max={maxGL} height={4} />
              </div>
            ))
          }
        </Card>

        <Card>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 14 }}>Recent Requests</div>
          {requests.slice(0, 6).map(req => (
            <div key={req.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${T.border}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{req.title}</div>
                <div style={{ fontSize: 10, color: T.text3 }}>{req.department} · {req.date}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>{fmt(req.amount)}</span>
                <Badge status={req.status} />
              </div>
            </div>
          ))}
          {requests.length > 6 && <button onClick={() => onNavigate("requests")} style={{ marginTop: 8, fontSize: 11, color: T.accent, background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>View all →</button>}
        </Card>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// REQUESTS VIEW — Full approval workflow
// ═══════════════════════════════════════════════════════════════════════════════
function RequestsView({ requests, isMobile, addRequest, updateRequest, deleteRequest, members, departments, glCodes, glCategories, rules, activeBudget, myMembership, mySpendLimit, isAdmin, isApprover, user, profile, addAuditEntry, getDeptSpend }) {
  const [showNew, setShowNew] = useState(false);
  const [filter, setFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [rejectNote, setRejectNote] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [conditionalNote, setConditionalNote] = useState("");
  const [showConditional, setShowConditional] = useState(false);
  const [showResubmit, setShowResubmit] = useState(false);
  const [resubEdits, setResubEdits] = useState({});
  const [showRemoval, setShowRemoval] = useState(false);
  const [removalReason, setRemovalReason] = useState("");

  const FORM_INIT = { title: "", amount: "", gl_code: "", description: "", cost_type: "one_time", recurring_frequency: "monthly", recurring_amount: "", first_amount: "", recurring_end_date: "", department: "", budget_accounted_for: "", quotes_obtained: "" };
  const [form, setForm] = useState(FORM_INIT);
  const [editMode, setEditMode] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [formAttachments, setFormAttachments] = useState([]);

  const uploadFile = async (file) => {
    if (!file || file.size > 10 * 1024 * 1024) { alert("File too large (max 10MB)"); return; }
    setUploadingFile(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `spend-requests/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from("attachments").upload(path, file);
      if (error) { alert("Upload failed: " + error.message); return; }
      const { data: { publicUrl } } = supabase.storage.from("attachments").getPublicUrl(path);
      setFormAttachments(prev => [...prev, { name: file.name, url: publicUrl, type: file.type, size: file.size }]);
    } finally { setUploadingFile(false); }
  };

  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) uploadFile(file);
        break;
      }
    }
  };

  // User-scoped filtering: requestors see own, approvers see own + assigned, admins see all
  const myRequests = requests.filter(r => {
    if (isAdmin) return true;
    if (r.requester_id === user?.id) return true; // my own requests
    if (isApprover && r.require_person_id === user?.id) return true; // assigned to me for approval
    if (isApprover && r.status === "pending") return true; // pending items visible to approvers
    return false;
  });
  const filtered = myRequests.filter(r => filter === "all" || r.status === filter);
  const selReq = requests.find(r => r.id === selected);
  const isMyRequest = selReq?.requester_id === user?.id;
  const canEditRequest = isMyRequest && (selReq?.status === "pending" || selReq?.status === "resubmit");

  const evaluateRules = (req) => {
    const hits = [];
    for (const rule of rules) {
      if (!rule.is_active) continue;
      const conds = rule.conditions || [];
      let result = null;
      for (let i = 0; i < conds.length; i++) {
        const c = conds[i];
        let pass = false;
        if (c.field === "amount") {
          const a = parseFloat(req.amount);
          if (c.operator === ">") pass = a > parseFloat(c.value);
          if (c.operator === "<") pass = a < parseFloat(c.value);
          if (c.operator === "==") pass = a === parseFloat(c.value);
          if (c.operator === ">=") pass = a >= parseFloat(c.value);
        }
        if (c.field === "gl") pass = req.gl_code === c.value;
        if (c.field === "department") pass = req.department === c.value;
        if (result === null) result = pass;
        else if (conds[i - 1]?.join === "AND") result = result && pass;
        else if (conds[i - 1]?.join === "OR") result = result || pass;
      }
      if (result) hits.push(rule);
    }
    return hits;
  };

  const submitRequest = async () => {
    if (!form.title || !form.amount) return;
    const amt = parseFloat(form.amount);
    const glEntry = glCodes.find(g => g.code === form.gl_code);
    const candidateReq = { amount: amt, gl_code: form.gl_code, department: form.department };
    const ruleHits = evaluateRules(candidateReq);
    const matchedRule = ruleHits[0] || null;

    let chain = amt > 10000 ? "high_value" : "standard";
    let requirePersonId = null, requirePersonName = null;
    if (matchedRule?.action === "require_cfo") chain = "high_value";
    if (matchedRule?.action === "require_person" && matchedRule.require_person_id) {
      requirePersonId = matchedRule.require_person_id;
      requirePersonName = matchedRule.require_person_name || null;
      chain = "person_" + requirePersonId;
    }
    if (matchedRule?.action === "block") { alert(`Blocked by rule: "${matchedRule.name}"`); return; }

    const ruleRequiresApproval = matchedRule && matchedRule.action !== "auto_approve";
    const isAuto = !ruleRequiresApproval && amt <= mySpendLimit;

    if (editMode && editMode !== true) {
      // Editing existing request — update it and reset to pending
      const patch = {
        title: form.title, amount: amt, gl_code: form.gl_code,
        budget_category_id: glEntry?.budget_category_id || null,
        department: form.department, description: form.description,
        cost_type: form.cost_type,
        recurring_frequency: form.cost_type === "recurring" ? form.recurring_frequency : null,
        recurring_amount: form.cost_type === "recurring" ? parseFloat(form.recurring_amount || form.amount) : null,
        budget_accounted_for: form.budget_accounted_for || null,
        quotes_obtained: form.quotes_obtained || null,
        attachments: formAttachments.length > 0 ? formAttachments : null,
        status: "pending", approval_step: 0, // reset approval
        updated_at: new Date().toISOString(),
      };
      await updateRequest(editMode, patch);
      addAuditEntry("Request updated", `"${form.title}" edited and resubmitted`, editMode);
    } else {
      const req = {
        requester_id: user.id, title: form.title, amount: amt,
        gl_code: form.gl_code, budget_category_id: glEntry?.budget_category_id || null,
        department: form.department, description: form.description,
        cost_type: form.cost_type,
        recurring_frequency: form.cost_type === "recurring" ? form.recurring_frequency : null,
        recurring_amount: form.cost_type === "recurring" ? parseFloat(form.recurring_amount || form.amount) : null,
        first_amount: form.cost_type === "recurring" && form.first_amount ? parseFloat(form.first_amount) : null,
        recurring_end_date: form.cost_type === "recurring" && form.recurring_end_date ? form.recurring_end_date : null,
        status: isAuto ? "approved" : "pending",
        approval_step: isAuto ? 2 : 0,
        approval_chain: chain,
        matched_rule_id: matchedRule?.id || null,
        matched_rule_name: matchedRule?.name || null,
        require_person_id: requirePersonId,
        require_person_name: requirePersonName,
        budget_accounted_for: form.budget_accounted_for || null,
        quotes_obtained: form.quotes_obtained || null,
        attachments: formAttachments.length > 0 ? formAttachments : null,
        date: new Date().toISOString().slice(0, 10),
      };
      const data = await addRequest(req);
      addAuditEntry("Request submitted", `"${form.title}" for ${fmt(amt)}${matchedRule ? ` — rule: ${matchedRule.name}` : ""}`, data?.id);
    }
    setForm(FORM_INIT);
    setFormAttachments([]);
    setShowNew(false);
    setEditMode(false);
  };

  const doApprove = async () => {
    if (!selReq) return;
    const isPersonChain = (selReq.approval_chain || "").startsWith("person_");
    const chain = isPersonChain ? [{ role: "Approver" }] : (APPROVAL_CHAINS[selReq.approval_chain] || APPROVAL_CHAINS.standard);
    const newStep = selReq.approval_step + 1;
    const done = isPersonChain || newStep >= chain.length;
    const patch = {
      approval_step: newStep,
      status: done ? "approved" : "pending",
      approvals: [...(selReq.approvals || []), { step: selReq.approval_step, by: user.id, at: new Date().toISOString().slice(0, 10) }],
    };
    await updateRequest(selReq.id, patch);
    addAuditEntry(done ? "Request approved" : `Approval step ${newStep} completed`, `"${selReq.title}" ${done ? "fully approved" : "step approved"}`, selReq.id);
    setSelected(null);
  };

  const doReject = async () => {
    if (!selReq) return;
    await updateRequest(selReq.id, { status: "rejected", rejection_note: rejectNote, rejected_by: user.id, rejected_at: new Date().toISOString().slice(0, 10) });
    addAuditEntry("Request rejected", `"${selReq.title}" — ${rejectNote || "no reason"}`, selReq.id);
    setRejectNote(""); setShowReject(false); setSelected(null);
  };

  const doConditional = async () => {
    if (!selReq) return;
    await updateRequest(selReq.id, { status: "conditionally_approved", conditional_note: conditionalNote, conditional_by: user.id, conditional_at: new Date().toISOString().slice(0, 10) });
    addAuditEntry("Additional info required", `"${selReq.title}" — ${conditionalNote}`, selReq.id);
    setConditionalNote(""); setShowConditional(false); setSelected(null);
  };

  const doResubmit = async () => {
    if (!selReq || !resubEdits.added_info?.trim()) return;
    const patch = { status: "conditionally_approved_info_added", added_info: resubEdits.added_info, resubmitted_at: new Date().toISOString().slice(0, 10), title: resubEdits.title || selReq.title, amount: resubEdits.amount ? parseFloat(resubEdits.amount) : selReq.amount, gl_code: resubEdits.gl_code || selReq.gl_code, description: resubEdits.description ?? selReq.description, department: resubEdits.department || selReq.department };
    await updateRequest(selReq.id, patch);
    addAuditEntry("Info added — resubmitted", `"${selReq.title}"`, selReq.id);
    setShowResubmit(false); setResubEdits({}); setSelected(null);
  };

  const doReinstate = async () => {
    if (!selReq) return;
    await updateRequest(selReq.id, { status: "pending", approval_step: 0, rejection_note: null, rejected_by: null, rejected_at: null });
    addAuditEntry("Reinstated to pending", `"${selReq.title}"`, selReq.id);
    setSelected(null);
  };

  const doRequestRemoval = async () => {
    if (!selReq) return;
    await updateRequest(selReq.id, { status: "removal_requested", removal_reason: removalReason, removal_requested_by: user.id, removal_requested_at: new Date().toISOString().slice(0, 10) });
    addAuditEntry("Removal requested", `"${selReq.title}" — ${removalReason || "no reason"}`, selReq.id);
    setRemovalReason(""); setShowRemoval(false); setSelected(null);
  };

  const doApproveRemoval = async () => {
    if (!selReq) return;
    await updateRequest(selReq.id, { status: "removed", removed_by: user.id, removed_at: new Date().toISOString().slice(0, 10) });
    addAuditEntry("Removal approved", `"${selReq.title}" removed — budget reversed`, selReq.id);
    setSelected(null);
  };

  const doDenyRemoval = async () => {
    if (!selReq) return;
    await updateRequest(selReq.id, { status: "approved", removal_reason: null, removal_requested_by: null, removal_requested_at: null });
    addAuditEntry("Removal denied", `"${selReq.title}" stays approved`, selReq.id);
    setSelected(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>Spend Requests</div>
          <div style={{ fontSize: 12, color: T.text3 }}>{filtered.length} requests</div>
        </div>
        <button onClick={() => setShowNew(true)} style={{ padding: "8px 16px", fontSize: 12, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>+ New Request</button>
      </div>

      {/* Status filters */}
      <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
        {["all", "pending", "approved", "conditionally_approved", "rejected", "removed"].map(s => (
          <button key={s} onClick={() => setFilter(s)}
            style={{ padding: "5px 12px", borderRadius: 16, border: `1px solid ${filter === s ? T.accent : T.border}`, background: filter === s ? T.accentDim : "transparent", color: filter === s ? T.accent : T.text3, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
            {s === "all" ? "All" : STATUS_LABELS[s] || s}
          </button>
        ))}
      </div>

      {/* Request list */}
      {filtered.length === 0 ? <div style={{ textAlign: "center", padding: 32, color: T.text3, fontSize: 13 }}>No requests match these filters</div> :
        filtered.map(req => {
          const gl = glCodes.find(g => g.code === req.gl_code);
          const freqShort = { monthly: "mo", quarterly: "qtr", weekly: "wk", annually: "yr" }[req.recurring_frequency] || "";
          return (
            <Card key={req.id} onClick={() => setSelected(req.id)} style={{ padding: "14px 16px", cursor: "pointer" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{req.title}</span>
                    {req.matched_rule_name && <span style={{ fontSize: 10, background: "#FEF3C7", color: "#92400E", padding: "1px 6px", borderRadius: 8, fontWeight: 600 }}>⚡ Rule</span>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: T.text3, flexWrap: "wrap" }}>
                    <span>{req.department}</span>
                    {gl && <span>· {gl.name}</span>}
                    <span>· {req.date}</span>
                    {req.cost_type === "recurring" && <span style={{ fontSize: 10, fontWeight: 700, background: "#EDE9FE", color: "#5B21B6", padding: "1px 6px", borderRadius: 8 }}>↻ {req.recurring_frequency}</span>}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>
                    {fmt(req.amount)}{req.cost_type === "recurring" && freqShort && <span style={{ fontSize: 10, color: T.text3, fontWeight: 500 }}>/{freqShort}</span>}
                  </div>
                  <Badge status={req.status} />
                </div>
              </div>
              {req.status === "pending" && (
                <div style={{ marginTop: 8, paddingTop: 8, borderTop: `1px solid ${T.border}` }}>
                  <ApprovalChain req={req} members={members} />
                </div>
              )}
            </Card>
          );
        })
      }

      {/* New Request Modal */}
      {showNew && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => { setShowNew(false); setEditMode(false); }}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: 16, width: "min(560px, 95vw)", maxHeight: "85vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)", padding: isMobile ? 14 : 24 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 16 }}>{editMode ? "Edit Spend Request" : "New Spend Request"}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Title *</div>
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="e.g. Software subscription renewal"
                  style={{ width: "100%", padding: "8px 12px", fontSize: 13, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, outline: "none", boxSizing: "border-box" }} />
              </div>

              {/* Cost type toggle */}
              <div style={{ display: "flex", gap: 0, border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden" }}>
                {[["one_time", "1× One-time"], ["recurring", "↻ Recurring"]].map(([v, l]) => (
                  <button key={v} onClick={() => setForm(f => ({ ...f, cost_type: v }))}
                    style={{ flex: 1, padding: "9px 0", border: "none", cursor: "pointer", fontSize: 13, fontWeight: 700, background: form.cost_type === v ? T.accent : "transparent", color: form.cost_type === v ? "#fff" : T.text3 }}>{l}</button>
                ))}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                <div>
                  <div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Amount (USD) *</div>
                  <input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00"
                    style={{ width: "100%", padding: "8px 12px", fontSize: 13, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, outline: "none", boxSizing: "border-box" }} />
                </div>
                <div>
                  <div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>GL Code</div>
                  <select value={form.gl_code} onChange={e => setForm(f => ({ ...f, gl_code: e.target.value }))}
                    style={{ width: "100%", padding: "8px 12px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, cursor: "pointer", boxSizing: "border-box" }}>
                    <option value="">Select GL code…</option>
                    {glCodes.map(g => <option key={g.code} value={g.code}>{g.code} · {g.name}</option>)}
                  </select>
                </div>
              </div>

              {form.cost_type === "recurring" && (
                <div style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 10, padding: 14 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.accent, textTransform: "uppercase", marginBottom: 10 }}>↻ Recurring Schedule</div>
                  <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Frequency</div>
                      <select value={form.recurring_frequency} onChange={e => setForm(f => ({ ...f, recurring_frequency: e.target.value }))}
                        style={{ width: "100%", padding: "6px 10px", fontSize: 12, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, boxSizing: "border-box" }}>
                        {["weekly", "monthly", "quarterly", "annually"].map(f => <option key={f} value={f}>{f.charAt(0).toUpperCase() + f.slice(1)}</option>)}
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>First Payment (if different)</div>
                      <input type="number" value={form.first_amount} onChange={e => setForm(f => ({ ...f, first_amount: e.target.value }))} placeholder="Same as amount"
                        style={{ width: "100%", padding: "6px 10px", fontSize: 12, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, outline: "none", boxSizing: "border-box" }} />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Department</div>
                <select value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}
                  style={{ width: "100%", padding: "8px 12px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, cursor: "pointer", boxSizing: "border-box" }}>
                  <option value="">Select department…</option>
                  {departments.filter(d => !d.parent_id).map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                </select>
              </div>

              <div>
                <div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Description</div>
                <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={3} placeholder="Context for the approver…"
                  style={{ width: "100%", padding: "8px 12px", fontSize: 13, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, outline: "none", resize: "vertical", boxSizing: "border-box" }} />
              </div>

              {/* Budget Accountability */}
              <div style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.text, marginBottom: 8 }}>📋 Budget Accountability</div>
                <div style={{ fontSize: 10, color: T.text3, marginBottom: 8 }}>Is this spend already reflected in your approved budget?</div>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 6 }}>
                  {[["yes_exact","✓ Yes, at this cost"],["yes_lower","↑ Higher than budgeted"],["yes_higher","↓ Lower than budgeted"],["no","✗ Not in budget"],["unsure","? Unsure"]].map(([v,l]) => (
                    <button key={v} type="button" onClick={() => setForm(f => ({ ...f, budget_accounted_for: v }))}
                      style={{ padding: "8px 10px", borderRadius: 8, border: `2px solid ${form.budget_accounted_for === v ? T.accent : T.border}`, background: form.budget_accounted_for === v ? T.accent + "15" : "transparent", color: form.budget_accounted_for === v ? T.accent : T.text3, fontSize: 11, fontWeight: 600, cursor: "pointer", textAlign: "left" }}>{l}</button>
                  ))}
                </div>
              </div>

              {/* Alternative Quotes */}
              <div style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.text, marginBottom: 8 }}>📊 Alternative Quotes</div>
                <div style={{ display: "flex", gap: 6 }}>
                  {[["yes","Yes, I have quotes"],["no","No / N/A"]].map(([v,l]) => (
                    <button key={v} type="button" onClick={() => setForm(f => ({ ...f, quotes_obtained: v }))}
                      style={{ flex: 1, padding: "8px", borderRadius: 8, border: `2px solid ${form.quotes_obtained === v ? T.accent : T.border}`, background: form.quotes_obtained === v ? T.accent + "15" : "transparent", color: form.quotes_obtained === v ? T.accent : T.text3, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>{l}</button>
                  ))}
                </div>
              </div>

              {/* Attachments */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.text3, marginBottom: 6 }}>📎 Attachments</div>
                <div onPaste={handlePaste} tabIndex={0}
                  onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = T.accent; }}
                  onDragLeave={e => { e.currentTarget.style.borderColor = T.border; }}
                  onDrop={e => { e.preventDefault(); e.currentTarget.style.borderColor = T.border; const f = e.dataTransfer.files[0]; if (f) uploadFile(f); }}
                  style={{ border: `2px dashed ${T.border}`, borderRadius: 8, padding: 12, textAlign: "center", cursor: "pointer", outline: "none", transition: "border-color 0.15s" }}
                  onClick={() => document.getElementById("req-file-input")?.click()}>
                  <input id="req-file-input" type="file" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt" style={{ display: "none" }}
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f); e.target.value = ""; }} />
                  {uploadingFile ? <div style={{ fontSize: 11, color: T.accent }}>Uploading…</div> : (
                    <div style={{ fontSize: 11, color: T.text3 }}>Drop file, paste screenshot, or click to upload</div>
                  )}
                </div>
                {formAttachments.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                    {formAttachments.map((a, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", background: T.surface2, borderRadius: 6, fontSize: 11 }}>
                        {a.type?.startsWith("image/") ? <img src={a.url} alt="" style={{ width: 28, height: 28, objectFit: "cover", borderRadius: 4 }} /> : <span>📄</span>}
                        <span style={{ color: T.text2, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</span>
                        <button onClick={(e) => { e.stopPropagation(); setFormAttachments(prev => prev.filter((_, j) => j !== i)); }} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 12, padding: 0 }}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Routing preview */}
              {form.amount && (() => {
                const amt = parseFloat(form.amount);
                const ruleHits = evaluateRules({ amount: amt, gl_code: form.gl_code, department: form.department });
                const hit = ruleHits[0];
                const isAuto = !hit && amt <= mySpendLimit;
                const msg = hit?.action === "block" ? `⛔ Rule "${hit.name}" will block this`
                  : hit ? `⚡ Rule: "${hit.name}" — ${hit.action.replace(/_/g, " ")}`
                  : isAuto ? `✓ Within your limit (${fmt(mySpendLimit)}) — auto-approved`
                  : `⚠ Requires ${amt > 10000 ? "high-value chain (3-step)" : "standard chain (2-step)"}`;
                const bg = hit?.action === "block" ? "#FEE2E220" : isAuto ? "#D1FAE520" : "#FEF3C720";
                return <div style={{ padding: "10px 14px", borderRadius: 8, background: bg, fontSize: 12, fontWeight: 600, color: T.text2 }}>{msg}</div>;
              })()}

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => { setShowNew(false); setForm(FORM_INIT); setEditMode(false); }} style={{ padding: "8px 16px", fontSize: 12, fontWeight: 600, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text3, cursor: "pointer" }}>Cancel</button>
                <button onClick={submitRequest} disabled={!form.title || !form.amount} style={{ padding: "8px 16px", fontSize: 12, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", opacity: !form.title || !form.amount ? 0.5 : 1 }}>{editMode ? "Update Request" : "Submit Request"}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Request Detail Modal */}
      {selReq && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => { setSelected(null); setShowReject(false); setShowConditional(false); setShowResubmit(false); setShowRemoval(false); setResubEdits({}); setRemovalReason(""); }}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: 16, width: "min(600px, 95vw)", maxHeight: "85vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)", padding: isMobile ? 14 : 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>{selReq.title}</div>
                <div style={{ fontSize: 12, color: T.text3, marginTop: 4 }}>{selReq.department} · {selReq.date}</div>
              </div>
              <Badge status={selReq.status} />
            </div>

            {/* Approval chain */}
            <div style={{ background: T.surface2, borderRadius: 10, padding: 16, marginBottom: 16 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", marginBottom: 10 }}>Approval Chain</div>
              <ApprovalChain req={selReq} members={members} />
            </div>

            {/* Details grid */}
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr", gap: 8, marginBottom: 12 }}>
              {[
                { l: "Amount", v: fmt(selReq.amount) },
                { l: "GL", v: glCodes.find(g => g.code === selReq.gl_code)?.name || selReq.gl_code || "—" },
                { l: "Type", v: selReq.cost_type === "recurring" ? `↻ ${selReq.recurring_frequency}` : "One-time" },
              ].map(f => (
                <div key={f.l} style={{ background: T.surface2, borderRadius: 8, padding: "10px 12px" }}>
                  <div style={{ fontSize: 10, color: T.text3, fontWeight: 600, textTransform: "uppercase" }}>{f.l}</div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginTop: 3 }}>{f.v}</div>
                </div>
              ))}
            </div>

            {selReq.description && <div style={{ fontSize: 13, color: T.text2, lineHeight: 1.6, marginBottom: 16 }}>{selReq.description}</div>}

            {/* Budget accountability display */}
            {selReq.budget_accounted_for && (
              <div style={{ background: T.surface2, borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", marginBottom: 4 }}>📋 Budget Accountability</div>
                <div style={{ fontSize: 12, color: T.text }}>{{ yes_exact: "✅ Yes, budgeted at this cost", yes_lower: "⚠️ Yes, but higher than budgeted", yes_higher: "✅ Yes, lower than budgeted", no: "❌ Not in current budget", unsure: "❓ Unsure" }[selReq.budget_accounted_for] || selReq.budget_accounted_for}</div>
              </div>
            )}

            {/* Quotes display */}
            {selReq.quotes_obtained && (
              <div style={{ background: T.surface2, borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", marginBottom: 4 }}>📊 Alternative Quotes</div>
                <div style={{ fontSize: 12, color: T.text }}>{selReq.quotes_obtained === "yes" ? `✅ ${(selReq.quotes || []).length} quote(s) obtained` : "❌ No quotes obtained"}</div>
                {(selReq.quotes || []).map((q, i) => (
                  <div key={i} style={{ marginTop: 6, padding: "6px 8px", background: T.surface, borderRadius: 6, fontSize: 11, display: "flex", justifyContent: "space-between" }}>
                    <span><strong>{q.supplier || "Vendor"}</strong>{q.notes ? ` — ${q.notes}` : ""}</span>
                    <span style={{ fontWeight: 700 }}>{q.amount ? fmt(parseFloat(q.amount)) : "—"}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Trade-offs display */}
            {(selReq.trade_offs || []).length > 0 && (
              <div style={{ background: "#F0FDF420", border: "1px solid #BBF7D0", borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#065F46", textTransform: "uppercase", marginBottom: 4 }}>✅ Budget Trade-Off</div>
                {selReq.trade_offs.map((t, i) => (
                  <div key={i} style={{ fontSize: 12, color: T.text }}>Take <strong>{fmt(parseFloat(t.amount))}</strong> from <strong>{t.fromBudgetCategoryId}</strong></div>
                ))}
              </div>
            )}

            {/* Attachments display */}
            {(selReq.attachments || []).length > 0 && (
              <div style={{ background: T.surface2, borderRadius: 8, padding: "10px 14px", marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", marginBottom: 8 }}>📎 Attachments ({selReq.attachments.length})</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {selReq.attachments.map((a, i) => (
                    <a key={i} href={a.url} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: 6, borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface, cursor: "pointer", maxWidth: 120 }}
                      onMouseEnter={e => e.currentTarget.style.borderColor = T.accent}
                      onMouseLeave={e => e.currentTarget.style.borderColor = T.border}>
                      {a.type?.startsWith("image/") ? (
                        <img src={a.url} alt={a.name} style={{ width: 80, height: 60, objectFit: "cover", borderRadius: 4 }} />
                      ) : (
                        <div style={{ width: 80, height: 60, display: "flex", alignItems: "center", justifyContent: "center", background: T.surface2, borderRadius: 4, fontSize: 24 }}>📄</div>
                      )}
                      <span style={{ fontSize: 10, color: T.text2, textAlign: "center", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", width: "100%" }}>{a.name}</span>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* Conditional note display */}
            {selReq.conditional_note && (
              <div style={{ background: "#FEF3C720", border: `1px solid #FDE68A`, borderLeft: "4px solid #F59E0B", borderRadius: 8, padding: "12px 16px", marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#92400E", textTransform: "uppercase", marginBottom: 4 }}>Info Required</div>
                <div style={{ fontSize: 13, color: T.text }}>{selReq.conditional_note}</div>
                {selReq.added_info && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid #FDE68A" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: T.accent, textTransform: "uppercase", marginBottom: 4 }}>Response</div>
                    <div style={{ fontSize: 13, color: T.text }}>{selReq.added_info}</div>
                  </div>
                )}
              </div>
            )}

            {/* Rejection note */}
            {selReq.rejection_note && (
              <div style={{ background: "#FEE2E220", border: "1px solid #FECACA", borderLeft: "4px solid #EF4444", borderRadius: 8, padding: "12px 16px", marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#991B1B", textTransform: "uppercase", marginBottom: 4 }}>Rejection Reason</div>
                <div style={{ fontSize: 13, color: T.text }}>{selReq.rejection_note}</div>
              </div>
            )}

            {/* Approver actions — only show if you're NOT the requester */}
            {isApprover && !isMyRequest && (selReq.status === "pending" || selReq.status === "conditionally_approved_info_added") && (
              <div style={{ paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
                {!showReject && !showConditional ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button onClick={doApprove} style={{ padding: "8px 16px", fontSize: 12, fontWeight: 700, background: "#10B981", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>✓ Approve</button>
                    <button onClick={() => setShowConditional(true)} style={{ padding: "8px 16px", fontSize: 12, fontWeight: 700, background: "#F59E0B", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>⚠ Request Info</button>
                    <button onClick={() => setShowReject(true)} style={{ padding: "8px 16px", fontSize: 12, fontWeight: 700, background: "#EF4444", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>✗ Reject</button>
                  </div>
                ) : showConditional ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, background: T.surface2, borderRadius: 10, padding: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#92400E" }}>What info is needed?</div>
                    <textarea value={conditionalNote} onChange={e => setConditionalNote(e.target.value)} rows={3} placeholder="e.g. Please provide 3 vendor quotes…"
                      style={{ width: "100%", padding: "8px 10px", border: `1px solid ${T.border}`, borderRadius: 8, fontSize: 12, color: T.text, outline: "none", resize: "vertical", boxSizing: "border-box", background: T.surface }} />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={doConditional} style={{ padding: "7px 14px", fontSize: 12, fontWeight: 700, background: "#F59E0B", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>Send</button>
                      <button onClick={() => { setShowConditional(false); setConditionalNote(""); }} style={{ padding: "7px 14px", fontSize: 12, fontWeight: 600, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text3, cursor: "pointer" }}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10, background: "#FEE2E220", borderRadius: 10, padding: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#991B1B" }}>Rejection reason</div>
                    <textarea value={rejectNote} onChange={e => setRejectNote(e.target.value)} rows={3} placeholder="e.g. Budget exceeded for Q2…"
                      style={{ width: "100%", padding: "8px 10px", border: "1px solid #FECACA", borderRadius: 8, fontSize: 12, color: T.text, outline: "none", resize: "vertical", boxSizing: "border-box", background: T.surface }} />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={doReject} style={{ padding: "7px 14px", fontSize: 12, fontWeight: 700, background: "#EF4444", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>Confirm Reject</button>
                      <button onClick={() => { setShowReject(false); setRejectNote(""); }} style={{ padding: "7px 14px", fontSize: 12, fontWeight: 600, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text3, cursor: "pointer" }}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Requester: resubmit when info was requested */}
            {selReq.requester_id === user?.id && selReq.status === "conditionally_approved" && !selReq.added_info && (
              <div style={{ paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
                {!showResubmit ? (
                  <button onClick={() => { setShowResubmit(true); setResubEdits({ title: selReq.title, amount: String(selReq.amount), gl_code: selReq.gl_code, description: selReq.description || "", department: selReq.department || "", added_info: "" }); }}
                    style={{ padding: "8px 16px", fontSize: 12, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>✏️ Edit & Resubmit</button>
                ) : (
                  <div style={{ background: T.surface2, borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.accent }}>✏️ Edit & Resubmit</div>
                    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8 }}>
                      <div><div style={{ fontSize: 10, color: T.text3, marginBottom: 2 }}>Title</div><input value={resubEdits.title || ""} onChange={e => setResubEdits(p => ({ ...p, title: e.target.value }))} style={{ width: "100%", padding: "6px 8px", fontSize: 12, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, outline: "none", boxSizing: "border-box" }} /></div>
                      <div><div style={{ fontSize: 10, color: T.text3, marginBottom: 2 }}>Amount</div><input type="number" value={resubEdits.amount || ""} onChange={e => setResubEdits(p => ({ ...p, amount: e.target.value }))} style={{ width: "100%", padding: "6px 8px", fontSize: 12, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, outline: "none", boxSizing: "border-box" }} /></div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 8 }}>
                      <div><div style={{ fontSize: 10, color: T.text3, marginBottom: 2 }}>GL Code</div><select value={resubEdits.gl_code || ""} onChange={e => setResubEdits(p => ({ ...p, gl_code: e.target.value }))} style={{ width: "100%", padding: "6px 8px", fontSize: 11, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, boxSizing: "border-box" }}><option value="">Select…</option>{glCodes.map(g => <option key={g.code} value={g.code}>{g.code} · {g.name}</option>)}</select></div>
                      <div><div style={{ fontSize: 10, color: T.text3, marginBottom: 2 }}>Department</div><select value={resubEdits.department || ""} onChange={e => setResubEdits(p => ({ ...p, department: e.target.value }))} style={{ width: "100%", padding: "6px 8px", fontSize: 11, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, boxSizing: "border-box" }}><option value="">Select…</option>{departments.filter(d => !d.parent_id).map(d => <option key={d.id} value={d.name}>{d.name}</option>)}</select></div>
                    </div>
                    <div><div style={{ fontSize: 10, color: T.text3, marginBottom: 2 }}>Description</div><textarea value={resubEdits.description || ""} onChange={e => setResubEdits(p => ({ ...p, description: e.target.value }))} rows={2} style={{ width: "100%", padding: "6px 8px", fontSize: 12, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, outline: "none", resize: "vertical", boxSizing: "border-box" }} /></div>
                    <div><div style={{ fontSize: 10, fontWeight: 700, color: T.accent, marginBottom: 2 }}>Note to approver — what changed? *</div><textarea value={resubEdits.added_info || ""} onChange={e => setResubEdits(p => ({ ...p, added_info: e.target.value }))} rows={3} placeholder="Explain what you updated…" style={{ width: "100%", padding: "6px 8px", border: `1px solid ${resubEdits.added_info?.trim() ? T.accent : "#FECACA"}`, borderRadius: 6, fontSize: 12, color: T.text, outline: "none", resize: "vertical", boxSizing: "border-box", background: T.surface }} /></div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={doResubmit} disabled={!resubEdits.added_info?.trim()} style={{ padding: "7px 14px", fontSize: 12, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", opacity: !resubEdits.added_info?.trim() ? 0.5 : 1 }}>↑ Resubmit</button>
                      <button onClick={() => { setShowResubmit(false); setResubEdits({}); }} style={{ padding: "7px 14px", fontSize: 12, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text3, cursor: "pointer" }}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Approver: reinstate rejected request */}
            {isApprover && selReq.status === "rejected" && (
              <div style={{ paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
                <button onClick={doReinstate} style={{ padding: "8px 16px", fontSize: 12, fontWeight: 600, background: "#F59E0B20", border: "1px solid #F59E0B40", borderRadius: 8, color: "#92400E", cursor: "pointer" }}>↩ Reinstate to Pending</button>
              </div>
            )}

            {/* Requester: request removal of approved item */}
            {selReq.requester_id === user?.id && selReq.status === "approved" && (
              <div style={{ paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
                {!showRemoval ? (
                  <button onClick={() => setShowRemoval(true)} style={{ padding: "8px 16px", fontSize: 12, fontWeight: 600, background: "#FDF2F820", border: "1px solid #FBCFE8", borderRadius: 8, color: "#9D174D", cursor: "pointer" }}>🗑 Request Removal</button>
                ) : (
                  <div style={{ background: "#FDF2F820", border: "1px solid #FBCFE8", borderRadius: 10, padding: 14, display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#9D174D" }}>🗑 Request Removal</div>
                    <div style={{ fontSize: 11, color: T.text3 }}>If approved, the request will be removed and budget impact reversed.</div>
                    <textarea value={removalReason} onChange={e => setRemovalReason(e.target.value)} rows={3} placeholder="e.g. Vendor cancelled, project shelved, duplicate…"
                      style={{ width: "100%", padding: "8px 10px", border: "1px solid #FBCFE8", borderRadius: 8, fontSize: 12, color: T.text, outline: "none", resize: "vertical", boxSizing: "border-box", background: T.surface }} />
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={doRequestRemoval} style={{ padding: "7px 14px", fontSize: 12, fontWeight: 700, background: "#BE185D", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>Submit Removal</button>
                      <button onClick={() => { setShowRemoval(false); setRemovalReason(""); }} style={{ padding: "7px 14px", fontSize: 12, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text3, cursor: "pointer" }}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Removal reason display */}
            {selReq.removal_reason && selReq.status === "removal_requested" && (
              <div style={{ background: "#FDF2F820", border: "1px solid #FBCFE8", borderLeft: "4px solid #EC4899", borderRadius: 8, padding: "12px 16px", marginBottom: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#9D174D", textTransform: "uppercase", marginBottom: 4 }}>Removal Requested</div>
                <div style={{ fontSize: 13, color: T.text }}>{selReq.removal_reason}</div>
              </div>
            )}

            {/* Approver: approve or deny removal */}
            {isApprover && selReq.status === "removal_requested" && (
              <div style={{ paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 8 }}>Removal Request — Action Required</div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button onClick={doApproveRemoval} style={{ padding: "8px 16px", fontSize: 12, fontWeight: 700, background: "#BE185D", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>✓ Approve Removal</button>
                  <button onClick={doDenyRemoval} style={{ padding: "8px 16px", fontSize: 12, fontWeight: 600, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text3, cursor: "pointer" }}>✗ Deny — Keep Approved</button>
                </div>
              </div>
            )}

            {/* Removed status */}
            {selReq.status === "removed" && (
              <div style={{ background: T.surface2, borderLeft: "4px solid #94A3B8", borderRadius: 8, padding: "12px 16px" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", marginBottom: 4 }}>Removed</div>
                <div style={{ fontSize: 12, color: T.text3 }}>This request has been removed. Budget impact reversed.</div>
              </div>
            )}

            {/* Submitter actions: Edit & Withdraw */}
            {isMyRequest && (selReq.status === "pending" || selReq.status === "conditionally_approved") && (
              <div style={{ paddingTop: 12, borderTop: `1px solid ${T.border}`, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => {
                  setEditMode(selReq.id);
                  setForm({ title: selReq.title, amount: String(selReq.amount), gl_code: selReq.gl_code || "", description: selReq.description || "", cost_type: selReq.cost_type || "one_time", recurring_frequency: selReq.recurring_frequency || "monthly", recurring_amount: selReq.recurring_amount ? String(selReq.recurring_amount) : "", first_amount: selReq.first_amount ? String(selReq.first_amount) : "", recurring_end_date: selReq.recurring_end_date || "", department: selReq.department || "", budget_accounted_for: selReq.budget_accounted_for || "", quotes_obtained: selReq.quotes_obtained || "" });
                  setFormAttachments(selReq.attachments || []);
                  setSelected(null);
                  setShowNew(true);
                }} style={{ padding: "8px 16px", fontSize: 12, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>✏️ Edit Request</button>
                <button onClick={async () => {
                  if (!window.confirm("Withdraw this request? It will be marked as withdrawn.")) return;
                  await updateRequest(selReq.id, { status: "withdrawn", updated_at: new Date().toISOString() });
                  addAuditEntry("Request withdrawn", `"${selReq.title}" withdrawn by requester`, selReq.id);
                  setSelected(null);
                }} style={{ padding: "8px 16px", fontSize: 12, fontWeight: 600, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.red, cursor: "pointer" }}>↩ Withdraw</button>
                {isAdmin && selReq.status === "pending" && (
                  <button onClick={doApprove} style={{ padding: "8px 16px", fontSize: 12, fontWeight: 700, background: "#10B981", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>✓ Self-Approve</button>
                )}
              </div>
            )}

            {/* Admin delete */}
            {isAdmin && (
              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
                <button onClick={async () => { if (window.confirm(`Delete "${selReq.title}"?`)) { await deleteRequest(selReq.id); addAuditEntry("Request deleted", `"${selReq.title}" deleted`, selReq.id); setSelected(null); }}}
                  style={{ padding: "6px 12px", fontSize: 11, color: "#EF4444", background: "none", border: "1px solid #ef444440", borderRadius: 6, cursor: "pointer", fontWeight: 600 }}>🗑 Delete</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLACEHOLDER VIEWS (to be built in subsequent sessions)
// ═══════════════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════════════
// BUDGETS VIEW — G&A category budgets with department allocations
// ═══════════════════════════════════════════════════════════════════════════════
function BudgetsView({ isMobile, glCategories, requests, departments, activeBudget, setActiveBudget, activeBudgetName, setActiveBudgetName, budgetVersions, setBudgetVersions, user, modulePerms = {} }) {
  const { orgId, orgs } = useAuth();
  const [myPerms, setMyPerms] = useState(null);
  const [finBudgets, setFinBudgets] = useState([]);
  const [budgetMembers, setBudgetMembers] = useState([]);
  const [budgetLines, setBudgetLines] = useState([]);
  const [orgProfiles, setOrgProfiles] = useState([]);
  const [showNewBudget, setShowNewBudget] = useState(false);
  const [showShare, setShowShare] = useState(null);
  const [editingBudget, setEditingBudget] = useState(null); // budget object being edited
  const [editBudgetForm, setEditBudgetForm] = useState({ name: "", description: "", fiscal_year: "", status: "" });
  const [newBudgetForm, setNewBudgetForm] = useState({ name: "", description: "", fiscal_year: new Date().getFullYear(), status: "draft" });

  useEffect(() => {
    (async () => {
      if (!user?.id) { setMyPerms({}); return; }
      const [{ data: membership }, { data: budgets }, { data: members }, { data: profs }, { data: lines }] = await Promise.all([
        supabase.from("org_memberships").select("role, module_permissions").eq("org_id", orgId).eq("user_id", user.id).maybeSingle(),
        supabase.from("fin_budgets").select("*").eq("org_id", orgId).order("created_at", { ascending: false }),
        supabase.from("fin_budget_members").select("*").eq("org_id", orgId),
        supabase.from("profiles").select("id, display_name, email, avatar_url"),
        supabase.from("fin_budget_lines").select("*").eq("org_id", orgId),
      ]);
      if (membership?.role === "owner" || membership?.role === "admin") { setMyPerms({ _admin: true }); }
      else { setMyPerms(membership?.module_permissions || {}); }
      setFinBudgets(budgets || []);
      setBudgetMembers(members || []);
      setBudgetLines(lines || []);
      setOrgProfiles(profs || []);
    })();
  }, [user?.id, orgId]);
  const isAdmin = myPerms?._admin === true;
  const canViewAmounts = isAdmin || myPerms?.["erp.fin_budgets.view_amounts"] !== false;
  const canViewActuals = isAdmin || myPerms?.["erp.fin_budgets.view_actuals"] !== false;
  const canEdit = isAdmin || myPerms?.["erp.fin_budgets.edit_budgets"] !== false;
  const canMonthly = isAdmin || myPerms?.["erp.fin_budgets.monthly_view"] !== false;
  const canDrillDown = isAdmin || myPerms?.["erp.fin_budgets.drill_down"] !== false;
  const [budgetData, setBudgetData] = useState(activeBudget || glCategories.map(c => ({ ...c, companyBudget: 0, allocations: [] })));
  const [editingCat, setEditingCat] = useState(null);
  const [companyAmt, setCompanyAmt] = useState("");
  const [saveName, setSaveName] = useState("");
  const [showSave, setShowSave] = useState(false);
  const [showLoad, setShowLoad] = useState(false);
  const [qboPL, setQboPL] = useState([]);
  const [qboPLMonthly, setQboPLMonthly] = useState([]);
  const [qboBills, setQboBills] = useState([]);
  const [customMappings, setCustomMappings] = useState({});
  const [expandedCat, setExpandedCat] = useState(null);
  const [detailMode, setDetailMode] = useState("accounts");
  const [budgetTab, setBudgetTab] = useState("cards");
  const [budgetYear, setBudgetYear] = useState(new Date().getFullYear());
  const [addingGLToCat, setAddingGLToCat] = useState(null);
  const [glSearch, setGlSearch] = useState("");
  const [expandedMonthCats, setExpandedMonthCats] = useState(new Set());
  const [checkedLines, setCheckedLines] = useState(new Set()); // "all" by default = empty means all checked
  const [uncheckedLines, setUncheckedLines] = useState(new Set()); // track unchecked lines
  const [uncheckedCats, setUncheckedCats] = useState(new Set()); // track unchecked categories

  const fmtK = n => Math.abs(n) >= 1000000 ? `$${(n / 1000000).toFixed(1)}M` : Math.abs(n) >= 1000 ? `$${(n / 1000).toFixed(0)}K` : fmt(n);

  // Load QBO P&L + custom mappings + bills + purchases + monthly
  useEffect(() => {
    (async () => {
      const [{ data: pl }, { data: maps }, { data: bills }, { data: purchases }, { data: plm }] = await Promise.all([
        supabase.from("qbo_pl").select("*").eq("classification", "Expense"),
        supabase.from("qbo_category_mappings").select("*").eq("org_id", orgId),
        supabase.from("qbo_bills").select("*").eq("org_id", orgId).order("txn_date", { ascending: false }),
        supabase.from("qbo_purchases").select("*").eq("org_id", orgId).limit(5000).order("txn_date", { ascending: false }),
        supabase.from("qbo_pl_monthly").select("*").eq("org_id", orgId).eq("classification", "Expense").order("period_month"),
      ]);
      setQboPL(pl || []);
      setQboPLMonthly(plm || []);
      const allTxns = [...(bills || []), ...(purchases || []).map(p => ({ ...p, payment_status: "paid", total_amount: p.total_amount }))];
      setQboBills(allTxns);
      if (maps) { const m = {}; maps.forEach(r => { m[r.account_name] = r.ga_category; }); setCustomMappings(m); }
    })();
  }, []);

  // Map QBO accounts to GA categories
  const qboByCategory = {};
  qboPL.forEach(r => {
    const cat = customMappings[r.account_name] || null;
    if (cat) {
      if (!qboByCategory[cat]) qboByCategory[cat] = 0;
      qboByCategory[cat] += Number(r.amount) || 0;
    }
  });
  // Normalize category names for matching (handles "and" vs "&", slight name differences)
  const normalizeCat = (name) => (name || "").toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]/g, "").trim();
  const QBO_TO_BUDGET_MAP = {
    "Brand/Other/Marketing": "Brand / Other Marketing",
    "Consultants": "Consultants & Prof. Services",
    "Software and Subscriptions": "Software & Subscriptions",
    "T&E": "Travel & Entertainment",
    "Non-Fixed and Other": "Non-Fixed & Other",
  };
  // Get P&L accounts mapped to a given budget category name
  const getAccountsForCat = (catName) => {
    const reverseMap = {};
    Object.entries(QBO_TO_BUDGET_MAP).forEach(([qbo, budget]) => { reverseMap[budget] = qbo; });
    const qboName = reverseMap[catName] || catName;
    const norm = normalizeCat(catName);
    return qboPL.filter(r => {
      const mapped = customMappings[r.account_name];
      if (mapped === catName || mapped === qboName) return true;
      if (mapped && normalizeCat(mapped) === norm) return true;
      return false;
    }).sort((a, b) => Math.abs(Number(b.amount)) - Math.abs(Number(a.amount)));
  };

  // Get vendors for a given budget category — matches bills AND purchases via GL codes + names
  const getVendorsForCat = (catName) => {
    const reverseMap = {};
    Object.entries(QBO_TO_BUDGET_MAP).forEach(([qbo, budget]) => { reverseMap[budget] = qbo; });
    const qboName = reverseMap[catName] || catName;
    const norm = normalizeCat(catName);

    // Collect GL account numbers AND name fragments for matching
    const catAccountNums = new Set();
    const catAccountNames = new Set();
    Object.entries(customMappings).forEach(([acctName, mappedCat]) => {
      if (mappedCat === catName || mappedCat === qboName || normalizeCat(mappedCat) === norm) {
        const parts = acctName.split(" ");
        const num = parts[0];
        if (num && /^\d+$/.test(num)) catAccountNums.add(num);
        // Also extract the name portion after the number (e.g. "Social Media Ads" from "60210 Social Media Ads")
        const namePart = parts.slice(1).join(" ");
        if (namePart) catAccountNames.add(namePart.toLowerCase());
      }
    });

    const matchingTxns = qboBills.filter(b => {
      if (!b.gl_accounts) return false;
      const gl = b.gl_accounts;
      const glLower = gl.toLowerCase();
      // Match by account number (for bills: "60320 Travel:Airfare")
      if ([...catAccountNums].some(n => gl.includes(n))) return true;
      // Match by account name fragment (for purchases: "Travel & Entertainment:Airfare")
      if ([...catAccountNames].some(name => glLower.includes(name))) return true;
      return false;
    });

    const byVendor = {};
    matchingTxns.forEach(b => {
      const v = b.vendor_name || "Unknown";
      if (!byVendor[v]) byVendor[v] = { name: v, total: 0, count: 0 };
      byVendor[v].total += Number(b.total_amount) || 0;
      byVendor[v].count++;
    });
    return Object.values(byVendor).sort((a, b) => b.total - a.total);
  };

  const getQBOSpend = (catName) => {
    // For 2025, actuals ARE the budget data
    if (budgetYear === 2025 && activeFinBudgetId) {
      return getCatBudgetFromLines(catName);
    }
    // Direct match first
    if (qboByCategory[catName]) return qboByCategory[catName];
    // Check reverse map (budget name → qbo name)
    for (const [qboName, budgetName] of Object.entries(QBO_TO_BUDGET_MAP)) {
      if (budgetName === catName && qboByCategory[qboName]) return qboByCategory[qboName];
    }
    // Fuzzy match by normalized name
    const norm = normalizeCat(catName);
    for (const [key, val] of Object.entries(qboByCategory)) {
      if (normalizeCat(key) === norm) return val;
    }
    return 0;
  };

  const getSpend = (catId) => requests.filter(r => r.budget_category_id === catId && r.status === "approved").reduce((s, r) => s + annualiseAmount(r), 0);
  const getPending = (catId) => requests.filter(r => r.budget_category_id === catId && r.status === "pending").reduce((s, r) => s + annualiseAmount(r), 0);

  // Get the active fin_budget id (first budget matching activeBudgetName, or first budget)
  const activeFinBudget = finBudgets.find(b => b.name === activeBudgetName) || finBudgets[0];
  const activeFinBudgetId = activeFinBudget?.id;

  // Sync category budgets from line items when budget lines, active budget, or year changes
  useEffect(() => {
    if (!activeFinBudgetId || budgetLines.length === 0) return;
    const activeLines = budgetLines.filter(l => l.budget_id === activeFinBudgetId);
    if (activeLines.length === 0) return;
    const yearPrefix = `${budgetYear}-`;
    const catTotals = {};
    activeLines.forEach(l => {
      if (!l.category_name) return;
      let amount = 0;
      if (l.monthly_amounts && Object.keys(l.monthly_amounts).length > 0) {
        amount = Object.entries(l.monthly_amounts)
          .filter(([k]) => k.startsWith(yearPrefix))
          .reduce((s, [, v]) => s + (Number(v) || 0), 0);
      } else {
        amount = Number(l.allocated_amount) || 0;
      }
      catTotals[l.category_name] = (catTotals[l.category_name] || 0) + amount;
    });
    if (Object.keys(catTotals).length > 0) {
      setBudgetData(prev => prev.map(b => catTotals[b.name] !== undefined ? { ...b, companyBudget: catTotals[b.name] } : b));
    }
  }, [activeFinBudgetId, budgetLines.length, budgetYear]);

  const hasFilters = uncheckedLines.size > 0 || uncheckedCats.size > 0;
  // Compute filtered budget total from checked lines only
  const getFilteredBudgetTotal = () => {
    if (!activeFinBudgetId || !hasFilters) return budgetData.reduce((s, b) => s + (b.companyBudget || 0), 0);
    const yearPrefix = `${budgetYear}-`;
    return budgetLines
      .filter(l => l.budget_id === activeFinBudgetId && isCatChecked(l.category_name) && isLineChecked(l.gl_account_name))
      .reduce((s, l) => {
        if (l.monthly_amounts && Object.keys(l.monthly_amounts).length > 0) {
          return s + Object.entries(l.monthly_amounts).filter(([k]) => k.startsWith(yearPrefix)).reduce((sum, [, v]) => sum + (Number(v) || 0), 0);
        }
        return s + (Number(l.allocated_amount) || 0);
      }, 0);
  };
  const totalBudget = getFilteredBudgetTotal();
  const totalSpent = budgetData.filter(b => isCatChecked(b.name)).reduce((s, b) => s + getSpend(b.id), 0);
  const totalPending = budgetData.filter(b => isCatChecked(b.name)).reduce((s, b) => s + getPending(b.id), 0);
  const totalQBO = budgetYear === 2025 && activeFinBudgetId
    ? totalBudget
    : budgetData.filter(b => isCatChecked(b.name)).reduce((s, b) => s + getQBOSpend(b.name), 0);

  const saveVersion = async () => {
    if (!saveName.trim()) return;
    const { data } = await supabase.from("af_budget_versions").insert({
      name: saveName, data: budgetData, total_budget: totalBudget, saved_by: user?.id,
    }).select().single();
    if (data) { setBudgetVersions(p => [data, ...p]); setActiveBudgetName(saveName); }
    setShowSave(false); setSaveName("");
  };

  const loadVersion = (bv) => {
    setBudgetData(bv.data || []);
    setActiveBudget(bv.data);
    setActiveBudgetName(bv.name);
    setShowLoad(false);
  };

  const createBudget = async () => {
    if (!newBudgetForm.name.trim()) return;
    const { data } = await supabase.from("fin_budgets").insert({
      name: newBudgetForm.name.trim(),
      description: newBudgetForm.description || null,
      fiscal_year: parseInt(newBudgetForm.fiscal_year) || new Date().getFullYear(),
      status: newBudgetForm.status || "draft",
      owner_id: user?.id,
      created_by: user?.id,
    }).select().single();
    if (data) {
      setFinBudgets(p => [data, ...p]);
      // Auto-add creator as owner member
      const { data: mem } = await supabase.from("fin_budget_members").insert({
        budget_id: data.id, user_id: user?.id, role: "owner", added_by: user?.id,
      }).select().single();
      if (mem) setBudgetMembers(p => [...p, mem]);
      setActiveBudgetName(data.name);
    }
    setShowNewBudget(false);
    setNewBudgetForm({ name: "", description: "", fiscal_year: new Date().getFullYear(), status: "draft" });
  };

  const shareBudget = async (budgetId, userId, role = "viewer") => {
    const exists = budgetMembers.find(m => m.budget_id === budgetId && m.user_id === userId);
    if (exists) return;
    const { data } = await supabase.from("fin_budget_members").insert({
      budget_id: budgetId, user_id: userId, role, added_by: user?.id,
    }).select().single();
    if (data) setBudgetMembers(p => [...p, data]);
    // Send notification
    if (userId !== user?.id) {
      const budget = finBudgets.find(b => b.id === budgetId);
      const actorName = orgProfiles.find(p => p.id === user?.id)?.display_name || "Someone";
      await supabase.from("notifications").insert({
        org_id: orgId, user_id: userId, type: "budget_shared",
        title: `${actorName} shared a budget with you`,
        body: budget?.name || "Untitled Budget",
        entity_type: "budget", entity_id: budgetId,
        actor_id: user?.id, is_read: false, category: "assignment",
        metadata: { budget_name: budget?.name, role },
      });
    }
  };

  const updateBudgetMemberRole = async (memberId, role) => {
    await supabase.from("fin_budget_members").update({ role }).eq("id", memberId);
    setBudgetMembers(p => p.map(m => m.id === memberId ? { ...m, role } : m));
  };

  const removeBudgetMember = async (memberId) => {
    await supabase.from("fin_budget_members").delete().eq("id", memberId);
    setBudgetMembers(p => p.filter(m => m.id !== memberId));
  };

  const updateBudget = async () => {
    if (!editingBudget || !editBudgetForm.name.trim()) return;
    const updates = {
      name: editBudgetForm.name.trim(),
      description: editBudgetForm.description || null,
      fiscal_year: parseInt(editBudgetForm.fiscal_year) || new Date().getFullYear(),
      status: editBudgetForm.status || "draft",
      updated_at: new Date().toISOString(),
    };
    await supabase.from("fin_budgets").update(updates).eq("id", editingBudget.id);
    setFinBudgets(p => p.map(b => b.id === editingBudget.id ? { ...b, ...updates } : b));
    if (activeBudgetName === editingBudget.name) setActiveBudgetName(updates.name);
    setEditingBudget(null);
  };

  const deleteBudget = async (budgetId) => {
    if (!window.confirm("Delete this budget? This cannot be undone.")) return;
    await supabase.from("fin_budgets").delete().eq("id", budgetId);
    setFinBudgets(p => p.filter(b => b.id !== budgetId));
    setBudgetMembers(p => p.filter(m => m.budget_id !== budgetId));
  };

  // Get annual budget for a GL account from monthly_amounts for the selected year
  const getLineBudget = (glAccountName) => {
    if (!activeFinBudgetId) return null;
    const line = budgetLines.find(l => l.budget_id === activeFinBudgetId && l.gl_account_name === glAccountName);
    if (!line) return null;
    // If monthly_amounts exists, sum the selected year
    if (line.monthly_amounts && Object.keys(line.monthly_amounts).length > 0) {
      const yearPrefix = `${budgetYear}-`;
      return Object.entries(line.monthly_amounts)
        .filter(([k]) => k.startsWith(yearPrefix))
        .reduce((s, [, v]) => s + (Number(v) || 0), 0);
    }
    return line.allocated_amount ?? null;
  };

  // Get monthly budget for a GL account for a specific month (e.g. "2026-03")
  const getLineMonthBudget = (glAccountName, monthKey) => {
    if (!activeFinBudgetId) return null;
    const line = budgetLines.find(l => l.budget_id === activeFinBudgetId && l.gl_account_name === glAccountName);
    if (!line?.monthly_amounts) return null;
    return line.monthly_amounts[monthKey] ?? null;
  };

  // Get total annual budget for a category by summing its line items for the selected year
  const getCatBudgetFromLines = (catName) => {
    if (!activeFinBudgetId) return 0;
    const catLines = budgetLines.filter(l => l.budget_id === activeFinBudgetId && l.category_name === catName);
    const yearPrefix = `${budgetYear}-`;
    return catLines.reduce((s, l) => {
      if (l.monthly_amounts && Object.keys(l.monthly_amounts).length > 0) {
        return s + Object.entries(l.monthly_amounts)
          .filter(([k]) => k.startsWith(yearPrefix))
          .reduce((sum, [, v]) => sum + (Number(v) || 0), 0);
      }
      return s + (Number(l.allocated_amount) || 0);
    }, 0);
  };

  // Get monthly budget for a category for a specific month
  const getCatMonthBudget = (catName, monthKey) => {
    if (!activeFinBudgetId) return 0;
    return budgetLines
      .filter(l => l.budget_id === activeFinBudgetId && l.category_name === catName)
      .reduce((s, l) => s + (Number(l.monthly_amounts?.[monthKey]) || 0), 0);
  };

  // Get available years from the budget lines
  const availableYears = (() => {
    if (!activeFinBudgetId) return [new Date().getFullYear()];
    const years = new Set();
    budgetLines.filter(l => l.budget_id === activeFinBudgetId).forEach(l => {
      if (l.monthly_amounts) Object.keys(l.monthly_amounts).forEach(k => years.add(parseInt(k.split("-")[0])));
    });
    return years.size > 0 ? [...years].sort() : [new Date().getFullYear()];
  })();

  // Upsert a budget line for a GL account, then sync category total
  const upsertBudgetLine = async (glAccountName, amount, categoryName) => {
    if (!activeFinBudgetId) return;
    const existing = budgetLines.find(l => l.budget_id === activeFinBudgetId && l.gl_account_name === glAccountName);
    let newLines;
    if (existing) {
      await supabase.from("fin_budget_lines").update({ allocated_amount: amount, category_name: categoryName }).eq("id", existing.id);
      newLines = budgetLines.map(l => l.id === existing.id ? { ...l, allocated_amount: amount, category_name: categoryName } : l);
    } else {
      const { data } = await supabase.from("fin_budget_lines").insert({
        budget_id: activeFinBudgetId, gl_account_name: glAccountName,
        allocated_amount: amount, category_name: categoryName,
        description: glAccountName,
      }).select().single();
      if (data) newLines = [...budgetLines, data];
      else newLines = budgetLines;
    }
    setBudgetLines(newLines);
    // Auto-update the category's companyBudget to sum of its lines
    const catTotal = newLines
      .filter(l => l.budget_id === activeFinBudgetId && l.category_name === categoryName)
      .reduce((s, l) => s + (Number(l.allocated_amount) || 0), 0);
    setBudgetData(prev => prev.map(b => b.name === categoryName ? { ...b, companyBudget: catTotal } : b));
  };

  // Add a GL account to a budget category (creates/updates mapping)
  const addGLToCategory = async (accountName, categoryName) => {
    // Upsert into qbo_category_mappings
    const existing = Object.entries(customMappings).find(([k]) => k === accountName);
    if (existing) {
      // Update existing mapping
      await supabase.from("qbo_category_mappings").update({ ga_category: categoryName }).eq("org_id", orgId).eq("account_name", accountName);
    } else {
      await supabase.from("qbo_category_mappings").insert({ org_id: orgId, account_name: accountName, ga_category: categoryName });
    }
    setCustomMappings(prev => ({ ...prev, [accountName]: categoryName }));
    setAddingGLToCat(null);
    setGlSearch("");
  };

  // Remove a GL account from a budget category
  const removeGLFromCategory = async (accountName) => {
    await supabase.from("qbo_category_mappings").delete().eq("org_id", orgId).eq("account_name", accountName);
    setCustomMappings(prev => { const n = { ...prev }; delete n[accountName]; return n; });
  };

  // Get all unmapped GL accounts (from QBO P&L)
  // Merge GL accounts from QBO P&L AND budget lines (some GL accounts only exist in budget data)
  const allPLAccounts = [...new Set([
    ...qboPL.map(r => r.account_name),
    ...budgetLines.filter(l => l.budget_id === activeFinBudgetId && l.gl_account_name).map(l => l.gl_account_name),
  ])].sort();
  const unmappedAccounts = allPLAccounts.filter(a => !customMappings[a]);

  // Save a single month budget amount for a GL line
  const saveMonthBudget = async (glAccountName, monthKey, amount, categoryName) => {
    if (!activeFinBudgetId) return;
    const existing = budgetLines.find(l => l.budget_id === activeFinBudgetId && l.gl_account_name === glAccountName);
    if (existing) {
      const newMonthly = { ...(existing.monthly_amounts || {}), [monthKey]: amount };
      await supabase.from("fin_budget_lines").update({ monthly_amounts: newMonthly, category_name: categoryName }).eq("id", existing.id);
      const newLines = budgetLines.map(l => l.id === existing.id ? { ...l, monthly_amounts: newMonthly, category_name: categoryName } : l);
      setBudgetLines(newLines);
    } else {
      const { data } = await supabase.from("fin_budget_lines").insert({
        budget_id: activeFinBudgetId, gl_account_name: glAccountName,
        monthly_amounts: { [monthKey]: amount }, category_name: categoryName,
        description: glAccountName,
      }).select().single();
      if (data) setBudgetLines(p => [...p, data]);
    }
  };

  // Handle paste from spreadsheet — accepts tab or newline separated values
  const handleMonthlyPaste = async (e, glAccountName, categoryName, months) => {
    const text = e.clipboardData?.getData("text");
    if (!text) return;
    // Split by tabs first (row paste), or newlines (column paste), or both
    // Spreadsheets typically use \t between cells and \n between rows
    const rawText = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
    // If it has tabs, split by tabs (row paste). Otherwise split by newlines (column paste).
    // Also handle mixed: take first row if multi-row paste
    let rawValues;
    if (rawText.includes("\t")) {
      // Row paste — take first line, split by tab
      rawValues = rawText.split("\n")[0].split("\t");
    } else if (rawText.includes("\n")) {
      // Column paste
      rawValues = rawText.split("\n");
    } else {
      // Single value — just let normal input handling take it
      return;
    }
    e.preventDefault();
    const values = rawValues.map(v => {
      // Clean: remove $, commas, quotes, spaces, parentheses (negative), trim
      let cleaned = v.replace(/[$,"'\s]/g, "").trim();
      // Handle accounting negative format: (5266) → -5266
      if (cleaned.startsWith("(") && cleaned.endsWith(")")) {
        cleaned = "-" + cleaned.slice(1, -1);
      }
      // Handle "$ -" or "-" or "—" as zero
      if (cleaned === "" || cleaned === "-" || cleaned === "—" || cleaned === "0") return 0;
      return Number(cleaned) || 0;
    });
    if (values.length === 0) return;
    // Figure out which month the paste started from
    const input = e.target;
    const monthIdx = parseInt(input.dataset?.monthIdx ?? "0") || 0;
    // Build updated monthly amounts
    const existing = budgetLines.find(l => l.budget_id === activeFinBudgetId && l.gl_account_name === glAccountName);
    const newMonthly = { ...(existing?.monthly_amounts || {}) };
    for (let i = 0; i < values.length && (monthIdx + i) < months.length; i++) {
      newMonthly[months[monthIdx + i]] = values[i];
    }
    // Save
    if (existing) {
      await supabase.from("fin_budget_lines").update({ monthly_amounts: newMonthly, category_name: categoryName }).eq("id", existing.id);
      setBudgetLines(p => p.map(l => l.id === existing.id ? { ...l, monthly_amounts: newMonthly, category_name: categoryName } : l));
    } else {
      const { data } = await supabase.from("fin_budget_lines").insert({
        budget_id: activeFinBudgetId, gl_account_name: glAccountName,
        monthly_amounts: newMonthly, category_name: categoryName, description: glAccountName,
      }).select().single();
      if (data) setBudgetLines(p => [...p, data]);
    }
    // Update the visible inputs to reflect pasted values
    const row = input.closest("tr");
    if (row) {
      const inputs = row.querySelectorAll("input[data-month-idx]");
      inputs.forEach(inp => {
        const mi = parseInt(inp.dataset.monthIdx);
        const offset = mi - monthIdx;
        if (offset >= 0 && offset < values.length) {
          inp.value = values[offset] === 0 ? "" : values[offset].toLocaleString();
        }
      });
    }
  };

  const toggleMonthCat = (catName) => setExpandedMonthCats(prev => {
    const next = new Set(prev);
    next.has(catName) ? next.delete(catName) : next.add(catName);
    return next;
  });

  const isLineChecked = (glName) => !uncheckedLines.has(glName);
  const isCatChecked = (catName) => !uncheckedCats.has(catName);

  const toggleLine = (glName) => {
    setUncheckedLines(prev => {
      const next = new Set(prev);
      next.has(glName) ? next.delete(glName) : next.add(glName);
      return next;
    });
  };

  const toggleCat = (catName, catLines) => {
    const allChecked = isCatChecked(catName) && catLines.every(l => isLineChecked(l.gl_account_name));
    setUncheckedCats(prev => {
      const next = new Set(prev);
      allChecked ? next.add(catName) : next.delete(catName);
      return next;
    });
    setUncheckedLines(prev => {
      const next = new Set(prev);
      if (allChecked) {
        catLines.forEach(l => next.add(l.gl_account_name));
      } else {
        catLines.forEach(l => next.delete(l.gl_account_name));
      }
      return next;
    });
  };

  const ini = (uid) => { const p = orgProfiles.find(pr => pr.id === uid); return p?.display_name ? p.display_name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase() : "?"; };
  const uname = (uid) => orgProfiles.find(p => p.id === uid)?.display_name || "Unknown";

  const saveCompanyBudget = () => {
    const cleaned = Number(String(companyAmt).replace(/[$,\s]/g, ""));
    setBudgetData(prev => prev.map(b => b.id === editingCat.id ? { ...b, companyBudget: cleaned } : b));
    setEditingCat(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Budget list / selector */}
      {finBudgets.length > 0 && (
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: -8 }}>
          {finBudgets.map(b => {
            const bMembers = budgetMembers.filter(m => m.budget_id === b.id);
            const isActive = activeBudgetName === b.name;
            return (
              <div key={b.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: `1px solid ${isActive ? T.accent : T.border}`, background: isActive ? T.accent + "12" : T.surface2, cursor: "pointer", position: "relative" }}
                onClick={() => { setActiveBudgetName(b.name); const bv = budgetVersions.find(v => v.name === b.name); if (bv) { setBudgetData(bv.data || []); setActiveBudget(bv.data); } }}>
                <span style={{ fontSize: 12, fontWeight: isActive ? 700 : 500, color: isActive ? T.accent : T.text }}>{b.name}</span>
                <span style={{ fontSize: 9, color: T.text3, background: T.surface3, padding: "1px 5px", borderRadius: 4 }}>{b.status}</span>
                <div style={{ display: "flex", marginLeft: 4 }}>
                  {bMembers.slice(0, 3).map((m, i) => (
                    <div key={m.id} style={{ width: 18, height: 18, borderRadius: "50%", background: T.accent + "30", color: T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, fontWeight: 700, marginLeft: i > 0 ? -4 : 0, border: `1px solid ${T.surface}`, zIndex: 3 - i }} title={uname(m.user_id)}>{ini(m.user_id)}</div>
                  ))}
                  {bMembers.length > 3 && <div style={{ width: 18, height: 18, borderRadius: "50%", background: T.surface3, color: T.text3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, fontWeight: 700, marginLeft: -4, border: `1px solid ${T.surface}` }}>+{bMembers.length - 3}</div>}
                </div>
                <button onClick={(e) => { e.stopPropagation(); setShowShare(b.id); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12, color: T.text3, padding: 0 }} title="Share">👥</button>
                {canEdit && <button onClick={(e) => { e.stopPropagation(); setEditingBudget(b); setEditBudgetForm({ name: b.name, description: b.description || "", fiscal_year: b.fiscal_year || new Date().getFullYear(), status: b.status || "draft" }); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: T.text3, padding: 0 }} title="Edit">✎</button>}
                {canEdit && <button onClick={(e) => { e.stopPropagation(); deleteBudget(b.id); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: T.text3, padding: 0 }} title="Delete">🗑</button>}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>G&A Budgets</div>
          <div style={{ fontSize: 12, color: T.text3 }}>{activeBudgetName ? `Active: ${activeBudgetName}` : "Unsaved budget"} · {glCategories.length} categories</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {canEdit && <button onClick={() => setShowNewBudget(true)} style={{ padding: "7px 14px", fontSize: 12, fontWeight: 700, background: "#22c55e", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>+ New Budget</button>}
          {canEdit && <button onClick={() => setShowLoad(true)} style={{ padding: "7px 14px", fontSize: 12, fontWeight: 600, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text2, cursor: "pointer" }}>↓ Load</button>}
          {canEdit && <button onClick={() => { setSaveName(activeBudgetName || ""); setShowSave(true); }} style={{ padding: "7px 14px", fontSize: 12, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>💾 Save</button>}
        </div>
      </div>

      {/* Summary bar */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : `repeat(${[canViewAmounts, canViewActuals, true, true, canViewAmounts && canViewActuals].filter(Boolean).length}, 1fr)`, gap: 8 }}>
        {[
          canViewAmounts && { l: `${hasFilters ? "Selected " : "Total "}Budget${budgetYear ? ` (${budgetYear})` : ""}`, v: fmt(totalBudget), c: hasFilters ? "#8b5cf6" : T.text },
          canViewActuals && { l: budgetYear === 2025 ? `${budgetYear} Actuals` : "QBO Actuals", v: fmt(totalQBO), c: "#6366f1" },
          { l: "Requests Spent", v: fmt(totalSpent), c: "#10B981" },
          { l: "Pending", v: fmt(totalPending), c: "#F59E0B" },
          canViewAmounts && canViewActuals && { l: "Remaining", v: fmt(totalBudget - totalQBO), c: totalQBO > totalBudget && totalBudget > 0 ? "#EF4444" : T.text },
        ].filter(Boolean).map(f => (
          <div key={f.l} style={{ background: T.surface2, borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase" }}>{f.l}</div>
            <div style={{ fontSize: 18, fontWeight: 900, color: f.c, marginTop: 4 }}>{f.v}</div>
          </div>
        ))}
      </div>

      {/* View toggle + Year selector */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: `1px solid ${T.border}` }}>
          <button onClick={() => setBudgetTab("cards")} style={{ padding: "6px 16px", fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer", background: budgetTab === "cards" ? T.accent : T.surface2, color: budgetTab === "cards" ? "#fff" : T.text3 }}>Category Cards</button>
          {canMonthly && <button onClick={() => setBudgetTab("monthly")} style={{ padding: "6px 16px", fontSize: 11, fontWeight: 600, border: "none", cursor: "pointer", background: budgetTab === "monthly" ? T.accent : T.surface2, color: budgetTab === "monthly" ? "#fff" : T.text3, borderLeft: `1px solid ${T.border}` }}>Monthly View</button>}
        </div>
        {availableYears.length > 1 && (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: T.text3 }}>Budget Year:</span>
            <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: `1px solid ${T.border}` }}>
              {availableYears.map(y => (
                <button key={y} onClick={() => setBudgetYear(y)}
                  style={{ padding: "4px 12px", fontSize: 11, fontWeight: budgetYear === y ? 700 : 500, border: "none", cursor: "pointer", background: budgetYear === y ? "#8b5cf6" : T.surface2, color: budgetYear === y ? "#fff" : T.text3 }}>
                  {y}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* MONTHLY BUDGET vs ACTUAL TABLE */}
      {budgetTab === "monthly" && (() => {
        const curMo = new Date().toISOString().slice(0, 7);
        // Generate all 12 months for the selected budget year
        const months = Array.from({ length: 12 }, (_, i) => `${budgetYear}-${String(i + 1).padStart(2, "0")}`);
        const monthLabels = months.map(m => new Date(m + "-15").toLocaleDateString("en-US", { month: "short" }));
        const isOpen = (m) => m >= curMo;
        const isFuture = (m) => m > curMo;
        // Build monthly spend by budget category
        // For 2025: actuals ARE the budget data (historical actuals loaded as budget)
        // For 2026+: actuals come from QBO
        const getMonthCatActual = (catName, month) => {
          if (budgetYear === 2025) {
            // 2025 budget data IS the actuals — return budget line amounts
            return getCatMonthBudget(catName, month);
          }
          // For other years, pull from QBO
          const reverseMap = {}; Object.entries(QBO_TO_BUDGET_MAP).forEach(([q, b]) => { reverseMap[b] = q; });
          const qboName = reverseMap[catName] || catName;
          const norm = normalizeCat(catName);
          return qboPLMonthly.filter(r => r.period_month === month).filter(r => {
            const mapped = customMappings[r.account_name];
            return mapped === catName || mapped === qboName || (mapped && normalizeCat(mapped) === norm);
          }).reduce((s, r) => s + Number(r.amount), 0);
        };
        const monthlyActualTotals = months.map(m => budgetData.reduce((s, cat) => s + getMonthCatActual(cat.name, m), 0));
        const monthlyBudgetTotals = months.map(m => budgetData.reduce((s, cat) => s + getCatMonthBudget(cat.name, m), 0));
        // Filtered totals - only checked lines
        const getFilteredMonthBudget = (m) => {
          if (!activeFinBudgetId) return 0;
          return budgetLines
            .filter(l => l.budget_id === activeFinBudgetId && isCatChecked(l.category_name) && isLineChecked(l.gl_account_name))
            .reduce((s, l) => s + (Number(l.monthly_amounts?.[m]) || 0), 0);
        };
        const getFilteredMonthActual = (m) => {
          if (budgetYear === 2025 && activeFinBudgetId) return getFilteredMonthBudget(m);
          return budgetData.filter(c => isCatChecked(c.name)).reduce((s, cat) => s + getMonthCatActual(cat.name, m), 0);
        };
        const filteredBudgetTotals = months.map(m => getFilteredMonthBudget(m));
        const filteredActualTotals = months.map(m => getFilteredMonthActual(m));
        const filteredBudgetAnnual = filteredBudgetTotals.reduce((s, v) => s + v, 0);
        const filteredActualAnnual = filteredActualTotals.reduce((s, v) => s + v, 0);
        const hasFilters = uncheckedLines.size > 0 || uncheckedCats.size > 0;
        return (
          <div style={{ overflowX: "auto", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 800 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${T.border}` }}>
                  <th style={{ padding: "8px 12px", textAlign: "left", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", position: "sticky", left: 0, background: T.surface, zIndex: 1, minWidth: 160 }}>Category</th>
                  <th style={{ padding: "8px 10px", textAlign: "right", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase" }}>Annual Budget</th>
                  {months.map((m, i) => (
                    <th key={m} style={{ padding: "8px 6px", textAlign: "center", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", minWidth: 80 }}>
                      {monthLabels[i]}
                      {isOpen(m) && <span style={{ display: "block", fontSize: 7, color: "#F59E0B", fontWeight: 700 }}>OPEN</span>}
                    </th>
                  ))}
                  <th style={{ padding: "8px 10px", textAlign: "right", fontSize: 10, fontWeight: 700, color: T.text, textTransform: "uppercase" }}>YTD Actual</th>
                  <th style={{ padding: "8px 10px", textAlign: "right", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase" }}>Variance</th>
                </tr>
              </thead>
              <tbody>
                {budgetData.map(cat => {
                  const catLines = activeFinBudgetId
                    ? budgetLines.filter(l => l.budget_id === activeFinBudgetId && l.category_name === cat.name)
                    : [];
                  const budgetYTD = cat.companyBudget || 0;
                  const qboYTD = months.reduce((s, m) => s + getMonthCatActual(cat.name, m), 0);
                  const variance = budgetYTD - qboYTD;
                  const isMonthExpanded = expandedMonthCats.has(cat.name);
                  return (
                    <Fragment key={cat.id}>
                      {/* Category summary row */}
                      <tr style={{ borderBottom: `1px solid ${T.border}`, cursor: "pointer" }} onClick={() => toggleMonthCat(cat.name)}>
                        <td style={{ padding: "8px 12px", fontSize: 12, fontWeight: 600, color: T.text, position: "sticky", left: 0, background: T.surface, zIndex: 1 }}>
                          <span style={{ fontSize: 9, color: T.text3, marginRight: 4 }}>{isMonthExpanded ? "▼" : "▶"}</span>
                          <span style={{ marginRight: 6 }}>{cat.icon}</span>{cat.name}
                          {catLines.length > 0 && <span style={{ fontSize: 9, color: T.text3, marginLeft: 4 }}>({catLines.length})</span>}
                        </td>
                        <td style={{ padding: "8px 10px", textAlign: "right", fontSize: 11, fontWeight: 600, color: budgetYTD ? T.text : T.text3 }}>{budgetYTD ? fmtK(budgetYTD) : "—"}</td>
                        {months.map(m => {
                          const actual = getMonthCatActual(cat.name, m);
                          const budget = getCatMonthBudget(cat.name, m);
                          const hasBudget = budget > 0;
                          const overBudget = hasBudget && actual > budget * 1.05;
                          return (
                            <td key={m} style={{ padding: "4px 6px", textAlign: "right", fontSize: 10, verticalAlign: "top" }}>
                              {hasBudget && <div style={{ fontSize: 9, color: "#8b5cf6", fontWeight: 600 }}>{fmtK(budget)}</div>}
                              <div style={{ fontWeight: actual > 0 ? 600 : 400, color: actual === 0 ? T.text3 + "40" : overBudget ? "#ef4444" : isFuture(m) ? T.text3 : T.text2 }}>
                                {actual === 0 ? "—" : fmtK(actual)}
                              </div>
                              {hasBudget && actual > 0 && (
                                <div style={{ fontSize: 8, color: actual <= budget ? "#22c55e" : "#ef4444", fontWeight: 600 }}>
                                  {actual <= budget ? "✓" : `+${fmtK(actual - budget)}`}
                                </div>
                              )}
                            </td>
                          );
                        })}
                        <td style={{ padding: "8px 10px", textAlign: "right", fontSize: 11, fontWeight: 700, color: T.accent }}>{qboYTD > 0 ? fmtK(qboYTD) : "—"}</td>
                        <td style={{ padding: "8px 10px", textAlign: "right", fontSize: 11, fontWeight: 700, color: budgetYTD === 0 ? T.text3 : variance >= 0 ? T.green : T.red }}>
                          {budgetYTD === 0 ? "—" : `${variance >= 0 ? "+" : ""}${fmtK(variance)}`}
                        </td>
                      </tr>
                      {/* Expanded GL line rows */}
                      {isMonthExpanded && catLines.map(line => {
                        const lineAnnual = Object.entries(line.monthly_amounts || {})
                          .filter(([k]) => k.startsWith(`${budgetYear}-`))
                          .reduce((s, [, v]) => s + (Number(v) || 0), 0);
                        return (
                          <tr key={line.id} style={{ background: T.surface2 + "60", borderBottom: `1px solid ${T.border}08` }}>
                            <td style={{ padding: "4px 12px 4px 32px", fontSize: 10, color: T.text2, position: "sticky", left: 0, background: T.surface2 + "60", zIndex: 1 }}>
                              {line.gl_account_name}
                            </td>
                            <td style={{ padding: "4px 10px", textAlign: "right", fontSize: 10, fontWeight: 500, color: lineAnnual > 0 ? T.text2 : T.text3 }}>
                              {lineAnnual > 0 ? fmtK(lineAnnual) : "—"}
                            </td>
                            {months.map((m, mi) => {
                              const val = line.monthly_amounts?.[m] ?? "";
                              return (
                                <td key={m} style={{ padding: "2px 3px" }}>
                                  <input
                                    type="text"
                                    defaultValue={val === 0 ? "" : (typeof val === "number" ? val.toLocaleString() : val)}
                                    placeholder="—"
                                    data-month-idx={mi}
                                    onPaste={e => handleMonthlyPaste(e, line.gl_account_name, cat.name, months)}
                                    onBlur={e => {
                                      const cleaned = Number(String(e.target.value).replace(/[$,\s]/g, "")) || 0;
                                      if (cleaned !== (Number(val) || 0)) saveMonthBudget(line.gl_account_name, m, cleaned, cat.name);
                                    }}
                                    onKeyDown={e => { if (e.key === "Enter") e.target.blur(); if (e.key === "Tab") { /* allow default tab */ } }}
                                    style={{ width: "100%", padding: "2px 4px", fontSize: 9, textAlign: "right", border: `1px solid ${T.border}40`, borderRadius: 3, background: "transparent", color: T.text2, boxSizing: "border-box", minWidth: 55 }}
                                  />
                                </td>
                              );
                            })}
                            <td style={{ padding: "4px 10px", textAlign: "right", fontSize: 10, color: T.text3 }}>
                              {lineAnnual > 0 ? fmtK(lineAnnual) : "—"}
                            </td>
                            <td style={{ padding: "4px 10px" }}></td>
                          </tr>
                        );
                      })}
                    </Fragment>
                  );
                })}
                {/* Total row */}
                <tr style={{ borderTop: `3px solid ${T.border}`, background: T.surface2 }}>
                  <td style={{ padding: "10px 12px", fontSize: 12, fontWeight: 900, color: T.text, position: "sticky", left: 0, background: T.surface2, zIndex: 1 }}>TOTAL</td>
                  <td style={{ padding: "10px 10px", textAlign: "right", fontSize: 12, fontWeight: 900, color: T.text }}>{fmtK(totalBudget)}</td>
                  {months.map((m, i) => (
                    <td key={m} style={{ padding: "4px 6px", textAlign: "right", verticalAlign: "top" }}>
                      {monthlyBudgetTotals[i] > 0 && <div style={{ fontSize: 9, fontWeight: 700, color: "#8b5cf6" }}>{fmtK(monthlyBudgetTotals[i])}</div>}
                      <div style={{ fontSize: 11, fontWeight: 900, color: T.text }}>{monthlyActualTotals[i] > 0 ? fmtK(monthlyActualTotals[i]) : "—"}</div>
                    </td>
                  ))}
                  <td style={{ padding: "10px 10px", textAlign: "right", fontSize: 12, fontWeight: 900, color: T.accent }}>{fmtK(monthlyActualTotals.reduce((s, v) => s + v, 0))}</td>
                  <td style={{ padding: "10px 10px", textAlign: "right", fontSize: 12, fontWeight: 900, color: totalBudget - monthlyActualTotals.reduce((s, v) => s + v, 0) >= 0 ? T.green : T.red }}>{totalBudget > 0 ? `${totalBudget - monthlyActualTotals.reduce((s, v) => s + v, 0) >= 0 ? "+" : ""}${fmtK(totalBudget - monthlyActualTotals.reduce((s, v) => s + v, 0))}` : "—"}</td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      })()}

      {/* Category cards */}
      {budgetTab === "cards" && budgetData.map(cat => {
        const catLines = activeFinBudgetId
          ? budgetLines.filter(l => l.budget_id === activeFinBudgetId && l.category_name === cat.name)
          : [];
        const catChecked = isCatChecked(cat.name);
        const catLinesAllChecked = catLines.every(l => isLineChecked(l.gl_account_name));
        const catSomeChecked = catLines.length === 0 || catLines.some(l => isLineChecked(l.gl_account_name));
        const spent = getSpend(cat.id);
        const pend = getPending(cat.id);
        const qboSpend = getQBOSpend(cat.name);
        const primarySpend = qboSpend > 0 ? qboSpend : spent;
        const utilPct = cat.companyBudget > 0 ? pct(primarySpend, cat.companyBudget) : 0;
        const isOver = cat.companyBudget > 0 && primarySpend > cat.companyBudget;
        const isExpanded = expandedCat === cat.id;
        const qboAccounts = isExpanded && canDrillDown ? getAccountsForCat(cat.name) : [];
        const qboAccountNames = new Set(qboAccounts.map(r => r.account_name));
        const budgetOnlyAccounts = isExpanded && canDrillDown && activeFinBudgetId
          ? budgetLines
              .filter(l => l.budget_id === activeFinBudgetId && l.category_name === cat.name && !qboAccountNames.has(l.gl_account_name))
              .map(l => ({ account_name: l.gl_account_name, amount: 0 }))
          : [];
        const catAccounts = [...qboAccounts, ...budgetOnlyAccounts];
        const catVendors = isExpanded && canDrillDown && detailMode === "vendors" ? getVendorsForCat(cat.name) : [];
        return (
          <Card key={cat.id} style={{ borderLeft: `4px solid ${cat.color || T.accent}`, opacity: catChecked ? 1 : 0.4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <input type="checkbox" checked={catChecked && catLinesAllChecked}
                  ref={el => { if (el) el.indeterminate = catChecked && catSomeChecked && !catLinesAllChecked; }}
                  onChange={() => toggleCat(cat.name, catLines)}
                  style={{ width: 16, height: 16, cursor: "pointer", flexShrink: 0, accentColor: cat.color || T.accent }} />
                <div onClick={() => canDrillDown ? setExpandedCat(isExpanded ? null : cat.id) : null} style={{ display: "flex", alignItems: "center", gap: 8, cursor: canDrillDown ? "pointer" : "default" }}>
                  {canDrillDown && <span style={{ fontSize: 9, color: T.text3 }}>{isExpanded ? "▼" : "▶"}</span>}
                  <span style={{ fontSize: 18 }}>{cat.icon}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{cat.name}</div>
                    {isOver && <span style={{ fontSize: 10, fontWeight: 700, color: "#991B1B", background: "#FEE2E2", padding: "1px 6px", borderRadius: 8 }}>🚨 Over budget</span>}
                  </div>
                </div>
              </div>
              <div style={{ textAlign: "right" }} onClick={e => e.stopPropagation()}>
                {canViewAmounts ? (<>
                  <div style={{ fontSize: 10, color: T.text3, fontWeight: 600, textTransform: "uppercase" }}>Company Budget</div>
                  {canEdit && editingCat?.id === cat.id ? (
                  <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                    <input autoFocus type="number" value={companyAmt} onChange={e => setCompanyAmt(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") saveCompanyBudget(); if (e.key === "Escape") setEditingCat(null); }}
                      style={{ width: 100, padding: "4px 8px", border: `1px solid ${T.accent}`, borderRadius: 6, fontSize: 13, color: T.text, background: T.surface, outline: "none" }} />
                    <button onClick={saveCompanyBudget} style={{ background: "#10B981", color: "#fff", border: "none", borderRadius: 4, padding: "4px 8px", cursor: "pointer", fontSize: 11 }}>✓</button>
                  </div>
                ) : (
                  <div onClick={() => { if (canEdit) { setEditingCat(cat); setCompanyAmt(cat.companyBudget || 0); } }}
                    style={{ fontSize: 16, fontWeight: 800, color: cat.companyBudget ? T.text : T.text3, cursor: canEdit ? "pointer" : "default" }}>
                    {cat.companyBudget ? fmt(cat.companyBudget) : (canEdit ? "Click to set" : "—")}{canEdit && cat.companyBudget > 0 && <span style={{ fontSize: 10, color: T.text3, marginLeft: 4 }}>✎</span>}
                  </div>
                )}
                </>) : (
                  /* No amount access — show % only */
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 10, color: T.text3, fontWeight: 600, textTransform: "uppercase" }}>Budget Usage</div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: utilPct > 100 ? "#EF4444" : utilPct > 80 ? "#F59E0B" : T.green }}>{utilPct}%</div>
                  </div>
                )}
              </div>
            </div>
            {(cat.companyBudget > 0 || qboSpend > 0) && (
              <>
                <div style={{ height: 8, background: T.surface2, borderRadius: 4, overflow: "hidden", display: "flex", marginBottom: 8 }}>
                  <div style={{ height: "100%", background: isOver ? "#EF4444" : cat.color || T.accent, width: `${Math.min(100, utilPct)}%`, transition: "width 0.5s" }} />
                  {pend > 0 && <div style={{ height: "100%", background: (cat.color || T.accent) + "40", width: `${Math.min(100 - Math.min(100, utilPct), cat.companyBudget > 0 ? pct(pend, cat.companyBudget) : 0)}%` }} />}
                </div>
                <div style={{ display: "flex", gap: 16, fontSize: 11, color: T.text3, flexWrap: "wrap" }}>
                  {canViewActuals && qboSpend > 0 && canViewAmounts && <span>QBO Actual: <strong style={{ color: "#6366f1" }}>{fmt(qboSpend)}</strong></span>}
                  {canViewAmounts && spent > 0 && <span>Requests: <strong style={{ color: "#10B981" }}>{fmt(spent)}</strong></span>}
                  {canViewAmounts && pend > 0 && <span>Pending: <strong style={{ color: "#F59E0B" }}>{fmt(pend)}</strong></span>}
                  {canViewAmounts && cat.companyBudget > 0 && <span>Remaining: <strong style={{ color: isOver ? "#EF4444" : T.text }}>{fmt(cat.companyBudget - primarySpend)}</strong></span>}
                  <span style={{ fontWeight: 600, color: utilPct > 100 ? "#EF4444" : utilPct > 80 ? "#F59E0B" : T.text2 }}>{utilPct}% used</span>
                </div>
              </>
            )}

            {/* Expanded detail */}
            {isExpanded && (qboSpend > 0 || catAccounts.length > 0) && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase" }}>
                    {detailMode === "accounts" ? `GL Accounts (${catAccounts.length})` : `Vendors (${catVendors.length})`}
                  </div>
                  <div style={{ display: "flex", borderRadius: 6, overflow: "hidden", border: `1px solid ${T.border}` }}>
                    <button onClick={() => setDetailMode("accounts")} style={{ padding: "3px 10px", fontSize: 10, fontWeight: 600, border: "none", cursor: "pointer", background: detailMode === "accounts" ? T.accent : T.surface2, color: detailMode === "accounts" ? "#fff" : T.text3 }}>By Account</button>
                    <button onClick={() => setDetailMode("vendors")} style={{ padding: "3px 10px", fontSize: 10, fontWeight: 600, border: "none", cursor: "pointer", background: detailMode === "vendors" ? T.accent : T.surface2, color: detailMode === "vendors" ? "#fff" : T.text3, borderLeft: `1px solid ${T.border}` }}>By Vendor</button>
                  </div>
                </div>

                {detailMode === "accounts" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {/* Header row */}
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", borderBottom: `1px solid ${T.border}30` }}>
                      <div style={{ flex: 1, fontSize: 9, fontWeight: 700, color: T.text3, textTransform: "uppercase" }}>GL Account</div>
                      {canEdit && activeFinBudgetId && <div style={{ width: 90, fontSize: 9, fontWeight: 700, color: T.text3, textTransform: "uppercase", textAlign: "right" }}>Budget</div>}
                      <div style={{ width: 70, fontSize: 9, fontWeight: 700, color: T.text3, textTransform: "uppercase", textAlign: "right" }}>Actual</div>
                      {canEdit && activeFinBudgetId && <div style={{ width: 60, fontSize: 9, fontWeight: 700, color: T.text3, textTransform: "uppercase", textAlign: "right" }}>Variance</div>}
                      <div style={{ width: 32, fontSize: 9, fontWeight: 700, color: T.text3, textTransform: "uppercase", textAlign: "right" }}>%</div>
                      {canEdit && <div style={{ width: 20 }}></div>}
                    </div>
                    {catAccounts.map(r => {
                      const acctPct = qboSpend > 0 ? (Math.abs(Number(r.amount)) / qboSpend) * 100 : 0;
                      const lineBudget = getLineBudget(r.account_name);
                      const actual = Math.abs(Number(r.amount));
                      const variance = lineBudget != null ? lineBudget - actual : null;
                      const lineChecked = isLineChecked(r.account_name);
                      return (
                        <div key={r.account_name} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", borderBottom: `1px solid ${T.border}10`, opacity: lineChecked ? 1 : 0.35 }}>
                          <input type="checkbox" checked={lineChecked} onChange={() => toggleLine(r.account_name)}
                            style={{ width: 12, height: 12, cursor: "pointer", flexShrink: 0, accentColor: cat.color || T.accent }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11, color: T.text2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.account_name}</div>
                          </div>
                          {canEdit && activeFinBudgetId && (
                            <div style={{ width: 90, flexShrink: 0 }}>
                              <input type="number" defaultValue={lineBudget ?? ""} placeholder="—"
                                onBlur={e => {
                                  const val = e.target.value === "" ? 0 : Number(e.target.value);
                                  if (val !== (lineBudget ?? 0)) upsertBudgetLine(r.account_name, val, cat.name);
                                }}
                                onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
                                style={{ width: "100%", padding: "2px 6px", fontSize: 11, textAlign: "right", border: `1px solid ${T.border}`, borderRadius: 4, background: T.surface2, color: lineBudget != null ? T.text : T.text3, boxSizing: "border-box" }} />
                            </div>
                          )}
                          {canViewAmounts && <span style={{ fontSize: 11, fontWeight: 600, color: T.text, minWidth: 70, textAlign: "right", flexShrink: 0 }}>{fmt(actual)}</span>}
                          {canEdit && activeFinBudgetId && (
                            <span style={{ fontSize: 10, fontWeight: 600, minWidth: 60, textAlign: "right", flexShrink: 0, color: variance == null ? T.text3 : variance >= 0 ? "#22c55e" : "#ef4444" }}>
                              {variance == null ? "—" : `${variance >= 0 ? "+" : ""}${fmtK(variance)}`}
                            </span>
                          )}
                          <span style={{ fontSize: 9, color: T.text3, minWidth: 32, textAlign: "right", flexShrink: 0 }}>{acctPct.toFixed(0)}%</span>
                          {canEdit && <button onClick={() => { if (window.confirm(`Remove "${r.account_name}" from ${cat.name}?`)) removeGLFromCategory(r.account_name); }} style={{ width: 20, background: "none", border: "none", cursor: "pointer", color: T.text3, fontSize: 10, padding: 0, opacity: 0.5 }} title="Remove from category">✕</button>}
                        </div>
                      );
                    })}
                    {/* Category totals for budget lines */}
                    {canEdit && activeFinBudgetId && (() => {
                      const catBudgetTotal = catAccounts.reduce((s, r) => s + (getLineBudget(r.account_name) || 0), 0);
                      const catActualTotal = catAccounts.reduce((s, r) => s + Math.abs(Number(r.amount)), 0);
                      const catVariance = catBudgetTotal - catActualTotal;
                      return catBudgetTotal > 0 ? (
                        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: `2px solid ${T.border}`, marginTop: 4 }}>
                          <div style={{ flex: 1, fontSize: 11, fontWeight: 700, color: T.text }}>Category Total</div>
                          <span style={{ width: 90, textAlign: "right", fontSize: 11, fontWeight: 700, color: T.text }}>{fmt(catBudgetTotal)}</span>
                          <span style={{ width: 70, textAlign: "right", fontSize: 11, fontWeight: 700, color: T.text }}>{fmt(catActualTotal)}</span>
                          <span style={{ width: 60, textAlign: "right", fontSize: 10, fontWeight: 700, color: catVariance >= 0 ? "#22c55e" : "#ef4444" }}>{catVariance >= 0 ? "+" : ""}{fmtK(catVariance)}</span>
                          <span style={{ width: 32 }}></span>
                          {canEdit && <span style={{ width: 20 }}></span>}
                        </div>
                      ) : null;
                    })()}

                    {/* Add GL Account button + picker */}
                    {canEdit && (
                      <div style={{ marginTop: 6 }}>
                        {addingGLToCat === cat.name ? (
                          <div style={{ background: T.surface2, borderRadius: 8, border: `1px solid ${T.border}`, padding: 10 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                              <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase" }}>Add GL Account to {cat.name}</div>
                              <button onClick={() => { setAddingGLToCat(null); setGlSearch(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: T.text3, fontSize: 12 }}>✕</button>
                            </div>
                            <input autoFocus value={glSearch} onChange={e => setGlSearch(e.target.value)} placeholder="Search GL accounts…"
                              style={{ width: "100%", padding: "6px 10px", fontSize: 11, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface, color: T.text, boxSizing: "border-box", marginBottom: 6 }} />
                            <div style={{ maxHeight: 180, overflow: "auto" }}>
                              {/* Show unmapped accounts first, then accounts mapped to other categories */}
                              {allPLAccounts
                                .filter(a => {
                                  // Don't show accounts already in this category
                                  const mapped = customMappings[a];
                                  if (mapped === cat.name) return false;
                                  // Filter by search
                                  if (glSearch && !a.toLowerCase().includes(glSearch.toLowerCase())) return false;
                                  return true;
                                })
                                .sort((a, b) => {
                                  // Unmapped first, then alphabetical
                                  const aUnmapped = !customMappings[a];
                                  const bUnmapped = !customMappings[b];
                                  if (aUnmapped !== bUnmapped) return aUnmapped ? -1 : 1;
                                  return a.localeCompare(b);
                                })
                                .slice(0, 30)
                                .map(acctName => {
                                  const currentCat = customMappings[acctName];
                                  const acctData = qboPL.find(r => r.account_name === acctName);
                                  const amount = acctData ? Math.abs(Number(acctData.amount)) : 0;
                                  return (
                                    <div key={acctName} onClick={() => addGLToCategory(acctName, cat.name)}
                                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px", borderRadius: 4, cursor: "pointer" }}
                                      onMouseEnter={e => e.currentTarget.style.background = T.surface3} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: 11, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{acctName}</div>
                                        {currentCat && <div style={{ fontSize: 9, color: "#f59e0b" }}>Currently in: {currentCat}</div>}
                                      </div>
                                      {amount > 0 && <span style={{ fontSize: 10, color: T.text3, flexShrink: 0 }}>{fmtK(amount)}</span>}
                                      <span style={{ fontSize: 10, color: T.accent, fontWeight: 600, flexShrink: 0 }}>+ Add</span>
                                    </div>
                                  );
                                })}
                              {allPLAccounts.filter(a => customMappings[a] !== cat.name && (!glSearch || a.toLowerCase().includes(glSearch.toLowerCase()))).length === 0 && (
                                <div style={{ fontSize: 11, color: T.text3, padding: 8, textAlign: "center" }}>No matching accounts found</div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => setAddingGLToCat(cat.name)} style={{ padding: "4px 12px", fontSize: 10, fontWeight: 600, borderRadius: 5, border: `1px dashed ${T.border}`, background: "transparent", color: T.text3, cursor: "pointer", width: "100%" }}>
                            + Add GL Account
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {detailMode === "vendors" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                    {catVendors.length === 0 ? (
                      <div style={{ fontSize: 11, color: T.text3, fontStyle: "italic", padding: "8px 0" }}>No bill-level vendor data for this category. Vendor detail requires bills with GL account tags.</div>
                    ) : catVendors.map(v => {
                      const vPct = qboSpend > 0 ? (v.total / qboSpend) * 100 : 0;
                      return (
                        <div key={v.name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 0", borderBottom: `1px solid ${T.border}10` }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11, color: T.text, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.name}</div>
                            <div style={{ fontSize: 9, color: T.text3 }}>{v.count} bill{v.count !== 1 ? "s" : ""}</div>
                          </div>
                          <div style={{ width: 60, height: 4, borderRadius: 2, background: T.surface3, overflow: "hidden", flexShrink: 0 }}>
                            <div style={{ width: `${Math.min(vPct, 100)}%`, height: "100%", background: cat.color || T.accent, borderRadius: 2 }} />
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 600, color: T.text, minWidth: 70, textAlign: "right", flexShrink: 0 }}>{canViewAmounts ? fmt(v.total) : ""}</span>
                          <span style={{ fontSize: 9, color: T.text3, minWidth: 32, textAlign: "right", flexShrink: 0 }}>{vPct.toFixed(0)}%</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
            {isExpanded && qboSpend === 0 && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${T.border}`, fontSize: 11, color: T.text3, fontStyle: "italic" }}>
                No QBO data mapped to this category yet. Sync QuickBooks and assign accounts in Vendor Spend → QBO Actuals.
              </div>
            )}
          </Card>
        );
      })}

      {/* Save modal */}
      {showSave && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowSave(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: 14, padding: 24, width: "min(400px, 90vw)" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 12 }}>💾 Save Budget Version</div>
            <input autoFocus value={saveName} onChange={e => setSaveName(e.target.value)} placeholder="e.g. Q2 2026 Budget"
              onKeyDown={e => { if (e.key === "Enter") saveVersion(); }}
              style={{ width: "100%", padding: "9px 12px", fontSize: 13, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, outline: "none", boxSizing: "border-box", marginBottom: 14 }} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setShowSave(false)} style={{ padding: "8px 14px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text3, cursor: "pointer" }}>Cancel</button>
              <button onClick={saveVersion} disabled={!saveName.trim()} style={{ padding: "8px 14px", fontSize: 12, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Load modal */}
      {showLoad && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowLoad(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: 14, padding: 24, width: "min(400px, 90vw)", maxHeight: "60vh", overflow: "auto" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 12 }}>↓ Load Budget Version</div>
            {budgetVersions.length === 0 ? <div style={{ color: T.text3, fontSize: 13 }}>No saved versions yet</div> :
              budgetVersions.map(bv => (
                <div key={bv.id} onClick={() => loadVersion(bv)}
                  style={{ padding: "12px 14px", borderRadius: 8, border: `1px solid ${activeBudgetName === bv.name ? T.accent : T.border}`, background: activeBudgetName === bv.name ? T.accentDim : "transparent", cursor: "pointer", marginBottom: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{bv.name}</span>
                    <span style={{ fontSize: 12, fontWeight: 700, color: T.text3 }}>{fmt(bv.total_budget)}</span>
                  </div>
                  <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>{new Date(bv.saved_at).toLocaleString()}</div>
                </div>
              ))
            }
          </div>
        </div>
      )}

      {/* New Budget modal */}
      {showNewBudget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowNewBudget(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: 14, padding: 24, width: "min(440px, 90vw)" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 14 }}>✨ New Budget</div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: T.text3, marginBottom: 3 }}>Budget Name *</div>
              <input autoFocus value={newBudgetForm.name} onChange={e => setNewBudgetForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Q3 2026 Operating Budget"
                style={{ width: "100%", padding: "9px 12px", fontSize: 13, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: T.text3, marginBottom: 3 }}>Description</div>
              <input value={newBudgetForm.description} onChange={e => setNewBudgetForm(f => ({ ...f, description: e.target.value }))} placeholder="Optional description"
                style={{ width: "100%", padding: "9px 12px", fontSize: 13, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: T.text3, marginBottom: 3 }}>Fiscal Year</div>
                <input type="number" value={newBudgetForm.fiscal_year} onChange={e => setNewBudgetForm(f => ({ ...f, fiscal_year: e.target.value }))}
                  style={{ width: "100%", padding: "9px 12px", fontSize: 13, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, outline: "none", boxSizing: "border-box" }} />
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: T.text3, marginBottom: 3 }}>Status</div>
                <select value={newBudgetForm.status} onChange={e => setNewBudgetForm(f => ({ ...f, status: e.target.value }))}
                  style={{ width: "100%", padding: "9px 12px", fontSize: 13, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, outline: "none", boxSizing: "border-box" }}>
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="approved">Approved</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setShowNewBudget(false)} style={{ padding: "8px 14px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text3, cursor: "pointer" }}>Cancel</button>
              <button onClick={createBudget} disabled={!newBudgetForm.name.trim()} style={{ padding: "8px 16px", fontSize: 12, fontWeight: 700, background: "#22c55e", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", opacity: newBudgetForm.name.trim() ? 1 : 0.4 }}>Create Budget</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Budget modal */}
      {editingBudget && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setEditingBudget(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: 14, padding: 24, width: "min(440px, 90vw)" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 14 }}>✎ Edit Budget</div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: T.text3, marginBottom: 3 }}>Budget Name *</div>
              <input autoFocus value={editBudgetForm.name} onChange={e => setEditBudgetForm(f => ({ ...f, name: e.target.value }))}
                onKeyDown={e => { if (e.key === "Enter") updateBudget(); }}
                style={{ width: "100%", padding: "9px 12px", fontSize: 13, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 600, color: T.text3, marginBottom: 3 }}>Description</div>
              <input value={editBudgetForm.description} onChange={e => setEditBudgetForm(f => ({ ...f, description: e.target.value }))}
                style={{ width: "100%", padding: "9px 12px", fontSize: 13, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: T.text3, marginBottom: 3 }}>Fiscal Year</div>
                <input type="number" value={editBudgetForm.fiscal_year} onChange={e => setEditBudgetForm(f => ({ ...f, fiscal_year: e.target.value }))}
                  style={{ width: "100%", padding: "9px 12px", fontSize: 13, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, outline: "none", boxSizing: "border-box" }} />
              </div>
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, color: T.text3, marginBottom: 3 }}>Status</div>
                <select value={editBudgetForm.status} onChange={e => setEditBudgetForm(f => ({ ...f, status: e.target.value }))}
                  style={{ width: "100%", padding: "9px 12px", fontSize: 13, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, outline: "none", boxSizing: "border-box" }}>
                  <option value="draft">Draft</option>
                  <option value="active">Active</option>
                  <option value="approved">Approved</option>
                  <option value="archived">Archived</option>
                </select>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "space-between" }}>
              <button onClick={() => { deleteBudget(editingBudget.id); setEditingBudget(null); }} style={{ padding: "8px 14px", fontSize: 12, background: "#ef444415", border: `1px solid #ef444440`, borderRadius: 8, color: "#ef4444", cursor: "pointer", fontWeight: 600 }}>Delete Budget</button>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setEditingBudget(null)} style={{ padding: "8px 14px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text3, cursor: "pointer" }}>Cancel</button>
                <button onClick={updateBudget} disabled={!editBudgetForm.name.trim()} style={{ padding: "8px 16px", fontSize: 12, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", opacity: editBudgetForm.name.trim() ? 1 : 0.4 }}>Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Share / Members modal */}
      {showShare && (() => {
        const budget = finBudgets.find(b => b.id === showShare);
        const bMembers = budgetMembers.filter(m => m.budget_id === showShare);
        const memberIds = new Set(bMembers.map(m => m.user_id));
        const available = orgProfiles.filter(p => !memberIds.has(p.id));
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowShare(null)}>
            <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: 14, padding: 24, width: "min(460px, 90vw)", maxHeight: "70vh", overflow: "auto" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 4 }}>👥 Share Budget</div>
              <div style={{ fontSize: 12, color: T.text3, marginBottom: 14 }}>{budget?.name}</div>

              {/* Current members */}
              <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", marginBottom: 6 }}>Members ({bMembers.length})</div>
              {bMembers.map(m => (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${T.border}08` }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: T.accent + "20", color: T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700 }}>{ini(m.user_id)}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{uname(m.user_id)}</div>
                    <div style={{ fontSize: 10, color: T.text3 }}>{orgProfiles.find(p => p.id === m.user_id)?.email}</div>
                  </div>
                  <select value={m.role} onChange={e => updateBudgetMemberRole(m.id, e.target.value)}
                    style={{ fontSize: 10, padding: "3px 6px", borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface2, color: T.text2 }}>
                    <option value="viewer">Viewer</option>
                    <option value="editor">Editor</option>
                    <option value="owner">Owner</option>
                  </select>
                  {m.user_id !== user?.id && <button onClick={() => removeBudgetMember(m.id)} style={{ background: "none", border: "none", cursor: "pointer", color: T.text3, fontSize: 12 }}>✕</button>}
                </div>
              ))}

              {/* Add members */}
              {available.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", marginBottom: 6 }}>Add People</div>
                  <div style={{ maxHeight: 180, overflow: "auto" }}>
                    {available.map(p => (
                      <div key={p.id} onClick={() => shareBudget(showShare, p.id, "viewer")}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 8px", borderRadius: 6, cursor: "pointer" }}
                        onMouseEnter={e => e.currentTarget.style.background = T.surface2} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <div style={{ width: 26, height: 26, borderRadius: "50%", background: T.surface3, color: T.text3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700 }}>{ini(p.id)}</div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 500, color: T.text }}>{p.display_name || p.email}</div>
                          {p.display_name && <div style={{ fontSize: 10, color: T.text3 }}>{p.email}</div>}
                        </div>
                        <span style={{ fontSize: 11, color: T.accent, fontWeight: 600 }}>+ Add</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 14 }}>
                <button onClick={() => setShowShare(null)} style={{ padding: "8px 16px", fontSize: 12, fontWeight: 600, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text2, cursor: "pointer" }}>Done</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DEPARTMENTS VIEW — CRUD with hierarchy
// ═══════════════════════════════════════════════════════════════════════════════
function DepartmentsView({ isMobile, departments, setDepartments, members, requests, getDeptSpend }) {
  const [showNew, setShowNew] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name: "", color: "#3B82F6", parent_id: null });
  const COLORS = ["#7C3AED","#0EA5E9","#F59E0B","#10B981","#EC4899","#EF4444","#8B5CF6","#14B8A6","#F97316","#6366F1"];

  const save = async () => {
    if (!form.name.trim()) return;
    if (editing) {
      await supabase.from("af_departments").update({ name: form.name, color: form.color, parent_id: form.parent_id }).eq("id", editing.id);
      setDepartments(p => p.map(d => d.id === editing.id ? { ...d, ...form } : d));
    } else {
      const { data } = await supabase.from("af_departments").insert({ name: form.name, color: form.color, parent_id: form.parent_id }).select().single();
      if (data) setDepartments(p => [...p, data]);
    }
    setShowNew(false); setEditing(null); setForm({ name: "", color: "#3B82F6", parent_id: null });
  };

  const remove = async (d) => {
    if (!window.confirm(`Delete "${d.name}"?`)) return;
    // Also delete sub-departments
    const subIds = departments.filter(s => s.parent_id === d.id).map(s => s.id);
    for (const sid of subIds) await supabase.from("af_departments").delete().eq("id", sid);
    await supabase.from("af_departments").delete().eq("id", d.id);
    setDepartments(p => p.filter(x => x.id !== d.id && x.parent_id !== d.id));
  };

  const topLevel = departments.filter(d => !d.parent_id);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>Departments</div>
          <div style={{ fontSize: 12, color: T.text3 }}>{topLevel.length} departments · {departments.length - topLevel.length} sub-departments</div>
        </div>
        <button onClick={() => { setForm({ name: "", color: "#3B82F6", parent_id: null }); setEditing(null); setShowNew(true); }}
          style={{ padding: "8px 16px", fontSize: 12, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>+ New Department</button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
        {topLevel.map(d => {
          const { approved: spent, pending: pend } = getDeptSpend(d.name);
          const subs = departments.filter(s => s.parent_id === d.id);
          const headcount = members.filter(m => m.department === d.name).length;
          return (
            <Card key={d.id} style={{ borderLeft: `4px solid ${d.color || T.accent}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>{d.name}</div>
                  <div style={{ fontSize: 11, color: T.text3 }}>{headcount} people{subs.length > 0 ? ` · ${subs.length} sub-depts` : ""}</div>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={() => { setForm({ name: "", color: d.color, parent_id: d.id }); setEditing(null); setShowNew(true); }}
                    style={{ padding: "4px 8px", fontSize: 10, background: "#F0FDF4", border: "none", borderRadius: 6, color: "#16A34A", cursor: "pointer", fontWeight: 700 }}>+ Sub</button>
                  <button onClick={() => { setForm({ name: d.name, color: d.color, parent_id: d.parent_id }); setEditing(d); setShowNew(true); }}
                    style={{ padding: "4px 8px", fontSize: 10, background: T.surface2, border: "none", borderRadius: 6, color: T.accent, cursor: "pointer", fontWeight: 700 }}>✎</button>
                  <button onClick={() => remove(d)}
                    style={{ padding: "4px 8px", fontSize: 10, background: "#FEE2E2", border: "none", borderRadius: 6, color: "#DC2626", cursor: "pointer", fontWeight: 700 }}>✕</button>
                </div>
              </div>
              <div style={{ display: "flex", gap: 16, fontSize: 11, color: T.text3 }}>
                <span>Spent: <strong style={{ color: "#10B981" }}>{fmt(spent)}</strong></span>
                <span>Pending: <strong style={{ color: "#F59E0B" }}>{fmt(pend)}</strong></span>
              </div>
              {subs.map(s => {
                const { approved: sSp } = getDeptSpend(s.name);
                return <div key={s.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingLeft: 16, marginTop: 6, fontSize: 12, color: T.text2 }}>
                  <span>↳ {s.name}</span>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: T.text3 }}>{fmt(sSp)}</span>
                    <button onClick={() => remove(s)} style={{ background: "none", border: "none", color: "#EF4444", cursor: "pointer", fontSize: 10, fontWeight: 700 }}>✕</button>
                  </div>
                </div>;
              })}
            </Card>
          );
        })}
      </div>

      {/* New/Edit modal */}
      {showNew && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowNew(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: 14, padding: 24, width: "min(400px, 90vw)" }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 14 }}>{editing ? `Edit ${editing.name}` : form.parent_id ? "Add Sub-department" : "New Department"}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <div>
                <div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Name *</div>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder={form.parent_id ? "e.g. Paid Social" : "e.g. Marketing"}
                  style={{ width: "100%", padding: "8px 12px", fontSize: 13, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, outline: "none", boxSizing: "border-box" }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 6 }}>Color</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {COLORS.map(c => <div key={c} onClick={() => setForm(f => ({ ...f, color: c }))} style={{ width: 28, height: 28, borderRadius: "50%", background: c, cursor: "pointer", border: form.color === c ? `3px solid ${T.text}` : "3px solid transparent" }} />)}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => { setShowNew(false); setEditing(null); }} style={{ padding: "8px 14px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text3, cursor: "pointer" }}>Cancel</button>
                <button onClick={save} disabled={!form.name.trim()} style={{ padding: "8px 14px", fontSize: 12, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>{editing ? "Save" : "Add"}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// RULES ENGINE — IF/THEN approval routing
// ═══════════════════════════════════════════════════════════════════════════════
function RulesView({ isMobile, rules, setRules, glCodes, members, user }) {
  const [showNew, setShowNew] = useState(false);
  const FORM_DEFAULT = { name: "", description: "", action: "require_manager", conditions: [{ field: "amount", operator: ">", value: "", join: null }] };
  const [form, setForm] = useState(FORM_DEFAULT);

  const addCond = () => setForm(f => ({ ...f, conditions: [...f.conditions, { field: "amount", operator: ">", value: "", join: "AND" }] }));
  const updCond = (i, k, v) => setForm(f => { const c = [...f.conditions]; c[i] = { ...c[i], [k]: v }; return { ...f, conditions: c }; });
  const remCond = i => setForm(f => ({ ...f, conditions: f.conditions.filter((_, idx) => idx !== i) }));

  const saveRule = async () => {
    if (!form.name.trim()) return;
    const payload = { name: form.name, description: form.description, action: form.action, conditions: form.conditions, is_active: true, sort_order: rules.length, created_by: user?.id };
    const { data } = await supabase.from("af_rules").insert(payload).select().single();
    if (data) setRules(p => [...p, data]);
    setShowNew(false); setForm(FORM_DEFAULT);
  };

  const toggleRule = async (id) => {
    const rule = rules.find(r => r.id === id);
    if (!rule) return;
    await supabase.from("af_rules").update({ is_active: !rule.is_active }).eq("id", id);
    setRules(p => p.map(r => r.id === id ? { ...r, is_active: !r.is_active } : r));
  };

  const deleteRule = async (id) => {
    await supabase.from("af_rules").delete().eq("id", id);
    setRules(p => p.filter(r => r.id !== id));
  };

  const ACTION_LABELS = { require_manager: "Require Manager", require_cfo: "Require CFO", require_cmo: "Require CMO", require_person: "Require Specific Person", auto_approve: "Auto-Approve", block: "Block Request" };
  const FIELD_LABELS = { amount: "Amount ($)", gl: "GL Code", department: "Department" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>Approval Rules Engine</div>
          <div style={{ fontSize: 12, color: T.text3 }}>IF → THEN logic for automated approval routing</div>
        </div>
        <button onClick={() => setShowNew(true)} style={{ padding: "8px 16px", fontSize: 12, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>+ New Rule</button>
      </div>

      <div style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 10, padding: "10px 14px", fontSize: 12, color: T.text3 }}>
        Rules evaluate top-to-bottom on every request. First match wins. Conditions support AND / OR chaining.
      </div>

      {rules.map((rule, idx) => (
        <Card key={rule.id} style={{ opacity: rule.is_active ? 1 : 0.5 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <span style={{ background: T.accent, color: "#fff", borderRadius: 4, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>Rule {idx + 1}</span>
                <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{rule.name}</span>
                {!rule.is_active && <span style={{ fontSize: 10, color: T.text3 }}>DISABLED</span>}
              </div>
              <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: T.text3 }}>IF</span>
                {(rule.conditions || []).map((cond, ci) => (
                  <span key={ci} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    {ci > 0 && <span style={{ fontSize: 10, fontWeight: 700, color: "#7C3AED", background: "#EDE9FE", padding: "2px 6px", borderRadius: 4 }}>{cond.join}</span>}
                    <span style={{ background: T.surface2, padding: "3px 8px", borderRadius: 6, fontSize: 11 }}>
                      {FIELD_LABELS[cond.field] || cond.field} {cond.operator} {cond.value}
                    </span>
                  </span>
                ))}
                <span style={{ fontSize: 11, fontWeight: 600, color: T.text3 }}>→ THEN</span>
                <span style={{ background: T.accent, color: "#fff", padding: "3px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600 }}>{ACTION_LABELS[rule.action] || rule.action}</span>
              </div>
              {rule.description && <div style={{ fontSize: 11, color: T.text3 }}>{rule.description}</div>}
            </div>
            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button onClick={() => toggleRule(rule.id)} style={{ padding: "5px 10px", fontSize: 11, border: `1px solid ${T.border}`, borderRadius: 6, background: rule.is_active ? T.surface2 : "#D1FAE5", color: rule.is_active ? T.text3 : "#065F46", cursor: "pointer", fontWeight: 600 }}>{rule.is_active ? "Disable" : "Enable"}</button>
              <button onClick={() => deleteRule(rule.id)} style={{ padding: "5px 8px", fontSize: 11, border: "1px solid #ef444440", borderRadius: 6, background: "transparent", color: "#EF4444", cursor: "pointer" }}>✕</button>
            </div>
          </div>
        </Card>
      ))}

      {/* New rule modal */}
      {showNew && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={() => setShowNew(false)}>
          <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: 16, padding: 24, width: "min(600px, 95vw)", maxHeight: "80vh", overflow: "auto" }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 16 }}>New Approval Rule</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Rule Name *</div>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. High Value Auto-Escalate"
                  style={{ width: "100%", padding: "8px 12px", fontSize: 13, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, outline: "none", boxSizing: "border-box" }} />
              </div>
              <div>
                <div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Description</div>
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Explain when this fires…"
                  style={{ width: "100%", padding: "8px 12px", fontSize: 13, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, outline: "none", boxSizing: "border-box" }} />
              </div>

              {/* Conditions */}
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 8 }}>Conditions (IF)</div>
                {form.conditions.map((cond, idx) => (
                  <div key={idx} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
                    {idx > 0 && <select value={cond.join} onChange={e => updCond(idx, "join", e.target.value)} style={{ padding: "6px 8px", border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 12, background: "#EDE9FE", color: "#5B21B6", fontWeight: 700, width: 60 }}><option value="AND">AND</option><option value="OR">OR</option></select>}
                    <select value={cond.field} onChange={e => updCond(idx, "field", e.target.value)} style={{ padding: "6px 8px", border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 12, background: T.surface2, color: T.text }}>
                      <option value="amount">Amount ($)</option><option value="gl">GL Code</option><option value="department">Department</option>
                    </select>
                    {cond.field === "amount" && <select value={cond.operator} onChange={e => updCond(idx, "operator", e.target.value)} style={{ padding: "6px 6px", border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 12, width: 50, background: T.surface2, color: T.text }}>
                      {["==","!=",">","<",">=","<="].map(op => <option key={op} value={op}>{op}</option>)}
                    </select>}
                    <input value={cond.value} onChange={e => updCond(idx, "value", e.target.value)} placeholder="Value…"
                      style={{ flex: 1, padding: "6px 10px", border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 12, background: T.surface2, color: T.text, outline: "none" }} />
                    {form.conditions.length > 1 && <button onClick={() => remCond(idx)} style={{ background: "#FEE2E2", border: "none", borderRadius: 6, padding: "6px 8px", cursor: "pointer", color: "#991B1B", fontSize: 10, fontWeight: 700 }}>✕</button>}
                  </div>
                ))}
                <button onClick={addCond} style={{ fontSize: 12, color: T.text3, background: "none", border: `1px dashed ${T.border}`, borderRadius: 6, padding: "6px 12px", cursor: "pointer" }}>+ Add Condition</button>
              </div>

              {/* Action */}
              <div>
                <div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Action (THEN)</div>
                <select value={form.action} onChange={e => setForm(f => ({ ...f, action: e.target.value }))}
                  style={{ width: "100%", padding: "8px 12px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, cursor: "pointer", boxSizing: "border-box" }}>
                  {Object.entries(ACTION_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>

              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                <button onClick={() => setShowNew(false)} style={{ padding: "8px 14px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text3, cursor: "pointer" }}>Cancel</button>
                <button onClick={saveRule} disabled={!form.name.trim() || form.conditions.some(c => !c.value)} style={{ padding: "8px 14px", fontSize: 12, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>Save Rule</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORTS VIEW — Spend analysis
// ═══════════════════════════════════════════════════════════════════════════════
function ReportsView({ isMobile, requests, members, departments, glCodes, glCategories }) {
  const approved = requests.filter(r => r.status === "approved");
  const totalApproved = approved.reduce((s, r) => s + r.amount, 0);
  const totalPending = requests.filter(r => r.status === "pending").reduce((s, r) => s + r.amount, 0);
  const approvalRate = requests.length > 0 ? Math.round((approved.length / requests.length) * 100) : 0;

  const byGL = glCodes.map(gl => ({
    ...gl,
    count: requests.filter(r => r.gl_code === gl.code).length,
    approved: approved.filter(r => r.gl_code === gl.code).reduce((s, r) => s + r.amount, 0),
    pending: requests.filter(r => r.gl_code === gl.code && r.status === "pending").reduce((s, r) => s + r.amount, 0),
    rejected: requests.filter(r => r.gl_code === gl.code && r.status === "rejected").length,
  })).filter(g => g.count > 0).sort((a, b) => b.approved - a.approved);

  const byDept = departments.filter(d => !d.parent_id).map(d => ({
    ...d,
    count: requests.filter(r => r.department === d.name).length,
    approved: approved.filter(r => r.department === d.name).reduce((s, r) => s + r.amount, 0),
  })).filter(d => d.count > 0).sort((a, b) => b.approved - a.approved);

  const exportCSV = () => {
    const rows = [["GL Code","Category","Requests","Approved","Pending","Rejected"]];
    byGL.forEach(gl => rows.push([gl.code, gl.name, gl.count, gl.approved, gl.pending, gl.rejected]));
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "spend-report.csv"; a.click();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>Spend Reports</div>
        <button onClick={exportCSV} style={{ padding: "7px 14px", fontSize: 12, fontWeight: 600, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text2, cursor: "pointer" }}>↓ Export CSV</button>
      </div>

      {/* KPI row */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 10 }}>
        {[
          { l: "Total Approved", v: fmt(totalApproved), c: "#10B981" },
          { l: "Pending Value", v: fmt(totalPending), c: "#F59E0B" },
          { l: "Approval Rate", v: `${approvalRate}%`, c: T.accent },
        ].map(s => (
          <Card key={s.l} style={{ textAlign: "center" }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: s.c }}>{s.v}</div>
            <div style={{ fontSize: 12, color: T.text3, marginTop: 4 }}>{s.l}</div>
          </Card>
        ))}
      </div>

      {/* By department + By GL side by side */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
        <Card>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 14 }}>Spend by Department</div>
          {byDept.length === 0 ? <div style={{ fontSize: 12, color: T.text3 }}>No spend data yet</div> :
            byDept.map(d => {
              const maxAmt = byDept[0].approved || 1;
              return (
                <div key={d.id} style={{ marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: "50%", background: d.color || T.accent }} />
                      <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{d.name}</span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{fmt(d.approved)}</span>
                  </div>
                  <ProgressBar value={d.approved} max={maxAmt} color={d.color || T.accent} height={5} />
                </div>
              );
            })
          }
        </Card>

        <Card>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 14 }}>Spend by GL Category</div>
          {byGL.length === 0 ? <div style={{ fontSize: 12, color: T.text3 }}>No spend data yet</div> :
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: `2px solid ${T.border}` }}>
                  {["GL","Category","#","Approved","Pending"].map(h => <th key={h} style={{ textAlign: "left", padding: "6px 8px", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase" }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {byGL.slice(0, 12).map(gl => (
                  <tr key={gl.code} style={{ borderBottom: `1px solid ${T.border}` }}>
                    <td style={{ padding: "6px 8px", color: T.text3, fontWeight: 600, fontSize: 11 }}>{gl.code}</td>
                    <td style={{ padding: "6px 8px", fontWeight: 600, color: T.text }}>{gl.name}</td>
                    <td style={{ padding: "6px 8px", color: T.text3 }}>{gl.count}</td>
                    <td style={{ padding: "6px 8px", fontWeight: 700, color: "#10B981" }}>{fmt(gl.approved)}</td>
                    <td style={{ padding: "6px 8px", fontWeight: 700, color: "#F59E0B" }}>{fmt(gl.pending)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        </Card>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// AUDIT LOG VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function AuditLogView({ isMobile, auditLog }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>Audit Log</div>
      {auditLog.length === 0 ? <div style={{ color: T.text3, fontSize: 13, padding: 20 }}>No audit events yet</div> :
        auditLog.map(log => (
          <div key={log.id} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "10px 0", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: log.action.includes("approved") ? "#D1FAE5" : log.action.includes("rejected") ? "#FEE2E2" : T.surface2, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0, color: T.text3 }}>
              {log.action.includes("approved") ? "✓" : log.action.includes("rejected") ? "✗" : "·"}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{log.action}</div>
              {log.detail && <div style={{ fontSize: 12, color: T.text3, marginTop: 2 }}>{log.detail}</div>}
            </div>
            <div style={{ textAlign: "right", flexShrink: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.text2 }}>{log.user_name}</div>
              <div style={{ fontSize: 10, color: T.text3 }}>{new Date(log.created_at).toLocaleString()}</div>
            </div>
          </div>
        ))
      }
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
// VENDOR SPEND VIEW — January 2026 closed book detail
// ═══════════════════════════════════════════════════════════════════════════════
function VendorSpendView({ isMobile, glCodes, glCategories, departments }) {
  const { orgId } = useAuth();
  const T = typeof window !== "undefined" && document.body.dataset.theme === "dark"
    ? { bg:"#0a0a0f",surface:"#13131a",surface2:"#1a1a24",surface3:"#22222e",text:"#e8e8f0",text2:"#b0b0c0",text3:"#6b6b80",border:"#2a2a3a",accent:"#6366f1",accentDim:"#6366f115" }
    : { bg:"#f8f9fc",surface:"#ffffff",surface2:"#f4f5f8",surface3:"#ecedf2",text:"#1a1a2e",text2:"#4a4a5e",text3:"#8a8a9e",border:"#e2e3e8",accent:"#6366f1",accentDim:"#6366f110" };
  const fmt = n => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
  const fmtD = n => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 }).format(n);

  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subView, setSubView] = useState("summary"); // summary, vendors, gl_map, by_team
  const [search, setSearch] = useState("");
  const [gaFilter, setGaFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("Actual"); // Actual or Budget
  const [editingTeam, setEditingTeam] = useState(null);
  const [editingGA, setEditingGA] = useState(null);
  const [sortBy, setSortBy] = useState("total");
  const [sortDir, setSortDir] = useState("desc");

  const TEAMS = ["Sales","Executive","Customer Success","Creative","Marketing","Tech & Data","Administrative","Finance","Legal","People Ops","Impact","R&D / Product","Operations","Manufacturing","Unassigned"];
  const GA_CATS = ["People Costs","Direct Ad Spend","Brand/Other/Marketing","Consultants","Non-Fixed and Other","Software and Subscriptions","T&E","R&D","Insurance","Legal","COGS"];
  const GA_COLORS = { "People Costs":"#8B5CF6", "Direct Ad Spend":"#EF4444", "Brand/Other/Marketing":"#F59E0B", "Consultants":"#3B82F6", "Non-Fixed and Other":"#6B7280", "Software and Subscriptions":"#10B981", "T&E":"#EC4899", "R&D":"#06B6D4", "Insurance":"#14B8A6", "Legal":"#A855F7", "COGS":"#EC4899", "Unmatched":"#9CA3AF" };

  // QBO P&L data
  const [qboPL, setQboPL] = useState([]);
  const [qboBills, setQboBills] = useState([]);
  const [customMappings, setCustomMappings] = useState({});
  const [expandedAccount, setExpandedAccount] = useState(null);

  // Auto-map QBO P&L account names to GA categories
  const QBO_GA_MAP = {
    "Direct Ad Spend": ["Social Media Ads","Google Ads","TV Ads","Walmart Product Advertising","Affiliate Programs","Amazon Ads","TikTok Ads"],
    "People Costs": ["Executives","Marketing","Operations SG&A","R&D/Product","Sales","Customer Delight","Payroll Taxes","Benefits","401k","Workers Comp","Stock Compensation","Impact Team","Tech & Data","Warehouse Employees"],
    "Brand/Other/Marketing": ["Sampling","Film Production","Influencer Marketing","PR","Creative Services","Ad & Mktg Consultants","Brand Partnerships"],
    "Consultants": ["Consulting Services","Accounting"],
    "Software and Subscriptions": ["Software & Subscriptions"],
    "T&E": ["Meals and Entertainment","Team Building","Airfare","Hotel","Ground Transportation","Office Supplies","Employee Perks"],
    "R&D": ["R&D"],
    "Insurance": ["Insurance"],
    "Legal": ["Legal Fees"],
    "COGS": ["Sold Product","Freight Out","Merchant Processing","Amazon FBA","Amazon Processing","Shipping Materials","Warehouse Employees","Utilities","Storage & Warehouse","Rent","In Kind Donations"],
    "Non-Fixed and Other": ["Misc Supplies","Depreciation","Bank Charges","Rent & Lease","Taxes","Postage"],
  };
  const mapToGA = (accountName) => {
    // Check custom mappings first
    if (customMappings[accountName]) return customMappings[accountName];
    const lower = (accountName || "").toLowerCase();
    for (const [cat, keywords] of Object.entries(QBO_GA_MAP)) {
      for (const kw of keywords) {
        if (lower.includes(kw.toLowerCase())) return cat;
      }
    }
    return null;
  };

  const assignCategory = async (accountName, category) => {
    setCustomMappings(p => ({ ...p, [accountName]: category }));
    await supabase.from("qbo_category_mappings").upsert({ org_id: orgId, account_name: accountName, ga_category: category }, { onConflict: "org_id,account_name" });
  };

  // Load seed data
  useEffect(() => {
    (async () => {
      try {
        // Try DB first
        const { data: dbData } = await supabase.from("fin_vendor_spend").select("*").eq("period", "2026-01").limit(1);
        if (dbData && dbData.length > 0) {
          const { data: all } = await supabase.from("fin_vendor_spend").select("*").eq("period", "2026-01");
          setData(all || []);
        } else {
          // Seed from JSON
          const res = await fetch("/vendor_spend_seed.json");
          const seed = await res.json();
          const rows = seed.map(r => ({
            period: r.p, vendor_name: r.v, gl_account: r.g, gl_description: r.d,
            amount: r.a, budget_or_actual: r.b, ga_category: r.c, team: r.t
          }));
          setData(rows);
          for (let i = 0; i < rows.length; i += 100) {
            supabase.from("fin_vendor_spend").insert(rows.slice(i, i + 100).map(r => ({ ...r, org_id: orgId }))).then(() => {});
          }
        }
        // Load QBO P&L and Bills
        const [{ data: pl }, { data: bills }] = await Promise.all([
          supabase.from("qbo_pl").select("*").order("account_type, account_name"),
          supabase.from("qbo_bills").select("*").eq("org_id", orgId).order("txn_date", { ascending: false }),
        ]);
        setQboPL(pl || []);
        setQboBills(bills || []);
        // Load custom category mappings
        const { data: maps } = await supabase.from("qbo_category_mappings").select("*").eq("org_id", orgId);
        if (maps) {
          const m = {};
          maps.forEach(r => { m[r.account_name] = r.ga_category; });
          setCustomMappings(m);
        }
      } catch (e) { console.error("Vendor spend load error:", e); }
      setLoading(false);
    })();
  }, []);

  // Filtered data
  const filtered = data.filter(r => {
    if (typeFilter !== "all" && r.budget_or_actual !== typeFilter) return false;
    if (gaFilter !== "all" && r.ga_category !== gaFilter) return false;
    if (teamFilter !== "all" && r.team !== teamFilter) return false;
    if (search && !r.vendor_name?.toLowerCase().includes(search.toLowerCase()) && !r.gl_description?.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  // Aggregations
  const byVendor = {};
  filtered.forEach(r => {
    if (!byVendor[r.vendor_name]) byVendor[r.vendor_name] = { name: r.vendor_name, total: 0, ga: new Set(), teams: new Set(), accounts: new Set(), count: 0 };
    byVendor[r.vendor_name].total += r.amount;
    byVendor[r.vendor_name].ga.add(r.ga_category);
    byVendor[r.vendor_name].teams.add(r.team);
    byVendor[r.vendor_name].accounts.add(r.gl_account);
    byVendor[r.vendor_name].count++;
  });
  let vendorList = Object.values(byVendor);
  if (sortBy === "total") vendorList.sort((a, b) => sortDir === "desc" ? b.total - a.total : a.total - b.total);
  else if (sortBy === "name") vendorList.sort((a, b) => sortDir === "desc" ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name));

  const byGA = {};
  filtered.forEach(r => {
    if (!byGA[r.ga_category]) byGA[r.ga_category] = { cat: r.ga_category, total: 0, vendors: new Set() };
    byGA[r.ga_category].total += r.amount;
    byGA[r.ga_category].vendors.add(r.vendor_name);
  });
  const gaList = Object.values(byGA).sort((a, b) => b.total - a.total);

  const byTeam = {};
  filtered.forEach(r => {
    if (!byTeam[r.team]) byTeam[r.team] = { team: r.team, total: 0, vendors: new Set(), ga: new Set() };
    byTeam[r.team].total += r.amount;
    byTeam[r.team].vendors.add(r.vendor_name);
    byTeam[r.team].ga.add(r.ga_category);
  });
  const teamList = Object.values(byTeam).sort((a, b) => b.total - a.total);

  const totalSpend = filtered.reduce((s, r) => s + r.amount, 0);
  const actualTotal = data.filter(r => r.budget_or_actual === "Actual").reduce((s, r) => s + r.amount, 0);
  const budgetTotal = data.filter(r => r.budget_or_actual === "Budget").reduce((s, r) => s + r.amount, 0);
  const variance = actualTotal - budgetTotal;

  // Edit team for a vendor
  const updateVendorTeam = async (vendorName, newTeam) => {
    setData(p => p.map(r => r.vendor_name === vendorName ? { ...r, team: newTeam } : r));
    await supabase.from("fin_vendor_spend").update({ team: newTeam }).eq("vendor_name", vendorName).eq("period", "2026-01");
    setEditingTeam(null);
  };

  // Edit G&A category for a vendor
  const updateVendorGA = async (vendorName, newGA) => {
    setData(p => p.map(r => r.vendor_name === vendorName ? { ...r, ga_category: newGA } : r));
    await supabase.from("fin_vendor_spend").update({ ga_category: newGA }).eq("vendor_name", vendorName).eq("period", "2026-01");
    setEditingGA(null);
  };

  if (loading) return <div style={{ padding: 40, textAlign: "center", color: T.text3 }}>Loading vendor spend data…</div>;

  return (
    <div style={{ padding: isMobile ? 12 : 20 }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>January 2026 — Vendor Spend</div>
        <div style={{ fontSize: 12, color: T.text3 }}>Closed book detail · {data.length} line items · {Object.keys(byVendor).length} vendors · Linked to GL & Approval System</div>
      </div>

      {/* KPI Row */}
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
        {[
          { l: "Actual Spend", v: fmt(actualTotal), c: T.accent },
          { l: "Budget", v: fmt(budgetTotal), c: "#F59E0B" },
          { l: "Variance", v: (variance >= 0 ? "+" : "") + fmt(variance), c: variance > 0 ? "#EF4444" : "#10B981" },
          { l: "Vendors", v: vendorList.length, c: "#3B82F6" },
          { l: "G&A Categories", v: gaList.length, c: "#8B5CF6" },
        ].map(s => (
          <div key={s.l} style={{ textAlign: "center", padding: 12, background: T.surface2, borderRadius: 10, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: s.c }}>{s.v}</div>
            <div style={{ fontSize: 10, color: T.text3, fontWeight: 600 }}>{s.l}</div>
          </div>
        ))}
      </div>

      {/* Filters + Sub-nav */}
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12, alignItems: "center" }}>
        {[["summary","📊 Summary"],["qbo_actuals","📒 QBO Actuals"],["vendors","🏢 By Vendor"],["by_team","👥 By Team"],["gl_map","📒 GL Mapping"]].map(([k,l]) => (
          <button key={k} onClick={() => setSubView(k)} style={{ padding: "6px 14px", borderRadius: 8, background: subView === k ? T.accent : T.surface2, color: subView === k ? "#fff" : T.text3, border: `1px solid ${subView === k ? T.accent : T.border}`, fontSize: 12, fontWeight: subView === k ? 700 : 500, cursor: "pointer" }}>{l}</button>
        ))}
        <div style={{ flex: 1 }} />
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} style={{ padding: "5px 8px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 11 }}>
          <option value="Actual">Actuals Only</option>
          <option value="Budget">Budget Only</option>
          <option value="all">All (A+B)</option>
        </select>
        <select value={gaFilter} onChange={e => setGaFilter(e.target.value)} style={{ padding: "5px 8px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 11 }}>
          <option value="all">All G&A Categories</option>
          {GA_CATS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select value={teamFilter} onChange={e => setTeamFilter(e.target.value)} style={{ padding: "5px 8px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 11 }}>
          <option value="all">All Teams</option>
          {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vendors…" style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 11, width: 160 }} />
      </div>

      {/* SUMMARY VIEW */}
      {subView === "summary" && (
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 16 }}>
          {/* G&A Breakdown */}
          <div style={{ background: T.surface, borderRadius: 12, border: `1px solid ${T.border}`, padding: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 12 }}>Spend by G&A Category</div>
            {gaList.map(g => {
              const pct = totalSpend > 0 ? (g.total / totalSpend * 100) : 0;
              return (
                <div key={g.cat} style={{ marginBottom: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                    <span style={{ fontWeight: 600, color: T.text }}>{g.cat}</span>
                    <span style={{ fontWeight: 700, color: GA_COLORS[g.cat] || T.text }}>{fmt(g.total)} <span style={{ fontSize: 10, color: T.text3 }}>({pct.toFixed(1)}%)</span></span>
                  </div>
                  <div style={{ height: 6, background: T.surface3, borderRadius: 3 }}>
                    <div style={{ height: 6, borderRadius: 3, background: GA_COLORS[g.cat] || T.accent, width: `${pct}%`, transition: "width 0.3s" }} />
                  </div>
                  <div style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>{g.vendors.size} vendors</div>
                </div>
              );
            })}
          </div>
          {/* Top 20 Vendors */}
          <div style={{ background: T.surface, borderRadius: 12, border: `1px solid ${T.border}`, padding: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 12 }}>Top 20 Vendors</div>
            {vendorList.slice(0, 20).map((v, i) => (
              <div key={v.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: `1px solid ${T.border}20`, fontSize: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: T.text3, width: 20 }}>{i + 1}</span>
                  <span style={{ fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.name}</span>
                </div>
                <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                  {[...v.ga].slice(0, 2).map(g => <span key={g} style={{ fontSize: 8, padding: "1px 4px", borderRadius: 3, background: (GA_COLORS[g] || "#666") + "15", color: GA_COLORS[g] || "#666", fontWeight: 600 }}>{g.split("/")[0]}</span>)}
                  <span style={{ fontWeight: 700, color: T.text, fontFamily: "monospace", minWidth: 70, textAlign: "right" }}>{fmt(v.total)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* QBO ACTUALS — P&L mapped to budget categories */}
      {subView === "qbo_actuals" && (() => {
        const plExpenses = qboPL.filter(r => r.classification === "Expense");
        const mapped = plExpenses.map(r => ({ ...r, ga_category: mapToGA(r.account_name) }));
        const matched = mapped.filter(r => r.ga_category);
        const unmatched = mapped.filter(r => !r.ga_category);
        const byCategory = {};
        matched.forEach(r => {
          if (!byCategory[r.ga_category]) byCategory[r.ga_category] = { items: [], total: 0 };
          byCategory[r.ga_category].items.push(r);
          byCategory[r.ga_category].total += Number(r.amount) || 0;
        });
        const catList = Object.entries(byCategory).sort((a, b) => b[1].total - a[1].total);
        const matchedTotal = matched.reduce((s, r) => s + Number(r.amount || 0), 0);
        const unmatchedTotal = unmatched.reduce((s, r) => s + Number(r.amount || 0), 0);
        const qboTotal = plExpenses.reduce((s, r) => s + Number(r.amount || 0), 0);

        return (
          <div>
            {qboPL.length === 0 ? (
              <div style={{ textAlign: "center", padding: 40, color: T.text3 }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>📒</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>No QBO P&L data</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>Sync QuickBooks in Settings → Integrations to see actuals here</div>
              </div>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 10, marginBottom: 16 }}>
                  <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: 12, textAlign: "center" }}><div style={{ fontSize: 18, fontWeight: 900, color: "#F59E0B" }}>{fmt(qboTotal)}</div><div style={{ fontSize: 10, color: T.text3 }}>Total QBO Expenses</div></div>
                  <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: 12, textAlign: "center" }}><div style={{ fontSize: 18, fontWeight: 900, color: "#10B981" }}>{fmt(matchedTotal)}</div><div style={{ fontSize: 10, color: T.text3 }}>Matched ({matched.length} items)</div></div>
                  <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: 12, textAlign: "center" }}><div style={{ fontSize: 18, fontWeight: 900, color: unmatched.length > 0 ? "#EF4444" : T.text3 }}>{fmt(unmatchedTotal)}</div><div style={{ fontSize: 10, color: T.text3 }}>Unmatched ({unmatched.length} items)</div></div>
                  <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: 12, textAlign: "center" }}><div style={{ fontSize: 18, fontWeight: 900, color: T.accent }}>{catList.length}</div><div style={{ fontSize: 10, color: T.text3 }}>Budget Categories</div></div>
                </div>

                {/* Matched by category */}
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 8 }}>Spend by Budget Category (from QBO P&L)</div>
                {catList.map(([cat, { items, total }]) => {
                  const pct = qboTotal > 0 ? (total / qboTotal) * 100 : 0;
                  return (
                    <div key={cat} style={{ marginBottom: 12, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 8, height: 8, borderRadius: 4, background: GA_COLORS[cat] || T.text3 }} />
                          <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{cat}</span>
                          <span style={{ fontSize: 10, color: T.text3 }}>({items.length} accounts)</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{fmt(total)}</span>
                          <span style={{ fontSize: 10, color: T.text3 }}>{pct.toFixed(1)}%</span>
                        </div>
                      </div>
                      <div style={{ height: 6, borderRadius: 3, background: T.surface3, overflow: "hidden", marginBottom: 6 }}><div style={{ width: `${Math.min(pct, 100)}%`, height: "100%", background: GA_COLORS[cat] || T.text3, borderRadius: 3 }} /></div>
                      {items.sort((a, b) => Math.abs(Number(b.amount)) - Math.abs(Number(a.amount))).map(r => {
                        const isExpanded = expandedAccount === r.account_name;
                        // Find bills that hit this GL account (match by account name substring in gl_accounts field)
                        const acctNum = (r.account_name || "").split(" ")[0]; // e.g. "60210" from "60210 Social Media Ads"
                        const relatedBills = isExpanded ? qboBills.filter(b => b.gl_accounts && (b.gl_accounts.includes(r.account_name) || b.gl_accounts.includes(acctNum))) : [];
                        return (
                        <div key={r.account_name}>
                          <div onClick={() => setExpandedAccount(isExpanded ? null : r.account_name)} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", fontSize: 11, borderBottom: `1px solid ${T.border}10`, cursor: "pointer" }}
                            onMouseEnter={e => e.currentTarget.style.background = T.surface2} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                            <span style={{ color: T.text2 }}><span style={{ color: T.text3, fontSize: 9, marginRight: 4 }}>{isExpanded ? "▼" : "▶"}</span>{r.account_name}</span>
                            <span style={{ fontWeight: 600, color: T.text }}>{fmt(Number(r.amount))}</span>
                          </div>
                          {isExpanded && (
                            <div style={{ background: T.surface2, borderRadius: 6, padding: "8px 10px", marginBottom: 4, marginTop: 2 }}>
                              {relatedBills.length === 0 ? (
                                <div style={{ fontSize: 11, color: T.text3, fontStyle: "italic" }}>No bill-level detail available for this account. This is a P&L summary total from QuickBooks.</div>
                              ) : (
                                <>
                                  <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, marginBottom: 4 }}>BILLS HITTING THIS ACCOUNT ({relatedBills.length})</div>
                                  <div style={{ maxHeight: 200, overflow: "auto" }}>
                                    {relatedBills.slice(0, 50).map(b => (
                                      <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0", fontSize: 11, borderBottom: `1px solid ${T.border}10` }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                          <span style={{ fontWeight: 600, color: T.text }}>{b.vendor_name || "—"}</span>
                                          {b.memo && <span style={{ color: T.text3, marginLeft: 6, fontSize: 10 }}>— {b.memo.slice(0, 60)}</span>}
                                        </div>
                                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                                          <span style={{ fontSize: 10, color: T.text3 }}>{b.txn_date ? new Date(b.txn_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}</span>
                                          <span style={{ fontWeight: 600, color: T.text, minWidth: 60, textAlign: "right" }}>{fmt(Number(b.total_amount))}</span>
                                          <span style={{ fontSize: 8, fontWeight: 700, padding: "1px 4px", borderRadius: 3, background: b.payment_status === "paid" ? "#10B98118" : "#F59E0B18", color: b.payment_status === "paid" ? "#10B981" : "#F59E0B" }}>{b.payment_status === "paid" ? "PAID" : "OPEN"}</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                  {relatedBills.length > 50 && <div style={{ fontSize: 10, color: T.text3, marginTop: 4 }}>Showing 50 of {relatedBills.length} bills</div>}
                                </>
                              )}
                            </div>
                          )}
                        </div>
                        );
                      })}
                    </div>
                  );
                })}

                {/* Unmatched section */}
                {unmatched.length > 0 && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#EF4444", marginBottom: 8 }}>⚠ Unmatched Accounts — Assign a Category ({unmatched.length})</div>
                    <div style={{ background: T.surface, border: `1px solid #EF444430`, borderRadius: 8, padding: 12 }}>
                      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr auto auto", gap: 0 }}>
                        <div style={{ padding: "6px 8px", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", borderBottom: `2px solid ${T.border}` }}>Account</div>
                        {!isMobile && <div style={{ padding: "6px 8px", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", borderBottom: `2px solid ${T.border}`, textAlign: "right" }}>Amount</div>}
                        <div style={{ padding: "6px 8px", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", borderBottom: `2px solid ${T.border}`, textAlign: "right" }}>Category</div>
                      </div>
                      {unmatched.sort((a, b) => Math.abs(Number(b.amount)) - Math.abs(Number(a.amount))).map(r => {
                        const isExp = expandedAccount === r.account_name;
                        const acctNum = (r.account_name || "").split(" ")[0];
                        const relBills = isExp ? qboBills.filter(b => b.gl_accounts && (b.gl_accounts.includes(r.account_name) || b.gl_accounts.includes(acctNum))) : [];
                        return (
                        <div key={r.account_name}>
                          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr auto auto", gap: 0, alignItems: "center", borderBottom: `1px solid ${T.border}15` }}>
                            <div onClick={() => setExpandedAccount(isExp ? null : r.account_name)} style={{ padding: "6px 8px", cursor: "pointer" }}
                              onMouseEnter={e => e.currentTarget.style.background = T.surface2} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                              <span style={{ color: T.text3, fontSize: 9, marginRight: 4 }}>{isExp ? "▼" : "▶"}</span>
                              <span style={{ color: T.text, fontWeight: 500, fontSize: 12 }}>{r.account_name}</span>
                              <span style={{ fontSize: 10, color: T.text3, marginLeft: 8 }}>{r.account_type}</span>
                            </div>
                            {!isMobile && <div style={{ padding: "6px 8px", textAlign: "right" }}><span style={{ fontWeight: 700, color: T.text, fontSize: 12 }}>{fmt(Number(r.amount))}</span></div>}
                            <div style={{ padding: "4px 8px", textAlign: "right" }}>
                              <select onChange={e => { if (e.target.value) assignCategory(r.account_name, e.target.value); }} value="" style={{ padding: "4px 8px", borderRadius: 5, border: `1px solid #EF444450`, background: "#EF444408", color: "#EF4444", fontSize: 11, fontWeight: 600, cursor: "pointer", outline: "none" }}>
                                <option value="">Assign →</option>
                                {GA_CATS.map(c => <option key={c} value={c}>{c}</option>)}
                              </select>
                            </div>
                          </div>
                          {isExp && (
                            <div style={{ background: T.surface2, borderRadius: 6, padding: "8px 10px", margin: "2px 0 4px" }}>
                              {relBills.length === 0 ? (
                                <div style={{ fontSize: 11, color: T.text3, fontStyle: "italic" }}>No bill-level detail available. This is a P&L summary total from QuickBooks.</div>
                              ) : (
                                <>
                                  <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, marginBottom: 4 }}>BILLS ({relBills.length})</div>
                                  <div style={{ maxHeight: 200, overflow: "auto" }}>
                                    {relBills.slice(0, 50).map(b => (
                                      <div key={b.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "3px 0", fontSize: 11, borderBottom: `1px solid ${T.border}10` }}>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                          <span style={{ fontWeight: 600, color: T.text }}>{b.vendor_name || "—"}</span>
                                          {b.memo && <span style={{ color: T.text3, marginLeft: 6, fontSize: 10 }}>— {b.memo.slice(0, 60)}</span>}
                                        </div>
                                        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                                          <span style={{ fontSize: 10, color: T.text3 }}>{b.txn_date ? new Date(b.txn_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}</span>
                                          <span style={{ fontWeight: 600, color: T.text, minWidth: 60, textAlign: "right" }}>{fmt(Number(b.total_amount))}</span>
                                          <span style={{ fontSize: 8, fontWeight: 700, padding: "1px 4px", borderRadius: 3, background: b.payment_status === "paid" ? "#10B98118" : "#F59E0B18", color: b.payment_status === "paid" ? "#10B981" : "#F59E0B" }}>{b.payment_status === "paid" ? "PAID" : "OPEN"}</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                        );
                      })}
                      <div style={{ marginTop: 8, padding: "8px 0", borderTop: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 12 }}>
                        <span style={{ color: "#EF4444" }}>Unmatched Total</span>
                        <span style={{ color: "#EF4444" }}>{fmt(unmatchedTotal)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        );
      })()}

      {/* VENDORS VIEW */}
      {subView === "vendors" && (
        <div style={{ overflowX: "auto" }}>
          <div style={{ fontSize: 11, color: T.text3, marginBottom: 8 }}>
            {vendorList.length} vendors · {fmt(totalSpend)} total · Click G&A category or team to edit
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr style={{ borderBottom: `2px solid ${T.border}` }}>
              {["#", "Vendor", "Total", "G&A Category", "Team", "GL Accounts", "Lines"].map(h => (
                <th key={h} onClick={() => { if (h === "Total") { setSortBy("total"); setSortDir(d => d === "desc" ? "asc" : "desc"); } if (h === "Vendor") { setSortBy("name"); setSortDir(d => d === "desc" ? "asc" : "desc"); } }}
                  style={{ textAlign: h === "Total" || h === "Lines" ? "right" : "left", padding: "8px 6px", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", cursor: h === "Total" || h === "Vendor" ? "pointer" : "default" }}>{h}{sortBy === "total" && h === "Total" ? (sortDir === "desc" ? " ↓" : " ↑") : ""}{sortBy === "name" && h === "Vendor" ? (sortDir === "desc" ? " ↓" : " ↑") : ""}</th>
              ))}
            </tr></thead>
            <tbody>{vendorList.map((v, i) => (
              <tr key={v.name} style={{ borderBottom: `1px solid ${T.border}20` }}>
                <td style={{ padding: "6px", color: T.text3, fontSize: 10 }}>{i + 1}</td>
                <td style={{ padding: "6px", fontWeight: 600, color: T.text, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.name}</td>
                <td style={{ padding: "6px", textAlign: "right", fontWeight: 700, fontFamily: "monospace", color: T.text }}>{fmtD(v.total)}</td>
                <td style={{ padding: "6px" }}>
                  {editingGA === v.name ? (
                    <select autoFocus value={[...v.ga][0] || "Unclassified"} onChange={e => updateVendorGA(v.name, e.target.value)} onBlur={() => setEditingGA(null)}
                      style={{ padding: "2px 4px", fontSize: 11, borderRadius: 4, border: `1px solid ${T.accent}`, background: T.surface, color: T.text }}>
                      {GA_CATS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  ) : (
                    <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                      {[...v.ga].map(g => <span key={g} onClick={() => setEditingGA(v.name)} style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: (GA_COLORS[g] || "#666") + "15", color: GA_COLORS[g] || "#666", fontWeight: 600, cursor: "pointer", border: `1px dashed transparent` }} title="Click to edit G&A category">{g}</span>)}
                    </div>
                  )}
                </td>
                <td style={{ padding: "6px" }}>
                  {editingTeam === v.name ? (
                    <select autoFocus value={[...v.teams][0] || "Unassigned"} onChange={e => updateVendorTeam(v.name, e.target.value)} onBlur={() => setEditingTeam(null)}
                      style={{ padding: "2px 4px", fontSize: 11, borderRadius: 4, border: `1px solid ${T.accent}`, background: T.surface, color: T.text }}>
                      {TEAMS.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  ) : (
                    <span onClick={() => setEditingTeam(v.name)} style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, background: T.surface2, color: T.text2, cursor: "pointer", border: `1px dashed ${T.border}` }} title="Click to edit team">
                      {[...v.teams].join(", ")}
                    </span>
                  )}
                </td>
                <td style={{ padding: "6px", fontSize: 10, color: T.text3, fontFamily: "monospace" }}>{[...v.accounts].join(", ")}</td>
                <td style={{ padding: "6px", textAlign: "right", fontSize: 10, color: T.text3 }}>{v.count}</td>
              </tr>
            ))}</tbody>
            <tfoot><tr style={{ borderTop: `2px solid ${T.border}` }}>
              <td colSpan={2} style={{ padding: "8px 6px", fontWeight: 800, textAlign: "right" }}>Total</td>
              <td style={{ padding: "8px 6px", textAlign: "right", fontWeight: 800, fontFamily: "monospace", color: T.accent }}>{fmtD(totalSpend)}</td>
              <td colSpan={4}></td>
            </tr></tfoot>
          </table>
        </div>
      )}

      {/* BY TEAM VIEW */}
      {subView === "by_team" && (
        <div>
          <div style={{ fontSize: 11, color: T.text3, marginBottom: 12 }}>Spend grouped by team assignment · Click team names on Vendor view to reassign</div>
          {teamList.map(t => {
            const pct = totalSpend > 0 ? (t.total / totalSpend * 100) : 0;
            const teamVendors = vendorList.filter(v => v.teams.has(t.team)).sort((a, b) => b.total - a.total);
            return (
              <div key={t.team} style={{ marginBottom: 12, background: T.surface, borderRadius: 10, border: `1px solid ${T.border}`, padding: 14 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <div>
                    <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{t.team}</span>
                    <span style={{ fontSize: 11, color: T.text3, marginLeft: 8 }}>{t.vendors.size} vendors · {[...t.ga].length} categories</span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: T.accent }}>{fmt(t.total)}</div>
                    <div style={{ fontSize: 10, color: T.text3 }}>{pct.toFixed(1)}% of total</div>
                  </div>
                </div>
                <div style={{ height: 4, background: T.surface3, borderRadius: 2, marginBottom: 8 }}>
                  <div style={{ height: 4, borderRadius: 2, background: T.accent, width: `${pct}%` }} />
                </div>
                {teamVendors.slice(0, 8).map(v => (
                  <div key={v.name} style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", fontSize: 11, borderBottom: `1px solid ${T.border}10` }}>
                    <span style={{ color: T.text2 }}>{v.name}</span>
                    <span style={{ fontWeight: 600, fontFamily: "monospace", color: T.text }}>{fmtD(v.total)}</span>
                  </div>
                ))}
                {teamVendors.length > 8 && <div style={{ fontSize: 10, color: T.text3, marginTop: 4 }}>+{teamVendors.length - 8} more vendors</div>}
              </div>
            );
          })}
        </div>
      )}

      {/* GL MAPPING VIEW */}
      {subView === "gl_map" && (
        <div>
          <div style={{ fontSize: 11, color: T.text3, marginBottom: 12 }}>GL Account → G&A Category → Default Team mapping · 69 accounts from your chart of accounts</div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr style={{ borderBottom: `2px solid ${T.border}` }}>
              {["GL #", "Account Name", "G&A Category", "Default Team", "Jan Spend"].map(h => (
                <th key={h} style={{ textAlign: h === "Jan Spend" ? "right" : "left", padding: "8px 6px", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr></thead>
            <tbody>{(() => {
              // Get unique GL accounts from data
              const glMap = {};
              data.forEach(r => {
                if (!glMap[r.gl_account]) glMap[r.gl_account] = { code: r.gl_account, name: r.gl_description, ga: r.ga_category, team: r.team, total: 0 };
                glMap[r.gl_account].total += r.amount;
              });
              return Object.values(glMap).sort((a, b) => a.code.localeCompare(b.code)).map(gl => (
                <tr key={gl.code} style={{ borderBottom: `1px solid ${T.border}20` }}>
                  <td style={{ padding: "6px", fontFamily: "monospace", fontWeight: 700, color: T.accent }}>{gl.code}</td>
                  <td style={{ padding: "6px", color: T.text }}>{gl.name}</td>
                  <td style={{ padding: "6px" }}><span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 4, background: (GA_COLORS[gl.ga] || "#666") + "15", color: GA_COLORS[gl.ga] || "#666", fontWeight: 600 }}>{gl.ga}</span></td>
                  <td style={{ padding: "6px", fontSize: 11, color: T.text2 }}>{gl.team}</td>
                  <td style={{ padding: "6px", textAlign: "right", fontWeight: 600, fontFamily: "monospace", color: T.text }}>{fmtD(gl.total)}</td>
                </tr>
              ));
            })()}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}
