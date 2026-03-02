"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";
import { useAuth } from "../lib/auth";

const AVATAR_COLORS = ["#3b82f6","#a855f7","#ec4899","#06b6d4","#f97316","#22c55e","#84cc16","#ef4444"];
const acol = (uid) => uid ? AVATAR_COLORS[uid.charCodeAt(uid.length - 1) % AVATAR_COLORS.length] : T.text3;

const ACTION_CFG = {
  created: { icon: "✚", color: "#22c55e", verb: "created" },
  updated: { icon: "✎", color: "#3b82f6", verb: "updated" },
  completed: { icon: "✓", color: "#22c55e", verb: "completed" },
  deleted: { icon: "✕", color: "#ef4444", verb: "deleted" },
  assigned: { icon: "→", color: "#a855f7", verb: "assigned" },
  commented: { icon: "💬", color: "#06b6d4", verb: "commented on" },
  moved: { icon: "↻", color: "#f97316", verb: "moved" },
};

const ENTITY_ICONS = {
  task: "☐", project: "◼", doc: "📄", campaign: "📢", objective: "🎯", product: "⬢", call: "📞", automation: "⚡",
};

export default function ActivityView() {
  const { user } = useAuth();
  const [activities, setActivities] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: acts }, { data: prof }] = await Promise.all([
        supabase.from("activity_log").select("*").order("created_at", { ascending: false }).limit(100),
        supabase.from("profiles").select("id,display_name"),
      ]);
      setActivities(acts || []);
      const m = {}; (prof || []).forEach(u => { m[u.id] = u; }); setProfiles(m);
      setLoading(false);
    })();
  }, []);

  const ini = (uid) => { const u = profiles[uid]; return u?.display_name ? u.display_name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() : "?"; };
  const uname = (uid) => profiles[uid]?.display_name || "Unknown";

  const filtered = filter === "all" ? activities : activities.filter(a => a.entity_type === filter);

  // Group by day
  const groups = {};
  filtered.forEach(a => {
    const day = new Date(a.created_at).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
    if (!groups[day]) groups[day] = [];
    groups[day].push(a);
  });

  const relTime = (date) => {
    const diff = Date.now() - new Date(date).getTime();
    if (diff < 60000) return "just now";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return new Date(date).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  };

  if (loading) return <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: T.text3, fontSize: 13 }}>Loading activity…</div>;

  return (
    <div style={{ padding: "28px 32px", overflow: "auto", maxWidth: 800 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Activity</h1>
          <p style={{ fontSize: 12, color: T.text3 }}>{activities.length} recent actions</p>
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        {["all", "task", "project", "doc", "campaign", "objective"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: "5px 12px", fontSize: 11, fontWeight: 600, borderRadius: 6, cursor: "pointer",
            background: filter === f ? `${T.accent}20` : T.surface2, color: filter === f ? T.accent : T.text3,
            border: `1px solid ${filter === f ? T.accent + "40" : T.border}`,
          }}>{f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1) + "s"}</button>
        ))}
      </div>

      {Object.keys(groups).length === 0 && (
        <div style={{ textAlign: "center", padding: 40, color: T.text3 }}>
          <div style={{ fontSize: 14, marginBottom: 8 }}>No activity yet</div>
          <p style={{ fontSize: 12 }}>Actions across your workspace will appear here as you and your team work.</p>
        </div>
      )}

      {Object.entries(groups).map(([day, items]) => (
        <div key={day} style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.text3, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}>{day}</div>
          <div style={{ borderLeft: `2px solid ${T.border}`, marginLeft: 14 }}>
            {items.map(act => {
              const cfg = ACTION_CFG[act.action] || { icon: "·", color: T.text3, verb: act.action };
              const isMe = act.user_id === user?.id;
              return (
                <div key={act.id} style={{ display: "flex", gap: 12, padding: "10px 0", marginLeft: -8 }}>
                  <div style={{
                    width: 16, height: 16, borderRadius: 8, background: T.surface,
                    border: `2px solid ${cfg.color}`, display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 8, color: cfg.color, fontWeight: 700, flexShrink: 0, marginTop: 2,
                  }}>{cfg.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, lineHeight: 1.4 }}>
                      <span style={{ fontWeight: 600, color: isMe ? T.accent : T.text }}>{isMe ? "You" : uname(act.user_id)}</span>
                      {" "}<span style={{ color: T.text2 }}>{cfg.verb}</span>{" "}
                      <span style={{ color: T.text }}>{ENTITY_ICONS[act.entity_type] || ""} {act.entity_name || act.entity_type}</span>
                    </div>
                    <div style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>{relTime(act.created_at)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
