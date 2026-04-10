"use client";
import { useState, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";

const EDGE_BASE = "https://upbjdmnykheubxkuknuj.supabase.co/functions/v1";

// Google Fonts for signature styles
const FONT_LINK = "https://fonts.googleapis.com/css2?family=Dancing+Script:wght@400;700&family=Great+Vibes&family=Caveat:wght@400;700&display=swap";
const FONTS = [
  { name: "Script", value: "'Dancing Script', cursive" },
  { name: "Elegant", value: "'Great Vibes', cursive" },
  { name: "Casual", value: "'Caveat', cursive" },
  { name: "Classic", value: "Georgia, serif" },
];

function SigningPageContent() {
  const params = useSearchParams();
  const token = params.get("token");

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [data, setData] = useState(null); // { signer, envelope, fields, signers }
  const [fieldValues, setFieldValues] = useState({});
  const [signatureData, setSignatureData] = useState(null);
  const [initialsData, setInitialsData] = useState(null);
  const [consent, setConsent] = useState(false);
  const [signing, setSigning] = useState(false);
  const [done, setDone] = useState(false);
  const [declined, setDeclined] = useState(false);
  const [showSigPad, setShowSigPad] = useState(false);
  const [sigMode, setSigMode] = useState("type");
  const [typedSig, setTypedSig] = useState("");
  const [typedFont, setTypedFont] = useState(FONTS[0].value);
  const canvasRef = useRef(null);
  const [drawing, setDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    if (!token) { setError("No signing token provided"); setLoading(false); return; }
    fetch(EDGE_BASE + "/esign", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "access", token }),
    }).then(r => r.json()).then(d => {
      if (d.error) { setError(d.error); if (d.already_signed) setDone(true); }
      else setData(d);
      setLoading(false);
    }).catch(e => { setError("Failed to load document"); setLoading(false); });
  }, [token]);

  // Canvas drawing
  const getPos = (e) => {
    const r = canvasRef.current.getBoundingClientRect();
    const touch = e.touches?.[0];
    const x = (touch || e).clientX - r.left;
    const y = (touch || e).clientY - r.top;
    return [x * (canvasRef.current.width / r.width), y * (canvasRef.current.height / r.height)];
  };
  const startDraw = (e) => { e.preventDefault(); setDrawing(true); const ctx = canvasRef.current?.getContext("2d"); const [x,y] = getPos(e); ctx.beginPath(); ctx.moveTo(x,y); };
  const draw = (e) => { if (!drawing) return; e.preventDefault(); setHasDrawn(true); const ctx = canvasRef.current?.getContext("2d"); const [x,y] = getPos(e); ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.strokeStyle = "#1a1a2e"; ctx.lineTo(x,y); ctx.stroke(); };
  const endDraw = () => setDrawing(false);
  const clearCanvas = () => { const ctx = canvasRef.current?.getContext("2d"); if (ctx) { ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height); setHasDrawn(false); } };

  const adoptSignature = () => {
    if (sigMode === "draw" && hasDrawn) {
      setSignatureData({ type: "draw", value: canvasRef.current.toDataURL("image/png") });
    } else if (sigMode === "type" && typedSig.trim()) {
      setSignatureData({ type: "type", value: typedSig.trim(), font: typedFont });
    }
    setShowSigPad(false);
  };

  const handleSign = async () => {
    if (!consent || !signatureData) return;
    setSigning(true);
    try {
      const res = await fetch(EDGE_BASE + "/esign", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sign", token, signature_data: signatureData, initials_data: initialsData, field_values: fieldValues, consent: true }),
      });
      const result = await res.json();
      if (result.success) setDone(true);
      else setError(result.error || "Signing failed");
    } catch (e) { setError("Network error"); }
    setSigning(false);
  };

  const handleDecline = async () => {
    const reason = prompt("Please provide a reason for declining (optional):");
    if (reason === null) return;
    await fetch(EDGE_BASE + "/esign", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "decline", token, reason }),
    });
    setDeclined(true);
  };

  // Styles
  const bg = "#f8f9fc"; const surface = "#ffffff"; const border = "#e2e3e8";
  const accent = "#6366f1"; const text = "#1a1a2e"; const text2 = "#4a4a5e"; const text3 = "#8a8a9e";
  const green = "#22c55e"; const red = "#ef4444";

  if (loading) return (
    <div style={{ minHeight: "100vh", background: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", color: text3, fontSize: 14 }}>Loading document…</div>
    </div>
  );

  if (done) return (
    <div style={{ minHeight: "100vh", background: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", maxWidth: 420, padding: 40 }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>✅</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: text, marginBottom: 8 }}>Document Signed</h1>
        <p style={{ fontSize: 14, color: text3, lineHeight: 1.6 }}>
          Your signature has been recorded. All parties will receive a copy of the completed document
          with a certificate of completion once all signers have signed.
        </p>
        <div style={{ marginTop: 24, padding: 16, background: surface, border: `1px solid ${border}`, borderRadius: 10, textAlign: "left" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: text3, textTransform: "uppercase", marginBottom: 8 }}>Legal Notice</div>
          <div style={{ fontSize: 11, color: text2, lineHeight: 1.6 }}>
            By clicking "Adopt & Sign," you consented to sign this document electronically.
            Your signature is legally binding under the ESIGN Act and UETA.
            A complete audit trail has been recorded including timestamp, IP address, and browser information.
          </div>
        </div>
      </div>
    </div>
  );

  if (declined) return (
    <div style={{ minHeight: "100vh", background: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", maxWidth: 400, padding: 40 }}>
        <div style={{ fontSize: 48 }}>📋</div>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: text, marginTop: 12 }}>Document Declined</h1>
        <p style={{ fontSize: 14, color: text3, marginTop: 8 }}>The sender has been notified of your decision.</p>
      </div>
    </div>
  );

  if (error && !data) return (
    <div style={{ minHeight: "100vh", background: bg, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center", maxWidth: 400, padding: 40 }}>
        <div style={{ fontSize: 48 }}>⚠️</div>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: text, marginTop: 12 }}>{error}</h1>
      </div>
    </div>
  );

  const { signer, envelope, fields, signers } = data;
  const sigFields = fields.filter(f => f.field_type === "signature");
  const otherFields = fields.filter(f => f.field_type !== "signature" && f.field_type !== "date_signed");
  const allRequiredFilled = fields.filter(f => f.required).every(f => {
    if (f.field_type === "signature") return !!signatureData;
    if (f.field_type === "date_signed") return true; // Auto-filled
    if (f.field_type === "name") return !!fieldValues[f.id] || signer.name;
    return !!fieldValues[f.id];
  });

  return (
    <div style={{ minHeight: "100vh", background: bg }}>
      <link href={FONT_LINK} rel="stylesheet" />
      
      {/* Header */}
      <div style={{ background: surface, borderBottom: `1px solid ${border}`, padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, background: `linear-gradient(135deg, ${accent}, #a855f7)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, color: "#fff" }}>H</div>
          <span style={{ fontSize: 14, fontWeight: 700, color: text }}>Helm E-Sign</span>
        </div>
        <div style={{ fontSize: 12, color: text3 }}>Secure Document Signing</div>
      </div>

      <div style={{ maxWidth: 720, margin: "0 auto", padding: "32px 20px" }}>
        {/* Document info */}
        <div style={{ background: surface, border: `1px solid ${border}`, borderRadius: 14, padding: 24, marginBottom: 24 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: accent, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Document for Signing</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: text, marginBottom: 6 }}>{envelope.title}</h1>
          {envelope.message && <p style={{ fontSize: 13, color: text2, lineHeight: 1.6, marginBottom: 12 }}>{envelope.message}</p>}
          
          {/* Signer status */}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            {signers.map((s, i) => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 20, background: s.status === "signed" ? green + "15" : s.id === signer.id ? accent + "15" : "#f4f5f8", border: `1px solid ${s.status === "signed" ? green + "40" : s.id === signer.id ? accent + "40" : border}` }}>
              <span style={{ fontSize: 10 }}>{s.status === "signed" ? "✅" : s.id === signer.id ? "✍️" : "⏳"}</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: s.id === signer.id ? accent : text2 }}>{s.name}</span>
            </div>
            ))}
          </div>
        </div>

        {/* Document preview */}
        {envelope.document_url && (
          <div style={{ background: surface, border: `1px solid ${border}`, borderRadius: 14, padding: 20, marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: text3, marginBottom: 12, textTransform: "uppercase" }}>Document Preview</div>
            <div style={{ background: "#f0f0f5", borderRadius: 8, padding: 20, textAlign: "center", minHeight: 200, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
              <span style={{ fontSize: 48 }}>📄</span>
              <a href={envelope.document_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: accent, fontWeight: 600, textDecoration: "none" }}>View Full Document ↗</a>
            </div>
          </div>
        )}

        {/* Fill in fields */}
        {otherFields.length > 0 && (
          <div style={{ background: surface, border: `1px solid ${border}`, borderRadius: 14, padding: 24, marginBottom: 24 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: text3, marginBottom: 16, textTransform: "uppercase" }}>Required Fields</div>
            {otherFields.map(f => (
              <div key={f.id} style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: text3, display: "block", marginBottom: 4 }}>
                  {f.label || f.field_type.replace(/_/g, " ")} {f.required && <span style={{ color: red }}>*</span>}
                </label>
                {f.field_type === "checkbox" ? (
                  <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
                    <input type="checkbox" checked={!!fieldValues[f.id]} onChange={e => setFieldValues(p => ({ ...p, [f.id]: e.target.checked ? "yes" : "" }))} />
                    <span style={{ fontSize: 13, color: text }}>{f.placeholder || "I agree"}</span>
                  </label>
                ) : f.field_type === "name" ? (
                  <input value={fieldValues[f.id] ?? signer.name} onChange={e => setFieldValues(p => ({ ...p, [f.id]: e.target.value }))} style={{ width: "100%", padding: "10px 14px", fontSize: 14, border: `1px solid ${border}`, borderRadius: 8, background: "#fff", color: text, boxSizing: "border-box" }} />
                ) : f.field_type === "email" ? (
                  <input value={fieldValues[f.id] ?? signer.email} onChange={e => setFieldValues(p => ({ ...p, [f.id]: e.target.value }))} type="email" style={{ width: "100%", padding: "10px 14px", fontSize: 14, border: `1px solid ${border}`, borderRadius: 8, background: "#fff", color: text, boxSizing: "border-box" }} />
                ) : (
                  <input value={fieldValues[f.id] || ""} onChange={e => setFieldValues(p => ({ ...p, [f.id]: e.target.value }))} placeholder={f.placeholder} style={{ width: "100%", padding: "10px 14px", fontSize: 14, border: `1px solid ${border}`, borderRadius: 8, background: "#fff", color: text, boxSizing: "border-box" }} />
                )}
              </div>
            ))}
          </div>
        )}

        {/* Signature section */}
        <div style={{ background: surface, border: `1px solid ${border}`, borderRadius: 14, padding: 24, marginBottom: 24 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: text3, marginBottom: 16, textTransform: "uppercase" }}>Your Signature</div>
          
          {signatureData ? (
            <div>
              <div style={{ padding: 20, background: "#fafafa", borderRadius: 10, border: `2px solid ${green}40`, marginBottom: 12 }}>
                {signatureData.type === "draw" ? (
                  <img src={signatureData.value} alt="Signature" style={{ maxHeight: 80 }} />
                ) : (
                  <div style={{ fontSize: 32, fontFamily: signatureData.font, color: text }}>{signatureData.value}</div>
                )}
              </div>
              <button onClick={() => { setSignatureData(null); setShowSigPad(true); }} style={{ fontSize: 11, color: accent, background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}>Change Signature</button>
            </div>
          ) : showSigPad ? (
            <div>
              {/* Mode tabs */}
              <div style={{ display: "flex", gap: 4, marginBottom: 16 }}>
                {[{ id: "type", label: "⌨️ Type" }, { id: "draw", label: "✏️ Draw" }].map(m => (
                  <button key={m.id} onClick={() => setSigMode(m.id)} style={{ padding: "8px 20px", fontSize: 12, fontWeight: 600, borderRadius: 8, border: `1px solid ${sigMode === m.id ? accent : border}`, background: sigMode === m.id ? accent + "12" : "transparent", color: sigMode === m.id ? accent : text3, cursor: "pointer" }}>{m.label}</button>
                ))}
              </div>

              {sigMode === "type" && (
                <div>
                  <input value={typedSig} onChange={e => setTypedSig(e.target.value)} placeholder="Type your full legal name" style={{ width: "100%", padding: "14px 18px", fontSize: 24, fontFamily: typedFont, border: `2px dashed ${border}`, borderRadius: 10, background: "#fafafa", color: text, outline: "none", boxSizing: "border-box" }} />
                  <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                    {FONTS.map(f => (
                      <button key={f.name} onClick={() => setTypedFont(f.value)} style={{ padding: "6px 14px", fontSize: 15, fontFamily: f.value, borderRadius: 8, border: `1px solid ${typedFont === f.value ? accent : border}`, background: typedFont === f.value ? accent + "10" : "transparent", color: text, cursor: "pointer" }}>{f.name}</button>
                    ))}
                  </div>
                  {typedSig && (
                    <div style={{ marginTop: 16, padding: "20px 24px", background: "#fafafa", borderRadius: 10, border: `1px dashed ${border}` }}>
                      <div style={{ fontSize: 9, color: text3, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1 }}>Preview</div>
                      <div style={{ fontSize: 34, fontFamily: typedFont, color: text }}>{typedSig}</div>
                    </div>
                  )}
                </div>
              )}

              {sigMode === "draw" && (
                <div>
                  <canvas ref={canvasRef} width={600} height={180}
                    onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
                    onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
                    style={{ width: "100%", height: 160, border: `2px dashed ${border}`, borderRadius: 10, cursor: "crosshair", background: "#fafafa", touchAction: "none" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                    <button onClick={clearCanvas} style={{ fontSize: 11, color: text3, background: "none", border: "none", cursor: "pointer" }}>Clear</button>
                    <span style={{ fontSize: 10, color: text3 }}>Draw your signature above</span>
                  </div>
                </div>
              )}

              <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
                <button onClick={() => setShowSigPad(false)} style={{ padding: "8px 20px", fontSize: 12, fontWeight: 600, borderRadius: 8, border: `1px solid ${border}`, background: "transparent", color: text3, cursor: "pointer" }}>Cancel</button>
                <button onClick={adoptSignature} disabled={(sigMode === "draw" && !hasDrawn) || (sigMode === "type" && !typedSig.trim())} style={{ padding: "10px 28px", fontSize: 13, fontWeight: 700, borderRadius: 8, border: "none", background: accent, color: "#fff", cursor: "pointer", opacity: (sigMode === "draw" && !hasDrawn) || (sigMode === "type" && !typedSig.trim()) ? 0.4 : 1 }}>Adopt Signature</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowSigPad(true)} style={{ width: "100%", padding: 24, border: `2px dashed ${accent}40`, borderRadius: 10, background: accent + "06", color: accent, fontSize: 14, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              ✍️ Click to Sign
            </button>
          )}
        </div>

        {/* Consent & Sign */}
        <div style={{ background: surface, border: `1px solid ${border}`, borderRadius: 14, padding: 24, marginBottom: 24 }}>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
            <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} style={{ marginTop: 3, width: 18, height: 18, accentColor: accent }} />
            <div style={{ fontSize: 12, color: text2, lineHeight: 1.6 }}>
              <strong style={{ color: text }}>I agree to sign this document electronically.</strong> I understand that my electronic signature is legally binding and has the same legal effect as a handwritten signature under the ESIGN Act and UETA. I consent to conduct this transaction electronically and to receive electronic records related to this document.
            </div>
          </label>
        </div>

        {/* Action buttons */}
        <div style={{ display: "flex", gap: 12, justifyContent: "space-between" }}>
          <button onClick={handleDecline} style={{ padding: "12px 24px", fontSize: 13, fontWeight: 600, borderRadius: 10, border: `1px solid ${border}`, background: surface, color: text3, cursor: "pointer" }}>Decline to Sign</button>
          <button onClick={handleSign} disabled={!consent || !signatureData || signing} style={{ padding: "14px 40px", fontSize: 15, fontWeight: 800, borderRadius: 10, border: "none", background: consent && signatureData ? accent : "#ccc", color: "#fff", cursor: consent && signatureData ? "pointer" : "default", boxShadow: consent && signatureData ? `0 4px 20px ${accent}50` : "none", transition: "all 0.2s" }}>
            {signing ? "Signing…" : "Complete Signing ✓"}
          </button>
        </div>

        {/* Footer */}
        <div style={{ textAlign: "center", marginTop: 40, padding: 20 }}>
          <div style={{ fontSize: 10, color: text3, lineHeight: 1.6 }}>
            Powered by Helm E-Sign · Compliant with ESIGN Act, UETA & eIDAS<br />
            Your actions are recorded in a tamper-evident audit trail for legal compliance.
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SignPage() {
  return (
    <Suspense fallback={<div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#f8f9fc", color: "#8a8a9e" }}>Loading…</div>}>
      <SigningPageContent />
    </Suspense>
  );
}
