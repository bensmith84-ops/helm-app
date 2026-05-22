
// Global fetch interceptor for the Stage 3 migration cutover.
//
// When NEXT_PUBLIC_USE_HELM_API=true, this module patches window.fetch
// at module-load time so that any call to a Supabase Edge Function URL
// gets transparently redirected to the equivalent helm-api Cloud Run route.
//
// Why a global interceptor instead of per-component refactor?
//   - 30+ raw fetch() call sites across 13 components
//   - Each has slightly different body/header shape — risky to refactor
//   - This shim adds ZERO code to components and the same flag controls all
//   - Instant rollback by flipping NEXT_PUBLIC_USE_HELM_API=false
//
// What it does:
//   1. Detects URLs matching https://*.supabase.co/functions/v1/<name>
//   2. Rewrites to https://helm-api-.../<name>
//   3. Strips the anon JWT Authorization header (helm-api doesn't expect it)
//   4. Attaches the current user's Firebase ID token (helm-api requires it)
//   5. Passes through method, body, other headers unchanged
//
// Idempotent — safe to import multiple times. Module-level guard prevents
// re-patching window.fetch.

"use client";

import { getCurrentIdToken } from "./firebase";
import { USE_HELM_API } from "./helmApi";

const HELM_API_BASE =
  process.env.NEXT_PUBLIC_HELM_API_URL ||
  "https://helm-api-qp7o2dcl5a-uc.a.run.app";

// Match any URL pointing at Supabase Edge Functions
const SUPABASE_FN_RE = /^https?:\/\/[^/]+\.supabase\.co\/functions\/v1\/(.+)$/;

function shouldIntercept(url) {
  if (!USE_HELM_API) return null;
  if (typeof url !== "string") {
    try { url = url.toString(); } catch { return null; }
  }
  const m = url.match(SUPABASE_FN_RE);
  if (!m) return null;
  // Preserve query string + path tail (e.g. ?action=callback)
  return `${HELM_API_BASE}/${m[1]}`;
}

let installed = false;

export function installFetchInterceptor() {
  if (installed) return;
  if (typeof window === "undefined" || typeof window.fetch !== "function") return;
  installed = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async function patchedFetch(input, init = {}) {
    const url = typeof input === "string" ? input : input?.url;
    const redirected = shouldIntercept(url);
    if (!redirected) {
      return originalFetch(input, init);
    }

    // Build new headers — drop Supabase anon JWT, add Firebase ID token
    const newHeaders = new Headers(init.headers || {});
    // Remove any inherited Supabase anon JWT
    newHeaders.delete("Authorization");
    newHeaders.delete("apikey");
    // Attach Firebase token if signed in
    try {
      const token = await getCurrentIdToken();
      if (token) {
        newHeaders.set("Authorization", `Bearer ${token}`);
      }
    } catch (_e) {
      // No token yet — let helm-api 401 and the UI handle it
    }
    if (!newHeaders.has("Content-Type") && init.body) {
      newHeaders.set("Content-Type", "application/json");
    }

    // Log once per minute per route so we can see the redirects
    if (typeof window !== "undefined") {
      const key = `helm:fetch-log:${redirected.split("/").pop()}`;
      const last = Number(sessionStorage.getItem(key) || 0);
      if (Date.now() - last > 60000) {
        console.info(`[helm-api] redirected → ${redirected}`);
        sessionStorage.setItem(key, String(Date.now()));
      }
    }

    return originalFetch(redirected, { ...init, headers: newHeaders });
  };
}

// Auto-install at module load (browser only)
if (typeof window !== "undefined") {
  installFetchInterceptor();
}

export default installFetchInterceptor;
