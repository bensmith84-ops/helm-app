// Global fetch interceptor for the Stage 3 migration cutover.
//
// SCOPE (after rollback):
//   1. All Supabase Functions URLs → helm-api/<name>   (Stage 3 unchanged)
//   2. PostgREST URLs ONLY for plm_ai_* tables → helm-api/rest/v1/<path>
//      Everything else (profiles, org_memberships, tasks, etc.) keeps going to Supabase.
//
// Rationale: the full PostgREST shim works at the data layer (proven by curl + browser),
// but auth.js still consumes supabase.auth sessions and the wider app was written
// against Supabase RLS semantics. Until those are migrated, we keep the interceptor
// narrow so only fully-migrated tables route through helm-api.

"use client";

import { getCurrentIdToken, onAuthStateChanged } from "./firebase";
import { USE_HELM_API } from "./helmApi";

const HELM_API_BASE =
  process.env.NEXT_PUBLIC_HELM_API_URL ||
  "https://helm-api-qp7o2dcl5a-uc.a.run.app";

// Allowlist of tables that have been migrated to helm-api/Cloud SQL
// (writes already go there via dedicated routes; now reads also via the shim).
// Expand this set as we migrate more tables.
const POSTGREST_ALLOWLIST = new Set([
  "plm_ai_conversations",
  "plm_ai_messages",
]);

const FUNCTIONS_RE = /^https?:\/\/[^/]+\.supabase\.co\/functions\/v1\/(.+)$/;

// Functions that should STAY on Supabase, not be redirected to helm-api.
// These either: (a) have buggy/incomplete helm-api ports, or (b) we haven't
// yet provisioned the env vars they need (GOOGLE_SERVICE_ACCOUNT, etc.).
// Expand or shrink this denylist as helm-api ports become trustworthy.
const FUNCTIONS_DENYLIST = new Set([
  "qbo-auto-sync",
  "qbo-sync",
  "qbo-callback",
  "qbo-auth-url",
  "qbo-attachments",
  "qbo-push",
  "sheets-sync",
  "sheets-daily-sync",
  "sheets-preview",
  "sheets-explore",
]);
const POSTGREST_RE = /^https?:\/\/[^/]+\.supabase\.co\/rest\/v1\/([^?/]+)(\?.*)?$/;

function shouldIntercept(url) {
  if (!USE_HELM_API) return null;
  if (typeof url !== "string") {
    try { url = url.toString(); } catch { return null; }
  }
  const fm = url.match(FUNCTIONS_RE);
  if (fm) {
    // The captured group is everything after /functions/v1/, possibly including
    // query string. The bare function name is up to the first / or ?
    const name = fm[1].split(/[/?]/)[0];
    if (FUNCTIONS_DENYLIST.has(name)) return null; // keep on Supabase
    return { kind: 'functions', target: `${HELM_API_BASE}/${fm[1]}` };
  }
  const pm = url.match(POSTGREST_RE);
  if (pm) {
    const table = pm[1];
    if (!POSTGREST_ALLOWLIST.has(table)) return null; // ← skip, send to Supabase
    const tail = url.split('/rest/v1/')[1];
    return { kind: 'postgrest', target: `${HELM_API_BASE}/rest/v1/${tail}` };
  }
  return null;
}

// Auth-ready gate: wait for first Firebase auth state callback (or 8s) before firing
// the first intercepted request, so we don't send tokenless requests during sign-in.
let authReadyPromise = null;
function getAuthReady() {
  if (authReadyPromise) return authReadyPromise;
  authReadyPromise = new Promise((resolve) => {
    let resolved = false;
    const finish = () => { if (!resolved) { resolved = true; resolve(); } };
    setTimeout(finish, 8000);
    try {
      import("./firebase").then(({ getFirebaseAuth }) => {
        const auth = getFirebaseAuth();
        if (!auth) { finish(); return; }
        if (auth.currentUser) { finish(); return; }
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
  getAuthReady();
  const originalFetch = window.fetch.bind(window);
  window.fetch = async function patchedFetch(input, init = {}) {
    const url = typeof input === "string" ? input : input?.url;
    const intercept = shouldIntercept(url);
    if (!intercept) return originalFetch(input, init);
    await getAuthReady();
    const newHeaders = new Headers(init.headers || {});
    newHeaders.delete("Authorization");
    newHeaders.delete("authorization");
    newHeaders.delete("apikey");
    newHeaders.delete("ApiKey");
    try {
      const token = await getCurrentIdToken();
      if (token) newHeaders.set("Authorization", `Bearer ${token}`);
    } catch (_e) {}
    if (!newHeaders.has("Content-Type") && init.body) {
      newHeaders.set("Content-Type", "application/json");
    }
    try {
      const key = `helm:fetch-log:${intercept.kind}:${intercept.target.split('/').pop().split('?')[0]}`;
      const last = Number(sessionStorage.getItem(key) || 0);
      if (Date.now() - last > 60000) {
        console.info(`[helm-api] (${intercept.kind}) → ${intercept.target}`);
        sessionStorage.setItem(key, String(Date.now()));
      }
    } catch {}
    return originalFetch(intercept.target, { ...init, headers: newHeaders });
  };
}

if (typeof window !== "undefined") {
  installFetchInterceptor();
}

export default installFetchInterceptor;
