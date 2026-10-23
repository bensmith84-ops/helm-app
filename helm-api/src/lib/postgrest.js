// Proxy /rest/v1 to a real PostgREST (POSTGREST_URL), the engine Supabase uses,
// so every query the app makes behaves exactly as it does on Supabase.
//
// helm-api stays the front door: the auth gate has already decided who the
// caller is (req.helmMember / req.anon). Here we mint a short-lived HS256 JWT
// for PostgREST with role=authenticated and sub=<Helm profile id> (or send
// none for anon), so RLS policies and auth.uid() work unchanged. PostgREST runs
// IAM-private on Cloud Run; we reach it with an ID token in
// X-Serverless-Authorization, leaving Authorization for the app JWT.

const crypto = require('crypto');

function jwtSecret(pgPassword = process.env.PGPASSWORD || '') {
  if (!pgPassword) throw new Error('PGPASSWORD missing');
  return crypto.createHash('sha256').update('helm-postgrest-jwt:' + pgPassword).digest('hex');
}

const b64u = (b) => Buffer.from(b).toString('base64url');
function mintJwt(claims, { secret = jwtSecret(), ttlSec = 300, nowSec = Math.floor(Date.now() / 1000) } = {}) {
  const head = b64u(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify({ aud: 'authenticated', iat: nowSec, exp: nowSec + ttlSec, ...claims }));
  const sig = crypto.createHmac('sha256', secret).update(`${head}.${body}`).digest('base64url');
  return `${head}.${body}.${sig}`;
}

let idTok = { aud: null, token: null, exp: 0 };
async function identityToken(audience, { fetchImpl = fetch, now = Date.now } = {}) {
  if (idTok.aud === audience && idTok.exp - 120_000 > now()) return idTok.token;
  const r = await fetchImpl(`http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=${encodeURIComponent(audience)}`, { headers: { 'Metadata-Flavor': 'Google' } });
  if (!r.ok) throw new Error(`identity token ${r.status}`);
  const token = (await r.text()).trim();
  idTok = { aud: audience, token, exp: now() + 50 * 60_000 };
  return token;
}

const PASS_REQ = ['accept', 'prefer', 'range', 'range-unit', 'content-profile', 'accept-profile', 'content-type'];
const PASS_RES = ['content-type', 'content-range', 'preference-applied', 'location', 'range-unit'];

function makeProxy({ baseUrl, fetchImpl = fetch, idTokenFn = identityToken, secretFn = jwtSecret }) {
  const base = baseUrl.replace(/\/+$/, '');
  return async function proxy(req, res) {
    const headers = {};
    for (const h of PASS_REQ) if (req.headers[h]) headers[h] = req.headers[h];
    if (!req.anon) {
      const uid = req.helmMember?.profile_id || req.user?.helm_user?.uid;
      if (!uid) return res.status(403).json({ code: 'PGRST301', message: 'no Helm profile bound to this sign-in' });
      headers.authorization = `Bearer ${mintJwt({ sub: uid, role: 'authenticated', email: req.firebase?.email || undefined }, { secret: secretFn() })}`;
    }
    if (!/^http:\/\/(localhost|127\.0\.0\.1)/.test(base)) {
      headers['x-serverless-authorization'] = `Bearer ${await idTokenFn(base)}`;
    }
    const qs = req.originalUrl.includes('?') ? req.originalUrl.slice(req.originalUrl.indexOf('?')) : '';
    const path = req.originalUrl.split('?')[0].replace(/^\/rest\/v1/, '');
    let body;
    if (!['GET', 'HEAD', 'DELETE'].includes(req.method) || (req.method === 'DELETE' && req.body && Object.keys(req.body).length)) {
      body = Buffer.isBuffer(req.body) ? req.body : (req.body === undefined ? undefined : JSON.stringify(req.body));
      if (body !== undefined && !headers['content-type']) headers['content-type'] = 'application/json';
    }
    let r;
    try {
      r = await fetchImpl(`${base}${path}${qs}`, { method: req.method, headers, body });
    } catch (e) {
      console.error('[postgrest] upstream error:', e.message);
      return res.status(502).json({ code: 'PGRST000', message: 'database service unavailable' });
    }
    res.status(r.status);
    for (const h of PASS_RES) { const v = r.headers.get(h); if (v) res.setHeader(h, v); }
    res.setHeader('X-Helm-Rest', 'postgrest');
    if (req.method === 'HEAD') return res.end();
    return res.end(Buffer.from(await r.arrayBuffer()));
  };
}

module.exports = { makeProxy, mintJwt, jwtSecret, identityToken };
