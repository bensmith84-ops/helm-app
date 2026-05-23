// Global fetch interceptor for the Stage 3 migration cutover.
//
// When NEXT_PUBLIC_USE_HELM_API=true, this patches window.fetch so that:
//   1. Calls to https://*.supabase.co/functions/v1/<name>  → helm-api/<name>
//   2. Calls to https://*.supabase.co/rest/v1/<path>      → helm-api/rest/v1/<path>
// Both have the Supabase anon JWT stripped and the user's Firebase ID token attached.
//
// This is the central plumbing for full PostgREST/Functions parity behind a flag.

"use client";

import { getCurrentIdToken } from "./firebase";
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

let installed = false;
export function installFetchInterceptor() {
  if (installed) return;
  if (typeof window === "undefined" || typeof window.fetch !== "function") return;
  installed = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async function patchedFetch(input, init = {}) {
    const url = typeof input === "string" ? input : input?.url;
    const intercept = shouldIntercept(url);
    if (!intercept) return originalFetch(input, init);

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
