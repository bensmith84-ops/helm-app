
// helmApi — typed-ish fetch wrapper for the helm-api Cloud Run service.
// Auto-attaches Firebase ID token. Falls back to throwing if not signed in
// (caller decides whether to surface that to the user or retry after login).
"use client";

import { getCurrentIdToken } from "./firebase";

const BASE = process.env.NEXT_PUBLIC_HELM_API_URL || "https://helm-api-qp7o2dcl5a-uc.a.run.app";

// Feature flag — set NEXT_PUBLIC_USE_HELM_API=true to route calls to helm-api.
// When false, callers should fall back to direct Supabase. This lets us migrate one
// caller at a time without breaking the live app.
export const USE_HELM_API = process.env.NEXT_PUBLIC_USE_HELM_API === "true";

async function buildHeaders(extra = {}, requireToken = true) {
  const headers = { "Content-Type": "application/json", ...extra };
  const token = await getCurrentIdToken();
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  } else if (requireToken) {
    throw new Error("Not signed in — Firebase ID token unavailable");
  }
  return headers;
}

async function parseResponse(res) {
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!res.ok) {
    const msg = (body && typeof body === "object" && body.error) || `helm-api ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    err.body = body;
    throw err;
  }
  return body;
}

/**
 * Low-level fetch. `path` should start with "/" (e.g. "/whoami", "/qbo-sync").
 * Options: { method, body, requireToken (default true), headers }.
 */
export async function helmFetch(path, opts = {}) {
  const { method = "GET", body, requireToken = true, headers: extraHeaders } = opts;
  const url = `${BASE}${path}`;
  const headers = await buildHeaders(extraHeaders, requireToken);
  const init = { method, headers };
  if (body !== undefined && body !== null) {
    init.body = typeof body === "string" ? body : JSON.stringify(body);
  }
  const res = await fetch(url, init);
  return parseResponse(res);
}

export function helmGet(path, opts = {}) {
  return helmFetch(path, { ...opts, method: "GET" });
}

export function helmPost(path, body, opts = {}) {
  return helmFetch(path, { ...opts, method: "POST", body });
}

export const helmApi = {
  fetch: helmFetch,
  get: helmGet,
  post: helmPost,
  baseUrl: BASE,
  enabled: USE_HELM_API,
};

export default helmApi;
