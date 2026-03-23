"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

// This component renders a print-optimized batch record for a DOE trial run
// Opens in a modal/overlay with print button — or use window.print()
export default function PrintBatchRecord({ experimentId, runId, onClose }) {
  const [experiment, setExperiment] = useState(null);
  const [run, setRun] = useState(null);
  const [formula, setFormula] = useState(null);
  const [formulaItems, setFormulaItems] = useState([]);
  const [program, setProgram] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data: exp } = await supabase.from("plm_experiments").select("*").eq("id", experimentId).single();
      const { data: r } = await supabase.from("plm_experiment_runs").select("*").eq("id", runId).single();
      setExperiment(exp);
      setRun(r);

      if (exp?.formulation_id) {
        const { data: f } = await supabase.from("plm_formulations").select("*").eq("id", exp.formulation_id).single();
        if (f) {
          setFormula(f);
          const { data: items } = await supabase.from("plm_formula_items").select("*").eq("formulation_id", f.id).order("sort_order");
          setFormulaItems(items || []);
        }
      }

      if (exp?.program_id) {
        const { data: p } = await supabase.from("plm_programs").select("name, brand, code").eq("id", exp.program_id).single();
        setProgram(p);
      }

      setLoading(false);
    };
    load();
  }, [experimentId, runId]);

  const handlePrint = () => window.print();

  if (loading) return <div style={{ padding: 40, textAlign: "center" }}>Loading batch record...</div>;
  if (!experiment || !run) return <div style={{ padding: 40 }}>Run not found</div>;

  const factors = run.factor_settings || {};
  const responses = experiment.responses || [];
  const today = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

  return (
    <div className="print-root" style={{ position: "fixed", inset: 0, zIndex: 9999, background: "#fff", overflow: "auto" }}>
      {/* Non-printable toolbar */}
      <div className="no-print" style={{ position: "sticky", top: 0, background: "#1a1a2e", padding: "10px 24px", display: "flex", alignItems: "center", gap: 12, zIndex: 10 }}>
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#fff", fontSize: 18, cursor: "pointer" }}>← Back</button>
        <div style={{ flex: 1, color: "#fff", fontSize: 14, fontWeight: 600 }}>Batch Record Preview</div>
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
              <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: -0.5 }}>BATCH RECORD</div>
              <div style={{ fontSize: 14, color: "#666", marginTop: 2 }}>{program?.brand || "Earth Breeze"} · {program?.name || "—"}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 12, color: "#666" }}>Document Date</div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{today}</div>
            </div>
          </div>
        </div>

        {/* Experiment & Run Info */}
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20, fontSize: 12 }}>
          <tbody>
            <tr>
              <td style={cellLabel}>Experiment</td>
              <td style={cellValue}>{experiment.name}</td>
              <td style={cellLabel}>DOE Design</td>
              <td style={cellValue}>{experiment.doe_design?.replace(/_/g, " ") || "—"}</td>
            </tr>
            <tr>
              <td style={cellLabel}>Run #</td>
              <td style={cellValue}><strong style={{ fontSize: 16 }}>{run.run_number}</strong> of {(experiment.run_matrix || []).length}</td>
              <td style={cellLabel}>Status</td>
              <td style={cellValue}>{run.status}</td>
            </tr>
            <tr>
              <td style={cellLabel}>Batch ID</td>
              <td style={cellValue}><div style={fillLine}>{run.batch_id || ""}</div></td>
              <td style={cellLabel}>Run Date</td>
              <td style={cellValue}><div style={fillLine}>{run.run_date || ""}</div></td>
            </tr>
            <tr>
              <td style={cellLabel}>Operator</td>
              <td style={cellValue}><div style={fillLine}>{run.operator || ""}</div></td>
              <td style={cellLabel}>Batch Size</td>
              <td style={cellValue}><div style={fillLine}>{formula?.target_batch_size ? `${formula.target_batch_size} ${formula.batch_size_unit || "kg"}` : ""}</div></td>
            </tr>
          </tbody>
        </table>

        {/* Hypothesis */}
        {experiment.hypothesis && (
          <div style={{ background: "#f5f5f5", padding: "10px 14px", borderRadius: 4, marginBottom: 20, fontSize: 12, border: "1px solid #ddd" }}>
            <strong>Hypothesis:</strong> {experiment.hypothesis}
          </div>
        )}

        {/* Factor Settings for this run */}
        {/* Ingredient Table with DOE factor highlights */}
        {formulaItems.length > 0 && (() => {
          const factorNames = Object.keys(factors).map(k => k.toLowerCase());
          const isAffected = (item) => {
            const name = (item.ingredient_name || "").toLowerCase();
            const fn = (item.function_in_formula || "").toLowerCase();
            return factorNames.some(fk => name.includes(fk.split(" ")[0]) || fk.includes(name.split(" ")[0]) || fn.includes(fk.split(" ")[0]));
          };
          return (
            <>
              <div style={sectionHeader}>FORMULA & INGREDIENT WEIGHTS</div>
              {formula && <div style={{ fontSize: 11, color: "#666", marginBottom: 8 }}>{formula.name} ({formula.version}) — Batch: {formula.target_batch_size || "—"} {formula.batch_size_unit || "kg"} — <strong style={{ color: "#e65100" }}>🔸 = modified by DOE factors</strong></div>}
              <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 10, fontSize: 11 }}>
                <thead>
                  <tr style={{ background: "#f0f0f0" }}>
                    <th style={{ ...thStyle, width: 16 }}></th>
                    <th style={{ ...thStyle, width: 24 }}>#</th>
                    <th style={thStyle}>Ingredient</th>
                    <th style={thStyle}>Function</th>
                    <th style={{ ...thStyle, width: 50 }}>Phase</th>
                    <th style={{ ...thStyle, width: 55 }}>Base %</th>
                    <th style={{ ...thStyle, width: 55 }}>Trial %</th>
                    <th style={{ ...thStyle, width: 70 }}>Weight (g)</th>
                    <th style={{ ...thStyle, width: 40 }}>Temp</th>
                    <th style={{ ...thStyle, width: 24 }}>✓</th>
                  </tr>
                </thead>
                <tbody>
                  {formulaItems.map((item, i) => {
                    const affected = isAffected(item);
                    const batchG = formula?.target_batch_size ? (item.quantity / 100 * formula.target_batch_size * 1000).toFixed(1) : "—";
                    return (
                      <tr key={item.id} style={{ background: affected ? "#fff3e0" : "transparent" }}>
                        <td style={{ ...tdStyle, textAlign: "center", width: 16 }}>{affected ? "🔸" : ""}</td>
                        <td style={{ ...tdStyle, textAlign: "center", color: "#999" }}>{item.addition_order || i + 1}</td>
                        <td style={{ ...tdStyle, fontWeight: affected ? 700 : 600, color: affected ? "#e65100" : "#111" }}>{item.ingredient_name}</td>
                        <td style={{ ...tdStyle, fontSize: 10, color: "#555" }}>{item.function_in_formula || "—"}</td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>{item.phase || "—"}</td>
                        <td style={{ ...tdStyle, textAlign: "right", textDecoration: affected ? "line-through" : "none", color: affected ? "#999" : "#111" }}>{item.quantity}</td>
                        <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, color: affected ? "#e65100" : "#111" }}>{affected ? "adj." : item.quantity}</td>
                        <td style={{ ...tdStyle, textAlign: "right" }}>{batchG}</td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>{item.addition_temp_c || "—"}</td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>☐</td>
                      </tr>
                    );
                  })}
                  <tr style={{ background: "#f0f0f0", fontWeight: 700 }}>
                    <td style={tdStyle}></td>
                    <td style={tdStyle}></td>
                    <td style={tdStyle}>TOTAL</td>
                    <td style={tdStyle}></td>
                    <td style={tdStyle}></td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>{formulaItems.reduce((s, i) => s + (parseFloat(i.quantity) || 0), 0).toFixed(2)}%</td>
                    <td style={tdStyle}></td>
                    <td style={tdStyle}></td>
                    <td style={tdStyle}></td>
                    <td style={tdStyle}></td>
                  </tr>
                </tbody>
              </table>
              {/* Factor adjustment callout box */}
              {Object.keys(factors).length > 0 && (
                <div style={{ padding: "10px 14px", border: "2px solid #e65100", borderRadius: 6, marginBottom: 20, background: "#fff8f0" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "#e65100", textTransform: "uppercase", marginBottom: 6 }}>⚠ DOE Factor Adjustments for Run {run.run_number}</div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead>
                      <tr><th style={{ ...thStyle, border: "none", color: "#e65100" }}>Factor</th><th style={{ ...thStyle, border: "none", color: "#e65100" }}>Setting</th><th style={{ ...thStyle, border: "none", color: "#e65100" }}>Unit</th><th style={{ ...thStyle, border: "none", color: "#e65100", width: 100 }}>Actual</th></tr>
                    </thead>
                    <tbody>
                      {Object.entries(factors).map(([name, value]) => {
                        const fd = (experiment?.factors || []).find(f => f.name === name);
                        return (
                          <tr key={name}>
                            <td style={{ padding: "4px 8px", fontWeight: 700 }}>{name}</td>
                            <td style={{ padding: "4px 8px", fontSize: 14, fontWeight: 800, color: "#e65100" }}>{String(value)}</td>
                            <td style={{ padding: "4px 8px" }}>{fd?.unit || "—"}</td>
                            <td style={{ padding: "4px 8px" }}><div style={fillLine}></div></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          );
        })()}

        {/* Manufacturing Instructions */}
        <div style={sectionHeader}>MANUFACTURING INSTRUCTIONS</div>
        {(() => {
          const text = run.manufacturing_instructions || formula?.manufacturing_process;
          if (!text) return <div style={{ fontSize: 12, color: "#999", marginBottom: 20, fontStyle: "italic" }}>No manufacturing instructions available</div>;
          const lines = text.split("\n").map((line, i) => {
            const t = line.trim();
            if (!t) return <div key={i} style={{ height: 6 }} />;
            if (t.startsWith("###")) return <div key={i} style={{ fontSize: 12, fontWeight: 700, marginTop: 10, marginBottom: 3 }}>{t.replace(/^#+\s*/, "")}</div>;
            if (t.startsWith("##")) return <div key={i} style={{ fontSize: 13, fontWeight: 700, marginTop: 14, marginBottom: 4, textTransform: "uppercase", borderBottom: "1px solid #ccc", paddingBottom: 2 }}>{t.replace(/^#+\s*/, "")}</div>;
            const numMatch = t.match(/^(\d+)\.\s+(.*)$/);
            if (numMatch) return (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4, padding: "3px 0" }}>
                <span style={{ minWidth: 20, height: 20, borderRadius: 10, background: "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{numMatch[1]}</span>
                <span style={{ fontSize: 12, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: numMatch[2].replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") }} />
              </div>
            );
            if (t.startsWith("- ") || t.startsWith("• ")) return (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 2, paddingLeft: 28 }}>
                <span style={{ fontWeight: 700, fontSize: 10, marginTop: 3 }}>•</span>
                <span style={{ fontSize: 11, color: "#444", lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: t.slice(2).replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") }} />
              </div>
            );
            return <div key={i} style={{ fontSize: 12, lineHeight: 1.6, color: "#333" }} dangerouslySetInnerHTML={{ __html: t.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>") }} />;
          });
          return <div style={{ marginBottom: 20, padding: "12px 14px", border: "1px solid #ddd", borderRadius: 4 }}>{lines}</div>;
        })()}

        {/* In-Process Checks */}
        <div style={sectionHeader}>IN-PROCESS QUALITY CHECKS</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20, fontSize: 12 }}>
          <thead>
            <tr style={{ background: "#f0f0f0" }}>
              <th style={thStyle}>Check</th>
              <th style={thStyle}>Specification</th>
              <th style={{ ...thStyle, width: 120 }}>Actual Result</th>
              <th style={{ ...thStyle, width: 60 }}>Pass/Fail</th>
              <th style={{ ...thStyle, width: 80 }}>Time</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["pH", formula?.target_ph ? `${formula.target_ph} ± 0.5` : "7.0 – 8.5"],
              ["Viscosity (cP)", "8,000 – 12,000"],
              ["Temperature (°C)", "< 45°C before enzyme addition"],
              ["Appearance", "Homogeneous, no lumps"],
              ["Color", "Consistent with standard"],
              ["Odor", "Consistent with standard"],
            ].map(([check, spec]) => (
              <tr key={check}>
                <td style={tdStyle}><strong>{check}</strong></td>
                <td style={tdStyle}>{spec}</td>
                <td style={tdStyle}><div style={fillLine}></div></td>
                <td style={tdStyle}><div style={fillLine}></div></td>
                <td style={tdStyle}><div style={fillLine}></div></td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Response Measurements */}
        {responses.length > 0 && (
          <>
            <div style={sectionHeader}>RESPONSE MEASUREMENTS</div>
            <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20, fontSize: 12 }}>
              <thead>
                <tr style={{ background: "#f0f0f0" }}>
                  <th style={thStyle}>Response</th>
                  <th style={thStyle}>Unit</th>
                  <th style={thStyle}>Target</th>
                  <th style={{ ...thStyle, width: 150 }}>Result (fill in)</th>
                </tr>
              </thead>
              <tbody>
                {responses.map(r => (
                  <tr key={r.name || r.id}>
                    <td style={tdStyle}><strong>{r.name}</strong></td>
                    <td style={tdStyle}>{r.unit || "—"}</td>
                    <td style={tdStyle}>{r.target === "maximize" ? "↑ Maximize" : r.target === "minimize" ? "↓ Minimize" : `◎ Target: ${r.target_value || "—"}`}</td>
                    <td style={tdStyle}><div style={fillLine}></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}

        {/* Notes Section */}
        <div style={sectionHeader}>BATCH NOTES</div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#666", marginBottom: 4 }}>Pre-Run Notes / Setup</div>
          <div style={{ border: "1px solid #ccc", borderRadius: 4, minHeight: 60, padding: 8, fontSize: 12 }}>{run.pre_run_notes || ""}</div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#666", marginBottom: 4 }}>In-Process Observations</div>
          <div style={{ border: "1px solid #ccc", borderRadius: 4, minHeight: 80, padding: 8 }}></div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#666", marginBottom: 4 }}>Post-Run Observations / Deviations</div>
          <div style={{ border: "1px solid #ccc", borderRadius: 4, minHeight: 80, padding: 8 }}></div>
        </div>

        {/* Sign-off */}
        <div style={sectionHeader}>SIGN-OFF</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20, fontSize: 12 }}>
          <tbody>
            <tr>
              <td style={cellLabel}>Prepared By</td>
              <td style={cellValue}><div style={{ ...fillLine, width: 200 }}></div></td>
              <td style={cellLabel}>Date</td>
              <td style={cellValue}><div style={{ ...fillLine, width: 120 }}></div></td>
            </tr>
            <tr>
              <td style={cellLabel}>Reviewed By</td>
              <td style={cellValue}><div style={{ ...fillLine, width: 200 }}></div></td>
              <td style={cellLabel}>Date</td>
              <td style={cellValue}><div style={{ ...fillLine, width: 120 }}></div></td>
            </tr>
            <tr>
              <td style={cellLabel}>Approved By</td>
              <td style={cellValue}><div style={{ ...fillLine, width: 200 }}></div></td>
              <td style={cellLabel}>Date</td>
              <td style={cellValue}><div style={{ ...fillLine, width: 120 }}></div></td>
            </tr>
          </tbody>
        </table>

        {/* Footer */}
        <div style={{ borderTop: "1px solid #ccc", paddingTop: 8, fontSize: 10, color: "#999", display: "flex", justifyContent: "space-between" }}>
          <span>{program?.brand || "Earth Breeze"} · {experiment.name} · Run {run.run_number}</span>
          <span>Confidential — Do Not Distribute</span>
        </div>
      </div>

      {/* Print styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          .print-root { position: static !important; overflow: visible !important; height: auto !important; }
          body { margin: 0; padding: 0; overflow: visible !important; }
          html { overflow: visible !important; }
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
