"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";
import { useAuth } from "../lib/auth";

const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwYmpkbW55a2hldWJ4a3VrbnVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNDI3OTcsImV4cCI6MjA4NzcxODc5N30.pvTTkiZWNDPuo-Fdzm54uy8w1mlx0AjB5jtFm3MeGq4";

const SYSTEM_PROMPT = `You are Helm AI Builder — an engineering assistant embedded inside Helm, a business operating system built with Next.js + Supabase + Vercel.

Your job is to help the admin build features, fix bugs, run SQL, and manage the application. You have access to tools for:
1. Querying and modifying the Supabase database (SQL)
2. Understanding the codebase structure
3. Suggesting code changes (which the admin can review and apply)

INFRASTRUCTURE:
- Supabase project: upbjdmnykheubxkuknuj
- Supabase URL: https://upbjdmnykheubxkuknuj.supabase.co
- Vercel project: helm-app-six.vercel.app
- Git repo: github.com/bensmith84-ops/helm-app.git
- Frontend: Next.js, React, all components in app/components/
- Theme: T.accent, T.text, T.surface etc. via Proxy
- Deploy: git push to main → Vercel auto-deploys

KEY TABLES: tasks, sections, projects, objectives, key_results, okr_check_ins, okr_cycles, okr_milestones, profiles, notifications, documents, campaigns, calls, automations, activity_log, calendar_events, calendars, event_attendees, dashboard_focus_items, custom_fields, custom_field_values, scorecard_metrics, scorecard_entries, plm_programs

MODULES: Dashboard, Projects, OKRs, Scorecard, Scoreboard, Messages, Docs, Calendar, Calls, Campaigns, PLM, Finance, Automation, Reports, People, Activity, Settings

When asked to build something:
1. Explain what you'll do
2. Show any SQL migrations needed
3. Show the component code changes
4. The admin will review and approve before deploying

Always be concise and action-oriented. Show code, not just descriptions.`;

