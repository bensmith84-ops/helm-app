"use client";
import { useState, useEffect, useRef } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const STAGES = [
  { key: "ideation",     label: "Ideation",     color: "#8b5cf6" },
  { key: "concept",      label: "Concept",      color: "#6366f1" },
  { key: "feasibility",  label: "Feasibility",  color: "#3b82f6" },
  { key: "development",  label: "Development",  color: "#0ea5e9" },
  { key: "optimization", label: "Optimization", color: "#06b6d4" },
  { key: "validation",   label: "Validation",   color: "#10b981" },
  { key: "scale_up",     label: "Scale-Up",     color: "#84cc16" },
  { key: "regulatory",   label: "Regulatory",   color: "#eab308" },
  { key: "launch_ready", label: "Launch Ready", color: "#f97316" },
  { key: "launched",     label: "Launched",     color: "#22c55e" },
];
const STAGE_MAP = Object.fromEntries(STAGES.map(s => [s.key, s]));

const PRIORITY_COLORS = { critical: "#ef4444", high: "#f97316", medium: "#eab308", low: "#22c55e" };
const STATUS_COLORS   = { pass: "#22c55e", fail: "#ef4444", pending: "#eab308", in_progress: "#3b82f6", draft: "#8b93a8", open: "#f97316", resolved: "#22c55e" };

