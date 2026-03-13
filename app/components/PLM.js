"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

const STAGES = [
  { key: "ideation",       label: "Ideation",        color: "#8b5cf6" },
  { key: "concept",        label: "Concept",          color: "#6366f1" },
  { key: "feasibility",    label: "Feasibility",      color: "#3b82f6" },
  { key: "development",    label: "Development",      color: "#0ea5e9" },
  { key: "optimization",   label: "Optimization",     color: "#06b6d4" },
  { key: "validation",     label: "Validation",       color: "#10b981" },
  { key: "scale_up",       label: "Scale-Up",         color: "#84cc16" },
  { key: "regulatory",     label: "Regulatory",       color: "#eab308" },
  { key: "launch_ready",   label: "Launch Ready",     color: "#f97316" },
  { key: "launched",       label: "Launched",         color: "#22c55e" },
];

const STAGE_MAP = Object.fromEntries(STAGES.map(s => [s.key, s]));

const PRIORITY_COLORS = {
  critical: "#ef4444",
  high:     "#f97316",
  medium:   "#eab308",
  low:      "#22c55e",
};

const PROGRAM_TYPES = ["new_product","reformulation","cost_reduction","line_extension","packaging_change","ingredient_swap","compliance","renovation"];
const STATUS_COLORS = { pass: "#22c55e", fail: "#ef4444", pending: "#eab308", in_progress: "#3b82f6", draft: "#8b93a8" };

// ─── SHARED MINI-COMPONENTS (module scope — no cursor-jump risk) ───────────

function StageBadge({ stage }) {
  const s = STAGE_MAP[stage] || { label: stage, color: "#8b93a8" };
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
      background: s.color + "22", color: s.color, letterSpacing: 0.3,
    }}>{s.label.toUpperCase()}</span>
  );
}

function PriorityBadge({ priority }) {
  const color = PRIORITY_COLORS[priority] || "#8b93a8";
  return (
    <span style={{
      fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
      background: color + "22", color, letterSpacing: 0.3,
    }}>{(priority || "—").toUpperCase()}</span>
  );
}

function StatusDot({ status }) {
  const color = STATUS_COLORS[status] || "#8b93a8";
  return <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: color, marginRight: 5 }} />;
}

function Section({ title, children, action }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, letterSpacing: 1, textTransform: "uppercase" }}>{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

function AddBtn({ onClick, label = "Add" }) {
  return (
    <button onClick={onClick} style={{
      fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 5,
      background: T.accentDim, color: T.accent, border: `1px solid ${T.accent}40`, cursor: "pointer",
    }}>+ {label}</button>
  );
}

function EmptyState({ icon, text }) {
  return (
    <div style={{ padding: "32px 0", textAlign: "center", color: T.text3, fontSize: 13 }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>{icon}</div>
      {text}
    </div>
  );
}

function InlineField({ label, value, onChange, type = "text", placeholder, multiline, options }) {
  const inputStyle = {
    width: "100%", fontSize: 13, color: T.text, background: T.surface2,
    border: `1px solid ${T.border}`, borderRadius: 6, padding: "6px 10px",
    outline: "none", fontFamily: "inherit", boxSizing: "border-box",
    ...(multiline ? { minHeight: 80, resize: "vertical" } : {}),
  };
  return (
    <div style={{ marginBottom: 12 }}>
      {label && <div style={{ fontSize: 11, color: T.text3, marginBottom: 4, fontWeight: 600 }}>{label}</div>}
      {options ? (
        <select value={value || ""} onChange={e => onChange(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
          <option value="">—</option>
          {options.map(o => <option key={o.value || o} value={o.value || o}>{o.label || o}</option>)}
        </select>
      ) : multiline ? (
        <textarea value={value || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={inputStyle} />
      ) : (
        <input type={type} value={value || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={inputStyle} />
      )}
    </div>
  );
}

// ─── TAB: OVERVIEW ────────────────────────────────────────────────────────────

function OverviewTab({ program, onUpdate, counts }) {
  const [editing, setEditing] = useState({});
  const set = (field, val) => setEditing(p => ({ ...p, [field]: val }));
  const save = async (field) => {
    const val = editing[field];
    if (val === undefined) return;
    await supabase.from("plm_programs").update({ [field]: val }).eq("id", program.id);
    onUpdate({ ...program, [field]: val });
    setEditing(p => { const n = { ...p }; delete n[field]; return n; });
  };

  const fieldVal = f => f in editing ? editing[f] : program[f];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
      <div>
        <Section title="Stage Gate">
          <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
            {STAGES.map((s, i) => {
              const cur = STAGES.findIndex(x => x.key === program.current_stage);
              const done = i < cur, active = i === cur;
              return (
                <div key={s.key} style={{
                  flex: 1, minWidth: 60, textAlign: "center", padding: "8px 4px",
                  borderRadius: 6, fontSize: 10, fontWeight: 700, cursor: "pointer",
                  background: active ? s.color + "30" : done ? s.color + "15" : T.surface2,
                  border: `1px solid ${active ? s.color : done ? s.color + "60" : T.border}`,
                  color: active ? s.color : done ? s.color + "aa" : T.text3,
                  transition: "all 0.15s",
                }} onClick={() => onUpdate({ ...program, current_stage: s.key })}>
                  {s.label}
                </div>
              );
            })}
          </div>
        </Section>

        <Section title="KPIs">
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8 }}>
            {[
              { label: "Formulas", val: counts.formulations, icon: "⚗️" },
              { label: "Experiments", val: counts.experiments, icon: "🔬" },
              { label: "Trials", val: counts.trials, icon: "🏭" },
              { label: "SKUs", val: counts.skus, icon: "📦" },
              { label: "Claims", val: counts.claims, icon: "✅" },
              { label: "Issues", val: counts.issues, icon: "⚠️" },
            ].map(k => (
              <div key={k.label} style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ fontSize: 18 }}>{k.icon}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: T.text, lineHeight: 1.2 }}>{k.val ?? "—"}</div>
                <div style={{ fontSize: 11, color: T.text3 }}>{k.label}</div>
              </div>
            ))}
          </div>
        </Section>
      </div>

      <div>
        <Section title="Program Details">
          <InlineField label="Program Name" value={fieldVal("name")}
            onChange={v => set("name", v)} placeholder="Program name"
          />
          <div onBlur={() => save("name")} style={{ display: "contents" }} />

          <InlineField label="Type" value={fieldVal("program_type")} onChange={v => set("program_type", v)}
            options={PROGRAM_TYPES.map(t => ({ value: t, label: t.replace(/_/g, " ") }))}
          />
          <div onBlur={() => save("program_type")} style={{ display: "contents" }} />

          <InlineField label="Priority" value={fieldVal("priority")} onChange={v => set("priority", v)}
            options={["critical","high","medium","low"].map(p => ({ value: p, label: p }))}
          />

          <InlineField label="Brand" value={fieldVal("brand")}
            onChange={v => set("brand", v)} placeholder="Brand name"
          />

          <InlineField label="Target Launch" value={fieldVal("target_launch_date")}
            onChange={v => set("target_launch_date", v)} type="date"
          />

          <InlineField label="Description" value={fieldVal("description")}
            onChange={v => set("description", v)} placeholder="Program description..." multiline
          />
        </Section>

        <div style={{ display: "flex", gap: 8 }}>
          <button onClick={async () => {
            const updates = {};
            for (const [k, v] of Object.entries(editing)) updates[k] = v;
            if (!Object.keys(updates).length) return;
            await supabase.from("plm_programs").update(updates).eq("id", program.id);
            onUpdate({ ...program, ...updates });
            setEditing({});
          }} style={{
            flex: 1, padding: "8px", fontSize: 13, fontWeight: 600, borderRadius: 6,
            background: T.accent, color: "#fff", border: "none", cursor: "pointer",
          }}>Save Changes</button>
        </div>
      </div>
    </div>
  );
}

