"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";
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
      const { data: p } = await supabase.from("profiles").select("*").eq("id", u.id).single();
      setProfile(p);
      const orgId = p?.org_id;
      if (!orgId) return;

      const [ticketRes, macroRes, kbRes, tagRes, viewRes, contactRes, aiConfRes, socialAcctRes, socialMentRes, socialRuleRes] = await Promise.all([
        supabase.from("cx_tickets").select("*").eq("org_id", orgId).in("status", ["open", "pending", "waiting"]).order("created_at", { ascending: false }).limit(100),
        supabase.from("cx_macros").select("*").eq("org_id", orgId).eq("is_active", true).order("usage_count", { ascending: false }),
        supabase.from("cx_kb_articles").select("*").eq("org_id", orgId).eq("status", "published").order("view_count", { ascending: false }),
        supabase.from("cx_tags").select("*").eq("org_id", orgId).order("name"),
        supabase.from("cx_views").select("*").eq("org_id", orgId).order("name"),
        supabase.from("cx_contacts").select("*").eq("org_id", orgId).order("last_contact_at", { ascending: false }).limit(50),
        supabase.from("cx_ai_config").select("*").eq("org_id", orgId).single(),
        supabase.from("cx_social_accounts").select("*").eq("org_id", orgId).order("platform"),
        supabase.from("cx_social_mentions").select("*").eq("org_id", orgId).order("posted_at", { ascending: false }).limit(50),
        supabase.from("cx_social_rules").select("*").eq("org_id", orgId).order("name"),
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
      const { data } = await supabase.from("cx_messages").select("*").eq("ticket_id", selected.id).order("created_at");
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
    const orgId = profile?.org_id;
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
        await supabase.from("cx_tickets").update(updates).eq("id", selected.id);
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
    await supabase.from("cx_tickets").update({ [field]: value, updated_at: new Date().toISOString() }).eq("id", selected.id);
    setSelected(s => ({ ...s, [field]: value }));
    setTickets(p => p.map(t => t.id === selected.id ? { ...t, [field]: value } : t));
  };

  const createTicket = async (form) => {
    const orgId = profile?.org_id;
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
              <button onClick={() => setShowNewTicket(true)} style={{ padding: "7px 12px", background: T.accent, color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>+ New</button>
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
                  <div style={{ display: "flex", gap: 4 }}>
                    <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: STATUS_COLORS[ticket.status] + "20", color: STATUS_COLORS[ticket.status], fontWeight: 700, textTransform: "capitalize" }}>{ticket.status}</span>
                    <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: PRIORITY_COLORS[ticket.priority] + "20", color: PRIORITY_COLORS[ticket.priority], fontWeight: 700, textTransform: "capitalize" }}>{ticket.priority}</span>
                    {ticket.ai_auto_resolved && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: "#a855f720", color: "#a855f7", fontWeight: 700 }}>🤖 AI</span>}
                    {ticket.sla_breached && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: "#ef444420", color: "#ef4444", fontWeight: 700 }}>⚠️ SLA</span>}
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
                  <div style={{ fontSize: 11, color: T.text3, display: "flex", gap: 8, alignItems: "center", marginTop: 2 }}>
                    <span>{CHANNEL_ICONS[selected.channel]} {selected.customer_name || selected.customer_email}</span>
                    <span>#{selected.ticket_number}</span>
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
                    { label: "AI Resolution Rate", value: "—", target: ">60%", icon: "🤖" },
                    { label: "Avg Response Time", value: "—", target: "<2 min", icon: "⚡" },
                    { label: "Customer Satisfaction", value: "—", target: ">4.5", icon: "⭐" },
                    { label: "Escalation Rate", value: "—", target: "<15%", icon: "🔄" },
                    { label: "Tickets Handled", value: "0", target: "", icon: "🎫" },
                    { label: "Cost per Ticket", value: "—", target: "<$0.10", icon: "💰" },
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
            </div>
          );
        })()}

        {/* Knowledge Base tab */}
        {tab === "kb" && (
          <div style={{ flex: 1, padding: 20, overflow: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>📖 Knowledge Base</h2>
              <button onClick={async () => {
                const { data } = await supabase.from("cx_kb_articles").insert({ org_id: profile?.org_id, title: "New Article", content: "", category: "general", status: "draft", created_by: user?.id }).select().single();
                if (data) setKbArticles(p => [data, ...p]);
              }} style={{ padding: "6px 14px", background: T.accent, color: "#fff", border: "none", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>+ New Article</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
              {kbArticles.map(a => (
                <div key={a.id} style={{ padding: 14, borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 4 }}>{a.title}</div>
                  <div style={{ fontSize: 11, color: T.text3, marginBottom: 8 }}>{a.category} · {a.status}</div>
                  <div style={{ fontSize: 12, color: T.text2, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}>{a.content || "Empty article"}</div>
                </div>
              ))}
              {kbArticles.length === 0 && <div style={{ padding: 30, textAlign: "center", color: T.text3, gridColumn: "1/-1" }}>No articles yet. Create your first knowledge base article to train the AI agent.</div>}
            </div>
          </div>
        )}

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
              <div style={{ display: "flex", gap: 8, padding: "10px 16px", borderBottom: `1px solid ${T.border}`, overflowX: "auto", flexShrink: 0 }}>
                {socialAccounts.map(a => (
                  <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 6, background: a.is_connected ? T.accentDim : T.surface2, border: `1px solid ${a.is_connected ? T.accent + "30" : T.border}`, flexShrink: 0 }}>
                    <span style={{ fontSize: 14 }}>{CHANNEL_ICONS["social_" + a.platform] || CHANNEL_ICONS[a.platform] || "📱"}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: a.is_connected ? T.accent : T.text3 }}>{a.account_handle}</span>
                    {a.follower_count > 0 && <span style={{ fontSize: 9, color: T.text3 }}>{a.follower_count > 1000 ? (a.follower_count / 1000).toFixed(0) + "K" : a.follower_count}</span>}
                    <span style={{ width: 6, height: 6, borderRadius: 3, background: a.is_connected ? "#22c55e" : "#ef4444" }} />
                  </div>
                ))}
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
                <span style={{ fontSize: 10, color: T.text3 }}>{socialMentions.filter(m => m.status === "new").length} new mentions</span>
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
                              {m.likes > 0 && <span style={{ fontSize: 10, color: T.text3 }}>❤️ {m.likes > 1000 ? (m.likes / 1000).toFixed(1) + "K" : m.likes}</span>}
                              {m.comments > 0 && <span style={{ fontSize: 10, color: T.text3 }}>💬 {m.comments}</span>}
                              {m.shares > 0 && <span style={{ fontSize: 10, color: T.text3 }}>🔄 {m.shares > 1000 ? (m.shares / 1000).toFixed(1) + "K" : m.shares}</span>}
                            </div>
                            {/* Action buttons when expanded */}
                            {selectedMention?.id === m.id && (
                              <div style={{ display: "flex", gap: 6, marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
                                <button onClick={async (e) => { e.stopPropagation(); await supabase.from("cx_social_mentions").update({ status: "replied" }).eq("id", m.id); setSocialMentions(p => p.map(x => x.id === m.id ? { ...x, status: "replied" } : x)); }}
                                  style={{ padding: "5px 10px", fontSize: 10, fontWeight: 600, borderRadius: 5, border: `1px solid #22c55e40`, background: "#22c55e10", color: "#22c55e", cursor: "pointer" }}>✅ Mark Replied</button>
                                <button onClick={async (e) => { e.stopPropagation(); await supabase.from("cx_social_mentions").update({ status: "escalated" }).eq("id", m.id); setSocialMentions(p => p.map(x => x.id === m.id ? { ...x, status: "escalated" } : x)); }}
                                  style={{ padding: "5px 10px", fontSize: 10, fontWeight: 600, borderRadius: 5, border: `1px solid #ef444440`, background: "#ef444410", color: "#ef4444", cursor: "pointer" }}>🔴 Escalate</button>
                                <button onClick={async (e) => { e.stopPropagation(); await supabase.from("cx_social_mentions").update({ status: "ignored" }).eq("id", m.id); setSocialMentions(p => p.map(x => x.id === m.id ? { ...x, status: "ignored" } : x)); }}
                                  style={{ padding: "5px 10px", fontSize: 10, fontWeight: 600, borderRadius: 5, border: `1px solid ${T.border}`, background: T.surface2, color: T.text3, cursor: "pointer" }}>⚫ Ignore</button>
                                <button style={{ padding: "5px 10px", fontSize: 10, fontWeight: 600, borderRadius: 5, border: `1px solid #a855f740`, background: "#a855f710", color: "#a855f7", cursor: "pointer" }}>✨ AI Reply</button>
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
        {tab === "analytics" && (
          <div style={{ flex: 1, padding: 20, overflow: "auto" }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 16px 0" }}>📊 Support Analytics</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12 }}>
              {[
                { label: "Open Tickets", value: stats.open, color: "#3b82f6", icon: "📬" },
                { label: "Pending", value: stats.pending, color: "#f59e0b", icon: "⏳" },
                { label: "Urgent", value: stats.urgent, color: "#ef4444", icon: "🔥" },
                { label: "AI Auto-Resolved", value: stats.ai_resolved, color: "#a855f7", icon: "🤖" },
                { label: "Resolved Today", value: stats.resolved_today, color: "#22c55e", icon: "✅" },
                { label: "Total Tickets", value: tickets.length, color: T.text2, icon: "🎫" },
              ].map(k => (
                <div key={k.label} style={{ padding: 16, borderRadius: 10, border: `1px solid ${T.border}`, background: T.surface, textAlign: "center" }}>
                  <div style={{ fontSize: 24 }}>{k.icon}</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: k.color, marginTop: 4 }}>{k.value}</div>
                  <div style={{ fontSize: 11, color: T.text3, fontWeight: 600, textTransform: "uppercase", marginTop: 2 }}>{k.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* New Ticket Modal */}
      {showNewTicket && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" }} onClick={() => setShowNewTicket(false)}>
          <div style={{ width: 480, background: T.surface, borderRadius: 12, border: `1px solid ${T.border}`, padding: 24 }} onClick={e => e.stopPropagation()}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 16px 0" }}>New Ticket</h3>
            <form onSubmit={e => { e.preventDefault(); const f = new FormData(e.target); createTicket({ subject: f.get("subject"), email: f.get("email"), name: f.get("name"), channel: f.get("channel"), priority: f.get("priority"), message: f.get("message") }); }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <input name="subject" placeholder="Subject" required style={{ padding: "8px 12px", fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface2, color: T.text }} />
                <div style={{ display: "flex", gap: 8 }}>
                  <input name="name" placeholder="Customer name" style={{ flex: 1, padding: "8px 12px", fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface2, color: T.text }} />
                  <input name="email" placeholder="Email" type="email" style={{ flex: 1, padding: "8px 12px", fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface2, color: T.text }} />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <select name="channel" defaultValue="email" style={{ flex: 1, padding: "8px 12px", fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface2, color: T.text }}>
                    <option value="email">📧 Email</option><option value="chat">💬 Chat</option><option value="phone">📞 Phone</option>
                    <option value="social_facebook">📘 Facebook</option><option value="social_instagram">📸 Instagram</option>
                  </select>
                  <select name="priority" defaultValue="medium" style={{ flex: 1, padding: "8px 12px", fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface2, color: T.text }}>
                    <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
                  </select>
                </div>
                <textarea name="message" placeholder="Initial message (optional)" rows={3} style={{ padding: "8px 12px", fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface2, color: T.text, resize: "vertical", fontFamily: "inherit" }} />
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                  <button type="button" onClick={() => setShowNewTicket(false)} style={{ padding: "8px 16px", background: T.surface2, color: T.text2, border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>Cancel</button>
                  <button type="submit" style={{ padding: "8px 16px", background: T.accent, color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Create Ticket</button>
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
