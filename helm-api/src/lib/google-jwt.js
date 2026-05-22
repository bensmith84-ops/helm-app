
// Service Account JWT signing for Google APIs (Node native crypto).
const crypto = require('crypto');

function base64url(input) {
  if (typeof input === 'string') input = Buffer.from(input);
  return input.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function getGoogleAccessToken(sa, scope = 'https://www.googleapis.com/auth/spreadsheets.readonly') {
  if (!sa?.client_email || !sa?.private_key) {
    throw new Error('Invalid service account: missing client_email or private_key');
  }
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: sa.client_email,
    scope,
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  };

  const headerB64 = base64url(JSON.stringify(header));
  const payloadB64 = base64url(JSON.stringify(payload));
  const signingInput = `${headerB64}.${payloadB64}`;

  // Node crypto.sign handles the PEM-formatted private key directly
  const sig = crypto.sign('RSA-SHA256', Buffer.from(signingInput), sa.private_key);
  const sigB64 = base64url(sig);
  const jwt = `${signingInput}.${sigB64}`;

  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${jwt}`,
  });
  const data = await r.json();
  if (!data.access_token) throw new Error(`Token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

function loadServiceAccount() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT not set');
  return JSON.parse(raw);
}

module.exports = { getGoogleAccessToken, loadServiceAccount, base64url };
