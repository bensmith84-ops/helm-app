// Helm → Slack notification helper
// Calls the slack-notify Supabase edge function

const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwYmpkbW55a2hldWJ4a3VrbnVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNDI3OTcsImV4cCI6MjA4NzcxODc5N30.pvTTkiZWNDPuo-Fdzm54uy8w1mlx0AjB5jtFm3MeGq4";
const EDGE_URL = "https://upbjdmnykheubxkuknuj.supabase.co/functions/v1/slack-notify";

/**
 * Send a notification to Slack via the slack-notify edge function.
 * @param {Object} opts
 * @param {string} opts.type        - okr | task | plm | approval | finance | alert | info
 * @param {string} opts.title       - Bold heading
 * @param {string} opts.message     - Body text (supports *bold* _italic_)
 * @param {string} [opts.channel]   - Slack channel key: "general" | "operations" (default: "general")
 * @param {string} [opts.url]       - Optional CTA link (opens in Helm)
 * @param {Array}  [opts.fields]    - Optional [{label, value}] shown as field columns
 */
export async function notifySlack({ type = "info", title, message, channel = "ben", url, fields, actions, request_id } = {}) {
  try {
    const res = await fetch(EDGE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ANON_KEY}` },
      body: JSON.stringify({ type, title, message, channel, url, fields, actions, request_id }),
    });
    const data = await res.json();
    if (!data.success) console.warn("Slack notify failed:", data.error);
    return data;
  } catch (e) {
    console.warn("Slack notify error:", e);
  }
}
