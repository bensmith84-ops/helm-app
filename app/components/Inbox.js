"use client";
import { useState, useEffect, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";
import { useAuth } from "../lib/auth";

const TYPE_CONFIG = {
  okr_deadline:   { icon: "◎", color: "#f97316", label: "OKR Deadline" },
  task_overdue:   { icon: "☐", color: "#ef4444", label: "Overdue" },
  plm_stage:      { icon: "⬢", color: "#8b5cf6", label: "PLM Update" },
  approval:       { icon: "⏳", color: "#eab308", label: "Approval" },
  assignment:     { icon: "👤", color: "#3b82f6", label: "Assignment" },
  project_added:  { icon: "◫", color: "#3b82f6", label: "Project" },
  mention:        { icon: "💬", color: "#3b82f6", label: "Mention" },
  comment:        { icon: "💬", color: "#06b6d4", label: "Comment" },
  system:         { icon: "🔔", color: "#22c55e", label: "System" },
  sheets_sync:    { icon: "📊", color: "#22c55e", label: "Sync" },
};

const relTime = (d) => {
  const diff = Date.now() - new Date(d).getTime();
  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};
const dateStr = (d) => d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
const isOverdue = (d) => d && new Date(d) < new Date(new Date().toDateString());

const FILTERS = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread Only" },
  { key: "mentions", label: "Mentions" },
  { key: "assigned_to_me", label: "Assigned to Me" },
  { key: "assigned_by_me", label: "Assigned by Me" },
];
const SORTS = [
  { key: "activity", label: "Activity Date" },
  { key: "project", label: "Project" },
  { key: "due", label: "Due Date" },
];

