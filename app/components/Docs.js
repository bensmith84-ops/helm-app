"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";

const AVATAR_COLORS = ["#3b82f6","#a855f7","#ec4899","#06b6d4","#f97316","#22c55e","#84cc16","#ef4444"];
const acol = (uid) => uid ? AVATAR_COLORS[uid.charCodeAt(uid.length - 1) % AVATAR_COLORS.length] : T.text3;
const STATUS_CFG = {
  published: { label: "Published", color: "#22c55e", bg: "#0d3a20" },
  draft: { label: "Draft", color: "#eab308", bg: "#3d3000" },
  archived: { label: "Archived", color: "#64748b", bg: "#1e293b" },
  review: { label: "In Review", color: "#f97316", bg: "#3d2000" },
};
const FOLDERS = [
  { id: "all", name: "All Documents", icon: "📄" },
  { id: "product", name: "Product", icon: "🚀" },
  { id: "engineering", name: "Engineering", icon: "⚙️" },
  { id: "marketing", name: "Marketing", icon: "📣" },
  { id: "design", name: "Design", icon: "🎨" },
  { id: "general", name: "General", icon: "📁" },
];

export default function DocsView() {
  const [docs, setDocs] = useState([]);
  const [profiles, setProfiles] = useState({});
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [activeFolder, setActiveFolder] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: d }, { data: prof }] = await Promise.all([
        supabase.from("docs").select("*").is("deleted_at", null).order("updated_at", { ascending: false }),
        supabase.from("profiles").select("id,display_name"),
      ]);
      setDocs(d || []);
      const m = {}; (prof || []).forEach(u => { m[u.id] = u; }); setProfiles(m);
      setLoading(false);
    })();
  }, []);

  const ini = (uid) => { const u = profiles[uid]; return u?.display_name ? u.display_name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() : "?"; };
  const uname = (uid) => profiles[uid]?.display_name || "Unknown";
  const Ava = ({ uid, sz = 24 }) => {
    const c = uid ? acol(uid) : T.text3;
    return (<div title={uname(uid)} style={{ width: sz, height: sz, borderRadius: "50%", background: `${c}18`, border: `1.5px solid ${c}50`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: Math.max(sz * 0.36, 9), fontWeight: 700, color: c, flexShrink: 0 }}>{ini(uid)}</div>);
  };

  const createDoc = async () => {
    const title = prompt("Document title:");
    if (!title?.trim()) return;
    const { data } = await supabase.from("docs").insert({
      org_id: "a0000000-0000-0000-0000-000000000001",
      title: title.trim(), status: "draft", folder: activeFolder === "all" ? "general" : activeFolder,
    }).select().single();
    if (data) { setDocs(p => [data, ...p]); setSelectedDoc(data); }
  };

  const updateDoc = async (id, updates) => {
    const ts = { ...updates, updated_at: new Date().toISOString() };
    setDocs(p => p.map(d => d.id === id ? { ...d, ...ts } : d));
    if (selectedDoc?.id === id) setSelectedDoc(p => ({ ...p, ...ts }));
    await supabase.from("docs").update(ts).eq("id", id);
  };

  const deleteDoc = async (id) => {
    if (!confirm("Delete this document?")) return;
    setDocs(p => p.filter(d => d.id !== id));
    if (selectedDoc?.id === id) setSelectedDoc(null);
    await supabase.from("docs").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  };

  const filtered = docs.filter(d => {
    if (search && !d.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (activeFolder !== "all" && d.folder !== activeFolder) return false;
    return true;
  });

  const folderCounts = {};
  docs.forEach(d => { folderCounts[d.folder] = (folderCounts[d.folder] || 0) + 1; });

  if (loading) return <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: T.text3, fontSize: 13 }}>Loading docs…</div>;

  return (
    <div style={{ display: "flex", height: "100%", overflow: "hidden" }}>
      <div style={{ width: 220, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", background: T.bg, flexShrink: 0 }}>
        <div style={{ padding: "20px 16px 14px" }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: T.text3, letterSpacing: "0.1em", textTransform: "uppercase" }}>Documents</span>
        </div>
        <div style={{ padding: "0 10px 10px" }}>
          <button onClick={createDoc} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: `1px dashed ${T.border}`, background: "transparent", color: T.accent, fontSize: 12, fontWeight: 600, cursor: "pointer" }}>+ New Document</button>
        </div>
        <div style={{ padding: "0 8px" }}>
          {FOLDERS.map(f => {
            const on = activeFolder === f.id;
            const count = f.id === "all" ? docs.length : (folderCounts[f.id] || 0);
            return (
              <button key={f.id} onClick={() => setActiveFolder(f.id)} style={{
                width: "100%", textAlign: "left", padding: "8px 12px", borderRadius: 8, border: "none",
                cursor: "pointer", display: "flex", alignItems: "center", gap: 10,
                background: on ? `${T.accent}15` : "transparent", color: on ? T.text : T.text2,
                fontSize: 13, marginBottom: 1, fontWeight: on ? 600 : 400,
              }}>
                <span style={{ fontSize: 14 }}>{f.icon}</span>
                <span style={{ flex: 1 }}>{f.name}</span>
                {count > 0 && <span style={{ fontSize: 10, color: T.text3, fontWeight: 600 }}>{count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "16px 24px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, flex: 1 }}>{FOLDERS.find(f => f.id === activeFolder)?.icon} {FOLDERS.find(f => f.id === activeFolder)?.name}</h2>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", borderRadius: 8, background: T.surface2, border: `1px solid ${T.border}` }}>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search docs…" style={{ background: "transparent", border: "none", outline: "none", color: T.text, fontSize: 12, width: 140, fontFamily: "inherit" }} />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 120px 100px 90px", padding: "8px 24px", fontSize: 10, fontWeight: 600, color: T.text3, textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: `1px solid ${T.border}` }}>
          <span>Document</span><span>Author</span><span>Updated</span><span>Status</span>
        </div>
        <div style={{ flex: 1, overflow: "auto" }}>
          {filtered.length === 0 && (
            <div style={{ textAlign: "center", padding: 40, color: T.text3 }}>
              <div style={{ fontSize: 14, marginBottom: 8 }}>No documents yet</div>
              <button onClick={createDoc} style={{ padding: "8px 18px", fontSize: 13, fontWeight: 600, borderRadius: 6, border: "none", background: T.accent, color: "#fff", cursor: "pointer" }}>Create your first doc</button>
            </div>
          )}
          {filtered.map(doc => {
            const sel = selectedDoc?.id === doc.id;
            const st = STATUS_CFG[doc.status] || STATUS_CFG.draft;
            return (
              <div key={doc.id} onClick={() => setSelectedDoc(doc)} style={{
                display: "grid", gridTemplateColumns: "1fr 120px 100px 90px", padding: "12px 24px", alignItems: "center", cursor: "pointer",
                borderBottom: `1px solid ${T.border}`, background: sel ? `${T.accent}10` : "transparent", borderLeft: sel ? `3px solid ${T.accent}` : "3px solid transparent",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 22 }}>{doc.emoji || "📄"}</span>
                  <div><div style={{ fontSize: 14, fontWeight: 600, marginBottom: 2 }}>{doc.title}</div></div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}><Ava uid={doc.author_id} sz={22} /><span style={{ fontSize: 12, color: T.text2 }}>{uname(doc.author_id)}</span></div>
                <span style={{ fontSize: 12, color: T.text3 }}>{doc.updated_at ? new Date(doc.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "—"}</span>
                <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 6, background: st.bg, color: st.color, textAlign: "center" }}>{st.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {selectedDoc && (
        <div style={{ width: 420, borderLeft: `1px solid ${T.border}`, background: T.surface, flexShrink: 0, overflow: "auto", display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 20px", borderBottom: `1px solid ${T.border}` }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: T.text3 }}>Editor</span>
            <button onClick={() => setSelectedDoc(null)} style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text3, cursor: "pointer", width: 28, height: 28, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="12" height="12" viewBox="0 0 12 12"><path d="M2 2l8 8M10 2l-8 8" stroke={T.text3} strokeWidth="1.5" strokeLinecap="round"/></svg>
            </button>
          </div>
          <div style={{ padding: 24, flex: 1 }}>
            <input value={selectedDoc.title} onChange={e => updateDoc(selectedDoc.id, { title: e.target.value })}
              style={{ fontSize: 20, fontWeight: 700, color: T.text, background: "transparent", border: "none", outline: "none", width: "100%", marginBottom: 12, fontFamily: "inherit" }} />
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <select value={selectedDoc.status} onChange={e => updateDoc(selectedDoc.id, { status: e.target.value })}
                style={{ fontSize: 11, padding: "4px 8px", borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontFamily: "inherit", cursor: "pointer" }}>
                {Object.entries(STATUS_CFG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
              <select value={selectedDoc.folder || "general"} onChange={e => updateDoc(selectedDoc.id, { folder: e.target.value })}
                style={{ fontSize: 11, padding: "4px 8px", borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontFamily: "inherit", cursor: "pointer" }}>
                {FOLDERS.filter(f => f.id !== "all").map(f => <option key={f.id} value={f.id}>{f.icon} {f.name}</option>)}
              </select>
            </div>
            <textarea value={selectedDoc.content || ""} onChange={e => updateDoc(selectedDoc.id, { content: e.target.value })}
              placeholder="Start writing…"
              style={{ width: "100%", minHeight: 300, fontSize: 14, color: T.text, lineHeight: 1.7, padding: 16, background: T.surface2, borderRadius: 10, border: `1px solid ${T.border}`, resize: "vertical", outline: "none", fontFamily: "inherit" }} />
            <div style={{ marginTop: 16 }}>
              <button onClick={() => deleteDoc(selectedDoc.id)} style={{ padding: "7px 14px", fontSize: 12, fontWeight: 600, borderRadius: 6, border: "1px solid #ef444440", background: "#ef444410", color: "#ef4444", cursor: "pointer" }}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
