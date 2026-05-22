
// POST /qbo-auth-url — port of supabase/functions/qbo-auth-url
// Builds Intuit OAuth authorization URL with CSRF state stored in qbo_oauth_states.
// Optional reCAPTCHA verification (if RECAPTCHA_SECRET_KEY set).
const crypto = require('crypto');

const DISCOVERY_URL = 'https://developer.api.intuit.com/.well-known/openid_configuration';
const RECAPTCHA_VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';

module.exports = function(app, { pool }) {
  app.post('/qbo-auth-url', async (req, res) => {
    try {
      const clientId = process.env.QBO_CLIENT_ID;
      if (!clientId) return res.status(500).json({ error: 'QBO_CLIENT_ID not configured' });

      const recaptchaSecret = process.env.RECAPTCHA_SECRET_KEY;
      const body = req.body || {};
      const recaptchaToken = body.recaptcha_token || '';
      const orgId = body.org_id || null;
      const userId = body.user_id || null;

      // reCAPTCHA verification (only when secret is configured)
      if (recaptchaSecret) {
        if (!recaptchaToken) {
          return res.status(403).json({ error: 'reCAPTCHA verification required' });
        }
        const verifyRes = await fetch(RECAPTCHA_VERIFY_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `secret=${recaptchaSecret}&response=${recaptchaToken}`,
        });
        if (!verifyRes.ok) {
          return res.status(503).json({ error: 'reCAPTCHA verification service unavailable' });
        }
        const verifyData = await verifyRes.json();
        if (!verifyData.success) {
          return res.status(403).json({
            error: 'reCAPTCHA verification failed',
            codes: verifyData['error-codes'],
          });
        }
        if (typeof verifyData.score === 'number' && verifyData.score < 0.3) {
          return res.status(403).json({ error: 'reCAPTCHA score too low', score: verifyData.score });
        }
      }

      // NOTE: redirect_uri still points at legacy Supabase function until frontend cutover
      const redirectUri = process.env.OAUTH_REDIRECT_QBO
        || (process.env.OAUTH_REDIRECT_BASE ? `${process.env.OAUTH_REDIRECT_BASE}/qbo-callback` : null)
        || `https://upbjdmnykheubxkuknuj.supabase.co/functions/v1/qbo-callback`;
      const scope = 'com.intuit.quickbooks.accounting';

      // Try OpenID discovery for authorization endpoint, fall back to known URL
      let authorizationEndpoint = 'https://appcenter.intuit.com/connect/oauth2';
      try {
        const dr = await fetch(DISCOVERY_URL);
        if (dr.ok) {
          const discovery = await dr.json();
          if (discovery.authorization_endpoint) authorizationEndpoint = discovery.authorization_endpoint;
        }
      } catch { /* use fallback */ }

      // CSRF state
      const state = crypto.randomBytes(32).toString('hex');

      // Clean up expired states (>10 min old)
      await pool.query(
        `DELETE FROM qbo_oauth_states WHERE created_at < $1`,
        [new Date(Date.now() - 10 * 60 * 1000).toISOString()]
      );

      // Store state
      await pool.query(
        `INSERT INTO qbo_oauth_states (state, used, org_id, user_id) VALUES ($1, false, $2, $3)`,
        [state, orgId, userId]
      );

      const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: redirectUri,
        response_type: 'code',
        scope, state,
      });

      res.json({ auth_url: `${authorizationEndpoint}?${params.toString()}`, state });
    } catch (e) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });
};
