"use client";
import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";
import { NAV_ITEMS } from "./Sidebar";

// Static catalog of sub-routes (tabs within a top-level module). Selecting one
// from search routes to the parent module *and* deep-links the right sub-view
// via the navigateTo(module, subView) signature in page.js.
//
// Keep this list curated rather than auto-generated — we want the palette to
// surface the things people actually want to land on, not every internal tab.
const SUB_NAV = [
  // Finance sub-views (FinanceView reads pendingSubView)
  { module: "finance", sub: "requests",        label: "Spend Requests",      icon: "💸", aliases: ["spend", "request"] },
  { module: "finance", sub: "budgets",         label: "Budgets",             icon: "📊", aliases: ["budget"] },
  { module: "finance", sub: "budget_planner",  label: "Budget Planner",      icon: "🗒️", aliases: ["planner"] },
  { module: "finance", sub: "rules",           label: "Spend Rules",         icon: "⚡", aliases: ["rule", "approval rule"] },
  { module: "finance", sub: "cfo",             label: "CFO Dashboard",       icon: "📈", aliases: ["cfo dashboard"] },
  { module: "finance", sub: "pl_explorer",     label: "P&L Explorer",        icon: "📊", aliases: ["p&l", "pl", "profit"] },
  { module: "finance", sub: "cash_flow",       label: "Cash Flow",           icon: "💧", aliases: ["cash"] },
  { module: "finance", sub: "vendors",         label: "Vendor Intelligence", icon: "🏢", aliases: ["vendor"] },
  { module: "finance", sub: "ap_aging",        label: "AP / AR",             icon: "⏳", aliases: ["ap", "ar", "aging", "payables", "receivables"] },
  { module: "finance", sub: "txn_search",      label: "Transaction Search",  icon: "🔍", aliases: ["transactions", "search transactions"] },
  { module: "finance", sub: "revenue",         label: "Revenue Analytics",   icon: "💰", aliases: ["revenue"] },
  { module: "finance", sub: "audit",           label: "Audit Log",           icon: "📜", aliases: ["audit"] },
  { module: "finance", sub: "vendor_spend",    label: "Vendor Spend",        icon: "💵", aliases: ["spend by vendor"] },
  // ERP sub-views (ERPView reads pendingSubView)
  { module: "erp", sub: "demand_planning",  label: "Demand Planning", icon: "📐", aliases: ["demand", "dp", "planning"] },
  { module: "erp", sub: "products",         label: "Products",        icon: "📦", aliases: ["product", "sku", "skus"] },
  { module: "erp", sub: "suppliers",        label: "Suppliers",       icon: "🏭", aliases: ["supplier", "vendor mgmt"] },
  { module: "erp", sub: "purchase_orders",  label: "Purchase Orders", icon: "📋", aliases: ["po", "pos", "purchase order"] },
  { module: "erp", sub: "inventory",        label: "Inventory",       icon: "📊", aliases: ["stock", "inventory"] },
  { module: "erp", sub: "manufacturing",    label: "Manufacturing",   icon: "⚙", aliases: ["mfg", "production"] },
  { module: "erp", sub: "orders",           label: "Orders",          icon: "🛒", aliases: ["order"] },
  { module: "erp", sub: "customers",        label: "Customers",       icon: "👥", aliases: ["customer"] },
  { module: "erp", sub: "shipping",         label: "Shipping",        icon: "🚚", aliases: ["ship"] },
  { module: "erp", sub: "returns",          label: "Returns",         icon: "↩️", aliases: ["return", "rma"] },
];

