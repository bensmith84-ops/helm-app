"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

export default function PrintAIChat({ conversationId, messages: propMessages, mode, programName, onClose }) {
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState(propMessages || []);
  const [loading, setLoading] = useState(!propMessages?.length);

  useEffect(() => {
    const load = async () => {
      if (conversationId) {
        const { data: conv } = await supabase.from("plm_ai_conversations").select("*").eq("id", conversationId).single();
        setConversation(conv);
        if (!propMessages?.length) {
          const { data: msgs } = await supabase.from("plm_ai_messages").select("*").eq("conversation_id", conversationId).order("created_at");
          setMessages((msgs || []).map(m => ({ role: m.role, text: m.content, tokens: m.tokens_in ? { input_tokens: m.tokens_in, output_tokens: m.tokens_out } : null, duration: m.duration_ms, created_at: m.created_at })));
        }
      }
      setLoading(false);
    };
    load();
  }, [conversationId]);

  const handlePrint = () => window.print();

  if (loading) return <div style={{ padding: 40, textAlign: "center", fontFamily: "sans-serif" }}>Loading conversation...</div>;

  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const title = conversation?.title || "AI Conversation";
  const modeLabels = { advisor: "R&D Advisor", ingredient: "Source Ingredients", manufacturer: "Find Manufacturers", whitelabel: "White Label", formulate: "Formulate" };
  const modeIcons = { advisor: "🧪", ingredient: "🧬", manufacturer: "🏭", whitelabel: "📦", formulate: "🔬" };
  const displayMode = conversation?.mode || mode || "advisor";
  const totalTokens = messages.reduce((a, m) => a + (m.tokens ? m.tokens.input_tokens + m.tokens.output_tokens : 0), 0);

  // Render markdown for assistant messages (tables, headings, lists, links).
  // Text is HTML-escaped first and only http(s) links are allowed: answers can
  // quote web pages, so nothing in them may become markup or script.
  const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const fmtInline = (s) => esc(s)
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code style="background:#f3f4f6;padding:1px 4px;border-radius:3px;font-size:10px">$1</code>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s"]+)\)/g, '<a href="$2" style="color:#2563eb">$1</a>');
  const isSep = (l) => /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/.test((l || "").trim());
  const cells = (r) => r.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(c => c.trim());

  const renderFormatted = (text) => {
    if (!text) return null;
    const lines = text.split("\n");
    const out = [];
    for (let i = 0; i < lines.length; i++) {
      const t = lines[i].trim();
      if (t.startsWith("|") && isSep(lines[i + 1])) {
        const head = cells(lines[i]); const rows = []; let j = i + 2;
        while (j < lines.length && lines[j].trim().startsWith("|")) { rows.push(cells(lines[j])); j++; }
        out.push(
          <table key={i} style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, margin: "6px 0", pageBreakInside: "auto" }}>
            <thead><tr>{head.map((h, k) => <th key={k} style={{ textAlign: "left", padding: "4px 6px", borderBottom: "1.5px solid #999", fontWeight: 700, color: "#111" }} dangerouslySetInnerHTML={{ __html: fmtInline(h) }} />)}</tr></thead>
            <tbody>{rows.map((r, ri) => <tr key={ri} style={{ pageBreakInside: "avoid" }}>{r.map((c, k) => <td key={k} style={{ padding: "3px 6px", borderBottom: "1px solid #e5e7eb", color: "#333", verticalAlign: "top" }} dangerouslySetInnerHTML={{ __html: fmtInline(c) }} />)}</tr>)}</tbody>
          </table>
        );
        i = j - 1; continue;
      }
      if (!t) { out.push(<div key={i} style={{ height: 6 }} />); continue; }
      if (/^---+$/.test(t)) { out.push(<hr key={i} style={{ border: "none", borderTop: "1px solid #e5e7eb", margin: "6px 0" }} />); continue; }
      if (t.startsWith("###")) { out.push(<div key={i} style={{ fontSize: 12, fontWeight: 700, color: "#333", marginTop: 8, marginBottom: 3 }} dangerouslySetInnerHTML={{ __html: fmtInline(t.replace(/^#+\s*/, "")) }} />); continue; }
      if (t.startsWith("##")) { out.push(<div key={i} style={{ fontSize: 13, fontWeight: 800, color: "#111", marginTop: 12, marginBottom: 3, borderBottom: "1px solid #ddd", paddingBottom: 2 }} dangerouslySetInnerHTML={{ __html: fmtInline(t.replace(/^#+\s*/, "")) }} />); continue; }
      if (t.startsWith("# ")) { out.push(<div key={i} style={{ fontSize: 14, fontWeight: 800, color: "#111", marginTop: 14, marginBottom: 4 }} dangerouslySetInnerHTML={{ __html: fmtInline(t.replace(/^#+\s*/, "")) }} />); continue; }
      const numMatch = t.match(/^(\d+)\.\s+(.*)$/);
      if (numMatch) {
        out.push(
          <div key={i} style={{ display: "flex", gap: 8, marginBottom: 2, padding: "1px 0" }}>
            <span style={{ minWidth: 18, fontSize: 11, fontWeight: 700, color: "#555", textAlign: "right", flexShrink: 0 }}>{numMatch[1]}.</span>
            <span style={{ fontSize: 11, color: "#222", lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: fmtInline(numMatch[2]) }} />
          </div>
        ); continue;
      }
      if (t.startsWith("- ") || t.startsWith("• ") || t.startsWith("* ")) {
        out.push(
          <div key={i} style={{ display: "flex", gap: 6, marginBottom: 1, paddingLeft: 18 }}>
            <span style={{ color: "#666", fontSize: 7, marginTop: 5 }}>●</span>
            <span style={{ fontSize: 11, color: "#333", lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: fmtInline(t.replace(/^[-•*]\s+/, "")) }} />
          </div>
        ); continue;
      }
      if (t.startsWith("```")) { out.push(<div key={i} style={{ fontSize: 10, color: "#999", fontFamily: "monospace" }}>───</div>); continue; }
      out.push(<div key={i} style={{ fontSize: 11, color: "#333", lineHeight: 1.7 }} dangerouslySetInnerHTML={{ __html: fmtInline(t) }} />);
    }
    return out;
  };

  return (
    <div className="print-root" style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#fff", overflow: "auto" }}>
      {/* Non-printable toolbar */}
      <div className="no-print" style={{ position: "sticky", top: 0, background: "#1a1a2e", padding: "10px 24px", display: "flex", alignItems: "center", gap: 12, zIndex: 10 }}>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#fff", fontSize: 18, cursor: "pointer" }}>← Back</button>
        <div style={{ flex: 1, color: "#fff", fontSize: 14, fontWeight: 600 }}>AI Chat Export - {title}</div>
        <button onClick={handlePrint} style={{ padding: "8px 20px", fontSize: 13, fontWeight: 700, background: "#3b82f6", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>
          🖨 Print / Save PDF
        </button>
      </div>

      {/* Printable content */}
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "40px 48px", fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", color: "#111", lineHeight: 1.5 }}>

        {/* Header */}
        <div style={{ borderBottom: "3px solid #111", paddingBottom: 12, marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>PLM AI CONVERSATION</div>
              <div style={{ fontSize: 15, fontWeight: 600, color: "#333", marginTop: 4 }}>{title}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12, color: "#666" }}>Exported</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{today}</div>
            </div>
          </div>
        </div>

        {/* Meta info */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24, fontSize: 12 }}>
          <tbody>
            <tr>
              <td style={cellLabel}>AI Mode</td>
              <td style={cellValue}>{modeIcons[displayMode]} {modeLabels[displayMode] || displayMode}</td>
              <td style={cellLabel}>Program</td>
              <td style={cellValue}>{programName || conversation?.program_name || "General PLM"}</td>
            </tr>
            <tr>
              <td style={cellLabel}>Messages</td>
              <td style={cellValue}>{messages.length} ({messages.filter(m => m.role === "user").length} user, {messages.filter(m => m.role === "assistant").length} AI)</td>
              <td style={cellLabel}>Total Tokens</td>
              <td style={cellValue}>{totalTokens > 0 ? totalTokens.toLocaleString() : "-"}</td>
            </tr>
            {conversation?.created_at && (
              <tr>
                <td style={cellLabel}>Started</td>
                <td style={cellValue}>{new Date(conversation.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</td>
                <td style={cellLabel}>Last Updated</td>
                <td style={cellValue}>{new Date(conversation.updated_at || conversation.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}</td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Conversation */}
        <div style={sectionHeader}>CONVERSATION</div>

        {messages.map((msg, i) => (
          <div key={i} style={{ marginBottom: 16, pageBreakInside: "avoid" }}>
            {/* Role header */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <div style={{
                width: 22, height: 22, borderRadius: 11,
                background: msg.role === "user" ? "#3b82f620" : "#a855f720",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 9, fontWeight: 800,
                color: msg.role === "user" ? "#3b82f6" : "#a855f7"
              }}>
                {msg.role === "user" ? "U" : "AI"}
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: msg.role === "user" ? "#3b82f6" : "#a855f7" }}>
                {msg.role === "user" ? "You" : "AI Advisor"}
              </span>
              {msg.created_at && (
                <span style={{ fontSize: 10, color: "#999", marginLeft: "auto" }}>
                  {new Date(msg.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                </span>
              )}
            </div>

            {/* Message body */}
            <div style={{
              marginLeft: 30,
              padding: "10px 14px",
              borderRadius: 8,
              background: msg.role === "user" ? "#f0f4ff" : "#fafafa",
              border: `1px solid ${msg.role === "user" ? "#3b82f620" : "#e5e7eb"}`
            }}>
              {msg.role === "user" ? (
                <div style={{ fontSize: 12, color: "#222", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{msg.text}</div>
              ) : (
                <div>{renderFormatted(msg.text)}</div>
              )}

              {/* Created items */}
              {msg.createdItems && msg.createdItems.length > 0 && (
                <div style={{ marginTop: 8, borderTop: "1px solid #e5e7eb", paddingTop: 6 }}>
                  {msg.createdItems.map((item, ci) => (
                    <div key={ci} style={{ fontSize: 10, color: "#16a34a", fontWeight: 600, padding: "2px 0" }}>
                      ✓ Created: {item.result?.message || item.result?.name || "Item created"}
                    </div>
                  ))}
                </div>
              )}

              {/* Token info */}
              {msg.tokens && (
                <div style={{ fontSize: 9, color: "#999", marginTop: 4, textAlign: "right" }}>
                  {msg.tokens.input_tokens + msg.tokens.output_tokens} tokens
                  {msg.duration ? ` · ${(msg.duration / 1000).toFixed(1)}s` : ""}
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Footer */}
        <div style={{ borderTop: "1px solid #ccc", paddingTop: 8, marginTop: 32, fontSize: 10, color: "#999", display: "flex", justifyContent: "space-between" }}>
          <span>Earth Breeze · PLM AI {modeLabels[displayMode] || ""} · {messages.length} messages</span>
          <span>Confidential - Do Not Distribute</span>
        </div>
      </div>

      {/* Print styles - global CSS in page.js handles visibility */}
      <style>{`
        @media print {
          @page { margin: 0.6in 0.5in; size: letter; }
        }
      `}</style>
    </div>
  );
}

const cellLabel = { padding: "6px 10px", fontSize: 11, fontWeight: 700, color: "#666", width: 100, borderBottom: "1px solid #eee" };
const cellValue = { padding: "6px 10px", fontSize: 12, borderBottom: "1px solid #eee" };
const sectionHeader = { fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, borderBottom: "2px solid #333", paddingBottom: 4, marginBottom: 16, marginTop: 24 };
