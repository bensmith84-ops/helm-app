"use client";
import { useState, useEffect, useRef } from "react";
import { T } from "../tokens";

function SearchableMultiSelect({ options, selected, onChange, placeholder, multi = true, allByDefault = false }) {
  // options: [{ value, label, color?, icon? }]
  // selected: "all" | string | string[] 
  // When allByDefault=true and selected="all", all items are considered selected
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const isAll = allByDefault && selected === "all";
  const selArr = multi ? (isAll ? options.map(o => o.value) : Array.isArray(selected) ? selected : selected ? [selected] : []) : [];
  const selSingle = !multi ? (selected || "") : "";
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const fn = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [open]);

  const filtered = options.filter(o =>
    o.label.toLowerCase().includes(search.toLowerCase())
  );

  const toggleItem = (val) => {
    if (!multi) { onChange(val === selSingle ? "" : val); setOpen(false); return; }
    const next = selArr.includes(val) ? selArr.filter(v => v !== val) : [...selArr, val];
    // If all items are now selected again and allByDefault, go back to "all"
    if (allByDefault && next.length === options.length) { onChange("all"); return; }
    onChange(next);
  };

  const displayText = () => {
    if (!multi) {
      const opt = options.find(o => o.value === selSingle);
      return opt ? opt.label : placeholder || "Select...";
    }
    if (isAll || selArr.length === options.length) return placeholder || "All";
    if (selArr.length === 0) return placeholder || "Any";
    if (selArr.length === 1) { const o = options.find(op => op.value === selArr[0]); return o ? `${placeholder ? placeholder + ": " : ""}${o.label}` : selArr[0]; }
    return `${placeholder ? placeholder + ": " : ""}${selArr.length} of ${options.length}`;
  };

  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }}>
      <div onClick={() => { setOpen(!open); setSearch(""); }}
        style={{ width: "100%", padding: "6px 10px", borderRadius: 6, border: `1px solid ${(multi ? (selArr.length > 0 && selArr.length < options.length) : selSingle) ? T.accent : T.border}`, background: T.surface2, color: (multi ? (selArr.length > 0 && selArr.length < options.length) : selSingle) ? T.accent : T.text3, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", boxSizing: "border-box", minHeight: 32, fontWeight: (multi ? (selArr.length > 0 && selArr.length < options.length) : selSingle) ? 600 : 400 }}>
        <span>{displayText()}</span>
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.15s" }}><path d="M3 4.5l3 3 3-3" stroke={T.text3} strokeWidth="1.5" strokeLinecap="round"/></svg>
      </div>
      {open && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 60, marginTop: 4, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.3)", maxHeight: 240, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "6px 8px", borderBottom: `1px solid ${T.border}` }}>
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..."
              onClick={e => e.stopPropagation()}
              style={{ width: "100%", padding: "5px 8px", borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, fontSize: 11, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
          </div>
          <div style={{ overflow: "auto", maxHeight: 190 }}>
            {multi && (
              <div style={{ display: "flex", gap: 4, padding: "6px 12px", borderBottom: `1px solid ${T.border}08` }}>
                <span onClick={() => onChange(allByDefault ? "all" : options.map(o => o.value))} style={{ fontSize: 11, color: T.accent, cursor: "pointer", fontWeight: 500 }}
                  onMouseEnter={e => e.currentTarget.style.textDecoration = "underline"} onMouseLeave={e => e.currentTarget.style.textDecoration = "none"}>
                  Select all
                </span>
                <span style={{ color: T.text3, fontSize: 11 }}>·</span>
                <span onClick={() => onChange([])} style={{ fontSize: 11, color: T.text3, cursor: "pointer" }}
                  onMouseEnter={e => e.currentTarget.style.textDecoration = "underline"} onMouseLeave={e => e.currentTarget.style.textDecoration = "none"}>
                  Clear
                </span>
              </div>
            )}
            {!multi && (
              <div onClick={() => { onChange(""); setOpen(false); }} style={{ padding: "6px 12px", fontSize: 11, color: T.text3, cursor: "pointer" }}
                onMouseEnter={e => e.currentTarget.style.background = T.surface2} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                {placeholder || "Any"}
              </div>
            )}
            {filtered.map(o => {
              const isSelected = multi ? selArr.includes(o.value) : selSingle === o.value;
              return (
                <div key={o.value} onClick={() => toggleItem(o.value)}
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 12px", fontSize: 12, color: T.text, cursor: "pointer" }}
                  onMouseEnter={e => e.currentTarget.style.background = T.surface2} onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  {multi ? (
                    <div style={{ width: 14, height: 14, borderRadius: 3, border: `1.5px solid ${isSelected ? T.accent : T.border}`, background: isSelected ? T.accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {isSelected && <span style={{ color: "#fff", fontSize: 8, fontWeight: 800 }}>✓</span>}
                    </div>
                  ) : (
                    <div style={{ width: 10, height: 10, borderRadius: 5, border: `1.5px solid ${isSelected ? T.accent : T.border}`, background: isSelected ? T.accent : "transparent", flexShrink: 0 }} />
                  )}
                  {o.icon && <span style={{ fontSize: 12 }}>{o.icon}</span>}
                  {o.color && <span style={{ width: 8, height: 8, borderRadius: 4, background: o.color, flexShrink: 0 }} />}
                  <span style={{ fontWeight: isSelected ? 600 : 400 }}>{o.label}</span>
                </div>
              );
            })}
            {filtered.length === 0 && <div style={{ padding: "12px", textAlign: "center", color: T.text3, fontSize: 11 }}>No matches</div>}
          </div>
        </div>
      )}
    </div>
  );
}


export default SearchableMultiSelect;
