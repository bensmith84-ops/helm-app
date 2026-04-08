"use client";
import { useState } from "react";
import { T } from "../tokens";

export const NAV_GROUPS = [
  { label: "Work", items: [
    { key: "dashboard", icon: "⬡", label: "Home" },
    { key: "okrs", icon: "◎", label: "OKRs" },
    { key: "projects", icon: "◫", label: "Projects" },
    { key: "launches", icon: "🚀", label: "Launches" },
    { key: "scorecard", icon: "▣", label: "Scorecard" },
    { key: "learning", icon: "📚", label: "Learning" },
    { key: "support", icon: "🎧", label: "Support" },
    { key: "docs", icon: "▤", label: "Docs" },
  ]},
  { label: "Connect", items: [
    { key: "messages", icon: "◬", label: "Messages" },
    { key: "calendar", icon: "▦", label: "Calendar" },
    { key: "calls", icon: "◉", label: "Calls" },
    { key: "campaigns", icon: "◈", label: "Campaigns" },
  ]},
  { label: "Operations", items: [
    { key: "plm", icon: "⬢", label: "PLM" },
    { key: "erp", icon: "◧", label: "ERP" },
    { key: "wms", icon: "◨", label: "WMS" },
    { key: "scoreboard", icon: "▩", label: "Scoreboard" },
  ]},
  { label: "System", items: [
    { key: "automation", icon: "⚡", label: "Automation" },
    { key: "reports", icon: "▥", label: "Reports" },
    { key: "people", icon: "◔", label: "Team" },
    { key: "activity", icon: "◑", label: "Activity" },
    { key: "settings", icon: "⚙", label: "Settings" },
    { key: "ai-builder", icon: "✦", label: "AI Builder", adminOnly: true },
  ]},
];

export const NAV_ITEMS = NAV_GROUPS.flatMap(g => g.items);

