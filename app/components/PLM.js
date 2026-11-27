"use client";
import { HELM_API_BASE } from "../lib/backend";
import { useState, useEffect, useRef, lazy, Suspense } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";
import { PLM_CSS, PLM_HOME_CSS } from "./work/plmStyles";
import { themeVars } from "./work/theme";
import { useTheme } from "../lib/theme";
import { ModeProvider, Icon, Chip, Seg, Modal, Progress } from "./work/ui";
import { ProgramList, Runway, LaunchDashboard, todayStr, fmtDay, dayDiff, isLate } from "./PLMHome";
import { useResponsive } from "../lib/responsive";
import { useAuth } from "../lib/auth";
import PLMLibraryView from "./PLMLibrary";
import { renderMarkdown } from "./plmMarkdown";
import { askAdvisor } from "../lib/rdAdvisor";
const PrintBatchRecord = lazy(() => import("./PrintBatchRecord"));
const PLMSourcingTab  = lazy(() => import("./PLMSourcingTab"));
const PrintFormulaSheet = lazy(() => import("./PrintFormulaSheet"));
const PrintAIChat = lazy(() => import("./PrintAIChat"));

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const STAGES = [
  { key: "ideation",     label: "Ideation",     color: "#8b5cf6", desc: "Capturing new product ideas from market trends, customer feedback, internal brainstorms, and competitive analysis. Open exploration - no commitment yet, just building the idea backlog." },
  { key: "concept",      label: "Concept",      color: "#6366f1", desc: "Defining the product opportunity. Formalizing the idea into a product brief with target consumer, positioning, high-level requirements, and initial business case. Answering: 'Should we pursue this?'" },
  { key: "feasibility",  label: "Feasibility",  color: "#3b82f6", desc: "Evaluating technical and commercial viability. Preliminary formulations, rough cost estimates, initial supplier research, and regulatory screening. Answering: 'Can we make this within our constraints?'" },
  { key: "development",  label: "Development",  color: "#0ea5e9", desc: "Active formulation and product development. Lab-scale work, iterative testing, packaging development, and initial stability studies. Building and refining the actual product." },
  { key: "optimization", label: "Optimization", color: "#06b6d4", desc: "Refining for manufacturing. Scaling from lab to pilot to production, optimizing formula for cost/performance/manufacturability, manufacturing trials, finalizing packaging, completing stability studies, and substantiating claims." },
  { key: "validation",   label: "Validation",   color: "#10b981", desc: "Final confirmation before launch. Production-scale validation runs, final quality testing, regulatory compliance sign-off, claims substantiation complete, packaging artwork approved, supply chain readiness confirmed." },
  { key: "scale_up",     label: "Scale-Up",     color: "#84cc16", desc: "Transitioning from validated product to full production volume. Setting up production lines, qualifying contract manufacturers, establishing quality control procedures, and building initial inventory for launch." },
  { key: "regulatory",   label: "Regulatory",   color: "#eab308", desc: "Securing all regulatory approvals and compliance certifications. Filing with relevant agencies, completing labeling requirements, obtaining market-specific certifications, and ensuring full legal compliance for all target markets." },
  { key: "launch_ready", label: "Launch Ready", color: "#f97316", desc: "All gates passed - product is ready to ship. Final go/no-go review, marketing materials finalized, sales channels activated, inventory positioned, distribution confirmed. Awaiting launch date." },
  { key: "launched",     label: "Launched",     color: "#22c55e", desc: "Product is live in market. Monitoring initial sales performance, collecting customer feedback, tracking quality metrics, managing post-launch optimizations, and feeding learnings back into the pipeline." },
];
const STAGE_MAP = Object.fromEntries(STAGES.map(s => [s.key, s]));

const PRIORITY_COLORS = { critical: "#ef4444", high: "#f97316", medium: "#eab308", low: "#22c55e" };
const PRIORITY_TONE = { critical: "coral", high: "amber", medium: "blue", low: "slate" };
const STATUS_COLORS   = { pass: "#22c55e", fail: "#ef4444", pending: "#eab308", in_progress: "#3b82f6", draft: "#8b93a8", open: "#f97316", resolved: "#22c55e" };

const PROGRAM_TYPES = ["new_product","line_extension","reformulation","cost_reduction","packaging_change","claim_addition","market_expansion","renovation","private_label","co_manufacturing"];
const TARGET_MARKETS = ["AU","CA","Global","UK","US"];
const CHANNELS_LIST  = ["All Channels","DTC","Marketplace - Amazon","Marketplace - Other","Marketplace - Target.com","Marketplace - Walmart.com","Retail"];
const SOURCING_TYPES = [
  { value: "ingredient",            label: "Ingredient"            },
  { value: "packaging",             label: "Packaging"             },
  { value: "contract_manufacturer", label: "Contract Manufacturer" },
  { value: "other",                 label: "Other"                 },
];
const SOURCING_TYPE_COLORS = { ingredient:"#3b82f6", packaging:"#8b5cf6", contract_manufacturer:"#f97316", other:"#8b93a8" };
const UOM_OPTIONS = [
  'KG','g','lb','oz',
  'L','mL','gal','fl oz',
  'Units','Each','Case','Pack',
  'MT','Pallet','Drum','Tote',
];
const DOC_TYPES = ["document","link","study","lab_report","regulatory"];
const DOC_ICONS = { document:"📄", link:"🔗", study:"🔬", lab_report:"🧪", regulatory:"⚖️" };

// ─── SHARED MINI-COMPONENTS ───────────────────────────────────────────────────

