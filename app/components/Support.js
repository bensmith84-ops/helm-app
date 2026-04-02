"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { T as TK } from "../tokens";

const STATUS_COLORS = { open: "#3b82f6", pending: "#f59e0b", waiting: "#8b5cf6", resolved: "#22c55e", closed: "#6b7280" };
const PRIORITY_COLORS = { urgent: "#ef4444", high: "#f97316", medium: "#f59e0b", low: "#6b7280" };
const CHANNEL_ICONS = { email: "📧", chat: "💬", social_facebook: "📘", social_instagram: "📸", social_tiktok: "🎵", social_twitter: "🐦", phone: "📞", internal: "🏢", api: "⚡" };

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

      const [ticketRes, macroRes, kbRes, tagRes, viewRes, contactRes] = await Promise.all([
        supabase.from("cx_tickets").select("*").eq("org_id", orgId).in("status", ["open", "pending", "waiting"]).order("created_at", { ascending: false }).limit(100),
        supabase.from("cx_macros").select("*").eq("org_id", orgId).eq("is_active", true).order("usage_count", { ascending: false }),
        supabase.from("cx_kb_articles").select("*").eq("org_id", orgId).eq("status", "published").order("view_count", { ascending: false }),
        supabase.from("cx_tags").select("*").eq("org_id", orgId).order("name"),
        supabase.from("cx_views").select("*").eq("org_id", orgId).order("name"),
        supabase.from("cx_contacts").select("*").eq("org_id", orgId).order("last_contact_at", { ascending: false }).limit(50),
      ]);

      setTickets(ticketRes.data || []);
      setMacros(macroRes.data || []);
      setKbArticles(kbRes.data || []);
      setTags(tagRes.data || []);
      setViews(viewRes.data || []);
      setContacts(contactRes.data || []);

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
    { key: "kb", label: "Knowledge Base", icon: "📖" },
    { key: "macros", label: "Macros", icon: "⚡" },
    { key: "contacts", label: "Contacts", icon: "👥" },
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
