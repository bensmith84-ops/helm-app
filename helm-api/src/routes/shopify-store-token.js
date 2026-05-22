
// POST /shopify-store-token — port of supabase/functions/shopify-store-token
// Stores manually-entered Shopify access token, verifies via shop.json, upserts integrations row.
module.exports = function(app, { pool }) {
  app.post('/shopify-store-token', async (req, res) => {
    try {
      const { shop, access_token, scopes } = req.body || {};
      if (!shop || !access_token) {
        return res.status(400).json({ success: false, error: 'Missing shop or access_token' });
      }

      // Get the primary org
      const { rows: orgRows } = await pool.query(`SELECT id FROM organizations LIMIT 1`);
      if (!orgRows[0]?.id) throw new Error('No organization found');
      const orgId = orgRows[0].id;

      // Verify token by fetching shop info
      let shopData = null;
      try {
        const shopRes = await fetch(`https://${shop}/admin/api/2024-01/shop.json`, {
          headers: { 'X-Shopify-Access-Token': access_token },
        });
        if (shopRes.ok) shopData = await shopRes.json();
      } catch (e) {
        console.error('Shopify shop.json fetch:', e?.message);
      }

      const metadata = shopData?.shop
        ? {
            shop_name: shopData.shop.name,
            shop_domain: shopData.shop.domain,
            shop_email: shopData.shop.email,
            shop_currency: shopData.shop.currency,
            shop_plan: shopData.shop.plan_name,
          }
        : { shop_name: shop.replace('.myshopify.com', '') };

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
        [orgId, shop, access_token, scopes || '', JSON.stringify(metadata)]
      );

      res.json({ success: true, shop_name: shopData?.shop?.name || shop });
    } catch (err) {
      res.status(500).json({ success: false, error: err?.message || String(err) });
    }
  });
};
