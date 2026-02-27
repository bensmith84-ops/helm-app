"use client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";

// ─── DESIGN TOKENS ───
const T = {
  bg: "#08090b",
  surface: "#0f1117",
  surface2: "#161922",
  surface3: "#1c2030",
  surface4: "#232838",
  border: "#242a38",
  border2: "#2f3748",
  text: "#e6e9f0",
  text2: "#8b93a8",
  text3: "#5a6380",
  accent: "#3b82f6",
  accentHover: "#60a5fa",
  accentDim: "#1d3a6a",
  green: "#22c55e",
  greenDim: "#0d3a20",
  yellow: "#eab308",
  yellowDim: "#3d3000",
  red: "#ef4444",
  redDim: "#3d1111",
  orange: "#f97316",
  purple: "#a855f7",
  purpleDim: "#2d1854",
  cyan: "#06b6d4",
  pink: "#ec4899",
  lime: "#84cc16",
};

// ─── DEMO DATA ───
const USERS = [
  { id: "u1", name: "Ben Harper", avatar: "BH", role: "CEO", email: "ben@helm.io" },
  { id: "u2", name: "Sarah Chen", avatar: "SC", role: "VP Engineering", email: "sarah@helm.io" },
  { id: "u3", name: "Alex Rivera", avatar: "AR", role: "Product Manager", email: "alex@helm.io" },
  { id: "u4", name: "Maya Patel", avatar: "MP", role: "Lead Designer", email: "maya@helm.io" },
  { id: "u5", name: "James Wilson", avatar: "JW", role: "Sr. Engineer", email: "james@helm.io" },
  { id: "u6", name: "Lisa Zhang", avatar: "LZ", role: "R&D Director", email: "lisa@helm.io" },
  { id: "u7", name: "Tom Brooks", avatar: "TB", role: "Marketing Lead", email: "tom@helm.io" },
  { id: "u8", name: "Emma Scott", avatar: "ES", role: "QA Manager", email: "emma@helm.io" },
];

const getUser = (id) => USERS.find((u) => u.id === id) || USERS[0];
const priorityColor = (p) => ({ critical: T.red, high: T.red, urgent: T.red, medium: T.yellow, low: T.green, exploratory: T.purple }[p] || T.text3);

// PROJECT DATA
const PROJECTS = [
  { id: "p1", name: "Helm Platform", status: "active", color: T.accent, progress: 42, tasksTotal: 24, tasksDone: 10 },
  { id: "p2", name: "Mobile App", status: "active", color: T.cyan, progress: 18, tasksTotal: 16, tasksDone: 3 },
  { id: "p3", name: "Brand Refresh", status: "active", color: T.pink, progress: 75, tasksTotal: 12, tasksDone: 9 },
  { id: "p4", name: "Q1 Launch", status: "planning", color: T.orange, progress: 5, tasksTotal: 8, tasksDone: 0 },
];

const TASKS = [
  { id: "tk1", title: "Design system foundation", project: "p1", section: "In Progress", assignee: "u4", priority: "high", status: "in_progress", due: "2026-03-05" },
  { id: "tk2", title: "Supabase schema migration", project: "p1", section: "In Progress", assignee: "u5", priority: "high", status: "in_progress", due: "2026-03-03" },
  { id: "tk3", title: "Auth flow implementation", project: "p1", section: "To Do", assignee: "u2", priority: "high", status: "todo", due: "2026-03-10" },
  { id: "tk4", title: "OKR module data model", project: "p1", section: "To Do", assignee: "u5", priority: "medium", status: "todo", due: "2026-03-12" },
  { id: "tk5", title: "Real-time messaging POC", project: "p1", section: "Backlog", assignee: "u2", priority: "medium", status: "backlog", due: "2026-03-15" },
  { id: "tk6", title: "File upload service", project: "p1", section: "Done", assignee: "u5", priority: "high", status: "done", due: "2026-02-20" },
  { id: "tk7", title: "Navigation prototype", project: "p2", section: "In Progress", assignee: "u4", priority: "high", status: "in_progress", due: "2026-03-08" },
  { id: "tk8", title: "Logo concepts", project: "p3", section: "Done", assignee: "u4", priority: "high", status: "done", due: "2026-02-10" },
];

// OKR DATA
const OBJECTIVES = [
  { id: "o1", title: "Launch Helm MVP to first 10 customers", owner: "u1", health: "on_track", progress: 35 },
  { id: "o2", title: "Achieve mobile feature parity", owner: "u2", health: "at_risk", progress: 18 },
  { id: "o3", title: "Establish Helm as a recognizable brand", owner: "u3", health: "on_track", progress: 68 },
];
const KEY_RESULTS = [
  { id: "kr1", title: "Ship all Phase 1 modules", objective: "o1", target: 5, current: 2, progress: 40 },
  { id: "kr2", title: "p95 latency <200ms on all endpoints", objective: "o1", target: 200, current: 180, progress: 90 },
  { id: "kr3", title: "Onboard 10 beta customers, >80% WAR", objective: "o1", target: 10, current: 3, progress: 30 },
  { id: "kr4", title: "Task + messaging on mobile", objective: "o2", target: 2, current: 0, progress: 0 },
  { id: "kr5", title: "Complete brand guidelines & assets", objective: "o3", target: 1, current: 0.75, progress: 75 },
  { id: "kr6", title: "1,000 waitlist signups", objective: "o3", target: 1000, current: 620, progress: 62 },
];

// MESSAGING DATA
const CHANNELS = [
  { id: "ch1", name: "general", unread: 3 },
  { id: "ch2", name: "engineering", unread: 12 },
  { id: "ch3", name: "design", unread: 0 },
  { id: "ch4", name: "product-updates", unread: 5 },
];
const MESSAGES = {
  ch1: [
    { id: "m1", user: "u1", text: "Welcome to Helm! This is where we build the future of work. 🚀", time: "9:00 AM", reactions: [{ emoji: "🔥", count: 4 }] },
    { id: "m2", user: "u3", text: "Just finished the competitive analysis. We have a real shot at disrupting the market.", time: "9:15 AM", reactions: [] },
    { id: "m3", user: "u2", text: "Schema migration is 90% done. Auth tables are ready. Starting on RLS policies today.", time: "9:42 AM", reactions: [{ emoji: "👍", count: 2 }] },
    { id: "m4", user: "u4", text: "Design system tokens are locked in. Dark mode first — we're building for builders.", time: "10:05 AM", reactions: [{ emoji: "🎨", count: 3 }] },
    { id: "m5", user: "u5", text: "WebSocket layer performing well — 50ms average message delivery. Real-time will feel instant.", time: "10:30 AM", reactions: [{ emoji: "⚡", count: 5 }] },
  ],
  ch2: [
    { id: "m6", user: "u2", text: "Sprint planning: Prioritize auth flow and messaging POC this week.", time: "8:30 AM", reactions: [] },
    { id: "m7", user: "u5", text: "On it. Connection pool with Redis pub/sub ready by Wednesday.", time: "8:45 AM", reactions: [] },
  ],
};

