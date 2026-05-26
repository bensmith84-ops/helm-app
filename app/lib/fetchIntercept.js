// Global fetch interceptor for the Stage 3 migration cutover.
//
// When NEXT_PUBLIC_USE_HELM_API=true, this patches window.fetch so that:
//   1. Calls to https://*.supabase.co/functions/v1/<name>  → helm-api/<name>
//   2. Calls to https://*.supabase.co/rest/v1/<path>      → helm-api/rest/v1/<path>
// Both have the Supabase anon JWT stripped and the user's Firebase ID token attached.
//
// Auth-ready gate: on first load we await onAuthStateChanged before sending the first
// intercepted request, so we never send tokenless requests during the brief window
// between page load and Firebase sign-in resolving.

"use client";

import { getCurrentIdToken, onAuthStateChanged } from "./firebase";
import { USE_HELM_API } from "./helmApi";

const HELM_API_BASE =
  process.env.NEXT_PUBLIC_HELM_API_URL ||
  "https://helm-api-qp7o2dcl5a-uc.a.run.app";

const FUNCTIONS_RE = /^https?:\/\/[^/]+\.supabase\.co\/functions\/v1\/(.+)$/;
const POSTGREST_RE = /^https?:\/\/[^/]+\.supabase\.co\/rest\/v1\/(.+)$/;

function shouldIntercept(url) {
  if (!USE_HELM_API) return null;
  if (typeof url !== "string") {
    try { url = url.toString(); } catch { return null; }
  }
  const fm = url.match(FUNCTIONS_RE);
  if (fm) return { kind: 'functions', target: `${HELM_API_BASE}/${fm[1]}` };
  const pm = url.match(POSTGREST_RE);
  if (pm) return { kind: 'postgrest', target: `${HELM_API_BASE}/rest/v1/${pm[1]}` };
  return null;
}

// Auth-ready gate. Resolves on first onAuthStateChanged callback (signed in OR out).
// We resolve either way — if signed out, we still want the request to fire (and 401).
let authReadyPromise = null;
function getAuthReady() {
  if (authReadyPromise) return authReadyPromise;
  authReadyPromise = new Promise((resolve) => {
    let resolved = false;
    const finish = () => { if (!resolved) { resolved = true; resolve(); } };
    // Hard timeout — never block longer than 8s
    setTimeout(finish, 8000);

    try {
      // Dynamically import to avoid SSR issues
      import("./firebase").then(({ getFirebaseAuth }) => {
        const auth = getFirebaseAuth();
        if (!auth) { finish(); return; }
        if (auth.currentUser) { finish(); return; } // already signed in
        const unsub = onAuthStateChanged(auth, () => {
          finish();
          try { unsub(); } catch {}
        });
      }).catch(() => finish());
    } catch {
      finish();
    }
  });
  return authReadyPromise;
}

let installed = false;
export function installFetchInterceptor() {
  if (installed) return;
  if (typeof window === "undefined" || typeof window.fetch !== "function") return;
  installed = true;

  // Start the auth-ready promise as soon as the interceptor is installed
  getAuthReady();

  const originalFetch = window.fetch.bind(window);

  window.fetch = async function patchedFetch(input, init = {}) {
    const url = typeof input === "string" ? input : input?.url;
    const intercept = shouldIntercept(url);
    if (!intercept) return originalFetch(input, init);

    // Wait for the first Firebase auth state callback (or 8s timeout) before sending.
    // Prevents the race where supabase-js fires calls before Firebase has signed in.
    await getAuthReady();

    // Strip Supabase auth headers, attach Firebase token
    const newHeaders = new Headers(init.headers || {});
    newHeaders.delete("Authorization");
    newHeaders.delete("authorization");
    newHeaders.delete("apikey");
    newHeaders.delete("ApiKey");

    try {
      const token = await getCurrentIdToken();
      if (token) newHeaders.set("Authorization", `Bearer ${token}`);
    } catch (_e) { /* leave unauthed; helm-api will 401 */ }

    if (!newHeaders.has("Content-Type") && init.body) {
      newHeaders.set("Content-Type", "application/json");
    }

    // Throttled log so the dev console isn't flooded
    try {
      const key = `helm:fetch-log:${intercept.kind}:${intercept.target.split('/').pop().split('?')[0]}`;
      const last = Number(sessionStorage.getItem(key) || 0);
      if (Date.now() - last > 60000) {
        console.info(`[helm-api] (${intercept.kind}) → ${intercept.target}`);
        sessionStorage.setItem(key, String(Date.now()));
      }
    } catch { /* sessionStorage might be unavailable */ }

    return originalFetch(intercept.target, { ...init, headers: newHeaders });
  };
}

if (typeof window !== "undefined") {
  installFetchInterceptor();
}

export default installFetchInterceptor;
