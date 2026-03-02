"use client";
import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";
import { NAV_ITEMS } from "./Sidebar";

export default function CommandPalette({ open, onClose, setActive }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) { setQuery(""); setResults([]); setSelected(0); setTimeout(() => inputRef.current?.focus(), 50); }
  }, [open]);

  useEffect(() => {
    if (!query.trim()) { setResults(navResults()); return; }
    const timer = setTimeout(async () => {
      const q = query.toLowerCase();
      // Search nav items
      const nav = NAV_ITEMS.filter(n => n.label.toLowerCase().includes(q)).map(n => ({
        type: "nav", id: n.key, title: n.label, sub: "Navigate", icon: "→",
      }));
      // Search tasks
      const { data: tasks } = await supabase.from("tasks").select("id, title, status, project_id")
        .is("deleted_at", null).ilike("title", `%${query}%`).limit(8);
      const taskResults = (tasks || []).map(t => ({
        type: "task", id: t.id, title: t.title, sub: t.status, icon: "☐",
      }));
      // Search projects
      const { data: projects } = await supabase.from("projects").select("id, name, color")
        .is("deleted_at", null).ilike("name", `%${query}%`).limit(5);
      const projResults = (projects || []).map(p => ({
        type: "project", id: p.id, title: p.name, sub: "Project", icon: "◼",
        color: p.color,
      }));
      setResults([...nav, ...projResults, ...taskResults]);
      setSelected(0);
    }, 150);
    return () => clearTimeout(timer);
  }, [query]);

  const navResults = () => NAV_ITEMS.slice(0, 6).map(n => ({
    type: "nav", id: n.key, title: n.label, sub: "Navigate", icon: "→",
  }));

  const handleSelect = (item) => {
    if (item.type === "nav") { setActive(item.id); onClose(); }
    else if (item.type === "project") { setActive("projects"); onClose(); }
    else if (item.type === "task") { setActive("projects"); onClose(); }
  };

  const handleKey = (e) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setSelected(p => Math.min(p + 1, results.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelected(p => Math.max(p - 1, 0)); }
    else if (e.key === "Enter" && results[selected]) { handleSelect(results[selected]); }
    else if (e.key === "Escape") { onClose(); }
  };

  if (!open) return null;

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "flex-start", justifyContent: "center", paddingTop: 80 }}
      onClick={onClose}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} />
      <div onClick={e => e.stopPropagation()} style={{
        position: "relative", width: 520, maxHeight: "60vh", background: T.surface,
        borderRadius: 14, border: `1px solid ${T.border}`, overflow: "hidden",
        boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
      }}>
        {/* Search input */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "14px 18px", borderBottom: `1px solid ${T.border}` }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill={T.text3}><circle cx="7" cy="7" r="5.5" fill="none" stroke={T.text3} strokeWidth="2"/><line x1="11" y1="11" x2="15" y2="15" stroke={T.text3} strokeWidth="2" strokeLinecap="round"/></svg>
          <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={handleKey}
            placeholder="Search tasks, projects, or navigate…"
            style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: T.text, fontSize: 15, fontFamily: "inherit" }} />
          <kbd style={{ padding: "2px 6px", borderRadius: 4, border: `1px solid ${T.border}`, fontSize: 10, color: T.text3, fontFamily: "monospace" }}>ESC</kbd>
        </div>
        {/* Results */}
        <div style={{ maxHeight: 360, overflow: "auto", padding: "6px 0" }}>
          {results.length === 0 && query.trim() && (
            <div style={{ padding: "20px 18px", textAlign: "center", color: T.text3, fontSize: 13 }}>No results found</div>
          )}
          {results.map((item, i) => (
            <div key={`${item.type}-${item.id}`}
              onClick={() => handleSelect(item)}
              onMouseEnter={() => setSelected(i)}
              style={{
                display: "flex", alignItems: "center", gap: 12, padding: "10px 18px", cursor: "pointer",
                background: i === selected ? `${T.accent}15` : "transparent",
                transition: "background 0.1s",
              }}>
              <span style={{
                width: 28, height: 28, borderRadius: 6, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: item.color ? `${item.color}20` : T.surface2, fontSize: 13,
                color: item.color || T.text3, fontWeight: 700,
              }}>{item.icon}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</div>
                <div style={{ fontSize: 10, color: T.text3, marginTop: 1 }}>{item.sub}</div>
              </div>
              {i === selected && <span style={{ fontSize: 10, color: T.text3 }}>↵ Enter</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
