// Default-deny authentication gate for helm-api.
//
// helm-api runs on Cloud Run with --allow-unauthenticated, so every route is
// reachable from the internet. This middleware runs before all routes and
// decides, per request, which of four classes it falls into:
//
//   public    - routes that cannot carry a Helm login and protect themselves
//               (signed webhooks, OAuth redirects, own-secret routes, health)
//   internal  - calls made from inside this container (the /cron dispatcher and
//               sync orchestrators call SELF_URL=localhost). Detected by a
//               loopback peer address with no X-Forwarded-For; requests from
//               the internet always arrive via Google's front end, never from
//               127.0.0.1 inside the container.
//   admin     - user / permission management and credential storage:
//               Firebase login + active membership with role owner or admin
//   signedin  - /auth/bind and /whoami: any verified Firebase token (binding is
//               how a sign-in becomes a Helm profile, so it can't need one yet;
//               /auth/bind does its own email-verification checks)
//   data      - /rest/v1 and /storage/v1 (the Supabase-compatible shims). With a
//               token: any bound Helm profile, including external collaborators,
//               because row-level security decides what they see. Without a
//               token: passed through as anon (RLS as the anon role, public
//               file reads only), matching Supabase's public anon key.
//   member    - everything else: Firebase login bound to a Helm profile
//               (profiles.firebase_uid) with an active org membership.
//
// A valid Firebase token alone is NOT enough: Firebase self sign-up is open,
// so anyone can mint one. Membership is what proves "Helm user".
//
// AUTH_GATE_MODE=report logs would-be denials without blocking (escape hatch).

const ROLE_LEVEL = { owner: 5, admin: 4, manager: 3, member: 2, guest: 1 };

// [method or '*', exact path or prefix ending in '*']
const PUBLIC = [
  ['GET', '/health'],
  ['*', '/cron'],                    // own X-Cron-Secret check
  ['POST', '/data-mirror-export'],   // own OIDC / cron-secret check
  ['POST', '/admin/shopify-token-relay'], // own backfill-key check
  ['POST', '/slack-interactivity'],  // Slack signing secret
  ['POST', '/livekit-webhook'],      // LiveKit webhook signature
  ['*', '/meta-social'],             // Meta webhook verify token / signature
  ['*', '/esign'],                   // signer links for external signers
  ['*', '/esign-pdf'],
  ['GET', '/qbo-callback'],          // OAuth redirect from Intuit
  ['GET', '/shopify-callback'],      // OAuth redirect from Shopify
  ['GET', '/gmail-scan'],            // OAuth redirect from Google (code exchange)
  ['POST', '/rd-advisor'],
  ['POST', '/public-form'],
  ['POST', '/admin/secret-relay'],   // TEMPORARY: own check (Supabase service-role key); remove after use          // outside submitters; route validates an active form's public_token           // own auth: Firebase or Supabase session + active membership
];

const SIGNED_IN = ['/auth/bind', '/whoami'];
const DATA_PREFIXES = ['/rest/v1/', '/storage/v1/'];

const ADMIN = [
  '/remove-user', '/invite-user', '/invite-external-collaborator',
  '/manage-user', '/shopify-store-token', '/ai-deploy',
  '/admin/import-auth-users', '/admin/db-inspect',
];

function classify(method, path) {
  const p = (path || '/').split('?')[0].replace(/\/+$/, '') || '/';
  for (const [m, pat] of PUBLIC) {
    const hit = pat.endsWith('*') ? p.startsWith(pat.slice(0, -1)) : p === pat;
    if (hit && (m === '*' || m === method)) return 'public';
  }
  if (ADMIN.includes(p)) return 'admin';
  if (SIGNED_IN.includes(p)) return 'signedin';
  if (DATA_PREFIXES.some((d) => (p + '/').startsWith(d))) return 'data';
  return 'member';
}

function isInternal(req) {
  const ra = (req.socket && req.socket.remoteAddress) || '';
  const loopback = ra === '127.0.0.1' || ra === '::1' || ra === '::ffff:127.0.0.1';
  return loopback && !req.headers['x-forwarded-for'];
}

