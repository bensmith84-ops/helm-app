"use client";
import { useState, useEffect, useCallback, useRef, useMemo, memo } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";
import { useAuth } from "../lib/auth";

const BLOCK_TYPES = {
  text: { icon: "¶", label: "Text" }, h1: { icon: "H1", label: "Heading 1" }, h2: { icon: "H2", label: "Heading 2" }, h3: { icon: "H3", label: "Heading 3" },
  bullet: { icon: "•", label: "Bulleted List" }, numbered: { icon: "1.", label: "Numbered List" }, todo: { icon: "☑", label: "To-do" },
  quote: { icon: "❝", label: "Quote" }, callout: { icon: "💡", label: "Callout" }, divider: { icon: "—", label: "Divider" },
  code: { icon: "</>", label: "Code Block" }, toggle: { icon: "▶", label: "Toggle" }, table: { icon: "⊞", label: "Table" },
};
const SLASH_CMDS = Object.entries(BLOCK_TYPES).map(([type, cfg]) => ({ type, ...cfg }));
const EMOJIS = ["📄","📝","📋","📊","📈","🚀","⚙️","🎨","📣","💡","🔬","📦","🏗️","🎯","📌","🗂️","💬","🔖","📐","🧪","🌍","💰","👥","📅","🔒","⭐","🏆","❤️","🔥","✅","⚠️","💎","🧠","📡","🎵"];
const CALLOUT_EMOJIS = ["💡","⚠️","ℹ️","✅","❌","🔥","📌","💬","🚀","⭐","💰","🎯","📣","🧪","❤️"];
const COVERS = ["linear-gradient(135deg,#667eea,#764ba2)","linear-gradient(135deg,#f093fb,#f5576c)","linear-gradient(135deg,#4facfe,#00f2fe)","linear-gradient(135deg,#43e97b,#38f9d7)","linear-gradient(135deg,#fa709a,#fee140)","linear-gradient(135deg,#a18cd1,#fbc2eb)","linear-gradient(135deg,#89f7fe,#66a6ff)","linear-gradient(135deg,#fddb92,#d1fdff)","linear-gradient(135deg,#c1dfc4,#deecdd)","linear-gradient(135deg,#2d3436,#636e72)"];
const mkBlock = (type = "text", content = "") => {
  const b = { id: crypto.randomUUID(), type, content, checked: false, collapsed: false, emoji: "💡" };
  if (type === "table") b.tableData = { cols: ["Column A", "Column B", "Column C"], rows: [["","",""],["","",""]], formulas: {} };
  return b;
};
const now = () => new Date().toISOString();

// ──── STABLE EDITABLE BLOCK (no re-render on typing) ────
const EditableBlock = memo(function EditableBlock({ blockId, initialContent, style, placeholder, onContentChange, onKeyDown, onFocus, onSlash, blockRef }) {
  const ref = useRef(null);
  const contentRef = useRef(initialContent || "");

  // Set content via ref after mount — only once per blockId
  const lastSetBlockId = useRef(null);
  useEffect(() => {
    if (ref.current && lastSetBlockId.current !== blockId) {
      ref.current.innerText = initialContent || "";
      contentRef.current = initialContent || "";
      lastSetBlockId.current = blockId;
    }
  }, [blockId, initialContent]);

  useEffect(() => { if (blockRef) blockRef(ref.current); }, [blockRef]);

  // Stable handlers via refs to avoid prop changes causing re-renders
  const onContentChangeRef = useRef(onContentChange);
  const onKeyDownRef = useRef(onKeyDown);
  const onFocusRef = useRef(onFocus);
  const onSlashRef = useRef(onSlash);
  onContentChangeRef.current = onContentChange;
  onKeyDownRef.current = onKeyDown;
  onFocusRef.current = onFocus;
  onSlashRef.current = onSlash;

  return (
    <div ref={ref} contentEditable suppressContentEditableWarning
      data-placeholder={placeholder}
      style={{ ...style, outline: "none", minHeight: "1.5em", wordBreak: "break-word" }}
      onInput={e => {
        const text = e.target.innerText;
        contentRef.current = text;
        onContentChangeRef.current?.(text);
        if (text === "/") { onSlashRef.current?.(e.target.getBoundingClientRect(), ""); }
        else if (text.startsWith("/") && text.length < 20) { onSlashRef.current?.(e.target.getBoundingClientRect(), text.slice(1).toLowerCase()); }
      }}
      onKeyDown={e => onKeyDownRef.current?.(e, contentRef.current)}
      onFocus={() => onFocusRef.current?.()}
    />
  );
}, () => true); // NEVER re-render — content is managed entirely via DOM/refs
EditableBlock.displayName = "EditableBlock";

// ──── TABLE FORMULA ENGINE ────
const evalFormula = (formula, tableData) => {
  if (!formula || !formula.startsWith("=")) return formula;
  const expr = formula.slice(1).toUpperCase();
  const getCellVal = (ref) => {
    const col = ref.charCodeAt(0) - 65;
    const row = parseInt(ref.slice(1)) - 1;
    const raw = tableData.rows?.[row]?.[col];
    return parseFloat(raw) || 0;
  };
  const getRange = (rangeStr) => {
    const [start, end] = rangeStr.split(":");
    const sc = start.charCodeAt(0) - 65, sr = parseInt(start.slice(1)) - 1;
    const ec = end.charCodeAt(0) - 65, er = parseInt(end.slice(1)) - 1;
    const vals = [];
    for (let r = sr; r <= er; r++) for (let c = sc; c <= ec; c++) {
      vals.push(parseFloat(tableData.rows?.[r]?.[c]) || 0);
    }
    return vals;
  };
  try {
    // SUM(A1:A5)
    const sumMatch = expr.match(/^SUM\(([A-Z]\d+):([A-Z]\d+)\)$/);
    if (sumMatch) return getRange(sumMatch[1] + ":" + sumMatch[2]).reduce((a, b) => a + b, 0);
    // AVG / AVERAGE
    const avgMatch = expr.match(/^(?:AVG|AVERAGE)\(([A-Z]\d+):([A-Z]\d+)\)$/);
    if (avgMatch) { const vals = getRange(avgMatch[1] + ":" + avgMatch[2]); return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length) : 0; }
    // MIN
    const minMatch = expr.match(/^MIN\(([A-Z]\d+):([A-Z]\d+)\)$/);
    if (minMatch) return Math.min(...getRange(minMatch[1] + ":" + minMatch[2]));
    // MAX
    const maxMatch = expr.match(/^MAX\(([A-Z]\d+):([A-Z]\d+)\)$/);
    if (maxMatch) return Math.max(...getRange(maxMatch[1] + ":" + maxMatch[2]));
    // COUNT
    const cntMatch = expr.match(/^COUNT\(([A-Z]\d+):([A-Z]\d+)\)$/);
    if (cntMatch) return getRange(cntMatch[1] + ":" + cntMatch[2]).filter(v => v !== 0).length;
    // Simple cell ref A1+B1 style
    const simple = expr.replace(/[A-Z]\d+/g, (m) => getCellVal(m));
    return Function('"use strict"; return (' + simple + ')')();
  } catch { return "ERR"; }
};