// DOCS DATA
const DOCS = [
  { id: "d1", title: "Helm Architecture Overview", author: "u2", updated: "2 days ago", emoji: "🏗️", status: "published" },
  { id: "d2", title: "Design System Tokens", author: "u4", updated: "1 day ago", emoji: "🎨", status: "published" },
  { id: "d3", title: "API Design Conventions", author: "u5", updated: "3 days ago", emoji: "📡", status: "draft" },
  { id: "d4", title: "Sprint 3 Retro Notes", author: "u3", updated: "4 days ago", emoji: "📝", status: "published" },
  { id: "d5", title: "Security & Compliance Plan", author: "u2", updated: "1 week ago", emoji: "🔒", status: "draft" },
  { id: "d6", title: "PLM Process Guide", author: "u6", updated: "5 days ago", emoji: "🧪", status: "published" },
];

// CALENDAR DATA
const CALENDAR_EVENTS = [
  { id: "ev1", title: "Sprint Planning", time: "9:00 AM", duration: "1h", color: T.accent, attendees: ["u1", "u2", "u3"], day: 0, hasCall: true },
  { id: "ev2", title: "Design Review", time: "11:00 AM", duration: "45m", color: T.pink, attendees: ["u3", "u4"], day: 0, hasCall: true },
  { id: "ev3", title: "1:1 Ben ↔ Sarah", time: "2:00 PM", duration: "30m", color: T.purple, attendees: ["u1", "u2"], day: 0, hasCall: false },
  { id: "ev4", title: "PLM Gate Review", time: "10:00 AM", duration: "2h", color: T.orange, attendees: ["u1", "u3", "u6", "u8"], day: 1, hasCall: true },
  { id: "ev5", title: "Marketing Sync", time: "3:00 PM", duration: "30m", color: T.green, attendees: ["u3", "u7"], day: 1, hasCall: false },
  { id: "ev6", title: "All Hands", time: "4:00 PM", duration: "1h", color: T.cyan, attendees: USERS.map(u => u.id), day: 2, hasCall: true },
  { id: "ev7", title: "Stability Review", time: "10:00 AM", duration: "1h", color: T.yellow, attendees: ["u6", "u8"], day: 3, hasCall: false },
  { id: "ev8", title: "Sprint Demo", time: "3:00 PM", duration: "1h", color: T.accent, attendees: ["u1", "u2", "u3", "u4", "u5"], day: 4, hasCall: true },
];

// CAMPAIGNS DATA
const CAMPAIGNS = [
  { id: "cmp1", name: "Q1 Product Launch", type: "product_launch", status: "active", color: T.accent, start: "2026-02-01", end: "2026-03-31", budget: 50000, spent: 21000, owner: "u7" },
  { id: "cmp2", name: "Brand Awareness Push", type: "brand_awareness", status: "active", color: T.purple, start: "2026-03-01", end: "2026-04-30", budget: 30000, spent: 5000, owner: "u7" },
  { id: "cmp3", name: "Developer Community", type: "content_marketing", status: "planning", color: T.cyan, start: "2026-03-15", end: "2026-06-30", budget: 15000, spent: 0, owner: "u3" },
];
const CAMPAIGN_CONTENT = [
  { id: "cc1", title: "Launch Blog Post", campaign: "cmp1", type: "blog_post", channel: "Blog", status: "published", date: "2026-02-27", assignee: "u3" },
  { id: "cc2", title: "Product Hunt Launch", campaign: "cmp1", type: "product_update", channel: "Product Hunt", status: "scheduled", date: "2026-03-03", assignee: "u7" },
  { id: "cc3", title: "Twitter Thread - Features", campaign: "cmp1", type: "tweet_thread", channel: "Twitter/X", status: "approved", date: "2026-03-03", assignee: "u7" },
  { id: "cc4", title: "LinkedIn Article", campaign: "cmp2", type: "linkedin_article", channel: "LinkedIn", status: "draft", date: "2026-03-05", assignee: "u7" },
  { id: "cc5", title: "Intro Video", campaign: "cmp1", type: "video", channel: "YouTube", status: "in_review", date: "2026-03-01", assignee: "u4" },
  { id: "cc6", title: "Launch Email Blast", campaign: "cmp1", type: "email", channel: "Email", status: "scheduled", date: "2026-03-03", assignee: "u7" },
  { id: "cc7", title: "Case Study: Beta User", campaign: "cmp2", type: "case_study", channel: "Blog", status: "idea", date: "2026-03-10", assignee: "u3" },
  { id: "cc8", title: "Dev Tutorial #1", campaign: "cmp3", type: "blog_post", channel: "Blog", status: "draft", date: "2026-03-20", assignee: "u5" },
];

