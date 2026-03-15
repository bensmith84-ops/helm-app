"use client";
import { useState } from "react";
import { T } from "../tokens";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";

export default function AuthPage() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState("signin");
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

  const handleGoogleSignIn = async () => {
    setError(""); setLoading(true);
    const { data, error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: window.location.origin,
        queryParams: { access_type: "offline", prompt: "consent" },
      },
    });
    if (err) { setError(err.message); setLoading(false); }
    // If successful, browser redirects to Google — no need to setLoading(false)
  };

  const dividerStyle = { display: "flex", alignItems: "center", gap: 12, margin: "20px 0" };
  const lineStyle = { flex: 1, height: 1, background: T.border };

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw", background: T.bg, alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 400, padding: 36, background: T.surface, borderRadius: 16, border: `1px solid ${T.border}`, boxShadow: "0 8px 32px rgba(0,0,0,0.12)" }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: `linear-gradient(135deg, ${T.accent}, #a855f7)`, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 24, fontWeight: 900, color: "#fff", marginBottom: 12 }}>H</div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: T.text, marginBottom: 4 }}>Helm</h1>
          <p style={{ fontSize: 13, color: T.text3 }}>{mode === "signin" ? "Sign in to your workspace" : "Create your account"}</p>
        </div>

        {/* Google Sign In */}
        <button onClick={handleGoogleSignIn} disabled={loading}
          style={{
            width: "100%", padding: "11px 20px", fontSize: 14, fontWeight: 600, borderRadius: 8,
            border: `1px solid ${T.border}`, background: T.surface2, color: T.text, cursor: loading ? "wait" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 4,
          }}>
          <svg width="18" height="18" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
          {loading ? "Redirecting..." : "Continue with Google"}
        </button>

        {/* Divider */}
        <div style={dividerStyle}>
          <div style={lineStyle} />
          <span style={{ fontSize: 11, color: T.text3, fontWeight: 500 }}>or</span>
          <div style={lineStyle} />
        </div>

        {/* Email/Password Form */}
        <form onSubmit={e => { e.preventDefault(); handleSubmit(); }} autoComplete="on">
          {mode === "signup" && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: T.text3, display: "block", marginBottom: 4 }}>Name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Your name" autoComplete="name"
                style={{ width: "100%", padding: "10px 14px", fontSize: 14, color: T.text, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
            </div>
          )}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: T.text3, display: "block", marginBottom: 4 }}>Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@company.com" autoComplete="email"
              style={{ width: "100%", padding: "10px 14px", fontSize: 14, color: T.text, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: T.text3, display: "block", marginBottom: 4 }}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="••••••••" autoComplete={mode === "signin" ? "current-password" : "new-password"}
              style={{ width: "100%", padding: "10px 14px", fontSize: 14, color: T.text, background: T.surface2, border: `1px solid ${T.border}`, borderRadius: 8, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }} />
          </div>

          {error && <div style={{ padding: "8px 12px", borderRadius: 6, background: "#ef444415", color: "#ef4444", fontSize: 12, marginBottom: 14 }}>{error}</div>}
          {success && <div style={{ padding: "8px 12px", borderRadius: 6, background: "#22c55e15", color: "#22c55e", fontSize: 12, marginBottom: 14 }}>{success}</div>}

          <button type="submit" disabled={loading || !email || !password}
            style={{
              width: "100%", padding: "12px 20px", fontSize: 14, fontWeight: 700, borderRadius: 8,
              border: "none", background: T.accent, color: "#fff", cursor: loading ? "wait" : "pointer",
              opacity: loading || !email || !password ? 0.6 : 1, marginBottom: 16,
            }}>
            {loading ? "..." : mode === "signin" ? "Sign In" : "Create Account"}
          </button>
        </form>

        <div style={{ textAlign: "center", fontSize: 13, color: T.text3 }}>
          {mode === "signin" ? "Don\u0027t have an account? " : "Already have an account? "}
          <button onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setError(""); setSuccess(""); }}
            style={{ background: "none", border: "none", color: T.accent, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            {mode === "signin" ? "Sign up" : "Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
