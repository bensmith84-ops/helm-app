"use client";
// Shell of the new Projects suite: navigation, project header and tabs, saved
// views, the task pane, and the modals. Data comes from useWorkStore.
import { useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense } from "react";
import { BASE_CSS, SWATCHES, tone, themeVars } from "./theme";
import { ModeProvider, Icon, Popover, usePop, MenuItem, MenuSep, MenuLabel, Avatar, AvatarStack, Chip, Modal, Field, Toasts, useToasts, PersonPicker, ColorPicker, DatePicker, OptionList, Empty, Seg } from "./ui";
import { useWorkStore } from "./store";
import { useWorkExtras } from "./extrasStore";
import { HEALTH, VIEW_TYPES, newView, same, isDone, personName, today, fmtDate, plural, emptyFilters, DEFAULT_COLS } from "./model";
import { useViewCtx, useGroups } from "./ops";
import { CELL_CSS } from "./cells";
import ListView, { LIST_CSS, BulkBar } from "./ListView";
import BoardView, { BOARD_CSS } from "./BoardView";
import TimelineView, { TIMELINE_CSS } from "./TimelineView";
import CalendarView, { CALENDAR_CSS } from "./CalendarView";
import TaskPane, { PANE_CSS } from "./TaskPane";
import ViewBar, { BAR_CSS } from "./ViewBar";
import { Overview, Dashboard, Portfolios, Workload, PAGES_CSS } from "./pages";
import { RulesTab, DocsTab, FormsTab, EXTRAS_CSS } from "./extras";
import { ProjectModal, TemplateManager, TemplateEditor, SaveTemplateModal, DuplicateModal, MembersModal, DIALOG_CSS } from "./projectDialogs";
const AsanaImportModal = lazy(() => import("../AsanaImport"));

const SHELL_CSS = `
.hw-app{display:flex;flex:1;min-width:0;min-height:0;height:100%;background:var(--paper);position:relative;overflow:hidden}
.hw-nav{width:252px;flex:none;display:flex;flex-direction:column;min-height:0;border-right:1px solid var(--line);background:var(--paper)}
.hw-nav-h{padding:14px 14px 10px;display:flex;align-items:center;gap:8px}
.hw-nav-h h2{margin:0;font-weight:700;font-size:16px;flex:1}
.hw-nav-b{flex:1;min-height:0;overflow-y:auto;padding:0 8px 10px}
.hw-ni{display:flex;align-items:center;gap:9px;height:32px;padding:0 9px;border-radius:8px;cursor:pointer;color:var(--ink2);font-weight:500;position:relative;user-select:none;border:none;background:transparent;width:100%;text-align:left}
.hw-ni:hover{background:var(--hover);color:var(--ink)}
.hw-ni.on{background:var(--surface);color:var(--ink);box-shadow:var(--sh1)}
.hw-ni .sq{width:10px;height:10px;border-radius:3.5px;flex:none}
.hw-ni .n{margin-left:auto;font-size:11px;font-variant-numeric:tabular-nums;color:var(--ink3);font-weight:500}
.hw-ni .n.late{color:var(--coral);font-weight:650}
.hw-ni .st{opacity:0;color:var(--ink4);display:inline-flex}
.hw-ni:hover .st,.hw-ni .st.on{opacity:1}.hw-ni .st.on{color:var(--amber)}
.hw-nav-l{display:flex;align-items:center;padding:14px 9px 5px}
.hw-nav-f{padding:8px 10px;border-top:1px solid var(--line);display:flex;align-items:center;gap:6px}
.hw-main{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;position:relative}
.hw-top{background:var(--surface);border-bottom:1px solid var(--line);padding:12px 18px 0;flex:none}
.hw-top-r{display:flex;align-items:center;gap:8px;min-height:36px}
.hw-top h1{margin:0;font-weight:700;font-size:19px;line-height:1.2;min-width:80px;flex:0 1 auto}
.hw-psq{width:30px;height:30px;border-radius:9px;flex:none;display:flex;align-items:center;justify-content:center;color:#fff;cursor:pointer}
.hw-body{flex:1;min-height:0;display:flex;position:relative}
.hw-view{flex:1;min-width:0;min-height:0;display:flex;flex-direction:column;position:relative}
.hw-beta{display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--accent-ink);background:var(--accent-soft);padding:2px 8px;border-radius:10px}
.hw-skel{height:14px;border-radius:6px;background:linear-gradient(90deg,var(--sunken),var(--line),var(--sunken));background-size:200% 100%;animation:hw-sh 1.2s infinite linear}
@keyframes hw-sh{to{background-position:-200% 0}}
@media (max-width:900px){.hw-nav{position:absolute;z-index:40;left:0;top:0;bottom:0;box-shadow:var(--sh3);width:min(300px,86vw)}.hw-pane{position:absolute;inset:0;width:auto;z-index:30}.hw-pane-rz{display:none}.hw-top{padding:10px 12px 0}.hw-top h1{font-size:17px}.hw-bar{padding:8px 12px}.hw-page-in{padding:14px 12px 40px;grid-template-columns:1fr !important}.hw-board{padding:10px 12px}}
`;
const CSS = [BASE_CSS, SHELL_CSS, CELL_CSS, BAR_CSS, LIST_CSS, BOARD_CSS, TIMELINE_CSS, CALENDAR_CSS, PANE_CSS, PAGES_CSS, EXTRAS_CSS, DIALOG_CSS].join("\n");
const EXTRA_TABS = ["overview", "dashboard", "docs", "forms", "rules"];
const VIEW_ICON = { list: "list", board: "board", timeline: "timeline", calendar: "cal" };
const ls = { get: (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } }, set: (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch {} } };
const isNarrow = () => typeof window !== "undefined" && window.innerWidth < 900;
const MY_VIEW = { id: "my", name: "My tasks", type: "list", group: "due", sort: [{ key: "due", dir: "asc" }], filters: emptyFilters(), cols: [{ key: "project", w: 190 }, { key: "due", w: 130 }, { key: "priority", w: 110 }] };