// PLM DATA
const PLM_PROGRAMS = [
  { id: "plm1", name: "VitaGlow Serum", code: "PRJ-2026-001", category: "Skincare", subcategory: "Anti-aging", stage: "development", type: "new_product", priority: "high", owner: "u6", launch: "2026-06-15", progress: 45 },
  { id: "plm2", name: "EnergyPlus Drink", code: "PRJ-2026-002", category: "Beverages", subcategory: "Functional", stage: "pilot", type: "new_product", priority: "critical", owner: "u6", launch: "2026-04-01", progress: 72 },
  { id: "plm3", name: "ProBio Capsules v2", code: "PRJ-2026-003", category: "Supplements", subcategory: "Digestive", stage: "concept", type: "reformulation", priority: "medium", owner: "u6", launch: "2026-09-01", progress: 15 },
];
const PLM_CLAIMS = [
  { id: "cl1", program: "plm1", text: "Reduces fine lines by 30% in 4 weeks", type: "efficacy", status: "researching", evidence: "clinical_pilot" },
  { id: "cl2", program: "plm1", text: "Dermatologist tested and recommended", type: "dermatologist_tested", status: "substantiated", evidence: "clinical_pivotal" },
  { id: "cl3", program: "plm2", text: "Sustained energy for 6+ hours", type: "efficacy", status: "proposed", evidence: "consumer_study" },
  { id: "cl4", program: "plm2", text: "Zero crash formula", type: "comparative", status: "in_legal_review", evidence: "clinical_pilot" },
];
const PLM_FORMULAS = [
  { id: "f1", program: "plm1", name: "VitaGlow Serum v3.2", version: "3.2", status: "testing", form: "serum", items: 14, cost: 4.82 },
  { id: "f2", program: "plm2", name: "EnergyPlus RTD v2.1", version: "2.1", status: "pilot_approved", form: "liquid", items: 18, cost: 1.45 },
  { id: "f3", program: "plm1", name: "VitaGlow Serum v3.1", version: "3.1", status: "superseded", form: "serum", items: 13, cost: 5.10 },
];
const PLM_EXPERIMENTS = [
  { id: "exp1", program: "plm1", name: "Vitamin C Stability DOE", type: "stability", design: "central_composite", status: "completed", factors: 3, runs: 20, rSquared: 0.94 },
  { id: "exp2", program: "plm1", name: "Emulsifier Screening", type: "formulation", design: "screening", status: "analyzing", factors: 5, runs: 12, rSquared: null },
  { id: "exp3", program: "plm2", name: "Caffeine Release Profile", type: "bioavailability", design: "full_factorial", status: "in_progress", factors: 2, runs: 8, rSquared: null },
];
const PLM_TRIALS = [
  { id: "tr1", program: "plm2", number: "PILOT-001", name: "EnergyPlus First Pilot", type: "pilot", status: "completed", batchSize: "500L", yield: 94.2, disposition: "approved" },
  { id: "tr2", program: "plm2", number: "SCALE-001", name: "EnergyPlus Scale-Up", type: "scale_up", status: "in_progress", batchSize: "5000L", yield: null, disposition: "pending" },
  { id: "tr3", program: "plm1", number: "LAB-012", name: "VitaGlow Bench Trial", type: "lab_bench", status: "completed", batchSize: "2kg", yield: 97.1, disposition: "approved" },
];
const PLM_TESTS = [
  { id: "ts1", program: "plm2", trial: "tr1", name: "pH", category: "chemical", spec: "3.8–4.2", result: "4.0", status: "pass" },
  { id: "ts2", program: "plm2", trial: "tr1", name: "Viscosity", category: "physical", spec: "800–1200 cP", result: "980 cP", status: "pass" },
  { id: "ts3", program: "plm2", trial: "tr1", name: "Microbial (TPC)", category: "microbiological", spec: "<100 CFU/mL", result: "<10 CFU/mL", status: "pass" },
  { id: "ts4", program: "plm1", trial: "tr3", name: "Active Assay (Vitamin C)", category: "chemical", spec: "95–105%", result: "101.3%", status: "pass" },
  { id: "ts5", program: "plm1", trial: "tr3", name: "Appearance", category: "physical", spec: "Clear, pale yellow", result: "Slight haze", status: "marginal" },
];

// AUTOMATION DATA
const AUTOMATIONS = [
  { id: "au1", name: "Auto-assign urgent tasks to Sarah", trigger: "Task priority set to urgent", action: "Assign to Sarah Chen", active: true, runs: 23 },
  { id: "au2", name: "Notify #engineering on deploy", trigger: "Task completed in DevOps section", action: "Post to #engineering", active: true, runs: 47 },
  { id: "au3", name: "Move to Done when all subtasks complete", trigger: "All subtasks marked done", action: "Move task to Done", active: true, runs: 156 },
  { id: "au4", name: "Weekly status update reminder", trigger: "Every Friday 9 AM", action: "Send notification to project leads", active: false, runs: 8 },
];

// ─── UTILITY COMPONENTS ───
const Badge = ({ children, color = T.accent, bg, small }) => (
  <span style={{
    display: "inline-flex", alignItems: "center", padding: small ? "1px 6px" : "2px 8px",
    borderRadius: 4, fontSize: small ? 10 : 11, fontWeight: 600,
    background: bg || (color + "18"), color, letterSpacing: "0.02em", whiteSpace: "nowrap",
  }}>{children}</span>
);

const Avatar = ({ user, size = 28 }) => {
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

const ProgressBar = ({ value, color = T.accent, height = 4, bg = T.surface3 }) => (
  <div style={{ width: "100%", height, borderRadius: height, background: bg, overflow: "hidden" }}>
    <div style={{ width: `${Math.min(100, Math.max(0, value))}%`, height: "100%", borderRadius: height, background: color, transition: "width 0.6s ease" }} />
  </div>
);

const Stat = ({ label, value, sub, color }) => (
  <div style={{ padding: "14px 16px", background: T.surface2, borderRadius: 8, border: `1px solid ${T.border}`, minWidth: 0 }}>
    <div style={{ fontSize: 11, color: T.text3, marginBottom: 4, letterSpacing: "0.04em", textTransform: "uppercase" }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 700, color: color || T.text, lineHeight: 1.1 }}>{value}</div>
    {sub && <div style={{ fontSize: 11, color: T.text3, marginTop: 3 }}>{sub}</div>}
  </div>
);

const SectionHeader = ({ icon, title, count, action, actionLabel }) => (
  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ fontSize: 16, opacity: 0.7 }}>{icon}</span>
      <span style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{title}</span>
      {count != null && <Badge small color={T.text3}>{count}</Badge>}
    </div>
    {action && <button onClick={action} style={{ background: "none", border: "none", color: T.accent, fontSize: 12, cursor: "pointer", fontWeight: 500 }}>{actionLabel || "View all →"}</button>}
  </div>
);

const Card = ({ children, style, onClick, hover }) => (
  <div onClick={onClick} style={{
    background: T.surface2, borderRadius: 8, border: `1px solid ${T.border}`, padding: 16,
    cursor: onClick ? "pointer" : "default", transition: "all 0.15s ease",
    ...(hover ? { ":hover": { borderColor: T.accent } } : {}), ...style,
  }}>{children}</div>
);

const StatusDot = ({ color, size = 8 }) => (
  <div style={{ width: size, height: size, borderRadius: size, background: color, flexShrink: 0, boxShadow: `0 0 6px ${color}40` }} />
);

const TabBar = ({ tabs, active, onChange }) => (
  <div style={{ display: "flex", gap: 2, background: T.surface, borderRadius: 6, padding: 2, border: `1px solid ${T.border}` }}>
    {tabs.map(t => (
      <button key={t.key} onClick={() => onChange(t.key)} style={{
        padding: "6px 14px", borderRadius: 4, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 500, transition: "all 0.15s",
        background: active === t.key ? T.surface3 : "transparent", color: active === t.key ? T.text : T.text3,
      }}>{t.label}{t.count != null ? ` (${t.count})` : ""}</button>
    ))}
  </div>
);

// ─── SIDEBAR ───
const NAV_ITEMS = [
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
];

