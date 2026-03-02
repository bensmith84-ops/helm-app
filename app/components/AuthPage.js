"use client";
import { useState } from "react";
import { T } from "../tokens";
import { useAuth } from "../lib/auth";

export default function AuthPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState("signin"); // signin | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");

  const handleSubmit = async () => {
    setError(""); setSuccess(""); setLoading(true);
    if (mode === "signin") {
      const { error: err } = await signIn(email, password);
      if (err) setError(err.message);
    } else {
      const { data, error: err } = await signUp(email, password, name);
      if (err) setError(err.message);
      else if (data?.user?.identities?.length === 0) setError("Account already exists. Please sign in.");
      else setSuccess("Check your email to confirm your account, then sign in.");
    }
    setLoading(false);
  };

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw", background: T.bg, alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 380, padding: 32, background: T.surface, borderRadius: 16, border: `1px solid ${T.border}` }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ width: 48, height: 48, borderRadius: 12, background: T.accent, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 900, color: "#fff", marginBottom: 12 }}>N</div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: T.text, marginBottom: 4 }}>Nexus</h1>
          <p style={{ fontSize: 13, color: T.text3 }}>{mode === "signin" ? "Sign in to your workspace" : "Create your account"}</p>
        </div>

        {/* Form */}
        {mode === "signup" && (
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: T.text3, display: "block", marginBottom: 4 }}>Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name"
              style={{ width: "100%", padding: "10px 14px", fontSize: 14, color: T.text, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, outline: "none", fontFamily: "inherit" }} />
          </div>
        )}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: T.text3, display: "block", marginBottom: 4 }}>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com"
            onKeyDown={e => { if (e.key === "Enter") handleSubmit(); }}
            style={{ width: "100%", padding: "10px 14px", fontSize: 14, color: T.text, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, outline: "none", fontFamily: "inherit" }} />
        </div>
        <div style={{ marginBottom: 20 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: T.text3, display: "block", marginBottom: 4 }}>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••"
            onKeyDown={e => { if (e.key === "Enter") handleSubmit(); }}
            style={{ width: "100%", padding: "10px 14px", fontSize: 14, color: T.text, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, outline: "none", fontFamily: "inherit" }} />
        </div>

        {error && <div style={{ padding: "8px 12px", borderRadius: 6, background: "#ef444415", color: "#ef4444", fontSize: 12, marginBottom: 14 }}>{error}</div>}
        {success && <div style={{ padding: "8px 12px", borderRadius: 6, background: "#22c55e15", color: "#22c55e", fontSize: 12, marginBottom: 14 }}>{success}</div>}

        <button onClick={handleSubmit} disabled={loading || !email || !password}
          style={{
            width: "100%", padding: "12px 20px", fontSize: 14, fontWeight: 700, borderRadius: 8,
            border: "none", background: T.accent, color: "#fff", cursor: loading ? "wait" : "pointer",
            opacity: loading || !email || !password ? 0.6 : 1, marginBottom: 16,
          }}>
          {loading ? "..." : mode === "signin" ? "Sign In" : "Create Account"}
        </button>

        <div style={{ textAlign: "center", fontSize: 13, color: T.text3 }}>
          {mode === "signin" ? "Don't have an account? " : "Already have an account? "}
          <button onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); setSuccess(""); }}
            style={{ background: "none", border: "none", color: T.accent, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            {mode === "signin" ? "Sign up" : "Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
