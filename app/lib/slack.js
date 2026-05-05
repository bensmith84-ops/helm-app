// Helm → Slack notification helper
// Calls the slack-notify Supabase edge function

const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwYmpkbW55a2hldWJ4a3VrbnVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNDI3OTcsImV4cCI6MjA4NzcxODc5N30.pvTTkiZWNDPuo-Fdzm54uy8w1mlx0AjB5jtFm3MeGq4";
const EDGE_NOTIFY  = "https://upbjdmnykheubxkuknuj.supabase.co/functions/v1/slack-notify";
const EDGE_UPDATE  = "https://upbjdmnykheubxkuknuj.supabase.co/functions/v1/slack-update";

/**
 * Send a fresh notification to Slack via slack-notify.
 * Returns the response body, which on success includes { success, ts, channel }
 * so callers can persist the message coordinates to update it later.
 */
export async function notifySlack({ type = "info", title, message, channel = "ben", url, fields, actions, request_id, budget_context } = {}) {
  try {
    const res = await fetch(EDGE_NOTIFY, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ANON_KEY}` },
      body: JSON.stringify({ type, title, message, channel, url, fields, actions, request_id, budget_context }),
    });
    const data = await res.json();
    if (!data.success) console.warn("Slack notify failed:", data.error);
    return data;
  } catch (e) {
    console.warn("Slack notify error:", e);
    return null;
  }
}

/**
 * Update a previously-posted Slack message (strip buttons, show outcome).
 * Used when a status change happens in Helm and we want the originating
 * Slack DM to reflect that so the user knows it's been actioned.
 *
 * @param {Object} opts
 * @param {string} opts.channel_id  Slack channel id (DM channel id is fine)
 * @param {string} opts.message_ts  Slack ts string returned by chat.postMessage
 * @param {string} opts.status      af_requests.status value (approved/rejected/conditionally_approved/etc.)
 * @param {string} [opts.title]     Spend request title
 * @param {string} [opts.actor_name] Who took the action
 * @param {string} [opts.note]      Optional reason/question to display under the header
 * @param {string} [opts.url]       Link to view in Helm
 */
export async function notifySlackUpdate({ channel_id, message_ts, status, title, actor_name, note, url } = {}) {
  if (!channel_id || !message_ts) return null;
  try {
    const res = await fetch(EDGE_UPDATE, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${ANON_KEY}` },
      body: JSON.stringify({ channel_id, message_ts, status, title, actor_name, note, url }),
    });
    const data = await res.json();
    if (!data.success) console.warn("Slack update failed:", data.error);
    return data;
  } catch (e) {
    console.warn("Slack update error:", e);
    return null;
  }
}
