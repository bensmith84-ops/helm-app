"use client";
import { T } from "../tokens";

export const NAV_ITEMS = [
  { key: "dashboard", icon: "⬡", label: "Home" },
  { key: "okrs", icon: "◎", label: "OKRs" },
  { key: "scorecard", icon: "▣", label: "Scorecard" },
  { key: "projects", icon: "◫", label: "Projects" },
  { key: "messages", icon: "◬", label: "Messages" },
  { key: "docs", icon: "▤", label: "Docs" },
  { type: "divider" },
  { key: "calendar", icon: "▦", label: "Calendar" },
  { key: "calls", icon: "◉", label: "Calls" },
  { key: "campaigns", icon: "◈", label: "Campaigns" },
  { type: "divider" },
  { key: "plm", icon: "⬢", label: "PLM" },
  { key: "finance", icon: "◆", label: "Finance" },
  { key: "scoreboard", icon: "📊", label: "Scoreboard" },
  { type: "divider" },
  { key: "automation", icon: "⚡", label: "Automation" },
  { key: "reports", icon: "▥", label: "Reports" },
  { type: "divider" },
  { key: "people", icon: "👥", label: "Team" },
  { key: "activity", icon: "◔", label: "Activity" },
  { key: "settings", icon: "⚙", label: "Settings" },
  { type: "divider" },
  { key: "ai-builder", icon: "✦", label: "AI Builder", adminOnly: true },
];

export default function Sidebar({ active, setActive, expanded, setExpanded, badges = {}, profile, allowedModules, isAdmin }) {
  const w = expanded ? 212 : 52;
  // Reorder nav items based on user's saved nav_order
  const reorderedItems = (() => {
    const navOrder = profile?.nav_order;
    if (!navOrder || !Array.isArray(navOrder)) return NAV_ITEMS;
    const nonDivider = NAV_ITEMS.filter(n => !n.type);
    const ordered = navOrder.map(k => nonDivider.find(n => n.key === k)).filter(Boolean);
    const remaining = nonDivider.filter(n => !navOrder.includes(n.key));
    return [...ordered, ...remaining];
  })();
  // Filter nav items based on module permissions
  const visibleItems = reorderedItems.filter(item => {
    if (item.type === "divider") return true;
    if (item.adminOnly) return isAdmin;
    if (item.key === "settings") return true;
    if (allowedModules === null) return true;
    return allowedModules.includes(item.key);
  });
  // Remove consecutive dividers or leading/trailing dividers
  const filteredItems = visibleItems.filter((item, i) => {
    if (item.type !== "divider") return true;
    const prev = visibleItems[i - 1];
    const next = visibleItems[i + 1];
    if (!prev || !next) return false;
    if (prev.type === "divider") return false;
    return true;
  });
  return (
    <div style={{
      width: w, background: T.surface, borderRight: `1px solid ${T.border}`, display: "flex",
      flexDirection: "column", paddingTop: 12, flexShrink: 0,
      transition: "width 0.2s ease", overflow: "hidden",
    }}>
      {/* Logo + Collapse */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10, marginBottom: 14,
        padding: expanded ? "0 14px" : "0", justifyContent: expanded ? "flex-start" : "center",
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
          background: `linear-gradient(135deg, ${T.accent}, ${T.purple})`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 15, fontWeight: 900, color: "#fff", letterSpacing: "-0.5px",
        }}>H</div>
        {expanded && <span style={{ fontSize: 15, fontWeight: 700, color: T.text, whiteSpace: "nowrap", flex: 1 }}>Helm</span>}
        <button onClick={() => setExpanded(!expanded)} title={expanded ? "Collapse sidebar" : "Expand sidebar"} style={{
          width: 26, height: 26, borderRadius: 6, border: "none", cursor: "pointer", flexShrink: 0,
          background: "transparent", color: T.text3, display: "flex", alignItems: "center", justifyContent: "center",
          transition: "all 0.15s",
        }} onMouseEnter={e => e.currentTarget.style.background = T.surface3} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ transition: "transform 0.2s", transform: expanded ? "rotate(180deg)" : "rotate(0)" }}>
            <path d="M11 19l-7-7 7-7" /><path d="M18 19l-7-7 7-7" />
          </svg>
        </button>
      </div>

      {/* Nav items */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 1, padding: expanded ? "0 8px" : "0 8px" }}>
        {filteredItems.map((item, i) =>
          item.type === "divider" ? (
            <div key={i} style={{ height: 1, background: T.border, margin: "5px 0" }} />
          ) : (
            <button
              key={item.key}
              onClick={() => setActive(item.key)}
              title={!expanded ? item.label : undefined}
              style={{
                height: 34, borderRadius: 7, border: "none", cursor: "pointer",
                display: "flex", alignItems: "center", gap: 9,
                background: active === item.key ? T.accentDim : "transparent",
                color: active === item.key ? T.accent : T.text2,
                padding: expanded ? "0 9px" : "0",
                justifyContent: expanded ? "flex-start" : "center",
                transition: "background 0.12s, color 0.12s",
                position: "relative",
                textAlign: "left",
                width: "100%",
              }}
            >
              {/* Icon — fixed width so labels always start at the same x */}
              <span style={{
                fontSize: 15, width: 18, textAlign: "center", flexShrink: 0,
                opacity: active === item.key ? 1 : 0.65,
              }}>{item.icon}</span>

              {/* Label */}
              {expanded && (
                <span style={{
                  fontSize: 13, whiteSpace: "nowrap", flex: 1,
                  fontWeight: active === item.key ? 600 : 400,
                  letterSpacing: 0,
                }}>{item.label}</span>
              )}

              {/* Badge */}
              {expanded && badges[item.key] > 0 && (
                <span style={{
                  fontSize: 9, fontWeight: 700, minWidth: 16, height: 16, borderRadius: 8,
                  background: item.key === "messages" ? T.accent : `${T.text3}30`,
                  color: item.key === "messages" ? "#fff" : T.text3,
                  display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px",
                }}>{badges[item.key] > 99 ? "99+" : badges[item.key]}</span>
              )}
              {!expanded && badges[item.key] > 0 && (
                <div style={{ position: "absolute", top: 5, right: 4, width: 5, height: 5, borderRadius: 5, background: T.accent }} />
              )}
            </button>
          )
        )}
      </div>

      {/* Profile */}
      <div style={{
        display: "flex", alignItems: "center", gap: 9, marginBottom: 12,
        padding: expanded ? "0 9px" : "0", justifyContent: expanded ? "flex-start" : "center",
        margin: expanded ? "0 8px 12px" : "0 8px 12px",
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: 14, flexShrink: 0,
          background: `${T.accent}25`, border: `1.5px solid ${T.accent}40`,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 10, fontWeight: 700, color: T.accent,
        }}>{profile?.display_name ? profile.display_name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() : "?"}</div>
        {expanded && (
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {profile?.display_name || "User"}
            </div>
            <div style={{ fontSize: 10, color: T.text3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {profile?.email || ""}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
