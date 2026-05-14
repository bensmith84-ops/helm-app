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

// ───────────── Deep-link helper ─────────────
// Given a social mention's platform + post_url + external_id, return the
// best URL we can build to land on the SPECIFIC comment when possible.
// Falls back to the post URL when the platform doesn't support comment
// deep linking, or when the comment id is missing.
function commentDeepLink(mention) {
  if (!mention) return null;
  const platform = (mention.platform || "").toLowerCase();
  const postUrl = mention.post_url;
  const commentId = mention.external_id;
  if (!postUrl) return null;
  if (!commentId || mention.is_dm) return postUrl;  // DMs don't have a public link

  try {
    if (platform === "instagram") {
      // IG: https://www.instagram.com/p/{shortcode}/ → append /c/{comment_id}/
      const match = postUrl.match(/instagram\.com\/(p|reel|tv)\/([^\/?#]+)/);
      if (match) return `https://www.instagram.com/${match[1]}/${match[2]}/c/${encodeURIComponent(commentId)}/`;
      return postUrl;
    }
    if (platform === "facebook") {
      // FB: append ?comment_id={id} to whatever the post URL is
      const sep = postUrl.includes("?") ? "&" : "?";
      return `${postUrl}${sep}comment_id=${encodeURIComponent(commentId)}`;
    }
    if (platform === "youtube") {
      // YT: ?lc={comment_id} on the watch page
      const sep = postUrl.includes("?") ? "&" : "?";
      return `${postUrl}${sep}lc=${encodeURIComponent(commentId)}`;
    }
    if (platform === "linkedin") {
      // LinkedIn doesn't have a clean comment deep-link; the post URL with a
      // commentUrn anchor works in the app but not in browsers consistently.
      return postUrl;
    }
    // TikTok and X: only post-level links are reliable
    return postUrl;
  } catch (_) {
    return postUrl;
  }
}

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
  const [socialFilter, setSocialFilter] = useState({ platform: "all", status: "all", sentiment: "all" });
  const [selectedMention, setSelectedMention] = useState(null);
  const [moderationRules, setModerationRules] = useState([]);
  const [moderatingId, setModeratingId] = useState(null);
  const [aiReplyLoading, setAiReplyLoading] = useState(null);
  const [slaPolicies, setSlaPolicies] = useState([]);
  const [automations, setAutomations] = useState([]);
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  // ─── Phase 1 (Mandy wishlist) state ───
  const [brands, setBrands] = useState([]);
  const [crisisMode, setCrisisMode] = useState(null);
  const [spikeAlerts, setSpikeAlerts] = useState([]);
  const [socialPosts, setSocialPosts] = useState([]);
  const [exportJobs, setExportJobs] = useState([]);
  const [kbGapReports, setKbGapReports] = useState([]);
  const [kbGapLoading, setKbGapLoading] = useState(false);
  const [sideConversations, setSideConversations] = useState([]);
  const [selectedSideConv, setSelectedSideConv] = useState(null);
  const [sideConvMessages, setSideConvMessages] = useState([]);
  const [showSideConvModal, setShowSideConvModal] = useState(false);
  const [sideConvForm, setSideConvForm] = useState({ subject: "", participant_type: "vendor", participant_email: "", participant_name: "", body: "" });
  const [showSnoozeModal, setShowSnoozeModal] = useState(false);
  const [snoozeForm, setSnoozeForm] = useState({ duration: "4h", reason: "" });
  const [showCrisisModal, setShowCrisisModal] = useState(false);
  const [crisisForm, setCrisisForm] = useState({ reason: "", public_statement: "", holding_macro_id: null });
  const [agentAssist, setAgentAssist] = useState(null);
  const [agentAssistLoading, setAgentAssistLoading] = useState(false);
  const [ticketLockWarning, setTicketLockWarning] = useState(null);
  const [exportForm, setExportForm] = useState({ scope: "tickets", format: "csv" });
  // ─── Phase 2 state ───
  const [showRevenueModal, setShowRevenueModal] = useState(false);
  const [revenueForm, setRevenueForm] = useState({ amount_cents: "", order_ids: "" });
  const [activeBrandId, setActiveBrandId] = useState(null);  // null = all brands
  const [fulfillmentAlerts, setFulfillmentAlerts] = useState([]);
  const [showFulfillmentDrawer, setShowFulfillmentDrawer] = useState(false);
  const [agentRevenue, setAgentRevenue] = useState([]);
  const [qaScores, setQaScores] = useState([]);  // for current ticket
  const [showQaModal, setShowQaModal] = useState(false);
  const [qaForm, setQaForm] = useState({ tone_score: 4, accuracy_score: 4, resolution_score: 4, policy_score: 4, notes: "", flags: [] });
  const [showTagsModal, setShowTagsModal] = useState(false);  // tags manager modal
  const [newTagForm, setNewTagForm] = useState({ name: "", color: "#6b7280", parent_id: null });
  // ─── Phase 3 state: tone check ───
  const [toneCheck, setToneCheck] = useState(null);        // {severity, flags, summary}
  const [toneCheckLoading, setToneCheckLoading] = useState(false);
  // ─── Phase 3b state: competitor tracking ───
  const [competitors, setCompetitors] = useState([]);
  const [showCompetitorsModal, setShowCompetitorsModal] = useState(false);
  const [newCompetitorForm, setNewCompetitorForm] = useState({ name: "", keywords: "", instagram: "", facebook: "", tiktok: "", youtube: "", twitter: "", linkedin: "" });
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

      const [ticketRes, macroRes, kbRes, tagRes, viewRes, contactRes, aiConfRes, socialAcctRes, socialMentRes, socialRuleRes, modRuleRes, slaRes, autoRes, brandRes, crisisRes, spikeRes, postsRes, exportRes, gapRes, fulfillRes, agentRevRes, competitorRes] = await Promise.all([
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
        // Phase 1 wishlist additions
        supabase.from("cx_brands").select("*").eq("org_id", orgId).eq("is_active", true).order("sort_order"),
        supabase.from("cx_crisis_mode").select("*").eq("org_id", orgId).maybeSingle(),
        supabase.from("cx_spike_alerts").select("*").eq("org_id", orgId).eq("acknowledged", false).order("created_at", { ascending: false }).limit(20),
        supabase.from("cx_social_posts").select("*").eq("org_id", orgId).order("posted_at", { ascending: false }).limit(50),
        supabase.from("cx_export_jobs").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(20),
        supabase.from("cx_kb_gap_reports").select("*").eq("org_id", orgId).eq("status", "open").order("occurrence_count", { ascending: false }).limit(20),
        // Phase 2
        supabase.from("cx_fulfillment_alerts").select("*").eq("org_id", orgId).eq("resolved", false).order("detected_at", { ascending: false }).limit(50),
        supabase.from("cx_agent_revenue").select("*").eq("org_id", orgId).order("week", { ascending: false }).limit(100),
        // Phase 3b
        supabase.from("cx_competitors").select("*").eq("org_id", orgId).order("created_at", { ascending: false }),
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
      setBrands(brandRes.data || []);
      setCrisisMode(crisisRes.data || null);
      setSpikeAlerts(spikeRes.data || []);
      setSocialPosts(postsRes.data || []);
      setExportJobs(exportRes.data || []);
      setKbGapReports(gapRes.data || []);
      setFulfillmentAlerts(fulfillRes.data || []);
      setAgentRevenue(agentRevRes.data || []);
      setCompetitors(competitorRes.data || []);

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

  // Load messages when ticket selected. Also load side conversations and
  // claim the ticket so another agent doesn't reply in parallel.
  useEffect(() => {
    if (!selected) { setTicketLockWarning(null); setSideConversations([]); setAgentAssist(null); return; }
    const loadMsgs = async () => {
      const { data } = await supabase.from("cx_messages").select("*").eq("org_id", orgId).eq("ticket_id", selected.id).order("created_at");
      setMessages(data || []);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    };
    loadMsgs();
    // Only run claim/side conv logic on ACTUAL tickets, not on KB articles or
    // other entities that share the `selected` state. cx_tickets always has
    // a ticket_number; KB articles don't.
    if (selected.ticket_number != null) {
      loadSideConvs(selected.id);
      (async () => {
        try {
          const { data } = await supabase.rpc("cx_claim_ticket", { p_ticket_id: selected.id, p_lease_minutes: 5 });
          if (data && data.success === false) setTicketLockWarning(data);
          else setTicketLockWarning(null);
        } catch (_) {}
      })();
      (async () => {
        const { data: assist } = await supabase.from("cx_agent_assist")
          .select("*").eq("ticket_id", selected.id)
          .order("generated_at", { ascending: false }).limit(1).maybeSingle();
        if (assist) setAgentAssist(assist);
        else setAgentAssist(null);
      })();
      // Load any QA scores already recorded for this ticket so the toolbar
      // can show a history if the score was given by someone else.
      (async () => {
        const { data } = await supabase.from("cx_qa_scores")
          .select("*").eq("ticket_id", selected.id)
          .order("created_at", { ascending: false });
        setQaScores(data || []);
      })();
      return () => {
        supabase.rpc("cx_release_ticket", { p_ticket_id: selected.id }).then(() => {}).catch(() => {});
      };
    }
  }, [selected?.id]);

  const filteredTickets = tickets.filter(t => {
    if (filter.status.length && !filter.status.includes(t.status)) return false;
    // Brand filter from the admin row. activeBrandId is null when "All brands"
    // is selected. Tickets without a brand_id show up when filtered by any
    // brand only if you're on "All" — keeps legacy unbranded tickets visible
    // until they're explicitly tagged.
    if (activeBrandId && t.brand_id !== activeBrandId) return false;
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

  // ────────── Phase 1 (Mandy wishlist) handlers ──────────
  const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwYmpkbW55a2hldWJ4a3VrbnVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNDI3OTcsImV4cCI6MjA4NzcxODc5N30.pvTTkiZWNDPuo-Fdzm54uy8w1mlx0AjB5jtFm3MeGq4";
  const EFN_BASE = "https://upbjdmnykheubxkuknuj.supabase.co/functions/v1";

  // Snooze the selected ticket. Server-side cron auto-wakes it.
  const snoozeSelected = async () => {
    if (!selected) return;
    const m = /^(\d+)([hdw])$/.exec(snoozeForm.duration);
    if (!m) { alert("Invalid duration"); return; }
    const n = parseInt(m[1], 10), unit = m[2];
    const ms = unit === "h" ? n * 3600000 : unit === "d" ? n * 86400000 : n * 7 * 86400000;
    const until = new Date(Date.now() + ms).toISOString();
    await supabase.from("cx_tickets").update({
      status: "waiting", snoozed_until: until,
      snooze_reason: snoozeForm.reason || null,
      snoozed_by: user?.id || null,
    }).eq("id", selected.id);
    setTickets(p => p.map(t => t.id === selected.id ? { ...t, status: "waiting", snoozed_until: until, snooze_reason: snoozeForm.reason } : t));
    setSelected(s => s ? { ...s, status: "waiting", snoozed_until: until } : null);
    setShowSnoozeModal(false);
  };
  const unsnoozeTicket = async (ticketId) => {
    await supabase.from("cx_tickets").update({ status: "open", snoozed_until: null, snooze_reason: null, snoozed_by: null }).eq("id", ticketId);
    setTickets(p => p.map(t => t.id === ticketId ? { ...t, status: "open", snoozed_until: null, snooze_reason: null } : t));
    if (selected?.id === ticketId) setSelected(s => ({ ...s, status: "open", snoozed_until: null }));
  };

  // Side conversations (loop in 3PL / vendor / warehouse)
  const loadSideConvs = async (ticketId) => {
    const { data } = await supabase.from("cx_side_conversations").select("*").eq("ticket_id", ticketId).order("created_at", { ascending: false });
    setSideConversations(data || []);
  };
  const openSideConv = async (sc) => {
    setSelectedSideConv(sc);
    const { data } = await supabase.from("cx_side_messages").select("*").eq("side_conversation_id", sc.id).order("created_at", { ascending: true });
    setSideConvMessages(data || []);
  };
  const createSideConv = async () => {
    if (!selected || !sideConvForm.subject || !sideConvForm.participant_email || !sideConvForm.body) return;
    const { data: sc, error } = await supabase.from("cx_side_conversations").insert({
      org_id: orgId, ticket_id: selected.id, subject: sideConvForm.subject,
      participant_type: sideConvForm.participant_type,
      participant_email: sideConvForm.participant_email,
      participant_name: sideConvForm.participant_name || null,
      channel: "email", status: "open", created_by: user.id,
      last_message_at: new Date().toISOString(),
    }).select().single();
    if (error) { alert(error.message); return; }
    await supabase.from("cx_side_messages").insert({
      org_id: orgId, side_conversation_id: sc.id, direction: "outbound",
      sender_type: "agent", sender_id: user.id,
      sender_name: profile?.full_name || user.email, sender_email: user.email,
      body_text: sideConvForm.body,
    });
    setSideConvForm({ subject: "", participant_type: "vendor", participant_email: "", participant_name: "", body: "" });
    setShowSideConvModal(false);
    loadSideConvs(selected.id);
  };

  // Agent assist (in-ticket AI)
  const runAgentAssist = async (force = false) => {
    if (!selected) return;
    setAgentAssistLoading(true);
    try {
      const res = await fetch(`${EFN_BASE}/cx-agent-assist`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ANON_KEY}` },
        body: JSON.stringify({ ticket_id: selected.id, force_refresh: force }),
      });
      const data = await res.json();
      if (data.error) { console.error("Agent assist:", data.error); }
      else { setAgentAssist(data); }
    } catch (e) { console.error(e); }
    setAgentAssistLoading(false);
  };

  // Crisis mode toggle
  const toggleCrisisMode = async (turnOn) => {
    if (!crisisMode) return;
    const now = new Date().toISOString();
    const entry = { at: now, by: user?.id, by_name: profile?.full_name || user?.email, action: turnOn ? "activated" : "deactivated", reason: turnOn ? crisisForm.reason : null };
    const updates = turnOn ? {
      is_active: true, activated_by: user.id, activated_at: now, deactivated_at: null,
      reason: crisisForm.reason || null, public_statement: crisisForm.public_statement || null,
      holding_macro_id: crisisForm.holding_macro_id || null,
      history: [...(crisisMode.history || []), entry], updated_at: now,
    } : { is_active: false, deactivated_at: now, history: [...(crisisMode.history || []), entry], updated_at: now };
    const { data } = await supabase.from("cx_crisis_mode").update(updates).eq("org_id", orgId).select().single();
    setCrisisMode(data);
    setShowCrisisModal(false);
  };

  // Exports
  const queueExport = async (filters = {}) => {
    const { data, error } = await supabase.from("cx_export_jobs").insert({
      org_id: orgId, requested_by: user.id, scope: exportForm.scope,
      filters, format: exportForm.format, status: "queued",
    }).select().single();
    if (error) { alert(error.message); return; }
    setExportJobs(p => [data, ...p]);
    fetch(`${EFN_BASE}/cx-export-runner`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ANON_KEY}` },
      body: JSON.stringify({ job_id: data.id }),
    }).then(() => refreshExportJobs()).catch(() => {});
  };
  const refreshExportJobs = async () => {
    const { data } = await supabase.from("cx_export_jobs").select("*").eq("org_id", orgId).order("created_at", { ascending: false }).limit(20);
    setExportJobs(data || []);
  };

  // KB gap report
  const runKbGapReport = async () => {
    setKbGapLoading(true);
    try {
      await fetch(`${EFN_BASE}/cx-kb-gap-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ANON_KEY}` },
        body: JSON.stringify({ org_id: orgId, days: 7 }),
      });
      const { data } = await supabase.from("cx_kb_gap_reports").select("*").eq("org_id", orgId).eq("status", "open").order("occurrence_count", { ascending: false }).limit(20);
      setKbGapReports(data || []);
    } catch (e) { console.error(e); }
    setKbGapLoading(false);
  };

  // Acknowledge a spike alert so it stops nagging
  const ackSpike = async (id) => {
    await supabase.from("cx_spike_alerts").update({ acknowledged: true, acknowledged_by: user.id, acknowledged_at: new Date().toISOString() }).eq("id", id);
    setSpikeAlerts(p => p.filter(s => s.id !== id));
  };

  // ────────── Phase 2 handlers ──────────

  // Save revenue attribution on the current ticket. order_ids is a free-text
  // comma-separated input that we split into a Postgres text[].
  const saveRevenueAttribution = async () => {
    if (!selected) return;
    const cents = Math.round(parseFloat(revenueForm.amount_cents || "0") * 100);
    const ids = revenueForm.order_ids.split(",").map(s => s.trim()).filter(Boolean);
    await supabase.from("cx_tickets").update({
      revenue_attributed_cents: cents,
      revenue_order_ids: ids,
    }).eq("id", selected.id);
    setTickets(p => p.map(t => t.id === selected.id ? { ...t, revenue_attributed_cents: cents, revenue_order_ids: ids } : t));
    setSelected(s => s ? { ...s, revenue_attributed_cents: cents, revenue_order_ids: ids } : null);
    setShowRevenueModal(false);
  };

  // Submit a QA score for the selected ticket. The reviewer scores up to
  // four rubric dimensions (1-5 each); the DB trigger computes the overall.
  const submitQaScore = async () => {
    if (!selected || !selected.assigned_to) {
      alert("This ticket has no assigned agent to score.");
      return;
    }
    const { error } = await supabase.from("cx_qa_scores").insert({
      org_id: orgId,
      ticket_id: selected.id,
      scored_user_id: selected.assigned_to,
      scored_by: user.id,
      scored_by_type: "human",
      tone_score: qaForm.tone_score,
      accuracy_score: qaForm.accuracy_score,
      resolution_score: qaForm.resolution_score,
      policy_score: qaForm.policy_score,
      notes: qaForm.notes || null,
      flags: qaForm.flags || [],
    });
    if (error) { alert(error.message); return; }
    setShowQaModal(false);
    setQaForm({ tone_score: 4, accuracy_score: 4, resolution_score: 4, policy_score: 4, notes: "", flags: [] });
    // Refetch the agent revenue rollup since QA may surface alongside it.
    const { data } = await supabase.from("cx_qa_scores").select("*").eq("ticket_id", selected.id).order("created_at", { ascending: false });
    setQaScores(data || []);
  };

  // Create or update a tag. parent_id may be null (top-level) or a UUID
  // (nested child). The Tags modal handles both cases.
  const createTag = async () => {
    if (!newTagForm.name.trim()) return;
    const { data, error } = await supabase.from("cx_tags").insert({
      org_id: orgId,
      name: newTagForm.name.trim(),
      color: newTagForm.color,
      parent_id: newTagForm.parent_id || null,
      sort_order: tags.filter(t => t.parent_id === (newTagForm.parent_id || null)).length,
    }).select().single();
    if (error) { alert(error.message); return; }
    setTags(p => [...p, data]);
    setNewTagForm({ name: "", color: "#6b7280", parent_id: null });
  };

  const deleteTag = async (id) => {
    if (!confirm("Delete this tag? Children will be unlinked but kept.")) return;
    // Children get their parent_id set to NULL by the ON DELETE SET NULL rule.
    await supabase.from("cx_tags").delete().eq("id", id);
    setTags(p => p.filter(t => t.id !== id).map(t => t.parent_id === id ? { ...t, parent_id: null } : t));
  };

  // ─── Competitor tracking (Phase 3b) ───
  // Add a competitor. handles is a jsonb keyed by platform — we build it
  // from per-platform inputs in the modal form.
  const addCompetitor = async () => {
    if (!newCompetitorForm.name.trim()) return;
    const handles = {};
    for (const k of ["instagram", "facebook", "tiktok", "youtube", "twitter", "linkedin"]) {
      const v = newCompetitorForm[k]?.trim();
      if (v) handles[k] = v.replace(/^@/, "");  // strip leading @ since some users include it
    }
    const keywords = newCompetitorForm.keywords.split(",").map(s => s.trim()).filter(Boolean);
    const { data, error } = await supabase.from("cx_competitors").insert({
      org_id: orgId,
      name: newCompetitorForm.name.trim(),
      handles,
      keywords,
      is_active: true,
    }).select().single();
    if (error) { alert(error.message); return; }
    setCompetitors(p => [data, ...p]);
    setNewCompetitorForm({ name: "", keywords: "", instagram: "", facebook: "", tiktok: "", youtube: "", twitter: "", linkedin: "" });
    // Kick the classifier so newly-added competitor catches up to existing
    // mentions instead of waiting up to 15 minutes for the cron.
    runCompetitorClassifier();
  };

  const toggleCompetitorActive = async (id, isActive) => {
    await supabase.from("cx_competitors").update({ is_active: !isActive }).eq("id", id);
    setCompetitors(p => p.map(c => c.id === id ? { ...c, is_active: !isActive } : c));
  };

  const deleteCompetitor = async (id) => {
    if (!confirm("Delete this competitor? Existing mentions stay flagged but won't get newly classified.")) return;
    await supabase.from("cx_competitors").delete().eq("id", id);
    setCompetitors(p => p.filter(c => c.id !== id));
  };

  // Trigger the classifier RPC. Idempotent; safe to call as often as we want.
  const runCompetitorClassifier = async () => {
    try {
      await supabase.rpc("cx_classify_competitor_mentions", { p_org_id: orgId, p_limit: 5000 });
    } catch (e) { console.warn("Classifier:", e); }
  };

  // Tone check on the current draft. Fires cx-tone-check. Doesn't block
  // anything — the agent always retains the choice to send. Useful as a
  // last-look on tricky replies (refunds denied, frustrated customers).
  const runToneCheck = async () => {
    if (!selected || !replyText.trim()) return;
    setToneCheckLoading(true);
    setToneCheck(null);
    try {
      const res = await fetch(`${EFN_BASE}/cx-tone-check`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ANON_KEY}` },
        body: JSON.stringify({ ticket_id: selected.id, draft_text: replyText }),
      });
      const data = await res.json();
      if (data.error) { console.error("Tone check:", data.error); }
      else { setToneCheck(data); }
    } catch (e) { console.error(e); }
    setToneCheckLoading(false);
  };

  // Clear tone-check whenever the draft changes — the warning is for the
  // text that was checked, not for what the agent typed afterward.
  useEffect(() => { if (toneCheck) setToneCheck(null); }, [replyText]);

  const TABS = [
    { key: "inbox", label: "Inbox", icon: "📥", count: stats.open + stats.pending },
    { key: "ai_agent", label: "AI Agent", icon: "🤖" },
    { key: "kb", label: "Knowledge Base", icon: "📖" },
    { key: "macros", label: "Macros", icon: "⚡" },
    { key: "contacts", label: "Contacts", icon: "👥" },
    { key: "social", label: "Social", icon: "📱" },
    { key: "ads", label: "Ads & Posts", icon: "📣", count: socialPosts.reduce((s, p) => s + Number(p.unhandled_count || 0), 0) },
    { key: "moderation", label: "Moderation", icon: "🛡" },
    { key: "sla", label: "SLA", icon: "⏱" },
    { key: "automations", label: "Automations", icon: "⚡" },
    { key: "exports", label: "Exports", icon: "📤" },
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

      {/* ─── Admin row: brand selector + tags manager + fulfillment alerts ─── */}
      <div style={{ display: "flex", gap: 8, padding: "6px 16px", borderBottom: `1px solid ${T.border}40`, alignItems: "center", flexShrink: 0, flexWrap: "wrap", fontSize: 11 }}>
        {brands.length > 1 && (
          <>
            <span style={{ fontSize: 10, color: T.text3, fontWeight: 700, textTransform: "uppercase" }}>Brand:</span>
            <select value={activeBrandId || ""} onChange={e => setActiveBrandId(e.target.value || null)}
              style={{ padding: "3px 8px", fontSize: 11, border: `1px solid ${T.border}`, borderRadius: 5, background: T.surface2, color: T.text, outline: "none" }}>
              <option value="">All brands</option>
              {brands.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </>
        )}
        <button onClick={() => setShowTagsModal(true)}
          style={{ padding: "3px 10px", fontSize: 11, background: T.surface2, color: T.text2, border: `1px solid ${T.border}`, borderRadius: 5, fontWeight: 600, cursor: "pointer" }}>
          🏷️ Manage tags {tags.length > 0 ? `(${tags.length})` : ""}
        </button>
        <button onClick={() => setShowFulfillmentDrawer(true)}
          style={{ padding: "3px 10px", fontSize: 11, background: fulfillmentAlerts.length > 0 ? "#f59e0b15" : T.surface2, color: fulfillmentAlerts.length > 0 ? "#f59e0b" : T.text2, border: `1px solid ${fulfillmentAlerts.length > 0 ? "#f59e0b40" : T.border}`, borderRadius: 5, fontWeight: 600, cursor: "pointer" }}>
          📦 Fulfillment alerts {fulfillmentAlerts.length > 0 ? `(${fulfillmentAlerts.length})` : ""}
        </button>
        <button onClick={() => setShowCompetitorsModal(true)}
          style={{ padding: "3px 10px", fontSize: 11, background: T.surface2, color: T.text2, border: `1px solid ${T.border}`, borderRadius: 5, fontWeight: 600, cursor: "pointer" }}>
          🎯 Competitors {competitors.length > 0 ? `(${competitors.length})` : ""}
        </button>
        <div style={{ flex: 1 }} />
        <button onClick={() => setShowNewTicket(true)} style={{ padding: "3px 10px", fontSize: 11, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 5, cursor: "pointer" }}>+ New ticket</button>
      </div>

      {/* ─── Crisis Mode banner (active state) ─── */}
      {crisisMode?.is_active && (
        <div style={{ padding: "10px 16px", background: "#ef4444", color: "#fff", borderBottom: `1px solid #b91c1c`, display: "flex", gap: 12, alignItems: "center", flexShrink: 0 }}>
          <span style={{ fontSize: 16 }}>🚨</span>
          <div style={{ flex: 1, fontSize: 12 }}>
            <strong>CRISIS MODE ACTIVE</strong>
            {crisisMode.reason && <span> — {crisisMode.reason}</span>}
            {crisisMode.public_statement && <div style={{ fontSize: 11, marginTop: 2, opacity: 0.9 }}>Holding statement: {crisisMode.public_statement}</div>}
          </div>
          <button onClick={() => toggleCrisisMode(false)} style={{ padding: "5px 12px", background: "rgba(255,255,255,0.2)", color: "#fff", border: "1px solid rgba(255,255,255,0.4)", borderRadius: 6, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Deactivate</button>
        </div>
      )}
      {/* Crisis Mode activate button (inactive state) */}
      {!crisisMode?.is_active && (
        <div style={{ display: "flex", justifyContent: "flex-end", padding: "6px 16px", borderBottom: `1px solid ${T.border}40`, flexShrink: 0 }}>
          <button onClick={() => setShowCrisisModal(true)} style={{ padding: "4px 10px", background: "transparent", color: "#ef4444", border: `1px solid #ef444440`, borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: "pointer" }}>🚨 Activate Crisis Mode</button>
        </div>
      )}

      {/* ─── Spike Alerts banner ─── */}
      {spikeAlerts.length > 0 && (
        <div style={{ padding: "8px 16px", background: "#f59e0b15", borderBottom: `1px solid #f59e0b30`, display: "flex", gap: 12, alignItems: "center", flexShrink: 0, overflowX: "auto" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#f59e0b", whiteSpace: "nowrap" }}>📈 Spike detected</span>
          {spikeAlerts.slice(0, 3).map(s => (
            <button key={s.id} onClick={() => ackSpike(s.id)} title="Click to acknowledge"
              style={{ fontSize: 10, padding: "3px 9px", borderRadius: 4, border: `1px solid ${s.severity === "critical" ? "#ef4444" : "#f59e0b"}40`,
                background: (s.severity === "critical" ? "#ef4444" : "#f59e0b") + "15",
                color: s.severity === "critical" ? "#ef4444" : "#f59e0b", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
              {s.metric.replace(/_/g, " ")} {s.platform ? `on ${s.platform}` : ""} · {Number(s.ratio).toFixed(1)}× baseline · ack
            </button>
          ))}
        </div>
      )}

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

              {/* ─── Phase 1 action toolbar: Snooze / Side Conv / Agent Assist ─── */}
              <div style={{ padding: "6px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", flexShrink: 0, fontSize: 11 }}>
                <button onClick={() => setShowSnoozeModal(true)}
                  style={{ padding: "4px 10px", background: T.surface2, color: T.text2, border: `1px solid ${T.border}`, borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                  💤 Snooze
                </button>
                <button onClick={() => setShowSideConvModal(true)}
                  style={{ padding: "4px 10px", background: T.surface2, color: T.text2, border: `1px solid ${T.border}`, borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                  💬 Side conversation {sideConversations.length > 0 ? `(${sideConversations.length})` : ""}
                </button>
                <button onClick={() => runAgentAssist(!!agentAssist)} disabled={agentAssistLoading}
                  style={{ padding: "4px 10px", background: agentAssist ? T.accentDim : T.surface2, color: agentAssist ? T.accent : T.text2, border: `1px solid ${agentAssist ? T.accent : T.border}40`, borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: agentAssistLoading ? "wait" : "pointer" }}>
                  {agentAssistLoading ? "..." : agentAssist ? "🪄 Assist ready" : "🪄 Agent assist"}
                </button>
                {/* Revenue attribution — opens modal pre-populated with what's already on the ticket */}
                <button onClick={() => {
                  setRevenueForm({
                    amount_cents: selected.revenue_attributed_cents ? (Number(selected.revenue_attributed_cents) / 100).toFixed(2) : "",
                    order_ids: (selected.revenue_order_ids || []).join(", "),
                  });
                  setShowRevenueModal(true);
                }}
                  style={{ padding: "4px 10px", background: Number(selected.revenue_attributed_cents) > 0 ? "#22c55e15" : T.surface2, color: Number(selected.revenue_attributed_cents) > 0 ? "#22c55e" : T.text2, border: `1px solid ${Number(selected.revenue_attributed_cents) > 0 ? "#22c55e40" : T.border}`, borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                  💵 {Number(selected.revenue_attributed_cents) > 0 ? `$${(Number(selected.revenue_attributed_cents) / 100).toFixed(0)} attributed` : "Log revenue"}
                </button>
                {/* QA scoring — only meaningful if there's an assigned agent and the ticket is resolved/closed */}
                {selected.assigned_to && (selected.status === "resolved" || selected.status === "closed") && (
                  <button onClick={() => setShowQaModal(true)}
                    style={{ padding: "4px 10px", background: T.surface2, color: T.text2, border: `1px solid ${T.border}`, borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                    ⭐ QA score
                  </button>
                )}
                {selected.snoozed_until && (
                  <span style={{ padding: "3px 9px", borderRadius: 5, background: "#a855f720", color: "#a855f7", fontWeight: 600, fontSize: 10, display: "flex", alignItems: "center", gap: 4 }}>
                    💤 Snoozed until {new Date(selected.snoozed_until).toLocaleString()}
                    <button onClick={() => unsnoozeTicket(selected.id)} style={{ background: "none", border: "none", color: "#a855f7", cursor: "pointer", padding: 0, fontSize: 11 }}>· wake now</button>
                  </span>
                )}
              </div>

              {/* Ticket lock warning when another agent has the active claim */}
              {ticketLockWarning && (
                <div style={{ padding: "8px 16px", background: "#f59e0b15", borderBottom: `1px solid #f59e0b30`, fontSize: 11, color: "#f59e0b", display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                  ⚠️ <strong>{ticketLockWarning.claimer_name || "Another agent"}</strong> is currently working this ticket. Hold off to avoid a duplicate response.
                </div>
              )}

              {/* Agent assist panel */}
              {agentAssist && (
                <div style={{ padding: "10px 16px", background: T.accentDim + "30", borderBottom: `1px solid ${T.accent}30`, flexShrink: 0, fontSize: 11, display: "flex", flexDirection: "column", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: T.accent }}>🪄 Agent assist</span>
                    {agentAssist.vip_score >= 50 && (
                      <span style={{ padding: "2px 8px", borderRadius: 4, background: "#f59e0b20", color: "#f59e0b", fontWeight: 700, fontSize: 10 }}>
                        VIP {agentAssist.vip_score}/100 — {(agentAssist.vip_reasons || []).join(", ")}
                      </span>
                    )}
                    <button onClick={() => runAgentAssist(true)} style={{ marginLeft: "auto", background: "none", border: "none", color: T.text3, fontSize: 11, cursor: "pointer" }}>↻ Refresh</button>
                    <button onClick={() => setAgentAssist(null)} style={{ background: "none", border: "none", color: T.text3, fontSize: 14, cursor: "pointer" }}>×</button>
                  </div>
                  {agentAssist.thread_summary && (
                    <div><strong style={{ color: T.text2 }}>Summary:</strong> <span style={{ color: T.text2 }}>{agentAssist.thread_summary}</span></div>
                  )}
                  {(agentAssist.tone_flags || []).length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, alignItems: "center" }}>
                      <strong style={{ color: T.text2 }}>Tone flags:</strong>
                      {agentAssist.tone_flags.map(t => (
                        <span key={t} style={{ padding: "1px 6px", borderRadius: 3, background: "#ef444415", color: "#ef4444", fontWeight: 600, fontSize: 10 }}>{t.replace(/_/g, " ")}</span>
                      ))}
                    </div>
                  )}
                  {agentAssist.suggested_reply && (
                    <div style={{ marginTop: 4 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, marginBottom: 4 }}>SUGGESTED REPLY</div>
                      <div style={{ padding: 10, background: T.surface, borderRadius: 6, color: T.text2, whiteSpace: "pre-wrap", fontSize: 12, lineHeight: 1.4 }}>{agentAssist.suggested_reply}</div>
                      <button onClick={() => setReplyText(agentAssist.suggested_reply)}
                        style={{ marginTop: 4, padding: "4px 10px", background: T.accent, color: "#fff", border: "none", borderRadius: 5, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                        Use this draft
                      </button>
                      {agentAssist.suggested_macro_id && macros.find(m => m.id === agentAssist.suggested_macro_id) && (
                        <button onClick={() => {
                          const macro = macros.find(m => m.id === agentAssist.suggested_macro_id);
                          if (macro) setReplyText(macro.content.replace(/\{customer_name\}/g, selected.customer_name || "there"));
                        }}
                          style={{ marginTop: 4, marginLeft: 6, padding: "4px 10px", background: T.surface3, color: T.text2, border: `1px solid ${T.border}`, borderRadius: 5, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                          Use macro: {macros.find(m => m.id === agentAssist.suggested_macro_id)?.name}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* QA scores already given on this ticket */}
              {qaScores.length > 0 && (
                <div style={{ padding: "8px 16px", borderBottom: `1px solid ${T.border}`, flexShrink: 0, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", fontSize: 11 }}>
                  <strong style={{ color: T.text3, fontSize: 10, textTransform: "uppercase" }}>QA history:</strong>
                  {qaScores.slice(0, 3).map(s => {
                    const overall = Number(s.overall_score || 0);
                    const bg = overall >= 4.5 ? "#22c55e15" : overall >= 3.5 ? "#f59e0b15" : "#ef444415";
                    const color = overall >= 4.5 ? "#22c55e" : overall >= 3.5 ? "#f59e0b" : "#ef4444";
                    return (
                      <span key={s.id} title={s.notes || ""} style={{ padding: "3px 9px", borderRadius: 4, background: bg, color, fontWeight: 700, fontSize: 11 }}>
                        ⭐ {overall.toFixed(1)} · {new Date(s.created_at).toLocaleDateString()}
                      </span>
                    );
                  })}
                </div>
              )}

              {/* Side conversations strip */}
              {sideConversations.length > 0 && (
                <div style={{ padding: "8px 16px", borderBottom: `1px solid ${T.border}`, flexShrink: 0, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", fontSize: 11 }}>
                  <strong style={{ color: T.text3, fontSize: 10, textTransform: "uppercase" }}>Side convos:</strong>
                  {sideConversations.map(sc => (
                    <button key={sc.id} onClick={() => openSideConv(sc)}
                      style={{ padding: "3px 9px", borderRadius: 4, background: sc.status === "closed" ? T.surface3 : T.surface2, color: T.text2, border: `1px solid ${T.border}`, fontSize: 10, cursor: "pointer" }}>
                      💬 {sc.participant_name || sc.participant_email} — {sc.subject}
                    </button>
                  ))}
                </div>
              )}

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
                {/* Tone-check warning panel — only renders when there are flags.
                    Clears automatically when the draft changes (see useEffect
                    above). Doesn't block sending; the agent always decides. */}
                {toneCheck && (toneCheck.severity !== "ok" || (toneCheck.flags || []).length > 0) && (() => {
                  const sev = toneCheck.severity;
                  const bg = sev === "block_suggested" ? "#ef444415" : "#f59e0b15";
                  const border = sev === "block_suggested" ? "#ef444440" : "#f59e0b40";
                  const color = sev === "block_suggested" ? "#ef4444" : "#f59e0b";
                  const icon = sev === "block_suggested" ? "🚨" : "⚠️";
                  return (
                    <div style={{ padding: "8px 12px", background: bg, border: `1px solid ${border}`, borderRadius: 8, marginBottom: 8, fontSize: 11 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                        <strong style={{ color, fontSize: 12 }}>{icon} {sev === "block_suggested" ? "Tone check: serious issue" : "Tone check: worth a look"}</strong>
                        <button onClick={() => setToneCheck(null)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 12 }}>×</button>
                      </div>
                      {toneCheck.summary && <div style={{ color: T.text2, marginBottom: 4 }}>{toneCheck.summary}</div>}
                      {(toneCheck.flags || []).map((f, i) => (
                        <div key={i} style={{ display: "flex", gap: 6, marginTop: 2 }}>
                          <span style={{ fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 3, background: color + "20", color, textTransform: "uppercase", flexShrink: 0, alignSelf: "flex-start" }}>{(f.type || "issue").replace(/_/g, " ")}</span>
                          <span style={{ color: T.text2, fontSize: 11 }}>{f.detail}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                {toneCheck && toneCheck.severity === "ok" && (toneCheck.flags || []).length === 0 && (
                  <div style={{ padding: "6px 12px", background: "#22c55e15", border: `1px solid #22c55e40`, borderRadius: 8, marginBottom: 8, fontSize: 11, color: "#22c55e", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span>✓ Tone check: reads clean. Ready to send.</span>
                    <button onClick={() => setToneCheck(null)} style={{ background: "none", border: "none", color: "#22c55e", cursor: "pointer", fontSize: 12 }}>×</button>
                  </div>
                )}

                {/* Textarea + send + tone check */}
                <div style={{ display: "flex", gap: 8 }}>
                  <textarea value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Type your reply..."
                    rows={3} style={{ flex: 1, padding: "8px 12px", fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 8, background: T.surface, color: T.text, outline: "none", resize: "vertical", lineHeight: 1.5, fontFamily: "inherit" }}
                    onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendReply(replyText); } }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, alignSelf: "flex-end" }}>
                    <button onClick={runToneCheck} disabled={!replyText.trim() || toneCheckLoading}
                      title="AI check for tone, missed questions, factual concerns. Doesn't block sending."
                      style={{ padding: "6px 12px", background: T.surface2, color: T.text2, border: `1px solid ${T.border}`, borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: !replyText.trim() || toneCheckLoading ? "not-allowed" : "pointer", opacity: !replyText.trim() || toneCheckLoading ? 0.5 : 1, whiteSpace: "nowrap" }}>
                      {toneCheckLoading ? "..." : "🔍 Tone check"}
                    </button>
                    <button onClick={() => sendReply(replyText)} disabled={!replyText.trim() || sending}
                      style={{ padding: "8px 16px", background: T.accent, color: "#fff", border: "none", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", opacity: !replyText.trim() || sending ? 0.5 : 1 }}>
                      {sending ? "..." : "Send"}
                    </button>
                  </div>
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
                <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}>🛡 Auto-Moderation & Auto-Reply</div>
                <div style={{ fontSize: 11, color: T.text3, marginBottom: 16 }}>Configure what happens automatically when new comments arrive.</div>
                
                {/* Model Selection */}
                <div style={{ padding: "10px 14px", borderRadius: 8, background: T.surface, border: `1px solid ${T.border}`, marginBottom: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: T.text, marginBottom: 8 }}>🧠 AI Models</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    {S("Classification Model", "Used for risk analysis & sentiment detection",
                      <Sel value={aiConfig.classification_model || "haiku"} onChange={v => updateAiConfig("classification_model", v)}
                        options={[{value:"haiku",label:"⚡ Haiku ($1/M) — fast + cheap"},{value:"sonnet",label:"🧠 Sonnet ($3/M) — more accurate"}]} />
                    )}
                    {S("Reply Model", "Used for generating customer-facing replies",
                      <Sel value={aiConfig.reply_model || "sonnet"} onChange={v => updateAiConfig("reply_model", v)}
                        options={[{value:"sonnet",label:"🧠 Sonnet ($3/$15M) — best quality"},{value:"haiku",label:"⚡ Haiku ($1/$5M) — faster + cheaper"}]} />
                    )}
                  </div>
                  <div style={{ fontSize: 9, color: T.text3, marginTop: 4 }}>
                    Est. cost: ~${aiConfig.classification_model === "haiku" ? "0.001" : "0.004"}/classify + ${aiConfig.reply_model === "haiku" ? "$0.002" : "$0.005"}/reply = ~${aiConfig.classification_model === "haiku" && aiConfig.reply_model === "haiku" ? "$0.003" : aiConfig.classification_model === "haiku" ? "$0.006" : "$0.009"}/comment
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 8 }}>Moderation</div>
                    <Toggle value={aiConfig.auto_resolve_enabled} onChange={v => updateAiConfig("auto_resolve_enabled", v)} label="Auto-moderate new mentions" />
                    <Toggle value={aiConfig.auto_hide_spam !== false} onChange={v => updateAiConfig("auto_hide_spam", v)} label="Auto-hide spam (keyword + AI)" />
                    <Toggle value={!aiConfig.business_hours_only} onChange={v => updateAiConfig("business_hours_only", !v)} label="Run 24/7 (not just business hours)" />
                    {S("Max auto-responses", "Per conversation thread",
                      <Sel value={String(aiConfig.max_auto_responses || 3)} onChange={v => updateAiConfig("max_auto_responses", Number(v))}
                        options={[{value:"1",label:"1"},{value:"3",label:"3"},{value:"5",label:"5"},{value:"10",label:"10"}]} />
                    )}
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 8 }}>Auto-Reply</div>
                    <Toggle value={aiConfig.auto_reply_enabled || false} onChange={v => updateAiConfig("auto_reply_enabled", v)} label="🟢 Enable fully automatic replies" />
                    {aiConfig.auto_reply_enabled && <>
                      <div style={{ fontSize: 10, fontWeight: 600, color: T.text3, margin: "8px 0 4px" }}>Auto-reply to these comment types:</div>
                      <Toggle value={aiConfig.auto_reply_positive !== false} onChange={v => updateAiConfig("auto_reply_positive", v)} label="😊 Positive comments (praise, thanks)" />
                      <Toggle value={aiConfig.auto_reply_questions !== false} onChange={v => updateAiConfig("auto_reply_questions", v)} label="❓ Questions (where to buy, pricing)" />
                      <Toggle value={aiConfig.auto_reply_purchase_intent !== false} onChange={v => updateAiConfig("auto_reply_purchase_intent", v)} label="🛒 Purchase intent" />
                      <Toggle value={aiConfig.auto_reply_neutral || false} onChange={v => updateAiConfig("auto_reply_neutral", v)} label="😐 Neutral comments" />
                      <Toggle value={aiConfig.auto_reply_negative || false} onChange={v => updateAiConfig("auto_reply_negative", v)} label="😠 Negative comments (risky)" />
                      <Toggle value={aiConfig.require_review_for_negative !== false} onChange={v => updateAiConfig("require_review_for_negative", v)} label="🛑 Always hold negative for review" />
                    </>}
                    {!aiConfig.auto_reply_enabled && (
                      <div style={{ fontSize: 10, color: T.text3, padding: "8px 0", lineHeight: 1.5 }}>When off, AI generates draft replies that you review before sending. Turn on to let AI post replies automatically for selected comment types.</div>
                    )}
                  </div>
                </div>

                {/* Status summary */}
                <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: aiConfig?.auto_reply_enabled ? "#22c55e08" : T.surface, border: `1px solid ${aiConfig?.auto_reply_enabled ? "#22c55e30" : T.border}` }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: aiConfig.auto_reply_enabled ? "#22c55e" : T.text }}>
                    {aiConfig.auto_reply_enabled ? "🟢 FULLY AUTOMATIC — " : "🟡 SEMI-AUTOMATIC — "}
                    {aiConfig.auto_reply_enabled ? "AI will classify, generate, and post replies for selected comment types." : "AI classifies and drafts replies. You review and send manually."}
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                    {moderationRules.filter(r => r.is_active).map(r => (
                      <span key={r.id} style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: r.action === "hide" ? "#ef444415" : r.action === "escalate" ? "#f59e0b15" : T.surface2, color: r.action === "hide" ? "#ef4444" : r.action === "escalate" ? "#f59e0b" : T.text3, fontWeight: 600 }}>
                        {r.action === "hide" ? "🚫" : r.action === "escalate" ? "🔴" : "🚩"} {r.name}
                      </span>
                    ))}
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
                <span style={{ fontSize: 10, color: T.text3 }}>{kbArticles.length}</span>
                <button onClick={runKbGapReport} disabled={kbGapLoading} title="Analyze recent tickets and surface the topics customers ask about most"
                  style={{ padding: "4px 9px", background: T.surface2, color: T.text2, border: `1px solid ${T.border}`, borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: kbGapLoading ? "wait" : "pointer" }}>
                  {kbGapLoading ? "..." : "🔎 Gaps"}
                </button>
                <button onClick={async () => {
                  const { data } = await supabase.from("cx_kb_articles").insert({ org_id: profile?.org_id, title: "New Article", content: "", category: "general", status: "draft", created_by: user?.id }).select().single();
                  if (data) { setKbArticles(p => [data, ...p]); setSelected(data); setTab("kb"); }
                }} style={{ padding: "4px 10px", background: T.accent, color: "#fff", border: "none", borderRadius: 4, fontSize: 10, fontWeight: 700, cursor: "pointer" }}>+</button>
              </div>

              {/* Gap report bar — shows when there are open gap findings */}
              {kbGapReports.length > 0 && (
                <div style={{ padding: 10, borderBottom: `1px solid ${T.border}`, background: T.surface2, fontSize: 11, maxHeight: 280, overflow: "auto" }}>
                  <div style={{ fontWeight: 700, color: T.text, marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>🔎 Top topics customers asked</span>
                    <span style={{ fontSize: 9, color: T.text3 }}>{kbGapReports.filter(g => !g.has_kb_coverage).length} gaps</span>
                  </div>
                  {kbGapReports.slice(0, 6).map(g => (
                    <div key={g.id} title={g.has_kb_coverage ? "Covered by an existing article" : "Gap — no matching KB article. Click to draft."}
                      style={{ padding: "5px 7px", marginBottom: 4, background: g.has_kb_coverage ? T.surface : "#f59e0b15", borderRadius: 4, borderLeft: `3px solid ${g.has_kb_coverage ? "#22c55e" : "#f59e0b"}`, cursor: g.has_kb_coverage ? "default" : "pointer" }}
                      onClick={async () => {
                        if (g.has_kb_coverage) return;
                        const { data } = await supabase.from("cx_kb_articles").insert({
                          org_id: orgId,
                          title: g.suggested_article_title || g.topic,
                          content: g.suggested_article_body || "",
                          category: "general",
                          status: "draft",
                          created_by: user?.id,
                        }).select().single();
                        if (data) {
                          await supabase.from("cx_kb_gap_reports").update({ status: "addressed", matched_kb_article_id: data.id }).eq("id", g.id);
                          setKbGapReports(p => p.filter(x => x.id !== g.id));
                          setKbArticles(p => [data, ...p]);
                          setSelected(data);
                        }
                      }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: T.text }}>{g.topic}</div>
                      <div style={{ fontSize: 9, color: T.text3 }}>{g.occurrence_count} mentions · {g.has_kb_coverage ? "✓ covered" : "→ click to draft article"}</div>
                    </div>
                  ))}
                </div>
              )}
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
          <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", borderBottom: `1px solid ${T.border}`, flexShrink: 0 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>⚡ Macros & Templates</h2>
              <button onClick={async () => {
                const { data } = await supabase.from("cx_macros").insert({
                  org_id: orgId, name: "New Macro", content: "Hi {customer_name},\n\nThank you for reaching out!\n\nBest,\n{agent_name}",
                  shortcut: "", category: "general", is_active: true, usage_count: 0,
                }).select().single();
                if (data) setMacros(p => [data, ...p]);
              }} style={{ padding: "6px 14px", fontSize: 12, fontWeight: 600, borderRadius: 6, border: `1px solid ${T.accent}40`, background: T.accent + "10", color: T.accent, cursor: "pointer" }}>+ Add Macro</button>
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: 20 }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {macros.map(m => (
                  <div key={m.id} style={{ padding: 14, borderRadius: 10, border: `1px solid ${T.border}`, background: T.surface }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <input defaultValue={m.name} onBlur={async e => {
                        await supabase.from("cx_macros").update({ name: e.target.value }).eq("id", m.id);
                        setMacros(p => p.map(x => x.id === m.id ? { ...x, name: e.target.value } : x));
                      }} style={{ fontSize: 14, fontWeight: 700, color: T.text, background: "transparent", border: "none", outline: "none", flex: 1 }} />
                      <div style={{ display: "flex", gap: 6, alignItems: "center", flexShrink: 0 }}>
                        <input defaultValue={m.shortcut || ""} placeholder="shortcut" onBlur={async e => {
                          await supabase.from("cx_macros").update({ shortcut: e.target.value }).eq("id", m.id);
                          setMacros(p => p.map(x => x.id === m.id ? { ...x, shortcut: e.target.value } : x));
                        }} style={{ width: 70, fontSize: 10, color: T.text3, fontFamily: "monospace", background: T.surface2, padding: "3px 6px", borderRadius: 4, border: `1px solid ${T.border}`, outline: "none", textAlign: "center" }} />
                        <select defaultValue={m.category || "general"} onChange={async e => {
                          await supabase.from("cx_macros").update({ category: e.target.value }).eq("id", m.id);
                          setMacros(p => p.map(x => x.id === m.id ? { ...x, category: e.target.value } : x));
                        }} style={{ fontSize: 10, padding: "3px 6px", border: `1px solid ${T.border}`, borderRadius: 4, background: T.surface2, color: T.text3, cursor: "pointer" }}>
                          {["general", "greeting", "closing", "shipping", "subscription", "refund", "troubleshooting", "escalation"].map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <span style={{ fontSize: 9, color: T.text3 }}>{m.usage_count || 0}× used</span>
                        <button onClick={async () => {
                          if (!confirm(`Delete macro "${m.name}"?`)) return;
                          await supabase.from("cx_macros").delete().eq("id", m.id);
                          setMacros(p => p.filter(x => x.id !== m.id));
                        }} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 14, padding: "0 2px" }}>×</button>
                      </div>
                    </div>
                    <textarea defaultValue={m.content || ""} onBlur={async e => {
                      await supabase.from("cx_macros").update({ content: e.target.value }).eq("id", m.id);
                      setMacros(p => p.map(x => x.id === m.id ? { ...x, content: e.target.value } : x));
                    }} rows={3} style={{ width: "100%", fontSize: 12, color: T.text2, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, padding: "8px 10px", outline: "none", resize: "vertical", lineHeight: 1.5, fontFamily: "inherit", boxSizing: "border-box" }} />
                    <div style={{ fontSize: 9, color: T.text3, marginTop: 4 }}>Variables: {"{customer_name}"}, {"{agent_name}"}, {"{ticket_number}"}, {"{order_id}"}</div>
                  </div>
                ))}
                {macros.length === 0 && <div style={{ padding: 30, textAlign: "center", color: T.text3, fontSize: 13 }}>No macros yet. Click + Add Macro to create one.</div>}
              </div>
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
                <button onClick={async () => {
                  const testComments = [
                    { platform: "instagram", author: "@eco_mama_jane", content: "I LOVE these laundry sheets!! Been using them for 6 months and my clothes have never been cleaner 🌿💚", type: "praise" },
                    { platform: "instagram", author: "@skeptical_steve", content: "These didn't dissolve properly and left white residue all over my dark clothes. Pretty disappointed.", type: "complaint" },
                    { platform: "facebook", author: "Karen M.", content: "How do I cancel my subscription? I've been trying for weeks and keep getting charged. This feels like a scam.", type: "cancel" },
                    { platform: "instagram", author: "@cleanlivingco", content: "Check out our new detergent pods! Way better than sheets 👉 link in bio", type: "spam" },
                    { platform: "tiktok", author: "@laundry_hack_queen", content: "omg has anyone tried earth breeze?? where can i buy these? are they worth it?", type: "question" },
                    { platform: "facebook", author: "Mike D.", content: "Just switched from Tide Pods and these are amazing. Better for the environment too!", type: "competitor" },
                    { platform: "instagram", author: "@angry_customer99", content: "This company is a total ripoff. Charged me $72 without my consent. Contacting my lawyer.", type: "legal_threat" },
                    { platform: "tiktok", author: "@sustainablesarah", content: "Made a whole video about my zero-waste laundry routine featuring Earth Breeze! 🌍✨", type: "ugc" },
                    { platform: "instagram", author: "@bot_follower_123", content: "Great post! 🔥 Follow me for FREE followers! tap link in bio 💰💰", type: "spam_bot" },
                    { platform: "facebook", author: "Lisa T.", content: "The fresh scent is SO good. Are these really made in the USA?", type: "question" },
                    { platform: "instagram", author: "@wellness_influencer", content: "Partnering with brands that care about the planet 🌿 @earthbreeze is one of my faves", type: "influencer" },
                    { platform: "tiktok", author: "@broke_college_kid", content: "bro these cost way too much just use regular detergent lmao what a waste of money 💀", type: "negative" },
                  ];
                  const btn = document.activeElement; if (btn) { btn.textContent = "⏳ Creating..."; btn.disabled = true; }
                  for (const tc of testComments) {
                    await supabase.from("cx_social_mentions").insert({
                      org_id: orgId, platform: tc.platform, mention_type: "comment",
                      author_handle: tc.author, author_name: tc.author.replace("@", ""),
                      content: tc.content, status: "new", moderation_status: "pending",
                      posted_at: new Date(Date.now() - Math.random() * 86400000).toISOString(),
                      likes: Math.floor(Math.random() * 500), comments: Math.floor(Math.random() * 30),
                      author_follower_count: tc.type === "influencer" ? 45000 : Math.floor(Math.random() * 5000),
                      is_ugc: tc.type === "ugc", is_influencer: tc.type === "influencer",
                      post_url: tc.platform === "instagram" ? "https://instagram.com/p/test" : tc.platform === "facebook" ? "https://facebook.com/post/test" : "https://tiktok.com/@test/video/test",
                    });
                  }
                  const { data } = await supabase.from("cx_social_mentions").select("*").eq("org_id", orgId).order("posted_at", { ascending: false }).limit(200);
                  setSocialMentions(data || []);
                  if (btn) { btn.textContent = `✅ Added ${testComments.length}`; setTimeout(() => { btn.textContent = "🧪 Test Data"; btn.disabled = false; }, 2000); }
                }} style={{ padding: "4px 10px", fontSize: 10, fontWeight: 600, borderRadius: 5, border: `1px solid #a855f730`, background: "#a855f710", color: "#a855f7", cursor: "pointer", whiteSpace: "nowrap" }}>
                  🧪 Test Data
                </button>
                <button onClick={async () => {
                  if (!confirm("Delete all test mentions?")) return;
                  await supabase.from("cx_social_mentions").delete().eq("org_id", orgId).is("external_id", null);
                  setSocialMentions([]);
                }} style={{ padding: "4px 8px", fontSize: 10, fontWeight: 600, borderRadius: 5, border: `1px solid #ef444430`, background: "#ef444408", color: "#ef4444", cursor: "pointer", whiteSpace: "nowrap" }}>
                  🗑
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
                {/* Competitor filter — hides or focuses on mentions that named a tracked competitor.
                    Only renders when there's at least one active competitor configured. */}
                {competitors.some(c => c.is_active) && (
                  <select value={socialFilter.competitor || "all"} onChange={e => setSocialFilter(f => ({ ...f, competitor: e.target.value }))}
                    style={{ padding: "4px 8px", fontSize: 11, border: `1px solid ${T.border}`, borderRadius: 4, background: T.surface, color: T.text, cursor: "pointer" }}>
                    <option value="all">All mentions</option>
                    <option value="hide">🎯 Hide competitor mentions</option>
                    <option value="only">🎯 Only competitor mentions</option>
                  </select>
                )}
                <div style={{ flex: 1 }} />
                <button onClick={async () => {
                  const unmoderated = socialMentions.filter(m => m.moderation_status === "pending" || !m.moderation_status);
                  if (unmoderated.length === 0) return;
                  setModeratingId("bulk");
                  let done = 0;
                  for (const m of unmoderated) {
                    try {
                      done++;
                      setModeratingId(`bulk_${done}/${unmoderated.length}`);
                      const res = await fetch("https://upbjdmnykheubxkuknuj.supabase.co/functions/v1/cx-moderate", {
                        method: "POST", headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ action: "moderate", org_id: orgId, mention_id: m.id, content: m.content, platform: m.platform, author_handle: m.author_handle }),
                      });
                      const result = await res.json();
                      setSocialMentions(p => p.map(x => x.id === m.id ? { ...x, moderation_status: result.action === "flag" ? "flagged" : "reviewed", moderation_risk: result.risk, moderation_categories: result.categories, is_hidden: result.action === "hide", status: result.action === "escalate" ? "escalated" : result.action === "hide" ? "ignored" : x.status, ai_reply_draft: result.suggested_reply || x.ai_reply_draft, sentiment: result.sentiment || x.sentiment, intent: result.intent || x.intent, auto_responded: result.auto_replied || false } : x));
                    } catch {}
                  }
                  // Reload full data to catch any auto-reply drafts
                  const { data: fresh } = await supabase.from("cx_social_mentions").select("*").eq("org_id", orgId).order("posted_at", { ascending: false }).limit(200);
                  if (fresh) setSocialMentions(fresh);
                  setModeratingId(null);
                }} disabled={moderatingId && String(moderatingId).startsWith("bulk")}
                  style={{ padding: "4px 10px", fontSize: 10, fontWeight: 600, borderRadius: 5, border: `1px solid #0ea5e940`, background: "#0ea5e910", color: "#0ea5e9", cursor: moderatingId && String(moderatingId).startsWith("bulk") ? "wait" : "pointer" }}>
                  {moderatingId && String(moderatingId).startsWith("bulk") ? `🔄 ${String(moderatingId).replace("bulk_", "")}` : `🛡 Moderate All (${socialMentions.filter(m => !m.moderation_status || m.moderation_status === "pending").length})`}
                </button>
                <span style={{ fontSize: 10, color: T.text3 }}>{socialMentions.filter(m => m.status === "new").length} new</span>
              </div>
              {/* Mention list */}
              <div style={{ flex: 1, overflow: "auto", padding: 0 }}>
                {socialMentions
                  .filter(m => (socialFilter.platform === "all" || m.platform === socialFilter.platform))
                  .filter(m => (socialFilter.status === "all" || m.status === socialFilter.status))
                  .filter(m => (socialFilter.sentiment === "all" || m.sentiment === socialFilter.sentiment))
                  .filter(m => {
                    // Competitor filter — only applies when explicitly selected
                    if (!socialFilter.competitor || socialFilter.competitor === "all") return true;
                    if (socialFilter.competitor === "hide") return !m.is_competitor_mention;
                    if (socialFilter.competitor === "only") return !!m.is_competitor_mention;
                    return true;
                  })
                  .map(m => {
                    const PLAT = { instagram: { icon: "📸", color: "#E1306C" }, facebook: { icon: "📘", color: "#1877F2" }, tiktok: { icon: "🎵", color: "#010101" }, twitter: { icon: "🐦", color: "#1DA1F2" }, youtube: { icon: "📺", color: "#FF0000" } };
                    const p = PLAT[m.platform] || { icon: "📱", color: T.text3 };
                    const SENT = { positive: { icon: "😊", color: "#22c55e" }, neutral: { icon: "😐", color: "#f59e0b" }, negative: { icon: "😠", color: "#ef4444" }, mixed: { icon: "🤔", color: "#8b5cf6" } };
                    const s = m.sentiment ? (SENT[m.sentiment] || SENT.neutral) : { icon: "⚪", color: T.text3 };
                    const STATUS_BADGE = { new: { bg: "#3b82f615", color: "#3b82f6", label: "New" }, replied: { bg: "#22c55e15", color: "#22c55e", label: "Replied" }, escalated: { bg: "#ef444415", color: "#ef4444", label: "Escalated" }, ignored: { bg: "#6b728015", color: "#6b7280", label: "Ignored" } };
                    const stb = STATUS_BADGE[m.status] || STATUS_BADGE.new;
                    const isExpanded = selectedMention?.id === m.id;
                    const borderLeft = m.is_hidden ? "#6b7280" : m.moderation_risk === "critical" ? "#ef4444" : m.moderation_risk === "high" ? "#f97316" : m.status === "escalated" ? "#ef4444" : m.sentiment === "positive" ? "#22c55e" : m.sentiment === "negative" ? "#ef4444" : "transparent";
                    return (
                      <div key={m.id} onClick={() => setSelectedMention(isExpanded ? null : m)}
                        style={{ padding: "10px 16px", borderBottom: `1px solid ${T.border}`, cursor: "pointer",
                          borderLeft: `3px solid ${borderLeft}`,
                          background: isExpanded ? T.accentDim : m.is_hidden ? T.surface + "60" : "transparent",
                          opacity: m.is_hidden ? 0.5 : 1 }}
                        onMouseEnter={e => { if (!isExpanded) e.currentTarget.style.background = T.surface2; }}
                        onMouseLeave={e => { if (!isExpanded) e.currentTarget.style.background = m.is_hidden ? T.surface + "60" : "transparent"; }}>
                        {/* Row 1: Author + platform + time */}
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 13 }}>{p.icon}</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>{m.author_name || m.author_handle}</span>
                            {m.is_influencer || m.author_follower_count > 10000 ? <span style={{ fontSize: 8, padding: "1px 4px", borderRadius: 3, background: "#f59e0b20", color: "#f59e0b", fontWeight: 700 }}>⭐ {(m.author_follower_count / 1000).toFixed(0)}K</span> : null}
                          </div>
                          <span style={{ fontSize: 10, color: T.text3 }}>{timeAgo(m.posted_at)}</span>
                        </div>
                        {/* Row 2: Comment text */}
                        <div style={{ fontSize: 12, color: m.is_hidden ? T.text3 : T.text, lineHeight: 1.5, marginBottom: 6, textDecoration: m.is_hidden ? "line-through" : "none" }}>
                          {m.content}
                        </div>
                        {/* Row 3: Status badges — always visible */}
                        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
                          <span style={{ fontSize: 8, fontWeight: 700, padding: "2px 6px", borderRadius: 3, background: stb.bg, color: stb.color, textTransform: "uppercase" }}>{stb.label}</span>
                          {m.is_competitor_mention && (() => {
                            const comp = competitors.find(c => c.id === m.competitor_id);
                            return (
                              <span title={comp ? `Tracked competitor: ${comp.name}` : "Tracked competitor"} style={{ fontSize: 8, fontWeight: 700, padding: "2px 6px", borderRadius: 3, background: "#a855f720", color: "#a855f7", textTransform: "uppercase" }}>
                                🎯 {comp?.name || "Competitor"}
                              </span>
                            );
                          })()}
                          {m.sentiment && <span style={{ fontSize: 8, fontWeight: 600, padding: "2px 6px", borderRadius: 3, background: s.color + "12", color: s.color }}>{s.icon} {m.sentiment}</span>}
                          {m.intent && m.intent !== "general" && <span style={{ fontSize: 8, padding: "2px 6px", borderRadius: 3, background: T.surface2, color: T.text3, textTransform: "capitalize" }}>{m.intent.replace("_", " ")}</span>}
                          {m.moderation_risk && m.moderation_risk !== "safe" && <span style={{ fontSize: 8, fontWeight: 700, padding: "2px 6px", borderRadius: 3, background: m.moderation_risk === "critical" ? "#ef444420" : "#f97316" + "20", color: m.moderation_risk === "critical" ? "#ef4444" : "#f97316" }}>⚠ {m.moderation_risk}</span>}
                          {m.is_hidden && <span style={{ fontSize: 8, fontWeight: 700, padding: "2px 6px", borderRadius: 3, background: "#6b728020", color: "#6b7280" }}>🚫 HIDDEN</span>}
                          {m.auto_responded && <span style={{ fontSize: 8, fontWeight: 600, padding: "2px 6px", borderRadius: 3, background: "#22c55e15", color: "#22c55e" }}>🤖 Auto-replied</span>}
                          {m.ai_reply_draft && !m.auto_responded && <span style={{ fontSize: 8, fontWeight: 600, padding: "2px 6px", borderRadius: 3, background: "#a855f715", color: "#a855f7" }}>✨ Draft ready</span>}
                          {m.moderation_status === "pending" && <span style={{ fontSize: 8, padding: "2px 6px", borderRadius: 3, background: T.surface2, color: T.text3 }}>⏳ Unmoderated</span>}
                        </div>
                        {/* Row 4: AI draft preview — show first line without expanding */}
                        {m.ai_reply_draft && !isExpanded && (
                          <div style={{ marginTop: 6, padding: "4px 8px", background: "#a855f706", borderRadius: 4, borderLeft: `2px solid #a855f730`, fontSize: 11, color: T.text2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            💬 {m.ai_reply_draft}
                          </div>
                        )}
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
                                {(() => {
                                  // Build the most specific link we can: an exact-comment link
                                  // for IG/FB/YouTube, post-level otherwise. Renders nothing
                                  // when there's no link to build.
                                  const link = commentDeepLink(m);
                                  if (!link) return null;
                                  // Show different label based on whether we got a comment-level
                                  // link or just the post. The helper returns the post URL when
                                  // it couldn't build a comment link.
                                  const isCommentLink = link !== m.post_url;
                                  const label = isCommentLink ? "↗ Open comment" : (m.is_dm ? "↗ Open DM" : "↗ Open post");
                                  return (
                                    <a href={link} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} title={isCommentLink ? "Jumps to the exact comment in the platform" : "Opens the parent post"} style={{ padding: "5px 10px", fontSize: 10, fontWeight: 600, borderRadius: 5, border: `1px solid ${T.border}`, background: T.surface2, color: T.accent, cursor: "pointer", textDecoration: "none" }}>{label}</a>
                                  );
                                })()}
                              </div>
                            )}
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

        {/* ───────────── ADS & POSTS TAB ─────────────
            Per-post comment rollup from cx_social_posts view. Sorts by
            attention_score so the busiest / riskiest posts are top. */}
        {tab === "ads" && (
          <div style={{ flex: 1, padding: 20, overflow: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>📣 Ads &amp; Posts</h2>
              <div style={{ fontSize: 11, color: T.text3 }}>Sorted by attention · {socialPosts.length} posts</div>
            </div>
            {socialPosts.length === 0 ? (
              <div style={{ padding: 60, textAlign: "center", color: T.text3 }}>
                <div style={{ fontSize: 48, marginBottom: 12 }}>📭</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>No posts captured yet</div>
                <div style={{ fontSize: 11, marginTop: 4 }}>Connect a social account on the Social tab to start tracking ad comments.</div>
              </div>
            ) : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(360px, 1fr))", gap: 12 }}>
                {[...socialPosts].sort((a, b) => Number(b.attention_score || 0) - Number(a.attention_score || 0)).map(post => {
                  const totalComments = Number(post.comment_count || 0);
                  const pos = Number(post.positive_count || 0);
                  const neg = Number(post.negative_count || 0);
                  const neu = Number(post.neutral_count || 0);
                  const unhandled = Number(post.unhandled_count || 0);
                  const highRisk = Number(post.high_risk_count || 0);
                  const platformIcon = ({ facebook: "📘", instagram: "📸", tiktok: "🎵", youtube: "📺", twitter: "🐦", linkedin: "💼" })[post.platform] || "📱";
                  return (
                    <div key={`${post.platform}-${post.post_id}`} style={{ padding: 14, border: `1px solid ${T.border}`, borderRadius: 10, background: T.surface, display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: T.text3 }}>
                        <span style={{ fontSize: 14 }}>{platformIcon}</span>
                        <span style={{ textTransform: "uppercase", fontWeight: 700 }}>{post.platform}</span>
                        <span>·</span>
                        <span>{post.posted_at ? new Date(post.posted_at).toLocaleDateString() : ""}</span>
                        {post.post_url && <a href={post.post_url} target="_blank" rel="noreferrer" style={{ marginLeft: "auto", fontSize: 10, color: T.accent, textDecoration: "none" }}>↗ Open</a>}
                      </div>
                      <div style={{ fontSize: 12, color: T.text, lineHeight: 1.4, overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical" }}>
                        {post.post_text || <span style={{ color: T.text3, fontStyle: "italic" }}>No post text captured</span>}
                      </div>
                      {totalComments > 0 && (
                        <div style={{ height: 6, display: "flex", borderRadius: 3, overflow: "hidden", background: T.surface2 }}>
                          {pos > 0 && <div style={{ width: `${(pos / totalComments) * 100}%`, background: "#22c55e" }} title={`${pos} positive`} />}
                          {neu > 0 && <div style={{ width: `${(neu / totalComments) * 100}%`, background: "#6b7280" }} title={`${neu} neutral`} />}
                          {neg > 0 && <div style={{ width: `${(neg / totalComments) * 100}%`, background: "#ef4444" }} title={`${neg} negative`} />}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 10, fontSize: 11, color: T.text2, flexWrap: "wrap" }}>
                        <span>💬 {totalComments}</span>
                        {pos > 0 && <span style={{ color: "#22c55e" }}>👍 {pos}</span>}
                        {neg > 0 && <span style={{ color: "#ef4444" }}>👎 {neg}</span>}
                        {highRisk > 0 && <span style={{ color: "#ef4444", fontWeight: 700 }}>🚨 {highRisk}</span>}
                        {unhandled > 0 && <span style={{ color: T.accent, fontWeight: 700 }}>⏳ {unhandled} unhandled</span>}
                        <span style={{ marginLeft: "auto", color: T.text3 }}>♥ {post.total_likes || 0}</span>
                      </div>
                      <button onClick={() => { setTab("social"); setSocialFilter(f => ({ ...f, post_id: post.post_id })); }}
                        style={{ marginTop: 4, padding: "6px 10px", fontSize: 11, fontWeight: 600, background: T.accentDim, color: T.accent, border: "none", borderRadius: 6, cursor: "pointer" }}>
                        View {totalComments} comments →
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ───────────── EXPORTS TAB ─────────────
            Queue + history of CSV exports. Edge function runner picks them
            up every minute and stores results in storage. */}
        {tab === "exports" && (
          <div style={{ flex: 1, padding: 20, overflow: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>📤 Exports</h2>
              <button onClick={refreshExportJobs} style={{ padding: "6px 12px", fontSize: 11, background: T.surface2, color: T.text2, border: `1px solid ${T.border}`, borderRadius: 6, cursor: "pointer" }}>🔄 Refresh</button>
            </div>
            <div style={{ padding: 16, border: `1px solid ${T.border}`, borderRadius: 10, background: T.surface, marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 12 }}>Generate a new export</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 600, color: T.text3, display: "block", marginBottom: 3 }}>Scope</label>
                  <select value={exportForm.scope} onChange={e => setExportForm(f => ({ ...f, scope: e.target.value }))}
                    style={{ padding: "7px 10px", fontSize: 12, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface2, color: T.text, outline: "none" }}>
                    <option value="tickets">Tickets</option>
                    <option value="mentions">Social mentions / comments</option>
                    <option value="conversation">Full conversation (email + DMs + comments)</option>
                  </select>
                </div>
                <button onClick={() => queueExport({})} style={{ padding: "7px 14px", fontSize: 12, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>📥 Queue export</button>
                <div style={{ fontSize: 10, color: T.text3, marginLeft: 8 }}>CSV. Up to 10K rows per export.</div>
              </div>
            </div>
            <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, background: T.surface, overflow: "hidden" }}>
              <div style={{ padding: "10px 14px", borderBottom: `1px solid ${T.border}`, fontSize: 13, fontWeight: 700, color: T.text }}>Export history</div>
              {exportJobs.length === 0 ? (
                <div style={{ padding: 30, textAlign: "center", color: T.text3, fontSize: 12 }}>No exports yet. Queue one above.</div>
              ) : exportJobs.map(j => (
                <div key={j.id} style={{ padding: "10px 14px", borderTop: `1px solid ${T.border}30`, display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{j.scope} export</div>
                    <div style={{ fontSize: 10, color: T.text3 }}>{new Date(j.created_at).toLocaleString()} · {(j.format || "csv").toUpperCase()}{j.row_count != null ? ` · ${j.row_count} rows` : ""}</div>
                  </div>
                  <span style={{
                    padding: "2px 8px", borderRadius: 10, fontSize: 10, fontWeight: 700, textTransform: "uppercase",
                    color: j.status === "done" ? "#22c55e" : j.status === "error" ? "#ef4444" : j.status === "running" ? "#3b82f6" : "#f59e0b",
                    background: (j.status === "done" ? "#22c55e" : j.status === "error" ? "#ef4444" : j.status === "running" ? "#3b82f6" : "#f59e0b") + "20"
                  }}>{j.status}</span>
                  {j.status === "done" && j.file_url && (
                    <a href={j.file_url} target="_blank" rel="noreferrer" style={{ padding: "5px 12px", background: T.accent, color: "#fff", borderRadius: 6, fontSize: 11, fontWeight: 700, textDecoration: "none" }}>⬇ Download</a>
                  )}
                  {j.status === "error" && <span title={j.error_message} style={{ fontSize: 10, color: "#ef4444", maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{j.error_message}</span>}
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

            {/* ─── Agent Revenue Leaderboard (Phase 2) ───
                Pulled from cx_agent_revenue view. Aggregates the per-agent
                weekly rows up to a single rollup for the last 30 days. */}
            {agentRevenue.length > 0 && (() => {
              const cutoff = Date.now() - 30 * 86400000;
              const byAgent = {};
              for (const r of agentRevenue) {
                if (!r.agent_id || !r.week) continue;
                if (new Date(r.week).getTime() < cutoff) continue;
                const a = byAgent[r.agent_id] = byAgent[r.agent_id] || { agent_id: r.agent_id, revenue_cents: 0, revenue_tickets: 0, total_tickets: 0, happy: 0, csat_sum: 0, csat_count: 0 };
                a.revenue_cents += Number(r.revenue_cents || 0);
                a.revenue_tickets += Number(r.revenue_tickets || 0);
                a.total_tickets += Number(r.total_tickets || 0);
                a.happy += Number(r.happy_customers || 0);
                if (r.avg_csat) { a.csat_sum += Number(r.avg_csat); a.csat_count += 1; }
              }
              const rows = Object.values(byAgent).sort((a, b) => b.revenue_cents - a.revenue_cents).slice(0, 10);
              const totalRev = rows.reduce((s, r) => s + r.revenue_cents, 0);
              if (rows.length === 0) return null;
              return (
                <div style={{ padding: 16, borderRadius: 10, border: `1px solid ${T.border}`, background: T.surface, marginBottom: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>💵 Agent Revenue Leaderboard</div>
                    <div style={{ fontSize: 10, color: T.text3 }}>Last 30 days · ${(totalRev / 100).toLocaleString()} total attributed</div>
                  </div>
                  {rows.map((r, i) => {
                    const pct = totalRev > 0 ? (r.revenue_cents / totalRev) * 100 : 0;
                    const avgCsat = r.csat_count > 0 ? (r.csat_sum / r.csat_count).toFixed(1) : "—";
                    return (
                      <div key={r.agent_id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: i < rows.length - 1 ? `1px solid ${T.border}30` : "none" }}>
                        <span style={{ width: 18, fontSize: 11, fontWeight: 700, color: i < 3 ? T.accent : T.text3, textAlign: "center" }}>{i + 1}</span>
                        <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: T.text }}>{r.agent_id.slice(0, 8)}…</span>
                        <div style={{ flex: 2, height: 5, background: T.surface2, borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ width: `${pct}%`, height: "100%", background: "#22c55e", borderRadius: 3 }} />
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 700, color: "#22c55e", minWidth: 70, textAlign: "right" }}>${(r.revenue_cents / 100).toLocaleString()}</span>
                        <span style={{ fontSize: 10, color: T.text3, minWidth: 90, textAlign: "right" }}>{r.revenue_tickets}/{r.total_tickets} · CSAT {avgCsat}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

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

      {/* ─── SNOOZE MODAL ─── */}
      {showSnoozeModal && selected && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" }} onClick={() => setShowSnoozeModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: 420, background: T.surface, borderRadius: 12, border: `1px solid ${T.border}`, padding: 22 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text, marginBottom: 14 }}>💤 Snooze ticket</div>
            <div style={{ fontSize: 11, color: T.text3, marginBottom: 12 }}>Auto-wakes back to "open" after the duration.</div>
            <label style={{ fontSize: 11, fontWeight: 600, color: T.text3 }}>Duration</label>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6, marginBottom: 12 }}>
              {["1h", "4h", "1d", "3d", "1w"].map(d => (
                <button key={d} onClick={() => setSnoozeForm(f => ({ ...f, duration: d }))}
                  style={{ padding: "6px 14px", fontSize: 12, fontWeight: 600,
                    background: snoozeForm.duration === d ? T.accent : T.surface2,
                    color: snoozeForm.duration === d ? "#fff" : T.text2,
                    border: `1px solid ${snoozeForm.duration === d ? T.accent : T.border}`,
                    borderRadius: 6, cursor: "pointer" }}>
                  {d === "1h" ? "1 hour" : d === "4h" ? "4 hours" : d === "1d" ? "1 day" : d === "3d" ? "3 days" : "1 week"}
                </button>
              ))}
            </div>
            <label style={{ fontSize: 11, fontWeight: 600, color: T.text3 }}>Reason (optional)</label>
            <input value={snoozeForm.reason} onChange={e => setSnoozeForm(f => ({ ...f, reason: e.target.value }))}
              placeholder="e.g. waiting on 3PL response"
              style={{ width: "100%", marginTop: 4, padding: "8px 10px", fontSize: 12, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface2, color: T.text, outline: "none", boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => setShowSnoozeModal(false)} style={{ padding: "8px 16px", background: T.surface3, color: T.text2, border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>Cancel</button>
              <button onClick={snoozeSelected} style={{ padding: "8px 18px", background: T.accent, color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>💤 Snooze</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── SIDE CONVERSATION MODAL ─── */}
      {showSideConvModal && selected && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" }} onClick={() => setShowSideConvModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: 540, background: T.surface, borderRadius: 12, border: `1px solid ${T.border}`, padding: 22 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text, marginBottom: 14 }}>💬 Start a side conversation</div>
            <div style={{ fontSize: 11, color: T.text3, marginBottom: 12 }}>Loop in a 3PL, warehouse, or vendor. The customer won't see this thread.</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: T.text3 }}>Recipient type</label>
                <select value={sideConvForm.participant_type} onChange={e => setSideConvForm(f => ({ ...f, participant_type: e.target.value }))}
                  style={{ width: "100%", marginTop: 4, padding: "8px 10px", fontSize: 12, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface2, color: T.text, outline: "none" }}>
                  <option value="3pl">3PL</option>
                  <option value="warehouse">Warehouse</option>
                  <option value="vendor">Vendor</option>
                  <option value="team">Internal team</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: T.text3 }}>Channel</label>
                <input value="email" disabled style={{ width: "100%", marginTop: 4, padding: "8px 10px", fontSize: 12, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface3, color: T.text3, outline: "none", boxSizing: "border-box" }} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: T.text3 }}>Recipient name</label>
                <input value={sideConvForm.participant_name} onChange={e => setSideConvForm(f => ({ ...f, participant_name: e.target.value }))} placeholder="John at Acme 3PL"
                  style={{ width: "100%", marginTop: 4, padding: "8px 10px", fontSize: 12, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface2, color: T.text, outline: "none", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: T.text3 }}>Recipient email *</label>
                <input value={sideConvForm.participant_email} onChange={e => setSideConvForm(f => ({ ...f, participant_email: e.target.value }))} placeholder="john@acme.com"
                  style={{ width: "100%", marginTop: 4, padding: "8px 10px", fontSize: 12, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface2, color: T.text, outline: "none", boxSizing: "border-box" }} />
              </div>
            </div>
            <label style={{ fontSize: 11, fontWeight: 600, color: T.text3 }}>Subject *</label>
            <input value={sideConvForm.subject} onChange={e => setSideConvForm(f => ({ ...f, subject: e.target.value }))} placeholder="Order #1234 missing tracking"
              style={{ width: "100%", marginTop: 4, marginBottom: 10, padding: "8px 10px", fontSize: 12, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface2, color: T.text, outline: "none", boxSizing: "border-box" }} />
            <label style={{ fontSize: 11, fontWeight: 600, color: T.text3 }}>Message *</label>
            <textarea value={sideConvForm.body} onChange={e => setSideConvForm(f => ({ ...f, body: e.target.value }))} rows={5} placeholder="Hi John, customer is asking about..."
              style={{ width: "100%", marginTop: 4, padding: "8px 10px", fontSize: 12, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface2, color: T.text, outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 14 }}>
              <button onClick={() => setShowSideConvModal(false)} style={{ padding: "8px 16px", background: T.surface3, color: T.text2, border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>Cancel</button>
              <button onClick={createSideConv} style={{ padding: "8px 18px", background: T.accent, color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>💬 Start conversation</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── CRISIS MODE MODAL ─── */}
      {showCrisisModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.7)" }} onClick={() => setShowCrisisModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: 520, background: T.surface, borderRadius: 12, border: `2px solid #ef4444`, padding: 22 }}>
            <div style={{ fontSize: 17, fontWeight: 900, color: "#ef4444", marginBottom: 6 }}>🚨 Activate Crisis Mode</div>
            <div style={{ fontSize: 11, color: T.text3, marginBottom: 16 }}>
              Use when something has gone wrong publicly. New tickets get flagged as crisis-priority, a holding statement is pinned across the team, and every action is logged for post-mortem.
            </div>
            <label style={{ fontSize: 11, fontWeight: 600, color: T.text3 }}>Reason *</label>
            <input value={crisisForm.reason} onChange={e => setCrisisForm(f => ({ ...f, reason: e.target.value }))} placeholder="e.g. Shopify outage, recall on Lot #42"
              style={{ width: "100%", marginTop: 4, marginBottom: 12, padding: "8px 10px", fontSize: 12, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface2, color: T.text, outline: "none", boxSizing: "border-box" }} />
            <label style={{ fontSize: 11, fontWeight: 600, color: T.text3 }}>Public holding statement (optional)</label>
            <textarea value={crisisForm.public_statement} onChange={e => setCrisisForm(f => ({ ...f, public_statement: e.target.value }))} rows={3} placeholder="What agents should communicate right now."
              style={{ width: "100%", marginTop: 4, marginBottom: 12, padding: "8px 10px", fontSize: 12, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface2, color: T.text, outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }} />
            <label style={{ fontSize: 11, fontWeight: 600, color: T.text3 }}>Holding macro</label>
            <select value={crisisForm.holding_macro_id || ""} onChange={e => setCrisisForm(f => ({ ...f, holding_macro_id: e.target.value || null }))}
              style={{ width: "100%", marginTop: 4, padding: "8px 10px", fontSize: 12, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface2, color: T.text, outline: "none" }}>
              <option value="">— None —</option>
              {macros.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 18 }}>
              <button onClick={() => setShowCrisisModal(false)} style={{ padding: "8px 16px", background: T.surface3, color: T.text2, border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>Cancel</button>
              <button onClick={() => toggleCrisisMode(true)} disabled={!crisisForm.reason} style={{ padding: "8px 18px", background: crisisForm.reason ? "#ef4444" : T.surface3, color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: crisisForm.reason ? "pointer" : "not-allowed" }}>🚨 Activate</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── SIDE CONVERSATION VIEWER ─── */}
      {selectedSideConv && (
        <div style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(0,0,0,0.4)" }} onClick={() => setSelectedSideConv(null)}>
          <div onClick={e => e.stopPropagation()} style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 480, maxWidth: "100vw", background: T.surface, borderLeft: `1px solid ${T.border}`, display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 10 }}>
              <button onClick={() => setSelectedSideConv(null)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: T.text3 }}>✕</button>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>{selectedSideConv.subject}</div>
                <div style={{ fontSize: 10, color: T.text3 }}>{selectedSideConv.participant_type} · {selectedSideConv.participant_name || selectedSideConv.participant_email}</div>
              </div>
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
              {sideConvMessages.length === 0 ? (
                <div style={{ color: T.text3, fontSize: 12, textAlign: "center", padding: 30 }}>No messages yet.</div>
              ) : sideConvMessages.map(m => (
                <div key={m.id} style={{ padding: "10px 12px", borderRadius: 8, background: m.direction === "outbound" ? T.accentDim : T.surface2, alignSelf: m.direction === "outbound" ? "flex-end" : "flex-start", maxWidth: "85%" }}>
                  <div style={{ fontSize: 10, color: T.text3, marginBottom: 4 }}>{m.sender_name || m.sender_email} · {timeAgo(m.created_at)}</div>
                  <div style={{ fontSize: 12, color: T.text, whiteSpace: "pre-wrap" }}>{m.body_text}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── REVENUE ATTRIBUTION MODAL ─── */}
      {showRevenueModal && selected && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" }} onClick={() => setShowRevenueModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: 440, background: T.surface, borderRadius: 12, border: `1px solid ${T.border}`, padding: 22 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text, marginBottom: 4 }}>💵 Log revenue from this ticket</div>
            <div style={{ fontSize: 11, color: T.text3, marginBottom: 14 }}>Track revenue you rescued, retained, or upsold through this interaction. Used for agent leaderboards in Analytics.</div>
            <label style={{ fontSize: 11, fontWeight: 600, color: T.text3 }}>Amount ($)</label>
            <input type="number" step="0.01" value={revenueForm.amount_cents} onChange={e => setRevenueForm(f => ({ ...f, amount_cents: e.target.value }))}
              placeholder="42.95"
              style={{ width: "100%", marginTop: 4, marginBottom: 12, padding: "8px 10px", fontSize: 12, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface2, color: T.text, outline: "none", boxSizing: "border-box" }} />
            <label style={{ fontSize: 11, fontWeight: 600, color: T.text3 }}>Related Shopify order IDs (optional, comma-separated)</label>
            <input value={revenueForm.order_ids} onChange={e => setRevenueForm(f => ({ ...f, order_ids: e.target.value }))}
              placeholder="1234, 1235"
              style={{ width: "100%", marginTop: 4, padding: "8px 10px", fontSize: 12, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface2, color: T.text, outline: "none", boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => setShowRevenueModal(false)} style={{ padding: "8px 16px", background: T.surface3, color: T.text2, border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>Cancel</button>
              <button onClick={saveRevenueAttribution} style={{ padding: "8px 18px", background: "#22c55e", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>💵 Save</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── QA SCORING MODAL ─── */}
      {showQaModal && selected && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" }} onClick={() => setShowQaModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: 480, background: T.surface, borderRadius: 12, border: `1px solid ${T.border}`, padding: 22 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text, marginBottom: 4 }}>⭐ QA Score</div>
            <div style={{ fontSize: 11, color: T.text3, marginBottom: 14 }}>Score this ticket's handling. Used for coaching and team performance trends.</div>
            {[
              { key: "tone_score", label: "Tone", help: "Empathy, professionalism, brand voice" },
              { key: "accuracy_score", label: "Accuracy", help: "Correct information, no misstatements" },
              { key: "resolution_score", label: "Resolution", help: "Did this actually solve the customer's problem?" },
              { key: "policy_score", label: "Policy adherence", help: "Followed refund / escalation rules" },
            ].map(d => (
              <div key={d.key} style={{ marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: T.text2 }}>{d.label}</span>
                  <span style={{ fontSize: 10, color: T.text3 }}>{d.help}</span>
                </div>
                <div style={{ display: "flex", gap: 4 }}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} onClick={() => setQaForm(f => ({ ...f, [d.key]: n }))}
                      style={{ flex: 1, padding: "8px 0", fontSize: 13, fontWeight: 700,
                        background: qaForm[d.key] === n ? T.accent : T.surface2,
                        color: qaForm[d.key] === n ? "#fff" : T.text3,
                        border: `1px solid ${qaForm[d.key] === n ? T.accent : T.border}`,
                        borderRadius: 5, cursor: "pointer" }}>
                      {n}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <label style={{ fontSize: 11, fontWeight: 600, color: T.text3 }}>Notes (optional)</label>
            <textarea value={qaForm.notes} onChange={e => setQaForm(f => ({ ...f, notes: e.target.value }))} rows={3}
              placeholder="Coaching feedback, what to call out, what to repeat..."
              style={{ width: "100%", marginTop: 4, padding: "8px 10px", fontSize: 12, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface2, color: T.text, outline: "none", resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => setShowQaModal(false)} style={{ padding: "8px 16px", background: T.surface3, color: T.text2, border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>Cancel</button>
              <button onClick={submitQaScore} style={{ padding: "8px 18px", background: T.accent, color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>⭐ Submit score</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── TAGS MANAGER MODAL ─── */}
      {showTagsModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" }} onClick={() => setShowTagsModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: 560, maxHeight: "85vh", overflow: "auto", background: T.surface, borderRadius: 12, border: `1px solid ${T.border}`, padding: 22 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text, marginBottom: 4 }}>🏷️ Manage tags</div>
            <div style={{ fontSize: 11, color: T.text3, marginBottom: 14 }}>Organize tags hierarchically. Parent tags can have children — e.g., "Refund" with children "Damaged", "Wrong item", "Late delivery".</div>

            {/* Add tag form */}
            <div style={{ padding: 12, background: T.surface2, borderRadius: 8, marginBottom: 14, display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 180px" }}>
                <label style={{ fontSize: 10, fontWeight: 600, color: T.text3, display: "block", marginBottom: 3 }}>Tag name</label>
                <input value={newTagForm.name} onChange={e => setNewTagForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Damaged shipment"
                  style={{ width: "100%", padding: "7px 10px", fontSize: 12, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface, color: T.text, outline: "none", boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, color: T.text3, display: "block", marginBottom: 3 }}>Color</label>
                <input type="color" value={newTagForm.color} onChange={e => setNewTagForm(f => ({ ...f, color: e.target.value }))}
                  style={{ width: 50, height: 32, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface, cursor: "pointer" }} />
              </div>
              <div style={{ flex: "1 1 180px" }}>
                <label style={{ fontSize: 10, fontWeight: 600, color: T.text3, display: "block", marginBottom: 3 }}>Parent (optional)</label>
                <select value={newTagForm.parent_id || ""} onChange={e => setNewTagForm(f => ({ ...f, parent_id: e.target.value || null }))}
                  style={{ width: "100%", padding: "7px 10px", fontSize: 12, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface, color: T.text, outline: "none" }}>
                  <option value="">— Top level —</option>
                  {tags.filter(t => !t.parent_id).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
              </div>
              <button onClick={createTag} disabled={!newTagForm.name.trim()}
                style={{ padding: "7px 14px", background: newTagForm.name.trim() ? T.accent : T.surface3, color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: newTagForm.name.trim() ? "pointer" : "not-allowed" }}>
                + Add
              </button>
            </div>

            {/* Tag tree */}
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              {tags.filter(t => !t.parent_id).map(parent => {
                const children = tags.filter(t => t.parent_id === parent.id);
                return (
                  <div key={parent.id}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", background: T.surface2, borderRadius: 6 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: parent.color }} />
                      <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: T.text }}>{parent.name}</span>
                      <span style={{ fontSize: 10, color: T.text3 }}>{children.length > 0 ? `${children.length} child${children.length === 1 ? "" : "ren"}` : ""}</span>
                      <button onClick={() => deleteTag(parent.id)} style={{ background: "none", border: "none", color: T.text3, fontSize: 14, cursor: "pointer" }}>×</button>
                    </div>
                    {children.map(child => (
                      <div key={child.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 8px 5px 28px", marginTop: 1 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: child.color }} />
                        <span style={{ flex: 1, fontSize: 11, color: T.text2 }}>↳ {child.name}</span>
                        <button onClick={() => deleteTag(child.id)} style={{ background: "none", border: "none", color: T.text3, fontSize: 13, cursor: "pointer" }}>×</button>
                      </div>
                    ))}
                  </div>
                );
              })}
              {tags.length === 0 && (
                <div style={{ padding: 20, textAlign: "center", color: T.text3, fontSize: 12 }}>No tags yet. Add one above.</div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => setShowTagsModal(false)} style={{ padding: "8px 16px", background: T.surface3, color: T.text2, border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── COMPETITORS MODAL ─── */}
      {showCompetitorsModal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" }} onClick={() => setShowCompetitorsModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{ width: 640, maxHeight: "85vh", overflow: "auto", background: T.surface, borderRadius: 12, border: `1px solid ${T.border}`, padding: 22 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>🎯 Competitor tracking</div>
              <button onClick={runCompetitorClassifier} title="Re-run the classifier against existing mentions"
                style={{ padding: "4px 10px", fontSize: 10, background: T.surface2, color: T.text2, border: `1px solid ${T.border}`, borderRadius: 5, fontWeight: 600, cursor: "pointer" }}>
                🔄 Re-classify
              </button>
            </div>
            <div style={{ fontSize: 11, color: T.text3, marginBottom: 16 }}>
              When mentions reference a competitor by handle or keyword, they get flagged so you can sort or hide them from your main inbox. Classifier runs every 15 minutes and any time you add a new competitor.
            </div>

            {/* Add competitor form */}
            <div style={{ padding: 14, background: T.surface2, borderRadius: 8, marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.text2, marginBottom: 10 }}>Add a competitor</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 600, color: T.text3, display: "block", marginBottom: 3 }}>Name *</label>
                  <input value={newCompetitorForm.name} onChange={e => setNewCompetitorForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Seventh Generation"
                    style={{ width: "100%", padding: "7px 10px", fontSize: 12, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface, color: T.text, outline: "none", boxSizing: "border-box" }} />
                </div>
                <div>
                  <label style={{ fontSize: 10, fontWeight: 600, color: T.text3, display: "block", marginBottom: 3 }}>Keywords (comma-separated)</label>
                  <input value={newCompetitorForm.keywords} onChange={e => setNewCompetitorForm(f => ({ ...f, keywords: e.target.value }))}
                    placeholder="seventh generation, 7th gen"
                    style={{ width: "100%", padding: "7px 10px", fontSize: 12, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface, color: T.text, outline: "none", boxSizing: "border-box" }} />
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 10 }}>
                {["instagram","facebook","tiktok","youtube","twitter","linkedin"].map(plat => (
                  <div key={plat}>
                    <label style={{ fontSize: 10, fontWeight: 600, color: T.text3, display: "block", marginBottom: 3, textTransform: "capitalize" }}>{plat} handle</label>
                    <input value={newCompetitorForm[plat]} onChange={e => setNewCompetitorForm(f => ({ ...f, [plat]: e.target.value }))}
                      placeholder={plat === "youtube" ? "@channelname" : "@handle"}
                      style={{ width: "100%", padding: "6px 8px", fontSize: 11, border: `1px solid ${T.border}`, borderRadius: 5, background: T.surface, color: T.text, outline: "none", boxSizing: "border-box" }} />
                  </div>
                ))}
              </div>
              <button onClick={addCompetitor} disabled={!newCompetitorForm.name.trim()}
                style={{ padding: "7px 16px", fontSize: 12, fontWeight: 700, background: newCompetitorForm.name.trim() ? T.accent : T.surface3, color: "#fff", border: "none", borderRadius: 6, cursor: newCompetitorForm.name.trim() ? "pointer" : "not-allowed" }}>
                + Add competitor
              </button>
            </div>

            {/* Existing competitors list */}
            <div style={{ fontSize: 12, fontWeight: 700, color: T.text2, marginBottom: 8 }}>Tracked competitors</div>
            {competitors.length === 0 ? (
              <div style={{ padding: 30, textAlign: "center", color: T.text3, fontSize: 11 }}>None yet. Add one above.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {competitors.map(c => {
                  const handleEntries = Object.entries(c.handles || {});
                  return (
                    <div key={c.id} style={{ padding: 10, border: `1px solid ${T.border}`, borderRadius: 6, background: c.is_active ? T.surface : T.surface2, opacity: c.is_active ? 1 : 0.55 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <strong style={{ fontSize: 12, color: T.text, flex: 1 }}>{c.name}</strong>
                        <button onClick={() => toggleCompetitorActive(c.id, c.is_active)}
                          style={{ padding: "3px 8px", fontSize: 10, background: c.is_active ? "#22c55e15" : T.surface3, color: c.is_active ? "#22c55e" : T.text3, border: `1px solid ${c.is_active ? "#22c55e40" : T.border}`, borderRadius: 4, fontWeight: 600, cursor: "pointer" }}>
                          {c.is_active ? "Active" : "Paused"}
                        </button>
                        <button onClick={() => deleteCompetitor(c.id)} style={{ background: "none", border: "none", color: T.text3, fontSize: 14, cursor: "pointer" }}>×</button>
                      </div>
                      <div style={{ fontSize: 10, color: T.text3, marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {handleEntries.length > 0 && (
                          <span>📱 {handleEntries.map(([p, h]) => `${p}:@${h}`).join(" · ")}</span>
                        )}
                        {(c.keywords || []).length > 0 && (
                          <span>🔤 {(c.keywords || []).join(", ")}</span>
                        )}
                        {handleEntries.length === 0 && (c.keywords || []).length === 0 && (
                          <span style={{ fontStyle: "italic" }}>No handles or keywords — won't match anything yet</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button onClick={() => setShowCompetitorsModal(false)} style={{ padding: "8px 16px", background: T.surface3, color: T.text2, border: "none", borderRadius: 6, fontSize: 12, cursor: "pointer" }}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── FULFILLMENT ALERTS DRAWER ─── */}
      {showFulfillmentDrawer && (
        <div style={{ position: "fixed", inset: 0, zIndex: 999, background: "rgba(0,0,0,0.4)" }} onClick={() => setShowFulfillmentDrawer(false)}>
          <div onClick={e => e.stopPropagation()} style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: 520, maxWidth: "100vw", background: T.surface, borderLeft: `1px solid ${T.border}`, display: "flex", flexDirection: "column" }}>
            <div style={{ padding: "12px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 10 }}>
              <button onClick={() => setShowFulfillmentDrawer(false)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: T.text3 }}>✕</button>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>📦 Fulfillment SLA alerts</div>
                <div style={{ fontSize: 10, color: T.text3 }}>{fulfillmentAlerts.length} open · Crawler runs daily</div>
              </div>
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: 12 }}>
              {fulfillmentAlerts.length === 0 ? (
                <div style={{ padding: 40, textAlign: "center", color: T.text3 }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>No fulfillment alerts</div>
                  <div style={{ fontSize: 11, marginTop: 4 }}>The crawler hasn't run yet, or there's nothing stuck. Alerts surface orders with no scan, stale tracking, or delayed delivery.</div>
                </div>
              ) : fulfillmentAlerts.map(a => (
                <div key={a.id} style={{ padding: 10, marginBottom: 8, background: a.severity === "critical" ? "#ef444415" : "#f59e0b15", border: `1px solid ${a.severity === "critical" ? "#ef444440" : "#f59e0b40"}`, borderRadius: 8 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                    <strong style={{ fontSize: 12, color: T.text }}>Order #{a.shopify_order_id}</strong>
                    <span style={{ fontSize: 10, padding: "2px 6px", borderRadius: 3, background: a.severity === "critical" ? "#ef4444" : "#f59e0b", color: "#fff", fontWeight: 700 }}>{a.alert_type.replace(/_/g, " ")}</span>
                  </div>
                  <div style={{ fontSize: 11, color: T.text2 }}>{a.customer_name || a.customer_email}</div>
                  <div style={{ fontSize: 10, color: T.text3, marginTop: 4 }}>
                    Ordered {a.days_since_order}d ago · {a.last_scan_status ? `Last scan ${a.days_since_last_scan}d ago: ${a.last_scan_status}` : "No tracking yet"}
                  </div>
                  {a.tracking_url && <a href={a.tracking_url} target="_blank" rel="noreferrer" style={{ display: "inline-block", marginTop: 6, fontSize: 10, color: T.accent }}>↗ View tracking</a>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

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
