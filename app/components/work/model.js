// Pure helpers for the Projects suite: vocab, dates, and the group/sort/filter engine.
import { AVATAR_BG } from "./theme";

export const STATUS = {
  backlog: { label: "Backlog", tone: "slate" }, todo: { label: "To do", tone: "slate" }, in_progress: { label: "In progress", tone: "blue" },
  in_review: { label: "In review", tone: "violet" }, done: { label: "Done", tone: "green" }, cancelled: { label: "Cancelled", tone: "coral" },
};
export const STATUS_ORDER = ["backlog", "todo", "in_progress", "in_review", "done", "cancelled"];
export const PRIORITY = {
  urgent: { label: "Urgent", tone: "coral", rank: 0 }, high: { label: "High", tone: "amber", rank: 1 }, medium: { label: "Medium", tone: "blue", rank: 2 },
  low: { label: "Low", tone: "slate", rank: 3 }, none: { label: "No priority", tone: "slate", rank: 4 },
};
export const PRIORITY_ORDER = ["urgent", "high", "medium", "low", "none"];
export const HEALTH = {
  on_track: { label: "On track", tone: "green" }, at_risk: { label: "At risk", tone: "amber" }, off_track: { label: "Off track", tone: "coral" },
  on_hold: { label: "On hold", tone: "slate" }, complete: { label: "Complete", tone: "teal" },
};
export const APPROVAL = {
  pending: { label: "Awaiting approval", tone: "amber" }, approved: { label: "Approved", tone: "green" },
  changes: { label: "Changes requested", tone: "violet" }, rejected: { label: "Rejected", tone: "coral" },
};
export const RECURRENCE = { none: "Doesn't repeat", daily: "Daily", weekly: "Weekly", biweekly: "Every 2 weeks", monthly: "Monthly", quarterly: "Quarterly" };

export const isDone = (t) => t.status === "done" || t.status === "cancelled";
export const taskKind = (t) => (t.approval_status && t.approval_status !== "none") ? "approval" : (t.metadata && t.metadata.is_milestone) ? "milestone" : "task";
export const approvalState = (t) => t.approval_status === "pending" && t.metadata?.approval === "changes" ? "changes" : t.approval_status;

