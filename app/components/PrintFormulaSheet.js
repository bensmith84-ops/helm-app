"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

export default function PrintFormulaSheet({ formulationId, onClose }) {
  const [formula, setFormula] = useState(null);
  const [items, setItems] = useState([]);
  const [program, setProgram] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: f } = await supabase.from("plm_formulations").select("*").eq("id", formulationId).single();
      if (!f) { setLoading(false); return; }
      setFormula(f);

      const { data: fi } = await supabase.from("plm_formula_items").select("*").eq("formulation_id", f.id).order("sort_order").order("created_at");
      setItems(fi || []);

      if (f.program_id) {
        const { data: p } = await supabase.from("plm_programs").select("name, brand, code, category, current_stage").eq("id", f.program_id).single();
        setProgram(p);
      }
      setLoading(false);
    };
    load();
  }, [formulationId]);

  const handlePrint = () => window.print();

  if (loading) return <div style={{ padding: 40, textAlign: "center", fontFamily: "sans-serif" }}>Loading formula sheet...</div>;
  if (!formula) return <div style={{ padding: 40, fontFamily: "sans-serif" }}>Formula not found</div>;

  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const totalPct = items.filter(i => i.unit === "%").reduce((a, b) => a + parseFloat(b.quantity || 0), 0);
  const ingredients = items.filter(i => i.item_type === "ingredient" || !i.item_type);
  const processing = items.filter(i => i.item_type === "processing_aid");
  const packaging = items.filter(i => i.item_type === "packaging");

  const renderMfgInstructions = (text) => {
    if (!text) return null;
    return text.split("\n").map((line, i) => {
      const t = line.trim();
      if (!t) return <div key={i} style={{ height: 6 }} />;
      if (t.startsWith("###")) return <div key={i} style={{ fontSize: 12, fontWeight: 700, color: "#333", marginTop: 10, marginBottom: 3 }}>{t.replace(/^#+\s*/, "")}</div>;
      if (t.startsWith("##")) return <div key={i} style={{ fontSize: 13, fontWeight: 800, color: "#111", marginTop: 14, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5, borderBottom: "1px solid #ccc", paddingBottom: 3 }}>{t.replace(/^#+\s*/, "")}</div>;
      const numMatch = t.match(/^(\d+)\.\s+(.*)$/);
      if (numMatch) return (
        <div key={i} style={{ display: "flex", gap: 8, marginBottom: 3, padding: "2px 0" }}>
          <span style={{ minWidth: 20, fontSize: 11, fontWeight: 700, color: "#555", textAlign: "right", flexShrink: 0 }}>{numMatch[1]}.</span>
          <span style={{ fontSize: 11, color: "#222", lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: numMatch[2].replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>') }} />
        </div>
      );
      if (t.startsWith("- ") || t.startsWith("• ")) return (
        <div key={i} style={{ display: "flex", gap: 6, marginBottom: 2, paddingLeft: 28 }}>
          <span style={{ color: "#666", fontSize: 8, marginTop: 5 }}>●</span>
          <span style={{ fontSize: 11, color: "#333", lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: t.slice(2).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
        </div>
      );
      return <div key={i} style={{ fontSize: 11, color: "#333", lineHeight: 1.6, paddingLeft: 28 }} dangerouslySetInnerHTML={{ __html: t.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />;
    });
  };

  const renderItemTable = (itemList, title) => {
    if (itemList.length === 0) return null;
    return (
      <>
        {title && <div style={sectionHeader}>{title}</div>}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 16 }}>
          <thead>
            <tr>
              <th style={{ ...thStyle, width: 30 }}>#</th>
              <th style={thStyle}>Ingredient / Material</th>
              <th style={{ ...thStyle, width: 70, textAlign: "right" }}>Formula %</th>
              {formula.target_batch_size && <th style={{ ...thStyle, width: 90, textAlign: "right" }}>Batch Qty</th>}
              <th style={{ ...thStyle, width: 100 }}>Function</th>
              <th style={{ ...thStyle, width: 90, textAlign: "center" }}>Actual Qty</th>
              <th style={{ ...thStyle, width: 70, textAlign: "center" }}>Initials</th>
            </tr>
          </thead>
          <tbody>
            {itemList.map((item, idx) => {
              const batchQty = formula.target_batch_size && item.unit === "%" ? ((parseFloat(item.quantity || 0) / 100) * parseFloat(formula.target_batch_size)).toFixed(2) : null;
              return (
                <tr key={item.id}>
                  <td style={{ ...tdStyle, fontSize: 10, color: "#999", textAlign: "center" }}>{idx + 1}</td>
                  <td style={{ ...tdStyle, fontSize: 11, fontWeight: 500 }}>
                    {item.ingredient_name || "—"}
                    {item.supplier && <span style={{ fontSize: 9, color: "#999", marginLeft: 6 }}>({item.supplier})</span>}
                  </td>
                  <td style={{ ...tdStyle, fontSize: 11, textAlign: "right", fontWeight: 600 }}>{item.unit === "%" ? parseFloat(item.quantity || 0).toFixed(2) + "%" : (item.quantity || "—")}</td>
                  {formula.target_batch_size && <td style={{ ...tdStyle, fontSize: 11, textAlign: "right" }}>{batchQty ? `${batchQty} ${formula.batch_size_unit || "kg"}` : "—"}</td>}
                  <td style={{ ...tdStyle, fontSize: 10, color: "#666" }}>{item.function_role || "—"}</td>
                  <td style={{ ...tdStyle, textAlign: "center" }}><div style={fillLine} /></td>
                  <td style={{ ...tdStyle, textAlign: "center" }}><div style={fillLine} /></td>
                </tr>
              );
            })}
            {/* Totals row */}
            <tr style={{ borderTop: "2px solid #333" }}>
              <td style={tdStyle} />
              <td style={{ ...tdStyle, fontSize: 11, fontWeight: 800 }}>TOTAL</td>
              <td style={{ ...tdStyle, fontSize: 11, textAlign: "right", fontWeight: 800, color: Math.abs(totalPct - 100) < 0.5 ? "#16a34a" : "#dc2626" }}>{totalPct.toFixed(2)}%</td>
              {formula.target_batch_size && <td style={{ ...tdStyle, fontSize: 11, textAlign: "right", fontWeight: 800 }}>{formula.target_batch_size} {formula.batch_size_unit || "kg"}</td>}
              <td style={tdStyle} />
              <td style={tdStyle} />
              <td style={tdStyle} />
            </tr>
          </tbody>
        </table>
      </>
    );
  };

  return (
    <div className="print-root" style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#fff", overflow: "auto" }}>
      {/* Non-printable toolbar */}
      <div className="no-print" style={{ position: "sticky", top: 0, background: "#1a1a2e", padding: "10px 24px", display: "flex", alignItems: "center", gap: 12, zIndex: 10 }}>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#fff", fontSize: 18, cursor: "pointer" }}>← Back</button>
        <div style={{ flex: 1, color: "#fff", fontSize: 14, fontWeight: 600 }}>Formula Sheet — {formula.name} {formula.version}</div>
        <button onClick={handlePrint} style={{ padding: "8px 20px", fontSize: 13, fontWeight: 700, background: "#3b82f6", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>
          🖨 Print / Save PDF
        </button>
      </div>

      {/* Printable content */}
      <div style={{ maxWidth: 800, margin: "0 auto", padding: "40px 48px", fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif", color: "#111", lineHeight: 1.5 }}>

        {/* Header */}
        <div style={{ borderBottom: "3px solid #111", paddingBottom: 12, marginBottom: 20 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.5 }}>STANDARD FORMULA</div>
              <div style={{ fontSize: 14, color: "#666", marginTop: 2 }}>{program?.brand || "Earth Breeze"} · {program?.name || "—"}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12, color: "#666" }}>Document Date</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{today}</div>
            </div>
          </div>
        </div>

        {/* Formula Info Table */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24, fontSize: 12 }}>
          <tbody>
            <tr>
              <td style={cellLabel}>Formula Name</td>
              <td style={cellValue}><strong>{formula.name}</strong></td>
              <td style={cellLabel}>Version</td>
              <td style={cellValue}>{formula.version || "—"}</td>
            </tr>
            <tr>
              <td style={cellLabel}>Status</td>
              <td style={cellValue}><span style={{ textTransform: "capitalize" }}>{(formula.status || "draft").replace(/_/g, " ")}</span></td>
              <td style={cellLabel}>Form Type</td>
              <td style={cellValue}><span style={{ textTransform: "capitalize" }}>{formula.form_type || "—"}</span></td>
            </tr>
            <tr>
              <td style={cellLabel}>Program</td>
              <td style={cellValue}>{program?.name || "—"}{program?.code ? ` (${program.code})` : ""}</td>
              <td style={cellLabel}>Category</td>
              <td style={cellValue}><span style={{ textTransform: "capitalize" }}>{program?.category || "—"}</span></td>
            </tr>
            {formula.target_batch_size && (
              <tr>
                <td style={cellLabel}>Batch Size</td>
                <td style={cellValue}><strong>{formula.target_batch_size} {formula.batch_size_unit || "kg"}</strong></td>
                <td style={cellLabel}>Target pH</td>
                <td style={cellValue}>{formula.target_ph || "—"}</td>
              </tr>
            )}
          </tbody>
        </table>

        {/* Ingredient Tables */}
        {ingredients.length > 0 && processing.length === 0 && packaging.length === 0
          ? renderItemTable(items, "BILL OF MATERIALS")
          : <>
              {renderItemTable(ingredients, "INGREDIENTS")}
              {renderItemTable(processing, "PROCESSING AIDS")}
              {renderItemTable(packaging, "PACKAGING MATERIALS")}
            </>
        }

        {/* Making Instructions */}
        {formula.manufacturing_process && (
          <>
            <div style={sectionHeader}>MAKING INSTRUCTIONS</div>
            <div style={{ marginBottom: 24 }}>
              {renderMfgInstructions(formula.manufacturing_process)}
            </div>
          </>
        )}

        {/* Sign-off Section */}
        <div style={sectionHeader}>BATCH SIGN-OFF</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24 }}>
          <tbody>
            <tr>
              <td style={{ ...cellLabel, width: 140 }}>Prepared By</td>
              <td style={cellValue}><div style={fillLine} /></td>
              <td style={{ ...cellLabel, width: 80 }}>Date</td>
              <td style={{ ...cellValue, width: 120 }}><div style={fillLine} /></td>
            </tr>
            <tr>
              <td style={cellLabel}>Reviewed By (QA)</td>
              <td style={cellValue}><div style={fillLine} /></td>
              <td style={cellLabel}>Date</td>
              <td style={cellValue}><div style={fillLine} /></td>
            </tr>
            <tr>
              <td style={cellLabel}>Approved By</td>
              <td style={cellValue}><div style={fillLine} /></td>
              <td style={cellLabel}>Date</td>
              <td style={cellValue}><div style={fillLine} /></td>
            </tr>
          </tbody>
        </table>

        {/* Notes Section */}
        <div style={sectionHeader}>NOTES / DEVIATIONS</div>
        <div style={{ border: "1px solid #ddd", borderRadius: 4, minHeight: 100, padding: 8, marginBottom: 20 }} />

        {/* Footer */}
        <div style={{ borderTop: "1px solid #ccc", paddingTop: 8, fontSize: 10, color: "#999", display: "flex", justifyContent: "space-between" }}>
          <span>{program?.brand || "Earth Breeze"} · {formula.name} {formula.version}</span>
          <span>Confidential — Do Not Distribute</span>
        </div>
      </div>

      {/* Print styles — global CSS in page.js handles visibility */}
      <style>{`
        @media print {
          @page { margin: 0.6in 0.5in; size: letter; }
        }
      `}</style>
    </div>
  );
}

// Shared styles
const cellLabel = { padding: "6px 10px", fontSize: 11, fontWeight: 700, color: "#666", width: 100, borderBottom: "1px solid #eee" };
const cellValue = { padding: "6px 10px", fontSize: 12, borderBottom: "1px solid #eee" };
const fillLine = { borderBottom: "1px solid #999", minHeight: 18, display: "inline-block", width: "100%", minWidth: 80 };
const sectionHeader = { fontSize: 13, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, borderBottom: "2px solid #333", paddingBottom: 4, marginBottom: 12, marginTop: 24 };
const thStyle = { padding: "6px 8px", textAlign: "left", fontSize: 10, fontWeight: 700, textTransform: "uppercase", borderBottom: "2px solid #333" };
const tdStyle = { padding: "5px 8px", borderBottom: "1px solid #ddd" };
