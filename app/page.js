"use client";
import { useState, useEffect } from "react";
import { T } from "./tokens";
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
import CommandPalette from "./components/CommandPalette";

export default function HelmApp() {
  const [active, setActive] = useState("dashboard");
  const [expanded, setExpanded] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);

  useEffect(() => {
    const fn = (e) => { if ((e.metaKey || e.ctrlKey) && e.key === "k") { e.preventDefault(); setCmdOpen(p => !p); } };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, []);

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
          </div>
          <div style={{ flex: 1, overflow: "auto" }}>
            {renderView()}
          </div>
        </div>
      </div>
      <CommandPalette open={cmdOpen} onClose={() => setCmdOpen(false)} setActive={setActive} />
    </>
  );
}
