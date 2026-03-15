"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";
import { useAuth } from "../lib/auth";

const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwYmpkbW55a2hldWJ4a3VrbnVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNDI3OTcsImV4cCI6MjA4NzcxODc5N30.pvTTkiZWNDPuo-Fdzm54uy8w1mlx0AjB5jtFm3MeGq4";
const EDGE_BASE = "https://upbjdmnykheubxkuknuj.supabase.co/functions/v1";

const SYSTEM_PROMPT = [
  "You are Helm AI Builder — an engineering assistant embedded inside Helm (Next.js + Supabase + Vercel).",
  "",
  "CRITICAL RULES:",
  "1. NEVER output full file rewrites for files over 100 lines. Most components are 1000-2000 lines.",
  "2. Instead, output TARGETED PATCHES showing the old code and new code.",
  "3. For new small files (<200 lines) or edge functions, you may write the full content.",
  "4. For SQL migrations, use code blocks labeled sql:migration_name.",
  "5. ALWAYS explain what you are changing and why before showing code.",
  "6. Use deploy: prefix ONLY for new files. Use patch: prefix for changes to existing files.",
  "",
  "INFRASTRUCTURE:",
  "- Supabase project: upbjdmnykheubxkuknuj",
  "- Frontend: Next.js React, components in app/components/",
  "- Theme: T.accent, T.text, T.surface via Proxy (import { T } from ../tokens)",
  "- DB: import { supabase } from ../lib/supabase",
  "- Auth: import { useAuth } from ../lib/auth gives { user, profile }",
  "",
  "KEY TABLES: tasks, sections, projects, objectives, key_results, okr_check_ins, profiles, notifications, documents, campaigns, calls, calendars, calendar_events, dashboard_focus_items, custom_fields",
  "",
  "LARGE COMPONENTS (1000-2000 lines — NEVER rewrite fully):",
  "Dashboard.js, Projects.js, OKRs.js, Finance.js, PLM.js",
  "",
  "For changes to existing files, show targeted patches like:",
  "// FIND THIS CODE:",
  "...existing code...",
  "// REPLACE WITH:",
  "...new code...",
  "",
  "For SQL migrations, label them as sql:name.",
  "For new files only, label them as deploy:path/to/file.js.",
  "The admin will review all changes before deploying.",
].join("\n");


