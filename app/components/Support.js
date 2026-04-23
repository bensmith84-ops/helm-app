"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { T as TK } from "../tokens";

const STATUS_COLORS = { open: "#3b82f6", pending: "#f59e0b", waiting: "#8b5cf6", resolved: "#22c55e", closed: "#6b7280" };
const PRIORITY_COLORS = { urgent: "#ef4444", high: "#f97316", medium: "#f59e0b", low: "#6b7280" };
const CHANNEL_ICONS = { email: "📧", chat: "💬", social_facebook: "📘", social_instagram: "📸", social_tiktok: "🎵", social_twitter: "🐦", phone: "📞", internal: "🏢", api: "⚡" };

// Reusable tag input component (module-level to avoid React #310)
function CxTagInput({ values, onChange, T: theme }) {
  const [inp, setInp] = useState("");
  const T = theme;
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
        {(values || []).map((v, i) => (
          <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 4, background: T.accentDim, color: T.accent, fontSize: 11, fontWeight: 600 }}>
            {v} <span onClick={() => onChange(values.filter((_, j) => j !== i))} style={{ cursor: "pointer", opacity: 0.6 }}>×</span>
          </span>
        ))}
      </div>
      <input value={inp} onChange={e => setInp(e.target.value)} placeholder="Type and press Enter..."
        onKeyDown={e => { if (e.key === "Enter" && inp.trim()) { onChange([...(values || []), inp.trim()]); setInp(""); e.preventDefault(); } }}
        style={{ padding: "6px 10px", fontSize: 12, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface, color: T.text, outline: "none", width: 200 }} />
    </div>
  );
}

const timeAgo = (d) => {
  if (!d) return "";
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return `${Math.floor(s / 86400)}d ago`;
  return new Date(d).toLocaleDateString();
};

