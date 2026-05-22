
// invokeFunction — drop-in replacement for supabase.functions.invoke().
// Behind a feature flag (NEXT_PUBLIC_USE_HELM_API), routes calls to helm-api.
// When the flag is false (default), falls back to Supabase Functions.
//
// Migration pattern:
//   BEFORE:  const { data, error } = await supabase.functions.invoke('scoreboard-chat', { body: payload });
//   AFTER:   const { data, error } = await invokeFunction('scoreboard-chat', { body: payload });
//
// Behavior on error matches Supabase's shape: { data: null, error: { message, status, body } }
// so existing error-handling code doesn't need changes.

"use client";

import { helmPost, USE_HELM_API } from "./helmApi";
import { supabase } from "./supabase";

/**
 * Invoke a serverless function — Supabase Edge Function or helm-api route.
 * @param {string} name - Function name (e.g. 'scoreboard-chat'). Becomes /name on helm-api.
 * @param {object} opts - { body, headers, method }
 * @returns {Promise<{ data: any, error: { message, status, body } | null }>}
 */
export async function invokeFunction(name, opts = {}) {
  const { body, headers, method = "POST" } = opts;

  if (USE_HELM_API) {
    try {
      const data = await helmPost("/" + name, body, { headers });
      return { data, error: null };
    } catch (err) {
      return {
        data: null,
        error: {
          message: err?.message || String(err),
          status: err?.status,
          body: err?.body,
          source: "helm-api",
        },
      };
    }
  }

  // Fallback to Supabase Functions
  const { data, error } = await supabase.functions.invoke(name, {
    body,
    headers,
    method,
  });
  return {
    data,
    error: error
      ? { message: error.message, status: error.status, source: "supabase" }
      : null,
  };
}

export default invokeFunction;
