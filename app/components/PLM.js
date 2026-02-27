"use client";
import { useState } from "react";
import { T, PLM_PROGRAMS, PLM_CLAIMS, PLM_FORMULAS, PLM_EXPERIMENTS, PLM_TRIALS, PLM_TESTS, getUser, priorityColor } from "../tokens";
import { Badge, Avatar, ProgressBar, TabBar } from "./ui";

export default function PLMView() {
  const [tab, setTab] = useState("programs");
  const stageOrder = ["concept", "feasibility", "development", "pilot", "validation", "scale_up", "launch_prep", "launched"];
  const stageColor = { concept: T.purple, feasibility: T.cyan, development: T.accent, pilot: T.orange, validation: T.yellow, scale_up: T.green, launched: T.lime };

  return (
    <div style={{ padding: 24, overflow: "auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Product Lifecycle Management</h2>
          <p style={{ fontSize: 12, color: T.text3 }}>Ideation → Development → Pilot → Scale → Launch</p>
        </div>
        <button style={{ background: T.accent, border: "none", borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 600, color: "#fff", cursor: "pointer" }}>+ New Program</button>
      </div>

      <TabBar tabs={[
        { key: "programs", label: "Programs" },
        { key: "claims", label: "Claims" },
        { key: "formulas", label: "Formulas" },
        { key: "experiments", label: "DOE" },
        { key: "trials", label: "Trials" },
        { key: "testing", label: "Testing" },
        { key: "ai", label: "🤖 AI Advisor" },
      ]} active={tab} onChange={setTab} />

      <div style={{ marginTop: 16 }}>
        {tab === "programs" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ background: T.surface2, borderRadius: 10, border: `1px solid ${T.border}`, padding: 16, marginBottom: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: T.text2, marginBottom: 12 }}>Pipeline Stages</div>
              <div style={{ display: "flex", gap: 4 }}>
                {stageOrder.map(s => {
                  const count = PLM_PROGRAMS.filter(p => p.stage === s).length;
                  return (
                    <div key={s} style={{ flex: 1, textAlign: "center", padding: "8px 4px", borderRadius: 6, background: count > 0 ? (stageColor[s] || T.accent) + "15" : T.surface3, border: `1px solid ${count > 0 ? (stageColor[s] || T.accent) + "30" : T.border}` }}>
                      <div style={{ fontSize: 18, fontWeight: 700, color: count > 0 ? stageColor[s] || T.accent : T.text3 }}>{count}</div>
                      <div style={{ fontSize: 9, color: T.text3, textTransform: "capitalize" }}>{s.replace(/_/g, " ")}</div>
                    </div>
                  );
                })}
              </div>
            </div>
            {PLM_PROGRAMS.map(p => (
              <div key={p.id} style={{ background: T.surface2, borderRadius: 10, border: `1px solid ${T.border}`, padding: 16 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 15, fontWeight: 700 }}>{p.name}</span>
                      <Badge color={priorityColor(p.priority)}>{p.priority}</Badge>
                    </div>
                    <div style={{ fontSize: 11, color: T.text3 }}>{p.code} · {p.category} › {p.subcategory} · {p.type.replace(/_/g, " ")}</div>
                  </div>
                  <Badge color={stageColor[p.stage] || T.accent} bg={(stageColor[p.stage] || T.accent) + "20"}>{p.stage.replace(/_/g, " ").toUpperCase()}</Badge>
                </div>
                <ProgressBar value={p.progress} color={stageColor[p.stage] || T.accent} height={5} />
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontSize: 11, color: T.text3 }}>
                  <span>Target launch: {p.launch}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <Avatar user={p.owner} size={18} />
                    <span>{getUser(p.owner).name}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === "claims" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {PLM_CLAIMS.map(cl => {
              const prog = PLM_PROGRAMS.find(p => p.id === cl.program);
              const sColor = { researching: T.yellow, substantiated: T.green, proposed: T.text3, in_legal_review: T.orange }[cl.status] || T.text3;
              return (
                <div key={cl.id} style={{ background: T.surface2, borderRadius: 8, padding: 14, border: `1px solid ${T.border}` }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>&ldquo;{cl.text}&rdquo;</div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                    <Badge small color={T.purple}>{prog?.name}</Badge>
                    <Badge small color={T.cyan}>{cl.type.replace(/_/g, " ")}</Badge>
                    <Badge small color={sColor}>{cl.status.replace(/_/g, " ")}</Badge>
                    <Badge small color={T.text2}>{cl.evidence.replace(/_/g, " ")}</Badge>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "formulas" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {PLM_FORMULAS.map(f => {
              const prog = PLM_PROGRAMS.find(p => p.id === f.program);
              const sColor = { testing: T.yellow, pilot_approved: T.green, superseded: T.text3, draft: T.accent }[f.status] || T.text3;
              return (
                <div key={f.id} style={{ background: T.surface2, borderRadius: 8, padding: 14, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: T.purpleDim, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🧪</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{f.name} <span style={{ color: T.text3, fontWeight: 400 }}>v{f.version}</span></div>
                    <div style={{ fontSize: 11, color: T.text3 }}>{prog?.name} · {f.form} · {f.items} ingredients · ${f.cost}/unit</div>
                  </div>
                  <Badge color={sColor}>{f.status.replace(/_/g, " ")}</Badge>
                </div>
              );
            })}
          </div>
        )}

        {tab === "experiments" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {PLM_EXPERIMENTS.map(exp => {
              const prog = PLM_PROGRAMS.find(p => p.id === exp.program);
              const sColor = { completed: T.green, analyzing: T.yellow, in_progress: T.accent, planning: T.text3 }[exp.status] || T.text3;
              return (
                <div key={exp.id} style={{ background: T.surface2, borderRadius: 8, padding: 14, border: `1px solid ${T.border}` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{exp.name}</span>
                    <Badge color={sColor}>{exp.status.replace(/_/g, " ")}</Badge>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    <Badge small color={T.purple}>{prog?.name}</Badge>
                    <Badge small color={T.cyan}>{exp.type}</Badge>
                    <Badge small color={T.accent}>{exp.design.replace(/_/g, " ")}</Badge>
                    <Badge small color={T.text2}>{exp.factors} factors · {exp.runs} runs</Badge>
                    {exp.rSquared && <Badge small color={T.green}>R² = {exp.rSquared}</Badge>}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {tab === "trials" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {PLM_TRIALS.map(tr => {
              const prog = PLM_PROGRAMS.find(p => p.id === tr.program);
              const sColor = { completed: T.green, in_progress: T.accent, planned: T.text3 }[tr.status] || T.text3;
              const dColor = { approved: T.green, pending: T.yellow, rejected: T.red }[tr.disposition] || T.text3;
              return (
                <div key={tr.id} style={{ background: T.surface2, borderRadius: 8, padding: 14, border: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: sColor + "15", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🏭</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{tr.number}: {tr.name}</div>
                    <div style={{ fontSize: 11, color: T.text3 }}>{prog?.name} · {tr.type.replace(/_/g, " ")} · {tr.batchSize}{tr.yield ? ` · Yield: ${tr.yield}%` : ""}</div>
                  </div>
                  <Badge color={sColor}>{tr.status.replace(/_/g, " ")}</Badge>
                  <Badge color={dColor}>{tr.disposition}</Badge>
                </div>
              );
            })}
          </div>
        )}

        {tab === "testing" && (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 0, marginBottom: 8, padding: "8px 14px", fontSize: 10, fontWeight: 600, color: T.text3, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              <span>Test</span><span>Category</span><span>Specification</span><span>Result</span><span>Status</span>
            </div>
            {PLM_TESTS.map(ts => {
              const sColor = { pass: T.green, fail: T.red, marginal: T.yellow, pending: T.text3 }[ts.status];
              return (
                <div key={ts.id} style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 0, padding: "10px 14px", background: T.surface2, borderRadius: 6, border: `1px solid ${T.border}`, marginBottom: 4, alignItems: "center", fontSize: 12 }}>
                  <span style={{ fontWeight: 500 }}>{ts.name}</span>
                  <Badge small color={T.cyan}>{ts.category}</Badge>
                  <span style={{ color: T.text2 }}>{ts.spec}</span>
                  <span style={{ fontWeight: 600 }}>{ts.result}</span>
                  <Badge color={sColor}>{ts.status.toUpperCase()}</Badge>
                </div>
              );
            })}
          </div>
        )}

        {tab === "ai" && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              { icon: "🔬", title: "Claim Support", desc: "Evaluate claims for scientific validity, regulatory compliance, and required substantiation.", color: T.purple },
              { icon: "📊", title: "DOE Advisor", desc: "Design experiments, generate run matrices, analyze results, find optimal settings.", color: T.accent },
              { icon: "🧪", title: "Formulation Advisor", desc: "Ingredient selection, stability troubleshooting, process optimization.", color: T.cyan },
              { icon: "🏭", title: "Manufacturing Troubleshoot", desc: "Diagnose production issues, root cause analysis, corrective actions.", color: T.orange },
              { icon: "📈", title: "Stability Predictor", desc: "Predict shelf life from accelerated data, identify degradation pathways.", color: T.green },
              { icon: "💊", title: "Ingredient Advisor", desc: "Recommend ingredients for target benefits, check compatibility and regulatory status.", color: T.pink },
            ].map(ai => (
              <div key={ai.title} style={{ background: T.surface2, borderRadius: 10, border: `1px solid ${T.border}`, padding: 16, cursor: "pointer" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 8, background: ai.color + "15", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>{ai.icon}</div>
                  <span style={{ fontSize: 14, fontWeight: 700, color: ai.color }}>{ai.title}</span>
                </div>
                <div style={{ fontSize: 12, color: T.text2, lineHeight: 1.5 }}>{ai.desc}</div>
                <div style={{ marginTop: 10, fontSize: 11, color: ai.color, fontWeight: 600 }}>Ask AI →</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