export default function SupportView() {
  const { orgId } = useAuth();
  const T = TK;
  const [tab, setTab] = useState("inbox");
  const [tickets, setTickets] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [replyText, setReplyText] = useState("");
  const [macros, setMacros] = useState([]);
  const [kbArticles, setKbArticles] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [tags, setTags] = useState([]);
  const [views, setViews] = useState([]);
  const [activeView, setActiveView] = useState(null);
  const [stats, setStats] = useState({ open: 0, pending: 0, urgent: 0, resolved_today: 0, avg_response: 0, csat: 0, ai_resolved: 0 });
  const [filter, setFilter] = useState({ status: ["open", "pending", "waiting"], search: "" });
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showNewTicket, setShowNewTicket] = useState(false);
  const [simSubject, setSimSubject] = useState("");
  const [simMessage, setSimMessage] = useState("");
  const [simCategory, setSimCategory] = useState("general");
  const [showMacros, setShowMacros] = useState(false);
  const [aiDraft, setAiDraft] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiConfig, setAiConfig] = useState(null);
  const [testMsgs, setTestMsgs] = useState([]);
  const [testInput, setTestInput] = useState("");
  const [testLoading, setTestLoading] = useState(false);
  const testEndRef = useRef(null);
  const [socialMentions, setSocialMentions] = useState([]);
  const [socialAccounts, setSocialAccounts] = useState([]);
  const [socialRules, setSocialRules] = useState([]);
  const [socialFilter, setSocialFilter] = useState({ platform: "all", status: "new", sentiment: "all" });
  const [selectedMention, setSelectedMention] = useState(null);
  const [moderationRules, setModerationRules] = useState([]);
  const [moderatingId, setModeratingId] = useState(null);
  const [aiReplyLoading, setAiReplyLoading] = useState(null);
  const [slaPolicies, setSlaPolicies] = useState([]);
  const [automations, setAutomations] = useState([]);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const chatEndRef = useRef(null);
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  // Load initial data
  useEffect(() => {
    const load = async () => {
      const { data: { user: u } } = await supabase.auth.getUser();
      if (!u) return;
      setUser(u);
      const { data: p } = await supabase.from("profiles").select("*").eq("org_id", orgId).eq("id", u.id).single();
      setProfile(p);

      if (!orgId) return;

      const [ticketRes, macroRes, kbRes, tagRes, viewRes, contactRes, aiConfRes, socialAcctRes, socialMentRes, socialRuleRes, modRuleRes, slaRes, autoRes] = await Promise.all([
        supabase.from("cx_tickets").select("*").eq("org_id", orgId).in("status", ["open", "pending", "waiting"]).order("created_at", { ascending: false }).limit(100),
        supabase.from("cx_macros").select("*").eq("org_id", orgId).eq("is_active", true).order("usage_count", { ascending: false }),
        supabase.from("cx_kb_articles").select("*").eq("org_id", orgId).eq("status", "published").order("view_count", { ascending: false }),
        supabase.from("cx_tags").select("*").eq("org_id", orgId).order("name"),
        supabase.from("cx_views").select("*").eq("org_id", orgId).order("name"),
        supabase.from("cx_contacts").select("*").eq("org_id", orgId).order("last_contact_at", { ascending: false }).limit(50),
        supabase.from("cx_ai_config").select("*").eq("org_id", orgId).single(),
        supabase.from("cx_social_accounts").select("*").eq("org_id", orgId).order("platform"),
        supabase.from("cx_social_mentions").select("*").eq("org_id", orgId).order("posted_at", { ascending: false }).limit(200),
        supabase.from("cx_social_rules").select("*").eq("org_id", orgId).order("name"),
        supabase.from("cx_moderation_rules").select("*").eq("org_id", orgId).order("priority", { ascending: false }),
        supabase.from("cx_sla_policies").select("*").eq("org_id", orgId).order("priority"),
        supabase.from("cx_automations").select("*").eq("org_id", orgId).order("created_at", { ascending: false }),
      ]);

      setTickets(ticketRes.data || []);
      setMacros(macroRes.data || []);
      setKbArticles(kbRes.data || []);
      setTags(tagRes.data || []);
      setViews(viewRes.data || []);
      setContacts(contactRes.data || []);
      if (aiConfRes.data) setAiConfig(aiConfRes.data);
      setSocialAccounts(socialAcctRes.data || []);
      setSocialMentions(socialMentRes.data || []);
      setSocialRules(socialRuleRes.data || []);
      setModerationRules(modRuleRes.data || []);
      setSlaPolicies(slaRes.data || []);
      setAutomations(autoRes.data || []);

      // Compute stats
      const all = ticketRes.data || [];
      const today = new Date().toISOString().slice(0, 10);
      setStats({
        open: all.filter(t => t.status === "open").length,
        pending: all.filter(t => t.status === "pending").length,
        urgent: all.filter(t => t.priority === "urgent").length,
        resolved_today: all.filter(t => t.status === "resolved" && t.resolved_at?.startsWith(today)).length,
        avg_response: 0,
        csat: 0,
        ai_resolved: all.filter(t => t.ai_auto_resolved).length,
      });

      setLoading(false);
    };
    load();
  }, []);

  // Load messages when ticket selected
  useEffect(() => {
    if (!selected) return;
    const loadMsgs = async () => {
      const { data } = await supabase.from("cx_messages").select("*").eq("org_id", orgId).eq("ticket_id", selected.id).order("created_at");
      setMessages(data || []);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    };
    loadMsgs();
  }, [selected?.id]);

  const filteredTickets = tickets.filter(t => {
    if (filter.status.length && !filter.status.includes(t.status)) return false;
    if (filter.search) {
      const s = filter.search.toLowerCase();
      return (t.subject || "").toLowerCase().includes(s) || (t.customer_name || "").toLowerCase().includes(s) || (t.customer_email || "").toLowerCase().includes(s) || String(t.ticket_number).includes(s);
    }
    return true;
  });

  const loadAllTickets = async (statusFilter) => {

    if (!orgId) return;
    let q = supabase.from("cx_tickets").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(200);
    if (statusFilter && statusFilter.length) q = q.in("status", statusFilter);
    const { data } = await q;
    setTickets(data || []);
  };

  const sendReply = async (text, direction = "outbound", senderType = "agent") => {
    if (!text?.trim() || !selected) return;
    setSending(true);
    const msg = {
      ticket_id: selected.id,
      direction,
      sender_type: senderType,
      sender_id: user?.id,
      sender_name: profile?.display_name || "Agent",
      sender_email: user?.email,
      body_text: text,
      channel: selected.channel,
      is_first_response: messages.filter(m => m.direction === "outbound").length === 0,
    };
    const { data } = await supabase.from("cx_messages").insert(msg).select().single();
    if (data) {
      setMessages(p => [...p, data]);
      // Update ticket status
      const updates = {};
      if (direction === "outbound" && selected.status === "open") updates.status = "pending";
      if (!selected.first_response_at && direction === "outbound") updates.first_response_at = new Date().toISOString();
      if (Object.keys(updates).length) {
        await supabase.from("cx_tickets").update(updates).eq("org_id", orgId).eq("id", selected.id);
        setSelected(s => ({ ...s, ...updates }));
        setTickets(p => p.map(t => t.id === selected.id ? { ...t, ...updates } : t));
      }
    }
    setReplyText("");
    setSending(false);
    setAiDraft(null);
    setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const updateTicket = async (field, value) => {
    if (!selected) return;
    const updates = { [field]: value, updated_at: new Date().toISOString() };
    
    // When resolving, set resolved_at and trigger CSAT
    if (field === "status" && value === "resolved") {
      updates.resolved_at = new Date().toISOString();
      // Show CSAT notification
      if (selected.customer_email) {
        setTimeout(() => {
          if (confirm(`Send CSAT survey to ${selected.customer_name || selected.customer_email}?`)) {
            supabase.from("cx_tickets").update({ 
              csat_submitted_at: null // mark as pending survey
            }).eq("id", selected.id);
          }
        }, 500);
      }
    }
    if (field === "status" && value === "closed") {
      updates.closed_at = new Date().toISOString();
    }
    
    await supabase.from("cx_tickets").update(updates).eq("org_id", orgId).eq("id", selected.id);
    setSelected(s => ({ ...s, ...updates }));
    setTickets(p => p.map(t => t.id === selected.id ? { ...t, ...updates } : t));
  };

  const createTicket = async (form) => {

    const { data } = await supabase.from("cx_tickets").insert({
      org_id: orgId,
      subject: form.subject,
      customer_email: form.email,
      customer_name: form.name,
      channel: form.channel || "email",
      priority: form.priority || "medium",
      category: form.category || "general",
      assigned_to: user?.id,
      created_by: user?.id,
    }).select().single();
    if (data) {
      setTickets(p => [data, ...p]);
      setSelected(data);
      setShowNewTicket(false);
      if (form.message) {
        await supabase.from("cx_messages").insert({
          ticket_id: data.id, direction: "inbound", sender_type: "customer",
          sender_name: form.name, sender_email: form.email, body_text: form.message, channel: form.channel || "email",
        });
      }
    }
  };

  // AI Draft generator
  const generateAiDraft = async () => {
    if (!selected || messages.length === 0) return;
    setAiLoading(true);
    try {
      const context = messages.slice(-10).map(m => `[${m.sender_type}]: ${m.body_text}`).join("\n");
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch(supabase.supabaseUrl + "/functions/v1/cx-ai-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` },
        body: JSON.stringify({
          ticket: { subject: selected.subject, category: selected.category, channel: selected.channel, customer_name: selected.customer_name },
          messages: context,
          macros: macros.slice(0, 5).map(m => ({ name: m.name, content: m.content.slice(0, 200) })),
        }),
      });
      const result = await res.json();
      if (result.draft) {
        setAiDraft(result.draft);
        setReplyText(result.draft);
      }
    } catch (e) { console.error("AI draft error:", e); }
    setAiLoading(false);
  };

  const TABS = [
    { key: "inbox", label: "Inbox", icon: "📥", count: stats.open + stats.pending },
    { key: "ai_agent", label: "AI Agent", icon: "🤖" },
    { key: "kb", label: "Knowledge Base", icon: "📖" },
    { key: "macros", label: "Macros", icon: "⚡" },
    { key: "contacts", label: "Contacts", icon: "👥" },
    { key: "social", label: "Social", icon: "📱" },
    { key: "moderation", label: "Moderation", icon: "🛡" },
    { key: "sla", label: "SLA", icon: "⏱" },
    { key: "automations", label: "Automations", icon: "⚡" },
    { key: "analytics", label: "Analytics", icon: "📊" },
  ];

  if (loading) return <div style={{ padding: 40, color: T.text3, textAlign: "center" }}>Loading Support...</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: T.bg, color: T.text }}>
      {/* Top bar with stats */}
      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${T.border}`, flexShrink: 0, overflowX: "auto" }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => { setTab(t.key); if (t.key !== "inbox") setSelected(null); }}
            style={{ padding: "10px 18px", background: tab === t.key ? T.accentDim : "transparent", border: "none",
              borderBottom: tab === t.key ? `2px solid ${T.accent}` : "2px solid transparent",
              cursor: "pointer", color: tab === t.key ? T.accent : T.text3, fontSize: 12, fontWeight: tab === t.key ? 700 : 500,
              whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
            <span>{t.icon}</span> {t.label}
            {t.count > 0 && <span style={{ background: T.accent, color: "#fff", borderRadius: 10, padding: "1px 7px", fontSize: 10, fontWeight: 700 }}>{t.count}</span>}
          </button>
        ))}
      </div>

      {/* Brand Risk Alert Banner */}
      {(() => {
        const criticals = socialMentions.filter(m => (m.moderation_risk === "critical" || m.moderation_risk === "high") && m.status === "new");
        const slaBreached = tickets.filter(t => t.sla_breached && t.status !== "resolved" && t.status !== "closed");
        const escalated = socialMentions.filter(m => m.status === "escalated");
        if (criticals.length === 0 && slaBreached.length === 0 && escalated.length === 0) return null;
        return (
          <div style={{ padding: "6px 16px", background: "#ef444410", borderBottom: `1px solid #ef444430`, display: "flex", gap: 12, alignItems: "center", flexShrink: 0, overflowX: "auto" }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: "#ef4444" }}>🚨 Alerts</span>
            {criticals.length > 0 && (
              <button onClick={() => { setTab("social"); setSocialFilter(f => ({ ...f, status: "new" })); }}
                style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, border: `1px solid #ef444440`, background: "#ef444415", color: "#ef4444", fontWeight: 600, cursor: "pointer" }}>
                {criticals.length} high-risk comment{criticals.length !== 1 ? "s" : ""} need review
              </button>
            )}
            {escalated.length > 0 && (
              <button onClick={() => { setTab("social"); setSocialFilter(f => ({ ...f, status: "escalated" })); }}
                style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, border: `1px solid #f5920b40`, background: "#f5920b15", color: "#f97316", fontWeight: 600, cursor: "pointer" }}>
                {escalated.length} escalated mention{escalated.length !== 1 ? "s" : ""}
              </button>
            )}
            {slaBreached.length > 0 && (
              <button onClick={() => { setTab("inbox"); setFilter(f => ({ ...f, status: ["open", "pending"] })); }}
                style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, border: `1px solid #ef444440`, background: "#ef444415", color: "#ef4444", fontWeight: 600, cursor: "pointer" }}>
                {slaBreached.length} SLA breach{slaBreached.length !== 1 ? "es" : ""}
              </button>
            )}
          </div>
        );
      })()}

      {/* KPI strip */}
      {tab === "inbox" && (
        <div style={{ display: "flex", gap: 1, padding: "0", borderBottom: `1px solid ${T.border}`, flexShrink: 0, overflowX: "auto" }}>
          {[
            { label: "Open", value: stats.open, color: "#3b82f6" },
            { label: "Pending", value: stats.pending, color: "#f59e0b" },
            { label: "Urgent", value: stats.urgent, color: "#ef4444" },
            { label: "AI Resolved", value: stats.ai_resolved, color: "#a855f7" },
          ].map(k => (
            <div key={k.label} style={{ flex: 1, padding: "8px 14px", textAlign: "center", background: T.surface, borderRight: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: k.color }}>{k.value}</div>
              <div style={{ fontSize: 10, color: T.text3, fontWeight: 600, textTransform: "uppercase" }}>{k.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Main content */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {tab === "inbox" && <>
          {/* Ticket list */}
          <div style={{ width: isMobile && selected ? 0 : isMobile ? "100%" : 340, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", overflow: "hidden", flexShrink: 0, transition: "width 0.2s" }}>
            {/* Search + New */}
            <div style={{ padding: 10, borderBottom: `1px solid ${T.border}`, display: "flex", gap: 6 }}>
              <input placeholder="Search tickets..." value={filter.search} onChange={e => setFilter(f => ({ ...f, search: e.target.value }))}
                style={{ flex: 1, padding: "7px 10px", fontSize: 12, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface, color: T.text, outline: "none" }} />
              <button onClick={() => setShowNewTicket(true)} style={{ padding: "7px 12px", background: T.accent, color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>📨 Simulate Email</button>
            </div>
            {/* Status filter pills */}
            <div style={{ padding: "6px 10px", display: "flex", gap: 4, flexWrap: "wrap", borderBottom: `1px solid ${T.border}` }}>
              {["open", "pending", "waiting", "resolved", "closed"].map(s => (
                <button key={s} onClick={() => {
                  const next = filter.status.includes(s) ? filter.status.filter(x => x !== s) : [...filter.status, s];
                  setFilter(f => ({ ...f, status: next }));
                  loadAllTickets(next);
                }}
                  style={{ padding: "3px 8px", fontSize: 10, fontWeight: 600, borderRadius: 4,
                    background: filter.status.includes(s) ? STATUS_COLORS[s] + "20" : "transparent",
                    color: filter.status.includes(s) ? STATUS_COLORS[s] : T.text3,
                    border: `1px solid ${filter.status.includes(s) ? STATUS_COLORS[s] + "50" : T.border}`, cursor: "pointer", textTransform: "capitalize" }}>
                  {s}
                </button>
              ))}
            </div>
            {/* Saved views */}
            {views.length > 0 && (
              <div style={{ padding: "4px 10px", display: "flex", gap: 4, overflowX: "auto", borderBottom: `1px solid ${T.border}` }}>
                {views.map(v => (
                  <button key={v.id} onClick={() => setActiveView(activeView === v.id ? null : v.id)}
                    style={{ padding: "2px 8px", fontSize: 10, borderRadius: 4, whiteSpace: "nowrap",
                      background: activeView === v.id ? T.accent + "15" : "transparent",
                      color: activeView === v.id ? T.accent : T.text3,
                      border: `1px solid ${activeView === v.id ? T.accent + "40" : "transparent"}`, cursor: "pointer" }}>
                    {v.name}
                  </button>
                ))}
              </div>
            )}
            {/* Ticket list */}
            <div style={{ flex: 1, overflow: "auto" }}>
              {filteredTickets.length === 0 && <div style={{ padding: 30, textAlign: "center", color: T.text3, fontSize: 13 }}>No tickets found</div>}
              {filteredTickets.map(ticket => (
                <div key={ticket.id} onClick={() => setSelected(ticket)}
                  style={{ padding: "10px 12px", borderBottom: `1px solid ${T.border}`, cursor: "pointer",
                    background: selected?.id === ticket.id ? T.accentDim : "transparent",
                    transition: "background 0.1s" }}
                  onMouseEnter={e => { if (selected?.id !== ticket.id) e.currentTarget.style.background = T.surface2; }}
                  onMouseLeave={e => { if (selected?.id !== ticket.id) e.currentTarget.style.background = "transparent"; }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 12 }}>{CHANNEL_ICONS[ticket.channel] || "📧"}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ticket.subject}</span>
                    </div>
                    <span style={{ fontSize: 10, color: T.text3, whiteSpace: "nowrap", marginLeft: 6 }}>{timeAgo(ticket.created_at)}</span>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: T.text2 }}>{ticket.customer_name || ticket.customer_email || "Unknown"}</span>
                    <span style={{ fontSize: 9, color: T.text3 }}>#{ticket.ticket_number}</span>
                  </div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: STATUS_COLORS[ticket.status] + "20", color: STATUS_COLORS[ticket.status], fontWeight: 700, textTransform: "capitalize" }}>{ticket.status}</span>
                    <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: PRIORITY_COLORS[ticket.priority] + "20", color: PRIORITY_COLORS[ticket.priority], fontWeight: 700, textTransform: "capitalize" }}>{ticket.priority}</span>
                    {ticket.ai_auto_resolved && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: "#a855f720", color: "#a855f7", fontWeight: 700 }}>🤖 AI</span>}
                    {ticket.sla_breached && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: "#ef444420", color: "#ef4444", fontWeight: 700 }}>⚠️ SLA Breached</span>}
                    {!ticket.sla_breached && ticket.sla_first_response_due && !ticket.first_response_at && (() => {
                      const due = new Date(ticket.sla_first_response_due);
                      const mins = Math.round((due - new Date()) / 60000);
                      if (mins < 0) return <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: "#ef444420", color: "#ef4444", fontWeight: 700 }}>⏰ {Math.abs(mins)}m overdue</span>;
                      if (mins < 30) return <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: "#f59e0b20", color: "#f59e0b", fontWeight: 700 }}>⏰ {mins}m left</span>;
                      return null;
                    })()}
                    {ticket.category && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: T.surface2, color: T.text3, textTransform: "capitalize" }}>{ticket.category.replace("_", " ")}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Conversation panel */}
          {selected ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
              {/* Ticket header */}
              <div style={{ padding: "10px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {isMobile && <button onClick={() => setSelected(null)} style={{ background: "none", border: "none", color: T.accent, fontSize: 12, cursor: "pointer", marginBottom: 4 }}>← Back</button>}
                  <div style={{ fontSize: 14, fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selected.subject}</div>
                  <div style={{ fontSize: 11, color: T.text3, display: "flex", gap: 8, alignItems: "center", marginTop: 2, flexWrap: "wrap" }}>
                    <span>{CHANNEL_ICONS[selected.channel]} {selected.customer_name || selected.customer_email}</span>
                    <span>#{selected.ticket_number}</span>
                    {selected.customer_ltv > 0 && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "#22c55e15", color: "#22c55e", fontWeight: 600 }}>LTV ${Number(selected.customer_ltv).toFixed(0)}</span>}
                    {selected.customer_subscription_status && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: T.surface2, color: T.text3 }}>{selected.customer_subscription_status}</span>}
                    {selected.csat_score && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: selected.csat_score >= 4 ? "#22c55e15" : selected.csat_score >= 3 ? "#f59e0b15" : "#ef444415", color: selected.csat_score >= 4 ? "#22c55e" : selected.csat_score >= 3 ? "#f59e0b" : "#ef4444", fontWeight: 700 }}>⭐ {selected.csat_score}/5</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <select value={selected.status} onChange={e => updateTicket("status", e.target.value)}
                    style={{ padding: "4px 8px", fontSize: 11, border: `1px solid ${STATUS_COLORS[selected.status]}50`, borderRadius: 4, background: STATUS_COLORS[selected.status] + "10", color: STATUS_COLORS[selected.status], fontWeight: 700, cursor: "pointer" }}>
                    {["open", "pending", "waiting", "resolved", "closed"].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <select value={selected.priority} onChange={e => updateTicket("priority", e.target.value)}
                    style={{ padding: "4px 8px", fontSize: 11, border: `1px solid ${PRIORITY_COLORS[selected.priority]}50`, borderRadius: 4, background: PRIORITY_COLORS[selected.priority] + "10", color: PRIORITY_COLORS[selected.priority], fontWeight: 700, cursor: "pointer" }}>
                    {["urgent", "high", "medium", "low"].map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflow: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
                {messages.length === 0 && <div style={{ padding: 30, textAlign: "center", color: T.text3, fontSize: 13 }}>No messages yet. Start the conversation below.</div>}
                {messages.map(msg => (
                  <div key={msg.id} style={{ display: "flex", flexDirection: msg.direction === "outbound" ? "row-reverse" : "row", gap: 8 }}>
                    <div style={{ width: 30, height: 30, borderRadius: 15, flexShrink: 0,
                      background: msg.direction === "internal_note" ? "#f59e0b20" : msg.direction === "outbound" ? T.accent + "20" : T.surface3,
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>
                      {msg.direction === "internal_note" ? "📝" : msg.sender_type === "ai" ? "🤖" : msg.direction === "outbound" ? "👤" : "💬"}
                    </div>
                    <div style={{ maxWidth: "75%", padding: "10px 14px", borderRadius: 12,
                      background: msg.direction === "internal_note" ? "#f59e0b10" : msg.direction === "outbound" ? T.accent + "10" : T.surface2,
                      border: `1px solid ${msg.direction === "internal_note" ? "#f59e0b30" : msg.direction === "outbound" ? T.accent + "30" : T.border}` }}>
                      <div style={{ fontSize: 10, color: T.text3, marginBottom: 4, display: "flex", justifyContent: "space-between", gap: 12 }}>
                        <span style={{ fontWeight: 600 }}>{msg.sender_name || msg.sender_type}{msg.ai_generated ? " 🤖" : ""}</span>
                        <span>{timeAgo(msg.created_at)}</span>
                      </div>
                      <div style={{ fontSize: 13, color: T.text, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{msg.body_text}</div>
                    </div>
                  </div>
                ))}
                <div ref={chatEndRef} />
              </div>

              {/* CSAT Rating - show when resolved without score */}
              {(selected.status === "resolved" || selected.status === "closed") && !selected.csat_score && (
                <div style={{ padding: "10px 16px", borderTop: `1px solid ${T.border}`, background: "#f59e0b08", display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, color: T.text2, whiteSpace: "nowrap" }}>⭐ Rate this interaction:</span>
                  <div style={{ display: "flex", gap: 4 }}>
                    {[1,2,3,4,5].map(score => (
                      <button key={score} onClick={async () => {
                        await supabase.from("cx_tickets").update({ csat_score: score, csat_submitted_at: new Date().toISOString() }).eq("id", selected.id);
                        setSelected(s => ({ ...s, csat_score: score }));
                        setTickets(p => p.map(t => t.id === selected.id ? { ...t, csat_score: score } : t));
                      }} style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                        onMouseEnter={e => e.currentTarget.style.background = "#f59e0b20"}
                        onMouseLeave={e => e.currentTarget.style.background = T.surface}>
                        {score <= 2 ? "😟" : score === 3 ? "😐" : score === 4 ? "😊" : "🤩"}
                      </button>
                    ))}
                  </div>
                  <span style={{ fontSize: 9, color: T.text3 }}>1-5 scale</span>
                </div>
              )}
              {selected.csat_score && (
                <div style={{ padding: "6px 16px", borderTop: `1px solid ${T.border}`, background: selected.csat_score >= 4 ? "#22c55e08" : "#f59e0b08", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <span style={{ fontSize: 11, color: T.text2 }}>CSAT: {["😟","😟","😐","😊","🤩"][selected.csat_score - 1]} {selected.csat_score}/5</span>
                  {selected.csat_comment && <span style={{ fontSize: 10, color: T.text3 }}>— "{selected.csat_comment}"</span>}
                </div>
              )}

              {/* Reply box */}
              <div style={{ borderTop: `1px solid ${T.border}`, padding: 12, flexShrink: 0 }}>
                {/* Quick actions */}
                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                  <button onClick={generateAiDraft} disabled={aiLoading}
                    style={{ padding: "5px 10px", fontSize: 11, fontWeight: 600, borderRadius: 5, border: `1px solid #a855f740`, background: "#a855f710", color: "#a855f7", cursor: "pointer" }}>
                    {aiLoading ? "✨ Thinking..." : "✨ AI Draft"}
                  </button>
                  <button onClick={() => setShowMacros(!showMacros)}
                    style={{ padding: "5px 10px", fontSize: 11, fontWeight: 600, borderRadius: 5, border: `1px solid ${T.border}`, background: T.surface, color: T.text2, cursor: "pointer" }}>
                    ⚡ Macros
                  </button>
                  <button onClick={() => sendReply(replyText, "internal_note", "agent")}
                    style={{ padding: "5px 10px", fontSize: 11, fontWeight: 600, borderRadius: 5, border: `1px solid #f59e0b40`, background: "#f59e0b10", color: "#f59e0b", cursor: "pointer" }}>
                    📝 Note
                  </button>
                </div>
                {/* Macros dropdown */}
                {showMacros && (
                  <div style={{ marginBottom: 8, maxHeight: 150, overflow: "auto", border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface }}>
                    {macros.map(m => (
                      <div key={m.id} onClick={() => { setReplyText(m.content.replace(/\{customer_name\}/g, selected.customer_name || "there").replace(/\{agent_name\}/g, profile?.display_name || "Agent")); setShowMacros(false); }}
                        style={{ padding: "6px 10px", fontSize: 11, cursor: "pointer", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between" }}
                        onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                        onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <span style={{ fontWeight: 600, color: T.text }}>{m.name}</span>
                        {m.shortcut && <span style={{ color: T.text3, fontFamily: "monospace" }}>{m.shortcut}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {/* Textarea + send */}
                <div style={{ display: "flex", gap: 8 }}>
                  <textarea value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Type your reply..."
                    rows={3} style={{ flex: 1, padding: "8px 12px", fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 8, background: T.surface, color: T.text, outline: "none", resize: "vertical", lineHeight: 1.5, fontFamily: "inherit" }}
                    onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendReply(replyText); } }} />
                  <button onClick={() => sendReply(replyText)} disabled={!replyText.trim() || sending}
                    style={{ padding: "8px 16px", background: T.accent, color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", alignSelf: "flex-end", opacity: !replyText.trim() || sending ? 0.5 : 1 }}>
                    {sending ? "..." : "Send"}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, color: T.text3 }}>
              <span style={{ fontSize: 48 }}>🎧</span>
              <span style={{ fontSize: 16, fontWeight: 600 }}>Select a ticket or create a new one</span>
              <span style={{ fontSize: 12 }}>Your support inbox for Earth Breeze</span>
            </div>
          )}
        </>}

        {/* AI Agent Configuration Panel */}
        {tab === "ai_agent" && aiConfig && (() => {
          const updateAiConfig = async (field, value) => {
            const updated = { ...aiConfig, [field]: value, updated_at: new Date().toISOString() };
            setAiConfig(updated);
            await supabase.from("cx_ai_config").update({ [field]: value, updated_at: new Date().toISOString() }).eq("id", aiConfig.id);
          };
          const S = (label, desc, children) => (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 2 }}>{label}</div>
              {desc && <div style={{ fontSize: 11, color: T.text3, marginBottom: 8 }}>{desc}</div>}
              {children}
            </div>
          );
          const Inp = ({ value, onChange, placeholder, multiline, rows }) => multiline
            ? <textarea value={value || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={rows || 3}
                style={{ width: "100%", padding: "8px 12px", fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 8, background: T.surface, color: T.text, outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.5, boxSizing: "border-box" }}
                onBlur={e => onChange(e.target.value)} />
            : <input value={value || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder}
                style={{ width: "100%", padding: "8px 12px", fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 8, background: T.surface, color: T.text, outline: "none", boxSizing: "border-box" }} />;
          const Sel = ({ value, onChange, options }) => (
            <select value={value || ""} onChange={e => onChange(e.target.value)}
              style={{ padding: "8px 12px", fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 8, background: T.surface, color: T.text, cursor: "pointer" }}>
              {options.map(o => <option key={o.value || o} value={o.value || o}>{o.label || o}</option>)}
            </select>
          );
          const Toggle = ({ value, onChange, label }) => (
            <div onClick={() => onChange(!value)} style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "6px 0" }}>
              <div style={{ width: 40, height: 22, borderRadius: 11, background: value ? "#22c55e" : T.surface3, transition: "background 0.2s", position: "relative" }}>
                <div style={{ width: 18, height: 18, borderRadius: 9, background: "#fff", position: "absolute", top: 2, left: value ? 20 : 2, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
              </div>
              <span style={{ fontSize: 12, color: T.text }}>{label}</span>
            </div>
          );
          const TagInput = CxTagInput;
          const samples = aiConfig.sample_responses || [];
          return (
            <div style={{ flex: 1, overflow: "auto", padding: 24, maxWidth: 800, margin: "0 auto" }}>
              {/* Agent Identity */}
              <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28, padding: 20, borderRadius: 12, background: `linear-gradient(135deg, #a855f710 0%, #3b82f610 100%)`, border: `1px solid ${T.border}` }}>
                <div onClick={() => {
                  const emojis = ["🌿","🤖","💬","🌊","✨","🧹","🫧","🌍","💚","🌱","☀️","🍃"];
                  const idx = emojis.indexOf(aiConfig.agent_avatar);
                  updateAiConfig("agent_avatar", emojis[(idx + 1) % emojis.length]);
                }} style={{ width: 64, height: 64, borderRadius: 32, background: T.surface, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, cursor: "pointer", border: `2px solid ${T.border}`, flexShrink: 0 }} title="Click to change avatar">
                  {aiConfig.agent_avatar || "🤖"}
                </div>
                <div style={{ flex: 1 }}>
                  <input value={aiConfig.agent_name || ""} onChange={e => updateAiConfig("agent_name", e.target.value)}
                    style={{ fontSize: 22, fontWeight: 800, color: T.text, background: "transparent", border: "none", outline: "none", width: "100%", padding: 0, marginBottom: 4 }}
                    placeholder="Agent Name" />
                  <input value={aiConfig.agent_role || ""} onChange={e => updateAiConfig("agent_role", e.target.value)}
                    style={{ fontSize: 13, color: T.text3, background: "transparent", border: "none", outline: "none", width: "100%", padding: 0 }}
                    placeholder="Role / Title" />
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                  <div style={{ padding: "4px 12px", borderRadius: 6, background: aiConfig.enabled ? "#22c55e20" : "#ef444420", color: aiConfig.enabled ? "#22c55e" : "#ef4444", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                    onClick={() => updateAiConfig("enabled", !aiConfig.enabled)}>
                    {aiConfig.enabled ? "● Active" : "○ Inactive"}
                  </div>
                  <span style={{ fontSize: 10, color: T.text3 }}>Model: {aiConfig.model || "claude-sonnet-4-6"}</span>
                </div>
              </div>

              {/* Personality & Voice */}
              <div style={{ padding: 20, borderRadius: 12, border: `1px solid ${T.border}`, background: T.surface, marginBottom: 16 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>🎭 Personality & Voice</div>
                {S("Brand Voice", "How should the agent represent Earth Breeze? This shapes every response.",
                  <Inp value={aiConfig.brand_voice} onChange={v => updateAiConfig("brand_voice", v)} multiline rows={3}
                    placeholder="e.g. Earth Breeze is a friendly, eco-conscious brand..." />
                )}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  {S("Tone", "Overall communication style", <Sel value={aiConfig.tone} onChange={v => updateAiConfig("tone", v)}
                    options={[{value:"friendly",label:"😊 Friendly"},{value:"professional",label:"👔 Professional"},{value:"casual",label:"🤙 Casual"},{value:"empathetic",label:"💛 Empathetic"}]} />)}
                  {S("Writing Style", null, <Sel value={aiConfig.writing_style} onChange={v => updateAiConfig("writing_style", v)}
                    options={["conversational","formal","concise","detailed"].map(s => ({value:s,label:s.charAt(0).toUpperCase()+s.slice(1)}))} />)}
                  {S("Response Length", null, <Sel value={aiConfig.response_length} onChange={v => updateAiConfig("response_length", v)}
                    options={[{value:"short",label:"Short (1-2 paragraphs)"},{value:"medium",label:"Medium (2-3 paragraphs)"},{value:"detailed",label:"Detailed (3-4 paragraphs)"}]} />)}
                  {S("Emoji Usage", null, <Sel value={aiConfig.emoji_usage} onChange={v => updateAiConfig("emoji_usage", v)}
                    options={[{value:"never",label:"Never"},{value:"occasional",label:"Occasional 🌿"},{value:"frequent",label:"Frequent 🎉🌍💚"}]} />)}
                </div>
                {S("Personality Traits", "What traits define this agent?",
                  <TagInput T={T} values={aiConfig.personality_traits} onChange={v => updateAiConfig("personality_traits", v)} />
                )}
                {S("Sign-off", "How the agent ends messages",
                  <Inp value={aiConfig.sign_off} onChange={v => updateAiConfig("sign_off", v)} placeholder="e.g. Happy washing! 🌿" />
                )}
                {S("Greeting Template", "First message to new conversations",
                  <Inp value={aiConfig.greeting_template} onChange={v => updateAiConfig("greeting_template", v)} multiline rows={2} />
                )}
                {S("Handoff Message", "When escalating to a human agent",
                  <Inp value={aiConfig.handoff_message} onChange={v => updateAiConfig("handoff_message", v)} multiline rows={2} />
                )}
              </div>

              {/* Automation & Capabilities */}
              <div style={{ padding: 20, borderRadius: 12, border: `1px solid ${T.border}`, background: T.surface, marginBottom: 16 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>⚡ Automation & Capabilities</div>
                <Toggle value={aiConfig.auto_resolve_enabled} onChange={v => updateAiConfig("auto_resolve_enabled", v)} label="Auto-resolve tickets (AI sends response without agent review)" />
                {aiConfig.auto_resolve_enabled && S("Confidence Threshold", "AI only auto-resolves when confidence is above this level",
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input type="range" min="0.5" max="0.99" step="0.01" value={aiConfig.auto_resolve_confidence_threshold || 0.85}
                      onChange={e => updateAiConfig("auto_resolve_confidence_threshold", parseFloat(e.target.value))}
                      style={{ flex: 1 }} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: T.accent, minWidth: 40 }}>{Math.round((aiConfig.auto_resolve_confidence_threshold || 0.85) * 100)}%</span>
                  </div>
                )}
                {S("Max Auto-Responses per Ticket", null,
                  <Sel value={String(aiConfig.max_auto_responses || 3)} onChange={v => updateAiConfig("max_auto_responses", parseInt(v))}
                    options={[1,2,3,5,10].map(n => ({value:String(n), label:String(n)}))} />
                )}
                <div style={{ borderTop: `1px solid ${T.border}`, margin: "16px 0", paddingTop: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 10 }}>🔐 Agent Permissions</div>
                  <Toggle value={aiConfig.can_issue_refunds} onChange={v => updateAiConfig("can_issue_refunds", v)} label="Can issue refunds" />
                  <Toggle value={aiConfig.can_modify_subscriptions} onChange={v => updateAiConfig("can_modify_subscriptions", v)} label="Can modify subscriptions" />
                  <Toggle value={aiConfig.can_offer_discounts} onChange={v => updateAiConfig("can_offer_discounts", v)} label="Can offer discounts" />
                  {aiConfig.can_offer_discounts && S("Max Discount %", null,
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <input type="range" min="5" max="50" step="5" value={aiConfig.max_discount_pct || 20}
                        onChange={e => updateAiConfig("max_discount_pct", parseInt(e.target.value))} style={{ flex: 1 }} />
                      <span style={{ fontSize: 13, fontWeight: 700, color: T.accent, minWidth: 40 }}>{aiConfig.max_discount_pct || 20}%</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Channels & Routing */}
              <div style={{ padding: 20, borderRadius: 12, border: `1px solid ${T.border}`, background: T.surface, marginBottom: 16 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>📡 Channels & Routing</div>
                {S("Active Channels", "Which channels should the AI agent handle?",
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {[{key:"email",icon:"📧",label:"Email"},{key:"chat",icon:"💬",label:"Chat"},{key:"social_instagram",icon:"📸",label:"Instagram"},{key:"social_facebook",icon:"📘",label:"Facebook"},{key:"social_tiktok",icon:"🎵",label:"TikTok"},{key:"social_twitter",icon:"🐦",label:"Twitter"},{key:"phone",icon:"📞",label:"Phone"}].map(ch => {
                      const active = (aiConfig.auto_assign_channels || []).includes(ch.key);
                      return (
                        <button key={ch.key} onClick={() => {
                          const next = active ? (aiConfig.auto_assign_channels || []).filter(c => c !== ch.key) : [...(aiConfig.auto_assign_channels || []), ch.key];
                          updateAiConfig("auto_assign_channels", next);
                        }} style={{ padding: "6px 12px", borderRadius: 6, border: `1px solid ${active ? T.accent + "50" : T.border}`, background: active ? T.accentDim : "transparent", color: active ? T.accent : T.text3, fontSize: 11, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                          {ch.icon} {ch.label}
                        </button>
                      );
                    })}
                  </div>
                )}
                <Toggle value={aiConfig.business_hours_only} onChange={v => updateAiConfig("business_hours_only", v)} label="Only active during business hours" />
                {aiConfig.business_hours_only && (
                  <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 8 }}>
                    <input type="time" value={aiConfig.business_hours_start || "09:00"} onChange={e => updateAiConfig("business_hours_start", e.target.value)}
                      style={{ padding: "6px 10px", fontSize: 12, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface, color: T.text }} />
                    <span style={{ color: T.text3 }}>to</span>
                    <input type="time" value={aiConfig.business_hours_end || "17:00"} onChange={e => updateAiConfig("business_hours_end", e.target.value)}
                      style={{ padding: "6px 10px", fontSize: 12, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface, color: T.text }} />
                    <Sel value={aiConfig.business_hours_tz || "America/Los_Angeles"} onChange={v => updateAiConfig("business_hours_tz", v)}
                      options={["America/Los_Angeles","America/Denver","America/Chicago","America/New_York","Europe/London","Australia/Sydney"].map(tz => ({value:tz,label:tz.split("/")[1].replace("_"," ")}))} />
                  </div>
                )}
              </div>

              {/* Guardrails */}
              <div style={{ padding: 20, borderRadius: 12, border: `1px solid ${T.border}`, background: T.surface, marginBottom: 16 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>🛡️ Guardrails</div>
                {S("Escalation Triggers", "Keywords or phrases that automatically escalate to a human",
                  <TagInput T={T} values={aiConfig.escalation_triggers} onChange={v => updateAiConfig("escalation_triggers", v)} />
                )}
                {S("Restricted Topics", "Topics the AI should never discuss — it will escalate instead",
                  <TagInput T={T} values={aiConfig.restricted_topics} onChange={v => updateAiConfig("restricted_topics", v)} />
                )}
                {S("Languages", "Languages the agent can respond in",
                  <TagInput T={T} values={aiConfig.languages} onChange={v => updateAiConfig("languages", v)} />
                )}
              </div>

              {/* Sample Responses / Persona Preview */}
              <div style={{ padding: 20, borderRadius: 12, border: `1px solid ${T.border}`, background: T.surface, marginBottom: 16 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>💬 Sample Responses</div>
                <div style={{ fontSize: 11, color: T.text3, marginBottom: 16 }}>Example responses that teach the AI how {aiConfig.agent_name || "the agent"} should sound</div>
                {samples.map((s, i) => (
                  <div key={i} style={{ marginBottom: 12, padding: 12, borderRadius: 8, background: T.surface2, border: `1px solid ${T.border}` }}>
                    <input value={s.scenario || ""} onChange={e => {
                      const u = [...samples]; u[i] = { ...u[i], scenario: e.target.value };
                      updateAiConfig("sample_responses", u);
                    }} placeholder="Scenario name" style={{ width: "100%", padding: "4px 8px", fontSize: 11, fontWeight: 700, color: T.accent, background: "transparent", border: "none", outline: "none", marginBottom: 6, boxSizing: "border-box" }} />
                    <textarea value={s.response || ""} onChange={e => {
                      const u = [...samples]; u[i] = { ...u[i], response: e.target.value };
                      updateAiConfig("sample_responses", u);
                    }} rows={3} style={{ width: "100%", padding: "6px 8px", fontSize: 12, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface, color: T.text, outline: "none", resize: "vertical", fontFamily: "inherit", lineHeight: 1.5, boxSizing: "border-box" }} />
                    <button onClick={() => { const u = samples.filter((_, j) => j !== i); updateAiConfig("sample_responses", u); }}
                      style={{ fontSize: 10, color: "#ef4444", background: "none", border: "none", cursor: "pointer", marginTop: 4 }}>Remove</button>
                  </div>
                ))}
                <button onClick={() => updateAiConfig("sample_responses", [...samples, { scenario: "", response: "" }])}
                  style={{ padding: "6px 14px", fontSize: 11, fontWeight: 600, borderRadius: 6, border: `1px dashed ${T.border}`, background: "transparent", color: T.text3, cursor: "pointer" }}>
                  + Add Sample Response
                </button>
              </div>

              {/* AI Test Chat */}
              <div style={{ padding: 20, borderRadius: 12, border: `1px solid ${T.border}`, background: T.surface, marginBottom: 16 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>🧪 Test Your Agent</div>
                <div style={{ fontSize: 11, color: T.text3, marginBottom: 12 }}>Chat with {aiConfig.agent_name || "your agent"} to see how it responds. Uses your current persona settings + knowledge base.</div>
                <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden" }}>
                  <div style={{ height: 280, overflow: "auto", padding: 12, display: "flex", flexDirection: "column", gap: 8, background: T.bg }}>
                    {testMsgs.length === 0 && (
                      <div style={{ textAlign: "center", color: T.text3, fontSize: 12, padding: 40 }}>
                        Type a message to test how {aiConfig.agent_name || "your agent"} responds
                      </div>
                    )}
                    {testMsgs.map((m, i) => (
                      <div key={i} style={{ display: "flex", flexDirection: m.role === "customer" ? "row-reverse" : "row", gap: 6 }}>
                        <div style={{ width: 26, height: 26, borderRadius: 13, background: m.role === "customer" ? T.accent + "20" : "#a855f720", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, flexShrink: 0 }}>
                          {m.role === "customer" ? "👤" : aiConfig.agent_avatar || "🤖"}
                        </div>
                        <div style={{ maxWidth: "80%", padding: "8px 12px", borderRadius: 10, background: m.role === "customer" ? T.accent + "15" : T.surface2, border: `1px solid ${m.role === "customer" ? T.accent + "30" : T.border}`, fontSize: 12, color: T.text, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                          {m.text}
                        </div>
                      </div>
                    ))}
                    {testLoading && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <div style={{ width: 26, height: 26, borderRadius: 13, background: "#a855f720", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11 }}>{aiConfig.agent_avatar || "🤖"}</div>
                        <div style={{ padding: "8px 12px", borderRadius: 10, background: T.surface2, border: `1px solid ${T.border}`, fontSize: 12, color: T.text3 }}>Thinking...</div>
                      </div>
                    )}
                    <div ref={testEndRef} />
                  </div>
                  <div style={{ display: "flex", gap: 6, padding: 8, borderTop: `1px solid ${T.border}`, background: T.surface }}>
                    <input value={testInput} onChange={e => setTestInput(e.target.value)} placeholder="Type as a customer..."
                      onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); if (!testInput.trim() || testLoading) return; const userMsg = testInput; setTestMsgs(p => [...p, { role: "customer", text: userMsg }]); setTestInput(""); setTestLoading(true); (async () => { try { const { data: { session } } = await supabase.auth.getSession(); const res = await fetch(supabase.supabaseUrl + "/functions/v1/cx-ai-draft", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` }, body: JSON.stringify({ ticket: { subject: "Test conversation", category: "general", channel: "chat", customer_name: "Test Customer" }, messages: [...testMsgs, { role: "customer", text: userMsg }].map(m => `[${m.role}]: ${m.text}`).join("\n") }) }); const result = await res.json(); setTestMsgs(p => [...p, { role: "agent", text: result.draft || "No response generated" }]); } catch (e) { setTestMsgs(p => [...p, { role: "agent", text: `Error: ${e.message}` }]); } setTestLoading(false); setTimeout(() => testEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100); })(); } }}
                      style={{ flex: 1, padding: "7px 10px", fontSize: 12, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface2, color: T.text, outline: "none" }} />
                    <button onClick={() => { if (!testInput.trim() || testLoading) return; const userMsg = testInput; setTestMsgs(p => [...p, { role: "customer", text: userMsg }]); setTestInput(""); setTestLoading(true); (async () => { try { const { data: { session } } = await supabase.auth.getSession(); const res = await fetch(supabase.supabaseUrl + "/functions/v1/cx-ai-draft", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session?.access_token}` }, body: JSON.stringify({ ticket: { subject: "Test conversation", category: "general", channel: "chat", customer_name: "Test Customer" }, messages: [...testMsgs, { role: "customer", text: userMsg }].map(m => `[${m.role}]: ${m.text}`).join("\n") }) }); const result = await res.json(); setTestMsgs(p => [...p, { role: "agent", text: result.draft || "No response generated" }]); } catch (e) { setTestMsgs(p => [...p, { role: "agent", text: `Error: ${e.message}` }]); } setTestLoading(false); setTimeout(() => testEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100); })(); }}
                      disabled={testLoading || !testInput.trim()}
                      style={{ padding: "7px 14px", background: T.accent, color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", opacity: testLoading || !testInput.trim() ? 0.5 : 1 }}>Send</button>
                    {testMsgs.length > 0 && <button onClick={() => setTestMsgs([])} style={{ padding: "7px 10px", background: T.surface2, color: T.text3, border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 11, cursor: "pointer" }}>Clear</button>}
                  </div>
                </div>
              </div>

              {/* Social Media Monitoring Config */}
              <div style={{ padding: 20, borderRadius: 12, border: `1px solid ${T.border}`, background: T.surface, marginBottom: 16 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>📱 Social Media Monitoring</div>
                <div style={{ fontSize: 11, color: T.text3, marginBottom: 16 }}>Configure social listening and auto-engagement rules (replaces BrandBastian)</div>

                {/* Connected Accounts */}
                {S("Connected Accounts", "Connect your social media accounts for monitoring",
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[
                      { key: "instagram", icon: "📸", label: "Instagram", handle: "@myearthbreeze", color: "#E1306C", connected: true },
                      { key: "facebook", icon: "📘", label: "Facebook", handle: "Earth Breeze", color: "#1877F2", connected: true },
                      { key: "tiktok", icon: "🎵", label: "TikTok", handle: "@earthbreeze", color: "#000000", connected: false },
                      { key: "twitter", icon: "🐦", label: "X / Twitter", handle: "@earthbreeze", color: "#1DA1F2", connected: false },
                    ].map(ch => (
                      <div key={ch.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", borderRadius: 8, border: `1px solid ${ch.connected ? ch.color + "40" : T.border}`, background: ch.connected ? ch.color + "08" : "transparent" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 18 }}>{ch.icon}</span>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{ch.label}</div>
                            <div style={{ fontSize: 11, color: T.text3 }}>{ch.handle}</div>
                          </div>
                        </div>
                        <button style={{ padding: "5px 14px", fontSize: 11, fontWeight: 600, borderRadius: 6, border: `1px solid ${ch.connected ? "#22c55e40" : T.accent + "40"}`, background: ch.connected ? "#22c55e10" : T.accentDim, color: ch.connected ? "#22c55e" : T.accent, cursor: "pointer" }}>
                          {ch.connected ? "✓ Connected" : "Connect"}
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Monitoring Rules */}
                {S("Monitoring Keywords", "Track brand mentions, hashtags, and competitor mentions",
                  <TagInput T={T} values={["earthbreeze","earth breeze","#earthbreeze","#ecofriendly","laundry sheets"]} onChange={() => {}} />
                )}
                {S("Competitor Monitoring", "Track competitor brand mentions for market intelligence",
                  <TagInput T={T} values={["tru earth","blueland","sheets laundry club","dropps"]} onChange={() => {}} />
                )}

                {/* Auto-Engagement Rules */}
                <div style={{ borderTop: `1px solid ${T.border}`, margin: "16px 0", paddingTop: 16 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 10 }}>🤖 Auto-Engagement Rules</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[
                      { trigger: "Positive mention / review", action: "Thank them + like post", enabled: true },
                      { trigger: "Product question in comments", action: "Auto-reply with helpful answer", enabled: true },
                      { trigger: "Negative mention / complaint", action: "Create urgent ticket + flag for human", enabled: true },
                      { trigger: "UGC / customer photo", action: "Like + comment + flag for repost consideration", enabled: false },
                      { trigger: "Influencer mention (>10K followers)", action: "Create VIP ticket + notify marketing", enabled: false },
                    ].map((rule, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2 }}>
                        <div onClick={() => {}} style={{ width: 32, height: 18, borderRadius: 9, background: rule.enabled ? "#22c55e" : T.surface3, position: "relative", cursor: "pointer", flexShrink: 0 }}>
                          <div style={{ width: 14, height: 14, borderRadius: 7, background: "#fff", position: "absolute", top: 2, left: rule.enabled ? 16 : 2, transition: "left 0.2s", boxShadow: "0 1px 2px rgba(0,0,0,0.2)" }} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{rule.trigger}</div>
                          <div style={{ fontSize: 10, color: T.text3 }}>→ {rule.action}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Sentiment Alerts */}
                {S("Sentiment Alert Threshold", "Get notified when negative sentiment spikes",
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 12, color: T.text3 }}>Alert when negative mentions exceed</span>
                    <select defaultValue="5" style={{ padding: "4px 8px", fontSize: 12, border: `1px solid ${T.border}`, borderRadius: 4, background: T.surface, color: T.text }}>
                      <option value="3">3 / hour</option><option value="5">5 / hour</option><option value="10">10 / hour</option><option value="25">25 / hour</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Intent Recognition & Workflows */}
              <div style={{ padding: 20, borderRadius: 12, border: `1px solid ${T.border}`, background: T.surface, marginBottom: 16 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>🧠 Intent Recognition & Workflows</div>
                <div style={{ fontSize: 11, color: T.text3, marginBottom: 16 }}>Map customer intents to automated actions (like Siena AI flows)</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {[
                    { intent: "Cancel subscription", confidence: "92%", action: "Run save flow → offer skip/pause/discount → escalate if insistent", tickets: 147 },
                    { intent: "Where is my order?", confidence: "95%", action: "Look up order → provide tracking → send replacement if lost", tickets: 312 },
                    { intent: "Product not working", confidence: "88%", action: "Troubleshoot with KB → offer replacement → escalate if unresolved", tickets: 89 },
                    { intent: "Request refund", confidence: "90%", action: "Check order history → process refund if eligible → confirm timeline", tickets: 63 },
                    { intent: "Change subscription", confidence: "94%", action: "Identify change type → walk through steps → confirm update", tickets: 201 },
                    { intent: "Positive feedback", confidence: "97%", action: "Thank customer → share impact stats → ask for review", tickets: 156 },
                    { intent: "Billing question", confidence: "91%", action: "Look up charges → explain → resolve discrepancy", tickets: 78 },
                  ].map((flow, i) => (
                    <div key={i} style={{ padding: "10px 14px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface2, display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 8, height: 8, borderRadius: 4, background: "#22c55e", flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{flow.intent}</span>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <span style={{ fontSize: 10, color: "#22c55e", fontWeight: 600 }}>{flow.confidence} match</span>
                            <span style={{ fontSize: 10, color: T.text3 }}>{flow.tickets} tickets</span>
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: T.text3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{flow.action}</div>
                      </div>
                    </div>
                  ))}
                </div>
                <button style={{ marginTop: 10, padding: "6px 14px", fontSize: 11, fontWeight: 600, borderRadius: 6, border: `1px dashed ${T.border}`, background: "transparent", color: T.text3, cursor: "pointer" }}>+ Add Intent Flow</button>
              </div>

              {/* Agent Performance Preview */}
              <div style={{ padding: 20, borderRadius: 12, border: `1px solid ${T.border}`, background: T.surface, marginBottom: 16 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>📈 Agent Performance</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
                  {[
                    { label: "AI Resolution Rate", value: stats.ai_resolved > 0 ? Math.round(stats.ai_resolved / Math.max(1, tickets.length) * 100) + "%" : "—", target: ">60%", icon: "🤖" },
                    { label: "Avg Response Time", value: stats.avg_response > 0 ? stats.avg_response + "m" : "—", target: "<2 min", icon: "⚡" },
                    { label: "Customer Satisfaction", value: stats.csat > 0 ? stats.csat.toFixed(1) : "—", target: ">4.5", icon: "⭐" },
                    { label: "Escalation Rate", value: tickets.filter(t => t.status === "escalated").length > 0 ? Math.round(tickets.filter(t => t.status === "escalated").length / Math.max(1, tickets.length) * 100) + "%" : "—", target: "<15%", icon: "🔄" },
                    { label: "Tickets Handled", value: String(tickets.length), target: "", icon: "🎫" },
                    { label: "Mentions Moderated", value: String(socialMentions.filter(m => m.moderation_status === "reviewed" || m.moderation_status === "flagged").length), target: "", icon: "🛡" },
                  ].map(k => (
                    <div key={k.label} style={{ padding: 12, borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface2, textAlign: "center" }}>
                      <div style={{ fontSize: 20, marginBottom: 4 }}>{k.icon}</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>{k.value}</div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: T.text3, textTransform: "uppercase" }}>{k.label}</div>
                      {k.target && <div style={{ fontSize: 9, color: T.accent, marginTop: 2 }}>Target: {k.target}</div>}
                    </div>
                  ))}
                </div>
              </div>

              {/* Auto-Moderation Settings */}
              <div style={{ padding: 20, borderRadius: 12, border: `1px solid #0ea5e930`, background: "#0ea5e905", marginBottom: 16 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>🛡 Auto-Moderation</div>
                <div style={{ fontSize: 11, color: T.text3, marginBottom: 16 }}>When enabled, new social mentions are automatically classified by AI and keyword rules take action instantly.</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div>
                    <Toggle value={aiConfig.auto_resolve_enabled} onChange={v => updateAiConfig("auto_resolve_enabled", v)} label="Auto-moderate new mentions" />
                    <Toggle value={!aiConfig.business_hours_only} onChange={v => updateAiConfig("business_hours_only", !v)} label="Run 24/7 (not just business hours)" />
                    <Toggle value={aiConfig.can_offer_discounts} onChange={v => updateAiConfig("can_offer_discounts", v)} label="AI can suggest discounts in replies" />
                  </div>
                  <div>
                    {S("Auto-hide threshold", "Hide comments with risk above this level",
                      <Sel value={aiConfig.auto_resolve_confidence_threshold > 0.9 ? "critical" : aiConfig.auto_resolve_confidence_threshold > 0.7 ? "high" : "medium"}
                        onChange={v => updateAiConfig("auto_resolve_confidence_threshold", v === "critical" ? 0.95 : v === "high" ? 0.85 : 0.7)}
                        options={[{value:"critical",label:"Critical only"},{value:"high",label:"High + Critical"},{value:"medium",label:"Medium + High + Critical"}]} />
                    )}
                    {S("Max auto-responses", "Per conversation",
                      <Sel value={String(aiConfig.max_auto_responses || 3)} onChange={v => updateAiConfig("max_auto_responses", Number(v))}
                        options={[{value:"1",label:"1 response"},{value:"3",label:"3 responses"},{value:"5",label:"5 responses"},{value:"10",label:"10 responses"}]} />
                    )}
                  </div>
                </div>
                <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: T.surface, border: `1px solid ${T.border}` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.text, marginBottom: 6 }}>Active Moderation Rules</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {moderationRules.filter(r => r.is_active).map(r => (
                      <span key={r.id} style={{ fontSize: 10, padding: "3px 8px", borderRadius: 4, background: r.action === "hide" ? "#ef444415" : r.action === "escalate" ? "#f59e0b15" : T.surface2, color: r.action === "hide" ? "#ef4444" : r.action === "escalate" ? "#f59e0b" : T.text2, fontWeight: 600 }}>
                        {r.action === "hide" ? "🚫" : r.action === "escalate" ? "🔴" : r.action === "flag" ? "🚩" : "🏷"} {r.name} ({r.keywords?.length || 0} keywords)
                      </span>
                    ))}
                    {moderationRules.filter(r => r.is_active).length === 0 && <span style={{ fontSize: 10, color: T.text3 }}>No active rules. Go to the Moderation tab to set up rules.</span>}
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Knowledge Base tab */}
        {tab === "kb" && (() => {
          return (
          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
            {/* Article list */}
            <div style={{ width: 320, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", overflow: "hidden", flexShrink: 0 }}>
              <div style={{ padding: 10, borderBottom: `1px solid ${T.border}`, display: "flex", gap: 6, alignItems: "center" }}>
                <span style={{ fontSize: 14 }}>📖</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: T.text, flex: 1 }}>Knowledge Base</span>
                <span style={{ fontSize: 10, color: T.text3 }}>{kbArticles.length} articles</span>
                <button onClick={async () => {
                  const { data } = await supabase.from("cx_kb_articles").insert({ org_id: profile?.org_id, title: "New Article", content: "", category: "general", status: "draft", created_by: user?.id }).select().single();
                  if (data) { setKbArticles(p => [data, ...p]); setSelected(data); setTab("kb"); }
                }} style={{ padding: "4px 10px", background: T.accent, color: "#fff", border: "none", borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: "pointer" }}>+</button>
              </div>
              <div style={{ flex: 1, overflow: "auto" }}>
                {kbArticles.map(a => {
                  const catColors = { shipping: "#3b82f6", subscription: "#8b5cf6", product: "#f97316", billing: "#f59e0b", account: "#06b6d4", troubleshooting: "#ef4444", returns: "#22c55e", general: "#6b7280", policy: "#dc2626", faq: "#8b5cf6" };
                  return (
                    <div key={a.id} onClick={() => setSelected(a)}
                      style={{ padding: "10px 12px", borderBottom: `1px solid ${T.border}`, cursor: "pointer",
                        background: selected?.id === a.id ? T.accentDim : "transparent" }}
                      onMouseEnter={e => { if (selected?.id !== a.id) e.currentTarget.style.background = T.surface2; }}
                      onMouseLeave={e => { if (selected?.id !== a.id) e.currentTarget.style.background = "transparent"; }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.title}</div>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: (catColors[a.category] || "#6b7280") + "20", color: catColors[a.category] || "#6b7280", fontWeight: 600 }}>{a.category}</span>
                        <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: a.status === "published" ? "#22c55e20" : "#f59e0b20", color: a.status === "published" ? "#22c55e" : "#f59e0b", fontWeight: 600 }}>{a.status}</span>
                        {a.is_internal && <span style={{ fontSize: 9, color: T.text3 }}>🔒</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Article detail / editor */}
            {selected && selected.title !== undefined && selected.content !== undefined ? (
              <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <div style={{ padding: "10px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  <input value={selected.title} onChange={e => setSelected(s => ({ ...s, title: e.target.value }))}
                    onBlur={e => supabase.from("cx_kb_articles").update({ title: e.target.value }).eq("org_id", orgId).eq("id", selected.id)}
                    style={{ flex: 1, fontSize: 15, fontWeight: 700, color: T.text, background: "transparent", border: "none", outline: "none", padding: 0 }} />
                  <select value={selected.category} onChange={async e => {
                    const v = e.target.value;
                    setSelected(s => ({ ...s, category: v }));
                    await supabase.from("cx_kb_articles").update({ category: v }).eq("org_id", orgId).eq("id", selected.id);
                    setKbArticles(p => p.map(a => a.id === selected.id ? { ...a, category: v } : a));
                  }} style={{ padding: "3px 6px", fontSize: 10, border: `1px solid ${T.border}`, borderRadius: 4, background: T.surface, color: T.text }}>
                    {["general", "shipping", "returns", "subscription", "product", "billing", "account", "troubleshooting", "policy", "faq"].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select value={selected.status} onChange={async e => {
                    const v = e.target.value;
                    setSelected(s => ({ ...s, status: v }));
                    await supabase.from("cx_kb_articles").update({ status: v }).eq("org_id", orgId).eq("id", selected.id);
                    setKbArticles(p => p.map(a => a.id === selected.id ? { ...a, status: v } : a));
                  }} style={{ padding: "3px 6px", fontSize: 10, border: `1px solid ${T.border}`, borderRadius: 4, background: selected.status === "published" ? "#22c55e15" : T.surface, color: selected.status === "published" ? "#22c55e" : T.text }}>
                    <option value="draft">Draft</option><option value="published">Published</option><option value="archived">Archived</option>
                  </select>
                  <button onClick={async () => { await supabase.from("cx_kb_articles").delete().eq("org_id", orgId).eq("id", selected.id); setKbArticles(p => p.filter(a => a.id !== selected.id)); setSelected(null); }}
                    style={{ padding: "3px 8px", fontSize: 10, color: "#ef4444", background: "#ef444410", border: `1px solid #ef444430`, borderRadius: 4, cursor: "pointer" }}>Delete</button>
                </div>
                <textarea value={selected.content || ""} onChange={e => setSelected(s => ({ ...s, content: e.target.value }))}
                  onBlur={async e => {
                    await supabase.from("cx_kb_articles").update({ content: e.target.value, updated_at: new Date().toISOString() }).eq("org_id", orgId).eq("id", selected.id);
                    setKbArticles(p => p.map(a => a.id === selected.id ? { ...a, content: e.target.value } : a));
                  }}
                  style={{ flex: 1, padding: 16, fontSize: 13, color: T.text, background: T.bg, border: "none", outline: "none", resize: "none", fontFamily: "inherit", lineHeight: 1.7 }}
                  placeholder="Write article content here... This is what the AI agent reads when drafting replies." />
              </div>
            ) : (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 8, color: T.text3 }}>
                <span style={{ fontSize: 48 }}>📖</span>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Select an article to edit</span>
                <span style={{ fontSize: 11 }}>Articles train the AI agent on how to respond</span>
              </div>
            )}
          </div>
          );
        })()}

        {/* Macros tab */}
        {tab === "macros" && (
          <div style={{ flex: 1, padding: 20, overflow: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>⚡ Macros & Templates</h2>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {macros.map(m => (
                <div key={m.id} style={{ padding: 14, borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{m.name}</span>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {m.shortcut && <span style={{ fontSize: 10, color: T.text3, fontFamily: "monospace", background: T.surface2, padding: "2px 6px", borderRadius: 3 }}>{m.shortcut}</span>}
                      <span style={{ fontSize: 10, color: T.text3 }}>{m.category}</span>
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: T.text2, whiteSpace: "pre-wrap", lineHeight: 1.5, maxHeight: 80, overflow: "hidden" }}>{m.content}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Contacts tab */}
        {tab === "contacts" && (
          <div style={{ flex: 1, padding: 20, overflow: "auto" }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 16px 0" }}>👥 Contacts</h2>
            {contacts.length === 0 ? (
              <div style={{ padding: 30, textAlign: "center", color: T.text3 }}>Contacts will populate as tickets come in, or sync from Shopify.</div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 10 }}>
                {contacts.map(c => (
                  <div key={c.id} style={{ padding: 12, borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{c.name || "Unknown"}</div>
                    <div style={{ fontSize: 11, color: T.text3 }}>{c.email}</div>
                    <div style={{ display: "flex", gap: 12, marginTop: 6, fontSize: 10, color: T.text3 }}>
                      <span>{c.order_count} orders</span>
                      <span>{c.ticket_count} tickets</span>
                      {c.lifetime_value && <span>${c.lifetime_value} LTV</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Social Monitoring tab */}
        {tab === "social" && (
          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
            {/* Mention feed */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {/* Connected accounts strip */}
              <div style={{ display: "flex", gap: 8, padding: "10px 16px", borderBottom: `1px solid ${T.border}`, overflowX: "auto", flexShrink: 0, alignItems: "center" }}>
                {socialAccounts.map(a => (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 6, background: a.is_connected ? T.accentDim : T.surface2, border: `1px solid ${a.is_connected ? T.accent + "30" : T.border}`, flexShrink: 0 }}>
                    <span style={{ fontSize: 14 }}>{CHANNEL_ICONS["social_" + a.platform] || CHANNEL_ICONS[a.platform] || "📱"}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: a.is_connected ? T.accent : T.text3 }}>{a.account_handle}</span>
                    {a.follower_count > 0 && <span style={{ fontSize: 9, color: T.text3 }}>{a.follower_count > 1000 ? (a.follower_count / 1000).toFixed(0) + "K" : a.follower_count}</span>}
                    <span style={{ width: 6, height: 6, borderRadius: 3, background: a.is_connected ? "#22c55e" : "#ef4444" }} />
                    {a.is_connected && (
                      <button onClick={async (e) => {
                        e.stopPropagation();
                        const btn = e.currentTarget; btn.textContent = "🔄"; btn.disabled = true;
                        try {
                          const syncAction = a.platform === "instagram" ? "sync_ig_comments" : a.platform === "facebook" ? "sync_fb_comments" : a.platform === "tiktok" ? "sync_comments" : null;
                          const syncEndpoint = a.platform === "tiktok" ? "tiktok-social" : "meta-social";
                          if (syncAction) {
                            const res = await fetch(`https://upbjdmnykheubxkuknuj.supabase.co/functions/v1/${syncEndpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: syncAction, account_id: a.id, org_id: orgId }) });
                            const r = await res.json();
                            if (r.synced > 0) { const { data } = await supabase.from("cx_social_mentions").select("*").eq("org_id", orgId).order("posted_at", { ascending: false }).limit(200); setSocialMentions(data || []); }
                            btn.textContent = `✓ ${r.synced || 0}`;
                          }
                        } catch { btn.textContent = "✕"; }
                        setTimeout(() => { btn.textContent = "↻"; btn.disabled = false; }, 2000);
                      }} style={{ fontSize: 10, padding: "1px 4px", borderRadius: 3, border: `1px solid ${T.border}`, background: "transparent", color: T.text3, cursor: "pointer" }} title="Sync comments">↻</button>
                    )}
                  </div>
                ))}
                <div style={{ flex: 1 }} />
                <button onClick={async () => {
                  try {
                    const redirectUri = window.location.origin + "/api/meta-callback";
                    const res = await fetch("https://upbjdmnykheubxkuknuj.supabase.co/functions/v1/meta-social", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "get_oauth_url", redirect_uri: redirectUri }) });
                    const data = await res.json();
                    if (data.url) window.open(data.url, "_blank", "width=600,height=700");
                  } catch (e) { console.error("Meta OAuth error:", e); }
                }} style={{ padding: "4px 10px", fontSize: 10, fontWeight: 600, borderRadius: 5, border: `1px solid #1877F230`, background: "#1877F210", color: "#1877F2", cursor: "pointer", whiteSpace: "nowrap" }}>
                  📘 Connect Meta
                </button>
                <button onClick={async () => {
                  try {
                    const redirectUri = window.location.origin + "/api/tiktok-callback";
                    const res = await fetch("https://upbjdmnykheubxkuknuj.supabase.co/functions/v1/tiktok-social", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "get_oauth_url", redirect_uri: redirectUri }) });
                    const data = await res.json();
                    if (data.url) window.open(data.url, "_blank", "width=600,height=700");
                  } catch (e) { console.error("TikTok OAuth error:", e); }
                }} style={{ padding: "4px 10px", fontSize: 10, fontWeight: 600, borderRadius: 5, border: `1px solid #01010130`, background: "#01010108", color: T.text2, cursor: "pointer", whiteSpace: "nowrap" }}>
                  🎵 Connect TikTok
                </button>
              </div>
              {/* Filters */}
              <div style={{ display: "flex", gap: 6, padding: "8px 16px", borderBottom: `1px solid ${T.border}`, alignItems: "center", flexShrink: 0, flexWrap: "wrap" }}>
                <select value={socialFilter.platform} onChange={e => setSocialFilter(f => ({ ...f, platform: e.target.value }))}
                  style={{ padding: "4px 8px", fontSize: 11, border: `1px solid ${T.border}`, borderRadius: 4, background: T.surface, color: T.text, cursor: "pointer" }}>
                  <option value="all">All Platforms</option>
                  <option value="instagram">📸 Instagram</option><option value="facebook">📘 Facebook</option>
                  <option value="tiktok">🎵 TikTok</option><option value="twitter">🐦 Twitter</option>
                </select>
                <select value={socialFilter.status} onChange={e => setSocialFilter(f => ({ ...f, status: e.target.value }))}
                  style={{ padding: "4px 8px", fontSize: 11, border: `1px solid ${T.border}`, borderRadius: 4, background: T.surface, color: T.text, cursor: "pointer" }}>
                  <option value="all">All Status</option><option value="new">🔵 New</option>
                  <option value="replied">✅ Replied</option><option value="escalated">🔴 Escalated</option><option value="ignored">⚫ Ignored</option>
                </select>
                <select value={socialFilter.sentiment} onChange={e => setSocialFilter(f => ({ ...f, sentiment: e.target.value }))}
                  style={{ padding: "4px 8px", fontSize: 11, border: `1px solid ${T.border}`, borderRadius: 4, background: T.surface, color: T.text, cursor: "pointer" }}>
                  <option value="all">All Sentiment</option><option value="positive">😊 Positive</option>
                  <option value="neutral">😐 Neutral</option><option value="negative">😠 Negative</option>
                </select>
                <div style={{ flex: 1 }} />
                <button onClick={async () => {
                  const unmoderated = socialMentions.filter(m => m.moderation_status === "pending" || !m.moderation_status);
                  if (unmoderated.length === 0) return;
                  setModeratingId("bulk");
                  for (const m of unmoderated) {
                    try {
                      const res = await fetch("https://upbjdmnykheubxkuknuj.supabase.co/functions/v1/cx-moderate", {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "moderate", org_id: orgId, mention_id: m.id, content: m.content, platform: m.platform, author_handle: m.author_handle }),
                      });
                      const result = await res.json();
                      setSocialMentions(p => p.map(x => x.id === m.id ? { ...x, moderation_status: result.action === "flag" ? "flagged" : "reviewed", moderation_risk: result.risk, moderation_categories: result.categories, is_hidden: result.action === "hide", status: result.action === "escalate" ? "escalated" : result.action === "hide" ? "ignored" : x.status, ai_reply_draft: result.suggested_reply || x.ai_reply_draft, sentiment: result.sentiment || x.sentiment } : x));
                    } catch {}
                  }
                  setModeratingId(null);
                }} disabled={moderatingId === "bulk"}
                  style={{ padding: "4px 10px", fontSize: 10, fontWeight: 600, borderRadius: 5, border: `1px solid #0ea5e940`, background: "#0ea5e910", color: "#0ea5e9", cursor: moderatingId === "bulk" ? "wait" : "pointer" }}>
                  {moderatingId === "bulk" ? "🔄 Moderating..." : `🛡 Moderate All (${socialMentions.filter(m => !m.moderation_status || m.moderation_status === "pending").length})`}
                </button>
                <span style={{ fontSize: 10, color: T.text3 }}>{socialMentions.filter(m => m.status === "new").length} new</span>
              </div>
              {/* Mention list */}
              <div style={{ flex: 1, overflow: "auto", padding: 0 }}>
                {socialMentions
                  .filter(m => (socialFilter.platform === "all" || m.platform === socialFilter.platform))
                  .filter(m => (socialFilter.status === "all" || m.status === socialFilter.status))
                  .filter(m => (socialFilter.sentiment === "all" || m.sentiment === socialFilter.sentiment))
                  .map(m => {
                    const PLAT = { instagram: { icon: "📸", color: "#E1306C" }, facebook: { icon: "📘", color: "#1877F2" }, tiktok: { icon: "🎵", color: "#010101" }, twitter: { icon: "🐦", color: "#1DA1F2" }, youtube: { icon: "📺", color: "#FF0000" } };
                    const p = PLAT[m.platform] || { icon: "📱", color: T.text3 };
                    const SENT = { positive: { icon: "😊", color: "#22c55e" }, neutral: { icon: "😐", color: "#f59e0b" }, negative: { icon: "😠", color: "#ef4444" }, mixed: { icon: "🤔", color: "#8b5cf6" } };
                    const s = SENT[m.sentiment] || SENT.neutral;
                    return (
                      <div key={m.id} onClick={() => setSelectedMention(selectedMention?.id === m.id ? null : m)}
                        style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}`, cursor: "pointer",
                          background: selectedMention?.id === m.id ? T.accentDim : m.status === "new" ? T.surface : "transparent" }}
                        onMouseEnter={e => { if (selectedMention?.id !== m.id) e.currentTarget.style.background = T.surface2; }}
                        onMouseLeave={e => { if (selectedMention?.id !== m.id) e.currentTarget.style.background = m.status === "new" ? T.surface : "transparent"; }}>
                        <div style={{ display: "flex", gap: 10, alignItems: "start" }}>
                          <div style={{ width: 36, height: 36, borderRadius: 18, background: p.color + "15", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
                            {p.icon}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{m.author_name || m.author_handle}</span>
                                {m.author_handle && <span style={{ fontSize: 10, color: T.text3 }}>{m.author_handle}</span>}
                                {m.is_influencer || m.author_follower_count > 10000 ? <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "#f59e0b20", color: "#f59e0b", fontWeight: 700 }}>⭐ {(m.author_follower_count / 1000).toFixed(0)}K</span> : null}
                                {m.is_ugc && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: "#a855f720", color: "#a855f7", fontWeight: 700 }}>UGC</span>}
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                <span style={{ fontSize: 12 }}>{s.icon}</span>
                                <span style={{ fontSize: 10, color: T.text3 }}>{timeAgo(m.posted_at)}</span>
                              </div>
                            </div>
                            <div style={{ fontSize: 12, color: T.text, lineHeight: 1.5, marginBottom: 6, display: "-webkit-box", WebkitLineClamp: selectedMention?.id === m.id ? 99 : 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                              {m.content}
                            </div>
                            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                              <span style={{ fontSize: 10, color: T.text3, textTransform: "capitalize", padding: "1px 6px", borderRadius: 3, background: T.surface2 }}>{m.mention_type}</span>
                              {m.moderation_risk && m.moderation_risk !== "safe" && <span style={{ fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: m.moderation_risk === "critical" ? "#ef444420" : m.moderation_risk === "high" ? "#f5920b20" : "#f59e0b10", color: m.moderation_risk === "critical" ? "#ef4444" : m.moderation_risk === "high" ? "#f97316" : "#f59e0b" }}>⚠ {m.moderation_risk}</span>}
                              {m.is_hidden && <span style={{ fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: "#6b728020", color: "#6b7280" }}>🚫 Hidden</span>}
                              {m.moderation_status === "flagged" && <span style={{ fontSize: 8, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: "#f59e0b20", color: "#f59e0b" }}>🚩 Flagged</span>}
                              {m.likes > 0 && <span style={{ fontSize: 10, color: T.text3 }}>❤️ {m.likes > 1000 ? (m.likes / 1000).toFixed(1) + "K" : m.likes}</span>}
                              {m.comments > 0 && <span style={{ fontSize: 10, color: T.text3 }}>💬 {m.comments}</span>}
                              {m.shares > 0 && <span style={{ fontSize: 10, color: T.text3 }}>🔄 {m.shares > 1000 ? (m.shares / 1000).toFixed(1) + "K" : m.shares}</span>}
                            </div>
                            {/* AI Reply Draft */}
                            {m.ai_reply_draft && selectedMention?.id === m.id && (
                              <div style={{ marginTop: 8, padding: "8px 10px", background: "#a855f708", borderRadius: 6, border: `1px solid #a855f715` }}>
                                <div style={{ fontSize: 9, fontWeight: 700, color: "#a855f7", marginBottom: 4 }}>✨ AI Draft Reply</div>
                                <div style={{ fontSize: 12, color: T.text, lineHeight: 1.5 }}>{m.ai_reply_draft}</div>
                                <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                                  <button onClick={async (e) => { e.stopPropagation(); await navigator.clipboard.writeText(m.ai_reply_draft); }}
                                    style={{ padding: "3px 8px", fontSize: 9, fontWeight: 600, borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface2, color: T.text3, cursor: "pointer" }}>📋 Copy</button>
                                  {m.external_id && m.social_account_id && (
                                    <button onClick={async (e) => {
                                      e.stopPropagation(); const btn = e.currentTarget; btn.textContent = "⏳ Sending..."; btn.disabled = true;
                                      try {
                                        const action = m.platform === "instagram" ? "reply_ig_comment" : "reply_fb_comment";
                                        const res = await fetch("https://upbjdmnykheubxkuknuj.supabase.co/functions/v1/meta-social", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, account_id: m.social_account_id, comment_id: m.external_id, reply_text: m.ai_reply_draft, org_id: orgId }) });
                                        const result = await res.json();
                                        if (result.success) {
                                          await supabase.from("cx_social_mentions").update({ ai_reply_sent: true, status: "replied", responded_at: new Date().toISOString(), response_text: m.ai_reply_draft, auto_responded: true }).eq("id", m.id);
                                          setSocialMentions(p => p.map(x => x.id === m.id ? { ...x, ai_reply_sent: true, status: "replied" } : x));
                                          btn.textContent = "✅ Sent!";
                                        } else { btn.textContent = "❌ " + (result.error || "Failed"); }
                                      } catch (err) { btn.textContent = "❌ Error"; }
                                      setTimeout(() => { btn.disabled = false; }, 3000);
                                    }} style={{ padding: "3px 8px", fontSize: 9, fontWeight: 600, borderRadius: 4, border: `1px solid #1877F240`, background: "#1877F210", color: "#1877F2", cursor: "pointer" }}>📤 Send Reply</button>
                                  )}
                                  <button onClick={async (e) => { e.stopPropagation(); await supabase.from("cx_social_mentions").update({ ai_reply_sent: true, status: "replied", responded_at: new Date().toISOString(), response_text: m.ai_reply_draft }).eq("id", m.id); setSocialMentions(p => p.map(x => x.id === m.id ? { ...x, ai_reply_sent: true, status: "replied" } : x)); }}
                                    style={{ padding: "3px 8px", fontSize: 9, fontWeight: 600, borderRadius: 4, border: `1px solid #22c55e40`, background: "#22c55e10", color: "#22c55e", cursor: "pointer" }}>✅ Mark Sent</button>
                                </div>
                              </div>
                            )}
                            {/* Action buttons when expanded */}
                            {selectedMention?.id === m.id && (
                              <div style={{ display: "flex", gap: 6, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.border}`, flexWrap: "wrap" }}>
                                <button onClick={async (e) => { e.stopPropagation(); setModeratingId(m.id); try { const res = await fetch("https://upbjdmnykheubxkuknuj.supabase.co/functions/v1/cx-moderate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "moderate", org_id: orgId, mention_id: m.id, content: m.content, platform: m.platform, author_handle: m.author_handle }) }); const result = await res.json(); setSocialMentions(p => p.map(x => x.id === m.id ? { ...x, moderation_status: result.action === "flag" ? "flagged" : "reviewed", moderation_risk: result.risk, moderation_categories: result.categories, is_hidden: result.action === "hide", status: result.action === "escalate" ? "escalated" : result.action === "hide" ? "ignored" : x.status, ai_reply_draft: result.suggested_reply || x.ai_reply_draft } : x)); } catch {} setModeratingId(null); }}
                                  disabled={moderatingId === m.id}
                                  style={{ padding: "5px 10px", fontSize: 10, fontWeight: 600, borderRadius: 5, border: `1px solid #0ea5e940`, background: "#0ea5e910", color: "#0ea5e9", cursor: moderatingId === m.id ? "wait" : "pointer" }}>
                                  {moderatingId === m.id ? "🔄 Analyzing..." : "🛡 AI Moderate"}
                                </button>
                                <button onClick={async (e) => { e.stopPropagation(); setAiReplyLoading(m.id); try { const res = await fetch("https://upbjdmnykheubxkuknuj.supabase.co/functions/v1/cx-moderate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generate_reply", org_id: orgId, mention_id: m.id, content: m.content, platform: m.platform }) }); const result = await res.json(); if (result.reply) setSocialMentions(p => p.map(x => x.id === m.id ? { ...x, ai_reply_draft: result.reply } : x)); } catch {} setAiReplyLoading(null); }}
                                  disabled={aiReplyLoading === m.id}
                                  style={{ padding: "5px 10px", fontSize: 10, fontWeight: 600, borderRadius: 5, border: `1px solid #a855f740`, background: "#a855f710", color: "#a855f7", cursor: aiReplyLoading === m.id ? "wait" : "pointer" }}>
                                  {aiReplyLoading === m.id ? "✨ Generating..." : "✨ AI Reply"}
                                </button>
                                <button onClick={async (e) => { e.stopPropagation(); await supabase.from("cx_social_mentions").update({ status: "replied" }).eq("id", m.id); setSocialMentions(p => p.map(x => x.id === m.id ? { ...x, status: "replied" } : x)); }}
                                  style={{ padding: "5px 10px", fontSize: 10, fontWeight: 600, borderRadius: 5, border: `1px solid #22c55e40`, background: "#22c55e10", color: "#22c55e", cursor: "pointer" }}>✅ Replied</button>
                                <button onClick={async (e) => { e.stopPropagation(); await supabase.from("cx_social_mentions").update({ status: "escalated" }).eq("id", m.id); setSocialMentions(p => p.map(x => x.id === m.id ? { ...x, status: "escalated" } : x)); }}
                                  style={{ padding: "5px 10px", fontSize: 10, fontWeight: 600, borderRadius: 5, border: `1px solid #ef444440`, background: "#ef444410", color: "#ef4444", cursor: "pointer" }}>🔴 Escalate</button>
                                <button onClick={async (e) => {
                                  e.stopPropagation();
                                  // Hide via Meta API if connected
                                  if (m.external_id && m.social_account_id) {
                                    try { await fetch("https://upbjdmnykheubxkuknuj.supabase.co/functions/v1/meta-social", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "hide_comment", account_id: m.social_account_id, comment_id: m.external_id }) }); } catch {}
                                  }
                                  await supabase.from("cx_social_mentions").update({ is_hidden: true, status: "ignored" }).eq("id", m.id);
                                  setSocialMentions(p => p.map(x => x.id === m.id ? { ...x, is_hidden: true, status: "ignored" } : x));
                                }}
                                  style={{ padding: "5px 10px", fontSize: 10, fontWeight: 600, borderRadius: 5, border: `1px solid ${T.border}`, background: T.surface2, color: T.text3, cursor: "pointer" }}>🚫 Hide</button>
                                <button onClick={async (e) => { e.stopPropagation(); await supabase.from("cx_social_mentions").update({ status: "ignored" }).eq("id", m.id); setSocialMentions(p => p.map(x => x.id === m.id ? { ...x, status: "ignored" } : x)); }}
                                  style={{ padding: "5px 10px", fontSize: 10, fontWeight: 600, borderRadius: 5, border: `1px solid ${T.border}`, background: T.surface2, color: T.text3, cursor: "pointer" }}>⚫ Ignore</button>
                                {m.post_url && <a href={m.post_url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} style={{ padding: "5px 10px", fontSize: 10, fontWeight: 600, borderRadius: 5, border: `1px solid ${T.border}`, background: T.surface2, color: T.accent, cursor: "pointer", textDecoration: "none" }}>↗ Open</a>}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                {socialMentions.length === 0 && <div style={{ padding: 40, textAlign: "center", color: T.text3, fontSize: 13 }}>No social mentions yet. Connect your accounts and configure monitoring in the AI Agent tab.</div>}
              </div>
            </div>
          </div>
        )}

        {/* Analytics tab */}
        {tab === "moderation" && (
          <div style={{ flex: 1, padding: 20, overflow: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>🛡 Moderation Rules</h2>
                <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>Keyword-based rules run first (instant), then AI classifies for deeper analysis.</div>
              </div>
              <button onClick={async () => {
                const { data } = await supabase.from("cx_moderation_rules").insert({
                  org_id: orgId, name: "New Rule", rule_type: "keyword", match_mode: "contains",
                  keywords: [], action: "flag", is_active: true, priority: 50,
                }).select().single();
                if (data) setModerationRules(p => [data, ...p]);
              }} style={{ padding: "6px 14px", fontSize: 12, fontWeight: 600, borderRadius: 6, border: `1px solid ${T.accent}40`, background: T.accent + "10", color: T.accent, cursor: "pointer" }}>+ Add Rule</button>
            </div>

            {/* Stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 16 }}>
              {[
                { label: "Active Rules", value: moderationRules.filter(r => r.is_active).length, color: "#22c55e" },
                { label: "Total Fires", value: moderationRules.reduce((s, r) => s + (r.fire_count || 0), 0), color: T.accent },
                { label: "Pending Review", value: socialMentions.filter(m => m.moderation_status === "flagged").length, color: "#f59e0b" },
                { label: "Auto-Hidden", value: socialMentions.filter(m => m.is_hidden).length, color: "#ef4444" },
              ].map(k => (
                <div key={k.label} style={{ padding: 12, borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface, textAlign: "center" }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: k.color }}>{k.value}</div>
                  <div style={{ fontSize: 9, color: T.text3, fontWeight: 600, textTransform: "uppercase" }}>{k.label}</div>
                </div>
              ))}
            </div>

            {/* Rules list */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {moderationRules.map(rule => (
                <div key={rule.id} style={{ padding: "14px 16px", borderRadius: 10, border: `1px solid ${rule.is_active ? T.border : T.border + "50"}`, background: rule.is_active ? T.surface : T.surface + "80", opacity: rule.is_active ? 1 : 0.6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div onClick={async () => {
                        await supabase.from("cx_moderation_rules").update({ is_active: !rule.is_active }).eq("id", rule.id);
                        setModerationRules(p => p.map(r => r.id === rule.id ? { ...r, is_active: !r.is_active } : r));
                      }} style={{ width: 36, height: 20, borderRadius: 10, background: rule.is_active ? "#22c55e" : T.surface3, cursor: "pointer", position: "relative", transition: "background 0.2s" }}>
                        <div style={{ width: 16, height: 16, borderRadius: 8, background: "#fff", position: "absolute", top: 2, left: rule.is_active ? 18 : 2, transition: "left 0.2s", boxShadow: "0 1px 2px rgba(0,0,0,0.2)" }} />
                      </div>
                      <input defaultValue={rule.name} onBlur={async e => {
                        await supabase.from("cx_moderation_rules").update({ name: e.target.value }).eq("id", rule.id);
                        setModerationRules(p => p.map(r => r.id === rule.id ? { ...r, name: e.target.value } : r));
                      }} style={{ fontSize: 14, fontWeight: 700, color: T.text, background: "transparent", border: "none", outline: "none" }} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 9, color: T.text3 }}>Fired {rule.fire_count || 0}×</span>
                      <select value={rule.action} onChange={async e => {
                        await supabase.from("cx_moderation_rules").update({ action: e.target.value }).eq("id", rule.id);
                        setModerationRules(p => p.map(r => r.id === rule.id ? { ...r, action: e.target.value } : r));
                      }} style={{ padding: "3px 8px", fontSize: 10, border: `1px solid ${T.border}`, borderRadius: 4, background: T.surface2, color: T.text, cursor: "pointer" }}>
                        <option value="flag">🚩 Flag</option>
                        <option value="hide">🚫 Hide</option>
                        <option value="escalate">🔴 Escalate</option>
                        <option value="tag">🏷 Tag</option>
                        <option value="auto_reply">💬 Auto Reply</option>
                      </select>
                      <select value={rule.priority} onChange={async e => {
                        await supabase.from("cx_moderation_rules").update({ priority: Number(e.target.value) }).eq("id", rule.id);
                        setModerationRules(p => p.map(r => r.id === rule.id ? { ...r, priority: Number(e.target.value) } : r));
                      }} style={{ padding: "3px 8px", fontSize: 10, border: `1px solid ${T.border}`, borderRadius: 4, background: T.surface2, color: T.text, cursor: "pointer", width: 55 }}>
                        {[100, 90, 80, 70, 60, 50, 40, 30, 20, 10].map(p => <option key={p} value={p}>P{p}</option>)}
                      </select>
                      <button onClick={async () => {
                        if (!confirm("Delete this rule?")) return;
                        await supabase.from("cx_moderation_rules").delete().eq("id", rule.id);
                        setModerationRules(p => p.filter(r => r.id !== rule.id));
                      }} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 14 }}>×</button>
                    </div>
                  </div>
                  {/* Keywords */}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 6 }}>
                    {(rule.keywords || []).map((kw, i) => (
                      <span key={i} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, padding: "2px 8px", borderRadius: 4, background: T.surface2, color: T.text2, border: `1px solid ${T.border}` }}>
                        {kw}
                        <span onClick={async () => {
                          const newKw = rule.keywords.filter((_, j) => j !== i);
                          await supabase.from("cx_moderation_rules").update({ keywords: newKw }).eq("id", rule.id);
                          setModerationRules(p => p.map(r => r.id === rule.id ? { ...r, keywords: newKw } : r));
                        }} style={{ cursor: "pointer", color: T.text3, fontWeight: 700 }}>×</span>
                      </span>
                    ))}
                    <input placeholder="+ add keyword" onKeyDown={async e => {
                      if (e.key !== "Enter" || !e.target.value.trim()) return;
                      const newKw = [...(rule.keywords || []), e.target.value.trim()];
                      await supabase.from("cx_moderation_rules").update({ keywords: newKw }).eq("id", rule.id);
                      setModerationRules(p => p.map(r => r.id === rule.id ? { ...r, keywords: newKw } : r));
                      e.target.value = "";
                    }} style={{ fontSize: 10, padding: "2px 8px", border: `1px dashed ${T.border}`, borderRadius: 4, background: "transparent", color: T.text3, outline: "none", width: 100 }} />
                  </div>
                  <div style={{ fontSize: 9, color: T.text3 }}>
                    Match: {rule.match_mode} · Priority: {rule.priority} · {rule.last_fired_at ? `Last: ${new Date(rule.last_fired_at).toLocaleDateString()}` : "Never fired"}
                  </div>
                </div>
              ))}
              {moderationRules.length === 0 && <div style={{ padding: 30, textAlign: "center", color: T.text3, fontSize: 13 }}>No moderation rules configured yet.</div>}
            </div>
          </div>
        )}

        {tab === "sla" && (
          <div style={{ flex: 1, padding: 20, overflow: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>⏱ SLA Policies</h2>
                <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>Set response and resolution time targets by priority level.</div>
              </div>
              <button onClick={async () => {
                const { data } = await supabase.from("cx_sla_policies").insert({
                  org_id: orgId, name: "New Policy", priority: "medium",
                  first_response_minutes: 60, resolution_minutes: 480,
                  business_hours_only: true, is_active: true,
                }).select().single();
                if (data) setSlaPolicies(p => [...p, data]);
              }} style={{ padding: "6px 14px", fontSize: 12, fontWeight: 600, borderRadius: 6, border: `1px solid ${T.accent}40`, background: T.accent + "10", color: T.accent, cursor: "pointer" }}>+ Add Policy</button>
            </div>

            {/* Current breach stats */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 16 }}>
              {[
                { label: "Active Breaches", value: tickets.filter(t => t.sla_breached && t.status !== "resolved" && t.status !== "closed").length, color: "#ef4444" },
                { label: "Avg First Response", value: (() => { const responded = tickets.filter(t => t.first_response_at && t.created_at); if (!responded.length) return "—"; const avg = responded.reduce((s, t) => s + (new Date(t.first_response_at) - new Date(t.created_at)) / 60000, 0) / responded.length; return avg < 60 ? Math.round(avg) + "m" : (avg / 60).toFixed(1) + "h"; })(), color: T.accent },
                { label: "Active Policies", value: slaPolicies.filter(p => p.is_active).length, color: "#22c55e" },
              ].map(k => (
                <div key={k.label} style={{ padding: 14, borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface, textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: k.color }}>{k.value}</div>
                  <div style={{ fontSize: 9, color: T.text3, fontWeight: 600, textTransform: "uppercase" }}>{k.label}</div>
                </div>
              ))}
            </div>

            {/* Policy cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {slaPolicies.map(p => (
                <div key={p.id} style={{ padding: "14px 16px", borderRadius: 10, border: `1px solid ${p.is_active ? T.border : T.border + "50"}`, background: T.surface, opacity: p.is_active ? 1 : 0.6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div onClick={async () => { await supabase.from("cx_sla_policies").update({ is_active: !p.is_active }).eq("id", p.id); setSlaPolicies(ps => ps.map(x => x.id === p.id ? { ...x, is_active: !x.is_active } : x)); }}
                        style={{ width: 36, height: 20, borderRadius: 10, background: p.is_active ? "#22c55e" : T.surface3, cursor: "pointer", position: "relative", transition: "background 0.2s" }}>
                        <div style={{ width: 16, height: 16, borderRadius: 8, background: "#fff", position: "absolute", top: 2, left: p.is_active ? 18 : 2, transition: "left 0.2s", boxShadow: "0 1px 2px rgba(0,0,0,0.2)" }} />
                      </div>
                      <input defaultValue={p.name} onBlur={async e => { await supabase.from("cx_sla_policies").update({ name: e.target.value }).eq("id", p.id); setSlaPolicies(ps => ps.map(x => x.id === p.id ? { ...x, name: e.target.value } : x)); }}
                        style={{ fontSize: 14, fontWeight: 700, color: T.text, background: "transparent", border: "none", outline: "none" }} />
                    </div>
                    <button onClick={async () => { if (!confirm("Delete?")) return; await supabase.from("cx_sla_policies").delete().eq("id", p.id); setSlaPolicies(ps => ps.filter(x => x.id !== p.id)); }}
                      style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 14 }}>×</button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 10, color: T.text3, marginBottom: 4 }}>Priority</div>
                      <select value={p.priority} onChange={async e => { await supabase.from("cx_sla_policies").update({ priority: e.target.value }).eq("id", p.id); setSlaPolicies(ps => ps.map(x => x.id === p.id ? { ...x, priority: e.target.value } : x)); }}
                        style={{ padding: "4px 8px", fontSize: 11, border: `1px solid ${T.border}`, borderRadius: 4, background: T.surface2, color: T.text, cursor: "pointer", width: "100%" }}>
                        <option value="urgent">🔥 Urgent</option><option value="high">🔴 High</option><option value="medium">🟡 Medium</option><option value="low">🟢 Low</option>
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: T.text3, marginBottom: 4 }}>First Response</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <input type="number" value={p.first_response_minutes} onChange={async e => { const v = Number(e.target.value); await supabase.from("cx_sla_policies").update({ first_response_minutes: v }).eq("id", p.id); setSlaPolicies(ps => ps.map(x => x.id === p.id ? { ...x, first_response_minutes: v } : x)); }}
                          style={{ width: 50, padding: "4px 6px", fontSize: 11, border: `1px solid ${T.border}`, borderRadius: 4, background: T.surface2, color: T.text, textAlign: "center" }} />
                        <span style={{ fontSize: 10, color: T.text3 }}>min</span>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: T.text3, marginBottom: 4 }}>Resolution</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                        <input type="number" value={p.resolution_minutes} onChange={async e => { const v = Number(e.target.value); await supabase.from("cx_sla_policies").update({ resolution_minutes: v }).eq("id", p.id); setSlaPolicies(ps => ps.map(x => x.id === p.id ? { ...x, resolution_minutes: v } : x)); }}
                          style={{ width: 60, padding: "4px 6px", fontSize: 11, border: `1px solid ${T.border}`, borderRadius: 4, background: T.surface2, color: T.text, textAlign: "center" }} />
                        <span style={{ fontSize: 10, color: T.text3 }}>min</span>
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, color: T.text3, marginBottom: 4 }}>Hours</div>
                      <select value={p.business_hours_only ? "business" : "24x7"} onChange={async e => { const v = e.target.value === "business"; await supabase.from("cx_sla_policies").update({ business_hours_only: v }).eq("id", p.id); setSlaPolicies(ps => ps.map(x => x.id === p.id ? { ...x, business_hours_only: v } : x)); }}
                        style={{ padding: "4px 8px", fontSize: 11, border: `1px solid ${T.border}`, borderRadius: 4, background: T.surface2, color: T.text, cursor: "pointer", width: "100%" }}>
                        <option value="24x7">24/7</option><option value="business">Business Hours</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}
              {slaPolicies.length === 0 && <div style={{ padding: 30, textAlign: "center", color: T.text3, fontSize: 13 }}>No SLA policies configured. Add one to start tracking response times.</div>}
            </div>
          </div>
        )}

        {tab === "automations" && (
          <div style={{ flex: 1, padding: 20, overflow: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>⚡ Automation Rules</h2>
                <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>Auto-assign, auto-tag, auto-escalate, and auto-respond based on ticket conditions.</div>
              </div>
              <button onClick={async () => {
                const { data } = await supabase.from("cx_automations").insert({
                  org_id: orgId, name: "New Automation", trigger_type: "ticket_created",
                  conditions: { match: "any", rules: [{ field: "priority", operator: "equals", value: "urgent" }] },
                  actions: { type: "assign", value: "" },
                  is_active: true, created_by: user?.id,
                }).select().single();
                if (data) setAutomations(p => [data, ...p]);
              }} style={{ padding: "6px 14px", fontSize: 12, fontWeight: 600, borderRadius: 6, border: `1px solid ${T.accent}40`, background: T.accent + "10", color: T.accent, cursor: "pointer" }}>+ Add Rule</button>
            </div>

            {/* Preset automations */}
            {automations.length === 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.text2, marginBottom: 8 }}>Quick Start — click to add:</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {[
                    { name: "Escalate urgent tickets", trigger: "ticket_created", conditions: { match: "all", rules: [{ field: "priority", operator: "equals", value: "urgent" }] }, actions: { type: "notify", value: "Urgent ticket needs attention" } },
                    { name: "Auto-tag subscription issues", trigger: "ticket_created", conditions: { match: "any", rules: [{ field: "subject", operator: "contains", value: "cancel" }, { field: "subject", operator: "contains", value: "subscription" }] }, actions: { type: "tag", value: "subscription" } },
                    { name: "AI auto-reply to emails", trigger: "ticket_created", conditions: { match: "all", rules: [{ field: "channel", operator: "equals", value: "email" }] }, actions: { type: "ai_draft", value: "" } },
                    { name: "Flag negative sentiment", trigger: "ticket_created", conditions: { match: "all", rules: [{ field: "ai_sentiment", operator: "equals", value: "negative" }] }, actions: { type: "priority", value: "high" } },
                  ].map((preset, i) => (
                    <button key={i} onClick={async () => {
                      const { data } = await supabase.from("cx_automations").insert({
                        org_id: orgId, name: preset.name, trigger_type: preset.trigger,
                        conditions: preset.conditions, actions: preset.actions,
                        is_active: true, created_by: user?.id,
                      }).select().single();
                      if (data) setAutomations(p => [data, ...p]);
                    }} style={{ padding: "6px 12px", fontSize: 11, fontWeight: 500, borderRadius: 6, border: `1px dashed ${T.border}`, background: "transparent", color: T.text2, cursor: "pointer" }}>
                      + {preset.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Automation cards */}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {automations.map(auto => (
                <div key={auto.id} style={{ padding: "14px 16px", borderRadius: 10, border: `1px solid ${auto.is_active ? T.border : T.border + "50"}`, background: T.surface, opacity: auto.is_active ? 1 : 0.6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div onClick={async () => { await supabase.from("cx_automations").update({ is_active: !auto.is_active }).eq("id", auto.id); setAutomations(p => p.map(a => a.id === auto.id ? { ...a, is_active: !a.is_active } : a)); }}
                        style={{ width: 36, height: 20, borderRadius: 10, background: auto.is_active ? "#22c55e" : T.surface3, cursor: "pointer", position: "relative" }}>
                        <div style={{ width: 16, height: 16, borderRadius: 8, background: "#fff", position: "absolute", top: 2, left: auto.is_active ? 18 : 2, transition: "left 0.2s", boxShadow: "0 1px 2px rgba(0,0,0,0.2)" }} />
                      </div>
                      <input defaultValue={auto.name} onBlur={async e => { await supabase.from("cx_automations").update({ name: e.target.value }).eq("id", auto.id); setAutomations(p => p.map(a => a.id === auto.id ? { ...a, name: e.target.value } : a)); }}
                        style={{ fontSize: 14, fontWeight: 700, color: T.text, background: "transparent", border: "none", outline: "none" }} />
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <span style={{ fontSize: 9, color: T.text3 }}>Ran {auto.run_count || 0}×</span>
                      <button onClick={async () => { if (!confirm("Delete?")) return; await supabase.from("cx_automations").delete().eq("id", auto.id); setAutomations(p => p.filter(a => a.id !== auto.id)); }}
                        style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 14 }}>×</button>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: T.text3, marginBottom: 4 }}>WHEN</div>
                      <select value={auto.trigger_type} onChange={async e => { await supabase.from("cx_automations").update({ trigger_type: e.target.value }).eq("id", auto.id); setAutomations(p => p.map(a => a.id === auto.id ? { ...a, trigger_type: e.target.value } : a)); }}
                        style={{ padding: "4px 8px", fontSize: 11, border: `1px solid ${T.border}`, borderRadius: 4, background: T.surface2, color: T.text, cursor: "pointer", width: "100%", marginBottom: 6 }}>
                        <option value="ticket_created">Ticket Created</option>
                        <option value="ticket_updated">Ticket Updated</option>
                        <option value="mention_received">Social Mention Received</option>
                        <option value="sla_breach">SLA About to Breach</option>
                      </select>
                      <div style={{ fontSize: 10, color: T.text3, fontStyle: "italic" }}>
                        Conditions: {auto.conditions?.rules?.length || 0} rule(s) — {auto.conditions?.match || "any"} match
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, color: T.text3, marginBottom: 4 }}>THEN</div>
                      <select value={auto.actions?.type || "notify"} onChange={async e => { const actions = { ...auto.actions, type: e.target.value }; await supabase.from("cx_automations").update({ actions }).eq("id", auto.id); setAutomations(p => p.map(a => a.id === auto.id ? { ...a, actions } : a)); }}
                        style={{ padding: "4px 8px", fontSize: 11, border: `1px solid ${T.border}`, borderRadius: 4, background: T.surface2, color: T.text, cursor: "pointer", width: "100%" }}>
                        <option value="assign">Assign to team member</option>
                        <option value="tag">Add tag</option>
                        <option value="priority">Change priority</option>
                        <option value="ai_draft">Generate AI draft</option>
                        <option value="notify">Send notification</option>
                        <option value="escalate">Escalate to manager</option>
                        <option value="auto_resolve">Auto-resolve (AI)</option>
                      </select>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "analytics" && (
          <div style={{ flex: 1, padding: 20, overflow: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>📊 Support Analytics</h2>
            </div>
            {/* KPI Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10, marginBottom: 20 }}>
              {[
                { label: "Open", value: stats.open, color: "#3b82f6", icon: "📬" },
                { label: "Pending", value: stats.pending, color: "#f59e0b", icon: "⏳" },
                { label: "Urgent", value: stats.urgent, color: "#ef4444", icon: "🔥" },
                { label: "AI Resolved", value: stats.ai_resolved, color: "#a855f7", icon: "🤖" },
                { label: "Resolved Today", value: stats.resolved_today, color: "#22c55e", icon: "✅" },
                { label: "Total", value: tickets.length, color: T.text2, icon: "🎫" },
              ].map(k => (
                <div key={k.label} style={{ padding: 14, borderRadius: 10, border: `1px solid ${T.border}`, background: T.surface, textAlign: "center" }}>
                  <div style={{ fontSize: 20 }}>{k.icon}</div>
                  <div style={{ fontSize: 24, fontWeight: 800, color: k.color, marginTop: 2 }}>{k.value}</div>
                  <div style={{ fontSize: 10, color: T.text3, fontWeight: 600, textTransform: "uppercase" }}>{k.label}</div>
                </div>
              ))}
            </div>
            {/* Tickets by Channel */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
              <div style={{ padding: 16, borderRadius: 10, border: `1px solid ${T.border}`, background: T.surface }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 12 }}>Tickets by Channel</div>
                {(() => {
                  const channels = {};
                  tickets.forEach(t => { channels[t.channel] = (channels[t.channel] || 0) + 1; });
                  const sorted = Object.entries(channels).sort((a, b) => b[1] - a[1]);
                  const max = sorted[0]?.[1] || 1;
                  return sorted.map(([ch, count]) => (
                    <div key={ch} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 14, width: 20 }}>{CHANNEL_ICONS[ch] || "📧"}</span>
                      <span style={{ fontSize: 11, color: T.text2, width: 80, textTransform: "capitalize" }}>{ch.replace("social_", "")}</span>
                      <div style={{ flex: 1, height: 16, background: T.surface2, borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${(count / max) * 100}%`, background: T.accent, borderRadius: 4, transition: "width 0.3s" }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: T.text, minWidth: 20, textAlign: "right" }}>{count}</span>
                    </div>
                  ));
                })()}
              </div>
              <div style={{ padding: 16, borderRadius: 10, border: `1px solid ${T.border}`, background: T.surface }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 12 }}>Tickets by Category</div>
                {(() => {
                  const cats = {};
                  tickets.forEach(t => { const c = t.category || "uncategorized"; cats[c] = (cats[c] || 0) + 1; });
                  const sorted = Object.entries(cats).sort((a, b) => b[1] - a[1]);
                  const max = sorted[0]?.[1] || 1;
                  const catColors = { shipping: "#3b82f6", subscription: "#8b5cf6", product_issue: "#f97316", billing: "#f59e0b", account: "#06b6d4", feedback: "#22c55e", general: "#6b7280", escalation: "#ef4444" };
                  return sorted.map(([cat, count]) => (
                    <div key={cat} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 11, color: T.text2, width: 90, textTransform: "capitalize" }}>{cat.replace("_", " ")}</span>
                      <div style={{ flex: 1, height: 16, background: T.surface2, borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${(count / max) * 100}%`, background: catColors[cat] || T.accent, borderRadius: 4 }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: T.text, minWidth: 20, textAlign: "right" }}>{count}</span>
                    </div>
                  ));
                })()}
              </div>
            </div>
            {/* Sentiment & Priority breakdown */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 20 }}>
              <div style={{ padding: 16, borderRadius: 10, border: `1px solid ${T.border}`, background: T.surface }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 12 }}>AI Sentiment</div>
                {["positive", "neutral", "negative", "angry", "frustrated"].map(s => {
                  const count = tickets.filter(t => t.ai_sentiment === s).length;
                  const icons = { positive: "😊", neutral: "😐", negative: "😠", angry: "🤬", frustrated: "😤" };
                  const colors = { positive: "#22c55e", neutral: "#f59e0b", negative: "#ef4444", angry: "#dc2626", frustrated: "#f97316" };
                  return count > 0 ? (
                    <div key={s} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                      <span style={{ fontSize: 14 }}>{icons[s]}</span>
                      <span style={{ fontSize: 11, color: T.text2, width: 70, textTransform: "capitalize" }}>{s}</span>
                      <div style={{ flex: 1, height: 16, background: T.surface2, borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${(count / tickets.length) * 100}%`, background: colors[s], borderRadius: 4 }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: T.text, minWidth: 20, textAlign: "right" }}>{count}</span>
                    </div>
                  ) : null;
                })}
                {tickets.filter(t => !t.ai_sentiment).length > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ fontSize: 14 }}>❓</span>
                    <span style={{ fontSize: 11, color: T.text3, width: 70 }}>Unclassified</span>
                    <span style={{ fontSize: 11, color: T.text3 }}>{tickets.filter(t => !t.ai_sentiment).length}</span>
                  </div>
                )}
              </div>
              <div style={{ padding: 16, borderRadius: 10, border: `1px solid ${T.border}`, background: T.surface }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 12 }}>Priority Breakdown</div>
                {["urgent", "high", "medium", "low"].map(p => {
                  const count = tickets.filter(t => t.priority === p).length;
                  return (
                    <div key={p} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 5, background: PRIORITY_COLORS[p] }} />
                      <span style={{ fontSize: 11, color: T.text2, width: 60, textTransform: "capitalize" }}>{p}</span>
                      <div style={{ flex: 1, height: 16, background: T.surface2, borderRadius: 4, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${tickets.length ? (count / tickets.length) * 100 : 0}%`, background: PRIORITY_COLORS[p], borderRadius: 4 }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: T.text, minWidth: 20, textAlign: "right" }}>{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Social stats */}
            {socialMentions.length > 0 && (
              <div style={{ padding: 16, borderRadius: 10, border: `1px solid ${T.border}`, background: T.surface, marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 12 }}>📱 Social Monitoring</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))", gap: 10 }}>
                  {[
                    { label: "Total Mentions", value: socialMentions.length, icon: "📢" },
                    { label: "New", value: socialMentions.filter(m => m.status === "new").length, icon: "🔵" },
                    { label: "Positive", value: socialMentions.filter(m => m.sentiment === "positive").length, icon: "😊", color: "#22c55e" },
                    { label: "Negative", value: socialMentions.filter(m => m.sentiment === "negative").length, icon: "😠", color: "#ef4444" },
                    { label: "Influencer", value: socialMentions.filter(m => m.author_follower_count > 10000).length, icon: "⭐", color: "#f59e0b" },
                    { label: "UGC", value: socialMentions.filter(m => m.is_ugc).length, icon: "📸", color: "#a855f7" },
                  ].map(k => (
                    <div key={k.label} style={{ textAlign: "center", padding: 8 }}>
                      <div style={{ fontSize: 16 }}>{k.icon}</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: k.color || T.text }}>{k.value}</div>
                      <div style={{ fontSize: 9, color: T.text3, fontWeight: 600, textTransform: "uppercase" }}>{k.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* Moderation stats */}
            <div style={{ padding: 16, borderRadius: 10, border: `1px solid ${T.border}`, background: T.surface, marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 12 }}>🛡 Moderation Overview</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(100px, 1fr))", gap: 10, marginBottom: 12 }}>
                {[
                  { label: "Reviewed", value: socialMentions.filter(m => m.moderation_status === "reviewed").length, color: "#22c55e" },
                  { label: "Flagged", value: socialMentions.filter(m => m.moderation_status === "flagged").length, color: "#f59e0b" },
                  { label: "Hidden", value: socialMentions.filter(m => m.is_hidden).length, color: "#ef4444" },
                  { label: "Escalated", value: socialMentions.filter(m => m.status === "escalated").length, color: "#f97316" },
                  { label: "AI Replied", value: socialMentions.filter(m => m.ai_reply_sent).length, color: "#a855f7" },
                  { label: "Pending", value: socialMentions.filter(m => !m.moderation_status || m.moderation_status === "pending").length, color: T.text3 },
                ].map(k => (
                  <div key={k.label} style={{ textAlign: "center", padding: 8 }}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: k.color }}>{k.value}</div>
                    <div style={{ fontSize: 9, color: T.text3, fontWeight: 600, textTransform: "uppercase" }}>{k.label}</div>
                  </div>
                ))}
              </div>
              {/* Sentiment breakdown from moderated mentions */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["positive", "neutral", "negative", "mixed"].map(s => {
                  const count = socialMentions.filter(m => m.sentiment === s).length;
                  const icons = { positive: "😊", neutral: "😐", negative: "😠", mixed: "🤔" };
                  const colors = { positive: "#22c55e", neutral: "#f59e0b", negative: "#ef4444", mixed: "#8b5cf6" };
                  return count > 0 ? (
                    <div key={s} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 6, background: colors[s] + "10", border: `1px solid ${colors[s]}20` }}>
                      <span style={{ fontSize: 12 }}>{icons[s]}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: colors[s] }}>{count}</span>
                      <span style={{ fontSize: 9, color: T.text3, textTransform: "capitalize" }}>{s}</span>
                    </div>
                  ) : null;
                })}
              </div>
              {/* Rules fire rate */}
              {moderationRules.filter(r => r.fire_count > 0).length > 0 && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: T.text3, marginBottom: 6 }}>Top Firing Rules</div>
                  {moderationRules.filter(r => r.fire_count > 0).sort((a, b) => b.fire_count - a.fire_count).slice(0, 5).map(r => (
                    <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 600, color: T.text, flex: 1 }}>{r.name}</span>
                      <div style={{ width: 80, height: 6, borderRadius: 3, background: T.surface2, overflow: "hidden" }}>
                        <div style={{ width: `${Math.min(100, (r.fire_count / Math.max(...moderationRules.map(r => r.fire_count || 0), 1)) * 100)}%`, height: "100%", background: r.action === "hide" ? "#ef4444" : r.action === "escalate" ? "#f59e0b" : T.accent, borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 10, fontWeight: 700, color: T.text2, minWidth: 24, textAlign: "right" }}>{r.fire_count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* KB stats */}
            <div style={{ padding: 16, borderRadius: 10, border: `1px solid ${T.border}`, background: T.surface }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 12 }}>📖 Knowledge Base</div>
              <div style={{ display: "flex", gap: 20, flexWrap: "wrap" }}>
                <div><span style={{ fontSize: 24, fontWeight: 800, color: T.accent }}>{kbArticles.length}</span> <span style={{ fontSize: 11, color: T.text3 }}>published articles</span></div>
                <div><span style={{ fontSize: 24, fontWeight: 800, color: T.text }}>{macros.length}</span> <span style={{ fontSize: 11, color: T.text3 }}>active macros</span></div>
                <div><span style={{ fontSize: 24, fontWeight: 800, color: T.text }}>{tags.length}</span> <span style={{ fontSize: 11, color: T.text3 }}>tags</span></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Simulate Inbound Email / New Ticket Modal */}
      {showNewTicket && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" }} onClick={() => setShowNewTicket(false)}>
          <div style={{ width: 560, maxHeight: "90vh", overflow: "auto", background: T.surface, borderRadius: 12, border: `1px solid ${T.border}`, padding: 24, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }} onClick={e => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: T.accent + "15", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>📨</div>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: T.text }}>Simulate Inbound Email</h3>
                <div style={{ fontSize: 11, color: T.text3 }}>Test the full support flow — ticket creation, AI auto-draft, and agent response</div>
              </div>
            </div>
            <form onSubmit={async e => {
              e.preventDefault();
              const f = new FormData(e.target);
              const form = { subject: f.get("subject"), email: f.get("email"), name: f.get("name"), channel: f.get("channel"), priority: f.get("priority"), message: f.get("message"), category: f.get("category") };
              if (!form.subject || !form.message) return;
              // Create ticket
              const { data: ticket } = await supabase.from("cx_tickets").insert({
                org_id: profile?.org_id, subject: form.subject, customer_email: form.email || "test@customer.com",
                customer_name: form.name || "Test Customer", channel: form.channel || "email",
                priority: form.priority || "medium", category: form.category || "general",
                status: "open", assigned_to: user?.id, created_by: user?.id,
              }).select().single();
              if (!ticket) return;
              // Create inbound message
              await supabase.from("cx_messages").insert({
                ticket_id: ticket.id, direction: "inbound", sender_type: "customer",
                sender_name: form.name || "Test Customer", sender_email: form.email || "test@customer.com",
                body_text: form.message, channel: form.channel || "email",
              });
              setTickets(p => [ticket, ...p]);
              setSelected(ticket);
              setShowNewTicket(false);
              setSimSubject(""); setSimMessage(""); setSimCategory("general");
              // Auto-generate AI draft
              try {
                const draftRes = await fetch("https://upbjdmnykheubxkuknuj.supabase.co/functions/v1/cx-ai-draft", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "Authorization": "Bearer " + (await supabase.auth.getSession()).data.session?.access_token },
                  body: JSON.stringify({ ticket_id: ticket.id, subject: form.subject, message: form.message, customer_name: form.name || "Test Customer", category: form.category || "general", org_id: profile?.org_id }),
                });
                const draftResult = await draftRes.json();
                if (draftResult.draft) {
                  setReplyText(draftResult.draft);
                  setAiDraft(draftResult.draft);
                }
              } catch (err) { console.log("AI draft error:", err); }
            }}>
              <div style={{ padding: "12px 14px", background: T.surface2, borderRadius: 8, marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: T.accent, marginBottom: 6 }}>💡 Quick Test Scenarios</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {[
                    { label: "Cancel Sub", subj: "I want to cancel my subscription", msg: "Hi, I've been a subscriber for 6 months but I want to cancel. I have too many sheets stacked up.", cat: "subscription" },
                    { label: "Where's My Order?", subj: "My order hasn't arrived", msg: "I placed an order 2 weeks ago and it still hasn't arrived. Order #EB-28374. Can you help me track it?", cat: "shipping" },
                    { label: "Sheets Not Dissolving", subj: "Sheets not dissolving in cold water", msg: "I just switched to your laundry sheets but they aren't dissolving fully in cold water. There's residue on my clothes. What am I doing wrong?", cat: "product" },
                    { label: "Wrong Item", subj: "Received wrong item in my order", msg: "I ordered Fresh Scent but received Fragrance Free instead. This is the second time this has happened. I'm really frustrated.", cat: "shipping" },
                    { label: "Billing Issue", subj: "Charged twice for my subscription", msg: "I was charged $24.99 twice this month for my subscription. Can you please refund the duplicate charge?", cat: "billing" },
                  ].map(sc => (
                    <button key={sc.label} type="button" onClick={() => {
                      setSimSubject(sc.subj); setSimMessage(sc.msg); setSimCategory(sc.cat);
                    }} style={{ padding: "4px 10px", fontSize: 10, fontWeight: 600, borderRadius: 6, border: `1px solid ${T.accent}30`, background: T.accentDim, color: T.accent, cursor: "pointer" }}>{sc.label}</button>
                  ))}
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: T.text3, display: "block", marginBottom: 3 }}>Subject <span style={{ color: "#ef4444" }}>*</span></label>
                  <input name="subject" value={simSubject} onChange={e => setSimSubject(e.target.value)} placeholder="e.g. I want to cancel my subscription" required style={{ width: "100%", padding: "9px 12px", fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 8, background: T.surface2, color: T.text, outline: "none", boxSizing: "border-box" }} />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: T.text3, display: "block", marginBottom: 3 }}>Customer Name</label>
                    <input name="name" placeholder="Sarah Johnson" defaultValue="Sarah Johnson" style={{ width: "100%", padding: "9px 12px", fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 8, background: T.surface2, color: T.text, outline: "none", boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: T.text3, display: "block", marginBottom: 3 }}>Customer Email</label>
                    <input name="email" placeholder="sarah@gmail.com" defaultValue="sarah.test@gmail.com" type="email" style={{ width: "100%", padding: "9px 12px", fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 8, background: T.surface2, color: T.text, outline: "none", boxSizing: "border-box" }} />
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: T.text3, display: "block", marginBottom: 3 }}>Channel</label>
                    <select name="channel" defaultValue="email" style={{ width: "100%", padding: "9px 12px", fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 8, background: T.surface2, color: T.text, outline: "none", cursor: "pointer" }}>
                      <option value="email">📧 Email</option><option value="chat">💬 Live Chat</option><option value="social_instagram">📸 Instagram</option>
                      <option value="social_facebook">📘 Facebook</option><option value="social_tiktok">🎵 TikTok</option><option value="phone">📞 Phone</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: T.text3, display: "block", marginBottom: 3 }}>Priority</label>
                    <select name="priority" defaultValue="medium" style={{ width: "100%", padding: "9px 12px", fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 8, background: T.surface2, color: T.text, outline: "none", cursor: "pointer" }}>
                      <option value="low">🟢 Low</option><option value="medium">🟡 Medium</option><option value="high">🟠 High</option><option value="urgent">🔴 Urgent</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 600, color: T.text3, display: "block", marginBottom: 3 }}>Category</label>
                    <select name="category" value={simCategory} onChange={e => setSimCategory(e.target.value)} style={{ width: "100%", padding: "9px 12px", fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 8, background: T.surface2, color: T.text, outline: "none", cursor: "pointer" }}>
                      <option value="general">General</option><option value="subscription">Subscription</option><option value="shipping">Shipping</option>
                      <option value="product">Product</option><option value="billing">Billing</option><option value="returns">Returns</option>
                      <option value="account">Account</option><option value="feedback">Feedback</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 600, color: T.text3, display: "block", marginBottom: 3 }}>Customer Message <span style={{ color: "#ef4444" }}>*</span></label>
                  <textarea name="message" value={simMessage} onChange={e => setSimMessage(e.target.value)} placeholder="Type the customer's email message here..." rows={5} required style={{ width: "100%", padding: "9px 12px", fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 8, background: T.surface2, color: T.text, resize: "vertical", fontFamily: "inherit", outline: "none", boxSizing: "border-box", lineHeight: 1.5 }} />
                </div>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", paddingTop: 8, borderTop: `1px solid ${T.border}` }}>
                  <button type="button" onClick={() => setShowNewTicket(false)} style={{ padding: "9px 18px", background: T.surface3, color: T.text2, border: "none", borderRadius: 8, fontSize: 12, cursor: "pointer" }}>Cancel</button>
                  <button type="submit" style={{ padding: "9px 20px", background: T.accent, color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>📨 Simulate Email &amp; Generate AI Draft</button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
// CX Support v3 - 20260402025142
