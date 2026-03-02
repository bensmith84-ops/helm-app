"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";
import { useAuth } from "../lib/auth";

const AVATAR_COLORS = ["#3b82f6","#a855f7","#ec4899","#06b6d4","#f97316","#22c55e","#84cc16","#ef4444"];
const acol = (uid) => uid ? AVATAR_COLORS[uid.charCodeAt(uid.length - 1) % AVATAR_COLORS.length] : T.text3;

export default function PeopleView() {
  const { user, profile } = useAuth();
  const [members, setMembers] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: m }, { data: t }, { data: p }] = await Promise.all([
        supabase.from("profiles").select("*"),
        supabase.from("tasks").select("id, title, status, priority, assignee_id, project_id, due_date").is("deleted_at", null),
        supabase.from("projects").select("id, name, color").is("deleted_at", null),
      ]);
      setMembers(m || []);
      setTasks(t || []);
      setProjects(p || []);
      setLoading(false);
    })();
  }, []);

  const ini = (name) => name ? name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() : "?";

  const getStats = (uid) => {
    const userTasks = tasks.filter(t => t.assignee_id === uid);
    const open = userTasks.filter(t => t.status !== "done").length;
    const done = userTasks.filter(t => t.status === "done").length;
    const overdue = userTasks.filter(t => t.due_date && new Date(t.due_date) < new Date() && t.status !== "done").length;
    const projs = [...new Set(userTasks.map(t => t.project_id).filter(Boolean))];
    return { open, done, total: userTasks.length, overdue, projs };
  };

  const filtered = members.filter(m => {
    if (!search) return true;
    return m.display_name?.toLowerCase().includes(search.toLowerCase()) ||
           m.email?.toLowerCase().includes(search.toLowerCase());
  });

  if (loading) return <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: T.text3, fontSize: 13 }}>Loading team…</div>;

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <div style={{ flex: 1, overflow: "auto", padding: "28px 32px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 4 }}>Team</h1>
            <p style={{ fontSize: 12, color: T.text3 }}>{members.length} member{members.length !== 1 ? "s" : ""}</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", borderRadius: 8, background: T.surface2, border: `1px solid ${T.border}` }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search team…"
              style={{ background: "transparent", border: "none", outline: "none", color: T.text, fontSize: 12, width: 140, fontFamily: "inherit" }} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 12 }}>
          {filtered.map(member => {
            const c = acol(member.id);
            const stats = getStats(member.id);
            const sel = selected?.id === member.id;
            const isMe = member.id === user?.id;
            return (
              <div key={member.id} onClick={() => setSelected(member)} style={{
                padding: "18px 20px", borderRadius: 12, cursor: "pointer",
                background: sel ? `${T.accent}08` : T.surface,
                border: `1px solid ${sel ? T.accent + "40" : T.border}`,
                transition: "border-color 0.15s",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: 20, background: `${c}18`,
                    border: `2px solid ${c}50`, display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 14, fontWeight: 700, color: c, flexShrink: 0,
                  }}>{ini(member.display_name)}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ fontSize: 14, fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{member.display_name || "Unknown"}</span>
                      {isMe && <span style={{ fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 4, background: `${T.accent}20`, color: T.accent }}>You</span>}
                    </div>
                    <div style={{ fontSize: 11, color: T.text3, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{member.email || "—"}</div>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  <div style={{ textAlign: "center", padding: "6px 0", background: T.surface2, borderRadius: 6 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>{stats.open}</div>
                    <div style={{ fontSize: 9, color: T.text3 }}>Open</div>
                  </div>
                  <div style={{ textAlign: "center", padding: "6px 0", background: T.surface2, borderRadius: 6 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: T.green }}>{stats.done}</div>
                    <div style={{ fontSize: 9, color: T.text3 }}>Done</div>
                  </div>
                  <div style={{ textAlign: "center", padding: "6px 0", background: T.surface2, borderRadius: 6 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: stats.overdue > 0 ? "#ef4444" : T.text3 }}>{stats.overdue}</div>
                    <div style={{ fontSize: 9, color: T.text3 }}>Overdue</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Member detail */}
      {selected && (() => {
        const c = acol(selected.id);
        const stats = getStats(selected.id);
        const memberTasks = tasks.filter(t => t.assignee_id === selected.id && t.status !== "done")
          .sort((a, b) => {
            if (!a.due_date && !b.due_date) return 0;
            if (!a.due_date) return 1;
            if (!b.due_date) return -1;
            return new Date(a.due_date) - new Date(b.due_date);
          }).slice(0, 12);
        const memberProjs = stats.projs.map(pid => projects.find(p => p.id === pid)).filter(Boolean);
        return (
          <div style={{ width: 360, borderLeft: `1px solid ${T.border}`, background: T.surface, flexShrink: 0, overflow: "auto" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: `1px solid ${T.border}` }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: T.text3 }}>Member Details</span>
              <button onClick={() => setSelected(null)} style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text3, cursor: "pointer", width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>×</button>
            </div>
            <div style={{ padding: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20 }}>
                <div style={{ width: 52, height: 52, borderRadius: 26, background: `${c}18`, border: `2px solid ${c}50`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, color: c }}>{ini(selected.display_name)}</div>
                <div>
                  <div style={{ fontSize: 18, fontWeight: 700 }}>{selected.display_name || "Unknown"}</div>
                  <div style={{ fontSize: 12, color: T.text3, marginTop: 2 }}>{selected.email}</div>
                </div>
              </div>

              {/* Stats */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8, marginBottom: 20 }}>
                {[
                  { l: "Total", v: stats.total, c: T.text },
                  { l: "Open", v: stats.open, c: T.accent },
                  { l: "Done", v: stats.done, c: T.green },
                  { l: "Overdue", v: stats.overdue, c: stats.overdue > 0 ? "#ef4444" : T.text3 },
                ].map(s => (
                  <div key={s.l} style={{ textAlign: "center", padding: "8px 0", background: T.surface2, borderRadius: 8 }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: s.c }}>{s.v}</div>
                    <div style={{ fontSize: 9, color: T.text3, marginTop: 2 }}>{s.l}</div>
                  </div>
                ))}
              </div>

              {/* Projects */}
              {memberProjs.length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.text3, marginBottom: 8 }}>Projects</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {memberProjs.map(p => (
                      <span key={p.id} style={{ fontSize: 11, padding: "3px 10px", borderRadius: 6, background: `${p.color || T.accent}15`, color: p.color || T.accent, fontWeight: 600 }}>{p.name}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Open tasks */}
              <div style={{ fontSize: 12, fontWeight: 700, color: T.text3, marginBottom: 8 }}>Open Tasks</div>
              {memberTasks.length === 0 && <div style={{ fontSize: 12, color: T.text3, padding: 8 }}>No open tasks</div>}
              {memberTasks.map(t => {
                const proj = projects.find(p => p.id === t.project_id);
                const isOverdue = t.due_date && new Date(t.due_date) < new Date();
                return (
                  <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 6, background: T.surface2, marginBottom: 4, border: `1px solid ${T.border}` }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                      <div style={{ fontSize: 10, color: T.text3, marginTop: 1 }}>{proj?.name || "—"} · {t.status.replace("_", " ")}</div>
                    </div>
                    {t.due_date && <span style={{ fontSize: 10, fontWeight: 600, color: isOverdue ? "#ef4444" : T.text3, flexShrink: 0 }}>{new Date(t.due_date + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
