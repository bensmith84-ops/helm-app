"use client";
import { useState } from "react";
import { T, CHANNELS, MESSAGES, getUser, USERS } from "../tokens";

const AVATAR_COLORS = ["#3b82f6","#a855f7","#ec4899","#06b6d4","#f97316","#22c55e","#84cc16","#ef4444"];

export default function MessagesView() {
  const [ch, setCh] = useState("ch1");
  const [input, setInput] = useState("");
  const [localMsgs, setLocalMsgs] = useState({});
  const [hoveredMsg, setHoveredMsg] = useState(null);

  const channel = CHANNELS.find(c => c.id === ch);
  const baseMsgs = MESSAGES[ch] || [];
  const extra = localMsgs[ch] || [];
  const msgs = [...baseMsgs, ...extra];

  const sendMessage = () => {
    if (!input.trim()) return;
    const msg = { id: `local-${Date.now()}`, user: "u1", text: input.trim(), time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }), reactions: [] };
    setLocalMsgs(p => ({ ...p, [ch]: [...(p[ch] || []), msg] }));
    setInput("");
  };

  const Ava = ({ uid, sz = 32 }) => {
    const u = getUser(uid);
    const c = AVATAR_COLORS[uid.charCodeAt(1) % AVATAR_COLORS.length];
    return (
      <div style={{
        width: sz, height: sz, borderRadius: "50%", background: `${c}18`, border: `1.5px solid ${c}50`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: Math.max(sz * 0.36, 9), fontWeight: 700, color: c, flexShrink: 0,
      }}>{u.avatar}</div>
    );
  };

  const totalUnread = CHANNELS.reduce((s, c) => s + c.unread, 0);

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Sidebar */}
      <div style={{ width: 240, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", background: T.bg, flexShrink: 0 }}>
        {/* Sidebar header */}
        <div style={{ padding: "20px 16px 14px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: T.text3, letterSpacing: "0.1em", textTransform: "uppercase" }}>Messages</span>
            {totalUnread > 0 && (
              <span style={{ fontSize: 10, fontWeight: 700, background: T.accent, color: "#fff", borderRadius: 10, padding: "1px 7px" }}>{totalUnread}</span>
            )}
          </div>
        </div>

        {/* Search */}
        <div style={{ padding: "0 12px 12px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", background: T.surface2, borderRadius: 8, border: `1px solid ${T.border}` }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="5.5" stroke={T.text3} strokeWidth="2" fill="none"/><line x1="11" y1="11" x2="15" y2="15" stroke={T.text3} strokeWidth="2" strokeLinecap="round"/></svg>
            <span style={{ fontSize: 12, color: T.text3 }}>Search messages…</span>
          </div>
        </div>

        {/* Channels section */}
        <div style={{ padding: "0 8px" }}>
          <div style={{ padding: "8px 12px 6px", fontSize: 10, fontWeight: 700, color: T.text3, letterSpacing: "0.06em", textTransform: "uppercase" }}>Channels</div>
          {CHANNELS.map(c => {
            const on = ch === c.id;
            return (
              <button key={c.id} onClick={() => setCh(c.id)} style={{
                width: "100%", textAlign: "left", padding: "8px 12px", borderRadius: 8, border: "none",
                cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between",
                background: on ? `${T.accent}15` : "transparent", color: on ? T.text : T.text2,
                fontSize: 13, marginBottom: 1, transition: "all 0.12s", fontWeight: on ? 600 : 400,
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: T.text3, fontSize: 14 }}>#</span>
                  <span>{c.name}</span>
                </div>
                {c.unread > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 700, background: T.accent, color: "#fff", borderRadius: 10, padding: "1px 7px", minWidth: 18, textAlign: "center" }}>{c.unread}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* DMs section */}
        <div style={{ padding: "12px 8px 0" }}>
          <div style={{ padding: "8px 12px 6px", fontSize: 10, fontWeight: 700, color: T.text3, letterSpacing: "0.06em", textTransform: "uppercase" }}>Direct Messages</div>
          {USERS.slice(1, 5).map(u => {
            const c = AVATAR_COLORS[u.id.charCodeAt(1) % AVATAR_COLORS.length];
            return (
              <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 12px", borderRadius: 8, cursor: "pointer", transition: "background 0.1s" }}>
                <div style={{ position: "relative" }}>
                  <div style={{ width: 24, height: 24, borderRadius: 12, background: `${c}18`, border: `1px solid ${c}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: c }}>{u.avatar}</div>
                  <div style={{ position: "absolute", bottom: -1, right: -1, width: 8, height: 8, borderRadius: 8, background: T.green, border: `2px solid ${T.bg}` }} />
                </div>
                <span style={{ fontSize: 12, color: T.text2 }}>{u.name}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main chat area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Channel header */}
        <div style={{ padding: "12px 24px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", background: T.surface, flexShrink: 0 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 16, color: T.text3 }}>#</span>
              <span style={{ fontSize: 16, fontWeight: 700 }}>{channel?.name}</span>
            </div>
            <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>
              {channel?.name === "general" && "Company-wide announcements and work-based matters"}
              {channel?.name === "engineering" && "Engineering team discussions, PRs, and architecture"}
              {channel?.name === "design" && "Design system, reviews, and visual updates"}
              {channel?.name === "product-updates" && "Product launches, feature updates, and roadmap"}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke={T.text3} strokeWidth="1.5"/><circle cx="8" cy="8" r="2" fill={T.text3}/></svg>
              <span style={{ fontSize: 11, color: T.text3 }}>{USERS.length} members</span>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div style={{ flex: 1, overflow: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 4 }}>
          {/* Date divider */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "8px 0 16px" }}>
            <div style={{ flex: 1, height: 1, background: T.border }} />
            <span style={{ fontSize: 11, fontWeight: 600, color: T.text3, padding: "2px 10px", background: T.surface2, borderRadius: 10, border: `1px solid ${T.border}` }}>Today</span>
            <div style={{ flex: 1, height: 1, background: T.border }} />
          </div>

          {msgs.map(m => {
            const u = getUser(m.user);
            const hov = hoveredMsg === m.id;
            return (
              <div key={m.id}
                onMouseEnter={() => setHoveredMsg(m.id)}
                onMouseLeave={() => setHoveredMsg(null)}
                style={{
                  display: "flex", gap: 12, padding: "8px 12px", borderRadius: 8, position: "relative",
                  background: hov ? `${T.text}04` : "transparent", transition: "background 0.1s",
                }}>
                <Ava uid={m.user} sz={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 3 }}>
                    <span style={{ fontSize: 14, fontWeight: 700 }}>{u.name}</span>
                    <span style={{ fontSize: 11, color: T.text3 }}>{m.time}</span>
                  </div>
                  <div style={{ fontSize: 14, color: T.text2, lineHeight: 1.55 }}>{m.text}</div>
                  {m.reactions.length > 0 && (
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      {m.reactions.map((r, i) => (
                        <span key={i} style={{
                          background: T.surface2, padding: "3px 8px", borderRadius: 12,
                          fontSize: 12, border: `1px solid ${T.border}`, cursor: "pointer",
                          display: "flex", alignItems: "center", gap: 4,
                        }}>
                          {r.emoji} <span style={{ fontSize: 11, fontWeight: 600, color: T.text2 }}>{r.count}</span>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {/* Hover actions */}
                {hov && (
                  <div style={{
                    position: "absolute", top: -4, right: 12, display: "flex", gap: 2,
                    background: T.surface2, borderRadius: 8, border: `1px solid ${T.border}`,
                    padding: 2, boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
                  }}>
                    {["😊", "👍", "🧵", "⋯"].map(e => (
                      <button key={e} style={{
                        width: 28, height: 28, borderRadius: 6, border: "none",
                        background: "transparent", cursor: "pointer", fontSize: 13,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: T.text3,
                      }}>{e}</button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Composer */}
        <div style={{ padding: "12px 24px 16px", borderTop: `1px solid ${T.border}`, background: T.surface }}>
          <div style={{
            display: "flex", alignItems: "flex-end", gap: 8,
            background: T.surface2, borderRadius: 12, border: `1px solid ${input ? T.accent : T.border}`,
            padding: "10px 14px", transition: "border-color 0.15s",
          }}>
            {/* Formatting toolbar */}
            <div style={{ display: "flex", gap: 4, paddingBottom: 2, flexShrink: 0 }}>
              {["B", "I", "🔗", "📎"].map(b => (
                <button key={b} style={{
                  width: 28, height: 28, borderRadius: 6, border: "none",
                  background: "transparent", cursor: "pointer", fontSize: 12,
                  color: T.text3, display: "flex", alignItems: "center", justifyContent: "center",
                  fontWeight: b === "B" ? 800 : b === "I" ? 400 : 400,
                  fontStyle: b === "I" ? "italic" : "normal",
                }}>{b}</button>
              ))}
            </div>
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder={`Message #${channel?.name}…`}
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: T.text, fontSize: 14, fontFamily: "inherit", padding: "2px 0" }}
            />
            <button onClick={sendMessage} disabled={!input.trim()} style={{
              width: 32, height: 32, borderRadius: 8, border: "none", flexShrink: 0,
              background: input.trim() ? T.accent : T.surface3, cursor: input.trim() ? "pointer" : "default",
              display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.15s",
            }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                <path d="M2 8h12M10 4l4 4-4 4" stroke={input.trim() ? "#fff" : T.text3} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}