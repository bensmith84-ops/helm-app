"use client";
import { useState } from "react";
import { T, CHANNELS, MESSAGES, getUser } from "../tokens";
import { Badge, Avatar } from "./ui";

export default function MessagesView() {
  const [ch, setCh] = useState("ch1");
  const msgs = MESSAGES[ch] || [];
  return (
    <div style={{ display: "flex", height: "100%" }}>
      <div style={{ width: 200, borderRight: `1px solid ${T.border}`, padding: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: T.text3, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Channels</div>
        {CHANNELS.map(c => (
          <button key={c.id} onClick={() => setCh(c.id)} style={{
            width: "100%", textAlign: "left", padding: "7px 10px", borderRadius: 6, border: "none",
            cursor: "pointer", fontSize: 13, marginBottom: 2, display: "flex", justifyContent: "space-between",
            background: ch === c.id ? T.surface3 : "transparent", color: ch === c.id ? T.text : T.text2,
          }}>
            <span># {c.name}</span>
            {c.unread > 0 && <Badge small color={T.accent}>{c.unread}</Badge>}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "12px 20px", borderBottom: `1px solid ${T.border}`, fontSize: 14, fontWeight: 600 }}>
          # {CHANNELS.find(c => c.id === ch)?.name}
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          {msgs.map(m => {
            const u = getUser(m.user);
            return (
              <div key={m.id} style={{ display: "flex", gap: 10 }}>
                <Avatar user={m.user} size={32} />
                <div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{u.name}</span>
                    <span style={{ fontSize: 10, color: T.text3 }}>{m.time}</span>
                  </div>
                  <div style={{ fontSize: 13, color: T.text2, lineHeight: 1.5 }}>{m.text}</div>
                  {m.reactions.length > 0 && (
                    <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                      {m.reactions.map((r, i) => (
                        <span key={i} style={{ background: T.surface3, padding: "2px 6px", borderRadius: 10, fontSize: 11, border: `1px solid ${T.border}` }}>
                          {r.emoji} {r.count}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ padding: "12px 20px", borderTop: `1px solid ${T.border}` }}>
          <div style={{ background: T.surface2, borderRadius: 8, padding: "10px 14px", border: `1px solid ${T.border}`, fontSize: 13, color: T.text3 }}>
            Message #{CHANNELS.find(c => c.id === ch)?.name}...
          </div>
        </div>
      </div>
    </div>
  );
}