// ─── TAB: FORMULATIONS ───────────────────────────────────────────────────────

function FormulaItemRow({ item, onUpdate, onDelete }) {
  const [vals, setVals] = useState(item);
  const changed = useRef(false);

  const handleChange = (field, val) => {
    changed.current = true;
    setVals(p => ({ ...p, [field]: val }));
  };

  const handleBlur = async () => {
    if (!changed.current) return;
    changed.current = false;
    await supabase.from("plm_formula_items").update({
      ingredient_name: vals.ingredient_name,
      quantity: parseFloat(vals.quantity) || 0,
      unit: vals.unit,
      function_in_formula: vals.function_in_formula,
    }).eq("id", item.id);
    onUpdate(vals);
  };

  const tdStyle = { padding: "4px 6px", verticalAlign: "middle" };
  const inputStyle = {
    width: "100%", fontSize: 12, background: "transparent", border: "none",
    color: T.text, outline: "none", fontFamily: "inherit",
  };

  return (
    <tr style={{ borderBottom: `1px solid ${T.border}` }}>
      <td style={tdStyle}>
        <input value={vals.ingredient_name || ""} onChange={e => handleChange("ingredient_name", e.target.value)} onBlur={handleBlur} style={inputStyle} placeholder="Ingredient" />
      </td>
      <td style={{ ...tdStyle, width: 70 }}>
        <input value={vals.quantity || ""} onChange={e => handleChange("quantity", e.target.value)} onBlur={handleBlur} style={{ ...inputStyle, textAlign: "right" }} type="number" />
      </td>
      <td style={{ ...tdStyle, width: 60 }}>
        <input value={vals.unit || ""} onChange={e => handleChange("unit", e.target.value)} onBlur={handleBlur} style={inputStyle} placeholder="%" />
      </td>
      <td style={tdStyle}>
        <input value={vals.function_in_formula || ""} onChange={e => handleChange("function_in_formula", e.target.value)} onBlur={handleBlur} style={inputStyle} placeholder="Function" />
      </td>
      <td style={{ ...tdStyle, width: 28, textAlign: "center" }}>
        <button onClick={onDelete} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 12, padding: 0 }}>✕</button>
      </td>
    </tr>
  );
}

