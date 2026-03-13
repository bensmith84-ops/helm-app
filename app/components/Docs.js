"use client";
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";
import { useAuth } from "../lib/auth";

const BLOCK_TYPES = {
  text: { icon: "¶", label: "Text" }, h1: { icon: "H1", label: "Heading 1" }, h2: { icon: "H2", label: "Heading 2" }, h3: { icon: "H3", label: "Heading 3" },
  bullet: { icon: "•", label: "Bulleted List" }, numbered: { icon: "1.", label: "Numbered List" }, todo: { icon: "☑", label: "To-do" },
  quote: { icon: "❝", label: "Quote" }, callout: { icon: "💡", label: "Callout" }, divider: { icon: "—", label: "Divider" },
  code: { icon: "</>", label: "Code Block" }, toggle: { icon: "▶", label: "Toggle" },
};
const SLASH_CMDS = Object.entries(BLOCK_TYPES).map(([type, cfg]) => ({ type, ...cfg }));
const EMOJIS = ["📄","📝","📋","📊","📈","🚀","⚙️","🎨","📣","💡","🔬","📦","🏗️","🎯","📌","🗂️","💬","🔖","📐","🧪","🌍","💰","👥","📅","🔒","⭐","🏆","❤️","🔥","✅"];
const COVERS = ["linear-gradient(135deg,#667eea,#764ba2)","linear-gradient(135deg,#f093fb,#f5576c)","linear-gradient(135deg,#4facfe,#00f2fe)","linear-gradient(135deg,#43e97b,#38f9d7)","linear-gradient(135deg,#fa709a,#fee140)","linear-gradient(135deg,#a18cd1,#fbc2eb)","linear-gradient(135deg,#89f7fe,#66a6ff)","linear-gradient(135deg,#fddb92,#d1fdff)","linear-gradient(135deg,#c1dfc4,#deecdd)","linear-gradient(135deg,#2d3436,#636e72)"];
const mkBlock = (type = "text", content = "") => ({ id: crypto.randomUUID(), type, content, checked: false, collapsed: false });
const now = () => new Date().toISOString();

