"use client";
import { useState, useRef, useCallback, useEffect } from "react";

const T = {
  bg: "#0e0e14", surface: "#16161e", surface2: "#1c1c26", surface3: "#24242e",
  border: "#2a2a36", text: "#e8e8f0", text2: "#b0b0c0", text3: "#6a6a7e",
  accent: "#6366f1", green: "#22c55e", red: "#ef4444", yellow: "#eab308",
};

// Available field types to drop
const FIELD_TYPES = [
  { type: "signature", label: "Signature", icon: "✍️", w: 30, h: 6, color: "#6366f1" },
  { type: "name", label: "Full Name", icon: "👤", w: 25, h: 3.5, color: "#3b82f6" },
  { type: "email", label: "Email", icon: "📧", w: 25, h: 3.5, color: "#3b82f6" },
  { type: "date_signed", label: "Date", icon: "📅", w: 18, h: 3.5, color: "#22c55e" },
  { type: "title", label: "Title/Role", icon: "💼", w: 25, h: 3.5, color: "#8b5cf6" },
  { type: "company", label: "Company", icon: "🏢", w: 28, h: 3.5, color: "#8b5cf6" },
  { type: "company_address", label: "Address", icon: "📍", w: 35, h: 3.5, color: "#8b5cf6" },
  { type: "entity_type", label: "Entity Type", icon: "📋", w: 20, h: 3.5, color: "#8b5cf6" },
  { type: "jurisdiction", label: "Jurisdiction", icon: "⚖️", w: 20, h: 3.5, color: "#8b5cf6" },
  { type: "phone", label: "Phone", icon: "📱", w: 22, h: 3.5, color: "#3b82f6" },
  { type: "initials", label: "Initials", icon: "✒️", w: 12, h: 5, color: "#6366f1" },
  { type: "text", label: "Text Field", icon: "📝", w: 30, h: 3.5, color: "#6b7280" },
  { type: "checkbox", label: "Checkbox", icon: "☑️", w: 4, h: 4, color: "#6b7280" },
];

