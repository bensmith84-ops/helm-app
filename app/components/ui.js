"use client";
import { T, getUser } from "../tokens";

export const Badge = ({ children, color = T.accent, bg, small }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", padding: small ? "1px 6px" : "2px 8px",
    borderRadius: 4, fontSize: small ? 10 : 11, fontWeight: 600,
    background: bg || (color + "18"), color, letterSpacing: "0.02em", whiteSpace: "nowrap",
  }}>{children}</span>
);

export const Avatar = ({ user, size = 28 }) => {
  const u = typeof user === "string" ? getUser(user) : user;
  const colors = [T.accent, T.purple, T.pink, T.cyan, T.orange, T.green, T.yellow, T.red];
  const c = colors[u.id.charCodeAt(1) % colors.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: size/2, background: c + "25",
      color: c, display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.38, fontWeight: 700, flexShrink: 0, border: `1.5px solid ${c}40`,
    }}>{u.avatar}</div>
  );
};

export const ProgressBar = ({ value, color = T.accent, height = 4, bg = T.surface3 }) => (
  <div style={{ width: "100%", height, borderRadius: height, background: bg, overflow: "hidden" }}>
    <div style={{ width: `${Math.min(100, Math.max(0, value))}%`, height: "100%", borderRadius: height, background: color, transition: "width 0.6s ease" }} />
  </div>
);

export const Stat = ({ label, value, sub, color }) => (
  <div style={{ padding: "14px 16px", background: T.surface2, borderRadius: 8, border: `1px solid ${T.border}`, minWidth: 0 }}>
    <div style={{ fontSize: 11, color: T.text3, marginBottom: 4, letterSpacing: "0.04em", textTransform: "uppercase" }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 700, color: color || T.text, lineHeight: 1.1 }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: T.text3, marginTop: 3 }}>{sub}</div>}
  </div>
);

export const SectionHeader = ({ icon, title, count, action, actionLabel }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 16, opacity: 0.7 }}>{icon}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{title}</span>
      {count != null && <Badge small color={T.text3}>{count}</Badge>}
    </div>
    {action && <button onClick={action} style={{ background: "none", border: "none", color: T.accent, fontSize: 12, cursor: "pointer", fontWeight: 500 }}>{actionLabel || "View all →"}</button>}
  </div>
);

export const Card = ({ children, style, onClick, hover }) => (
  <div onClick={onClick} style={{
    background: T.surface2, borderRadius: 8, border: `1px solid ${T.border}`, padding: 16,
    cursor: onClick ? "pointer" : "default", transition: "all 0.15s ease",
    ...(hover ? { ":hover": { borderColor: T.accent } } : {}), ...style,
  }}>{children}</div>
);

export const StatusDot = ({ color, size = 8 }) => (
  <div style={{ width: size, height: size, borderRadius: size, background: color, flexShrink: 0, boxShadow: `0 0 6px ${color}40` }} />
);

export const TabBar = ({ tabs, active, onChange }) => (
  <div style={{ display: "flex", gap: 2, background: T.surface, borderRadius: 6, padding: 2, border: `1px solid ${T.border}` }}>
    {tabs.map(t => (
      <button key={t.key} onClick={() => onChange(t.key)} style={{
        padding: "6px 14px", borderRadius: 4, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 500, transition: "all 0.15s",
        background: active === t.key ? T.surface3 : "transparent", color: active === t.key ? T.text : T.text3,
      }}>{t.label}{t.count != null ? ` (${t.count})` : ""}</button>
    ))}
  </div>
);
