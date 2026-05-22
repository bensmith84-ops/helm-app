
// POST /shopify-debug — port of supabase/functions/shopify-debug
// Diagnostic: pings Shopify across multiple API versions to detect which work with the stored token.
module.exports = function(app, { pool }) {
  app.post('/shopify-debug', async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT access_token, store_domain FROM integrations
         WHERE provider = 'shopify' AND status = 'active' LIMIT 1`
      );
      const integration = rows[0];
      if (!integration?.access_token) return res.json({ error: 'No shopify integration' });

      const shop = integration.store_domain;
      const token = integration.access_token;
      const versions = ['2024-01', '2024-10', '2025-01'];
      const results = { shop, token_length: token.length, token_prefix: token.slice(0, 8) };

      for (const ver of versions) {
        try {
          const pRes = await fetch(`https://${shop}/admin/api/${ver}/products/count.json`, {
            headers: { 'X-Shopify-Access-Token': token },
          });
          results[`products_count_${ver}`] = { status: pRes.status, body: (await pRes.text()).slice(0, 300) };

          const oRes = await fetch(`https://${shop}/admin/api/${ver}/orders/count.json?status=any`, {
            headers: { 'X-Shopify-Access-Token': token },
          });
          results[`orders_count_${ver}`] = { status: oRes.status, body: (await oRes.text()).slice(0, 300) };

          const cRes = await fetch(`https://${shop}/admin/api/${ver}/customers/count.json`, {
            headers: { 'X-Shopify-Access-Token': token },
          });
          results[`customers_count_${ver}`] = { status: cRes.status, body: (await cRes.text()).slice(0, 300) };
        } catch (e) {
          results[`error_${ver}`] = e?.message || String(e);
        }
      }

      try {
        const sRes = await fetch(`https://${shop}/admin/api/2024-01/shop.json`, {
          headers: { 'X-Shopify-Access-Token': token },
        });
        results.shop_info = { status: sRes.status, body: (await sRes.text()).slice(0, 300) };
      } catch (e) { results.shop_info_error = e?.message || String(e); }

      res.json(results);
    } catch (err) {
      res.json({ error: err?.message || String(err) });
    }
  });
};
