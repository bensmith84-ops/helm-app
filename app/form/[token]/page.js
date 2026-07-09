"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

const SUPA_URL = "https://upbjdmnykheubxkuknuj.supabase.co";
const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwYmpkbW55a2hldWJ4a3VrbnVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNDI3OTcsImV4cCI6MjA4NzcxODc5N30.pvTTkiZWNDPuo-Fdzm54uy8w1mlx0AjB5jtFm3MeGq4";

const PRIORITY_OPTS = [
  { v: "", l: "—" },
  { v: "low", l: "Low" },
  { v: "medium", l: "Medium" },
  { v: "high", l: "High" },
  { v: "urgent", l: "Urgent" },
];
const MAX_BYTES = 5 * 1024 * 1024;

async function callForm(payload) {
  const res = await fetch(`${SUPA_URL}/functions/v1/public-form`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ANON}`, "apikey": ANON },
    body: JSON.stringify(payload),
  });
  return res.json().catch(() => ({ error: "Network error" }));
}

function readB64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export default function PublicFormPage() {
  const params = useParams();
  const token = params?.token;
  const [state, setState] = useState("loading");
  const [form, setForm] = useState(null);
  const [values, setValues] = useState({});
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!token) { setState("error"); setError("Invalid link."); return; }
      const r = await callForm({ action: "get", token });
      if (!alive) return;
      if (r.error || !r.form) { setState("error"); setError(r.error || "This form is not available."); return; }
      const init = {};
      (r.form.fields || []).forEach((f) => { init[f.id] = f.maps_to === "multi_select" ? [] : (f.maps_to === "attachments" ? [] : ""); });
      setForm(r.form); setValues(init); setState("ready");
    })();
    return () => { alive = false; };
  }, [token]);

  const setVal = (id, v) => setValues((p) => ({ ...p, [id]: v }));
  const toggleMulti = (id, opt) => setValues((p) => {
    const cur = Array.isArray(p[id]) ? p[id] : [];
    return { ...p, [id]: cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt] };
  });

  const submit = async () => {
    setError("");
    for (const f of (form.fields || [])) {
      if (!f.required) continue;
      const v = values[f.id];
      const empty = (f.maps_to === "multi_select" || f.maps_to === "attachments") ? !(Array.isArray(v) && v.length) : !String(v ?? "").trim();
      if (empty) { setError(`"${f.label}" is required.`); return; }
    }
    setState("submitting");
    const files = [];
    const cleanValues = {};
    for (const f of (form.fields || [])) {
      if (f.maps_to === "attachments") {
        const arr = values[f.id];
        if (Array.isArray(arr)) {
          for (const file of arr) {
            if (file.size > MAX_BYTES) { setError(`"${file.name}" is larger than 5 MB.`); setState("ready"); return; }
            files.push({ fieldId: f.id, name: file.name, type: file.type, dataB64: await readB64(file) });
          }
        }
      } else {
        cleanValues[f.id] = values[f.id];
      }
    }
    const r = await callForm({ action: "submit", token, values: cleanValues, files });
    if (r.error) { setError(r.error); setState("ready"); return; }
    setState("done");
  };

  const page = { minHeight: "100vh", background: "#f4f5f7", color: "#1f2430", fontFamily: "'DM Sans', system-ui, sans-serif", display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 16px", boxSizing: "border-box" };
  const card = { width: "100%", maxWidth: 560, background: "#fff", borderRadius: 16, boxShadow: "0 10px 40px rgba(0,0,0,0.08)", border: "1px solid #e6e8ec", overflow: "hidden" };
  const label = { fontSize: 13, fontWeight: 600, color: "#3a4150", display: "block" };
  const inp = { width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #d6dae1", background: "#fff", color: "#1f2430", fontSize: 14, outline: "none", boxSizing: "border-box", fontFamily: "inherit" };
  const brand = (<div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, marginTop: 22, fontSize: 12, color: "#9aa1ac" }}><span>🚀</span><span>Powered by Helm</span></div>);

  if (state === "loading") return <div style={page}><div style={{ ...card, padding: 40, textAlign: "center", color: "#9aa1ac" }}>Loading form…</div>{brand}</div>;
  if (state === "error") return (
    <div style={page}>
      <div style={{ ...card, padding: 40, textAlign: "center" }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
        <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Form unavailable</div>
        <div style={{ fontSize: 13, color: "#6b7280" }}>{error || "This form may have been turned off or the link is incorrect."}</div>
      </div>{brand}
    </div>
  );
  if (state === "done") return (
    <div style={page}>
      <div style={{ ...card, padding: 44, textAlign: "center" }}>
        <div style={{ width: 56, height: 56, borderRadius: 28, background: "#dcfce7", color: "#16a34a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, margin: "0 auto 16px" }}>✓</div>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 6 }}>Submitted</div>
        <div style={{ fontSize: 14, color: "#6b7280", marginBottom: 20 }}>Thanks — your request has been received.</div>
        <button onClick={() => { const init = {}; (form.fields || []).forEach((f) => { init[f.id] = f.maps_to === "multi_select" || f.maps_to === "attachments" ? [] : ""; }); setValues(init); setState("ready"); }}
          style={{ padding: "9px 18px", borderRadius: 8, border: "1px solid #d6dae1", background: "#fff", color: "#3a4150", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
          Submit another response
        </button>
      </div>{brand}
    </div>
  );

  const busy = state === "submitting";
  return (
    <div style={page}>
      <div style={card}>
        <div style={{ height: 6, background: "linear-gradient(90deg,#6366f1,#a855f7)" }} />
        <div style={{ padding: "28px 30px 30px" }}>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 6px", color: "#151a24" }}>{form.name}</h1>
          {form.description && <p style={{ fontSize: 14, color: "#6b7280", margin: "0 0 22px", lineHeight: 1.55, whiteSpace: "pre-wrap" }}>{form.description}</p>}

          {(form.fields || []).map((f) => (
            <div key={f.id} style={{ marginBottom: 18 }}>
              <label style={{ ...label, marginBottom: f.help ? 3 : 6 }}>{f.label}{f.required && <span style={{ color: "#ef4444" }}> *</span>}</label>
              {f.help && <div style={{ fontSize: 12, color: "#8b93a1", marginBottom: 7, whiteSpace: "pre-wrap", lineHeight: 1.45 }}>{f.help}</div>}
              {f.maps_to === "description" || f.maps_to === "note_long" ? (
                <textarea value={values[f.id] || ""} onChange={(e) => setVal(f.id, e.target.value)} rows={4} style={{ ...inp, resize: "vertical" }} />
              ) : f.maps_to === "due_date" ? (
                <input type="date" value={values[f.id] || ""} onChange={(e) => setVal(f.id, e.target.value)} style={{ ...inp, cursor: "pointer" }} />
              ) : f.maps_to === "priority" ? (
                <select value={values[f.id] || ""} onChange={(e) => setVal(f.id, e.target.value)} style={{ ...inp, cursor: "pointer" }}>
                  {PRIORITY_OPTS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
              ) : f.maps_to === "single_select" ? (
                <select value={values[f.id] || ""} onChange={(e) => setVal(f.id, e.target.value)} style={{ ...inp, cursor: "pointer" }}>
                  <option value="">Select…</option>
                  {(f.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : f.maps_to === "multi_select" ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {(f.options || []).map((o) => {
                    const checked = Array.isArray(values[f.id]) && values[f.id].includes(o);
                    return (
                      <label key={o} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, color: "#1f2430", cursor: "pointer", padding: "6px 10px", borderRadius: 8, border: `1px solid ${checked ? "#6366f1" : "#e0e3e8"}`, background: checked ? "#eef0ff" : "#fff" }}>
                        <input type="checkbox" checked={checked} onChange={() => toggleMulti(f.id, o)} /> {o}
                      </label>
                    );
                  })}
                </div>
              ) : f.maps_to === "attachments" ? (
                <div>
                  <input type="file" multiple onChange={(e) => setVal(f.id, Array.from(e.target.files || []))} style={{ fontSize: 13, color: "#3a4150" }} />
                  {Array.isArray(values[f.id]) && values[f.id].length > 0 && <div style={{ fontSize: 12, color: "#8b93a1", marginTop: 5 }}>{values[f.id].map((x) => x.name).join(", ")}</div>}
                  <div style={{ fontSize: 11, color: "#aab0bb", marginTop: 4 }}>Up to 6 files, 5 MB each.</div>
                </div>
              ) : (
                <input value={values[f.id] || ""} onChange={(e) => setVal(f.id, e.target.value)} style={inp} />
              )}
            </div>
          ))}

          {error && <div style={{ fontSize: 13, color: "#ef4444", marginBottom: 14 }}>{error}</div>}
          <button onClick={submit} disabled={busy} style={{ width: "100%", padding: "12px 0", borderRadius: 10, border: "none", background: busy ? "#a5a8f0" : "#6366f1", color: "#fff", fontSize: 15, fontWeight: 700, cursor: busy ? "default" : "pointer", marginTop: 4 }}>
            {busy ? "Submitting…" : "Submit"}
          </button>
        </div>
      </div>{brand}
    </div>
  );
}