export default function AIBuilderView() {
  const { profile } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [apiKey, setApiKey] = useState(() => {
    try { return localStorage.getItem("helm-anthropic-key") || ""; } catch { return ""; }
  });
  const [showSetup, setShowSetup] = useState(false);
  const [keyLoading, setKeyLoading] = useState(true);
  const [streamingText, setStreamingText] = useState("");
  const [deploying, setDeploying] = useState({});
  const [deployResults, setDeployResults] = useState({});
  const [activeTab, setActiveTab] = useState("chat");
  const [sqlInput, setSqlInput] = useState("");
  const [sqlResult, setSqlResult] = useState(null);
  const [sqlLoading, setSqlLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, streamingText]);

  // Load API key from DB on mount
  useEffect(() => {
    (async () => {
      let key = localStorage.getItem("helm-anthropic-key") || "";
      if (!key) {
        const { data } = await supabase.from("admin_settings").select("value").eq("key", "anthropic_api_key").single();
        if (data?.value) { key = data.value; localStorage.setItem("helm-anthropic-key", key); setApiKey(key); }
      }
      setKeyLoading(false);
      if (!key) setShowSetup(true);
    })();
  }, []);

  const saveApiKey = async (key) => {
    localStorage.setItem("helm-anthropic-key", key);
    setApiKey(key);
    if (profile?.org_id && key) {
      await supabase.from("admin_settings").upsert({ org_id: profile.org_id, key: "anthropic_api_key", value: key, updated_at: new Date().toISOString() }, { onConflict: "org_id,key" });
    }
    setShowSetup(false);
  };

  // ── Deploy function ──
  const deployFiles = async (files, sql, commitMsg, blockId) => {
    setDeploying(p => ({ ...p, [blockId]: true }));
    try {
      const body = {};
      if (files?.length && sql) {
        body.action = "deploy_and_migrate";
        body.files = files;
        body.sql = sql;
      } else if (files?.length) {
        body.action = "deploy";
        body.files = files;
      } else if (sql) {
        body.action = "migrate";
        body.sql = sql;
      }
      body.commit_message = commitMsg || "feat(ai-builder): auto-deploy";

      const res = await fetch(`${EDGE_BASE}/ai-deploy`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${ANON_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await res.json();
      setDeployResults(p => ({ ...p, [blockId]: result }));
    } catch (err) {
      setDeployResults(p => ({ ...p, [blockId]: { success: false, error: err.message } }));
    }
    setDeploying(p => ({ ...p, [blockId]: false }));
  };

  // ── Run SQL directly ──
  const runSQL = async () => {
    if (!sqlInput.trim()) return;
    setSqlLoading(true); setSqlResult(null);
    try {
      const res = await fetch(`${EDGE_BASE}/ai-deploy`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${ANON_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ action: "migrate", sql: sqlInput, commit_message: "sql-runner" }),
      });
      const result = await res.json();
      setSqlResult(result);
    } catch (err) {
      setSqlResult({ success: false, error: err.message });
    }
    setSqlLoading(false);
  };

  // ── Send message with streaming ──
  const sendMessage = async (retryCount = 0) => {
    if ((!input.trim() && retryCount === 0) || loading) return;
    const userContent = retryCount === 0 ? input.trim() : messages.filter(m => m.role === "user").pop()?.content || input.trim();

    let newMessages;
    if (retryCount === 0) {
      newMessages = [...messages, { role: "user", content: userContent }];
      setMessages(newMessages);
      setInput("");
    } else {
      newMessages = [...messages];
      if (newMessages[newMessages.length - 1]?.role === "assistant") newMessages.pop();
      setMessages(newMessages);
    }

    setLoading(true); setStreamingText("");
    const controller = new AbortController();
    abortRef.current = controller;

    const apiMessages = newMessages.map(m => ({ role: m.role, content: m.content }));

    try {
      if (!apiKey) { setShowSetup(true); setLoading(false); return; }

      const response = await fetch(`${EDGE_BASE}/ai-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ANON_KEY}` },
        signal: controller.signal,
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 20000,
          stream: true,
          system: SYSTEM_PROMPT,
          messages: apiMessages,
          api_key: apiKey,
        }),
      });

      if (!response.ok) {
        if ((response.status === 429 || response.status >= 500) && retryCount < 3) {
          const wait = Math.min(2000 * Math.pow(2, retryCount), 30000);
          setStreamingText(`⟳ Retrying in ${Math.round(wait/1000)}s (attempt ${retryCount+1}/3)...`);
          await new Promise(r => setTimeout(r, wait));
          setLoading(false);
          return sendMessage(retryCount + 1);
        }
        throw new Error(`API ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = "", buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (data === "[DONE]") continue;
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === "content_block_delta" && parsed.delta?.text) {
              fullText += parsed.delta.text;
              setStreamingText(fullText);
            }
          } catch {}
        }
      }

      setStreamingText("");
      setMessages(prev => [...prev, { role: "assistant", content: fullText || "No response." }]);
    } catch (err) {
      setStreamingText("");
      if (err.name === "AbortError") {
        setMessages(prev => [...prev, { role: "assistant", content: "⏹ Cancelled." }]);
      } else if (retryCount < 3) {
        const wait = 2000 * Math.pow(2, retryCount);
        setStreamingText(`⟳ Network error — retrying in ${Math.round(wait/1000)}s...`);
        await new Promise(r => setTimeout(r, wait));
        setLoading(false);
        return sendMessage(retryCount + 1);
      } else {
        setMessages(prev => [...prev, { role: "assistant", content: `Error: ${err.message}`, isError: true }]);
      }
    }
    setLoading(false);
    abortRef.current = null;
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const cancelRequest = () => { abortRef.current?.abort(); abortRef.current = null; };

  // ── Parse deploy blocks from assistant messages ──
  const parseDeployBlocks = (content) => {
    const blocks = [];
    // Match ```deploy:path and ```sql:name blocks
    const regex = /```(deploy|sql):([^\n]+)\n([\s\S]*?)```/g;
    let match;
    while ((match = regex.exec(content)) !== null) {
      blocks.push({
        type: match[1], // "deploy" or "sql"
        name: match[2].trim(),
        content: match[3].trim(),
        id: `${match[1]}-${match[2].trim()}-${match.index}`,
      });
    }
    return blocks;
  };

  // ── Quick actions ──
  const quickActions = [
    { label: "📋 Show tables", prompt: "List all tables with row counts" },
    { label: "🔍 Schema overview", prompt: "Give me a quick schema overview" },
    { label: "🔧 Fix a bug", prompt: "I'm seeing a bug: " },
    { label: "✨ Add feature", prompt: "I want to add: " },
    { label: "📂 List files", prompt: "Show me all component files in app/components/" },
    { label: "📖 Read a file", prompt: "Show me the contents of app/components/" },
  ];

  // ── Render message with deploy buttons ──
  const renderMessage = (msg, i) => {
    const isUser = msg.role === "user";
    const content = msg.content;
    const deployBlocks = isUser ? [] : parseDeployBlocks(content);

    // Split content by code blocks
    const parts = content.split(/(```[\s\S]*?```)/g);

    return (
      <div key={i} style={{ display: "flex", gap: 12, padding: "16px 20px", background: isUser ? "transparent" : `${T.accent}04`, borderBottom: `1px solid ${T.border}08` }}>
        <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: isUser ? `${T.accent}20` : "linear-gradient(135deg, #a855f7, #6366f1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: isUser ? 10 : 12, fontWeight: 800, color: isUser ? T.accent : "#fff" }}>
          {isUser ? (profile?.display_name?.slice(0,2).toUpperCase() || "U") : "✦"}
        </div>
        <div style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.6, color: T.text }}>
          {isUser ? <div style={{ fontWeight: 500 }}>{content}</div> : (
            <div>
              {parts.map((part, j) => {
                if (part.startsWith("```")) {
                  const lines = part.split("\n");
                  const header = lines[0].replace("```", "").trim();
                  const code = lines.slice(1, -1).join("\n");
                  const isDeployable = header.startsWith("deploy:") || header.startsWith("sql:");
                  const blockType = header.startsWith("deploy:") ? "deploy" : header.startsWith("sql:") ? "sql" : null;
                  const blockName = blockType ? header.split(":").slice(1).join(":").trim() : header;
                  const blockId = `${blockType}-${blockName}-${j}`;

                  return (
                    <div key={j} style={{ margin: "10px 0", borderRadius: 8, overflow: "hidden", border: `1px solid ${isDeployable ? T.accent + "40" : T.border}` }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 12px", background: isDeployable ? `${T.accent}10` : T.surface3, borderBottom: `1px solid ${isDeployable ? T.accent + "30" : T.border}` }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: isDeployable ? T.accent : T.text3, textTransform: "uppercase" }}>
                          {blockType === "deploy" ? `📦 ${blockName}` : blockType === "sql" ? `🗄 ${blockName}` : header || "code"}
                        </span>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => navigator.clipboard.writeText(code)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 10, fontWeight: 600 }}>Copy</button>
                          {isDeployable && !deployResults[blockId] && (
                            <button
                              onClick={async () => {
                                if (blockType === "deploy") {
                                  // Safety: warn if deploying to an existing large file
                                  const isLargeFile = blockName.includes("Projects") || blockName.includes("Dashboard") || blockName.includes("OKRs") || blockName.includes("Finance") || blockName.includes("PLM");
                                  if (isLargeFile && code.split("\n").length < 500) {
                                    if (!window.confirm(`⚠️ WARNING: ${blockName} is a large component (1000+ lines). This deploy block only has ${code.split("\n").length} lines — it may be truncated and could break the app. Deploy anyway?`)) return;
                                  }
                                  deployFiles([{ path: blockName, content: code }], null, `feat(ai-builder): ${blockName}`, blockId);
                                }
                                else if (blockType === "sql") deployFiles(null, code, `sql: ${blockName}`, blockId);
                              }}
                              disabled={deploying[blockId]}
                              style={{ padding: "2px 10px", borderRadius: 4, border: "none", background: T.accent, color: "#fff", fontSize: 10, fontWeight: 700, cursor: "pointer", opacity: deploying[blockId] ? 0.5 : 1 }}>
                              {deploying[blockId] ? "Deploying..." : "🚀 Deploy"}
                            </button>
                          )}
                          {deployResults[blockId] && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: deployResults[blockId].success ? "#22c55e" : "#ef4444" }}>
                              {deployResults[blockId].success ? "✓ Deployed" : "✕ Failed"}
                            </span>
                          )}
                        </div>
                      </div>
                      <pre style={{ padding: "12px 14px", margin: 0, background: T.surface2, color: T.text, fontSize: 12, lineHeight: 1.5, overflowX: "auto", fontFamily: "'JetBrains Mono', 'Fira Code', monospace", maxHeight: 400, overflow: "auto" }}>
                        <code>{code}</code>
                      </pre>
                    </div>
                  );
                }
                return <span key={j}>{part.split(/(`[^`]+`)/).map((seg, k) => {
                  if (seg.startsWith("`") && seg.endsWith("`")) return <code key={k} style={{ padding: "1px 5px", borderRadius: 4, background: T.surface3, color: T.accent, fontSize: 12, fontFamily: "monospace" }}>{seg.slice(1,-1)}</code>;
                  return seg.split(/(\*\*[^*]+\*\*)/).map((s, l) => s.startsWith("**") && s.endsWith("**") ? <strong key={`${k}-${l}`}>{s.slice(2,-2)}</strong> : <span key={`${k}-${l}`}>{s}</span>);
                })}</span>;
              })}
              {/* Deploy All button if there are multiple deployable blocks */}
              {deployBlocks.length > 1 && !deployBlocks.every(b => deployResults[b.id]) && (
                <div style={{ marginTop: 12 }}>
                  <button onClick={() => {
                    const fileBlocks = deployBlocks.filter(b => b.type === "deploy");
                    const sqlBlocks = deployBlocks.filter(b => b.type === "sql");
                    const dangerousFiles = fileBlocks.filter(b => ["Projects","Dashboard","OKRs","Finance","PLM"].some(n => b.name.includes(n)) && b.content.split("\n").length < 500);
                    if (dangerousFiles.length > 0) {
                      if (!window.confirm(`⚠️ WARNING: ${dangerousFiles.map(f=>f.name).join(", ")} appear truncated. This could break the app. Deploy anyway?`)) return;
                    }
                    const files = fileBlocks.map(b => ({ path: b.name, content: b.content }));
                    const sql = sqlBlocks.map(b => b.content).join(";\n");
                    const allId = "deploy-all-" + i;
                    deployFiles(files.length ? files : null, sql || null, "feat(ai-builder): deploy all changes", allId);
                  }} disabled={Object.values(deploying).some(Boolean)}
                    style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #a855f7, #6366f1)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                    🚀 Deploy All ({deployBlocks.length} changes)
                  </button>
                </div>
              )}
              {msg.isError && (
                <button onClick={() => sendMessage(1)} style={{ marginTop: 8, padding: "4px 12px", borderRadius: 5, border: `1px solid ${T.accent}40`, background: `${T.accent}10`, color: T.accent, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>↻ Retry</button>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: T.bg }}>
      {/* API Key Setup Modal */}
      {showSetup && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.6)" }} onClick={() => apiKey && setShowSetup(false)} />
          <div style={{ position: "relative", width: 460, background: T.surface, borderRadius: 16, border: `1px solid ${T.border}`, padding: "32px", boxShadow: "0 24px 80px rgba(0,0,0,0.5)", zIndex: 301 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: "linear-gradient(135deg, #a855f7, #6366f1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: "#fff" }}>✦</div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>Connect AI Builder</div>
                <div style={{ fontSize: 12, color: T.text3 }}>One-time setup to enable the AI assistant</div>
              </div>
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, color: T.text2, lineHeight: 1.6, marginBottom: 16 }}>
                The AI Builder uses <strong style={{ color: T.text }}>Claude by Anthropic</strong> to generate code, SQL, and deploy changes. You need an API key to get started.
              </div>
              <div style={{ background: T.surface2, borderRadius: 10, padding: "14px 16px", marginBottom: 16, border: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 8 }}>How to get your API key:</div>
                <ol style={{ margin: 0, padding: "0 0 0 18px", fontSize: 12, color: T.text2, lineHeight: 1.8 }}>
                  <li>Go to <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener" style={{ color: T.accent, fontWeight: 600, textDecoration: "none" }}>console.anthropic.com/settings/keys ↗</a></li>
                  <li>Sign up or sign in (free to create account)</li>
                  <li>Click <strong style={{ color: T.text }}>"Create Key"</strong>, name it "Helm"</li>
                  <li>Copy the key and paste it below</li>
                </ol>
              </div>
              <div style={{ fontSize: 11, color: T.text3, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 14 }}>💡</span>
                <span>Pay-per-use pricing. A typical feature conversation costs $0.05–$0.50</span>
              </div>
            </div>
            <input
              type="password"
              placeholder="sk-ant-api03-..."
              defaultValue={apiKey}
              autoFocus
              onKeyDown={e => { if (e.key === "Enter" && e.target.value.trim()) saveApiKey(e.target.value.trim()); }}
              id="api-key-input"
              style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 14, fontFamily: "monospace", outline: "none", boxSizing: "border-box", marginBottom: 12 }} />
            <div style={{ display: "flex", gap: 8 }}>
              {apiKey && <button onClick={() => setShowSetup(false)} style={{ flex: 1, padding: "10px", borderRadius: 8, border: `1px solid ${T.border}`, background: "transparent", color: T.text3, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>}
              <button onClick={() => { const v = document.getElementById("api-key-input")?.value?.trim(); if (v) saveApiKey(v); }}
                style={{ flex: 2, padding: "10px", borderRadius: 8, border: "none", background: "linear-gradient(135deg, #a855f7, #6366f1)", color: "#fff", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                Save & Connect
              </button>
            </div>
            <div style={{ textAlign: "center", marginTop: 12, fontSize: 10, color: T.text3 }}>
              Your key is stored securely and only sent server-side to Anthropic.
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ padding: "14px 24px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #a855f7, #6366f1)", fontSize: 17, color: "#fff" }}>✦</div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: T.text }}>AI Builder</div>
            <div style={{ fontSize: 10, color: T.text3 }}>Build, deploy, and manage — auto-deploys to production</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <button onClick={() => setShowSetup(true)} style={{ padding: "4px 10px", borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: "pointer", border: `1px solid ${apiKey ? "#22c55e40" : T.border}`, background: apiKey ? "#22c55e08" : "transparent", color: apiKey ? "#22c55e" : T.text3 }}
            title="Configure API key">{apiKey ? "🟢 Connected" : "🔑 Set API Key"}</button>
          {["chat", "sql"].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} style={{ padding: "4px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: "pointer", border: activeTab === tab ? `1px solid ${T.accent}40` : `1px solid ${T.border}`, background: activeTab === tab ? `${T.accent}10` : "transparent", color: activeTab === tab ? T.accent : T.text3 }}>
              {tab === "chat" ? "💬 Chat" : "🗄 SQL"}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "chat" ? (
        <>
          <div style={{ flex: 1, overflow: "auto" }}>
            {messages.length === 0 ? (
              <div style={{ padding: "50px 24px", textAlign: "center" }}>
                <div style={{ width: 56, height: 56, borderRadius: 14, margin: "0 auto 16px", background: "linear-gradient(135deg, #a855f720, #6366f120)", border: "1px solid #a855f730", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>✦</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: T.text, marginBottom: 6 }}>What do you want to build?</div>
                <div style={{ fontSize: 12, color: T.text3, maxWidth: 440, margin: "0 auto 28px", lineHeight: 1.5 }}>
                  Describe a feature or bug fix. I'll generate code and SQL, then you can deploy with one click.
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, maxWidth: 520, margin: "0 auto" }}>
                  {quickActions.map((qa, i) => (
                    <button key={i} onClick={() => { if (qa.prompt.endsWith(": ")) { setInput(qa.prompt); inputRef.current?.focus(); } else { setInput(qa.prompt); setTimeout(sendMessage, 0); } }}
                      style={{ padding: "10px 12px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface, color: T.text2, fontSize: 11, fontWeight: 500, cursor: "pointer", textAlign: "left", lineHeight: 1.4 }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent+"60"; e.currentTarget.style.background = T.surface2; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = T.surface; }}>
                      {qa.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map(renderMessage)}
                {(loading || streamingText) && (
                  <div style={{ padding: "16px 20px" }}>
                    <div style={{ display: "flex", gap: 12 }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: "linear-gradient(135deg, #a855f7, #6366f1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: "#fff", fontWeight: 800 }}>✦</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {streamingText ? (
                          <div style={{ fontSize: 13, lineHeight: 1.6, color: T.text, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{streamingText}<span style={{ display: "inline-block", width: 2, height: 14, background: T.accent, marginLeft: 2, animation: "blink 1s infinite", verticalAlign: "text-bottom" }} /></div>
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", gap: 6, color: T.text3, fontSize: 13 }}>
                            <div style={{ width: 6, height: 6, borderRadius: 3, background: T.accent, animation: "pulse 1.4s infinite" }} />
                            <div style={{ width: 6, height: 6, borderRadius: 3, background: T.accent, animation: "pulse 1.4s infinite 0.2s" }} />
                            <div style={{ width: 6, height: 6, borderRadius: 3, background: T.accent, animation: "pulse 1.4s infinite 0.4s" }} />
                            <span style={{ marginLeft: 8 }}>Thinking...</span>
                          </div>
                        )}
                        {loading && <button onClick={cancelRequest} style={{ marginTop: 8, padding: "3px 10px", borderRadius: 5, border: `1px solid ${T.border}`, background: "transparent", color: T.text3, fontSize: 10, cursor: "pointer" }}>⏹ Cancel</button>}
                      </div>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Input */}
          <div style={{ padding: "14px 20px", borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
            <div style={{ display: "flex", gap: 8, maxWidth: 800, margin: "0 auto" }}>
              <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 8, padding: "10px 14px", borderRadius: 12, border: `1px solid ${T.border}`, background: T.surface2 }} onClick={() => inputRef.current?.focus()}>
                <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  placeholder="Describe what you want to build or fix..." rows={1}
                  style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: T.text, fontSize: 13, fontFamily: "inherit", resize: "none", lineHeight: 1.5, maxHeight: 120, overflow: "auto" }}
                  onInput={e => { e.target.style.height = "auto"; e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px"; }} />
                <button onClick={() => sendMessage()} disabled={!input.trim() || loading}
                  style={{ width: 30, height: 30, borderRadius: 7, border: "none", flexShrink: 0, background: input.trim() && !loading ? "linear-gradient(135deg, #a855f7, #6366f1)" : T.surface3, color: input.trim() && !loading ? "#fff" : T.text3, cursor: input.trim() && !loading ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>↑</button>
              </div>
            </div>
            <div style={{ textAlign: "center", marginTop: 6, fontSize: 9, color: T.text3 }}>
              Shift+Enter for new line · Code blocks with deploy: or sql: prefix get 🚀 Deploy buttons
            </div>
          </div>
        </>
      ) : (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "14px 20px", flexShrink: 0 }}>
            <textarea value={sqlInput} onChange={e => setSqlInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); runSQL(); } }}
              placeholder="SELECT * FROM tasks LIMIT 10;" rows={4}
              style={{ width: "100%", padding: "12px 14px", borderRadius: 10, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", outline: "none", resize: "vertical", lineHeight: 1.5, boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button onClick={runSQL} disabled={sqlLoading || !sqlInput.trim()} style={{ padding: "6px 14px", borderRadius: 6, border: "none", background: sqlInput.trim() ? T.accent : T.surface3, color: sqlInput.trim() ? "#fff" : T.text3, fontSize: 11, fontWeight: 700, cursor: sqlInput.trim() ? "pointer" : "default" }}>
                {sqlLoading ? "Running..." : "⌘↵ Run"}
              </button>
              <span style={{ fontSize: 10, color: T.text3, lineHeight: "28px" }}>Runs via edge function with service role access</span>
            </div>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: "0 20px 20px" }}>
            {sqlResult && (
              <div style={{ borderRadius: 8, border: `1px solid ${sqlResult.success ? T.border : "#ef444440"}`, overflow: "hidden" }}>
                <div style={{ padding: "8px 12px", background: sqlResult.success ? T.surface3 : "#ef444410", fontSize: 10, color: sqlResult.success ? T.text3 : "#ef4444", fontWeight: 600 }}>
                  {sqlResult.success ? "✓ Success" : "✕ Error"}
                </div>
                <pre style={{ padding: "10px 12px", margin: 0, background: T.surface2, color: T.text, fontSize: 11, lineHeight: 1.5, overflow: "auto", fontFamily: "monospace", whiteSpace: "pre-wrap" }}>
                  {JSON.stringify(sqlResult, null, 2)}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse { 0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); } 40% { opacity: 1; transform: scale(1.2); } }
        @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
      `}</style>
    </div>
  );
}