export default function CommandPalette({ open, onClose, setActive }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef(null);

  const navResults = () => [
    ...NAV_ITEMS.slice(0, 6).map(n => ({ type: "nav", id: n.key, title: n.label, sub: "Navigate", icon: n.icon || "→" })),
    { type: "action", id: "new-project", title: "New Project", sub: "Jump to Projects", icon: "＋", action: "projects" },
    { type: "action", id: "new-okr", title: "New Objective", sub: "Jump to OKRs", icon: "＋", action: "okrs" },
    { type: "action", id: "new-doc", title: "New Document", sub: "Jump to Docs", icon: "＋", action: "docs" },
  ];

  useEffect(() => {
    if (open) { setQuery(""); setResults(navResults()); setSelected(0); setTimeout(() => inputRef.current?.focus(), 50); }
  }, [open]);

  useEffect(() => {
    if (!query.trim()) { setResults(navResults()); return; }
    const timer = setTimeout(async () => {
      const [
        { data: tasks }, { data: projects }, { data: docs },
        { data: krs }, { data: objs }, { data: plm },
      ] = await Promise.all([
        supabase.from("tasks").select("id,title,status").is("deleted_at", null).ilike("title", `%${query}%`).limit(5),
        supabase.from("projects").select("id,name,color,emoji").is("deleted_at", null).ilike("name", `%${query}%`).limit(4),
        supabase.from("documents").select("id,title,status,emoji").is("deleted_at", null).ilike("title", `%${query}%`).limit(4),
        supabase.from("key_results").select("id,title,progress").is("deleted_at", null).ilike("title", `%${query}%`).limit(4),
        supabase.from("objectives").select("id,title,health").is("deleted_at", null).ilike("title", `%${query}%`).limit(3),
        supabase.from("plm_programs").select("id,name,current_stage").is("deleted_at", null).ilike("name", `%${query}%`).limit(3),
      ]);
      const q = query.toLowerCase();
      const nav = NAV_ITEMS.filter(n => n.label.toLowerCase().includes(q))
        .map(n => ({ type: "nav", id: n.key, title: n.label, sub: "Navigate", icon: n.icon || "→" }));
      // Sub-nav matches: match label OR any alias substring. e.g. "demand"
      // hits "Demand Planning"; "spend" hits "Spend Requests". We dedupe so a
      // user typing "demand planning" exactly doesn't see two near-identical
      // rows from label vs alias.
      const subnav = SUB_NAV
        .filter(s => s.label.toLowerCase().includes(q) || (s.aliases || []).some(a => a.includes(q) || q.includes(a)))
        .map(s => ({ type: "subnav", id: `${s.module}:${s.sub}`, title: s.label, sub: `Navigate · ${s.module === "finance" ? "Finance" : "ERP"}`, icon: s.icon, module: s.module, subRoute: s.sub }));
      setResults([
        ...nav,
        ...subnav,
        ...(projects||[]).map(p => ({ type: "project", id: p.id, title: `${p.emoji||""} ${p.name}`.trim(), sub: "Project", icon: "◼", color: p.color })),
        ...(tasks||[]).map(t => ({ type: "task", id: t.id, title: t.title, sub: `Task · ${t.status}`, icon: "☐" })),
        ...(krs||[]).map(k => ({ type: "kr", id: k.id, title: k.title, sub: `Key Result · ${Math.round(k.progress||0)}%`, icon: "◎" })),
        ...(objs||[]).map(o => ({ type: "okr", id: o.id, title: o.title, sub: `Objective · ${(o.health||"").replace("_"," ")}`, icon: "🎯" })),
        ...(docs||[]).map(d => ({ type: "doc", id: d.id, title: d.title||"Untitled", sub: d.status||"Doc", icon: d.emoji||"📄" })),
        ...(plm||[]).map(p => ({ type: "plm", id: p.id, title: p.name, sub: `PLM · ${p.current_stage||""}`, icon: "⬢" })),
      ]);
      setSelected(0);
    }, 120);
    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (item) => {
    // Sub-nav: route to parent module and deep-link the tab via setActive
    // signature (page.js's navigateTo(module, subView) is wired through here).
    if (item.type === "subnav") {
      setActive(item.module, item.subRoute);
      onClose();
      return;
    }
    const map = { nav: item.id, action: item.action, project: "projects", task: "projects", doc: "docs", okr: "okrs", kr: "okrs", plm: "plm" };
    setActive(map[item.type] || "dashboard");
    onClose();
  };

  const handleKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected(p => Math.min(p + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelected(p => Math.max(p - 1, 0)); }
    else if (e.key === "Enter" && results[selected]) { handleSelect(results[selected]); }
    else if (e.key === "Escape") { onClose(); }
  };

  const typeGroup = (t) => ({ nav: "Navigate", subnav: "Navigate", action: "Quick Actions", project: "Projects", task: "Tasks", kr: "OKRs", okr: "OKRs", doc: "Docs", plm: "PLM" }[t] || "Other");

  const grouped = results.reduce((acc, item, i) => {
    const g = typeGroup(item.type);
    if (!acc[g]) acc[g] = [];
    acc[g].push({ ...item, _idx: i });
    return acc;
  }, {});

  if (!open) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 80 }} onClick={onClose}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} />
      <div onClick={e => e.stopPropagation()} style={{ position: "relative", width: 560, maxHeight: "68vh", background: T.surface, borderRadius: 16, border: `1px solid ${T.border}`, overflow: "hidden", boxShadow: "0 24px 80px rgba(0,0,0,0.55)", display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 20px", borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="5.5" stroke={T.text3} strokeWidth="2"/><line x1="11" y1="11" x2="15" y2="15" stroke={T.text3} strokeWidth="2" strokeLinecap="round"/></svg>
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={handleKey}
            placeholder="Search tasks, projects, OKRs, docs…"
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: T.text, fontSize: 15, fontFamily: "inherit" }} />
          {query && <button onClick={() => setQuery("")} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 18, padding: 0, lineHeight: 1 }}>×</button>}
          <kbd style={{ padding: "2px 7px", borderRadius: 5, border: `1px solid ${T.border}`, fontSize: 11, color: T.text3, fontFamily: "monospace", flexShrink: 0 }}>ESC</kbd>
        </div>
        <div style={{ overflow: "auto", flex: 1 }}>
          {results.length === 0 && query.trim() && (
            <div style={{ padding: "32px 20px", textAlign: "center", color: T.text3 }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🔍</div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>No results</div>
              <div style={{ fontSize: 12 }}>Try a different search term</div>
            </div>
          )}
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group}>
              <div style={{ padding: "10px 20px 4px", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 1 }}>{group}</div>
              {items.map(item => {
                const isSel = item._idx === selected;
                return (
                  <div key={`${item.type}-${item.id}`} onClick={() => handleSelect(item)} onMouseEnter={() => setSelected(item._idx)}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "9px 20px", cursor: "pointer", background: isSel ? `${T.accent}18` : "transparent", transition: "background 0.08s", borderLeft: isSel ? `3px solid ${T.accent}` : "3px solid transparent" }}>
                    <span style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: item.color ? `${item.color}20` : T.surface2, fontSize: 14, color: item.color || (isSel ? T.accent : T.text3), fontWeight: 700 }}>{item.icon}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: isSel ? 600 : 500, color: isSel ? T.accent : T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</div>
                      <div style={{ fontSize: 10, color: T.text3, marginTop: 1 }}>{item.sub}</div>
                    </div>
                    {isSel && <kbd style={{ padding: "2px 6px", borderRadius: 4, border: `1px solid ${T.border}`, fontSize: 10, color: T.text3, fontFamily: "monospace", flexShrink: 0 }}>↵</kbd>}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div style={{ padding: "8px 20px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 16, fontSize: 10, color: T.text3, flexShrink: 0, background: T.surface2 }}>
          <span>↑↓ navigate</span><span>↵ open</span><span>ESC close</span><span style={{ marginLeft: "auto" }}>⌘K to reopen</span>
        </div>
      </div>
    </div>
  );
}