export default function WorkApp({ db, user, profile, mode = "light", tokens, onClassic, onCelebrate, onOpenDoc, pendingTaskId, clearPendingTask, pendingProjectId, clearPendingProject }) {
  const { toasts, toast, dismiss } = useToasts();
  const theme = useMemo(() => ({ mode, vars: themeVars(tokens, mode === "dark") }), [mode, tokens]);
  const core = useWorkStore({ db, user, profile, toast, onCelebrate });
  const store = useWorkExtras(core);
  const [page, setPage] = useState(() => ls.get("hw.page", { kind: "my" })); // { kind: 'my' | 'project' | 'portfolios' | 'workload', id? }
  const [openId, setOpenId] = useState(null); const [sel, setSel] = useState(() => new Set());
  const [navOpen, setNavOpen] = useState(() => (isNarrow() ? false : ls.get("hw.nav", true))); const [paneW, setPaneW] = useState(() => ls.get("hw.paneW", 540));
  const [modal, setModal] = useState(null); const [navQ, setNavQ] = useState(""); const [showArchived, setShowArchived] = useState(false);
  const go = useCallback((p) => { setPage(p); setSel(new Set()); setOpenId(null); if (isNarrow()) setNavOpen(false); }, []);
  useEffect(() => { ls.set("hw.page", page); }, [page]); useEffect(() => { if (!isNarrow()) ls.set("hw.nav", navOpen); }, [navOpen]); useEffect(() => { ls.set("hw.paneW", paneW); }, [paneW]);

  // deep links + address bar
  useEffect(() => { if (!pendingProjectId || store.loading) return; if (store.projectsById[pendingProjectId]) go({ kind: "project", id: pendingProjectId }); clearPendingProject?.(); }, [pendingProjectId, store.loading]);
  useEffect(() => {
    if (!pendingTaskId || store.loading) return;
    (async () => { const t = store.tasksById.get(pendingTaskId) || (await store.fetchTask(pendingTaskId)); if (t) { if (t.project_id && store.projectsById[t.project_id]) setPage({ kind: "project", id: t.project_id }); if (t.parent_task_id) store.loadSubtasks(t.parent_task_id); setOpenId(t.id); } clearPendingTask?.(); })();
  }, [pendingTaskId, store.loading]);
  useEffect(() => {
    if (typeof window === "undefined" || pendingProjectId || pendingTaskId || store.loading) return;
    if (!/^\/projects(\/|$)/.test(window.location.pathname) && !/work-preview/.test(window.location.pathname)) return;
    if (/work-preview/.test(window.location.pathname)) return;
    const want = openId && !String(openId).startsWith("tmp-") ? "/projects/t/" + openId : page.kind === "project" ? "/projects/p/" + page.id : "/projects";
    if (window.location.pathname !== want) window.history.replaceState(null, "", want + window.location.search);
  }, [openId, page, pendingProjectId, pendingTaskId, store.loading]);
  useEffect(() => { if (!store.loading && page.kind === "project" && !store.projectsById[page.id]) setPage({ kind: "my" }); }, [store.loading, page, store.projectsById]);

  // after an import the project list reloads; open the new project once it shows up
  const [wantPid, setWantPid] = useState(null);
  useEffect(() => { if (wantPid && !store.loading && store.projectsById[wantPid]) { go({ kind: "project", id: wantPid }); setWantPid(null); } }, [wantPid, store.loading, store.projectsById]);

  // global keys
  useEffect(() => {
    const key = (e) => {
      const tag = e.target?.tagName; const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || e.target?.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey && !typing) { e.preventDefault(); store.undo(); return; }
      if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") { if (openId) setOpenId(null); else if (sel.size) setSel(new Set()); }
      else if (e.key === "/") { const el = document.querySelector("[data-hw-search]"); if (el) { e.preventDefault(); el.focus(); } }
      else if (e.key === "q" || e.key === "n") { e.preventDefault(); setModal({ kind: "quick" }); }
      else if (e.key === "?") setModal({ kind: "keys" });
    };
    document.addEventListener("keydown", key); return () => document.removeEventListener("keydown", key);
  }, [openId, sel, store.undo]);

  const openTask = useCallback((t) => { setOpenId(t.id); if (t.parent_task_id) store.loadSubtasks(t.parent_task_id); }, [store.loadSubtasks]);
  const openTaskObj = openId ? store.tasksById.get(openId) : null;
  useEffect(() => { if (openId && !openTaskObj && !store.loading) { const t = setTimeout(() => setOpenId((id) => (id === openId && !store.tasksById.get(id) ? null : id)), 1500); return () => clearTimeout(t); } }, [openId, openTaskObj, store.loading]);

  const project = page.kind === "project" ? store.projectsById[page.id] : null;
  const active = store.projects.filter((p) => p.status !== "archived"); const archived = store.projects.filter((p) => p.status === "archived");
  const favs = active.filter((p) => store.favorites.has(p.id));
  const navList = (navQ.trim() ? active.filter((p) => p.name.toLowerCase().includes(navQ.trim().toLowerCase())) : active);
  const myOpen = useMemo(() => store.tasks.filter((t) => t.assignee_id === store.uid && !isDone(t)).length, [store.tasks, store.uid]);

  const navProject = (p) => { const s = store.projectStats[p.id] || {}; const on = page.kind === "project" && page.id === p.id; return (
    <button key={p.id} className={"hw-ni" + (on ? " on" : "")} onClick={() => go({ kind: "project", id: p.id })} title={p.name}>
      <span className="sq" style={{ background: p.color || "var(--accent)" }} /><span className="hw-trunc" style={{ flex: 1 }}>{p.name}</span>
      <span className={"st" + (store.favorites.has(p.id) ? " on" : "")} onClick={(e) => { e.stopPropagation(); store.toggleFavorite(p.id); }}><Icon name="star" size={13} fill={store.favorites.has(p.id) ? "currentColor" : "none"} /></span>
      {s.overdue > 0 ? <span className="n late" title={plural(s.overdue, "overdue task")}>{s.overdue}</span> : s.open > 0 ? <span className="n">{s.open}</span> : null}
    </button>); };

  return (
    <ModeProvider value={theme}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="hw hw-app" data-mode={mode} style={theme.vars}>
        {navOpen && <aside className="hw-nav">
          <div className="hw-nav-h"><h2>Projects</h2><span className="hw-beta">New</span>
            <button className="hw-icb" title="Hide sidebar" onClick={() => setNavOpen(false)}><Icon name="side" /></button></div>
          <div style={{ padding: "0 10px 10px", display: "flex", gap: 6 }}>
            <button className="hw-btn primary" style={{ flex: 1, justifyContent: "center" }} onClick={() => setModal({ kind: "quick" })}><Icon name="plus" size={15} sw={2.2} />New task</button>
            {!store.external && <button className="hw-btn" title="New project" onClick={() => setModal({ kind: "project" })}><Icon name="folder" size={15} /></button>}
          </div>
          <div className="hw-nav-b hw-scroll">
            <button className={"hw-ni" + (page.kind === "my" ? " on" : "")} onClick={() => go({ kind: "my" })}><Icon name="check" size={16} />My tasks{myOpen > 0 && <span className="n">{myOpen}</span>}</button>
            {!store.external && <>
              <button className={"hw-ni" + (page.kind === "portfolios" ? " on" : "")} onClick={() => go({ kind: "portfolios" })}><Icon name="case" size={16} />Portfolios</button>
              <button className={"hw-ni" + (page.kind === "workload" ? " on" : "")} onClick={() => go({ kind: "workload" })}><Icon name="users" size={16} />Workload</button>
            </>}
            {favs.length > 0 && <><div className="hw-nav-l"><span className="hw-eyebrow">Starred</span></div>{favs.map((p) => navProject(p))}</>}
            <div className="hw-nav-l"><span className="hw-eyebrow" style={{ flex: 1 }}>All projects</span><span className="hw-num" style={{ fontSize: 11, color: "var(--ink3)" }}>{active.length}</span></div>
            {active.length > 8 && <label className="hw-search" style={{ width: "auto", margin: "0 0 4px", height: 28 }}><Icon name="search" size={14} /><input className="hw-bare" placeholder="Find a project" value={navQ} onChange={(e) => setNavQ(e.target.value)} /></label>}
            {store.loading ? [70, 55, 80, 62, 74].map((w, i) => <div key={i} style={{ padding: "9px" }}><div className="hw-skel" style={{ width: w + "%" }} /></div>) : navList.map((p) => navProject(p))}
            {!store.loading && !navList.length && <div style={{ padding: "8px 9px", color: "var(--ink3)", fontSize: 12.5 }}>{navQ ? "No projects match" : "No projects yet"}</div>}
            {archived.length > 0 && <><button className="hw-ni" style={{ marginTop: 8, color: "var(--ink3)" }} onClick={() => setShowArchived((v) => !v)}><Icon name="archive" size={15} />Archived<span className="n">{archived.length}</span></button>{showArchived && archived.map((p) => navProject(p))}</>}
          </div>
          {onClassic && <div className="hw-nav-f"><button className="hw-btn ghost sm" onClick={onClassic} title="Switch back to the classic Projects module"><Icon name="undo" size={14} />Back to classic</button><span style={{ flex: 1 }} /><button className="hw-icb sm" title="Keyboard shortcuts" onClick={() => setModal({ kind: "keys" })}><Icon name="info" size={15} /></button></div>}
        </aside>}
        <main className="hw-main">
          {store.error ? <Empty title="Couldn't load projects" icon="alert">{store.error}</Empty>
            : page.kind === "project" && project ? <ProjectPage key={project.id} store={store} project={project} openId={openId} onOpen={openTask} sel={sel} setSel={setSel} navOpen={navOpen} setNavOpen={setNavOpen} setModal={setModal} onOpenDoc={onOpenDoc} toast={toast} go={go} />
            : page.kind === "portfolios" ? <Portfolios store={store} go={go} navBtn={!navOpen && <NavBtn onClick={() => setNavOpen(true)} />} />
            : page.kind === "workload" ? <Workload store={store} onOpen={openTask} navBtn={!navOpen && <NavBtn onClick={() => setNavOpen(true)} />} />
            : <MyTasks store={store} openId={openId} onOpen={openTask} sel={sel} setSel={setSel} navBtn={!navOpen && <NavBtn onClick={() => setNavOpen(true)} />} setModal={setModal} />}
          {openTaskObj && page.kind !== "project" && page.kind !== "my" && <div style={{ position: "absolute", right: 0, top: 0, bottom: 0, display: "flex", boxShadow: "var(--sh3)", zIndex: 25 }}><TaskPane store={store} task={openTaskObj} onClose={() => setOpenId(null)} onOpen={openTask} width={paneW} setWidth={setPaneW} /></div>}
        </main>
        {openTaskObj && (page.kind === "project" || page.kind === "my") && <TaskPane store={store} task={openTaskObj} onClose={() => setOpenId(null)} onOpen={openTask} width={paneW} setWidth={setPaneW} />}
      </div>
      {modal?.kind === "quick" && <QuickAdd store={store} defaults={{ project_id: project?.id || null, ...(modal.defaults || {}) }} onClose={() => setModal(null)} onCreated={(t) => { toast("Task added", { label: "Open", run: () => setOpenId(t.id) }); }} />}
      {modal?.kind === "project" && <ProjectModal store={store} onClose={() => setModal(null)} onDone={(p) => { setModal(null); go({ kind: "project", id: p.id }); }} onManageTemplates={() => setModal({ kind: "templates" })} onImport={() => setModal({ kind: "asana" })} />}
      {modal?.kind === "edit" && <ProjectModal store={store} project={modal.project} onClose={() => setModal(null)} onDone={() => setModal(null)} />}
      {modal?.kind === "templates" && <TemplateManager store={store} onClose={() => setModal(null)} onEdit={(t) => setModal({ kind: "template", tmpl: t })} />}
      {modal?.kind === "template" && <TemplateEditor store={store} tmpl={modal.tmpl} onClose={() => setModal({ kind: "templates" })} />}
      {modal?.kind === "saveTemplate" && <SaveTemplateModal store={store} project={modal.project} onClose={() => setModal(null)} />}
      {modal?.kind === "duplicate" && <DuplicateModal store={store} project={modal.project} onClose={() => setModal(null)} onDone={(p) => { setModal(null); go({ kind: "project", id: p.id }); }} />}
      {modal?.kind === "members" && store.projectsById[modal.pid] && <MembersModal store={store} project={store.projectsById[modal.pid]} onClose={() => setModal(null)} />}
      {modal?.kind === "asana" && <Suspense fallback={null}><AsanaImportModal onClose={() => setModal(null)} onImported={(id) => { setModal(null); if (id) setWantPid(id); store.reload(); }} /></Suspense>}
      {modal?.kind === "keys" && <KeysModal onClose={() => setModal(null)} />}
      <Toasts toasts={toasts} dismiss={dismiss} />
    </ModeProvider>
  );
}
const NavBtn = ({ onClick }) => <button className="hw-icb" title="Show sidebar" onClick={onClick}><Icon name="side" /></button>;