function FormulationsTab({ programId }) {
  const [formulas, setFormulas] = useState([]);
  const [selected, setSelected] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("plm_formulations").select("*").eq("program_id", programId).order("created_at")
      .then(({ data }) => { setFormulas(data || []); setLoading(false); });
  }, [programId]);

  useEffect(() => {
    if (!selected) { setItems([]); return; }
    supabase.from("plm_formula_items").select("*").eq("formulation_id", selected.id).order("sort_order,created_at")
      .then(({ data }) => setItems(data || []));
  }, [selected]);

  const addFormula = async () => {
    const { data } = await supabase.from("plm_formulations").insert({
      program_id: programId, name: "New Formulation", version: "v1.0", status: "draft",
    }).select().single();
    if (data) { setFormulas(p => [...p, data]); setSelected(data); }
  };

  const addItem = async () => {
    if (!selected) return;
    const { data } = await supabase.from("plm_formula_items").insert({
      formulation_id: selected.id, ingredient_name: "", quantity: 0, unit: "%",
    }).select().single();
    if (data) setItems(p => [...p, data]);
  };

  const deleteItem = async (id) => {
    await supabase.from("plm_formula_items").delete().eq("id", id);
    setItems(p => p.filter(x => x.id !== id));
  };

  const totalPct = items.filter(i => i.unit === "%").reduce((a, b) => a + parseFloat(b.quantity || 0), 0);

  if (loading) return <div style={{ color: T.text3, fontSize: 13 }}>Loading…</div>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16, height: "100%" }}>
      {/* Formula list */}
      <div style={{ borderRight: `1px solid ${T.border}`, paddingRight: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 1 }}>Formulas</div>
          <AddBtn onClick={addFormula} label="New" />
        </div>
        {formulas.length === 0 && <EmptyState icon="⚗️" text="No formulas yet" />}
        {formulas.map(f => (
          <div key={f.id} onClick={() => setSelected(f)} style={{
            padding: "8px 10px", borderRadius: 6, cursor: "pointer", marginBottom: 4,
            background: selected?.id === f.id ? T.accentDim : T.surface2,
            border: `1px solid ${selected?.id === f.id ? T.accent + "60" : T.border}`,
          }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: T.text }}>{f.name}</div>
            <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>{f.version} · {f.status}</div>
          </div>
        ))}
      </div>

      {/* BOM */}
      <div>
        {!selected ? (
          <EmptyState icon="⚗️" text="Select a formulation to view its ingredients" />
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: T.text }}>{selected.name}</div>
                <div style={{ fontSize: 11, color: T.text3 }}>{selected.version}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 12, color: totalPct > 100.5 ? "#ef4444" : totalPct > 99.4 ? "#22c55e" : "#eab308", fontWeight: 600 }}>
                  Total: {totalPct.toFixed(2)}%
                </span>
                <AddBtn onClick={addItem} label="Ingredient" />
              </div>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ borderBottom: `1px solid ${T.border2}` }}>
                  {["Ingredient", "Qty", "Unit", "Function", ""].map(h => (
                    <th key={h} style={{ padding: "4px 6px", textAlign: "left", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <FormulaItemRow key={item.id} item={item}
                    onUpdate={updated => setItems(p => p.map(x => x.id === updated.id ? updated : x))}
                    onDelete={() => deleteItem(item.id)}
                  />
                ))}
              </tbody>
            </table>
            {items.length === 0 && <EmptyState icon="🧪" text="No ingredients — add one to get started" />}
          </>
        )}
      </div>
    </div>
  );
}

// ─── TAB: EXPERIMENTS ────────────────────────────────────────────────────────

