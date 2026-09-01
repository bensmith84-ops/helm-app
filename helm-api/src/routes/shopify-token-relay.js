// POST /admin/shopify-token-relay
// Bridge for the legacy-DB Shopify backfill: validates the caller's key against
// the Supabase-side backfill state (RPC check_backfill_key), live-tests the
// Cloud SQL integrations token against Shopify, and if valid pushes it into the
// Supabase integrations row (RPC update_shopify_token). The token itself never
// appears in a response body. Also reports validity for diagnostics.
const SUPABASE_URL = 'https://upbjdmnykheubxkuknuj.supabase.co';
const SB_ANON = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVwYmpkbW55a2hldWJ4a3VrbnVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIxNDI3OTcsImV4cCI6MjA4NzcxODc5N30.pvTTkiZWNDPuo-Fdzm54uy8w1mlx0AjB5jtFm3MeGq4';

async function rpc(name, args) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SB_ANON, Authorization: `Bearer ${SB_ANON}` },
    body: JSON.stringify(args),
  });
  if (!res.ok) throw new Error(`rpc ${name} ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

module.exports = function(app, { pool }) {
  app.post('/admin/shopify-token-relay', async (req, res) => {
    try {
      const key = req.body?.key || req.headers['x-backfill-key'];
      if (!key) return res.status(400).json({ error: 'missing key' });
      const ok = await rpc('check_backfill_key', { p_key: key });
      if (ok !== true) return res.status(403).json({ error: 'bad key' });

      // Set mode: caller supplies a fresh Admin API token; test it, then write it
      // to BOTH databases (Cloud SQL directly, Supabase via keyed RPC).
      if (req.body?.set_token) {
        const domain = req.body.set_domain || 'earth-breeze-hydrogen.myshopify.com';
        const t = await fetch(`https://${domain}/admin/api/2024-01/shop.json`, {
          headers: { 'X-Shopify-Access-Token': req.body.set_token },
        });
        if (!t.ok) return res.status(400).json({ error: `new token failed shopify test: ${t.status}` });
        await pool.query(
          `UPDATE integrations SET access_token=$1, store_domain=$2, status='active', updated_at=NOW() WHERE provider='shopify'`,
          [req.body.set_token, domain]
        );
        const pushed = (await rpc('update_shopify_token', { p_key: key, p_token: req.body.set_token, p_domain: domain })) === true;
        return res.json({ set: true, valid: true, cloudsql_updated: true, supabase_pushed: pushed, store_domain: domain });
      }

      const { rows } = await pool.query(
        `SELECT access_token, store_domain, updated_at FROM integrations WHERE provider='shopify' AND access_token IS NOT NULL ORDER BY updated_at DESC LIMIT 1`
      );
      const integ = rows[0];
      if (!integ) return res.json({ cloudsql_has_token: false });

      const test = await fetch(`https://${integ.store_domain}/admin/api/2024-01/shop.json`, {
        headers: { 'X-Shopify-Access-Token': integ.access_token },
      });
      const valid = test.ok;
      let pushed = false;
      if (valid) {
        pushed = (await rpc('update_shopify_token', { p_key: key, p_token: integ.access_token, p_domain: integ.store_domain })) === true;
      }
      res.json({
        cloudsql_has_token: true,
        store_domain: integ.store_domain,
        token_updated_at: integ.updated_at,
        shopify_test_status: test.status,
        valid, pushed,
      });
    } catch (e) {
      res.status(500).json({ error: e?.message || String(e) });
    }
  });
};
