"use client";
import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";

const AVATAR_COLORS = ["#3b82f6","#a855f7","#ec4899","#06b6d4","#f97316","#22c55e","#84cc16","#ef4444"];
const acol = (uid) => uid ? AVATAR_COLORS[uid.charCodeAt(uid.length - 1) % AVATAR_COLORS.length] : T.text3;

export default function MessagesView() {
  const [channels, setChannels] = useState([]);
  const [activeCh, setActiveCh] = useState(null);
  const [messages, setMessages] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    (async () => {
      const [{ data: ch }, { data: prof }] = await Promise.all([
        supabase.from("channels").select("*").eq("is_archived", false).order("name"),
        supabase.from("profiles").select("id,display_name,avatar_url"),
      ]);
      setChannels(ch || []);
      const m = {}; (prof || []).forEach(u => { m[u.id] = u; }); setProfiles(m);
      if (ch?.length) setActiveCh(ch[0].id);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!activeCh) return;
    (async () => {
      const { data: msgs } = await supabase.from("messages").select("*")
        .eq("channel_id", activeCh).is("deleted_at", null)
        .order("created_at", { ascending: true });
      setMessages(msgs || []);
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    })();
  }, [activeCh]);

  /* ── Realtime messages ── */
  useEffect(() => {
    if (!activeCh) return;
    const channel = supabase.channel(`msgs-${activeCh}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `channel_id=eq.${activeCh}` }, (payload) => {
        setMessages(p => {
          if (p.some(m => m.id === payload.new.id)) return p;
          // Replace temp message if exists
          const withoutTemp = p.filter(m => !m.id.startsWith("temp-") || m.content !== payload.new.content);
          return [...withoutTemp, payload.new];
        });
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [activeCh]);

  const createChannel = async () => {
    const name = prompt("Channel name:");
    if (!name?.trim()) return;
    const { data, error } = await supabase.from("channels").insert({
      org_id: "a0000000-0000-0000-0000-000000000001", name: name.trim(), is_archived: false,
    }).select().single();
    if (data) { setChannels(p => [...p, data]); setActiveCh(data.id); }
  };

  const ini = (uid) => { const u = profiles[uid]; return u?.display_name ? u.display_name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() : "?"; };
  const uname = (uid) => profiles[uid]?.display_name || "Unknown";

  const sendMessage = async () => {
    if (!input.trim() || !activeCh) return;
    const ch = channels.find(c => c.id === activeCh);
    const tempMsg = {
      id: `temp-${Date.now()}`,
      channel_id: activeCh,
      author_id: "10000000-0000-0000-0000-000000000001",
      content: input.trim(),
      created_at: new Date().toISOString(),
    };
    setMessages(p => [...p, tempMsg]);
    setInput("");
    setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    const { data } = await supabase.from("messages").insert({
      channel_id: activeCh,
      author_id: "10000000-0000-0000-0000-000000000001",
      content: tempMsg.content,
    }).select().single();
    if (data) setMessages(p => p.map(m => m.id === tempMsg.id ? data : m));
  };

  if (loading) return <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: T.text3, fontSize: 13 }}>Loading messages…</div>;

  const channel = channels.find(c => c.id === activeCh);
  const filteredCh = search ? channels.filter(c => c.name.toLowerCase().includes(search.toLowerCase())) : channels;

  // Group messages by date
  const grouped = [];
  let lastDate = "";
  messages.forEach(msg => {
    const d = new Date(msg.created_at).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    if (d !== lastDate) { grouped.push({ type: "date", date: d }); lastDate = d; }
    grouped.push({ type: "msg", ...msg });
  });

  const Ava = ({ uid, sz = 36 }) => {
    const c = acol(uid);
    return (
      <div title={uname(uid)} style={{
        width: sz, height: sz, borderRadius: "50%",
        background: `${c}18`, border: `1.5px solid ${c}50`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: Math.max(sz * 0.34, 10), fontWeight: 700, color: c, flexShrink: 0,
      }}>{ini(uid)}</div>
    );
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Channel sidebar */}
      <div style={{ width: 240, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", background: T.bg, flexShrink: 0 }}>
        <div style={{ padding: "16px 16px 10px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: T.text3, letterSpacing: "0.1em", textTransform: "uppercase" }}>Channels</span>
            <button onClick={createChannel} style={{ background: "none", border: "none", cursor: "pointer", color: T.text3, fontSize: 14, padding: 0, lineHeight: 1 }}>+</button>
          </div>
        </div>
        <div style={{ padding: "0 8px 8px" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 6, padding: "5px 10px",
            background: T.surface2, borderRadius: 6, border: `1px solid ${T.border}`,
          }}>
            <svg width="12" height="12" viewBox="0 0 16 16" fill={T.text3}><circle cx="7" cy="7" r="5.5" fill="none" stroke={T.text3} strokeWidth="2"/><line x1="11" y1="11" x2="15" y2="15" stroke={T.text3} strokeWidth="2" strokeLinecap="round"/></svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: T.text, fontSize: 12, fontFamily: "inherit" }} />
          </div>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "0 8px" }}>
          {filteredCh.map(ch => {
            const on = activeCh === ch.id;
            return (
              <button key={ch.id} onClick={() => setActiveCh(ch.id)} style={{
                width: "100%", textAlign: "left", padding: "8px 12px", borderRadius: 8, border: "none",
                cursor: "pointer", display: "flex", alignItems: "center", gap: 10, fontSize: 13, marginBottom: 1,
                background: on ? `${T.accent}15` : "transparent",
                color: on ? T.text : T.text2, fontWeight: on ? 600 : 400,
              }}>
                <span style={{ color: T.text3, fontSize: 15 }}>#</span>
                {ch.name}
              </button>
            );
          })}
        </div>
      </div>

      {/* Message area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Channel header */}
        {channel && (
          <div style={{ padding: "12px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 10, flexShrink: 0, background: T.surface }}>
            <span style={{ fontSize: 18, color: T.text3 }}>#</span>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>{channel.name}</div>
              {channel.description && <div style={{ fontSize: 11, color: T.text3 }}>{channel.description}</div>}
            </div>
          </div>
        )}

        {/* Messages */}
        <div style={{ flex: 1, overflow: "auto", padding: "16px 20px" }}>
          {grouped.map((item, i) => {
            if (item.type === "date") {
              return (
                <div key={`date-${i}`} style={{ display: "flex", alignItems: "center", gap: 16, margin: "20px 0 12px", userSelect: "none" }}>
                  <div style={{ flex: 1, height: 1, background: T.border }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: T.text3, whiteSpace: "nowrap" }}>{item.date}</span>
                  <div style={{ flex: 1, height: 1, background: T.border }} />
                </div>
              );
            }
            const time = new Date(item.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
            // Check if same author as previous message (compact mode)
            const prev = grouped[i - 1];
            const compact = prev?.type === "msg" && prev.author_id === item.author_id;

            if (compact) {
              return (
                <div key={item.id} style={{ padding: "2px 0 2px 52px", fontSize: 14, color: T.text2, lineHeight: 1.5 }}>
                  {item.content}
                </div>
              );
            }

            return (
              <div key={item.id} style={{ display: "flex", gap: 12, padding: "8px 0" }}>
                <Ava uid={item.author_id} sz={36} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: acol(item.author_id) }}>{uname(item.author_id)}</span>
                    <span style={{ fontSize: 11, color: T.text3 }}>{time}</span>
                  </div>
                  <div style={{ fontSize: 14, color: T.text2, lineHeight: 1.5 }}>{item.content}</div>
                </div>
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ padding: "12px 20px", borderTop: `1px solid ${T.border}`, flexShrink: 0 }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            background: T.surface2, borderRadius: 10, border: `1px solid ${T.border}`,
            padding: "10px 14px",
          }}>
            <input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder={channel ? `Message #${channel.name}` : "Type a message…"}
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: T.text, fontSize: 14, fontFamily: "inherit" }}
            />
            <button onClick={sendMessage} style={{
              background: input.trim() ? T.accent : T.surface3,
              border: "none", borderRadius: 6, padding: "6px 14px", cursor: input.trim() ? "pointer" : "default",
              color: input.trim() ? "#fff" : T.text3, fontSize: 12, fontWeight: 600,
              transition: "all 0.15s",
            }}>Send</button>
          </div>
        </div>
      </div>
    </div>
  );
}
