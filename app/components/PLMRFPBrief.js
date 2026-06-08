"use client";
import { useState, useCallback, useMemo } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";

// Bullet-list value: render as newline-separated textarea (one item per line)
function ListField({ label, value, onChange, placeholder }) {
  const text = (value || []).join("\n");
  return (
    <div style={{ marginBottom: 12 }}>
      <Label>{label}</Label>
      <textarea
        value={text}
        onChange={e => onChange(e.target.value.split("\n").map(s => s.trim()).filter(Boolean))}
        placeholder={placeholder}
        rows={Math.max(2, (value || []).length + 1)}
        style={textareaStyle}
      />
      <div style={{ fontSize: 9, color: T.text3, marginTop: 2 }}>One per line · {(value || []).length} items</div>
    </div>
  );
}

function TextField({ label, value, onChange, placeholder, multiline, type = "text" }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <Label>{label}</Label>
      {multiline
        ? <textarea value={value || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} rows={3} style={textareaStyle} />
        : <input value={value || ""} onChange={e => onChange(e.target.value)} placeholder={placeholder} type={type} style={inputStyle} />}
    </div>
  );
}

const Label = ({ children }) => <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 4 }}>{children}</div>;
const inputStyle = { background: T.surface, border: "1px solid " + T.border, color: T.text, fontSize: 13, padding: "7px 10px", borderRadius: 5, width: "100%", outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
const textareaStyle = { ...inputStyle, resize: "vertical", lineHeight: 1.5 };
const primaryBtn = { background: T.accent, color: "#fff", border: "none", borderRadius: 6, padding: "8px 14px", fontSize: 12, fontWeight: 600, cursor: "pointer" };
const ghostBtn   = { background: "none", border: "1px solid " + T.border, color: T.text2, borderRadius: 6, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" };

// ─── Main exported component ──────────────────────────────────────────────────
export default function PLMRFPBrief({ rfp, program, onUpdate }) {
  const [brief, setBrief] = useState(rfp.brief || {});
  const [saving, setSaving] = useState(false);
  const [showParse, setShowParse] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const save = useCallback(async (next) => {
    setSaving(true);
    setBrief(next);
    await supabase.from("plm_rfps").update({ brief: next }).eq("id", rfp.id);
    onUpdate?.({ ...rfp, brief: next });
    setSaving(false);
  }, [rfp, onUpdate]);

  const setField = (key, val) => save({ ...brief, [key]: val });
  const setNested = (parent, key, val) => save({ ...brief, [parent]: { ...(brief[parent] || {}), [key]: val } });

  const aiGenerate = async () => {
    setAiBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("plm-rfp-assist", {
        body: {
          action: "generate_structured_brief",
          program: { name: program?.name, description: program?.description, category: program?.category, target_markets_v2: program?.target_markets_v2, target_gross_margin_pct: program?.target_gross_margin_pct, target_unit_price: program?.target_unit_price },
          rfp,
          items: [],
          extra_context: rfp.description || "",
        },
      });
      if (error) throw error;
      if (data?.brief) await save({ ...brief, ...data.brief });
    } catch (e) {
      alert("AI generate failed: " + (e.message || String(e)));
    } finally {
      setAiBusy(false);
    }
  };

  return (
    <div style={{ marginBottom: 24, background: T.surface2, border: "1px solid " + T.border, borderRadius: 10, overflow: "hidden" }}>
      <div onClick={() => setCollapsed(c => !c)} style={{ padding: "12px 16px", background: T.surface, borderBottom: collapsed ? "none" : "1px solid " + T.border, cursor: "pointer", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>📋 Product Development Brief</div>
          <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>The structured requirements suppliers will receive. {saving && <span style={{ color: T.accent }}>· saving…</span>}</div>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center" }} onClick={e => e.stopPropagation()}>
          <button onClick={() => setShowParse(true)} style={{ ...ghostBtn, color: "#8b5cf6", borderColor: "#8b5cf650" }}>📄 Paste &amp; parse</button>
          <button onClick={aiGenerate} disabled={aiBusy} style={{ ...ghostBtn, color: "#8b5cf6", borderColor: "#8b5cf650", opacity: aiBusy ? 0.5 : 1 }}>{aiBusy ? "Generating…" : "✨ Generate from program"}</button>
          <button onClick={() => setCollapsed(c => !c)} style={{ ...ghostBtn, padding: "4px 10px" }}>{collapsed ? "▼ Expand" : "▲ Collapse"}</button>
        </div>
      </div>

      {!collapsed && (
        <div style={{ padding: 16 }}>
          {/* Project meta */}
          <SectionSub title="Project">
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 12 }}>
              <TextField label="Project name" value={brief.project_name} onChange={v => setField("project_name", v)} placeholder="e.g. Big River" />
              <TextField label="Product type" value={brief.product} onChange={v => setField("product", v)} placeholder="e.g. Powder Laundry Detergent" />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <TextField label="Point of contact (name)" value={brief.point_of_contact?.name} onChange={v => setNested("point_of_contact", "name", v)} />
              <TextField label="Point of contact (email)" type="email" value={brief.point_of_contact?.email} onChange={v => setNested("point_of_contact", "email", v)} />
            </div>
            <TextField label="Scope" value={brief.scope} onChange={v => setField("scope", v)} multiline placeholder="What you want the supplier to produce, in detail." />
            <TextField label="Background" value={brief.background} onChange={v => setField("background", v)} multiline placeholder="Why this matters and what success looks like." />
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <TextField label="Launch date" value={brief.launch_date} onChange={v => setField("launch_date", v)} placeholder="Aug-Sep 2026" />
              <ListField label="Countries of sale" value={brief.countries_of_sale} onChange={v => setField("countries_of_sale", v)} placeholder="US&#10;CA" />
              <ListField label="Future countries" value={brief.future_countries} onChange={v => setField("future_countries", v)} placeholder="UK&#10;AU" />
            </div>
            <ListField label="Distribution channels" value={brief.distribution_channels} onChange={v => setField("distribution_channels", v)} placeholder="Ecommerce&#10;Retail" />
          </SectionSub>

          {/* Claims */}
          <SectionSub title="Claims">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <ListField label="Brand claims (negative/no-X)" value={brief.brand_claims} onChange={v => setField("brand_claims", v)} placeholder="No Optical Brighteners&#10;No 1,4 dioxane&#10;No dyes" />
              <ListField label="Additional claims (positive)" value={brief.additional_claims} onChange={v => setField("additional_claims", v)} placeholder="Hypoallergenic&#10;HE compatible&#10;Septic safe" />
            </div>
          </SectionSub>

          {/* Efficacy */}
          <SectionSub title="Efficacy &amp; performance">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <TextField label="Ideal performance" value={brief.efficacy_standards?.ideal} onChange={v => setNested("efficacy_standards", "ideal", v)} placeholder="e.g. 700+ SRI" />
              <TextField label="Minimum performance" value={brief.efficacy_standards?.minimum} onChange={v => setNested("efficacy_standards", "minimum", v)} placeholder="e.g. 560 SRI" />
            </div>
            <ListField label="Must-have (ingredients, properties)" value={brief.efficacy_standards?.must_have} onChange={v => setNested("efficacy_standards", "must_have", v)} placeholder="Protease enzyme&#10;Amylase enzyme&#10;Anti-greying" />
            <TextField label="Dosages" value={brief.dosages} onChange={v => setField("dosages", v)} placeholder="e.g. 1 TBSP scoop per load" />
          </SectionSub>

          {/* Materials */}
          <SectionSub title="Raw materials">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <ListField label="Must" value={brief.raw_materials_must} onChange={v => setField("raw_materials_must", v)} placeholder="No materials from China" />
              <ListField label="Want" value={brief.raw_materials_want} onChange={v => setField("raw_materials_want", v)} placeholder="All US sourced&#10;EU/CA preferred if US not possible" />
            </div>
          </SectionSub>

          {/* Certifications */}
          <SectionSub title="Certifications">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <ListField label="Must" value={brief.certifications_must} onChange={v => setField("certifications_must", v)} placeholder="Leaping Bunny" />
              <ListField label="Want" value={brief.certifications_want} onChange={v => setField("certifications_want", v)} placeholder="USDA Certified Biobased" />
            </div>
          </SectionSub>

          {/* Packaging */}
          <SectionSub title="Packaging">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <ListField label="Preferences" value={brief.packaging_preferences} onChange={v => setField("packaging_preferences", v)} placeholder="paperboard&#10;PCR&#10;Kraft + PLA + Foil" />
              <ListField label="Required certifications" value={brief.packaging_certifications} onChange={v => setField("packaging_certifications", v)} placeholder="Industrial Compostable&#10;Store Drop Off Recyclable&#10;PCR > 90%" />
            </div>
          </SectionSub>

          {/* Regulatory */}
          <SectionSub title="Regulatory &amp; fragrance">
            <ListField label="Regulatory considerations" value={brief.regulatory_considerations} onChange={v => setField("regulatory_considerations", v)} placeholder="TSCA &amp; EU REACH&#10;FTC Made in USA rules" />
            <ListField label="Fragrance requirements (if applicable)" value={brief.fragrance_requirements} onChange={v => setField("fragrance_requirements", v)} placeholder="IFRA Conformity&#10;CA SB 258 Disclosure&#10;No Prop 65 ingredients" />
          </SectionSub>
        </div>
      )}

      {showParse && <ParseBriefModal onClose={() => setShowParse(false)} onParsed={(parsed) => { save({ ...brief, ...parsed }); setShowParse(false); }} />}
    </div>
  );
}

function SectionSub({ title, children }) {
  return (
    <div style={{ marginBottom: 16, paddingBottom: 12, borderBottom: "1px dashed " + T.border + "60" }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.4 }}>{title}</div>
      {children}
    </div>
  );
}

