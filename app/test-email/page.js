"use client";
import { useState, useRef, useEffect } from "react";

const API = "https://upbjdmnykheubxkuknuj.supabase.co/functions/v1/cx-email";

export default function TestEmailPage() {
  const [fromName, setFromName] = useState("Ben Smith");
  const [fromEmail, setFromEmail] = useState("ben.test@gmail.com");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [thread, setThread] = useState(null); // { ticket_id, messages: [] }
  const [sending, setSending] = useState(false);
  const [history, setHistory] = useState([]); // all messages in thread
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [history]);

  const sendEmail = async () => {
    if (!body.trim()) return;
    setSending(true);
    const payload = {
      action: "inbound",
      from_email: fromEmail,
      from_name: fromName,
      subject: thread ? undefined : subject,
      body_text: body,
      thread_id: thread?.ticket_id || undefined,
    };
    // Optimistically add to history
    setHistory(p => [...p, { direction: "sent", name: fromName, text: body, time: new Date() }]);
    setBody("");

    try {
      const res = await fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await res.json();
      if (result.success) {
        if (!thread) setThread({ ticket_id: result.ticket_id });
        // AI auto-replied
        if (result.ai_reply) {
          setHistory(p => [...p, {
            direction: "received",
            name: result.agent_name || "Breeze",
            text: result.ai_reply,
            time: new Date(),
          }]);
        }
      } else {
        setHistory(p => [...p, { direction: "error", text: result.error || "Failed to send", time: new Date() }]);
      }
    } catch (e) {
      setHistory(p => [...p, { direction: "error", text: e.message, time: new Date() }]);
    }
    setSending(false);
  };

  const newThread = () => { setThread(null); setHistory([]); setSubject(""); setBody(""); };
  const T = { bg: "#f8fafc", surface: "#ffffff", border: "#e2e8f0", text: "#1a1a2e", text2: "#475569", text3: "#94a3b8", accent: "#3b82f6", sent: "#dbeafe", received: "#f0fdf4" };

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: "-apple-system, system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{ background: T.surface, borderBottom: `1px solid ${T.border}`, padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 20 }}>📧</span>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>Customer Email Tester</div>
            <div style={{ fontSize: 11, color: T.text3 }}>Send real emails to Earth Breeze Support → AI responds automatically</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {thread && <span style={{ fontSize: 10, padding: "3px 10px", borderRadius: 6, background: "#22c55e18", color: "#22c55e", fontWeight: 600 }}>Thread Active: {thread.ticket_id.slice(0, 8)}...</span>}
          <button onClick={newThread} style={{ padding: "6px 14px", fontSize: 12, fontWeight: 600, borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.text2, cursor: "pointer" }}>+ New Thread</button>
        </div>
      </div>

      <div style={{ maxWidth: 700, margin: "0 auto", padding: "20px 16px" }}>
        {/* From fields */}
        {!thread && (
          <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 16, marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 10 }}>Your Details (Customer)</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, color: T.text3, display: "block", marginBottom: 2 }}>Your Name</label>
                <input value={fromName} onChange={e => setFromName(e.target.value)} style={{ width: "100%", padding: "7px 10px", fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 6, boxSizing: "border-box" }} />
              </div>
              <div>
                <label style={{ fontSize: 10, fontWeight: 600, color: T.text3, display: "block", marginBottom: 2 }}>Your Email</label>
                <input value={fromEmail} onChange={e => setFromEmail(e.target.value)} style={{ width: "100%", padding: "7px 10px", fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 6, boxSizing: "border-box" }} />
              </div>
            </div>
          </div>
        )}

        {/* Conversation */}
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, minHeight: 300, display: "flex", flexDirection: "column" }}>
          {/* Messages */}
          <div style={{ flex: 1, padding: 16, overflow: "auto", maxHeight: 500 }}>
            {history.length === 0 && (
              <div style={{ textAlign: "center", padding: "60px 20px", color: T.text3 }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>📬</div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Send your first email</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>Type a message below as a customer. The AI agent will reply automatically.</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "center", marginTop: 16 }}>
                  {[
                    { s: "Cancel my subscription", b: "Hi, I want to cancel my subscription. I have too many sheets stacked up at home." },
                    { s: "Where is my order?", b: "My order #EB-39281 hasn't arrived yet and it's been 2 weeks. Can you check on it?" },
                    { s: "Sheets leaving residue", b: "Your laundry sheets are leaving a white residue on my dark clothes when I wash in cold water. What should I do?" },
                  ].map(q => (
                    <button key={q.s} onClick={() => { setSubject(q.s); setBody(q.b); }}
                      style={{ padding: "6px 12px", fontSize: 11, fontWeight: 600, borderRadius: 6, border: `1px solid ${T.accent}30`, background: `${T.accent}08`, color: T.accent, cursor: "pointer" }}>{q.s}</button>
                  ))}
                </div>
              </div>
            )}
            {history.map((msg, i) => (
              <div key={i} style={{ marginBottom: 12, display: "flex", flexDirection: "column", alignItems: msg.direction === "sent" ? "flex-end" : "flex-start" }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: T.text3, marginBottom: 3 }}>
                  {msg.direction === "sent" ? `${fromName} (You)` : msg.direction === "error" ? "⚠️ Error" : `${msg.name} (AI Agent)`}
                  <span style={{ fontWeight: 400, marginLeft: 6 }}>{msg.time.toLocaleTimeString()}</span>
                </div>
                <div style={{
                  maxWidth: "85%", padding: "10px 14px", borderRadius: 10, fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap",
                  background: msg.direction === "sent" ? T.sent : msg.direction === "error" ? "#fef2f2" : T.received,
                  color: msg.direction === "error" ? "#dc2626" : T.text,
                  border: `1px solid ${msg.direction === "sent" ? "#93c5fd40" : msg.direction === "error" ? "#fca5a540" : "#86efac40"}`,
                }}>
                  {msg.text}
                </div>
              </div>
            ))}
            {sending && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", color: T.text3, fontSize: 12 }}>
                <div style={{ width: 8, height: 8, borderRadius: 4, background: T.accent, animation: "pulse 1s ease-in-out infinite" }} />
                AI is thinking...
              </div>
            )}
            <div ref={endRef} />
          </div>

          {/* Compose */}
          <div style={{ borderTop: `1px solid ${T.border}`, padding: 12 }}>
            {!thread && (
              <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject line..."
                style={{ width: "100%", padding: "7px 10px", fontSize: 13, fontWeight: 600, border: `1px solid ${T.border}`, borderRadius: 6, marginBottom: 8, boxSizing: "border-box" }} />
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <textarea value={body} onChange={e => setBody(e.target.value)} placeholder={thread ? "Reply to support..." : "Write your email to support@earthbreeze.com..."}
                rows={3} style={{ flex: 1, padding: "8px 10px", fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 6, resize: "vertical", fontFamily: "inherit", lineHeight: 1.5 }}
                onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); sendEmail(); } }} />
              <button onClick={sendEmail} disabled={sending || !body.trim()}
                style={{ padding: "8px 18px", background: T.accent, color: "#fff", border: "none", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", alignSelf: "flex-end", opacity: sending || !body.trim() ? 0.5 : 1 }}>
                {sending ? "..." : "Send"}
              </button>
            </div>
            <div style={{ fontSize: 10, color: T.text3, marginTop: 6 }}>Ctrl+Enter to send • Messages go to Helm Support → AI auto-replies • Check the Support module in Helm to see the ticket</div>
          </div>
        </div>

        {/* How it works */}
        <div style={{ marginTop: 16, padding: 16, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 8 }}>How This Works</div>
          <div style={{ fontSize: 11, color: T.text2, lineHeight: 1.7 }}>
            1. You type a message here as a customer<br />
            2. It hits the <code style={{ background: "#f1f5f9", padding: "1px 4px", borderRadius: 3 }}>cx-email</code> edge function<br />
            3. A ticket is created in Helm's Support inbox<br />
            4. The AI agent (Breeze) reads the message + knowledge base and generates a reply<br />
            5. The reply is saved to the ticket AND shown here<br />
            6. You can reply again — it continues the same thread<br />
            7. Open Helm → Support to see the ticket, messages, and AI drafts in the agent view
          </div>
        </div>
      </div>
      <style>{`@keyframes pulse { 0%, 100% { opacity: 0.4; } 50% { opacity: 1; } }`}</style>
    </div>
  );
}