async function resolveMember(pool, firebaseUid) {
  const { rows } = await pool.query(
    `SELECT p.id AS profile_id, om.role, om.org_id
       FROM profiles p
       JOIN org_memberships om ON om.user_id = p.id AND om.is_active = true
      WHERE p.firebase_uid = $1`,
    [firebaseUid]
  );
  if (!rows.length) return null;
  rows.sort((a, b) => (ROLE_LEVEL[b.role] || 0) - (ROLE_LEVEL[a.role] || 0));
  return rows[0];
}

// Any Helm profile bound to this sign-in, member or external collaborator.
async function resolveProfile(pool, firebaseUid) {
  const { rows } = await pool.query(
    `SELECT id AS profile_id, coalesce(is_external, false) AS is_external FROM profiles WHERE firebase_uid = $1 LIMIT 1`,
    [firebaseUid]
  );
  return rows[0] || null;
}

// On the preview API (HELM_PREVIEW=true, running on a copy of live data), block
// everything that talks to the outside world: syncing QuickBooks would rotate
// the live refresh token, and Slack/email routes would message real people.
// (Sheets syncs are allowed: they only read the sheet and write the copy.)
const PREVIEW_BLOCK = /^\/(qbo-|shopify-|slack-|cx-email|cx-export|gmail-|send-invite|invite-|ramp-|google-docs|meta-social|tiktok-|asana-|call-manager|livekit|esign|scorecard-auto-calc|cron|data-mirror|admin\/)/;

// Admin tools that only read the copy (or write Firebase) are allowed on preview.
const PREVIEW_ALLOWED_ADMIN = new Set(['/admin/import-auth-users', '/admin/db-inspect']);

function authGate({ pool, verifyIdToken, mode = process.env.AUTH_GATE_MODE || 'enforce', preview = process.env.HELM_PREVIEW === 'true' }) {
  return async function gate(req, res, next) {
    if (req.method === 'OPTIONS') return next(); // CORS preflight
    if (preview && PREVIEW_BLOCK.test(req.path) && !PREVIEW_ALLOWED_ADMIN.has(req.path)) return res.status(503).json({ error: 'disabled_in_preview', path: req.path });
    const cls = classify(req.method, req.path);
    if (cls === 'public' || isInternal(req)) return next();

    const deny = (code, reason) => {
      console.warn(JSON.stringify({ event: 'auth_gate_deny', mode, cls, method: req.method, path: req.path, reason, ip: req.headers['x-forwarded-for'] || null }));
      if (mode === 'report') return next();
      return res.status(code).json({ error: code === 401 ? 'unauthorized' : 'forbidden', reason });
    };

    const auth = req.headers.authorization || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token && cls === 'data') { req.anon = true; return next(); }
    if (!token) return deny(401, 'missing_token');
    let decoded;
    try { decoded = await verifyIdToken(token); } catch { return deny(401, 'invalid_token'); }
    if (cls === 'signedin') { req.firebaseGate = decoded; return next(); }
    if (cls === 'data') {
      let prof;
      try { prof = await resolveProfile(pool, decoded.sub); } catch (e) {
        console.error('[auth-gate] profile lookup failed:', e.message);
        return deny(503, 'membership_lookup_failed');
      }
      if (!prof) return deny(403, 'not_a_helm_member');
      req.helmMember = { profile_id: prof.profile_id, role: prof.is_external ? 'external' : 'profile', is_external: prof.is_external };
      return next();
    }

    let member;
    try { member = await resolveMember(pool, decoded.sub); } catch (e) {
      console.error('[auth-gate] membership lookup failed:', e.message);
      return deny(503, 'membership_lookup_failed');
    }
    if (!member) return deny(403, 'not_a_helm_member');
    if (cls === 'admin' && (ROLE_LEVEL[member.role] || 0) < ROLE_LEVEL.admin) return deny(403, 'admin_required');

    req.helmMember = member;
    return next();
  };
}

module.exports = { PREVIEW_BLOCK, authGate, classify, isInternal, resolveMember, resolveProfile, SIGNED_IN, DATA_PREFIXES, ROLE_LEVEL, PUBLIC, ADMIN };
