"use client";
import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";
import { useAuth } from "../lib/auth";
import { notifySlack } from "../lib/slack";

const TYPE_CONFIG = {
  okr_deadline:   { icon:"◎", color:"#f97316", label:"OKR Deadline" },
  task_overdue:   { icon:"☐", color:"#ef4444", label:"Overdue Task" },
  plm_stage:      { icon:"⬢", color:"#8b5cf6", label:"PLM Update" },
  approval:       { icon:"⏳", color:"#eab308", label:"Approval Needed" },
  mention:        { icon:"💬", color:"#3b82f6", label:"Mention" },
  system:         { icon:"🔔", color:"#22c55e", label:"System" },
  sheets_sync:    { icon:"📊", color:"#22c55e", label:"Sync Complete" },
};

const relTime = (d) => {
  const diff = Date.now() - new Date(d).getTime();
  if (diff < 60000)     return "just now";
  if (diff < 3600000)   return `${Math.floor(diff/60000)}m ago`;
  if (diff < 86400000)  return `${Math.floor(diff/3600000)}h ago`;
  if (diff < 604800000) return `${Math.floor(diff/86400000)}d ago`;
  return new Date(d).toLocaleDateString("en-US",{month:"short",day:"numeric"});
};

export default function NotificationBell({ setActive }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef(null);

  const unread = notifications.filter(n => !n.is_read).length;

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    if (!user) return;
    loadNotifications();

    // Subscribe to new notifications
    const channel = supabase.channel("notifications")
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "notifications",
        filter: `user_id=eq.${user.id}`
      }, payload => {
        setNotifications(p => [payload.new, ...p]);
      }).subscribe();

    return () => supabase.removeChannel(channel);
  }, [user]);

  // Auto-generate notifications for overdue tasks and OKR deadlines
  useEffect(() => {
    if (!user) return;
    generateNotifications();
  }, [user]);

  const loadNotifications = async () => {
    setLoading(true);
    const { data } = await supabase.from("notifications")
      .select("*").eq("user_id", user.id)
      .order("created_at", { ascending: false }).limit(30);
    setNotifications(data || []);
    setLoading(false);
  };

  const generateNotifications = async () => {
    const today = new Date().toISOString().split("T")[0];
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();

    // Check for overdue tasks assigned to me
    const { data: overdueTasks } = await supabase.from("tasks")
      .select("id,title,due_date").eq("assignee_id", user.id)
      .lt("due_date", today).neq("status","done").neq("status","cancelled")
      .limit(5);

    for (const task of (overdueTasks || [])) {
      const daysLate = Math.ceil((new Date() - new Date(task.due_date)) / 86400000);
      const { data: existing } = await supabase.from("notifications")
        .select("id").eq("user_id", user.id).eq("type", "task_overdue")
        .eq("entity_id", task.id).gte("created_at", new Date(Date.now() - 86400000).toISOString())
        .maybeSingle();
      if (!existing) {
        await supabase.from("notifications").insert({
          user_id: user.id, type:"task_overdue",
          title: `Task overdue: ${task.title}`,
          body: `${daysLate} day${daysLate!==1?"s":""} late`,
          entity_type: "task", entity_id: task.id, link: "projects",
        });
        notifySlack({
          type: "task", title: `Task overdue: ${task.title}`,
          message: `${daysLate} day${daysLate!==1?"s":""} late`,
          channel: "ben", url: "https://helm-app-six.vercel.app",
          fields: [{ label: "Days Late", value: String(daysLate) }],
        });
      }
    }

    // Check for KRs I own that haven't been checked in for 7+ days
    const { data: myKRs } = await supabase.from("key_results")
      .select("id,title,progress").eq("owner_id", user.id).is("deleted_at", null);

    if (myKRs?.length) {
      const { data: recentCIs } = await supabase.from("okr_check_ins")
        .select("key_result_id,created_at")
        .in("key_result_id", myKRs.map(k => k.id))
        .gte("created_at", weekAgo);
      const recentKRIds = new Set((recentCIs || []).map(c => c.key_result_id));

      for (const kr of myKRs) {
        if (!recentKRIds.has(kr.id)) {
          // Check if we already sent this nudge recently
          const { data: existing } = await supabase.from("notifications")
            .select("id").eq("user_id", user.id).eq("type", "okr_deadline")
            .eq("entity_id", kr.id).gte("created_at", new Date(Date.now() - 86400000 * 3).toISOString())
            .maybeSingle();
          if (!existing) {
            await supabase.from("notifications").insert({
              user_id: user.id, type: "okr_deadline",
              title: `Check-in needed: ${kr.title}`,
              body: `No update in 7+ days — team needs visibility on this KR`,
              entity_type: "key_result", entity_id: kr.id, link: "okrs",
            });
          }
        }
      }
    }

    loadNotifications();
  };

  const markRead = async (id) => {
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
    setNotifications(p => p.map(n => n.id === id ? {...n, is_read: true} : n));
  };

  const markAllRead = async () => {
    await supabase.from("notifications").update({ is_read: true }).eq("user_id", user.id).eq("is_read", false);
    setNotifications(p => p.map(n => ({...n, is_read: true})));
  };

  const deleteNotif = async (id, e) => {
    e.stopPropagation();
    await supabase.from("notifications").delete().eq("id", id);
    setNotifications(p => p.filter(n => n.id !== id));
  };

  return (
    <div ref={ref} style={{ position:"relative" }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width:36, height:36, borderRadius:9, background: open ? T.accentDim : "transparent",
        border: open ? `1px solid ${T.accent}40` : "1px solid transparent",
        cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center",
        position:"relative", transition:"all 0.15s",
      }}>
        <span style={{ fontSize:18, filter: unread>0?"none":"opacity(0.6)" }}>🔔</span>
        {unread > 0 && (
          <div style={{
            position:"absolute", top:4, right:4, minWidth:16, height:16,
            borderRadius:8, background:"#ef4444", color:"#fff",
            fontSize:9, fontWeight:800, display:"flex", alignItems:"center", justifyContent:"center",
            padding:"0 3px", lineHeight:1,
          }}>{unread > 9 ? "9+" : unread}</div>
        )}
      </button>

      {open && (
        <div style={{
          position:"absolute", top:"calc(100% + 8px)", right:0, width:380, maxHeight:520,
          background:T.surface, border:`1px solid ${T.border}`, borderRadius:12,
          boxShadow:"0 16px 48px #00000060", zIndex:500, display:"flex", flexDirection:"column",
          overflow:"hidden",
        }}>
          {/* Header */}
          <div style={{ padding:"14px 16px", borderBottom:`1px solid ${T.border}`, display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
            <div style={{ fontSize:14, fontWeight:700 }}>Notifications {unread>0&&<span style={{ fontSize:11, color:T.accent, marginLeft:4 }}>{unread} new</span>}</div>
            {unread > 0 && (
              <button onClick={markAllRead} style={{ fontSize:11, color:T.accent, background:"none", border:"none", cursor:"pointer", fontWeight:600 }}>Mark all read</button>
            )}
          </div>

          {/* List */}
          <div style={{ overflowY:"auto", flex:1 }}>
            {loading && <div style={{ padding:20, textAlign:"center", color:T.text3, fontSize:12 }}>Loading…</div>}
            {!loading && notifications.length === 0 && (
              <div style={{ padding:"32px 16px", textAlign:"center", color:T.text3 }}>
                <div style={{ fontSize:28, marginBottom:8 }}>🔔</div>
                <div style={{ fontSize:13 }}>You're all caught up!</div>
              </div>
            )}
            {notifications.map(n => {
              const cfg = TYPE_CONFIG[n.type] || TYPE_CONFIG.system;
              return (
                <div key={n.id} onClick={() => { markRead(n.id); if(n.link) setActive(n.link); setOpen(false); }}
                  style={{
                    padding:"12px 16px", borderBottom:`1px solid ${T.border}`, cursor:"pointer",
                    background: n.is_read ? "transparent" : T.accentDim+"30",
                    display:"flex", gap:12, alignItems:"flex-start", transition:"background 0.1s",
                  }}
                  onMouseEnter={e=>e.currentTarget.style.background=T.surface2}
                  onMouseLeave={e=>e.currentTarget.style.background=n.is_read?"transparent":T.accentDim+"30"}>
                  <div style={{ width:34, height:34, borderRadius:9, background:cfg.color+"20", border:`1px solid ${cfg.color}40`,
                    display:"flex", alignItems:"center", justifyContent:"center", fontSize:16, flexShrink:0 }}>
                    {cfg.icon}
                  </div>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:13, fontWeight:n.is_read?400:600, color:T.text, lineHeight:1.4, marginBottom:2 }}>{n.title}</div>
                    {n.body && <div style={{ fontSize:11, color:T.text3, lineHeight:1.4 }}>{n.body}</div>}
                    <div style={{ fontSize:10, color:T.text3, marginTop:4, display:"flex", alignItems:"center", gap:6 }}>
                      <span style={{ color:cfg.color, fontWeight:600 }}>{cfg.label}</span>
                      <span>·</span>
                      <span>{relTime(n.created_at)}</span>
                    </div>
                  </div>
                  <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:4, flexShrink:0 }}>
                    {!n.is_read && <div style={{ width:8, height:8, borderRadius:"50%", background:T.accent }} />}
                    <button onClick={e => deleteNotif(n.id, e)} style={{ background:"none", border:"none", color:T.text3, cursor:"pointer", fontSize:12, opacity:0.5, padding:0 }}>✕</button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{ padding:"10px 16px", borderTop:`1px solid ${T.border}`, flexShrink:0, display:"flex", justifyContent:"center" }}>
            <button onClick={() => { setActive("activity"); setOpen(false); }}
              style={{ fontSize:12, color:T.accent, background:"none", border:"none", cursor:"pointer", fontWeight:500 }}>
              View all activity →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
