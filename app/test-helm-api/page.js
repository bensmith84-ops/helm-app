
"use client";

import { useState } from "react";
import { useAuth } from "../lib/useAuth";
import { signInWithEmail, signOut } from "../lib/firebase";
import { helmApi } from "../lib/helmApi";

export default function TestHelmApi() {
  const { user, loading } = useAuth();
  const [email, setEmail] = useState("ben.smith@earthbreeze.com");
  const [password, setPassword] = useState("");
  const [signinError, setSigninError] = useState(null);
  const [result, setResult] = useState(null);
  const [resultError, setResultError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function handleSignIn(e) {
    e.preventDefault();
    setSigninError(null);
    setBusy(true);
    try {
      await signInWithEmail(email, password);
    } catch (err) {
      setSigninError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleSignOut() {
    setResult(null);
    setResultError(null);
    await signOut();
  }

  async function callRoute(path) {
    setResult(null);
    setResultError(null);
    setBusy(true);
    try {
      const data = await helmApi.get(path);
      setResult({ path, data });
    } catch (err) {
      setResultError({
        path,
        message: err?.message || String(err),
        status: err?.status,
        body: err?.body,
      });
    } finally {
      setBusy(false);
    }
  }

  const card = {
    background: "#fff", border: "1px solid #e2e3e8", borderRadius: 12,
    padding: 24, marginBottom: 16,
  };
  const btn = {
    padding: "8px 16px", borderRadius: 8, border: "1px solid #6366f1",
    background: "#6366f1", color: "#fff", cursor: "pointer", fontWeight: 600,
    marginRight: 8, marginTop: 8,
  };
  const btnSecondary = { ...btn, background: "#fff", color: "#6366f1" };
  const input = {
    width: "100%", padding: "8px 12px", border: "1px solid #d1d5db",
    borderRadius: 6, fontSize: 14, marginBottom: 8,
  };
  const codeBox = {
    background: "#0f1729", color: "#a5b4fc", padding: 16,
    borderRadius: 8, fontSize: 12, overflow: "auto", marginTop: 12,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  };

  return (
    <div style={{ maxWidth: 720, margin: "40px auto", padding: "0 20px", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>helm-api Stage 4k smoke test</h1>
      <p style={{ color: "#6b7280", marginBottom: 24 }}>
        Sign in with Firebase, then call helm-api routes with the ID token attached.
        Proves the full chain end-to-end.
      </p>

      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 600, color: "#6b7280", marginBottom: 8 }}>
          Auth state
        </div>
        {loading ? (
          <div>Loading auth…</div>
        ) : user ? (
          <>
            <div style={{ marginBottom: 8 }}>
              <strong>Signed in as:</strong> {user.email}
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
              Firebase UID: <code>{user.uid}</code>
            </div>
            <button onClick={handleSignOut} style={btnSecondary}>Sign out</button>
          </>
        ) : (
          <form onSubmit={handleSignIn}>
            <input
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="email" style={input} required
            />
            <input
              type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="password" style={input} required
            />
            <button type="submit" disabled={busy} style={btn}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
            {signinError && (
              <div style={{ color: "#dc2626", fontSize: 13, marginTop: 8 }}>{signinError}</div>
            )}
          </form>
        )}
      </div>

      {user && (
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#6b7280", marginBottom: 8 }}>
            Call a helm-api route
          </div>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
            Base URL: <code>{helmApi.baseUrl}</code>
          </div>
          <button onClick={() => callRoute("/whoami")} disabled={busy} style={btn}>
            GET /whoami
          </button>
          <button onClick={() => callRoute("/health/detailed")} disabled={busy} style={btnSecondary}>
            GET /health/detailed
          </button>
        </div>
      )}

      {result && (
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#059669", marginBottom: 8 }}>
            \u2705 {result.path} OK
          </div>
          <pre style={codeBox}>{JSON.stringify(result.data, null, 2)}</pre>
        </div>
      )}

      {resultError && (
        <div style={card}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "#dc2626", marginBottom: 8 }}>
            \u274C {resultError.path}{resultError.status ? ` (HTTP ${resultError.status})` : ""}
          </div>
          <div style={{ marginBottom: 8 }}>{resultError.message}</div>
          {resultError.body && (
            <pre style={codeBox}>{JSON.stringify(resultError.body, null, 2)}</pre>
          )}
        </div>
      )}
    </div>
  );
}
