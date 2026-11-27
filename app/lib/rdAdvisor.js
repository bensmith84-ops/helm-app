// Client for the R&D Advisor on helm-api (/rd-advisor). It authenticates with the
// user's session token and reads Helm data as that user.
import { HELM_API_BASE } from "./backend";
import { supabase } from "./supabase";

export async function askAdvisor(body) {
  const token = (await supabase.auth.getSession()).data.session?.access_token;
  if (!token) return { success: false, error: "Session expired. Refresh the page and try again." };
  try {
    const res = await fetch(`${HELM_API_BASE}/rd-advisor`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({ success: false, error: `The advisor returned ${res.status}` }));
    if (!res.ok && data.success !== false) return { success: false, error: data.error || `The advisor returned ${res.status}` };
    return data;
  } catch (e) {
    return { success: false, error: String(e?.message || e) };
  }
}
