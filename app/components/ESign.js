"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";
import { T } from "../tokens";
import { useResponsive } from "../lib/responsive";

const STATUS_COLORS = { draft:"#6b7280", sent:"#3b82f6", in_progress:"#f59e0b", completed:"#22c55e", declined:"#ef4444", voided:"#6b7280", expired:"#6b7280" };
const STATUS_LABELS = { draft:"Draft", sent:"Sent", in_progress:"In Progress", completed:"Completed", declined:"Declined", voided:"Voided", expired:"Expired" };
const SIGNER_STATUS = { pending:"⏳ Pending", sent:"📧 Sent", opened:"👁 Opened", signed:"✅ Signed", declined:"❌ Declined" };

const fmt = d => d ? new Date(d).toLocaleDateString("en-US", { month:"short", day:"numeric", year:"numeric" }) : "";
const fmtTime = d => d ? new Date(d).toLocaleString("en-US", { month:"short", day:"numeric", hour:"numeric", minute:"2-digit" }) : "";

// ══════════════════════════════════════════════════════════
// SIGNATURE PAD — Draw, Type, or Upload signature
// ══════════════════════════════════════════════════════════
function SignaturePad({ onSave, onCancel, label = "Signature" }) {
  const [mode, setMode] = useState("draw");
  const [typedName, setTypedName] = useState("");
  const [typedFont, setTypedFont] = useState("'Dancing Script', cursive");
  const canvasRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  const FONTS = [
    { name: "Script", value: "'Dancing Script', cursive" },
    { name: "Elegant", value: "'Great Vibes', cursive" },
    { name: "Casual", value: "'Caveat', cursive" },
    { name: "Classic", value: "Georgia, serif" },
  ];

  const startDraw = (e) => { setDrawing(true); const ctx = canvasRef.current?.getContext("2d"); if (!ctx) return; const r = canvasRef.current.getBoundingClientRect(); ctx.beginPath(); ctx.moveTo(e.clientX - r.left, e.clientY - r.top); };
  const draw = (e) => { if (!drawing) return; setHasDrawn(true); const ctx = canvasRef.current?.getContext("2d"); if (!ctx) return; const r = canvasRef.current.getBoundingClientRect(); ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.strokeStyle = T.text; ctx.lineTo(e.clientX - r.left, e.clientY - r.top); ctx.stroke(); };
  const endDraw = () => setDrawing(false);
  const clearCanvas = () => { const ctx = canvasRef.current?.getContext("2d"); if (ctx) { ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height); setHasDrawn(false); } };

  const handleSave = () => {
    if (mode === "draw") {
      if (!hasDrawn) return;
      onSave({ type: "draw", value: canvasRef.current.toDataURL("image/png") });
    } else if (mode === "type") {
      if (!typedName.trim()) return;
      onSave({ type: "type", value: typedName.trim(), font: typedFont });
    }
  };

  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, padding: 20 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: T.text3, marginBottom: 12, textTransform: "uppercase" }}>{label}</div>
      
      {/* Mode tabs */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
        {[{ id: "draw", label: "✏️ Draw" }, { id: "type", label: "⌨️ Type" }].map(m => (
          <button key={m.id} onClick={() => setMode(m.id)} style={{ padding: "6px 16px", fontSize: 12, fontWeight: 600, borderRadius: 6, border: `1px solid ${mode === m.id ? T.accent : T.border}`, background: mode === m.id ? T.accent + "15" : T.surface2, color: mode === m.id ? T.accent : T.text3, cursor: "pointer" }}>{m.label}</button>
        ))}
      </div>

      {mode === "draw" && (
        <div>
          <canvas ref={canvasRef} width={400} height={120} onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
            style={{ width: "100%", height: 120, border: `2px dashed ${T.border}`, borderRadius: 8, cursor: "crosshair", background: T.surface2 }} />
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
            <button onClick={clearCanvas} style={{ fontSize: 11, color: T.text3, background: "none", border: "none", cursor: "pointer" }}>Clear</button>
            <span style={{ fontSize: 10, color: T.text3 }}>Draw your signature above</span>
          </div>
        </div>
      )}

      {mode === "type" && (
        <div>
          <input value={typedName} onChange={e => setTypedName(e.target.value)} placeholder="Type your full name" style={{ width: "100%", padding: "12px 16px", fontSize: 22, fontFamily: typedFont, border: `2px dashed ${T.border}`, borderRadius: 8, background: T.surface2, color: T.text, outline: "none", boxSizing: "border-box" }} />
          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            {FONTS.map(f => (
              <button key={f.name} onClick={() => setTypedFont(f.value)} style={{ padding: "4px 12px", fontSize: 14, fontFamily: f.value, borderRadius: 6, border: `1px solid ${typedFont === f.value ? T.accent : T.border}`, background: typedFont === f.value ? T.accent + "15" : "transparent", color: T.text, cursor: "pointer" }}>{f.name}</button>
            ))}
          </div>
          {typedName && (
            <div style={{ marginTop: 12, padding: "16px 20px", background: T.surface2, borderRadius: 8, border: `1px solid ${T.border}` }}>
              <div style={{ fontSize: 10, color: T.text3, marginBottom: 4 }}>Preview</div>
              <div style={{ fontSize: 28, fontFamily: typedFont, color: T.text }}>{typedName}</div>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
        {onCancel && <button onClick={onCancel} style={{ padding: "8px 20px", fontSize: 12, fontWeight: 600, borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text3, cursor: "pointer" }}>Cancel</button>}
        <button onClick={handleSave} style={{ padding: "8px 24px", fontSize: 12, fontWeight: 700, borderRadius: 6, border: "none", background: T.accent, color: "#fff", cursor: "pointer", opacity: (mode === "draw" && !hasDrawn) || (mode === "type" && !typedName.trim()) ? 0.4 : 1 }}>
          Adopt & Sign
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ENVELOPE CREATOR — Create new signing request
// ══════════════════════════════════════════════════════════
function EnvelopeCreator({ onClose, onCreated, template }) {
  const { user, orgId } = useAuth();
  // If template has a document, skip to step 2 (signers)
  const hasTemplateDoc = !!(template?.document_url);
  const [step, setStep] = useState(hasTemplateDoc ? 2 : 1);
  const [title, setTitle] = useState(template?.name ? `${template.name}` : "");
  const [message, setMessage] = useState("");
  const [signingOrder, setSigningOrder] = useState("sequential");
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [documentUrl, setDocumentUrl] = useState(template?.document_url || "");
  const [supportingDocs, setSupportingDocs] = useState([]); // Additional supporting documents
  // Pre-fill signers from template roles (leave name/email blank for user to fill)
  const templateSigners = (template?.signer_roles || []).map((r, i) => ({ 
    name: "", email: "", role: "signer", signing_order: r.signing_order || i + 1, role_name: r.role_name 
  }));
  const [signers, setSigners] = useState(templateSigners.length > 0 ? templateSigners : [{ name: "", email: "", role: "signer", signing_order: 1 }]);
  const [sending, setSending] = useState(false);
  const templateId = template?.id || null;

  const addSigner = () => setSigners(p => [...p, { name: "", email: "", role: "signer", signing_order: p.length + 1 }]);
  const removeSigner = (i) => setSigners(p => p.filter((_, j) => j !== i));
  const updateSigner = (i, field, val) => setSigners(p => p.map((s, j) => j === i ? { ...s, [field]: val } : s));

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    const path = `${orgId}/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage.from("esign-documents").upload(path, file, { contentType: file.type });
    if (!error) {
      const url = `${supabase.supabaseUrl}/storage/v1/object/public/esign-documents/${path}`;
      setDocumentUrl(url);
    }
    setUploading(false);
  };

  const handleSend = async () => {
    if (!title.trim() || signers.some(s => !s.name.trim() || !s.email.trim())) return;
    setSending(true);
    try {
      // Create envelope
      const { data: envelope } = await supabase.from("esign_envelopes").insert({
        org_id: orgId, title: title.trim(), message: message.trim(), 
        document_url: documentUrl || null, template_id: templateId,
        signing_order: signingOrder, created_by: user?.id, status: "draft",
      }).select().single();
      if (!envelope) throw new Error("Failed to create envelope");

      // Increment template use_count
      if (templateId) {
        supabase.from("esign_templates").update({ use_count: (template?.use_count || 0) + 1 }).eq("id", templateId);
      }

      // Create signers
      for (const s of signers) {
        const { data: signer } = await supabase.from("esign_signers").insert({
          org_id: orgId, envelope_id: envelope.id,
          name: s.name.trim(), email: s.email.trim(), role: s.role, signing_order: s.signing_order,
        }).select().single();

        // Add default signature + date fields for each signer
        if (signer && s.role === "signer") {
          await supabase.from("esign_fields").insert([
            { org_id: orgId, envelope_id: envelope.id, signer_id: signer.id, field_type: "signature", label: "Signature", page_number: 1, x_pct: 10, y_pct: 80, width_pct: 30, height_pct: 8, required: true },
            { org_id: orgId, envelope_id: envelope.id, signer_id: signer.id, field_type: "date_signed", label: "Date", page_number: 1, x_pct: 45, y_pct: 82, width_pct: 15, height_pct: 4, required: true },
            { org_id: orgId, envelope_id: envelope.id, signer_id: signer.id, field_type: "name", label: "Printed Name", page_number: 1, x_pct: 10, y_pct: 88, width_pct: 30, height_pct: 4, required: true },
          ]);
        }
      }

      // Audit: created
      await supabase.from("esign_audit_log").insert({
        org_id: orgId, envelope_id: envelope.id,
        action: "created", actor_name: user?.email,
        details: `Envelope "${title}" created with ${signers.length} signer(s)`,
      });

      // Send the envelope
      await fetch(supabase.supabaseUrl + "/functions/v1/esign", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send", envelope_id: envelope.id, org_id: orgId }),
      });

      onCreated(envelope);
    } catch (e) { alert("Error: " + (e.message || e)); }
    setSending(false);
  };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} onClick={onClose} />
      <div onClick={e => e.stopPropagation()} style={{ position: "relative", width: 640, maxHeight: "85vh", overflow: "auto", background: T.surface, borderRadius: 16, border: `1px solid ${T.border}`, padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800 }}>New Signing Request</h2>
          <button onClick={onClose} style={{ background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 6, cursor: "pointer", color: T.text3, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>×</button>
        </div>

        {/* Step indicator */}
        <div style={{ display: "flex", gap: 4, marginBottom: 24 }}>
          {["Document", "Signers", "Send"].map((s, i) => (
            <div key={s} style={{ flex: 1, textAlign: "center", padding: "8px 0", borderRadius: 6, fontSize: 11, fontWeight: 700, background: step >= i + 1 ? T.accent + "15" : T.surface2, color: step >= i + 1 ? T.accent : T.text3, border: `1px solid ${step === i + 1 ? T.accent + "40" : T.border}` }}>{i + 1}. {s}</div>
          ))}
        </div>

        {/* Step 1: Document */}
        {step === 1 && (
          <div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.text3, marginBottom: 4, textTransform: "uppercase" }}>Document Title</div>
              <input value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. NDA — Acme Corp" style={{ width: "100%", padding: "10px 14px", fontSize: 14, border: `1px solid ${T.border}`, borderRadius: 8, background: T.surface, color: T.text, boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.text3, marginBottom: 4, textTransform: "uppercase" }}>Message to Signers (optional)</div>
              <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Please review and sign this document…" rows={3} style={{ width: "100%", padding: "10px 14px", fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 8, background: T.surface, color: T.text, resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.text3, marginBottom: 8, textTransform: "uppercase" }}>Document (optional — attach if signers need to review a file)</div>
              {!documentUrl ? (
                <div style={{ border: `2px dashed ${T.border}`, borderRadius: 12, padding: 32, textAlign: "center" }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📄</div>
                  <div style={{ fontSize: 12, color: T.text3, marginBottom: 10 }}>Upload a PDF, Word doc, or image — or skip if not needed</div>
                  <input type="file" accept=".pdf,.doc,.docx,.png,.jpg" onChange={e => { setFile(e.target.files?.[0]); }} style={{ marginBottom: 12 }} />
                  {file && !uploading && <button onClick={handleUpload} style={{ padding: "8px 20px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: "none", background: T.accent, color: "#fff", cursor: "pointer" }}>Upload</button>}
                  {uploading && <div style={{ fontSize: 12, color: T.text3 }}>Uploading…</div>}
                </div>
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: T.green + "15", border: `1px solid ${T.green}40`, borderRadius: 8 }}>
                  <span style={{ fontSize: 16 }}>✅</span>
                  <span style={{ fontSize: 13, color: T.text, flex: 1 }}>Document attached</span>
                  <button onClick={() => setDocumentUrl("")} style={{ fontSize: 10, color: T.text3, background: "none", border: "none", cursor: "pointer" }}>Remove</button>
                </div>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => setStep(2)} disabled={!title.trim()} style={{ padding: "10px 28px", fontSize: 13, fontWeight: 700, borderRadius: 8, border: "none", background: T.accent, color: "#fff", cursor: "pointer", opacity: !title.trim() ? 0.4 : 1 }}>Next: Add Signers →</button>
            </div>
          </div>
        )}

        {/* Step 2: Signers */}
        {step === 2 && (
          <div>
            {/* Template info banner */}
            {template && (
              <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: T.accent + "08", border: `1px solid ${T.accent}20`, borderRadius: 8, marginBottom: 16 }}>
                <span style={{ fontSize: 16 }}>📋</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.accent }}>Using template: {template.name}</div>
                  {documentUrl && <div style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>✅ Template document attached</div>}
                </div>
                <button onClick={() => setStep(1)} style={{ fontSize: 10, color: T.text3, background: "none", border: `1px solid ${T.border}`, borderRadius: 4, padding: "3px 8px", cursor: "pointer" }}>Edit Details</button>
              </div>
            )}
            <div style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: T.text3, marginBottom: 8, textTransform: "uppercase" }}>Signing Order</div>
              <div style={{ display: "flex", gap: 8 }}>
                {[{ id: "sequential", label: "Sequential — one at a time in order" }, { id: "parallel", label: "Parallel — everyone at once" }].map(o => (
                  <button key={o.id} onClick={() => setSigningOrder(o.id)} style={{ flex: 1, padding: "10px 14px", fontSize: 12, fontWeight: 600, borderRadius: 8, border: `1px solid ${signingOrder === o.id ? T.accent : T.border}`, background: signingOrder === o.id ? T.accent + "12" : T.surface2, color: signingOrder === o.id ? T.accent : T.text3, cursor: "pointer", textAlign: "left" }}>{o.label}</button>
                ))}
              </div>
            </div>
            
            {signers.map((s, i) => (
              <div key={i} style={{ display: "flex", gap: 8, marginBottom: 10, alignItems: "center" }}>
                <span style={{ width: 24, height: 24, borderRadius: "50%", background: T.accent + "20", color: T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                {s.role_name && <span style={{ fontSize: 10, fontWeight: 600, color: T.accent, background: T.accent + "12", padding: "3px 8px", borderRadius: 4, whiteSpace: "nowrap" }}>{s.role_name}</span>}
                <input value={s.name} onChange={e => updateSigner(i, "name", e.target.value)} placeholder={s.role_name ? `${s.role_name} — Full name` : "Full name"} style={{ flex: 1, padding: "8px 12px", fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface, color: T.text }} />
                <input value={s.email} onChange={e => updateSigner(i, "email", e.target.value)} placeholder="Email" type="email" style={{ flex: 1, padding: "8px 12px", fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface, color: T.text }} />
                <select value={s.role} onChange={e => updateSigner(i, "role", e.target.value)} style={{ padding: "8px 10px", fontSize: 11, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface, color: T.text }}>
                  <option value="signer">Signer</option>
                  <option value="cc">CC (copy)</option>
                  <option value="approver">Approver</option>
                  <option value="viewer">View only</option>
                </select>
                {signers.length > 1 && <button onClick={() => removeSigner(i)} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 14 }}>×</button>}
              </div>
            ))}
            <button onClick={addSigner} style={{ padding: "6px 14px", fontSize: 12, fontWeight: 600, borderRadius: 6, border: `1px dashed ${T.border}`, background: "transparent", color: T.text3, cursor: "pointer", marginBottom: 20, width: "100%" }}>+ Add Signer</button>
            
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <button onClick={() => setStep(1)} style={{ padding: "10px 20px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface2, color: T.text3, cursor: "pointer" }}>← Back</button>
              <button onClick={() => setStep(3)} disabled={signers.some(s => !s.name.trim() || !s.email.trim())} style={{ padding: "10px 28px", fontSize: 13, fontWeight: 700, borderRadius: 8, border: "none", background: T.accent, color: "#fff", cursor: "pointer", opacity: signers.some(s => !s.name.trim() || !s.email.trim()) ? 0.4 : 1 }}>Next: Review & Send →</button>
            </div>
          </div>
        )}

        {/* Step 3: Review & Send */}
        {step === 3 && (
          <div>
            {/* Document summary */}
            <div style={{ padding: 20, background: T.surface2, borderRadius: 12, marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: 14 }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, background: T.accent + "15", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, flexShrink: 0 }}>📄</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>{title}</div>
                  {message && <div style={{ fontSize: 12, color: T.text3, marginTop: 4, lineHeight: 1.5 }}>{message}</div>}
                  <div style={{ display: "flex", gap: 12, marginTop: 8, fontSize: 11, color: T.text3 }}>
                    {documentUrl && <span style={{ display: "flex", alignItems: "center", gap: 4 }}>📎 Document attached</span>}
                    {template && <span style={{ display: "flex", alignItems: "center", gap: 4 }}>📋 From template: {template.name}</span>}
                    <span>⇄ {signingOrder === "sequential" ? "Sequential signing" : "Parallel signing"}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Full document preview */}
            {documentUrl && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 10, display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 16 }}>📄</span> Document Preview
                </div>
                <div style={{ border: `1px solid ${T.border}`, borderRadius: 12, overflow: "hidden", background: "#f5f5f5" }}>
                  {documentUrl.toLowerCase().endsWith(".pdf") || documentUrl.includes("/pdf") ? (
                    <iframe src={documentUrl + "#toolbar=1&navpanes=0"} style={{ width: "100%", height: 500, border: "none" }} title="Document Preview" />
                  ) : documentUrl.match(/\.(png|jpg|jpeg|gif|webp)/i) ? (
                    <img src={documentUrl} alt="Document" style={{ width: "100%", maxHeight: 600, objectFit: "contain" }} />
                  ) : (
                    <div style={{ padding: 40, textAlign: "center" }}>
                      <div style={{ fontSize: 48, marginBottom: 12 }}>📄</div>
                      <div style={{ fontSize: 13, color: T.text2, marginBottom: 12 }}>Preview not available for this file type</div>
                      <a href={documentUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: T.accent, fontWeight: 600, textDecoration: "none" }}>Open Document ↗</a>
                    </div>
                  )}
                  <div style={{ padding: "8px 16px", background: T.surface, borderTop: `1px solid ${T.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 11, color: T.text3 }}>Review the document above before sending</span>
                    <a href={documentUrl} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, color: T.accent, fontWeight: 600, textDecoration: "none" }}>Open in new tab ↗</a>
                  </div>
                </div>
              </div>
            )}

            {/* Who signs what — detailed breakdown */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 16 }}>👥</span> Signing Workflow
              </div>
              
              {signers.map((s, i) => {
                const isLast = i === signers.length - 1;
                const roleName = s.role_name || `Signer ${i + 1}`;
                // Determine what fields this signer will fill
                const signerFields = s.role === "signer" 
                  ? [{ icon: "✍️", label: "Signature", desc: "Draw or type their legal signature" }, { icon: "📝", label: "Printed Name", desc: "Full legal name" }, { icon: "📅", label: "Date Signed", desc: "Auto-filled on signing" }]
                  : s.role === "approver" ? [{ icon: "✅", label: "Approval", desc: "Review and approve the document" }]
                  : s.role === "cc" ? [{ icon: "👁", label: "View Only", desc: "Receives a copy when complete" }]
                  : [{ icon: "👁", label: "View Only", desc: "Can view but not modify" }];

                return (
                  <div key={i} style={{ position: "relative", paddingLeft: 28 }}>
                    {/* Timeline line */}
                    {!isLast && <div style={{ position: "absolute", left: 13, top: 32, bottom: -8, width: 2, background: T.border }} />}
                    
                    {/* Step circle */}
                    <div style={{ position: "absolute", left: 4, top: 4, width: 20, height: 20, borderRadius: "50%", background: T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 800, color: "#fff" }}>{i + 1}</div>
                    
                    <div style={{ padding: "12px 16px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, marginBottom: 12 }}>
                      {/* Signer header */}
                      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{s.name}</span>
                            {s.role_name && <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 6px", borderRadius: 4, background: T.accent + "12", color: T.accent }}>{roleName}</span>}
                          </div>
                          <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>{s.email}</div>
                        </div>
                        <span style={{ fontSize: 10, fontWeight: 600, padding: "3px 10px", borderRadius: 20, background: s.role === "signer" ? T.accent + "12" : s.role === "cc" ? T.text3 + "12" : T.green + "12", color: s.role === "signer" ? T.accent : s.role === "cc" ? T.text3 : T.green }}>
                          {s.role === "signer" ? "✍️ Signer" : s.role === "cc" ? "📧 CC" : s.role === "approver" ? "✅ Approver" : "👁 Viewer"}
                        </span>
                      </div>
                      
                      {/* What they fill in */}
                      <div style={{ fontSize: 10, fontWeight: 600, color: T.text3, textTransform: "uppercase", marginBottom: 6, letterSpacing: 0.5 }}>Will complete:</div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {signerFields.map((f, fi) => (
                          <div key={fi} style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", background: T.surface2, borderRadius: 6, border: `1px solid ${T.border}` }}>
                            <span style={{ fontSize: 12 }}>{f.icon}</span>
                            <div>
                              <div style={{ fontSize: 11, fontWeight: 600, color: T.text }}>{f.label}</div>
                              <div style={{ fontSize: 9, color: T.text3 }}>{f.desc}</div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Signing order note */}
                      {signingOrder === "sequential" && (
                        <div style={{ fontSize: 10, color: T.text3, marginTop: 8, fontStyle: "italic" }}>
                          {i === 0 ? "📧 Will receive signing link immediately" : `⏳ Will receive signing link after ${signers[i-1]?.name || "previous signer"} signs`}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Delivery summary */}
            <div style={{ padding: 16, background: T.surface2, borderRadius: 10, marginBottom: 16 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: T.text, marginBottom: 8 }}>📬 Delivery Summary</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: T.accent }}>{signers.filter(s => s.role === "signer").length}</div>
                  <div style={{ fontSize: 10, color: T.text3 }}>Signers</div>
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>{signers.filter(s => s.role === "cc").length}</div>
                  <div style={{ fontSize: 10, color: T.text3 }}>CC Recipients</div>
                </div>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: T.text }}>{signingOrder === "sequential" ? "Sequential" : "Parallel"}</div>
                  <div style={{ fontSize: 10, color: T.text3 }}>Signing Order</div>
                </div>
              </div>
            </div>

            {/* Legal compliance notice */}
            <div style={{ padding: 14, background: T.accent + "06", border: `1px solid ${T.accent}15`, borderRadius: 8, marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: T.text2, lineHeight: 1.6 }}>
                <strong style={{ color: T.accent }}>🔒 Legal Compliance:</strong> Each signer receives a unique secure link and must consent to sign electronically.
                All actions are recorded in a tamper-evident audit trail. The document is SHA-256 hashed for integrity verification.
                Compliant with ESIGN Act, UETA, and eIDAS.
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <button onClick={() => setStep(2)} style={{ padding: "10px 20px", fontSize: 13, fontWeight: 600, borderRadius: 8, border: `1px solid ${T.border}`, background: T.surface2, color: T.text3, cursor: "pointer" }}>← Back</button>
              <button onClick={handleSend} disabled={sending} style={{ padding: "14px 40px", fontSize: 15, fontWeight: 800, borderRadius: 10, border: "none", background: T.accent, color: "#fff", cursor: "pointer", boxShadow: `0 4px 20px ${T.accent}40`, transition: "all 0.2s" }}>
                {sending ? "Sending…" : "Send for Signature ✉️"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// ENVELOPE DETAIL — View envelope status, audit trail, signers
// ══════════════════════════════════════════════════════════
function EnvelopeDetail({ envelope: env, onBack, onRefresh }) {
  const { user, orgId } = useAuth();
  const [signers, setSigners] = useState([]);
  const [auditLog, setAuditLog] = useState([]);
  const [showAudit, setShowAudit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: s }, { data: a }] = await Promise.all([
        supabase.from("esign_signers").select("*").eq("envelope_id", env.id).order("signing_order"),
        supabase.from("esign_audit_log").select("*").eq("envelope_id", env.id).order("timestamp"),
      ]);
      setSigners(s || []); setAuditLog(a || []); setLoading(false);
    })();
  }, [env.id]);

  const handleVoid = async () => {
    const reason = prompt("Reason for voiding this envelope:");
    if (reason === null) return;
    await fetch(supabase.supabaseUrl + "/functions/v1/esign", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "void", envelope_id: env.id, org_id: orgId, user_id: user?.id, reason }),
    });
    onRefresh();
  };

  const handleRemind = async () => {
    await fetch(supabase.supabaseUrl + "/functions/v1/esign", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "remind", envelope_id: env.id, org_id: orgId }),
    });
    alert("Reminders sent!");
  };

  const sc = STATUS_COLORS[env.status] || T.text3;

  return (
    <div>
      <button onClick={onBack} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 12, marginBottom: 16, display: "flex", alignItems: "center", gap: 4 }}>← Back to Documents</button>
      
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <h1 style={{ fontSize: 22, fontWeight: 800 }}>{env.title}</h1>
            <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: sc + "18", color: sc }}>{STATUS_LABELS[env.status]}</span>
          </div>
          {env.message && <div style={{ fontSize: 13, color: T.text3, marginTop: 4 }}>{env.message}</div>}
          <div style={{ fontSize: 11, color: T.text3, marginTop: 6 }}>Created {fmtTime(env.created_at)}{env.completed_at ? ` · Completed ${fmtTime(env.completed_at)}` : ""}</div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {["sent", "in_progress"].includes(env.status) && (
            <>
              <button onClick={handleRemind} style={{ padding: "6px 14px", fontSize: 11, fontWeight: 600, borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text, cursor: "pointer" }}>🔔 Remind</button>
              <button onClick={handleVoid} style={{ padding: "6px 14px", fontSize: 11, fontWeight: 600, borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.red, cursor: "pointer" }}>Void</button>
            </>
          )}
        </div>
      </div>

      {/* Signers */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: T.text3, textTransform: "uppercase", marginBottom: 10 }}>Signers</div>
        {signers.map((s, i) => (
          <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 8, marginBottom: 6 }}>
            <span style={{ width: 28, height: 28, borderRadius: "50%", background: s.status === "signed" ? T.green + "20" : T.surface3, color: s.status === "signed" ? T.green : T.text3, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 }}>{s.status === "signed" ? "✓" : i + 1}</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{s.name}</div>
              <div style={{ fontSize: 11, color: T.text3 }}>{s.email} · {s.role}</div>
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: STATUS_COLORS[s.status === "signed" ? "completed" : s.status === "declined" ? "declined" : "sent"] || T.text3 }}>
              {SIGNER_STATUS[s.status] || s.status}
            </div>
            {s.signed_at && <div style={{ fontSize: 10, color: T.text3 }}>{fmtTime(s.signed_at)}</div>}
          </div>
        ))}
      </div>

      {/* Document hash */}
      {env.document_hash && (
        <div style={{ padding: "12px 16px", background: T.surface2, borderRadius: 8, marginBottom: 24 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: T.text3, textTransform: "uppercase", marginBottom: 4 }}>Document Integrity (SHA-256)</div>
          <div style={{ fontSize: 10, fontFamily: "monospace", color: T.text2, wordBreak: "break-all" }}>{env.document_hash}</div>
        </div>
      )}

      {/* Signing Links (for manual sharing) */}
      {["sent", "in_progress"].includes(env.status) && signers.filter(s => s.status !== "signed").length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: T.text3, textTransform: "uppercase", marginBottom: 10 }}>Signing Links</div>
          <div style={{ fontSize: 11, color: T.text3, marginBottom: 8 }}>Copy and send these links directly to signers who haven't received the email.</div>
          {signers.filter(s => s.status !== "signed").map(s => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 6, marginBottom: 4 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: T.text, flex: 1 }}>{s.name}</span>
              <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/sign?token=${s.access_token}`); alert("Link copied!"); }} style={{ padding: "4px 12px", fontSize: 10, fontWeight: 600, borderRadius: 4, border: `1px solid ${T.border}`, background: T.surface2, color: T.text3, cursor: "pointer" }}>📋 Copy Link</button>
            </div>
          ))}
        </div>
      )}

      {/* Certificate of Completion */}
      {env.status === "completed" && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <span style={{ fontSize: 24 }}>🏆</span>
            <div>
              <div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>Document Completed</div>
              <div style={{ fontSize: 11, color: T.text3 }}>All parties have signed. This document is legally binding.</div>
            </div>
          </div>

          {/* Completed Document Card */}
          <div style={{ background: T.surface, border: `1px solid ${T.green}40`, borderRadius: 14, overflow: "hidden", marginBottom: 16 }}>
            <div style={{ padding: "16px 20px", background: T.green + "08", borderBottom: `1px solid ${T.green}30` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: T.green, textTransform: "uppercase", letterSpacing: 2 }}>Certificate of Completion</div>
              <div style={{ fontSize: 18, fontWeight: 800, color: T.text, marginTop: 4 }}>{env.title}</div>
              <div style={{ fontSize: 11, color: T.text3, marginTop: 4 }}>Completed {fmtTime(env.completed_at)} · Audit ID: {env.id?.slice(0, 8)}</div>
            </div>

            {/* Signer details with signatures */}
            <div style={{ padding: "16px 20px" }}>
              {signers.filter(s => s.role === "signer").map((s, i) => {
                const det = s.signer_details || {};
                return (
                  <div key={s.id} style={{ padding: "16px 0", borderBottom: i < signers.filter(x => x.role === "signer").length - 1 ? `1px solid ${T.border}` : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>{det.name || s.name}</div>
                        <div style={{ fontSize: 11, color: T.text3 }}>{det.title || ""}{det.title && det.company ? " at " : ""}{det.company || ""}</div>
                        <div style={{ fontSize: 10, color: T.text3, marginTop: 2 }}>{det.email || s.email}</div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: 11, color: T.green, fontWeight: 700 }}>✅ Signed</div>
                        <div style={{ fontSize: 10, color: T.text3 }}>{fmtTime(s.signed_at)}</div>
                      </div>
                    </div>

                    {/* Captured Signature */}
                    {s.signature_data && (
                      <div style={{ padding: 12, background: "#fafafa", borderRadius: 8, border: `1px solid ${T.border}`, marginBottom: 8 }}>
                        {s.signature_data.type === "draw" ? (
                          <img src={s.signature_data.value} alt="Signature" style={{ maxHeight: 50, display: "block" }} />
                        ) : (
                          <div style={{ fontSize: 24, fontFamily: s.signature_data.font || "Georgia, serif", color: T.text }}>{s.signature_data.value}</div>
                        )}
                      </div>
                    )}

                    {/* Signer Details Grid */}
                    {(det.company || det.company_address || det.entity_type || det.phone || det.jurisdiction) && (
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 16px", fontSize: 10, color: T.text2, marginTop: 6 }}>
                        {det.company && <div><span style={{ color: T.text3, fontWeight: 600 }}>Entity:</span> {det.company}</div>}
                        {det.entity_type && <div><span style={{ color: T.text3, fontWeight: 600 }}>Type:</span> {det.entity_type}</div>}
                        {det.company_address && <div style={{ gridColumn: "1 / -1" }}><span style={{ color: T.text3, fontWeight: 600 }}>Address:</span> {det.company_address}</div>}
                        {det.jurisdiction && <div><span style={{ color: T.text3, fontWeight: 600 }}>Jurisdiction:</span> {det.jurisdiction}</div>}
                        {det.phone && <div><span style={{ color: T.text3, fontWeight: 600 }}>Phone:</span> {det.phone}</div>}
                        {det.notices_email && <div><span style={{ color: T.text3, fontWeight: 600 }}>Notices Email:</span> {det.notices_email}</div>}
                      </div>
                    )}

                    {/* IP & consent */}
                    <div style={{ fontSize: 9, color: T.text3, marginTop: 6, display: "flex", gap: 12, flexWrap: "wrap" }}>
                      {s.consent_given && <span>✓ Consent given {fmtTime(s.consent_timestamp)}</span>}
                      {s.ip_address && <span>IP: {s.ip_address}</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Document hash */}
            {env.document_hash && (
              <div style={{ padding: "10px 20px", borderTop: `1px solid ${T.border}`, background: T.surface2 }}>
                <div style={{ fontSize: 9, fontFamily: "monospace", color: T.text3 }}>SHA-256: {env.document_hash}</div>
              </div>
            )}

            {/* Legal footer */}
            <div style={{ padding: "10px 20px", borderTop: `1px solid ${T.border}`, background: T.surface2 }}>
              <div style={{ fontSize: 9, color: T.text3, lineHeight: 1.5 }}>
                This certificate confirms that all parties signed electronically. Signatures are legally binding under the ESIGN Act, UETA, and eIDAS.
                All actions recorded in a tamper-evident audit trail.
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {/* Completed Document PDF — the main deliverable */}
            {env.completed_document_url ? (
              <a href={env.completed_document_url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 24px", borderRadius: 8, background: T.accent, border: "none", color: "#fff", fontSize: 13, fontWeight: 700, textDecoration: "none" }}>📥 Download Signed Document</a>
            ) : (
              <button disabled={generatingPdf} onClick={async () => {
                setGeneratingPdf(true);
                try {
                  const res = await fetch(supabase.supabaseUrl + "/functions/v1/esign-pdf", {
                    method: "POST", headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ envelope_id: env.id }),
                  });
                  const result = await res.json();
                  if (result.success && result.url) {
                    window.open(result.url, "_blank");
                    onRefresh(); // Reload to show the download link
                  } else { alert("PDF generation failed: " + (result.error || "Unknown error")); }
                } catch (e) { alert("Error: " + e.message); }
                setGeneratingPdf(false);
              }} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 24px", borderRadius: 8, background: T.accent, border: "none", color: "#fff", fontSize: 13, fontWeight: 700, cursor: generatingPdf ? "wait" : "pointer", opacity: generatingPdf ? 0.6 : 1 }}>
                {generatingPdf ? "⏳ Generating PDF…" : "📄 Generate Signed Document"}
              </button>
            )}
            {env.document_url && (
              <a href={env.document_url} target="_blank" rel="noopener noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 20px", borderRadius: 8, background: T.surface, border: `1px solid ${T.border}`, color: T.text, fontSize: 12, fontWeight: 600, textDecoration: "none" }}>📄 Original Document</a>
            )}
            <button onClick={() => {
              // Generate and download completion certificate as printable HTML
              const certSigners = signers.filter(s => s.role === "signer");
              const certHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Certificate - ${env.title}</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:800px;margin:0 auto;padding:40px;color:#1a1a2e}
.header{text-align:center;border-bottom:3px solid #6366f1;padding-bottom:20px;margin-bottom:30px}
.header h1{font-size:14px;text-transform:uppercase;letter-spacing:3px;color:#6366f1;margin:0}
.header h2{font-size:24px;margin:10px 0 4px}
.header p{font-size:12px;color:#666}
.signer{border:1px solid #e2e3e8;border-radius:12px;padding:20px;margin-bottom:16px;page-break-inside:avoid}
.signer-name{font-size:16px;font-weight:700}
.signer-title{font-size:12px;color:#666;margin-top:2px}
.sig-box{background:#fafafa;border:1px solid #e2e3e8;border-radius:8px;padding:16px;margin:12px 0;min-height:50px}
.sig-box img{max-height:60px}
.sig-box .typed{font-size:28px;color:#1a1a2e}
.detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px 20px;font-size:11px;color:#444;margin-top:10px}
.detail-grid .label{color:#888;font-weight:600}
.meta{font-size:10px;color:#888;margin-top:8px}
.hash{font-family:monospace;font-size:10px;color:#888;padding:10px;background:#f5f5f8;border-radius:6px;margin:20px 0;word-break:break-all}
.legal{font-size:10px;color:#888;line-height:1.6;border-top:2px solid #e2e3e8;padding-top:16px;margin-top:24px}
@media print{body{padding:20px}.signer{break-inside:avoid}}
</style></head><body>
<div class="header">
  <h1>Certificate of Completion</h1>
  <h2>${env.title}</h2>
  <p>Completed ${new Date(env.completed_at).toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric",hour:"numeric",minute:"2-digit"})}</p>
  <p>Envelope ID: ${env.id}</p>
</div>
${certSigners.map((s,i) => {
  const d = s.signer_details || {};
  const sigHtml = s.signature_data?.type === "draw" 
    ? `<img src="${s.signature_data.value}" alt="Signature"/>` 
    : s.signature_data?.value 
      ? `<div class="typed" style="font-family:${s.signature_data.font || 'Georgia,serif'}">${s.signature_data.value}</div>`
      : '<div style="color:#888">Signature on file</div>';
  return `<div class="signer">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <div class="signer-name">${d.name || s.name}</div>
        <div class="signer-title">${d.title||''}${d.title&&d.company?' at ':''}${d.company||''}</div>
      </div>
      <div style="text-align:right;font-size:11px;color:#22c55e;font-weight:700">✅ Signed<br><span style="color:#888;font-weight:400">${new Date(s.signed_at).toLocaleString()}</span></div>
    </div>
    <div class="sig-box">${sigHtml}</div>
    <div class="detail-grid">
      ${d.email?`<div><span class="label">Email:</span> ${d.email}</div>`:''}
      ${d.phone?`<div><span class="label">Phone:</span> ${d.phone}</div>`:''}
      ${d.company?`<div><span class="label">Entity:</span> ${d.company}</div>`:''}
      ${d.entity_type?`<div><span class="label">Type:</span> ${d.entity_type}</div>`:''}
      ${d.company_address?`<div style="grid-column:1/-1"><span class="label">Address:</span> ${d.company_address}</div>`:''}
      ${d.jurisdiction?`<div><span class="label">Jurisdiction:</span> ${d.jurisdiction}</div>`:''}
      ${d.notices_email?`<div><span class="label">Notices:</span> ${d.notices_email}</div>`:''}
    </div>
    <div class="meta">Consent: ${s.consent_given?'Yes':'No'} · IP: ${s.ip_address||'N/A'}</div>
  </div>`;
}).join('')}
${env.document_hash?`<div class="hash">Document Hash (SHA-256): ${env.document_hash}</div>`:''}
<div class="legal">
  This certificate confirms that all parties listed above signed the document "<strong>${env.title}</strong>" electronically.
  Each signer provided consent to sign electronically in accordance with the Electronic Signatures in Global and National Commerce Act (ESIGN Act),
  the Uniform Electronic Transactions Act (UETA), and the European Regulation on Electronic Identification and Trust Services (eIDAS).
  All signing events were recorded in a tamper-evident audit trail with timestamps, IP addresses, and user agents.
  The document integrity has been verified using SHA-256 cryptographic hashing.
</div>
</body></html>`;
              const blob = new Blob([certHtml], { type: "text/html" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url; a.download = `Certificate_${env.title.replace(/[^a-zA-Z0-9]/g, "_")}.html`; a.click();
              URL.revokeObjectURL(url);
            }} style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "10px 20px", borderRadius: 8, background: T.accent, border: "none", color: "#fff", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>📥 Download Certificate</button>
          </div>
        </div>
      )}

      {/* Audit Trail */}
      <div>
        <button onClick={() => setShowAudit(!showAudit)} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", fontSize: 12, fontWeight: 700, color: T.text3, textTransform: "uppercase", marginBottom: 12 }}>
          📋 Audit Trail ({auditLog.length} events) {showAudit ? "▾" : "▸"}
        </button>
        {showAudit && (
          <div style={{ border: `1px solid ${T.border}`, borderRadius: 10, overflow: "hidden" }}>
            {auditLog.map((log, i) => (
              <div key={log.id} style={{ padding: "10px 16px", borderBottom: i < auditLog.length - 1 ? `1px solid ${T.border}` : "none", background: i % 2 === 0 ? T.surface : T.surface2 }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: T.text }}>{log.action.replace(/_/g, " ").toUpperCase()}</span>
                  <span style={{ fontSize: 10, color: T.text3 }}>{fmtTime(log.timestamp)}</span>
                </div>
                <div style={{ fontSize: 11, color: T.text2 }}>{log.details}</div>
                {log.ip_address && <div style={{ fontSize: 9, color: T.text3, fontFamily: "monospace", marginTop: 2 }}>IP: {log.ip_address} · UA: {(log.user_agent || "").substring(0, 60)}…</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// MAIN ESIGN VIEW
// ══════════════════════════════════════════════════════════
export default function ESignView() {
  const { isMobile } = useResponsive();
  const { user, orgId } = useAuth();
  const [envelopes, setEnvelopes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [templates, setTemplates] = useState([]);
  const [tab, setTab] = useState("envelopes"); // "envelopes" | "templates"
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [newTmpl, setNewTmpl] = useState({ name: "", description: "" });
  const [activeTemplate, setActiveTemplate] = useState(null);
  const [editingTemplate, setEditingTemplate] = useState(null);

  const loadData = async () => {
    const [{ data: envs }, { data: tmpl }] = await Promise.all([
      supabase.from("esign_envelopes").select("*, esign_signers(id, name, email, status, signed_at, role, signing_order)").eq("org_id", orgId).order("created_at", { ascending: false }),
      supabase.from("esign_templates").select("*").eq("org_id", orgId).eq("is_active", true).order("name"),
    ]);
    setEnvelopes(envs || []); setTemplates(tmpl || []); setLoading(false);
  };

  useEffect(() => { if (orgId) loadData(); }, [orgId]);

  if (selected) return <EnvelopeDetail envelope={selected} onBack={() => { setSelected(null); loadData(); }} onRefresh={() => { loadData(); setSelected(null); }} />;

  const filtered = envelopes.filter(e => {
    if (filter !== "all" && e.status !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return e.title?.toLowerCase().includes(q) || e.esign_signers?.some(s => s.name?.toLowerCase().includes(q) || s.email?.toLowerCase().includes(q));
    }
    return true;
  });

  const counts = { all: envelopes.length, draft: 0, sent: 0, in_progress: 0, completed: 0, declined: 0, voided: 0 };
  envelopes.forEach(e => { if (counts[e.status] !== undefined) counts[e.status]++; });

  return (
    <div style={{ padding: isMobile ? 16 : 28, maxWidth: 1100, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 900, color: T.text }}>Documents & Signatures</div>
          <div style={{ fontSize: 12, color: T.text3, marginTop: 2 }}>Legally compliant electronic signatures — ESIGN Act, UETA, eIDAS</div>
        </div>
        <button onClick={() => setShowCreate(true)} style={{ padding: "10px 24px", fontSize: 13, fontWeight: 700, borderRadius: 8, border: "none", background: T.accent, color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
          ✉️ New Signing Request
        </button>
      </div>

      {/* Tab switcher */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20 }}>
        {[{ id: "envelopes", label: `Documents (${envelopes.length})`, icon: "📄" }, { id: "templates", label: `Templates (${templates.length})`, icon: "📋" }].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{ padding: "8px 18px", fontSize: 12, fontWeight: 700, borderRadius: 8, border: `1px solid ${tab === t.id ? T.accent + "40" : T.border}`, background: tab === t.id ? T.accent + "12" : T.surface, color: tab === t.id ? T.accent : T.text3, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>{t.icon} {t.label}</button>
        ))}
      </div>

      {/* Summary cards */}
      {tab === "envelopes" && <>
      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "repeat(3, 1fr)" : "repeat(6, 1fr)", gap: 8, marginBottom: 20 }}>
        {[
          { key: "all", label: "All", icon: "📄" },
          { key: "sent", label: "Sent", icon: "📧" },
          { key: "in_progress", label: "In Progress", icon: "⏳" },
          { key: "completed", label: "Completed", icon: "✅" },
          { key: "declined", label: "Declined", icon: "❌" },
          { key: "draft", label: "Drafts", icon: "📝" },
        ].map(c => (
          <div key={c.key} onClick={() => setFilter(c.key)} style={{ padding: "12px 10px", textAlign: "center", borderRadius: 10, cursor: "pointer", background: filter === c.key ? T.accent + "12" : T.surface, border: `1px solid ${filter === c.key ? T.accent + "40" : T.border}`, transition: "all 0.15s" }}>
            <div style={{ fontSize: 18 }}>{c.icon}</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: T.text }}>{counts[c.key]}</div>
            <div style={{ fontSize: 10, color: T.text3 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 10, background: T.surface, border: `1px solid ${T.border}`, marginBottom: 16 }}>
        <span style={{ fontSize: 14 }}>🔍</span>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search documents, signers…" style={{ background: "transparent", border: "none", outline: "none", color: T.text, fontSize: 13, width: "100%", flex: 1 }} />
      </div>

      {/* Envelope list */}
      {loading ? <div style={{ padding: 40, textAlign: "center", color: T.text3 }}>Loading…</div> : filtered.length === 0 ? (
        <div style={{ padding: 60, textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✍️</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 4 }}>No documents yet</div>
          <div style={{ fontSize: 13, color: T.text3 }}>Create your first signing request to get started</div>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {filtered.map(env => {
            const sc = STATUS_COLORS[env.status];
            const signers = env.esign_signers || [];
            const signed = signers.filter(s => s.status === "signed").length;
            const total = signers.filter(s => s.role === "signer").length;
            return (
              <div key={env.id} onClick={() => setSelected(env)} style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 18px", background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, cursor: "pointer", transition: "all 0.15s" }} onMouseEnter={e => e.currentTarget.style.borderColor = T.accent + "40"} onMouseLeave={e => e.currentTarget.style.borderColor = T.border}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: sc + "15", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
                  {env.status === "completed" ? "✅" : env.status === "declined" ? "❌" : env.status === "draft" ? "📝" : "📄"}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{env.title}</div>
                  <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>
                    {signers.map(s => s.name).join(", ")} · {fmt(env.created_at)}
                  </div>
                </div>
                <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 10, fontWeight: 700, background: sc + "18", color: sc, whiteSpace: "nowrap" }}>{STATUS_LABELS[env.status]}</span>
                {total > 0 && (
                  <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <div style={{ width: 60, height: 6, borderRadius: 3, background: T.surface3, overflow: "hidden" }}>
                      <div style={{ width: `${(signed / total) * 100}%`, height: "100%", background: T.green, borderRadius: 3, transition: "width 0.3s" }} />
                    </div>
                    <span style={{ fontSize: 10, color: T.text3, whiteSpace: "nowrap" }}>{signed}/{total}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      </>}

      {showCreate && <EnvelopeCreator template={activeTemplate} onClose={() => { setShowCreate(false); setActiveTemplate(null); }} onCreated={(env) => { setShowCreate(false); setActiveTemplate(null); loadData(); }} />}

      {/* Templates tab */}
      {tab === "templates" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>Saved Templates</div>
            <button onClick={() => setShowNewTemplate(true)} style={{ padding: "8px 18px", fontSize: 12, fontWeight: 700, borderRadius: 8, border: "none", background: T.accent, color: "#fff", cursor: "pointer" }}>+ New Template</button>
          </div>

          {showNewTemplate && (
            <div style={{ padding: 24, background: T.surface, border: `1px solid ${T.border}`, borderRadius: 12, marginBottom: 20, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: T.text, marginBottom: 16 }}>Create Template</div>
              
              {/* Name & Description */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: T.text3, marginBottom: 4, textTransform: "uppercase" }}>Template Name *</div>
                  <input value={newTmpl.name} onChange={e => setNewTmpl(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Standard NDA" style={{ width: "100%", padding: "10px 14px", fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 8, background: T.surface, color: T.text, boxSizing: "border-box" }} />
                </div>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 600, color: T.text3, marginBottom: 4, textTransform: "uppercase" }}>Description</div>
                  <input value={newTmpl.description} onChange={e => setNewTmpl(p => ({ ...p, description: e.target.value }))} placeholder="Brief description of this template" style={{ width: "100%", padding: "10px 14px", fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 8, background: T.surface, color: T.text, boxSizing: "border-box" }} />
                </div>
              </div>

              {/* Document Upload */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: T.text3, marginBottom: 6, textTransform: "uppercase" }}>Template Document</div>
                {!newTmpl.document_url ? (
                  <div style={{ border: `2px dashed ${T.border}`, borderRadius: 10, padding: 24, textAlign: "center" }}>
                    <div style={{ fontSize: 28, marginBottom: 6 }}>📄</div>
                    <div style={{ fontSize: 12, color: T.text3, marginBottom: 10 }}>Upload PDF, Word, or image file</div>
                    <input type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setNewTmpl(p => ({ ...p, uploading: true }));
                      const path = `templates/${orgId}/${Date.now()}_${file.name}`;
                      const { error } = await supabase.storage.from("esign-documents").upload(path, file, { contentType: file.type, upsert: true });
                      if (!error) {
                        const url = `${supabase.supabaseUrl}/storage/v1/object/public/esign-documents/${path}`;
                        setNewTmpl(p => ({ ...p, document_url: url, document_name: file.name, uploading: false }));
                      } else {
                        alert("Upload failed: " + error.message);
                        setNewTmpl(p => ({ ...p, uploading: false }));
                      }
                      e.target.value = "";
                    }} style={{ fontSize: 12 }} />
                    {newTmpl.uploading && <div style={{ fontSize: 11, color: T.accent, marginTop: 8 }}>Uploading…</div>}
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "12px 16px", background: T.green + "10", border: `1px solid ${T.green}30`, borderRadius: 8 }}>
                    <span style={{ fontSize: 16 }}>✅</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>{newTmpl.document_name}</div>
                      <div style={{ fontSize: 10, color: T.text3 }}>Document uploaded</div>
                    </div>
                    <button onClick={() => setNewTmpl(p => ({ ...p, document_url: null, document_name: null }))} style={{ fontSize: 10, color: T.text3, background: "none", border: "none", cursor: "pointer" }}>Remove</button>
                  </div>
                )}
              </div>

              {/* Signer Roles */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 600, color: T.text3, marginBottom: 6, textTransform: "uppercase" }}>Signer Roles</div>
                <div style={{ fontSize: 11, color: T.text3, marginBottom: 8 }}>Define the roles that need to sign. When using this template, you'll assign real people to each role.</div>
                {(newTmpl.signer_roles || [{ role_name: "", signing_order: 1 }]).map((r, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
                    <span style={{ width: 22, height: 22, borderRadius: "50%", background: T.accent + "20", color: T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{i + 1}</span>
                    <input value={r.role_name} onChange={e => {
                      const roles = [...(newTmpl.signer_roles || [{ role_name: "", signing_order: 1 }])];
                      roles[i] = { ...roles[i], role_name: e.target.value };
                      setNewTmpl(p => ({ ...p, signer_roles: roles }));
                    }} placeholder={`e.g. ${i === 0 ? "Earth Breeze Signatory" : "Counterparty Signatory"}`} style={{ flex: 1, padding: "8px 12px", fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface, color: T.text }} />
                    {(newTmpl.signer_roles || []).length > 1 && (
                      <button onClick={() => {
                        const roles = (newTmpl.signer_roles || []).filter((_, j) => j !== i);
                        setNewTmpl(p => ({ ...p, signer_roles: roles }));
                      }} style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 12 }}>×</button>
                    )}
                  </div>
                ))}
                <button onClick={() => {
                  const roles = [...(newTmpl.signer_roles || []), { role_name: "", signing_order: (newTmpl.signer_roles || []).length + 1 }];
                  setNewTmpl(p => ({ ...p, signer_roles: roles }));
                }} style={{ padding: "4px 12px", fontSize: 11, fontWeight: 600, borderRadius: 6, border: `1px dashed ${T.border}`, background: "transparent", color: T.text3, cursor: "pointer", width: "100%" }}>+ Add Role</button>
              </div>

              {/* Actions */}
              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", borderTop: `1px solid ${T.border}`, paddingTop: 16 }}>
                <button onClick={() => { setShowNewTemplate(false); setNewTmpl({ name: "", description: "" }); }} style={{ padding: "8px 18px", fontSize: 12, fontWeight: 600, border: `1px solid ${T.border}`, borderRadius: 8, background: T.surface2, color: T.text3, cursor: "pointer" }}>Cancel</button>
                <button onClick={async () => {
                  if (!newTmpl.name.trim()) { alert("Template name required"); return; }
                  const roles = (newTmpl.signer_roles || [{ role_name: "Signer 1", signing_order: 1 }]).filter(r => r.role_name.trim()).map((r, i) => ({ ...r, signing_order: i + 1 }));
                  await supabase.from("esign_templates").insert({
                    org_id: orgId, name: newTmpl.name.trim(), description: newTmpl.description?.trim() || null,
                    document_url: newTmpl.document_url || null,
                    created_by: user?.id, signer_roles: roles.length ? roles : [{ role_name: "Signer 1", signing_order: 1 }],
                  });
                  setShowNewTemplate(false); setNewTmpl({ name: "", description: "" }); loadData();
                }} disabled={!newTmpl.name.trim()} style={{ padding: "8px 24px", fontSize: 12, fontWeight: 700, border: "none", borderRadius: 8, background: T.accent, color: "#fff", cursor: "pointer", opacity: !newTmpl.name.trim() ? 0.4 : 1 }}>Save Template</button>
              </div>
            </div>
          )}

          {templates.length === 0 ? (
            <div style={{ padding: 40, textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>📋</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>No templates yet</div>
              <div style={{ fontSize: 12, color: T.text3, marginTop: 4 }}>Create templates for documents you send frequently — NDAs, contracts, offer letters, etc.</div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {templates.map(tmpl => {
                const roles = tmpl.signer_roles || [];
                const isEditing = editingTemplate?.id === tmpl.id;
                return (
                  <div key={tmpl.id} style={{ background: T.surface, border: `1px solid ${isEditing ? T.accent + "50" : T.border}`, borderRadius: 12, overflow: "hidden" }}>
                    <div style={{ padding: "16px 20px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                        <div style={{ width: 42, height: 42, borderRadius: 10, background: T.accent + "12", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>📋</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 15, fontWeight: 700, color: T.text }}>{tmpl.name}</div>
                          <div style={{ fontSize: 11, color: T.text3, marginTop: 2 }}>{tmpl.description || "No description"}</div>
                          <div style={{ display: "flex", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                            {tmpl.document_url && <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 4, background: T.green + "15", color: T.green, fontWeight: 600 }}>📄 Document attached</span>}
                            {!tmpl.document_url && <span style={{ fontSize: 9, padding: "2px 8px", borderRadius: 4, background: T.yellow + "15", color: T.yellow, fontWeight: 600 }}>⚠ No document</span>}
                            {roles.map((r, i) => (
                              <span key={i} style={{ fontSize: 9, padding: "2px 8px", borderRadius: 4, background: T.accent + "12", color: T.accent, fontWeight: 600 }}>#{i+1} {r.role_name}</span>
                            ))}
                            <span style={{ fontSize: 9, color: T.text3 }}>Used {tmpl.use_count || 0}×</span>
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button onClick={() => { setActiveTemplate(tmpl); setShowCreate(true); }}
                            style={{ padding: "8px 18px", fontSize: 12, fontWeight: 700, borderRadius: 8, border: "none", background: T.accent, color: "#fff", cursor: "pointer" }}>Send</button>
                          <button onClick={() => setEditingTemplate(isEditing ? null : { ...tmpl, signer_roles: [...(tmpl.signer_roles || [])] })}
                            style={{ padding: "6px 14px", fontSize: 12, fontWeight: 600, borderRadius: 6, border: `1px solid ${isEditing ? T.accent : T.border}`, background: isEditing ? T.accent + "10" : T.surface2, color: isEditing ? T.accent : T.text3, cursor: "pointer" }}>{isEditing ? "Close" : "✏️ Edit"}</button>
                          <button onClick={async () => { if (!confirm(`Delete "${tmpl.name}"?`)) return; await supabase.from("esign_templates").update({ is_active: false }).eq("id", tmpl.id); loadData(); }}
                            style={{ padding: "6px 10px", fontSize: 12, borderRadius: 6, border: `1px solid ${T.border}`, background: T.surface2, color: T.text3, cursor: "pointer" }}>🗑</button>
                        </div>
                      </div>
                    </div>
                    
                    {/* Inline edit panel */}
                    {isEditing && (
                      <div style={{ padding: "0 20px 20px", borderTop: `1px solid ${T.border}` }}>
                        <div style={{ paddingTop: 16, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 600, color: T.text3, marginBottom: 4, textTransform: "uppercase" }}>Template Name</div>
                            <input value={editingTemplate.name} onChange={e => setEditingTemplate(p => ({ ...p, name: e.target.value }))}
                              style={{ width: "100%", padding: "8px 12px", fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface, color: T.text, boxSizing: "border-box" }} />
                          </div>
                          <div>
                            <div style={{ fontSize: 10, fontWeight: 600, color: T.text3, marginBottom: 4, textTransform: "uppercase" }}>Description</div>
                            <input value={editingTemplate.description || ""} onChange={e => setEditingTemplate(p => ({ ...p, description: e.target.value }))}
                              style={{ width: "100%", padding: "8px 12px", fontSize: 13, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface, color: T.text, boxSizing: "border-box" }} />
                          </div>
                        </div>

                        {/* Document upload */}
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ fontSize: 10, fontWeight: 600, color: T.text3, marginBottom: 6, textTransform: "uppercase" }}>Template Document</div>
                          {editingTemplate.document_url ? (
                            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: T.green + "10", border: `1px solid ${T.green}30`, borderRadius: 8 }}>
                              <span style={{ fontSize: 14 }}>✅</span>
                              <span style={{ fontSize: 12, color: T.text, flex: 1 }}>Document attached</span>
                              <a href={editingTemplate.document_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 10, color: T.accent, textDecoration: "none", fontWeight: 600 }}>View ↗</a>
                              <button onClick={() => setEditingTemplate(p => ({ ...p, document_url: null }))} style={{ fontSize: 10, color: T.text3, background: "none", border: "none", cursor: "pointer" }}>Remove</button>
                            </div>
                          ) : (
                            <div style={{ border: `2px dashed ${T.border}`, borderRadius: 8, padding: 16, textAlign: "center" }}>
                              <div style={{ fontSize: 11, color: T.text3, marginBottom: 8 }}>Upload PDF, Word, or image</div>
                              <input type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const path = `templates/${orgId}/${Date.now()}_${file.name}`;
                                const { error } = await supabase.storage.from("esign-documents").upload(path, file, { contentType: file.type, upsert: true });
                                if (!error) {
                                  const url = `${supabase.supabaseUrl}/storage/v1/object/public/esign-documents/${path}`;
                                  setEditingTemplate(p => ({ ...p, document_url: url }));
                                } else { alert("Upload failed: " + error.message); }
                                e.target.value = "";
                              }} style={{ fontSize: 11 }} />
                            </div>
                          )}
                        </div>

                        {/* Signer roles */}
                        <div style={{ marginBottom: 16 }}>
                          <div style={{ fontSize: 10, fontWeight: 600, color: T.text3, marginBottom: 6, textTransform: "uppercase" }}>Signer Roles</div>
                          {(editingTemplate.signer_roles || []).map((r, i) => (
                            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 6, alignItems: "center" }}>
                              <span style={{ width: 20, height: 20, borderRadius: "50%", background: T.accent + "20", color: T.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, flexShrink: 0 }}>{i+1}</span>
                              <input value={r.role_name} onChange={e => {
                                const roles = [...editingTemplate.signer_roles];
                                roles[i] = { ...roles[i], role_name: e.target.value };
                                setEditingTemplate(p => ({ ...p, signer_roles: roles }));
                              }} style={{ flex: 1, padding: "6px 10px", fontSize: 12, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface, color: T.text }} />
                              {editingTemplate.signer_roles.length > 1 && (
                                <button onClick={() => setEditingTemplate(p => ({ ...p, signer_roles: p.signer_roles.filter((_, j) => j !== i) }))}
                                  style={{ background: "none", border: "none", color: T.text3, cursor: "pointer", fontSize: 11 }}>×</button>
                              )}
                            </div>
                          ))}
                          <button onClick={() => setEditingTemplate(p => ({ ...p, signer_roles: [...(p.signer_roles || []), { role_name: "", signing_order: (p.signer_roles || []).length + 1 }] }))}
                            style={{ padding: "4px 10px", fontSize: 10, fontWeight: 600, borderRadius: 4, border: `1px dashed ${T.border}`, background: "transparent", color: T.text3, cursor: "pointer", width: "100%" }}>+ Add Role</button>
                        </div>

                        {/* Save / Cancel */}
                        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                          <button onClick={() => setEditingTemplate(null)}
                            style={{ padding: "6px 16px", fontSize: 11, fontWeight: 600, border: `1px solid ${T.border}`, borderRadius: 6, background: T.surface2, color: T.text3, cursor: "pointer" }}>Cancel</button>
                          <button onClick={async () => {
                            const roles = (editingTemplate.signer_roles || []).filter(r => r.role_name?.trim()).map((r, i) => ({ ...r, signing_order: i + 1 }));
                            await supabase.from("esign_templates").update({
                              name: editingTemplate.name?.trim(), description: editingTemplate.description?.trim() || null,
                              document_url: editingTemplate.document_url || null, signer_roles: roles.length ? roles : [{ role_name: "Signer 1", signing_order: 1 }],
                            }).eq("id", tmpl.id);
                            setEditingTemplate(null); loadData();
                          }} style={{ padding: "6px 20px", fontSize: 11, fontWeight: 700, border: "none", borderRadius: 6, background: T.accent, color: "#fff", cursor: "pointer" }}>Save Changes</button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