export default function InboxView({ setActive }) {
  const { user, orgId } = useAuth();
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("activity");
  const [loading, setLoading] = useState(true);
  const [notifs, setNotifs] = useState([]);
  const [taskById, setTaskById] = useState({});
  const [projectById, setProjectById] = useState({});
  const [profilesById, setProfilesById] = useState({});
  const [assignedToMe, setAssignedToMe] = useState([]);
  const [assignedByMe, setAssignedByMe] = useState([]);

  useEffect(() => { if (user) loadAll(); /* eslint-disable-next-line */ }, [user?.id]);

  async function loadAll() {
    setLoading(true);
    const taskCols = "id,title,project_id,due_date,assignee_id,created_by,updated_at,status";
    const [{ data: nRows }, { data: toMe }, { data: byMe }] = await Promise.all([
      supabase.from("notifications").select("*").eq("user_id", user.id).order("created_at", { ascending: false }).limit(200),
      supabase.from("tasks").select(taskCols).eq("assignee_id", user.id).not("project_id", "is", null).neq("status", "done").neq("status", "cancelled").order("updated_at", { ascending: false }).limit(200),
      supabase.from("tasks").select(taskCols).eq("created_by", user.id).not("assignee_id", "is", null).neq("assignee_id", user.id).not("project_id", "is", null).neq("status", "done").neq("status", "cancelled").order("updated_at", { ascending: false }).limit(200),
    ]);
    const notifsData = nRows || [];
    const tById = {};
    (toMe || []).forEach(t => { tById[t.id] = t; });
    (byMe || []).forEach(t => { tById[t.id] = t; });
    const notifTaskIds = notifsData.filter(n => n.entity_type === "task" && n.entity_id).map(n => n.entity_id);
    const missing = [...new Set(notifTaskIds)].filter(id => !tById[id]);
    if (missing.length) {
      const { data: extra } = await supabase.from("tasks").select(taskCols).in("id", missing);
      (extra || []).forEach(t => { tById[t.id] = t; });
    }
    const projIds = [...new Set(Object.values(tById).map(t => t.project_id).filter(Boolean))];
    const pById = {};
    if (projIds.length) {
      const { data: pr } = await supabase.from("projects").select("id,name").in("id", projIds);
      (pr || []).forEach(p => { pById[p.id] = p; });
    }
    const actorIds = [...new Set([...notifsData.map(n => n.actor_id).filter(Boolean), ...Object.values(tById).map(t => t.assignee_id).filter(Boolean)])];
    const prById = {};
    if (actorIds.length) {
      const { data: pf } = await supabase.from("profiles").select("id,display_name,email").in("id", actorIds);
      (pf || []).forEach(p => { prById[p.id] = p; });
    }
    setNotifs(notifsData); setTaskById(tById); setProjectById(pById); setProfilesById(prById);
    setAssignedToMe(toMe || []); setAssignedByMe(byMe || []);
    setLoading(false);
  }

  const uname = (id) => profilesById[id]?.display_name || profilesById[id]?.email || "someone";
  const unreadCount = notifs.filter(n => !n.is_read).length;

  const markRead = async (id) => {
    setNotifs(p => p.map(n => n.id === id ? { ...n, is_read: true } : n));
    await supabase.from("notifications").update({ is_read: true, read_at: new Date().toISOString() }).eq("org_id", orgId).eq("id", id);
  };
  const markAllRead = async () => {
    setNotifs(p => p.map(n => ({ ...n, is_read: true })));
    await supabase.from("notifications").update({ is_read: true, read_at: new Date().toISOString() }).eq("org_id", orgId).eq("user_id", user.id).eq("is_read", false);
  };

  const items = useMemo(() => {
    const taskItem = (t, mode) => {
      const p = projectById[t.project_id];
      return {
        key: mode + t.id, kind: "task", taskId: t.id, projectId: t.project_id, projectName: p?.name || "—",
        icon: mode === "to_me" ? "👤" : "➦", color: "#3b82f6",
        title: t.title, sub: mode === "to_me" ? "Assigned to you" : `You assigned this to ${uname(t.assignee_id)}`,
        due: t.due_date ? new Date(t.due_date).getTime() : null, dueStr: t.due_date,
        ts: new Date(t.updated_at || Date.now()).getTime(), read: true, iconLabel: mode === "to_me" ? "Assigned to me" : "Assigned by me",
      };
    };
    const notifItem = (n) => {
      const t = n.entity_type === "task" && n.entity_id ? taskById[n.entity_id] : null;
      const p = t ? projectById[t.project_id] : null;
      const cfg = TYPE_CONFIG[n.type] || TYPE_CONFIG.system;
      return {
        key: "n" + n.id, kind: "notif", notifId: n.id, taskId: t?.id || (n.entity_type === "task" ? n.entity_id : null),
        link: n.link, projectId: t?.project_id, projectName: p?.name || null,
        icon: cfg.icon, color: cfg.color, iconLabel: cfg.label,
        title: n.title, sub: n.body, actorId: n.actor_id,
        due: t?.due_date ? new Date(t.due_date).getTime() : null, dueStr: t?.due_date,
        ts: new Date(n.created_at).getTime(), read: n.is_read,
      };
    };
    let list;
    if (filter === "assigned_to_me") list = assignedToMe.map(t => taskItem(t, "to_me"));
    else if (filter === "assigned_by_me") list = assignedByMe.map(t => taskItem(t, "by_me"));
    else {
      let ns = notifs;
      if (filter === "unread") ns = ns.filter(n => !n.is_read);
      if (filter === "mentions") ns = ns.filter(n => n.type === "mention" || n.category === "mention");
      list = ns.map(notifItem);
    }
    if (sort === "activity") list = [...list].sort((a, b) => b.ts - a.ts);
    else if (sort === "due") list = [...list].sort((a, b) => (a.due || 8.64e15) - (b.due || 8.64e15));
    else if (sort === "project") list = [...list].sort((a, b) => (a.projectName || "~~~").localeCompare(b.projectName || "~~~") || b.ts - a.ts);
    return list;
  }, [filter, sort, notifs, assignedToMe, assignedByMe, taskById, projectById, profilesById]);

  const openItem = (it) => {
    if (it.kind === "notif" && it.notifId && !it.read) markRead(it.notifId);
    if (it.taskId) setActive("projects", it.taskId);
    else if (it.link) setActive(it.link);
  };

  const grouped = useMemo(() => {
    if (sort !== "project") return null;
    const g = {};
    items.forEach(it => { const k = it.projectName || "No project"; (g[k] = g[k] || []).push(it); });
    return Object.entries(g);
  }, [items, sort]);

  const chip = (active) => ({
    padding: "6px 12px", borderRadius: 8, fontSize: 12.5, fontWeight: active ? 700 : 500, cursor: "pointer",
    background: active ? T.accent : T.surface2, color: active ? "#fff" : T.text2, border: `1px solid ${active ? T.accent : T.border}`, whiteSpace: "nowrap",
  });

  const Row = ({ it }) => (
    <div onClick={() => openItem(it)} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "12px 16px", borderBottom: `1px solid ${T.border}`, cursor: "pointer", background: it.read ? "transparent" : T.accentDim + "26", transition: "background 0.1s" }}
      onMouseEnter={e => e.currentTarget.style.background = T.surface2}
      onMouseLeave={e => e.currentTarget.style.background = it.read ? "transparent" : T.accentDim + "26"}>
      <div style={{ width: 34, height: 34, borderRadius: 9, background: it.color + "20", border: `1px solid ${it.color}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>{it.icon}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: it.read ? 500 : 700, color: T.text, lineHeight: 1.4 }}>{it.title}</div>
        {it.sub && <div style={{ fontSize: 12, color: T.text3, lineHeight: 1.4, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.sub}</div>}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
          <span style={{ fontSize: 10, color: it.color, fontWeight: 700 }}>{it.iconLabel}</span>
          {it.projectName && <><span style={{ color: T.text3, fontSize: 10 }}>·</span><span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 7, background: T.surface3, color: T.text3, fontWeight: 600 }}>◫ {it.projectName}</span></>}
          {it.dueStr && <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 7, background: isOverdue(it.dueStr) ? T.redDim : T.surface3, color: isOverdue(it.dueStr) ? T.red : T.text3, fontWeight: 600 }}>📅 {dateStr(it.dueStr)}</span>}
          <span style={{ color: T.text3, fontSize: 10 }}>·</span>
          <span style={{ fontSize: 10, color: T.text3 }}>{relTime(it.ts)}</span>
        </div>
      </div>
      {!it.read && <div style={{ width: 8, height: 8, borderRadius: "50%", background: T.accent, flexShrink: 0, marginTop: 6 }} />}
    </div>
  );

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", height: "100%", overflow: "hidden", background: T.bg }}>
      {/* Header */}
      <div style={{ padding: "18px 24px 0", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: T.text }}>Inbox</h1>
            {unreadCount > 0 && <span style={{ fontSize: 12, color: T.accent, fontWeight: 700 }}>{unreadCount} unread</span>}
          </div>
          {unreadCount > 0 && <button onClick={markAllRead} style={{ fontSize: 12, color: T.accent, background: "none", border: `1px solid ${T.border}`, borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontWeight: 600 }}>Mark all read</button>}
        </div>
        {/* Toolbar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, paddingBottom: 14, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {FILTERS.map(f => <button key={f.key} onClick={() => setFilter(f.key)} style={chip(filter === f.key)}>{f.label}</button>)}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 11, color: T.text3, fontWeight: 600 }}>Sort:</span>
            <select value={sort} onChange={e => setSort(e.target.value)} style={{ fontSize: 12, padding: "6px 10px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, cursor: "pointer", outline: "none", fontWeight: 600 }}>
              {SORTS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflow: "auto", borderTop: `1px solid ${T.border}`, background: T.surface }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: "center", color: T.text3, fontSize: 13 }}>Loading your inbox…</div>
        ) : items.length === 0 ? (
          <div style={{ padding: "60px 20px", textAlign: "center", color: T.text3 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: T.text2 }}>{filter === "unread" ? "No unread items" : filter === "mentions" ? "No mentions" : "Nothing here"}</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>You're all caught up.</div>
          </div>
        ) : sort === "project" && grouped ? (
          grouped.map(([proj, its]) => (
            <div key={proj}>
              <div style={{ position: "sticky", top: 0, zIndex: 1, padding: "8px 16px", background: T.surface2, borderBottom: `1px solid ${T.border}`, fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.5 }}>◫ {proj} <span style={{ color: T.text3, opacity: 0.7 }}>· {its.length}</span></div>
              {its.map(it => <Row key={it.key} it={it} />)}
            </div>
          ))
        ) : (
          items.map(it => <Row key={it.key} it={it} />)
        )}
      </div>
    </div>
  );
}
