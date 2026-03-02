"use client";
import { useState, useEffect } from "react";
import { T } from "./tokens";
import { useAuth } from "./lib/auth";
import AuthPage from "./components/AuthPage";
import Sidebar, { NAV_ITEMS } from "./components/Sidebar";
import DashboardView from "./components/Dashboard";
import ProjectsView from "./components/Projects";
import OKRsView from "./components/OKRs";
import MessagesView from "./components/Messages";
import DocsView from "./components/Docs";
import CalendarView from "./components/Calendar";
import CallsView from "./components/Calls";
import CampaignsView from "./components/Campaigns";
import PLMView from "./components/PLM";
import AutomationView from "./components/Automation";
import ReportsView from "./components/Reports";
import SettingsView from "./components/Settings";
import CommandPalette from "./components/CommandPalette";
import NotificationBell from "./components/NotificationBell";

export default function HelmApp() {
  const { user, profile, loading: authLoading, signOut } = useAuth();
  const [active, setActive] = useState("dashboard");
  const [expanded, setExpanded] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  useEffect(() => {
    const fn = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setCmdOpen(p => !p); }
      if (e.key === "?" && !e.target.matches("input,textarea,select")) { e.preventDefault(); setShowShortcuts(p => !p); }
    };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, []);

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
      case "settings": return <SettingsView />;
      default: return <DashboardView setActive={setActive} />;
    }
  };

  const viewTitle = NAV_ITEMS.find(n => n.key === active)?.label || "Home";

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
        <Sidebar active={active} setActive={setActive} expanded={expanded} setExpanded={setExpanded} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ height: 44, borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", padding: "0 20px", gap: 12, flexShrink: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{viewTitle}</span>
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
            {renderView()}
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
              { keys: "Esc", desc: "Close panel / modal / cancel" },
              { keys: "Enter", desc: "Save / confirm" },
              { keys: "↑ ↓", desc: "Navigate search results" },
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
