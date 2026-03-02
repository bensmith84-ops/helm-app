"use client";
import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { T } from "../tokens";
import { useAuth } from "../lib/auth";
import { useTheme } from "../lib/theme";

export default function SettingsView() {
  const { user, profile, signOut } = useAuth();
  const { mode, toggle } = useTheme();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [timezone, setTimezone] = useState("");
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");

  useEffect(() => {
    if (profile) {
      setDisplayName(profile.display_name || "");
      setEmail(profile.email || user?.email || "");
      setTimezone(profile.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone);
    }
  }, [profile, user]);

  const save = async () => {
    setSaving(true);
    await supabase.from("profiles").update({
      display_name: displayName.trim(), timezone, updated_at: new Date().toISOString(),
    }).eq("id", user.id);
    setSaving(false);
    setToast("Saved!"); setTimeout(() => setToast(""), 2000);
  };

  const Section = ({ title, children }) => (
    <div style={{ background: T.surface, borderRadius: 12, border: `1px solid ${T.border}`, padding: 24, marginBottom: 16 }}>
      <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>{title}</h3>
      {children}
    </div>
  );

  const Field = ({ label, children }) => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ fontSize: 12, fontWeight: 600, color: T.text3, display: "block", marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );

  const inputStyle = {
    width: "100%", maxWidth: 360, padding: "10px 14px", fontSize: 14, color: T.text,
    background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, outline: "none", fontFamily: "inherit",
  };

  return (
    <div style={{ padding: "28px 32px", overflow: "auto", maxWidth: 700 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 24 }}>Settings</h1>

      {toast && (
        <div style={{ position: "fixed", top: 16, right: 16, padding: "10px 20px", borderRadius: 8, background: "#22c55e", color: "#fff", fontSize: 13, fontWeight: 600, zIndex: 100 }}>{toast}</div>
      )}

      <Section title="Profile">
        <Field label="Display Name">
          <input value={displayName} onChange={e => setDisplayName(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Email">
          <input value={email} disabled style={{ ...inputStyle, opacity: 0.5, cursor: "not-allowed" }} />
          <div style={{ fontSize: 11, color: T.text3, marginTop: 4 }}>Email cannot be changed here</div>
        </Field>
        <Field label="Timezone">
          <select value={timezone} onChange={e => setTimezone(e.target.value)} style={{ ...inputStyle, cursor: "pointer" }}>
            {["America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
              "America/Anchorage", "Pacific/Honolulu", "Europe/London", "Europe/Paris", "Europe/Berlin",
              "Asia/Tokyo", "Asia/Shanghai", "Asia/Kolkata", "Australia/Sydney", "Pacific/Auckland",
            ].map(tz => <option key={tz} value={tz}>{tz.replace("_", " ")}</option>)}
          </select>
        </Field>
        <button onClick={save} disabled={saving} style={{
          padding: "10px 24px", fontSize: 13, fontWeight: 700, borderRadius: 8,
          border: "none", background: T.accent, color: "#fff", cursor: saving ? "wait" : "pointer",
          opacity: saving ? 0.6 : 1,
        }}>{saving ? "Saving…" : "Save Changes"}</button>
      </Section>

      <Section title="Appearance">
        <div style={{ fontSize: 13, color: T.text2, marginBottom: 12 }}>Select your preferred theme.</div>
        <div style={{ display: "flex", gap: 8 }}>
          <div onClick={() => toggle("dark")} style={{ padding: "12px 20px", borderRadius: 8, border: `2px solid ${mode === "dark" ? T.accent : T.border}`, background: mode === "dark" ? T.accentDim : T.surface2, color: mode === "dark" ? T.text : T.text3, fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all .15s" }}>🌙 Dark</div>
          <div onClick={() => toggle("light")} style={{ padding: "12px 20px", borderRadius: 8, border: `2px solid ${mode === "light" ? T.accent : T.border}`, background: mode === "light" ? T.accentDim : T.surface2, color: mode === "light" ? T.text : T.text3, fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all .15s" }}>☀️ Light</div>
        </div>
      </Section>

      <Section title="Account">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ fontSize: 13, color: T.text2, flex: 1 }}>
            Signed in as <strong>{user?.email}</strong>
          </div>
        </div>
        <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
          <button onClick={signOut} style={{
            padding: "10px 20px", fontSize: 13, fontWeight: 600, borderRadius: 8,
            border: "1px solid #ef444440", background: "#ef444410", color: "#ef4444", cursor: "pointer",
          }}>Sign Out</button>
        </div>
      </Section>

      <Section title="About">
        <div style={{ fontSize: 13, color: T.text2, lineHeight: 1.6 }}>
          <strong>Helm</strong> — Unified Business OS<br />
          Version 1.0<br />
          Built with Next.js, Supabase, and Vercel.
        </div>
      </Section>
    </div>
  );
}