// ── one project: header, tabs (saved views), toolbar, the view itself ──
function ProjectPage({ store, project, openId, onOpen, sel, setSel, navOpen, setNavOpen, setModal, onOpenDoc, toast, go }) {
  const pid = project.id; const saved = store.viewsOf(project);
  const [tab, setTab] = useState(() => { const t = ls.get("hw.tab." + pid, null); return t && (EXTRA_TABS.includes(t) || saved.some((v) => v.id === t)) ? t : saved[0].id; });
  const [local, setLocal] = useState(() => ls.get("hw.views." + pid, {})); const [q, setQ] = useState("");
  const menu = usePop(), health = usePop(), addView = usePop(); const share = { toggle: () => setModal({ kind: "members", pid }) }; const nRules = store.rules.filter((r) => r.project_id === pid && r.is_active).length; const nDocs = store.docs.filter((d) => d.project_id === pid || d.id === project.linked_doc_id).length; const [tabMenu, setTabMenu] = useState(null); const [renaming, setRenaming] = useState(null);
  useEffect(() => { ls.set("hw.tab." + pid, tab); setSel(new Set()); }, [tab, pid]); useEffect(() => { ls.set("hw.views." + pid, Object.keys(local).length ? local : null); }, [local, pid]);
  const savedView = saved.find((v) => v.id === tab) || null;
  const view = useMemo(() => (savedView ? { ...savedView, ...(local[savedView.id] || {}) } : null), [savedView, local]);
  const dirty = !!(savedView && local[savedView.id] && !same(view, savedView));
  const onView = useCallback((patch) => setLocal((p) => ({ ...p, [tab]: { ...(p[tab] || {}), ...patch } })), [tab]);
  const ctx = useViewCtx(store, pid); const tasks = store.tasksOf.get(pid) || NONE;
  const { groups, count, visible } = useGroups(tasks, view || saved[0], ctx, q);
  const stats = store.projectStats[pid] || { total: 0, done: 0, overdue: 0 }; const members = store.membersOf(pid);
  const canEdit = true; const h = HEALTH[project.health] || HEALTH.on_track;
  const saveView = () => { store.saveViews(pid, saved.map((v) => (v.id === tab ? view : v))); setLocal((p) => { const n = { ...p }; delete n[tab]; return n; }); toast("View saved for everyone"); };
  const addNew = (type) => { const v = newView(type); store.saveViews(pid, [...saved, v]); setTab(v.id); addView.close(); };
  const isView = !!view;
  return (<>
    <div className="hw-top">
      <div className="hw-top-r">
        {!navOpen && <NavBtn onClick={() => setNavOpen(true)} />}
        <span className="hw-psq" style={{ background: project.color || "var(--accent)" }} onClick={menu.toggle}><Icon name="list" size={16} sw={2} /></span>
        <h1 className="hw-trunc">{project.name}</h1>
        <button className="hw-icb" onClick={menu.toggle}><Icon name="chevD" /></button>
        <button className="hw-icb" title={store.favorites.has(pid) ? "Remove star" : "Star this project"} onClick={() => store.toggleFavorite(pid)} style={store.favorites.has(pid) ? { color: "var(--amber)" } : undefined}><Icon name="star" fill={store.favorites.has(pid) ? "currentColor" : "none"} /></button>
        <button className="hw-chip" style={{ ...tone(h.tone), border: "none", cursor: "pointer", height: 24, padding: "0 10px" }} onClick={health.toggle}><i />{h.label}</button>
        {project.status === "archived" && <Chip t="slate">Archived</Chip>}
        <span style={{ flex: 1 }} />
        <span className="hw-num" style={{ fontSize: 12, color: "var(--ink3)", whiteSpace: "nowrap", display: openId ? "none" : undefined }}>{stats.done}/{stats.total} done{stats.overdue > 0 && <span style={{ color: "var(--coral)", fontWeight: 600 }}> · {stats.overdue} overdue</span>}</span>
        <span onClick={share.toggle} style={{ cursor: "pointer", display: "inline-flex" }}><AvatarStack people={members} max={5} size={26} /></span>
        <button className="hw-btn sm" onClick={share.toggle}><Icon name="users" size={14} />Share</button>
      </div>
      <div className="hw-tabs hw-scroll" style={{ marginTop: 8, overflowX: "auto" }}>
        <button className={"hw-tab" + (tab === "overview" ? " on" : "")} onClick={() => setTab("overview")}><Icon name="note" size={15} />Overview</button>
        {saved.map((v) => renaming === v.id
          ? <input key={v.id} className="hw-input" style={{ width: 130, height: 26 }} autoFocus defaultValue={v.name} onBlur={(e) => { const name = e.target.value.trim(); if (name && name !== v.name) store.saveViews(pid, saved.map((x) => (x.id === v.id ? { ...x, name } : x))); setRenaming(null); }} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); if (e.key === "Escape") setRenaming(null); }} />
          : <button key={v.id} className={"hw-tab" + (tab === v.id ? " on" : "")} onClick={() => setTab(v.id)} onDoubleClick={() => setRenaming(v.id)} onContextMenu={(e) => { e.preventDefault(); setTabMenu({ v, x: e.clientX, y: e.clientY }); }}><Icon name={VIEW_ICON[v.type]} size={15} />{v.name}{local[v.id] && !same({ ...v, ...local[v.id] }, v) && <span className="hw-dot" style={{ width: 5, height: 5, background: "var(--accent)" }} />}</button>)}
        <button className={"hw-tab" + (tab === "dashboard" ? " on" : "")} onClick={() => setTab("dashboard")}><Icon name="chart" size={15} />Dashboard</button>
        <button className="hw-icb sm" style={{ margin: "0 4px" }} title="Add a view" onClick={addView.toggle}><Icon name="plus" size={15} /></button>
        <span style={{ width: 1, height: 18, background: "var(--line2)", margin: "0 6px", flex: "none" }} />
        <button className={"hw-tab" + (tab === "docs" ? " on" : "")} onClick={() => setTab("docs")}><Icon name="note" size={15} />Docs{nDocs > 0 && <span className="hw-num" style={{ fontSize: 11, color: "var(--ink3)" }}>{nDocs}</span>}</button>
        <button className={"hw-tab" + (tab === "forms" ? " on" : "")} onClick={() => setTab("forms")}><Icon name="inbox" size={15} />Forms</button>
        <button className={"hw-tab" + (tab === "rules" ? " on" : "")} onClick={() => setTab("rules")}><Icon name="zap" size={15} />Rules{nRules > 0 && <span className="hw-num" style={{ fontSize: 11, color: "var(--ink3)" }}>{nRules}</span>}</button>
      </div>
    </div>
    {isView && <ViewBar store={store} view={view} onView={onView} ctx={ctx} projectId={pid} q={q} setQ={setQ} dirty={dirty} onSave={saveView} onReset={() => setLocal((p) => { const n = { ...p }; delete n[tab]; return n; })} onAdd={() => setModal({ kind: "quick", defaults: { project_id: pid } })} count={openId || dirty ? null : count} canEdit={canEdit}
      extra={view.type === "timeline" ? <><Seg value={view.zoom || "week"} options={[["day", "Days"], ["week", "Weeks"], ["month", "Months"], ["quarter", "Quarters"]]} onChange={(z) => onView({ zoom: z })} /></> : null} />}
    <div className="hw-body">
      <div className="hw-view">
        {tab === "overview" ? <Overview store={store} project={project} onOpen={onOpen} onEdit={() => setModal({ kind: "edit", project })} />
          : tab === "dashboard" ? <Dashboard store={store} project={project} tasks={tasks} />
          : tab === "docs" ? <DocsTab store={store} project={project} onOpenDoc={onOpenDoc} />
          : tab === "forms" ? <FormsTab store={store} project={project} onOpen={onOpen} />
          : tab === "rules" ? <RulesTab store={store} project={project} />
          : view.type === "list" ? <ListView key={view.id} store={store} groups={groups} view={view} onView={onView} ctx={ctx} projectId={pid} onOpen={onOpen} openId={openId} sel={sel} setSel={setSel} canEdit={canEdit} />
          : view.type === "board" ? <BoardView key={view.id} store={store} groups={groups} view={view} ctx={ctx} projectId={pid} onOpen={onOpen} openId={openId} sel={sel} setSel={setSel} canEdit={canEdit} />
          : view.type === "timeline" ? <TimelineView key={view.id} store={store} groups={groups} view={view} onView={onView} ctx={ctx} projectId={pid} onOpen={onOpen} openId={openId} />
          : <CalendarView key={view.id} store={store} tasks={visible} view={view} projectId={pid} onOpen={onOpen} openId={openId} />}
        {isView && (view.type === "list" || view.type === "board") && <BulkBar store={store} sel={sel} setSel={setSel} projectId={pid} />}
      </div>
    </div>
    {menu.open && <Popover anchor={menu.anchor} onClose={menu.close} width={250}>
      <MenuItem icon="note" onClick={() => { menu.close(); setModal({ kind: "edit", project }); }}>Edit project details</MenuItem>
      <MenuItem icon="link" onClick={() => { navigator.clipboard?.writeText(window.location.origin + "/projects/p/" + pid); toast("Project link copied"); menu.close(); }}>Copy project link</MenuItem>
      <MenuItem icon="star" onClick={() => { store.toggleFavorite(pid); menu.close(); }}>{store.favorites.has(pid) ? "Remove star" : "Star"}</MenuItem>
      <MenuItem icon="users" onClick={() => { menu.close(); setModal({ kind: "members", pid }); }}>Members and guests</MenuItem>
      <MenuSep />
      <MenuItem icon="copy" onClick={() => { menu.close(); setModal({ kind: "duplicate", project }); }}>Duplicate project</MenuItem>
      <MenuItem icon="case" onClick={() => { menu.close(); setModal({ kind: "saveTemplate", project }); }}>Save as a template</MenuItem>
      <MenuSep />
      <MenuItem icon="archive" onClick={() => { store.updateProject(pid, { status: project.status === "archived" ? "active" : "archived" }); menu.close(); }}>{project.status === "archived" ? "Restore from archive" : "Archive project"}</MenuItem>
      <MenuItem icon="trash" danger onClick={() => { menu.close(); if (window.confirm(`Delete "${project.name}" and its tasks? This can't be undone from here.`)) { store.updateProject(pid, { deleted_at: new Date().toISOString() }); go({ kind: "my" }); } }}>Delete project</MenuItem>
    </Popover>}
    {health.open && <Popover anchor={health.anchor} onClose={health.close} width={190}>{["on_track", "at_risk", "off_track"].map((k) => <MenuItem key={k} sel={project.health === k} icon={<span className="hw-dot" style={{ background: tone(HEALTH[k].tone)["--c"] }} />} onClick={() => { store.updateProject(pid, { health: k }); health.close(); }}>{HEALTH[k].label}</MenuItem>)}</Popover>}
    {addView.open && <Popover anchor={addView.anchor} onClose={addView.close} width={200}><MenuLabel>Add a view</MenuLabel>{Object.entries(VIEW_TYPES).map(([k, l]) => <MenuItem key={k} icon={VIEW_ICON[k]} onClick={() => addNew(k)}>{l}</MenuItem>)}</Popover>}
    {tabMenu && <Popover anchor={tabMenu} onClose={() => setTabMenu(null)} width={200}>
      <MenuItem icon="note" onClick={() => { setRenaming(tabMenu.v.id); setTabMenu(null); }}>Rename</MenuItem>
      <MenuItem icon="copy" onClick={() => { const v = { ...tabMenu.v, ...(local[tabMenu.v.id] || {}), id: newView("list").id, name: tabMenu.v.name + " copy" }; store.saveViews(pid, [...saved, v]); setTab(v.id); setTabMenu(null); }}>Duplicate</MenuItem>
      <MenuItem icon="pin" onClick={() => { store.saveViews(pid, [tabMenu.v, ...saved.filter((x) => x.id !== tabMenu.v.id)]); setTabMenu(null); }}>Make first tab</MenuItem>
      {saved.length > 1 && <><MenuSep /><MenuItem icon="trash" danger onClick={() => { const rest = saved.filter((x) => x.id !== tabMenu.v.id); store.saveViews(pid, rest); if (tab === tabMenu.v.id) setTab(rest[0].id); setTabMenu(null); }}>Delete view</MenuItem></>}
    </Popover>}
  </>);
}
const NONE = [];

