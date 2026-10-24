// POST /shopify-backfill - port of supabase/functions/shopify-backfill
// Chunked, resumable backfill of shopify_orders + shopify_order_items.
// Driven by a cron tick every minute; each invocation processes pages for ~35s,
// persists the cursor after every page, and calls shopify_backfill_finish() (rollup +
// cron unschedule) when Shopify reports no next page.
// Auth: x-backfill-key header must match shopify_backfill_state.secret (stored in the DB).

const BUDGET_MS = 35000;
const API_VER = '2024-01';

function parseNextPageInfo(linkHeader) {
  if (!linkHeader) return null;
  for (const part of linkHeader.split(',')) {
    if (part.includes('rel="next"')) {
      const m = part.match(/page_info=([^&>]+)/);
      if (m) return m[1];
    }
  }
  return null;
}

// Equivalent of supabase-js .upsert(rows, { onConflict }) : insert, on conflict
// update every supplied column.
async function upsert(pool, table, rows, conflictCol) {
  if (!rows.length) return;
  const cols = Object.keys(rows[0]);
  const params = [];
  const tuples = rows.map((r) => `(${cols.map((c) => { params.push(r[c] === undefined ? null : r[c]); return `$${params.length}`; }).join(',')})`);
  const set = cols.filter((c) => c !== conflictCol).map((c) => `"${c}" = EXCLUDED."${c}"`).join(', ');
  await pool.query(
    `INSERT INTO ${table} (${cols.map((c) => `"${c}"`).join(',')}) VALUES ${tuples.join(',')}
     ON CONFLICT ("${conflictCol}") DO UPDATE SET ${set}`,
    params
  );
}

module.exports = function(app, { pool }) {
  const handler = async (req, res) => {
    const t0 = Date.now();
    let st;
    try {
      const { rows } = await pool.query(
        `SELECT id, status, page_info, orders_done, items_done, secret,
                to_json(since) #>> '{}' AS since
           FROM shopify_backfill_state WHERE id = 1`
      );
      st = rows[0];
    } catch (_e) { st = null; }
    if (!st) return res.status(500).json({ error: 'no state' });
    if (!st.secret || req.headers['x-backfill-key'] !== st.secret) return res.status(403).type('text/plain').send('forbidden');
    if (st.status !== 'running') return res.status(200).json({ status: st.status });

    const setState = (fields) => {
      const keys = Object.keys(fields);
      return pool.query(
        `UPDATE shopify_backfill_state SET ${keys.map((k, i) => `"${k}" = $${i + 1}`).join(', ')} WHERE id = 1`,
        keys.map((k) => fields[k])
      );
    };

    let integ = null;
    try {
      const { rows } = await pool.query(
        `SELECT org_id, access_token, store_domain, metadata FROM integrations
          WHERE provider = 'shopify' AND access_token IS NOT NULL LIMIT 1`
      );
      integ = rows[0] || null;
    } catch (_e) { integ = null; }
    if (!integ?.access_token) {
      await setState({ last_error: 'no shopify integration token' }).catch(() => {});
      return res.status(500).json({ error: 'no token' });
    }
    const shop = integ.store_domain || integ.metadata?.shop_domain || integ.metadata?.shop;
    if (!shop) {
      await setState({ last_error: 'no shop domain on integration' }).catch(() => {});
      return res.status(500).json({ error: 'no shop domain' });
    }

    let pageInfo = st.page_info;
    let ordersDone = Number(st.orders_done || 0);
    let itemsDone = Number(st.items_done || 0);
    let pages = 0;
    let finished = false;

    try {
      while (Date.now() - t0 < BUDGET_MS) {
        const base = `https://${shop}/admin/api/${API_VER}/orders.json`;
        const url = pageInfo
          ? `${base}?limit=250&page_info=${pageInfo}`
          : `${base}?limit=250&status=any&order=${encodeURIComponent('created_at asc')}&created_at_min=${encodeURIComponent(st.since)}`;
        const r = await fetch(url, { headers: { 'X-Shopify-Access-Token': integ.access_token } });
        if (r.status === 429) { await new Promise((ok) => setTimeout(ok, 2200)); continue; }
        if (!r.ok) throw new Error(`shopify ${r.status}: ${(await r.text()).slice(0, 300)}`);
        const next = parseNextPageInfo(r.headers.get('link'));
        const { orders } = await r.json();

        if (orders?.length) {
          const oRows = orders.map((o) => ({
            org_id: integ.org_id,
            shopify_order_id: String(o.id),
            order_number: o.order_number != null ? String(o.order_number) : null,
            email: o.email || null,
            created_at: o.created_at,
            updated_at: o.updated_at,
            cancelled_at: o.cancelled_at,
            financial_status: o.financial_status || null,
            fulfillment_status: o.fulfillment_status || null,
            total_price: o.total_price ?? null,
            subtotal_price: o.subtotal_price ?? null,
            total_discounts: o.total_discounts ?? null,
            total_tax: o.total_tax ?? null,
            currency: o.currency || null,
            customer_id: o.customer?.id != null ? String(o.customer.id) : null,
            shipping_country: o.shipping_address?.country_code || null,
            shipping_city: o.shipping_address?.city || null,
            shipping_province: o.shipping_address?.province_code || null,
            tags: o.tags || null,
            note: o.note || null,
            source_name: o.source_name || null,
            line_item_count: (o.line_items || []).length,
            synced_at: new Date().toISOString(),
          }));
          const iRows = orders.flatMap((o) => (o.line_items || []).map((li) => ({
            org_id: integ.org_id,
            order_id: null,
            shopify_line_item_id: String(li.id),
            shopify_order_id: String(o.id),
            product_id: li.product_id != null ? String(li.product_id) : null,
            variant_id: li.variant_id != null ? String(li.variant_id) : null,
            title: li.title || null,
            variant_title: li.variant_title || null,
            sku: li.sku || null,
            quantity: li.quantity ?? 0,
            price: li.price ?? null,
            total_discount: li.total_discount ?? null,
            vendor: li.vendor || null,
            fulfillment_status: li.fulfillment_status || null,
          })));
          try { await upsert(pool, 'shopify_orders', oRows, 'shopify_order_id'); }
          catch (e) { throw new Error('orders upsert: ' + e.message); }
          for (let i = 0; i < iRows.length; i += 500) {
            try { await upsert(pool, 'shopify_order_items', iRows.slice(i, i + 500), 'shopify_line_item_id'); }
            catch (e) { throw new Error('items upsert: ' + e.message); }
          }
          ordersDone += oRows.length;
          itemsDone += iRows.length;
        }

        pages++;
        pageInfo = next;
        await setState({
          page_info: pageInfo, orders_done: ordersDone, items_done: itemsDone,
          last_tick_at: new Date().toISOString(), last_error: null,
        });
        if (!next) { finished = true; break; }
      }
      if (finished) {
        // supabase-js .rpc() errors were not checked in the original; keep that.
        try { await pool.query('SELECT shopify_backfill_finish()'); }
        catch (e) { console.error('[shopify-backfill] shopify_backfill_finish failed:', e.message); }
      }
      return res.json({ pages, ordersDone, itemsDone, finished });
    } catch (e) {
      await setState({ last_error: String(e?.message || e).slice(0, 900), last_tick_at: new Date().toISOString() }).catch(() => {});
      return res.status(500).json({ error: String(e?.message || e) });
    }
  };
  app.post('/shopify-backfill', handler);
  app.get('/shopify-backfill', handler);
};