function StageBadge({ stage }) {
  const s = STAGE_MAP[stage] || { label: stage, color: "#8b93a8" };
  return <span className="hw-chip" style={{ "--c": s.color, "--c-soft": s.color + "1F" }}><i />{s.label}</span>;
}
function PriorityBadge({ priority }) {
  if (!priority) return null;
  return <Chip t={PRIORITY_TONE[priority] || "slate"}>{priority.charAt(0).toUpperCase() + priority.slice(1)}</Chip>;
}
const escHtml = (v) => String(v || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
// Shared: render manufacturing instructions with markdown formatting
function FormatMfgInstructions({ text }) {
  if (!text) return null;
  return text.split("\n").map((line, i) => {
    const t = line.trim();
    if (!t) return <div key={i} style={{ height: 8 }} />;
    if (t.startsWith("###")) return <div key={i} style={{ fontSize: 12, fontWeight: 700, color: T.text, marginTop: 10, marginBottom: 4 }}>{t.replace(/^#+\s*/, "")}</div>;
    if (t.startsWith("##")) return <div key={i} style={{ fontSize: 13, fontWeight: 700, color: T.accent, marginTop: 12, marginBottom: 4, textTransform: "uppercase", letterSpacing: 0.5 }}>{t.replace(/^#+\s*/, "")}</div>;
    const numMatch = t.match(/^(\d+)\.\s+(.*)$/);
    if (numMatch) return (
      <div key={i} style={{ display: "flex", gap: 8, marginBottom: 4, padding: "4px 0" }}>
        <span style={{ minWidth: 22, height: 22, borderRadius: 11, background: T.accent + "15", color: T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0, marginTop: 1 }}>{numMatch[1]}</span>
        <span style={{ fontSize: 12, color: T.text, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: escHtml(numMatch[2]).replace(/\*\*(.*?)\*\*/g, '<strong style="color:'+T.text+'">$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>') }} />
      </div>
    );
    if (t.startsWith("- ") || t.startsWith("• ")) return (
      <div key={i} style={{ display: "flex", gap: 8, marginBottom: 2, paddingLeft: 4 }}>
        <span style={{ color: T.accent, fontWeight: 700, fontSize: 10, marginTop: 4 }}>•</span>
        <span style={{ fontSize: 12, color: T.text2, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: escHtml(t.slice(2)).replace(/\*\*(.*?)\*\*/g, '<strong style="color:'+T.text+'">$1</strong>') }} />
      </div>
    );
    return <div key={i} style={{ fontSize: 12, color: T.text2, lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: escHtml(t).replace(/\*\*(.*?)\*\*/g, '<strong style="color:'+T.text+'">$1</strong>') }} />;
  });
}

function StatusDot({ status }) {
  return <span style={{ display:"inline-block", width:8, height:8, borderRadius:"50%", background:STATUS_COLORS[status]||"#8b93a8", marginRight:5 }} />;
}
function Section({ title, children, action }) {
  return (
    <div style={{ marginBottom:24 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
        <div style={{ fontSize:13, fontWeight:650, color:T.text }}>{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}
function AddBtn({ onClick, label="Add" }) {
  return <button className="hw-btn sm" onClick={onClick}><Icon name="plus" size={13} />{label}</button>;
}
function EmptyState({ icon, text }) {
  return <div className="hw-empty" style={{ padding:"40px 0" }}><div style={{ fontSize:13 }}>{text}</div></div>;
}
function InlineField({ label, value, onChange, onBlur, type="text", placeholder, multiline, options, readOnly }) {
  const [local, setLocal] = useState(value || "");
  const [focused, setFocused] = useState(false);
  // Sync external value when not focused (e.g. parent updates after save)
  useEffect(() => { if (!focused) setLocal(value || ""); }, [value, focused]);
  const base = { width:"100%", fontSize:13, color:readOnly?T.text2:T.text, background:readOnly?T.surface3:T.surface, border:"1px solid "+T.border2, borderRadius:8, padding:"7px 10px", outline:"none", fontFamily:"inherit", boxSizing:"border-box" };
  const handleBlur = () => { setFocused(false); if (local !== (value || "")) onChange(local); if (onBlur) onBlur(); };
  return (
    <div style={{ marginBottom:12 }}>
      {label && <div style={{ fontSize:12, color:T.text2, marginBottom:5, fontWeight:550 }}>{label}</div>}
      {options ? (
        <select value={value||""} onChange={e=>onChange(e.target.value)} onBlur={onBlur} disabled={readOnly} style={{ ...base, cursor:readOnly?"default":"pointer" }}>
          <option value="">-</option>
          {options.map(o=><option key={o.value||o} value={o.value||o}>{o.label||o}</option>)}
        </select>
      ) : multiline ? (
        <textarea value={local} onChange={e=>setLocal(e.target.value)} onFocus={()=>setFocused(true)} onBlur={handleBlur} placeholder={placeholder} style={{ ...base, minHeight:72, resize:"vertical" }} readOnly={readOnly} />
      ) : (
        <input type={type} value={local} onChange={e=>setLocal(e.target.value)} onFocus={()=>setFocused(true)} onBlur={handleBlur} placeholder={placeholder} style={base} readOnly={readOnly} />
      )}
    </div>
  );
}

function MultiSelectDropdown({ label, value=[], onChange, options }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const filtered = options.filter(o => o.toLowerCase().includes(search.toLowerCase()));
  const toggle = opt => {
    if (opt === "All Channels") { onChange(["All Channels"]); return; }
    const next = value.includes(opt) ? value.filter(v => v !== opt) : [...value.filter(v => v !== "All Channels"), opt];
    onChange(next);
  };
  return (
    <div style={{ marginBottom:12, position:"relative" }} ref={ref}>
      {label && <div style={{ fontSize:11, color:T.text3, marginBottom:4, fontWeight:600 }}>{label}</div>}
      <div onClick={()=>setOpen(o=>!o)} style={{ minHeight:36, padding:"4px 10px", background:T.surface2, border:"1px solid "+(open?T.accent:T.border), borderRadius:6, cursor:"pointer", display:"flex", flexWrap:"wrap", gap:4, alignItems:"center" }}>
        {value.length===0 ? <span style={{ fontSize:13, color:T.text3 }}>Select…</span> : value.map(v=>(
          <span key={v} style={{ fontSize:11, fontWeight:600, background:T.accentDim, color:T.accent, padding:"2px 7px", borderRadius:4, display:"flex", alignItems:"center", gap:4 }}>
            {v}<span onClick={e=>{e.stopPropagation();toggle(v);}} style={{ cursor:"pointer", opacity:0.7 }}>×</span>
          </span>
        ))}
        <span style={{ marginLeft:"auto", color:T.text3, fontSize:10 }}>{open?"▲":"▼"}</span>
      </div>
      {open && (
        <div style={{ position:"absolute", zIndex:200, background:T.surface, border:"1px solid "+T.border, borderRadius:8, boxShadow:"0 8px 24px #00000060", marginTop:4, width:"100%", maxHeight:220, overflow:"hidden", display:"flex", flexDirection:"column" }}>
          <div style={{ padding:"8px 10px", borderBottom:"1px solid "+T.border }}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" style={{ width:"100%", fontSize:12, background:T.surface2, border:"1px solid "+T.border, borderRadius:5, padding:"4px 8px", color:T.text, outline:"none" }} />
          </div>
          <div style={{ overflowY:"auto", flex:1 }}>
            {filtered.map(opt=>(
              <div key={opt} onClick={()=>toggle(opt)} style={{ padding:"8px 12px", fontSize:13, cursor:"pointer", display:"flex", alignItems:"center", gap:8, background:value.includes(opt)?T.accentDim:"transparent", color:value.includes(opt)?T.accent:T.text }}>
                <span style={{ width:14, height:14, borderRadius:3, border:"1.5px solid "+(value.includes(opt)?T.accent:T.border), background:value.includes(opt)?T.accent:"transparent", display:"flex", alignItems:"center", justifyContent:"center", fontSize:9, color:"#fff", flexShrink:0 }}>{value.includes(opt)?"✓":""}</span>
                {opt}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── FORMULA ITEM ROW ─────────────────────────────────────────────────────────

const ITEM_TYPES = [
  {value:"ingredient",label:"Ingredient"},
  {value:"packaging", label:"Packaging"},
  {value:"other",     label:"Other"},
];
const FORMULA_UOM = ["g","kg","mg","lb","oz","mL","L","%","ppm","ppb","IU","CFU","units","each"];

// Ingredient name cell: shows name with a small picker icon to open library modal
function FormulaIngredientCell({ value, itemType, onPick, onChange, onBlur }) {
  const [showPicker, setShowPicker] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef(null);
  const typeColor = { ingredient:T.accent, packaging:"#8b5cf6", other:"#8b93a8" };
  const color = typeColor[itemType] || T.text3;

  // Sync draft if parent value changes (e.g. after picker sets it)
  useEffect(() => { setDraft(value); }, [value]);

  if (editing) {
    return (
      <>
        <input ref={inputRef} value={draft}
          onChange={e=>{ setDraft(e.target.value); onChange(e.target.value); }}
          onBlur={()=>{ setEditing(false); onBlur(); }}
          onKeyDown={e=>{ if(e.key==="Escape"||e.key==="Enter"){ setEditing(false); onBlur(); }}}
          style={{ width:"100%", fontSize:12, background:"transparent", border:"none", borderBottom:"1px solid "+T.accent,
            color:T.text, outline:"none", fontFamily:"inherit", padding:"1px 0" }}
          placeholder="Ingredient name…"
        />
        {showPicker && <IngredientPickerModal onPick={({name,uom,type})=>{ onPick(name,uom,type); setShowPicker(false); setEditing(false); }} onClose={()=>setShowPicker(false)} />}
      </>
    );
  }

  return (
    <>
      <div style={{ display:"flex", alignItems:"center", gap:6, cursor:"text" }}
        onClick={()=>{ setEditing(true); setTimeout(()=>inputRef.current?.focus(),20); }}>
        {value ? (
          <span style={{ fontSize:12, color:T.text, flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{value}</span>
        ) : (
          <span style={{ fontSize:12, color:T.text3, flex:1, fontStyle:"italic" }}>Click to set name…</span>
        )}
        <button
          onClick={e=>{ e.stopPropagation(); setShowPicker(true); }}
          title="Pick from library"
          style={{ background:"none", border:"none", cursor:"pointer", padding:"1px 4px", borderRadius:4,
            fontSize:11, color:T.text3, flexShrink:0, lineHeight:1,
            opacity:0.6 }}
        >📋</button>
      </div>
      {showPicker && <IngredientPickerModal onPick={({name,uom,type})=>{ onPick(name,uom,type); setShowPicker(false); }} onClose={()=>setShowPicker(false)} />}
    </>
  );
}

function FormulaItemRow({ item, onUpdate, onDelete }) {
  const { orgId } = useAuth();
  const [vals, setVals] = useState(item);
  const changed = useRef(false);
  const handleChange = (f,v) => { changed.current=true; setVals(p=>({...p,[f]:v})); };
  const handleBlur = async () => {
    if (!changed.current) return; changed.current=false;
    await supabase.from("plm_formula_items").update({
      ingredient_name:vals.ingredient_name,
      item_type:vals.item_type||"ingredient",
      quantity:parseFloat(vals.quantity)||0,
      unit:vals.unit,
      input_qty:vals.input_qty?parseFloat(vals.input_qty):null,
      input_uom:vals.input_uom||null,
      function_in_formula:vals.function_in_formula,
    }).eq("org_id", orgId).eq("id",item.id);
    onUpdate(vals);
  };
  const td={padding:"4px 6px",verticalAlign:"middle"};
  const inp={width:"100%",fontSize:12,background:"transparent",border:"none",color:T.text,outline:"none",fontFamily:"inherit"};
  const sel={width:"100%",fontSize:11,background:"transparent",border:"none",color:T.text,outline:"none",fontFamily:"inherit",cursor:"pointer"};
  const typeColor={ingredient:T.accent,packaging:"#8b5cf6",other:"#8b93a8"};
  return (
    <tr style={{ borderBottom:"1px solid "+T.border }}>
      <td style={td}>
        <FormulaIngredientCell
          value={vals.ingredient_name||""}
          itemType={vals.item_type||"ingredient"}
          onPick={async (name, uom, type) => {
            const newVals = { ...vals, ingredient_name: name, item_type: type||vals.item_type||"ingredient" };
            setVals(newVals);
            await supabase.from("plm_formula_items").update({
              ingredient_name: name,
              item_type: type||vals.item_type||"ingredient",
              input_uom: uom||vals.input_uom||null,
            }).eq("org_id", orgId).eq("id", item.id);
            onUpdate(newVals);
          }}
          onChange={v=>handleChange("ingredient_name",v)}
          onBlur={handleBlur}
        />
      </td>
      <td style={{...td,width:90}}>
        <select value={vals.item_type||"ingredient"} onChange={e=>{handleChange("item_type",e.target.value);}} onBlur={handleBlur}
          style={{...sel,color:typeColor[vals.item_type||"ingredient"],fontWeight:600}}>
          {ITEM_TYPES.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </td>
      <td style={{...td,width:70}}><input value={vals.quantity||""} onChange={e=>handleChange("quantity",e.target.value)} onBlur={handleBlur} style={{...inp,textAlign:"right"}} type="number" placeholder="0" /></td>
      <td style={{...td,width:55}}><input value={vals.unit||""} onChange={e=>handleChange("unit",e.target.value)} onBlur={handleBlur} style={inp} placeholder="%" /></td>
      <td style={{...td,width:80}}><input value={vals.input_qty||""} onChange={e=>handleChange("input_qty",e.target.value)} onBlur={handleBlur} style={{...inp,textAlign:"right"}} type="number" placeholder="0" /></td>
      <td style={{...td,width:75}}>
        <select value={vals.input_uom||""} onChange={e=>handleChange("input_uom",e.target.value)} onBlur={handleBlur} style={sel}>
          <option value="">-</option>
          {FORMULA_UOM.map(u=><option key={u} value={u}>{u}</option>)}
        </select>
      </td>
      <td style={td}><input value={vals.function_in_formula||""} onChange={e=>handleChange("function_in_formula",e.target.value)} onBlur={handleBlur} style={inp} placeholder="Function" /></td>
      <td style={{...td,width:28,textAlign:"center"}}><button onClick={onDelete} style={{ background:"none",border:"none",color:T.text3,cursor:"pointer",fontSize:12,padding:0 }}>✕</button></td>
    </tr>
  );
}

// ─── CLAIM ROW ────────────────────────────────────────────────────────────────

function ClaimRow({ claim, onUpdate, onDelete }) {
  const { orgId } = useAuth();
  const [editing, setEditing] = useState(false);
  const [vals, setVals] = useState(claim);
  const save = async () => { await supabase.from("plm_claims").update({claim_text:vals.claim_text,status:vals.status,claim_type:vals.claim_type}).eq("org_id", orgId).eq("id",claim.id); onUpdate(vals); setEditing(false); };
  const sc = STATUS_COLORS[claim.status]||"#8b93a8";
  return (
    <div style={{ padding:"10px 12px", background:T.surface2, borderRadius:8, border:"1px solid "+T.border, marginBottom:8 }}>
      {editing ? (
        <div>
          <textarea value={vals.claim_text} onChange={e=>setVals(p=>({...p,claim_text:e.target.value}))} style={{ width:"100%",fontSize:13,color:T.text,background:T.surface3,border:"1px solid "+T.border,borderRadius:6,padding:8,resize:"vertical",minHeight:60,outline:"none",fontFamily:"inherit",boxSizing:"border-box" }} />
          <div style={{ display:"flex",gap:8,marginTop:6 }}>
            <select value={vals.status||""} onChange={e=>setVals(p=>({...p,status:e.target.value}))} style={{ fontSize:12,background:T.surface3,border:"1px solid "+T.border,color:T.text,borderRadius:5,padding:"3px 6px" }}>
              {["proposed","researching","substantiated","partially_supported","unsupported","approved","rejected","in_legal_review","active","retired"].map(s=><option key={s} value={s}>{s.replace(/_/g," ")}</option>)}
            </select>
            <button onClick={save} style={{ fontSize:12,background:T.accent,color:"#fff",border:"none",borderRadius:5,padding:"3px 10px",cursor:"pointer" }}>Save</button>
            <button onClick={()=>setEditing(false)} style={{ fontSize:12,background:T.surface3,color:T.text2,border:"1px solid "+T.border,borderRadius:5,padding:"3px 10px",cursor:"pointer" }}>Cancel</button>
          </div>
        </div>
      ) : (
        <div style={{ display:"flex",gap:10,alignItems:"flex-start" }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13,color:T.text,lineHeight:1.5 }}>{claim.claim_text}</div>
            <div style={{ marginTop:4,fontSize:11,color:T.text3 }}><StatusDot status={claim.status} /><span style={{ color:sc,fontWeight:600 }}>{claim.status}</span>{claim.claim_type&&<span style={{ marginLeft:8 }}>{claim.claim_type}</span>}</div>
          </div>
          <button onClick={()=>setEditing(true)} style={{ background:"none",border:"none",color:T.text3,cursor:"pointer",fontSize:11,padding:"2px 6px" }}>Edit</button>
          <button onClick={onDelete} style={{ background:"none",border:"none",color:T.text3,cursor:"pointer",fontSize:11 }}>✕</button>
        </div>
      )}
    </div>
  );
}

// ─── SOURCING ITEM CARD ───────────────────────────────────────────────────────

function VolumeTierRow({ tier, idx, onChange, onDelete, uom }) {
  const autoCalcTotal = (updates) => {
    const merged = { ...tier, ...updates };
    const qty = parseFloat(merged.min_qty) || 0;
    const price = parseFloat(merged.unit_price) || 0;
    if (qty > 0 && price > 0) updates.total_cost = (qty * price).toFixed(2);
    return updates;
  };
  const td=w=>({padding:"4px 6px",width:w,verticalAlign:"middle"});
  const inp=ex=>({width:"100%",fontSize:12,background:"transparent",border:"none",color:T.text,outline:"none",fontFamily:"inherit",...ex});
  return (
    <tr style={{ borderBottom:"1px solid "+T.border }}>
      <td style={td(90)}><input value={tier.min_qty||""} onChange={e=>{const u=autoCalcTotal({min_qty:e.target.value});Object.entries(u).forEach(([k,v])=>onChange(idx,k,v));}} style={inp({textAlign:"right"})} placeholder="Min" /></td>
      <td style={td(90)}><input value={tier.max_qty||""} onChange={e=>onChange(idx,"max_qty",e.target.value)} style={inp({textAlign:"right"})} placeholder="Max" /></td>
      <td style={{...td(80),padding:"4px 8px"}}>
        <span style={{ fontSize:11,fontWeight:600,color:T.accent,background:T.accentDim,padding:"2px 8px",borderRadius:4,whiteSpace:"nowrap" }}>{uom||"units"}</span>
      </td>
      <td style={td(90)}><input value={tier.unit_price||""} onChange={e=>{const u=autoCalcTotal({unit_price:e.target.value});Object.entries(u).forEach(([k,v])=>onChange(idx,k,v));}} style={inp({textAlign:"right"})} type="number" placeholder="0.000" /></td>
      <td style={td(90)}><input value={tier.total_cost||""} onChange={e=>onChange(idx,"total_cost",e.target.value)} style={inp({textAlign:"right"})} type="number" placeholder="0.00" /></td>
      <td style={{...td(28),textAlign:"center"}}><button onClick={()=>onDelete(idx)} style={{ background:"none",border:"none",color:T.text3,cursor:"pointer",fontSize:12 }}>✕</button></td>
    </tr>
  );
}

function SourcingItemCard({ item, onUpdate, onDelete }) {
  const [expanded, setExpanded] = useState(true); // open by default so tiers are immediately visible
  const [tiers, setTiers] = useState(item.volume_tiers||[]);
  const [vals, setVals] = useState(item);
  const color = SOURCING_TYPE_COLORS[item.sourcing_type]||"#8b93a8";

  const saveField = async (field,val) => {
    const updated={...vals,[field]:val}; setVals(updated);
    await supabase.from("plm_sourcing").update({[field]:val}).eq("id",item.id);
    onUpdate(updated);
  };
  const saveTiers = async newTiers => {
    setTiers(newTiers);
    await supabase.from("plm_sourcing").update({volume_tiers:newTiers}).eq("id",item.id);
    onUpdate({...vals,volume_tiers:newTiers});
  };
  const changeTier=(idx,field,val)=>saveTiers(tiers.map((t,i)=>i===idx?{...t,[field]:val}:t));

  return (
    <div style={{ background:T.surface2,border:"1px solid "+T.border,borderRadius:8,marginBottom:10,overflow:"hidden" }}>
      <div style={{ padding:"10px 14px",display:"flex",alignItems:"center",gap:10,cursor:"pointer" }} onClick={()=>setExpanded(e=>!e)}>
        <span style={{ fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:4,background:color+"22",color,letterSpacing:0.3,flexShrink:0 }}>{item.sourcing_type.replace(/_/g," ").toUpperCase()}</span>
        <div style={{ fontSize:13,fontWeight:600,color:T.text,flex:1 }}>{item.name}</div>
        {item.supplier_name&&<div style={{ fontSize:12,color:T.text3 }}>{item.supplier_name}</div>}
        {item.moq_unit&&<div style={{ fontSize:11,fontWeight:600,background:T.surface3,color:T.text3,padding:"1px 7px",borderRadius:4 }}>{item.moq_unit}</div>}
        {tiers.length>0&&<div style={{ fontSize:11,color:T.accent }}>{tiers.length} tier{tiers.length!==1?"s":""}</div>}
        <span style={{ color:T.text3,fontSize:11 }}>{expanded?"▲":"▼"}</span>
        <button onClick={e=>{e.stopPropagation();if(confirm("Delete this sourcing item?"))onDelete(item.id);}} style={{ background:"none",border:"none",color:T.text3,cursor:"pointer",fontSize:12,padding:0 }}>✕</button>
      </div>
      {expanded&&(
        <div style={{ borderTop:"1px solid "+T.border,padding:"14px" }}>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:8 }}>
            <InlineField label="Name" value={vals.name} onChange={v=>setVals(p=>({...p,name:v}))} onBlur={()=>saveField("name",vals.name)} />
            <InlineField label="Type" value={vals.sourcing_type} onChange={v=>saveField("sourcing_type",v)} options={SOURCING_TYPES} />
            <div>
              <div style={{ fontSize:11,color:T.text3,marginBottom:4,fontWeight:600 }}>Supplier Name</div>
              <SupplierPicker ingredientName={vals.name} value={vals.supplier_name}
                onChange={v=>{ setVals(p=>({...p,supplier_name:v})); saveField("supplier_name",v); }}
                onBlur={()=>saveField("supplier_name",vals.supplier_name)} />
            </div>
            <InlineField label="Supplier Contact" value={vals.supplier_contact} onChange={v=>setVals(p=>({...p,supplier_contact:v}))} onBlur={()=>saveField("supplier_contact",vals.supplier_contact)} />
            <InlineField label="Supplier URL" value={vals.supplier_url} onChange={v=>setVals(p=>({...p,supplier_url:v}))} onBlur={()=>saveField("supplier_url",vals.supplier_url)} placeholder="https://…" />
            <InlineField label="Status" value={vals.status} onChange={v=>saveField("status",v)} options={["evaluating","approved","preferred","backup","disqualified"].map(s=>({value:s,label:s}))} />
            <InlineField label="Lead Time (days)" value={vals.lead_time_days} onChange={v=>setVals(p=>({...p,lead_time_days:v}))} onBlur={()=>saveField("lead_time_days",vals.lead_time_days)} type="number" />
            <InlineField label={"MOQ"} value={vals.moq} onChange={v=>setVals(p=>({...p,moq:v}))} onBlur={()=>saveField("moq",vals.moq)} type="number" />
          </div>
          <InlineField label="Unit of Measure (UOM)" value={vals.moq_unit||""} onChange={v=>saveField("moq_unit",v)} options={UOM_OPTIONS.map(u=>({value:u,label:u}))} />
          <InlineField label="Notes" value={vals.notes} onChange={v=>setVals(p=>({...p,notes:v}))} onBlur={()=>saveField("notes",vals.notes)} multiline placeholder="Sourcing notes…" />
          <div style={{ marginTop:4 }}>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8 }}>
              <div style={{ fontSize:11,fontWeight:700,color:T.text3,textTransform:"uppercase",letterSpacing:1 }}>Purchase Volume Tiers</div>
              <AddBtn onClick={()=>saveTiers([...tiers,{min_qty:"",max_qty:"",unit:"units",unit_price:"",total_cost:""}])} label="Add Tier" />
            </div>
            {tiers.length===0 ? <div style={{ fontSize:12,color:T.text3,fontStyle:"italic" }}>No tiers yet - add tiers to enable GM% scenario modeling</div> : (
              <table style={{ width:"100%",borderCollapse:"collapse" }}>
                <thead><tr style={{ borderBottom:"1px solid "+T.border }}>{["Min Qty","Max Qty","UOM","Unit Price ($)","Total Cost ($)",""].map(h=><th key={h} style={{ padding:"4px 6px",textAlign:"left",fontSize:10,fontWeight:700,color:T.text3,textTransform:"uppercase" }}>{h}</th>)}</tr></thead>
                <tbody>{tiers.map((tier,idx)=><VolumeTierRow key={idx} tier={tier} idx={idx} onChange={changeTier} onDelete={i=>saveTiers(tiers.filter((_,ti)=>ti!==i))} uom={vals.moq_unit} />)}</tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TAB: OVERVIEW ────────────────────────────────────────────────────────────

// AI gate reviews on the program Overview: stage readiness (the "to leave this
// stage" checklist) and a claims review. Runs on the R&D Advisor; the last result
// is kept in this browser.
const SEV_TONE = { critical: "coral", major: "amber", minor: "slate" };
const CHECK_TONE = { complete: "green", in_progress: "blue", not_started: "slate" };
const RATE_TONE = { high: "green", strong: "green", medium: "amber", moderate: "amber", low: "coral", weak: "coral", none: "coral" };
const RISK_TONE = { high: "coral", medium: "amber", low: "green" };
function GateReviewPanel({ program }) {
  const key = (t) => `plm.review.${t}.${program.id}`;
  const load = (t) => { try { return JSON.parse(localStorage.getItem(key(t)) || "null"); } catch { return null; } };
  const [stage, setStage] = useState(() => load("stage_readiness"));
  const [claims, setClaims] = useState(() => load("claims_review"));
  const [busy, setBusy] = useState(null); const [err, setErr] = useState(null);
  const [showAll, setShowAll] = useState(false); const [showClaims, setShowClaims] = useState(false);
  useEffect(() => { setStage(load("stage_readiness")); setClaims(load("claims_review")); setErr(null); }, [program.id]);
  const run = async (type) => {
    setBusy(type); setErr(null);
    const r = await askAdvisor({ action: "review", review_type: type, program_id: program.id });
    setBusy(null);
    if (!r.success) { setErr(r.error || "The review didn't finish. Try again."); return; }
    const v = { ...r.result, generated_at: r.generated_at, stage_at_review: program.current_stage, sources: r.sources || [] };
    try { localStorage.setItem(key(type), JSON.stringify(v)); } catch {}
    if (type === "stage_readiness") setStage(v); else { setClaims(v); setShowClaims(true); }
  };
  const ago = (d) => { if (!d) return ""; const m = Math.round((Date.now() - new Date(d)) / 60000); return m < 1 ? "just now" : m < 60 ? m + " min ago" : m < 1440 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " d ago"; };
  const stale = stage && stage.stage_at_review && stage.stage_at_review !== program.current_stage;
  const list = stage?.checklist || []; const shown = showAll ? list : list.slice(0, 8);
  const score = Math.max(0, Math.min(100, Math.round(Number(stage?.readiness_score) || 0)));
  return (
    <div className="plm-panel">
      <div className="plm-h4" style={{ flexWrap: "wrap", gap: 8 }}>
        <span style={{ flex: 1, minWidth: 160 }}>Gate readiness</span>
        <button className="hw-btn sm" disabled={!!busy} onClick={() => run("claims_review")}><Icon name="stamp" size={14} />{busy === "claims_review" ? "Reviewing claims…" : claims ? "Claims review" : "Review claims"}</button>
        <button className="hw-btn sm primary" disabled={!!busy} onClick={() => run("stage_readiness")}><Icon name="check" size={14} />{busy === "stage_readiness" ? "Checking…" : stage ? "Check again" : "Check readiness"}</button>
      </div>
      {busy && <div style={{ color: T.text3, fontSize: 12.5, marginBottom: 8 }}>Reading formulas, test results, claims, issues and sourcing{busy === "claims_review" ? ", and checking the rules that apply" : ""}. This takes about a minute.</div>}
      {err && <div style={{ color: T.red, fontSize: 12.5, marginBottom: 8 }}>{err}</div>}
      {claims && !busy && <button className="hw-btn ghost sm" style={{ marginBottom: 8 }} onClick={() => setShowClaims(true)}>Claims review from {ago(claims.generated_at)}: {(claims.claim_reviews || []).length} claims</button>}
      {!stage ? (!busy && <div style={{ color: T.text3, lineHeight: 1.5 }}>Ask the R&D Advisor what stands between {STAGE_MAP[program.current_stage]?.label || "this stage"} and the next gate. It reads the program's own data and gives a checklist with evidence.</div>)
      : <>
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 10 }}>
          <div className="plm-big" style={{ fontSize: 30, color: score >= 75 ? T.green : score >= 45 ? T.yellow : T.red }}>{score}<span style={{ fontSize: 14, color: T.text3, fontWeight: 600 }}>/100</span></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>Ready to move from {stage.current_stage} to {stage.next_stage}?</div>
            <div style={{ fontSize: 12, color: stale ? T.red : T.text3 }}>Checked {ago(stage.generated_at)}{stale ? ". The stage has changed since, so check again." : ""}</div>
          </div>
        </div>
        {stage.summary && <div style={{ lineHeight: 1.55, color: T.text2, marginBottom: 10 }}>{stage.summary}</div>}
        {(stage.blockers || []).length > 0 && <>
          <div className="hw-eyebrow" style={{ margin: "6px 0" }}>Blockers</div>
          {stage.blockers.map((b, i) => <div key={i} className="plm-li" style={{ cursor: "default", alignItems: "flex-start", minHeight: 0, padding: "8px 4px" }}>
            <Chip t={SEV_TONE[b.severity] || "slate"}>{b.severity}</Chip>
            <span className="t" style={{ whiteSpace: "normal" }}><b style={{ fontWeight: 600 }}>{b.item}</b>{b.why && <div style={{ fontSize: 12.5, color: T.text3, marginTop: 2 }}>{b.why}</div>}{b.next_action && <div style={{ fontSize: 12.5, color: T.text2, marginTop: 2 }}>Next: {b.next_action}</div>}</span>
          </div>)}
        </>}
        {list.length > 0 && <>
          <div className="hw-eyebrow" style={{ margin: "12px 0 6px" }}>Checklist to leave this stage</div>
          {shown.map((c, i) => <div key={i} className="plm-li" style={{ cursor: "default", alignItems: "flex-start", minHeight: 0, padding: "7px 4px" }}>
            <Chip t={CHECK_TONE[c.status] || "slate"}>{(c.status || "").replace("_", " ")}</Chip>
            <span className="t" style={{ whiteSpace: "normal" }}>{c.item}{c.required === false && <span style={{ color: T.text3 }}> (optional)</span>}{c.evidence && <div style={{ fontSize: 12, color: T.text3, marginTop: 2 }}>{c.evidence}</div>}</span>
          </div>)}
          {list.length > 8 && <button className="hw-btn ghost sm" onClick={() => setShowAll((v) => !v)}>{showAll ? "Show fewer" : `Show all ${list.length}`}</button>}
        </>}
      </>}
      {showClaims && claims && <Modal title="Claims review" onClose={() => setShowClaims(false)} width={820} footer={<><span style={{ flex: 1, fontSize: 12, color: T.text3 }}>Generated {ago(claims.generated_at)}. A screening aid, not legal advice.</span><button className="hw-btn primary" onClick={() => setShowClaims(false)}>Done</button></>}>
        {claims.overall_assessment && <div style={{ lineHeight: 1.6, marginBottom: 14 }}>{claims.overall_assessment}</div>}
        <div style={{ overflowX: "auto" }}><table className="plm-table" style={{ width: "100%" }}><thead><tr><th style={{ textAlign: "left" }}>Claim</th><th>Feasibility</th><th>Evidence</th><th>Regulatory risk</th><th style={{ textAlign: "left" }}>Gaps and what to do</th></tr></thead>
          <tbody>{(claims.claim_reviews || []).map((c, i) => <tr key={i}>
            <td style={{ fontWeight: 600, minWidth: 160 }}>{c.claim}{(c.conflicting_ingredients || []).length > 0 && <div style={{ fontWeight: 400, fontSize: 12, color: T.red, marginTop: 3 }}>Conflicts: {c.conflicting_ingredients.join(", ")}</div>}</td>
            <td style={{ textAlign: "center" }}><Chip t={RATE_TONE[c.feasibility] || "slate"}>{c.feasibility}</Chip></td>
            <td style={{ textAlign: "center" }}><Chip t={RATE_TONE[c.evidence_strength] || "slate"}>{c.evidence_strength}</Chip></td>
            <td style={{ textAlign: "center" }}><Chip t={RISK_TONE[c.regulatory_risk] || "slate"}>{c.regulatory_risk}</Chip></td>
            <td style={{ fontSize: 12.5, minWidth: 240 }}>{(c.gaps || []).map((g, j) => <div key={"g" + j}>• {g}</div>)}{(c.recommendations || []).map((g, j) => <div key={"r" + j} style={{ color: T.text2 }}>→ {g}</div>)}</td>
          </tr>)}</tbody></table></div>
        {(claims.ingredient_flags || []).length > 0 && <><div className="hw-eyebrow" style={{ margin: "16px 0 6px" }}>Ingredient flags</div>
          {claims.ingredient_flags.map((f, i) => <div key={i} style={{ fontSize: 13, lineHeight: 1.5, marginBottom: 6 }}><b>{f.ingredient}</b>{(f.markets || []).length > 0 && <span style={{ color: T.text3 }}> ({f.markets.join(", ")})</span>}: {f.concern}{f.source_url && <> <a href={f.source_url} target="_blank" rel="noopener noreferrer" style={{ color: T.accent }}>Source</a></>}</div>)}</>}
        {(claims.next_steps || []).length > 0 && <><div className="hw-eyebrow" style={{ margin: "16px 0 6px" }}>Next steps</div><ol style={{ margin: 0, paddingLeft: 20, lineHeight: 1.6 }}>{claims.next_steps.map((x, i) => <li key={i}>{x}</li>)}</ol></>}
        {(claims.sources || []).length > 0 && <><div className="hw-eyebrow" style={{ margin: "16px 0 6px" }}>Sources</div>{claims.sources.map((x, i) => <div key={i} style={{ fontSize: 12.5 }}><a href={x.url} target="_blank" rel="noopener noreferrer" style={{ color: T.accent }}>{x.title || x.url}</a></div>)}</>}
      </Modal>}
    </div>
  );
}

function OverviewTab({ program, onUpdate, counts, goto, navigateToProject }) {
  const { orgId } = useAuth();
  const [editing, setEditing] = useState({});
  const [showEdit, setShowEdit] = useState(false);
  const [dateEdit, setDateEdit] = useState(false);
  const [linked, setLinked] = useState(null);
  const [issues, setIssues] = useState(null);
  const set=(f,v)=>setEditing(p=>({...p,[f]:v}));
  const fv=f=>f in editing?editing[f]:program[f];
  const saveAll=async()=>{
    if(!Object.keys(editing).length){ setShowEdit(false); return; }
    const NUMERIC_FIELDS=["target_gross_margin_pct","target_unit_price","development_budget"];
    const payload=Object.fromEntries(Object.entries(editing).map(([k,v])=>[k,NUMERIC_FIELDS.includes(k)&&v!==""?parseFloat(v):v===" "?null:v]));
    await supabase.from("plm_programs").update(payload).eq("org_id", orgId).eq("id",program.id);
    onUpdate({...program,...editing}); setEditing({}); setShowEdit(false);
  };
  const advanceStage=async k=>{ await supabase.from("plm_programs").update({current_stage:k}).eq("org_id", orgId).eq("id",program.id); onUpdate({...program,current_stage:k}); };
  const saveDate=async v=>{ const d=v||null; await supabase.from("plm_programs").update({target_launch_date:d}).eq("org_id", orgId).eq("id",program.id); onUpdate({...program,target_launch_date:d}); setDateEdit(false); };

  useEffect(()=>{
    let alive=true; setLinked(null); setIssues(null);
    (async()=>{
      const [{data:pr},{data:iss}]=await Promise.all([
        supabase.from("projects").select("id,name,color,status").eq("org_id", orgId).eq("plm_program_id",program.id).is("deleted_at",null).order("name"),
        supabase.from("plm_issues").select("id,title,severity,status,identified_date,created_at").eq("org_id", orgId).eq("program_id",program.id).order("created_at",{ascending:false}),
      ]);
      if(!alive)return;
      setIssues((iss||[]).filter(i=>i.status!=="resolved"&&i.status!=="closed"));
      const ids=(pr||[]).map(p=>p.id); let tk=[];
      if(ids.length){ const r=await supabase.from("tasks").select("id,status,due_date,project_id").in("project_id",ids).is("parent_task_id",null).is("deleted_at",null); tk=r.data||[]; }
      if(!alive)return;
      const t0=todayStr();
      setLinked((pr||[]).map(p=>{ const mine=tk.filter(t=>t.project_id===p.id); const done=mine.filter(t=>t.status==="done"||t.status==="cancelled").length; return {...p,total:mine.length,done,late:mine.filter(t=>t.status!=="done"&&t.status!=="cancelled"&&t.due_date&&String(t.due_date).slice(0,10)<t0).length}; }));
    })();
    return ()=>{alive=false;};
  },[program.id, orgId]);

  const cur=STAGES.findIndex(x=>x.key===program.current_stage);
  const late=isLate(program); const hasDate=!!program.target_launch_date; const n=hasDate?dayDiff(todayStr(),program.target_launch_date):0;
  const money=v=>v===null||v===undefined||v===""?null:"$"+Number(v).toLocaleString("en-US",{maximumFractionDigits:2});
  const dirty=Object.keys(editing).length>0;
  return (
    <div style={{ maxWidth:1240,display:"flex",flexDirection:"column",gap:16 }}>
      <div className="plm-panel" style={{ paddingBottom:14 }}>
        <div className="plm-gate">
          {STAGES.map((s,i)=>{
            const done=i<cur,active=i===cur;
            return <button key={s.key} className={active?"on":done?"done":""} style={{ "--c":s.color }} onClick={()=>{ if(!active) advanceStage(s.key); }} title={s.label+" — "+s.desc}><span className="bar" /><span className="lb">{s.label}</span></button>;
          })}
        </div>
        {cur>=0&&<div style={{ fontSize:12.5,color:T.text2,marginTop:12,lineHeight:1.5,maxWidth:860 }}><b style={{ color:T.text,fontWeight:600 }}>Stage {cur+1} of {STAGES.length}.</b> {STAGES[cur].desc}</div>}
      </div>

      <div style={{ display:"flex",gap:16,flexWrap:"wrap",alignItems:"flex-start" }}>
        <div style={{ flex:"999 1 520px",minWidth:0,display:"flex",flexDirection:"column",gap:16 }}>
          <div className="plm-panel">
            <div className="plm-h4"><span style={{ flex:1 }}>About</span><button className="hw-btn ghost sm" onClick={()=>setShowEdit(true)}>Edit</button></div>
            <div style={{ whiteSpace:"pre-wrap",lineHeight:1.55,color:program.description?T.text:T.text3 }}>{program.description||"No description yet. Say what this product is, who it is for and what done looks like."}</div>
          </div>

          <div className="plm-panel">
            <div className="plm-h4"><span style={{ flex:1 }}>Linked projects{linked&&linked.length>0&&<span style={{ color:T.text3,fontWeight:500 }}> {linked.length}</span>}</span>{goto&&<button className="hw-btn ghost sm" onClick={()=>goto("linked_work")}>See linked tasks</button>}</div>
            {linked===null?<div style={{ color:T.text3 }}>Loading…</div>
            :linked.length===0?<div style={{ color:T.text3 }}>No projects linked yet. In Projects, edit a project and set its PLM product to this program.</div>
            :linked.map(p=>{ const pct=p.total?Math.round((p.done/p.total)*100):0; return (
              <div key={p.id} className="plm-li" style={{ minHeight:46 }} onClick={()=>navigateToProject&&navigateToProject(p.id)}>
                <span style={{ width:10,height:10,borderRadius:3.5,flex:"none",background:p.color||T.accent }} />
                <span className="t"><b>{p.name}</b></span>
                <span style={{ width:140,flex:"none" }}><Progress value={pct} color="var(--green)" /></span>
                <span className="hw-num" style={{ fontSize:12.5,color:T.text2,whiteSpace:"nowrap",width:150,textAlign:"right" }}>{p.done}/{p.total} done{p.late>0&&<span className="plm-late"> · {p.late} late</span>}</span>
              </div>); })}
          </div>

          <div className="plm-panel">
            <div className="plm-h4"><span style={{ flex:1 }}>Open issues{issues&&issues.length>0&&<span style={{ color:T.text3,fontWeight:500 }}> {issues.length}</span>}</span>{goto&&<button className="hw-btn ghost sm" onClick={()=>goto("issues")}>See all</button>}</div>
            {issues===null?<div style={{ color:T.text3 }}>Loading…</div>
            :issues.length===0?<div style={{ color:T.text3 }}>No open issues.</div>
            :issues.slice(0,6).map(i=>(
              <div key={i.id} className="plm-li" onClick={()=>goto&&goto("issues")}>
                <Chip t={i.severity==="critical"||i.severity==="high"?"coral":"amber"}>{i.severity?i.severity.charAt(0).toUpperCase()+i.severity.slice(1):"Open"}</Chip>
                <span className="t"><b style={{ fontWeight:500 }}>{i.title||"Untitled issue"}</b></span>
                <span className="hw-num" style={{ fontSize:12.5,color:T.text3,whiteSpace:"nowrap" }}>{fmtDay(i.identified_date||i.created_at)}</span>
              </div>))}
          </div>

          <GateReviewPanel program={program} />
        </div>

        <div style={{ flex:"1 1 320px",maxWidth:"100%",display:"flex",flexDirection:"column",gap:16 }}>
          <div className="plm-panel">
            <div style={{ fontSize:12.5,fontWeight:550,color:T.text3 }}>Target launch</div>
            <div className="plm-big" style={{ marginTop:4,color:hasDate?T.text:T.text3 }}>{hasDate?fmtDay(program.target_launch_date):"Not set"}</div>
            {hasDate&&program.current_stage!=="launched"&&<div style={{ marginTop:4,fontWeight:650,color:late?T.red:T.text2 }}>{late?`${n} days past target`:n===0?"Today":`${-n} days to go`}</div>}
            {dateEdit
              ?<input type="date" autoFocus className="hw-input" style={{ marginTop:12 }} defaultValue={program.target_launch_date?String(program.target_launch_date).slice(0,10):""} onBlur={e=>{ const v=e.target.value; if(v!==(program.target_launch_date?String(program.target_launch_date).slice(0,10):"")) saveDate(v); else setDateEdit(false); }} onKeyDown={e=>{ if(e.key==="Enter") e.currentTarget.blur(); if(e.key==="Escape") setDateEdit(false); }} />
              :<button className="hw-btn" style={{ marginTop:12,width:"100%",justifyContent:"center" }} onClick={()=>setDateEdit(true)}>{hasDate?"Set a new date":"Set a target date"}</button>}
          </div>

          <div className="plm-panel">
            <div className="plm-h4">Targets</div>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
              <div><div className="plm-big" style={{ fontSize:24,color:program.target_gross_margin_pct?T.green:T.text3 }}>{program.target_gross_margin_pct?program.target_gross_margin_pct+"%":"—"}</div><div style={{ fontSize:12.5,color:T.text3 }}>Gross margin</div></div>
              <div><div className="plm-big" style={{ fontSize:24,color:money(program.target_unit_price)?T.text:T.text3 }}>{money(program.target_unit_price)||"—"}</div><div style={{ fontSize:12.5,color:T.text3 }}>Unit price</div></div>
            </div>
            <div style={{ marginTop:12,paddingTop:10,borderTop:"1px solid var(--line)",fontSize:13,color:T.text2,display:"flex",justifyContent:"space-between" }}><span>Development budget</span><span style={{ color:money(program.development_budget)?T.text:T.text3 }}>{money(program.development_budget)||"Not set"}</span></div>
          </div>

          <div className="plm-panel">
            <div className="plm-h4"><span style={{ flex:1 }}>Details</span><button className="hw-btn ghost sm" onClick={()=>setShowEdit(true)}>Edit</button></div>
            <div className="plm-drow"><span>Type</span><span style={{ textTransform:"capitalize" }}>{program.program_type?program.program_type.replace(/_/g," "):"—"}</span></div>
            <div className="plm-drow"><span>Brand</span><span>{program.brand||"—"}</span></div>
            <div className="plm-drow"><span>Priority</span><span><PriorityBadge priority={program.priority} /></span></div>
            <div className="plm-drow"><span>Markets</span><span>{(program.target_markets_v2||[]).join(", ")||"—"}</span></div>
            <div className="plm-drow"><span>Channels</span><span>{(program.channels_v2||[]).join(", ")||"—"}</span></div>
          </div>

          <div className="plm-panel" style={{ paddingTop:14,paddingBottom:14 }}>
            <div style={{ display:"grid",gridTemplateColumns:"repeat(3,minmax(0,1fr))",gap:"12px 10px" }}>
              {[["Formulas",counts.formulations,"formulations"],["Experiments",counts.experiments,"experiments"],["Trials",counts.trials,"trials"],["SKUs",counts.skus,"skus"],["Claims",counts.claims,"claims_sub"],["Issues",counts.issues,"issues"]].map(([label,val,key])=>(
                <button key={key} className="plm-cnt" onClick={()=>goto&&goto(key)}><b>{val??0}</b><span>{label}</span></button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {showEdit&&<Modal title="Program details" onClose={()=>{ setShowEdit(false); setEditing({}); }} width={640} footer={<><button className="hw-btn ghost" onClick={()=>{ setShowEdit(false); setEditing({}); }}>Cancel</button><button className="hw-btn primary" onClick={saveAll}>Save changes</button></>}>
        <InlineField label="Program name" value={fv("name")} onChange={v=>set("name",v)} />
        <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
          <InlineField label="Type" value={fv("program_type")} onChange={v=>set("program_type",v)} options={PROGRAM_TYPES.map(t=>({value:t,label:t.replace(/_/g," ")}))} />
          <InlineField label="Priority" value={fv("priority")} onChange={v=>set("priority",v)} options={["critical","high","medium","low"].map(p=>({value:p,label:p}))} />
          <InlineField label="Brand" value={fv("brand")} onChange={v=>set("brand",v)} />
          <InlineField label="Target launch date" value={fv("target_launch_date")} onChange={v=>set("target_launch_date",v)} type="date" />
          <InlineField label="GM% target" value={fv("target_gross_margin_pct")} onChange={v=>set("target_gross_margin_pct",v)} type="number" placeholder="e.g. 65" />
          <InlineField label="Target unit price ($)" value={fv("target_unit_price")} onChange={v=>set("target_unit_price",v)} type="number" placeholder="e.g. 29.99" />
        </div>
        <InlineField label="Development budget ($)" value={fv("development_budget")} onChange={v=>set("development_budget",v)} type="number" />
        <MultiSelectDropdown label="Target markets" value={fv("target_markets_v2")||[]} onChange={v=>set("target_markets_v2",v)} options={TARGET_MARKETS} />
        <MultiSelectDropdown label="Channels" value={fv("channels_v2")||[]} onChange={v=>set("channels_v2",v)} options={CHANNELS_LIST} />
        <InlineField label="Description" value={fv("description")} onChange={v=>set("description",v)} multiline />
      </Modal>}
    </div>
  );
}

// ─── TAB: CLAIMS & SUBSTANTIATION ─────────────────────────────────────────────

function ClaimsSubstantiationTab({ program, onUpdate }) {
  const { orgId } = useAuth();
  const [claims, setClaims]     = useState(program.desired_claims||[]);
  const [newClaim, setNewClaim] = useState("");
  const [docs, setDocs]         = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const [showDocForm, setShowDocForm] = useState(false);
  const [docForm, setDocForm]   = useState({title:"",doc_type:"document",url:"",notes:"",claim_refs:[]});
  const [saving, setSaving]     = useState(false);

  useEffect(()=>{
    supabase.from("plm_claim_documents").select("*").eq("program_id",program.id).order("created_at").then(({data})=>{setDocs(data||[]);setLoadingDocs(false);});
  },[program.id]);

  const saveClaims=async updated=>{setClaims(updated);await supabase.from("plm_programs").update({desired_claims:updated}).eq("org_id", orgId).eq("id",program.id);onUpdate({...program,desired_claims:updated});};
  const addClaim=()=>{const t=newClaim.trim();if(!t)return;saveClaims([...claims,t]);setNewClaim("");};
  const removeClaim=idx=>saveClaims(claims.filter((_,i)=>i!==idx));
  const editClaim=(idx,val)=>{const u=[...claims];u[idx]=val;setClaims(u);};

  const addDoc=async()=>{
    if(!docForm.title.trim())return; setSaving(true);
    const{data}=await supabase.from("plm_claim_documents").insert({...docForm,program_id:program.id}).select().single();
    if(data)setDocs(p=>[...p,data]);
    setDocForm({title:"",doc_type:"document",url:"",notes:"",claim_refs:[]});
    setShowDocForm(false);setSaving(false);
  };
  const deleteDoc=async id=>{await supabase.from("plm_claim_documents").delete().eq("id",id);setDocs(p=>p.filter(d=>d.id!==id));};

  return (
    <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:24 }}>
      <div>
        <Section title="Desired Claim Statements">
          <div style={{ background:T.surface2,border:"1px solid "+T.border,borderRadius:8,padding:"10px 12px",marginBottom:12 }}>
            <div style={{ fontSize:12,color:T.text3,lineHeight:1.6 }}>List every marketing or regulatory claim you intend to make. The AI advisor will cross-reference these against your formulation, ingredients, test data, and substantiation docs - flagging gaps and suggesting what evidence is needed to defend each claim.</div>
          </div>
          {claims.map((claim,idx)=>(
            <div key={idx} style={{ display:"flex",gap:8,marginBottom:8,alignItems:"flex-start" }}>
              <span style={{ marginTop:9,fontSize:12,color:T.accent,fontWeight:700,flexShrink:0 }}>#{idx+1}</span>
              <textarea value={claim} onChange={e=>editClaim(idx,e.target.value)} onBlur={()=>saveClaims(claims)} style={{ flex:1,fontSize:13,color:T.text,background:T.surface2,border:"1px solid "+T.border,borderRadius:6,padding:"6px 10px",resize:"vertical",minHeight:52,outline:"none",fontFamily:"inherit" }} />
              <button onClick={()=>removeClaim(idx)} style={{ marginTop:6,background:"none",border:"none",color:T.text3,cursor:"pointer",fontSize:14,padding:0 }}>✕</button>
            </div>
          ))}
          <div style={{ display:"flex",gap:8,marginTop:10 }}>
            <input value={newClaim} onChange={e=>setNewClaim(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addClaim()} placeholder="e.g. Clinically proven to reduce fine lines by 30%…" style={{ flex:1,fontSize:13,color:T.text,background:T.surface2,border:"1px solid "+T.border,borderRadius:6,padding:"7px 10px",outline:"none" }} />
            <button onClick={addClaim} style={{ padding:"7px 14px",fontSize:12,fontWeight:600,background:T.accentDim,color:T.accent,border:"1px solid "+T.accent+"40",borderRadius:6,cursor:"pointer" }}>Add</button>
          </div>
          {claims.length===0&&<div style={{ marginTop:8,fontSize:12,color:T.text3,fontStyle:"italic" }}>No claims yet - add your desired marketing and regulatory claims above.</div>}
        </Section>
      </div>
      <div>
        <Section title="Claims Substantiation" action={<AddBtn onClick={()=>setShowDocForm(true)} label="Add Document" />}>
          <div style={{ background:T.surface2,border:"1px solid "+T.border,borderRadius:8,padding:"10px 12px",marginBottom:12 }}>
            <div style={{ fontSize:12,color:T.text3,lineHeight:1.6 }}>Attach supporting evidence - studies, lab reports, regulatory filings, or links - that substantiate your claim statements.</div>
          </div>
          {showDocForm&&(
            <div style={{ background:T.surface2,border:"1px solid "+T.accent+"40",borderRadius:8,padding:14,marginBottom:14 }}>
              <div style={{ fontSize:12,fontWeight:700,color:T.text,marginBottom:12 }}>New Supporting Document</div>
              <InlineField label="Title *" value={docForm.title} onChange={v=>setDocForm(p=>({...p,title:v}))} placeholder="e.g. Third-party efficacy study" />
              <InlineField label="Type" value={docForm.doc_type} onChange={v=>setDocForm(p=>({...p,doc_type:v}))} options={DOC_TYPES.map(t=>({value:t,label:t.replace(/_/g," ")}))} />
              <InlineField label="URL / Link" value={docForm.url} onChange={v=>setDocForm(p=>({...p,url:v}))} placeholder="https://…" />
              <InlineField label="Notes" value={docForm.notes} onChange={v=>setDocForm(p=>({...p,notes:v}))} multiline placeholder="Summary of findings…" />
              {claims.length>0&&(
                <div style={{ marginBottom:12 }}>
                  <div style={{ fontSize:11,color:T.text3,marginBottom:6,fontWeight:600 }}>Supports Claim(s)</div>
                  <div style={{ display:"flex",flexWrap:"wrap",gap:6 }}>
                    {claims.map((c,i)=>{const ref=String(i+1),sel=docForm.claim_refs.includes(ref);return(
                      <span key={i} onClick={()=>setDocForm(p=>({...p,claim_refs:sel?p.claim_refs.filter(r=>r!==ref):[...p.claim_refs,ref]}))} style={{ fontSize:11,padding:"3px 8px",borderRadius:4,cursor:"pointer",background:sel?T.accentDim:T.surface3,color:sel?T.accent:T.text3,border:"1px solid "+(sel?T.accent+"60":T.border) }}>Claim #{i+1}</span>
                    );
                    })}
                  </div>
                </div>
              )}
              <div style={{ display:"flex",gap:8 }}>
                <button onClick={()=>setShowDocForm(false)} style={{ flex:1,padding:8,fontSize:12,background:T.surface3,color:T.text2,border:"1px solid "+T.border,borderRadius:6,cursor:"pointer" }}>Cancel</button>
                <button onClick={addDoc} disabled={saving||!docForm.title.trim()} style={{ flex:2,padding:8,fontSize:12,fontWeight:600,background:T.accent,color:"#fff",border:"none",borderRadius:6,cursor:"pointer",opacity:saving?0.6:1 }}>{saving?"Saving…":"Add Document"}</button>
              </div>
            </div>
          )}
          {loadingDocs?<div style={{ fontSize:13,color:T.text3 }}>Loading…</div>:docs.length===0?<EmptyState icon="📎" text="No substantiation documents yet" />:docs.map(doc=>(
            <div key={doc.id} style={{ padding:"10px 12px",background:T.surface2,border:"1px solid "+T.border,borderRadius:8,marginBottom:8 }}>
              <div style={{ display:"flex",gap:10,alignItems:"flex-start" }}>
                <span style={{ fontSize:18,flexShrink:0 }}>{DOC_ICONS[doc.doc_type]||"📄"}</span>
                <div style={{ flex:1,minWidth:0 }}>
                  <div style={{ fontSize:13,fontWeight:600,color:T.text }}>{doc.title}</div>
                  {doc.url&&<a href={doc.url} target="_blank" rel="noopener noreferrer" style={{ fontSize:11,color:T.accent,textDecoration:"none" }}>{doc.url.length>48?doc.url.slice(0,48)+"…":doc.url}</a>}
                  {doc.notes&&<div style={{ fontSize:12,color:T.text2,marginTop:3,lineHeight:1.5 }}>{doc.notes}</div>}
                  {doc.claim_refs?.length>0&&<div style={{ marginTop:5,display:"flex",gap:4,flexWrap:"wrap" }}>{doc.claim_refs.map(r=><span key={r} style={{ fontSize:10,fontWeight:700,background:T.accentDim,color:T.accent,padding:"1px 6px",borderRadius:3 }}>Claim #{r}</span>)}</div>}
                </div>
                <button onClick={()=>deleteDoc(doc.id)} style={{ background:"none",border:"none",color:T.text3,cursor:"pointer",fontSize:12,flexShrink:0 }}>✕</button>
              </div>
            </div>
          ))}
        </Section>
      </div>
    </div>
  );
}

// ─── TAB: SOURCING ────────────────────────────────────────────────────────────

// ── Supplier Picker: shows library suppliers for a matched ingredient, fallback to freetext
function SupplierPicker({ ingredientName, value, onChange, onBlur }) {
  const [libSuppliers, setLibSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("select"); // "select" | "custom"
  const [custom, setCustom] = useState(value || "");
  const autoSelectedRef = useRef(false); // only auto-select once, never overwrite

  useEffect(() => {
    if (!ingredientName?.trim()) { setLoading(false); return; }
    setLoading(true);
    supabase.from("plm_ingredient_library")
      .select("id,name")
      .ilike("name", ingredientName.trim())
      .limit(1)
      .then(({ data: ing }) => {
        if (!ing?.length) { setLoading(false); return; }
        supabase.from("plm_ingredient_suppliers")
          .select("id,supplier_name,is_preferred,status,plm_ingredient_pricing(min_qty,unit_price,currency,uom)")
          .eq("ingredient_id", ing[0].id)
          .order("is_preferred", { ascending: false })
          .then(({ data: sups }) => {
            setLoading(false);
            if (!sups?.length) return;
            const enriched = sups.map(s => {
              const tiers = s.plm_ingredient_pricing || [];
              const best = tiers.length ? tiers.reduce((a,b) => a.unit_price < b.unit_price ? a : b) : null;
              return { id: s.id, supplier_name: s.supplier_name, is_preferred: s.is_preferred, bestPrice: best };
            });
            setLibSuppliers(enriched);
            // Auto-select only once and only if there is genuinely no current value
            if (!autoSelectedRef.current && !value) {
              autoSelectedRef.current = true;
              const pref = enriched.find(s => s.is_preferred) || enriched[0];
              if (pref) onChange(pref.supplier_name);
            }
          });
      });
  }, [ingredientName]); // deliberately exclude `value` - we only want this to run on name change

  // If value is set but doesn't match any library supplier, show it in "custom" mode
  const isLibrarySupplier = libSuppliers.some(s => s.supplier_name === value);
  const effectiveMode = !loading && libSuppliers.length && value && !isLibrarySupplier ? "custom" : mode;

  // Keep custom input in sync when parent clears value
  useEffect(() => { if (effectiveMode === "custom") setCustom(value || ""); }, [value]);

  // Still loading library - show the current value as read-only hint with spinner
  if (loading) {
    return (
      <div style={{ display:"flex",gap:6,alignItems:"center" }}>
        <input value={value||""} readOnly
          style={{ flex:1,fontSize:13,color:T.text,background:T.surface2,border:"1px solid "+T.border,borderRadius:6,padding:"6px 10px",outline:"none",fontFamily:"inherit",opacity:0.7 }} />
        <span style={{ fontSize:11,color:T.text3 }}>⟳</span>
      </div>
    );
  }

  // No library match - plain text input
  if (!libSuppliers.length) {
    return (
      <input value={value||""} onChange={e=>onChange(e.target.value)} onBlur={onBlur}
        placeholder="Supplier name"
        style={{ width:"100%",fontSize:13,color:T.text,background:T.surface2,border:"1px solid "+T.border,borderRadius:6,padding:"6px 10px",outline:"none",fontFamily:"inherit",boxSizing:"border-box" }} />
    );
  }

  // Custom / non-library supplier
  if (effectiveMode === "custom") {
    return (
      <div style={{ display:"flex",gap:6 }}>
        <input value={custom} onChange={e=>setCustom(e.target.value)}
          onBlur={()=>{ onChange(custom); onBlur&&onBlur(); }}
          placeholder="Enter supplier name"
          style={{ flex:1,fontSize:13,color:T.text,background:T.surface2,border:"1px solid "+T.accent,borderRadius:6,padding:"6px 10px",outline:"none",fontFamily:"inherit" }} />
        <button onClick={()=>setMode("select")} title="Pick from library"
          style={{ fontSize:11,padding:"4px 8px",background:T.surface3,border:"1px solid "+T.border,borderRadius:5,cursor:"pointer",color:T.text3,whiteSpace:"nowrap" }}>
          📋 Library
        </button>
      </div>
    );
  }

  // Library dropdown
  return (
    <div style={{ display:"flex",gap:6 }}>
      <select value={value||""} onChange={e=>{ onChange(e.target.value); onBlur&&onBlur(); }}
        style={{ flex:1,fontSize:13,color:T.text,background:T.surface2,border:"1px solid "+T.border,borderRadius:6,padding:"6px 10px",outline:"none",fontFamily:"inherit",cursor:"pointer" }}>
        <option value="">- Select supplier -</option>
        {libSuppliers.map(s => (
          <option key={s.id} value={s.supplier_name}>
            {s.is_preferred?"⭐ ":""}{s.supplier_name}{s.bestPrice ? " · $"+Number(s.bestPrice.unit_price).toFixed(2)+"/"+s.bestPrice.uom : ""}
          </option>
        ))}
      </select>
      <button onClick={()=>{ setCustom(value||""); setMode("custom"); }} title="Enter a different supplier"
        style={{ fontSize:11,padding:"4px 8px",background:T.surface3,border:"1px solid "+T.border,borderRadius:5,cursor:"pointer",color:T.text3,whiteSpace:"nowrap" }}>
        ✎ Other
      </button>
    </div>
  );
}

function SourcingTab({ program }) {
  const [subTab, setSubTab] = useState("ingredients"); // ingredients | cm
  const { user, orgId } = useAuth();

  return (
    <div>
      {/* Sub-tab toggle */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid " + T.border, marginBottom: 16 }}>
        {[["ingredients", "🧪 Ingredients"], ["cm", "🏭 Contract Manufacturers"]].map(([k, l]) => (
          <button key={k} onClick={() => setSubTab(k)}
            style={{ background: "none", border: "none", cursor: "pointer", padding: "10px 16px", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap", color: subTab === k ? T.accent : T.text3, borderBottom: "2px solid " + (subTab === k ? T.accent : "transparent"), transition: "color 0.15s" }}>{l}</button>
        ))}
      </div>
      {subTab === "ingredients" && <IngredientSourcingView program={program} />}
      {subTab === "cm" && <CMSourcingView program={program} />}
    </div>
  );
}

// ─── Ingredient Sourcing with AI ──────────────────────────────────────────────
function IngredientSourcingView({ program }) {
  const { isMobile } = useResponsive();
  const { user, orgId } = useAuth();
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [selected, setSelected] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [form, setForm] = useState({ search_type: "exact", ingredient_name: "", desired_function: "", desired_outcome: "", claims_compatibility: [], restrictions: [], target_cost_per_kg: "", additional_requirements: "" });

  useEffect(() => {
    supabase.from("ingredient_sourcing_requests").select("*").eq("program_id", program.id).order("created_at", { ascending: false })
      .then(({ data }) => { setRequests(data || []); setLoading(false); });
  }, [program.id]);

  useEffect(() => {
    if (!selected) { setSuppliers([]); return; }
    supabase.from("ingredient_suppliers").select("*").eq("request_id", selected.id).order("ai_fit_score", { ascending: false })
      .then(({ data }) => setSuppliers(data || []));
  }, [selected]);

  const CLAIMS = ["EPA Safer Choice", "EU Ecolabel", "USDA BioPreferred", "Vegan", "Cruelty-Free", "Non-GMO", "Organic", "Biodegradable", "EWG Verified", "C2C Certified"];
  const RESTRICTIONS = ["No sulfates (SLS/SLES)", "No parabens", "No phosphates", "No 1,4-dioxane", "No optical brighteners", "No synthetic fragrance", "No PFAS", "No palm oil derivatives", "No formaldehyde donors", "No chlorine/bleach"];

  const createRequest = async () => {
    const payload = {
      program_id: program.id,
      search_type: form.search_type,
      ingredient_name: form.search_type === "exact" ? form.ingredient_name : null,
      desired_function: form.search_type === "function" ? form.desired_function : null,
      desired_outcome: form.search_type === "outcome" ? form.desired_outcome : null,
      claims_compatibility: form.claims_compatibility,
      restrictions: form.restrictions,
      target_cost_per_kg: form.target_cost_per_kg ? parseFloat(form.target_cost_per_kg) : null,
      additional_requirements: form.additional_requirements || null,
      status: "draft",
      created_by: user?.id || null,
    };
    const { data } = await supabase.from("ingredient_sourcing_requests").insert(payload).select().single();
    if (data) { setRequests(p => [data, ...p]); setSelected(data); setShowNew(false); setForm({ search_type: "exact", ingredient_name: "", desired_function: "", desired_outcome: "", claims_compatibility: [], restrictions: [], target_cost_per_kg: "", additional_requirements: "" }); }
  };

  const runAISearch = async (req) => {
    setSearching(true); setSearchError(null);
    try {
      // The Sourcing mode of the R&D Advisor researches on the web and only returns
      // suppliers backed by a page it found; prices and MOQs only when published.
      const data = await askAdvisor({ action: "find_ingredient_suppliers", program_id: program.id || undefined, request: req });
      if (!data.success) throw new Error(data.error || "The search didn't finish");
      const found = data.results || [];
      if (found.length > 0) {
        const rows = found.map(s => ({
          request_id: req.id, org_id: program.org_id || orgId,
          ingredient_name: s.ingredient_name || s.inci_name || "Unknown",
          inci_name: s.inci_name, trade_name: s.trade_name,
          supplier_name: s.supplier_name || "Unknown", supplier_website: s.supplier_website,
          cas_number: s.cas_number, grade: s.grade,
          origin_country: s.origin_country, certifications: s.certifications || [],
          price_per_kg: s.price_per_kg, currency: s.currency || null, moq_kg: s.moq_kg, lead_time_days: s.lead_time_days,
          claims_compatible: s.claims_compatible || [], ai_fit_score: s.ai_fit_score,
          ai_reasoning: s.ai_reasoning, source: "ai_web_search", notes: "Source: " + s.source_url,
        }));
        const { data: created } = await supabase.from("ingredient_suppliers").insert(rows).select();
        if (created) setSuppliers(created);
      } else setSearchError("No suppliers could be verified on the web for this search. Try a broader function or outcome.");
      const stamp = new Date().toISOString();
      await supabase.from("ingredient_sourcing_requests").update({ ai_suggestions: found, ai_searched_at: stamp, status: "results_ready" }).eq("id", req.id);
      setRequests(p => p.map(r => r.id === req.id ? { ...r, ai_suggestions: found, status: "results_ready", ai_searched_at: stamp } : r));
      if (selected?.id === req.id) setSelected(p => ({ ...p, ai_suggestions: found, status: "results_ready" }));
    } catch (e) { console.error("AI search error:", e); setSearchError(String(e.message || e)); }
    setSearching(false);
  };

  const deleteRequest = async (id) => {
    if (!window.confirm("Delete this sourcing request?")) return;
    await supabase.from("ingredient_suppliers").delete().eq("request_id", id);
    await supabase.from("ingredient_sourcing_requests").delete().eq("id", id);
    setRequests(p => p.filter(r => r.id !== id));
    if (selected?.id === id) setSelected(null);
  };

  const typeIcon = { exact: "🔍", function: "⚙", outcome: "🎯" };
  const typeLabel = { exact: "Exact Ingredient", function: "By Function", outcome: "By Outcome" };
  const statusColor = { draft: T.text3, searching: "#eab308", results_ready: "#22c55e", sourcing: T.accent, ordered: "#8b5cf6" };

  if (loading) return <div style={{ color: T.text3, fontSize: 13 }}>Loading…</div>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 13, color: T.text2 }}>{requests.length} ingredient search{requests.length !== 1 ? "es" : ""}</div>
        <button onClick={() => setShowNew(true)} style={{ padding: "6px 14px", fontSize: 12, fontWeight: 600, background: T.accent, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>+ New Search</button>
      </div>

      {/* New search form */}
      {showNew && (
        <div style={{ background: T.surface2, border: "1px solid " + T.accent + "40", borderRadius: 10, padding: 18, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 14 }}>What are you looking for?</div>
          
          {/* Search type toggle */}
          <div style={{ display: "flex", gap: 0, marginBottom: 14, background: T.surface, border: "1px solid " + T.border, borderRadius: 8, overflow: "hidden" }}>
            {[["exact", "🔍 Exact Ingredient"], ["function", "⚙ By Function"], ["outcome", "🎯 By Outcome"]].map(([k, l]) => (
              <button key={k} onClick={() => setForm(p => ({ ...p, search_type: k }))}
                style={{ flex: 1, padding: "10px 8px", fontSize: 12, fontWeight: 600, background: form.search_type === k ? T.accent : "transparent", color: form.search_type === k ? "#fff" : T.text3, border: "none", cursor: "pointer" }}>{l}</button>
            ))}
          </div>

          {/* Search type specific input */}
          {form.search_type === "exact" && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Ingredient Name / INCI Name</div>
              <input value={form.ingredient_name} onChange={e => setForm(p => ({ ...p, ingredient_name: e.target.value }))}
                placeholder="e.g., Sodium Lauryl Sulfate, Polyvinyl Alcohol, Citric Acid"
                style={{ width: "100%", padding: "8px 12px", fontSize: 13, background: T.surface, border: "1px solid " + T.border, borderRadius: 6, color: T.text, outline: "none", boxSizing: "border-box" }} />
            </div>
          )}
          {form.search_type === "function" && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>What function should the ingredient serve?</div>
              <input value={form.desired_function} onChange={e => setForm(p => ({ ...p, desired_function: e.target.value }))}
                placeholder="e.g., primary surfactant, film-forming polymer, chelating agent, fragrance encapsulation"
                style={{ width: "100%", padding: "8px 12px", fontSize: 13, background: T.surface, border: "1px solid " + T.border, borderRadius: 6, color: T.text, outline: "none", boxSizing: "border-box" }} />
            </div>
          )}
          {form.search_type === "outcome" && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>What outcome do you need?</div>
              <input value={form.desired_outcome} onChange={e => setForm(p => ({ ...p, desired_outcome: e.target.value }))}
                placeholder="e.g., improve sheet dissolution speed, reduce raw material cost 20%, boost cleaning efficacy on grease"
                style={{ width: "100%", padding: "8px 12px", fontSize: 13, background: T.surface, border: "1px solid " + T.border, borderRadius: 6, color: T.text, outline: "none", boxSizing: "border-box" }} />
            </div>
          )}

          {/* Claims & restrictions */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 6 }}>Must be compatible with claims:</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {CLAIMS.map(c => (
                  <button key={c} onClick={() => setForm(p => ({ ...p, claims_compatibility: p.claims_compatibility.includes(c) ? p.claims_compatibility.filter(x => x !== c) : [...p.claims_compatibility, c] }))}
                    style={{ padding: "3px 8px", fontSize: 10, fontWeight: 600, borderRadius: 12, cursor: "pointer", border: "1px solid " + (form.claims_compatibility.includes(c) ? "#22c55e" : T.border), background: form.claims_compatibility.includes(c) ? "#22c55e15" : "transparent", color: form.claims_compatibility.includes(c) ? "#22c55e" : T.text3 }}>{c}</button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 6 }}>Restrictions (avoid):</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {RESTRICTIONS.map(r => (
                  <button key={r} onClick={() => setForm(p => ({ ...p, restrictions: p.restrictions.includes(r) ? p.restrictions.filter(x => x !== r) : [...p.restrictions, r] }))}
                    style={{ padding: "3px 8px", fontSize: 10, fontWeight: 600, borderRadius: 12, cursor: "pointer", border: "1px solid " + (form.restrictions.includes(r) ? "#ef4444" : T.border), background: form.restrictions.includes(r) ? "#ef444415" : "transparent", color: form.restrictions.includes(r) ? "#ef4444" : T.text3 }}>{r}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Cost target & notes */}
          <div style={{ display: "grid", gridTemplateColumns: "150px 1fr", gap: 12, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Target Cost ($/kg)</div>
              <input type="number" value={form.target_cost_per_kg} onChange={e => setForm(p => ({ ...p, target_cost_per_kg: e.target.value }))}
                placeholder="e.g., 5.00" style={{ width: "100%", padding: "6px 10px", fontSize: 12, background: T.surface, border: "1px solid " + T.border, borderRadius: 6, color: T.text, outline: "none", boxSizing: "border-box" }} />
            </div>
            <div>
              <div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Additional Requirements</div>
              <input value={form.additional_requirements} onChange={e => setForm(p => ({ ...p, additional_requirements: e.target.value }))}
                placeholder="e.g., must be cold-water soluble, pharma grade preferred"
                style={{ width: "100%", padding: "6px 10px", fontSize: 12, background: T.surface, border: "1px solid " + T.border, borderRadius: 6, color: T.text, outline: "none", boxSizing: "border-box" }} />
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => setShowNew(false)} style={{ padding: "7px 16px", fontSize: 12, fontWeight: 600, background: T.surface, border: "1px solid " + T.border, borderRadius: 6, color: T.text3, cursor: "pointer" }}>Cancel</button>
            <button onClick={createRequest} style={{ padding: "7px 16px", fontSize: 12, fontWeight: 600, background: T.accent, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>Create & Search with AI</button>
          </div>
        </div>
      )}

      {/* Request list + detail */}
      <div className="plm-grid">
        {/* Left: request list */}
        <div style={{ borderRight: "1px solid " + T.border, paddingRight: 12 }}>
          {requests.length === 0 && <EmptyState icon="🧪" text="No ingredient searches yet" />}
          {requests.map(r => (
            <div key={r.id} onClick={() => setSelected(r)}
              style={{ padding: "10px 12px", borderRadius: 8, marginBottom: 4, cursor: "pointer", border: "1px solid " + (selected?.id === r.id ? T.accent : "transparent"), background: selected?.id === r.id ? T.accentDim : "transparent", transition: "all 0.1s" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                <span style={{ fontSize: 14 }}>{typeIcon[r.search_type]}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: T.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {r.search_type === "exact" ? r.ingredient_name : r.search_type === "function" ? r.desired_function : r.desired_outcome}
                </span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 10, color: statusColor[r.status] || T.text3, fontWeight: 600, textTransform: "uppercase" }}>{r.status?.replace("_", " ")}</span>
                {r.ai_suggestions?.length > 0 && <span style={{ fontSize: 10, color: T.text3 }}>• {r.ai_suggestions.length} results</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Right: detail */}
        <div>
          {!selected && <div style={{ padding: 20, textAlign: "center", color: T.text3, fontSize: 13 }}>Select a search to view results</div>}
          {selected && (
            <div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 16 }}>{typeIcon[selected.search_type]}</span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{typeLabel[selected.search_type]}</span>
                  </div>
                  <div style={{ fontSize: 13, color: T.text2 }}>
                    {selected.search_type === "exact" ? selected.ingredient_name : selected.search_type === "function" ? selected.desired_function : selected.desired_outcome}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button onClick={() => runAISearch(selected)} disabled={searching}
                    style={{ padding: "6px 14px", fontSize: 12, fontWeight: 600, background: T.accent, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", opacity: searching ? 0.6 : 1 }}>
                    {searching ? "Searching the web…" : "Find suppliers"}
                  </button>
                  <button onClick={() => deleteRequest(selected.id)}
                    style={{ padding: "6px 10px", fontSize: 12, background: "none", border: "1px solid #ef444440", borderRadius: 6, color: "#ef4444", cursor: "pointer" }}>✕</button>
                </div>
              </div>
              {(searching || searchError) && <div style={{ fontSize: 12, color: searchError ? "#ef4444" : T.text3, margin: "-4px 0 10px" }}>{searchError || "Researching suppliers on the web and checking each one against a source. This usually takes one to three minutes."}</div>}

              {/* Constraints summary */}
              {((selected.claims_compatibility?.length > 0) || (selected.restrictions?.length > 0)) && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
                  {(selected.claims_compatibility || []).map(c => <span key={c} style={{ padding: "2px 8px", fontSize: 10, fontWeight: 600, borderRadius: 10, background: "#22c55e15", color: "#22c55e", border: "1px solid #22c55e40" }}>✓ {c}</span>)}
                  {(selected.restrictions || []).map(r => <span key={r} style={{ padding: "2px 8px", fontSize: 10, fontWeight: 600, borderRadius: 10, background: "#ef444415", color: "#ef4444", border: "1px solid #ef444440" }}>✕ {r}</span>)}
                  {selected.target_cost_per_kg && <span style={{ padding: "2px 8px", fontSize: 10, fontWeight: 600, borderRadius: 10, background: T.surface2, color: T.text3, border: "1px solid " + T.border }}>Target: ${selected.target_cost_per_kg}/kg</span>}
                </div>
              )}

              {/* Results table */}
              {suppliers.length > 0 ? (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: T.surface2 }}>
                      <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 11, fontWeight: 600, color: T.text3, borderBottom: "1px solid " + T.border }}>Ingredient</th>
                      <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 11, fontWeight: 600, color: T.text3, borderBottom: "1px solid " + T.border }}>Supplier</th>
                      <th style={{ textAlign: "right", padding: "8px 10px", fontSize: 11, fontWeight: 600, color: T.text3, borderBottom: "1px solid " + T.border }}>$/kg</th>
                      <th style={{ textAlign: "center", padding: "8px 10px", fontSize: 11, fontWeight: 600, color: T.text3, borderBottom: "1px solid " + T.border }}>Fit</th>
                      <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 11, fontWeight: 600, color: T.text3, borderBottom: "1px solid " + T.border }}>Reasoning</th>
                    </tr>
                  </thead>
                  <tbody>
                    {suppliers.map(s => (
                      <tr key={s.id} style={{ borderBottom: "1px solid " + T.border }}>
                        <td style={{ padding: "8px 10px" }}>
                          <div style={{ fontWeight: 600, color: T.text }}>{s.ingredient_name}</div>
                          {s.inci_name && s.inci_name !== s.ingredient_name && <div style={{ fontSize: 10, color: T.text3 }}>{s.inci_name}</div>}
                          {s.cas_number && <div style={{ fontSize: 10, color: T.text3 }}>CAS: {s.cas_number}</div>}
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 2, marginTop: 3 }}>
                            {(s.certifications || []).map(c => <span key={c} style={{ fontSize: 9, padding: "1px 5px", borderRadius: 6, background: "#22c55e15", color: "#22c55e" }}>{c}</span>)}
                          </div>
                        </td>
                        <td style={{ padding: "8px 10px" }}>
                          <div style={{ fontWeight: 600, color: T.text }}>{s.supplier_name}</div>
                          {s.origin_country && <div style={{ fontSize: 10, color: T.text3 }}>📍 {s.origin_country}</div>}
                          {s.moq_kg && <div style={{ fontSize: 10, color: T.text3 }}>MOQ: {s.moq_kg}kg</div>}
                        </td>
                        <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, color: T.text, fontVariantNumeric: "tabular-nums" }}>
                          {s.price_per_kg ? "$" + Number(s.price_per_kg).toFixed(2) : "-"}
                        </td>
                        <td style={{ padding: "8px 10px", textAlign: "center" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 36, height: 20, borderRadius: 10, fontSize: 11, fontWeight: 700, background: (s.ai_fit_score >= 80 ? "#22c55e" : s.ai_fit_score >= 60 ? "#eab308" : "#ef4444") + "20", color: s.ai_fit_score >= 80 ? "#22c55e" : s.ai_fit_score >= 60 ? "#eab308" : "#ef4444" }}>
                            {s.ai_fit_score || "-"}
                          </span>
                        </td>
                        <td style={{ padding: "8px 10px", fontSize: 11, color: T.text2, maxWidth: 260, lineHeight: 1.5 }}>{s.ai_reasoning}<SupplierLinks s={s} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : selected.status === "draft" ? (
                <div style={{ padding: "24px 16px", borderRadius: 10, border: "2px dashed " + T.border, textAlign: "center" }}>
                  <div style={{ fontSize: 24, marginBottom: 6 }}>🤖</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.text3, marginBottom: 8 }}>Ready to search</div>
                  <div style={{ fontSize: 11, color: T.text3, marginBottom: 12 }}>Click "AI Search" to find ingredients and suppliers matching your criteria</div>
                </div>
              ) : (
                <div style={{ color: T.text3, fontSize: 12, padding: 16 }}>No results yet</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── CM Sourcing (imports from Sourcing.js) ───────────────────────────────────
function CMSourcingView({ program }) {
  return (
    <div style={{ padding: "16px 0" }}>
      <div style={{ fontSize: 13, color: T.text3, marginBottom: 12 }}>Contract manufacturer sourcing for <strong style={{ color: T.text }}>{program.name}</strong></div>
      <div style={{ padding: "24px 16px", borderRadius: 10, border: "2px dashed " + T.border, textAlign: "center" }}>
        <div style={{ fontSize: 24, marginBottom: 6 }}>🏭</div>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.text3, marginBottom: 4 }}>CM Sourcing</div>
        <div style={{ fontSize: 11, color: T.text3 }}>Use the dedicated Sourcing module for CM discovery, outreach, and quotes. Coming soon: embedded CM sourcing within PLM.</div>
      </div>
    </div>
  );
}

// ─── STANDALONE SOURCING VIEW (all programs) ──────────────────────────────────
function SourcingStandalone({ programs }) {
  const { isMobile } = useResponsive();
  const { user, orgId } = useAuth();
  const [subTab, setSubTab] = useState("ingredients");
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(null);
  const [form, setForm] = useState({ search_type: "exact", ingredient_name: "", desired_function: "", desired_outcome: "", claims_compatibility: [], restrictions: [], target_cost_per_kg: "", additional_requirements: "", program_id: "" });

  useEffect(() => {
    supabase.from("ingredient_sourcing_requests").select("*, plm_programs(name)").order("created_at", { ascending: false })
      .then(({ data }) => { setRequests(data || []); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!selected) { setSuppliers([]); return; }
    supabase.from("ingredient_suppliers").select("*").eq("request_id", selected.id).order("ai_fit_score", { ascending: false })
      .then(({ data }) => setSuppliers(data || []));
  }, [selected]);

  const CLAIMS = ["EPA Safer Choice", "EU Ecolabel", "USDA BioPreferred", "Vegan", "Cruelty-Free", "Non-GMO", "Organic", "Biodegradable", "EWG Verified", "C2C Certified"];
  const RESTRICTIONS = ["No sulfates (SLS/SLES)", "No parabens", "No phosphates", "No 1,4-dioxane", "No optical brighteners", "No synthetic fragrance", "No PFAS", "No palm oil derivatives", "No formaldehyde donors", "No chlorine/bleach"];

  const createRequest = async () => {
    const payload = {
      program_id: form.program_id || null,
      search_type: form.search_type,
      ingredient_name: form.search_type === "exact" ? form.ingredient_name : null,
      desired_function: form.search_type === "function" ? form.desired_function : null,
      desired_outcome: form.search_type === "outcome" ? form.desired_outcome : null,
      claims_compatibility: form.claims_compatibility,
      restrictions: form.restrictions,
      target_cost_per_kg: form.target_cost_per_kg ? parseFloat(form.target_cost_per_kg) : null,
      additional_requirements: form.additional_requirements || null,
      status: "draft", created_by: user?.id || null,
    };
    const { data } = await supabase.from("ingredient_sourcing_requests").insert(payload).select("*, plm_programs(name)").single();
    if (data) { setRequests(p => [data, ...p]); setSelected(data); setShowNew(false); }
  };

  const runAISearch = async (req) => {
    setSearching(true); setSearchError(null);
    try {
      // The Sourcing mode of the R&D Advisor researches on the web and only returns
      // suppliers backed by a page it found; prices and MOQs only when published.
      const data = await askAdvisor({ action: "find_ingredient_suppliers", program_id: req.program_id || undefined, request: req });
      if (!data.success) throw new Error(data.error || "The search didn't finish");
      const found = data.results || [];
      if (found.length > 0) {
        const rows = found.map(s => ({
          request_id: req.id, org_id: orgId,
          ingredient_name: s.ingredient_name || s.inci_name || "Unknown",
          inci_name: s.inci_name, trade_name: s.trade_name,
          supplier_name: s.supplier_name || "Unknown", supplier_website: s.supplier_website,
          cas_number: s.cas_number, grade: s.grade,
          origin_country: s.origin_country, certifications: s.certifications || [],
          price_per_kg: s.price_per_kg, currency: s.currency || null, moq_kg: s.moq_kg, lead_time_days: s.lead_time_days,
          claims_compatible: s.claims_compatible || [], ai_fit_score: s.ai_fit_score,
          ai_reasoning: s.ai_reasoning, source: "ai_web_search", notes: "Source: " + s.source_url,
        }));
        const { data: created } = await supabase.from("ingredient_suppliers").insert(rows).select();
        if (created) setSuppliers(created);
      } else setSearchError("No suppliers could be verified on the web for this search. Try a broader function or outcome.");
      const stamp = new Date().toISOString();
      await supabase.from("ingredient_sourcing_requests").update({ ai_suggestions: found, ai_searched_at: stamp, status: "results_ready" }).eq("id", req.id);
      setRequests(p => p.map(r => r.id === req.id ? { ...r, ai_suggestions: found, status: "results_ready", ai_searched_at: stamp } : r));
      if (selected?.id === req.id) setSelected(p => ({ ...p, ai_suggestions: found, status: "results_ready" }));
    } catch (e) { console.error("AI search error:", e); setSearchError(String(e.message || e)); }
    setSearching(false);
  };

  const deleteRequest = async (id) => {
    if (!window.confirm("Delete this sourcing request?")) return;
    await supabase.from("ingredient_suppliers").delete().eq("request_id", id);
    await supabase.from("ingredient_sourcing_requests").delete().eq("id", id);
    setRequests(p => p.filter(r => r.id !== id));
    if (selected?.id === id) setSelected(null);
  };

  const typeIcon = { exact: "🔍", function: "⚙", outcome: "🎯" };
  const statusColor = { draft: T.text3, searching: "#eab308", results_ready: "#22c55e", sourcing: T.accent };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: T.text }}>Ingredient Sourcing</div>
          <div style={{ fontSize: 12, color: T.text3 }}>Find ingredients by name, function, or desired outcome - AI suggests options considering claims and restrictions</div>
        </div>
        <button onClick={() => setShowNew(true)} style={{ padding: "8px 18px", fontSize: 12, fontWeight: 600, background: T.accent, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}>+ New Search</button>
      </div>

      {/* New search form */}
      {showNew && (
        <div style={{ background: T.surface2, border: "1px solid " + T.accent + "40", borderRadius: 10, padding: 18, marginBottom: 16 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 14 }}>What are you looking for?</div>

          {/* Program selector */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Link to Product (optional)</div>
            <select value={form.program_id} onChange={e => setForm(p => ({ ...p, program_id: e.target.value }))}
              style={{ padding: "6px 10px", fontSize: 12, background: T.surface, border: "1px solid " + T.border, borderRadius: 6, color: T.text, cursor: "pointer", minWidth: 200 }}>
              <option value="">No product linked</option>
              {programs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>

          {/* Search type toggle */}
          <div style={{ display: "flex", gap: 0, marginBottom: 14, background: T.surface, border: "1px solid " + T.border, borderRadius: 8, overflow: "hidden" }}>
            {[["exact", "🔍 Exact Ingredient"], ["function", "⚙ By Function"], ["outcome", "🎯 By Outcome"]].map(([k, l]) => (
              <button key={k} onClick={() => setForm(p => ({ ...p, search_type: k }))}
                style={{ flex: 1, padding: "10px 8px", fontSize: 12, fontWeight: 600, background: form.search_type === k ? T.accent : "transparent", color: form.search_type === k ? "#fff" : T.text3, border: "none", cursor: "pointer" }}>{l}</button>
            ))}
          </div>

          {form.search_type === "exact" && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>Ingredient Name / INCI</div>
              <input value={form.ingredient_name} onChange={e => setForm(p => ({ ...p, ingredient_name: e.target.value }))}
                placeholder="e.g., Sodium Lauryl Sulfate, Polyvinyl Alcohol, Citric Acid"
                style={{ width: "100%", padding: "8px 12px", fontSize: 13, background: T.surface, border: "1px solid " + T.border, borderRadius: 6, color: T.text, outline: "none", boxSizing: "border-box" }} />
            </div>
          )}
          {form.search_type === "function" && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>What function should the ingredient serve?</div>
              <input value={form.desired_function} onChange={e => setForm(p => ({ ...p, desired_function: e.target.value }))}
                placeholder="e.g., primary surfactant, film-forming polymer, chelating agent"
                style={{ width: "100%", padding: "8px 12px", fontSize: 13, background: T.surface, border: "1px solid " + T.border, borderRadius: 6, color: T.text, outline: "none", boxSizing: "border-box" }} />
            </div>
          )}
          {form.search_type === "outcome" && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 4 }}>What outcome do you need?</div>
              <input value={form.desired_outcome} onChange={e => setForm(p => ({ ...p, desired_outcome: e.target.value }))}
                placeholder="e.g., improve sheet dissolution speed, reduce raw material cost 20%"
                style={{ width: "100%", padding: "8px 12px", fontSize: 13, background: T.surface, border: "1px solid " + T.border, borderRadius: 6, color: T.text, outline: "none", boxSizing: "border-box" }} />
            </div>
          )}

          {/* Claims & restrictions - compact */}
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: 14, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 6 }}>Must be compatible with:</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {CLAIMS.map(c => <button key={c} onClick={() => setForm(p => ({ ...p, claims_compatibility: p.claims_compatibility.includes(c) ? p.claims_compatibility.filter(x => x !== c) : [...p.claims_compatibility, c] }))} style={{ padding: "3px 8px", fontSize: 10, fontWeight: 600, borderRadius: 12, cursor: "pointer", border: "1px solid " + (form.claims_compatibility.includes(c) ? "#22c55e" : T.border), background: form.claims_compatibility.includes(c) ? "#22c55e15" : "transparent", color: form.claims_compatibility.includes(c) ? "#22c55e" : T.text3 }}>{c}</button>)}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: T.text3, fontWeight: 600, marginBottom: 6 }}>Restrictions (avoid):</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {RESTRICTIONS.map(r => <button key={r} onClick={() => setForm(p => ({ ...p, restrictions: p.restrictions.includes(r) ? p.restrictions.filter(x => x !== r) : [...p.restrictions, r] }))} style={{ padding: "3px 8px", fontSize: 10, fontWeight: 600, borderRadius: 12, cursor: "pointer", border: "1px solid " + (form.restrictions.includes(r) ? "#ef4444" : T.border), background: form.restrictions.includes(r) ? "#ef444415" : "transparent", color: form.restrictions.includes(r) ? "#ef4444" : T.text3 }}>{r}</button>)}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button onClick={() => setShowNew(false)} style={{ padding: "7px 16px", fontSize: 12, fontWeight: 600, background: T.surface, border: "1px solid " + T.border, borderRadius: 6, color: T.text3, cursor: "pointer" }}>Cancel</button>
            <button onClick={async () => { await createRequest(); }} style={{ padding: "7px 16px", fontSize: 12, fontWeight: 600, background: T.accent, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>Create Search</button>
          </div>
        </div>
      )}

      {/* Request list + detail grid */}
      {loading ? <div style={{ color: T.text3, fontSize: 13 }}>Loading…</div> : (
        <div className="plm-grid">
          {/* Left: request list */}
          <div style={{ borderRight: "1px solid " + T.border, paddingRight: 12 }}>
            {requests.length === 0 && <EmptyState icon="🧪" text="No ingredient searches yet - click + New Search" />}
            {requests.map(r => (
              <div key={r.id} onClick={() => setSelected(r)}
                style={{ padding: "10px 12px", borderRadius: 8, marginBottom: 4, cursor: "pointer", border: "1px solid " + (selected?.id === r.id ? T.accent : "transparent"), background: selected?.id === r.id ? T.accentDim : "transparent" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 2 }}>
                  <span>{typeIcon[r.search_type]}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {r.search_type === "exact" ? r.ingredient_name : r.search_type === "function" ? r.desired_function : r.desired_outcome}
                  </span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 10, color: statusColor[r.status] || T.text3, fontWeight: 600, textTransform: "uppercase" }}>{r.status?.replace("_", " ")}</span>
                  {r.plm_programs?.name && <span style={{ fontSize: 10, color: T.text3 }}>• ⬢ {r.plm_programs.name}</span>}
                  {r.ai_suggestions?.length > 0 && <span style={{ fontSize: 10, color: T.text3 }}>• {r.ai_suggestions.length} results</span>}
                </div>
              </div>
            ))}
          </div>

          {/* Right: detail */}
          <div>
            {!selected && <div style={{ padding: 20, textAlign: "center", color: T.text3, fontSize: 13 }}>Select a search to view results</div>}
            {selected && (
              <div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>
                      {typeIcon[selected.search_type]} {selected.search_type === "exact" ? selected.ingredient_name : selected.search_type === "function" ? selected.desired_function : selected.desired_outcome}
                    </div>
                    {selected.plm_programs?.name && <div style={{ fontSize: 11, color: T.text3 }}>⬢ {selected.plm_programs.name}</div>}
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button onClick={() => runAISearch(selected)} disabled={searching}
                      style={{ padding: "6px 14px", fontSize: 12, fontWeight: 600, background: T.accent, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", opacity: searching ? 0.6 : 1 }}>
                      {searching ? "Searching the web…" : "Find suppliers"}
                    </button>
                    <button onClick={() => deleteRequest(selected.id)}
                      style={{ padding: "6px 10px", fontSize: 12, background: "none", border: "1px solid #ef444440", borderRadius: 6, color: "#ef4444", cursor: "pointer" }}>✕</button>
                  </div>
                </div>
                {(searching || searchError) && <div style={{ fontSize: 12, color: searchError ? "#ef4444" : T.text3, margin: "-4px 0 10px" }}>{searchError || "Researching suppliers on the web and checking each one against a source. This usually takes one to three minutes."}</div>}

                {/* Constraints */}
                {((selected.claims_compatibility?.length > 0) || (selected.restrictions?.length > 0)) && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 12 }}>
                    {(selected.claims_compatibility || []).map(c => <span key={c} style={{ padding: "2px 8px", fontSize: 10, fontWeight: 600, borderRadius: 10, background: "#22c55e15", color: "#22c55e", border: "1px solid #22c55e40" }}>✓ {c}</span>)}
                    {(selected.restrictions || []).map(r => <span key={r} style={{ padding: "2px 8px", fontSize: 10, fontWeight: 600, borderRadius: 10, background: "#ef444415", color: "#ef4444", border: "1px solid #ef444440" }}>✕ {r}</span>)}
                  </div>
                )}

                {/* Results */}
                {suppliers.length > 0 ? (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                    <thead><tr style={{ background: T.surface2 }}>
                      <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 11, fontWeight: 600, color: T.text3, borderBottom: "1px solid " + T.border }}>Ingredient</th>
                      <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 11, fontWeight: 600, color: T.text3, borderBottom: "1px solid " + T.border }}>Supplier</th>
                      <th style={{ textAlign: "right", padding: "8px 10px", fontSize: 11, fontWeight: 600, color: T.text3, borderBottom: "1px solid " + T.border }}>$/kg</th>
                      <th style={{ textAlign: "center", padding: "8px 10px", fontSize: 11, fontWeight: 600, color: T.text3, borderBottom: "1px solid " + T.border }}>Fit</th>
                      <th style={{ textAlign: "left", padding: "8px 10px", fontSize: 11, fontWeight: 600, color: T.text3, borderBottom: "1px solid " + T.border }}>Why</th>
                    </tr></thead>
                    <tbody>{suppliers.map(s => (
                      <tr key={s.id} style={{ borderBottom: "1px solid " + T.border }}>
                        <td style={{ padding: "8px 10px" }}>
                          <div style={{ fontWeight: 600, color: T.text }}>{s.ingredient_name}</div>
                          {s.inci_name && s.inci_name !== s.ingredient_name && <div style={{ fontSize: 10, color: T.text3 }}>{s.inci_name}</div>}
                          {s.cas_number && <div style={{ fontSize: 10, color: T.text3 }}>CAS: {s.cas_number}</div>}
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 2, marginTop: 2 }}>
                            {(s.certifications || []).map(c => <span key={c} style={{ fontSize: 9, padding: "1px 5px", borderRadius: 6, background: "#22c55e15", color: "#22c55e" }}>{c}</span>)}
                          </div>
                        </td>
                        <td style={{ padding: "8px 10px" }}>
                          <div style={{ fontWeight: 600, color: T.text }}>{s.supplier_name}</div>
                          {s.origin_country && <div style={{ fontSize: 10, color: T.text3 }}>📍 {s.origin_country}</div>}
                          {s.moq_kg && <div style={{ fontSize: 10, color: T.text3 }}>MOQ: {s.moq_kg}kg</div>}
                        </td>
                        <td style={{ padding: "8px 10px", textAlign: "right", fontWeight: 700, color: T.text }}>{s.price_per_kg ? "$" + Number(s.price_per_kg).toFixed(2) : "-"}</td>
                        <td style={{ padding: "8px 10px", textAlign: "center" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 36, height: 20, borderRadius: 10, fontSize: 11, fontWeight: 700, background: (s.ai_fit_score >= 80 ? "#22c55e" : s.ai_fit_score >= 60 ? "#eab308" : "#ef4444") + "20", color: s.ai_fit_score >= 80 ? "#22c55e" : s.ai_fit_score >= 60 ? "#eab308" : "#ef4444" }}>{s.ai_fit_score || "-"}</span>
                        </td>
                        <td style={{ padding: "8px 10px", fontSize: 11, color: T.text2, maxWidth: 260, lineHeight: 1.5 }}>{s.ai_reasoning}<SupplierLinks s={s} /></td>
                      </tr>
                    ))}</tbody>
                  </table>
                ) : selected.status === "draft" ? (
                  <div style={{ padding: "24px 16px", borderRadius: 10, border: "2px dashed " + T.border, textAlign: "center" }}>
                    <div style={{ fontSize: 24, marginBottom: 6 }}>🤖</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.text3 }}>Ready to search - click AI Search above</div>
                  </div>
                ) : <div style={{ color: T.text3, fontSize: 12 }}>No results yet</div>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TAB: GM% SCENARIOS ───────────────────────────────────────────────────────

function GMScenarioTab({ program }) {
  const [sourcingItems, setSourcingItems] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [targetGM, setTargetGM] = useState(Number(program.target_gross_margin_pct)||65);
  const [unitPrice, setUnitPrice] = useState(Number(program.target_unit_price)||30);
  const [overhead, setOverhead] = useState(15);
  const [scenarios, setScenarios] = useState([]);

  useEffect(()=>{
    supabase.from("plm_sourcing").select("*").eq("program_id",program.id).then(({data})=>{setSourcingItems(data||[]);setLoading(false);});
  },[program.id]);

  useEffect(()=>{ if(!loading)compute(); },[loading,targetGM,unitPrice,overhead,sourcingItems]);

  const compute=()=>{
    const tieredItems=sourcingItems.filter(i=>(i.volume_tiers||[]).length>0);
    if(!sourcingItems.length){setScenarios([]);return;}
    const allQtys=[...new Set(tieredItems.flatMap(i=>(i.volume_tiers||[]).map(t=>Number(t.min_qty))).filter(Boolean))].sort((a,b)=>a-b);
    const breakpoints=allQtys.length?allQtys:[1000,5000,10000,25000,50000];

    setScenarios(breakpoints.map(qty=>{
      const cogsParts=tieredItems.map(item=>{
        const applicable=(item.volume_tiers||[]).filter(t=>Number(t.min_qty)<=qty).sort((a,b)=>Number(b.min_qty)-Number(a.min_qty));
        return applicable[0]?Number(applicable[0].unit_price)||0:0;
      });
      const rawCOGS=cogsParts.reduce((s,v)=>s+v,0);
      const totalCOGS=rawCOGS*(1+overhead/100);
      const price=Number(unitPrice);
      const gmDollars=price-totalCOGS;
      const gmPct=price>0?(gmDollars/price)*100:0;
      const bepPrice=totalCOGS/(1-Number(targetGM)/100);
      return{qty,rawCOGS,totalCOGS,gmDollars,gmPct,targetMet:gmPct>=Number(targetGM),bepPrice};
    }));
  };

  const hasTiers=sourcingItems.some(i=>(i.volume_tiers||[]).length>0);
  if(loading)return <div style={{ color:T.text3,fontSize:13 }}>Loading…</div>;

  return (
    <div>
      <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:16,marginBottom:24,padding:16,background:T.surface2,borderRadius:10,border:"1px solid "+T.border }}>
        <div>
          <div style={{ fontSize:11,fontWeight:700,color:T.text3,marginBottom:6,textTransform:"uppercase",letterSpacing:1 }}>Target GM%</div>
          <div style={{ display:"flex",alignItems:"center",gap:10 }}>
            <input type="range" min={0} max={90} value={targetGM} onChange={e=>setTargetGM(Number(e.target.value))} style={{ flex:1,accentColor:T.accent }} />
            <span style={{ fontSize:18,fontWeight:700,color:T.accent,minWidth:48,textAlign:"right" }}>{targetGM}%</span>
          </div>
        </div>
        <div>
          <div style={{ fontSize:11,fontWeight:700,color:T.text3,marginBottom:6,textTransform:"uppercase",letterSpacing:1 }}>Unit Selling Price ($)</div>
          <input type="number" value={unitPrice} onChange={e=>setUnitPrice(Number(e.target.value))} style={{ width:"100%",fontSize:16,fontWeight:700,color:T.text,background:T.surface3,border:"1px solid "+T.border,borderRadius:6,padding:"6px 10px",outline:"none" }} />
        </div>
        <div>
          <div style={{ fontSize:11,fontWeight:700,color:T.text3,marginBottom:6,textTransform:"uppercase",letterSpacing:1 }}>Overhead / Conversion (%)</div>
          <input type="number" value={overhead} onChange={e=>setOverhead(Number(e.target.value))} style={{ width:"100%",fontSize:16,fontWeight:700,color:T.text,background:T.surface3,border:"1px solid "+T.border,borderRadius:6,padding:"6px 10px",outline:"none" }} />
        </div>
      </div>

      {!hasTiers?(
        <div style={{ padding:"32px 24px",textAlign:"center",background:T.surface2,border:"1px solid "+T.border,borderRadius:10 }}>
          <div style={{ fontSize:32,marginBottom:12 }}>📊</div>
          <div style={{ fontSize:15,fontWeight:600,color:T.text,marginBottom:8 }}>Add Volume Tiers to Run Scenarios</div>
          <div style={{ fontSize:13,color:T.text3,maxWidth:420,margin:"0 auto" }}>Go to the Sourcing tab and add purchase volume tiers to your ingredients, packaging, and contract manufacturer. The scenario engine will then model GM% across volume breakpoints.</div>
        </div>
      ):(
        <>
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%",borderCollapse:"collapse" }}>
              <thead>
                <tr style={{ borderBottom:"2px solid "+T.border }}>
                  {["Volume (units)","Raw COGS/unit","Total COGS/unit","Selling Price","GM $","GM %","Hits Target?","Min Price for Target"].map(h=>(
                    <th key={h} style={{ padding:"8px 12px",textAlign:"left",fontSize:10,fontWeight:700,color:T.text3,textTransform:"uppercase",whiteSpace:"nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scenarios.map((s,i)=>(
                  <tr key={i} style={{ borderBottom:"1px solid "+T.border, background:s.targetMet?"#22c55e08":i%2===0?"transparent":T.surface2+"40" }}>
                    <td style={{ padding:"10px 12px",fontSize:13,fontWeight:700,color:T.text }}>{s.qty.toLocaleString()}</td>
                    <td style={{ padding:"10px 12px",fontSize:13,color:T.text2 }}>${s.rawCOGS.toFixed(3)}</td>
                    <td style={{ padding:"10px 12px",fontSize:13,color:T.text2 }}>${s.totalCOGS.toFixed(3)}</td>
                    <td style={{ padding:"10px 12px",fontSize:13,color:T.text }}>${Number(unitPrice).toFixed(2)}</td>
                    <td style={{ padding:"10px 12px",fontSize:13,fontWeight:600,color:s.gmDollars>=0?T.text:"#ef4444" }}>${s.gmDollars.toFixed(2)}</td>
                    <td style={{ padding:"10px 12px" }}>
                      <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                        <div style={{ flex:1,height:6,background:T.surface3,borderRadius:3,minWidth:60,overflow:"hidden" }}>
                          <div style={{ height:"100%",width:Math.min(100,Math.max(0,s.gmPct))+"%",background:s.targetMet?"#22c55e":s.gmPct>Number(targetGM)*0.8?"#eab308":"#ef4444",borderRadius:3 }} />
                        </div>
                        <span style={{ fontSize:13,fontWeight:700,color:s.targetMet?"#22c55e":s.gmPct>0?T.text:"#ef4444",minWidth:44,textAlign:"right" }}>{s.gmPct.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td style={{ padding:"10px 12px" }}>
                      {s.targetMet?<span style={{ fontSize:11,fontWeight:700,color:"#22c55e",background:"#22c55e15",padding:"2px 8px",borderRadius:4 }}>✓ YES</span>:<span style={{ fontSize:11,fontWeight:700,color:"#ef4444",background:"#ef444415",padding:"2px 8px",borderRadius:4 }}>✗ NO</span>}
                    </td>
                    <td style={{ padding:"10px 12px",fontSize:13,fontWeight:600,color:s.bepPrice<=Number(unitPrice)?"#22c55e":T.accent }}>${s.bepPrice.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {scenarios.length>0&&(()=>{
            const first=scenarios.find(s=>s.targetMet);
            const best=[...scenarios].sort((a,b)=>b.gmPct-a.gmPct)[0];
            return (
              <div style={{ marginTop:20,padding:16,background:T.surface2,borderRadius:10,border:"1px solid "+T.border }}>
                <div style={{ fontSize:12,fontWeight:700,color:T.text3,marginBottom:10,textTransform:"uppercase",letterSpacing:1 }}>📊 Scenario Insights</div>
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:16 }}>
                  <div>
                    <div style={{ fontSize:11,color:T.text3,marginBottom:4 }}>Best achievable GM%</div>
                    <div style={{ fontSize:22,fontWeight:700,color:best.gmPct>=targetGM?"#22c55e":"#eab308" }}>{best.gmPct.toFixed(1)}%</div>
                    <div style={{ fontSize:11,color:T.text3 }}>at {best.qty.toLocaleString()} units</div>
                  </div>
                  {first?(
                    <div>
                      <div style={{ fontSize:11,color:T.text3,marginBottom:4 }}>Target GM% first hit at</div>
                      <div style={{ fontSize:22,fontWeight:700,color:"#22c55e" }}>{first.qty.toLocaleString()}</div>
                      <div style={{ fontSize:11,color:T.text3 }}>units ({first.gmPct.toFixed(1)}% GM)</div>
                    </div>
                  ):(
                    <div>
                      <div style={{ fontSize:11,color:T.text3,marginBottom:4 }}>Target {targetGM}% GM not achievable</div>
                      <div style={{ fontSize:13,color:"#ef4444",fontWeight:600 }}>Min price needed: ${scenarios[scenarios.length-1]?.bepPrice.toFixed(2)}</div>
                      <div style={{ fontSize:11,color:T.text3 }}>at highest volume tier</div>
                    </div>
                  )}
                  <div>
                    <div style={{ fontSize:11,color:T.text3,marginBottom:4 }}>Sourcing items with tiers</div>
                    <div style={{ fontSize:22,fontWeight:700,color:T.text }}>{sourcingItems.filter(i=>(i.volume_tiers||[]).length>0).length}</div>
                    <div style={{ fontSize:11,color:T.text3 }}>of {sourcingItems.length} total items</div>
                  </div>
                </div>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}

// ─── INGREDIENT PICKER MODAL ─────────────────────────────────────────────────
// Shown when clicking "+ Ingredient" - lets user search library or create custom

function IngredientPickerModal({ onPick, onClose }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [allIngredients, setAllIngredients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("library"); // "library" | "custom"
  const [customName, setCustomName] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    supabase.from("plm_ingredient_library").select("id,name,category,ingredient_type,default_uom")
      .eq("active", true).order("name")
      .then(({ data }) => {
        const ing = data || [];
        setAllIngredients(ing);
        setResults(ing);
        // Cache globally for datalist in FormulaItemRow
        window.__helmLibIngredients = ing;
        setLoading(false);
        setTimeout(() => inputRef.current?.focus(), 50);
      });
  }, []);

  useEffect(() => {
    if (!query.trim()) { setResults(allIngredients); return; }
    const q = query.toLowerCase();
    setResults(allIngredients.filter(i =>
      i.name.toLowerCase().includes(q) || (i.category||"").toLowerCase().includes(q)
    ));
  }, [query, allIngredients]);

  const pick = (name, uom, type) => {
    onPick({ name, uom: uom||"", type: type||"ingredient" });
  };

  const typeColor = { ingredient:T.accent, packaging:"#8b5cf6", other:"#8b93a8" };

  return (
    <div style={{ position:"fixed",inset:0,background:"#00000060",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center" }}
      onClick={e=>{ if(e.target===e.currentTarget) onClose(); }}>
      <div style={{ background:T.surface,border:"1px solid "+T.border,borderRadius:14,width:520,maxHeight:"80vh",display:"flex",flexDirection:"column",boxShadow:"0 24px 60px #00000080" }}>
        {/* Header */}
        <div style={{ padding:"16px 20px",borderBottom:"1px solid "+T.border,display:"flex",alignItems:"center",gap:12,flexShrink:0 }}>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:15,fontWeight:700,color:T.text }}>Add Ingredient</div>
            <div style={{ fontSize:11,color:T.text3,marginTop:2 }}>Search your library or enter a custom ingredient</div>
          </div>
          <button onClick={onClose} style={{ background:"none",border:"none",color:T.text3,cursor:"pointer",fontSize:18,lineHeight:1,padding:0 }}>✕</button>
        </div>

        {/* Tab toggle */}
        <div style={{ display:"flex",padding:"10px 20px 0",gap:4,flexShrink:0 }}>
          {[["library","📋 From Library"],["custom","✏️ Custom"]].map(([m,l])=>(
            <button key={m} onClick={()=>setMode(m)} style={{ padding:"6px 14px",fontSize:12,fontWeight:600,borderRadius:"6px 6px 0 0",border:"1px solid "+(mode===m?T.border:"transparent"),borderBottom:"none",background:mode===m?T.surface2:"transparent",color:mode===m?T.text:T.text3,cursor:"pointer" }}>{l}</button>
          ))}
        </div>

        {/* Library search */}
        {mode==="library" && (
          <>
            <div style={{ padding:"12px 20px",borderTop:"1px solid "+T.border,borderBottom:"1px solid "+T.border,flexShrink:0 }}>
              <input
                ref={inputRef}
                value={query}
                onChange={e=>setQuery(e.target.value)}
                placeholder="Search by name or category…"
                style={{ width:"100%",fontSize:13,padding:"8px 12px",background:T.surface2,border:"1px solid "+T.border,borderRadius:7,color:T.text,outline:"none",boxSizing:"border-box" }}
              />
            </div>
            <div style={{ overflow:"auto",flex:1 }}>
              {loading && <div style={{ padding:24,textAlign:"center",color:T.text3,fontSize:12 }}>Loading library…</div>}
              {!loading && results.length===0 && (
                <div style={{ padding:24,textAlign:"center",color:T.text3 }}>
                  <div style={{ fontSize:13,marginBottom:8 }}>No matches for "{query}"</div>
                  <button onClick={()=>{ setCustomName(query); setMode("custom"); }}
                    style={{ fontSize:12,fontWeight:600,color:T.accent,background:"none",border:"none",cursor:"pointer" }}>
                    Add "{query}" as a custom ingredient →
                  </button>
                </div>
              )}
              {!loading && results.map(ing => (
                <div key={ing.id} onClick={()=>pick(ing.name, ing.default_uom, ing.ingredient_type)}
                  style={{ display:"flex",alignItems:"center",gap:12,padding:"11px 20px",cursor:"pointer",borderBottom:"1px solid "+T.border }}
                  onMouseEnter={e=>e.currentTarget.style.background=T.surface2}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:13,fontWeight:600,color:T.text }}>{ing.name}</div>
                    {ing.category && <div style={{ fontSize:11,color:T.text3,marginTop:1 }}>{ing.category}</div>}
                  </div>
                  <div style={{ display:"flex",gap:6,alignItems:"center" }}>
                    {ing.default_uom && <span style={{ fontSize:10,fontWeight:600,padding:"2px 7px",borderRadius:4,background:T.surface3,color:T.text3 }}>{ing.default_uom}</span>}
                    <span style={{ fontSize:10,fontWeight:700,padding:"2px 7px",borderRadius:4,
                      background:typeColor[ing.ingredient_type]+"20",color:typeColor[ing.ingredient_type] }}>
                      {ing.ingredient_type}
                    </span>
                  </div>
                  <span style={{ fontSize:11,color:T.accent }}>+ Add →</span>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Custom entry */}
        {mode==="custom" && (
          <div style={{ padding:20,flex:1 }}>
            <div style={{ fontSize:11,fontWeight:600,color:T.text3,marginBottom:6 }}>Ingredient Name *</div>
            <input
             
              value={customName}
              onChange={e=>setCustomName(e.target.value)}
              onKeyDown={e=>{ if(e.key==="Enter"&&customName.trim()) pick(customName.trim(),"","ingredient"); }}
              placeholder="e.g. Sodium Carbonate"
              style={{ width:"100%",fontSize:14,padding:"10px 12px",background:T.surface2,border:"1px solid "+T.border,borderRadius:8,color:T.text,outline:"none",boxSizing:"border-box",marginBottom:16 }}
            />
            <div style={{ fontSize:11,color:T.text3,marginBottom:12 }}>
              💡 Adding a custom ingredient won't save it to the library. To reuse it across programs, add it to the <strong>Library</strong> tab first.
            </div>
            <div style={{ display:"flex",gap:8 }}>
              <button onClick={onClose} style={{ flex:1,padding:"9px 0",fontSize:13,background:T.surface3,color:T.text2,border:"1px solid "+T.border,borderRadius:7,cursor:"pointer" }}>Cancel</button>
              <button onClick={()=>{ if(customName.trim()) pick(customName.trim(),"","ingredient"); }}
                disabled={!customName.trim()}
                style={{ flex:2,padding:"9px 0",fontSize:13,fontWeight:600,background:T.accent,color:"#fff",border:"none",borderRadius:7,cursor:"pointer",opacity:customName.trim()?1:0.5 }}>
                Add "{customName||"…"}"
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TAB: FORMULATIONS ────────────────────────────────────────────────────────

function FormulationsTab({ programId }) {
  const { orgId } = useAuth();
  const { isMobile } = useResponsive();
  const [formulas, setFormulas] = useState([]);
  const [selected, setSelected] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [editingMfg, setEditingMfg] = useState(false);
  const [printingFormula, setPrintingFormula] = useState(null);
  useEffect(()=>{ supabase.from("plm_formulations").select("*").eq("org_id", orgId).eq("program_id",programId).order("created_at").then(({data})=>{setFormulas(data||[]);setLoading(false);}); },[programId]);
  useEffect(()=>{ if(!selected){setItems([]);return;} supabase.from("plm_formula_items").select("*").eq("org_id", orgId).eq("formulation_id",selected.id).order("sort_order").order("created_at").then(({data})=>setItems(data||[])); },[selected]);
  const addFormula=async()=>{ const{data}=await supabase.from("plm_formulations").insert({program_id:programId,name:"New Formulation",version:"v1.0",status:"draft"}).select().single(); if(data){setFormulas(p=>[...p,data]);setSelected(data);} };
  const updateFormula=async(field,val)=>{ await supabase.from("plm_formulations").update({[field]:val}).eq("org_id", orgId).eq("id",selected.id); const u={...selected,[field]:val}; setSelected(u); setFormulas(p=>p.map(x=>x.id===u.id?u:x)); };
  const deleteFormula=async()=>{ if(!window.confirm(`Delete "${selected.name}"?`))return; await supabase.from("plm_formula_items").delete().eq("formulation_id",selected.id); await supabase.from("plm_formulations").delete().eq("org_id", orgId).eq("id",selected.id); setFormulas(p=>p.filter(x=>x.id!==selected.id)); setSelected(null); };
  const addItem=async({ name="", uom="", type="ingredient" }={})=>{ if(!selected)return; const{data}=await supabase.from("plm_formula_items").insert({formulation_id:selected.id,ingredient_name:name,item_type:type,quantity:0,unit:"%",input_qty:null,input_uom:uom||null}).select().single(); if(data)setItems(p=>[...p,data]); };
  const totalPct=items.filter(i=>i.unit==="%").reduce((a,b)=>a+parseFloat(b.quantity||0),0);
  if(loading)return <div style={{ color:T.text3,fontSize:13 }}>Loading…</div>;
  if(printingFormula)return (
    <Suspense fallback={<div style={{ padding: 40, color: T.text3 }}>Loading print view...</div>}>
      <PrintFormulaSheet formulationId={printingFormula} onClose={() => setPrintingFormula(null)} />
    </Suspense>
  );
  return (
    <div className="plm-grid">
      <div style={{ borderRight:"1px solid "+T.border,paddingRight:16 }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10 }}>
          <div style={{ fontSize:11,fontWeight:700,color:T.text3,textTransform:"uppercase",letterSpacing:1 }}>Formulas</div>
          <AddBtn onClick={addFormula} label="New" />
        </div>
        {formulas.length===0&&<EmptyState icon="⚗️" text="No formulas yet" />}
        {formulas.map(f=><div key={f.id} onClick={()=>setSelected(f)} style={{ padding:"8px 10px",borderRadius:6,cursor:"pointer",marginBottom:4,background:selected?.id===f.id?T.accentDim:T.surface2,border:"1px solid "+(selected?.id===f.id?T.accent+"60":T.border) }}><div style={{ fontSize:13,fontWeight:500,color:T.text }}>{f.name}</div><div style={{ fontSize:11,color:T.text3,marginTop:2 }}>{f.version} · {f.status}</div></div>)}
      </div>
      <div>
        {!selected?<EmptyState icon="⚗️" text="Select a formulation to view its ingredients" />:(
          <>
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12 }}>
              <div style={{ flex:1 }}>
                <InlineField label="Formula Name" value={selected.name} onChange={v=>updateFormula("name",v)} />
                <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12 }}>
                  <InlineField label="Version" value={selected.version} onChange={v=>updateFormula("version",v)} />
                  <InlineField label="Status" value={selected.status} onChange={v=>updateFormula("status",v)} options={["draft","in_review","approved","rejected","superseded","archived"].map(s=>({value:s,label:s.replace(/_/g," ")}))} />
                  <InlineField label="Form Type" value={selected.form_type} onChange={v=>updateFormula("form_type",v)} options={["liquid","powder","tablet","capsule","gel","cream","spray","sheet","pod","other"].map(s=>({value:s,label:s}))} />
                </div>
              </div>
              <div style={{ display:"flex",alignItems:"center",gap:8,marginTop:4 }}>
                <span style={{ fontSize:12,color:totalPct>100.5?"#ef4444":totalPct>99.4?"#22c55e":"#eab308",fontWeight:600 }}>Total: {totalPct.toFixed(2)}%</span>
                <button onClick={()=>setShowPicker(true)} style={{ display:"flex",alignItems:"center",gap:5,padding:"5px 12px",fontSize:12,fontWeight:600,background:T.accent,color:"#fff",border:"none",borderRadius:6,cursor:"pointer" }}>+ Ingredient</button>
                <button onClick={()=>setPrintingFormula(selected.id)} style={{ padding:"5px 10px",fontSize:12,background:"none",border:`1px solid ${T.border}`,borderRadius:6,color:T.text3,cursor:"pointer",display:"flex",alignItems:"center",gap:4 }} title="Print formula sheet">🖨 Print</button>
                <button onClick={deleteFormula} style={{ padding:"5px 10px",fontSize:12,background:"none",border:`1px solid ${T.border}`,borderRadius:6,color:T.text3,cursor:"pointer" }} title="Delete formula">🗑</button>
              </div>
            </div>
            <table style={{ width:"100%",borderCollapse:"collapse" }}>
              <thead><tr style={{ borderBottom:"1px solid "+T.border }}>{["Name","Type","Formula %","Unit","Input Qty","UOM","Function",""].map(h=><th key={h} style={{ padding:"4px 6px",textAlign:"left",fontSize:10,fontWeight:700,color:T.text3,textTransform:"uppercase" }}>{h}</th>)}</tr></thead>
              <tbody>{items.map(item=><FormulaItemRow key={item.id} item={item} onUpdate={u=>setItems(p=>p.map(x=>x.id===u.id?u:x))} onDelete={async()=>{await supabase.from("plm_formula_items").delete().eq("org_id", orgId).eq("id",item.id);setItems(p=>p.filter(x=>x.id!==item.id));}} />)}</tbody>
            </table>
            {items.length===0&&<EmptyState icon="🧪" text="No ingredients - click + Ingredient to add from library or type your own" />}
            
            {/* ── Making Instructions ────────────────────────────── */}
            <div style={{ marginTop: 20, borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 14 }}>📋</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Making Instructions</span>
                  {selected.manufacturing_process && <span style={{ fontSize: 10, color: T.text3, background: T.surface2, padding: "2px 6px", borderRadius: 4 }}>{Math.round(selected.manufacturing_process.length / 5)} words</span>}
                </div>
                <button onClick={() => setEditingMfg(!editingMfg)}
                  style={{ fontSize: 11, color: editingMfg ? "#ef4444" : T.accent, background: "none", border: `1px solid ${editingMfg ? "#ef444440" : T.accent + "40"}`, borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontWeight: 600 }}>
                  {editingMfg ? "Done Editing" : "✎ Edit"}
                </button>
              </div>

              {editingMfg ? (
                <textarea
                  value={selected.manufacturing_process || ""}
                  onChange={e => { const v = e.target.value; setSelected(p => ({ ...p, manufacturing_process: v })); setFormulas(p => p.map(x => x.id === selected.id ? { ...x, manufacturing_process: v } : x)); }}
                  onBlur={e => updateFormula("manufacturing_process", e.target.value)}
                  rows={20}
                  placeholder={"Write the full manufacturing process here...\n\nExample format:\n## PHASE 1: PVA DISSOLUTION\n1. **Water Preparation**: Heat 50% of RO water to 85°C\n2. **PVA Addition**: Slowly add PVA over 15 minutes\n   - Maintain vortex, avoid dry powder pockets\n   - Target mixing speed: 1500-2000 RPM\n\n## PHASE 2: SURFACTANT SYSTEM\n3. **SLS Slurry**: Mix remaining water with SLS at 60°C\n4. **Addition**: Pump into PVA base over 10 minutes"}
                  style={{ width: "100%", padding: "12px 14px", fontSize: 12, background: T.surface2, border: `1px solid ${T.accent}40`, borderRadius: 8, color: T.text, outline: "none", fontFamily: "monospace", lineHeight: 1.7, resize: "vertical", boxSizing: "border-box" }}
                />
              ) : selected.manufacturing_process ? (
                <div style={{ padding: "14px 18px", borderRadius: 10, background: T.surface2, border: `1px solid ${T.border}` }}>
                  <FormatMfgInstructions text={selected.manufacturing_process} />
                </div>
              ) : (
                <div style={{ padding: "24px 16px", borderRadius: 10, border: `2px dashed ${T.border}`, textAlign: "center", cursor: "pointer" }}
                  onClick={() => setEditingMfg(true)}>
                  <div style={{ fontSize: 24, marginBottom: 6 }}>📋</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: T.text3, marginBottom: 4 }}>No making instructions yet</div>
                  <div style={{ fontSize: 11, color: T.text3 }}>Click to add step-by-step manufacturing process, or ask the AI Advisor to generate them</div>
                </div>
              )}

              {/* Additional fields */}
              {selected.manufacturing_process && !editingMfg && (
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 10, marginTop: 12 }}>
                  <div>
                    <InlineField label="Batch Size" value={selected.target_batch_size} onChange={v => updateFormula("target_batch_size", v)} type="number" placeholder="e.g., 1000" />
                  </div>
                  <div>
                    <InlineField label="Batch Unit" value={selected.batch_size_unit || "kg"} onChange={v => updateFormula("batch_size_unit", v)} placeholder="kg" />
                  </div>
                  <div>
                    <InlineField label="Target pH" value={selected.target_ph} onChange={v => updateFormula("target_ph", v)} type="number" placeholder="e.g., 7.5" />
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
      {showPicker&&<IngredientPickerModal onPick={async(picked)=>{ await addItem(picked); setShowPicker(false); }} onClose={()=>setShowPicker(false)} />}
    </div>
  );
}

// ─── TAB: EXPERIMENTS ─────────────────────────────────────────────────────────

function ExperimentsTab({ programId }) {
  const { orgId } = useAuth();
  const { isMobile } = useResponsive();
  const [experiments, setExperiments] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeSubTab, setActiveSubTab] = useState("design");
  const [trialRuns, setTrialRuns] = useState([]);
  const [trialsLoading, setTrialsLoading] = useState(false);
  const [expandedRun, setExpandedRun] = useState(null);
  const [printingRun, setPrintingRun] = useState(null);
  const [trialFormula, setTrialFormula] = useState(null);
  const [trialFormulaItems, setTrialFormulaItems] = useState([]);
  useEffect(()=>{ supabase.from("plm_experiments").select("*").eq("org_id", orgId).eq("program_id",programId).order("created_at").then(({data})=>{setExperiments(data||[]);setLoading(false);}); },[programId]);
  // Load trial runs + formula when experiment is selected
  useEffect(()=>{
    if(!selected?.id){setTrialRuns([]);setTrialFormula(null);setTrialFormulaItems([]);return;}
    setTrialsLoading(true);
    const loadAll = async () => {
      const { data: runs } = await supabase.from("plm_experiment_runs").select("*").eq("experiment_id",selected.id).order("run_number");
      setTrialRuns(runs||[]);
      if(selected.formulation_id) {
        const { data: f } = await supabase.from("plm_formulations").select("*").eq("org_id", orgId).eq("id",selected.formulation_id).single();
        setTrialFormula(f||null);
        if(f) { const { data: items } = await supabase.from("plm_formula_items").select("*").eq("org_id", orgId).eq("formulation_id",f.id).order("sort_order"); setTrialFormulaItems(items||[]); }
        else setTrialFormulaItems([]);
      } else { setTrialFormula(null); setTrialFormulaItems([]); }
      setTrialsLoading(false);
    };
    loadAll();
  },[selected?.id]);
  const add=async()=>{ const{data}=await supabase.from("plm_experiments").insert({program_id:programId,name:"New Experiment",experiment_type:"formulation",status:"planning",factors:[],responses:[],run_matrix:[]}).select().single(); if(data){setExperiments(p=>[...p,data]);setSelected(data);} };
  const update=async(field,val)=>{ await supabase.from("plm_experiments").update({[field]:val}).eq("org_id", orgId).eq("id",selected.id); const u={...selected,[field]:val}; setSelected(u); setExperiments(p=>p.map(x=>x.id===u.id?u:x)); };
  const del=async()=>{ if(!window.confirm(`Delete "${selected.name}"?`))return; await supabase.from("plm_experiments").delete().eq("org_id", orgId).eq("id",selected.id); setExperiments(p=>p.filter(x=>x.id!==selected.id)); setSelected(null); };

  // Factor/response/run helpers
  const factors = Array.isArray(selected?.factors) ? selected.factors : [];
  const responses = Array.isArray(selected?.responses) ? selected.responses : [];
  const runMatrix = Array.isArray(selected?.run_matrix) ? selected.run_matrix : [];
  const addFactor = () => update("factors", [...factors, { id: crypto.randomUUID(), name: "", unit: "", type: "continuous", low: "", high: "", levels: [] }]);
  const updateFactor = (id, upd) => update("factors", factors.map(f => f.id === id ? { ...f, ...upd } : f));
  const removeFactor = (id) => update("factors", factors.filter(f => f.id !== id));
  const addResponse = () => update("responses", [...responses, { id: crypto.randomUUID(), name: "", unit: "", target: "", direction: "maximize" }]);
  const updateResponse = (id, upd) => update("responses", responses.map(r => r.id === id ? { ...r, ...upd } : r));
  const removeResponse = (id) => update("responses", responses.filter(r => r.id !== id));

  const generateFullFactorial = () => {
    if (factors.length === 0) return;
    const levels = factors.map(f => f.type === "categorical" ? (f.levels || []) : [f.low, f.high].filter(v => v !== "" && v !== undefined));
    const combos = levels.reduce((acc, lvls) => {
      if (acc.length === 0) return lvls.map(l => [l]);
      return acc.flatMap(combo => lvls.map(l => [...combo, l]));
    }, []);
    const runs = combos.map((combo, i) => {
      const run = { id: crypto.randomUUID(), run_number: i + 1, factor_values: {}, response_values: {}, notes: "" };
      factors.forEach((f, j) => { run.factor_values[f.id] = combo[j]; });
      responses.forEach(r => { run.response_values[r.id] = ""; });
      return run;
    });
    update("run_matrix", runs);
  };

  const updateRun = (runId, field, val) => {
    update("run_matrix", runMatrix.map(r => r.id === runId ? { ...r, [field]: val } : r));
  };
  const updateRunFactor = (runId, factorId, val) => {
    update("run_matrix", runMatrix.map(r => r.id === runId ? { ...r, factor_values: { ...r.factor_values, [factorId]: val } } : r));
  };
  const updateRunResponse = (runId, respId, val) => {
    update("run_matrix", runMatrix.map(r => r.id === runId ? { ...r, response_values: { ...r.response_values, [respId]: val } } : r));
  };
  const addManualRun = () => {
    const run = { id: crypto.randomUUID(), run_number: runMatrix.length + 1, factor_values: {}, response_values: {}, notes: "" };
    factors.forEach(f => { run.factor_values[f.id] = ""; });
    responses.forEach(r => { run.response_values[r.id] = ""; });
    update("run_matrix", [...runMatrix, run]);
  };
  const removeRun = (id) => update("run_matrix", runMatrix.filter(r => r.id !== id));

  const subTabs = ["design", "matrix", "trials", "analysis"];

  if(loading)return <div style={{ color:T.text3,fontSize:13 }}>Loading…</div>;

  if (printingRun) return (
    <Suspense fallback={<div style={{ padding: 40, color: T.text3 }}>Loading print view...</div>}>
      <PrintBatchRecord experimentId={printingRun.experimentId} runId={printingRun.runId} onClose={() => setPrintingRun(null)} />
    </Suspense>
  );
  return (
    <div className="plm-grid">
      <div style={{ borderRight:"1px solid "+T.border,paddingRight:16 }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10 }}>
          <div style={{ fontSize:11,fontWeight:700,color:T.text3,textTransform:"uppercase",letterSpacing:1 }}>Experiments</div>
          <AddBtn onClick={add} label="New" />
        </div>
        {experiments.length===0&&<EmptyState icon="🔬" text="No experiments yet" />}
        {experiments.map(e=><div key={e.id} onClick={()=>{setSelected(e);setActiveSubTab("design");}} style={{ padding:"8px 10px",borderRadius:6,cursor:"pointer",marginBottom:4,background:selected?.id===e.id?T.accentDim:T.surface2,border:"1px solid "+(selected?.id===e.id?T.accent+"60":T.border) }}><div style={{ fontSize:13,fontWeight:500,color:T.text }}>{e.name}</div><div style={{ fontSize:11,color:T.text3,marginTop:2 }}><StatusDot status={e.status} />{e.experiment_type||"-"}</div></div>)}
      </div>
      <div>
        {!selected?<EmptyState icon="🔬" text="Select an experiment to view details" />:(
          <div>
            {/* Header */}
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:12 }}>
              <InlineField label="Experiment Name" value={selected.name} onChange={v=>update("name",v)} />
              <button onClick={del} style={{ padding:"5px 10px",fontSize:12,background:"none",border:`1px solid ${T.border}`,borderRadius:6,color:T.text3,cursor:"pointer" }} title="Delete">🗑</button>
            </div>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12,marginBottom:16 }}>
              <InlineField label="Type" value={selected.experiment_type} onChange={v=>update("experiment_type",v)} options={["formulation","process","stability","efficacy","safety","sensory","packaging","shelf_life","microbial","accelerated_aging","other"].map(t=>({value:t,label:t.replace(/_/g," ")}))} />
              <InlineField label="Status" value={selected.status} onChange={v=>update("status",v)} options={["planning","in_progress","completed","analyzing","concluded","cancelled"].map(s=>({value:s,label:s}))} />
              <InlineField label="DOE Design" value={selected.doe_design} onChange={v=>update("doe_design",v)} options={["full_factorial","fractional_factorial","central_composite","box_behnken","taguchi","one_factor","custom","screening","response_surface","mixture","none"].map(s=>({value:s,label:s.replace(/_/g," ")}))} />
            </div>
            <InlineField label="Hypothesis" value={selected.hypothesis} onChange={v=>update("hypothesis",v)} multiline placeholder="State your hypothesis - what do you expect to learn?" />

            {/* Sub-tabs */}
            <div style={{ display:"flex",gap:0,borderBottom:`1px solid ${T.border}`,marginBottom:16 }}>
              {subTabs.map(t => <button key={t} onClick={()=>setActiveSubTab(t)} style={{ padding:"8px 16px",fontSize:12,fontWeight:activeSubTab===t?700:400,color:activeSubTab===t?T.accent:T.text3,background:"none",border:"none",borderBottom:activeSubTab===t?`2px solid ${T.accent}`:"2px solid transparent",cursor:"pointer",textTransform:"capitalize" }}>{t}</button>)}
            </div>

            {/* Design Tab - Factors & Responses */}
            {activeSubTab === "design" && (
              <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:20 }}>
                {/* Factors */}
                <div>
                  <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8 }}>
                    <div style={{ fontSize:12,fontWeight:700,color:T.text2 }}>Factors (Independent Variables)</div>
                    <AddBtn onClick={addFactor} label="Add" />
                  </div>
                  {factors.length === 0 && <div style={{ fontSize:12,color:T.text3,padding:"12px 0" }}>No factors defined. Add variables you want to test.</div>}
                  {factors.map(f => (
                    <div key={f.id} style={{ padding:"10px 12px",borderRadius:8,border:`1px solid ${T.border}`,marginBottom:6,background:T.surface2 }}>
                      <div style={{ display:"flex",gap:8,marginBottom:6 }}>
                        <input value={f.name} onChange={e=>updateFactor(f.id,{name:e.target.value})} placeholder="Factor name (e.g. Surfactant %)" style={{ flex:1,padding:"4px 8px",fontSize:12,background:T.surface,border:`1px solid ${T.border}`,borderRadius:4,color:T.text,outline:"none" }} />
                        <input value={f.unit} onChange={e=>updateFactor(f.id,{unit:e.target.value})} placeholder="Unit" style={{ width:60,padding:"4px 6px",fontSize:12,background:T.surface,border:`1px solid ${T.border}`,borderRadius:4,color:T.text,outline:"none" }} />
                        <button onClick={()=>removeFactor(f.id)} style={{ background:"none",border:"none",color:T.text3,cursor:"pointer",fontSize:12 }}>✕</button>
                      </div>
                      <div style={{ display:"flex",gap:8,alignItems:"center" }}>
                        <select value={f.type} onChange={e=>updateFactor(f.id,{type:e.target.value})} style={{ padding:"3px 6px",fontSize:11,background:T.surface,border:`1px solid ${T.border}`,borderRadius:4,color:T.text }}>
                          <option value="continuous">Continuous</option>
                          <option value="categorical">Categorical</option>
                        </select>
                        {f.type === "continuous" ? (
                          <>
                            <input value={f.low??""} onChange={e=>updateFactor(f.id,{low:e.target.value})} placeholder="Low" style={{ width:60,padding:"3px 6px",fontSize:11,background:T.surface,border:`1px solid ${T.border}`,borderRadius:4,color:T.text,outline:"none" }} />
                            <span style={{ fontSize:11,color:T.text3 }}>to</span>
                            <input value={f.high??""} onChange={e=>updateFactor(f.id,{high:e.target.value})} placeholder="High" style={{ width:60,padding:"3px 6px",fontSize:11,background:T.surface,border:`1px solid ${T.border}`,borderRadius:4,color:T.text,outline:"none" }} />
                          </>
                        ) : (
                          <input value={(f.levels||[]).join(", ")} onChange={e=>updateFactor(f.id,{levels:e.target.value.split(",").map(s=>s.trim()).filter(Boolean)})} placeholder="Level 1, Level 2, ..." style={{ flex:1,padding:"3px 6px",fontSize:11,background:T.surface,border:`1px solid ${T.border}`,borderRadius:4,color:T.text,outline:"none" }} />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {/* Responses */}
                <div>
                  <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8 }}>
                    <div style={{ fontSize:12,fontWeight:700,color:T.text2 }}>Responses (Dependent Variables)</div>
                    <AddBtn onClick={addResponse} label="Add" />
                  </div>
                  {responses.length === 0 && <div style={{ fontSize:12,color:T.text3,padding:"12px 0" }}>No responses defined. Add what you're measuring.</div>}
                  {responses.map(r => (
                    <div key={r.id} style={{ padding:"10px 12px",borderRadius:8,border:`1px solid ${T.border}`,marginBottom:6,background:T.surface2 }}>
                      <div style={{ display:"flex",gap:8,marginBottom:6 }}>
                        <input value={r.name} onChange={e=>updateResponse(r.id,{name:e.target.value})} placeholder="Response name (e.g. Cleaning Score)" style={{ flex:1,padding:"4px 8px",fontSize:12,background:T.surface,border:`1px solid ${T.border}`,borderRadius:4,color:T.text,outline:"none" }} />
                        <input value={r.unit} onChange={e=>updateResponse(r.id,{unit:e.target.value})} placeholder="Unit" style={{ width:60,padding:"4px 6px",fontSize:12,background:T.surface,border:`1px solid ${T.border}`,borderRadius:4,color:T.text,outline:"none" }} />
                        <button onClick={()=>removeResponse(r.id)} style={{ background:"none",border:"none",color:T.text3,cursor:"pointer",fontSize:12 }}>✕</button>
                      </div>
                      <div style={{ display:"flex",gap:8,alignItems:"center" }}>
                        <select value={r.direction} onChange={e=>updateResponse(r.id,{direction:e.target.value})} style={{ padding:"3px 6px",fontSize:11,background:T.surface,border:`1px solid ${T.border}`,borderRadius:4,color:T.text }}>
                          <option value="maximize">Maximize ↑</option>
                          <option value="minimize">Minimize ↓</option>
                          <option value="target">Hit Target ◎</option>
                        </select>
                        <input value={r.target??""} onChange={e=>updateResponse(r.id,{target:e.target.value})} placeholder="Target value" style={{ width:80,padding:"3px 6px",fontSize:11,background:T.surface,border:`1px solid ${T.border}`,borderRadius:4,color:T.text,outline:"none" }} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Matrix Tab - Run Matrix */}
            {activeSubTab === "matrix" && (
              <div>
                <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:12 }}>
                  <button onClick={generateFullFactorial} disabled={factors.length===0} style={{ padding:"6px 14px",fontSize:12,fontWeight:600,background:T.accent,color:"#fff",border:"none",borderRadius:6,cursor:"pointer",opacity:factors.length===0?0.4:1 }}>Generate Full Factorial</button>
                  <button onClick={addManualRun} style={{ padding:"6px 14px",fontSize:12,fontWeight:600,background:T.surface2,color:T.text2,border:`1px solid ${T.border}`,borderRadius:6,cursor:"pointer" }}>+ Add Run</button>
                  <span style={{ fontSize:12,color:T.text3 }}>{runMatrix.length} run{runMatrix.length!==1?"s":""}</span>
                </div>
                {runMatrix.length === 0 ? (
                  <div style={{ padding:"24px",textAlign:"center",color:T.text3,fontSize:13 }}>Define factors and responses in the Design tab, then generate runs here.</div>
                ) : (
                  <div style={{ overflow:"auto",maxHeight:500 }}>
                    <table style={{ width:"100%",borderCollapse:"collapse",fontSize:12 }}>
                      <thead>
                        <tr style={{ borderBottom:`1px solid ${T.border}` }}>
                          <th style={{ padding:"6px 8px",textAlign:"left",fontSize:10,fontWeight:700,color:T.text3,textTransform:"uppercase",width:40 }}>#</th>
                          {factors.map(f => <th key={f.id} style={{ padding:"6px 8px",textAlign:"left",fontSize:10,fontWeight:700,color:"#3b82f6",textTransform:"uppercase" }}>{f.name||"Factor"}{f.unit?` (${f.unit})`:""}</th>)}
                          {responses.map(r => <th key={r.id} style={{ padding:"6px 8px",textAlign:"left",fontSize:10,fontWeight:700,color:"#22c55e",textTransform:"uppercase" }}>{r.name||"Response"}{r.unit?` (${r.unit})`:""}</th>)}
                          <th style={{ padding:"6px 8px",textAlign:"left",fontSize:10,fontWeight:700,color:T.text3,textTransform:"uppercase" }}>Notes</th>
                          <th style={{ width:30 }} />
                        </tr>
                      </thead>
                      <tbody>
                        {runMatrix.map(run => (
                          <tr key={run.id} style={{ borderBottom:`1px solid ${T.border}` }}>
                            <td style={{ padding:"4px 8px",fontWeight:600,color:T.text3 }}>{run.run_number}</td>
                            {factors.map(f => <td key={f.id} style={{ padding:"4px 4px" }}><input value={run.factor_values?.[f.id]??""} onChange={e=>updateRunFactor(run.id,f.id,e.target.value)} style={{ width:"100%",padding:"3px 6px",fontSize:12,background:T.surface,border:`1px solid ${T.border}`,borderRadius:4,color:T.text,outline:"none",boxSizing:"border-box" }} /></td>)}
                            {responses.map(r => <td key={r.id} style={{ padding:"4px 4px" }}><input value={run.response_values?.[r.id]??""} onChange={e=>updateRunResponse(run.id,r.id,e.target.value)} placeholder="-" style={{ width:"100%",padding:"3px 6px",fontSize:12,background:"#22c55e08",border:`1px solid #22c55e30`,borderRadius:4,color:T.text,outline:"none",boxSizing:"border-box" }} /></td>)}
                            <td style={{ padding:"4px 4px" }}><input value={run.notes||""} onChange={e=>updateRun(run.id,"notes",e.target.value)} placeholder="..." style={{ width:"100%",padding:"3px 6px",fontSize:12,background:T.surface,border:`1px solid ${T.border}`,borderRadius:4,color:T.text,outline:"none",boxSizing:"border-box" }} /></td>
                            <td><button onClick={()=>removeRun(run.id)} style={{ background:"none",border:"none",color:T.text3,cursor:"pointer",fontSize:11 }}>✕</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {/* Analysis Tab */}
            {activeSubTab === "trials" && (() => {
              const updateRun = async (runId, field, val) => {
                await supabase.from("plm_experiment_runs").update({ [field]: val, updated_at: new Date().toISOString() }).eq("id", runId);
                setTrialRuns(p => p.map(r => r.id === runId ? { ...r, [field]: val } : r));
              };
              const updateResult = async (runId, responseName, val) => {
                const run = trialRuns.find(r => r.id === runId);
                const results = { ...(run?.response_results || {}), [responseName]: val === "" ? null : parseFloat(val) };
                await supabase.from("plm_experiment_runs").update({ response_results: results, updated_at: new Date().toISOString() }).eq("id", runId);
                setTrialRuns(p => p.map(r => r.id === runId ? { ...r, response_results: results } : r));
              };
              const SO = ["planned","in_progress","completed","failed","skipped"];
              const SC = { planned: T.text3, in_progress: "#eab308", completed: "#22c55e", failed: "#ef4444", skipped: "#8b93a8" };
              if (trialsLoading) return <div style={{ color: T.text3, fontSize: 12, padding: 16 }}>Loading trials...</div>;
              if (trialRuns.length === 0) return (
                <div style={{ textAlign: "center", padding: "40px 16px", color: T.text3 }}>
                  <div style={{ fontSize: 28, marginBottom: 8 }}>🔬</div>
                  <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>No trial runs yet</div>
                  <div style={{ fontSize: 12, lineHeight: 1.6 }}>Use the AI Advisor to create an experiment with manufacturing instructions, or add runs in the Matrix tab.</div>
                </div>
              );

              const completed = trialRuns.filter(r => r.status === "completed").length;
              return (
                <div>
                  {/* Summary bar */}
                  <div style={{ display: "flex", gap: 12, marginBottom: 16, alignItems: "center" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{trialRuns.length} Trials</div>
                    <div style={{ flex: 1, height: 6, borderRadius: 3, background: T.surface3 }}>
                      <div style={{ width: `${(completed / trialRuns.length) * 100}%`, height: "100%", borderRadius: 3, background: "#22c55e", transition: "width 0.4s" }} />
                    </div>
                    <div style={{ fontSize: 11, color: T.text3 }}>{completed}/{trialRuns.length} complete</div>
                  </div>

                  {trialRuns.map(run => {
                    const isExp = expandedRun === run.id;
                    const fs = run.factor_settings || {};
                    return (
                      <div key={run.id} style={{ marginBottom: 10, borderRadius: 10, border: `1px solid ${isExp ? T.accent + "50" : T.border}`, background: T.surface, overflow: "hidden", boxShadow: isExp ? `0 2px 12px ${T.accent}10` : "none" }}>
                        {/* Header */}
                        <div onClick={() => setExpandedRun(isExp ? null : run.id)}
                          style={{ padding: "12px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 10, background: isExp ? T.accent + "06" : "transparent" }}>
                          <div style={{ width: 32, height: 32, borderRadius: 8, background: (SC[run.status] || T.text3) + "15", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: SC[run.status] || T.text3, flexShrink: 0 }}>{run.run_number}</div>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                              <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: (SC[run.status] || T.text3) + "15", color: SC[run.status] || T.text3, textTransform: "uppercase" }}>{run.status?.replace(/_/g," ")}</span>
                              {run.batch_id && <span style={{ fontSize: 10, color: T.text3 }}>Batch: {run.batch_id}</span>}
                              {run.operator && <span style={{ fontSize: 10, color: T.text3 }}>Op: {run.operator}</span>}
                              {run.run_date && <span style={{ fontSize: 10, color: T.text3 }}>{run.run_date}</span>}
                            </div>
                            <div style={{ display: "flex", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                              {Object.entries(fs).map(([k,v]) => (
                                <span key={k} style={{ padding: "2px 7px", borderRadius: 4, background: T.accent + "10", fontSize: 10, color: T.accent, fontWeight: 600 }}>{k}: {String(v)}</span>
                              ))}
                            </div>
                          </div>
                          <button onClick={e => { e.stopPropagation(); setPrintingRun({ experimentId: selected.id, runId: run.id }); }} style={{ background: "none", border: `1px solid ${T.border}`, borderRadius: 6, cursor: "pointer", fontSize: 12, color: T.text3, padding: "4px 10px", display: "flex", alignItems: "center", gap: 4 }} title="Print batch record">🖨 Print</button>
                          <span style={{ fontSize: 14, color: T.text3, transition: "transform 0.2s", transform: isExp ? "rotate(180deg)" : "rotate(0)" }}>▼</span>
                        </div>

                        {/* Expanded */}
                        {isExp && (
                          <div style={{ borderTop: `1px solid ${T.border}` }}>
                            {/* Tracking row */}
                            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr 1fr", gap: 0, borderBottom: `1px solid ${T.border}` }}>
                              {[["Status", <select value={run.status} onChange={e => updateRun(run.id, "status", e.target.value)} style={{ width: "100%", padding: "6px 8px", fontSize: 12, background: "transparent", border: "none", color: T.text, outline: "none" }}>{SO.map(s => <option key={s} value={s}>{s.replace(/_/g," ")}</option>)}</select>],
                                ["Batch ID", <input value={run.batch_id || ""} onBlur={e => updateRun(run.id, "batch_id", e.target.value)} onChange={e => setTrialRuns(p => p.map(r => r.id === run.id ? { ...r, batch_id: e.target.value } : r))} placeholder="LAB-2026-042" style={{ width: "100%", padding: "6px 8px", fontSize: 12, background: "transparent", border: "none", color: T.text, outline: "none" }} />],
                                ["Operator", <input value={run.operator || ""} onBlur={e => updateRun(run.id, "operator", e.target.value)} onChange={e => setTrialRuns(p => p.map(r => r.id === run.id ? { ...r, operator: e.target.value } : r))} placeholder="Name" style={{ width: "100%", padding: "6px 8px", fontSize: 12, background: "transparent", border: "none", color: T.text, outline: "none" }} />],
                                ["Date", <input type="date" value={run.run_date || ""} onChange={e => updateRun(run.id, "run_date", e.target.value || null)} style={{ width: "100%", padding: "6px 8px", fontSize: 12, background: "transparent", border: "none", color: T.text, outline: "none" }} />]
                              ].map(([label, input], i) => (
                                <div key={label} style={{ padding: "8px 12px", borderRight: i < 3 ? `1px solid ${T.border}` : "none" }}>
                                  <div style={{ fontSize: 9, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 }}>{label}</div>
                                  {input}
                                </div>
                              ))}
                            </div>

                            <div style={{ padding: "16px 16px 12px" }}>
                              {/* Formula ingredient table with DOE factor highlights */}
                              {(() => {
                                const hasFormula = trialFormulaItems.length > 0;
                                const factorNames = Object.keys(fs).map(k => k.toLowerCase());
                                // Determine which ingredients are affected by factors
                                const isAffected = (item) => {
                                  const name = (item.ingredient_name || "").toLowerCase();
                                  const fn = (item.function_in_formula || "").toLowerCase();
                                  return factorNames.some(fk => name.includes(fk.split(" ")[0]) || fk.includes(name.split(" ")[0]) || fn.includes(fk.split(" ")[0]));
                                };
                                return (
                                  <div style={{ marginBottom: 16 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                      <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>⚗️ {hasFormula ? `Formula: ${trialFormula?.name || "-"}` : "Ingredient Table"}</span>
                                      {trialFormula?.version && <span style={{ fontSize: 10, color: T.text3 }}>{trialFormula.version}</span>}
                                      {trialFormula?.target_batch_size && <span style={{ fontSize: 10, color: T.accent, fontWeight: 600 }}>Batch: {trialFormula.target_batch_size} {trialFormula.batch_size_unit || "kg"}</span>}
                                      {hasFormula && <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 3, background: "#f9731620", color: "#f97316", fontWeight: 600 }}>🔸 = changed by DOE factors</span>}
                                    </div>
                                    {hasFormula ? (
                                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                        <thead><tr style={{ borderBottom: `2px solid ${T.border}` }}>
                                          {["","#","Ingredient","Function","Phase","Base %","Trial %","Weight (g)","Temp °C"].map(h => (
                                            <th key={h} style={{ padding: "5px 8px", textAlign: ["Base %","Trial %","Weight (g)","Temp °C"].includes(h) ? "right" : "left", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", width: h === "" ? 8 : undefined }}>{h}</th>
                                          ))}
                                        </tr></thead>
                                        <tbody>
                                          {trialFormulaItems.map((item, i) => {
                                            const affected = isAffected(item);
                                            const wt = trialFormula?.target_batch_size ? (item.quantity / 100 * trialFormula.target_batch_size * 1000).toFixed(1) : "-";
                                            return (
                                              <tr key={item.id} style={{ borderBottom: `1px solid ${T.border}`, background: affected ? "#f9731608" : "transparent" }}>
                                                <td style={{ padding: "5px 2px", width: 8 }}>{affected && <span style={{ color: "#f97316", fontSize: 12 }}>🔸</span>}</td>
                                                <td style={{ padding: "5px 8px", fontSize: 11, color: T.text3 }}>{item.addition_order || i + 1}</td>
                                                <td style={{ padding: "5px 8px", fontSize: 12, fontWeight: affected ? 700 : 500, color: affected ? "#f97316" : T.text }}>{item.ingredient_name}</td>
                                                <td style={{ padding: "5px 8px", fontSize: 11, color: T.text3 }}>{item.function_in_formula || "-"}</td>
                                                <td style={{ padding: "5px 8px", fontSize: 11, color: T.text3 }}>{item.phase || "-"}</td>
                                                <td style={{ padding: "5px 8px", fontSize: 12, color: affected ? T.text3 : T.text, textAlign: "right", textDecoration: affected ? "line-through" : "none" }}>{item.quantity}</td>
                                                <td style={{ padding: "5px 8px", fontSize: 12, fontWeight: 700, color: affected ? "#f97316" : T.text, textAlign: "right" }}>{affected ? "→ see factors" : item.quantity}</td>
                                                <td style={{ padding: "5px 8px", fontSize: 12, color: T.text2, textAlign: "right" }}>{wt}</td>
                                                <td style={{ padding: "5px 8px", fontSize: 11, color: T.text3, textAlign: "right" }}>{item.addition_temp_c || "-"}</td>
                                              </tr>
                                            );
                                          })}
                                          <tr style={{ background: T.surface2 }}>
                                            <td></td>
                                            <td style={{ padding: "5px 8px" }}></td>
                                            <td style={{ padding: "5px 8px", fontSize: 11, fontWeight: 700, color: T.text }}>TOTAL</td>
                                            <td colSpan={2}></td>
                                            <td style={{ padding: "5px 8px", fontSize: 12, fontWeight: 700, color: T.text, textAlign: "right" }}>{trialFormulaItems.reduce((s, i) => s + (parseFloat(i.quantity) || 0), 0).toFixed(2)}%</td>
                                            <td colSpan={3}></td>
                                          </tr>
                                        </tbody>
                                      </table>
                                    ) : (
                                      <div style={{ padding: "12px 16px", borderRadius: 8, background: T.surface2, border: `1px solid ${T.border}`, fontSize: 12, color: T.text3 }}>
                                        No base formulation linked to this experiment. Link a formulation in the Design tab to see ingredients here.
                                      </div>
                                    )}
                                    {/* Factor adjustments callout */}
                                    {hasFormula && Object.keys(fs).length > 0 && (
                                      <div style={{ marginTop: 8, padding: "10px 14px", borderRadius: 8, background: "#f9731608", border: "1px solid #f9731630" }}>
                                        <div style={{ fontSize: 10, fontWeight: 700, color: "#f97316", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 6 }}>DOE Factor Adjustments for Run {run.run_number}</div>
                                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 6 }}>
                                          {Object.entries(fs).map(([k,v]) => {
                                            const factorDef = (Array.isArray(selected.factors) ? selected.factors : []).find(f => f.name === k);
                                            return (
                                              <div key={k} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 6, background: T.surface, border: `1px solid ${T.border}` }}>
                                                <span style={{ fontSize: 14 }}>🔸</span>
                                                <div>
                                                  <div style={{ fontSize: 11, fontWeight: 700, color: T.text }}>{k}</div>
                                                  <div style={{ fontSize: 13, fontWeight: 800, color: "#f97316" }}>{String(v)} {factorDef?.unit || ""}</div>
                                                  {factorDef && (factorDef.low != null || factorDef.high != null) && (
                                                    <div style={{ fontSize: 9, color: T.text3 }}>Range: {factorDef.low} – {factorDef.high} {factorDef.unit || ""}</div>
                                                  )}
                                                </div>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })()}

                              {/* Manufacturing Instructions - rendered with formatting */}
                              <div style={{ marginBottom: 16 }}>
                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: T.text }}>📋 Manufacturing Instructions</span>
                                  <button onClick={() => {
                                    const el = document.getElementById(`mfg-edit-${run.id}`);
                                    if (el) el.style.display = el.style.display === "none" ? "block" : "none";
                                  }} style={{ fontSize: 10, color: T.accent, background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>Edit ✎</button>
                                </div>
                                {run.manufacturing_instructions ? (
                                  <div style={{ padding: "12px 16px", borderRadius: 8, background: T.surface2, border: `1px solid ${T.border}` }}>
                                    {<FormatMfgInstructions text={run.manufacturing_instructions} />}
                                  </div>
                                ) : trialFormula?.manufacturing_process ? (
                                  <div style={{ padding: "12px 16px", borderRadius: 8, background: T.surface2, border: `1px solid ${T.border}` }}>
                                    <div style={{ fontSize: 10, color: T.accent, fontWeight: 600, marginBottom: 6 }}>From base formulation:</div>
                                    {<FormatMfgInstructions text={trialFormula.manufacturing_process} />}
                                  </div>
                                ) : (
                                  <div style={{ fontSize: 12, color: T.text3, fontStyle: "italic" }}>No instructions yet - click Edit to add</div>
                                )}
                                <textarea id={`mfg-edit-${run.id}`} value={run.manufacturing_instructions || ""} onBlur={e => updateRun(run.id, "manufacturing_instructions", e.target.value)}
                                  onChange={e => setTrialRuns(p => p.map(r => r.id === run.id ? { ...r, manufacturing_instructions: e.target.value } : r))}
                                  rows={8} placeholder="Step-by-step manufacturing instructions..."
                                  style={{ display: "none", width: "100%", padding: "10px 12px", fontSize: 12, background: T.surface2, border: `1px solid ${T.accent}40`, borderRadius: 8, color: T.text, outline: "none", fontFamily: "monospace", lineHeight: 1.6, resize: "vertical", boxSizing: "border-box", marginTop: 8 }} />
                              </div>

                              {/* Response Results */}
                              {responses.length > 0 && (
                                <div style={{ marginBottom: 16 }}>
                                  <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 8 }}>📊 Results</div>
                                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 8 }}>
                                    {responses.map(resp => {
                                      const val = run.response_results?.[resp.name];
                                      return (
                                        <div key={resp.name || resp.id} style={{ padding: "10px 12px", borderRadius: 8, background: T.surface2, border: `1px solid ${val != null ? "#22c55e40" : T.border}` }}>
                                          <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, marginBottom: 4 }}>{resp.name}</div>
                                          <input type="number" step="any" value={val ?? ""}
                                            onChange={e => updateResult(run.id, resp.name, e.target.value)}
                                            placeholder={`${resp.target === "maximize" ? "↑" : resp.target === "minimize" ? "↓" : "◎"} ${resp.target}`}
                                            style={{ width: "100%", padding: "4px 0", fontSize: 16, fontWeight: 700, background: "none", border: "none", color: val != null ? "#22c55e" : T.text3, outline: "none", boxSizing: "border-box" }} />
                                          {resp.unit && <div style={{ fontSize: 9, color: T.text3, marginTop: 2 }}>{resp.unit}{resp.target_value ? ` · target: ${resp.target_value}` : ""}</div>}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* Process Deviations */}
                              <div style={{ marginBottom: 16 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 6 }}>⚠️ Process Deviations</div>
                                <textarea value={run.process_deviations || ""} onBlur={e => updateRun(run.id, "process_deviations", e.target.value)}
                                  onChange={e => setTrialRuns(p => p.map(r => r.id === run.id ? { ...r, process_deviations: e.target.value } : r))}
                                  rows={2} placeholder="What actually happened differently from the instructions..."
                                  style={{ width: "100%", padding: "8px 12px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, outline: "none", fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} />
                              </div>

                              {/* Notes */}
                              <div style={{ marginBottom: 12 }}>
                                <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 6 }}>📝 Notes</div>
                                <textarea value={run.notes || ""} onBlur={e => updateRun(run.id, "notes", e.target.value)}
                                  onChange={e => setTrialRuns(p => p.map(r => r.id === run.id ? { ...r, notes: e.target.value } : r))}
                                  rows={2} placeholder="General notes, observations, learnings..."
                                  style={{ width: "100%", padding: "8px 12px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, color: T.text, outline: "none", fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} />
                              </div>
                              <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: 8 }}>
                                {[["pre_run_notes","Pre-Run","Setup notes..."],["in_process_notes","In-Process","Observations during trial..."],["post_run_notes","Post-Run","Post-trial observations..."]].map(([field,label,ph]) => (
                                  <div key={field}>
                                    <div style={{ fontSize: 9, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 }}>{label}</div>
                                    <textarea value={run[field] || ""} onBlur={e => updateRun(run.id, field, e.target.value)}
                                      onChange={e => setTrialRuns(p => p.map(r => r.id === run.id ? { ...r, [field]: e.target.value } : r))}
                                      rows={2} placeholder={ph}
                                      style={{ width: "100%", padding: "6px 8px", fontSize: 11, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, outline: "none", fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }} />
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {activeSubTab === "analysis" && (
              <div>
                <InlineField label="Conclusions" value={selected.conclusions} onChange={v=>update("conclusions",v)} multiline placeholder="Summarize what you learned from this experiment…" />
                <InlineField label="Recommendations" value={selected.recommendations} onChange={v=>update("recommendations",v)} multiline placeholder="Next steps and recommended actions…" />
                {runMatrix.length > 0 && responses.length > 0 && (
                  <div style={{ marginTop:16,padding:"16px",borderRadius:10,border:`1px solid ${T.border}`,background:T.surface2 }}>
                    <div style={{ fontSize:12,fontWeight:700,color:T.text2,marginBottom:10 }}>Quick Statistics</div>
                    {responses.map(resp => {
                      const vals = runMatrix.map(r => parseFloat(r.response_values?.[resp.id])).filter(v => !isNaN(v));
                      if (vals.length === 0) return <div key={resp.id} style={{ fontSize:12,color:T.text3,marginBottom:4 }}>{resp.name}: No data</div>;
                      const min = Math.min(...vals), max = Math.max(...vals), avg = vals.reduce((a,b)=>a+b,0)/vals.length;
                      const stdDev = Math.sqrt(vals.reduce((a,b)=>a+Math.pow(b-avg,2),0)/vals.length);
                      return (
                        <div key={resp.id} style={{ marginBottom:10 }}>
                          <div style={{ fontSize:12,fontWeight:600,color:T.text,marginBottom:4 }}>{resp.name}{resp.unit?` (${resp.unit})`:""}</div>
                          <div style={{ display:"flex",gap:16,fontSize:11,color:T.text3 }}>
                            <span>Min: <strong style={{ color:T.text }}>{min.toFixed(2)}</strong></span>
                            <span>Max: <strong style={{ color:T.text }}>{max.toFixed(2)}</strong></span>
                            <span>Mean: <strong style={{ color:T.text }}>{avg.toFixed(2)}</strong></span>
                            <span>Std Dev: <strong style={{ color:T.text }}>{stdDev.toFixed(2)}</strong></span>
                            <span>N: <strong style={{ color:T.text }}>{vals.length}</strong></span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TAB: TRIALS ──────────────────────────────────────────────────────────────

function TrialsTab({ programId }) {
  const { orgId } = useAuth();
  const [trials, setTrials] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(()=>{ supabase.from("plm_manufacturing_trials").select("*").eq("org_id", orgId).eq("program_id",programId).order("created_at").then(({data})=>{setTrials(data||[]);setLoading(false);}); },[programId]);
  const add=async()=>{ const count=trials.length+1; const{data}=await supabase.from("plm_manufacturing_trials").insert({program_id:programId,trial_number:"T-"+String(count).padStart(3,"0"),name:"Trial "+count,trial_type:"lab_bench",status:"planned"}).select().single(); if(data){setTrials(p=>[...p,data]);setSelected(data);} };
  const update=async(field,val)=>{ await supabase.from("plm_manufacturing_trials").update({[field]:val}).eq("org_id", orgId).eq("id",selected.id); const u={...selected,[field]:val}; setSelected(u); setTrials(p=>p.map(x=>x.id===u.id?u:x)); };
  if(loading)return <div style={{ color:T.text3,fontSize:13 }}>Loading…</div>;
  return (
    <div className="plm-grid">
      <div style={{ borderRight:"1px solid "+T.border,paddingRight:16 }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10 }}>
          <div style={{ fontSize:11,fontWeight:700,color:T.text3,textTransform:"uppercase",letterSpacing:1 }}>Trials</div>
          <AddBtn onClick={add} label="New" />
        </div>
        {trials.length===0&&<EmptyState icon="🏭" text="No trials yet" />}
        {trials.map(t=><div key={t.id} onClick={()=>setSelected(t)} style={{ padding:"8px 10px",borderRadius:6,cursor:"pointer",marginBottom:4,background:selected?.id===t.id?T.accentDim:T.surface2,border:"1px solid "+(selected?.id===t.id?T.accent+"60":T.border) }}><div style={{ fontSize:11,color:T.accent,fontWeight:600 }}>{t.trial_number}</div><div style={{ fontSize:13,fontWeight:500,color:T.text }}>{t.name}</div><div style={{ fontSize:11,color:T.text3,marginTop:2 }}><StatusDot status={t.status} />{t.trial_type}</div></div>)}
      </div>
      <div>
        {!selected?<EmptyState icon="🏭" text="Select a trial" />:(
          <div>
            <InlineField label="Trial Name" value={selected.name} onChange={v=>update("name",v)} />
            <InlineField label="Type" value={selected.trial_type} onChange={v=>update("trial_type",v)} options={["lab_bench","pilot","scale_up","first_production","validation","process_optimization","troubleshooting","commercial"].map(t=>({value:t,label:t.replace(/_/g," ")}))} />
            <InlineField label="Status" value={selected.status} onChange={v=>update("status",v)} options={["planned","in_progress","completed","failed","cancelled"].map(s=>({value:s,label:s}))} />
            <InlineField label="Site" value={selected.site_name} onChange={v=>update("site_name",v)} placeholder="Manufacturing site" />
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
              <InlineField label="Batch Size" value={selected.batch_size} onChange={v=>update("batch_size",v)} type="number" />
              <InlineField label="Unit" value={selected.batch_size_unit} onChange={v=>update("batch_size_unit",v)} placeholder="kg / L" />
            </div>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
              <InlineField label="Planned Date" value={selected.planned_date} onChange={v=>update("planned_date",v)} type="date" />
              <InlineField label="Actual Date" value={selected.actual_date} onChange={v=>update("actual_date",v)} type="date" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TAB: REG CLAIMS ──────────────────────────────────────────────────────────

function RegClaimsTab({ programId }) {
  const { orgId } = useAuth();
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(()=>{ supabase.from("plm_claims").select("*").eq("org_id", orgId).eq("program_id",programId).order("priority").order("created_at").then(({data})=>{setClaims(data||[]);setLoading(false);}); },[programId]);
  const add=async()=>{ const{data}=await supabase.from("plm_claims").insert({program_id:programId,claim_text:"New claim",claim_type:"efficacy",status:"proposed"}).select().single(); if(data)setClaims(p=>[...p,data]); };
  if(loading)return <div style={{ color:T.text3,fontSize:13 }}>Loading…</div>;
  return (
    <div>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14 }}>
        <div style={{ fontSize:13,color:T.text2 }}>{claims.length} claim{claims.length!==1?"s":""}</div>
        <AddBtn onClick={add} label="Add Claim" />
      </div>
      {claims.length===0&&<EmptyState icon="✅" text="No regulatory claims yet" />}
      {claims.map(c=><ClaimRow key={c.id} claim={c} onUpdate={u=>setClaims(p=>p.map(x=>x.id===u.id?u:x))} onDelete={async()=>{await supabase.from("plm_claims").delete().eq("org_id", orgId).eq("id",c.id);setClaims(p=>p.filter(x=>x.id!==c.id));}} />)}
    </div>
  );
}

// ─── TAB: SKUs ────────────────────────────────────────────────────────────────

function SKUsTab({ programId }) {
  const { orgId } = useAuth();
  const [skus, setSkus] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(()=>{ supabase.from("plm_skus").select("*").eq("org_id", orgId).eq("program_id",programId).order("created_at").then(({data})=>{setSkus(data||[]);setLoading(false);}); },[programId]);
  const add=async()=>{ const count=skus.length+1; const{data}=await supabase.from("plm_skus").insert({program_id:programId,sku_code:"SKU-"+String(count).padStart(4,"0"),name:"New SKU",status:"draft"}).select().single(); if(data){setSkus(p=>[...p,data]);setSelected(data);} };
  const update=async(field,val)=>{ await supabase.from("plm_skus").update({[field]:val}).eq("org_id", orgId).eq("id",selected.id); const u={...selected,[field]:val}; setSelected(u); setSkus(p=>p.map(x=>x.id===u.id?u:x)); };
  if(loading)return <div style={{ color:T.text3,fontSize:13 }}>Loading…</div>;
  return (
    <div className="plm-grid">
      <div style={{ borderRight:"1px solid "+T.border,paddingRight:16 }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10 }}>
          <div style={{ fontSize:11,fontWeight:700,color:T.text3,textTransform:"uppercase",letterSpacing:1 }}>SKUs</div>
          <AddBtn onClick={add} label="New" />
        </div>
        {skus.length===0&&<EmptyState icon="📦" text="No SKUs yet" />}
        {skus.map(s=><div key={s.id} onClick={()=>setSelected(s)} style={{ padding:"8px 10px",borderRadius:6,cursor:"pointer",marginBottom:4,background:selected?.id===s.id?T.accentDim:T.surface2,border:"1px solid "+(selected?.id===s.id?T.accent+"60":T.border) }}><div style={{ fontSize:11,color:T.accent,fontWeight:600 }}>{s.sku_code}</div><div style={{ fontSize:13,fontWeight:500,color:T.text }}>{s.name}</div><div style={{ fontSize:11,color:T.text3,marginTop:2 }}><StatusDot status={s.status} />{s.status}</div></div>)}
      </div>
      <div>
        {!selected?<EmptyState icon="📦" text="Select a SKU to view details" />:(
          <div>
            <InlineField label="SKU Name" value={selected.name} onChange={v=>update("name",v)} />
            <InlineField label="SKU Code" value={selected.sku_code} onChange={v=>update("sku_code",v)} />
            <InlineField label="UPC / EAN" value={selected.upc_ean} onChange={v=>update("upc_ean",v)} />
            <InlineField label="Status" value={selected.status} onChange={v=>update("status",v)} options={["draft","pending_approval","approved","pilot_production","validated","active","limited_release","full_distribution","on_hold","discontinued"].map(s=>({value:s,label:s.replace(/_/g," ")}))} />
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
              <InlineField label="Net Weight" value={selected.net_weight} onChange={v=>update("net_weight",v)} type="number" />
              <InlineField label="Weight Unit" value={selected.weight_unit} onChange={v=>update("weight_unit",v)} placeholder="g / oz / ml" />
            </div>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
              <InlineField label="Target Retail ($)" value={selected.target_retail} onChange={v=>update("target_retail",v)} type="number" />
              <InlineField label="Unit COGS ($)" value={selected.unit_cogs} onChange={v=>update("unit_cogs",v)} type="number" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TAB: ISSUES ──────────────────────────────────────────────────────────────

function IssuesTab({ programId }) {
  const { isMobile } = useResponsive();
  const { orgId } = useAuth();
  const [issues, setIssues] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(()=>{ supabase.from("plm_issues").select("*").eq("org_id", orgId).eq("program_id",programId).order("created_at",{ascending:false}).then(({data})=>{setIssues(data||[]);setLoading(false);}); },[programId]);
  const add=async()=>{ const{data}=await supabase.from("plm_issues").insert({program_id:programId,title:"New Issue",issue_type:"formulation",severity:"minor",status:"open",org_id:orgId}).select().single(); if(data){setIssues(p=>[data,...p]);setSelected(data);} };
  const update=async(field,val)=>{ await supabase.from("plm_issues").update({[field]:val}).eq("org_id", orgId).eq("id",selected.id); const u={...selected,[field]:val}; setSelected(u); setIssues(p=>p.map(x=>x.id===u.id?u:x)); };
  const sc={critical:"#ef4444",high:"#f97316",medium:"#eab308",low:"#22c55e"};
  if(loading)return <div style={{ color:T.text3,fontSize:13 }}>Loading…</div>;
  return (
    <div style={{ display:"grid",gridTemplateColumns:isMobile ? "1fr" : "260px 1fr",gap:16 }}>
      <div style={{ borderRight:"1px solid "+T.border,paddingRight:16 }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10 }}>
          <div style={{ fontSize:11,fontWeight:700,color:T.text3,textTransform:"uppercase",letterSpacing:1 }}>Issues</div>
          <AddBtn onClick={add} label="New" />
        </div>
        {issues.length===0&&<EmptyState icon="⚠️" text="No issues" />}
        {issues.map(i=><div key={i.id} onClick={()=>setSelected(i)} style={{ padding:"8px 10px",borderRadius:6,cursor:"pointer",marginBottom:4,background:selected?.id===i.id?T.accentDim:T.surface2,border:"1px solid "+(selected?.id===i.id?T.accent+"60":T.border) }}><div style={{ display:"flex",gap:6,alignItems:"center",marginBottom:2 }}><span style={{ width:7,height:7,borderRadius:"50%",background:sc[i.severity]||"#8b93a8",flexShrink:0 }} /><div style={{ fontSize:13,fontWeight:500,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{i.title}</div></div><div style={{ fontSize:11,color:T.text3 }}>{i.issue_type} · {i.status}</div></div>)}
      </div>
      <div>
        {!selected?<EmptyState icon="⚠️" text="Select an issue" />:(
          <div>
            <InlineField label="Title" value={selected.title} onChange={v=>update("title",v)} />
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
              <InlineField label="Type" value={selected.issue_type} onChange={v=>update("issue_type",v)} options={["formulation","process","stability","quality","regulatory","supply_chain","equipment","packaging","labeling","safety","efficacy","consumer_complaint","deviation","capa","other"].map(t=>({value:t,label:t.replace(/_/g," ")}))} />
              <InlineField label="Severity" value={selected.severity} onChange={v=>update("severity",v)} options={["critical","major","minor","observation"].map(s=>({value:s,label:s}))} />
            </div>
            <InlineField label="Status" value={selected.status} onChange={v=>update("status",v)} options={["open","investigating","root_cause_identified","corrective_action","verification","closed","deferred"].map(s=>({value:s,label:s.replace(/_/g," ")}))} />
            <InlineField label="Description" value={selected.description} onChange={v=>update("description",v)} multiline placeholder="Describe the issue…" />
            <InlineField label="Root Cause" value={selected.root_cause} onChange={v=>update("root_cause",v)} multiline placeholder="Root cause analysis…" />
            <InlineField label="Corrective Action" value={selected.corrective_action} onChange={v=>update("corrective_action",v)} multiline placeholder="Corrective action plan…" />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TAB: TEST RESULTS ────────────────────────────────────────────────────────

function TestResultsTab({ programId }) {
  const { orgId } = useAuth();
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(()=>{ supabase.from("plm_test_results").select("*").eq("org_id", orgId).eq("program_id",programId).order("tested_date",{ascending:false}).then(({data})=>{setResults(data||[]);setLoading(false);}); },[programId]);
  const add=async()=>{ const{data}=await supabase.from("plm_test_results").insert({program_id:programId,test_name:"New Test",test_category:"physical",status:"pending"}).select().single(); if(data)setResults(p=>[data,...p]); };
  if(loading)return <div style={{ color:T.text3,fontSize:13 }}>Loading…</div>;
  return (
    <div>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14 }}>
        <div style={{ fontSize:13,color:T.text2 }}>{results.length} result{results.length!==1?"s":""}</div>
        <AddBtn onClick={add} label="Add Result" />
      </div>
      {results.length===0&&<EmptyState icon="📋" text="No test results yet" />}
      <table style={{ width:"100%",borderCollapse:"collapse" }}>
        <thead><tr style={{ borderBottom:"1px solid "+T.border }}>{["Test Name","Category","Spec","Result","Status","Date"].map(h=><th key={h} style={{ padding:"6px 10px",textAlign:"left",fontSize:10,fontWeight:700,color:T.text3,textTransform:"uppercase" }}>{h}</th>)}</tr></thead>
        <tbody>
          {results.map(r=>{const sc=STATUS_COLORS[r.status]||"#8b93a8";return(
            <tr key={r.id} style={{ borderBottom:"1px solid "+T.border }}>
              <td style={{ padding:"8px 10px",fontSize:13,color:T.text,fontWeight:500 }}>{r.test_name}</td>
              <td style={{ padding:"8px 10px",fontSize:12,color:T.text2 }}>{r.test_category}</td>
              <td style={{ padding:"8px 10px",fontSize:12,color:T.text3 }}>{r.specification||"-"}</td>
              <td style={{ padding:"8px 10px",fontSize:12,color:T.text,fontWeight:600 }}>{r.result_value!=null?r.result_value+" "+(r.result_unit||""):r.result_text||"-"}</td>
              <td style={{ padding:"8px 10px" }}><span style={{ fontSize:10,fontWeight:700,color:sc,background:sc+"20",padding:"2px 7px",borderRadius:4 }}>{r.status?.toUpperCase()}</span></td>
              <td style={{ padding:"8px 10px",fontSize:11,color:T.text3 }}>{r.tested_date||"-"}</td>
            </tr>
          );})}
        </tbody>
      </table>
    </div>
  );
}

// ─── TAB: GATE REVIEWS ────────────────────────────────────────────────────────

function GateReviewsTab({ programId }) {
  const { orgId } = useAuth();
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(()=>{ supabase.from("plm_gate_reviews").select("*").eq("org_id", orgId).eq("program_id",programId).order("review_date",{ascending:false}).then(({data})=>{setReviews(data||[]);setLoading(false);}); },[programId]);
  const dc={approved:"#22c55e",rejected:"#ef4444",conditional:"#eab308",deferred:"#8b93a8"};
  if(loading)return <div style={{ color:T.text3,fontSize:13 }}>Loading…</div>;
  return (
    <div>
      {reviews.length===0&&<EmptyState icon="🚦" text="No gate reviews recorded yet" />}
      {reviews.map(r=>(
        <div key={r.id} style={{ padding:"14px 16px",background:T.surface2,border:"1px solid "+T.border,borderRadius:8,marginBottom:10 }}>
          <div style={{ display:"flex",justifyContent:"space-between",alignItems:"flex-start" }}>
            <div><div style={{ fontSize:14,fontWeight:600,color:T.text }}>{r.from_stage} → {r.to_stage}</div><div style={{ fontSize:12,color:T.text3,marginTop:2 }}>{r.review_date||"Date TBD"}</div></div>
            {r.decision&&<span style={{ fontSize:11,fontWeight:700,color:dc[r.decision]||"#8b93a8",background:(dc[r.decision]||"#8b93a8")+"20",padding:"3px 10px",borderRadius:5 }}>{r.decision.toUpperCase()}</span>}
          </div>
          {r.meeting_notes&&<div style={{ marginTop:10,fontSize:13,color:T.text2,lineHeight:1.6,borderTop:"1px solid "+T.border,paddingTop:10 }}>{r.meeting_notes}</div>}
        </div>
      ))}
    </div>
  );
}


// ─── AI ADVISOR TAB ──────────────────────────────────────────────────────────

// ── Share Dropdown for AI Conversations ─────────────────────────────────────
function ShareDropdown({ conversationId, onClose }) {
  const { orgId } = useAuth();
  const [users, setUsers] = useState([]);
  const [shares, setShares] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const dropRef = useRef(null);

  useEffect(() => {
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const myId = session?.user?.id;
      const { data: profiles } = await supabase.from("profiles").select("id, display_name, email").eq("org_id", orgId).not("id", "eq", myId);
      setUsers(profiles || []);
      const { data: existing } = await supabase.from("plm_ai_shares").select("*").eq("conversation_id", conversationId);
      setShares(existing || []);
      setLoading(false);
    };
    load();
    const handleClick = (e) => { if (dropRef.current && !dropRef.current.contains(e.target)) onClose(); };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [conversationId]);

  const shareWith = async (userId) => {
    const { data: { session } } = await supabase.auth.getSession();
    const myId = session?.user?.id;
    if (shares.find(s => s.shared_with === userId)) return;
    const { data } = await supabase.from("plm_ai_shares").insert({
      conversation_id: conversationId, shared_with: userId, shared_by: myId,
    }).select().single();
    if (data) setShares(p => [...p, data]);
  };

  const removeShare = async (shareId) => {
    await supabase.from("plm_ai_shares").delete().eq("id", shareId);
    setShares(p => p.filter(s => s.id !== shareId));
  };

  const sharedUserIds = new Set(shares.map(s => s.shared_with));
  const filtered = users.filter(u =>
    !sharedUserIds.has(u.id) && (!search || u.display_name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div ref={dropRef} style={{ position: "absolute", top: "100%", right: 0, marginTop: 4, zIndex: 100, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, boxShadow: "0 8px 24px rgba(0,0,0,0.15)", width: 280, padding: 0 }}>
      <div style={{ padding: "10px 12px", borderBottom: `1px solid ${T.border}`, fontSize: 12, fontWeight: 700, color: T.text }}>Share Conversation</div>
      
      {/* Currently shared with */}
      {shares.length > 0 && (
        <div style={{ padding: "8px 12px", borderBottom: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, marginBottom: 6 }}>SHARED WITH</div>
          {shares.map(s => {
            const u = users.find(x => x.id === s.shared_with);
            return (
              <div key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "4px 0" }}>
                <span style={{ fontSize: 12, color: T.text }}>{u?.display_name || u?.email || "User"}</span>
                <button onClick={() => removeShare(s.id)} style={{ background: "none", border: "none", color: "#ef4444", cursor: "pointer", fontSize: 11, padding: "2px 6px" }}>Remove</button>
              </div>
            );
          })}
        </div>
      )}

      {/* Search and add */}
      <div style={{ padding: "8px 12px" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search team members..."
          autoFocus style={{ width: "100%", padding: "6px 10px", fontSize: 12, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, color: T.text, outline: "none", boxSizing: "border-box", marginBottom: 6 }} />
        <div style={{ maxHeight: 150, overflow: "auto" }}>
          {loading ? <div style={{ fontSize: 11, color: T.text3 }}>Loading...</div> :
            filtered.length === 0 ? <div style={{ fontSize: 11, color: T.text3, padding: "8px 0" }}>{users.length === 0 ? "No other team members" : "No matches"}</div> :
            filtered.map(u => (
              <div key={u.id} onClick={() => shareWith(u.id)}
                style={{ padding: "6px 8px", borderRadius: 4, cursor: "pointer", fontSize: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}
                onMouseEnter={e => e.currentTarget.style.background = T.surface2}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <div>
                  <div style={{ color: T.text, fontWeight: 500 }}>{u.display_name || "-"}</div>
                  {u.email && <div style={{ fontSize: 10, color: T.text3 }}>{u.email}</div>}
                </div>
                <span style={{ fontSize: 10, color: T.accent, fontWeight: 600 }}>+ Share</span>
              </div>
            ))
          }
        </div>
      </div>
    </div>
  );
}

// Website and evidence links for an AI-found supplier ("Source: <url>" is stored in notes).
function SupplierLinks({ s }) {
  const src = /^Source: (https?:\/\/\S+)/.exec(s.notes || "")?.[1];
  if (!src && !s.supplier_website) return s.source === "ai_search" ? <div style={{ marginTop: 4, color: "#eab308" }}>Not verified on the web (older search)</div> : null;
  const a = { color: T.accent, textDecoration: "underline" };
  return <div style={{ marginTop: 4, display: "flex", gap: 10, flexWrap: "wrap" }}>
    {s.supplier_website && <a href={s.supplier_website} target="_blank" rel="noopener noreferrer" style={a}>Website</a>}
    {src && src !== s.supplier_website && <a href={src} target="_blank" rel="noopener noreferrer" style={a}>Source</a>}
  </div>;
}

// The R&D Advisor's three modes share one engine (helm-api /rd-advisor); the mode
// changes its focus, research budget and suggestions.
const ADVISOR_MODES = {
  chemist: {
    label: "Chemist", title: "Formulation chemist", icon: "flask",
    desc: "A PhD-level detergent chemist for fabrics, dishes, surfaces and stain removal: enzymes, surfactants, builders, bleach and polymers. Reads your formulas and test results, runs the numbers, and designs experiments",
    placeholder: "Ask about a formula, a stain, a dissolution or stability problem, a claim, a DOE…",
    busy: "Reading your formulas and working it through",
    suggestions: [
      "Our sheets aren't dissolving fully in cold water. What should we investigate first?",
      "Analyse our latest formula: surfactant load, cost per unit and any ingredient flags",
      "Which enzymes would lift grass, blood and sebum stains in a 20°C wash, and how do we keep them stable in a sheet?",
      "Design a DOE for PVOH grade, glycerin and surfactant load against dissolution time and tensile strength",
      "How can we take 15% out of raw material cost without losing stain removal?",
      "What do we need to change to make our dish tablet phosphate-free and still pass filming tests in hard water?",
    ],
  },
  sourcing: {
    label: "Sourcing", title: "Sourcing lead", icon: "search",
    desc: "Finds and verifies contract manufacturers and ingredient suppliers on the web, checks certifications against your claims, and saves the good ones to Helm",
    placeholder: "Ask for manufacturers, suppliers, grades, certifications…",
    busy: "Searching and checking suppliers (this can take a minute or two)",
    suggestions: [
      "Find contract manufacturers in the US that can cast PVOH detergent sheets",
      "Who makes MGDA and GLDA, and which grades are on the Safer Choice CleanGredients list?",
      "Find tablet press contract manufacturers for automatic dishwasher tablets in Australia",
      "Find low 1,4-dioxane SLES suppliers and what test data they publish",
      "Shortlist enzyme suppliers with granulated protease and amylase for powders and tablets",
    ],
  },
  rfp: {
    label: "RFP & quotes", title: "Procurement lead", icon: "note",
    desc: "Writes RFPs that get comparable bids, and compares quotes on landed cost per unit with the freight, duty and currency assumptions spelled out",
    placeholder: "Ask to draft an RFP section, or to compare quotes at a volume…",
    busy: "Working through the RFP and quotes",
    suggestions: [
      "Draft the performance and testing section of an RFP for a laundry sheet contract manufacturer",
      "Compare the quotes on our RFP at 500,000 units with $0.02 freight per unit and 6.5% duty",
      "What should we ask suppliers so their quotes are comparable when we don't know volume yet?",
    ],
  },
};

function AIAgentTab({ program }) {
  const { isMobile } = useResponsive();
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [showShare, setShowShare] = useState(false);
  const [mode, setMode] = useState(() => { try { const m = localStorage.getItem("plm.advisorMode"); return ADVISOR_MODES[m] ? m : "chemist"; } catch { return "chemist"; } });
  const pickMode = (m) => { setMode(m); try { localStorage.setItem("plm.advisorMode", m); } catch {} };
  const [printingChat, setPrintingChat] = useState(false);
  const chatRef = useRef(null);

  const SUGGESTIONS = ADVISOR_MODES[mode].suggestions;

  // Load conversations
  useEffect(() => {
    const load = async () => {
      let q = supabase.from("plm_ai_conversations").select("*").order("updated_at", { ascending: false });
      if (program) q = q.eq("program_id", program.id);
      const { data } = await q;
      setConversations(data || []);
      setLoadingConvs(false);
    };
    load();
  }, [program?.id]);

  // Load messages when conversation selected
  const justCreated = useRef(null);
  useEffect(() => {
    if (!activeConvId) { setMessages([]); return; }
    // A conversation that was just created from this screen already shows its messages.
    if (justCreated.current === activeConvId) { justCreated.current = null; return; }
    supabase.from("plm_ai_messages").select("*").eq("conversation_id", activeConvId)
      .order("created_at").then(({ data }) => {
        setMessages((data || []).map(m => ({ role: m.role, text: m.content, tokens: m.tokens_in ? { input_tokens: m.tokens_in, output_tokens: m.tokens_out } : null, duration: m.duration_ms })));
        setTimeout(() => chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight }), 100);
      });
  }, [activeConvId]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setMessages(p => [...p, { role: "user", text: userMsg }]);
    setLoading(true);

    try {
      const data = await askAdvisor({
        question: userMsg,
        conversation_id: activeConvId || undefined,
        program_id: program?.id || undefined,
        mode,
        history: messages.map(m => ({ role: m.role, content: m.text })),
      });
      if (data.success) {
        setMessages(p => [...p, { role: "assistant", text: data.response, tokens: data.usage, duration: data.duration_ms, createdItems: data.created_items, mode: data.mode || mode }]);
        if (!activeConvId && data.conversation_id) {
          justCreated.current = data.conversation_id;
          setActiveConvId(data.conversation_id);
          setConversations(p => [{ id: data.conversation_id, title: userMsg.slice(0, 80), updated_at: new Date().toISOString() }, ...p]);
        }
      } else {
        setMessages(p => [...p, { role: "assistant", text: `Error: ${data.error}`, isError: true }]);
      }
    } catch (e) {
      setMessages(p => [...p, { role: "assistant", text: `Error: ${String(e)}`, isError: true }]);
    }
    setLoading(false);
    setTimeout(() => chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" }), 100);
  };

  const startNew = () => { setActiveConvId(null); setMessages([]); };

  const deleteConv = async (id) => {
    await supabase.from("plm_ai_messages").delete().eq("conversation_id", id);
    await supabase.from("plm_ai_conversations").delete().eq("id", id);
    setConversations(p => p.filter(c => c.id !== id));
    if (activeConvId === id) startNew();
  };

  const activeMode = ADVISOR_MODES[mode];

  if (printingChat) return (
    <Suspense fallback={<div style={{ padding: 40, color: T.text3 }}>Loading print view...</div>}>
      <PrintAIChat conversationId={activeConvId} messages={messages} mode={mode} programName={program?.name} onClose={() => setPrintingChat(false)} />
    </Suspense>
  );

  return (
    <div style={{ display: "flex", height: "calc(100vh - 260px)", gap: 0 }}>
      {/* Conversation sidebar */}
      <div style={{ width: 220, borderRight: `1px solid ${T.border}`, display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "10px 12px", borderBottom: `1px solid ${T.border}` }}>
          <button onClick={startNew} style={{ width: "100%", padding: "8px 12px", fontSize: 12, fontWeight: 700, background: T.accent, color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
            + New Conversation
          </button>
        </div>
        <div style={{ flex: 1, overflow: "auto", padding: "8px" }}>
          {loadingConvs ? <div style={{ fontSize: 12, color: T.text3, padding: 8 }}>Loading...</div> :
            conversations.length === 0 ? <div style={{ fontSize: 12, color: T.text3, padding: 8, lineHeight: 1.5 }}>No conversations yet. Start one!</div> :
            conversations.map(c => (
              <div key={c.id} onClick={() => setActiveConvId(c.id)}
                style={{ padding: "8px 10px", borderRadius: 6, cursor: "pointer", marginBottom: 3,
                  background: activeConvId === c.id ? T.accentDim : "transparent",
                  border: `1px solid ${activeConvId === c.id ? T.accent + "60" : "transparent"}` }}>
                <div style={{ fontSize: 12, fontWeight: 500, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.title}</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 3 }}>
                  <span style={{ fontSize: 10, color: T.text3 }}>{new Date(c.updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                  <button onClick={e => { e.stopPropagation(); deleteConv(c.id); }} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 10, padding: "0 2px" }}>✕</button>
                </div>
              </div>
            ))
          }
        </div>
      </div>

      {/* Chat area */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ padding: "6px 16px", borderBottom: `1px solid ${T.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0, flexWrap: "wrap" }}>
            <Seg value={mode} options={Object.entries(ADVISOR_MODES).map(([k, m]) => [k, m.label])} onChange={pickMode} />
            {program && <span style={{ fontSize: 11, color: T.text3 }}>{program.name}</span>}
          </div>
          {activeConvId && (
            <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 6 }}>
              <button onClick={() => setPrintingChat(true)} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text3, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                🖨 Export
              </button>
              <button onClick={() => setShowShare(!showShare)} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text3, cursor: "pointer" }}>
                Share
              </button>
              {showShare && <ShareDropdown conversationId={activeConvId} onClose={() => setShowShare(false)} />}
            </div>
          )}
          {!activeConvId && messages.length > 0 && (
            <button onClick={() => setPrintingChat(true)} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text3, cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
              🖨 Export
            </button>
          )}
        </div>

        {/* Messages */}
        <div ref={chatRef} style={{ flex: 1, overflow: "auto", padding: "16px", display: "flex", flexDirection: "column", gap: 12 }}>
          {messages.length === 0 && (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: "var(--accent-soft)", color: "var(--accent-ink)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name={activeMode.icon} size={26} /></div>
              <div style={{ fontSize: 18, fontWeight: 700, color: T.text }}>{activeMode.title}</div>
              <div style={{ fontSize: 13, color: T.text3, textAlign: "center", maxWidth: 520, lineHeight: 1.7 }}>
                {activeMode.desc}
                {program ? `. Context: ${program.name}.` : ""}
              </div>
              <div style={{ fontSize: 12, color: T.text3, marginTop: 8 }}>Try asking:</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, maxWidth: isMobile ? "95vw" : 520, width: "100%" }}>
                {SUGGESTIONS.map((q, i) => (
                  <button key={i} onClick={() => setInput(q)} style={{ padding: "8px 14px", borderRadius: 8, border: `1px solid ${T.border}`,
                    background: T.surface2, color: T.text2, fontSize: 12, cursor: "pointer", textAlign: "left", lineHeight: 1.5 }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = T.accent}
                    onMouseLeave={e => e.currentTarget.style.borderColor = T.border}>{q}</button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} style={{ display: "flex", gap: 10, flexDirection: msg.role === "user" ? "row-reverse" : "row" }}>
              <div style={{ width: 28, height: 28, borderRadius: 14, background: msg.role === "user" ? T.accent + "30" : "#8b5cf620",
                display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, flexShrink: 0,
                color: msg.role === "user" ? T.accent : "#8b5cf6" }}>
                {msg.role === "user" ? "You" : <Icon name={(ADVISOR_MODES[msg.mode] || activeMode).icon} size={14} />}
              </div>
              <div style={{ maxWidth: "85%", padding: "10px 14px", borderRadius: 12,
                background: msg.role === "user" ? T.accentDim : msg.isError ? "#ef444415" : T.surface2,
                border: `1px solid ${msg.isError ? "#ef444440" : T.border}` }}>
                <div style={{ fontSize: 13, color: msg.isError ? "#ef4444" : T.text, lineHeight: 1.7, wordBreak: "break-word" }}>{msg.role === "user" ? <span style={{ whiteSpace: "pre-wrap" }}>{msg.text}</span> : renderMarkdown(msg.text)}</div>
                {msg.createdItems && msg.createdItems.length > 0 && (
                  <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                    {msg.createdItems.map((item, ci) => (
                      <div key={ci} style={{ padding: "6px 10px", borderRadius: 6, background: "#22c55e15", border: "1px solid #22c55e40", fontSize: 11, display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontWeight: 600, color: "#22c55e" }}>{item.tool === "save_supplier" ? "Saved:" : "Created:"}</span>
                        <span style={{ color: T.text }}>{item.result?.message || item.result?.name || "Item created"}</span>
                      </div>
                    ))}
                  </div>
                )}
                {msg.tokens && (
                  <div style={{ fontSize: 10, color: T.text3, marginTop: 6, display: "flex", gap: 8 }}>
                    <span>{msg.tokens.input_tokens + msg.tokens.output_tokens} tokens</span>
                    {msg.duration && <span>{(msg.duration / 1000).toFixed(1)}s</span>}
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
              <div style={{ width: 28, height: 28, borderRadius: 14, background: "#8b5cf620", color: "#8b5cf6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}><Icon name={activeMode.icon} size={14} /></div>
              <div style={{ padding: "10px 14px", borderRadius: 12, background: T.surface2, border: `1px solid ${T.border}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 13, color: T.text3 }}>{activeMode.busy}</span>
                  <span style={{ display: "inline-flex", gap: 3 }}>
                    {[0, 1, 2].map(j => <span key={j} style={{ width: 4, height: 4, borderRadius: 2, background: T.text3, animation: `pulse 1.4s ease-in-out ${j * 0.2}s infinite` }} />)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div style={{ flexShrink: 0, borderTop: `1px solid ${T.border}`, padding: "12px 16px" }}>
          <div style={{ display: "flex", gap: 8 }}>
            <textarea value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
              placeholder={activeMode.placeholder}
              rows={2}
              style={{ flex: 1, padding: "10px 14px", borderRadius: 10, border: `1px solid ${T.border}`,
                background: T.surface2, color: T.text, fontSize: 13, outline: "none", fontFamily: "inherit", resize: "none" }} />
            <button onClick={sendMessage} disabled={loading || !input.trim()}
              style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: T.accent,
                color: "#fff", fontSize: 13, fontWeight: 700, cursor: loading ? "wait" : "pointer",
                opacity: !input.trim() ? 0.4 : 1, alignSelf: "flex-end" }}>
              Send
            </button>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
            <div style={{ fontSize: 10, color: T.text3 }}>
              {program ? `Context: ${program.name}` : "All programs"} · Answers about outside companies are checked on the web and linked · Shift+Enter for a new line
            </div>
            {messages.length > 0 && !activeConvId && (
              <span style={{ fontSize: 10, color: T.text3 }}>Conversation will save on first response</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


const DETAIL_TABS = [
  { key:"overview",      label:"Overview"       },
  { key:"linked_work",   label:"🔗 Projects"  },
  { key:"ai_agent",      label:"\u{1F916} AI Agent"    },
  { key:"claims_sub",    label:"Claims & Evidence"},
  { key:"formulations",  label:"Formulations"   },
  { key:"sourcing",      label:"🤝 Sourcing"    },
  { key:"gm_scenarios",  label:"GM% Scenarios"  },
  { key:"experiments",   label:"Experiments"    },
  { key:"trials",        label:"Trials"         },
  { key:"reg_claims",    label:"Reg Claims"     },
  { key:"skus",          label:"SKUs"           },
  { key:"issues",        label:"Issues"         },
  { key:"test_results",  label:"Test Results"   },
  { key:"gate_reviews",  label:"Gate Reviews"   },
];

function LinkedWorkTab({ programId, navigateTo, navigateToProject }) {
  const { orgId } = useAuth();
  const [projects, setProjects] = useState(null);
  const [projMap, setProjMap]   = useState({});
  const [tasks, setTasks]       = useState([]);
  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ data: allPr }, { data: tk }] = await Promise.all([
        supabase.from("projects").select("id,name,status,color,target_end_date,plm_program_id").eq("org_id", orgId).is("deleted_at", null),
        supabase.from("tasks").select("id,title,status,priority,due_date,project_id").eq("org_id", orgId).eq("plm_program_id", programId).is("deleted_at", null).limit(500),
      ]);
      if (!alive) return;
      const linked = (allPr || []).filter(p => p.plm_program_id === programId).sort((a,b)=>(a.name||"").localeCompare(b.name||""));
      const map = {}; (allPr || []).forEach(p => { map[p.id] = p.name; });
      setProjects(linked); setProjMap(map); setTasks(tk || []);
    })();
    return () => { alive = false; };
  }, [programId, orgId]);

  const PSTATUS = { active:["#22c55e","Active"], on_hold:["#eab308","On Hold"], completed:["#3b82f6","Completed"], archived:["#6b7280","Archived"] };
  const TSTATUS = { todo:["#6b7280","To Do"], in_progress:["#3b82f6","In Progress"], in_review:["#8b5cf6","In Review"], blocked:["#ef4444","Blocked"], done:["#22c55e","Done"], cancelled:["#6b7280","Cancelled"] };
  const pill = (def) => { const [c,l] = def; return <span style={{ fontSize:10,fontWeight:700,background:c+"18",color:c,padding:"2px 8px",borderRadius:4,whiteSpace:"nowrap" }}>{l}</span>; };

  if (projects === null) return <div style={{ color:T.text3,fontSize:13 }}>Loading linked work…</div>;

  return (
    <div style={{ display:"flex",flexDirection:"column",gap:24,maxWidth:820 }}>
      <div>
        <div style={{ fontSize:13,fontWeight:700,color:T.text,marginBottom:8 }}>Linked projects <span style={{ color:T.text3,fontWeight:500 }}>({projects.length})</span></div>
        {projects.length === 0 ? (
          <div style={{ fontSize:12,color:T.text3,padding:"4px 0 8px" }}>No projects linked yet. In Projects, open a project, edit it, and set <b style={{color:T.text2}}>Link to PLM Product</b> to this program.</div>
        ) : projects.map(p => (
          <div key={p.id} onClick={() => navigateToProject && navigateToProject(p.id)}
            style={{ display:"flex",alignItems:"center",gap:10,padding:"10px 12px",border:"1px solid "+T.border,borderRadius:8,marginBottom:8,cursor:navigateToProject?"pointer":"default",background:T.surface2 }}
            onMouseEnter={e=>{ if(navigateToProject) e.currentTarget.style.background=T.surface3; }} onMouseLeave={e=>{ e.currentTarget.style.background=T.surface2; }}>
            <div style={{ width:10,height:10,borderRadius:3,background:p.color||T.accent,flexShrink:0 }} />
            <div style={{ flex:1,minWidth:0 }}>
              <div style={{ fontSize:13,fontWeight:600,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{p.name}</div>
              {p.target_end_date && <div style={{ fontSize:11,color:T.text3 }}>Target: {p.target_end_date}</div>}
            </div>
            {pill(PSTATUS[p.status] || ["#6b7280", p.status || "-"])}
            {navigateToProject && <span style={{ color:T.text3,fontSize:14 }}>→</span>}
          </div>
        ))}
      </div>
      <div>
        <div style={{ fontSize:13,fontWeight:700,color:T.text,marginBottom:8 }}>Linked tasks <span style={{ color:T.text3,fontWeight:500 }}>({tasks.length})</span></div>
        {tasks.length === 0 ? (
          <div style={{ fontSize:12,color:T.text3,padding:"4px 0 8px" }}>No tasks linked yet. Open a task, edit it, and set its <b style={{color:T.text2}}>Link to PLM Product</b> to this program.</div>
        ) : tasks.map(t => (
          <div key={t.id} onClick={() => navigateTo && navigateTo("projects", t.id)}
            style={{ display:"flex",alignItems:"center",gap:10,padding:"9px 12px",border:"1px solid "+T.border,borderRadius:8,marginBottom:6,cursor:navigateTo?"pointer":"default",background:T.surface2 }}
            onMouseEnter={e=>{ if(navigateTo) e.currentTarget.style.background=T.surface3; }} onMouseLeave={e=>{ e.currentTarget.style.background=T.surface2; }}>
            <div style={{ flex:1,minWidth:0 }}>
              <div style={{ fontSize:13,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{t.title}</div>
              {projMap[t.project_id] && <div style={{ fontSize:11,color:T.text3 }}>{projMap[t.project_id]}</div>}
            </div>
            {pill(TSTATUS[t.status] || ["#6b7280", t.status || "-"])}
            {navigateTo && <span style={{ color:T.text3,fontSize:14 }}>→</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// Wraps PLM in the shared component styles (same primitives as the new Projects), coloured from the Helm theme.
function PlmShell({ children }) {
  const { mode, tokens } = useTheme();
  const m = mode === "dark" ? "dark" : "light";
  const theme = { mode: m, vars: themeVars(tokens, m === "dark") };
  return <ModeProvider value={theme}><style dangerouslySetInnerHTML={{ __html: PLM_CSS + PLM_HOME_CSS }} /><div className="hw plm" data-mode={m} style={theme.vars}>{children}</div></ModeProvider>;
}
// Tab labels used to carry emoji; the new look is text only.
const plainLabel = (l) => String(l).replace(/^[^A-Za-z0-9]+/, "");

// The 14 program sections, grouped into seven tabs.
const PROGRAM_GROUPS = [
  { key:"overview",  label:"Overview",  sections:["overview"] },
  { key:"projects",  label:"Projects",  sections:["linked_work"] },
  { key:"formulate", label:"Formulate", sections:["formulations","experiments","trials"] },
  { key:"source",    label:"Source",    sections:["sourcing","gm_scenarios"] },
  { key:"prove",     label:"Prove",     sections:["claims_sub","reg_claims","test_results"] },
  { key:"launch",    label:"Launch",    sections:["skus","issues","gate_reviews"] },
  { key:"ai",        label:"AI agent",  sections:["ai_agent"] },
];
const SECTION_LABEL = Object.fromEntries(DETAIL_TABS.map(t=>[t.key, plainLabel(t.label)]));
const SECTION_COUNT = { formulations:"formulations", experiments:"experiments", trials:"trials", skus:"skus", issues:"issues", claims_sub:"claims" };

function ProgramDetail({ program, onBack, onUpdate, onDelete, navigateTo, navigateToProject, linkCount }) {
  const { orgId } = useAuth();
  const [tab, setTab] = useState("overview");
  const [lastIn, setLastIn] = useState({});
  const [counts, setCounts] = useState({});

  useEffect(()=>{
    const load=async()=>{
      const[{count:formulations},{count:experiments},{count:trials},{count:skus},{count:claims},{count:issues}]=await Promise.all([
        supabase.from("plm_formulations").select("*",{count:"exact",head:true}).eq("org_id", orgId).eq("program_id",program.id),
        supabase.from("plm_experiments").select("*",{count:"exact",head:true}).eq("org_id", orgId).eq("program_id",program.id),
        supabase.from("plm_manufacturing_trials").select("*",{count:"exact",head:true}).eq("org_id", orgId).eq("program_id",program.id),
        supabase.from("plm_skus").select("*",{count:"exact",head:true}).eq("org_id", orgId).eq("program_id",program.id),
        supabase.from("plm_claims").select("*",{count:"exact",head:true}).eq("org_id", orgId).eq("program_id",program.id),
        supabase.from("plm_issues").select("*",{count:"exact",head:true}).eq("org_id", orgId).eq("program_id",program.id),
      ]);
      setCounts({formulations,experiments,trials,skus,claims,issues});
    };
    load();
  },[program.id]);

  const group = PROGRAM_GROUPS.find(g=>g.sections.includes(tab)) || PROGRAM_GROUPS[0];
  const goto = (section) => { const g = PROGRAM_GROUPS.find(x=>x.sections.includes(section)); if (g) setLastIn(p=>({ ...p, [g.key]: section })); setTab(section); };
  const openGroup = (g) => setTab(lastIn[g.key] || g.sections[0]);

  const renderTab=()=>{
    switch(tab){
      case "overview":     return <OverviewTab program={program} onUpdate={onUpdate} counts={counts} goto={goto} navigateToProject={navigateToProject} />;
      case "linked_work":  return <LinkedWorkTab programId={program.id} navigateTo={navigateTo} navigateToProject={navigateToProject} />;
      case "ai_agent":     return <AIAgentTab program={program} />;
      case "claims_sub":   return <ClaimsSubstantiationTab program={program} onUpdate={onUpdate} />;
      case "gm_scenarios": return <GMScenarioTab program={program} />;
      case "formulations": return <FormulationsTab programId={program.id} />;
      case "sourcing":     return <Suspense fallback={<div style={{padding:30,color:T.text3}}>Loading sourcing…</div>}><PLMSourcingTab program={program} /></Suspense>;
      case "experiments":  return <ExperimentsTab programId={program.id} />;
      case "trials":       return <TrialsTab programId={program.id} />;
      case "reg_claims":   return <RegClaimsTab programId={program.id} />;
      case "skus":         return <SKUsTab programId={program.id} />;
      case "issues":       return <IssuesTab programId={program.id} />;
      case "test_results": return <TestResultsTab programId={program.id} />;
      case "gate_reviews": return <GateReviewsTab programId={program.id} />;
      default:             return null;
    }
  };

  const stage = STAGE_MAP[program.current_stage];
  const next = STAGES[STAGES.findIndex(s=>s.key===program.current_stage)+1];
  const moveNext = async () => { if(!next||!confirm(`Move "${program.name}" to ${next.label}?`))return; await supabase.from("plm_programs").update({current_stage:next.key}).eq("org_id", orgId).eq("id",program.id); onUpdate({...program,current_stage:next.key}); };
  return (
    <PlmShell>
      <div className="plm-top">
        <button className="hw-btn ghost sm" style={{ marginLeft:-8 }} onClick={onBack}><Icon name="chevL" size={14} />All programs</button>
        <div style={{ display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",minHeight:36,marginTop:2 }}>
          <span style={{ width:28,height:28,borderRadius:8,background:stage?.color||T.accent,flex:"none" }} />
          <h1 className="hw-trunc">{program.name}</h1>
          <StageBadge stage={program.current_stage} />
          <PriorityBadge priority={program.priority} />
          {program.code&&<span style={{ fontSize:12,color:T.text3 }}>{program.code}</span>}
          <span style={{ flex:1 }} />
          {onDelete && <button className="hw-btn ghost sm danger" onClick={()=>{if(confirm(`Delete "${program.name}"? This will soft-delete the program and all its data. This cannot be undone from the UI.`))onDelete();}}><Icon name="trash" size={14} />Delete</button>}
          {next && <button className="hw-btn primary" onClick={moveNext}>Move to {next.label}<Icon name="arrowR" size={14} /></button>}
        </div>
        <div className="hw-tabs hw-scroll" style={{ marginTop:8,overflowX:"auto" }}>
          {PROGRAM_GROUPS.map(g=>(
            <button key={g.key} className={"hw-tab"+(group.key===g.key?" on":"")} onClick={()=>openGroup(g)}>{g.label}{g.key==="projects"&&linkCount?<span className="hw-num" style={{ fontSize:11,color:T.text3 }}>{linkCount}</span>:null}</button>
          ))}
        </div>
      </div>
      {group.sections.length>1 && <div className="plm-bar">
        <div className="hw-seg">{group.sections.map(s=>{ const c=SECTION_COUNT[s]?counts[SECTION_COUNT[s]]:null; return <button key={s} className={tab===s?"on":""} onClick={()=>goto(s)}>{SECTION_LABEL[s]}{c>0?<span className="hw-num" style={{ marginLeft:6,color:T.text3 }}>{c}</span>:null}</button>; })}</div>
      </div>}
      <div className="plm-body content-area" style={tab==="overview"?undefined:{ background:T.surface }}>{renderTab()}</div>
    </PlmShell>
  );
}

// ─── NEW PROGRAM MODAL (3-step) ───────────────────────────────────────────────

function NewProgramModal({ onClose, onCreated, orgId }) {
  const [step, setStep]   = useState(1);
  const [form, setForm]   = useState({
    name:"", program_type:"new_product", priority:"medium",
    current_stage:"ideation", brand:"", target_launch_date:"",
    target_gross_margin_pct:"", target_unit_price:"",
    target_markets_v2:[], channels_v2:[], desired_claims:[],
  });
  const [newClaim, setNewClaim] = useState("");
  const [saving, setSaving]     = useState(false);
  const set=(f,v)=>setForm(p=>({...p,[f]:v}));

  const addClaim=()=>{ const t=newClaim.trim(); if(!t)return; set("desired_claims",[...form.desired_claims,t]); setNewClaim(""); };
  const removeClaim=i=>set("desired_claims",form.desired_claims.filter((_,idx)=>idx!==i));

  const handleCreate=async()=>{
    if(!form.name.trim())return; setSaving(true);
    const NUMERIC=["target_gross_margin_pct","target_unit_price"];
    const ARRAYS=["target_markets_v2","channels_v2","desired_claims"];
    const DATES=["target_launch_date","actual_launch_date"];
    const raw={...form,org_id:orgId};
    const payload=Object.fromEntries(Object.entries(raw).map(([k,v])=>{
      if(NUMERIC.includes(k)) { const n = parseFloat(v); return [k, !isNaN(n) ? n : null]; }
      if(ARRAYS.includes(k)) return [k, Array.isArray(v) ? v : []];
      if(DATES.includes(k)) return [k, v && String(v).trim() !== "" ? v : null];
      return [k, v === "" || v === undefined ? null : v];
    }));
    // Remove null values for NOT NULL columns so DB defaults apply
    const NOT_NULL_DEFAULTS = ["program_type", "current_stage", "priority", "regulatory_status"];
    NOT_NULL_DEFAULTS.forEach(k => { if (payload[k] === null || payload[k] === undefined) delete payload[k]; });
    if(!payload.org_id){ setSaving(false); alert("Unable to determine your organization. Please refresh and try again."); return; }
    const{data,error}=await supabase.from("plm_programs").insert(payload).select().single();
    if(error){ console.error("Program create error:", error, "Payload:", JSON.stringify(payload)); setSaving(false); alert("Failed to create program: " + (error.message || error.details || "Unknown error")); return; }
    if(data)onCreated(data); setSaving(false);
  };

  const stepTitles=["Program Basics","Market & Channels","Claim Statements"];

  return (
    <div style={{ position:"fixed",inset:0,background:"#00000080",zIndex:200,display:"flex",alignItems:"center",justifyContent:"center" }} onClick={onClose}>
      <div style={{ background:T.surface,border:"1px solid "+T.border,borderRadius:12,padding:24,width:520,maxWidth:"95vw",maxHeight:"90vh",overflow:"auto" }} onClick={e=>e.stopPropagation()}>

        {/* Step indicator */}
        <div style={{ display:"flex",gap:0,marginBottom:20 }}>
          {stepTitles.map((title,i)=>(
            <div key={i} onClick={()=>step>i+1&&setStep(i+1)} style={{ flex:1,textAlign:"center",paddingBottom:8,cursor:step>i+1?"pointer":"default",borderBottom:"2px solid "+(step===i+1?T.accent:step>i+1?T.accent+"60":T.border) }}>
              <div style={{ fontSize:11,fontWeight:700,color:step>=i+1?T.accent:T.text3 }}>{i+1}. {title}</div>
            </div>
          ))}
        </div>

        {/* Step 1 */}
        {step===1&&(
          <div>
            <InlineField label="Program Name *" value={form.name} onChange={v=>set("name",v)} placeholder="e.g. Next-Gen Moisturizer" />
            <InlineField label="Type" value={form.program_type} onChange={v=>set("program_type",v)} options={["new_product","line_extension","reformulation","cost_reduction","packaging_change","claim_addition","market_expansion","renovation","private_label","co_manufacturing"].map(t=>({value:t,label:t.replace(/_/g," ")}))} />
            <InlineField label="Brand" value={form.brand} onChange={v=>set("brand",v)} placeholder="Brand name" />
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
              <InlineField label="Priority" value={form.priority} onChange={v=>set("priority",v)} options={["critical","high","medium","low"].map(x=>({value:x,label:x}))} />
              <InlineField label="Starting Stage" value={form.current_stage} onChange={v=>set("current_stage",v)} options={STAGES.map(s=>({value:s.key,label:`${s.label} - ${s.desc.split('.')[0]}`}))} />
            </div>
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
              <InlineField label="GM% Target" value={form.target_gross_margin_pct} onChange={v=>set("target_gross_margin_pct",v)} type="number" placeholder="e.g. 65" />
              <InlineField label="Target Unit Price ($)" value={form.target_unit_price} onChange={v=>set("target_unit_price",v)} type="number" placeholder="e.g. 29.99" />
            </div>
            <InlineField label="Target Launch Date" value={form.target_launch_date} onChange={v=>set("target_launch_date",v)} type="date" />
          </div>
        )}

        {/* Step 2 */}
        {step===2&&(
          <div>
            <div style={{ marginBottom:16,padding:12,background:T.surface2,borderRadius:8,fontSize:12,color:T.text3,lineHeight:1.6,border:"1px solid "+T.border }}>
              Define where this product will be sold. These selections feed into financial modeling, regulatory requirements, and AI-driven insights.
            </div>
            <MultiSelectDropdown label="Target Markets" value={form.target_markets_v2} onChange={v=>set("target_markets_v2",v)} options={TARGET_MARKETS} />
            <MultiSelectDropdown label="Sales Channels" value={form.channels_v2} onChange={v=>set("channels_v2",v)} options={CHANNELS_LIST} />
          </div>
        )}

        {/* Step 3 */}
        {step===3&&(
          <div>
            <div style={{ marginBottom:12,padding:12,background:T.surface2,borderRadius:8,fontSize:12,color:T.text3,lineHeight:1.6,border:"1px solid "+T.border }}>
              List every marketing or regulatory claim you intend to make. The AI advisor will later cross-reference these against your formulation, ingredients, test data, and substantiation documents - flagging gaps and suggesting what evidence is needed to defend each claim.
            </div>
            {form.desired_claims.map((claim,idx)=>(
              <div key={idx} style={{ display:"flex",gap:8,marginBottom:8,alignItems:"flex-start" }}>
                <span style={{ marginTop:9,fontSize:12,color:T.accent,fontWeight:700,flexShrink:0 }}>#{idx+1}</span>
                <div style={{ flex:1,fontSize:13,color:T.text,background:T.surface2,border:"1px solid "+T.border,borderRadius:6,padding:"7px 10px",lineHeight:1.5 }}>{claim}</div>
                <button onClick={()=>removeClaim(idx)} style={{ marginTop:6,background:"none",border:"none",color:T.text3,cursor:"pointer",fontSize:14,padding:0 }}>✕</button>
              </div>
            ))}
            <div style={{ display:"flex",gap:8,marginTop:8 }}>
              <input value={newClaim} onChange={e=>setNewClaim(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addClaim()} placeholder="e.g. 98% saw visible improvement in 4 weeks…" style={{ flex:1,fontSize:13,color:T.text,background:T.surface2,border:"1px solid "+T.border,borderRadius:6,padding:"7px 10px",outline:"none" }} />
              <button onClick={addClaim} style={{ padding:"7px 14px",fontSize:12,fontWeight:600,background:T.accentDim,color:T.accent,border:"1px solid "+T.accent+"40",borderRadius:6,cursor:"pointer" }}>Add</button>
            </div>
            {form.desired_claims.length===0&&<div style={{ marginTop:8,fontSize:12,color:T.text3,fontStyle:"italic" }}>You can skip this and add claims later. Press Enter or click Add after typing each claim.</div>}
          </div>
        )}

        <div style={{ display:"flex",gap:10,marginTop:20 }}>
          <button onClick={step===1?onClose:()=>setStep(s=>s-1)} style={{ flex:1,padding:10,fontSize:13,background:T.surface2,color:T.text2,border:"1px solid "+T.border,borderRadius:6,cursor:"pointer" }}>{step===1?"Cancel":"← Back"}</button>
          {step<3?(
            <button onClick={()=>setStep(s=>s+1)} disabled={step===1&&!form.name.trim()} style={{ flex:2,padding:10,fontSize:13,fontWeight:600,background:T.accent,color:"#fff",border:"none",borderRadius:6,cursor:"pointer",opacity:step===1&&!form.name.trim()?0.5:1 }}>Next →</button>
          ):(
            <button onClick={handleCreate} disabled={saving||!form.name.trim()} style={{ flex:2,padding:10,fontSize:13,fontWeight:600,background:T.accent,color:"#fff",border:"none",borderRadius:6,cursor:"pointer",opacity:saving?0.6:1 }}>{saving?"Creating…":"✓ Create Program"}</button>
          )}
        </div>
      </div>
    </div>
  );
}


// ─── PRODUCT ROADMAP ──────────────────────────────────────────────────────────

function ProductRoadmap({ programs, allSkus, onSelectProgram, isMobile }) {
  const scrollRef = useRef(null);
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  const items = [];
  programs.filter(p => p.target_launch_date && p.current_stage !== "launched").forEach(p => {
    items.push({ id: "prog-" + p.id, type: "program", name: p.name, brand: p.brand, stage: p.current_stage, priority: p.priority, date: p.target_launch_date, color: STAGE_MAP[p.current_stage]?.color || "#6366f1", program: p });
  });
  programs.filter(p => p.current_stage === "launched").forEach(p => {
    items.push({ id: "live-" + p.id, type: "live", name: p.name, brand: p.brand, stage: "launched", date: p.target_launch_date || p.created_at?.split("T")[0], color: "#22c55e", program: p });
  });
  allSkus.filter(sku => sku.launch_date || sku.status === "active").forEach(sku => {
    const prog = programs.find(p => p.id === sku.program_id);
    items.push({ id: "sku-" + sku.id, type: "sku", name: sku.name || sku.sku_code, brand: prog?.brand, stage: sku.status, date: sku.launch_date || sku.created_at?.split("T")[0], endDate: sku.discontinue_date, color: sku.status === "active" ? "#22c55e" : sku.status === "draft" ? "#8b93a8" : "#eab308", programName: prog?.name, program: prog });
  });
  items.sort((a, b) => (a.date || "").localeCompare(b.date || ""));

  const allDates = items.map(i => i.date).filter(Boolean);
  const minDate = new Date(Math.min(today.getTime() - 90 * 86400000, ...allDates.map(d => new Date(d).getTime())));
  const maxDate = new Date(Math.max(today.getTime() + 540 * 86400000, ...allDates.map(d => new Date(d).getTime() + 60 * 86400000)));
  const totalDays = Math.max(1, (maxDate - minDate) / 86400000);
  const dayPx = isMobile ? 3 : 4.5;
  const timelineW = totalDays * dayPx;
  const getX = (dateStr) => { if (!dateStr) return 0; return Math.max(0, ((new Date(dateStr) - minDate) / 86400000) * dayPx); };
  const todayX = getX(todayStr);

  const months = [];
  const cursor = new Date(minDate.getFullYear(), minDate.getMonth(), 1);
  while (cursor <= maxDate) { months.push(new Date(cursor)); cursor.setMonth(cursor.getMonth() + 1); }
  const monthPos = months.map((m, i) => {
    const x = getX(m.toISOString().split("T")[0]);
    const nx = i < months.length - 1 ? getX(months[i + 1].toISOString().split("T")[0]) : timelineW;
    return { date: m, x, w: nx - x };
  });

  const liveItems = items.filter(i => i.type === "live" || (i.type === "sku" && i.stage === "active"));
  const pipelineItems = items.filter(i => i.type === "program");
  const skuItems = items.filter(i => i.type === "sku" && i.stage !== "active");
  const ROW_H = 38;
  const LABEL_W = isMobile ? 150 : 230;

  useEffect(() => { if (scrollRef.current) scrollRef.current.scrollLeft = Math.max(0, todayX - 200); }, [todayX]);

  const renderLabels = (arr) => arr.map(item => (
    <div key={item.id} style={{ height: ROW_H, display: "flex", alignItems: "center", gap: 6, padding: "0 10px", borderBottom: `1px solid ${T.border}`, overflow: "hidden", cursor: item.program ? "pointer" : "default" }}
      onClick={() => item.program && onSelectProgram(item.program)}>
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: item.color, flexShrink: 0 }} />
      <span style={{ fontSize: 11, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{item.name}</span>
      {item.type === "sku" && <span style={{ fontSize: 8, color: T.text3, background: T.surface3, padding: "1px 4px", borderRadius: 3, flexShrink: 0 }}>SKU</span>}
      {item.type === "program" && <span style={{ fontSize: 8, color: PRIORITY_COLORS[item.priority] || T.text3, fontWeight: 700, flexShrink: 0 }}>{(item.priority || "")[0]?.toUpperCase()}</span>}
    </div>
  ));

  const renderBars = (arr) => arr.map(item => {
    const x = getX(item.date);
    return (
      <div key={item.id} style={{ height: ROW_H, position: "relative", borderBottom: `1px solid ${T.border}` }}>
        {item.type === "live" ? (
          <div style={{ position: "absolute", left: x, top: 11, height: 16, width: Math.max(todayX - x, 12), borderRadius: 8, background: `linear-gradient(90deg, ${item.color}40, ${item.color})` }}>
            <div style={{ position: "absolute", right: -1, top: 3, width: 10, height: 10, borderRadius: 5, background: item.color, border: "2px solid #fff" }} />
          </div>
        ) : item.type === "program" ? (<>
          <div style={{ position: "absolute", left: 0, top: 18, width: x, height: 2, background: `linear-gradient(90deg, transparent, ${item.color}40)` }} />
          <div style={{ position: "absolute", left: x - 7, top: 12, width: 14, height: 14, transform: "rotate(45deg)", borderRadius: 2, background: item.color + "25", border: `2px solid ${item.color}` }} />
          <div style={{ position: "absolute", left: x + 12, top: 11, fontSize: 10, color: item.color, fontWeight: 600, whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 4 }}>
            {new Date(item.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
            <span style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: item.color + "18", color: item.color, fontWeight: 700, textTransform: "uppercase" }}>{STAGE_MAP[item.stage]?.label || item.stage}</span>
          </div>
        </>) : (<>
          <div style={{ position: "absolute", left: x - 5, top: 14, width: 10, height: 10, borderRadius: 5, background: item.color, border: `2px solid ${T.surface}`, boxShadow: `0 0 0 1px ${item.color}40` }} />
          {item.date && <div style={{ position: "absolute", left: x + 10, top: 13, fontSize: 9, color: T.text3 }}>{new Date(item.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</div>}
        </>)}
      </div>
    );
  });

  const groups = [
    liveItems.length > 0 && { title: "Live Products", icon: "\uD83D\uDFE2", items: liveItems },
    pipelineItems.length > 0 && { title: "Pipeline - Upcoming Launches", icon: "\uD83D\uDD37", items: pipelineItems },
    skuItems.length > 0 && { title: "SKUs", icon: "\uD83D\uDCE6", items: skuItems },
  ].filter(Boolean);

  return (
    <div>
      <div style={{ display: "flex", gap: 16, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: T.text }}>Product Roadmap</span>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 20, height: 8, borderRadius: 4, background: "linear-gradient(90deg, #22c55e60, #22c55e)" }} /><span style={{ fontSize: 10, color: T.text3 }}>Live</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 10, height: 10, transform: "rotate(45deg)", borderRadius: 1, background: "#6366f130", border: "2px solid #6366f1" }} /><span style={{ fontSize: 10, color: T.text3 }}>Pipeline</span></div>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 8, height: 8, borderRadius: 4, background: "#8b93a8" }} /><span style={{ fontSize: 10, color: T.text3 }}>SKU</span></div>
        </div>
      </div>
      <div style={{ display: "flex", border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden", background: T.surface }}>
        <div style={{ width: LABEL_W, flexShrink: 0, borderRight: `1px solid ${T.border}` }}>
          <div style={{ height: 32, borderBottom: `2px solid ${T.border}`, display: "flex", alignItems: "center", padding: "0 10px", fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", letterSpacing: 0.5 }}>Product</div>
          {groups.map(g => (<div key={g.title}><div style={{ height: 28, display: "flex", alignItems: "center", gap: 5, padding: "0 10px", background: T.surface2, borderBottom: `1px solid ${T.border}` }}><span style={{ fontSize: 10, fontWeight: 700, color: T.text2, textTransform: "uppercase", letterSpacing: 0.5 }}>{g.title}</span><span style={{ fontSize: 10, color: T.text3, marginLeft: "auto" }}>{g.items.length}</span></div>{renderLabels(g.items)}</div>))}
        </div>
        <div ref={scrollRef} style={{ flex: 1, overflowX: "auto", overflowY: "hidden", position: "relative" }}>
          <div style={{ width: timelineW, minWidth: "100%" }}>
            <div style={{ height: 32, display: "flex", borderBottom: `2px solid ${T.border}`, position: "sticky", top: 0, background: T.surface, zIndex: 2 }}>
              {monthPos.map((mp, i) => {
                const cur = mp.date.getMonth() === today.getMonth() && mp.date.getFullYear() === today.getFullYear();
                const yr = mp.date.getMonth() === 0 || i === 0;
                return <div key={i} style={{ position: "absolute", left: mp.x, width: mp.w, height: "100%", borderRight: `1px solid ${T.border}`, display: "flex", alignItems: "center", padding: "0 8px", fontSize: 11, fontWeight: cur ? 700 : 500, color: cur ? T.accent : T.text3 }}>{mp.date.toLocaleDateString("en-US", { month: "short" })}{yr ? " \u2019" + String(mp.date.getFullYear()).slice(2) : ""}</div>;
              })}
            </div>
            <div style={{ position: "absolute", left: todayX, top: 0, bottom: 0, width: 2, background: T.accent, zIndex: 3, pointerEvents: "none", opacity: 0.6 }}><div style={{ position: "absolute", top: 2, left: -14, fontSize: 8, fontWeight: 800, color: "#fff", background: T.accent, padding: "1px 5px", borderRadius: 3 }}>TODAY</div></div>
            {groups.map(g => (<div key={g.title}><div style={{ height: 28, background: T.surface2, borderBottom: `1px solid ${T.border}` }} /><div style={{ position: "relative" }}>{monthPos.map((mp, i) => <div key={i} style={{ position: "absolute", left: mp.x, top: 0, bottom: 0, width: 1, background: T.border, opacity: 0.4, pointerEvents: "none" }} />)}{renderBars(g.items)}</div></div>))}
          </div>
        </div>
      </div>
      {items.length === 0 && <div style={{ marginTop: 20 }}><EmptyState icon={"\uD83D\uDCC5"} text="No products with launch dates yet. Add target launch dates to your programs to see them here." /></div>}
    </div>
  );
}

// ─── MAIN PLM VIEW ────────────────────────────────────────────────────────────

export default function PLMView({ navigateTo, navigateToProject } = {}) {
  const { isMobile } = useResponsive();
  const { orgId } = useAuth();
  const [programs, setPrograms] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [view, setView]         = useState("programs");
  const [scope, setScope]       = useState("flight");
  const [layout, _setLayout]    = useState(() => { try { return localStorage.getItem("helm_plm_layout") === "board" ? "board" : "list"; } catch { return "list"; } });
  const setLayout = (v) => { _setLayout(v); try { localStorage.setItem("helm_plm_layout", v); } catch {} };
  const [runwayMode, setRunwayMode] = useState("programs");
  const [showNew, setShowNew]   = useState(false);
  const [search, setSearch]     = useState("");
  const [allSkus, setAllSkus]   = useState([]);
  const [linkCounts, setLinkCounts] = useState({});

  useEffect(()=>{
    const load=async()=>{
      const{data}=await supabase.from("plm_programs").select("*").eq("org_id", orgId).is("deleted_at",null).order("created_at",{ascending:false});
      setPrograms(data||[]); setLoading(false);
      // linked-work counts per program (linked projects + tasks)
      Promise.all([
        supabase.from("projects").select("plm_program_id").eq("org_id", orgId).not("plm_program_id","is",null).is("deleted_at",null),
        supabase.from("tasks").select("plm_program_id").eq("org_id", orgId).not("plm_program_id","is",null).is("deleted_at",null),
      ]).then(([{ data: lp }, { data: lt }]) => {
        const c = {};
        (lp||[]).forEach(r => { c[r.plm_program_id] = (c[r.plm_program_id]||0) + 1; });
        (lt||[]).forEach(r => { c[r.plm_program_id] = (c[r.plm_program_id]||0) + 1; });
        setLinkCounts(c);
      });
      // Load all SKUs for roadmap view
      supabase.from("plm_skus").select("*").eq("org_id", orgId).order("launch_date").then(({ data: skuData }) => setAllSkus(skuData || []));
    };
    load();
  },[]);

  const filtered=programs.filter(p=>!search||p.name.toLowerCase().includes(search.toLowerCase())||p.brand?.toLowerCase().includes(search.toLowerCase()));
  const handleUpdate=u=>{setPrograms(p=>p.map(x=>x.id===u.id?u:x));setSelected(u);};
  const handleCreated=p=>{setPrograms(prev=>[p,...prev]);setSelected(p);setShowNew(false);};
  const deleteProgram=async id=>{
    await supabase.from("plm_programs").update({deleted_at:new Date().toISOString()}).eq("org_id", orgId).eq("id",id);
    setPrograms(p=>p.filter(x=>x.id!==id));
    if(selected?.id===id)setSelected(null);
  };

  if(selected)return <ProgramDetail program={selected} onBack={()=>setSelected(null)} onUpdate={handleUpdate} onDelete={()=>deleteProgram(selected.id)} navigateTo={navigateTo} navigateToProject={navigateToProject} linkCount={linkCounts[selected.id]||0} />;

  const inFlight=programs.filter(p=>p.current_stage!=="launched");
  const stats=[{label:"programs",val:programs.length},{label:"in flight",val:inFlight.length},{label:"past target launch",val:inFlight.filter(isLate).length,warn:true},{label:"launched",val:programs.length-inFlight.length}];
  const shown=filtered.filter(p=>scope==="all"||(scope==="launched"?p.current_stage==="launched":p.current_stage!=="launched"));
  const fmtLaunch=fmtDay;
  return (
    <PlmShell>
      <div className="plm-top">
        <div style={{ display:"flex",alignItems:"center",gap:18,flexWrap:"wrap",minHeight:36 }}>
          <h1>Product lifecycle</h1>
          <div style={{ display:"flex",gap:18,flexWrap:"wrap",flex:1 }}>{stats.map(k=><span key={k.label} className="plm-stat"><b style={k.warn&&k.val?{ color:T.red }:undefined}>{k.val}</b>{k.label}</span>)}</div>
          <button className="hw-btn primary" onClick={()=>setShowNew(true)}><Icon name="plus" size={15} sw={2.2} />New program</button>
        </div>
        <div className="hw-tabs" style={{ marginTop:8 }}>
          {[["programs","Programs","list"],["runway","Runway","timeline"],["dashboard","Dashboard","chart"],["library","Library","folder"],["ai","AI agent","zap"]].map(([k,label,icon])=>(
            <button key={k} className={"hw-tab"+(view===k?" on":"")} onClick={()=>setView(k)}><Icon name={icon} size={15} />{label}</button>
          ))}
        </div>
      </div>

      {view==="ai" ? (
        <div style={{ flex:1,overflow:"hidden",display:"flex",flexDirection:"column",padding:"0 24px 0 24px",background:T.surface }}>
          <AIAgentTab program={null} />
        </div>
      ) : view==="library" ? (
        <div style={{ flex:1,overflow:"hidden",display:"flex",flexDirection:"column",background:T.surface }}>
          <PLMLibraryView />
        </div>
      ) : view==="dashboard" ? (
        <div className="plm-body">
          {loading?<div style={{ color:T.text3,fontSize:13 }}>Loading programs…</div>:<LaunchDashboard programs={programs} stages={STAGES} linkCounts={linkCounts} onOpen={setSelected} onRunway={()=>setView("runway")} />}
        </div>
      ) : view==="runway" ? (<>
        <div className="plm-bar">
          <Seg value={runwayMode} options={[["programs","Program targets"],["skus","SKU roadmap"]]} onChange={setRunwayMode} />
        </div>
        <div className="plm-body">
          {runwayMode==="skus"?<ProductRoadmap programs={programs} allSkus={allSkus} onSelectProgram={setSelected} isMobile={isMobile} />
          :loading?<div style={{ color:T.text3,fontSize:13 }}>Loading programs…</div>:<Runway programs={programs} stages={STAGES} onOpen={setSelected} />}
        </div>
      </>) : (<>
        <div className="plm-bar">
          <Seg value={scope} options={[["flight","In flight"],["launched","Launched"],["all","All"]]} onChange={setScope} />
          <Seg value={layout} options={[["list","List"],["board","Board"]]} onChange={setLayout} />
          <span style={{ flex:1 }} />
          <span className="hw-num" style={{ fontSize:12,color:T.text3 }}>{shown.length} {shown.length===1?"program":"programs"}</span>
          <label style={{ display:"flex",alignItems:"center",gap:7,height:30,padding:"0 10px",borderRadius:7,border:"1px solid var(--line2)",color:"var(--ink3)",width:220,background:"var(--surface)" }}><Icon name="search" size={15} /><input className="hw-bare" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search programs" /></label>
        </div>
        {loading?<div className="plm-body" style={{ color:T.text3,fontSize:13 }}>Loading programs…</div>
        :shown.length===0?<div className="plm-body"><EmptyState text={search?"No programs match your search":scope==="launched"?"Nothing has launched yet.":"No programs yet. Create your first one."} /></div>
        :layout==="list"?<ProgramList programs={shown} stages={STAGES} linkCounts={linkCounts} onOpen={setSelected} onDelete={deleteProgram} />
        :(
        <div className="plm-body">
          <div className="plm-pipe">
            {STAGES.map(stage=>{
              const sp=shown.filter(p=>p.current_stage===stage.key);
              if(!sp.length)return <div key={stage.key} className="plm-col slim" title={stage.label+" — "+stage.desc}><span className="hw-dot" style={{ background:stage.color }} /><span className="vt">{stage.label}</span></div>;
              return (
                <div key={stage.key} className="plm-col">
                  <div className="plm-col-h" title={stage.desc}><span className="hw-dot" style={{ background:stage.color }} /><b>{stage.label}</b><span>{sp.length}</span></div>
                  {sp.map(p=>(
                    <div key={p.id} className="plm-card" style={{ "--c":stage.color }} onClick={()=>setSelected(p)}>
                      {p.brand&&<div className="hw-eyebrow" style={{ fontSize:10 }}>{p.brand}</div>}
                      <div className="nm">{p.name}</div>
                      <div style={{ display:"flex",gap:5,flexWrap:"wrap" }}>
                        <PriorityBadge priority={p.priority} />
                        {p.target_gross_margin_pct&&<Chip t="green">GM {p.target_gross_margin_pct}%</Chip>}
                        {linkCounts[p.id]>0&&<Chip t="teal" title="Linked projects and tasks"><Icon name="link" size={11} />{linkCounts[p.id]}</Chip>}
                      </div>
                      {((p.target_markets_v2||[]).length>0||p.target_launch_date)&&<div className="ft">
                        {(p.target_markets_v2||[]).length>0&&<span><Icon name="pin" size={12} />{p.target_markets_v2.join(" · ")}</span>}
                        {p.target_launch_date&&<span className={isLate(p)?"plm-late":""} style={{ marginLeft:"auto" }}><Icon name="cal" size={12} />{fmtLaunch(p.target_launch_date)}</span>}
                      </div>}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
        )}
      </>)}
      {showNew&&<NewProgramModal onClose={()=>setShowNew(false)} onCreated={handleCreated} orgId={orgId} />}
    </PlmShell>
  );
}
