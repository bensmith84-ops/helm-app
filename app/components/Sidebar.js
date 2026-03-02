"use client";
import { T } from "../tokens";

export const NAV_ITEMS = [
  { key: "dashboard", icon: "⬡", label: "Home" },
  { key: "projects", icon: "◫", label: "Projects" },
  { key: "okrs", icon: "◎", label: "OKRs" },
  { key: "messages", icon: "◬", label: "Messages" },
  { key: "docs", icon: "▤", label: "Docs" },
  { type: "divider" },
  { key: "calendar", icon: "▦", label: "Calendar" },
  { key: "calls", icon: "◉", label: "Calls" },
  { key: "campaigns", icon: "◈", label: "Campaigns" },
  { type: "divider" },
  { key: "plm", icon: "⬢", label: "PLM" },
  { type: "divider" },
  { key: "automation", icon: "⚡", label: "Automation" },
  { key: "reports", icon: "▥", label: "Reports" },
  { type: "divider" },
  { key: "people", icon: "👥", label: "Team" },
  { key: "settings", icon: "⚙", label: "Settings" },
];

export default function Sidebar({ active, setActive, expanded, setExpanded, badges = {}, profile }) {
  const w = expanded ? 200 : 52;
  return (
    <div style={{
      width: w, background: T.surface, borderRight: `1px solid ${T.border}`, display: "flex",
      flexDirection: "column", paddingTop: 14, gap: 2, flexShrink: 0,
      transition: "width 0.2s ease", overflow: "hidden",
      alignItems: expanded ? "stretch" : "center",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, padding: expanded ? "0 12px" : "0", justifyContent: expanded ? "flex-start" : "center" }}>
        <div style={{
          width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg, ${T.accent}, ${T.purple})`,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 900,
          color: "#fff", letterSpacing: "-0.5px", flexShrink: 0,
        }}>N</div>
        {expanded && <span style={{ fontSize: 15, fontWeight: 700, color: T.text, whiteSpace: "nowrap" }}>Nexus</span>}
      </div>
      {NAV_ITEMS.map((item, i) =>
        item.type === "divider" ? (
          <div key={i} style={{ width: expanded ? "calc(100% - 24px)" : 20, height: 1, background: T.border, margin: expanded ? "4px 12px" : "4px auto" }} />
        ) : (
          <button key={item.key} onClick={() => setActive(item.key)} title={!expanded ? item.label : undefined} style={{
            width: expanded ? "calc(100% - 16px)" : 36, height: 36, borderRadius: 8, border: "none", cursor: "pointer", display: "flex",
            alignItems: "center", gap: 10, fontSize: expanded ? 13 : 16, transition: "all 0.15s",
            background: active === item.key ? T.accentDim : "transparent",
            color: active === item.key ? T.accent : T.text3,
            padding: expanded ? "0 10px" : 0,
            justifyContent: expanded ? "flex-start" : "center",
            margin: expanded ? "0 8px" : "0",
            position: "relative",
          }}>
            <span style={{ fontSize: 16, width: 20, textAlign: "center", flexShrink: 0 }}>{item.icon}</span>
            {expanded && <span style={{ whiteSpace: "nowrap", fontWeight: active === item.key ? 600 : 400, flex: 1 }}>{item.label}</span>}
            {expanded && badges[item.key] > 0 && (
              <span style={{
                fontSize: 9, fontWeight: 700, minWidth: 16, height: 16, borderRadius: 8,
                background: item.key === "messages" ? T.accent : `${T.text3}30`,
                color: item.key === "messages" ? "#fff" : T.text3,
                display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px",
              }}>{badges[item.key] > 99 ? "99+" : badges[item.key]}</span>
            )}
            {!expanded && badges[item.key] > 0 && (
              <div style={{ position: "absolute", top: 4, right: 2, width: 6, height: 6, borderRadius: 6, background: T.accent }} />
            )}
          </button>
        )
      )}
      <div style={{ flex: 1 }} />
      <button onClick={() => setExpanded(!expanded)} style={{
        width: expanded ? "calc(100% - 16px)" : 36, height: 32, borderRadius: 8, border: "none", cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: expanded ? "flex-start" : "center", gap: 10,
        background: "transparent", color: T.text3, fontSize: 14, padding: expanded ? "0 10px" : 0,
        margin: expanded ? "0 8px 4px" : "0 0 4px",
        transition: "all 0.15s",
      }}>
        <span style={{ fontSize: 16, width: 20, textAlign: "center", flexShrink: 0, transition: "transform 0.2s", transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}>»</span>
        {expanded && <span style={{ fontSize: 12, whiteSpace: "nowrap" }}>Collapse</span>}
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: expanded ? "0 12px" : "0", justifyContent: expanded ? "flex-start" : "center", marginBottom: 12 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 14, background: `${T.accent}25`, border: `1.5px solid ${T.accent}40`,
          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: T.accent, flexShrink: 0,
        }}>{profile?.display_name ? profile.display_name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() : "?"}</div>
        {expanded && <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{profile?.display_name || "User"}</div>
          <div style={{ fontSize: 10, color: T.text3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile?.email || ""}</div>
        </div>}
      </div>
    </div>
  );
}
