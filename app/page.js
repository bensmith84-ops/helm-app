"use client";
import { useState, useEffect, Suspense, lazy, Component } from "react";
import { T } from "./tokens";
import { supabase } from "./lib/supabase";
import { useAuth } from "./lib/auth";
import AuthPage from "./components/AuthPage";
import Sidebar, { NAV_ITEMS } from "./components/Sidebar";
import DashboardView from "./components/Dashboard";
import CommandPalette from "./components/CommandPalette";
import NotificationBell from "./components/NotificationBell";

// Lazy load all non-dashboard views
const ProjectsView = lazy(() => import("./components/Projects"));
const OKRsView = lazy(() => import("./components/OKRs"));
const MessagesView = lazy(() => import("./components/Messages"));
const DocsView = lazy(() => import("./components/Docs"));
const CalendarView = lazy(() => import("./components/Calendar"));
const CallsView = lazy(() => import("./components/Calls"));
const CampaignsView = lazy(() => import("./components/Campaigns"));
const PLMView = lazy(() => import("./components/PLM"));
const AutomationView = lazy(() => import("./components/Automation"));
const ReportsView = lazy(() => import("./components/Reports"));
const SettingsView = lazy(() => import("./components/Settings"));
const PeopleView = lazy(() => import("./components/People"));
const ActivityView = lazy(() => import("./components/Activity"));

const LazyFallback = () => (
  <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: T.text3, fontSize: 13 }}>Loading…</div>
);

class ChunkErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error) {
    if (error?.name === "ChunkLoadError") { window.location.reload(); }
  }
  render() {
    if (this.state.hasError) return (
      <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12, color: "#94a3b8" }}>
        <div style={{ fontSize: 14 }}>Something went wrong loading this page.</div>
        <button onClick={() => window.location.reload()} style={{ padding: "8px 16px", fontSize: 13, borderRadius: 6, border: "none", background: "#3b82f6", color: "#fff", cursor: "pointer" }}>Reload</button>
      </div>
    );
    return this.props.children;
  }
}

