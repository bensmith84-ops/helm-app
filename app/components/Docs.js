"use client";
import { useState } from "react";
import { T, DOCS, getUser } from "../tokens";

const AVATAR_COLORS = ["#3b82f6","#a855f7","#ec4899","#06b6d4","#f97316","#22c55e","#84cc16","#ef4444"];
const STATUS_CFG = {
  published: { label: "Published", color: "#22c55e", bg: "#0d3a20" },
  draft: { label: "Draft", color: "#eab308", bg: "#3d3000" },
  archived: { label: "Archived", color: "#64748b", bg: "#1e293b" },
  review: { label: "In Review", color: "#f97316", bg: "#3d2000" },
};

const FOLDERS = [
  { id: "all", name: "All Documents", icon: "📄", count: DOCS.length },
  { id: "product", name: "Product", icon: "🚀" },
  { id: "engineering", name: "Engineering", icon: "⚙️" },
  { id: "marketing", name: "Marketing", icon: "📣" },
  { id: "design", name: "Design", icon: "🎨" },
];

const AI_ACTIONS = [
  { name: "Write", icon: "✏️", desc: "Generate new content" },
  { name: "Summarize", icon: "📋", desc: "Condense key points" },
  { name: "Expand", icon: "📐", desc: "Add detail and depth" },
  { name: "Translate", icon: "🌐", desc: "Convert to another language" },
  { name: "Fix Grammar", icon: "✓", desc: "Clean up writing" },
  { name: "Brainstorm", icon: "💡", desc: "Generate ideas" },
  { name: "Outline", icon: "📑", desc: "Create document structure" },
  { name: "Extract Actions", icon: "☑️", desc: "Pull out action items" },
];

