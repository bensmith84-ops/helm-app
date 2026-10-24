// POST /admin/secret-relay  - ONE-TIME move of app secrets from Supabase to
// Google Secret Manager, so nobody has to copy and paste them.
//
// Caller: a temporary Supabase Edge Function that reads its own environment.
// Auth: the Authorization bearer must be Supabase's service-role key, proven
// by calling Supabase's admin API with it (only that key succeeds). No new
// shared secret is involved.
// Only names in ALLOWED are stored; everything else is ignored. Values are
// never logged or returned. Remove this route (and the runtime account's
// Secret Manager Admin role) once the move is done.

const crypto = require('crypto');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://upbjdmnykheubxkuknuj.supabase.co';
const PROJECT = process.env.GCP_PROJECT || 'helm-496923';
const ALLOWED = new Set([
  'SUPABASE_SERVICE_ROLE_KEY', 'METABASE_API_KEY', 'METABASE_URL', 'ASANA_PAT', 'RESEND_API_KEY',
  'SHOPIFY_CLIENT_ID', 'SHOPIFY_CLIENT_SECRET', 'META_APP_ID', 'META_APP_SECRET',
  'TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET', 'LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET',
  'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'RAMP_CLIENT_SECRET', 'RECAPTCHA_SECRET_KEY',
]);

async function isServiceRole(token, { fetchImpl = fetch } = {}) {
  if (!token || token.length < 40) return false;
  const r = await fetchImpl(`${SUPABASE_URL}/auth/v1/admin/users?page=1&per_page=1`, { headers: { apikey: token, Authorization: `Bearer ${token}` } });
  return r.status === 200;
}

async function smToken({ fetchImpl = fetch } = {}) {
  const r = await fetchImpl('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token?scopes=' + encodeURIComponent('https://www.googleapis.com/auth/cloud-platform'), { headers: { 'Metadata-Flavor': 'Google' } });
  if (!r.ok) throw new Error(`metadata token ${r.status}`);
  return (await r.json()).access_token;
}

async function storeSecret(name, value, { fetchImpl = fetch, token }) {
  const base = `https://secretmanager.googleapis.com/v1/projects/${PROJECT}/secrets`;
  const H = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  const c = await fetchImpl(`${base}?secretId=${encodeURIComponent(name)}`, { method: 'POST', headers: H, body: JSON.stringify({ replication: { automatic: {} } }) });
  if (!c.ok && c.status !== 409) return { ok: false, step: 'create', status: c.status };
  const data = Buffer.from(String(value), 'utf8').toString('base64');
  const v = await fetchImpl(`${base}/${encodeURIComponent(name)}:addVersion`, { method: 'POST', headers: H, body: JSON.stringify({ payload: { data} }) });
  return v.ok ? { ok: true, created: c.ok } : { ok: false, step: 'addVersion', status: v.status };
}

module.exports = function (app, { fetchImpl = fetch } = {}) {
  app.post('/admin/secret-relay', async (req, res) => {
    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    try {
      if (!(await isServiceRole(token, { fetchImpl }))) return res.status(403).json({ error: 'forbidden' });
      const incoming = (req.body && typeof req.body.secrets === 'object' && req.body.secrets) || {};
      const sm = await smToken({ fetchImpl });
      const stored = []; const failed = []; const ignored = [];
      for (const [name, value] of Object.entries(incoming)) {
        if (!ALLOWED.has(name)) { ignored.push(name); continue; }
        if (typeof value !== 'string' || !value.length) continue;
        const r = await storeSecret(name, value, { fetchImpl, token: sm });
        if (r.ok) stored.push(name); else failed.push({ name, step: r.step, status: r.status });
      }
      const fingerprint = (v) => crypto.createHash('sha256').update(String(v)).digest('hex').slice(0, 8);
      console.log(JSON.stringify({ event: 'secret_relay', stored, failed, ignored }));
      res.json({ stored, failed, ignored, fingerprints: Object.fromEntries(stored.map((n) => [n, fingerprint(incoming[n])])) });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
};
module.exports._internal = { ALLOWED, isServiceRole, storeSecret };