// ─── Parse Brief Modal ────────────────────────────────────────────────────────
function ParseBriefModal({ onClose, onParsed }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState(null);

  const parse = async () => {
    if (text.length < 50) { setErr("Paste at least 50 characters from the brief"); return; }
    setBusy(true); setErr(null);
    try {
      const { data, error } = await supabase.functions.invoke("plm-rfp-assist", { body: { action: "parse_brief", text } });
      if (error) throw error;
      if (!data?.brief) throw new Error("No brief returned");
      onParsed(data.brief);
    } catch (e) {
      setErr(e.message || String(e));
      setBusy(false);
    }
  };

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: T.surface, borderRadius: 10, padding: 24, maxWidth: 720, width: "100%", maxHeight: "90vh", overflow: "auto", border: "1px solid " + T.border }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 6 }}>📄 Paste &amp; parse a brief</div>
        <div style={{ fontSize: 12, color: T.text3, marginBottom: 14, lineHeight: 1.5 }}>
          Copy the text of any product development brief (PDF, Google Doc, email) and paste below.
          The AI will extract the structured fields. Existing brief fields will be merged with the parsed result.
        </div>
        <textarea value={text} onChange={e => setText(e.target.value)} rows={16}
          placeholder="Paste the full brief text here..."
          style={{ ...textareaStyle, fontFamily: "ui-monospace, SFMono-Regular, monospace", fontSize: 12 }} />
        {err && <div style={{ color: "#ef4444", fontSize: 12, marginTop: 8 }}>{err}</div>}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
          <div style={{ fontSize: 11, color: T.text3 }}>{text.length.toLocaleString()} chars</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={onClose} style={ghostBtn}>Cancel</button>
            <button onClick={parse} disabled={busy || text.length < 50} style={{ ...primaryBtn, background: "#8b5cf6", opacity: (busy || text.length < 50) ? 0.5 : 1 }}>{busy ? "Parsing…" : "✨ Parse with AI"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
