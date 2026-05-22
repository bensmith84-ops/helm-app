
// POST /shopify-sync — port of supabase/functions/shopify-sync
// 4 actions: products, customers, orders/day_sync, full.
// Cursor pagination via Link header (Shopify REST 2024-01).
const API_VERSION = '2024-01';

async function shopifyFetch(shop, token, endpoint) {
  const r = await fetch(`https://${shop}/admin/api/${API_VERSION}/${endpoint}`, {
    headers: { 'X-Shopify-Access-Token': token },
  });
  if (!r.ok) throw new Error(`Shopify ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return { data: await r.json(), link: r.headers.get('Link') || '' };
}

function getNextPageInfo(link) {
  const m = link.match(/<[^>]*page_info=([^>&]+)[^>]*>;\s*rel="next"/);
  return m ? m[1] : null;
}

// Bulk upsert helper for shopify_* tables
async function bulkUpsertRows(pool, table, rows, columns, conflictTarget, chunkSize = 200) {
  if (!rows.length) return 0;
  let total = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const batch = rows.slice(i, i + chunkSize);
    const values = [];
    const params = [];
    let pi = 1;
    for (const row of batch) {
      const cells = columns.map(() => `$${pi++}`);
      values.push(`(${cells.join(', ')})`);
      for (const col of columns) {
        let v = row[col];
        if (v !== null && v !== undefined && typeof v === 'object' && !(v instanceof Date) && !Array.isArray(v)) {
          v = JSON.stringify(v);
        } else if (Array.isArray(v)) {
          v = JSON.stringify(v);
        }
        params.push(v);
      }
    }
    const updateSet = columns
      .filter(c => !conflictTarget.split(',').map(s => s.trim()).includes(c))
      .map(c => `${c} = EXCLUDED.${c}`)
      .join(', ');
    await pool.query(
      `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${values.join(', ')}
       ON CONFLICT (${conflictTarget}) DO UPDATE SET ${updateSet}`,
      params
    );
    total += batch.length;
  }
  return total;
}

async function getIntegration(pool) {
  const { rows } = await pool.query(
    `SELECT * FROM integrations WHERE provider = 'shopify' AND status = 'active' LIMIT 1`
  );
  return rows[0];
}

module.exports = function(app, { pool }) {
  app.post('/shopify-sync', async (req, res) => {
    try {
      const body = req.body || {};
      const { action = 'day_sync', date, days_back } = body;

      const integration = await getIntegration(pool);
      if (!integration?.access_token) {
        return res.json({ success: false, error: 'Shopify not connected' });
      }
      const shop = integration.store_domain;
      const token = integration.access_token;
      const orgId = integration.org_id;
      const now = () => new Date().toISOString();

      // ── PRODUCTS ──
      if (action === 'products') {
        let allProducts = [];
        let nextPage = null;
        let pages = 0;
        do {
          const ep = nextPage
            ? `products.json?limit=250&page_info=${nextPage}`
            : `products.json?limit=250`;
          const { data, link } = await shopifyFetch(shop, token, ep);
          allProducts = allProducts.concat(data.products || []);
          nextPage = getNextPageInfo(link);
          pages++;
        } while (nextPage && pages < 20);

        const rows = [];
        for (const p of allProducts) {
          for (const v of (p.variants || [])) {
            rows.push({
              org_id: orgId, shopify_product_id: p.id, shopify_variant_id: v.id,
              title: p.title,
              variant_title: v.title === 'Default Title' ? null : v.title,
              sku: v.sku || `NOSKU-${v.id}`,
              product_type: p.product_type || null, vendor: p.vendor || null,
              price: parseFloat(v.price) || 0,
              compare_at_price: v.compare_at_price ? parseFloat(v.compare_at_price) : null,
              inventory_quantity: v.inventory_quantity || 0,
              is_physical: v.requires_shipping !== false,
              tags: p.tags ? p.tags.split(',').map(t => t.trim()) : [],
              image_url: p.image?.src || null,
              status: p.status || 'active',
              synced_at: now(),
            });
          }
        }
        const variantsUpserted = await bulkUpsertRows(pool, 'shopify_products', rows,
          ['org_id','shopify_product_id','shopify_variant_id','title','variant_title','sku','product_type','vendor','price','compare_at_price','inventory_quantity','is_physical','tags','image_url','status','synced_at'],
          'org_id, shopify_variant_id');

        return res.json({ success: true, action: 'products', products: allProducts.length, variants: variantsUpserted, pages });
      }

      // ── CUSTOMERS ──
      if (action === 'customers') {
        let allCustomers = [];
        let nextPage = null;
        let pages = 0;
        do {
          const ep = nextPage
            ? `customers.json?limit=250&page_info=${nextPage}`
            : `customers.json?limit=250`;
          const { data, link } = await shopifyFetch(shop, token, ep);
          allCustomers = allCustomers.concat(data.customers || []);
          nextPage = getNextPageInfo(link);
          pages++;
        } while (nextPage && pages < 100);

        const rows = allCustomers.map(c => ({
          org_id: orgId, shopify_customer_id: c.id,
          email: c.email, first_name: c.first_name, last_name: c.last_name,
          phone: c.phone, orders_count: c.orders_count || 0,
          total_spent: parseFloat(c.total_spent || '0'),
          tags: c.tags || null, state: c.state || null,
          currency: c.currency || 'USD',
          created_at: c.created_at, updated_at: c.updated_at,
          verified_email: c.verified_email || false,
          tax_exempt: c.tax_exempt || false,
          country: c.default_address?.country || null,
          province: c.default_address?.province || null,
          city: c.default_address?.city || null,
          synced_at: now(),
        }));
        const upserted = await bulkUpsertRows(pool, 'shopify_customers', rows,
          ['org_id','shopify_customer_id','email','first_name','last_name','phone','orders_count','total_spent','tags','state','currency','created_at','updated_at','verified_email','tax_exempt','country','province','city','synced_at'],
          'org_id, shopify_customer_id');
        return res.json({ success: true, action: 'customers', count: upserted, pages });
      }

      // ── ORDERS / DAY_SYNC ──
      if (action === 'orders' || action === 'day_sync') {
        const targetDate = date || new Date().toISOString().slice(0, 10);
        let allOrders = [];
        let nextPage = null;
        let pages = 0;
        do {
          const ep = nextPage
            ? `orders.json?limit=250&page_info=${nextPage}`
            : `orders.json?limit=250&status=any&created_at_min=${targetDate}T00:00:00-00:00&created_at_max=${targetDate}T23:59:59-00:00`;
          const { data, link } = await shopifyFetch(shop, token, ep);
          allOrders = allOrders.concat(data.orders || []);
          nextPage = getNextPageInfo(link);
          pages++;
        } while (nextPage && pages < 40);

        const orderRows = allOrders.map(o => ({
          org_id: orgId, shopify_order_id: o.id, order_number: o.name,
          email: o.email, created_at: o.created_at, updated_at: o.updated_at,
          cancelled_at: o.cancelled_at || null,
          financial_status: o.financial_status,
          fulfillment_status: o.fulfillment_status || null,
          total_price: parseFloat(o.total_price || '0'),
          subtotal_price: parseFloat(o.subtotal_price || '0'),
          total_discounts: parseFloat(o.total_discounts || '0'),
          total_tax: parseFloat(o.total_tax || '0'),
          currency: o.currency || 'USD',
          customer_id: o.customer?.id || null,
          shipping_country: o.shipping_address?.country_code || null,
          shipping_city: o.shipping_address?.city || null,
          shipping_province: o.shipping_address?.province || null,
          tags: o.tags || null, note: o.note || null,
          source_name: o.source_name || null,
          line_item_count: (o.line_items || []).length,
          synced_at: now(),
        }));

        await bulkUpsertRows(pool, 'shopify_orders', orderRows,
          ['org_id','shopify_order_id','order_number','email','created_at','updated_at','cancelled_at','financial_status','fulfillment_status','total_price','subtotal_price','total_discounts','total_tax','currency','customer_id','shipping_country','shipping_city','shipping_province','tags','note','source_name','line_item_count','synced_at'],
          'org_id, shopify_order_id');

        await pool.query(
          `UPDATE integrations SET last_sync_at = NOW() WHERE id = $1`,
          [integration.id]
        );

        return res.json({
          success: true, action: 'day_sync', date: targetDate,
          orders: allOrders.length, pages,
          revenue: Math.round(orderRows.reduce((s, r) => s + r.total_price, 0) * 100) / 100,
        });
      }

      // ── FULL (inline products + customers + N days of orders) ──
      if (action === 'full') {
        const results = { products: null, customers: null, orders: [] };

        try {
          let allProducts = [];
          let nextPage = null;
          let pages = 0;
          do {
            const ep = nextPage ? `products.json?limit=250&page_info=${nextPage}` : `products.json?limit=250`;
            const { data, link } = await shopifyFetch(shop, token, ep);
            allProducts = allProducts.concat(data.products || []);
            nextPage = getNextPageInfo(link);
            pages++;
          } while (nextPage && pages < 20);

          const pRows = [];
          for (const p of allProducts) {
            for (const v of (p.variants || [])) {
              pRows.push({
                org_id: orgId, shopify_product_id: p.id, shopify_variant_id: v.id,
                title: p.title,
                variant_title: v.title === 'Default Title' ? null : v.title,
                sku: v.sku || `NOSKU-${v.id}`,
                product_type: p.product_type || null, vendor: p.vendor || null,
                price: parseFloat(v.price) || 0,
                inventory_quantity: v.inventory_quantity || 0,
                status: p.status || 'active',
                synced_at: now(),
              });
            }
          }
          await bulkUpsertRows(pool, 'shopify_products', pRows,
            ['org_id','shopify_product_id','shopify_variant_id','title','variant_title','sku','product_type','vendor','price','inventory_quantity','status','synced_at'],
            'org_id, shopify_variant_id');
          results.products = { success: true, products: allProducts.length, variants: pRows.length };
        } catch (e) { results.products = { error: e?.message }; }

        try {
          let allCustomers = [];
          let nextPage = null;
          let pages = 0;
          do {
            const ep = nextPage ? `customers.json?limit=250&page_info=${nextPage}` : `customers.json?limit=250`;
            const { data, link } = await shopifyFetch(shop, token, ep);
            allCustomers = allCustomers.concat(data.customers || []);
            nextPage = getNextPageInfo(link);
            pages++;
          } while (nextPage && pages < 100);

          const cRows = allCustomers.map(c => ({
            org_id: orgId, shopify_customer_id: c.id, email: c.email,
            first_name: c.first_name, last_name: c.last_name,
            orders_count: c.orders_count || 0,
            total_spent: parseFloat(c.total_spent || '0'),
            tags: c.tags || null, country: c.default_address?.country || null,
            synced_at: now(),
          }));
          await bulkUpsertRows(pool, 'shopify_customers', cRows,
            ['org_id','shopify_customer_id','email','first_name','last_name','orders_count','total_spent','tags','country','synced_at'],
            'org_id, shopify_customer_id');
          results.customers = { success: true, count: cRows.length };
        } catch (e) { results.customers = { error: e?.message }; }

        const daysToSync = Math.min(days_back || 3, 14);
        for (let d = 0; d < daysToSync; d++) {
          const syncDate = new Date(Date.now() - d * 86400000).toISOString().slice(0, 10);
          try {
            let allOrders = [];
            let nextPage = null;
            let pages = 0;
            do {
              const ep = nextPage
                ? `orders.json?limit=250&page_info=${nextPage}`
                : `orders.json?limit=250&status=any&created_at_min=${syncDate}T00:00:00-00:00&created_at_max=${syncDate}T23:59:59-00:00`;
              const { data, link } = await shopifyFetch(shop, token, ep);
              allOrders = allOrders.concat(data.orders || []);
              nextPage = getNextPageInfo(link);
              pages++;
            } while (nextPage && pages < 40);

            const oRows = allOrders.map(o => ({
              org_id: orgId, shopify_order_id: o.id, order_number: o.name,
              email: o.email, created_at: o.created_at, updated_at: o.updated_at,
              cancelled_at: o.cancelled_at || null,
              financial_status: o.financial_status,
              fulfillment_status: o.fulfillment_status || null,
              total_price: parseFloat(o.total_price || '0'),
              subtotal_price: parseFloat(o.subtotal_price || '0'),
              total_discounts: parseFloat(o.total_discounts || '0'),
              total_tax: parseFloat(o.total_tax || '0'),
              customer_id: o.customer?.id || null,
              shipping_country: o.shipping_address?.country_code || null,
              line_item_count: (o.line_items || []).length,
              synced_at: now(),
            }));

            await bulkUpsertRows(pool, 'shopify_orders', oRows,
              ['org_id','shopify_order_id','order_number','email','created_at','updated_at','cancelled_at','financial_status','fulfillment_status','total_price','subtotal_price','total_discounts','total_tax','customer_id','shipping_country','line_item_count','synced_at'],
              'org_id, shopify_order_id');

            results.orders.push({
              date: syncDate, orders: allOrders.length,
              revenue: Math.round(oRows.reduce((s, r) => s + r.total_price, 0) * 100) / 100,
            });
          } catch (e) { results.orders.push({ date: syncDate, error: e?.message }); }
        }

        await pool.query(`UPDATE integrations SET last_sync_at = NOW() WHERE id = $1`, [integration.id]);
        return res.json({ success: true, action: 'full', results });
      }

      return res.json({ success: false, error: `Unknown action: ${action}` });
    } catch (err) {
      console.error('[shopify-sync] Fatal:', err?.message);
      res.json({ success: false, error: err?.message || String(err) });
    }
  });
};
