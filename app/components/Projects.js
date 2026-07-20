"use client";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { useModal } from "../lib/modal";
import { useResponsive } from "../lib/responsive";

// Filter persistence handled inside component via useEffect
import { T } from "../tokens";
import { useResizableColumns } from "../lib/useResizableColumns";
import SearchableMultiSelect from "./SearchableSelect";
import RichTextEditor from "./RichTextEditor";
import AsanaImportModal from "./AsanaImport";
import { STATUS, PRIORITY, SECTION_COLORS, AVATAR_COLORS } from "./projectConfig";

const TABS = ["Info", "List", "Board", "Timeline", "Calendar", "Forms & Templates", "Updates", "Docs", "Rules"];
const toDateStr = (d) => d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
const isOverdue = (d) => d && new Date(d) < new Date() && new Date(d).toDateString() !== new Date().toDateString();

// @Mention Input Component
function renderRich(text, T) {
  if (!text) return null;
  const inline = (str, kp) => {
    const out = []; const rx = /(\*\*[^*]+\*\*|@\[[^\]]+\]\([^)]+\)|@[A-Za-z\u00C0-\u024F' ]+|https?:\/\/[^\s<]+|www\.[^\s<]+)/g;
    let last = 0, m, idx = 0;
    while ((m = rx.exec(str)) !== null) {
      if (m.index > last) out.push(str.slice(last, m.index));
      const tok = m[0];
      if (tok.startsWith("**")) { out.push(<strong key={kp + "b" + idx}>{tok.slice(2, -2)}</strong>); }
      else if (tok[0] === "@") {
        const disp = tok.startsWith("@[") ? tok.slice(2, tok.indexOf("]")) : tok.slice(1);
        out.push(<span key={kp + "m" + idx} style={{ color: T.accent, fontWeight: 600, background: T.accent + "12", padding: "0 3px", borderRadius: 3 }}>@{disp}</span>);
      } else {
        const href = tok.startsWith("http") ? tok : "https://" + tok;
        out.push(<a key={kp + "l" + idx} href={href} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ color: T.accent, textDecoration: "underline", wordBreak: "break-all" }}>{tok}</a>);
      }
      last = m.index + tok.length; idx++;
    }
    if (last < str.length) out.push(str.slice(last));
    return out;
  };
  const lines = String(text).split("\n");
  const blocks = []; let i = 0;
  while (i < lines.length) {
    const _hm = lines[i].match(/^(#{1,3})\s+(.*)$/);
    if (_hm) { const _lv = _hm[1].length; blocks.push(<div key={"h" + i} style={{ fontWeight: 700, fontSize: _lv === 1 ? 15 : _lv === 2 ? 13 : 12, margin: "6px 0 2px", color: T.text }}>{inline(_hm[2], "h" + i)}</div>); i++; continue; }
    if (/^\s*[-*]\s+/.test(lines[i])) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*]\s+/, "")); i++; }
      blocks.push(<ul key={"ul" + i} style={{ margin: "3px 0", paddingLeft: 20 }}>{items.map((it, j) => <li key={j} style={{ marginBottom: 2 }}>{inline(it, "ul" + i + "_" + j)}</li>)}</ul>);
    } else if (/^\s*\d+[.)]\s+/.test(lines[i])) {
      const items = [];
      while (i < lines.length && /^\s*\d+[.)]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+[.)]\s+/, "")); i++; }
      blocks.push(<ol key={"ol" + i} style={{ margin: "3px 0", paddingLeft: 20 }}>{items.map((it, j) => <li key={j} style={{ marginBottom: 2 }}>{inline(it, "ol" + i + "_" + j)}</li>)}</ol>);
    } else {
      blocks.push(<div key={"p" + i} style={lines[i] ? undefined : { height: "0.5em" }}>{inline(lines[i], "p" + i)}</div>);
      i++;
    }
  }
  return blocks;
}

function Avatar({ url, initials, color, size = 20, faded }) {
  if (url) return <img src={url} alt="" style={{ width: size, height: size, borderRadius: size / 2, objectFit: "cover", flexShrink: 0, opacity: faded ? 0.6 : 1 }} />;
  return <div style={{ width: size, height: size, borderRadius: size / 2, background: (color || "#888") + (faded ? "20" : "30"), color: color || "#888", display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.max(7, Math.round(size * 0.42)), fontWeight: 700, flexShrink: 0, opacity: faded ? 0.6 : 1 }}>{initials}</div>;
}

function MentionInput({ members, profiles, onSubmit, placeholder, T, ini, acol }) {
  const [text, setText] = useState("");
  const [showMentions, setShowMentions] = useState(false);
  const [mentionFilter, setMentionFilter] = useState("");
  const [mentionIdx, setMentionIdx] = useState(0);
  const inputRef = useRef(null);

  const allPeople = useMemo(() => {
    const list = members?.length > 0 ? members : Object.values(profiles || {});
    return list.filter(m => m.display_name).sort((a, b) => (a.display_name || "").localeCompare(b.display_name || ""));
  }, [members, profiles]);

  const filtered = allPeople.filter(m =>
    !mentionFilter || m.display_name?.toLowerCase().includes(mentionFilter.toLowerCase()) ||
    m.title?.toLowerCase().includes(mentionFilter.toLowerCase())
  ).slice(0, 8);

  const handleChange = (e) => {
    const val = e.target.value;
    setText(val);
    // Check if we're in a @mention context
    const cursorPos = e.target.selectionStart;
    const beforeCursor = val.slice(0, cursorPos);
    const atMatch = beforeCursor.match(/@([A-Za-z\u00C0-\u024F' ]*)$/);
    if (atMatch) {
      setShowMentions(true);
      setMentionFilter(atMatch[1]);
      setMentionIdx(0);
    } else {
      setShowMentions(false);
    }
  };

  const insertMention = (person) => {
    const cursorPos = inputRef.current.selectionStart;
    const beforeCursor = text.slice(0, cursorPos);
    const afterCursor = text.slice(cursorPos);
    const atIdx = beforeCursor.lastIndexOf("@");
    const newText = beforeCursor.slice(0, atIdx) + `@[${person.display_name}](${person.id}) ` + afterCursor;
    setText(newText);
    setShowMentions(false);
    setTimeout(() => inputRef.current?.focus(), 10);
  };

  const handleKeyDown = (e) => {
    if (showMentions && filtered.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionIdx(i => Math.min(i + 1, filtered.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMentionIdx(i => Math.max(i - 1, 0)); return; }
      if (e.key === "Tab" || e.key === "Enter") { e.preventDefault(); insertMention(filtered[mentionIdx]); return; }
      if (e.key === "Escape") { setShowMentions(false); return; }
    }
    if (e.key === "Enter" && !e.shiftKey && !showMentions) {
      e.preventDefault();
      if (text.trim()) { onSubmit(text.trim()); setText(""); }
    }
  };

  useEffect(() => { const el = inputRef.current; if (el) { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 200) + "px"; } }, [text]);
  const insertPrefix = (prefix) => {
    const el = inputRef.current; if (!el) return;
    const pos = el.selectionStart == null ? text.length : el.selectionStart;
    const lineStart = text.lastIndexOf("\n", pos - 1) + 1;
    setText(text.slice(0, lineStart) + prefix + text.slice(lineStart));
    setTimeout(() => { el.focus(); const np = pos + prefix.length; try { el.setSelectionRange(np, np); } catch (e) {} }, 10);
  };
  const toolBtn = { padding: "2px 8px", fontSize: 11, fontWeight: 700, borderRadius: 5, border: `1px solid ${T.border}`, background: T.surface2, color: T.text2, cursor: "pointer", lineHeight: 1.4 };
  // Display text with mentions rendered nicely
  const displayValue = text.replace(/@\[([^\]]+)\]\([^)]+\)/g, "@$1");

  return (
    <div style={{ flex: 1, position: "relative" }}>
      <textarea
        ref={inputRef}
        value={displayValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => setShowMentions(false), 200)}
        placeholder={placeholder}
        rows={1}
        style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 12, outline: "none", boxSizing: "border-box", resize: "none", fontFamily: "inherit", lineHeight: 1.5, minHeight: 34, maxHeight: 200, overflow: "auto" }}
      />
      <div style={{ display: "flex", gap: 4, marginTop: 4, alignItems: "center" }}>
        <button type="button" onMouseDown={e => { e.preventDefault(); insertPrefix("- "); }} title="Bullet list" style={toolBtn}>• List</button>
        <button type="button" onMouseDown={e => { e.preventDefault(); insertPrefix("1. "); }} title="Numbered list" style={toolBtn}>1. List</button>
        <span style={{ fontSize: 10, color: T.text3, marginLeft: 4 }}>Enter to send · Shift+Enter for new line</span>
      </div>
      {showMentions && filtered.length > 0 && (
        <div style={{ position: "absolute", bottom: "100%", left: 0, right: 0, marginBottom: 4, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.2)", maxHeight: 220, overflow: "auto", zIndex: 100 }}>
          <div style={{ padding: "6px 10px", fontSize: 10, color: T.text3, fontWeight: 600, borderBottom: `1px solid ${T.border}` }}>People</div>
          {filtered.map((m, i) => (
            <div key={m.id} onMouseDown={(e) => { e.preventDefault(); insertMention(m); }}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", cursor: "pointer", background: i === mentionIdx ? T.accent + "15" : "transparent", transition: "background 0.1s" }}
              onMouseEnter={() => setMentionIdx(i)}
            >
              <div style={{ width: 22, height: 22, borderRadius: 11, background: acol(m.id) + "20", color: acol(m.id), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700 }}>{ini(m.id)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.display_name}</div>
                {m.title && <div style={{ fontSize: 10, color: T.text3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.title}</div>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DependencyEditor({ task, blockedBy, blocking, onAdd, onRemove, orgId, T, S, projectsById }) {
  const [mode, setMode] = useState(null); // 'blocked_by' | 'blocking'
  const [q, setQ] = useState("");
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!mode) return;
    const term = q.trim();
    if (term.length < 2) { setResults([]); setSearching(false); return; }
    let alive = true; setSearching(true);
    const h = setTimeout(async () => {
      const linked = new Set([task.id, ...blockedBy.map(d => d.task && d.task.id), ...blocking.map(d => d.task && d.task.id)].filter(Boolean));
      const { data } = await supabase.from("tasks")
        .select("id,title,project_id,parent_task_id")
        .eq("org_id", orgId).is("deleted_at", null)
        .ilike("title", `%${term}%`)
        .order("updated_at", { ascending: false })
        .limit(15);
      if (!alive) return;
      setResults((data || []).filter(t => !linked.has(t.id)));
      setSearching(false);
    }, 250);
    return () => { alive = false; clearTimeout(h); };
  }, [q, mode, task.id]);

  const close = () => { setMode(null); setQ(""); setResults([]); };
  const pick = (t) => { onAdd(mode, t); close(); };

  const depRow = (d, kind) => (
    <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 0", fontSize: 12 }}>
      <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: kind === "bb" ? "#ef444420" : "#f9731620", color: kind === "bb" ? "#ef4444" : "#f97316", fontWeight: 700, flexShrink: 0 }}>{kind === "bb" ? "BLOCKED BY" : "BLOCKING"}</span>
      <span style={{ color: T.text2, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.task.title}</span>
      <button onClick={() => onRemove(d.id)} style={S.iconBtn} title="Remove dependency">✕</button>
    </div>
  );

  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>Dependencies</label>
      {blockedBy.map(d => depRow(d, "bb"))}
      {blocking.map(d => depRow(d, "bl"))}
      {!mode ? (
        <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
          <button onClick={() => setMode("blocked_by")} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, border: `1px dashed ${T.border}`, background: "none", color: T.text3, cursor: "pointer" }}>+ Blocked by</button>
          <button onClick={() => setMode("blocking")} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, border: `1px dashed ${T.border}`, background: "none", color: T.text3, cursor: "pointer" }}>+ Blocking</button>
        </div>
      ) : (
        <div style={{ marginTop: 6, border: `1px solid ${T.border}`, borderRadius: 8, padding: 8, background: T.surface2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: mode === "blocked_by" ? "#ef4444" : "#f97316", textTransform: "uppercase", letterSpacing: 0.4 }}>{mode === "blocked_by" ? "Blocked by" : "Blocking"}</span>
            <span style={{ fontSize: 10, color: T.text3 }}>— search a task to link</span>
            <button onClick={close} style={{ marginLeft: "auto", background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 15, lineHeight: 1 }}>×</button>
          </div>
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Type to search tasks…"
            style={{ width: "100%", fontSize: 12, padding: "6px 8px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.text, outline: "none", boxSizing: "border-box" }} />
          <div style={{ marginTop: 6, maxHeight: 190, overflow: "auto" }}>
            {searching && <div style={{ fontSize: 11, color: T.text3, padding: "4px 2px" }}>Searching…</div>}
            {!searching && q.trim().length >= 2 && results.length === 0 && <div style={{ fontSize: 11, color: T.text3, padding: "4px 2px" }}>No matching tasks</div>}
            {!searching && q.trim().length < 2 && <div style={{ fontSize: 11, color: T.text3, padding: "4px 2px" }}>Type at least 2 characters…</div>}
            {results.map(t => (
              <div key={t.id} onClick={() => pick(t)} style={{ padding: "6px 8px", borderRadius: 6, cursor: "pointer", fontSize: 12, color: T.text, display: "flex", alignItems: "center", gap: 6 }}
                onMouseEnter={e => e.currentTarget.style.background = T.surface3}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                {t.parent_task_id && <span style={{ fontSize: 10, color: T.text3, flexShrink: 0 }}>↳</span>}
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                {projectsById && projectsById[t.project_id] && <span style={{ fontSize: 9, color: T.text3, flexShrink: 0, maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{projectsById[t.project_id].name}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ProfileCardPopover({ userId, pos, profilesMap, orgId, T, onClose }) {
  const seed = (profilesMap && profilesMap[userId]) || null;
  const [p, setP] = useState(seed);
  const [manager, setManager] = useState(null);
  const [openCount, setOpenCount] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      let prof = (profilesMap && profilesMap[userId]) || null;
      if (!prof) {
        const { data } = await supabase.from("profiles")
          .select("id,display_name,email,title,department,sub_department,location,reports_to,avatar_url")
          .eq("id", userId).maybeSingle();
        prof = data || null;
        if (alive) setP(prof);
      }
      if (prof && prof.reports_to) {
        const m = (profilesMap && profilesMap[prof.reports_to]) || null;
        if (m) { if (alive) setManager(m); }
        else {
          const { data: md } = await supabase.from("profiles").select("id,display_name").eq("id", prof.reports_to).maybeSingle();
          if (alive) setManager(md || null);
        }
      }
      const { count } = await supabase.from("tasks").select("id", { count: "exact", head: true })
        .eq("assignee_id", userId).is("deleted_at", null).not("status", "in", "(done,cancelled)");
      if (alive) setOpenCount(count == null ? 0 : count);
    })();
    return () => { alive = false; };
  }, [userId]);

  const W = 264;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1000;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const left = Math.min(Math.max(8, (pos && pos.x) || 100), vw - W - 8);
  const top = Math.min(((pos && pos.y) || 100) + 6, vh - 240);

  const name = (p && (p.display_name || p.email)) || "Unknown";
  const initials = (name === "Unknown" ? "?" : name).split(/\s+/).map(x => x[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
  const COLORS = ["#3b82f6","#a855f7","#ec4899","#06b6d4","#f97316","#22c55e","#84cc16","#ef4444"];
  const color = userId ? COLORS[userId.charCodeAt(userId.length - 1) % COLORS.length] : T.text3;
  const subtitle = [p && p.title, p && p.department].filter(Boolean).join(" \u00b7 ");
  const labelStyle = { color: T.text3, width: 70, flexShrink: 0 };

  return (
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1199 }} />
      <div onClick={e => e.stopPropagation()} style={{ position: "fixed", left, top, width: W, zIndex: 1200, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, boxShadow: "0 12px 40px rgba(0,0,0,0.28)", padding: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: subtitle || (p && p.email) ? 12 : 0 }}>
          {p && p.avatar_url
            ? <img src={p.avatar_url} alt="" style={{ width: 44, height: 44, borderRadius: 22, objectFit: "cover", flexShrink: 0 }} />
            : <div style={{ width: 44, height: 44, borderRadius: 22, background: `${color}18`, border: `2px solid ${color}50`, color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 700, flexShrink: 0 }}>{initials}</div>}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
            {subtitle && <div style={{ fontSize: 11, color: T.text3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{subtitle}</div>}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 12, color: T.text2 }}>
          {p && p.email && <div style={{ display: "flex", gap: 6 }}><span style={labelStyle}>Email</span><a href={`mailto:${p.email}`} style={{ color: T.accent, textDecoration: "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.email}</a></div>}
          {p && p.location && <div style={{ display: "flex", gap: 6 }}><span style={labelStyle}>Location</span><span>{p.location}</span></div>}
          {manager && <div style={{ display: "flex", gap: 6 }}><span style={labelStyle}>Manager</span><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{manager.display_name || "\u2014"}</span></div>}
          <div style={{ display: "flex", gap: 6 }}><span style={labelStyle}>Open tasks</span><span>{openCount == null ? "\u2026" : openCount}</span></div>
        </div>
      </div>
    </>
  );
}

function AlsoInProjects({ task, homeProject, projects, sections, links, onAdd, onRemove, onSetSection, T }) {
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");
  const [pendProj, setPendProj] = useState(null);   // project chosen in the add flow, awaiting section
  const [secFor, setSecFor] = useState(null);        // existing link's project_id whose section is being changed
  const linkedSet = new Set((links || []).map(l => l.project_id));
  const term = q.trim().toLowerCase();
  const candidates = projects.filter(p => p.id !== (task && task.project_id) && !linkedSet.has(p.id) && (!term || (p.name || "").toLowerCase().includes(term)));
  const secsOf = (pid) => (sections || []).filter(s => s.project_id === pid).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  const secName = (pid, sid) => { const s = (sections || []).find(x => x.id === sid && x.project_id === pid); return s ? s.name : null; };
  const chipBase = { fontSize: 11, padding: "3px 8px", borderRadius: 6, display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" };
  const SecList = ({ pid, current, onPick }) => (
    <div style={{ marginTop: 6, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface, maxHeight: 170, overflow: "auto" }}>
      <div onClick={() => onPick(null)} style={{ padding: "6px 8px", fontSize: 12, cursor: "pointer", color: !current ? T.accent : T.text2, fontWeight: !current ? 700 : 400 }} onMouseEnter={e => e.currentTarget.style.background = T.surface3} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>Also here (no section)</div>
      {secsOf(pid).map(s => (
        <div key={s.id} onClick={() => onPick(s.id)} style={{ padding: "6px 8px", fontSize: 12, cursor: "pointer", color: current === s.id ? T.accent : T.text, fontWeight: current === s.id ? 700 : 400 }} onMouseEnter={e => e.currentTarget.style.background = T.surface3} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>{s.name}</div>
      ))}
      {secsOf(pid).length === 0 && <div style={{ padding: "6px 8px", fontSize: 11, color: T.text3 }}>This project has no sections</div>}
    </div>
  );
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.5, display: "block", marginBottom: 6 }}>In projects</label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
        {homeProject && <span style={{ ...chipBase, background: T.surface3, color: T.text2 }}>{homeProject.name}<span style={{ fontSize: 8, color: T.text3, fontWeight: 700, letterSpacing: 0.5 }}>HOME</span></span>}
        {(links || []).map(l => { const p = projects.find(x => x.id === l.project_id); if (!p) return null; const sn = secName(l.project_id, l.section_id); return (
          <span key={l.project_id} style={{ ...chipBase, background: `${T.accent}15`, color: T.accent, fontWeight: 600 }}>
            {p.name}
            <button onClick={() => setSecFor(secFor === l.project_id ? null : l.project_id)} title="Choose section" style={{ background: "none", border: "none", color: T.accent, cursor: "pointer", fontSize: 10, padding: "0 2px", opacity: 0.85, textDecoration: "underline" }}>{sn || "Also here"}</button>
            <button onClick={() => onRemove(l.project_id)} title="Remove from this project" style={{ background: "none", border: "none", color: T.accent, cursor: "pointer", fontSize: 13, padding: 0, lineHeight: 1 }}>×</button>
          </span>
        ); })}
      </div>
      {secFor && (() => { const l = (links || []).find(x => x.project_id === secFor); if (!l) return null; const p = projects.find(x => x.id === secFor); return (
        <div style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: 8, background: T.surface2, marginBottom: 6 }}>
          <div style={{ fontSize: 10, color: T.text3, marginBottom: 2 }}>Section in {p ? p.name : "project"}</div>
          <SecList pid={secFor} current={l.section_id} onPick={(sid) => { onSetSection(secFor, sid); setSecFor(null); }} />
        </div>
      ); })()}
      {!adding ? (
        <button onClick={() => { setAdding(true); setPendProj(null); setQ(""); }} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, border: `1px dashed ${T.border}`, background: "none", color: T.text3, cursor: "pointer" }}>+ Add to project</button>
      ) : (
        <div style={{ border: `1px solid ${T.border}`, borderRadius: 8, padding: 8, background: T.surface2 }}>
          {!pendProj ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                <span style={{ fontSize: 10, color: T.text3 }}>Add this task to another project</span>
                <button onClick={() => { setAdding(false); setQ(""); }} style={{ marginLeft: "auto", background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>×</button>
              </div>
              <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search projects…" style={{ width: "100%", fontSize: 12, padding: "6px 8px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.text, outline: "none", boxSizing: "border-box" }} />
              <div style={{ marginTop: 6, maxHeight: 180, overflow: "auto" }}>
                {candidates.length === 0 && <div style={{ fontSize: 11, color: T.text3, padding: "4px 2px" }}>No other projects</div>}
                {candidates.map(p => (
                  <div key={p.id} onClick={() => setPendProj(p)} style={{ padding: "6px 8px", borderRadius: 6, cursor: "pointer", fontSize: 12, color: T.text, display: "flex", alignItems: "center", justifyContent: "space-between" }}
                    onMouseEnter={e => e.currentTarget.style.background = T.surface3}
                    onMouseLeave={e => e.currentTarget.style.background = "transparent"}>{p.name}<span style={{ fontSize: 13, color: T.text3 }}>›</span></div>
                ))}
              </div>
            </>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                <button onClick={() => setPendProj(null)} title="Back" style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 13, padding: 0 }}>‹</button>
                <span style={{ fontSize: 11, color: T.text2, fontWeight: 600 }}>{pendProj.name}</span>
                <span style={{ fontSize: 10, color: T.text3 }}>— pick a section</span>
                <button onClick={() => { setAdding(false); setPendProj(null); setQ(""); }} style={{ marginLeft: "auto", background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>×</button>
              </div>
              <SecList pid={pendProj.id} current={null} onPick={(sid) => { onAdd(pendProj.id, sid); setAdding(false); setPendProj(null); setQ(""); }} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function ProjectsView({ pendingTaskId, clearPendingTask, pendingProjectId, clearPendingProject }) {
  const { user, profile, orgId } = useAuth();
  const { isMobile, isTablet } = useResponsive();
  const { showPrompt, showConfirm } = useModal();
  const [projects, setProjects] = useState([]);
  const [sections, setSections] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [activeProject, setActiveProject] = useState(null);
  useEffect(() => { try { if (activeProject) localStorage.setItem("helm_active_project", activeProject); } catch (e) {} }, [activeProject]);
  const [selectedTask, setSelectedTask] = useState(null);
  const [viewMode, setViewMode] = useState("List");
  useEffect(() => { try { const v = localStorage.getItem("helm_project_view"); if (v) setViewMode(v); } catch (e) {} }, []);
  useEffect(() => { try { if (viewMode) localStorage.setItem("helm_project_view", viewMode); } catch (e) {} }, [viewMode]);
  const [loading, setLoading] = useState(true);
  const [showSidebar, setShowSidebar] = useState(true);
  const [addingTo, setAddingTo] = useState(null);
  const [newTitle, setNewTitle] = useState("");
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState({});
  const [sectionCtxMenu, setSectionCtxMenu] = useState(null); // { secId, x, y }
  const [wipLimitInput, setWipLimitInput] = useState("");
  const [showKeyboardHelp, setShowKeyboardHelp] = useState(false);
  const [hoveredRow, setHoveredRow] = useState(null);
  const [editingSectionId, setEditingSectionId] = useState(null);
  const [editingSectionName, setEditingSectionName] = useState("");
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [editingTaskTitle, setEditingTaskTitle] = useState("");
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState("");
  const _lastTabRef = useRef(0);
  const [expandedTasks, setExpandedTasks] = useState({});
  const [toast, setToast] = useState(null);
  const [dragTask, setDragTask] = useState(null);
  const [dragOverTarget, setDragOverTarget] = useState(null);
  const [dragOverRow, setDragOverRow] = useState(null);
  const [dragOverSection, setDragOverSection] = useState(null);
  useEffect(() => { if (!dragTask) setDragOverSection(null); }, [dragTask]);
  const [addingSubtaskTo, setAddingSubtaskTo] = useState(null);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState("");
  const [showProjectForm, setShowProjectForm] = useState(false);
  const [projectForm, setProjectForm] = useState({ name: "", description: "", color: "#3b82f6", status: "active", visibility: "private", join_policy: "invite_only", team_id: "", objective_id: "", key_result_id: "", owner_id: "", start_date: "", target_end_date: "", default_view: "List", plm_program_id: "", board_type: "basic", members: [] });
  const [teams, setTeams] = useState([]);
  const [objectives, setObjectives] = useState([]);
  const [keyResultsForLink, setKeyResultsForLink] = useState([]);

  // Add key_result_id to project form default
  const [allProfiles, setAllProfiles] = useState([]);
  const [formStep, setFormStep] = useState(1);
  // Filter state with persistence
  const [filterStatus, _setFS] = useState("all");
  const [filterPriority, _setFP] = useState("all");
  const [filtersLoaded, setFiltersLoaded] = useState(false);
  useEffect(() => {
    try {
      const s = localStorage.getItem("helm_fS");
      const p = localStorage.getItem("helm_fP");
      if (s) _setFS(JSON.parse(s));
      if (p) _setFP(JSON.parse(p));
    } catch {}
    setFiltersLoaded(true);
  }, []);
  const setFilterStatus = (v) => { _setFS(v); try { localStorage.setItem("helm_fS", JSON.stringify(v)); } catch {} };
  const setFilterPriority = (v) => { _setFP(v); try { localStorage.setItem("helm_fP", JSON.stringify(v)); } catch {} };
  const [filterAssignee, setFilterAssignee] = useState([]);
  const [sortCol, setSortCol] = useState("sort_order");
  const [sortDir, setSortDir] = useState("asc");
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState(""); // legacy — kept for compat
  const [editingDesc, setEditingDesc] = useState(false);
  const [taskCollabs, setTaskCollabs] = useState([]);
  const [detailWidth, setDetailWidth] = useState(() => { try { const w = Number(localStorage.getItem("helm_detail_width")); return w >= 340 ? w : 460; } catch (e) { return 460; } });
  const [detailFull, setDetailFull] = useState(false);
  useEffect(() => { try { localStorage.setItem("helm_detail_width", String(detailWidth)); } catch (e) {} }, [detailWidth]);
  const commentRef = useRef(null);
  const [editingCommentId, setEditingCommentId] = useState(null);
  const editCommentRef = useRef(null);
  const [attachments, setAttachments] = useState([]);
  const [dependencies, setDependencies] = useState([]);
  const [depTasks, setDepTasks] = useState({}); // id -> {id,title,...} for dependency targets not in the loaded task set
  const [profileCard, setProfileCard] = useState(null); // {userId,x,y} for the read-only creator profile popover
  const [taskProjects, setTaskProjects] = useState([]); // additional project memberships (multi-home links)
  const [linkedTaskObjs, setLinkedTaskObjs] = useState({}); // id -> task row, for linked tasks not in the loaded set
  const [customFields, setCustomFields] = useState([]);
  const [projectLabels, setProjectLabels] = useState([]);
  const [customFieldValues, setCustomFieldValues] = useState({});
  const [listColumns, setListColumns] = useState([]); // extra List-view columns for active project
  const [colMenu, setColMenu] = useState(null);
  const [showAddColMenu, setShowAddColMenu] = useState(false);
  const [newColName, setNewColName] = useState("");
  const [newColType, setNewColType] = useState("text");
  const [newColOptions, setNewColOptions] = useState("");
  const [milestones, setMilestones] = useState([]);
  const [calMonth, setCalMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [showMyTasks, setShowMyTasks] = useState(true);
  const [ctxProject, setCtxProject] = useState(null);
  const [showArchived, setShowArchived] = useState(false);
  const [favorites, setFavorites] = useState(new Set());
  const [projMembersList, setProjMembersList] = useState([]); // [{ project_id, user_id, role }]
  const [myProjectMemberships, setMyProjectMemberships] = useState([]); // current user only, with access_scope + invited_as_external
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberSearch, setMemberSearch] = useState("");
  const _profilesRef = useRef({});
  const _loadedSubRef = useRef(new Set());
  const _loadSubtasksRef = useRef(null);
  // Labels
  const [labels, setLabels] = useState([]); // all org labels
  const [labelAssignments, setLabelAssignments] = useState([]); // task_id <-> label_id
  // Custom fields - uses existing customFields/customFieldValues state above
  const [showFieldSettings, setShowFieldSettings] = useState(false);
  const [plmPrograms, setPlmPrograms] = useState([]); // PLM programs for linking
  // Templates & copy
  const [showTemplates, setShowTemplates] = useState(false);
  const [showAsanaImport, setShowAsanaImport] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [copyingProject, setCopyingProject] = useState(null);
  // Status updates
  const [statusUpdates, setStatusUpdates] = useState([]);
  const [showStatusForm, setShowStatusForm] = useState(false);
  const [statusForm, setStatusForm] = useState({ health: "on_track", summary: "", highlights: "", blockers: "" });
  // Bulk select
  const [selectedTasks, setSelectedTasks] = useState(new Set());
  const [bulkMode, setBulkMode] = useState(false);
  // Task activity
  const [taskActivity, setTaskActivity] = useState([]);
  // Docs
  const [docs, setDocs] = useState([]);
  // Rules engine
  const [rules, setRules] = useState([]);
  const [showRuleBuilder, setShowRuleBuilder] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [ruleForm, setRuleForm] = useState({ name: "", trigger_type: "task_moved_to_section", trigger_config: {}, actions: [] });

  const showToast = useCallback((msg, type = "error") => { setToast({ msg, type }); setTimeout(() => setToast(null), 3000); }, []);
  const toggleFavorite = async (projectId, e) => {
    e?.stopPropagation();
    const isFav = favorites.has(projectId);
    if (isFav) {
      setFavorites(p => { const n = new Set(p); n.delete(projectId); return n; });
      await supabase.from("project_favorites").delete().eq("user_id", user?.id).eq("project_id", projectId);
    } else {
      setFavorites(p => new Set(p).add(projectId));
      await supabase.from("project_favorites").insert({ user_id: user?.id, project_id: projectId });
    }
  };
  const archiveProject = async (id) => { const { error } = await supabase.from("projects").update({ status: "archived" }).eq("org_id", orgId).eq("id", id); if (error) return showToast("Failed to archive"); setProjects(p => p.map(pr => pr.id === id ? { ...pr, status: "archived" } : pr)); if (activeProject === id) setActiveProject(null); showToast("Project archived", "success"); };
  const unarchiveProject = async (id) => { const { error } = await supabase.from("projects").update({ status: "active" }).eq("org_id", orgId).eq("id", id); if (error) return showToast("Failed to restore"); setProjects(p => p.map(pr => pr.id === id ? { ...pr, status: "active" } : pr)); showToast("Project restored", "success"); };
  const deleteProject = async (id) => { const name = projects.find(p => p.id === id)?.name || "this project"; if (!window.confirm(`Delete "${name}"? This will permanently remove the project and all its tasks. This cannot be undone.`)) return; const { error } = await supabase.from("projects").delete().eq("org_id", orgId).eq("id", id); if (error) return showToast("Failed to delete: " + error.message); setProjects(p => p.filter(pr => pr.id !== id)); setTasks(p => p.filter(t => t.project_id !== id)); setSections(p => p.filter(s => s.project_id !== id)); if (activeProject === id) { setActiveProject(null); setSelectedTask(null); } showToast("Project deleted", "success"); };
  const ini = (uid) => { const u = _profilesRef.current[uid]; const nm = u?.display_name || u?.email; return nm ? nm.split(/[\s@.]+/).filter(Boolean).map(w => w[0]).join("").slice(0, 2).toUpperCase() : "?"; };
  const iniName = (name) => name ? name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() : "?";
  const acol = (uid) => uid ? AVATAR_COLORS[uid.charCodeAt(uid.length - 1) % AVATAR_COLORS.length] : T.text3;
  const uname = (uid) => _profilesRef.current[uid]?.display_name || "";
  const secColor = (i) => SECTION_COLORS[i % SECTION_COLORS.length];
  const timeAgo = (ds) => { const m = Math.floor((Date.now() - new Date(ds).getTime()) / 60000); if (m < 1) return "just now"; if (m < 60) return m + "m ago"; const h = Math.floor(m / 60); if (h < 24) return h + "h ago"; return Math.floor(h / 24) + "d ago"; };
  const formatFileSize = (b) => { if (!b) return "0 B"; const k = 1024; const s = ["B", "KB", "MB", "GB"]; const i = Math.floor(Math.log(b) / Math.log(k)); return parseFloat((b / Math.pow(k, i)).toFixed(1)) + " " + s[i]; };
  const getFileUrl = (path) => (path && /^https?:\/\//.test(path)) ? path : `https://upbjdmnykheubxkuknuj.supabase.co/storage/v1/object/public/attachments/${path}`;
  useEffect(() => {
    if (!profile) return;
    // External collaborators: load only the projects they're a member of, with no org_id.
    if (profile.is_external) {
      const loadExternal = async () => {
        setLoading(true);
        try {
          // 1. Find which projects this user is a member of
          const { data: myPm } = await supabase.from("project_members")
            .select("id, project_id, user_id, role, access_scope, invited_as_external")
            .eq("user_id", user.id);
          const projectIds = (myPm || []).map(m => m.project_id);
          if (projectIds.length === 0) {
            setProjects([]); setSections([]); setTasks([]); setProjMembersList([]);
            setMyProjectMemberships([]); setProfiles({}); setAllProfiles([]);
            setLoading(false);
            return;
          }
          // 2. Pull project + nested data for those projects only
          const [pR, sR, tR, allPmR, favR, docsR] = await Promise.all([
            supabase.from("projects").select("*").in("id", projectIds).is("deleted_at", null).order("name"),
            supabase.from("sections").select("*").in("project_id", projectIds).order("sort_order"),
            supabase.from("tasks").select("*").in("project_id", projectIds).is("deleted_at", null).order("sort_order"),
            supabase.from("project_members").select("id, project_id, user_id, role, access_scope, invited_as_external").in("project_id", projectIds),
            supabase.from("project_favorites").select("project_id").eq("user_id", user.id),
            supabase.from("documents").select("id,title,emoji,updated_at,project_id,status").in("project_id", projectIds).is("deleted_at", null).order("updated_at", { ascending: false }),
          ]);
          // 3. Pull profile records for everyone in the same projects, so names/avatars resolve
          const userIds = [...new Set((allPmR.data || []).map(pm => pm.user_id))];
          const { data: prR } = userIds.length
            ? await supabase.from("profiles").select("*").in("id", userIds)
            : { data: [] };
          // 4. Task labels + assignments for visible tasks
          const taskIds = (tR.data || []).map(t => t.id);
          const [lblAR] = await Promise.all([
            taskIds.length
              ? supabase.from("task_label_assignments").select("*").in("task_id", taskIds)
              : Promise.resolve({ data: [] }),
          ]);
          // External users see no admin badge, no objectives, no teams, no rules templates etc.
          setIsAdmin(false);
          setProjects(pR.data || []);
          setSections(sR.data || []);
          setTasks(tR.data || []);
          setProjMembersList(allPmR.data || []);
          setMyProjectMemberships(myPm || []);
          setFavorites(new Set((favR.data || []).map(f => f.project_id)));
          setDocs(docsR.data || []);
          setAllProfiles(prR || []);
          const m = {}; (prR || []).forEach(u => { m[u.id] = u; }); setProfiles(m);
          setLabelAssignments(lblAR.data || []);
          // Empty arrays for things external users don't need:
          setTeams([]); setObjectives([]); setKeyResultsForLink([]);
          setProjectLabels([]); setLabels([]); setPlmPrograms([]); setTemplates([]);
          if (!activeProject && !pendingTaskId && pR.data?.length) { let _sav = null; try { _sav = localStorage.getItem("helm_active_project"); } catch (e) {} setActiveProject((_sav && pR.data.some(p => p.id === _sav)) ? _sav : pR.data[0].id); }
        } catch (e) { showToast("Failed to load projects"); }
        setLoading(false);
      };
      loadExternal();
      return;
    }
    // Internal user path (unchanged):
    if (!profile.org_id) return;
    const load = async () => {
      setLoading(true);
      try {
        const [pR, sR, tR, prR, tmR, obR, favR, pmR, permR, allPmR] = await Promise.all([
          supabase.from("projects").select("*").eq("org_id", orgId).eq("org_id", profile.org_id).is("deleted_at", null).order("name"),
          supabase.from("sections").select("*").order("sort_order"),
          supabase.rpc("get_top_level_tasks_with_subcounts", { p_org: orgId }),
          supabase.from("profiles").select("*").eq("org_id", orgId).eq("org_id", profile.org_id),
          supabase.from("teams").select("*").eq("org_id", orgId).eq("org_id", profile.org_id).is("deleted_at", null).order("name"),
          supabase.from("objectives").select("*").eq("org_id", profile.org_id).is("deleted_at", null).order("title"),
          supabase.from("project_favorites").select("project_id").eq("user_id", user?.id),
          supabase.from("project_members").select("id, project_id, user_id, role, access_scope, invited_as_external").eq("org_id", orgId).eq("user_id", user?.id),
          supabase.from("user_module_permissions").select("is_admin").eq("user_id", user?.id).maybeSingle(),
          supabase.from("project_members").select("id, project_id, user_id, role, access_scope, invited_as_external").eq("org_id", orgId),
        ]);
        // Filter projects by visibility: public visible to all, private only to members/owner/admin
        const isAdminVal = permR.data?.is_admin === true;
        setIsAdmin(isAdminVal);
        const myMemberProjects = new Set((pmR.data || []).map(pm => pm.project_id));
        const visibleProjects = isAdminVal ? (pR.data || []) : (pR.data || []).filter(p => 
          p.visibility === "public" || p.owner_id === user?.id || p.created_by === user?.id || myMemberProjects.has(p.id)
        );
        setProjects(visibleProjects); setSections(sR.data || []); setTasks(tR.data || []);
        // The top-level RPC omits subtasks, so pull the ones assigned to me — otherwise
        // "My Tasks" silently hides work that lives as a subtask.
        if (user?.id) {
          supabase.from("tasks").select("*").eq("org_id", orgId).eq("assignee_id", user.id)
            .not("parent_task_id", "is", null).is("deleted_at", null)
            .then(({ data: mySubs }) => {
              if (mySubs?.length) setTasks(prev => { const seen = new Set(prev.map(t => t.id)); return [...prev, ...mySubs.filter(t => !seen.has(t.id))]; });
            });
        }
        setTeams(tmR.data || []); setObjectives(obR.data || []); setAllProfiles(prR.data || []);
        // Load key results for linking
        supabase.from("key_results").select("id,title,objective_id,progress,unit,target_value,current_value").eq("org_id", orgId).eq("org_id", profile.org_id).is("deleted_at", null).order("title").then(({ data }) => setKeyResultsForLink(data || []));
        setFavorites(new Set((favR.data || []).map(f => f.project_id)));
        setProjMembersList(allPmR.data || []);
        setMyProjectMemberships(pmR.data || []);
        const m = {}; (prR.data || []).forEach(u => { m[u.id] = u; }); setProfiles(m);
        // Backfill profiles for external collaborators on shared projects.
        // The org_id filter above excludes them (their profiles.org_id is NULL),
        // but RLS via external_collab_profiles still allows reading them.
        const externalIds = [...new Set((allPmR.data || []).map(pm => pm.user_id))].filter(id => !m[id]);
        if (externalIds.length) {
          supabase.from("profiles").select("*").in("id", externalIds).then(({ data: extR }) => {
            if (!extR?.length) return;
            setProfiles(prev => { const next = { ...prev }; extR.forEach(u => { next[u.id] = u; }); return next; });
            setAllProfiles(prev => [...prev, ...extR.filter(u => !prev.some(p => p.id === u.id))]);
          });
        }
        if (!activeProject && !pendingTaskId && pR.data?.length) { let _sav = null; try { _sav = localStorage.getItem("helm_active_project"); } catch (e) {} setActiveProject((_sav && pR.data.some(p => p.id === _sav)) ? _sav : pR.data[0].id); }
        // Load labels, assignments, custom fields
        const [lblR, lblAR] = await Promise.all([
          supabase.from("task_labels").select("*").eq("org_id", orgId).order("name"),
          supabase.from("task_label_assignments").select("*"),
        ]);
        setLabels(lblR.data || []);
        setLabelAssignments(lblAR.data || []);
        // Load custom project labels
        supabase.from("project_labels").select("*").eq("org_id", profile.org_id).order("sort_order").then(({ data }) => setProjectLabels(data || []));
        // Load PLM programs for linking
        supabase.from("plm_programs").select("id, name, category, current_stage, brand").eq("org_id", orgId).is("deleted_at", null).order("name").then(({ data }) => setPlmPrograms(data || []));
        // Load templates and docs
        const [tmplR, docsR] = await Promise.all([
          supabase.from("project_templates").select("*").order("is_builtin", { ascending: false }).order("name"),
          supabase.from("documents").select("id,title,emoji,updated_at,project_id,status").eq("org_id", orgId).is("deleted_at", null).order("updated_at", { ascending: false }),
        ]);
        setTemplates(tmplR.data || []);
        setDocs(docsR.data || []);
      } catch (e) { showToast("Failed to load data"); }
      setLoading(false);
    };
    load();
  }, [profile?.org_id, profile?.is_external, user?.id]);

  // Open a specific task when navigating from Dashboard
  useEffect(() => {
    if (pendingTaskId && tasks.length > 0 && !loading) {
      const task = tasks.find(t => t.id === pendingTaskId);
      if (task) {
        setSelectedTask(task);
        if (task.project_id) {
          setActiveProject(task.project_id);
          setShowMyTasks(false);
        }
        // Stay on My Tasks for personal tasks
        clearPendingTask?.();
      } else {
        // Not in the loaded top-level set — likely a subtask. Fetch it directly,
        // open it, and load its parent's subtasks so it shows in context.
        supabase.from("tasks").select("*").eq("id", pendingTaskId).is("deleted_at", null).maybeSingle()
          .then(({ data: t }) => {
            if (t) {
              setSelectedTask(t);
              if (t.project_id) { setActiveProject(t.project_id); setShowMyTasks(false); }
              if (t.parent_task_id && _loadSubtasksRef.current) _loadSubtasksRef.current(t.parent_task_id);
            }
            clearPendingTask?.();
          });
      }
    }
  }, [pendingTaskId, tasks, loading]);

  // Open a specific project when navigating from elsewhere (e.g. PLM linked-projects)
  useEffect(() => {
    if (!pendingProjectId) return;
    if (projects.some(p => p.id === pendingProjectId)) {
      setActiveProject(pendingProjectId);
      setShowMyTasks(false);
      clearPendingProject?.();
    }
  }, [pendingProjectId, projects]);

  // Open a project flagged before a reload (e.g. just imported from Asana) once it has loaded.
  useEffect(() => {
    let pid = null;
    try { pid = sessionStorage.getItem("helm_open_project"); } catch (_) {}
    if (!pid) return;
    if (projects.some(p => p.id === pid)) {
      setActiveProject(pid);
      setShowMyTasks(false);
      try { sessionStorage.removeItem("helm_open_project"); } catch (_) {}
    }
  }, [projects]);

  useEffect(() => {
    if (!selectedTask) return;
    Promise.all([
      supabase.from("comments").select("*").eq("org_id", orgId).eq("entity_type", "task").eq("entity_id", selectedTask.id).is("deleted_at", null).order("created_at", { ascending: true }),
      supabase.from("attachments").select("*").eq("org_id", orgId).eq("entity_type", "task").eq("entity_id", selectedTask.id),
    ]).then(([cR, aR]) => { setComments(cR.data || []); setAttachments(aR.data || []); });
  }, [selectedTask?.id]);

  useEffect(() => {
    if (!activeProject) return;
    Promise.all([
      supabase.from("task_dependencies").select("*").eq("org_id", orgId),
      supabase.from("custom_fields").select("*").eq("project_id", activeProject).order("sort_order"),
      supabase.from("custom_field_values").select("*"),
      supabase.from("milestones").select("*").eq("project_id", activeProject).order("sort_order"),
      supabase.from("project_status_updates").select("*").eq("org_id", orgId).eq("project_id", activeProject).order("created_at", { ascending: false }).limit(10),
      supabase.from("project_rules").select("*").eq("project_id", activeProject).order("created_at"),
    ]).then(([dR, cfR, cvR, msR, suR, ruR]) => {
      setDependencies(dR.data || []); setCustomFields(cfR.data || []); setMilestones(msR.data || []); setStatusUpdates(suR.data || []);
      setRules(ruR.data || []);
      const cfm = {}; (cvR.data || []).forEach(v => { if (!cfm[v.task_id]) cfm[v.task_id] = {}; cfm[v.task_id][v.field_id] = v.value; }); setCustomFieldValues(cfm);
    });
  }, [activeProject]);

  // Load multi-home links (which tasks also appear in other projects) for the org.
  useEffect(() => {
    if (!orgId) return;
    let alive = true;
    (async () => {
      const { data } = await supabase.from("task_projects").select("id,task_id,project_id").eq("org_id", orgId);
      if (!alive) return;
      const links = data || [];
      setTaskProjects(links);
      const ids = [...new Set(links.map(l => l.task_id))];
      if (ids.length) {
        const { data: trows } = await supabase.from("tasks").select("*").in("id", ids).is("deleted_at", null);
        if (!alive) return;
        const m = {}; (trows || []).forEach(t => { m[t.id] = t; }); setLinkedTaskObjs(m);
      } else setLinkedTaskObjs({});
    })();
    return () => { alive = false; };
  }, [orgId]);

  // Resolve titles for dependency targets that aren't in the loaded (top-level) task set.
  useEffect(() => {
    if (!dependencies.length) return;
    const refIds = [...new Set(dependencies.flatMap(d => [d.predecessor_id, d.successor_id]))];
    const known = new Set(tasks.map(t => t.id));
    const missing = refIds.filter(id => !known.has(id) && !depTasks[id]);
    if (!missing.length) return;
    supabase.from("tasks").select("id,title,project_id,parent_task_id").in("id", missing).then(({ data }) => {
      if (data && data.length) setDepTasks(prev => { const next = { ...prev }; data.forEach(t => { next[t.id] = t; }); return next; });
    });
  }, [dependencies, tasks, depTasks]);

  const proj = projects.find(p => p.id === activeProject);
  const projSections = useMemo(() => sections.filter(s => s.project_id === activeProject).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)), [sections, activeProject]);
  // ── Multi-home: a task can also appear in other projects beyond its home project ──
  const linkedIdsByProject = useMemo(() => { const m = {}; taskProjects.forEach(l => { (m[l.project_id] = m[l.project_id] || new Set()).add(l.task_id); }); return m; }, [taskProjects]);
  const linkedProjectsByTask = useMemo(() => { const m = {}; taskProjects.forEach(l => { (m[l.task_id] = m[l.task_id] || []).push(l.project_id); }); return m; }, [taskProjects]);
  // Split incoming links: ones pinned to a section render inside that section; ones with no section show in the "Also here" group.
  const sharedSplit = useMemo(() => {
    const sectioned = []; const rootless = [];
    const validSec = new Set(sections.filter(s => s.project_id === activeProject).map(s => s.id));
    taskProjects.forEach(l => {
      if (l.project_id !== activeProject) return;
      const t = tasks.find(x => x.id === l.task_id) || linkedTaskObjs[l.task_id];
      if (!t || t.project_id === activeProject || t.parent_task_id) return;
      if (l.section_id && validSec.has(l.section_id)) sectioned.push({ ...t, section_id: l.section_id, __sharedLink: l.id, __homeProjectId: t.project_id });
      else rootless.push(t);
    });
    return { sectioned, rootless };
  }, [taskProjects, activeProject, tasks, linkedTaskObjs, sections]);
  const sharedSectioned = sharedSplit.sectioned;
  const sharedRoots = sharedSplit.rootless;
  const projTasks = useMemo(() => tasks.filter(t => t.project_id === activeProject).concat(sharedSectioned), [tasks, activeProject, sharedSectioned]);
  const projOpenCount = (pid) => {
    let c = tasks.filter(t => t.project_id === pid && t.status !== "done" && !t.parent_task_id).length;
    const set = linkedIdsByProject[pid];
    if (set) set.forEach(id => { const t = tasks.find(x => x.id === id) || linkedTaskObjs[id]; if (t && t.project_id !== pid && t.status !== "done" && !t.parent_task_id) c++; });
    return c;
  };
  const projectsById = useMemo(() => { const m = {}; projects.forEach(p => { m[p.id] = p; }); return m; }, [projects]);
  // External-user access_scope gating: hide tabs the user has no scope for.
  // Internal users (no membership row, or invited_as_external = false) see everything.
  const myAccessScope = useMemo(() => {
    const pm = myProjectMemberships.find(m => m.project_id === activeProject);
    if (!pm || !pm.invited_as_external) return null; // internal → no gating
    return pm.access_scope || { tasks: true };
  }, [myProjectMemberships, activeProject]);
  const visibleTabs = useMemo(() => {
    if (!myAccessScope) return TABS;
    return TABS.filter(t => {
      // Tasks scope governs the task-centric tabs (always on for any project member)
      if (["Info", "List", "Board", "Timeline", "Calendar", "Forms & Templates", "Updates", "Rules"].includes(t)) {
        return myAccessScope.tasks !== false;
      }
      if (t === "Docs") return myAccessScope.documents === true;
      return true;
    });
  }, [myAccessScope]);
  // If the current viewMode is no longer visible (scope was revoked), bounce to a safe tab.
  useEffect(() => {
    if (visibleTabs.length && !visibleTabs.includes(viewMode)) {
      setViewMode(visibleTabs.includes("List") ? "List" : visibleTabs[0]);
    }
  }, [visibleTabs, viewMode]);
  const filteredTasks = useMemo(() => projTasks.filter(t => {
    if (search) { const s = search.toLowerCase(); const nameMatch = t.assignee_id && profiles[t.assignee_id]?.display_name?.toLowerCase().includes(s); if (!t.title?.toLowerCase().includes(s) && !nameMatch) return false; }
    if (filterStatus !== "all" && filterStatus.length && !filterStatus.includes(t.status)) return false;
    if (filterPriority !== "all" && filterPriority.length && !filterPriority.includes(t.priority)) return false;
    if (filterAssignee.length && !filterAssignee.includes(t.assignee_id)) return false;
    return true;
  }), [projTasks, search, filterStatus, filterPriority, filterAssignee]);

  useEffect(() => {
    const fn = (e) => {
      const tag = document.activeElement?.tagName;
      const isInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || document.activeElement?.contentEditable === "true";

      if (e.key === "Escape") {
        if (sectionCtxMenu) { setSectionCtxMenu(null); return; }
        if (ctxProject) { setCtxProject(null); return; }
        if (showProjectForm) { setShowProjectForm(false); return; }
        if (selectedTask) { setSelectedTask(null); return; }
        if (editingSectionId) { setEditingSectionId(null); return; }
        if (addingTo) { setAddingTo(null); setNewTitle(""); return; }
        if (selectedTasks.size > 0) { setSelectedTasks(new Set()); return; }
      }

      if (isInput) return; // Don't trigger shortcuts when typing

      if (e.key === "Tab") { _lastTabRef.current = Date.now(); return; }

      const allRootTasks = filteredTasks.filter(t => !t.parent_task_id);
      const curIdx = selectedTask ? allRootTasks.findIndex(t => t.id === selectedTask.id) : -1;

      switch (e.key) {
        case "j": case "ArrowDown":
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            const next = allRootTasks[Math.min(curIdx + 1, allRootTasks.length - 1)];
            if (next) setSelectedTask(next);
          }
          break;
        case "k": case "ArrowUp":
          if (!e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            const prev = allRootTasks[Math.max(curIdx - 1, 0)];
            if (prev) setSelectedTask(prev);
          }
          break;
        case " ":
          if (selectedTask) {
            e.preventDefault();
            toggleDone(selectedTask);
          }
          break;
        case "Enter":
          if (selectedTask) {
            e.preventDefault();
            setSelectedTask(selectedTask); // opens detail panel
          }
          break;
        case "n": case "N":
          if (!e.metaKey && !e.ctrlKey) {
            if (Date.now() - (_lastTabRef.current || 0) < 1200) {
              e.preventDefault();
              _lastTabRef.current = 0;
              setAddingSection(true);
              setNewSectionName("");
            } else if (projSections.length > 0) {
              e.preventDefault();
              setAddingTo(projSections[0].id);
              setNewTitle("");
            }
          }
          break;
        case "f":
          e.preventDefault();
          document.querySelector('[placeholder*="Search"]')?.focus();
          break;
        case "1": setViewMode("List"); break;
        case "2": setViewMode("Board"); break;
        case "3": setViewMode("Timeline"); break;
        case "?":
          setShowKeyboardHelp(v => !v);
          break;
      }
    };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [showProjectForm, selectedTask, editingSectionId, addingTo, filteredTasks, projSections, selectedTasks, sectionCtxMenu, ctxProject]);
  const rootTasks = (secTasks) => secTasks.filter(t => !t.parent_task_id);
  const getSubtasks = (pid) => filteredTasks.filter(t => t.parent_task_id === pid);

  // The task dataset is dominated by subtasks, so only top-level tasks are loaded up
  // front. Fetch a parent's subtasks the first time it is expanded and merge them in.
  const loadSubtasks = useCallback(async (parentId) => {
    if (!parentId || _loadedSubRef.current.has(parentId)) return;
    _loadedSubRef.current.add(parentId);
    const { data, error } = await supabase.from("tasks").select("*")
      .eq("parent_task_id", parentId).is("deleted_at", null).order("sort_order");
    if (error) { _loadedSubRef.current.delete(parentId); return; }
    if (data && data.length) {
      setTasks(prev => {
        const have = new Set(prev.map(t => t.id));
        const add = data.filter(d => !have.has(d.id));
        return add.length ? [...prev, ...add] : prev;
      });
    }
  }, []);

  // Label helpers
  const getTaskLabels = (taskId) => {
    const assignedIds = labelAssignments.filter(a => a.task_id === taskId).map(a => a.label_id);
    return labels.filter(l => assignedIds.includes(l.id));
  };
  const toggleLabel = async (taskId, labelId) => {
    const existing = labelAssignments.find(a => a.task_id === taskId && a.label_id === labelId);
    if (existing) {
      await supabase.from("task_label_assignments").delete().eq("id", existing.id);
      setLabelAssignments(p => p.filter(a => a.id !== existing.id));
    } else {
      const { data } = await supabase.from("task_label_assignments").insert({ task_id: taskId, label_id: labelId }).select().single();
      if (data) setLabelAssignments(p => [...p, data]);
    }
  };
  const createLabel = async (name, color) => {
    const { data } = await supabase.from("task_labels").insert({ name, color, org_id: profile?.org_id || orgId }).select().single();
    if (data) setLabels(p => [...p, data]);
    return data;
  };
  const sortedTasks = (list) => { if (sortCol === "sort_order") return list; return [...list].sort((a, b) => { let va = a[sortCol] || "", vb = b[sortCol] || ""; if (sortCol === "due_date") { va = va ? new Date(va).getTime() : 9e15; vb = vb ? new Date(vb).getTime() : 9e15; } const c = va < vb ? -1 : va > vb ? 1 : 0; return sortDir === "asc" ? c : -c; }); };
  const doneCount = projTasks.filter(t => t.status === "done").length;
  const progress = projTasks.length ? Math.round((doneCount / projTasks.length) * 100) : 0;
  // Project health: use persisted value from DB, fallback to auto-compute from tasks
  const today = new Date().toISOString().split("T")[0];
  const projOverdue = projTasks.filter(t => t.status !== "done" && t.due_date && t.due_date < today);
  const autoHealth = projOverdue.length > projTasks.length * 0.2 ? "off_track" : projOverdue.length > 0 ? "at_risk" : "on_track";
  const projHealth = proj?.health || autoHealth;
  const healthColors = { on_track: "#22c55e", at_risk: "#eab308", off_track: "#ef4444" };
  const healthLabels = { on_track: "On Track", at_risk: "At Risk", off_track: "Off Track" };
  const healthIcons = { on_track: "✅", at_risk: "⚠️", off_track: "🔴" };

  const cycleHealth = async () => {
    const order = ["on_track", "at_risk", "off_track"];
    const next = order[(order.indexOf(projHealth) + 1) % order.length];
    await supabase.from("projects").update({ health: next }).eq("org_id", orgId).eq("id", activeProject);
    setProjects(p => p.map(pr => pr.id === activeProject ? { ...pr, health: next } : pr));
  };

  // Sync progress to DB whenever it changes meaningfully
  const syncProjectProgress = useCallback(async (pid, taskList) => {
    const done = taskList.filter(t => t.project_id === pid && t.status === "done").length;
    const total = taskList.filter(t => t.project_id === pid && !t.parent_task_id).length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    await supabase.from("projects").update({ progress: pct }).eq("org_id", orgId).eq("id", pid);
    if (pct === 100 && total > 0) {
      showToast("🎉 Project complete! All tasks done.", "success");
    }
  }, [showToast]);
  const getBlockedBy = (tid) => dependencies.filter(d => d.successor_id === tid).map(d => ({ ...d, task: tasks.find(t => t.id === d.predecessor_id) || depTasks[d.predecessor_id] })).filter(d => d.task);
  const getBlocking = (tid) => dependencies.filter(d => d.predecessor_id === tid).map(d => ({ ...d, task: tasks.find(t => t.id === d.successor_id) || depTasks[d.successor_id] })).filter(d => d.task);
  // Resolve the org_id to write on rows being created in this project.
  // External collaborators may have profile.org_id pointing to a different
  // org (or null), so we read it from the project itself when possible.
  // This is what unblocks external collaborators creating tasks/comments.
  const resolveOrgId = (projectId) => {
    if (projectId) {
      const proj = projects.find(p => p.id === projectId);
      if (proj?.org_id) return proj.org_id;
    }
    return profile?.org_id || null;
  };

  const createTask = async (sid) => {
    if (!newTitle.trim()) return;
    const st = tasks.filter(t => t.section_id === sid && !t.parent_task_id);
    const mx = st.reduce((m, t) => Math.max(m, t.sort_order || 0), 0);
    // Use the project's org_id so external collaborators (whose profile.org_id
    // may be null or point to a different org) can create tasks. Without this,
    // the insert hits a NOT NULL violation on tasks.org_id.
    const orgIdForInsert = resolveOrgId(activeProject);
    if (!orgIdForInsert) return showToast("Cannot create task: no org context");
    const { data, error } = await supabase.from("tasks").insert({ org_id: orgIdForInsert, project_id: activeProject, section_id: sid, title: newTitle.trim(), status: "todo", priority: "none", sort_order: mx + 1, created_by: user.id }).select().single();
    if (error) return showToast("Failed to create task: " + error.message);
    setTasks(p => [...p, data]);
    setNewTitle("");
    showToast("Task created", "success");
    executeRules(data.id, "__created", true, null, data);
  };
  const createStandaloneTask = async (title) => { if (!title?.trim() || !profile?.org_id) return; const { data, error } = await supabase.from("tasks").insert({ org_id: profile.org_id, title: title.trim(), status: "todo", priority: "none", assignee_id: user.id, sort_order: 0, created_by: user.id }).select().single(); if (error) return showToast("Failed to create task"); setTasks(p => [...p, data]); showToast("Personal task created", "success"); };
  const createSubtask = async (parentTask, titleOverride, keepOpen) => {
    const title = titleOverride || _newSubTitleRef.current || newSubtaskTitle;
    if (!title.trim()) return;
    const currentTasks = _tasksRef.current;
    const mx = currentTasks.filter(t => t.parent_task_id === parentTask.id).reduce((m, t) => Math.max(m, t.sort_order || 0), 0);
    // Same fix as createTask: resolve org_id from the project so externals can use this too.
    const orgIdForInsert = resolveOrgId(parentTask.project_id || activeProject);
    if (!orgIdForInsert) return showToast("Cannot create subtask: no org context");
    const { data, error } = await supabase.from("tasks").insert({ org_id: orgIdForInsert, project_id: activeProject, section_id: parentTask.section_id, parent_task_id: parentTask.id, title: title.trim(), status: "todo", priority: "none", sort_order: mx + 1, created_by: user.id }).select().single();
    if (error) return showToast("Failed to create subtask: " + error.message);
    setTasks(p => [...p, data]);
    setExpandedTasks(p => ({ ...p, [parentTask.id]: true }));
    setNewSubtaskTitle("");
    setAddingSubtaskTo(keepOpen ? parentTask.id : null);
    executeRules(data.id, "__created", true, null, data);
  };
  const startAddSubtask = (task, e) => { e?.stopPropagation(); setAddingSubtaskTo(task.id); setNewSubtaskTitle(""); setExpandedTasks(p => ({ ...p, [task.id]: true })); };
  const updateField = async (taskId, field, value) => { const old = tasks.find(t => t.id === taskId); setTasks(p => p.map(t => t.id === taskId ? { ...t, [field]: value } : t)); if (selectedTask?.id === taskId) setSelectedTask(p => ({ ...p, [field]: value })); const ups = { [field]: value, updated_at: new Date().toISOString() }; if (field === "status" && value === "done") ups.completed_at = new Date().toISOString(); if (field === "status" && old?.status === "done" && value !== "done") ups.completed_at = null; const { error } = await supabase.from("tasks").update(ups).eq("org_id", orgId).eq("id", taskId); if (error) { showToast("Update failed"); setTasks(p => p.map(t => t.id === taskId ? old : t)); return; } if (field === "status") { const updatedTasks = tasks.map(t => t.id === taskId ? { ...t, [field]: value } : t); syncProjectProgress(old?.project_id || activeProject, updatedTasks); }
    // Notify on assignment
    if (field === "assignee_id" && value && value !== user?.id && value !== old?.assignee_id) {
      const proj = projects.find(p => p.id === (old?.project_id || activeProject));
      supabase.from("notifications").insert({
        org_id: profile?.org_id, user_id: value, type: "assignment",
        title: `${uname(user?.id)} assigned you a task`,
        body: old?.title || "Untitled task",
        entity_type: "task", entity_id: taskId,
        actor_id: user?.id, is_read: false, category: "assignment",
        metadata: { task_title: old?.title, project_name: proj?.name || null }
      });
    }
    executeRules(taskId, field, value, old?.[field]); };
  const toggleDone = async (task, e) => {
    e?.stopPropagation();
    const newStatus = task.status === "done" ? "todo" : "done";
    await updateField(task.id, "status", newStatus);
    // Handle recurring tasks
    if (newStatus === "done" && task.recurrence && task.recurrence !== "none") {
      const mode = task.recurrence_mode || "on_date";
      const rec = task.recurrence; // daily, weekly, biweekly, monthly, quarterly
      const calcNext = (from) => {
        const d = new Date(from || new Date());
        if (rec === "daily") d.setDate(d.getDate() + 1);
        else if (rec === "weekly") d.setDate(d.getDate() + 7);
        else if (rec === "biweekly") d.setDate(d.getDate() + 14);
        else if (rec === "monthly") d.setMonth(d.getMonth() + 1);
        else if (rec === "quarterly") d.setMonth(d.getMonth() + 3);
        return d.toISOString().split("T")[0];
      };
      const endDate = task.recurrence_end_date;
      const nextDue = mode === "on_complete" ? calcNext(new Date()) : calcNext(task.due_date || new Date());
      if (endDate && nextDue > endDate) return; // past end date, don't create
      const { data: newTask } = await supabase.from("tasks").insert({
        org_id: task.org_id, project_id: task.project_id, section_id: task.section_id,
        title: task.title, status: "todo", priority: task.priority,
        assignee_id: task.assignee_id, due_date: nextDue,
        start_date: task.start_date ? calcNext(task.start_date) : null,
        recurrence: task.recurrence, recurrence_mode: task.recurrence_mode,
        recurrence_end_date: task.recurrence_end_date,
        recurring_parent_id: task.recurring_parent_id || task.id,
        sort_order: (task.sort_order || 0) + 1, created_by: user?.id,
      }).select().single();
      if (newTask) {
        setTasks(p => [...p, newTask]);
        showToast(`Recurring task created for ${new Date(nextDue).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`, "success");
      }
    }
  };
  const deleteTask = async (taskId) => { const ok = await showConfirm("Delete Task", "Are you sure?"); if (!ok) return; await supabase.from("tasks").update({ deleted_at: new Date().toISOString() }).eq("org_id", orgId).eq("id", taskId); setTasks(p => p.filter(t => t.id !== taskId)); if (selectedTask?.id === taskId) setSelectedTask(null); };
  const duplicateTask = async (task) => {
    const mx = tasks.filter(t => t.section_id === task.section_id && !t.parent_task_id).reduce((m, t) => Math.max(m, t.sort_order || 0), 0);
    const orgIdForInsert = resolveOrgId(task.project_id || activeProject);
    if (!orgIdForInsert) return showToast("Cannot duplicate: no org context");
    const { data, error } = await supabase.from("tasks").insert({ org_id: orgIdForInsert, project_id: activeProject, section_id: task.section_id, title: task.title + " (copy)", status: task.status, priority: task.priority, assignee_id: task.assignee_id, due_date: task.due_date, sort_order: mx + 1, created_by: user.id }).select().single();
    if (!error && data) {
      setTasks(p => [...p, data]);
      executeRules(data.id, "__created", true, null, data);
    }
  };
  const createSection = async () => { if (!newSectionName.trim()) return; const mx = projSections.reduce((m, s) => Math.max(m, s.sort_order || 0), 0); const { data, error } = await supabase.from("sections").insert({ project_id: activeProject, name: newSectionName.trim(), sort_order: mx + 1 }).select().single(); if (!error && data) setSections(p => [...p, data]); setNewSectionName(""); setAddingSection(false); };
  const renameSection = async (secId) => { if (!editingSectionName.trim()) return; await supabase.from("sections").update({ name: editingSectionName.trim() }).eq("id", secId); setSections(p => p.map(s => s.id === secId ? { ...s, name: editingSectionName.trim() } : s)); setEditingSectionId(null); };
  const deleteSection = async (secId) => { const st = tasks.filter(t => t.section_id === secId); const ok = await showConfirm("Delete Section", st.length ? `Delete ${st.length} task(s) too?` : "Delete this section?"); if (!ok) return; if (st.length) await supabase.from("tasks").update({ deleted_at: new Date().toISOString() }).eq("org_id", orgId).eq("section_id", secId); await supabase.from("sections").delete().eq("id", secId); setSections(p => p.filter(s => s.id !== secId)); setTasks(p => p.filter(t => t.section_id !== secId)); };
  const moveSection = async (secId, direction) => {
    const idx = projSections.findIndex(s => s.id === secId);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= projSections.length) return;
    const a = projSections[idx];
    const b = projSections[swapIdx];
    const newOrderA = b.sort_order ?? swapIdx;
    const newOrderB = a.sort_order ?? idx;
    setSections(p => p.map(s => s.id === a.id ? { ...s, sort_order: newOrderA } : s.id === b.id ? { ...s, sort_order: newOrderB } : s));
    await Promise.all([
      supabase.from("sections").update({ sort_order: newOrderA }).eq("id", a.id),
      supabase.from("sections").update({ sort_order: newOrderB }).eq("id", b.id),
    ]);
  };
  const openNewProject = () => { setProjectForm({ name: "", description: "", color: "#3b82f6", status: "active", visibility: "private", join_policy: "invite_only", team_id: "", objective_id: "", key_result_id: "", owner_id: user?.id || "", start_date: "", target_end_date: "", default_view: "List", plm_program_id: "", board_type: "basic", members: [] }); setFormStep(1); setShowProjectForm("new"); };
  const openEditProject = () => { if (!proj) return; setProjectForm({ name: proj.name, description: proj.description || "", color: proj.color || "#3b82f6", status: proj.status || "active", visibility: proj.visibility || "private", join_policy: proj.join_policy || "invite_only", team_id: proj.team_id || "", objective_id: proj.objective_id || "", key_result_id: proj.key_result_id || "", owner_id: proj.owner_id || "", start_date: proj.start_date || "", target_end_date: proj.target_end_date || "", default_view: proj.default_view || "List", plm_program_id: proj.plm_program_id || "", members: [] }); setFormStep(1); setShowProjectForm("edit"); };
  const createProjectFromTemplate = async (template) => {
    if (!profile?.org_id) return showToast("No organization found");
    const secs = template.sections || [];
    const color = template.color || "#3b82f6";
    const { data, error } = await supabase.from("projects").insert({
      org_id: profile.org_id, created_by: profile.id,
      name: template.name, description: template.description || "",
      color, status: "active", visibility: "private",
      default_view: template.template_data?.default_view || "List",
    }).select().single();
    if (error) return showToast("Failed to create: " + error.message);
    setProjects(p => [...p, data]);
    setActiveProject(data.id);
    setShowTemplates(false);
    const validAssignee = (uid) => (uid && profiles[uid]) ? uid : null;
    const insertNode = async (node, sectionId, sortOrder, parentId) => {
      const isStr = typeof node === "string";
      const title = (isStr ? node : (node.title || "")) || "Untitled";
      const { data: t } = await supabase.from("tasks").insert({
        org_id: profile.org_id, project_id: data.id, section_id: sectionId, parent_task_id: parentId || null,
        title, description: isStr ? "" : (node.description || ""), status: "todo",
        priority: isStr ? "none" : (node.priority || "none"),
        assignee_id: isStr ? null : validAssignee(node.assignee_id),
        sort_order: sortOrder, created_by: profile.id,
      }).select().single();
      if (!t) return;
      if (!isStr) {
        if (Array.isArray(node.labels)) { for (const lid of node.labels) { try { await supabase.from("task_label_assignments").insert({ task_id: t.id, label_id: lid, org_id: profile.org_id }); } catch (e) {} } }
        if (Array.isArray(node.attachments)) { for (const att of node.attachments) { try { const safe = String(att.filename || "file").replace(/[^\w.\-]+/g, "_"); const toPath = `${profile.org_id}/${t.id}/${Date.now()}_${safe}`; const { error: ce } = await supabase.storage.from("attachments").copy(att.file_path, toPath); if (!ce) { await supabase.from("attachments").insert({ org_id: profile.org_id, entity_type: "task", entity_id: t.id, filename: att.filename, file_path: toPath, file_size: att.file_size, mime_type: att.mime_type, uploaded_by: profile.id }); } } catch (e) {} } }
        if (Array.isArray(node.subtasks)) { for (let k = 0; k < node.subtasks.length; k++) { await insertNode(node.subtasks[k], sectionId, k + 1, t.id); } }
      }
    };
    for (let i = 0; i < secs.length; i++) {
      const sec = secs[i];
      const { data: secData } = await supabase.from("sections").insert({ project_id: data.id, org_id: profile.org_id, name: sec.name, sort_order: i + 1, is_complete_column: !!sec.is_complete_column, wip_limit: sec.wip_limit || null }).select().single();
      if (secData) { setSections(p => [...p, secData]); const tks = sec.tasks || []; for (let j = 0; j < tks.length; j++) { await insertNode(tks[j], secData.id, j + 1, null); } }
    }
    const { data: newTasks } = await supabase.from("tasks").select("*").eq("org_id", orgId).eq("project_id", data.id).is("deleted_at", null);
    setTasks(p => [...p.filter(t => t.project_id !== data.id), ...(newTasks || [])]);
    const newIds = (newTasks || []).map(t => t.id);
    if (newIds.length) { const { data: la } = await supabase.from("task_label_assignments").select("*").in("task_id", newIds); if (la && la.length) setLabelAssignments(p => [...p, ...la]); }
    showToast(`Project created from ${template.name} template`, "success");
  };

  const copyProject = async (srcProject) => {
    if (!profile?.org_id) return;
    const srcSections = sections.filter(s => s.project_id === srcProject.id);
    const srcTasks = tasks.filter(t => t.project_id === srcProject.id && !t.parent_task_id);
    const { data, error } = await supabase.from("projects").insert({
      org_id: profile.org_id, created_by: profile.id,
      name: srcProject.name + " (copy)", description: srcProject.description || "",
      color: srcProject.color, status: "active", visibility: srcProject.visibility || "private",
    }).select().single();
    if (error) return showToast("Copy failed: " + error.message);
    setProjects(p => [...p, data]);
    // Copy sections
    const secMap = {};
    for (const sec of srcSections) {
      const { data: newSec } = await supabase.from("sections").insert({ project_id: data.id, name: sec.name, sort_order: sec.sort_order }).select().single();
      if (newSec) { secMap[sec.id] = newSec.id; setSections(p => [...p, newSec]); }
    }
    // Copy tasks
    const newTaskList = [];
    for (const task of srcTasks) {
      const { data: newTask } = await supabase.from("tasks").insert({
        org_id: profile.org_id, project_id: data.id,
        section_id: secMap[task.section_id] || null,
        title: task.title, status: "todo", priority: task.priority,
        sort_order: task.sort_order, created_by: profile.id,
        estimated_hours: task.estimated_hours, story_points: task.story_points,
        labels: task.labels,
      }).select().single();
      if (newTask) newTaskList.push(newTask);
    }
    setTasks(p => [...p, ...newTaskList]);
    setActiveProject(data.id);
    setCopyingProject(null);
    showToast("Project copied successfully", "success");
  };

  const saveStatusUpdate = async () => {
    if (!statusForm.summary.trim()) return showToast("Summary required");
    const { data, error } = await supabase.from("project_status_updates").insert({
      org_id: profile?.org_id,
      project_id: activeProject, author_id: user?.id,
      status: statusForm.health,
      title: statusForm.summary,
      body: [statusForm.highlights ? `**Highlights:** ${statusForm.highlights}` : "", statusForm.blockers ? `**Blockers:** ${statusForm.blockers}` : ""].filter(Boolean).join("\n\n") || null,
    }).select().single();
    if (error) return showToast("Failed to save update");
    setStatusUpdates(p => [data, ...p]);
    // Persist health to the project itself
    await supabase.from("projects").update({ health: statusForm.health }).eq("org_id", orgId).eq("id", activeProject);
    setProjects(p => p.map(pr => pr.id === activeProject ? { ...pr, health: statusForm.health } : pr));
    setShowStatusForm(false);
    setStatusForm({ health: "on_track", summary: "", highlights: "", blockers: "" });
    showToast("Status update posted", "success");
  };

  const bulkUpdateTasks = async (field, value) => {
    const ids = [...selectedTasks];
    setTasks(p => p.map(t => ids.includes(t.id) ? { ...t, [field]: value } : t));
    await supabase.from("tasks").update({ [field]: value }).eq("org_id", orgId).in("id", ids);
    setSelectedTasks(new Set()); setBulkMode(false);
    showToast(`Updated ${ids.length} task${ids.length > 1 ? "s" : ""}`, "success");
  };

  const logActivity = async (taskId, action, field, oldVal, newVal) => {
    await supabase.from("task_activity").insert({ task_id: taskId, actor_id: user?.id, action, field, old_value: oldVal ? String(oldVal) : null, new_value: newVal ? String(newVal) : null });
  };

  const [savingAsTemplate, setSavingAsTemplate] = useState(null); // project being saved as template
  const [savingAsTemplateForm, setSavingAsTemplateForm] = useState({ name: "", description: "", icon: "📋", color: "#3b82f6", include: { subtasks: true, descriptions: true, assignees: false, tags: false, files: false } });
  const [templateEditor, setTemplateEditor] = useState(null); // { mode: "new"|"edit", id?, name, description, icon, color, sections: [{name, tasks: [string]}] }
  const [showTemplateManager, setShowTemplateManager] = useState(false);
  // Forms & Templates
  const [ftTab, setFtTab] = useState("templates");
  const [taskTemplates, setTaskTemplates] = useState([]);
  const [projectForms, setProjectForms] = useState([]);
  const [ttEditor, setTtEditor] = useState(null);
  const [formEditor, setFormEditor] = useState(null);
  const [fillingForm, setFillingForm] = useState(null);

  const saveAsTemplate = async (srcProject) => {
    if (!profile?.org_id) return;
    const form = savingAsTemplateForm;
    const inc = form.include || {};
    const name = (form.name || srcProject.name || "Untitled Template").trim();
    if (!name) return showToast("Template name is required");
    const srcSections = sections.filter(s => s.project_id === srcProject.id).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    // Pull the full task tree fresh so subtasks are complete even if not loaded in state
    const { data: allTasks } = await supabase.from("tasks").select("id,title,description,priority,assignee_id,section_id,parent_task_id,sort_order").eq("org_id", orgId).eq("project_id", srcProject.id).is("deleted_at", null);
    const taskList = allTasks || [];
    const childrenOf = (pid) => taskList.filter(t => t.parent_task_id === pid).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    let attByTask = {};
    if (inc.files) {
      const ids = taskList.map(t => t.id);
      if (ids.length) { const { data: atts } = await supabase.from("attachments").select("entity_id,filename,file_path,mime_type,file_size").eq("org_id", orgId).eq("entity_type", "task").in("entity_id", ids); (atts || []).forEach(a => { (attByTask[a.entity_id] = attByTask[a.entity_id] || []).push({ filename: a.filename, file_path: a.file_path, mime_type: a.mime_type, file_size: a.file_size }); }); }
    }
    const buildTask = (t) => {
      const o = { title: t.title };
      if (inc.descriptions && t.description) o.description = t.description;
      if (t.priority && t.priority !== "none") o.priority = t.priority;
      if (inc.assignees && t.assignee_id) o.assignee_id = t.assignee_id;
      if (inc.tags) { const lids = labelAssignments.filter(a => a.task_id === t.id).map(a => a.label_id); if (lids.length) o.labels = lids; }
      if (inc.files && attByTask[t.id]) o.attachments = attByTask[t.id];
      if (inc.subtasks) { const subs = childrenOf(t.id).map(buildTask); if (subs.length) o.subtasks = subs; }
      return o;
    };
    const sectionData = srcSections.map((s, i) => ({
      name: s.name,
      sort_order: s.sort_order ?? (i + 1),
      is_complete_column: s.is_complete_column || false,
      wip_limit: s.wip_limit || null,
      tasks: taskList.filter(t => t.section_id === s.id && !t.parent_task_id).slice().sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)).map(buildTask),
    }));
    const { data, error } = await supabase.from("project_templates").insert({
      org_id: profile.org_id,
      name,
      description: form.description || srcProject.description || "",
      icon: form.icon || srcProject.emoji || "📋",
      color: form.color || srcProject.color || "#3b82f6",
      is_builtin: false,
      created_by: profile.id,
      template_data: { default_view: srcProject.default_view || "List", include: inc },
      sections: sectionData,
    }).select().single();
    if (error) return showToast("Failed to save as template: " + error.message);
    setTemplates(p => [...p, data]);
    setSavingAsTemplate(null);
    setSavingAsTemplateForm({ name: "", description: "", icon: "📋", color: "#3b82f6", include: { subtasks: true, descriptions: true, assignees: false, tags: false, files: false } });
    showToast(`"${name}" saved as template`, "success");
  };

  const saveTemplateFromEditor = async () => {
    const ed = templateEditor;
    if (!ed) return;
    if (!ed.name?.trim()) return showToast("Template name is required");
    if (!profile?.org_id) return showToast("No organization found");
    const cleanSections = (ed.sections || [])
      .map((s, i) => ({
        name: (s.name || "").trim(),
        sort_order: i + 1,
        is_complete_column: !!s.is_complete_column,
        wip_limit: s.wip_limit || null,
        tasks: (s.tasks || []).map(serEditorTask).filter(t => t.title),
      }))
      .filter(s => s.name);
    if (cleanSections.length === 0) return showToast("Add at least one section");
    const payload = {
      name: ed.name.trim(),
      description: (ed.description || "").trim(),
      icon: ed.icon || "📋",
      color: ed.color || "#3b82f6",
      sections: cleanSections,
      template_data: ed.template_data || { default_view: "List" },
    };
    if (ed.mode === "edit" && ed.id) {
      const { data, error } = await supabase.from("project_templates").update(payload).eq("id", ed.id).select().single();
      if (error) return showToast("Failed to save template: " + error.message);
      setTemplates(p => p.map(t => t.id === ed.id ? data : t));
      showToast(`Template "${data.name}" updated`, "success");
    } else {
      const { data, error } = await supabase.from("project_templates").insert({
        ...payload,
        org_id: profile.org_id,
        is_builtin: false,
        created_by: profile.id,
      }).select().single();
      if (error) return showToast("Failed to create template: " + error.message);
      setTemplates(p => [...p, data]);
      showToast(`Template "${data.name}" created`, "success");
    }
    setTemplateEditor(null);
  };

  const deleteTemplate = async (tmpl) => {
    if (tmpl.is_builtin) return showToast("Built-in templates cannot be deleted");
    if (!window.confirm(`Delete template "${tmpl.name}"? This cannot be undone.`)) return;
    const { error } = await supabase.from("project_templates").delete().eq("id", tmpl.id);
    if (error) return showToast("Failed to delete: " + error.message);
    setTemplates(p => p.filter(t => t.id !== tmpl.id));
    showToast(`Template "${tmpl.name}" deleted`, "success");
  };

  const _teRid = () => "tt_" + Math.random().toString(36).slice(2, 9);
  const normEditorTask = (t) => {
    if (typeof t === "string") return { id: _teRid(), title: t, assignee_id: "", subtasks: [], _rest: {} };
    const { title, assignee_id, subtasks, ...rest } = (t || {});
    return { id: _teRid(), title: title || "", assignee_id: assignee_id || "", subtasks: (subtasks || []).map(normEditorTask), _rest: rest };
  };
  const serEditorTask = (t) => {
    const o = { ...(t._rest || {}), title: (t.title || "").trim() };
    if (t.assignee_id) o.assignee_id = t.assignee_id; else delete o.assignee_id;
    const subs = (t.subtasks || []).map(serEditorTask).filter(x => x.title);
    if (subs.length) o.subtasks = subs; else delete o.subtasks;
    return o;
  };
  const openNewTemplateEditor = () => {
    setTemplateEditor({
      mode: "new",
      name: "", description: "", icon: "📋", color: "#3b82f6",
      sections: [
        { name: "To Do", tasks: [] },
        { name: "In Progress", tasks: [] },
        { name: "Done", tasks: [] },
      ],
    });
    setShowTemplates(false);
    setShowTemplateManager(false);
  };

  const openEditTemplateEditor = (tmpl) => {
    if (tmpl.is_builtin) return showToast("Built-in templates cannot be edited");
    setTemplateEditor({
      mode: "edit",
      id: tmpl.id,
      name: tmpl.name, description: tmpl.description || "",
      icon: tmpl.icon || "📋", color: tmpl.color || "#3b82f6",
      sections: (tmpl.sections || []).map(s => ({
        name: s.name,
        is_complete_column: s.is_complete_column,
        wip_limit: s.wip_limit,
        tasks: (s.tasks || []).map(normEditorTask),
      })),
      template_data: tmpl.template_data,
    });
    setShowTemplateManager(false);
  };

  const createTeamInline = async () => {
    const name = (projectForm._newTeamName || "").trim();
    if (!name) return;
    if (!profile?.org_id) return showToast("No organization found");
    const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 50) || "team";
    const mk = (slug) => supabase.from("teams").insert({ org_id: profile.org_id, name, slug, color: projectForm.color || "#3b82f6", created_by: profile?.id || null }).select().single();
    let { data, error } = await mk(base);
    if (error && (error.code === "23505" || /duplicate|unique/i.test(error.message || ""))) { ({ data, error } = await mk(base + "-" + Math.random().toString(36).slice(2, 6))); }
    if (error || !data) { return showToast("Failed to create team: " + (error?.message || "unknown")); }
    setTeams(p => [...p, data].sort((a, b) => (a.name || "").localeCompare(b.name || "")));
    setProjectForm(p => ({ ...p, team_id: data.id, _addingTeam: false, _newTeamName: "" }));
    showToast("Team created", "success");
  };
  const saveProject = async () => { if (!projectForm.name.trim()) return showToast("Name required"); if (!profile?.org_id) return showToast("No organization found"); const payload = { name: projectForm.name.trim(), description: projectForm.description || "", color: projectForm.color || "#3b82f6", status: projectForm.status || "active", visibility: projectForm.visibility || "private", join_policy: projectForm.join_policy || "invite_only", team_id: projectForm.team_id || null, objective_id: projectForm.objective_id || null, key_result_id: projectForm.key_result_id || null, owner_id: projectForm.owner_id || null, start_date: projectForm.start_date || null, target_end_date: projectForm.target_end_date || null, default_view: projectForm.default_view || "List", plm_program_id: projectForm.plm_program_id || null }; if (showProjectForm === "new") { payload.org_id = profile.org_id; payload.created_by = profile?.id || null; console.log("Creating project with payload:", JSON.stringify(payload)); const { data, error } = await supabase.from("projects").insert(payload).select().single(); if (error) { console.error("Project create error:", error); return showToast("Failed: " + (error.message || error.details || "Unknown error")); } setProjects(p => [...p, data]); setActiveProject(data.id); { const bt = projectForm.board_type || "basic"; const basic = [{ name: "To Do" }, { name: "In Progress" }, { name: "Done", is_complete_column: true }]; let secDefs; if (bt === "blank") { secDefs = []; } else if (bt !== "basic") { const tmpl = templates.find(t => t.id === bt); secDefs = (tmpl && Array.isArray(tmpl.sections) ? tmpl.sections : []).map(x => ({ name: x.name, is_complete_column: !!x.is_complete_column, wip_limit: x.wip_limit || null })); if (!secDefs.length) secDefs = basic; } else { secDefs = basic; } for (let i = 0; i < secDefs.length; i++) { const d = secDefs[i]; const { data: sec } = await supabase.from("sections").insert({ project_id: data.id, org_id: profile.org_id, name: d.name, sort_order: i + 1, is_complete_column: d.is_complete_column || false, wip_limit: d.wip_limit || null }).select().single(); if (sec) setSections(p => [...p, sec]); } } if (projectForm.members.length > 0) { const newMembers = []; for (const uid of projectForm.members) { await supabase.from("project_members").insert({ project_id: data.id, user_id: uid, role: "member" }); newMembers.push({ project_id: data.id, user_id: uid, role: "member" }); if (uid !== user?.id) { await supabase.from("notifications").insert({ org_id: profile.org_id, user_id: uid, type: "project_added", title: `${uname(user?.id)} added you to ${data.name}`, body: data.description || "You've been added to a project", entity_type: "project", entity_id: data.id, actor_id: user?.id, is_read: false, category: "assignment", metadata: { project_name: data.name } }); } } setProjMembersList(p => [...p, ...newMembers]); } if (projectForm.owner_id) { const exists = projectForm.members.includes(projectForm.owner_id); if (!exists) { await supabase.from("project_members").insert({ project_id: data.id, user_id: projectForm.owner_id, role: "owner" }); setProjMembersList(p => [...p, { project_id: data.id, user_id: projectForm.owner_id, role: "owner" }]); if (projectForm.owner_id !== user?.id) { await supabase.from("notifications").insert({ org_id: profile.org_id, user_id: projectForm.owner_id, type: "project_added", title: `${uname(user?.id)} made you owner of ${data.name}`, body: "You've been assigned as project owner", entity_type: "project", entity_id: data.id, actor_id: user?.id, is_read: false, category: "assignment", metadata: { project_name: data.name } }); } } } if (projectForm.team_id) { const { data: tm } = await supabase.from("team_members").select("user_id").eq("team_id", projectForm.team_id); const already = new Set([...(projectForm.members || []), projectForm.owner_id].filter(Boolean)); const toAdd = [...new Set((tm || []).map(r => r.user_id))].filter(uid => uid && !already.has(uid)); if (toAdd.length) { const ntm = []; for (const uid of toAdd) { await supabase.from("project_members").insert({ project_id: data.id, user_id: uid, role: "member" }); ntm.push({ project_id: data.id, user_id: uid, role: "member" }); if (uid !== user?.id) { await supabase.from("notifications").insert({ org_id: profile.org_id, user_id: uid, type: "project_added", title: `${uname(user?.id)} added you to ${data.name}`, body: data.description || "You\u2019ve been added to a project", entity_type: "project", entity_id: data.id, actor_id: user?.id, is_read: false, category: "assignment", metadata: { project_name: data.name } }); } } setProjMembersList(p => [...p, ...ntm]); } } } else { const { error } = await supabase.from("projects").update(payload).eq("org_id", orgId).eq("id", activeProject); if (error) { console.error("Project update error:", error); return showToast("Failed: " + (error.message || error.details || "Unknown error")); } setProjects(p => p.map(pr => pr.id === activeProject ? { ...pr, ...payload } : pr)); if (projectForm.team_id) { const { data: tm } = await supabase.from("team_members").select("user_id").eq("team_id", projectForm.team_id); const existing = new Set(projMembersList.filter(pm => pm.project_id === activeProject).map(pm => pm.user_id)); const toAdd = [...new Set((tm || []).map(r => r.user_id))].filter(uid => uid && !existing.has(uid)); if (toAdd.length) { const ntm = []; for (const uid of toAdd) { await supabase.from("project_members").insert({ project_id: activeProject, user_id: uid, role: "member" }); ntm.push({ project_id: activeProject, user_id: uid, role: "member" }); if (uid !== user?.id) { await supabase.from("notifications").insert({ org_id: profile.org_id, user_id: uid, type: "project_added", title: `${uname(user?.id)} added you to ${projectForm.name}`, body: "You\u2019ve been added to a project", entity_type: "project", entity_id: activeProject, actor_id: user?.id, is_read: false, category: "assignment", metadata: { project_name: projectForm.name } }); } } setProjMembersList(p => [...p, ...ntm]); } } } setShowProjectForm(false); showToast(showProjectForm === "new" ? "Project created" : "Project updated", "success"); };
  const addCommentFromRef = async (text) => {
    if (!text || !selectedTask) return;
    // Extract @mentions — pattern: @[Name](userId)
    const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
    const mentionIds = [];
    let match;
    while ((match = mentionRegex.exec(text)) !== null) mentionIds.push(match[2]);
    // Store display text with @Name highlighted but strip the ID syntax for storage
    const displayText = text.replace(/@\[([^\]]+)\]\([^)]+\)/g, "@$1");
    const { data, error } = await supabase.from("comments").insert({
      org_id: profile.org_id, entity_type: "task", entity_id: selectedTask.id,
      author_id: user.id, content: displayText, mentions: mentionIds.length > 0 ? mentionIds : null
    }).select().single();
    if (!error && data) {
      setComments(p => [...p, data]);
      // Create notifications for mentioned users
      const proj = projects.find(p => p.id === selectedTask.project_id);
      for (const uid of mentionIds) {
        await supabase.from("notifications").insert({
          org_id: profile.org_id, user_id: uid, type: "mention",
          title: `${uname(user.id)} mentioned you in a comment`,
          body: displayText.length > 120 ? displayText.slice(0, 120) + "…" : displayText,
          entity_type: "task", entity_id: selectedTask.id,
          actor_id: user.id, is_read: false, category: "mention",
          metadata: { task_title: selectedTask.title, project_name: proj?.name || null, comment_id: data.id }
        });
      }
    }
  };
  const editComment = async (id, newContent) => {
    if (!newContent?.trim()) return;
    const { data, error } = await supabase.from("comments").update({ content: newContent.trim(), is_edited: true, edited_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("org_id", orgId).eq("id", id).select().single();
    if (!error && data) setComments(p => p.map(c => c.id === data.id ? data : c));
    setEditingCommentId(null);
  };
  const deleteComment = async (id) => {
    if (!window.confirm("Delete this comment?")) return;
    await supabase.from("comments").update({ deleted_at: new Date().toISOString() }).eq("org_id", orgId).eq("id", id);
    setComments(p => p.filter(c => c.id !== id));
  };
  const addComment = async () => {
    if (!newComment.trim() || !selectedTask) return;
    // Resolve org from the task's project so external collaborators can comment.
    const orgIdForInsert = resolveOrgId(selectedTask.project_id);
    if (!orgIdForInsert) return showToast("Cannot comment: no org context");
    const { data, error } = await supabase.from("comments").insert({ org_id: orgIdForInsert, entity_type: "task", entity_id: selectedTask.id, author_id: user.id, content: newComment.trim() }).select().single();
    if (!error && data) setComments(p => [...p, data]);
    else if (error) showToast("Comment failed: " + error.message);
    setNewComment("");
  };
  const uploadAttachment = async (file) => {
    if (!selectedTask) return;
    const orgIdForInsert = resolveOrgId(selectedTask.project_id);
    if (!orgIdForInsert) return showToast("Cannot upload: no org context");
    const path = `${orgIdForInsert}/${selectedTask.id}/${Date.now()}_${file.name}`;
    const { error: ue } = await supabase.storage.from("attachments").upload(path, file);
    if (ue) return showToast("Upload failed: " + ue.message);
    const { data, error } = await supabase.from("attachments").insert({ org_id: orgIdForInsert, entity_type: "task", entity_id: selectedTask.id, filename: file.name, file_path: path, file_size: file.size, mime_type: file.type, uploaded_by: user.id }).select().single();
    if (!error && data) setAttachments(p => [...p, data]);
    else if (error) showToast("Attach failed: " + error.message);
  };
  const deleteAttachment = async (att) => { await supabase.storage.from("attachments").remove([att.file_path]); await supabase.from("attachments").delete().eq("org_id", orgId).eq("id", att.id); setAttachments(p => p.filter(a => a.id !== att.id)); };
  const addDependency = async (pre, suc) => { if (pre === suc || dependencies.some(d => (d.predecessor_id === pre && d.successor_id === suc) || (d.predecessor_id === suc && d.successor_id === pre))) return; const { data, error } = await supabase.from("task_dependencies").insert({ predecessor_id: pre, successor_id: suc, dependency_type: "finish_to_start", org_id: orgId }).select().single(); if (!error && data) { setDependencies(p => [...p, data]); showToast("Dependency added", "success"); } else if (error) { showToast("Failed to add dependency"); } };
  const removeDependency = async (depId) => { await supabase.from("task_dependencies").delete().eq("id", depId); setDependencies(p => p.filter(d => d.id !== depId)); };
  const addTaskToProject = async (taskId, projectId, sectionId = null) => {
    if (!taskId || !projectId) return;
    if (taskProjects.some(l => l.task_id === taskId && l.project_id === projectId)) return;
    const { data, error } = await supabase.from("task_projects").insert({ task_id: taskId, project_id: projectId, section_id: sectionId || null, org_id: orgId, created_by: user?.id }).select().single();
    if (error || !data) { showToast("Failed to add to project"); return; }
    setTaskProjects(p => [...p, data]);
    setLinkedTaskObjs(m => { if (m[taskId]) return m; const t = tasks.find(x => x.id === taskId); return t ? { ...m, [taskId]: t } : m; });
    const pname = projects.find(p => p.id === projectId)?.name || "project";
    showToast(`Added to ${pname}`, "success");
  };
  const removeTaskFromProject = async (taskId, projectId) => {
    const link = taskProjects.find(l => l.task_id === taskId && l.project_id === projectId);
    if (!link) return;
    setTaskProjects(p => p.filter(l => l.id !== link.id));
    await supabase.from("task_projects").delete().eq("id", link.id);
  };
  const setLinkSection = async (taskId, projectId, sectionId) => {
    const link = taskProjects.find(l => l.task_id === taskId && l.project_id === projectId);
    if (!link) return;
    setTaskProjects(p => p.map(l => l.id === link.id ? { ...l, section_id: sectionId || null } : l));
    await supabase.from("task_projects").update({ section_id: sectionId || null }).eq("id", link.id);
  };
  const [showCFCreate, setShowCFCreate] = useState(false);
  const [cfForm, setCfForm] = useState({ name: "", field_type: "text", currency_prefix: "$", options: [] });
  const FIELD_TYPES = [
    { key: "text", label: "Text", icon: "Aa" },
    { key: "number", label: "Number", icon: "#" },
    { key: "currency", label: "Currency", icon: "$" },
    { key: "date", label: "Date", icon: "📅" },
    { key: "select", label: "Dropdown", icon: "▾" },
    { key: "checkbox", label: "Checkbox", icon: "☑" },
    { key: "url", label: "URL", icon: "🔗" },
    { key: "email", label: "Email", icon: "✉" },
    { key: "percent", label: "Percent", icon: "%" },
    { key: "rating", label: "Rating", icon: "⭐" },
  ];
  const CURRENCY_PREFIXES = ["$", "€", "£", "¥", "₹", "A$", "C$", "CHF", "R$", "₩"];
  const createCustomField = async () => {
    if (!cfForm.name.trim()) return;
    const mx = customFields.reduce((m, f) => Math.max(m, f.sort_order || 0), 0);
    const opts = {};
    if (cfForm.field_type === "currency") opts.currency_prefix = cfForm.currency_prefix || "$";
    if (cfForm.field_type === "select" && cfForm.options.length) opts.choices = cfForm.options;
    const { data, error } = await supabase.from("custom_fields").insert({
      project_id: activeProject, name: cfForm.name.trim(), field_type: cfForm.field_type,
      options: Object.keys(opts).length ? opts : null, sort_order: mx + 1,
    }).select().single();
    if (!error && data) setCustomFields(p => [...p, data]);
    setCfForm({ name: "", field_type: "text", currency_prefix: "$", options: [] });
    setShowCFCreate(false);
  };
  const deleteCustomField = async (cfId) => {
    await supabase.from("custom_field_values").delete().eq("field_id", cfId);
    await supabase.from("custom_fields").delete().eq("id", cfId);
    setCustomFields(p => p.filter(f => f.id !== cfId));
  };
  const updateCustomFieldValue = async (taskId, fieldId, value) => { setCustomFieldValues(p => ({ ...p, [taskId]: { ...(p[taskId] || {}), [fieldId]: value } })); const ex = await supabase.from("custom_field_values").select("id").eq("task_id", taskId).eq("field_id", fieldId).single(); if (ex.data) { await supabase.from("custom_field_values").update({ value }).eq("id", ex.data.id); } else { await supabase.from("custom_field_values").insert({ task_id: taskId, field_id: fieldId, value }); } };
  // ═══ Rules Engine ═══
  const TRIGGER_TYPES = [
    { key: "task_moved_to_section", label: "Task moved to section", icon: "→", configFields: ["section_id"] },
    { key: "status_changed", label: "Status changed to", icon: "◉", configFields: ["status"] },
    { key: "task_completed", label: "Task marked complete", icon: "✓", configFields: [] },
    { key: "task_assigned", label: "Task assigned to", icon: "👤", configFields: ["assignee_id"] },
    { key: "priority_changed", label: "Priority set to", icon: "!", configFields: ["priority"] },
    { key: "due_date_approaching", label: "Due date approaching", icon: "📅", configFields: ["days_before"] },
    { key: "task_created", label: "Task created", icon: "+", configFields: [] },
    { key: "custom_field_changed", label: "Custom field changed", icon: "✦", configFields: ["field_id", "value"] },
  ];
  const ACTION_TYPES = [
    { key: "set_status", label: "Set status", icon: "◉", configFields: ["status"] },
    { key: "move_to_section", label: "Move to section", icon: "→", configFields: ["section_id"] },
    { key: "set_assignee", label: "Set assignee", icon: "👤", configFields: ["assignee_id"] },
    { key: "set_priority", label: "Set priority", icon: "!", configFields: ["priority"] },
    { key: "mark_complete", label: "Mark complete", icon: "✓", configFields: [] },
    { key: "add_comment", label: "Add comment", icon: "💬", configFields: ["comment"] },
    { key: "set_due_date_offset", label: "Set due date", icon: "📅", configFields: ["days_offset"] },
    { key: "set_custom_field", label: "Set custom field", icon: "✦", configFields: ["field_id", "value"] },
  ];

  const saveRule = async () => {
    if (!ruleForm.name.trim() || !ruleForm.trigger_type || ruleForm.actions.length === 0) return showToast("Rule needs a name, trigger, and at least one action");
    const payload = {
      project_id: activeProject, name: ruleForm.name.trim(), description: ruleForm.description || "",
      trigger_type: ruleForm.trigger_type, trigger_config: ruleForm.trigger_config || {},
      actions: ruleForm.actions, is_active: true, created_by: user?.id,
    };
    if (editingRule) {
      const { error } = await supabase.from("project_rules").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", editingRule.id);
      if (error) return showToast("Failed: " + error.message);
      setRules(p => p.map(r => r.id === editingRule.id ? { ...r, ...payload } : r));
    } else {
      const { data, error } = await supabase.from("project_rules").insert(payload).select().single();
      if (error) return showToast("Failed: " + error.message);
      setRules(p => [...p, data]);
    }
    setShowRuleBuilder(false); setEditingRule(null);
    setRuleForm({ name: "", trigger_type: "task_moved_to_section", trigger_config: {}, actions: [] });
    showToast(editingRule ? "Rule updated" : "Rule created", "success");
  };

  const deleteRule = async (ruleId) => {
    if (!window.confirm("Delete this rule?")) return;
    await supabase.from("project_rules").delete().eq("id", ruleId);
    setRules(p => p.filter(r => r.id !== ruleId));
    showToast("Rule deleted", "success");
  };

  const toggleRule = async (ruleId) => {
    const rule = rules.find(r => r.id === ruleId);
    if (!rule) return;
    const { error } = await supabase.from("project_rules").update({ is_active: !rule.is_active }).eq("id", ruleId);
    if (!error) setRules(p => p.map(r => r.id === ruleId ? { ...r, is_active: !r.is_active } : r));
  };

  const executeRules = async (taskId, field, value, oldValue, taskOverride) => {
    const activeRules = rules.filter(r => r.is_active);
    if (!activeRules.length) return;
    const task = taskOverride || tasks.find(t => t.id === taskId);
    if (!task) return;

    for (const rule of activeRules) {
      let shouldFire = false;
      const tc = rule.trigger_config || {};

      switch (rule.trigger_type) {
        case "task_moved_to_section":
          shouldFire = field === "section_id" && (!tc.section_id && !(tc.section_ids?.length) || tc.section_id === value || (tc.section_ids || []).includes(value));
          break;
        case "status_changed":
          shouldFire = field === "status" && (!tc.status && !(tc.statuses?.length) || tc.status === value || (tc.statuses || []).includes(value));
          break;
        case "task_completed":
          shouldFire = field === "status" && value === "done" && oldValue !== "done";
          break;
        case "task_assigned":
          shouldFire = field === "assignee_id" && (!tc.assignee_id && !(tc.assignee_ids?.length) || tc.assignee_id === value || (tc.assignee_ids || []).includes(value));
          break;
        case "priority_changed":
          shouldFire = field === "priority" && (!tc.priority && !(tc.priorities?.length) || tc.priority === value || (tc.priorities || []).includes(value));
          break;
        case "task_created":
          shouldFire = field === "__created";
          break;
        case "custom_field_changed":
          shouldFire = field === "custom_field" && (!tc.field_id || tc.field_id === oldValue);
          break;
      }

      if (!shouldFire) continue;

      // Execute actions
      const executed = [];
      for (const action of (rule.actions || [])) {
        const ac = action.config || {};
        try {
          switch (action.type) {
            case "set_status":
              if (ac.status) await updateField(taskId, "status", ac.status);
              break;
            case "move_to_section":
              if (ac.section_id) await updateField(taskId, "section_id", ac.section_id);
              break;
            case "set_assignee":
              await updateField(taskId, "assignee_id", ac.assignee_id || null);
              break;
            case "set_priority":
              if (ac.priority) await updateField(taskId, "priority", ac.priority);
              break;
            case "mark_complete":
              await updateField(taskId, "status", "done");
              break;
            case "add_comment":
              if (ac.comment) {
                await supabase.from("comments").insert({
                  org_id: profile.org_id, entity_type: "task", entity_id: taskId,
                  author_id: user.id, content: `🤖 Auto: ${ac.comment}`,
                });
              }
              break;
            case "set_due_date_offset":
              if (ac.days_offset != null) {
                const d = new Date(); d.setDate(d.getDate() + Number(ac.days_offset));
                await updateField(taskId, "due_date", d.toISOString().split("T")[0]);
              }
              break;
            case "set_custom_field":
              if (ac.field_id) await updateCustomFieldValue(taskId, ac.field_id, ac.value || "");
              break;
          }
          executed.push({ type: action.type, success: true });
        } catch (err) {
          executed.push({ type: action.type, success: false, error: err.message });
        }
      }

      // Log execution
      await supabase.from("rule_executions").insert({
        rule_id: rule.id, task_id: taskId,
        trigger_data: { field, value, old_value: oldValue },
        actions_executed: executed, success: executed.every(e => e.success),
      });
      await supabase.from("project_rules").update({ run_count: (rule.run_count || 0) + 1, last_run_at: new Date().toISOString() }).eq("id", rule.id);
      setRules(p => p.map(r => r.id === rule.id ? { ...r, run_count: (r.run_count || 0) + 1, last_run_at: new Date().toISOString() } : r));
    }
  };

  const handleBoardDrop = async (taskId, newSec) => {
    const link = taskProjects.find(l => l.task_id === taskId && l.project_id === activeProject);
    const real = tasks.find(t => t.id === taskId) || linkedTaskObjs[taskId];
    if (link && real && real.project_id !== activeProject) {
      // This is a shared (multi-homed) instance in this project — re-pin the link, don't move the home task.
      setTaskProjects(p => p.map(l => l.id === link.id ? { ...l, section_id: newSec } : l));
      await supabase.from("task_projects").update({ section_id: newSec }).eq("id", link.id);
      setDragTask(null); setDragOverTarget(null); return;
    }
    await updateField(taskId, "section_id", newSec); setDragTask(null); setDragOverTarget(null);
  };
  const { widths: projWidths, onResizeStart: projResize } = useResizableColumns([320, 115, 95, 120, 200], "projects_v2");
  const mobileGrid = "1fr 70px"; // title + status only
  const baseGrid = projWidths.map(w => `${w}px`).join(" ");
  const activeGrid = isMobile ? mobileGrid : baseGrid;
  // ── List-view extra columns ──
  const BUILTIN_COLS = [
    { key: "blocked_by", label: "Blocked By", width: 160 },
    { key: "blocking", label: "Blocking", width: 160 },
    { key: "start_date", label: "Start date", width: 110 },
    { key: "created_at", label: "Created", width: 110 },
    { key: "tags", label: "Tags", width: 160 },
  ];
  const colMenuItem = { padding: "6px 10px", borderRadius: 5, cursor: "pointer", fontSize: 12, color: T.text2, whiteSpace: "nowrap" };
  const resolveCol = (c) => {
    if (!c) return null;
    if (c.t === "cf") { const fld = customFields.find(x => x.id === c.id); return fld ? { id: "cf:" + fld.id, label: fld.name, width: c.w || 150, cf: fld } : null; }
    const b = BUILTIN_COLS.find(x => x.key === c.key); return b ? { id: "b:" + b.key, label: b.label, width: c.w || b.width, builtin: b.key } : null;
  };
  const resolvedCols = (listColumns || []).map(resolveCol).filter(Boolean);
  const extraGrid = resolvedCols.map(c => `${c.width}px`).join(" ");
  const listGrid = isMobile ? activeGrid : `${activeGrid} ${extraGrid}${extraGrid ? " " : ""}minmax(40px, 1fr) 44px`;
  useEffect(() => {
    const proj = projects.find(p => p.id === activeProject);
    const cols = proj?.settings?.list_columns;
    setListColumns(Array.isArray(cols) ? cols : []);
  }, [activeProject, projects]);
  const saveListColumns = async (next) => {
    setListColumns(next);
    const proj = projects.find(p => p.id === activeProject);
    const newSettings = { ...(proj?.settings || {}), list_columns: next };
    setProjects(p => p.map(pr => pr.id === activeProject ? { ...pr, settings: newSettings } : pr));
    await supabase.from("projects").update({ settings: newSettings }).eq("org_id", orgId).eq("id", activeProject);
  };
  const colMatches = (c, col) => col.cf ? (c.t === "cf" && c.id === col.cf.id) : (c.t === "builtin" && c.key === col.builtin);
  const onExtraResizeStart = (col, e) => {
    e.preventDefault(); e.stopPropagation();
    const startX = e.clientX; const startW = col.width; let latest = listColumns;
    const onMove = (ev) => { const nw = Math.max(60, startW + (ev.clientX - startX)); latest = (listColumns || []).map(c => colMatches(c, col) ? { ...c, w: nw } : c); setListColumns(latest); };
    const onUp = () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); document.body.style.cursor = ""; document.body.style.userSelect = ""; saveListColumns(latest); };
    document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none";
    document.addEventListener("mousemove", onMove); document.addEventListener("mouseup", onUp);
  };
  const addColumn = (desc) => { saveListColumns([...(listColumns || []), desc]); setShowAddColMenu(false); };
  const removeColumn = (col) => { saveListColumns((listColumns || []).filter(c => !colMatches(c, col))); setColMenu(null); };
  const reorderColumnTo = (srcId, targetCol) => {
    const arr = [...(listColumns || [])];
    const srcDesc = srcId.startsWith("cf:") ? { t: "cf", id: srcId.slice(3) } : { t: "builtin", key: srcId.slice(2) };
    const from = arr.findIndex(c => (srcDesc.t === "cf" ? (c.t === "cf" && c.id === srcDesc.id) : (c.t === "builtin" && c.key === srcDesc.key)));
    const to = arr.findIndex(c => colMatches(c, targetCol));
    if (from < 0 || to < 0 || from === to) return;
    const [m] = arr.splice(from, 1); arr.splice(to, 0, m); saveListColumns(arr);
  };
  const editFieldOptions = async (cf) => {
    const cur = (cf.options?.choices || []).join(", ");
    const val = prompt("Options (comma-separated):", cur);
    if (val == null) return;
    const choices = val.split(",").map(x => x.trim()).filter(Boolean);
    const newOpts = { ...(cf.options || {}), choices };
    await supabase.from("custom_fields").update({ options: newOpts }).eq("id", cf.id);
    setCustomFields(p => p.map(x => x.id === cf.id ? { ...x, options: newOpts } : x));
    setColMenu(null);
  };
  const moveColumn = (col, dir) => { const idx = (listColumns || []).findIndex(c => colMatches(c, col)); const j = idx + dir; if (idx < 0 || j < 0 || j >= listColumns.length) return; const arr = [...listColumns]; [arr[idx], arr[j]] = [arr[j], arr[idx]]; saveListColumns(arr); setColMenu(null); };
  const renameColumnField = async (cf) => { const name = prompt("Rename field:", cf.name); if (!name || !name.trim()) return; await supabase.from("custom_fields").update({ name: name.trim() }).eq("id", cf.id); setCustomFields(p => p.map(x => x.id === cf.id ? { ...x, name: name.trim() } : x)); setColMenu(null); };
  const createColumnField = async () => { if (!newColName.trim()) return; const mx = customFields.reduce((m, fx) => Math.max(m, fx.sort_order || 0), 0); const opts = newColType === "select" ? { choices: newColOptions.split(",").map(x => x.trim()).filter(Boolean) } : null; const { data, error } = await supabase.from("custom_fields").insert({ project_id: activeProject, name: newColName.trim(), field_type: newColType, options: opts, sort_order: mx + 1 }).select().single(); if (!error && data) { setCustomFields(p => [...p, data]); saveListColumns([...(listColumns || []), { t: "cf", id: data.id }]); } setNewColName(""); setNewColType("text"); setNewColOptions(""); setShowAddColMenu(false); };
  const _fmtColDate = (d) => d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
  const ResizeHandle = ({ onDown }) => isMobile ? null : (<div onMouseDown={onDown} title="Drag to resize" style={{ position: "absolute", right: -4, top: 0, bottom: 0, width: 8, cursor: "col-resize", zIndex: 3, display: "flex", justifyContent: "center" }} onMouseEnter={e => { if (e.currentTarget.firstChild) e.currentTarget.firstChild.style.background = T.accent; }} onMouseLeave={e => { if (e.currentTarget.firstChild) e.currentTarget.firstChild.style.background = "transparent"; }}><div style={{ width: 2, height: "100%", background: "transparent", transition: "background 0.12s" }} /></div>);

  const S = {
    pill: { display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer" },
    iconBtn: { background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 4, borderRadius: 4, color: T.text3 },
    addRow: { display: "flex", alignItems: "center", gap: 8, padding: "6px 12px 6px 40px", cursor: "pointer", color: T.text3, fontSize: 13, borderRadius: 6 },
    colHdr: { fontSize: 11, fontWeight: 600, color: T.text3, textTransform: "uppercase", letterSpacing: "0.04em", padding: "6px 8px", cursor: "pointer", userSelect: "none", display: "flex", alignItems: "center", gap: 4 },
    row: (hov, sel) => ({ display: "grid", gridTemplateColumns: activeGrid, alignItems: "center", padding: isMobile ? "0 8px" : "0 12px", minHeight: isMobile ? 42 : 36, borderBottom: `1px solid ${T.border}`, background: sel ? T.accentDim : "transparent", cursor: "pointer", transition: "background 0.08s" }),
  };
  const ProjectSidebar = () => (
    <div style={{ width: showSidebar ? 260 : 0, flexShrink: 0, borderRight: `1px solid ${T.border}`, background: T.surface, overflow: "hidden", transition: "width 0.2s", display: "flex", flexDirection: "column" }}>
      <div style={{ padding: "16px 16px 8px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: T.text2, textTransform: "uppercase", letterSpacing: "0.06em" }}>Projects</span>
        <div style={{ display: "flex", gap: 4 }}>
          {isAdmin && <button onClick={() => setShowAsanaImport(true)} title="Import from Asana" style={{ ...S.iconBtn, fontSize: 11, padding: "3px 6px", borderRadius: 5, color: T.text3 }}>📥</button>}
          <button onClick={() => setShowTemplates(true)} title="From template" style={{ ...S.iconBtn, fontSize: 12, padding: "3px 6px", borderRadius: 5, color: T.accent }}>⊞</button>
          <button onClick={openNewProject} style={{ ...S.iconBtn, background: T.accent, color: "#fff", borderRadius: 6, width: 24, height: 24, fontSize: 16 }}>+</button>
        </div>
      </div>
      <div onClick={() => { setShowMyTasks(true); setActiveProject(null); }} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 16px", margin: "0 8px", borderRadius: 6, cursor: "pointer", background: showMyTasks ? T.accentDim : "transparent", color: showMyTasks ? T.accent : T.text2, fontSize: 13, fontWeight: 500 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
        My Tasks
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: "4px 8px" }}>
        {/* ★ Favorites */}
        {projects.filter(p => p.status !== "archived" && favorites.has(p.id)).length > 0 && (
          <>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.08em", padding: "8px 10px 4px", display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ color: "#eab308", fontSize: 11 }}>★</span> Favorites
            </div>
            {projects.filter(p => p.status !== "archived" && favorites.has(p.id)).map(p => {
          const pt = tasks.filter(t => t.project_id === p.id && !t.parent_task_id);
          const pd = pt.filter(t => t.status === "done").length;
          const pp = pt.length ? Math.round((pd / pt.length) * 100) : 0;
          const act = activeProject === p.id && !showMyTasks;
          const pToday = new Date().toISOString().split("T")[0];
          const pOverdue = pt.filter(t => t.status !== "done" && t.due_date && t.due_date < pToday).length;
          const pHealth = pOverdue > pt.length * 0.2 ? "#ef4444" : pOverdue > 0 ? "#eab308" : "#22c55e";
          return (
          <div key={p.id} onClick={() => { setActiveProject(p.id); setShowMyTasks(false); setSelectedTask(null); setSearch(""); }}
            onContextMenu={e => { e.preventDefault(); setCtxProject(ctxProject === p.id ? null : p.id); }}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 6, cursor: "pointer", background: act ? T.accentDim : "transparent", marginBottom: 2, position: "relative" }}>
            <div onClick={e => toggleFavorite(p.id, e)} style={{ cursor: "pointer", fontSize: 12, color: "#eab308", flexShrink: 0, lineHeight: 1 }} title="Remove from favorites">★</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: act ? 600 : 400, color: act ? T.accent : T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.emoji || ""} {p.name}</span>
                <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 6px", borderRadius: 10, background: act ? T.accent : T.surface3, color: act ? "#fff" : T.text2, flexShrink: 0 }}>{projOpenCount(p.id)}</span>
              </div>
              <div style={{ fontSize: 11, color: T.text3, marginTop: 1, display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: pHealth, display: "inline-block" }} />
                {pt.length} tasks · {pp}%
                {pOverdue > 0 && <span style={{ color: "#ef4444" }}>· {pOverdue} late</span>}
                {p.objective_id && <span style={{ color: T.accent }} title={objectives.find(o => o.id === p.objective_id)?.title || "Linked OKR"}>· ◎</span>}
              </div>
            </div>
            <div style={{ width: 28, height: 3, borderRadius: 2, background: T.surface3, flexShrink: 0 }}><div style={{ width: `${pp}%`, height: "100%", borderRadius: 2, background: p.color || T.accent, transition: "width 0.4s" }} /></div>
          </div>); })}
            <div style={{ height: 1, background: T.border, margin: "6px 10px" }} />
          </>
        )}
        {/* All Projects */}
        {projects.filter(p => p.status !== "archived" && !favorites.has(p.id)).length > 0 && favorites.size > 0 && (
          <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.08em", padding: "4px 10px 4px" }}>All Projects</div>
        )}
        {projects.filter(p => p.status !== "archived" && (!favorites.size || !favorites.has(p.id))).map(p => {
          const pt = tasks.filter(t => t.project_id === p.id && !t.parent_task_id);
          const pd = pt.filter(t => t.status === "done").length;
          const pp = pt.length ? Math.round((pd / pt.length) * 100) : 0;
          const act = activeProject === p.id && !showMyTasks;
          const pToday = new Date().toISOString().split("T")[0];
          const pOverdue = pt.filter(t => t.status !== "done" && t.due_date && t.due_date < pToday).length;
          const pHealth = pOverdue > pt.length * 0.2 ? "#ef4444" : pOverdue > 0 ? "#eab308" : "#22c55e";
          return (
          <div key={p.id} onClick={() => { setActiveProject(p.id); setShowMyTasks(false); setSelectedTask(null); setSearch(""); }}
            onContextMenu={e => { e.preventDefault(); setCtxProject(ctxProject === p.id ? null : p.id); }}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 10px", borderRadius: 6, cursor: "pointer", background: act ? T.accentDim : "transparent", marginBottom: 2, position: "relative" }}>
            <div onClick={e => toggleFavorite(p.id, e)} style={{ cursor: "pointer", fontSize: 12, color: T.text3, flexShrink: 0, lineHeight: 1, opacity: 0.3, transition: "opacity 0.15s" }}
              onMouseEnter={e => { e.currentTarget.style.opacity = "1"; e.currentTarget.style.color = "#eab308"; }} onMouseLeave={e => { e.currentTarget.style.opacity = "0.3"; e.currentTarget.style.color = T.text3; }}
              title="Add to favorites">☆</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: act ? 600 : 400, color: act ? T.accent : T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.emoji || ""} {p.name}</span>
                <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 6px", borderRadius: 10, background: act ? T.accent : T.surface3, color: act ? "#fff" : T.text2, flexShrink: 0 }}>{projOpenCount(p.id)}</span>
              </div>
              <div style={{ fontSize: 11, color: T.text3, marginTop: 1, display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 5, height: 5, borderRadius: "50%", background: pHealth, display: "inline-block" }} />
                {pt.length} tasks · {pp}%
                {pOverdue > 0 && <span style={{ color: "#ef4444" }}>· {pOverdue} late</span>}
                {p.objective_id && <span style={{ color: T.accent }} title={objectives.find(o => o.id === p.objective_id)?.title || "Linked OKR"}>· ◎</span>}
              </div>
            </div>
            <div style={{ width: 28, height: 3, borderRadius: 2, background: T.surface3, flexShrink: 0 }}><div style={{ width: `${pp}%`, height: "100%", borderRadius: 2, background: p.color || T.accent, transition: "width 0.4s" }} /></div>
            {ctxProject === p.id && <div onClick={e => e.stopPropagation()} style={{ position: "absolute", right: 4, top: "100%", zIndex: 50, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, padding: 4, minWidth: 140, boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }}>
              <div onClick={() => { setCopyingProject(p); setCtxProject(null); }} style={{ padding: "7px 10px", fontSize: 12, color: T.text2, borderRadius: 4, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }} onMouseEnter={e => e.currentTarget.style.background = T.surface3} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>Copy
              </div>
              <div onClick={() => { setSavingAsTemplate(p); setSavingAsTemplateForm({ name: p.name, description: p.description || "", icon: p.emoji || "📋", color: p.color || "#3b82f6", include: { subtasks: true, descriptions: true, assignees: false, tags: false, files: false } }); setCtxProject(null); }} style={{ padding: "7px 10px", fontSize: 12, color: T.text2, borderRadius: 4, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }} onMouseEnter={e => e.currentTarget.style.background = T.surface3} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>Save as Template
              </div>
              <div onClick={() => { archiveProject(p.id); setCtxProject(null); }} style={{ padding: "7px 10px", fontSize: 12, color: T.text2, borderRadius: 4, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }} onMouseEnter={e => e.currentTarget.style.background = T.surface3} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg>Archive
              </div>
              <div onClick={() => { deleteProject(p.id); setCtxProject(null); }} style={{ padding: "7px 10px", fontSize: 12, color: T.red, borderRadius: 4, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }} onMouseEnter={e => e.currentTarget.style.background = T.surface3} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg>Delete
              </div>
            </div>}
          </div>); })}
        {projects.some(p => p.status === "archived") && <>
          <div onClick={() => setShowArchived(!showArchived)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", marginTop: 8, fontSize: 11, color: T.text3, cursor: "pointer", fontWeight: 600 }}>
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" style={{ transform: showArchived ? "rotate(0)" : "rotate(-90deg)", transition: "transform 0.15s" }}><path d="M3 4.5l3 3 3-3" stroke={T.text3} strokeWidth="1.5" strokeLinecap="round" /></svg>
            Archived ({projects.filter(p => p.status === "archived").length})
          </div>
          {showArchived && projects.filter(p => p.status === "archived").map(p => (
            <div key={p.id} onClick={() => { setActiveProject(p.id); setShowMyTasks(false); }} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", borderRadius: 6, cursor: "pointer", background: activeProject === p.id ? T.accentDim : "transparent", marginBottom: 2, opacity: 0.6 }}>
              <div style={{ width: 8, height: 8, borderRadius: 4, background: p.color || T.text3, flexShrink: 0 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: T.text3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.name}</div>
              </div>
              <button onClick={e => { e.stopPropagation(); unarchiveProject(p.id); }} style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, border: "none", background: T.surface3, color: T.text3, cursor: "pointer" }}>Restore</button>
            </div>
          ))}
        </>}
      </div>
    </div>
  );
  const projectHeaderEl = (() => { if (!proj) return null;
    const hColor = healthColors[projHealth];
    const hLabel = healthLabels[projHealth];
    return (
    <div style={{ borderBottom: `1px solid ${T.border}`, background: T.surface }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px 8px" }}>
        {!showSidebar && <button onClick={() => setShowSidebar(true)} style={S.iconBtn}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.text2} strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg></button>}
        <div style={{ width: 12, height: 12, borderRadius: 6, background: proj.color || T.accent, flexShrink: 0 }} />
        <h2 style={{ fontSize: 18, fontWeight: 700, color: T.text, margin: 0, flex: 1 }}>{proj.emoji || ""} {proj.name}</h2>
        {/* Project members */}
        {(() => {
          const members = projMembersList.filter(pm => pm.project_id === activeProject);
          const ownerIncluded = members.some(m => m.user_id === proj.owner_id);
          const allMemberIds = ownerIncluded ? members.map(m => m.user_id) : [proj.owner_id, ...members.map(m => m.user_id)].filter(Boolean);
          const uniqueIds = [...new Set(allMemberIds)];
          const maxShow = 5;
          const shown = uniqueIds.slice(0, maxShow);
          const extra = uniqueIds.length - maxShow;
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 0, flexShrink: 0 }}>
              {shown.map((uid, i) => {
                const p = profiles[uid];
                const name = p?.display_name || "?";
                const c = acol(uid);
                const isOwner = uid === proj.owner_id;
                return (
                  <div key={uid} title={`${name}${isOwner ? " (Owner)" : ""}`}
                    style={{ width: 28, height: 28, borderRadius: 14, background: `${c}20`, border: `2px solid ${isOwner ? c : T.surface}`, color: c, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, marginLeft: i > 0 ? -6 : 0, zIndex: maxShow - i, cursor: "default", position: "relative" }}>
                    {ini(uid)}
                  </div>
                );
              })}
              {extra > 0 && <div style={{ width: 28, height: 28, borderRadius: 14, background: T.surface3, border: `2px solid ${T.surface}`, color: T.text3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, marginLeft: -6 }}>+{extra}</div>}
              <button onClick={() => { setMemberSearch(""); setShowAddMember(true); }} title="Manage members"
                style={{ width: 28, height: 28, borderRadius: 14, background: "transparent", border: `1.5px dashed ${T.border}`, color: T.text3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, cursor: "pointer", marginLeft: 4 }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.color = T.accent; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.text3; }}>+</button>
            </div>
          );
        })()}
        {viewMode !== "Info" && <>{/* Visibility + Health badge */}
        <span style={{ ...S.pill, background: proj.visibility === "private" ? "#a855f715" : T.surface2, color: proj.visibility === "private" ? "#a855f7" : T.text3, border: `1px solid ${proj.visibility === "private" ? "#a855f730" : T.border}`, fontSize: 11, fontWeight: 600, gap: 4 }}>
          {proj.visibility === "private" ? "🔒 Private" : "🌐 Public"}
        </span>
        <span style={{ ...S.pill, background: hColor + "18", color: hColor, border: `1px solid ${hColor}40`, fontSize: 11, fontWeight: 700 }}>
          {hLabel}
        </span>
        {projOverdue.length > 0 && (
          <span style={{ ...S.pill, background: "#ef444415", color: "#ef4444", fontSize: 11 }}>
            ⚠ {projOverdue.length} overdue
          </span>
        )}
        {proj.objective_id && (() => {
          const obj = objectives.find(o => o.id === proj.objective_id);
          const kr = proj.key_result_id ? keyResultsForLink.find(k => k.id === proj.key_result_id) : null;
          return obj ? (
            <span style={{ ...S.pill, background: T.accentDim, color: T.accent, fontSize: 10, fontWeight: 600, gap: 3, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={`Objective: ${obj.title}${kr ? "\nKR: " + kr.title : ""}`}>
              ◎ {kr ? kr.title : obj.title}
            </span>
          ) : null;
        })()}
        {/* Progress ring */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <div style={{ position: "relative", width: 32, height: 32 }}>
            <svg width="32" height="32" style={{ transform: "rotate(-90deg)" }}>
              <circle cx="16" cy="16" r="12" fill="none" stroke={T.surface3} strokeWidth="3" />
              <circle cx="16" cy="16" r="12" fill="none" stroke={proj.color || T.accent} strokeWidth="3"
                strokeDasharray={`${progress * 0.754} 100`} strokeLinecap="round" />
            </svg>
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 800, color: T.text }}>{progress}%</div>
          </div>
          <div style={{ fontSize: 11, color: T.text3 }}>{doneCount}/{projTasks.length} done</div>
        </div>
        <button onClick={cycleHealth} title={`Click to change — currently ${healthLabels[projHealth]}`} style={{ ...S.pill, background: healthColors[projHealth] + "18", color: healthColors[projHealth], fontSize: 11, fontWeight: 700, gap: 4, border: `1px solid ${healthColors[projHealth]}40`, cursor: "pointer" }}>
          {healthIcons[projHealth]} {healthLabels[projHealth]}
        </button>
        <button onClick={() => { setStatusForm({ health: projHealth, summary: "", highlights: "", blockers: "" }); setShowStatusForm(true); }} style={{ ...S.pill, background: T.surface2, color: T.text3, fontSize: 11, gap: 4 }} title="Post status update">
          📋 Update
        </button>
        </>}
        <button onClick={openEditProject} style={S.iconBtn} title="Edit"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.text3} strokeWidth="2"><path d="M18.4 2.6a2.17 2.17 0 013 3L12 15l-4 1 1-4 9.4-9.4z"/></svg></button>
        <button onClick={() => archiveProject(proj.id)} style={S.iconBtn} title="Archive"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.text3} strokeWidth="2"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg></button>
        <button onClick={() => deleteProject(proj.id)} style={{ ...S.iconBtn, color: T.red }} title="Delete"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button>
        {showSidebar && <button onClick={() => setShowSidebar(false)} style={S.iconBtn} title="Collapse"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.text3} strokeWidth="2"><path d="M11 19l-7-7 7-7"/><path d="M4 12h16"/></svg></button>}
      </div>
      <div style={{ display: "flex", gap: 0, padding: "0 20px", overflow: "auto", alignItems: "center" }}>
        {visibleTabs.map(tab => (<button key={tab} onClick={() => setViewMode(tab)} style={{ padding: "8px 16px", fontSize: 13, fontWeight: viewMode === tab ? 600 : 400, color: viewMode === tab ? T.accent : T.text3, background: "none", border: "none", borderBottom: viewMode === tab ? `2px solid ${T.accent}` : "2px solid transparent", cursor: "pointer", transition: "all 0.15s" }}>{tab}</button>))}
        <div style={{ marginLeft: "auto" }}>
          <button onClick={() => setShowKeyboardHelp(v => !v)} title="Keyboard shortcuts (?)" style={{ ...S.iconBtn, fontSize: 11, color: T.text3, border: `1px solid ${T.border}`, borderRadius: 4, padding: "2px 7px" }}>?</button>
        </div>
      </div>
    </div>); })();
  const filterAssignees = [...new Set(projTasks.map(t => t.assignee_id).filter(Boolean))];
  const hasFilters = filterStatus !== "all" || filterPriority !== "all" || filterAssignee.length > 0;
  const filterBarEl = (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 20px", flexWrap: "wrap" }}>
      <div style={{ position: "relative", flex: "0 0 220px" }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={T.text3} strokeWidth="2" style={{ position: "absolute", left: 8, top: 7 }}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search tasks…" style={{ width: "100%", padding: "5px 8px 5px 28px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 12, outline: "none" }} />
      </div>
      <div style={{ width: 130 }}>
        <SearchableMultiSelect multi={true} placeholder="Status" allByDefault={true}
          options={Object.entries(STATUS).map(([k, v]) => ({ value: k, label: v.label, color: v.color }))}
          selected={filterStatus} onChange={setFilterStatus} />
      </div>
      <div style={{ width: 130 }}>
        <SearchableMultiSelect multi={true} placeholder="Priority" allByDefault={true}
          options={Object.entries(PRIORITY).map(([k, v]) => ({ value: k, label: v.label, color: v.dot }))}
          selected={filterPriority} onChange={setFilterPriority} />
      </div>
      <div style={{ width: 140 }}>
        <SearchableMultiSelect multi={true} placeholder="Assignee"
          options={filterAssignees.map(uid => ({ value: uid, label: uname(uid) || uid.slice(0, 8), icon: "👤" }))}
          selected={filterAssignee} onChange={setFilterAssignee} />
      </div>
      {hasFilters && <button onClick={() => { setFilterStatus("all"); setFilterPriority("all"); setFilterAssignee([]); }} style={{ ...S.iconBtn, fontSize: 11, color: T.red }}>✕ Clear</button>}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
        {selectedTasks.size > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 8, background: T.accentDim, border: `1px solid ${T.accent}40` }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: T.accent }}>{selectedTasks.size} selected</span>
            <div style={{ width: 1, height: 14, background: T.accent + "40", margin: "0 2px" }} />
            <select onChange={e => { if (e.target.value) { bulkUpdateTasks("status", e.target.value); e.target.value = ""; } }} defaultValue=""
              style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, border: `1px solid ${T.accent}40`, background: T.surface, color: T.text, cursor: "pointer", outline: "none" }}>
              <option value="">Status…</option>
              {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select onChange={e => { if (e.target.value) { bulkUpdateTasks("priority", e.target.value); e.target.value = ""; } }} defaultValue=""
              style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, border: `1px solid ${T.accent}40`, background: T.surface, color: T.text, cursor: "pointer", outline: "none" }}>
              <option value="">Priority…</option>
              {Object.entries(PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select onChange={e => { if (e.target.value) { bulkUpdateTasks("section_id", e.target.value); e.target.value = ""; } }} defaultValue=""
              style={{ fontSize: 11, padding: "2px 6px", borderRadius: 4, border: `1px solid ${T.accent}40`, background: T.surface, color: T.text, cursor: "pointer", outline: "none" }}>
              <option value="">Move to…</option>
              {projSections.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <div style={{ width: 110 }}>
              <SearchableMultiSelect multi={false} placeholder="Assign…"
                options={[{ value: "__none__", label: "Unassign", icon: "✕" }, ...Object.values(profiles).map(u => ({ value: u.id, label: u.display_name || u.email, icon: "👤" }))]}
                selected="" onChange={val => { if (val === "__none__") bulkUpdateTasks("assignee_id", null); else if (val) bulkUpdateTasks("assignee_id", val); }} />
            </div>
            <button onClick={() => { [...selectedTasks].forEach(id => deleteTask(id)); setSelectedTasks(new Set()); }}
              style={{ fontSize: 11, padding: "2px 8px", borderRadius: 4, border: `1px solid #ef444440`, background: "#ef444415", color: "#ef4444", cursor: "pointer", fontWeight: 600 }}>
              Delete
            </button>
            <button onClick={() => setSelectedTasks(new Set())} style={{ fontSize: 11, color: T.text3, background: "none", border: "none", cursor: "pointer", padding: "2px 4px" }}>✕</button>
          </div>
        )}
        <span style={{ fontSize: 11, color: T.text3 }}>{filteredTasks.filter(t => !t.parent_task_id).length} tasks</span>
      </div>
    </div>);
  const Checkbox = ({ task, size = 16 }) => {
    const dn = task.status === "done";
    const st = STATUS[task.status] || STATUS.todo;
    const isMultiSel = selectedTasks.has(task.id);
    return (
      <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
        {/* Multi-select checkbox (shown on hover or when any tasks selected) */}
        {(selectedTasks.size > 0 || isMultiSel) ? (
          <div onClick={e => { e.stopPropagation(); setSelectedTasks(p => { const n = new Set(p); n.has(task.id) ? n.delete(task.id) : n.add(task.id); return n; }); }}
            style={{ width: size, height: size, borderRadius: 4, border: `2px solid ${isMultiSel ? T.accent : T.border}`, background: isMultiSel ? T.accent : T.surface2, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            {isMultiSel && <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          </div>
        ) : (
          <div onClick={e => toggleDone(task, e)} style={{ width: size, height: size, borderRadius: size / 2, border: `2px solid ${dn ? T.green : st.color}`, background: dn ? T.green : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
            {dn && <svg width={size * 0.6} height={size * 0.6} viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
          </div>
        )}
      </div>
    );
  };

  // StatusPill, PriorityPill, AssigneeCell, DateCell moved to module scope






  // Refs to track current state values inside the stable TaskRow closure
  const _addingSubRef = useRef(null);
  const _expandedRef = useRef({});
  const _selTaskRef = useRef(null);
  const _editIdRef = useRef(null);
  const _editTitleRef = useRef("");
  const _newSubTitleRef = useRef("");
  const _selTasksRef = useRef(new Set());
  const _tasksRef = useRef([]);
  _addingSubRef.current = addingSubtaskTo;
  _expandedRef.current = expandedTasks;
  _selTaskRef.current = selectedTask;
  _editIdRef.current = editingTaskId;
  _editTitleRef.current = editingTaskTitle;
  _newSubTitleRef.current = newSubtaskTitle;
  _selTasksRef.current = selectedTasks;
  _tasksRef.current = tasks;
  _loadSubtasksRef.current = loadSubtasks;

  const _profileRef = useRef(null);
  _profilesRef.current = profiles;
  _profileRef.current = profile;
  const _projMembersRef = useRef([]);
  _projMembersRef.current = projMembersList;
  const _isMobileRef = useRef(false);
  _isMobileRef.current = isMobile;
  const _labelsRef = useRef([]); _labelsRef.current = labels;
  const _labelAssignmentsRef = useRef([]); _labelAssignmentsRef.current = labelAssignments;
  const _gridRef = useRef(""); _gridRef.current = listGrid;
  const _resolvedColsRef = useRef([]); _resolvedColsRef.current = resolvedCols;
  const _dependenciesRef = useRef([]); _dependenciesRef.current = dependencies;
  const _customFieldValuesRef = useRef({}); _customFieldValuesRef.current = customFieldValues;
  const _dragTaskRef = useRef(null); _dragTaskRef.current = dragTask;
  const _dragOverRowRef = useRef(null); _dragOverRowRef.current = dragOverRow;
  const _sortColRef = useRef("sort_order"); _sortColRef.current = sortCol;
  // List-view drag-to-reorder: reposition a root task within/into a section by
  // renumbering that section's sort_order. Only active when sortCol === "sort_order".
  const _reorderRef = useRef(null);
  _reorderRef.current = async (draggedId, targetTask) => {
    if (!draggedId || !targetTask || draggedId === targetTask.id) { setDragTask(null); setDragOverRow(null); return; }
    const targetSec = targetTask.section_id;
    const link = taskProjects.find(l => l.task_id === draggedId && l.project_id === activeProject);
    const real = tasks.find(t => t.id === draggedId);
    if (link && real && real.project_id !== activeProject) {
      if (link.section_id !== targetSec) {
        setTaskProjects(p => p.map(l => l.id === link.id ? { ...l, section_id: targetSec } : l));
        await supabase.from("task_projects").update({ section_id: targetSec }).eq("id", link.id);
      }
      setDragTask(null); setDragOverRow(null); return;
    }
    if (!real) { setDragTask(null); setDragOverRow(null); return; }
    const ordered = sortedTasks(rootTasks(filteredTasks.filter(t => t.section_id === targetSec))).filter(t => t.id !== draggedId);
    const dropIdx = ordered.findIndex(t => t.id === targetTask.id);
    ordered.splice(dropIdx < 0 ? ordered.length : dropIdx, 0, real);
    const updates = ordered.map((t, i) => ({ id: t.id, sort_order: i + 1 }));
    const secChanged = real.section_id !== targetSec;
    setTasks(prev => prev.map(t => { const u = updates.find(x => x.id === t.id); if (!u) return t; return { ...t, sort_order: u.sort_order, ...(t.id === draggedId ? { section_id: targetSec } : {}) }; }));
    setDragTask(null); setDragOverRow(null);
    try {
      for (const u of updates) {
        const patch = (u.id === draggedId && secChanged) ? { sort_order: u.sort_order, section_id: targetSec } : { sort_order: u.sort_order };
        await supabase.from("tasks").update(patch).eq("id", u.id);
      }
    } catch (e) { showToast("Failed to save new order"); }
  };

  const _dragOverSectionRef = useRef(null); _dragOverSectionRef.current = dragOverSection;
  const _moveToSectionRef = useRef(null);
  _moveToSectionRef.current = async (draggedId, targetSec) => {
    if (!draggedId || !targetSec) { setDragTask(null); setDragOverRow(null); setDragOverSection(null); return; }
    const link = taskProjects.find(l => l.task_id === draggedId && l.project_id === activeProject);
    const real = tasks.find(t => t.id === draggedId);
    if (link && real && real.project_id !== activeProject) {
      if (link.section_id !== targetSec) { setTaskProjects(p => p.map(l => l.id === link.id ? { ...l, section_id: targetSec } : l)); await supabase.from("task_projects").update({ section_id: targetSec }).eq("id", link.id); }
      setDragTask(null); setDragOverRow(null); setDragOverSection(null); return;
    }
    if (!real) { setDragTask(null); setDragOverRow(null); setDragOverSection(null); return; }
    const st = tasks.filter(t => t.section_id === targetSec && !t.parent_task_id && t.id !== draggedId);
    const mx = st.reduce((m, t) => Math.max(m, t.sort_order || 0), 0);
    const newOrder = mx + 1;
    setTasks(prev => prev.map(t => t.id === draggedId ? { ...t, section_id: targetSec, sort_order: newOrder } : t));
    setDragTask(null); setDragOverRow(null); setDragOverSection(null);
    try { await supabase.from("tasks").update({ section_id: targetSec, sort_order: newOrder }).eq("id", draggedId); } catch (e) { showToast("Failed to move task"); }
  };
  const renderExtraCell = (col, task) => {
    if (col.builtin === "blocked_by" || col.builtin === "blocking") {
      const deps = _dependenciesRef.current;
      const rel = col.builtin === "blocked_by" ? deps.filter(d => d.successor_id === task.id).map(d => d.predecessor_id) : deps.filter(d => d.predecessor_id === task.id).map(d => d.successor_id);
      if (!rel.length) return <span style={{ color: T.text3 }}>—</span>;
      const arr = _tasksRef.current;
      const c = col.builtin === "blocked_by" ? T.red : T.text3;
      const bg = col.builtin === "blocked_by" ? (T.redDim || T.surface3) : T.surface3;
      return <span style={{ display: "inline-flex", gap: 3, overflow: "hidden" }}>{rel.slice(0, 2).map(id => { const rt = arr.find(t => t.id === id); return <span key={id} style={{ fontSize: 10, padding: "1px 6px", borderRadius: 7, background: bg, color: c, fontWeight: 600, maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rt ? rt.title : "task"}</span>; })}{rel.length > 2 && <span style={{ fontSize: 10, color: T.text3 }}>+{rel.length - 2}</span>}</span>;
    }
    if (col.builtin === "start_date") return task.start_date ? <span>{_fmtColDate(task.start_date)}</span> : <span style={{ color: T.text3 }}>—</span>;
    if (col.builtin === "created_at") return task.created_at ? <span>{_fmtColDate(task.created_at)}</span> : <span style={{ color: T.text3 }}>—</span>;
    if (col.builtin === "tags") {
      const asg = _labelAssignmentsRef.current.filter(a => a.task_id === task.id).map(a => a.label_id);
      const tgs = _labelsRef.current.filter(l => asg.includes(l.id));
      if (!tgs.length) return <span style={{ color: T.text3 }}>—</span>;
      return <span style={{ display: "inline-flex", gap: 3 }}>{tgs.slice(0, 2).map(t => <span key={t.id} style={{ fontSize: 10, padding: "1px 6px", borderRadius: 7, background: (t.color || T.accent) + "22", color: t.color || T.accent, fontWeight: 700 }}>{t.name}</span>)}{tgs.length > 2 && <span style={{ fontSize: 10, color: T.text3 }}>+{tgs.length - 2}</span>}</span>;
    }
    if (col.cf) {
      const fld = col.cf; const val = (_customFieldValuesRef.current[task.id] || {})[fld.id];
      if (fld.field_type === "checkbox") { const on = val === true || val === "true"; return <span onClick={e => { e.stopPropagation(); updateCustomFieldValue(task.id, fld.id, !on); }} style={{ cursor: "pointer", fontSize: 14, color: on ? T.accent : T.text3 }}>{on ? "☑" : "☐"}</span>; }
      if (fld.field_type === "select") { const choices = fld.options?.choices || []; return <select value={val || ""} onClick={e => e.stopPropagation()} onChange={e => { e.stopPropagation(); updateCustomFieldValue(task.id, fld.id, e.target.value || null); }} style={{ background: "none", border: "none", color: val ? T.text2 : T.text3, fontSize: 12, outline: "none", cursor: "pointer", maxWidth: "100%", fontFamily: "inherit" }}><option value="">—</option>{choices.map(c => <option key={c} value={c}>{c}</option>)}</select>; }
      if (val == null || val === "") return <span style={{ color: T.text3 }}>—</span>;
      if (fld.field_type === "currency") return <span>{(fld.options?.currency_prefix || "$") + val}</span>;
      if (fld.field_type === "percent") return <span>{val}%</span>;
      if (fld.field_type === "rating") return <span>{"⭐".repeat(Math.min(5, Number(val) || 0))}</span>;
      if (fld.field_type === "date") return <span>{_fmtColDate(val)}</span>;
      if (fld.field_type === "url") return <a href={val} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} style={{ color: T.accent, textDecoration: "none" }}>{val}</a>;
      return <span>{String(val)}</span>;
    }
    return null;
  };
  const _taskRowRef = useRef(null);
  if (!_taskRowRef.current) _taskRowRef.current = ({ task, depth = 0 }) => {
    // Read current values from refs (not stale closure)
    const currentTasks = _tasksRef.current;
    const subs = currentTasks.filter(t => t.parent_task_id === task.id && (!filterStatus || filterStatus === "all" || t.status === filterStatus));
    const addingSub = _addingSubRef.current;
    const expanded = _expandedRef.current;
    const selTask = _selTaskRef.current;
    const editId = _editIdRef.current;
    const editTitle = _editTitleRef.current;
    const newSubTitle = _newSubTitleRef.current;
    const selTasks = _selTasksRef.current;

    const hasSubs = subs.length > 0 || (task.subtask_count || 0) > 0 || addingSub === task.id;
    const exp = expanded[task.id];
    const sel = selTask?.id === task.id;
    const isEditingTitle = editId === task.id;
    const saveTitle = async () => { if (_editTitleRef.current.trim() && _editTitleRef.current !== task.title) { await updateField(task.id, "title", _editTitleRef.current.trim()); } setEditingTaskId(null); };
    const rowRef = useRef(null);
    const TaskRow = _taskRowRef.current;
    return (<>{/* row */}<div ref={rowRef} className="task-row" draggable={depth === 0 && _sortColRef.current === "sort_order" && !isEditingTitle} onDragStart={e => { if (depth !== 0 || _sortColRef.current !== "sort_order") { e.preventDefault(); return; } e.stopPropagation(); setDragTask(task.id); try { e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", task.id); } catch (err) {} }} onDragOver={e => { const dt = _dragTaskRef.current; if (depth !== 0 || !dt || dt === task.id) return; e.preventDefault(); if (_dragOverRowRef.current !== task.id) setDragOverRow(task.id); }} onDragLeave={() => { if (_dragOverRowRef.current === task.id) setDragOverRow(null); }} onDrop={e => { const dt = _dragTaskRef.current; if (depth !== 0 || !dt) return; e.preventDefault(); e.stopPropagation(); if (_reorderRef.current) _reorderRef.current(dt, task); }} onDragEnd={() => { setDragTask(null); setDragOverRow(null); }} style={{ ...S.row(false, sel), gridTemplateColumns: _gridRef.current, paddingLeft: 12 + depth * 24, background: selTasks.has(task.id) ? T.accentDim : sel ? T.accentDim : "transparent", boxShadow: _dragOverRowRef.current === task.id ? `inset 0 2px 0 ${T.accent}` : undefined, opacity: _dragTaskRef.current === task.id ? 0.5 : 1 }} onMouseEnter={e => { e.currentTarget.querySelector('.row-actions')?.style.setProperty('display','flex'); e.currentTarget.style.background = sel ? T.accentDim : T.surface2; }} onMouseLeave={e => { e.currentTarget.querySelector('.row-actions')?.style.setProperty('display','none'); e.currentTarget.style.background = sel ? T.accentDim : selTasks.has(task.id) ? T.accentDim : 'transparent'; }}><div style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>{hasSubs ? <svg onClick={(e) => { e.stopPropagation(); if (!exp && _loadSubtasksRef.current) _loadSubtasksRef.current(task.id); setExpandedTasks(p => ({ ...p, [task.id]: !exp })); }} width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ cursor: "pointer", transform: exp ? "rotate(0)" : "rotate(-90deg)", transition: "transform 0.15s", flexShrink: 0 }}><path d="M3 4.5l3 3 3-3" stroke={T.text3} strokeWidth="1.5" strokeLinecap="round" /></svg> : <div style={{ width: 12 }} />}<Checkbox task={task} />{isEditingTitle ? <input value={editTitle} onChange={e => setEditingTaskTitle(e.target.value)} onBlur={saveTitle} onKeyDown={e => { if (e.key === "Enter") saveTitle(); if (e.key === "Escape") setEditingTaskId(null); }} onClick={e => e.stopPropagation()} style={{ flex: 1, fontSize: 13, background: T.surface2, border: `1px solid ${T.accent}`, borderRadius: 4, padding: "1px 6px", color: T.text, outline: "none", fontFamily: "inherit" }} /> : <span onClick={() => setSelectedTask(task)} onDoubleClick={e => { e.stopPropagation(); setEditingTaskId(task.id); setEditingTaskTitle(task.title); }} style={{ fontSize: 13, color: task.status === "done" ? T.text3 : T.text, textDecoration: task.status === "done" ? "line-through" : "none", fontWeight: sel ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, cursor: "pointer" }}>{task.title}</span>}{!isEditingTitle && (() => { const asg = _labelAssignmentsRef.current.filter(a => a.task_id === task.id).map(a => a.label_id); const tgs = _labelsRef.current.filter(l => asg.includes(l.id)); return tgs.length ? <span style={{ display: "inline-flex", gap: 3, flexShrink: 0 }}>{tgs.slice(0, 3).map(t => <span key={t.id} style={{ fontSize: 9, padding: "1px 6px", borderRadius: 8, background: (t.color || T.accent) + "22", color: t.color || T.accent, fontWeight: 700, whiteSpace: "nowrap" }}>{t.name}</span>)}{tgs.length > 3 && <span style={{ fontSize: 9, color: T.text3, alignSelf: "center" }}>+{tgs.length - 3}</span>}</span> : null; })()}{((subs.length > 0) || (task.subtask_count || 0) > 0) && !isEditingTitle && <span style={{ fontSize: 10, color: T.text3, background: T.surface3, padding: "1px 5px", borderRadius: 8, fontWeight: 600 }}>{subs.filter(s => s.status === "done").length}/{subs.length || task.subtask_count}</span>}{task.recurrence && task.recurrence !== "none" && !isEditingTitle && <span title={`Repeats ${task.recurrence}`} style={{ fontSize: 10, color: T.text3, opacity: 0.6 }}>🔄</span>}<div className="row-actions" style={{ display: "none", gap: 2 }}><button onClick={(e) => startAddSubtask(task, e)} style={S.iconBtn} title="Add subtask"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.text3} strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg></button><button onClick={(e) => { e.stopPropagation(); duplicateTask(task); }} style={S.iconBtn} title="Duplicate"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.text3} strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg></button><button onClick={(e) => { e.stopPropagation(); if (task.__sharedLink) { removeTaskFromProject(task.id, activeProject); } else { deleteTask(task.id); } }} style={S.iconBtn} title={task.__sharedLink ? "Remove from this project" : "Delete"}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.text3} strokeWidth="2"><path d="M3 6h18M8 6V4h8v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button></div></div><div onClick={e => e.stopPropagation()}><StatusPill task={task} onUpdate={updateField} S={S} /></div>{!_isMobileRef.current && <div onClick={e => e.stopPropagation()}><PriorityPill task={task} onUpdate={updateField} S={S} /></div>}{!_isMobileRef.current && <div onClick={e => e.stopPropagation()}><AssigneeCell task={task} onUpdate={updateField} profiles={_profilesRef.current} profile={_profileRef.current} ini={ini} acol={acol} uname={uname} projectMembers={_projMembersRef.current} activeProject={activeProject} /></div>}{!_isMobileRef.current && <div onClick={e => e.stopPropagation()}><DateCell task={task} onUpdate={updateField} /></div>}{!_isMobileRef.current && _resolvedColsRef.current.map(col => (<div key={col.id} onClick={e => e.stopPropagation()} style={{ padding: "0 8px", overflow: "hidden", fontSize: 12, color: T.text2, whiteSpace: "nowrap", textOverflow: "ellipsis", display: "flex", alignItems: "center" }}>{renderExtraCell(col, task)}</div>))}{!_isMobileRef.current && <><div /><div /></>}</div>{exp && subs.map(sub => <TaskRow key={sub.id} task={sub} depth={depth + 1} />)}{exp && addingSub === task.id && <div style={{ ...S.row(false, false), paddingLeft: 36 + depth * 24, background: T.surface2 }}><div style={{ display: "flex", alignItems: "center", gap: 6 }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg><input value={newSubTitle} onChange={e => setNewSubtaskTitle(e.target.value)} onKeyDown={e => { if (e.key === "Enter") createSubtask(task, null, true); if (e.key === "Escape") { setAddingSubtaskTo(null); setNewSubtaskTitle(""); } }} onBlur={() => { if (_newSubTitleRef.current.trim()) createSubtask(task); else { setAddingSubtaskTo(null); setNewSubtaskTitle(""); } }} autoFocus placeholder="Subtask name…" style={{ flex: 1, background: "none", border: "none", color: T.text, fontSize: 12, outline: "none" }} /></div>{!_isMobileRef.current && <><div /><div /><div /></>}</div>}</>); };

  const listViewEl = (() => { const TaskRow = _taskRowRef.current; const toggleSort = (col) => { setSortCol(col); setSortDir(p => sortCol === col && p === "asc" ? "desc" : "asc"); }; const arrow = (col) => sortCol === col ? (sortDir === "asc" ? " ↑" : " ↓") : ""; return (
    <div style={{ flex: 1, overflow: "auto", padding: "0 0 80px" }}>
      <div style={{ display: "grid", gridTemplateColumns: listGrid, padding: isMobile ? "0 8px" : "0 12px", borderBottom: `1px solid ${T.border}`, position: "sticky", top: 0, zIndex: 5, background: T.bg }}>
        <div style={{ ...S.colHdr, position: "relative" }} onClick={() => toggleSort("title")}>Task name{arrow("title")}<ResizeHandle onDown={(e) => projResize(0, e)} /></div>
        <div style={{ ...S.colHdr, position: "relative" }} onClick={() => toggleSort("status")}>Status{arrow("status")}<ResizeHandle onDown={(e) => projResize(1, e)} /></div>
        {!isMobile && <div style={{ ...S.colHdr, position: "relative" }} onClick={() => toggleSort("priority")}>Priority{arrow("priority")}<ResizeHandle onDown={(e) => projResize(2, e)} /></div>}
        {!isMobile && <div style={{ ...S.colHdr, position: "relative" }}>Assignee<ResizeHandle onDown={(e) => projResize(3, e)} /></div>}
        {!isMobile && <div style={{ ...S.colHdr, position: "relative" }} onClick={() => toggleSort("due_date")} title="Sort by due date">Dates{arrow("due_date")}<ResizeHandle onDown={(e) => projResize(4, e)} /></div>}
        {!isMobile && resolvedCols.map(col => (
          <div key={col.id} draggable onDragStart={e => { e.dataTransfer.setData("hcol-id", col.id); e.dataTransfer.effectAllowed = "move"; }} onDragOver={e => { e.preventDefault(); }} onDrop={e => { e.preventDefault(); const src = e.dataTransfer.getData("hcol-id"); if (src && src !== col.id) reorderColumnTo(src, col); }} style={{ ...S.colHdr, position: "relative", justifyContent: "space-between", cursor: "grab" }}>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{col.label}</span>
            <button onClick={e => { e.stopPropagation(); setColMenu(colMenu === col.id ? null : col.id); }} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 13, padding: "0 2px", flexShrink: 0 }}>⋯</button>
            {colMenu === col.id && (<>
              <div onClick={() => setColMenu(null)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
              <div style={{ position: "absolute", top: "100%", right: 0, zIndex: 41, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.25)", padding: 4, minWidth: 150 }}>
                <div onClick={() => moveColumn(col, -1)} style={colMenuItem}>← Move left</div>
                <div onClick={() => moveColumn(col, 1)} style={colMenuItem}>→ Move right</div>
                {col.cf && <div onClick={() => renameColumnField(col.cf)} style={colMenuItem}>✎ Rename field</div>}
                {col.cf && col.cf.field_type === "select" && <div onClick={() => editFieldOptions(col.cf)} style={colMenuItem}>☰ Edit options</div>}
                <div onClick={() => removeColumn(col)} style={{ ...colMenuItem, color: T.red }}>✕ Remove column</div>
                {col.cf && <div onClick={() => { if (window.confirm("Delete this field and its values from every task?")) { deleteCustomField(col.cf.id); removeColumn(col); } }} style={{ ...colMenuItem, color: T.red }}>🗑 Delete field</div>}
              </div>
            </>)}
            <ResizeHandle onDown={(e) => onExtraResizeStart(col, e)} />
          </div>
        ))}
        {!isMobile && <div style={{ ...S.colHdr, cursor: "default" }} />}
        {!isMobile && (
          <div style={{ ...S.colHdr, position: "relative", justifyContent: "center", cursor: "pointer" }} onClick={() => setShowAddColMenu(v => !v)} title="Add column">＋
            {showAddColMenu && (<>
              <div onClick={() => setShowAddColMenu(false)} style={{ position: "fixed", inset: 0, zIndex: 40 }} />
              <div onClick={e => e.stopPropagation()} style={{ position: "absolute", top: "100%", right: 0, zIndex: 41, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.25)", padding: 6, width: 230, maxHeight: 360, overflow: "auto" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", padding: "4px 6px" }}>Add column</div>
                {BUILTIN_COLS.filter(b => !(listColumns || []).some(c => c.t === "builtin" && c.key === b.key)).map(b => (
                  <div key={b.key} onClick={() => addColumn({ t: "builtin", key: b.key })} style={colMenuItem}>{b.label}</div>
                ))}
                {customFields.filter(fld => !(listColumns || []).some(c => c.t === "cf" && c.id === fld.id)).map(fld => (
                  <div key={fld.id} onClick={() => addColumn({ t: "cf", id: fld.id })} style={colMenuItem}>▦ {fld.name}</div>
                ))}
                <div style={{ borderTop: `1px solid ${T.border}`, marginTop: 6, paddingTop: 6 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", padding: "2px 6px 4px" }}>New field</div>
                  <input value={newColName} onChange={e => setNewColName(e.target.value)} placeholder="Field name" onClick={e => e.stopPropagation()} style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 12, outline: "none", boxSizing: "border-box", marginBottom: 6 }} />
                  {newColType === "select" && <input value={newColOptions} onChange={e => setNewColOptions(e.target.value)} placeholder="Options (comma-separated)" onClick={e => e.stopPropagation()} style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: `1px solid ${T.accent}40`, background: T.surface2, color: T.text, fontSize: 12, outline: "none", boxSizing: "border-box", marginBottom: 6 }} />}
                  <div style={{ display: "flex", gap: 6 }}>
                    <select value={newColType} onChange={e => setNewColType(e.target.value)} onClick={e => e.stopPropagation()} style={{ flex: 1, padding: "6px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 12, outline: "none" }}>
                      {["text", "number", "currency", "date", "select", "checkbox", "url", "email", "percent", "rating"].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <button onClick={createColumnField} style={{ padding: "6px 12px", borderRadius: 6, border: "none", background: T.accent, color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Add</button>
                  </div>
                </div>
              </div>
            </>)}
          </div>
        )}
      </div>
      {sharedRoots.length > 0 && (() => { const coll = collapsed["__shared__"]; return (
        <div key="__shared__">
          <div onClick={() => setCollapsed(p => ({ ...p, ["__shared__"]: !coll }))} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", cursor: "pointer", userSelect: "none" }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ transform: coll ? "rotate(-90deg)" : "rotate(0)", transition: "transform 0.15s" }}><path d="M3 4.5l3 3 3-3" stroke={T.accent} strokeWidth="1.5" strokeLinecap="round" /></svg>
            <span style={{ fontSize: 13, fontWeight: 700, color: T.accent, flex: 1 }}>📎 Also here (from other projects)</span>
            <span style={{ fontSize: 11, color: T.text3, fontWeight: 500 }}>{sharedRoots.length}</span>
          </div>
          {!coll && sharedRoots.map(task => { const home = projects.find(p => p.id === task.project_id); return (
            <div key={"shared-" + task.id} style={{ ...S.row(false, false) }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden" }}>
                <div style={{ width: 12 }} />
                <Checkbox task={task} />
                <span onClick={() => setSelectedTask(task)} style={{ fontSize: 13, color: task.status === "done" ? T.text3 : T.text, textDecoration: task.status === "done" ? "line-through" : "none", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, cursor: "pointer" }}>{task.title}</span>
                {home && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 8, background: `${T.accent}15`, color: T.accent, fontWeight: 700, flexShrink: 0 }}>{home.name}</span>}
                <button onClick={(e) => { e.stopPropagation(); removeTaskFromProject(task.id, activeProject); }} title="Remove from this project" style={S.iconBtn}>✕</button>
              </div>
              <div onClick={e => e.stopPropagation()}><StatusPill task={task} onUpdate={updateField} S={S} /></div>
              {!_isMobileRef.current && <div onClick={e => e.stopPropagation()}><PriorityPill task={task} onUpdate={updateField} S={S} /></div>}
              {!_isMobileRef.current && <div onClick={e => e.stopPropagation()}><AssigneeCell task={task} onUpdate={updateField} profiles={_profilesRef.current} profile={_profileRef.current} ini={ini} acol={acol} uname={uname} projectMembers={_projMembersRef.current} activeProject={activeProject} /></div>}
              {!_isMobileRef.current && <div />}
            </div>
          ); })}
        </div>
      ); })()}
      {projSections.map((sec, si) => { const st = filteredTasks.filter(t => t.section_id === sec.id); const roots = sortedTasks(rootTasks(st)); const isColl = collapsed[sec.id]; const sd = st.filter(t => t.status === "done").length; const color = secColor(si);
        const wipBreached = sec.wip_limit && st.filter(t => t.status !== "done").length > sec.wip_limit;
        return (
        <div key={sec.id} style={{ background: dragOverSection === sec.id ? T.accentDim + "22" : "transparent", outline: dragOverSection === sec.id ? `2px dashed ${T.accent}66` : "none", outlineOffset: -2, borderRadius: 8, transition: "background 0.1s" }}
          onDragOver={e => { if (_dragTaskRef.current) { e.preventDefault(); if (_dragOverSectionRef.current !== sec.id) setDragOverSection(sec.id); } }}
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) { if (_dragOverSectionRef.current === sec.id) setDragOverSection(null); } }}
          onDrop={e => { const dt = _dragTaskRef.current; if (!dt) return; e.preventDefault(); if (_moveToSectionRef.current) _moveToSectionRef.current(dt, sec.id); }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", cursor: "pointer", userSelect: "none", position: "relative" }}
            onContextMenu={e => { e.preventDefault(); setSectionCtxMenu({ secId: sec.id, x: e.clientX, y: e.clientY }); }}
            draggable onDragStart={e => { e.dataTransfer.setData("section-id", sec.id); e.currentTarget.style.opacity = "0.4"; }}
            onDragEnd={e => { e.currentTarget.style.opacity = "1"; }}
            onDragOver={e => { e.preventDefault(); e.currentTarget.style.background = T.accentDim; }}
            onDragLeave={e => { e.currentTarget.style.background = "transparent"; }}
            onDrop={async e => {
              e.currentTarget.style.background = "transparent";
              const draggedId = e.dataTransfer.getData("section-id");
              if (!draggedId || draggedId === sec.id) return;
              const draggedIdx = projSections.findIndex(s => s.id === draggedId);
              const dropIdx = si;
              if (draggedIdx < 0) return;
              const reordered = [...projSections];
              const [moved] = reordered.splice(draggedIdx, 1);
              reordered.splice(dropIdx, 0, moved);
              const updates = reordered.map((s, i) => ({ ...s, sort_order: i + 1 }));
              setSections(p => p.map(s => { const u = updates.find(x => x.id === s.id); return u ? { ...s, sort_order: u.sort_order } : s; }));
              for (const u of updates) { await supabase.from("sections").update({ sort_order: u.sort_order }).eq("id", u.id); }
            }}>
            {/* Drag handle */}
            <div style={{ cursor: "grab", color: T.text3, opacity: 0.3, fontSize: 10, flexShrink: 0, lineHeight: 1 }} title="Drag to reorder">⣿</div>
            <svg onClick={() => setCollapsed(p => ({ ...p, [sec.id]: !isColl }))} width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ cursor: "pointer", transform: isColl ? "rotate(-90deg)" : "rotate(0)", transition: "transform 0.15s" }}><path d="M3 4.5l3 3 3-3" stroke={color} strokeWidth="1.5" strokeLinecap="round" /></svg>
            {editingSectionId === sec.id ? <input value={editingSectionName} onChange={e => setEditingSectionName(e.target.value)} onBlur={() => renameSection(sec.id)} onKeyDown={e => { if (e.key === "Enter") renameSection(sec.id); if (e.key === "Escape") setEditingSectionId(null); }} onClick={e => e.stopPropagation()} style={{ fontSize: 13, fontWeight: 700, color, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 4, padding: "2px 6px", outline: "none" }} /> : <span onDoubleClick={() => { setEditingSectionId(sec.id); setEditingSectionName(sec.name); }} style={{ fontSize: 13, fontWeight: 700, color, flex: 1 }}>{sec.name}</span>}
            {sec.is_complete_column && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: "#22c55e20", color: "#22c55e", fontWeight: 700 }}>DONE</span>}
            {sec.wip_limit && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: wipBreached ? "#ef444420" : T.surface3, color: wipBreached ? "#ef4444" : T.text3, fontWeight: 700 }}>WIP {st.filter(t => t.status !== "done").length}/{sec.wip_limit}</span>}
            <span style={{ fontSize: 11, color: T.text3, fontWeight: 500 }}>{sd}/{st.length}</span>
            {/* Up/Down arrows */}
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              <button onClick={e => { e.stopPropagation(); moveSection(sec.id, "up"); }} disabled={si === 0}
                style={{ ...S.iconBtn, padding: 0, opacity: si === 0 ? 0.15 : 0.5, fontSize: 9, lineHeight: 1 }} title="Move up">▲</button>
              <button onClick={e => { e.stopPropagation(); moveSection(sec.id, "down"); }} disabled={si === projSections.length - 1}
                style={{ ...S.iconBtn, padding: 0, opacity: si === projSections.length - 1 ? 0.15 : 0.5, fontSize: 9, lineHeight: 1 }} title="Move down">▼</button>
            </div>
            {/* Rename button */}
            <button onClick={e => { e.stopPropagation(); setEditingSectionId(sec.id); setEditingSectionName(sec.name); }} style={{ ...S.iconBtn, opacity: 0.4 }} title="Rename section">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18.4 2.6a2.17 2.17 0 013 3L12 15l-4 1 1-4 9.4-9.4z"/></svg>
            </button>
            <button onClick={() => deleteSection(sec.id)} style={{ ...S.iconBtn, opacity: 0.4 }} title="Delete section"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M8 6V4h8v2M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"/></svg></button>
          </div>
          {!isColl && <>{roots.map(task => <TaskRow key={task.id} task={task} depth={0} />)}{addingTo === sec.id ? <div style={{ ...S.row(false, false), background: T.surface2 }}><div style={{ display: "flex", alignItems: "center", gap: 8, paddingLeft: 20 }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg><input value={newTitle} onChange={e => setNewTitle(e.target.value)} onKeyDown={e => { if (e.key === "Enter") createTask(sec.id); if (e.key === "Escape") { setAddingTo(null); setNewTitle(""); } }} onBlur={() => { if (newTitle.trim()) createTask(sec.id); else { setAddingTo(null); setNewTitle(""); } }} autoFocus placeholder="Task name…" style={{ flex: 1, background: "none", border: "none", color: T.text, fontSize: 13, outline: "none" }} /></div><div /><div /><div /><div /></div> : <div onClick={() => { setAddingTo(sec.id); setNewTitle(""); }} style={{ ...S.addRow, opacity: 0.6 }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.6}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>Add task…</div>}</>}
        </div>); })}
      {addingSection ? <div style={{ padding: "8px 12px", display: "flex", gap: 8 }}><input autoFocus value={newSectionName} onChange={e => setNewSectionName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") createSection(); if (e.key === "Escape") setAddingSection(false); }} placeholder="Section name…" style={{ flex: 1, padding: "5px 8px", borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, outline: "none" }} /><button onClick={createSection} style={{ padding: "4px 12px", borderRadius: 4, background: T.accent, color: "#fff", border: "none", fontSize: 12, cursor: "pointer" }}>Add</button></div> : <div onClick={() => setAddingSection(true)} style={{ ...S.addRow, opacity: 0.5, paddingLeft: 12 }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.5}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>Add section…</div>}
    </div>); })();
  const boardViewEl = (
    <div style={{ flex: 1, display: "flex", gap: 16, padding: "16px 20px", overflow: "auto" }}>
      {sharedRoots.length > 0 && (
        <div style={{ width: isMobile ? 260 : 280, flexShrink: 0, display: "flex", flexDirection: "column", borderRadius: 10, background: T.surface, border: `1px dashed ${T.accent}55` }}>
          <div style={{ padding: "12px 14px 8px", display: "flex", alignItems: "center", gap: 8, borderBottom: `2px solid ${T.accent}` }}>
            <span style={{ fontSize: 13 }}>📎</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: T.accent, flex: 1 }}>Also here</span>
            <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 8, background: T.surface3, color: T.text3 }}>{sharedRoots.length}</span>
          </div>
          <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 8, overflow: "auto" }}>
            {sharedRoots.map(task => { const pr = PRIORITY[task.priority] || PRIORITY.none; const isDone = task.status === "done"; const home = projects.find(p => p.id === task.project_id); return (
              <div key={"shared-" + task.id} onClick={() => setSelectedTask(task)} style={{ padding: "10px 12px", borderRadius: 8, background: isDone ? T.surface3 : T.surface2, border: `1px solid ${T.border}`, cursor: "pointer" }}>
                {task.priority && task.priority !== "none" && <div style={{ width: "100%", height: 2, borderRadius: 1, background: pr.dot, marginBottom: 6 }} />}
                <div style={{ fontSize: 13, fontWeight: 500, color: isDone ? T.text3 : T.text, textDecoration: isDone ? "line-through" : "none", marginBottom: 6, lineHeight: 1.4 }}>{task.title}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                  {home && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 8, background: `${T.accent}15`, color: T.accent, fontWeight: 700 }}>{home.name}</span>}
                  {task.due_date && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 8, background: isOverdue(task.due_date) && !isDone ? T.redDim : T.surface3, color: isOverdue(task.due_date) && !isDone ? T.red : T.text3, fontWeight: 500 }}>{toDateStr(task.due_date)}</span>}
                  <div style={{ flex: 1 }} />
                  {task.assignee_id && <div style={{ width: 22, height: 22, borderRadius: 11, background: acol(task.assignee_id) + "30", color: acol(task.assignee_id), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700 }}>{ini(task.assignee_id)}</div>}
                </div>
              </div>
            ); })}
          </div>
        </div>
      )}
      {projSections.map((sec, si) => {
        const st = filteredTasks.filter(t => t.section_id === sec.id && !t.parent_task_id);
        const color = secColor(si);
        const isOver = dragOverTarget === sec.id;
        const wipLimit = sec.wip_limit;
        const isWipBreached = wipLimit && st.length > wipLimit;
        const isDoneCol = sec.is_complete_column || sec.name.toLowerCase() === "done";
        const borderColor = isOver ? T.accent : isWipBreached ? "#ef4444" : T.border;
        return (
          <div key={sec.id}
            onDragOver={(e) => {
              e.preventDefault();
              // Accept both task drops and section drops
              setDragOverTarget(sec.id);
            }}
            onDragLeave={() => setDragOverTarget(null)}
            onDrop={(e) => {
              const sectionId = e.dataTransfer.getData("board-section-id");
              if (sectionId && sectionId !== sec.id) {
                // Section reorder
                const draggedIdx = projSections.findIndex(s => s.id === sectionId);
                const dropIdx = si;
                if (draggedIdx >= 0) {
                  const reordered = [...projSections];
                  const [moved] = reordered.splice(draggedIdx, 1);
                  reordered.splice(dropIdx, 0, moved);
                  const updates = reordered.map((s, i) => ({ ...s, sort_order: i + 1 }));
                  setSections(p => p.map(s => { const u = updates.find(x => x.id === s.id); return u ? { ...s, sort_order: u.sort_order } : s; }));
                  for (const u of updates) { supabase.from("sections").update({ sort_order: u.sort_order }).eq("id", u.id); }
                }
                setDragOverTarget(null);
                return;
              }
              if (dragTask) handleBoardDrop(dragTask, sec.id);
            }}
            style={{ width: isMobile ? 260 : 280, flexShrink: 0, display: "flex", flexDirection: "column", borderRadius: 10, background: isOver ? T.accentDim : T.surface, border: `1px solid ${borderColor}`, transition: "border 0.15s" }}>
            <div
              draggable
              onDragStart={e => { e.dataTransfer.setData("board-section-id", sec.id); e.currentTarget.style.opacity = "0.4"; }}
              onDragEnd={e => { e.currentTarget.style.opacity = "1"; setDragOverTarget(null); }}
              style={{ padding: "12px 14px 8px", display: "flex", alignItems: "center", gap: 8, borderBottom: `2px solid ${isDoneCol ? "#22c55e" : color}`, cursor: "grab" }}>
              <div style={{ color: T.text3, opacity: 0.3, fontSize: 10, flexShrink: 0, lineHeight: 1 }} title="Drag to reorder">⣿</div>
              {isDoneCol ? <span style={{ fontSize: 14 }}>✅</span> : null}
              <span style={{ fontSize: 13, fontWeight: 700, color: isDoneCol ? "#22c55e" : color, flex: 1 }}>{sec.name}</span>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "1px 7px", borderRadius: 8,
                background: isWipBreached ? "#ef444420" : T.surface3,
                color: isWipBreached ? "#ef4444" : T.text3 }}>
                {st.length}{wipLimit ? `/${wipLimit}` : ""}
              </span>
              {isWipBreached && <span title="WIP limit exceeded!" style={{ fontSize: 12 }}>⚠️</span>}
            </div>
            <div style={{ flex: 1, padding: 8, display: "flex", flexDirection: "column", gap: 6, overflow: "auto" }}>
              {st.map(task => {
                const subs = getSubtasks(task.id);
                const pr = PRIORITY[task.priority] || PRIORITY.none;
                const isDone = task.status === "done";
                return (
                  <div key={task.id} draggable
                    onDragStart={() => setDragTask(task.id)}
                    onDragEnd={() => { setDragTask(null); setDragOverTarget(null); }}
                    onClick={() => setSelectedTask(task)}
                    style={{ padding: "10px 12px", borderRadius: 8, background: isDone ? T.surface3 : T.surface2, border: `1px solid ${T.border}`, cursor: "pointer", opacity: dragTask === task.id ? 0.5 : 1, transition: "all 0.1s" }}
                    onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 3px 12px rgba(0,0,0,0.15)`; e.currentTarget.style.transform = "translateY(-1px)"; }}
                    onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; e.currentTarget.style.transform = "none"; }}>
                    {task.priority && task.priority !== "none" && <div style={{ width: "100%", height: 2, borderRadius: 1, background: pr.dot, marginBottom: 6 }} />}
                    <div style={{ fontSize: 13, fontWeight: 500, color: isDone ? T.text3 : T.text, textDecoration: isDone ? "line-through" : "none", marginBottom: 8, lineHeight: 1.4 }}>{task.title}</div>
                    {(() => { const tgs = getTaskLabels(task.id); return tgs.length > 0 ? (
                      <div style={{ display: "flex", gap: 3, flexWrap: "wrap", marginBottom: 6 }}>
                        {tgs.map(t => <span key={t.id} style={{ fontSize: 9, padding: "1px 6px", borderRadius: 8, background: (t.color || T.accent) + "22", color: t.color || T.accent, fontWeight: 700 }}>{t.name}</span>)}
                      </div>
                    ) : null; })()}
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                      {(task.start_date || task.due_date) && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 8, background: isOverdue(task.due_date) && !isDone ? T.redDim : T.surface3, color: isOverdue(task.due_date) && !isDone ? T.red : T.text3, fontWeight: 500 }}>{task.start_date && task.due_date ? `${toDateStr(task.start_date)} → ${toDateStr(task.due_date)}` : toDateStr(task.due_date || task.start_date)}</span>}
                      {subs.length > 0 && <span style={{ fontSize: 10, color: T.text3 }}>✓ {subs.filter(s => s.status === "done").length}/{subs.length}</span>}
                      {task.story_points && <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 4, background: T.surface3, color: T.text3, fontWeight: 700 }}>{task.story_points}sp</span>}
                      <div style={{ flex: 1 }} />
                      {task.assignee_id && <div style={{ width: 22, height: 22, borderRadius: 11, background: acol(task.assignee_id) + "30", color: acol(task.assignee_id), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700 }}>{ini(task.assignee_id)}</div>}
                    </div>
                  </div>
                );
              })}
              {addingTo === sec.id
                ? <div style={{ padding: 8 }}><input value={newTitle} onChange={e => setNewTitle(e.target.value)} onKeyDown={e => { if (e.key === "Enter") createTask(sec.id); if (e.key === "Escape") { setAddingTo(null); setNewTitle(""); } }} onBlur={() => { if (newTitle.trim()) createTask(sec.id); else { setAddingTo(null); setNewTitle(""); } }} autoFocus placeholder="Task name…" style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontSize: 12, outline: "none" }} /></div>
                : <div onClick={() => { setAddingTo(sec.id); setNewTitle(""); }} style={{ padding: "6px 8px", color: T.text3, fontSize: 12, cursor: "pointer", borderRadius: 6, display: "flex", alignItems: "center", gap: 4, opacity: 0.6 }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.6}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>Add task</div>}
            </div>
          </div>
        );
      })}
      {/* Add Section column */}
      {addingSection ? (
        <div style={{ width: isMobile ? 260 : 280, flexShrink: 0, display: "flex", flexDirection: "column", borderRadius: 10, background: T.surface, border: `1px dashed ${T.accent}40`, padding: 12 }}>
          <input autoFocus value={newSectionName} onChange={e => setNewSectionName(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && newSectionName.trim()) createSection(); if (e.key === "Escape") { setAddingSection(false); setNewSectionName(""); } }}
            onBlur={() => { if (newSectionName.trim()) createSection(); else { setAddingSection(false); setNewSectionName(""); } }}
            placeholder="Section name…"
            style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${T.accent}40`, background: T.surface2, color: T.text, fontSize: 13, outline: "none", fontFamily: "inherit" }} />
        </div>
      ) : (
        <div onClick={() => { setAddingSection(true); setNewSectionName(""); }}
          style={{ width: isMobile ? 260 : 280, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 10, border: `2px dashed ${T.border}`, cursor: "pointer", minHeight: 120, transition: "all 0.15s" }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent + "60"; e.currentTarget.style.background = T.surface + "80"; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = "transparent"; }}>
          <div style={{ textAlign: "center", color: T.text3 }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ margin: "0 auto 6px", display: "block", opacity: 0.5 }}><path d="M12 5v14M5 12h14"/></svg>
            <span style={{ fontSize: 12, fontWeight: 600 }}>Add Section</span>
          </div>
        </div>
      )}
    </div>
  );
  const timelineViewEl = (() => {
    const topTasks = filteredTasks.filter(t => !t.parent_task_id && (t.start_date || t.due_date));
    const topIds = new Set(topTasks.map(t => t.id));
    const subsByParent = {};
    projTasks.forEach(t => { if (t.parent_task_id && topIds.has(t.parent_task_id) && (t.start_date || t.due_date)) { (subsByParent[t.parent_task_id] = subsByParent[t.parent_task_id] || []).push(t); } });
    Object.values(subsByParent).forEach(arr => arr.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0)));
    const tw = [...topTasks, ...Object.values(subsByParent).flat()];
    if (!tw.length) return (
      <div style={{ padding: 40, textAlign: "center", color: T.text3 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📅</div>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>No tasks with dates</div>
        <div style={{ fontSize: 12 }}>Add start dates and due dates to your tasks to see the Gantt chart</div>
      </div>
    );
    const DAY_W = 30;
    const ROW_H = 36;
    const LABEL_W = 220;
    const today = new Date().toISOString().split("T")[0];

    // Date range — extend to at least 6 months out and start from beginning of earliest month
    const allDates = tw.flatMap(t => [t.start_date, t.due_date].filter(Boolean).map(d => new Date(d)));
    const rawMin = new Date(Math.min(...allDates.map(d => d.getTime())));
    const rawMax = new Date(Math.max(...allDates.map(d => d.getTime())));
    // Start from 1st of the earliest month (minus 1 week buffer)
    const minD = new Date(rawMin.getFullYear(), rawMin.getMonth(), 1);
    minD.setDate(minD.getDate() - 7);
    // End at least 6 months from today, or 90 days past latest task, whichever is further
    const sixMonthsOut = new Date(); sixMonthsOut.setMonth(sixMonthsOut.getMonth() + 6);
    const ninetyPast = new Date(rawMax.getTime() + 90 * 86400000);
    const maxD = new Date(Math.max(sixMonthsOut.getTime(), ninetyPast.getTime()));
    const totalDays = Math.ceil((maxD - minD) / 86400000);

    const getX = (dateStr) => Math.round(((new Date(dateStr) - minD) / 86400000) * DAY_W);
    const todayX = getX(today);

    // Build month markers
    const months = [];
    const d = new Date(minD); d.setDate(1);
    while (d <= maxD) {
      const mStart = Math.max(0, Math.round(((new Date(d) - minD) / 86400000) * DAY_W));
      const nextM = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const mEnd = Math.round(((Math.min(nextM, maxD) - minD) / 86400000) * DAY_W);
      months.push({ label: d.toLocaleDateString("en-US", { month: "short", year: "2-digit" }), x: mStart, width: mEnd - mStart });
      d.setMonth(d.getMonth() + 1);
    }

    // Group tasks by section
    const bySection = projSections.map(sec => ({
      sec,
      tasks: topTasks.filter(t => t.section_id === sec.id),
    })).filter(g => g.tasks.length > 0);

    let rowIndex = 0;
    const rows = bySection.flatMap(({ sec, tasks }) => {
      const secRow = { type: "section", sec, rowIndex: rowIndex++ };
      const taskRows = tasks.flatMap(task => {
        const trow = { type: "task", task, depth: 0, rowIndex: rowIndex++ };
        const subRows = (subsByParent[task.id] || []).map(sub => ({ type: "task", task: sub, depth: 1, rowIndex: rowIndex++ }));
        return [trow, ...subRows];
      });
      return [secRow, ...taskRows];
    });

    const totalHeight = rows.length * ROW_H + 60;

    return (
      <div style={{ flex: 1, overflow: "auto" }}>
        <div style={{ display: "flex", minWidth: LABEL_W + totalDays * DAY_W }}>
          {/* Sticky label column */}
          <div style={{ width: LABEL_W, flexShrink: 0, position: "sticky", left: 0, zIndex: 4, background: T.bg }}>
            {/* Header */}
            <div style={{ height: 52, borderBottom: `1px solid ${T.border}`, borderRight: `1px solid ${T.border}`, background: T.surface, display: "flex", alignItems: "flex-end", padding: "0 12px 6px" }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.8 }}>Task</span>
            </div>
            {/* Rows */}
            {rows.map(row => (
              <div key={row.type === "section" ? `sec-${row.sec.id}` : `task-${row.task.id}`}
                style={{ height: ROW_H, borderBottom: `1px solid ${T.border}`, borderRight: `1px solid ${T.border}`, display: "flex", alignItems: "center", padding: row.type === "section" ? "0 12px" : `0 12px 0 ${24 + (row.depth || 0) * 20}px`, background: row.type === "section" ? T.surface2 : "transparent" }}>
                {row.type === "section" ? (
                  <span style={{ fontSize: 11, fontWeight: 700, color: SECTION_COLORS[projSections.indexOf(row.sec) % SECTION_COLORS.length] || T.accent, textTransform: "uppercase", letterSpacing: 0.5 }}>{row.sec.name}</span>
                ) : (
                  <div onClick={() => setSelectedTask(row.task)} style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer", flex: 1, minWidth: 0 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 5, border: `2px solid ${row.task.status === "done" ? "#22c55e" : T.border}`, background: row.task.status === "done" ? "#22c55e" : "transparent", flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: row.task.status === "done" ? T.text3 : T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: row.task.status === "done" ? "line-through" : "none" }}>{row.task.title}</span>
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Timeline area */}
          <div style={{ flex: 1, position: "relative" }}>
            {/* Month header row */}
            <div style={{ height: 26, position: "sticky", top: 0, zIndex: 3, background: T.surface, borderBottom: `1px solid ${T.border}`, display: "flex" }}>
              {months.map((m, i) => (
                <div key={i} style={{ width: m.width, flexShrink: 0, borderRight: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: T.text3 }}>{m.label}</div>
              ))}
            </div>
            {/* Day header row */}
            <div style={{ height: 26, position: "sticky", top: 26, zIndex: 3, background: T.surface, borderBottom: `1px solid ${T.border}`, position: "relative" }}>
              {/* Week markers */}
              {Array.from({ length: Math.ceil(totalDays / 7) }, (_, i) => {
                const d2 = new Date(minD.getTime() + i * 7 * 86400000);
                return (
                  <div key={i} style={{ position: "absolute", left: i * 7 * DAY_W, top: 0, bottom: 0, display: "flex", alignItems: "center", paddingLeft: 3 }}>
                    <div style={{ width: 1, height: "60%", background: `${T.border}` }} />
                    <span style={{ fontSize: 9, color: T.text3, marginLeft: 3 }}>{d2.toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}</span>
                  </div>
                );
              })}
            </div>

            {/* Grid + bars */}
            <div style={{ position: "relative", height: rows.length * ROW_H }}>
              {/* Vertical grid lines (weeks) */}
              {Array.from({ length: Math.ceil(totalDays / 7) }, (_, i) => (
                <div key={i} style={{ position: "absolute", left: i * 7 * DAY_W, top: 0, bottom: 0, width: 1, background: `${T.border}40` }} />
              ))}
              {/* Today line */}
              {todayX >= 0 && todayX <= totalDays * DAY_W && (
                <div style={{ position: "absolute", left: todayX, top: 0, bottom: 0, width: 2, background: "#ef444470", zIndex: 2 }}>
                  <div style={{ position: "absolute", top: -4, left: -4, width: 10, height: 10, borderRadius: 5, background: "#ef4444" }} />
                </div>
              )}
              {/* Row backgrounds */}
              {rows.map((row, i) => (
                <div key={i} style={{ position: "absolute", left: 0, right: 0, top: i * ROW_H, height: ROW_H, background: row.type === "section" ? T.surface2 : i % 2 === 0 ? "transparent" : `${T.surface}40`, borderBottom: `1px solid ${T.border}20` }} />
              ))}
              {/* Task bars */}
              {rows.filter(r => r.type === "task").map(row => {
                const t = row.task;
                const startStr = t.start_date || t.due_date;
                const endStr = t.due_date || t.start_date;
                const sx = getX(startStr);
                const ex = getX(endStr) + DAY_W;
                const bw = Math.max(ex - sx, DAY_W);
                const st = STATUS[t.status] || STATUS.todo;
                const isOverdueTask = t.due_date && t.due_date < today && t.status !== "done";
                const pr = PRIORITY[t.priority] || PRIORITY.none;
                const pct = t.status === "done" ? 100 : 0;
                return (
                  <div key={t.id} style={{ position: "absolute", top: row.rowIndex * ROW_H + 7, left: sx, width: bw, height: ROW_H - 14 }}>
                    <div onClick={() => setSelectedTask(t)} style={{ position: "relative", height: "100%", borderRadius: 5, background: isOverdueTask ? "#ef444420" : t.status === "done" ? "#22c55e18" : `${proj?.color || T.accent}20`, border: `1.5px solid ${isOverdueTask ? "#ef4444" : t.status === "done" ? "#22c55e" : proj?.color || T.accent}60`, cursor: "pointer", overflow: "hidden", display: "flex", alignItems: "center", paddingLeft: 6, paddingRight: 4, gap: 4 }}
                      onMouseEnter={e => e.currentTarget.style.opacity = "0.8"}
                      onMouseLeave={e => e.currentTarget.style.opacity = "1"}>
                      {/* Fill bar */}
                      {pct > 0 && <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`, background: "#22c55e20", borderRadius: 4 }} />}
                      {/* Priority dot */}
                      {t.priority && t.priority !== "none" && <div style={{ width: 5, height: 5, borderRadius: 3, background: pr.dot, flexShrink: 0, position: "relative" }} />}
                      <span style={{ fontSize: 10, fontWeight: 600, color: isOverdueTask ? "#ef4444" : t.status === "done" ? "#22c55e" : T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, position: "relative" }}>{t.title}</span>
                      {t.assignee_id && <div style={{ width: 16, height: 16, borderRadius: 8, background: acol(t.assignee_id) + "40", color: acol(t.assignee_id), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, fontWeight: 700, flexShrink: 0, position: "relative" }}>{ini(t.assignee_id)}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  })();
  const calendarViewEl = (() => { const yr = calMonth.getFullYear(); const mo = calMonth.getMonth(); const fd = new Date(yr, mo, 1).getDay(); const dim = new Date(yr, mo + 1, 0).getDate(); const today = new Date(); const cells = []; for (let i = 0; i < fd; i++) cells.push(null); for (let d = 1; d <= dim; d++) cells.push(d); const gtd = (day) => { const ds = `${yr}-${String(mo + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`; return filteredTasks.filter(t => t.due_date === ds); }; return (
    <div style={{ flex: 1, overflow: "auto", padding: "12px 20px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
        <button onClick={() => setCalMonth(new Date(yr, mo - 1, 1))} style={S.iconBtn}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.text2} strokeWidth="2"><path d="M15 18l-6-6 6-6"/></svg></button>
        <span style={{ fontSize: 14, fontWeight: 600, color: T.text }}>{calMonth.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</span>
        <button onClick={() => setCalMonth(new Date(yr, mo + 1, 1))} style={S.iconBtn}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={T.text2} strokeWidth="2"><path d="M9 18l6-6-6-6"/></svg></button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 1 }}>
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => <div key={d} style={{ padding: 6, fontSize: 11, fontWeight: 600, color: T.text3, textAlign: "center" }}>{d}</div>)}
        {cells.map((day, i) => { if (!day) return <div key={`e${i}`} />; const dt = gtd(day); const isT = day === today.getDate() && mo === today.getMonth() && yr === today.getFullYear(); return (
          <div key={i} style={{ minHeight: 80, padding: 4, border: `1px solid ${T.border}`, borderRadius: 4, background: isT ? T.accentDim : T.surface }}>
            <div style={{ fontSize: 11, fontWeight: isT ? 700 : 400, color: isT ? T.accent : T.text2, marginBottom: 4, textAlign: "right", padding: "0 2px" }}>{day}</div>
            {dt.slice(0, 3).map(task => <div key={task.id} onClick={() => setSelectedTask(task)} style={{ fontSize: 10, padding: "1px 4px", borderRadius: 3, background: (STATUS[task.status] || STATUS.todo).bg, color: (STATUS[task.status] || STATUS.todo).color, marginBottom: 2, cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.title}</div>)}
            {dt.length > 3 && <div style={{ fontSize: 9, color: T.text3, textAlign: "center" }}>+{dt.length - 3}</div>}
          </div>); })}
      </div>
    </div>); })();
  const myTasksViewEl = (() => {
    const today = new Date(); today.setHours(0,0,0,0);
    const weekOut = new Date(today); weekOut.setDate(weekOut.getDate() + 7);
    const mt = tasks.filter(t => t.assignee_id === user?.id && t.status !== "done" && t.status !== "cancelled");
    const todayTasks = mt.filter(t => t.due_date && new Date(t.due_date) <= today);
    const upcomingTasks = mt.filter(t => t.due_date && new Date(t.due_date) > today && new Date(t.due_date) <= weekOut);
    const somedayTasks = mt.filter(t => !t.due_date || new Date(t.due_date) > weekOut);
    const [myFilter, setMyFilter] = useState("all");
    const groups = [
      { key: "overdue", label: "⚠️ Overdue", tasks: todayTasks, color: "#ef4444" },
      { key: "upcoming", label: "📅 Next 7 Days", tasks: upcomingTasks, color: T.accent },
      { key: "someday", label: "🗓 Later", tasks: somedayTasks, color: T.text3 },
    ].filter(g => g.tasks.length > 0);
    return (
      <div style={{ flex: 1, overflow: "auto", padding: isMobile ? "10px 12px" : "20px 28px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: T.text, margin: 0 }}>My Tasks</h2>
          <span style={{ fontSize: 12, color: T.text3 }}>· {mt.length} open</span>
          <div style={{ flex: 1 }} />
          <button onClick={async () => { const title = await showPrompt("New Personal Task", "Task title…"); if (title) createStandaloneTask(title); }}
            style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 6, border: `1px solid ${T.accent}40`, background: `${T.accent}10`, color: T.accent, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
            + Add Task
          </button>
        </div>
        {!mt.length ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: T.text3 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>All clear!</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>No tasks assigned to you.</div>
          </div>
        ) : groups.map(group => (
          <div key={group.key} style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: group.color, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
              {group.label}
              <span style={{ fontSize: 11, padding: "1px 6px", borderRadius: 8, background: group.color + "20", color: group.color }}>{group.tasks.length}</span>
            </div>
            {group.tasks.map(task => {
              const p = projects.find(pr => pr.id === task.project_id);
              const pr = PRIORITY[task.priority] || PRIORITY.none;
              return (
                <div key={task.id} onClick={() => { if (task.project_id) { setActiveProject(task.project_id); setShowMyTasks(false); } setTimeout(() => setSelectedTask(task), 100); }}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 8, border: `1px solid ${T.border}`, marginBottom: 5, cursor: "pointer", background: T.surface, borderLeft: `3px solid ${pr.dot}` }}
                  onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                  onMouseLeave={e => e.currentTarget.style.background = T.surface}>
                  <Checkbox task={task} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, color: T.text, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.title}</div>
                    <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>
                      <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: 4, background: p?.color || T.text3, marginRight: 4 }} />
                      {p?.name || ""}
                      {task.section_id && <span style={{ color: T.text3 }}> · {sections.find(s => s.id === task.section_id)?.name || ""}</span>}
                    </div>
                  </div>
                  {task.estimated_hours && <span style={{ fontSize: 10, color: T.text3 }}>{task.estimated_hours}h</span>}
                  {(task.start_date || task.due_date) && <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 8, background: group.key === "overdue" ? "#ef444420" : T.surface3, color: group.key === "overdue" ? "#ef4444" : T.text3, fontWeight: 500 }}>{task.start_date && task.due_date ? `${toDateStr(task.start_date)} → ${toDateStr(task.due_date)}` : toDateStr(task.due_date || task.start_date)}</span>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    );
  })();
  // DetailPane state lifted to parent to prevent unmount/remount flicker
  const [activeDetailTab, setActiveDetailTab] = useState("details");
  const [activity, setActivity] = useState([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const detailPaneRef = useRef(null);
  const prevSelectedTaskId = useRef(null);
  // Reset tab & activity when switching tasks
  useEffect(() => {
    if (selectedTask && selectedTask.id !== prevSelectedTaskId.current) {
      prevSelectedTaskId.current = selectedTask.id;
      setActiveDetailTab("details");
      setActivity([]);
      setEditingDesc(false);
      // Trigger slide animation
      if (detailPaneRef.current) {
        detailPaneRef.current.style.animation = "none";
        detailPaneRef.current.offsetHeight;
        detailPaneRef.current.style.animation = "slideIn 0.2s ease";
      }
    }
    if (!selectedTask) prevSelectedTaskId.current = null;
  }, [selectedTask?.id]);
  useEffect(() => {
    if (!selectedTask) { setTaskCollabs([]); return; }
    supabase.from("task_assignees").select("user_id").eq("task_id", selectedTask.id).eq("role", "collaborator").then(({ data }) => setTaskCollabs((data || []).map(r => r.user_id)));
  }, [selectedTask?.id]);
  const syncCollabs = async (next) => {
    if (!selectedTask) return;
    const prev = taskCollabs;
    const added = next.filter(id => !prev.includes(id));
    const removed = prev.filter(id => !next.includes(id));
    setTaskCollabs(next);
    const oid = resolveOrgId(activeProject) || orgId;
    for (const uid of added) {
      await supabase.from("task_assignees").insert({ task_id: selectedTask.id, user_id: uid, role: "collaborator", org_id: oid });
      if (uid !== user?.id) await supabase.from("notifications").insert({ org_id: oid, user_id: uid, type: "assignment", title: `${uname(user?.id)} added you as a collaborator`, body: selectedTask.title, entity_type: "task", entity_id: selectedTask.id, actor_id: user?.id, is_read: false, category: "assignment", metadata: { task_title: selectedTask.title } });
    }
    for (const uid of removed) { await supabase.from("task_assignees").delete().eq("task_id", selectedTask.id).eq("user_id", uid).eq("role", "collaborator"); }
  };
  const startDetailResize = (e) => {
    e.preventDefault();
    const startX = e.clientX; const startW = detailWidth;
    const move = (ev) => { setDetailWidth(Math.max(340, Math.min(1000, startW + (startX - ev.clientX)))); };
    const up = () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); document.body.style.userSelect = ""; };
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", move); window.addEventListener("mouseup", up);
  };
  const detailPane = (() => {
    if (!selectedTask) return null;
    const task = selectedTask;
    const subs = getSubtasks(task.id);
    const bb = getBlockedBy(task.id);
    const bl = getBlocking(task.id);
    const tcf = customFieldValues[task.id] || {};
    const parent = task.parent_task_id ? tasks.find(t => t.id === task.parent_task_id) : null;

    const DETAIL_TABS = ["Details", "Activity", "Subtasks", "Files"];
    const taskTags = getTaskLabels(task.id);
    const prBar = task.target_value > 0 ? Math.min(100, Math.round(((task.current_value || 0) / task.target_value) * 100)) : 0;

    // Load activity when tab switches
    const loadActivity = async () => {
      if (activity.length && activity[0]?.task_id === task.id) return;
      setActivityLoading(true);
      const { data } = await supabase.from("task_activity").select("*").eq("task_id", task.id).order("created_at", { ascending: false }).limit(50);
      setActivity(data || []);
      setActivityLoading(false);
    };

    const pct = subs.length > 0 ? (subs.filter(s => s.status === "done").length / subs.length) * 100 : 0;
    const FIELD_LABEL = { fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 };

    return (
      <div ref={detailPaneRef} style={{ width: isMobile ? "100%" : (detailFull ? "min(1000px, 92vw)" : detailWidth), flexShrink: 0, borderLeft: isMobile ? "none" : `1px solid ${T.border}`, background: T.surface, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative", ...(isMobile ? { position: "fixed", inset: 0, zIndex: 100 } : {}), ...(detailFull && !isMobile ? { position: "fixed", top: 20, right: 20, bottom: 20, left: "auto", zIndex: 200, borderRadius: 12, border: `1px solid ${T.border}`, boxShadow: "0 24px 70px rgba(0,0,0,0.45)" } : {}) }}>
        {!isMobile && !detailFull && <div onMouseDown={startDetailResize} style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 6, cursor: "ew-resize", zIndex: 10 }} title="Drag to resize" />}
        {/* Header */}
        <div style={{ padding: "12px 16px 10px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
            <Checkbox task={task} size={18} />
            <div style={{ flex: 1, minWidth: 0 }}>
              {parent && <div style={{ fontSize: 10, color: T.text3, marginBottom: 3 }}>↳ {parent.title}</div>}
              <input defaultValue={task.title} key={task.id + "-title"}
                onBlur={e => { if (e.target.value.trim() && e.target.value !== task.title) updateField(task.id, "title", e.target.value.trim()); }}
                onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
                style={{ fontSize: 15, fontWeight: 700, color: T.text, background: "none", border: "none", outline: "none", width: "100%", padding: 0, lineHeight: 1.3 }} />
            </div>
            <button onClick={() => setDetailFull(v => !v)} style={S.iconBtn} title={detailFull ? "Exit full view" : "Full view"}>{detailFull ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 3v6H3M21 9h-6V3M3 15h6v6M15 21v-6h6"/></svg> : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>}</button>
            <button onClick={() => setSelectedTask(null)} style={S.iconBtn}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.text3} strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
            </button>
          </div>
          {/* Tags */}
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 6 }}>
            {taskTags.map(t => (
              <span key={t.id} onClick={() => toggleLabel(task.id, t.id)} title="Remove tag" style={{ fontSize: 10, padding: "2px 7px", borderRadius: 8, background: (t.color || T.accent) + "22", color: t.color || T.accent, fontWeight: 700, cursor: "pointer" }}>{t.name} ×</span>
            ))}
            <div style={{ position: "relative" }}>
              <button style={{ fontSize: 10, padding: "2px 7px", borderRadius: 8, border: `1px dashed ${T.border}`, background: "none", color: T.text3, cursor: "pointer" }}
                onClick={e => { e.stopPropagation(); const m = e.currentTarget.nextSibling; m.style.display = m.style.display === "none" ? "block" : "none"; }}>
                + Tag
              </button>
              <div style={{ display: "none", position: "absolute", top: "100%", left: 0, zIndex: 50, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: 6, minWidth: 200, maxHeight: 280, overflow: "auto", boxShadow: "0 8px 24px rgba(0,0,0,0.25)", marginTop: 4 }}>
                {labels.length === 0 && <div style={{ fontSize: 11, color: T.text3, padding: "4px 8px" }}>No tags yet — create one below.</div>}
                {labels.map(t => {
                  const on = labelAssignments.some(a => a.task_id === task.id && a.label_id === t.id);
                  return (
                    <div key={t.id} onClick={e => { e.stopPropagation(); toggleLabel(task.id, t.id); }} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 4, cursor: "pointer", fontSize: 11 }}
                      onMouseEnter={e => e.currentTarget.style.background = T.surface2} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                      <span style={{ width: 8, height: 8, borderRadius: 4, background: t.color || T.accent, flexShrink: 0 }} />
                      <span style={{ flex: 1, color: on ? T.accent : T.text }}>{t.name}</span>
                      {on && <span style={{ fontSize: 10, color: T.accent }}>✓</span>}
                    </div>
                  );
                })}
                <div style={{ borderTop: `1px solid ${T.border}`, marginTop: 4, paddingTop: 4 }}>
                  <div onClick={async (e) => {
                    e.stopPropagation();
                    const name = prompt("New tag name:");
                    if (!name || !name.trim()) return;
                    const PRESET = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899", "#64748b", "#14b8a6"];
                    const color = prompt("Color (hex):", PRESET[labels.length % PRESET.length]) || PRESET[labels.length % PRESET.length];
                    const created = await createLabel(name.trim(), color);
                    if (created) toggleLabel(task.id, created.id);
                  }} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 4, cursor: "pointer", fontSize: 11, color: T.accent, fontWeight: 600 }}
                    onMouseEnter={e => e.currentTarget.style.background = T.surface2} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                    <span style={{ fontSize: 12 }}>+</span> Create new tag
                  </div>
                </div>
              </div>
            </div>
          </div>
          {/* Tab bar */}
          <div style={{ display: "flex", gap: 0, marginTop: 4 }}>
            {DETAIL_TABS.map(tab => (
              <button key={tab} onClick={() => { setActiveDetailTab(tab.toLowerCase()); if (tab === "Activity") loadActivity(); }}
                style={{ padding: "5px 12px", fontSize: 12, fontWeight: activeDetailTab === tab.toLowerCase() ? 600 : 400, color: activeDetailTab === tab.toLowerCase() ? T.accent : T.text3, background: "none", border: "none", borderBottom: `2px solid ${activeDetailTab === tab.toLowerCase() ? T.accent : "transparent"}`, cursor: "pointer" }}>
                {tab}{tab === "Subtasks" && subs.length > 0 ? ` (${subs.length})` : ""}
              </button>
            ))}
          </div>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "14px 16px" }}>
          {/* DETAILS TAB */}
          {activeDetailTab === "details" && (
            <div>
              {/* Core fields grid */}
              <div style={{ display: "grid", gridTemplateColumns: "90px 1fr", gap: "10px 12px", alignItems: "center", marginBottom: 18 }}>
                <span style={FIELD_LABEL}>Status</span><StatusPill task={task} onUpdate={updateField} S={S} />
                <span style={FIELD_LABEL}>Priority</span><PriorityPill task={task} onUpdate={updateField} S={S} />
                <span style={FIELD_LABEL}>Assignee</span><AssigneeCell task={task} onUpdate={updateField} profiles={profiles} profile={profile} ini={ini} acol={acol} uname={uname} projectMembers={projMembersList} activeProject={activeProject} />
                <span style={FIELD_LABEL}>Start Date</span>
                <input type="date" defaultValue={task.start_date || ""} key={task.id + "-start"} onChange={e => updateField(task.id, "start_date", e.target.value || null)}
                  style={{ background: "none", border: "none", color: task.start_date ? T.text2 : T.text3, fontSize: 12, cursor: "pointer", outline: "none", fontFamily: "inherit" }} />
                <span style={FIELD_LABEL}>Due Date</span>
                <input type="date" defaultValue={task.due_date || ""} key={task.id + "-due"} onChange={e => updateField(task.id, "due_date", e.target.value || null)}
                  style={{ background: "none", border: "none", color: task.due_date ? (isOverdue(task.due_date) && task.status !== "done" ? T.red : T.text2) : T.text3, fontSize: 12, cursor: "pointer", outline: "none", fontFamily: "inherit" }} />
                <span style={FIELD_LABEL}>Section</span>
                <SearchableMultiSelect multi={false} placeholder="Select section"
                  options={projSections.map(s => ({ value: s.id, label: s.name }))}
                  selected={task.section_id || ""} onChange={val => updateField(task.id, "section_id", val)} />
                <span style={FIELD_LABEL}>PLM Product</span>
                <SearchableMultiSelect multi={false} placeholder="No product linked"
                  options={[{ value: "", label: "None", icon: "" }, ...plmPrograms.map(p => ({ value: p.id, label: `${p.name}${p.category ? ` (${p.category})` : ""}`, icon: "⬢" }))]}
                  selected={task.plm_program_id || ""} onChange={val => updateField(task.id, "plm_program_id", val || null)} />
              </div>

              {/* Effort tracking */}
              <div style={{ background: T.surface2, borderRadius: 8, padding: "12px 14px", marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 10 }}>Effort</div>
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
                  <div>
                    <label style={{ fontSize: 10, color: T.text3, display: "block", marginBottom: 3 }}>Est. Hours</label>
                    <input type="number" defaultValue={task.estimated_hours || ""} key={task.id + "-esthrs"}
                      onBlur={e => updateField(task.id, "estimated_hours", e.target.value ? Number(e.target.value) : null)}
                      onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
                      placeholder="0" style={{ width: "100%", padding: "5px 8px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 10, color: T.text3, display: "block", marginBottom: 3 }}>Story Points</label>
                    <input type="number" defaultValue={task.story_points || ""} key={task.id + "-sp"}
                      onBlur={e => updateField(task.id, "story_points", e.target.value ? Number(e.target.value) : null)}
                      onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
                      placeholder="0" style={{ width: "100%", padding: "5px 8px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                  </div>
                </div>
              </div>

              {/* Link to OKR KR */}
              {objectives.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <label style={{ ...FIELD_LABEL, display: "block", marginBottom: 6 }}>Linked Objective</label>
                  <SearchableMultiSelect multi={false} placeholder="No linked objective"
                    options={objectives.map(o => ({ value: o.id, label: o.title, icon: "◎" }))}
                    selected={task.objective_id || ""} onChange={val => { updateField(task.id, "objective_id", val || null); if (!val) updateField(task.id, "key_result_id", null); }} />
                  {task.objective_id && (() => {
                    const filteredKRs = keyResultsForLink.filter(kr => kr.objective_id === task.objective_id);
                    return filteredKRs.length > 0 ? (
                      <div style={{ marginTop: 8 }}>
                        <label style={{ ...FIELD_LABEL, display: "block", marginBottom: 4 }}>Linked Key Result</label>
                        <SearchableMultiSelect multi={false} placeholder="All KRs (optional)"
                          options={filteredKRs.map(kr => ({ value: kr.id, label: kr.title, sublabel: `${Math.round(kr.progress || 0)}%`, icon: "◉" }))}
                          selected={task.key_result_id || ""} onChange={val => updateField(task.id, "key_result_id", val || null)} />
                      </div>
                    ) : null;
                  })()}
                  {(task.objective_id || task.key_result_id) && <div style={{ fontSize: 10, color: T.accent, marginTop: 4 }}>✓ Contributes to OKR progress</div>}
                </div>
              )}

              {/* Description */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ ...FIELD_LABEL, display: "block", marginBottom: 6 }}>Description</label>
                <RichTextEditor key={task.id} value={task.description || ""} placeholder="Add context, requirements, or notes…" T={T}
                  onChange={html => updateField(task.id, "description", html)} />
              </div>

              {/* Collaborators */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ ...FIELD_LABEL, display: "block", marginBottom: 6 }}>Collaborators</label>
                <SearchableMultiSelect multi={true} placeholder="Add collaborators…" options={memberOpts()} selected={taskCollabs} onChange={syncCollabs} />
              </div>

              {/* Recurrence */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ ...FIELD_LABEL, display: "block", marginBottom: 6 }}>Recurrence</label>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: task.recurrence && task.recurrence !== "none" ? 8 : 0 }}>
                  {[
                    { k: "none", l: "None" }, { k: "daily", l: "Daily" }, { k: "weekly", l: "Weekly" },
                    { k: "biweekly", l: "Bi-weekly" }, { k: "monthly", l: "Monthly" }, { k: "quarterly", l: "Quarterly" },
                  ].map(r => (
                    <button key={r.k} onClick={() => updateField(task.id, "recurrence", r.k === "none" ? null : r.k)}
                      style={{ padding: "3px 10px", borderRadius: 12, border: (task.recurrence || "none") === r.k ? `1.5px solid ${T.accent}` : `1px solid ${T.border}`,
                        background: (task.recurrence || "none") === r.k ? `${T.accent}15` : "transparent",
                        color: (task.recurrence || "none") === r.k ? T.accent : T.text3, fontSize: 11, fontWeight: 500, cursor: "pointer" }}>{r.l}</button>
                  ))}
                </div>
                {task.recurrence && task.recurrence !== "none" && (
                  <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <label style={{ fontSize: 10, color: T.text3 }}>On:</label>
                      <div style={{ display: "flex", gap: 3 }}>
                        {[
                          { k: "on_date", l: "Next due date", d: "Creates when the due date arrives" },
                          { k: "on_complete", l: "On completion", d: "Creates immediately when marked done" },
                        ].map(m => (
                          <button key={m.k} onClick={() => updateField(task.id, "recurrence_mode", m.k)} title={m.d}
                            style={{ padding: "2px 8px", borderRadius: 4, border: (task.recurrence_mode || "on_date") === m.k ? `1px solid ${T.accent}40` : `1px solid ${T.border}`,
                              background: (task.recurrence_mode || "on_date") === m.k ? `${T.accent}10` : "transparent",
                              color: (task.recurrence_mode || "on_date") === m.k ? T.accent : T.text3, fontSize: 10, cursor: "pointer" }}>{m.l}</button>
                        ))}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <label style={{ fontSize: 10, color: T.text3 }}>Until:</label>
                      <input type="date" defaultValue={task.recurrence_end_date || ""} key={task.id + "-rec-end"} onChange={e => updateField(task.id, "recurrence_end_date", e.target.value || null)}
                        style={{ background: "none", border: `1px solid ${T.border}`, borderRadius: 4, color: T.text2, fontSize: 11, padding: "2px 6px", outline: "none", cursor: "pointer" }} />
                    </div>
                    {task.recurring_parent_id && <span style={{ fontSize: 10, color: T.text3 }}>🔄 Recurring instance</span>}
                  </div>
                )}
              </div>

              {/* Custom fields */}
              {customFields.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <label style={{ ...FIELD_LABEL, display: "block", marginBottom: 6 }}>Custom Fields</label>
                  {customFields.map(cf => {
                    const val = tcf[cf.id] || "";
                    const prefix = cf.options?.currency_prefix || "$";
                    const choices = cf.options?.choices || [];
                    const inp = { flex: 1, padding: "4px 7px", borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 12, outline: "none" };
                    return (
                      <div key={cf.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 12, color: T.text3, width: 90, flexShrink: 0, display: "flex", alignItems: "center", gap: 4 }}>
                          {cf.name}
                          <button onClick={() => deleteCustomField(cf.id)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 9, opacity: 0.3, padding: 0 }}
                            onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.3}>×</button>
                        </span>
                        {cf.field_type === "currency" ? (
                          <div style={{ display: "flex", alignItems: "center", flex: 1, gap: 0 }}>
                            <span style={{ padding: "4px 6px", background: T.surface3, borderRadius: "4px 0 0 4px", border: `1px solid ${T.border}`, borderRight: "none", fontSize: 12, color: T.text3 }}>{prefix}</span>
                            <input type="number" defaultValue={val} key={task.id + "-cf-" + cf.id} onBlur={e => updateCustomFieldValue(task.id, cf.id, e.target.value)} onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
                              placeholder="0.00" step="0.01" style={{ ...inp, borderRadius: "0 4px 4px 0", flex: 1 }} />
                          </div>
                        ) : cf.field_type === "number" ? (
                          <input type="number" defaultValue={val} key={task.id + "-cf-" + cf.id} onBlur={e => updateCustomFieldValue(task.id, cf.id, e.target.value)} onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }} placeholder="0" style={inp} />
                        ) : cf.field_type === "percent" ? (
                          <div style={{ display: "flex", alignItems: "center", flex: 1, gap: 0 }}>
                            <input type="number" defaultValue={val} key={task.id + "-cf-" + cf.id} onBlur={e => updateCustomFieldValue(task.id, cf.id, e.target.value)} onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
                              placeholder="0" min="0" max="100" style={{ ...inp, borderRadius: "4px 0 0 4px" }} />
                            <span style={{ padding: "4px 6px", background: T.surface3, borderRadius: "0 4px 4px 0", border: `1px solid ${T.border}`, borderLeft: "none", fontSize: 12, color: T.text3 }}>%</span>
                          </div>
                        ) : cf.field_type === "date" ? (
                          <input type="date" defaultValue={val} key={task.id + "-cf-" + cf.id} onChange={e => updateCustomFieldValue(task.id, cf.id, e.target.value)} style={{ ...inp, cursor: "pointer" }} />
                        ) : cf.field_type === "select" ? (
                          <SearchableMultiSelect multi={false} placeholder="Select…"
                            options={choices.map(c => ({ value: c, label: c }))}
                            selected={val || ""} onChange={v => updateCustomFieldValue(task.id, cf.id, v)} />
                        ) : cf.field_type === "checkbox" ? (
                          <div onClick={() => updateCustomFieldValue(task.id, cf.id, val === "true" ? "false" : "true")}
                            style={{ width: 18, height: 18, borderRadius: 4, border: `2px solid ${val === "true" ? T.accent : T.border}`, background: val === "true" ? T.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}>
                            {val === "true" && <span style={{ color: "#fff", fontSize: 11 }}>✓</span>}
                          </div>
                        ) : cf.field_type === "url" ? (
                          <div style={{ display: "flex", alignItems: "center", flex: 1, gap: 4 }}>
                            <input type="url" defaultValue={val} key={task.id + "-cf-" + cf.id} onBlur={e => updateCustomFieldValue(task.id, cf.id, e.target.value)} onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
                              placeholder="https://..." style={inp} />
                            {val && <a href={val} target="_blank" rel="noopener" style={{ color: T.accent, fontSize: 11, flexShrink: 0 }}>↗</a>}
                          </div>
                        ) : cf.field_type === "email" ? (
                          <input type="email" defaultValue={val} key={task.id + "-cf-" + cf.id} onBlur={e => updateCustomFieldValue(task.id, cf.id, e.target.value)} onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
                            placeholder="name@example.com" style={inp} />
                        ) : cf.field_type === "rating" ? (
                          <div style={{ display: "flex", gap: 2 }}>
                            {[1,2,3,4,5].map(n => (
                              <span key={n} onClick={() => updateCustomFieldValue(task.id, cf.id, String(n === Number(val) ? 0 : n))}
                                style={{ cursor: "pointer", fontSize: 16, opacity: n <= Number(val || 0) ? 1 : 0.2 }}>⭐</span>
                            ))}
                          </div>
                        ) : (
                          <input defaultValue={val} key={task.id + "-cf-" + cf.id} onBlur={e => updateCustomFieldValue(task.id, cf.id, e.target.value)} onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }} style={inp} />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {/* Add custom field */}
              {showCFCreate ? (
                <div style={{ marginBottom: 16, padding: "12px 14px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface2 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 700 }}>New Custom Field</span>
                    <button onClick={() => setShowCFCreate(false)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 14 }}>×</button>
                  </div>
                  <input value={cfForm.name} onChange={e => setCfForm(p => ({ ...p, name: e.target.value }))} placeholder="Field name"
                    onKeyDown={e => { if (e.key === "Enter" && cfForm.name.trim()) createCustomField(); }}
                    style={{ width: "100%", padding: "6px 8px", borderRadius: 5, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontSize: 12, outline: "none", fontFamily: "inherit", boxSizing: "border-box", marginBottom: 8 }} />
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 4, marginBottom: 8 }}>
                    {FIELD_TYPES.map(ft => (
                      <button key={ft.key} onClick={() => setCfForm(p => ({ ...p, field_type: ft.key }))}
                        style={{ padding: "4px 2px", borderRadius: 4, border: cfForm.field_type === ft.key ? `1.5px solid ${T.accent}` : `1px solid ${T.border}`,
                          background: cfForm.field_type === ft.key ? `${T.accent}15` : T.surface, color: cfForm.field_type === ft.key ? T.accent : T.text3,
                          fontSize: 9, fontWeight: 600, cursor: "pointer", textAlign: "center", lineHeight: 1.3 }}>
                        <div style={{ fontSize: 12 }}>{ft.icon}</div>{ft.label}
                      </button>
                    ))}
                  </div>
                  {cfForm.field_type === "currency" && (
                    <div style={{ marginBottom: 8 }}>
                      <label style={{ fontSize: 10, color: T.text3, display: "block", marginBottom: 3 }}>Currency</label>
                      <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                        {CURRENCY_PREFIXES.map(c => (
                          <button key={c} onClick={() => setCfForm(p => ({ ...p, currency_prefix: c }))}
                            style={{ padding: "3px 8px", borderRadius: 4, border: cfForm.currency_prefix === c ? `1.5px solid ${T.accent}` : `1px solid ${T.border}`,
                              background: cfForm.currency_prefix === c ? `${T.accent}15` : "transparent", color: cfForm.currency_prefix === c ? T.accent : T.text3,
                              fontSize: 11, cursor: "pointer", fontWeight: 600 }}>{c}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  {cfForm.field_type === "select" && (
                    <div style={{ marginBottom: 8 }}>
                      <label style={{ fontSize: 10, color: T.text3, display: "block", marginBottom: 3 }}>Options (comma-separated)</label>
                      <input value={cfForm.options.join(", ")} onChange={e => setCfForm(p => ({ ...p, options: e.target.value.split(",").map(s => s.trim()).filter(Boolean) }))}
                        placeholder="Option 1, Option 2, Option 3" style={{ width: "100%", padding: "5px 8px", borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontSize: 11, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
                    </div>
                  )}
                  <button onClick={createCustomField} disabled={!cfForm.name.trim()} style={{ width: "100%", padding: "6px 0", borderRadius: 5, border: "none", background: cfForm.name.trim() ? T.accent : T.surface3, color: cfForm.name.trim() ? "#fff" : T.text3, fontSize: 12, fontWeight: 600, cursor: cfForm.name.trim() ? "pointer" : "default" }}>Add Field</button>
                </div>
              ) : (
                <button onClick={() => setShowCFCreate(true)} style={{ fontSize: 11, color: T.accent, background: "none", border: "none", cursor: "pointer", padding: 0, marginBottom: 16 }}>+ Add custom field</button>
              )}

              {/* Dependencies */}
              <DependencyEditor
                task={task}
                blockedBy={bb}
                blocking={bl}
                onAdd={(mode, tt) => {
                  setDepTasks(prev => ({ ...prev, [tt.id]: tt }));
                  if (mode === "blocked_by") addDependency(tt.id, task.id);
                  else addDependency(task.id, tt.id);
                }}
                onRemove={removeDependency}
                orgId={orgId}
                T={T}
                S={S}
                projectsById={projectsById}
              />

              {/* Comments */}
              <div>
                <label style={{ ...FIELD_LABEL, display: "block", marginBottom: 8 }}>Comments</label>
                {comments.map(c => (
                  <div key={c.id} style={{ marginBottom: 10, display: "flex", gap: 8, group: "comment" }}>
                    <div style={{ width: 24, height: 24, borderRadius: 12, background: acol(c.author_id) + "30", color: acol(c.author_id), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, flexShrink: 0, marginTop: 2 }}>{ini(c.author_id)}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{uname(c.author_id)}</span>
                        <span style={{ fontSize: 10, color: T.text3 }}>{timeAgo(c.created_at)}</span>
                        {c.is_edited && <span style={{ fontSize: 9, color: T.text3, fontStyle: "italic" }}>(edited{c.edited_at ? " " + timeAgo(c.edited_at) : ""})</span>}
                      </div>
                      {editingCommentId === c.id ? (
                        <div style={{ display: "flex", gap: 4 }}>
                          <input ref={editCommentRef} defaultValue={c.content} autoFocus
                            onKeyDown={e => { if (e.key === "Enter") editComment(c.id, e.target.value); if (e.key === "Escape") setEditingCommentId(null); }}
                            style={{ flex: 1, padding: "5px 8px", borderRadius: 6, border: `1px solid ${T.accent}`, background: T.surface2, color: T.text, fontSize: 12, outline: "none" }} />
                          <button onClick={() => editComment(c.id, editCommentRef.current?.value)} style={{ padding: "4px 8px", borderRadius: 5, background: T.accent, color: "#fff", border: "none", fontSize: 11, cursor: "pointer" }}>Save</button>
                          <button onClick={() => setEditingCommentId(null)} style={{ padding: "4px 8px", borderRadius: 5, background: T.surface2, color: T.text3, border: `1px solid ${T.border}`, fontSize: 11, cursor: "pointer" }}>Cancel</button>
                        </div>
                      ) : (
                        <div style={{ position: "relative" }}>
                          <div style={{ fontSize: 13, color: T.text2, lineHeight: 1.5, wordBreak: "break-word" }}>{renderRich(c.content, T)}</div>
                          {c.author_id === user?.id && (
                            <div style={{ display: "flex", gap: 4, marginTop: 3, opacity: 0.5, transition: "opacity 0.15s" }} onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.5}>
                              <button onClick={() => setEditingCommentId(c.id)} style={{ padding: "1px 6px", fontSize: 9, background: "none", border: `1px solid ${T.border}`, borderRadius: 4, color: T.text3, cursor: "pointer" }}>Edit</button>
                              <button onClick={() => deleteComment(c.id)} style={{ padding: "1px 6px", fontSize: 9, background: "none", border: "1px solid #FECACA", borderRadius: 4, color: "#EF4444", cursor: "pointer" }}>Delete</button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 12, background: acol(user?.id) + "30", color: acol(user?.id), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, flexShrink: 0 }}>{ini(user?.id)}</div>
                  <MentionInput
                    profiles={profiles}
                    onSubmit={(text) => { addCommentFromRef(text); }}
                    placeholder="Write a comment… Type @ to mention"
                    T={T}
                    ini={ini}
                    acol={acol}
                  />
                </div>
              </div>
              {/* Also in projects (multi-home) */}
              <AlsoInProjects
                task={task}
                homeProject={projects.find(p => p.id === task.project_id)}
                projects={projects}
                sections={sections}
                links={taskProjects.filter(l => l.task_id === task.id)}
                onAdd={(pid, sid) => addTaskToProject(task.id, pid, sid)}
                onRemove={(pid) => removeTaskFromProject(task.id, pid)}
                onSetSection={(pid, sid) => setLinkSection(task.id, pid, sid)}
                T={T}
              />

              {/* Created by */}
              <div style={{ marginTop: 18, paddingTop: 12, borderTop: `1px solid ${T.border}`, fontSize: 11, color: T.text3 }}>
                Created by {(() => {
                  const c = profiles[task.created_by] || allProfiles.find(p => p.id === task.created_by);
                  const nm = c ? (c.display_name || c.email || "Unknown") : "Unknown";
                  if (!task.created_by) return <span style={{ color: T.text2, fontWeight: 600 }}>{nm}</span>;
                  return <span onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setProfileCard({ userId: task.created_by, x: r.left, y: r.bottom }); }} style={{ color: T.accent, fontWeight: 600, cursor: "pointer" }}>{nm}</span>;
                })()}
                {task.created_at ? ` · ${toDateStr(task.created_at)}` : ""}
              </div>
            </div>
          )}

          {/* ACTIVITY TAB */}
          {activeDetailTab === "activity" && (
            <div>
              {activityLoading ? (
                <div style={{ textAlign: "center", padding: 20, color: T.text3, fontSize: 12 }}>Loading activity…</div>
              ) : activity.length === 0 ? (
                <div style={{ textAlign: "center", padding: 30, color: T.text3 }}>
                  <div style={{ fontSize: 24, marginBottom: 8 }}>📋</div>
                  <div style={{ fontSize: 12 }}>No activity recorded yet.</div>
                </div>
              ) : activity.map(a => (
                <div key={a.id} style={{ display: "flex", gap: 8, marginBottom: 12, fontSize: 12 }}>
                  <div style={{ width: 24, height: 24, borderRadius: 12, background: acol(a.actor_id) + "30", color: acol(a.actor_id), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, flexShrink: 0 }}>{ini(a.actor_id)}</div>
                  <div style={{ flex: 1 }}>
                    <span style={{ fontWeight: 600, color: T.text }}>{uname(a.actor_id) || "Someone"}</span>
                    <span style={{ color: T.text3 }}> {a.action}</span>
                    {a.field && <span style={{ color: T.text3 }}> {a.field}</span>}
                    {a.new_value && <span style={{ color: T.text2 }}> → <strong>{a.new_value}</strong></span>}
                    <div style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>{timeAgo(a.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* SUBTASKS TAB */}
          {activeDetailTab === "subtasks" && (
            <div>
              {subs.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ height: 4, borderRadius: 2, background: T.surface3, marginBottom: 8 }}>
                    <div style={{ width: `${pct}%`, height: "100%", borderRadius: 2, background: T.green, transition: "width 0.4s" }} />
                  </div>
                  <div style={{ fontSize: 11, color: T.text3, textAlign: "right" }}>{subs.filter(s => s.status === "done").length}/{subs.length} complete</div>
                </div>
              )}
              {subs.map(sub => (
                <div key={sub.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 6, border: `1px solid ${T.border}`, marginBottom: 6, cursor: "pointer", background: T.surface2 }}
                  onClick={() => setSelectedTask(sub)}>
                  <Checkbox task={sub} size={14} />
                  <span style={{ fontSize: 13, color: sub.status === "done" ? T.text3 : T.text, textDecoration: sub.status === "done" ? "line-through" : "none", flex: 1 }}>{sub.title}</span>
                  {sub.assignee_id && <div style={{ width: 18, height: 18, borderRadius: 9, background: acol(sub.assignee_id) + "30", color: acol(sub.assignee_id), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, fontWeight: 700 }}>{ini(sub.assignee_id)}</div>}
                  <SubtaskDateRange sub={sub} onUpdate={updateField} />
                </div>
              ))}
              {addingSubtaskTo === task.id ? (
                <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                  <input value={newSubtaskTitle} onChange={e => setNewSubtaskTitle(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") createSubtask(task, null, true); if (e.key === "Escape") { setAddingSubtaskTo(null); setNewSubtaskTitle(""); } }}
                    onBlur={() => { if (newSubtaskTitle.trim()) createSubtask(task); else { setAddingSubtaskTo(null); setNewSubtaskTitle(""); } }}
                    placeholder="Subtask name…" autoFocus
                    style={{ flex: 1, padding: "7px 10px", borderRadius: 6, border: `1px solid ${T.accent}`, background: T.surface2, color: T.text, fontSize: 13, outline: "none" }} />
                </div>
              ) : (
                <button onClick={() => { setAddingSubtaskTo(task.id); setNewSubtaskTitle(""); }}
                  style={{ width: "100%", padding: "8px 0", borderRadius: 6, border: `1px dashed ${T.border}`, background: "transparent", color: T.text3, fontSize: 12, cursor: "pointer", marginTop: 4 }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.color = T.accent; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.text3; }}>
                  + Add subtask
                </button>
              )}
            </div>
          )}

          {/* FILES TAB */}
          {activeDetailTab === "files" && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <label style={{ ...FIELD_LABEL }}>Attachments</label>
                <label style={{ fontSize: 11, color: T.accent, cursor: "pointer", padding: "4px 10px", borderRadius: 5, border: `1px solid ${T.accent}40`, background: T.accentDim }}>
                  ↑ Upload
                  <input type="file" hidden onChange={e => e.target.files?.[0] && uploadAttachment(e.target.files[0])} />
                </label>
              </div>
              {attachments.length === 0 ? (
                <div style={{ textAlign: "center", padding: "30px 0", color: T.text3 }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📎</div>
                  <div style={{ fontSize: 12 }}>No files attached yet.</div>
                  <label style={{ fontSize: 12, color: T.accent, cursor: "pointer", display: "block", marginTop: 8 }}>
                    Upload a file
                    <input type="file" hidden onChange={e => e.target.files?.[0] && uploadAttachment(e.target.files[0])} />
                  </label>
                </div>
              ) : attachments.map(att => (
                <div key={att.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", borderRadius: 8, border: `1px solid ${T.border}`, marginBottom: 6, background: T.surface2 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={T.text3} strokeWidth="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/></svg>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <a href={getFileUrl(att.file_path)} target="_blank" rel="noopener" style={{ fontSize: 13, color: T.accent, display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{att.filename}</a>
                    <div style={{ fontSize: 10, color: T.text3 }}>{formatFileSize(att.file_size)}</div>
                  </div>
                  <button onClick={() => deleteAttachment(att)} style={{ ...S.iconBtn, color: T.red }}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  })();
    const projectFormModalEl = (() => { if (!showProjectForm) return null; const isNew = showProjectForm === "new"; const colors = ["#3b82f6", "#22c55e", "#ef4444", "#a855f7", "#f97316", "#ec4899", "#06b6d4", "#eab308", "#6366f1", "#6b7280"]; const f = projectForm; const set = (k, v) => setProjectForm(p => ({ ...p, [k]: v })); const toggleMember = (uid) => set("members", f.members.includes(uid) ? f.members.filter(id => id !== uid) : [...f.members, uid]); const lbl = { fontSize: 12, fontWeight: 500, color: T.text3, display: "block", marginBottom: 4 }; const inp = { width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, outline: "none", boxSizing: "border-box" }; const sel = { ...inp, cursor: "pointer" }; const stepNames = ["Details", "Access & Privacy", "People"]; return (
    <div onClick={() => setShowProjectForm(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 520, maxHeight: "85vh", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ padding: "20px 24px 0" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: T.text, margin: 0 }}>{isNew ? "New Project" : "Edit Project"}</h3>
            <button onClick={() => setShowProjectForm(false)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 18 }}>×</button>
          </div>
          {/* Step indicator */}
          <div style={{ display: "flex", gap: 0, marginBottom: 16 }}>
            {stepNames.map((s, i) => (<button key={s} onClick={() => setFormStep(i + 1)} style={{ flex: 1, padding: "8px 0", fontSize: 12, fontWeight: formStep === i + 1 ? 600 : 400, color: formStep === i + 1 ? T.accent : T.text3, background: "none", border: "none", borderBottom: formStep === i + 1 ? `2px solid ${T.accent}` : `2px solid ${T.border}`, cursor: "pointer" }}>{i + 1}. {s}</button>))}
          </div>
        </div>
        {/* Body */}
        <div style={{ flex: 1, overflow: "auto", padding: "0 24px 16px" }}>
          {formStep === 1 && <>
            <div style={{ marginBottom: 12 }}><label style={lbl}>Project Name *</label><input value={f.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Q2 Marketing Campaign" style={inp} /></div>
            <div style={{ marginBottom: 12 }}><label style={lbl}>Description</label><textarea value={f.description} onChange={e => set("description", e.target.value)} rows={3} placeholder="What is this project about?" style={{ ...inp, resize: "vertical", fontFamily: "inherit" }} /></div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div><label style={lbl}>Start Date</label><input type="date" value={f.start_date} onChange={e => set("start_date", e.target.value)} style={inp} /></div>
              <div><label style={lbl}>Target End Date</label><input type="date" value={f.target_end_date} onChange={e => set("target_end_date", e.target.value)} style={inp} /></div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12, marginBottom: 12 }}>
              <div><label style={lbl}>Status</label><SearchableMultiSelect multi={false} placeholder="Status" options={[{value:"active",label:"Active",color:"#22c55e"},{value:"on_hold",label:"On Hold",color:"#eab308"},{value:"completed",label:"Completed",color:"#3b82f6"},{value:"archived",label:"Archived",color:"#6b7280"}]} selected={f.status||"active"} onChange={val => set("status", val)} /></div>
              <div><label style={lbl}>Default View</label><SearchableMultiSelect multi={false} placeholder="View" options={[{value:"List",label:"List"},{value:"Board",label:"Board"},{value:"Timeline",label:"Timeline"},{value:"Calendar",label:"Calendar"}]} selected={f.default_view||"List"} onChange={val => set("default_view", val)} /></div>
            </div>
            {isNew && (() => {
              const opts = [
                { value: "basic", label: "Basic — To Do · In Progress · Done" },
                ...templates.filter(t => Array.isArray(t.sections) && t.sections.length).map(t => ({ value: t.id, label: `${t.icon || "📋"} ${t.name}` })),
                { value: "blank", label: "Blank — no columns" },
              ];
              const bt = f.board_type || "basic";
              const preview = bt === "blank" ? [] : bt === "basic" ? ["To Do", "In Progress", "Done"] : (templates.find(t => t.id === bt)?.sections || []).map(x => x.name);
              return (
                <div style={{ marginBottom: 12 }}>
                  <label style={lbl}>Board type <span style={{ color: T.text3, fontWeight: 400 }}>(starting columns)</span></label>
                  <SearchableMultiSelect multi={false} placeholder="Board type" options={opts} selected={bt} onChange={val => set("board_type", val)} />
                  <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 8 }}>
                    {preview.length === 0
                      ? <span style={{ fontSize: 11, color: T.text3 }}>No columns — add your own after creating.</span>
                      : preview.map((n, i) => <span key={i} style={{ fontSize: 11, padding: "3px 9px", borderRadius: 12, background: T.surface3, color: T.text2, fontWeight: 500 }}>{n}</span>)}
                  </div>
                  <div style={{ fontSize: 11, color: T.text3, marginTop: 6 }}>You can rename, reorder, add or remove columns anytime once the project exists. Manage board types with the ⊞ button on the projects list.</div>
                </div>
              );
            })()}
            <div style={{ marginBottom: 12 }}><label style={lbl}>Color</label><div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{colors.map(c => <div key={c} onClick={() => set("color", c)} style={{ width: 28, height: 28, borderRadius: 14, background: c, cursor: "pointer", border: f.color === c ? "3px solid #fff" : "3px solid transparent", boxShadow: f.color === c ? `0 0 0 2px ${c}` : "none", transition: "all 0.15s" }} />)}</div></div>
            <div style={{ marginBottom: 12 }}><label style={lbl}>Link to Objective</label><SearchableMultiSelect multi={false} placeholder="None" options={objectives.map(o => ({ value: o.id, label: o.title, icon: "◎" }))} selected={f.objective_id||""} onChange={val => { set("objective_id", val); if (!val) set("key_result_id", ""); }} />{f.objective_id && <div style={{ marginTop: 6, padding: "6px 10px", borderRadius: 6, background: T.accentDim, fontSize: 11, color: T.accent }}>◎ {objectives.find(o => o.id === f.objective_id)?.title}</div>}</div>
            {f.objective_id && (() => {
              const filteredKRs = keyResultsForLink.filter(kr => kr.objective_id === f.objective_id);
              return filteredKRs.length > 0 ? (
                <div style={{ marginBottom: 12 }}><label style={lbl}>Link to Key Result</label><SearchableMultiSelect multi={false} placeholder="All KRs (optional)" options={filteredKRs.map(kr => ({ value: kr.id, label: kr.title, sublabel: `${Math.round(kr.progress || 0)}% · ${kr.current_value || 0}/${kr.target_value || 100}${kr.unit ? " " + kr.unit : ""}`, icon: "◉" }))} selected={f.key_result_id||""} onChange={val => set("key_result_id", val)} />{f.key_result_id && <div style={{ marginTop: 6, padding: "6px 10px", borderRadius: 6, background: "#22c55e20", fontSize: 11, color: "#22c55e" }}>◉ {keyResultsForLink.find(k => k.id === f.key_result_id)?.title}</div>}</div>
              ) : null;
            })()}
          </>}
          {formStep === 2 && <>
            {/* Visibility */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ ...lbl, marginBottom: 8 }}>Visibility</label>
              {[{ v: "private", l: "Private", d: "Only added members can see this project", icon: "🔒" }, { v: "team", l: "Team", d: "Visible to everyone on the assigned team", icon: "👥" }, { v: "public", l: "Public", d: "Anyone in the organization can search, view, and join", icon: "🌐" }].map(opt => (
                <div key={opt.v} onClick={() => set("visibility", opt.v)} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", borderRadius: 8, border: `1.5px solid ${f.visibility === opt.v ? T.accent : T.border}`, background: f.visibility === opt.v ? T.accentDim : "transparent", marginBottom: 8, cursor: "pointer", transition: "all 0.15s" }}>
                  {opt.avatar ? <img src={opt.avatar} alt="" style={{ width: 18, height: 18, borderRadius: 9, objectFit: "cover", flexShrink: 0 }} /> : <span style={{ fontSize: 18, lineHeight: 1 }}>{opt.icon}</span>}
                  <div><div style={{ fontSize: 13, fontWeight: 600, color: f.visibility === opt.v ? T.accent : T.text }}>{opt.l}</div><div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>{opt.d}</div></div>
                  <div style={{ marginLeft: "auto", width: 18, height: 18, borderRadius: 9, border: `2px solid ${f.visibility === opt.v ? T.accent : T.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>{f.visibility === opt.v && <div style={{ width: 10, height: 10, borderRadius: 5, background: T.accent }} />}</div>
                </div>))}
            </div>
            {/* Team assignment - show when visibility is team or always as optional */}
            <div style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                <label style={{ ...lbl, marginBottom: 0 }}>Assign to Team <span style={{ color: T.text3, fontWeight: 400 }}>(optional)</span></label>
                <button type="button" onClick={() => set("_addingTeam", !f._addingTeam)} style={{ background: "none", border: "none", color: T.accent, cursor: "pointer", fontSize: 11, fontWeight: 600, padding: 0 }}>{f._addingTeam ? "Cancel" : "+ New team"}</button>
              </div>
              {f._addingTeam ? (
                <div style={{ display: "flex", gap: 6 }}>
                  <input autoFocus value={f._newTeamName || ""} onChange={e => set("_newTeamName", e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); createTeamInline(); } if (e.key === "Escape") { set("_addingTeam", false); set("_newTeamName", ""); } }} placeholder="Team name…" style={inp} />
                  <button type="button" onClick={createTeamInline} disabled={!(f._newTeamName || "").trim()} style={{ padding: "0 14px", borderRadius: 6, background: (f._newTeamName || "").trim() ? T.accent : T.surface3, color: (f._newTeamName || "").trim() ? "#fff" : T.text3, border: "none", fontSize: 12, fontWeight: 600, cursor: (f._newTeamName || "").trim() ? "pointer" : "default", whiteSpace: "nowrap" }}>Create</button>
                </div>
              ) : (
                <>
                  <SearchableMultiSelect multi={false} placeholder="No team" options={teams.map(t => ({ value: t.id, label: t.name, icon: "👥" }))} selected={f.team_id || ""} onChange={val => set("team_id", val)} />
                  {teams.length === 0 && <div style={{ fontSize: 11, color: T.text3, marginTop: 4 }}>No teams yet — use “+ New team” to create one.</div>}
                </>
              )}
            </div>
            <div style={{ marginBottom: 16 }}><label style={lbl}>Link to PLM Product</label><SearchableMultiSelect multi={false} placeholder="No product linked" options={plmPrograms.map(p => ({ value: p.id, label: `${p.name}${p.category ? ` (${p.category})` : ""}`, icon: "⬢" }))} selected={f.plm_program_id||""} onChange={val => set("plm_program_id", val)} />{f.plm_program_id && <div style={{ marginTop: 6, padding: "6px 10px", borderRadius: 6, background: "#8b5cf620", fontSize: 11, color: "#8b5cf6", display: "flex", alignItems: "center", gap: 6 }}>⬢ Linked to: {plmPrograms.find(p => p.id === f.plm_program_id)?.name}</div>}</div>
            {/* Join policy */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ ...lbl, marginBottom: 8 }}>Who can join?</label>
              {[{ v: "invite_only", l: "Invite only", d: "Only project admins can add members" }, { v: "request_to_join", l: "Request to join", d: "People can request access, admins approve" }, { v: "open", l: "Open", d: "Anyone can join freely" }].map(opt => (
                <div key={opt.v} onClick={() => set("join_policy", opt.v)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 6, border: `1.5px solid ${f.join_policy === opt.v ? T.accent : T.border}`, background: f.join_policy === opt.v ? T.accentDim : "transparent", marginBottom: 6, cursor: "pointer", transition: "all 0.15s" }}>
                  <div style={{ width: 16, height: 16, borderRadius: 8, border: `2px solid ${f.join_policy === opt.v ? T.accent : T.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{f.join_policy === opt.v && <div style={{ width: 8, height: 8, borderRadius: 4, background: T.accent }} />}</div>
                  <div><div style={{ fontSize: 13, fontWeight: f.join_policy === opt.v ? 600 : 400, color: f.join_policy === opt.v ? T.accent : T.text }}>{opt.l}</div><div style={{ fontSize: 11, color: T.text3 }}>{opt.d}</div></div>
                </div>))}
            </div>
            {f.visibility === "team" && f.team_id && <div style={{ padding: "8px 12px", borderRadius: 6, background: T.surface2, border: `1px solid ${T.border}`, fontSize: 12, color: T.text2 }}>Team members will have access. {f.join_policy === "open" ? "Others in the org can also join." : f.join_policy === "request_to_join" ? "Others can request to join." : "Only invited members outside the team can access."}</div>}
          </>}
          {formStep === 3 && (() => {
            const [mSearch, setMSearch] = [projectForm._mSearch || "", (v) => setProjectForm(p => ({ ...p, _mSearch: v }))];
            const filtProf = allProfiles.filter(u => u.id !== f.owner_id).filter(u => !mSearch || u.display_name?.toLowerCase().includes(mSearch.toLowerCase()) || u.email?.toLowerCase().includes(mSearch.toLowerCase()));
            return <>
            {/* Owner - searchable */}
            <div style={{ marginBottom: 16 }}><label style={lbl}>Project Owner</label>
              <SearchableMultiSelect multi={false} placeholder="Unassigned"
                options={allProfiles.map(u => ({ value: u.id, label: u.display_name || u.email, icon: "👤" }))}
                selected={f.owner_id || ""} onChange={val => set("owner_id", val || null)} />
            </div>
            {/* Add members - searchable */}
            <div style={{ marginBottom: 12 }}><label style={{ ...lbl, marginBottom: 8 }}>Add Members {f.members.length > 0 && <span style={{ color: T.accent, fontWeight: 600 }}>({f.members.length} selected)</span>}</label>
              <div style={{ border: `1px solid ${T.border}`, borderRadius: 8, overflow: "hidden" }}>
                <div style={{ padding: "6px 10px", borderBottom: `1px solid ${T.border}`, background: T.surface }}>
                  <input value={mSearch} onChange={e => setMSearch(e.target.value)} placeholder="Search people…" style={{ width: "100%", padding: "6px 8px", borderRadius: 5, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 12, outline: "none", boxSizing: "border-box" }} />
                </div>
                <div style={{ maxHeight: 220, overflow: "auto" }}>
                  {filtProf.length === 0 && <div style={{ padding: 12, fontSize: 12, color: T.text3, textAlign: "center" }}>No matches</div>}
                  {filtProf.map(u => { const isSel = f.members.includes(u.id); const c = acol(u.id); return (
                    <div key={u.id} onClick={() => toggleMember(u.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 12px", cursor: "pointer", background: isSel ? T.accentDim : "transparent", borderBottom: `1px solid ${T.border}` }} onMouseEnter={e => { if (!isSel) e.currentTarget.style.background = T.surface2; }} onMouseLeave={e => { if (!isSel) e.currentTarget.style.background = isSel ? T.accentDim : "transparent"; }}>
                      <div style={{ width: 14, height: 14, borderRadius: 3, border: `2px solid ${isSel ? T.accent : T.border}`, background: isSel ? T.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>{isSel && <svg width="8" height="8" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="#fff" strokeWidth="2" strokeLinecap="round" /></svg>}</div>
                      <div style={{ width: 26, height: 26, borderRadius: 13, background: `${c}18`, border: `1.5px solid ${c}40`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: c, flexShrink: 0 }}>{iniName(u.display_name)}</div>
                      <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12, fontWeight: 500, color: T.text }}>{u.display_name || "Unknown"}</div><div style={{ fontSize: 10, color: T.text3 }}>{u.email}</div></div>
                    </div>); })}
                </div>
              </div>
            </div>
            {f.members.length > 0 && <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>{f.members.map(uid => { const u = allProfiles.find(p => p.id === uid); const c = acol(uid); return (<span key={uid} style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "3px 8px 3px 4px", borderRadius: 12, background: `${c}15`, fontSize: 11, color: T.text2 }}><div style={{ width: 16, height: 16, borderRadius: 8, background: `${c}30`, color: c, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 7, fontWeight: 700 }}>{iniName(u?.display_name)}</div>{u?.display_name?.split(" ")[0]}<span onClick={() => toggleMember(uid)} style={{ cursor: "pointer", color: T.text3, marginLeft: 2 }}>×</span></span>); })}</div>}
          </>; })()}
        </div>
        {/* Footer */}
        <div style={{ padding: "12px 24px 20px", borderTop: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 11, color: T.text3 }}>Step {formStep} of 3</div>
          <div style={{ display: "flex", gap: 8 }}>
            {formStep > 1 && <button onClick={() => setFormStep(p => p - 1)} style={{ padding: "8px 16px", borderRadius: 6, background: T.surface3, color: T.text2, border: "none", fontSize: 13, cursor: "pointer" }}>Back</button>}
            <button onClick={() => setShowProjectForm(false)} style={{ padding: "8px 16px", borderRadius: 6, background: T.surface3, color: T.text2, border: "none", fontSize: 13, cursor: "pointer" }}>Cancel</button>
            {formStep < 3 ? <button onClick={() => { if (formStep === 1 && !f.name.trim()) return showToast("Project name required"); setFormStep(p => p + 1); }} style={{ padding: "8px 20px", borderRadius: 6, background: T.accent, color: "#fff", border: "none", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>Next</button> : <button onClick={saveProject} style={{ padding: "8px 20px", borderRadius: 6, background: T.accent, color: "#fff", border: "none", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>{isNew ? "Create Project" : "Save Changes"}</button>}
          </div>
        </div>
      </div>
    </div>); })();
  const updatesViewEl = (() => {
    const HEALTH_COLORS = { on_track: "#22c55e", at_risk: "#eab308", off_track: "#ef4444" };
    const HEALTH_LABELS = { on_track: "On Track", at_risk: "At Risk", off_track: "Off Track" };
    return (
      <div style={{ flex: 1, overflow: "auto", padding: isMobile ? "10px 12px" : "20px 28px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Project Status Updates</h3>
          <button onClick={() => { setStatusForm({ health: "on_track", summary: "", highlights: "", blockers: "" }); setShowStatusForm(true); }}
            style={{ padding: "7px 14px", borderRadius: 6, background: T.accent, color: "#fff", border: "none", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>
            + Post Update
          </button>
        </div>
        {statusUpdates.length === 0 ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: T.text3 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>No status updates yet</div>
            <div style={{ fontSize: 13, marginBottom: 20 }}>Post a weekly update to keep the team informed on progress, wins, and blockers.</div>
            <button onClick={() => { setStatusForm({ health: "on_track", summary: "", highlights: "", blockers: "" }); setShowStatusForm(true); }}
              style={{ padding: "9px 20px", borderRadius: 8, background: T.accent, color: "#fff", border: "none", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
              Post First Update
            </button>
          </div>
        ) : statusUpdates.map(su => {
          const h = su.status || "on_track";
          const color = HEALTH_COLORS[h];
          const dAgo = Math.floor((Date.now() - new Date(su.created_at).getTime()) / 86400000);
          return (
            <div key={su.id} style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "18px 22px", marginBottom: 12, borderLeft: `4px solid ${color}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 12, background: color + "20", color }}>{HEALTH_LABELS[h]}</span>
                <span style={{ fontSize: 12, color: T.text3 }}>{dAgo === 0 ? "Today" : `${dAgo} day${dAgo > 1 ? "s" : ""} ago`}</span>
                <span style={{ fontSize: 12, color: T.text3 }}>· {uname(su.author_id) || "Unknown"}</span>
              </div>
              {su.title && <p style={{ fontSize: 14, color: T.text, lineHeight: 1.6, margin: "0 0 10px" }}>{su.title}</p>}
              {su.body && <p style={{ fontSize: 13, color: T.text2, margin: 0, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>{su.body}</p>}
            </div>
          );
        })}
      </div>
    );
  })();

  const DocsView = () => {
    const [creatingDoc, setCreatingDoc] = useState(false);
    const [newDocTitle, setNewDocTitle] = useState("");
    const [newDocEmoji, setNewDocEmoji] = useState("📄");
    const [docSearch, setDocSearch] = useState("");
    const [saving, setSaving] = useState(false);

    const projDoc = proj?.linked_doc_id ? docs.find(d => d.id === proj.linked_doc_id) : null;
    // Docs already linked to this project (either via project_id or linked_doc_id)
    const linkedDocs = docs.filter(d => d.project_id === activeProject || d.id === proj?.linked_doc_id);
    const otherDocs = docs.filter(d => d.project_id !== activeProject && d.id !== proj?.linked_doc_id);
    const filteredOther = otherDocs.filter(d => !docSearch || (d.title || "").toLowerCase().includes(docSearch.toLowerCase()));

    const createDoc = async () => {
      if (!newDocTitle.trim()) return;
      setSaving(true);
      const { data, error } = await supabase.from("documents").insert({
        org_id: profile.org_id,
        created_by: user?.id,
        title: newDocTitle.trim(),
        emoji: newDocEmoji,
        project_id: activeProject,
        status: "draft",
        visibility: "team",
        content: [{ id: crypto.randomUUID(), type: "text", content: "" }],
        sort_order: 0,
      }).select().single();
      if (!error && data) {
        setDocs(p => [data, ...p]);
        // Also set as the linked doc if none linked yet
        if (!proj?.linked_doc_id) {
          await supabase.from("projects").update({ linked_doc_id: data.id }).eq("org_id", orgId).eq("id", activeProject);
          setProjects(p => p.map(pr => pr.id === activeProject ? { ...pr, linked_doc_id: data.id } : pr));
        }
        showToast("Doc created — open it in the Docs module to edit", "success");
      } else {
        showToast("Failed to create doc: " + (error?.message || "unknown error"));
      }
      setNewDocTitle("");
      setNewDocEmoji("📄");
      setCreatingDoc(false);
      setSaving(false);
    };

    const linkDoc = async (docId) => {
      await supabase.from("documents").update({ project_id: activeProject }).eq("id", docId);
      setDocs(p => p.map(d => d.id === docId ? { ...d, project_id: activeProject } : d));
      if (!proj?.linked_doc_id) {
        await supabase.from("projects").update({ linked_doc_id: docId }).eq("org_id", orgId).eq("id", activeProject);
        setProjects(p => p.map(pr => pr.id === activeProject ? { ...pr, linked_doc_id: docId } : pr));
      }
      showToast("Doc linked to project", "success");
    };

    const setPrimary = async (docId) => {
      await supabase.from("projects").update({ linked_doc_id: docId }).eq("org_id", orgId).eq("id", activeProject);
      setProjects(p => p.map(pr => pr.id === activeProject ? { ...pr, linked_doc_id: docId } : pr));
    };

    const unlinkDoc = async (docId) => {
      await supabase.from("documents").update({ project_id: null }).eq("id", docId);
      setDocs(p => p.map(d => d.id === docId ? { ...d, project_id: null } : d));
      if (proj?.linked_doc_id === docId) {
        await supabase.from("projects").update({ linked_doc_id: null }).eq("org_id", orgId).eq("id", activeProject);
        setProjects(p => p.map(pr => pr.id === activeProject ? { ...pr, linked_doc_id: null } : pr));
      }
      showToast("Doc unlinked", "success");
    };

    const DOC_EMOJIS = ["📄","📝","📋","📊","📈","🎯","💡","🔬","📣","⚙️","🧪","🗂️","📐","💬","📌"];
    const fmtDate = (d) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

    return (
      <div style={{ flex: 1, overflow: "auto", padding: "24px 32px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Project Docs</h3>
            <p style={{ fontSize: 13, color: T.text3, margin: "4px 0 0" }}>Briefs, specs, and notes linked to <strong style={{ color: T.text }}>{proj?.name}</strong></p>
          </div>
          <button onClick={() => setCreatingDoc(true)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "9px 18px", borderRadius: 8, background: T.accent, color: "#fff", border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14"/></svg>
            New Doc
          </button>
        </div>

        {/* Create new doc form */}
        {creatingDoc && (
          <div style={{ background: T.surface, border: `1px solid ${T.accent}40`, borderRadius: 12, padding: "18px 20px", marginBottom: 24, boxShadow: "0 4px 20px rgba(0,0,0,0.12)" }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 14 }}>New Doc</div>
            <div style={{ display: "flex", gap: 10, marginBottom: 12, alignItems: "center" }}>
              <div style={{ position: "relative" }}>
                <div style={{ fontSize: 24, cursor: "pointer", padding: "6px 8px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface2, lineHeight: 1 }}>{newDocEmoji}</div>
              </div>
              <input value={newDocTitle} onChange={e => setNewDocTitle(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") createDoc(); if (e.key === "Escape") setCreatingDoc(false); }}
                placeholder="Doc title…"
                style={{ flex: 1, padding: "9px 12px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 14, fontWeight: 600, outline: "none" }} />
            </div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
              {DOC_EMOJIS.map(e => (
                <button key={e} onClick={() => setNewDocEmoji(e)} style={{ fontSize: 16, padding: "4px 6px", borderRadius: 6, border: `1.5px solid ${newDocEmoji === e ? T.accent : "transparent"}`, background: newDocEmoji === e ? T.accentDim : T.surface2, cursor: "pointer" }}>{e}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setCreatingDoc(false)} style={{ padding: "7px 14px", borderRadius: 7, background: T.surface3, color: T.text2, border: "none", fontSize: 13, cursor: "pointer" }}>Cancel</button>
              <button onClick={createDoc} disabled={!newDocTitle.trim() || saving} style={{ padding: "7px 16px", borderRadius: 7, background: newDocTitle.trim() ? T.accent : T.surface3, color: newDocTitle.trim() ? "#fff" : T.text3, border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>{saving ? "Creating…" : "Create Doc"}</button>
            </div>
          </div>
        )}

        {/* Project docs */}
        {linkedDocs.length > 0 && (
          <div style={{ marginBottom: 28 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 10 }}>This Project's Docs ({linkedDocs.length})</div>
            {linkedDocs.map(d => {
              const isPrimary = proj?.linked_doc_id === d.id;
              return (
                <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", background: T.surface, border: `1px solid ${isPrimary ? T.accent + "60" : T.border}`, borderRadius: 10, marginBottom: 8, transition: "border 0.15s" }}
                  onMouseEnter={e => !isPrimary && (e.currentTarget.style.borderColor = T.border)}
                  onMouseLeave={e => !isPrimary && (e.currentTarget.style.borderColor = T.border)}>
                  <span style={{ fontSize: 24, flexShrink: 0 }}>{d.emoji || "📄"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.title || "Untitled"}</span>
                      {isPrimary && <span style={{ fontSize: 10, padding: "1px 7px", borderRadius: 8, background: T.accentDim, color: T.accent, fontWeight: 700, flexShrink: 0 }}>PRIMARY</span>}
                    </div>
                    <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>Updated {fmtDate(d.updated_at)}</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    {!isPrimary && (
                      <button onClick={() => setPrimary(d.id)} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: "none", color: T.text3, fontSize: 11, cursor: "pointer" }}
                        onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.color = T.accent; }}
                        onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.text3; }}>
                        Set Primary
                      </button>
                    )}
                    <button onClick={() => unlinkDoc(d.id)} style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: "none", color: T.text3, fontSize: 11, cursor: "pointer" }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = "#ef4444"; e.currentTarget.style.color = "#ef4444"; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.text3; }}>
                      Unlink
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Link existing docs */}
        <div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.8 }}>All Org Docs</div>
            <div style={{ position: "relative" }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.text3} strokeWidth="2" style={{ position: "absolute", left: 8, top: 7 }}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input value={docSearch} onChange={e => setDocSearch(e.target.value)} placeholder="Search docs…"
                style={{ padding: "5px 8px 5px 26px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 12, outline: "none", width: 200 }} />
            </div>
          </div>
          {filteredOther.length === 0 ? (
            <div style={{ textAlign: "center", padding: "30px 0", color: T.text3 }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>📂</div>
              <div style={{ fontSize: 13 }}>{docSearch ? "No docs match your search" : "No other docs — create a new one above"}</div>
            </div>
          ) : filteredOther.map(d => (
            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 6 }}>
              <span style={{ fontSize: 18 }}>{d.emoji || "📄"}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.title || "Untitled"}</div>
                <div style={{ fontSize: 11, color: T.text3 }}>Updated {fmtDate(d.updated_at)}</div>
              </div>
              <button onClick={() => linkDoc(d.id)} style={{ padding: "4px 12px", borderRadius: 6, border: `1px solid ${T.accent}40`, background: T.accentDim, color: T.accent, fontSize: 11, fontWeight: 600, cursor: "pointer", flexShrink: 0 }}>
                + Link
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  };
  // Templates modal
  const templatesModalEl = (() => {
    if (!showTemplates) return null;
    return (
      <div onClick={() => setShowTemplates(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div onClick={e => e.stopPropagation()} style={{ width: 640, maxHeight: "80vh", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 16, boxShadow: "0 24px 80px rgba(0,0,0,0.35)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "20px 24px 16px", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Start from Template</h3>
                <p style={{ fontSize: 12, color: T.text3, margin: "4px 0 0" }}>{templates.length} template{templates.length === 1 ? "" : "s"} available</p>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button onClick={() => { setShowTemplates(false); setShowTemplateManager(true); }} style={{ padding: "6px 12px", borderRadius: 6, background: T.surface3, color: T.text2, border: `1px solid ${T.border}`, fontSize: 12, cursor: "pointer", fontWeight: 500 }}>Manage</button>
                <button onClick={() => setShowTemplates(false)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 20 }}>×</button>
              </div>
            </div>
            <p style={{ fontSize: 13, color: T.text3, margin: "6px 0 0" }}>Choose a template to pre-populate your project with sections and tasks.</p>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 12 }}>
              {templates.map(t => (
                <div key={t.id} onClick={() => createProjectFromTemplate(t)}
                  style={{ padding: "16px 18px", background: T.surface2, border: `1.5px solid ${T.border}`, borderRadius: 12, cursor: "pointer", transition: "all 0.15s" }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = t.color || T.accent; e.currentTarget.style.background = (t.color || T.accent) + "10"; }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = T.surface2; }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <span style={{ fontSize: 24 }}>{t.icon || "📋"}</span>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{t.name}</div>
                      <div style={{ fontSize: 11, color: T.text3 }}>{t.description}</div>
                    </div>
                  </div>
                  {t.sections && t.sections.length > 0 && (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {t.sections.map((s, i) => (
                        <span key={i} style={{ fontSize: 10, padding: "2px 7px", borderRadius: 8, background: (t.color || T.accent) + "15", color: t.color || T.accent, fontWeight: 600 }}>
                          {s.name} ({s.tasks?.length || 0})
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
            <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 10 }}>
              <div onClick={openNewTemplateEditor} style={{ padding: "14px 18px", border: `1.5px dashed ${T.accent}`, borderRadius: 12, cursor: "pointer", textAlign: "center", color: T.accent, fontSize: 13, fontWeight: 600, background: T.accentDim }}>＋ Create new template</div>
              <div onClick={() => { setShowTemplates(false); openNewProject(); }} style={{ padding: "14px 18px", border: `1.5px dashed ${T.border}`, borderRadius: 12, cursor: "pointer", textAlign: "center", color: T.text3, fontSize: 13, fontWeight: 500 }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = T.accent; e.currentTarget.style.color = T.accent; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.color = T.text3; }}>
                + Start with blank project
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  })();

  // Copy project modal
  const templateManagerEl = (() => {
    if (!showTemplateManager) return null;
    const custom = templates.filter(t => !t.is_builtin);
    const builtin = templates.filter(t => t.is_builtin);
    return (
      <div onClick={() => setShowTemplateManager(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div onClick={e => e.stopPropagation()} style={{ width: 640, maxHeight: "85vh", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "20px 24px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div>
              <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Manage Templates</h3>
              <p style={{ fontSize: 12, color: T.text3, margin: "4px 0 0" }}>Create, edit and delete your project templates</p>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={openNewTemplateEditor} style={{ padding: "7px 14px", borderRadius: 6, background: T.accent, color: "#fff", border: "none", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>＋ New Template</button>
              <button onClick={() => setShowTemplateManager(false)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 20 }}>×</button>
            </div>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: "16px 24px" }}>
            {custom.length > 0 && (
              <div style={{ marginBottom: 18 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Custom ({custom.length})</div>
                {custom.map(t => {
                  const secCount = (t.sections || []).length;
                  const taskCount = (t.sections || []).reduce((sum, s) => sum + (s.tasks || []).length, 0);
                  return (
                    <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 6, background: T.surface2 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: (t.color || "#3b82f6") + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{t.icon || "📋"}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</div>
                        <div style={{ fontSize: 11, color: T.text3 }}>{secCount} section{secCount !== 1 ? "s" : ""} · {taskCount} task{taskCount !== 1 ? "s" : ""}{t.description ? ` — ${t.description}` : ""}</div>
                      </div>
                      <button onClick={() => openEditTemplateEditor(t)} style={{ padding: "6px 12px", borderRadius: 6, background: T.surface3, color: T.text2, border: "none", fontSize: 11, fontWeight: 500, cursor: "pointer" }}>Edit</button>
                      <button onClick={() => deleteTemplate(t)} style={{ padding: "6px 10px", borderRadius: 6, background: "transparent", color: T.red, border: `1px solid ${T.border}`, fontSize: 11, fontWeight: 500, cursor: "pointer" }}>Delete</button>
                    </div>
                  );
                })}
              </div>
            )}
            {builtin.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Built-in ({builtin.length})</div>
                {builtin.map(t => {
                  const secCount = (t.sections || []).length;
                  const taskCount = (t.sections || []).reduce((sum, s) => sum + (s.tasks || []).length, 0);
                  return (
                    <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 6, background: T.surface2, opacity: 0.85 }}>
                      <div style={{ width: 36, height: 36, borderRadius: 8, background: (t.color || "#3b82f6") + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{t.icon || "📋"}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{t.name} <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 4, background: T.surface3, color: T.text3, marginLeft: 6, fontWeight: 500 }}>Built-in</span></div>
                        <div style={{ fontSize: 11, color: T.text3 }}>{secCount} section{secCount !== 1 ? "s" : ""} · {taskCount} task{taskCount !== 1 ? "s" : ""}{t.description ? ` — ${t.description}` : ""}</div>
                      </div>
                      <span style={{ fontSize: 10, color: T.text3 }}>Read-only</span>
                    </div>
                  );
                })}
              </div>
            )}
            {templates.length === 0 && (
              <div style={{ textAlign: "center", padding: "60px 0", color: T.text3 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.text2, marginBottom: 6 }}>No templates yet</div>
                <div style={{ fontSize: 12, marginBottom: 16 }}>Create a template from scratch or save an existing project as a template.</div>
                <button onClick={openNewTemplateEditor} style={{ padding: "9px 18px", borderRadius: 8, background: T.accent, color: "#fff", border: "none", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>＋ Create your first template</button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  })();

  const templateEditorEl = (() => {
    const ed = templateEditor;
    if (!ed) return null;
    const setEd = (patch) => setTemplateEditor(p => ({ ...p, ...patch }));
    const setSection = (idx, patch) => setEd({
      sections: ed.sections.map((s, i) => i === idx ? { ...s, ...patch } : s),
    });
    const addSection = () => setEd({
      sections: [...ed.sections, { name: "New Section", tasks: [""] }],
    });
    const removeSection = (idx) => setEd({
      sections: ed.sections.filter((_, i) => i !== idx),
    });
    const moveSection = (idx, dir) => {
      const j = idx + dir;
      if (j < 0 || j >= ed.sections.length) return;
      const next = [...ed.sections];
      [next[idx], next[j]] = [next[j], next[idx]];
      setEd({ sections: next });
    };
    const setTasksAt = (sIdx, tasks) => setSection(sIdx, { tasks });
    const addTask = (sIdx) => setTasksAt(sIdx, [...(ed.sections[sIdx].tasks || []), { id: _teRid(), title: "", assignee_id: "", subtasks: [], _rest: {} }]);
    const setTask = (sIdx, tIdx, patch) => setTasksAt(sIdx, (ed.sections[sIdx].tasks || []).map((t, i) => i === tIdx ? { ...t, ...patch } : t));
    const removeTask = (sIdx, tIdx) => setTasksAt(sIdx, (ed.sections[sIdx].tasks || []).filter((_, i) => i !== tIdx));
    const addSubtask = (sIdx, tIdx) => setTask(sIdx, tIdx, { subtasks: [...((ed.sections[sIdx].tasks[tIdx] || {}).subtasks || []), { id: _teRid(), title: "", assignee_id: "" }] });
    const setSubtask = (sIdx, tIdx, stIdx, patch) => setTask(sIdx, tIdx, { subtasks: ((ed.sections[sIdx].tasks[tIdx] || {}).subtasks || []).map((st, i) => i === stIdx ? { ...st, ...patch } : st) });
    const removeSubtask = (sIdx, tIdx, stIdx) => setTask(sIdx, tIdx, { subtasks: ((ed.sections[sIdx].tasks[tIdx] || {}).subtasks || []).filter((_, i) => i !== stIdx) });
    const asgOpts = [{ value: "", label: "Unassigned", icon: "✕" }, ...Object.values(profiles).map(u => ({ value: u.id, label: u.display_name || u.email || "Unknown", icon: "👤" }))];
    const iconChoices = ["📋", "🚀", "🎯", "💼", "📊", "🛠️", "🔬", "📦", "🎨", "🧪", "📈", "✨"];
    const colorChoices = ["#3b82f6", "#22c55e", "#ef4444", "#a855f7", "#f97316", "#ec4899", "#06b6d4", "#eab308", "#6366f1", "#6b7280"];
    const lbl = { fontSize: 11, fontWeight: 600, color: T.text3, display: "block", marginBottom: 4 };
    const inp = { width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, outline: "none", boxSizing: "border-box" };
    return (
      <div onClick={() => setTemplateEditor(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 110, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div onClick={e => e.stopPropagation()} style={{ width: 720, maxWidth: "92vw", maxHeight: "88vh", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "20px 24px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h3 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>{ed.mode === "edit" ? "Edit Template" : "New Template"}</h3>
            <button onClick={() => setTemplateEditor(null)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 20 }}>×</button>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: "16px 24px" }}>
            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>Template name *</label>
              <input value={ed.name} onChange={e => setEd({ name: e.target.value })} placeholder="e.g. Product Launch Checklist" autoFocus style={inp} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={lbl}>Description</label>
              <textarea value={ed.description} onChange={e => setEd({ description: e.target.value })} rows={2} placeholder="What is this template for?" style={{ ...inp, resize: "vertical", fontFamily: "inherit" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 16 }}>
              <div>
                <label style={lbl}>Icon</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {iconChoices.map(ic => (
                    <button key={ic} onClick={() => setEd({ icon: ic })} style={{ width: 30, height: 30, fontSize: 16, borderRadius: 6, border: `1px solid ${ed.icon === ic ? T.accent : T.border}`, background: ed.icon === ic ? T.accentDim : T.surface2, cursor: "pointer" }}>{ic}</button>
                  ))}
                </div>
              </div>
              <div>
                <label style={lbl}>Color</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {colorChoices.map(c => (
                    <button key={c} onClick={() => setEd({ color: c })} style={{ width: 24, height: 24, borderRadius: "50%", border: ed.color === c ? `2px solid ${T.text}` : "2px solid transparent", background: c, cursor: "pointer" }} />
                  ))}
                </div>
              </div>
            </div>
            <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <label style={{ ...lbl, marginBottom: 0 }}>Sections &amp; Tasks</label>
                <button onClick={addSection} style={{ padding: "5px 10px", borderRadius: 5, background: T.surface3, color: T.text2, border: `1px solid ${T.border}`, fontSize: 11, cursor: "pointer" }}>＋ Add Section</button>
              </div>
              {ed.sections.map((sec, sIdx) => (
                <div key={sIdx} style={{ marginBottom: 10, padding: 10, borderRadius: 8, background: T.surface2, border: `1px solid ${T.border}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <input value={sec.name} onChange={e => setSection(sIdx, { name: e.target.value })} placeholder="Section name" style={{ flex: 1, padding: "6px 8px", borderRadius: 5, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontSize: 13, fontWeight: 600, outline: "none" }} />
                    <button onClick={() => moveSection(sIdx, -1)} disabled={sIdx === 0} style={{ padding: "4px 8px", background: "none", border: "none", color: sIdx === 0 ? T.text3 : T.text2, cursor: sIdx === 0 ? "default" : "pointer", fontSize: 14 }}>↑</button>
                    <button onClick={() => moveSection(sIdx, 1)} disabled={sIdx === ed.sections.length - 1} style={{ padding: "4px 8px", background: "none", border: "none", color: sIdx === ed.sections.length - 1 ? T.text3 : T.text2, cursor: sIdx === ed.sections.length - 1 ? "default" : "pointer", fontSize: 14 }}>↓</button>
                    <button onClick={() => removeSection(sIdx)} style={{ padding: "4px 8px", background: "none", border: "none", color: T.red, cursor: "pointer", fontSize: 14 }}>✕</button>
                  </div>
                  {(sec.tasks || []).map((task, tIdx) => (
                    <div key={task.id || tIdx} style={{ marginBottom: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ color: T.text3, fontSize: 11, width: 12 }}>·</span>
                        <input value={task.title} onChange={e => setTask(sIdx, tIdx, { title: e.target.value })} placeholder="Task title"
                          style={{ flex: 1, padding: "5px 8px", borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontSize: 12, outline: "none" }} />
                        <div style={{ width: 150, flexShrink: 0 }}><SearchableMultiSelect multi={false} placeholder="Unassigned" options={asgOpts} selected={task.assignee_id || ""} onChange={v => setTask(sIdx, tIdx, { assignee_id: v })} /></div>
                        <button onClick={() => addSubtask(sIdx, tIdx)} title="Add subtask" style={{ padding: "2px 6px", background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 13 }}>↳＋</button>
                        <button onClick={() => removeTask(sIdx, tIdx)} title="Remove task" style={{ padding: "2px 6px", background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 12 }}>✕</button>
                      </div>
                      {(task.subtasks || []).map((st, stIdx) => (
                        <div key={st.id || stIdx} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 4, paddingLeft: 24 }}>
                          <span style={{ color: T.text3, fontSize: 11 }}>↳</span>
                          <input value={st.title} onChange={e => setSubtask(sIdx, tIdx, stIdx, { title: e.target.value })} placeholder="Subtask title"
                            style={{ flex: 1, padding: "4px 8px", borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontSize: 12, outline: "none" }} />
                          <div style={{ width: 150, flexShrink: 0 }}><SearchableMultiSelect multi={false} placeholder="Unassigned" options={asgOpts} selected={st.assignee_id || ""} onChange={v => setSubtask(sIdx, tIdx, stIdx, { assignee_id: v })} /></div>
                          <button onClick={() => removeSubtask(sIdx, tIdx, stIdx)} title="Remove subtask" style={{ padding: "2px 6px", background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 12 }}>✕</button>
                        </div>
                      ))}
                    </div>
                  ))}
                  <button onClick={() => addTask(sIdx)} style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 4, padding: "5px 8px", borderRadius: 5, border: `1px dashed ${T.border}`, background: "none", color: T.text3, fontSize: 12, cursor: "pointer", width: "100%" }}>＋ Add task</button>
                </div>
              ))}
              {ed.sections.length === 0 && (
                <div style={{ textAlign: "center", padding: "30px 0", color: T.text3, fontSize: 12, border: `1px dashed ${T.border}`, borderRadius: 8 }}>
                  No sections yet. Click "+ Add Section" to start.
                </div>
              )}
            </div>
          </div>
          <div style={{ padding: "14px 24px", borderTop: `1px solid ${T.border}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button onClick={() => setTemplateEditor(null)} style={{ padding: "9px 18px", borderRadius: 8, background: T.surface3, color: T.text2, border: "none", fontSize: 13, cursor: "pointer" }}>Cancel</button>
            <button onClick={saveTemplateFromEditor} style={{ padding: "9px 18px", borderRadius: 8, background: T.accent, color: "#fff", border: "none", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>{ed.mode === "edit" ? "Save Changes" : "Create Template"}</button>
          </div>
        </div>
      </div>
    );
  })();

  const saveAsTemplateModalEl = (() => {
    if (!savingAsTemplate) return null;
    const secCount = sections.filter(s => s.project_id === savingAsTemplate.id).length;
    const taskCount = tasks.filter(t => t.project_id === savingAsTemplate.id && !t.parent_task_id).length;
    const f = savingAsTemplateForm;
    const setF = (k, v) => setSavingAsTemplateForm(p => ({ ...p, [k]: v }));
    const iconChoices = ["📋", "🚀", "🎯", "💼", "📊", "🛠️", "🔬", "📦", "🎨", "🧪", "📈", "✨"];
    const colorChoices = ["#3b82f6", "#22c55e", "#ef4444", "#a855f7", "#f97316", "#ec4899", "#06b6d4", "#eab308", "#6366f1", "#6b7280"];
    return (
      <div onClick={() => setSavingAsTemplate(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div onClick={e => e.stopPropagation()} style={{ width: 400, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <div style={{ width: 40, height: 40, borderRadius: 10, background: (savingAsTemplate.color || T.accent) + "20", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>📋</div>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Save as Template</h3>
              <div style={{ fontSize: 12, color: T.text3, marginTop: 2 }}>{savingAsTemplate.name}</div>
            </div>
          </div>
          <div style={{ padding: "12px 14px", background: T.surface2, borderRadius: 10, marginBottom: 14, fontSize: 13, color: T.text2, lineHeight: 1.5 }}>
            Saving <strong style={{ color: T.text }}>{secCount} section{secCount !== 1 ? "s" : ""}</strong> and <strong style={{ color: T.text }}>{taskCount} task{taskCount !== 1 ? "s" : ""}</strong> as a reusable template. Sections and task names are always included — pick what else to carry over.
          </div>
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Include in template</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
              {[["subtasks", "Subtasks"], ["descriptions", "Descriptions"], ["assignees", "Assignees"], ["tags", "Tags"], ["files", "Files & attachments"]].map(([k, label]) => (
                <label key={k} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", fontSize: 13, color: T.text2, cursor: "pointer" }}>
                  <input type="checkbox" checked={!!(f.include || {})[k]} onChange={e => setF("include", { ...(f.include || {}), [k]: e.target.checked })} style={{ cursor: "pointer" }} />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <div style={{ padding: "0 24px 16px" }}>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: T.text3, display: "block", marginBottom: 4 }}>Template name *</label>
              <input value={f.name} onChange={e => setF("name", e.target.value)} autoFocus
                style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: T.text3, display: "block", marginBottom: 4 }}>Description</label>
              <textarea value={f.description} onChange={e => setF("description", e.target.value)} rows={2} placeholder="What is this template for?"
                style={{ width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, outline: "none", boxSizing: "border-box", resize: "vertical", fontFamily: "inherit" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: T.text3, display: "block", marginBottom: 4 }}>Icon</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {iconChoices.map(ic => (
                    <button key={ic} onClick={() => setF("icon", ic)} style={{ width: 30, height: 30, fontSize: 16, borderRadius: 6, border: `1px solid ${f.icon === ic ? T.accent : T.border}`, background: f.icon === ic ? T.accentDim : T.surface2, cursor: "pointer" }}>{ic}</button>
                  ))}
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: T.text3, display: "block", marginBottom: 4 }}>Color</label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {colorChoices.map(c => (
                    <button key={c} onClick={() => setF("color", c)} style={{ width: 24, height: 24, borderRadius: "50%", border: f.color === c ? `2px solid ${T.text}` : "2px solid transparent", background: c, cursor: "pointer" }} />
                  ))}
                </div>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => { setSavingAsTemplate(null); setSavingAsTemplateForm({ name: "", description: "", icon: "📋", color: "#3b82f6", include: { subtasks: true, descriptions: true, assignees: false, tags: false, files: false } }); }} style={{ padding: "9px 18px", borderRadius: 8, background: T.surface3, color: T.text2, border: "none", fontSize: 13, cursor: "pointer" }}>Cancel</button>
            <button onClick={() => saveAsTemplate(savingAsTemplate)} style={{ padding: "9px 18px", borderRadius: 8, background: T.accent, color: "#fff", border: "none", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>Save Template</button>
          </div>
        </div>
      </div>
    );
  })();

  const copyModalEl = (() => {
    if (!copyingProject) return null;
    return (
      <div onClick={() => setCopyingProject(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div onClick={e => e.stopPropagation()} style={{ width: "min(380px, 95vw)", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: "0 0 10px" }}>Copy "{copyingProject.name}"</h3>
          <p style={{ fontSize: 13, color: T.text3, margin: "0 0 20px", lineHeight: 1.5 }}>
            This will create a new project with all the same sections and tasks (reset to "To Do" status). Assignees and due dates will not be copied.
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => setCopyingProject(null)} style={{ padding: "9px 18px", borderRadius: 8, background: T.surface3, color: T.text2, border: "none", fontSize: 13, cursor: "pointer" }}>Cancel</button>
            <button onClick={() => copyProject(copyingProject)} style={{ padding: "9px 18px", borderRadius: 8, background: T.accent, color: "#fff", border: "none", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>Copy Project</button>
          </div>
        </div>
      </div>
    );
  })();

  // Status form modal
  const HEALTH_OPTS = [{ k: "on_track", l: "On Track", color: "#22c55e" }, { k: "at_risk", l: "At Risk", color: "#eab308" }, { k: "off_track", l: "Off Track", color: "#ef4444" }];
  const statusFormModalEl = !showStatusForm ? null : (
      <div onClick={() => setShowStatusForm(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div onClick={e => e.stopPropagation()} style={{ width: "min(500px, 95vw)", maxHeight: "80vh", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "18px 24px", borderBottom: `1px solid ${T.border}` }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Post Status Update</h3>
              <button onClick={() => setShowStatusForm(false)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 18 }}>×</button>
            </div>
            <div style={{ fontSize: 12, color: T.text3, marginTop: 4 }}>{proj?.name}</div>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>
            {/* Health */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.text2, display: "block", marginBottom: 8 }}>Overall Health</label>
              <div style={{ display: "flex", gap: 6 }}>
                {HEALTH_OPTS.map(h => (
                  <button key={h.k} onClick={() => setStatusForm(p => ({ ...p, health: h.k }))}
                    style={{ flex: 1, padding: "8px 0", borderRadius: 8, border: `1.5px solid ${statusForm.health === h.k ? h.color : T.border}`, background: statusForm.health === h.k ? h.color + "20" : "transparent", color: statusForm.health === h.k ? h.color : T.text3, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>
                    {h.l}
                  </button>
                ))}
              </div>
            </div>
            {/* Summary */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.text2, display: "block", marginBottom: 6 }}>Summary *</label>
              <textarea value={statusForm.summary} onChange={e => setStatusForm(p => ({ ...p, summary: e.target.value }))}
                placeholder="How is the project going overall? What's the current state?"
                rows={3} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, resize: "vertical", outline: "none", fontFamily: "inherit", lineHeight: 1.5, boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.text2, display: "block", marginBottom: 6 }}>Highlights <span style={{ color: T.text3, fontWeight: 400 }}>(optional)</span></label>
              <textarea value={statusForm.highlights} onChange={e => setStatusForm(p => ({ ...p, highlights: e.target.value }))}
                placeholder="Wins, completions, milestones hit…"
                rows={2} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, resize: "vertical", outline: "none", fontFamily: "inherit", lineHeight: 1.5, boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.text2, display: "block", marginBottom: 6 }}>Blockers <span style={{ color: T.text3, fontWeight: 400 }}>(optional)</span></label>
              <textarea value={statusForm.blockers} onChange={e => setStatusForm(p => ({ ...p, blockers: e.target.value }))}
                placeholder="What's slowing you down? What do you need?"
                rows={2} style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, resize: "vertical", outline: "none", fontFamily: "inherit", lineHeight: 1.5, boxSizing: "border-box" }} />
            </div>
          </div>
          <div style={{ padding: "14px 24px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => setShowStatusForm(false)} style={{ padding: "9px 18px", borderRadius: 8, background: T.surface3, color: T.text2, border: "none", fontSize: 13, cursor: "pointer" }}>Cancel</button>
            <button onClick={saveStatusUpdate} disabled={!statusForm.summary.trim()}
              style={{ padding: "9px 18px", borderRadius: 8, background: statusForm.summary.trim() ? T.accent : T.surface3, color: statusForm.summary.trim() ? "#fff" : T.text3, border: "none", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
              Post Update
            </button>
          </div>
        </div>
      </div>
    );

  // ═══════════════ Forms & Templates ═══════════════
  useEffect(() => {
    if (!activeProject) { setTaskTemplates([]); setProjectForms([]); return; }
    supabase.from("task_templates").select("*").eq("project_id", activeProject).order("created_at").then(({ data }) => setTaskTemplates(data || []));
    supabase.from("project_forms").select("*").eq("project_id", activeProject).order("created_at").then(({ data }) => setProjectForms(data || []));
  }, [activeProject]);
  // Deep-link: /?form=<token> opens the fill modal for that form (logged-in org members)
  useEffect(() => {
    try {
      const token = new URLSearchParams(window.location.search).get("form");
      if (!token) return;
      supabase.from("project_forms").select("*").eq("public_token", token).eq("is_active", true).maybeSingle().then(({ data }) => {
        if (data) { setActiveProject(data.project_id); setShowMyTasks(false); const init = {}; (data.fields || []).forEach(f => { init[f.id] = ""; }); setFillingForm({ form: data, values: init }); }
      });
    } catch (e) {}
  }, []);

  function memberOpts() { return Object.values(profiles).map(u => ({ value: u.id, label: u.display_name || u.email || "Unknown", icon: "👤", avatar: u.avatar_url })); }
  const sectionOpts = () => projSections.map(s => ({ value: s.id, label: s.name }));
  const priorityOpts = () => Object.entries(PRIORITY).map(([k, v]) => ({ value: k, label: v.label, color: v.dot }));
  const FORM_FIELD_TYPES = [
    { maps_to: "description", label: "Description" },
    { maps_to: "assignee", label: "Assignee" },
    { maps_to: "due_date", label: "Due date" },
    { maps_to: "priority", label: "Priority" },
    { maps_to: "section", label: "Section" },
    { maps_to: "note_short", label: "Short answer" },
    { maps_to: "note_long", label: "Paragraph" },
    { maps_to: "single_select", label: "Single select" },
    { maps_to: "multi_select", label: "Multi select" },
    { maps_to: "attachments", label: "Attachments" },
  ];

  const _ttRid = () => "st_" + Math.random().toString(36).slice(2, 9);
  const _ttItem = (o) => { const b = typeof o === "string" ? { title: o } : (o || {}); return { id: b.id || _ttRid(), title: b.title || "", description: b.description || "", priority: b.priority || "none", assignee_id: b.assignee_id || "", collaborator_ids: Array.isArray(b.collaborator_ids) ? b.collaborator_ids : [], start_in_days: b.start_in_days ?? "", due_in_days: b.due_in_days ?? "", depends_on: Array.isArray(b.depends_on) ? b.depends_on : [] }; };
  const openNewTaskTemplate = () => setTtEditor({ id: null, name: "", selected: "__main", template_data: { title: "", description: "", priority: "none", assignee_id: "", section_id: "", start_in_days: "", due_in_days: "", collaborator_ids: [], depends_on: [], subtasks: [] } });
  const openEditTaskTemplate = (t) => { const td = t.template_data || {}; setTtEditor({ id: t.id, name: t.name, selected: "__main", template_data: { title: td.title || "", description: td.description || "", priority: td.priority || "none", assignee_id: td.assignee_id || "", section_id: td.section_id || "", start_in_days: td.start_in_days ?? "", due_in_days: td.due_in_days ?? "", collaborator_ids: Array.isArray(td.collaborator_ids) ? td.collaborator_ids : [], depends_on: Array.isArray(td.depends_on) ? td.depends_on : [], subtasks: (td.subtasks || []).map(_ttItem) } }); };
  const saveTaskTemplate = async () => {
    const ed = ttEditor; if (!ed) return;
    if (!ed.name.trim()) return showToast("Template name required");
    const items = (ed.template_data.subtasks || []).filter(s => (s.title || "").trim()).map(s => ({ ...s, title: s.title.trim() }));
    const validIds = new Set(["__main", ...items.map(s => s.id)]);
    const cleanDeps = (arr) => (arr || []).filter(id => validIds.has(id));
    const td = { ...ed.template_data, subtasks: items.map(s => ({ ...s, depends_on: cleanDeps(s.depends_on) })), depends_on: cleanDeps(ed.template_data.depends_on) };
    const payload = { name: ed.name.trim(), template_data: td, project_id: activeProject };
    if (ed.id) {
      const { data, error } = await supabase.from("task_templates").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", ed.id).select().single();
      if (error) return showToast("Failed: " + error.message);
      setTaskTemplates(p => p.map(t => t.id === ed.id ? data : t));
    } else {
      const { data, error } = await supabase.from("task_templates").insert({ ...payload, org_id: resolveOrgId(activeProject), created_by: user?.id }).select().single();
      if (error) return showToast("Failed: " + error.message);
      setTaskTemplates(p => [...p, data]);
    }
    setTtEditor(null);
    showToast("Template saved", "success");
  };
  const deleteTaskTemplate = async (id) => { if (!window.confirm("Delete this template?")) return; await supabase.from("task_templates").delete().eq("id", id); setTaskTemplates(p => p.filter(t => t.id !== id)); };
  const useTaskTemplate = async (tmpl) => {
    const td = tmpl.template_data || {};
    const orgIdForInsert = resolveOrgId(activeProject);
    if (!orgIdForInsert) return showToast("No org context");
    const sid = td.section_id && projSections.some(s => s.id === td.section_id) ? td.section_id : (projSections[0]?.id || null);
    const st = tasks.filter(t => t.section_id === sid && !t.parent_task_id);
    const mx = st.reduce((m, t) => Math.max(m, t.sort_order || 0), 0);
    const relDate = (v) => { if (v === "" || v == null) return null; const d = new Date(); d.setDate(d.getDate() + Number(v)); return d.toISOString().split("T")[0]; };
    const items = (td.subtasks || []).map(s => (typeof s === "string" ? { id: s, title: s } : s)).filter(s => (s.title || "").trim());
    const { data: main, error } = await supabase.from("tasks").insert({ org_id: orgIdForInsert, project_id: activeProject, section_id: sid, title: td.title || tmpl.name, description: td.description || "", status: "todo", priority: td.priority || "none", assignee_id: td.assignee_id || null, start_date: relDate(td.start_in_days), due_date: relDate(td.due_in_days), sort_order: mx + 1, created_by: user?.id }).select().single();
    if (error) return showToast("Failed to create task: " + error.message);
    const created = [main];
    const idMap = { "__main": main.id };
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const { data: sub } = await supabase.from("tasks").insert({ org_id: orgIdForInsert, project_id: activeProject, section_id: sid, parent_task_id: main.id, title: it.title.trim(), description: it.description || "", status: "todo", priority: it.priority || "none", assignee_id: it.assignee_id || null, start_date: relDate(it.start_in_days), due_date: relDate(it.due_in_days), sort_order: i + 1, created_by: user?.id }).select().single();
      if (sub) { created.push(sub); idMap[it.id] = sub.id; }
    }
    setTasks(p => [...p, ...created]);
    const addCollabs = async (taskId, ids, taskTitle) => {
      for (const uid of (ids || [])) {
        if (!uid) continue;
        await supabase.from("task_assignees").insert({ task_id: taskId, user_id: uid, role: "collaborator", org_id: orgIdForInsert });
        if (uid !== user?.id) { await supabase.from("notifications").insert({ org_id: orgIdForInsert, user_id: uid, type: "assignment", title: `${uname(user?.id)} added you as a collaborator`, body: taskTitle || "Task", entity_type: "task", entity_id: taskId, actor_id: user?.id, is_read: false, category: "assignment", metadata: { task_title: taskTitle } }); }
      }
    };
    await addCollabs(main.id, td.collaborator_ids, main.title);
    for (const it of items) { if (idMap[it.id]) await addCollabs(idMap[it.id], it.collaborator_ids, it.title); }
    const addDeps = async (localId, depList) => {
      const succId = idMap[localId]; if (!succId) return;
      for (const depLocal of (depList || [])) { const preId = idMap[depLocal]; if (preId && preId !== succId) { await supabase.from("task_dependencies").insert({ predecessor_id: preId, successor_id: succId, dependency_type: "finish_to_start", org_id: orgIdForInsert }); } }
    };
    await addDeps("__main", td.depends_on);
    for (const it of items) await addDeps(it.id, it.depends_on);
    executeRules(main.id, "__created", true, null, main);
    showToast(`Task created from "${tmpl.name}"`, "success");
    setViewMode("List");
  };

  const openNewForm = () => setFormEditor({ id: null, name: "", description: "", fields: [{ id: "f_title", label: "Task name", maps_to: "title", required: true }], target_section_id: "", default_assignee_id: "", default_priority: "none", is_active: true });
  const openEditForm = (f) => setFormEditor({ id: f.id, name: f.name, description: f.description || "", fields: (f.fields && f.fields.length ? f.fields : [{ id: "f_title", label: "Task name", maps_to: "title", required: true }]), target_section_id: f.target_section_id || "", default_assignee_id: f.default_assignee_id || "", default_priority: f.default_priority || "none", is_active: f.is_active !== false, public_token: f.public_token, submit_count: f.submit_count });
  const saveForm = async () => {
    const ed = formEditor; if (!ed) return;
    if (!ed.name.trim()) return showToast("Form name required");
    const payload = { name: ed.name.trim(), description: ed.description || "", fields: ed.fields, target_section_id: ed.target_section_id || null, default_assignee_id: ed.default_assignee_id || null, default_priority: ed.default_priority || "none", is_active: ed.is_active !== false, project_id: activeProject };
    if (ed.id) {
      const { data, error } = await supabase.from("project_forms").update({ ...payload, updated_at: new Date().toISOString() }).eq("id", ed.id).select().single();
      if (error) return showToast("Failed: " + error.message);
      setProjectForms(p => p.map(f => f.id === ed.id ? data : f));
    } else {
      const { data, error } = await supabase.from("project_forms").insert({ ...payload, org_id: resolveOrgId(activeProject), created_by: user?.id }).select().single();
      if (error) return showToast("Failed: " + error.message);
      setProjectForms(p => [...p, data]);
    }
    setFormEditor(null);
    showToast("Form saved", "success");
  };
  const deleteForm = async (id) => { if (!window.confirm("Delete this form?")) return; await supabase.from("project_forms").delete().eq("id", id); setProjectForms(p => p.filter(f => f.id !== id)); };
  const toggleFormActive = async (form) => { const { data } = await supabase.from("project_forms").update({ is_active: !form.is_active }).eq("id", form.id).select().single(); if (data) setProjectForms(p => p.map(f => f.id === form.id ? data : f)); };
  const copyFormLink = (form) => { try { const url = `${window.location.origin}/form/${form.public_token}`; navigator.clipboard.writeText(url); showToast("Form link copied", "success"); } catch (e) { showToast("Copy failed"); } };
  const openFillForm = (form) => { const init = {}; (form.fields || []).forEach(f => { init[f.id] = ""; }); setFillingForm({ form, values: init }); };
  const submitForm = async () => {
    const { form, values } = fillingForm || {};
    if (!form) return;
    for (const fld of (form.fields || [])) { if (!fld.required) continue; const rv = values[fld.id]; const empty = (fld.maps_to === "multi_select" || fld.maps_to === "attachments") ? !(Array.isArray(rv) && rv.length) : !String(rv ?? "").trim(); if (empty) return showToast(`"${fld.label}" is required`); }
    const orgIdForInsert = resolveOrgId(form.project_id || activeProject);
    if (!orgIdForInsert) return showToast("No org context");
    let title = ""; let description = ""; let assignee = form.default_assignee_id || null; let priority = form.default_priority || "none"; let due = null; let secOverride = null; const extra = [];
    for (const fld of (form.fields || [])) {
      const v = values[fld.id];
      if (v == null || v === "") continue;
      if (fld.maps_to === "title") title = String(v);
      else if (fld.maps_to === "description") description = String(v);
      else if (fld.maps_to === "assignee") assignee = v;
      else if (fld.maps_to === "priority") priority = v;
      else if (fld.maps_to === "due_date") due = v;
      else if (fld.maps_to === "section") secOverride = v;
      else if (fld.maps_to === "attachments") { /* files handled after task insert */ }
      else if (fld.maps_to === "single_select") { if (v) extra.push(`${fld.label}: ${v}`); }
      else if (fld.maps_to === "multi_select") { if (Array.isArray(v) && v.length) extra.push(`${fld.label}: ${v.join(", ")}`); }
      else extra.push(`${fld.label}: ${v}`);
    }
    const sid = secOverride || (form.target_section_id && projSections.some(s => s.id === form.target_section_id) ? form.target_section_id : (projSections[0]?.id || null));
    const fullDesc = [description, extra.join("\n")].filter(Boolean).join("\n\n");
    const st = tasks.filter(t => t.section_id === sid && !t.parent_task_id);
    const mx = st.reduce((m, t) => Math.max(m, t.sort_order || 0), 0);
    const { data, error } = await supabase.from("tasks").insert({ org_id: orgIdForInsert, project_id: form.project_id || activeProject, section_id: sid, title: title || form.name, description: fullDesc, status: "todo", priority: priority || "none", assignee_id: assignee || null, due_date: due || null, sort_order: mx + 1, created_by: user?.id }).select().single();
    if (error) return showToast("Failed to submit: " + error.message);
    setTasks(p => [...p, data]);
    for (const fld of (form.fields || [])) {
      if (fld.maps_to !== "attachments") continue;
      const files = values[fld.id];
      if (!Array.isArray(files)) continue;
      for (const file of files) {
        try {
          const path = `${orgIdForInsert}/${data.id}/${Date.now()}_${file.name}`;
          const { error: ue } = await supabase.storage.from("attachments").upload(path, file);
          if (ue) continue;
          await supabase.from("attachments").insert({ org_id: orgIdForInsert, entity_type: "task", entity_id: data.id, filename: file.name, file_path: path, file_size: file.size, mime_type: file.type, uploaded_by: user?.id });
        } catch (e) {}
      }
    }
    supabase.from("project_forms").update({ submit_count: (form.submit_count || 0) + 1 }).eq("id", form.id);
    setProjectForms(p => p.map(f => f.id === form.id ? { ...f, submit_count: (f.submit_count || 0) + 1 } : f));
    executeRules(data.id, "__created", true, null, data);
    setFillingForm(null);
    showToast("Task created from form", "success");
  };

  const ftCard = { background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: "16px 18px", marginBottom: 10 };
  const ftBtn = (bg, col, brd) => ({ padding: "6px 12px", borderRadius: 6, background: bg, color: col, border: brd || "none", fontSize: 12, fontWeight: 600, cursor: "pointer" });

  const formsTemplatesViewEl = (() => (
    <div style={{ flex: 1, overflow: "auto", padding: isMobile ? "16px 14px" : "24px 32px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 20, borderBottom: `1px solid ${T.border}` }}>
        {[{ k: "templates", l: "Task Templates" }, { k: "forms", l: "Forms" }].map(t => (
          <button key={t.k} onClick={() => setFtTab(t.k)} style={{ padding: "10px 16px", fontSize: 14, fontWeight: ftTab === t.k ? 700 : 500, color: ftTab === t.k ? T.accent : T.text3, background: "none", border: "none", borderBottom: ftTab === t.k ? `2px solid ${T.accent}` : "2px solid transparent", cursor: "pointer" }}>{t.l}</button>
        ))}
      </div>

      {ftTab === "templates" && (
        <div style={{ maxWidth: 760 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div><div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>Task Templates</div><div style={{ fontSize: 12, color: T.text3, marginTop: 2 }}>Save a reusable task and spawn it in one click with everything pre-filled.</div></div>
            <button onClick={openNewTaskTemplate} style={ftBtn(T.accent, "#fff")}>＋ New Template</button>
          </div>
          {taskTemplates.length === 0 ? (
            <div style={{ textAlign: "center", padding: "50px 0", color: T.text3 }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🧩</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.text2 }}>No task templates yet</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Create one for anything you set up repeatedly.</div>
            </div>
          ) : taskTemplates.map(t => { const td = t.template_data || {}; const sec = projSections.find(s => s.id === td.section_id); const asg = td.assignee_id ? profiles[td.assignee_id] : null; return (
            <div key={t.id} style={ftCard}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{t.name}</div>
                  {td.title && <div style={{ fontSize: 12, color: T.text2, marginTop: 3 }}>Creates: {td.title}</div>}
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                    {td.priority && td.priority !== "none" && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 8, background: (PRIORITY[td.priority]?.dot || T.accent) + "20", color: PRIORITY[td.priority]?.dot || T.accent, fontWeight: 700 }}>{PRIORITY[td.priority]?.label || td.priority}</span>}
                    {sec && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 8, background: T.surface3, color: T.text3, fontWeight: 600 }}>📁 {sec.name}</span>}
                    {asg && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 8, background: T.surface3, color: T.text3, fontWeight: 600 }}>👤 {asg.display_name || asg.email}</span>}
                    {td.due_in_days !== "" && td.due_in_days != null && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 8, background: T.surface3, color: T.text3, fontWeight: 600 }}>📅 +{td.due_in_days}d</span>}
                    {(td.subtasks || []).filter(Boolean).length > 0 && <span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 8, background: T.surface3, color: T.text3, fontWeight: 600 }}>☑ {(td.subtasks || []).filter(Boolean).length} subtasks</span>}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                  <button onClick={() => useTaskTemplate(t)} style={ftBtn(T.accentDim, T.accent, `1px solid ${T.accent}40`)}>+ Use</button>
                  <button onClick={() => openEditTaskTemplate(t)} style={ftBtn(T.surface2, T.text2, `1px solid ${T.border}`)}>Edit</button>
                  <button onClick={() => deleteTaskTemplate(t.id)} style={{ ...S.iconBtn, color: T.red }} title="Delete">✕</button>
                </div>
              </div>
            </div>
          ); })}
        </div>
      )}

      {ftTab === "forms" && (
        <div style={{ maxWidth: 760 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
            <div><div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>Forms</div><div style={{ fontSize: 12, color: T.text3, marginTop: 2 }}>Share a form; each submission creates a task in this project with the right fields filled in.</div></div>
            <button onClick={openNewForm} style={ftBtn(T.accent, "#fff")}>＋ New Form</button>
          </div>
          {projectForms.length === 0 ? (
            <div style={{ textAlign: "center", padding: "50px 0", color: T.text3 }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>📨</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: T.text2 }}>No forms yet</div>
              <div style={{ fontSize: 12, marginTop: 4 }}>Build an intake form to collect requests as tasks.</div>
            </div>
          ) : projectForms.map(f => (
            <div key={f.id} style={ftCard}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{f.name}</span>
                    <span style={{ fontSize: 9, padding: "1px 7px", borderRadius: 8, background: f.is_active ? "#22c55e20" : T.surface3, color: f.is_active ? "#22c55e" : T.text3, fontWeight: 700 }}>{f.is_active ? "ACTIVE" : "OFF"}</span>
                  </div>
                  {f.description && <div style={{ fontSize: 12, color: T.text3, marginTop: 3 }}>{f.description}</div>}
                  <div style={{ fontSize: 11, color: T.text3, marginTop: 8 }}>{(f.fields || []).length} field{(f.fields || []).length !== 1 ? "s" : ""} · {f.submit_count || 0} submission{(f.submit_count || 0) !== 1 ? "s" : ""}</div>
                </div>
                <div style={{ display: "flex", gap: 6, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <button onClick={() => openFillForm(f)} style={ftBtn(T.accentDim, T.accent, `1px solid ${T.accent}40`)}>Open</button>
                  <button onClick={() => copyFormLink(f)} style={ftBtn(T.surface2, T.text2, `1px solid ${T.border}`)}>🔗 Link</button>
                  <button onClick={() => toggleFormActive(f)} style={ftBtn(T.surface2, T.text2, `1px solid ${T.border}`)}>{f.is_active ? "Turn off" : "Turn on"}</button>
                  <button onClick={() => openEditForm(f)} style={ftBtn(T.surface2, T.text2, `1px solid ${T.border}`)}>Edit</button>
                  <button onClick={() => deleteForm(f.id)} style={{ ...S.iconBtn, color: T.red }} title="Delete">✕</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  ))();

  const ttEditorEl = (() => {
    const ed = ttEditor; if (!ed) return null;
    const td = ed.template_data;
    const items = td.subtasks || [];
    const sel = ed.selected || "__main";
    const isMain = sel === "__main";
    const lbl = { fontSize: 11, fontWeight: 600, color: T.text3, display: "block", marginBottom: 4 };
    const inp = { width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, outline: "none", boxSizing: "border-box" };
    const setTd = (patch) => setTtEditor(p => ({ ...p, template_data: { ...p.template_data, ...patch } }));
    const setItem = (id, patch) => setTtEditor(p => ({ ...p, template_data: { ...p.template_data, subtasks: (p.template_data.subtasks || []).map(x => x.id === id ? { ...x, ...patch } : x) } }));
    const cur = isMain ? td : (items.find(x => x.id === sel) || td);
    const setCur = (patch) => isMain ? setTd(patch) : setItem(sel, patch);
    const addItem = () => { const it = _ttItem({}); setTtEditor(p => ({ ...p, template_data: { ...p.template_data, subtasks: [...(p.template_data.subtasks || []), it] }, selected: it.id })); };
    const rmItem = (id) => setTtEditor(p => ({ ...p, template_data: { ...p.template_data, subtasks: (p.template_data.subtasks || []).filter(x => x.id !== id).map(x => ({ ...x, depends_on: (x.depends_on || []).filter(d => d !== id) })), depends_on: (p.template_data.depends_on || []).filter(d => d !== id) }, selected: p.selected === id ? "__main" : p.selected }));
    const selItem = (id) => setTtEditor(p => ({ ...p, selected: id }));
    const depOptions = [{ value: "__main", label: (td.title || ed.name || "Main task") }, ...items.map(x => ({ value: x.id, label: x.title || "Untitled subtask" }))].filter(o => o.value !== sel);
    const rowStyle = (active) => ({ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 7, cursor: "pointer", background: active ? T.accentDim : "transparent", marginBottom: 2 });
    return (
      <div onClick={() => setTtEditor(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 120, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div onClick={e => e.stopPropagation()} style={{ width: 880, maxWidth: "96vw", height: "86vh", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{ed.id ? "Edit Task Template" : "New Task Template"}</h3>
            <button onClick={() => setTtEditor(null)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 20 }}>×</button>
          </div>
          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
            <div style={{ width: 280, flexShrink: 0, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div style={{ padding: "14px 14px 10px" }}>
                <label style={lbl}>Template name *</label>
                <input value={ed.name} onChange={e => setTtEditor(p => ({ ...p, name: e.target.value }))} placeholder="e.g. New vendor onboarding" autoFocus style={inp} />
              </div>
              <div style={{ padding: "0 14px", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>Tasks</div>
              <div style={{ flex: 1, overflow: "auto", padding: "0 8px 10px" }}>
                <div onClick={() => selItem("__main")} style={rowStyle(isMain)}>
                  <span style={{ fontSize: 13 }}>◆</span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: isMain ? T.accent : T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{td.title || ed.name || "Main task"}</span>
                </div>
                {items.map(x => (
                  <div key={x.id} onClick={() => selItem(x.id)} style={{ ...rowStyle(sel === x.id), paddingLeft: 22 }}
                    onMouseEnter={e => e.currentTarget.querySelector(".rm")?.style.setProperty("opacity", "1")}
                    onMouseLeave={e => e.currentTarget.querySelector(".rm")?.style.setProperty("opacity", "0")}>
                    <span style={{ fontSize: 11, color: T.text3 }}>↳</span>
                    <span style={{ flex: 1, fontSize: 12, color: sel === x.id ? T.accent : T.text2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.title || "Untitled subtask"}</span>
                    {(x.assignee_id && profiles[x.assignee_id]) && <span style={{ width: 18, height: 18, borderRadius: 9, background: acol(x.assignee_id) + "30", color: acol(x.assignee_id), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 8, fontWeight: 700, flexShrink: 0 }}>{ini(x.assignee_id)}</span>}
                    <button className="rm" onClick={e => { e.stopPropagation(); rmItem(x.id); }} style={{ opacity: 0, background: "none", border: "none", color: T.red, cursor: "pointer", fontSize: 12, flexShrink: 0 }}>✕</button>
                  </div>
                ))}
                <button onClick={addItem} style={{ display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "8px 10px", marginTop: 4, borderRadius: 7, border: `1px dashed ${T.border}`, background: "none", color: T.text3, fontSize: 12, cursor: "pointer" }}>+ Add subtask</button>
              </div>
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: "16px 20px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 }}>{isMain ? "Main task" : "Subtask"}</div>
              <div style={{ marginBottom: 12 }}><label style={lbl}>{isMain ? "Task title" : "Subtask title"}</label><input value={cur.title || ""} onChange={e => setCur({ title: e.target.value })} placeholder={isMain ? "Defaults to template name" : "Subtask title"} style={inp} /></div>
              <div style={{ marginBottom: 12 }}><label style={lbl}>Description</label><textarea value={cur.description || ""} onChange={e => setCur({ description: e.target.value })} rows={3} placeholder="Instructions or context…" style={{ ...inp, resize: "vertical", fontFamily: "inherit" }} /></div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div><label style={lbl}>Priority</label><SearchableMultiSelect multi={false} placeholder="Priority" options={priorityOpts()} selected={cur.priority || "none"} onChange={v => setCur({ priority: v })} /></div>
                <div><label style={lbl}>Assignee</label><SearchableMultiSelect multi={false} placeholder="Unassigned" options={[{ value: "", label: "Unassigned", icon: "✕" }, ...memberOpts()]} selected={cur.assignee_id || ""} onChange={v => setCur({ assignee_id: v })} /></div>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
                <div><label style={lbl}>Starts (days from use)</label><input type="number" value={cur.start_in_days ?? ""} onChange={e => setCur({ start_in_days: e.target.value })} placeholder="e.g. 0" style={inp} /></div>
                <div><label style={lbl}>Due (days from use)</label><input type="number" value={cur.due_in_days ?? ""} onChange={e => setCur({ due_in_days: e.target.value })} placeholder="e.g. 7" style={inp} /></div>
              </div>
              <div style={{ marginBottom: 12 }}><label style={lbl}>Collaborators</label><SearchableMultiSelect multi={true} placeholder="Add collaborators…" options={memberOpts()} selected={Array.isArray(cur.collaborator_ids) ? cur.collaborator_ids : []} onChange={v => setCur({ collaborator_ids: v })} /></div>
              {isMain && <div style={{ marginBottom: 12 }}><label style={lbl}>Section</label><SearchableMultiSelect multi={false} placeholder="First section" options={[{ value: "", label: "First section" }, ...sectionOpts()]} selected={cur.section_id || ""} onChange={v => setCur({ section_id: v })} /></div>}
              <div style={{ marginBottom: 12 }}><label style={lbl}>Blocked by (dependencies)</label>{depOptions.length ? <SearchableMultiSelect multi={true} placeholder="Tasks that must finish first…" options={depOptions} selected={(cur.depends_on || []).filter(d => depOptions.some(o => o.value === d))} onChange={v => setCur({ depends_on: v })} /> : <div style={{ fontSize: 12, color: T.text3 }}>Add other subtasks to set dependencies.</div>}</div>
            </div>
          </div>
          <div style={{ padding: "12px 20px", borderTop: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 11, color: T.text3 }}>{items.length} subtask{items.length === 1 ? "" : "s"} · dates & dependencies are relative to when the template is used</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setTtEditor(null)} style={ftBtn(T.surface3, T.text2)}>Cancel</button>
              <button onClick={saveTaskTemplate} style={ftBtn(T.accent, "#fff")}>{ed.id ? "Save Changes" : "Create Template"}</button>
            </div>
          </div>
        </div>
      </div>
    );
  })();

  const formEditorEl = (() => {
    const ed = formEditor; if (!ed) return null;
    const lbl = { fontSize: 11, fontWeight: 600, color: T.text3, display: "block", marginBottom: 4 };
    const inp = { width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, outline: "none", boxSizing: "border-box" };
    const setF = (patch) => setFormEditor(p => ({ ...p, ...patch }));
    const setField = (idx, patch) => setF({ fields: ed.fields.map((f, i) => i === idx ? { ...f, ...patch } : f) });
    const addField = (ft) => setF({ fields: [...ed.fields, { id: "f_" + Math.random().toString(36).slice(2, 8), label: ft.label, maps_to: ft.maps_to, required: false, help: "", ...((ft.maps_to === "single_select" || ft.maps_to === "multi_select") ? { options: ["Option 1", "Option 2"] } : {}) }] });
    const rmField = (idx) => setF({ fields: ed.fields.filter((_, i) => i !== idx) });
    const moveField = (idx, dir) => { const j = idx + dir; if (j < 1 || j >= ed.fields.length) return; const arr = [...ed.fields]; [arr[idx], arr[j]] = [arr[j], arr[idx]]; setF({ fields: arr }); };
    return (
      <div onClick={() => setFormEditor(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 120, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div onClick={e => e.stopPropagation()} style={{ width: 640, maxWidth: "94vw", maxHeight: "90vh", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "18px 22px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{ed.id ? "Edit Form" : "New Form"}</h3>
            <button onClick={() => setFormEditor(null)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 20 }}>×</button>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: "16px 22px" }}>
            <div style={{ marginBottom: 12 }}><label style={lbl}>Form name *</label><input value={ed.name} onChange={e => setF({ name: e.target.value })} placeholder="e.g. Creative request" autoFocus style={inp} /></div>
            <div style={{ marginBottom: 12 }}><label style={lbl}>Intro / description</label><textarea value={ed.description} onChange={e => setF({ description: e.target.value })} rows={2} placeholder="Shown at the top of the form" style={{ ...inp, resize: "vertical", fontFamily: "inherit" }} /></div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 12, marginBottom: 8 }}>
              <div><label style={lbl}>New tasks go to</label><SearchableMultiSelect multi={false} placeholder="First section" options={[{ value: "", label: "First section" }, ...sectionOpts()]} selected={ed.target_section_id || ""} onChange={v => setF({ target_section_id: v })} /></div>
              <div><label style={lbl}>Default assignee</label><SearchableMultiSelect multi={false} placeholder="Unassigned" options={[{ value: "", label: "Unassigned", icon: "✕" }, ...memberOpts()]} selected={ed.default_assignee_id || ""} onChange={v => setF({ default_assignee_id: v })} /></div>
              <div><label style={lbl}>Default priority</label><SearchableMultiSelect multi={false} placeholder="Priority" options={priorityOpts()} selected={ed.default_priority || "none"} onChange={v => setF({ default_priority: v })} /></div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, margin: "6px 0 14px" }}>
              <div onClick={() => setF({ is_active: !ed.is_active })} style={{ width: 34, height: 19, borderRadius: 10, background: ed.is_active !== false ? T.green : T.surface3, position: "relative", cursor: "pointer", flexShrink: 0 }}><div style={{ width: 15, height: 15, borderRadius: 8, background: "#fff", position: "absolute", top: 2, left: ed.is_active !== false ? 17 : 2, transition: "left 0.15s" }} /></div>
              <span style={{ fontSize: 12, color: T.text2 }}>Form is {ed.is_active !== false ? "active — accepting submissions" : "off"}</span>
            </div>
            <div style={{ borderTop: `1px solid ${T.border}`, paddingTop: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}><label style={{ ...lbl, marginBottom: 0 }}>Fields</label></div>
              {ed.fields.map((f, i) => { const isSelect = f.maps_to === "single_select" || f.maps_to === "multi_select"; return (
                <div key={f.id} style={{ marginBottom: 8, padding: "8px 10px", borderRadius: 8, background: T.surface2, border: `1px solid ${T.border}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 6, background: T.surface3, color: T.text3, fontWeight: 700, flexShrink: 0, minWidth: 62, textAlign: "center" }}>{({ title: "TITLE", description: "DESC", assignee: "PERSON", due_date: "DATE", priority: "PRIORITY", section: "SECTION", note_short: "TEXT", note_long: "PARAGRAPH", single_select: "SELECT", multi_select: "MULTI", attachments: "FILES" })[f.maps_to] || f.maps_to}</span>
                    <input value={f.label} onChange={e => setField(i, { label: e.target.value })} placeholder="Question label" style={{ flex: 1, padding: "5px 8px", borderRadius: 5, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontSize: 12, outline: "none" }} />
                    <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: T.text3, cursor: f.maps_to === "title" ? "default" : "pointer", flexShrink: 0 }}>
                      <input type="checkbox" checked={!!f.required} disabled={f.maps_to === "title"} onChange={e => setField(i, { required: e.target.checked })} /> req
                    </label>
                    {f.maps_to !== "title" ? (<>
                      <button onClick={() => moveField(i, -1)} disabled={i <= 1} style={{ background: "none", border: "none", color: i <= 1 ? T.text3 : T.text2, cursor: i <= 1 ? "default" : "pointer", fontSize: 13 }}>↑</button>
                      <button onClick={() => moveField(i, 1)} disabled={i === ed.fields.length - 1} style={{ background: "none", border: "none", color: i === ed.fields.length - 1 ? T.text3 : T.text2, cursor: "pointer", fontSize: 13 }}>↓</button>
                      <button onClick={() => rmField(i)} style={{ background: "none", border: "none", color: T.red, cursor: "pointer", fontSize: 13 }}>✕</button>
                    </>) : <span style={{ width: 54 }} />}
                  </div>
                  <input value={f.help || ""} onChange={e => setField(i, { help: e.target.value })} placeholder="Description / instructions (optional)" style={{ width: "100%", marginTop: 6, padding: "5px 8px", borderRadius: 5, border: `1px solid ${T.border}`, background: T.surface, color: T.text2, fontSize: 11, outline: "none", boxSizing: "border-box" }} />
                  {isSelect && <input value={(f.options || []).join(", ")} onChange={e => setField(i, { options: e.target.value.split(",").map(x => x.trim()).filter(Boolean) })} placeholder="Options (comma-separated)" style={{ width: "100%", marginTop: 6, padding: "5px 8px", borderRadius: 5, border: `1px solid ${T.accent}40`, background: T.surface, color: T.text, fontSize: 11, outline: "none", boxSizing: "border-box" }} />}
                </div>
              ); })}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
                {FORM_FIELD_TYPES.map(ft => (
                  <button key={ft.maps_to} onClick={() => addField(ft)} style={{ padding: "5px 10px", borderRadius: 6, border: `1px dashed ${T.border}`, background: "none", color: T.text2, fontSize: 11, cursor: "pointer" }}>+ {ft.label}</button>
                ))}
              </div>
            </div>
            {ed.id && ed.public_token && (
              <div style={{ marginTop: 16, padding: "10px 12px", borderRadius: 8, background: T.surface2, border: `1px solid ${T.border}`, fontSize: 11, color: T.text3, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Share link: {`${(typeof window !== "undefined" ? window.location.origin : "")}/?form=${ed.public_token}`}</span>
                <button onClick={() => copyFormLink(ed)} style={ftBtn(T.accentDim, T.accent, `1px solid ${T.accent}40`)}>Copy</button>
              </div>
            )}
          </div>
          <div style={{ padding: "14px 22px", borderTop: `1px solid ${T.border}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button onClick={() => setFormEditor(null)} style={ftBtn(T.surface3, T.text2)}>Cancel</button>
            <button onClick={saveForm} style={ftBtn(T.accent, "#fff")}>{ed.id ? "Save Changes" : "Create Form"}</button>
          </div>
        </div>
      </div>
    );
  })();

  const fillFormEl = (() => {
    const ff = fillingForm; if (!ff) return null;
    const { form, values } = ff;
    const setVal = (id, v) => setFillingForm(p => ({ ...p, values: { ...p.values, [id]: v } }));
    const inp = { width: "100%", padding: "8px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, outline: "none", boxSizing: "border-box" };
    return (
      <div onClick={() => setFillingForm(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 130, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div onClick={e => e.stopPropagation()} style={{ width: 520, maxWidth: "94vw", maxHeight: "90vh", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, boxShadow: "0 20px 60px rgba(0,0,0,0.3)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
          <div style={{ padding: "18px 22px", borderBottom: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
            <div><h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{form.name}</h3>{form.description && <div style={{ fontSize: 12, color: T.text3, marginTop: 4 }}>{form.description}</div>}</div>
            <button onClick={() => setFillingForm(null)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 20 }}>×</button>
          </div>
          <div style={{ flex: 1, overflow: "auto", padding: "16px 22px" }}>
            {(form.fields || []).map(f => (
              <div key={f.id} style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: T.text2, display: "block", marginBottom: f.help ? 2 : 5 }}>{f.label}{f.required && <span style={{ color: T.red }}> *</span>}</label>
                {f.help && <div style={{ fontSize: 11, color: T.text3, marginBottom: 6, whiteSpace: "pre-wrap", lineHeight: 1.4 }}>{f.help}</div>}
                {f.maps_to === "description" || f.maps_to === "note_long" ? (
                  <textarea value={values[f.id] || ""} onChange={e => setVal(f.id, e.target.value)} rows={3} style={{ ...inp, resize: "vertical", fontFamily: "inherit" }} />
                ) : f.maps_to === "assignee" ? (
                  <SearchableMultiSelect multi={false} placeholder="Select person" options={memberOpts()} selected={values[f.id] || ""} onChange={v => setVal(f.id, v)} />
                ) : f.maps_to === "priority" ? (
                  <SearchableMultiSelect multi={false} placeholder="Select priority" options={priorityOpts()} selected={values[f.id] || ""} onChange={v => setVal(f.id, v)} />
                ) : f.maps_to === "section" ? (
                  <SearchableMultiSelect multi={false} placeholder="Select section" options={sectionOpts()} selected={values[f.id] || ""} onChange={v => setVal(f.id, v)} />
                ) : f.maps_to === "single_select" ? (
                  <SearchableMultiSelect multi={false} placeholder="Select…" options={(f.options || []).map(o => ({ value: o, label: o }))} selected={values[f.id] || ""} onChange={v => setVal(f.id, v)} />
                ) : f.maps_to === "multi_select" ? (
                  <SearchableMultiSelect multi={true} placeholder="Select…" options={(f.options || []).map(o => ({ value: o, label: o }))} selected={Array.isArray(values[f.id]) ? values[f.id] : []} onChange={v => setVal(f.id, v)} />
                ) : f.maps_to === "attachments" ? (
                  <div><input type="file" multiple onChange={e => setVal(f.id, Array.from(e.target.files || []))} style={{ fontSize: 12, color: T.text2 }} />{Array.isArray(values[f.id]) && values[f.id].length > 0 && <div style={{ fontSize: 11, color: T.text3, marginTop: 4 }}>{values[f.id].map(x => x.name).join(", ")}</div>}</div>
                ) : f.maps_to === "due_date" ? (
                  <input type="date" value={values[f.id] || ""} onChange={e => setVal(f.id, e.target.value)} style={{ ...inp, cursor: "pointer" }} />
                ) : (
                  <input value={values[f.id] || ""} onChange={e => setVal(f.id, e.target.value)} style={inp} />
                )}
              </div>
            ))}
          </div>
          <div style={{ padding: "14px 22px", borderTop: `1px solid ${T.border}`, display: "flex", justifyContent: "flex-end", gap: 8 }}>
            <button onClick={() => setFillingForm(null)} style={ftBtn(T.surface3, T.text2)}>Cancel</button>
            <button onClick={submitForm} style={ftBtn(T.accent, "#fff")}>Submit → Create Task</button>
          </div>
        </div>
      </div>
    );
  })();


  // MAIN RENDER
  return (
    <div onClick={() => ctxProject && setCtxProject(null)} style={{ display: "flex", height: "100%", background: T.bg, overflow: "hidden" }}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}@keyframes slideIn{from{transform:translateX(20px);opacity:0}to{transform:translateX(0);opacity:1}}`}</style>
      {/* Keyboard shortcuts help */}
      {showKeyboardHelp && (
        <div onClick={() => setShowKeyboardHelp(false)} style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} />
          <div onClick={e => e.stopPropagation()} style={{ position: "relative", width: "min(420px, 95vw)", background: T.surface, borderRadius: 14, border: `1px solid ${T.border}`, padding: 28, zIndex: 301, boxShadow: "0 20px 60px rgba(0,0,0,0.4)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Keyboard Shortcuts</h3>
              <button onClick={() => setShowKeyboardHelp(false)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 18 }}>×</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 4 }}>
              {[
                ["J / ↓", "Next task"],
                ["K / ↑", "Previous task"],
                ["Space", "Toggle done"],
                ["Enter", "Open task detail"],
                ["N", "New task"],
                ["Tab → N", "New section"],
                ["F", "Focus search"],
                ["1", "List view"],
                ["2", "Board view"],
                ["3", "Timeline view"],
                ["Esc", "Close / deselect"],
                ["?", "Show this help"],
              ].map(([key, desc]) => (
                <div key={key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 0", borderBottom: `1px solid ${T.border}20` }}>
                  <kbd style={{ padding: "2px 7px", borderRadius: 5, border: `1px solid ${T.border}`, background: T.surface2, fontSize: 11, fontFamily: "monospace", color: T.accent, fontWeight: 700, minWidth: 40, textAlign: "center", flexShrink: 0 }}>{key}</kbd>
                  <span style={{ fontSize: 13, color: T.text2 }}>{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {toast && <div style={{ position: "fixed", top: 16, right: 16, zIndex: 200, padding: "10px 16px", borderRadius: 8, background: toast.type === "success" ? T.greenDim : T.redDim, color: toast.type === "success" ? T.green : T.red, fontSize: 13, fontWeight: 500, boxShadow: "0 4px 16px rgba(0,0,0,0.2)", animation: "slideIn 0.2s ease" }}>{toast.msg}</div>}

      {/* Section context menu */}
      {sectionCtxMenu && (() => {
        const sec = projSections.find(s => s.id === sectionCtxMenu.secId);
        if (!sec) return null;
        return (
          <div onClick={() => setSectionCtxMenu(null)} style={{ position: "fixed", inset: 0, zIndex: 300 }}>
            <div onClick={e => e.stopPropagation()} style={{ position: "fixed", left: Math.min(sectionCtxMenu.x, window.innerWidth - 220), top: Math.min(sectionCtxMenu.y, window.innerHeight - 280), width: 210, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, boxShadow: "0 12px 40px rgba(0,0,0,0.4)", padding: 6, zIndex: 301 }}>
              <div style={{ padding: "6px 10px 4px", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.8 }}>{sec.name}</div>

              {/* WIP limit */}
              <div style={{ padding: "8px 10px", borderBottom: `1px solid ${T.border}` }}>
                <div style={{ fontSize: 11, color: T.text2, fontWeight: 600, marginBottom: 6 }}>WIP Limit</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <input type="number" placeholder="None" defaultValue={sec.wip_limit || ""} min="0"
                    onChange={e => setWipLimitInput(e.target.value)}
                    style={{ flex: 1, padding: "4px 8px", borderRadius: 5, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 12, outline: "none" }} />
                  <button onClick={async () => {
                    const val = wipLimitInput === "" ? null : parseInt(wipLimitInput, 10) || null;
                    await supabase.from("sections").update({ wip_limit: val }).eq("id", sec.id);
                    setProjSections(p => p.map(s => s.id === sec.id ? { ...s, wip_limit: val } : s));
                    setSectionCtxMenu(null);
                  }} style={{ padding: "4px 10px", borderRadius: 5, background: T.accent, color: "#fff", border: "none", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>Set</button>
                </div>
                {sec.wip_limit && <button onClick={async () => {
                  await supabase.from("sections").update({ wip_limit: null }).eq("id", sec.id);
                  setProjSections(p => p.map(s => s.id === sec.id ? { ...s, wip_limit: null } : s));
                  setSectionCtxMenu(null);
                }} style={{ fontSize: 10, color: T.text3, background: "none", border: "none", cursor: "pointer", marginTop: 4 }}>Clear limit</button>}
              </div>

              {/* Toggle done column */}
              {[
                { label: sec.is_complete_column ? "✓ Mark as NOT done column" : "Mark as done column", action: async () => {
                  const val = !sec.is_complete_column;
                  await supabase.from("sections").update({ is_complete_column: val }).eq("id", sec.id);
                  setProjSections(p => p.map(s => s.id === sec.id ? { ...s, is_complete_column: val } : s));
                  setSectionCtxMenu(null);
                }},
                { label: "Collapse all sections", action: () => {
                  const all = {};
                  projSections.forEach(s => { all[s.id] = true; });
                  setCollapsed(all);
                  setSectionCtxMenu(null);
                }},
                { label: "Expand all sections", action: () => {
                  setCollapsed({});
                  setSectionCtxMenu(null);
                }},
                { label: "Delete section", action: () => { deleteSection(sec.id); setSectionCtxMenu(null); }, danger: true },
              ].map((item, i) => (
                <div key={i} onClick={item.action}
                  style={{ padding: "8px 10px", fontSize: 12, color: item.danger ? T.red : T.text2, borderRadius: 6, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, marginTop: 2 }}
                  onMouseEnter={e => e.currentTarget.style.background = T.surface3}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  {item.label}
                </div>
              ))}
            </div>
          </div>
        );
      })()}
      <ProjectSidebar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {showMyTasks ? (
          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
            {myTasksViewEl}
            {detailPane}
          </div>
        ) : proj ? (<>
          {projectHeaderEl}
          {viewMode !== "Info" && filterBarEl}
          <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {viewMode === "Info" && (
                <div style={{ flex: 1, overflow: "auto", padding: "24px 28px", maxWidth: isMobile ? "95vw" : 700 }}>
                  {/* Quick actions */}
                  <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
                    <button onClick={openEditProject} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface2, color: T.text2, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18.4 2.6a2.17 2.17 0 013 3L12 15l-4 1 1-4 9.4-9.4z"/></svg> Edit Project
                    </button>
                    <button onClick={() => { setStatusForm({ health: projHealth, summary: "", highlights: "", blockers: "" }); setShowStatusForm(true); }}
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 16px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface2, color: T.text2, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                      📋 Post Status Update
                    </button>
                  </div>

                  {/* Description */}
                  {proj.description && (
                    <div style={{ marginBottom: 24 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Description</div>
                      <div style={{ fontSize: 14, color: T.text, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{proj.description}</div>
                    </div>
                  )}

                  {/* Details grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "140px 1fr", gap: "14px 16px", marginBottom: 28 }}>
                    <div style={{ fontSize: 12, color: T.text3, fontWeight: 600 }}>Status</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 8, height: 8, borderRadius: 4, background: healthColors[projHealth] }} />
                      <span style={{ fontSize: 13, color: healthColors[projHealth], fontWeight: 600 }}>{healthLabels[projHealth]}</span>
                    </div>

                    <div style={{ fontSize: 12, color: T.text3, fontWeight: 600 }}>Progress</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ flex: 1, maxWidth: 200, height: 6, borderRadius: 3, background: T.surface3, overflow: "hidden" }}>
                        <div style={{ width: `${progress}%`, height: "100%", borderRadius: 3, background: proj.color || T.accent, transition: "width 0.3s" }} />
                      </div>
                      <span style={{ fontSize: 12, color: T.text2, fontWeight: 600 }}>{progress}%</span>
                      <span style={{ fontSize: 11, color: T.text3 }}>{doneCount}/{projTasks.length} tasks done</span>
                    </div>

                    <div style={{ fontSize: 12, color: T.text3, fontWeight: 600 }}>Owner</div>
                    <div style={{ fontSize: 13, color: T.text }}>{proj.owner_id ? (profiles[proj.owner_id]?.display_name || "Unknown") : <span style={{ color: T.text3 }}>Unassigned</span>}</div>

                    {proj.team_id && <>
                      <div style={{ fontSize: 12, color: T.text3, fontWeight: 600 }}>Team</div>
                      <div style={{ fontSize: 13, color: T.text }}>{teams.find(t => t.id === proj.team_id)?.name || "—"}</div>
                    </>}

                    <div style={{ fontSize: 12, color: T.text3, fontWeight: 600 }}>Visibility</div>
                    <div style={{ fontSize: 13, color: T.text }}>{{ private: "🔒 Private", team: "👥 Team", public: "🌐 Public" }[proj.visibility] || proj.visibility || "Private"}</div>

                    <div style={{ fontSize: 12, color: T.text3, fontWeight: 600 }}>Color</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div style={{ width: 18, height: 18, borderRadius: 6, background: proj.color || T.accent, border: `1px solid ${T.border}` }} />
                      <span style={{ fontSize: 12, color: T.text3 }}>{proj.color || "#3b82f6"}</span>
                    </div>

                    {proj.start_date && <>
                      <div style={{ fontSize: 12, color: T.text3, fontWeight: 600 }}>Start Date</div>
                      <div style={{ fontSize: 13, color: T.text }}>{new Date(proj.start_date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</div>
                    </>}

                    {proj.target_end_date && <>
                      <div style={{ fontSize: 12, color: T.text3, fontWeight: 600 }}>Target End Date</div>
                      <div style={{ fontSize: 13, color: T.text }}>{new Date(proj.target_end_date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</div>
                    </>}

                    <div style={{ fontSize: 12, color: T.text3, fontWeight: 600 }}>Created</div>
                    <div style={{ fontSize: 13, color: T.text }}>{proj.created_at ? new Date(proj.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : "—"}</div>

                    <div style={{ fontSize: 12, color: T.text3, fontWeight: 600 }}>Default View</div>
                    <div style={{ fontSize: 13, color: T.text }}>{proj.default_view || "List"}</div>
                  </div>

                  {/* Linked OKR */}
                  {proj.objective_id && (() => {
                    const obj = objectives.find(o => o.id === proj.objective_id);
                    const kr = proj.key_result_id ? keyResultsForLink.find(k => k.id === proj.key_result_id) : null;
                    if (!obj) return null;
                    const krsForObj = keyResultsForLink.filter(k => k.objective_id === obj.id);
                    return (
                      <div style={{ padding: "16px 18px", borderRadius: 10, background: T.accentDim, border: `1px solid ${T.accent}30`, marginBottom: 20 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Linked OKR</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: kr ? 10 : 0 }}>
                          <span style={{ fontSize: 16 }}>◎</span>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: T.accent }}>{obj.title}</div>
                            {obj.time_frame && <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>{obj.time_frame}</div>}
                          </div>
                        </div>
                        {kr && (
                          <div style={{ marginLeft: 24, padding: "8px 12px", borderRadius: 6, background: T.surface, border: `1px solid ${T.border}` }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: 12 }}>◉</span>
                              <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{kr.title}</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6 }}>
                              <div style={{ flex: 1, maxWidth: 160, height: 4, borderRadius: 2, background: T.surface3 }}>
                                <div style={{ width: `${Math.min(100, Math.round(kr.progress || 0))}%`, height: "100%", borderRadius: 2, background: T.accent }} />
                              </div>
                              <span style={{ fontSize: 11, color: T.text3, fontWeight: 600 }}>{Math.round(kr.progress || 0)}%</span>
                              <span style={{ fontSize: 10, color: T.text3 }}>{kr.current_value || 0}/{kr.target_value || 100}{kr.unit ? " " + kr.unit : ""}</span>
                            </div>
                          </div>
                        )}
                        {!kr && krsForObj.length > 0 && (
                          <div style={{ marginLeft: 24, marginTop: 6 }}>
                            {krsForObj.slice(0, 4).map(k => (
                              <div key={k.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "3px 0", fontSize: 11, color: T.text2 }}>
                                <span style={{ width: 4, height: 4, borderRadius: 2, background: T.text3, flexShrink: 0 }} />
                                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{k.title}</span>
                                <span style={{ color: T.text3, flexShrink: 0 }}>{Math.round(k.progress || 0)}%</span>
                              </div>
                            ))}
                          </div>
                        )}
                        <button onClick={openEditProject} style={{ marginTop: 10, fontSize: 11, color: T.accent, background: "none", border: "none", cursor: "pointer", padding: 0, fontWeight: 600 }}>Change linked OKR →</button>
                      </div>
                    );
                  })()}

                  {/* Overdue warning */}
                  {projOverdue.length > 0 && (
                    <div style={{ padding: "14px 16px", borderRadius: 10, background: "#ef444410", border: "1px solid #ef444430", marginBottom: 20 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#ef4444", marginBottom: 6 }}>⚠ {projOverdue.length} Overdue Task{projOverdue.length !== 1 ? "s" : ""}</div>
                      {projOverdue.slice(0, 5).map(t => (
                        <div key={t.id} onClick={() => { setViewMode("List"); setTimeout(() => setSelectedTask(t), 100); }}
                          style={{ fontSize: 12, color: T.text2, padding: "4px 0", cursor: "pointer" }}
                          onMouseEnter={e => e.currentTarget.style.color = T.accent} onMouseLeave={e => e.currentTarget.style.color = T.text2}>
                          · {t.title} <span style={{ color: T.text3 }}>— due {toDateStr(t.due_date)}</span>
                        </div>
                      ))}
                      {projOverdue.length > 5 && <div style={{ fontSize: 11, color: T.text3, marginTop: 4 }}>and {projOverdue.length - 5} more...</div>}
                    </div>
                  )}

                  {/* Recent status updates */}
                  {statusUpdates.length > 0 && (
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Recent Updates</div>
                      {statusUpdates.slice(0, 3).map(su => {
                        const suColor = { on_track: "#22c55e", at_risk: "#eab308", off_track: "#ef4444" }[su.status] || T.text3;
                        return (
                          <div key={su.id} style={{ padding: "12px 14px", borderRadius: 8, border: `1px solid ${T.border}`, marginBottom: 6, background: T.surface2 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                              <span style={{ width: 8, height: 8, borderRadius: 4, background: suColor }} />
                              <span style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{su.title}</span>
                              <span style={{ fontSize: 10, color: T.text3, marginLeft: "auto" }}>{new Date(su.created_at).toLocaleDateString()}</span>
                            </div>
                            {su.body && <div style={{ fontSize: 12, color: T.text3, lineHeight: 1.5, marginTop: 4 }}>{su.body.slice(0, 200)}{su.body.length > 200 ? "..." : ""}</div>}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Section breakdown */}
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>Sections</div>
                    {projSections.map((sec, si) => {
                      const st = projTasks.filter(t => t.section_id === sec.id && !t.parent_task_id);
                      const dn = st.filter(t => t.status === "done").length;
                      const pct = st.length ? Math.round((dn / st.length) * 100) : 0;
                      return (
                        <div key={sec.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${T.border}10` }}>
                          <span style={{ width: 10, height: 10, borderRadius: 3, background: secColor(si), flexShrink: 0 }} />
                          <span style={{ fontSize: 13, color: T.text, fontWeight: 500, flex: 1 }}>{sec.name}</span>
                          <div style={{ width: 80, height: 4, borderRadius: 2, background: T.surface3, overflow: "hidden" }}>
                            <div style={{ width: `${pct}%`, height: "100%", borderRadius: 2, background: secColor(si) }} />
                          </div>
                          <span style={{ fontSize: 11, color: T.text3, width: 50, textAlign: "right" }}>{dn}/{st.length}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              {viewMode === "List" && listViewEl}
              {viewMode === "Board" && boardViewEl}
              {viewMode === "Timeline" && timelineViewEl}
              {viewMode === "Calendar" && calendarViewEl}
              {viewMode === "Updates" && updatesViewEl}
              {viewMode === "Forms & Templates" && formsTemplatesViewEl}
              {viewMode === "Docs" && (!myAccessScope || myAccessScope.documents === true) && <DocsView key="docs" />}
              {viewMode === "Rules" && (
                <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                    <div>
                      <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: T.text }}>Rules</h3>
                      <div style={{ fontSize: 12, color: T.text3, marginTop: 2 }}>Automate actions when triggers fire on tasks in this project</div>
                    </div>
                    <button onClick={() => { setEditingRule(null); setRuleForm({ name: "", trigger_type: "task_moved_to_section", trigger_config: {}, actions: [] }); setShowRuleBuilder(true); }}
                      style={{ display: "flex", alignItems: "center", gap: 5, padding: "8px 16px", borderRadius: 8, border: "none", background: T.accent, color: "#fff", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                      <span style={{ fontSize: 16 }}>+</span> Add Rule
                    </button>
                  </div>

                  {rules.length === 0 ? (
                    <div style={{ textAlign: "center", padding: "60px 0", color: T.text3 }}>
                      <div style={{ fontSize: 40, marginBottom: 12 }}>⚡</div>
                      <div style={{ fontSize: 15, fontWeight: 600 }}>No rules yet</div>
                      <div style={{ fontSize: 13, marginTop: 4 }}>Create rules to automatically update tasks when things happen.</div>
                      <div style={{ fontSize: 12, marginTop: 16, color: T.text3, lineHeight: 1.8 }}>
                        Examples:<br/>
                        When a task moves to "Done" → mark it complete<br/>
                        When priority is set to "Urgent" → assign to team lead<br/>
                        When a task is created → set due date to 7 days from now
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {rules.map(rule => {
                        const trig = TRIGGER_TYPES.find(t => t.key === rule.trigger_type) || { label: rule.trigger_type, icon: "?" };
                        const trigDesc = (() => {
                          const tc = rule.trigger_config || {};
                          if (rule.trigger_type === "task_moved_to_section" && tc.section_id) { const s = projSections.find(s => s.id === tc.section_id); return s ? `"${s.name}"` : "any section"; }
                          if (rule.trigger_type === "status_changed" && tc.status) return `"${(STATUS[tc.status] || {}).label || tc.status}"`;
                          if (rule.trigger_type === "priority_changed" && tc.priority) return `"${(PRIORITY[tc.priority] || {}).label || tc.priority}"`;
                          if (rule.trigger_type === "task_assigned" && tc.assignee_id) return `"${profiles[tc.assignee_id]?.display_name || "someone"}"`;
                          if (rule.trigger_type === "due_date_approaching" && tc.days_before) return `${tc.days_before} day(s) before`;
                          return "";
                        })();

                        return (
                          <div key={rule.id} style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", borderRadius: 10, border: `1px solid ${rule.is_active ? T.border : T.border + "60"}`, background: rule.is_active ? T.surface : T.surface + "80", opacity: rule.is_active ? 1 : 0.6 }}>
                            {/* Toggle */}
                            <div onClick={() => toggleRule(rule.id)} style={{ width: 36, height: 20, borderRadius: 10, background: rule.is_active ? T.accent : T.surface3, cursor: "pointer", position: "relative", transition: "background 0.2s", flexShrink: 0 }}>
                              <div style={{ width: 16, height: 16, borderRadius: 8, background: "#fff", position: "absolute", top: 2, left: rule.is_active ? 18 : 2, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.3)" }} />
                            </div>

                            {/* Rule info */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 14, fontWeight: 600, color: T.text, marginBottom: 4 }}>{rule.name}</div>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: `${T.accent}15`, color: T.accent, fontWeight: 600 }}>
                                  {trig.icon} {trig.label} {trigDesc}
                                </span>
                                <span style={{ color: T.text3, fontSize: 11 }}>→</span>
                                {(rule.actions || []).map((a, ai) => {
                                  const act = ACTION_TYPES.find(t => t.key === a.type) || { label: a.type, icon: "?" };
                                  return (
                                    <span key={ai} style={{ fontSize: 11, padding: "2px 8px", borderRadius: 6, background: T.surface3, color: T.text2, fontWeight: 500 }}>
                                      {act.icon} {act.label}
                                    </span>
                                  );
                                })}
                              </div>
                              {rule.run_count > 0 && (
                                <div style={{ fontSize: 10, color: T.text3, marginTop: 4 }}>
                                  Ran {rule.run_count} time{rule.run_count !== 1 ? "s" : ""} · Last: {rule.last_run_at ? new Date(rule.last_run_at).toLocaleDateString() : "never"}
                                </div>
                              )}
                            </div>

                            {/* Actions */}
                            <div style={{ display: "flex", gap: 4 }}>
                              <button onClick={() => { setEditingRule(rule); setRuleForm({ name: rule.name, description: rule.description || "", trigger_type: rule.trigger_type, trigger_config: rule.trigger_config || {}, actions: rule.actions || [] }); setShowRuleBuilder(true); }}
                                style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 13, padding: 4 }}>✎</button>
                              <button onClick={() => deleteRule(rule.id)}
                                style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 13, padding: 4 }}>🗑</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Rule Builder Modal */}
                  {showRuleBuilder && (
                    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} onClick={() => setShowRuleBuilder(false)} />
                      <div style={{ position: "relative", width: 560, maxHeight: "85vh", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 14, boxShadow: "0 20px 60px rgba(0,0,0,0.4)", overflow: "auto", zIndex: 201 }}>
                        <div style={{ padding: "20px 24px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>{editingRule ? "Edit Rule" : "Create Rule"}</h3>
                          <button onClick={() => setShowRuleBuilder(false)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 18 }}>×</button>
                        </div>
                        <div style={{ padding: "20px 24px" }}>
                          {/* Name */}
                          <div style={{ marginBottom: 16 }}>
                            <label style={{ fontSize: 12, fontWeight: 600, color: T.text2, display: "block", marginBottom: 4 }}>Rule Name</label>
                            <input value={ruleForm.name} onChange={e => setRuleForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g., Auto-complete when moved to Done"
                              style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 13, outline: "none", boxSizing: "border-box" }} />
                          </div>

                          {/* Trigger */}
                          <div style={{ marginBottom: 16 }}>
                            <label style={{ fontSize: 12, fontWeight: 700, color: T.accent, display: "block", marginBottom: 8 }}>⚡ WHEN...</label>
                            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)", gap: 6 }}>
                              {TRIGGER_TYPES.map(t => (
                                <button key={t.key} onClick={() => setRuleForm(p => ({ ...p, trigger_type: t.key, trigger_config: {} }))}
                                  style={{ padding: "10px 12px", borderRadius: 8, border: ruleForm.trigger_type === t.key ? `2px solid ${T.accent}` : `1px solid ${T.border}`,
                                    background: ruleForm.trigger_type === t.key ? `${T.accent}10` : T.surface2, color: ruleForm.trigger_type === t.key ? T.accent : T.text2,
                                    fontSize: 12, fontWeight: 500, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 8 }}>
                                  <span style={{ fontSize: 14 }}>{t.icon}</span>{t.label}
                                </button>
                              ))}
                            </div>
                            {/* Trigger config */}
                            <div style={{ marginTop: 10 }}>
                              {ruleForm.trigger_type === "task_moved_to_section" && (
                                <SearchableMultiSelect
                                  options={projSections.map(s => ({ value: s.id, label: s.name, color: secColor(projSections.indexOf(s)) }))}
                                  selected={ruleForm.trigger_config.section_ids || (ruleForm.trigger_config.section_id ? [ruleForm.trigger_config.section_id] : [])}
                                  onChange={vals => setRuleForm(p => ({ ...p, trigger_config: { ...p.trigger_config, section_ids: vals, section_id: vals[0] || null } }))}
                                  placeholder="Any section" multi={true} />
                              )}
                              {ruleForm.trigger_type === "status_changed" && (
                                <SearchableMultiSelect
                                  options={Object.entries(STATUS).map(([k, v]) => ({ value: k, label: v.label, color: v.color }))}
                                  selected={ruleForm.trigger_config.statuses || (ruleForm.trigger_config.status ? [ruleForm.trigger_config.status] : [])}
                                  onChange={vals => setRuleForm(p => ({ ...p, trigger_config: { ...p.trigger_config, statuses: vals, status: vals[0] || null } }))}
                                  placeholder="Any status" multi={true} />
                              )}
                              {ruleForm.trigger_type === "priority_changed" && (
                                <SearchableMultiSelect
                                  options={Object.entries(PRIORITY).map(([k, v]) => ({ value: k, label: v.label, color: v.dot }))}
                                  selected={ruleForm.trigger_config.priorities || (ruleForm.trigger_config.priority ? [ruleForm.trigger_config.priority] : [])}
                                  onChange={vals => setRuleForm(p => ({ ...p, trigger_config: { ...p.trigger_config, priorities: vals, priority: vals[0] || null } }))}
                                  placeholder="Any priority" multi={true} />
                              )}
                              {ruleForm.trigger_type === "task_assigned" && (
                                <SearchableMultiSelect
                                  options={allProfiles.map(u => ({ value: u.id, label: u.display_name || u.email, icon: "👤" }))}
                                  selected={ruleForm.trigger_config.assignee_ids || (ruleForm.trigger_config.assignee_id ? [ruleForm.trigger_config.assignee_id] : [])}
                                  onChange={vals => setRuleForm(p => ({ ...p, trigger_config: { ...p.trigger_config, assignee_ids: vals, assignee_id: vals[0] || null } }))}
                                  placeholder="Anyone" multi={true} />
                              )}
                              {ruleForm.trigger_type === "due_date_approaching" && (
                                <input type="number" value={ruleForm.trigger_config.days_before || ""} onChange={e => setRuleForm(p => ({ ...p, trigger_config: { ...p.trigger_config, days_before: Number(e.target.value) || null } }))}
                                  placeholder="Days before due date" min="1" style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 12 }} />
                              )}
                            </div>
                          </div>

                          {/* Actions */}
                          <div style={{ marginBottom: 16 }}>
                            <label style={{ fontSize: 12, fontWeight: 700, color: "#22c55e", display: "block", marginBottom: 8 }}>✓ THEN...</label>
                            {ruleForm.actions.map((action, ai) => {
                              const act = ACTION_TYPES.find(t => t.key === action.type);
                              return (
                                <div key={ai} style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, padding: "10px 12px", borderRadius: 8, background: T.surface2, border: `1px solid ${T.border}` }}>
                                  <span style={{ fontSize: 12, fontWeight: 600, color: T.text2, width: 24, textAlign: "center" }}>{ai + 1}.</span>
                                  <select value={action.type} onChange={e => { const nw = [...ruleForm.actions]; nw[ai] = { type: e.target.value, config: {} }; setRuleForm(p => ({ ...p, actions: nw })); }}
                                    style={{ flex: 1, padding: "5px 8px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontSize: 12 }}>
                                    {ACTION_TYPES.map(a => <option key={a.key} value={a.key}>{a.icon} {a.label}</option>)}
                                  </select>
                                  {/* Action config */}
                                  {action.type === "set_status" && (
                                    <div style={{ width: 140 }}>
                                      <SearchableMultiSelect multi={false}
                                        options={Object.entries(STATUS).map(([k, v]) => ({ value: k, label: v.label, color: v.color }))}
                                        selected={action.config?.status || ""}
                                        onChange={val => { const nw = [...ruleForm.actions]; nw[ai] = { ...nw[ai], config: { status: val } }; setRuleForm(p => ({ ...p, actions: nw })); }}
                                        placeholder="Pick..." />
                                    </div>
                                  )}
                                  {action.type === "move_to_section" && (
                                    <div style={{ width: 140 }}>
                                      <SearchableMultiSelect multi={false}
                                        options={projSections.map(s => ({ value: s.id, label: s.name }))}
                                        selected={action.config?.section_id || ""}
                                        onChange={val => { const nw = [...ruleForm.actions]; nw[ai] = { ...nw[ai], config: { section_id: val } }; setRuleForm(p => ({ ...p, actions: nw })); }}
                                        placeholder="Pick..." />
                                    </div>
                                  )}
                                  {action.type === "set_assignee" && (
                                    <div style={{ width: 140 }}>
                                      <SearchableMultiSelect multi={false}
                                        options={allProfiles.map(u => ({ value: u.id, label: u.display_name || u.email, icon: "👤" }))}
                                        selected={action.config?.assignee_id || ""}
                                        onChange={val => { const nw = [...ruleForm.actions]; nw[ai] = { ...nw[ai], config: { assignee_id: val || null } }; setRuleForm(p => ({ ...p, actions: nw })); }}
                                        placeholder="Pick..." />
                                    </div>
                                  )}
                                  {action.type === "set_priority" && (
                                    <div style={{ width: 140 }}>
                                      <SearchableMultiSelect multi={false}
                                        options={Object.entries(PRIORITY).map(([k, v]) => ({ value: k, label: v.label, color: v.dot }))}
                                        selected={action.config?.priority || ""}
                                        onChange={val => { const nw = [...ruleForm.actions]; nw[ai] = { ...nw[ai], config: { priority: val } }; setRuleForm(p => ({ ...p, actions: nw })); }}
                                        placeholder="Pick..." />
                                    </div>
                                  )}
                                  {action.type === "add_comment" && (
                                    <input value={action.config?.comment || ""} onChange={e => { const nw = [...ruleForm.actions]; nw[ai] = { ...nw[ai], config: { comment: e.target.value } }; setRuleForm(p => ({ ...p, actions: nw })); }}
                                      placeholder="Comment text..." style={{ width: 160, padding: "5px 8px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontSize: 11 }} />
                                  )}
                                  {action.type === "set_due_date_offset" && (
                                    <input type="number" value={action.config?.days_offset || ""} onChange={e => { const nw = [...ruleForm.actions]; nw[ai] = { ...nw[ai], config: { days_offset: Number(e.target.value) } }; setRuleForm(p => ({ ...p, actions: nw })); }}
                                      placeholder="Days" style={{ width: 80, padding: "5px 8px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface, color: T.text, fontSize: 11 }} />
                                  )}
                                  <button onClick={() => setRuleForm(p => ({ ...p, actions: p.actions.filter((_, i) => i !== ai) }))}
                                    style={{ background: "none", border: "none", color: T.red, cursor: "pointer", fontSize: 14, padding: "0 4px" }}>×</button>
                                </div>
                              );
                            })}
                            <button onClick={() => setRuleForm(p => ({ ...p, actions: [...p.actions, { type: "set_status", config: {} }] }))}
                              style={{ width: "100%", padding: "8px", borderRadius: 8, border: `2px dashed ${T.border}`, background: "transparent", color: T.text3, fontSize: 12, cursor: "pointer", fontWeight: 500 }}>
                              + Add Action
                            </button>
                          </div>
                        </div>

                        {/* Footer */}
                        <div style={{ padding: "14px 24px", borderTop: `1px solid ${T.border}`, display: "flex", gap: 8, justifyContent: "flex-end" }}>
                          <button onClick={() => setShowRuleBuilder(false)} style={{ padding: "8px 16px", borderRadius: 8, background: T.surface3, color: T.text2, border: "none", fontSize: 13, cursor: "pointer" }}>Cancel</button>
                          <button onClick={saveRule} disabled={!ruleForm.name.trim() || ruleForm.actions.length === 0}
                            style={{ padding: "8px 20px", borderRadius: 8, border: "none", background: ruleForm.name.trim() && ruleForm.actions.length > 0 ? T.accent : T.surface3, color: ruleForm.name.trim() && ruleForm.actions.length > 0 ? "#fff" : T.text3, fontSize: 13, fontWeight: 600, cursor: ruleForm.name.trim() && ruleForm.actions.length > 0 ? "pointer" : "default" }}>
                            {editingRule ? "Update Rule" : "Create Rule"}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            {detailPane}
          </div>
        </>) : (
          <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: T.text3 }}>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 14, marginBottom: 4 }}>No project selected</div>
              <div style={{ fontSize: 12 }}>Select a project or create a new one</div>
              <button onClick={openNewProject} style={{ marginTop: 12, padding: "8px 16px", borderRadius: 6, background: T.accent, color: "#fff", border: "none", fontSize: 13, cursor: "pointer" }}>+ New Project</button>
            </div>
          </div>
        )}
      </div>
      {projectFormModalEl}
      {templatesModalEl}
      {templateManagerEl}
      {templateEditorEl}
      {showAsanaImport && <AsanaImportModal onClose={() => setShowAsanaImport(false)} onImported={(projId) => { setShowAsanaImport(false); try { if (projId) sessionStorage.setItem("helm_open_project", projId); } catch (_) {} window.location.reload(); }} />}
      {saveAsTemplateModalEl}
      {copyModalEl}
      {statusFormModalEl}
      {ttEditorEl}
      {formEditorEl}
      {fillFormEl}
      {showAddMember && activeProject && (() => {
        const currentMembers = projMembersList.filter(pm => pm.project_id === activeProject);
        const currentMemberIds = new Set(currentMembers.map(m => m.user_id));
        const availableProfiles = Object.values(profiles).filter(p => !currentMemberIds.has(p.id) && p.id !== proj?.owner_id);
        const addMember = async (uid) => {
          const { error } = await supabase.from("project_members").insert({ project_id: activeProject, user_id: uid, role: "member" });
          if (error) return;
          setProjMembersList(p => [...p, { project_id: activeProject, user_id: uid, role: "member" }]);
          // Notify the added user
          if (uid !== user?.id) {
            const projName = projects.find(p => p.id === activeProject)?.name || "a project";
            await supabase.from("notifications").insert({
              org_id: orgId, user_id: uid, type: "project_added",
              title: `${uname(user?.id)} added you to ${projName}`,
              body: "You've been added to a project",
              entity_type: "project", entity_id: activeProject,
              actor_id: user?.id, is_read: false, category: "assignment",
              metadata: { project_name: projName }
            });
          }
        };
        const removeMember = async (uid) => {
          await supabase.from("project_members").delete().eq("org_id", orgId).eq("project_id", activeProject).eq("user_id", uid);
          setProjMembersList(p => p.filter(pm => !(pm.project_id === activeProject && pm.user_id === uid)));
        };
        const updateMemberRole = async (uid, newRole) => {
          await supabase.from("project_members").update({ role: newRole }).eq("project_id", activeProject).eq("user_id", uid);
          setProjMembersList(p => p.map(pm => (pm.project_id === activeProject && pm.user_id === uid) ? { ...pm, role: newRole } : pm));
        };
        // Toggle a single access_scope key (tasks/documents/messages) for an
        // external collaborator on this project. Internal members ignore scope
        // entirely (RLS doesn't gate them) so this only fires for externals.
        const updateAccessScope = async (uid, key, value) => {
          const pm = projMembersList.find(x => x.project_id === activeProject && x.user_id === uid);
          const next = { ...(pm?.access_scope || {}), [key]: value };
          await supabase.from("project_members").update({ access_scope: next }).eq("project_id", activeProject).eq("user_id", uid);
          setProjMembersList(p => p.map(x => (x.project_id === activeProject && x.user_id === uid) ? { ...x, access_scope: next } : x));
        };
        return (
          <div onClick={() => setShowAddMember(false)} style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} />
            <div onClick={e => e.stopPropagation()} style={{ position: "relative", width: "min(420px, 95vw)", maxHeight: "70vh", background: T.surface, borderRadius: 14, border: `1px solid ${T.border}`, boxShadow: "0 20px 60px rgba(0,0,0,0.4)", zIndex: 201, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div style={{ padding: "16px 20px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>Project Members</div>
                  <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>{proj?.name}</div>
                </div>
                <button onClick={() => setShowAddMember(false)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 18 }}>×</button>
              </div>
              <div style={{ flex: 1, overflow: "auto", padding: "12px 20px" }}>
                {/* Current members */}
                <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>Current Members ({currentMembers.length + (proj?.owner_id ? 1 : 0)})</div>
                {proj?.owner_id && (() => {
                  const p = profiles[proj.owner_id]; const c = acol(proj.owner_id);
                  return <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
                    <div style={{ width: 30, height: 30, borderRadius: 15, background: `${c}20`, color: c, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>{ini(proj.owner_id)}</div>
                    <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 600 }}>{p?.display_name || "Unknown"}</div><div style={{ fontSize: 10, color: T.text3 }}>{p?.email}</div></div>
                    <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 8, background: T.accent + "20", color: T.accent, fontWeight: 700 }}>OWNER</span>
                  </div>;
                })()}
                {currentMembers.filter(m => m.user_id !== proj?.owner_id).map(m => {
                  const p = profiles[m.user_id]; const c = acol(m.user_id);
                  const isExt = !!p?.is_external || !!m.invited_as_external;
                  const role = m.role || "member";
                  const scope = m.access_scope || { tasks: true };
                  return <div key={m.user_id} style={{ padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <div style={{ width: 30, height: 30, borderRadius: 15, background: `${c}20`, color: c, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>{ini(m.user_id)}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p?.display_name || "Unknown"}</span>
                          {isExt && <span style={{ fontSize: 8, padding: "1px 5px", borderRadius: 3, background: "#f59e0b15", color: "#f59e0b", fontWeight: 700, letterSpacing: 0.5 }}>EXTERNAL</span>}
                        </div>
                        <div style={{ fontSize: 10, color: T.text3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p?.email}</div>
                      </div>
                      <select value={role} onChange={e => updateMemberRole(m.user_id, e.target.value)} style={{ fontSize: 10, padding: "3px 6px", border: `1px solid ${T.border}`, borderRadius: 5, background: T.surface2, color: T.text, outline: "none", cursor: "pointer" }}>
                        <option value="editor">Editor</option>
                        <option value="commenter">Commenter</option>
                        <option value="viewer">Viewer</option>
                        <option value="member">Member</option>
                      </select>
                      <button onClick={() => removeMember(m.user_id)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 11 }} title="Remove">✕</button>
                    </div>
                    {isExt && (
                      <div style={{ marginTop: 8, marginLeft: 40, padding: "6px 8px", background: T.surface2, borderRadius: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 9, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.5 }}>Access:</span>
                        {[
                          { key: "tasks", label: "Tasks" },
                          { key: "documents", label: "Docs" },
                          { key: "messages", label: "Messages" },
                        ].map(({ key, label }) => {
                          const on = scope[key] === true;
                          return (
                            <label key={key} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: on ? T.text : T.text3, cursor: "pointer", userSelect: "none" }}>
                              <input type="checkbox" checked={on} onChange={e => updateAccessScope(m.user_id, key, e.target.checked)}
                                style={{ width: 12, height: 12, cursor: "pointer", accentColor: T.accent }} />
                              {label}
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>;
                })}

                {/* Invite external collaborator by email */}
                <InviteExternalRow
                  projectId={activeProject}
                  orgId={orgId}
                  invitedBy={user?.id}
                  T={T}
                  onInvited={(member) => {
                    setProjMembersList(p => {
                      const filtered = p.filter(pm => !(pm.project_id === member.project_id && pm.user_id === member.user_id));
                      return [...filtered, member];
                    });
                    showToast("Invite sent", "success");
                  }}
                  onError={(msg) => showToast(msg)}
                />

                {/* Add new members */}
                {availableProfiles.length > 0 && <>
                  <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 16, marginBottom: 8 }}>Add Members</div>
                  <input value={memberSearch} onChange={e => setMemberSearch(e.target.value)} placeholder="Search by name or email…"
                    style={{ width: "100%", boxSizing: "border-box", padding: "8px 10px", marginBottom: 8, fontSize: 12, border: `1px solid ${T.border}`, borderRadius: 8, background: T.surface2 || T.bg, color: T.text, outline: "none", fontFamily: "inherit" }} />
                  {(() => {
                    const q = memberSearch.trim().toLowerCase();
                    const filtered = q
                      ? availableProfiles.filter(p => (p.display_name || "").toLowerCase().includes(q) || (p.email || "").toLowerCase().includes(q))
                      : availableProfiles;
                    if (filtered.length === 0) return <div style={{ fontSize: 12, color: T.text3, padding: "10px 0" }}>No people match “{memberSearch}”.</div>;
                    return filtered.map(p => {
                      const c = acol(p.id);
                      return <div key={p.id} onClick={() => addMember(p.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: `1px solid ${T.border}`, cursor: "pointer", borderRadius: 6 }}
                        onMouseEnter={e => e.currentTarget.style.background = T.surface2} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                        <div style={{ width: 30, height: 30, borderRadius: 15, background: `${c}20`, color: c, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>{ini(p.id)}</div>
                        <div style={{ flex: 1 }}><div style={{ fontSize: 13, fontWeight: 500 }}>{p.display_name}</div><div style={{ fontSize: 10, color: T.text3 }}>{p.email}</div></div>
                        <span style={{ fontSize: 11, color: T.accent, fontWeight: 600 }}>+ Add</span>
                      </div>;
                    });
                  })()}
                </>}
              </div>
            </div>
          </div>
        );
      })()}
      {profileCard && (
        <ProfileCardPopover
          userId={profileCard.userId}
          pos={profileCard}
          profilesMap={profiles}
          orgId={orgId}
          T={T}
          onClose={() => setProfileCard(null)}
        />
      )}
    </div>
  );
}


function StatusPill({ task, onUpdate, S }) {
  const st = STATUS[task.status] || STATUS.todo;
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <span onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer", background: st.bg, color: st.color }}>{st.label}</span>
      {open && (
        <Dropdown onClose={() => setOpen(false)}>
          {Object.entries(STATUS).map(([k, v]) => (
            <DropdownItem key={k} onClick={() => { onUpdate(task.id, "status", k); setOpen(false); }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: v.color, display: "inline-block", marginRight: 6 }} />{v.label}
            </DropdownItem>
          ))}
        </Dropdown>
      )}
    </div>
  );
}

function PriorityPill({ task, onUpdate, S }) {
  const pr = PRIORITY[task.priority] || PRIORITY.none;
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <span onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 10, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer", background: pr.bg, color: pr.color }}>{pr.label}</span>
      {open && (
        <Dropdown onClose={() => setOpen(false)}>
          {Object.entries(PRIORITY).map(([k, v]) => (
            <DropdownItem key={k} onClick={() => { onUpdate(task.id, "priority", k); setOpen(false); }}>
              <span style={{ width: 8, height: 8, borderRadius: 4, background: v.dot, display: "inline-block", marginRight: 6 }} />{v.label}
            </DropdownItem>
          ))}
        </Dropdown>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// InviteExternalRow — collapsible invite-by-email form for the project members modal.
// External collaborators have no org_memberships; access is scoped via project_members.
// ─────────────────────────────────────────────────────────────────────────────
function InviteExternalRow({ projectId, orgId, invitedBy, T, onInvited, onError }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState("editor");
  const [scope, setScope] = useState({ tasks: true, documents: true, messages: false, module_data: false });
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!email.trim()) return onError?.("Email required");
    setSubmitting(true);
    try {
      const res = await fetch("https://upbjdmnykheubxkuknuj.supabase.co/functions/v1/invite-external-collaborator", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwYmpkbW55a2hldWJ4a3VrbnVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNDI3OTcsImV4cCI6MjA4NzcxODc5N30.pvTTkiZWNDPuo-Fdzm54uy8w1mlx0AjB5jtFm3MeGq4",
        },
        body: JSON.stringify({
          email: email.trim(),
          display_name: name.trim() || null,
          project_id: projectId,
          role,
          access_scope: scope,
          invited_by: invitedBy,
          org_id: orgId,
        }),
      });
      const result = await res.json();
      if (result.error) {
        onError?.("Invite failed: " + result.error);
      } else {
        onInvited?.({ project_id: projectId, user_id: result.user_id, role, access_scope: scope });
        setEmail(""); setName(""); setOpen(false);
      }
    } catch (e) {
      onError?.("Invite failed: " + String(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)}
        style={{ width: "100%", marginTop: 12, padding: "10px 12px", fontSize: 12, fontWeight: 600, background: T.accent + "10", color: T.accent, border: `1px dashed ${T.accent}50`, borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
        ✉️ Invite by email (external collaborator)
      </button>
    );
  }

  const scopeRow = (key, label, sub) => (
    <label style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 0", cursor: "pointer", fontSize: 11 }}>
      <input type="checkbox" checked={!!scope[key]} disabled={key === "tasks"}
        onChange={e => setScope(s => ({ ...s, [key]: e.target.checked }))}
        style={{ marginTop: 2 }} />
      <div style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, color: T.text }}>{label}{key === "tasks" && <span style={{ marginLeft: 6, fontSize: 9, color: T.text3, fontWeight: 400 }}>(always on)</span>}</div>
        {sub && <div style={{ fontSize: 10, color: T.text3, marginTop: 1 }}>{sub}</div>}
      </div>
    </label>
  );

  return (
    <div style={{ marginTop: 12, padding: 12, background: T.accent + "06", border: `1px solid ${T.accent}30`, borderRadius: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.accent }}>✉️ Invite external collaborator</div>
        <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 14 }}>×</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 9, fontWeight: 600, color: T.text3, marginBottom: 3, textTransform: "uppercase" }}>Email *</div>
          <input value={email} onChange={e => setEmail(e.target.value)} placeholder="external@example.com"
            type="email" autoFocus
            style={{ width: "100%", padding: "6px 8px", fontSize: 12, border: `1px solid ${T.border}`, borderRadius: 5, background: T.surface, color: T.text, outline: "none", boxSizing: "border-box" }} />
        </div>
        <div>
          <div style={{ fontSize: 9, fontWeight: 600, color: T.text3, marginBottom: 3, textTransform: "uppercase" }}>Display Name</div>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Optional"
            style={{ width: "100%", padding: "6px 8px", fontSize: 12, border: `1px solid ${T.border}`, borderRadius: 5, background: T.surface, color: T.text, outline: "none", boxSizing: "border-box" }} />
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 9, fontWeight: 600, color: T.text3, marginBottom: 3, textTransform: "uppercase" }}>Role</div>
        <div style={{ display: "flex", gap: 4 }}>
          {[
            { v: "editor", l: "Editor", d: "Edit + comment" },
            { v: "commenter", l: "Commenter", d: "View + comment" },
            { v: "viewer", l: "Viewer", d: "Read-only" },
          ].map(opt => (
            <button key={opt.v} onClick={() => setRole(opt.v)}
              style={{ flex: 1, padding: "6px 8px", fontSize: 11, fontWeight: 600, border: `1px solid ${role === opt.v ? T.accent : T.border}`, background: role === opt.v ? T.accent + "15" : "transparent", color: role === opt.v ? T.accent : T.text2, borderRadius: 5, cursor: "pointer" }}>
              {opt.l}
              <div style={{ fontSize: 9, fontWeight: 400, color: T.text3, marginTop: 1 }}>{opt.d}</div>
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 9, fontWeight: 600, color: T.text3, marginBottom: 3, textTransform: "uppercase" }}>Access Scope</div>
        <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 5, padding: "4px 10px" }}>
          {scopeRow("tasks", "Tasks", "Tasks, comments, attachments")}
          {scopeRow("documents", "Documents", "Project-linked docs")}
          {scopeRow("messages", "Messages", "Project messaging channel")}
          {scopeRow("module_data", "Other module data", "Anything else tagged to this project (PLM, OKRs, etc.)")}
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end" }}>
        <button onClick={() => setOpen(false)} disabled={submitting}
          style={{ padding: "6px 14px", fontSize: 11, fontWeight: 600, border: `1px solid ${T.border}`, background: "transparent", color: T.text2, borderRadius: 5, cursor: "pointer" }}>Cancel</button>
        <button onClick={submit} disabled={submitting || !email.trim()}
          style={{ padding: "6px 16px", fontSize: 11, fontWeight: 600, border: "none", background: T.accent, color: "#fff", borderRadius: 5, cursor: submitting ? "wait" : "pointer", opacity: !email.trim() ? 0.4 : 1 }}>
          {submitting ? "Sending…" : "Send invite"}
        </button>
      </div>
    </div>
  );
}

function AssigneeCell({ task, onUpdate, profiles, profile, ini, acol, uname, projectMembers, activeProject }) {
  const [open, setOpen] = useState(false);
  const [aSearch, setASearch] = useState("");
  const [showAddPrompt, setShowAddPrompt] = useState(null); // user to prompt about
  const pl = Object.values(profiles);
  const memberIds = new Set((projectMembers || []).filter(pm => pm.project_id === activeProject).map(pm => pm.user_id));
  const filtered = aSearch.trim() ? pl.filter(u => (u.display_name||"").toLowerCase().includes(aSearch.toLowerCase()) || (u.email||"").toLowerCase().includes(aSearch.toLowerCase())) : pl;
  
  const assignUser = async (userId) => {
    // Check if user is a project member
    if (activeProject && !memberIds.has(userId) && userId !== profile?.id) {
      setShowAddPrompt(userId);
      return;
    }
    onUpdate(task.id, "assignee_id", userId);
    setOpen(false);
  };

  const confirmAssign = async (addToProject) => {
    const userId = showAddPrompt;
    if (addToProject && activeProject) {
      await supabase.from("project_members").insert({ project_id: activeProject, user_id: userId, role: "member" });
      // Update local state so member circles appear immediately
      if (typeof setProjMembersList === 'function') {
        // setProjMembersList is from parent scope
      }
      // Notification handled by onUpdate -> task assignment notification
    }
    onUpdate(task.id, "assignee_id", userId);
    setShowAddPrompt(null);
    setOpen(false);
  };

  return (
    <div style={{ position: "relative" }}>
      <div onClick={(e) => { e.stopPropagation(); setOpen(!open); setASearch(""); setShowAddPrompt(null); }}
        style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer", padding: "2px 4px", borderRadius: 4 }}>
        {task.assignee_id ? (
          <>
            <Avatar url={profiles[task.assignee_id]?.avatar_url} initials={ini(task.assignee_id)} color={acol(task.assignee_id)} size={20} />
            <span style={{ fontSize: 12, color: T.text2, maxWidth: 70, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{uname(task.assignee_id).split(" ")[0]}</span>
          </>
        ) : (
          <div style={{ width: 20, height: 20, borderRadius: 10, border: `1.5px dashed ${T.text3}` }} />
        )}
      </div>
      {open && !showAddPrompt && (
        <Dropdown onClose={() => setOpen(false)} wide>
          <div style={{ padding: "4px 6px" }}>
            <input value={aSearch} onChange={e => setASearch(e.target.value)} onClick={e => e.stopPropagation()} placeholder="Search people…" autoFocus
              style={{ width: "100%", padding: "4px 8px", borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 11, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
          </div>
          {profile?.id && task.assignee_id !== profile.id && (
            <DropdownItem onClick={() => { onUpdate(task.id, "assignee_id", profile.id); setOpen(false); }}>
              <span style={{ color: T.accent, fontWeight: 600, fontSize: 11 }}>→ Assign to me</span>
            </DropdownItem>
          )}
          <DropdownItem onClick={() => { onUpdate(task.id, "assignee_id", null); setOpen(false); }}>
            <span style={{ color: T.text3 }}>Unassigned</span>
          </DropdownItem>
          {activeProject && <div style={{ padding: "2px 8px", fontSize: 9, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 4 }}>Project Members</div>}
          {filtered.filter(u => memberIds.has(u.id)).map(u => (
            <DropdownItem key={u.id} onClick={() => { onUpdate(task.id, "assignee_id", u.id); setOpen(false); }}>
              <Avatar url={u.avatar_url} initials={ini(u.id)} color={acol(u.id)} size={18} />
              <span style={{ flex: 1 }}>{u.display_name || u.email}</span>
            </DropdownItem>
          ))}
          {filtered.filter(u => !memberIds.has(u.id) && u.id !== profile?.id).length > 0 && (
            <div style={{ padding: "2px 8px", fontSize: 9, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 6, borderTop: `1px solid ${T.border}`, paddingTop: 6 }}>Others in Org</div>
          )}
          {filtered.filter(u => !memberIds.has(u.id) && u.id !== profile?.id).map(u => (
            <DropdownItem key={u.id} onClick={() => assignUser(u.id)}>
              <Avatar url={u.avatar_url} initials={ini(u.id)} color={acol(u.id)} size={18} faded />
              <span style={{ flex: 1, color: T.text3 }}>{u.display_name || u.email}</span>
            </DropdownItem>
          ))}
        </Dropdown>
      )}
      {open && showAddPrompt && (
        <Dropdown onClose={() => { setShowAddPrompt(null); setOpen(false); }} wide>
          <div style={{ padding: "10px 12px" }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 8 }}>
              {profiles[showAddPrompt]?.display_name || "This person"} isn't in this project
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <button onClick={() => confirmAssign(true)}
                style={{ padding: "7px 12px", fontSize: 11, fontWeight: 600, background: T.accent, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", textAlign: "left" }}>
                Add to project & assign task
              </button>
              <button onClick={() => confirmAssign(false)}
                style={{ padding: "7px 12px", fontSize: 11, fontWeight: 500, background: T.surface2, color: T.text2, border: `1px solid ${T.border}`, borderRadius: 6, cursor: "pointer", textAlign: "left" }}>
                Assign task only (won't see project)
              </button>
              <button onClick={() => { setShowAddPrompt(null); }}
                style={{ padding: "5px 12px", fontSize: 11, color: T.text3, background: "none", border: "none", cursor: "pointer", textAlign: "left" }}>
                Cancel
              </button>
            </div>
          </div>
        </Dropdown>
      )}
    </div>
  );
}

function SubtaskDateRange({ sub, onUpdate }) {
  // Compact inline date-range for subtask cards. Both dates editable without opening detail panel.
  // Each input only shows when set OR on hover (so unused dates don't clutter the list).
  const od = sub.due_date && new Date(sub.due_date) < new Date() && sub.status !== "done";
  const stop = (e) => e.stopPropagation();
  const baseStyle = {
    background: "none", border: "none", fontSize: 10, cursor: "pointer", outline: "none",
    padding: 0, fontFamily: "inherit", width: 78,
  };
  if (!sub.start_date && !sub.due_date) {
    // Show a single, faint placeholder date input for adding a due date inline
    return (
      <input type="date" value="" onClick={stop}
        onChange={(e) => onUpdate(sub.id, "due_date", e.target.value || null)}
        title="Add due date"
        style={{ ...baseStyle, color: T.text3, opacity: 0.5 }} />
    );
  }
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2 }} onClick={stop}>
      <input type="date" value={sub.start_date || ""}
        onChange={(e) => onUpdate(sub.id, "start_date", e.target.value || null)}
        title="Start date"
        style={{ ...baseStyle, color: sub.start_date ? T.text3 : T.text3, opacity: sub.start_date ? 1 : 0.5 }} />
      <span style={{ color: T.text3, fontSize: 9, userSelect: "none" }}>→</span>
      <input type="date" value={sub.due_date || ""}
        onChange={(e) => onUpdate(sub.id, "due_date", e.target.value || null)}
        title={od ? "Due date (overdue)" : "Due date"}
        style={{ ...baseStyle, color: od ? T.red : sub.due_date ? T.text3 : T.text3, opacity: sub.due_date ? 1 : 0.5 }} />
    </div>
  );
}

function DateCell({ task, onUpdate }) {
  // Range cell: shows both start_date and due_date as inline date inputs separated by an arrow.
  // Each input is independent — change one without touching the other. If only one is set,
  // the other input still renders (empty) so the user can fill it in without going to the
  // detail panel. Overdue (due_date < today, not done) is highlighted in red on the due-date side.
  const od = isOverdue(task.due_date) && task.status !== "done";
  const labelColor = (v, red) => red ? T.red : v ? T.text2 : T.text3;
  const inputStyle = (v, red) => ({
    background: "none", border: "none",
    color: labelColor(v, red),
    fontSize: 12, cursor: "pointer", outline: "none", width: 95, fontFamily: "inherit",
    padding: 0,
  });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 2 }} onClick={(e) => e.stopPropagation()}>
      <input type="date"
        value={task.start_date || ""}
        onChange={(e) => onUpdate(task.id, "start_date", e.target.value || null)}
        title="Start date"
        style={inputStyle(task.start_date, false)} />
      <span style={{ color: T.text3, fontSize: 11, userSelect: "none" }}>→</span>
      <input type="date"
        value={task.due_date || ""}
        onChange={(e) => onUpdate(task.id, "due_date", e.target.value || null)}
        title={od ? "Due date (overdue)" : "Due date"}
        style={inputStyle(task.due_date, od)} />
    </div>
  );
}


function LabelPills({ taskLabels, small }) {
  if (!taskLabels || taskLabels.length === 0) return null;
  return (
    <div style={{ display: "flex", gap: 3, flexWrap: "wrap", flexShrink: 0 }}>
      {taskLabels.map(l => (
        <span key={l.id} style={{ fontSize: small ? 8 : 9, fontWeight: 700, padding: small ? "1px 4px" : "1px 6px", borderRadius: 3, background: l.color + "20", color: l.color, whiteSpace: "nowrap" }}>{l.name}</span>
      ))}
    </div>
  );
}

function LabelPicker({ taskId, taskLabels, allLabels, onToggle, onCreate, onClose }) {
  const [search, setSearch] = useState("");
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#3b82f6");
  const [showCreate, setShowCreate] = useState(false);
  const ref = useRef(null);
  useEffect(() => { const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); }; document.addEventListener("mousedown", fn); return () => document.removeEventListener("mousedown", fn); }, [onClose]);
  const assignedIds = new Set(taskLabels.map(l => l.id));
  const filtered = search ? allLabels.filter(l => l.name.toLowerCase().includes(search.toLowerCase())) : allLabels;
  const COLORS = ["#ef4444","#f97316","#eab308","#22c55e","#06b6d4","#3b82f6","#8b5cf6","#ec4899","#6b7280"];
  return (
    <div ref={ref} style={{ position: "absolute", top: "100%", left: 0, zIndex: 50, marginTop: 4, width: 220, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.25)", padding: 4 }}>
      <div style={{ padding: "4px 6px" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search labels..." autoFocus
          style={{ width: "100%", padding: "4px 8px", borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 11, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
      </div>
      <div style={{ maxHeight: 180, overflow: "auto" }}>
        {filtered.map(l => (
          <div key={l.id} onClick={() => onToggle(taskId, l.id)} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 4, cursor: "pointer", fontSize: 12 }}
            onMouseEnter={e => e.currentTarget.style.background = T.surface2} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            <div style={{ width: 14, height: 14, borderRadius: 3, background: l.color + "30", border: `2px solid ${l.color}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9 }}>
              {assignedIds.has(l.id) ? "✓" : ""}
            </div>
            <span style={{ color: T.text }}>{l.name}</span>
          </div>
        ))}
      </div>
      <div style={{ borderTop: `1px solid ${T.border}`, padding: "4px 6px", marginTop: 2 }}>
        {!showCreate ? (
          <button onClick={() => setShowCreate(true)} style={{ width: "100%", padding: "4px 0", fontSize: 11, color: T.accent, background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>+ Create label</button>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="Label name" style={{ width: "100%", padding: "4px 6px", fontSize: 11, border: `1px solid ${T.border}`, borderRadius: 4, background: T.surface2, color: T.text, outline: "none", boxSizing: "border-box" }} />
            <div style={{ display: "flex", gap: 3 }}>
              {COLORS.map(c => <div key={c} onClick={() => setNewColor(c)} style={{ width: 16, height: 16, borderRadius: 3, background: c, cursor: "pointer", border: newColor === c ? "2px solid #fff" : "2px solid transparent", boxShadow: newColor === c ? `0 0 0 1px ${c}` : "none" }} />)}
            </div>
            <button onClick={async () => { if (!newName.trim()) return; const l = await onCreate(newName.trim(), newColor); if (l) { onToggle(taskId, l.id); setNewName(""); setShowCreate(false); } }}
              style={{ padding: "4px 8px", fontSize: 11, fontWeight: 600, background: T.accent, color: "#fff", border: "none", borderRadius: 4, cursor: "pointer" }}>Create & Apply</button>
          </div>
        )}
      </div>
    </div>
  );
}

function CustomFieldCell({ task, field, value, onChange }) {
  const ft = field.field_type;
  const base = { fontSize: 12, color: T.text, background: "none", border: "none", outline: "none", fontFamily: "inherit", width: "100%", padding: "2px 4px" };
  if (ft === "checkbox") return <input type="checkbox" checked={value === "true"} onChange={e => onChange(task.id, field.id, e.target.checked ? "true" : "false")} style={{ accentColor: T.accent }} />;
  if (ft === "select") return (
    <select value={value || ""} onChange={e => onChange(task.id, field.id, e.target.value)} style={{ ...base, cursor: "pointer" }}>
      <option value="">—</option>
      {(field.options || []).map(o => <option key={o.value || o} value={o.value || o}>{o.value || o}</option>)}
    </select>
  );
  if (ft === "date") return <input type="date" value={value || ""} onChange={e => onChange(task.id, field.id, e.target.value)} style={{ ...base, width: 110 }} />;
  if (ft === "number") return <input type="number" value={value || ""} onBlur={e => onChange(task.id, field.id, e.target.value)} onChange={() => {}} style={{ ...base, textAlign: "right", width: 60 }} />;
  return <input value={value || ""} onBlur={e => onChange(task.id, field.id, e.target.value)} style={{ ...base }} placeholder="—" />;
}

function Dropdown({ children, onClose, wide }) {
  const ref = useRef(null);
  useEffect(() => { const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); }; document.addEventListener("mousedown", fn); return () => document.removeEventListener("mousedown", fn); }, [onClose]);
  return (<div ref={ref} style={{ position: "absolute", top: "100%", left: 0, zIndex: 50, marginTop: 4, minWidth: wide ? 180 : 130, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.25)", padding: 4, animation: "slideIn 0.15s ease" }}>{children}</div>);
}

function DropdownItem({ children, onClick }) {
  return (<div onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 4, fontSize: 12, color: T.text, cursor: "pointer", transition: "background 0.1s" }} onMouseEnter={e => e.currentTarget.style.background = T.surface2} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>{children}</div>);
}
