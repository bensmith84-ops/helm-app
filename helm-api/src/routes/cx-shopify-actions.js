
// POST /cx-shopify-actions — port of supabase/functions/cx-shopify-actions
// 3 actions: lookup_order, refund_order, cancel_order. Full audit logging.
const API_VERSION = '2024-01';

async function shopifyFetch(shop, token, endpoint, init = {}) {
  const url = `https://${shop}/admin/api/${API_VERSION}/${endpoint}`;
  const r = await fetch(url, {
    ...init,
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
  });
  const text = await r.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
  return { ok: r.ok, status: r.status, data: parsed };
}

module.exports = function(app, { pool }) {
  app.post('/cx-shopify-actions', async (req, res) => {
    const body = req.body || {};
    const {
      action, ticket_id, agent_user_id, order_number, order_id,
      reason, refund_amount, refund_full = false, send_notification = true, note,
    } = body;
    if (!action || !ticket_id) return res.status(400).json({ error: 'action and ticket_id required' });

    async function audit(args) {
      try {
        const scrubbed = { ...body };
        delete scrubbed.access_token;
        delete scrubbed.authorization;
        const { rows: tRows } = await pool.query(`SELECT org_id FROM cx_tickets WHERE id = $1 LIMIT 1`, [ticket_id]);
        const orgId = tRows[0]?.org_id;
        if (!orgId) return;
        await pool.query(
          `INSERT INTO cx_shopify_actions_log
            (org_id, ticket_id, agent_user_id, shopify_order_id, shopify_order_number,
             action_type, outcome, amount, currency, reason, agent_note,
             request_payload, response_payload, shopify_status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [orgId, ticket_id, agent_user_id || null,
           args.shopify_order_id ?? null, args.shopify_order_number ?? null,
           action, args.outcome, args.amount ?? null, args.currency ?? null,
           reason || null, note || null,
           JSON.stringify(scrubbed), args.response_payload ? JSON.stringify(args.response_payload) : null,
           args.shopify_status ?? null]);
      } catch (_) { /* audit failure must not block */ }
    }

    try {
      const { rows: tRows } = await pool.query(
        `SELECT id, org_id, customer_email, customer_name FROM cx_tickets WHERE id = $1 LIMIT 1`,
        [ticket_id]);
      const ticket = tRows[0];
      if (!ticket) return res.status(404).json({ error: 'Ticket not found' });

      if (action !== 'lookup_order') {
        if (!agent_user_id) {
          await audit({ outcome: 'helm_error', response_payload: { reason: 'missing agent_user_id' } });
          return res.status(400).json({ error: 'agent_user_id required for this action' });
        }
        const { rows: memb } = await pool.query(
          `SELECT user_id FROM org_memberships WHERE user_id = $1 AND org_id = $2 LIMIT 1`,
          [agent_user_id, ticket.org_id]);
        if (!memb[0]) {
          await audit({ outcome: 'forbidden', response_payload: { reason: 'agent not in org' } });
          return res.status(403).json({ error: 'Agent is not a member of this org' });
        }
      }

      const { rows: integ } = await pool.query(
        `SELECT access_token, store_domain FROM integrations
         WHERE provider = 'shopify' AND org_id = $1 AND status = 'active' LIMIT 1`,
        [ticket.org_id]);
      if (!integ[0]?.access_token) {
        await audit({ outcome: 'helm_error', response_payload: { reason: 'shopify not connected' } });
        return res.status(400).json({ error: 'Shopify is not connected for this org' });
      }
      const shop = integ[0].store_domain;
      const token = integ[0].access_token;

      // ── LOOKUP ──
      if (action === 'lookup_order') {
        let order = null;
        if (order_number) {
          const r = await shopifyFetch(shop, token, `orders.json?status=any&name=${encodeURIComponent(order_number)}`);
          if (r.ok && Array.isArray(r.data?.orders) && r.data.orders.length > 0) order = r.data.orders[0];
        }
        if (!order && ticket.customer_email) {
          const r = await shopifyFetch(shop, token, `orders.json?status=any&email=${encodeURIComponent(ticket.customer_email)}&limit=10`);
          if (r.ok && Array.isArray(r.data?.orders) && r.data.orders.length > 0) order = r.data.orders[0];
        }
        if (!order) {
          await audit({ outcome: 'no_match' });
          return res.json({ found: false, message: 'No matching order found in Shopify' });
        }

        const eligible = order.financial_status === 'paid' || order.financial_status === 'partially_refunded';
        const refundedAmt = Number(order.refunded_amount || 0);
        const totalAmt = Number(order.total_price || 0);
        const refundable = Math.max(0, totalAmt - refundedAmt);

        await audit({
          outcome: 'success', shopify_order_id: order.id,
          shopify_order_number: order.name, currency: order.currency,
        });

        return res.json({
          found: true,
          order: {
            id: order.id, name: order.name, email: order.email,
            created_at: order.created_at, fulfillment_status: order.fulfillment_status,
            financial_status: order.financial_status, total_price: totalAmt,
            refundable_amount: refundable, currency: order.currency,
            cancelled_at: order.cancelled_at, line_item_count: (order.line_items || []).length,
            shopify_admin_url: `https://${shop.replace('.myshopify.com', '')}.myshopify.com/admin/orders/${order.id}`,
          },
          eligibility: {
            refundable: eligible && refundable > 0,
            cancellable: !order.cancelled_at && order.fulfillment_status !== 'fulfilled',
          },
        });
      }

      if (!order_id) {
        await audit({ outcome: 'helm_error', response_payload: { reason: 'missing order_id' } });
        return res.status(400).json({ error: 'order_id required for write actions' });
      }

      // ── CANCEL ──
      if (action === 'cancel_order') {
        const r = await shopifyFetch(shop, token, `orders/${order_id}/cancel.json`, {
          method: 'POST',
          body: JSON.stringify({ reason: reason || 'customer', email: send_notification, refund: refund_full }),
        });
        const orderTotal = Number(r.data?.order?.total_price || 0);
        const orderCurrency = r.data?.order?.currency || null;
        const orderName = r.data?.order?.name || null;
        const noteBody = `\u{1F6CD} Order ${orderName || order_id} canceled via Helm. Reason: ${reason || 'customer'}. Refund: ${refund_full ? 'yes' : 'no'}. Email customer: ${send_notification ? 'yes' : 'no'}.${note ? `\nAgent note: ${note}` : ''}\nShopify response: ${r.ok ? 'success' : `error ${r.status}`}`;

        await pool.query(
          `INSERT INTO cx_messages (ticket_id, org_id, direction, sender_type, sender_id, body_text, channel)
           VALUES ($1, $2, 'internal_note', 'agent', $3, $4, 'internal')`,
          [ticket_id, ticket.org_id, agent_user_id, noteBody]);

        const outcome = r.ok ? 'success' : (r.status >= 500 ? 'shopify_5xx' : 'shopify_4xx');
        await audit({
          outcome, amount: refund_full ? orderTotal : null, currency: orderCurrency,
          shopify_status: r.status, shopify_order_id: Number(order_id),
          shopify_order_number: orderName, response_payload: r.ok ? null : (r.data?.errors || r.data),
        });

        if (!r.ok) return res.json({ success: false, action, shopify_status: r.status, error: r.data?.errors || r.data });
        return res.json({ success: true, action, order: r.data?.order, shopify_status: r.status });
      }

      // ── REFUND ──
      if (action === 'refund_order') {
        const calc = await shopifyFetch(shop, token, `orders/${order_id}/refunds/calculate.json`, {
          method: 'POST',
          body: JSON.stringify({ refund: { shipping: { full_refund: refund_full }, refund_line_items: [] } }),
        });
        if (!calc.ok) {
          await audit({
            outcome: calc.status >= 500 ? 'shopify_5xx' : 'shopify_4xx',
            shopify_status: calc.status, shopify_order_id: Number(order_id),
            response_payload: { step: 'calculate', error: calc.data?.errors || calc.data },
          });
          return res.json({ success: false, action, step: 'calculate', shopify_status: calc.status, error: calc.data?.errors || calc.data });
        }

        const calculated = calc.data?.refund || {};
        const transactions = (calculated.transactions || []).map(t => ({
          parent_id: t.parent_id, amount: t.amount, kind: 'refund', gateway: t.gateway,
        }));

        if (refund_amount && Number(refund_amount) > 0 && transactions.length > 0) {
          transactions.length = 0;
          transactions.push({
            parent_id: calculated.transactions?.[0]?.parent_id,
            amount: String(refund_amount), kind: 'refund',
            gateway: calculated.transactions?.[0]?.gateway,
          });
        }

        const r = await shopifyFetch(shop, token, `orders/${order_id}/refunds.json`, {
          method: 'POST',
          body: JSON.stringify({
            refund: {
              notify: send_notification,
              note: note || (reason ? `Refunded via Helm: ${reason}` : 'Refunded via Helm'),
              shipping: calculated.shipping || { amount: '0.00' },
              refund_line_items: calculated.refund_line_items || [],
              transactions,
            },
          }),
        });

        const totalRefunded = transactions.reduce((s, t) => s + Number(t.amount || 0), 0);
        const orderCurrency = r.data?.refund?.transactions?.[0]?.currency || null;
        const noteBody = `\u{1F4B0} Order ${order_id} refunded via Helm. Amount: $${totalRefunded.toFixed(2)}. Reason: ${reason || 'not specified'}. Email customer: ${send_notification ? 'yes' : 'no'}.${note ? `\nAgent note: ${note}` : ''}\nShopify response: ${r.ok ? 'success' : `error ${r.status}`}`;

        await pool.query(
          `INSERT INTO cx_messages (ticket_id, org_id, direction, sender_type, sender_id, body_text, channel)
           VALUES ($1, $2, 'internal_note', 'agent', $3, $4, 'internal')`,
          [ticket_id, ticket.org_id, agent_user_id, noteBody]);

        const outcome = r.ok ? 'success' : (r.status >= 500 ? 'shopify_5xx' : 'shopify_4xx');
        await audit({
          outcome, amount: totalRefunded, currency: orderCurrency,
          shopify_status: r.status, shopify_order_id: Number(order_id),
          response_payload: r.ok ? null : (r.data?.errors || r.data),
        });

        if (!r.ok) return res.json({ success: false, action, step: 'refund', shopify_status: r.status, error: r.data?.errors || r.data });
        return res.json({ success: true, action, refund: r.data?.refund, refunded_amount: totalRefunded });
      }

      await audit({ outcome: 'helm_error', response_payload: { reason: `unknown action: ${action}` } });
      return res.status(400).json({ error: `Unknown action: ${action}` });
    } catch (e) {
      await audit({ outcome: 'helm_error', response_payload: { exception: e?.message || String(e) } });
      return res.status(500).json({ error: e?.message || String(e) });
    }
  });
};