function ExperimentsTab({ programId }) {
  const [experiments, setExperiments] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("plm_experiments").select("*").eq("program_id", programId).order("created_at")
      .then(({ data }) => { setExperiments(data || []); setLoading(false); });
  }, [programId]);

  const add = async () => {
    const { data } = await supabase.from("plm_experiments").insert({
      program_id: programId, name: "New Experiment", experiment_type: "formulation", status: "draft",
    }).select().single();
    if (data) { setExperiments(p => [...p, data]); setSelected(data); }
  };

  const update = async (field, val) => {
    await supabase.from("plm_experiments").update({ [field]: val }).eq("id", selected.id);
    const updated = { ...selected, [field]: val };
    setSelected(updated);
    setExperiments(p => p.map(x => x.id === updated.id ? updated : x));
  };

  if (loading) return <div style={{ color: T.text3, fontSize: 13 }}>Loading…</div>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16 }}>
      <div style={{ borderRight: `1px solid ${T.border}`, paddingRight: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 1 }}>Experiments</div>
          <AddBtn onClick={add} label="New" />
        </div>
        {experiments.length === 0 && <EmptyState icon="🔬" text="No experiments yet" />}
        {experiments.map(e => (
          <div key={e.id} onClick={() => setSelected(e)} style={{
            padding: "8px 10px", borderRadius: 6, cursor: "pointer", marginBottom: 4,
            background: selected?.id === e.id ? T.accentDim : T.surface2,
            border: `1px solid ${selected?.id === e.id ? T.accent + "60" : T.border}`,
          }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: T.text }}>{e.name}</div>
            <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>
              <StatusDot status={e.status} />{e.experiment_type || "—"}
            </div>
          </div>
        ))}
      </div>

      <div>
        {!selected ? <EmptyState icon="🔬" text="Select an experiment to view details" /> : (
          <div>
            <InlineField label="Name" value={selected.name} onChange={v => update("name", v)} />
            <InlineField label="Type" value={selected.experiment_type} onChange={v => update("experiment_type", v)}
              options={["formulation","sensory","analytical","stability","consumer","clinical","process"].map(t => ({ value: t, label: t }))}
            />
            <InlineField label="Status" value={selected.status} onChange={v => update("status", v)}
              options={["draft","planned","in_progress","completed","cancelled"].map(s => ({ value: s, label: s }))}
            />
            <InlineField label="Hypothesis" value={selected.hypothesis} onChange={v => update("hypothesis", v)} multiline placeholder="State your hypothesis…" />
            <InlineField label="Conclusions" value={selected.conclusions} onChange={v => update("conclusions", v)} multiline placeholder="Conclusions…" />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TAB: MANUFACTURING TRIALS ───────────────────────────────────────────────

function TrialsTab({ programId }) {
  const [trials, setTrials] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("plm_manufacturing_trials").select("*").eq("program_id", programId).order("created_at")
      .then(({ data }) => { setTrials(data || []); setLoading(false); });
  }, [programId]);

  const add = async () => {
    const count = trials.length + 1;
    const { data } = await supabase.from("plm_manufacturing_trials").insert({
      program_id: programId,
      trial_number: `T-${String(count).padStart(3, "0")}`,
      name: `Trial ${count}`,
      trial_type: "lab",
      status: "planned",
    }).select().single();
    if (data) { setTrials(p => [...p, data]); setSelected(data); }
  };

  const update = async (field, val) => {
    await supabase.from("plm_manufacturing_trials").update({ [field]: val }).eq("id", selected.id);
    const updated = { ...selected, [field]: val };
    setSelected(updated);
    setTrials(p => p.map(x => x.id === updated.id ? updated : x));
  };

  if (loading) return <div style={{ color: T.text3, fontSize: 13 }}>Loading…</div>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16 }}>
      <div style={{ borderRight: `1px solid ${T.border}`, paddingRight: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 1 }}>Trials</div>
          <AddBtn onClick={add} label="New" />
        </div>
        {trials.length === 0 && <EmptyState icon="🏭" text="No trials yet" />}
        {trials.map(t => (
          <div key={t.id} onClick={() => setSelected(t)} style={{
            padding: "8px 10px", borderRadius: 6, cursor: "pointer", marginBottom: 4,
            background: selected?.id === t.id ? T.accentDim : T.surface2,
            border: `1px solid ${selected?.id === t.id ? T.accent + "60" : T.border}`,
          }}>
            <div style={{ fontSize: 11, color: T.accent, fontWeight: 600 }}>{t.trial_number}</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: T.text }}>{t.name}</div>
            <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>
              <StatusDot status={t.status} />{t.trial_type}
            </div>
          </div>
        ))}
      </div>

      <div>
        {!selected ? <EmptyState icon="🏭" text="Select a trial to view details" /> : (
          <div>
            <InlineField label="Trial Name" value={selected.name} onChange={v => update("name", v)} />
            <InlineField label="Type" value={selected.trial_type} onChange={v => update("trial_type", v)}
              options={["lab","pilot","scale_up","commercial","validation"].map(t => ({ value: t, label: t }))}
            />
            <InlineField label="Status" value={selected.status} onChange={v => update("status", v)}
              options={["planned","in_progress","completed","failed","cancelled"].map(s => ({ value: s, label: s }))}
            />
            <InlineField label="Site" value={selected.site_name} onChange={v => update("site_name", v)} placeholder="Manufacturing site" />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <InlineField label="Batch Size" value={selected.batch_size} onChange={v => update("batch_size", v)} type="number" />
              <InlineField label="Unit" value={selected.batch_size_unit} onChange={v => update("batch_size_unit", v)} placeholder="kg / L" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <InlineField label="Planned Date" value={selected.planned_date} onChange={v => update("planned_date", v)} type="date" />
              <InlineField label="Actual Date" value={selected.actual_date} onChange={v => update("actual_date", v)} type="date" />
            </div>
            {selected.actual_yield != null && selected.theoretical_yield != null && (
              <div style={{ marginTop: 8, padding: "8px 12px", background: T.surface2, borderRadius: 6, fontSize: 12, color: T.text2 }}>
                Yield: {selected.actual_yield} / {selected.theoretical_yield} ({selected.yield_pct?.toFixed(1)}%)
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TAB: CLAIMS ─────────────────────────────────────────────────────────────

function ClaimRow({ claim, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [vals, setVals] = useState(claim);

  const save = async () => {
    await supabase.from("plm_claims").update({ claim_text: vals.claim_text, status: vals.status, claim_type: vals.claim_type }).eq("id", claim.id);
    onUpdate(vals);
    setEditing(false);
  };

  const statusColor = STATUS_COLORS[claim.status] || "#8b93a8";

  return (
    <div style={{ padding: "10px 12px", background: T.surface2, borderRadius: 8, border: `1px solid ${T.border}`, marginBottom: 8 }}>
      {editing ? (
        <div>
          <textarea value={vals.claim_text} onChange={e => setVals(p => ({ ...p, claim_text: e.target.value }))}
            style={{ width: "100%", fontSize: 13, color: T.text, background: T.surface3, border: `1px solid ${T.border}`, borderRadius: 6, padding: 8, resize: "vertical", minHeight: 60, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}
          />
          <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
            <select value={vals.status || ""} onChange={e => setVals(p => ({ ...p, status: e.target.value }))}
              style={{ fontSize: 12, background: T.surface3, border: `1px solid ${T.border}`, color: T.text, borderRadius: 5, padding: "3px 6px" }}>
              {["draft","pending","approved","rejected"].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button onClick={save} style={{ fontSize: 12, background: T.accent, color: "#fff", border: "none", borderRadius: 5, padding: "3px 10px", cursor: "pointer" }}>Save</button>
            <button onClick={() => setEditing(false)} style={{ fontSize: 12, background: T.surface3, color: T.text2, border: `1px solid ${T.border}`, borderRadius: 5, padding: "3px 10px", cursor: "pointer" }}>Cancel</button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, color: T.text, lineHeight: 1.5 }}>{claim.claim_text}</div>
            <div style={{ marginTop: 4, fontSize: 11, color: T.text3 }}>
              <StatusDot status={claim.status} />
              <span style={{ color: statusColor, fontWeight: 600 }}>{claim.status}</span>
              {claim.claim_type && <span style={{ marginLeft: 8 }}>{claim.claim_type}</span>}
            </div>
          </div>
          <button onClick={() => setEditing(true)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 11, padding: "2px 6px", borderRadius: 4, flexShrink: 0 }}>Edit</button>
          <button onClick={onDelete} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 11, padding: "2px 6px", borderRadius: 4, flexShrink: 0 }}>✕</button>
        </div>
      )}
    </div>
  );
}

function ClaimsTab({ programId }) {
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("plm_claims").select("*").eq("program_id", programId).order("priority,created_at")
      .then(({ data }) => { setClaims(data || []); setLoading(false); });
  }, [programId]);

  const add = async () => {
    const { data } = await supabase.from("plm_claims").insert({
      program_id: programId, claim_text: "New claim", claim_type: "marketing", status: "draft",
    }).select().single();
    if (data) setClaims(p => [...p, data]);
  };

  const deleteClaim = async (id) => {
    await supabase.from("plm_claims").delete().eq("id", id);
    setClaims(p => p.filter(x => x.id !== id));
  };

  if (loading) return <div style={{ color: T.text3, fontSize: 13 }}>Loading…</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: T.text2 }}>{claims.length} claim{claims.length !== 1 ? "s" : ""}</div>
        <AddBtn onClick={add} label="Add Claim" />
      </div>
      {claims.length === 0 && <EmptyState icon="✅" text="No claims yet — add a marketing or regulatory claim" />}
      {claims.map(c => (
        <ClaimRow key={c.id} claim={c}
          onUpdate={updated => setClaims(p => p.map(x => x.id === updated.id ? updated : x))}
          onDelete={() => deleteClaim(c.id)}
        />
      ))}
    </div>
  );
}