export default function DocsView() {
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [activeFolder, setActiveFolder] = useState("all");
  const [search, setSearch] = useState("");
  const [hoveredDoc, setHoveredDoc] = useState(null);

  const filtered = DOCS.filter(d => {
    if (search) return d.title.toLowerCase().includes(search.toLowerCase());
    return true;
  });

  const Ava = ({ uid, sz = 24 }) => {
    const u = getUser(uid);
    const c = AVATAR_COLORS[uid.charCodeAt(1) % AVATAR_COLORS.length];
    return (
      <div title={u.name} style={{
        width: sz, height: sz, borderRadius: "50%", background: `${c}18`, border: `1.5px solid ${c}50`,
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: Math.max(sz * 0.36, 9), fontWeight: 700, color: c, flexShrink: 0,
      }}>{u.avatar}</div>
    );
  };

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      {/* Sidebar */}
      <div style={{ width: 220, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", background: T.bg, flexShrink: 0 }}>
        <div style={{ padding: "20px 16px 14px" }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: T.text3, letterSpacing: "0.1em", textTransform: "uppercase" }}>Documents</span>
        </div>
        <div style={{ padding: "0 10px 10px" }}>
          <button style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px dashed ${T.border}`, background: "transparent", color: T.accent, fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
            <svg width="12" height="12" viewBox="0 0 12 12"><path d="M6 1v10M1 6h10" stroke={T.accent} strokeWidth="1.5" strokeLinecap="round"/></svg>
            New Document
          </button>
        </div>
        <div style={{ padding: "0 8px" }}>
          {FOLDERS.map(f => {
            const on = activeFolder === f.id;
            return (
              <button key={f.id} onClick={() => setActiveFolder(f.id)} style={{
                width: "100%", textAlign: "left", padding: "8px 12px", borderRadius: 8, border: "none",
                cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
                background: on ? `${T.accent}15` : "transparent", color: on ? T.text : T.text2,
                fontSize: 13, marginBottom: 1, transition: "all 0.12s", fontWeight: on ? 600 : 400,
              }}>
                <span style={{ fontSize: 14 }}>{f.icon}</span>
                <span style={{ flex: 1 }}>{f.name}</span>
                {f.count && <span style={{ fontSize: 10, color: T.text3, fontWeight: 600 }}>{f.count}</span>}
              </button>
            );
          })}
        </div>

        {/* AI Assistant */}
        <div style={{ marginTop: "auto", padding: "12px 10px", borderTop: `1px solid ${T.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "0 8px", marginBottom: 8 }}>
            <span style={{ fontSize: 14 }}>✨</span>
            <span style={{ fontSize: 11, fontWeight: 700, color: T.text3, letterSpacing: "0.04em", textTransform: "uppercase" }}>AI Assistant</span>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4, padding: "0 4px" }}>
            {AI_ACTIONS.slice(0, 4).map(a => (
              <button key={a.name} title={a.desc} style={{
                padding: "4px 10px", borderRadius: 6, border: `1px solid ${T.border}`,
                background: T.surface2, color: T.text2, fontSize: 11, cursor: "pointer",
                display: "flex", alignItems: "center", gap: 4,
              }}>
                <span style={{ fontSize: 11 }}>{a.icon}</span>{a.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main list */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ padding: "16px 24px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, flex: 1 }}>
            {FOLDERS.find(f => f.id === activeFolder)?.icon} {FOLDERS.find(f => f.id === activeFolder)?.name}
          </h2>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", borderRadius: 8, background: T.surface2, border: `1px solid ${search ? T.accent : T.border}`, transition: "border-color 0.15s" }}>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><circle cx="7" cy="7" r="5.5" stroke={T.text3} strokeWidth="2" fill="none"/><line x1="11" y1="11" x2="15" y2="15" stroke={T.text3} strokeWidth="2" strokeLinecap="round"/></svg>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search docs…" style={{ background: "transparent", border: "none", outline: "none", color: T.text, fontSize: 12, width: 140 }} />
            {search && <button onClick={() => setSearch("")} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 14, padding: 0 }}>×</button>}
          </div>
        </div>

        {/* Column headers */}
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 120px 100px 90px",
          padding: "8px 24px", fontSize: 10, fontWeight: 600, color: T.text3,
          textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${T.border}`,
        }}>
          <span>Document</span><span>Author</span><span>Updated</span><span>Status</span>
        </div>

        {/* Doc list */}
        <div style={{ flex: 1, overflow: "auto" }}>
          {filtered.map(doc => {
            const sel = selectedDoc?.id === doc.id;
            const hov = hoveredDoc === doc.id;
            const u = getUser(doc.author);
            const st = STATUS_CFG[doc.status] || STATUS_CFG.draft;
            return (
              <div key={doc.id}
                onClick={() => setSelectedDoc(doc)}
                onMouseEnter={() => setHoveredDoc(doc.id)}
                onMouseLeave={() => setHoveredDoc(null)}
                style={{
                  display: "grid", gridTemplateColumns: "1fr 120px 100px 90px",
                  padding: "12px 24px", alignItems: "center", cursor: "pointer",
                  borderBottom: `1px solid ${T.border}`,
                  background: sel ? `${T.accent}10` : hov ? `${T.text}04` : "transparent",
                  borderLeft: sel ? `3px solid ${T.accent}` : "3px solid transparent",
                  transition: "background 0.1s",
                }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 22 }}>{doc.emoji}</span>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{doc.title}</div>
                    {doc.description && <div style={{ fontSize: 11, color: T.text3, lineHeight: 1.3 }}>{doc.description}</div>}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Ava uid={doc.author} sz={22} />
                  <span style={{ fontSize: 12, color: T.text2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</span>
                </div>
                <span style={{ fontSize: 12, color: T.text3 }}>{doc.updated}</span>
                <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 6, background: st.bg, color: st.color, display: "inline-block", textAlign: "center" }}>{st.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail panel */}
      {selectedDoc && (
        <div style={{ width: 360, borderLeft: `1px solid ${T.border}`, background: T.surface, flexShrink: 0, overflow: "auto", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: `1px solid ${T.border}` }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: T.text3 }}>Document Details</span>
            <button onClick={() => setSelectedDoc(null)} style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text3, cursor: "pointer", width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8" stroke={T.text3} strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>
          </div>
          <div style={{ padding: "24px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
              <span style={{ fontSize: 36 }}>{selectedDoc.emoji}</span>
              <div>
                <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>{selectedDoc.title}</div>
                <div style={{ fontSize: 12, color: T.text3, marginTop: 4 }}>
                  {(() => { const st = STATUS_CFG[selectedDoc.status] || STATUS_CFG.draft; return (
                    <span style={{ padding: "2px 10px", borderRadius: 6, background: st.bg, color: st.color, fontSize: 11, fontWeight: 600 }}>{st.label}</span>
                  ); })()}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
              <button style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "none", background: T.accent, color: "#fff", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>Open</button>
              <button style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 12, fontWeight: 500, cursor: "pointer" }}>Share</button>
            </div>

            {/* Fields */}
            {[
              { icon: "👤", label: "Author", value: getUser(selectedDoc.author).name },
              { icon: "📅", label: "Updated", value: selectedDoc.updated },
              { icon: "📋", label: "Status", value: (STATUS_CFG[selectedDoc.status] || STATUS_CFG.draft).label },
              { icon: "📁", label: "Category", value: "General" },
            ].map(f => (
              <div key={f.label} style={{ display: "grid", gridTemplateColumns: "110px 1fr", padding: "10px 0", borderBottom: `1px solid ${T.border}`, alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: T.text3 }}>
                  <span style={{ fontSize: 14 }}>{f.icon}</span><span>{f.label}</span>
                </div>
                <span style={{ fontSize: 13, color: T.text }}>{f.value}</span>
              </div>
            ))}

            {/* AI Actions */}
            <div style={{ marginTop: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <span style={{ fontSize: 14 }}>✨</span>
                <span style={{ fontSize: 13, fontWeight: 600 }}>AI Actions</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                {AI_ACTIONS.map(a => (
                  <button key={a.name} style={{
                    padding: "10px 12px", borderRadius: 8, border: `1px solid ${T.border}`,
                    background: T.surface2, cursor: "pointer", textAlign: "left",
                  }}>
                    <div style={{ fontSize: 14, marginBottom: 4 }}>{a.icon}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: T.text, marginBottom: 2 }}>{a.name}</div>
                    <div style={{ fontSize: 10, color: T.text3 }}>{a.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}