export default function FieldPlacer({ documentUrl, signers = [], initialFields = [], onSave, onCancel }) {
  const [fields, setFields] = useState(initialFields.map((f, i) => ({ ...f, id: f.id || `field_${i}` })));
  const [activeSigner, setActiveSigner] = useState(signers[0]?.signing_order || 1);
  const [dragging, setDragging] = useState(null); // field being dragged
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [selectedField, setSelectedField] = useState(null);
  const [pageCount, setPageCount] = useState(6); // default for MNDA
  const [currentPage, setCurrentPage] = useState(1);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const containerRef = useRef(null);

  // Signer colors
  const signerColors = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];
  const getSignerColor = (order) => signerColors[(order - 1) % signerColors.length];

  // Add a new field via click from the palette
  const addField = useCallback((fieldType, signerOrder) => {
    const ft = FIELD_TYPES.find(f => f.type === fieldType);
    if (!ft) return;
    const newField = {
      id: `field_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      field_type: ft.type,
      label: ft.label,
      page_number: currentPage,
      x_pct: 10,
      y_pct: 20 + (fields.filter(f => f.page_number === currentPage).length * 8),
      width_pct: ft.w,
      height_pct: ft.h,
      signer_order: signerOrder,
      required: true,
    };
    setFields(prev => [...prev, newField]);
    setSelectedField(newField.id);
  }, [currentPage, fields]);

  // Mouse move handler for dragging
  const handleMouseMove = useCallback((e) => {
    if (!dragging || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((e.clientX - rect.left - dragOffset.x) / rect.width) * 100;
    const y = ((e.clientY - rect.top - dragOffset.y) / rect.height) * 100;
    setFields(prev => prev.map(f =>
      f.id === dragging ? { ...f, x_pct: Math.max(0, Math.min(x, 100 - f.width_pct)), y_pct: Math.max(0, Math.min(y, 100 - f.height_pct)) } : f
    ));
  }, [dragging, dragOffset]);

  const handleMouseUp = useCallback(() => {
    setDragging(null);
  }, []);

  useEffect(() => {
    if (dragging) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [dragging, handleMouseMove, handleMouseUp]);

  // Touch handlers
  const handleTouchMove = useCallback((e) => {
    if (!dragging || !containerRef.current) return;
    e.preventDefault();
    const touch = e.touches[0];
    const rect = containerRef.current.getBoundingClientRect();
    const x = ((touch.clientX - rect.left - dragOffset.x) / rect.width) * 100;
    const y = ((touch.clientY - rect.top - dragOffset.y) / rect.height) * 100;
    setFields(prev => prev.map(f =>
      f.id === dragging ? { ...f, x_pct: Math.max(0, Math.min(x, 100 - f.width_pct)), y_pct: Math.max(0, Math.min(y, 100 - f.height_pct)) } : f
    ));
  }, [dragging, dragOffset]);

  const removeField = (id) => {
    setFields(prev => prev.filter(f => f.id !== id));
    if (selectedField === id) setSelectedField(null);
  };

  const updateField = (id, updates) => {
    setFields(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const fieldsOnPage = fields.filter(f => f.page_number === currentPage);
  const fieldsBySignerOnPage = signers.map((s, i) => ({
    signer: s,
    order: s.signing_order || i + 1,
    fields: fieldsOnPage.filter(f => f.signer_order === (s.signing_order || i + 1)),
  }));

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: T.bg, borderRadius: 14, overflow: "hidden", border: `1px solid ${T.border}` }}>
      {/* Top toolbar */}
      <div style={{ padding: "10px 16px", background: T.surface, borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ fontSize: 16 }}>📄</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Place Fields on Document</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={onCancel} style={{ padding: "6px 14px", fontSize: 11, fontWeight: 600, borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text3, cursor: "pointer" }}>Cancel</button>
          <button onClick={() => onSave(fields)} style={{ padding: "6px 18px", fontSize: 11, fontWeight: 700, borderRadius: 6, border: "none", background: T.accent, color: "#fff", cursor: "pointer" }}>Save Field Placements →</button>
        </div>
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Left sidebar — Field palette */}
        <div style={{ width: 220, borderRight: `1px solid ${T.border}`, background: T.surface, overflow: "auto", padding: "12px" }}>
          {/* Signer selector */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Placing for</div>
            {signers.map((s, i) => {
              const order = s.signing_order || i + 1;
              const color = getSignerColor(order);
              return (
                <button key={i} onClick={() => setActiveSigner(order)} style={{
                  display: "flex", alignItems: "center", gap: 6, width: "100%", padding: "6px 10px", marginBottom: 3,
                  borderRadius: 6, border: `1px solid ${activeSigner === order ? color + "60" : T.border}`,
                  background: activeSigner === order ? color + "15" : "transparent", cursor: "pointer", textAlign: "left"
                }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                  <div style={{ fontSize: 11, fontWeight: activeSigner === order ? 700 : 500, color: activeSigner === order ? T.text : T.text3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {s.name || s.role_name || `Signer ${order}`}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Field types */}
          <div style={{ fontSize: 9, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Add Field</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {FIELD_TYPES.map(ft => (
              <button key={ft.type} onClick={() => addField(ft.type, activeSigner)} style={{
                display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 6,
                border: `1px solid ${T.border}`, background: T.surface2, cursor: "pointer", textAlign: "left",
                transition: "all 0.1s",
              }}
                onMouseEnter={e => { e.currentTarget.style.background = T.surface3; e.currentTarget.style.borderColor = getSignerColor(activeSigner) + "40"; }}
                onMouseLeave={e => { e.currentTarget.style.background = T.surface2; e.currentTarget.style.borderColor = T.border; }}
              >
                <span style={{ fontSize: 13 }}>{ft.icon}</span>
                <span style={{ fontSize: 11, color: T.text, fontWeight: 500 }}>{ft.label}</span>
              </button>
            ))}
          </div>

          {/* Page fields summary */}
          <div style={{ marginTop: 16, fontSize: 9, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Fields on Page {currentPage} ({fieldsOnPage.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {fieldsOnPage.map(f => {
              const color = getSignerColor(f.signer_order);
              return (
                <div key={f.id} onClick={() => setSelectedField(f.id === selectedField ? null : f.id)} style={{
                  display: "flex", alignItems: "center", gap: 6, padding: "4px 8px", borderRadius: 4,
                  background: selectedField === f.id ? color + "20" : "transparent",
                  cursor: "pointer", fontSize: 10, color: T.text2,
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: color }} />
                  <span style={{ flex: 1 }}>{f.label || f.field_type}</span>
                  <button onClick={(e) => { e.stopPropagation(); removeField(f.id); }} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 10, padding: 0 }}>×</button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Center — Document with field overlays */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
          {/* Page navigation */}
          <div style={{ padding: "8px 16px", background: T.surface, borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1} style={{ padding: "4px 10px", fontSize: 11, border: `1px solid ${T.border}`, borderRadius: 4, background: T.surface2, color: T.text3, cursor: currentPage <= 1 ? "default" : "pointer", opacity: currentPage <= 1 ? 0.3 : 1 }}>← Prev</button>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              {Array.from({ length: pageCount }, (_, i) => i + 1).map(p => (
                <button key={p} onClick={() => setCurrentPage(p)} style={{
                  width: 28, height: 28, borderRadius: 6, border: `1px solid ${currentPage === p ? T.accent : T.border}`,
                  background: currentPage === p ? T.accent + "20" : T.surface2, color: currentPage === p ? T.accent : T.text3,
                  fontSize: 11, fontWeight: currentPage === p ? 700 : 400, cursor: "pointer",
                  position: "relative",
                }}>
                  {p}
                  {fields.some(f => f.page_number === p) && (
                    <div style={{ position: "absolute", top: -2, right: -2, width: 6, height: 6, borderRadius: "50%", background: T.accent }} />
                  )}
                </button>
              ))}
            </div>
            <button onClick={() => setCurrentPage(p => Math.min(pageCount, p + 1))} disabled={currentPage >= pageCount} style={{ padding: "4px 10px", fontSize: 11, border: `1px solid ${T.border}`, borderRadius: 4, background: T.surface2, color: T.text3, cursor: currentPage >= pageCount ? "default" : "pointer", opacity: currentPage >= pageCount ? 0.3 : 1 }}>Next →</button>
            <div style={{ marginLeft: 12, display: "flex", alignItems: "center", gap: 4 }}>
              <label style={{ fontSize: 10, color: T.text3 }}>Pages:</label>
              <input type="number" value={pageCount} onChange={e => setPageCount(Math.max(1, parseInt(e.target.value) || 1))} min={1} max={50} style={{ width: 40, padding: "3px 6px", fontSize: 11, border: `1px solid ${T.border}`, borderRadius: 4, background: T.surface2, color: T.text, textAlign: "center" }} />
            </div>
          </div>

          {/* Document page with overlays */}
          <div style={{ flex: 1, overflow: "auto", display: "flex", justifyContent: "center", padding: 20, background: "#0a0a10" }}>
            <div style={{ position: "relative", width: "100%", maxWidth: 680, aspectRatio: "8.5/11", background: "#fff", borderRadius: 4, boxShadow: "0 4px 30px rgba(0,0,0,0.5)", overflow: "hidden" }}
              ref={containerRef}
              onTouchMove={handleTouchMove}
            >
              {/* PDF page render */}
              {documentUrl ? (
                <iframe
                  src={`${documentUrl}#page=${currentPage}&toolbar=0&navpanes=0&scrollbar=0`}
                  style={{ width: "100%", height: "100%", border: "none", pointerEvents: "none" }}
                  title={`Page ${currentPage}`}
                />
              ) : (
                <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8f8fc", color: "#999", fontSize: 14 }}>
                  No document uploaded — fields will still be saved
                </div>
              )}

              {/* Field overlays */}
              {fieldsOnPage.map(f => {
                const color = getSignerColor(f.signer_order);
                const isSelected = selectedField === f.id;
                const ft = FIELD_TYPES.find(t => t.type === f.field_type);
                return (
                  <div
                    key={f.id}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setSelectedField(f.id);
                      setDragging(f.id);
                      const rect = containerRef.current.getBoundingClientRect();
                      const fieldX = (f.x_pct / 100) * rect.width;
                      const fieldY = (f.y_pct / 100) * rect.height;
                      setDragOffset({ x: e.clientX - rect.left - fieldX, y: e.clientY - rect.top - fieldY });
                    }}
                    onTouchStart={(e) => {
                      const touch = e.touches[0];
                      setSelectedField(f.id);
                      setDragging(f.id);
                      const rect = containerRef.current.getBoundingClientRect();
                      const fieldX = (f.x_pct / 100) * rect.width;
                      const fieldY = (f.y_pct / 100) * rect.height;
                      setDragOffset({ x: touch.clientX - rect.left - fieldX, y: touch.clientY - rect.top - fieldY });
                    }}
                    style={{
                      position: "absolute",
                      left: `${f.x_pct}%`,
                      top: `${f.y_pct}%`,
                      width: `${f.width_pct}%`,
                      height: `${f.height_pct}%`,
                      background: color + "22",
                      border: `2px ${isSelected ? "solid" : "dashed"} ${color}`,
                      borderRadius: 4,
                      cursor: dragging === f.id ? "grabbing" : "grab",
                      display: "flex",
                      alignItems: "center",
                      gap: 4,
                      padding: "0 6px",
                      zIndex: isSelected ? 10 : 1,
                      boxShadow: isSelected ? `0 0 0 2px ${color}40` : "none",
                      transition: dragging === f.id ? "none" : "box-shadow 0.15s",
                      userSelect: "none",
                      touchAction: "none",
                    }}
                  >
                    <span style={{ fontSize: 10 }}>{ft?.icon || "📝"}</span>
                    <span style={{ fontSize: 9, fontWeight: 700, color: color, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {f.label || f.field_type}
                    </span>
                    {isSelected && (
                      <button onClick={(e) => { e.stopPropagation(); removeField(f.id); }} style={{
                        position: "absolute", top: -8, right: -8, width: 16, height: 16, borderRadius: "50%",
                        background: T.red, border: "none", color: "#fff", fontSize: 9, cursor: "pointer",
                        display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1,
                      }}>×</button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right sidebar — Field properties */}
        <div style={{ width: 200, borderLeft: `1px solid ${T.border}`, background: T.surface, overflow: "auto", padding: "12px" }}>
          {selectedField ? (() => {
            const f = fields.find(x => x.id === selectedField);
            if (!f) return null;
            const color = getSignerColor(f.signer_order);
            return (
              <div>
                <div style={{ fontSize: 9, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Field Properties</div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12, padding: "6px 8px", background: color + "15", borderRadius: 6, border: `1px solid ${color}30` }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: T.text }}>{f.label || f.field_type}</span>
                </div>

                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 9, fontWeight: 600, color: T.text3, display: "block", marginBottom: 3 }}>LABEL</label>
                  <input value={f.label || ""} onChange={e => updateField(f.id, { label: e.target.value })} style={{ width: "100%", padding: "5px 8px", fontSize: 11, border: `1px solid ${T.border}`, borderRadius: 4, background: T.surface2, color: T.text, boxSizing: "border-box" }} />
                </div>

                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 9, fontWeight: 600, color: T.text3, display: "block", marginBottom: 3 }}>ASSIGNED TO</label>
                  <select value={f.signer_order} onChange={e => updateField(f.id, { signer_order: parseInt(e.target.value) })} style={{ width: "100%", padding: "5px 8px", fontSize: 11, border: `1px solid ${T.border}`, borderRadius: 4, background: T.surface2, color: T.text, boxSizing: "border-box" }}>
                    {signers.map((s, i) => <option key={i} value={s.signing_order || i + 1}>{s.name || s.role_name || `Signer ${i + 1}`}</option>)}
                  </select>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 10 }}>
                  <div>
                    <label style={{ fontSize: 9, fontWeight: 600, color: T.text3, display: "block", marginBottom: 2 }}>X %</label>
                    <input type="number" value={Math.round(f.x_pct * 10) / 10} onChange={e => updateField(f.id, { x_pct: parseFloat(e.target.value) || 0 })} min={0} max={100} step={0.5} style={{ width: "100%", padding: "4px 6px", fontSize: 10, border: `1px solid ${T.border}`, borderRadius: 4, background: T.surface2, color: T.text, boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 9, fontWeight: 600, color: T.text3, display: "block", marginBottom: 2 }}>Y %</label>
                    <input type="number" value={Math.round(f.y_pct * 10) / 10} onChange={e => updateField(f.id, { y_pct: parseFloat(e.target.value) || 0 })} min={0} max={100} step={0.5} style={{ width: "100%", padding: "4px 6px", fontSize: 10, border: `1px solid ${T.border}`, borderRadius: 4, background: T.surface2, color: T.text, boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 9, fontWeight: 600, color: T.text3, display: "block", marginBottom: 2 }}>W %</label>
                    <input type="number" value={Math.round(f.width_pct * 10) / 10} onChange={e => updateField(f.id, { width_pct: parseFloat(e.target.value) || 0 })} min={2} max={100} step={0.5} style={{ width: "100%", padding: "4px 6px", fontSize: 10, border: `1px solid ${T.border}`, borderRadius: 4, background: T.surface2, color: T.text, boxSizing: "border-box" }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 9, fontWeight: 600, color: T.text3, display: "block", marginBottom: 2 }}>H %</label>
                    <input type="number" value={Math.round(f.height_pct * 10) / 10} onChange={e => updateField(f.id, { height_pct: parseFloat(e.target.value) || 0 })} min={1} max={100} step={0.5} style={{ width: "100%", padding: "4px 6px", fontSize: 10, border: `1px solid ${T.border}`, borderRadius: 4, background: T.surface2, color: T.text, boxSizing: "border-box" }} />
                  </div>
                </div>

                <div style={{ marginBottom: 10 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                    <input type="checkbox" checked={f.required !== false} onChange={e => updateField(f.id, { required: e.target.checked })} style={{ accentColor: T.accent }} />
                    <span style={{ fontSize: 11, color: T.text2 }}>Required</span>
                  </label>
                </div>

                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 9, fontWeight: 600, color: T.text3, display: "block", marginBottom: 3 }}>PAGE</label>
                  <select value={f.page_number} onChange={e => { updateField(f.id, { page_number: parseInt(e.target.value) }); setCurrentPage(parseInt(e.target.value)); }} style={{ width: "100%", padding: "5px 8px", fontSize: 11, border: `1px solid ${T.border}`, borderRadius: 4, background: T.surface2, color: T.text, boxSizing: "border-box" }}>
                    {Array.from({ length: pageCount }, (_, i) => <option key={i} value={i + 1}>Page {i + 1}</option>)}
                  </select>
                </div>

                <button onClick={() => removeField(f.id)} style={{ width: "100%", padding: "6px", fontSize: 11, fontWeight: 600, borderRadius: 6, border: `1px solid ${T.red}30`, background: T.red + "10", color: T.red, cursor: "pointer", marginTop: 8 }}>Remove Field</button>
              </div>
            );
          })() : (
            <div style={{ padding: 16, textAlign: "center" }}>
              <div style={{ fontSize: 28, marginBottom: 8 }}>👆</div>
              <div style={{ fontSize: 11, color: T.text3, lineHeight: 1.5 }}>Click a field on the document or add one from the palette to edit its properties</div>
            </div>
          )}

          {/* Legend */}
          <div style={{ marginTop: 20, paddingTop: 12, borderTop: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 9, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Legend</div>
            {signers.map((s, i) => {
              const order = s.signing_order || i + 1;
              const color = getSignerColor(order);
              const count = fields.filter(f => f.signer_order === order).length;
              return (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3, fontSize: 10, color: T.text3 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: color }} />
                  <span>{s.name || s.role_name || `Signer ${order}`}</span>
                  <span style={{ marginLeft: "auto" }}>{count} fields</span>
                </div>
              );
            })}
            <div style={{ marginTop: 8, fontSize: 10, color: T.text3 }}>
              Total: {fields.length} fields on {new Set(fields.map(f => f.page_number)).size} pages
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
