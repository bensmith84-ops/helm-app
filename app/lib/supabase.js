import { createClient } from "@supabase/supabase-js";
import { IS_GCP, HELM_API_BASE, SUPABASE_URL } from "./backend";

const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwYmpkbW55a2hldWJ4a3VrbnVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNDI3OTcsImV4cCI6MjA4NzcxODc5N30.pvTTkiZWNDPuo-Fdzm54uy8w1mlx0AjB5jtFm3MeGq4";

function makeClient() {
  if (!IS_GCP) return createClient(SUPABASE_URL, supabaseKey);

  // Google Cloud: the same client, pointed at helm-api. Data, storage and
  // function calls go to helm-api's Supabase-compatible routes with the Firebase
  // token; sign-in is Firebase (gcpAuth); realtime is polling (realtimePoll).
  let tokenFn = async () => null;
  const helmFetch = async (input, init = {}) => {
    const headers = new Headers(init.headers || {});
    headers.delete("apikey");
    const token = await tokenFn();
    if (token) headers.set("Authorization", `Bearer ${token}`); else headers.delete("Authorization");
    return fetch(input, { ...init, headers });
  };
  const client = createClient(HELM_API_BASE, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: helmFetch },
    realtime: { params: { eventsPerSecond: 1 } },
  });
  if (typeof window !== "undefined") {
    const { installGcpAuth } = require("./gcpAuth");
    const { installRealtimePoll } = require("./realtimePoll");
    const { getAccessToken } = installGcpAuth(client, { apiBase: HELM_API_BASE });
    tokenFn = getAccessToken;
    installRealtimePoll(client);
  }
  return client;
}

export const supabase = makeClient();