export default function AIBuilderView() {
  const { profile } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [schemaCache, setSchemaCache] = useState(null);
  const [showSchema, setShowSchema] = useState(false);
  const [sqlInput, setSqlInput] = useState("");
  const [sqlResult, setSqlResult] = useState(null);
  const [sqlLoading, setSqlLoading] = useState(false);
  const [activeTab, setActiveTab] = useState("chat"); // chat | sql | schema
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load schema on mount
  useEffect(() => {
    loadSchema();
  }, []);

  const loadSchema = async () => {
    const { data } = await supabase.rpc("get_schema_info").single().catch(() => ({ data: null }));
    if (data) { setSchemaCache(data); return; }
    // Fallback: query information_schema
    const { data: tables } = await supabase.from("information_schema.tables" /* won't work via REST */).select("*").catch(() => ({ data: null }));
    // We'll load schema info via the AI when needed
  };

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setLoading(true);

    try {
      // Build conversation for Claude API
      const apiMessages = newMessages.map(m => ({
        role: m.role,
        content: m.content,
      }));

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 4096,
          system: SYSTEM_PROMPT,
          messages: apiMessages,
        }),
      });

      const data = await response.json();
      const assistantContent = data.content?.map(c => c.text || "").join("\n") || "No response received.";

      setMessages(prev => [...prev, { role: "assistant", content: assistantContent }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: "assistant", content: `Error: ${err.message}` }]);
    }

    setLoading(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const runSQL = async () => {
    if (!sqlInput.trim()) return;
    setSqlLoading(true);
    setSqlResult(null);
    try {
      const { data, error } = await supabase.rpc("exec_sql", { query: sqlInput });
      if (error) {
        // Try direct query for SELECT statements
        if (sqlInput.trim().toUpperCase().startsWith("SELECT")) {
          // Can't run arbitrary SQL via REST, show error
          setSqlResult({ error: error.message + "\n\nNote: Direct SQL requires the Supabase SQL Editor or a server-side function. Use the AI chat to run queries." });
        } else {
          setSqlResult({ error: error.message });
        }
      } else {
        setSqlResult({ data });
      }
    } catch (err) {
      setSqlResult({ error: err.message });
    }
    setSqlLoading(false);
  };

  // Quick actions
  const quickActions = [
    { label: "Show all tables", prompt: "List all tables in the database with their row counts" },
    { label: "Check for errors", prompt: "What are the most common issues in the current codebase? Check for any broken patterns." },
    { label: "Schema overview", prompt: "Give me a quick overview of the database schema — key tables and their relationships" },
    { label: "Recent changes", prompt: "What were the most recent migrations applied to the database?" },
    { label: "Add a feature", prompt: "I want to add a new feature: " },
    { label: "Fix a bug", prompt: "I'm seeing a bug: " },
  ];

  const renderMessage = (msg, i) => {
    const isUser = msg.role === "user";
    const content = msg.content;

    // Parse code blocks
    const parts = content.split(/(```[\s\S]*?```)/g);

    return (
      <div key={i} style={{
        display: "flex", gap: 12, padding: "16px 20px",
        background: isUser ? "transparent" : `${T.accent}05`,
        borderBottom: `1px solid ${T.border}10`,
      }}>
        {/* Avatar */}
        <div style={{
          width: 28, height: 28, borderRadius: 8, flexShrink: 0,
          background: isUser ? `${T.accent}20` : "linear-gradient(135deg, #a855f7, #6366f1)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: isUser ? 10 : 12, fontWeight: 800, color: isUser ? T.accent : "#fff",
        }}>
          {isUser ? (profile?.display_name?.slice(0, 2).toUpperCase() || "U") : "✦"}
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.6, color: T.text }}>
          {isUser ? (
            <div style={{ fontWeight: 500 }}>{content}</div>
          ) : (
            <div>
              {parts.map((part, j) => {
                if (part.startsWith("```")) {
                  const lines = part.split("\n");
                  const lang = lines[0].replace("```", "").trim();
                  const code = lines.slice(1, -1).join("\n");
                  return (
                    <div key={j} style={{ margin: "10px 0", borderRadius: 8, overflow: "hidden", border: `1px solid ${T.border}` }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 12px", background: T.surface3, borderBottom: `1px solid ${T.border}` }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase" }}>{lang || "code"}</span>
                        <button onClick={() => navigator.clipboard.writeText(code)} style={{ background: "none", border: "none", color: T.accent, cursor: "pointer", fontSize: 10, fontWeight: 600 }}>Copy</button>
                      </div>
                      <pre style={{ padding: "12px 14px", margin: 0, background: T.surface2, color: T.text, fontSize: 12, lineHeight: 1.5, overflowX: "auto", fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}>
                        <code>{code}</code>
                      </pre>
                    </div>
                  );
                }
                // Regular text — handle bold, inline code
                return (
                  <span key={j}>
                    {part.split(/(`[^`]+`)/).map((seg, k) => {
                      if (seg.startsWith("`") && seg.endsWith("`")) {
                        return <code key={k} style={{ padding: "1px 5px", borderRadius: 4, background: T.surface3, color: T.accent, fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>{seg.slice(1, -1)}</code>;
                      }
                      // Bold
                      return seg.split(/(\*\*[^*]+\*\*)/).map((s, l) => {
                        if (s.startsWith("**") && s.endsWith("**")) {
                          return <strong key={`${k}-${l}`} style={{ fontWeight: 700 }}>{s.slice(2, -2)}</strong>;
                        }
                        return <span key={`${k}-${l}`}>{s}</span>;
                      });
                    })}
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: T.bg }}>
      {/* Header */}
      <div style={{ padding: "16px 24px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center",
            background: "linear-gradient(135deg, #a855f7, #6366f1)", fontSize: 18, color: "#fff",
          }}>✦</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>AI Builder</div>
            <div style={{ fontSize: 11, color: T.text3 }}>Build features, fix bugs, manage your platform</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {["chat", "sql"].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              style={{
                padding: "5px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: "pointer",
                border: activeTab === tab ? `1px solid ${T.accent}40` : `1px solid ${T.border}`,
                background: activeTab === tab ? `${T.accent}10` : "transparent",
                color: activeTab === tab ? T.accent : T.text3,
              }}>
              {tab === "chat" ? "💬 Chat" : "🗄 SQL"}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "chat" ? (
        <>
          {/* Messages */}
          <div style={{ flex: 1, overflow: "auto" }}>
            {messages.length === 0 ? (
              <div style={{ padding: "60px 24px", textAlign: "center" }}>
                <div style={{
                  width: 64, height: 64, borderRadius: 16, margin: "0 auto 20px",
                  background: "linear-gradient(135deg, #a855f720, #6366f120)",
                  border: `1px solid #a855f730`,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28,
                }}>✦</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: T.text, marginBottom: 8 }}>What do you want to build?</div>
                <div style={{ fontSize: 13, color: T.text3, maxWidth: 500, margin: "0 auto 32px", lineHeight: 1.5 }}>
                  Describe a feature, bug fix, or change in plain English. I'll generate the code, SQL migrations, and deployment steps.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, maxWidth: 600, margin: "0 auto" }}>
                  {quickActions.map((qa, i) => (
                    <button key={i} onClick={() => {
                      if (qa.prompt.endsWith(": ")) { setInput(qa.prompt); inputRef.current?.focus(); }
                      else { setInput(qa.prompt); setTimeout(() => sendMessage(), 0); }
                    }} style={{
                      padding: "12px 14px", borderRadius: 10, border: `1px solid ${T.border}`,
                      background: T.surface, color: T.text2, fontSize: 12, fontWeight: 500,
                      cursor: "pointer", textAlign: "left", lineHeight: 1.4, transition: "all 0.15s",
                    }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent + "60"; e.currentTarget.style.background = T.surface2; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = T.surface; }}>
                      {qa.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map(renderMessage)}
                {loading && (
                  <div style={{ display: "flex", gap: 12, padding: "16px 20px" }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 8,
                      background: "linear-gradient(135deg, #a855f7, #6366f1)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, color: "#fff", fontWeight: 800,
                    }}>✦</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: T.text3, fontSize: 13 }}>
                      <div style={{ width: 6, height: 6, borderRadius: 3, background: T.accent, animation: "pulse 1.4s infinite" }} />
                      <div style={{ width: 6, height: 6, borderRadius: 3, background: T.accent, animation: "pulse 1.4s infinite 0.2s" }} />
                      <div style={{ width: 6, height: 6, borderRadius: 3, background: T.accent, animation: "pulse 1.4s infinite 0.4s" }} />
                      <span style={{ marginLeft: 8 }}>Thinking...</span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input */}
          <div style={{ padding: "16px 20px", borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
            <div style={{ display: "flex", gap: 8, maxWidth: 800, margin: "0 auto" }}>
              <div style={{
                flex: 1, display: "flex", alignItems: "flex-end", gap: 8,
                padding: "10px 14px", borderRadius: 12,
                border: `1px solid ${T.border}`, background: T.surface2,
                transition: "border-color 0.15s",
              }}
                onFocus={() => {}}
                onClick={() => inputRef.current?.focus()}>
                <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder="Describe what you want to build or fix..."
                  rows={1}
                  style={{
                    flex: 1, background: "transparent", border: "none", outline: "none",
                    color: T.text, fontSize: 14, fontFamily: "inherit", resize: "none",
                    lineHeight: 1.5, maxHeight: 120, overflow: "auto",
                  }}
                  onInput={e => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }}
                />
                <button onClick={sendMessage} disabled={!input.trim() || loading}
                  style={{
                    width: 32, height: 32, borderRadius: 8, border: "none", flexShrink: 0,
                    background: input.trim() && !loading ? "linear-gradient(135deg, #a855f7, #6366f1)" : T.surface3,
                    color: input.trim() && !loading ? "#fff" : T.text3,
                    cursor: input.trim() && !loading ? "pointer" : "default",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 16, transition: "all 0.15s",
                  }}>
                  ↑
                </button>
              </div>
            </div>
            <div style={{ textAlign: "center", marginTop: 8, fontSize: 10, color: T.text3 }}>
              Shift+Enter for new line · AI has access to your schema and codebase context
            </div>
          </div>
        </>
      ) : (
        /* SQL Tab */
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", flexShrink: 0 }}>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <textarea value={sqlInput} onChange={e => setSqlInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); runSQL(); } }}
                placeholder="SELECT * FROM tasks LIMIT 10;"
                rows={4}
                style={{
                  flex: 1, padding: "12px 14px", borderRadius: 10,
                  border: `1px solid ${T.border}`, background: T.surface2,
                  color: T.text, fontSize: 13, fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                  outline: "none", resize: "vertical", lineHeight: 1.5,
                }} />
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button onClick={runSQL} disabled={sqlLoading || !sqlInput.trim()}
                style={{
                  padding: "7px 16px", borderRadius: 7, border: "none",
                  background: sqlInput.trim() ? T.accent : T.surface3,
                  color: sqlInput.trim() ? "#fff" : T.text3,
                  fontSize: 12, fontWeight: 700, cursor: sqlInput.trim() ? "pointer" : "default",
                }}>
                {sqlLoading ? "Running..." : "⌘↵ Run Query"}
              </button>
              <span style={{ fontSize: 10, color: T.text3 }}>Note: SQL runs via Supabase RPC. For DDL, use the AI chat.</span>
            </div>
          </div>

          {/* Results */}
          <div style={{ flex: 1, overflow: "auto", padding: "0 20px 20px" }}>
            {sqlResult && (
              sqlResult.error ? (
                <div style={{ padding: "14px 16px", borderRadius: 10, background: "#ef444410", border: "1px solid #ef444430", color: "#ef4444", fontSize: 12, fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
                  {sqlResult.error}
                </div>
              ) : (
                <div style={{ borderRadius: 10, border: `1px solid ${T.border}`, overflow: "hidden" }}>
                  <div style={{ padding: "8px 14px", background: T.surface3, fontSize: 11, color: T.text3, fontWeight: 600 }}>
                    {Array.isArray(sqlResult.data) ? `${sqlResult.data.length} rows` : "Result"}
                  </div>
                  {Array.isArray(sqlResult.data) && sqlResult.data.length > 0 ? (
                    <div style={{ overflow: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                        <thead>
                          <tr>
                            {Object.keys(sqlResult.data[0]).map(col => (
                              <th key={col} style={{ padding: "7px 12px", textAlign: "left", background: T.surface2, borderBottom: `1px solid ${T.border}`, color: T.text3, fontWeight: 700, whiteSpace: "nowrap", fontSize: 11 }}>{col}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {sqlResult.data.slice(0, 100).map((row, i) => (
                            <tr key={i}>
                              {Object.values(row).map((val, j) => (
                                <td key={j} style={{ padding: "6px 12px", borderBottom: `1px solid ${T.border}10`, color: T.text, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                                  {val === null ? <span style={{ color: T.text3, fontStyle: "italic" }}>null</span> : String(val)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {sqlResult.data.length > 100 && <div style={{ padding: "8px 14px", fontSize: 11, color: T.text3 }}>Showing first 100 of {sqlResult.data.length} rows</div>}
                    </div>
                  ) : (
                    <div style={{ padding: "14px 16px", color: T.text3, fontSize: 12 }}>
                      {JSON.stringify(sqlResult.data, null, 2)}
                    </div>
                  )}
                </div>
              )
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1.2); }
        }
      `}</style>
    </div>
  );
}