// ─── TAB: SKUs ───────────────────────────────────────────────────────────────

function SKUsTab({ programId }) {
  const [skus, setSkus] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("plm_skus").select("*").eq("program_id", programId).order("created_at")
      .then(({ data }) => { setSkus(data || []); setLoading(false); });
  }, [programId]);

  const add = async () => {
    const count = skus.length + 1;
    const { data } = await supabase.from("plm_skus").insert({
      program_id: programId,
      sku_code: `SKU-${String(count).padStart(4, "0")}`,
      name: "New SKU",
      status: "draft",
    }).select().single();
    if (data) { setSkus(p => [...p, data]); setSelected(data); }
  };

  const update = async (field, val) => {
    await supabase.from("plm_skus").update({ [field]: val }).eq("id", selected.id);
    const updated = { ...selected, [field]: val };
    setSelected(updated);
    setSkus(p => p.map(x => x.id === updated.id ? updated : x));
  };

  if (loading) return <div style={{ color: T.text3, fontSize: 13 }}>Loading…</div>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 16 }}>
      <div style={{ borderRight: `1px solid ${T.border}`, paddingRight: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 1 }}>SKUs</div>
          <AddBtn onClick={add} label="New" />
        </div>
        {skus.length === 0 && <EmptyState icon="📦" text="No SKUs yet" />}
        {skus.map(s => (
          <div key={s.id} onClick={() => setSelected(s)} style={{
            padding: "8px 10px", borderRadius: 6, cursor: "pointer", marginBottom: 4,
            background: selected?.id === s.id ? T.accentDim : T.surface2,
            border: `1px solid ${selected?.id === s.id ? T.accent + "60" : T.border}`,
          }}>
            <div style={{ fontSize: 11, color: T.accent, fontWeight: 600 }}>{s.sku_code}</div>
            <div style={{ fontSize: 13, fontWeight: 500, color: T.text }}>{s.name}</div>
            <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>
              <StatusDot status={s.status} />{s.status}
            </div>
          </div>
        ))}
      </div>

      <div>
        {!selected ? <EmptyState icon="📦" text="Select a SKU to view details" /> : (
          <div>
            <InlineField label="SKU Name" value={selected.name} onChange={v => update("name", v)} />
            <InlineField label="SKU Code" value={selected.sku_code} onChange={v => update("sku_code", v)} />
            <InlineField label="UPC / EAN" value={selected.upc_ean} onChange={v => update("upc_ean", v)} />
            <InlineField label="Status" value={selected.status} onChange={v => update("status", v)}
              options={["draft","development","approved","launched","discontinued"].map(s => ({ value: s, label: s }))}
            />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <InlineField label="Net Weight" value={selected.net_weight} onChange={v => update("net_weight", v)} type="number" />
              <InlineField label="Weight Unit" value={selected.weight_unit} onChange={v => update("weight_unit", v)} placeholder="g / oz / ml" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <InlineField label="Target Retail ($)" value={selected.target_retail} onChange={v => update("target_retail", v)} type="number" />
              <InlineField label="Unit COGS ($)" value={selected.unit_cogs} onChange={v => update("unit_cogs", v)} type="number" />
            </div>
            <InlineField label="Description" value={selected.description} onChange={v => update("description", v)} multiline />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TAB: ISSUES ─────────────────────────────────────────────────────────────

function IssuesTab({ programId }) {
  const [issues, setIssues] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("plm_issues").select("*").eq("program_id", programId).order("created_at", { ascending: false })
      .then(({ data }) => { setIssues(data || []); setLoading(false); });
  }, [programId]);

  const add = async () => {
    const { data } = await supabase.from("plm_issues").insert({
      program_id: programId, title: "New Issue", issue_type: "formulation", severity: "medium", status: "open",
      org_id: (await supabase.from("plm_programs").select("org_id").eq("id", programId).single()).data?.org_id,
    }).select().single();
    if (data) { setIssues(p => [data, ...p]); setSelected(data); }
  };

  const update = async (field, val) => {
    await supabase.from("plm_issues").update({ [field]: val }).eq("id", selected.id);
    const updated = { ...selected, [field]: val };
    setSelected(updated);
    setIssues(p => p.map(x => x.id === updated.id ? updated : x));
  };

  const severityColor = { critical: "#ef4444", high: "#f97316", medium: "#eab308", low: "#22c55e" };

  if (loading) return <div style={{ color: T.text3, fontSize: 13 }}>Loading…</div>;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "260px 1fr", gap: 16 }}>
      <div style={{ borderRight: `1px solid ${T.border}`, paddingRight: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 1 }}>Issues</div>
          <AddBtn onClick={add} label="New" />
        </div>
        {issues.length === 0 && <EmptyState icon="⚠️" text="No issues — great sign!" />}
        {issues.map(i => (
          <div key={i.id} onClick={() => setSelected(i)} style={{
            padding: "8px 10px", borderRadius: 6, cursor: "pointer", marginBottom: 4,
            background: selected?.id === i.id ? T.accentDim : T.surface2,
            border: `1px solid ${selected?.id === i.id ? T.accent + "60" : T.border}`,
          }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 2 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", background: severityColor[i.severity] || "#8b93a8", flexShrink: 0 }} />
              <div style={{ fontSize: 13, fontWeight: 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{i.title}</div>
            </div>
            <div style={{ fontSize: 11, color: T.text3 }}>{i.issue_type} · {i.status}</div>
          </div>
        ))}
      </div>

      <div>
        {!selected ? <EmptyState icon="⚠️" text="Select an issue to view details" /> : (
          <div>
            <InlineField label="Title" value={selected.title} onChange={v => update("title", v)} />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <InlineField label="Type" value={selected.issue_type} onChange={v => update("issue_type", v)}
                options={["formulation","process","quality","regulatory","supply","packaging","sensory","stability"].map(t => ({ value: t, label: t }))}
              />
              <InlineField label="Severity" value={selected.severity} onChange={v => update("severity", v)}
                options={["critical","high","medium","low"].map(s => ({ value: s, label: s }))}
              />
            </div>
            <InlineField label="Status" value={selected.status} onChange={v => update("status", v)}
              options={["open","investigating","in_progress","resolved","closed"].map(s => ({ value: s, label: s }))}
            />
            <InlineField label="Description" value={selected.description} onChange={v => update("description", v)} multiline placeholder="Describe the issue…" />
            <InlineField label="Root Cause" value={selected.root_cause} onChange={v => update("root_cause", v)} multiline placeholder="Root cause analysis…" />
            <InlineField label="Corrective Action" value={selected.corrective_action} onChange={v => update("corrective_action", v)} multiline placeholder="Corrective action plan…" />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TAB: TEST RESULTS ───────────────────────────────────────────────────────

function TestResultsTab({ programId }) {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("plm_test_results").select("*").eq("program_id", programId).order("tested_date", { ascending: false })
      .then(({ data }) => { setResults(data || []); setLoading(false); });
  }, [programId]);

  const add = async () => {
    const { data } = await supabase.from("plm_test_results").insert({
      program_id: programId, test_name: "New Test", test_category: "physical", status: "pending",
    }).select().single();
    if (data) setResults(p => [data, ...p]);
  };

  if (loading) return <div style={{ color: T.text3, fontSize: 13 }}>Loading…</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: T.text2 }}>{results.length} test result{results.length !== 1 ? "s" : ""}</div>
        <AddBtn onClick={add} label="Add Result" />
      </div>
      {results.length === 0 && <EmptyState icon="📋" text="No test results yet" />}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: `1px solid ${T.border2}` }}>
            {["Test Name","Category","Method","Spec","Result","Status","Date"].map(h => (
              <th key={h} style={{ padding: "6px 10px", textAlign: "left", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {results.map(r => {
            const sc = STATUS_COLORS[r.status] || "#8b93a8";
            return (
              <tr key={r.id} style={{ borderBottom: `1px solid ${T.border}` }}>
                <td style={{ padding: "8px 10px", fontSize: 13, color: T.text, fontWeight: 500 }}>{r.test_name}</td>
                <td style={{ padding: "8px 10px", fontSize: 12, color: T.text2 }}>{r.test_category}</td>
                <td style={{ padding: "8px 10px", fontSize: 12, color: T.text3 }}>{r.test_method || "—"}</td>
                <td style={{ padding: "8px 10px", fontSize: 12, color: T.text3 }}>{r.specification || "—"}</td>
                <td style={{ padding: "8px 10px", fontSize: 12, color: T.text, fontWeight: 600 }}>
                  {r.result_value != null ? `${r.result_value} ${r.result_unit || ""}` : r.result_text || "—"}
                </td>
                <td style={{ padding: "8px 10px" }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: sc, background: sc + "20", padding: "2px 7px", borderRadius: 4 }}>
                    {r.status?.toUpperCase()}
                  </span>
                </td>
                <td style={{ padding: "8px 10px", fontSize: 11, color: T.text3 }}>{r.tested_date || "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── TAB: GATE REVIEWS ───────────────────────────────────────────────────────

function GateReviewsTab({ programId }) {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.from("plm_gate_reviews").select("*").eq("program_id", programId).order("review_date", { ascending: false })
      .then(({ data }) => { setReviews(data || []); setLoading(false); });
  }, [programId]);

  const decisionColor = { approved: "#22c55e", rejected: "#ef4444", conditional: "#eab308", deferred: "#8b93a8" };

  if (loading) return <div style={{ color: T.text3, fontSize: 13 }}>Loading…</div>;

  return (
    <div>
      {reviews.length === 0 && <EmptyState icon="🚦" text="No gate reviews recorded yet" />}
      {reviews.map(r => {
        const dc = decisionColor[r.decision] || "#8b93a8";
        return (
          <div key={r.id} style={{ padding: "14px 16px", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>
                  {r.from_stage} → {r.to_stage}
                </div>
                <div style={{ fontSize: 12, color: T.text3, marginTop: 2 }}>{r.review_date || "Date TBD"}</div>
              </div>
              {r.decision && (
                <span style={{ fontSize: 11, fontWeight: 700, color: dc, background: dc + "20", padding: "3px 10px", borderRadius: 5 }}>
                  {r.decision.toUpperCase()}
                </span>
              )}
            </div>
            {r.meeting_notes && (
              <div style={{ marginTop: 10, fontSize: 13, color: T.text2, lineHeight: 1.6, borderTop: `1px solid ${T.border}`, paddingTop: 10 }}>
                {r.meeting_notes}
              </div>
            )}
            {r.overall_score != null && (
              <div style={{ marginTop: 8, fontSize: 12, color: T.text3 }}>Score: <strong style={{ color: T.text }}>{r.overall_score}/10</strong></div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── PROGRAM DETAIL VIEW ─────────────────────────────────────────────────────

const DETAIL_TABS = [
  { key: "overview",       label: "Overview"    },
  { key: "formulations",   label: "Formulations"},
  { key: "experiments",    label: "Experiments" },
  { key: "trials",         label: "Trials"      },
  { key: "claims",         label: "Claims"      },
  { key: "skus",           label: "SKUs"        },
  { key: "issues",         label: "Issues"      },
  { key: "test_results",   label: "Test Results"},
  { key: "gate_reviews",   label: "Gate Reviews"},
];

function ProgramDetail({ program, onBack, onUpdate }) {
  const [tab, setTab] = useState("overview");
  const [counts, setCounts] = useState({});

  useEffect(() => {
    const fetchCounts = async () => {
      const [
        { count: formulations },
        { count: experiments },
        { count: trials },
        { count: skus },
        { count: claims },
        { count: issues },
      ] = await Promise.all([
        supabase.from("plm_formulations").select("*", { count: "exact", head: true }).eq("program_id", program.id),
        supabase.from("plm_experiments").select("*", { count: "exact", head: true }).eq("program_id", program.id),
        supabase.from("plm_manufacturing_trials").select("*", { count: "exact", head: true }).eq("program_id", program.id),
        supabase.from("plm_skus").select("*", { count: "exact", head: true }).eq("program_id", program.id),
        supabase.from("plm_claims").select("*", { count: "exact", head: true }).eq("program_id", program.id),
        supabase.from("plm_issues").select("*", { count: "exact", head: true }).eq("program_id", program.id),
      ]);
      setCounts({ formulations, experiments, trials, skus, claims, issues });
    };
    fetchCounts();
  }, [program.id]);

  const renderTab = () => {
    switch (tab) {
      case "overview":     return <OverviewTab program={program} onUpdate={onUpdate} counts={counts} />;
      case "formulations": return <FormulationsTab programId={program.id} />;
      case "experiments":  return <ExperimentsTab programId={program.id} />;
      case "trials":       return <TrialsTab programId={program.id} />;
      case "claims":       return <ClaimsTab programId={program.id} />;
      case "skus":         return <SKUsTab programId={program.id} />;
      case "issues":       return <IssuesTab programId={program.id} />;
      case "test_results": return <TestResultsTab programId={program.id} />;
      case "gate_reviews": return <GateReviewsTab programId={program.id} />;
      default:             return null;
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{ padding: "16px 24px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <button onClick={onBack} style={{ background: "none", border: `1px solid ${T.border}`, color: T.text2, cursor: "pointer", borderRadius: 6, padding: "4px 10px", fontSize: 12 }}>
          ← Back
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.text }}>{program.name}</div>
            <StageBadge stage={program.current_stage} />
            <PriorityBadge priority={program.priority} />
          </div>
          {program.code && <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>{program.code}</div>}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${T.border}`, paddingLeft: 24, flexShrink: 0 }}>
        {DETAIL_TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            background: "none", border: "none", cursor: "pointer",
            padding: "10px 14px", fontSize: 12, fontWeight: 600,
            color: tab === t.key ? T.accent : T.text3,
            borderBottom: `2px solid ${tab === t.key ? T.accent : "transparent"}`,
            transition: "color 0.15s",
          }}>{t.label}</button>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>
        {renderTab()}
      </div>
    </div>
  );
}

// ─── PROGRAM LIST / PIPELINE ──────────────────────────────────────────────────

function NewProgramModal({ onClose, onCreated, orgId }) {
  const [form, setForm] = useState({ name: "", program_type: "new_product", priority: "medium", current_stage: "ideation" });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    const { data } = await supabase.from("plm_programs").insert({ ...form, org_id: orgId }).select().single();
    if (data) onCreated(data);
    setSaving(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#00000080", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={onClose}>
      <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 24, width: 440, maxWidth: "90vw" }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 20 }}>New Program</div>
        <InlineField label="Program Name *" value={form.name} onChange={v => setForm(p => ({ ...p, name: v }))} placeholder="e.g. Next-Gen Moisturizer" />
        <InlineField label="Type" value={form.program_type} onChange={v => setForm(p => ({ ...p, program_type: v }))}
          options={PROGRAM_TYPES.map(t => ({ value: t, label: t.replace(/_/g, " ") }))}
        />
        <InlineField label="Priority" value={form.priority} onChange={v => setForm(p => ({ ...p, priority: v }))}
          options={["critical","high","medium","low"].map(x => ({ value: x, label: x }))}
        />
        <InlineField label="Starting Stage" value={form.current_stage} onChange={v => setForm(p => ({ ...p, current_stage: v }))}
          options={STAGES.map(s => ({ value: s.key, label: s.label }))}
        />
        <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 10, fontSize: 13, background: T.surface2, color: T.text2, border: `1px solid ${T.border}`, borderRadius: 6, cursor: "pointer" }}>Cancel</button>
          <button onClick={handleSubmit} disabled={saving || !form.name.trim()} style={{ flex: 2, padding: 10, fontSize: 13, fontWeight: 600, background: T.accent, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", opacity: saving ? 0.6 : 1 }}>
            {saving ? "Creating…" : "Create Program"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN PLM VIEW ────────────────────────────────────────────────────────────

export default function PLMView() {
  const [programs, setPrograms] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState("pipeline"); // "pipeline" | "list"
  const [showNew, setShowNew] = useState(false);
  const [search, setSearch] = useState("");
  const [orgId, setOrgId] = useState(null);

  useEffect(() => {
    const load = async () => {
      // Get org_id from memberships
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: membership } = await supabase.from("org_memberships").select("org_id").eq("user_id", user.id).single();
        if (membership) setOrgId(membership.org_id);
      }

      const { data } = await supabase.from("plm_programs").select("*").is("deleted_at", null).order("created_at", { ascending: false });
      setPrograms(data || []);
      setLoading(false);
    };
    load();
  }, []);

  const filtered = programs.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.brand?.toLowerCase().includes(search.toLowerCase())
  );

  const handleUpdate = (updated) => {
    setPrograms(p => p.map(x => x.id === updated.id ? updated : x));
    setSelected(updated);
  };

  const handleCreated = (program) => {
    setPrograms(p => [program, ...p]);
    setSelected(program);
    setShowNew(false);
  };

  const deleteProgram = async (id) => {
    await supabase.from("plm_programs").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    setPrograms(p => p.filter(x => x.id !== id));
    if (selected?.id === id) setSelected(null);
  };

  // ── Program Detail ──
  if (selected) {
    return <ProgramDetail program={selected} onBack={() => setSelected(null)} onUpdate={handleUpdate} />;
  }

  // ── Pipeline / List ──
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Toolbar */}
      <div style={{ padding: "14px 24px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 700, color: T.text, flex: 1 }}>Product Lifecycle</div>

        {/* Search */}
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search programs…"
          style={{ fontSize: 12, padding: "6px 12px", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 7, color: T.text, width: 200, outline: "none" }}
        />

        {/* View toggle */}
        <div style={{ display: "flex", background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, overflow: "hidden" }}>
          {[["pipeline","⬢ Pipeline"],["list","☰ List"]].map(([k, label]) => (
            <button key={k} onClick={() => setView(k)} style={{
              padding: "5px 12px", fontSize: 12, fontWeight: 600,
              background: view === k ? T.accent : "transparent",
              color: view === k ? "#fff" : T.text3,
              border: "none", cursor: "pointer",
            }}>{label}</button>
          ))}
        </div>

        <button onClick={() => setShowNew(true)} style={{ padding: "6px 14px", fontSize: 12, fontWeight: 600, background: T.accent, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>
          + New Program
        </button>
      </div>

      {/* KPI bar */}
      <div style={{ display: "flex", gap: 0, borderBottom: `1px solid ${T.border}`, padding: "0 24px", flexShrink: 0 }}>
        {[
          { label: "Total Programs", val: programs.length },
          { label: "In Development", val: programs.filter(p => ["development","optimization","validation"].includes(p.current_stage)).length },
          { label: "Launch Ready", val: programs.filter(p => p.current_stage === "launch_ready").length },
          { label: "Launched", val: programs.filter(p => p.current_stage === "launched").length },
        ].map(k => (
          <div key={k.label} style={{ padding: "12px 20px", borderRight: `1px solid ${T.border}` }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: T.text }}>{k.val}</div>
            <div style={{ fontSize: 11, color: T.text3 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: "auto", padding: "20px 24px" }}>
        {loading ? (
          <div style={{ color: T.text3, fontSize: 13 }}>Loading programs…</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon="⬡" text={search ? "No programs match your search" : "No programs yet — create your first one"} />
        ) : view === "pipeline" ? (
          // Pipeline kanban
          <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 16 }}>
            {STAGES.map(stage => {
              const stagePrograms = filtered.filter(p => p.current_stage === stage.key);
              return (
                <div key={stage.key} style={{ minWidth: 200, flexShrink: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: stage.color }} />
                    <div style={{ fontSize: 11, fontWeight: 700, color: T.text2, textTransform: "uppercase", letterSpacing: 0.5 }}>{stage.label}</div>
                    <div style={{ marginLeft: "auto", fontSize: 11, color: T.text3, background: T.surface2, borderRadius: 4, padding: "1px 6px" }}>{stagePrograms.length}</div>
                  </div>
                  {stagePrograms.map(p => (
                    <div key={p.id} onClick={() => setSelected(p)} style={{
                      padding: "10px 12px", background: T.surface2, border: `1px solid ${T.border}`,
                      borderRadius: 8, cursor: "pointer", marginBottom: 8,
                      transition: "border-color 0.15s, background 0.15s",
                    }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = stage.color + "80"; e.currentTarget.style.background = T.surface3; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = T.border; e.currentTarget.style.background = T.surface2; }}
                    >
                      {p.brand && <div style={{ fontSize: 10, color: T.text3, marginBottom: 2, fontWeight: 600, textTransform: "uppercase" }}>{p.brand}</div>}
                      <div style={{ fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 4 }}>{p.name}</div>
                      <PriorityBadge priority={p.priority} />
                      {p.target_launch_date && (
                        <div style={{ fontSize: 10, color: T.text3, marginTop: 5 }}>🎯 {p.target_launch_date}</div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ) : (
          // List view
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${T.border2}` }}>
                {["Program","Type","Stage","Priority","Brand","Target Launch",""].map(h => (
                  <th key={h} style={{ padding: "7px 12px", textAlign: "left", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.5 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} onClick={() => setSelected(p)} style={{ borderBottom: `1px solid ${T.border}`, cursor: "pointer" }}
                  onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}
                >
                  <td style={{ padding: "10px 12px", fontSize: 13, fontWeight: 500, color: T.text }}>{p.name}</td>
                  <td style={{ padding: "10px 12px", fontSize: 12, color: T.text2 }}>{p.program_type?.replace(/_/g, " ")}</td>
                  <td style={{ padding: "10px 12px" }}><StageBadge stage={p.current_stage} /></td>
                  <td style={{ padding: "10px 12px" }}><PriorityBadge priority={p.priority} /></td>
                  <td style={{ padding: "10px 12px", fontSize: 12, color: T.text2 }}>{p.brand || "—"}</td>
                  <td style={{ padding: "10px 12px", fontSize: 12, color: T.text3 }}>{p.target_launch_date || "—"}</td>
                  <td style={{ padding: "10px 12px" }}>
                    <button onClick={e => { e.stopPropagation(); if (confirm("Delete this program?")) deleteProgram(p.id); }}
                      style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 11, opacity: 0.6 }}>✕</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showNew && <NewProgramModal onClose={() => setShowNew(false)} onCreated={handleCreated} orgId={orgId} />}
    </div>
  );
}