export default function DocsView() {
  const { user, profile } = useAuth();
  const orgId = profile?.org_id;
  const [docs, setDocs] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [loading, setLoading] = useState(true);
  const [activeDoc, setActiveDoc] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [slashMenu, setSlashMenu] = useState(null);
  const [emojiPicker, setEmojiPicker] = useState(false);
  const [coverPicker, setCoverPicker] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [focusedBlock, setFocusedBlock] = useState(null);
  const blockRefs = useRef({});
  const saveTimer = useRef(null);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      const [{ data: d }, { data: p }] = await Promise.all([
        supabase.from("documents").select("id,title,emoji,cover_url,parent_id,status,created_by,created_at,updated_at,sort_order,depth").eq("org_id", orgId).is("deleted_at", null).order("sort_order"),
        supabase.from("profiles").select("id,display_name"),
      ]);
      setDocs(d || []);
      const m = {}; (p || []).forEach(u => m[u.id] = u); setProfiles(m);
      setLoading(false);
    })();
  }, [orgId]);

  const uname = (uid) => profiles[uid]?.display_name || "";

  const tree = useMemo(() => {
    const roots = [], map = {};
    docs.forEach(d => map[d.id] = { ...d, children: [] });
    docs.forEach(d => {
      if (d.parent_id && map[d.parent_id]) map[d.parent_id].children.push(map[d.id]);
      else roots.push(map[d.id]);
    });
    return roots;
  }, [docs]);

  const openDoc = async (doc) => {
    setActiveDoc(doc);
    setEmojiPicker(false); setCoverPicker(false); setSlashMenu(null);
    const { data } = await supabase.from("documents").select("content,content_text").eq("id", doc.id).single();
    if (data?.content && Array.isArray(data.content)) setBlocks(data.content);
    else if (data?.content_text) setBlocks(data.content_text.split("\n").map(l => mkBlock("text", l)));
    else setBlocks([mkBlock("text", "")]);
  };

  const saveDoc = useCallback(async (docId, newBlocks, extra = {}) => {
    if (!docId) return;
    setSaving(true);
    const txt = newBlocks.map(b => b.content || "").join("\n");
    await supabase.from("documents").update({ content: newBlocks, content_text: txt, word_count: txt.split(/\s+/).filter(Boolean).length, updated_at: now(), last_edited_by: user?.id, ...extra }).eq("id", docId);
    setSaving(false); setLastSaved(new Date());
    setDocs(p => p.map(d => d.id === docId ? { ...d, ...extra, updated_at: now() } : d));
  }, [user]);

  const queueSave = useCallback((docId, newBlocks, extra) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveDoc(docId, newBlocks, extra), 800);
  }, [saveDoc]);

  const updateBlock = (bid, upd) => {
    setBlocks(prev => { const next = prev.map(b => b.id === bid ? { ...b, ...upd } : b); if (activeDoc) queueSave(activeDoc.id, next); return next; });
  };

  const insertBlockAfter = (afterId, type = "text") => {
    const nb = mkBlock(type);
    setBlocks(prev => { const i = prev.findIndex(b => b.id === afterId); const next = [...prev.slice(0, i + 1), nb, ...prev.slice(i + 1)]; if (activeDoc) queueSave(activeDoc.id, next); return next; });
    setTimeout(() => { blockRefs.current[nb.id]?.focus(); setFocusedBlock(nb.id); }, 50);
    return nb.id;
  };

  const deleteBlock = (bid) => {
    setBlocks(prev => {
      if (prev.length <= 1) return prev;
      const i = prev.findIndex(b => b.id === bid);
      const next = prev.filter(b => b.id !== bid);
      if (activeDoc) queueSave(activeDoc.id, next);
      setTimeout(() => { const t = next[Math.max(0, i - 1)]; if (t) blockRefs.current[t.id]?.focus(); }, 50);
      return next;
    });
  };

  const changeBlockType = (bid, type) => { updateBlock(bid, { type, content: type === "divider" ? "" : undefined }); setSlashMenu(null); setTimeout(() => blockRefs.current[bid]?.focus(), 50); };

  const handleKey = (e, block) => {
    if (e.key === "Enter" && !e.shiftKey) {
      if (block.type === "divider") return;
      e.preventDefault();
      const keepType = ["bullet", "numbered", "todo"].includes(block.type);
      insertBlockAfter(block.id, keepType ? block.type : "text");
    } else if (e.key === "Backspace" && !block.content) {
      e.preventDefault();
      if (block.type !== "text") changeBlockType(block.id, "text");
      else deleteBlock(block.id);
    } else if (e.key === "/" && !block.content) {
      const rect = e.target.getBoundingClientRect();
      setSlashMenu({ blockId: block.id, x: rect.left, y: rect.bottom + 4, filter: "" });
    } else if (e.key === "ArrowUp" && e.target.selectionStart === 0) {
      e.preventDefault(); const i = blocks.findIndex(b => b.id === block.id); if (i > 0) blockRefs.current[blocks[i - 1].id]?.focus();
    } else if (e.key === "ArrowDown") {
      const i = blocks.findIndex(b => b.id === block.id); if (i < blocks.length - 1) { e.preventDefault(); blockRefs.current[blocks[i + 1].id]?.focus(); }
    }
  };

  const createDoc = async (parentId = null) => {
    const { data } = await supabase.from("documents").insert({
      org_id: orgId, title: "Untitled", emoji: "📄", status: "draft", visibility: "team",
      parent_id: parentId, created_by: user?.id, content: [mkBlock("text", "")],
      sort_order: docs.length, depth: parentId ? 1 : 0,
    }).select("id,title,emoji,cover_url,parent_id,status,created_by,created_at,updated_at,sort_order,depth").single();
    if (data) { setDocs(p => [...p, data]); openDoc(data); }
  };

  const deleteDoc = async (id) => {
    await supabase.from("documents").update({ deleted_at: now() }).eq("id", id);
    setDocs(p => p.filter(d => d.id !== id));
    if (activeDoc?.id === id) { setActiveDoc(null); setBlocks([]); }
  };

  const updateMeta = async (id, upd) => {
    await supabase.from("documents").update({ ...upd, updated_at: now() }).eq("id", id);
    setDocs(p => p.map(d => d.id === id ? { ...d, ...upd } : d));
    if (activeDoc?.id === id) setActiveDoc(p => ({ ...p, ...upd }));
  };

  const duplicateDoc = async (doc) => {
    const { data: src } = await supabase.from("documents").select("content").eq("id", doc.id).single();
    const { data } = await supabase.from("documents").insert({
      org_id: orgId, title: doc.title + " (copy)", emoji: doc.emoji, status: "draft", visibility: "team",
      parent_id: doc.parent_id, created_by: user?.id, content: src?.content || [mkBlock()],
      sort_order: docs.length, depth: doc.depth || 0,
    }).select("id,title,emoji,cover_url,parent_id,status,created_by,created_at,updated_at,sort_order,depth").single();
    if (data) { setDocs(p => [...p, data]); openDoc(data); }
  };

  const bStyle = (type) => ({
    text: { fontSize: 15, lineHeight: 1.65 }, h1: { fontSize: 28, lineHeight: 1.3, fontWeight: 800, letterSpacing: "-0.02em" },
    h2: { fontSize: 22, lineHeight: 1.35, fontWeight: 700 }, h3: { fontSize: 17, lineHeight: 1.4, fontWeight: 700 },
    bullet: { fontSize: 15, lineHeight: 1.65 }, numbered: { fontSize: 15, lineHeight: 1.65 }, todo: { fontSize: 15, lineHeight: 1.65 },
    quote: { fontSize: 15, lineHeight: 1.65, fontStyle: "italic", borderLeft: `3px solid ${T.accent}`, paddingLeft: 16, color: T.text2 },
    callout: { fontSize: 14, lineHeight: 1.6, background: T.surface2 || T.surface, padding: "12px 14px", borderRadius: 8, border: `1px solid ${T.border}` },
    code: { fontSize: 13, lineHeight: 1.5, fontFamily: "'JetBrains Mono',monospace", background: T.surface2 || T.surface, padding: "12px 14px", borderRadius: 8, whiteSpace: "pre-wrap", overflowX: "auto" },
    toggle: { fontSize: 15, lineHeight: 1.65 }, divider: {},
  }[type] || {});

  // ──── TREE ITEM ────
  const TreeItem = ({ node, depth = 0 }) => {
    const [exp, setExp] = useState(true);
    const [hov, setHov] = useState(false);
    const [ctx, setCtx] = useState(false);
    const isActive = activeDoc?.id === node.id;
    const hasKids = node.children?.length > 0;
    return <>
      <div onContextMenu={e => { e.preventDefault(); setCtx(true); }}
        style={{ display: "flex", alignItems: "center", gap: 4, padding: "5px 8px", paddingLeft: 8 + depth * 16, borderRadius: 6, cursor: "pointer", fontSize: 13,
          color: isActive ? T.text : T.text2, background: isActive ? `${T.accent}15` : "transparent", fontWeight: isActive ? 600 : 400, marginBottom: 1, position: "relative", userSelect: "none" }}
        onClick={() => openDoc(node)} onMouseEnter={e => { setHov(true); if (!isActive) e.currentTarget.style.background = T.surface2; }}
        onMouseLeave={e => { setHov(false); setCtx(false); if (!isActive) e.currentTarget.style.background = "transparent"; }}>
        {hasKids ? <span onClick={e => { e.stopPropagation(); setExp(!exp); }} style={{ fontSize: 8, color: T.text3, width: 14, textAlign: "center", cursor: "pointer", transition: "transform 0.15s", transform: exp ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span> : <span style={{ width: 14 }} />}
        <span style={{ fontSize: 15, marginRight: 4 }}>{node.emoji || "📄"}</span>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{node.title || "Untitled"}</span>
        {hov && <div style={{ display: "flex", gap: 2, position: "absolute", right: 4 }}>
          <button onClick={e => { e.stopPropagation(); createDoc(node.id); }} style={{ background: T.surface2, border: "none", color: T.text3, cursor: "pointer", fontSize: 10, padding: "2px 4px", borderRadius: 3, lineHeight: 1 }} title="Add sub-page">+</button>
          <button onClick={e => { e.stopPropagation(); setCtx(!ctx); }} style={{ background: T.surface2, border: "none", color: T.text3, cursor: "pointer", fontSize: 10, padding: "2px 4px", borderRadius: 3, lineHeight: 1 }}>···</button>
        </div>}
        {ctx && <div style={{ position: "absolute", right: 0, top: "100%", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, boxShadow: "0 4px 16px rgba(0,0,0,0.2)", zIndex: 50, width: 140, overflow: "hidden" }} onClick={e => e.stopPropagation()}>
          {[{ label: "Duplicate", action: () => duplicateDoc(node) }, { label: "Delete", action: () => deleteDoc(node.id), color: T.red || "#ef4444" }].map(a => (
            <button key={a.label} onClick={() => { a.action(); setCtx(false); }} style={{ width: "100%", textAlign: "left", padding: "7px 12px", border: "none", background: "transparent", color: a.color || T.text, fontSize: 12, cursor: "pointer" }}
              onMouseEnter={e => e.currentTarget.style.background = T.surface2} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>{a.label}</button>
          ))}
        </div>}
      </div>
      {exp && hasKids && node.children.map(c => <TreeItem key={c.id} node={c} depth={depth + 1} />)}
    </>;
  };

  // ──── BLOCK RENDERER ────
  const Block = ({ block, index }) => {
    const [hov, setHov] = useState(false);
    if (block.type === "divider") return (
      <div style={{ padding: "8px 0 8px 32", position: "relative" }} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}>
        {hov && <button onClick={() => deleteBlock(block.id)} style={{ position: "absolute", left: 4, top: 4, background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 12 }}>×</button>}
        <div style={{ height: 1, background: T.border }} />
      </div>
    );

    // Numbered list counter
    let numIdx = 1;
    if (block.type === "numbered") {
      for (let j = index - 1; j >= 0; j--) { if (blocks[j].type === "numbered") numIdx++; else break; }
    }

    return (
      <div style={{ position: "relative", padding: "1px 0", display: "flex", alignItems: "flex-start", gap: 0 }}
        onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}>
        {/* Drag handle */}
        <div style={{ width: 32, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", paddingTop: block.type.startsWith("h") ? 6 : 3, opacity: hov ? 0.6 : 0, transition: "opacity 0.1s", cursor: "grab" }}>
          <span style={{ fontSize: 10, color: T.text3, userSelect: "none" }}>⠿</span>
        </div>
        {/* Prefix */}
        {block.type === "bullet" && <span style={{ color: T.text3, fontSize: 20, lineHeight: "26px", flexShrink: 0, width: 18, textAlign: "center" }}>•</span>}
        {block.type === "numbered" && <span style={{ color: T.text3, fontSize: 13, lineHeight: "26px", flexShrink: 0, width: 22, textAlign: "right", paddingRight: 4, fontFamily: "monospace" }}>{numIdx}.</span>}
        {block.type === "todo" && <input type="checkbox" checked={block.checked || false} onChange={() => updateBlock(block.id, { checked: !block.checked })} style={{ marginTop: 6, cursor: "pointer", accentColor: T.accent, flexShrink: 0 }} />}
        {block.type === "callout" && <span style={{ fontSize: 18, marginTop: 10, flexShrink: 0 }}>💡</span>}
        {block.type === "toggle" && <span onClick={() => updateBlock(block.id, { collapsed: !block.collapsed })} style={{ cursor: "pointer", fontSize: 10, marginTop: 6, flexShrink: 0, color: T.text3, transition: "transform 0.15s", transform: block.collapsed ? "rotate(0deg)" : "rotate(90deg)", display: "inline-block" }}>▶</span>}
        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {block.type === "code" ? (
            <textarea ref={el => blockRefs.current[block.id] = el} value={block.content || ""}
              onChange={e => updateBlock(block.id, { content: e.target.value })}
              onKeyDown={e => { if (e.key === "Backspace" && !block.content) { e.preventDefault(); deleteBlock(block.id); } }}
              onFocus={() => setFocusedBlock(block.id)} placeholder="// code..." rows={Math.max(3, (block.content || "").split("\n").length)}
              style={{ ...bStyle("code"), width: "100%", color: T.text, border: "none", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
          ) : (
            <div ref={el => blockRefs.current[block.id] = el} contentEditable suppressContentEditableWarning
              onInput={e => {
                const text = e.target.innerText;
                updateBlock(block.id, { content: text });
                if (text === "/") { const r = e.target.getBoundingClientRect(); setSlashMenu({ blockId: block.id, x: r.left, y: r.bottom + 4, filter: "" }); }
                else if (slashMenu?.blockId === block.id) { if (text.startsWith("/")) setSlashMenu(p => ({ ...p, filter: text.slice(1).toLowerCase() })); else setSlashMenu(null); }
              }}
              onKeyDown={e => handleKey(e, block)} onFocus={() => setFocusedBlock(block.id)}
              data-placeholder={block.type === "h1" ? "Heading 1" : block.type === "h2" ? "Heading 2" : block.type === "h3" ? "Heading 3" : block.type === "quote" ? "Quote..." : index === 0 && blocks.length <= 1 ? "Type '/' for commands..." : ""}
              style={{ ...bStyle(block.type), color: block.type === "todo" && block.checked ? T.text3 : T.text, textDecoration: block.type === "todo" && block.checked ? "line-through" : "none", outline: "none", minHeight: "1.5em", wordBreak: "break-word" }}
              dangerouslySetInnerHTML={{ __html: block.content || "" }} />
          )}
        </div>
      </div>
    );
  };

  if (loading) return <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: T.text3, fontSize: 13 }}>Loading…</div>;

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden", background: T.bg }}>
      {slashMenu && <div style={{ position: "fixed", inset: 0, zIndex: 90 }} onClick={() => setSlashMenu(null)} />}

      {/* SIDEBAR */}
      {!sidebarCollapsed && <div style={{ width: 260, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", background: T.surface || T.bg, flexShrink: 0 }}>
        <div style={{ padding: "12px 10px 8px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 6, background: T.surface2 || T.bg, border: `1px solid ${T.border}` }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={T.text3} strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: T.text, fontSize: 12, fontFamily: "inherit" }} />
          </div>
        </div>
        <div style={{ padding: "0 10px 8px" }}>
          <button onClick={() => createDoc()} style={{ width: "100%", padding: "7px 10px", borderRadius: 6, border: `1px dashed ${T.border}`, background: "transparent", color: T.accent, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>+ New Page</button>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "0 6px" }}>
          {(search ? docs.filter(d => d.title?.toLowerCase().includes(search.toLowerCase())).map(d => ({ ...d, children: [] })) : tree).map(n => <TreeItem key={n.id} node={n} />)}
          {docs.length === 0 && <div style={{ padding: "20px 10px", textAlign: "center", color: T.text3, fontSize: 12 }}>No documents yet</div>}
        </div>
      </div>}

      {/* MAIN */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {!activeDoc ? (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 40 }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📝</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: T.text, marginBottom: 8 }}>Documents</div>
            <div style={{ fontSize: 14, color: T.text3, marginBottom: 24, textAlign: "center", maxWidth: 400 }}>Create rich documents with nested pages, headings, lists, to-dos, code blocks, and more.</div>
            <button onClick={() => createDoc()} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: T.accent, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Create a Page</button>
            {docs.length > 0 && <div style={{ marginTop: 32, width: "100%", maxWidth: 500 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.text3, marginBottom: 8, textTransform: "uppercase" }}>Recent</div>
              {docs.slice(0, 8).map(d => (
                <div key={d.id} onClick={() => openDoc(d)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 6, cursor: "pointer", marginBottom: 2 }}
                  onMouseEnter={e => e.currentTarget.style.background = T.surface2} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <span style={{ fontSize: 18 }}>{d.emoji || "📄"}</span>
                  <span style={{ fontSize: 14, color: T.text, flex: 1 }}>{d.title || "Untitled"}</span>
                  <span style={{ fontSize: 11, color: T.text3 }}>{d.updated_at ? new Date(d.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}</span>
                </div>
              ))}
            </div>}
          </div>
        ) : <>
          {/* TOOLBAR */}
          <div style={{ display: "flex", alignItems: "center", padding: "6px 16px", borderBottom: `1px solid ${T.border}`, background: T.surface || T.bg, gap: 8, flexShrink: 0 }}>
            {sidebarCollapsed && <button onClick={() => setSidebarCollapsed(false)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 14, padding: 4 }}>☰</button>}
            <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 4, fontSize: 12, color: T.text3 }}>
              <span style={{ cursor: "pointer" }} onClick={() => { setActiveDoc(null); setBlocks([]); }}>Documents</span><span>/</span>
              <span style={{ color: T.text, fontWeight: 500 }}>{activeDoc.emoji} {activeDoc.title || "Untitled"}</span>
            </div>
            <span style={{ fontSize: 11, color: T.text3, fontStyle: "italic" }}>{saving ? "Saving..." : lastSaved ? `Saved` : ""}</span>
            <select value={activeDoc.status || "draft"} onChange={e => updateMeta(activeDoc.id, { status: e.target.value })} style={{ fontSize: 11, padding: "3px 6px", borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface2 || T.bg, color: T.text, fontFamily: "inherit", cursor: "pointer" }}>
              <option value="draft">Draft</option><option value="published">Published</option><option value="review">In Review</option><option value="archived">Archived</option>
            </select>
            {!sidebarCollapsed && <button onClick={() => setSidebarCollapsed(true)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 12, padding: 4 }} title="Hide sidebar">◀</button>}
            <button onClick={() => duplicateDoc(activeDoc)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 11, padding: 4 }} title="Duplicate">⧉</button>
            <button onClick={() => deleteDoc(activeDoc.id)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 12, padding: 4 }} title="Delete">🗑️</button>
          </div>

          {/* EDITOR */}
          <div style={{ flex: 1, overflow: "auto" }} onClick={e => { if (e.target === e.currentTarget) { const last = blocks[blocks.length - 1]; if (last) blockRefs.current[last.id]?.focus(); } }}>
            {/* Cover */}
            {activeDoc.cover_url && <div style={{ height: 180, background: activeDoc.cover_url, backgroundSize: "cover", backgroundPosition: "center", position: "relative" }}>
              <div style={{ position: "absolute", bottom: 8, right: 8, display: "flex", gap: 4 }}>
                <button onClick={() => setCoverPicker(!coverPicker)} style={{ padding: "4px 10px", borderRadius: 4, background: "rgba(0,0,0,0.5)", border: "none", color: "#fff", fontSize: 11, cursor: "pointer" }}>Change</button>
                <button onClick={() => updateMeta(activeDoc.id, { cover_url: null })} style={{ padding: "4px 10px", borderRadius: 4, background: "rgba(0,0,0,0.5)", border: "none", color: "#fff", fontSize: 11, cursor: "pointer" }}>Remove</button>
              </div>
            </div>}
            {coverPicker && <div style={{ padding: "12px 24px", display: "flex", gap: 8, flexWrap: "wrap", borderBottom: `1px solid ${T.border}`, background: T.surface }}>
              {COVERS.map((g, i) => <div key={i} onClick={() => { updateMeta(activeDoc.id, { cover_url: g }); setCoverPicker(false); }} style={{ width: 60, height: 32, borderRadius: 6, background: g, cursor: "pointer", border: `2px solid ${activeDoc.cover_url === g ? T.accent : "transparent"}` }} />)}
            </div>}

            {/* Doc head */}
            <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 40px" }}>
              <div style={{ paddingTop: activeDoc.cover_url ? 20 : 50, paddingBottom: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span onClick={() => setEmojiPicker(!emojiPicker)} style={{ fontSize: 48, cursor: "pointer", userSelect: "none" }}>{activeDoc.emoji || "📄"}</span>
                  {!activeDoc.cover_url && <button onClick={() => setCoverPicker(true)} style={{ background: "none", border: "none", color: T.text3, fontSize: 11, cursor: "pointer", opacity: 0.5 }}>+ Add cover</button>}
                </div>
                {emojiPicker && <div style={{ display: "flex", gap: 4, flexWrap: "wrap", padding: "8px 0", maxWidth: 320 }}>
                  {EMOJIS.map(e => <span key={e} onClick={() => { updateMeta(activeDoc.id, { emoji: e }); setEmojiPicker(false); }} style={{ fontSize: 22, cursor: "pointer", padding: 4, borderRadius: 4 }} onMouseEnter={ev => ev.currentTarget.style.background = T.surface2} onMouseLeave={ev => ev.currentTarget.style.background = "transparent"}>{e}</span>)}
                </div>}
                <input value={activeDoc.title || ""} onChange={e => { const t = e.target.value; setActiveDoc(p => ({ ...p, title: t })); setDocs(p => p.map(d => d.id === activeDoc.id ? { ...d, title: t } : d)); if (saveTimer.current) clearTimeout(saveTimer.current); saveTimer.current = setTimeout(() => supabase.from("documents").update({ title: t, updated_at: now() }).eq("id", activeDoc.id), 600); }}
                  placeholder="Untitled" style={{ fontSize: 34, fontWeight: 800, color: T.text, background: "transparent", border: "none", outline: "none", width: "100%", fontFamily: "inherit", padding: 0, letterSpacing: "-0.02em" }} />
              </div>

              {/* BLOCKS */}
              <div style={{ paddingBottom: 200, paddingTop: 8 }}>
                {blocks.map((b, i) => <Block key={b.id} block={b} index={i} />)}
                <div style={{ paddingLeft: 32, paddingTop: 8 }}>
                  <button onClick={() => { const last = blocks[blocks.length - 1]; if (last) insertBlockAfter(last.id); else { const nb = mkBlock(); setBlocks([nb]); } }}
                    style={{ background: "none", border: "none", color: T.text3, fontSize: 12, cursor: "pointer", padding: "4px 8px", borderRadius: 4, opacity: 0.4 }}
                    onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.4}>+ Add a block</button>
                </div>
              </div>
            </div>
          </div>
        </>}
      </div>

      {/* SLASH MENU */}
      {slashMenu && <div style={{ position: "fixed", left: Math.min(slashMenu.x, window.innerWidth - 220), top: Math.min(slashMenu.y, window.innerHeight - 300), width: 210, background: T.surface || "#fff", borderRadius: 8, border: `1px solid ${T.border}`, boxShadow: "0 8px 30px rgba(0,0,0,0.2)", zIndex: 100, overflow: "hidden", maxHeight: 300, overflowY: "auto" }}>
        <div style={{ padding: "6px 10px", fontSize: 10, fontWeight: 600, color: T.text3, textTransform: "uppercase", letterSpacing: "0.05em" }}>Block Type</div>
        {SLASH_CMDS.filter(c => !slashMenu.filter || c.label.toLowerCase().includes(slashMenu.filter) || c.type.includes(slashMenu.filter)).map(cmd => (
          <div key={cmd.type} onClick={() => { changeBlockType(slashMenu.blockId, cmd.type); updateBlock(slashMenu.blockId, { content: "" }); }}
            style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", cursor: "pointer", fontSize: 13, color: T.text }}
            onMouseEnter={e => e.currentTarget.style.background = T.surface2 || T.border} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
            <span style={{ width: 28, height: 28, borderRadius: 4, background: T.surface2 || T.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, color: T.text2, flexShrink: 0 }}>{cmd.icon}</span>
            <span>{cmd.label}</span>
          </div>
        ))}
      </div>}

      <style>{`[contenteditable]:empty:before{content:attr(data-placeholder);color:${T.text3};pointer-events:none}[contenteditable]:focus{outline:none}::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:${T.border};border-radius:3px}`}</style>
    </div>
  );
}