const PROGRAM_TYPES = ["new_product","reformulation","cost_reduction","line_extension","packaging_change","ingredient_swap","compliance","renovation"];
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
  return <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:4, background:s.color+"22", color:s.color, letterSpacing:0.3 }}>{s.label.toUpperCase()}</span>;
}
function PriorityBadge({ priority }) {
  const color = PRIORITY_COLORS[priority] || "#8b93a8";
  return <span style={{ fontSize:10, fontWeight:700, padding:"2px 7px", borderRadius:4, background:color+"22", color, letterSpacing:0.3 }}>{(priority||"—").toUpperCase()}</span>;
}
function StatusDot({ status }) {
  return <span style={{ display:"inline-block", width:8, height:8, borderRadius:"50%", background:STATUS_COLORS[status]||"#8b93a8", marginRight:5 }} />;
}
function Section({ title, children, action }) {
  return (
    <div style={{ marginBottom:24 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
        <div style={{ fontSize:11, fontWeight:700, color:T.text3, letterSpacing:1, textTransform:"uppercase" }}>{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}
function AddBtn({ onClick, label="Add" }) {
  return <button onClick={onClick} style={{ fontSize:11, fontWeight:600, padding:"3px 10px", borderRadius:5, background:T.accentDim, color:T.accent, border:"1px solid "+T.accent+"40", cursor:"pointer" }}>+ {label}</button>;
}
function EmptyState({ icon, text }) {
  return <div style={{ padding:"32px 0", textAlign:"center", color:T.text3, fontSize:13 }}><div style={{ fontSize:28, marginBottom:8 }}>{icon}</div>{text}</div>;
}
function InlineField({ label, value, onChange, onBlur, type="text", placeholder, multiline, options, readOnly }) {
  const base = { width:"100%", fontSize:13, color:readOnly?T.text2:T.text, background:readOnly?T.surface3:T.surface2, border:"1px solid "+T.border, borderRadius:6, padding:"6px 10px", outline:"none", fontFamily:"inherit", boxSizing:"border-box" };
  return (
    <div style={{ marginBottom:12 }}>
      {label && <div style={{ fontSize:11, color:T.text3, marginBottom:4, fontWeight:600 }}>{label}</div>}
      {options ? (
        <select value={value||""} onChange={e=>onChange(e.target.value)} onBlur={onBlur} disabled={readOnly} style={{ ...base, cursor:readOnly?"default":"pointer" }}>
          <option value="">—</option>
          {options.map(o=><option key={o.value||o} value={o.value||o}>{o.label||o}</option>)}
        </select>
      ) : multiline ? (
        <textarea value={value||""} onChange={e=>onChange(e.target.value)} onBlur={onBlur} placeholder={placeholder} style={{ ...base, minHeight:72, resize:"vertical" }} readOnly={readOnly} />
      ) : (
        <input type={type} value={value||""} onChange={e=>onChange(e.target.value)} onBlur={onBlur} placeholder={placeholder} style={base} readOnly={readOnly} />
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
            <input autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" style={{ width:"100%", fontSize:12, background:T.surface2, border:"1px solid "+T.border, borderRadius:5, padding:"4px 8px", color:T.text, outline:"none" }} />
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

function FormulaItemRow({ item, onUpdate, onDelete }) {
  const [vals, setVals] = useState(item);
  const changed = useRef(false);
  const handleChange = (f,v) => { changed.current=true; setVals(p=>({...p,[f]:v})); };
  const handleBlur = async () => {
    if (!changed.current) return; changed.current=false;
    await supabase.from("plm_formula_items").update({ ingredient_name:vals.ingredient_name, quantity:parseFloat(vals.quantity)||0, unit:vals.unit, function_in_formula:vals.function_in_formula }).eq("id",item.id);
    onUpdate(vals);
  };
  const td={padding:"4px 6px",verticalAlign:"middle"}, inp={width:"100%",fontSize:12,background:"transparent",border:"none",color:T.text,outline:"none",fontFamily:"inherit"};
  return (
    <tr style={{ borderBottom:"1px solid "+T.border }}>
      <td style={td}><input value={vals.ingredient_name||""} onChange={e=>handleChange("ingredient_name",e.target.value)} onBlur={handleBlur} style={inp} placeholder="Ingredient" /></td>
      <td style={{...td,width:70}}><input value={vals.quantity||""} onChange={e=>handleChange("quantity",e.target.value)} onBlur={handleBlur} style={{...inp,textAlign:"right"}} type="number" /></td>
      <td style={{...td,width:60}}><input value={vals.unit||""} onChange={e=>handleChange("unit",e.target.value)} onBlur={handleBlur} style={inp} placeholder="%" /></td>
      <td style={td}><input value={vals.function_in_formula||""} onChange={e=>handleChange("function_in_formula",e.target.value)} onBlur={handleBlur} style={inp} placeholder="Function" /></td>
      <td style={{...td,width:28,textAlign:"center"}}><button onClick={onDelete} style={{ background:"none",border:"none",color:T.text3,cursor:"pointer",fontSize:12,padding:0 }}>✕</button></td>
    </tr>
  );
}

// ─── CLAIM ROW ────────────────────────────────────────────────────────────────

function ClaimRow({ claim, onUpdate, onDelete }) {
  const [editing, setEditing] = useState(false);
  const [vals, setVals] = useState(claim);
  const save = async () => { await supabase.from("plm_claims").update({claim_text:vals.claim_text,status:vals.status,claim_type:vals.claim_type}).eq("id",claim.id); onUpdate(vals); setEditing(false); };
  const sc = STATUS_COLORS[claim.status]||"#8b93a8";
  return (
    <div style={{ padding:"10px 12px", background:T.surface2, borderRadius:8, border:"1px solid "+T.border, marginBottom:8 }}>
      {editing ? (
        <div>
          <textarea value={vals.claim_text} onChange={e=>setVals(p=>({...p,claim_text:e.target.value}))} style={{ width:"100%",fontSize:13,color:T.text,background:T.surface3,border:"1px solid "+T.border,borderRadius:6,padding:8,resize:"vertical",minHeight:60,outline:"none",fontFamily:"inherit",boxSizing:"border-box" }} />
          <div style={{ display:"flex",gap:8,marginTop:6 }}>
            <select value={vals.status||""} onChange={e=>setVals(p=>({...p,status:e.target.value}))} style={{ fontSize:12,background:T.surface3,border:"1px solid "+T.border,color:T.text,borderRadius:5,padding:"3px 6px" }}>
              {["draft","pending","approved","rejected"].map(s=><option key={s} value={s}>{s}</option>)}
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

function VolumeTierRow({ tier, idx, onChange, onDelete }) {
  const td=w=>({padding:"4px 6px",width:w,verticalAlign:"middle"});
  const inp=ex=>({width:"100%",fontSize:12,background:"transparent",border:"none",color:T.text,outline:"none",fontFamily:"inherit",...ex});
  return (
    <tr style={{ borderBottom:"1px solid "+T.border }}>
      <td style={td(80)}><input value={tier.min_qty||""} onChange={e=>onChange(idx,"min_qty",e.target.value)} style={inp({textAlign:"left"})} placeholder="Min" /></td>
      <td style={td(80)}><input value={tier.max_qty||""} onChange={e=>onChange(idx,"max_qty",e.target.value)} style={inp({textAlign:"right"})} placeholder="Max" /></td>
      <td style={td(70)}><input value={tier.unit||"units"} onChange={e=>onChange(idx,"unit",e.target.value)} style={inp({})} /></td>
      <td style={td(90)}><input value={tier.unit_price||""} onChange={e=>onChange(idx,"unit_price",e.target.value)} style={inp({textAlign:"right"})} type="number" placeholder="0.000" /></td>
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
            <InlineField label="Supplier Name" value={vals.supplier_name} onChange={v=>setVals(p=>({...p,supplier_name:v}))} onBlur={()=>saveField("supplier_name",vals.supplier_name)} />
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
            {tiers.length===0 ? <div style={{ fontSize:12,color:T.text3,fontStyle:"italic" }}>No tiers yet — add tiers to enable GM% scenario modeling</div> : (
              <table style={{ width:"100%",borderCollapse:"collapse" }}>
                <thead><tr style={{ borderBottom:"1px solid "+T.border }}>{["Min Qty","Max Qty","Unit","Unit Price ($)","Total Cost ($)",""].map(h=><th key={h} style={{ padding:"4px 6px",textAlign:"left",fontSize:10,fontWeight:700,color:T.text3,textTransform:"uppercase" }}>{h}</th>)}</tr></thead>
                <tbody>{tiers.map((tier,idx)=><VolumeTierRow key={idx} tier={tier} idx={idx} onChange={changeTier} onDelete={i=>saveTiers(tiers.filter((_,ti)=>ti!==i))} />)}</tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── TAB: OVERVIEW ────────────────────────────────────────────────────────────

function OverviewTab({ program, onUpdate, counts }) {
  const [editing, setEditing] = useState({});
  const set=(f,v)=>setEditing(p=>({...p,[f]:v}));
  const fv=f=>f in editing?editing[f]:program[f];
  const saveAll=async()=>{
    if(!Object.keys(editing).length)return;
    const NUMERIC_FIELDS=["target_gross_margin_pct","target_unit_price","development_budget"];
    const payload=Object.fromEntries(Object.entries(editing).map(([k,v])=>[k,NUMERIC_FIELDS.includes(k)&&v!==""?parseFloat(v):v===" "?null:v]));
    await supabase.from("plm_programs").update(payload).eq("id",program.id);
    onUpdate({...program,...editing}); setEditing({});
  };
  const advanceStage=async k=>{ await supabase.from("plm_programs").update({current_stage:k}).eq("id",program.id); onUpdate({...program,current_stage:k}); };
  return (
    <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:24 }}>
      <div>
        <Section title="Stage Gate">
          <div style={{ display:"flex",gap:4,flexWrap:"wrap" }}>
            {STAGES.map((s,i)=>{
              const cur=STAGES.findIndex(x=>x.key===program.current_stage),done=i<cur,active=i===cur;
              return <div key={s.key} onClick={()=>advanceStage(s.key)} style={{ flex:1,minWidth:58,textAlign:"center",padding:"8px 4px",borderRadius:6,fontSize:10,fontWeight:700,cursor:"pointer",background:active?s.color+"30":done?s.color+"15":T.surface2,border:"1px solid "+(active?s.color:done?s.color+"60":T.border),color:active?s.color:done?s.color+"99":T.text3,transition:"all 0.15s" }}>{s.label}</div>;
            })}
          </div>
        </Section>
        <Section title="KPIs">
          <div style={{ display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8 }}>
            {[{label:"Formulas",val:counts.formulations,icon:"⚗️"},{label:"Experiments",val:counts.experiments,icon:"🔬"},{label:"Trials",val:counts.trials,icon:"🏭"},{label:"SKUs",val:counts.skus,icon:"📦"},{label:"Claims",val:counts.claims,icon:"✅"},{label:"Issues",val:counts.issues,icon:"⚠️"}].map(k=>(
              <div key={k.label} style={{ background:T.surface2,border:"1px solid "+T.border,borderRadius:8,padding:"10px 12px" }}>
                <div style={{ fontSize:18 }}>{k.icon}</div>
                <div style={{ fontSize:22,fontWeight:700,color:T.text,lineHeight:1.2 }}>{k.val??0}</div>
                <div style={{ fontSize:11,color:T.text3 }}>{k.label}</div>
              </div>
            ))}
          </div>
        </Section>
        <Section title="Financial Targets">
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
            <InlineField label="GM% Target" value={fv("target_gross_margin_pct")} onChange={v=>set("target_gross_margin_pct",v)} type="number" placeholder="e.g. 65" />
            <InlineField label="Target Unit Price ($)" value={fv("target_unit_price")} onChange={v=>set("target_unit_price",v)} type="number" placeholder="e.g. 29.99" />
          </div>
          <InlineField label="Development Budget ($)" value={fv("development_budget")} onChange={v=>set("development_budget",v)} type="number" />
        </Section>
      </div>
      <div>
        <Section title="Program Details">
          <InlineField label="Program Name" value={fv("name")} onChange={v=>set("name",v)} />
          <InlineField label="Type" value={fv("program_type")} onChange={v=>set("program_type",v)} options={PROGRAM_TYPES.map(t=>({value:t,label:t.replace(/_/g," ")}))} />
          <InlineField label="Priority" value={fv("priority")} onChange={v=>set("priority",v)} options={["critical","high","medium","low"].map(p=>({value:p,label:p}))} />
          <InlineField label="Brand" value={fv("brand")} onChange={v=>set("brand",v)} />
          <InlineField label="Target Launch Date" value={fv("target_launch_date")} onChange={v=>set("target_launch_date",v)} type="date" />
          <MultiSelectDropdown label="Target Markets" value={fv("target_markets_v2")||[]} onChange={v=>set("target_markets_v2",v)} options={TARGET_MARKETS} />
          <MultiSelectDropdown label="Channels" value={fv("channels_v2")||[]} onChange={v=>set("channels_v2",v)} options={CHANNELS_LIST} />
          <InlineField label="Description" value={fv("description")} onChange={v=>set("description",v)} multiline />
        </Section>
        <button onClick={saveAll} style={{ width:"100%",padding:10,fontSize:13,fontWeight:600,borderRadius:6,cursor:"pointer",background:Object.keys(editing).length?T.accent:T.surface2,color:Object.keys(editing).length?"#fff":T.text3,border:"1px solid "+(Object.keys(editing).length?T.accent:T.border),transition:"all 0.15s" }}>
          {Object.keys(editing).length?"Save Changes":"No Unsaved Changes"}
        </button>
      </div>
    </div>
  );
}

// ─── TAB: CLAIMS & SUBSTANTIATION ─────────────────────────────────────────────

function ClaimsSubstantiationTab({ program, onUpdate }) {
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

  const saveClaims=async updated=>{setClaims(updated);await supabase.from("plm_programs").update({desired_claims:updated}).eq("id",program.id);onUpdate({...program,desired_claims:updated});};
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
            <div style={{ fontSize:12,color:T.text3,lineHeight:1.6 }}>List every marketing or regulatory claim you intend to make. The AI advisor will cross-reference these against your formulation, ingredients, test data, and substantiation docs — flagging gaps and suggesting what evidence is needed to defend each claim.</div>
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
          {claims.length===0&&<div style={{ marginTop:8,fontSize:12,color:T.text3,fontStyle:"italic" }}>No claims yet — add your desired marketing and regulatory claims above.</div>}
        </Section>
      </div>
      <div>
        <Section title="Claims Substantiation" action={<AddBtn onClick={()=>setShowDocForm(true)} label="Add Document" />}>
          <div style={{ background:T.surface2,border:"1px solid "+T.border,borderRadius:8,padding:"10px 12px",marginBottom:12 }}>
            <div style={{ fontSize:12,color:T.text3,lineHeight:1.6 }}>Attach supporting evidence — studies, lab reports, regulatory filings, or links — that substantiate your claim statements.</div>
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

function SourcingTab({ program }) {
  const [items, setItems]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({name:"",sourcing_type:"ingredient",supplier_name:""});

  useEffect(()=>{
    supabase.from("plm_sourcing").select("*").eq("program_id",program.id).order("created_at").then(({data})=>{setItems(data||[]);setLoading(false);});
  },[program.id]);

  const add=async()=>{
    if(!form.name.trim())return;
    const{data}=await supabase.from("plm_sourcing").insert({...form,program_id:program.id,volume_tiers:[]}).select().single();
    if(data){setItems(p=>[...p,data]);setShowForm(false);setForm({name:"",sourcing_type:"ingredient",supplier_name:""});}
  };

  const grouped=SOURCING_TYPES.reduce((acc,t)=>{acc[t.value]=items.filter(i=>i.sourcing_type===t.value);return acc;},{});
  if(loading)return <div style={{ color:T.text3,fontSize:13 }}>Loading…</div>;

  return (
    <div>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14 }}>
        <div style={{ fontSize:13,color:T.text2 }}>{items.length} sourcing item{items.length!==1?"s":""}</div>
        <button onClick={()=>setShowForm(true)} style={{ padding:"6px 14px",fontSize:12,fontWeight:600,background:T.accent,color:"#fff",border:"none",borderRadius:6,cursor:"pointer" }}>+ Add Sourcing Item</button>
      </div>
      {showForm&&(
        <div style={{ background:T.surface2,border:"1px solid "+T.accent+"40",borderRadius:8,padding:16,marginBottom:16 }}>
          <div style={{ fontSize:13,fontWeight:700,color:T.text,marginBottom:12 }}>New Sourcing Item</div>
          <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12 }}>
            <InlineField label="Name *" value={form.name} onChange={v=>setForm(p=>({...p,name:v}))} placeholder="e.g. Retinol 0.5%" />
            <InlineField label="Type" value={form.sourcing_type} onChange={v=>setForm(p=>({...p,sourcing_type:v}))} options={SOURCING_TYPES} />
            <InlineField label="Supplier" value={form.supplier_name} onChange={v=>setForm(p=>({...p,supplier_name:v}))} placeholder="Supplier name" />
          </div>
          <div style={{ display:"flex",gap:8,marginTop:4 }}>
            <button onClick={()=>setShowForm(false)} style={{ flex:1,padding:8,fontSize:12,background:T.surface3,color:T.text2,border:"1px solid "+T.border,borderRadius:6,cursor:"pointer" }}>Cancel</button>
            <button onClick={add} style={{ flex:2,padding:8,fontSize:12,fontWeight:600,background:T.accent,color:"#fff",border:"none",borderRadius:6,cursor:"pointer" }}>Add</button>
          </div>
        </div>
      )}
      {items.length===0?<EmptyState icon="🔗" text="No sourcing items yet — add ingredients, packaging, or contract manufacturers" />:
        SOURCING_TYPES.map(t=>{
          const group=grouped[t.value];
          if(!group.length)return null;
          return (
            <div key={t.value} style={{ marginBottom:20 }}>
              <div style={{ fontSize:11,fontWeight:700,color:T.text3,textTransform:"uppercase",letterSpacing:1,marginBottom:8 }}>{t.label}s</div>
              {group.map(item=><SourcingItemCard key={item.id} item={item} onUpdate={u=>setItems(p=>p.map(x=>x.id===u.id?u:x))} onDelete={id=>setItems(p=>p.filter(x=>x.id!==id))} />)}
            </div>
          );
        })
      }
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

// ─── TAB: FORMULATIONS ────────────────────────────────────────────────────────

function FormulationsTab({ programId }) {
  const [formulas, setFormulas] = useState([]);
  const [selected, setSelected] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(()=>{ supabase.from("plm_formulations").select("*").eq("program_id",programId).order("created_at").then(({data})=>{setFormulas(data||[]);setLoading(false);}); },[programId]);
  useEffect(()=>{ if(!selected){setItems([]);return;} supabase.from("plm_formula_items").select("*").eq("formulation_id",selected.id).order("sort_order,created_at").then(({data})=>setItems(data||[])); },[selected]);
  const addFormula=async()=>{ const{data}=await supabase.from("plm_formulations").insert({program_id:programId,name:"New Formulation",version:"v1.0",status:"draft"}).select().single(); if(data){setFormulas(p=>[...p,data]);setSelected(data);} };
  const addItem=async()=>{ if(!selected)return; const{data}=await supabase.from("plm_formula_items").insert({formulation_id:selected.id,ingredient_name:"",quantity:0,unit:"%"}).select().single(); if(data)setItems(p=>[...p,data]); };
  const totalPct=items.filter(i=>i.unit==="%").reduce((a,b)=>a+parseFloat(b.quantity||0),0);
  if(loading)return <div style={{ color:T.text3,fontSize:13 }}>Loading…</div>;
  return (
    <div style={{ display:"grid",gridTemplateColumns:"220px 1fr",gap:16 }}>
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
            <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12 }}>
              <div><div style={{ fontSize:15,fontWeight:600,color:T.text }}>{selected.name}</div><div style={{ fontSize:11,color:T.text3 }}>{selected.version}</div></div>
              <div style={{ display:"flex",alignItems:"center",gap:12 }}>
                <span style={{ fontSize:12,color:totalPct>100.5?"#ef4444":totalPct>99.4?"#22c55e":"#eab308",fontWeight:600 }}>Total: {totalPct.toFixed(2)}%</span>
                <AddBtn onClick={addItem} label="Ingredient" />
              </div>
            </div>
            <table style={{ width:"100%",borderCollapse:"collapse" }}>
              <thead><tr style={{ borderBottom:"1px solid "+T.border }}>{["Ingredient","Qty","Unit","Function",""].map(h=><th key={h} style={{ padding:"4px 6px",textAlign:"left",fontSize:10,fontWeight:700,color:T.text3,textTransform:"uppercase" }}>{h}</th>)}</tr></thead>
              <tbody>{items.map(item=><FormulaItemRow key={item.id} item={item} onUpdate={u=>setItems(p=>p.map(x=>x.id===u.id?u:x))} onDelete={async()=>{await supabase.from("plm_formula_items").delete().eq("id",item.id);setItems(p=>p.filter(x=>x.id!==item.id));}} />)}</tbody>
            </table>
            {items.length===0&&<EmptyState icon="🧪" text="No ingredients — add one to get started" />}
          </>
        )}
      </div>
    </div>
  );
}

// ─── TAB: EXPERIMENTS ─────────────────────────────────────────────────────────

function ExperimentsTab({ programId }) {
  const [experiments, setExperiments] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(()=>{ supabase.from("plm_experiments").select("*").eq("program_id",programId).order("created_at").then(({data})=>{setExperiments(data||[]);setLoading(false);}); },[programId]);
  const add=async()=>{ const{data}=await supabase.from("plm_experiments").insert({program_id:programId,name:"New Experiment",experiment_type:"formulation",status:"draft"}).select().single(); if(data){setExperiments(p=>[...p,data]);setSelected(data);} };
  const update=async(field,val)=>{ await supabase.from("plm_experiments").update({[field]:val}).eq("id",selected.id); const u={...selected,[field]:val}; setSelected(u); setExperiments(p=>p.map(x=>x.id===u.id?u:x)); };
  if(loading)return <div style={{ color:T.text3,fontSize:13 }}>Loading…</div>;
  return (
    <div style={{ display:"grid",gridTemplateColumns:"220px 1fr",gap:16 }}>
      <div style={{ borderRight:"1px solid "+T.border,paddingRight:16 }}>
        <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10 }}>
          <div style={{ fontSize:11,fontWeight:700,color:T.text3,textTransform:"uppercase",letterSpacing:1 }}>Experiments</div>
          <AddBtn onClick={add} label="New" />
        </div>
        {experiments.length===0&&<EmptyState icon="🔬" text="No experiments yet" />}
        {experiments.map(e=><div key={e.id} onClick={()=>setSelected(e)} style={{ padding:"8px 10px",borderRadius:6,cursor:"pointer",marginBottom:4,background:selected?.id===e.id?T.accentDim:T.surface2,border:"1px solid "+(selected?.id===e.id?T.accent+"60":T.border) }}><div style={{ fontSize:13,fontWeight:500,color:T.text }}>{e.name}</div><div style={{ fontSize:11,color:T.text3,marginTop:2 }}><StatusDot status={e.status} />{e.experiment_type||"—"}</div></div>)}
      </div>
      <div>
        {!selected?<EmptyState icon="🔬" text="Select an experiment to view details" />:(
          <div>
            <InlineField label="Name" value={selected.name} onChange={v=>update("name",v)} />
            <InlineField label="Type" value={selected.experiment_type} onChange={v=>update("experiment_type",v)} options={["formulation","sensory","analytical","stability","consumer","clinical","process"].map(t=>({value:t,label:t}))} />
            <InlineField label="Status" value={selected.status} onChange={v=>update("status",v)} options={["draft","planned","in_progress","completed","cancelled"].map(s=>({value:s,label:s}))} />
            <InlineField label="Hypothesis" value={selected.hypothesis} onChange={v=>update("hypothesis",v)} multiline placeholder="State your hypothesis…" />
            <InlineField label="Conclusions" value={selected.conclusions} onChange={v=>update("conclusions",v)} multiline placeholder="Conclusions…" />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── TAB: TRIALS ──────────────────────────────────────────────────────────────

function TrialsTab({ programId }) {
  const [trials, setTrials] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(()=>{ supabase.from("plm_manufacturing_trials").select("*").eq("program_id",programId).order("created_at").then(({data})=>{setTrials(data||[]);setLoading(false);}); },[programId]);
  const add=async()=>{ const count=trials.length+1; const{data}=await supabase.from("plm_manufacturing_trials").insert({program_id:programId,trial_number:"T-"+String(count).padStart(3,"0"),name:"Trial "+count,trial_type:"lab",status:"planned"}).select().single(); if(data){setTrials(p=>[...p,data]);setSelected(data);} };
  const update=async(field,val)=>{ await supabase.from("plm_manufacturing_trials").update({[field]:val}).eq("id",selected.id); const u={...selected,[field]:val}; setSelected(u); setTrials(p=>p.map(x=>x.id===u.id?u:x)); };
  if(loading)return <div style={{ color:T.text3,fontSize:13 }}>Loading…</div>;
  return (
    <div style={{ display:"grid",gridTemplateColumns:"220px 1fr",gap:16 }}>
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
            <InlineField label="Type" value={selected.trial_type} onChange={v=>update("trial_type",v)} options={["lab","pilot","scale_up","commercial","validation"].map(t=>({value:t,label:t}))} />
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
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(()=>{ supabase.from("plm_claims").select("*").eq("program_id",programId).order("priority,created_at").then(({data})=>{setClaims(data||[]);setLoading(false);}); },[programId]);
  const add=async()=>{ const{data}=await supabase.from("plm_claims").insert({program_id:programId,claim_text:"New claim",claim_type:"marketing",status:"draft"}).select().single(); if(data)setClaims(p=>[...p,data]); };
  if(loading)return <div style={{ color:T.text3,fontSize:13 }}>Loading…</div>;
  return (
    <div>
      <div style={{ display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14 }}>
        <div style={{ fontSize:13,color:T.text2 }}>{claims.length} claim{claims.length!==1?"s":""}</div>
        <AddBtn onClick={add} label="Add Claim" />
      </div>
      {claims.length===0&&<EmptyState icon="✅" text="No regulatory claims yet" />}
      {claims.map(c=><ClaimRow key={c.id} claim={c} onUpdate={u=>setClaims(p=>p.map(x=>x.id===u.id?u:x))} onDelete={async()=>{await supabase.from("plm_claims").delete().eq("id",c.id);setClaims(p=>p.filter(x=>x.id!==c.id));}} />)}
    </div>
  );
}

// ─── TAB: SKUs ────────────────────────────────────────────────────────────────

function SKUsTab({ programId }) {
  const [skus, setSkus] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(()=>{ supabase.from("plm_skus").select("*").eq("program_id",programId).order("created_at").then(({data})=>{setSkus(data||[]);setLoading(false);}); },[programId]);
  const add=async()=>{ const count=skus.length+1; const{data}=await supabase.from("plm_skus").insert({program_id:programId,sku_code:"SKU-"+String(count).padStart(4,"0"),name:"New SKU",status:"draft"}).select().single(); if(data){setSkus(p=>[...p,data]);setSelected(data);} };
  const update=async(field,val)=>{ await supabase.from("plm_skus").update({[field]:val}).eq("id",selected.id); const u={...selected,[field]:val}; setSelected(u); setSkus(p=>p.map(x=>x.id===u.id?u:x)); };
  if(loading)return <div style={{ color:T.text3,fontSize:13 }}>Loading…</div>;
  return (
    <div style={{ display:"grid",gridTemplateColumns:"220px 1fr",gap:16 }}>
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
            <InlineField label="Status" value={selected.status} onChange={v=>update("status",v)} options={["draft","development","approved","launched","discontinued"].map(s=>({value:s,label:s}))} />
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
  const [issues, setIssues] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [orgId, setOrgId] = useState(null);
  useEffect(()=>{ supabase.from("plm_programs").select("org_id").eq("id",programId).single().then(({data})=>setOrgId(data?.org_id)); supabase.from("plm_issues").select("*").eq("program_id",programId).order("created_at",{ascending:false}).then(({data})=>{setIssues(data||[]);setLoading(false);}); },[programId]);
  const add=async()=>{ const{data}=await supabase.from("plm_issues").insert({program_id:programId,title:"New Issue",issue_type:"formulation",severity:"medium",status:"open",org_id:orgId}).select().single(); if(data){setIssues(p=>[data,...p]);setSelected(data);} };
  const update=async(field,val)=>{ await supabase.from("plm_issues").update({[field]:val}).eq("id",selected.id); const u={...selected,[field]:val}; setSelected(u); setIssues(p=>p.map(x=>x.id===u.id?u:x)); };
  const sc={critical:"#ef4444",high:"#f97316",medium:"#eab308",low:"#22c55e"};
  if(loading)return <div style={{ color:T.text3,fontSize:13 }}>Loading…</div>;
  return (
    <div style={{ display:"grid",gridTemplateColumns:"260px 1fr",gap:16 }}>
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
              <InlineField label="Type" value={selected.issue_type} onChange={v=>update("issue_type",v)} options={["formulation","process","quality","regulatory","supply","packaging","sensory","stability"].map(t=>({value:t,label:t}))} />
              <InlineField label="Severity" value={selected.severity} onChange={v=>update("severity",v)} options={["critical","high","medium","low"].map(s=>({value:s,label:s}))} />
            </div>
            <InlineField label="Status" value={selected.status} onChange={v=>update("status",v)} options={["open","investigating","in_progress","resolved","closed"].map(s=>({value:s,label:s}))} />
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
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(()=>{ supabase.from("plm_test_results").select("*").eq("program_id",programId).order("tested_date",{ascending:false}).then(({data})=>{setResults(data||[]);setLoading(false);}); },[programId]);
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
              <td style={{ padding:"8px 10px",fontSize:12,color:T.text3 }}>{r.specification||"—"}</td>
              <td style={{ padding:"8px 10px",fontSize:12,color:T.text,fontWeight:600 }}>{r.result_value!=null?r.result_value+" "+(r.result_unit||""):r.result_text||"—"}</td>
              <td style={{ padding:"8px 10px" }}><span style={{ fontSize:10,fontWeight:700,color:sc,background:sc+"20",padding:"2px 7px",borderRadius:4 }}>{r.status?.toUpperCase()}</span></td>
              <td style={{ padding:"8px 10px",fontSize:11,color:T.text3 }}>{r.tested_date||"—"}</td>
            </tr>
          );})}
        </tbody>
      </table>
    </div>
  );
}

// ─── TAB: GATE REVIEWS ────────────────────────────────────────────────────────

function GateReviewsTab({ programId }) {
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(()=>{ supabase.from("plm_gate_reviews").select("*").eq("program_id",programId).order("review_date",{ascending:false}).then(({data})=>{setReviews(data||[]);setLoading(false);}); },[programId]);
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

// ─── PROGRAM DETAIL ───────────────────────────────────────────────────────────

const DETAIL_TABS = [
  { key:"overview",      label:"Overview"       },
  { key:"claims_sub",    label:"Claims & Evidence"},
  { key:"sourcing",      label:"Sourcing"       },
  { key:"gm_scenarios",  label:"GM% Scenarios"  },
  { key:"formulations",  label:"Formulations"   },
  { key:"experiments",   label:"Experiments"    },
  { key:"trials",        label:"Trials"         },
  { key:"reg_claims",    label:"Reg Claims"     },
  { key:"skus",          label:"SKUs"           },
  { key:"issues",        label:"Issues"         },
  { key:"test_results",  label:"Test Results"   },
  { key:"gate_reviews",  label:"Gate Reviews"   },
];

function ProgramDetail({ program, onBack, onUpdate }) {
  const [tab, setTab] = useState("overview");
  const [counts, setCounts] = useState({});

  useEffect(()=>{
    const load=async()=>{
      const[{count:formulations},{count:experiments},{count:trials},{count:skus},{count:claims},{count:issues}]=await Promise.all([
        supabase.from("plm_formulations").select("*",{count:"exact",head:true}).eq("program_id",program.id),
        supabase.from("plm_experiments").select("*",{count:"exact",head:true}).eq("program_id",program.id),
        supabase.from("plm_manufacturing_trials").select("*",{count:"exact",head:true}).eq("program_id",program.id),
        supabase.from("plm_skus").select("*",{count:"exact",head:true}).eq("program_id",program.id),
        supabase.from("plm_claims").select("*",{count:"exact",head:true}).eq("program_id",program.id),
        supabase.from("plm_issues").select("*",{count:"exact",head:true}).eq("program_id",program.id),
      ]);
      setCounts({formulations,experiments,trials,skus,claims,issues});
    };
    load();
  },[program.id]);

  const renderTab=()=>{
    switch(tab){
      case "overview":     return <OverviewTab program={program} onUpdate={onUpdate} counts={counts} />;
      case "claims_sub":   return <ClaimsSubstantiationTab program={program} onUpdate={onUpdate} />;
      case "sourcing":     return <SourcingTab program={program} />;
      case "gm_scenarios": return <GMScenarioTab program={program} />;
      case "formulations": return <FormulationsTab programId={program.id} />;
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

  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%" }}>
      <div style={{ padding:"14px 24px",borderBottom:"1px solid "+T.border,display:"flex",alignItems:"center",gap:12,flexShrink:0 }}>
        <button onClick={onBack} style={{ background:"none",border:"1px solid "+T.border,color:T.text2,cursor:"pointer",borderRadius:6,padding:"4px 10px",fontSize:12 }}>← Back</button>
        <div style={{ flex:1 }}>
          <div style={{ display:"flex",alignItems:"center",gap:10,flexWrap:"wrap" }}>
            <div style={{ fontSize:18,fontWeight:700,color:T.text }}>{program.name}</div>
            <StageBadge stage={program.current_stage} />
            <PriorityBadge priority={program.priority} />
            {program.target_gross_margin_pct&&<span style={{ fontSize:11,fontWeight:700,background:"#22c55e15",color:"#22c55e",padding:"2px 8px",borderRadius:4 }}>GM% Target: {program.target_gross_margin_pct}%</span>}
            {(program.target_markets_v2||[]).map(m=><span key={m} style={{ fontSize:10,fontWeight:700,background:T.surface3,color:T.text3,padding:"2px 7px",borderRadius:4 }}>{m}</span>)}
          </div>
          {program.code&&<div style={{ fontSize:11,color:T.text3,marginTop:2 }}>{program.code}</div>}
        </div>
      </div>
      <div style={{ display:"flex",gap:0,borderBottom:"1px solid "+T.border,paddingLeft:24,flexShrink:0,overflowX:"auto" }}>
        {DETAIL_TABS.map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)} style={{ background:"none",border:"none",cursor:"pointer",padding:"10px 12px",fontSize:11,fontWeight:600,whiteSpace:"nowrap",color:tab===t.key?T.accent:T.text3,borderBottom:"2px solid "+(tab===t.key?T.accent:"transparent"),transition:"color 0.15s" }}>{t.label}</button>
        ))}
      </div>
      <div style={{ flex:1,overflow:"auto",padding:"20px 24px" }}>{renderTab()}</div>
    </div>
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
    const payload=Object.fromEntries(Object.entries({...form,org_id:orgId}).map(([k,v])=>[k,NUMERIC.includes(k)&&v!==""?parseFloat(v):v]));
    const{data}=await supabase.from("plm_programs").insert(payload).select().single();
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
            <InlineField label="Type" value={form.program_type} onChange={v=>set("program_type",v)} options={PROGRAM_TYPES.map(t=>({value:t,label:t.replace(/_/g," ")}))} />
            <InlineField label="Brand" value={form.brand} onChange={v=>set("brand",v)} placeholder="Brand name" />
            <div style={{ display:"grid",gridTemplateColumns:"1fr 1fr",gap:12 }}>
              <InlineField label="Priority" value={form.priority} onChange={v=>set("priority",v)} options={["critical","high","medium","low"].map(x=>({value:x,label:x}))} />
              <InlineField label="Starting Stage" value={form.current_stage} onChange={v=>set("current_stage",v)} options={STAGES.map(s=>({value:s.key,label:s.label}))} />
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
              List every marketing or regulatory claim you intend to make. The AI advisor will later cross-reference these against your formulation, ingredients, test data, and substantiation documents — flagging gaps and suggesting what evidence is needed to defend each claim.
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

// ─── MAIN PLM VIEW ────────────────────────────────────────────────────────────

export default function PLMView() {
  const [programs, setPrograms] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [view, setView]         = useState("pipeline");
  const [showNew, setShowNew]   = useState(false);
  const [search, setSearch]     = useState("");
  const [orgId, setOrgId]       = useState(null);

  useEffect(()=>{
    const load=async()=>{
      const{data:{user}}=await supabase.auth.getUser();
      if(user){
        const{data:membership}=await supabase.from("org_memberships").select("org_id").eq("user_id",user.id).maybeSingle();
        if(membership)setOrgId(membership.org_id);
      }
      const{data}=await supabase.from("plm_programs").select("*").is("deleted_at",null).order("created_at",{ascending:false});
      setPrograms(data||[]); setLoading(false);
    };
    load();
  },[]);

  const filtered=programs.filter(p=>!search||p.name.toLowerCase().includes(search.toLowerCase())||p.brand?.toLowerCase().includes(search.toLowerCase()));
  const handleUpdate=u=>{setPrograms(p=>p.map(x=>x.id===u.id?u:x));setSelected(u);};
  const handleCreated=p=>{setPrograms(prev=>[p,...prev]);setSelected(p);setShowNew(false);};
  const deleteProgram=async id=>{
    await supabase.from("plm_programs").update({deleted_at:new Date().toISOString()}).eq("id",id);
    setPrograms(p=>p.filter(x=>x.id!==id));
    if(selected?.id===id)setSelected(null);
  };

  if(selected)return <ProgramDetail program={selected} onBack={()=>setSelected(null)} onUpdate={handleUpdate} />;

  return (
    <div style={{ display:"flex",flexDirection:"column",height:"100%" }}>
      <div style={{ padding:"14px 24px",borderBottom:"1px solid "+T.border,display:"flex",alignItems:"center",gap:12,flexShrink:0 }}>
        <div style={{ fontSize:18,fontWeight:700,color:T.text,flex:1 }}>Product Lifecycle</div>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search programs…" style={{ fontSize:12,padding:"6px 12px",background:T.surface2,border:"1px solid "+T.border,borderRadius:7,color:T.text,width:200,outline:"none" }} />
        <div style={{ display:"flex",background:T.surface2,border:"1px solid "+T.border,borderRadius:6,overflow:"hidden" }}>
          {[["pipeline","⬢ Pipeline"],["list","☰ List"]].map(([k,label])=>(
            <button key={k} onClick={()=>setView(k)} style={{ padding:"5px 12px",fontSize:12,fontWeight:600,background:view===k?T.accent:"transparent",color:view===k?"#fff":T.text3,border:"none",cursor:"pointer" }}>{label}</button>
          ))}
        </div>
        <button onClick={()=>setShowNew(true)} style={{ padding:"6px 14px",fontSize:12,fontWeight:600,background:T.accent,color:"#fff",border:"none",borderRadius:6,cursor:"pointer" }}>+ New Program</button>
      </div>

      <div style={{ display:"flex",gap:0,borderBottom:"1px solid "+T.border,padding:"0 24px",flexShrink:0 }}>
        {[{label:"Total Programs",val:programs.length},{label:"In Development",val:programs.filter(p=>["development","optimization","validation"].includes(p.current_stage)).length},{label:"Launch Ready",val:programs.filter(p=>p.current_stage==="launch_ready").length},{label:"Launched",val:programs.filter(p=>p.current_stage==="launched").length}].map(k=>(
          <div key={k.label} style={{ padding:"12px 20px",borderRight:"1px solid "+T.border }}>
            <div style={{ fontSize:18,fontWeight:700,color:T.text }}>{k.val}</div>
            <div style={{ fontSize:11,color:T.text3 }}>{k.label}</div>
          </div>
        ))}
      </div>

      <div style={{ flex:1,overflow:"auto",padding:"20px 24px" }}>
        {loading?<div style={{ color:T.text3,fontSize:13 }}>Loading programs…</div>
        :filtered.length===0?<EmptyState icon="⬡" text={search?"No programs match your search":"No programs yet — create your first one"} />
        :view==="pipeline"?(
          <div style={{ display:"flex",gap:12,overflowX:"auto",paddingBottom:16 }}>
            {STAGES.map(stage=>{
              const sp=filtered.filter(p=>p.current_stage===stage.key);
              return (
                <div key={stage.key} style={{ minWidth:200,flexShrink:0 }}>
                  <div style={{ display:"flex",alignItems:"center",gap:6,marginBottom:10 }}>
                    <div style={{ width:8,height:8,borderRadius:"50%",background:stage.color }} />
                    <div style={{ fontSize:11,fontWeight:700,color:T.text2,textTransform:"uppercase",letterSpacing:0.5 }}>{stage.label}</div>
                    <div style={{ marginLeft:"auto",fontSize:11,color:T.text3,background:T.surface2,borderRadius:4,padding:"1px 6px" }}>{sp.length}</div>
                  </div>
                  {sp.map(p=>(
                    <div key={p.id} onClick={()=>setSelected(p)} style={{ padding:"10px 12px",background:T.surface2,border:"1px solid "+T.border,borderRadius:8,cursor:"pointer",marginBottom:8 }}
                      onMouseEnter={e=>{e.currentTarget.style.borderColor=stage.color+"80";e.currentTarget.style.background=T.surface3;}}
                      onMouseLeave={e=>{e.currentTarget.style.borderColor=T.border;e.currentTarget.style.background=T.surface2;}}>
                      {p.brand&&<div style={{ fontSize:10,color:T.text3,marginBottom:2,fontWeight:600,textTransform:"uppercase" }}>{p.brand}</div>}
                      <div style={{ fontSize:13,fontWeight:600,color:T.text,marginBottom:4 }}>{p.name}</div>
                      <div style={{ display:"flex",gap:4,flexWrap:"wrap" }}>
                        <PriorityBadge priority={p.priority} />
                        {p.target_gross_margin_pct&&<span style={{ fontSize:10,fontWeight:700,background:"#22c55e15",color:"#22c55e",padding:"2px 7px",borderRadius:4 }}>GM {p.target_gross_margin_pct}%</span>}
                      </div>
                      {(p.target_markets_v2||[]).length>0&&<div style={{ marginTop:4,fontSize:10,color:T.text3 }}>📍 {p.target_markets_v2.join(" · ")}</div>}
                      {p.target_launch_date&&<div style={{ fontSize:10,color:T.text3,marginTop:3 }}>🎯 {p.target_launch_date}</div>}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        ):(
          <table style={{ width:"100%",borderCollapse:"collapse" }}>
            <thead><tr style={{ borderBottom:"1px solid "+T.border }}>{["Program","Type","Stage","Priority","Markets","Channels","GM% Target","Launch",""].map(h=><th key={h} style={{ padding:"7px 12px",textAlign:"left",fontSize:10,fontWeight:700,color:T.text3,textTransform:"uppercase",letterSpacing:0.5 }}>{h}</th>)}</tr></thead>
            <tbody>
              {filtered.map(p=>(
                <tr key={p.id} onClick={()=>setSelected(p)} style={{ borderBottom:"1px solid "+T.border,cursor:"pointer" }}
                  onMouseEnter={e=>e.currentTarget.style.background=T.surface2}
                  onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <td style={{ padding:"10px 12px",fontSize:13,fontWeight:500,color:T.text }}>{p.name}</td>
                  <td style={{ padding:"10px 12px",fontSize:12,color:T.text2 }}>{p.program_type?.replace(/_/g," ")}</td>
                  <td style={{ padding:"10px 12px" }}><StageBadge stage={p.current_stage} /></td>
                  <td style={{ padding:"10px 12px" }}><PriorityBadge priority={p.priority} /></td>
                  <td style={{ padding:"10px 12px",fontSize:11,color:T.text3 }}>{(p.target_markets_v2||[]).join(", ")||"—"}</td>
                  <td style={{ padding:"10px 12px",fontSize:11,color:T.text3,maxWidth:160,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>{(p.channels_v2||[]).join(", ")||"—"}</td>
                  <td style={{ padding:"10px 12px",fontSize:12,fontWeight:600,color:p.target_gross_margin_pct?"#22c55e":T.text3 }}>{p.target_gross_margin_pct?p.target_gross_margin_pct+"%":"—"}</td>
                  <td style={{ padding:"10px 12px",fontSize:12,color:T.text3 }}>{p.target_launch_date||"—"}</td>
                  <td style={{ padding:"10px 12px" }}><button onClick={e=>{e.stopPropagation();if(confirm("Delete this program?"))deleteProgram(p.id);}} style={{ background:"none",border:"none",color:T.text3,cursor:"pointer",fontSize:11,opacity:0.6 }}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showNew&&<NewProgramModal onClose={()=>setShowNew(false)} onCreated={handleCreated} orgId={orgId} />}
    </div>
  );
}