export default function HelmApp() {
  const { user, profile, loading: authLoading, signOut } = useAuth();
  const [active, setActive] = useState("dashboard");
  const [expanded, setExpanded] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [badges, setBadges] = useState({});

  useEffect(() => {
    let gPressed = false; let gTimer = null;
    const fn = (e) => {
      const isInput = e.target.matches("input,textarea,select,[contenteditable]");
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setCmdOpen(p => !p); return; }
      if (isInput) return;
      if (e.key === "?") { e.preventDefault(); setShowShortcuts(p => !p); return; }
      // G+key navigation (press G then a letter)
      if (e.key === "g" || e.key === "G") { gPressed = true; clearTimeout(gTimer); gTimer = setTimeout(() => { gPressed = false; }, 800); return; }
      if (gPressed) {
        gPressed = false;
        const navMap = { d: "dashboard", p: "projects", o: "okrs", m: "messages", c: "calendar", r: "reports", s: "settings" };
        if (navMap[e.key]) { e.preventDefault(); setActive(navMap[e.key]); return; }
      }
      // Number shortcuts: 1-9 for sidebar items
      const num = parseInt(e.key);
      if (num >= 1 && num <= 9) {
        const items = NAV_ITEMS.filter(n => n.key !== "settings");
        if (items[num - 1]) { setActive(items[num - 1].key); }
      }
    };
    document.addEventListener("keydown", fn);
    return () => { document.removeEventListener("keydown", fn); clearTimeout(gTimer); };
  }, []);

  // Load sidebar badge counts
  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const now = new Date().toISOString().split("T")[0];
        const [{ count: overdue }, { count: notifCount }] = await Promise.all([
          supabase.from("tasks").select("id", { count: "exact", head: true }).is("deleted_at", null).lt("due_date", now).neq("status", "done"),
          supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", user.id).eq("is_read", false),
        ]);
        setBadges(b => ({
          ...b,
          projects: overdue > 0 ? overdue : null,
        }));
      } catch (e) { console.warn("Badge count fetch failed:", e); }
    })();
  }, [user?.id, active]);

  if (authLoading) return (
    <div style={{ display: "flex", height: "100vh", width: "100vw", alignItems: "center", justifyContent: "center", background: T.bg }}>
      <div style={{ color: T.text3, fontSize: 13 }}>Loading…</div>
    </div>
  );

  if (!user) return <AuthPage />;

  const renderView = () => {
    switch (active) {
      case "dashboard": return <DashboardView setActive={setActive} />;
      case "projects": return <ProjectsView />;
      case "okrs": return <OKRsView />;
      case "messages": return <MessagesView />;
      case "docs": return <DocsView />;
      case "calendar": return <CalendarView />;
      case "calls": return <CallsView />;
      case "campaigns": return <CampaignsView />;
      case "plm": return <PLMView />;
      case "automation": return <AutomationView />;
      case "reports": return <ReportsView />;
      case "people": return <PeopleView />;
      case "activity": return <ActivityView />;
      case "settings": return <SettingsView />;
      default: return <DashboardView setActive={setActive} />;
    }
  };

  const activeNav = NAV_ITEMS.find(n => n.key === active);
  const viewTitle = activeNav?.label || "Home";
  const viewIcon = activeNav?.icon || "⬡";

  return (
    <>
      <style>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body, #root { background: ${T.bg}; color: ${T.text}; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${T.border2}; border-radius: 3px; }
        button:hover { opacity: 0.85; }
      `}</style>
      <div style={{ display: "flex", height: "100vh", width: "100vw", overflow: "hidden", background: T.bg }}>
        <Sidebar active={active} setActive={setActive} expanded={expanded} setExpanded={setExpanded} badges={badges} profile={profile} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ height: 44, borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", padding: "0 20px", gap: 12, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 14, color: T.text3 }}>{viewIcon}</span>
              <span style={{ fontSize: 13, fontWeight: 600 }}>{viewTitle}</span>
            </div>
            <div style={{ flex: 1 }} />
            <div onClick={() => setCmdOpen(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 6, background: T.surface2, border: `1px solid ${T.border}`, fontSize: 12, color: T.text3, cursor: "pointer" }}>
              ⌘K Search...
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <NotificationBell setActive={setActive} />
              <span style={{ fontSize: 12, color: T.text2, fontWeight: 500 }}>{profile?.display_name || user?.email?.split("@")[0]}</span>
              <button onClick={signOut} title="Sign out" style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, cursor: "pointer", color: T.text3, fontSize: 11, padding: "5px 10px", fontWeight: 600 }}>Sign out</button>
            </div>
          </div>
          <div style={{ flex: 1, overflow: "auto" }}>
            <ChunkErrorBoundary>
              <Suspense fallback={<LazyFallback />}>
                {renderView()}
              </Suspense>
            </ChunkErrorBoundary>
          </div>
        </div>
      </div>
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} setActive={setActive} />
      {showShortcuts && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={() => setShowShortcuts(false)}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} />
          <div onClick={e => e.stopPropagation()} style={{ position: "relative", width: 420, background: T.surface, borderRadius: 14, border: `1px solid ${T.border}`, padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,0.5)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800 }}>Keyboard Shortcuts</h2>
              <button onClick={() => setShowShortcuts(false)} style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, cursor: "pointer", color: T.text3, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>×</button>
            </div>
            {[
              { keys: "⌘ K", desc: "Open command palette" },
              { keys: "?", desc: "Show keyboard shortcuts" },
              { keys: "1-9", desc: "Switch to module by number" },
              { keys: "G D", desc: "Go to Dashboard" },
              { keys: "G P", desc: "Go to Projects" },
              { keys: "G O", desc: "Go to OKRs" },
              { keys: "G M", desc: "Go to Messages" },
              { keys: "G C", desc: "Go to Calendar" },
              { keys: "G R", desc: "Go to Reports" },
              { keys: "G S", desc: "Go to Settings" },
              { keys: "Esc", desc: "Close panel / modal / cancel" },
            ].map(s => (
              <div key={s.keys} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: `1px solid ${T.border}` }}>
                <span style={{ fontSize: 13, color: T.text2 }}>{s.desc}</span>
                <kbd style={{ padding: "3px 10px", borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface2, fontSize: 11, color: T.text3, fontFamily: "monospace", fontWeight: 600 }}>{s.keys}</kbd>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