// ── dates (all task dates are local 'YYYY-MM-DD') ──
export const pad = (n) => String(n).padStart(2, "0");
export const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseYmd = (s) => { if (!s) return null; const [y, m, d] = String(s).slice(0, 10).split("-").map(Number); return new Date(y, (m || 1) - 1, d || 1); };
export const today = () => ymd(new Date());
export const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
export const diffDays = (a, b) => Math.round((parseYmd(a) - parseYmd(b)) / 864e5);
export const startOfWeek = (s) => { const d = parseYmd(s); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d); };
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const monthName = (m, long) => long ? ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][m] : MON[m];
export const fmtDate = (s, { relative = true } = {}) => {
  if (!s) return "";
  const d = parseYmd(s), t = today(), n = diffDays(String(s).slice(0, 10), t);
  if (relative) { if (n === 0) return "Today"; if (n === 1) return "Tomorrow"; if (n === -1) return "Yesterday"; if (n > 1 && n < 7) return DOW[d.getDay()]; }
  return `${MON[d.getMonth()]} ${d.getDate()}${d.getFullYear() !== new Date().getFullYear() ? ", " + d.getFullYear() : ""}`;
};
export const fmtRange = (a, b) => {
  if (a && b && a !== b) { const x = parseYmd(a), y = parseYmd(b); return x.getMonth() === y.getMonth() && x.getFullYear() === y.getFullYear() ? `${MON[x.getMonth()]} ${x.getDate()} – ${y.getDate()}` : `${fmtDate(a, { relative: false })} – ${fmtDate(b, { relative: false })}`; }
  return fmtDate(b || a);
};
export const isOverdue = (t) => !!t.due_date && !isDone(t) && String(t.due_date).slice(0, 10) < today();
export const dueTone = (t) => !t.due_date || isDone(t) ? "ink3" : isOverdue(t) ? "coral" : diffDays(String(t.due_date).slice(0, 10), today()) <= 1 ? "green" : "ink2";
export const timeAgo = (iso) => {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "just now"; if (m < 60) return `${m}m ago`; const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`; const d = Math.floor(h / 24); if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

// ── people ──
export const personName = (p) => p ? (p.display_name || p.email || "Unknown") : "";
export const initials = (name) => (name || "?").split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
export const avatarColor = (id) => { let h = 0; for (const c of String(id || "")) h = (h * 31 + c.charCodeAt(0)) >>> 0; return AVATAR_BG[h % AVATAR_BG.length]; };

// ── views ──
export const VIEW_TYPES = { list: "List", board: "Board", timeline: "Timeline", calendar: "Calendar" };
export const DEFAULT_COLS = [{ key: "assignee", w: 150 }, { key: "due", w: 130 }, { key: "priority", w: 110 }, { key: "status", w: 120 }];
export const BUILTIN_FIELDS = {
  assignee: { label: "Assignee", w: 150 }, due: { label: "Due date", w: 130 }, priority: { label: "Priority", w: 110 }, status: { label: "Status", w: 120 },
  labels: { label: "Labels", w: 170 }, section: { label: "Section", w: 150 }, start: { label: "Start date", w: 110 }, created: { label: "Created", w: 110 },
  completed: { label: "Completed", w: 110 }, hours: { label: "Est. hours", w: 90 }, deps: { label: "Blocked by", w: 170 }, project: { label: "Project", w: 160 },
};
export const emptyFilters = () => ({ show: "incomplete", assignees: [], statuses: [], priorities: [], labels: [], due: "", q: "", kinds: [] });
export const newView = (type, name) => ({ id: "v_" + Math.random().toString(36).slice(2, 9), name: name || VIEW_TYPES[type], type, group: type === "calendar" ? "none" : "section", sort: [], filters: emptyFilters(), cols: DEFAULT_COLS, zoom: "week", colorBy: "section" });
export const defaultViews = () => ["list", "board", "timeline", "calendar"].map((t) => ({ ...newView(t), id: "v_" + t }));
export const filterCount = (f) => !f ? 0 : (f.assignees?.length ? 1 : 0) + (f.statuses?.length ? 1 : 0) + (f.priorities?.length ? 1 : 0) + (f.labels?.length ? 1 : 0) + (f.due ? 1 : 0) + (f.kinds?.length ? 1 : 0) + (f.show && f.show !== "incomplete" ? 1 : 0);

export function applyFilters(tasks, f, ctx) {
  if (!f) return tasks;
  const t0 = today(), wk = addDays(t0, 7), q = (f.q || "").trim().toLowerCase();
  return tasks.filter((t) => {
    if (f.show === "incomplete" && isDone(t)) return false;
    if (f.show === "done" && !isDone(t)) return false;
    if (f.assignees?.length && !f.assignees.includes(t.assignee_id || "none")) return false;
    if (f.statuses?.length && !f.statuses.includes(t.status)) return false;
    if (f.priorities?.length && !f.priorities.includes(t.priority || "none")) return false;
    if (f.kinds?.length && !f.kinds.includes(taskKind(t))) return false;
    if (f.labels?.length) { const ls = ctx?.labelsOf?.(t.id) || []; if (!f.labels.some((id) => ls.includes(id))) return false; }
    if (f.due) {
      const d = t.due_date ? String(t.due_date).slice(0, 10) : null;
      if (f.due === "none" ? !!d : !d) return false;
      if (f.due === "overdue" && !(d < t0 && !isDone(t))) return false;
      if (f.due === "today" && d !== t0) return false;
      if (f.due === "week" && !(d >= t0 && d <= wk)) return false;
    }
    if (q && !String(t.title || "").toLowerCase().includes(q)) return false;
    return true;
  });
}

const cmp = (a, b) => (a == null && b == null ? 0 : a == null ? 1 : b == null ? -1 : a < b ? -1 : a > b ? 1 : 0);
export function sortValue(t, key, ctx) {
  switch (key) {
    case "title": return String(t.title || "").toLowerCase();
    case "assignee": return t.assignee_id ? personName(ctx?.people?.[t.assignee_id]).toLowerCase() : null;
    case "due": return t.due_date || null;
    case "start": return t.start_date || null;
    case "priority": return PRIORITY[t.priority || "none"]?.rank ?? 4;
    case "status": return STATUS_ORDER.indexOf(t.status);
    case "created": return t.created_at || null;
    case "completed": return t.completed_at || null;
    case "hours": return t.estimated_hours == null ? null : Number(t.estimated_hours);
    default: if (key?.startsWith("cf:")) { const v = ctx?.cfValue?.(t.id, key.slice(3)); const n = Number(v); return v == null || v === "" ? null : isNaN(n) ? String(v).toLowerCase() : n; } return null;
  }
}
export function sortTasks(tasks, sort, ctx) {
  const base = (a, b) => cmp(a.sort_order ?? 0, b.sort_order ?? 0) || cmp(a.created_at, b.created_at);
  if (!sort?.length) return tasks.slice().sort(base);
  return tasks.slice().sort((a, b) => {
    for (const s of sort) { const va = sortValue(a, s.key, ctx), vb = sortValue(b, s.key, ctx); const c = va == null || vb == null ? cmp(va, vb) : cmp(va, vb) * (s.dir === "desc" ? -1 : 1); if (c) return c; }
    return base(a, b);
  });
}

const SEC_TONES = ["teal", "blue", "violet", "pink", "coral", "amber", "green", "slate"];
// Returns [{ key, label, tone|color, tasks, field, value, section? }] — `field`/`value` say what dropping a task into the group should set.
export function groupTasks(tasks, group, ctx) {
  const out = []; const by = new Map();
  const push = (key, def) => { let g = by.get(key); if (!g) { g = { key, tasks: [], ...def }; by.set(key, g); out.push(g); } return g; };
  if (!group || group === "none") return [{ key: "all", label: "", tasks, field: null }];
  if (group === "section") {
    (ctx.sections || []).forEach((s, i) => push(s.id, { label: s.name, color: s.color, tone: SEC_TONES[i % SEC_TONES.length], field: "section_id", value: s.id, section: s }));
    const none = [];
    for (const t of tasks) { const g = by.get(t.section_id); if (g) g.tasks.push(t); else none.push(t); }
    if (none.length || !out.length) out.unshift({ key: "none", label: "No section", tone: "slate", tasks: none, field: "section_id", value: null });
    return out;
  }
  if (group === "status") { STATUS_ORDER.forEach((k) => push(k, { label: STATUS[k].label, tone: STATUS[k].tone, field: "status", value: k })); for (const t of tasks) by.get(t.status)?.tasks.push(t); return out.filter((g) => g.tasks.length || !["backlog", "cancelled", "in_review"].includes(g.key)); }
  if (group === "priority") { PRIORITY_ORDER.forEach((k) => push(k, { label: PRIORITY[k].label, tone: PRIORITY[k].tone, field: "priority", value: k })); for (const t of tasks) by.get(t.priority || "none")?.tasks.push(t); return out; }
  if (group === "assignee") {
    for (const t of tasks) { const id = t.assignee_id || "none"; push(id, { label: id === "none" ? "Unassigned" : personName(ctx.people?.[id]), person: id === "none" ? null : id, field: "assignee_id", value: id === "none" ? null : id }).tasks.push(t); }
    return out.sort((a, b) => (a.key === "none") - (b.key === "none") || a.label.localeCompare(b.label));
  }
  if (group === "due") {
    const t0 = today(), wkEnd = addDays(startOfWeek(t0), 6), nextEnd = addDays(wkEnd, 7);
    const B = [["overdue", "Overdue", "coral"], ["today", "Today", "green"], ["week", "This week", "teal"], ["next", "Next week", "blue"], ["later", "Later", "slate"], ["none", "No due date", "slate"]];
    B.forEach(([k, l, tn]) => push(k, { label: l, tone: tn, field: "due_bucket", value: k }));
    for (const t of tasks) { const d = t.due_date ? String(t.due_date).slice(0, 10) : null; const k = !d ? "none" : d < t0 ? (isDone(t) ? "later" : "overdue") : d === t0 ? "today" : d <= wkEnd ? "week" : d <= nextEnd ? "next" : "later"; by.get(k).tasks.push(t); }
    return out.filter((g) => g.tasks.length);
  }
  if (group === "project") {
    for (const t of tasks) { const p = ctx.projects?.[t.project_id]; push(t.project_id || "none", { label: p ? p.name : "No project", color: p?.color, tone: "slate", field: null }).tasks.push(t); }
    return out.sort((a, b) => a.label.localeCompare(b.label));
  }
  if (group.startsWith("cf:")) {
    const f = ctx.fields?.find((x) => x.id === group.slice(3)); const opts = cfOptions(f);
    opts.forEach((o, i) => push(o.label, { label: o.label, color: o.color, tone: SEC_TONES[i % SEC_TONES.length], field: group, value: o.label }));
    push("", { label: "No value", tone: "slate", field: group, value: "" });
    for (const t of tasks) { const v = ctx.cfValue?.(t.id, f?.id) ?? ""; (by.get(String(v)) || push(String(v), { label: String(v), tone: "slate", field: group, value: v })).tasks.push(t); }
    return out;
  }
  return [{ key: "all", label: "", tasks, field: null }];
}
export const dueBucketDate = (k) => { const t0 = today(); return k === "today" ? t0 : k === "week" ? addDays(startOfWeek(t0), 4) : k === "next" ? addDays(startOfWeek(t0), 11) : k === "later" ? addDays(t0, 21) : k === "none" ? null : undefined; };
export const cfOptions = (f) => { const o = f?.options; const arr = Array.isArray(o) ? o : Array.isArray(o?.choices) ? o.choices : []; return arr.map((x) => (typeof x === "string" ? { label: x } : { label: x.label ?? x.name ?? String(x.value ?? ""), color: x.color })).filter((x) => x.label); };
export const GROUP_OPTIONS = [["section", "Section"], ["assignee", "Assignee"], ["due", "Due date"], ["status", "Status"], ["priority", "Priority"], ["none", "None"]];
export const SORT_OPTIONS = [["due", "Due date"], ["start", "Start date"], ["assignee", "Assignee"], ["priority", "Priority"], ["status", "Status"], ["title", "Alphabetical"], ["created", "Created"], ["completed", "Completed"]];
export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