function Sidebar({ active, setActive }) {
  return (
    <div style={{
      width: 52, background: T.surface, borderRight: `1px solid ${T.border}`, display: "flex",
      flexDirection: "column", alignItems: "center", paddingTop: 14, gap: 2, flexShrink: 0,
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg, ${T.accent}, ${T.purple})`,
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 900,
        marginBottom: 12, color: "#fff", letterSpacing: "-0.5px",
      }}>H</div>
      {NAV_ITEMS.map((item, i) =>
        item.type === "divider" ? (
          <div key={i} style={{ width: 20, height: 1, background: T.border, margin: "4px 0" }} />
        ) : (
          <button key={item.key} onClick={() => setActive(item.key)} title={item.label} style={{
            width: 36, height: 36, borderRadius: 8, border: "none", cursor: "pointer", display: "flex",
            alignItems: "center", justifyContent: "center", fontSize: 16, transition: "all 0.15s",
            background: active === item.key ? T.accentDim : "transparent",
            color: active === item.key ? T.accent : T.text3,
          }}>{item.icon}</button>
        )
      )}
      <div style={{ flex: 1 }} />
      <Avatar user="u1" size={28} />
      <div style={{ height: 12 }} />
    </div>
  );
}

// ─── DASHBOARD ───
function DashboardView({ setActive }) {
  return (
    <div style={{ padding: 28, maxWidth: 1100, overflow: "auto" }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Good morning, Ben</h1>
        <p style={{ color: T.text2, fontSize: 13 }}>Friday, February 27, 2026 — Here's what's happening across Helm.</p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        <Stat label="Active Projects" value="4" sub="2 on track" color={T.accent} />
        <Stat label="Open Tasks" value="18" sub="3 overdue" color={T.yellow} />
        <Stat label="OKR Progress" value="40%" sub="Q1 2026" color={T.green} />
        <Stat label="PLM Programs" value="3" sub="1 in pilot" color={T.orange} />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
        <div>
          <SectionHeader icon="◫" title="Projects" count={4} action={() => setActive("projects")} />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {PROJECTS.map(p => (
              <div key={p.id} style={{ background: T.surface2, borderRadius: 8, padding: 12, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ width: 4, height: 32, borderRadius: 2, background: p.color, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{p.name}</div>
                  <ProgressBar value={p.progress} color={p.color} />
                </div>
                <span style={{ fontSize: 12, color: T.text2, fontWeight: 600 }}>{p.progress}%</span>
              </div>
            ))}
          </div>
        </div>

        <div>
          <SectionHeader icon="▦" title="Today's Schedule" count={CALENDAR_EVENTS.filter(e => e.day === 0).length} action={() => setActive("calendar")} />
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {CALENDAR_EVENTS.filter(e => e.day === 0).map(ev => (
              <div key={ev.id} style={{ background: T.surface2, borderRadius: 8, padding: 10, border: `1px solid ${T.border}`, display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ width: 3, height: 28, borderRadius: 2, background: ev.color, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{ev.title}</div>
                  <div style={{ fontSize: 11, color: T.text3 }}>{ev.time} · {ev.duration}</div>
                </div>
                {ev.hasCall && <span style={{ fontSize: 10, color: T.green }}>◉ Video</span>}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <SectionHeader icon="◈" title="Active Campaigns" count={2} action={() => setActive("campaigns")} />
          {CAMPAIGNS.filter(c => c.status === "active").map(c => (
            <div key={c.id} style={{ background: T.surface2, borderRadius: 8, padding: 12, border: `1px solid ${T.border}`, marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{c.name}</span>
                <Badge color={c.color}>{c.type.replace(/_/g, " ")}</Badge>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.text3 }}>
                <span>Budget: ${(c.budget/1000).toFixed(0)}k</span>
                <span>Spent: ${(c.spent/1000).toFixed(0)}k ({Math.round(c.spent/c.budget*100)}%)</span>
              </div>
              <div style={{ marginTop: 6 }}><ProgressBar value={c.spent/c.budget*100} color={c.color} /></div>
            </div>
          ))}
        </div>

        <div>
          <SectionHeader icon="⬢" title="PLM Pipeline" count={3} action={() => setActive("plm")} />
          {PLM_PROGRAMS.map(p => (
            <div key={p.id} style={{ background: T.surface2, borderRadius: 8, padding: 12, border: `1px solid ${T.border}`, marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</span>
                <Badge color={priorityColor(p.priority)}>{p.priority}</Badge>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: T.text3, marginBottom: 6 }}>
                <span>{p.category} › {p.subcategory}</span>
                <Badge small color={T.cyan}>{p.stage}</Badge>
              </div>
              <ProgressBar value={p.progress} color={p.stage === "pilot" ? T.orange : T.accent} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── PROJECTS VIEW ───
function ProjectsView() {
  const [activeProject, setActiveProject] = useState("p1");
  const project = PROJECTS.find(p => p.id === activeProject);
  const tasks = TASKS.filter(t => t.project === activeProject);
  const sections = ["In Progress", "To Do", "Backlog", "Done"];

  return (
    <div style={{ display: "flex", height: "100%" }}>
      <div style={{ width: 200, borderRight: `1px solid ${T.border}`, padding: 12, overflow: "auto" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: T.text3, marginBottom: 8, letterSpacing: "0.06em", textTransform: "uppercase" }}>Projects</div>
        {PROJECTS.map(p => (
          <button key={p.id} onClick={() => setActiveProject(p.id)} style={{
            width: "100%", textAlign: "left", padding: "8px 10px", borderRadius: 6, border: "none",
            cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 2,
            background: activeProject === p.id ? T.surface3 : "transparent", color: activeProject === p.id ? T.text : T.text2,
          }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: p.color }} />
            {p.name}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, padding: 20, overflow: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <div style={{ width: 10, height: 10, borderRadius: 2, background: project?.color }} />
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>{project?.name}</h2>
          <Badge color={T.green}>{project?.progress}% complete</Badge>
        </div>
        <div style={{ display: "flex", gap: 16, overflow: "auto" }}>
          {sections.map(section => {
            const sectionTasks = tasks.filter(t => t.section === section);
            return (
              <div key={section} style={{ minWidth: 260, flex: 1 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.text2, marginBottom: 10, display: "flex", justifyContent: "space-between" }}>
                  <span>{section}</span>
                  <Badge small color={T.text3}>{sectionTasks.length}</Badge>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {sectionTasks.map(task => (
                    <div key={task.id} style={{ background: T.surface2, borderRadius: 8, padding: 12, border: `1px solid ${T.border}` }}>
                      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>{task.title}</div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <StatusDot color={priorityColor(task.priority)} size={6} />
                          <span style={{ fontSize: 10, color: T.text3 }}>{task.priority}</span>
                        </div>
                        {task.assignee && <Avatar user={task.assignee} size={22} />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── OKRs VIEW ───
function OKRsView() {
  const healthColor = (h) => ({ on_track: T.green, at_risk: T.yellow, off_track: T.red }[h] || T.text3);
  return (
    <div style={{ padding: 24, overflow: "auto", maxWidth: 900 }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>Objectives & Key Results</h2>
      <p style={{ fontSize: 12, color: T.text3, marginBottom: 20 }}>Q1 2026 · Jan 1 – Mar 31</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {OBJECTIVES.map(obj => (
          <div key={obj.id} style={{ background: T.surface2, borderRadius: 10, border: `1px solid ${T.border}`, overflow: "hidden" }}>
            <div style={{ padding: 16, borderBottom: `1px solid ${T.border}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Avatar user={obj.owner} size={24} />
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{obj.title}</span>
                </div>
                <Badge color={healthColor(obj.health)}>{obj.health.replace(/_/g, " ")}</Badge>
              </div>
              <ProgressBar value={obj.progress} color={healthColor(obj.health)} height={5} />
              <div style={{ fontSize: 11, color: T.text3, marginTop: 4, textAlign: "right" }}>{obj.progress}%</div>
            </div>
            <div style={{ padding: "8px 16px 16px" }}>
              {KEY_RESULTS.filter(kr => kr.objective === obj.id).map(kr => (
                <div key={kr.id} style={{ padding: "8px 0", display: "flex", alignItems: "center", gap: 12, borderBottom: `1px solid ${T.border}20` }}>
                  <div style={{ flex: 1, fontSize: 12, color: T.text2 }}>{kr.title}</div>
                  <div style={{ width: 80 }}><ProgressBar value={kr.progress} color={T.accent} height={3} /></div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: T.text2, minWidth: 35, textAlign: "right" }}>{kr.progress}%</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── MESSAGES VIEW ───
function MessagesView() {
  const [ch, setCh] = useState("ch1");
  const msgs = MESSAGES[ch] || [];
  return (
    <div style={{ display: "flex", height: "100%" }}>
      <div style={{ width: 200, borderRight: `1px solid ${T.border}`, padding: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: T.text3, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Channels</div>
        {CHANNELS.map(c => (
          <button key={c.id} onClick={() => setCh(c.id)} style={{
            width: "100%", textAlign: "left", padding: "7px 10px", borderRadius: 6, border: "none",
            cursor: "pointer", fontSize: 13, marginBottom: 2, display: "flex", justifyContent: "space-between",
            background: ch === c.id ? T.surface3 : "transparent", color: ch === c.id ? T.text : T.text2,
          }}>
            <span># {c.name}</span>
            {c.unread > 0 && <Badge small color={T.accent}>{c.unread}</Badge>}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div style={{ padding: "12px 20px", borderBottom: `1px solid ${T.border}`, fontSize: 14, fontWeight: 600 }}>
          # {CHANNELS.find(c => c.id === ch)?.name}
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
          {msgs.map(m => {
            const u = getUser(m.user);
            return (
              <div key={m.id} style={{ display: "flex", gap: 10 }}>
                <Avatar user={m.user} size={32} />
                <div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{u.name}</span>
                    <span style={{ fontSize: 10, color: T.text3 }}>{m.time}</span>
                  </div>
                  <div style={{ fontSize: 13, color: T.text2, lineHeight: 1.5 }}>{m.text}</div>
                  {m.reactions.length > 0 && (
                    <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
                      {m.reactions.map((r, i) => (
                        <span key={i} style={{ background: T.surface3, padding: "2px 6px", borderRadius: 10, fontSize: 11, border: `1px solid ${T.border}` }}>
                          {r.emoji} {r.count}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ padding: "12px 20px", borderTop: `1px solid ${T.border}` }}>
          <div style={{ background: T.surface2, borderRadius: 8, padding: "10px 14px", border: `1px solid ${T.border}`, fontSize: 13, color: T.text3 }}>
            Message #{CHANNELS.find(c => c.id === ch)?.name}...
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── DOCS VIEW ───
function DocsView() {
  return (
    <div style={{ padding: 24, overflow: "auto", maxWidth: 800 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>Documents</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", borderRadius: 6, background: T.surface2, border: `1px solid ${T.border}`, fontSize: 12, color: T.text3 }}>
          🔍 Search docs...
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {DOCS.map(doc => (
          <div key={doc.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 8, cursor: "pointer", border: `1px solid transparent` }}>
            <span style={{ fontSize: 20 }}>{doc.emoji}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{doc.title}</div>
              <div style={{ fontSize: 11, color: T.text3 }}>{getUser(doc.author).name} · {doc.updated}</div>
            </div>
            <Badge small color={doc.status === "published" ? T.green : T.yellow}>{doc.status}</Badge>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 24, padding: 16, background: T.surface2, borderRadius: 8, border: `1px solid ${T.border}` }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 16 }}>✨</span>
          <span style={{ fontSize: 13, fontWeight: 600 }}>AI Writing Assistant</span>
        </div>
        <div style={{ fontSize: 12, color: T.text2, marginBottom: 12 }}>Write, summarize, expand, translate, fix grammar, brainstorm — 16 AI actions powered by Claude.</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {["Write", "Summarize", "Expand", "Translate", "Fix Grammar", "Brainstorm", "Outline", "Extract Actions"].map(a => (
            <span key={a} style={{ padding: "4px 10px", background: T.surface3, borderRadius: 4, fontSize: 11, color: T.text2, border: `1px solid ${T.border}` }}>{a}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── CALENDAR VIEW ───
function CalendarView() {
  const days = ["Mon 27", "Tue 28", "Wed 1", "Thu 2", "Fri 3"];
  return (
    <div style={{ padding: 24, overflow: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>Calendar</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <Badge color={T.text2}>← Feb 2026 →</Badge>
          <button style={{ background: T.accent, border: "none", borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 600, color: "#fff", cursor: "pointer" }}>+ New Event</button>
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 1, background: T.border, borderRadius: 8, overflow: "hidden" }}>
        {days.map((day, di) => (
          <div key={day} style={{ background: T.surface, minHeight: 400 }}>
            <div style={{ padding: "8px 10px", background: T.surface2, fontSize: 12, fontWeight: 600, color: di === 0 ? T.accent : T.text2, borderBottom: `1px solid ${T.border}` }}>
              {day}
            </div>
            <div style={{ padding: 6, display: "flex", flexDirection: "column", gap: 4 }}>
              {CALENDAR_EVENTS.filter(ev => ev.day === di).map(ev => (
                <div key={ev.id} style={{ padding: "8px 10px", borderRadius: 6, background: ev.color + "15", borderLeft: `3px solid ${ev.color}`, cursor: "pointer" }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: ev.color, marginBottom: 2 }}>{ev.title}</div>
                  <div style={{ fontSize: 10, color: T.text3 }}>{ev.time} · {ev.duration}</div>
                  <div style={{ display: "flex", gap: -4, marginTop: 4 }}>
                    {ev.attendees.slice(0, 3).map(a => <Avatar key={a} user={a} size={16} />)}
                    {ev.attendees.length > 3 && <span style={{ fontSize: 9, color: T.text3, marginLeft: 4 }}>+{ev.attendees.length - 3}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── CALLS VIEW ───
function CallsView() {
  const recentCalls = [
    { id: "c1", title: "Sprint Planning", type: "scheduled", participants: 5, duration: "47m", date: "Today, 9:00 AM", recording: true, transcript: true },
    { id: "c2", title: "Design Review", type: "scheduled", participants: 3, duration: "32m", date: "Today, 11:00 AM", recording: true, transcript: true },
    { id: "c3", title: "Quick huddle — API issue", type: "huddle", participants: 2, duration: "8m", date: "Yesterday", recording: false, transcript: false },
    { id: "c4", title: "All Hands", type: "scheduled", participants: 8, duration: "55m", date: "Feb 25", recording: true, transcript: true },
  ];
  return (
    <div style={{ padding: 24, overflow: "auto", maxWidth: 800 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>Calls & Meetings</h2>
        <button style={{ background: T.green, border: "none", borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 600, color: "#fff", cursor: "pointer" }}>◉ Start Huddle</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 24 }}>
        <Stat label="Calls This Week" value="12" sub="4h 23m total" color={T.accent} />
        <Stat label="AI Summaries" value="9" sub="Auto-generated" color={T.purple} />
        <Stat label="Action Items" value="14" sub="From transcripts" color={T.green} />
      </div>
      <SectionHeader icon="◉" title="Recent Calls" count={recentCalls.length} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {recentCalls.map(call => (
          <div key={call.id} style={{ background: T.surface2, borderRadius: 8, padding: 14, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: call.type === "huddle" ? T.greenDim : T.accentDim, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>
              {call.type === "huddle" ? "💬" : "📹"}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{call.title}</div>
              <div style={{ fontSize: 11, color: T.text3 }}>{call.date} · {call.participants} people · {call.duration}</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {call.recording && <Badge small color={T.accent}>Recording</Badge>}
              {call.transcript && <Badge small color={T.purple}>AI Summary</Badge>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── CAMPAIGNS VIEW ───
function CampaignsView() {
  const [view, setView] = useState("calendar");
  const statusColor = { published: T.green, scheduled: T.accent, approved: T.cyan, draft: T.yellow, in_review: T.orange, idea: T.text3, sent: T.green };

  return (
    <div style={{ padding: 24, overflow: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>Marketing Campaigns</h2>
        <TabBar tabs={[{ key: "calendar", label: "Calendar" }, { key: "list", label: "Content" }, { key: "campaigns", label: "Campaigns" }]} active={view} onChange={setView} />
      </div>

      {view === "campaigns" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {CAMPAIGNS.map(c => (
            <div key={c.id} style={{ background: T.surface2, borderRadius: 10, border: `1px solid ${T.border}`, padding: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: c.color }} />
                  <span style={{ fontSize: 15, fontWeight: 700 }}>{c.name}</span>
                  <Badge color={c.status === "active" ? T.green : T.yellow}>{c.status}</Badge>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Avatar user={c.owner} size={22} />
                  <span style={{ fontSize: 11, color: T.text3 }}>{getUser(c.owner).name}</span>
                </div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                <div><div style={{ fontSize: 10, color: T.text3 }}>Budget</div><div style={{ fontSize: 14, fontWeight: 700 }}>${(c.budget/1000).toFixed(0)}k</div></div>
                <div><div style={{ fontSize: 10, color: T.text3 }}>Spent</div><div style={{ fontSize: 14, fontWeight: 700 }}>${(c.spent/1000).toFixed(0)}k</div></div>
                <div><div style={{ fontSize: 10, color: T.text3 }}>Content Items</div><div style={{ fontSize: 14, fontWeight: 700 }}>{CAMPAIGN_CONTENT.filter(cc => cc.campaign === c.id).length}</div></div>
                <div><div style={{ fontSize: 10, color: T.text3 }}>Period</div><div style={{ fontSize: 12, fontWeight: 500 }}>{c.start.slice(5)} → {c.end.slice(5)}</div></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {view === "list" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {CAMPAIGN_CONTENT.map(cc => (
            <div key={cc.id} style={{ background: T.surface2, borderRadius: 8, padding: 12, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12 }}>
              <StatusDot color={statusColor[cc.status] || T.text3} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{cc.title}</div>
                <div style={{ fontSize: 11, color: T.text3 }}>{cc.channel} · {cc.date}</div>
              </div>
              <Badge small color={statusColor[cc.status] || T.text3}>{cc.status.replace(/_/g, " ")}</Badge>
              <Avatar user={cc.assignee} size={22} />
            </div>
          ))}
        </div>
      )}

      {view === "calendar" && (
        <div>
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            {CAMPAIGNS.map(c => (
              <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 4, background: c.color + "15", border: `1px solid ${c.color}30` }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: c.color }} />
                <span style={{ fontSize: 11, color: c.color, fontWeight: 500 }}>{c.name}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1, background: T.border, borderRadius: 8, overflow: "hidden" }}>
            {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => (
              <div key={d} style={{ background: T.surface2, padding: "6px 8px", fontSize: 10, fontWeight: 600, color: T.text3, textAlign: "center" }}>{d}</div>
            ))}
            {Array.from({ length: 35 }, (_, i) => {
              const dayNum = i - 2; // offset for Feb 2026 starting on Sun
              const date = dayNum >= 1 && dayNum <= 28 ? dayNum : null;
              const dayContent = CAMPAIGN_CONTENT.filter(cc => date && parseInt(cc.date.slice(-2)) === date);
              return (
                <div key={i} style={{ background: T.surface, minHeight: 70, padding: 4, borderBottom: `1px solid ${T.border}10` }}>
                  {date && <div style={{ fontSize: 10, color: date === 27 ? T.accent : T.text3, fontWeight: date === 27 ? 700 : 400, marginBottom: 2 }}>{date}</div>}
                  {dayContent.slice(0, 2).map(cc => {
                    const camp = CAMPAIGNS.find(c => c.id === cc.campaign);
                    return (
                      <div key={cc.id} style={{ fontSize: 9, padding: "2px 4px", borderRadius: 3, marginBottom: 1, background: (camp?.color || T.accent) + "20", color: camp?.color || T.accent, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {cc.title}
                      </div>
                    );
                  })}
                  {dayContent.length > 2 && <div style={{ fontSize: 9, color: T.text3 }}>+{dayContent.length - 2} more</div>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PLM VIEW ───
function PLMView() {
  const [tab, setTab] = useState("programs");
  const stageOrder = ["concept", "feasibility", "development", "pilot", "validation", "scale_up", "launch_prep", "launched"];
  const stageColor = { concept: T.purple, feasibility: T.cyan, development: T.accent, pilot: T.orange, validation: T.yellow, scale_up: T.green, launched: T.lime };

  return (
    <div style={{ padding: 24, overflow: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Product Lifecycle Management</h2>
          <p style={{ fontSize: 12, color: T.text3 }}>Ideation → Development → Pilot → Scale → Launch</p>
        </div>
        <button style={{ background: T.accent, border: "none", borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 600, color: "#fff", cursor: "pointer" }}>+ New Program</button>
      </div>

      <TabBar tabs={[
        { key: "programs", label: "Programs" },
        { key: "claims", label: "Claims" },
        { key: "formulas", label: "Formulas" },
        { key: "experiments", label: "DOE" },
        { key: "trials", label: "Trials" },
        { key: "testing", label: "Testing" },
        { key: "ai", label: "🤖 AI Advisor" },
      ]} active={tab} onChange={setTab} />

      <div style={{ marginTop: 16 }}>
        {tab === "programs" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {/* Pipeline visualization */}
            <div style={{ background: T.surface2, borderRadius: 10, border: `1px solid ${T.border}`, padding: 16, marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.text2, marginBottom: 12 }}>Pipeline Stages</div>
              <div style={{ display: "flex", gap: 4 }}>
                {stageOrder.map(s => {
                  const count = PLM_PROGRAMS.filter(p => p.stage === s).length;
                  return (
                    <div key={s} style={{ flex: 1, textAlign: "center", padding: "8px 4px", borderRadius: 6, background: count > 0 ? (stageColor[s] || T.accent) + "15" : T.surface3, border: `1px solid ${count > 0 ? (stageColor[s] || T.accent) + "30" : T.border}` }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: count > 0 ? stageColor[s] || T.accent : T.text3 }}>{count}</div>
                      <div style={{ fontSize: 9, color: T.text3, textTransform: "capitalize" }}>{s.replace(/_/g, " ")}</div>
                    </div>
                  );
                })}
              </div>
            </div>
            {PLM_PROGRAMS.map(p => (
              <div key={p.id} style={{ background: T.surface2, borderRadius: 10, border: `1px solid ${T.border}`, padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 15, fontWeight: 700 }}>{p.name}</span>
                      <Badge color={priorityColor(p.priority)}>{p.priority}</Badge>
                    </div>
                    <div style={{ fontSize: 11, color: T.text3 }}>{p.code} · {p.category} › {p.subcategory} · {p.type.replace(/_/g, " ")}</div>
                  </div>
                  <Badge color={stageColor[p.stage] || T.accent} bg={(stageColor[p.stage] || T.accent) + "20"}>{p.stage.replace(/_/g, " ").toUpperCase()}</Badge>
                </div>
                <ProgressBar value={p.progress} color={stageColor[p.stage] || T.accent} height={5} />
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 11, color: T.text3 }}>
                  <span>Target launch: {p.launch}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Avatar user={p.owner} size={18} />
                    <span>{getUser(p.owner).name}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "claims" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {PLM_CLAIMS.map(cl => {
              const prog = PLM_PROGRAMS.find(p => p.id === cl.program);
              const sColor = { researching: T.yellow, substantiated: T.green, proposed: T.text3, in_legal_review: T.orange }[cl.status] || T.text3;
              return (
                <div key={cl.id} style={{ background: T.surface2, borderRadius: 8, padding: 14, border: `1px solid ${T.border}` }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>"{cl.text}"</div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <Badge small color={T.purple}>{prog?.name}</Badge>
                    <Badge small color={T.cyan}>{cl.type.replace(/_/g, " ")}</Badge>
                    <Badge small color={sColor}>{cl.status.replace(/_/g, " ")}</Badge>
                    <Badge small color={T.text2}>{cl.evidence.replace(/_/g, " ")}</Badge>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "formulas" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {PLM_FORMULAS.map(f => {
              const prog = PLM_PROGRAMS.find(p => p.id === f.program);
              const sColor = { testing: T.yellow, pilot_approved: T.green, superseded: T.text3, draft: T.accent }[f.status] || T.text3;
              return (
                <div key={f.id} style={{ background: T.surface2, borderRadius: 8, padding: 14, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: T.purpleDim, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🧪</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{f.name} <span style={{ color: T.text3, fontWeight: 400 }}>v{f.version}</span></div>
                    <div style={{ fontSize: 11, color: T.text3 }}>{prog?.name} · {f.form} · {f.items} ingredients · ${f.cost}/unit</div>
                  </div>
                  <Badge color={sColor}>{f.status.replace(/_/g, " ")}</Badge>
                </div>
              );
            })}
          </div>
        )}

        {tab === "experiments" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {PLM_EXPERIMENTS.map(exp => {
              const prog = PLM_PROGRAMS.find(p => p.id === exp.program);
              const sColor = { completed: T.green, analyzing: T.yellow, in_progress: T.accent, planning: T.text3 }[exp.status] || T.text3;
              return (
                <div key={exp.id} style={{ background: T.surface2, borderRadius: 8, padding: 14, border: `1px solid ${T.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{exp.name}</span>
                    <Badge color={sColor}>{exp.status.replace(/_/g, " ")}</Badge>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <Badge small color={T.purple}>{prog?.name}</Badge>
                    <Badge small color={T.cyan}>{exp.type}</Badge>
                    <Badge small color={T.accent}>{exp.design.replace(/_/g, " ")}</Badge>
                    <Badge small color={T.text2}>{exp.factors} factors · {exp.runs} runs</Badge>
                    {exp.rSquared && <Badge small color={T.green}>R² = {exp.rSquared}</Badge>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "trials" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {PLM_TRIALS.map(tr => {
              const prog = PLM_PROGRAMS.find(p => p.id === tr.program);
              const sColor = { completed: T.green, in_progress: T.accent, planned: T.text3 }[tr.status] || T.text3;
              const dColor = { approved: T.green, pending: T.yellow, rejected: T.red }[tr.disposition] || T.text3;
              return (
                <div key={tr.id} style={{ background: T.surface2, borderRadius: 8, padding: 14, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: sColor + "15", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🏭</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{tr.number}: {tr.name}</div>
                    <div style={{ fontSize: 11, color: T.text3 }}>{prog?.name} · {tr.type.replace(/_/g, " ")} · {tr.batchSize}{tr.yield ? ` · Yield: ${tr.yield}%` : ""}</div>
                  </div>
                  <Badge color={sColor}>{tr.status.replace(/_/g, " ")}</Badge>
                  <Badge color={dColor}>{tr.disposition}</Badge>
                </div>
              );
            })}
          </div>
        )}

        {tab === "testing" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 0, marginBottom: 8, padding: "8px 14px", fontSize: 10, fontWeight: 600, color: T.text3, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              <span>Test</span><span>Category</span><span>Specification</span><span>Result</span><span>Status</span>
            </div>
            {PLM_TESTS.map(ts => {
              const sColor = { pass: T.green, fail: T.red, marginal: T.yellow, pending: T.text3 }[ts.status];
              return (
                <div key={ts.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 0, padding: "10px 14px", background: T.surface2, borderRadius: 6, border: `1px solid ${T.border}`, marginBottom: 4, alignItems: "center", fontSize: 12 }}>
                  <span style={{ fontWeight: 500 }}>{ts.name}</span>
                  <Badge small color={T.cyan}>{ts.category}</Badge>
                  <span style={{ color: T.text2 }}>{ts.spec}</span>
                  <span style={{ fontWeight: 600 }}>{ts.result}</span>
                  <Badge color={sColor}>{ts.status.toUpperCase()}</Badge>
                </div>
              );
            })}
          </div>
        )}

        {tab === "ai" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              { icon: "🔬", title: "Claim Support", desc: "Evaluate claims for scientific validity, regulatory compliance, and required substantiation.", color: T.purple },
              { icon: "📊", title: "DOE Advisor", desc: "Design experiments, generate run matrices, analyze results, find optimal settings.", color: T.accent },
              { icon: "🧪", title: "Formulation Advisor", desc: "Ingredient selection, stability troubleshooting, process optimization.", color: T.cyan },
              { icon: "🏭", title: "Manufacturing Troubleshoot", desc: "Diagnose production issues, root cause analysis, corrective actions.", color: T.orange },
              { icon: "📈", title: "Stability Predictor", desc: "Predict shelf life from accelerated data, identify degradation pathways.", color: T.green },
              { icon: "💊", title: "Ingredient Advisor", desc: "Recommend ingredients for target benefits, check compatibility and regulatory status.", color: T.pink },
            ].map(ai => (
              <div key={ai.title} style={{ background: T.surface2, borderRadius: 10, border: `1px solid ${T.border}`, padding: 16, cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: ai.color + "15", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{ai.icon}</div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: ai.color }}>{ai.title}</span>
                </div>
                <div style={{ fontSize: 12, color: T.text2, lineHeight: 1.5 }}>{ai.desc}</div>
                <div style={{ marginTop: 10, fontSize: 11, color: ai.color, fontWeight: 600 }}>Ask AI →</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── AUTOMATION VIEW ───
function AutomationView() {
  return (
    <div style={{ padding: 24, overflow: "auto", maxWidth: 800 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>Automation Rules</h2>
        <button style={{ background: T.accent, border: "none", borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 600, color: "#fff", cursor: "pointer" }}>+ New Rule</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 24 }}>
        <Stat label="Active Rules" value={AUTOMATIONS.filter(a => a.active).length} color={T.green} />
        <Stat label="Total Runs" value={AUTOMATIONS.reduce((s, a) => s + a.runs, 0)} color={T.accent} />
        <Stat label="Time Saved" value="~18h" sub="This month" color={T.purple} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {AUTOMATIONS.map(a => (
          <div key={a.id} style={{ background: T.surface2, borderRadius: 8, padding: 14, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 36, height: 36, borderRadius: 8, background: a.active ? T.accentDim : T.surface3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>⚡</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{a.name}</div>
              <div style={{ fontSize: 11, color: T.text3 }}>
                <span style={{ color: T.yellow }}>When</span> {a.trigger} → <span style={{ color: T.green }}>Then</span> {a.action}
              </div>
            </div>
            <Badge small color={T.text3}>{a.runs} runs</Badge>
            <div style={{ width: 32, height: 18, borderRadius: 9, background: a.active ? T.green : T.surface3, padding: 2, cursor: "pointer" }}>
              <div style={{ width: 14, height: 14, borderRadius: 7, background: "#fff", transition: "transform 0.15s", transform: a.active ? "translateX(14px)" : "translateX(0)" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── REPORTS VIEW ───
function ReportsView() {
  const miniChart = (data, color) => {
    const max = Math.max(...data);
    return (
      <div style={{ display: "flex", alignItems: "end", gap: 2, height: 32 }}>
        {data.map((v, i) => (
          <div key={i} style={{ flex: 1, height: `${(v/max)*100}%`, background: color + "60", borderRadius: 2, minHeight: 2 }} />
        ))}
      </div>
    );
  };

  return (
    <div style={{ padding: 24, overflow: "auto" }}>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20 }}>Reports & Dashboards</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
        <div style={{ background: T.surface2, borderRadius: 10, border: `1px solid ${T.border}`, padding: 16 }}>
          <div style={{ fontSize: 11, color: T.text3, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>Task Completion</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: T.green, marginBottom: 8 }}>87%</div>
          {miniChart([12, 8, 15, 22, 18, 24, 20], T.green)}
          <div style={{ fontSize: 10, color: T.text3, marginTop: 4 }}>Last 7 days</div>
        </div>
        <div style={{ background: T.surface2, borderRadius: 10, border: `1px solid ${T.border}`, padding: 16 }}>
          <div style={{ fontSize: 11, color: T.text3, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>Team Velocity</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: T.accent, marginBottom: 8 }}>34 pts</div>
          {miniChart([28, 32, 24, 36, 30, 34, 34], T.accent)}
          <div style={{ fontSize: 10, color: T.text3, marginTop: 4 }}>Per sprint avg</div>
        </div>
        <div style={{ background: T.surface2, borderRadius: 10, border: `1px solid ${T.border}`, padding: 16 }}>
          <div style={{ fontSize: 11, color: T.text3, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>Workload Balance</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: T.yellow, marginBottom: 8 }}>72%</div>
          {miniChart([60, 75, 88, 70, 65, 72, 72], T.yellow)}
          <div style={{ fontSize: 10, color: T.text3, marginTop: 4 }}>Avg utilization</div>
        </div>
      </div>

      <SectionHeader icon="▥" title="Saved Reports" />
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {[
          { name: "Weekly Sprint Report", type: "project", schedule: "Every Monday 9 AM", lastRun: "Feb 24" },
          { name: "OKR Progress Dashboard", type: "okr", schedule: "Manual", lastRun: "Feb 26" },
          { name: "PLM Pipeline Overview", type: "plm", schedule: "Every Friday", lastRun: "Feb 21" },
          { name: "Campaign Performance", type: "marketing", schedule: "Daily 8 AM", lastRun: "Feb 27" },
          { name: "Team Workload Report", type: "workload", schedule: "Every Monday 8 AM", lastRun: "Feb 24" },
        ].map(r => (
          <div key={r.name} style={{ background: T.surface2, borderRadius: 8, padding: 12, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 32, height: 32, borderRadius: 6, background: T.surface3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>📊</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</div>
              <div style={{ fontSize: 11, color: T.text3 }}>{r.schedule} · Last: {r.lastRun}</div>
            </div>
            <Badge small color={T.accent}>{r.type}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── MAIN APP ───
export default function HelmApp() {
  const [active, setActive] = useState("dashboard");

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
        <Sidebar active={active} setActive={setActive} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ height: 44, borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", padding: "0 20px", gap: 12, flexShrink: 0 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{viewTitle}</span>
            <div style={{ flex: 1 }} />
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 12px", borderRadius: 6, background: T.surface2, border: `1px solid ${T.border}`, fontSize: 12, color: T.text3, cursor: "pointer" }}>
              ⌘K Search...
            </div>
          </div>
          <div style={{ flex: 1, overflow: "auto" }}>
            {renderView()}
          </div>
        </div>
      </div>
    </>
  );
}
