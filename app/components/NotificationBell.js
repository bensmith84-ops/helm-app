"use client";
import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";
import { useAuth } from "../lib/auth";

export default function NotificationBell({ setActive }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from("notifications").select("*")
        .eq("user_id", user.id).order("created_at", { ascending: false }).limit(20);
      setNotifications(data || []);
    })();
    // Realtime
    const channel = supabase.channel(`notif-${user.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, (payload) => {
        setNotifications(p => [payload.new, ...p.slice(0, 19)]);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user?.id]);

  useEffect(() => {
    const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;

  const markRead = async (id) => {
    setNotifications(p => p.map(n => n.id === id ? { ...n, read: true } : n));
    await supabase.from("notifications").update({ read: true }).eq("id", id);
  };

  const markAllRead = async () => {
    const unread = notifications.filter(n => !n.read).map(n => n.id);
    if (unread.length === 0) return;
    setNotifications(p => p.map(n => ({ ...n, read: true })));
    await supabase.from("notifications").update({ read: true }).in("id", unread);
  };

  const timeAgo = (d) => {
    const s = Math.floor((Date.now() - new Date(d)) / 1000);
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  };

  const TYPE_ICONS = { task_assigned: "📋", comment: "💬", overdue: "⚠️", mention: "@", info: "ℹ️" };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(p => !p)} style={{
        background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6,
        cursor: "pointer", width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
        position: "relative", color: T.text3, fontSize: 15,
      }}>
        🔔
        {unreadCount > 0 && (
          <span style={{
            position: "absolute", top: -4, right: -4, width: 16, height: 16, borderRadius: 8,
            background: "#ef4444", color: "#fff", fontSize: 9, fontWeight: 700,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>{unreadCount > 9 ? "9+" : unreadCount}</span>
        )}
      </button>

      {open && (
        <div style={{
          position: "absolute", top: 40, right: 0, width: 340, maxHeight: 420,
          background: T.surface, borderRadius: 12, border: `1px solid ${T.border}`,
          boxShadow: "0 12px 40px rgba(0,0,0,0.4)", overflow: "hidden", zIndex: 50,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 16px", borderBottom: `1px solid ${T.border}` }}>
            <span style={{ fontSize: 14, fontWeight: 700 }}>Notifications</span>
            {unreadCount > 0 && (
              <button onClick={markAllRead} style={{ background: "none", border: "none", color: T.accent, fontSize: 11, cursor: "pointer", fontWeight: 600 }}>Mark all read</button>
            )}
          </div>
          <div style={{ overflow: "auto", maxHeight: 360 }}>
            {notifications.length === 0 && (
              <div style={{ padding: 24, textAlign: "center", color: T.text3, fontSize: 13 }}>No notifications</div>
            )}
            {notifications.map(n => (
              <div key={n.id}
                onClick={() => { markRead(n.id); if (n.link) { setActive?.(n.link); setOpen(false); } }}
                style={{
                  display: "flex", gap: 10, padding: "10px 16px", cursor: "pointer",
                  background: n.read ? "transparent" : `${T.accent}06`,
                  borderBottom: `1px solid ${T.border}`, borderLeft: n.read ? "3px solid transparent" : `3px solid ${T.accent}`,
                }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>{TYPE_ICONS[n.type] || "ℹ️"}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: n.read ? 400 : 600, color: T.text, lineHeight: 1.4 }}>{n.title}</div>
                  {n.body && <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>{n.body}</div>}
                  <div style={{ fontSize: 10, color: T.text3, marginTop: 3 }}>{timeAgo(n.created_at)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
