
// GET /shopify-callback — port of supabase/functions/shopify-callback
// 2 modes: ?action=connect (redirect to Shopify OAuth) or callback with code+shop.
// NOTE: Original source had SHOPIFY_CLIENT_ID hard-coded — now from process.env.
const APP_URL = process.env.APP_URL || 'https://helm-app-six.vercel.app';
const SUPABASE_FN_URL = 'https://upbjdmnykheubxkuknuj.supabase.co/functions/v1/shopify-callback';

module.exports = function(app, { pool }) {
  app.get('/shopify-callback', async (req, res) => {
    try {
      const SHOPIFY_CLIENT_ID = process.env.SHOPIFY_CLIENT_ID || '';
      const SHOPIFY_CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET || '';

      // Mode 1: redirect to Shopify OAuth
      if (req.query.action === 'connect') {
        if (!SHOPIFY_CLIENT_ID) return res.status(500).send('SHOPIFY_CLIENT_ID not configured');
        const shop = String(req.query.shop || 'earth-breeze-hydrogen.myshopify.com');
        const crypto = require('crypto');
        const state = crypto.randomUUID();
        const scopes = 'read_orders,read_customers,read_products';
        // NOTE: redirect_uri still points at Supabase function until cutover
        const redirectUri = SUPABASE_FN_URL;
        const authUrl = `https://${shop}/admin/oauth/authorize?client_id=${SHOPIFY_CLIENT_ID}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
        return res.redirect(302, authUrl);
      }

      // Mode 2: Shopify redirects back with code + shop
      const code = req.query.code;
      const shop = req.query.shop;

      if (!code || !shop) {
        return res.status(400).send('Missing code or shop parameter');
      }
      if (!SHOPIFY_CLIENT_ID || !SHOPIFY_CLIENT_SECRET) {
        return res.status(500).send('Shopify credentials not configured');
      }

      const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: SHOPIFY_CLIENT_ID,
          client_secret: SHOPIFY_CLIENT_SECRET,
          code,
        }),
      });

      if (!tokenRes.ok) {
        return res.status(500).send(`Token exchange failed: ${await tokenRes.text()}`);
      }
      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token;
      const scopes = tokenData.scope;
      if (!accessToken) return res.status(500).send('No access token in response');

      const { rows: orgRows } = await pool.query(`SELECT id FROM organizations LIMIT 1`);
      const orgId = orgRows[0]?.id;
      if (!orgId) return res.status(500).send('No organization found');

      // Initial upsert
      await pool.query(
        `INSERT INTO integrations
          (org_id, provider, store_domain, access_token, scopes, status, connected_at, metadata)
         VALUES ($1, 'shopify', $2, $3, $4, 'active', NOW(), $5)
         ON CONFLICT (org_id, provider) DO UPDATE
         SET store_domain = EXCLUDED.store_domain,
             access_token = EXCLUDED.access_token,
             scopes = EXCLUDED.scopes,
             status = 'active',
             connected_at = NOW(),
             metadata = EXCLUDED.metadata`,
        [orgId, shop, accessToken, scopes || '',
         JSON.stringify({ shop_name: String(shop).replace('.myshopify.com', '') })]
      );

      // Try to enrich with shop info
      try {
        const shopRes = await fetch(`https://${shop}/admin/api/2024-01/shop.json`, {
          headers: { 'X-Shopify-Access-Token': accessToken },
        });
        if (shopRes.ok) {
          const shopData = await shopRes.json();
          if (shopData?.shop) {
            await pool.query(
              `UPDATE integrations SET metadata = $1 WHERE org_id = $2 AND provider = 'shopify'`,
              [JSON.stringify({
                shop_name: shopData.shop.name,
                shop_domain: shopData.shop.domain,
                shop_email: shopData.shop.email,
                shop_currency: shopData.shop.currency,
                shop_plan: shopData.shop.plan_name,
              }), orgId]
            );
          }
        }
      } catch {}

      res.redirect(302, `${APP_URL}?shopify=connected`);
    } catch (err) {
      res.status(500).send(`Error: ${err?.message || String(err)}`);
    }
  });
};