export default function Sidebar({ active, setActive, expanded, setExpanded, badges = {}, profile, allowedModules, isAdmin, orgId, orgs, switchOrg }) {
  const w = expanded ? 216 : 52;
  const [collapsed, setCollapsed] = useState({});
  const [showOrgMenu, setShowOrgMenu] = useState(false);
  const toggle = (label) => setCollapsed(c => ({ ...c, [label]: !c[label] }));
  
  const activeOrg = orgs?.find(o => o.id === orgId);
  
  // Use sidebar_config from profile if available, otherwise default NAV_GROUPS
  const groups = profile?.sidebar_config?.groups
    ? profile.sidebar_config.groups.map(g => ({
        label: g.label,
        items: g.items
          .filter(i => i.visible !== false)
          .map(i => {
            const def = NAV_ITEMS.find(n => n.key === i.key);
            return def ? { ...def, ...i } : i;
          })
      }))
    : NAV_GROUPS;
  
  const activeGroup = groups.find(g => g.items.some(i => i.key === active))?.label;

  return (
    <div style={{ width: w, height: "100vh", background: T.surface, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", flexShrink: 0, transition: "width 0.2s cubic-bezier(0.4,0,0.2,1)", overflow: "hidden" }}>
      {/* Logo + Org Switcher */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: expanded ? "14px 14px 8px" : "14px 0 8px", justifyContent: expanded ? "flex-start" : "center", position: "relative" }}>
        {activeOrg?.logo_url ? (
          <img src={activeOrg.logo_url} alt="" onClick={orgs?.length > 1 && expanded ? () => setShowOrgMenu(!showOrgMenu) : undefined}
            style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, objectFit: "cover", cursor: orgs?.length > 1 ? "pointer" : "default" }} />
        ) : (
          <div onClick={orgs?.length > 1 && expanded ? () => setShowOrgMenu(!showOrgMenu) : undefined}
            style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, background: `linear-gradient(135deg, ${T.accent}, ${T.purple})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 900, color: "#fff", cursor: orgs?.length > 1 ? "pointer" : "default" }}>{(activeOrg?.name || "H")[0]}</div>
        )}
        {expanded && (
          <div style={{ flex: 1, minWidth: 0, cursor: orgs?.length > 1 ? "pointer" : "default" }} onClick={orgs?.length > 1 ? () => setShowOrgMenu(!showOrgMenu) : undefined}>
            <div style={{ fontSize: 13, fontWeight: 800, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", letterSpacing: "-0.3px" }}>{activeOrg?.name || "Helm"}</div>
            {orgs?.length > 1 && <div style={{ fontSize: 9, color: T.text3, marginTop: -1 }}>Switch workspace ▾</div>}
          </div>
        )}
        {expanded && (
          <button onClick={() => setExpanded(false)} title="Collapse" style={{ width: 24, height: 24, borderRadius: 6, border: "none", cursor: "pointer", flexShrink: 0, background: "transparent", color: T.text3, display: "flex", alignItems: "center", justifyContent: "center" }}
            onMouseEnter={e => e.currentTarget.style.background = T.surface2} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 19l-7-7 7-7"/><path d="M18 19l-7-7 7-7"/></svg>
          </button>
        )}
        {/* Org switcher dropdown */}
        {showOrgMenu && expanded && (
          <div style={{ position: "absolute", top: "100%", left: 10, right: 10, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.15)", zIndex: 100, overflow: "hidden" }}>
            {orgs.map(org => (
              <div key={org.id} onClick={() => { switchOrg(org.id); setShowOrgMenu(false); window.location.reload(); }}
                style={{ padding: "8px 12px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, background: org.id === orgId ? T.accent + "10" : "transparent" }}
                onMouseEnter={e => { if (org.id !== orgId) e.currentTarget.style.background = T.surface2; }}
                onMouseLeave={e => { e.currentTarget.style.background = org.id === orgId ? T.accent + "10" : "transparent"; }}>
                <div style={{ width: 24, height: 24, borderRadius: 6, overflow: "hidden", flexShrink: 0 }}>
                  {org.logo_url ? (
                    <img src={org.logo_url} alt="" style={{ width: 24, height: 24, objectFit: "cover" }} />
                  ) : (
                    <div style={{ width: 24, height: 24, background: org.id === orgId ? T.accent : T.surface3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: org.id === orgId ? "#fff" : T.text3 }}>{(org.name || "?")[0]}</div>
                  )}
                </div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{org.name}</div>
                  <div style={{ fontSize: 9, color: T.text3 }}>{org.role}</div>
                </div>
                {org.id === orgId && <span style={{ marginLeft: "auto", fontSize: 10, color: T.accent }}>✓</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Nav groups */}
      <div style={{ flex: 1, overflow: "auto", padding: "2px 6px", display: "flex", flexDirection: "column", gap: 0 }}>
        {groups.map((group) => {
          const isCollapsed = collapsed[group.label] && group.label !== activeGroup;
          const visibleItems = group.items.filter(item => {
            if (item.adminOnly && !isAdmin) return false;
            if (allowedModules === null) return true;
            if (item.key === "settings" || item.key === "dashboard") return true;
            if (allowedModules?.mode === "block") return allowedModules.perms[item.key] !== false;
            if (Array.isArray(allowedModules)) return allowedModules.includes(item.key);
            return true;
          });
          if (visibleItems.length === 0) return null;
          return (
            <div key={group.label} style={{ marginBottom: 4 }}>
              {expanded ? (
                <button onClick={() => toggle(group.label)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 8px 2px", border: "none", background: "none", cursor: "pointer" }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.08em" }}>{group.label}</span>
                  <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke={T.text3} strokeWidth="2" style={{ transition: "transform 0.15s", transform: isCollapsed ? "rotate(-90deg)" : "rotate(0)" }}><path d="M3 4.5l3 3 3-3"/></svg>
                </button>
              ) : (
                <div style={{ height: 1, background: `${T.border}60`, margin: "6px 8px 4px" }} />
              )}
              {!isCollapsed && visibleItems.map((item) => {
                const isActive = active === item.key;
                const hasBadge = badges[item.key] > 0;
                return (
                  <button key={item.key} onClick={() => setActive(item.key)} title={!expanded ? item.label : undefined}
                    style={{ height: 32, borderRadius: 7, border: "none", cursor: "pointer", width: "100%", display: "flex", alignItems: "center", gap: 9, background: isActive ? T.accentDim : "transparent", color: isActive ? T.accent : T.text2, padding: expanded ? "0 10px" : "0", justifyContent: expanded ? "flex-start" : "center", transition: "background 0.1s", position: "relative" }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = T.surface2; }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}>
                    <span style={{ fontSize: 14, width: 18, textAlign: "center", flexShrink: 0, opacity: isActive ? 1 : 0.6 }}>{item.icon}</span>
                    {expanded && <span style={{ fontSize: 13, whiteSpace: "nowrap", flex: 1, fontWeight: isActive ? 600 : 400, textAlign: "left" }}>{item.label}</span>}
                    {expanded && hasBadge && <span style={{ fontSize: 9, fontWeight: 700, minWidth: 16, height: 16, borderRadius: 8, background: item.key === "messages" ? T.accent : `${T.text3}30`, color: item.key === "messages" ? "#fff" : T.text3, display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>{badges[item.key] > 99 ? "99+" : badges[item.key]}</span>}
                    {!expanded && hasBadge && <div style={{ position: "absolute", top: 5, right: 6, width: 5, height: 5, borderRadius: 5, background: T.accent }} />}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Profile */}
      <div style={{ display: "flex", alignItems: "center", gap: 9, padding: expanded ? "10px 12px" : "10px 0", justifyContent: expanded ? "flex-start" : "center", borderTop: `1px solid ${T.border}` }}>
        <div style={{ width: 28, height: 28, borderRadius: 14, flexShrink: 0, background: `${T.accent}20`, border: `1.5px solid ${T.accent}35`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: T.accent }}>{profile?.display_name ? profile.display_name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() : "?"}</div>
        {expanded && (
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{profile?.display_name || "User"}</div>
            <div style={{ fontSize: 10, color: T.text3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{profile?.email || ""}</div>
          </div>
        )}
      </div>
    </div>
  );
}
