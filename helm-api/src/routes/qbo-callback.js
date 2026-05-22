
// GET /qbo-callback — port of supabase/functions/qbo-callback
// OAuth callback: CSRF verify state, exchange code for tokens, fetch company info, upsert connection.
const { getTokenEndpoint } = require('../lib/qbo');

const APP_URL = process.env.APP_URL || 'https://helm-app-six.vercel.app';

module.exports = function(app, { pool }) {
  app.get('/qbo-callback', async (req, res) => {
    try {
      const { code, realmId, state, error } = req.query;

      if (error) {
        return res.redirect(`${APP_URL}?qbo_error=${encodeURIComponent(String(error))}`);
      }
      if (!code || !realmId || !state) {
        return res.redirect(`${APP_URL}?qbo_error=missing_params`);
      }

      const clientId = process.env.QBO_CLIENT_ID;
      const clientSecret = process.env.QBO_CLIENT_SECRET;
      const redirectUri = process.env.OAUTH_REDIRECT_QBO
        || (process.env.OAUTH_REDIRECT_BASE ? `${process.env.OAUTH_REDIRECT_BASE}/qbo-callback` : null)
        || `https://upbjdmnykheubxkuknuj.supabase.co/functions/v1/qbo-callback`;
      const environment = process.env.QBO_ENVIRONMENT || 'production';

      if (!clientId || !clientSecret) {
        return res.redirect(`${APP_URL}?qbo_error=missing_credentials`);
      }

      // CSRF: verify state
      const { rows: stateRows } = await pool.query(
        `SELECT state, used, created_at, org_id, user_id FROM qbo_oauth_states WHERE state = $1 LIMIT 1`,
        [state]
      );
      const stateRow = stateRows[0];
      if (!stateRow) return res.redirect(`${APP_URL}?qbo_error=csrf_state_invalid`);
      if (stateRow.used) return res.redirect(`${APP_URL}?qbo_error=csrf_state_replayed`);
      const stateAge = Date.now() - new Date(stateRow.created_at).getTime();
      if (stateAge > 10 * 60 * 1000) return res.redirect(`${APP_URL}?qbo_error=csrf_state_expired`);

      await pool.query(`UPDATE qbo_oauth_states SET used = true WHERE state = $1`, [state]);

      const orgId = stateRow.org_id || 'a0000000-0000-0000-0000-000000000001';
      const connectedBy = stateRow.user_id || null;

      const tokenEndpoint = await getTokenEndpoint();
      const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

      const tokenRes = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${basicAuth}`,
          Accept: 'application/json',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code: String(code),
          redirect_uri: redirectUri,
        }),
      });

      if (!tokenRes.ok) {
        console.error('[qbo-callback] Token exchange failed:', await tokenRes.text());
        return res.redirect(`${APP_URL}?qbo_error=token_exchange_failed`);
      }

      const tokens = await tokenRes.json();
      const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

      // Fetch company name
      const base = environment === 'sandbox'
        ? 'https://sandbox-quickbooks.api.intuit.com'
        : 'https://quickbooks.api.intuit.com';
      let companyName = null;
      try {
        const coRes = await fetch(
          `${base}/v3/company/${realmId}/companyinfo/${realmId}?minorversion=65`,
          { headers: { Authorization: `Bearer ${tokens.access_token}`, Accept: 'application/json' } }
        );
        if (coRes.ok) {
          const coData = await coRes.json();
          companyName = coData.CompanyInfo?.CompanyName || null;
        }
      } catch {}

      await pool.query(
        `INSERT INTO qbo_connections
          (org_id, realm_id, company_name, access_token, refresh_token, token_expires_at,
           environment, connected_by, connected_at, sync_status, last_error)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), 'idle', NULL)
         ON CONFLICT (realm_id) DO UPDATE
         SET org_id = EXCLUDED.org_id, company_name = EXCLUDED.company_name,
             access_token = EXCLUDED.access_token, refresh_token = EXCLUDED.refresh_token,
             token_expires_at = EXCLUDED.token_expires_at,
             environment = EXCLUDED.environment, connected_by = EXCLUDED.connected_by,
             connected_at = NOW(), sync_status = 'idle', last_error = NULL`,
        [orgId, realmId, companyName, tokens.access_token, tokens.refresh_token, expiresAt, environment, connectedBy]
      );

      res.redirect(`${APP_URL}?qbo_connected=1&company=${encodeURIComponent(companyName || String(realmId))}`);
    } catch (e) {
      console.error('[qbo-callback]', e?.message);
      res.redirect(`${APP_URL}?qbo_error=${encodeURIComponent(e?.message || 'unknown')}`);
    }
  });
};