export default function DocsView({ setActive }) {
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
  const [slashMenu, setSlashMenu] = useState(null); // { blockId, x, y, filter }
  const [emojiPicker, setEmojiPicker] = useState(false);
  const [coverPicker, setCoverPicker] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [calloutEmojiPicker, setCalloutEmojiPicker] = useState(null); // blockId
  const [showTemplateGallery, setShowTemplateGallery] = useState(false);
  const blockRefs = useRef({});
  const blockContents = useRef({}); // Store content in ref to avoid re-renders
  const saveTimer = useRef(null);
  const titleSaveTimer = useRef(null);

  const [projects, setProjects] = useState([]);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      const [{ data: d }, { data: p }, { data: proj }] = await Promise.all([
        supabase.from("documents").select("id,title,emoji,cover_url,parent_id,status,created_by,created_at,updated_at,sort_order,depth,project_id").eq("org_id", orgId).is("deleted_at", null).order("sort_order"),
        supabase.from("profiles").select("id,display_name"),
        supabase.from("projects").select("id,name,color,emoji").eq("org_id", orgId).is("deleted_at", null).order("name"),
      ]);
      setDocs(d || []);
      setProjects(proj || []);
      const m = {}; (p || []).forEach(u => m[u.id] = u); setProfiles(m);
      setLoading(false);
    })();
  }, [orgId]);

  const tree = useMemo(() => {
    const roots = [], map = {};
    docs.forEach(d => map[d.id] = { ...d, children: [] });
    docs.forEach(d => { if (d.parent_id && map[d.parent_id]) map[d.parent_id].children.push(map[d.id]); else roots.push(map[d.id]); });
    return roots;
  }, [docs]);

  const openDoc = async (doc) => {
    setActiveDoc(doc); setEmojiPicker(false); setCoverPicker(false); setSlashMenu(null); setCalloutEmojiPicker(null);
    const { data } = await supabase.from("documents").select("content,content_text").eq("org_id", orgId).eq("id", doc.id).single();
    let newBlocks;
    if (data?.content && Array.isArray(data.content)) newBlocks = data.content;
    else if (data?.content_text) newBlocks = data.content_text.split("\n").map(l => mkBlock("text", l));
    else newBlocks = [mkBlock("text", "")];
    // Sync content refs
    blockContents.current = {};
    newBlocks.forEach(b => { blockContents.current[b.id] = b.content || ""; });
    setBlocks(newBlocks);
  };

  // ──── SAVE (reads from refs, not state) ────
  const saveDoc = useCallback(async (docId, blockList) => {
    if (!docId) return;
    setSaving(true);
    // Merge ref contents into blocks for save
    const toSave = blockList.map(b => ({ ...b, content: blockContents.current[b.id] ?? b.content }));
    const txt = toSave.map(b => b.content || "").join("\n");
    await supabase.from("documents").update({ content: toSave, content_text: txt, word_count: txt.split(/\s+/).filter(Boolean).length, updated_at: now(), last_edited_by: user?.id }).eq("org_id", orgId).eq("id", docId);
    setSaving(false); setLastSaved(new Date());
  }, [user]);

  const queueSave = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      if (activeDoc) saveDoc(activeDoc.id, blocks);
    }, 1000);
  }, [saveDoc, activeDoc, blocks]);

  // Content change handler — does NOT trigger re-render
  const handleContentChange = useCallback((blockId, text) => {
    blockContents.current[blockId] = text;
    queueSave();
  }, [queueSave]);

  // Structural changes (add/delete/reorder/type change) DO trigger re-render
  const updateBlockMeta = (bid, upd) => {
    setBlocks(prev => prev.map(b => b.id === bid ? { ...b, ...upd } : b));
    queueSave();
  };

  const insertBlockAfter = (afterId, type = "text") => {
    const nb = mkBlock(type);
    blockContents.current[nb.id] = "";
    setBlocks(prev => { const i = prev.findIndex(b => b.id === afterId); return [...prev.slice(0, i + 1), nb, ...prev.slice(i + 1)]; });
    queueSave();
    setTimeout(() => { blockRefs.current[nb.id]?.focus(); }, 50);
    return nb.id;
  };

  const deleteBlock = (bid) => {
    setBlocks(prev => {
      if (prev.length <= 1) return prev;
      const i = prev.findIndex(b => b.id === bid);
      const next = prev.filter(b => b.id !== bid);
      delete blockContents.current[bid];
      queueSave();
      setTimeout(() => { const t = next[Math.max(0, i - 1)]; if (t) blockRefs.current[t.id]?.focus(); }, 50);
      return next;
    });
  };

  const changeBlockType = (bid, type) => {
    if (type === "divider") blockContents.current[bid] = "";
    setBlocks(prev => prev.map(b => b.id === bid ? { ...b, type, ...(type === "table" ? { tableData: { cols: ["Column A","Column B","Column C"], rows: [["","",""],["","",""]], formulas: {} } } : {}) } : b));
    setSlashMenu(null);
    queueSave();
    if (type !== "divider" && type !== "table") setTimeout(() => blockRefs.current[bid]?.focus(), 50);
  };

  const handleKey = useCallback((e, blockId, currentContent) => {
    const block = blocks.find(b => b.id === blockId);
    if (!block) return;
    if (e.key === "Enter" && !e.shiftKey) {
      if (block.type === "divider" || block.type === "table") return;
      e.preventDefault();
      const keepType = ["bullet", "numbered", "todo"].includes(block.type);
      insertBlockAfter(block.id, keepType && currentContent ? block.type : "text");
    } else if (e.key === "Backspace" && !currentContent) {
      e.preventDefault();
      if (block.type !== "text") changeBlockType(block.id, "text");
      else deleteBlock(block.id);
    } else if (e.key === "ArrowUp") {
      const sel = window.getSelection();
      if (sel && sel.anchorOffset === 0) {
        e.preventDefault();
        const i = blocks.findIndex(b => b.id === blockId);
        if (i > 0) blockRefs.current[blocks[i - 1].id]?.focus();
      }
    } else if (e.key === "ArrowDown") {
      const i = blocks.findIndex(b => b.id === blockId);
      if (i < blocks.length - 1) { e.preventDefault(); blockRefs.current[blocks[i + 1].id]?.focus(); }
    } else if (e.key === "Escape") {
      setSlashMenu(null);
    }
  }, [blocks]);

  const createDoc = async (parentId = null) => {
    const { data } = await supabase.from("documents").insert({
      org_id: orgId, title: "Untitled", emoji: "📄", status: "draft", visibility: "team",
      parent_id: parentId, created_by: user?.id, content: [mkBlock("text", "")],
      sort_order: docs.length, depth: parentId ? 1 : 0,
    }).select("id,title,emoji,cover_url,parent_id,status,created_by,created_at,updated_at,sort_order,depth").single();
    if (data) { setDocs(p => [...p, data]); openDoc(data); }
  };

  const deleteDoc = async (id) => {
    await supabase.from("documents").update({ deleted_at: now() }).eq("org_id", orgId).eq("id", id);
    setDocs(p => p.filter(d => d.id !== id));
    if (activeDoc?.id === id) { setActiveDoc(null); setBlocks([]); }
  };

  const updateMeta = async (id, upd) => {
    await supabase.from("documents").update({ ...upd, updated_at: now() }).eq("org_id", orgId).eq("id", id);
    setDocs(p => p.map(d => d.id === id ? { ...d, ...upd } : d));
    if (activeDoc?.id === id) setActiveDoc(p => ({ ...p, ...upd }));
  };

  const duplicateDoc = async (doc) => {
    const { data: src } = await supabase.from("documents").select("content").eq("org_id", orgId).eq("id", doc.id).single();
    const { data } = await supabase.from("documents").insert({
      org_id: orgId, title: doc.title + " (copy)", emoji: doc.emoji, status: "draft", visibility: "team",
      parent_id: doc.parent_id, created_by: user?.id, content: src?.content || [mkBlock()], sort_order: docs.length, depth: doc.depth || 0,
    }).select("id,title,emoji,cover_url,parent_id,status,created_by,created_at,updated_at,sort_order,depth").single();
    if (data) { setDocs(p => [...p, data]); openDoc(data); }
  };

  const bStyle = (type) => ({
    text: { fontSize: 15, lineHeight: 1.65 }, h1: { fontSize: 28, lineHeight: 1.3, fontWeight: 800, letterSpacing: "-0.02em" },
    h2: { fontSize: 22, lineHeight: 1.35, fontWeight: 700 }, h3: { fontSize: 17, lineHeight: 1.4, fontWeight: 700 },
    bullet: { fontSize: 15, lineHeight: 1.65 }, numbered: { fontSize: 15, lineHeight: 1.65 }, todo: { fontSize: 15, lineHeight: 1.65 },
    quote: { fontSize: 15, lineHeight: 1.65, fontStyle: "italic", borderLeft: `3px solid ${T.accent}`, paddingLeft: 16, color: T.text2 },
    callout: { fontSize: 14, lineHeight: 1.6, background: T.surface2 || T.surface, padding: "12px 14px", borderRadius: 8, border: `1px solid ${T.border}` },
    code: { fontSize: 13, lineHeight: 1.5, fontFamily: "monospace", background: T.surface2 || T.surface, padding: "12px 14px", borderRadius: 8, whiteSpace: "pre-wrap" },
    toggle: { fontSize: 15, lineHeight: 1.65 }, divider: {}, table: {},
  }[type] || {});

  // ──── TABLE COMPONENT ────
  const TableBlock = ({ block }) => {
    const td = block.tableData || { cols: ["A","B","C"], rows: [["","",""],["","",""]], formulas: {} };
    const [editCell, setEditCell] = useState(null); // "r,c"
    const [editVal, setEditVal] = useState("");

    const updateTable = (newTd) => {
      setBlocks(prev => prev.map(b => b.id === block.id ? { ...b, tableData: newTd } : b));
      queueSave();
    };

    const setCell = (r, c, val) => {
      const newRows = td.rows.map((row, ri) => ri === r ? row.map((cell, ci) => ci === c ? val : cell) : [...row]);
      const newFormulas = { ...td.formulas };
      const key = `${r},${c}`;
      if (val.startsWith("=")) newFormulas[key] = val;
      else delete newFormulas[key];
      updateTable({ ...td, rows: newRows, formulas: newFormulas });
    };

    const addRow = () => updateTable({ ...td, rows: [...td.rows, new Array(td.cols.length).fill("")] });
    const addCol = () => updateTable({ ...td, cols: [...td.cols, `Column ${String.fromCharCode(65 + td.cols.length)}`], rows: td.rows.map(r => [...r, ""]) });
    const delRow = (ri) => { if (td.rows.length <= 1) return; updateTable({ ...td, rows: td.rows.filter((_, i) => i !== ri) }); };
    const delCol = (ci) => { if (td.cols.length <= 1) return; updateTable({ ...td, cols: td.cols.filter((_, i) => i !== ci), rows: td.rows.map(r => r.filter((_, i) => i !== ci)) }); };

    const cellStyle = { padding: "6px 10px", border: `1px solid ${T.border}`, fontSize: 13, minWidth: 80, position: "relative", cursor: "text" };
    const headerStyle = { ...cellStyle, fontWeight: 600, fontSize: 12, color: T.text2, background: T.surface2 || T.surface };

    return (
      <div style={{ paddingLeft: 32, paddingBottom: 8 }}>
        <div style={{ overflow: "auto", borderRadius: 6, border: `1px solid ${T.border}` }}>
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr>
                {td.cols.map((col, ci) => (
                  <th key={ci} style={headerStyle}>
                    <input value={col} onChange={e => { const nc = [...td.cols]; nc[ci] = e.target.value; updateTable({ ...td, cols: nc }); }}
                      style={{ background: "transparent", border: "none", outline: "none", color: T.text2, fontSize: 12, fontWeight: 600, width: "100%", fontFamily: "inherit" }} />
                  </th>
                ))}
                <th style={{ ...headerStyle, width: 28, padding: 0, cursor: "pointer" }} onClick={addCol} title="Add column">
                  <span style={{ color: T.text3, fontSize: 14 }}>+</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {td.rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => {
                    const key = `${ri},${ci}`;
                    const isEditing = editCell === key;
                    const formula = td.formulas?.[key];
                    const displayVal = formula ? evalFormula(formula, td) : cell;
                    return (
                      <td key={ci} style={{ ...cellStyle, background: formula ? `${T.accent}08` : "transparent" }}
                        onClick={() => { setEditCell(key); setEditVal(formula || cell); }}>
                        {isEditing ? (
                          <input value={editVal} onChange={e => setEditVal(e.target.value)}
                            onBlur={() => { setCell(ri, ci, editVal); setEditCell(null); }}
                            onKeyDown={e => { if (e.key === "Enter") { setCell(ri, ci, editVal); setEditCell(null); } if (e.key === "Escape") setEditCell(null); if (e.key === "Tab") { e.preventDefault(); setCell(ri, ci, editVal); const nc = ci + 1 < td.cols.length ? `${ri},${ci+1}` : ri + 1 < td.rows.length ? `${ri+1},0` : null; if (nc) { setEditCell(nc); const [nr, ncc] = nc.split(",").map(Number); setEditVal(td.formulas?.[nc] || td.rows[nr]?.[ncc] || ""); } else { setEditCell(null); } } }}
                            style={{ width: "100%", background: "transparent", border: "none", outline: "none", color: T.text, fontSize: 13, fontFamily: formula ? "monospace" : "inherit" }} />
                        ) : (
                          <span style={{ color: formula ? T.accent : T.text, fontFamily: formula ? "monospace" : "inherit", fontSize: 13 }}>
                            {typeof displayVal === "number" ? displayVal.toLocaleString() : displayVal || "\u00A0"}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td style={{ ...cellStyle, width: 28, padding: 0, textAlign: "center", cursor: "pointer" }} onClick={() => delRow(ri)} title="Delete row">
                    <span style={{ color: T.text3, fontSize: 10, opacity: 0.4 }}>×</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
          <button onClick={addRow} style={{ background: "none", border: "none", color: T.text3, fontSize: 11, cursor: "pointer", padding: "2px 6px" }}>+ Row</button>
          <button onClick={addCol} style={{ background: "none", border: "none", color: T.text3, fontSize: 11, cursor: "pointer", padding: "2px 6px" }}>+ Column</button>
          <span style={{ fontSize: 10, color: T.text3, opacity: 0.5, marginLeft: 8 }}>Formulas: =SUM(A1:A5) =AVG(B1:B3) =MIN =MAX =COUNT</span>
        </div>
      </div>
    );
  };

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
        {node.project_id && (() => {
          const lp = projects.find(p => p.id === node.project_id);
          return lp ? <span title={`Linked to ${lp.name}`} style={{ width: 6, height: 6, borderRadius: 3, background: lp.color || T.accent, flexShrink: 0, marginRight: 2 }} /> : null;
        })()}
        {hov && <div style={{ display: "flex", gap: 2, position: "absolute", right: 4 }}>
          <button onClick={e => { e.stopPropagation(); createDoc(node.id); }} style={{ background: T.surface2, border: "none", color: T.text3, cursor: "pointer", fontSize: 10, padding: "2px 4px", borderRadius: 3 }} title="Add sub-page">+</button>
          <button onClick={e => { e.stopPropagation(); setCtx(!ctx); }} style={{ background: T.surface2, border: "none", color: T.text3, cursor: "pointer", fontSize: 10, padding: "2px 4px", borderRadius: 3 }}>···</button>
        </div>}
        {ctx && <div style={{ position: "absolute", right: 0, top: "100%", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, boxShadow: "0 4px 16px rgba(0,0,0,0.2)", zIndex: 50, width: 140 }} onClick={e => e.stopPropagation()}>
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
  const _blockRef = useRef(null);
  if (!_blockRef.current) _blockRef.current = ({ block, index }) => {
    const [hov, setHov] = useState(false);
    if (block.type === "divider") return (
      <div style={{ padding: "8px 0 8px 32", position: "relative" }} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}>
        {hov && <button onClick={() => deleteBlock(block.id)} style={{ position: "absolute", left: 4, top: 4, background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 12 }}>×</button>}
        <div style={{ height: 1, background: T.border }} />
      </div>
    );

    if (block.type === "table") return (
      <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)} style={{ position: "relative" }}>
        {hov && <button onClick={() => deleteBlock(block.id)} style={{ position: "absolute", left: 4, top: 4, background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 12, zIndex: 2 }}>×</button>}
        <TableBlock block={block} />
      </div>
    );

    let numIdx = 1;
    if (block.type === "numbered") { for (let j = index - 1; j >= 0; j--) { if (blocks[j].type === "numbered") numIdx++; else break; } }

    const placeholder = block.type === "h1" ? "Heading 1" : block.type === "h2" ? "Heading 2" : block.type === "h3" ? "Heading 3" : block.type === "quote" ? "Quote..." : index === 0 && blocks.length <= 1 ? "Type '/' for commands..." : "";

    return (
      <div style={{ position: "relative", padding: "1px 0", display: "flex", alignItems: "flex-start", gap: 0, marginLeft: (block.indent || 0) * 24 }}
        onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}>
        <div style={{ width: 32, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", paddingTop: block.type.startsWith("h") ? 6 : 3, opacity: hov ? 0.6 : 0, transition: "opacity 0.1s", cursor: "grab" }}>
          <span style={{ fontSize: 10, color: T.text3, userSelect: "none" }}>⠿</span>
        </div>
        {block.type === "bullet" && <span style={{ color: T.text3, fontSize: block.indent >= 2 ? 10 : block.indent === 1 ? 14 : 20, lineHeight: "26px", flexShrink: 0, width: 18, textAlign: "center" }}>{block.indent >= 2 ? "▪" : block.indent === 1 ? "◦" : "•"}</span>}
        {block.type === "numbered" && <span style={{ color: T.text3, fontSize: 13, lineHeight: "26px", flexShrink: 0, width: 22, textAlign: "right", paddingRight: 4, fontFamily: "monospace" }}>{numIdx}.</span>}
        {block.type === "todo" && <input type="checkbox" checked={block.checked || false} onChange={() => updateBlockMeta(block.id, { checked: !block.checked })} style={{ marginTop: 6, cursor: "pointer", accentColor: T.accent, flexShrink: 0 }} />}
        {block.type === "callout" && (
          <span onClick={() => setCalloutEmojiPicker(calloutEmojiPicker === block.id ? null : block.id)}
            style={{ fontSize: 18, marginTop: 10, flexShrink: 0, cursor: "pointer", position: "relative" }} title="Change emoji">
            {block.emoji || "💡"}
            {calloutEmojiPicker === block.id && (
              <div style={{ position: "absolute", top: "100%", left: 0, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, padding: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.2)", zIndex: 50, display: "flex", gap: 2, flexWrap: "wrap", width: 200 }}
                onClick={e => e.stopPropagation()}>
                {CALLOUT_EMOJIS.map(em => (
                  <span key={em} onClick={() => { updateBlockMeta(block.id, { emoji: em }); setCalloutEmojiPicker(null); }}
                    style={{ fontSize: 18, cursor: "pointer", padding: 3, borderRadius: 4 }}
                    onMouseEnter={e => e.currentTarget.style.background = T.surface2} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>{em}</span>
                ))}
              </div>
            )}
          </span>
        )}
        {block.type === "toggle" && <span onClick={() => updateBlockMeta(block.id, { collapsed: !block.collapsed })} style={{ cursor: "pointer", fontSize: 10, marginTop: 6, flexShrink: 0, color: T.text3, transition: "transform 0.15s", transform: block.collapsed ? "rotate(0deg)" : "rotate(90deg)", display: "inline-block" }}>▶</span>}
        <div style={{ flex: 1, minWidth: 0 }}>
          {block.type === "code" ? (
            <textarea ref={el => blockRefs.current[block.id] = el}
              defaultValue={block.content || ""}
              onChange={e => { blockContents.current[block.id] = e.target.value; queueSave(); }}
              onKeyDown={e => { if (e.key === "Backspace" && !(blockContents.current[block.id] || e.target.value)) { e.preventDefault(); deleteBlock(block.id); } }}
              placeholder="// code..." rows={Math.max(3, (block.content || "").split("\n").length)}
              style={{ ...bStyle("code"), width: "100%", color: T.text, border: "none", outline: "none", resize: "vertical", boxSizing: "border-box" }} />
          ) : (
            <EditableBlock
              blockId={block.id}
              initialContent={block.content || ""}
              style={{
                ...bStyle(block.type),
                color: block.type === "todo" && block.checked ? T.text3 : T.text,
                textDecoration: block.type === "todo" && block.checked ? "line-through" : "none",
              }}
              placeholder={placeholder}
              onContentChange={(text) => handleContentChange(block.id, text)}
              onKeyDown={(e, content) => handleKey(e, block.id, content)}
              onFocus={() => {}}
              onSlash={(rect, filter) => setSlashMenu({ blockId: block.id, x: rect.left, y: rect.bottom + 4, filter })}
              blockRef={(el) => { blockRefs.current[block.id] = el; }}
            />
          )}
        </div>
      </div>
    );
  };
  const Block = _blockRef.current;

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
        <div style={{ padding: "0 10px 8px", display: "flex", gap: 6 }}>
          <button onClick={() => createDoc()} style={{ flex: 1, padding: "7px 10px", borderRadius: 6, border: `1px dashed ${T.border}`, background: "transparent", color: T.accent, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>+ New Page</button>
          <label title="Import from Notion" style={{ padding: "7px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: "transparent", color: T.text3, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center" }}>
            <span>📥</span>
            <input type="file" accept=".zip,.md,.html,.csv" multiple style={{ display: "none" }} onChange={async (e) => {
              const files = e.target.files;
              if (!files || files.length === 0) return;
              const file = files[0];

              // Handle individual markdown files
              if (file.name.endsWith(".md")) {
                const text = await file.text();
                const title = file.name.replace(".md", "").replace(/\s+[a-f0-9]{32}$/, ""); // Strip Notion IDs
                const res = await fetch(supabase.supabaseUrl + "/functions/v1/notion-import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "import", user_id: user?.id, use_ai: true, pages: [{ title, content_md: text, path: title, emoji: "📄" }] }) });
                const result = await res.json();
                alert(result.success ? `Imported: ${title}` : `Error: ${result.error}`);
                loadDocs(); e.target.value = ""; return;
              }

              // Handle zip files (Notion export)
              if (file.name.endsWith(".zip")) {
                try {
                  const JSZip = (await import("jszip")).default;
                  const zip = await JSZip.loadAsync(file);
                  const pages = [];
                  const mdFiles = [];

                  // Collect all markdown files
                  zip.forEach((relativePath, zipEntry) => {
                    if (!zipEntry.dir && (relativePath.endsWith(".md") || relativePath.endsWith(".csv"))) {
                      mdFiles.push({ path: relativePath, entry: zipEntry });
                    }
                  });

                  // Process each file
                  for (const { path, entry } of mdFiles) {
                    const text = await entry.async("string");
                    // Clean up the path: remove Notion IDs (32 hex chars before extension)
                    const cleanPath = path.replace(/\s+[a-f0-9]{32}\.(md|csv)/g, "").replace(/\.(md|csv)$/, "");
                    const parts = cleanPath.split("/").filter(Boolean);
                    const title = parts[parts.length - 1] || "Untitled";
                    const isCSV = path.endsWith(".csv");

                    pages.push({
                      title,
                      content_md: isCSV ? "```csv\n" + text.slice(0, 10000) + "\n```" : text,
                      path: cleanPath,
                      emoji: isCSV ? "📊" : "📄",
                      is_database: isCSV,
                    });
                  }

                  if (pages.length === 0) { alert("No markdown or CSV files found in the zip"); e.target.value = ""; return; }

                  // Send in batches of 50
                  let totalImported = 0;
                  for (let i = 0; i < pages.length; i += 50) {
                    const batch = pages.slice(i, i + 50);
                    const res = await fetch(supabase.supabaseUrl + "/functions/v1/notion-import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "import", user_id: user?.id, use_ai: true, pages: batch }) });
                    const result = await res.json();
                    if (result.imported) totalImported += result.imported;
                  }

                  alert(`Notion import complete: ${totalImported} of ${pages.length} pages imported`);
                  loadDocs();
                } catch (err) { alert("Import error: " + err.message); }
                e.target.value = ""; return;
              }

              alert("Please upload a .zip (Notion export) or .md file");
              e.target.value = "";
            }} />
          </label>
          <button onClick={() => setShowTemplateGallery(v => !v)} title="Templates" style={{ padding: "7px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: showTemplateGallery ? T.accentDim : "transparent", color: showTemplateGallery ? T.accent : T.text3, fontSize: 12, cursor: "pointer" }}>⊞</button>
        </div>
        {showTemplateGallery && (
          <div style={{ margin: "0 10px 8px", padding: 10, background: T.surface2, borderRadius: 8, border: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 8 }}>Templates</div>
            {[
              { emoji: "📋", name: "Project Brief", content: [
                { id: "1", type: "h1", content: "Project Brief" },
                { id: "2", type: "h2", content: "Overview" },
                { id: "3", type: "text", content: "Describe what this project is and why it matters." },
                { id: "4", type: "h2", content: "Goals" },
                { id: "5", type: "bullet", content: "Goal 1" },
                { id: "6", type: "bullet", content: "Goal 2" },
                { id: "7", type: "h2", content: "Scope" },
                { id: "8", type: "text", content: "What is in scope and out of scope." },
                { id: "9", type: "h2", content: "Success Metrics" },
                { id: "10", type: "bullet", content: "Metric 1" },
                { id: "11", type: "h2", content: "Timeline" },
                { id: "12", type: "text", content: "Key milestones and dates." },
              ]},
              { emoji: "📝", name: "Meeting Notes", content: [
                { id: "1", type: "h1", content: "Meeting Notes" },
                { id: "2", type: "text", content: `Date: ${new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}` },
                { id: "3", type: "h2", content: "Attendees" },
                { id: "4", type: "bullet", content: "Name" },
                { id: "5", type: "h2", content: "Agenda" },
                { id: "6", type: "numbered", content: "Topic 1" },
                { id: "7", type: "numbered", content: "Topic 2" },
                { id: "8", type: "h2", content: "Notes" },
                { id: "9", type: "text", content: "" },
                { id: "10", type: "h2", content: "Action Items" },
                { id: "11", type: "todo", content: "Action item", checked: false },
              ]},
              { emoji: "🎯", name: "OKR Plan", content: [
                { id: "1", type: "h1", content: "OKR Plan" },
                { id: "2", type: "h2", content: "Objective" },
                { id: "3", type: "text", content: "State the objective clearly." },
                { id: "4", type: "h2", content: "Key Results" },
                { id: "5", type: "numbered", content: "KR1: [Metric] from [baseline] to [target] by [date]" },
                { id: "6", type: "numbered", content: "KR2: [Metric] from [baseline] to [target] by [date]" },
                { id: "7", type: "h2", content: "Initiatives" },
                { id: "8", type: "bullet", content: "Initiative 1" },
                { id: "9", type: "h2", content: "Risks & Dependencies" },
                { id: "10", type: "text", content: "" },
              ]},
              { emoji: "🔬", name: "Product Spec", content: [
                { id: "1", type: "h1", content: "Product Spec" },
                { id: "2", type: "h2", content: "Problem Statement" },
                { id: "3", type: "text", content: "What problem are we solving?" },
                { id: "4", type: "h2", content: "Proposed Solution" },
                { id: "5", type: "text", content: "How are we solving it?" },
                { id: "6", type: "h2", content: "User Stories" },
                { id: "7", type: "bullet", content: "As a [user], I want [feature] so that [benefit]" },
                { id: "8", type: "h2", content: "Requirements" },
                { id: "9", type: "h3", content: "Must Have" },
                { id: "10", type: "todo", content: "Requirement", checked: false },
                { id: "11", type: "h3", content: "Nice to Have" },
                { id: "12", type: "todo", content: "Requirement", checked: false },
                { id: "13", type: "h2", content: "Out of Scope" },
                { id: "14", type: "text", content: "" },
              ]},
              { emoji: "📊", name: "Weekly Update", content: [
                { id: "1", type: "h1", content: "Weekly Update" },
                { id: "2", type: "text", content: `Week of ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}` },
                { id: "3", type: "h2", content: "✅ What got done" },
                { id: "4", type: "bullet", content: "" },
                { id: "5", type: "h2", content: "🔄 In progress" },
                { id: "6", type: "bullet", content: "" },
                { id: "7", type: "h2", content: "⚠️ Blockers" },
                { id: "8", type: "bullet", content: "" },
                { id: "9", type: "h2", content: "📅 Next week" },
                { id: "10", type: "bullet", content: "" },
              ]},
            ].map(t => (
              <button key={t.name} onClick={async () => {
                const blocksWithIds = t.content.map(b => ({ ...b, id: crypto.randomUUID() }));
                const { data, error } = await supabase.from("documents").insert({
                  org_id: orgId, created_by: user?.id,
                  title: t.name, emoji: t.emoji, status: "draft", visibility: "team",
                  content: blocksWithIds, sort_order: docs.length,
                }).select().single();
                if (!error && data) {
                  setDocs(p => [...p, data]);
                  setBlocks(blocksWithIds);
                  setActiveDoc(data);
                  setShowTemplateGallery(false);
                }
              }} style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", padding: "7px 8px", borderRadius: 6, border: "none", background: "transparent", cursor: "pointer", textAlign: "left", marginBottom: 2 }}
                onMouseEnter={e => e.currentTarget.style.background = T.surface3}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <span style={{ fontSize: 14 }}>{t.emoji}</span>
                <span style={{ fontSize: 12, color: T.text, fontWeight: 500 }}>{t.name}</span>
              </button>
            ))}
          </div>
        )}
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
            <div style={{ fontSize: 14, color: T.text3, marginBottom: 24, textAlign: "center", maxWidth: 400 }}>Create rich documents with nested pages, headings, lists, to-dos, tables, code blocks, and more.</div>
            <button onClick={() => createDoc()} style={{ padding: "10px 24px", borderRadius: 8, border: "none", background: T.accent, color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Create a Page</button>
            <div style={{ marginTop: 12, fontSize: 12, color: T.text3 }}>
              or <label style={{ color: T.accent, cursor: "pointer", fontWeight: 600, textDecoration: "underline" }}>import from Notion<input type="file" accept=".zip,.md" style={{ display: "none" }} onChange={e => { const inp = document.querySelector("input[accept='.zip,.md,.html,.csv']"); if (inp) { inp.files = e.target.files; inp.dispatchEvent(new Event("change", { bubbles: true })); } }} /></label>
            </div>
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
            {/* Project backlink */}
            {(() => {
              const linkedProj = activeDoc.project_id ? projects.find(p => p.id === activeDoc.project_id) : null;
              if (linkedProj) return (
                <button onClick={() => setActive?.("projects")} style={{ display: "flex", alignItems: "center", gap: 5, padding: "3px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text2, fontSize: 11, cursor: "pointer", fontWeight: 500 }}
                  title="Open linked project">
                  <span style={{ width: 8, height: 8, borderRadius: 4, background: linkedProj.color || T.accent, flexShrink: 0, display: "inline-block" }} />
                  {linkedProj.name}
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </button>
              );
              return (
                <select onChange={async e => {
                  const pid = e.target.value;
                  if (!pid) return;
                  await supabase.from("documents").update({ project_id: pid }).eq("org_id", orgId).eq("id", activeDoc.id);
                  setActiveDoc(p => ({ ...p, project_id: pid }));
                  setDocs(p => p.map(d => d.id === activeDoc.id ? { ...d, project_id: pid } : d));
                }} defaultValue="" style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text3, cursor: "pointer", outline: "none" }}>
                  <option value="">Link to project…</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              );
            })()}
            <span style={{ fontSize: 11, color: T.text3, fontStyle: "italic" }}>{saving ? "Saving..." : lastSaved ? "Saved" : ""}</span>
            {(() => {
              const text = blocks.map(b => b.content || "").join(" ").trim();
              const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
              const readMins = Math.max(1, Math.round(words / 200));
              return words > 0 ? (
                <span style={{ fontSize: 10, color: T.text3, padding: "2px 7px", borderRadius: 4, background: T.surface3 }}>
                  {words} words · {readMins} min read
                </span>
              ) : null;
            })()}
            <select value={activeDoc.status || "draft"} onChange={e => updateMeta(activeDoc.id, { status: e.target.value })} style={{ fontSize: 11, padding: "3px 6px", borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface2 || T.bg, color: T.text, fontFamily: "inherit", cursor: "pointer" }}>
              <option value="draft">Draft</option><option value="published">Published</option><option value="review">In Review</option><option value="archived">Archived</option>
            </select>
            {!sidebarCollapsed && <button onClick={() => setSidebarCollapsed(true)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 12, padding: 4 }}>◀</button>}
            <button onClick={() => duplicateDoc(activeDoc)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 11, padding: 4 }} title="Duplicate">⧉</button>
            <button onClick={() => {
              // Export to Markdown
              const md = [
                `# ${activeDoc.title || "Untitled"}`,
                "",
                ...blocks.map(b => {
                  if (b.type === "h1") return `# ${b.content}`;
                  if (b.type === "h2") return `## ${b.content}`;
                  if (b.type === "h3") return `### ${b.content}`;
                  if (b.type === "bullet") return `- ${b.content}`;
                  if (b.type === "numbered") return `1. ${b.content}`;
                  if (b.type === "todo") return `- [${b.checked ? "x" : " "}] ${b.content}`;
                  if (b.type === "quote") return `> ${b.content}`;
                  if (b.type === "code") return `\`\`\`\n${b.content}\n\`\`\``;
                  if (b.type === "divider") return "---";
                  if (b.type === "callout") return `> **${b.emoji || "💡"}** ${b.content}`;
                  return b.content || "";
                })
              ].join("\n");
              const blob = new Blob([md], { type: "text/markdown" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(blob);
              a.download = `${activeDoc.title || "document"}.md`;
              a.click();
            }} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 11, padding: 4 }} title="Export to Markdown">↓</button>
            <button onClick={() => deleteDoc(activeDoc.id)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 12, padding: 4 }} title="Delete">🗑️</button>
          </div>

          {/* EDITOR */}
          <div style={{ flex: 1, overflow: "auto" }} onClick={e => { if (e.target === e.currentTarget) { const last = blocks[blocks.length - 1]; if (last) blockRefs.current[last.id]?.focus(); } }}>
            {activeDoc.cover_url && <div style={{ height: 180, background: activeDoc.cover_url, backgroundSize: "cover", backgroundPosition: "center", position: "relative" }}>
              <div style={{ position: "absolute", bottom: 8, right: 8, display: "flex", gap: 4 }}>
                <button onClick={() => setCoverPicker(!coverPicker)} style={{ padding: "4px 10px", borderRadius: 4, background: "rgba(0,0,0,0.5)", border: "none", color: "#fff", fontSize: 11, cursor: "pointer" }}>Change</button>
                <button onClick={() => updateMeta(activeDoc.id, { cover_url: null })} style={{ padding: "4px 10px", borderRadius: 4, background: "rgba(0,0,0,0.5)", border: "none", color: "#fff", fontSize: 11, cursor: "pointer" }}>Remove</button>
              </div>
            </div>}
            {coverPicker && <div style={{ padding: "12px 24px", display: "flex", gap: 8, flexWrap: "wrap", borderBottom: `1px solid ${T.border}`, background: T.surface }}>
              {COVERS.map((g, i) => <div key={i} onClick={() => { updateMeta(activeDoc.id, { cover_url: g }); setCoverPicker(false); }} style={{ width: 60, height: 32, borderRadius: 6, background: g, cursor: "pointer", border: `2px solid ${activeDoc.cover_url === g ? T.accent : "transparent"}` }} />)}
            </div>}
            <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 40px" }}>
              <div style={{ paddingTop: activeDoc.cover_url ? 20 : 50, paddingBottom: 4 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span onClick={() => setEmojiPicker(!emojiPicker)} style={{ fontSize: 48, cursor: "pointer", userSelect: "none" }}>{activeDoc.emoji || "📄"}</span>
                  {!activeDoc.cover_url && <button onClick={() => setCoverPicker(true)} style={{ background: "none", border: "none", color: T.text3, fontSize: 11, cursor: "pointer", opacity: 0.5 }}>+ Add cover</button>}
                </div>
                {emojiPicker && <div style={{ display: "flex", gap: 4, flexWrap: "wrap", padding: "8px 0", maxWidth: 320 }}>
                  {EMOJIS.map(e => <span key={e} onClick={() => { updateMeta(activeDoc.id, { emoji: e }); setEmojiPicker(false); }} style={{ fontSize: 22, cursor: "pointer", padding: 4, borderRadius: 4 }} onMouseEnter={ev => ev.currentTarget.style.background = T.surface2} onMouseLeave={ev => ev.currentTarget.style.background = "transparent"}>{e}</span>)}
                </div>}
                <input value={activeDoc.title || ""} onChange={e => { const t = e.target.value; setActiveDoc(p => ({ ...p, title: t })); setDocs(p => p.map(d => d.id === activeDoc.id ? { ...d, title: t } : d)); if (titleSaveTimer.current) clearTimeout(titleSaveTimer.current); titleSaveTimer.current = setTimeout(() => supabase.from("documents").update({ title: t, updated_at: now() }).eq("org_id", orgId).eq("id", activeDoc.id), 600); }}
                  placeholder="Untitled" style={{ fontSize: 34, fontWeight: 800, color: T.text, background: "transparent", border: "none", outline: "none", width: "100%", fontFamily: "inherit", padding: 0, letterSpacing: "-0.02em" }} />
              </div>
              <div style={{ paddingBottom: 200, paddingTop: 8 }}>
                {blocks.map((b, i) => <Block key={b.id} block={b} index={i} />)}
                <div style={{ paddingLeft: 32, paddingTop: 8 }}>
                  <button onClick={() => { const last = blocks[blocks.length - 1]; if (last) insertBlockAfter(last.id); else { const nb = mkBlock(); blockContents.current[nb.id] = ""; setBlocks([nb]); } }}
                    style={{ background: "none", border: "none", color: T.text3, fontSize: 12, cursor: "pointer", padding: "4px 8px", borderRadius: 4, opacity: 0.4 }}
                    onMouseEnter={e => e.currentTarget.style.opacity = 1} onMouseLeave={e => e.currentTarget.style.opacity = 0.4}>+ Add a block</button>
                </div>
              </div>
            </div>
          </div>
        </>}
      </div>

      {/* SLASH MENU with search */}
      {slashMenu && <div style={{ position: "fixed", left: Math.min(slashMenu.x, window.innerWidth - 240), top: Math.min(slashMenu.y, window.innerHeight - 340), width: 230, background: T.surface || "#fff", borderRadius: 8, border: `1px solid ${T.border}`, boxShadow: "0 8px 30px rgba(0,0,0,0.2)", zIndex: 100, overflow: "hidden", maxHeight: 340 }}>
        <div style={{ padding: "8px 10px", borderBottom: `1px solid ${T.border}` }}>
          <input value={slashMenu.filter} onChange={e => setSlashMenu(p => ({ ...p, filter: e.target.value.toLowerCase() }))}
            placeholder="Search blocks..." onKeyDown={e => { if (e.key === "Escape") setSlashMenu(null); if (e.key === "Enter") { const filtered = SLASH_CMDS.filter(c => !slashMenu.filter || c.label.toLowerCase().includes(slashMenu.filter) || c.type.includes(slashMenu.filter)); if (filtered.length) { changeBlockType(slashMenu.blockId, filtered[0].type); blockContents.current[slashMenu.blockId] = ""; } } }}
            style={{ width: "100%", background: "transparent", border: "none", outline: "none", color: T.text, fontSize: 12, fontFamily: "inherit" }} />
        </div>
        <div style={{ overflowY: "auto", maxHeight: 290 }}>
          {SLASH_CMDS.filter(c => !slashMenu.filter || c.label.toLowerCase().includes(slashMenu.filter) || c.type.includes(slashMenu.filter)).map(cmd => (
            <div key={cmd.type} onClick={() => { changeBlockType(slashMenu.blockId, cmd.type); blockContents.current[slashMenu.blockId] = ""; }}
              style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", cursor: "pointer", fontSize: 13, color: T.text }}
              onMouseEnter={e => e.currentTarget.style.background = T.surface2 || T.border} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
              <span style={{ width: 28, height: 28, borderRadius: 4, background: T.surface2 || T.bg, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 600, color: T.text2, flexShrink: 0 }}>{cmd.icon}</span>
              <span>{cmd.label}</span>
            </div>
          ))}
        </div>
      </div>}

      <style>{`[contenteditable]:empty:before{content:attr(data-placeholder);color:${T.text3};pointer-events:none}[contenteditable]:focus{outline:none}::-webkit-scrollbar{width:6px}::-webkit-scrollbar-track{background:transparent}::-webkit-scrollbar-thumb{background:${T.border};border-radius:3px}`}</style>
    </div>
  );
}