// ── My tasks ──
function MyTasks({ store, openId, onOpen, sel, setSel, navBtn, setModal }) {
  const [view, setView] = useState(() => ({ ...MY_VIEW, ...ls.get("hw.my", {}) })); const [q, setQ] = useState(""); const [mode, setMode] = useState(() => ls.get("hw.my.mode", "list"));
  const onView = useCallback((patch) => setView((v) => { const n = { ...v, ...patch }; ls.set("hw.my", { group: n.group, sort: n.sort, filters: n.filters, cols: n.cols, titleW: n.titleW }); return n; }), []);
  useEffect(() => { ls.set("hw.my.mode", mode); }, [mode]);
  const ctx = useViewCtx(store, null);
  const mine = useMemo(() => store.tasks.filter((t) => t.assignee_id === store.uid), [store.tasks, store.uid]);
  const { groups, count, visible } = useGroups(mine, view, ctx, q);
  const me = store.people[store.uid]; const t0 = today(); const dueToday = mine.filter((t) => !isDone(t) && t.due_date && String(t.due_date).slice(0, 10) <= t0).length;
  const hello = (() => { const h = new Date().getHours(); return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"; })();
  return (<>
    <div className="hw-top" style={{ paddingBottom: 12 }}><div className="hw-top-r">{navBtn}<Avatar person={me} id={store.uid} size={32} />
      <div style={{ minWidth: 0 }}><h1 className="hw-trunc">{hello}{me ? ", " + personName(me).split(" ")[0] : ""}</h1></div>
      <span style={{ flex: 1 }} /><span style={{ fontSize: 12.5, color: "var(--ink3)" }}>{dueToday > 0 ? <><b style={{ color: "var(--coral)" }}>{dueToday}</b> due today or overdue</> : "Nothing due today"}</span>
      <Seg value={mode} options={[["list", "List"], ["board", "Board"], ["calendar", "Calendar"]]} onChange={setMode} /></div></div>
    <ViewBar store={store} view={{ ...view, type: mode }} onView={onView} ctx={ctx} q={q} setQ={setQ} onAdd={() => setModal({ kind: "quick", defaults: { assignee_id: store.uid } })} count={count} groupOptions={[["due", "Due date"], ["project", "Project"], ["priority", "Priority"], ["status", "Status"], ["none", "None"]]} />
    <div className="hw-body"><div className="hw-view">
      {mode === "list" ? <ListView store={store} groups={groups} view={view} onView={onView} ctx={ctx} projectId={null} onOpen={onOpen} openId={openId} sel={sel} setSel={setSel} showProject emptyHint="Tasks assigned to you show up here." />
        : mode === "board" ? <BoardView store={store} groups={groups} view={view} ctx={ctx} projectId={null} onOpen={onOpen} openId={openId} sel={sel} setSel={setSel} />
        : <CalendarView store={store} tasks={visible} view={view} projectId={null} onOpen={onOpen} openId={openId} />}
      <BulkBar store={store} sel={sel} setSel={setSel} projectId={null} />
    </div></div>
  </>);
}

// ── modals ──
function QuickAdd({ store, defaults, onClose, onCreated }) {
  const [title, setTitle] = useState(""); const [pid, setPid] = useState(defaults.project_id || null); const [sid, setSid] = useState(defaults.section_id || null);
  const [assignee, setAssignee] = useState(defaults.assignee_id ?? (defaults.project_id ? null : store.uid)); const [due, setDue] = useState(null); const [more, setMore] = useState(false);
  const who = usePop(), when = usePop(), proj = usePop(); const secs = pid ? store.sectionsOf.get(pid) || [] : [];
  useEffect(() => { if (pid && !secs.some((s) => s.id === sid)) setSid(secs[0]?.id || null); }, [pid]);
  const submit = async (keep) => { if (!title.trim()) return; const t = await store.createTask({ title: title.trim(), project_id: pid, section_id: pid ? sid : null, assignee_id: assignee, due_date: due }, { top: true }); if (t) onCreated?.(t); if (keep) { setTitle(""); setMore(true); } else onClose(); };
  const p = pid ? store.projectsById[pid] : null;
  return <Modal title="New task" onClose={onClose} width={560} footer={<><span style={{ flex: 1, fontSize: 12, color: "var(--ink3)" }}>Enter to add · Shift + Enter to add another</span><button className="hw-btn ghost" onClick={onClose}>Cancel</button><button className="hw-btn primary" disabled={!title.trim()} onClick={() => submit(false)}>Add task</button></>}>
    <input className="hw-bare" autoFocus style={{ fontSize: 18, fontWeight: 500, padding: "4px 0 12px" }} placeholder="What needs doing?" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(e.shiftKey); } }} />
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button className="hw-btn" onClick={who.toggle}><Avatar person={assignee ? store.people[assignee] : null} id={assignee} size={18} />{assignee ? personName(store.people[assignee]) : "Assignee"}</button>
      <button className="hw-btn" onClick={when.toggle}><Icon name="cal" size={15} />{due ? fmtDate(due) : "Due date"}</button>
      <button className="hw-btn" onClick={proj.toggle}>{p ? <span className="hw-dot" style={{ background: p.color }} /> : <Icon name="folder" size={15} />}<span className="hw-trunc" style={{ maxWidth: 180 }}>{p ? p.name : "No project"}</span></button>
      {p && secs.length > 0 && <select className="hw-input" style={{ width: "auto", maxWidth: 180 }} value={sid || ""} onChange={(e) => setSid(e.target.value || null)}>{secs.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>}
    </div>
    {more && <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--green)" }}>Added. Keep typing to add another.</div>}
    {who.open && <Popover anchor={who.anchor} onClose={who.close} width={260}><PersonPicker people={store.assignable(pid)} value={assignee} onPick={(v) => { setAssignee(v); who.close(); }} /></Popover>}
    {when.open && <Popover anchor={when.anchor} onClose={when.close}><DatePicker range={false} due={due} onChange={(d) => setDue(d.due_date)} onClose={when.close} /></Popover>}
    {proj.open && <Popover anchor={proj.anchor} onClose={proj.close} width={280}><OptionList searchable placeholder="Search projects…" options={[{ value: null, label: "No project (just for me)" }, ...store.projects.filter((x) => x.status !== "archived").map((x) => ({ value: x.id, label: x.name, dot: x.color }))]} value={pid} onPick={(v) => { setPid(v); proj.close(); }} /></Popover>}
  </Modal>;
}

const KEYS = [["Q or N", "New task"], ["/", "Search this view"], ["↑ ↓", "Move through tasks"], ["Enter", "Open the focused task"], ["Space", "Complete the focused task"], ["⌘ / Ctrl + click", "Select several tasks"], ["Shift + click", "Select a range"], ["⌘ / Ctrl + A", "Select all in the list"], ["Delete", "Delete selected tasks"], ["⌘ / Ctrl + Z", "Undo"], ["Esc", "Close the task or clear selection"], ["?", "This list"]];
const KeysModal = ({ onClose }) => <Modal title="Keyboard shortcuts" onClose={onClose} width={440}><div style={{ display: "grid", gridTemplateColumns: "1fr auto", rowGap: 9, alignItems: "center" }}>{KEYS.map(([k, l]) => [<span key={k + "l"} style={{ color: "var(--ink2)" }}>{l}</span>, <span key={k}><span className="hw-kbd">{k}</span></span>])}</div></Modal>;
