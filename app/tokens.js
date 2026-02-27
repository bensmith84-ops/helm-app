// ─── DESIGN TOKENS ───
export const T = {
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
export const USERS = [
  { id: "u1", name: "Ben Harper", avatar: "BH", role: "CEO", email: "ben@helm.io" },
  { id: "u2", name: "Sarah Chen", avatar: "SC", role: "VP Engineering", email: "sarah@helm.io" },
  { id: "u3", name: "Alex Rivera", avatar: "AR", role: "Product Manager", email: "alex@helm.io" },
  { id: "u4", name: "Maya Patel", avatar: "MP", role: "Lead Designer", email: "maya@helm.io" },
  { id: "u5", name: "James Wilson", avatar: "JW", role: "Sr. Engineer", email: "james@helm.io" },
  { id: "u6", name: "Lisa Zhang", avatar: "LZ", role: "R&D Director", email: "lisa@helm.io" },
  { id: "u7", name: "Tom Brooks", avatar: "TB", role: "Marketing Lead", email: "tom@helm.io" },
  { id: "u8", name: "Emma Scott", avatar: "ES", role: "QA Manager", email: "emma@helm.io" },
];

export const getUser = (id) => USERS.find((u) => u.id === id) || USERS[0];
export const priorityColor = (p) => ({ critical: T.red, high: T.red, urgent: T.red, medium: T.yellow, low: T.green, exploratory: T.purple }[p] || T.text3);

export const PROJECTS = [
  { id: "p1", name: "Helm Platform", status: "active", color: T.accent, progress: 42, tasksTotal: 24, tasksDone: 10 },
  { id: "p2", name: "Mobile App", status: "active", color: T.cyan, progress: 18, tasksTotal: 16, tasksDone: 3 },
  { id: "p3", name: "Brand Refresh", status: "active", color: T.pink, progress: 75, tasksTotal: 12, tasksDone: 9 },
  { id: "p4", name: "Q1 Launch", status: "planning", color: T.orange, progress: 5, tasksTotal: 8, tasksDone: 0 },
];

export const TASKS = [
  { id: "tk1", title: "Design system foundation", project: "p1", section: "In Progress", assignee: "u4", priority: "high", status: "in_progress", due: "2026-03-05" },
  { id: "tk2", title: "Supabase schema migration", project: "p1", section: "In Progress", assignee: "u5", priority: "high", status: "in_progress", due: "2026-03-03" },
  { id: "tk3", title: "Auth flow implementation", project: "p1", section: "To Do", assignee: "u2", priority: "high", status: "todo", due: "2026-03-10" },
  { id: "tk4", title: "OKR module data model", project: "p1", section: "To Do", assignee: "u5", priority: "medium", status: "todo", due: "2026-03-12" },
  { id: "tk5", title: "Real-time messaging POC", project: "p1", section: "Backlog", assignee: "u2", priority: "medium", status: "backlog", due: "2026-03-15" },
  { id: "tk6", title: "File upload service", project: "p1", section: "Done", assignee: "u5", priority: "high", status: "done", due: "2026-02-20" },
  { id: "tk7", title: "Navigation prototype", project: "p2", section: "In Progress", assignee: "u4", priority: "high", status: "in_progress", due: "2026-03-08" },
  { id: "tk8", title: "Logo concepts", project: "p3", section: "Done", assignee: "u4", priority: "high", status: "done", due: "2026-02-10" },
];

export const OBJECTIVES = [
  { id: "o1", title: "Launch Helm MVP to first 10 customers", owner: "u1", health: "on_track", progress: 35 },
  { id: "o2", title: "Achieve mobile feature parity", owner: "u2", health: "at_risk", progress: 18 },
  { id: "o3", title: "Establish Helm as a recognizable brand", owner: "u3", health: "on_track", progress: 68 },
];
export const KEY_RESULTS = [
  { id: "kr1", title: "Ship all Phase 1 modules", objective: "o1", target: 5, current: 2, progress: 40 },
  { id: "kr2", title: "p95 latency <200ms on all endpoints", objective: "o1", target: 200, current: 180, progress: 90 },
  { id: "kr3", title: "Onboard 10 beta customers, >80% WAR", objective: "o1", target: 10, current: 3, progress: 30 },
  { id: "kr4", title: "Task + messaging on mobile", objective: "o2", target: 2, current: 0, progress: 0 },
  { id: "kr5", title: "Complete brand guidelines & assets", objective: "o3", target: 1, current: 0.75, progress: 75 },
  { id: "kr6", title: "1,000 waitlist signups", objective: "o3", target: 1000, current: 620, progress: 62 },
];

export const CHANNELS = [
  { id: "ch1", name: "general", unread: 3 },
  { id: "ch2", name: "engineering", unread: 12 },
  { id: "ch3", name: "design", unread: 0 },
  { id: "ch4", name: "product-updates", unread: 5 },
];
export const MESSAGES = {
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

export const DOCS = [
  { id: "d1", title: "Helm Architecture Overview", author: "u2", updated: "2 days ago", emoji: "🏗️", status: "published" },
  { id: "d2", title: "Design System Tokens", author: "u4", updated: "1 day ago", emoji: "🎨", status: "published" },
  { id: "d3", title: "API Design Conventions", author: "u5", updated: "3 days ago", emoji: "📡", status: "draft" },
  { id: "d4", title: "Sprint 3 Retro Notes", author: "u3", updated: "4 days ago", emoji: "📝", status: "published" },
  { id: "d5", title: "Security & Compliance Plan", author: "u2", updated: "1 week ago", emoji: "🔒", status: "draft" },
  { id: "d6", title: "PLM Process Guide", author: "u6", updated: "5 days ago", emoji: "🧪", status: "published" },
];

export const CALENDAR_EVENTS = [
  { id: "ev1", title: "Sprint Planning", time: "9:00 AM", duration: "1h", color: T.accent, attendees: ["u1", "u2", "u3"], day: 0, hasCall: true },
  { id: "ev2", title: "Design Review", time: "11:00 AM", duration: "45m", color: T.pink, attendees: ["u3", "u4"], day: 0, hasCall: true },
  { id: "ev3", title: "1:1 Ben ↔ Sarah", time: "2:00 PM", duration: "30m", color: T.purple, attendees: ["u1", "u2"], day: 0, hasCall: false },
  { id: "ev4", title: "PLM Gate Review", time: "10:00 AM", duration: "2h", color: T.orange, attendees: ["u1", "u3", "u6", "u8"], day: 1, hasCall: true },
  { id: "ev5", title: "Marketing Sync", time: "3:00 PM", duration: "30m", color: T.green, attendees: ["u3", "u7"], day: 1, hasCall: false },
  { id: "ev6", title: "All Hands", time: "4:00 PM", duration: "1h", color: T.cyan, attendees: USERS.map(u => u.id), day: 2, hasCall: true },
  { id: "ev7", title: "Stability Review", time: "10:00 AM", duration: "1h", color: T.yellow, attendees: ["u6", "u8"], day: 3, hasCall: false },
  { id: "ev8", title: "Sprint Demo", time: "3:00 PM", duration: "1h", color: T.accent, attendees: ["u1", "u2", "u3", "u4", "u5"], day: 4, hasCall: true },
];

export const CAMPAIGNS = [
  { id: "cmp1", name: "Q1 Product Launch", type: "product_launch", status: "active", color: T.accent, start: "2026-02-01", end: "2026-03-31", budget: 50000, spent: 21000, owner: "u7" },
  { id: "cmp2", name: "Brand Awareness Push", type: "brand_awareness", status: "active", color: T.purple, start: "2026-03-01", end: "2026-04-30", budget: 30000, spent: 5000, owner: "u7" },
  { id: "cmp3", name: "Developer Community", type: "content_marketing", status: "planning", color: T.cyan, start: "2026-03-15", end: "2026-06-30", budget: 15000, spent: 0, owner: "u3" },
];
export const CAMPAIGN_CONTENT = [
  { id: "cc1", title: "Launch Blog Post", campaign: "cmp1", type: "blog_post", channel: "Blog", status: "published", date: "2026-02-27", assignee: "u3" },
  { id: "cc2", title: "Product Hunt Launch", campaign: "cmp1", type: "product_update", channel: "Product Hunt", status: "scheduled", date: "2026-03-03", assignee: "u7" },
  { id: "cc3", title: "Twitter Thread - Features", campaign: "cmp1", type: "tweet_thread", channel: "Twitter/X", status: "approved", date: "2026-03-03", assignee: "u7" },
  { id: "cc4", title: "LinkedIn Article", campaign: "cmp2", type: "linkedin_article", channel: "LinkedIn", status: "draft", date: "2026-03-05", assignee: "u7" },
  { id: "cc5", title: "Intro Video", campaign: "cmp1", type: "video", channel: "YouTube", status: "in_review", date: "2026-03-01", assignee: "u4" },
  { id: "cc6", title: "Launch Email Blast", campaign: "cmp1", type: "email", channel: "Email", status: "scheduled", date: "2026-03-03", assignee: "u7" },
  { id: "cc7", title: "Case Study: Beta User", campaign: "cmp2", type: "case_study", channel: "Blog", status: "idea", date: "2026-03-10", assignee: "u3" },
  { id: "cc8", title: "Dev Tutorial #1", campaign: "cmp3", type: "blog_post", channel: "Blog", status: "draft", date: "2026-03-20", assignee: "u5" },
];

export const PLM_PROGRAMS = [
  { id: "plm1", name: "VitaGlow Serum", code: "PRJ-2026-001", category: "Skincare", subcategory: "Anti-aging", stage: "development", type: "new_product", priority: "high", owner: "u6", launch: "2026-06-15", progress: 45 },
  { id: "plm2", name: "EnergyPlus Drink", code: "PRJ-2026-002", category: "Beverages", subcategory: "Functional", stage: "pilot", type: "new_product", priority: "critical", owner: "u6", launch: "2026-04-01", progress: 72 },
  { id: "plm3", name: "ProBio Capsules v2", code: "PRJ-2026-003", category: "Supplements", subcategory: "Digestive", stage: "concept", type: "reformulation", priority: "medium", owner: "u6", launch: "2026-09-01", progress: 15 },
];
export const PLM_CLAIMS = [
  { id: "cl1", program: "plm1", text: "Reduces fine lines by 30% in 4 weeks", type: "efficacy", status: "researching", evidence: "clinical_pilot" },
  { id: "cl2", program: "plm1", text: "Dermatologist tested and recommended", type: "dermatologist_tested", status: "substantiated", evidence: "clinical_pivotal" },
  { id: "cl3", program: "plm2", text: "Sustained energy for 6+ hours", type: "efficacy", status: "proposed", evidence: "consumer_study" },
  { id: "cl4", program: "plm2", text: "Zero crash formula", type: "comparative", status: "in_legal_review", evidence: "clinical_pilot" },
];
export const PLM_FORMULAS = [
  { id: "f1", program: "plm1", name: "VitaGlow Serum v3.2", version: "3.2", status: "testing", form: "serum", items: 14, cost: 4.82 },
  { id: "f2", program: "plm2", name: "EnergyPlus RTD v2.1", version: "2.1", status: "pilot_approved", form: "liquid", items: 18, cost: 1.45 },
  { id: "f3", program: "plm1", name: "VitaGlow Serum v3.1", version: "3.1", status: "superseded", form: "serum", items: 13, cost: 5.10 },
];
export const PLM_EXPERIMENTS = [
  { id: "exp1", program: "plm1", name: "Vitamin C Stability DOE", type: "stability", design: "central_composite", status: "completed", factors: 3, runs: 20, rSquared: 0.94 },
  { id: "exp2", program: "plm1", name: "Emulsifier Screening", type: "formulation", design: "screening", status: "analyzing", factors: 5, runs: 12, rSquared: null },
  { id: "exp3", program: "plm2", name: "Caffeine Release Profile", type: "bioavailability", design: "full_factorial", status: "in_progress", factors: 2, runs: 8, rSquared: null },
];
export const PLM_TRIALS = [
  { id: "tr1", program: "plm2", number: "PILOT-001", name: "EnergyPlus First Pilot", type: "pilot", status: "completed", batchSize: "500L", yield: 94.2, disposition: "approved" },
  { id: "tr2", program: "plm2", number: "SCALE-001", name: "EnergyPlus Scale-Up", type: "scale_up", status: "in_progress", batchSize: "5000L", yield: null, disposition: "pending" },
  { id: "tr3", program: "plm1", number: "LAB-012", name: "VitaGlow Bench Trial", type: "lab_bench", status: "completed", batchSize: "2kg", yield: 97.1, disposition: "approved" },
];
export const PLM_TESTS = [
  { id: "ts1", program: "plm2", trial: "tr1", name: "pH", category: "chemical", spec: "3.8–4.2", result: "4.0", status: "pass" },
  { id: "ts2", program: "plm2", trial: "tr1", name: "Viscosity", category: "physical", spec: "800–1200 cP", result: "980 cP", status: "pass" },
  { id: "ts3", program: "plm2", trial: "tr1", name: "Microbial (TPC)", category: "microbiological", spec: "<100 CFU/mL", result: "<10 CFU/mL", status: "pass" },
  { id: "ts4", program: "plm1", trial: "tr3", name: "Active Assay (Vitamin C)", category: "chemical", spec: "95–105%", result: "101.3%", status: "pass" },
  { id: "ts5", program: "plm1", trial: "tr3", name: "Appearance", category: "physical", spec: "Clear, pale yellow", result: "Slight haze", status: "marginal" },
];

export const AUTOMATIONS = [
  { id: "au1", name: "Auto-assign urgent tasks to Sarah", trigger: "Task priority set to urgent", action: "Assign to Sarah Chen", active: true, runs: 23 },
  { id: "au2", name: "Notify #engineering on deploy", trigger: "Task completed in DevOps section", action: "Post to #engineering", active: true, runs: 47 },
  { id: "au3", name: "Move to Done when all subtasks complete", trigger: "All subtasks marked done", action: "Move task to Done", active: true, runs: 156 },
  { id: "au4", name: "Weekly status update reminder", trigger: "Every Friday 9 AM", action: "Send notification to project leads", active: false, runs: 8 },
];
